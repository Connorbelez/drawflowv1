import type { Doc } from "./_generated/dataModel";
import { buildCollaborationSearchAuthorityRole } from "./build_collaboration_search_authority_model";
import type { MutationCtx } from "./types";

export async function syncBuildCollaborationSearchAuthority(
  ctx: MutationCtx,
  membership: Pick<
    Doc<"workosOrganizationMemberships">,
    | "roleSlug"
    | "roleSlugs"
    | "status"
    | "workosMembershipId"
    | "workosOrganizationId"
    | "workosUserId"
  >
) {
  const existing = await ctx.db
    .query("buildCollaborationSearchAuthorities")
    .withIndex("by_workosMembershipId", (query) =>
      query.eq("workosMembershipId", membership.workosMembershipId)
    )
    .unique();
  const role =
    membership.status === "active"
      ? buildCollaborationSearchAuthorityRole([
          membership.roleSlug,
          ...(membership.roleSlugs ?? []),
        ])
      : undefined;
  if (!role) {
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return;
  }
  const authority = {
    organizationId: membership.workosOrganizationId,
    role,
    updatedAt: Date.now(),
    workosMembershipId: membership.workosMembershipId,
    workosUserId: membership.workosUserId,
  };
  if (existing) {
    await ctx.db.patch(existing._id, authority);
    return;
  }
  await ctx.db.insert("buildCollaborationSearchAuthorities", authority);
}
