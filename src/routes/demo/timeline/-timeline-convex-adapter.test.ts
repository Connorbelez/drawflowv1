import { describe, expect, test } from "vitest";

import { convexWorkspaceToTimelineState } from "./-timeline-convex-adapter";

describe("convexWorkspaceToTimelineState", () => {
  test("maps normalized Convex rows into the existing timeline view model", () => {
    const state = convexWorkspaceToTimelineState({
      capitalEvents: [
        {
          amountCents: 50_000,
          capitalEventKey: "reserve",
          label: "Reserve",
          x: 12,
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
          amountCents: 125_000,
          drawKey: "draw-01",
          itemMilestoneKey: "foundation",
          label: "Draw 1",
          requestStatus: "requested",
          x: 21,
        },
      ],
      milestones: [
        {
          budgetCents: 125_000,
          durationDays: 9,
          evidenceState: "accepted package",
          icon: "foundation",
          milestoneKey: "foundation",
          name: "Foundation",
          order: 1,
          policyState: "Released",
          status: "complete",
          submilestoneSnapshot: [{ name: "Forms" }, { name: "Pour" }],
          x: 12,
        },
      ],
      plan: {
        currentDay: 18,
        progressValue: 18,
        rangeMax: 120,
        rangeMin: 0,
        routeState: {
          activeMilestoneKey: "foundation",
          selectedPanelOpen: true,
          straightLine: false,
        },
        startingCashCents: 400_000,
      },
    });

    expect(state.items[0].id).toBe("foundation");
    expect(state.items[0].data).toMatchObject({
      amount: 125_000,
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
    });
    expect(state.draws[0]).toMatchObject({
      amount: 125_000,
      id: "draw-01",
      requestStatus: "requested",
    });
    expect(state.draws[0].itemId).toBeUndefined();
    expect(state.capitalSpikes[0].id).toBe("reserve");
    expect(state.activeSelection.itemId).toBe("foundation");
  });
});
