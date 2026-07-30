import { v } from "convex/values";
import {
  type ActiveBuildAuthorization,
  projectActiveBuildParticipants,
} from "./activeBuildAccess";
import { stableContentHash } from "./build_collaboration";
import { resolveCanonicalBuildCollaborationReferences } from "./build_collaboration_references";
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
    const existing = await ctx.db
      .query("buildCollaborationPosts")
      .withIndex("by_buildId_and_systemEventKey", (query) =>
        query.eq("buildId", build._id).eq("systemEventKey", args.idempotencyKey)
      )
      .first();
    if (existing) {
      return existing._id;
    }
    await requireActiveBuildCollaborationTenantByScope(ctx, {
      brokerageId: build.brokerageId,
      organizationId: build.organizationId,
    });
    if (
      Boolean(args.primaryReferenceId) !== Boolean(args.primaryReferenceKind)
    ) {
      throw new Error(
        "System event references require both an entity kind and entity ID."
      );
    }
    const brokerage = await ctx.db.get(build.brokerageId);
    const proposal = await ctx.db.get(build.proposalId);
    if (!(brokerage && proposal)) {
      throw new Error("Build scope is unavailable.");
    }
    const participantRows = await ctx.db
      .query("buildParticipants")
      .withIndex("by_buildId_and_status", (query) =>
        query.eq("buildId", build._id).eq("status", "active")
      )
      .take(500);
    const participants = await projectActiveBuildParticipants(ctx, {
      build,
      grantedParticipants: participantRows,
      proposal,
    });
    const systemAuthorization = {
      brokerage,
      build,
      effectiveRole: { role: "admin", tier: 5 },
      organizationId: build.organizationId,
      participants,
      proposal,
      roles: ["admin"],
      viewer: {
        email: undefined,
        organizationId: build.organizationId,
        roles: ["admin"],
        subject: "system",
      },
    } as ActiveBuildAuthorization;
    const [primaryReference] =
      await resolveCanonicalBuildCollaborationReferences(ctx, {
        authorization: systemAuthorization,
        readerIds: participants.map((participant) => participant.workosUserId),
        references:
          args.primaryReferenceId && args.primaryReferenceKind
            ? [
                {
                  entityId: args.primaryReferenceId,
                  entityKind: args.primaryReferenceKind,
                  primary: true,
                },
              ]
            : [],
      });
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
      primaryReferenceId: primaryReference?.entityId,
      primaryReferenceKind: primaryReference?.entityKind,
      readRevision: 1,
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
    if (primaryReference) {
      await ctx.db.insert("buildCollaborationReferences", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        entityId: primaryReference.entityId,
        entityKind: primaryReference.entityKind,
        labelSnapshot: primaryReference.label,
        organizationId: build.organizationId,
        ownerKind: "postRevision",
        ownerRecordId: revisionId,
        postId,
        primary: true,
        summarySnapshot: primaryReference.summary,
      });
    }
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
