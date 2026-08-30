import { v } from "convex/values";

export const DISPATCH_BATCH_SIZE = 40;
export const DISPATCH_LEASE_MS = 10 * 60 * 1000;
export const PROVIDER_RESERVATION_LEASE_MS = 2 * 60 * 1000;
export const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const POST_SEND_SUPPRESSION_MS = 12 * 60 * 60 * 1000;
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000] as const;
export const MAX_INVITATIONS_PER_ROUND = 100;
export const MAX_ROUNDS_PER_SWEEP = 500;
export const MAX_COMMUNICATION_HISTORY = 20;
export const MAX_DISPATCH_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
export const MAX_ACTIVE_PROVIDER_RESERVATIONS = 100;
export const PROVIDER_SUBMISSION_CANCELLED =
  "Communication provider submission was cancelled before dispatch.";
export const RETRYABLE_DISPATCH_ERROR_PATTERN =
  /(\b429\b|rate[_ -]?limit|concurrent[_ -]?idempotent|\b5\d\d\b|timeout|network)/i;
export const PERMANENT_DISPATCH_ERROR_PATTERN =
  /(not configured|api key|invalid|unauthori[sz]ed|forbidden|\b4\d\d\b)/i;

export const dispatchWorkValidator = v.object({
  attemptId: v.id("communicationAttempts"),
  idempotencyKey: v.string(),
  intentId: v.id("communicationIntents"),
  kind: v.string(),
  payloadSnapshot: v.string(),
  recipientEmailSnapshot: v.string(),
  recipientNameSnapshot: v.optional(v.string()),
  templateKey: v.string(),
});

export const quoteInvitationCommunicationProjectionValidator = v.object({
  actionRequired: v.boolean(),
  attemptCount: v.number(),
  cooldownUntil: v.optional(v.number()),
  history: v.array(
    v.object({
      createdAt: v.number(),
      detail: v.optional(v.string()),
      kind: v.string(),
      lastOutcomeAt: v.optional(v.number()),
      status: v.string(),
    })
  ),
  invitationId: v.id("quoteRoundInvitations"),
  latestOutcomeAt: v.optional(v.number()),
  latestStatus: v.optional(v.string()),
  recoveryState: v.union(
    v.literal("none"),
    v.literal("retrying"),
    v.literal("action_required")
  ),
  recoveryIntentId: v.optional(v.id("communicationIntents")),
  reminderEligible: v.boolean(),
});

/**
 * A bounded, identity-free communication projection for the ENG-397 register.
 * Recipient names/emails are deliberately absent so homeowners and other
 * read-only Build roles cannot infer recipient identities from delivery state.
 */
