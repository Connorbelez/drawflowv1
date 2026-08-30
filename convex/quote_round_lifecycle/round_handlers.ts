import { ConvexError } from "convex/values";

import {
  MAX_PACKAGE_REVISION_HISTORY,
  MAX_REOPEN_CLONE_SERIALIZED_BYTES,
  appendLifecycleAudit,
  assertExpectedRevision,
  assertSafeFutureDeadline,
  authorizeLifecyclePath,
  clonePackageRevisionRows,
  endInvitationAccess,
  nextCredentialVersion,
  normalizeChangedFieldKeysWithScopeSummary,
  requireRound,
  requiredConfirmation,
  requiredReason,
  type LifecycleCtx,
} from "./core";
import {
  createInitialQuoteInvitationCredentialAndDispatch,
  defaultQuoteInvitationAccessExpiry,
} from "../quote_invitation_access";
import { enqueueCommunicationIntent } from "../email_transport";
import { clearPreferredForRound } from "../quote_preferred";
import { prepareEffectiveLabourLinesForPackageRevision } from "../quote_rounds";
import type { Id } from "../types";

type AdministrativeOverrideArgs = {
  administrativeCapacity?: "builder" | "builder-staff" | "admin";
  breakGlassConfirmed?: boolean;
};

export type CloseQuoteRoundArgs = {
  buildId: Id<"activeBuilds">;
  confirmed: boolean;
  expectedRevision: number;
  quoteRoundId: Id<"quoteRounds">;
  reason: string;
  workosOrganizationId: string;
};

export type CancelQuoteRoundArgs = CloseQuoteRoundArgs;

export type ReopenQuoteRoundWithRevisionArgs = AdministrativeOverrideArgs & {
  buildId: Id<"activeBuilds">;
  changedFieldKeys?: string[];
  confirmed: boolean;
  deadlinePolicy:
    | { kind: "keep" }
    | { kind: "replace"; responseDeadline: number };
  expectedRevision: number;
  quoteRoundId: Id<"quoteRounds">;
  reason: string;
  workosOrganizationId: string;
};

export async function closeQuoteRoundHandler(
  ctx: LifecycleCtx,
  args: CloseQuoteRoundArgs
) {
    requiredConfirmation(args.confirmed, "close a Quote Round");
    const reason = requiredReason(args.reason, "A Quote Round closure reason");
    const { authorization } = await authorizeLifecyclePath(ctx, {
      ...args,
      administrativeCapacity: undefined,
      breakGlassConfirmed: undefined,
      reason,
    });
    const round = requireRound(
      await ctx.db.get(args.quoteRoundId),
      authorization,
      args.quoteRoundId
    );
    assertExpectedRevision(round, args.expectedRevision);
    if (round.state !== "open") {
      throw new ConvexError("Only an open Quote Round may be closed.");
    }
    const now = Date.now();
    const revision = round.revision + 1;
    await ctx.db.patch(round._id, {
      closeReason: reason,
      closedAt: now,
      closedByWorkosUserId: authorization.viewer.subject,
      revision,
      state: "closed",
      updatedAt: now,
    });
    await appendLifecycleAudit(
      ctx,
      authorization,
      {
        command: "closeQuoteRound",
        entityId: String(round._id),
        entityType: "quoteRound",
        eventType: "quote_round.closed",
        newState: { revision, state: "closed" },
        priorState: { revision: round.revision, state: round.state },
        payloadPreview: { revision, state: "closed" },
        reason,
      },
      now
    );
    return {
      quoteRoundId: round._id,
      revision,
      state: "closed" as const,
      status: "closed" as const,
    };
}
export async function cancelQuoteRoundHandler(
  ctx: LifecycleCtx,
  args: CancelQuoteRoundArgs
) {
    requiredConfirmation(args.confirmed, "cancel a Quote Round");
    const reason = requiredReason(
      args.reason,
      "A Quote Round cancellation reason"
    );
    const { authorization } = await authorizeLifecyclePath(ctx, {
      ...args,
      administrativeCapacity: undefined,
      breakGlassConfirmed: undefined,
      reason,
    });
    const round = requireRound(
      await ctx.db.get(args.quoteRoundId),
      authorization,
      args.quoteRoundId
    );
    assertExpectedRevision(round, args.expectedRevision);
    if (round.state === "cancelled") {
      throw new ConvexError("Cancelled Quote Rounds are terminal.");
    }
    const now = Date.now();
    if (round.state !== "draft") {
      const invitations = await ctx.db
        .query("quoteRoundInvitations")
        .withIndex("by_quoteRoundId_and_participationState", (query) =>
          query.eq("quoteRoundId", round._id).eq("participationState", "active")
        )
        .take(101);
      if (invitations.length > 100) {
        throw new ConvexError("Quote Round has too many active Invitations.");
      }
      for (const invitation of invitations) {
        await endInvitationAccess(ctx, invitation, now, "revoked");
        await enqueueCommunicationIntent(ctx, {
          brokerageId: authorization.brokerage._id,
          buildId: authorization.build._id,
          idempotencyKey: `quote-round:${round._id}:invitation:${invitation._id}:cancelled:${round.revision + 1}`,
          kind: "quote_round_cancelled",
          organizationId: authorization.organizationId,
          payloadSnapshot: JSON.stringify({
            event: "cancelled",
            reason,
          }),
          quoteRoundId: round._id,
          quoteRoundInvitationId: invitation._id,
          recipientEmailSnapshot: invitation.recipientEmailSnapshot,
          recipientNameSnapshot: invitation.recipientNameSnapshot,
          relatedEntityId: String(round._id),
          relatedEntityType: "quoteRound",
          templateKey: "quote_invitation_cancelled",
        });
      }
      await clearPreferredForRound(ctx, round, {
        actor: {
          actorRoles: authorization.viewer.roles,
          actorWorkosUserId: authorization.viewer.subject,
        },
        command: "cancelQuoteRound",
        reason,
      });
    }
    const revision = round.revision + 1;
    await ctx.db.patch(round._id, {
      cancellationReason: reason,
      cancelledAt: now,
      cancelledByWorkosUserId: authorization.viewer.subject,
      revision,
      state: "cancelled",
      updatedAt: now,
    });
    await appendLifecycleAudit(
      ctx,
      authorization,
      {
        command: "cancelQuoteRound",
        entityId: String(round._id),
        entityType: "quoteRound",
        eventType: "quote_round.cancelled",
        newState: { revision, state: "cancelled" },
        priorState: { revision: round.revision, state: round.state },
        payloadPreview: { revision, state: "cancelled" },
        reason,
      },
      now
    );
    return {
      quoteRoundId: round._id,
      revision,
      state: "cancelled" as const,
      status: "cancelled" as const,
    };
}
export async function reopenQuoteRoundWithRevisionHandler(
  ctx: LifecycleCtx,
  args: ReopenQuoteRoundWithRevisionArgs
) {
    requiredConfirmation(args.confirmed, "reopen a Quote Round");
    const reason = requiredReason(
      args.reason,
      "A Quote Round reopening reason"
    );
    const { authorization, breakGlass } = await authorizeLifecyclePath(ctx, {
      ...args,
      reason,
    });
    const round = requireRound(
      await ctx.db.get(args.quoteRoundId),
      authorization,
      args.quoteRoundId
    );
    assertExpectedRevision(round, args.expectedRevision);
    if (round.state !== "closed" && round.state !== "open") {
      throw new ConvexError(
        "Only a published Quote Round may receive a new Package Revision."
      );
    }
    const previous = round.currentPackageRevisionId
      ? await ctx.db.get(round.currentPackageRevisionId)
      : null;
    if (!previous) {
      throw new ConvexError(
        "A closed Quote Round requires a current Package Revision."
      );
    }
    const packageRevisionHistory = await ctx.db
      .query("quotePackageRevisions")
      .withIndex("by_quoteRoundId_and_revision", (query) =>
        query.eq("quoteRoundId", round._id)
      )
      .take(MAX_PACKAGE_REVISION_HISTORY + 1);
    if (packageRevisionHistory.length >= MAX_PACKAGE_REVISION_HISTORY) {
      throw new ConvexError(
        "Quote Round has reached the 20 Package Revision limit."
      );
    }
    const now = Date.now();
    const responseDeadline =
      args.deadlinePolicy.kind === "keep"
        ? previous.responseDeadline
        : args.deadlinePolicy.responseDeadline;
    assertSafeFutureDeadline(
      responseDeadline,
      now,
      args.deadlinePolicy.kind === "keep"
        ? "Kept Quote Response Deadline (choose replace when expired)"
        : "Replacement Quote Response Deadline"
    );
    const effectiveLabourLines =
      await prepareEffectiveLabourLinesForPackageRevision(
        ctx,
        authorization,
        previous._id
      );
    await clearPreferredForRound(ctx, round, {
      actor: {
        actorRoles: authorization.viewer.roles,
        actorWorkosUserId: authorization.viewer.subject,
      },
      command: "reopenQuoteRoundWithRevision",
      reason:
        "Quote Package Revision supersession cleared the Preferred Quote.",
    });
    const changedScopeFieldKeys = effectiveLabourLines
      .filter(
        ({ previousLine, sourceScopeRevisionId }) =>
          previousLine.sourceScopeRevisionId !== sourceScopeRevisionId
      )
      .map(
        ({ previousLine }) =>
          `scope:${String(previousLine.buildSubmilestoneId)}`
      );
    const changedFieldKeys = normalizeChangedFieldKeysWithScopeSummary({
      changedScopeFieldKeys,
      explicitFieldKeys: args.changedFieldKeys,
      responseDeadlineChanged: responseDeadline !== previous.responseDeadline,
    });
    const accessExpiresAt = defaultQuoteInvitationAccessExpiry({
      publishedAt: now,
      responseDeadline,
    });
    const revisionNumber = previous.revision + 1;
    const packageRevisionId = await ctx.db.insert("quotePackageRevisions", {
      accessExpiresAt,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      changedFieldKeys,
      permitDocumentId: previous.permitDocumentId,
      permitDocumentVersion: previous.permitDocumentVersion,
      previousPackageRevisionId: previous._id,
      publishedAt: now,
      publishedByWorkosUserId: authorization.viewer.subject,
      quoteRoundId: round._id,
      responseDeadline,
      revision: revisionNumber,
      roadmapSnapshotFingerprint: previous.roadmapSnapshotFingerprint,
      siteAddressSnapshot: previous.siteAddressSnapshot,
      siteLatitudeSnapshot: previous.siteLatitudeSnapshot,
      siteLongitudeSnapshot: previous.siteLongitudeSnapshot,
      siteMapUrlSnapshot: previous.siteMapUrlSnapshot,
      sitePlaceIdSnapshot: previous.sitePlaceIdSnapshot,
      sourceDraftRevision: round.revision,
      templateId: previous.templateId,
      templateVersionId: previous.templateVersionId,
      timelineCurrentDaySnapshot: previous.timelineCurrentDaySnapshot,
      timelineRangeMaxSnapshot: previous.timelineRangeMaxSnapshot,
      timelineRangeMinSnapshot: previous.timelineRangeMinSnapshot,
      timelineStartDateSnapshot: previous.timelineStartDateSnapshot,
      organizationId: authorization.organizationId,
    });
    await clonePackageRevisionRows(
      ctx,
      previous,
      packageRevisionId,
      round._id,
      authorization,
      now,
      effectiveLabourLines
    );
    const packageRevision = await ctx.db.get(packageRevisionId);
    if (!packageRevision) {
      throw new ConvexError("Reopened Quote Package Revision was not created.");
    }

    const activeInvitations = await ctx.db
      .query("quoteRoundInvitations")
      .withIndex("by_quoteRoundId_and_participationState", (query) =>
        query.eq("quoteRoundId", round._id).eq("participationState", "active")
      )
      .take(101);
    if (activeInvitations.length > 100) {
      throw new ConvexError("Quote Round has too many active Invitations.");
    }
    const invitationIds: Id<"quoteRoundInvitations">[] = [];
    for (const priorInvitation of activeInvitations) {
      // Invitation provenance is immutable. Reopen advances a projection on
      // the same row so Drafts/Submissions remain attached to their original
      // Package Revision while the recipient sees the new current package.
      const invitation = {
        ...priorInvitation,
        currentQuotePackageRevisionId: packageRevisionId,
      };
      await ctx.db.patch(priorInvitation._id, {
        currentQuotePackageRevisionId: packageRevisionId,
        updatedAt: now,
      });
      const credentialVersion = await nextCredentialVersion(
        ctx,
        priorInvitation._id
      );
      await createInitialQuoteInvitationCredentialAndDispatch(ctx, {
        accessExpiresAt,
        accessGeneration: priorInvitation.accessGeneration ?? 1,
        brokerage: authorization.brokerage,
        build: authorization.build,
        credentialVersion,
        invitation,
        packageRevision,
        publishedAt: now,
        purpose: "renewal",
        communicationKind: "quote_package_revision",
        communicationPayload: {
          changedFieldKeys,
          reason,
        },
        quoteRound: round,
        responseDeadline,
      });
      await ctx.db.insert("quoteInvitationPackageRevisionAcknowledgements", {
        acknowledgedFieldKeys: [],
        acknowledgedByWorkosUserId: undefined,
        acknowledgedAt: undefined,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        changedFieldKeys,
        createdAt: now,
        organizationId: authorization.organizationId,
        previousPackageRevisionId: previous._id,
        quotePackageRevisionId: packageRevisionId,
        quoteRoundId: round._id,
        quoteRoundInvitationId: priorInvitation._id,
        status: "pending",
        updatedAt: now,
      });
      await ctx.db.insert("quoteRoundRecipientNoticeIntents", {
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        createdAt: now,
        kind: "package_revision_published",
        organizationId: authorization.organizationId,
        quotePackageRevisionId: packageRevisionId,
        quoteRoundId: round._id,
        quoteRoundInvitationId: priorInvitation._id,
        reason,
        status: "pending",
      });
      invitationIds.push(priorInvitation._id);
    }
    const revision = round.revision + 1;
    await ctx.db.patch(round._id, {
      currentPackageRevisionId: packageRevisionId,
      revision,
      state: "open",
      updatedAt: now,
    });
    await appendLifecycleAudit(
      ctx,
      authorization,
      {
        command: "reopenQuoteRoundWithRevision",
        entityId: String(round._id),
        entityType: "quoteRound",
        eventType: "quote_round.reopened",
        newState: {
          invitationCount: invitationIds.length,
          packageRevision: revisionNumber,
          responseDeadline,
          revision,
          state: "open",
        },
        payloadPreview: {
          invitationCount: invitationIds.length,
          packageRevision: revisionNumber,
          responseDeadline,
          revision,
          state: "open",
        },
        priorState: { revision: round.revision, state: round.state },
        reason,
        breakGlass,
        overrideKind: "revision_reopen",
      },
      now
    );
    return {
      invitationIds,
      packageRevisionId,
      packageRevisionNumber: revisionNumber,
      quoteRoundId: round._id,
      revision,
      responseDeadline,
      state: "open" as const,
      status: "reopened" as const,
    };
}
