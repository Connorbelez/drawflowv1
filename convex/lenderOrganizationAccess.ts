import type { UserIdentity } from "convex/server";

import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "./fairLendConfig";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./types";

export const LENDER_ROLE_SLUGS = [
  "lender",
  "lender-admin",
  "lender-staff",
] as const;

export type LenderRoleSlug = (typeof LENDER_ROLE_SLUGS)[number];

export type LenderWorkflowPermissions = {
  proposalReview: boolean;
  milestoneDecisions: boolean;
  drawDecisions: boolean;
  siteVisitReview: boolean;
};

export type LenderApprovalCapability =
  | "proposal_review"
  | "draw_decisions"
  | "milestone_decisions";

const capabilityPermission = {
  proposal_review: "proposalReview",
  draw_decisions: "drawDecisions",
  milestone_decisions: "milestoneDecisions",
} as const satisfies Record<LenderApprovalCapability, keyof LenderWorkflowPermissions>;

export type LenderOrganizationResolution = {
  assignment: Doc<"lenderOrganizationAssignments">;
  brokerage: Doc<"brokerages">;
  membershipIds: string[];
  organization: Doc<"lenderOrganizations">;
  roles: LenderRoleSlug[];
  user: Doc<"users">;
  workosUserId: string;
};

type ReadCtx = Pick<QueryCtx | MutationCtx, "db">;

export function normalizeLenderRoleSlug(value: unknown): LenderRoleSlug | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return LENDER_ROLE_SLUGS.includes(normalized as LenderRoleSlug)
    ? (normalized as LenderRoleSlug)
    : null;
}

export function normalizeLenderRoleSlugs(
  values: readonly unknown[]
): LenderRoleSlug[] {
  return [
    ...new Set(
      values
        .map(normalizeLenderRoleSlug)
        .filter((role): role is LenderRoleSlug => role !== null)
    ),
  ];
}

export function normalizeLenderEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function requireActiveLenderWorkosUser(
  ctx: ReadCtx,
  workosUserId: string
) {
  const users = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (query) =>
      query.eq("workosUserId", workosUserId)
    )
    .take(2);
  if (users.length !== 1 || users[0]?.status !== "active") {
    throw new Error(
      users.length === 0
        ? "Forbidden: active lender user projection missing"
        : users.length > 1
          ? "Forbidden: active lender user projection ambiguous"
          : "Forbidden: inactive lender user projection"
    );
  }
  return users[0];
}

export async function listActiveSharedLenderMemberships(
  ctx: ReadCtx,
  workosUserId: string
) {
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user_and_organization", (query) =>
      query
        .eq("workosUserId", workosUserId)
        .eq("workosOrganizationId", FAIRLEND_WORKOS_ORGANIZATION_ID)
    )
    .take(20);
  return memberships.filter((membership) => membership.status === "active");
}

/**
 * Current lender-organization recipient population. WorkOS remains the source
 * of user identity, email, shared membership, and roles; the application
 * assignment only binds that identity to the DrawFlow Lender Organization.
 */
export async function listActiveLenderOrganizationMembers(
  ctx: ReadCtx,
  lenderOrganizationId: Id<"lenderOrganizations">,
) {
  const organization = await ctx.db.get(lenderOrganizationId);
  if (!organization || organization.status !== "active") {
    return [];
  }
  const assignments = await ctx.db
    .query("lenderOrganizationAssignments")
    .withIndex("by_lender_organization_and_status", (query) =>
      query
        .eq("lenderOrganizationId", lenderOrganizationId)
        .eq("status", "active")
    )
    .take(1_001);
  if (assignments.length > 1_000) {
    throw new Error(
      "Lender organization active member count exceeds the safe limit"
    );
  }

  const members = [];
  const seen = new Set<string>();
  for (const assignment of assignments) {
    const workosUserId = assignment.workosUserId;
    if (!workosUserId || seen.has(workosUserId)) {
      continue;
    }
    const users = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (query) =>
        query.eq("workosUserId", workosUserId)
      )
      .take(2);
    const user = users.length === 1 ? users[0] : undefined;
    if (!user || user.status !== "active") {
      continue;
    }
    const memberships = await listActiveSharedLenderMemberships(
      ctx,
      workosUserId
    );
    const roles = normalizeLenderRoleSlugs(
      memberships.flatMap((membership) => [
        membership.roleSlug,
        ...membership.roleSlugs,
      ])
    );
    if (memberships.length === 0 || roles.length === 0) {
      continue;
    }
    const eligibilityEpoch = JSON.stringify({
      assignmentId: String(assignment._id),
      assignmentUpdatedAt: assignment.updatedAt,
      memberships: memberships
        .map((membership) => ({
          membershipId: membership.workosMembershipId,
          roleSlug: membership.roleSlug ?? null,
          roleSlugs: [...membership.roleSlugs].sort(),
          sourceEventId: membership.sourceEventId,
          updatedAt: membership.updatedAt ?? null,
        }))
        .sort((left, right) =>
          left.membershipId.localeCompare(right.membershipId)
        ),
      userSourceEventId: user.sourceEventId ?? null,
      userUpdatedAt: user.updatedAt ?? null,
    });
    seen.add(workosUserId);
    members.push({
      assignmentId: assignment._id,
      eligibilityEpoch,
      email: normalizeLenderEmail(user.email),
      name: user.name.trim(),
      roles,
      workosUserId,
    });
  }
  return members;
}

export async function resolveAssignedLenderOrganization(
  ctx: ReadCtx,
  identity: UserIdentity,
  options: { allowPlatformAdminWithoutLenderRole?: boolean } = {}
): Promise<LenderOrganizationResolution> {
  const workosUserId = identity.subject.trim();
  if (!workosUserId) {
    throw new Error("Forbidden: WorkOS identity");
  }

  const claimedWorkosOrganizationId = [
    identity.organizationId,
    identity.org_id,
    identity["https://workos.com/organization_id"],
  ].find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0
  );
  if (
    claimedWorkosOrganizationId &&
    claimedWorkosOrganizationId !== FAIRLEND_WORKOS_ORGANIZATION_ID
  ) {
    throw new Error("Forbidden: foreign shared lender organization context");
  }

  const user = await requireActiveLenderWorkosUser(ctx, workosUserId);
  const memberships = await listActiveSharedLenderMemberships(
    ctx,
    workosUserId
  );
  if (memberships.length === 0) {
    throw new Error("Forbidden: active shared lender membership missing");
  }
  const roles = normalizeLenderRoleSlugs(
    memberships.flatMap((membership) => [
      membership.roleSlug,
      ...membership.roleSlugs,
    ])
  );
  const platformAdmin = identityHasPlatformAdminRole(identity);
  if (
    roles.length === 0 &&
    !(platformAdmin && options.allowPlatformAdminWithoutLenderRole)
  ) {
    throw new Error("Forbidden: supported lender WorkOS role required");
  }
  const assignments = await ctx.db
    .query("lenderOrganizationAssignments")
    .withIndex("by_workos_user_and_status", (query) =>
      query.eq("workosUserId", workosUserId).eq("status", "active")
    )
    .take(3);
  if (assignments.length === 0) {
    throw new Error("Forbidden: active lender organization assignment missing");
  }
  if (assignments.length > 1) {
    throw new Error("Forbidden: lender organization assignment ambiguous");
  }

  const assignment = assignments[0];
  if (!assignment) {
    throw new Error("Forbidden: lender organization assignment missing");
  }
  const organization = await ctx.db.get(assignment.lenderOrganizationId);
  if (!organization || organization.status !== "active") {
    throw new Error("Forbidden: inactive lender organization");
  }
  const brokerage = await ctx.db.get(organization.brokerageId);
  if (!brokerage || brokerage.status !== "active") {
    throw new Error("Forbidden: inactive lender brokerage");
  }

  return {
    assignment,
    brokerage,
    membershipIds: memberships
      .map((membership) => membership.workosMembershipId)
      .sort(),
    organization,
    roles,
    user,
    workosUserId,
  };
}

export async function resolveLenderOrganizationTarget(
  ctx: ReadCtx,
  lenderOrganizationId: Id<"lenderOrganizations">
) {
  const organization = await ctx.db.get(lenderOrganizationId);
  if (!organization) {
    throw new Error("Lender organization not found");
  }
  const brokerage = await ctx.db.get(organization.brokerageId);
  if (!brokerage || brokerage.status !== "active") {
    throw new Error("Lender organization brokerage is unavailable");
  }
  return { brokerage, organization };
}

export function identityHasPlatformAdminRole(identity: UserIdentity): boolean {
  const roles = [
    identity.role,
    ...(Array.isArray(identity.roles) ? identity.roles : []),
    ...(Array.isArray(identity["https://workos.com/roles"])
      ? identity["https://workos.com/roles"]
      : []),
  ];
  return roles.some(
    (role) => typeof role === "string" && role.trim().toLowerCase() === "admin"
  );
}

export function lenderCanMakeFinalDecision(
  roles: readonly LenderRoleSlug[]
): boolean {
  return roles.includes("lender") || roles.includes("lender-admin");
}

/**
 * Canonical denominator for lender approval quorums and later decision
 * counting. A person is eligible only while the app assignment, WorkOS user,
 * shared membership, and final-decision role are all active.
 */
export async function listActiveApprovalEligibleLenderOrganizationMembers(
  ctx: ReadCtx,
  lenderOrganizationId: Id<"lenderOrganizations">,
  capability: LenderApprovalCapability,
) {
  const organization = await ctx.db.get(lenderOrganizationId);
  if (
    !organization ||
    organization.status !== "active" ||
    !organization.permissions[capabilityPermission[capability]]
  ) {
    return [];
  }
  return (await listActiveLenderOrganizationMembers(ctx, lenderOrganizationId))
    .filter((member) => lenderCanMakeFinalDecision(member.roles));
}

export async function getLenderOrganizationApprovalEligibility(
  ctx: ReadCtx,
  lenderOrganizationId: Id<"lenderOrganizations">,
) {
  const [proposalReview, draw, milestone] = await Promise.all([
    listActiveApprovalEligibleLenderOrganizationMembers(ctx, lenderOrganizationId, "proposal_review"),
    listActiveApprovalEligibleLenderOrganizationMembers(ctx, lenderOrganizationId, "draw_decisions"),
    listActiveApprovalEligibleLenderOrganizationMembers(ctx, lenderOrganizationId, "milestone_decisions"),
  ]);
  return {
    counts: { proposalReview: proposalReview.length, draw: draw.length, milestone: milestone.length },
    members: { proposalReview, draw, milestone },
  };
}
