import { ConvexError } from "convex/values";
import type { AuthorizedViewer } from "../authz";
import { createCanonicalContractorProfile } from "../contractor_profile_application";
import { normalizeContractorEmail } from "../contractorWorkspace";
import { assertOrganizationRetentionWritable } from "../data_retention";
import type { Id, MutationCtx, QueryCtx } from "../types";
import {
  boundedSecret,
  expiredAccessResult,
  invitationIsAvailable,
  quoteInvitationSecretVerifier,
  resolveInvitationScope,
  resolveLiveBrowserSession,
} from "./core";
import {
  exchangeBrowserSession,
  expireCredential,
  quoteInvitationAccessProjection,
  writeAccessEvent,
} from "./projection";
import {
  assertClaimIsConflictFree,
  authorizeQuoteRecipientAuthoring,
  capabilitiesForMode,
  matchingProfilesForNormalizedEmail,
  mergedCapabilities,
  optionalDisplayName,
  requireNormalizedEmail,
  requireQuoteRoundRecipientDraft,
  sameCapabilities,
  verifiedViewerEmail,
  writeQuoteRecipientAuditEvent,
} from "./recipient";

type AuthenticatedMutationCtx = MutationCtx & { viewer: AuthorizedViewer };
type ClaimedQueryCtx = QueryCtx & { viewer: AuthorizedViewer };

export type ExchangeQuoteInvitationAccessArgs = {
  magicToken: string;
  sessionToken?: string;
};
export type EnsureQuoteRoundRecipientArgs = {
  buildId: Id<"activeBuilds">;
  displayName?: string;
  email: string;
  quoteRoundId: Id<"quoteRounds">;
  workosOrganizationId: string;
};
export type ClaimQuoteInvitationProfileArgs = {
  sessionToken: string;
};
export type GetClaimedQuoteInvitationAccessArgs = {
  quoteRoundInvitationId: Id<"quoteRoundInvitations">;
};

export async function exchangeQuoteInvitationAccessHandler(
  ctx: MutationCtx,
  args: ExchangeQuoteInvitationAccessArgs
) {
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
}
export async function ensureQuoteRoundRecipientHandler(
  ctx: AuthenticatedMutationCtx,
  args: EnsureQuoteRoundRecipientArgs
) {
  const authorization = await authorizeQuoteRecipientAuthoring(ctx, args);
  await assertOrganizationRetentionWritable(ctx, authorization.organizationId);
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
      provisioningState: (existing.quoteRecipientProvisioningState === "claimed"
        ? "claimed"
        : "provisional") as "claimed" | "provisional",
    };
  }

  const displayName = optionalDisplayName(args.displayName);
  const profileId = await createCanonicalContractorProfile(ctx, {
    brokerageId: authorization.brokerage._id,
    fields: {
      email,
      kind: "company",
      name: displayName ?? "Provisional quote recipient",
      normalizedEmail: email,
      onboardingStatus: "profile_only",
      quoteRecipientCapabilities: requestedCapabilities,
      quoteRecipientProvisioningState: "provisional",
      source: "builder_created",
      status: "active",
      trades: [],
    },
    now,
    organizationId: authorization.organizationId,
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
    provisioningState: "provisional" as const,
  };
}
export async function claimQuoteInvitationProfileHandler(
  ctx: AuthenticatedMutationCtx,
  args: ClaimQuoteInvitationProfileArgs
) {
  const now = Date.now();
  const session = await resolveLiveBrowserSession(ctx, args.sessionToken, now);
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
  await assertOrganizationRetentionWritable(
    ctx,
    scope.invitation.organizationId
  );
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
        buildId: scope.invitation.buildId,
        externalCapacity: "contractor",
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
}
export async function getClaimedQuoteInvitationAccessHandler(
  ctx: ClaimedQueryCtx,
  args: GetClaimedQuoteInvitationAccessArgs
) {
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
}
