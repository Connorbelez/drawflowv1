import type { Doc, Id } from "../_generated/dataModel";
import {
  lenderCanMakeFinalDecision,
  listActiveSharedLenderMemberships,
  normalizeLenderEmail,
  normalizeLenderRoleSlugs,
} from "../lenderOrganizationAccess";
import type { MutationCtx, QueryCtx } from "../types";

export async function projectActiveLenderMember(
  ctx: QueryCtx,
  assignment: Doc<"lenderOrganizationAssignments">
) {
  const workosUserId = assignment.workosUserId;
  if (assignment.status !== "active" || !workosUserId) {
    return null;
  }
  const [userRows, memberships] = await Promise.all([
    ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (query) =>
        query.eq("workosUserId", workosUserId)
      )
      .take(2),
    listActiveSharedLenderMemberships(ctx, workosUserId),
  ]);
  const user = userRows.length === 1 ? userRows[0] : null;
  if (!user || user.status !== "active" || memberships.length === 0) {
    return null;
  }
  const roleSlugs = normalizeLenderRoleSlugs(
    memberships.flatMap((membership) => [
      membership.roleSlug,
      ...membership.roleSlugs,
    ])
  );
  return {
    assignmentId: assignment._id,
    membershipId: memberships[0]?.workosMembershipId,
    userId: user._id,
    workosUserId,
    name: user.name || user.email,
    email: user.email,
    ...(user.profilePictureUrl
      ? { profilePictureUrl: user.profilePictureUrl }
      : {}),
    roleSlugs,
    assignmentStatus: "active" as const,
    membershipStatus: "active" as const,
    canMakeFinalDecision: lenderCanMakeFinalDecision(roleSlugs),
  };
}

export async function findAssignmentByUserAndStatus(
  ctx: { db: QueryCtx["db"] | MutationCtx["db"] },
  workosUserId: string,
  status: "active" | "pending"
) {
  return await ctx.db
    .query("lenderOrganizationAssignments")
    .withIndex("by_workos_user_and_status", (query) =>
      query.eq("workosUserId", workosUserId).eq("status", status)
    )
    .take(2)
    .then((rows) => {
      if (rows.length > 1) {
        throw new Error("Lender organization assignment is ambiguous");
      }
      return rows[0] ?? null;
    });
}

const NORMALIZED_WORKOS_USER_COMPATIBILITY_LIMIT = 500;

/**
 * Compatibility read used while users.by_normalized_email is staged and its
 * optional key is being backfilled. It scans one bounded projection snapshot
 * and fails closed above the established directory boundary instead of
 * performing an incomplete case-sensitive match. After the staged index is
 * ready and made queryable, this helper can switch to indexed equality reads.
 */
export async function listActiveWorkosUserEmailProjectionSnapshot(ctx: {
  db: QueryCtx["db"] | MutationCtx["db"];
}): Promise<Doc<"users">[]> {
  const users = await ctx.db
    .query("users")
    .take(NORMALIZED_WORKOS_USER_COMPATIBILITY_LIMIT + 1);
  if (users.length > NORMALIZED_WORKOS_USER_COMPATIBILITY_LIMIT) {
    throw new Error(
      "Normalized WorkOS user email lookup requires the staged email-index backfill before the directory exceeds 500 records"
    );
  }
  return users.filter(
    (user) => user.status === "active" && Boolean(user.workosUserId)
  );
}

export async function findAssignmentByEmailAndStatus(
  ctx: { db: QueryCtx["db"] | MutationCtx["db"] },
  normalizedEmail: string,
  status: "active" | "pending"
) {
  return await ctx.db
    .query("lenderOrganizationAssignments")
    .withIndex("by_normalized_email_and_status", (query) =>
      query.eq("normalizedEmail", normalizedEmail).eq("status", status)
    )
    .take(2)
    .then((rows) => {
      if (rows.length > 1) {
        throw new Error("Lender organization email assignment is ambiguous");
      }
      return rows[0] ?? null;
    });
}

export function requireName(value: string, label: string): string {
  const name = value.trim();
  if (!name) {
    throw new Error(`${label} is required`);
  }
  return name;
}

export function requireReason(value: string): string {
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
  const supported = [
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
  return supported.find((role) => roles.includes(role)) ?? "admin";
}

export async function writeLenderAudit(
  ctx: { db: MutationCtx["db"]; viewer: { subject: string; roles: string[] } },
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
    reconciliationKey: `${input.command}:${String(lenderOrganizationId)}:${now}`,
    warnings: [],
    createdAt: now,
  });
}

export async function reconcilePendingLenderAssignmentsHandler(
  ctx: MutationCtx,
  args: { lenderOrganizationId?: Id<"lenderOrganizations"> }
) {
  const pending = args.lenderOrganizationId
    ? await ctx.db
        .query("lenderOrganizationAssignments")
        .withIndex("by_lender_organization_and_status", (query) =>
          query
            .eq("lenderOrganizationId", args.lenderOrganizationId!)
            .eq("status", "pending")
        )
        .take(501)
    : await ctx.db
        .query("lenderOrganizationAssignments")
        .withIndex("by_status", (query) => query.eq("status", "pending"))
        .take(501);
  if (pending.length > 500) {
    throw new Error("Pending lender assignment queue exceeds the safe limit");
  }
  let activated = 0;
  let bound = 0;
  let stillPending = 0;
  let conflicts = 0;
  const now = Date.now();
  const ambiguousPendingEmails = new Set<string>();
  for (const assignment of pending) {
    const sameEmail = await ctx.db
      .query("lenderOrganizationAssignments")
      .withIndex("by_normalized_email_and_status", (query) =>
        query
          .eq("normalizedEmail", assignment.normalizedEmail)
          .eq("status", "pending")
      )
      .take(2);
    if (sameEmail.length > 1)
      ambiguousPendingEmails.add(assignment.normalizedEmail);
  }
  const activeUsersByNormalizedEmail = new Map<string, Doc<"users">[]>();
  for (const user of await listActiveWorkosUserEmailProjectionSnapshot(ctx)) {
    const normalizedEmail = normalizeLenderEmail(user.email);
    const users = activeUsersByNormalizedEmail.get(normalizedEmail) ?? [];
    users.push(user);
    activeUsersByNormalizedEmail.set(normalizedEmail, users);
  }
  for (const assignment of pending) {
    if (ambiguousPendingEmails.has(assignment.normalizedEmail)) {
      await ctx.db.patch(assignment._id, {
        reconciledAt: now,
        reconciliationOutcome: "conflict_rejected",
        reconciliationReason:
          "The normalized email matches multiple pending Lender Organization invitations.",
        status: "inactive",
        updatedAt: now,
      });
      conflicts += 1;
      continue;
    }
    const activeUsers =
      activeUsersByNormalizedEmail.get(assignment.normalizedEmail) ?? [];
    if (activeUsers.length > 1) {
      await ctx.db.patch(assignment._id, {
        reconciledAt: now,
        reconciliationOutcome: "conflict_rejected",
        reconciliationReason:
          "The normalized email matches multiple active WorkOS user projections.",
        status: "inactive",
        updatedAt: now,
      });
      conflicts += 1;
      continue;
    }
    const user = activeUsers[0];
    if (!user?.workosUserId) {
      stillPending += 1;
      continue;
    }
    const memberships = await listActiveSharedLenderMemberships(
      ctx,
      user.workosUserId
    );
    const roleSlugs = normalizeLenderRoleSlugs(
      memberships.flatMap((membership) => [
        membership.roleSlug,
        ...membership.roleSlugs,
      ])
    );
    if (memberships.length === 0 || roleSlugs.length === 0) {
      stillPending += 1;
      continue;
    }
    const activeAssignment = await findAssignmentByUserAndStatus(
      ctx,
      user.workosUserId,
      "active"
    );
    if (activeAssignment && activeAssignment._id !== assignment._id) {
      const compatible =
        activeAssignment.lenderOrganizationId ===
          assignment.lenderOrganizationId &&
        activeAssignment.normalizedEmail === assignment.normalizedEmail;
      await ctx.db.patch(assignment._id, {
        reconciledAt: now,
        reconciledToAssignmentId: activeAssignment._id,
        reconciliationOutcome: compatible ? "bound" : "conflict_rejected",
        reconciliationReason: compatible
          ? undefined
          : "The WorkOS user already has an active assignment in a different Lender Organization.",
        status: "inactive",
        updatedAt: now,
        workosUserId: user.workosUserId,
      });
      if (compatible) {
        bound += 1;
      } else {
        conflicts += 1;
      }
      continue;
    }
    const otherPending = await findAssignmentByUserAndStatus(
      ctx,
      user.workosUserId,
      "pending"
    );
    if (otherPending && otherPending._id !== assignment._id) {
      await ctx.db.patch(assignment._id, {
        reconciledAt: now,
        reconciledToAssignmentId: otherPending._id,
        reconciliationOutcome:
          otherPending.lenderOrganizationId ===
            assignment.lenderOrganizationId &&
          otherPending.normalizedEmail === assignment.normalizedEmail
            ? "bound"
            : "conflict_rejected",
        reconciliationReason:
          otherPending.lenderOrganizationId ===
            assignment.lenderOrganizationId &&
          otherPending.normalizedEmail === assignment.normalizedEmail
            ? undefined
            : "The WorkOS user is already linked to a different pending Lender Organization invitation.",
        status: "inactive",
        updatedAt: now,
        workosUserId: user.workosUserId,
      });
      if (
        otherPending.lenderOrganizationId === assignment.lenderOrganizationId &&
        otherPending.normalizedEmail === assignment.normalizedEmail
      )
        bound += 1;
      else conflicts += 1;
      continue;
    }
    const [activeEmailAssignments, pendingEmailAssignments] = await Promise.all(
      [
        ctx.db
          .query("lenderOrganizationAssignments")
          .withIndex("by_normalized_email_and_status", (query) =>
            query
              .eq("normalizedEmail", assignment.normalizedEmail)
              .eq("status", "active")
          )
          .take(2),
        ctx.db
          .query("lenderOrganizationAssignments")
          .withIndex("by_normalized_email_and_status", (query) =>
            query
              .eq("normalizedEmail", assignment.normalizedEmail)
              .eq("status", "pending")
          )
          .take(2),
      ]
    );
    const emailCollision =
      activeEmailAssignments[0] ??
      pendingEmailAssignments.find(
        (candidate) => candidate._id !== assignment._id
      );
    if (emailCollision) {
      await ctx.db.patch(assignment._id, {
        reconciledAt: now,
        reconciledToAssignmentId: emailCollision._id,
        reconciliationOutcome: "conflict_rejected",
        reconciliationReason:
          emailCollision.status === "active"
            ? "The normalized email already has an active assignment owned by another WorkOS identity."
            : "The normalized email already has another pending assignment owned by another WorkOS identity.",
        status: "inactive",
        updatedAt: now,
        workosUserId: user.workosUserId,
      });
      conflicts += 1;
      continue;
    }
    await ctx.db.patch(assignment._id, {
      workosUserId: user.workosUserId,
      status: "active",
      updatedAt: now,
    });
    activated += 1;
  }
  return { activated, bound, stillPending, conflicts };
}
