import { internal } from "../_generated/api";
import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import type { AuthorizedViewer } from "../authz";
import { canReadCollaborationPost } from "../build_collaboration_access";
import { projectCollaborationAssetAttachmentPage, projectCollaborationAssetAttachments } from "../build_collaboration_asset_projection";
import { projectCollaborationRevisionForViewer } from "../build_collaboration_content";
import { buildCollaborationDeepLink } from "../build_collaboration_links";
import type { BuildCollaborationRole } from "../build_collaboration_model";
import { resolveCurrentBuildCollaborationReference } from "../build_collaboration_references";
import type { CanonicalBuildCollaborationReference } from "../build_collaboration_references";
import { authorizeActiveBuildCollaborationAccess } from "../build_collaboration_rollout";
import { buildCollaborationSearchReaderFingerprint } from "../build_collaboration_search_readers";
import { canReadMilestoneSystemActionItem } from "../build_collaboration_system_event_access";
import { deriveMilestoneSystemActionItemPresentation } from "../build_collaboration_system_posts";
import { canReadDrawCoordination } from "../build_draw_coordination";
import type { ActionCtx, Doc, Id, QueryCtx } from "../types";
import {
  type AuthorizedSearchIndexPage,
  type AudienceMode,
  type NormalizedSearchFilters,
  type ReferenceKind,
  type SearchCandidate,
  type SearchCandidateDiscoveryPhase,
  MAX_INDEX_PAGES_PER_REQUEST,
  parseSearchCursor,
  searchCandidateHash,
} from "./contracts";
import {
  assetCandidates,
  enrichSearchAssetAttachments,
  parseIndexedSearchCandidate,
  referenceCandidates,
  refreshIndexedSearchCandidate,
  currentSearchCandidateHref,
} from "./assets";
import {
  candidateMatchesFilters,
  canonicalSearchStatus,
  participantDisplayName,
  searchTitle,
} from "./ranking";


export async function collectAuthorizedSearchCandidates(
  ctx: ActionCtx,
  input: {
    buildId: Id<"activeBuilds">;
    cursor: ReturnType<typeof parseSearchCursor>;
    filters: NormalizedSearchFilters;
    generation: number;
    indexQuery?: string;
    limit: number;
    organizationId: string;
    seenHashes: Set<string>;
  }
) {
  const candidates: SearchCandidate[] = [];
  let sourcePagesRead = 0;
  while (
    !input.cursor.sourceDone &&
    candidates.length < input.limit &&
    sourcePagesRead < MAX_INDEX_PAGES_PER_REQUEST
  ) {
    const sourcePage: AuthorizedSearchIndexPage = await ctx.runQuery(
      internal.build_collaboration_search
        .searchAuthorizedBuildCollaborationIndexPage,
      {
        buildId: input.buildId,
        generation: input.generation,
        indexQuery: input.indexQuery,
        organizationId: input.organizationId,
        paginationOpts: {
          cursor: input.cursor.sourceCursor,
          numItems: input.limit,
        },
      }
    );
    if (sourcePage.stale) {
      return { candidates: [], stale: true };
    }
    candidates.push(
      ...sourcePage.page.filter(
        (candidate) =>
          !input.seenHashes.has(searchCandidateHash(candidate)) &&
          candidateMatchesFilters(candidate, input.filters)
      )
    );
    input.cursor.sourceCursor = sourcePage.continueCursor;
    input.cursor.sourceDone = sourcePage.isDone;
    sourcePagesRead += 1;
  }
  return { candidates, stale: false };
}

export async function loadSearchReadiness(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  input: { buildId: Id<"activeBuilds">; organizationId: string }
) {
  const authorization = await authorizeActiveBuildCollaborationAccess(
    ctx,
    input
  );
  return await loadSearchReadinessForAuthorization(ctx, authorization);
}

export async function loadSearchReadinessForAuthorization(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization
) {
  const state = await ctx.db
    .query("buildCollaborationSearchStates")
    .withIndex("by_buildId", (query) =>
      query.eq("buildId", authorization.build._id)
    )
    .unique();
  if (!state) {
    return { generation: 0, ready: false };
  }
  const readerFingerprint = await buildCollaborationSearchReaderFingerprint(
    ctx,
    authorization
  );
  return {
    generation: state.generation,
    ready:
      state.status === "ready" && state.readerFingerprint === readerFingerprint,
  };
}

export function userSearchPartitionKey(authorization: ActiveBuildAuthorization) {
  return `user:${authorization.viewer.subject}`;
}

export function authorizedSearchPartitionKeys(
  authorization: ActiveBuildAuthorization
) {
  return [userSearchPartitionKey(authorization)];
}

export async function loadAuthorizedOwnerCandidatePage(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    cursor: string | null;
    owner: {
      id: string;
      kind: SearchCandidate["ownerKind"];
    };
    phase: SearchCandidateDiscoveryPhase;
    post: Doc<"buildCollaborationPosts">;
    snapshotAt: number;
  }
) {
  const descriptor = await loadSearchOwnerDescriptor(ctx, input);
  if (!descriptor) {
    return {
      candidates: [] as SearchCandidate[],
      continueCursor: null,
      done: true,
      nextPhase: input.phase,
    };
  }
  if (input.phase === "base") {
    const attachments = await projectCollaborationAssetAttachments(ctx, {
      buildId: input.authorization.build._id,
      organizationId: input.authorization.organizationId,
      ownerKind: descriptor.assetOwnerKind,
      ownerRecordId: descriptor.ownerRecordId,
    });
    const searchableAttachments = await enrichSearchAssetAttachments(
      ctx,
      input.authorization,
      attachments,
      input.snapshotAt
    );
    return {
      candidates: [
        {
          ...descriptor.baseCandidate,
          hasAttachments: searchableAttachments.length > 0,
        },
      ],
      continueCursor: null,
      done: false,
      nextPhase: "references" as const,
    };
  }
  if (input.phase === "references") {
    const page = await ctx.db
      .query("buildCollaborationReferences")
      .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
        query
          .eq("ownerKind", descriptor.referenceOwnerKind)
          .eq("ownerRecordId", descriptor.ownerRecordId)
      )
      .paginate({ cursor: input.cursor, numItems: 5 });
    const projected = await projectSearchReferences(ctx, {
      authorization: input.authorization,
      references: page.page.filter(
        (reference) => reference.createdAt <= input.snapshotAt
      ),
    });
    return {
      candidates: referenceCandidates({
        audienceMode: descriptor.baseCandidate.audienceMode,
        authorDisplayName: descriptor.baseCandidate.authorDisplayName,
        authorWorkosUserId: descriptor.baseCandidate.authorWorkosUserId,
        buildId: input.post.buildId,
        createdAt: descriptor.baseCandidate.createdAt,
        hasAttachments: false,
        ownerId: descriptor.baseCandidate.ownerId,
        ownerKind: descriptor.baseCandidate.ownerKind,
        postId: input.post._id,
        references: projected.readable,
        resolutionState: descriptor.baseCandidate.resolutionState,
        role: input.authorization.effectiveRole.role,
        updatedAt: descriptor.baseCandidate.updatedAt,
      }),
      continueCursor: page.isDone ? null : page.continueCursor,
      done: false,
      nextPhase: page.isDone ? ("assets" as const) : ("references" as const),
    };
  }
  const page = await projectCollaborationAssetAttachmentPage(ctx, {
    buildId: input.authorization.build._id,
    cursor: input.cursor,
    organizationId: input.authorization.organizationId,
    ownerKind: descriptor.assetOwnerKind,
    ownerRecordId: descriptor.ownerRecordId,
  });
  const searchableAttachments = await enrichSearchAssetAttachments(
    ctx,
    input.authorization,
    page.attachments,
    input.snapshotAt
  );
  return {
    candidates: assetCandidates({
      assets: searchableAttachments,
      audienceMode: descriptor.baseCandidate.audienceMode,
      buildId: input.post.buildId,
      createdAt: descriptor.baseCandidate.createdAt,
      ownerId: descriptor.baseCandidate.ownerId,
      ownerKind: descriptor.baseCandidate.ownerKind,
      postId: input.post._id,
      resolutionState: descriptor.baseCandidate.resolutionState,
      role: input.authorization.effectiveRole.role,
      updatedAt: descriptor.baseCandidate.updatedAt,
    }),
    continueCursor: page.isDone ? null : page.continueCursor,
    done: page.isDone,
    nextPhase: "assets" as const,
  };
}

async function loadSearchOwnerDescriptor(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    owner: { id: string; kind: SearchCandidate["ownerKind"] };
    post: Doc<"buildCollaborationPosts">;
    snapshotAt: number;
  }
) {
  const { authorization, owner, post, snapshotAt } = input;
  const role = authorization.effectiveRole.role;
  const shared = {
    audienceMode: post.audienceMode,
    entityKinds: [] as ReferenceKind[],
    hasAttachments: false,
    postId: post._id,
    resolutionState: post.threadState,
  } as const;
  if (owner.kind === "post") {
    if (owner.id !== post._id || !post.currentRevisionId) {
      return null;
    }
    const revision = await ctx.db.get(post.currentRevisionId);
    if (!(revision && revision.createdAt <= snapshotAt)) {
      return null;
    }
    const projected = projectCollaborationRevisionForViewer({
      references: [],
      tiptapJson: revision.tiptapJson,
    });
    return {
      assetOwnerKind: "postRevision" as const,
      baseCandidate: {
        ...shared,
        authorDisplayName: post.authorDisplayNameSnapshot,
        authorWorkosUserId: post.authorWorkosUserId,
        createdAt: post.createdAt,
        entityId: post.primaryReferenceId,
        entityKind: post.primaryReferenceKind,
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
          projected.plainText,
          post.authorDisplayNameSnapshot,
          post.decisionOutcome,
          post.resolutionSummary,
        ]
          .filter(Boolean)
          .join(" "),
        status: post.threadState,
        title: searchTitle(projected.plainText, `${post.postType} post`),
        updatedAt: post.updatedAt,
      } satisfies SearchCandidate,
      ownerRecordId: revision._id,
      referenceOwnerKind: "postRevision" as const,
    };
  }
  if (owner.kind === "comment") {
    const commentId = ctx.db.normalizeId(
      "buildCollaborationComments",
      owner.id
    );
    const comment = commentId ? await ctx.db.get(commentId) : null;
    if (
      !comment ||
      comment.postId !== post._id ||
      comment.contentState !== "active" ||
      !comment.currentRevisionId ||
      comment.createdAt > snapshotAt ||
      comment.updatedAt > snapshotAt
    ) {
      return null;
    }
    const revision = await ctx.db.get(comment.currentRevisionId);
    if (!(revision && revision.createdAt <= snapshotAt)) {
      return null;
    }
    const projected = projectCollaborationRevisionForViewer({
      references: [],
      tiptapJson: revision.tiptapJson,
    });
    return {
      assetOwnerKind: "commentRevision" as const,
      baseCandidate: {
        ...shared,
        authorDisplayName: comment.authorDisplayNameSnapshot,
        authorWorkosUserId: comment.authorWorkosUserId,
        commentId: comment._id,
        createdAt: comment.createdAt,
        focusEntityId: comment._id,
        focusEntityKind: "comment" as const,
        href: buildCollaborationDeepLink({
          buildId: post.buildId,
          focus: `comment:${comment._id}`,
          recipientRole: role,
        }),
        id: comment._id,
        ownerId: comment._id,
        ownerKind: "comment" as const,
        resultType: "comment" as const,
        searchText: projected.plainText,
        status: "active" as const,
        title: `Reply by ${comment.authorDisplayNameSnapshot}`,
        updatedAt: comment.updatedAt,
      } satisfies SearchCandidate,
      ownerRecordId: revision._id,
      referenceOwnerKind: "commentRevision" as const,
    };
  }
  const actionItemId = ctx.db.normalizeId("buildActionItems", owner.id);
  const item = actionItemId ? await ctx.db.get(actionItemId) : null;
  if (
    !item ||
    item.originatingPostId !== post._id ||
    item.organizationId !== authorization.organizationId ||
    item.buildId !== authorization.build._id ||
    item.createdAt > snapshotAt ||
    item.updatedAt > snapshotAt
  ) {
    return null;
  }
  if (
    !(await canReadMilestoneSystemActionItem(ctx, {
      actionItem: item,
      buildId: authorization.build._id,
      role: authorization.effectiveRole.role,
      workosUserId: authorization.viewer.subject,
    }))
  ) {
    return null;
  }
  const projected = projectCollaborationRevisionForViewer({
    references: [],
    tiptapJson: item.descriptionTiptapJson,
  });
  const canonicalPresentation =
    await deriveMilestoneSystemActionItemPresentation(ctx, {
      actionItem: item,
      asOf: snapshotAt,
      build: authorization.build,
      viewer: {
        role,
        roles: authorization.roles,
        workosUserId: authorization.viewer.subject,
      },
    });
  const validCanonicalSubmilestoneId =
    item.systemMode === "generated_milestone_submilestone" &&
    canonicalPresentation?.bindingState === "valid"
      ? item.canonicalBuildSubmilestoneId
      : undefined;
  const generatedSubmilestone = validCanonicalSubmilestoneId !== undefined;
  const canonicalStatus = canonicalSearchStatus(canonicalPresentation?.column);
  return {
    assetOwnerKind: "actionItem" as const,
    baseCandidate: {
      ...shared,
      actionItemId: item._id,
      assigneeWorkosUserId: generatedSubmilestone
        ? canonicalPresentation?.executionOwnership?.assigneeWorkosUserId ??
          (canonicalPresentation?.executionOwnership?.viewerIsAssignee
            ? authorization.viewer.subject
            : undefined)
        : item.assigneeWorkosUserId,
      authorDisplayName: participantDisplayName(
        authorization,
        item.creatorWorkosUserId
      ),
      authorWorkosUserId: item.creatorWorkosUserId,
      createdAt: item.createdAt,
      entityId: validCanonicalSubmilestoneId ?? item.primaryReferenceId,
      entityKind: validCanonicalSubmilestoneId
        ? ("submilestone" as const)
        : item.primaryReferenceKind,
      entityKinds: validCanonicalSubmilestoneId
        ? (["submilestone"] as ReferenceKind[])
        : shared.entityKinds,
      focusEntityId: validCanonicalSubmilestoneId ?? item._id,
      focusEntityKind: validCanonicalSubmilestoneId
        ? ("submilestone" as const)
        : ("actionItem" as const),
      href: buildCollaborationDeepLink({
        buildId: post.buildId,
        ...(validCanonicalSubmilestoneId ? { detailTab: "collaboration" } : {}),
        focus: validCanonicalSubmilestoneId
          ? `submilestone:${validCanonicalSubmilestoneId}`
          : `actionItem:${item._id}`,
        recipientRole: role,
      }),
      id: validCanonicalSubmilestoneId ?? item._id,
      ownerId: item._id,
      ownerKind: "actionItem" as const,
      resultType: generatedSubmilestone
        ? ("submilestone" as const)
        : ("actionItem" as const),
      searchText: generatedSubmilestone
        ? [
            item.title,
            canonicalPresentation?.column,
            canonicalPresentation?.plannedStartDate,
            canonicalPresentation?.plannedCompletionDate,
            canonicalPresentation?.executionOwnership?.assigneeDisplayName,
            canonicalPresentation?.attention,
            ...(canonicalPresentation?.readyExceptFor ?? []),
          ]
            .filter(Boolean)
            .join(" ")
        : `${item.title} ${projected.plainText}`,
      status: canonicalStatus ?? item.status,
      title: item.title,
      updatedAt: item.updatedAt,
    } satisfies SearchCandidate,
    ownerRecordId: item._id,
    referenceOwnerKind: "actionItem" as const,
  };
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

export async function validateIndexedSearchCandidate(
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
  const drawCoordinationReadable =
    post.systemPostKind !== "draw" ||
    (await canReadDrawCoordination(ctx, { authorization, post }));
  if (post.systemPostKind === "draw" && !drawCoordinationReadable) {
    // Canonical Draw facts remain searchable as the parent post, but no
    // coordination child (reply, Action Item, reference, or asset) may leak
    // through the indexed projection or deep-link hydration.
    if (candidate.resultType !== "post") {
      return null;
    }
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
    if (
      input.post.systemPostKind === "draw" &&
      !(await canReadDrawCoordination(ctx, {
        authorization: input.authorization,
        post: input.post,
      }))
    ) {
      return false;
    }
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
    (input.candidate.resultType === "actionItem" ||
      input.candidate.resultType === "submilestone") &&
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
