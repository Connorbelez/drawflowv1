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
        dependencyKeys: ["foundation"],
        icon: "framing",
        key: "shell",
      }),
    ]);
  });
});
