// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("./LenderMilestoneSiteVisitCompletion.tsx", () => ({
  LenderMilestoneSiteVisitCompletion: ({
    milestoneId,
  }: {
    milestoneId: string;
  }) => (
    <div data-testid="lender-site-visit-entry">Site Visit · {milestoneId}</div>
  ),
}));

vi.mock("./LenderBuildCollaboration.tsx", () => ({
  LenderBuildCollaboration: ({ buildId }: { buildId: string }) => (
    <div data-testid="lender-collaboration">Collaboration · {buildId}</div>
  ),
}));

import {
  LenderBuildDetailOverview,
  type LenderBuildDetailData,
  toMilestoneSheetData,
} from "./LenderBuildDetailOverview";

afterEach(cleanup);

function detailFixture(): LenderBuildDetailData {
  return {
    build: {
      buildId: "build_1",
      buildName: "Harbourline Residences",
      location: "Hamilton, ON",
      startDate: "2026-08-01",
      status: "active",
      timezone: "America/Toronto",
      totalBudgetCents: 30_000_000,
      updatedAt: 1,
    },
    builder: { displayName: "Northstar Builder" },
    reviewPolicy: {
      draw: {
        approvalMode: "both",
        lenderQuorum: 2,
      },
      milestone: {
        approvalMode: "lender_quorum",
        lenderQuorum: 1,
        receiptInvoiceRequired: true,
        siteVisitRequired: true,
      },
      state: "locked",
    },
    draws: [
      {
        actionItems: [],
        actionRequired: true,
        amountCents: 8_000_000,
        currentReviewCycleId: "draw_cycle_1",
        currentReviewCycleNumber: 1,
        displayId: "DRAW-01",
        drawRequestId: "draw_1",
        fundingPosition: {
          availableBeforeCents: 20_000_000,
          reconciled: true,
          remainingAfterCents: 12_000_000,
        },
        label: "Foundation reimbursement",
        lenderPortalReviewState: "awaiting_review",
        note: null,
        requestedAt: "2026-08-15T00:00:00.000Z",
        status: "in_review",
        updatedAt: 1,
        workOrderKey: "DRWO-001",
      },
    ],
    facility: {
      interestAnnualBps: 925,
      interestStartsOn: "funds_released",
      principalCents: 100_000_000,
    },
    funding: {
      approvedMilestoneCents: 20_000_000,
      availableCents: 12_000_000,
      facilityCents: 100_000_000,
      releasedCents: 5_000_000,
      reservedCents: 8_000_000,
      unlockedCents: 20_000_000,
    },
    milestones: [
      {
        actualCompletedAt: Date.UTC(2026, 7, 14),
        actualStartedAt: Date.UTC(2026, 7, 3),
        actionRequired: true,
        budgetCents: 20_000_000,
        buildMilestoneId: "milestone_1",
        contractors: [
          {
            contractorId: "contractor_1",
            name: "Concrete Co",
            role: "Concrete",
            status: "active",
          },
        ],
        dayEnd: 30,
        dayStart: 1,
        drawAvailabilityCents: 20_000_000,
        durationDays: 30,
        key: "foundation",
        name: "Foundation",
        order: 1,
        plannedEndDate: "2026-08-31",
        plannedStartDate: "2026-08-02",
        progressPercent: 100,
        receiptCoverage: {
          actualCostCents: 8_000_000,
          documentedCents: 8_000_000,
          documents: [
            {
              amountCents: 8_000_000,
              allocations: [
                {
                  amountCents: 8_000_000,
                  buildSubmilestoneId: "submilestone_1",
                },
              ],
              costDocumentId: "cost_document_1",
              kind: "invoice",
              label: "Concrete invoice",
              pages: [],
              subtotalCents: 7_000_000,
              taxCents: 1_000_000,
            },
          ],
          required: true,
          state: "covered",
        },
        reviewCycleId: "milestone_cycle_1",
        reviewCycleNumber: 1,
        reviewEvidence: [
          {
            downloadUrl: null,
            evidenceAssetId: "evidence_1",
            fileName: "foundation.jpg",
            label: "Foundation progress photo",
            locationVerified: true,
            mimeType: "image/jpeg",
            sizeBytes: 1024,
            siteVisitId: null,
            source: "evidence_package",
            submilestoneKey: "footings",
          },
          {
            downloadUrl: null,
            evidenceAssetId: "evidence_milestone",
            fileName: "milestone-wide.jpg",
            label: "Milestone-wide photo",
            locationVerified: true,
            mimeType: "image/jpeg",
            sizeBytes: 2048,
            siteVisitId: null,
            source: "evidence_package",
            submilestoneKey: null,
          },
        ],
        reviewState: "review_completed",
        siteVisit: {
          completedAt: "2026-08-16T13:00:00.000Z",
          photoCount: 1,
          report: "Footings match the submitted scope.",
          requestedAt: "2026-08-15T13:00:00.000Z",
          siteVisitId: "visit_1",
          submilestoneId: "submilestone_1",
        },
        siteVisits: [
          {
            completedAt: "2026-08-16T13:00:00.000Z",
            photoCount: 1,
            report: "Footings match the submitted scope.",
            requestedAt: "2026-08-15T13:00:00.000Z",
            requestedDay: 15,
            siteVisitId: "visit_1",
            submilestoneId: "submilestone_1",
            tokenExpiresAt: Date.UTC(2026, 7, 16, 14),
            tokenOpenedAt: Date.UTC(2026, 7, 16, 12),
            updatedAt: Date.UTC(2026, 7, 16, 13),
            visitId: "VISIT-01",
          },
        ],
        status: "in_progress",
        submilestones: [
          {
            actualCostCents: 8_000_000,
            actualStartedAt: Date.UTC(2026, 7, 3),
            assignments: [
              {
                contractorId: "contractor_1",
                name: "Concrete Co",
                role: "Concrete",
                status: "active",
              },
            ],
            budgetCents: 10_000_000,
            completedAt: Date.UTC(2026, 7, 14),
            description: "",
            durationDays: 5,
            key: "footings",
            name: "Footings",
            order: 1,
            progressPercent: 100,
            startDay: 2,
            status: "complete",
            submilestoneId: "submilestone_1",
          },
        ],
      },
    ],
    releasedCents: 5_000_000,
    reviewSummary: "2 lender review requests require attention.",
  } as unknown as LenderBuildDetailData;
}

describe("promoted Lender Build Detail Variant C", () => {
  test("keeps Milestone-level evidence out of every child projection", () => {
    const detail = detailFixture();
    const mapped = toMilestoneSheetData(detail, detail.milestones[0]);

    expect(mapped.submilestones[0]?.evidence.map((item) => item.label)).toEqual([
      "Foundation progress photo",
    ]);
  });

  test("renders canonical lender facts, expands child scope, and keeps the Milestone sheet read-only", () => {
    render(<LenderBuildDetailOverview detail={detailFixture()} />);

    expect(screen.getByTestId("production-lender-build-detail")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Harbourline Residences" })).toBeTruthy();
    expect(screen.getByText("Review policy")).toBeTruthy();
    expect(screen.getByText("Locked")).toBeTruthy();
    expect(screen.getByText("1 lender approval is required.")).toBeTruthy();
    expect(
      screen.getByText(
        "Back Office approval and 2 lender approvals are required."
      )
    ).toBeTruthy();
    expect(screen.getByTestId("lender-collaboration")).toBeTruthy();
    expect(screen.getByText("Available").parentElement?.textContent).toContain(
      "120,000"
    );
    expect(screen.getByText("Foundation progress photo")).toBeTruthy();
    expect(screen.queryByText("Open review")).toBeNull();
    expect(screen.queryByText("Action required")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Expand Foundation Sub-milestones",
      })
    );
    expect(screen.getByText("Footings")).toBeTruthy();
    expect(screen.getByText("$100,000")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Foundation" }));
    expect(screen.getByTestId("milestone-detail-sheet")).toBeTruthy();
    expect(screen.queryByText(/Linked draw/i)).toBeNull();
    expect(screen.getByText("Lender-visible review record")).toBeTruthy();
    expect(screen.getByTestId("lender-site-visit-entry").textContent).toBe(
      "Site Visit · milestone_1"
    );
    expect(screen.getByText("Concrete invoice")).toBeTruthy();
    expect(screen.getByText("This lender record is read-only.")).toBeTruthy();
    expect(screen.queryByText("Submit milestone completion")).toBeNull();
    expect(screen.queryByText("Approve")).toBeNull();
    expect(screen.queryByText("Request revision")).toBeNull();
  });

  test("shows a clear unavailable state without inventing a default policy", () => {
    const detail = detailFixture();
    detail.reviewPolicy = { state: "unavailable" };

    render(<LenderBuildDetailOverview detail={detail} />);

    expect(
      screen.getByText(
        "The locked review policy is unavailable for this Build."
      )
    ).toBeTruthy();
    expect(screen.queryByText("Locked")).toBeNull();
    expect(screen.queryByText(/Back Office approval/)).toBeNull();
  });
});
