/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "./fairLendConfig";
import { listActiveLenderOrganizationMembers } from "./lenderOrganizationAccess";
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
  test("paginates the production organization and member directories without weakening admin scope", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 6; index += 1) {
        await ctx.db.insert("lenderOrganizations", {
          brokerageId: seed.brokerageId,
          createdAt: now + index,
          displayName: `Paged Lender ${index + 1}`,
          legalName: `Paged Lender ${index + 1} Inc.`,
          permissions: {
            drawDecisions: true,
            milestoneDecisions: true,
            proposalReview: true,
            siteVisitReview: true,
          },
          status: "active",
          updatedAt: now + index,
        });
      }
      for (let index = 0; index < 26; index += 1) {
        await ctx.db.insert("lenderOrganizationAssignments", {
          assignedAt: now + index,
          assignedByRole: "admin",
          assignedByWorkosUserId: "user_admin",
          brokerageId: seed.brokerageId,
          lenderOrganizationId: seed.lenderOrganizationId,
          normalizedEmail: `pending-${index}@example.com`,
          reason: "Exercise the bounded member directory cursor.",
          status: "pending",
          updatedAt: now + index,
        });
      }
    });
    const admin = asAdmin(t);
    const firstOrganizations = await admin.query(
      api.lenderOrganizations.listLenderOrganizations,
      {
        paginationOpts: { cursor: null, numItems: 5 },
        status: "active",
      },
    );
    expect(firstOrganizations.page).toHaveLength(5);
    expect(firstOrganizations.isDone).toBe(false);
    const secondOrganizations = await admin.query(
      api.lenderOrganizations.listLenderOrganizations,
      {
        paginationOpts: {
          cursor: firstOrganizations.continueCursor,
          numItems: 5,
        },
        status: "active",
      },
    );
    expect(secondOrganizations.page).toHaveLength(3);
    expect(secondOrganizations.isDone).toBe(true);
    expect(
      new Set(
        [...firstOrganizations.page, ...secondOrganizations.page].map(
          (organization) => organization.id,
        ),
      ).size,
    ).toBe(8);

    const firstMembers = await admin.query(
      api.lenderOrganizations.listLenderOrganizationMembersForAdmin,
      {
        lenderOrganizationId: seed.lenderOrganizationId,
        paginationOpts: { cursor: null, numItems: 25 },
      },
    );
    expect(firstMembers.page).toHaveLength(25);
    expect(firstMembers.isDone).toBe(false);
    const secondMembers = await admin.query(
      api.lenderOrganizations.listLenderOrganizationMembersForAdmin,
      {
        lenderOrganizationId: seed.lenderOrganizationId,
        paginationOpts: {
          cursor: firstMembers.continueCursor,
          numItems: 25,
        },
      },
    );
    expect(secondMembers.page).toHaveLength(1);
    expect(secondMembers.isDone).toBe(true);
    expect(
      [...firstMembers.page, ...secondMembers.page].every(
        (entry) => entry.kind === "pending_invitation",
      ),
    ).toBe(true);
    await expect(
      asLender(t).query(api.lenderOrganizations.listLenderOrganizations, {
        paginationOpts: { cursor: null, numItems: 5 },
      }),
    ).rejects.toThrow();
    await expect(
      admin.query(api.lenderOrganizations.listLenderOrganizations, {
        paginationOpts: { cursor: null, numItems: 6 },
      }),
    ).rejects.toThrow("page size must be between 1 and 5");
  });

  test("fails closed before notification recipient hydration exceeds its bounded organization batch", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("lenderOrganizationAssignments", {
          assignedAt: now + index,
          assignedByRole: "admin",
          assignedByWorkosUserId: "user_admin",
          brokerageId: seed.brokerageId,
          lenderOrganizationId: seed.lenderOrganizationId,
          normalizedEmail: `recipient-${index}@example.com`,
          reason: "Exercise recipient projection batch protection.",
          status: "active",
          updatedAt: now + index,
          workosUserId: `recipient-${index}`,
        });
      }
    });

    await expect(
      t.run((ctx) =>
        listActiveLenderOrganizationMembers(
          ctx,
          seed.lenderOrganizationId,
        )
      ),
    ).rejects.toThrow(
      "Lender organization active member count exceeds the safe limit",
    );
  });

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
    await expect(
      asAdmin(t).mutation(api.lenderOrganizations.assignLenderUser, {
        lenderOrganizationId: seed.lenderOrganizationId,
        reason: "   ",
        workosUserId: "user_unassigned",
      }),
    ).rejects.toThrow(/reason/i);

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
        paginationOpts: { cursor: null, numItems: 25 },
      }),
    ).toMatchObject({
      page: [
        {
          kind: "member",
          member: expect.objectContaining({
            assignmentId,
            workosUserId: "user_unassigned",
          }),
        },
      ],
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
    const members = await asLender(t).query(
      api.lenderOrganizations.listCurrentLenderOrganizationMembers,
      { paginationOpts: { cursor: null, numItems: 25 } },
    );
    expect(members.page.map((member) => member.workosUserId).sort()).toEqual([
      "user_lender",
      "user_unassigned",
    ]);
    expect(members.page.every((member) => member.membershipStatus === "active")).toBe(
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
      {
        lenderOrganizationId: seed.lenderOrganizationId,
        paginationOpts: { cursor: null, numItems: 25 },
      },
    );
    expect(firstOrganizationProjection.page).toEqual([
      {
        kind: "pending_invitation",
        pendingInvitation: expect.objectContaining({
          email: "ambiguous-pending@example.com",
          reconciliationReason: expect.stringContaining("multiple pending"),
          status: "conflict_rejected",
        }),
      },
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
    ).rejects.toThrow(/member decision permission/);
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
    const assignmentId = await asAdmin(t).mutation(
      api.lenderOrganizations.assignLenderUser,
      {
      lenderOrganizationId: seed.lenderOrganizationId,
      reason: "Attach the member for WorkOS command tests.",
      workosUserId: "user_lender",
      },
    );
    await asAdmin(t).mutation(api.lenderOrganizations.assignLenderUser, {
      lenderOrganizationId: seed.lenderOrganizationId,
      reason: "Keep a second active Lender Admin during deactivation.",
      workosUserId: "user_admin",
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
    const deactivationResult = await asAdmin(t).action(
      api.workosManagement.deactivateSharedLenderMembership,
      {
        assignmentId,
        idempotencyKey: "deactivate-user-lender-test",
        reason: "Remove the lender from the shared directory.",
      },
    );
    expect(deactivationResult).toMatchObject({
      operation: "deactivateSharedLenderMembership",
      status: "accepted",
      sync: "waiting-for-webhook",
    });
    await expect(
      asAdmin(t).action(api.workosManagement.deactivateSharedLenderMembership, {
        assignmentId,
        idempotencyKey: "deactivate-user-lender-test",
        reason: "Remove the lender from the shared directory.",
      }),
    ).resolves.toEqual(deactivationResult);

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
    const membershipAudit = await t.run(async (ctx) =>
        ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (query) =>
            query
              .eq("entityType", "workosOrganizationMembership")
              .eq("entityId", "om_user_lender"),
          )
          .collect(),
      );
    expect(membershipAudit).toEqual(
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
    expect(
      membershipAudit.filter(
        (event) =>
          event.eventType === "workos.lender_membership.deactivation.accepted",
      ),
    ).toHaveLength(1);
    await t.mutation(internal.workosProjection.ingestWorkosEvent, {
      id: "membership_deleted_after_lender_deactivation",
      event: "organization_membership.deleted",
      created_at: "2026-08-25T22:00:00.000Z",
      data: { id: "om_user_lender" },
    });
    expect(await t.run((ctx) => ctx.db.get(assignmentId))).toMatchObject({
      status: "inactive",
      deactivation: {
        idempotencyKey: "deactivate-user-lender-test",
        state: "reconciled",
      },
      unassignedByWorkosUserId: "user_admin",
    });
    expect(
      await t.run((ctx) =>
        listActiveLenderOrganizationMembers(ctx, seed.lenderOrganizationId),
      ),
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ workosUserId: "user_lender" }),
      ]),
    );
    await expect(
      asAdmin(t).action(api.workosManagement.updateSharedLenderMembershipRoles, {
        lenderOrganizationId: seed.foreignLenderOrganizationId,
        membershipId: "om_user_lender",
        reason: "Cross-organization target should be rejected.",
        roleSlug: "lender",
      }),
    ).rejects.toThrow(/membership scope|assignment scope/);
  });

  test("projects exact scoped WorkOS membership reconciliation state", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    const assignmentId = await asAdmin(t).mutation(
      api.lenderOrganizations.assignLenderUser,
      {
        lenderOrganizationId: seed.lenderOrganizationId,
        reason: "Attach the member for reconciliation projection coverage.",
        workosUserId: "user_lender",
      },
    );

    await expect(
      asAdmin(t).query(
        api.lenderOrganizations.getLenderMembershipReconciliation,
        {
          lenderOrganizationId: seed.lenderOrganizationId,
          membershipId: "om_user_lender",
        },
      ),
    ).resolves.toMatchObject({
      assignmentId,
      membershipId: "om_user_lender",
      membershipStatus: "active",
      roleSlugs: ["lender-admin"],
      workosUserId: "user_lender",
    });

    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_workos_membership_id", (query) =>
          query.eq("workosMembershipId", "om_user_lender"),
        )
        .unique();
      if (!membership) {
        throw new Error("Expected seeded lender membership");
      }
      await ctx.db.patch(membership._id, {
        roleSlug: "lender-admin",
        roleSlugs: ["lender-admin"],
        status: "inactive",
      });
    });

    await expect(
      asAdmin(t).query(
        api.lenderOrganizations.getLenderMembershipReconciliation,
        {
          lenderOrganizationId: seed.lenderOrganizationId,
          membershipId: "om_user_lender",
        },
      ),
    ).resolves.toMatchObject({
      assignmentId,
      membershipStatus: "inactive",
      roleSlugs: ["lender-admin"],
    });
    await expect(
      asAdmin(t).query(
        api.lenderOrganizations.getLenderMembershipReconciliation,
        {
          lenderOrganizationId: seed.foreignLenderOrganizationId,
          membershipId: "om_user_lender",
        },
      ),
    ).rejects.toThrow(/assignment scope/);
  });

  test("backfills every legacy member grant once with role and status defaults", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    const assignmentIds = await t.run(async (ctx) => {
      const now = Date.now();
      const activeLender = await ctx.db.insert("lenderOrganizationAssignments", {
        assignedAt: now,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId: seed.brokerageId,
        lenderOrganizationId: seed.lenderOrganizationId,
        normalizedEmail: "user_lender@example.com",
        reason: "Legacy active Lender assignment.",
        status: "active",
        updatedAt: now,
        workosUserId: "user_lender",
      });
      const activeStaff = await ctx.db.insert("lenderOrganizationAssignments", {
        assignedAt: now,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId: seed.brokerageId,
        lenderOrganizationId: seed.lenderOrganizationId,
        normalizedEmail: "user_staff@example.com",
        reason: "Legacy active Lender Staff assignment.",
        status: "active",
        updatedAt: now,
        workosUserId: "user_staff",
      });
      const pending = await ctx.db.insert("lenderOrganizationAssignments", {
        assignedAt: now,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId: seed.brokerageId,
        lenderOrganizationId: seed.lenderOrganizationId,
        normalizedEmail: "pending@example.com",
        reason: "Legacy pending assignment.",
        status: "pending",
        updatedAt: now,
      });
      return { activeLender, activeStaff, pending };
    });

    await expect(
      asAdmin(t).query(
        api.lenderOrganizations.getLenderMemberDecisionPermissionMigrationCoverage,
        {},
      ),
    ).resolves.toEqual({ complete: false, covered: 0, remaining: 3, total: 3 });

    for (let pass = 0; pass < 2; pass += 1) {
      let cursor: string | null = null;
      let isDone = false;
      while (!isDone) {
        const result: { continueCursor: string; isDone: boolean } =
          await t.mutation(
            internal.migrations.backfillLenderMemberDecisionPermissions,
            {
              batchSize: 2,
              cursor,
              dryRun: false,
              oneBatchOnly: true,
            },
          );
        cursor = result.continueCursor;
        isDone = result.isDone;
      }
    }

    await expect(
      asAdmin(t).query(
        api.lenderOrganizations.getLenderMemberDecisionPermissionMigrationCoverage,
        {},
      ),
    ).resolves.toEqual({ complete: true, covered: 3, remaining: 0, total: 3 });
    const assignments = await t.run(async (ctx) => ({
      activeLender: await ctx.db.get(assignmentIds.activeLender),
      activeStaff: await ctx.db.get(assignmentIds.activeStaff),
      pending: await ctx.db.get(assignmentIds.pending),
    }));
    expect(assignments.activeLender).toMatchObject({
      decisionPermissions: {
        drawDecisions: true,
        milestoneDecisions: true,
        proposalReview: true,
      },
      decisionPermissionsVersion: 1,
    });
    for (const assignment of [assignments.activeStaff, assignments.pending]) {
      expect(assignment).toMatchObject({
        decisionPermissions: {
          drawDecisions: false,
          milestoneDecisions: false,
          proposalReview: false,
        },
        decisionPermissionsVersion: 1,
      });
    }
  });

  test("rejects lender-admin self-deactivation and the last active administrator", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    const assignmentId = await asAdmin(t).mutation(
      api.lenderOrganizations.assignLenderUser,
      {
        lenderOrganizationId: seed.lenderOrganizationId,
        reason: "Attach the only active Lender Admin.",
        workosUserId: "user_lender",
      },
    );

    await expect(
      asLender(t).action(api.workosManagement.deactivateSharedLenderMembership, {
        assignmentId,
        idempotencyKey: "self-deactivate-lender-admin",
        reason: "This self-deactivation must be rejected.",
      }),
    ).rejects.toThrow(/cannot deactivate your own/i);
    await expect(
      asAdmin(t).action(api.workosManagement.deactivateSharedLenderMembership, {
        assignmentId,
        idempotencyKey: "last-lender-admin-target",
        reason: "This last-administrator operation must be rejected.",
      }),
    ).rejects.toThrow(/last active Lender Admin/i);
  });

  test("restores authority after a provider failure and retries the same lifecycle safely", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    const assignmentId = await asAdmin(t).mutation(
      api.lenderOrganizations.assignLenderUser,
      {
        lenderOrganizationId: seed.lenderOrganizationId,
        reason: "Attach the member used by provider retry coverage.",
        workosUserId: "user_lender",
      },
    );
    await asAdmin(t).mutation(api.lenderOrganizations.assignLenderUser, {
      lenderOrganizationId: seed.lenderOrganizationId,
      reason: "Keep another active Lender Admin during provider retry coverage.",
      workosUserId: "user_admin",
    });
    const command = {
      actorRoles: ["admin"],
      actorWorkosUserId: "user_admin",
      assignmentId,
      idempotencyKey: "provider-failure-retry-key",
      reason: "Exercise provider failure recovery without losing authority.",
    };

    await expect(
      t.mutation(internal.lenderOrganizations.beginLenderMemberDeactivation, command),
    ).resolves.toMatchObject({ state: "ready" });
    await t.mutation(
      internal.lenderOrganizations.markLenderMemberDeactivationFailed,
      {
        assignmentId,
        error: "Provider unavailable",
        idempotencyKey: command.idempotencyKey,
      },
    );
    await expect(
      t.run(async (ctx) =>
        (await listActiveLenderOrganizationMembers(ctx, seed.lenderOrganizationId))
          .map((member) => member.workosUserId),
      ),
    ).resolves.toContain("user_lender");

    await expect(
      t.mutation(internal.lenderOrganizations.beginLenderMemberDeactivation, command),
    ).resolves.toMatchObject({ state: "ready" });
    await t.mutation(
      internal.lenderOrganizations.markLenderMemberDeactivationAccepted,
      {
        adapter: "fake",
        assignmentId,
        idempotencyKey: command.idempotencyKey,
        workosId: "om_user_lender",
      },
    );
    await expect(
      t.run(async (ctx) =>
        (await listActiveLenderOrganizationMembers(ctx, seed.lenderOrganizationId))
          .map((member) => member.workosUserId),
      ),
    ).resolves.not.toContain("user_lender");
  });

  test("lets a same-organization Lender Admin version member grants while the organization cap stays authoritative", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    await asAdmin(t).mutation(api.lenderOrganizations.assignLenderUser, {
      lenderOrganizationId: seed.lenderOrganizationId,
      reason: "Attach the Lender Admin operator.",
      workosUserId: "user_lender",
    });
    const staffAssignmentId = await asAdmin(t).mutation(
      api.lenderOrganizations.assignLenderUser,
      {
        lenderOrganizationId: seed.lenderOrganizationId,
        reason: "Attach Lender Staff for grant management.",
        workosUserId: "user_staff",
      },
    );

    for (const permission of [
      "proposal_review",
      "milestone_decisions",
      "draw_decisions",
    ] as const) {
      await expect(
        asLender(t, "user_staff", "lender-staff").query(
          internal.authzTest.requireLenderOrganizationQuery,
          { permission },
        ),
      ).rejects.toThrow(new RegExp(`permission ${permission}`));
    }

    const granted = await asLender(t).mutation(
      api.lenderOrganizations.updateLenderMemberDecisionPermissions,
      {
        assignmentId: staffAssignmentId,
        expectedVersion: 1,
        permissions: {
          drawDecisions: true,
          milestoneDecisions: true,
          proposalReview: true,
        },
        reason: "Grant this reviewer all lender decision queues.",
      },
    );
    expect(granted).toEqual({
      decisionPermissions: {
        drawDecisions: true,
        milestoneDecisions: true,
        proposalReview: true,
      },
      decisionPermissionsVersion: 2,
      effectiveDecisionPermissions: {
        drawDecisions: true,
        milestoneDecisions: true,
        proposalReview: true,
      },
    });
    for (const permission of [
      "proposal_review",
      "milestone_decisions",
      "draw_decisions",
    ] as const) {
      await expect(
        asLender(t, "user_staff", "lender-staff").query(
          internal.authzTest.requireLenderOrganizationQuery,
          { permission },
        ),
      ).resolves.toMatchObject({ lenderOrganizationId: seed.lenderOrganizationId });
    }
    await expect(
      asLender(t).mutation(
        api.lenderOrganizations.updateLenderMemberDecisionPermissions,
        {
          assignmentId: staffAssignmentId,
          expectedVersion: 1,
          permissions: granted.decisionPermissions,
          reason: "This stale update must not overwrite the current version.",
        },
      ),
    ).rejects.toThrow(/Stale lender member permission version/);
    const revoked = await asLender(t).mutation(
      api.lenderOrganizations.updateLenderMemberDecisionPermissions,
      {
        assignmentId: staffAssignmentId,
        expectedVersion: 2,
        permissions: {
          drawDecisions: false,
          milestoneDecisions: false,
          proposalReview: false,
        },
        reason: "Revoke all decision queues for a temporary coverage change.",
      },
    );
    expect(revoked.decisionPermissionsVersion).toBe(3);
    for (const permission of [
      "proposal_review",
      "milestone_decisions",
      "draw_decisions",
    ] as const) {
      await expect(
        asLender(t, "user_staff", "lender-staff").query(
          internal.authzTest.requireLenderOrganizationQuery,
          { permission },
        ),
      ).rejects.toThrow(new RegExp(`permission ${permission}`));
    }
    const restored = await asLender(t).mutation(
      api.lenderOrganizations.updateLenderMemberDecisionPermissions,
      {
        assignmentId: staffAssignmentId,
        expectedVersion: 3,
        permissions: granted.decisionPermissions,
        reason: "Restore all decision queues after coverage resumes.",
      },
    );
    expect(restored.decisionPermissionsVersion).toBe(4);
    for (const permission of [
      "proposal_review",
      "milestone_decisions",
      "draw_decisions",
    ] as const) {
      await expect(
        asLender(t, "user_staff", "lender-staff").query(
          internal.authzTest.requireLenderOrganizationQuery,
          { permission },
        ),
      ).resolves.toMatchObject({ lenderOrganizationId: seed.lenderOrganizationId });
    }
    await asAdmin(t).mutation(
      api.lenderOrganizations.updateLenderOrganizationPermissions,
      {
        lenderOrganizationId: seed.lenderOrganizationId,
        permissions: {
          drawDecisions: false,
          milestoneDecisions: true,
          proposalReview: true,
          siteVisitReview: true,
        },
        reason: "Disable Draw decisions at the organization cap.",
      },
    );
    await expect(
      asLender(t, "user_staff", "lender-staff").query(
        internal.authzTest.requireLenderOrganizationQuery,
        { permission: "draw_decisions" },
      ),
    ).rejects.toThrow(/permission draw_decisions/);

    const audit = await t.run((ctx) =>
      ctx.db
        .query("auditEvents")
        .collect()
        .then((events) =>
          events.find(
            (event) =>
              event.eventType ===
              "lender.organization.member_decision_permissions.updated",
          ),
        ),
    );
    expect(audit).toMatchObject({
      actorRole: "lender-admin",
      actorWorkosUserId: "user_lender",
      entityId: staffAssignmentId,
      reason: "Grant this reviewer all lender decision queues.",
    });
    expect(audit?.priorState).toContain('"decisionPermissionsVersion":1');
    expect(audit?.newState).toContain('"decisionPermissionsVersion":2');
  });

  test("versions Back Office organization review defaults with optimistic concurrency and exact organization scope", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    const admin = asAdmin(t);
    const baseline = await admin.query(
      api.lenderOrganizationReviewPolicies
        .getLenderOrganizationDefaultReviewPolicy,
      { lenderOrganizationId: seed.lenderOrganizationId }
    );
    expect(baseline).toMatchObject({
      lenderOrganizationId: seed.lenderOrganizationId,
      provenance: "system_baseline",
      validationIssue: null,
      version: null,
    });
    await admin.mutation(api.lenderOrganizations.assignLenderUser, {
      lenderOrganizationId: seed.lenderOrganizationId,
      reason: "Make one lender approval-eligible for default validation.",
      workosUserId: "user_lender",
    });
    const version1 = await admin.mutation(
      api.lenderOrganizationReviewPolicies
        .saveLenderOrganizationDefaultReviewPolicy,
      {
        expectedVersion: null,
        idempotencyKey: "organization-default-v1",
        lenderOrganizationId: seed.lenderOrganizationId,
        policy: {
          drawApprovalMode: "both",
          drawLenderQuorum: 1,
          milestoneApprovalMode: "both",
          milestoneLenderQuorum: 1,
          milestoneReceiptInvoiceRequired: true,
          milestoneSiteVisitRequired: true,
        },
        reason: "Require Back Office and lender review for future assignments.",
      }
    );
    expect(version1).toMatchObject({
      configuredByWorkosUserId: "user_admin",
      provenance: "organization_default",
      validationIssue: null,
      version: 1,
    });
    const version2 = await admin.mutation(
      api.lenderOrganizationReviewPolicies
        .saveLenderOrganizationDefaultReviewPolicy,
      {
        expectedVersion: 1,
        idempotencyKey: "organization-default-v2",
        lenderOrganizationId: seed.lenderOrganizationId,
        policy: {
          ...version1.policy,
          milestoneReceiptInvoiceRequired: false,
        },
        reason: "Remove the receipt requirement for future assignments.",
      }
    );
    expect(version2.version).toBe(2);
    await expect(
      admin.mutation(
        api.lenderOrganizationReviewPolicies
          .saveLenderOrganizationDefaultReviewPolicy,
        {
          expectedVersion: 1,
          idempotencyKey: "organization-default-stale",
          lenderOrganizationId: seed.lenderOrganizationId,
          policy: {
            ...version2.policy,
            milestoneSiteVisitRequired: false,
          },
          reason: "This stale write must not commit.",
        }
      )
    ).rejects.toThrow("Stale organization review default");
    const foreign = await admin.query(
      api.lenderOrganizationReviewPolicies
        .getLenderOrganizationDefaultReviewPolicy,
      { lenderOrganizationId: seed.foreignLenderOrganizationId }
    );
    expect(foreign).toMatchObject({
      provenance: "system_baseline",
      version: null,
    });
    const rows = await t.run((ctx) =>
      ctx.db.query("lenderOrganizationReviewPolicyVersions").collect()
    );
    expect(rows).toHaveLength(2);
    expect(
      rows.every(
        (row) =>
          row.brokerageId === seed.brokerageId &&
          row.lenderOrganizationId === seed.lenderOrganizationId
      )
    ).toBe(true);
    await expect(
      asLender(t).mutation(
        api.lenderOrganizationReviewPolicies
          .saveLenderOrganizationDefaultReviewPolicy,
        {
          expectedVersion: 2,
          idempotencyKey: "organization-default-lender-denied",
          lenderOrganizationId: seed.lenderOrganizationId,
          policy: version2.policy,
          reason: "A lender must not own this policy.",
        }
      )
    ).rejects.toThrow();
    const builder = t.withIdentity({
      organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      role: "builder",
      roles: ["builder"],
      subject: "user_builder",
      tokenIdentifier: "test|user_builder",
    } as any);
    await expect(
      builder.query(
        api.lenderOrganizationReviewPolicies
          .getLenderOrganizationDefaultReviewPolicy,
        { lenderOrganizationId: seed.lenderOrganizationId }
      )
    ).rejects.toThrow();
  });

  test("rejects an unsatisfiable organization quorum default without partial writes", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedControlPlane(t);
    await expect(
      asAdmin(t).mutation(
        api.lenderOrganizationReviewPolicies
          .saveLenderOrganizationDefaultReviewPolicy,
        {
          expectedVersion: null,
          idempotencyKey: "organization-default-unsatisfiable",
          lenderOrganizationId: seed.lenderOrganizationId,
          policy: {
            drawApprovalMode: "lender_quorum",
            drawLenderQuorum: 1,
            milestoneApprovalMode: "backoffice_only",
            milestoneLenderQuorum: null,
            milestoneReceiptInvoiceRequired: false,
            milestoneSiteVisitRequired: false,
          },
          reason: "Reject this unsatisfiable default.",
        }
      )
    ).rejects.toThrow(/no active approval-eligible lender member/);
    expect(
      await t.run((ctx) =>
        ctx.db.query("lenderOrganizationReviewPolicyVersions").collect()
      )
    ).toEqual([]);
    expect(
      await t.run((ctx) =>
        ctx.db.query("auditEvents").collect().then((events) =>
          events.filter(
            (event) =>
              event.eventType ===
              "lender.organization.review_policy_default.saved"
          )
        )
      )
    ).toEqual([]);
  });
});
