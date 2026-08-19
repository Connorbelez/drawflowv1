// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { LenderDrawQueueRow } from "./LenderDrawQueue.tsx";

const usePaginatedQueryMock = vi.hoisted(() => vi.fn());
const loadMoreMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  usePaginatedQuery: usePaginatedQueryMock,
}));

import { LenderDrawQueue } from "./LenderDrawQueue.tsx";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const actionRow: LenderDrawQueueRow = {
  actionRequired: true,
  amountCents: 10_000_000,
  buildId: "build_1" as never,
  buildName: "Harbourline Residences",
  builderName: "Northstar Builder",
  currentReviewCycleId: "cycle_1" as never,
  currentReviewCycleNumber: 2,
  displayId: "DRAW-01",
  drawRequestId: "draw_1" as never,
  fundingPosition: {
    availableBeforeCents: 20_000_000,
    reconciled: true,
    remainingAfterCents: 10_000_000,
  },
  label: "Foundation reimbursement",
  lenderPortalReviewState: "partial_approval",
  location: "Hamilton, ON",
  note: "Reimburse completed foundation work.",
  requestedAt: "2026-08-15T12:00:00.000Z",
  reviewCycle: {
    approvedGroups: ["backoffice"],
    evidencePackageRevisionCount: 1,
    evidenceReferenceCount: 3,
    lenderApprovalCount: 1,
    lenderQuorum: 2,
    locationReferenceCount: 2,
    locationVerifiedCount: 1,
    requiredGroups: ["backoffice", "lender"],
    state: "partial_approval",
  },
  status: "in_review",
  targetAvailability: "available",
  updatedAt: Date.parse("2026-08-15T12:00:00.000Z"),
  viewerActionState: "needs_action",
  viewerDecision: null,
  workOrderKey: "DRWO-0001",
};

const waitingRow: LenderDrawQueueRow = {
  ...actionRow,
  actionRequired: false,
  amountCents: 5_000_000,
  currentReviewCycleId: "cycle_2" as never,
  currentReviewCycleNumber: 1,
  displayId: "DRAW-02",
  drawRequestId: "draw_2" as never,
  fundingPosition: {
    availableBeforeCents: 15_000_000,
    reconciled: true,
    remainingAfterCents: 10_000_000,
  },
  label: "Framing reimbursement",
  reviewCycle: {
    ...actionRow.reviewCycle!,
    approvedGroups: ["lender"],
    lenderApprovalCount: 2,
  },
  viewerActionState: "acted",
  viewerDecision: "approved",
};

const staleRow: LenderDrawQueueRow = {
  ...actionRow,
  actionRequired: false,
  buildId: "build_2" as never,
  buildName: "Cedarview Homes",
  builderName: "Cedarview Builder",
  currentReviewCycleId: null,
  currentReviewCycleNumber: null,
  displayId: "DRAW-03",
  drawRequestId: "draw_3" as never,
  fundingPosition: {
    availableBeforeCents: 4_000_000,
    reconciled: false,
    remainingAfterCents: -1_000_000,
  },
  label: "Envelope reimbursement",
  reviewCycle: null,
  targetAvailability: "unavailable",
  viewerActionState: "unavailable",
  viewerDecision: null,
};

describe("LenderDrawQueue", () => {
  test("promotes Build packets with canonical cycle, evidence, approvals, and pooled funding", () => {
    const onOpenBuild = vi.fn();
    const onOpenReview = vi.fn();
    usePaginatedQueryMock.mockImplementation(
      (_query, args: { scope: "action" | "all" }) => ({
        loadMore: loadMoreMock,
        results:
          args.scope === "action"
            ? [actionRow]
            : [actionRow, waitingRow, staleRow],
        status: "Exhausted",
      })
    );

    render(
      <LenderDrawQueue
        onOpenBuild={onOpenBuild}
        onOpenReview={onOpenReview}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: /Needs my action/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("Harbourline Residences")).toBeTruthy();
    expect(screen.getByText("Northstar Builder · Hamilton, ON")).toBeTruthy();
    expect(screen.getByText("Back Office + lender quorum")).toBeTruthy();
    expect(screen.getByText("1 of 2")).toBeTruthy();
    expect(screen.getByText("3 current-cycle evidence references")).toBeTruthy();
    expect(screen.getByText("1 retained Evidence Package revision")).toBeTruthy();
    expect(screen.getByText("1 of 2 linked assets location-verified")).toBeTruthy();
    expect(screen.getByText("Available before")).toBeTruthy();
    expect(screen.getAllByText("$200,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Needs my action").length).toBeGreaterThan(0);
    expect(screen.getByText("Your lender decision is required")).toBeTruthy();
    expect(screen.queryByText("Framing reimbursement")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Review Draw" }));
    expect(onOpenReview).toHaveBeenCalledWith(actionRow);
    fireEvent.click(screen.getByRole("button", { name: /Build overview/ }));
    expect(onOpenBuild).toHaveBeenCalledWith("build_1");

    fireEvent.click(screen.getByRole("button", { name: /All assigned/ }));
    expect(screen.getByText("Framing reimbursement")).toBeTruthy();
    expect(screen.getByText("Cedarview Homes")).toBeTruthy();
    expect(screen.getByText("Funding position requires reconciliation.")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Review unavailable" })
        .hasAttribute("disabled"),
    ).toBe(true);

    fireEvent.click(screen.getAllByRole("button", { name: "Review Draw" })[1]!);
    expect(onOpenReview).toHaveBeenLastCalledWith(waitingRow);
  });

  test("renders explicit loading and empty scope states", () => {
    usePaginatedQueryMock.mockReturnValue({
      loadMore: loadMoreMock,
      results: [],
      status: "LoadingFirstPage",
    });
    const { rerender } = render(
      <LenderDrawQueue onOpenBuild={vi.fn()} onOpenReview={vi.fn()} />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Loading assigned Draw requests…",
    );

    usePaginatedQueryMock.mockReturnValue({
      loadMore: loadMoreMock,
      results: [],
      status: "Exhausted",
    });
    rerender(<LenderDrawQueue onOpenBuild={vi.fn()} onOpenReview={vi.fn()} />);
    expect(
      screen.getByText("No assigned Draw requests need your action."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /All assigned/ }));
    expect(
      screen.getByText("No assigned Draw requests are available."),
    ).toBeTruthy();
  });

  test("loads the next server page without masking remaining assignments", () => {
    usePaginatedQueryMock.mockReturnValue({
      loadMore: loadMoreMock,
      results: [actionRow],
      status: "CanLoadMore",
    });
    render(
      <LenderDrawQueue onOpenBuild={vi.fn()} onOpenReview={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(loadMoreMock).toHaveBeenCalledWith(20);
  });
});
