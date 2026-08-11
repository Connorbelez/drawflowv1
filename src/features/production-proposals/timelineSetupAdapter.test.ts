import { describe, expect, test } from "vitest";

import {
  buildTimelineItemsFromSetupRows,
  buildTimelineSetupScenarioDraws,
  createRowsFromTemplate,
  selectTimelineSetupScenario,
  type TimelineSetupTemplate,
} from "#/features/timeline-workspace/-TimelineSetupFlow.tsx";
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
        scenarios: [
          {
            draws: [
              {
                amountBps: 3_000,
                drawKey: "draw-a",
                label: "Draw A",
                order: 0,
                timingDay: 32,
              },
              {
                amountBps: 7_000,
                drawKey: "draw-b",
                label: "Draw B",
                order: 1,
                timingDay: 60,
              },
            ],
            isActive: true,
            isDefault: true,
            scenarioKey: "standard",
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
      scenarios: [
        {
          draws: [
            {
              amountBps: 3_000,
              drawKey: "draw-a",
              label: "Draw A",
              order: 0,
              timingDay: 32,
            },
            {
              amountBps: 7_000,
              drawKey: "draw-b",
              label: "Draw B",
              order: 1,
              timingDay: 60,
            },
          ],
          isActive: true,
          isDefault: true,
          scenarioKey: "standard",
        },
      ],
      templateKey: "single-family-full-build",
    });
  });

  test("preserves canonical Scope and Field Guidance when projecting templates", () => {
    const scopeOfWorkTiptapJson = '{"type":"doc","content":[]}';
    const fieldGuidance = {
      cameraAnglesTiptapJson: '{"type":"doc","content":[]} ',
      whatToVerifyTiptapJson: '{"type":"doc","content":[]}\n',
    };

    const templates = productionTemplatesToTimelineSetupTemplates([
      {
        milestones: [
          {
            durationDays: 7,
            key: "foundation",
            name: "Foundation",
            order: 1,
            percentageBps: 10_000,
            submilestones: [
              {
                fieldGuidance,
                key: "footings",
                name: "Footings",
                scopeOfWorkTiptapJson,
              },
            ],
          },
        ],
        templateKey: "scope-guidance-template",
        title: "Scope Guidance",
      },
    ]);

    expect(templates?.[0]?.rows[0]?.subMilestoneDetails).toEqual([
      {
        durationDays: undefined,
        fieldGuidance,
        key: "footings",
        name: "Footings",
        order: undefined,
        percentageBps: undefined,
        scopeOfWorkTiptapJson,
      },
    ]);
  });

  test("keeps canonical Scope and Field Guidance on generated timeline items", () => {
    const scopeOfWorkTiptapJson = '{"type":"doc","content":[]}';
    const fieldGuidance = {
      cameraAnglesTiptapJson: '{"type":"doc","content":[]} ',
      whatToVerifyTiptapJson: '{"type":"doc","content":[]}\n',
    };
    const template: TimelineSetupTemplate = {
      description: "Scope and guidance",
      rows: [
        {
          dependencyKeys: [],
          durationDays: 7,
          icon: "foundation",
          key: "foundation",
          name: "Foundation",
          percentageBps: 10_000,
          subMilestoneDetails: [
            {
              fieldGuidance,
              key: "footings",
              name: "Footings",
              scopeOfWorkTiptapJson,
            },
          ],
          subMilestones: ["Footings"],
          type: "foundation",
        },
      ],
      summary: "Scope and guidance",
      templateKey: "scope-guidance",
      title: "Scope and guidance",
    };
    const rows = createRowsFromTemplate(template, 100_000_00);
    const items = buildTimelineItemsFromSetupRows(rows);

    expect(items[0]?.data.submilestoneDetails?.[0]).toMatchObject({
      fieldGuidance,
      scopeOfWorkTiptapJson,
    });
  });

  test("carries Scope and Field Guidance as separate exact TipTap payloads", () => {
    const scopeOfWorkTiptapJson =
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Scope \\u2014 preserve bytes"}]}]}';
    const fieldGuidance = {
      cameraAnglesTiptapJson:
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Camera angle"}]}]}',
      whatToVerifyTiptapJson:
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Verify field condition"}]}]}',
    };

    const payload = timelineSetupResultToDraftPackage({
      activeItemId: "foundation",
      borrowerCoPayBps: 2_000,
      borrowerCoPayCents: 20_000_00,
      contractorAssignments: [],
      costItems: [],
      currentDay: 0,
      includedCount: 1,
      items: [
        {
          data: {
            amount: 100_000,
            draw: "Draw 1",
            durationDays: 10,
            evidence: "Ready",
            icon: "foundation",
            name: "Foundation",
            policy: "Planning",
            status: "ready",
            subMilestones: ["Footings"],
            submilestoneDetails: [
              {
                budgetCents: 100_000_00,
                description: "Legacy shared description must not leak",
                durationDays: 10,
                fieldGuidance,
                key: "footings",
                name: "Footings",
                order: 1,
                scopeOfWorkTiptapJson,
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
      ],
      permitFiles: [],
      projectAddress: "Hamilton, ON",
      proposedStartDate: "2025-04-15",
      redirectToDurableRoute: true,
      reimbursableBudgetCents: 80_000_00,
      reimbursementBps: 8_000,
      startingCash: 400_000,
      templateKey: "single-family-full-build",
      templateTitle: "Single Family Full Build",
      totalBudget: 100_000,
    });

    expect(payload.milestones[0]?.submilestones).toEqual([
      {
        budgetCents: 100_000_00,
        durationDays: 10,
        fieldGuidance,
        key: "footings",
        name: "Footings",
        order: 1,
        scopeOfWorkTiptapJson,
      },
    ]);
    expect(payload.milestones[0]?.submilestones[0]).not.toHaveProperty(
      "description"
    );
  });

  test("generates active saved scenario draw rows instead of milestone fallback draws", () => {
    const template: TimelineSetupTemplate = {
      description: "Multiplex",
      rows: [
        setupPreset("m1", "Milestone 1", 2_500, 10),
        setupPreset("m2", "Milestone 2", 2_500, 10),
        setupPreset("m3", "Milestone 3", 2_500, 10),
        setupPreset("m4", "Milestone 4", 2_500, 10),
      ],
      scenarios: [
        {
          draws: [
            scenarioDraw("draw-01", 3_000, 10),
            scenarioDraw("draw-02", 3_000, 25),
            scenarioDraw("draw-03", 4_000, 55),
          ],
          isActive: true,
          isDefault: true,
          scenarioKey: "three-draw",
        },
      ],
      summary: "4 milestones",
      templateKey: "multiplex-build",
      title: "Multiplex Build",
    };
    const rows = createRowsFromTemplate(template, 1_000_000_00);
    const items = buildTimelineItemsFromSetupRows(rows, 2_000);
    const draws = buildTimelineSetupScenarioDraws({
      budgetCents: 1_000_000_00,
      items,
      scenario: selectTimelineSetupScenario(template),
      startingCashCents: 400_000_00,
    });

    const payload = timelineSetupResultToDraftPackage({
      activeItemId: items[0]?.id ?? "",
      borrowerCoPayBps: 2_000,
      borrowerCoPayCents: 200_000_00,
      contractorAssignments: [],
      costItems: [],
      currentDay: 0,
      draws,
      includedCount: items.length,
      items,
      permitFiles: [],
      projectAddress: "Hamilton, ON",
      redirectToDurableRoute: true,
      reimbursableBudgetCents: 800_000_00,
      reimbursementBps: 8_000,
      startingCash: 400_000,
      templateKey: "multiplex-build",
      templateTitle: "Multiplex Build",
      totalBudget: 1_000_000,
    });

    expect(payload.draws?.map((draw) => draw.drawKey)).toEqual([
      "draw-01",
      "draw-02",
      "draw-03",
    ]);
    expect(payload.draws).toHaveLength(3);
  });

  test("keeps scenario draws within reimbursement capacity instead of repairing borrower cash shortfalls", () => {
    const template: TimelineSetupTemplate = {
      description: "Cash constrained",
      rows: [
        setupPreset("m1", "Milestone 1", 2_500, 10),
        setupPreset("m2", "Milestone 2", 2_500, 10),
        setupPreset("m3", "Milestone 3", 2_500, 10),
        setupPreset("m4", "Milestone 4", 2_500, 10),
      ],
      scenarios: [
        {
          draws: [
            scenarioDraw("draw-01", 1_000, 10),
            scenarioDraw("draw-02", 1_000, 25),
            scenarioDraw("draw-03", 1_000, 55),
          ],
          isActive: true,
          scenarioKey: "low-draws",
        },
      ],
      summary: "4 milestones",
      templateKey: "cash-constrained",
      title: "Cash constrained",
    };
    const rows = createRowsFromTemplate(template, 1_000_000_00);
    const items = buildTimelineItemsFromSetupRows(rows, 2_000);
    const draws = buildTimelineSetupScenarioDraws({
      budgetCents: 1_000_000_00,
      items,
      scenario: selectTimelineSetupScenario(template),
      startingCashCents: 250_000_00,
    });

    expect(draws?.map((draw) => draw.amountCents)).toEqual([
      80_000_00,
      80_000_00,
      80_000_00,
    ]);
    expect(
      draws?.reduce((total, draw) => total + draw.amountCents, 0)
    ).toBeLessThanOrEqual(800_000_00);
  });

  test("fits single-family template draws within completed-work eligibility at 70% LTV", () => {
    const template: TimelineSetupTemplate = {
      description: "Ground-up single family",
      rows: [
        setupPreset("site-prep", "Site prep & foundation", 1_000, 14),
        setupPreset("framing", "Framing & structure", 1_280, 18),
        setupPreset("rough-in", "Rough-in mechanical", 1_960, 20),
        setupPreset("exterior", "Windows & exterior", 1_680, 18),
        setupPreset("drywall", "Inspections & drywall", 1_520, 16),
        setupPreset("finishes", "Finishes & fixtures", 1_280, 12),
        setupPreset("closeout", "Final inspection & closeout", 1_280, 4),
      ],
      scenarios: [
        {
          draws: [
            scenarioDraw("draw-01", 2_000, 16),
            scenarioDraw("draw-02", 2_500, 39),
            scenarioDraw("draw-03", 2_500, 64),
            scenarioDraw("draw-04", 2_000, 108),
            scenarioDraw("draw-05", 1_000, 125),
          ],
          isActive: true,
          isDefault: true,
          scenarioKey: "standard-reimbursement",
        },
      ],
      summary: "7 milestones",
      templateKey: "single-family-full-build",
      title: "Single Family Full Build",
    };
    const budgetCents = 675_000_00;
    const borrowerCoPayBps = 3_000;
    const rows = createRowsFromTemplate(template, budgetCents);
    const items = buildTimelineItemsFromSetupRows(rows, borrowerCoPayBps);
    const draws = buildTimelineSetupScenarioDraws({
      budgetCents,
      items,
      scenario: selectTimelineSetupScenario(template),
      startingCashCents: 400_000_00,
    });
    const payload = timelineSetupResultToDraftPackage({
      activeItemId: items[0]?.id ?? "",
      borrowerCoPayBps,
      borrowerCoPayCents: Math.round((budgetCents * borrowerCoPayBps) / 10_000),
      contractorAssignments: [],
      costItems: [],
      currentDay: 0,
      draws,
      includedCount: items.length,
      items,
      permitFiles: [],
      projectAddress: "Hamilton, ON",
      redirectToDurableRoute: true,
      reimbursableBudgetCents: Math.round(
        (budgetCents * (10_000 - borrowerCoPayBps)) / 10_000
      ),
      reimbursementBps: 10_000 - borrowerCoPayBps,
      startingCash: 400_000,
      templateKey: "single-family-full-build",
      templateTitle: "Single Family Full Build",
      totalBudget: 675_000,
    });

    expect(draws?.length).toBe(5);
    let cumulativePlanned = 0;
    for (const draw of [...(payload.draws ?? [])].sort(
      (left, right) =>
        left.timingDay - right.timingDay ||
        (left.order ?? 0) - (right.order ?? 0)
    )) {
      cumulativePlanned += draw.amountCents;
      const cumulativeEligible = payload.milestones.reduce(
        (total, milestone) =>
          milestone.dayEnd <= draw.timingDay
            ? total +
              Math.round(
                (milestone.budgetCents * (10_000 - borrowerCoPayBps)) / 10_000
              )
            : total,
        0
      );
      expect(cumulativePlanned).toBeLessThanOrEqual(cumulativeEligible);
    }
    expect(
      (payload.draws ?? []).reduce((total, draw) => total + draw.amountCents, 0)
    ).toBe(payload.lenderDrawPolicyLimitCents);
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
                description: "Excavate and install engineered footing forms.",
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
      borrowerStartingCashCents: 40_000_000,
      buildName: "Single Family Full Build Proposal",
      lenderDrawPolicyLimitCents: 100_000_000,
      location: "Hamilton, ON",
      proposedStartDate: "2025-04-15",
    });
    expect(payload).not.toHaveProperty("borrowerWorkingCapitalLimitCents");
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

function setupPreset(
  key: string,
  name: string,
  percentageBps: number,
  durationDays: number
) {
  return {
    dependencyKeys: [],
    durationDays,
    icon: "foundation" as const,
    key,
    name,
    percentageBps,
    subMilestones: [name],
    type: "foundation",
  };
}

function scenarioDraw(drawKey: string, amountBps: number, timingDay: number) {
  return {
    amountBps,
    drawKey,
    label: drawKey,
    timingDay,
  };
}
