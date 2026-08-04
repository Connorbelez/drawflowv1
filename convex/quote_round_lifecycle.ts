import { ConvexError, v } from "convex/values";

import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "./activeBuildAccess";
import {
  type AuditOverrideKind,
  administrativeOverrideInputFields,
  appendGovernedAuditEvent,
  authorizeAdministrativeRecovery,
  maskRecipientEmailForAudit,
} from "./administrative_override_policy";
import { type AuthorizedViewer, authenticatedMutation } from "./authz";
import { normalizeContractorEmail } from "./contractorWorkspace";
import { assertOrganizationRetentionWritable } from "./data_retention";
import { enqueueCommunicationIntent } from "./email_transport";
import { publicMutation } from "./fluent";
import {
  createInitialQuoteInvitationCredentialAndDispatch,
  defaultQuoteInvitationAccessExpiry,
  resolveInvitationScope,
  resolveQuoteInvitationBrowserWriteAccess,
  resolveQuoteInvitationClaimedWriteAccess,
} from "./quote_invitation_access";
import {
  clearPreferredForInvitation,
  clearPreferredForRound,
} from "./quote_preferred";
import { migratePriorRevisionDraftForAccess } from "./quote_response_drafts";
import type { Doc, Id, MutationCtx } from "./types";

const MAX_REOPEN_CLONE_SERIALIZED_BYTES = 12 * 1024 * 1024;

const quoteRoundStateValidator = v.union(
  v.literal("draft"),
  v.literal("open"),
  v.literal("closed"),
  v.literal("cancelled")
);

const lifecycleResultValidator = v.object({
  quoteRoundId: v.id("quoteRounds"),
  revision: v.number(),
  state: quoteRoundStateValidator,
  status: v.union(
    v.literal("closed"),
    v.literal("cancelled"),
    v.literal("reopened")
  ),
  packageRevisionId: v.optional(v.id("quotePackageRevisions")),
  packageRevisionNumber: v.optional(v.number()),
  invitationIds: v.optional(v.array(v.id("quoteRoundInvitations"))),
  responseDeadline: v.optional(v.number()),
});

const invitationLifecycleResultValidator = v.object({
  cooldownUntil: v.optional(v.number()),
  invitationId: v.id("quoteRoundInvitations"),
  status: v.union(
    v.literal("revoked"),
    v.literal("replaced"),
    v.literal("reminded"),
    v.literal("rotated"),
    v.literal("preview")
  ),
  replacementInvitationId: v.optional(v.id("quoteRoundInvitations")),
  accessGeneration: v.optional(v.number()),
  credentialId: v.optional(v.id("quoteInvitationAccessCredentials")),
});

const acknowledgementResultValidator = v.object({
  invitationId: v.id("quoteRoundInvitations"),
  quotePackageRevisionId: v.id("quotePackageRevisions"),
  acknowledgedFieldKeys: v.array(v.string()),
  status: v.literal("acknowledged"),
});

type LifecycleCtx = MutationCtx & { viewer: AuthorizedViewer };

function requiredReason(value: string, label: string) {
  const reason = value.trim();
  if (!reason) {
    throw new ConvexError(`${label} is required.`);
  }
  if (reason.length > 4000) {
    throw new ConvexError(`${label} must be 4000 characters or fewer.`);
  }
  return reason;
}

function requiredConfirmation(confirmed: boolean, action: string) {
  if (!confirmed) {
    throw new ConvexError(`Explicit confirmation is required to ${action}.`);
  }
}

async function authorizeLifecyclePath(
  ctx: LifecycleCtx,
  input: {
    administrativeCapacity?: "builder" | "builder-staff" | "admin";
    breakGlassConfirmed?: boolean;
    buildId: Id<"activeBuilds">;
    reason: string;
    workosOrganizationId: string;
  }
) {
  const baseAuthorization = await authorizeActiveBuildAccess(ctx, {
    buildId: input.buildId,
    organizationId: input.workosOrganizationId,
  });
  await assertOrganizationRetentionWritable(
    ctx,
    baseAuthorization.organizationId
  );
  return await authorizeAdministrativeRecovery(ctx, baseAuthorization, input);
}

async function quoteInvitationReminderCooldownUntil(
  ctx: MutationCtx,
  invitationId: Id<"quoteRoundInvitations">,
  now: number
) {
  const reminders = await ctx.db
    .query("communicationIntents")
    .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
      query.eq("quoteRoundInvitationId", invitationId)
    )
    .order("desc")
    .take(20);
  const latestReminder = reminders.find(
    (intent) =>
      (intent.kind === "quote_invitation_reminder_manual" ||
        intent.kind === "quote_invitation_reminder_auto") &&
      intent.status !== "suppressed" &&
      intent.createdAt + 24 * 60 * 60 * 1000 > now
  );
  return latestReminder
    ? latestReminder.createdAt + 24 * 60 * 60 * 1000
    : undefined;
}

function requireRound(
  round: Doc<"quoteRounds"> | null,
  authorization: ActiveBuildAuthorization,
  quoteRoundId: Id<"quoteRounds">
) {
  if (
    !round ||
    round._id !== quoteRoundId ||
    round.buildId !== authorization.build._id ||
    round.proposalId !== authorization.proposal._id ||
    round.brokerageId !== authorization.brokerage._id ||
    round.organizationId !== authorization.organizationId
  ) {
    throw new ConvexError("Quote Round is unavailable for this Build.");
  }
  return round;
}

function assertExpectedRevision(
  round: Doc<"quoteRounds">,
  expectedRevision: number
) {
  if (
    !Number.isInteger(expectedRevision) ||
    expectedRevision !== round.revision
  ) {
    throw new ConvexError({
      code: "QUOTE_ROUND_REVISION_CONFLICT",
      currentRevision: round.revision,
      message: "Quote Round changed. Reload the latest lifecycle state.",
    });
  }
}

function assertSafeFutureDeadline(
  deadline: number,
  now: number,
  label = "Quote Response Deadline"
) {
  if (!Number.isSafeInteger(deadline) || deadline <= now) {
    throw new ConvexError(`${label} must be a future safe integer.`);
  }
}

async function appendLifecycleAudit(
  ctx: LifecycleCtx,
  authorization: ActiveBuildAuthorization,
  input: {
    entityId: string;
    entityType: string;
    eventType: string;
    command: string;
    priorState?: Record<string, unknown>;
    newState?: Record<string, unknown>;
    payloadPreview?: Record<string, unknown>;
    reason?: string;
    breakGlass?: boolean;
    overrideKind?: AuditOverrideKind;
    warnings?: string[];
  },
  now: number
) {
  await appendGovernedAuditEvent(ctx, authorization, {
    breakGlass: input.breakGlass,
    command: input.command,
    entityId: input.entityId,
    entityType: input.entityType,
    eventType: input.eventType,
    newState: input.newState ?? { status: "unspecified" },
    now,
    overrideKind: input.overrideKind,
    priorState: input.priorState ?? { status: "unspecified" },
    reason: input.reason ?? "Recorded material Quote lifecycle transition.",
    targetRevisions: [
      {
        entityId: input.entityId,
        entityType: input.entityType,
        revision:
          typeof input.newState?.revision === "number"
            ? input.newState.revision
            : undefined,
      },
    ],
    warnings: input.warnings,
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: authorization.brokerage._id,
    createdAt: now,
    eventType: input.eventType,
    organizationId: authorization.organizationId,
    payloadPreview: JSON.stringify({
      buildId: authorization.build._id,
      entityId: input.entityId,
      entityType: input.entityType,
      ...(input.payloadPreview ?? {}),
    }),
    relatedEntityId: input.entityId,
    relatedEntityType: input.entityType,
    status: "pending",
  });
}

async function endInvitationAccess(
  ctx: MutationCtx,
  invitation: Doc<"quoteRoundInvitations">,
  now: number,
  credentialState: "revoked" | "rotated"
) {
  const credentials = await ctx.db
    .query("quoteInvitationAccessCredentials")
    .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
      query.eq("quoteRoundInvitationId", invitation._id).eq("state", "active")
    )
    .take(101);
  if (credentials.length > 100) {
    throw new ConvexError("Quote Invitation has too many active credentials.");
  }
  for (const credential of credentials) {
    await ctx.db.patch(credential._id, {
      state: credentialState,
      updatedAt: now,
    });
    const sessions = await ctx.db
      .query("quoteInvitationBrowserSessions")
      .withIndex("by_quoteInvitationAccessCredentialId_and_state", (query) =>
        query
          .eq("quoteInvitationAccessCredentialId", credential._id)
          .eq("state", "active")
      )
      .take(13);
    if (sessions.length > 12) {
      throw new ConvexError("Quote Invitation has too many active sessions.");
    }
    for (const session of sessions) {
      await ctx.db.patch(session._id, { state: "revoked", updatedAt: now });
    }
  }
}

async function nextCredentialVersion(
  ctx: MutationCtx,
  invitationId: Id<"quoteRoundInvitations">
) {
  const latestCredential = await ctx.db
    .query("quoteInvitationAccessCredentials")
    .withIndex("by_quoteRoundInvitationId_and_credentialVersion", (query) =>
      query.eq("quoteRoundInvitationId", invitationId)
    )
    .order("desc")
    .first();
  return (latestCredential?.credentialVersion ?? 0) + 1;
}

export const closeQuoteRound = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    confirmed: v.boolean(),
    expectedRevision: v.number(),
    quoteRoundId: v.id("quoteRounds"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(lifecycleResultValidator)
  .handler(async (ctx, args) => {
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
  })
  .public();

export const cancelQuoteRound = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    confirmed: v.boolean(),
    expectedRevision: v.number(),
    quoteRoundId: v.id("quoteRounds"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(lifecycleResultValidator)
  .handler(async (ctx, args) => {
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
  })
  .public();

export const reopenQuoteRoundWithRevision = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    buildId: v.id("activeBuilds"),
    changedFieldKeys: v.optional(v.array(v.string())),
    confirmed: v.boolean(),
    expectedRevision: v.number(),
    quoteRoundId: v.id("quoteRounds"),
    reason: v.string(),
    responseDeadline: v.number(),
    workosOrganizationId: v.string(),
  })
  .returns(lifecycleResultValidator)
  .handler(async (ctx, args) => {
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
    if (round.state !== "closed") {
      throw new ConvexError("Only a closed Quote Round may be reopened.");
    }
    const previous = round.currentPackageRevisionId
      ? await ctx.db.get(round.currentPackageRevisionId)
      : null;
    if (!previous) {
      throw new ConvexError(
        "A closed Quote Round requires a current Package Revision."
      );
    }
    const now = Date.now();
    assertSafeFutureDeadline(args.responseDeadline, now);
    if (args.responseDeadline <= previous.responseDeadline) {
      throw new ConvexError(
        "A reopened Quote Round requires an extended future deadline."
      );
    }
    await clearPreferredForRound(ctx, round, {
      actor: {
        actorRoles: authorization.viewer.roles,
        actorWorkosUserId: authorization.viewer.subject,
      },
      command: "reopenQuoteRoundWithRevision",
      reason:
        "Quote Package Revision supersession cleared the Preferred Quote.",
    });
    const changedFieldKeys = normalizeChangedFieldKeys([
      ...(args.changedFieldKeys ?? []),
      "responseDeadline",
    ]);
    const accessExpiresAt = defaultQuoteInvitationAccessExpiry({
      publishedAt: now,
      responseDeadline: args.responseDeadline,
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
      responseDeadline: args.responseDeadline,
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
      now
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
        responseDeadline: args.responseDeadline,
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
          responseDeadline: args.responseDeadline,
          revision,
          state: "open",
        },
        payloadPreview: {
          invitationCount: invitationIds.length,
          packageRevision: revisionNumber,
          responseDeadline: args.responseDeadline,
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
      responseDeadline: args.responseDeadline,
      state: "open" as const,
      status: "reopened" as const,
    };
  })
  .public();

export const revokeQuoteRoundInvitation = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    buildId: v.id("activeBuilds"),
    confirmed: v.boolean(),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(invitationLifecycleResultValidator)
  .handler(async (ctx, args) => {
    requiredConfirmation(args.confirmed, "revoke a Quote Invitation");
    const reason = requiredReason(
      args.reason,
      "A Quote Invitation revocation reason"
    );
    const { authorization, breakGlass } = await authorizeLifecyclePath(ctx, {
      ...args,
      reason,
    });
    const invitation = await ctx.db.get(args.quoteRoundInvitationId);
    if (
      !invitation ||
      invitation.buildId !== authorization.build._id ||
      invitation.organizationId !== authorization.organizationId ||
      invitation.brokerageId !== authorization.brokerage._id
    ) {
      throw new ConvexError("Quote Invitation is unavailable for this Build.");
    }
    if (invitation.participationState === "revoked") {
      throw new ConvexError("Quote Invitation revocation is terminal.");
    }
    const now = Date.now();
    await endInvitationAccess(ctx, invitation, now, "revoked");
    await ctx.db.patch(invitation._id, {
      participationState: "revoked",
      revokedAt: now,
      revocationReason: reason,
      updatedAt: now,
    });
    await clearPreferredForInvitation(ctx, invitation, {
      actor: {
        actorRoles: authorization.viewer.roles,
        actorWorkosUserId: authorization.viewer.subject,
      },
      command: "revokeQuoteRoundInvitation",
      reason,
    });
    await enqueueCommunicationIntent(ctx, {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      idempotencyKey: `quote-invitation:${invitation._id}:revoked:${now}`,
      kind: "quote_invitation_revoked",
      organizationId: authorization.organizationId,
      payloadSnapshot: JSON.stringify({ event: "revoked", reason }),
      quoteRoundId: invitation.quoteRoundId,
      quoteRoundInvitationId: invitation._id,
      recipientEmailSnapshot: invitation.recipientEmailSnapshot,
      recipientNameSnapshot: invitation.recipientNameSnapshot,
      relatedEntityId: String(invitation._id),
      relatedEntityType: "quoteRoundInvitation",
      templateKey: "quote_invitation_revoked",
    });
    await appendLifecycleAudit(
      ctx,
      authorization,
      {
        command: "revokeQuoteRoundInvitation",
        entityId: String(invitation._id),
        entityType: "quoteRoundInvitation",
        eventType: "quote_invitation.revoked",
        newState: { participationState: "revoked" },
        priorState: { participationState: invitation.participationState },
        payloadPreview: { participationState: "revoked" },
        reason,
        breakGlass,
        overrideKind: "access_revocation",
      },
      now
    );
    return { invitationId: invitation._id, status: "revoked" as const };
  })
  .public();

export const remindQuoteInvitationAccess = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    buildId: v.id("activeBuilds"),
    confirmed: v.boolean(),
    preview: v.optional(v.boolean()),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(invitationLifecycleResultValidator)
  .handler(async (ctx, args) => {
    const reason = requiredReason(
      args.reason,
      "A Quote Invitation reminder reason"
    );
    const { authorization, breakGlass } = await authorizeLifecyclePath(ctx, {
      ...args,
      reason,
    });
    const scope = await resolveInvitationScope(
      ctx,
      await ctx.db.get(args.quoteRoundInvitationId)
    );
    if (
      !scope ||
      scope.invitation.organizationId !== authorization.organizationId ||
      scope.invitation.buildId !== authorization.build._id
    ) {
      throw new ConvexError("Quote Invitation is unavailable for this Build.");
    }
    if (
      scope.invitation.participationState !== "active" ||
      scope.round.state !== "open"
    ) {
      throw new ConvexError(
        "Only an active Invitation on a live Round may be reminded."
      );
    }
    const now = Date.now();
    const cooldownUntil = await quoteInvitationReminderCooldownUntil(
      ctx,
      scope.invitation._id,
      now
    );
    if (args.preview) {
      return {
        cooldownUntil,
        invitationId: scope.invitation._id,
        status: "preview" as const,
      };
    }
    requiredConfirmation(args.confirmed, "send a Quote Invitation reminder");
    if (cooldownUntil) {
      throw new ConvexError(
        `A Quote Invitation reminder was already sent recently. Try again after ${new Date(cooldownUntil).toISOString()}.`
      );
    }
    const generation = scope.invitation.accessGeneration ?? 1;
    const credentialVersion = await nextCredentialVersion(
      ctx,
      scope.invitation._id
    );
    const accessExpiresAt =
      scope.packageRevision.accessExpiresAt ??
      defaultQuoteInvitationAccessExpiry({
        publishedAt: scope.packageRevision.publishedAt,
        responseDeadline: scope.packageRevision.responseDeadline,
      });
    const credentialId =
      await createInitialQuoteInvitationCredentialAndDispatch(ctx, {
        accessExpiresAt,
        accessGeneration: generation,
        brokerage: scope.brokerage,
        build: authorization.build,
        invitation: scope.invitation,
        packageRevision: scope.packageRevision,
        publishedAt: now,
        credentialVersion,
        purpose: "reminder",
        communicationKind: "quote_invitation_reminder_manual",
        communicationPayload: { reason },
        quoteRound: scope.round,
        responseDeadline: scope.packageRevision.responseDeadline,
      });
    await ctx.db.insert("quoteRoundRecipientNoticeIntents", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      kind: "access_reminder",
      organizationId: authorization.organizationId,
      quotePackageRevisionId: scope.packageRevision._id,
      quoteRoundId: scope.round._id,
      quoteRoundInvitationId: scope.invitation._id,
      reason,
      status: "pending",
    });
    await appendLifecycleAudit(
      ctx,
      authorization,
      {
        command: "remindQuoteInvitationAccess",
        entityId: String(scope.invitation._id),
        entityType: "quoteRoundInvitation",
        eventType: "quote_invitation.access_reminded",
        newState: { accessGeneration: generation, credentialVersion },
        priorState: { accessGeneration: generation },
        payloadPreview: { accessGeneration: generation, credentialVersion },
        reason,
        breakGlass,
        overrideKind: "delivery_retry",
      },
      now
    );
    return {
      accessGeneration: generation,
      credentialId,
      invitationId: scope.invitation._id,
      status: "reminded" as const,
    };
  })
  .public();

export const rotateQuoteInvitationAccess = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    buildId: v.id("activeBuilds"),
    confirmed: v.boolean(),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(invitationLifecycleResultValidator)
  .handler(async (ctx, args) => {
    requiredConfirmation(args.confirmed, "rotate Quote Invitation access");
    const reason = requiredReason(
      args.reason,
      "A Quote Invitation access rotation reason"
    );
    const { authorization, breakGlass } = await authorizeLifecyclePath(ctx, {
      ...args,
      reason,
    });
    const scope = await resolveInvitationScope(
      ctx,
      await ctx.db.get(args.quoteRoundInvitationId)
    );
    if (
      !scope ||
      scope.invitation.organizationId !== authorization.organizationId ||
      scope.invitation.buildId !== authorization.build._id
    ) {
      throw new ConvexError("Quote Invitation is unavailable for this Build.");
    }
    if (
      scope.invitation.participationState !== "active" ||
      scope.round.state !== "open"
    ) {
      throw new ConvexError(
        "Only an active Invitation on a live Round may rotate access."
      );
    }
    const now = Date.now();
    await endInvitationAccess(ctx, scope.invitation, now, "rotated");
    const generation = (scope.invitation.accessGeneration ?? 1) + 1;
    const credentialVersion = await nextCredentialVersion(
      ctx,
      scope.invitation._id
    );
    await ctx.db.patch(scope.invitation._id, {
      accessGeneration: generation,
      updatedAt: now,
    });
    const packageRevision = scope.packageRevision;
    const accessExpiresAt =
      packageRevision.accessExpiresAt ??
      defaultQuoteInvitationAccessExpiry({
        publishedAt: packageRevision.publishedAt,
        responseDeadline: packageRevision.responseDeadline,
      });
    const credentialId =
      await createInitialQuoteInvitationCredentialAndDispatch(ctx, {
        accessExpiresAt,
        accessGeneration: generation,
        brokerage: scope.brokerage,
        build: authorization.build,
        credentialVersion,
        invitation: { ...scope.invitation, accessGeneration: generation },
        packageRevision,
        publishedAt: now,
        purpose: "rotation",
        communicationKind: "quote_invitation_rotation",
        communicationPayload: { reason },
        quoteRound: scope.round,
        responseDeadline: packageRevision.responseDeadline,
      });
    await ctx.db.insert("quoteRoundRecipientNoticeIntents", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      kind: "access_rotated",
      organizationId: authorization.organizationId,
      quotePackageRevisionId: packageRevision._id,
      quoteRoundId: scope.round._id,
      quoteRoundInvitationId: scope.invitation._id,
      reason,
      status: "pending",
    });
    await appendLifecycleAudit(
      ctx,
      authorization,
      {
        command: "rotateQuoteInvitationAccess",
        entityId: String(scope.invitation._id),
        entityType: "quoteRoundInvitation",
        eventType: "quote_invitation.access_rotated",
        newState: { accessGeneration: generation },
        priorState: { accessGeneration: generation - 1 },
        payloadPreview: { accessGeneration: generation },
        reason,
        breakGlass,
        overrideKind: "access_rotation",
      },
      now
    );
    return {
      accessGeneration: generation,
      credentialId,
      invitationId: scope.invitation._id,
      status: "rotated" as const,
    };
  })
  .public();

export const replaceQuoteRoundInvitationEmail = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    buildId: v.id("activeBuilds"),
    confirmed: v.boolean(),
    correctedEmail: v.string(),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(invitationLifecycleResultValidator)
  .handler(async (ctx, args) => {
    requiredConfirmation(
      args.confirmed,
      "replace a Quote Invitation recipient email"
    );
    const reason = requiredReason(
      args.reason,
      "A Quote Invitation email correction reason"
    );
    const { authorization, breakGlass } = await authorizeLifecyclePath(ctx, {
      ...args,
      reason,
    });
    const email = normalizeContractorEmail(args.correctedEmail);
    if (!email) {
      throw new ConvexError(
        "Enter a valid corrected Quote recipient email address."
      );
    }
    const invitation = await ctx.db.get(args.quoteRoundInvitationId);
    if (
      !invitation ||
      invitation.buildId !== authorization.build._id ||
      invitation.organizationId !== authorization.organizationId ||
      invitation.brokerageId !== authorization.brokerage._id
    ) {
      throw new ConvexError("Quote Invitation is unavailable for this Build.");
    }
    if (invitation.participationState !== "active") {
      throw new ConvexError("A revoked Quote Invitation cannot be replaced.");
    }
    const scope = await resolveInvitationScope(ctx, invitation);
    if (!scope) {
      throw new ConvexError("Quote Invitation package is unavailable.");
    }
    const existingProfiles = await ctx.db
      .query("contractorProfiles")
      .withIndex("by_brokerage_normalized_email", (query) =>
        query
          .eq("brokerageId", authorization.brokerage._id)
          .eq("normalizedEmail", email)
      )
      .take(501);
    const activeProfiles = existingProfiles.filter(
      (profile) => profile.status === "active"
    );
    if (activeProfiles.length > 1) {
      throw new ConvexError(
        "Multiple active Quote recipient profiles share the corrected email."
      );
    }
    const now = Date.now();
    const profile =
      activeProfiles[0] ??
      (await createReplacementRecipientProfile(
        ctx,
        authorization,
        invitation,
        email,
        now
      ));
    const duplicate = await ctx.db
      .query("quoteRoundInvitations")
      .withIndex("by_quoteRoundId_and_recipientProfileId", (query) =>
        query
          .eq("quoteRoundId", invitation.quoteRoundId)
          .eq("recipientProfileId", profile._id)
      )
      .take(101);
    if (duplicate.some((row) => row.participationState === "active")) {
      throw new ConvexError(
        "The corrected recipient already has an active Quote Invitation on this Round."
      );
    }
    await endInvitationAccess(ctx, invitation, now, "revoked");
    await ctx.db.patch(invitation._id, {
      participationState: "revoked",
      revokedAt: now,
      revocationReason: reason,
      updatedAt: now,
    });
    await clearPreferredForInvitation(ctx, invitation, {
      actor: {
        actorRoles: authorization.viewer.roles,
        actorWorkosUserId: authorization.viewer.subject,
      },
      command: "replaceQuoteRoundInvitationEmail",
      reason,
    });
    const replacementId = await ctx.db.insert("quoteRoundInvitations", {
      accessGeneration: 1,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      currentQuotePackageRevisionId: scope.packageRevision._id,
      organizationId: authorization.organizationId,
      participationState: "active",
      // The corrected recipient starts at the Round's current revision. It
      // never inherits Draft/Submissions from the replaced Invitation.
      quotePackageRevisionId: scope.packageRevision._id,
      quoteRoundId: invitation.quoteRoundId,
      recipientCapabilitiesSnapshot: invitation.recipientCapabilitiesSnapshot,
      recipientEmailSnapshot: email,
      recipientNameSnapshot: profile.name || invitation.recipientNameSnapshot,
      recipientProfileId: profile._id,
      supersedesInvitationId: invitation._id,
      updatedAt: now,
    });
    const replacement = await ctx.db.get(replacementId);
    const packageRevision = await ctx.db.get(scope.packageRevision._id);
    const round = await ctx.db.get(invitation.quoteRoundId);
    if (!(replacement && packageRevision && round)) {
      throw new ConvexError("Replacement Quote Invitation was not created.");
    }
    const accessExpiresAt =
      packageRevision.accessExpiresAt ??
      defaultQuoteInvitationAccessExpiry({
        publishedAt: packageRevision.publishedAt,
        responseDeadline: packageRevision.responseDeadline,
      });
    await createInitialQuoteInvitationCredentialAndDispatch(ctx, {
      accessExpiresAt,
      brokerage: authorization.brokerage,
      build: authorization.build,
      invitation: replacement,
      packageRevision,
      publishedAt: now,
      communicationKind: "quote_invitation_recipient_replaced",
      communicationPayload: { reason },
      quoteRound: round,
      responseDeadline: packageRevision.responseDeadline,
    });
    await ctx.db.insert("quoteRoundRecipientNoticeIntents", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      kind: "recipient_replaced",
      organizationId: authorization.organizationId,
      quotePackageRevisionId: packageRevision._id,
      quoteRoundId: round._id,
      quoteRoundInvitationId: replacementId,
      reason,
      status: "pending",
    });
    await appendLifecycleAudit(
      ctx,
      authorization,
      {
        command: "replaceQuoteRoundInvitationEmail",
        entityId: String(invitation._id),
        entityType: "quoteRoundInvitation",
        eventType: "quote_invitation.recipient_replaced",
        newState: {
          invitationId: String(replacementId),
          recipientEmailMasked: maskRecipientEmailForAudit(email),
        },
        priorState: {
          participationState: "active",
          recipientEmailMasked: maskRecipientEmailForAudit(
            invitation.recipientEmailSnapshot
          ),
        },
        payloadPreview: {
          invitationId: String(invitation._id),
          replacementInvitationId: String(replacementId),
        },
        reason,
        breakGlass,
        overrideKind: "corrected_recipient_replacement",
      },
      now
    );
    return {
      invitationId: invitation._id,
      replacementInvitationId: replacementId,
      status: "replaced" as const,
    };
  })
  .public();

export const acknowledgeQuoteInvitationPackageRevision = publicMutation
  .input({
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    acknowledgedFieldKeys: v.array(v.string()),
    sessionToken: v.string(),
  })
  .returns(acknowledgementResultValidator)
  .handler(async (ctx, args) => {
    assertAcknowledgedFieldKeysBounds(args.acknowledgedFieldKeys);
    const access = await resolveQuoteInvitationBrowserWriteAccess(ctx, args);
    return await acknowledgeForAccess(ctx, access, args.acknowledgedFieldKeys);
  })
  .public();

export const acknowledgeClaimedQuoteInvitationPackageRevision =
  authenticatedMutation
    .input({
      quoteRoundInvitationId: v.id("quoteRoundInvitations"),
      acknowledgedFieldKeys: v.array(v.string()),
    })
    .returns(acknowledgementResultValidator)
    .handler(async (ctx, args) => {
      assertAcknowledgedFieldKeysBounds(args.acknowledgedFieldKeys);
      const access = await resolveQuoteInvitationClaimedWriteAccess(ctx, {
        quoteRoundInvitationId: args.quoteRoundInvitationId,
        workosUserId: ctx.viewer.subject,
      });
      return await acknowledgeForAccess(
        ctx,
        access,
        args.acknowledgedFieldKeys,
        ctx.viewer.subject
      );
    })
    .public();

async function acknowledgeForAccess(
  ctx: MutationCtx,
  access:
    | Awaited<ReturnType<typeof resolveQuoteInvitationBrowserWriteAccess>>
    | Awaited<ReturnType<typeof resolveQuoteInvitationClaimedWriteAccess>>,
  acknowledgedFieldKeys: string[],
  workosUserId?: string
) {
  assertAcknowledgedFieldKeysBounds(acknowledgedFieldKeys);
  if (
    access.status === "unavailable" ||
    access.status === "superseded" ||
    !access.scope
  ) {
    throw new ConvexError(
      "Quote Invitation is unavailable for acknowledgement."
    );
  }
  if (access.status !== "available") {
    throw new ConvexError(
      "Quote Package Revision acknowledgement is read-only."
    );
  }
  const scope = access.scope;
  await assertOrganizationRetentionWritable(
    ctx,
    scope.invitation.organizationId
  );
  const acknowledgement = await ctx.db
    .query("quoteInvitationPackageRevisionAcknowledgements")
    .withIndex(
      "by_quoteRoundInvitationId_and_quotePackageRevisionId",
      (query) =>
        query
          .eq("quoteRoundInvitationId", scope.invitation._id)
          .eq("quotePackageRevisionId", scope.packageRevision._id)
    )
    .unique();
  if (!acknowledgement) {
    return {
      acknowledgedFieldKeys: [],
      invitationId: scope.invitation._id,
      quotePackageRevisionId: scope.packageRevision._id,
      status: "acknowledged" as const,
    };
  }
  const keys = normalizeChangedFieldKeys(acknowledgedFieldKeys);
  const required = new Set(acknowledgement.changedFieldKeys);
  if (keys.length !== required.size || keys.some((key) => !required.has(key))) {
    throw new ConvexError(
      "Review and acknowledge every changed Quote Package field."
    );
  }
  await migratePriorRevisionDraftForAccess(ctx, scope);
  const now = Date.now();
  await ctx.db.patch(acknowledgement._id, {
    acknowledgedAt: now,
    acknowledgedByWorkosUserId: workosUserId,
    acknowledgedFieldKeys: keys,
    status: "acknowledged",
    updatedAt: now,
  });
  const notice = await ctx.db
    .query("quoteRoundRecipientNoticeIntents")
    .withIndex(
      "by_quoteRoundInvitationId_and_quotePackageRevisionId_and_kind",
      (query) =>
        query
          .eq("quoteRoundInvitationId", scope.invitation._id)
          .eq("quotePackageRevisionId", scope.packageRevision._id)
          .eq("kind", "package_revision_published")
    )
    .order("desc")
    .first();
  if (notice && notice.status === "pending") {
    await ctx.db.patch(notice._id, {
      acknowledgedAt: now,
      status: "acknowledged",
    });
  }
  return {
    acknowledgedFieldKeys: keys,
    invitationId: scope.invitation._id,
    quotePackageRevisionId: scope.packageRevision._id,
    status: "acknowledged" as const,
  };
}

function normalizeChangedFieldKeys(values: string[] | undefined) {
  const keys = [
    ...new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  ];
  if (keys.some((key) => key.length > 128)) {
    throw new ConvexError(
      "Changed Quote Package field keys must be 128 characters or fewer."
    );
  }
  if (keys.length > 100) {
    throw new ConvexError(
      "A Quote Package Revision may identify at most 100 changed fields."
    );
  }
  return keys;
}

function assertAcknowledgedFieldKeysBounds(values: string[]) {
  if (values.length > 100) {
    throw new ConvexError(
      "A Quote Package Revision acknowledgement may include at most 100 fields."
    );
  }
}

async function createReplacementRecipientProfile(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  invitation: Doc<"quoteRoundInvitations">,
  email: string,
  now: number
) {
  const profileId = await ctx.db.insert("contractorProfiles", {
    brokerageId: authorization.brokerage._id,
    createdAt: now,
    email,
    kind: "company",
    name: invitation.recipientNameSnapshot,
    normalizedEmail: email,
    onboardingStatus: "profile_only",
    organizationId: authorization.organizationId,
    quoteRecipientCapabilities: invitation.recipientCapabilitiesSnapshot,
    quoteRecipientProvisioningState: "provisional",
    source: "builder_created",
    status: "active",
    trades: [],
    updatedAt: now,
  });
  const profile = await ctx.db.get(profileId);
  if (!profile) {
    throw new ConvexError(
      "Replacement Quote recipient profile was not created."
    );
  }
  return profile;
}

async function clonePackageRevisionRows(
  ctx: MutationCtx,
  previous: Doc<"quotePackageRevisions">,
  packageRevisionId: Id<"quotePackageRevisions">,
  quoteRoundId: Id<"quoteRounds">,
  authorization: ActiveBuildAuthorization,
  now: number
) {
  const [attachments, labourLines, materialLines, responseFields] =
    await Promise.all([
      ctx.db
        .query("quotePackageRevisionAttachments")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", previous._id)
        )
        .take(201),
      ctx.db
        .query("quotePackageRevisionLabourLines")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", previous._id)
        )
        .take(101),
      ctx.db
        .query("quotePackageRevisionMaterialLines")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", previous._id)
        )
        .take(101),
      ctx.db
        .query("quotePackageRevisionResponseFields")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", previous._id)
        )
        .take(101),
    ]);
  if (
    attachments.length > 200 ||
    labourLines.length > 100 ||
    materialLines.length > 100 ||
    responseFields.length > 100
  ) {
    throw new ConvexError(
      "Quote Package Revision exceeds supported scope limits."
    );
  }
  const assignmentsByMaterialLineId = new Map<
    Id<"quotePackageRevisionMaterialLines">,
    Doc<"quotePackageRevisionMaterialAssignments">[]
  >();
  for (const row of materialLines) {
    const assignments = await ctx.db
      .query("quotePackageRevisionMaterialAssignments")
      .withIndex("by_quotePackageRevisionMaterialLineId_and_order", (query) =>
        query.eq("quotePackageRevisionMaterialLineId", row._id)
      )
      .take(101);
    if (assignments.length > 100) {
      throw new ConvexError(
        "Quote Package Material line has too many assignments."
      );
    }
    assignmentsByMaterialLineId.set(row._id, assignments);
  }
  const serializedBytes = [
    ...attachments,
    ...labourLines,
    ...materialLines,
    ...responseFields,
    ...Array.from(assignmentsByMaterialLineId.values()).flat(),
  ].reduce((total, row) => total + serializedStringBytes(row), 0);
  if (serializedBytes > MAX_REOPEN_CLONE_SERIALIZED_BYTES) {
    throw new ConvexError(
      "Quote Package Revision content exceeds the transaction size safety limit."
    );
  }
  for (const row of attachments) {
    await ctx.db.insert("quotePackageRevisionAttachments", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      contentHashSha256Snapshot: row.contentHashSha256Snapshot,
      createdAt: now,
      fileNameSnapshot: row.fileNameSnapshot,
      kind: row.kind,
      mimeTypeSnapshot: row.mimeTypeSnapshot,
      order: row.order,
      organizationId: authorization.organizationId,
      quotePackageRevisionId: packageRevisionId,
      quoteRoundId,
      sizeBytesSnapshot: row.sizeBytesSnapshot,
      sourceBuildDocumentId: row.sourceBuildDocumentId,
      sourceBuildSubmilestoneId: row.sourceBuildSubmilestoneId,
      sourceDocumentVersionSnapshot: row.sourceDocumentVersionSnapshot,
      storageIdSnapshot: row.storageIdSnapshot,
    });
  }
  for (const row of labourLines) {
    await ctx.db.insert("quotePackageRevisionLabourLines", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      buildMilestoneId: row.buildMilestoneId,
      buildSubmilestoneId: row.buildSubmilestoneId,
      budgetCents: row.budgetCents,
      createdAt: now,
      durationDays: row.durationDays,
      milestoneKey: row.milestoneKey,
      milestoneName: row.milestoneName,
      order: row.order,
      organizationId: authorization.organizationId,
      quotePackageRevisionId: packageRevisionId,
      quoteRoundId,
      scopeOfWorkTiptapJson: row.scopeOfWorkTiptapJson,
      startDay: row.startDay,
      submilestoneKey: row.submilestoneKey,
      submilestoneName: row.submilestoneName,
    });
  }
  const materialLineMap = new Map<
    Id<"quotePackageRevisionMaterialLines">,
    Id<"quotePackageRevisionMaterialLines">
  >();
  for (const row of materialLines) {
    const nextId = await ctx.db.insert("quotePackageRevisionMaterialLines", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      deliveryEndDay: row.deliveryEndDay,
      deliveryInstructions: row.deliveryInstructions,
      deliveryLocation: row.deliveryLocation,
      deliveryStartDay: row.deliveryStartDay,
      description: row.description,
      order: row.order,
      organizationId: authorization.organizationId,
      quantity: row.quantity,
      quotePackageRevisionId: packageRevisionId,
      quoteRoundId,
      source: row.source,
      sourceBuildCostItemId: row.sourceBuildCostItemId,
      sourceDraftRowKey: row.sourceDraftRowKey,
      specificationTiptapJson: row.specificationTiptapJson,
      title: row.title,
      unit: row.unit,
    });
    materialLineMap.set(row._id, nextId);
  }
  for (const row of materialLines) {
    const nextLineId = materialLineMap.get(row._id);
    if (!nextLineId) {
      continue;
    }
    const assignments = assignmentsByMaterialLineId.get(row._id) ?? [];
    for (const assignment of assignments) {
      await ctx.db.insert("quotePackageRevisionMaterialAssignments", {
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        buildMilestoneId: assignment.buildMilestoneId,
        buildSubmilestoneId: assignment.buildSubmilestoneId,
        createdAt: now,
        durationDays: assignment.durationDays,
        milestoneKey: assignment.milestoneKey,
        milestoneName: assignment.milestoneName,
        order: assignment.order,
        organizationId: authorization.organizationId,
        quotePackageRevisionId: packageRevisionId,
        quotePackageRevisionMaterialLineId: nextLineId,
        quoteRoundId,
        startDay: assignment.startDay,
        submilestoneKey: assignment.submilestoneKey,
        submilestoneName: assignment.submilestoneName,
      });
    }
  }
  for (const row of responseFields) {
    await ctx.db.insert("quotePackageRevisionResponseFields", {
      allowAlternates: row.allowAlternates,
      allowExclusions: row.allowExclusions,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      choiceOptions: row.choiceOptions,
      createdAt: now,
      fieldKey: row.fieldKey,
      isPermanent: row.isPermanent,
      kind: row.kind,
      label: row.label,
      order: row.order,
      organizationId: authorization.organizationId,
      quotePackageRevisionId: packageRevisionId,
      quoteRoundId,
      renderer: row.renderer,
      repeatable: row.repeatable,
      required: row.required,
      richTextDefaultHtml: row.richTextDefaultHtml,
      scope: row.scope,
      sourceTemplateFieldId: row.sourceTemplateFieldId,
      supportsTax: row.supportsTax,
      tax: row.tax,
      validation: row.validation,
    });
  }
}

function serializedStringBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value) ?? "").byteLength;
}
