import { v } from "convex/values";

import {
  type AuthorizedViewer,
  type RoleSlug,
  backofficeMutation,
  backofficeQuery,
  contractorMutation,
  contractorQuery,
  normalizeRoleSlugs,
} from "../authz";
import { requireContractorLinkedProfile } from "../contractorAuth";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

import {
  contractorRoleQuery,
  contractorRoleMutation,
} from "./access";
// ---------------------------------------------------------------------------
// Notification read-back (PRD §10)
// ---------------------------------------------------------------------------

export const listContractorNotifications = contractorRoleQuery
  .input({ includeRead: v.optional(v.boolean()) })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    const rows = await ctx.db
      .query("contractorNotifications")
      .withIndex("by_contractor_created", (q) =>
        q.eq("contractorId", contractor._id)
      )
      .collect();
    return rows
      .filter((row) => (args.includeRead ? true : row.readAt === undefined))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map((row) => ({
        _id: row._id,
        kind: row.kind,
        channel: row.channel,
        title: row.title,
        body: row.body ?? null,
        proposalId: row.proposalId ?? null,
        buildId: row.buildId ?? null,
        milestoneKey: row.milestoneKey ?? null,
        readAt: row.readAt ?? null,
        createdAt: row.createdAt,
      }));
  })
  .public();

export const markContractorNotificationRead = contractorRoleMutation
  .input({ notificationId: v.id("contractorNotifications") })
  .returns(v.boolean())
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.contractorId !== contractor._id) {
      throw new Error(
        "Forbidden: notification does not belong to your profile."
      );
    }
    await ctx.db.patch(args.notificationId, { readAt: Date.now() });
    return true;
  })
  .public();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function viewerSubject(ctx: unknown): string {
  return (ctx as { viewer: AuthorizedViewer }).viewer.subject;
}

function viewerRoles(ctx: unknown): readonly RoleSlug[] {
  return (ctx as { viewer: AuthorizedViewer }).viewer.roles;
}

interface BrokerageScope {
  brokerage: Doc<"brokerages">;
  roles: RoleSlug[];
  subject: string;
}

async function resolveBrokerageScopeOrThrow(
  ctx: QueryCtx | MutationCtx,
  workosOrganizationId: string
): Promise<BrokerageScope> {
  const viewer = (ctx as unknown as { viewer: AuthorizedViewer }).viewer;
  const subject = viewer.subject;
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", subject))
    .filter((q) => q.eq(q.field("workosOrganizationId"), workosOrganizationId))
    .first();
  const activeTokenOrganizationId = viewer.organizationId?.trim();
  if (
    (!membership || membership.status !== "active") &&
    activeTokenOrganizationId !== workosOrganizationId
  ) {
    throw new Error("Forbidden: WorkOS membership");
  }
  const brokerage = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (q) =>
      q.eq("workosOrganizationId", workosOrganizationId)
    )
    .unique();
  if (!brokerage) {
    throw new Error("Forbidden: brokerage");
  }
  const roles = normalizeRoleSlugs(viewer.roles ?? membership?.roleSlugs ?? []);
  return { brokerage, roles, subject };
}
