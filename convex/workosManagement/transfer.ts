import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  backofficeRoleSlugs,
  userManagementWriteAction,
} from "../authz";
import { publicMutation } from "../fluent";
import { resolveUserManagementTargetScope } from "./context";
import { getWorkosManagementAdapter } from "./directory";
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
