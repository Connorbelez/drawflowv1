/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "./fairLendConfig";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function asLender(t: ReturnType<typeof convexTest>, subject = "user_lender") {
  return t.withIdentity({
    email: `${subject}@example.com`,
    name: "Lender Admin",
    organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
    role: "lender-admin",
    roles: ["lender-admin"],
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

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

async function seedBackofficePortfolio(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const brokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName: "Northstar Brokerage",
      legalName: "Northstar Brokerage Inc.",
      status: "active",
      updatedAt: now,
      workosOrganizationId: "org_northstar",
    });
    const foreignBrokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName: "Foreign Brokerage",
      legalName: "Foreign Brokerage Inc.",
      status: "active",
      updatedAt: now,
      workosOrganizationId: "org_foreign",
    });
    const unavailableBrokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName: "Unavailable Brokerage",
      legalName: "Unavailable Brokerage Inc.",
      status: "inactive",
      updatedAt: now,
      workosOrganizationId: "org_unavailable",
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
    const otherLenderOrganizationId = await ctx.db.insert(
      "lenderOrganizations",
      {
        brokerageId,
        createdAt: now,
        displayName: "Other Northstar Lender",
        legalName: "Other Northstar Lender Inc.",
        permissions: {
          drawDecisions: true,
          milestoneDecisions: true,
          proposalReview: true,
          siteVisitReview: true,
        },
        status: "active",
        updatedAt: now,
      }
    );
    const unavailableLenderOrganizationId = await ctx.db.insert(
      "lenderOrganizations",
      {
        brokerageId: unavailableBrokerageId,
        createdAt: now,
        displayName: "Unavailable Lender",
        legalName: "Unavailable Lender Inc.",
        permissions: {
          drawDecisions: true,
          milestoneDecisions: true,
          proposalReview: true,
          siteVisitReview: true,
        },
        status: "active",
        updatedAt: now,
      }
    );

    await ctx.db.insert("users", {
      authId: "user_member",
      createdAt: now,
      email: "member@northstar.example.com",
      emailVerified: true,
      name: "Northstar Member",
      sourceEventId: "portfolio_member_created",
      sourceEventType: "test.lender_portal",
      status: "active",
      updatedAt: now,
      workosUserId: "user_member",
    });
    await ctx.db.insert("workosOrganizationMemberships", {
      createdAt: now,
      roleSlug: "lender-admin",
      roleSlugs: ["lender-admin"],
      sourceEventId: "portfolio_member_membership",
      sourceEventType: "test.lender_portal",
      status: "active",
      updatedAt: now,
      workosMembershipId: "om_portfolio_member",
      workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      workosUserId: "user_member",
    });
    await ctx.db.insert("lenderOrganizationAssignments", {
      assignedAt: now,
      assignedByRole: "admin",
      assignedByWorkosUserId: "user_admin",
      brokerageId,
      lenderOrganizationId,
      normalizedEmail: "member@northstar.example.com",
      reason: "Portfolio member fixture",
      status: "active",
      updatedAt: now,
      workosUserId: "user_member",
    });

    const workflowRuleId = await ctx.db.insert("workflowRules", {
      allowPermitWaiverByRoles: ["admin"],
      brokerageId,
      createdAt: now,
      organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      proposalStates: ["draft", "submitted", "approved", "closed"],
      requirePermitForApproval: false,
      ruleKey: "portfolio-fixture",
      settings: {},
      status: "active",
      updatedAt: now,
      version: 1,
    });

    async function insertProposal(name: string, proposalBrokerageId = brokerageId) {
      const proposalId = await ctx.db.insert("buildProposals", {
        brokerageId: proposalBrokerageId,
        buildName: name,
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 50_000_000,
        createdAt: now,
        createdByWorkosUserId: "user_admin",
        interestAnnualBps: 925,
        lenderDrawPolicyLimitCents: 100_000_000,
        location: "Toronto, ON",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        reviewOutcome: "approved",
        status: "approved",
        totalBudgetCents: 125_000_000,
        updatedAt: now,
        updatedByWorkosUserId: "user_admin",
      });
      const workflowRuleSnapshotId = await ctx.db.insert("workflowRuleSnapshots", {
        allowPermitWaiverByRoles: ["admin"],
        brokerageId: proposalBrokerageId,
        createdAt: now,
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        proposalId,
        proposalStates: ["draft", "submitted", "approved", "closed"],
        requirePermitForApproval: false,
        ruleKey: "portfolio-fixture",
        settings: {},
        version: 1,
        workflowRuleId,
      });
      return { proposalId, workflowRuleSnapshotId };
    }

    const current = await insertProposal("Current Assigned Proposal");
    const withdrawn = await insertProposal("Withdrawn Proposal");
    const history = await insertProposal("Latest Assignment Wins");
    const other = await insertProposal("Other Organization Proposal");
    const crossBrokerage = await insertProposal(
      "Cross Brokerage Proposal",
      foreignBrokerageId
    );

    const buildId = await ctx.db.insert("activeBuilds", {
      brokerageId,
      buildName: "Current Assigned Build",
      builderProfileId: await ctx.db.insert("builderProfiles", {
        brokerageId,
        createdAt: now,
        displayName: "Northstar Builder",
        legalName: "Northstar Builder Inc.",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        status: "active",
        updatedAt: now,
      }),
      createdAt: now,
      location: "Toronto, ON",
      organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      proposalId: current.proposalId,
      startDate: "2026-08-01",
      status: "active",
      totalBudgetCents: 125_000_000,
      updatedAt: now,
      workflowRuleSnapshotId: current.workflowRuleSnapshotId,
    });
    await ctx.db.patch(current.proposalId, { activeBuildId: buildId });

    const withdrawnBuildId = await ctx.db.insert("activeBuilds", {
      brokerageId,
      buildName: "Withdrawn Build Must Stay Hidden",
      builderProfileId: (await ctx.db.query("builderProfiles").take(1))[0]!._id,
      createdAt: now,
      location: "Toronto, ON",
      organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      proposalId: withdrawn.proposalId,
      startDate: "2026-08-01",
      status: "active",
      totalBudgetCents: 125_000_000,
      updatedAt: now,
      workflowRuleSnapshotId: withdrawn.workflowRuleSnapshotId,
    });
    await ctx.db.patch(withdrawn.proposalId, { activeBuildId: withdrawnBuildId });

    async function assign(
      proposalId: typeof current.proposalId,
      targetLenderOrganizationId: typeof lenderOrganizationId,
      assignedAt: number,
      status: "current" | "withdrawn",
      lenderBrokerageId = brokerageId
    ) {
      return ctx.db.insert("proposalLenderAssignments", {
        assignedAt,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId: lenderBrokerageId,
        createdAt: assignedAt,
        lenderBrokerageId,
        lenderOrganizationId: targetLenderOrganizationId,
        lenderOrganizationName: "Northstar Lender",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        proposalId,
        status,
        ...(status === "withdrawn" ? { withdrawnAt: assignedAt + 1 } : {}),
      });
    }

    await assign(current.proposalId, lenderOrganizationId, now + 40, "current");
    await assign(withdrawn.proposalId, lenderOrganizationId, now + 30, "withdrawn");
    await assign(history.proposalId, lenderOrganizationId, now + 10, "withdrawn");
    await assign(history.proposalId, lenderOrganizationId, now + 20, "current");
    await assign(other.proposalId, otherLenderOrganizationId, now + 50, "current");
    await assign(
      crossBrokerage.proposalId,
      lenderOrganizationId,
      now + 60,
      "current",
      foreignBrokerageId
    );

    return {
      lenderOrganizationId,
      unavailableLenderOrganizationId,
      currentProposalId: current.proposalId,
      historyProposalId: history.proposalId,
      withdrawnProposalId: withdrawn.proposalId,
      buildId,
    };
  });
}

describe("lender portal dashboard projection", () => {
  test("projects assigned portfolio and review actions from canonical records", async () => {
    const t = convexTest(schema, modules);
    const seed = await t.run(async (ctx) => {
      const now = Date.now();
      const brokerageId = await ctx.db.insert("brokerages", {
        createdAt: now,
        displayName: "Northstar Brokerage",
        legalName: "Northstar Brokerage Inc.",
        status: "active",
        updatedAt: now,
        workosOrganizationId: "org_northstar",
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
      await ctx.db.insert("users", {
        authId: "user_lender",
        createdAt: now,
        email: "user_lender@example.com",
        emailVerified: true,
        name: "Lender Admin",
        sourceEventId: "dashboard_user_created",
        sourceEventType: "test.lender_portal",
        status: "active",
        updatedAt: now,
        workosUserId: "user_lender",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        roleSlug: "lender-admin",
        roleSlugs: ["lender-admin"],
        sourceEventId: "dashboard_membership_created",
        sourceEventType: "test.lender_portal",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_dashboard_lender",
        workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        workosUserId: "user_lender",
      });
      const assignmentId = await ctx.db.insert("lenderOrganizationAssignments", {
        assignedAt: now,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId,
        lenderOrganizationId,
        normalizedEmail: "user_lender@example.com",
        reason: "Dashboard projection fixture",
        status: "active",
        updatedAt: now,
        workosUserId: "user_lender",
      });
      const builderProfileId = await ctx.db.insert("builderProfiles", {
        brokerageId,
        createdAt: now,
        displayName: "Northstar Builder",
        legalName: "Northstar Builder Inc.",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        status: "active",
        updatedAt: now,
      });
      const workflowRuleId = await ctx.db.insert("workflowRules", {
        allowPermitWaiverByRoles: ["admin"],
        brokerageId,
        createdAt: now,
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        proposalStates: ["draft", "submitted", "approved", "closed"],
        requirePermitForApproval: false,
        ruleKey: "dashboard-fixture",
        settings: {},
        status: "active",
        updatedAt: now,
        version: 1,
      });
      const proposalId = await ctx.db.insert("buildProposals", {
        brokerageId,
        buildName: "Harbourline Residences",
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 50_000_000,
        createdAt: now,
        createdByWorkosUserId: "user_admin",
        interestAnnualBps: 925,
        lenderDrawPolicyLimitCents: 100_000_000,
        location: "Hamilton, ON",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        reviewOutcome: "approved",
        status: "approved",
        totalBudgetCents: 125_000_000,
        updatedAt: now,
        updatedByWorkosUserId: "user_admin",
        builderProfileId,
      });
      const workflowRuleSnapshotId = await ctx.db.insert(
        "workflowRuleSnapshots",
        {
          brokerageId,
          createdAt: now,
          organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
          proposalId,
          requirePermitForApproval: false,
          allowPermitWaiverByRoles: ["admin"],
          proposalStates: ["draft", "submitted", "approved", "closed"],
          ruleKey: "dashboard-fixture",
          settings: {},
          version: 1,
          workflowRuleId,
        }
      );
      const buildId = await ctx.db.insert("activeBuilds", {
        brokerageId,
        buildName: "Harbourline Residences",
        builderProfileId,
        createdAt: now,
        location: "Hamilton, ON",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        proposalId,
        startDate: "2026-08-01",
        status: "active",
        totalBudgetCents: 125_000_000,
        updatedAt: now,
        workflowRuleSnapshotId,
      });
      await ctx.db.patch(proposalId, { activeBuildId: buildId });
      await ctx.db.insert("proposalLenderAssignments", {
        assignedAt: now,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId,
        createdAt: now,
        lenderBrokerageId: brokerageId,
        lenderOrganizationId,
        lenderOrganizationName: "Northstar Lender",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        proposalId,
        status: "current",
      });
      await ctx.db.insert("loanFacilities", {
        brokerageId,
        buildId,
        createdAt: now,
        interestAnnualBps: 925,
        interestStartsOn: "funds_released",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        principalCents: 100_000_000,
        proposalId,
        status: "active",
        updatedAt: now,
      });
      await ctx.db.insert("capitalEvents", {
        amountCents: 25_000_000,
        brokerageId,
        buildId,
        createdAt: now,
        eventDate: "2026-08-15",
        eventType: "draw_release",
        label: "Draw 01 release",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      });
      const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
        brokerageId,
        createdAt: now,
        dayEnd: 30,
        dayStart: 1,
        dependencyKeys: [],
        drawAvailabilityCents: 20_000_000,
        durationDays: 30,
        name: "Foundation",
        order: 1,
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        proposalId,
        budgetCents: 30_000_000,
        updatedAt: now,
        key: "foundation",
      });
      await ctx.db.insert("buildMilestones", {
        brokerageId,
        buildId,
        completionClaim: { status: "submitted" },
        createdAt: now,
        dayEnd: 30,
        dayStart: 1,
        dependencyKeys: [],
        drawAvailabilityCents: 20_000_000,
        durationDays: 30,
        name: "Foundation",
        order: 1,
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        progressPercent: 35,
        proposalMilestoneId,
        reviewDecisionState: "ready_for_approval",
        status: "in_progress",
        updatedAt: now,
        key: "foundation",
        budgetCents: 30_000_000,
      });
      await ctx.db.insert("activeBuildDrawRequests", {
        amountCents: 10_000_000,
        brokerageId,
        buildId,
        clientOperationId: "dashboard-draw-01",
        createdAt: now,
        displayId: "DRAW-01",
        label: "Draw 01",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        requestKey: "draw-01",
        requestedAt: "2026-08-15T00:00:00.000Z",
        requestedByWorkosUserId: "user_admin",
        status: "in_review",
        updatedAt: now,
      });

      return { assignmentId, buildId, lenderOrganizationId, proposalId };
    });

    const dashboard = await asLender(t).query(
      api.lender_portal.getLenderDashboard,
      {}
    );

    expect(dashboard.stats).toEqual({
      activeBuildCount: 1,
      assignedProposalCount: 1,
      releasedCents: 25_000_000,
      totalFacilityCents: 100_000_000,
    });
    expect(dashboard.builds[0]).toMatchObject({
      buildId: seed.buildId,
      buildName: "Harbourline Residences",
      facilityCents: 100_000_000,
      location: "Hamilton, ON",
      progressPercent: 35,
      releasedCents: 25_000_000,
      status: "needs_action",
    });
    expect(dashboard.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "Proposal",
          title: "Harbourline Residences",
          fact: "Lender confirmation required",
        }),
        expect.objectContaining({
          type: "Milestone",
          title: "Harbourline Residences · Foundation",
          fact: "Lender decision required",
        }),
        expect.objectContaining({
          type: "Draw",
          title: "Harbourline Residences · Draw 01",
          amountCents: 10_000_000,
        }),
      ])
    );
  });

  test("lets Platform Admin read one organization portfolio with isolated assignment history", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedBackofficePortfolio(t);

    const result = await asAdmin(t).query(
      api.lender_portal.getBackofficeLenderOrganizationPortfolio,
      { lenderOrganizationId: seed.lenderOrganizationId }
    );

    expect(result.organization).toMatchObject({
      id: seed.lenderOrganizationId,
      displayName: "Northstar Lender",
      legalName: "Northstar Lender Inc.",
      brokerageName: "Northstar Brokerage",
      status: "active",
    });
    expect(result.proposals.map((proposal) => proposal.buildName)).toEqual([
      "Current Assigned Proposal",
      "Withdrawn Proposal",
      "Latest Assignment Wins",
    ]);
    expect(result.proposals.find((proposal) => proposal.buildName === "Latest Assignment Wins"))
      .toMatchObject({ assignmentStatus: "current", readOnly: false });
    expect(result.proposals.find((proposal) => proposal.buildName === "Withdrawn Proposal"))
      .toMatchObject({ assignmentStatus: "withdrawn", readOnly: true });
    expect(result.proposals.map((proposal) => proposal.buildName)).not.toContain(
      "Other Organization Proposal"
    );
    expect(result.proposals.map((proposal) => proposal.buildName)).not.toContain(
      "Cross Brokerage Proposal"
    );
    expect(result.builds).toEqual([
      expect.objectContaining({
        buildId: seed.buildId,
        buildName: "Current Assigned Build",
        proposalId: seed.currentProposalId,
      }),
    ]);
  });

  test("fails closed for non-admin callers and unavailable target brokerages", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedBackofficePortfolio(t);

    await expect(
      asLender(t).query(api.lender_portal.getBackofficeLenderOrganizationPortfolio, {
        lenderOrganizationId: seed.lenderOrganizationId,
      })
    ).rejects.toThrow();
    await expect(
      asAdmin(t).query(api.lender_portal.getBackofficeLenderOrganizationPortfolio, {
        lenderOrganizationId: seed.unavailableLenderOrganizationId,
      })
    ).rejects.toThrow("brokerage is unavailable");

    await t.run((ctx) => ctx.db.delete(seed.unavailableLenderOrganizationId));
    await expect(
      asAdmin(t).query(api.lender_portal.getBackofficeLenderOrganizationPortfolio, {
        lenderOrganizationId: seed.unavailableLenderOrganizationId,
      })
    ).rejects.toThrow("not found");
  });

  test("projects active members through the canonical admin member query", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedBackofficePortfolio(t);

    const result = await asAdmin(t).query(
      api.lenderOrganizations.listLenderOrganizationMembersForAdmin,
      { lenderOrganizationId: seed.lenderOrganizationId }
    );

    expect(result.members).toEqual([
      expect.objectContaining({
        assignmentStatus: "active",
        canMakeFinalDecision: true,
        email: "member@northstar.example.com",
        name: "Northstar Member",
        roleSlugs: ["lender-admin"],
      }),
    ]);
  });
});
