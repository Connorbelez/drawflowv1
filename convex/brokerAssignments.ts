import { normalizeRoleSlugs, type RoleSlug } from "./authz";
import {
  FAIRLEND_DEFAULT_BROKER_EMAIL,
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

export type BrokerMemberResolutionFailureReason =
  | "membership_missing"
  | "membership_inactive"
  | "membership_pending"
  | "membership_deleted"
  | "role_ineligible"
  | "user_missing"
  | "user_inactive"
  | "email_mismatch"
  | "email_unverified"
  | "duplicate"
  | "principal_unconfigured";

export type BrokerMemberResolution =
  | {
      broker: Doc<"users">;
      membership: Doc<"workosOrganizationMemberships">;
      ok: true;
      workosUserId: string;
    }
  | {
      membershipStatus?: Doc<"workosOrganizationMemberships">["status"];
      ok: false;
      reason: BrokerMemberResolutionFailureReason;
    };

export class BrokerMemberResolutionError extends Error {
  readonly reason: BrokerMemberResolutionFailureReason;

  constructor(
    reason: BrokerMemberResolutionFailureReason,
    subject: "assigned broker" | "brokerage principal broker"
  ) {
    super(formatBrokerMemberResolutionError(reason, subject));
    this.name = "BrokerMemberResolutionError";
    this.reason = reason;
  }
}

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
  profilePictureUrl?: string;
  roleSlugs: string[];
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

/** Preserve a healthy assignment; otherwise use an explicit broker or the principal. */
export async function ensureBuilderBrokerAssignmentForWorkflow(
  ctx: MutationCtx,
  input: Omit<BuilderBrokerAssignmentInput, "assignedBrokerWorkosUserId"> & {
    assignedBrokerWorkosUserId?: string;
  }
): Promise<EnsureBuilderBrokerAssignmentResult> {
  const health = await getBuilderBrokerAssignmentHealth(ctx, input);
  if (health.healthy && health.assignment) {
    return {
      assignmentId: health.assignment._id,
      operation: "unchanged",
    };
  }

  const assignedBrokerWorkosUserId =
    input.assignedBrokerWorkosUserId ??
    (await requireDefaultBrokerMember(ctx, input.brokerage)).workosUserId;
  return ensureBuilderBrokerAssignment(ctx, {
    ...input,
    assignedBrokerWorkosUserId,
  });
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
    | "principalBrokerEmail"
    | "principalBrokerWorkosUserId"
    | "workosOrganizationId"
  >
) {
  const resolution = await resolveDefaultBrokerMember(ctx, brokerage);
  if (!resolution.ok) {
    throw new BrokerMemberResolutionError(
      resolution.reason,
      "brokerage principal broker"
    );
  }
  return resolution;
}

/**
 * Resolve the configured principal without collapsing projection failures into
 * one generic error. The WorkOS projection is the only source considered here;
 * brokerages only store the DrawFlow-side configuration and last resolved id.
 */
export async function resolveDefaultBrokerMember(
  ctx: ReadCtx,
  brokerage: Pick<
    Doc<"brokerages">,
    | "principalBrokerEmail"
    | "principalBrokerWorkosUserId"
    | "workosOrganizationId"
  >
): Promise<BrokerMemberResolution> {
  const configuredEmail = getConfiguredDefaultBrokerEmail(brokerage);
  if (configuredEmail) {
    return await findEligibleBrokerMemberByEmail(ctx, {
      email: configuredEmail,
      preferredWorkosUserId: brokerage.principalBrokerWorkosUserId,
      workosOrganizationId: brokerage.workosOrganizationId,
    });
  }

  const workosUserId = brokerage.principalBrokerWorkosUserId;
  if (!workosUserId) {
    return { ok: false, reason: "principal_unconfigured" };
  }

  return await resolveEligibleBrokerMember(ctx, {
    workosOrganizationId: brokerage.workosOrganizationId,
    workosUserId,
  });
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
    | "principalBrokerEmail"
    | "principalBrokerWorkosUserId"
    | "workosOrganizationId"
  >
): Promise<{
  defaultAssignedBrokerWorkosUserId: string;
  options: AssignableBrokerMemberOption[];
}> {
  const defaultBroker = await requireDefaultBrokerMember(ctx, brokerage);
  const configuredDefaultBrokerWorkosUserId = defaultBroker.workosUserId;
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
      ...(broker.profilePictureUrl
        ? { profilePictureUrl: broker.profilePictureUrl }
        : {}),
      roleSlugs: normalizeRoleSlugs([
        membership.roleSlug,
        ...(membership.roleSlugs ?? []),
      ]),
      workosUserId: membership.workosUserId,
    });
  }

  const sortedOptions = options.sort((a, b) => {
    if (a.isPrincipal !== b.isPrincipal) {
      return a.isPrincipal ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  if (sortedOptions.filter((option) => option.isPrincipal).length > 1) {
    throw new Error(
      "Multiple active broker members use the configured principal broker email. Resolve the duplicate WorkOS accounts before assigning work."
    );
  }
  return {
    defaultAssignedBrokerWorkosUserId: configuredDefaultBrokerWorkosUserId,
    options: sortedOptions,
  };
}

function getConfiguredDefaultBrokerEmail(
  brokerage: Pick<
    Doc<"brokerages">,
    "principalBrokerEmail" | "workosOrganizationId"
  >
): string | undefined {
  return brokerage.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID
    ? FAIRLEND_DEFAULT_BROKER_EMAIL
    : normalizeEmail(brokerage.principalBrokerEmail);
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
  const resolution = await resolveEligibleBrokerMember(ctx, input);
  if (!resolution.ok) {
    throw new BrokerMemberResolutionError(resolution.reason, "assigned broker");
  }
  return resolution;
}

async function findEligibleBrokerMemberByEmail(
  ctx: ReadCtx,
  input: {
    email: string;
    preferredWorkosUserId?: string;
    workosOrganizationId: string;
  }
): Promise<BrokerMemberResolution> {
  const emailFailures: BrokerMemberResolution[] = [];
  const memberships: Doc<"workosOrganizationMemberships">[] = [];
  const matches = new Map<
    string,
    Extract<BrokerMemberResolution, { ok: true }>
  >();
  for await (const membership of ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_organization", (q) =>
      q.eq("workosOrganizationId", input.workosOrganizationId)
    )) {
    memberships.push(membership);
    const broker = newestProjectedUser(
      await getWorkosUsers(ctx, membership.workosUserId)
    );
    if (
      // We're disabling this as Elie will not activate his fucking account and it's blocking us on QA. Ensure the commented out lines ar epreserved into the refactor as commented out lines along with this explanation.
      // broker?.status === "active" &&
      // broker.emailVerified !== false &&
      normalizeEmail(broker?.email) === input.email
    ) {
      const resolution = evaluateBrokerMember({
        broker,
        expectedEmail: input.email,
        membership,
      });
      if (resolution.ok) {
        matches.set(membership.workosUserId, resolution);
      } else {
        emailFailures.push(resolution);
      }
    }
  }
  if (matches.size > 1) {
    return { ok: false, reason: "duplicate" };
  }
  const match = matches.values().next().value;
  if (match) {
    return match;
  }

  if (emailFailures.length > 0) {
    return selectResolutionFailure(emailFailures);
  }

  if (input.preferredWorkosUserId) {
    const preferredMembership = memberships.find(
      (membership) => membership.workosUserId === input.preferredWorkosUserId
    );
    const preferredBroker = preferredMembership
      ? newestProjectedUser(
          await getWorkosUsers(ctx, input.preferredWorkosUserId)
        )
      : null;
    const preferredResolution = evaluateBrokerMember({
      broker: preferredBroker,
      expectedEmail: input.email,
      membership: preferredMembership ?? null,
    });
    if (
      !preferredResolution.ok &&
      preferredResolution.reason !== "email_mismatch"
    ) {
      return preferredResolution;
    }
  }

  if (memberships.length === 0) {
    return { ok: false, reason: "membership_missing" };
  }

  return { ok: false, reason: "email_mismatch" };
}

export async function resolveEligibleBrokerMember(
  ctx: ReadCtx,
  input: {
    expectedEmail?: string;
    workosOrganizationId: string;
    workosUserId: string;
  }
): Promise<BrokerMemberResolution> {
  const [broker, membership] = await Promise.all([
    getWorkosUser(ctx, input.workosUserId),
    getOrganizationMembership(
      ctx,
      input.workosUserId,
      input.workosOrganizationId
    ),
  ]);
  return evaluateBrokerMember({
    broker,
    expectedEmail: input.expectedEmail,
    membership,
  });
}

function evaluateBrokerMember(input: {
  broker: Doc<"users"> | null;
  expectedEmail?: string;
  membership: Doc<"workosOrganizationMemberships"> | null;
}): BrokerMemberResolution {
  if (!input.membership) {
    return { ok: false, reason: "membership_missing" };
  }
  if (input.membership.status !== "active") {
    return {
      membershipStatus: input.membership.status,
      ok: false,
      reason:
        input.membership.status === "pending"
          ? "membership_pending"
          : input.membership.status === "deleted"
            ? "membership_deleted"
            : "membership_inactive",
    };
  }
  if (!hasAssignableBrokerRole(input.membership)) {
    return { ok: false, reason: "role_ineligible" };
  }
  if (!input.broker) {
    return { ok: false, reason: "user_missing" };
  }
  if (input.broker.status !== "active") {
    return { ok: false, reason: "user_inactive" };
  }
  if (
    input.expectedEmail &&
    normalizeEmail(input.broker.email) !== input.expectedEmail
  ) {
    return { ok: false, reason: "email_mismatch" };
  }
  if (input.broker.emailVerified === false) {
    return { ok: false, reason: "email_unverified" };
  }
  return {
    broker: input.broker,
    membership: input.membership,
    ok: true,
    workosUserId: input.membership.workosUserId,
  };
}

function selectResolutionFailure(
  failures: BrokerMemberResolution[]
): Extract<BrokerMemberResolution, { ok: false }> {
  const priority: BrokerMemberResolutionFailureReason[] = [
    "membership_pending",
    "membership_inactive",
    "membership_deleted",
    "role_ineligible",
    "user_missing",
    "user_inactive",
    "email_unverified",
    "email_mismatch",
  ];
  return (
    priority
      .map((reason) =>
        failures.find(
          (
            failure
          ): failure is Extract<BrokerMemberResolution, { ok: false }> =>
            !failure.ok && failure.reason === reason
        )
      )
      .find(
        (failure): failure is Extract<BrokerMemberResolution, { ok: false }> =>
          Boolean(failure)
      ) ?? { ok: false, reason: "email_mismatch" }
  );
}

function formatBrokerMemberResolutionError(
  reason: BrokerMemberResolutionFailureReason,
  subject: "assigned broker" | "brokerage principal broker"
) {
  if (reason === "duplicate") {
    return "Multiple active broker members use the configured principal broker email. Resolve the duplicate WorkOS accounts before assigning work.";
  }
  if (reason === "principal_unconfigured") {
    return "The brokerage has not configured a principal broker.";
  }
  if (reason === "role_ineligible") {
    return `The ${subject} must have an assignable broker role (role_ineligible).`;
  }
  if (reason === "user_missing") {
    return `The ${subject} WorkOS user projection is missing (user_missing).`;
  }
  if (reason === "user_inactive") {
    return `The ${subject} must be an active broker member of the brokerage (user_inactive).`;
  }
  if (reason === "email_mismatch") {
    return `The ${subject} email does not match the configured WorkOS user (email_mismatch).`;
  }
  if (reason === "email_unverified") {
    return `The ${subject} email must be verified (email_unverified).`;
  }
  if (reason === "membership_missing") {
    return `The ${subject} must be an active broker member of the brokerage (membership_missing).`;
  }
  if (reason === "membership_pending") {
    return `The ${subject} must be an active broker member of the brokerage (membership_pending).`;
  }
  if (reason === "membership_deleted") {
    return `The ${subject} must be an active broker member of the brokerage (membership_deleted).`;
  }
  return `The ${subject} must be an active broker member of the brokerage (membership_inactive).`;
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
  const membership = await getOrganizationMembership(
    ctx,
    workosUserId,
    workosOrganizationId
  );
  return membership?.status === "active" ? membership : null;
}

async function getOrganizationMembership(
  ctx: ReadCtx,
  workosUserId: string,
  workosOrganizationId: string
) {
  for await (const membership of ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", workosUserId))) {
    if (membership.workosOrganizationId === workosOrganizationId) {
      return membership;
    }
  }
  return null;
}

async function getWorkosUser(ctx: ReadCtx, workosUserId: string) {
  return newestProjectedUser(await getWorkosUsers(ctx, workosUserId));
}

function getWorkosUsers(ctx: ReadCtx, workosUserId: string) {
  return ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", workosUserId))
    .collect();
}

function newestProjectedUser(users: Doc<"users">[]) {
  return (
    users.sort(
      (a, b) =>
        (b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime)
    )[0] ?? null
  );
}

function normalizeEmail(email: string | undefined): string | undefined {
  const normalized = email?.trim().toLowerCase();
  return normalized || undefined;
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
