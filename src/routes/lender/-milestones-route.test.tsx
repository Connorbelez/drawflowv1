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
      <div data-testid="lender-milestone-notification-review">
        Notification Milestone review
      </div>
    ),
    LenderReviewSurface: () => (
      <div data-testid="lender-ordinary-milestone-review">
        Ordinary Milestone review
      </div>
    ),
  })
);

import { api } from "../../../convex/_generated/api";
import type { LenderPortalMilestoneQueueRow } from "../../../convex/lender_portal_phase5_contracts";
import { Route } from "./milestones.tsx";

const canonicalMilestoneRow: LenderPortalMilestoneQueueRow = {
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
  reviewCycleNumber: 1,
  siteVisitRequired: true,
  state: "partial_approval",
  submittedAt: Date.parse("2026-08-20T12:00:00.000Z"),
  submilestones: [
    {
      builderEvidence: true,
      name: "Footings and forms",
      receiptCoverageCents: 4_200_000,
      siteVisitAddressed: true,
      siteVisitRequired: false,
    },
  ],
  targetAvailability: "available",
  viewerActionState: "needs_action",
  viewerDecision: null,
};

beforeEach(() => {
  usePaginatedQueryMock.mockReturnValue({
    loadMore: vi.fn(),
    results: [canonicalMilestoneRow],
    status: "Exhausted",
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  routeState.search = {};
});

describe("/lender/milestones production route", () => {
  test("renders the ordinary Phase 5 detail from a queue target", () => {
    routeState.search = { milestoneId: "milestone_1" };
    const Component = (Route as any).component;
    render(<Component />);

    expect(screen.getByTestId("lender-ordinary-milestone-review")).toBeTruthy();
    expect(
      screen.queryByTestId("lender-milestone-notification-review")
    ).toBeNull();
    expect(screen.queryByTestId("production-lender-milestone-queue")).toBeNull();
  });

  test("retains the exact-cycle notification boundary for correlated links", () => {
    routeState.search = {
      milestoneId: "milestone_1",
      reviewCycleId: "cycle_1",
      reviewCycleNumber: 1,
    };
    const Component = (Route as any).component;
    render(<Component />);

    expect(
      screen.getByTestId("lender-milestone-notification-review")
    ).toBeTruthy();
    expect(screen.queryByTestId("lender-ordinary-milestone-review")).toBeNull();
  });

  test("opens canonical queue data through the ordinary target-only route contract", () => {
    const Component = (Route as any).component;
    render(<Component />);

    expect(usePaginatedQueryMock).toHaveBeenCalledWith(
      api.lender_portal_phase5.listAllAssignedLenderMilestoneReviewRequests,
      { scope: "action" },
      { initialNumItems: 20 }
    );
    expect(screen.getByText("Foundation")).toBeTruthy();
    expect(screen.getByText("Harbourline Residences")).toBeTruthy();
    screen.getByRole("button", { name: "Review request" }).click();

    expect(navigateMock).toHaveBeenCalledWith({
      search: { milestoneId: "milestone_1" },
      to: "/lender/milestones",
    });
  });
});
