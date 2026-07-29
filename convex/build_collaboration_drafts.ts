import { v } from "convex/values";
import { authorizeActiveBuildAccess } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  actionItemInputValidator,
  type BuildCollaborationPublicationBundle,
  publishBuildCollaborationBundle,
  referenceInputValidator,
  stableContentHash,
} from "./build_collaboration";
import {
  buildCollaborationAudienceModeValidator,
  buildCollaborationPostTypeValidator,
} from "./build_collaboration_validators";
import type { Id, MutationCtx } from "./types";

const publicationBundleFields = {
  acknowledgementRequired: v.optional(v.boolean()),
  actionItems: v.array(actionItemInputValidator),
  audienceMode: buildCollaborationAudienceModeValidator,
  plainText: v.string(),
  postType: buildCollaborationPostTypeValidator,
  references: v.array(referenceInputValidator),
  requestedReaderIds: v.array(v.string()),
  tiptapJson: v.string(),
};

export const saveMyBuildCollaborationDraft = authenticatedMutation
  .input({
    ...publicationBundleFields,
    buildId: v.id("activeBuilds"),
    draftId: v.optional(v.id("buildCollaborationDrafts")),
    organizationId: v.string(),
    preparedByAgent: v.boolean(),
    scheduledFor: v.optional(v.number()),
  })
  .returns(v.id("buildCollaborationDrafts"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const now = Date.now();
    const bundle = bundleFromArgs(args);
    const bundleJson = JSON.stringify(bundle);
    const bundleHash = stableContentHash(bundleJson);

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
        preparedByAgent: args.preparedByAgent,
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
      preparedByAgent: args.preparedByAgent,
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
  .returns(v.array(v.any()))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const drafts = await ctx.db
      .query("buildCollaborationDrafts")
      .withIndex("by_buildId_and_ownerWorkosUserId_and_state", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("ownerWorkosUserId", authorization.viewer.subject)
      )
      .take(100);
    return drafts
      .filter(
        (draft) => draft.state === "active" || draft.state === "scheduled"
      )
      .sort((left, right) => right.updatedAt - left.updatedAt);
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
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const draft = await ctx.db.get(args.draftId);
    if (
      !draft ||
      draft.buildId !== authorization.build._id ||
      draft.ownerWorkosUserId !== authorization.viewer.subject
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
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    if (
      !authorization.viewer.subject ||
      authorization.viewer.subject.startsWith("agent_")
    ) {
      throw new Error(
        "Publishing requires an explicit human-in-the-loop approval."
      );
    }
    const draft = await ctx.db.get(args.draftId);
    if (
      !draft ||
      draft.buildId !== authorization.build._id ||
      draft.ownerWorkosUserId !== authorization.viewer.subject
    ) {
      throw new Error("Draft not found.");
    }
    if (draft.state === "published" || draft.state === "discarded") {
      throw new Error("This draft is no longer publishable.");
    }
    if (stableContentHash(draft.bundleJson) !== draft.bundleHash) {
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
        approvingWorkosUserId: authorization.viewer.subject,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        bundleHash: draft.bundleHash,
        draftId: draft._id,
        mutationSummaryJson: JSON.stringify({
          actionItemCount: bundle.actionItems.length,
          referenceCount: bundle.references.length,
        }),
        organizationId: authorization.organizationId,
        readerSummaryJson: JSON.stringify({
          audienceMode: bundle.audienceMode,
          requestedReaderCount: bundle.requestedReaderIds.length,
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

function bundleFromArgs(
  args: BuildCollaborationPublicationBundle
): BuildCollaborationPublicationBundle {
  return {
    acknowledgementRequired: args.acknowledgementRequired,
    actionItems: args.actionItems,
    audienceMode: args.audienceMode,
    plainText: args.plainText,
    postType: args.postType,
    references: args.references,
    requestedReaderIds: args.requestedReaderIds,
    tiptapJson: args.tiptapJson,
  };
}

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
