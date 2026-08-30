import { WorkOS } from "@workos-inc/node";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import {
  type AuthorizedViewer,
  backofficeRoleSlugs,
  adminAction,
  normalizeRoleSlug,
  userManagementWriteAction,
  userManagementWriteQuery,
} from "../authz";
import {
  pendingBuilderStaffMembershipId,
  pendingBuilderStaffWorkosUserId,
} from "../builderStaffIdentity";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "../fairLendConfig";
import {
  LENDER_ROLE_SLUGS,
  type LenderRoleSlug as AppLenderRoleSlug,
} from "../lenderOrganizationAccess";
import { internalQuery, publicAction, publicMutation } from "../fluent";

export const acceptedReturn = v.object({
  adapter: v.union(v.literal("fake"), v.literal("workos")),
  operation: v.string(),
  status: v.literal("accepted"),
  sync: v.literal("waiting-for-webhook"),
  workosId: v.optional(v.string()),
  workosUserId: v.optional(v.string()),
});

export const transferRequiredReturn = v.object({
  membershipId: v.optional(v.string()),
  operation: v.string(),
  organizationId: v.string(),
  reason: v.literal("principal-broker-transfer-required"),
  status: v.literal("transfer-required"),
  sync: v.literal("not-started"),
});

export const membershipCommandReturn = v.union(acceptedReturn, transferRequiredReturn);

export const sharedLenderRoleValidator = v.union(
  v.literal("lender"),
  v.literal("lender-admin"),
  v.literal("lender-staff")
);

export const sharedLenderMembershipTargetReturn = v.object({
  brokerageId: v.id("brokerages"),
  lenderOrganizationId: v.id("lenderOrganizations"),
  membershipId: v.string(),
  roleSlugs: v.array(v.string()),
  workosUserId: v.string(),
});

export const principalBrokerTransferReturn = v.union(
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

export const builderStaffProvisionReturn = v.object({
  adapter: v.union(v.literal("fake"), v.literal("workos")),
  invitationId: v.optional(v.string()),
  membershipId: v.string(),
  operation: v.literal("provisionBuilderStaffUser"),
  status: v.literal("accepted"),
  sync: v.literal("waiting-for-webhook"),
  userId: v.string(),
});

export const syncReturn = v.object({
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

export const USER_ALREADY_MEMBER_PATTERN =
  /user already a member of (?:the )?organization/i;
export const EMAIL_ALREADY_INVITED_PATTERN =
  /email already invited to (?:the )?organization/i;

export interface AcceptedResult {
  adapter: "fake" | "workos";
  operation: string;
  status: "accepted";
  sync: "waiting-for-webhook";
  workosId?: string;
  workosUserId?: string;
}

export interface MembershipRoleUpdateResult {
  accepted: AcceptedResult;
  membership: WorkosEntity;
}

export interface WorkosManagementCommandContext {
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

export interface BeginPrincipalBrokerTransferResult {
  commandId: Id<"workosManagementOperations">;
  idempotencyKey: string;
  sourceRoleSlugs: string[];
  status: "pending" | "target-promoted" | "accepted" | "transfer-in-progress";
  targetRoleSlugs: string[];
}

export type PrincipalBrokerTransferResult =
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

export interface BuilderStaffProvisionResult {
  adapter: "fake" | "workos";
  invitationId?: string;
  membershipId: string;
  operation: "provisionBuilderStaffUser";
  status: "accepted";
  sync: "waiting-for-webhook";
  userId: string;
}

export interface WorkosProvisionUser {
  email: string;
  id: string;
}

export interface WorkosProvisionInvitation {
  createdAt?: string;
  id: string;
  state?: string;
  updatedAt?: string;
}

export type WorkosProvisionMembershipStatus = "active" | "inactive" | "pending";

export interface WorkosProvisionMembership {
  id: string;
  role?: { slug?: unknown };
  roles?: Array<{ slug?: unknown }>;
  status?: WorkosProvisionMembershipStatus;
}

export interface WorkosProvisionClient {
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
      roleSlug: string;
    }): Promise<WorkosProvisionInvitation>;
    updateOrganizationMembership(
      membershipId: string,
      args: { roleSlugs: string[] }
    ): Promise<WorkosProvisionMembership>;
  };
}

export interface WorkosEntity {
  id?: string;
  slug?: string;
  [key: string]: unknown;
}

export interface SyncSnapshot {
  memberships: WorkosEntity[];
  organizationRoles: WorkosEntity[];
  organizations: WorkosEntity[];
  permissions: WorkosEntity[];
  roles: WorkosEntity[];
  users: WorkosEntity[];
}

export interface SyncResult {
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

export type ScopedUserManagementActionCtx = ActionCtx & {
  viewer: {
    actorKind?: string;
    organizationId?: string;
    roles: string[];
    subject: string;
  };
};

export const commandContextReturn = v.object({
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


export function toWorkosEntity(value: unknown): WorkosEntity {
  return JSON.parse(JSON.stringify(value)) as WorkosEntity;
}

export function membershipRoleUpdateResult(
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

export function projectedMembershipRoleSlugs(
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

export async function listBoundedOrganizationMemberships(
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

export function assertDifferentTransferMemberships(args: {
  sourceMembershipId: string;
  targetMembershipId: string;
}) {
  if (args.sourceMembershipId === args.targetMembershipId) {
    throw new Error("Principal Broker transfer requires a different member");
  }
}

export function assertManagementRoleSlugs(
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

export function canAssignInitialPrincipalBroker(
  context: WorkosManagementCommandContext
) {
  return (
    context.mode === "backoffice" &&
    context.activePrincipalBrokerMembershipIds.length === 0
  );
}

export function roleChangeRequiresProtectedTransfer(
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

export function principalBrokerRemovalRequiresTransfer(
  context: WorkosManagementCommandContext
) {
  const membershipId = context.targetMembership?.workosMembershipId;
  return (
    membershipId !== undefined &&
    context.activePrincipalBrokerMembershipIds.includes(membershipId)
  );
}

export function reactivationRequiresProtectedTransfer(
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

export function transferRequired(
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

export function orderedManagementRoleSlugs(args: {
  primaryRoleSlug?: string;
  roleSlugs: string[];
}) {
  const payload = buildWorkosMembershipRolesPayload(args);
  return "roleSlugs" in payload ? payload.roleSlugs : [payload.roleSlug];
}

export function normalizedReason(reason: string | undefined) {
  const normalized = reason?.trim();
  return normalized || undefined;
}

export function requireReason(reason: string, label: string) {
  const normalized = reason.trim();
  if (!normalized) {
    throw new Error(`${label} reason is required`);
  }
  return normalized;
}

export function requireNonEmptyValue(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

export async function auditWorkosCommand(
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

export function projectedMembershipState(context: WorkosManagementCommandContext) {
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

export async function auditMembershipCommandAccepted(
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

export async function auditWorkosCommandFailure(
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

export async function auditMembershipCommandFailure(
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

export async function markPrincipalBrokerTransferFailure(
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

export async function auditPrincipalBrokerTransfer(
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

export function safeWorkosError(error: unknown) {
  return workosErrorMessage(error).slice(0, 500);
}

export function accepted(
  adapter: "fake" | "workos",
  operation: string,
  workosId: string,
  workosUserId?: string
): AcceptedResult {
  return {
    adapter,
    operation,
    status: "accepted",
    sync: "waiting-for-webhook",
    workosId,
    ...(workosUserId ? { workosUserId } : {}),
  };
}

export function requireNonEmptyRoleSlug(roleSlug: string) {
  if (roleSlug.trim().length === 0) {
    throw new Error("WorkOS role slug is required");
  }
}

export function normalizeWorkosEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    throw new Error("WorkOS user email is required");
  }
  return normalized;
}

export function normalizeWorkosRoleSlug(roleSlug: string) {
  const normalized = normalizeRoleSlug(roleSlug);
  if (!normalized) {
    throw new Error(`Unknown WorkOS role slug: ${roleSlug}`);
  }
  return normalized;
}

export function normalizeWorkosRoleSlugs(roleSlugs: string[]) {
  return [...new Set(roleSlugs.map(normalizeWorkosRoleSlug))];
}

export function workosMembershipRoleSlugs(membership: {
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

export function requireSelectedPrimaryRole(
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

export function entityIdentifier(entity: WorkosEntity) {
  if (typeof entity.id === "string") {
    return entity.id;
  }
  if (typeof entity.slug === "string") {
    return entity.slug;
  }
  return "unknown";
}

export function eventForSync(
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

export function stringOrNow(value: unknown): string {
  return typeof value === "string" ? value : new Date().toISOString();
}

export function workosIdSlug(value: string) {
  return value.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function workosTimestamp(value: string | undefined) {
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

export function workosErrorMessage(error: unknown) {
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

export function workosInvitationUserMessage(
  error: unknown,
  invitationCreated = false,
) {
  const message = workosErrorMessage(error);
  if (EMAIL_ALREADY_INVITED_PATTERN.test(message)) {
    return "An invitation is already pending for this email. Retry the invitation after confirming the address.";
  }
  if (USER_ALREADY_MEMBER_PATTERN.test(message)) {
    return "This email already belongs to an organization member. Link the existing WorkOS user instead.";
  }
  if (invitationCreated) {
    return "The WorkOS invitation was created, but the custom email could not be queued. Try again or contact support.";
  }
  return "The invitation could not be sent. Check the email and try again, or contact support.";
}
