import type { BuildCollaborationRole } from "./build_collaboration_model";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

export type MilestoneExecutionOwnershipState =
  | "assigned"
  | "assignment_required";

export type MilestoneExecutionOwnershipReason =
  | "assigned"
  | "missing"
  | "invalid"
  | "ambiguous";

export interface CanonicalMilestoneExecutionOwnership {
  assignment?: Doc<"milestoneContractorAssignments">;
  contractor?: Doc<"contractorProfiles">;
  reason: MilestoneExecutionOwnershipReason;
  state: MilestoneExecutionOwnershipState;
}

export function isDrawSystemPost(
  post: Pick<
    Doc<"buildCollaborationPosts">,
    | "primaryReferenceKind"
    | "source"
    | "systemOccurrenceKey"
    | "systemPostKind"
  >
) {
  return (
    post.source === "system" &&
    post.systemPostKind === "draw" &&
    post.primaryReferenceKind === "draw" &&
    post.systemOccurrenceKey?.startsWith("draw-system:") === true
  );
}

export function isMilestoneSystemPost(
  post: Pick<
    Doc<"buildCollaborationPosts">,
    "source" | "systemOccurrenceKey" | "systemPostKind"
  >
) {
  return (
    post.source === "system" &&
    post.systemPostKind === "milestone" &&
    post.systemOccurrenceKey?.startsWith("milestone-system:") === true
  );
}

export function isCanonicalCollaborationSystemPost(
  post: Pick<
    Doc<"buildCollaborationPosts">,
    | "primaryReferenceKind"
    | "source"
    | "systemOccurrenceKey"
    | "systemPostKind"
  >,
) {
  return isMilestoneSystemPost(post) || isDrawSystemPost(post);
}

export async function canReadMilestoneSystemEvent(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    milestoneId?: Id<"buildMilestones">;
    role: BuildCollaborationRole;
    workosUserId: string;
  }
) {
  if (input.role === "homeowner") {
    return false;
  }
  if (input.role !== "contractor") {
    return true;
  }
  if (!input.milestoneId) {
    return false;
  }
  const [build, milestone] = await Promise.all([
    ctx.db.get(input.buildId),
    ctx.db.get(input.milestoneId),
  ]);
  if (
    !build ||
    !milestone ||
    milestone.buildId !== input.buildId ||
    milestone.organizationId !== build.organizationId ||
    milestone.brokerageId !== build.brokerageId
  ) {
    return false;
  }
  // The roadmap-level System Post is build-visible once the contractor has
  // passed active-build authorization. Exact Work Allocation remains the
  // authority for generated Sub-milestone cards and Start commands below.
  return true;
}

export async function canReadMilestoneSystemActionItem(
  ctx: QueryCtx | MutationCtx,
  input: {
    actionItem: Pick<
      Doc<"buildActionItems">,
      | "canonicalBuildMilestoneId"
      | "canonicalBuildSubmilestoneId"
      | "systemMode"
    >;
    buildId: Id<"activeBuilds">;
    role: BuildCollaborationRole;
    workosUserId: string;
  }
) {
  if (input.actionItem.systemMode !== "generated_milestone_submilestone") {
    return true;
  }
  if (input.role === "homeowner") {
    return false;
  }
  if (input.role !== "contractor") {
    return true;
  }
  const milestoneId = input.actionItem.canonicalBuildMilestoneId;
  const submilestoneId = input.actionItem.canonicalBuildSubmilestoneId;
  if (!(milestoneId && submilestoneId)) {
    return false;
  }
  const [build, milestone, submilestone] = await Promise.all([
    ctx.db.get(input.buildId),
    ctx.db.get(milestoneId),
    ctx.db.get(submilestoneId),
  ]);
  if (
    !(build && milestone && submilestone) ||
    milestone.buildId !== input.buildId ||
    milestone.organizationId !== build.organizationId ||
    milestone.brokerageId !== build.brokerageId ||
    submilestone.buildId !== input.buildId ||
    submilestone.organizationId !== build.organizationId ||
    submilestone.brokerageId !== build.brokerageId ||
    submilestone.buildMilestoneId !== milestone._id
  ) {
    return false;
  }
  const ownership = await resolveCanonicalMilestoneExecutionOwnership(ctx, {
    build,
    milestone,
    submilestone,
    includeCompleted: true,
  });
  return (
    ownership.state === "assigned" &&
    ownership.contractor?.accountWorkosUserId === input.workosUserId
  );
}

export async function canReadCanonicalMilestoneSubmilestone(
  ctx: QueryCtx | MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    milestone: Doc<"buildMilestones">;
    submilestone: Doc<"buildSubmilestones">;
    role: BuildCollaborationRole;
    workosUserId: string;
  }
) {
  if (input.role === "homeowner") {
    return false;
  }
  if (input.role !== "contractor") {
    return true;
  }
  const ownership = await resolveCanonicalMilestoneExecutionOwnership(ctx, {
    build: input.build,
    milestone: input.milestone,
    submilestone: input.submilestone,
    includeCompleted: true,
  });
  return (
    ownership.state === "assigned" &&
    ownership.contractor?.accountWorkosUserId === input.workosUserId
  );
}

/**
 * Resolve the one canonical execution owner for an exact Milestone ×
 * Sub-milestone target.  This intentionally reads only the Work Allocation
 * tables; generated System Action Items never participate in this decision.
 */
export async function resolveCanonicalMilestoneExecutionOwnership(
  ctx: QueryCtx | MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    milestone: Doc<"buildMilestones">;
    submilestone: Doc<"buildSubmilestones">;
    includeCompleted?: boolean;
  }
): Promise<CanonicalMilestoneExecutionOwnership> {
  const { build, milestone, submilestone } = input;
  if (
    milestone.buildId !== build._id ||
    milestone.organizationId !== build.organizationId ||
    milestone.brokerageId !== build.brokerageId ||
    submilestone.buildId !== build._id ||
    submilestone.organizationId !== build.organizationId ||
    submilestone.brokerageId !== build.brokerageId ||
    submilestone.buildMilestoneId !== milestone._id ||
    submilestone.milestoneKey !== milestone.key
  ) {
    return {
      reason: "invalid",
      state: "assignment_required",
    };
  }

  const rows = await ctx.db
    .query("milestoneContractorAssignments")
    .withIndex("by_submilestone", (query) =>
      query
        .eq("buildId", build._id)
        .eq("milestoneKey", milestone.key)
        .eq("submilestoneKey", submilestone.key)
    )
    .take(101);
  // A bounded read must fail closed when the bound is exceeded. Otherwise a
  // valid assignment after the first 100 rows could be selected as though the
  // truncated set were authoritative.
  if (rows.length > 100) {
    return {
      reason: "ambiguous",
      state: "assignment_required",
    };
  }
  const scopedRows = rows.filter(
    (row) =>
      row.organizationId === build.organizationId &&
      row.brokerageId === build.brokerageId &&
      row.buildId === build._id &&
      row.buildMilestoneId === milestone._id &&
      row.milestoneKey === milestone.key &&
      row.buildSubmilestoneId === submilestone._id &&
      row.submilestoneKey === submilestone.key
  );
  // A live assignment is authoritative even when callers also allow a
  // completed fallback.  Completed rows are historical records and must not
  // displace a currently planned/active owner.
  const liveRows = scopedRows.filter(
    (row) => row.status === "planned" || row.status === "active",
  );
  if (liveRows.length > 1) {
    return {
      reason: "ambiguous",
      state: "assignment_required",
    };
  }
  let assignment = liveRows[0];
  if (!assignment && input.includeCompleted) {
    const completedRows = scopedRows.filter(
      (row) => row.status === "completed",
    );
    if (completedRows.length > 1) {
      return {
        reason: "ambiguous",
        state: "assignment_required",
      };
    }
    assignment = completedRows[0];
  }
  if (!assignment) {
    return {
      reason: rows.length > 0 && scopedRows.length === 0 ? "invalid" : "missing",
      state: "assignment_required",
    };
  }

  const [rootAssignment, contractor] = await Promise.all([
    ctx.db.get(assignment.buildContractorAssignmentId),
    ctx.db.get(assignment.contractorId),
  ]);
  if (
    !rootAssignment ||
    rootAssignment.organizationId !== build.organizationId ||
    rootAssignment.brokerageId !== build.brokerageId ||
    rootAssignment.buildId !== build._id ||
    rootAssignment.contractorId !== assignment.contractorId ||
    rootAssignment.status !== "active" ||
    !contractor ||
    contractor.organizationId !== build.organizationId ||
    contractor.brokerageId !== build.brokerageId ||
    contractor.status !== "active" ||
    !contractor.accountWorkosUserId
  ) {
    return {
      reason: "invalid",
      state: "assignment_required",
    };
  }
  return {
    assignment,
    contractor,
    reason: "assigned",
    state: "assigned",
  };
}

/** Builder owner or explicitly authorized Builder Staff can start work. */
export async function canBuilderStartMilestone(
  ctx: QueryCtx | MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    role: BuildCollaborationRole;
    workosUserId: string;
  }
) {
  if (input.role !== "builder" && input.role !== "builder-staff") {
    return false;
  }
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (query) =>
      query
        .eq("builderProfileId", input.build.builderProfileId)
        .eq("workosUserId", input.workosUserId)
    )
    .take(21);
  // The query is intentionally bounded one past the usable limit.  A
  // truncated link set is not authoritative and must fail closed.
  if (links.length > 20) {
    return false;
  }
  const requestedLinkRole = input.role === "builder" ? "owner" : "staff";
  const activeLink = links
    .filter((link) => link.role === requestedLinkRole)
    .find(
      (link) =>
        link.status === "active" &&
        link.brokerageId === input.build.brokerageId,
    );
  if (!activeLink) {
    return false;
  }
  if (input.role === "builder") {
    return true;
  }
  const grants = await ctx.db
    .query("builderStaffPermissionGrants")
    .withIndex("by_build_link_resource", (query) =>
      query
        .eq("buildId", input.build._id)
        .eq("builderAccountLinkId", activeLink._id)
        .eq("resourceType", "milestone")
    )
    .take(101);
  if (grants.length > 100) {
    return false;
  }
  return grants.some(
    (grant) =>
      grant.scope === "activeBuild" &&
      grant.organizationId === input.build.organizationId &&
      grant.brokerageId === input.build.brokerageId &&
      grant.builderProfileId === input.build.builderProfileId &&
      grant.workosUserId === input.workosUserId &&
      grant.canUpdate
  );
}

export async function canReadDrawSystemEvent(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    role: BuildCollaborationRole;
    workosUserId: string;
  }
) {
  return Boolean(await resolveDrawSystemEventReadDecision(ctx, input));
}

export async function resolveDrawSystemEventReadDecision(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    role: BuildCollaborationRole;
    workosUserId: string;
  }
) {
  if (input.role === "contractor" || input.role === "homeowner") {
    return null;
  }
  if (input.role !== "builder-staff") {
    return {
      basis: "role" as const,
      role: input.role,
    };
  }

  const build = await ctx.db.get(input.buildId);
  if (!build?.builderProfileId) {
    return null;
  }
  const builderProfileId = build.builderProfileId;
  const activeLinks = (
    await ctx.db
      .query("builderAccountLinks")
      .withIndex("by_builder_user", (query) =>
        query
          .eq("builderProfileId", builderProfileId)
          .eq("workosUserId", input.workosUserId)
      )
      .collect()
  ).filter(
    (link) => link.status === "active" && link.brokerageId === build.brokerageId
  );
  const ownerLink = activeLinks.find((link) => link.role === "owner");
  if (ownerLink) {
    return {
      basis: "builder_owner_link" as const,
      builderAccountLinkId: ownerLink._id,
    };
  }

  for (const link of activeLinks) {
    const grants = await ctx.db
      .query("builderStaffPermissionGrants")
      .withIndex("by_build_link_resource", (query) =>
        query
          .eq("buildId", input.buildId)
          .eq("builderAccountLinkId", link._id)
          .eq("resourceType", "draw")
      )
      .collect();
    const grant = grants.find(
      (candidate) =>
        candidate.scope === "activeBuild" &&
        candidate.organizationId === build.organizationId &&
        candidate.brokerageId === build.brokerageId &&
        candidate.builderProfileId === builderProfileId &&
        candidate.workosUserId === input.workosUserId &&
        candidate.canView
    );
    if (grant) {
      return {
        basis: "builder_staff_permission_grant" as const,
        builderAccountLinkId: link._id,
        permissionGrantId: grant._id,
      };
    }
  }
  return null;
}
