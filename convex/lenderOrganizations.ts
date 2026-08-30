import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  adminAction,
  adminMutation,
  adminQuery,
  authenticatedQuery,
  lenderUserManagementMutation,
} from "./authz";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "./fairLendConfig";
import { internalMutation, internalQuery } from "./fluent";
import {
  acceptedInvitationValidator,
  brokerageOptionValidator,
  LENDER_MEMBER_PAGE_LIMIT,
  LENDER_ORGANIZATION_PAGE_LIMIT,
  lenderDecisionPermissionsValidator,
  lenderMemberDirectoryEntryValidator,
  lenderMembershipReconciliationValidator,
  lenderMemberValidator,
  lenderOrganizationValidator,
  lenderPermissionsValidator,
  lenderRoleValidator,
  requireBoundedPage,
  unassignedUserValidator,
} from "./lender_organizations/contracts";
import {
  findAssignmentByEmailAndStatus,
  findAssignmentByUserAndStatus,
  listActiveWorkosUserEmailProjectionSnapshot,
  primaryActorRole,
  projectActiveLenderMember,
  reconcilePendingLenderAssignmentsHandler,
  requireName,
  requireReason,
  writeLenderAudit,
} from "./lender_organizations/helpers";
import {
  beginLenderMemberDeactivation as beginLenderMemberDeactivationApplication,
  deactivateLenderMemberImmediately,
  deactivateLenderOrganizationMembersImmediately,
  markLenderMemberDeactivationAccepted as markLenderMemberDeactivationAcceptedApplication,
  markLenderMemberDeactivationFailed as markLenderMemberDeactivationFailedApplication,
} from "./lender_organizations/member_deactivation";
import {
  effectiveLenderDecisionPermissions,
  listActiveLenderOrganizationMembers,
  listActiveSharedLenderMemberships,
  normalizeLenderEmail,
  normalizeLenderRoleSlugs,
  requireActiveLenderWorkosUser,
  resolveAssignedLenderOrganization,
  resolveLenderOrganizationTarget,
} from "./lenderOrganizationAccess";
import { sendWorkosLenderInvitation } from "./workosManagement";
import { queueIdentityInvitationEmail } from "./workosManagement/invitationEmails";

export const getLenderOrganizationDirectoryMetadata = adminQuery
  .input({})
  .returns(
    v.object({
      brokerages: v.array(brokerageOptionValidator),
      sharedWorkosOrganizationId: v.string(),
    })
  )
  .handler(async (ctx) => {
    const brokerages = await ctx.db
      .query("brokerages")
      .withIndex("by_status", (query) => query.eq("status", "active"))
      .take(501);
    if (brokerages.length > 500) {
      throw new Error("Brokerage directory exceeds the safe limit");
    }
    return {
      brokerages: brokerages.map((brokerage) => ({
        id: brokerage._id,
        displayName: brokerage.displayName,
      })),
      sharedWorkosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
    };
  })
  .public();

export const listLenderOrganizations = adminQuery
  .input({
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
  })
  .returns(paginationResultValidator(lenderOrganizationValidator))
  .handler(async (ctx, args) => {
    requireBoundedPage(
      args.paginationOpts,
      LENDER_ORGANIZATION_PAGE_LIMIT,
      "Lender organization directory"
    );
    const status = args.status;
    const organizationsPage = status
      ? await ctx.db
          .query("lenderOrganizations")
          .withIndex("by_status", (query) => query.eq("status", status))
          .paginate(args.paginationOpts)
      : await ctx.db.query("lenderOrganizations").paginate(args.paginationOpts);
    const normalizedSearch = args.search?.trim().toLowerCase() ?? "";
    const rows = await Promise.all(
      organizationsPage.page.map(async (organization) => {
        const brokerage = await ctx.db.get(organization.brokerageId);
        if (!brokerage || brokerage.status !== "active") {
          return null;
        }
        if (
          normalizedSearch &&
          ![
            organization.displayName,
            organization.legalName,
            brokerage.displayName,
            brokerage.legalName,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch)
        ) {
          return null;
        }
        const assignments = await ctx.db
          .query("lenderOrganizationAssignments")
          .withIndex("by_lender_organization", (query) =>
            query.eq("lenderOrganizationId", organization._id)
          )
          .take(501);
        if (assignments.length > 500) {
          throw new Error("Lender organization membership limit exceeded");
        }
        return {
          id: organization._id,
          brokerageId: brokerage._id,
          brokerageName: brokerage.displayName,
          legalName: organization.legalName,
          displayName: organization.displayName,
          status: organization.status,
          permissions: organization.permissions,
          memberCount: assignments.filter((row) => row.status === "active")
            .length,
          pendingCount: assignments.filter((row) => row.status === "pending")
            .length,
          updatedAt: organization.updatedAt,
        };
      })
    );
    return {
      ...organizationsPage,
      page: rows
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .sort((left, right) =>
          left.displayName.localeCompare(right.displayName)
        ),
    };
  })
  .public();

export const listUnassignedLenderUsers = adminQuery
  .input({})
  .returns(v.object({ users: v.array(unassignedUserValidator) }))
  .handler(async (ctx) => {
    const memberships = await ctx.db
      .query("workosOrganizationMemberships")
      .withIndex("by_organization", (query) =>
        query.eq("workosOrganizationId", FAIRLEND_WORKOS_ORGANIZATION_ID)
      )
      .take(501);
    if (memberships.length > 500) {
      throw new Error(
        "Shared WorkOS membership directory exceeds the safe limit"
      );
    }

    const seen = new Set<string>();
    const users: Array<{
      userId: Id<"users">;
      workosUserId: string;
      name: string;
      email: string;
      profilePictureUrl?: string;
      membershipId: string;
      roleSlugs: string[];
    }> = [];
    for (const membership of memberships) {
      if (membership.status !== "active" || seen.has(membership.workosUserId)) {
        continue;
      }
      const roleSlugs = normalizeLenderRoleSlugs([
        membership.roleSlug,
        ...membership.roleSlugs,
      ]);
      if (roleSlugs.length === 0) {
        continue;
      }
      const projectedUsers = await ctx.db
        .query("users")
        .withIndex("by_workos_user_id", (query) =>
          query.eq("workosUserId", membership.workosUserId)
        )
        .take(2);
      const user = projectedUsers.length === 1 ? projectedUsers[0] : null;
      if (!user || user.status !== "active") {
        continue;
      }
      const [activeAssignment, pendingAssignment] = await Promise.all([
        findAssignmentByUserAndStatus(ctx, membership.workosUserId, "active"),
        findAssignmentByUserAndStatus(ctx, membership.workosUserId, "pending"),
      ]);
      if (activeAssignment || pendingAssignment) {
        seen.add(membership.workosUserId);
        continue;
      }
      seen.add(membership.workosUserId);
      users.push({
        userId: user._id,
        workosUserId: membership.workosUserId,
        name: user.name || user.email,
        email: user.email,
        ...(user.profilePictureUrl
          ? { profilePictureUrl: user.profilePictureUrl }
          : {}),
        membershipId: membership.workosMembershipId,
        roleSlugs,
      });
    }
    users.sort((left, right) => left.name.localeCompare(right.name));
    return { users };
  })
  .public();

export const listLenderOrganizationMembersForAdmin = adminQuery
  .input({
    lenderOrganizationId: v.id("lenderOrganizations"),
    paginationOpts: paginationOptsValidator,
  })
  .returns(paginationResultValidator(lenderMemberDirectoryEntryValidator))
  .handler(async (ctx, args) => {
    await resolveLenderOrganizationTarget(ctx, args.lenderOrganizationId);
    requireBoundedPage(
      args.paginationOpts,
      LENDER_MEMBER_PAGE_LIMIT,
      "Lender organization member directory"
    );
    const assignmentsPage = await ctx.db
      .query("lenderOrganizationAssignments")
      .withIndex("by_lender_organization", (query) =>
        query.eq("lenderOrganizationId", args.lenderOrganizationId)
      )
      .paginate(args.paginationOpts);
    const page = await Promise.all(
      assignmentsPage.page.map(async (assignment) => {
        if (assignment.status === "pending") {
          return {
            kind: "pending_invitation" as const,
            pendingInvitation: {
              assignmentId: assignment._id,
              email: assignment.normalizedEmail,
              status: "pending" as const,
              assignedAt: assignment.assignedAt,
            },
          };
        }
        if (
          assignment.status === "inactive" &&
          assignment.reconciliationOutcome === "conflict_rejected"
        ) {
          return {
            kind: "pending_invitation" as const,
            pendingInvitation: {
              assignmentId: assignment._id,
              assignedAt: assignment.assignedAt,
              email: assignment.normalizedEmail,
              reconciledAt: assignment.reconciledAt,
              reconciliationReason:
                assignment.reconciliationReason ??
                "Invitation reconciliation requires Back Office review.",
              status: "conflict_rejected" as const,
            },
          };
        }
        const member = await projectActiveLenderMember(ctx, assignment);
        return member ? { kind: "member" as const, member } : null;
      })
    );
    return {
      ...assignmentsPage,
      page: page.filter(
        (entry): entry is NonNullable<typeof entry> => entry !== null
      ),
    };
  })
  .public();

/**
 * Canonical reactive boundary for a WorkOS-first lender membership command.
 * The app-owned assignment proves which Lender Organization may observe the
 * shared WorkOS membership while its webhook projection catches up.
 */
export const getLenderMembershipReconciliation = adminQuery
  .input({
    lenderOrganizationId: v.id("lenderOrganizations"),
    membershipId: v.string(),
  })
  .returns(v.union(v.null(), lenderMembershipReconciliationValidator))
  .handler(async (ctx, args) => {
    await resolveLenderOrganizationTarget(ctx, args.lenderOrganizationId);
    const memberships = await ctx.db
      .query("workosOrganizationMemberships")
      .withIndex("by_workos_membership_id", (query) =>
        query.eq("workosMembershipId", args.membershipId)
      )
      .take(2);
    if (memberships.length > 1) {
      throw new Error("Forbidden: membership projection ambiguous");
    }
    const membership = memberships[0];
    if (!membership) {
      return null;
    }
    if (membership.workosOrganizationId !== FAIRLEND_WORKOS_ORGANIZATION_ID) {
      throw new Error("Forbidden: shared lender membership scope");
    }

    const assignments = await ctx.db
      .query("lenderOrganizationAssignments")
      .withIndex("by_workos_user_and_status", (query) =>
        query.eq("workosUserId", membership.workosUserId).eq("status", "active")
      )
      .take(3);
    if (assignments.length === 0) {
      return null;
    }
    if (
      assignments.length !== 1 ||
      assignments[0]?.lenderOrganizationId !== args.lenderOrganizationId
    ) {
      throw new Error("Forbidden: lender organization assignment scope");
    }

    return {
      assignmentId: assignments[0]._id,
      membershipId: membership.workosMembershipId,
      membershipStatus: membership.status,
      roleSlugs: normalizeLenderRoleSlugs([
        membership.roleSlug,
        ...membership.roleSlugs,
      ]),
      workosUserId: membership.workosUserId,
    };
  })
  .public();

export const getCurrentLenderOrganization = authenticatedQuery
  .input({})
  .returns(
    v.object({
      currentUser: v.object({
        userId: v.id("users"),
        workosUserId: v.string(),
        name: v.string(),
        email: v.string(),
        profilePictureUrl: v.optional(v.string()),
        roles: v.array(v.string()),
        canManageMembers: v.boolean(),
      }),
      organization: v.union(
        v.null(),
        v.object({
          id: v.id("lenderOrganizations"),
          brokerageId: v.id("brokerages"),
          brokerageName: v.string(),
          legalName: v.string(),
          displayName: v.string(),
          status: v.literal("active"),
          permissions: lenderPermissionsValidator,
          sharedWorkosOrganizationId: v.string(),
        })
      ),
    })
  )
  .handler(async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    const workosUserId = identity.subject.trim();
    const user = await requireActiveLenderWorkosUser(ctx, workosUserId);
    const memberships = await listActiveSharedLenderMemberships(
      ctx,
      workosUserId
    );
    const roles = normalizeLenderRoleSlugs(
      memberships.flatMap((membership) => [
        membership.roleSlug,
        ...membership.roleSlugs,
      ])
    );
    const currentUser = {
      userId: user._id,
      workosUserId,
      name: user.name || user.email,
      email: user.email,
      roles,
      canManageMembers: roles.includes("lender-admin"),
      ...(user.profilePictureUrl
        ? { profilePictureUrl: user.profilePictureUrl }
        : {}),
    };
    if (memberships.length === 0) {
      return { currentUser, organization: null };
    }
    const activeAssignments = await ctx.db
      .query("lenderOrganizationAssignments")
      .withIndex("by_workos_user_and_status", (query) =>
        query.eq("workosUserId", workosUserId).eq("status", "active")
      )
      .take(3);
    if (activeAssignments.length === 0) {
      return { currentUser, organization: null };
    }
    const resolution = await resolveAssignedLenderOrganization(ctx, identity, {
      allowPlatformAdminWithoutLenderRole: true,
    });
    return {
      currentUser,
      organization: {
        id: resolution.organization._id,
        brokerageId: resolution.brokerage._id,
        brokerageName: resolution.brokerage.displayName,
        legalName: resolution.organization.legalName,
        displayName: resolution.organization.displayName,
        status: "active" as const,
        permissions: resolution.organization.permissions,
        sharedWorkosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      },
    };
  })
  .public();

export const listCurrentLenderOrganizationMembers = authenticatedQuery
  .input({ paginationOpts: paginationOptsValidator })
  .returns(paginationResultValidator(lenderMemberValidator))
  .handler(async (ctx, args) => {
    requireBoundedPage(
      args.paginationOpts,
      LENDER_MEMBER_PAGE_LIMIT,
      "Current lender organization member directory"
    );
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    const resolution = await resolveAssignedLenderOrganization(ctx, identity, {
      allowPlatformAdminWithoutLenderRole: true,
    });
    const assignmentsPage = await ctx.db
      .query("lenderOrganizationAssignments")
      .withIndex("by_lender_organization_and_status", (query) =>
        query
          .eq("lenderOrganizationId", resolution.organization._id)
          .eq("status", "active")
      )
      .paginate(args.paginationOpts);
    const members = await Promise.all(
      assignmentsPage.page.map((assignment) =>
        projectActiveLenderMember(ctx, assignment)
      )
    );
    const activeEligibleMembers = await listActiveLenderOrganizationMembers(
      ctx,
      resolution.organization._id
    );
    const activeAdminCount = activeEligibleMembers.filter((member) =>
      member.roles.includes("lender-admin")
    ).length;
    return {
      ...assignmentsPage,
      page: members
        .filter(
          (member): member is NonNullable<typeof member> => member !== null
        )
        .map((member) => {
          const isSelf = member.workosUserId === resolution.workosUserId;
          const isLastAdmin =
            member.roleSlugs.includes("lender-admin") && activeAdminCount <= 1;
          const canManage = resolution.roles.includes("lender-admin");
          return {
            ...member,
            isSelf,
            canDeactivate:
              canManage &&
              !isSelf &&
              !isLastAdmin &&
              member.deactivation?.state !== "accepted",
            ...(canManage
              ? isSelf
                ? {
                    deactivationDisabledReason:
                      "You cannot deactivate your own membership.",
                  }
                : isLastAdmin
                  ? {
                      deactivationDisabledReason:
                        "The last active Lender Admin cannot be deactivated.",
                    }
                  : member.deactivation?.state === "accepted"
                    ? {
                        deactivationDisabledReason:
                          "WorkOS reconciliation is pending.",
                      }
                    : {}
              : {
                  deactivationDisabledReason:
                    "Lender Admin access is required.",
                }),
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name)),
    };
  })
  .public();

export const updateLenderMemberDecisionPermissions =
  lenderUserManagementMutation
    .input({
      assignmentId: v.id("lenderOrganizationAssignments"),
      expectedVersion: v.number(),
      permissions: lenderDecisionPermissionsValidator,
      reason: v.string(),
    })
    .returns(
      v.object({
        decisionPermissions: lenderDecisionPermissionsValidator,
        decisionPermissionsVersion: v.number(),
        effectiveDecisionPermissions: lenderDecisionPermissionsValidator,
      })
    )
    .handler(async (ctx, args) => {
      const assignment = await ctx.db.get(args.assignmentId);
      if (
        !assignment ||
        assignment.lenderOrganizationId !==
          ctx.activeOrganization.lenderOrganizationId
      ) {
        throw new Error("Forbidden: lender member assignment scope");
      }
      if (assignment.status !== "active") {
        throw new Error(
          "Only active lender members can receive decision permissions"
        );
      }
      if (assignment.deactivation?.state === "accepted") {
        throw new Error(
          "Member authority is suspended pending WorkOS reconciliation"
        );
      }
      const currentVersion = assignment.decisionPermissionsVersion ?? 0;
      if (args.expectedVersion !== currentVersion) {
        throw new Error(
          "Stale lender member permission version; refresh and try again"
        );
      }
      const reason = requireReason(args.reason);
      const now = Date.now();
      const nextVersion = currentVersion + 1;
      await ctx.db.patch(assignment._id, {
        decisionPermissions: args.permissions,
        decisionPermissionsVersion: nextVersion,
        updatedAt: now,
      });
      const brokerage = await ctx.db.get(assignment.brokerageId);
      if (!brokerage || brokerage.status !== "active") {
        throw new Error("Forbidden: active lender brokerage required");
      }
      await writeLenderAudit(ctx, brokerage, assignment.lenderOrganizationId, {
        command: "updateLenderMemberDecisionPermissions",
        entityId: String(assignment._id),
        entityType: "lenderOrganizationAssignment",
        eventType: "lender.organization.member_decision_permissions.updated",
        priorState: {
          decisionPermissions: assignment.decisionPermissions ?? null,
          decisionPermissionsVersion: currentVersion,
        },
        newState: {
          decisionPermissions: args.permissions,
          decisionPermissionsVersion: nextVersion,
        },
        reason,
      });
      return {
        decisionPermissions: args.permissions,
        decisionPermissionsVersion: nextVersion,
        effectiveDecisionPermissions: effectiveLenderDecisionPermissions(
          ctx.activeOrganization.permissions,
          args.permissions
        ),
      };
    })
    .public();

export const getLenderMemberDecisionPermissionMigrationCoverage = adminQuery
  .input({})
  .returns(
    v.object({
      complete: v.boolean(),
      covered: v.number(),
      remaining: v.number(),
      total: v.number(),
    })
  )
  .handler(async (ctx) => {
    const assignments = await ctx.db
      .query("lenderOrganizationAssignments")
      .take(5001);
    if (assignments.length > 5000) {
      throw new Error(
        "Lender member permission coverage exceeds the safe verification limit"
      );
    }
    const covered = assignments.filter(
      (assignment) =>
        assignment.decisionPermissions !== undefined &&
        assignment.decisionPermissionsVersion !== undefined
    ).length;
    const remaining = assignments.length - covered;
    return {
      complete: remaining === 0,
      covered,
      remaining,
      total: assignments.length,
    };
  })
  .public();

export const provisionLenderOrganization = adminMutation
  .input({
    brokerageId: v.id("brokerages"),
    legalName: v.string(),
    displayName: v.string(),
    permissions: lenderPermissionsValidator,
  })
  .returns(v.id("lenderOrganizations"))
  .handler(async (ctx, args) => {
    const brokerage = await ctx.db.get(args.brokerageId);
    if (!brokerage || brokerage.status !== "active") {
      throw new Error("Forbidden: active parent brokerage required");
    }
    const legalName = requireName(args.legalName, "Legal name");
    const displayName = requireName(args.displayName, "Display name");
    const siblings = await ctx.db
      .query("lenderOrganizations")
      .withIndex("by_brokerage", (query) =>
        query.eq("brokerageId", brokerage._id)
      )
      .take(501);
    if (siblings.length > 500) {
      throw new Error("Lender organization directory exceeds the safe limit");
    }
    if (
      siblings.some(
        (sibling) =>
          sibling.status === "active" &&
          sibling.displayName.trim().toLowerCase() === displayName.toLowerCase()
      )
    ) {
      throw new Error(
        "An active lender organization with this name already exists"
      );
    }
    const now = Date.now();
    const organizationId = await ctx.db.insert("lenderOrganizations", {
      brokerageId: brokerage._id,
      legalName,
      displayName,
      status: "active",
      permissions: args.permissions,
      createdAt: now,
      updatedAt: now,
    });
    await writeLenderAudit(ctx, brokerage, organizationId, {
      command: "provisionLenderOrganization",
      entityType: "lenderOrganization",
      eventType: "lender.organization.provisioned",
      newState: { displayName, legalName, status: "active" },
      reason: "Provisioned by DrawFlow Back Office Admin",
    });
    return organizationId;
  })
  .public();

export const updateLenderOrganizationPermissions = adminMutation
  .input({
    lenderOrganizationId: v.id("lenderOrganizations"),
    permissions: lenderPermissionsValidator,
    reason: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const { brokerage, organization } = await resolveLenderOrganizationTarget(
      ctx,
      args.lenderOrganizationId
    );
    const reason = requireReason(args.reason);
    await ctx.db.patch(organization._id, {
      permissions: args.permissions,
      updatedAt: Date.now(),
    });
    await writeLenderAudit(ctx, brokerage, organization._id, {
      command: "updateLenderOrganizationPermissions",
      entityType: "lenderOrganization",
      eventType: "lender.organization.permissions.updated",
      priorState: organization.permissions,
      newState: args.permissions,
      reason,
    });
    return null;
  })
  .public();

export const setLenderOrganizationStatus = adminMutation
  .input({
    lenderOrganizationId: v.id("lenderOrganizations"),
    status: v.union(v.literal("active"), v.literal("inactive")),
    reason: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const { brokerage, organization } = await resolveLenderOrganizationTarget(
      ctx,
      args.lenderOrganizationId
    );
    const reason = requireReason(args.reason);
    const now = Date.now();
    await ctx.db.patch(organization._id, {
      status: args.status,
      updatedAt: now,
    });
    if (args.status === "inactive") {
      await deactivateLenderOrganizationMembersImmediately(ctx, {
        actorRoles: ctx.viewer.roles,
        actorWorkosUserId: ctx.viewer.subject,
        brokerage,
        lenderOrganizationId: organization._id,
        now,
        reason,
      });
    }
    await writeLenderAudit(ctx, brokerage, organization._id, {
      command: "setLenderOrganizationStatus",
      entityType: "lenderOrganization",
      eventType: "lender.organization.status.updated",
      priorState: { status: organization.status },
      newState: { status: args.status },
      reason,
    });
    return null;
  })
  .public();

export const assignLenderUser = adminMutation
  .input({
    lenderOrganizationId: v.id("lenderOrganizations"),
    workosUserId: v.string(),
    reason: v.string(),
  })
  .returns(v.id("lenderOrganizationAssignments"))
  .handler(async (ctx, args) => {
    const { brokerage, organization } = await resolveLenderOrganizationTarget(
      ctx,
      args.lenderOrganizationId
    );
    if (organization.status !== "active") {
      throw new Error(
        "Cannot assign a user to an inactive lender organization"
      );
    }
    const reason = requireReason(args.reason);
    const workosUserId = args.workosUserId.trim();
    if (!workosUserId) {
      throw new Error("WorkOS user is required");
    }
    const user = await requireActiveLenderWorkosUser(ctx, workosUserId);
    const memberships = await listActiveSharedLenderMemberships(
      ctx,
      workosUserId
    );
    const roleSlugs = normalizeLenderRoleSlugs(
      memberships.flatMap((membership) => [
        membership.roleSlug,
        ...membership.roleSlugs,
      ])
    );
    if (memberships.length === 0 || roleSlugs.length === 0) {
      throw new Error("User needs an active shared WorkOS lender membership");
    }
    const normalizedEmail = normalizeLenderEmail(user.email);
    const activeProjectedEmailUsers = (
      await listActiveWorkosUserEmailProjectionSnapshot(ctx)
    ).filter(
      (candidate) => normalizeLenderEmail(candidate.email) === normalizedEmail
    );
    if (
      activeProjectedEmailUsers.length !== 1 ||
      activeProjectedEmailUsers[0]?.workosUserId !== workosUserId
    ) {
      throw new Error("Active lender email projection is ambiguous");
    }

    const activeAssignment = await findAssignmentByUserAndStatus(
      ctx,
      workosUserId,
      "active"
    );
    if (activeAssignment) {
      if (activeAssignment.lenderOrganizationId === organization._id) {
        return activeAssignment._id;
      }
      throw new Error(
        "User already has an active lender organization assignment"
      );
    }
    const activeByEmail = await findAssignmentByEmailAndStatus(
      ctx,
      normalizedEmail,
      "active"
    );
    if (activeByEmail) {
      if (
        activeByEmail.lenderOrganizationId === organization._id &&
        activeByEmail.workosUserId === workosUserId
      ) {
        return activeByEmail._id;
      }
      throw new Error(
        "Email already has an active lender organization assignment"
      );
    }
    const [pendingByUser, pendingByEmail] = await Promise.all([
      findAssignmentByUserAndStatus(ctx, workosUserId, "pending"),
      findAssignmentByEmailAndStatus(ctx, normalizedEmail, "pending"),
    ]);
    if (
      pendingByUser &&
      pendingByEmail &&
      pendingByUser._id !== pendingByEmail._id
    ) {
      throw new Error("Pending lender organization assignment is ambiguous");
    }
    const pendingAssignment = pendingByUser ?? pendingByEmail;
    if (pendingAssignment) {
      if (pendingAssignment.lenderOrganizationId !== organization._id) {
        throw new Error(
          "User has a pending lender organization assignment for another organization"
        );
      }
      const now = Date.now();
      await ctx.db.patch(pendingAssignment._id, {
        decisionPermissions:
          roleSlugs.includes("lender") || roleSlugs.includes("lender-admin")
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
        normalizedEmail,
        status: "active",
        updatedAt: now,
        workosUserId,
      });
      await writeLenderAudit(ctx, brokerage, organization._id, {
        command: "assignLenderUser",
        entityId: workosUserId,
        entityType: "lenderOrganizationAssignment",
        eventType: "lender.organization.invitation.bound",
        newState: {
          assignmentId: pendingAssignment._id,
          email: user.email,
          roleSlugs,
        },
        reason,
      });
      return pendingAssignment._id;
    }
    const now = Date.now();
    const assignmentId = await ctx.db.insert("lenderOrganizationAssignments", {
      brokerageId: brokerage._id,
      lenderOrganizationId: organization._id,
      workosUserId,
      normalizedEmail,
      status: "active",
      assignedByWorkosUserId: ctx.viewer.subject,
      assignedByRole: primaryActorRole(ctx.viewer.roles),
      reason,
      decisionPermissions:
        roleSlugs.includes("lender") || roleSlugs.includes("lender-admin")
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
      assignedAt: now,
      updatedAt: now,
    });
    await writeLenderAudit(ctx, brokerage, organization._id, {
      command: "assignLenderUser",
      entityId: workosUserId,
      entityType: "lenderOrganizationAssignment",
      eventType: "lender.organization.user.assigned",
      newState: { assignmentId, email: user.email, roleSlugs },
      reason,
    });
    return assignmentId;
  })
  .public();

export const unassignLenderUser = adminMutation
  .input({
    assignmentId: v.id("lenderOrganizationAssignments"),
    reason: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Lender organization assignment not found");
    }
    const { brokerage, organization } = await resolveLenderOrganizationTarget(
      ctx,
      assignment.lenderOrganizationId
    );
    const reason = requireReason(args.reason);
    const now = Date.now();
    await deactivateLenderMemberImmediately(ctx, {
      actorRoles: ctx.viewer.roles,
      actorWorkosUserId: ctx.viewer.subject,
      assignment,
      brokerage,
      command: "unassignLenderUser",
      entityId: assignment.workosUserId ?? assignment.normalizedEmail,
      eventType: "lender.organization.user.unassigned",
      lenderOrganizationId: organization._id,
      newState: { status: "inactive" },
      now,
      priorState: { status: assignment.status },
      reason,
    });
    return null;
  })
  .public();

/**
 * WorkOS-first invite command. The invitation is sent to the shared WorkOS
 * organization before the pending app assignment is recorded. The pending
 * assignment becomes active only after projection reconciliation.
 */
export const inviteLenderUser = adminAction
  .input({
    lenderOrganizationId: v.id("lenderOrganizations"),
    email: v.string(),
    roleSlug: lenderRoleValidator,
    reason: v.string(),
  })
  .returns(acceptedInvitationValidator)
  .handler(
    async (
      ctx,
      args
    ): Promise<{
      adapter: "fake" | "workos";
      operation: "inviteLenderUser";
      status: "accepted";
      sync: "waiting-for-webhook";
      stagedAssignmentId: Id<"lenderOrganizationAssignments">;
      workosId?: string;
    }> => {
      const normalizedEmail = normalizeLenderEmail(args.email);
      if (!normalizedEmail.includes("@")) {
        throw new Error("A valid work email is required");
      }
      const target: {
        brokerageId: Id<"brokerages">;
        status: "active" | "inactive";
      } = await ctx.runQuery(
        internal.lenderOrganizations.resolveInvitationTarget,
        { lenderOrganizationId: args.lenderOrganizationId }
      );
      const reason = requireReason(args.reason);
      const result = await sendWorkosLenderInvitation({
        email: normalizedEmail,
        roleSlug: args.roleSlug,
      });
      const assignmentId: Id<"lenderOrganizationAssignments"> =
        await ctx.runMutation(
          internal.lenderOrganizations.stageInvitedLenderAssignment,
          {
            brokerageId: target.brokerageId,
            lenderOrganizationId: args.lenderOrganizationId,
            normalizedEmail,
            assignedByWorkosUserId: ctx.viewer.subject,
            assignedByRole: primaryActorRole(ctx.viewer.roles),
            reason,
            roleSlug: args.roleSlug,
            workosInvitationId: result.workosId,
          }
        );
      return {
        adapter: result.adapter,
        operation: "inviteLenderUser" as const,
        status: "accepted" as const,
        sync: "waiting-for-webhook" as const,
        stagedAssignmentId: assignmentId,
        ...(result.workosId ? { workosId: result.workosId } : {}),
      };
    }
  )
  .public();

export const reconcilePendingLenderAssignments = adminMutation
  .input({
    lenderOrganizationId: v.optional(v.id("lenderOrganizations")),
  })
  .returns(
    v.object({
      activated: v.number(),
      bound: v.number(),
      stillPending: v.number(),
      conflicts: v.number(),
    })
  )
  .handler(reconcilePendingLenderAssignmentsHandler)
  .public();

export const resolveInvitationTarget = internalQuery
  .input({ lenderOrganizationId: v.id("lenderOrganizations") })
  .returns(
    v.object({
      brokerageId: v.id("brokerages"),
      status: v.union(v.literal("active"), v.literal("inactive")),
    })
  )
  .handler(async (ctx, args) => {
    const { brokerage, organization } = await resolveLenderOrganizationTarget(
      ctx,
      args.lenderOrganizationId
    );
    if (organization.status !== "active") {
      throw new Error("Cannot invite into an inactive lender organization");
    }
    return { brokerageId: brokerage._id, status: organization.status };
  })
  .internal();

export const stageInvitedLenderAssignment = internalMutation
  .input({
    brokerageId: v.id("brokerages"),
    lenderOrganizationId: v.id("lenderOrganizations"),
    normalizedEmail: v.string(),
    assignedByWorkosUserId: v.string(),
    assignedByRole: v.string(),
    reason: v.string(),
    roleSlug: v.optional(lenderRoleValidator),
    workosInvitationId: v.optional(v.string()),
  })
  .returns(v.id("lenderOrganizationAssignments"))
  .handler(async (ctx, args) => {
    const { brokerage, organization } = await resolveLenderOrganizationTarget(
      ctx,
      args.lenderOrganizationId
    );
    if (
      brokerage._id !== args.brokerageId ||
      organization.status !== "active"
    ) {
      throw new Error("Lender invitation target changed before staging");
    }
    const activeByEmail = await findAssignmentByEmailAndStatus(
      ctx,
      args.normalizedEmail,
      "active"
    );
    if (activeByEmail) {
      throw new Error(
        "Email already has an active lender organization assignment"
      );
    }
    const existing = await findAssignmentByEmailAndStatus(
      ctx,
      args.normalizedEmail,
      "pending"
    );
    if (existing) {
      if (existing.lenderOrganizationId !== organization._id) {
        throw new Error(
          "Email already has a pending lender organization assignment"
        );
      }
      if (args.roleSlug && args.workosInvitationId) {
        await queueIdentityInvitationEmail(ctx, {
          brokerageId: brokerage._id,
          email: args.normalizedEmail,
          organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
          relatedEntityId: String(existing._id),
          relatedEntityType: "lenderOrganizationAssignment",
          roleSlug: args.roleSlug,
          workosInvitationId: args.workosInvitationId,
        });
      }
      return existing._id;
    }
    const now = Date.now();
    const assignmentId = await ctx.db.insert("lenderOrganizationAssignments", {
      brokerageId: brokerage._id,
      lenderOrganizationId: organization._id,
      normalizedEmail: args.normalizedEmail,
      status: "pending",
      assignedByWorkosUserId: args.assignedByWorkosUserId,
      assignedByRole: args.assignedByRole,
      reason: args.reason,
      decisionPermissions: {
        proposalReview: false,
        milestoneDecisions: false,
        drawDecisions: false,
      },
      decisionPermissionsVersion: 1,
      assignedAt: now,
      updatedAt: now,
    });
    if (args.roleSlug && args.workosInvitationId) {
      await queueIdentityInvitationEmail(ctx, {
        brokerageId: brokerage._id,
        email: args.normalizedEmail,
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        relatedEntityId: String(assignmentId),
        relatedEntityType: "lenderOrganizationAssignment",
        roleSlug: args.roleSlug,
        workosInvitationId: args.workosInvitationId,
      });
    }
    return assignmentId;
  })
  .internal();

const lenderMemberDeactivationPreparationValidator = v.object({
  assignmentId: v.id("lenderOrganizationAssignments"),
  membershipId: v.string(),
  state: v.union(
    v.literal("ready"),
    v.literal("accepted"),
    v.literal("reconciled")
  ),
  adapter: v.optional(v.union(v.literal("fake"), v.literal("workos"))),
  workosId: v.optional(v.string()),
});

export const beginLenderMemberDeactivation = internalMutation
  .input({
    actorRoles: v.array(v.string()),
    actorWorkosUserId: v.string(),
    assignmentId: v.id("lenderOrganizationAssignments"),
    idempotencyKey: v.string(),
    reason: v.string(),
  })
  .returns(lenderMemberDeactivationPreparationValidator)
  .handler(beginLenderMemberDeactivationApplication)
  .internal();

export const markLenderMemberDeactivationAccepted = internalMutation
  .input({
    adapter: v.union(v.literal("fake"), v.literal("workos")),
    assignmentId: v.id("lenderOrganizationAssignments"),
    idempotencyKey: v.string(),
    workosId: v.optional(v.string()),
  })
  .returns(v.null())
  .handler(markLenderMemberDeactivationAcceptedApplication)
  .internal();

export const markLenderMemberDeactivationFailed = internalMutation
  .input({
    assignmentId: v.id("lenderOrganizationAssignments"),
    error: v.string(),
    idempotencyKey: v.string(),
  })
  .returns(v.null())
  .handler(markLenderMemberDeactivationFailedApplication)
  .internal();
