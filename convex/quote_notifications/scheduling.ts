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
  MAX_ROUNDS_PER_SWEEP,
  POST_SEND_SUPPRESSION_MS,
  PROVIDER_SUBMISSION_CANCELLED,
} from "./contracts";
import {
  activeReminderInvitations,
  isReminderRoundEligible,
  nextCredentialVersionForNotification,
  quoteReminderStage,
  renderCommunicationEmail,
  suppressCommunicationIntent,
} from "./email";
import {
  isRetryableDispatchError,
  normalizeError,
} from "./email";

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
