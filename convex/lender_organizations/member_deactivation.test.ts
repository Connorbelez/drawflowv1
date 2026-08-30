/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "../fairLendConfig";
import {
  planImmediateLenderMemberDeactivation,
  planReconciledLenderMemberDeactivation,
} from "./member_deactivation";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

function asAdmin(t: ReturnType<typeof convexTest>) {
  return t.withIdentity({
    email: "admin@example.com",
    name: "DrawFlow Admin",
    organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
    role: "admin",
    roles: ["admin"],
    subject: "user_admin",
    tokenIdentifier: "https://api.workos.com/|user_admin",
  } as any);
}

function asLender(t: ReturnType<typeof convexTest>) {
  return t.withIdentity({
    email: "actor@example.com",
    name: "Lender Admin",
    organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
    role: "lender-admin",
    roles: ["lender-admin"],
    subject: "user_actor",
    tokenIdentifier: "https://api.workos.com/|user_actor",
  } as any);
}

async function seedOrganization(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const now = 10;
    const brokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName: "Northstar Brokerage",
      legalName: "Northstar Brokerage Inc.",
      status: "active",
      updatedAt: now,
      workosOrganizationId: "org_northstar_brokerage",
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
    const activeAssignmentId = await ctx.db.insert(
      "lenderOrganizationAssignments",
      {
        assignedAt: now,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId,
        lenderOrganizationId,
        normalizedEmail: "member@example.com",
        reason: "C1 test member",
        status: "active",
        updatedAt: now,
        workosUserId: "user_member",
      },
    );
    const pendingAssignmentId = await ctx.db.insert(
      "lenderOrganizationAssignments",
      {
        assignedAt: now,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId,
        lenderOrganizationId,
        normalizedEmail: "pending@example.com",
        reason: "C1 pending test member",
        status: "pending",
        updatedAt: now,
      },
    );
    return {
      activeAssignmentId,
      brokerageId,
      lenderOrganizationId,
      pendingAssignmentId,
    };
  });
}

describe("lender member deactivation application", () => {
  test("keeps the domain transition deterministic and distinguishes accepted reconciliation", () => {
    expect(
      planImmediateLenderMemberDeactivation({
        actorWorkosUserId: "user_admin",
        currentStatus: "active",
        now: 100,
      }),
    ).toEqual({
      status: "inactive",
      unassignedAt: 100,
      unassignedByWorkosUserId: "user_admin",
      updatedAt: 100,
    });
    expect(
      planImmediateLenderMemberDeactivation({
        actorWorkosUserId: "user_admin",
        currentStatus: "inactive",
        now: 100,
      }),
    ).toBeNull();
    expect(
      planReconciledLenderMemberDeactivation({
        currentStatus: "active",
        deactivationState: "accepted",
        now: 200,
        requestedByWorkosUserId: "user_admin",
      }),
    ).toEqual({
      deactivationState: "reconciled",
      reconciledAt: 200,
      status: "inactive",
      unassignedAt: 200,
      unassignedByWorkosUserId: "user_admin",
      updatedAt: 200,
    });
    expect(
      planReconciledLenderMemberDeactivation({
        currentStatus: "active",
        deactivationState: "requested",
        now: 200,
        requestedByWorkosUserId: "user_admin",
      }),
    ).toBeNull();
  });

  test("deactivates active assignments immediately with one canonical transition audit and leaves pending invitations alone", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedOrganization(t);

    await asAdmin(t).mutation(api.lenderOrganizations.setLenderOrganizationStatus, {
      lenderOrganizationId: seed.lenderOrganizationId,
      reason: "Close the lender organization immediately.",
      status: "inactive",
    });

    const rows = await t.run(async (ctx) => ({
      active: await ctx.db.get(seed.activeAssignmentId),
      pending: await ctx.db.get(seed.pendingAssignmentId),
      audits: await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "lenderOrganizationAssignment")
            .eq("entityId", String(seed.activeAssignmentId)),
        )
        .collect(),
      organization: await ctx.db.get(seed.lenderOrganizationId),
    }));

    expect(rows.organization?.status).toBe("inactive");
    expect(rows.active).toMatchObject({
      status: "inactive",
      unassignedByWorkosUserId: "user_admin",
    });
    expect(rows.pending?.status).toBe("pending");
    expect(rows.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType:
            "lender.organization.member_deactivation.organization_inactivated",
          reason: "Close the lender organization immediately.",
        }),
      ]),
    );
  });

  test("reconciles an accepted WorkOS command after organization shutdown already made the app assignment inactive", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedOrganization(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: 20,
        roleSlug: "lender",
        roleSlugs: ["lender"],
        sourceEventId: "c1-membership-created",
        sourceEventType: "test.c1",
        status: "active",
        updatedAt: 20,
        workosMembershipId: "om_member",
        workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        workosUserId: "user_member",
      });
      await ctx.db.patch(seed.activeAssignmentId, {
        deactivation: {
          acceptedAt: 30,
          adapter: "fake",
          idempotencyKey: "organization-shutdown-key",
          membershipId: "om_member",
          reason: "Remove the member from WorkOS.",
          requestedAt: 20,
          requestedByRole: "admin",
          requestedByRoles: ["admin"],
          requestedByWorkosUserId: "user_admin",
          state: "accepted",
          workosId: "om_member",
        },
      });
    });

    await asAdmin(t).mutation(api.lenderOrganizations.setLenderOrganizationStatus, {
      lenderOrganizationId: seed.lenderOrganizationId,
      reason: "Close the lender organization immediately.",
      status: "inactive",
    });
    expect(await t.run((ctx) => ctx.db.get(seed.activeAssignmentId))).toMatchObject({
      status: "inactive",
      deactivation: { state: "accepted" },
    });

    await t.mutation(internal.workosProjection.ingestWorkosEvent, {
      created_at: "2026-08-25T22:00:00.000Z",
      data: { id: "om_member" },
      event: "organization_membership.deleted",
      id: "c1-membership-deleted",
    });

    expect(await t.run((ctx) => ctx.db.get(seed.activeAssignmentId))).toMatchObject({
      status: "inactive",
      deactivation: { state: "reconciled", membershipId: "om_member" },
    });
  });

  test("rejects unauthenticated and cross-organization member deactivation", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedOrganization(t);
    const foreignAssignmentId = await t.run(async (ctx) => {
      const now = 20;
      await ctx.db.insert("users", {
        authId: "user_actor",
        createdAt: now,
        email: "actor@example.com",
        emailVerified: true,
        name: "Lender Admin",
        sourceEventId: "c1-actor-created",
        sourceEventType: "test.c1",
        status: "active",
        updatedAt: now,
        workosUserId: "user_actor",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        roleSlug: "lender-admin",
        roleSlugs: ["lender-admin"],
        sourceEventId: "c1-actor-membership",
        sourceEventType: "test.c1",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_actor",
        workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        workosUserId: "user_actor",
      });
      await ctx.db.insert("lenderOrganizationAssignments", {
        assignedAt: now,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId: seed.brokerageId,
        lenderOrganizationId: seed.lenderOrganizationId,
        normalizedEmail: "actor@example.com",
        reason: "C1 actor assignment",
        status: "active",
        updatedAt: now,
        workosUserId: "user_actor",
      });

      const foreignBrokerageId = await ctx.db.insert("brokerages", {
        createdAt: now,
        displayName: "Foreign Brokerage",
        legalName: "Foreign Brokerage Inc.",
        status: "active",
        updatedAt: now,
        workosOrganizationId: "org_foreign_brokerage",
      });
      const foreignOrganizationId = await ctx.db.insert("lenderOrganizations", {
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
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        roleSlug: "lender",
        roleSlugs: ["lender"],
        sourceEventId: "c1-foreign-membership",
        sourceEventType: "test.c1",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_foreign_member",
        workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        workosUserId: "user_foreign_member",
      });
      return await ctx.db.insert("lenderOrganizationAssignments", {
        assignedAt: now,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId: foreignBrokerageId,
        lenderOrganizationId: foreignOrganizationId,
        normalizedEmail: "foreign-member@example.com",
        reason: "C1 foreign assignment",
        status: "active",
        updatedAt: now,
        workosUserId: "user_foreign_member",
      });
    });

    await expect(
      t.action(api.workosManagement.deactivateSharedLenderMembership, {
        assignmentId: seed.activeAssignmentId,
        idempotencyKey: "unauthenticated-c1-key",
        reason: "Unauthenticated request must fail.",
      }),
    ).rejects.toThrow(/Unauthorized/);
    await expect(
      asLender(t).action(api.workosManagement.deactivateSharedLenderMembership, {
        assignmentId: foreignAssignmentId,
        idempotencyKey: "foreign-tenant-c1-key",
        reason: "Cross-organization request must fail.",
      }),
    ).rejects.toThrow(/same-organization|Forbidden/);
  });
});
