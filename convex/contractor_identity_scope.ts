import {
  type AuthorizedViewer,
  normalizeRoleSlugs,
  type RoleSlug,
} from "./authz";
import type { Doc, MutationCtx, QueryCtx } from "./types";

export interface ContractorBrokerageScope {
  brokerage: Doc<"brokerages">;
  roles: RoleSlug[];
  subject: string;
}

/**
 * Canonical WorkOS-to-Brokerage identity scope for Contractor lifecycle
 * adapters. WorkOS projections remain read-only and authoritative.
 */
export async function resolveBrokerageScopeOrThrow(
  ctx: QueryCtx | MutationCtx,
  workosOrganizationId: string,
  viewer?: AuthorizedViewer
): Promise<ContractorBrokerageScope> {
  const activeViewer =
    viewer ?? (ctx as unknown as { viewer: AuthorizedViewer }).viewer;
  const subject = activeViewer.subject;
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (query) => query.eq("workosUserId", subject))
    .filter((query) =>
      query.eq(query.field("workosOrganizationId"), workosOrganizationId)
    )
    .first();
  const activeTokenOrganizationId = activeViewer.organizationId?.trim();
  if (
    (!membership || membership.status !== "active") &&
    activeTokenOrganizationId !== workosOrganizationId
  ) {
    throw new Error("Forbidden: WorkOS membership");
  }
  const brokerage = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (query) =>
      query.eq("workosOrganizationId", workosOrganizationId)
    )
    .unique();
  if (!brokerage) {
    throw new Error("Forbidden: brokerage");
  }
  return {
    brokerage,
    roles: normalizeRoleSlugs(
      activeViewer.roles ?? membership?.roleSlugs ?? []
    ),
    subject,
  };
}
