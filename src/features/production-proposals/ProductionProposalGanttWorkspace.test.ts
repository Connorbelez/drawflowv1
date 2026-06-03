import { describe, expect, test } from "vitest";

import {
  applyGanttSubmilestoneMoves,
  deriveProposalDrawGroups,
  mapProposalGanttWorkspace,
  normalizeProposalDrawRows,
  proposalMilestonesToGanttSubmilestoneRows,
  proposalTimelineWorkspaceToGanttDraft,
  type ProposalGanttDrawDraft,
  type ProposalGanttMilestoneDraft,
} from "./ProductionProposalGanttWorkspace.tsx";

const milestones: ProposalGanttMilestoneDraft[] = [
  milestone("m1", "Milestone 1", 1, 0, 20, ["m1.1", "m1.2", "m1.3", "m1.4"]),
  milestone("m2", "Milestone 2", 2, 20, 40, ["m2.1", "m2.2", "m2.3"]),
  milestone("m3", "Milestone 3", 3, 40, 58, ["m3.1", "m3.2"]),
];

describe("ProductionProposalGanttWorkspace draw-group derivation", () => {
  test("projects gantt entries on a sub-milestone basis", () => {
    const rows = proposalMilestonesToGanttSubmilestoneRows(milestones);

    expect(rows.map((row) => row.id)).toEqual([
      "m1::m1.1",
      "m1::m1.2",
      "m1::m1.3",
      "m1::m1.4",
      "m2::m2.1",
      "m2::m2.2",
      "m2::m2.3",
      "m3::m3.1",
      "m3::m3.2",
    ]);
    expect(rows.slice(0, 4).map((row) => [row.dayStart, row.dayEnd])).toEqual([
      [0, 5],
      [5, 10],
      [10, 15],
      [15, 20],
    ]);
  });

  test("applies a released gantt drag to the targeted sub-milestone start and duration", () => {
    const [editedM1] = applyGanttSubmilestoneMoves(milestones, [
      {
        endAt: new Date(2026, 5, 8),
        milestoneId: "m1::m1.1",
        startAt: new Date(2026, 5, 1),
      },
    ]);

    expect(editedM1?.submilestones.map((submilestone) => ({
      durationDays: submilestone.durationDays,
      key: submilestone.key,
      startDay: submilestone.startDay,
    }))).toEqual([
      { durationDays: 7, key: "m1.1", startDay: 0 },
      { durationDays: 5, key: "m1.2", startDay: 5 },
      { durationDays: 5, key: "m1.3", startDay: 10 },
      { durationDays: 5, key: "m1.4", startDay: 15 },
    ]);
    expect(editedM1).toMatchObject({
      dayEnd: 20,
      dayStart: 0,
      durationDays: 20,
    });
  });

  test("expands the parent milestone when a moved sub-milestone ends beyond it", () => {
    const [editedM1] = applyGanttSubmilestoneMoves(milestones, [
      {
        endAt: new Date(2026, 6, 6),
        milestoneId: "m1::m1.2",
        startAt: new Date(2026, 6, 1),
      },
    ]);

    expect(
      editedM1?.submilestones.find((submilestone) => submilestone.key === "m1.2"),
    ).toMatchObject({
      durationDays: 5,
      startDay: 30,
    });
    expect(editedM1).toMatchObject({
      dayEnd: 35,
      dayStart: 0,
      durationDays: 35,
    });
  });

  test("groups ordered sub-milestones between draw availability points", () => {
    const draws: ProposalGanttDrawDraft[] = [
      {
        amountCents: 0,
        drawKey: "D1",
        label: "Draw 1",
        milestoneKey: "m2",
        timingDay: 40,
      },
      {
        amountCents: 0,
        drawKey: "D2",
        label: "Draw 2",
        milestoneKey: "m3",
        timingDay: 58,
      },
    ];

    const groups = deriveProposalDrawGroups({
      borrowerCoPayBps: 0,
      draws,
      milestones,
    });

    expect(groups).toHaveLength(2);
    expect(groups[0]?.draw.drawKey).toBe("D1");
    expect(groups[0]?.submilestones.map((item) => item.key)).toEqual([
      "m1.1",
      "m1.2",
      "m1.3",
      "m1.4",
      "m2.1",
      "m2.2",
      "m2.3",
    ]);
    expect(groups[1]?.draw.drawKey).toBe("D2");
    expect(groups[1]?.submilestones.map((item) => item.key)).toEqual([
      "m3.1",
      "m3.2",
    ]);
  });

  test("uses the planned draw date for Gantt draw markers", () => {
    const [group] = deriveProposalDrawGroups({
      borrowerCoPayBps: 0,
      draws: [
        {
          amountCents: 0,
          drawKey: "D1",
          label: "Draw 1",
          milestoneKey: "m2",
          timingDay: 45,
        },
      ],
      milestones: milestones.slice(0, 2),
    });

    const workspace = mapProposalGanttWorkspace({
      activePlanId: "cheapestFeasible",
      borrowerWorkingCapitalLimitCents: 50_000_00,
      buildName: "Proposal build",
      dependencies: [],
      drawGroups: group ? [group] : [],
      issues: [],
      lenderDrawPolicyLimitCents: 250_000_00,
      location: "Hamilton, ON",
      milestones: milestones.slice(0, 2),
      proposalStatus: "draft",
      role: "lenderAdmin",
      selectedMilestoneId: "",
    });

    expect(workspace.drawGroups[0]?.endAt.getTime()).toBe(
      new Date(2026, 5, 41).getTime(),
    );
    expect(workspace.drawGroups[0]?.plannedAt?.getTime()).toBe(
      new Date(2026, 5, 46).getTime(),
    );
    expect(workspace.drawGroups[0]?.eligibleAt.getTime()).toBe(
      new Date(2026, 5, 46).getTime(),
    );
  });

  test("normalizing draw rows keeps draw timing and amount synced to milestone edits", () => {
    const editedMilestones = milestones.map((item) =>
      item.key === "m2"
        ? {
            ...item,
            budgetCents: 250_000_00,
            dayEnd: 45,
            durationDays: 25,
          }
        : item,
    );

    const [draw] = normalizeProposalDrawRows({
      borrowerCoPayBps: 2_000,
      draws: [
        {
          amountCents: 0,
          drawKey: "D1",
          label: "Draw 1",
          milestoneKey: "m2",
          timingDay: 40,
        },
      ],
      milestones: editedMilestones,
    });

    expect(draw).toMatchObject({
      amountCents: 280_000_00,
      drawKey: "D1",
      milestoneKey: "m2",
      timingDay: 45,
    });
  });

  test("normalizing draw rows preserves custom planned draw dates", () => {
    const [draw] = normalizeProposalDrawRows({
      borrowerCoPayBps: 0,
      draws: [
        {
          amountCents: 0,
          customDate: true,
          drawKey: "D1",
          label: "Draw 1",
          milestoneKey: "m2",
          timingDay: 53,
        },
      ],
      milestones: milestones.slice(0, 2),
    });

    expect(draw).toMatchObject({
      customDate: true,
      drawKey: "D1",
      milestoneKey: "m2",
      timingDay: 53,
    });
  });

  test("normalizing draw rows preserves explicit positive draw amounts", () => {
    const [draw] = normalizeProposalDrawRows({
      borrowerCoPayBps: 0,
      draws: [
        {
          amountCents: 77_500_00,
          drawKey: "D1",
          label: "Draw 1",
          milestoneKey: "m2",
          timingDay: 40,
        },
      ],
      milestones: milestones.slice(0, 2),
    });

    expect(draw?.amountCents).toBe(77_500_00);
  });

  test("projects the production timeline workspace into derived Gantt draw groups", () => {
    const draft = proposalTimelineWorkspaceToGanttDraft({
      capitalEvents: [],
      draws: [
        {
          amountCents: 160_000_00,
          drawKey: "draw-01",
          itemMilestoneKey: "m2",
          label: "Draw 1",
          x: 40,
        },
        {
          amountCents: 80_000_00,
          drawKey: "draw-02",
          itemMilestoneKey: "m3",
          label: "Draw 2",
          x: 58,
        },
      ],
      milestones: milestones.map((item) => ({
        budgetCents: item.budgetCents,
        dependencyKeys: item.dependencyKeys,
        durationDays: item.durationDays,
        evidenceState: "Draft package",
        icon: item.icon ?? "foundation",
        milestoneKey: item.key,
        name: item.name,
        order: item.order,
        policyState: "Draft policy review",
        status: "upcoming",
        submilestoneSnapshot: item.submilestones,
        x: item.dayStart,
      })),
      plan: {
        borrowerCoPayBps: 2_000,
        currentDay: 0,
        progressValue: 0,
        rangeMax: 90,
        rangeMin: 0,
        routeState: { selectedPanelOpen: false, straightLine: true },
        startingCashCents: 40_000_00,
      },
      proposal: {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 40_000_00,
        buildName: "Proposal build",
        lenderDrawPolicyLimitCents: 240_000_00,
        location: "Hamilton, ON",
        status: "draft",
        totalBudgetCents: 300_000_00,
      },
    });

    expect(draft.draws.map((draw) => draw.milestoneKey)).toEqual(["m2", "m3"]);
    expect(
      deriveProposalDrawGroups({
        borrowerCoPayBps: draft.borrowerCoPayBps,
        draws: draft.draws,
        milestones: draft.milestones,
      }).map((group) => group.submilestones.map((item) => item.key)),
    ).toEqual([
      ["m1.1", "m1.2", "m1.3", "m1.4", "m2.1", "m2.2", "m2.3"],
      ["m3.1", "m3.2"],
    ]);
  });

  test("projects distinct sub-milestone names for every parent milestone", () => {
    const fourPlexMilestones: ProposalGanttMilestoneDraft[] = [
      fourPlexMilestone(
        "four-plex-draw-01",
        "Draw/Milestone 1 - Site prep & foundation",
        1,
        0,
        23,
        [
          "DC/ED",
          "PERMITS",
          "DRAWINGS",
          "DEMO EX",
          "TEMP FENCE",
          "TREE PROTECTION",
          "FOUNDATION",
        ],
      ),
      fourPlexMilestone(
        "four-plex-draw-02",
        "Draw/Milestone 2 - Underground, framing & roof",
        2,
        23,
        51,
        [
          "UNDERGROUND PIB",
          "FRAMING",
          "LUMBER",
          "CONCRETE",
          "WATER/SEWER",
          "ROOF FLAT/SHINGLES",
        ],
      ),
    ];

    const rows = proposalMilestonesToGanttSubmilestoneRows(fourPlexMilestones);
    const parentNames = new Set(fourPlexMilestones.map((item) => item.name));

    expect(rows).toHaveLength(13);
    expect(rows.map((row) => row.name)).not.toEqual(
      expect.arrayContaining([...parentNames]),
    );
    expect(rows.slice(7).map((row) => row.name)).toEqual([
      "UNDERGROUND PIB",
      "FRAMING",
      "LUMBER",
      "CONCRETE",
      "WATER/SEWER",
      "ROOF FLAT/SHINGLES",
    ]);

    const [group] = deriveProposalDrawGroups({
      borrowerCoPayBps: 0,
      draws: [
        {
          amountCents: 0,
          drawKey: "D1",
          label: "Draw 1",
          milestoneKey: "four-plex-draw-02",
          timingDay: 51,
        },
      ],
      milestones: fourPlexMilestones,
    });

    const workspace = mapProposalGanttWorkspace({
      activePlanId: "cheapestFeasible",
      borrowerWorkingCapitalLimitCents: 50_000_00,
      buildName: "4-plex proposal",
      dependencies: [],
      drawGroups: group ? [group] : [],
      issues: [],
      lenderDrawPolicyLimitCents: 250_000_00,
      location: "Hamilton, ON",
      milestones: fourPlexMilestones,
      proposalStatus: "draft",
      role: "builderLead",
      selectedMilestoneId: "",
    });

    for (const ganttMilestone of workspace.milestones) {
      expect(parentNames.has(ganttMilestone.name)).toBe(false);
      expect(ganttMilestone.code.length).toBeGreaterThan(0);
    }
  });
});

function fourPlexMilestone(
  key: string,
  name: string,
  order: number,
  dayStart: number,
  dayEnd: number,
  submilestoneNames: string[],
): ProposalGanttMilestoneDraft {
  return {
    budgetCents: order * 100_000_00,
    dayEnd,
    dayStart,
    dependencyKeys: order === 1 ? [] : [`four-plex-draw-0${order - 1}`],
    durationDays: Math.max(1, dayEnd - dayStart),
    key,
    name,
    order,
    submilestones: submilestoneNames.map((submilestoneName, index) => ({
      key: `${key}-${submilestoneName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`,
      name: submilestoneName,
      order: index + 1,
    })),
  };
}

function milestone(
  key: string,
  name: string,
  order: number,
  dayStart: number,
  dayEnd: number,
  submilestoneKeys: string[],
): ProposalGanttMilestoneDraft {
  return {
    budgetCents: order * 100_000_00,
    dayEnd,
    dayStart,
    dependencyKeys: [],
    durationDays: Math.max(1, dayEnd - dayStart),
    key,
    name,
    order,
    submilestones: submilestoneKeys.map((submilestoneKey, index) => ({
      key: submilestoneKey,
      name: submilestoneKey,
      order: index + 1,
    })),
  };
}
