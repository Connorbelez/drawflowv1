import { type Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  adminAction,
  adminMutation,
  adminQuery,
  authenticatedQuery,
} from "./authz";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "./fairLendConfig";
import { internalMutation, internalQuery } from "./fluent";
import {
  LENDER_ROLE_SLUGS,
  lenderCanMakeFinalDecision,
  listActiveSharedLenderMemberships,
  normalizeLenderEmail,
  normalizeLenderRoleSlugs,
  requireActiveLenderWorkosUser,
  resolveAssignedLenderOrganization,
  resolveLenderOrganizationTarget,
} from "./lenderOrganizationAccess";
import type { MutationCtx, QueryCtx } from "./types";
import { sendWorkosLenderInvitation } from "./workosManagement";

const lenderRoleValidator = v.union(
  v.literal("lender"),
  v.literal("lender-admin"),
  v.literal("lender-staff")
);

const lenderPermissionsValidator = v.object({
  proposalReview: v.boolean(),
  milestoneDecisions: v.boolean(),
  drawDecisions: v.boolean(),
  siteVisitReview: v.boolean(),
});

const lenderOrganizationValidator = v.object({
  id: v.id("lenderOrganizations"),
  brokerageId: v.id("brokerages"),
  brokerageName: v.string(),
  legalName: v.string(),
  displayName: v.string(),
  status: v.union(v.literal("active"), v.literal("inactive")),
  permissions: lenderPermissionsValidator,
  memberCount: v.number(),
  pendingCount: v.number(),
  updatedAt: v.number(),
});

const brokerageOptionValidator = v.object({
  id: v.id("brokerages"),
  displayName: v.string(),
});

const lenderMemberValidator = v.object({
  assignmentId: v.id("lenderOrganizationAssignments"),
  membershipId: v.optional(v.string()),
  userId: v.id("users"),
  workosUserId: v.string(),
  name: v.string(),
  email: v.string(),
  profilePictureUrl: v.optional(v.string()),
  roleSlugs: v.array(v.string()),
  assignmentStatus: v.union(v.literal("active"), v.literal("pending")),
  membershipStatus: v.literal("active"),
  canMakeFinalDecision: v.boolean(),
});

const unassignedUserValidator = v.object({
  userId: v.id("users"),
  workosUserId: v.string(),
  name: v.string(),
  email: v.string(),
  profilePictureUrl: v.optional(v.string()),
  membershipId: v.string(),
  roleSlugs: v.array(v.string()),
});

const pendingInvitationValidator = v.object({
  assignmentId: v.id("lenderOrganizationAssignments"),
  email: v.string(),
  status: v.union(v.literal("pending"), v.literal("conflict_rejected")),
  assignedAt: v.number(),
  reconciledAt: v.optional(v.number()),
  reconciliationReason: v.optional(v.string()),
});

const acceptedInvitationValidator = v.object({
  adapter: v.union(v.literal("fake"), v.literal("workos")),
  operation: v.literal("inviteLenderUser"),
  status: v.literal("accepted"),
  sync: v.literal("waiting-for-webhook"),
  stagedAssignmentId: v.id("lenderOrganizationAssignments"),
  workosId: v.optional(v.string()),
});

export const listLenderOrganizations = adminQuery
  .input({
    search: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
  })
  .returns(
    v.object({
      brokerages: v.array(brokerageOptionValidator),
      organizations: v.array(lenderOrganizationValidator),
      sharedWorkosOrganizationId: v.string(),
    })
  )
  .handler(async (ctx, args) => {
    const organizations = args.status
      ? await ctx.db
          .query("lenderOrganizations")
          .withIndex("by_status", (query) => query.eq("status", args.status!))
          .take(501)
      : await ctx.db.query("lenderOrganizations").take(501);
    if (organizations.length > 500) {
      throw new Error("Lender organization directory exceeds the safe limit");
    }

    const brokerages = await ctx.db
      .query("brokerages")
      .withIndex("by_status", (query) => query.eq("status", "active"))
      .take(501);
    if (brokerages.length > 500) {
      throw new Error("Brokerage directory exceeds the safe limit");
    }
    const brokerageById = new Map(
      brokerages.map((brokerage) => [brokerage._id, brokerage])
    );
    const normalizedSearch = args.search?.trim().toLowerCase() ?? "";

    const rows = [];
    for (const organization of organizations) {
      const brokerage = brokerageById.get(organization.brokerageId);
      if (!brokerage) {
        continue;
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
        continue;
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
      rows.push({
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
      });
    }

    rows.sort((left, right) =>
      left.displayName.localeCompare(right.displayName)
    );
    return {
      brokerages: brokerages.map((brokerage) => ({
        id: brokerage._id,
        displayName: brokerage.displayName,
      })),
      organizations: rows,
      sharedWorkosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
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
    const users = [];
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
  .input({ lenderOrganizationId: v.id("lenderOrganizations") })
  .returns(
    v.object({
      members: v.array(lenderMemberValidator),
      pendingInvitations: v.array(pendingInvitationValidator),
    })
  )
  .handler(async (ctx, args) => {
    await resolveLenderOrganizationTarget(ctx, args.lenderOrganizationId);
    const assignments = await ctx.db
      .query("lenderOrganizationAssignments")
      .withIndex("by_lender_organization", (query) =>
        query.eq("lenderOrganizationId", args.lenderOrganizationId)
      )
      .take(501);
    if (assignments.length > 500) {
      throw new Error("Lender organization membership limit exceeded");
    }
    const members: Infer<typeof lenderMemberValidator>[] = [];
    const pendingInvitations: Infer<typeof pendingInvitationValidator>[] = [];
    for (const assignment of assignments) {
      if (assignment.status === "pending") {
        pendingInvitations.push({
          assignmentId: assignment._id,
          email: assignment.normalizedEmail,
          status: "pending" as const,
          assignedAt: assignment.assignedAt,
        });
        continue;
      }
      if (
        assignment.status === "inactive" &&
        assignment.reconciliationOutcome === "conflict_rejected"
      ) {
        pendingInvitations.push({
          assignmentId: assignment._id,
          assignedAt: assignment.assignedAt,
          email: assignment.normalizedEmail,
          reconciledAt: assignment.reconciledAt,
          reconciliationReason:
            assignment.reconciliationReason ??
            "Invitation reconciliation requires Back Office review.",
          status: "conflict_rejected" as const,
        });
        continue;
      }
      if (assignment.status !== "active" || !assignment.workosUserId) {
        continue;
      }
      const userRows = await ctx.db
        .query("users")
        .withIndex("by_workos_user_id", (query) =>
          query.eq("workosUserId", assignment.workosUserId!)
        )
        .take(2);
      const user = userRows.length === 1 ? userRows[0] : null;
      if (!user || user.status !== "active") {
        continue;
      }
      const memberships = await listActiveSharedLenderMemberships(
        ctx,
        assignment.workosUserId
      );
      if (memberships.length === 0) {
        continue;
      }
      const roleSlugs = normalizeLenderRoleSlugs(
        memberships.flatMap((membership) => [
          membership.roleSlug,
          ...membership.roleSlugs,
        ])
      );
      const membership = memberships[0];
      members.push({
        assignmentId: assignment._id,
        membershipId: membership?.workosMembershipId,
        userId: user._id,
        workosUserId: assignment.workosUserId,
        name: user.name || user.email,
        email: user.email,
        ...(user.profilePictureUrl
          ? { profilePictureUrl: user.profilePictureUrl }
          : {}),
        roleSlugs,
        assignmentStatus: "active" as const,
        membershipStatus: "active" as const,
        canMakeFinalDecision: lenderCanMakeFinalDecision(roleSlugs),
      });
    }
    members.sort((left, right) => left.name.localeCompare(right.name));
    pendingInvitations.sort(
      (left, right) => right.assignedAt - left.assignedAt
    );
    return { members, pendingInvitations };
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
        })
      ),
      members: v.array(lenderMemberValidator),
    })
  )
  .handler(async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    const workosUserId = identity.subject.trim();
    const user = await requireActiveLenderWorkosUser(ctx, workosUserId);
    const currentUser = {
      userId: user._id,
      workosUserId,
      name: user.name || user.email,
      email: user.email,
      ...(user.profilePictureUrl
        ? { profilePictureUrl: user.profilePictureUrl }
        : {}),
    };
    const memberships = await listActiveSharedLenderMemberships(
      ctx,
      workosUserId
    );
    if (memberships.length === 0) {
      return { currentUser, organization: null, members: [] };
    }
    const activeAssignments = await ctx.db
      .query("lenderOrganizationAssignments")
      .withIndex("by_workos_user_and_status", (query) =>
        query.eq("workosUserId", workosUserId).eq("status", "active")
      )
      .take(3);
    if (activeAssignments.length === 0) {
      return { currentUser, organization: null, members: [] };
    }
    const resolution = await resolveAssignedLenderOrganization(ctx, identity, {
      allowPlatformAdminWithoutLenderRole: true,
    });
    const memberAssignments = await ctx.db
      .query("lenderOrganizationAssignments")
      .withIndex("by_lender_organization_and_status", (query) =>
        query
          .eq("lenderOrganizationId", resolution.organization._id)
          .eq("status", "active")
      )
      .take(501);
    if (memberAssignments.length > 500) {
      throw new Error("Lender organization membership limit exceeded");
    }
    const members = [];
    for (const assignment of memberAssignments) {
      if (!assignment.workosUserId) {
        continue;
      }
      const memberUserRows = await ctx.db
        .query("users")
        .withIndex("by_workos_user_id", (query) =>
          query.eq("workosUserId", assignment.workosUserId!)
        )
        .take(2);
      const memberUser = memberUserRows.length === 1 ? memberUserRows[0] : null;
      if (!memberUser || memberUser.status !== "active") {
        continue;
      }
      const memberMemberships = await listActiveSharedLenderMemberships(
        ctx,
        assignment.workosUserId
      );
      if (memberMemberships.length === 0) {
        continue;
      }
      const roleSlugs = normalizeLenderRoleSlugs(
        memberMemberships.flatMap((membership) => [
          membership.roleSlug,
          ...membership.roleSlugs,
        ])
      );
      members.push({
        assignmentId: assignment._id,
        userId: memberUser._id,
        workosUserId: assignment.workosUserId,
        name: memberUser.name || memberUser.email,
        email: memberUser.email,
        ...(memberUser.profilePictureUrl
          ? { profilePictureUrl: memberUser.profilePictureUrl }
          : {}),
        roleSlugs,
        assignmentStatus: "active" as const,
        membershipStatus: "active" as const,
        canMakeFinalDecision: lenderCanMakeFinalDecision(roleSlugs),
      });
    }
    members.sort((left, right) => left.name.localeCompare(right.name));
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
      },
      members,
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
    await ctx.db.patch(organization._id, {
      status: args.status,
      updatedAt: Date.now(),
    });
    if (args.status === "inactive") {
      const assignments = await ctx.db
        .query("lenderOrganizationAssignments")
        .withIndex("by_lender_organization_and_status", (query) =>
          query
            .eq("lenderOrganizationId", organization._id)
            .eq("status", "active")
        )
        .take(501);
      if (assignments.length > 500) {
        throw new Error("Lender organization membership limit exceeded");
      }
      const now = Date.now();
      for (const assignment of assignments) {
        await ctx.db.patch(assignment._id, {
          status: "inactive",
          updatedAt: now,
          unassignedAt: now,
          unassignedByWorkosUserId: ctx.viewer.subject,
        });
      }
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
      (candidate) =>
        normalizeLenderEmail(candidate.email) === normalizedEmail,
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
    await ctx.db.patch(assignment._id, {
      status: "inactive",
      updatedAt: now,
      unassignedAt: now,
      unassignedByWorkosUserId: ctx.viewer.subject,
    });
    await writeLenderAudit(ctx, brokerage, organization._id, {
      command: "unassignLenderUser",
      entityId: assignment.workosUserId ?? assignment.normalizedEmail,
      entityType: "lenderOrganizationAssignment",
      eventType: "lender.organization.user.unassigned",
      priorState: { status: assignment.status },
      newState: { status: "inactive" },
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
  .handler(async (ctx, args) => {
    const pending = args.lenderOrganizationId
      ? await ctx.db
          .query("lenderOrganizationAssignments")
          .withIndex("by_lender_organization_and_status", (query) =>
            query
              .eq("lenderOrganizationId", args.lenderOrganizationId!)
              .eq("status", "pending")
          )
          .take(501)
      : await ctx.db
          .query("lenderOrganizationAssignments")
          .withIndex("by_status", (query) => query.eq("status", "pending"))
          .take(501);
    if (pending.length > 500) {
      throw new Error("Pending lender assignment queue exceeds the safe limit");
    }
    let activated = 0;
    let bound = 0;
    let stillPending = 0;
    let conflicts = 0;
    const now = Date.now();
    const ambiguousPendingEmails = new Set<string>();
    for (const assignment of pending) {
      const sameEmail = await ctx.db
        .query("lenderOrganizationAssignments")
        .withIndex("by_normalized_email_and_status", (query) =>
          query.eq("normalizedEmail", assignment.normalizedEmail).eq("status", "pending"),
        )
        .take(2);
      if (sameEmail.length > 1) ambiguousPendingEmails.add(assignment.normalizedEmail);
    }
    const activeUsersByNormalizedEmail = new Map<string, Doc<"users">[]>();
    for (const user of await listActiveWorkosUserEmailProjectionSnapshot(ctx)) {
      const normalizedEmail = normalizeLenderEmail(user.email);
      const users = activeUsersByNormalizedEmail.get(normalizedEmail) ?? [];
      users.push(user);
      activeUsersByNormalizedEmail.set(normalizedEmail, users);
    }
    for (const assignment of pending) {
      if (ambiguousPendingEmails.has(assignment.normalizedEmail)) {
        await ctx.db.patch(assignment._id, {
          reconciledAt: now,
          reconciliationOutcome: "conflict_rejected",
          reconciliationReason:
            "The normalized email matches multiple pending Lender Organization invitations.",
          status: "inactive",
          updatedAt: now,
        });
        conflicts += 1;
        continue;
      }
      const activeUsers = activeUsersByNormalizedEmail.get(
        assignment.normalizedEmail,
      ) ?? [];
      if (activeUsers.length > 1) {
        await ctx.db.patch(assignment._id, {
          reconciledAt: now,
          reconciliationOutcome: "conflict_rejected",
          reconciliationReason:
            "The normalized email matches multiple active WorkOS user projections.",
          status: "inactive",
          updatedAt: now,
        });
        conflicts += 1;
        continue;
      }
      const user = activeUsers[0];
      if (!user?.workosUserId) {
        stillPending += 1;
        continue;
      }
      const memberships = await listActiveSharedLenderMemberships(
        ctx,
        user.workosUserId
      );
      const roleSlugs = normalizeLenderRoleSlugs(
        memberships.flatMap((membership) => [
          membership.roleSlug,
          ...membership.roleSlugs,
        ])
      );
      if (memberships.length === 0 || roleSlugs.length === 0) {
        stillPending += 1;
        continue;
      }
      const activeAssignment = await findAssignmentByUserAndStatus(
        ctx,
        user.workosUserId,
        "active"
      );
      if (activeAssignment && activeAssignment._id !== assignment._id) {
        const compatible =
          activeAssignment.lenderOrganizationId ===
            assignment.lenderOrganizationId &&
          activeAssignment.normalizedEmail === assignment.normalizedEmail;
        await ctx.db.patch(assignment._id, {
          reconciledAt: now,
          reconciledToAssignmentId: activeAssignment._id,
          reconciliationOutcome: compatible ? "bound" : "conflict_rejected",
          reconciliationReason: compatible
            ? undefined
            : "The WorkOS user already has an active assignment in a different Lender Organization.",
          status: "inactive",
          updatedAt: now,
          workosUserId: user.workosUserId,
        });
        if (compatible) {
          bound += 1;
        } else {
          conflicts += 1;
        }
        continue;
      }
      const otherPending = await findAssignmentByUserAndStatus(
        ctx,
        user.workosUserId,
        "pending"
      );
      if (otherPending && otherPending._id !== assignment._id) {
        await ctx.db.patch(assignment._id, {
          reconciledAt: now,
          reconciledToAssignmentId: otherPending._id,
          reconciliationOutcome:
            otherPending.lenderOrganizationId ===
              assignment.lenderOrganizationId &&
            otherPending.normalizedEmail === assignment.normalizedEmail
              ? "bound"
              : "conflict_rejected",
          reconciliationReason:
            otherPending.lenderOrganizationId ===
                assignment.lenderOrganizationId &&
              otherPending.normalizedEmail === assignment.normalizedEmail
              ? undefined
              : "The WorkOS user is already linked to a different pending Lender Organization invitation.",
          status: "inactive",
          updatedAt: now,
          workosUserId: user.workosUserId,
        });
        if (
          otherPending.lenderOrganizationId === assignment.lenderOrganizationId &&
          otherPending.normalizedEmail === assignment.normalizedEmail
        ) bound += 1;
        else conflicts += 1;
        continue;
      }
      const [activeEmailAssignments, pendingEmailAssignments] =
        await Promise.all([
          ctx.db
            .query("lenderOrganizationAssignments")
            .withIndex("by_normalized_email_and_status", (query) =>
              query
                .eq("normalizedEmail", assignment.normalizedEmail)
                .eq("status", "active"),
            )
            .take(2),
          ctx.db
            .query("lenderOrganizationAssignments")
            .withIndex("by_normalized_email_and_status", (query) =>
              query
                .eq("normalizedEmail", assignment.normalizedEmail)
                .eq("status", "pending"),
            )
            .take(2),
        ]);
      const emailCollision =
        activeEmailAssignments[0] ??
        pendingEmailAssignments.find(
          (candidate) => candidate._id !== assignment._id,
        );
      if (emailCollision) {
        await ctx.db.patch(assignment._id, {
          reconciledAt: now,
          reconciledToAssignmentId: emailCollision._id,
          reconciliationOutcome: "conflict_rejected",
          reconciliationReason:
            emailCollision.status === "active"
              ? "The normalized email already has an active assignment owned by another WorkOS identity."
              : "The normalized email already has another pending assignment owned by another WorkOS identity.",
          status: "inactive",
          updatedAt: now,
          workosUserId: user.workosUserId,
        });
        conflicts += 1;
        continue;
      }
      await ctx.db.patch(assignment._id, {
        workosUserId: user.workosUserId,
        status: "active",
        updatedAt: now,
      });
      activated += 1;
    }
    return { activated, bound, stillPending, conflicts };
  })
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
      assignedAt: now,
      updatedAt: now,
    });
    return assignmentId;
  })
  .internal();

async function findAssignmentByUserAndStatus(
  ctx: { db: QueryCtx["db"] | MutationCtx["db"] },
  workosUserId: string,
  status: "active" | "pending"
) {
  return await ctx.db
    .query("lenderOrganizationAssignments")
    .withIndex("by_workos_user_and_status", (query) =>
      query.eq("workosUserId", workosUserId).eq("status", status)
    )
    .take(2)
    .then((rows) => {
      if (rows.length > 1) {
        throw new Error("Lender organization assignment is ambiguous");
      }
      return rows[0] ?? null;
    });
}

const NORMALIZED_WORKOS_USER_COMPATIBILITY_LIMIT = 500;

/**
 * Compatibility read used while users.by_normalized_email is staged and its
 * optional key is being backfilled. It scans one bounded projection snapshot
 * and fails closed above the established directory boundary instead of
 * performing an incomplete case-sensitive match. After the staged index is
 * ready and made queryable, this helper can switch to indexed equality reads.
 */
async function listActiveWorkosUserEmailProjectionSnapshot(
  ctx: { db: QueryCtx["db"] | MutationCtx["db"] },
): Promise<Doc<"users">[]> {
  const users = await ctx.db
    .query("users")
    .take(NORMALIZED_WORKOS_USER_COMPATIBILITY_LIMIT + 1);
  if (users.length > NORMALIZED_WORKOS_USER_COMPATIBILITY_LIMIT) {
    throw new Error(
      "Normalized WorkOS user email lookup requires the staged email-index backfill before the directory exceeds 500 records",
    );
  }
  return users.filter(
    (user) => user.status === "active" && Boolean(user.workosUserId),
  );
}

async function findAssignmentByEmailAndStatus(
  ctx: { db: QueryCtx["db"] | MutationCtx["db"] },
  normalizedEmail: string,
  status: "active" | "pending"
) {
  return await ctx.db
    .query("lenderOrganizationAssignments")
    .withIndex("by_normalized_email_and_status", (query) =>
      query.eq("normalizedEmail", normalizedEmail).eq("status", status)
    )
    .take(2)
    .then((rows) => {
      if (rows.length > 1) {
        throw new Error("Lender organization email assignment is ambiguous");
      }
      return rows[0] ?? null;
    });
}

function requireName(value: string, label: string): string {
  const name = value.trim();
  if (!name) {
    throw new Error(`${label} is required`);
  }
  return name;
}

function requireReason(value: string): string {
  const reason = value.trim();
  if (!reason) {
    throw new Error(
      "A reason is required for lender organization control-plane changes"
    );
  }
  return reason;
}

function primaryActorRole(
  roles: readonly string[]
):
  | "admin"
  | "principle-broker"
  | "broker"
  | "builder"
  | "broker-staff"
  | "builder-staff"
  | "homeowner"
  | "contractor"
  | "lender"
  | "lender-admin"
  | "lender-staff" {
  const supported = [
    "admin",
    "principle-broker",
    "broker",
    "builder",
    "broker-staff",
    "builder-staff",
    "homeowner",
    "contractor",
    "lender",
    "lender-admin",
    "lender-staff",
  ] as const;
  return supported.find((role) => roles.includes(role)) ?? "admin";
}

async function writeLenderAudit(
  ctx: { db: MutationCtx["db"]; viewer: { subject: string; roles: string[] } },
  brokerage: { _id: Id<"brokerages">; workosOrganizationId: string },
  lenderOrganizationId: Id<"lenderOrganizations">,
  input: {
    command: string;
    entityId?: string;
    entityType: string;
    eventType: string;
    newState: unknown;
    priorState?: unknown;
    reason: string;
  }
) {
  const now = Date.now();
  await ctx.db.insert("auditEvents", {
    actorRole: primaryActorRole(ctx.viewer.roles),
    actorRoles: ctx.viewer.roles,
    actorWorkosUserId: ctx.viewer.subject,
    brokerageId: brokerage._id,
    lenderOrganizationId,
    command: input.command,
    entityId: input.entityId ?? String(lenderOrganizationId),
    entityType: input.entityType,
    eventType: input.eventType,
    newState: JSON.stringify(input.newState),
    organizationId: brokerage.workosOrganizationId,
    ...(input.priorState === undefined
      ? {}
      : { priorState: JSON.stringify(input.priorState) }),
    reason: input.reason,
    reconciliationKey: `${input.command}:${String(lenderOrganizationId)}:${now}`,
    warnings: [],
    createdAt: now,
  });
}

export { LENDER_ROLE_SLUGS };
