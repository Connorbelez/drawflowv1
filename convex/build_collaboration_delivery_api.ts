import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import { reconcileBuildCollaborationExternalDeliveries } from "./build_collaboration_delivery_reconciliation";
import { authorizeInboxOrganization } from "./build_collaboration_inbox";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import type { Id, MutationCtx } from "./types";

const MAX_ACTIVE_PUSH_DEVICES_PER_BUILD = 20;

const externalChannelValidator = v.union(v.literal("email"), v.literal("push"));
const deliveryCadenceValidator = v.union(
  v.literal("immediate"),
  v.literal("daily"),
  v.literal("weekly")
);

export const getMyBuildCollaborationPushSubscription = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    endpoint: v.string(),
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
    const endpoint = bounded(args.endpoint, "Push endpoint", 2048);
    const subscription = await ctx.db
      .query("buildCollaborationPushSubscriptions")
      .withIndex(
        "by_organizationId_and_workosUserId_and_buildId_and_endpoint",
        (query) =>
          query
            .eq("organizationId", authorization.organizationId)
            .eq("workosUserId", authorization.viewer.subject)
            .eq("buildId", authorization.build._id)
            .eq("endpoint", endpoint)
      )
      .unique();
    return subscription?.state === "active"
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
      const endpointOwners = await ctx.db
        .query("buildCollaborationPushSubscriptions")
        .withIndex("by_endpoint_and_state", (query) =>
          query.eq("endpoint", endpoint).eq("state", "active")
        )
        .collect();
      for (const owner of endpointOwners) {
        if (owner.workosUserId === authorization.viewer.subject) {
          continue;
        }
        await ctx.db.patch(owner._id, {
          revokedAt: now,
          state: "revoked",
          updatedAt: now,
        });
        if (owner.buildId) {
          await removePushPreferenceWhenNoDevices(
            ctx,
            {
              buildId: owner.buildId,
              organizationId: owner.organizationId,
              workosUserId: owner.workosUserId,
            },
            now
          );
        }
      }
      const existing = await ctx.db
        .query("buildCollaborationPushSubscriptions")
        .withIndex(
          "by_organizationId_and_workosUserId_and_buildId_and_endpoint",
          (query) =>
            query
              .eq("organizationId", authorization.organizationId)
              .eq("workosUserId", authorization.viewer.subject)
              .eq("buildId", authorization.build._id)
              .eq("endpoint", endpoint)
        )
        .unique();
      const activeDevices = await ctx.db
        .query("buildCollaborationPushSubscriptions")
        .withIndex(
          "by_organizationId_and_workosUserId_and_buildId_and_state",
          (query) =>
            query
              .eq("organizationId", authorization.organizationId)
              .eq("workosUserId", authorization.viewer.subject)
              .eq("buildId", authorization.build._id)
              .eq("state", "active")
        )
        .take(MAX_ACTIVE_PUSH_DEVICES_PER_BUILD + 1);
      if (
        existing?.state !== "active" &&
        activeDevices.length >= MAX_ACTIVE_PUSH_DEVICES_PER_BUILD
      ) {
        throw new Error(
          `Push notifications support up to ${MAX_ACTIVE_PUSH_DEVICES_PER_BUILD} devices per Build.`
        );
      }
      let subscriptionId: Id<"buildCollaborationPushSubscriptions">;
      if (existing) {
        await ctx.db.patch(existing._id, {
          auth,
          buildId: authorization.build._id,
          p256dh,
          revokedAt: undefined,
          state: "active",
          updatedAt: now,
        });
        subscriptionId = existing._id;
      } else {
        subscriptionId = await ctx.db.insert(
          "buildCollaborationPushSubscriptions",
          {
            auth,
            buildId: authorization.build._id,
            createdAt: now,
            endpoint,
            organizationId: authorization.organizationId,
            p256dh,
            state: "active",
            updatedAt: now,
            workosUserId: authorization.viewer.subject,
          }
        );
      }
      await addPushPreference(ctx, authorization, now);
      return subscriptionId;
    })
    .public();

export const revokeMyBuildCollaborationPushSubscription = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    endpoint: v.string(),
    organizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const endpoint = bounded(args.endpoint, "Push endpoint", 2048);
    const subscription = await ctx.db
      .query("buildCollaborationPushSubscriptions")
      .withIndex(
        "by_organizationId_and_workosUserId_and_buildId_and_endpoint",
        (query) =>
          query
            .eq("organizationId", authorization.organizationId)
            .eq("workosUserId", authorization.viewer.subject)
            .eq("buildId", authorization.build._id)
            .eq("endpoint", endpoint)
      )
      .unique();
    if (
      !subscription ||
      subscription.organizationId !== authorization.organizationId ||
      subscription.workosUserId !== authorization.viewer.subject ||
      subscription.buildId !== authorization.build._id
    ) {
      throw new Error("Push subscription is unavailable.");
    }
    const now = Date.now();
    await ctx.db.patch(subscription._id, {
      revokedAt: now,
      state: "revoked",
      updatedAt: now,
    });
    await removePushPreferenceWhenNoDevices(
      ctx,
      {
        buildId: authorization.build._id,
        organizationId: authorization.organizationId,
        workosUserId: authorization.viewer.subject,
      },
      now
    );
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

async function addPushPreference(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  now: number
) {
  const existing = await ctx.db
    .query("buildCollaborationNotificationPreferences")
    .withIndex("by_buildId_and_workosUserId", (query) =>
      query
        .eq("buildId", authorization.build._id)
        .eq("workosUserId", authorization.viewer.subject)
    )
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      channels: [...new Set([...existing.channels, "push" as const])],
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert("buildCollaborationNotificationPreferences", {
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    channels: ["in_app", "email", "push"],
    createdAt: now,
    digestCadence: "daily",
    digestEnabled: true,
    ordinaryMuted: false,
    organizationId: authorization.organizationId,
    updatedAt: now,
    workosUserId: authorization.viewer.subject,
  });
}

async function removePushPreferenceWhenNoDevices(
  ctx: MutationCtx,
  identity: {
    buildId: Id<"activeBuilds">;
    organizationId: string;
    workosUserId: string;
  },
  now: number
) {
  const remaining = await ctx.db
    .query("buildCollaborationPushSubscriptions")
    .withIndex(
      "by_organizationId_and_workosUserId_and_buildId_and_state",
      (query) =>
        query
          .eq("organizationId", identity.organizationId)
          .eq("workosUserId", identity.workosUserId)
          .eq("buildId", identity.buildId)
          .eq("state", "active")
    )
    .first();
  if (remaining) {
    return;
  }
  const build = await ctx.db.get(identity.buildId);
  if (!build || build.organizationId !== identity.organizationId) {
    return;
  }
  const preference = await ctx.db
    .query("buildCollaborationNotificationPreferences")
    .withIndex("by_buildId_and_workosUserId", (query) =>
      query
        .eq("buildId", identity.buildId)
        .eq("workosUserId", identity.workosUserId)
    )
    .first();
  if (!preference?.channels.includes("push")) {
    return;
  }
  const channels = preference.channels.filter((channel) => channel !== "push");
  await ctx.db.patch(preference._id, { channels, updatedAt: now });
  await reconcileBuildCollaborationExternalDeliveries(ctx, {
    brokerageId: build.brokerageId,
    buildId: build._id,
    channels,
    digestCadence: preference.digestCadence,
    digestEnabled: preference.digestEnabled,
    now,
    ordinaryMuted: preference.ordinaryMuted,
    organizationId: identity.organizationId,
    recipientWorkosUserId: identity.workosUserId,
  });
}
