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

  test("rejects cross-organization pending-email ambiguity without granting either organization", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      for (const lenderOrganizationId of [seed.lenderOrganizationId, seed.foreignLenderOrganizationId]) {
        await ctx.db.insert("lenderOrganizationAssignments", {
          assignedAt: now,
          assignedByRole: "admin",
          assignedByWorkosUserId: "user_admin",
          brokerageId: seed.brokerageId,
          lenderOrganizationId,
          normalizedEmail: "ambiguous-pending@example.com",
          reason: "Exercise cross-organization invitation ambiguity.",
          status: "pending",
          updatedAt: now,
        });
      }
      await ctx.db.insert("users", {
        authId: "user_ambiguous_pending",
        createdAt: now,
        email: "ambiguous-pending@example.com",
        name: "Ambiguous Pending User",
        status: "active",
        updatedAt: now,
        workosUserId: "user_ambiguous_pending",
      });
    });
    const result = await asAdmin(t).mutation(
      api.lenderOrganizations.reconcilePendingLenderAssignments,
      {},
    );
    expect(result).toEqual({ activated: 0, bound: 0, conflicts: 2, stillPending: 0 });
    const rows = await t.run((ctx) => ctx.db.query("lenderOrganizationAssignments")
      .withIndex("by_normalized_email_and_status", (query) => query.eq("normalizedEmail", "ambiguous-pending@example.com").eq("status", "inactive"))
      .collect());
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.reconciliationOutcome === "conflict_rejected" && row.reconciledAt === row.updatedAt)).toBe(true);
    const firstOrganizationProjection = await asAdmin(t).query(
      api.lenderOrganizations.listLenderOrganizationMembersForAdmin,
      { lenderOrganizationId: seed.lenderOrganizationId },
    );
    expect(firstOrganizationProjection.pendingInvitations).toEqual([
      expect.objectContaining({
        email: "ambiguous-pending@example.com",
        reconciliationReason: expect.stringContaining("multiple pending"),
        status: "conflict_rejected",
      }),
    ]);
  });

  test("rejects duplicate active email projections instead of selecting the first identity", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("lenderOrganizationAssignments", {
        assignedAt: now,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId: seed.brokerageId,
        lenderOrganizationId: seed.lenderOrganizationId,
        normalizedEmail: "duplicate-user@example.com",
        reason: "Exercise duplicate user projection ambiguity.",
        status: "pending",
        updatedAt: now,
      });
      for (const suffix of ["a", "b"]) {
        const workosUserId = `user_duplicate_${suffix}`;
        await ctx.db.insert("users", {
          authId: workosUserId,
          createdAt: now,
          email: "duplicate-user@example.com",
          name: `Duplicate ${suffix}`,
          status: "active",
          updatedAt: now,
          workosUserId,
        });
      }
    });
    const result = await asAdmin(t).mutation(
      api.lenderOrganizations.reconcilePendingLenderAssignments,
      { lenderOrganizationId: seed.lenderOrganizationId },
    );
    expect(result).toEqual({ activated: 0, bound: 0, conflicts: 1, stillPending: 0 });
    const active = await t.run((ctx) => ctx.db.query("lenderOrganizationAssignments")
      .withIndex("by_lender_organization_and_status", (query) => query.eq("lenderOrganizationId", seed.lenderOrganizationId).eq("status", "active"))
      .collect());
    expect(active).toEqual([]);
  });

  test("rejects reconciliation when a different WorkOS identity already owns the normalized email", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    const fixture = await t.run(async (ctx) => {
      const now = Date.now();
      const activeAssignmentId = await ctx.db.insert(
        "lenderOrganizationAssignments",
        {
          assignedAt: now - 1,
          assignedByRole: "admin",
          assignedByWorkosUserId: "user_admin",
          brokerageId: seed.foreignBrokerageId,
          lenderOrganizationId: seed.foreignLenderOrganizationId,
          normalizedEmail: "legacy-email-owner@example.com",
          reason: "Represent malformed legacy ownership by another identity.",
          status: "active",
          updatedAt: now - 1,
          workosUserId: "user_legacy_email_owner",
        },
      );
      const pendingAssignmentId = await ctx.db.insert(
        "lenderOrganizationAssignments",
        {
          assignedAt: now,
          assignedByRole: "admin",
          assignedByWorkosUserId: "user_admin",
          brokerageId: seed.brokerageId,
          lenderOrganizationId: seed.lenderOrganizationId,
          normalizedEmail: "legacy-email-owner@example.com",
          reason: "Reconcile only if normalized email ownership is unique.",
          status: "pending",
          updatedAt: now,
        },
      );
      await ctx.db.insert("users", {
        authId: "user_new_email_owner",
        createdAt: now,
        email: "legacy-email-owner@example.com",
        name: "New Projected Email Owner",
        status: "active",
        updatedAt: now,
        workosUserId: "user_new_email_owner",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        roleSlug: "lender",
        roleSlugs: ["lender"],
        sourceEventId: "legacy_email_owner_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_user_new_email_owner",
        workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        workosUserId: "user_new_email_owner",
      });
      return { activeAssignmentId, pendingAssignmentId };
    });

    await expect(
      asAdmin(t).mutation(
        api.lenderOrganizations.reconcilePendingLenderAssignments,
        { lenderOrganizationId: seed.lenderOrganizationId },
      ),
    ).resolves.toEqual({
      activated: 0,
      bound: 0,
      conflicts: 1,
      stillPending: 0,
    });
    const pending = await t.run((ctx) =>
      ctx.db.get(fixture.pendingAssignmentId),
    );
    expect(pending).toMatchObject({
      reconciledToAssignmentId: fixture.activeAssignmentId,
      reconciliationOutcome: "conflict_rejected",
      reconciliationReason: expect.stringContaining("normalized email"),
      status: "inactive",
      workosUserId: "user_new_email_owner",
    });
    const activeForEmail = await t.run((ctx) =>
      ctx.db
        .query("lenderOrganizationAssignments")
        .withIndex("by_normalized_email_and_status", (query) =>
          query
            .eq("normalizedEmail", "legacy-email-owner@example.com")
            .eq("status", "active"),
        )
        .collect(),
    );
    expect(activeForEmail.map((assignment) => assignment._id)).toEqual([
      fixture.activeAssignmentId,
    ]);
  });

  test("rejects mixed-case normalized email ambiguity for direct assignment and reconciliation", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        authId: "user_unassigned_case_duplicate",
        createdAt: now,
        email: "User_Unassigned@Example.com",
        name: "Mixed Case Duplicate",
        status: "active",
        updatedAt: now,
        workosUserId: "user_unassigned_case_duplicate",
      });
    });
    await expect(
      asAdmin(t).mutation(api.lenderOrganizations.assignLenderUser, {
        lenderOrganizationId: seed.lenderOrganizationId,
        reason: "Reject a normalized email collision before direct assignment.",
        workosUserId: "user_unassigned",
      }),
    ).rejects.toThrow("Active lender email projection is ambiguous");

    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("lenderOrganizationAssignments", {
        assignedAt: now,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId: seed.brokerageId,
        lenderOrganizationId: seed.lenderOrganizationId,
        normalizedEmail: "mixed-pending@example.com",
        reason: "Exercise normalized pending reconciliation ambiguity.",
        status: "pending",
        updatedAt: now,
      });
      for (const [suffix, email] of [
        ["lower", "mixed-pending@example.com"],
        ["upper", "Mixed-Pending@Example.com"],
      ] as const) {
        await ctx.db.insert("users", {
          authId: `user_mixed_pending_${suffix}`,
          createdAt: now,
          email,
          name: `Mixed Pending ${suffix}`,
          status: "active",
          updatedAt: now,
          workosUserId: `user_mixed_pending_${suffix}`,
        });
      }
    });
    await expect(
      asAdmin(t).mutation(api.lenderOrganizations.reconcilePendingLenderAssignments, {
        lenderOrganizationId: seed.lenderOrganizationId,
      }),
    ).resolves.toEqual({ activated: 0, bound: 0, conflicts: 1, stillPending: 0 });
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

  test("binds a compatible email invitation during direct assignment without creating a collision", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    const invitation = await asAdmin(t).action(
      api.lenderOrganizations.inviteLenderUser,
      {
        email: "user_unassigned@example.com",
        lenderOrganizationId: seed.lenderOrganizationId,
        reason: "Stage the pending assignment before projection reconciliation.",
        roleSlug: "lender",
      },
    );
    const assignmentId = await asAdmin(t).mutation(
      api.lenderOrganizations.assignLenderUser,
      {
        lenderOrganizationId: seed.lenderOrganizationId,
        reason: "Bind the projected user to the compatible invitation.",
        workosUserId: "user_unassigned",
      },
    );
    expect(assignmentId).toBe(invitation.stagedAssignmentId);
    expect(await t.run((ctx) => ctx.db.get(assignmentId))).toMatchObject({
      lenderOrganizationId: seed.lenderOrganizationId,
      normalizedEmail: "user_unassigned@example.com",
      status: "active",
      workosUserId: "user_unassigned",
    });
    const activeOrPending = await t.run(async (ctx) => {
      const [active, pending] = await Promise.all([
        ctx.db
          .query("lenderOrganizationAssignments")
          .withIndex("by_normalized_email_and_status", (query) =>
            query
              .eq("normalizedEmail", "user_unassigned@example.com")
              .eq("status", "active"),
          )
          .take(3),
        ctx.db
          .query("lenderOrganizationAssignments")
          .withIndex("by_normalized_email_and_status", (query) =>
            query
              .eq("normalizedEmail", "user_unassigned@example.com")
              .eq("status", "pending"),
          )
          .take(3),
      ]);
      return [...active, ...pending];
    });
    expect(activeOrPending).toHaveLength(1);
  });

  test("rejects a direct assignment that conflicts with a pending invitation in another organization", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    await asAdmin(t).action(api.lenderOrganizations.inviteLenderUser, {
      email: "user_unassigned@example.com",
      lenderOrganizationId: seed.lenderOrganizationId,
      reason: "Stage the authoritative pending organization.",
      roleSlug: "lender",
    });
    await expect(
      asAdmin(t).mutation(api.lenderOrganizations.assignLenderUser, {
        lenderOrganizationId: seed.foreignLenderOrganizationId,
        reason: "Do not cross-bind a pending invitation.",
        workosUserId: "user_unassigned",
      }),
    ).rejects.toThrow(
      "pending lender organization assignment for another organization",
    );
  });

  test("serializes direct assignment and pending reconciliation into one active record", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    const invitation = await asAdmin(t).action(
      api.lenderOrganizations.inviteLenderUser,
      {
        email: "user_unassigned@example.com",
        lenderOrganizationId: seed.lenderOrganizationId,
        reason: "Stage the assignment used by the reconciliation race.",
        roleSlug: "lender",
      },
    );
    const outcomes = await Promise.allSettled([
      asAdmin(t).mutation(api.lenderOrganizations.assignLenderUser, {
        lenderOrganizationId: seed.lenderOrganizationId,
        reason: "Race direct assignment against reconciliation.",
        workosUserId: "user_unassigned",
      }),
      asAdmin(t).mutation(
        api.lenderOrganizations.reconcilePendingLenderAssignments,
        { lenderOrganizationId: seed.lenderOrganizationId },
      ),
    ]);
    expect(outcomes.some((outcome) => outcome.status === "fulfilled")).toBe(true);
    const rows = await t.run(async (ctx) => {
      const active = await ctx.db
        .query("lenderOrganizationAssignments")
        .withIndex("by_normalized_email_and_status", (query) =>
          query
            .eq("normalizedEmail", "user_unassigned@example.com")
            .eq("status", "active"),
        )
        .take(3);
      const pending = await ctx.db
        .query("lenderOrganizationAssignments")
        .withIndex("by_normalized_email_and_status", (query) =>
          query
            .eq("normalizedEmail", "user_unassigned@example.com")
            .eq("status", "pending"),
        )
        .take(3);
      return { active, pending };
    });
    expect(rows.pending).toEqual([]);
    expect(rows.active).toHaveLength(1);
    expect(rows.active[0]).toMatchObject({
      _id: invitation.stagedAssignmentId,
      workosUserId: "user_unassigned",
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
