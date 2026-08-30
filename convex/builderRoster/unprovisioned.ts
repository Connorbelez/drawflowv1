import { v } from "convex/values";

import { backofficeQuery } from "../authz";
import type { Doc, Id, QueryCtx } from "../types";

const BUILDER_ROLE_SLUGS = ["builder", "builder-staff"] as const;

async function loadUsersForOrganization(
  ctx: QueryCtx,
  workosUserIds: Iterable<string>,
): Promise<Doc<"users">[]> {
  const ids = Array.from(new Set(workosUserIds)).filter(
    (id): id is string => Boolean(id),
  );
  if (ids.length === 0) {
    return [];
  }
  const results = await Promise.all(
    ids.map((id) =>
      ctx.db
        .query("users")
        .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", id))
        .first(),
    ),
  );
  return results.filter((row): row is Doc<"users"> => row !== null);
}

async function loadLinksForBrokerages(
  ctx: QueryCtx,
  brokerageIds: Id<"brokerages">[],
): Promise<Doc<"builderAccountLinks">[]> {
  if (brokerageIds.length === 0) {
    return [];
  }
  const rows = await Promise.all(
    brokerageIds.map((id) =>
      ctx.db
        .query("builderAccountLinks")
        .withIndex("by_brokerageId_and_updatedAt", (q) =>
          q.eq("brokerageId", id),
        )
        .collect(),
    ),
  );
  return rows.flat();
}

function membershipRoleSlugs(
  membership: Pick<
    Doc<"workosOrganizationMemberships">,
    "roleSlug" | "roleSlugs"
  >,
): string[] {
  if (membership.roleSlugs.length > 0) {
    return membership.roleSlugs;
  }
  return membership.roleSlug ? [membership.roleSlug] : [];
}

/**
 * WorkOS users who carry a builder role but are not yet linked to any active
 * builder profile. These are builders the platform knows about (via their
 * membership) but who have no borrower profile to underwrite against, so a
 * broker can provision one for them directly from the builders console.
 *
 * Scoped to organizations that already have a brokerage, since a builder
 * profile must attach to a lender.
 */
export const listUnprovisionedBuilders = backofficeQuery
  .returns(v.any())
  .handler(async (ctx) => {
    const organizationScope = ctx.viewer.roles.includes("admin")
      ? null
      : ctx.viewer.organizationId;
    if (!(ctx.viewer.roles.includes("admin") || organizationScope)) {
      throw new Error("Active organization context is required.");
    }
    const [memberships, brokerages] = await Promise.all([
      organizationScope
        ? ctx.db
            .query("workosOrganizationMemberships")
            .withIndex("by_organization", (q) =>
              q.eq("workosOrganizationId", organizationScope),
            )
            .collect()
        : ctx.db.query("workosOrganizationMemberships").collect(),
      organizationScope
        ? ctx.db
            .query("brokerages")
            .withIndex("by_workos_organization", (q) =>
              q.eq("workosOrganizationId", organizationScope),
            )
            .collect()
        : ctx.db.query("brokerages").collect(),
    ]);
    // Links and users are scoped to the same organization so the candidates
    // (org-scoped memberships) are evaluated against this tenant's data only.
    const links = organizationScope
      ? await loadLinksForBrokerages(ctx, brokerages.map((row) => row._id))
      : await ctx.db.query("builderAccountLinks").collect();
    const users = organizationScope
      ? await loadUsersForOrganization(
          ctx,
          memberships.map((m) => m.workosUserId),
        )
      : await ctx.db.query("users").collect();

    const usersByWorkosId = new Map(
      users
        .filter((row) => row.workosUserId)
        .map((row) => [row.workosUserId as string, row]),
    );
    const brokerageByOrg = new Map(
      brokerages.map((row) => [row.workosOrganizationId, row]),
    );
    const linkedUserIds = new Set(
      links
        .filter((link) => link.status === "active")
        .map((link) => link.workosUserId),
    );

    const candidates = memberships
      .filter((membership) => {
        if (membership.status !== "active") {
          return false;
        }
        const slugs = membershipRoleSlugs(membership);
        const isBuilder = slugs.some((slug) =>
          (BUILDER_ROLE_SLUGS as readonly string[]).includes(slug),
        );
        if (!isBuilder) {
          return false;
        }
        if (linkedUserIds.has(membership.workosUserId)) {
          return false;
        }
        return brokerageByOrg.has(membership.workosOrganizationId);
      })
      .map((membership) => {
        const user = usersByWorkosId.get(membership.workosUserId);
        const brokerage = brokerageByOrg.get(membership.workosOrganizationId);
        return {
          brokerageDisplayName: brokerage?.displayName ?? null,
          email: user?.email ?? null,
          name: user?.name ?? null,
          profilePictureUrl: user?.profilePictureUrl ?? null,
          roleSlugs: membershipRoleSlugs(membership),
          workosMembershipId: membership.workosMembershipId,
          workosOrganizationId: membership.workosOrganizationId,
          workosUserId: membership.workosUserId,
        };
      })
      .sort((a, b) =>
        (a.name ?? a.email ?? a.workosUserId).localeCompare(
          b.name ?? b.email ?? b.workosUserId,
        ),
      );

    return { candidates };
  })
  .public();
