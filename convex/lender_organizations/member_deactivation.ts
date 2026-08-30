import type { Doc, Id } from "../_generated/dataModel";
import {
  listActiveLenderOrganizationMembers,
  listActiveSharedLenderMemberships,
  normalizeLenderRoleSlugs,
  requireActiveLenderWorkosUser,
} from "../lenderOrganizationAccess";
import type { MutationCtx } from "../types";

type LenderAssignmentStatus = "pending" | "active" | "inactive";
type LenderMemberDeactivation = NonNullable<
  Doc<"lenderOrganizationAssignments">["deactivation"]
>;

export interface LenderMemberDeactivationPreparation {
  adapter?: "fake" | "workos";
  assignmentId: Id<"lenderOrganizationAssignments">;
  membershipId: string;
  state: "ready" | "accepted" | "reconciled";
  workosId?: string;
}

interface LenderAuditContext {
  db: MutationCtx["db"];
  viewer: { subject: string; roles: string[] };
}

const SUPPORTED_ACTOR_ROLES = [
  "admin",
  "principle-broker",
  "broker",
  "builder",
  "broker-staff",
  "builder-staff",
  "homeowner",
  "contractor",
  "lender",
  "lender-admin",
  "lender-staff",
] as const;

/** Pure domain policy: only an active assignment can be deactivated here. */
export function planImmediateLenderMemberDeactivation(input: {
  actorWorkosUserId: string;
  currentStatus: LenderAssignmentStatus;
  now: number;
}) {
  if (input.currentStatus !== "active") {
    return null;
  }
  return {
    status: "inactive" as const,
    unassignedAt: input.now,
    unassignedByWorkosUserId: input.actorWorkosUserId,
    updatedAt: input.now,
  };
}

/**
 * Pure domain policy: WorkOS reconciliation is the only terminal transition
 * for a member-level WorkOS-first deactivation. An organization may already
 * have made the app assignment inactive; that does not prevent reconciliation
 * of the accepted external command.
 */
export function planReconciledLenderMemberDeactivation(input: {
  currentStatus: LenderAssignmentStatus;
  deactivationState: LenderMemberDeactivation["state"];
  now: number;
  requestedByWorkosUserId: string;
}) {
  if (input.deactivationState !== "accepted") {
    return null;
  }
  return {
    ...(input.currentStatus === "active"
      ? {
          status: "inactive" as const,
          unassignedAt: input.now,
          unassignedByWorkosUserId: input.requestedByWorkosUserId,
        }
      : {}),
    deactivationState: "reconciled" as const,
    reconciledAt: input.now,
    updatedAt: input.now,
  };
}

export function requireDeactivationReason(value: string): string {
  const reason = value.trim();
  if (!reason) {
    throw new Error(
      "A reason is required for lender organization control-plane changes"
    );
  }
  return reason;
}

export function primaryActorRole(
  roles: readonly string[]
):
  | "admin"
  | "principle-broker"
  | "broker"
  | "builder"
  | "broker-staff"
  | "builder-staff"
  | "homeowner"
  | "contractor"
  | "lender"
  | "lender-admin"
  | "lender-staff" {
  return SUPPORTED_ACTOR_ROLES.find((role) => roles.includes(role)) ?? "admin";
}

/** Shared audit adapter for all Lender Organization lifecycle transitions. */
export async function writeLenderAudit(
  ctx: LenderAuditContext,
  brokerage: { _id: Id<"brokerages">; workosOrganizationId: string },
  lenderOrganizationId: Id<"lenderOrganizations">,
  input: {
    command: string;
    entityId?: string;
    entityType: string;
    eventType: string;
    newState: unknown;
    priorState?: unknown;
    reason: string;
  }
) {
  const now = Date.now();
  await ctx.db.insert("auditEvents", {
    actorRole: primaryActorRole(ctx.viewer.roles),
    actorRoles: ctx.viewer.roles,
    actorWorkosUserId: ctx.viewer.subject,
    brokerageId: brokerage._id,
    lenderOrganizationId,
    command: input.command,
    entityId: input.entityId ?? String(lenderOrganizationId),
    entityType: input.entityType,
    eventType: input.eventType,
    newState: JSON.stringify(input.newState),
    organizationId: brokerage.workosOrganizationId,
    ...(input.priorState === undefined
      ? {}
      : { priorState: JSON.stringify(input.priorState) }),
    reason: input.reason,
    reconciliationKey: `${input.command}:${input.entityId ?? String(lenderOrganizationId)}:${now}`,
    warnings: [],
    createdAt: now,
  });
}

interface AssignmentTransitionAudit {
  actorRoles: string[];
  actorWorkosUserId: string;
  brokerage: Doc<"brokerages">;
  command: string;
  entityId?: string;
  eventType: string;
  lenderOrganizationId: Id<"lenderOrganizations">;
  newState: unknown;
  now: number;
  priorState: unknown;
  reason: string;
}

async function applyAssignmentTransition(
  ctx: MutationCtx,
  assignment: Doc<"lenderOrganizationAssignments">,
  input: AssignmentTransitionAudit & {
    deactivationPatch?: Partial<LenderMemberDeactivation>;
    statusPatch?: {
      status?: "inactive";
      unassignedAt?: number;
      unassignedByWorkosUserId?: string;
    };
  }
) {
  const patch: Partial<Doc<"lenderOrganizationAssignments">> = {
    ...(input.statusPatch ?? {}),
    updatedAt: input.now,
  };
  if (input.deactivationPatch) {
    if (!assignment.deactivation) {
      throw new Error("Lender member deactivation state is missing");
    }
    patch.deactivation = {
      ...assignment.deactivation,
      ...input.deactivationPatch,
    };
  }
  await ctx.db.patch(assignment._id, patch);
  await writeLenderAudit(
    {
      ...ctx,
      viewer: {
        subject: input.actorWorkosUserId,
        roles: input.actorRoles,
      },
    },
    input.brokerage,
    input.lenderOrganizationId,
    {
      command: input.command,
      entityId: input.entityId ?? String(assignment._id),
      entityType: "lenderOrganizationAssignment",
      eventType: input.eventType,
      newState: input.newState,
      priorState: input.priorState,
      reason: input.reason,
    }
  );
}

export async function deactivateLenderMemberImmediately(
  ctx: MutationCtx,
  input: {
    actorRoles: string[];
    actorWorkosUserId: string;
    assignment: Doc<"lenderOrganizationAssignments">;
    brokerage: Doc<"brokerages">;
    command: string;
    entityId?: string;
    eventType: string;
    lenderOrganizationId: Id<"lenderOrganizations">;
    newState: unknown;
    now: number;
    priorState: unknown;
    reason: string;
  }
) {
  const plan = planImmediateLenderMemberDeactivation({
    actorWorkosUserId: input.actorWorkosUserId,
    currentStatus: input.assignment.status,
    now: input.now,
  });
  if (!plan) {
    return false;
  }
  await applyAssignmentTransition(ctx, input.assignment, {
    actorRoles: input.actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerage: input.brokerage,
    command: input.command,
    entityId: input.entityId,
    eventType: input.eventType,
    lenderOrganizationId: input.lenderOrganizationId,
    newState: input.newState,
    now: input.now,
    priorState: input.priorState,
    reason: input.reason,
    statusPatch: plan,
  });
  return true;
}

export async function deactivateLenderOrganizationMembersImmediately(
  ctx: MutationCtx,
  input: {
    actorRoles: string[];
    actorWorkosUserId: string;
    brokerage: Doc<"brokerages">;
    lenderOrganizationId: Id<"lenderOrganizations">;
    now: number;
    reason: string;
  }
) {
  const assignments = await ctx.db
    .query("lenderOrganizationAssignments")
    .withIndex("by_lender_organization_and_status", (query) =>
      query
        .eq("lenderOrganizationId", input.lenderOrganizationId)
        .eq("status", "active")
    )
    .take(501);
  if (assignments.length > 500) {
    throw new Error("Lender organization membership limit exceeded");
  }

  let deactivated = 0;
  for (const assignment of assignments) {
    const applied = await deactivateLenderMemberImmediately(ctx, {
      actorRoles: input.actorRoles,
      actorWorkosUserId: input.actorWorkosUserId,
      assignment,
      brokerage: input.brokerage,
      command: "setLenderOrganizationStatus",
      eventType:
        "lender.organization.member_deactivation.organization_inactivated",
      lenderOrganizationId: input.lenderOrganizationId,
      newState: {
        assignmentStatus: "inactive",
        organizationStatus: "inactive",
      },
      now: input.now,
      priorState: { assignmentStatus: assignment.status },
      reason: input.reason,
    });
    if (applied) {
      deactivated += 1;
    }
  }
  return { deactivated };
}

function existingDeactivationPreparation(
  assignment: Doc<"lenderOrganizationAssignments">,
  idempotencyKey: string,
  reason: string
): LenderMemberDeactivationPreparation | null {
  const existing = assignment.deactivation;
  if (existing && existing.idempotencyKey === idempotencyKey) {
    if (existing.reason !== reason) {
      throw new Error("Idempotency key was already used with another reason");
    }
    if (existing.state === "accepted" || existing.state === "reconciled") {
      return {
        assignmentId: assignment._id,
        membershipId: existing.membershipId,
        state: existing.state,
        ...(existing.adapter ? { adapter: existing.adapter } : {}),
        ...(existing.workosId ? { workosId: existing.workosId } : {}),
      };
    }
  } else if (existing?.state === "accepted") {
    throw new Error(
      "Member deactivation is already awaiting WorkOS reconciliation"
    );
  }
  return null;
}

async function assertDeactivationActor(
  ctx: MutationCtx,
  args: {
    actorRoles: string[];
    actorWorkosUserId: string;
  },
  organization: Doc<"lenderOrganizations">
) {
  if (args.actorRoles.includes("admin")) {
    return;
  }
  const actorUser = await requireActiveLenderWorkosUser(
    ctx,
    args.actorWorkosUserId
  );
  const actorMemberships = await listActiveSharedLenderMemberships(
    ctx,
    args.actorWorkosUserId
  );
  const actorRoleSlugs = normalizeLenderRoleSlugs(
    actorMemberships.flatMap((membership) => [
      membership.roleSlug,
      ...membership.roleSlugs,
    ])
  );
  const actorAssignments = await ctx.db
    .query("lenderOrganizationAssignments")
    .withIndex("by_workos_user_and_status", (query) =>
      query.eq("workosUserId", actorUser.workosUserId).eq("status", "active")
    )
    .take(3);
  if (
    !actorRoleSlugs.includes("lender-admin") ||
    actorAssignments.length !== 1 ||
    actorAssignments[0]?.lenderOrganizationId !== organization._id ||
    actorAssignments[0]?.deactivation?.state === "accepted"
  ) {
    throw new Error(
      "Forbidden: active same-organization Lender Admin required"
    );
  }
}

async function resolveTargetLenderMembership(
  ctx: MutationCtx,
  assignment: Doc<"lenderOrganizationAssignments">,
  organization: Doc<"lenderOrganizations">
) {
  const targetMemberships = await listActiveSharedLenderMemberships(
    ctx,
    assignment.workosUserId ?? ""
  );
  if (targetMemberships.length !== 1) {
    throw new Error(
      "Lender member WorkOS membership is unavailable or ambiguous"
    );
  }
  const targetMembership = targetMemberships[0];
  if (!targetMembership) {
    throw new Error("Lender member WorkOS membership is unavailable");
  }
  const targetRoles = normalizeLenderRoleSlugs([
    targetMembership.roleSlug,
    ...targetMembership.roleSlugs,
  ]);
  if (targetRoles.length === 0) {
    throw new Error("Target must have a supported lender role");
  }
  if (targetRoles.includes("lender-admin")) {
    const activeMembers = await listActiveLenderOrganizationMembers(
      ctx,
      organization._id
    );
    if (
      activeMembers.filter((member) => member.roles.includes("lender-admin"))
        .length <= 1
    ) {
      throw new Error("The last active Lender Admin cannot be deactivated");
    }
  }
  return targetMembership;
}

export async function beginLenderMemberDeactivation(
  ctx: MutationCtx,
  args: {
    actorRoles: string[];
    actorWorkosUserId: string;
    assignmentId: Id<"lenderOrganizationAssignments">;
    idempotencyKey: string;
    reason: string;
  }
): Promise<LenderMemberDeactivationPreparation> {
  const assignment = await ctx.db.get(args.assignmentId);
  if (
    !assignment ||
    assignment.status !== "active" ||
    !assignment.workosUserId
  ) {
    throw new Error("Lender member assignment is not active");
  }
  const organization = await ctx.db.get(assignment.lenderOrganizationId);
  const brokerage = await ctx.db.get(assignment.brokerageId);
  if (
    !organization ||
    organization.status !== "active" ||
    !brokerage ||
    brokerage.status !== "active"
  ) {
    throw new Error("Forbidden: active lender organization scope required");
  }
  const reason = requireDeactivationReason(args.reason);
  const idempotencyKey = args.idempotencyKey.trim();
  if (idempotencyKey.length < 8) {
    throw new Error("A stable idempotency key is required");
  }
  const existing = existingDeactivationPreparation(
    assignment,
    idempotencyKey,
    reason
  );
  if (existing) {
    return existing;
  }

  await assertDeactivationActor(ctx, args, organization);
  if (assignment.workosUserId === args.actorWorkosUserId) {
    throw new Error("You cannot deactivate your own lender membership");
  }

  const targetMembership = await resolveTargetLenderMembership(
    ctx,
    assignment,
    organization
  );

  const now = Date.now();
  const actorRole = primaryActorRole(args.actorRoles);
  await ctx.db.patch(assignment._id, {
    deactivation: {
      idempotencyKey,
      membershipId: targetMembership.workosMembershipId,
      reason,
      requestedAt: now,
      requestedByRole: actorRole,
      requestedByRoles: args.actorRoles,
      requestedByWorkosUserId: args.actorWorkosUserId,
      state: "requested",
    },
    updatedAt: now,
  });
  await writeLenderAudit(
    {
      ...ctx,
      viewer: { subject: args.actorWorkosUserId, roles: args.actorRoles },
    },
    brokerage,
    organization._id,
    {
      command: "deactivateSharedLenderMembership",
      entityId: String(assignment._id),
      entityType: "lenderOrganizationAssignment",
      eventType: "lender.organization.member_deactivation.requested",
      priorState: { status: assignment.status },
      newState: {
        state: "requested",
        membershipId: targetMembership.workosMembershipId,
      },
      reason,
    }
  );
  return {
    assignmentId: assignment._id,
    membershipId: targetMembership.workosMembershipId,
    state: "ready",
  };
}

export async function markLenderMemberDeactivationAccepted(
  ctx: MutationCtx,
  args: {
    adapter: "fake" | "workos";
    assignmentId: Id<"lenderOrganizationAssignments">;
    idempotencyKey: string;
    workosId?: string;
  }
) {
  const assignment = await ctx.db.get(args.assignmentId);
  const deactivation = assignment?.deactivation;
  if (
    !(assignment && deactivation) ||
    deactivation.idempotencyKey !== args.idempotencyKey
  ) {
    throw new Error("Lender member deactivation lifecycle changed");
  }
  if (
    deactivation.state === "accepted" ||
    deactivation.state === "reconciled"
  ) {
    return null;
  }
  if (deactivation.state !== "requested") {
    throw new Error("Lender member deactivation is not ready for acceptance");
  }
  const now = Date.now();
  const { error: _error, failedAt: _failedAt, ...requested } = deactivation;
  await ctx.db.patch(assignment._id, {
    deactivation: {
      ...requested,
      adapter: args.adapter,
      acceptedAt: now,
      state: "accepted",
      ...(args.workosId ? { workosId: args.workosId } : {}),
    },
    updatedAt: now,
  });
  const brokerage = await ctx.db.get(assignment.brokerageId);
  const organization = await ctx.db.get(assignment.lenderOrganizationId);
  if (!(brokerage && organization)) {
    throw new Error("Lender member deactivation scope disappeared");
  }
  await writeLenderAudit(
    {
      ...ctx,
      viewer: {
        subject: deactivation.requestedByWorkosUserId,
        roles: deactivation.requestedByRoles,
      },
    },
    brokerage,
    organization._id,
    {
      command: "deactivateSharedLenderMembership",
      entityId: deactivation.membershipId,
      entityType: "workosOrganizationMembership",
      eventType: "workos.lender_membership.deactivation.accepted",
      priorState: {
        assignmentStatus: assignment.status,
        authority: "active",
      },
      newState: {
        assignmentStatus: assignment.status,
        authority: "suspended",
        workosStatus: "pending_reconciliation",
      },
      reason: deactivation.reason,
    }
  );
  return null;
}

export async function markLenderMemberDeactivationFailed(
  ctx: MutationCtx,
  args: {
    assignmentId: Id<"lenderOrganizationAssignments">;
    error: string;
    idempotencyKey: string;
  }
) {
  const assignment = await ctx.db.get(args.assignmentId);
  const deactivation = assignment?.deactivation;
  if (
    !(assignment && deactivation) ||
    deactivation.idempotencyKey !== args.idempotencyKey
  ) {
    return null;
  }
  const now = Date.now();
  await ctx.db.patch(assignment._id, {
    deactivation: {
      ...deactivation,
      error: args.error.slice(0, 300),
      failedAt: now,
      state: "failed",
    },
    updatedAt: now,
  });
  const brokerage = await ctx.db.get(assignment.brokerageId);
  const organization = await ctx.db.get(assignment.lenderOrganizationId);
  if (brokerage && organization) {
    await writeLenderAudit(
      {
        ...ctx,
        viewer: {
          subject: deactivation.requestedByWorkosUserId,
          roles: deactivation.requestedByRoles,
        },
      },
      brokerage,
      organization._id,
      {
        command: "deactivateSharedLenderMembership",
        entityId: deactivation.membershipId,
        entityType: "workosOrganizationMembership",
        eventType: "workos.lender_membership.deactivation.failed",
        priorState: {
          assignmentStatus: assignment.status,
          authority: "active",
        },
        newState: {
          assignmentStatus: assignment.status,
          authority: "active",
          workosStatus: "provider_failure",
          error: args.error.slice(0, 300),
        },
        reason: deactivation.reason,
      }
    );
  }
  return null;
}

export async function finalizeLenderMemberDeactivationFromProjection(
  ctx: MutationCtx,
  input: {
    membershipId: string;
    now: number;
    status: "inactive" | "deleted";
    workosUserId: string;
  }
) {
  const [activeAssignments, inactiveAssignments] = await Promise.all([
    ctx.db
      .query("lenderOrganizationAssignments")
      .withIndex("by_workos_user_and_status", (query) =>
        query.eq("workosUserId", input.workosUserId).eq("status", "active")
      )
      .take(3),
    ctx.db
      .query("lenderOrganizationAssignments")
      .withIndex("by_workos_user_and_status", (query) =>
        query.eq("workosUserId", input.workosUserId).eq("status", "inactive")
      )
      .take(3),
  ]);
  const assignments = [...activeAssignments, ...inactiveAssignments];
  if (assignments.length !== 1) {
    return false;
  }
  const assignment = assignments[0];
  if (!assignment) {
    return false;
  }
  const deactivation = assignment.deactivation;
  if (!deactivation || deactivation.membershipId !== input.membershipId) {
    return false;
  }
  const plan = planReconciledLenderMemberDeactivation({
    currentStatus: assignment.status,
    deactivationState: deactivation.state,
    now: input.now,
    requestedByWorkosUserId: deactivation.requestedByWorkosUserId,
  });
  if (!plan) {
    return false;
  }
  const brokerage = await ctx.db.get(assignment.brokerageId);
  const organization = await ctx.db.get(assignment.lenderOrganizationId);
  if (!(brokerage && organization)) {
    throw new Error(
      "Lender member deactivation scope disappeared during reconciliation"
    );
  }
  const { deactivationState, ...statusPlan } = plan;
  await applyAssignmentTransition(ctx, assignment, {
    actorRoles: deactivation.requestedByRoles,
    actorWorkosUserId: deactivation.requestedByWorkosUserId,
    brokerage,
    command: "reconcileLenderMemberDeactivation",
    deactivationPatch: {
      reconciledAt: input.now,
      state: deactivationState,
    },
    eventType: "lender.organization.member_deactivation.reconciled",
    lenderOrganizationId: organization._id,
    newState: {
      assignmentStatus: statusPlan.status ?? assignment.status,
      membershipStatus: input.status,
    },
    now: input.now,
    priorState: {
      assignmentStatus: assignment.status,
      authority: "suspended",
    },
    reason: deactivation.reason,
    statusPatch: statusPlan,
  });
  return true;
}
