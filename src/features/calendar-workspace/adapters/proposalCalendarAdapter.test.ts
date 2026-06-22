import { describe, expect, test } from "vitest";

import { buildProposalCalendarWorkspaceFromDetail } from "./proposalCalendarAdapter.ts";

describe("buildProposalCalendarWorkspaceFromDetail", () => {
  test("uses proposal proposedStartDate before active build start date exists", () => {
    const workspace = buildProposalCalendarWorkspaceFromDetail({
      draws: [
        {
          amountCents: 40_000_00,
          drawKey: "draw-01",
          label: "Foundation reimbursement draw",
          timingDay: 12,
        },
      ],
      milestones: [
        {
          budgetCents: 50_000_00,
          dayEnd: 10,
          dayStart: -2,
          key: "foundation",
          name: "Foundation",
          order: 1,
        },
      ],
      proposal: {
        _id: "proposal-1",
        buildName: "Backdated proposal",
        location: "Hamilton, ON",
        proposedStartDate: "2026-06-15",
        status: "draft",
      },
      submilestones: [
        {
          durationDays: 3,
          key: "forms",
          milestoneKey: "foundation",
          name: "Forms and pour",
          startDay: 4,
        },
      ],
    });

    expect(
      workspace.events.find((event) => event.id === "proposal:milestone:foundation")
    ).toMatchObject({
      endsAt: "2026-06-25",
      startsAt: "2026-06-13",
    });
    expect(
      workspace.events.find((event) => event.id === "proposal:submilestone:forms")
    ).toMatchObject({
      endsAt: "2026-06-22",
      startsAt: "2026-06-19",
    });
    expect(
      workspace.events.find((event) => event.id === "proposal:draw:draw-01")
    ).toMatchObject({
      startsAt: "2026-06-27",
    });
  });
});
