import { ConvexError } from "convex/values";

import {
  DEFAULT_ACCESS_WINDOW_AFTER_DEADLINE_MS,
  MAX_ACTIVE_SESSIONS_PER_CREDENTIAL,
  SESSION_INACTIVITY_WINDOW_MS,
  InvitationAccessCtx,
  InvitationScope,
  boundedSecret,
  randomSecret,
  quoteInvitationSecretVerifier,
} from "./core";
import type { Doc, Id, MutationCtx } from "../types";

export async function quoteInvitationAccessProjection(
  ctx: InvitationAccessCtx,
  scope: InvitationScope,
  options?: { sessionExpiresAt?: number }
) {
  const [labourLines, materialLines, attachments, responseFields] =
    await Promise.all([
      ctx.db
        .query("quotePackageRevisionLabourLines")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", scope.packageRevision._id)
        )
        .take(101),
      ctx.db
        .query("quotePackageRevisionMaterialLines")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", scope.packageRevision._id)
        )
        .take(101),
      ctx.db
        .query("quotePackageRevisionAttachments")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", scope.packageRevision._id)
        )
        .take(201),
      ctx.db
        .query("quotePackageRevisionResponseFields")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", scope.packageRevision._id)
        )
        .take(101),
    ]);
  if (
    labourLines.length > 100 ||
    materialLines.length > 100 ||
    attachments.length > 200 ||
    responseFields.length > 100
  ) {
    throw new ConvexError("Quote Invitation package exceeds access limits.");
  }
  assertPackageRowsScope(scope, [
    ...labourLines,
    ...materialLines,
    ...attachments,
    ...responseFields,
  ]);
  return {
    accessExpiresAt: latestAccessExpiry(scope),
    invitationId: scope.invitation._id,
    issuerName: scope.brokerage.displayName,
    package: {
      attachments: attachments.map((attachment) => ({
        fileName: attachment.fileNameSnapshot,
        kind: attachment.kind,
        mimeType: attachment.mimeTypeSnapshot,
        sizeBytes: attachment.sizeBytesSnapshot,
        sourceAttachmentId: attachment._id,
      })),
      labourLines: labourLines.map((line) => ({
        budgetCents: line.budgetCents,
        durationDays: line.durationDays,
        milestoneName: line.milestoneName,
        scopeOfWorkTiptapJson: line.scopeOfWorkTiptapJson,
        sourceScopeChangeReason: line.sourceScopeChangeReason,
        sourceScopeRevisionId: line.sourceScopeRevisionId,
        sourceScopeVersion: line.sourceScopeVersion,
        sourceLineId: line._id,
        startDay: line.startDay,
        submilestoneName: line.submilestoneName,
      })),
      materialLines: materialLines.map((line) => ({
        deliveryEndDay: line.deliveryEndDay,
        deliveryInstructions: line.deliveryInstructions,
        deliveryLocation: line.deliveryLocation,
        deliveryStartDay: line.deliveryStartDay,
        description: line.description,
        quantity: line.quantity,
        specificationTiptapJson: line.specificationTiptapJson,
        sourceLineId: line._id,
        title: line.title,
        unit: line.unit,
      })),
      responseDeadline: scope.packageRevision.responseDeadline,
      responseFields: responseFields.map((field) => ({
        choiceOptions: field.choiceOptions,
        fieldKey: field.fieldKey,
        kind: field.kind,
        label: field.label,
        required: field.required,
        renderer: field.renderer,
        richTextDefaultHtml: field.richTextDefaultHtml,
        scope: field.scope,
        sourceFieldId: field._id,
      })),
      revision: scope.packageRevision.revision,
      siteAddress: scope.packageRevision.siteAddressSnapshot,
      siteMapUrl: scope.packageRevision.siteMapUrlSnapshot,
      timelineCurrentDay: scope.packageRevision.timelineCurrentDaySnapshot,
      timelineRangeMax: scope.packageRevision.timelineRangeMaxSnapshot,
      timelineRangeMin: scope.packageRevision.timelineRangeMinSnapshot,
      timelineStartDate: scope.packageRevision.timelineStartDateSnapshot,
    },
    recipientName: scope.invitation.recipientNameSnapshot,
    roundState: scope.round.state,
    ...(options?.sessionExpiresAt === undefined
      ? {}
      : { sessionExpiresAt: options.sessionExpiresAt }),
  };
}

export function assertPackageRowsScope(
  scope: InvitationScope,
  rows: Array<
    | Doc<"quotePackageRevisionAttachments">
    | Doc<"quotePackageRevisionLabourLines">
    | Doc<"quotePackageRevisionMaterialLines">
    | Doc<"quotePackageRevisionResponseFields">
  >
) {
  if (
    rows.some(
      (row) =>
        row.brokerageId !== scope.invitation.brokerageId ||
        row.organizationId !== scope.invitation.organizationId ||
        row.buildId !== scope.invitation.buildId ||
        row.quoteRoundId !== scope.invitation.quoteRoundId ||
        row.quotePackageRevisionId !== scope.packageRevision._id
    )
  ) {
    throw new ConvexError("Quote Invitation package row crosses its scope.");
  }
}

export function latestAccessExpiry(scope: InvitationScope) {
  // All initial credentials share the package Access Window. This projection is
  // called only after a concrete credential or linked account has been checked;
  // use the package deadline as a defensive lower bound until later generations
  // are introduced by renewal/rotation commands.
  return (
    scope.packageRevision.accessExpiresAt ??
    scope.packageRevision.responseDeadline +
      DEFAULT_ACCESS_WINDOW_AFTER_DEADLINE_MS
  );
}

export async function expireCredential(
  ctx: MutationCtx,
  credential: Doc<"quoteInvitationAccessCredentials">,
  now: number
) {
  if (credential.state !== "active") {
    return;
  }
  await ctx.db.patch(credential._id, { state: "expired", updatedAt: now });
  const activeSessions = await ctx.db
    .query("quoteInvitationBrowserSessions")
    .withIndex("by_quoteInvitationAccessCredentialId_and_state", (query) =>
      query
        .eq("quoteInvitationAccessCredentialId", credential._id)
        .eq("state", "active")
    )
    .take(MAX_ACTIVE_SESSIONS_PER_CREDENTIAL + 1);
  for (const session of activeSessions) {
    await ctx.db.patch(session._id, { state: "expired", updatedAt: now });
  }
  const invitation = await ctx.db.get(credential.quoteRoundInvitationId);
  if (invitation) {
    await writeAccessEvent(ctx, {
      credentialId: credential._id,
      eventType: "credential_expired",
      invitation,
    });
  }
}

export async function exchangeBrowserSession(
  ctx: MutationCtx,
  input: {
    credential: Doc<"quoteInvitationAccessCredentials">;
    existingSessionToken?: string;
    now: number;
    scope: InvitationScope;
  }
) {
  const existingSessionToken = boundedSecret(input.existingSessionToken);
  if (existingSessionToken) {
    const sessionVerifier =
      await quoteInvitationSecretVerifier(existingSessionToken);
    const existing = await ctx.db
      .query("quoteInvitationBrowserSessions")
      .withIndex("by_sessionVerifier", (query) =>
        query.eq("sessionVerifier", sessionVerifier)
      )
      .unique();
    if (
      existing &&
      existing.quoteInvitationAccessCredentialId === input.credential._id &&
      existing.quoteRoundInvitationId === input.scope.invitation._id &&
      existing.state === "active"
    ) {
      if (
        input.now >= existing.accessExpiresAt ||
        input.now >= existing.sessionExpiresAt
      ) {
        await ctx.db.patch(existing._id, {
          state: "expired",
          updatedAt: input.now,
        });
      } else {
        const sessionExpiresAt = boundedSessionExpiry(
          input.credential.accessExpiresAt,
          input.now
        );
        await ctx.db.patch(existing._id, {
          lastActiveAt: input.now,
          sessionExpiresAt,
          updatedAt: input.now,
        });
        await writeAccessEvent(ctx, {
          credentialId: input.credential._id,
          eventType: "session_reused",
          invitation: input.scope.invitation,
          sessionId: existing._id,
        });
        return { sessionExpiresAt, sessionToken: existingSessionToken };
      }
    }
  }

  await constrainActiveSessions(ctx, input.credential, input.now);
  const sessionToken = randomSecret();
  const sessionExpiresAt = boundedSessionExpiry(
    input.credential.accessExpiresAt,
    input.now
  );
  const sessionId = await ctx.db.insert("quoteInvitationBrowserSessions", {
    accessExpiresAt: input.credential.accessExpiresAt,
    brokerageId: input.scope.invitation.brokerageId,
    buildId: input.scope.invitation.buildId,
    createdAt: input.now,
    lastActiveAt: input.now,
    organizationId: input.scope.invitation.organizationId,
    quoteInvitationAccessCredentialId: input.credential._id,
    quoteRoundId: input.scope.invitation.quoteRoundId,
    quoteRoundInvitationId: input.scope.invitation._id,
    sessionExpiresAt,
    sessionVerifier: await quoteInvitationSecretVerifier(sessionToken),
    state: "active",
    updatedAt: input.now,
  });
  await writeAccessEvent(ctx, {
    credentialId: input.credential._id,
    eventType: "session_exchanged",
    invitation: input.scope.invitation,
    sessionId,
  });
  return { sessionExpiresAt, sessionToken };
}

export function boundedSessionExpiry(accessExpiresAt: number, now: number) {
  return Math.min(accessExpiresAt, now + SESSION_INACTIVITY_WINDOW_MS);
}

export async function constrainActiveSessions(
  ctx: MutationCtx,
  credential: Doc<"quoteInvitationAccessCredentials">,
  now: number
) {
  const activeSessions = await ctx.db
    .query("quoteInvitationBrowserSessions")
    .withIndex("by_quoteInvitationAccessCredentialId_and_state", (query) =>
      query
        .eq("quoteInvitationAccessCredentialId", credential._id)
        .eq("state", "active")
    )
    .order("asc")
    .take(MAX_ACTIVE_SESSIONS_PER_CREDENTIAL + 1);
  const overflow =
    activeSessions.length - MAX_ACTIVE_SESSIONS_PER_CREDENTIAL + 1;
  for (const session of activeSessions.slice(0, Math.max(0, overflow))) {
    await ctx.db.patch(session._id, { state: "revoked", updatedAt: now });
  }
}

export async function writeAccessEvent(
  ctx: MutationCtx,
  input: {
    credentialId?: Id<"quoteInvitationAccessCredentials">;
    eventType:
      | "credential_expired"
      | "profile_claimed"
      | "session_exchanged"
      | "session_reused";
    invitation: Doc<"quoteRoundInvitations">;
    sessionId?: Id<"quoteInvitationBrowserSessions">;
  }
) {
  await ctx.db.insert("quoteInvitationAccessEvents", {
    brokerageId: input.invitation.brokerageId,
    buildId: input.invitation.buildId,
    createdAt: Date.now(),
    eventType: input.eventType,
    organizationId: input.invitation.organizationId,
    quoteInvitationAccessCredentialId: input.credentialId,
    quoteInvitationBrowserSessionId: input.sessionId,
    quoteRoundId: input.invitation.quoteRoundId,
    quoteRoundInvitationId: input.invitation._id,
  });
}
