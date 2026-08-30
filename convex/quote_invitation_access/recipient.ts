import { ConvexError } from "convex/values";

import {
  MAX_ACCOUNT_PROFILE_SCAN,
  MAX_EXACT_EMAIL_PROFILE_SCAN,
  type InvitationAccessCtx,
  type InvitationScope,
} from "./core";
import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "../activeBuildAccess";
import { type AuthorizedViewer } from "../authz";
import { normalizeContractorEmail } from "../contractorWorkspace";
import { assertQuoteAuthoringRole } from "../quote_authoring_access";
import type { Doc, Id, MutationCtx } from "../types";

export async function authorizeQuoteRecipientAuthoring(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  input: { buildId: Id<"activeBuilds">; workosOrganizationId: string }
) {
  assertQuoteAuthoringRole(ctx.viewer.roles);
  return await authorizeActiveBuildAccess(ctx, {
    buildId: input.buildId,
    organizationId: input.workosOrganizationId,
  });
}

export function requireQuoteRoundRecipientDraft(
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

export function capabilitiesForMode(
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

export function mergedCapabilities(
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

export function sameCapabilities(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length && left.every((value) => right.includes(value))
  );
}

export function requireNormalizedEmail(value: string) {
  const normalized = normalizeContractorEmail(value);
  if (!normalized || normalized.length > 320) {
    throw new ConvexError("Enter a valid Quote recipient email address.");
  }
  return normalized;
}

export function optionalDisplayName(value: string | undefined) {
  const normalized = value?.trim();
  if (normalized && normalized.length > 160) {
    throw new ConvexError(
      "Quote recipient name must be 160 characters or fewer."
    );
  }
  return normalized || undefined;
}

export async function writeQuoteRecipientAuditEvent(
  ctx: MutationCtx,
  input: {
    authorization:
      | Pick<
          ActiveBuildAuthorization,
          "brokerage" | "build" | "effectiveRole" | "organizationId" | "viewer"
        >
      | {
          brokerage: Doc<"brokerages">;
          buildId: Id<"activeBuilds">;
          externalCapacity: "contractor";
          organizationId: string;
          viewer: AuthorizedViewer;
        };
    command: string;
    eventType: string;
    profileId: Id<"contractorProfiles">;
    state: Record<string, boolean | string | string[]>;
  }
) {
  let actorCapacity: ActiveBuildAuthorization["effectiveRole"]["role"];
  let buildId: Id<"activeBuilds">;
  if ("externalCapacity" in input.authorization) {
    actorCapacity = input.authorization.externalCapacity;
    buildId = input.authorization.buildId;
  } else {
    actorCapacity = input.authorization.effectiveRole.role;
    buildId = input.authorization.build._id;
  }
  await ctx.db.insert("auditEvents", {
    actorKind: input.authorization.viewer.actorKind,
    actorRole: actorCapacity,
    actorRoles: [...input.authorization.viewer.roles],
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    buildId,
    command: input.command,
    createdAt: Date.now(),
    entityId: String(input.profileId),
    entityType: "quoteRecipientProfile",
    effectiveCapacity: actorCapacity,
    eventType: input.eventType,
    newState: JSON.stringify(input.state),
    organizationId: input.authorization.organizationId,
    targetRevisions: [
      {
        entityId: String(input.profileId),
        entityType: "quoteRecipientProfile",
      },
    ],
    warnings: [],
  });
}

export async function verifiedViewerEmail(
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

export async function assertClaimIsConflictFree(
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
export async function matchingProfilesForNormalizedEmail(
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
