import { v } from "convex/values";

import { authenticatedQuery } from "./authz";
import { canReadCollaborationPost } from "./build_collaboration_access";
import { projectCollaborationAssetAttachments } from "./build_collaboration_asset_projection";
import { projectCollaborationRevisionForViewer } from "./build_collaboration_content";
import { stableContentHash } from "./build_collaboration";
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
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import type { Doc, Id, QueryCtx } from "./types";

const MAX_POSTS_PER_SEARCH = 200;
const MAX_COMMENTS_PER_POST = 250;
const MAX_ACTION_ITEMS_PER_POST = 100;
const MAX_REFERENCES_PER_OWNER = 100;
const MAX_RESULTS = 50;
const MAX_QUERY_LENGTH = 240;

const searchResultTypeValidator = v.union(
  v.literal("post"),
  v.literal("comment"),
  v.literal("actionItem"),
  v.literal("asset"),
  v.literal("reference"),
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
  v.literal("superseded"),
);

const searchFiltersValidator = v.object({
  assigneeWorkosUserIds: v.optional(v.array(v.string())),
  attachmentPresence: v.optional(
    v.union(v.literal("any"), v.literal("with"), v.literal("without")),
  ),
  audienceModes: v.optional(v.array(buildCollaborationAudienceModeValidator)),
  authorWorkosUserIds: v.optional(v.array(v.string())),
  createdFrom: v.optional(v.number()),
  createdTo: v.optional(v.number()),
  entityKinds: v.optional(v.array(buildCollaborationReferenceKindValidator)),
  resolutionStates: v.optional(
    v.array(v.union(v.literal("open"), v.literal("resolved"))),
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
  hasAttachments: v.boolean(),
  href: v.string(),
  id: v.string(),
  matchKind: v.union(
    v.literal("filter"),
    v.literal("keyword"),
    v.literal("semantic"),
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

export const searchBuildCollaboration = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    cursor: v.optional(v.string()),
    filters: v.optional(searchFiltersValidator),
    limit: v.optional(v.number()),
    organizationId: v.string(),
    query: v.optional(v.string()),
    searchMode: v.optional(
      v.union(v.literal("hybrid"), v.literal("keyword"), v.literal("semantic")),
    ),
  })
  .returns(
    v.object({
      continueCursor: v.union(v.string(), v.null()),
      isDone: v.boolean(),
      page: v.array(searchResultValidator),
    }),
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args,
    );
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
        role: authorization.effectiveRole.role,
        searchMode,
        viewer: authorization.viewer.subject,
      }),
    );
    const cursor = parseSearchCursor(args.cursor, fingerprint);
    const candidates = await loadAuthorizedSearchCandidates(ctx, {
      authorization,
      snapshotAt: cursor.snapshotAt,
    });
    const ranked = deduplicateCandidates(candidates)
      .filter((candidate) => candidateMatchesFilters(candidate, filters))
      .map((candidate) => rankCandidate(candidate, query, searchMode))
      .filter(
        (candidate): candidate is RankedSearchCandidate => candidate !== null,
      )
      .sort(compareRankedCandidates);
    const limit = Math.min(
      MAX_RESULTS,
      Math.max(1, Math.floor(args.limit ?? 20)),
    );
    const page = ranked.slice(cursor.offset, cursor.offset + limit);
    const nextOffset = cursor.offset + page.length;
    return {
      continueCursor:
        nextOffset < ranked.length
          ? JSON.stringify({
              fingerprint,
              offset: nextOffset,
              snapshotAt: cursor.snapshotAt,
              version: 1,
            })
          : null,
      isDone: nextOffset >= ranked.length,
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
  } = {},
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
    return { offset: 0, snapshotAt: Date.now() };
  }
  try {
    const parsed = JSON.parse(cursor) as {
      fingerprint?: unknown;
      offset?: unknown;
      snapshotAt?: unknown;
      version?: unknown;
    };
    if (
      parsed.version !== 1 ||
      parsed.fingerprint !== fingerprint ||
      typeof parsed.offset !== "number" ||
      !Number.isSafeInteger(parsed.offset) ||
      parsed.offset < 0 ||
      typeof parsed.snapshotAt !== "number" ||
      !Number.isFinite(parsed.snapshotAt)
    ) {
      throw new Error("invalid");
    }
    return { offset: parsed.offset, snapshotAt: parsed.snapshotAt };
  } catch {
    throw new Error("Search cursor does not match this Build search.");
  }
}

async function loadAuthorizedSearchCandidates(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    snapshotAt: number;
  },
) {
  const posts = await ctx.db
    .query("buildCollaborationPosts")
    .withIndex("by_buildId_and_createdAt", (query) =>
      query.eq("buildId", input.authorization.build._id),
    )
    .order("desc")
    .take(MAX_POSTS_PER_SEARCH);
  const candidates: SearchCandidate[] = [];
  for (const post of posts) {
    if (
      post.createdAt > input.snapshotAt ||
      post.organizationId !== input.authorization.organizationId ||
      post.brokerageId !== input.authorization.brokerage._id ||
      post.contentState !== "active" ||
      !(await canReadCollaborationPost(ctx, input.authorization, post))
    ) {
      continue;
    }
    candidates.push(
      ...(await loadAuthorizedPostCandidates(ctx, {
        authorization: input.authorization,
        post,
        snapshotAt: input.snapshotAt,
      })),
    );
  }
  return candidates;
}

async function loadAuthorizedPostCandidates(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    post: Doc<"buildCollaborationPosts">;
    snapshotAt: number;
  },
) {
  const { authorization, post } = input;
  const revision = post.currentRevisionId
    ? await ctx.db.get(post.currentRevisionId)
    : null;
  if (!(revision && revision.postId === post._id)) {
    return [];
  }
  const references = await ctx.db
    .query("buildCollaborationReferences")
    .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
      query.eq("ownerKind", "postRevision").eq("ownerRecordId", revision._id),
    )
    .take(MAX_REFERENCES_PER_OWNER);
  const projectedReferences = await projectSearchReferences(ctx, {
    authorization,
    references,
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
    attachments,
  );
  const role = authorization.effectiveRole.role;
  const entityKinds = projectedReferences.readable.map(
    (reference) => reference.entityKind,
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
      hasAttachments: attachments.length > 0,
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
      hasAttachments: attachments.length > 0,
      references: projectedReferences.readable,
      role,
      updatedAt: post.updatedAt,
    }),
    ...assetCandidates({
      ...base,
      assets: searchableAttachments,
      buildId: post.buildId,
      createdAt: post.createdAt,
      role,
      updatedAt: post.updatedAt,
    }),
  );

  const actionItems = await ctx.db
    .query("buildActionItems")
    .withIndex("by_originatingPostId_and_status", (query) =>
      query.eq("originatingPostId", post._id),
    )
    .take(MAX_ACTION_ITEMS_PER_POST);
  for (const item of actionItems) {
    if (
      item.organizationId !== authorization.organizationId ||
      item.buildId !== authorization.build._id ||
      item.createdAt > input.snapshotAt
    ) {
      continue;
    }
    const itemReferences = await ctx.db
      .query("buildCollaborationReferences")
      .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
        query.eq("ownerKind", "actionItem").eq("ownerRecordId", item._id),
      )
      .take(MAX_REFERENCES_PER_OWNER);
    const projectedItemReferences = await projectSearchReferences(ctx, {
      authorization,
      references: itemReferences,
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
      itemAttachments,
    );
    const itemEntityKinds = projectedItemReferences.readable.map(
      (reference) => reference.entityKind,
    );
    candidates.push({
      ...base,
      actionItemId: item._id,
      assigneeWorkosUserId: item.assigneeWorkosUserId,
      authorDisplayName: participantDisplayName(
        authorization,
        item.creatorWorkosUserId,
      ),
      authorWorkosUserId: item.creatorWorkosUserId,
      createdAt: item.createdAt,
      entityId: item.primaryReferenceId,
      entityKind: item.primaryReferenceKind,
      entityKinds: itemEntityKinds,
      hasAttachments: itemAttachments.length > 0,
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
          item.creatorWorkosUserId,
        ),
        authorWorkosUserId: item.creatorWorkosUserId,
        buildId: post.buildId,
        createdAt: item.createdAt,
        hasAttachments: itemAttachments.length > 0,
        references: projectedItemReferences.readable,
        role,
        updatedAt: item.updatedAt,
      }),
      ...assetCandidates({
        ...base,
        assets: searchableItemAttachments,
        buildId: post.buildId,
        createdAt: item.createdAt,
        role,
        updatedAt: item.updatedAt,
      }),
    );
  }

  const comments = await ctx.db
    .query("buildCollaborationComments")
    .withIndex("by_postId_and_createdAt", (query) =>
      query.eq("postId", post._id),
    )
    .take(MAX_COMMENTS_PER_POST);
  const projectedComments = await projectThreadComments(
    ctx,
    authorization,
    comments.filter((comment) => comment.createdAt <= input.snapshotAt),
  );
  for (const row of projectedComments) {
    if (row.comment.contentState !== "active" || !row.revision) {
      continue;
    }
    const rowEntityKinds = row.references
      .filter(
        (reference) => reference.labelSnapshot !== "Unavailable reference",
      )
      .map((reference) => reference.entityKind);
    const rawComment = comments.find(
      (comment) => comment._id === row.comment._id,
    );
    const searchableCommentAttachments = await enrichSearchAssetAttachments(
      ctx,
      row.attachments,
    );
    candidates.push({
      ...base,
      authorDisplayName: row.comment.authorDisplayNameSnapshot,
      authorWorkosUserId: rawComment?.authorWorkosUserId,
      createdAt: row.comment.createdAt,
      commentId: row.comment._id,
      entityKinds: rowEntityKinds,
      hasAttachments: row.attachments.length > 0,
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
        hasAttachments: row.attachments.length > 0,
        references: row.references.filter(
          (reference) => reference.labelSnapshot !== "Unavailable reference",
        ),
        role,
        updatedAt: row.comment.updatedAt,
      }),
      ...assetCandidates({
        ...base,
        assets: searchableCommentAttachments,
        buildId: post.buildId,
        createdAt: row.comment.createdAt,
        role,
        updatedAt: row.comment.updatedAt,
      }),
    );
  }
  return candidates;
}

async function projectSearchReferences(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    references: Doc<"buildCollaborationReferences">[];
  },
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
    }),
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
      entityKind: "evidenceAsset",
      entityKinds: ["evidenceAsset"],
      hasAttachments: true,
      href: buildCollaborationDeepLink({
        buildId: input.buildId,
        focus: `evidenceAsset:${asset.assetId}`,
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
    }),
  );
}

async function enrichSearchAssetAttachments(
  ctx: QueryCtx,
  attachments: Array<{
    assetId: Id<"buildCollaborationAssets">;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    state: "available" | "superseded";
    version: number;
  }>,
) {
  const enriched = [];
  for (const attachment of attachments) {
    const asset = await ctx.db.get(attachment.assetId);
    if (!asset) {
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
  workosUserId: string,
) {
  return authorization.participants.find(
    (participant) => participant.workosUserId === workosUserId,
  )?.displayName;
}

function candidateMatchesFilters(
  candidate: SearchCandidate,
  filters: NormalizedSearchFilters,
) {
  return (
    (!filters.types.length || filters.types.includes(candidate.resultType)) &&
    (!filters.authorWorkosUserIds.length ||
      (candidate.authorWorkosUserId !== undefined &&
        filters.authorWorkosUserIds.includes(candidate.authorWorkosUserId))) &&
    (!filters.assigneeWorkosUserIds.length ||
      (candidate.assigneeWorkosUserId !== undefined &&
        filters.assigneeWorkosUserIds.includes(
          candidate.assigneeWorkosUserId,
        ))) &&
    (!filters.entityKinds.length ||
      candidate.entityKinds.some((kind) =>
        filters.entityKinds.includes(kind),
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
  mode: "hybrid" | "keyword" | "semantic",
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
  right: RankedSearchCandidate,
) {
  return (
    right.score - left.score ||
    right.candidate.updatedAt - left.candidate.updatedAt ||
    left.candidate.resultType.localeCompare(right.candidate.resultType) ||
    left.candidate.id.localeCompare(right.candidate.id)
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
          candidate.startsWith(token) || token.startsWith(candidate),
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
      group.some((term) => stemSearchToken(term) === token),
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
  return token
    .replace(/(ments|ment|ings|ing|ers|ies|ied|ed|es|s)$/u, "")
    .slice(0, 48);
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
  const firstLine = content.split(/\r?\n/u)[0]?.trim();
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
