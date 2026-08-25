import { ConvexError } from "convex/values";

import {
  type CommunicationIntentKind,
  deriveCommunicationSecret,
  enqueueCommunicationIntent,
} from "../email_transport";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

export const MAX_ACTIVE_SESSIONS_PER_CREDENTIAL = 12;
export const MAX_ACCESS_WINDOW_AFTER_PUBLICATION_MS = 90 * 24 * 60 * 60 * 1000;
export const MAX_ACCOUNT_PROFILE_SCAN = 500;
export const MAX_EXACT_EMAIL_PROFILE_SCAN = 500;
export const SESSION_INACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_ACCESS_WINDOW_AFTER_DEADLINE_MS = 7 * 24 * 60 * 60 * 1000;
export type InvitationAccessCtx = QueryCtx | MutationCtx;

export interface InvitationScope {
  brokerage: Doc<"brokerages">;
  invitation: Doc<"quoteRoundInvitations">;
  packageRevision: Doc<"quotePackageRevisions">;
  profile: Doc<"contractorProfiles">;
  round: Doc<"quoteRounds">;
}

/**
 * New Package Revisions may require an explicit recipient review gate. Initial
 * revisions have no acknowledgement row and therefore remain immediately
 * writable; reopened revisions create one pending row per existing Invitation
 * while advancing its current package projection.
 */
export async function quoteInvitationPackageRevisionAcknowledgement(
  ctx: InvitationAccessCtx,
  scope: InvitationScope
) {
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
      acknowledged: true,
      acknowledgedFieldKeys: [] as string[],
      changedFieldKeys: [] as string[],
      required: false,
      status: "acknowledged" as const,
    };
  }
  if (
    acknowledgement.brokerageId !== scope.invitation.brokerageId ||
    acknowledgement.organizationId !== scope.invitation.organizationId ||
    acknowledgement.buildId !== scope.invitation.buildId ||
    acknowledgement.quoteRoundId !== scope.invitation.quoteRoundId
  ) {
    throw new ConvexError(
      "Quote Package Revision acknowledgement crosses invitation scope."
    );
  }
  return {
    acknowledged: acknowledgement.status === "acknowledged",
    acknowledgedFieldKeys: acknowledgement.acknowledgedFieldKeys,
    changedFieldKeys: acknowledgement.changedFieldKeys,
    required: true,
    status: acknowledgement.status,
  };
}

export async function requireAcknowledgedPackageRevision(
  ctx: MutationCtx,
  scope: InvitationScope
) {
  const acknowledgement = await quoteInvitationPackageRevisionAcknowledgement(
    ctx,
    scope
  );
  return acknowledgement.acknowledged
    ? null
    : ({ status: "acknowledgement_required" } as const);
}

export type QuoteInvitationResponseAccessState =
  | "available"
  | "read_only"
  | "superseded"
  | "unavailable";

export type QuoteInvitationBrowserReadAccess =
  | {
      scope: InvitationScope;
      session: Doc<"quoteInvitationBrowserSessions">;
      status: Exclude<QuoteInvitationResponseAccessState, "unavailable">;
    }
  | { status: "unavailable" };

export type QuoteInvitationBrowserWriteAccess =
  | {
      scope: InvitationScope;
      session: Doc<"quoteInvitationBrowserSessions">;
      status: Exclude<QuoteInvitationResponseAccessState, "unavailable">;
    }
  | { status: "unavailable" };

export type QuoteInvitationClaimedAccess =
  | {
      scope: InvitationScope;
      status: Exclude<QuoteInvitationResponseAccessState, "unavailable">;
    }
  | { status: "unavailable" };

export interface QuoteInvitationCredentialDispatchInput {
  accessExpiresAt: number;
  accessGeneration?: number;
  brokerage: Doc<"brokerages">;
  build: Doc<"activeBuilds">;
  communicationIdempotencyKey?: string;
  communicationKind?: Extract<
    CommunicationIntentKind,
    | "quote_invitation_initial"
    | "quote_package_revision"
    | "quote_invitation_rotation"
    | "quote_invitation_reminder_manual"
    | "quote_invitation_reminder_auto"
    | "quote_invitation_recipient_replaced"
  >;
  /**
   * Safe, non-identity metadata rendered into the notification body. Domain
   * transitions may include revision changed-field keys and their reason here;
   * provider delivery remains a post-commit concern.
   */
  communicationPayload?: Record<string, unknown>;
  credentialVersion?: number;
  invitation: Doc<"quoteRoundInvitations">;
  packageRevision: Doc<"quotePackageRevisions">;
  publishedAt: number;
  purpose?: "initial" | "reminder" | "renewal" | "rotation";
  quoteRound: Doc<"quoteRounds">;
  responseDeadline: number;
}

/**
 * The public magic-link window defaults to seven days beyond the quote
 * deadline and is deliberately bounded to 90 days after publication. A quote
 * deadline outside that policy cannot be sent because no valid access window
 * would exist for every recipient.
 */
export function defaultQuoteInvitationAccessExpiry(input: {
  publishedAt: number;
  responseDeadline: number;
}) {
  const accessExpiresAt =
    input.responseDeadline + DEFAULT_ACCESS_WINDOW_AFTER_DEADLINE_MS;
  assertQuoteInvitationAccessWindow({
    accessExpiresAt,
    publishedAt: input.publishedAt,
    responseDeadline: input.responseDeadline,
  });
  return accessExpiresAt;
}

export function assertQuoteInvitationAccessWindow(input: {
  accessExpiresAt: number;
  publishedAt: number;
  responseDeadline: number;
}) {
  if (
    !(
      Number.isSafeInteger(input.accessExpiresAt) &&
      Number.isSafeInteger(input.publishedAt) &&
      Number.isSafeInteger(input.responseDeadline)
    )
  ) {
    throw new ConvexError(
      "Quote Invitation access times must be safe integers."
    );
  }
  if (input.responseDeadline <= input.publishedAt) {
    throw new ConvexError(
      "Quote Invitation response deadline must be future-dated."
    );
  }
  if (input.accessExpiresAt < input.responseDeadline) {
    throw new ConvexError(
      "Quote Invitation access cannot expire before the response deadline."
    );
  }
  if (
    input.accessExpiresAt >
    input.publishedAt + MAX_ACCESS_WINDOW_AFTER_PUBLICATION_MS
  ) {
    throw new ConvexError(
      "Quote Invitation access may not exceed 90 days after publication."
    );
  }
}

/**
 * Generates and queues the initial passwordless credential atomically with
 * Quote publication. The raw token is used only in the official Resend payload
 * and is never written to DrawFlow's application tables, audit records, or
 * event outbox.
 */
export async function createInitialQuoteInvitationCredentialAndDispatch(
  ctx: MutationCtx,
  input: QuoteInvitationCredentialDispatchInput
) {
  assertCredentialDispatchScope(input);
  assertQuoteInvitationAccessWindow({
    accessExpiresAt: input.accessExpiresAt,
    publishedAt: input.publishedAt,
    responseDeadline: input.responseDeadline,
  });

  const now = input.publishedAt;
  const accessGeneration = input.accessGeneration ?? 1;
  const credentialVersion = input.credentialVersion ?? 1;
  const purpose = input.purpose ?? "initial";
  const communicationKind = quoteInvitationCommunicationKind(input, purpose);
  const intentId = await enqueueCommunicationIntent(ctx, {
    brokerageId: input.brokerage._id,
    buildId: input.build._id,
    idempotencyKey:
      input.communicationIdempotencyKey ??
      `quote-invitation:${input.invitation._id}:access-generation:${accessGeneration}:credential:${credentialVersion}`,
    kind: communicationKind,
    organizationId: input.brokerage.workosOrganizationId,
    payloadSnapshot: JSON.stringify({
      ...input.communicationPayload,
      accessExpiresAt: input.accessExpiresAt,
      accessGeneration,
      credentialVersion,
      packageRevisionId: String(input.packageRevision._id),
      responseDeadline: input.responseDeadline,
      purpose,
    }),
    quotePackageRevisionId: input.packageRevision._id,
    quoteRoundId: input.quoteRound._id,
    quoteRoundInvitationId: input.invitation._id,
    recipientEmailSnapshot: input.invitation.recipientEmailSnapshot,
    recipientNameSnapshot: input.invitation.recipientNameSnapshot,
    relatedEntityId: String(input.invitation._id),
    relatedEntityType: "quoteRoundInvitation",
    templateKey: quoteInvitationTemplateKey(communicationKind),
  });
  const existingIntent = await ctx.db.get(intentId);
  if (!existingIntent) {
    throw new ConvexError("Quote Invitation communication intent disappeared.");
  }
  if (existingIntent.quoteInvitationAccessCredentialId) {
    const existingCredential = await ctx.db.get(
      existingIntent.quoteInvitationAccessCredentialId
    );
    if (existingCredential) {
      return existingCredential._id;
    }
  }
  const magicToken = await deriveCommunicationSecret(String(intentId));
  const credentialVerifier = await quoteInvitationSecretVerifier(magicToken);
  const credentialId = await ctx.db.insert("quoteInvitationAccessCredentials", {
    accessExpiresAt: input.accessExpiresAt,
    accessGeneration,
    brokerageId: input.brokerage._id,
    buildId: input.build._id,
    credentialVerifier,
    credentialVersion,
    createdAt: now,
    organizationId: input.brokerage.workosOrganizationId,
    purpose,
    quoteRoundId: input.quoteRound._id,
    quoteRoundInvitationId: input.invitation._id,
    state: "active",
    updatedAt: now,
  });
  await ctx.db.patch(intentId, {
    quoteInvitationAccessCredentialId: credentialId,
    updatedAt: now,
  });
  return credentialId;
}

export function quoteInvitationCommunicationKind(
  input: QuoteInvitationCredentialDispatchInput,
  purpose: NonNullable<QuoteInvitationCredentialDispatchInput["purpose"]>
) {
  if (input.communicationKind) {
    return input.communicationKind;
  }
  if (purpose === "renewal") {
    return "quote_package_revision" as const;
  }
  if (purpose === "rotation") {
    return "quote_invitation_rotation" as const;
  }
  if (purpose === "reminder") {
    return "quote_invitation_reminder_manual" as const;
  }
  return "quote_invitation_initial" as const;
}

export function quoteInvitationTemplateKey(kind: CommunicationIntentKind) {
  if (kind === "quote_package_revision") {
    return "quote_invitation_revision";
  }
  if (kind === "quote_invitation_recipient_replaced") {
    return "quote_invitation_replaced";
  }
  if (kind === "quote_invitation_rotation") {
    return "quote_invitation_rotation";
  }
  if (
    kind === "quote_invitation_reminder_manual" ||
    kind === "quote_invitation_reminder_auto"
  ) {
    return "quote_invitation_reminder";
  }
  return "quote_invitation";
}

/**
 * Converts a reusable bearer link into a bounded browser lease. It intentionally
 * reveals no content for unknown, revoked, rotated, or malformed credentials.
 * A valid expired credential exposes only its issuing brokerage and expiry.
 */
export async function quoteInvitationSecretVerifier(secret: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function assertCredentialDispatchScope(
  input: QuoteInvitationCredentialDispatchInput
) {
  if (
    input.invitation.brokerageId !== input.brokerage._id ||
    input.invitation.organizationId !== input.brokerage.workosOrganizationId ||
    input.invitation.buildId !== input.build._id ||
    input.invitation.quoteRoundId !== input.quoteRound._id ||
    (input.invitation.currentQuotePackageRevisionId ??
      input.invitation.quotePackageRevisionId) !== input.packageRevision._id ||
    input.packageRevision.brokerageId !== input.brokerage._id ||
    input.packageRevision.organizationId !==
      input.brokerage.workosOrganizationId ||
    input.packageRevision.buildId !== input.build._id ||
    input.packageRevision.quoteRoundId !== input.quoteRound._id ||
    (input.packageRevision.accessExpiresAt !== undefined &&
      input.packageRevision.accessExpiresAt !== input.accessExpiresAt) ||
    input.quoteRound.brokerageId !== input.brokerage._id ||
    input.quoteRound.buildId !== input.build._id
  ) {
    throw new ConvexError(
      "Quote Invitation delivery crosses its package scope."
    );
  }
}

export function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function boundedSecret(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && normalized.length <= 512 ? normalized : null;
}

export function quoteInvitationUrl(magicToken: string) {
  const configuredOrigin = process.env.QUOTE_INVITATION_PUBLIC_ORIGIN?.trim();
  if (!configuredOrigin) {
    throw new ConvexError(
      "QUOTE_INVITATION_PUBLIC_ORIGIN is required before sending Quote Invitations."
    );
  }
  let origin: URL;
  try {
    origin = new URL(configuredOrigin);
  } catch {
    throw new ConvexError(
      "QUOTE_INVITATION_PUBLIC_ORIGIN must be a valid URL."
    );
  }
  const loopbackHttpOrigin =
    origin.protocol === "http:" &&
    (origin.hostname === "localhost" ||
      origin.hostname.endsWith(".localhost") ||
      origin.hostname === "127.0.0.1" ||
      origin.hostname === "[::1]");
  if (!(origin.protocol === "https:" || loopbackHttpOrigin)) {
    throw new ConvexError(
      "QUOTE_INVITATION_PUBLIC_ORIGIN must use HTTPS outside explicit loopback development origins."
    );
  }
  return new URL(
    `/quote-invitation/${encodeURIComponent(magicToken)}`,
    origin
  ).toString();
}

export function expiredAccessResult(scope: InvitationScope, expiresAt: number) {
  return {
    expiresAt,
    issuerName: scope.brokerage.displayName,
    status: "expired",
  } as const;
}

export function invitationIsAvailable(scope: InvitationScope) {
  return (
    scope.invitation.participationState === "active" &&
    (scope.round.state === "open" || scope.round.state === "closed")
  );
}

export async function resolveInvitationScope(
  ctx: InvitationAccessCtx,
  source:
    | Doc<"quoteInvitationAccessCredentials">
    | Doc<"quoteRoundInvitations">
    | null
): Promise<InvitationScope | null> {
  if (!source) {
    return null;
  }
  const invitation =
    "quoteRoundInvitationId" in source
      ? await ctx.db.get(source.quoteRoundInvitationId)
      : source;
  if (!invitation) {
    return null;
  }
  if (
    "quoteRoundInvitationId" in source &&
    (source.brokerageId !== invitation.brokerageId ||
      source.organizationId !== invitation.organizationId ||
      source.buildId !== invitation.buildId ||
      source.quoteRoundId !== invitation.quoteRoundId)
  ) {
    return null;
  }
  const currentPackageRevisionId =
    invitation.currentQuotePackageRevisionId ??
    invitation.quotePackageRevisionId;
  const [round, originalPackageRevision, packageRevision, profile, brokerage] =
    await Promise.all([
      ctx.db.get(invitation.quoteRoundId),
      ctx.db.get(invitation.quotePackageRevisionId),
      ctx.db.get(currentPackageRevisionId),
      ctx.db.get(invitation.recipientProfileId),
      ctx.db.get(invitation.brokerageId),
    ]);
  if (
    !(
      round &&
      originalPackageRevision &&
      packageRevision &&
      profile &&
      brokerage
    )
  ) {
    return null;
  }
  if (
    brokerage.status !== "active" ||
    brokerage.workosOrganizationId !== invitation.organizationId ||
    round.brokerageId !== invitation.brokerageId ||
    round.organizationId !== invitation.organizationId ||
    round.buildId !== invitation.buildId ||
    originalPackageRevision.brokerageId !== invitation.brokerageId ||
    originalPackageRevision.organizationId !== invitation.organizationId ||
    originalPackageRevision.buildId !== invitation.buildId ||
    originalPackageRevision.quoteRoundId !== invitation.quoteRoundId ||
    packageRevision.brokerageId !== invitation.brokerageId ||
    packageRevision.organizationId !== invitation.organizationId ||
    packageRevision.buildId !== invitation.buildId ||
    packageRevision.quoteRoundId !== invitation.quoteRoundId ||
    profile.brokerageId !== invitation.brokerageId ||
    profile.organizationId !== invitation.organizationId
  ) {
    return null;
  }
  return { brokerage, invitation, packageRevision, profile, round };
}

/**
 * Reads remain server-authoritative even though the client supplies a
 * presentation clock to refresh its subscription at deadline boundaries.
 * Never use caller time for a lease, access window, or response authorization:
 * a caller-controlled value could otherwise keep an expired browser session
 * readable indefinitely.
 */
export async function resolveQuoteInvitationBrowserReadAccess(
  ctx: QueryCtx,
  input: {
    presentationNow?: number;
    quoteRoundInvitationId: Id<"quoteRoundInvitations">;
    sessionToken: string;
  }
): Promise<QuoteInvitationBrowserReadAccess> {
  const now = Date.now();
  const session = await readLiveBrowserSession(ctx, {
    now,
    sessionToken: input.sessionToken,
  });
  if (
    !session ||
    session.quoteRoundInvitationId !== input.quoteRoundInvitationId
  ) {
    return { status: "unavailable" };
  }
  const scope = await resolveInvitationScope(
    ctx,
    await ctx.db.get(session.quoteRoundInvitationId)
  );
  if (!scope) {
    return { status: "unavailable" };
  }
  const status = quoteInvitationResponseAccessState(scope, now);
  return status === "unavailable" ? { status } : { scope, session, status };
}

/**
 * Mutations must derive their deadline from server time. A stale browser query
 * may leave an input visually editable, but it can never reopen a response
 * window or a revoked/superseded invitation.
 */
export async function resolveQuoteInvitationBrowserWriteAccess(
  ctx: MutationCtx,
  input: {
    quoteRoundInvitationId: Id<"quoteRoundInvitations">;
    sessionToken: string;
  }
): Promise<QuoteInvitationBrowserWriteAccess> {
  const now = Date.now();
  const session = await resolveLiveBrowserSession(ctx, input.sessionToken, now);
  if (
    !session ||
    session.quoteRoundInvitationId !== input.quoteRoundInvitationId
  ) {
    return { status: "unavailable" };
  }
  const scope = await resolveInvitationScope(
    ctx,
    await ctx.db.get(session.quoteRoundInvitationId)
  );
  if (!scope) {
    return { status: "unavailable" };
  }
  const status = quoteInvitationResponseAccessState(scope, now);
  return status === "unavailable" ? { status } : { scope, session, status };
}

export async function resolveQuoteInvitationClaimedReadAccess(
  ctx: InvitationAccessCtx,
  input: {
    presentationNow?: number;
    quoteRoundInvitationId: Id<"quoteRoundInvitations">;
    workosUserId: string;
  }
): Promise<QuoteInvitationClaimedAccess> {
  const scope = await resolveInvitationScope(
    ctx,
    await ctx.db.get(input.quoteRoundInvitationId)
  );
  if (!scope || scope.profile.accountWorkosUserId !== input.workosUserId) {
    return { status: "unavailable" };
  }
  // The presentation clock exists solely to let reactive callers refresh at a
  // visual boundary. Claimed reads still make the permission decision on the
  // server's clock, matching their mutation path.
  const status = quoteInvitationResponseAccessState(scope, Date.now());
  return status === "unavailable" ? { status } : { scope, status };
}

export async function resolveQuoteInvitationClaimedWriteAccess(
  ctx: MutationCtx,
  input: {
    quoteRoundInvitationId: Id<"quoteRoundInvitations">;
    workosUserId: string;
  }
): Promise<QuoteInvitationClaimedAccess> {
  return await resolveQuoteInvitationClaimedReadAccess(ctx, {
    quoteRoundInvitationId: input.quoteRoundInvitationId,
    workosUserId: input.workosUserId,
  });
}

export function quoteInvitationResponseAccessState(
  scope: InvitationScope,
  now: number
): QuoteInvitationResponseAccessState {
  if (!Number.isSafeInteger(now) || now < 0) {
    return "unavailable";
  }
  if (invitationHasReplacement(scope)) {
    return "superseded";
  }
  if (!invitationIsAvailable(scope)) {
    return "unavailable";
  }
  if (
    scope.round.state !== "open" ||
    now >= scope.packageRevision.responseDeadline
  ) {
    return "read_only";
  }
  return "available";
}

export function invitationHasReplacement(scope: InvitationScope) {
  // The round's canonical current revision, rather than the existence of
  // another active recipient invitation, determines supersession. Looking at
  // any active invitation would incorrectly mark both the prior and newly
  // issued invitation read-only during a package revision cutover.
  return scope.round.currentPackageRevisionId !== scope.packageRevision._id;
}

export async function readLiveBrowserSession(
  ctx: QueryCtx,
  input: { now: number; sessionToken: string }
) {
  if (!Number.isSafeInteger(input.now) || input.now < 0) {
    return null;
  }
  const secret = boundedSecret(input.sessionToken);
  if (!secret) {
    return null;
  }
  const sessionVerifier = await quoteInvitationSecretVerifier(secret);
  const session = await ctx.db
    .query("quoteInvitationBrowserSessions")
    .withIndex("by_sessionVerifier", (query) =>
      query.eq("sessionVerifier", sessionVerifier)
    )
    .unique();
  if (
    !session ||
    session.state !== "active" ||
    input.now >= session.accessExpiresAt ||
    input.now >= session.sessionExpiresAt
  ) {
    return null;
  }
  return session;
}

export async function resolveLiveBrowserSession(
  ctx: MutationCtx,
  sessionToken: string,
  now: number
) {
  const secret = boundedSecret(sessionToken);
  if (!secret) {
    return null;
  }
  const sessionVerifier = await quoteInvitationSecretVerifier(secret);
  const session = await ctx.db
    .query("quoteInvitationBrowserSessions")
    .withIndex("by_sessionVerifier", (query) =>
      query.eq("sessionVerifier", sessionVerifier)
    )
    .unique();
  if (!session || session.state !== "active") {
    return null;
  }
  if (now >= session.accessExpiresAt || now >= session.sessionExpiresAt) {
    await ctx.db.patch(session._id, { state: "expired", updatedAt: now });
    return null;
  }
  return session;
}
