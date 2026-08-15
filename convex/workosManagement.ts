import { WorkOS } from "@workos-inc/node";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import {
  type AuthorizedViewer,
  backofficeRoleSlugs,
  adminAction,
  normalizeRoleSlug,
  userManagementWriteAction,
  userManagementWriteQuery,
} from "./authz";
import {
  pendingBuilderStaffMembershipId,
  pendingBuilderStaffWorkosUserId,
} from "./builderStaffIdentity";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "./fairLendConfig";
import {
  LENDER_ROLE_SLUGS,
  type LenderRoleSlug as AppLenderRoleSlug,
} from "./lenderOrganizationAccess";
import { internalQuery, publicAction, publicMutation } from "./fluent";

const acceptedReturn = v.object({
  adapter: v.union(v.literal("fake"), v.literal("workos")),
  operation: v.string(),
  status: v.literal("accepted"),
  sync: v.literal("waiting-for-webhook"),
  workosId: v.optional(v.string()),
});

const transferRequiredReturn = v.object({
  membershipId: v.optional(v.string()),
  operation: v.string(),
  organizationId: v.string(),
  reason: v.literal("principal-broker-transfer-required"),
  status: v.literal("transfer-required"),
  sync: v.literal("not-started"),
});

const membershipCommandReturn = v.union(acceptedReturn, transferRequiredReturn);

const sharedLenderRoleValidator = v.union(
  v.literal("lender"),
  v.literal("lender-admin"),
  v.literal("lender-staff")
);

const sharedLenderMembershipTargetReturn = v.object({
  brokerageId: v.id("brokerages"),
  lenderOrganizationId: v.id("lenderOrganizations"),
  membershipId: v.string(),
  roleSlugs: v.array(v.string()),
  workosUserId: v.string(),
});

const principalBrokerTransferReturn = v.union(
  v.object({
    adapter: v.union(v.literal("fake"), v.literal("workos")),
    commandId: v.id("workosManagementOperations"),
    operation: v.literal("transferPrincipalBroker"),
    sourceMembershipId: v.string(),
    status: v.literal("accepted"),
    sync: v.literal("waiting-for-webhook"),
    targetMembershipId: v.string(),
  }),
  v.object({
    commandId: v.id("workosManagementOperations"),
    idempotencyKey: v.string(),
    operation: v.literal("transferPrincipalBroker"),
    status: v.literal("transfer-in-progress"),
    sync: v.literal("not-started"),
  }),
  v.object({
    adapter: v.union(v.literal("fake"), v.literal("workos")),
    commandId: v.id("workosManagementOperations"),
    operation: v.literal("transferPrincipalBroker"),
    recovery: v.literal("retry-same-command"),
    stage: v.union(v.literal("target-promotion"), v.literal("source-demotion")),
    status: v.literal("recoverable-failure"),
    sync: v.union(v.literal("not-started"), v.literal("waiting-for-webhook")),
  })
);

const builderStaffProvisionReturn = v.object({
  adapter: v.union(v.literal("fake"), v.literal("workos")),
  invitationId: v.optional(v.string()),
  membershipId: v.string(),
  operation: v.literal("provisionBuilderStaffUser"),
  status: v.literal("accepted"),
  sync: v.literal("waiting-for-webhook"),
  userId: v.string(),
});

const syncReturn = v.object({
  adapter: v.union(v.literal("fake"), v.literal("workos")),
  counts: v.object({
    memberships: v.number(),
    organizationRoles: v.number(),
    organizations: v.number(),
    permissions: v.number(),
    roles: v.number(),
    users: v.number(),
  }),
  operation: v.literal("syncWorkosDirectory"),
  status: v.literal("synced"),
});

const USER_ALREADY_MEMBER_PATTERN =
  /user already a member of (?:the )?organization/i;
const EMAIL_ALREADY_INVITED_PATTERN =
  /email already invited to (?:the )?organization/i;

interface AcceptedResult {
  adapter: "fake" | "workos";
  operation: string;
  status: "accepted";
  sync: "waiting-for-webhook";
  workosId?: string;
}

interface MembershipRoleUpdateResult {
  accepted: AcceptedResult;
  membership: WorkosEntity;
}

interface WorkosManagementCommandContext {
  activePrincipalBrokerMembershipIds: string[];
  actorRole: "admin" | "principle-broker";
  actorRoles: string[];
  actorWorkosUserId: string;
  brokerageId: Id<"brokerages">;
  mode: "backoffice" | "lender";
  organizationId: string;
  targetMembership?: Pick<
    Doc<"workosOrganizationMemberships">,
    | "roleSlug"
    | "roleSlugs"
    | "status"
    | "workosMembershipId"
    | "workosOrganizationId"
    | "workosUserId"
  >;
}

interface BeginPrincipalBrokerTransferResult {
  commandId: Id<"workosManagementOperations">;
  idempotencyKey: string;
  sourceRoleSlugs: string[];
  status: "pending" | "target-promoted" | "accepted" | "transfer-in-progress";
  targetRoleSlugs: string[];
}

type PrincipalBrokerTransferResult =
  | {
      adapter: "fake" | "workos";
      commandId: Id<"workosManagementOperations">;
      operation: "transferPrincipalBroker";
      sourceMembershipId: string;
      status: "accepted";
      sync: "waiting-for-webhook";
      targetMembershipId: string;
    }
  | {
      commandId: Id<"workosManagementOperations">;
      idempotencyKey: string;
      operation: "transferPrincipalBroker";
      status: "transfer-in-progress";
      sync: "not-started";
    }
  | {
      adapter: "fake" | "workos";
      commandId: Id<"workosManagementOperations">;
      operation: "transferPrincipalBroker";
      recovery: "retry-same-command";
      stage: "target-promotion" | "source-demotion";
      status: "recoverable-failure";
      sync: "not-started" | "waiting-for-webhook";
    };

interface BuilderStaffProvisionResult {
  adapter: "fake" | "workos";
  invitationId?: string;
  membershipId: string;
  operation: "provisionBuilderStaffUser";
  status: "accepted";
  sync: "waiting-for-webhook";
  userId: string;
}

interface WorkosProvisionUser {
  email: string;
  id: string;
}

interface WorkosProvisionInvitation {
  createdAt?: string;
  id: string;
  state?: string;
  updatedAt?: string;
}

type WorkosProvisionMembershipStatus = "active" | "inactive" | "pending";

interface WorkosProvisionMembership {
  id: string;
  role?: { slug?: unknown };
  roles?: Array<{ slug?: unknown }>;
  status?: WorkosProvisionMembershipStatus;
}

interface WorkosProvisionClient {
  userManagement: {
    createOrganizationMembership(args: {
      organizationId: string;
      roleSlugs: string[];
      userId: string;
    }): Promise<WorkosProvisionMembership>;
    createUser(args: {
      email: string;
      emailVerified: boolean;
    }): Promise<WorkosProvisionUser>;
    listInvitations(args: { email: string; organizationId: string }): Promise<{
      autoPagination(): Promise<WorkosProvisionInvitation[]>;
    }>;
    listOrganizationMemberships(args: {
      organizationId: string;
      statuses: WorkosProvisionMembershipStatus[];
      userId: string;
    }): Promise<{
      autoPagination(): Promise<WorkosProvisionMembership[]>;
    }>;
    listUsers(args: { email: string }): Promise<{
      autoPagination(): Promise<WorkosProvisionUser[]>;
    }>;
    reactivateOrganizationMembership(
      membershipId: string
    ): Promise<WorkosProvisionMembership>;
    resendInvitation(
      invitationId: string,
      options?: Record<string, never>
    ): Promise<WorkosProvisionInvitation>;
    sendInvitation(args: {
      email: string;
      organizationId: string;
      roleSlug: "builder-staff";
    }): Promise<WorkosProvisionInvitation>;
    updateOrganizationMembership(
      membershipId: string,
      args: { roleSlugs: string[] }
    ): Promise<WorkosProvisionMembership>;
  };
}

interface WorkosEntity {
  id?: string;
  slug?: string;
  [key: string]: unknown;
}

interface SyncSnapshot {
  memberships: WorkosEntity[];
  organizationRoles: WorkosEntity[];
  organizations: WorkosEntity[];
  permissions: WorkosEntity[];
  roles: WorkosEntity[];
  users: WorkosEntity[];
}

interface SyncResult {
  adapter: "fake" | "workos";
  counts: {
    memberships: number;
    organizationRoles: number;
    organizations: number;
    permissions: number;
    roles: number;
    users: number;
  };
  operation: "syncWorkosDirectory";
  status: "synced";
}

type ScopedUserManagementActionCtx = ActionCtx & {
  viewer: {
    actorKind?: string;
    organizationId?: string;
    roles: string[];
    subject: string;
  };
};

const commandContextReturn = v.object({
  activePrincipalBrokerMembershipIds: v.array(v.string()),
  actorRole: v.union(v.literal("admin"), v.literal("principle-broker")),
  actorRoles: v.array(v.string()),
  actorWorkosUserId: v.string(),
  brokerageId: v.id("brokerages"),
  mode: v.union(v.literal("backoffice"), v.literal("lender")),
  organizationId: v.string(),
  targetMembership: v.optional(
    v.object({
      roleSlug: v.optional(v.string()),
      roleSlugs: v.array(v.string()),
      status: v.union(
        v.literal("active"),
        v.literal("inactive"),
        v.literal("pending"),
        v.literal("deleted")
      ),
      workosMembershipId: v.string(),
      workosOrganizationId: v.string(),
      workosUserId: v.string(),
    })
  ),
});

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

async function resolveUserManagementTargetScope(
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

export const inviteUser = userManagementWriteAction
  .input({
    email: v.string(),
    organizationId: v.string(),
    roleSlug: v.string(),
  })
  .returns(membershipCommandReturn)
  .handler(async (ctx, args) => {
    const context = await resolveUserManagementTargetScope(ctx, {
      organizationId: args.organizationId,
    });
    const [roleSlug] = assertManagementRoleSlugs(context, [args.roleSlug]);
    if (!roleSlug) {
      throw new Error("WorkOS role slug is required");
    }
    if (
      roleSlug === "principle-broker" &&
      !canAssignInitialPrincipalBroker(context)
    ) {
      return transferRequired(context, "inviteUser");
    }
    const adapter = getWorkosManagementAdapter();
    try {
      const result = await adapter.inviteUser({ ...args, roleSlug });
      await auditWorkosCommand(ctx, context, {
        command: "inviteUser",
        entityId: result.workosId ?? args.email.trim().toLowerCase(),
        entityType: "workosInvitation",
        eventType: "workos.membership.invitation.accepted",
        newState: { email: args.email.trim().toLowerCase(), roleSlug },
        warnings: ["pending_workos_projection_reconciliation"],
      });
      return result;
    } catch (error) {
      await auditWorkosCommandFailure(ctx, context, {
        command: "inviteUser",
        entityId: args.email.trim().toLowerCase(),
        entityType: "workosInvitation",
        error,
      });
      throw error;
    }
  })
  .public();

/**
 * WorkOS command used by the app-owned lender control plane. Lender
 * organizations never become WorkOS organizations: every lender invitation
 * targets the shared FairLend identity container.
 */
export async function sendWorkosLenderInvitation(args: {
  email: string;
  roleSlug: AppLenderRoleSlug;
}) {
  if (!LENDER_ROLE_SLUGS.includes(args.roleSlug)) {
    throw new Error("Unsupported lender WorkOS role");
  }
  return await getWorkosManagementAdapter().inviteUser({
    email: args.email,
    organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
    roleSlug: args.roleSlug,
  });
}

export const inviteBuilderStaffUser = publicAction
  .input({
    email: v.string(),
    organizationId: v.string(),
  })
  .returns(acceptedReturn)
  .handler((_ctx, args) =>
    getWorkosManagementAdapter().inviteUser({
      email: args.email,
      organizationId: args.organizationId,
      roleSlug: "builder-staff",
    })
  )
  .internal();

/**
 * Send the builder-owner invitation used by the canonical brokerage
 * provisioning flow. This is deliberately internal so the lender organization
 * management API cannot assign non-lender roles.
 */
export const inviteBuilderUser = publicAction
  .input({
    email: v.string(),
    organizationId: v.string(),
  })
  .returns(acceptedReturn)
  .handler((_ctx, args) =>
    getWorkosManagementAdapter().inviteUser({
      email: args.email,
      organizationId: args.organizationId,
      roleSlug: "builder",
    })
  )
  .internal();

/**
 * Send a WorkOS organization invitation with the `contractor` role for an
 * invited contractor claim (PRD §7.3, §7.5, §11.3). WorkOS owns the
 * organization membership and role projection; DrawFlow stores only app-level
 * claim intent elsewhere. Fake-backed in tests, live-backed in production.
 */
export const inviteContractorUser = publicAction
  .input({
    email: v.string(),
    organizationId: v.string(),
  })
  .returns(acceptedReturn)
  .handler((_ctx, args) =>
    getWorkosManagementAdapter().inviteUser({
      email: args.email,
      organizationId: args.organizationId,
      roleSlug: "contractor",
    })
  )
  .internal();

export const provisionBuilderStaffUser = publicAction
  .input({
    email: v.string(),
    organizationId: v.string(),
  })
  .returns(builderStaffProvisionReturn)
  .handler((_ctx, args) =>
    getWorkosManagementAdapter().provisionBuilderStaffUser(args)
  )
  .internal();

export const updateMembershipRole = userManagementWriteAction
  .input({
    membershipId: v.string(),
    roleSlug: v.string(),
  })
  .returns(membershipCommandReturn)
  .handler(async (ctx, args) => {
    const context = await resolveUserManagementTargetScope(ctx, {
      membershipId: args.membershipId,
    });
    const [roleSlug] = assertManagementRoleSlugs(context, [args.roleSlug]);
    if (!roleSlug) {
      throw new Error("WorkOS role slug is required");
    }
    if (roleChangeRequiresProtectedTransfer(context, [roleSlug])) {
      return transferRequired(
        context,
        "updateMembershipRole",
        args.membershipId
      );
    }
    const adapter = getWorkosManagementAdapter();
    try {
      const update = await adapter.updateMembershipRole({
        ...args,
        roleSlug,
      });
      await auditMembershipCommandAccepted(ctx, context, {
        command: "updateMembershipRole",
        membershipId: args.membershipId,
        newState: { roleSlugs: [roleSlug], status: "active" },
      });
      return update.accepted;
    } catch (error) {
      await auditMembershipCommandFailure(ctx, context, {
        command: "updateMembershipRole",
        error,
        membershipId: args.membershipId,
      });
      throw error;
    }
  })
  .public();

export const updateMembershipRoles = userManagementWriteAction
  .input({
    membershipId: v.string(),
    primaryRoleSlug: v.optional(v.string()),
    roleSlugs: v.array(v.string()),
  })
  .returns(membershipCommandReturn)
  .handler(async (ctx, args) => {
    const context = await resolveUserManagementTargetScope(ctx, {
      membershipId: args.membershipId,
    });
    const roleSlugs = assertManagementRoleSlugs(context, [
      ...(args.primaryRoleSlug ? [args.primaryRoleSlug] : []),
      ...args.roleSlugs,
    ]);
    if (roleChangeRequiresProtectedTransfer(context, roleSlugs)) {
      return transferRequired(
        context,
        "updateMembershipRoles",
        args.membershipId
      );
    }
    const adapter = getWorkosManagementAdapter();
    const normalizedArgs = {
      membershipId: args.membershipId,
      primaryRoleSlug: roleSlugs[0],
      roleSlugs,
    };
    try {
      const update = await adapter.updateMembershipRoles(normalizedArgs);
      await auditMembershipCommandAccepted(ctx, context, {
        command: "updateMembershipRoles",
        membershipId: args.membershipId,
        newState: {
          roleSlugs,
          status: "active",
        },
      });
      return update.accepted;
    } catch (error) {
      await auditMembershipCommandFailure(ctx, context, {
        command: "updateMembershipRoles",
        error,
        membershipId: args.membershipId,
      });
      throw error;
    }
  })
  .public();

/**
 * WorkOS-first role command for an app-owned lender organization. Generic
 * WorkOS management commands cannot be used here because the shared identity
 * organization is intentionally not mapped one-to-one to a Brokerage.
 */
export const updateSharedLenderMembershipRoles = adminAction
  .input({
    lenderOrganizationId: v.id("lenderOrganizations"),
    membershipId: v.string(),
    reason: v.string(),
    roleSlug: sharedLenderRoleValidator,
  })
  .returns(acceptedReturn)
  .handler(async (ctx, args) => {
    const target = await ctx.runQuery(
      internal.workosManagement.resolveSharedLenderMembershipTarget,
      {
        lenderOrganizationId: args.lenderOrganizationId,
        membershipId: args.membershipId,
      }
    );
    const reason = requireReason(args.reason, "Lender membership role change");
    const adapter = getWorkosManagementAdapter();
    try {
      const update = await adapter.updateMembershipRoles({
        membershipId: args.membershipId,
        primaryRoleSlug: args.roleSlug,
        roleSlugs: [args.roleSlug],
      });
      await ctx.runMutation(
        internal.workosManagement.recordSharedLenderMembershipAudit,
        {
          actorRole: "admin",
          actorRoles: ctx.viewer.roles,
          actorWorkosUserId: ctx.viewer.subject,
          brokerageId: target.brokerageId,
          command: "updateSharedLenderMembershipRoles",
          entityId: args.membershipId,
          entityType: "workosOrganizationMembership",
          eventType: "workos.lender_membership.role_update.accepted",
          lenderOrganizationId: target.lenderOrganizationId,
          newState: JSON.stringify({ roleSlugs: [args.roleSlug], status: "active" }),
          priorState: JSON.stringify({ roleSlugs: target.roleSlugs, status: "active" }),
          reason,
          reconciliationKey: `workos-lender-role:${args.membershipId}:${crypto.randomUUID()}`,
          warnings: ["pending_workos_projection_reconciliation"],
        }
      );
      return update.accepted;
    } catch (error) {
      throw error;
    }
  })
  .public();

/** WorkOS-first deactivation command for an app-owned lender assignment. */
export const deactivateSharedLenderMembership = adminAction
  .input({
    lenderOrganizationId: v.id("lenderOrganizations"),
    membershipId: v.string(),
    reason: v.string(),
  })
  .returns(acceptedReturn)
  .handler(async (ctx, args) => {
    const target = await ctx.runQuery(
      internal.workosManagement.resolveSharedLenderMembershipTarget,
      {
        lenderOrganizationId: args.lenderOrganizationId,
        membershipId: args.membershipId,
      }
    );
    const reason = requireReason(args.reason, "Lender membership deactivation");
    const adapter = getWorkosManagementAdapter();
    try {
      const result = await adapter.deactivateMembership({
        membershipId: args.membershipId,
      });
      await ctx.runMutation(
        internal.workosManagement.recordSharedLenderMembershipAudit,
        {
          actorRole: "admin",
          actorRoles: ctx.viewer.roles,
          actorWorkosUserId: ctx.viewer.subject,
          brokerageId: target.brokerageId,
          command: "deactivateSharedLenderMembership",
          entityId: args.membershipId,
          entityType: "workosOrganizationMembership",
          eventType: "workos.lender_membership.deactivation.accepted",
          lenderOrganizationId: target.lenderOrganizationId,
          newState: JSON.stringify({ status: "inactive" }),
          priorState: JSON.stringify({ roleSlugs: target.roleSlugs, status: "active" }),
          reason,
          reconciliationKey: `workos-lender-deactivate:${args.membershipId}:${crypto.randomUUID()}`,
          warnings: ["pending_workos_projection_reconciliation"],
        }
      );
      return result;
    } catch (error) {
      throw error;
    }
  })
  .public();

export const createMembership = userManagementWriteAction
  .input({
    organizationId: v.string(),
    primaryRoleSlug: v.optional(v.string()),
    roleSlugs: v.array(v.string()),
    userId: v.string(),
  })
  .returns(membershipCommandReturn)
  .handler(async (ctx, args) => {
    const context = await resolveUserManagementTargetScope(ctx, {
      organizationId: args.organizationId,
    });
    const roleSlugs = assertManagementRoleSlugs(context, [
      ...(args.primaryRoleSlug ? [args.primaryRoleSlug] : []),
      ...args.roleSlugs,
    ]);
    if (
      roleSlugs.includes("principle-broker") &&
      !canAssignInitialPrincipalBroker(context)
    ) {
      return transferRequired(context, "createMembership");
    }
    const adapter = getWorkosManagementAdapter();
    try {
      const result = await adapter.createMembership(args);
      await auditWorkosCommand(ctx, context, {
        command: "createMembership",
        entityId: result.workosId ?? args.userId,
        entityType: "workosOrganizationMembership",
        eventType: "workos.membership.creation.accepted",
        newState: {
          roleSlugs: orderedManagementRoleSlugs(args),
          status: "pending-reconciliation",
          userId: args.userId,
        },
        warnings: ["pending_workos_projection_reconciliation"],
      });
      return result;
    } catch (error) {
      await auditWorkosCommandFailure(ctx, context, {
        command: "createMembership",
        entityId: args.userId,
        entityType: "workosOrganizationMembership",
        error,
      });
      throw error;
    }
  })
  .public();

export const createClaimMembershipForUser = publicAction
  .input({
    organizationId: v.string(),
    primaryRoleSlug: v.optional(v.string()),
    roleSlugs: v.array(v.string()),
    userId: v.string(),
  })
  .returns(acceptedReturn)
  .handler((_ctx, args) => getWorkosManagementAdapter().createMembership(args))
  .internal();

export const removeMembership = userManagementWriteAction
  .input({
    membershipId: v.string(),
    reason: v.optional(v.string()),
  })
  .returns(membershipCommandReturn)
  .handler(async (ctx, args) => {
    const context = await resolveUserManagementTargetScope(ctx, {
      membershipId: args.membershipId,
    });
    if (principalBrokerRemovalRequiresTransfer(context)) {
      return transferRequired(context, "removeMembership", args.membershipId);
    }
    const adapter = getWorkosManagementAdapter();
    try {
      const result = await adapter.removeMembership(args);
      await auditMembershipCommandAccepted(ctx, context, {
        command: "removeMembership",
        membershipId: args.membershipId,
        newState: { status: "inactive-or-deleted" },
        reason: normalizedReason(args.reason),
      });
      return result;
    } catch (error) {
      await auditMembershipCommandFailure(ctx, context, {
        command: "removeMembership",
        error,
        membershipId: args.membershipId,
        reason: normalizedReason(args.reason),
      });
      throw error;
    }
  })
  .public();

export const deactivateMembership = userManagementWriteAction
  .input({
    membershipId: v.string(),
    reason: v.optional(v.string()),
  })
  .returns(membershipCommandReturn)
  .handler(async (ctx, args) => {
    const context = await resolveUserManagementTargetScope(ctx, {
      membershipId: args.membershipId,
    });
    if (principalBrokerRemovalRequiresTransfer(context)) {
      return transferRequired(
        context,
        "deactivateMembership",
        args.membershipId
      );
    }
    const adapter = getWorkosManagementAdapter();
    try {
      const result = await adapter.deactivateMembership(args);
      await auditMembershipCommandAccepted(ctx, context, {
        command: "deactivateMembership",
        membershipId: args.membershipId,
        newState: { status: "inactive" },
        reason: normalizedReason(args.reason),
      });
      return result;
    } catch (error) {
      await auditMembershipCommandFailure(ctx, context, {
        command: "deactivateMembership",
        error,
        membershipId: args.membershipId,
        reason: normalizedReason(args.reason),
      });
      throw error;
    }
  })
  .public();

export const reactivateMembership = userManagementWriteAction
  .input({
    membershipId: v.string(),
    reason: v.optional(v.string()),
  })
  .returns(membershipCommandReturn)
  .handler(async (ctx, args) => {
    const context = await resolveUserManagementTargetScope(ctx, {
      membershipId: args.membershipId,
    });
    if (reactivationRequiresProtectedTransfer(context)) {
      return transferRequired(
        context,
        "reactivateMembership",
        args.membershipId
      );
    }
    const adapter = getWorkosManagementAdapter();
    try {
      const result = await adapter.reactivateMembership(args);
      await auditMembershipCommandAccepted(ctx, context, {
        command: "reactivateMembership",
        membershipId: args.membershipId,
        newState: { status: "active" },
        reason: normalizedReason(args.reason),
      });
      return result;
    } catch (error) {
      await auditMembershipCommandFailure(ctx, context, {
        command: "reactivateMembership",
        error,
        membershipId: args.membershipId,
        reason: normalizedReason(args.reason),
      });
      throw error;
    }
  })
  .public();

const beginPrincipalBrokerTransferReturn = v.object({
  commandId: v.id("workosManagementOperations"),
  idempotencyKey: v.string(),
  sourceRoleSlugs: v.array(v.string()),
  status: v.union(
    v.literal("pending"),
    v.literal("target-promoted"),
    v.literal("accepted"),
    v.literal("transfer-in-progress")
  ),
  targetRoleSlugs: v.array(v.string()),
});

export const beginPrincipalBrokerTransfer = publicMutation
  .input({
    actorRoles: v.array(v.string()),
    actorWorkosUserId: v.string(),
    brokerageId: v.id("brokerages"),
    idempotencyKey: v.string(),
    organizationId: v.string(),
    reason: v.string(),
    sourceMembershipId: v.string(),
    targetMembershipId: v.string(),
  })
  .returns(beginPrincipalBrokerTransferReturn)
  .handler(async (ctx, args) => {
    const existing = await ctx.db
      .query("workosManagementOperations")
      .withIndex("by_organization_idempotency", (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq("idempotencyKey", args.idempotencyKey)
      )
      .unique();
    if (existing) {
      if (
        existing.sourceMembershipId !== args.sourceMembershipId ||
        existing.targetMembershipId !== args.targetMembershipId ||
        existing.reason !== args.reason
      ) {
        throw new Error("Idempotency key already belongs to another transfer");
      }
      if (existing.status === "failed") {
        await ctx.db.patch(existing._id, {
          failureStage: undefined,
          safeError: undefined,
          status: "pending",
          updatedAt: Date.now(),
        });
        return {
          commandId: existing._id,
          idempotencyKey: existing.idempotencyKey,
          sourceRoleSlugs: existing.sourceRoleSlugs,
          status: "pending" as const,
          targetRoleSlugs: existing.targetRoleSlugs,
        };
      }
      return {
        commandId: existing._id,
        idempotencyKey: existing.idempotencyKey,
        sourceRoleSlugs: existing.sourceRoleSlugs,
        status: existing.status,
        targetRoleSlugs: existing.targetRoleSlugs,
      };
    }

    for (const status of ["pending", "target-promoted"] as const) {
      const competing = await ctx.db
        .query("workosManagementOperations")
        .withIndex("by_organization_operation_status", (query) =>
          query
            .eq("organizationId", args.organizationId)
            .eq("operation", "principal-broker-transfer")
            .eq("status", status)
        )
        .first();
      if (competing) {
        return {
          commandId: competing._id,
          idempotencyKey: competing.idempotencyKey,
          sourceRoleSlugs: competing.sourceRoleSlugs,
          status: "transfer-in-progress" as const,
          targetRoleSlugs: competing.targetRoleSlugs,
        };
      }
    }

    const acceptedAwaitingReconciliation = await ctx.db
      .query("workosManagementOperations")
      .withIndex("by_organization_operation_status", (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq("operation", "principal-broker-transfer")
          .eq("status", "accepted")
      )
      .order("desc")
      .first();
    if (acceptedAwaitingReconciliation) {
      const activeMemberships = await listBoundedOrganizationMemberships(
        ctx,
        args.organizationId
      );
      const activePrincipals = activeMemberships.filter(
        (membership) =>
          membership.status === "active" &&
          projectedMembershipRoleSlugs(membership).includes("principle-broker")
      );
      const reconciled =
        activePrincipals.length === 1 &&
        activePrincipals[0]?.workosMembershipId ===
          acceptedAwaitingReconciliation.targetMembershipId;
      if (!reconciled) {
        return {
          commandId: acceptedAwaitingReconciliation._id,
          idempotencyKey: acceptedAwaitingReconciliation.idempotencyKey,
          sourceRoleSlugs: acceptedAwaitingReconciliation.sourceRoleSlugs,
          status: "transfer-in-progress" as const,
          targetRoleSlugs: acceptedAwaitingReconciliation.targetRoleSlugs,
        };
      }
    }

    assertDifferentTransferMemberships(args);
    const [sourceMembership, targetMembership] = await Promise.all([
      ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_workos_membership_id", (query) =>
          query.eq("workosMembershipId", args.sourceMembershipId)
        )
        .unique(),
      ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_workos_membership_id", (query) =>
          query.eq("workosMembershipId", args.targetMembershipId)
        )
        .unique(),
    ]);
    if (
      !(sourceMembership && targetMembership) ||
      sourceMembership.status !== "active" ||
      targetMembership.status !== "active" ||
      sourceMembership.workosOrganizationId !== args.organizationId ||
      targetMembership.workosOrganizationId !== args.organizationId
    ) {
      throw new Error("Forbidden: active transfer membership scope");
    }
    const activeMemberships = await listBoundedOrganizationMemberships(
      ctx,
      args.organizationId
    );
    const activePrincipals = activeMemberships.filter(
      (membership) =>
        membership.status === "active" &&
        projectedMembershipRoleSlugs(membership).includes("principle-broker")
    );
    if (
      activePrincipals.length !== 1 ||
      activePrincipals[0]?.workosMembershipId !== args.sourceMembershipId
    ) {
      throw new Error(
        "Principal Broker transfer requires exactly one active current owner"
      );
    }
    const sourceRoleSlugs = projectedMembershipRoleSlugs(
      sourceMembership
    ).filter((role) => role !== "principle-broker");
    if (sourceRoleSlugs.length === 0) {
      sourceRoleSlugs.push("admin");
    }
    const targetRoleSlugs = [
      "principle-broker",
      ...projectedMembershipRoleSlugs(targetMembership).filter(
        (role) => role !== "principle-broker"
      ),
    ];
    if (
      !targetRoleSlugs.every((role) =>
        backofficeRoleSlugs.includes(role as (typeof backofficeRoleSlugs)[number])
      )
    ) {
      throw new Error(
        "Principal Broker transfer requires a lender organization member"
      );
    }
    const now = Date.now();
    const commandId = await ctx.db.insert("workosManagementOperations", {
      actorRoles: args.actorRoles,
      actorWorkosUserId: args.actorWorkosUserId,
      brokerageId: args.brokerageId,
      createdAt: now,
      idempotencyKey: args.idempotencyKey,
      operation: "principal-broker-transfer",
      organizationId: args.organizationId,
      reason: args.reason,
      sourceMembershipId: args.sourceMembershipId,
      sourceRoleSlugs,
      status: "pending",
      targetMembershipId: args.targetMembershipId,
      targetRoleSlugs,
      updatedAt: now,
    });
    return {
      commandId,
      idempotencyKey: args.idempotencyKey,
      sourceRoleSlugs,
      status: "pending" as const,
      targetRoleSlugs,
    };
  })
  .internal();

export const updatePrincipalBrokerTransferState = publicMutation
  .input({
    commandId: v.id("workosManagementOperations"),
    failureStage: v.optional(
      v.union(v.literal("target-promotion"), v.literal("source-demotion"))
    ),
    safeError: v.optional(v.string()),
    status: v.union(
      v.literal("target-promoted"),
      v.literal("accepted"),
      v.literal("failed")
    ),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const command = await ctx.db.get(args.commandId);
    if (!command) {
      throw new Error("Principal Broker transfer command not found");
    }
    await ctx.db.patch(args.commandId, {
      failureStage: args.failureStage,
      safeError: args.safeError,
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  })
  .internal();

export const transferPrincipalBroker = userManagementWriteAction
  .input({
    idempotencyKey: v.string(),
    reason: v.string(),
    sourceMembershipId: v.string(),
    targetMembershipId: v.string(),
  })
  .returns(principalBrokerTransferReturn)
  .handler(async (ctx, args): Promise<PrincipalBrokerTransferResult> => {
    const reason = requireReason(args.reason, "Principal Broker transfer");
    const idempotencyKey = requireNonEmptyValue(
      args.idempotencyKey,
      "Principal Broker transfer idempotency key"
    );
    const context = await resolveUserManagementTargetScope(ctx, {
      membershipId: args.targetMembershipId,
    });
    const begin: BeginPrincipalBrokerTransferResult = await ctx.runMutation(
      internal.workosManagement.beginPrincipalBrokerTransfer,
      {
        actorRoles: context.actorRoles,
        actorWorkosUserId: context.actorWorkosUserId,
        brokerageId: context.brokerageId,
        idempotencyKey,
        organizationId: context.organizationId,
        reason,
        sourceMembershipId: args.sourceMembershipId,
        targetMembershipId: args.targetMembershipId,
      }
    );
    if (begin.status === "transfer-in-progress") {
      return {
        commandId: begin.commandId,
        idempotencyKey: begin.idempotencyKey,
        operation: "transferPrincipalBroker" as const,
        status: "transfer-in-progress" as const,
        sync: "not-started" as const,
      };
    }
    const adapter = getWorkosManagementAdapter();
    if (begin.status === "accepted") {
      return {
        adapter: adapter.adapter,
        commandId: begin.commandId,
        operation: "transferPrincipalBroker" as const,
        sourceMembershipId: args.sourceMembershipId,
        status: "accepted" as const,
        sync: "waiting-for-webhook" as const,
        targetMembershipId: args.targetMembershipId,
      };
    }

    if (begin.status === "pending") {
      try {
        await adapter.updateMembershipRoles({
          membershipId: args.targetMembershipId,
          primaryRoleSlug: "principle-broker",
          roleSlugs: begin.targetRoleSlugs,
        });
        await ctx.runMutation(
          internal.workosManagement.updatePrincipalBrokerTransferState,
          { commandId: begin.commandId, status: "target-promoted" }
        );
      } catch (error) {
        await markPrincipalBrokerTransferFailure(ctx, begin.commandId, {
          error,
          stage: "target-promotion",
          status: "failed",
        });
        await auditPrincipalBrokerTransfer(ctx, context, args, begin, {
          error,
          stage: "target-promotion",
          status: "recoverable-failure",
        });
        return {
          adapter: adapter.adapter,
          commandId: begin.commandId,
          operation: "transferPrincipalBroker" as const,
          recovery: "retry-same-command" as const,
          stage: "target-promotion" as const,
          status: "recoverable-failure" as const,
          sync: "not-started" as const,
        };
      }
    }

    try {
      await adapter.updateMembershipRoles({
        membershipId: args.sourceMembershipId,
        primaryRoleSlug: begin.sourceRoleSlugs[0],
        roleSlugs: begin.sourceRoleSlugs,
      });
    } catch (error) {
      await markPrincipalBrokerTransferFailure(ctx, begin.commandId, {
        error,
        stage: "source-demotion",
        status: "target-promoted",
      });
      await auditPrincipalBrokerTransfer(ctx, context, args, begin, {
        error,
        stage: "source-demotion",
        status: "recoverable-failure",
      });
      return {
        adapter: adapter.adapter,
        commandId: begin.commandId,
        operation: "transferPrincipalBroker" as const,
        recovery: "retry-same-command" as const,
        stage: "source-demotion" as const,
        status: "recoverable-failure" as const,
        sync: "waiting-for-webhook" as const,
      };
    }

    await ctx.runMutation(
      internal.workosManagement.updatePrincipalBrokerTransferState,
      { commandId: begin.commandId, status: "accepted" }
    );
    await auditPrincipalBrokerTransfer(ctx, context, args, begin, {
      status: "accepted",
    });
    return {
      adapter: adapter.adapter,
      commandId: begin.commandId,
      operation: "transferPrincipalBroker" as const,
      sourceMembershipId: args.sourceMembershipId,
      status: "accepted" as const,
      sync: "waiting-for-webhook" as const,
      targetMembershipId: args.targetMembershipId,
    };
  })
  .public();

export const syncWorkosDirectory = adminAction
  .returns(syncReturn)
  .handler(async (ctx): Promise<SyncResult> => {
    const adapter = getWorkosManagementAdapter();
    const snapshot = await adapter.syncDirectory();
    const syncRunId = crypto.randomUUID();

    for (const organization of snapshot.organizations) {
      await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
        ...eventForSync(
          "organization.created",
          entityIdentifier(organization),
          organization,
          syncRunId
        ),
      });
    }

    for (const user of snapshot.users) {
      await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
        ...eventForSync(
          "user.created",
          entityIdentifier(user),
          user,
          syncRunId
        ),
      });
    }

    for (const membership of snapshot.memberships) {
      await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
        ...eventForSync(
          "organization_membership.created",
          entityIdentifier(membership),
          membership,
          syncRunId
        ),
      });
    }

    for (const role of snapshot.organizationRoles) {
      await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
        ...eventForSync(
          "organization_role.created",
          entityIdentifier(role),
          role,
          syncRunId
        ),
      });
    }

    for (const role of snapshot.roles) {
      await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
        ...eventForSync(
          "role.created",
          entityIdentifier(role),
          role,
          syncRunId
        ),
      });
    }

    for (const permission of snapshot.permissions) {
      await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
        ...eventForSync(
          "permission.created",
          entityIdentifier(permission),
          permission,
          syncRunId
        ),
      });
    }

    return {
      adapter: adapter.adapter,
      counts: {
        memberships: snapshot.memberships.length,
        organizationRoles: snapshot.organizationRoles.length,
        organizations: snapshot.organizations.length,
        permissions: snapshot.permissions.length,
        roles: snapshot.roles.length,
        users: snapshot.users.length,
      },
      operation: "syncWorkosDirectory",
      status: "synced",
    };
  })
  .public();

function getWorkosManagementAdapter() {
  if (
    process.env.VITEST ||
    process.env.NODE_ENV === "test" ||
    process.env.WORKOS_MANAGEMENT_ADAPTER === "fake"
  ) {
    return fakeAdapter;
  }

  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) {
    throw new Error("WORKOS_API_KEY is required for WorkOS management writes");
  }

  return liveAdapter(new WorkOS(apiKey));
}

let fakeTransferFailureStage: "target-promotion" | "source-demotion" | null =
  null;
let fakeTransferUpdateCount = 0;

export function configureFakePrincipalBrokerTransferFailureForTest(
  stage: "target-promotion" | "source-demotion" | null
) {
  if (!(process.env.VITEST || process.env.NODE_ENV === "test")) {
    throw new Error("Fake WorkOS failure controls are test-only");
  }
  fakeTransferFailureStage = stage;
  fakeTransferUpdateCount = 0;
}

const fakeAdapter = {
  adapter: "fake" as const,
  provisionBuilderStaffUser(args: {
    email: string;
    organizationId: string;
  }): Promise<BuilderStaffProvisionResult> {
    const email = normalizeWorkosEmail(args.email);
    const userId = `fake_user_builder_staff_${workosIdSlug(email)}`;
    return Promise.resolve({
      adapter: "fake",
      invitationId: `fake_invite_${email}`,
      membershipId: `fake_membership_${args.organizationId}_${userId}`,
      operation: "provisionBuilderStaffUser",
      status: "accepted",
      sync: "waiting-for-webhook",
      userId,
    });
  },
  inviteUser(args: {
    email: string;
    organizationId: string;
    roleSlug: string;
  }): Promise<AcceptedResult> {
    normalizeWorkosRoleSlug(args.roleSlug);
    return Promise.resolve({
      adapter: "fake",
      operation: "inviteUser",
      status: "accepted",
      sync: "waiting-for-webhook",
      workosId: `fake_invite_${args.email}`,
    });
  },
  updateMembershipRole(args: {
    membershipId: string;
    roleSlug: string;
  }): Promise<MembershipRoleUpdateResult> {
    const roleSlug = normalizeWorkosRoleSlug(args.roleSlug);
    return Promise.resolve(
      membershipRoleUpdateResult(
        accepted("fake", "updateMembershipRole", args.membershipId),
        args.membershipId,
        [roleSlug]
      )
    );
  },
  updateMembershipRoles(args: {
    membershipId: string;
    primaryRoleSlug?: string;
    roleSlugs: string[];
  }): Promise<MembershipRoleUpdateResult> {
    fakeTransferUpdateCount += 1;
    if (
      (fakeTransferFailureStage === "target-promotion" &&
        fakeTransferUpdateCount === 1) ||
      (fakeTransferFailureStage === "source-demotion" &&
        fakeTransferUpdateCount === 2)
    ) {
      throw new Error(`Fake WorkOS ${fakeTransferFailureStage} failure`);
    }
    const rolesPayload = buildWorkosMembershipRolesPayload(args);
    const roleSlugs =
      "roleSlugs" in rolesPayload
        ? rolesPayload.roleSlugs
        : [rolesPayload.roleSlug];
    return Promise.resolve(
      membershipRoleUpdateResult(
        accepted("fake", "updateMembershipRoles", args.membershipId),
        args.membershipId,
        roleSlugs
      )
    );
  },
  createMembership(args: {
    organizationId: string;
    primaryRoleSlug?: string;
    roleSlugs: string[];
    userId: string;
  }): Promise<AcceptedResult> {
    buildWorkosMembershipRolesPayload(args);
    return Promise.resolve(
      accepted(
        "fake",
        "createMembership",
        `fake_membership_${args.organizationId}_${args.userId}`
      )
    );
  },
  removeMembership(args: { membershipId: string }): Promise<AcceptedResult> {
    return Promise.resolve(
      accepted("fake", "removeMembership", args.membershipId)
    );
  },
  deactivateMembership(args: {
    membershipId: string;
  }): Promise<AcceptedResult> {
    return Promise.resolve(
      accepted("fake", "deactivateMembership", args.membershipId)
    );
  },
  reactivateMembership(args: {
    membershipId: string;
  }): Promise<AcceptedResult> {
    return Promise.resolve(
      accepted("fake", "reactivateMembership", args.membershipId)
    );
  },
  syncDirectory(): Promise<SyncSnapshot> {
    return Promise.resolve({
      memberships: [
        {
          id: "om_fixture",
          organizationId: "org_fixture",
          status: "active",
          userId: "user_admin",
          directoryManaged: false,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
          role: { slug: "admin" },
          roles: [{ slug: "admin" }],
        },
      ],
      organizationRoles: [
        {
          id: "role_admin",
          organizationId: "org_fixture",
          slug: "admin",
          name: "Admin",
          description: "Administrator role",
          resourceTypeSlug: "organization",
          permissions: ["widgets:users-table:manage"],
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      organizations: [
        {
          id: "org_fixture",
          name: "FairLend",
          domains: [],
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      permissions: [
        {
          id: "perm_users_table_manage",
          slug: "widgets:users-table:manage",
          name: "Manage users table",
          description: "Allows managing WorkOS user table data",
          system: false,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      roles: [
        {
          id: "role_environment_admin",
          slug: "admin",
          name: "Admin",
          description: "Environment administrator role",
          resourceTypeSlug: "organization",
          permissions: ["widgets:users-table:manage"],
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
        {
          id: "role_environment_builder",
          slug: "builder",
          name: "Builder",
          description: "Builder role",
          resourceTypeSlug: "organization",
          permissions: [],
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      users: [
        {
          id: "user_admin",
          email: "admin@example.com",
          firstName: "Admin",
          lastName: "User",
          emailVerified: true,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
        {
          id: "user_unassigned",
          email: "unassigned@example.com",
          firstName: "Unassigned",
          lastName: "User",
          emailVerified: true,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });
  },
};

function liveAdapter(workos: WorkOS) {
  return {
    adapter: "workos" as const,
    async provisionBuilderStaffUser(args: {
      email: string;
      organizationId: string;
    }): Promise<BuilderStaffProvisionResult> {
      return await provisionBuilderStaffUserWithWorkos(workos, args);
    },
    async inviteUser(args: {
      email: string;
      organizationId: string;
      roleSlug: string;
    }): Promise<AcceptedResult> {
      const roleSlug = normalizeWorkosRoleSlug(args.roleSlug);
      requireNonEmptyRoleSlug(roleSlug);
      const result = await workos.userManagement.sendInvitation({
        email: args.email,
        organizationId: args.organizationId,
        roleSlug,
      });
      return accepted("workos", "inviteUser", result.id);
    },
    async updateMembershipRole(args: {
      membershipId: string;
      roleSlug: string;
    }): Promise<MembershipRoleUpdateResult> {
      const roleSlug = normalizeWorkosRoleSlug(args.roleSlug);
      requireNonEmptyRoleSlug(roleSlug);
      const membership =
        await workos.userManagement.updateOrganizationMembership(
          args.membershipId,
          {
            roleSlug,
          }
        );
      return {
        accepted: accepted("workos", "updateMembershipRole", args.membershipId),
        membership: toWorkosEntity(membership),
      };
    },
    async updateMembershipRoles(args: {
      membershipId: string;
      primaryRoleSlug?: string;
      roleSlugs: string[];
    }): Promise<MembershipRoleUpdateResult> {
      const rolesPayload = buildWorkosMembershipRolesPayload(args);
      const membership =
        await workos.userManagement.updateOrganizationMembership(
          args.membershipId,
          rolesPayload
        );
      return {
        accepted: accepted(
          "workos",
          "updateMembershipRoles",
          args.membershipId
        ),
        membership: toWorkosEntity(membership),
      };
    },
    async createMembership(args: {
      organizationId: string;
      primaryRoleSlug?: string;
      roleSlugs: string[];
      userId: string;
    }): Promise<AcceptedResult> {
      const rolesPayload = buildWorkosMembershipRolesPayload(args);
      const existingMemberships = await (
        await workos.userManagement.listOrganizationMemberships({
          organizationId: args.organizationId,
          statuses: ["active", "inactive", "pending"],
          userId: args.userId,
        })
      ).autoPagination();
      const existing = existingMemberships[0];
      if (existing) {
        if (existing.status === "inactive") {
          await workos.userManagement.reactivateOrganizationMembership(
            existing.id
          );
        }
        await workos.userManagement.updateOrganizationMembership(existing.id, {
          ...rolesPayload,
        });
        return accepted("workos", "createMembership", existing.id);
      }
      const membership =
        await workos.userManagement.createOrganizationMembership({
          organizationId: args.organizationId,
          ...rolesPayload,
          userId: args.userId,
        });
      return accepted("workos", "createMembership", membership.id);
    },
    async removeMembership(args: {
      membershipId: string;
    }): Promise<AcceptedResult> {
      const membership = await workos.userManagement.getOrganizationMembership(
        args.membershipId
      );
      if (membership.status === "pending") {
        await workos.userManagement.deleteOrganizationMembership(
          args.membershipId
        );
      } else if (membership.status === "active") {
        await workos.userManagement.deactivateOrganizationMembership(
          args.membershipId
        );
      }
      return accepted("workos", "removeMembership", args.membershipId);
    },
    async deactivateMembership(args: {
      membershipId: string;
    }): Promise<AcceptedResult> {
      await workos.userManagement.deactivateOrganizationMembership(
        args.membershipId
      );
      return accepted("workos", "deactivateMembership", args.membershipId);
    },
    async reactivateMembership(args: {
      membershipId: string;
    }): Promise<AcceptedResult> {
      await workos.userManagement.reactivateOrganizationMembership(
        args.membershipId
      );
      return accepted("workos", "reactivateMembership", args.membershipId);
    },
    async syncDirectory(): Promise<SyncSnapshot> {
      const organizations = await (
        await workos.organizations.listOrganizations()
      ).autoPagination();
      const permissions = await (
        await workos.authorization.listPermissions()
      ).autoPagination();
      const users = await (
        await workos.userManagement.listUsers()
      ).autoPagination();
      const roles = (
        await workos.authorization.listEnvironmentRoles()
      ).data.map(toWorkosEntity);

      const memberships: WorkosEntity[] = [];
      const organizationRoles: WorkosEntity[] = [];
      const usersById = new Map<string, WorkosEntity>(
        users.map((user) => [user.id, toWorkosEntity(user)])
      );

      for (const organization of organizations) {
        const organizationMemberships = await (
          await workos.userManagement.listOrganizationMemberships({
            organizationId: organization.id,
            statuses: ["active", "inactive", "pending"],
          })
        ).autoPagination();
        memberships.push(...organizationMemberships.map(toWorkosEntity));

        for (const membership of organizationMemberships) {
          if (!usersById.has(membership.userId)) {
            usersById.set(
              membership.userId,
              toWorkosEntity(
                await workos.userManagement.getUser(membership.userId)
              )
            );
          }
        }

        const roles = await workos.authorization.listOrganizationRoles(
          organization.id
        );
        organizationRoles.push(
          ...roles.data.map((role) =>
            toWorkosEntity({
              ...role,
              organizationId: organization.id,
            })
          )
        );
      }

      return {
        memberships,
        organizationRoles,
        organizations: organizations.map(toWorkosEntity),
        permissions: permissions.map(toWorkosEntity),
        roles,
        users: [...usersById.values()],
      };
    },
  };
}

export async function provisionBuilderStaffUserWithWorkos(
  workos: WorkosProvisionClient,
  args: {
    email: string;
    organizationId: string;
  }
): Promise<BuilderStaffProvisionResult> {
  const email = normalizeWorkosEmail(args.email);
  const roleSlug = "builder-staff";
  const invitationId = await sendOrResendBuilderStaffInvitation(workos, {
    email,
    organizationId: args.organizationId,
    roleSlug,
  });
  try {
    const user = await findOrCreateWorkosUser(workos, email);
    const membership = await ensureWorkosMembershipRole(workos, {
      organizationId: args.organizationId,
      roleSlug,
      userId: user.id,
    });

    return {
      adapter: "workos",
      ...(invitationId ? { invitationId } : {}),
      membershipId: membership.id,
      operation: "provisionBuilderStaffUser",
      status: "accepted",
      sync: "waiting-for-webhook",
      userId: user.id,
    };
  } catch (error) {
    if (!invitationId) {
      throw error;
    }
    return {
      adapter: "workos",
      invitationId,
      membershipId: pendingBuilderStaffMembershipId(invitationId),
      operation: "provisionBuilderStaffUser",
      status: "accepted",
      sync: "waiting-for-webhook",
      userId: pendingBuilderStaffWorkosUserId(email),
    };
  }
}

async function findOrCreateWorkosUser(
  workos: WorkosProvisionClient,
  email: string
) {
  const existingUser = await findWorkosUserByEmail(workos, email);
  if (existingUser) {
    return existingUser;
  }
  try {
    return await workos.userManagement.createUser({
      email,
      emailVerified: false,
    });
  } catch (error) {
    if (isWorkosConflict(error)) {
      const racedUser = await findWorkosUserByEmail(workos, email);
      if (racedUser) {
        return racedUser;
      }
    }
    throw error;
  }
}

async function findWorkosUserByEmail(
  workos: WorkosProvisionClient,
  email: string
) {
  const existingUsers = await (
    await workos.userManagement.listUsers({ email })
  ).autoPagination();
  return (
    existingUsers.find((user) => user.email.trim().toLowerCase() === email) ??
    null
  );
}

async function ensureWorkosMembershipRole(
  workos: WorkosProvisionClient,
  args: {
    organizationId: string;
    roleSlug: "builder-staff";
    userId: string;
  }
) {
  const existingMemberships = await (
    await workos.userManagement.listOrganizationMemberships({
      organizationId: args.organizationId,
      statuses: ["active", "inactive", "pending"],
      userId: args.userId,
    })
  ).autoPagination();
  const existing = existingMemberships[0];
  if (!existing) {
    return await workos.userManagement.createOrganizationMembership({
      organizationId: args.organizationId,
      roleSlugs: [args.roleSlug],
      userId: args.userId,
    });
  }

  if (existing.status === "inactive") {
    await workos.userManagement.reactivateOrganizationMembership(existing.id);
  }

  const roleSlugs = [
    ...new Set([...workosMembershipRoleSlugs(existing), args.roleSlug]),
  ];
  return await workos.userManagement.updateOrganizationMembership(existing.id, {
    roleSlugs,
  });
}

async function sendOrResendBuilderStaffInvitation(
  workos: WorkosProvisionClient,
  args: {
    email: string;
    organizationId: string;
    roleSlug: "builder-staff";
  }
) {
  try {
    const invitation = await workos.userManagement.sendInvitation(args);
    return invitation.id;
  } catch (error) {
    if (isWorkosConflict(error)) {
      return await resendLatestPendingBuilderStaffInvitation(workos, args);
    }
    throw error;
  }
}

async function resendLatestPendingBuilderStaffInvitation(
  workos: WorkosProvisionClient,
  args: {
    email: string;
    organizationId: string;
  }
) {
  const invitations = await (
    await workos.userManagement.listInvitations({
      email: args.email,
      organizationId: args.organizationId,
    })
  ).autoPagination();
  const pending = invitations
    .filter((invitation) => invitation.state === "pending")
    .sort(
      (left, right) =>
        workosTimestamp(right.updatedAt ?? right.createdAt) -
        workosTimestamp(left.updatedAt ?? left.createdAt)
    );
  const latest = pending[0];
  if (!latest) {
    return;
  }
  const invitation = await workos.userManagement.resendInvitation(latest.id);
  return invitation.id || latest.id;
}

function toWorkosEntity(value: unknown): WorkosEntity {
  return JSON.parse(JSON.stringify(value)) as WorkosEntity;
}

function membershipRoleUpdateResult(
  acceptedResult: AcceptedResult,
  membershipId: string,
  roleSlugs: string[]
): MembershipRoleUpdateResult {
  return {
    accepted: acceptedResult,
    membership: {
      id: membershipId,
      role: { slug: roleSlugs[0] },
      roles: roleSlugs.map((slug) => ({ slug })),
      status: "active",
    },
  };
}

function projectedMembershipRoleSlugs(
  membership: Pick<
    Doc<"workosOrganizationMemberships">,
    "roleSlug" | "roleSlugs"
  >
) {
  return normalizeWorkosRoleSlugs([
    ...(membership.roleSlug ? [membership.roleSlug] : []),
    ...membership.roleSlugs,
  ]);
}

async function listBoundedOrganizationMemberships(
  ctx: Pick<MutationCtx, "db">,
  organizationId: string
) {
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_organization", (query) =>
      query.eq("workosOrganizationId", organizationId)
    )
    .take(501);
  if (memberships.length > 500) {
    throw new Error("Forbidden: organization membership limit exceeded");
  }
  return memberships;
}

function assertDifferentTransferMemberships(args: {
  sourceMembershipId: string;
  targetMembershipId: string;
}) {
  if (args.sourceMembershipId === args.targetMembershipId) {
    throw new Error("Principal Broker transfer requires a different member");
  }
}

function assertManagementRoleSlugs(
  context: WorkosManagementCommandContext,
  roleSlugs: string[]
) {
  if (context.mode === "lender") {
    const canonical = roleSlugs.map((role) => role.trim().toLowerCase());
    if (
      canonical.length === 0 ||
      canonical.some(
        (role) => !LENDER_ROLE_SLUGS.includes(role as AppLenderRoleSlug)
      )
    ) {
      throw new Error("Unsupported lender organization role");
    }
    return [...new Set(canonical)];
  }
  const normalized = normalizeWorkosRoleSlugs(roleSlugs);
  if (normalized.length === 0) {
    throw new Error("At least one WorkOS role slug is required");
  }
  return normalized;
}

function canAssignInitialPrincipalBroker(
  context: WorkosManagementCommandContext
) {
  return (
    context.mode === "backoffice" &&
    context.activePrincipalBrokerMembershipIds.length === 0
  );
}

function roleChangeRequiresProtectedTransfer(
  context: WorkosManagementCommandContext,
  requestedRoleSlugs: string[]
) {
  const membershipId = context.targetMembership?.workosMembershipId;
  if (!membershipId) {
    throw new Error("WorkOS membership target is required");
  }
  const targetIsPrincipal =
    context.activePrincipalBrokerMembershipIds.includes(membershipId);
  const requestsPrincipal = requestedRoleSlugs.includes("principle-broker");
  if (targetIsPrincipal) {
    return (
      !requestsPrincipal ||
      context.activePrincipalBrokerMembershipIds.length !== 1
    );
  }
  return requestsPrincipal && !canAssignInitialPrincipalBroker(context);
}

function principalBrokerRemovalRequiresTransfer(
  context: WorkosManagementCommandContext
) {
  const membershipId = context.targetMembership?.workosMembershipId;
  return (
    membershipId !== undefined &&
    context.activePrincipalBrokerMembershipIds.includes(membershipId)
  );
}

function reactivationRequiresProtectedTransfer(
  context: WorkosManagementCommandContext
) {
  const targetRoles = context.targetMembership
    ? projectedMembershipRoleSlugs(context.targetMembership)
    : [];
  return (
    targetRoles.includes("principle-broker") &&
    !canAssignInitialPrincipalBroker(context)
  );
}

function transferRequired(
  context: WorkosManagementCommandContext,
  operation: string,
  membershipId?: string
) {
  return {
    ...(membershipId ? { membershipId } : {}),
    operation,
    organizationId: context.organizationId,
    reason: "principal-broker-transfer-required" as const,
    status: "transfer-required" as const,
    sync: "not-started" as const,
  };
}

function orderedManagementRoleSlugs(args: {
  primaryRoleSlug?: string;
  roleSlugs: string[];
}) {
  const payload = buildWorkosMembershipRolesPayload(args);
  return "roleSlugs" in payload ? payload.roleSlugs : [payload.roleSlug];
}

function normalizedReason(reason: string | undefined) {
  const normalized = reason?.trim();
  return normalized || undefined;
}

function requireReason(reason: string, label: string) {
  const normalized = reason.trim();
  if (!normalized) {
    throw new Error(`${label} reason is required`);
  }
  return normalized;
}

function requireNonEmptyValue(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

async function auditWorkosCommand(
  ctx: ScopedUserManagementActionCtx,
  context: WorkosManagementCommandContext,
  args: {
    command: string;
    entityId: string;
    entityType: string;
    eventType: string;
    newState?: unknown;
    priorState?: unknown;
    reason?: string;
    reconciliationKey?: string;
    warnings?: string[];
  }
) {
  await ctx.runMutation(internal.workosManagement.recordWorkosManagementAudit, {
    actorRole: context.actorRole,
    actorRoles: context.actorRoles,
    actorWorkosUserId: context.actorWorkosUserId,
    brokerageId: context.brokerageId,
    command: args.command,
    entityId: args.entityId,
    entityType: args.entityType,
    eventType: args.eventType,
    ...(args.newState === undefined
      ? {}
      : { newState: JSON.stringify(args.newState) }),
    organizationId: context.organizationId,
    ...(args.priorState === undefined
      ? {}
      : { priorState: JSON.stringify(args.priorState) }),
    ...(args.reason ? { reason: args.reason } : {}),
    reconciliationKey:
      args.reconciliationKey ??
      `workos-management:${args.command}:${crypto.randomUUID()}`,
    warnings: args.warnings ?? [],
  });
}

function projectedMembershipState(context: WorkosManagementCommandContext) {
  const membership = context.targetMembership;
  return membership
    ? {
        roleSlugs: projectedMembershipRoleSlugs(membership),
        status: membership.status,
        workosMembershipId: membership.workosMembershipId,
        workosUserId: membership.workosUserId,
      }
    : undefined;
}

async function auditMembershipCommandAccepted(
  ctx: ScopedUserManagementActionCtx,
  context: WorkosManagementCommandContext,
  args: {
    command: string;
    membershipId: string;
    newState: unknown;
    reason?: string;
  }
) {
  await auditWorkosCommand(ctx, context, {
    command: args.command,
    entityId: args.membershipId,
    entityType: "workosOrganizationMembership",
    eventType: `workos.membership.${args.command}.accepted`,
    newState: args.newState,
    priorState: projectedMembershipState(context),
    reason: args.reason,
    warnings: ["pending_workos_projection_reconciliation"],
  });
}

async function auditWorkosCommandFailure(
  ctx: ScopedUserManagementActionCtx,
  context: WorkosManagementCommandContext,
  args: {
    command: string;
    entityId: string;
    entityType: string;
    error: unknown;
    reason?: string;
  }
) {
  await auditWorkosCommand(ctx, context, {
    command: args.command,
    entityId: args.entityId,
    entityType: args.entityType,
    eventType: `workos.membership.${args.command}.failed`,
    newState: { error: safeWorkosError(args.error), status: "failed" },
    reason: args.reason,
    warnings: ["workos_command_failed"],
  });
}

async function auditMembershipCommandFailure(
  ctx: ScopedUserManagementActionCtx,
  context: WorkosManagementCommandContext,
  args: {
    command: string;
    error: unknown;
    membershipId: string;
    reason?: string;
  }
) {
  await auditWorkosCommand(ctx, context, {
    command: args.command,
    entityId: args.membershipId,
    entityType: "workosOrganizationMembership",
    eventType: `workos.membership.${args.command}.failed`,
    newState: { error: safeWorkosError(args.error), status: "failed" },
    priorState: projectedMembershipState(context),
    reason: args.reason,
    warnings: ["workos_command_failed"],
  });
}

async function markPrincipalBrokerTransferFailure(
  ctx: ScopedUserManagementActionCtx,
  commandId: Id<"workosManagementOperations">,
  args: {
    error: unknown;
    stage: "target-promotion" | "source-demotion";
    status: "failed" | "target-promoted";
  }
) {
  await ctx.runMutation(
    internal.workosManagement.updatePrincipalBrokerTransferState,
    {
      commandId,
      failureStage: args.stage,
      safeError: safeWorkosError(args.error),
      status: args.status,
    }
  );
}

async function auditPrincipalBrokerTransfer(
  ctx: ScopedUserManagementActionCtx,
  context: WorkosManagementCommandContext,
  transfer: {
    idempotencyKey: string;
    reason: string;
    sourceMembershipId: string;
    targetMembershipId: string;
  },
  command: {
    sourceRoleSlugs: string[];
    targetRoleSlugs: string[];
  },
  outcome:
    | { status: "accepted" }
    | {
        error: unknown;
        stage: "target-promotion" | "source-demotion";
        status: "recoverable-failure";
      }
) {
  await auditWorkosCommand(ctx, context, {
    command: "transferPrincipalBroker",
    entityId: transfer.sourceMembershipId,
    entityType: "workosOrganizationMembership",
    eventType: `workos.principal-broker-transfer.${outcome.status}`,
    newState: {
      ...(outcome.status === "recoverable-failure"
        ? { error: safeWorkosError(outcome.error), stage: outcome.stage }
        : {}),
      sourceMembershipId: transfer.sourceMembershipId,
      sourceRoleSlugs: command.sourceRoleSlugs,
      status: outcome.status,
      targetMembershipId: transfer.targetMembershipId,
      targetRoleSlugs: command.targetRoleSlugs,
    },
    priorState: {
      activePrincipalBrokerMembershipIds:
        context.activePrincipalBrokerMembershipIds,
    },
    reason: transfer.reason,
    reconciliationKey: `principal-broker-transfer:${transfer.idempotencyKey}:${outcome.status}${outcome.status === "recoverable-failure" ? `:${outcome.stage}` : ""}`,
    warnings:
      outcome.status === "accepted"
        ? ["pending_workos_projection_reconciliation"]
        : ["principal_broker_transfer_recovery_required"],
  });
}

function safeWorkosError(error: unknown) {
  return workosErrorMessage(error).slice(0, 500);
}

function accepted(
  adapter: "fake" | "workos",
  operation: string,
  workosId: string
): AcceptedResult {
  return {
    adapter,
    operation,
    status: "accepted",
    sync: "waiting-for-webhook",
    workosId,
  };
}

function requireNonEmptyRoleSlug(roleSlug: string) {
  if (roleSlug.trim().length === 0) {
    throw new Error("WorkOS role slug is required");
  }
}

function normalizeWorkosEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    throw new Error("WorkOS user email is required");
  }
  return normalized;
}

function normalizeWorkosRoleSlug(roleSlug: string) {
  const normalized = normalizeRoleSlug(roleSlug);
  if (!normalized) {
    throw new Error(`Unknown WorkOS role slug: ${roleSlug}`);
  }
  return normalized;
}

function normalizeWorkosRoleSlugs(roleSlugs: string[]) {
  return [...new Set(roleSlugs.map(normalizeWorkosRoleSlug))];
}

function workosMembershipRoleSlugs(membership: {
  role?: { slug?: unknown };
  roles?: Array<{ slug?: unknown }>;
}) {
  return normalizeWorkosRoleSlugs(
    [
      typeof membership.role?.slug === "string"
        ? membership.role.slug
        : undefined,
      ...(membership.roles ?? []).map((role) => role.slug),
    ].filter((role): role is string => typeof role === "string")
  );
}

export function buildWorkosMembershipRolesPayload(args: {
  primaryRoleSlug?: string;
  roleSlugs: string[];
}): { roleSlug: string } | { roleSlugs: string[] } {
  const roleSlugs = normalizeWorkosRoleSlugs(args.roleSlugs);
  const primaryRoleSlug =
    args.primaryRoleSlug === undefined
      ? undefined
      : normalizeWorkosRoleSlug(args.primaryRoleSlug);

  if (roleSlugs.length > 0) {
    requireSelectedPrimaryRole(primaryRoleSlug, roleSlugs);
    if (primaryRoleSlug !== undefined) {
      return {
        roleSlugs: [
          primaryRoleSlug,
          ...roleSlugs.filter((roleSlug) => roleSlug !== primaryRoleSlug),
        ],
      };
    }
    return { roleSlugs };
  }
  if (primaryRoleSlug !== undefined) {
    requireNonEmptyRoleSlug(primaryRoleSlug);
    return { roleSlug: primaryRoleSlug };
  }

  throw new Error("At least one WorkOS role slug is required");
}

function requireSelectedPrimaryRole(
  primaryRoleSlug: string | undefined,
  roleSlugs: string[]
) {
  if (primaryRoleSlug === undefined) {
    return;
  }
  requireNonEmptyRoleSlug(primaryRoleSlug);
  if (!roleSlugs.includes(primaryRoleSlug)) {
    throw new Error("Primary WorkOS role slug must be selected");
  }
}

function entityIdentifier(entity: WorkosEntity) {
  if (typeof entity.id === "string") {
    return entity.id;
  }
  if (typeof entity.slug === "string") {
    return entity.slug;
  }
  return "unknown";
}

function eventForSync(
  event: string,
  id: string,
  data: WorkosEntity,
  syncRunId: string
) {
  const sanitized = JSON.parse(JSON.stringify(data)) as WorkosEntity;
  return {
    created_at: stringOrNow(
      sanitized.updated_at ??
        sanitized.updatedAt ??
        sanitized.created_at ??
        sanitized.createdAt
    ),
    data: sanitized,
    event,
    id: `sync:${syncRunId}:${event}:${id}`,
  };
}

function stringOrNow(value: unknown): string {
  return typeof value === "string" ? value : new Date().toISOString();
}

function workosIdSlug(value: string) {
  return value.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function workosTimestamp(value: string | undefined) {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isWorkosConflict(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === 409
  ) {
    return true;
  }
  const message = workosErrorMessage(error);
  return (
    USER_ALREADY_MEMBER_PATTERN.test(message) ||
    EMAIL_ALREADY_INVITED_PATTERN.test(message)
  );
}

function workosErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
}
