// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const convexMock = vi.hoisted(() => ({
  mutation: vi.fn().mockResolvedValue(null),
}));

vi.mock("convex/react", () => ({
  useAction: vi.fn(() => convexMock.mutation),
  useMutation: vi.fn(() => convexMock.mutation),
  useQuery: vi.fn(() => undefined),
}));

import { ProductionProposalTimelineGanttWorkspace } from "./ProductionProposalGanttWorkspace.tsx";

afterEach(() => cleanup());

beforeEach(() => {
  convexMock.mutation.mockClear();
  convexMock.mutation.mockResolvedValue(null);
});

describe("ProductionProposalTimelineGanttWorkspace plan selection", () => {
  test("keeps optimizer preset selection optional and persists it when chosen", async () => {
    render(
      <ProductionProposalTimelineGanttWorkspace
        proposalId={"proposal_123" as any}
        workosOrganizationId="org_test"
        workspace={proposalWorkspace() as any}
      />,
    );

    expect(
      (screen.getByTestId("proposal-submit") as HTMLButtonElement).disabled,
    ).toBe(false);

    fireEvent.click(screen.getByTestId("workspace-draw-plans-open"));
    fireEvent.click(screen.getByTestId("draw-plan-option-fastest"));

    await waitFor(() =>
      expect(convexMock.mutation).toHaveBeenCalledWith(
        expect.objectContaining({
          metrics: expect.objectContaining({
            drawCount: 1,
            projectedDurationDays: 26,
            totalDrawAmountCents: 80_000_00,
          }),
          planKey: "fastest",
          proposalId: "proposal_123",
          recommendationReason:
            "Compresses feasible milestone windows while preserving dependencies.",
          workosOrganizationId: "org_test",
        }),
      ),
    );
    await waitFor(() =>
      expect(
        (screen.getByTestId("proposal-submit") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
  });
});

function proposalWorkspace() {
  return {
    capitalEvents: [],
    draws: [
      {
        amountCents: 80_000_00,
        drawKey: "draw-01",
        itemMilestoneKey: "foundation",
        label: "Foundation reimbursement draw",
        x: 30,
      },
    ],
    milestones: [
      {
        budgetCents: 100_000_00,
        dependencyKeys: [],
        durationDays: 30,
        evidenceState: "Draft package",
        icon: "foundation",
        milestoneKey: "foundation",
        name: "Foundation",
        order: 1,
        policyState: "Draft policy review",
        status: "upcoming",
        submilestoneSnapshot: [
          {
            budgetCents: 100_000_00,
            durationDays: 30,
            key: "footings",
            name: "Footings",
            order: 1,
            startDay: 0,
          },
        ],
        x: 0,
      },
    ],
    plan: {
      borrowerCoPayBps: 2_000,
      currentDay: 0,
      minimumCashReserveCents: 5_000_00,
      progressValue: 0,
      rangeMax: 90,
      rangeMin: 0,
      routeState: { selectedPanelOpen: false, straightLine: true },
      startingCashCents: 40_000_00,
    },
    proposal: {
      borrowerCoPayBps: 2_000,
      borrowerStartingCashCents: 40_000_00,
      buildName: "Proposal build",
      lenderDrawPolicyLimitCents: 80_000_00,
      location: "Hamilton, ON",
      status: "draft",
      totalBudgetCents: 100_000_00,
    },
  };
}
