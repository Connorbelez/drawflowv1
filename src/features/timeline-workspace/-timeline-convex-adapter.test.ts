import { describe, expect, test } from "vitest";

import { convexWorkspaceToTimelineState } from "./-timeline-convex-adapter";

describe("convexWorkspaceToTimelineState", () => {
  test("maps normalized Convex rows into the existing timeline view model", () => {
    const state = convexWorkspaceToTimelineState({
      capitalEvents: [
        {
          amountCents: 5_000_000,
          capitalEventKey: "permit-overrun",
          label: "Permit overrun",
          x: 12,
        },
        {
          amountCents: 40_000_000,
          capitalEventKey: "reserve",
          label: "Borrower reserve",
          x: 0,
        },
      ],
      evidenceAssets: [
        {
          evidenceKey: "evidence-01",
          fileName: "foundation.jpg",
          label: "Foundation image",
          milestoneKey: "foundation",
          mimeType: "image/jpeg",
          previewUrl: "https://example.test/foundation.jpg",
          sizeBytes: 1234,
          tag: "Foundation",
        },
      ],
      draws: [
        {
          amountCents: 12_500_000,
          drawKey: "draw-01",
          itemMilestoneKey: "foundation",
          label: "Draw 1",
          requestStatus: "requested",
          x: 21,
        },
      ],
      milestones: [
        {
          budgetCents: 12_500_000,
          drawAvailabilityCents: 10_000_000,
          durationDays: 9,
          evidenceState: "accepted package",
          icon: "foundation",
          milestoneKey: "foundation",
          name: "Foundation",
          order: 1,
          policyState: "Released",
          status: "complete",
          submilestoneSnapshot: [
            {
              canonicalId: "sub-01",
              key: "foundation-sub-01",
              name: "Forms",
              order: 1,
            },
            { key: "foundation-sub-02", name: "Pour", order: 2 },
          ],
          x: 12,
        },
      ],
      plan: {
        borrowerCoPayBps: 2_000,
        borrowerCoPayCents: 2_500_000,
        currentDay: 18,
        progressValue: 18,
        rangeMax: 120,
        rangeMin: 0,
        routeState: {
          activeMilestoneKey: "foundation",
          selectedPanelOpen: true,
          straightLine: false,
        },
        startingCashCents: 40_000_000,
      },
      proposal: {
        interestAnnualBps: 1_050,
        lenderDrawPolicyLimitCents: 14_000_000,
      },
    });

    expect(state.items[0].id).toBe("foundation");
    expect(state.items[0].data).toMatchObject({
      amount: 125_000,
      drawAvailabilityAmount: 100_000,
      draw: "Reimbursement draw",
      evidencePackage: {
        assets: [
          {
            id: "evidence-01",
            previewUrl: "https://example.test/foundation.jpg",
          },
        ],
      },
      subMilestones: ["Forms", "Pour"],
      submilestoneDetails: [
        expect.objectContaining({
          canonicalId: "sub-01",
          key: "foundation-sub-01",
          name: "Forms",
          order: 1,
        }),
        expect.objectContaining({ key: "foundation-sub-02", name: "Pour", order: 2 }),
      ],
    });
    expect(state.draws[0]).toMatchObject({
      amount: 125_000,
      id: "draw-01",
      itemId: "foundation",
      requestStatus: "requested",
    });
    expect(state.capitalSpikes).toHaveLength(1);
    expect(state.capitalSpikes[0].id).toBe("permit-overrun");
    expect(state.capitalSpikes[0].amount).toBe(50_000);
    expect(state.startingCash).toBe(400_000);
    expect(state.approvedDrawLimit).toBe(140_000);
    expect(state.interestAnnualBps).toBe(1_050);
    expect(state.activeSelection.itemId).toBe("foundation");
  });
});
