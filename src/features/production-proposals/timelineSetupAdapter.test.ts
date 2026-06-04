import { describe, expect, test } from "vitest";

import {
  productionTemplatesToTimelineSetupTemplates,
  timelineSetupResultToDraftPackage,
} from "./timelineSetupAdapter";

describe("production proposal timeline setup adapter", () => {
  test("maps production proposal templates to the reused timeline setup surface", () => {
    const templates = productionTemplatesToTimelineSetupTemplates([
      {
        isDefault: true,
        milestones: [
          {
            archetypeKey: "foundation",
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            percentageBps: 2_500,
            submilestones: [
              {
                durationDays: 12,
                key: "forms",
                name: "Forms and pour",
                order: 1,
                percentageBps: 1_200,
              },
            ],
          },
        ],
        summary: "Seed template",
        templateKey: "single-family-full-build",
        title: "Single Family Full Build",
      },
    ]);

    expect(templates?.[0]).toMatchObject({
      isDefault: true,
      rows: [
        {
          icon: "foundation",
          key: "foundation",
          subMilestoneDetails: [
            {
              durationDays: 12,
              key: "forms",
              name: "Forms and pour",
              order: 1,
              percentageBps: 1_200,
            },
          ],
          subMilestones: ["Forms and pour"],
        },
      ],
      templateKey: "single-family-full-build",
    });
  });

  test("maps richer production milestone names to the expanded icon set", () => {
    const templates = productionTemplatesToTimelineSetupTemplates([
      {
        milestones: [
          {
            archetypeKey: "shell",
            dependencyKeys: [],
            durationDays: 18,
            key: "roof-dry-in",
            name: "Roofing and dry-in",
            order: 1,
            percentageBps: 2_000,
          },
          {
            archetypeKey: "mechanical",
            dependencyKeys: ["roof-dry-in"],
            durationDays: 14,
            key: "rough-in",
            name: "MEP rough-in",
            order: 2,
            percentageBps: 3_000,
          },
          {
            archetypeKey: "interior",
            dependencyKeys: ["rough-in"],
            durationDays: 12,
            key: "kitchen-cabinets",
            name: "Kitchen cabinets",
            order: 3,
            percentageBps: 5_000,
          },
        ],
        templateKey: "expanded-icons",
        title: "Expanded icons",
      },
    ]);

    expect(templates?.[0]?.rows.map((row) => row.icon)).toEqual([
      "roofing",
      "plumbing",
      "kitchen",
    ]);
  });

  test("converts generated timeline setup rows into production draft package fields", () => {
    const payload = timelineSetupResultToDraftPackage({
      activeItemId: "foundation",
      borrowerCoPayBps: 2_000,
      borrowerCoPayCents: 25_000_000,
      currentDay: 0,
      includedCount: 2,
      items: [
        {
          data: {
            amount: 300_000,
            draw: "Draw 1",
            durationDays: 30,
            evidence: "Ready",
            icon: "foundation",
            name: "Foundation",
            policy: "Planning",
            status: "ready",
            subMilestones: ["Forms"],
            submilestoneDetails: [
              {
                budgetCents: 100_000_00,
                durationDays: 10,
                key: "forms",
                name: "Forms",
                order: 1,
              },
            ],
          },
          eyebrow: "Milestone 1",
          id: "foundation",
          label: "Foundation",
          markerLabel: "1",
          tone: "active",
          x: 0,
        },
        {
          data: {
            amount: 450_000,
            draw: "Draw 2",
            durationDays: 45,
            evidence: "Upcoming",
            icon: "framing",
            name: "Shell",
            policy: "Upcoming",
            status: "upcoming",
            subMilestones: [],
          },
          eyebrow: "Milestone 2",
          id: "shell",
          label: "Shell",
          markerLabel: "2",
          tone: "upcoming",
          x: 35,
        },
      ],
      projectAddress: "Hamilton, ON",
      proposedStartDate: "2025-04-15",
      redirectToDurableRoute: true,
      reimbursableBudgetCents: 100_000_000,
      reimbursementBps: 8_000,
      startingCash: 400_000,
      templateKey: "single-family-full-build",
      templateTitle: "Single Family Full Build",
      totalBudget: 750_000,
    });

    expect(payload).toMatchObject({
      borrowerCoPayBps: 2_000,
      borrowerWorkingCapitalLimitCents: 40_000_000,
      buildName: "Single Family Full Build Proposal",
      lenderDrawPolicyLimitCents: 100_000_000,
      location: "Hamilton, ON",
      proposedStartDate: "2025-04-15",
    });
    expect(payload.milestones).toEqual([
      expect.objectContaining({
        budgetCents: 30_000_000,
        dayEnd: 30,
        dayStart: 0,
        dependencyKeys: [],
        icon: "foundation",
        key: "foundation",
        submilestones: [
          {
            budgetCents: 100_000_00,
            durationDays: 10,
            key: "forms",
            name: "Forms",
            order: 1,
          },
        ],
      }),
      expect.objectContaining({
        budgetCents: 45_000_000,
        dayEnd: 80,
        dayStart: 35,
        dependencyKeys: [],
        icon: "framing",
        key: "shell",
      }),
    ]);
  });

  test("preserves parallel milestone offsets without implicit row-order dependencies", () => {
    const payload = timelineSetupResultToDraftPackage({
      activeItemId: "foundation",
      borrowerCoPayBps: 2_000,
      borrowerCoPayCents: 25_000_000,
      currentDay: 0,
      includedCount: 2,
      items: [
        {
          data: {
            amount: 300_000,
            draw: "Draw 1",
            durationDays: 30,
            evidence: "Ready",
            icon: "foundation",
            name: "Foundation",
            policy: "Planning",
            status: "ready",
            subMilestones: [],
          },
          eyebrow: "Milestone 1",
          id: "foundation",
          label: "Foundation",
          markerLabel: "1",
          tone: "active",
          x: 0,
        },
        {
          data: {
            amount: 450_000,
            draw: "Draw 2",
            durationDays: 30,
            evidence: "Upcoming",
            icon: "framing",
            name: "Framing",
            policy: "Upcoming",
            status: "upcoming",
            subMilestones: [],
          },
          eyebrow: "Milestone 2",
          id: "framing",
          label: "Framing",
          markerLabel: "2",
          tone: "upcoming",
          x: 5,
        },
      ],
      projectAddress: "Hamilton, ON",
      proposedStartDate: "2025-04-15",
      redirectToDurableRoute: true,
      reimbursableBudgetCents: 100_000_000,
      reimbursementBps: 8_000,
      startingCash: 400_000,
      templateKey: "parallel-build",
      templateTitle: "Parallel Build",
      totalBudget: 750_000,
    });

    expect(
      payload.milestones.map((milestone) => ({
        dayEnd: milestone.dayEnd,
        dayStart: milestone.dayStart,
        dependencyKeys: milestone.dependencyKeys,
        key: milestone.key,
      })),
    ).toEqual([
      {
        dayEnd: 30,
        dayStart: 0,
        dependencyKeys: [],
        key: "foundation",
      },
      {
        dayEnd: 35,
        dayStart: 5,
        dependencyKeys: [],
        key: "framing",
      },
    ]);
  });

  test("resolves sub-milestones from subMilestones when submilestoneDetails is missing", () => {
    const payload = timelineSetupResultToDraftPackage({
      activeItemId: "four-plex-draw-01",
      borrowerCoPayBps: 2_000,
      borrowerCoPayCents: 25_000_000,
      currentDay: 0,
      includedCount: 2,
      items: [
        {
          data: {
            amount: 300_000,
            draw: "Draw 1",
            durationDays: 30,
            evidence: "Ready",
            icon: "foundation",
            name: "Draw/Milestone 1",
            policy: "Planning",
            status: "ready",
            subMilestones: ["DC/ED", "PERMITS"],
            submilestoneDetails: [
              {
                budgetCents: 100_000_00,
                durationDays: 10,
                key: "dc-ed",
                name: "DC/ED",
                order: 1,
              },
              {
                budgetCents: 50_000_00,
                durationDays: 5,
                key: "permits",
                name: "PERMITS",
                order: 2,
              },
            ],
          },
          eyebrow: "Milestone 1",
          id: "four-plex-draw-01",
          label: "Draw/Milestone 1",
          markerLabel: "1",
          tone: "active",
          x: 0,
        },
        {
          data: {
            amount: 450_000,
            draw: "Draw 2",
            durationDays: 28,
            evidence: "Upcoming",
            icon: "framing",
            name: "Draw/Milestone 2 - Underground, framing & roof",
            policy: "Upcoming",
            status: "upcoming",
            subMilestones: ["UNDERGROUND PIB", "FRAMING"],
          },
          eyebrow: "Milestone 2",
          id: "four-plex-draw-02",
          label: "Draw/Milestone 2",
          markerLabel: "2",
          tone: "upcoming",
          x: 35,
        },
      ],
      projectAddress: "Hamilton, ON",
      redirectToDurableRoute: true,
      reimbursableBudgetCents: 100_000_000,
      reimbursementBps: 8_000,
      startingCash: 400_000,
      templateKey: "4-plex",
      templateTitle: "4-plex",
      totalBudget: 750_000,
    });

    expect(payload.milestones[1]?.submilestones).toEqual([
      {
        key: "four-plex-draw-02-sub-01",
        name: "UNDERGROUND PIB",
        order: 1,
      },
      {
        key: "four-plex-draw-02-sub-02",
        name: "FRAMING",
        order: 2,
      },
    ]);
  });
});
