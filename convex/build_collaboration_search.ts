import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedAction, requireAuthenticated } from "./authz";
import { stableContentHash } from "./build_collaboration";
import { canReadCollaborationPost } from "./build_collaboration_access";
import { canReadCollaborationAsset } from "./build_collaboration_asset_access";
import { projectCollaborationAssetAttachments } from "./build_collaboration_asset_projection";
import { projectCollaborationRevisionForViewer } from "./build_collaboration_content";
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
const MAX_RESULTS = 50;
const MAX_QUERY_LENGTH = 240;
const SOURCE_POST_PAGE_SIZE = 10;
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
  postId: v.id("buildCollaborationPosts"),
  referenceId: v.optional(v.id("buildCollaborationReferences")),
  resolutionState: v.union(v.literal("open"), v.literal("resolved")),
  resultType: searchResultTypeValidator,
  searchText: v.string(),
  status: searchStatusValidator,
  title: v.string(),
  updatedAt: v.number(),
});

const authorizedSearchSourcePageValidator = v.object({
  continueCursor: v.string(),
  isDone: v.boolean(),
  page: v.array(searchCandidateValidator),
});

const authenticatedInternalQuery = internalQuery.use(requireAuthenticated);

export const searchAuthorizedBuildCollaborationSourcePage =
  authenticatedInternalQuery
    .input({
      buildId: v.id("activeBuilds"),
      organizationId: v.string(),
      paginationOpts: paginationOptsValidator,
      snapshotAt: v.number(),
    })
    .returns(authorizedSearchSourcePageValidator)
    .handler(async (ctx, args) => {
      const authorization = await authorizeActiveBuildCollaborationAccess(
        ctx,
        args
      );
      const sourcePage = await ctx.db
        .query("buildCollaborationPosts")
        .withIndex("by_buildId_and_createdAt", (query) =>
          query.eq("buildId", authorization.build._id)
        )
        .order("desc")
        .paginate(args.paginationOpts);
      const page: SearchCandidate[] = [];
      for (const post of sourcePage.page) {
        if (
          post.createdAt > args.snapshotAt ||
          post.updatedAt > args.snapshotAt ||
          post.organizationId !== authorization.organizationId ||
          post.brokerageId !== authorization.brokerage._id ||
          post.contentState !== "active" ||
          !(await canReadCollaborationPost(ctx, authorization, post))
        ) {
          continue;
        }
        page.push(
          ...(await loadAuthorizedPostCandidates(ctx, {
            authorization,
            post,
            snapshotAt: args.snapshotAt,
          }))
        );
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
    const candidates: SearchCandidate[] = [];
    let sourceCursor: string | null = null;
    let sourceIsDone = false;
    while (!sourceIsDone) {
      const sourcePage: AuthorizedSearchSourcePage = await ctx.runQuery(
        internal.build_collaboration_search
          .searchAuthorizedBuildCollaborationSourcePage,
        {
          buildId: args.buildId,
          organizationId: args.organizationId,
          paginationOpts: {
            cursor: sourceCursor,
            numItems: SOURCE_POST_PAGE_SIZE,
          },
          snapshotAt: cursor.snapshotAt,
        }
      );
      candidates.push(...sourcePage.page);
      sourceCursor = sourcePage.continueCursor;
      sourceIsDone = sourcePage.isDone;
    }
    const ranked = deduplicateCandidates(candidates)
      .filter((candidate) => candidateMatchesFilters(candidate, filters))
      .map((candidate) => rankCandidate(candidate, query, searchMode))
      .filter(
        (candidate): candidate is RankedSearchCandidate => candidate !== null
      )
      .sort(compareRankedCandidates);
    const limit = Math.min(
      MAX_RESULTS,
      Math.max(1, Math.floor(args.limit ?? 20))
    );
    const after = cursor.after;
    const remaining = after
      ? ranked.filter(
          (candidate) => compareRankedCandidateToAnchor(candidate, after) > 0
        )
      : ranked;
    const page = remaining.slice(0, limit);
    const last = page.at(-1);
    return {
      continueCursor:
        last && page.length < remaining.length
          ? JSON.stringify({
              after: rankedSearchAnchor(last),
              fingerprint,
              snapshotAt: cursor.snapshotAt,
              version: 2,
            })
          : null,
      isDone: page.length >= remaining.length,
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

interface SearchCandidate {
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

interface RankedSearchAnchor {
  id: string;
  postId: Id<"buildCollaborationPosts">;
  resultType: SearchResultType;
  score: number;
  updatedAt: number;
}

interface AuthorizedSearchSourcePage {
  continueCursor: string;
  isDone: boolean;
  page: SearchCandidate[];
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
    return { after: null, snapshotAt: Date.now() };
  }
  try {
    const parsed = JSON.parse(cursor) as {
      after?: unknown;
      fingerprint?: unknown;
      snapshotAt?: unknown;
      version?: unknown;
    };
    const after = parsed.after as Partial<RankedSearchAnchor> | undefined;
    if (
      parsed.version !== 2 ||
      parsed.fingerprint !== fingerprint ||
      typeof parsed.snapshotAt !== "number" ||
      !Number.isFinite(parsed.snapshotAt) ||
      !after ||
      typeof after.id !== "string" ||
      typeof after.postId !== "string" ||
      typeof after.resultType !== "string" ||
      !isSearchResultType(after.resultType) ||
      typeof after.score !== "number" ||
      !Number.isFinite(after.score) ||
      typeof after.updatedAt !== "number" ||
      !Number.isFinite(after.updatedAt)
    ) {
      throw new Error("invalid");
    }
    return {
      after: after as RankedSearchAnchor,
      snapshotAt: parsed.snapshotAt,
    };
  } catch {
    throw new Error("Search cursor does not match this Build search.");
  }
}

function isSearchResultType(value: string): value is SearchResultType {
  return ["post", "comment", "actionItem", "asset", "reference"].includes(
    value
  );
}

async function loadAuthorizedPostCandidates(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    post: Doc<"buildCollaborationPosts">;
    snapshotAt: number;
  }
) {
  const { authorization, post } = input;
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
  const entityKinds = projectedReferences.readable.map(
    (reference) => reference.entityKind
  );
  const base = {
    audienceMode: post.audienceMode,
    postId: post._id,
    resolutionState: post.threadState,
  } as const;
  const candidates: SearchCandidate[] = [
    {
      ...base,
      authorDisplayName: post.authorDisplayNameSnapshot,
      authorWorkosUserId: post.authorWorkosUserId,
      createdAt: post.createdAt,
      entityId: post.primaryReferenceId,
      entityKind: post.primaryReferenceKind,
      entityKinds,
      hasAttachments: searchableAttachments.length > 0,
      href: buildCollaborationDeepLink({
        buildId: post.buildId,
        postId: post._id,
        recipientRole: role,
      }),
      id: post._id,
      resultType: "post",
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
  ];
  candidates.push(
    ...referenceCandidates({
      ...base,
      authorDisplayName: post.authorDisplayNameSnapshot,
      authorWorkosUserId: post.authorWorkosUserId,
      buildId: post.buildId,
      createdAt: post.createdAt,
      hasAttachments: searchableAttachments.length > 0,
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
      role,
      updatedAt: post.updatedAt,
    })
  );

  const actionItems: Doc<"buildActionItems">[] = [];
  for await (const item of ctx.db
    .query("buildActionItems")
    .withIndex("by_originatingPostId_and_status", (query) =>
      query.eq("originatingPostId", post._id)
    )) {
    actionItems.push(item);
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
        role,
        updatedAt: item.updatedAt,
      })
    );
  }

  const comments: Doc<"buildCollaborationComments">[] = [];
  for await (const comment of ctx.db
    .query("buildCollaborationComments")
    .withIndex("by_postId_and_createdAt", (query) =>
      query.eq("postId", post._id)
    )) {
    if (
      comment.createdAt <= input.snapshotAt &&
      comment.updatedAt <= input.snapshotAt
    ) {
      comments.push(comment);
    }
  }
  const projectedComments = await projectThreadComments(
    ctx,
    authorization,
    comments
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
    const rawComment = comments.find(
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
        role,
        updatedAt: row.comment.updatedAt,
      })
    );
  }
  return candidates;
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

function referenceCandidates(input: {
  audienceMode: AudienceMode;
  authorDisplayName?: string;
  authorWorkosUserId?: string;
  buildId: Id<"activeBuilds">;
  createdAt: number;
  hasAttachments: boolean;
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

function rankedSearchAnchor(ranked: RankedSearchCandidate): RankedSearchAnchor {
  return {
    id: ranked.candidate.id,
    postId: ranked.candidate.postId,
    resultType: ranked.candidate.resultType,
    score: ranked.score,
    updatedAt: ranked.candidate.updatedAt,
  };
}

function compareRankedCandidateToAnchor(
  ranked: RankedSearchCandidate,
  anchor: RankedSearchAnchor
) {
  return (
    anchor.score - ranked.score ||
    anchor.updatedAt - ranked.candidate.updatedAt ||
    ranked.candidate.resultType.localeCompare(anchor.resultType) ||
    ranked.candidate.id.localeCompare(anchor.id) ||
    ranked.candidate.postId.localeCompare(anchor.postId)
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
