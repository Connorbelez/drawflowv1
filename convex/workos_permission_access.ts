import type { RoleSlug } from "./authz";
import type { MutationCtx, QueryCtx } from "./types";

/**
 * Resolve a permission from the webhook-owned WorkOS role projections.
 * Product flows remain read-only against those tables; WorkOS remains the
 * authority that changes role and permission membership.
 */
export async function hasProjectedWorkosPermission(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  workosOrganizationId: string,
  roles: readonly RoleSlug[],
  permission: string
) {
  for (const role of roles) {
    const organizationRole = await ctx.db
      .query("workosOrganizationRoles")
      .withIndex("by_organization_slug", (query) =>
        query.eq("workosOrganizationId", workosOrganizationId).eq("slug", role)
      )
      .unique();
    if (
      organizationRole?.status === "active" &&
      organizationRole.permissionSlugs.includes(permission)
    ) {
      return true;
    }

    const globalRole = await ctx.db
      .query("workosRoles")
      .withIndex("by_slug", (query) => query.eq("slug", role))
      .unique();
    if (
      globalRole?.status === "active" &&
      globalRole.permissionSlugs.includes(permission)
    ) {
      return true;
    }
  }

  return false;
}
