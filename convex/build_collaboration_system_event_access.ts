import type { BuildCollaborationRole } from "./build_collaboration_model";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

export function isDrawSystemPost(
  post: Pick<Doc<"buildCollaborationPosts">, "primaryReferenceKind" | "source">,
) {
  return post.source === "system" && post.primaryReferenceKind === "draw";
}

export async function canReadDrawSystemEvent(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    role: BuildCollaborationRole;
    workosUserId: string;
  },
) {
  if (input.role === "contractor" || input.role === "homeowner") {
    return false;
  }
  if (input.role !== "builder-staff") {
    return true;
  }

  const build = await ctx.db.get(input.buildId);
  if (!build?.builderProfileId) {
    return false;
  }
  const activeLinks = (
    await ctx.db
      .query("builderAccountLinks")
      .withIndex("by_builder_user", (query) =>
        query
          .eq("builderProfileId", build.builderProfileId!)
          .eq("workosUserId", input.workosUserId),
      )
      .collect()
  ).filter(
    (link) =>
      link.status === "active" && link.brokerageId === build.brokerageId,
  );
  if (activeLinks.some((link) => link.role === "owner")) {
    return true;
  }

  for (const link of activeLinks) {
    const grants = await ctx.db
      .query("builderStaffPermissionGrants")
      .withIndex("by_build_link_resource", (query) =>
        query
          .eq("buildId", input.buildId)
          .eq("builderAccountLinkId", link._id)
          .eq("resourceType", "draw"),
      )
      .collect();
    if (
      grants.some(
        (grant) =>
          grant.scope === "activeBuild" &&
          grant.organizationId === build.organizationId &&
          grant.brokerageId === build.brokerageId &&
          grant.builderProfileId === build.builderProfileId &&
          grant.workosUserId === input.workosUserId &&
          grant.canView,
      )
    ) {
      return true;
    }
  }
  return false;
}
