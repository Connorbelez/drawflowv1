import { v } from "convex/values";

import {
  normalizeRoleSlugs,
  type RoleSlug,
  userManagementWriteQuery,
} from "./authz";
import { ASSIGNABLE_BROKER_ROLES } from "./brokerAssignments";
import {
  FAIRLEND_BROKERAGE_NAME,
  FAIRLEND_DEFAULT_BROKER_EMAIL,
  FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID,
  FAIRLEND_WORKOS_ORGANIZATION_ID,
} from "./fairLendConfig";
import type { Doc } from "./types";

export {
  getTenantActivationState,
  getBuilderBrokerRelationshipSummary,
  repairOwnBuilderBrokerAssignment,
  reconcileBrokerageBuilderAssignments,
} from "./brokerageProvisioning/relationship";
export {
  provisionBrokerageProfile,
  provisionFairLendBrokerage,
  provisionBuilderProfile,
  linkBuilderAccount,
  unlinkBuilderAccount,
  provisionNewBuilder,
  finalizeNewBuilderProvisioning,
} from "./brokerageProvisioning/provisioning";

const BROKER_ROLES = ASSIGNABLE_BROKER_ROLES;
const BUILDER_ROLES = ["builder", "builder-staff"] as const;

export const listBrokerageProvisioning = userManagementWriteQuery
  .returns(v.any())
  .handler(async (ctx) => {
    const organizationScope = ctx.viewer.roles.includes("admin")
      ? null
      : ctx.viewer.organizationId;
    if (!(ctx.viewer.roles.includes("admin") || organizationScope)) {
      throw new Error("Active organization context is required.");
    }
    const [
      organizations,
      memberships,
      users,
      brokerages,
      builderProfiles,
      builderAccountLinks,
    ] = await Promise.all([
      organizationScope
        ? ctx.db
            .query("workosOrganizations")
            .withIndex("by_workos_organization_id", (q) =>
              q.eq("workosOrganizationId", organizationScope),
            )
            .collect()
        : ctx.db.query("workosOrganizations").collect(),
      organizationScope
        ? ctx.db
            .query("workosOrganizationMemberships")
            .withIndex("by_organization", (q) =>
              q.eq("workosOrganizationId", organizationScope),
            )
            .collect()
        : ctx.db.query("workosOrganizationMemberships").collect(),
      ctx.db.query("users").collect(),
      organizationScope
        ? ctx.db
            .query("brokerages")
            .withIndex("by_workos_organization", (q) =>
              q.eq("workosOrganizationId", organizationScope),
            )
            .collect()
        : ctx.db.query("brokerages").collect(),
      organizationScope
        ? ctx.db
            .query("builderProfiles")
            .withIndex("by_organization", (q) =>
              q.eq("organizationId", organizationScope),
            )
            .collect()
        : ctx.db.query("builderProfiles").collect(),
      ctx.db.query("builderAccountLinks").collect(),
    ]);

    const usersByWorkosId = new Map(
      users
        .filter((user) => user.workosUserId)
        .map((user) => [user.workosUserId as string, user]),
    );
    const fairLendPrincipalMembership = memberships.find((membership) => {
      const user = usersByWorkosId.get(membership.workosUserId);
      return (
        membership.status === "active" &&
        membership.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID &&
        hasAnyRole(membershipRoleSlugs(membership), BROKER_ROLES) &&
        user?.status === "active" &&
        normalizeEmail(user.email) === FAIRLEND_DEFAULT_BROKER_EMAIL
      );
    });
    const brokeragesByWorkosOrg = new Map(
      brokerages.map((brokerage) => [
        brokerage.workosOrganizationId,
        brokerage,
      ]),
    );
    const builderProfilesByOrg = new Map(
      builderProfiles.map((profile) => [profile.organizationId, profile]),
    );
    const linksByProfile = new Map<string, typeof builderAccountLinks>();
    for (const link of builderAccountLinks) {
      if (link.status !== "active") {
        continue;
      }
      const list = linksByProfile.get(link.builderProfileId as string) ?? [];
      list.push(link);
      linksByProfile.set(link.builderProfileId as string, list);
    }

    return {
      fairLendBootstrap: {
        displayName: FAIRLEND_BROKERAGE_NAME,
        principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
        principalBrokerWorkosUserId:
          fairLendPrincipalMembership?.workosUserId ??
          FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID,
        workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      },
      organizations: organizations.map((organization) => {
        const brokerage = brokeragesByWorkosOrg.get(
          organization.workosOrganizationId,
        );
        const orgMemberships = memberships.filter(
          (membership) =>
            membership.status === "active" &&
            membership.workosOrganizationId ===
              organization.workosOrganizationId,
        );
        const projectMembership = (
          membership: (typeof orgMemberships)[number],
        ) => {
          const user = usersByWorkosId.get(membership.workosUserId);
          return {
            email: user?.email,
            name: user?.name,
            roleSlugs: membershipRoleSlugs(membership),
            workosMembershipId: membership.workosMembershipId,
            workosUserId: membership.workosUserId,
          };
        };
        const brokerMemberships = orgMemberships
          .filter((membership) =>
            hasAnyRole(membershipRoleSlugs(membership), BROKER_ROLES),
          )
          .map(projectMembership);
        const builderMemberships = orgMemberships
          .filter((membership) =>
            hasAnyRole(membershipRoleSlugs(membership), BUILDER_ROLES),
          )
          .map(projectMembership);

        const builderProfile = builderProfilesByOrg.get(
          organization.workosOrganizationId,
        );
        const builderAccountLinkRows = builderProfile
          ? (linksByProfile.get(builderProfile._id as string) ?? []).map(
              (link) => ({
                _id: link._id as string,
                role: link.role,
                workosUserId: link.workosUserId,
              }),
            )
          : [];

        return {
          brokerage: brokerage
            ? {
                _id: brokerage._id,
                displayName: brokerage.displayName,
                legalName: brokerage.legalName,
                principalBrokerEmail: brokerage.principalBrokerEmail,
                principalBrokerWorkosUserId:
                  brokerage.principalBrokerWorkosUserId,
                status: brokerage.status,
              }
            : null,
          brokerMemberships,
          builderAccountLinks: builderAccountLinkRows,
          builderMemberships,
          builderProfile: builderProfile
            ? {
                _id: builderProfile._id,
                displayName: builderProfile.displayName,
                status: builderProfile.status,
              }
            : null,
          hasBrokerageProfile: Boolean(brokerage),
          hasBuilderProfile: Boolean(builderProfile),
          name: organization.name,
          needsBrokerageProfile:
            !brokerage &&
            organization.status === "active" &&
            brokerMemberships.length > 0,
          needsBuilderProfile:
            !builderProfile &&
            organization.status === "active" &&
            builderMemberships.length > 0 &&
            Boolean(brokerage),
          status: organization.status,
          workosOrganizationId: organization.workosOrganizationId,
        };
      }),
    };
  })
  .public();


function membershipRoleSlugs(
  membership: Pick<
    Doc<"workosOrganizationMemberships">,
    "roleSlug" | "roleSlugs"
  >,
) {
  return normalizeRoleSlugs([
    membership.roleSlug,
    ...(membership.roleSlugs ?? []),
  ]);
}

function hasAnyRole(
  actual: readonly RoleSlug[],
  expected: readonly RoleSlug[],
) {
  return actual.some((role) => expected.includes(role));
}

function normalizeEmail(value: string): string {
  const trimmed = value.trim().toLowerCase();
  // Minimal structural check: exactly one @ with non-empty local and domain parts.
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@") || at === trimmed.length - 1) {
    return "";
  }
  if (!trimmed.slice(at + 1).includes(".")) {
    return "";
  }
  return trimmed;
}
