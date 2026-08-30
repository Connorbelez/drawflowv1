import { ConvexError } from "convex/values";

import {
  acknowledgeForAccess,
  appendLifecycleAudit,
  assertAcknowledgedFieldKeysBounds,
  authorizeLifecyclePath,
  createReplacementRecipientProfile,
  endInvitationAccess,
  nextCredentialVersion,
  quoteInvitationReminderCooldownUntil,
  requiredConfirmation,
  requiredReason,
  type LifecycleCtx,
} from "./core";
import {
  createInitialQuoteInvitationCredentialAndDispatch,
  defaultQuoteInvitationAccessExpiry,
  resolveInvitationScope,
  resolveQuoteInvitationBrowserWriteAccess,
  resolveQuoteInvitationClaimedWriteAccess,
} from "../quote_invitation_access";
import { maskRecipientEmailForAudit } from "../administrative_override_policy";
import { normalizeContractorEmail } from "../contractorWorkspace";
import { enqueueCommunicationIntent } from "../email_transport";
import { clearPreferredForInvitation } from "../quote_preferred";
import type { Id, MutationCtx } from "../types";

type AdministrativeOverrideArgs = {
  administrativeCapacity?: "builder" | "builder-staff" | "admin";
  breakGlassConfirmed?: boolean;
};

type BaseInvitationArgs = AdministrativeOverrideArgs & {
  buildId: Id<"activeBuilds">;
  confirmed: boolean;
  quoteRoundInvitationId: Id<"quoteRoundInvitations">;
  reason: string;
  workosOrganizationId: string;
};

export type RevokeQuoteRoundInvitationArgs = BaseInvitationArgs;
export type RemindQuoteInvitationAccessArgs = BaseInvitationArgs & {
  preview?: boolean;
};
export type RotateQuoteInvitationAccessArgs = BaseInvitationArgs;
export type ReplaceQuoteRoundInvitationEmailArgs = BaseInvitationArgs & {
  correctedEmail: string;
};
export type AcknowledgeQuoteInvitationPackageRevisionArgs = {
  quoteRoundInvitationId: Id<"quoteRoundInvitations">;
  acknowledgedFieldKeys: string[];
  sessionToken: string;
};
export type AcknowledgeClaimedQuoteInvitationPackageRevisionArgs = {
  quoteRoundInvitationId: Id<"quoteRoundInvitations">;
  acknowledgedFieldKeys: string[];
};

export async function revokeQuoteRoundInvitationHandler(
  ctx: LifecycleCtx,
  args: RevokeQuoteRoundInvitationArgs
) {
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
}
export async function remindQuoteInvitationAccessHandler(
  ctx: LifecycleCtx,
  args: RemindQuoteInvitationAccessArgs
) {
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
}
export async function rotateQuoteInvitationAccessHandler(
  ctx: LifecycleCtx,
  args: RotateQuoteInvitationAccessArgs
) {
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
}
export async function replaceQuoteRoundInvitationEmailHandler(
  ctx: LifecycleCtx,
  args: ReplaceQuoteRoundInvitationEmailArgs
) {
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
}
export async function acknowledgeQuoteInvitationPackageRevisionHandler(
  ctx: MutationCtx,
  args: AcknowledgeQuoteInvitationPackageRevisionArgs
) {
    assertAcknowledgedFieldKeysBounds(args.acknowledgedFieldKeys);
    const access = await resolveQuoteInvitationBrowserWriteAccess(ctx, args);
    return await acknowledgeForAccess(ctx, access, args.acknowledgedFieldKeys);
}
export async function acknowledgeClaimedQuoteInvitationPackageRevisionHandler(
  ctx: LifecycleCtx,
  args: AcknowledgeClaimedQuoteInvitationPackageRevisionArgs
) {
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
}
