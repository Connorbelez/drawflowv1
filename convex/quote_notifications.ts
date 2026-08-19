import { ConvexError, v } from "convex/values";
import { Resend as ResendApi } from "resend";

import { internal } from "./_generated/api";
import { authorizeActiveBuildAccess } from "./activeBuildAccess";
import {
  administrativeOverrideInputFields,
  appendGovernedAuditEvent,
  requiredAdministrativeReason,
} from "./administrative_override_policy";
import { authenticatedMutation } from "./authz";
import { isOrganizationInRestrictedArchive } from "./data_retention";
import {
  deriveCommunicationSecret,
  enqueueCommunicationIntent,
  requiredSender,
  resendClient,
} from "./email_transport";
import { internalAction, internalMutation, internalQuery } from "./fluent";
import { authorizeQuoteAdministrativeRecovery } from "./quote_authoring_access";
import {
  createInitialQuoteInvitationCredentialAndDispatch,
  defaultQuoteInvitationAccessExpiry,
  quoteInvitationUrl,
  resolveInvitationScope,
} from "./quote_invitation_access";
import { lenderPortalCommunicationSuppressionReason } from "./lender_portal_notifications";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const DISPATCH_BATCH_SIZE = 40;
const DISPATCH_LEASE_MS = 10 * 60 * 1000;
const PROVIDER_RESERVATION_LEASE_MS = 2 * 60 * 1000;
const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const POST_SEND_SUPPRESSION_MS = 12 * 60 * 60 * 1000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000] as const;
const MAX_INVITATIONS_PER_ROUND = 100;
const MAX_ROUNDS_PER_SWEEP = 500;
const MAX_COMMUNICATION_HISTORY = 20;
const MAX_DISPATCH_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const MAX_ACTIVE_PROVIDER_RESERVATIONS = 100;
const PROVIDER_SUBMISSION_CANCELLED =
  "Communication provider submission was cancelled before dispatch.";
const RETRYABLE_DISPATCH_ERROR_PATTERN =
  /(\b429\b|rate[_ -]?limit|concurrent[_ -]?idempotent|\b5\d\d\b|timeout|network)/i;
const PERMANENT_DISPATCH_ERROR_PATTERN =
  /(not configured|api key|invalid|unauthori[sz]ed|forbidden|\b4\d\d\b)/i;

const dispatchWorkValidator = v.object({
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

export const retryCommunicationDelivery = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    buildId: v.id("activeBuilds"),
    communicationIntentId: v.id("communicationIntents"),
    idempotencyKey: v.string(),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      communicationIntentId: v.id("communicationIntents"),
      replayed: v.boolean(),
      status: v.string(),
    })
  )
  .handler(async (ctx, args) => {
    const reason = requiredAdministrativeReason(
      args.reason,
      "A delivery retry reason"
    );
    const idempotencyKey = args.idempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) {
      throw new ConvexError(
        "Delivery retry idempotency key must be 1 to 200 characters."
      );
    }
    const baseAuthorization = await authorizeActiveBuildAccess(ctx, {
      buildId: args.buildId,
      organizationId: args.workosOrganizationId,
    });
    const { authorization, breakGlass } =
      await authorizeQuoteAdministrativeRecovery(ctx, baseAuthorization, {
        administrativeCapacity: args.administrativeCapacity,
        breakGlassConfirmed: args.breakGlassConfirmed,
        reason,
      });
    const source = await ctx.db.get(args.communicationIntentId);
    if (
      !source ||
      source.organizationId !== authorization.organizationId ||
      source.brokerageId !== authorization.brokerage._id ||
      source.buildId !== authorization.build._id
    ) {
      throw new ConvexError("Communication delivery is unavailable.");
    }
    const retryKey = `manual-delivery-retry:${source._id}:${idempotencyKey}`;
    const replay = await ctx.db
      .query("communicationIntents")
      .withIndex("by_organizationId_and_idempotencyKey", (query) =>
        query
          .eq("organizationId", authorization.organizationId)
          .eq("idempotencyKey", retryKey)
      )
      .unique();
    if (replay) {
      return {
        communicationIntentId: replay._id,
        replayed: true,
        status: replay.status,
      };
    }
    if (source.status !== "action_required") {
      throw new ConvexError(
        "Only an action-required communication delivery may be retried manually."
      );
    }
    if (source.quoteInvitationAccessCredentialId) {
      const credential = await ctx.db.get(
        source.quoteInvitationAccessCredentialId
      );
      if (
        !credential ||
        credential.organizationId !== authorization.organizationId ||
        credential.buildId !== authorization.build._id ||
        credential.state !== "active" ||
        credential.accessExpiresAt <= Date.now()
      ) {
        throw new ConvexError(
          "Quote Invitation access must be rotated before retrying this delivery."
        );
      }
    }
    const now = Date.now();
    const latestAttempt = await ctx.db
      .query("communicationAttempts")
      .withIndex("by_communicationIntentId_and_attemptNumber", (query) =>
        query.eq("communicationIntentId", source._id)
      )
      .order("desc")
      .first();
    const retryIntentId = await enqueueCommunicationIntent(ctx, {
      brokerageId: source.brokerageId,
      buildId: source.buildId,
      idempotencyKey: retryKey,
      kind: source.kind,
      nextAttemptAt: now,
      organizationId: source.organizationId,
      payloadSnapshot: source.payloadSnapshot,
      quoteInvitationAccessCredentialId:
        source.quoteInvitationAccessCredentialId,
      quotePackageRevisionId: source.quotePackageRevisionId,
      quoteRoundId: source.quoteRoundId,
      quoteRoundInvitationId: source.quoteRoundInvitationId,
      recipientEmailSnapshot: source.recipientEmailSnapshot,
      recipientNameSnapshot: source.recipientNameSnapshot,
      relatedEntityId: source.relatedEntityId,
      relatedEntityType: source.relatedEntityType,
      templateKey: source.templateKey,
    });
    await ctx.db.patch(source._id, {
      status: "superseded",
      supersededByCommunicationIntentId: retryIntentId,
      updatedAt: now,
    });
    const round = source.quoteRoundId
      ? await ctx.db.get(source.quoteRoundId)
      : null;
    const packageRevision = source.quotePackageRevisionId
      ? await ctx.db.get(source.quotePackageRevisionId)
      : null;
    await appendGovernedAuditEvent(ctx, authorization, {
      breakGlass,
      command: "retryCommunicationDelivery",
      drawFlowCorrelationId: String(retryIntentId),
      entityId: String(source._id),
      entityType: "communicationIntent",
      eventType: "communication.delivery_retry_requested",
      newState: {
        attemptCount: 0,
        retryCommunicationIntentId: String(retryIntentId),
        status: "pending",
      },
      now,
      overrideKind: "delivery_retry",
      priorState: {
        attemptCount: source.attemptCount,
        status: source.status,
      },
      providerCorrelationId: latestAttempt?.providerResendEmailId,
      reason,
      targetRevisions: [
        {
          entityId: String(source._id),
          entityType: "communicationIntent",
        },
        ...(round
          ? [
              {
                entityId: String(round._id),
                entityType: "quoteRound",
                revision: round.revision,
              },
            ]
          : []),
        ...(packageRevision
          ? [
              {
                entityId: String(packageRevision._id),
                entityType: "quotePackageRevision",
                revision: packageRevision.revision,
              },
            ]
          : []),
      ],
    });
    return {
      communicationIntentId: retryIntentId,
      replayed: false,
      status: "pending" as const,
    };
  })
  .public();

export const listDueCommunicationIntentIds = internalQuery
  .input({ now: v.number(), limit: v.number() })
  .returns(v.array(v.id("communicationIntents")))
  .handler(async (ctx, args) => {
    const limit = Math.max(1, Math.min(DISPATCH_BATCH_SIZE, args.limit));
    const [pending, retrying, dispatching] = await Promise.all([
      ctx.db
        .query("communicationIntents")
        .withIndex("by_status_and_nextAttemptAt", (query) =>
          query.eq("status", "pending").lte("nextAttemptAt", args.now)
        )
        .take(limit),
      ctx.db
        .query("communicationIntents")
        .withIndex("by_status_and_nextAttemptAt", (query) =>
          query.eq("status", "retry_scheduled").lte("nextAttemptAt", args.now)
        )
        .take(limit),
      ctx.db
        .query("communicationIntents")
        .withIndex("by_status_and_nextAttemptAt", (query) =>
          query.eq("status", "dispatching").lte("nextAttemptAt", args.now)
        )
        .take(limit),
    ]);
    return [
      ...new Set(
        [...pending, ...retrying, ...dispatching].map((row) => row._id)
      ),
    ].slice(0, limit);
  })
  .internal();

export const claimCommunicationIntent = internalMutation
  .input({ intentId: v.id("communicationIntents"), now: v.number() })
  .returns(v.union(dispatchWorkValidator, v.null()))
  .handler(async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent) {
      return null;
    }
    if (
      (intent.status !== "pending" &&
        intent.status !== "retry_scheduled" &&
        intent.status !== "dispatching") ||
      intent.nextAttemptAt > args.now
    ) {
      return null;
    }
    const latestAttempt = await ctx.db
      .query("communicationAttempts")
      .withIndex("by_communicationIntentId_and_attemptNumber", (query) =>
        query.eq("communicationIntentId", intent._id)
      )
      .order("desc")
      .first();
    if (await isOrganizationInRestrictedArchive(ctx, intent.organizationId)) {
      await cancelCommunicationForRestrictedArchive(
        ctx,
        intent,
        latestAttempt,
        args.now
      );
      return null;
    }
    const lenderPortalSuppressionReason =
      await lenderPortalCommunicationSuppressionReason(ctx, intent);
    if (lenderPortalSuppressionReason) {
      await suppressStaleLenderPortalIntent(
        ctx,
        intent,
        latestAttempt,
        lenderPortalSuppressionReason,
        args.now,
      );
      return null;
    }
    if (intent.status === "dispatching" && latestAttempt) {
      await ctx.db.patch(latestAttempt._id, {
        finishedAt: args.now,
        safeError: "Dispatch lease expired before completion.",
        state: "abandoned",
        updatedAt: args.now,
      });
    }
    const attemptNumber = intent.attemptCount + 1;
    if (attemptNumber > MAX_DISPATCH_ATTEMPTS) {
      const reason =
        intent.status === "dispatching"
          ? "Dispatch lease expired after the final allowed attempt."
          : "Communication retry budget is exhausted.";
      const eventFingerprint = `dispatch-budget-exhausted:${intent._id}:${intent.attemptCount}`;
      const existingOutcome = await ctx.db
        .query("communicationOutcomes")
        .withIndex("by_eventFingerprint", (query) =>
          query.eq("eventFingerprint", eventFingerprint)
        )
        .unique();
      await ctx.db.patch(intent._id, {
        actionRequiredReason: reason,
        lastError: reason,
        lastOutcomeAt: args.now,
        nextAttemptAt: args.now + 24 * 60 * 60 * 1000,
        status: "action_required",
        updatedAt: args.now,
      });
      if (!existingOutcome) {
        await ctx.db.insert("communicationOutcomes", {
          brokerageId: intent.brokerageId,
          buildId: intent.buildId,
          communicationAttemptId: latestAttempt?._id,
          communicationIntentId: intent._id,
          eventFingerprint,
          organizationId: intent.organizationId,
          outcomeType: "action_required",
          precedence: 100,
          providerCreatedAt: args.now,
          receivedAt: args.now,
          safeDetail: reason,
        });
      }
      return null;
    }
    const attemptId = await ctx.db.insert("communicationAttempts", {
      attemptNumber,
      brokerageId: intent.brokerageId,
      buildId: intent.buildId,
      communicationIntentId: intent._id,
      createdAt: args.now,
      startedAt: args.now,
      state: "claimed",
      updatedAt: args.now,
      organizationId: intent.organizationId,
    });
    await ctx.db.patch(intent._id, {
      attemptCount: attemptNumber,
      lastAttemptAt: args.now,
      nextAttemptAt: args.now + DISPATCH_LEASE_MS,
      status: "dispatching",
      updatedAt: args.now,
    });
    return {
      attemptId,
      idempotencyKey: intent.idempotencyKey,
      intentId: intent._id,
      kind: intent.kind,
      payloadSnapshot: intent.payloadSnapshot,
      recipientEmailSnapshot: intent.recipientEmailSnapshot,
      recipientNameSnapshot: intent.recipientNameSnapshot,
      templateKey: intent.templateKey,
    };
  })
  .internal();

async function suppressStaleLenderPortalIntent(
  ctx: MutationCtx,
  intent: Doc<"communicationIntents">,
  attempt: Doc<"communicationAttempts"> | null,
  reason: string,
  now: number,
) {
  const eventFingerprint = `dispatch-suppressed:${String(intent._id)}`;
  const existingOutcome = await ctx.db
    .query("communicationOutcomes")
    .withIndex("by_eventFingerprint", (query) =>
      query.eq("eventFingerprint", eventFingerprint),
    )
    .unique();
  if (attempt?.state === "claimed") {
    await ctx.db.patch(attempt._id, {
      finishedAt: now,
      safeError: reason,
      state: "abandoned",
      updatedAt: now,
    });
  }
  await ctx.db.patch(intent._id, {
    lastOutcomeAt: now,
    nextAttemptAt: now + 24 * 60 * 60 * 1000,
    status: "suppressed",
    suppressionReason: reason,
    updatedAt: now,
  });
  if (!existingOutcome) {
    await ctx.db.insert("communicationOutcomes", {
      brokerageId: intent.brokerageId,
      buildId: intent.buildId,
      communicationAttemptId: attempt?._id,
      communicationIntentId: intent._id,
      eventFingerprint,
      organizationId: intent.organizationId,
      outcomeType: "dispatch_suppressed",
      precedence: 100,
      providerCreatedAt: now,
      receivedAt: now,
      safeDetail: reason,
    });
  }
}

export const authorizeCommunicationProviderSubmission = internalMutation
  .input({
    attemptId: v.id("communicationAttempts"),
    intentId: v.id("communicationIntents"),
    now: v.number(),
  })
  .returns(v.boolean())
  .handler(async (ctx, args) => {
    const [intent, attempt] = await Promise.all([
      ctx.db.get(args.intentId),
      ctx.db.get(args.attemptId),
    ]);
    if (
      !(intent && attempt) ||
      attempt.communicationIntentId !== intent._id ||
      attempt.state !== "claimed" ||
      intent.status !== "dispatching"
    ) {
      return false;
    }
    if (await isOrganizationInRestrictedArchive(ctx, intent.organizationId)) {
      await cancelCommunicationForRestrictedArchive(
        ctx,
        intent,
        attempt,
        args.now
      );
      return false;
    }
    const lenderPortalSuppressionReason =
      await lenderPortalCommunicationSuppressionReason(ctx, intent);
    if (lenderPortalSuppressionReason) {
      await suppressStaleLenderPortalIntent(
        ctx,
        intent,
        attempt,
        lenderPortalSuppressionReason,
        args.now,
      );
      return false;
    }
    const activeReservations = await ctx.db
      .query("communicationProviderReservations")
      .withIndex("by_organizationId_and_state_and_leaseExpiresAt", (query) =>
        query.eq("organizationId", intent.organizationId).eq("state", "active")
      )
      .take(MAX_ACTIVE_PROVIDER_RESERVATIONS + 1);
    if (activeReservations.length > MAX_ACTIVE_PROVIDER_RESERVATIONS) {
      return false;
    }
    for (const reservation of activeReservations) {
      if (
        reservation.communicationAttemptId === attempt._id &&
        reservation.leaseExpiresAt > args.now
      ) {
        return true;
      }
      if (reservation.leaseExpiresAt > args.now) {
        return false;
      }
      await ctx.db.patch(reservation._id, {
        releasedAt: args.now,
        state: "expired",
        updatedAt: args.now,
      });
      const expiredAttempt = await ctx.db.get(
        reservation.communicationAttemptId
      );
      if (expiredAttempt?.state === "claimed") {
        await ctx.db.patch(expiredAttempt._id, {
          finishedAt: args.now,
          safeError: "Provider submission reservation lease expired.",
          state: "abandoned",
          updatedAt: args.now,
        });
      }
    }
    await ctx.db.insert("communicationProviderReservations", {
      communicationAttemptId: attempt._id,
      communicationIntentId: intent._id,
      createdAt: args.now,
      leaseExpiresAt: args.now + PROVIDER_RESERVATION_LEASE_MS,
      organizationId: intent.organizationId,
      state: "active",
      updatedAt: args.now,
    });
    return true;
  })
  .internal();

export const releaseCommunicationProviderReservation = internalMutation
  .input({ attemptId: v.id("communicationAttempts"), now: v.number() })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const reservations = await ctx.db
      .query("communicationProviderReservations")
      .withIndex("by_communicationAttemptId", (query) =>
        query.eq("communicationAttemptId", args.attemptId)
      )
      .collect();
    for (const reservation of reservations) {
      if (reservation.state === "active") {
        await ctx.db.patch(reservation._id, {
          releasedAt: args.now,
          state: "released",
          updatedAt: args.now,
        });
      }
    }
    return null;
  })
  .internal();

export const recordCommunicationDispatchSuccess = internalMutation
  .input({
    attemptId: v.id("communicationAttempts"),
    intentId: v.id("communicationIntents"),
    providerResendEmailId: v.string(),
    sender: v.string(),
    now: v.number(),
  })
  .returns(v.id("emailMessages"))
  .handler(async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    const attempt = await ctx.db.get(args.attemptId);
    if (!(intent && attempt) || attempt.communicationIntentId !== intent._id) {
      throw new ConvexError("Communication dispatch attempt is unavailable.");
    }
    const existing = await ctx.db
      .query("emailMessages")
      .withIndex("by_communicationIntentId_and_createdAt", (query) =>
        query.eq("communicationIntentId", intent._id)
      )
      .filter((query) =>
        query.eq(query.field("communicationAttemptId"), attempt._id)
      )
      .first();
    if (existing) {
      return existing._id;
    }
    const emailMessageId = await ctx.db.insert("emailMessages", {
      brokerageId: intent.brokerageId,
      buildId: intent.buildId,
      communicationAttemptId: attempt._id,
      communicationIntentId: intent._id,
      createdAt: args.now,
      idempotencyKey: intent.idempotencyKey,
      organizationId: intent.organizationId,
      recipientEmail: intent.recipientEmailSnapshot,
      relatedEntityId: intent.relatedEntityId,
      relatedEntityType: intent.relatedEntityType,
      resendEmailId: args.providerResendEmailId,
      sender: args.sender,
      status: "queued",
      subject: subjectForIntent(intent),
      updatedAt: args.now,
    });
    if (intent.quoteInvitationAccessCredentialId) {
      const credential = await ctx.db.get(
        intent.quoteInvitationAccessCredentialId
      );
      if (
        credential &&
        credential.organizationId === intent.organizationId &&
        credential.buildId === intent.buildId
      ) {
        await ctx.db.patch(credential._id, {
          deliveryEmailMessageId: emailMessageId,
          updatedAt: args.now,
        });
      }
    }
    await ctx.db.patch(attempt._id, {
      finishedAt: args.now,
      providerEmailMessageId: emailMessageId,
      providerResendEmailId: args.providerResendEmailId,
      state: "enqueued",
      updatedAt: args.now,
    });
    await ctx.db.patch(intent._id, {
      lastError: undefined,
      lastOutcomeAt: args.now,
      nextAttemptAt: args.now + 24 * 60 * 60 * 1000,
      providerEmailMessageId: emailMessageId,
      status: "sent",
      updatedAt: args.now,
    });
    await ctx.db.insert("communicationOutcomes", {
      brokerageId: intent.brokerageId,
      buildId: intent.buildId,
      communicationAttemptId: attempt._id,
      communicationIntentId: intent._id,
      eventFingerprint: `dispatch:${intent._id}:${attempt._id}`,
      outcomeType: "dispatch_queued",
      precedence: 10,
      providerCreatedAt: args.now,
      providerResendEmailId: args.providerResendEmailId,
      organizationId: intent.organizationId,
      receivedAt: args.now,
    });
    return emailMessageId;
  })
  .internal();

export const recordCommunicationDispatchFailure = internalMutation
  .input({
    attemptId: v.id("communicationAttempts"),
    intentId: v.id("communicationIntents"),
    now: v.number(),
    retryable: v.boolean(),
    safeError: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    const attempt = await ctx.db.get(args.attemptId);
    if (!(intent && attempt) || attempt.communicationIntentId !== intent._id) {
      return null;
    }
    const eventFingerprint = `dispatch-failed:${intent._id}:${attempt._id}`;
    const existingOutcome = await ctx.db
      .query("communicationOutcomes")
      .withIndex("by_eventFingerprint", (query) =>
        query.eq("eventFingerprint", eventFingerprint)
      )
      .unique();
    if (existingOutcome) {
      return null;
    }
    const canRetry =
      args.retryable && attempt.attemptNumber <= RETRY_DELAYS_MS.length;
    const retryAt = canRetry
      ? args.now + RETRY_DELAYS_MS[attempt.attemptNumber - 1]
      : undefined;
    const status = canRetry ? "retry_scheduled" : "action_required";
    await ctx.db.patch(attempt._id, {
      finishedAt: args.now,
      retryAt,
      safeError: args.safeError,
      state: "failed",
      updatedAt: args.now,
    });
    await ctx.db.patch(intent._id, {
      actionRequiredReason: canRetry ? undefined : args.safeError,
      lastError: args.safeError,
      lastOutcomeAt: args.now,
      nextAttemptAt: retryAt ?? args.now + 24 * 60 * 60 * 1000,
      status,
      updatedAt: args.now,
    });
    await ctx.db.insert("communicationOutcomes", {
      brokerageId: intent.brokerageId,
      buildId: intent.buildId,
      communicationAttemptId: attempt._id,
      communicationIntentId: intent._id,
      eventFingerprint,
      outcomeType: canRetry ? "dispatch_failed" : "action_required",
      precedence: canRetry ? 5 : 100,
      providerCreatedAt: args.now,
      organizationId: intent.organizationId,
      receivedAt: args.now,
      safeDetail: args.safeError,
    });
    return null;
  })
  .internal();

export const processDueCommunicationIntents = internalAction
  .input({})
  .returns(v.null())
  .handler(async (ctx) => {
    const now = Date.now();
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const provider = apiKey ? new ResendApi(apiKey) : undefined;
    const intentIds: Id<"communicationIntents">[] = await ctx.runQuery(
      internal.quote_notifications.listDueCommunicationIntentIds,
      { limit: DISPATCH_BATCH_SIZE, now }
    );
    for (const intentId of intentIds) {
      const work = await ctx.runMutation(
        internal.quote_notifications.claimCommunicationIntent,
        { intentId, now: Date.now() }
      );
      if (!work) {
        continue;
      }
      try {
        const rendered = await renderCommunicationEmail(work);
        if (!provider) {
          // Missing provider configuration is a permanent, auditable failure;
          // the owning domain transition remains durable.
          throw new Error("RESEND_API_KEY is not configured.");
        }
        const providerResendEmailId = await resendClient().sendEmailManually(
          ctx,
          {
            from: rendered.sender,
            subject: rendered.subject,
            to: work.recipientEmailSnapshot,
          },
          async () => {
            const maySubmit = await ctx.runMutation(
              internal.quote_notifications
                .authorizeCommunicationProviderSubmission,
              {
                attemptId: work.attemptId,
                intentId: work.intentId,
                now: Date.now(),
              }
            );
            if (!maySubmit) {
              throw new Error(PROVIDER_SUBMISSION_CANCELLED);
            }
            try {
              const response = await provider.emails.send(
                {
                  from: rendered.sender,
                  html: rendered.html,
                  subject: rendered.subject,
                  text: rendered.text,
                  to: work.recipientEmailSnapshot,
                },
                { idempotencyKey: work.idempotencyKey }
              );
              if (response.error) {
                throw new Error(
                  `Resend request failed (${response.error.statusCode ?? "unknown"} ${response.error.name}): ${response.error.message}`
                );
              }
              return response.data.id;
            } finally {
              await ctx.runMutation(
                internal.quote_notifications
                  .releaseCommunicationProviderReservation,
                { attemptId: work.attemptId, now: Date.now() }
              );
            }
          }
        );
        await ctx.runMutation(
          internal.quote_notifications.recordCommunicationDispatchSuccess,
          {
            attemptId: work.attemptId,
            intentId: work.intentId,
            now: Date.now(),
            providerResendEmailId: String(providerResendEmailId),
            sender: rendered.sender,
          }
        );
      } catch (error) {
        const safeError = normalizeError(error);
        if (safeError === PROVIDER_SUBMISSION_CANCELLED) {
          continue;
        }
        await ctx.runMutation(
          internal.quote_notifications.recordCommunicationDispatchFailure,
          {
            attemptId: work.attemptId,
            intentId: work.intentId,
            now: Date.now(),
            retryable: isRetryableDispatchError(safeError),
            safeError,
          }
        );
      }
    }
    return null;
  })
  .internal();

export const claimQuoteInvitationReminderSweepPage = internalMutation
  .input({ now: v.number() })
  .returns(v.array(v.id("quoteRounds")))
  .handler(async (ctx, args) => {
    const state = await ctx.db
      .query("communicationSweepStates")
      .withIndex("by_kind", (query) =>
        query.eq("kind", "quote_invitation_reminders")
      )
      .unique();
    const cursor = state?.cursor ?? null;
    const sweepStartedAt =
      cursor && state?.sweepStartedAt ? state.sweepStartedAt : args.now;
    const page = await ctx.db
      .query("quoteRounds")
      .withIndex("by_state_and_updatedAt", (query) =>
        query.eq("state", "open").lte("updatedAt", sweepStartedAt)
      )
      .order("asc")
      .paginate({ cursor, numItems: MAX_ROUNDS_PER_SWEEP });
    const lastRoundUpdatedAt = page.page.at(-1)?.updatedAt;
    const patch = {
      cursor: page.isDone ? undefined : page.continueCursor,
      lastRoundUpdatedAt,
      sweepStartedAt: page.isDone ? undefined : sweepStartedAt,
      updatedAt: args.now,
    };
    if (state) {
      await ctx.db.patch(state._id, patch);
    } else {
      await ctx.db.insert("communicationSweepStates", {
        ...patch,
        createdAt: args.now,
        kind: "quote_invitation_reminders",
      });
    }
    return page.page.map((round) => round._id);
  })
  .internal();

export const scheduleQuoteInvitationReminders = internalAction
  .input({ now: v.optional(v.number()) })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const now = args.now ?? Date.now();
    const roundIds = await ctx.runMutation(
      internal.quote_notifications.claimQuoteInvitationReminderSweepPage,
      { now }
    );
    for (const roundId of roundIds) {
      await ctx.runMutation(
        internal.quote_notifications.scheduleQuoteInvitationRemindersForRound,
        { now, roundId }
      );
    }
    return null;
  })
  .internal();

/**
 * Each Round is scheduled in its own transaction. Stage-level idempotency keys
 * make repeated ticks safe without allowing one oversized Round to abort the
 * rest of a bounded sweep page.
 */
export const scheduleQuoteInvitationRemindersForRound = internalMutation
  .input({ now: v.number(), roundId: v.id("quoteRounds") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!isReminderRoundEligible(round, args.now)) {
      return null;
    }
    const packageRevision = round.currentPackageRevisionId
      ? await ctx.db.get(round.currentPackageRevisionId)
      : null;
    if (!packageRevision || packageRevision.responseDeadline <= args.now) {
      return null;
    }
    const stage = quoteReminderStage(
      packageRevision.responseDeadline,
      args.now
    );
    if (!stage) {
      return null;
    }
    const invitations = await activeReminderInvitations(ctx, round);
    if (!invitations) {
      return null;
    }
    for (const invitation of invitations) {
      const submissionState = await ctx.db
        .query("quoteInvitationResponseSubmissionStates")
        .withIndex(
          "by_quoteRoundInvitationId_and_quotePackageRevisionId",
          (query) =>
            query
              .eq("quoteRoundInvitationId", invitation._id)
              .eq("quotePackageRevisionId", packageRevision._id)
        )
        .unique();
      if (submissionState?.activeSubmissionRevisionId) {
        continue;
      }
      const idempotencyKey = `quote-reminder:${invitation._id}:package:${packageRevision._id}:${stage}`;
      const existing = await ctx.db
        .query("communicationIntents")
        .withIndex("by_organizationId_and_idempotencyKey", (query) =>
          query
            .eq("organizationId", round.organizationId)
            .eq("idempotencyKey", idempotencyKey)
        )
        .unique();
      if (existing) {
        continue;
      }
      const recentSend = await ctx.db
        .query("communicationIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
          query.eq("quoteRoundInvitationId", invitation._id)
        )
        .order("desc")
        .take(20);
      const recentlySent = recentSend.some(
        (intent) =>
          intent.createdAt >= args.now - POST_SEND_SUPPRESSION_MS &&
          intent.status !== "suppressed" &&
          intent.status !== "action_required"
      );
      const scope = await resolveInvitationScope(ctx, invitation);
      if (!scope) {
        continue;
      }
      const build = await ctx.db.get(invitation.buildId);
      if (
        !build ||
        build._id !== scope.round.buildId ||
        build.organizationId !== invitation.organizationId ||
        build.brokerageId !== invitation.brokerageId
      ) {
        continue;
      }
      const accessExpiresAt =
        packageRevision.accessExpiresAt ??
        defaultQuoteInvitationAccessExpiry({
          publishedAt: packageRevision.publishedAt,
          responseDeadline: packageRevision.responseDeadline,
        });
      const intentPayload = JSON.stringify({
        accessExpiresAt,
        packageRevisionId: String(packageRevision._id),
        responseDeadline: packageRevision.responseDeadline,
        stage,
      });
      if (recentlySent) {
        const suppressionIdempotencyKey = `${idempotencyKey}:suppressed`;
        const suppressedId = await enqueueCommunicationIntent(ctx, {
          brokerageId: invitation.brokerageId,
          buildId: invitation.buildId,
          idempotencyKey: suppressionIdempotencyKey,
          kind: "quote_invitation_reminder_auto",
          organizationId: invitation.organizationId,
          payloadSnapshot: intentPayload,
          quoteInvitationAccessCredentialId: undefined,
          quotePackageRevisionId: packageRevision._id,
          quoteRoundId: round._id,
          quoteRoundInvitationId: invitation._id,
          recipientEmailSnapshot: invitation.recipientEmailSnapshot,
          recipientNameSnapshot: invitation.recipientNameSnapshot,
          relatedEntityId: String(invitation._id),
          relatedEntityType: "quoteRoundInvitation",
          templateKey: "quote_invitation_reminder",
        });
        await suppressCommunicationIntent(
          ctx,
          suppressedId,
          "post_send_suppression",
          args.now
        );
        continue;
      }
      await createInitialQuoteInvitationCredentialAndDispatch(ctx, {
        accessExpiresAt,
        accessGeneration: invitation.accessGeneration ?? 1,
        brokerage: scope.brokerage,
        build,
        communicationKind: "quote_invitation_reminder_auto",
        communicationIdempotencyKey: idempotencyKey,
        communicationPayload: {
          reason: `Automatic ${stage} reminder.`,
          stage,
        },
        credentialVersion: await nextCredentialVersionForNotification(
          ctx,
          invitation._id
        ),
        invitation,
        packageRevision,
        publishedAt: args.now,
        purpose: "reminder",
        quoteRound: round,
        responseDeadline: packageRevision.responseDeadline,
      });
      await ctx.db.insert("quoteRoundRecipientNoticeIntents", {
        brokerageId: invitation.brokerageId,
        buildId: invitation.buildId,
        createdAt: args.now,
        kind: "access_reminder",
        organizationId: invitation.organizationId,
        quotePackageRevisionId: packageRevision._id,
        quoteRoundId: round._id,
        quoteRoundInvitationId: invitation._id,
        reason: `Automatic ${stage} reminder.`,
        status: "pending",
      });
    }
    return null;
  })
  .internal();

function isReminderRoundEligible(
  round: Doc<"quoteRounds"> | null,
  now: number
): round is Doc<"quoteRounds"> {
  return Boolean(round && round.state === "open" && round.updatedAt <= now);
}

function quoteReminderStage(responseDeadline: number, now: number) {
  const remaining = responseDeadline - now;
  if (remaining <= 24 * 60 * 60 * 1000) {
    return "24h" as const;
  }
  if (remaining <= 72 * 60 * 60 * 1000) {
    return "72h" as const;
  }
  return;
}

async function activeReminderInvitations(
  ctx: MutationCtx,
  round: Doc<"quoteRounds">
) {
  const invitations = await ctx.db
    .query("quoteRoundInvitations")
    .withIndex("by_quoteRoundId_and_participationState", (query) =>
      query.eq("quoteRoundId", round._id).eq("participationState", "active")
    )
    .take(MAX_INVITATIONS_PER_ROUND + 1);
  if (invitations.length <= MAX_INVITATIONS_PER_ROUND) {
    return invitations;
  }
  console.error(
    "Skipping reminder sweep for Quote Round with too many active Invitations.",
    { quoteRoundId: round._id }
  );
  return;
}

export async function suppressCommunicationIntent(
  ctx: MutationCtx,
  intentId: Id<"communicationIntents">,
  reason: string,
  now: number
) {
  const intent = await ctx.db.get(intentId);
  if (!intent) {
    return;
  }
  const eventFingerprint = `suppressed:${intent._id}`;
  const existingOutcome = await ctx.db
    .query("communicationOutcomes")
    .withIndex("by_eventFingerprint", (query) =>
      query.eq("eventFingerprint", eventFingerprint)
    )
    .unique();
  if (existingOutcome) {
    return;
  }
  await ctx.db.patch(intent._id, {
    lastOutcomeAt: now,
    nextAttemptAt: now + 24 * 60 * 60 * 1000,
    status: "suppressed",
    suppressionReason: reason,
    updatedAt: now,
  });
  await ctx.db.insert("communicationOutcomes", {
    brokerageId: intent.brokerageId,
    buildId: intent.buildId,
    communicationIntentId: intent._id,
    eventFingerprint,
    outcomeType: "dispatch_suppressed",
    precedence: 20,
    providerCreatedAt: now,
    organizationId: intent.organizationId,
    receivedAt: now,
    safeDetail: reason,
  });
}

async function nextCredentialVersionForNotification(
  ctx: MutationCtx,
  invitationId: Id<"quoteRoundInvitations">
) {
  const latest = await ctx.db
    .query("quoteInvitationAccessCredentials")
    .withIndex("by_quoteRoundInvitationId_and_credentialVersion", (query) =>
      query.eq("quoteRoundInvitationId", invitationId)
    )
    .order("desc")
    .first();
  return (latest?.credentialVersion ?? 0) + 1;
}

async function renderCommunicationEmail(work: {
  intentId: Id<"communicationIntents">;
  kind: string;
  payloadSnapshot: string;
  recipientEmailSnapshot: string;
  recipientNameSnapshot?: string;
  templateKey: string;
}) {
  const payload = parsePayload(work.payloadSnapshot);
  const sender = requiredSender();
  const recipientName = work.recipientNameSnapshot?.trim() || "there";
  if (work.templateKey.startsWith("lender_portal_")) {
    const linkPath = String(payload.linkPath ?? "");
    // Validate the immutable destination, but send recipients through the
    // authenticated link-open boundary. The intent ID identifies the record;
    // it never grants access by itself.
    lenderPortalPublicUrl(linkPath);
    const link = lenderPortalPublicUrl(
      `/notifications/${String(work.intentId)}`,
    );
    const subject = lenderPortalSubject(payload);
    const body = lenderPortalBody(payload);
    const text = `Hello ${recipientName},\n\n${body}\n\nOpen DrawFlow: ${link}`;
    return {
      html: `<p>Hello ${escapeHtml(recipientName)},</p><p>${escapeHtml(body)}</p><p><a href="${escapeHtml(link)}">Open DrawFlow</a></p>`,
      sender,
      subject,
      text,
    };
  }
  if (work.templateKey.startsWith("quote_invitation")) {
    const accessLinkAllowed = !(
      work.templateKey === "quote_invitation_revoked" ||
      work.templateKey === "quote_invitation_cancelled"
    );
    const invitationUrl = accessLinkAllowed
      ? quoteInvitationUrl(
          await deriveCommunicationSecret(String(work.intentId))
        )
      : undefined;
    const subject =
      work.templateKey === "quote_invitation_cancelled"
        ? "Quote request cancelled"
        : work.templateKey === "quote_invitation_revoked"
          ? "Quote invitation access revoked"
          : work.templateKey === "quote_invitation_rotation"
            ? "Quote invitation access link replaced"
            : "DrawFlow Quote Package update";
    const body = quoteInvitationBody(work.templateKey, payload);
    const text = invitationUrl
      ? `Hello ${recipientName},\n\n${body}\n\nOpen your secure invitation: ${invitationUrl}`
      : `Hello ${recipientName},\n\n${body}`;
    return {
      html: invitationUrl
        ? `<p>Hello ${escapeHtml(recipientName)},</p><p>${escapeHtml(body)}</p><p><a href="${escapeHtml(invitationUrl)}">Open your secure invitation</a></p>`
        : `<p>Hello ${escapeHtml(recipientName)},</p><p>${escapeHtml(body)}</p>`,
      sender,
      subject,
      text,
    };
  }
  const subject = subjectForIntentPayload(work.templateKey, payload);
  const body = bodyForIntentPayload(work.templateKey, payload, recipientName);
  return {
    html: `<p>${escapeHtml(body).replace(/\n/g, "<br />")}</p>`,
    sender,
    subject,
    text: body,
  };
}

function parsePayload(value: string) {
  try {
    const payload = JSON.parse(value) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("payload is not an object");
    }
    return payload as Record<string, unknown>;
  } catch {
    throw new Error("Communication intent payload is invalid.");
  }
}

function quoteInvitationBody(
  templateKey: string,
  payload: Record<string, unknown>
) {
  if (templateKey === "quote_invitation_revision") {
    return `The Quote Package was updated. Review the current revision before responding (deadline ${formatDeadline(payload.responseDeadline, "updated")}).`;
  }
  if (templateKey === "quote_invitation_reminder") {
    return `This is a reminder to review the current Quote Package before its response deadline (${formatDeadline(payload.responseDeadline, "upcoming")}).`;
  }
  if (templateKey === "quote_invitation_revoked") {
    return "Your Quote Invitation access has been revoked.";
  }
  if (templateKey === "quote_invitation_cancelled") {
    return "This Quote Round has been cancelled.";
  }
  if (templateKey === "quote_invitation_replaced") {
    return "Your corrected Quote Invitation is ready to review.";
  }
  if (templateKey === "quote_invitation_rotation") {
    return "A new Quote Invitation access link was issued. Your previous link is no longer valid.";
  }
  return "You have been invited to review a private DrawFlow Quote Package.";
}

function formatDeadline(value: unknown, fallback: string) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return fallback;
  }
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Toronto",
  }).format(new Date(timestamp));
}

function subjectForIntent(intent: Doc<"communicationIntents">) {
  return subjectForIntentPayload(
    intent.templateKey,
    parsePayload(intent.payloadSnapshot)
  );
}

function subjectForIntentPayload(
  templateKey: string,
  payload: Record<string, unknown>
) {
  if (templateKey.startsWith("lender_portal_")) {
    return lenderPortalSubject(payload);
  }
  if (templateKey === "cost_document_integrity_action_required_v1") {
    return `Action required: ${String(payload.title ?? "Cost Document integrity")}`;
  }
  if (templateKey === "cost_document_upload_receipt_v1") {
    return `Cost Document submitted: ${String(payload.title ?? "receipt")}`;
  }
  if (templateKey === "quote_response") {
    return `Quote response ${String(payload.event ?? "updated")}`;
  }
  if (templateKey === "quote_invitation_cancelled") {
    return "Quote request cancelled";
  }
  if (templateKey === "quote_invitation_revoked") {
    return "Quote invitation access revoked";
  }
  if (templateKey === "quote_invitation_rotation") {
    return "Quote invitation access link replaced";
  }
  return "DrawFlow Quote Package update";
}

function lenderPortalSubject(payload: Record<string, unknown>) {
  const title = String(payload.title ?? "DrawFlow review");
  switch (payload.eventClass) {
    case "approval-required":
      return `Action required: ${title}`;
    case "proposal-updated-after-decline":
      return `Proposal updated: ${title}`;
    case "withdrawal":
      return `Lender assignment withdrawn: ${title}`;
    case "approval-outcome":
      return payload.outcome === "approved"
        ? `Review approved: ${title}`
        : `Review needs revision: ${title}`;
    default:
      throw new Error("Unsupported lender portal notification event.");
  }
}

function lenderPortalBody(payload: Record<string, unknown>) {
  switch (payload.eventClass) {
    case "approval-required":
      return "A current DrawFlow approval group requires your review.";
    case "proposal-updated-after-decline":
      return "The proposal has a new revision and a new full confirmation cycle ready for review.";
    case "withdrawal":
      return "The lender assignment was withdrawn. The retained proposal record is read-only.";
    case "approval-outcome":
      return payload.outcome === "approved"
        ? "The current review cycle was approved."
        : "The current review cycle needs revision. Open DrawFlow for the information available to your role.";
    default:
      throw new Error("Unsupported lender portal notification event.");
  }
}

function lenderPortalPublicUrl(linkPath: string) {
  if (!linkPath.startsWith("/") || linkPath.startsWith("//")) {
    throw new Error("Lender portal notification link is invalid.");
  }
  const configuredOrigin = (process.env.DRAWFLOW_APP_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .find(Boolean);
  if (!configuredOrigin) {
    throw new Error("DRAWFLOW_APP_ORIGINS is not configured.");
  }
  const origin = new URL(configuredOrigin);
  if (
    origin.protocol !== "https:" &&
    origin.hostname !== "localhost" &&
    origin.hostname !== "127.0.0.1"
  ) {
    throw new Error("DrawFlow application origin must use HTTPS.");
  }
  return new URL(linkPath, origin).toString();
}

function bodyForIntentPayload(
  templateKey: string,
  payload: Record<string, unknown>,
  recipientName: string
) {
  if (templateKey === "cost_document_integrity_action_required_v1") {
    return `Hello ${recipientName},\n\nDrawFlow could not verify a source page for “${String(payload.title ?? "Cost Document")}”. The recorded integrity state is ${String(payload.kind ?? "unavailable")}. Review the Cost Document before relying on it.`;
  }
  if (templateKey === "cost_document_upload_receipt_v1") {
    const disclosure = payload.supportingContextDisclosure
      ? `\n\n${String(payload.supportingContextDisclosure)}`
      : "";
    return `Hello ${recipientName},\n\n${String(payload.kind ?? "Cost Document")} “${String(payload.title ?? "document")}” was submitted for ${formatCad(Number(payload.grossTotalCents ?? 0))} CAD.\n\nThis is a durable DrawFlow submission receipt.${disclosure}`;
  }
  if (templateKey === "quote_response") {
    return `Hello ${recipientName},\n\nA Quote response was ${String(payload.event ?? "updated")} for the current package.`;
  }
  return `Hello ${recipientName},\n\nDrawFlow recorded an update for your Quote request.`;
}

function formatCad(cents: number) {
  return (Number.isFinite(cents) ? cents / 100 : 0).toLocaleString("en-CA", {
    currency: "CAD",
    style: "currency",
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "'":
        return "&#39;";
      case '"':
        return "&quot;";
      default:
        return character;
    }
  });
}

function normalizeError(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  return (
    value.replace(/\s+/g, " ").trim().slice(0, 500) || "Email dispatch failed."
  );
}

async function cancelCommunicationForRestrictedArchive(
  ctx: MutationCtx,
  intent: Doc<"communicationIntents">,
  attempt: Doc<"communicationAttempts"> | null,
  now: number
) {
  const reason =
    "Communication dispatch cancelled because the organization is in restricted archive.";
  if (attempt?.state === "claimed") {
    await ctx.db.patch(attempt._id, {
      finishedAt: now,
      safeError: reason,
      state: "abandoned",
      updatedAt: now,
    });
  }
  await ctx.db.patch(intent._id, {
    actionRequiredReason: undefined,
    lastError: undefined,
    lastOutcomeAt: now,
    nextAttemptAt: now + 24 * 60 * 60 * 1000,
    status: "cancelled",
    suppressionReason: reason,
    updatedAt: now,
  });
  const eventFingerprint = `restricted-archive-dispatch-suppressed:${intent._id}`;
  const existing = await ctx.db
    .query("communicationOutcomes")
    .withIndex("by_eventFingerprint", (query) =>
      query.eq("eventFingerprint", eventFingerprint)
    )
    .unique();
  if (!existing) {
    await ctx.db.insert("communicationOutcomes", {
      brokerageId: intent.brokerageId,
      buildId: intent.buildId,
      communicationAttemptId: attempt?._id,
      communicationIntentId: intent._id,
      eventFingerprint,
      organizationId: intent.organizationId,
      outcomeType: "dispatch_suppressed",
      precedence: 100,
      providerCreatedAt: now,
      receivedAt: now,
      safeDetail: reason,
    });
  }
}

function isRetryableDispatchError(message: string) {
  if (RETRYABLE_DISPATCH_ERROR_PATTERN.test(message)) {
    return true;
  }
  return !PERMANENT_DISPATCH_ERROR_PATTERN.test(message);
}
