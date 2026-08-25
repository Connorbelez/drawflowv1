import { paginationOptsValidator } from "convex/server";
import { type Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import {
  type AuthorizedViewer,
  authenticatedAction,
  authenticatedQuery,
  requireAuthenticated,
} from "./authz";
import { canReadCollaborationPost } from "./build_collaboration_access";
import { canReadCollaborationAsset } from "./build_collaboration_asset_access";
import {
  projectCollaborationAssetAttachmentPage,
  projectCollaborationAssetAttachments,
} from "./build_collaboration_asset_projection";
import { projectCollaborationRevisionForViewer } from "./build_collaboration_content";
import { stableContentHash } from "./build_collaboration_hash";
import { buildCollaborationDeepLink } from "./build_collaboration_links";
import type { BuildCollaborationRole } from "./build_collaboration_model";
import {
  type CanonicalBuildCollaborationReference,
  resolveCurrentBuildCollaborationReference,
} from "./build_collaboration_references";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import { buildCollaborationSearchReaderFingerprint } from "./build_collaboration_search_readers";
import { canReadMilestoneSystemActionItem } from "./build_collaboration_system_event_access";
import { deriveMilestoneSystemActionItemPresentation } from "./build_collaboration_system_posts";
import {
  buildCollaborationAudienceModeValidator,
  buildCollaborationReferenceKindValidator,
} from "./build_collaboration_validators";
import { canReadDrawCoordination } from "./build_draw_coordination";
import { internalQuery } from "./fluent";
import type { ActionCtx, Doc, Id, QueryCtx } from "./types";


import {
  collectAuthorizedSearchCandidates,
  loadSearchReadiness,
  loadSearchReadinessForAuthorization,
  userSearchPartitionKey,
  authorizedSearchPartitionKeys,
  validateIndexedSearchCandidate,
} from "./build_collaboration_search/candidates";
import type {
  RankedSearchCandidate,
  SearchCandidate,
} from "./build_collaboration_search/contracts";
import {
  buildSearchIndexQuery,
  compareRankedCandidates,
  deduplicateCandidates,
  rankCandidate,
  normalizeText,
  searchExcerpt,
} from "./build_collaboration_search/ranking";
import {
  hasActiveSearchFilter,
  normalizeFilters,
  parseSearchCursor,
  searchCandidateHash,
} from "./build_collaboration_search/contracts";

const MAX_RESULTS = 50;
const MAX_QUERY_LENGTH = 240;
const MAX_INDEX_PAGES_PER_REQUEST = 5;
const MAX_SEARCH_CURSOR_SEEN_RESULTS = 10_000;
const SEARCH_TOKEN_SUFFIX_PATTERN =
  /(ments|ment|ings|ing|ers|ies|ied|ed|es|s)$/u;
const FIRST_LINE_PATTERN = /\r?\n/u;

const searchResultTypeValidator = v.union(
  v.literal("post"),
  v.literal("comment"),
  v.literal("actionItem"),
  v.literal("submilestone"),
  v.literal("asset"),
  v.literal("reference")
);

const searchStatusValidator = v.union(
  v.literal("active"),
  v.literal("open"),
  v.literal("resolved"),
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("in_review"),
  v.literal("blocked"),
  v.literal("done"),
  v.literal("cancelled"),
  v.literal("available"),
  v.literal("superseded")
);

const searchFiltersValidator = v.object({
  assigneeWorkosUserIds: v.optional(v.array(v.string())),
  attachmentPresence: v.optional(
    v.union(v.literal("any"), v.literal("with"), v.literal("without"))
  ),
  audienceModes: v.optional(v.array(buildCollaborationAudienceModeValidator)),
  authorWorkosUserIds: v.optional(v.array(v.string())),
  createdFrom: v.optional(v.number()),
  createdTo: v.optional(v.number()),
  entityKinds: v.optional(v.array(buildCollaborationReferenceKindValidator)),
  resolutionStates: v.optional(
    v.array(v.union(v.literal("open"), v.literal("resolved")))
  ),
  statuses: v.optional(v.array(searchStatusValidator)),
  types: v.optional(v.array(searchResultTypeValidator)),
});

const searchResultValidator = v.object({
  actionItemId: v.optional(v.id("buildActionItems")),
  assigneeWorkosUserId: v.optional(v.string()),
  audienceMode: buildCollaborationAudienceModeValidator,
  authorDisplayName: v.optional(v.string()),
  authorWorkosUserId: v.optional(v.string()),
  commentId: v.optional(v.id("buildCollaborationComments")),
  createdAt: v.number(),
  entityId: v.optional(v.string()),
  entityKind: v.optional(buildCollaborationReferenceKindValidator),
  excerpt: v.string(),
  focusEntityId: v.optional(v.string()),
  focusEntityKind: v.optional(
    v.union(
      v.literal("post"),
      v.literal("comment"),
      v.literal("actionItem"),
      v.literal("submilestone"),
      v.literal("asset")
    )
  ),
  hasAttachments: v.boolean(),
  href: v.string(),
  id: v.string(),
  matchKind: v.union(
    v.literal("filter"),
    v.literal("keyword"),
    v.literal("semantic")
  ),
  postId: v.id("buildCollaborationPosts"),
  referenceId: v.optional(v.id("buildCollaborationReferences")),
  resolutionState: v.union(v.literal("open"), v.literal("resolved")),
  resultType: searchResultTypeValidator,
  score: v.number(),
  status: searchStatusValidator,
  title: v.string(),
  updatedAt: v.number(),
});

const searchCandidateValidator = v.object({
  actionItemId: v.optional(v.id("buildActionItems")),
  assigneeWorkosUserId: v.optional(v.string()),
  audienceMode: buildCollaborationAudienceModeValidator,
  authorDisplayName: v.optional(v.string()),
  authorWorkosUserId: v.optional(v.string()),
  commentId: v.optional(v.id("buildCollaborationComments")),
  createdAt: v.number(),
  entityId: v.optional(v.string()),
  entityKind: v.optional(buildCollaborationReferenceKindValidator),
  entityKinds: v.array(buildCollaborationReferenceKindValidator),
  focusEntityId: v.optional(v.string()),
  focusEntityKind: v.optional(
    v.union(
      v.literal("post"),
      v.literal("comment"),
      v.literal("actionItem"),
      v.literal("submilestone"),
      v.literal("asset")
    )
  ),
  hasAttachments: v.boolean(),
  href: v.string(),
  id: v.string(),
  ownerId: v.string(),
  ownerKind: v.union(
    v.literal("post"),
    v.literal("comment"),
    v.literal("actionItem")
  ),
  postId: v.id("buildCollaborationPosts"),
  referenceId: v.optional(v.id("buildCollaborationReferences")),
  resolutionState: v.union(v.literal("open"), v.literal("resolved")),
  resultType: searchResultTypeValidator,
  searchText: v.string(),
  status: searchStatusValidator,
  title: v.string(),
  updatedAt: v.number(),
});

const authorizedSearchIndexPageValidator = v.object({
  continueCursor: v.string(),
  isDone: v.boolean(),
  page: v.array(searchCandidateValidator),
  stale: v.boolean(),
});

const searchReadinessValidator = v.object({
  generation: v.number(),
  ready: v.boolean(),
});

const authenticatedInternalQuery = internalQuery.use(requireAuthenticated);

interface SearchActionResponse {
  continueCursor: string | null;
  generation: number;
  indexing: boolean;
  isDone: boolean;
  page: Infer<typeof searchResultValidator>[];
}

export const getBuildCollaborationSearchReadiness = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(searchReadinessValidator)
  .handler(async (ctx, args) => await loadSearchReadiness(ctx, args))
  .public();

export const getAuthorizedBuildCollaborationSearchReadiness =
  authenticatedInternalQuery
    .input({
      buildId: v.id("activeBuilds"),
      organizationId: v.string(),
    })
    .returns(searchReadinessValidator)
    .handler(async (ctx, args) => await loadSearchReadiness(ctx, args))
    .internal();

export const searchAuthorizedBuildCollaborationIndexPage =
  authenticatedInternalQuery
    .input({
      buildId: v.id("activeBuilds"),
      generation: v.number(),
      indexQuery: v.optional(v.string()),
      organizationId: v.string(),
      paginationOpts: paginationOptsValidator,
    })
    .returns(authorizedSearchIndexPageValidator)
    .handler(async (ctx, args) => {
      const authorization = await authorizeActiveBuildCollaborationAccess(
        ctx,
        args
      );
      const readiness = await loadSearchReadinessForAuthorization(
        ctx,
        authorization
      );
      if (!(readiness.ready && readiness.generation === args.generation)) {
        return {
          continueCursor: "",
          isDone: true,
          page: [],
          stale: true,
        };
      }
      const readerPartitionKey = userSearchPartitionKey(authorization);
      const sourcePage = args.indexQuery
        ? await ctx.db
            .query("buildCollaborationSearchRecords")
            .withSearchIndex("search_searchText", (query) =>
              query
                .search("searchText", args.indexQuery ?? "")
                .eq("buildId", authorization.build._id)
                .eq("organizationId", authorization.organizationId)
                .eq("readerPartitionKey", readerPartitionKey)
                .eq("contentState", "active")
            )
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("buildCollaborationSearchRecords")
            .withIndex("by_build_reader_state_updatedAt", (query) =>
              query
                .eq("buildId", authorization.build._id)
                .eq("readerPartitionKey", readerPartitionKey)
                .eq("contentState", "active")
            )
            .order("desc")
            .paginate(args.paginationOpts);
      const page: SearchCandidate[] = [];
      for (const record of sourcePage.page) {
        const candidate = await validateIndexedSearchCandidate(ctx, {
          authorization,
          record,
        });
        if (candidate) {
          page.push(candidate);
        }
      }
      return {
        continueCursor: sourcePage.continueCursor,
        isDone: sourcePage.isDone,
        page,
        stale: false,
      };
    })
    .internal();

export const searchBuildCollaboration = authenticatedAction
  .input({
    buildId: v.id("activeBuilds"),
    cursor: v.optional(v.string()),
    filters: v.optional(searchFiltersValidator),
    limit: v.optional(v.number()),
    organizationId: v.string(),
    query: v.optional(v.string()),
    searchMode: v.optional(
      v.union(v.literal("hybrid"), v.literal("keyword"), v.literal("semantic"))
    ),
  })
  .returns(
    v.object({
      continueCursor: v.union(v.string(), v.null()),
      generation: v.number(),
      indexing: v.boolean(),
      isDone: v.boolean(),
      page: v.array(searchResultValidator),
    })
  )
  .handler(async (ctx, args): Promise<SearchActionResponse> => {
    const readiness: Infer<typeof searchReadinessValidator> =
      await ctx.runQuery(
        internal.build_collaboration_search
          .getAuthorizedBuildCollaborationSearchReadiness,
        { buildId: args.buildId, organizationId: args.organizationId }
      );
    if (!readiness.ready) {
      await ctx.runMutation(
        internal.build_collaboration_search_maintenance
          .ensureBuildCollaborationSearchMaintenance,
        { buildId: args.buildId, organizationId: args.organizationId }
      );
      return {
        continueCursor: null,
        generation: readiness.generation,
        indexing: true,
        isDone: true,
        page: [],
      };
    }
    const query = (args.query ?? "").trim().slice(0, MAX_QUERY_LENGTH);
    const filters = normalizeFilters(args.filters);
    if (!(query || hasActiveSearchFilter(filters))) {
      return {
        continueCursor: null,
        generation: readiness.generation,
        indexing: false,
        isDone: true,
        page: [],
      };
    }
    const searchMode = args.searchMode ?? "hybrid";
    const fingerprint = stableContentHash(
      JSON.stringify({
        buildId: args.buildId,
        filters,
        generation: readiness.generation,
        organizationId: args.organizationId,
        query: normalizeText(query),
        roles: [...ctx.viewer.roles].sort(),
        searchMode,
        viewer: ctx.viewer.subject,
      })
    );
    const cursor = parseSearchCursor(args.cursor, fingerprint);
    const limit = Math.min(
      MAX_RESULTS,
      Math.max(1, Math.floor(args.limit ?? 20))
    );
    const indexQuery = query
      ? buildSearchIndexQuery(query, searchMode)
      : undefined;
    const seenHashes = new Set(cursor.seenHashes);
    const collected = await collectAuthorizedSearchCandidates(ctx, {
      buildId: args.buildId,
      cursor,
      filters,
      generation: readiness.generation,
      indexQuery,
      limit,
      organizationId: args.organizationId,
      seenHashes,
    });
    if (collected.stale) {
      await ctx.runMutation(
        internal.build_collaboration_search_maintenance
          .ensureBuildCollaborationSearchMaintenance,
        { buildId: args.buildId, organizationId: args.organizationId }
      );
      return {
        continueCursor: null,
        generation: readiness.generation,
        indexing: true,
        isDone: true,
        page: [],
      };
    }
    const { candidates } = collected;
    const ranked = deduplicateCandidates(candidates)
      .map((candidate) => rankCandidate(candidate, query, searchMode))
      .filter(
        (candidate): candidate is RankedSearchCandidate => candidate !== null
      )
      .sort(compareRankedCandidates);
    const page = ranked.slice(0, limit);
    for (const result of page) {
      seenHashes.add(searchCandidateHash(result.candidate));
    }
    if (seenHashes.size > MAX_SEARCH_CURSOR_SEEN_RESULTS) {
      throw new Error(
        "This Build search exceeded its stable pagination limit. Narrow the filters and try again."
      );
    }
    const isDone = cursor.sourceDone;
    return {
      continueCursor: isDone
        ? null
        : JSON.stringify({
            fingerprint,
            seenHashes: [...seenHashes],
            sourceCursor: cursor.sourceCursor,
            sourceDone: cursor.sourceDone,
            version: 7,
          }),
      generation: readiness.generation,
      indexing: false,
      isDone,
      page: page.map(({ candidate, matchKind, score }) => ({
        actionItemId: candidate.actionItemId,
        assigneeWorkosUserId: candidate.assigneeWorkosUserId,
        audienceMode: candidate.audienceMode,
        authorDisplayName: candidate.authorDisplayName,
        authorWorkosUserId: candidate.authorWorkosUserId,
        commentId: candidate.commentId,
        createdAt: candidate.createdAt,
        entityId: candidate.entityId,
        entityKind: candidate.entityKind,
        excerpt: searchExcerpt(candidate.searchText, query),
        focusEntityId: candidate.focusEntityId,
        focusEntityKind: candidate.focusEntityKind,
        hasAttachments: candidate.hasAttachments,
        href: candidate.href,
        id: candidate.id,
        matchKind,
        postId: candidate.postId,
        referenceId: candidate.referenceId,
        resolutionState: candidate.resolutionState,
        resultType: candidate.resultType,
        score,
        status: candidate.status,
        title: candidate.title,
        updatedAt: candidate.updatedAt,
      })),
    };
  })
  .public();

export { buildSearchIndexText } from "./build_collaboration_search/ranking";
export { loadAuthorizedOwnerCandidatePage } from "./build_collaboration_search/candidates";
export type {
  RankedSearchCandidate,
  SearchCandidate,
  SearchCandidateDiscoveryPhase,
} from "./build_collaboration_search/contracts";
