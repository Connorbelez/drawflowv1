import { v } from "convex/values";
import { stableContentHash } from "./build_collaboration";
import { requireActiveBuildCollaborationTenantByScope } from "./build_collaboration_rollout";
import {
  buildCollaborationPostTypeValidator,
  buildCollaborationReferenceKindValidator,
} from "./build_collaboration_validators";
import { internalMutation } from "./fluent";

export const publishBuildCollaborationSystemEvent = internalMutation
  .input({
    buildId: v.id("activeBuilds"),
    idempotencyKey: v.string(),
    organizationId: v.string(),
    plainText: v.string(),
    postType: buildCollaborationPostTypeValidator,
    primaryReferenceId: v.optional(v.string()),
    primaryReferenceKind: v.optional(buildCollaborationReferenceKindValidator),
    systemLabel: v.string(),
  })
  .returns(v.id("buildCollaborationPosts"))
  .handler(async (ctx, args) => {
    const build = await ctx.db.get(args.buildId);
    if (!build || build.organizationId !== args.organizationId) {
      throw new Error("Build not found.");
    }
    await requireActiveBuildCollaborationTenantByScope(ctx, {
      brokerageId: build.brokerageId,
      organizationId: build.organizationId,
    });
    const existing = await ctx.db
      .query("buildCollaborationPosts")
      .withIndex("by_buildId_and_systemEventKey", (query) =>
        query.eq("buildId", build._id).eq("systemEventKey", args.idempotencyKey)
      )
      .first();
    if (existing) {
      return existing._id;
    }
    const plainText = args.plainText.trim();
    if (!plainText) {
      throw new Error("System event content is required.");
    }
    const now = Date.now();
    const tiptapJson = JSON.stringify({
      content: [
        {
          content: [{ text: plainText, type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    });
    const postId = await ctx.db.insert("buildCollaborationPosts", {
      acknowledgementRequired: false,
      agentDrafted: false,
      audienceFloorTier: 0,
      audienceMode: "build_wide",
      authorDisplayNameSnapshot: args.systemLabel.trim() || "DrawFlow",
      authorRolesSnapshot: [],
      brokerageId: build.brokerageId,
      buildId: build._id,
      commentCount: 0,
      contentState: "active",
      createdAt: now,
      lastMeaningfulActivityAt: now,
      openActionItemCount: 0,
      organizationId: args.organizationId,
      postType: args.postType,
      primaryReferenceId: args.primaryReferenceId,
      primaryReferenceKind: args.primaryReferenceKind,
      revision: 1,
      source: "system",
      systemEventKey: args.idempotencyKey,
      threadState: "open",
      updatedAt: now,
    });
    const revisionId = await ctx.db.insert("buildCollaborationPostRevisions", {
      authorRole: "admin",
      authorWorkosUserId: "system",
      brokerageId: build.brokerageId,
      buildId: build._id,
      contentHash: stableContentHash(tiptapJson),
      createdAt: now,
      organizationId: args.organizationId,
      plainText,
      postId,
      revision: 1,
      tiptapJson,
    });
    await ctx.db.patch(postId, { currentRevisionId: revisionId });
    await ctx.db.insert("eventOutbox", {
      brokerageId: build.brokerageId,
      createdAt: now,
      eventType: "build.collaboration.system_event.published",
      organizationId: args.organizationId,
      payloadPreview: JSON.stringify({
        idempotencyKey: args.idempotencyKey,
        postType: args.postType,
      }),
      relatedEntityId: postId,
      relatedEntityType: "buildCollaborationPost",
      status: "pending",
    });
    return postId;
  })
  .internal();
