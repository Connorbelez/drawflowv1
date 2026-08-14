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
) {
  return t.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId: ORG,
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
    submilestones: [],
  },
];

async function createApprovedBuild(admin: ReturnType<typeof withIdentity>, seed: any) {
  const proposalId = await admin.mutation(
    (api as any).production_proposals.createDraftProposal,
    {
      brokerageId: seed.brokerageId,
      builderProfileId: seed.builderProfileId,
      buildName: "Evidence build",
      location: "1 Evidence Way",
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
          fileName: "permit.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
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
        recommendationReason: "Selected by contractor evidence test setup.",
        selectedAt: now,
        selectedByWorkosUserId: "contractor_evidence_test_setup",
      },
    });
  });
  await admin.mutation((api as any).production_proposals.submitProposal, {
    proposalId,
    workosOrganizationId: ORG,
  });
  await admin.mutation((api as any).production_proposals.approveProposal, {
    proposalId,
    reason: "ok",
    workosOrganizationId: ORG,
  });
  // Past start date so the build lands as active (not future_start).
  await admin.mutation(
    (api as any).production_proposals.recordProposalClosing,
    {
      buildStartDate: "2026-01-01",
      ianaTimezone: "America/Toronto",
      loanFacility: { interestAnnualBps: 925, principalCents: 100_000_000 },
      proposalId,
      reason: "closed",
      workosOrganizationId: ORG,
    },
  );
  const closing = await admin.mutation(
    (api as any).production_proposals.activateClosedProposal,
    {
      proposalId,
      reason: "closed",
      workosOrganizationId: ORG,
    },
  );
  return { buildId: closing.buildId as any };
}

async function createContractorLinked(
  admin: ReturnType<typeof withIdentity>,
  seed: any,
  workosUserId = CONTRACTOR_USER,
) {
  const emailSlug = workosUserId.replace(/^user_/, "").replace(/_/g, "-");
  const contractorId = await admin.mutation(
    (api as any).production_proposals.createContractorProfile,
    {
      brokerageId: seed.brokerageId,
      email: `${emailSlug}@example.com`,
      kind: "company",
      name: "Evidence Co",
      trades: ["masonry"],
      workosOrganizationId: ORG,
    },
  );
  await admin.mutation(
    (api as any).production_proposals.linkContractorProfileToWorkosUser,
    { contractorId, workosOrganizationId: ORG, workosUserId },
  );
  return contractorId as any;
}

async function seedContractorWithBuildAssignment() {
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
  const me = withIdentity(base, ["contractor"], CONTRACTOR_USER);
  const assignment = await admin.run(async (ctx: any) =>
    ctx.db
      .query("milestoneContractorAssignments")
      .withIndex("by_contractor_build", (q: any) =>
        q.eq("contractorId", contractorId).eq("buildId", buildId),
      )
      .first(),
  );
  return { admin, base, me, buildId, contractorId, assignmentId: assignment._id };
}

/** Store a placeholder blob and return a valid _storage id for tests. */
async function storeBlob(
  admin: ReturnType<typeof withIdentity>,
  contents = "evidence",
): Promise<string> {
  return (await admin.run(async (ctx: any) => {
    return await ctx.storage.store(new Blob([contents], { type: "image/jpeg" }));
  })) as string;
}

describe("contractor evidence (PRD §8.7)", () => {
  test("contractor uploads evidence constrained to their own assignment scope", async () => {
    const { admin, me, buildId, assignmentId } = await seedContractorWithBuildAssignment();
    const evidenceApi = (api as any).contractorEvidence;
    const storageId = await storeBlob(admin);

    const evidenceId = await me.mutation(
      evidenceApi.uploadContractorSupportingEvidence,
      {
        assignmentType: "build",
        buildAssignmentId: assignmentId,
        caption: "Forms poured",
        fileName: "pour.jpg",
        milestoneKey: "foundation",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        storageId,
        workosOrganizationId: ORG,
      },
    );
    expect(evidenceId).toBeDefined();

    const list = await me.query(evidenceApi.listContractorEvidence, {
      buildId,
      workosOrganizationId: ORG,
    });
    expect(list).toHaveLength(1);
    expect(list[0].source).toBe("contractor_submitted");
    expect(list[0].feedbackState).toBe("submitted");
  });

  test("evidence upload to an unowned assignment is forbidden", async () => {
    const { admin, base, seed } = await seedFoundation();
    const evidenceApi = (api as any).contractorEvidence;
    const storageId = await storeBlob(admin);
    const { buildId } = await createApprovedBuild(admin, seed);
    // 'me' is a linked contractor assigned to foundation.
    const myContractor = await createContractorLinked(admin, seed, CONTRACTOR_USER);
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
    // A different contractor's assignment on framing.
    const otherId = await createContractorLinked(admin, seed, "user_other");
    await admin.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      {
        buildId,
        contractorId: otherId,
        milestoneKey: "foundation",
        role: "helper",
        workosOrganizationId: ORG,
      },
    );
    const otherAssignment = await admin.run(async (ctx: any) =>
      ctx.db
        .query("milestoneContractorAssignments")
        .withIndex("by_contractor_build", (q: any) =>
          q.eq("contractorId", otherId).eq("buildId", buildId),
        )
        .first(),
    );
    const me = withIdentity(base, ["contractor"], CONTRACTOR_USER);
    await expect(
      me.mutation(evidenceApi.uploadContractorSupportingEvidence, {
        assignmentType: "build",
        buildAssignmentId: otherAssignment._id,
        caption: "not mine",
        fileName: "x.jpg",
        milestoneKey: "foundation",
        mimeType: "image/jpeg",
        sizeBytes: 1,
        storageId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/own assignment/);
  });

  test("unsupported file types are rejected", async () => {
    const { admin, me, assignmentId } = await seedContractorWithBuildAssignment();
    const evidenceApi = (api as any).contractorEvidence;
    const storageId = await storeBlob(admin);
    await expect(
      me.mutation(evidenceApi.uploadContractorSupportingEvidence, {
        assignmentType: "build",
        buildAssignmentId: assignmentId,
        caption: "doc",
        fileName: "secret.docx",
        milestoneKey: "foundation",
        mimeType: "application/vnd.openxmlformats",
        sizeBytes: 1,
        storageId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/Unsupported evidence file type/);
  });

  test("retrying the same evidence upload keeps one authoritative evidence row", async () => {
    const { admin, me, buildId, assignmentId } =
      await seedContractorWithBuildAssignment();
    const evidenceApi = (api as any).contractorEvidence;
    const storageId = await storeBlob(admin, "same-evidence");
    const input = {
      assignmentType: "build" as const,
      buildAssignmentId: assignmentId,
      caption: "Same pour photo",
      fileName: "same-pour.jpg",
      milestoneKey: "foundation",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      storageId,
      workosOrganizationId: ORG,
    };

    const first = await me.mutation(
      evidenceApi.uploadContractorSupportingEvidence,
      input,
    );
    const retry = await me.mutation(
      evidenceApi.uploadContractorSupportingEvidence,
      input,
    );
    expect(retry).toBe(first);

    const list = await me.query(evidenceApi.listContractorEvidence, {
      buildId,
      workosOrganizationId: ORG,
    });
    expect(list).toHaveLength(1);
  });

  test("backoffice reviews evidence and contractor addresses feedback (PRD §14.4)", async () => {
    const { admin, me, buildId, assignmentId } =
      await seedContractorWithBuildAssignment();
    const evidenceApi = (api as any).contractorEvidence;
    const storageId = await storeBlob(admin);
    const evidenceId = await me.mutation(
      evidenceApi.uploadContractorSupportingEvidence,
      {
        assignmentType: "build",
        buildAssignmentId: assignmentId,
        caption: "First pass",
        fileName: "p.jpg",
        milestoneKey: "foundation",
        mimeType: "image/png",
        sizeBytes: 1,
        storageId,
        workosOrganizationId: ORG,
      },
    );

    // Backoffice requests more context.
    await admin.mutation(evidenceApi.reviewContractorEvidence, {
      evidenceId,
      feedbackState: "more_context_requested",
      note: "Need a wider shot.",
      workosOrganizationId: ORG,
    });

    // Contractor addresses the feedback.
    await me.mutation(evidenceApi.addressContractorEvidenceFeedback, {
      evidenceId,
      note: "Re-shot, see new upload.",
      workosOrganizationId: ORG,
    });

    const list = await me.query(evidenceApi.listContractorEvidence, {
      buildId,
      workosOrganizationId: ORG,
    });
    expect(list[0].feedbackState).toBe("addressed");
  });

  test("evidence feedback preserves contractor, build, and evidence identity through the return path", async () => {
    const { admin, me, buildId, contractorId, assignmentId } =
      await seedContractorWithBuildAssignment();
    const evidenceApi = (api as any).contractorEvidence;
    const storageId = await storeBlob(admin, "identity-handoff");
    const evidenceId = await me.mutation(
      evidenceApi.uploadContractorSupportingEvidence,
      {
        assignmentType: "build",
        buildAssignmentId: assignmentId,
        caption: "Identity handoff",
        fileName: "identity.jpg",
        milestoneKey: "foundation",
        mimeType: "image/jpeg",
        sizeBytes: 1,
        storageId,
        workosOrganizationId: ORG,
      },
    );

    await admin.mutation(evidenceApi.reviewContractorEvidence, {
      evidenceId,
      feedbackState: "replacement_requested",
      note: "Need a wider shot.",
      workosOrganizationId: ORG,
    });

    const notification = await admin.run(async (ctx: any) =>
      ctx.db
        .query("contractorNotifications")
        .withIndex("by_contractor", (q: any) => q.eq("contractorId", contractorId))
        .first(),
    );
    expect(notification.kind).toBe("evidence_feedback");
    expect(notification.contractorId).toBe(contractorId);
    expect(notification.buildId).toBe(buildId);
    expect(notification.evidenceId).toBe(evidenceId);
    expect(notification.milestoneKey).toBe("foundation");

    await me.mutation(evidenceApi.addressContractorEvidenceFeedback, {
      evidenceId,
      note: "Replacement uploaded.",
      workosOrganizationId: ORG,
    });

    const list = await me.query(evidenceApi.listContractorEvidence, {
      buildId,
      workosOrganizationId: ORG,
    });
    expect(list[0]._id).toBe(evidenceId);
    expect(list[0].feedbackState).toBe("addressed");
    expect(list[0].feedbackNote).toBe("Replacement uploaded.");
  });
});

describe("contractor acknowledgements + scope issues (PRD §13.6, §14.3)", () => {
  test("contractor acknowledges an assignment and a schedule change", async () => {
    const { admin, me, assignmentId } =
      await seedContractorWithBuildAssignment();
    const evidenceApi = (api as any).contractorEvidence;

    const ackId = await me.mutation(
      evidenceApi.acknowledgeContractorAssignment,
      {
        assignmentType: "build",
        buildAssignmentId: assignmentId,
        kind: "assignment",
        workosOrganizationId: ORG,
      },
    );
    expect(ackId).toBeDefined();
    const handoffState = await admin.run(async (ctx: any) => {
      const contractorDelivery = await ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient_dedupe", (q: any) =>
          q
            .eq("organizationId", ORG)
            .eq("recipientWorkosUserId", CONTRACTOR_USER)
            .eq(
              "dedupeKey",
              `contractor-assignment:${assignmentId}:created`,
            ),
        )
        .first();
      const builderDeliveries = await ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient", (q: any) =>
          q.eq("organizationId", ORG).eq("recipientWorkosUserId", "user_builder"),
        )
        .collect();
      const audits = (await ctx.db.query("auditEvents").collect()).filter(
        (event: any) =>
          event.eventType === "contractor.assignment.acknowledged",
      );
      return { audits, builderDeliveries, contractorDelivery };
    });
    expect(handoffState.contractorDelivery.status).toBe("resolved");
    expect(handoffState.builderDeliveries).toEqual([
      expect.objectContaining({
        actionRequired: false,
        entityId: String(assignmentId),
        sourceLabel: "Contractor",
        status: "unread",
      }),
    ]);
    expect(handoffState.audits).toHaveLength(1);

    const schedId = await me.mutation(
      evidenceApi.acknowledgeContractorScheduleChange,
      {
        assignmentType: "build",
        buildAssignmentId: assignmentId,
        workosOrganizationId: ORG,
      },
    );
    expect(schedId).toBeDefined();
  });

  test("contractor flags a scope mismatch and backoffice resolves it", async () => {
    const { admin, me, assignmentId } =
      await seedContractorWithBuildAssignment();
    const evidenceApi = (api as any).contractorEvidence;

    const issueId = await me.mutation(
      evidenceApi.flagContractorScopeMismatch,
      {
        assignmentType: "build",
        buildAssignmentId: assignmentId,
        detail: "Foundation scope excludes rebar.",
        milestoneKey: "foundation",
        summary: "Rebar not in my scope",
        workosOrganizationId: ORG,
      },
    );
    expect(issueId).toBeDefined();
    const disputedAcknowledgement = await admin.run(async (ctx: any) =>
      ctx.db
        .query("contractorAcknowledgements")
        .withIndex("by_build_assignment", (q: any) =>
          q.eq("buildAssignmentId", assignmentId),
        )
        .first(),
    );
    expect(disputedAcknowledgement.state).toBe("scope_disputed");

    let issues = await me.query(evidenceApi.listContractorScopeIssues, {});
    expect(issues[0].status).toBe("open");

    await admin.mutation(evidenceApi.resolveContractorScopeIssue, {
      issueId,
      note: "Rebar added to your scope.",
      workosOrganizationId: ORG,
    });

    issues = await me.query(evidenceApi.listContractorScopeIssues, {});
    expect(issues[0].status).toBe("resolved");
    const resolvedState = await admin.run(async (ctx: any) => {
      const acknowledgement = await ctx.db
        .query("contractorAcknowledgements")
        .withIndex("by_build_assignment", (q: any) =>
          q.eq("buildAssignmentId", assignmentId),
        )
        .first();
      const delivery = await ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient_dedupe", (q: any) =>
          q
            .eq("organizationId", ORG)
            .eq("recipientWorkosUserId", CONTRACTOR_USER)
            .eq("dedupeKey", `contractor-scope-resolution:${issueId}`),
        )
        .first();
      return { acknowledgement, delivery };
    });
    expect(resolvedState.acknowledgement.state).toBe("resolved");
    expect(resolvedState.delivery).toMatchObject({
      actionRequired: false,
      status: "unread",
      title: "Assignment scope response ready",
    });
  });
});
