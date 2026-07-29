import { v } from "convex/values";
import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import { collaborationNotificationPreferenceValidator } from "./build_collaboration_contracts";
import { buildCollaborationNotificationChannelValidator } from "./build_collaboration_validators";
import type { MutationCtx } from "./types";

export const getMyBuildCollaborationNotificationPreferences = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(collaborationNotificationPreferenceValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const preference = await ctx.db
      .query("buildCollaborationNotificationPreferences")
      .withIndex("by_buildId_and_workosUserId", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("workosUserId", authorization.viewer.subject)
      )
      .first();
    return {
      channels: preference?.channels ?? ["in_app", "email"],
      digestCadence: preference?.digestCadence ?? "daily",
      digestEnabled: preference?.digestEnabled ?? true,
      ordinaryMuted: preference?.ordinaryMuted ?? false,
      workosUserId: authorization.viewer.subject,
    };
  })
  .public();

export const updateMyBuildCollaborationNotificationPreferences =
  authenticatedMutation
    .input({
      buildId: v.id("activeBuilds"),
      channels: v.array(buildCollaborationNotificationChannelValidator),
      digestCadence: v.union(
        v.literal("daily"),
        v.literal("weekly"),
        v.literal("never")
      ),
      digestEnabled: v.boolean(),
      organizationId: v.string(),
      ordinaryMuted: v.boolean(),
    })
    .returns(v.null())
    .handler(async (ctx, args) => {
      const authorization = await authorizeActiveBuildAccess(ctx, args);
      const now = Date.now();
      const existing = await ctx.db
        .query("buildCollaborationNotificationPreferences")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query
            .eq("buildId", authorization.build._id)
            .eq("workosUserId", authorization.viewer.subject)
        )
        .first();
      const patch = {
        channels: [...new Set(args.channels)],
        digestCadence: args.digestCadence,
        digestEnabled: args.digestEnabled,
        ordinaryMuted: args.ordinaryMuted,
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, patch);
      } else {
        await ctx.db.insert("buildCollaborationNotificationPreferences", {
          ...patch,
          brokerageId: authorization.brokerage._id,
          buildId: authorization.build._id,
          createdAt: now,
          organizationId: authorization.organizationId,
          workosUserId: authorization.viewer.subject,
        });
      }
      return null;
    })
    .public();

export async function fanOutBuildCollaborationPublication(
  ctx: MutationCtx,
  input: {
    actionAssigneeIds: string[];
    authorization: ActiveBuildAuthorization;
    plainText: string;
    postId: string;
    postType: "update" | "question" | "issue" | "decision" | "announcement";
    readerIds: string[];
    referencedParticipantIds: string[];
    now: number;
  }
) {
  const directlyAddressed = new Set([
    ...input.actionAssigneeIds,
    ...input.referencedParticipantIds,
  ]);
  const recipients = input.readerIds
    .filter(
      (workosUserId) => workosUserId !== input.authorization.viewer.subject
    )
    .slice(0, 1000);
  for (const recipientWorkosUserId of recipients) {
    const preference = await ctx.db
      .query("buildCollaborationNotificationPreferences")
      .withIndex("by_buildId_and_workosUserId", (query) =>
        query
          .eq("buildId", input.authorization.build._id)
          .eq("workosUserId", recipientWorkosUserId)
      )
      .first();
    const mandatory =
      directlyAddressed.has(recipientWorkosUserId) ||
      input.postType === "announcement" ||
      input.postType === "issue";
    if (!mandatory && preference?.ordinaryMuted) {
      continue;
    }
    if (preference && !preference.channels.includes("in_app")) {
      continue;
    }
    const dedupeKey = `build-collaboration:${input.postId}:published`;
    const existing = await ctx.db
      .query("recipientDeliveries")
      .withIndex("by_recipient_dedupe", (query) =>
        query
          .eq("organizationId", input.authorization.organizationId)
          .eq("recipientWorkosUserId", recipientWorkosUserId)
          .eq("dedupeKey", dedupeKey)
      )
      .first();
    if (existing) {
      continue;
    }
    await ctx.db.insert("recipientDeliveries", {
      actionLabel: "Open thread",
      actionRequired: mandatory,
      body: input.plainText.slice(0, 280),
      brokerageId: input.authorization.brokerage._id,
      createdAt: input.now,
      dedupeKey,
      entityId: input.postId,
      entityLabel: input.authorization.build.buildName,
      entityType: "buildCollaborationPost",
      href: `/backoffice/builds/${input.authorization.build._id}?tab=details&collaborationPost=${input.postId}`,
      organizationId: input.authorization.organizationId,
      recipientWorkosUserId,
      resolutionMode: "recipient",
      sourceLabel: "Build collaboration",
      status: "unread",
      title:
        input.postType === "announcement"
          ? "Build announcement"
          : "New Build collaboration update",
      updatedAt: input.now,
    });
  }
}
