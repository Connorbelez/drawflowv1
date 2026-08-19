/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "./fairLendConfig";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORG = "org_phase6";
const PAGE = { cursor: null, numItems: 50 };

describe("Lender Portal Phase 6 evidence and approval policy", () => {
  test("requires a completed Site Visit report with a photo and exact current-cycle documented cost", async () => {
    const f = await fixture({
      milestoneApprovalMode: "both",
      milestoneLenderQuorum: 1,
      milestoneReceiptInvoiceRequired: true,
      milestoneSiteVisitRequired: true,
    });
    const target = { kind: "milestone" as const, milestoneId: f.milestoneId };
    const costDocumentId = await seedCostDocument(f, 1_000_001);

    await expect(
      submitMilestone(f, target, [costDocumentId], "phase6-no-site-visit"),
    ).rejects.toThrow("SITE_VISIT_EVIDENCE_REQUIRED");

    const visitId = await seedSiteVisit(f, {
      recordNote: "Foundation placement verified.",
      status: "complete",
    });
    await expect(
      submitMilestone(f, target, [costDocumentId], "phase6-no-photo"),
    ).rejects.toThrow("SITE_VISIT_EVIDENCE_REQUIRED");

    const photoId = await seedSiteVisitPhoto(f, visitId, {
      locationFailureReason: "Geofence unavailable at capture time.",
      locationVerified: false,
    });
    const submitted = await submitMilestone(
      f,
      target,
      [costDocumentId],
      "phase6-valid-evidence",
    );
    expect(submitted.state).toBe("in_review");

    const [backoffice, lender] = await Promise.all([
      f.admin.query(
        (api as any).lender_portal_phase5.getBackofficeReviewRequest,
        { historyPaginationOpts: PAGE, target, workosOrganizationId: ORG },
      ),
      f.lender.query(
        (api as any).lender_portal_phase5.getLenderReviewRequest,
        { historyPaginationOpts: PAGE, target },
      ),
    ]);
    expect(backoffice.currentCycle.evidenceReferences).toEqual(
      lender.currentCycle.evidenceReferences,
    );
    expect(backoffice.currentCycle.evidenceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountCents: 1_000_001,
          costDocumentId,
          currency: "CAD",
          documentKind: "invoice",
          kind: "cost_document",
        }),
        expect.objectContaining({
          evidenceAssetId: photoId,
          kind: "asset",
          locationFailureReason: "Geofence unavailable at capture time.",
          locationVerified: false,
        }),
        expect.objectContaining({
          kind: "site_visit",
          report: "Foundation placement verified.",
          siteVisitId: visitId,
        }),
      ]),
    );
    const [backofficeEvidence, lenderEvidence] = await Promise.all([
      f.admin.query(
        (api as any).lender_portal_phase5.getBackofficeReviewEvidence,
        {
          cycleId: submitted.cycleId,
          target,
          workosOrganizationId: ORG,
        },
      ),
      f.lender.query(
        (api as any).lender_portal_phase5.getLenderReviewEvidence,
        { cycleId: submitted.cycleId, target },
      ),
    ]);
    expect(lenderEvidence).toEqual(backofficeEvidence);
    expect(backofficeEvidence.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          downloadUrl: expect.stringContaining("http"),
          reference: expect.objectContaining({
            evidenceAssetId: photoId,
            kind: "asset",
          }),
        }),
        expect.objectContaining({
          downloadUrl: expect.stringContaining("http"),
          reference: expect.objectContaining({
            costDocumentId,
            kind: "cost_document_page",
          }),
        }),
      ]),
    );
    const historicalCycleId = await f.base.run(async (ctx: any) => {
      const current = await ctx.db.get(submitted.cycleId);
      if (!current) {
        throw new Error("Expected the submitted review cycle.");
      }
      const { _creationTime, _id, ...snapshot } = current;
      return await ctx.db.insert("lenderPortalReviewCycles", {
        ...snapshot,
        cycleNumber: 0,
        idempotencyKey: "phase6-historical-evidence-cycle",
        isCurrent: false,
      });
    });
    await expect(
      f.lender.query(
        (api as any).lender_portal_phase5.getLenderReviewEvidence,
        { cycleId: historicalCycleId, target },
      ),
    ).rejects.toThrow();
    await expect(
      f.admin.query(
        (api as any).lender_portal_phase5.getBackofficeReviewEvidence,
        {
          cycleId: historicalCycleId,
          target,
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow();

    const currentCycleNumber = await f.base.run(async (ctx: any) => {
      const milestone = await ctx.db.get(f.milestoneId);
      if (!milestone) {
        throw new Error("Expected the current Milestone.");
      }
      const previous = milestone.currentLenderPortalReviewCycleNumber;
      if (typeof previous !== "number") {
        throw new Error("Expected the current review cycle number.");
      }
      await ctx.db.patch(f.milestoneId, {
        currentLenderPortalReviewCycleNumber: previous + 1,
      });
      return previous;
    });
    await expect(
      f.lender.query(
        (api as any).lender_portal_phase5.getLenderReviewEvidence,
        { cycleId: submitted.cycleId, target },
      ),
    ).rejects.toThrow();
    await expect(
      f.admin.query(
        (api as any).lender_portal_phase5.getBackofficeReviewEvidence,
        {
          cycleId: submitted.cycleId,
          target,
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow();
    await f.base.run(async (ctx: any) => {
      await ctx.db.patch(f.milestoneId, {
        currentLenderPortalReviewCycleNumber: currentCycleNumber,
      });
    });
    await expect(
      f.builder.query(
        (api as any).lender_portal_phase5.getLenderReviewEvidence,
        { cycleId: submitted.cycleId, target },
      ),
    ).rejects.toThrow();
    const unassignedLender = await addUnassignedLender(
      f,
      "user_unassigned_lender",
    );
    await expect(
      unassignedLender.query(
        (api as any).lender_portal_phase5.getLenderReviewEvidence,
        { cycleId: submitted.cycleId, target },
      ),
    ).rejects.toThrow();
    await f.base.run(async (ctx: any) => {
      const assignments = await ctx.db
        .query("proposalLenderAssignments")
        .withIndex("by_proposal_status", (query: any) =>
          query.eq("proposalId", f.proposalId).eq("status", "current"),
        )
        .collect();
      for (const assignment of assignments) {
        await ctx.db.patch(assignment._id, {
          status: "withdrawn",
          withdrawnAt: Date.now(),
          withdrawnByRole: "admin",
          withdrawnByWorkosUserId: "user_admin",
          withdrawalReason: "Phase 6 evidence ACL regression.",
        });
      }
    });
    await expect(
      f.lender.query(
        (api as any).lender_portal_phase5.getLenderReviewEvidence,
        { cycleId: submitted.cycleId, target },
      ),
    ).rejects.toThrow();
  });

  test("uses safe integer arithmetic and excludes stale, voided, foreign, and unrelated cost attachments", async () => {
    const f = await fixture({
      milestoneApprovalMode: "backoffice_only",
      milestoneReceiptInvoiceRequired: true,
    });
    const target = { kind: "milestone" as const, milestoneId: f.milestoneId };
    const shortDocumentId = await seedCostDocument(f, 1_000_000);
    await expect(
      submitMilestone(f, target, [shortDocumentId], "phase6-short-total"),
    ).rejects.toThrow("DOCUMENTED_TOTAL_MISMATCH");

    const fractionalDocumentId = await seedCostDocument(f, 1_000_001.5);
    await expect(
      submitMilestone(
        f,
        target,
        [fractionalDocumentId],
        "phase6-fractional-total",
      ),
    ).rejects.toThrow("INVALID_MONEY_AMOUNT");

    const validDocumentId = await seedCostDocument(f, 1_000_001);
    const first = await submitMilestone(
      f,
      target,
      [validDocumentId],
      "phase6-current-cycle-one",
    );
    await f.admin.mutation(
      (api as any).lender_portal_phase5.decideBackofficeReviewRequest,
      {
        decision: "rejected",
        expectedCycleNumber: 1,
        idempotencyKey: "phase6-cost-correction",
        revisionInstructions: "Attach the corrected current-cycle invoice.",
        target,
        workosOrganizationId: ORG,
      },
    );
    await expect(
      submitMilestone(f, target, [], "phase6-current-cycle-two-empty", 1),
    ).rejects.toThrow("DOCUMENTED_TOTAL_MISMATCH");
    const replacementDocumentId = await seedCostDocument(f, 1_000_001);
    const second = await submitMilestone(
      f,
      target,
      [replacementDocumentId],
      "phase6-current-cycle-two",
      1,
    );
    expect(second).toMatchObject({
      cycleNumber: 2,
      requestIdentity: first.requestIdentity,
    });

    const voidedDocumentId = await seedCostDocument(f, 1_000_001, {
      voided: true,
    });
    await f.admin.mutation(
      (api as any).lender_portal_phase5.decideBackofficeReviewRequest,
      {
        decision: "rejected",
        expectedCycleNumber: 2,
        idempotencyKey: "phase6-cost-correction-two",
        revisionInstructions: "Replace the voided attachment.",
        target,
        workosOrganizationId: ORG,
      },
    );
    await expect(
      submitMilestone(
        f,
        target,
        [voidedDocumentId],
        "phase6-voided-document",
        2,
      ),
    ).rejects.toThrow("COST_DOCUMENT_UNAVAILABLE");

    const foreignBuildDocumentId = await seedCostDocument(f, 1_000_001);
    await f.base.run(async (ctx: any) => {
      const build = await ctx.db.get(f.buildId);
      const { _creationTime, _id, ...foreignBuild } = build;
      const foreignBuildId = await ctx.db.insert("activeBuilds", {
        ...foreignBuild,
        buildName: "Foreign Build",
        createdAt: build.createdAt + 1,
      });
      await ctx.db.patch(foreignBuildDocumentId, { buildId: foreignBuildId });
    });
    await expect(
      submitMilestone(
        f,
        target,
        [foreignBuildDocumentId],
        "phase6-foreign-build-document",
        2,
      ),
    ).rejects.toThrow("COST_DOCUMENT_UNAVAILABLE");

    const foreignTenantDocumentId = await seedCostDocument(f, 1_000_001);
    await f.base.run((ctx: any) =>
      ctx.db.patch(foreignTenantDocumentId, {
        organizationId: "org_phase6_foreign",
      }),
    );
    await expect(
      submitMilestone(
        f,
        target,
        [foreignTenantDocumentId],
        "phase6-foreign-tenant-document",
        2,
      ),
    ).rejects.toThrow("COST_DOCUMENT_UNAVAILABLE");

    const unrelatedDocumentId = await seedCostDocument(f, 1_000_001);
    await f.base.run(async (ctx: any) => {
      const milestone = await ctx.db.get(f.milestoneId);
      const { _creationTime: milestoneCreation, _id: milestoneId, ...copy } =
        milestone;
      const unrelatedMilestoneId = await ctx.db.insert("buildMilestones", {
        ...copy,
        key: "framing",
        name: "Framing",
        order: 2,
      });
      const submilestone = await ctx.db.get(f.submilestoneId);
      const {
        _creationTime: submilestoneCreation,
        _id: submilestoneId,
        ...submilestoneCopy
      } = submilestone;
      const unrelatedSubmilestoneId = await ctx.db.insert(
        "buildSubmilestones",
        {
          ...submilestoneCopy,
          buildMilestoneId: unrelatedMilestoneId,
          key: "framing-work",
          milestoneKey: "framing",
          name: "Framing work",
          order: 2,
        },
      );
      const allocations = await ctx.db
        .query("costDocumentAllocations")
        .withIndex("by_costDocumentId_and_order", (query: any) =>
          query.eq("costDocumentId", unrelatedDocumentId),
        )
        .collect();
      await ctx.db.patch(allocations[0]._id, {
        buildSubmilestoneId: unrelatedSubmilestoneId,
        submilestoneKeySnapshot: "framing-work",
        submilestoneNameSnapshot: "Framing work",
      });
    });
    await expect(
      submitMilestone(
        f,
        target,
        [unrelatedDocumentId],
        "phase6-unrelated-milestone-document",
        2,
      ),
    ).rejects.toThrow("COST_DOCUMENT_UNAVAILABLE");
  });

  test.each([
    ["milestone", "backoffice_only", "backoffice"],
    ["milestone", "lender_quorum", "lender"],
    ["milestone", "both", "backoffice_first"],
    ["milestone", "both", "lender_first"],
    ["draw", "backoffice_only", "backoffice"],
    ["draw", "lender_quorum", "lender"],
    ["draw", "both", "backoffice_first"],
    ["draw", "both", "lender_first"],
  ] as const)(
    "enforces %s policy %s with %s ordering",
    async (kind, approvalMode, order) => {
      const f = await fixture({
        drawApprovalMode: approvalMode,
        milestoneApprovalMode: approvalMode,
      });
      const target =
        kind === "milestone"
          ? ({ kind, milestoneId: f.milestoneId } as const)
          : ({ drawRequestId: f.drawRequestId, kind } as const);
      await f.builder.mutation(
        (api as any).lender_portal_phase5.submitBuilderReviewRequest,
        {
          expectedCycleNumber: 0,
          idempotencyKey: `phase6-${kind}-${approvalMode}-${order}-submit`,
          target,
          workosOrganizationId: ORG,
        },
      );

      const approveBackoffice = () =>
        f.admin.mutation(
          (api as any).lender_portal_phase5.decideBackofficeReviewRequest,
          {
            decision: "approved",
            expectedCycleNumber: 1,
            idempotencyKey: `phase6-${kind}-${approvalMode}-${order}-bo`,
            target,
            workosOrganizationId: ORG,
          },
        );
      const approveLender = () =>
        f.lender.mutation(
          (api as any).lender_portal_phase5.decideLenderReviewRequest,
          {
            decision: "approved",
            expectedCycleNumber: 1,
            idempotencyKey: `phase6-${kind}-${approvalMode}-${order}-lender`,
            target,
          },
        );

      if (order === "backoffice") {
        expect((await approveBackoffice()).state).toBe("completed");
      } else if (order === "lender") {
        expect((await approveLender()).state).toBe("completed");
      } else if (order === "backoffice_first") {
        expect((await approveBackoffice()).state).toBe("partial_approval");
        expect((await approveLender()).state).toBe("completed");
      } else {
        expect((await approveLender()).state).toBe("partial_approval");
        expect((await approveBackoffice()).state).toBe("completed");
      }
    },
  );

  test("canonical Milestone submission creates the stable cycle and canonical approval cannot race or bypass it", async () => {
    const f = await fixture({ milestoneApprovalMode: "backoffice_only" });
    await f.base.run((ctx: any) =>
      ctx.db.patch(f.milestoneId, {
        actualStartedAt: f.now - 1_000,
        completionClaim: undefined,
        workflowRevision: 0,
      }),
    );
    await f.builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualCostCents: 1_000_001,
        buildId: f.buildId,
        completedDay: 18,
        expectedRevision: 0,
        idempotencyKey: "phase6-canonical-milestone-submit",
        milestoneKey: "foundation",
        note: "Canonical Phase 6 submission.",
        workosOrganizationId: ORG,
      },
    );
    const target = { kind: "milestone" as const, milestoneId: f.milestoneId };
    const review = await f.admin.query(
      (api as any).lender_portal_phase5.getBackofficeReviewRequest,
      { historyPaginationOpts: PAGE, target, workosOrganizationId: ORG },
    );
    expect(review).toMatchObject({
      currentCycleNumber: 1,
      requestIdentity: `milestone:${String(f.milestoneId)}`,
      state: "in_review",
    });

    const raced = await Promise.allSettled([
      f.admin.mutation(
        (api as any).production_proposals.approveActiveBuildMilestone,
        {
          buildId: f.buildId,
          expectedReviewCycleNumber: 1,
          milestoneKey: "foundation",
          note: "Canonical approval passed.",
          reviewIdempotencyKey: "phase6-canonical-milestone-approve-a",
          workosOrganizationId: ORG,
        },
      ),
      f.admin.mutation(
        (api as any).production_proposals.approveActiveBuildMilestone,
        {
          buildId: f.buildId,
          expectedReviewCycleNumber: 1,
          milestoneKey: "foundation",
          note: "Canonical approval passed.",
          reviewIdempotencyKey: "phase6-canonical-milestone-approve-b",
          workosOrganizationId: ORG,
        },
      ),
    ]);
    expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );
    const milestone = await f.base.run((ctx: any) =>
      ctx.db.get(f.milestoneId),
    );
    expect(milestone).toMatchObject({
      lenderPortalReviewState: "completed",
      status: "complete",
    });
  });

  test("canonical Draw approval waits for lender quorum and release rejects stale cycles", async () => {
    const f = await fixture({ drawApprovalMode: "both" });
    const target = {
      drawRequestId: f.drawRequestId,
      kind: "draw" as const,
    };
    await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      {
        expectedCycleNumber: 0,
        idempotencyKey: "phase6-canonical-draw-submit",
        target,
        workosOrganizationId: ORG,
      },
    );
    await f.base.run((ctx: any) =>
      ctx.db.patch(f.drawRequestId, { status: "in_review" }),
    );
    const approveArgs = {
      buildId: f.buildId,
      drawKey: "dr-0001-phase6",
      expectedReviewCycleNumber: 1,
      note: "Back Office approval contribution.",
      reviewIdempotencyKey: "phase6-canonical-draw-backoffice",
      workosOrganizationId: ORG,
    };
    await f.admin.mutation(
      (api as any).production_proposals.approveActiveBuildDraw,
      approveArgs,
    );
    expect(
      ((await f.base.run((ctx: any) => ctx.db.get(f.drawRequestId))) as any)
        .status,
    ).toBe("in_review");
    await f.lender.mutation(
      (api as any).lender_portal_phase5.decideLenderReviewRequest,
      {
        decision: "approved",
        expectedCycleNumber: 1,
        idempotencyKey: "phase6-canonical-draw-lender",
        target,
      },
    );
    await f.admin.mutation(
      (api as any).production_proposals.approveActiveBuildDraw,
      approveArgs,
    );
    expect(
      ((await f.base.run((ctx: any) => ctx.db.get(f.drawRequestId))) as any)
        .status,
    ).toBe("approved_for_release");
    await expect(
      f.admin.mutation(
        (api as any).production_proposals.releaseActiveBuildDraw,
        {
          buildId: f.buildId,
          drawKey: "dr-0001-phase6",
          expectedReviewCycleNumber: 2,
          note: "Release stale-cycle attempt.",
          releaseDate: "2026-08-16",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("REVIEW_CYCLE_COMPLETION_REQUIRED");
    await f.admin.mutation(
      (api as any).production_proposals.releaseActiveBuildDraw,
      {
        buildId: f.buildId,
        drawKey: "dr-0001-phase6",
        expectedReviewCycleNumber: 1,
        note: "Release after exact terminal review.",
        releaseDate: "2026-08-16",
        workosOrganizationId: ORG,
      },
    );
    expect(
      ((await f.base.run((ctx: any) => ctx.db.get(f.drawRequestId))) as any)
        .status,
    ).toBe("released");
  });

  test("invalidates a pending decision across WorkOS membership deactivate-restore without changing communication idempotency", async () => {
    const f = await fixture({
      milestoneApprovalMode: "lender_quorum",
      milestoneLenderQuorum: 2,
    });
    const lenderTwo = await addEligibleLender(f, "user_lender_two");
    const target = { kind: "milestone" as const, milestoneId: f.milestoneId };
    await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      {
        expectedCycleNumber: 0,
        idempotencyKey: "phase6-deactivation-submit",
        target,
        workosOrganizationId: ORG,
      },
    );
    await f.lender.mutation(
      (api as any).lender_portal_phase5.decideLenderReviewRequest,
      {
        decision: "approved",
        expectedCycleNumber: 1,
        idempotencyKey: "phase6-deactivation-first",
        target,
      },
    );
    await deactivateWorkosMembership(f, "user_lender");

    const afterDeactivation = await f.admin.query(
      (api as any).lender_portal_phase5.getBackofficeReviewRequest,
      { historyPaginationOpts: PAGE, target, workosOrganizationId: ORG },
    );
    expect(afterDeactivation.currentCycle).toMatchObject({
      decisions: [
        expect.objectContaining({
          actorWorkosUserId: "user_lender",
          countsTowardCurrentApproval: false,
        }),
      ],
      state: "in_review",
    });

    await restoreSameWorkosMembership(f, "user_lender");
    const afterReactivation = await f.admin.query(
      (api as any).lender_portal_phase5.getBackofficeReviewRequest,
      { historyPaginationOpts: PAGE, target, workosOrganizationId: ORG },
    );
    expect(afterReactivation.currentCycle).toMatchObject({
      decisions: [
        expect.objectContaining({
          actorWorkosUserId: "user_lender",
          countsTowardCurrentApproval: false,
        }),
      ],
      state: "in_review",
    });

    expect(
      (
        await lenderTwo.mutation(
          (api as any).lender_portal_phase5.decideLenderReviewRequest,
          {
            decision: "approved",
            expectedCycleNumber: 1,
            idempotencyKey: "phase6-deactivation-second",
            target,
          },
        )
      ).state,
    ).toBe("partial_approval");
    const approvalRequiredIntents = await f.base.run(async (ctx: any) =>
      await ctx.db
        .query("communicationIntents")
        .withIndex(
          "by_relatedEntityType_and_relatedEntityId_and_createdAt",
          (query: any) =>
            query
              .eq("relatedEntityType", "milestone")
              .eq("relatedEntityId", String(f.milestoneId)),
        )
        .collect(),
    );
    expect(approvalRequiredIntents).toHaveLength(2);
    expect(
      approvalRequiredIntents.every(
        (intent: any) =>
          !("lenderEligibilityEpoch" in JSON.parse(intent.payloadSnapshot)),
      ),
    ).toBe(true);
    expect(
      new Set(
        approvalRequiredIntents.map((intent: any) => intent.idempotencyKey),
      ).size,
    ).toBe(approvalRequiredIntents.length);
    const lenderThree = await addEligibleLender(f, "user_lender_three");
    expect(
      (
        await lenderThree.mutation(
          (api as any).lender_portal_phase5.decideLenderReviewRequest,
          {
            decision: "approved",
            expectedCycleNumber: 1,
            idempotencyKey: "phase6-deactivation-third",
            target,
          },
        )
      ).state,
    ).toBe("completed");

    const completedBeforeDeactivation = await f.admin.query(
      (api as any).lender_portal_phase5.getBackofficeReviewRequest,
      { historyPaginationOpts: PAGE, target, workosOrganizationId: ORG },
    );
    expect(
      completedBeforeDeactivation.currentCycle.decisions.map(
        (decision: any) => [
          decision.actorWorkosUserId,
          decision.countsTowardCurrentApproval,
        ],
      ),
    ).toEqual([
      ["user_lender", false],
      ["user_lender_two", true],
      ["user_lender_three", true],
    ]);

    await deactivateWorkosMembership(f, "user_lender_two");
    const terminal = await f.admin.query(
      (api as any).lender_portal_phase5.getBackofficeReviewRequest,
      { historyPaginationOpts: PAGE, target, workosOrganizationId: ORG },
    );
    expect(terminal.currentCycle.state).toBe("completed");
    expect(
      terminal.currentCycle.decisions.find(
        (decision: any) =>
          decision.actorWorkosUserId === "user_lender_two",
      )?.countsTowardCurrentApproval,
    ).toBe(true);
  });

  test("projects paginated multi-cycle terminal history from immutable contributors without live eligibility", async () => {
    const f = await fixture({ milestoneApprovalMode: "both" });
    const target = { kind: "milestone" as const, milestoneId: f.milestoneId };
    await submitMilestone(f, target, [], "phase6-history-cycle-one");
    await f.admin.mutation(
      (api as any).lender_portal_phase5.decideBackofficeReviewRequest,
      {
        decision: "rejected",
        expectedCycleNumber: 1,
        idempotencyKey: "phase6-history-reject",
        revisionInstructions: "Correct the immutable review package.",
        target,
        workosOrganizationId: ORG,
      },
    );
    await submitMilestone(
      f,
      target,
      [],
      "phase6-history-cycle-two",
      1,
    );
    await f.lender.mutation(
      (api as any).lender_portal_phase5.decideLenderReviewRequest,
      {
        decision: "approved",
        expectedCycleNumber: 2,
        idempotencyKey: "phase6-history-lender",
        target,
      },
    );
    await f.admin.mutation(
      (api as any).lender_portal_phase5.decideBackofficeReviewRequest,
      {
        decision: "approved",
        expectedCycleNumber: 2,
        idempotencyKey: "phase6-history-backoffice",
        target,
        workosOrganizationId: ORG,
      },
    );
    await deactivateWorkosMembership(f, "user_lender");
    const detail = await f.admin.query(
      (api as any).lender_portal_phase5.getBackofficeReviewRequest,
      {
        historyPaginationOpts: { cursor: null, numItems: 1 },
        target,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.cycles.page).toHaveLength(1);
    expect(detail.cycles.isDone).toBe(false);
    expect(detail.currentCycle.state).toBe("completed");
    expect(
      detail.currentCycle.decisions.map((decision: any) =>
        decision.countsTowardCurrentApproval,
      ),
    ).toEqual([true, true]);
  });

  test("lets both authorized groups complete the same canonical Site Visit and preserves unverified evidence", async () => {
    const lenderFixture = await fixture();
    const lenderVisitId = await seedSiteVisit(lenderFixture, {
      status: "requested",
    });
    const unverifiedPhotoId = await seedSiteVisitPhoto(
      lenderFixture,
      lenderVisitId,
      {
      locationFailureReason: "Location permission unavailable.",
      locationVerified: false,
      },
    );
    await lenderFixture.base.run(async (ctx: any) => {
      await ctx.db.insert("buildEvidenceAssets", {
        brokerageId: lenderFixture.brokerageId,
        buildId: lenderFixture.buildId,
        createdAt: lenderFixture.now,
        evidenceKey: "phase6-verified-non-photo",
        fileName: "site-note.txt",
        label: "Verified non-photo",
        locationVerified: true,
        milestoneKey: "foundation",
        mimeType: "text/plain",
        organizationId: ORG,
        proposalId: lenderFixture.proposalId,
        siteVisitId: lenderVisitId,
        sizeBytes: 10,
        source: "phase6-test",
        tag: "note",
        updatedAt: lenderFixture.now,
      });
      await ctx.db.insert("buildEvidenceAssets", {
        brokerageId: lenderFixture.brokerageId,
        buildId: lenderFixture.buildId,
        createdAt: lenderFixture.now,
        evidenceKey: "phase6-foreign-verified-photo",
        fileName: "foreign.jpg",
        label: "Foreign verified photo",
        locationVerified: true,
        milestoneKey: "foundation",
        mimeType: "image/jpeg",
        organizationId: "org_phase6_foreign",
        proposalId: lenderFixture.proposalId,
        siteVisitId: lenderVisitId,
        sizeBytes: 10,
        source: "phase6-test",
        tag: "photo",
        updatedAt: lenderFixture.now,
      });
    });
    const candidatePage = await lenderFixture.lender.query(
      (api as any).lender_portal_phase5
        .listLenderMilestoneSiteVisitCompletions,
      {
        milestoneId: lenderFixture.milestoneId,
        paginationOpts: PAGE,
      },
    );
    expect(candidatePage.page).toEqual([
      {
        canComplete: true,
        completionBlocker: null,
        locationUnverifiedPhotoCount: 1,
        photoCount: 1,
        requestedAt: "2026-08-15T13:00:00.000Z",
        siteVisitId: lenderVisitId,
        updatedAt: lenderFixture.now,
      },
    ]);
    const unassignedLender = await addUnassignedLender(
      lenderFixture,
      "user_site_visit_foreign_lender",
    );
    await expect(
      unassignedLender.query(
        (api as any).lender_portal_phase5
          .listLenderMilestoneSiteVisitCompletions,
        {
          milestoneId: lenderFixture.milestoneId,
          paginationOpts: PAGE,
        },
      ),
    ).rejects.toThrow("REVIEW_REQUEST_UNAVAILABLE");
    const lenderResult = await lenderFixture.lender.mutation(
      (api as any).lender_portal_phase5.completeLenderMilestoneSiteVisit,
      {
        expectedVisitUpdatedAt: lenderFixture.now,
        idempotencyKey: "phase6-lender-site-visit",
        milestoneId: lenderFixture.milestoneId,
        report: "Lender verified the completed foundation work.",
        visitId: lenderVisitId,
      },
    );
    expect(lenderResult).toMatchObject({ replayed: false, status: "complete" });
    const lenderReplay = await lenderFixture.lender.mutation(
      (api as any).lender_portal_phase5.completeLenderMilestoneSiteVisit,
      {
        expectedVisitUpdatedAt: lenderFixture.now,
        idempotencyKey: "phase6-lender-site-visit",
        milestoneId: lenderFixture.milestoneId,
        report: "Lender verified the completed foundation work.",
        visitId: lenderVisitId,
      },
    );
    expect(lenderReplay.replayed).toBe(true);

    const backofficeFixture = await fixture();
    const backofficeVisitId = await seedSiteVisit(backofficeFixture, {
      status: "requested",
    });
    await seedSiteVisitPhoto(backofficeFixture, backofficeVisitId);
    const backofficeResult = await backofficeFixture.admin.mutation(
      (api as any).lender_portal_phase5.completeBackofficeMilestoneSiteVisit,
      {
        expectedVisitUpdatedAt: backofficeFixture.now,
        idempotencyKey: "phase6-backoffice-site-visit",
        milestoneId: backofficeFixture.milestoneId,
        report: "Back Office verified the completed foundation work.",
        visitId: backofficeVisitId,
        workosOrganizationId: ORG,
      },
    );
    expect(backofficeResult).toMatchObject({
      replayed: false,
      status: "complete",
    });

    const persisted = await lenderFixture.base.run((ctx: any) =>
      ctx.db.get(lenderVisitId),
    );
    expect(persisted).toMatchObject({
      completedByGroup: "lender",
      recordNote: "Lender verified the completed foundation work.",
      status: "complete",
    });
    const photo = await lenderFixture.base.run((ctx: any) =>
      ctx.db.get(unverifiedPhotoId),
    );
    expect(photo).toMatchObject({
      locationFailureReason: "Location permission unavailable.",
      locationVerified: false,
    });
    const audit = await lenderFixture.base.run(async (ctx: any) =>
      (
        await ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (query: any) =>
            query
              .eq("entityType", "buildSiteVisit")
              .eq("entityId", String(lenderVisitId)),
          )
          .unique()
      ),
    );
    expect(audit.warnings).toEqual([
      `site_visit_location_unverified:${String(unverifiedPhotoId)}`,
    ]);
    expect(audit.reason).toBe(
      "Lender verified the completed foundation work.",
    );
    expect(JSON.parse(audit.newState)).toMatchObject({
      aclChanges: {
        completedByGroup: "lender",
        completedByRole: "lender-admin",
        completedByWorkosUserId: "user_lender",
      },
      currentCycleId: null,
      currentCycleNumber: 0,
      policy: expect.objectContaining({
        approvalMode: "both",
        siteVisitRequired: false,
      }),
      qualifyingEvidenceReferences: [
        {
          evidenceAssetId: unverifiedPhotoId,
          locationFailureReason: "Location permission unavailable.",
          locationVerified: false,
          siteVisitId: lenderVisitId,
        },
      ],
      report: "Lender verified the completed foundation work.",
      status: "complete",
    });
    const completedPage = await lenderFixture.lender.query(
      (api as any).lender_portal_phase5
        .listLenderMilestoneSiteVisitCompletions,
      {
        milestoneId: lenderFixture.milestoneId,
        paginationOpts: PAGE,
      },
    );
    expect(completedPage.page).toEqual([]);
  });

  test("keeps Site Visit completion read-only without the canonical lender permission", async () => {
    const f = await fixture();
    const visitId = await seedSiteVisit(f, { status: "requested" });
    await seedSiteVisitPhoto(f, visitId);
    await f.base.run(async (ctx: any) => {
      await ctx.db.patch(f.lenderOrganizationId, {
        permissions: {
          drawDecisions: true,
          milestoneDecisions: true,
          proposalReview: true,
          siteVisitReview: false,
        },
      });
    });

    const page = await f.lender.query(
      (api as any).lender_portal_phase5
        .listLenderMilestoneSiteVisitCompletions,
      { milestoneId: f.milestoneId, paginationOpts: PAGE },
    );
    expect(page.page).toEqual([
      expect.objectContaining({
        canComplete: false,
        completionBlocker: "permission_required",
        siteVisitId: visitId,
      }),
    ]);
    await expect(
      f.lender.mutation(
        (api as any).lender_portal_phase5.completeLenderMilestoneSiteVisit,
        {
          expectedVisitUpdatedAt: f.now,
          idempotencyKey: "phase6-permission-denied-site-visit",
          milestoneId: f.milestoneId,
          report: "This must not be recorded.",
          visitId,
        },
      ),
    ).rejects.toThrow("Forbidden");
  });

  test("canonical Site Visit recording enforces the shared report-photo guard and qualifying warning scope", async () => {
    const f = await fixture();
    const visitId = await seedSiteVisit(f, { status: "requested" });
    const visit = (await f.base.run((ctx: any) =>
      ctx.db.get(visitId),
    )) as any;
    await expect(
      f.admin.mutation(
        (api as any).production_proposals.recordActiveBuildSiteVisit,
        {
          buildId: f.buildId,
          milestoneKey: "foundation",
          note: "Canonical Site Visit report.",
          status: "complete",
          visitId: visit.visitId,
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("SITE_VISIT_PHOTO_REQUIRED");
    const costDocumentId = await seedCostDocument(f, 1_000_001);
    const submitted = await submitMilestone(
      f,
      { kind: "milestone", milestoneId: f.milestoneId },
      [costDocumentId],
      "canonical-site-visit-cycle-context",
    );
    const photoId = await seedSiteVisitPhoto(f, visitId, {
      locationFailureReason: "Geofence signal unavailable.",
      locationVerified: false,
    });
    await f.admin.mutation(
      (api as any).production_proposals.recordActiveBuildSiteVisit,
      {
        buildId: f.buildId,
        milestoneKey: "foundation",
        note: "Canonical Site Visit report.",
        status: "complete",
        visitId: visit.visitId,
        workosOrganizationId: ORG,
      },
    );
    const audit = await f.base.run(async (ctx: any) =>
      (
        await ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (query: any) =>
            query
              .eq("entityType", "buildSiteVisit")
              .eq("entityId", String(visitId)),
          )
          .unique()
      ),
    );
    expect(audit.warnings).toEqual([
      `site_visit_location_unverified:${String(photoId)}`,
    ]);
    expect(JSON.parse(audit.newState)).toMatchObject({
      aclChanges: {
        completedByGroup: "backoffice",
        completedByRole: "admin",
      },
      currentCycleId: submitted.cycleId,
      currentCycleNumber: 1,
      policy: expect.objectContaining({ approvalMode: "both" }),
      qualifyingEvidenceReferences: [
        expect.objectContaining({ evidenceAssetId: photoId }),
      ],
    });
  });

  test("direct commands cannot bypass canonical submission, locked groups, correction, or cycle reset", async () => {
    const f = await fixture({ milestoneApprovalMode: "backoffice_only" });
    const target = { kind: "milestone" as const, milestoneId: f.milestoneId };

    await expect(
      f.admin.mutation(
        (api as any).lender_portal_phase5.decideBackofficeReviewRequest,
        {
          decision: "approved",
          expectedCycleNumber: 1,
          idempotencyKey: "phase6-bypass-no-cycle",
          target,
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("REVIEW_REQUEST_UNAVAILABLE");
    await f.base.run((ctx: any) =>
      ctx.db.patch(f.milestoneId, { completionClaim: undefined }),
    );
    await expect(
      f.builder.mutation(
        (api as any).lender_portal_phase5.submitBuilderReviewRequest,
        {
          expectedCycleNumber: 0,
          idempotencyKey: "phase6-bypass-no-completion",
          target,
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("MILESTONE_COMPLETION_REQUIRED");
    await f.base.run((ctx: any) =>
      ctx.db.patch(f.milestoneId, {
        completionClaim: {
          actualCostCents: 1_000_001,
          completedDay: 18,
          submittedAt: "2026-08-15T12:00:00.000Z",
        },
      }),
    );
    await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      {
        expectedCycleNumber: 0,
        idempotencyKey: "phase6-bypass-valid-cycle",
        target,
        workosOrganizationId: ORG,
      },
    );
    await expect(
      f.lender.mutation(
        (api as any).lender_portal_phase5.decideLenderReviewRequest,
        {
          decision: "approved",
          expectedCycleNumber: 1,
          idempotencyKey: "phase6-bypass-wrong-group",
          target,
        },
      ),
    ).rejects.toThrow("REVIEW_GROUP_NOT_REQUIRED");
    await f.admin.mutation(
      (api as any).lender_portal_phase5.decideBackofficeReviewRequest,
      {
        decision: "rejected",
        expectedCycleNumber: 1,
        idempotencyKey: "phase6-bypass-reject",
        revisionInstructions: "Correct the current submission.",
        target,
        workosOrganizationId: ORG,
      },
    );
    await expect(
      f.admin.mutation(
        (api as any).lender_portal_phase5.decideBackofficeReviewRequest,
        {
          decision: "approved",
          expectedCycleNumber: 1,
          idempotencyKey: "phase6-bypass-post-reject",
          target,
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("REVIEW_REQUEST_NOT_DECIDABLE");
    const second = await f.builder.mutation(
      (api as any).lender_portal_phase5.submitBuilderReviewRequest,
      {
        expectedCycleNumber: 1,
        idempotencyKey: "phase6-bypass-cycle-two",
        target,
        workosOrganizationId: ORG,
      },
    );
    expect(second).toMatchObject({ cycleNumber: 2, state: "in_review" });
    await f.base.run(async (ctx: any) => {
      const build = await ctx.db.get(f.buildId);
      await ctx.db.patch(f.buildId, {
        reviewPolicySnapshot: {
          ...build.reviewPolicySnapshot,
          milestoneApprovalMode: "both",
        },
      });
    });
    await expect(
      f.admin.mutation(
        (api as any).production_proposals.approveActiveBuildMilestone,
        {
          buildId: f.buildId,
          expectedReviewCycleNumber: 2,
          milestoneKey: "foundation",
          note: "A direct approval cannot bypass the locked policy.",
          reviewIdempotencyKey: "phase6-bypass-policy-tamper",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("LOCKED_REVIEW_POLICY_REQUIRED");
    const detail = await f.admin.query(
      (api as any).lender_portal_phase5.getBackofficeReviewRequest,
      { historyPaginationOpts: PAGE, target, workosOrganizationId: ORG },
    );
    expect(detail.currentCycle.decisions).toEqual([]);
  });
});

type PolicyOverrides = Partial<{
  drawApprovalMode: "backoffice_only" | "lender_quorum" | "both";
  drawLenderQuorum: number;
  milestoneApprovalMode: "backoffice_only" | "lender_quorum" | "both";
  milestoneLenderQuorum: number;
  milestoneReceiptInvoiceRequired: boolean;
  milestoneSiteVisitRequired: boolean;
}>;

function identity(base: any, roles: string[], subject: string, organizationId: string) {
  return base.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  });
}

async function fixture(policy: PolicyOverrides = {}) {
  const base = convexTest(schema, modules);
  const ids = await base.run(async (ctx: any) => {
    const now = Date.now();
    const brokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName: "Phase 6 Brokerage",
      legalName: "Phase 6 Brokerage Inc.",
      status: "active",
      updatedAt: now,
      workosOrganizationId: ORG,
    });
    const builderProfileId = await ctx.db.insert("builderProfiles", {
      brokerageId,
      createdAt: now,
      displayName: "Phase 6 Builder",
      organizationId: ORG,
      status: "active",
      updatedAt: now,
    });
    await ctx.db.insert("builderAccountLinks", {
      brokerageId,
      builderProfileId,
      createdAt: now,
      role: "owner",
      status: "active",
      updatedAt: now,
      workosUserId: "user_builder",
    });
    const proposalId = await ctx.db.insert("buildProposals", {
      borrowerCoPayBps: 2_000,
      borrowerWorkingCapitalLimitCents: 10_000_000,
      brokerageId,
      buildName: "Phase 6 policy build",
      builderProfileId,
      createdAt: now,
      createdByWorkosUserId: "user_admin",
      lenderDrawPolicyLimitCents: 20_000_000,
      location: "16 Policy Road",
      organizationId: ORG,
      reviewOutcome: "approved",
      status: "closed",
      totalBudgetCents: 10_000_000,
      updatedAt: now,
      updatedByWorkosUserId: "user_admin",
    });
    const ruleId = await ctx.db.insert("workflowRules", {
      allowPermitWaiverByRoles: ["admin"],
      brokerageId,
      createdAt: now,
      organizationId: ORG,
      proposalStates: ["draft", "submitted", "approved", "closed"],
      requirePermitForApproval: true,
      ruleKey: "phase6-review",
      settings: {},
      status: "active",
      updatedAt: now,
      version: 1,
    });
    const snapshotId = await ctx.db.insert("workflowRuleSnapshots", {
      allowPermitWaiverByRoles: ["admin"],
      brokerageId,
      createdAt: now,
      organizationId: ORG,
      proposalId,
      proposalStates: ["draft", "submitted", "approved", "closed"],
      requirePermitForApproval: true,
      ruleKey: "phase6-review",
      settings: {},
      version: 1,
      workflowRuleId: ruleId,
    });
    const reviewPolicy = {
      drawApprovalMode: policy.drawApprovalMode ?? "both",
      drawLenderQuorum: policy.drawLenderQuorum ?? 1,
      milestoneApprovalMode: policy.milestoneApprovalMode ?? "both",
      milestoneLenderQuorum: policy.milestoneLenderQuorum ?? 1,
      milestoneReceiptInvoiceRequired:
        policy.milestoneReceiptInvoiceRequired ?? false,
      milestoneSiteVisitRequired: policy.milestoneSiteVisitRequired ?? false,
    };
    const policyVersionId = await ctx.db.insert(
      "proposalReviewPolicyVersions",
      {
        brokerageId,
        configuredAt: now,
        configuredByRole: "admin",
        configuredByWorkosUserId: "user_admin",
        idempotencyKey: "phase6-policy-v1",
        organizationId: ORG,
        policy: reviewPolicy,
        proposalId,
        reason: "Phase 6 locked policy fixture.",
        version: 1,
      },
    );
    const proposalRevisionId = await ctx.db.insert("proposalRevisions", {
      backOfficeApprovedByWorkosUserId: "user_admin",
      brokerageId,
      changedCheckpoints: ["accessReviewPolicy"],
      checkpoints: {
        accessReviewPolicy: reviewPolicy,
        budget: { totalBudgetCents: 10_000_000 },
        builder: {
          builderProfileId,
          displayName: "Phase 6 Builder",
        },
        milestoneCount: { count: 1 },
        scheduleTimeline: {
          milestonesFingerprint: "phase6",
          proposedStartDate: "2026-08-01",
          timelineRangeMax: 20,
          timelineRangeMin: 0,
        },
      },
      createdAt: now,
      createdByRole: "admin",
      createdByWorkosUserId: "user_admin",
      idempotencyKey: "phase6-revision-v1",
      organizationId: ORG,
      proposalId,
      reason: "Phase 6 locked revision fixture.",
      reviewPolicyVersionId: policyVersionId,
      revisionNumber: 1,
    });
    const reviewPolicyLockId = await ctx.db.insert(
      "proposalReviewPolicyLocks",
      {
        activeLenderMemberCount: 2,
        brokerageId,
        idempotencyKey: "phase6-policy-lock",
        lockedAt: now,
        lockedByRole: "admin",
        lockedByWorkosUserId: "user_admin",
        organizationId: ORG,
        policy: reviewPolicy,
        policyVersionId,
        proposalId,
        proposalRevisionId,
        proposalRevisionNumber: 1,
        reason: "Phase 6 policy lock fixture.",
      },
    );
    const buildId = await ctx.db.insert("activeBuilds", {
      brokerageId,
      builderProfileId,
      buildName: "Phase 6 policy build",
      createdAt: now,
      location: "16 Policy Road",
      organizationId: ORG,
      proposalId,
      reviewPolicyLockId,
      reviewPolicySnapshot: reviewPolicy,
      startDate: "2026-08-01",
      status: "active",
      totalBudgetCents: 10_000_000,
      updatedAt: now,
      workflowRuleSnapshotId: snapshotId,
    });
    const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
      brokerageId,
      budgetCents: 10_000_000,
      createdAt: now,
      dayEnd: 20,
      dayStart: 0,
      dependencyKeys: [],
      drawAvailabilityCents: 8_000_000,
      durationDays: 20,
      key: "foundation",
      name: "Foundation",
      order: 1,
      organizationId: ORG,
      proposalId,
      updatedAt: now,
    });
    const milestoneId = await ctx.db.insert("buildMilestones", {
      brokerageId,
      budgetCents: 10_000_000,
      buildId,
      completionClaim: {
        actualCostCents: 1_000_001,
        completedDay: 18,
        note: "Ready.",
        submittedAt: "2026-08-15T12:00:00.000Z",
      },
      createdAt: now,
      dayEnd: 20,
      dayStart: 0,
      dependencyKeys: [],
      drawAvailabilityCents: 8_000_000,
      durationDays: 20,
      key: "foundation",
      name: "Foundation",
      order: 1,
      organizationId: ORG,
      progressPercent: 100,
      proposalMilestoneId,
      status: "in_progress",
      updatedAt: now,
    });
    const proposalSubmilestoneId = await ctx.db.insert(
      "proposalSubmilestones",
      {
        brokerageId,
        createdAt: now,
        key: "foundation-work",
        milestoneKey: "foundation",
        name: "Foundation work",
        order: 1,
        organizationId: ORG,
        proposalId,
        proposalMilestoneId,
        updatedAt: now,
      },
    );
    const submilestoneId = await ctx.db.insert("buildSubmilestones", {
      brokerageId,
      buildId,
      buildMilestoneId: milestoneId,
      createdAt: now,
      key: "foundation-work",
      milestoneKey: "foundation",
      name: "Foundation work",
      order: 1,
      organizationId: ORG,
      proposalSubmilestoneId,
      status: "complete",
      updatedAt: now,
    });
    const drawRequestId = await ctx.db.insert("activeBuildDrawRequests", {
      amountCents: 2_500_000,
      brokerageId,
      buildId,
      clientOperationId: "phase6-draw",
      createdAt: now,
      displayId: "DR-0001",
      label: "Foundation reimbursement",
      organizationId: ORG,
      requestedAt: "2026-08-15T13:00:00.000Z",
      requestedByWorkosUserId: "user_builder",
      requestKey: "dr-0001-phase6",
      status: "requested",
      updatedAt: now,
    });
    await ctx.db.insert("activeBuildDrawRequestAllocations", {
      amountCents: 2_500_000,
      brokerageId,
      buildId,
      buildMilestoneId: milestoneId,
      createdAt: now,
      drawGroupKey: "foundation",
      drawRequestId,
      milestoneKey: "foundation",
      organizationId: ORG,
      sourceOrder: 1,
    });
    for (const [subject, role] of [
      ["user_builder", "builder"],
      ["user_admin", "admin"],
    ]) {
      await ctx.db.insert("users", {
        authId: subject,
        createdAt: now,
        email: `${subject}@example.com`,
        name: subject,
        sourceEventId: `phase6-user-${subject}`,
        sourceEventType: "test",
        status: "active",
        updatedAt: now,
        workosUserId: subject,
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        roleSlug: role,
        roleSlugs: [role],
        sourceEventId: `phase6-${subject}`,
        sourceEventType: "test",
        status: "active",
        updatedAt: now,
        workosMembershipId: `om-${subject}`,
        workosOrganizationId: ORG,
        workosUserId: subject,
      });
    }
    const lenderOrganizationId = await ctx.db.insert("lenderOrganizations", {
      brokerageId,
      createdAt: now,
      displayName: "Phase 6 Lender",
      legalName: "Phase 6 Lender Inc.",
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
      name: "Phase 6 Lender",
      sourceEventId: "phase6-lender",
      sourceEventType: "test",
      status: "active",
      updatedAt: now,
      workosUserId: "user_lender",
    });
    await ctx.db.insert("workosOrganizationMemberships", {
      createdAt: now,
      roleSlug: "lender-admin",
      roleSlugs: ["lender-admin"],
      sourceEventId: "phase6-lender-membership",
      sourceEventType: "test",
      status: "active",
      updatedAt: now,
      workosMembershipId: "om-user-lender",
      workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      workosUserId: "user_lender",
    });
    await ctx.db.insert("lenderOrganizationAssignments", {
      assignedAt: now,
      assignedByRole: "admin",
      assignedByWorkosUserId: "user_admin",
      brokerageId,
      lenderOrganizationId,
      normalizedEmail: "user_lender@example.com",
      reason: "Phase 6 assignment.",
      status: "active",
      updatedAt: now,
      workosUserId: "user_lender",
    });
    await ctx.db.insert("proposalLenderAssignments", {
      assignedAt: now,
      assignedByRole: "admin",
      assignedByWorkosUserId: "user_admin",
      brokerageId,
      createdAt: now,
      lenderBrokerageId: brokerageId,
      lenderOrganizationId,
      lenderOrganizationName: "Phase 6 Lender",
      organizationId: ORG,
      proposalId,
      status: "current",
    });
    return {
      brokerageId,
      buildId,
      drawRequestId,
      lenderOrganizationId,
      milestoneId,
      now,
      proposalId,
      proposalMilestoneId,
      submilestoneId,
    };
  });
  return {
    ...ids,
    admin: identity(base, ["admin"], "user_admin", ORG),
    base,
    builder: identity(base, ["builder"], "user_builder", ORG),
    lender: identity(
      base,
      ["lender-admin"],
      "user_lender",
      FAIRLEND_WORKOS_ORGANIZATION_ID,
    ),
  };
}

async function submitMilestone(
  f: Awaited<ReturnType<typeof fixture>>,
  target: { kind: "milestone"; milestoneId: any },
  costDocumentIds: any[],
  idempotencyKey: string,
  expectedCycleNumber = 0,
) {
  return await f.builder.mutation(
    (api as any).lender_portal_phase5.submitBuilderReviewRequest,
    {
      costDocumentIds,
      expectedCycleNumber,
      idempotencyKey,
      target,
      workosOrganizationId: ORG,
    },
  );
}

async function seedCostDocument(
  f: Awaited<ReturnType<typeof fixture>>,
  amountCents: number,
  options: { voided?: boolean } = {},
) {
  return await f.base.run(async (ctx: any) => {
    const now = Date.now();
    const costDocumentId = await ctx.db.insert("costDocuments", {
      brokerageId: f.brokerageId,
      buildId: f.buildId,
      category: "materials",
      createdAt: now,
      currency: "CAD",
      documentDate: "2026-08-15",
      grossTotalCents: amountCents,
      kind: "invoice",
      organizationId: ORG,
      state: "submitted",
      submittedAt: now,
      title: "Foundation invoice",
      uploaderEmailSnapshot: "user_builder@example.com",
      uploaderWorkosUserId: "user_builder",
      vendorName: "Foundation Supplier",
      ...(options.voided
        ? {
            voidReason: "Duplicate invoice.",
            voidedAt: now + 1,
            voidedByWorkosUserId: "user_admin",
          }
        : {}),
    });
    const pageBytes = `phase6-cost-page-${String(costDocumentId)}`;
    const storageId = await ctx.storage.store(
      new Blob([pageBytes], { type: "application/pdf" }),
    );
    const assetId = await ctx.db.insert("buildCollaborationAssets", {
      brokerageId: f.brokerageId,
      buildId: f.buildId,
      contentHashSha256: `hash-${String(costDocumentId)}`,
      createdAt: now,
      fileName: "foundation-invoice.pdf",
      maximumAudienceMode: "build_wide",
      mimeType: "application/pdf",
      organizationId: ORG,
      scanCompletedAt: now,
      scanState: "clean",
      sizeBytes: pageBytes.length,
      state: "available",
      storageId,
      updatedAt: now,
      uploadedByWorkosUserId: "user_builder",
      version: 1,
    });
    await ctx.db.insert("costDocumentPages", {
      assetId,
      brokerageId: f.brokerageId,
      buildId: f.buildId,
      contentHashSha256Snapshot: `hash-${String(costDocumentId)}`,
      costDocumentId,
      createdAt: now,
      fileNameSnapshot: "foundation-invoice.pdf",
      mimeTypeSnapshot: "application/pdf",
      order: 1,
      organizationId: ORG,
    });
    await ctx.db.insert("costDocumentAllocations", {
      amountCents,
      brokerageId: f.brokerageId,
      buildId: f.buildId,
      buildSubmilestoneId: f.submilestoneId,
      costDocumentId,
      createdAt: now,
      order: 1,
      organizationId: ORG,
      submilestoneKeySnapshot: "foundation-work",
      submilestoneNameSnapshot: "Foundation work",
    });
    return costDocumentId;
  });
}

async function seedSiteVisit(
  f: Awaited<ReturnType<typeof fixture>>,
  options: { recordNote?: string; status: "requested" | "complete" },
) {
  return await f.base.run((ctx: any) =>
    ctx.db.insert("buildSiteVisits", {
      brokerageId: f.brokerageId,
      buildId: f.buildId,
      buildMilestoneId: f.milestoneId,
      ...(options.status === "complete"
        ? { completedAt: "2026-08-15T14:00:00.000Z" }
        : {}),
      createdAt: f.now,
      milestoneKey: "foundation",
      organizationId: ORG,
      ...(options.recordNote
        ? { recordNote: options.recordNote, recordNoteFormat: "plain_text" }
        : {}),
      requestedAt: "2026-08-15T13:00:00.000Z",
      requestedDay: 18,
      status: options.status,
      tokenExpiresAt: f.now + 86_400_000,
      updatedAt: f.now,
      url: "/site-visit/phase6",
      visitId: `phase6-visit-${crypto.randomUUID()}`,
    }),
  );
}

async function seedSiteVisitPhoto(
  f: Awaited<ReturnType<typeof fixture>>,
  siteVisitId: any,
  options: {
    locationFailureReason?: string;
    locationVerified?: boolean;
  } = {},
) {
  return await f.base.run(async (ctx: any) => {
    const storageId = await ctx.storage.store(
      new Blob(["phase6-site-visit-photo"], { type: "image/jpeg" }),
    );
    return await ctx.db.insert("buildEvidenceAssets", {
      brokerageId: f.brokerageId,
      buildId: f.buildId,
      createdAt: Date.now(),
      evidenceKey: `phase6-photo-${crypto.randomUUID()}`,
      fileName: "foundation.jpg",
      label: "Foundation Site Visit photo",
      ...(options.locationFailureReason
        ? { locationFailureReason: options.locationFailureReason }
        : {}),
      locationVerified: options.locationVerified ?? true,
      milestoneKey: "foundation",
      mimeType: "image/jpeg",
      organizationId: ORG,
      proposalId: f.proposalId,
      siteVisitId,
      sizeBytes: 2_048,
      source: "active_build_site_visit:phase6",
      storageId,
      tag: "Site visit evidence",
      updatedAt: Date.now(),
    });
  });
}

async function addEligibleLender(
  f: Awaited<ReturnType<typeof fixture>>,
  subject: string,
) {
  await f.base.run(async (ctx: any) => {
    const now = Date.now();
    await ctx.db.insert("users", {
      authId: subject,
      createdAt: now,
      email: `${subject}@example.com`,
      name: subject,
      sourceEventId: `phase6-user-${subject}`,
      sourceEventType: "test",
      status: "active",
      updatedAt: now,
      workosUserId: subject,
    });
    await ctx.db.insert("workosOrganizationMemberships", {
      createdAt: now,
      roleSlug: "lender-admin",
      roleSlugs: ["lender-admin"],
      sourceEventId: `phase6-membership-${subject}`,
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
      brokerageId: f.brokerageId,
      lenderOrganizationId: f.lenderOrganizationId,
      normalizedEmail: `${subject}@example.com`,
      reason: "Phase 6 quorum fixture.",
      status: "active",
      updatedAt: now,
      workosUserId: subject,
    });
  });
  return identity(
    f.base,
    ["lender-admin"],
    subject,
    FAIRLEND_WORKOS_ORGANIZATION_ID,
  );
}

async function addUnassignedLender(
  f: Awaited<ReturnType<typeof fixture>>,
  subject: string,
) {
  await f.base.run(async (ctx: any) => {
    const now = Date.now();
    await ctx.db.insert("users", {
      authId: subject,
      createdAt: now,
      email: `${subject}@example.com`,
      name: subject,
      sourceEventId: `phase6-user-${subject}`,
      sourceEventType: "test",
      status: "active",
      updatedAt: now,
      workosUserId: subject,
    });
    await ctx.db.insert("workosOrganizationMemberships", {
      createdAt: now,
      roleSlug: "lender-admin",
      roleSlugs: ["lender-admin"],
      sourceEventId: `phase6-membership-${subject}`,
      sourceEventType: "test",
      status: "active",
      updatedAt: now,
      workosMembershipId: `om-${subject}`,
      workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      workosUserId: subject,
    });
    const lenderOrganizationId = await ctx.db.insert("lenderOrganizations", {
      brokerageId: f.brokerageId,
      createdAt: now,
      displayName: "Unassigned Phase 6 Lender",
      legalName: "Unassigned Phase 6 Lender Inc.",
      permissions: {
        drawDecisions: true,
        milestoneDecisions: true,
        proposalReview: true,
        siteVisitReview: true,
      },
      status: "active",
      updatedAt: now,
    });
    await ctx.db.insert("lenderOrganizationAssignments", {
      assignedAt: now,
      assignedByRole: "admin",
      assignedByWorkosUserId: "user_admin",
      brokerageId: f.brokerageId,
      lenderOrganizationId,
      normalizedEmail: `${subject}@example.com`,
      reason: "Phase 6 unassigned ACL fixture.",
      status: "active",
      updatedAt: now,
      workosUserId: subject,
    });
  });
  return identity(
    f.base,
    ["lender-admin"],
    subject,
    FAIRLEND_WORKOS_ORGANIZATION_ID,
  );
}

async function deactivateWorkosMembership(
  f: Awaited<ReturnType<typeof fixture>>,
  subject: string,
) {
  await f.base.run(async (ctx: any) => {
    const now = Date.now();
    const memberships = await ctx.db
      .query("workosOrganizationMemberships")
      .withIndex("by_user_and_organization", (query: any) =>
        query
          .eq("workosUserId", subject)
          .eq("workosOrganizationId", FAIRLEND_WORKOS_ORGANIZATION_ID),
      )
      .collect();
    for (const membership of memberships) {
      await ctx.db.patch(membership._id, {
        sourceEventId: `phase6-membership-deactivated-${subject}`,
        status: "inactive",
        updatedAt: now,
      });
    }
  });
}

async function restoreSameWorkosMembership(
  f: Awaited<ReturnType<typeof fixture>>,
  subject: string,
) {
  await f.base.run(async (ctx: any) => {
    const now = Date.now();
    const memberships = await ctx.db
      .query("workosOrganizationMemberships")
      .withIndex("by_user_and_organization", (query: any) =>
        query
          .eq("workosUserId", subject)
          .eq("workosOrganizationId", FAIRLEND_WORKOS_ORGANIZATION_ID),
      )
      .collect();
    for (const membership of memberships) {
      await ctx.db.patch(membership._id, {
        sourceEventId: `phase6-membership-restored-${subject}`,
        status: "active",
        updatedAt: now + 1,
      });
    }
  });
}
