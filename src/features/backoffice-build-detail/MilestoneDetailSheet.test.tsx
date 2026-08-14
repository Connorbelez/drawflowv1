// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  MilestoneDetailSheet,
  type MilestoneSheetData,
} from "./MilestoneDetailSheet";
import type { BrokerageSiteVisitsResult } from "../backoffice-site-visits/site-visit-types.ts";

afterEach(cleanup);

const sheetData: MilestoneSheetData = {
  column: "In progress",
  contractors: [],
  currentDay: 14,
  drawGroupKey: "draw-02",
  milestoneKey: "foundation",
  name: "Foundation",
  plannedBudgetCents: 60_000_000,
  plannedEndDate: "2026-08-21",
  plannedStartDate: "2026-08-04",
  recentEvents: [],
  submilestones: [
    {
      actualCostCents: 5_500_000,
      actualStartedAt: Date.parse("2026-08-05T12:00:00Z"),
      assignments: [],
      budgetCents: 20_000_000,
      costDocuments: [
        {
          _id: "cost-document-forms",
          allocationAmountCents: 5_000_000,
          kind: "invoice",
          pages: [
            {
              assetId: "cost-document-page-forms",
              fileName: "footing-invoice.pdf",
              mimeType: "application/pdf",
            },
          ],
          title: "Footing formwork invoice",
        },
      ],
      description: "Set and verify footing forms against the approved plan.",
      endDate: "2026-08-08",
      evidence: [
        {
          evidenceKey: "builder-evidence-forms",
          fileName: "forms-complete.jpg",
          label: "Completed footing forms",
          locationVerified: true,
          mimeType: "image/jpeg",
          previewUrl: "https://example.com/forms-complete.jpg",
          sizeBytes: 1200,
          source: "builder",
          tag: "completion",
        },
      ],
      fieldNote: "Confirm dimensions before the concrete pour.",
      key: "forms",
      submilestoneId: "submilestone-forms",
      materials: [
        {
          id: "material-forms",
          quantity: 24,
          title: "Formwork panels",
          totalCents: 320_000,
          type: "material",
        },
      ],
      name: "Footing forms",
      order: 1,
      siteVisits: [
        {
          completedAt: "2026-08-08T15:00:00Z",
          requestedAt: "2026-08-07T12:00:00Z",
          status: "complete",
          visitId: "visit-forms",
        },
      ],
      startDate: "2026-08-04",
      scheduleHealth: { health: "on_track", overdueDays: 0 },
      status: "planned",
      workflowRevision: 7,
    },
    {
      assignments: [],
      budgetCents: 40_000_000,
      completedAt: Date.parse("2026-08-11T12:00:00Z"),
      description: "Place and cure the approved foundation concrete.",
      endDate: "2026-08-21",
      evidence: [],
      key: "pour",
      submilestoneId: "submilestone-pour",
      materials: [],
      name: "Concrete pour",
      order: 2,
      siteVisits: [],
      startDate: "2026-08-09",
      status: "complete",
      workflowRevision: 11,
    },
    {
      assignments: [],
      budgetCents: 10_000_000,
      description: "Complete the drainage and electrical rough-in scope.",
      endDate: "2026-08-03",
      evidence: [],
      key: "dc-ed",
      materials: [],
      name: "DC/ED",
      order: 3,
      scheduleHealth: { health: "behind_schedule", overdueDays: 4 },
      siteVisits: [],
      startDate: "2026-07-30",
      status: "in_progress",
      submilestoneId: "submilestone-dc-ed",
      workflowRevision: 12,
    },
  ],
};

const milestoneSiteVisits = {
  builds: [],
  summary: {
    cancelled: 0,
    complete: 1,
    expired: 0,
    expiringWithin15Min: 0,
    geofenceFlagged: 0,
    inField: 0,
    open: 1,
    total: 2,
  },
  visits: [
    {
      buildDisplayId: "B-001",
      buildHref: "/backoffice/builds/build-01",
      buildId: "build-01",
      buildName: "Four-plex",
      builderName: "Northline Homes",
      completedAt: "2026-08-08T15:00:00Z",
      geofenceFlagged: false,
      location: "Toronto, ON",
      milestoneKey: "foundation",
      milestoneName: "Foundation",
      operationalStatus: "complete",
      recordNote: "Footing forms match the approved dimensions.",
      recordNoteFormat: "plain_text",
      requestedAt: "2026-08-07T12:00:00Z",
      requestedDay: 3,
      scheduledDateLabel: "Aug 7, 2026",
      tokenExpiresAt: Date.parse("2026-08-08T12:00:00Z"),
      tokenMsRemaining: 0,
      tokenState: "consumed",
      updatedAt: Date.parse("2026-08-08T15:00:00Z"),
      url: "/site-visits/visit-forms",
      visitId: "visit-forms",
    },
    {
      buildDisplayId: "B-001",
      buildHref: "/backoffice/builds/build-01",
      buildId: "build-01",
      buildName: "Four-plex",
      builderName: "Northline Homes",
      geofenceFlagged: false,
      location: "Toronto, ON",
      milestoneKey: "foundation",
      milestoneName: "Foundation",
      operationalStatus: "open",
      requestedAt: "2026-08-12T12:00:00Z",
      requestedDay: 8,
      scheduledDateLabel: "Aug 12, 2026",
      tokenExpiresAt: Date.parse("2026-08-13T12:00:00Z"),
      tokenMsRemaining: 60_000,
      tokenState: "live",
      updatedAt: Date.parse("2026-08-12T12:00:00Z"),
      url: "/site-visits/visit-whole-milestone",
      visitId: "visit-whole-milestone",
    },
  ],
} as unknown as BrokerageSiteVisitsResult;

function renderSheet(
  props: Partial<ComponentProps<typeof MilestoneDetailSheet>> = {},
) {
  return render(
    <MilestoneDetailSheet data={sheetData} onClose={vi.fn()} {...props} />,
  );
}

describe("MilestoneDetailSheet", () => {
  test("renders the canonical parent aggregate with the accepted shared tabs", () => {
    renderSheet();

    expect(screen.getByText("Milestone execution")).toBeTruthy();
    expect(screen.getByText("Sub-milestone scope")).toBeTruthy();
    expect(screen.getByText("Footing forms")).toBeTruthy();
    expect(screen.getByText("Concrete pour")).toBeTruthy();
    expect(screen.queryByText("Submilestone detail")).toBeNull();
    expect(screen.queryByText("Guided completion")).toBeNull();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Overview",
      "Evidence",
      "Receipts / invoices",
      "Collaboration",
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: "Footing forms actions" }),
    );
    expect(
      screen
        .getByRole("menuitem", { name: "Open full detail" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });

  test("aggregates evidence and cost documents across canonical children", () => {
    const onOpenCanonicalTarget = vi.fn();
    const onOpenCostDocument = vi.fn();
    renderSheet({ onOpenCanonicalTarget, onOpenCostDocument });

    fireEvent.click(screen.getByRole("tab", { name: "Evidence" }));
    expect(screen.getByText("Builder evidence")).toBeTruthy();
    expect(screen.getByText("Completed footing forms")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Footing forms" }));
    expect(onOpenCanonicalTarget).toHaveBeenCalledWith(
      { kind: "submilestone", submilestoneId: "submilestone-forms" },
      { selectedTab: "evidence" },
    );

    fireEvent.click(screen.getByRole("tab", { name: "Receipts / invoices" }));
    fireEvent.click(screen.getByRole("button", { name: "footing-invoice.pdf" }));
    expect(onOpenCostDocument).toHaveBeenCalledWith("cost-document-forms");
  });

  test("shows review gates and only exposes governed reviewer menu actions when supplied", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const firstChild = sheetData.submilestones?.[0];
    if (!firstChild) {
      throw new Error("Expected a child fixture.");
    }
    renderSheet({
      data: {
        ...sheetData,
        submilestones: [
          {
            ...firstChild,
            review: {
              backOfficeApproved: false,
              backOfficeRequired: true,
              lenderApprovals: 1,
              lenderQuorumRequired: true,
              lenderQuorumSize: 2,
              state: "pending_review",
            },
          },
        ],
      },
      onOpenCanonicalTarget: vi.fn(),
      submilestoneReviewActions: { onApprove, onReject },
    });

    expect(screen.getByText("Pending Review")).toBeTruthy();
    expect(screen.getByText("Back Office · Pending")).toBeTruthy();
    expect(screen.getByText("Lender quorum · 1/2")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Footing forms actions" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Approve Sub-milestone" }),
    );
    expect(onApprove).toHaveBeenCalledWith("forms");

    fireEvent.click(
      screen.getByRole("button", { name: "Footing forms actions" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: /Reject Sub-milestone/ }),
    );
    expect(onReject).toHaveBeenCalledWith("forms");
  });

  test("retains In progress while showing accessible active overdue health", () => {
    const row = () => screen.getByTestId("milestone-scope-row-dc-ed");
    renderSheet();

    expect(within(row()).getByText("In progress")).toBeTruthy();
    expect(
      within(row()).getByText("Behind schedule · 4 days overdue"),
    ).toBeTruthy();
    expect(
      within(row()).getByLabelText(
        "In progress, behind schedule, 4 days overdue; planned end 2026-08-03",
      ),
    ).toBeTruthy();
  });

  test("shows operational facts and expands the canonical supporting detail", () => {
    const onOpenCostDocument = vi.fn();
    renderSheet({ onOpenCostDocument });

    const row = screen.getByTestId("milestone-scope-row-forms");
    expect(within(row).getByText("Planned start")).toBeTruthy();
    expect(within(row).getByText("Planned end")).toBeTruthy();
    expect(within(row).getByText("Actual start")).toBeTruthy();
    expect(within(row).getByText("Actual end")).toBeTruthy();
    expect(within(row).getByText("Budgeted Cost")).toBeTruthy();
    expect(within(row).getByText("Actual Cost")).toBeTruthy();
    expect(
      within(row).getByLabelText(
        "Site visit conducted. Decision: Complete",
      ),
    ).toBeTruthy();
    expect(within(row).getByText("Documented Cost Coverage")).toBeTruthy();
    expect(within(row).getByText("25%")).toBeTruthy();
    expect(row.querySelector('[data-slot="progress"]')).toBeTruthy();

    fireEvent.click(
      within(row).getByRole("button", {
        name: "Expand Footing forms details",
      }),
    );

    expect(within(row).getByText("Scope")).toBeTruthy();
    expect(
      within(row).getByText(
        "Set and verify footing forms against the approved plan.",
      ),
    ).toBeTruthy();
    expect(within(row).getByText("Field Guidance")).toBeTruthy();
    expect(
      within(row).getByText("Confirm dimensions before the concrete pour."),
    ).toBeTruthy();
    expect(within(row).getByText("Builder Submitted Evidence")).toBeTruthy();
    expect(within(row).getByText("forms-complete.jpg")).toBeTruthy();
    expect(within(row).getByText("Site Visit Packages")).toBeTruthy();
    expect(within(row).getByText("Visit visit-forms · Complete")).toBeTruthy();
    expect(within(row).getByText("Receipts / invoices")).toBeTruthy();

    const supportingDetailRows = within(row).getByTestId(
      "milestone-supporting-detail-rows",
    );
    const supportingSections = Array.from(
      supportingDetailRows.querySelectorAll(":scope > section"),
    );
    expect(supportingSections).toHaveLength(5);
    expect(
      supportingSections.map(
        (section) => section.querySelector("h3")?.textContent,
      ),
    ).toEqual([
      "Scope",
      "Field Guidance",
      "Builder Submitted Evidence",
      "Site Visit Packages",
      "Receipts / invoices",
    ]);

    fireEvent.click(
      within(row).getByRole("button", { name: "footing-invoice.pdf" }),
    );
    expect(onOpenCostDocument).toHaveBeenCalledWith("cost-document-forms");
  });

  test("shows every attached Site Visit as a scoped card and opens the full report", () => {
    renderSheet({ siteVisits: milestoneSiteVisits });

    const grid = screen.getByTestId("milestone-site-visit-grid");
    expect(within(grid).getAllByRole("button")).toHaveLength(2);
    const scopedVisit = within(grid).getByRole("button", {
      name: "Open Site Visit visit-forms",
    });
    expect(within(scopedVisit).getByText("Aug 7, 2026")).toBeTruthy();
    expect(within(scopedVisit).getByText("Footing forms")).toBeTruthy();
    expect(within(grid).getByText("Whole Milestone")).toBeTruthy();

    fireEvent.click(scopedVisit);

    const visitDialog = screen.getByRole("dialog", {
      name: "Site Visit · Foundation",
    });
    expect(within(visitDialog).getByText("visit-forms")).toBeTruthy();
    expect(
      within(visitDialog).getByText(
        "Footing forms match the approved dimensions.",
      ),
    ).toBeTruthy();
  });

  test("does not give planned or complete rows the active overdue treatment", () => {
    const firstChild = sheetData.submilestones?.[0];
    const secondChild = sheetData.submilestones?.[1];
    if (!firstChild || !secondChild) {
      throw new Error("Expected child fixtures.");
    }

    renderSheet({
      data: {
        ...sheetData,
        submilestones: [
          {
            ...firstChild,
            scheduleHealth: { health: "behind_schedule", overdueDays: 4 },
          },
          {
            ...secondChild,
            scheduleHealth: { health: "behind_schedule", overdueDays: 4 },
            status: "complete",
          },
        ],
      },
    });

    expect(screen.queryByText("Behind schedule · 4 days overdue")).toBeNull();
  });

  test("routes the child ledger to the canonical Overview exactly once", () => {
    const onOpenCanonicalTarget = vi.fn();
    renderSheet({ onOpenCanonicalTarget });

    fireEvent.click(
      screen.getByRole("button", { name: "Footing forms actions" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Open full detail" }));

    expect(onOpenCanonicalTarget).toHaveBeenCalledTimes(1);
    expect(onOpenCanonicalTarget).toHaveBeenCalledWith(
      { kind: "submilestone", submilestoneId: "submilestone-forms" },
      { selectedTab: "overview" },
    );
  });

  test.each([
    ["People", "people"],
    ["Materials", "materials"],
    ["Evidence", "evidence"],
    ["Collaboration", "collaboration"],
    ["Review", "review"],
  ] as const)("routes %s to the canonical tab", (label, selectedTab) => {
    const onOpenCanonicalTarget = vi.fn();
    renderSheet({ onOpenCanonicalTarget });

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Expand Footing forms details",
      })[0],
    );

    fireEvent.click(screen.getAllByRole("button", { name: label })[0]);

    expect(onOpenCanonicalTarget).toHaveBeenCalledWith(
      { kind: "submilestone", submilestoneId: "submilestone-forms" },
      { selectedTab },
    );
  });

  test("Complete remaining scope opens canonical Review instead of guided legacy UI", () => {
    const onOpenCanonicalTarget = vi.fn();
    renderSheet({ onOpenCanonicalTarget });

    fireEvent.click(
      screen.getByTestId("milestone-primary-completion-action"),
    );

    expect(onOpenCanonicalTarget).toHaveBeenCalledWith(
      { kind: "submilestone", submilestoneId: "submilestone-forms" },
      { selectedTab: "review" },
    );
    expect(screen.queryByText("Guided completion")).toBeNull();
  });

  test("fails closed when a child has no canonical id", () => {
    const onOpenCanonicalTarget = vi.fn();
    const firstChild = sheetData.submilestones?.[0];
    if (!firstChild) {
      throw new Error("Expected a child fixture.");
    }
    renderSheet({
      data: {
        ...sheetData,
        submilestones: [{ ...firstChild, submilestoneId: undefined }],
      },
      onOpenCanonicalTarget,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Footing forms actions" }),
    );
    const openItem = screen.getByRole("menuitem", {
      name: "Open full detail",
    });
    expect(openItem.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(openItem);
    expect(onOpenCanonicalTarget).not.toHaveBeenCalled();
  });

  test("retains parent start, completion, and approval actions", async () => {
    const onStartWork = vi.fn();
    const onSubmitCompletion = vi.fn().mockResolvedValue(undefined);
    const onApprove = vi.fn();
    renderSheet({
      data: {
        ...sheetData,
        submilestones: sheetData.submilestones?.map((row) => ({
          ...row,
          status: "complete",
        })),
        canStartWork: true,
      },
      onApprove,
      onStartWork,
      onSubmitCompletion,
    });

    fireEvent.click(screen.getByTestId("milestone-detail-sheet-start-work"));
    expect(onStartWork).toHaveBeenCalledWith("foundation", undefined);
    fireEvent.click(
      screen.getByTestId("milestone-primary-completion-action"),
    );
    await waitFor(() => expect(onSubmitCompletion).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Approve milestone" }));
    expect(onApprove).toHaveBeenCalledWith("foundation", undefined);
  });

  test("keeps summary and review controls in separate full-width footer rows", () => {
    renderSheet({
      onApprove: vi.fn(),
      onAssignVisit: vi.fn(),
      onReject: vi.fn(),
      onRequestInfo: vi.fn(),
    });

    const footer = document.querySelector('[data-slot="sheet-footer"]');
    expect(footer).toBeTruthy();
    expect(footer?.classList.contains("sm:flex-col")).toBe(true);

    const summary = screen.getByTestId("milestone-footer-summary");
    const reviewActions = screen.getByTestId("milestone-review-actions");

    expect(summary.classList.contains("w-full")).toBe(true);
    expect(reviewActions.classList.contains("w-full")).toBe(true);
    expect(summary.parentElement).toBe(footer);
    expect(reviewActions.parentElement).toBe(footer);
  });
});
