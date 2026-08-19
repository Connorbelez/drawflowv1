// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { LenderPortalMilestoneQueueRow } from "../../../convex/lender_portal_phase5_contracts";

const usePaginatedQueryMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  usePaginatedQuery: usePaginatedQueryMock,
}));

import { LenderMilestoneQueue } from "./LenderMilestoneQueue.tsx";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const actionRow: LenderPortalMilestoneQueueRow = {
  actionRequired: true,
  actualCostCents: 4_200_000,
  actualEndDate: "2026-08-19",
  actualStartDate: "2026-08-02",
  approvedGroups: ["backoffice"],
  buildId: "build_1" as never,
  buildName: "Harbourline Residences",
  currentEligibleLenderCount: 2,
  evidence: [{ kind: "asset", label: "Foundation invoice" }],
  lenderApprovalCount: 0,
  lenderQuorum: 1,
  milestoneId: "milestone_1" as never,
  milestoneName: "Foundation",
  plannedBudgetCents: 5_000_000,
  plannedEndDate: "2026-08-21",
  plannedStartDate: "2026-08-01",
  receiptCoverageCents: 4_200_000,
  receiptInvoiceRequired: true,
  requiredGroups: ["backoffice", "lender"],
  reviewCycleId: "cycle_1" as never,
  reviewCycleNumber: 2,
  siteVisitRequired: true,
  state: "partial_approval",
  submittedAt: Date.parse("2026-08-20T12:00:00.000Z"),
  submilestones: [
    {
      builderEvidence: true,
      name: "Footings and forms",
      receiptCoverageCents: null,
      siteVisitAddressed: true,
      siteVisitRequired: false,
    },
  ],
  targetAvailability: "available",
  viewerActionState: "needs_action",
  viewerDecision: null,
};

const correctionRow: LenderPortalMilestoneQueueRow = {
  ...actionRow,
  actionRequired: false,
  milestoneId: "milestone_2" as never,
  milestoneName: "Building envelope",
  reviewCycleId: "cycle_2" as never,
  state: "correction_required",
  viewerActionState: "closed",
};

const staleRow: LenderPortalMilestoneQueueRow = {
  ...actionRow,
  actionRequired: false,
  milestoneId: "milestone_3" as never,
  milestoneName: "Mechanical rough-in",
  plannedBudgetCents: null,
  plannedEndDate: null,
  plannedStartDate: null,
  reviewCycleId: "cycle_3" as never,
  submilestones: [],
  targetAvailability: "unavailable",
  viewerActionState: "unavailable",
};

const approvedRow: LenderPortalMilestoneQueueRow = {
  ...actionRow,
  actionRequired: false,
  milestoneId: "milestone_4" as never,
  milestoneName: "Framing complete",
  reviewCycleId: "cycle_4" as never,
  state: "completed",
  viewerActionState: "closed",
  viewerDecision: "approved",
};

describe("LenderMilestoneQueue", () => {
  test("defaults to personal action and opens the exact current review tuple", () => {
    const onOpenReview = vi.fn();
    usePaginatedQueryMock.mockImplementation(
      (_query: unknown, args: { scope: "action" | "all" }) => ({
        loadMore: vi.fn(),
        results:
          args.scope === "action"
            ? [actionRow]
            : [actionRow, correctionRow, staleRow, approvedRow],
        status: "Exhausted",
      })
    );

    render(<LenderMilestoneQueue onOpenReview={onOpenReview} />);

    expect(
      screen.getByRole("button", { name: "Needs my action" }).getAttribute(
        "aria-pressed"
      )
    ).toBe("true");
    expect(screen.getByText("Foundation")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    expect(onOpenReview).toHaveBeenCalledWith(
      expect.objectContaining({
        milestoneId: "milestone_1",
        reviewCycleId: "cycle_1",
        reviewCycleNumber: 2,
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "All assigned" }));
    expect(screen.getByText("Building envelope")).toBeTruthy();
    expect(screen.getByText("Mechanical rough-in")).toBeTruthy();
    expect(screen.getByText("Framing complete")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Request no longer current" })
        .hasAttribute("disabled")
    ).toBe(true);
    expect(
      screen.getByRole("heading", { name: "Builder correction" })
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Approved" })).toBeTruthy();
  });

  test("renders explicit loading and empty personal-action states", () => {
    usePaginatedQueryMock.mockReturnValue({
      loadMore: vi.fn(),
      results: [],
      status: "LoadingFirstPage",
    });
    const { rerender } = render(
      <LenderMilestoneQueue onOpenReview={vi.fn()} />
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Loading assigned Milestone requests…"
    );

    usePaginatedQueryMock.mockReturnValue({
      loadMore: vi.fn(),
      results: [],
      status: "Exhausted",
    });
    rerender(<LenderMilestoneQueue onOpenReview={vi.fn()} />);
    expect(
      screen.getByText(
        "No assigned requests need your action. Choose All assigned to see every request."
      )
    ).toBeTruthy();
  });

  test("loads the next canonical page once", () => {
    const loadMore = vi.fn();
    usePaginatedQueryMock.mockReturnValue({
      loadMore,
      results: [actionRow],
      status: "CanLoadMore",
    });
    render(<LenderMilestoneQueue onOpenReview={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(loadMore).toHaveBeenCalledWith(20);
  });
});
