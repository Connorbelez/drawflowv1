import { ConvexError, v } from "convex/values";
import { Resend as ResendApi } from "resend";

import { internal } from "../_generated/api";
import { authorizeActiveBuildAccess } from "../activeBuildAccess";
import {
  administrativeOverrideInputFields,
  appendGovernedAuditEvent,
  requiredAdministrativeReason,
} from "../administrative_override_policy";
import { authenticatedMutation } from "../authz";
import { isOrganizationInRestrictedArchive } from "../data_retention";
import {
  deriveCommunicationSecret,
  enqueueCommunicationIntent,
  requiredSender,
  resendClient,
} from "../email_transport";
import { internalAction, internalMutation, internalQuery } from "../fluent";
import { authorizeQuoteAdministrativeRecovery } from "../quote_authoring_access";
import {
  createInitialQuoteInvitationCredentialAndDispatch,
  defaultQuoteInvitationAccessExpiry,
  quoteInvitationUrl,
  resolveInvitationScope,
} from "../quote_invitation_access";
import { lenderPortalCommunicationSuppressionReason } from "../lender_portal_notifications";
import {
  lenderPortalDeliveryReleaseAccessRevision,
  lenderPortalDeliveryReleaseDecision,
  lenderPortalDeliveryReleaseReason,
  LENDER_PORTAL_RELEASE_PAUSED_REASON,
} from "../lender_portal_release";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

import {
  DISPATCH_BATCH_SIZE,
  DISPATCH_LEASE_MS,
  dispatchWorkValidator,
  MAX_ACTIVE_PROVIDER_RESERVATIONS,
  MAX_COMMUNICATION_HISTORY,
  MAX_DISPATCH_ATTEMPTS,
  MAX_INVITATIONS_PER_ROUND,
  MAX_ROUNDS_PER_SWEEP,
  PERMANENT_DISPATCH_ERROR_PATTERN,
  POST_SEND_SUPPRESSION_MS,
  PROVIDER_RESERVATION_LEASE_MS,
  PROVIDER_SUBMISSION_CANCELLED,
  RETRYABLE_DISPATCH_ERROR_PATTERN,
  RETRY_DELAYS_MS,
} from "./contracts";
import {
  cancelCommunicationForRestrictedArchive,
  pauseClaimedLenderPortalIntentForReleaseControl,
  subjectForIntent,
} from "./email";

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
    // Read enough candidates that one paused tenant cannot monopolize the
    // global status index. The Phase 9 operational stop threshold is lower
    // than this bounded look-ahead, so a larger paused backlog is an alert and
    // release stop condition rather than silently starving other tenants.
    const candidateLimit = Math.min(DISPATCH_BATCH_SIZE * 4, limit * 4);
    const [pending, retrying, dispatching] = await Promise.all([
      ctx.db
        .query("communicationIntents")
        .withIndex("by_status_and_nextAttemptAt", (query) =>
          query.eq("status", "pending").lte("nextAttemptAt", args.now)
        )
        .take(candidateLimit),
      ctx.db
        .query("communicationIntents")
        .withIndex("by_status_and_nextAttemptAt", (query) =>
          query.eq("status", "retry_scheduled").lte("nextAttemptAt", args.now)
        )
        .take(candidateLimit),
      ctx.db
        .query("communicationIntents")
        .withIndex("by_status_and_nextAttemptAt", (query) =>
          query.eq("status", "dispatching").lte("nextAttemptAt", args.now)
        )
        .take(candidateLimit),
    ]);
    const candidates = [
      ...new Set(
        [...pending, ...retrying, ...dispatching].map((row) => row._id)
      ),
    ];
    const allowed: Id<"communicationIntents">[] = [];
    for (const intentId of candidates) {
      const intent =
        [...pending, ...retrying, ...dispatching].find(
          (row) => row._id === intentId
        ) ?? null;
      if (
        intent &&
        (intent.status === "dispatching" ||
          !(await lenderPortalDeliveryReleaseReason(ctx, intent)))
      ) {
        allowed.push(intentId);
      }
      if (allowed.length === limit) break;
    }
    return allowed;
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
    const releaseDecision = await lenderPortalDeliveryReleaseDecision(ctx, intent);
    if (releaseDecision) {
      await pauseClaimedLenderPortalIntentForReleaseControl(
        ctx,
        intent,
        latestAttempt,
        releaseDecision.reason,
        releaseDecision.accessRevision,
        args.now
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
      claimedFromStatus:
        intent.status === "retry_scheduled" ? "retry_scheduled" : "pending",
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
    const releaseDecision = await lenderPortalDeliveryReleaseDecision(ctx, intent);
    if (releaseDecision) {
      await pauseClaimedLenderPortalIntentForReleaseControl(
        ctx,
        intent,
        attempt,
        releaseDecision.reason,
        releaseDecision.accessRevision,
        args.now
      );
      return false;
    }
    const reservationSamples = await Promise.all(
      (["active", "expired"] as const).map((state) =>
        ctx.db
          .query("communicationProviderReservations")
          .withIndex("by_organizationId_and_state_and_leaseExpiresAt", (query) =>
            query.eq("organizationId", intent.organizationId).eq("state", state)
          )
          .take(MAX_ACTIVE_PROVIDER_RESERVATIONS + 1)
      )
    );
    if (
      reservationSamples.some(
        (sample) => sample.length > MAX_ACTIVE_PROVIDER_RESERVATIONS
      ) ||
      reservationSamples.reduce((total, sample) => total + sample.length, 0) >
        MAX_ACTIVE_PROVIDER_RESERVATIONS
    ) {
      return false;
    }
    for (const reservation of reservationSamples.flat()) {
      if (
        reservation.state === "active" &&
        reservation.communicationAttemptId === attempt._id &&
        reservation.leaseExpiresAt > args.now
      ) {
        return true;
      }
      if (
        reservation.state === "active" &&
        reservation.leaseExpiresAt > args.now
      ) {
        return false;
      }
      if (reservation.state === "active") {
        await ctx.db.patch(reservation._id, {
          state: "expired",
          updatedAt: args.now,
        });
      }
      // An expired lease has an unknown provider outcome. It remains a tenant
      // interlock until explicit provider reconciliation records a durable
      // outcome; a retry must not create a second reservation or provider call.
      return false;
    }
    const lenderPortalReleaseAccessRevision =
      await lenderPortalDeliveryReleaseAccessRevision(ctx, intent);
    await ctx.db.insert("communicationProviderReservations", {
      communicationAttemptId: attempt._id,
      communicationIntentId: intent._id,
      communicationKind: intent.kind,
      createdAt: args.now,
      leaseExpiresAt: args.now + PROVIDER_RESERVATION_LEASE_MS,
      lenderPortalReleaseAccessRevision,
      organizationId: intent.organizationId,
      state: "active",
      updatedAt: args.now,
    });
    return true;
  })
  .internal();

async function providerReservationHasDurableOutcome(
  ctx: MutationCtx,
  attemptId: Id<"communicationAttempts">
) {
  const attempt = await ctx.db.get(attemptId);
  if (!attempt) return false;
  const outcomes = await ctx.db
    .query("communicationOutcomes")
    .withIndex("by_communicationIntentId_and_providerCreatedAt", (query) =>
      query.eq("communicationIntentId", attempt.communicationIntentId)
    )
    .take(MAX_COMMUNICATION_HISTORY + 1);
  if (outcomes.length > MAX_COMMUNICATION_HISTORY) {
    throw new Error(
      "Provider outcome reconciliation exceeded its safe history boundary."
    );
  }
  return outcomes.some(
    (outcome) => outcome.communicationAttemptId === attemptId
  );
}

async function resolveProviderReservationsAfterDurableOutcome(
  ctx: MutationCtx,
  attemptId: Id<"communicationAttempts">,
  now: number
) {
  const reservations = await ctx.db
    .query("communicationProviderReservations")
    .withIndex("by_communicationAttemptId", (query) =>
      query.eq("communicationAttemptId", attemptId)
    )
    .take(3);
  if (reservations.length > 2) {
    throw new Error("Provider reservation attempt has contradictory duplicates.");
  }
  for (const reservation of reservations) {
    if (reservation.state === "active" || reservation.state === "expired") {
      await ctx.db.patch(reservation._id, {
        releasedAt: now,
        state: "released",
        updatedAt: now,
      });
    }
  }
}

export const releaseCommunicationProviderReservation = internalMutation
  .input({ attemptId: v.id("communicationAttempts"), now: v.number() })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const reservations = await ctx.db
      .query("communicationProviderReservations")
      .withIndex("by_communicationAttemptId", (query) =>
        query.eq("communicationAttemptId", args.attemptId)
      )
      .take(3);
    if (reservations.length > 2) {
      throw new Error("Provider reservation attempt has contradictory duplicates.");
    }
    let hasDurableOutcome: boolean | undefined;
    for (const reservation of reservations) {
      // Phase 9 keeps lender-portal provider calls interlocked until their
      // outcome is durable, even after the lease expires. Other established
      // communication flows retain their explicit release contract: their
      // worker releases the reservation after the provider call returns.
      // Missing historical kind data fails closed because its audience cannot
      // be proven safe for the less restrictive path.
      if (
        !reservation.communicationKind ||
        reservation.communicationKind.startsWith("lender_portal_")
      ) {
        hasDurableOutcome ??= await providerReservationHasDurableOutcome(
          ctx,
          args.attemptId
        );
        if (!hasDurableOutcome) continue;
      }
      if (reservation.state === "active" || reservation.state === "expired") {
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
      await resolveProviderReservationsAfterDurableOutcome(
        ctx,
        attempt._id,
        args.now
      );
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
    await resolveProviderReservationsAfterDurableOutcome(
      ctx,
      attempt._id,
      args.now
    );
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
      await resolveProviderReservationsAfterDurableOutcome(
        ctx,
        attempt._id,
        args.now
      );
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
    await resolveProviderReservationsAfterDurableOutcome(
      ctx,
      attempt._id,
      args.now
    );
    return null;
  })
  .internal();
