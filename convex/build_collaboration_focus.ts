import { v } from "convex/values";

import { selectActiveBuildAuthorizationCapacity } from "./activeBuildAccess";
import { authenticatedQuery } from "./authz";
import { canReadCollaborationPost } from "./build_collaboration_access";
import { canReadCollaborationAsset } from "./build_collaboration_asset_access";
import { canReadDrawCoordination } from "./build_draw_coordination";
import {
  collaborationFocusedPostContextValidator,
  collaborationTagOptionValidator,
} from "./build_collaboration_contracts";
import { projectReadableBuildCollaborationPost } from "./build_collaboration_projection";
import { resolveCurrentBuildCollaborationReference } from "./build_collaboration_references";
import {
  authorizeActiveBuildCollaborationAccess,
  BUILD_COLLABORATION_UNAVAILABLE_ERROR,
} from "./build_collaboration_rollout";
import {
  canReadMilestoneSystemActionItem,
  canReadMilestoneSystemEvent,
  isDrawSystemPost,
} from "./build_collaboration_system_event_access";
import {
  buildCollaborationReferenceKindValidator,
  buildCollaborationRoleValidator,
} from "./build_collaboration_validators";
import { resolveBuildSubmilestoneWorkspaceContext } from "./build_submilestone_workspace";
import type { Id, QueryCtx } from "./types";

export const buildDetailTargetValidator = v.union(
  v.object({
    kind: v.literal("milestone"),
    milestoneId: v.id("buildMilestones"),
    readOnly: v.boolean(),
  }),
  v.object({
    companionId: v.id("buildActionItems"),
    kind: v.literal("submilestone"),
    readOnly: v.boolean(),
    submilestoneId: v.id("buildSubmilestones"),
  }),
  v.object({
    actionItemId: v.id("buildActionItems"),
    kind: v.literal("actionItem"),
    readOnly: v.boolean(),
  }),
);

export const buildDetailTargetResolutionValidator = v.union(
  v.object({ state: v.literal("revoked") }),
  v.object({
    code: v.string(),
    message: v.string(),
    state: v.literal("integrity_error"),
  }),
  v.object({
    state: v.literal("visible"),
    target: buildDetailTargetValidator,
  }),
);

type ParsedBuildDetailFocus = {
  id: string;
  kind: "actionItem" | "milestone" | "submilestone";
};

type VisibleSubmilestoneWorkspaceContext = Extract<
  Awaited<ReturnType<typeof resolveBuildSubmilestoneWorkspaceContext>>,
  { state: "visible" }
>;

function parseBuildDetailFocus(value: string): ParsedBuildDetailFocus | null {
  const normalized = value.trim();
  const separator = normalized.indexOf(":");
  if (
    separator <= 0 ||
    separator !== normalized.lastIndexOf(":") ||
    separator === normalized.length - 1
  ) {
    return null;
  }
  const kind = normalized.slice(0, separator);
  if (
    kind !== "actionItem" &&
    kind !== "milestone" &&
    kind !== "submilestone"
  ) {
    return null;
  }
  return { id: normalized.slice(separator + 1), kind };
}

function buildDetailIntegrityError(code: string, message: string) {
  return { code, message, state: "integrity_error" as const };
}

function visibleSubmilestoneTarget(
  resolved: VisibleSubmilestoneWorkspaceContext,
) {
  const readOnly =
    resolved.submilestone.planningState === "superseded" ||
    resolved.companion.canonicalPlanningState === "superseded" ||
    (resolved.companion.canonicalCompanionDisposition !== undefined &&
      resolved.companion.canonicalCompanionDisposition !== "active");
  return {
    state: "visible" as const,
    target: {
      companionId: resolved.companion._id,
      kind: "submilestone" as const,
      readOnly,
      submilestoneId: resolved.submilestone._id,
    },
  };
}

function isBuildDetailAccessDenial(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.startsWith("Forbidden:") ||
    error.message === BUILD_COLLABORATION_UNAVAILABLE_ERROR ||
    error.message ===
      "Build Collaboration is temporarily frozen for a rollback rehearsal snapshot."
  );
}

/**
 * Resolve one route focus token without hydrating a detail surface. Generated
 * Sub-milestone companions dispatch through the canonical workspace contract;
 * user-authored Action Items remain generic collaboration targets.
 */
export const resolveBuildDetailTarget = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    focus: v.string(),
    organizationId: v.string(),
    viewerCapacity: v.optional(buildCollaborationRoleValidator),
  })
  .returns(buildDetailTargetResolutionValidator)
  .handler(async (ctx, args) => {
    const focus = parseBuildDetailFocus(args.focus);
    if (!focus) {
      return { state: "revoked" as const };
    }

    if (focus.kind === "submilestone") {
      const submilestoneId = ctx.db.normalizeId("buildSubmilestones", focus.id);
      if (!submilestoneId) {
        return { state: "revoked" as const };
      }
      const resolved = await resolveBuildSubmilestoneWorkspaceContext(ctx, {
        buildId: args.buildId,
        buildSubmilestoneId: submilestoneId,
        organizationId: args.organizationId,
        viewerCapacity: args.viewerCapacity,
      });
      if (resolved.state !== "visible") {
        return resolved;
      }
      return visibleSubmilestoneTarget(resolved);
    }

    let authorization;
    try {
      authorization = selectActiveBuildAuthorizationCapacity(
        await authorizeActiveBuildCollaborationAccess(ctx, args),
        args.viewerCapacity,
      );
    } catch (error) {
      if (isBuildDetailAccessDenial(error)) {
        return { state: "revoked" as const };
      }
      throw error;
    }

    if (focus.kind === "milestone") {
      const milestoneId = ctx.db.normalizeId("buildMilestones", focus.id);
      const milestone = milestoneId ? await ctx.db.get(milestoneId) : null;
      if (
        !milestone ||
        milestone.buildId !== authorization.build._id ||
        milestone.organizationId !== authorization.organizationId ||
        milestone.brokerageId !== authorization.brokerage._id ||
        !(await canReadMilestoneSystemEvent(ctx, {
          buildId: authorization.build._id,
          milestoneId: milestone._id,
          role: authorization.effectiveRole.role,
          workosUserId: authorization.viewer.subject,
        }))
      ) {
        return { state: "revoked" as const };
      }
      return {
        state: "visible" as const,
        target: {
          kind: "milestone" as const,
          milestoneId: milestone._id,
          readOnly: milestone.planningState === "superseded",
        },
      };
    }

    const actionItemId = ctx.db.normalizeId("buildActionItems", focus.id);
    const actionItem = actionItemId ? await ctx.db.get(actionItemId) : null;
    if (
      !actionItem ||
      actionItem.buildId !== authorization.build._id ||
      actionItem.organizationId !== authorization.organizationId ||
      actionItem.brokerageId !== authorization.brokerage._id
    ) {
      return { state: "revoked" as const };
    }

    const generated =
      actionItem.systemMode === "generated_milestone_submilestone";
    const post = await ctx.db.get(actionItem.originatingPostId);
    if (!post) {
      return generated
        ? buildDetailIntegrityError(
            "GENERATED_COMPANION_BINDING_INVALID",
            "The generated companion has no readable originating Milestone post.",
          )
        : { state: "revoked" as const };
    }
    if (
      post.buildId !== authorization.build._id ||
      post.organizationId !== authorization.organizationId ||
      post.brokerageId !== authorization.brokerage._id ||
      !(await canReadCollaborationPost(ctx, authorization, post)) ||
      (isDrawSystemPost(post) &&
        !(await canReadDrawCoordination(ctx, { authorization, post })))
    ) {
      return { state: "revoked" as const };
    }

    if (generated) {
      if (!actionItem.canonicalBuildSubmilestoneId) {
        return buildDetailIntegrityError(
          "GENERATED_COMPANION_BINDING_MISSING",
          "The generated companion is missing its canonical Sub-milestone binding.",
        );
      }
      const resolved = await resolveBuildSubmilestoneWorkspaceContext(ctx, {
        buildId: args.buildId,
        buildSubmilestoneId: actionItem.canonicalBuildSubmilestoneId,
        companionActionItemId: actionItem._id,
        organizationId: args.organizationId,
        viewerCapacity: args.viewerCapacity,
      });
      if (resolved.state !== "visible") {
        return resolved;
      }
      return visibleSubmilestoneTarget(resolved);
    }

    if (
      !(await canReadMilestoneSystemActionItem(ctx, {
        actionItem,
        buildId: authorization.build._id,
        role: authorization.effectiveRole.role,
        workosUserId: authorization.viewer.subject,
      }))
    ) {
      return { state: "revoked" as const };
    }
    return {
      state: "visible" as const,
      target: {
        actionItemId: actionItem._id,
        kind: "actionItem" as const,
        readOnly: false,
      },
    };
  })
  .public();

export const getFocusedBuildActionItemContext = authenticatedQuery
  .input({
    actionItemId: v.string(),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(
    v.union(
      v.null(),
      v.object({
        actionItemId: v.id("buildActionItems"),
        postId: v.id("buildCollaborationPosts"),
      }),
    ),
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args,
    );
    const actionItemId = ctx.db.normalizeId(
      "buildActionItems",
      args.actionItemId,
    );
    const item = actionItemId ? await ctx.db.get(actionItemId) : null;
    if (
      !item ||
      item.buildId !== authorization.build._id ||
      item.organizationId !== authorization.organizationId
    ) {
      return null;
    }
    const post = await ctx.db.get(item.originatingPostId);
    if (
      !(post && (await canReadCollaborationPost(ctx, authorization, post))) ||
      (post &&
        isDrawSystemPost(post) &&
        !(await canReadDrawCoordination(ctx, { authorization, post }))) ||
      !(await canReadMilestoneSystemActionItem(ctx, {
        actionItem: item,
        buildId: authorization.build._id,
        role: authorization.effectiveRole.role,
        workosUserId: authorization.viewer.subject,
      }))
    ) {
      return null;
    }
    return { actionItemId: item._id, postId: post._id };
  })
  .public();

export const getFocusedBuildCollaborationReference = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    entityId: v.string(),
    entityKind: buildCollaborationReferenceKindValidator,
    organizationId: v.string(),
  })
  .returns(
    v.union(
      v.object({ state: v.literal("revoked") }),
      v.object({
        reference: collaborationTagOptionValidator,
        state: v.literal("visible"),
      }),
    ),
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args,
    );
    const referenceRows = await ctx.db
      .query("buildCollaborationReferences")
      .withIndex("by_buildId_and_entityKind_and_entityId", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("entityKind", args.entityKind)
          .eq("entityId", args.entityId),
      )
      .take(101);
    if (referenceRows.length > 100) {
      return { state: "revoked" as const };
    }
    for (const referenceRow of referenceRows) {
      const referencedPost = await ctx.db.get(referenceRow.postId);
      if (
        referencedPost &&
        isDrawSystemPost(referencedPost) &&
        !(await canReadDrawCoordination(ctx, {
          authorization,
          post: referencedPost,
        }))
      ) {
        return { state: "revoked" as const };
      }
    }
    try {
      const reference = await resolveCurrentBuildCollaborationReference(ctx, {
        authorization,
        entityId: args.entityId,
        entityKind: args.entityKind,
      });
      return {
        reference: {
          entityId: reference.entityId,
          entityKind: reference.entityKind,
          eyebrow: reference.eyebrow,
          href: reference.href,
          label: reference.label,
          searchTerms: reference.searchTerms,
          summary: reference.summary,
        },
        state: "visible" as const,
      };
    } catch {
      return { state: "revoked" as const };
    }
  })
  .public();

export const getFocusedBuildCollaborationAssetContext = authenticatedQuery
  .input({
    assetId: v.string(),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(
    v.union(
      v.object({ state: v.literal("revoked") }),
      v.object({
        actionItemId: v.optional(v.id("buildActionItems")),
        assetId: v.id("buildCollaborationAssets"),
        commentId: v.optional(v.id("buildCollaborationComments")),
        postId: v.id("buildCollaborationPosts"),
        state: v.literal("visible"),
      }),
    ),
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args,
    );
    const assetId = ctx.db.normalizeId(
      "buildCollaborationAssets",
      args.assetId,
    );
    const asset = assetId ? await ctx.db.get(assetId) : null;
    if (
      !asset ||
      asset.buildId !== authorization.build._id ||
      asset.organizationId !== authorization.organizationId ||
      !(await canReadCollaborationAsset(ctx, { asset, authorization }))
    ) {
      return { state: "revoked" as const };
    }
    const owner = await resolvePublishedAssetOwner(ctx, {
      assetId: asset._id,
      buildId: asset.buildId,
    });
    const postId = asset.originatingPostId ?? owner?.postId;
    const post = postId ? await ctx.db.get(postId) : null;
    if (
      !(post && (await canReadCollaborationPost(ctx, authorization, post))) ||
      (post &&
        isDrawSystemPost(post) &&
        !(await canReadDrawCoordination(ctx, { authorization, post })))
    ) {
      return { state: "revoked" as const };
    }
    return {
      actionItemId: owner?.actionItemId,
      assetId: asset._id,
      commentId: owner?.commentId,
      postId: post._id,
      state: "visible" as const,
    };
  })
  .public();

export const getFocusedBuildCollaborationPostContext = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    postId: v.string(),
  })
  .returns(collaborationFocusedPostContextValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args,
    );
    const postId = ctx.db.normalizeId("buildCollaborationPosts", args.postId);
    const post = postId ? await ctx.db.get(postId) : null;
    if (
      !post ||
      post.buildId !== authorization.build._id ||
      post.organizationId !== authorization.organizationId ||
      post.systemLifecycle === "latent" ||
      !(await canReadCollaborationPost(ctx, authorization, post)) ||
      (isDrawSystemPost(post) &&
        !(await canReadDrawCoordination(ctx, { authorization, post })))
    ) {
      return { state: "revoked" as const };
    }
    const entry = await projectReadableBuildCollaborationPost(ctx, {
      authorization,
      post,
      unavailableKey: `focused-unavailable-${post._id}`,
    });
    return entry.kind === "post"
      ? { entry, state: "visible" as const }
      : { state: "revoked" as const };
  })
  .public();

async function resolvePublishedAssetOwner(
  ctx: QueryCtx,
  input: {
    assetId: Id<"buildCollaborationAssets">;
    buildId: Id<"activeBuilds">;
  },
) {
  const attachment = await ctx.db
    .query("buildCollaborationAttachments")
    .withIndex("by_buildId_and_attachmentKind_and_attachmentId", (query) =>
      query
        .eq("buildId", input.buildId)
        .eq("attachmentKind", "collaborationAsset")
        .eq("attachmentId", input.assetId),
    )
    .first();
  if (!attachment) {
    return null;
  }
  switch (attachment.ownerKind) {
    case "postRevision": {
      const revisionId = ctx.db.normalizeId(
        "buildCollaborationPostRevisions",
        attachment.ownerRecordId,
      );
      const revision = revisionId ? await ctx.db.get(revisionId) : null;
      return revision ? { postId: revision.postId } : null;
    }
    case "commentRevision": {
      const revisionId = ctx.db.normalizeId(
        "buildCollaborationCommentRevisions",
        attachment.ownerRecordId,
      );
      const revision = revisionId ? await ctx.db.get(revisionId) : null;
      return revision
        ? { commentId: revision.commentId, postId: revision.postId }
        : null;
    }
    case "actionItem": {
      const actionItemId = ctx.db.normalizeId(
        "buildActionItems",
        attachment.ownerRecordId,
      );
      const item = actionItemId ? await ctx.db.get(actionItemId) : null;
      return item
        ? { actionItemId: item._id, postId: item.originatingPostId }
        : null;
    }
    default:
      return null;
  }
}
