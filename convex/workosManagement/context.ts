import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  type AuthorizedViewer,
  userManagementWriteQuery,
} from "../authz";
import { internalQuery, publicMutation } from "../fluent";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "../fairLendConfig";
import {
  LENDER_ROLE_SLUGS,
  type LenderRoleSlug as AppLenderRoleSlug,
} from "../lenderOrganizationAccess";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import * as shared from "./shared";

const {
  acceptedReturn,
  transferRequiredReturn,
  membershipCommandReturn,
  sharedLenderRoleValidator,
  sharedLenderMembershipTargetReturn,
  principalBrokerTransferReturn,
  builderStaffProvisionReturn,
  syncReturn,
  USER_ALREADY_MEMBER_PATTERN,
  EMAIL_ALREADY_INVITED_PATTERN,
  commandContextReturn,
  toWorkosEntity,
  membershipRoleUpdateResult,
  projectedMembershipRoleSlugs,
  listBoundedOrganizationMemberships,
  assertDifferentTransferMemberships,
  assertManagementRoleSlugs,
  canAssignInitialPrincipalBroker,
  roleChangeRequiresProtectedTransfer,
  principalBrokerRemovalRequiresTransfer,
  reactivationRequiresProtectedTransfer,
  transferRequired,
  orderedManagementRoleSlugs,
  normalizedReason,
  requireReason,
  requireNonEmptyValue,
  auditWorkosCommand,
  projectedMembershipState,
  auditMembershipCommandAccepted,
  auditWorkosCommandFailure,
  auditMembershipCommandFailure,
  markPrincipalBrokerTransferFailure,
  auditPrincipalBrokerTransfer,
  safeWorkosError,
  accepted,
  requireNonEmptyRoleSlug,
  normalizeWorkosEmail,
  normalizeWorkosRoleSlug,
  normalizeWorkosRoleSlugs,
  workosMembershipRoleSlugs,
  buildWorkosMembershipRolesPayload,
  requireSelectedPrimaryRole,
  entityIdentifier,
  eventForSync,
  stringOrNow,
  workosIdSlug,
  workosTimestamp,
  isWorkosConflict,
  workosErrorMessage,
} = shared;
type AcceptedResult = shared.AcceptedResult;
type MembershipRoleUpdateResult = shared.MembershipRoleUpdateResult;
type WorkosManagementCommandContext = shared.WorkosManagementCommandContext;
type BeginPrincipalBrokerTransferResult = shared.BeginPrincipalBrokerTransferResult;
type PrincipalBrokerTransferResult = shared.PrincipalBrokerTransferResult;
type BuilderStaffProvisionResult = shared.BuilderStaffProvisionResult;
type WorkosProvisionUser = shared.WorkosProvisionUser;
type WorkosProvisionInvitation = shared.WorkosProvisionInvitation;
type WorkosProvisionMembershipStatus = shared.WorkosProvisionMembershipStatus;
type WorkosProvisionMembership = shared.WorkosProvisionMembership;
type WorkosProvisionClient = shared.WorkosProvisionClient;
type WorkosEntity = shared.WorkosEntity;
type SyncSnapshot = shared.SyncSnapshot;
type SyncResult = shared.SyncResult;
type ScopedUserManagementActionCtx = shared.ScopedUserManagementActionCtx;


export const resolveWorkosManagementCommandContext = userManagementWriteQuery
  .input({
    membershipId: v.optional(v.string()),
    organizationId: v.optional(v.string()),
  })
  .returns(commandContextReturn)
  .handler(resolveWorkosManagementCommandContextHandler)
  .internal();

type WorkosManagementQueryCtx = QueryCtx & { viewer: AuthorizedViewer };

async function resolveWorkosManagementCommandContextHandler(
  ctx: WorkosManagementQueryCtx,
  args: { membershipId?: string; organizationId?: string }
): Promise<WorkosManagementCommandContext> {
  if (!(args.membershipId || args.organizationId)) {
    throw new Error("WorkOS management target is required");
  }
  const actor = await resolveWorkosManagementActor(ctx);
  const targetMembership = await resolveProjectedTargetMembership(
    ctx,
    args.membershipId
  );
  const organizationId = resolveManagementOrganizationId(
    args,
    targetMembership
  );
  if (actor.organizationScope && organizationId !== actor.organizationScope) {
    throw new Error("Forbidden: organization scope");
  }
  const brokerage = await resolveActiveManagementBrokerage(ctx, organizationId);
  const activePrincipalBrokerMembershipIds =
    await listActivePrincipalBrokerMembershipIds(ctx, organizationId);
  return {
    activePrincipalBrokerMembershipIds,
    actorRole: actor.actorRoles.includes("principle-broker")
      ? "principle-broker"
      : "admin",
    actorRoles: actor.actorRoles,
    actorWorkosUserId: ctx.viewer.subject,
    brokerageId: brokerage._id,
    mode: actor.mode,
    organizationId,
    ...(targetMembership
      ? { targetMembership: projectedCommandMembership(targetMembership) }
      : {}),
  };
}
async function resolveWorkosManagementActor(ctx: WorkosManagementQueryCtx) {
  if (ctx.viewer.roles.includes("admin")) {
    return {
      actorRoles: ctx.viewer.roles,
      mode: "backoffice" as const,
      organizationScope: undefined,
    };
  }
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  const organizationId =
    ctx.viewer.organizationId ??
    (typeof identity.organizationId === "string"
      ? identity.organizationId
      : undefined);
  if (!organizationId) {
    throw new Error("Forbidden: organization scope");
  }
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user_and_organization", (query) =>
      query
        .eq("workosUserId", identity.subject)
        .eq("workosOrganizationId", organizationId)
    )
    .take(2);
  if (
    memberships.length !== 1 ||
    memberships[0]?.status !== "active" ||
    !projectedMembershipRoleSlugs(memberships[0]).includes("principle-broker")
  ) {
    throw new Error("Forbidden: active backoffice membership");
  }
  return {
    actorRoles: ctx.viewer.roles,
    mode: "backoffice" as const,
    organizationScope: organizationId,
  };
}

async function resolveProjectedTargetMembership(
  ctx: WorkosManagementQueryCtx,
  membershipId: string | undefined
) {
  if (!membershipId) {
    return null;
  }
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_workos_membership_id", (query) =>
      query.eq("workosMembershipId", membershipId)
    )
    .unique();
  if (!membership) {
    throw new Error("Forbidden: membership scope");
  }
  return membership;
}

function resolveManagementOrganizationId(
  args: { organizationId?: string },
  targetMembership: Doc<"workosOrganizationMemberships"> | null
) {
  const organizationId =
    args.organizationId ?? targetMembership?.workosOrganizationId;
  if (!organizationId) {
    throw new Error("Forbidden: organization scope");
  }
  if (
    targetMembership &&
    args.organizationId &&
    targetMembership.workosOrganizationId !== args.organizationId
  ) {
    throw new Error("Forbidden: membership organization mismatch");
  }
  return organizationId;
}

async function resolveActiveManagementBrokerage(
  ctx: WorkosManagementQueryCtx,
  organizationId: string
) {
  const organization = await ctx.db
    .query("workosOrganizations")
    .withIndex("by_workos_organization_id", (query) =>
      query.eq("workosOrganizationId", organizationId)
    )
    .unique();
  if (!organization || organization.status !== "active") {
    throw new Error("Forbidden: inactive organization");
  }
  const brokerages = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (query) =>
      query.eq("workosOrganizationId", organizationId)
    )
    .take(2);
  const [brokerage] = brokerages;
  if (brokerages.length !== 1 || !brokerage || brokerage.status !== "active") {
    throw new Error("Forbidden: active brokerage scope");
  }
  return brokerage;
}

async function listActivePrincipalBrokerMembershipIds(
  ctx: WorkosManagementQueryCtx,
  organizationId: string
) {
  const organizationMemberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_organization", (query) =>
      query.eq("workosOrganizationId", organizationId)
    )
    .take(501);
  if (organizationMemberships.length > 500) {
    throw new Error("Forbidden: organization membership limit exceeded");
  }
  return organizationMemberships
    .filter(
      (membership) =>
        membership.status === "active" &&
        projectedMembershipRoleSlugs(membership).includes("principle-broker")
    )
    .map((membership) => membership.workosMembershipId)
    .sort();
}

function projectedCommandMembership(
  membership: Doc<"workosOrganizationMemberships">
) {
  return {
    roleSlug: membership.roleSlug,
    roleSlugs: membership.roleSlugs,
    status: membership.status,
    workosMembershipId: membership.workosMembershipId,
    workosOrganizationId: membership.workosOrganizationId,
    workosUserId: membership.workosUserId,
  };
}

export const recordWorkosManagementAudit = publicMutation
  .input({
    actorRole: v.union(v.literal("admin"), v.literal("principle-broker")),
    actorRoles: v.array(v.string()),
    actorWorkosUserId: v.string(),
    brokerageId: v.id("brokerages"),
    command: v.string(),
    entityId: v.string(),
    entityType: v.string(),
    eventType: v.string(),
    newState: v.optional(v.string()),
    organizationId: v.string(),
    priorState: v.optional(v.string()),
    reason: v.optional(v.string()),
    reconciliationKey: v.string(),
    warnings: v.array(v.string()),
  })
  .returns(v.id("auditEvents"))
  .handler(async (ctx, args) => {
    const brokerage = await ctx.db.get(args.brokerageId);
    if (
      !brokerage ||
      brokerage.status !== "active" ||
      brokerage.workosOrganizationId !== args.organizationId
    ) {
      throw new Error("Forbidden: audit brokerage scope");
    }
    const existing = await ctx.db
      .query("auditEvents")
      .withIndex("by_organizationId_and_reconciliationKey", (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq("reconciliationKey", args.reconciliationKey)
      )
      .unique();
    if (existing) {
      return existing._id;
    }
    return await ctx.db.insert("auditEvents", {
      actorRole: args.actorRole,
      actorRoles: args.actorRoles,
      actorWorkosUserId: args.actorWorkosUserId,
      brokerageId: args.brokerageId,
      command: args.command,
      entityId: args.entityId,
      entityType: args.entityType,
      eventType: args.eventType,
      ...(args.newState ? { newState: args.newState } : {}),
      organizationId: args.organizationId,
      ...(args.priorState ? { priorState: args.priorState } : {}),
      ...(args.reason ? { reason: args.reason } : {}),
      reconciliationKey: args.reconciliationKey,
      warnings: args.warnings,
      createdAt: Date.now(),
    });
  })
  .internal();

/**
 * Resolve a membership command against the app-owned lender organization.
 * The shared WorkOS organization is only the identity and membership
 * container; the app assignment remains the source of lender-organization
 * scope.
 */
export const resolveSharedLenderMembershipTarget = internalQuery
  .input({
    lenderOrganizationId: v.id("lenderOrganizations"),
    membershipId: v.string(),
  })
  .returns(sharedLenderMembershipTargetReturn)
  .handler(async (ctx, args) => {
    const lenderOrganization = await ctx.db.get(args.lenderOrganizationId);
    if (!lenderOrganization || lenderOrganization.status !== "active") {
      throw new Error("Forbidden: inactive lender organization");
    }
    const brokerage = await ctx.db.get(lenderOrganization.brokerageId);
    if (!brokerage || brokerage.status !== "active") {
      throw new Error("Forbidden: active brokerage scope");
    }

    const memberships = await ctx.db
      .query("workosOrganizationMemberships")
      .withIndex("by_workos_membership_id", (query) =>
        query.eq("workosMembershipId", args.membershipId)
      )
      .take(2);
    if (memberships.length !== 1) {
      throw new Error("Forbidden: membership projection scope");
    }
    const [membership] = memberships;
    if (
      !membership ||
      membership.status !== "active" ||
      membership.workosOrganizationId !== FAIRLEND_WORKOS_ORGANIZATION_ID
    ) {
      throw new Error("Forbidden: shared lender membership scope");
    }

    const users = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (query) =>
        query.eq("workosUserId", membership.workosUserId)
      )
      .take(2);
    if (users.length !== 1 || users[0]?.status !== "active") {
      throw new Error("Forbidden: active user projection");
    }

    const assignments = await ctx.db
      .query("lenderOrganizationAssignments")
      .withIndex("by_workos_user_and_status", (query) =>
        query.eq("workosUserId", membership.workosUserId).eq("status", "active")
      )
      .take(3);
    if (
      assignments.length !== 1 ||
      assignments[0]?.lenderOrganizationId !== args.lenderOrganizationId
    ) {
      throw new Error("Forbidden: lender organization assignment scope");
    }

    const roleSlugs = projectedMembershipRoleSlugs(membership);
    if (!roleSlugs.some((role) => LENDER_ROLE_SLUGS.includes(role as AppLenderRoleSlug))) {
      throw new Error("Forbidden: supported lender role required");
    }

    return {
      brokerageId: brokerage._id,
      lenderOrganizationId: lenderOrganization._id,
      membershipId: membership.workosMembershipId,
      roleSlugs,
      workosUserId: membership.workosUserId,
    };
  })
  .internal();

export const recordSharedLenderMembershipAudit = publicMutation
  .input({
    actorRole: v.literal("admin"),
    actorRoles: v.array(v.string()),
    actorWorkosUserId: v.string(),
    brokerageId: v.id("brokerages"),
    command: v.string(),
    entityId: v.string(),
    entityType: v.string(),
    eventType: v.string(),
    lenderOrganizationId: v.id("lenderOrganizations"),
    newState: v.optional(v.string()),
    priorState: v.optional(v.string()),
    reason: v.optional(v.string()),
    reconciliationKey: v.string(),
    warnings: v.array(v.string()),
  })
  .returns(v.id("auditEvents"))
  .handler(async (ctx, args) => {
    const lenderOrganization = await ctx.db.get(args.lenderOrganizationId);
    const brokerage = await ctx.db.get(args.brokerageId);
    if (
      !lenderOrganization ||
      lenderOrganization.brokerageId !== args.brokerageId ||
      !brokerage ||
      brokerage.status !== "active"
    ) {
      throw new Error("Forbidden: shared lender audit scope");
    }
    const existing = await ctx.db
      .query("auditEvents")
      .withIndex("by_organizationId_and_reconciliationKey", (query) =>
        query
          .eq("organizationId", FAIRLEND_WORKOS_ORGANIZATION_ID)
          .eq("reconciliationKey", args.reconciliationKey)
      )
      .unique();
    if (existing) {
      return existing._id;
    }
    return await ctx.db.insert("auditEvents", {
      actorRole: args.actorRole,
      actorRoles: args.actorRoles,
      actorWorkosUserId: args.actorWorkosUserId,
      brokerageId: args.brokerageId,
      command: args.command,
      entityId: args.entityId,
      entityType: args.entityType,
      eventType: args.eventType,
      lenderOrganizationId: args.lenderOrganizationId,
      ...(args.newState ? { newState: args.newState } : {}),
      organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      ...(args.priorState ? { priorState: args.priorState } : {}),
      ...(args.reason ? { reason: args.reason } : {}),
      reconciliationKey: args.reconciliationKey,
      warnings: args.warnings,
      createdAt: Date.now(),
    });
  })
  .internal();

export async function resolveUserManagementTargetScope(
  ctx: ScopedUserManagementActionCtx,
  target: {
    membershipId?: string;
    organizationId?: string;
  }
): Promise<WorkosManagementCommandContext> {
  return await ctx.runQuery(
    internal.workosManagement.resolveWorkosManagementCommandContext,
    target
  );
}
