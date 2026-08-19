/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "./fairLendConfig";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORG = "org_phase5";
const PAGE = { cursor: null, numItems: 50 };

async function phase8ReviewIntents(f: any, kind: "draw" | "milestone", targetId: any) {
  return await f.base.run(async (ctx: any) =>
    await ctx.db
      .query("communicationIntents")
      .withIndex(
        "by_relatedEntityType_and_relatedEntityId_and_createdAt",
        (query: any) =>
          query
            .eq("relatedEntityType", kind)
            .eq("relatedEntityId", String(targetId)),
      )
      .collect(),
  );
}

describe("Lender Portal Phase 5 stable request cycles", () => {
  test("keeps unsupported field progress changes silent", async () => {
    const f = await fixture();
    const progressSubmilestoneId = await f.base.run(async (ctx: any) => {
      const now = Date.now();
      const proposalSubmilestoneId = await ctx.db.insert(
        "proposalSubmilestones",
        {
          brokerageId: f.brokerageId,
          createdAt: now,
          key: "progress-only",
          milestoneKey: "foundation",
          name: "Progress only",
          order: 2,
          organizationId: ORG,
          proposalId: f.proposalId,
          proposalMilestoneId: f.proposalMilestoneId,
          updatedAt: now,
        },
      );
      await ctx.db.patch(f.milestoneId, {
        completionClaim: undefined,
        progressPercent: 0,
      });
      return await ctx.db.insert("buildSubmilestones", {
        actualStartedAt: Date.now(),
        brokerageId: f.brokerageId,
        buildId: f.buildId,
        buildMilestoneId: f.milestoneId,
        createdAt: now,
        key: "progress-only",
        milestoneKey: "foundation",
        name: "Progress only",
        order: 2,
        organizationId: ORG,
        progressPercent: 0,
        proposalSubmilestoneId,
        status: "in_progress",
        updatedAt: now,
        workflowRevision: 0,
      });
    });
    expect(progressSubmilestoneId).toBeTruthy();

    await expect(
      f.builder.mutation(
        (api as any).production_proposals
          .updateActiveBuildSubmilestoneProgress,
        {
          buildId: f.buildId,
          expectedRevision: 0,
          idempotencyKey: "phase8-progress-only-silence",
          milestoneKey: "foundation",
          progressPercent: 50,
          submilestoneKey: "progress-only",
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toMatchObject({ progressPercent: 50, replayed: false });

    const intents = await f.base.run(async (ctx: any) =>
      await ctx.db
        .query("communicationIntents")
        .withIndex("by_organizationId_and_createdAt", (query: any) =>
          query.eq("organizationId", ORG),
        )
        .collect(),
    );
    expect(
      intents.filter((intent: any) => intent.kind.startsWith("lender_portal_")),
    ).toEqual([]);
  });

  test("does not commit an intent when a canonical review transition aborts", async () => {
    const f = await fixture();
    const target = { kind: "milestone" as const, milestoneId: f.milestoneId };

    await expect(
      f.builder.mutation(
        (api as any).lender_portal_phase5.submitBuilderReviewRequest,
        {
          expectedCycleNumber: 1,
          idempotencyKey: "phase8-aborted-review-transition",
          target,
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("STALE_REVIEW_CYCLE");

    expect(await phase8ReviewIntents(f, "milestone", f.milestoneId)).toEqual(
      [],
    );
  });

  test("keeps stable identities, reconstructs cycles, projects every state, and enforces privacy and stale-cycle guards", async () => {
    const f = await fixture();
    const target = { kind: "milestone" as const, milestoneId: f.milestoneId };
    const first = await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      { expectedCycleNumber: 0, idempotencyKey: "milestone-cycle-001", target, workosOrganizationId: ORG },
    );
    const firstApprovalRequired = await phase8ReviewIntents(
      f,
      "milestone",
      f.milestoneId,
    );
    expect(firstApprovalRequired).toHaveLength(2);
    expect(
      firstApprovalRequired.map((intent: any) =>
        JSON.parse(intent.payloadSnapshot).audience,
      ).sort(),
    ).toEqual(["backoffice", "lender"]);
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
    const milestoneOutcomeIntents = (
      await phase8ReviewIntents(f, "milestone", f.milestoneId)
    ).filter(
      (intent: any) => intent.kind === "lender_portal_approval_outcome",
    );
    expect(milestoneOutcomeIntents).toHaveLength(2);
    const builderOutcome = milestoneOutcomeIntents.find(
      (intent: any) => JSON.parse(intent.payloadSnapshot).audience === "builder",
    );
    expect(builderOutcome.payloadSnapshot).not.toMatch(
      /user_admin|Reviewer-only structural risk context|privateRationale/,
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
    const milestoneApprovalRequired = (
      await phase8ReviewIntents(f, "milestone", f.milestoneId)
    ).filter(
      (intent: any) => intent.kind === "lender_portal_approval_required",
    );
    expect(milestoneApprovalRequired).toHaveLength(4);
    expect(
      new Set(
        milestoneApprovalRequired.map((intent: any) => intent.idempotencyKey),
      ).size,
    ).toBe(4);
    expect(
      milestoneApprovalRequired
        .filter(
          (intent: any) =>
            JSON.parse(intent.payloadSnapshot).reviewCycleNumber === 2,
        )
        .every((intent: any) =>
          JSON.parse(intent.payloadSnapshot).linkPath.includes(
            `reviewCycleNumber=2`,
          ),
        ),
    ).toBe(true);
    await expect(
      f.lender.query(
        (api as any).lender_portal_phase5
          .getLenderNotificationReviewRequest,
        {
          historyPaginationOpts: PAGE,
          reviewCycleId: second.cycleId,
          reviewCycleNumber: 2,
          target,
        },
      ),
    ).resolves.toMatchObject({
      currentCycleNumber: 2,
      requestIdentity: first.requestIdentity,
    });
    await f.base.run(async (ctx: any) =>
      ctx.db.patch(second.cycleId, { isCurrent: false })
    );
    await expect(
      f.lender.query(
        (api as any).lender_portal_phase5
          .getLenderNotificationReviewRequest,
        {
          historyPaginationOpts: PAGE,
          reviewCycleId: second.cycleId,
          reviewCycleNumber: 2,
          target,
        }
      )
    ).rejects.toThrow();
    await f.base.run(async (ctx: any) =>
      ctx.db.patch(second.cycleId, { isCurrent: true })
    );
    await expect(
      f.lender.query(
        (api as any).lender_portal_phase5
          .getLenderNotificationReviewRequest,
        {
          historyPaginationOpts: PAGE,
          reviewCycleId: first.cycleId,
          reviewCycleNumber: 1,
          target,
        },
      ),
    ).rejects.toThrow();
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
      evidenceReferences: expect.arrayContaining([
        expect.objectContaining({ evidenceAssetId: f.evidenceAssetId }),
      ]),
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
    expect(
      (await phase8ReviewIntents(f, "draw", f.drawRequestId)).filter(
        (intent: any) => intent.kind === "lender_portal_approval_outcome",
      ),
    ).toHaveLength(0);
    const partialApprovalRequired = (
      await phase8ReviewIntents(f, "draw", f.drawRequestId)
    ).filter(
      (intent: any) => intent.kind === "lender_portal_approval_required",
    );
    expect(partialApprovalRequired).toHaveLength(2);
    expect(
      partialApprovalRequired.filter(
        (intent: any) =>
          JSON.parse(intent.payloadSnapshot).audience === "backoffice",
      ),
    ).toHaveLength(1);
    await expect(
      f.admin.query(
        (api as any).lender_portal_phase5
          .getBackofficeNotificationReviewRequest,
        {
          historyPaginationOpts: PAGE,
          reviewCycleId: draw.cycleId,
          reviewCycleNumber: 1,
          target: drawTarget,
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toMatchObject({
      currentCycleNumber: 1,
      state: "partial_approval",
    });
    await expect(
      f.builder.query(
        (api as any).lender_portal_phase5.getBuilderNotificationReviewRequest,
        {
          historyPaginationOpts: PAGE,
          reviewCycleId: draw.cycleId,
          reviewCycleNumber: 1,
          target: drawTarget,
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toMatchObject({
      currentCycleNumber: 1,
      state: "partial_approval",
    });
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
    const drawOutcomeIntents = (
      await phase8ReviewIntents(f, "draw", f.drawRequestId)
    ).filter(
      (intent: any) => intent.kind === "lender_portal_approval_outcome",
    );
    expect(drawOutcomeIntents).toHaveLength(2);
    expect(
      drawOutcomeIntents.find(
        (intent: any) => JSON.parse(intent.payloadSnapshot).audience === "builder",
      ).payloadSnapshot,
    ).not.toMatch(/user_admin|user_lender|Internal reconciliation|privateRationale/);
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
      const reviewPolicySnapshot = {
          drawApprovalMode: "lender_quorum",
          drawLenderQuorum: 2,
          milestoneApprovalMode: "lender_quorum",
          milestoneLenderQuorum: 2,
          milestoneReceiptInvoiceRequired: false,
          milestoneSiteVisitRequired: false,
      };
      const build = await ctx.db.get(f.buildId);
      await ctx.db.patch(f.buildId, {
        reviewPolicySnapshot,
      });
      await ctx.db.patch(build.reviewPolicyLockId, {
        activeLenderMemberCount: 2,
        policy: reviewPolicySnapshot,
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

    await f.base.run(async (ctx: any) => {
      const lenderOrganization = await ctx.db.get(f.lenderOrganizationId);
      await ctx.db.patch(f.lenderOrganizationId, {
        permissions: {
          ...lenderOrganization.permissions,
          milestoneDecisions: false,
        },
      });
    });
    const noLongerEligibleQueue = await f.lender.query(
      (api as any).lender_portal_phase5.listLenderReviewRequests,
      { buildId: f.buildId, paginationOpts: PAGE }
    );
    expect(noLongerEligibleQueue.page).toEqual([
      expect.objectContaining({
        actionRequired: false,
        currentEligibleLenderCount: 0,
        viewerActionState: "ineligible",
        viewerDecision: "approved",
      }),
    ]);
    await f.base.run(async (ctx: any) => {
      const lenderOrganization = await ctx.db.get(f.lenderOrganizationId);
      await ctx.db.patch(f.lenderOrganizationId, {
        permissions: {
          ...lenderOrganization.permissions,
          milestoneDecisions: true,
        },
      });
    });

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

  test("paginates the all-assigned Milestone queue with personal action, evidence, privacy, and stale-cycle guards", async () => {
    const f = await fixture();
    const foundationTarget = {
      kind: "milestone" as const,
      milestoneId: f.milestoneId,
    };
    const foundation = await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      {
        expectedCycleNumber: 0,
        idempotencyKey: "milestone-queue-foundation-cycle",
        target: foundationTarget,
        workosOrganizationId: ORG,
      }
    );
    await f.admin.mutation(
      (api as any).lender_portal_phase5.decideBackofficeReviewRequest,
      {
        decision: "rejected",
        expectedCycleNumber: 1,
        idempotencyKey: "milestone-queue-private-rejection",
        privateRationale: "Private queue rationale must never leave Back Office.",
        revisionInstructions: "Add the missing public evidence.",
        target: foundationTarget,
        workosOrganizationId: ORG,
      }
    );
    const envelopeMilestoneId = await f.base.run(async (ctx: any) => {
      const now = Date.now();
      const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
        brokerageId: f.brokerageId,
        budgetCents: 2_500_000,
        createdAt: now,
        dayEnd: 32,
        dayStart: 21,
        dependencyKeys: ["foundation"],
        drawAvailabilityCents: 2_000_000,
        durationDays: 11,
        key: "envelope",
        name: "Envelope",
        order: 2,
        organizationId: ORG,
        proposalId: f.proposalId,
        updatedAt: now,
      });
      return await ctx.db.insert("buildMilestones", {
        brokerageId: f.brokerageId,
        budgetCents: 2_500_000,
        buildId: f.buildId,
        completionClaim: {
          actualCostCents: 2_400_000,
          completedDay: 31,
          note: "Envelope ready.",
          submittedAt: "2026-09-01T12:00:00.000Z",
        },
        createdAt: now,
        dayEnd: 32,
        dayStart: 21,
        dependencyKeys: ["foundation"],
        drawAvailabilityCents: 2_000_000,
        durationDays: 11,
        key: "envelope",
        name: "Envelope",
        order: 2,
        organizationId: ORG,
        progressPercent: 100,
        proposalMilestoneId,
        status: "complete",
        updatedAt: now,
      });
    });
    const envelope = await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      {
        expectedCycleNumber: 0,
        idempotencyKey: "milestone-queue-envelope-cycle",
        target: { kind: "milestone", milestoneId: envelopeMilestoneId },
        workosOrganizationId: ORG,
      }
    );

    const firstPage = await f.lender.query(
      (api as any).lender_portal_phase5
        .listAllAssignedLenderMilestoneReviewRequests,
      { paginationOpts: { cursor: null, numItems: 1 }, scope: "all" }
    );
    expect(firstPage.isDone).toBe(false);
    expect(firstPage.page).toHaveLength(1);
    const reactiveFirstPage = await f.lender.query(
      (api as any).lender_portal_phase5
        .listAllAssignedLenderMilestoneReviewRequests,
      {
        paginationOpts: {
          cursor: null,
          endCursor: firstPage.continueCursor,
          numItems: 20,
        },
        scope: "all",
      }
    );
    expect(reactiveFirstPage).toEqual({
      continueCursor: firstPage.continueCursor,
      isDone: true,
      page: firstPage.page,
    });
    await expect(
      f.lender.query(
        (api as any).lender_portal_phase5
          .listAllAssignedLenderMilestoneReviewRequests,
        {
          paginationOpts: { cursor: "tampered", numItems: 1 },
          scope: "all",
        }
      )
    ).rejects.toThrow("INVALID_PAGINATION_CURSOR");
    const secondPage = await f.lender.query(
      (api as any).lender_portal_phase5
        .listAllAssignedLenderMilestoneReviewRequests,
      {
        paginationOpts: {
          cursor: firstPage.continueCursor,
          numItems: 1,
        },
        scope: "all",
      }
    );
    expect(secondPage.isDone).toBe(true);
    const rows = [...firstPage.page, ...secondPage.page];
    expect(rows.map((row: any) => row.milestoneName).sort()).toEqual([
      "Envelope",
      "Foundation",
    ]);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionRequired: false,
          milestoneId: f.milestoneId,
          reviewCycleId: foundation.cycleId,
          reviewCycleNumber: 1,
          state: "correction_required",
          targetAvailability: "available",
        }),
        expect.objectContaining({
          actionRequired: true,
          milestoneId: envelopeMilestoneId,
          reviewCycleId: envelope.cycleId,
          reviewCycleNumber: 1,
          state: "in_review",
          viewerActionState: "needs_action",
        }),
      ])
    );
    const needsAction = await f.lender.query(
      (api as any).lender_portal_phase5
        .listAllAssignedLenderMilestoneReviewRequests,
      { paginationOpts: PAGE, scope: "action" }
    );
    expect(needsAction.page).toEqual([
      expect.objectContaining({
        milestoneId: envelopeMilestoneId,
        viewerActionState: "needs_action",
      }),
    ]);
    await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      {
        expectedCycleNumber: 0,
        idempotencyKey: "draw-queue-staff-eligibility-cycle",
        target: { drawRequestId: f.drawRequestId, kind: "draw" },
        workosOrganizationId: ORG,
      }
    );
    const lenderStaff = await addLenderStaff(f, "user_lender_staff");
    await expect(
      lenderStaff.query(
        (api as any).lender_portal_phase5
          .listAllAssignedLenderMilestoneReviewRequests,
        { paginationOpts: PAGE, scope: "action" }
      )
    ).resolves.toMatchObject({ isDone: true, page: [] });
    const staffAll = await lenderStaff.query(
      (api as any).lender_portal_phase5
        .listAllAssignedLenderMilestoneReviewRequests,
      { paginationOpts: PAGE, scope: "all" }
    );
    expect(staffAll.page).toHaveLength(2);
    expect(staffAll.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionRequired: false,
          milestoneId: envelopeMilestoneId,
          viewerActionState: "ineligible",
        }),
      ])
    );
    const staffDrawAction = await lenderStaff.query(
      (api as any).lender_portal.getLenderDrawQueue,
      { paginationOpts: PAGE, scope: "action" }
    );
    expect(staffDrawAction).toMatchObject({ isDone: true, page: [] });
    const staffDrawAll = await lenderStaff.query(
      (api as any).lender_portal.getLenderDrawQueue,
      { paginationOpts: PAGE, scope: "all" }
    );
    expect(staffDrawAll.page).toEqual([
      expect.objectContaining({
        actionRequired: false,
        drawRequestId: f.drawRequestId,
        viewerActionState: "ineligible",
      }),
    ]);
    const staffDetail = await lenderStaff.query(
      (api as any).lender_portal_phase5
        .getLenderNotificationReviewRequest,
      {
        historyPaginationOpts: PAGE,
        reviewCycleId: envelope.cycleId,
        reviewCycleNumber: 1,
        target: { kind: "milestone", milestoneId: envelopeMilestoneId },
      }
    );
    expect(staffDetail).toMatchObject({
      targetAvailability: "available",
      viewerActionState: "ineligible",
      viewerDecision: null,
    });
    await expect(
      lenderStaff.mutation(
        (api as any).lender_portal_phase5.decideLenderReviewRequest,
        {
          decision: "approved",
          expectedCycleNumber: 1,
          idempotencyKey: "milestone-queue-staff-ineligible",
          target: { kind: "milestone", milestoneId: envelopeMilestoneId },
        }
      )
    ).rejects.toThrow();
    await f.admin.mutation(
      (api as any).lender_portal_phase5.decideBackofficeReviewRequest,
      {
        decision: "approved",
        expectedCycleNumber: 1,
        idempotencyKey: "milestone-queue-envelope-backoffice",
        target: { kind: "milestone", milestoneId: envelopeMilestoneId },
        workosOrganizationId: ORG,
      }
    );
    await f.lender.mutation(
      (api as any).lender_portal_phase5.decideLenderReviewRequest,
      {
        decision: "approved",
        expectedCycleNumber: 1,
        idempotencyKey: "milestone-queue-envelope-lender",
        target: { kind: "milestone", milestoneId: envelopeMilestoneId },
      }
    );
    const completed = await f.lender.query(
      (api as any).lender_portal_phase5
        .listAllAssignedLenderMilestoneReviewRequests,
      { paginationOpts: PAGE, scope: "all" }
    );
    expect(completed.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionRequired: false,
          milestoneId: envelopeMilestoneId,
          state: "completed",
          viewerActionState: "closed",
        }),
      ])
    );
    const foundationRow = rows.find(
      (row: any) => row.milestoneId === f.milestoneId
    );
    expect(foundationRow).toMatchObject({
      actualCostCents: 4_200_000,
      evidence: expect.arrayContaining([
        expect.objectContaining({ label: "Foundation invoice" }),
      ]),
      plannedBudgetCents: 10_000_000,
      submilestones: [
        expect.objectContaining({
          builderEvidence: true,
          name: "Foundation work",
        }),
      ],
    });
    expect(JSON.stringify(rows)).not.toMatch(
      /Private queue rationale|user_admin|revisionInstructions|privateRationale/
    );
    const unrelatedLender = await addUnassignedLender(
      f,
      "user_unassigned_lender"
    );
    await expect(
      unrelatedLender.query(
        (api as any).lender_portal_phase5
          .listAllAssignedLenderMilestoneReviewRequests,
        { paginationOpts: PAGE, scope: "all" }
      )
    ).resolves.toMatchObject({ isDone: true, page: [] });

    await f.base.run(async (ctx: any) => {
      await ctx.db.patch(envelopeMilestoneId, {
        currentLenderPortalReviewCycleId: foundation.cycleId,
      });
    });
    const stale = await f.lender.query(
      (api as any).lender_portal_phase5
        .listAllAssignedLenderMilestoneReviewRequests,
      { paginationOpts: PAGE, scope: "all" }
    );
    expect(stale.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionRequired: false,
          milestoneId: envelopeMilestoneId,
          plannedBudgetCents: null,
          submilestones: [],
          targetAvailability: "unavailable",
          viewerActionState: "unavailable",
        }),
      ])
    );
    await f.base.run(async (ctx: any) => {
      await ctx.db.patch(f.buildId, { organizationId: "org_foreign" });
    });
    await expect(
      f.lender.query(
        (api as any).lender_portal_phase5
          .listAllAssignedLenderMilestoneReviewRequests,
        { paginationOpts: PAGE, scope: "all" }
      )
    ).resolves.toMatchObject({ isDone: true, page: [] });
  });

  test("enumerates every current Milestone and Draw assignment beyond the former 200-row scan limit", async () => {
    const f = await fixture();
    const submitted = await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      {
        expectedCycleNumber: 0,
        idempotencyKey: "milestone-queue-over-200-seed",
        target: { kind: "milestone", milestoneId: f.milestoneId },
        workosOrganizationId: ORG,
      }
    );
    const { drawRequestIds, milestoneIds: additionalMilestoneIds } =
      await seedAssignedMilestoneCycles(
      f,
      submitted.cycleId,
      200
      );
    const expectedMilestoneIds = new Set([
      String(f.milestoneId),
      ...additionalMilestoneIds.map(String),
    ]);

    const rows: Array<{ milestoneId: string }> = [];
    let cursor: string | null = null;
    let firstPage:
      | {
          continueCursor: string;
          page: Array<{
            milestoneId: string;
            reviewCycleId: string;
            submittedAt: number;
          }>;
        }
      | undefined;
    do {
      const page: {
        continueCursor: string;
        isDone: boolean;
        page: Array<{
          milestoneId: string;
          reviewCycleId: string;
          submittedAt: number;
        }>;
      } = await f.lender.query(
        (api as any).lender_portal_phase5
          .listAllAssignedLenderMilestoneReviewRequests,
        {
          paginationOpts: { cursor, numItems: 50 },
          scope: "all",
        }
      );
      firstPage ??= page;
      rows.push(...page.page);
      cursor = page.isDone ? null : page.continueCursor;
    } while (cursor !== null);

    expect(rows).toHaveLength(201);
    expect(new Set(rows.map((row) => String(row.milestoneId)))).toEqual(
      expectedMilestoneIds
    );
    expect(firstPage?.page).toHaveLength(50);

    const reactiveFirstPage = await f.lender.query(
      (api as any).lender_portal_phase5
        .listAllAssignedLenderMilestoneReviewRequests,
      {
        paginationOpts: {
          cursor: null,
          endCursor: firstPage?.continueCursor,
          numItems: 1,
        },
        scope: "all",
      }
    );
    expect(reactiveFirstPage).toEqual({
      continueCursor: firstPage?.continueCursor,
      isDone: true,
      page: firstPage?.page,
    });
    const firstMilestoneRow = firstPage?.page[0];
    await expect(
      f.lender.query(
        (api as any).lender_portal_phase5
          .listAllAssignedLenderMilestoneReviewRequests,
        {
          paginationOpts: {
            cursor: JSON.stringify({
              anchorId: String(firstMilestoneRow?.reviewCycleId),
              anchorValue: (firstMilestoneRow?.submittedAt ?? 0) + 1,
              scope: "all",
              version: 2,
            }),
            numItems: 20,
          },
          scope: "all",
        }
      )
    ).rejects.toThrow("INVALID_PAGINATION_CURSOR");
    await expect(
      f.lender.query(
        (api as any).lender_portal_phase5
          .listAllAssignedLenderMilestoneReviewRequests,
        {
          paginationOpts: {
            cursor: firstPage?.continueCursor ?? null,
            numItems: 20,
          },
          scope: "action",
        }
      )
    ).rejects.toThrow("INVALID_PAGINATION_CURSOR");

    const expectedDrawRequestIds = new Set(drawRequestIds.map(String));
    const drawRows: Array<{ drawRequestId: string }> = [];
    let drawCursor: string | null = null;
    let firstDrawPage:
      | {
          continueCursor: string;
          page: Array<{
            drawRequestId: string;
            updatedAt: number;
          }>;
        }
      | undefined;
    do {
      const page: {
        continueCursor: string;
        isDone: boolean;
        page: Array<{
          drawRequestId: string;
          updatedAt: number;
        }>;
      } = await f.lender.query(
        (api as any).lender_portal.getLenderDrawQueue,
        {
          paginationOpts: { cursor: drawCursor, numItems: 50 },
          scope: "all",
        }
      );
      firstDrawPage ??= page;
      drawRows.push(...page.page);
      drawCursor = page.isDone ? null : page.continueCursor;
    } while (drawCursor !== null);

    expect(drawRows).toHaveLength(201);
    expect(new Set(drawRows.map((row) => String(row.drawRequestId)))).toEqual(
      new Set([String(f.drawRequestId), ...expectedDrawRequestIds])
    );
    expect(firstDrawPage?.page).toHaveLength(50);
    const reactiveFirstDrawPage = await f.lender.query(
      (api as any).lender_portal.getLenderDrawQueue,
      {
        paginationOpts: {
          cursor: null,
          endCursor: firstDrawPage?.continueCursor,
          numItems: 1,
        },
        scope: "all",
      }
    );
    expect(reactiveFirstDrawPage).toEqual({
      continueCursor: firstDrawPage?.continueCursor,
      isDone: true,
      page: firstDrawPage?.page,
    });
    const firstDrawRow = firstDrawPage?.page[0];
    await expect(
      f.lender.query((api as any).lender_portal.getLenderDrawQueue, {
        paginationOpts: {
          cursor: JSON.stringify({
            anchorId: String(firstDrawRow?.drawRequestId),
            anchorValue: (firstDrawRow?.updatedAt ?? 0) + 1,
            scope: "all",
            version: 2,
          }),
          numItems: 20,
        },
        scope: "all",
      })
    ).rejects.toThrow("INVALID_PAGINATION_CURSOR");
    await expect(
      f.lender.query((api as any).lender_portal.getLenderDrawQueue, {
        paginationOpts: {
          cursor: firstDrawPage?.continueCursor ?? null,
          numItems: 20,
        },
        scope: "action",
      })
    ).rejects.toThrow("INVALID_PAGINATION_CURSOR");
    await expect(
      f.lender.query((api as any).lender_portal.getLenderDrawQueue, {
        paginationOpts: { cursor: "tampered", numItems: 20 },
        scope: "all",
      })
    ).rejects.toThrow("INVALID_PAGINATION_CURSOR");
    await expect(
      f.lender.query((api as any).lender_portal.getLenderDrawQueue, {
        paginationOpts: { cursor: null, numItems: 51 },
        scope: "all",
      })
    ).rejects.toThrow("INVALID_PAGE_SIZE");
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

  test.each([
    "unrelated_same_milestone",
    "foreign_build",
    "foreign_tenant",
    "prior_cycle_association",
    "malformed_reference_type",
  ] as const)(
    "rejects %s immutable Evidence Package child relationships",
    async (scenario) => {
      const f = await fixture();
      await f.base.run(async (ctx: any) => {
        if (scenario === "unrelated_same_milestone") {
          await ctx.db.patch(f.evidenceAssetId, {
            submilestoneKey: "unrelated-foundation-work",
          });
          return;
        }
        if (scenario === "foreign_build") {
          const build = await ctx.db.get(f.buildId);
          const { _creationTime, _id, ...copy } = build;
          const foreignBuildId = await ctx.db.insert("activeBuilds", {
            ...copy,
            buildName: "Foreign evidence Build",
            createdAt: build.createdAt + 1,
          });
          await ctx.db.patch(f.evidenceAssetId, { buildId: foreignBuildId });
          return;
        }
        if (scenario === "foreign_tenant") {
          await ctx.db.patch(f.evidenceAssetId, {
            organizationId: "org_phase5_foreign",
          });
          return;
        }
        if (scenario === "prior_cycle_association") {
          const prior = await ctx.db.get(f.packageRevisionId);
          const currentRevisionId = await ctx.db.insert(
            "buildSubmilestoneEvidencePackageRevisions",
            {
              brokerageId: prior.brokerageId,
              buildId: prior.buildId,
              buildMilestoneId: prior.buildMilestoneId,
              buildSubmilestoneId: prior.buildSubmilestoneId,
              createdAt: prior.createdAt + 1,
              createdByWorkosUserId: "user_builder",
              frozenAt: prior.frozenAt + 1,
              frozenByWorkosUserId: "user_builder",
              milestoneKey: prior.milestoneKey,
              organizationId: prior.organizationId,
              proposalId: prior.proposalId,
              requirementsRevision: prior.requirementsRevision,
              revision: 2,
              status: "frozen",
              submilestoneKey: prior.submilestoneKey,
              supersedesRevisionId: prior._id,
              updatedAt: prior.updatedAt + 1,
            },
          );
          await ctx.db.patch(f.packageItemId, {
            packageRevisionId: currentRevisionId,
          });
          const milestone = await ctx.db.get(f.milestoneId);
          await ctx.db.patch(f.milestoneId, {
            completionClaim: {
              ...milestone.completionClaim,
              evidencePackageRevisionIds: [
                {
                  revision: 2,
                  revisionId: currentRevisionId,
                  submilestoneKey: "foundation-work",
                },
              ],
            },
          });
          return;
        }
        const milestone = await ctx.db.get(f.milestoneId);
        await ctx.db.patch(f.milestoneId, {
          completionClaim: {
            ...milestone.completionClaim,
            evidencePackageRevisionIds: [
              {
                revision: 1,
                revisionId: String(f.evidenceAssetId),
                submilestoneKey: "foundation-work",
              },
            ],
          },
        });
      });
      await expect(
        f.builder.mutation(
          (api as any).lender_portal_phase5.submitBuilderReviewRequest,
          {
            expectedCycleNumber: 0,
            idempotencyKey: `phase5-invalid-child-${scenario}`,
            target: { kind: "milestone", milestoneId: f.milestoneId },
            workosOrganizationId: ORG,
          },
        ),
      ).rejects.toThrow("INVALID_EVIDENCE_PACKAGE_REFERENCE");
    },
  );

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

async function seedAssignedMilestoneCycles(
  fixtureValue: Awaited<ReturnType<typeof fixture>>,
  templateCycleId: any,
  count: number
) {
  return await fixtureValue.base.run(async (ctx: any) => {
    const [seedBuild, templateCycle] = await Promise.all([
      ctx.db.get(fixtureValue.buildId),
      ctx.db.get(templateCycleId),
    ]);
    if (!seedBuild || !templateCycle) {
      throw new Error("Milestone queue seed is unavailable.");
    }

    const drawRequestIds = [];
    const milestoneIds = [];
    for (let index = 0; index < count; index += 1) {
      const createdAt = templateCycle.submittedAt + index + 1;
      const suffix = String(index + 1).padStart(3, "0");
      const buildName = `Assigned Build ${suffix}`;
      const milestoneName = `Assigned Milestone ${suffix}`;
      const milestoneKey = `assigned-milestone-${suffix}`;
      const proposalId = await ctx.db.insert("buildProposals", {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 10_000_000,
        brokerageId: fixtureValue.brokerageId,
        buildName,
        builderProfileId: seedBuild.builderProfileId,
        createdAt,
        createdByWorkosUserId: "user_admin",
        lenderDrawPolicyLimitCents: 20_000_000,
        location: `${index + 1} Assigned Queue Road`,
        organizationId: ORG,
        reviewOutcome: "approved",
        status: "closed",
        totalBudgetCents: 1_000_000 + index,
        updatedAt: createdAt,
        updatedByWorkosUserId: "user_admin",
      });
      const buildId = await ctx.db.insert("activeBuilds", {
        brokerageId: fixtureValue.brokerageId,
        builderProfileId: seedBuild.builderProfileId,
        buildName,
        createdAt,
        location: `${index + 1} Assigned Queue Road`,
        organizationId: ORG,
        proposalId,
        startDate: "2026-08-01",
        status: "active",
        totalBudgetCents: 1_000_000 + index,
        updatedAt: createdAt,
        workflowRuleSnapshotId: seedBuild.workflowRuleSnapshotId,
      });
      await ctx.db.patch(proposalId, { activeBuildId: buildId });
      await ctx.db.insert("proposalLenderAssignments", {
        assignedAt: createdAt,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId: fixtureValue.brokerageId,
        createdAt,
        lenderBrokerageId: fixtureValue.brokerageId,
        lenderOrganizationId: fixtureValue.lenderOrganizationId,
        lenderOrganizationName: "Phase 5 Lender",
        organizationId: ORG,
        proposalId,
        status: "current",
      });
      const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
        brokerageId: fixtureValue.brokerageId,
        budgetCents: 1_000_000 + index,
        createdAt,
        dayEnd: 10,
        dayStart: 0,
        dependencyKeys: [],
        drawAvailabilityCents: 900_000 + index,
        durationDays: 10,
        key: milestoneKey,
        name: milestoneName,
        order: 1,
        organizationId: ORG,
        proposalId,
        updatedAt: createdAt,
      });
      const milestoneId = await ctx.db.insert("buildMilestones", {
        brokerageId: fixtureValue.brokerageId,
        budgetCents: 1_000_000 + index,
        buildId,
        createdAt,
        dayEnd: 10,
        dayStart: 0,
        dependencyKeys: [],
        drawAvailabilityCents: 900_000 + index,
        durationDays: 10,
        key: milestoneKey,
        name: milestoneName,
        order: 1,
        organizationId: ORG,
        progressPercent: 100,
        proposalMilestoneId,
        status: "complete",
        updatedAt: createdAt,
      });
      const cycleId = await ctx.db.insert("lenderPortalReviewCycles", {
        approvedGroups: [],
        brokerageId: fixtureValue.brokerageId,
        buildId,
        commandFingerprint: `assigned-cycle-${suffix}`,
        cycleNumber: 1,
        decisionSummaries: [],
        evidenceReferences: [],
        idempotencyKey: `assigned-cycle-${suffix}`,
        isCurrent: true,
        kind: "milestone",
        lenderApprovalCount: 0,
        milestoneId,
        organizationId: ORG,
        requestIdentity: String(milestoneId),
        requirements: templateCycle.requirements,
        state: "in_review",
        submission: {
          actualCostCents: 900_000 + index,
          completedDay: 9,
          kind: "milestone",
          milestoneId,
          milestoneKey,
          milestoneName,
          note: null,
          progressPercent: 100,
          submittedAt: "2026-08-10T12:00:00.000Z",
        },
        submittedAt: createdAt,
        submittedByWorkosUserId: "user_builder",
        targetLabel: milestoneName,
        updatedAt: createdAt,
      });
      await ctx.db.patch(milestoneId, {
        currentLenderPortalReviewCycleId: cycleId,
        currentLenderPortalReviewCycleNumber: 1,
        lenderPortalReviewState: "in_review",
      });
      const drawRequestId = await ctx.db.insert("activeBuildDrawRequests", {
        amountCents: 500_000 + index,
        brokerageId: fixtureValue.brokerageId,
        buildId,
        clientOperationId: `assigned-draw-${suffix}`,
        createdAt,
        displayId: `DRAW-${suffix}`,
        label: `Assigned Draw ${suffix}`,
        organizationId: ORG,
        requestKey: `assigned-draw-${suffix}`,
        requestedAt: "2026-08-11T12:00:00.000Z",
        requestedByWorkosUserId: "user_builder",
        status: "in_review",
        updatedAt: createdAt,
      });
      const drawCycleId = await ctx.db.insert("lenderPortalReviewCycles", {
        approvedGroups: [],
        brokerageId: fixtureValue.brokerageId,
        buildId,
        commandFingerprint: `assigned-draw-cycle-${suffix}`,
        cycleNumber: 1,
        decisionSummaries: [],
        drawRequestId,
        evidenceReferences: [],
        idempotencyKey: `assigned-draw-cycle-${suffix}`,
        isCurrent: true,
        kind: "draw",
        lenderApprovalCount: 0,
        organizationId: ORG,
        requestIdentity: `draw:${String(drawRequestId)}`,
        requirements: templateCycle.requirements,
        state: "in_review",
        submission: {
          allocations: [],
          amountCents: 500_000 + index,
          displayId: `DRAW-${suffix}`,
          drawRequestId,
          kind: "draw",
          label: `Assigned Draw ${suffix}`,
          note: null,
          requestedAt: "2026-08-11T12:00:00.000Z",
          requestKey: `assigned-draw-${suffix}`,
        },
        submittedAt: createdAt,
        submittedByWorkosUserId: "user_builder",
        targetLabel: `Assigned Draw ${suffix}`,
        updatedAt: createdAt,
      });
      await ctx.db.patch(drawRequestId, {
        currentLenderPortalReviewCycleId: drawCycleId,
        currentLenderPortalReviewCycleNumber: 1,
        lenderPortalReviewState: "in_review",
      });
      drawRequestIds.push(drawRequestId);
      milestoneIds.push(milestoneId);
    }
    return { drawRequestIds, milestoneIds };
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
    const reviewPolicy = {
      drawApprovalMode: "both" as const,
      drawLenderQuorum: 1,
      milestoneApprovalMode: "both" as const,
      milestoneLenderQuorum: 1,
      milestoneReceiptInvoiceRequired: false,
      milestoneSiteVisitRequired: false,
    };
    const policyVersionId = await ctx.db.insert("proposalReviewPolicyVersions", {
      brokerageId, configuredAt: now, configuredByRole: "admin",
      configuredByWorkosUserId: "user_admin", idempotencyKey: "phase5-policy-v1",
      organizationId: ORG, policy: reviewPolicy, proposalId,
      reason: "Phase 5 locked policy fixture.", version: 1,
    });
    const proposalRevisionId = await ctx.db.insert("proposalRevisions", {
      backOfficeApprovedByWorkosUserId: "user_admin", brokerageId,
      changedCheckpoints: ["accessReviewPolicy"],
      checkpoints: {
        accessReviewPolicy: reviewPolicy,
        budget: { totalBudgetCents: 10_000_000 },
        builder: { builderProfileId, displayName: "Phase 5 Builder" },
        milestoneCount: { count: 1 },
        scheduleTimeline: {
          milestonesFingerprint: "phase5", proposedStartDate: "2026-08-01",
          timelineRangeMax: 20, timelineRangeMin: 0,
        },
      },
      createdAt: now, createdByRole: "admin", createdByWorkosUserId: "user_admin",
      idempotencyKey: "phase5-revision-v1", organizationId: ORG, proposalId,
      reason: "Phase 5 locked revision fixture.", reviewPolicyVersionId: policyVersionId,
      revisionNumber: 1,
    });
    const reviewPolicyLockId = await ctx.db.insert("proposalReviewPolicyLocks", {
      activeLenderMemberCount: 1, brokerageId, idempotencyKey: "phase5-policy-lock",
      lockedAt: now, lockedByRole: "admin", lockedByWorkosUserId: "user_admin",
      organizationId: ORG, policy: reviewPolicy, policyVersionId, proposalId,
      proposalRevisionId, proposalRevisionNumber: 1,
      reason: "Phase 5 policy lock fixture.",
    });
    const buildId = await ctx.db.insert("activeBuilds", {
      brokerageId, builderProfileId, buildName: "Stable cycle build", createdAt: now,
      location: "15 Stable Cycle Road", organizationId: ORG, proposalId,
      reviewPolicyLockId, reviewPolicySnapshot: reviewPolicy,
      startDate: "2026-08-01", status: "active", totalBudgetCents: 10_000_000,
      updatedAt: now, workflowRuleSnapshotId: snapshotId,
    });
    await ctx.db.patch(proposalId, { activeBuildId: buildId });
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
    const proposalSubmilestoneId = await ctx.db.insert("proposalSubmilestones", {
      brokerageId, createdAt: now, key: "foundation-work",
      milestoneKey: "foundation", name: "Foundation work", order: 1,
      organizationId: ORG, proposalId, proposalMilestoneId, updatedAt: now,
    });
    const buildSubmilestoneId = await ctx.db.insert("buildSubmilestones", {
      brokerageId, buildId, buildMilestoneId: milestoneId, createdAt: now,
      key: "foundation-work", milestoneKey: "foundation", name: "Foundation work",
      order: 1, organizationId: ORG, proposalSubmilestoneId,
      status: "complete", updatedAt: now,
    });
    const packageRevisionId = await ctx.db.insert(
      "buildSubmilestoneEvidencePackageRevisions",
      {
        brokerageId, buildId, buildMilestoneId: milestoneId,
        buildSubmilestoneId, createdAt: now, createdByWorkosUserId: "user_builder",
        frozenAt: now, frozenByWorkosUserId: "user_builder", milestoneKey: "foundation",
        organizationId: ORG, proposalId, requirementsRevision: 1, revision: 1,
        status: "frozen", submilestoneKey: "foundation-work", updatedAt: now,
      },
    );
    const evidenceAssetId = await ctx.db.insert("buildEvidenceAssets", {
      brokerageId, buildId, createdAt: now, evidenceKey: "foundation-invoice",
      evidencePackageRevisionId: packageRevisionId,
      fileName: "foundation-invoice.pdf", label: "Foundation invoice", locationVerified: true,
      milestoneKey: "foundation", mimeType: "application/pdf", organizationId: ORG,
      proposalId, sizeBytes: 1_024, source: "builder_upload",
      submilestoneKey: "foundation-work", tag: "invoice", updatedAt: now,
    });
    const packageItemId = await ctx.db.insert("buildSubmilestoneEvidencePackageItems", {
      brokerageId, buildId, buildMilestoneId: milestoneId, buildSubmilestoneId,
      createdAt: now, evidenceAssetId, locationVerified: true,
      organizationId: ORG, packageRevisionId, requirementKey: "completion-photo",
      sourceKind: "canonical_upload", sourceUploaderWorkosUserId: "user_builder",
    });
    await ctx.db.patch(milestoneId, {
      completionClaim: {
        actualCostCents: 4_200_000, completedDay: 18,
        evidencePackageRevisionIds: [{
          revision: 1, revisionId: packageRevisionId,
          submilestoneKey: "foundation-work",
        }],
        note: "Ready.", submittedAt: "2026-08-15T12:00:00.000Z",
      },
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
      buildSubmilestoneId,
      drawRequestId,
      evidenceAssetId,
      lenderOrganizationId,
      milestoneId,
      packageItemId,
      packageRevisionId,
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

async function addUnassignedLender(
  fixtureValue: Awaited<ReturnType<typeof fixture>>,
  subject: string
) {
  await fixtureValue.base.run(async (ctx: any) => {
    const now = Date.now();
    const lenderOrganizationId = await ctx.db.insert("lenderOrganizations", {
      brokerageId: fixtureValue.brokerageId,
      createdAt: now,
      displayName: "Unassigned Lender",
      legalName: "Unassigned Lender Inc.",
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
      authId: subject,
      createdAt: now,
      email: `${subject}@example.com`,
      name: "Unassigned Lender",
      sourceEventId: `phase5-user-${subject}`,
      sourceEventType: "test",
      status: "active",
      updatedAt: now,
      workosUserId: subject,
    });
    await ctx.db.insert("workosOrganizationMemberships", {
      createdAt: now,
      roleSlug: "lender",
      roleSlugs: ["lender"],
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
      lenderOrganizationId,
      normalizedEmail: `${subject}@example.com`,
      reason: "Unassigned lender privacy fixture.",
      status: "active",
      updatedAt: now,
      workosUserId: subject,
    });
  });
  return identity(
    fixtureValue.base,
    ["lender"],
    subject,
    FAIRLEND_WORKOS_ORGANIZATION_ID
  );
}

async function addLenderStaff(
  fixtureValue: Awaited<ReturnType<typeof fixture>>,
  subject: string
) {
  await fixtureValue.base.run(async (ctx: any) => {
    const now = Date.now();
    await ctx.db.insert("users", {
      authId: subject,
      createdAt: now,
      email: `${subject}@example.com`,
      name: "Lender Staff",
      sourceEventId: `phase5-user-${subject}`,
      sourceEventType: "test",
      status: "active",
      updatedAt: now,
      workosUserId: subject,
    });
    await ctx.db.insert("workosOrganizationMemberships", {
      createdAt: now,
      roleSlug: "lender-staff",
      roleSlugs: ["lender-staff"],
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
      reason: "Lender staff queue fixture.",
      status: "active",
      updatedAt: now,
      workosUserId: subject,
    });
  });
  return identity(
    fixtureValue.base,
    ["lender-staff"],
    subject,
    FAIRLEND_WORKOS_ORGANIZATION_ID
  );
}
