import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedAction, requireAuthenticated } from "./authz";
import { canReadCollaborationPost } from "./build_collaboration_access";
import { canReadCollaborationAsset } from "./build_collaboration_asset_access";
import { projectCollaborationAssetAttachments } from "./build_collaboration_asset_projection";
import { projectCollaborationRevisionForViewer } from "./build_collaboration_content";
import { stableContentHash } from "./build_collaboration_hash";
import { buildCollaborationDeepLink } from "./build_collaboration_links";
import type { BuildCollaborationRole } from "./build_collaboration_model";
import {
  type CanonicalBuildCollaborationReference,
  resolveCurrentBuildCollaborationReference,
} from "./build_collaboration_references";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import { projectThreadComments } from "./build_collaboration_threads";
import {
  buildCollaborationAudienceModeValidator,
  buildCollaborationReferenceKindValidator,
} from "./build_collaboration_validators";
import { internalQuery } from "./fluent";
import type { Doc, Id, QueryCtx } from "./types";

const MAX_REFERENCES_PER_OWNER = 100;
const MAX_SEARCH_ACTION_ITEMS_PER_POST = 2000;
const MAX_SEARCH_COMMENTS_PER_POST = 1000;
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
    v.union(v.literal("post"), v.literal("comment"), v.literal("actionItem"))
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
    v.union(v.literal("post"), v.literal("comment"), v.literal("actionItem"))
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
});

const authenticatedInternalQuery = internalQuery.use(requireAuthenticated);

export const searchAuthorizedBuildCollaborationIndexPage =
  authenticatedInternalQuery
    .input({
      buildId: v.id("activeBuilds"),
      indexQuery: v.optional(v.string()),
      organizationId: v.string(),
      paginationOpts: paginationOptsValidator,
      partitionKind: v.union(v.literal("tier"), v.literal("user")),
    })
    .returns(authorizedSearchIndexPageValidator)
    .handler(async (ctx, args) => {
      const authorization = await authorizeActiveBuildCollaborationAccess(
        ctx,
        args
      );
      const readerPartitionKey = searchPartitionKey(
        args.partitionKind,
        authorization
      );
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
      isDone: v.boolean(),
      page: v.array(searchResultValidator),
    })
  )
  .handler(async (ctx, args) => {
    const query = (args.query ?? "").trim().slice(0, MAX_QUERY_LENGTH);
    const filters = normalizeFilters(args.filters);
    if (!(query || hasActiveSearchFilter(filters))) {
      return { continueCursor: null, isDone: true, page: [] };
    }
    const searchMode = args.searchMode ?? "hybrid";
    const fingerprint = stableContentHash(
      JSON.stringify({
        buildId: args.buildId,
        filters,
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
    const candidates: SearchCandidate[] = [];
    const seenHashes = new Set(cursor.seenHashes);
    let nextPartition = cursor.nextPartition;
    for (
      let attempt = 0;
      attempt < 2 && candidates.length === 0;
      attempt += 1
    ) {
      const partitionKind = nextPartition;
      if (!cursor.sourceDone[partitionKind]) {
        let sourcePagesRead = 0;
        while (
          !cursor.sourceDone[partitionKind] &&
          candidates.length < limit &&
          sourcePagesRead < MAX_INDEX_PAGES_PER_REQUEST
        ) {
          const sourcePage: AuthorizedSearchIndexPage = await ctx.runQuery(
            internal.build_collaboration_search
              .searchAuthorizedBuildCollaborationIndexPage,
            {
              buildId: args.buildId,
              indexQuery,
              organizationId: args.organizationId,
              paginationOpts: {
                cursor: cursor.sourceCursors[partitionKind],
                numItems: limit,
              },
              partitionKind,
            }
          );
          candidates.push(
            ...sourcePage.page.filter(
              (candidate) =>
                !seenHashes.has(searchCandidateHash(candidate)) &&
                candidateMatchesFilters(candidate, filters)
            )
          );
          cursor.sourceCursors[partitionKind] = sourcePage.continueCursor;
          cursor.sourceDone[partitionKind] = sourcePage.isDone;
          sourcePagesRead += 1;
        }
      }
      nextPartition = otherSearchPartition(partitionKind);
    }
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
    const isDone = cursor.sourceDone.tier && cursor.sourceDone.user;
    return {
      continueCursor: isDone
        ? null
        : JSON.stringify({
            fingerprint,
            nextPartition,
            seenHashes: [...seenHashes],
            sourceCursors: cursor.sourceCursors,
            sourceDone: cursor.sourceDone,
            version: 4,
          }),
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

type SearchResultType =
  | "post"
  | "comment"
  | "actionItem"
  | "asset"
  | "reference";

type SearchStatus =
  | "active"
  | "open"
  | "resolved"
  | "todo"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "done"
  | "cancelled"
  | "available"
  | "superseded";

type ReferenceKind = Doc<"buildCollaborationReferences">["entityKind"];
type AudienceMode = Doc<"buildCollaborationPosts">["audienceMode"];
type SearchFocusEntityKind = "post" | "comment" | "actionItem";

interface NormalizedSearchFilters {
  assigneeWorkosUserIds: string[];
  attachmentPresence: "any" | "with" | "without";
  audienceModes: AudienceMode[];
  authorWorkosUserIds: string[];
  createdFrom?: number;
  createdTo?: number;
  entityKinds: ReferenceKind[];
  resolutionStates: Array<"open" | "resolved">;
  statuses: SearchStatus[];
  types: SearchResultType[];
}

export interface SearchCandidate {
  actionItemId?: Id<"buildActionItems">;
  assigneeWorkosUserId?: string;
  audienceMode: AudienceMode;
  authorDisplayName?: string;
  authorWorkosUserId?: string;
  commentId?: Id<"buildCollaborationComments">;
  createdAt: number;
  entityId?: string;
  entityKind?: ReferenceKind;
  entityKinds: ReferenceKind[];
  focusEntityId?: string;
  focusEntityKind?: SearchFocusEntityKind;
  hasAttachments: boolean;
  href: string;
  id: string;
  ownerId: string;
  ownerKind: "post" | "comment" | "actionItem";
  postId: Id<"buildCollaborationPosts">;
  referenceId?: Id<"buildCollaborationReferences">;
  resolutionState: "open" | "resolved";
  resultType: SearchResultType;
  searchText: string;
  status: SearchStatus;
  title: string;
  updatedAt: number;
}

interface RankedSearchCandidate {
  candidate: SearchCandidate;
  matchKind: "filter" | "keyword" | "semantic";
  score: number;
}

interface AuthorizedSearchIndexPage {
  continueCursor: string;
  isDone: boolean;
  page: SearchCandidate[];
}

function searchPartitionKey(
  kind: SearchPartitionKind,
  authorization: ActiveBuildAuthorization
) {
  return kind === "tier"
    ? `tier:${authorization.effectiveRole.tier}`
    : `user:${authorization.viewer.subject}`;
}

function authorizedSearchPartitionKeys(
  authorization: ActiveBuildAuthorization
) {
  return [
    searchPartitionKey("tier", authorization),
    searchPartitionKey("user", authorization),
  ];
}

function normalizeFilters(
  filters: {
    assigneeWorkosUserIds?: string[];
    attachmentPresence?: "any" | "with" | "without";
    audienceModes?: AudienceMode[];
    authorWorkosUserIds?: string[];
    createdFrom?: number;
    createdTo?: number;
    entityKinds?: ReferenceKind[];
    resolutionStates?: Array<"open" | "resolved">;
    statuses?: SearchStatus[];
    types?: SearchResultType[];
  } = {}
): NormalizedSearchFilters {
  const unique = <T extends string>(values: T[] | undefined) =>
    [...new Set(values ?? [])].sort();
  return {
    assigneeWorkosUserIds: unique(filters.assigneeWorkosUserIds),
    attachmentPresence: filters.attachmentPresence ?? "any",
    audienceModes: unique(filters.audienceModes),
    authorWorkosUserIds: unique(filters.authorWorkosUserIds),
    createdFrom: filters.createdFrom,
    createdTo: filters.createdTo,
    entityKinds: unique(filters.entityKinds),
    resolutionStates: unique(filters.resolutionStates),
    statuses: unique(filters.statuses),
    types: unique(filters.types),
  };
}

function hasActiveSearchFilter(filters: NormalizedSearchFilters) {
  return (
    filters.assigneeWorkosUserIds.length > 0 ||
    filters.attachmentPresence !== "any" ||
    filters.audienceModes.length > 0 ||
    filters.authorWorkosUserIds.length > 0 ||
    filters.createdFrom !== undefined ||
    filters.createdTo !== undefined ||
    filters.entityKinds.length > 0 ||
    filters.resolutionStates.length > 0 ||
    filters.statuses.length > 0 ||
    filters.types.length > 0
  );
}

function parseSearchCursor(cursor: string | undefined, fingerprint: string) {
  if (!cursor) {
    return {
      nextPartition: "user" as const,
      seenHashes: [] as string[],
      sourceCursors: { tier: null, user: null } as Record<
        SearchPartitionKind,
        string | null
      >,
      sourceDone: { tier: false, user: false },
    };
  }
  try {
    const parsed = JSON.parse(cursor) as {
      fingerprint?: unknown;
      nextPartition?: unknown;
      seenHashes?: unknown;
      sourceCursors?: { tier?: unknown; user?: unknown };
      sourceDone?: { tier?: unknown; user?: unknown };
      version?: unknown;
    };
    if (
      parsed.version !== 4 ||
      parsed.fingerprint !== fingerprint ||
      !isSearchPartitionKind(parsed.nextPartition) ||
      !isSearchSeenHashes(parsed.seenHashes) ||
      !isSearchSourceCursor(parsed.sourceCursors?.tier) ||
      !isSearchSourceCursor(parsed.sourceCursors?.user) ||
      typeof parsed.sourceDone?.tier !== "boolean" ||
      typeof parsed.sourceDone.user !== "boolean"
    ) {
      throw new Error("invalid");
    }
    return {
      nextPartition: parsed.nextPartition,
      seenHashes: parsed.seenHashes,
      sourceCursors: {
        tier: parsed.sourceCursors.tier,
        user: parsed.sourceCursors.user,
      },
      sourceDone: {
        tier: parsed.sourceDone.tier,
        user: parsed.sourceDone.user,
      },
    };
  } catch {
    throw new Error("Search cursor does not match this Build search.");
  }
}

type SearchPartitionKind = "tier" | "user";

function isSearchPartitionKind(value: unknown): value is SearchPartitionKind {
  return value === "tier" || value === "user";
}

function isSearchSourceCursor(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isSearchSeenHashes(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_SEARCH_CURSOR_SEEN_RESULTS &&
    value.every(
      (hash) =>
        typeof hash === "string" &&
        hash.length <= 32 &&
        hash.startsWith("djb2-")
    )
  );
}

function searchCandidateHash(candidate: SearchCandidate) {
  return stableContentHash(
    `${candidate.resultType}:${candidate.id}:${candidate.postId}`
  );
}

function otherSearchPartition(
  partition: SearchPartitionKind
): SearchPartitionKind {
  return partition === "tier" ? "user" : "tier";
}

export async function loadAuthorizedPostCandidates(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    owner?: {
      id: string;
      kind: SearchCandidate["ownerKind"];
    };
    post: Doc<"buildCollaborationPosts">;
    snapshotAt: number;
  }
) {
  const { authorization, post } = input;
  const role = authorization.effectiveRole.role;
  const base = {
    audienceMode: post.audienceMode,
    postId: post._id,
    resolutionState: post.threadState,
  } as const;
  const candidates: SearchCandidate[] = [];
  if (!input.owner || input.owner.kind === "post") {
    candidates.push(...(await loadPostSearchCandidates(ctx, input)));
  }

  const actionItems =
    input.owner?.kind === "actionItem"
      ? await loadSearchActionItem(ctx, post, input.owner.id)
      : input.owner
        ? []
        : await ctx.db
            .query("buildActionItems")
            .withIndex("by_originatingPostId_and_status", (query) =>
              query.eq("originatingPostId", post._id)
            )
            .take(MAX_SEARCH_ACTION_ITEMS_PER_POST + 1);
  if (actionItems.length > MAX_SEARCH_ACTION_ITEMS_PER_POST) {
    throw new Error(
      "A collaboration post exceeds the bounded Action Item search limit."
    );
  }
  for (const item of actionItems) {
    if (
      item.organizationId !== authorization.organizationId ||
      item.buildId !== authorization.build._id ||
      item.createdAt > input.snapshotAt ||
      item.updatedAt > input.snapshotAt
    ) {
      continue;
    }
    const itemReferences = await ctx.db
      .query("buildCollaborationReferences")
      .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
        query.eq("ownerKind", "actionItem").eq("ownerRecordId", item._id)
      )
      .take(MAX_REFERENCES_PER_OWNER);
    const projectedItemReferences = await projectSearchReferences(ctx, {
      authorization,
      references: itemReferences.filter(
        (reference) => reference.createdAt <= input.snapshotAt
      ),
    });
    const projectedDescription = projectCollaborationRevisionForViewer({
      references: projectedItemReferences.canonical,
      tiptapJson: item.descriptionTiptapJson,
    });
    const itemAttachments = await projectCollaborationAssetAttachments(ctx, {
      buildId: authorization.build._id,
      organizationId: authorization.organizationId,
      ownerKind: "actionItem",
      ownerRecordId: item._id,
    });
    const searchableItemAttachments = await enrichSearchAssetAttachments(
      ctx,
      authorization,
      itemAttachments,
      input.snapshotAt
    );
    const itemEntityKinds = projectedItemReferences.readable.map(
      (reference) => reference.entityKind
    );
    candidates.push({
      ...base,
      actionItemId: item._id,
      assigneeWorkosUserId: item.assigneeWorkosUserId,
      authorDisplayName: participantDisplayName(
        authorization,
        item.creatorWorkosUserId
      ),
      authorWorkosUserId: item.creatorWorkosUserId,
      createdAt: item.createdAt,
      entityId: item.primaryReferenceId,
      entityKind: item.primaryReferenceKind,
      entityKinds: itemEntityKinds,
      hasAttachments: searchableItemAttachments.length > 0,
      href: buildCollaborationDeepLink({
        buildId: post.buildId,
        focus: `actionItem:${item._id}`,
        recipientRole: role,
      }),
      id: item._id,
      ownerId: item._id,
      ownerKind: "actionItem",
      resultType: "actionItem",
      searchText: `${item.title} ${projectedDescription.plainText}`,
      status: item.status,
      title: item.title,
      updatedAt: item.updatedAt,
    });
    candidates.push(
      ...referenceCandidates({
        ...base,
        authorDisplayName: participantDisplayName(
          authorization,
          item.creatorWorkosUserId
        ),
        authorWorkosUserId: item.creatorWorkosUserId,
        buildId: post.buildId,
        createdAt: item.createdAt,
        hasAttachments: searchableItemAttachments.length > 0,
        ownerId: item._id,
        ownerKind: "actionItem",
        references: projectedItemReferences.readable,
        role,
        updatedAt: item.updatedAt,
      }),
      ...assetCandidates({
        ...base,
        assets: searchableItemAttachments,
        buildId: post.buildId,
        createdAt: item.createdAt,
        focusEntityId: item._id,
        focusEntityKind: "actionItem",
        ownerId: item._id,
        ownerKind: "actionItem",
        role,
        updatedAt: item.updatedAt,
      })
    );
  }

  const comments =
    input.owner?.kind === "comment"
      ? await loadSearchComment(ctx, post, input.owner.id)
      : input.owner
        ? []
        : await ctx.db
            .query("buildCollaborationComments")
            .withIndex("by_postId_and_createdAt", (query) =>
              query.eq("postId", post._id)
            )
            .take(MAX_SEARCH_COMMENTS_PER_POST + 1);
  if (comments.length > MAX_SEARCH_COMMENTS_PER_POST) {
    throw new Error(
      "A collaboration post exceeds the bounded reply search limit."
    );
  }
  const currentComments = comments.filter(
    (comment) =>
      comment.createdAt <= input.snapshotAt &&
      comment.updatedAt <= input.snapshotAt
  );
  const projectedComments = await projectThreadComments(
    ctx,
    authorization,
    currentComments
  );
  for (const row of projectedComments) {
    if (row.comment.contentState !== "active" || !row.revision) {
      continue;
    }
    const rowEntityKinds = row.references
      .filter(
        (reference) => reference.labelSnapshot !== "Unavailable reference"
      )
      .map((reference) => reference.entityKind);
    const rawComment = currentComments.find(
      (comment) => comment._id === row.comment._id
    );
    const searchableCommentAttachments = await enrichSearchAssetAttachments(
      ctx,
      authorization,
      row.attachments,
      input.snapshotAt
    );
    candidates.push({
      ...base,
      authorDisplayName: row.comment.authorDisplayNameSnapshot,
      authorWorkosUserId: rawComment?.authorWorkosUserId,
      createdAt: row.comment.createdAt,
      commentId: row.comment._id,
      entityKinds: rowEntityKinds,
      hasAttachments: searchableCommentAttachments.length > 0,
      href: buildCollaborationDeepLink({
        buildId: post.buildId,
        focus: `comment:${row.comment._id}`,
        recipientRole: role,
      }),
      id: row.comment._id,
      ownerId: row.comment._id,
      ownerKind: "comment",
      resultType: "comment",
      searchText: row.revision.plainText,
      status: "active",
      title: `Reply by ${row.comment.authorDisplayNameSnapshot}`,
      updatedAt: row.comment.updatedAt,
    });
    candidates.push(
      ...referenceCandidates({
        ...base,
        authorDisplayName: row.comment.authorDisplayNameSnapshot,
        authorWorkosUserId: rawComment?.authorWorkosUserId,
        buildId: post.buildId,
        createdAt: row.comment.createdAt,
        hasAttachments: searchableCommentAttachments.length > 0,
        ownerId: row.comment._id,
        ownerKind: "comment",
        references: row.references.filter(
          (reference) => reference.labelSnapshot !== "Unavailable reference"
        ),
        role,
        updatedAt: row.comment.updatedAt,
      }),
      ...assetCandidates({
        ...base,
        assets: searchableCommentAttachments,
        buildId: post.buildId,
        createdAt: row.comment.createdAt,
        focusEntityId: row.comment._id,
        focusEntityKind: "comment",
        ownerId: row.comment._id,
        ownerKind: "comment",
        role,
        updatedAt: row.comment.updatedAt,
      })
    );
  }
  return candidates;
}

async function loadPostSearchCandidates(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    owner?: { id: string; kind: SearchCandidate["ownerKind"] };
    post: Doc<"buildCollaborationPosts">;
    snapshotAt: number;
  }
) {
  const { authorization, post } = input;
  if (input.owner && input.owner.id !== post._id) {
    return [];
  }
  const revision = post.currentRevisionId
    ? await ctx.db.get(post.currentRevisionId)
    : null;
  if (
    !(
      revision &&
      revision.postId === post._id &&
      revision.createdAt <= input.snapshotAt
    )
  ) {
    return [];
  }
  const references = await ctx.db
    .query("buildCollaborationReferences")
    .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
      query.eq("ownerKind", "postRevision").eq("ownerRecordId", revision._id)
    )
    .take(MAX_REFERENCES_PER_OWNER);
  const projectedReferences = await projectSearchReferences(ctx, {
    authorization,
    references: references.filter(
      (reference) => reference.createdAt <= input.snapshotAt
    ),
  });
  const projectedPost = projectCollaborationRevisionForViewer({
    references: projectedReferences.canonical,
    tiptapJson: revision.tiptapJson,
  });
  const attachments = await projectCollaborationAssetAttachments(ctx, {
    buildId: authorization.build._id,
    organizationId: authorization.organizationId,
    ownerKind: "postRevision",
    ownerRecordId: revision._id,
  });
  const searchableAttachments = await enrichSearchAssetAttachments(
    ctx,
    authorization,
    attachments,
    input.snapshotAt
  );
  const role = authorization.effectiveRole.role;
  const base = {
    audienceMode: post.audienceMode,
    postId: post._id,
    resolutionState: post.threadState,
  } as const;
  return [
    {
      ...base,
      authorDisplayName: post.authorDisplayNameSnapshot,
      authorWorkosUserId: post.authorWorkosUserId,
      createdAt: post.createdAt,
      entityId: post.primaryReferenceId,
      entityKind: post.primaryReferenceKind,
      entityKinds: projectedReferences.readable.map(
        (reference) => reference.entityKind
      ),
      hasAttachments: searchableAttachments.length > 0,
      href: buildCollaborationDeepLink({
        buildId: post.buildId,
        postId: post._id,
        recipientRole: role,
      }),
      id: post._id,
      ownerId: post._id,
      ownerKind: "post" as const,
      resultType: "post" as const,
      searchText: [
        projectedPost.plainText,
        post.authorDisplayNameSnapshot,
        post.decisionOutcome,
        post.resolutionSummary,
      ]
        .filter(Boolean)
        .join(" "),
      status: post.threadState,
      title: searchTitle(projectedPost.plainText, `${post.postType} post`),
      updatedAt: post.updatedAt,
    },
    ...referenceCandidates({
      ...base,
      authorDisplayName: post.authorDisplayNameSnapshot,
      authorWorkosUserId: post.authorWorkosUserId,
      buildId: post.buildId,
      createdAt: post.createdAt,
      hasAttachments: searchableAttachments.length > 0,
      ownerId: post._id,
      ownerKind: "post",
      references: projectedReferences.readable,
      role,
      updatedAt: post.updatedAt,
    }),
    ...assetCandidates({
      ...base,
      assets: searchableAttachments,
      buildId: post.buildId,
      createdAt: post.createdAt,
      focusEntityId: post._id,
      focusEntityKind: "post",
      ownerId: post._id,
      ownerKind: "post",
      role,
      updatedAt: post.updatedAt,
    }),
  ];
}

async function loadSearchActionItem(
  ctx: QueryCtx,
  post: Doc<"buildCollaborationPosts">,
  ownerId: string
) {
  const actionItemId = ctx.db.normalizeId("buildActionItems", ownerId);
  const actionItem = actionItemId ? await ctx.db.get(actionItemId) : null;
  return actionItem?.originatingPostId === post._id ? [actionItem] : [];
}

async function loadSearchComment(
  ctx: QueryCtx,
  post: Doc<"buildCollaborationPosts">,
  ownerId: string
) {
  const commentId = ctx.db.normalizeId("buildCollaborationComments", ownerId);
  const comment = commentId ? await ctx.db.get(commentId) : null;
  return comment?.postId === post._id ? [comment] : [];
}

async function projectSearchReferences(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    references: Doc<"buildCollaborationReferences">[];
  }
) {
  const canonical: CanonicalBuildCollaborationReference[] = [];
  const readable: Array<{
    _id: Id<"buildCollaborationReferences">;
    createdAt: number;
    entityId: string;
    entityKind: ReferenceKind;
    labelSnapshot: string;
    summarySnapshot?: string;
  }> = [];
  for (const reference of input.references) {
    if (
      reference.organizationId !== input.authorization.organizationId ||
      reference.brokerageId !== input.authorization.brokerage._id ||
      reference.buildId !== input.authorization.build._id
    ) {
      continue;
    }
    try {
      const current = await resolveCurrentBuildCollaborationReference(ctx, {
        authorization: input.authorization,
        entityId: reference.entityId,
        entityKind: reference.entityKind,
      });
      canonical.push(current);
      readable.push({
        _id: reference._id,
        createdAt: reference.createdAt,
        entityId: current.entityId,
        entityKind: current.entityKind,
        labelSnapshot: current.label,
        summarySnapshot: current.summary,
      });
    } catch {
      // Search never indexes or counts an entity the current viewer cannot read.
    }
  }
  return { canonical, readable };
}

async function validateIndexedSearchCandidate(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    record: Doc<"buildCollaborationSearchRecords">;
  }
): Promise<SearchCandidate | null> {
  const { authorization, record } = input;
  if (
    record.organizationId !== authorization.organizationId ||
    record.brokerageId !== authorization.brokerage._id ||
    record.buildId !== authorization.build._id ||
    !authorizedSearchPartitionKeys(authorization).includes(
      record.readerPartitionKey
    ) ||
    record.contentState !== "active"
  ) {
    return null;
  }
  const candidate = parseIndexedSearchCandidate(record);
  if (!candidate) {
    return null;
  }
  const post = await ctx.db.get(record.postId);
  if (
    !post ||
    post.contentState !== "active" ||
    !(await canReadCollaborationPost(ctx, authorization, post))
  ) {
    return null;
  }
  const currentCandidate = await refreshIndexedSearchCandidate(ctx, {
    authorization,
    candidate,
    post,
  });
  const hasAttachments = currentCandidate
    ? await currentCandidateHasReadableAttachments(ctx, {
        authorization,
        candidate: currentCandidate,
        post,
      })
    : false;
  return currentCandidate
    ? {
        ...currentCandidate,
        hasAttachments,
        href: currentSearchCandidateHref(
          currentCandidate,
          post,
          authorization.effectiveRole.role
        ),
      }
    : null;
}

async function currentCandidateHasReadableAttachments(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    candidate: SearchCandidate;
    post: Doc<"buildCollaborationPosts">;
  }
) {
  if (input.candidate.resultType === "asset") {
    return true;
  }
  const owner = await currentSearchAttachmentOwner(ctx, input);
  if (!owner) {
    return false;
  }
  const attachments = await projectCollaborationAssetAttachments(ctx, {
    buildId: input.authorization.build._id,
    organizationId: input.authorization.organizationId,
    ...owner,
  });
  return (
    (
      await enrichSearchAssetAttachments(
        ctx,
        input.authorization,
        attachments,
        Date.now()
      )
    ).length > 0
  );
}

async function currentSearchAttachmentOwner(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    candidate: SearchCandidate;
    post: Doc<"buildCollaborationPosts">;
  }
): Promise<
  | {
      ownerKind: "actionItem" | "commentRevision" | "postRevision";
      ownerRecordId: string;
    }
  | undefined
> {
  if (input.candidate.resultType === "post") {
    return input.post.currentRevisionId
      ? {
          ownerKind: "postRevision",
          ownerRecordId: input.post.currentRevisionId,
        }
      : undefined;
  }
  if (input.candidate.resultType === "comment" && input.candidate.commentId) {
    const comment = await ctx.db.get(input.candidate.commentId);
    return comment?.currentRevisionId
      ? {
          ownerKind: "commentRevision",
          ownerRecordId: comment.currentRevisionId,
        }
      : undefined;
  }
  if (
    input.candidate.resultType === "actionItem" &&
    input.candidate.actionItemId
  ) {
    return {
      ownerKind: "actionItem",
      ownerRecordId: input.candidate.actionItemId,
    };
  }
  if (
    input.candidate.resultType !== "reference" ||
    !input.candidate.referenceId
  ) {
    return;
  }
  const reference = await ctx.db.get(input.candidate.referenceId);
  if (
    !reference ||
    reference.postId !== input.post._id ||
    reference.organizationId !== input.authorization.organizationId ||
    !["postRevision", "commentRevision", "actionItem"].includes(
      reference.ownerKind
    )
  ) {
    return;
  }
  return {
    ownerKind: reference.ownerKind as
      | "actionItem"
      | "commentRevision"
      | "postRevision",
    ownerRecordId: reference.ownerRecordId,
  };
}

function parseIndexedSearchCandidate(
  record: Doc<"buildCollaborationSearchRecords">
): SearchCandidate | null {
  try {
    const candidate = JSON.parse(record.candidateJson) as SearchCandidate;
    return typeof candidate === "object" &&
      candidate !== null &&
      candidate.postId === record.postId &&
      typeof candidate.id === "string" &&
      candidate.ownerId === record.ownerId &&
      candidate.ownerKind === record.ownerKind &&
      typeof candidate.searchText === "string" &&
      Array.isArray(candidate.entityKinds)
      ? candidate
      : null;
  } catch {
    return null;
  }
}

async function refreshIndexedSearchCandidate(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    candidate: SearchCandidate;
    post: Doc<"buildCollaborationPosts">;
  }
): Promise<SearchCandidate | null> {
  let { candidate } = input;
  switch (candidate.resultType) {
    case "post":
      if (candidate.id !== input.post._id) {
        return null;
      }
      candidate = {
        ...candidate,
        resolutionState: input.post.threadState,
        status: input.post.threadState,
        updatedAt: input.post.updatedAt,
      };
      break;
    case "comment": {
      if (!candidate.commentId) {
        return null;
      }
      const comment = await ctx.db.get(candidate.commentId);
      if (
        !comment ||
        comment.postId !== input.post._id ||
        comment.contentState !== "active"
      ) {
        return null;
      }
      candidate = { ...candidate, updatedAt: comment.updatedAt };
      break;
    }
    case "actionItem": {
      if (!candidate.actionItemId) {
        return null;
      }
      const item = await ctx.db.get(candidate.actionItemId);
      if (
        !item ||
        item.originatingPostId !== input.post._id ||
        item.buildId !== input.authorization.build._id
      ) {
        return null;
      }
      candidate = {
        ...candidate,
        assigneeWorkosUserId: item.assigneeWorkosUserId,
        status: item.status,
        title: item.title,
        updatedAt: item.updatedAt,
      };
      break;
    }
    case "asset": {
      const asset = await ctx.db.get(
        candidate.entityId as Id<"buildCollaborationAssets">
      );
      if (
        !asset ||
        (asset.state !== "available" && asset.state !== "superseded") ||
        !(await canReadCollaborationAsset(ctx, {
          asset,
          authorization: input.authorization,
        }))
      ) {
        return null;
      }
      candidate = {
        ...candidate,
        status: asset.state,
        title: asset.fileName,
        updatedAt: asset.updatedAt,
      };
      break;
    }
    case "reference": {
      const refreshed = await refreshIndexedReferenceCandidate(
        ctx,
        input.authorization,
        candidate
      );
      if (!refreshed) {
        return null;
      }
      candidate = { ...refreshed, status: input.post.threadState };
      break;
    }
  }
  return { ...candidate, resolutionState: input.post.threadState };
}

async function refreshIndexedReferenceCandidate(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  candidate: SearchCandidate
) {
  if (!(candidate.entityId && candidate.entityKind)) {
    return null;
  }
  try {
    await resolveCurrentBuildCollaborationReference(ctx, {
      authorization,
      entityId: candidate.entityId,
      entityKind: candidate.entityKind,
    });
    return candidate;
  } catch {
    return null;
  }
}

function currentSearchCandidateHref(
  candidate: SearchCandidate,
  post: Doc<"buildCollaborationPosts">,
  role: BuildCollaborationRole
) {
  if (candidate.resultType === "post") {
    return buildCollaborationDeepLink({
      buildId: post.buildId,
      postId: post._id,
      recipientRole: role,
    });
  }
  if (
    candidate.resultType === "reference" &&
    candidate.entityKind &&
    candidate.entityId
  ) {
    return buildCollaborationDeepLink({
      buildId: post.buildId,
      focus: `${candidate.entityKind}:${candidate.entityId}`,
      recipientRole: role,
    });
  }
  return buildCollaborationDeepLink({
    buildId: post.buildId,
    focus: `${candidate.focusEntityKind ?? candidate.resultType}:${candidate.focusEntityId ?? candidate.id}`,
    recipientRole: role,
  });
}

function referenceCandidates(input: {
  audienceMode: AudienceMode;
  authorDisplayName?: string;
  authorWorkosUserId?: string;
  buildId: Id<"activeBuilds">;
  createdAt: number;
  hasAttachments: boolean;
  ownerId: string;
  ownerKind: SearchCandidate["ownerKind"];
  postId: Id<"buildCollaborationPosts">;
  references: Array<{
    _id: Id<"buildCollaborationReferences">;
    createdAt?: number;
    entityId: string;
    entityKind: ReferenceKind;
    labelSnapshot: string;
    summarySnapshot?: string;
  }>;
  resolutionState: "open" | "resolved";
  role: BuildCollaborationRole;
  updatedAt: number;
}) {
  return input.references.map(
    (reference): SearchCandidate => ({
      audienceMode: input.audienceMode,
      authorDisplayName: input.authorDisplayName,
      authorWorkosUserId: input.authorWorkosUserId,
      createdAt: reference.createdAt ?? input.createdAt,
      entityId: reference.entityId,
      entityKind: reference.entityKind,
      entityKinds: [reference.entityKind],
      hasAttachments: input.hasAttachments,
      href: buildCollaborationDeepLink({
        buildId: input.buildId,
        focus: `${reference.entityKind}:${reference.entityId}`,
        recipientRole: input.role,
      }),
      id: reference._id,
      ownerId: input.ownerId,
      ownerKind: input.ownerKind,
      postId: input.postId,
      referenceId: reference._id,
      resolutionState: input.resolutionState,
      resultType: "reference",
      searchText: `${reference.labelSnapshot} ${reference.summarySnapshot ?? ""}`,
      status: input.resolutionState,
      title: reference.labelSnapshot,
      updatedAt: reference.createdAt ?? input.updatedAt,
    })
  );
}

function assetCandidates(input: {
  assets: Array<{
    assetId: Id<"buildCollaborationAssets">;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    state: "available" | "superseded";
    uploadedByWorkosUserId: string;
    version: number;
  }>;
  audienceMode: AudienceMode;
  buildId: Id<"activeBuilds">;
  createdAt: number;
  focusEntityId: string;
  focusEntityKind: SearchFocusEntityKind;
  ownerId: string;
  ownerKind: SearchCandidate["ownerKind"];
  postId: Id<"buildCollaborationPosts">;
  resolutionState: "open" | "resolved";
  role: BuildCollaborationRole;
  updatedAt: number;
}) {
  return input.assets.map(
    (asset): SearchCandidate => ({
      audienceMode: input.audienceMode,
      authorWorkosUserId: asset.uploadedByWorkosUserId,
      createdAt: input.createdAt,
      entityId: asset.assetId,
      entityKinds: [],
      focusEntityId: input.focusEntityId,
      focusEntityKind: input.focusEntityKind,
      hasAttachments: true,
      href: buildCollaborationDeepLink({
        buildId: input.buildId,
        ...(input.focusEntityKind === "post"
          ? { postId: input.focusEntityId as Id<"buildCollaborationPosts"> }
          : {
              focus: `${input.focusEntityKind}:${input.focusEntityId}`,
            }),
        recipientRole: input.role,
      }),
      id: asset.assetId,
      ownerId: input.ownerId,
      ownerKind: input.ownerKind,
      postId: input.postId,
      resolutionState: input.resolutionState,
      resultType: "asset",
      searchText: `${asset.fileName} ${asset.mimeType} version ${asset.version}`,
      status: asset.state,
      title: asset.fileName,
      updatedAt: input.updatedAt,
    })
  );
}

async function enrichSearchAssetAttachments(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  attachments: Array<{
    assetId: Id<"buildCollaborationAssets">;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    state: "available" | "superseded";
    version: number;
  }>,
  snapshotAt: number
) {
  const enriched: Array<
    (typeof attachments)[number] & { uploadedByWorkosUserId: string }
  > = [];
  for (const attachment of attachments) {
    const asset = await ctx.db.get(attachment.assetId);
    if (
      !asset ||
      asset.createdAt > snapshotAt ||
      asset.updatedAt > snapshotAt ||
      !(await canReadCollaborationAsset(ctx, {
        asset,
        authorization,
      }))
    ) {
      continue;
    }
    enriched.push({
      ...attachment,
      uploadedByWorkosUserId: asset.uploadedByWorkosUserId,
    });
  }
  return enriched;
}

function participantDisplayName(
  authorization: ActiveBuildAuthorization,
  workosUserId: string
) {
  return authorization.participants.find(
    (participant) => participant.workosUserId === workosUserId
  )?.displayName;
}

function candidateMatchesFilters(
  candidate: SearchCandidate,
  filters: NormalizedSearchFilters
) {
  return (
    (!filters.types.length || filters.types.includes(candidate.resultType)) &&
    (!filters.authorWorkosUserIds.length ||
      (candidate.authorWorkosUserId !== undefined &&
        filters.authorWorkosUserIds.includes(candidate.authorWorkosUserId))) &&
    (!filters.assigneeWorkosUserIds.length ||
      (candidate.assigneeWorkosUserId !== undefined &&
        filters.assigneeWorkosUserIds.includes(
          candidate.assigneeWorkosUserId
        ))) &&
    (!filters.entityKinds.length ||
      candidate.entityKinds.some((kind) =>
        filters.entityKinds.includes(kind)
      )) &&
    (!filters.statuses.length || filters.statuses.includes(candidate.status)) &&
    (!filters.audienceModes.length ||
      filters.audienceModes.includes(candidate.audienceMode)) &&
    (filters.createdFrom === undefined ||
      candidate.createdAt >= filters.createdFrom) &&
    (filters.createdTo === undefined ||
      candidate.createdAt <= filters.createdTo) &&
    (!filters.resolutionStates.length ||
      filters.resolutionStates.includes(candidate.resolutionState)) &&
    (filters.attachmentPresence === "any" ||
      (filters.attachmentPresence === "with") === candidate.hasAttachments)
  );
}

function rankCandidate(
  candidate: SearchCandidate,
  query: string,
  mode: "hybrid" | "keyword" | "semantic"
): RankedSearchCandidate | null {
  if (!query) {
    return { candidate, matchKind: "filter", score: 0 };
  }
  const keywordScore =
    mode === "semantic" ? 0 : lexicalScore(query, candidate.searchText);
  const semanticScore =
    mode === "keyword" ? 0 : conceptScore(query, candidate.searchText);
  const score = keywordScore + semanticScore;
  if (score <= 0) {
    return null;
  }
  return {
    candidate,
    matchKind: keywordScore > 0 ? "keyword" : "semantic",
    score,
  };
}

function compareRankedCandidates(
  left: RankedSearchCandidate,
  right: RankedSearchCandidate
) {
  return (
    right.score - left.score ||
    right.candidate.updatedAt - left.candidate.updatedAt ||
    left.candidate.resultType.localeCompare(right.candidate.resultType) ||
    left.candidate.id.localeCompare(right.candidate.id) ||
    left.candidate.postId.localeCompare(right.candidate.postId)
  );
}

function deduplicateCandidates(candidates: SearchCandidate[]) {
  const byKey = new Map<string, SearchCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.resultType}:${candidate.id}:${candidate.postId}`;
    const existing = byKey.get(key);
    if (!existing || existing.updatedAt < candidate.updatedAt) {
      byKey.set(key, candidate);
    }
  }
  return [...byKey.values()];
}

function lexicalScore(query: string, content: string) {
  const normalizedQuery = normalizeText(query);
  const normalizedContent = normalizeText(content);
  if (!normalizedQuery) {
    return 0;
  }
  let score = normalizedContent.includes(normalizedQuery) ? 100 : 0;
  const contentTokens = new Set(searchTokens(normalizedContent));
  for (const token of searchTokens(normalizedQuery)) {
    if (contentTokens.has(token)) {
      score += 20;
    } else if (
      token.length >= 4 &&
      [...contentTokens].some(
        (candidate) =>
          candidate.startsWith(token) || token.startsWith(candidate)
      )
    ) {
      score += 6;
    }
  }
  return score;
}

const DOMAIN_CONCEPTS = [
  ["foundation", "footing", "footings"],
  ["inspection", "inspect", "site", "visit"],
  ["photo", "image", "evidence", "proof"],
  ["payment", "funding", "draw", "disbursement", "release"],
  ["permit", "approval", "approved", "authorize"],
  ["task", "action", "todo", "item"],
  ["document", "file", "attachment", "report", "pdf"],
  ["contractor", "trade", "subtrade", "vendor"],
  ["milestone", "stage", "phase"],
  ["issue", "blocker", "problem", "blocked"],
  ["complete", "completed", "done", "finished"],
  ["material", "supply", "supplies", "product"],
] as const;

function conceptScore(query: string, content: string) {
  const queryConcepts = semanticConcepts(searchTokens(query));
  const contentConcepts = semanticConcepts(searchTokens(content));
  let score = 0;
  for (const concept of queryConcepts) {
    if (contentConcepts.has(concept)) {
      score += 12;
    }
  }
  return score;
}

function semanticConcepts(tokens: string[]) {
  const concepts = new Set<string>();
  for (const token of tokens) {
    const concept = DOMAIN_CONCEPTS.find((group) =>
      group.some((term) => stemSearchToken(term) === token)
    );
    concepts.add(concept?.[0] ?? token);
  }
  return concepts;
}

export function buildSearchIndexText(value: string) {
  const normalized = normalizeText(value);
  const tokens = searchTokens(normalized);
  const concepts = [...semanticConcepts(tokens)].map(
    (concept) => `concept_${concept}`
  );
  return [...new Set([normalized, ...tokens, ...concepts])].join(" ");
}

function buildSearchIndexQuery(
  value: string,
  mode: "hybrid" | "keyword" | "semantic"
) {
  const tokens = searchTokens(value);
  if (mode === "keyword") {
    return [...new Set(tokens)].join(" ");
  }
  return [...semanticConcepts(tokens)]
    .map((concept) => `concept_${concept}`)
    .join(" ");
}

function searchTokens(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 2)
    .map(stemSearchToken);
}

function stemSearchToken(token: string) {
  return token.replace(SEARCH_TOKEN_SUFFIX_PATTERN, "").slice(0, 48);
}

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function searchTitle(content: string, fallback: string) {
  const firstLine = content.split(FIRST_LINE_PATTERN)[0]?.trim();
  return (firstLine || fallback).slice(0, 120);
}

function searchExcerpt(content: string, query: string) {
  const compact = content.replace(/\s+/gu, " ").trim();
  if (compact.length <= 220) {
    return compact;
  }
  const normalizedQuery = normalizeText(query);
  const normalizedContent = normalizeText(compact);
  const index = normalizedQuery
    ? normalizedContent.indexOf(normalizedQuery)
    : 0;
  const start = Math.max(0, index > 0 ? index - 70 : 0);
  const prefix = start > 0 ? "…" : "";
  const suffix = start + 220 < compact.length ? "…" : "";
  return `${prefix}${compact.slice(start, start + 220)}${suffix}`;
}
