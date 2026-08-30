/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import workpoolTest from "@convex-dev/workpool/test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "./fairLendConfig";
import { projectProposalLifecycle } from "./production_proposal_lifecycle";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function textDocument(text: string) {
  return JSON.stringify({
    content: [
      {
        content: [{ text, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

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

function asLenderStaff(
  t: ReturnType<typeof convexTest>,
  subject = "user_lender_staff",
) {
  return t.withIdentity({
    email: `${subject}@example.com`,
    name: "Lender Staff",
    organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
    role: "lender-staff",
    roles: ["lender-staff"],
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

function asLenderRole(
  t: ReturnType<typeof convexTest>,
  subject: string,
  role: "lender" | "lender-admin" | "lender-staff",
) {
  return t.withIdentity({
    email: subject + "@example.com",
    name: role === "lender-staff" ? "Lender Staff" : "Lender",
    organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
    role,
    roles: [role],
    subject,
    tokenIdentifier: "https://api.workos.com/|" + subject,
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
      },
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
      },
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

    async function insertProposal(
      name: string,
      proposalBrokerageId = brokerageId,
    ) {
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
      const workflowRuleSnapshotId = await ctx.db.insert(
        "workflowRuleSnapshots",
        {
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
        },
      );
      return { proposalId, workflowRuleSnapshotId };
    }

    const current = await insertProposal("Current Assigned Proposal");
    const withdrawn = await insertProposal("Withdrawn Proposal");
    const history = await insertProposal("Latest Assignment Wins");
    const other = await insertProposal("Other Organization Proposal");
    const crossBrokerage = await insertProposal(
      "Cross Brokerage Proposal",
      foreignBrokerageId,
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
    await ctx.db.patch(withdrawn.proposalId, {
      activeBuildId: withdrawnBuildId,
    });

    async function assign(
      proposalId: typeof current.proposalId,
      targetLenderOrganizationId: typeof lenderOrganizationId,
      assignedAt: number,
      status: "current" | "withdrawn",
      lenderBrokerageId = brokerageId,
    ) {
      const assignmentId = await ctx.db.insert("proposalLenderAssignments", {
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
      if (status === "withdrawn") {
        const proposal = await ctx.db.get(proposalId);
        if (!proposal) throw new Error("Missing withdrawn proposal fixture.");
        const manifestId = await ctx.db.insert(
          "proposalLenderAssignmentManifests",
          {
            assignmentId,
            brokerageId: proposal.brokerageId,
            capturedAt: assignedAt + 1,
            cursor: null,
            lenderOrganizationId: targetLenderOrganizationId,
            lifecycleSnapshot: projectProposalLifecycle(proposal, {
              lenderConfirmation: "pending",
              state: "withdrawn",
            }),
            organizationId: proposal.organizationId,
            phase: "complete",
            proposalId,
            proposalSnapshot: {
              buildName: proposal.buildName,
              location: proposal.location,
              status: proposal.status,
            },
            sealedAt: assignedAt + 1,
            status: "sealed",
            version: 2,
          },
        );
        await ctx.db.patch(assignmentId, { archiveManifestId: manifestId });
      }
      return assignmentId;
    }

    const currentAssignmentId = await assign(
      current.proposalId,
      lenderOrganizationId,
      now + 40,
      "current",
    );
    await assign(
      withdrawn.proposalId,
      lenderOrganizationId,
      now + 30,
      "withdrawn",
    );
    await assign(
      history.proposalId,
      lenderOrganizationId,
      now + 10,
      "withdrawn",
    );
    await assign(history.proposalId, lenderOrganizationId, now + 20, "current");
    await assign(
      other.proposalId,
      otherLenderOrganizationId,
      now + 50,
      "current",
    );
    await assign(
      crossBrokerage.proposalId,
      lenderOrganizationId,
      now + 60,
      "current",
      foreignBrokerageId,
    );

    return {
      lenderOrganizationId,
      otherLenderOrganizationId,
      unavailableLenderOrganizationId,
      currentAssignmentId,
      currentProposalId: current.proposalId,
      historyProposalId: history.proposalId,
      withdrawnProposalId: withdrawn.proposalId,
      withdrawnBuildId,
      buildId,
    };
  });
}

async function seedLenderCollaboration(t: ReturnType<typeof convexTest>) {
  workpoolTest.register(t, "buildCollaborationSearchWorkpool");
  const seed = await seedBackofficePortfolio(t);
  await t.run(async (ctx) => {
    const now = Date.now();
    const build = await ctx.db.get(seed.buildId);
    if (!build) {
      throw new Error("Missing lender collaboration Build fixture.");
    }
    await ctx.db.insert("buildCollaborationTenantSettings", {
      activatedAt: now,
      activatedByWorkosUserId: "user_admin",
      brokerageId: build.brokerageId,
      createdAt: now,
      generousRateLimitMultiplier: 1,
      migrationCompletedAt: now,
      organizationId: build.organizationId,
      status: "active",
      updatedAt: now,
    });
    for (const member of [
      { role: "lender" as const, subject: "user_lender_member" },
      { role: "lender-staff" as const, subject: "user_lender_staff" },
    ]) {
      await ctx.db.insert("users", {
        authId: member.subject,
        createdAt: now,
        email: member.subject + "@example.com",
        emailVerified: true,
        name: member.role === "lender" ? "Lender Member" : "Lender Staff",
        sourceEventId: member.subject + "_created",
        sourceEventType: "test.lender_collaboration",
        status: "active",
        updatedAt: now,
        workosUserId: member.subject,
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        roleSlug: member.role,
        roleSlugs: [member.role],
        sourceEventId: member.subject + "_membership",
        sourceEventType: "test.lender_collaboration",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_" + member.subject,
        workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        workosUserId: member.subject,
      });
      await ctx.db.insert("lenderOrganizationAssignments", {
        assignedAt: now,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId: build.brokerageId,
        lenderOrganizationId: seed.lenderOrganizationId,
        normalizedEmail: member.subject + "@example.com",
        reason: "Lender collaboration fixture",
        status: "active",
        updatedAt: now,
        workosUserId: member.subject,
      });
    }
  });
  return {
    ...seed,
    admin: asLenderRole(t, "user_member", "lender-admin"),
    lender: asLenderRole(t, "user_lender_member", "lender"),
    staff: asLenderRole(t, "user_lender_staff", "lender-staff"),
  };
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
      const assignmentId = await ctx.db.insert(
        "lenderOrganizationAssignments",
        {
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
        },
      );
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
        },
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
      const proposalAssignmentId = await ctx.db.insert(
        "proposalLenderAssignments",
        {
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
        },
      );
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
      const buildMilestoneId = await ctx.db.insert("buildMilestones", {
        brokerageId,
        buildId,
        completionClaim: { status: "submitted" },
        completionReview: { status: "approved" },
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
      const proposalSubmilestoneId = await ctx.db.insert(
        "proposalSubmilestones",
        {
          brokerageId,
          createdAt: now,
          key: "footings",
          milestoneKey: "foundation",
          name: "Footings",
          order: 1,
          organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
          proposalId,
          proposalMilestoneId,
          updatedAt: now,
        },
      );
      const buildSubmilestoneId = await ctx.db.insert("buildSubmilestones", {
        actualCostCents: 8_000_000,
        actualStartedAt: now - 500_000,
        brokerageId,
        budgetCents: 10_000_000,
        buildId,
        buildMilestoneId,
        completedAt: now - 100_000,
        createdAt: now,
        durationDays: 5,
        fieldNote: "PRIVATE_BACKOFFICE_FIELD_NOTE",
        key: "footings",
        milestoneKey: "foundation",
        name: "Footings",
        order: 1,
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        proposalSubmilestoneId,
        progressPercent: 100,
        startDay: 2,
        status: "complete",
        updatedAt: now,
      });
      const evidencePackageRevisionId = await ctx.db.insert(
        "buildSubmilestoneEvidencePackageRevisions",
        {
          brokerageId,
          buildId,
          buildMilestoneId,
          buildSubmilestoneId,
          createdAt: now,
          createdByWorkosUserId: "user_admin",
          frozenAt: now,
          frozenByWorkosUserId: "user_admin",
          milestoneKey: "foundation",
          organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
          proposalId,
          requirementsRevision: 1,
          revision: 1,
          status: "frozen",
          submilestoneKey: "footings",
          updatedAt: now,
        },
      );
      const drawRequestId = await ctx.db.insert("activeBuildDrawRequests", {
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
        workOrderKey: "DRWO-0001",
      });
      const drawOccurrenceKey = `draw-system:${String(buildId)}:${String(proposalId)}:request:${String(drawRequestId)}`;
      const drawSystemPostId = await ctx.db.insert("buildCollaborationPosts", {
        acknowledgementRequired: false,
        agentDrafted: false,
        audienceFloorTier: 0,
        audienceMode: "custom",
        authorDisplayNameSnapshot: "DrawFlow System",
        authorRolesSnapshot: ["system"],
        brokerageId,
        buildId,
        canonicalBuildDrawOccurrenceKey: drawOccurrenceKey,
        commentCount: 0,
        contentState: "active",
        createdAt: now,
        lastMeaningfulActivityAt: now,
        openActionItemCount: 1,
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        postType: "update",
        primaryReferenceId: String(drawRequestId),
        primaryReferenceKind: "draw",
        revision: 1,
        source: "system",
        systemOccurrenceKey: drawOccurrenceKey,
        systemPostKind: "draw",
        threadState: "open",
        updatedAt: now,
      });
      const drawActionItemId = await ctx.db.insert("buildActionItems", {
        assignmentState: "unassigned",
        brokerageId,
        buildId,
        createdAt: now,
        creatorWorkosUserId: "user_admin",
        currentRevision: 1,
        descriptionPlainText: "",
        descriptionTiptapJson: JSON.stringify({ content: [], type: "doc" }),
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        originatingPostId: drawSystemPostId,
        priority: "none",
        requiresAcceptance: false,
        status: "todo",
        title: "Confirm roofing invoice tax breakdown",
        updatedAt: now,
      });
      await ctx.db.insert("activeBuildDrawRequestAllocations", {
        amountCents: 10_000_000,
        brokerageId,
        buildId,
        buildMilestoneId,
        createdAt: now,
        drawGroupKey: "foundation-draw",
        drawRequestId,
        milestoneKey: "foundation",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        sourceOrder: 1,
      });
      const reviewCycleId = await ctx.db.insert("lenderPortalReviewCycles", {
        approvedGroups: ["backoffice"],
        brokerageId,
        buildId,
        commandFingerprint: "dashboard-draw-cycle-01",
        cycleNumber: 1,
        decisionSummaries: [
          {
            actorWorkosUserId: "user_admin",
            decision: "approved",
            group: "backoffice",
          },
        ],
        drawRequestId,
        evidenceReferences: [
          {
            evidencePackageRevisionId,
            kind: "package_revision",
            label: "Footings evidence package · Revision 1",
            milestoneKey: "foundation",
            submilestoneKey: "footings",
          },
        ],
        idempotencyKey: "dashboard-draw-cycle-01",
        isCurrent: true,
        kind: "draw",
        lenderApprovalCount: 0,
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        requestIdentity: `draw:${String(drawRequestId)}`,
        requirements: {
          approvalMode: "both",
          lenderQuorum: 1,
          receiptInvoiceRequired: false,
          requiredGroups: ["backoffice", "lender"],
          siteVisitRequired: false,
        },
        state: "partial_approval",
        submission: {
          allocations: [
            {
              amountCents: 10_000_000,
              drawGroupKey: "foundation-draw",
              milestoneId: buildMilestoneId,
              milestoneKey: "foundation",
              sourceOrder: 1,
            },
          ],
          amountCents: 10_000_000,
          displayId: "DRAW-01",
          drawRequestId,
          kind: "draw",
          label: "Draw 01",
          note: null,
          requestedAt: "2026-08-15T00:00:00.000Z",
          requestKey: "draw-01",
        },
        submittedAt: now,
        submittedByWorkosUserId: "user_admin",
        targetLabel: "Draw 01",
        updatedAt: now,
      });
      await ctx.db.patch(drawRequestId, {
        currentLenderPortalReviewCycleId: reviewCycleId,
        currentLenderPortalReviewCycleNumber: 1,
        lenderPortalReviewState: "partial_approval",
      });

      const packageAssetId = await ctx.db.insert("buildEvidenceAssets", {
        brokerageId,
        buildId,
        createdAt: now,
        evidenceKey: "foundation-photo",
        evidencePackageRevisionId,
        fileName: "foundation.jpg",
        label: "Foundation progress photo",
        locationVerified: true,
        milestoneKey: "foundation",
        mimeType: "image/jpeg",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        proposalId,
        sizeBytes: 1_024,
        source: "canonical_upload",
        submilestoneKey: "footings",
        tag: "progress",
        updatedAt: now,
      });
      const packageItemId = await ctx.db.insert(
        "buildSubmilestoneEvidencePackageItems",
        {
          brokerageId,
          buildId,
          buildMilestoneId,
          buildSubmilestoneId,
          createdAt: now,
          evidenceAssetId: packageAssetId,
          locationVerified: true,
          organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
          packageRevisionId: evidencePackageRevisionId,
          requirementKey: "foundation-photo",
          sourceKind: "canonical_upload",
          sourceUploaderWorkosUserId: "user_admin",
        },
      );
      const siteVisitId = await ctx.db.insert("buildSiteVisits", {
        brokerageId,
        buildId,
        buildMilestoneId,
        completedAt: "2026-08-16T13:00:00.000Z",
        completedByGroup: "backoffice",
        completedByRole: "admin",
        completedByWorkosUserId: "user_admin",
        createdAt: now,
        milestoneKey: "foundation",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        recordNote: "Footings match the submitted scope.",
        recordNoteFormat: "plain_text",
        requestedAt: "2026-08-15T13:00:00.000Z",
        requestedDay: 15,
        status: "complete",
        submilestoneId: buildSubmilestoneId,
        submilestoneKeys: ["footings"],
        tokenExpiresAt: now + 60_000,
        updatedAt: now,
        url: "https://example.test/site-visit",
        visitId: "VISIT-01",
      });
      const siteVisitAssetId = await ctx.db.insert("buildEvidenceAssets", {
        brokerageId,
        buildId,
        createdAt: now,
        evidenceKey: "site-visit-photo",
        fileName: "site-visit.jpg",
        label: "Site Visit photo",
        locationVerified: true,
        milestoneKey: "foundation",
        mimeType: "image/jpeg",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        proposalId,
        siteVisitId,
        sizeBytes: 2_048,
        source: "site_visit",
        tag: "site_visit",
        updatedAt: now,
      });
      const wholeMilestoneSiteVisitId = await ctx.db.insert("buildSiteVisits", {
        brokerageId,
        buildId,
        buildMilestoneId,
        completedAt: "2026-08-17T13:00:00.000Z",
        completedByGroup: "backoffice",
        completedByRole: "admin",
        completedByWorkosUserId: "user_admin",
        createdAt: now,
        milestoneKey: "foundation",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        recordNote: "Whole Milestone scope verified.",
        recordNoteFormat: "plain_text",
        requestedAt: "2026-08-17T12:00:00.000Z",
        requestedDay: 16,
        status: "complete",
        tokenExpiresAt: now + 120_000,
        updatedAt: now + 1,
        url: "https://example.test/site-visit-whole",
        visitId: "VISIT-02",
      });
      const wholeMilestoneSiteVisitAssetId = await ctx.db.insert(
        "buildEvidenceAssets",
        {
          brokerageId,
          buildId,
          createdAt: now,
          evidenceKey: "whole-milestone-site-visit-photo",
          fileName: "whole-milestone-site-visit.jpg",
          label: "Whole Milestone Site Visit photo",
          locationVerified: false,
          milestoneKey: "foundation",
          mimeType: "image/jpeg",
          organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
          proposalId,
          siteVisitId: wholeMilestoneSiteVisitId,
          sizeBytes: 3_072,
          source: "site_visit",
          tag: "site_visit",
          updatedAt: now,
        },
      );
      const costDocumentId = await ctx.db.insert("costDocuments", {
        brokerageId,
        buildId,
        category: "materials",
        createdAt: now,
        currency: "CAD",
        documentDate: "2026-08-15",
        grossTotalCents: 8_000_000,
        kind: "invoice",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        state: "submitted",
        submittedAt: now,
        title: "Concrete invoice",
        uploaderEmailSnapshot: "builder@example.com",
        uploaderWorkosUserId: "user_admin",
        vendorName: "Concrete Supply",
      });
      await ctx.db.insert("costDocumentAllocations", {
        amountCents: 8_000_000,
        brokerageId,
        buildId,
        buildSubmilestoneId,
        costDocumentId,
        createdAt: now,
        order: 1,
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        submilestoneKeySnapshot: "footings",
        submilestoneNameSnapshot: "Footings",
      });
      await ctx.db.insert("costDocumentFinancialComponents", {
        amountCents: 7_000_000,
        brokerageId,
        buildId,
        costDocumentId,
        createdAt: now,
        kind: "subtotal",
        order: 1,
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      });
      await ctx.db.insert("costDocumentFinancialComponents", {
        amountCents: 1_000_000,
        brokerageId,
        buildId,
        costDocumentId,
        createdAt: now,
        kind: "tax",
        order: 2,
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      });
      const contractorId = await ctx.db.insert("contractorProfiles", {
        brokerageId,
        createdAt: now,
        name: "Concrete Co",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        status: "active",
        trades: ["Concrete"],
        updatedAt: now,
      });
      const buildContractorAssignmentId = await ctx.db.insert(
        "buildContractorAssignments",
        {
          brokerageId,
          buildId,
          contractorId,
          createdAt: now,
          organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
          role: "Concrete",
          status: "active",
          updatedAt: now,
        },
      );
      await ctx.db.insert("milestoneContractorAssignments", {
        assignedAt: now,
        assignedByWorkosUserId: "user_admin",
        brokerageId,
        buildContractorAssignmentId,
        buildId,
        buildMilestoneId,
        buildSubmilestoneId,
        contractorId,
        createdAt: now,
        milestoneKey: "foundation",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        postHoc: false,
        role: "Concrete",
        status: "active",
        submilestoneKey: "footings",
        updatedAt: now,
      });
      const milestoneReviewCycleId = await ctx.db.insert(
        "lenderPortalReviewCycles",
        {
          approvedGroups: ["backoffice", "lender"],
          brokerageId,
          buildId,
          commandFingerprint: "dashboard-milestone-cycle-01",
          cycleNumber: 1,
          decisionSummaries: [
            {
              actorWorkosUserId: "user_admin",
              decision: "approved",
              group: "backoffice",
            },
            {
              actorWorkosUserId: "user_lender",
              decision: "approved",
              group: "lender",
            },
          ],
          evidenceReferences: [
            {
              evidencePackageRevisionId,
              kind: "package_revision",
              label: "Footings evidence package · Revision 1",
              milestoneKey: "foundation",
              submilestoneKey: "footings",
            },
            {
              association: {
                evidencePackageItemId: packageItemId,
                evidencePackageRevisionId,
                kind: "package_revision",
              },
              evidenceAssetId: packageAssetId,
              kind: "asset",
              label: "Foundation progress photo",
              locationVerified: true,
              milestoneKey: "foundation",
              submilestoneKey: "footings",
            },
            {
              amountCents: 8_000_000,
              costDocumentId,
              currency: "CAD",
              documentKind: "invoice",
              kind: "cost_document",
              label: "Concrete invoice",
              milestoneKey: "foundation",
            },
            {
              completedAt: "2026-08-16T13:00:00.000Z",
              kind: "site_visit",
              label: "Foundation Site Visit",
              milestoneKey: "foundation",
              report: "Footings match the submitted scope.",
              siteVisitId,
            },
            {
              association: { kind: "site_visit", siteVisitId },
              evidenceAssetId: siteVisitAssetId,
              kind: "asset",
              label: "Site Visit photo",
              locationVerified: true,
              milestoneKey: "foundation",
            },
            {
              completedAt: "2026-08-17T13:00:00.000Z",
              kind: "site_visit",
              label: "Whole Milestone Site Visit",
              milestoneKey: "foundation",
              report: "Whole Milestone scope verified.",
              siteVisitId: wholeMilestoneSiteVisitId,
            },
            {
              association: {
                kind: "site_visit",
                siteVisitId: wholeMilestoneSiteVisitId,
              },
              evidenceAssetId: wholeMilestoneSiteVisitAssetId,
              kind: "asset",
              label: "Whole Milestone Site Visit photo",
              locationVerified: false,
              milestoneKey: "foundation",
            },
          ],
          idempotencyKey: "dashboard-milestone-cycle-01",
          isCurrent: true,
          kind: "milestone",
          lenderApprovalCount: 1,
          milestoneId: buildMilestoneId,
          organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
          requestIdentity: `milestone:${String(buildMilestoneId)}`,
          requirements: {
            approvalMode: "both",
            lenderQuorum: 1,
            receiptInvoiceRequired: true,
            requiredGroups: ["backoffice", "lender"],
            siteVisitRequired: true,
          },
          state: "completed",
          submission: {
            actualCostCents: 8_000_000,
            completedDay: 15,
            kind: "milestone",
            milestoneId: buildMilestoneId,
            milestoneKey: "foundation",
            milestoneName: "Foundation",
            note: null,
            progressPercent: 100,
            submittedAt: "2026-08-15T00:00:00.000Z",
          },
          submittedAt: now,
          submittedByWorkosUserId: "user_admin",
          targetLabel: "Foundation",
          updatedAt: now,
        },
      );
      await ctx.db.patch(buildMilestoneId, {
        currentLenderPortalReviewCycleId: milestoneReviewCycleId,
        currentLenderPortalReviewCycleNumber: 1,
        lenderPortalReviewState: "completed",
      });

      const insertCollaboration = async (
        audienceMode: "build_wide" | "custom",
        body: string,
      ) => {
        const postId = await ctx.db.insert("buildCollaborationPosts", {
          acknowledgementRequired: false,
          agentDrafted: false,
          audienceFloorTier: 0,
          audienceMode,
          authorDisplayNameSnapshot: "Private Builder Name",
          authorRole: "builder",
          authorRolesSnapshot: ["builder"],
          authorWorkosUserId: "user_private_builder",
          brokerageId,
          buildId,
          commentCount: 0,
          contentState: "active",
          createdAt: now,
          lastMeaningfulActivityAt: now,
          openActionItemCount: 0,
          organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
          postType: "update",
          revision: 1,
          source: "human",
          threadState: "open",
          updatedAt: now,
        });
        const revisionId = await ctx.db.insert(
          "buildCollaborationPostRevisions",
          {
            authorRole: "builder",
            authorWorkosUserId: "user_private_builder",
            brokerageId,
            buildId,
            contentHash: audienceMode + "-hash",
            createdAt: now,
            organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
            plainText: body,
            postId,
            revision: 1,
            tiptapJson: JSON.stringify({ content: [], type: "doc" }),
          },
        );
        await ctx.db.patch(postId, { currentRevisionId: revisionId });
        return postId;
      };
      const buildWidePostId = await insertCollaboration(
        "build_wide",
        "Concrete placement completed and documented.",
      );
      await insertCollaboration(
        "custom",
        "PRIVATE_REVIEWER_RATIONALE_MUST_NOT_LEAK",
      );
      await ctx.db.insert("buildActionItems", {
        assignmentState: "unassigned",
        brokerageId,
        buildId,
        createdAt: now,
        creatorWorkosUserId: "user_admin",
        currentRevision: 1,
        descriptionPlainText: "",
        descriptionTiptapJson: JSON.stringify({ content: [], type: "doc" }),
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        originatingPostId: buildWidePostId,
        priority: "none",
        requiresAcceptance: false,
        status: "todo",
        title: "UNRELATED_BUILD_ACTION_ITEM",
        updatedAt: now,
      });

      return {
        buildId,
        contractorId,
        drawActionItemId,
        drawRequestId,
        lenderOrganizationId,
        milestoneReviewCycleId,
        packageAssetId,
        proposalAssignmentId,
        proposalId,
        reviewCycleId,
      };
    });

    const dashboard = await asLender(t).query(
      api.lender_portal.getLenderDashboard,
      {},
    );

    expect(dashboard.stats).toEqual({
      activeBuildCount: 1,
      assignedProposalCount: 1,
      drawCount: 1,
      milestoneCount: 1,
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
          assignmentId: seed.proposalAssignmentId,
          type: "Proposal",
          title: "Harbourline Residences",
          fact: "Lender confirmation required",
          proposalId: seed.proposalId,
        }),
        expect.objectContaining({
          type: "Draw",
          title: "Harbourline Residences · Draw 01",
          amountCents: 10_000_000,
        }),
      ]),
    );
    expect(dashboard.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fact: "Site visit report ready",
          type: "Milestone",
        }),
      ]),
    );

    const buildDetail = await asLender(t).query(
      api.lender_portal.getLenderBuildDetail,
      { buildId: seed.buildId },
    );
    expect(buildDetail).toMatchObject({
      build: {
        buildId: seed.buildId,
        buildName: "Harbourline Residences",
        location: "Hamilton, ON",
      },
      builder: { displayName: "Northstar Builder" },
      facility: {
        interestAnnualBps: 925,
        interestStartsOn: "funds_released",
        principalCents: 100_000_000,
      },
      releasedCents: 25_000_000,
      reviewSummary: "1 lender review request require attention.",
    });
    expect(buildDetail.milestones[0]).toMatchObject({
      actualCompletedAt: expect.any(Number),
      contractors: [
        expect.objectContaining({ name: "Concrete Co", role: "Concrete" }),
      ],
      name: "Foundation",
      progressPercent: 35,
      receiptCoverage: {
        actualCostCents: 8_000_000,
        documentedCents: 8_000_000,
        documents: [
          expect.objectContaining({
            allocations: [
              expect.objectContaining({
                amountCents: 8_000_000,
                buildSubmilestoneId: expect.any(String),
              }),
            ],
            subtotalCents: 7_000_000,
            taxCents: 1_000_000,
          }),
        ],
        required: true,
        state: "covered",
      },
      reviewCycleId: expect.any(String),
      reviewEvidence: [
        expect.objectContaining({
          label: "Foundation progress photo",
          siteVisitId: null,
          source: "evidence_package",
        }),
        expect.objectContaining({
          label: "Site Visit photo",
          siteVisitId: expect.any(String),
          source: "site_visit",
        }),
        expect.objectContaining({
          label: "Whole Milestone Site Visit photo",
          siteVisitId: expect.any(String),
          submilestoneKey: null,
        }),
      ],
      siteVisit: {
        completedAt: "2026-08-16T13:00:00.000Z",
        photoCount: 1,
        report: "Footings match the submitted scope.",
        requestedAt: "2026-08-15T13:00:00.000Z",
        siteVisitId: expect.any(String),
        submilestoneId: expect.any(String),
      },
      siteVisits: [
        expect.objectContaining({
          report: "Footings match the submitted scope.",
          submilestoneId: expect.any(String),
          visitId: "VISIT-01",
        }),
        expect.objectContaining({
          report: "Whole Milestone scope verified.",
          submilestoneId: null,
          visitId: "VISIT-02",
        }),
      ],
      submilestones: [
        expect.objectContaining({
          actualCostCents: 8_000_000,
          assignments: [
            expect.objectContaining({ name: "Concrete Co", role: "Concrete" }),
          ],
          budgetCents: 10_000_000,
          description: "",
          key: "footings",
          progressPercent: 100,
        }),
      ],
    });
    expect(buildDetail.draws[0]).toMatchObject({
      actionItems: [
        {
          actionItemId: seed.drawActionItemId,
          status: "todo",
          title: "Confirm roofing invoice tax breakdown",
          updatedAt: expect.any(Number),
        },
      ],
      amountCents: 10_000_000,
      displayId: "DRAW-01",
      fundingPosition: {
        availableBeforeCents: 20_000_000,
        reconciled: true,
        remainingAfterCents: 10_000_000,
      },
      status: "in_review",
    });
    expect(buildDetail.funding).toMatchObject({
      availableCents: 10_000_000,
      facilityCents: 100_000_000,
      releasedCents: 25_000_000,
      reservedCents: 10_000_000,
      unlockedCents: 20_000_000,
    });
    expect(buildDetail.reviewPolicy).toEqual({ state: "unavailable" });
    const serializedBuildDetail = JSON.stringify(buildDetail);
    expect(serializedBuildDetail).not.toContain(
      "PRIVATE_REVIEWER_RATIONALE_MUST_NOT_LEAK",
    );
    expect(serializedBuildDetail).not.toContain(
      "PRIVATE_BACKOFFICE_FIELD_NOTE",
    );
    expect(serializedBuildDetail).not.toContain("Private Builder Name");
    expect(serializedBuildDetail).not.toContain("user_private_builder");
    expect(serializedBuildDetail).not.toContain("UNRELATED_BUILD_ACTION_ITEM");

    const drawQueue = await asLender(t).query(
      api.lender_portal.getLenderDrawQueue,
      { paginationOpts: { cursor: null, numItems: 20 }, scope: "all" },
    );
    expect(drawQueue.page).toEqual([
      expect.objectContaining({
        actionRequired: true,
        amountCents: 10_000_000,
        buildId: seed.buildId,
        builderName: "Northstar Builder",
        currentReviewCycleId: seed.reviewCycleId,
        currentReviewCycleNumber: 1,
        displayId: "DRAW-01",
        drawRequestId: seed.drawRequestId,
        fundingPosition: {
          availableBeforeCents: 20_000_000,
          reconciled: true,
          remainingAfterCents: 10_000_000,
        },
        reviewCycle: {
          approvedGroups: ["backoffice"],
          evidencePackageRevisionCount: 1,
          evidenceReferenceCount: 1,
          lenderApprovalCount: 0,
          lenderQuorum: 1,
          locationReferenceCount: 0,
          locationVerifiedCount: 0,
          requiredGroups: ["backoffice", "lender"],
          state: "partial_approval",
        },
        status: "in_review",
        targetAvailability: "available",
        viewerActionState: "needs_action",
        viewerDecision: null,
        workOrderKey: "DRWO-0001",
      }),
    ]);
    await asLender(t).mutation(
      (api as any).lender_portal_phase5.decideLenderReviewRequest,
      {
        decision: "approved",
        expectedCycleNumber: 1,
        idempotencyKey: "dashboard-draw-lender-approved",
        target: { drawRequestId: seed.drawRequestId, kind: "draw" },
      },
    );
    const completedActionScope = await asLender(t).query(
      api.lender_portal.getLenderDrawQueue,
      { paginationOpts: { cursor: null, numItems: 20 }, scope: "action" },
    );
    expect(completedActionScope.page).toEqual([]);
    const completedAllScope = await asLender(t).query(
      api.lender_portal.getLenderDrawQueue,
      { paginationOpts: { cursor: null, numItems: 20 }, scope: "all" },
    );
    expect(completedAllScope.page[0]).toMatchObject({
      actionRequired: false,
      viewerActionState: "acted",
      viewerDecision: "approved",
    });
    await t.run((ctx) =>
      ctx.db.patch(seed.reviewCycleId, {
        requestIdentity: `draw:foreign-${String(seed.drawRequestId)}`,
      }),
    );
    const mismatchedIdentityQueue = await asLender(t).query(
      api.lender_portal.getLenderDrawQueue,
      { paginationOpts: { cursor: null, numItems: 20 }, scope: "all" },
    );
    expect(mismatchedIdentityQueue.page[0]).toMatchObject({
      actionRequired: false,
      currentReviewCycleId: null,
      currentReviewCycleNumber: null,
      reviewCycle: null,
    });
    await t.run((ctx) =>
      ctx.db.patch(seed.reviewCycleId, {
        requestIdentity: `draw:${String(seed.drawRequestId)}`,
      }),
    );
    await t.run((ctx) =>
      ctx.db.patch(seed.reviewCycleId, { isCurrent: false }),
    );
    const staleCycleQueue = await asLender(t).query(
      api.lender_portal.getLenderDrawQueue,
      { paginationOpts: { cursor: null, numItems: 20 }, scope: "all" },
    );
    expect(staleCycleQueue.page[0]).toMatchObject({
      actionRequired: false,
      currentReviewCycleId: null,
      currentReviewCycleNumber: null,
      reviewCycle: null,
    });
    await expect(
      t.query(api.lender_portal.getLenderDrawQueue, {
        paginationOpts: { cursor: null, numItems: 20 },
        scope: "all",
      }),
    ).rejects.toThrow();

    await t.run((ctx) =>
      ctx.db.patch(seed.packageAssetId, {
        organizationId: "org_foreign_evidence",
      }),
    );
    await expect(
      asLender(t).query(api.lender_portal.getLenderBuildDetail, {
        buildId: seed.buildId,
      }),
    ).rejects.toThrow();
    await t.run((ctx) =>
      ctx.db.patch(seed.packageAssetId, {
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      }),
    );
    await t.run((ctx) =>
      ctx.db.patch(seed.contractorId, {
        organizationId: "org_foreign_contractor",
      }),
    );
    await expect(
      asLender(t).query(api.lender_portal.getLenderBuildDetail, {
        buildId: seed.buildId,
      }),
    ).rejects.toThrow();
    await t.run((ctx) =>
      ctx.db.patch(seed.contractorId, {
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      }),
    );
    await t.run((ctx) =>
      ctx.db.patch(seed.milestoneReviewCycleId, {
        requestIdentity: `milestone:foreign-${String(seed.buildId)}`,
      }),
    );
    await expect(
      asLender(t).query(api.lender_portal.getLenderBuildDetail, {
        buildId: seed.buildId,
      }),
    ).rejects.toThrow();
  });

  test("shows a Build as behind schedule when one assigned Sub-milestone missed its start", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedBackofficePortfolio(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      const build = await ctx.db.get(seed.buildId);
      if (!build) {
        throw new Error("Missing assigned Build fixture.");
      }
      const startDate = new Date(now - 86_400_000)
        .toISOString()
        .slice(0, 10);
      await ctx.db.patch(build._id, { startDate });
      const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
        brokerageId: build.brokerageId,
        budgetCents: 30_000_000,
        createdAt: now,
        dayEnd: 10,
        dayStart: 0,
        dependencyKeys: [],
        drawAvailabilityCents: 20_000_000,
        durationDays: 11,
        key: "foundation",
        name: "Foundation",
        order: 1,
        organizationId: build.organizationId,
        proposalId: seed.currentProposalId,
        updatedAt: now,
      });
      const buildMilestoneId = await ctx.db.insert("buildMilestones", {
        brokerageId: build.brokerageId,
        budgetCents: 30_000_000,
        buildId: build._id,
        createdAt: now,
        dayEnd: 10,
        dayStart: 0,
        dependencyKeys: [],
        drawAvailabilityCents: 20_000_000,
        durationDays: 11,
        key: "foundation",
        name: "Foundation",
        order: 1,
        organizationId: build.organizationId,
        proposalMilestoneId,
        status: "planned",
        updatedAt: now,
      });
      const proposalSubmilestoneId = await ctx.db.insert(
        "proposalSubmilestones",
        {
          brokerageId: build.brokerageId,
          createdAt: now,
          durationDays: 4,
          key: "demo-ex",
          milestoneKey: "foundation",
          name: "DEMO EX",
          order: 1,
          organizationId: build.organizationId,
          proposalId: seed.currentProposalId,
          proposalMilestoneId,
          startDay: 0,
          updatedAt: now,
        },
      );
      await ctx.db.insert("buildSubmilestones", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        buildMilestoneId,
        createdAt: now,
        durationDays: 4,
        key: "demo-ex",
        milestoneKey: "foundation",
        name: "DEMO EX",
        order: 1,
        organizationId: build.organizationId,
        proposalSubmilestoneId,
        startDay: 0,
        status: "planned",
        updatedAt: now,
      });
    });

    const lender = asLender(t, "user_member");
    const [builds, dashboard] = await Promise.all([
      lender.query(api.lender_portal.listLenderActiveBuilds, {}),
      lender.query(api.lender_portal.getLenderDashboard, {}),
    ]);
    expect(
      builds.find((build) => build.buildId === seed.buildId),
    ).toMatchObject({ milestonesBehindSchedule: 1 });
    expect(
      dashboard.builds.find((build) => build.buildId === seed.buildId),
    ).toMatchObject({
      milestonesBehindSchedule: 1,
    });
  });

  test("fails closed when a Dashboard assignment crosses tenant or Brokerage scope", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedBackofficePortfolio(t);
    const lender = asLender(t, "user_member");
    const baseline = await lender.query(
      api.lender_portal.getLenderDashboard,
      {},
    );
    expect(baseline.builds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ buildId: seed.buildId }),
      ]),
    );

    const assignmentScope = await t.run(async (ctx) => {
      const assignment = await ctx.db.get(seed.currentAssignmentId);
      if (!assignment) {
        throw new Error("Missing current assignment fixture.");
      }
      const foreignBrokerageId = await ctx.db.insert("brokerages", {
        createdAt: Date.now(),
        displayName: "Dashboard Foreign Brokerage",
        legalName: "Dashboard Foreign Brokerage Inc.",
        status: "active",
        updatedAt: Date.now(),
        workosOrganizationId: "org_dashboard_foreign",
      });
      await ctx.db.patch(seed.currentAssignmentId, {
        brokerageId: foreignBrokerageId,
      });
      return {
        brokerageId: assignment.brokerageId,
        organizationId: assignment.organizationId,
      };
    });
    const crossBrokerage = await lender.query(
      api.lender_portal.getLenderDashboard,
      {},
    );
    expect(crossBrokerage.builds).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ buildId: seed.buildId }),
      ]),
    );
    expect(crossBrokerage.actions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ proposalId: seed.currentProposalId }),
      ]),
    );
    expect(crossBrokerage.stats).toMatchObject({
      activeBuildCount: 0,
      drawCount: 0,
      milestoneCount: 0,
    });
    await expect(
      lender.query(api.lender_portal.getLenderBuildDetail, {
        buildId: seed.buildId,
      }),
    ).rejects.toThrow();

    await t.run(async (ctx) => {
      await ctx.db.patch(seed.currentAssignmentId, {
        brokerageId: assignmentScope.brokerageId,
        organizationId: "org_dashboard_foreign_tenant",
      });
    });
    const crossTenant = await lender.query(
      api.lender_portal.getLenderDashboard,
      {},
    );
    expect(crossTenant.builds).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ buildId: seed.buildId }),
      ]),
    );
    expect(crossTenant.actions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ proposalId: seed.currentProposalId }),
      ]),
    );
    expect(crossTenant.stats).toMatchObject({
      activeBuildCount: 0,
      drawCount: 0,
      milestoneCount: 0,
    });
    await expect(
      lender.query(api.lender_portal.getLenderBuildDetail, {
        buildId: seed.buildId,
      }),
    ).rejects.toThrow();

    await t.run(async (ctx) => {
      await ctx.db.patch(seed.currentAssignmentId, {
        organizationId: assignmentScope.organizationId,
      });
    });
  });

  test("fails closed before a cross-scope Build child contributes to Dashboard truth", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedBackofficePortfolio(t);
    const lender = asLender(t, "user_member");
    const child = await t.run(async (ctx) => {
      const build = await ctx.db.get(seed.buildId);
      if (!build) {
        throw new Error("Missing Dashboard Build fixture.");
      }
      const capitalEventId = await ctx.db.insert("capitalEvents", {
        amountCents: 10_000,
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: Date.now(),
        eventDate: "2026-08-18",
        eventType: "draw_release",
        label: "Cross-scope release",
        organizationId: "org_foreign_child",
      });
      const foreignBrokerageId = await ctx.db.insert("brokerages", {
        createdAt: Date.now(),
        displayName: "Foreign Child Brokerage",
        legalName: "Foreign Child Brokerage Inc.",
        status: "active",
        updatedAt: Date.now(),
        workosOrganizationId: "org_foreign_child_brokerage",
      });
      return {
        brokerageId: build.brokerageId,
        capitalEventId,
        foreignBrokerageId,
        organizationId: build.organizationId,
      };
    });

    await expect(
      lender.query(api.lender_portal.getLenderDashboard, {}),
    ).rejects.toThrow("Lender Build data is unavailable");

    await t.run((ctx) =>
      ctx.db.patch(child.capitalEventId, {
        brokerageId: child.foreignBrokerageId,
        organizationId: child.organizationId,
      }),
    );
    await expect(
      lender.query(api.lender_portal.getLenderDashboard, {}),
    ).rejects.toThrow("Lender Build data is unavailable");

    await t.run((ctx) =>
      ctx.db.patch(child.capitalEventId, {
        brokerageId: child.brokerageId,
      }),
    );
    const restored = await lender.query(
      api.lender_portal.getLenderDashboard,
      {},
    );
    expect(restored.builds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ buildId: seed.buildId }),
      ]),
    );
  });

  test("excludes superseded Milestones and cancelled or withdrawn Draws from Dashboard truth", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedBackofficePortfolio(t);
    const obsolete = await t.run(async (ctx) => {
      const build = await ctx.db.get(seed.buildId);
      if (!build) {
        throw new Error("Missing Dashboard Build fixture.");
      }
      const now = Date.now();
      const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
        brokerageId: build.brokerageId,
        budgetCents: 100_000,
        createdAt: now,
        dayEnd: 5,
        dayStart: 1,
        dependencyKeys: [],
        drawAvailabilityCents: 100_000,
        durationDays: 5,
        key: "superseded-foundation",
        name: "Superseded Foundation",
        order: 1,
        organizationId: build.organizationId,
        proposalId: build.proposalId,
        updatedAt: now,
      });
      const milestoneId = await ctx.db.insert("buildMilestones", {
        brokerageId: build.brokerageId,
        budgetCents: 100_000,
        buildId: build._id,
        createdAt: now,
        dayEnd: 5,
        dayStart: 1,
        dependencyKeys: [],
        drawAvailabilityCents: 100_000,
        durationDays: 5,
        key: "superseded-foundation",
        name: "Superseded Foundation",
        order: 1,
        organizationId: build.organizationId,
        planningState: "superseded",
        progressPercent: 100,
        proposalMilestoneId,
        status: "complete",
        supersededAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("buildSiteVisits", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        buildMilestoneId: milestoneId,
        completedAt: "2026-08-18T12:00:00.000Z",
        createdAt: now,
        milestoneKey: "superseded-foundation",
        organizationId: build.organizationId,
        requestedAt: "2026-08-17T12:00:00.000Z",
        requestedDay: 4,
        status: "complete",
        tokenExpiresAt: now + 60_000,
        updatedAt: now,
        url: "/site-visits/superseded-foundation",
        visitId: "VISIT-SUPERSEDED",
      });
      const cancelledDrawId = await ctx.db.insert("activeBuildDrawRequests", {
        amountCents: 50_000,
        brokerageId: build.brokerageId,
        buildId: build._id,
        cancelledAt: "2026-08-18T12:00:00.000Z",
        cancelledByWorkosUserId: "user_admin",
        clientOperationId: "dashboard-cancelled-draw",
        createdAt: now,
        displayId: "DRAW-CANCELLED",
        label: "Cancelled Draw",
        organizationId: build.organizationId,
        requestKey: "dashboard-cancelled-draw",
        requestedAt: "2026-08-17T12:00:00.000Z",
        requestedByWorkosUserId: "user_admin",
        status: "cancelled",
        updatedAt: now,
      });
      const withdrawnDrawId = await ctx.db.insert("activeBuildDrawRequests", {
        amountCents: 50_000,
        brokerageId: build.brokerageId,
        buildId: build._id,
        clientOperationId: "dashboard-withdrawn-draw",
        createdAt: now,
        displayId: "DRAW-WITHDRAWN",
        label: "Withdrawn Draw",
        organizationId: build.organizationId,
        requestKey: "dashboard-withdrawn-draw",
        requestedAt: "2026-08-17T12:00:00.000Z",
        requestedByWorkosUserId: "user_admin",
        status: "withdrawn",
        updatedAt: now,
        withdrawnAt: "2026-08-18T12:00:00.000Z",
        withdrawnByWorkosUserId: "user_admin",
      });
      return { cancelledDrawId, milestoneId, withdrawnDrawId };
    });

    const dashboard = await asLender(t, "user_member").query(
      api.lender_portal.getLenderDashboard,
      {},
    );
    expect(dashboard.stats).toMatchObject({ drawCount: 0, milestoneCount: 0 });
    expect(dashboard.actions.map((action) => action.actionId)).not.toEqual(
      expect.arrayContaining([
        `site-visit:${String(obsolete.milestoneId)}`,
        `draw:${String(obsolete.cancelledDrawId)}`,
        `draw:${String(obsolete.withdrawnDrawId)}`,
      ]),
    );
  });

  test("fails closed instead of silently truncating an oversized Dashboard assignment set", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedBackofficePortfolio(t);
    await t.run(async (ctx) => {
      const assignment = await ctx.db.get(seed.currentAssignmentId);
      if (!assignment) {
        throw new Error("Missing Dashboard assignment fixture.");
      }
      const now = Date.now();
      for (let index = 0; index < 201; index += 1) {
        await ctx.db.insert("proposalLenderAssignments", {
          assignedAt: now + index,
          assignedByRole: assignment.assignedByRole,
          assignedByWorkosUserId: assignment.assignedByWorkosUserId,
          brokerageId: assignment.brokerageId,
          createdAt: now + index,
          lenderBrokerageId: assignment.lenderBrokerageId,
          lenderOrganizationId: assignment.lenderOrganizationId,
          lenderOrganizationName: assignment.lenderOrganizationName,
          organizationId: assignment.organizationId,
          proposalId: assignment.proposalId,
          status: "current",
        });
      }
    });

    await expect(
      asLender(t, "user_member").query(
        api.lender_portal.getLenderDashboard,
        {},
      ),
    ).rejects.toThrow("Lender dashboard assignment limit exceeded");
  });

  test("fails closed instead of returning an unbounded Dashboard action set", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedBackofficePortfolio(t);
    await t.run(async (ctx) => {
      const [assignment, sourceProposal] = await Promise.all([
        ctx.db.get(seed.currentAssignmentId),
        ctx.db.get(seed.currentProposalId),
      ]);
      if (!assignment || !sourceProposal) {
        throw new Error("Missing Dashboard action-capacity fixture.");
      }
      const now = Date.now();
      for (let index = 0; index < 101; index += 1) {
        const proposalId = await ctx.db.insert("buildProposals", {
          brokerageId: sourceProposal.brokerageId,
          buildName: `Pending Dashboard Proposal ${index + 1}`,
          borrowerCoPayBps: sourceProposal.borrowerCoPayBps,
          borrowerWorkingCapitalLimitCents:
            sourceProposal.borrowerWorkingCapitalLimitCents,
          createdAt: now + index,
          createdByWorkosUserId: sourceProposal.createdByWorkosUserId,
          interestAnnualBps: sourceProposal.interestAnnualBps,
          lenderDrawPolicyLimitCents: sourceProposal.lenderDrawPolicyLimitCents,
          location: sourceProposal.location,
          organizationId: sourceProposal.organizationId,
          reviewOutcome: "approved",
          status: "approved",
          totalBudgetCents: sourceProposal.totalBudgetCents,
          updatedAt: now + index,
          updatedByWorkosUserId: sourceProposal.updatedByWorkosUserId,
        });
        await ctx.db.insert("proposalLenderAssignments", {
          assignedAt: now + index,
          assignedByRole: assignment.assignedByRole,
          assignedByWorkosUserId: assignment.assignedByWorkosUserId,
          brokerageId: assignment.brokerageId,
          createdAt: now + index,
          lenderBrokerageId: assignment.lenderBrokerageId,
          lenderOrganizationId: assignment.lenderOrganizationId,
          lenderOrganizationName: assignment.lenderOrganizationName,
          organizationId: assignment.organizationId,
          proposalId,
          status: "current",
        });
      }
    });

    await expect(
      asLender(t, "user_member").query(
        api.lender_portal.getLenderDashboard,
        {},
      ),
    ).rejects.toThrow("Lender dashboard action limit exceeded");
  });

  test("lets Platform Admin read one organization portfolio with isolated assignment history", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedBackofficePortfolio(t);

    const result = await asAdmin(t).query(
      api.lender_portal.getBackofficeLenderOrganizationPortfolio,
      { lenderOrganizationId: seed.lenderOrganizationId },
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
    expect(
      result.proposals.find(
        (proposal) => proposal.buildName === "Latest Assignment Wins",
      ),
    ).toMatchObject({ assignmentStatus: "current", readOnly: false });
    expect(
      result.proposals.find(
        (proposal) => proposal.buildName === "Withdrawn Proposal",
      ),
    ).toMatchObject({ assignmentStatus: "withdrawn", readOnly: true });
    expect(
      result.proposals.map((proposal) => proposal.buildName),
    ).not.toContain("Other Organization Proposal");
    expect(
      result.proposals.map((proposal) => proposal.buildName),
    ).not.toContain("Cross Brokerage Proposal");
    expect(result.builds).toEqual([
      expect.objectContaining({
        buildId: seed.buildId,
        buildName: "Current Assigned Build",
        proposalId: seed.currentProposalId,
      }),
    ]);
  });

  test("freezes withdrawn public list rows behind the sealed assignment manifest", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedBackofficePortfolio(t);
    const lender = asLender(t, "user_member");

    const before = await lender.query(
      api.lender_portal.listLenderAssignedProposals,
      {},
    );
    const withdrawnBefore = before.find(
      (row) => row.proposalId === seed.withdrawnProposalId,
    );
    const withdrawnPageBefore = await lender.query(
      api.lender_portal.listLenderAssignedProposalPage,
      {
        paginationOpts: { cursor: null, numItems: 20 },
        view: "withdrawn",
      },
    );
    expect(withdrawnBefore).toMatchObject({
      assignmentStatus: "withdrawn",
      buildName: "Withdrawn Proposal",
      location: "Toronto, ON",
      proposalStatus: "approved",
      readOnly: true,
    });

    const manifestId = await t.run(async (ctx) => {
      const assignment = await ctx.db
        .query("proposalLenderAssignments")
        .withIndex("by_proposal_status", (query) =>
          query
            .eq("proposalId", seed.withdrawnProposalId)
            .eq("status", "withdrawn"),
        )
        .unique();
      if (!assignment?.archiveManifestId) {
        throw new Error("Missing withdrawn assignment manifest fixture.");
      }
      await ctx.db.patch(seed.withdrawnProposalId, {
        buildName: "Internal-only withdrawn name",
        location: "99 Internal Only Road",
        status: "closed",
      });
      return assignment.archiveManifestId;
    });

    const after = await lender.query(
      api.lender_portal.listLenderAssignedProposals,
      {},
    );
    expect(
      after.find((row) => row.proposalId === seed.withdrawnProposalId),
    ).toEqual(withdrawnBefore);
    const withdrawnPageAfter = await lender.query(
      api.lender_portal.listLenderAssignedProposalPage,
      {
        paginationOpts: { cursor: null, numItems: 20 },
        view: "withdrawn",
      },
    );
    expect(withdrawnPageAfter.page).toEqual(withdrawnPageBefore.page);
    expect(withdrawnPageAfter.page[0]).toMatchObject({
      assignmentStatus: "withdrawn",
      view: "withdrawn",
    });

    await t.run((ctx) => ctx.db.patch(manifestId, { status: "failed" }));
    await expect(
      lender.query(api.lender_portal.listLenderAssignedProposals, {}),
    ).rejects.toThrow("Withdrawn lender assignment manifest is unavailable.");
    await expect(
      lender.query(api.lender_portal.listLenderAssignedProposalPage, {
        paginationOpts: { cursor: null, numItems: 20 },
        view: "withdrawn",
      }),
    ).rejects.toThrow("Withdrawn lender assignment manifest is unavailable.");
  });

  test("paginates every authorized Proposal in one portfolio view and rejects forged cursors", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedBackofficePortfolio(t);
    await t.run(async (ctx) => {
      const assignment = await ctx.db.get(seed.currentAssignmentId);
      if (!assignment) {
        throw new Error("Missing current assignment fixture.");
      }
      const now = Date.now();
      for (let index = 0; index < 55; index += 1) {
        const proposalId = await ctx.db.insert("buildProposals", {
          brokerageId: assignment.brokerageId,
          buildName: `Paginated Proposal ${String(index + 1).padStart(2, "0")}`,
          borrowerCoPayBps: 2_000,
          borrowerWorkingCapitalLimitCents: 50_000_000,
          createdAt: now + index,
          createdByWorkosUserId: "user_admin",
          interestAnnualBps: 925,
          lenderDrawPolicyLimitCents: 100_000_000,
          location: "Toronto, ON",
          organizationId: assignment.organizationId,
          reviewOutcome: "approved",
          status: "approved",
          totalBudgetCents: 125_000_000,
          updatedAt: now + index,
          updatedByWorkosUserId: "user_admin",
        });
        await ctx.db.insert("proposalLenderAssignments", {
          assignedAt: now + index,
          assignedByRole: "admin",
          assignedByWorkosUserId: "user_admin",
          brokerageId: assignment.brokerageId,
          createdAt: now + index,
          lenderBrokerageId: assignment.lenderBrokerageId,
          lenderOrganizationId: assignment.lenderOrganizationId,
          lenderOrganizationName: assignment.lenderOrganizationName,
          organizationId: assignment.organizationId,
          proposalId,
          status: "current",
        });
      }
    });
    const lender = asLender(t, "user_member");
    const first = await lender.query(
      api.lender_portal.listLenderAssignedProposalPage,
      {
        paginationOpts: { cursor: null, numItems: 50 },
        view: "in_progress",
      },
    );
    expect(first.page).toHaveLength(50);
    expect(first.isDone).toBe(false);
    const second = await lender.query(
      api.lender_portal.listLenderAssignedProposalPage,
      {
        paginationOpts: { cursor: first.continueCursor, numItems: 50 },
        view: "in_progress",
      },
    );
    expect(second.isDone).toBe(true);
    expect(second.page).toHaveLength(7);
    const allRows = [...first.page, ...second.page];
    expect(new Set(allRows.map((row) => row.assignmentId)).size).toBe(57);
    expect(allRows.every((row) => row.view === "in_progress")).toBe(true);
    expect(allRows.map((row) => row.buildName)).not.toContain(
      "Other Organization Proposal",
    );
    expect(allRows.map((row) => row.buildName)).not.toContain(
      "Cross Brokerage Proposal",
    );

    await expect(
      lender.query(api.lender_portal.listLenderAssignedProposalPage, {
        paginationOpts: {
          cursor: JSON.stringify({
            anchorId: "forged-assignment",
            anchorValue: Date.now(),
            scope: "in_progress",
            version: 2,
          }),
          numItems: 20,
        },
        view: "in_progress",
      }),
    ).rejects.toThrow("Proposal queue cursor is invalid");
    await expect(
      lender.query(api.lender_portal.listLenderAssignedProposalPage, {
        paginationOpts: { cursor: first.continueCursor, numItems: 20 },
        view: "approved",
      }),
    ).rejects.toThrow("Proposal queue cursor is invalid");
  });

  test("projects action, waiting, approval, remediation, and closing views without private decision data", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedBackofficePortfolio(t);
    const setup = await t.run(async (ctx) => {
      const now = Date.now();
      const [assignment, proposal] = await Promise.all([
        ctx.db.get(seed.currentAssignmentId),
        ctx.db.get(seed.currentProposalId),
      ]);
      if (!assignment || !proposal?.activeBuildId) {
        throw new Error("Missing Proposal portfolio lifecycle fixture.");
      }
      const build = await ctx.db.get(proposal.activeBuildId);
      if (!build) {
        throw new Error("Missing Proposal portfolio Build fixture.");
      }
      await ctx.db.insert("users", {
        authId: "user_lender_staff",
        createdAt: now,
        email: "user_lender_staff@example.com",
        emailVerified: true,
        name: "Lender Staff",
        sourceEventId: "portfolio_staff_created",
        sourceEventType: "test.lender_portal",
        status: "active",
        updatedAt: now,
        workosUserId: "user_lender_staff",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        roleSlug: "lender-staff",
        roleSlugs: ["lender-staff"],
        sourceEventId: "portfolio_staff_membership",
        sourceEventType: "test.lender_portal",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_portfolio_staff",
        workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        workosUserId: "user_lender_staff",
      });
      await ctx.db.insert("lenderOrganizationAssignments", {
        assignedAt: now,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId: assignment.brokerageId,
        lenderOrganizationId: seed.lenderOrganizationId,
        normalizedEmail: "user_lender_staff@example.com",
        reason: "Proposal portfolio staff fixture",
        status: "active",
        updatedAt: now,
        workosUserId: "user_lender_staff",
      });
      const policy = {
        drawApprovalMode: "both" as const,
        drawLenderQuorum: 1,
        milestoneApprovalMode: "both" as const,
        milestoneLenderQuorum: 1,
        milestoneReceiptInvoiceRequired: false,
        milestoneSiteVisitRequired: false,
      };
      const policyVersionId = await ctx.db.insert(
        "proposalReviewPolicyVersions",
        {
          brokerageId: proposal.brokerageId,
          configuredAt: now,
          configuredByRole: "admin",
          configuredByWorkosUserId: "user_admin",
          idempotencyKey: "portfolio-policy-v1",
          organizationId: proposal.organizationId,
          policy,
          proposalId: proposal._id,
          reason: "Proposal portfolio lifecycle fixture.",
          version: 1,
        },
      );
      const revisionId = await ctx.db.insert("proposalRevisions", {
        assignmentId: assignment._id,
        backOfficeApprovedByWorkosUserId: "user_admin",
        brokerageId: proposal.brokerageId,
        changedCheckpoints: [],
        checkpoints: {
          accessReviewPolicy: policy,
          budget: { totalBudgetCents: proposal.totalBudgetCents },
          builder: {
            builderProfileId: build.builderProfileId,
            displayName: "Northstar Builder",
          },
          milestoneCount: { count: 0 },
          scheduleTimeline: {
            milestonesFingerprint: "portfolio-revision-v1",
            proposedStartDate: null,
            timelineRangeMax: null,
            timelineRangeMin: null,
          },
        },
        createdAt: now,
        createdByRole: "admin",
        createdByWorkosUserId: "user_admin",
        idempotencyKey: "portfolio-revision-v1",
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason: "Proposal portfolio lifecycle fixture.",
        reviewPolicyVersionId: policyVersionId,
        revisionNumber: 1,
      });
      await ctx.db.patch(proposal._id, {
        currentProposalRevisionId: revisionId,
        currentProposalRevisionNumber: 1,
        currentReviewPolicyVersionId: policyVersionId,
      });
      const cycleId = await ctx.db.insert("proposalLenderConfirmationCycles", {
        assignmentId: assignment._id,
        brokerageId: proposal.brokerageId,
        createdAt: now,
        cycleNumber: 1,
        openedAt: now,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        proposalRevisionId: revisionId,
        proposalRevisionNumber: 1,
        status: "pending",
      });
      for (const [index, checkpoint] of [
        "milestoneCount",
        "budget",
        "scheduleTimeline",
        "builder",
        "accessReviewPolicy",
      ].entries()) {
        await ctx.db.insert("proposalLenderConfirmationAcknowledgements", {
          acknowledgedAt: now + index,
          acknowledgedByRole: "lender-staff",
          acknowledgedByWorkosUserId: "user_lender_staff",
          assignmentId: assignment._id,
          brokerageId: proposal.brokerageId,
          checkpoint: checkpoint as
            | "milestoneCount"
            | "budget"
            | "scheduleTimeline"
            | "builder"
            | "accessReviewPolicy",
          confirmationCycleId: cycleId,
          idempotencyKey: `portfolio-staff-ack-${index + 1}`,
          organizationId: proposal.organizationId,
          proposalId: proposal._id,
          proposalRevisionId: revisionId,
          sequence: index + 1,
        });
      }
      return { assignment, cycleId, revisionId };
    });

    const lenderAdmin = asLender(t, "user_member");
    const needsAction = await lenderAdmin.query(
      api.lender_portal.listLenderAssignedProposalPage,
      {
        paginationOpts: { cursor: null, numItems: 20 },
        view: "needs_action",
      },
    );
    expect(needsAction.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          proposalId: seed.currentProposalId,
          view: "needs_action",
        }),
      ]),
    );

    const staffWaiting = await asLenderStaff(t).query(
      api.lender_portal.listLenderAssignedProposalPage,
      {
        paginationOpts: { cursor: null, numItems: 20 },
        view: "in_progress",
      },
    );
    expect(staffWaiting.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          proposalId: seed.currentProposalId,
          view: "in_progress",
        }),
      ]),
    );

    const decisionId = await t.run(async (ctx) => {
      const now = Date.now();
      const decisionId = await ctx.db.insert("proposalLenderApprovals", {
        approvedAt: now,
        approverRole: "lender-admin",
        approverWorkosUserId: "user_member",
        assignmentId: setup.assignment._id,
        brokerageId: setup.assignment.brokerageId,
        confirmationCycleId: setup.cycleId,
        createdAt: now,
        lenderOrganizationId: setup.assignment.lenderOrganizationId,
        organizationId: setup.assignment.organizationId,
        proposalId: seed.currentProposalId,
        proposalRevisionId: setup.revisionId,
        proposalRevisionNumber: 1,
        reason: "PRIVATE LENDER APPROVAL NOTE",
        status: "approved",
      });
      await ctx.db.patch(setup.cycleId, {
        closedAt: now,
        decisionId,
        status: "approved",
      });
      return decisionId;
    });
    const approved = await lenderAdmin.query(
      api.lender_portal.listLenderAssignedProposalPage,
      {
        paginationOpts: { cursor: null, numItems: 20 },
        view: "approved",
      },
    );
    expect(approved.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ proposalId: seed.currentProposalId }),
      ]),
    );
    expect(JSON.stringify(approved)).not.toContain(
      "PRIVATE LENDER APPROVAL NOTE",
    );
    expect(JSON.stringify(approved)).not.toContain("user_member");

    await t.run(async (ctx) => {
      await ctx.db.patch(seed.currentProposalId, { status: "closed" });
    });
    const closed = await lenderAdmin.query(
      api.lender_portal.listLenderAssignedProposalPage,
      {
        paginationOpts: { cursor: null, numItems: 20 },
        view: "closed",
      },
    );
    expect(closed.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ proposalId: seed.currentProposalId }),
      ]),
    );

    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.patch(seed.currentProposalId, { status: "approved" });
      await ctx.db.patch(decisionId, {
        approvedAt: undefined,
        declinedAt: now,
        declinedCheckpoint: "budget",
        reason: "PRIVATE REMEDIATION REQUEST",
        status: "declined",
      });
      await ctx.db.patch(setup.cycleId, { status: "declined" });
    });
    const updatePending = await lenderAdmin.query(
      api.lender_portal.listLenderAssignedProposalPage,
      {
        paginationOpts: { cursor: null, numItems: 20 },
        view: "update_pending",
      },
    );
    expect(updatePending.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ proposalId: seed.currentProposalId }),
      ]),
    );
    expect(JSON.stringify(updatePending)).not.toContain(
      "PRIVATE REMEDIATION REQUEST",
    );
    expect(JSON.stringify(updatePending)).not.toContain("budget");

    await t.run((ctx) =>
      ctx.db.patch(decisionId, {
        lenderOrganizationId: "foreign-lender-organization",
      }),
    );
    await expect(
      lenderAdmin.query(api.lender_portal.listLenderAssignedProposalPage, {
        paginationOpts: { cursor: null, numItems: 20 },
        view: "update_pending",
      }),
    ).rejects.toThrow("Proposal portfolio decision is unavailable");
  });

  test("fails closed for non-admin callers and unavailable target brokerages", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedBackofficePortfolio(t);

    await expect(
      asLender(t).query(
        api.lender_portal.getBackofficeLenderOrganizationPortfolio,
        {
          lenderOrganizationId: seed.lenderOrganizationId,
        },
      ),
    ).rejects.toThrow();
    await expect(
      asAdmin(t).query(
        api.lender_portal.getBackofficeLenderOrganizationPortfolio,
        {
          lenderOrganizationId: seed.unavailableLenderOrganizationId,
        },
      ),
    ).rejects.toThrow("brokerage is unavailable");

    await t.run((ctx) => ctx.db.delete(seed.unavailableLenderOrganizationId));
    await expect(
      asAdmin(t).query(
        api.lender_portal.getBackofficeLenderOrganizationPortfolio,
        {
          lenderOrganizationId: seed.unavailableLenderOrganizationId,
        },
      ),
    ).rejects.toThrow("not found");
  });

  test("projects active members through the canonical admin member query", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedBackofficePortfolio(t);

    const result = await asAdmin(t).query(
      api.lenderOrganizations.listLenderOrganizationMembersForAdmin,
      {
        lenderOrganizationId: seed.lenderOrganizationId,
        paginationOpts: { cursor: null, numItems: 25 },
      },
    );

    expect(result.page).toEqual([
      {
        kind: "member",
        member: expect.objectContaining({
          assignmentStatus: "active",
          canMakeFinalDecision: true,
          email: "member@northstar.example.com",
          name: "Northstar Member",
          roleSlugs: ["lender-admin"],
        }),
      },
    ]);
  });
});

describe("lender Build collaboration and review policy", () => {
  test("assigned lender roles publish, attach, reply, and reuse governed side effects", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedLenderCollaboration(t);
    const staged = await fixture.admin.mutation(
      (api as any).lender_portal.beginLenderBuildCollaborationAssetUpload,
      {
        buildId: fixture.buildId,
        contextKind: "composer",
        fileName: "lender-evidence.pdf",
        mimeType: "application/pdf",
        sizeBytes: 24,
      },
    );
    const storageId = await t.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["governed lender evidence"], {
            type: "application/pdf",
          }),
        ),
    );
    const hash = "a".repeat(64);
    const assetId = await fixture.admin.mutation(
      (api as any).lender_portal
        .finalizeLenderBuildCollaborationAssetUploadForAction,
      {
        buildId: fixture.buildId,
        contentHashSha256: hash,
        fileName: "lender-evidence.pdf",
        mimeType: "application/pdf",
        stagingSessionId: staged.stagingSessionId,
        storageId,
      },
    );
    await t.mutation(
      (internal as any).build_collaboration_asset_maintenance
        .recordBuildCollaborationAssetScanResult,
      {
        assetId,
        computedHashSha256: hash,
        outcome: "clean",
        provider: "test-scanner",
      },
    );

    const postId = await fixture.admin.mutation(
      (api as any).lender_portal.publishLenderBuildCollaborationPost,
      {
        attachmentAssetIds: [assetId],
        buildId: fixture.buildId,
        plainText: "Lender admin update",
        tiptapJson: textDocument("Lender admin update"),
      },
    );
    await fixture.lender.mutation(
      (api as any).lender_portal.publishLenderBuildCollaborationPost,
      {
        buildId: fixture.buildId,
        plainText: "Lender member update",
        tiptapJson: textDocument("Lender member update"),
      },
    );
    const commentId = await fixture.staff.mutation(
      (api as any).lender_portal.addLenderBuildCollaborationResponse,
      {
        buildId: fixture.buildId,
        plainText: "Lender staff response",
        postId,
        tiptapJson: textDocument("Lender staff response"),
      },
    );

    const posts = await fixture.staff.query(
      (api as any).lender_portal.listLenderBuildCollaborationPosts,
      {
        buildId: fixture.buildId,
        paginationOpts: { cursor: null, numItems: 10 },
      },
    );
    expect(
      posts.page
        .filter((entry: any) => entry.kind === "post")
        .map((entry: any) => entry.post.authorRole),
    ).toEqual(expect.arrayContaining(["lender-admin", "lender"]));
    expect(
      posts.page.find(
        (entry: any) => entry.kind === "post" && entry.post._id === postId,
      )?.attachments,
    ).toEqual([
      expect.objectContaining({
        assetId,
        fileName: "lender-evidence.pdf",
        state: "available",
      }),
    ]);

    const responses = await fixture.admin.query(
      (api as any).lender_portal.listLenderBuildCollaborationResponses,
      {
        buildId: fixture.buildId,
        paginationOpts: { cursor: null, numItems: 10 },
        postId,
      },
    );
    expect(responses.page).toEqual([
      expect.objectContaining({
        comment: expect.objectContaining({
          _id: commentId,
          authorRole: "lender-staff",
        }),
        revision: expect.objectContaining({
          plainText: "Lender staff response",
        }),
      }),
    ]);

    const sideEffects = await t.run(async (ctx) => ({
      audits: await ctx.db.query("auditEvents").collect(),
      searchJobs: await ctx.db.query("buildCollaborationSearchJobs").collect(),
      webhookEvents: await ctx.db
        .query("buildCollaborationWebhookEvents")
        .collect(),
    }));
    expect(
      sideEffects.audits.map((event) => event.eventType),
    ).toEqual(
      expect.arrayContaining([
        "build.collaboration.post.published",
        "build.collaboration.comment.published",
      ]),
    );
    expect(
      sideEffects.searchJobs.some(
        (job) => job.ownerId === postId || job.ownerId === commentId,
      ),
    ).toBe(true);
    expect(
      sideEffects.webhookEvents.map((event) => event.eventType),
    ).toEqual(
      expect.arrayContaining([
        "build.collaboration.post.published",
        "build.collaboration.comment.published",
      ]),
    );
  });

  test("paginates complete authorized posts and response threads while excluding private content", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedLenderCollaboration(t);
    const postIds: string[] = [];
    for (let index = 0; index < 13; index += 1) {
      postIds.push(
        await fixture.lender.mutation(
          (api as any).lender_portal.publishLenderBuildCollaborationPost,
          {
            buildId: fixture.buildId,
            plainText: "Authorized update " + index,
            tiptapJson: textDocument("Authorized update " + index),
          },
        ),
      );
    }
    await t.run(async (ctx) => {
      await ctx.db.patch(postIds[1] as any, { audienceMode: "custom" });
      await ctx.db.patch(postIds[2] as any, {
        source: "system",
        systemPostKind: "milestone",
      });
      await ctx.db.patch(postIds[3] as any, { contentState: "moderated" });
    });
    for (let index = 0; index < 23; index += 1) {
      await fixture.staff.mutation(
        (api as any).lender_portal.addLenderBuildCollaborationResponse,
        {
          buildId: fixture.buildId,
          plainText: "Response " + index,
          postId: postIds[0],
          tiptapJson: textDocument("Response " + index),
        },
      );
    }

    const visiblePostIds: string[] = [];
    let postCursor: string | null = null;
    let postsDone = false;
    while (!postsDone) {
      const page: any = await fixture.admin.query(
        (api as any).lender_portal.listLenderBuildCollaborationPosts,
        {
          buildId: fixture.buildId,
          paginationOpts: { cursor: postCursor, numItems: 4 },
        },
      );
      visiblePostIds.push(
        ...page.page
          .filter((entry: any) => entry.kind === "post")
          .map((entry: any) => String(entry.post._id)),
      );
      postCursor = page.continueCursor;
      postsDone = page.isDone;
    }
    expect(visiblePostIds).toHaveLength(10);
    expect(visiblePostIds).not.toEqual(
      expect.arrayContaining([postIds[1], postIds[2], postIds[3]]),
    );

    const responseIds: string[] = [];
    let responseCursor: string | null = null;
    let responsesDone = false;
    while (!responsesDone) {
      const page: any = await fixture.lender.query(
        (api as any).lender_portal.listLenderBuildCollaborationResponses,
        {
          buildId: fixture.buildId,
          paginationOpts: { cursor: responseCursor, numItems: 6 },
          postId: postIds[0],
        },
      );
      responseIds.push(
        ...page.page.map((entry: any) => String(entry.comment._id)),
      );
      responseCursor = page.continueCursor;
      responsesDone = page.isDone;
    }
    expect(responseIds).toHaveLength(23);
    expect(new Set(responseIds).size).toBe(23);
  });

  test("fails closed outside the current assignment and projects only locked policy snapshots", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedLenderCollaboration(t);
    await expect(
      fixture.admin.query(
        (api as any).lender_portal.listLenderBuildCollaborationPosts,
        {
          buildId: fixture.withdrawnBuildId,
          paginationOpts: { cursor: null, numItems: 10 },
        },
      ),
    ).rejects.toThrow("Forbidden");

    await t.run(async (ctx) => {
      const staffAssignment = (
        await ctx.db.query("lenderOrganizationAssignments").collect()
      ).find(
        (assignment) =>
          assignment.workosUserId === "user_lender_staff" &&
          assignment.status === "active",
      );
      if (!staffAssignment) {
        throw new Error("Missing staff assignment fixture.");
      }
      await ctx.db.patch(staffAssignment._id, { status: "inactive" });
    });
    await expect(
      fixture.staff.mutation(
        (api as any).lender_portal.publishLenderBuildCollaborationPost,
        {
          buildId: fixture.buildId,
          plainText: "Must fail",
          tiptapJson: textDocument("Must fail"),
        },
      ),
    ).rejects.toThrow("Forbidden");

    const unavailable = await fixture.admin.query(
      api.lender_portal.getLenderBuildDetail,
      { buildId: fixture.buildId },
    );
    expect(unavailable.reviewPolicy).toEqual({ state: "unavailable" });

    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.buildId, {
        reviewPolicySnapshot: {
          drawApprovalMode: "both",
          drawLenderQuorum: 2,
          milestoneApprovalMode: "lender_quorum",
          milestoneLenderQuorum: 1,
          milestoneReceiptInvoiceRequired: true,
          milestoneSiteVisitRequired: false,
        },
      });
    });
    const locked = await fixture.admin.query(
      api.lender_portal.getLenderBuildDetail,
      { buildId: fixture.buildId },
    );
    expect(locked.reviewPolicy).toEqual({
      draw: { approvalMode: "both", lenderQuorum: 2 },
      milestone: {
        approvalMode: "lender_quorum",
        lenderQuorum: 1,
        receiptInvoiceRequired: true,
        siteVisitRequired: false,
      },
      state: "locked",
    });

    await t.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Missing closed collaboration Build fixture.");
      }
      const now = Date.now();
      await ctx.db.insert("buildCollaborationBuildStates", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        organizationId: build.organizationId,
        revision: 1,
        state: "closed",
        updatedAt: now,
      });
    });
    await expect(
      fixture.admin.mutation(
        (api as any).lender_portal.publishLenderBuildCollaborationPost,
        {
          buildId: fixture.buildId,
          plainText: "Closed archive write",
          tiptapJson: textDocument("Closed archive write"),
        },
      ),
    ).rejects.toThrow("read-only");
  });
});
