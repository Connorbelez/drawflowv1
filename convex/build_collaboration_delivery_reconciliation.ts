import { v } from "convex/values";

import { internal } from "./_generated/api";
import { cancelBuildCollaborationExternalDelivery } from "./build_collaboration_delivery_maintenance";
import {
  externalDeliveryPlan,
  nextBuildCollaborationDigestAt,
} from "./build_collaboration_delivery_model";
import { internalMutation } from "./fluent";
import type { Doc, Id, MutationCtx } from "./types";

const DELIVERY_MAINTENANCE_BATCH_SIZE = 200;
const unsentDeliveryStatuses = ["queued", "failed", "dispatched"] as const;
type UnsentDeliveryStatus = (typeof unsentDeliveryStatuses)[number];

export async function rescheduleExistingExternalDelivery(
  ctx: MutationCtx,
  existing: Doc<"buildCollaborationExternalDeliveries">,
  target: ReturnType<typeof externalDeliveryPlan>[number],
  now: number
) {
  if (existing.status === "sent") {
    return false;
  }
  if (existing.status === "dispatched" || existing.batchId) {
    await cancelBuildCollaborationExternalDelivery(
      ctx,
      existing,
      now,
      "notification_preference_changed"
    );
  }
  await ctx.db.patch(existing._id, {
    batchId: undefined,
    batchKey: undefined,
    batchRevision: undefined,
    cadence: target.cadence,
    cancellationReason: undefined,
    cancelledAt: undefined,
    deliveryMode: target.cadence === "immediate" ? "immediate" : "digest",
    lastError: undefined,
    leaseExpiresAt: undefined,
    providerOutboxId: undefined,
    renderedItemSnapshot: undefined,
    scheduledFor:
      target.cadence === "immediate"
        ? now
        : nextBuildCollaborationDigestAt(now, target.cadence),
    status: "queued",
    updatedAt: now,
  });
  return target.cadence === "immediate";
}

export async function reconcileBuildCollaborationExternalDeliveries(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    channels: Array<"in_app" | "email" | "push">;
    digestCadence: "daily" | "weekly" | "never";
    digestEnabled: boolean;
    now: number;
    ordinaryMuted: boolean;
    organizationId: string;
    recipientWorkosUserId: string;
  }
) {
  for (const status of unsentDeliveryStatuses) {
    await reconcileExternalDeliveryPage(ctx, input, status, null);
  }
}

export async function cancelQueuedBuildCollaborationExternalDeliveries(
  ctx: MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    cancellationReason: string;
    createdAtThrough?: number;
    now: number;
    participationPeriod?: number;
    recipientWorkosUserId: string;
  }
) {
  let complete = true;
  for (const status of unsentDeliveryStatuses) {
    complete =
      (await cancelExternalDeliveryPage(ctx, input, status, null, false)) &&
      complete;
  }
  return { complete };
}

async function reconcileExternalDeliveryPage(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    channels: Array<"in_app" | "email" | "push">;
    digestCadence: "daily" | "weekly" | "never";
    digestEnabled: boolean;
    now: number;
    ordinaryMuted: boolean;
    organizationId: string;
    recipientWorkosUserId: string;
  },
  status: UnsentDeliveryStatus,
  cursor: string | null
): Promise<void> {
  const page = await ctx.db
    .query("buildCollaborationExternalDeliveries")
    .withIndex("by_buildId_and_recipientWorkosUserId_and_status", (query) =>
      query
        .eq("buildId", input.buildId)
        .eq("recipientWorkosUserId", input.recipientWorkosUserId)
        .eq("status", status)
    )
    .paginate({ cursor, numItems: DELIVERY_MAINTENANCE_BATCH_SIZE });
  for (const external of page.page) {
    if (
      external.organizationId !== input.organizationId ||
      external.brokerageId !== input.brokerageId
    ) {
      continue;
    }
    const target = externalDeliveryPlan({
      channels: input.channels,
      digestCadence: input.digestCadence,
      digestEnabled: input.digestEnabled,
      kind: external.eventKind,
      ordinaryMuted: input.ordinaryMuted,
    }).find((candidate) => candidate.channel === external.channel);
    if (!target) {
      await cancelBuildCollaborationExternalDelivery(
        ctx,
        external,
        input.now,
        "notification_preference_changed"
      );
      continue;
    }
    await rescheduleExistingExternalDelivery(ctx, external, target, input.now);
  }
  if (!page.isDone) {
    await ctx.scheduler.runAfter(
      0,
      internal.build_collaboration_delivery_reconciliation
        .continueBuildCollaborationExternalDeliveryReconciliation,
      {
        buildId: input.buildId,
        cursor: page.continueCursor,
        organizationId: input.organizationId,
        recipientWorkosUserId: input.recipientWorkosUserId,
        status,
      }
    );
  }
}

async function cancelExternalDeliveryPage(
  ctx: MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    cancellationReason: string;
    createdAtThrough?: number;
    now: number;
    participationPeriod?: number;
    recipientWorkosUserId: string;
  },
  status: UnsentDeliveryStatus,
  cursor: string | null,
  scheduleContinuation = true
): Promise<boolean> {
  const deliveryQuery = ctx.db
    .query("buildCollaborationExternalDeliveries")
    .withIndex(
      "by_buildId_and_recipientWorkosUserId_and_status_and_createdAt",
      (query) => {
        const scoped = query
          .eq("buildId", input.buildId)
          .eq("recipientWorkosUserId", input.recipientWorkosUserId)
          .eq("status", status);
        return input.createdAtThrough === undefined
          ? scoped
          : scoped.lte("createdAt", input.createdAtThrough);
      }
    );
  const page = await deliveryQuery.paginate({
    cursor,
    numItems: DELIVERY_MAINTENANCE_BATCH_SIZE,
  });
  for (const external of page.page) {
    if (
      input.createdAtThrough === undefined &&
      input.participationPeriod !== undefined &&
      external.recipientParticipationPeriod !== input.participationPeriod
    ) {
      continue;
    }
    await cancelBuildCollaborationExternalDelivery(
      ctx,
      external,
      input.now,
      input.cancellationReason
    );
  }
  if (!page.isDone && scheduleContinuation) {
    await ctx.scheduler.runAfter(
      0,
      internal.build_collaboration_delivery_reconciliation
        .continueBuildCollaborationExternalDeliveryCancellation,
      {
        buildId: input.buildId,
        cancellationReason: input.cancellationReason,
        createdAtThrough: input.createdAtThrough,
        cursor: page.continueCursor,
        recipientWorkosUserId: input.recipientWorkosUserId,
        participationPeriod: input.participationPeriod,
        status,
      }
    );
  }
  return page.isDone;
}

const unsentDeliveryStatusValidator = v.union(
  v.literal("queued"),
  v.literal("failed"),
  v.literal("dispatched")
);

export const continueBuildCollaborationExternalDeliveryReconciliation =
  internalMutation
    .input({
      buildId: v.id("activeBuilds"),
      cursor: v.union(v.string(), v.null()),
      organizationId: v.string(),
      recipientWorkosUserId: v.string(),
      status: unsentDeliveryStatusValidator,
    })
    .returns(v.null())
    .handler(async (ctx, args) => {
      const build = await ctx.db.get(args.buildId);
      if (!build || build.organizationId !== args.organizationId) {
        return null;
      }
      const preference = await ctx.db
        .query("buildCollaborationNotificationPreferences")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query
            .eq("buildId", build._id)
            .eq("workosUserId", args.recipientWorkosUserId)
        )
        .first();
      await reconcileExternalDeliveryPage(
        ctx,
        {
          brokerageId: build.brokerageId,
          buildId: build._id,
          channels: preference?.channels ?? ["in_app", "email"],
          digestCadence: preference?.digestCadence ?? "daily",
          digestEnabled: preference?.digestEnabled ?? true,
          now: Date.now(),
          ordinaryMuted: preference?.ordinaryMuted ?? false,
          organizationId: build.organizationId,
          recipientWorkosUserId: args.recipientWorkosUserId,
        },
        args.status,
        args.cursor
      );
      return null;
    })
    .internal();

export const continueBuildCollaborationExternalDeliveryCancellation =
  internalMutation
    .input({
      buildId: v.id("activeBuilds"),
      cancellationReason: v.string(),
      createdAtThrough: v.optional(v.number()),
      cursor: v.union(v.string(), v.null()),
      recipientWorkosUserId: v.string(),
      participationPeriod: v.optional(v.number()),
      status: unsentDeliveryStatusValidator,
    })
    .returns(v.null())
    .handler(async (ctx, args) => {
      await cancelExternalDeliveryPage(
        ctx,
        {
          buildId: args.buildId,
          cancellationReason: args.cancellationReason,
          createdAtThrough: args.createdAtThrough,
          now: Date.now(),
          participationPeriod: args.participationPeriod,
          recipientWorkosUserId: args.recipientWorkosUserId,
        },
        args.status,
        args.cursor,
        true
      );
      return null;
    })
    .internal();
