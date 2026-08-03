import { ConvexError, v } from "convex/values";

import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "./activeBuildAccess";
import {
  type AuthorizedViewer,
  authenticatedMutation,
  authenticatedQuery,
} from "./authz";
import { normalizeContractorEmail } from "./contractorWorkspace";
import { enqueueTransactionalEmail } from "./email_transport";
import { publicMutation } from "./fluent";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_ACTIVE_SESSIONS_PER_CREDENTIAL = 12;
const MAX_ACCESS_WINDOW_AFTER_PUBLICATION_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_ACCOUNT_PROFILE_SCAN = 500;
const MAX_EXACT_EMAIL_PROFILE_SCAN = 500;
const SESSION_INACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_ACCESS_WINDOW_AFTER_DEADLINE_MS = 7 * 24 * 60 * 60 * 1000;

const quoteRecipientCapabilityValidator = v.union(
  v.literal("contractor"),
  v.literal("supplier")
);

const quoteAccessLabourLineValidator = v.object({
  sourceLineId: v.id("quotePackageRevisionLabourLines"),
  budgetCents: v.optional(v.number()),
  durationDays: v.optional(v.number()),
  milestoneName: v.string(),
  scopeOfWorkTiptapJson: v.string(),
  startDay: v.optional(v.number()),
  submilestoneName: v.string(),
});

const quoteAccessMaterialLineValidator = v.object({
  sourceLineId: v.id("quotePackageRevisionMaterialLines"),
  deliveryEndDay: v.number(),
  deliveryInstructions: v.string(),
  deliveryLocation: v.string(),
  deliveryStartDay: v.number(),
  description: v.optional(v.string()),
  quantity: v.number(),
  specificationTiptapJson: v.string(),
  title: v.string(),
  unit: v.string(),
});

const quoteAccessAttachmentValidator = v.object({
  sourceAttachmentId: v.id("quotePackageRevisionAttachments"),
  fileName: v.string(),
  kind: v.union(v.literal("permit"), v.literal("inherited")),
  mimeType: v.string(),
  sizeBytes: v.number(),
});

const quoteAccessResponseFieldValidator = v.object({
  sourceFieldId: v.id("quotePackageRevisionResponseFields"),
  choiceOptions: v.optional(v.array(v.string())),
  fieldKey: v.string(),
  kind: v.union(
    v.literal("priced_line"),
    v.literal("short_text"),
    v.literal("long_text"),
    v.literal("date"),
    v.literal("choice"),
    v.literal("attachment")
  ),
  label: v.string(),
  required: v.boolean(),
  renderer: v.union(v.literal("input"), v.literal("tiptap")),
  richTextDefaultHtml: v.optional(v.string()),
  scope: v.union(
    v.literal("whole_quote"),
    v.literal("labour"),
    v.literal("materials")
  ),
});

export const quoteInvitationAccessProjectionValidator = v.object({
  accessExpiresAt: v.number(),
  invitationId: v.id("quoteRoundInvitations"),
  issuerName: v.string(),
  package: v.object({
    attachments: v.array(quoteAccessAttachmentValidator),
    labourLines: v.array(quoteAccessLabourLineValidator),
    materialLines: v.array(quoteAccessMaterialLineValidator),
    responseDeadline: v.number(),
    responseFields: v.array(quoteAccessResponseFieldValidator),
    revision: v.number(),
    siteAddress: v.string(),
    siteMapUrl: v.string(),
    timelineCurrentDay: v.optional(v.number()),
    timelineRangeMax: v.optional(v.number()),
    timelineRangeMin: v.optional(v.number()),
    timelineStartDate: v.string(),
  }),
  recipientName: v.string(),
  roundState: v.union(
    v.literal("draft"),
    v.literal("open"),
    v.literal("closed"),
    v.literal("cancelled")
  ),
  // Browser leases are intentionally surfaced only to their holder. Claimed
  // access omits this field, so an authenticated recipient is not coupled to a
  // prior magic-link session.
  sessionExpiresAt: v.optional(v.number()),
});

const quoteInvitationExchangeResultValidator = v.union(
  v.object({
    access: quoteInvitationAccessProjectionValidator,
    sessionExpiresAt: v.number(),
    sessionToken: v.string(),
    status: v.literal("available"),
  }),
  v.object({
    expiresAt: v.number(),
    issuerName: v.string(),
    status: v.literal("expired"),
  }),
  v.object({ status: v.literal("unavailable") })
);

const quoteRecipientProvisionResultValidator = v.object({
  capabilities: v.array(quoteRecipientCapabilityValidator),
  created: v.boolean(),
  email: v.string(),
  name: v.string(),
  profileId: v.id("contractorProfiles"),
  provisioningState: v.union(v.literal("claimed"), v.literal("provisional")),
});

const quoteRecipientClaimResultValidator = v.object({
  invitationId: v.id("quoteRoundInvitations"),
  profileId: v.id("contractorProfiles"),
  status: v.union(v.literal("already_claimed"), v.literal("claimed")),
});

type InvitationAccessCtx = QueryCtx | MutationCtx;

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

interface QuoteInvitationCredentialDispatchInput {
  accessExpiresAt: number;
  accessGeneration?: number;
  brokerage: Doc<"brokerages">;
  build: Doc<"activeBuilds">;
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

  const magicToken = randomSecret();
  const credentialVerifier = await quoteInvitationSecretVerifier(magicToken);
  const now = input.publishedAt;
  const accessGeneration = input.accessGeneration ?? 1;
  const credentialVersion = input.credentialVersion ?? 1;
  const purpose = input.purpose ?? "initial";
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
  const invitationUrl = quoteInvitationUrl(magicToken);
  const emailMessageId = await enqueueTransactionalEmail(ctx, {
    brokerageId: input.brokerage._id,
    html: quoteInvitationEmailHtml({
      invitationUrl,
      recipientName: input.invitation.recipientNameSnapshot,
    }),
    idempotencyKey: `quote-invitation:${input.invitation._id}:access-generation:${accessGeneration}:credential:${credentialVersion}`,
    organizationId: input.brokerage.workosOrganizationId,
    recipientEmail: input.invitation.recipientEmailSnapshot,
    relatedEntityId: String(input.invitation._id),
    relatedEntityType: "quoteRoundInvitation",
    subject: `Quote requested by ${input.brokerage.displayName}`,
    text: quoteInvitationEmailText({
      invitationUrl,
      recipientName: input.invitation.recipientNameSnapshot,
    }),
  });
  await ctx.db.patch(credentialId, {
    deliveryEmailMessageId: emailMessageId,
    updatedAt: now,
  });
  return credentialId;
}

/**
 * Converts a reusable bearer link into a bounded browser lease. It intentionally
 * reveals no content for unknown, revoked, rotated, or malformed credentials.
 * A valid expired credential exposes only its issuing brokerage and expiry.
 */
export const exchangeQuoteInvitationAccess = publicMutation
  .input({
    magicToken: v.string(),
    sessionToken: v.optional(v.string()),
  })
  .returns(quoteInvitationExchangeResultValidator)
  .handler(async (ctx, args) => {
    const magicToken = boundedSecret(args.magicToken);
    if (!magicToken) {
      return { status: "unavailable" } as const;
    }
    const credentialVerifier = await quoteInvitationSecretVerifier(magicToken);
    const credential = await ctx.db
      .query("quoteInvitationAccessCredentials")
      .withIndex("by_credentialVerifier", (query) =>
        query.eq("credentialVerifier", credentialVerifier)
      )
      .unique();
    if (!credential) {
      return { status: "unavailable" } as const;
    }
    const scope = await resolveInvitationScope(ctx, credential);
    if (!scope) {
      return { status: "unavailable" } as const;
    }
    if (!invitationIsAvailable(scope)) {
      return { status: "unavailable" } as const;
    }
    const now = Date.now();
    if (credential.state === "expired") {
      return expiredAccessResult(scope, credential.accessExpiresAt);
    }
    if (credential.state !== "active") {
      return { status: "unavailable" } as const;
    }
    if (now >= credential.accessExpiresAt) {
      await expireCredential(ctx, credential, now);
      return expiredAccessResult(scope, credential.accessExpiresAt);
    }
    const session = await exchangeBrowserSession(ctx, {
      credential,
      existingSessionToken: args.sessionToken,
      now,
      scope,
    });
    return {
      access: await quoteInvitationAccessProjection(ctx, scope, {
        sessionExpiresAt: session.sessionExpiresAt,
      }),
      sessionExpiresAt: session.sessionExpiresAt,
      sessionToken: session.sessionToken,
      status: "available",
    } as const;
  })
  .public();

/**
 * Provision a cold recipient from the Quote Round composer. An exact active
 * Brokerage match is reused and upgraded with the required capability; no
 * profile, invitation, or history crosses Brokerage boundaries.
 */
export const ensureQuoteRoundRecipient = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    displayName: v.optional(v.string()),
    email: v.string(),
    quoteRoundId: v.id("quoteRounds"),
    workosOrganizationId: v.string(),
  })
  .returns(quoteRecipientProvisionResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeQuoteRecipientAuthoring(ctx, args);
    const round = requireQuoteRoundRecipientDraft(
      await ctx.db.get(args.quoteRoundId),
      authorization
    );
    const email = requireNormalizedEmail(args.email);
    const requestedCapabilities = capabilitiesForMode(round.mode);
    const candidates = await matchingProfilesForNormalizedEmail(
      ctx,
      authorization.brokerage._id,
      email
    );
    if (
      candidates.some(
        (candidate) => candidate.organizationId !== authorization.organizationId
      )
    ) {
      throw new ConvexError("Quote recipient identity scope is inconsistent.");
    }
    const activeMatches = candidates.filter(
      (candidate) => candidate.status === "active"
    );
    if (activeMatches.length > 1) {
      throw new ConvexError(
        "Multiple active Quote recipient profiles share this Brokerage email. Resolve the identity conflict before inviting."
      );
    }
    const existing = activeMatches[0];
    const now = Date.now();
    if (existing) {
      const capabilities = mergedCapabilities(
        existing.quoteRecipientCapabilities,
        requestedCapabilities
      );
      const changed = !sameCapabilities(
        existing.quoteRecipientCapabilities ?? ["contractor"],
        capabilities
      );
      const normalizedEmailBackfilled = existing.normalizedEmail !== email;
      if (changed || normalizedEmailBackfilled) {
        await ctx.db.patch(existing._id, {
          ...(changed ? { quoteRecipientCapabilities: capabilities } : {}),
          ...(normalizedEmailBackfilled ? { normalizedEmail: email } : {}),
          updatedAt: now,
        });
        await writeQuoteRecipientAuditEvent(ctx, {
          authorization,
          command: "ensureQuoteRoundRecipient",
          eventType: changed
            ? "quote_recipient.capabilities_attached"
            : "quote_recipient.canonical_reused",
          profileId: existing._id,
          state: {
            capabilities,
            created: false,
            normalizedEmailBackfilled,
          },
        });
      }
      return {
        capabilities,
        created: false,
        email,
        name: existing.name,
        profileId: existing._id,
        provisioningState:
          existing.quoteRecipientProvisioningState === "claimed"
            ? "claimed"
            : "provisional",
      };
    }

    const displayName = optionalDisplayName(args.displayName);
    const profileId = await ctx.db.insert("contractorProfiles", {
      brokerageId: authorization.brokerage._id,
      createdAt: now,
      email,
      kind: "company",
      name: displayName ?? "Provisional quote recipient",
      normalizedEmail: email,
      onboardingStatus: "profile_only",
      organizationId: authorization.organizationId,
      quoteRecipientCapabilities: requestedCapabilities,
      quoteRecipientProvisioningState: "provisional",
      source: "builder_created",
      status: "active",
      trades: [],
      updatedAt: now,
    });
    await writeQuoteRecipientAuditEvent(ctx, {
      authorization,
      command: "ensureQuoteRoundRecipient",
      eventType: "quote_recipient.provisional_created",
      profileId,
      state: { capabilities: requestedCapabilities, created: true },
    });
    return {
      capabilities: requestedCapabilities,
      created: true,
      email,
      name: displayName ?? "Provisional quote recipient",
      profileId,
      provisioningState: "provisional",
    };
  })
  .public();

/**
 * Binds the currently authenticated WorkOS user to the profile behind the
 * current browser lease only when the webhook-projected, verified WorkOS email
 * matches that profile exactly and neither side has an in-Brokerage conflict.
 * This does not grant a Contractor role, membership, assignment, or workspace
 * access; it only adds authenticated access to this recipient's invitations.
 */
export const claimQuoteInvitationProfile = authenticatedMutation
  .input({ sessionToken: v.string() })
  .returns(quoteRecipientClaimResultValidator)
  .handler(async (ctx, args) => {
    const now = Date.now();
    const session = await resolveLiveBrowserSession(
      ctx,
      args.sessionToken,
      now
    );
    if (!session) {
      throw new ConvexError("Quote Invitation access is unavailable.");
    }
    const scope = await resolveInvitationScope(
      ctx,
      await ctx.db.get(session.quoteInvitationAccessCredentialId)
    );
    if (!scope) {
      throw new ConvexError("Quote Invitation access is unavailable.");
    }
    if (!invitationIsAvailable(scope)) {
      throw new ConvexError("Quote Invitation access is unavailable.");
    }
    const verifiedEmail = await verifiedViewerEmail(ctx, ctx.viewer);
    const profileEmail = normalizeContractorEmail(
      scope.profile.normalizedEmail ?? scope.profile.email
    );
    if (!(profileEmail && profileEmail === verifiedEmail)) {
      throw new ConvexError(
        "This WorkOS account email does not match the invited Quote recipient."
      );
    }
    await assertClaimIsConflictFree(
      ctx,
      scope,
      ctx.viewer.subject,
      verifiedEmail
    );

    const alreadyClaimed =
      scope.profile.accountWorkosUserId === ctx.viewer.subject;
    if (!alreadyClaimed) {
      await ctx.db.patch(scope.profile._id, {
        accountWorkosUserId: ctx.viewer.subject,
        onboardingStatus: "account_linked",
        quoteRecipientProvisioningState: "claimed",
        updatedAt: now,
      });
      await writeQuoteRecipientAuditEvent(ctx, {
        authorization: {
          brokerage: scope.brokerage,
          organizationId: scope.invitation.organizationId,
          viewer: ctx.viewer,
        },
        command: "claimQuoteInvitationProfile",
        eventType: "quote_recipient.profile_claimed",
        profileId: scope.profile._id,
        state: { invitationId: String(scope.invitation._id) },
      });
      await writeAccessEvent(ctx, {
        credentialId: session.quoteInvitationAccessCredentialId,
        eventType: "profile_claimed",
        invitation: scope.invitation,
        sessionId: session._id,
      });
    }
    return {
      invitationId: scope.invitation._id,
      profileId: scope.profile._id,
      status: alreadyClaimed ? "already_claimed" : "claimed",
    } as const;
  })
  .public();

/**
 * Authenticated access is intentionally profile-scoped rather than Build or
 * Contractor-Workspace-scoped. A claim preserves access to this one private
 * invitation after the passwordless Access Window without broadening any other
 * product permission.
 */
export const getClaimedQuoteInvitationAccess = authenticatedQuery
  .input({ quoteRoundInvitationId: v.id("quoteRoundInvitations") })
  .returns(v.union(quoteInvitationAccessProjectionValidator, v.null()))
  .handler(async (ctx, args) => {
    const invitation = await ctx.db.get(args.quoteRoundInvitationId);
    if (!invitation) {
      return null;
    }
    const scope = await resolveInvitationScope(ctx, invitation);
    if (!scope) {
      return null;
    }
    if (
      !invitationIsAvailable(scope) ||
      scope.profile.accountWorkosUserId !== ctx.viewer.subject
    ) {
      return null;
    }
    // Time-derived presentation state must not be cached in a Convex query.
    // Consumers derive read-only state from roundState + responseDeadline so
    // the browser can cross the deadline without waiting for a database write.
    return await quoteInvitationAccessProjection(ctx, scope);
  })
  .public();

export async function quoteInvitationSecretVerifier(secret: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function assertCredentialDispatchScope(
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

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function boundedSecret(value: string | undefined) {
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

function quoteInvitationEmailText(input: {
  invitationUrl: string;
  recipientName: string;
}) {
  return `Hello ${input.recipientName},\n\nYou have been invited to review a private DrawFlow Quote Package. Open your secure invitation: ${input.invitationUrl}\n\nThis link is reusable until its stated access expiry.`;
}

function quoteInvitationEmailHtml(input: {
  invitationUrl: string;
  recipientName: string;
}) {
  const name = escapeHtml(input.recipientName);
  const url = escapeHtml(input.invitationUrl);
  return `<p>Hello ${name},</p><p>You have been invited to review a private DrawFlow Quote Package.</p><p><a href="${url}">Open your secure invitation</a></p><p>This link is reusable until its stated access expiry.</p>`;
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

function expiredAccessResult(scope: InvitationScope, expiresAt: number) {
  return {
    expiresAt,
    issuerName: scope.brokerage.displayName,
    status: "expired",
  } as const;
}

function invitationIsAvailable(scope: InvitationScope) {
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

function quoteInvitationResponseAccessState(
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

function invitationHasReplacement(scope: InvitationScope) {
  // The round's canonical current revision, rather than the existence of
  // another active recipient invitation, determines supersession. Looking at
  // any active invitation would incorrectly mark both the prior and newly
  // issued invitation read-only during a package revision cutover.
  return scope.round.currentPackageRevisionId !== scope.packageRevision._id;
}

async function readLiveBrowserSession(
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

function assertPackageRowsScope(
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

function latestAccessExpiry(scope: InvitationScope) {
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

async function expireCredential(
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

async function exchangeBrowserSession(
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

function boundedSessionExpiry(accessExpiresAt: number, now: number) {
  return Math.min(accessExpiresAt, now + SESSION_INACTIVITY_WINDOW_MS);
}

async function constrainActiveSessions(
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

async function resolveLiveBrowserSession(
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

async function writeAccessEvent(
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

async function authorizeQuoteRecipientAuthoring(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  input: { buildId: Id<"activeBuilds">; workosOrganizationId: string }
) {
  if (
    !(
      ctx.viewer.roles.includes("builder") ||
      ctx.viewer.roles.includes("builder-staff")
    )
  ) {
    throw new ConvexError(
      "Forbidden: only Builder or Builder Staff may author Quote Rounds."
    );
  }
  return await authorizeActiveBuildAccess(ctx, {
    buildId: input.buildId,
    organizationId: input.workosOrganizationId,
  });
}

function requireQuoteRoundRecipientDraft(
  round: Doc<"quoteRounds"> | null,
  authorization: ActiveBuildAuthorization
) {
  if (
    !round ||
    round.state !== "draft" ||
    round.buildId !== authorization.build._id ||
    round.proposalId !== authorization.proposal._id ||
    round.organizationId !== authorization.organizationId ||
    round.brokerageId !== authorization.brokerage._id
  ) {
    throw new ConvexError("Quote Round draft is unavailable for this Build.");
  }
  return round;
}

function capabilitiesForMode(
  mode: Doc<"quoteRounds">["mode"]
): Array<"contractor" | "supplier"> {
  if (mode === "labour") {
    return ["contractor"];
  }
  if (mode === "material") {
    return ["supplier"];
  }
  return ["contractor", "supplier"];
}

function mergedCapabilities(
  current: Doc<"contractorProfiles">["quoteRecipientCapabilities"] | undefined,
  additions: readonly ("contractor" | "supplier")[]
) {
  const values = new Set(current ?? ["contractor"]);
  for (const addition of additions) {
    values.add(addition);
  }
  return (["contractor", "supplier"] as const).filter((capability) =>
    values.has(capability)
  );
}

function sameCapabilities(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length && left.every((value) => right.includes(value))
  );
}

function requireNormalizedEmail(value: string) {
  const normalized = normalizeContractorEmail(value);
  if (!normalized || normalized.length > 320) {
    throw new ConvexError("Enter a valid Quote recipient email address.");
  }
  return normalized;
}

function optionalDisplayName(value: string | undefined) {
  const normalized = value?.trim();
  if (normalized && normalized.length > 160) {
    throw new ConvexError(
      "Quote recipient name must be 160 characters or fewer."
    );
  }
  return normalized || undefined;
}

async function writeQuoteRecipientAuditEvent(
  ctx: MutationCtx,
  input: {
    authorization: Pick<
      ActiveBuildAuthorization,
      "brokerage" | "organizationId" | "viewer"
    >;
    command: string;
    eventType: string;
    profileId: Id<"contractorProfiles">;
    state: Record<string, boolean | string | string[]>;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: [...input.authorization.viewer.roles],
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    command: input.command,
    createdAt: Date.now(),
    entityId: String(input.profileId),
    entityType: "quoteRecipientProfile",
    eventType: input.eventType,
    newState: JSON.stringify(input.state),
    organizationId: input.authorization.organizationId,
    warnings: [],
  });
}

async function verifiedViewerEmail(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  viewer: AuthorizedViewer
) {
  const users = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (query) =>
      query.eq("workosUserId", viewer.subject)
    )
    .take(2);
  const user = users[0];
  if (users.length !== 1 || !user?.emailVerified || user.status === "deleted") {
    throw new ConvexError(
      "A uniquely projected, verified WorkOS email is required to claim this Quote recipient."
    );
  }
  const verifiedEmail = requireNormalizedEmail(user.email);
  const tokenEmail = normalizeContractorEmail(viewer.email);
  if (tokenEmail && tokenEmail !== verifiedEmail) {
    throw new ConvexError(
      "WorkOS identity email verification is inconsistent."
    );
  }
  return verifiedEmail;
}

async function assertClaimIsConflictFree(
  ctx: MutationCtx,
  scope: InvitationScope,
  workosUserId: string,
  normalizedEmail: string
) {
  if (
    scope.profile.accountWorkosUserId &&
    scope.profile.accountWorkosUserId !== workosUserId
  ) {
    throw new ConvexError(
      "This Quote recipient profile is already linked to another WorkOS account."
    );
  }
  const [profileMatches, allAccountMatches] = await Promise.all([
    matchingProfilesForNormalizedEmail(
      ctx,
      scope.brokerage._id,
      normalizedEmail
    ),
    ctx.db
      .query("contractorProfiles")
      .withIndex("by_account_user", (query) =>
        query.eq("accountWorkosUserId", workosUserId)
      )
      .take(MAX_ACCOUNT_PROFILE_SCAN + 1),
  ]);
  if (allAccountMatches.length > MAX_ACCOUNT_PROFILE_SCAN) {
    throw new ConvexError(
      "Quote recipient account ownership exceeded its safe profile scan limit and requires identity review."
    );
  }
  const accountMatches = allAccountMatches.filter(
    (profile) => profile.brokerageId === scope.brokerage._id
  );
  const exactMatches = profileMatches.filter(
    (profile) =>
      profile.organizationId === scope.invitation.organizationId &&
      profile.status === "active"
  );
  if (exactMatches.length !== 1 || exactMatches[0]?._id !== scope.profile._id) {
    throw new ConvexError(
      "Quote recipient email ownership is ambiguous and requires identity review."
    );
  }
  if (accountMatches.some((profile) => profile._id !== scope.profile._id)) {
    throw new ConvexError(
      "This WorkOS account is already linked to another Quote recipient in this Brokerage."
    );
  }
}

/**
 * The current contractor writers persist normalizedEmail, but the schema keeps
 * the field optional for pre-normalization profiles. A bounded brokerage-local
 * fallback prevents a legacy exact email from being duplicated as a cold Quote
 * recipient; if a brokerage exceeds the bounded scan, identity review is safer
 * than silently creating a second profile.
 */
async function matchingProfilesForNormalizedEmail(
  ctx: InvitationAccessCtx,
  brokerageId: Id<"brokerages">,
  normalizedEmail: string
) {
  const [indexed, brokerageProfiles] = await Promise.all([
    ctx.db
      .query("contractorProfiles")
      .withIndex("by_brokerage_normalized_email", (query) =>
        query
          .eq("brokerageId", brokerageId)
          .eq("normalizedEmail", normalizedEmail)
      )
      .take(3),
    ctx.db
      .query("contractorProfiles")
      .withIndex("by_brokerage", (query) =>
        query.eq("brokerageId", brokerageId)
      )
      .take(MAX_EXACT_EMAIL_PROFILE_SCAN + 1),
  ]);
  if (brokerageProfiles.length > MAX_EXACT_EMAIL_PROFILE_SCAN) {
    throw new ConvexError(
      "Quote recipient identity discovery exceeded its safe profile scan limit. Normalize legacy profiles before inviting."
    );
  }
  const matches = new Map<
    Id<"contractorProfiles">,
    Doc<"contractorProfiles">
  >();
  for (const profile of [...indexed, ...brokerageProfiles]) {
    if (
      normalizeContractorEmail(profile.normalizedEmail ?? profile.email) ===
      normalizedEmail
    ) {
      matches.set(profile._id, profile);
    }
  }
  return [...matches.values()];
}
