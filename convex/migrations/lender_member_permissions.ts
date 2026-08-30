import { internal } from "../_generated/api.js";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "../fairLendConfig.js";
import { normalizeLenderRoleSlugs } from "../lenderOrganizationAccess.js";
import { migrations } from "./context";

/**
 * Stage 1 backfill for assignment-owned lender decision grants. Active Lender
 * and Lender Admin assignments inherit the organization cap. Staff, pending,
 * inactive, and unverifiable assignments receive no decision authority.
 */
export const backfillLenderMemberDecisionPermissions = migrations.define({
  table: "lenderOrganizationAssignments",
  migrateOne: async (ctx, assignment) => {
    if (
      assignment.decisionPermissions &&
      assignment.decisionPermissionsVersion !== undefined
    ) {
      return;
    }
    const organization = await ctx.db.get(assignment.lenderOrganizationId);
    let inheritsOrganizationPermissions = false;
    if (
      assignment.status === "active" &&
      assignment.workosUserId &&
      organization?.status === "active"
    ) {
      const workosUserId = assignment.workosUserId;
      const memberships = await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user_and_organization", (query) =>
          query
            .eq("workosUserId", workosUserId)
            .eq("workosOrganizationId", FAIRLEND_WORKOS_ORGANIZATION_ID)
        )
        .take(20);
      const roles = normalizeLenderRoleSlugs(
        memberships
          .filter((membership) => membership.status === "active")
          .flatMap((membership) => [
            membership.roleSlug,
            ...membership.roleSlugs,
          ])
      );
      inheritsOrganizationPermissions =
        roles.includes("lender") || roles.includes("lender-admin");
    }
    return {
      decisionPermissions:
        inheritsOrganizationPermissions && organization
          ? {
              proposalReview: organization.permissions.proposalReview,
              milestoneDecisions: organization.permissions.milestoneDecisions,
              drawDecisions: organization.permissions.drawDecisions,
            }
          : {
              proposalReview: false,
              milestoneDecisions: false,
              drawDecisions: false,
            },
      decisionPermissionsVersion: 1,
    };
  },
});

export const runLenderMemberDecisionPermissionsBackfill = migrations.runner([
  internal.migrations.backfillLenderMemberDecisionPermissions,
]);
