import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

import {
  buildAdminReviewViewModel,
  deriveDecisionState,
  isReviewNoteRequired,
  runAdminReviewAction,
} from "./AdminBuildDashboardRoute";
import type {
  BuildWorkspaceAdapter,
  DrawGroup,
  EvidenceStatus,
  Milestone,
} from "./types";

const baseDate = new Date("2026-05-12T12:00:00.000Z");

function milestone(
  overrides: Partial<Milestone> & Pick<Milestone, "id" | "drawGroupId">
): Milestone {
  const base: Milestone = {
    actualCost: 0,
    blockedByKeys: [],
    blockingKeys: [],
    blockingReasons: [],
    code: overrides.id.toUpperCase(),
    completionReport: "",
    drawGroupId: overrides.drawGroupId,
    endAt: baseDate,
    estimatedCost: 100_000,
    estimatedDurationDays: 20,
    evidenceFiles: [],
    evidencePackages: [],
    evidenceStatus: "notStarted",
    id: overrides.id,
    isDragLocked: false,
    issues: [],
    lane: overrides.drawGroupId,
    name: overrides.id,
    notes: "",
    progress: 0,
    requiresSiteVisit: false,
    reviewReports: [],
    siteVisitRequested: false,
    siteVisits: [],
    staffRecommendation: "",
    startAt: baseDate,
    status: "notStarted",
    warningCount: 0,
  };

  return {
    ...base,
    ...overrides,
    code: overrides.code ?? overrides.id.toUpperCase(),
    drawGroupId: overrides.drawGroupId,
    id: overrides.id,
  };
}

function drawGroup(overrides: Partial<DrawGroup> & Pick<DrawGroup, "id">) {
  const base: DrawGroup = {
    amount: 100_000,
    eligibleAt: baseDate,
    endAt: baseDate,
    id: overrides.id,
    issues: [],
    label: overrides.id,
    order: 1,
    rowIndex: 0,
    rowSpan: 1,
    startAt: baseDate,
    status: "evidencePending" as const,
    totalExposure: 80_000,
    warningState: "clear" as const,
  };

  return {
    ...base,
    ...overrides,
    id: overrides.id,
  };
}

describe("admin build dashboard selectors", () => {
  test("groups milestones by draw group and resolves invalid selection to first milestone", () => {
    const first = milestone({ drawGroupId: "draw-1", id: "foundation" });
    const second = milestone({ drawGroupId: "draw-2", id: "framing" });

    const viewModel = buildAdminReviewViewModel({
      drawGroups: [drawGroup({ id: "draw-1" }), drawGroup({ id: "draw-2" })],
      milestones: [first, second],
      selectedMilestoneId: "missing",
    });

    expect(viewModel.selectedMilestone?.id).toBe("foundation");
    expect(viewModel.milestonesByDrawGroup.get("draw-2")).toEqual([second]);
  });

  test.each<EvidenceStatus>([
    "notStarted",
    "draft",
    "submitted",
    "accepted",
    "needsInfo",
    "locationUnverified",
  ])("derives evidence package and blocker state for %s evidence", (status) => {
    const selected = milestone({
      drawGroupId: "draw-1",
      evidenceFiles:
        status === "notStarted"
          ? []
          : [
              {
                fileName: "foundation.pdf",
                id: "file-1",
                isSample: false,
                mimeType: "application/pdf",
                sizeBytes: 1200,
                uploadedAt: baseDate.toISOString(),
                uploadedByPersona: "builder_lead",
              },
            ],
      evidenceStatus: status,
      id: "foundation",
    });

    const viewModel = buildAdminReviewViewModel({
      drawGroups: [drawGroup({ id: "draw-1" })],
      milestones: [selected],
      selectedMilestoneId: selected.id,
    });

    expect(viewModel.evidencePackages).toHaveLength(1);
    if (status === "accepted") {
      expect(viewModel.decisionState.blockers).toHaveLength(0);
    } else {
      expect(viewModel.decisionState.blockers.length).toBeGreaterThan(0);
    }
  });

  test("labels missing builder evidence without claiming a report is attached", () => {
    const selected = milestone({
      drawGroupId: "draw-1",
      evidenceFiles: [],
      evidencePackages: [
        {
          createdAt: baseDate.toISOString(),
          id: "package-1",
          reviewStatus: "pending",
          status: "notSubmitted",
        },
      ],
      evidenceStatus: "notStarted",
      id: "foundation",
    });

    const viewModel = buildAdminReviewViewModel({
      drawGroups: [drawGroup({ id: "draw-1" })],
      milestones: [selected],
      selectedMilestoneId: selected.id,
    });

    expect(viewModel.evidencePackages[0]).toMatchObject({
      canApprove: false,
      countLabel: "0",
      hasEvidence: false,
      note: "No builder report or supporting files have been submitted.",
      reportLabel: "No builder report",
    });
  });

  test("preserves historical site visits and review reports from workspace data", () => {
    const selected = milestone({
      drawGroupId: "draw-1",
      id: "foundation",
      reviewReports: [
        {
          createdAt: baseDate.toISOString(),
          id: "review-1",
          notes: "Accepted",
          outcome: "accepted",
          reviewerPersona: "lender_admin",
        },
      ],
      siteVisits: [
        {
          assignedPersona: "site_visitor",
          createdAt: baseDate.toISOString(),
          id: "visit-1",
          riskFlags: [],
          status: "completed",
        },
      ],
    });

    const viewModel = buildAdminReviewViewModel({
      drawGroups: [drawGroup({ id: "draw-1" })],
      milestones: [selected],
      selectedMilestoneId: selected.id,
    });

    expect(viewModel.siteVisitPackages.map((row) => row.id)).toEqual([
      "visit-1",
    ]);
    expect(viewModel.reviewReportHistory.map((row) => row.id)).toEqual([
      "review-1",
    ]);
  });

  test("allows site visit override only when accepted evidence has only site visit blockers", () => {
    const selected = milestone({
      drawGroupId: "draw-1",
      evidenceFiles: [
        {
          fileName: "foundation.pdf",
          id: "file-1",
          isSample: false,
          mimeType: "application/pdf",
          sizeBytes: 1200,
          uploadedAt: baseDate.toISOString(),
          uploadedByPersona: "builder_lead",
        },
      ],
      evidenceStatus: "accepted",
      id: "foundation",
      requiresSiteVisit: true,
      siteVisits: [
        {
          assignedPersona: "site_visitor",
          createdAt: baseDate.toISOString(),
          id: "visit-1",
          riskFlags: [],
          status: "requested",
        },
      ],
    });

    const decisionState = deriveDecisionState(
      selected,
      drawGroup({ id: "draw-1" })
    );

    expect(decisionState.approveMilestoneEnabled).toBe(false);
    expect(decisionState.canOverrideSiteVisit).toBe(true);
    expect(decisionState.blockers).toEqual(["Site visit required"]);
  });
});

describe("admin review actions", () => {
  test("requires notes only for rejection and override flows", () => {
    const hold = deriveDecisionState(
      milestone({
        drawGroupId: "draw-1",
        evidenceFiles: [
          {
            fileName: "foundation.pdf",
            id: "file-1",
            isSample: false,
            mimeType: "application/pdf",
            sizeBytes: 1200,
            uploadedAt: baseDate.toISOString(),
            uploadedByPersona: "builder_lead",
          },
        ],
        evidenceStatus: "accepted",
        id: "foundation",
        requiresSiteVisit: true,
        siteVisits: [
          {
            assignedPersona: "site_visitor",
            createdAt: baseDate.toISOString(),
            id: "visit-1",
            riskFlags: [],
            status: "requested",
          },
        ],
      }),
      drawGroup({ id: "draw-1" })
    );

    expect(isReviewNoteRequired("rejectMilestone", hold)).toBe(true);
    expect(isReviewNoteRequired("approveWithOverride", hold)).toBe(true);
    expect(isReviewNoteRequired("approveEvidence", hold)).toBe(false);
    expect(isReviewNoteRequired("assignSiteVisit", hold)).toBe(false);
    expect(isReviewNoteRequired("requestMoreInformation", hold)).toBe(false);
  });

  test("calls existing adapter methods without optional note blocking", async () => {
    const workspace = {
      approveMilestone: vi.fn(),
      rejectMilestone: vi.fn(),
      requestMoreInformation: vi.fn(),
      requestSiteVisit: vi.fn(),
      reviewEvidence: vi.fn(),
    } satisfies Pick<
      BuildWorkspaceAdapter,
      | "approveMilestone"
      | "rejectMilestone"
      | "requestMoreInformation"
      | "requestSiteVisit"
      | "reviewEvidence"
    >;
    const decisionState = deriveDecisionState(
      milestone({ drawGroupId: "draw-1", id: "foundation" }),
      drawGroup({ id: "draw-1" })
    );

    await runAdminReviewAction({
      action: "approveEvidence",
      decisionState,
      milestoneId: "foundation",
      note: "",
      workspace,
    });

    expect(workspace.reviewEvidence).toHaveBeenCalledWith(
      "foundation",
      true,
      ""
    );
  });

  test("blocks rejection when note is blank", async () => {
    const workspace = {
      approveMilestone: vi.fn(),
      rejectMilestone: vi.fn(),
      requestMoreInformation: vi.fn(),
      requestSiteVisit: vi.fn(),
      reviewEvidence: vi.fn(),
    } satisfies Pick<
      BuildWorkspaceAdapter,
      | "approveMilestone"
      | "rejectMilestone"
      | "requestMoreInformation"
      | "requestSiteVisit"
      | "reviewEvidence"
    >;

    await expect(
      runAdminReviewAction({
        action: "rejectMilestone",
        decisionState: deriveDecisionState(undefined, undefined),
        milestoneId: "foundation",
        note: "",
        workspace,
      })
    ).rejects.toThrow("Review note is required");
    expect(workspace.rejectMilestone).not.toHaveBeenCalled();
  });

  test("does not define screenshot fixture arrays in the admin component", () => {
    const source = readFileSync(
      new URL("./AdminBuildDashboardRoute.tsx", import.meta.url),
      "utf8"
    );

    expect(source).not.toMatch(
      /const\s+(drawGroups|milestones|siteVisits|reviewReports)\s*=\s*\[/
    );
    expect(source).not.toContain("May 19, 2025");
    expect(source).not.toContain("Lien waiver missing");
  });
});
