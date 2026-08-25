import type { Doc, MutationCtx, QueryCtx } from "../types";
import {
  MAX_COMMUNICATION_HISTORY,
  REMINDER_COOLDOWN_MS,
  quoteInvitationCommunicationProjectionValidator,
} from "./contracts";

export async function quoteInvitationCommunicationProjection(
  ctx: QueryCtx | MutationCtx,
  input: {
    invitation: Doc<"quoteRoundInvitations">;
    hasCurrentSubmission: boolean;
    now: number;
    responseDeadline?: number;
  }
) {
  const [intents, activeIntents] = await Promise.all([
    ctx.db
      .query("communicationIntents")
      .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
        query.eq("quoteRoundInvitationId", input.invitation._id)
      )
      .order("desc")
      .take(MAX_COMMUNICATION_HISTORY),
    ctx.db
      .query("communicationIntents")
      .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
        query.eq("quoteRoundInvitationId", input.invitation._id)
      )
      .filter((query) => query.neq(query.field("status"), "superseded"))
      .order("desc")
      .take(MAX_COMMUNICATION_HISTORY),
  ]);
  const latest = activeIntents[0];
  const recoveryIntent = activeIntents.find(
    (intent) => intent.status === "action_required"
  );
  const latestReminder = activeIntents.find(
    (intent) =>
      (intent.kind === "quote_invitation_reminder_manual" ||
        intent.kind === "quote_invitation_reminder_auto") &&
      intent.status !== "suppressed"
  );
  const cooldownUntil = latestReminder
    ? latestReminder.createdAt + REMINDER_COOLDOWN_MS
    : undefined;
  const reminderEligible = Boolean(
    input.invitation.participationState === "active" &&
      !input.hasCurrentSubmission &&
      input.responseDeadline &&
      input.responseDeadline > input.now &&
      (!cooldownUntil || cooldownUntil <= input.now)
  );
  const recoveryState = recoveryIntent
    ? "action_required"
    : activeIntents.some(
          (intent) =>
            intent.status === "retry_scheduled" ||
            intent.status === "dispatching"
        )
      ? "retrying"
      : "none";
  return {
    actionRequired: recoveryState === "action_required",
    attemptCount: intents.reduce(
      (total, intent) => total + intent.attemptCount,
      0
    ),
    cooldownUntil:
      cooldownUntil && cooldownUntil > input.now ? cooldownUntil : undefined,
    history: intents.map((intent) => ({
      createdAt: intent.createdAt,
      detail:
        intent.suppressionReason ??
        (intent.lastError || intent.actionRequiredReason
          ? "Delivery attempt failed."
          : undefined),
      kind: intent.kind,
      lastOutcomeAt: intent.lastOutcomeAt,
      status: intent.status,
    })),
    invitationId: input.invitation._id,
    latestOutcomeAt: latest?.lastOutcomeAt,
    latestStatus: latest?.status,
    recoveryState,
    recoveryIntentId: recoveryIntent?._id,
    reminderEligible,
  } as const;
}
