import { describe, expect, test, vi } from "vitest";

import {
  buildProposalCalendarWorkspaceFromDetail,
  createProposalCalendarEditHandler,
} from "./proposalCalendarAdapter.ts";

describe("buildProposalCalendarWorkspaceFromDetail", () => {
  test("falls back to the default planning anchor when proposal start dates are invalid", () => {
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
          dayStart: 0,
          key: "foundation",
          name: "Foundation",
          order: 1,
        },
      ],
      proposal: {
        _id: "proposal-1",
        buildName: "Placeholder start proposal",
        location: "Hamilton, ON",
        proposedStartDate: "not-scheduled",
        status: "draft",
      },
      submilestones: [],
    });

    expect(
      workspace.events.find(
        (event) => event.id === "proposal:milestone:foundation",
      ),
    ).toMatchObject({
      endsAt: "2026-06-11",
      startsAt: "2026-06-01",
    });
    expect(
      workspace.events.find((event) => event.id === "proposal:draw:draw-01"),
    ).toMatchObject({
      startsAt: "2026-06-13",
    });
  });

  test("projects submitted proposal schedule events as immutable", () => {
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
          dayStart: 0,
          key: "foundation",
          name: "Foundation",
          order: 1,
        },
      ],
      proposal: {
        _id: "proposal-1",
        buildName: "Submitted proposal",
        location: "Hamilton, ON",
        proposedStartDate: "2026-06-15",
        status: "submitted",
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

    for (const eventId of [
      "proposal:milestone:foundation",
      "proposal:submilestone:forms",
      "proposal:draw:draw-01",
    ]) {
      expect(workspace.events.find((event) => event.id === eventId)).toMatchObject({
        editable: {
          canMove: false,
          canResizeEnd: false,
          canResizeStart: false,
          immutableReason:
            "Only draft proposal schedules can be changed from the calendar.",
          requiredReason: "none",
        },
      });
    }
  });

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

describe("createProposalCalendarEditHandler", () => {
  test("does not dispatch schedule changes for immutable proposal events", async () => {
    const workspace = buildProposalCalendarWorkspaceFromDetail({
      draws: [],
      milestones: [
        {
          dayEnd: 10,
          dayStart: 0,
          key: "foundation",
          name: "Foundation",
          order: 1,
        },
      ],
      proposal: {
        _id: "proposal-1",
        proposedStartDate: "2026-06-15",
        status: "submitted",
      },
      submilestones: [],
    });
    const event = workspace.events.find(
      (candidate) => candidate.id === "proposal:milestone:foundation",
    );
    expect(event).toBeDefined();
    if (!event) {
      return;
    }
    const reviseMilestoneSchedule = vi.fn();
    const handleEdit = createProposalCalendarEditHandler({
      actions: { reviseMilestoneSchedule },
      baseDate: "2026-06-15",
    });

    await handleEdit({
      changeType: "move",
      event,
      nextEndsAt: "2026-06-27",
      nextStartsAt: "2026-06-17",
      priorEndsAt: event.endsAt,
      priorStartsAt: event.startsAt,
    });

    expect(reviseMilestoneSchedule).not.toHaveBeenCalled();
  });

  test("dispatches legal schedule changes for draft proposal events", async () => {
    const workspace = buildProposalCalendarWorkspaceFromDetail({
      draws: [],
      milestones: [
        {
          dayEnd: 10,
          dayStart: 0,
          key: "foundation",
          name: "Foundation",
          order: 1,
        },
      ],
      proposal: {
        _id: "proposal-1",
        proposedStartDate: "2026-06-15",
        status: "draft",
      },
      submilestones: [],
    });
    const event = workspace.events.find(
      (candidate) => candidate.id === "proposal:milestone:foundation",
    );
    expect(event).toBeDefined();
    if (!event) {
      return;
    }
    const reviseMilestoneSchedule = vi.fn();
    const handleEdit = createProposalCalendarEditHandler({
      actions: { reviseMilestoneSchedule },
      baseDate: "2026-06-15",
    });

    await handleEdit({
      changeType: "move",
      event,
      nextEndsAt: "2026-06-27",
      nextStartsAt: "2026-06-17",
      priorEndsAt: event.endsAt,
      priorStartsAt: event.startsAt,
    });

    expect(reviseMilestoneSchedule).toHaveBeenCalledWith({
      dayEnd: 12,
      dayStart: 2,
      milestoneKey: "foundation",
      reason: undefined,
    });
  });
});
