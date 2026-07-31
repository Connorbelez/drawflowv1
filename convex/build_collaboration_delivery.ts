import { internal } from "./_generated/api";
import {
  externalDeliveryPlan,
  nextBuildCollaborationDigestAt,
} from "./build_collaboration_delivery_model";
import { rescheduleExistingExternalDelivery } from "./build_collaboration_delivery_reconciliation";
import type { BuildCollaborationNotificationKind } from "./build_collaboration_notifications";
import type { Id, MutationCtx } from "./types";

export async function enqueueBuildCollaborationExternalDeliveries(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    channels?: Array<"in_app" | "email" | "push">;
    digestCadence?: "daily" | "weekly" | "never";
    digestEnabled?: boolean;
    kind: BuildCollaborationNotificationKind;
    now: number;
    ordinaryMuted?: boolean;
    organizationId: string;
    recipientDeliveryId: Id<"recipientDeliveries">;
    recipientWorkosUserId: string;
  }
) {
  const canonical = await ctx.db.get(input.recipientDeliveryId);
  if (!canonical) {
    return;
  }
  const recipientParticipationPeriod =
    await currentRecipientParticipationPeriod(ctx, {
      buildId: input.buildId,
      recipientWorkosUserId: input.recipientWorkosUserId,
    });
  let queuedImmediateDelivery = false;
  const targets = externalDeliveryPlan(input);
  for (const target of targets) {
    const existing = await ctx.db
      .query("buildCollaborationExternalDeliveries")
      .withIndex("by_recipientDeliveryId_and_channel", (query) =>
        query
          .eq("recipientDeliveryId", input.recipientDeliveryId)
          .eq("channel", target.channel)
      )
      .unique();
    if (existing) {
      queuedImmediateDelivery ||= await rescheduleExistingExternalDelivery(
        ctx,
        existing,
        target,
        input.now
      );
      continue;
    }
    await ctx.db.insert("buildCollaborationExternalDeliveries", {
      attemptCount: 0,
      brokerageId: input.brokerageId,
      buildId: input.buildId,
      cadence: target.cadence,
      channel: target.channel,
      collaborationActionItemId: canonical.collaborationActionItemId,
      collaborationAssetId: canonical.collaborationAssetId,
      collaborationCommentId: canonical.collaborationCommentId,
      collaborationPostId: canonical.collaborationPostId,
      collaborationReferenceId: canonical.collaborationReferenceId,
      createdAt: input.now,
      dedupeKey: `build-collaboration-external:${input.recipientDeliveryId}:${target.channel}`,
      deliveryMode: target.cadence === "immediate" ? "immediate" : "digest",
      eventKind: input.kind,
      organizationId: input.organizationId,
      recipientDeliveryId: input.recipientDeliveryId,
      recipientParticipationPeriod,
      recipientWorkosUserId: input.recipientWorkosUserId,
      scheduledFor:
        target.cadence === "immediate"
          ? input.now
          : nextBuildCollaborationDigestAt(input.now, target.cadence),
      status: "queued",
      updatedAt: input.now,
    });
    queuedImmediateDelivery ||= target.cadence === "immediate";
  }
  if (queuedImmediateDelivery) {
    await ctx.scheduler.runAfter(
      0,
      internal.build_collaboration_delivery_transport
        .processBuildCollaborationExternalDeliveries,
      { asOf: input.now, batchSize: 100 }
    );
  }
}

async function currentRecipientParticipationPeriod(
  ctx: MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    recipientWorkosUserId: string;
  }
) {
  const participant = await ctx.db
    .query("buildParticipants")
    .withIndex("by_buildId_and_workosUserId", (query) =>
      query
        .eq("buildId", input.buildId)
        .eq("workosUserId", input.recipientWorkosUserId)
    )
    .order("desc")
    .first();
  return participant?.status === "active"
    ? participant.participationPeriod
    : undefined;
}
