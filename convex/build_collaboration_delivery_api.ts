import { v } from "convex/values";

import { internal } from "./_generated/api";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import { authorizeInboxOrganization } from "./build_collaboration_inbox";
import {
  addPushPreference,
  MAX_ACTIVE_PUSH_DEVICES_PER_BUILD,
  ownedActivePushSubscriptions,
  removePushPreferenceWhenNoDevices,
  removeStalePushBindings,
} from "./build_collaboration_push";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import type { Id } from "./types";

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
    const owner = await ctx.db
      .query("buildCollaborationPushEndpointOwners")
      .withIndex("by_endpoint", (query) => query.eq("endpoint", endpoint))
      .unique();
    const binding = await ctx.db
      .query("buildCollaborationPushEndpointBuildBindings")
      .withIndex("by_buildId_and_endpoint", (query) =>
        query.eq("buildId", authorization.build._id).eq("endpoint", endpoint)
      )
      .unique();
    return subscription?.state === "active" &&
      owner?.workosUserId === authorization.viewer.subject &&
      binding?.workosUserId === authorization.viewer.subject &&
      binding.subscriptionId === subscription._id &&
      binding.ownershipRevision === owner.revision &&
      subscription.ownershipRevision === owner.revision
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
      await removeStalePushBindings(ctx, {
        buildId: authorization.build._id,
        organizationId: authorization.organizationId,
        workosUserId: authorization.viewer.subject,
      });
      const activeDevices = await ownedActivePushSubscriptions(ctx, {
        buildId: authorization.build._id,
        organizationId: authorization.organizationId,
        workosUserId: authorization.viewer.subject,
      });
      const alreadyActive = activeDevices.some(
        (subscription) => subscription.endpoint === endpoint
      );
      if (
        !alreadyActive &&
        activeDevices.length >= MAX_ACTIVE_PUSH_DEVICES_PER_BUILD
      ) {
        throw new Error(
          `Push notifications support up to ${MAX_ACTIVE_PUSH_DEVICES_PER_BUILD} devices per Build.`
        );
      }
      const endpointOwner = await ctx.db
        .query("buildCollaborationPushEndpointOwners")
        .withIndex("by_endpoint", (query) => query.eq("endpoint", endpoint))
        .unique();
      const priorWorkosUserId =
        endpointOwner?.workosUserId === authorization.viewer.subject
          ? undefined
          : endpointOwner?.workosUserId;
      const ownershipRevision = endpointOwner
        ? endpointOwner.revision + (priorWorkosUserId ? 1 : 0)
        : 1;
      if (endpointOwner) {
        await ctx.db.patch(endpointOwner._id, {
          revision: ownershipRevision,
          updatedAt: now,
          workosUserId: authorization.viewer.subject,
        });
      } else {
        await ctx.db.insert("buildCollaborationPushEndpointOwners", {
          createdAt: now,
          endpoint,
          revision: 1,
          updatedAt: now,
          workosUserId: authorization.viewer.subject,
        });
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
      let subscriptionId: Id<"buildCollaborationPushSubscriptions">;
      if (existing) {
        await ctx.db.patch(existing._id, {
          auth,
          buildId: authorization.build._id,
          ownershipRevision,
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
            ownershipRevision,
            p256dh,
            state: "active",
            updatedAt: now,
            workosUserId: authorization.viewer.subject,
          }
        );
      }
      const buildBinding = await ctx.db
        .query("buildCollaborationPushEndpointBuildBindings")
        .withIndex("by_buildId_and_endpoint", (query) =>
          query.eq("buildId", authorization.build._id).eq("endpoint", endpoint)
        )
        .unique();
      const binding = {
        organizationId: authorization.organizationId,
        buildId: authorization.build._id,
        endpoint,
        workosUserId: authorization.viewer.subject,
        subscriptionId,
        ownershipRevision,
        updatedAt: now,
      };
      if (buildBinding) {
        await ctx.db.patch(buildBinding._id, binding);
      } else {
        await ctx.db.insert("buildCollaborationPushEndpointBuildBindings", {
          ...binding,
          createdAt: now,
        });
      }
      await addPushPreference(ctx, authorization, now);
      if (priorWorkosUserId) {
        await ctx.scheduler.runAfter(
          0,
          internal.build_collaboration_push_maintenance
            .cleanupTransferredBuildCollaborationPushEndpoint,
          {
            endpoint,
            expectedOwnershipRevision: ownershipRevision,
            priorWorkosUserId,
          }
        );
      }
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
    const owner = await ctx.db
      .query("buildCollaborationPushEndpointOwners")
      .withIndex("by_endpoint", (query) => query.eq("endpoint", endpoint))
      .unique();
    const binding = await ctx.db
      .query("buildCollaborationPushEndpointBuildBindings")
      .withIndex("by_buildId_and_endpoint", (query) =>
        query.eq("buildId", authorization.build._id).eq("endpoint", endpoint)
      )
      .unique();
    if (
      !subscription ||
      subscription.organizationId !== authorization.organizationId ||
      subscription.workosUserId !== authorization.viewer.subject ||
      subscription.buildId !== authorization.build._id ||
      owner?.workosUserId !== authorization.viewer.subject ||
      subscription.ownershipRevision !== owner.revision ||
      binding?.workosUserId !== authorization.viewer.subject ||
      binding.subscriptionId !== subscription._id ||
      binding.ownershipRevision !== owner.revision
    ) {
      throw new Error("Push subscription is unavailable.");
    }
    const now = Date.now();
    await ctx.db.patch(subscription._id, {
      revokedAt: now,
      state: "revoked",
      updatedAt: now,
    });
    await ctx.db.delete(binding._id);
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
