import type { BuildCollaborationRole } from "./build_collaboration_model";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

export function isDrawSystemPost(
  post: Pick<Doc<"buildCollaborationPosts">, "primaryReferenceKind" | "source">
) {
  return post.source === "system" && post.primaryReferenceKind === "draw";
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
