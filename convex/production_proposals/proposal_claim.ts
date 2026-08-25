/**
 * Production proposals proposal claim bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { normalizeRoleSlugs, type RoleSlug } from "../authz";
import { ensureBuilderBrokerAssignment, requireDefaultBrokerMember } from "../brokerAssignments";
import { shareTokenHash } from "../proposal_collaboration_model";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { builderProfileBrokerageWorkosOrganizationId, builderAccountLinkWorkosState } from "./authorization_core.js";
import { type BuilderStaffPermissionResource, isBuilderStaffPermissionResource, getOwnedBuilderProfile, getWorkosUserById, builderStaffDisplayName, normalizeBuilderStaffAssignedEmail } from "./builder_staff_access.js";
import { normalizeOptionalString } from "./contractor_policy_helpers.js";
import { BACKOFFICE_ROLES, BUILDER_ROLES, BUILDER_STAFF_PERMISSION_RESOURCES } from "./contracts_foundation.js";

export function normalizeBuilderStaffPermissionInput(
  permissions: Array<{
    canCreate: boolean;
    canDelete: boolean;
    canUpdate: boolean;
    canView: boolean;
    resourceType: BuilderStaffPermissionResource;
  }>,
) {
  const byResource = new Map(
    permissions
      .filter((permission) =>
        isBuilderStaffPermissionResource(permission.resourceType),
      )
      .map((permission) => [permission.resourceType, permission]),
  );
  return BUILDER_STAFF_PERMISSION_RESOURCES.map((resourceType) => {
    const permission = byResource.get(resourceType);
    return {
      canCreate: permission?.canCreate ?? false,
      canDelete: permission?.canDelete ?? false,
      canUpdate: permission?.canUpdate ?? false,
      canView: permission?.canView ?? false,
      resourceType,
    };
  });
}

export function builderAccountRoleRank(role: "owner" | "staff") {
  return role === "owner" ? 0 : 1;
}

export function canonicalBuilderAccountLinks(
  links: Array<Doc<"builderAccountLinks">>,
) {
  const sorted = [...links].sort(
    (left, right) =>
      builderAccountRoleRank(left.role) - builderAccountRoleRank(right.role) ||
      left.createdAt - right.createdAt ||
      String(left._id).localeCompare(String(right._id)),
  );
  const canonicalByKey = new Map<string, Doc<"builderAccountLinks">>();
  const canonicalLinkIdById = new Map<string, string>();
  for (const link of sorted) {
    const key = builderAccountCanonicalKey(link);
    const canonical = canonicalByKey.get(key) ?? link;
    canonicalByKey.set(key, canonical);
    canonicalLinkIdById.set(String(link._id), String(canonical._id));
  }
  return {
    canonicalLinkIdById,
    links: [...canonicalByKey.values()],
  };
}

function builderAccountCanonicalKey(link: Doc<"builderAccountLinks">) {
  if (link.role === "staff") {
    const assignedEmail = normalizeBuilderStaffAssignedEmail(
      link.assignedEmail,
    );
    if (assignedEmail) {
      return `staff-email:${assignedEmail}`;
    }
  }
  return `${link.role}:user:${link.workosUserId}`;
}

export async function getProposalClaimLinkByToken(
  ctx: QueryCtx | MutationCtx,
  claimToken: string,
) {
  const trimmed = claimToken.trim();
  if (!trimmed) {
    return null;
  }
  const hashedToken = await shareTokenHash(trimmed);
  return await ctx.db
    .query("proposalClaimLinks")
    .withIndex("by_share_token_hash", (q) =>
      q.eq("shareTokenHash", hashedToken),
    )
    .unique();
}

export function canClaimDraftProposal(roles: readonly RoleSlug[]) {
  return (
    roles.length === 0 ||
    roles.includes("member") ||
    roles.includes("admin") ||
    roles.some((role) => (BUILDER_ROLES as readonly RoleSlug[]).includes(role))
  );
}

export function claimRoles(roles: readonly unknown[]) {
  const normalized = normalizeRoleSlugs(roles);
  return normalized.length > 0 ? normalized : (["member"] satisfies RoleSlug[]);
}

export async function getOrCreateClaimantBuilderProfile(
  ctx: MutationCtx,
  input: {
    auth: {
      brokerage: Doc<"brokerages">;
      roles: RoleSlug[];
      subject: string;
    };
    claimantEmail?: string;
    now: number;
    proposal: Doc<"buildProposals">;
    workosOrganizationId: string;
  },
) {
  let builderProfile = await getOwnedBuilderProfile(
    ctx,
    input.auth.brokerage._id,
    input.auth.subject,
  );

  if (!builderProfile) {
    const user = await getWorkosUserById(ctx, input.auth.subject);
    const displayName = claimBuilderDisplayName(
      user,
      input.proposal,
      input.claimantEmail,
    );
    const builderProfileId = await ctx.db.insert("builderProfiles", {
      brokerageId: input.auth.brokerage._id,
      createdAt: input.now,
      displayName,
      legalName: displayName,
      organizationId: input.workosOrganizationId,
      status: "active",
      updatedAt: input.now,
    });
    await ctx.db.insert("builderAccountLinks", {
      brokerageId: input.auth.brokerage._id,
      builderProfileId,
      createdAt: input.now,
      role: "owner",
      status: "active",
      updatedAt: input.now,
      workosUserId: input.auth.subject,
    });
    const createdBuilderProfile = await ctx.db.get(builderProfileId);
    if (!createdBuilderProfile) {
      throw new Error("Builder profile creation failed.");
    }
    builderProfile = createdBuilderProfile;
  }

  const { workosUserId: assignedBrokerWorkosUserId } =
    await requireDefaultBrokerMember(ctx, input.auth.brokerage);
  await ensureBuilderBrokerAssignment(ctx, {
    actorRoles: input.auth.roles,
    actorWorkosUserId: input.auth.subject,
    assignedBrokerWorkosUserId,
    brokerage: input.auth.brokerage,
    builderProfile,
    command: "claimDraftProposalLink",
    now: input.now,
    reason:
      "Assigning the brokerage principal broker while linking a claimed proposal to its builder.",
  });

  return builderProfile;
}

function claimBuilderDisplayName(
  user: Doc<"users"> | null,
  proposal: Doc<"buildProposals">,
  fallbackEmail?: string,
) {
  const name = user?.name?.trim();
  if (name && name !== user?.email) {
    return name;
  }
  const email = user?.email?.trim();
  if (email) {
    return email.split("@")[0] || email;
  }
  const claimEmail = fallbackEmail?.trim();
  if (claimEmail) {
    return claimEmail.split("@")[0] || claimEmail;
  }
  return `${proposal.buildName} builder`;
}

export async function builderAccountSummaries(
  ctx: QueryCtx | MutationCtx,
  builderProfileId: Id<"builderProfiles">,
) {
  const workosOrganizationId =
    await builderProfileBrokerageWorkosOrganizationId(ctx, builderProfileId);
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder", (q) => q.eq("builderProfileId", builderProfileId))
    .collect();
  const activeLinks = links.filter((link) => link.status === "active");
  const summaries = [];
  for (const link of activeLinks) {
    const workosState = await builderAccountLinkWorkosState(ctx, {
      link,
      workosOrganizationId,
    });
    if (workosState.hidden) {
      continue;
    }
    const user = workosState.user;
    const assignedEmail = normalizeOptionalString(link.assignedEmail);
    const displayEmail = user?.email ?? assignedEmail;
    summaries.push({
      ...(displayEmail ? { email: displayEmail } : {}),
      emailVerified: user?.emailVerified === true,
      ...(user?.name
        ? { name: user.name }
        : assignedEmail
          ? { name: builderStaffDisplayName(assignedEmail) }
          : {}),
      role: link.role,
      workosUserId: link.workosUserId,
    });
  }
  return summaries;
}

export async function drawReviewBuilderContact(
  ctx: QueryCtx | MutationCtx,
  builderProfileId: Id<"builderProfiles">,
  displayName: string,
) {
  const accounts = await builderAccountSummaries(ctx, builderProfileId);
  const contact = accounts
    .slice()
    .sort(
      (left, right) =>
        builderAccountRoleRank(left.role) -
        builderAccountRoleRank(right.role),
    )[0];
  return {
    ...(contact?.name ? { contactName: contact.name } : {}),
    displayName,
    ...(contact?.email ? { email: contact.email } : {}),
    ...(contact?.role
      ? {
          role:
            contact.role === "owner" ? "Builder owner" : "Builder staff",
        }
      : {}),
  };
}

export function preferredBuilderAccountEmail(
  accounts: readonly {
    email?: string;
    emailVerified: boolean;
    role: string;
  }[],
) {
  return (
    accounts.find(
      (account) => account.role === "owner" && account.emailVerified,
    )?.email ??
    accounts.find((account) => account.emailVerified)?.email ??
    accounts.find((account) => account.role === "owner")?.email ??
    accounts[0]?.email
  );
}

export function workosUserSummary(
  workosUserId: string | undefined,
  user: Doc<"users"> | null,
) {
  if (!workosUserId) {
    return null;
  }
  return {
    ...(user?.email ? { email: user.email } : {}),
    ...(user?.name ? { name: user.name } : {}),
    workosUserId,
  };
}

export async function buildProposalIdentityProjection(
  ctx: QueryCtx | MutationCtx,
  proposal: Doc<"buildProposals">,
  brokerage: Doc<"brokerages">,
) {
  const builderProfile = proposal.builderProfileId
    ? await ctx.db.get(proposal.builderProfileId)
    : null;
  const builderAccounts = builderProfile
    ? await builderAccountSummaries(ctx, builderProfile._id)
    : [];
  const assignedBrokerUser = proposal.assignedBrokerWorkosUserId
    ? await getWorkosUserById(ctx, proposal.assignedBrokerWorkosUserId)
    : null;
  const createdByUser = await getWorkosUserById(
    ctx,
    proposal.createdByWorkosUserId,
  );
  const activeClaimLink = await ctx.db
    .query("proposalClaimLinks")
    .withIndex("by_proposal_status", (q) =>
      q.eq("proposalId", proposal._id).eq("status", "active"),
    )
    .first();
  const claimLinkActive = Boolean(
    activeClaimLink &&
    (!activeClaimLink.expiresAt || activeClaimLink.expiresAt >= Date.now()),
  );
  const builderOwnerEmail = preferredBuilderAccountEmail(builderAccounts);

  return {
    broker: workosUserSummary(
      proposal.assignedBrokerWorkosUserId,
      assignedBrokerUser,
    ),
    brokerage: {
      _id: brokerage._id,
      displayName: brokerage.displayName,
      legalName: brokerage.legalName,
      workosOrganizationId: brokerage.workosOrganizationId,
    },
    builder: builderProfile
      ? {
          _id: builderProfile._id,
          accounts: builderAccounts,
          displayName: builderProfile.displayName,
          ...(builderProfile.legalName
            ? { legalName: builderProfile.legalName }
            : {}),
          ...(builderOwnerEmail ? { ownerEmail: builderOwnerEmail } : {}),
          status: builderProfile.status,
        }
      : null,
    builderAssigned: Boolean(builderProfile),
    claimLinkActive,
    createdBy: workosUserSummary(proposal.createdByWorkosUserId, createdByUser),
    initiatedFromBackoffice:
      !proposal.builderProfileId &&
      Boolean(proposal.assignedBrokerWorkosUserId),
  };
}

export function isBackoffice(roles: readonly RoleSlug[]) {
  return roles.some((role) =>
    (BACKOFFICE_ROLES as readonly RoleSlug[]).includes(role),
  );
}

export function hasBuilderExecutionRole(roles: readonly RoleSlug[]) {
  return roles.some(
    (role) =>
      role === "builder" ||
      role === "builder-staff" ||
      role === "contractor",
  );
}

function isLenderOnlyForBuilderExecution(roles: readonly RoleSlug[]) {
  if (roles.includes("admin")) {
    return false;
  }
  return isBackoffice(roles) && !hasBuilderExecutionRole(roles);
}
