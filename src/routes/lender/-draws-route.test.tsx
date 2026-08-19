// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const routeState = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
}));
const navigateMock = vi.hoisted(() => vi.fn());
const usePaginatedQueryMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  usePaginatedQuery: usePaginatedQueryMock,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    () =>
    (options: Record<string, unknown>) => ({
      ...options,
      useRouteContext: () => ({ userId: "user_lender" }),
      useSearch: () => routeState.search,
    }),
  useNavigate: () => navigateMock,
}));

vi.mock("#/components/lender-shell.tsx", () => ({
  LenderShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock(
  "#/features/lender-portal/LenderNotificationReviewSurface.tsx",
  () => ({
    LenderNotificationReviewSurface: () => (
      <div data-testid="lender-draw-review">Draw review</div>
    ),
    LenderReviewSurface: () => (
      <div data-testid="lender-ordinary-draw-review">Ordinary Draw review</div>
    ),
  })
);

import { api } from "../../../convex/_generated/api";
import type { LenderDrawQueueRow } from "../../features/lender-portal/LenderDrawQueue.tsx";
import { Route } from "./draws.tsx";

const canonicalDrawRow: LenderDrawQueueRow = {
  actionRequired: true,
  amountCents: 10_000_000,
  buildId: "build_1" as never,
  buildName: "Harbourline Residences",
  builderName: "Northstar Builder",
  currentReviewCycleId: "cycle_1" as never,
  currentReviewCycleNumber: 1,
  displayId: "DRAW-01",
  drawRequestId: "draw_1" as never,
  fundingPosition: {
    availableBeforeCents: 20_000_000,
    reconciled: true,
    remainingAfterCents: 10_000_000,
  },
  label: "Foundation reimbursement",
  lenderPortalReviewState: "awaiting_review",
  location: "Hamilton, ON",
  note: "Reimburse completed foundation work.",
  requestedAt: "2026-08-15T12:00:00.000Z",
  reviewCycle: {
    approvedGroups: ["backoffice"],
    evidencePackageRevisionCount: 1,
    evidenceReferenceCount: 2,
    lenderApprovalCount: 0,
    lenderQuorum: 1,
    locationReferenceCount: 1,
    locationVerifiedCount: 1,
    requiredGroups: ["backoffice", "lender"],
    state: "awaiting_review",
  },
  status: "in_review",
  targetAvailability: "available",
  updatedAt: Date.parse("2026-08-15T12:00:00.000Z"),
  viewerActionState: "needs_action",
  viewerDecision: null,
  workOrderKey: "DRWO-0001",
};

beforeEach(() => {
  usePaginatedQueryMock.mockReturnValue({
    loadMore: vi.fn(),
    results: [canonicalDrawRow],
    status: "Exhausted",
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  routeState.search = {};
});

describe("/lender/draws production route", () => {
  test("renders the promoted production Draw queue from the ordinary route entry", () => {
    const Component = (Route as any).component;
    render(<Component />);

    expect(usePaginatedQueryMock).toHaveBeenCalledWith(
      api.lender_portal.getLenderDrawQueue,
      { scope: "action" },
      { initialNumItems: 20 }
    );
    expect(screen.getByText("Harbourline Residences")).toBeTruthy();
    expect(screen.getByText("Foundation reimbursement")).toBeTruthy();
    expect(screen.queryByTestId("lender-draw-review")).toBeNull();
  });

  test("renders the canonical review surface for a complete deep-link tuple", () => {
    routeState.search = {
      drawRequestId: "draw_1",
      reviewCycleId: "cycle_1",
      reviewCycleNumber: 1,
    };
    const Component = (Route as any).component;
    render(<Component />);

    expect(screen.getByTestId("lender-draw-review")).toBeTruthy();
    expect(screen.queryByText("Harbourline Residences")).toBeNull();
  });

  test("renders the ordinary Phase 5 detail from a queue target without notification correlation", () => {
    routeState.search = { drawRequestId: "draw_1" };
    const Component = (Route as any).component;
    render(<Component />);

    expect(screen.getByTestId("lender-ordinary-draw-review")).toBeTruthy();
    expect(screen.queryByTestId("lender-draw-review")).toBeNull();
    expect(screen.queryByText("Harbourline Residences")).toBeNull();
  });

  test("opens canonical queue data through the ordinary target-only route contract", () => {
    const Component = (Route as any).component;
    render(<Component />);

    screen.getByRole("button", { name: "Review Draw" }).click();

    expect(navigateMock).toHaveBeenCalledWith({
      search: { drawRequestId: "draw_1" },
      to: "/lender/draws",
    });
  });
});
