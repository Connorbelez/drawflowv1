import { v } from "convex/values";

import { authenticatedMutation, authenticatedQuery } from "./authz";
import { authorizeInboxOrganization } from "./build_collaboration_inbox";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";

const externalChannelValidator = v.union(v.literal("email"), v.literal("push"));
const deliveryCadenceValidator = v.union(
  v.literal("immediate"),
  v.literal("daily"),
  v.literal("weekly")
);

export const getMyBuildCollaborationPushSubscription = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(
    v.union(
      v.null(),
      v.object({
        _id: v.id("buildCollaborationPushSubscriptions"),
        createdAt: v.number(),
        endpoint: v.string(),
      })
    )
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const subscription = await ctx.db
      .query("buildCollaborationPushSubscriptions")
      .withIndex("by_organizationId_and_workosUserId_and_state", (query) =>
        query
          .eq("organizationId", authorization.organizationId)
          .eq("workosUserId", authorization.viewer.subject)
          .eq("state", "active")
      )
      .order("desc")
      .first();
    return subscription
      ? {
          _id: subscription._id,
          createdAt: subscription.createdAt,
          endpoint: subscription.endpoint,
        }
      : null;
  })
  .public();

export const registerMyBuildCollaborationPushSubscription =
  authenticatedMutation
    .input({
      auth: v.string(),
      buildId: v.id("activeBuilds"),
      endpoint: v.string(),
      organizationId: v.string(),
      p256dh: v.string(),
    })
    .returns(v.id("buildCollaborationPushSubscriptions"))
    .handler(async (ctx, args) => {
      const authorization = await authorizeActiveBuildCollaborationAccess(
        ctx,
        args
      );
      const endpoint = bounded(args.endpoint, "Push endpoint", 2048);
      const auth = bounded(args.auth, "Push auth key", 512);
      const p256dh = bounded(args.p256dh, "Push public key", 512);
      const now = Date.now();
      const existing = await ctx.db
        .query("buildCollaborationPushSubscriptions")
        .withIndex("by_organizationId_and_workosUserId_and_endpoint", (query) =>
          query
            .eq("organizationId", authorization.organizationId)
            .eq("workosUserId", authorization.viewer.subject)
            .eq("endpoint", endpoint)
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          auth,
          p256dh,
          revokedAt: undefined,
          state: "active",
          updatedAt: now,
        });
        return existing._id;
      }
      return await ctx.db.insert("buildCollaborationPushSubscriptions", {
        auth,
        createdAt: now,
        endpoint,
        organizationId: authorization.organizationId,
        p256dh,
        state: "active",
        updatedAt: now,
        workosUserId: authorization.viewer.subject,
      });
    })
    .public();

export const revokeMyBuildCollaborationPushSubscription = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    subscriptionId: v.id("buildCollaborationPushSubscriptions"),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const subscription = await ctx.db.get(args.subscriptionId);
    if (
      !subscription ||
      subscription.organizationId !== authorization.organizationId ||
      subscription.workosUserId !== authorization.viewer.subject
    ) {
      throw new Error("Push subscription is unavailable.");
    }
    const now = Date.now();
    await ctx.db.patch(subscription._id, {
      revokedAt: now,
      state: "revoked",
      updatedAt: now,
    });
    return null;
  })
  .public();

export const listMyBuildCollaborationExternalDeliveryActivity =
  authenticatedQuery
    .input({ organizationId: v.string() })
    .returns(
      v.array(
        v.object({
          _id: v.id("buildCollaborationExternalDeliveries"),
          attemptCount: v.number(),
          cadence: v.optional(deliveryCadenceValidator),
          channel: externalChannelValidator,
          createdAt: v.number(),
          safeError: v.optional(v.string()),
          scheduledFor: v.number(),
          status: v.union(
            v.literal("queued"),
            v.literal("dispatched"),
            v.literal("failed"),
            v.literal("sent"),
            v.literal("cancelled")
          ),
          updatedAt: v.number(),
        })
      )
    )
    .handler(async (ctx, args) => {
      const organizationId = args.organizationId.trim();
      const brokerage = await authorizeInboxOrganization(ctx, organizationId);
      const rows = await ctx.db
        .query("buildCollaborationExternalDeliveries")
        .withIndex(
          "by_organizationId_and_recipientWorkosUserId_and_createdAt",
          (query) =>
            query
              .eq("organizationId", organizationId)
              .eq("recipientWorkosUserId", ctx.viewer.subject)
        )
        .order("desc")
        .take(100);
      return rows
        .filter((row) => row.brokerageId === brokerage._id)
        .map((row) => ({
          _id: row._id,
          attemptCount: row.attemptCount,
          cadence: row.cadence,
          channel: row.channel,
          createdAt: row.createdAt,
          safeError: row.lastError,
          scheduledFor: row.scheduledFor,
          status: row.status,
          updatedAt: row.updatedAt,
        }));
    })
    .public();

function bounded(value: string, label: string, maximum: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`${label} must contain 1 to ${maximum} characters.`);
  }
  return normalized;
}
