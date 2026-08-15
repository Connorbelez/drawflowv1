/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "./fairLendConfig";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORG = "org_phase5";
const PAGE = { cursor: null, numItems: 50 };

describe("Lender Portal Phase 5 stable request cycles", () => {
  test("keeps stable identities, reconstructs cycles, projects every state, and enforces privacy and stale-cycle guards", async () => {
    const f = await fixture();
    const target = { kind: "milestone" as const, milestoneId: f.milestoneId };
    const first = await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      { expectedCycleNumber: 0, idempotencyKey: "milestone-cycle-001", target, workosOrganizationId: ORG },
    );
    await f.admin.mutation(
      (api as any).lender_portal_phase5.decideBackofficeReviewRequest,
      {
        decision: "rejected",
        expectedCycleNumber: 1,
        idempotencyKey: "milestone-reject-001",
        privateRationale: "Reviewer-only structural risk context.",
        revisionInstructions: "Replace the unreadable foundation invoice.",
        target,
        workosOrganizationId: ORG,
      },
    );
    const correction = await f.builder.query(
      (api as any).lender_portal_phase5.getBuilderReviewRequest,
      { historyPaginationOpts: PAGE, target, workosOrganizationId: ORG },
    );
    expect(correction).toMatchObject({
      canResubmit: true,
      currentCycleNumber: 1,
      eligibility: {
        canSubmit: true,
        reason: "eligible_for_resubmission",
      },
      requestIdentity: first.requestIdentity,
      revisionInstructions: "Replace the unreadable foundation invoice.",
      state: "correction_required",
    });
    expect(JSON.stringify(correction)).not.toMatch(/user_admin|Reviewer-only/);

    const correctionQueue = await f.admin.query(
      (api as any).lender_portal_phase5.listBackofficeReviewRequests,
      { buildId: f.buildId, paginationOpts: PAGE, workosOrganizationId: ORG },
    );
    expect(correctionQueue.page).toEqual(expect.arrayContaining([
      expect.objectContaining({ requestIdentity: first.requestIdentity, state: "correction_required" }),
    ]));

    const resubmit = {
      expectedCycleNumber: 1,
      idempotencyKey: "milestone-cycle-002",
      target,
      workosOrganizationId: ORG,
    };
    const second = await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      resubmit,
    );
    const replay = await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      resubmit,
    );
    expect(second).toMatchObject({ cycleNumber: 2, requestIdentity: first.requestIdentity, state: "in_review" });
    expect(replay.replayed).toBe(true);
    await expect(
      f.admin.mutation((api as any).lender_portal_phase5.decideBackofficeReviewRequest, {
        decision: "approved",
        expectedCycleNumber: 1,
        idempotencyKey: "milestone-stale-001",
        target,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("STALE_REVIEW_CYCLE");

    const history = await f.admin.query(
      (api as any).lender_portal_phase5.getBackofficeReviewRequest,
      { historyPaginationOpts: PAGE, target, workosOrganizationId: ORG },
    );
    expect(history.cycles.page).toHaveLength(2);
    expect(history.cycles.page[1]).toMatchObject({
      decisions: [expect.objectContaining({
        actorWorkosUserId: "user_admin",
        privateRationale: "Reviewer-only structural risk context.",
      })],
      evidenceReferences: [expect.objectContaining({ evidenceAssetId: f.evidenceAssetId })],
      requirements: expect.objectContaining({ requiredGroups: ["backoffice", "lender"] }),
      submission: expect.objectContaining({ actualCostCents: 4_200_000, completedDay: 18 }),
    });
    expect(history.cycles.page[0].decisions).toEqual([]);
    const audits = await f.base.run(async (ctx: any) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query: any) =>
          query.eq("entityType", "buildMilestone").eq("entityId", first.requestIdentity)
        )
        .collect(),
    );
    expect(audits.map((event: any) => event.eventType)).toEqual([
      "lender_portal.review_request.submitted",
      "lender_portal.review_request.correction_requested",
      "lender_portal.review_request.resubmitted",
    ]);

    const drawTarget = { drawRequestId: f.drawRequestId, kind: "draw" as const };
    const draw = await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      { expectedCycleNumber: 0, idempotencyKey: "draw-cycle-001", target: drawTarget, workosOrganizationId: ORG },
    );
    const raced = await Promise.allSettled([
      f.lender.mutation((api as any).lender_portal_phase5.decideLenderReviewRequest, {
        decision: "approved", expectedCycleNumber: 1, idempotencyKey: "draw-lender-race-a", target: drawTarget,
      }),
      f.lender.mutation((api as any).lender_portal_phase5.decideLenderReviewRequest, {
        decision: "approved", expectedCycleNumber: 1, idempotencyKey: "draw-lender-race-b", target: drawTarget,
      }),
    ]);
    expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(raced.filter((result) => result.status === "rejected")).toHaveLength(1);
    const partial = await f.admin.query(
      (api as any).lender_portal_phase5.listBackofficeReviewRequests,
      { buildId: f.buildId, paginationOpts: PAGE, workosOrganizationId: ORG },
    );
    expect(partial.page).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actionRequired: true,
        approvedGroups: ["lender"],
        requestIdentity: draw.requestIdentity,
        state: "partial_approval",
      }),
    ]));
    await f.admin.mutation((api as any).lender_portal_phase5.decideBackofficeReviewRequest, {
      decision: "approved",
      expectedCycleNumber: 1,
      idempotencyKey: "draw-backoffice-001",
      privateRationale: "Internal reconciliation passed.",
      target: drawTarget,
      workosOrganizationId: ORG,
    });
    const lenderDetail = await f.lender.query(
      (api as any).lender_portal_phase5.getLenderReviewRequest,
      { historyPaginationOpts: PAGE, target: drawTarget },
    );
    expect(lenderDetail).toMatchObject({ requestIdentity: draw.requestIdentity, state: "completed" });
    expect(lenderDetail.currentCycle).toMatchObject({
      state: "completed",
      submission: {
        allocations: [expect.objectContaining({ amountCents: 2_500_000, milestoneId: f.milestoneId })],
        amountCents: 2_500_000,
        kind: "draw",
      },
    });
    const builderDraw = await f.builder.query(
      (api as any).lender_portal_phase5.getBuilderReviewRequest,
      { historyPaginationOpts: PAGE, target: drawTarget, workosOrganizationId: ORG },
    );
    expect(builderDraw.state).toBe("completed");
    expect(JSON.stringify(builderDraw)).not.toMatch(/user_admin|user_lender|Internal reconciliation/);
    const lenderQueue = await f.lender.query(
      (api as any).lender_portal_phase5.listLenderReviewRequests,
      { buildId: f.buildId, paginationOpts: PAGE },
    );
    expect(lenderQueue.page).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionRequired: false, requestIdentity: draw.requestIdentity, state: "completed" }),
    ]));
  });

  test("requires two distinct eligible lenders for quorum two and personalizes remaining action", async () => {
    const f = await fixture();
    await f.base.run(async (ctx: any) => {
      await ctx.db.patch(f.buildId, {
        reviewPolicySnapshot: {
          drawApprovalMode: "lender_quorum",
          drawLenderQuorum: 2,
          milestoneApprovalMode: "lender_quorum",
          milestoneLenderQuorum: 2,
          milestoneReceiptInvoiceRequired: false,
          milestoneSiteVisitRequired: false,
        },
      });
    });
    const secondLender = await addEligibleLender(f, "user_lender_two");
    const target = { kind: "milestone" as const, milestoneId: f.milestoneId };
    await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      {
        expectedCycleNumber: 0,
        idempotencyKey: "milestone-quorum-two-cycle",
        target,
        workosOrganizationId: ORG,
      },
    );

    const firstApproval = await f.lender.mutation(
      (api as any).lender_portal_phase5.decideLenderReviewRequest,
      {
        decision: "approved",
        expectedCycleNumber: 1,
        idempotencyKey: "milestone-quorum-two-first",
        target,
      },
    );
    expect(firstApproval.state).toBe("partial_approval");

    const firstQueue = await f.lender.query(
      (api as any).lender_portal_phase5.listLenderReviewRequests,
      { buildId: f.buildId, paginationOpts: PAGE },
    );
    const secondQueue = await secondLender.query(
      (api as any).lender_portal_phase5.listLenderReviewRequests,
      { buildId: f.buildId, paginationOpts: PAGE },
    );
    expect(firstQueue.page).toEqual([
      expect.objectContaining({
        actionRequired: false,
        currentEligibleLenderCount: 2,
        lenderApprovalCount: 1,
        lenderQuorum: 2,
        state: "partial_approval",
        viewerActionState: "acted",
        viewerDecision: "approved",
      }),
    ]);
    expect(secondQueue.page).toEqual([
      expect.objectContaining({
        actionRequired: true,
        currentEligibleLenderCount: 2,
        lenderApprovalCount: 1,
        lenderQuorum: 2,
        state: "partial_approval",
        viewerActionState: "needs_action",
        viewerDecision: null,
      }),
    ]);

    const secondApproval = await secondLender.mutation(
      (api as any).lender_portal_phase5.decideLenderReviewRequest,
      {
        decision: "approved",
        expectedCycleNumber: 1,
        idempotencyKey: "milestone-quorum-two-second",
        target,
      },
    );
    expect(secondApproval.state).toBe("completed");
  });

  test("paginates more than one hundred review cycles without truncating authorized history", async () => {
    const f = await fixture();
    const target = { kind: "milestone" as const, milestoneId: f.milestoneId };
    const submitted = await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      {
        expectedCycleNumber: 0,
        idempotencyKey: "milestone-history-cycle-001",
        target,
        workosOrganizationId: ORG,
      },
    );
    await f.base.run(async (ctx: any) => {
      const firstCycle = await ctx.db.get(submitted.cycleId);
      if (!firstCycle) {
        throw new Error("Phase 5 history fixture cycle is unavailable.");
      }
      const { _creationTime, _id, ...cycleValues } = firstCycle;
      await ctx.db.patch(firstCycle._id, { isCurrent: false });
      let currentCycleId = firstCycle._id;
      for (let cycleNumber = 2; cycleNumber <= 105; cycleNumber += 1) {
        currentCycleId = await ctx.db.insert("lenderPortalReviewCycles", {
          ...cycleValues,
          commandFingerprint: `history-cycle-${cycleNumber}`,
          cycleNumber,
          idempotencyKey: `history-cycle-${cycleNumber}`,
          isCurrent: cycleNumber === 105,
          submittedAt: firstCycle.submittedAt + cycleNumber,
          updatedAt: firstCycle.updatedAt + cycleNumber,
        });
      }
      await ctx.db.patch(f.milestoneId, {
        currentLenderPortalReviewCycleId: currentCycleId,
        currentLenderPortalReviewCycleNumber: 105,
      });
    });

    const firstPage = await f.admin.query(
      (api as any).lender_portal_phase5.getBackofficeReviewRequest,
      {
        historyPaginationOpts: { cursor: null, numItems: 60 },
        target,
        workosOrganizationId: ORG,
      },
    );
    expect(firstPage.cycles.page).toHaveLength(60);
    expect(firstPage.cycles.isDone).toBe(false);
    const secondPage = await f.admin.query(
      (api as any).lender_portal_phase5.getBackofficeReviewRequest,
      {
        historyPaginationOpts: {
          cursor: firstPage.cycles.continueCursor,
          numItems: 60,
        },
        target,
        workosOrganizationId: ORG,
      },
    );
    expect(secondPage.cycles.page).toHaveLength(45);
    expect(secondPage.cycles.isDone).toBe(true);
  });

  test("keeps stale targets non-fatal and paginates the remaining current queue", async () => {
    const f = await fixture();
    const milestoneTarget = {
      kind: "milestone" as const,
      milestoneId: f.milestoneId,
    };
    const drawTarget = {
      drawRequestId: f.drawRequestId,
      kind: "draw" as const,
    };
    await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      {
        expectedCycleNumber: 0,
        idempotencyKey: "stale-queue-milestone",
        target: milestoneTarget,
        workosOrganizationId: ORG,
      },
    );
    await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      {
        expectedCycleNumber: 0,
        idempotencyKey: "stale-queue-draw",
        target: drawTarget,
        workosOrganizationId: ORG,
      },
    );
    await f.base.run(async (ctx: any) => {
      await ctx.db.patch(f.milestoneId, { planningState: "superseded" });
    });

    const firstPage = await f.admin.query(
      (api as any).lender_portal_phase5.listBackofficeReviewRequests,
      {
        buildId: f.buildId,
        paginationOpts: { cursor: null, numItems: 1 },
        workosOrganizationId: ORG,
      },
    );
    const secondPage = await f.admin.query(
      (api as any).lender_portal_phase5.listBackofficeReviewRequests,
      {
        buildId: f.buildId,
        paginationOpts: {
          cursor: firstPage.continueCursor,
          numItems: 1,
        },
        workosOrganizationId: ORG,
      },
    );
    const rows = [...firstPage.page, ...secondPage.page];
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionRequired: false,
          requestIdentity: `milestone:${String(f.milestoneId)}`,
          targetAvailability: "unavailable",
          viewerActionState: "unavailable",
        }),
        expect.objectContaining({
          requestIdentity: `draw:${String(f.drawRequestId)}`,
          targetAvailability: "available",
        }),
      ]),
    );
  });

  test("rejects cross-scope Evidence Package revisions before snapshotting or projection", async () => {
    const f = await fixture();
    const foreignPackageRevisionId = await f.base.run(async (ctx: any) => {
      const now = Date.now();
      const proposalSubmilestoneId = await ctx.db.insert(
        "proposalSubmilestones",
        {
          brokerageId: f.brokerageId,
          createdAt: now,
          key: "foundation-formwork",
          milestoneKey: "foundation",
          name: "Foundation formwork",
          order: 1,
          organizationId: ORG,
          proposalId: f.proposalId,
          proposalMilestoneId: f.proposalMilestoneId,
          updatedAt: now,
        },
      );
      const buildSubmilestoneId = await ctx.db.insert("buildSubmilestones", {
        brokerageId: f.brokerageId,
        buildId: f.buildId,
        buildMilestoneId: f.milestoneId,
        createdAt: now,
        key: "foundation-formwork",
        milestoneKey: "foundation",
        name: "Foundation formwork",
        order: 1,
        organizationId: ORG,
        proposalSubmilestoneId,
        status: "complete",
        updatedAt: now,
      });
      return await ctx.db.insert(
        "buildSubmilestoneEvidencePackageRevisions",
        {
          brokerageId: f.brokerageId,
          buildId: f.buildId,
          buildMilestoneId: f.milestoneId,
          buildSubmilestoneId,
          createdAt: now,
          createdByWorkosUserId: "user_builder",
          frozenAt: now,
          frozenByWorkosUserId: "user_builder",
          milestoneKey: "foundation",
          organizationId: "org_foreign",
          proposalId: f.proposalId,
          requirementsRevision: 1,
          revision: 1,
          status: "frozen",
          submilestoneKey: "foundation-formwork",
          updatedAt: now,
        },
      );
    });
    await f.base.run(async (ctx: any) => {
      await ctx.db.patch(f.milestoneId, {
        completionClaim: {
          actualCostCents: 4_200_000,
          completedDay: 18,
          evidencePackageRevisionIds: [
            {
              revision: 1,
              revisionId: foreignPackageRevisionId,
              submilestoneKey: "foundation-formwork",
            },
          ],
          note: "Ready.",
          submittedAt: "2026-08-15T12:00:00.000Z",
        },
      });
    });
    const target = { kind: "milestone" as const, milestoneId: f.milestoneId };
    await expect(
      f.builder.mutation(
        (api as any).lender_portal_phase5.submitBuilderReviewRequest,
        {
          expectedCycleNumber: 0,
          idempotencyKey: "cross-scope-package-cycle",
          target,
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("INVALID_EVIDENCE_PACKAGE_REFERENCE");
    const cycles = await f.base.run(async (ctx: any) =>
      ctx.db
        .query("lenderPortalReviewCycles")
        .withIndex("by_request_identity_and_cycle_number", (query: any) =>
          query.eq("requestIdentity", `milestone:${String(f.milestoneId)}`),
        )
        .collect(),
    );
    expect(cycles).toEqual([]);
  });

  test("retains Draw identity through correction and blocks unrelated participants", async () => {
    const f = await fixture();
    const target = { drawRequestId: f.drawRequestId, kind: "draw" as const };
    const first = await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      { expectedCycleNumber: 0, idempotencyKey: "draw-correction-cycle-001", target, workosOrganizationId: ORG },
    );
    const rejection = {
      decision: "rejected" as const,
      expectedCycleNumber: 1,
      idempotencyKey: "draw-correction-reject-001",
      privateRationale: "Private lender reconciliation note.",
      revisionInstructions: "Correct the requested reimbursement amount.",
      target,
    };
    const decided = await f.lender.mutation(
      (api as any).lender_portal_phase5.decideLenderReviewRequest,
      rejection,
    );
    const replay = await f.lender.mutation(
      (api as any).lender_portal_phase5.decideLenderReviewRequest,
      rejection,
    );
    expect(decided.state).toBe("correction_required");
    expect(replay.replayed).toBe(true);
    const second = await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      { expectedCycleNumber: 1, idempotencyKey: "draw-correction-cycle-002", target, workosOrganizationId: ORG },
    );
    expect(second).toMatchObject({ cycleNumber: 2, requestIdentity: first.requestIdentity });

    const unrelated = identity(f.base, ["builder"], "user_unrelated", ORG);
    await expect(
      unrelated.query((api as any).lender_portal_phase5.getBuilderReviewRequest, {
        historyPaginationOpts: PAGE,
        target,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("REVIEW_REQUEST_UNAVAILABLE");
    const safe = await f.builder.query(
      (api as any).lender_portal_phase5.getBuilderReviewRequest,
      { historyPaginationOpts: PAGE, target, workosOrganizationId: ORG },
    );
    expect(JSON.stringify(safe)).not.toMatch(/user_lender|Private lender/);
  });
});

function identity(base: any, roles: string[], subject: string, organizationId: string) {
  return base.withIdentity({
    email: `${subject}@example.com`, name: subject, organizationId,
    role: roles[0], roles, subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  });
}

async function fixture() {
  const base = convexTest(schema, modules);
  const ids = await base.run(async (ctx: any) => {
    const now = Date.now();
    const brokerageId = await ctx.db.insert("brokerages", {
      createdAt: now, displayName: "Phase 5 Brokerage", legalName: "Phase 5 Brokerage Inc.",
      status: "active", updatedAt: now, workosOrganizationId: ORG,
    });
    const builderProfileId = await ctx.db.insert("builderProfiles", {
      brokerageId, createdAt: now, displayName: "Phase 5 Builder", organizationId: ORG,
      status: "active", updatedAt: now,
    });
    await ctx.db.insert("builderAccountLinks", {
      brokerageId, builderProfileId, createdAt: now, role: "owner", status: "active",
      updatedAt: now, workosUserId: "user_builder",
    });
    const proposalId = await ctx.db.insert("buildProposals", {
      borrowerCoPayBps: 2_000, borrowerWorkingCapitalLimitCents: 10_000_000,
      brokerageId, buildName: "Stable cycle build", builderProfileId, createdAt: now,
      createdByWorkosUserId: "user_admin", lenderDrawPolicyLimitCents: 20_000_000,
      location: "15 Stable Cycle Road", organizationId: ORG, reviewOutcome: "approved",
      status: "closed", totalBudgetCents: 10_000_000, updatedAt: now,
      updatedByWorkosUserId: "user_admin",
    });
    const ruleId = await ctx.db.insert("workflowRules", {
      allowPermitWaiverByRoles: ["admin"], brokerageId, createdAt: now, organizationId: ORG,
      proposalStates: ["draft", "submitted", "approved", "closed"], requirePermitForApproval: true,
      ruleKey: "phase5-review", settings: {}, status: "active", updatedAt: now, version: 1,
    });
    const snapshotId = await ctx.db.insert("workflowRuleSnapshots", {
      allowPermitWaiverByRoles: ["admin"], brokerageId, createdAt: now, organizationId: ORG,
      proposalId, proposalStates: ["draft", "submitted", "approved", "closed"],
      requirePermitForApproval: true, ruleKey: "phase5-review", settings: {}, version: 1,
      workflowRuleId: ruleId,
    });
    const buildId = await ctx.db.insert("activeBuilds", {
      brokerageId, builderProfileId, buildName: "Stable cycle build", createdAt: now,
      location: "15 Stable Cycle Road", organizationId: ORG, proposalId,
      reviewPolicySnapshot: {
        drawApprovalMode: "both", drawLenderQuorum: 1,
        milestoneApprovalMode: "both", milestoneLenderQuorum: 1,
        milestoneReceiptInvoiceRequired: true, milestoneSiteVisitRequired: false,
      },
      startDate: "2026-08-01", status: "active", totalBudgetCents: 10_000_000,
      updatedAt: now, workflowRuleSnapshotId: snapshotId,
    });
    const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
      brokerageId, budgetCents: 10_000_000, createdAt: now, dayEnd: 20, dayStart: 0,
      dependencyKeys: [], drawAvailabilityCents: 8_000_000, durationDays: 20,
      key: "foundation", name: "Foundation", order: 1, organizationId: ORG,
      proposalId, updatedAt: now,
    });
    const milestoneId = await ctx.db.insert("buildMilestones", {
      brokerageId, budgetCents: 10_000_000, buildId,
      completionClaim: { actualCostCents: 4_200_000, completedDay: 18, note: "Ready.", submittedAt: "2026-08-15T12:00:00.000Z" },
      createdAt: now, dayEnd: 20, dayStart: 0, dependencyKeys: [],
      drawAvailabilityCents: 8_000_000, durationDays: 20, key: "foundation",
      name: "Foundation", order: 1, organizationId: ORG, progressPercent: 100,
      proposalMilestoneId, status: "in_progress", updatedAt: now,
    });
    const evidenceAssetId = await ctx.db.insert("buildEvidenceAssets", {
      brokerageId, buildId, createdAt: now, evidenceKey: "foundation-invoice",
      fileName: "foundation-invoice.pdf", label: "Foundation invoice", locationVerified: true,
      milestoneKey: "foundation", mimeType: "application/pdf", organizationId: ORG,
      proposalId, sizeBytes: 1_024, source: "builder_upload", tag: "invoice", updatedAt: now,
    });
    const drawRequestId = await ctx.db.insert("activeBuildDrawRequests", {
      amountCents: 2_500_000, brokerageId, buildId, clientOperationId: "phase5-draw",
      createdAt: now, displayId: "DR-0001", label: "Foundation reimbursement",
      note: "Reimburse foundation.", organizationId: ORG,
      requestedAt: "2026-08-15T13:00:00.000Z", requestedByWorkosUserId: "user_builder",
      requestKey: "dr-0001-phase5", status: "requested", updatedAt: now,
    });
    await ctx.db.insert("activeBuildDrawRequestAllocations", {
      amountCents: 2_500_000, brokerageId, buildId, buildMilestoneId: milestoneId,
      createdAt: now, drawGroupKey: "foundation", drawRequestId, milestoneKey: "foundation",
      organizationId: ORG, sourceOrder: 1,
    });
    for (const [subject, role] of [["user_builder", "builder"], ["user_admin", "admin"]]) {
      await ctx.db.insert("users", {
        authId: subject,
        createdAt: now,
        email: `${subject}@example.com`,
        name: subject,
        sourceEventId: `phase5-user-${subject}`,
        sourceEventType: "test",
        status: "active",
        updatedAt: now,
        workosUserId: subject,
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now, roleSlug: role, roleSlugs: [role], sourceEventId: `phase5-${subject}`,
        sourceEventType: "test", status: "active", updatedAt: now,
        workosMembershipId: `om-${subject}`, workosOrganizationId: ORG, workosUserId: subject,
      });
    }
    const lenderOrganizationId = await ctx.db.insert("lenderOrganizations", {
      brokerageId, createdAt: now, displayName: "Phase 5 Lender", legalName: "Phase 5 Lender Inc.",
      permissions: { drawDecisions: true, milestoneDecisions: true, proposalReview: true, siteVisitReview: true },
      status: "active", updatedAt: now,
    });
    await ctx.db.insert("users", {
      authId: "user_lender", createdAt: now, email: "user_lender@example.com",
      name: "Phase 5 Lender", sourceEventId: "phase5-lender", sourceEventType: "test",
      status: "active", updatedAt: now, workosUserId: "user_lender",
    });
    await ctx.db.insert("workosOrganizationMemberships", {
      createdAt: now, roleSlug: "lender-admin", roleSlugs: ["lender-admin"],
      sourceEventId: "phase5-lender-membership", sourceEventType: "test", status: "active",
      updatedAt: now, workosMembershipId: "om-user-lender",
      workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID, workosUserId: "user_lender",
    });
    await ctx.db.insert("lenderOrganizationAssignments", {
      assignedAt: now, assignedByRole: "admin", assignedByWorkosUserId: "user_admin",
      brokerageId, lenderOrganizationId, normalizedEmail: "user_lender@example.com",
      reason: "Phase 5 assignment.", status: "active", updatedAt: now, workosUserId: "user_lender",
    });
    await ctx.db.insert("proposalLenderAssignments", {
      assignedAt: now, assignedByRole: "admin", assignedByWorkosUserId: "user_admin",
      brokerageId, createdAt: now, lenderBrokerageId: brokerageId, lenderOrganizationId,
      lenderOrganizationName: "Phase 5 Lender", organizationId: ORG, proposalId, status: "current",
    });
    return {
      brokerageId,
      buildId,
      drawRequestId,
      evidenceAssetId,
      lenderOrganizationId,
      milestoneId,
      proposalId,
      proposalMilestoneId,
    };
  });
  return {
    ...ids,
    base,
    admin: identity(base, ["admin"], "user_admin", ORG),
    builder: identity(base, ["builder"], "user_builder", ORG),
    lender: identity(base, ["lender-admin"], "user_lender", FAIRLEND_WORKOS_ORGANIZATION_ID),
  };
}

async function addEligibleLender(
  fixtureValue: Awaited<ReturnType<typeof fixture>>,
  subject: string,
) {
  await fixtureValue.base.run(async (ctx: any) => {
    const now = Date.now();
    await ctx.db.insert("users", {
      authId: subject,
      createdAt: now,
      email: `${subject}@example.com`,
      name: subject,
      sourceEventId: `phase5-user-${subject}`,
      sourceEventType: "test",
      status: "active",
      updatedAt: now,
      workosUserId: subject,
    });
    await ctx.db.insert("workosOrganizationMemberships", {
      createdAt: now,
      roleSlug: "lender-admin",
      roleSlugs: ["lender-admin"],
      sourceEventId: `phase5-membership-${subject}`,
      sourceEventType: "test",
      status: "active",
      updatedAt: now,
      workosMembershipId: `om-${subject}`,
      workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      workosUserId: subject,
    });
    await ctx.db.insert("lenderOrganizationAssignments", {
      assignedAt: now,
      assignedByRole: "admin",
      assignedByWorkosUserId: "user_admin",
      brokerageId: fixtureValue.brokerageId,
      lenderOrganizationId: fixtureValue.lenderOrganizationId,
      normalizedEmail: `${subject}@example.com`,
      reason: "Phase 5 quorum fixture.",
      status: "active",
      updatedAt: now,
      workosUserId: subject,
    });
  });
  return identity(
    fixtureValue.base,
    ["lender-admin"],
    subject,
    FAIRLEND_WORKOS_ORGANIZATION_ID,
  );
}
