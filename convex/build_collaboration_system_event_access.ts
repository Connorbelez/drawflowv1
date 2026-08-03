import type { BuildCollaborationRole } from "./build_collaboration_model";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

export function isDrawSystemPost(
  post: Pick<Doc<"buildCollaborationPosts">, "primaryReferenceKind" | "source">
) {
  return post.source === "system" && post.primaryReferenceKind === "draw";
}

export function isMilestoneSystemPost(
  post: Pick<Doc<"buildCollaborationPosts">, "source" | "systemPostKind">
) {
  return post.source === "system" && post.systemPostKind === "milestone";
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
  const milestone = await ctx.db.get(input.milestoneId);
  if (!milestone || milestone.buildId !== input.buildId) {
    return false;
  }
  return contractorAssignedToMilestone(ctx, {
    buildId: input.buildId,
    milestoneKey: milestone.key,
    workosUserId: input.workosUserId,
  });
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
  const [milestone, submilestone] = await Promise.all([
    ctx.db.get(milestoneId),
    ctx.db.get(submilestoneId),
  ]);
  if (
    !(milestone && submilestone) ||
    milestone.buildId !== input.buildId ||
    submilestone.buildId !== input.buildId ||
    submilestone.buildMilestoneId !== milestone._id
  ) {
    return false;
  }
  return contractorAssignedToMilestone(ctx, {
    buildId: input.buildId,
    milestoneKey: milestone.key,
    submilestoneId: submilestone._id,
    workosUserId: input.workosUserId,
  });
}

async function contractorAssignedToMilestone(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    milestoneKey: string;
    submilestoneId?: Id<"buildSubmilestones">;
    workosUserId: string;
  }
) {
  const assignments = await ctx.db
    .query("milestoneContractorAssignments")
    .withIndex("by_build_milestone", (query) =>
      query.eq("buildId", input.buildId).eq("milestoneKey", input.milestoneKey)
    )
    .take(500);
  for (const assignment of assignments) {
    if (assignment.status === "removed") {
      continue;
    }
    if (
      input.submilestoneId &&
      assignment.buildSubmilestoneId &&
      assignment.buildSubmilestoneId !== input.submilestoneId
    ) {
      continue;
    }
    const contractor = await ctx.db.get(assignment.contractorId);
    if (contractor?.accountWorkosUserId === input.workosUserId) {
      return true;
    }
  }
  return false;
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
