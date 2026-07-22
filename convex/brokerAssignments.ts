import { normalizeRoleSlugs, type RoleSlug } from "./authz";
import {
  FAIRLEND_DEFAULT_BROKER_EMAIL,
  FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID,
  FAIRLEND_WORKOS_ORGANIZATION_ID,
} from "./fairLendConfig";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

export const ASSIGNABLE_BROKER_ROLES = ["principle-broker", "broker"] as const;

type ReadCtx = QueryCtx | MutationCtx;

type AssignmentHealthReason =
  | "healthy"
  | "inactive_brokerage"
  | "inactive_builder_profile"
  | "assignment_missing"
  | "duplicate_active_assignments"
  | "assignment_scope_mismatch"
  | "broker_user_missing_or_inactive"
  | "broker_membership_missing"
  | "broker_role_ineligible";

export interface BuilderBrokerAssignmentHealth {
  activeAssignmentCount: number;
  assignment: Doc<"builderBrokerAssignments"> | null;
  broker: Doc<"users"> | null;
  healthy: boolean;
  membership: Doc<"workosOrganizationMemberships"> | null;
  reason: AssignmentHealthReason;
}

export interface EnsureBuilderBrokerAssignmentResult {
  assignmentId: Id<"builderBrokerAssignments">;
  operation: "assigned" | "reassigned" | "repaired" | "unchanged";
}

export interface AssignableBrokerMemberOption {
  email?: string;
  isPrincipal: boolean;
  name: string;
  workosUserId: string;
}

interface BuilderBrokerAssignmentInput {
  actorRoles: readonly RoleSlug[];
  actorWorkosUserId: string;
  assignedBrokerWorkosUserId: string;
  brokerage: Doc<"brokerages">;
  builderProfile: Doc<"builderProfiles">;
  command: string;
  now: number;
  reason: string;
}

export async function getBuilderBrokerAssignmentHealth(
  ctx: ReadCtx,
  input: {
    brokerage: Doc<"brokerages">;
    builderProfile: Doc<"builderProfiles">;
  }
): Promise<BuilderBrokerAssignmentHealth> {
  const { brokerage, builderProfile } = input;
  if (brokerage.status !== "active") {
    return unhealthy("inactive_brokerage");
  }
  if (builderProfile.status !== "active") {
    return unhealthy("inactive_builder_profile");
  }

  const activeAssignments = await ctx.db
    .query("builderBrokerAssignments")
    .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q) =>
      q.eq("builderProfileId", builderProfile._id).eq("status", "active")
    )
    .order("desc")
    .collect();
  const assignment = activeAssignments[0] ?? null;
  if (!assignment) {
    return unhealthy("assignment_missing");
  }
  if (activeAssignments.length > 1) {
    return unhealthy("duplicate_active_assignments", {
      activeAssignmentCount: activeAssignments.length,
      assignment,
    });
  }
  if (
    assignment.brokerageId !== brokerage._id ||
    assignment.organizationId !== brokerage.workosOrganizationId ||
    builderProfile.brokerageId !== brokerage._id ||
    builderProfile.organizationId !== brokerage.workosOrganizationId
  ) {
    return unhealthy("assignment_scope_mismatch", { assignment });
  }

  const broker = await getWorkosUser(
    ctx,
    assignment.assignedBrokerWorkosUserId
  );
  if (broker?.status !== "active") {
    return unhealthy("broker_user_missing_or_inactive", { assignment, broker });
  }

  const membership = await getActiveOrganizationMembership(
    ctx,
    assignment.assignedBrokerWorkosUserId,
    brokerage.workosOrganizationId
  );
  if (!membership) {
    return unhealthy("broker_membership_missing", { assignment, broker });
  }
  if (!hasAssignableBrokerRole(membership)) {
    return unhealthy("broker_role_ineligible", {
      assignment,
      broker,
      membership,
    });
  }

  return {
    activeAssignmentCount: 1,
    assignment,
    broker,
    healthy: true,
    membership,
    reason: "healthy",
  };
}

export function ensureBuilderBrokerAssignment(
  ctx: MutationCtx,
  input: BuilderBrokerAssignmentInput
): Promise<EnsureBuilderBrokerAssignmentResult> {
  return writeBuilderBrokerAssignment(ctx, input, false);
}

/**
 * Resolve and validate the broker used by automatic brokerage workflows.
 * FairLendBrokerage is pinned to Elie; standalone brokerages retain their
 * configured principal broker as the default.
 */
export async function requireDefaultBrokerMember(
  ctx: ReadCtx,
  brokerage: Pick<
    Doc<"brokerages">,
    "principalBrokerWorkosUserId" | "workosOrganizationId"
  >
) {
  const isFairLendBrokerage =
    brokerage.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID;
  const workosUserId = getConfiguredDefaultBrokerWorkosUserId(brokerage);
  if (!workosUserId) {
    throw new Error("The brokerage has not configured a principal broker.");
  }

  const eligible = await requireEligibleBrokerMember(ctx, {
    workosOrganizationId: brokerage.workosOrganizationId,
    workosUserId,
  });
  if (
    isFairLendBrokerage &&
    eligible.broker.email.trim().toLowerCase() !== FAIRLEND_DEFAULT_BROKER_EMAIL
  ) {
    throw new Error(
      `The FairLendBrokerage default broker must be ${FAIRLEND_DEFAULT_BROKER_EMAIL}.`
    );
  }

  return { ...eligible, workosUserId };
}

/**
 * List active, assignable broker members for proposal/build ownership.
 * The configured default is resolved through the same validation path used by
 * write commands so the UI cannot advertise a stale or ineligible principal.
 */
export async function listAssignableBrokerMembers(
  ctx: ReadCtx,
  brokerage: Pick<
    Doc<"brokerages">,
    "principalBrokerWorkosUserId" | "workosOrganizationId"
  >
): Promise<{
  defaultAssignedBrokerWorkosUserId: string;
  options: AssignableBrokerMemberOption[];
}> {
  const configuredDefaultBrokerWorkosUserId =
    getConfiguredDefaultBrokerWorkosUserId(brokerage);
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_organization", (q) =>
      q.eq("workosOrganizationId", brokerage.workosOrganizationId)
    )
    .collect();
  const seenWorkosUserIds = new Set<string>();
  const options: AssignableBrokerMemberOption[] = [];

  for (const membership of memberships) {
    if (
      membership.status !== "active" ||
      !hasAssignableBrokerRole(membership) ||
      seenWorkosUserIds.has(membership.workosUserId)
    ) {
      continue;
    }
    const broker = await getWorkosUser(ctx, membership.workosUserId);
    if (broker?.status !== "active") {
      continue;
    }
    seenWorkosUserIds.add(membership.workosUserId);
    const fullName = [broker.firstName, broker.lastName]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(" ")
      .trim();
    options.push({
      ...(broker.email ? { email: broker.email } : {}),
      isPrincipal:
        membership.workosUserId === configuredDefaultBrokerWorkosUserId,
      name:
        fullName ||
        broker.name?.trim() ||
        broker.email?.trim() ||
        membership.workosUserId,
      workosUserId: membership.workosUserId,
    });
  }

  const sortedOptions = options.sort((a, b) => {
    if (a.isPrincipal !== b.isPrincipal) {
      return a.isPrincipal ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  const configuredDefault = sortedOptions.find(
    (option) =>
      option.workosUserId === configuredDefaultBrokerWorkosUserId &&
      (brokerage.workosOrganizationId !== FAIRLEND_WORKOS_ORGANIZATION_ID ||
        option.email?.trim().toLowerCase() === FAIRLEND_DEFAULT_BROKER_EMAIL)
  );
  const defaultAssignedBrokerWorkosUserId =
    configuredDefault?.workosUserId ?? sortedOptions[0]?.workosUserId;
  if (!defaultAssignedBrokerWorkosUserId) {
    throw new Error(
      "The brokerage has no active broker member available for assignment."
    );
  }

  return {
    defaultAssignedBrokerWorkosUserId,
    options: sortedOptions,
  };
}

function getConfiguredDefaultBrokerWorkosUserId(
  brokerage: Pick<
    Doc<"brokerages">,
    "principalBrokerWorkosUserId" | "workosOrganizationId"
  >
): string | undefined {
  return brokerage.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID
    ? FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID
    : brokerage.principalBrokerWorkosUserId;
}

/**
 * Explicit, audited assignment command used by authorized back-office workflows.
 * Unlike provisioning repair, this command may transfer a Builder from one
 * eligible broker to another when the caller supplies a material reason.
 */
export function assignBuilderBrokerAssignment(
  ctx: MutationCtx,
  input: BuilderBrokerAssignmentInput
): Promise<EnsureBuilderBrokerAssignmentResult> {
  return writeBuilderBrokerAssignment(ctx, input, true);
}

async function writeBuilderBrokerAssignment(
  ctx: MutationCtx,
  input: BuilderBrokerAssignmentInput,
  allowReassignment: boolean
): Promise<EnsureBuilderBrokerAssignmentResult> {
  const { brokerage, builderProfile } = input;
  if (
    brokerage.status !== "active" ||
    builderProfile.status !== "active" ||
    builderProfile.brokerageId !== brokerage._id ||
    builderProfile.organizationId !== brokerage.workosOrganizationId
  ) {
    throw new Error("An active brokerage-scoped builder profile is required.");
  }

  await requireEligibleBrokerMember(ctx, {
    workosOrganizationId: brokerage.workosOrganizationId,
    workosUserId: input.assignedBrokerWorkosUserId,
  });

  const activeAssignments = await ctx.db
    .query("builderBrokerAssignments")
    .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q) =>
      q.eq("builderProfileId", builderProfile._id).eq("status", "active")
    )
    .order("desc")
    .collect();
  const canonicalAssignment = activeAssignments.find(
    (assignment) =>
      assignment.assignedBrokerWorkosUserId ===
        input.assignedBrokerWorkosUserId &&
      assignment.brokerageId === brokerage._id &&
      assignment.organizationId === brokerage.workosOrganizationId
  );
  const conflictingAssignments = activeAssignments.filter(
    (assignment) =>
      assignment.assignedBrokerWorkosUserId !==
        input.assignedBrokerWorkosUserId ||
      assignment.brokerageId !== brokerage._id ||
      assignment.organizationId !== brokerage.workosOrganizationId
  );
  if (!allowReassignment && conflictingAssignments.length > 0) {
    throw new Error(
      "This builder already has an active broker assignment. Use the governed reassignment workflow."
    );
  }

  const supersededAssignments = activeAssignments.filter(
    (assignment) => assignment._id !== canonicalAssignment?._id
  );
  await Promise.all(
    supersededAssignments.map((assignment) =>
      ctx.db.patch(assignment._id, {
        status: "transferred",
        updatedAt: input.now,
      })
    )
  );

  let assignmentId: Id<"builderBrokerAssignments">;
  let operation: EnsureBuilderBrokerAssignmentResult["operation"];
  if (canonicalAssignment) {
    assignmentId = canonicalAssignment._id;
    if (conflictingAssignments.length > 0) {
      operation = "reassigned";
    } else if (supersededAssignments.length > 0) {
      operation = "repaired";
    } else {
      operation = "unchanged";
    }
  } else {
    assignmentId = await ctx.db.insert("builderBrokerAssignments", {
      assignedBrokerWorkosUserId: input.assignedBrokerWorkosUserId,
      brokerageId: brokerage._id,
      builderProfileId: builderProfile._id,
      createdAt: input.now,
      effectiveAt: input.now,
      organizationId: brokerage.workosOrganizationId,
      status: "active",
      updatedAt: input.now,
    });
    operation = activeAssignments.length > 0 ? "reassigned" : "assigned";
  }

  const warnings: string[] = [];
  if (supersededAssignments.length > 0) {
    warnings.push(
      operation === "reassigned"
        ? `Transferred ${supersededAssignments.length} prior active assignment(s).`
        : `Superseded ${supersededAssignments.length} duplicate or stale active assignment(s).`
    );
  }

  if (operation !== "unchanged") {
    await ctx.db.insert("auditEvents", {
      actorRoles: [...input.actorRoles],
      actorWorkosUserId: input.actorWorkosUserId,
      brokerageId: brokerage._id,
      command: input.command,
      createdAt: input.now,
      entityId: builderProfile._id,
      entityType: "BuilderBrokerAssignment",
      eventType: `builder.broker_assignment.${operation}`,
      newState: JSON.stringify({
        assignedBrokerWorkosUserId: input.assignedBrokerWorkosUserId,
        assignmentId,
        status: "active",
      }),
      organizationId: brokerage.workosOrganizationId,
      priorState: JSON.stringify(
        activeAssignments.map((assignment) => ({
          assignedBrokerWorkosUserId: assignment.assignedBrokerWorkosUserId,
          assignmentId: assignment._id,
          status: assignment.status,
        }))
      ),
      reason: input.reason,
      warnings,
    });
  }

  return { assignmentId, operation };
}

export async function deactivateBuilderBrokerAssignments(
  ctx: MutationCtx,
  input: {
    actorRoles: readonly RoleSlug[];
    actorWorkosUserId: string;
    brokerage: Doc<"brokerages">;
    builderProfile: Doc<"builderProfiles">;
    command: string;
    now: number;
    reason: string;
  }
): Promise<{ deactivated: number }> {
  const activeAssignments = await ctx.db
    .query("builderBrokerAssignments")
    .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q) =>
      q.eq("builderProfileId", input.builderProfile._id).eq("status", "active")
    )
    .collect();

  await Promise.all(
    activeAssignments.map((assignment) =>
      ctx.db.patch(assignment._id, {
        status: "failed",
        updatedAt: input.now,
      })
    )
  );

  if (activeAssignments.length > 0) {
    await ctx.db.insert("auditEvents", {
      actorRoles: [...input.actorRoles],
      actorWorkosUserId: input.actorWorkosUserId,
      brokerageId: input.brokerage._id,
      command: input.command,
      createdAt: input.now,
      entityId: input.builderProfile._id,
      entityType: "BuilderBrokerAssignment",
      eventType: "builder.broker_assignment.deactivated",
      newState: JSON.stringify({ status: "failed" }),
      organizationId: input.brokerage.workosOrganizationId,
      priorState: JSON.stringify(
        activeAssignments.map((assignment) => ({
          assignedBrokerWorkosUserId: assignment.assignedBrokerWorkosUserId,
          assignmentId: assignment._id,
          status: assignment.status,
        }))
      ),
      reason: input.reason,
      warnings: [],
    });
  }

  return { deactivated: activeAssignments.length };
}

export async function requireEligibleBrokerMember(
  ctx: ReadCtx,
  input: { workosOrganizationId: string; workosUserId: string }
) {
  const broker = await getWorkosUser(ctx, input.workosUserId);
  const membership = await getActiveOrganizationMembership(
    ctx,
    input.workosUserId,
    input.workosOrganizationId
  );
  if (
    broker?.status !== "active" ||
    !membership ||
    !hasAssignableBrokerRole(membership)
  ) {
    throw new Error(
      "The assigned broker must be an active broker member of the brokerage."
    );
  }
  return { broker, membership };
}

export function hasAssignableBrokerRole(
  membership: Pick<
    Doc<"workosOrganizationMemberships">,
    "roleSlug" | "roleSlugs"
  >
): boolean {
  const roles = normalizeRoleSlugs([
    membership.roleSlug,
    ...(membership.roleSlugs ?? []),
  ]);
  return ASSIGNABLE_BROKER_ROLES.some((role) => roles.includes(role));
}

async function getActiveOrganizationMembership(
  ctx: ReadCtx,
  workosUserId: string,
  workosOrganizationId: string
) {
  for await (const membership of ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", workosUserId))) {
    if (
      membership.workosOrganizationId === workosOrganizationId &&
      membership.status === "active"
    ) {
      return membership;
    }
  }
  return null;
}

function getWorkosUser(ctx: ReadCtx, workosUserId: string) {
  return ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", workosUserId))
    .unique();
}

function unhealthy(
  reason: Exclude<AssignmentHealthReason, "healthy">,
  details: Partial<
    Pick<
      BuilderBrokerAssignmentHealth,
      "activeAssignmentCount" | "assignment" | "broker" | "membership"
    >
  > = {}
): BuilderBrokerAssignmentHealth {
  return {
    activeAssignmentCount:
      details.activeAssignmentCount ?? (details.assignment ? 1 : 0),
    assignment: details.assignment ?? null,
    broker: details.broker ?? null,
    healthy: false,
    membership: details.membership ?? null,
    reason,
  };
}
