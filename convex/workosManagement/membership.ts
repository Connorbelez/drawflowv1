import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  adminAction,
  authenticatedAction,
  userManagementWriteAction,
} from "../authz";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "../fairLendConfig";
import { publicAction } from "../fluent";
import {
  type LenderRoleSlug as AppLenderRoleSlug,
  LENDER_ROLE_SLUGS,
} from "../lenderOrganizationAccess";
import { resolveUserManagementTargetScope } from "./context";
import { getWorkosManagementAdapter } from "./directory";
import * as shared from "./shared";

const {
  acceptedReturn,
  membershipCommandReturn,
  sharedLenderRoleValidator,
  builderStaffProvisionReturn,
  assertManagementRoleSlugs,
  canAssignInitialPrincipalBroker,
  roleChangeRequiresProtectedTransfer,
  principalBrokerRemovalRequiresTransfer,
  reactivationRequiresProtectedTransfer,
  transferRequired,
  orderedManagementRoleSlugs,
  normalizedReason,
  requireReason,
  auditWorkosCommand,
  auditMembershipCommandAccepted,
  auditWorkosCommandFailure,
  auditMembershipCommandFailure,
  safeWorkosError,
  workosInvitationUserMessage,
} = shared;
type AcceptedResult = shared.AcceptedResult;

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
      if (result.adapter === "workos" && result.workosId) {
        await ctx.runMutation(
          internal.workosManagement.enqueueIdentityInvitationEmail,
          {
            brokerageId: context.brokerageId,
            email: args.email,
            organizationId: args.organizationId,
            relatedEntityId: result.workosId,
            relatedEntityType: "workosInvitation",
            roleSlug,
            workosInvitationId: result.workosId,
          }
        );
      }
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
    brokerageId: v.optional(v.id("brokerages")),
    email: v.string(),
    organizationId: v.string(),
    recipientName: v.optional(v.string()),
    relatedEntityId: v.optional(v.string()),
  })
  .returns(acceptedReturn)
  .handler(async (ctx, args) => {
    const result = await getWorkosManagementAdapter().inviteUser({
      email: args.email,
      organizationId: args.organizationId,
      roleSlug: "builder-staff",
    });
    if (result.adapter === "workos" && result.workosId && args.brokerageId) {
      await ctx.runMutation(
        internal.workosManagement.enqueueIdentityInvitationEmail,
        {
          brokerageId: args.brokerageId,
          email: args.email,
          organizationId: args.organizationId,
          recipientName: args.recipientName,
          relatedEntityId: args.relatedEntityId ?? result.workosId,
          relatedEntityType: "workosInvitation",
          roleSlug: "builder-staff",
          workosInvitationId: result.workosId,
        }
      );
    }
    return result;
  })
  .internal();

/**
 * Send the builder-owner invitation used by the canonical brokerage
 * provisioning flow. This is deliberately internal so the lender organization
 * management API cannot assign non-lender roles.
 */
export const inviteBuilderUser = publicAction
  .input({
    brokerageId: v.optional(v.id("brokerages")),
    email: v.string(),
    organizationId: v.string(),
    recipientName: v.optional(v.string()),
    relatedEntityId: v.optional(v.string()),
  })
  .returns(acceptedReturn)
  .handler(async (ctx, args) => {
    const result = await getWorkosManagementAdapter().inviteUser({
      email: args.email,
      organizationId: args.organizationId,
      roleSlug: "builder",
    });
    if (result.adapter === "workos" && result.workosId && args.brokerageId) {
      await ctx.runMutation(
        internal.workosManagement.enqueueIdentityInvitationEmail,
        {
          brokerageId: args.brokerageId,
          email: args.email,
          organizationId: args.organizationId,
          recipientName: args.recipientName,
          relatedEntityId: args.relatedEntityId ?? result.workosId,
          relatedEntityType: "workosInvitation",
          roleSlug: "builder",
          workosInvitationId: result.workosId,
        }
      );
    }
    return result;
  })
  .internal();

/**
 * Send a WorkOS organization invitation with the `contractor` role for an
 * invited contractor claim (PRD §7.3, §7.5, §11.3). WorkOS owns the
 * organization membership and role projection; DrawFlow stores only app-level
 * claim intent elsewhere. Fake-backed in tests, live-backed in production.
 */
export const inviteContractorUser = publicAction
  .input({
    brokerageId: v.optional(v.id("brokerages")),
    claimId: v.optional(v.id("contractorInviteClaims")),
    deliveryAttemptId: v.optional(v.string()),
    email: v.string(),
    organizationId: v.string(),
    recipientName: v.optional(v.string()),
    relatedEntityId: v.optional(v.string()),
  })
  .returns(acceptedReturn)
  .handler(async (ctx, args) => {
    let result: AcceptedResult | undefined;
    try {
      result = await getWorkosManagementAdapter().inviteUser({
        email: args.email,
        organizationId: args.organizationId,
        roleSlug: "contractor",
      });
      if (result.adapter === "workos" && result.workosId && args.brokerageId) {
        await ctx.runMutation(
          internal.workosManagement.enqueueIdentityInvitationEmail,
          {
            brokerageId: args.brokerageId,
            email: args.email,
            organizationId: args.organizationId,
            recipientName: args.recipientName,
            relatedEntityId: args.relatedEntityId ?? result.workosId,
            relatedEntityType: "contractorInviteClaim",
            roleSlug: "contractor",
            workosInvitationId: result.workosId,
          }
        );
      }
      if (args.claimId) {
        await ctx.runMutation(
          internal.contractorOnboarding.updateContractorInvitationDelivery,
          {
            claimId: args.claimId,
            deliveryAttemptId: args.deliveryAttemptId,
            status: "sent",
            ...(result.workosId ? { workosInvitationId: result.workosId } : {}),
          }
        );
      }
      return result;
    } catch (error) {
      if (args.claimId) {
        await ctx.runMutation(
          internal.contractorOnboarding.updateContractorInvitationDelivery,
          {
            claimId: args.claimId,
            deliveryAttemptId: args.deliveryAttemptId,
            error: workosInvitationUserMessage(
              error,
              Boolean(result?.workosId)
            ),
            status: "failed",
            ...(result?.workosId
              ? { workosInvitationId: result.workosId }
              : {}),
          }
        );
      }
      throw error;
    }
  })
  .internal();

export const provisionBuilderStaffUser = publicAction
  .input({
    brokerageId: v.optional(v.id("brokerages")),
    email: v.string(),
    organizationId: v.string(),
    recipientName: v.optional(v.string()),
    relatedEntityId: v.optional(v.string()),
  })
  .returns(builderStaffProvisionReturn)
  .handler(async (ctx, args) => {
    const result =
      await getWorkosManagementAdapter().provisionBuilderStaffUser(args);
    if (
      result.adapter === "workos" &&
      result.invitationId &&
      args.brokerageId
    ) {
      await ctx.runMutation(
        internal.workosManagement.enqueueIdentityInvitationEmail,
        {
          brokerageId: args.brokerageId,
          email: args.email,
          organizationId: args.organizationId,
          recipientName: args.recipientName,
          relatedEntityId: args.relatedEntityId ?? result.invitationId,
          relatedEntityType: "builderStaffProvision",
          roleSlug: "builder-staff",
          workosInvitationId: result.invitationId,
        }
      );
    }
    return result;
  })
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
        newState: JSON.stringify({
          roleSlugs: [args.roleSlug],
          status: "active",
        }),
        priorState: JSON.stringify({
          roleSlugs: target.roleSlugs,
          status: "active",
        }),
        reason,
        reconciliationKey: `workos-lender-role:${args.membershipId}:${crypto.randomUUID()}`,
        warnings: ["pending_workos_projection_reconciliation"],
      }
    );
    return update.accepted;
  })
  .public();

/** WorkOS-first deactivation command for an app-owned lender assignment. */
export const deactivateSharedLenderMembership = authenticatedAction
  .input({
    assignmentId: v.id("lenderOrganizationAssignments"),
    idempotencyKey: v.string(),
    reason: v.string(),
  })
  .returns(acceptedReturn)
  .handler(async (ctx, args): Promise<AcceptedResult> => {
    const target: {
      adapter?: "fake" | "workos";
      assignmentId: import("../_generated/dataModel").Id<"lenderOrganizationAssignments">;
      membershipId: string;
      state: "ready" | "accepted" | "reconciled";
      workosId?: string;
    } = await ctx.runMutation(
      internal.lenderOrganizations.beginLenderMemberDeactivation,
      {
        actorRoles: ctx.viewer.roles,
        actorWorkosUserId: ctx.viewer.subject,
        assignmentId: args.assignmentId,
        idempotencyKey: args.idempotencyKey,
        reason: args.reason,
      }
    );
    requireReason(args.reason, "Lender membership deactivation");
    if (target.state === "accepted" || target.state === "reconciled") {
      return {
        adapter: target.adapter ?? "fake",
        operation: "deactivateSharedLenderMembership",
        status: "accepted" as const,
        sync: "waiting-for-webhook" as const,
        ...(target.workosId ? { workosId: target.workosId } : {}),
      };
    }
    const adapter = getWorkosManagementAdapter();
    try {
      const result = await adapter.deactivateMembership({
        membershipId: target.membershipId,
      });
      await ctx.runMutation(
        internal.lenderOrganizations.markLenderMemberDeactivationAccepted,
        {
          adapter: result.adapter,
          assignmentId: target.assignmentId,
          idempotencyKey: args.idempotencyKey,
          ...(result.workosId ? { workosId: result.workosId } : {}),
        }
      );
      return {
        ...result,
        operation: "deactivateSharedLenderMembership",
      };
    } catch (error) {
      await ctx.runMutation(
        internal.lenderOrganizations.markLenderMemberDeactivationFailed,
        {
          assignmentId: target.assignmentId,
          error: safeWorkosError(error),
          idempotencyKey: args.idempotencyKey,
        }
      );
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
