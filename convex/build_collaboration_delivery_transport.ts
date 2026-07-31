import { v } from "convex/values";

import { internal } from "./_generated/api";
import {
  BuildCollaborationDeliveryTransportError,
  sendBuildCollaborationExternalPayload,
} from "./build_collaboration_delivery_transport_provider";
import { internalAction } from "./fluent";
import type { ActionCtx, Id } from "./types";

export const processBuildCollaborationExternalDeliveries = internalAction
  .input({
    asOf: v.optional(v.number()),
    batchSize: v.optional(v.number()),
    now: v.optional(v.number()),
  })
  .returns(v.number())
  .handler(async (ctx, args): Promise<number> => {
    const outboxIds = await ctx.runMutation(
      internal.build_collaboration_delivery_maintenance
        .prepareDueBuildCollaborationExternalDeliveries,
      args
    );
    for (const eventOutboxId of outboxIds) {
      await dispatchExternalOutbox(ctx, eventOutboxId);
    }
    return outboxIds.length;
  })
  .internal();

export const dispatchBuildCollaborationExternalOutbox = internalAction
  .input({ eventOutboxId: v.id("eventOutbox") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    await dispatchExternalOutbox(ctx, args.eventOutboxId);
    return null;
  })
  .internal();

async function dispatchExternalOutbox(
  ctx: ActionCtx,
  eventOutboxId: Id<"eventOutbox">
) {
  const prepared = await ctx.runMutation(
    internal.build_collaboration_delivery_maintenance
      .prepareBuildCollaborationExternalOutbox,
    { eventOutboxId }
  );
  if (!prepared) {
    return;
  }
  try {
    const response = await sendBuildCollaborationExternalPayload({
      channel: prepared.channel,
      contact: prepared.contact,
      idempotencyKey: prepared.idempotencyKey,
      items: prepared.items,
      recipientWorkosUserId: prepared.recipientWorkosUserId,
    });
    await ctx.runMutation(
      internal.build_collaboration_delivery_maintenance
        .completeBuildCollaborationExternalDeliveryAttempt,
      {
        eventOutboxId,
        providerMessageId: response.providerMessageId,
        responseCode: response.responseCode,
        succeeded: true,
      }
    );
  } catch (error) {
    await ctx.runMutation(
      internal.build_collaboration_delivery_maintenance
        .completeBuildCollaborationExternalDeliveryAttempt,
      {
        error: safeDeliveryError(error),
        eventOutboxId,
        responseCode:
          error instanceof BuildCollaborationDeliveryTransportError
            ? error.responseCode
            : undefined,
        succeeded: false,
      }
    );
  }
}

function safeDeliveryError(error: unknown) {
  if (error instanceof BuildCollaborationDeliveryTransportError) {
    return error.message;
  }
  if (error instanceof Error && error.message.includes("not configured")) {
    return error.message;
  }
  return "External delivery failed.";
}
