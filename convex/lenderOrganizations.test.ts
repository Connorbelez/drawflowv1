/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "./fairLendConfig";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function asAdmin(t: ReturnType<typeof convexTest>, subject = "user_admin") {
  return t.withIdentity({
    email: `${subject}@example.com`,
    name: "DrawFlow Admin",
    organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
    role: "admin",
    roles: ["admin"],
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

function asLender(
  t: ReturnType<typeof convexTest>,
  subject = "user_lender",
  role: "lender" | "lender-admin" | "lender-staff" = "lender-admin",
) {
  return t.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
    role,
    roles: [role],
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

async function seedControlPlane(
  t: ReturnType<typeof convexTest>,
  options: { lenderRole?: "lender" | "lender-admin" | "lender-staff" } = {},
) {
  const lenderRole = options.lenderRole ?? "lender-admin";
  return await t.run(async (ctx) => {
    const now = Date.now();
    const brokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName: "Northstar Brokerage",
      legalName: "Northstar Brokerage Inc.",
      status: "active",
      updatedAt: now,
      workosOrganizationId: "org_northstar_brokerage",
    });
    const foreignBrokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName: "Foreign Brokerage",
      legalName: "Foreign Brokerage Inc.",
      status: "active",
      updatedAt: now,
      workosOrganizationId: "org_foreign_brokerage",
    });
    const lenderOrganizationId = await ctx.db.insert("lenderOrganizations", {
      brokerageId,
      createdAt: now,
      displayName: "Northstar Lender",
      legalName: "Northstar Lender Inc.",
      permissions: {
        drawDecisions: true,
        milestoneDecisions: true,
        proposalReview: true,
        siteVisitReview: true,
      },
      status: "active",
      updatedAt: now,
    });
    const foreignLenderOrganizationId = await ctx.db.insert(
      "lenderOrganizations",
      {
        brokerageId: foreignBrokerageId,
        createdAt: now,
        displayName: "Foreign Lender",
        legalName: "Foreign Lender Inc.",
        permissions: {
          drawDecisions: true,
          milestoneDecisions: true,
          proposalReview: true,
          siteVisitReview: true,
        },
        status: "active",
        updatedAt: now,
      },
    );

    for (const user of [
      {
        email: "admin@example.com",
        id: "user_admin",
        name: "DrawFlow Admin",
      },
      { email: "user_lender@example.com", id: "user_lender", name: "Lender Admin" },
      { email: "user_unassigned@example.com", id: "user_unassigned", name: "Unassigned Lender" },
      { email: "user_staff@example.com", id: "user_staff", name: "Lender Staff" },
    ]) {
      await ctx.db.insert("users", {
        authId: user.id,
        createdAt: now,
        email: user.email,
        emailVerified: true,
        name: user.name,
        sourceEventId: `test_${user.id}_created`,
        sourceEventType: "test.lenderOrganizations",
        status: "active",
        updatedAt: now,
        workosUserId: user.id,
      });
    }

    for (const membership of [
      { role: "lender-admin", userId: "user_admin" },
      { role: lenderRole, userId: "user_lender" },
      { role: "lender", userId: "user_unassigned" },
      { role: "lender-staff", userId: "user_staff" },
    ]) {
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        roleSlug: membership.role,
        roleSlugs: [membership.role],
        sourceEventId: `test_${membership.userId}_membership`,
        sourceEventType: "test.lenderOrganizations",
        status: "active",
        updatedAt: now,
        workosMembershipId: `om_${membership.userId}`,
        workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        workosUserId: membership.userId,
      });
    }

    return {
      brokerageId,
      foreignBrokerageId,
      foreignLenderOrganizationId,
      lenderOrganizationId,
    };
  });
}

describe("app-owned lender organization control plane", () => {
  test("provisions a child lender organization without creating a WorkOS organization", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    const beforeWorkosOrganizations = await t.run(async (ctx) =>
      (await ctx.db.query("workosOrganizations").collect()).length,
    );

    const createdId = await asAdmin(t).mutation(
      api.lenderOrganizations.provisionLenderOrganization,
      {
        brokerageId: seed.brokerageId,
        displayName: "Cedar Ridge Lending",
        legalName: "Cedar Ridge Lending Inc.",
        permissions: {
          drawDecisions: false,
          milestoneDecisions: true,
          proposalReview: true,
          siteVisitReview: false,
        },
      },
    );
    const created = await t.run((ctx) => ctx.db.get(createdId));
    expect(created).toMatchObject({
      brokerageId: seed.brokerageId,
      displayName: "Cedar Ridge Lending",
      permissions: {
        drawDecisions: false,
        milestoneDecisions: true,
        proposalReview: true,
        siteVisitReview: false,
      },
      status: "active",
    });
    expect(
      await t.run(async (ctx) => (await ctx.db.query("workosOrganizations").collect()).length),
    ).toBe(beforeWorkosOrganizations);
    await expect(
      asAdmin(t).mutation(api.lenderOrganizations.provisionLenderOrganization, {
        brokerageId: seed.brokerageId,
        displayName: "Cedar Ridge Lending",
        legalName: "Duplicate Cedar Ridge Lending Inc.",
        permissions: {
          drawDecisions: true,
          milestoneDecisions: true,
          proposalReview: true,
          siteVisitReview: true,
        },
      }),
    ).rejects.toThrow("already exists");
  });

  test("enforces one active application assignment and removes assigned users from the unassigned queue", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    const before = await asAdmin(t).query(
      api.lenderOrganizations.listUnassignedLenderUsers,
      {},
    );
    expect(before.users.map((user) => user.workosUserId)).toContain("user_unassigned");

    const assignmentId = await asAdmin(t).mutation(
      api.lenderOrganizations.assignLenderUser,
      {
        lenderOrganizationId: seed.lenderOrganizationId,
        reason: "Assign the lender to the Northstar application organization.",
        workosUserId: "user_unassigned",
      },
    );
    const after = await asAdmin(t).query(
      api.lenderOrganizations.listUnassignedLenderUsers,
      {},
    );
    expect(after.users.map((user) => user.workosUserId)).not.toContain("user_unassigned");
    expect(
      await asAdmin(t).query(api.lenderOrganizations.listLenderOrganizationMembersForAdmin, {
        lenderOrganizationId: seed.lenderOrganizationId,
      }),
    ).toMatchObject({
      members: [expect.objectContaining({ assignmentId, workosUserId: "user_unassigned" })],
    });
    await expect(
      asAdmin(t).mutation(api.lenderOrganizations.assignLenderUser, {
        lenderOrganizationId: seed.foreignLenderOrganizationId,
        reason: "Attempt a second application assignment.",
        workosUserId: "user_unassigned",
      }),
    ).rejects.toThrow("already has an active lender organization assignment");
  });

  test("returns a private empty application state when a lender has no active app assignment", async () => {
    const t = convexTest(schema, modules);
    await seedControlPlane(t);
    const result = await asLender(t).query(
      api.lenderOrganizations.getCurrentLenderOrganization,
      {},
    );
    expect(result.organization).toBeNull();
    expect(result.members).toEqual([]);
    expect(result.currentUser).toMatchObject({
      email: "user_lender@example.com",
      workosUserId: "user_lender",
    });
  });

  test("resolves only the assigned application organization and its assigned members", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    await asAdmin(t).mutation(api.lenderOrganizations.assignLenderUser, {
      lenderOrganizationId: seed.lenderOrganizationId,
      reason: "Attach the current lender to the application organization.",
      workosUserId: "user_lender",
    });
    await asAdmin(t).mutation(api.lenderOrganizations.assignLenderUser, {
      lenderOrganizationId: seed.lenderOrganizationId,
      reason: "Attach a second assigned lender for directory projection.",
      workosUserId: "user_unassigned",
    });

    const result = await asLender(t).query(
      api.lenderOrganizations.getCurrentLenderOrganization,
      {},
    );
    expect(result.organization).toMatchObject({
      id: seed.lenderOrganizationId,
      brokerageId: seed.brokerageId,
      brokerageName: "Northstar Brokerage",
      displayName: "Northstar Lender",
    });
    expect(result.members.map((member) => member.workosUserId).sort()).toEqual([
      "user_lender",
      "user_unassigned",
    ]);
    expect(result.members.every((member) => member.membershipStatus === "active")).toBe(
      true,
    );
  });

  test("reconciles a staged invitation only after user and shared membership projections exist", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("lenderOrganizationAssignments", {
        assignedAt: 1,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId: seed.brokerageId,
        lenderOrganizationId: seed.lenderOrganizationId,
        normalizedEmail: "pending@example.com",
        reason: "Stage before the WorkOS webhook arrives.",
        status: "pending",
        updatedAt: 1,
      });
    });

    await expect(
      asAdmin(t).mutation(api.lenderOrganizations.reconcilePendingLenderAssignments, {
        lenderOrganizationId: seed.lenderOrganizationId,
      }),
    ).resolves.toMatchObject({ activated: 0, stillPending: 1 });

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        authId: "user_pending",
        createdAt: 2,
        email: "pending@example.com",
        name: "Pending Lender",
        status: "active",
        updatedAt: 2,
        workosUserId: "user_pending",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: 2,
        roleSlug: "lender",
        roleSlugs: ["lender"],
        sourceEventId: "pending_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        updatedAt: 2,
        workosMembershipId: "om_user_pending",
        workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        workosUserId: "user_pending",
      });
    });
    const reconciled = await asAdmin(t).mutation(
      api.lenderOrganizations.reconcilePendingLenderAssignments,
      { lenderOrganizationId: seed.lenderOrganizationId },
    );
    expect(reconciled).toMatchObject({ activated: 1, conflicts: 0, stillPending: 0 });
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query("lenderOrganizationAssignments")
          .withIndex("by_normalized_email_and_status", (query) =>
            query.eq("normalizedEmail", "pending@example.com").eq("status", "active"),
          )
          .unique(),
      ),
    ).toMatchObject({ workosUserId: "user_pending", status: "active" });
  });

  test("caps workflow permissions and blocks final decisions for lender staff", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t, { lenderRole: "lender-staff" });
    await asAdmin(t).mutation(api.lenderOrganizations.assignLenderUser, {
      lenderOrganizationId: seed.lenderOrganizationId,
      reason: "Attach staff for policy-cap tests.",
      workosUserId: "user_lender",
    });
    await expect(
      asLender(t, "user_lender", "lender-staff").query(
        internal.authzTest.requireLenderOrganizationQuery,
        { permission: "draw_decisions" },
      ),
    ).rejects.toThrow(/final lender decision authority/);
    await asAdmin(t).mutation(api.lenderOrganizations.updateLenderOrganizationPermissions, {
      lenderOrganizationId: seed.lenderOrganizationId,
      permissions: {
        drawDecisions: false,
        milestoneDecisions: true,
        proposalReview: true,
        siteVisitReview: true,
      },
      reason: "Disable lender draw decisions for this organization.",
    });
    await expect(
      asLender(t, "user_lender", "lender-staff").query(
        internal.authzTest.requireLenderOrganizationQuery,
        { permission: "draw_decisions" },
      ),
    ).rejects.toThrow(/permission draw_decisions/);
  });

  test("allows an explicitly attached platform admin to bypass organization policy without bypassing target scope", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    await asAdmin(t).mutation(api.lenderOrganizations.assignLenderUser, {
      lenderOrganizationId: seed.lenderOrganizationId,
      reason: "Attach the platform admin to the target organization.",
      workosUserId: "user_admin",
    });
    await asAdmin(t).mutation(api.lenderOrganizations.updateLenderOrganizationPermissions, {
      lenderOrganizationId: seed.lenderOrganizationId,
      permissions: {
        drawDecisions: false,
        milestoneDecisions: false,
        proposalReview: false,
        siteVisitReview: false,
      },
      reason: "Exercise the platform admin bypass test.",
    });
    await expect(
      asAdmin(t).query(internal.authzTest.requireLenderOrganizationQuery, {
        lenderOrganizationId: seed.lenderOrganizationId,
        permission: "draw_decisions",
      }),
    ).resolves.toMatchObject({
      lenderOrganizationId: seed.lenderOrganizationId,
      roles: ["admin", "lender-admin"],
    });
    await expect(
      asAdmin(t).query(internal.authzTest.requireLenderOrganizationQuery, {
        lenderOrganizationId: seed.foreignLenderOrganizationId,
      }),
    ).rejects.toThrow("lender organization resource");
  });

  test("uses WorkOS-first invitations and keeps the app assignment pending until reconciliation", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    const beforeMemberships = await t.run(async (ctx) =>
      (await ctx.db.query("workosOrganizationMemberships").collect()).length,
    );
    const invitation = await asAdmin(t).action(api.lenderOrganizations.inviteLenderUser, {
      email: "invited@example.com",
      lenderOrganizationId: seed.lenderOrganizationId,
      reason: "Invite the lender through the shared WorkOS directory.",
      roleSlug: "lender-staff",
    });
    expect(invitation).toMatchObject({
      adapter: "fake",
      operation: "inviteLenderUser",
      status: "accepted",
      sync: "waiting-for-webhook",
    });
    expect(
      await t.run(async (ctx) =>
        (await ctx.db.query("workosOrganizationMemberships").collect()).length,
      ),
    ).toBe(beforeMemberships);
    expect(
      await t.run((ctx) => ctx.db.get(invitation.stagedAssignmentId)),
    ).toMatchObject({
      lenderOrganizationId: seed.lenderOrganizationId,
      normalizedEmail: "invited@example.com",
      status: "pending",
    });
  });

  test("manages shared WorkOS lender membership without optimistic projection writes", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    await asAdmin(t).mutation(api.lenderOrganizations.assignLenderUser, {
      lenderOrganizationId: seed.lenderOrganizationId,
      reason: "Attach the member for WorkOS command tests.",
      workosUserId: "user_lender",
    });

    const membershipBefore = await t.run(async (ctx) =>
      ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_workos_membership_id", (query) =>
          query.eq("workosMembershipId", "om_user_lender"),
        )
        .unique(),
    );
    await expect(
      asAdmin(t).action(api.workosManagement.updateSharedLenderMembershipRoles, {
        lenderOrganizationId: seed.lenderOrganizationId,
        membershipId: "om_user_lender",
        reason: "Grant the lender admin role.",
        roleSlug: "lender-admin",
      }),
    ).resolves.toMatchObject({
      operation: "updateMembershipRoles",
      status: "accepted",
      sync: "waiting-for-webhook",
    });
    await expect(
      asAdmin(t).action(api.workosManagement.deactivateSharedLenderMembership, {
        lenderOrganizationId: seed.lenderOrganizationId,
        membershipId: "om_user_lender",
        reason: "Remove the lender from the shared directory.",
      }),
    ).resolves.toMatchObject({
      operation: "deactivateMembership",
      status: "accepted",
      sync: "waiting-for-webhook",
    });

    const membershipAfter = await t.run(async (ctx) =>
      ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_workos_membership_id", (query) =>
          query.eq("workosMembershipId", "om_user_lender"),
        )
        .unique(),
    );
    expect(membershipAfter).toMatchObject({
      roleSlugs: membershipBefore?.roleSlugs,
      status: membershipBefore?.status,
    });
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (query) =>
            query
              .eq("entityType", "workosOrganizationMembership")
              .eq("entityId", "om_user_lender"),
          )
          .collect(),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lenderOrganizationId: seed.lenderOrganizationId,
          eventType: "workos.lender_membership.role_update.accepted",
        }),
        expect.objectContaining({
          lenderOrganizationId: seed.lenderOrganizationId,
          eventType: "workos.lender_membership.deactivation.accepted",
        }),
      ]),
    );
    await expect(
      asAdmin(t).action(api.workosManagement.updateSharedLenderMembershipRoles, {
        lenderOrganizationId: seed.foreignLenderOrganizationId,
        membershipId: "om_user_lender",
        reason: "Cross-organization target should be rejected.",
        roleSlug: "lender",
      }),
    ).rejects.toThrow(/assignment scope/);
  });
});
