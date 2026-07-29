import { v } from "convex/values";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import { publishBuildCollaborationBundle } from "./build_collaboration";
import { collaborationDraftSummaryValidator } from "./build_collaboration_contracts";
import { requireHumanCollaborationActor } from "./build_collaboration_human";
import {
  type BuildCollaborationPublicationBundle,
  canonicalPublicationBundleJson,
  normalizePublicationBundle,
  publicationBundleFields,
  publicationBundleHash,
} from "./build_collaboration_publication_bundle";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import type { Id, MutationCtx } from "./types";

export const saveMyBuildCollaborationDraft = authenticatedMutation
  .input({
    ...publicationBundleFields,
    approvalOwnerWorkosUserId: v.optional(v.string()),
    buildId: v.id("activeBuilds"),
    draftId: v.optional(v.id("buildCollaborationDrafts")),
    organizationId: v.string(),
    preparedByAgent: v.optional(v.boolean()),
    scheduledFor: v.optional(v.number()),
  })
  .returns(v.id("buildCollaborationDrafts"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const now = Date.now();
    const bundle = normalizePublicationBundle(args);
    const bundleJson = canonicalPublicationBundleJson(bundle);
    const bundleHash = await publicationBundleHash(bundleJson);
    const preparedByAgent = authorization.viewer.actorKind !== "human";
    const approvalOwnerWorkosUserId =
      args.approvalOwnerWorkosUserId?.trim() ||
      (authorization.viewer.actorKind === "human"
        ? authorization.viewer.subject
        : undefined);
    if (!approvalOwnerWorkosUserId) {
      throw new Error(
        "Agent, service, and automation drafts require a human approval owner."
      );
    }
    await requireHumanApprovalOwner(ctx, {
      approvalOwnerWorkosUserId,
      authorization,
    });

    if (args.draftId) {
      const draft = await ctx.db.get(args.draftId);
      if (
        !draft ||
        draft.buildId !== authorization.build._id ||
        draft.ownerWorkosUserId !== authorization.viewer.subject
      ) {
        throw new Error("Draft not found.");
      }
      if (draft.state === "published" || draft.state === "discarded") {
        throw new Error("Published or discarded drafts cannot be edited.");
      }
      await invalidateDraftApprovals(ctx, draft._id, now);
      await ctx.db.patch(draft._id, {
        bundleHash,
        bundleJson,
        approvalOwnerWorkosUserId,
        preparedByActorKind: authorization.viewer.actorKind,
        preparedByAgent,
        preparedByWorkosUserId: authorization.viewer.subject,
        revision: draft.revision + 1,
        scheduledFor: args.scheduledFor,
        state: "active",
        updatedAt: now,
      });
      return draft._id;
    }

    return await ctx.db.insert("buildCollaborationDrafts", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      bundleHash,
      bundleJson,
      createdAt: now,
      organizationId: authorization.organizationId,
      ownerWorkosUserId: authorization.viewer.subject,
      approvalOwnerWorkosUserId,
      preparedByActorKind: authorization.viewer.actorKind,
      preparedByAgent,
      preparedByWorkosUserId: authorization.viewer.subject,
      revision: 1,
      scheduledFor: args.scheduledFor,
      state: "active",
      updatedAt: now,
    });
  })
  .public();

export const listMyBuildCollaborationDrafts = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(v.array(collaborationDraftSummaryValidator))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const ownedDrafts = await ctx.db
      .query("buildCollaborationDrafts")
      .withIndex("by_buildId_and_ownerWorkosUserId_and_state", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("ownerWorkosUserId", authorization.viewer.subject)
      )
      .take(100);
    const approvalDrafts = await ctx.db
      .query("buildCollaborationDrafts")
      .withIndex(
        "by_buildId_and_approvalOwnerWorkosUserId_and_state",
        (query) =>
          query
            .eq("buildId", authorization.build._id)
            .eq("approvalOwnerWorkosUserId", authorization.viewer.subject)
      )
      .take(100);
    const drafts = [
      ...new Map(
        [...ownedDrafts, ...approvalDrafts].map((draft) => [draft._id, draft])
      ).values(),
    ];
    return drafts
      .filter(
        (draft) => draft.state === "active" || draft.state === "scheduled"
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((draft) => ({
        _creationTime: draft._creationTime,
        _id: draft._id,
        approvalOwnerWorkosUserId: draft.approvalOwnerWorkosUserId,
        bundleJson: draft.bundleJson,
        preparedByActorKind: draft.preparedByActorKind,
        preparedByAgent: draft.preparedByAgent ?? false,
        preparedByWorkosUserId: draft.preparedByWorkosUserId,
        revision: draft.revision,
        scheduledFor: draft.scheduledFor,
        state: draft.state,
        updatedAt: draft.updatedAt,
      }));
  })
  .public();

export const discardMyBuildCollaborationDraft = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    draftId: v.id("buildCollaborationDrafts"),
    organizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const draft = await ctx.db.get(args.draftId);
    if (
      !draft ||
      draft.buildId !== authorization.build._id ||
      (draft.ownerWorkosUserId !== authorization.viewer.subject &&
        draft.approvalOwnerWorkosUserId !== authorization.viewer.subject)
    ) {
      throw new Error("Draft not found.");
    }
    if (draft.state === "published") {
      throw new Error("Published drafts cannot be discarded.");
    }
    const now = Date.now();
    await invalidateDraftApprovals(ctx, draft._id, now);
    await ctx.db.patch(draft._id, { state: "discarded", updatedAt: now });
    return null;
  })
  .public();

export const approveAndPublishBuildCollaborationDraft = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    draftId: v.id("buildCollaborationDrafts"),
    organizationId: v.string(),
  })
  .returns(v.id("buildCollaborationPosts"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    await requireHumanCollaborationActor(ctx, authorization);
    const draft = await ctx.db.get(args.draftId);
    if (
      !draft ||
      draft.buildId !== authorization.build._id ||
      (draft.approvalOwnerWorkosUserId ?? draft.ownerWorkosUserId) !==
        authorization.viewer.subject
    ) {
      throw new Error("Draft not found.");
    }
    if (draft.state === "published" || draft.state === "discarded") {
      throw new Error("This draft is no longer publishable.");
    }
    if ((await publicationBundleHash(draft.bundleJson)) !== draft.bundleHash) {
      throw new Error(
        "The draft changed after review. Review the latest revision before publishing."
      );
    }

    const bundle = JSON.parse(
      draft.bundleJson
    ) as BuildCollaborationPublicationBundle;
    const now = Date.now();
    const approvalId = await ctx.db.insert(
      "buildCollaborationPublicationApprovals",
      {
        approvedAt: now,
        approvingActorKind: authorization.viewer.actorKind,
        approvingWorkosUserId: authorization.viewer.subject,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        bundleHash: draft.bundleHash,
        bundleJsonSnapshot: draft.bundleJson,
        draftId: draft._id,
        draftRevision: draft.revision,
        mutationSummaryJson: JSON.stringify({
          actionItemCount: bundle.actionItems.length,
          attachmentAssetCount: bundle.attachmentAssetIds.length,
          notificationEffectCount: bundle.notificationEffects.length,
          referenceCount: bundle.references.length,
          sharedMutationCount: bundle.sharedMutations.length,
        }),
        organizationId: authorization.organizationId,
        readerSummaryJson: JSON.stringify({
          audienceMode: bundle.audienceMode,
          excludedReaderIds: bundle.excludedReaderIds,
          requestedReaderIds: bundle.requestedReaderIds,
        }),
        scheduledFor: draft.scheduledFor,
        state: "approved",
      }
    );
    const postId = await publishBuildCollaborationBundle(ctx, {
      agentDrafted: draft.preparedByAgent ?? false,
      authorization,
      bundle,
    });
    await ctx.db.patch(approvalId, {
      publishedAt: now,
      state: "published",
    });
    await ctx.db.patch(draft._id, {
      state: "published",
      updatedAt: now,
    });
    return postId;
  })
  .public();

async function invalidateDraftApprovals(
  ctx: MutationCtx,
  draftId: Id<"buildCollaborationDrafts">,
  now: number
) {
  const approvals = await ctx.db
    .query("buildCollaborationPublicationApprovals")
    .withIndex("by_draftId_and_state", (query) => query.eq("draftId", draftId))
    .take(100);
  for (const approval of approvals) {
    if (approval.state === "approved") {
      await ctx.db.patch(approval._id, {
        invalidatedAt: now,
        state: "invalidated",
      });
    }
  }
}

async function requireHumanApprovalOwner(
  ctx: MutationCtx,
  input: {
    approvalOwnerWorkosUserId: string;
    authorization: ActiveBuildAuthorization;
  }
) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (query) =>
      query.eq("workosUserId", input.approvalOwnerWorkosUserId)
    )
    .unique();
  if (!user || user.status === "deleted") {
    throw new Error("The requested human approval owner is unavailable.");
  }
  if (
    input.authorization.participants.some(
      (participant) =>
        participant.workosUserId === input.approvalOwnerWorkosUserId
    )
  ) {
    return;
  }
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (query) =>
      query.eq("workosUserId", input.approvalOwnerWorkosUserId)
    )
    .take(100);
  if (
    !memberships.some(
      (membership) =>
        membership.workosOrganizationId ===
          input.authorization.organizationId && membership.status === "active"
    )
  ) {
    throw new Error(
      "The requested human approval owner cannot access this Build."
    );
  }
}
