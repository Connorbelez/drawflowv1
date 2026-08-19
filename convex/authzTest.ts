import { v } from "convex/values";

import {
  adminQuery,
  authenticatedQuery,
  backofficeQuery,
  builderQuery,
  destructiveWriteMutation,
  lenderOrganizationMutation,
  lenderOrganizationQuery,
  lenderUserManagementMutation,
  nonDestructiveWriteMutation,
  requireLenderOrganizationPermission,
  requireLenderOrganizationResource,
  userManagementWriteMutation,
} from "./authz";

const viewerReturn = v.object({
  actorKind: v.optional(
    v.union(
      v.literal("human"),
      v.literal("agent"),
      v.literal("service"),
      v.literal("system"),
      v.literal("automation")
    )
  ),
  capability: v.string(),
  email: v.optional(v.string()),
  roles: v.array(v.string()),
  subject: v.string(),
  tokenIdentifier: v.string(),
});

const activeOrganizationReturn = v.object({
  brokerageId: v.id("brokerages"),
  brokerageName: v.string(),
  lenderOrganizationId: v.id("lenderOrganizations"),
  membershipIds: v.array(v.string()),
  organizationName: v.string(),
  permissions: v.object({
    drawDecisions: v.boolean(),
    milestoneDecisions: v.boolean(),
    proposalReview: v.boolean(),
    siteVisitReview: v.boolean(),
  }),
  roles: v.array(v.string()),
  userId: v.id("users"),
  workosOrganizationId: v.string(),
  workosUserId: v.string(),
});

const lenderResourceInput = {
  brokerageId: v.optional(v.id("brokerages")),
  lenderOrganizationId: v.optional(v.id("lenderOrganizations")),
  organizationId: v.optional(v.string()),
  permission: v.optional(v.string()),
};

export const requireAuthenticated = authenticatedQuery
  .returns(viewerReturn)
  .handler(async (ctx) => ctx.viewer)
  .internal();

export const requireAdmin = adminQuery
  .returns(viewerReturn)
  .handler(async (ctx) => ctx.viewer)
  .internal();

export const requireBackoffice = backofficeQuery
  .returns(viewerReturn)
  .handler(async (ctx) => ctx.viewer)
  .internal();

export const requireBuilder = builderQuery
  .returns(viewerReturn)
  .handler(async (ctx) => ctx.viewer)
  .internal();

export const requireUserManagementWrite = userManagementWriteMutation
  .returns(viewerReturn)
  .handler(async (ctx) => ctx.viewer)
  .internal();

export const requireNonDestructiveWrite = nonDestructiveWriteMutation
  .returns(viewerReturn)
  .handler(async (ctx) => ctx.viewer)
  .internal();

export const requireDestructiveWrite = destructiveWriteMutation
  .returns(viewerReturn)
  .handler(async (ctx) => ctx.viewer)
  .internal();

export const requireLenderOrganizationQuery = lenderOrganizationQuery
  .input(lenderResourceInput)
  .returns(activeOrganizationReturn)
  .handler(async (ctx, args) => {
    requireLenderOrganizationResource(ctx.activeOrganization, args);
    if (args.permission) {
      await requireLenderOrganizationPermission(
        ctx,
        ctx.activeOrganization,
        args.permission
      );
    }
    return ctx.activeOrganization;
  })
  .internal();

export const requireLenderOrganizationMutation = lenderOrganizationMutation
  .input(lenderResourceInput)
  .returns(activeOrganizationReturn)
  .handler(async (ctx, args) => {
    requireLenderOrganizationResource(ctx.activeOrganization, args);
    if (args.permission) {
      await requireLenderOrganizationPermission(
        ctx,
        ctx.activeOrganization,
        args.permission
      );
    }
    return ctx.activeOrganization;
  })
  .internal();

export const requireLenderUserManagement = lenderUserManagementMutation
  .returns(activeOrganizationReturn)
  .handler(async (ctx) => ctx.activeOrganization)
  .internal();
