/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ORG = "org_01KSNW6JHW9P9YS41DZX1YHHGS";
const PRINCIPAL_BROKER = "user_01KR207FRFHQT46EV9N538XBF3";
const CONTRACTOR_USER = "user_contractor_linked";

function withIdentity(
  t: ReturnType<typeof convexTest>,
  roles: string[],
  subject: string,
  organizationId = ORG,
) {
  return t.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

async function seedFoundation() {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, ["admin", "principle-broker"], PRINCIPAL_BROKER);
  const seed = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORG },
  );
  return { admin, base, seed };
}

const MILESTONES = [
  {
    budgetCents: 50_000_000,
    dayEnd: 24,
    dayStart: 0,
    dependencyKeys: [] as string[],
    durationDays: 24,
    key: "foundation",
    name: "Foundation",
    order: 1,
    submilestones: [
      {
        budgetCents: 18_000_000,
        durationDays: 8,
        key: "forms",
        name: "Forms and pour",
        order: 1,
      },
    ],
  },
  {
    budgetCents: 75_000_000,
    dayEnd: 48,
    dayStart: 24,
    dependencyKeys: ["foundation"],
    durationDays: 24,
    key: "framing",
    name: "Framing",
    order: 2,
    submilestones: [],
  },
];

async function createApprovedBuild(admin: ReturnType<typeof withIdentity>, seed: any) {
  const proposalId = await admin.mutation(
    (api as any).production_proposals.createDraftProposal,
    {
      brokerageId: seed.brokerageId,
      builderProfileId: seed.builderProfileId,
      buildName: "Contractor workspace build",
      location: "12 Workspace Way",
      workosOrganizationId: ORG,
    },
  );
  await admin.mutation(
    (api as any).production_proposals.saveDraftProposalPackage,
    {
      borrowerCoPayBps: 2_000,
      borrowerWorkingCapitalLimitCents: 35_000_000,
      documents: [
        {
          documentType: "permit",
          fileName: "building-permit.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
        },
        {
          documentType: "budget",
          fileName: "internal-budget.xlsx",
          mimeType: "application/vnd.ms-excel",
          sizeBytes: 2048,
        },
      ],
      lenderDrawPolicyLimitCents: 100_000_000,
      milestones: MILESTONES,
      proposalId,
      workosOrganizationId: ORG,
    },
  );
  await admin.run(async (ctx: any) => {
    const now = Date.now();
    await ctx.db.patch(proposalId, {
      selectedPlan: {
        metrics: {
          drawCount: 2,
          drawFeesCents: 100_000,
          interestCostCents: 250_000,
          minimumCashReserveCents: 5_000_000,
          projectedDurationDays: 55,
          startingCashCents: 35_000_000,
          totalCostCents: 350_000,
          totalDrawAmountCents: 100_000_000,
        },
        name: "Cheapest Feasible",
        planKey: "cheapestFeasible",
        recommendationReason: "Selected by contractor workspace test setup.",
        selectedAt: now,
        selectedByWorkosUserId: "contractor_workspace_test_setup",
      },
    });
  });
  await admin.mutation((api as any).production_proposals.submitProposal, {
    proposalId,
    workosOrganizationId: ORG,
  });
  await admin.mutation((api as any).production_proposals.approveProposal, {
    proposalId,
    reason: "Approved for contractor workspace test.",
    workosOrganizationId: ORG,
  });
  const closing = await admin.mutation(
    (api as any).production_proposals.recordOfflineClosing,
    {
      buildStartDate: "2026-08-01",
      ianaTimezone: "America/Toronto",
      loanFacility: { interestAnnualBps: 925, principalCents: 100_000_000 },
      proposalId,
      reason: "Closed for contractor workspace test.",
      workosOrganizationId: ORG,
    },
  );
  return { buildId: closing.buildId as any, proposalId };
}

/**
 * Create a draft proposal with permit + non-permit docs but do NOT submit it.
 * Proposal contractor assignments are only accepted while a proposal is open,
 * so callers attach contractors to the draft before any approval/closing.
 */
async function createDraftProposalWithPermit(
  admin: ReturnType<typeof withIdentity>,
  seed: any,
) {
  const proposalId = await admin.mutation(
    (api as any).production_proposals.createDraftProposal,
    {
      brokerageId: seed.brokerageId,
      builderProfileId: seed.builderProfileId,
      buildName: "Contractor workspace build",
      location: "12 Workspace Way",
      workosOrganizationId: ORG,
    },
  );
  await admin.mutation(
    (api as any).production_proposals.saveDraftProposalPackage,
    {
      borrowerCoPayBps: 2_000,
      borrowerWorkingCapitalLimitCents: 35_000_000,
      documents: [
        {
          documentType: "permit",
          fileName: "building-permit.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
        },
        {
          documentType: "budget",
          fileName: "internal-budget.xlsx",
          mimeType: "application/vnd.ms-excel",
          sizeBytes: 2048,
        },
      ],
      lenderDrawPolicyLimitCents: 100_000_000,
      milestones: MILESTONES,
      proposalId,
      workosOrganizationId: ORG,
    },
  );
  return proposalId;
}

async function createContractorLinked(
  admin: ReturnType<typeof withIdentity>,
  seed: any,
  name = "Northstar Masonry",
  workosUserId = CONTRACTOR_USER,
) {
  // Each distinct contractor must have a distinct normalized email now that
  // canonical email reuse is enforced (PRD §6.2). Derive the email from the
  // WorkOS user id so multiple linked contractors coexist in one brokerage.
  const emailSlug = workosUserId.replace(/^user_/, "").replace(/_/g, "-");
  const contractorId = await admin.mutation(
    (api as any).production_proposals.createContractorProfile,
    {
      brokerageId: seed.brokerageId,
      city: "Toronto, ON",
      email: `${emailSlug}@example.com`,
      kind: "company",
      name,
      phone: "416-555-0101",
      trades: ["masonry", "brick"],
      workosOrganizationId: ORG,
    },
  );
  await admin.mutation(
    (api as any).production_proposals.linkContractorProfileToWorkosUser,
    { contractorId, workosOrganizationId: ORG, workosUserId },
  );
  return contractorId as any;
}

describe("contractor workspace authorization", () => {
  test("denies workspace queries without the contractor role", async () => {
    const { base, admin, seed } = await seedFoundation();
    await createContractorLinked(admin, seed);
    // A backoffice role (admin) is authenticated but is not a contractor.
    const backoffice = withIdentity(base, ["admin"], PRINCIPAL_BROKER);
    await expect(
      backoffice.query((api as any).contractorWorkspace.getContractorProfile, {}),
    ).rejects.toThrow();
  });

  test("denies workspace queries to a contractor role without a linked profile", async () => {
    const { base } = await seedFoundation();
    // Contractor role, but no contractorProfile.accountWorkosUserId === subject.
    const unlinked = withIdentity(base, ["contractor"], "user_unlinked_contractor");
    await expect(
      unlinked.query((api as any).contractorWorkspace.getContractorProfile, {}),
    ).rejects.toThrow(/not linked/);
  });

  test("unlinking the contractor account immediately revokes workspace access", async () => {
    const { admin, base, seed } = await seedFoundation();
    const contractorId = await createContractorLinked(admin, seed);
    const me = withIdentity(base, ["contractor"], CONTRACTOR_USER);

    await expect(
      me.query((api as any).contractorWorkspace.getContractorProfile, {}),
    ).resolves.toMatchObject({ profile: { _id: contractorId } });

    await admin.mutation((api as any).contractorMerge.unlinkContractorAccount, {
      contractorId,
      reason: "Rotate linked account.",
      workosOrganizationId: ORG,
    });

    await expect(
      me.query((api as any).contractorWorkspace.getContractorProfile, {}),
    ).rejects.toThrow(/not linked/);
  });

  test("denies workspace queries to an unauthenticated caller", async () => {
    const base = convexTest(schema, modules);
    await expect(
      base.query((api as any).contractorWorkspace.getContractorProfile, {}),
    ).rejects.toThrow();
  });
});

describe("contractor workspace scope + redaction", () => {
  test("summary and work list return only the linked contractor's assignments", async () => {
    const { admin, base, seed } = await seedFoundation();
    // Proposal contractor assignment requires an open proposal; build
    // contractor assignment requires an approved/active build.
    const draftProposalId = await createDraftProposalWithPermit(admin, seed);
    const { buildId } = await createApprovedBuild(admin, seed);
    const myContractor = await createContractorLinked(admin, seed);
    // A second contractor, not linked to the caller, also assigned to the build.
    const otherContractor = await createContractorLinked(
      admin,
      seed,
      "Other Crew",
      "user_other_contractor",
    );

    await admin.mutation(
      (api as any).production_proposals.assignProposalContractorToMilestone,
      {
        contractorId: myContractor,
        milestoneKey: "foundation",
        proposalId: draftProposalId,
        role: "mason",
        submilestoneKeys: ["forms"],
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      {
        buildId,
        contractorId: myContractor,
        milestoneKey: "foundation",
        role: "mason",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      {
        buildId,
        contractorId: otherContractor,
        milestoneKey: "framing",
        role: "framer",
        workosOrganizationId: ORG,
      },
    );

    const me = withIdentity(base, ["contractor"], CONTRACTOR_USER);
    const summary = await me.query(
      (api as any).contractorWorkspace.getContractorWorkspaceSummary,
      {},
    );
    expect(summary.counts.activeBuildAssignments).toBe(1);
    expect(summary.counts.activeProposalAssignments).toBe(1);

    const workItems = await me.query(
      (api as any).contractorWorkspace.listContractorWorkItems,
      {},
    );
    // Two items for myContractor (one proposal, one build). The other
    // contractor's framing assignment must never appear.
    expect(workItems).toHaveLength(2);
    expect(workItems.every((w: any) => w.milestoneKey !== "framing")).toBe(true);
    expect(workItems.some((w: any) => w.objectType === "proposal")).toBe(true);
    expect(workItems.some((w: any) => w.objectType === "build")).toBe(true);
  });

  test("proposal detail shows permit documents, hides non-permit docs, and forbids unassigned scope", async () => {
    const { admin, base, seed } = await seedFoundation();
    const proposalId = await createDraftProposalWithPermit(admin, seed);
    const myContractor = await createContractorLinked(admin, seed);

    await admin.mutation(
      (api as any).production_proposals.assignProposalContractorToMilestone,
      {
        contractorId: myContractor,
        milestoneKey: "foundation",
        proposalId,
        role: "mason",
        workosOrganizationId: ORG,
      },
    );

    const me = withIdentity(base, ["contractor"], CONTRACTOR_USER);
    const detail = await me.query(
      (api as any).contractorWorkspace.getContractorProposalDetail,
      { proposalId },
    );
    expect(detail.proposal.buildName).toBe("Contractor workspace build");
    expect(detail.assignedScope).toHaveLength(1);
    expect(detail.assignedScope[0].milestoneKey).toBe("foundation");
    // Only permit documents are contractor-visible (PRD §3.17, §15). The
    // seeded internal budget document must be filtered out.
    expect(detail.permitDocuments).toHaveLength(1);
    expect(detail.permitDocuments[0].documentType).toBe("permit");
    // No budgets/financing/lender notes leak into the contractor view.
    expect(detail.totalBudgetCents).toBeUndefined();
    expect(detail.borrowerWorkingCapitalLimitCents).toBeUndefined();
    expect(detail.lenderDrawPolicyLimitCents).toBeUndefined();
    expect(detail.proposal.timelineCurrentDay).toBeUndefined();

    // A contractor assigned only to the build/proposal cannot see a proposal
    // they are not assigned to.
    const otherProposal = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Unrelated proposal",
        location: "99 Elsewhere",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      me.query((api as any).contractorWorkspace.getContractorProposalDetail, {
        proposalId: otherProposal,
      }),
    ).rejects.toThrow(/not assigned/);
  });

  test("document ACL: permits visible by default, non-permit docs only if contractorVisible (PRD §3.17, §3.34)", async () => {
    const { admin, base, seed } = await seedFoundation();
    // createDraftProposalWithPermit seeds a permit (visible by default) and a
    // budget doc (hidden — no contractorVisible flag).
    const proposalId = await createDraftProposalWithPermit(admin, seed);
    const myContractor = await createContractorLinked(admin, seed);
    await admin.mutation(
      (api as any).production_proposals.assignProposalContractorToMilestone,
      {
        contractorId: myContractor,
        milestoneKey: "foundation",
        proposalId,
        role: "mason",
        workosOrganizationId: ORG,
      },
    );

    // Attach a contractor-visible non-permit document directly (ACL flag set).
    await admin.run(async (ctx: any) => {
      await ctx.db.insert("proposalDocuments", {
        brokerageId: seed.brokerageId,
        contractorVisible: true,
        createdAt: Date.now(),
        documentType: "plan",
        fileName: "site-plan.pdf",
        mimeType: "application/pdf",
        organizationId: ORG,
        proposalId,
        sizeBytes: 512,
        status: "uploaded",
        updatedAt: Date.now(),
        uploadedByWorkosUserId: PRINCIPAL_BROKER,
      });
    });

    const me = withIdentity(base, ["contractor"], CONTRACTOR_USER);
    const detail = await me.query(
      (api as any).contractorWorkspace.getContractorProposalDetail,
      { proposalId },
    );
    const types = detail.permitDocuments.map((d: any) => d.documentType);
    expect(types).toContain("permit");
    expect(types).toContain("plan"); // explicitly contractor-visible
    expect(types).not.toContain("budget"); // private financing material
  });

  test("build detail is scope-limited and forbids unassigned builds", async () => {
    const { admin, base, seed } = await seedFoundation();
    const { buildId } = await createApprovedBuild(admin, seed);
    const myContractor = await createContractorLinked(admin, seed);

    await admin.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      {
        buildId,
        contractorId: myContractor,
        milestoneKey: "foundation",
        role: "mason",
        submilestoneKeys: ["forms"],
        workosOrganizationId: ORG,
      },
    );

    const me = withIdentity(base, ["contractor"], CONTRACTOR_USER);
    const detail = await me.query(
      (api as any).contractorWorkspace.getContractorBuildDetail,
      { buildId },
    );
    expect(detail.build.buildName).toBe("Contractor workspace build");
    expect(detail.assignedScope[0].milestoneKey).toBe("foundation");
    expect(detail.assignedScope[0].buildSubmilestoneId).toBeDefined();
    expect(detail.assignedScope[0].costDocumentCaptureEligible).toBe(true);
    expect(detail.permitDocuments.every((d: any) => d.documentType === "permit")).toBe(true);
    // Raw/internal ratings and financing never reach the contractor.
    expect(detail.ratings).toBeUndefined();
    expect(detail.totalBudgetCents).toBeUndefined();
  });

  test("assigned contractor starts only the assigned submilestone and leaves its parent planned", async () => {
    const { admin, base, seed } = await seedFoundation();
    const { buildId } = await createApprovedBuild(admin, seed);
    const contractorId = await createContractorLinked(admin, seed);
    await admin.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      {
        buildId,
        contractorId,
        milestoneKey: "foundation",
        role: "mason",
        submilestoneKeys: ["forms"],
        workosOrganizationId: ORG,
      },
    );
    const me = withIdentity(base, ["contractor"], CONTRACTOR_USER);
    const actualStartedAt = Date.now() - 60 * 60 * 1000;

    await me.mutation(
      (api as any).contractorWorkspace.startAssignedSubmilestone,
      {
        actualStartedAt,
        buildId,
        idempotencyKey: "contractor-forms-start-001",
        milestoneKey: "foundation",
        source: "guided_field_workflow",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (query: any) =>
          query.eq("buildId", buildId).eq("key", "foundation"),
        )
        .unique();
      const submilestone = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_milestone", (query: any) =>
          query.eq("buildMilestoneId", milestone._id),
        )
        .first();
      expect(milestone).toMatchObject({ status: "planned" });
      expect(milestone.actualStartedAt).toBeUndefined();
      expect(submilestone).toMatchObject({
        actualStartedAt,
        startedByWorkosUserId: CONTRACTOR_USER,
        status: "in_progress",
      });
    });
  });

  test("public canonical start admits only the exact assigned child and fails closed after removal", async () => {
    const { admin, base, seed } = await seedFoundation();
    const { buildId } = await createApprovedBuild(admin, seed);
    const contractorId = await createContractorLinked(admin, seed);
    await admin.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      {
        buildId,
        contractorId,
        milestoneKey: "foundation",
        role: "mason",
        submilestoneKeys: ["forms"],
        workosOrganizationId: ORG,
      },
    );
    const me = withIdentity(base, ["contractor"], CONTRACTOR_USER);
    const startInput = {
      actualStartedAt: Date.now() - 60 * 60 * 1000,
      buildId,
      idempotencyKey: "public-contractor-forms-start-001",
      milestoneKey: "foundation",
      source: "submilestone_detail" as const,
      startParent: false,
      submilestoneKey: "forms",
      workosOrganizationId: ORG,
    };
    await me.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      startInput,
    );
    await admin.run(async (ctx: any) => {
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (query: any) =>
          query.eq("buildId", buildId).eq("key", "foundation"),
        )
        .unique();
      expect(milestone).toMatchObject({ status: "planned" });
      const submilestone = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_milestone", (query: any) =>
          query.eq("buildMilestoneId", milestone._id),
        )
        .first();
      expect(submilestone).toMatchObject({ status: "in_progress" });
      const assignment = await ctx.db
        .query("milestoneContractorAssignments")
        .withIndex("by_contractor_build", (query: any) =>
          query.eq("contractorId", contractorId).eq("buildId", buildId),
        )
        .first();
      await ctx.db.patch(assignment._id, { status: "removed" });
    });
    await expect(
      me.mutation(
        (api as any).production_proposals.startActiveBuildMilestone,
        {
          ...startInput,
          actualStartedAt: Date.now() - 30 * 60 * 1000,
          idempotencyKey: "public-contractor-forms-start-002",
        },
      ),
    ).rejects.toThrow(/Assignment required/i);
  });

  test("ENG-409 authenticated role matrix keeps Work Allocation as the only contractor authority", async () => {
    const { admin, base, seed } = await seedFoundation();
    const assignedBuild = await createApprovedBuild(admin, seed);
    const assignedContractorId = await createContractorLinked(
      admin,
      seed,
      "Assigned ENG-409 contractor",
      "user_eng409_assigned",
    );
    await admin.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      {
        buildId: assignedBuild.buildId,
        contractorId: assignedContractorId,
        milestoneKey: "foundation",
        role: "mason",
        submilestoneKeys: ["forms"],
        workosOrganizationId: ORG,
      },
    );
    const unassignedContractorId = await createContractorLinked(
      admin,
      seed,
      "Unassigned ENG-409 contractor",
      "user_eng409_unassigned",
    );
    await admin.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      {
        buildId: assignedBuild.buildId,
        contractorId: unassignedContractorId,
        milestoneKey: "foundation",
        role: "observer",
        workosOrganizationId: ORG,
      },
    );

    // A build participant and a mention/follow record are collaboration
    // projections only; neither row is an execution grant.
    await admin.run(async (ctx: any) => {
      const build = await ctx.db.get(assignedBuild.buildId);
      const now = Date.now();
      if (!build) {
        throw new Error("ENG-409 build fixture is unavailable.");
      }
      const postId = await ctx.db.insert("buildCollaborationPosts", {
        acknowledgementRequired: false,
        agentDrafted: false,
        audienceFloorTier: 0,
        audienceMode: "build_wide",
        authorDisplayNameSnapshot: "ENG-409 test post",
        authorRole: "admin",
        authorRolesSnapshot: ["admin"],
        brokerageId: build.brokerageId,
        buildId: build._id,
        commentCount: 0,
        contentState: "active",
        createdAt: now,
        lastMeaningfulActivityAt: now,
        openActionItemCount: 0,
        organizationId: build.organizationId,
        postType: "update",
        readRevision: 1,
        revision: 1,
        source: "human",
        threadRevision: 0,
        threadState: "open",
        updatedAt: now,
      });
      await ctx.db.insert("buildParticipants", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        displayNameSnapshot: "Self-joined ENG-409 contractor",
        joinedAt: now,
        organizationId: build.organizationId,
        participationPeriod: 1,
        role: "contractor",
        status: "active",
        updatedAt: now,
        validFrom: now,
        workosUserId: "user_eng409_unassigned",
      });
      await ctx.db.insert("buildCollaborationFollows", {
        active: true,
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        organizationId: build.organizationId,
        postId,
        reason: "mentioned",
        updatedAt: now,
        workosUserId: "user_eng409_unassigned",
      });
    });

    const unassigned = withIdentity(
      base,
      ["contractor"],
      "user_eng409_unassigned",
    );
    await expect(
      unassigned.mutation(
        (api as any).production_proposals.startActiveBuildMilestone,
        {
          actualStartedAt: Date.now() - 60 * 60 * 1000,
          buildId: assignedBuild.buildId,
          idempotencyKey: "eng409-unassigned-child-start",
          milestoneKey: "foundation",
          source: "submilestone_detail",
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/Assignment required/i);

    const assigned = withIdentity(base, ["contractor"], "user_eng409_assigned");
    await expect(
      assigned.mutation(
        (api as any).production_proposals.startActiveBuildMilestone,
        {
          actualStartedAt: Date.now() - 60 * 60 * 1000,
          buildId: assignedBuild.buildId,
          idempotencyKey: "eng409-contractor-parent-start",
          milestoneKey: "foundation",
          source: "milestone_detail",
          startParent: true,
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/Assigned Contractors may start only an assigned Sub-milestone/i);

    const contractorStart = await assigned.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      {
        actualStartedAt: Date.now() - 45 * 60 * 1000,
        buildId: assignedBuild.buildId,
        idempotencyKey: "eng409-contractor-child-start",
        milestoneKey: "foundation",
        source: "submilestone_detail",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(contractorStart).toMatchObject({
      parentStarted: false,
      submilestoneKey: "forms",
    });

    const reviewOnlyLender = withIdentity(base, ["broker-staff"], "user_broker_staff");
    await expect(
      reviewOnlyLender.mutation(
        (api as any).production_proposals.startActiveBuildMilestone,
        {
          actualStartedAt: Date.now() - 30 * 60 * 1000,
          buildId: assignedBuild.buildId,
          idempotencyKey: "eng409-lender-start",
          milestoneKey: "foundation",
          source: "milestone_detail",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/lender roles cannot originate/i);

    const adminOperator = withIdentity(base, ["admin"], PRINCIPAL_BROKER);
    const adminOperateBuild = await createApprovedBuild(admin, seed);
    await expect(
      adminOperator.mutation(
        (api as any).production_proposals.startActiveBuildMilestone,
        {
          actualStartedAt: Date.now() - 30 * 60 * 1000,
          buildId: adminOperateBuild.buildId,
          idempotencyKey: "eng409-admin-operate-start",
          milestoneKey: "foundation",
          source: "milestone_detail",
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toMatchObject({
      milestoneKey: "foundation",
    });

    const builderBuild = await createApprovedBuild(admin, seed);
    const builder = withIdentity(base, ["builder"], "user_builder");
    await expect(
      builder.mutation(
        (api as any).production_proposals.startActiveBuildMilestone,
        {
          actualStartedAt: Date.now() - 30 * 60 * 1000,
          buildId: builderBuild.buildId,
          idempotencyKey: "eng409-builder-parent-child-start",
          milestoneKey: "foundation",
          source: "submilestone_detail",
          startParent: true,
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toMatchObject({ parentStarted: true, submilestoneKey: "forms" });

    const staffBuild = await createApprovedBuild(admin, seed);
    const staffUser = "user_eng409_staff";
    await admin.run(async (ctx: any) => {
      const now = Date.now();
      const linkId = await ctx.db.insert("builderAccountLinks", {
        assignedEmail: `${staffUser}@example.com`,
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        createdAt: now,
        role: "staff",
        status: "active",
        updatedAt: now,
        workosUserId: staffUser,
      });
      for (const resourceType of ["milestone", "submilestone"] as const) {
        await ctx.db.insert("builderStaffPermissionGrants", {
          brokerageId: seed.brokerageId,
          buildId: staffBuild.buildId,
          builderAccountLinkId: linkId,
          builderProfileId: seed.builderProfileId,
          canCreate: false,
          canDelete: false,
          canUpdate: true,
          canView: true,
          createdAt: now,
          createdByWorkosUserId: PRINCIPAL_BROKER,
          organizationId: ORG,
          proposalId: staffBuild.proposalId,
          resourceType,
          scope: "activeBuild",
          updatedAt: now,
          updatedByWorkosUserId: PRINCIPAL_BROKER,
          workosUserId: staffUser,
        });
      }
    });
    const staff = withIdentity(base, ["builder-staff"], staffUser);
    await expect(
      staff.mutation(
        (api as any).production_proposals.startActiveBuildMilestone,
        {
          actualStartedAt: Date.now() - 30 * 60 * 1000,
          buildId: staffBuild.buildId,
          idempotencyKey: "eng409-staff-parent-child-start",
          milestoneKey: "foundation",
          source: "submilestone_detail",
          startParent: true,
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toMatchObject({ parentStarted: true, submilestoneKey: "forms" });
  });

  test("rejects contractor start commands whose caller or assignment projection crosses an organization boundary", async () => {
    const { admin, base, seed } = await seedFoundation();
    const { buildId } = await createApprovedBuild(admin, seed);
    const contractorId = await createContractorLinked(admin, seed);
    await admin.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      {
        buildId,
        contractorId,
        milestoneKey: "foundation",
        role: "mason",
        submilestoneKeys: ["forms"],
        workosOrganizationId: ORG,
      },
    );
    const input = {
      actualStartedAt: Date.now() - 60 * 60 * 1000,
      buildId,
      idempotencyKey: "contractor-cross-org-start-001",
      milestoneKey: "foundation",
      source: "guided_field_workflow" as const,
      submilestoneKey: "forms",
      workosOrganizationId: ORG,
    };
    const crossOrganizationCaller = withIdentity(
      base,
      ["contractor"],
      CONTRACTOR_USER,
      "org_other",
    );

    await expect(
      crossOrganizationCaller.mutation(
        (api as any).contractorWorkspace.startAssignedSubmilestone,
        input,
      ),
    ).rejects.toThrow(/contractor build scope/i);

    await admin.run(async (ctx: any) => {
      const assignment = await ctx.db
        .query("milestoneContractorAssignments")
        .withIndex("by_contractor_build", (query: any) =>
          query.eq("contractorId", contractorId).eq("buildId", buildId),
        )
        .first();
      await ctx.db.patch(assignment._id, { organizationId: "org_other" });
    });
    const contractor = withIdentity(base, ["contractor"], CONTRACTOR_USER);
    await expect(
      contractor.mutation(
        (api as any).contractorWorkspace.startAssignedSubmilestone,
        {
          ...input,
          idempotencyKey: "contractor-cross-org-start-002",
        },
      ),
    ).rejects.toThrow(/assignment target mismatch|not assigned/i);

    await admin.run(async (ctx: any) => {
      const assignment = await ctx.db
        .query("milestoneContractorAssignments")
        .withIndex("by_contractor_build", (query: any) =>
          query.eq("contractorId", contractorId).eq("buildId", buildId),
        )
        .first();
      await ctx.db.patch(assignment._id, { organizationId: ORG });
      await ctx.db.patch(contractorId, { organizationId: "org_other" });
    });
    await expect(
      contractor.mutation(
        (api as any).contractorWorkspace.startAssignedSubmilestone,
        {
          ...input,
          idempotencyKey: "contractor-cross-org-start-003",
        },
      ),
    ).rejects.toThrow(/contractor build scope/i);

    await admin.run(async (ctx: any) => {
      await ctx.db.patch(contractorId, { organizationId: ORG });
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (query: any) =>
          query.eq("buildId", buildId).eq("key", "foundation"),
        )
        .unique();
      await ctx.db.patch(milestone._id, { organizationId: "org_other" });
    });
    await expect(
      contractor.mutation(
        (api as any).contractorWorkspace.startAssignedSubmilestone,
        {
          ...input,
          idempotencyKey: "contractor-cross-org-start-004",
        },
      ),
    ).rejects.toThrow(/assignment target mismatch/i);
  });

  test("work items show acknowledged after the contractor acknowledges an assignment", async () => {
    const { admin, base, seed } = await seedFoundation();
    const { buildId } = await createApprovedBuild(admin, seed);
    const contractorId = await createContractorLinked(admin, seed);

    await admin.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      {
        buildId,
        contractorId,
        milestoneKey: "foundation",
        role: "mason",
        workosOrganizationId: ORG,
      },
    );
    const assignment = await admin.run(async (ctx: any) =>
      ctx.db
        .query("milestoneContractorAssignments")
        .withIndex("by_contractor_build", (q: any) =>
          q.eq("contractorId", contractorId).eq("buildId", buildId),
        )
        .first(),
    );

    const me = withIdentity(base, ["contractor"], CONTRACTOR_USER);
    await me.mutation(
      (api as any).contractorEvidence.acknowledgeContractorAssignment,
      {
        assignmentType: "build",
        buildAssignmentId: assignment._id,
        kind: "assignment",
        workosOrganizationId: ORG,
      },
    );

    const workItems = await me.query(
      (api as any).contractorWorkspace.listContractorWorkItems,
      {},
    );
    expect(workItems).toHaveLength(1);
    expect(workItems[0].acknowledgementStatus).toBe("acknowledged");
  });
});

describe("contractor profile", () => {
  test("exposes operational fields and readiness, hides raw ratings", async () => {
    const { admin, base, seed } = await seedFoundation();
    await createContractorLinked(admin, seed);

    const me = withIdentity(base, ["contractor"], CONTRACTOR_USER);
    const profile = await me.query(
      (api as any).contractorWorkspace.getContractorProfile,
      {},
    );
    expect(profile.profile.name).toBe("Northstar Masonry");
    expect(profile.operational.trades).toEqual(["masonry", "brick"]);
    expect(profile.readiness.completenessPercent).toBeGreaterThanOrEqual(0);
    // Rates are optional and surface as guidance, never a blocker (PRD §3.20).
    expect(profile.readiness.missingFields).toContain(
      "default rate (optional)",
    );
    // Internal ratings are never exposed (PRD §3.18, §18).
    expect(profile.ratings).toBeUndefined();
  });

  test("operational profile update writes audit and persists operational rows", async () => {
    const { admin, base, seed } = await seedFoundation();
    await createContractorLinked(admin, seed);

    const me = withIdentity(base, ["contractor"], CONTRACTOR_USER);
    const result = await me.mutation(
      (api as any).contractorWorkspace.updateContractorOperationalProfile,
      {
        availabilityWindows: [
          { dayOfWeek: 1, endMinute: 960, startMinute: 480, timezone: "America/Toronto" },
        ],
        capabilities: [
          { capabilityKey: "brick-siding", label: "Brick siding", trade: "masonry" },
        ],
        complianceNotes: "WSIB current",
        description: "Masonry specialists",
        equipment: [
          { equipmentKey: "telehandler", name: "Telehandler", quantity: 1 },
        ],
        serviceAreaPrimaryCity: "Toronto",
        serviceAreaRadiusKm: 50,
        trades: ["masonry"],
        website: "https://northstar.example",
      },
    );
    expect(result.contractorId).toBeDefined();

    const after = await me.query(
      (api as any).contractorWorkspace.getContractorProfile,
      {},
    );
    expect(after.operational.description).toBe("Masonry specialists");
    expect(after.operational.website).toBe("https://northstar.example");
    expect(after.operational.serviceArea.primaryCity).toBe("Toronto");
    expect(after.operational.serviceArea.radiusKm).toBe(50);
    expect(after.operational.capabilities).toHaveLength(1);
    expect(after.operational.equipment).toHaveLength(1);
    expect(after.operational.availabilityWindows).toHaveLength(1);

    // Audit event recorded (PRD §43).
    const events = await admin.run(async (ctx: any) => {
      return await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q.eq("entityType", "contractorProfile").eq("entityId", result.contractorId),
        )
        .collect();
    });
    expect(
      events.some((e: any) => e.eventType === "contractor.profile.operational_updated"),
    ).toBe(true);
  });

  test("identity-sensitive edits create a review request, not a direct change", async () => {
    const { admin, base, seed } = await seedFoundation();
    const contractorId = await createContractorLinked(admin, seed);

    const me = withIdentity(base, ["contractor"], CONTRACTOR_USER);
    const requestId = await me.mutation(
      (api as any).contractorWorkspace.requestContractorProfileReview,
      {
        reason: "Company renamed after incorporation.",
        requestedFields: { name: "Northstar Masonry Inc." },
        reviewType: "legal_name_change",
      },
    );
    expect(requestId).toBeDefined();

    // The review request is pending and the profile name is unchanged.
    const review = await admin.run(async (ctx: any) =>
      ctx.db.get(requestId),
    );
    expect(review.status).toBe("pending");
    expect(review.reviewType).toBe("legal_name_change");

    const profile = await me.query(
      (api as any).contractorWorkspace.getContractorProfile,
      {},
    );
    expect(profile.profile.name).toBe("Northstar Masonry");
    expect(contractorId).toBeDefined();
  });
});

describe("contractor email normalization", () => {
  test("normalizeContractorEmail lowercases, validates structure, rejects garbage", async () => {
    const { normalizeContractorEmail } = await import("./contractorWorkspace");
    expect(normalizeContractorEmail("Masonry@Example.COM")).toBe(
      "masonry@example.com",
    );
    expect(normalizeContractorEmail("  spaces@example.com  ")).toBe(
      "spaces@example.com",
    );
    expect(normalizeContractorEmail(undefined)).toBe("");
    expect(normalizeContractorEmail("no-at-sign")).toBe("");
    expect(normalizeContractorEmail("nodomain@")).toBe("");
    expect(normalizeContractorEmail("no-dot@example")).toBe("");
  });
});

describe("contractor canonical email reuse (PRD §6.2, §7.4)", () => {
  test("builder/backoffice creation with an existing normalized email reuses the canonical profile", async () => {
    const { admin, seed } = await seedFoundation();
    const first = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "Roofer@Example.com",
        kind: "company",
        name: "Apex Roofing",
        trades: ["roofing"],
        workosOrganizationId: ORG,
      },
    );
    // Same email with different casing/whitespace must resolve to the same
    // canonical profile instead of creating a duplicate (PRD §6.2).
    const reused = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "  roofer@example.com  ",
        kind: "company",
        name: "Apex Roofing Inc.",
        trades: ["roofing", "flashing"],
        workosOrganizationId: ORG,
      },
    );
    expect(reused).toBe(first);
  });

  test("no-email contractor creation does not auto-merge and creates a separate profile", async () => {
    const { admin, seed } = await seedFoundation();
    const withoutEmail = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        kind: "individual",
        name: "Field Crew Lead",
        trades: ["labour"],
        workosOrganizationId: ORG,
      },
    );
    const another = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        kind: "individual",
        name: "Field Crew Lead",
        trades: ["labour"],
        workosOrganizationId: ORG,
      },
    );
    // No-email records are never auto-merged (PRD §3.10, §6.2).
    expect(withoutEmail).not.toBe(another);
  });

  test("created profiles carry a source badge distinguishing backoffice vs builder creation", async () => {
    const { admin, seed } = await seedFoundation();
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        kind: "company",
        name: "Sourced Contractor",
        trades: ["electrical"],
        workosOrganizationId: ORG,
      },
    );
    const profile = await admin.run(async (ctx: any) => ctx.db.get(contractorId));
    expect(profile.source).toBe("backoffice_created");
  });
});
