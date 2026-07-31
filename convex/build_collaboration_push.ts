import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { reconcileBuildCollaborationExternalDeliveries } from "./build_collaboration_delivery_reconciliation";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

export const MAX_ACTIVE_PUSH_DEVICES_PER_BUILD = 20;

export async function addPushPreference(
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

export async function ownedActivePushSubscriptions(
  ctx: QueryCtx,
  identity: {
    buildId: Id<"activeBuilds">;
    organizationId: string;
    workosUserId: string;
  }
) {
  const subscriptions = await ctx.db
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
    .take(MAX_ACTIVE_PUSH_DEVICES_PER_BUILD);
  const owned: Doc<"buildCollaborationPushSubscriptions">[] = [];
  for (const subscription of subscriptions) {
    const owner = await ctx.db
      .query("buildCollaborationPushEndpointOwners")
      .withIndex("by_endpoint", (query) =>
        query.eq("endpoint", subscription.endpoint)
      )
      .unique();
    if (owner?.workosUserId === identity.workosUserId) {
      owned.push(subscription);
    }
  }
  return owned;
}

export async function removePushPreferenceWhenNoDevices(
  ctx: MutationCtx,
  identity: {
    buildId: Id<"activeBuilds">;
    organizationId: string;
    workosUserId: string;
  },
  now: number
) {
  if ((await ownedActivePushSubscriptions(ctx, identity)).length) {
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
