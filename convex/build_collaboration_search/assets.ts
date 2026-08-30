import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import { canReadCollaborationAsset } from "../build_collaboration_asset_access";
import { buildCollaborationDeepLink } from "../build_collaboration_links";
import type { BuildCollaborationRole } from "../build_collaboration_model";
import { resolveCurrentBuildCollaborationReference } from "../build_collaboration_references";
import { canReadMilestoneSystemActionItem } from "../build_collaboration_system_event_access";
import { deriveMilestoneSystemActionItemPresentation } from "../build_collaboration_system_posts";
import { canonicalSearchStatus } from "./ranking";
import type { AudienceMode, ReferenceKind, SearchCandidate } from "./contracts";
import type { Doc, Id, QueryCtx } from "../types";

export function parseIndexedSearchCandidate(
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

export async function refreshIndexedSearchCandidate(
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
    case "actionItem":
    case "submilestone": {
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
      if (
        !(await canReadMilestoneSystemActionItem(ctx, {
          actionItem: item,
          buildId: input.authorization.build._id,
          role: input.authorization.effectiveRole.role,
          workosUserId: input.authorization.viewer.subject,
        }))
      ) {
        return null;
      }
      const presentation = await deriveMilestoneSystemActionItemPresentation(
        ctx,
        {
          actionItem: item,
          asOf: Date.now(),
          build: input.authorization.build,
          viewer: {
            role: input.authorization.effectiveRole.role,
            roles: input.authorization.roles,
            workosUserId: input.authorization.viewer.subject,
          },
        }
      );
      const canonicalSubmilestoneId =
        item.systemMode === "generated_milestone_submilestone" &&
        presentation?.bindingState === "valid"
          ? item.canonicalBuildSubmilestoneId
          : undefined;
      const generatedSubmilestone = canonicalSubmilestoneId !== undefined;
      candidate = {
        ...candidate,
        assigneeWorkosUserId: generatedSubmilestone
          ? presentation?.executionOwnership?.assigneeWorkosUserId ??
            (presentation?.executionOwnership?.viewerIsAssignee
              ? input.authorization.viewer.subject
              : undefined)
          : item.assigneeWorkosUserId,
        entityId: canonicalSubmilestoneId ?? item.primaryReferenceId,
        entityKind: canonicalSubmilestoneId
          ? "submilestone"
          : item.primaryReferenceKind,
        entityKinds: canonicalSubmilestoneId
          ? ["submilestone"]
          : candidate.entityKinds,
        focusEntityId: canonicalSubmilestoneId ?? item._id,
        focusEntityKind: canonicalSubmilestoneId
          ? "submilestone"
          : "actionItem",
        href: buildCollaborationDeepLink({
          buildId: input.post.buildId,
          ...(canonicalSubmilestoneId ? { detailTab: "collaboration" } : {}),
          focus: canonicalSubmilestoneId
            ? `submilestone:${canonicalSubmilestoneId}`
            : `actionItem:${item._id}`,
          recipientRole: input.authorization.effectiveRole.role,
        }),
        id: canonicalSubmilestoneId ?? item._id,
        resultType: generatedSubmilestone ? "submilestone" : "actionItem",
        status: canonicalSearchStatus(presentation?.column) ?? item.status,
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

export async function refreshIndexedReferenceCandidate(
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

export function currentSearchCandidateHref(
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
    ...(candidate.focusEntityKind === "submilestone"
      ? { detailTab: "collaboration" }
      : {}),
    focus: `${candidate.focusEntityKind ?? candidate.resultType}:${candidate.focusEntityId ?? candidate.id}`,
    recipientRole: role,
  });
}

export function referenceCandidates(input: {
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
        ...(reference.entityKind === "submilestone"
          ? { detailTab: "collaboration" }
          : {}),
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

export function assetCandidates(input: {
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
      focusEntityId: asset.assetId,
      focusEntityKind: "asset",
      hasAttachments: true,
      href: buildCollaborationDeepLink({
        buildId: input.buildId,
        focus: `asset:${asset.assetId}`,
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

export async function enrichSearchAssetAttachments(
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
