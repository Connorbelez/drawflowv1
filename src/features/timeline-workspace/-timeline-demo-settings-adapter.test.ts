import { describe, expect, test } from "vitest";

import { emptyDocument } from "#/features/build-collaboration/model.ts";
import {
  buildCashflowPreview,
  buildDrawsFromActiveScenario,
  buildTimelineSetupTemplatesFromSettings,
  buildTimelineItemsFromSettings,
  createBlankScenario,
  createCustomMilestone,
  formatBps,
  includedPocTotalBps,
  normalizeTimelineSettingsProjection,
  scenarioDrawTotalBps,
  validateScenarioDrafts,
  validateTemplateDraft,
} from "./-timeline-demo-settings-adapter.ts";

const projection = {
  templates: [
    {
      description: "Template",
      isDefault: true,
      milestones: [
        {
          dependencyKeys: [],
          durationDays: 10,
          icon: "foundation",
          included: true,
          milestoneKey: "foundation",
          name: "Foundation",
          order: 0,
          percentageBps: 5000,
          templateKey: "full",
          type: "foundation",
        },
        {
          dependencyKeys: [],
          durationDays: 12,
          icon: "framing",
          included: true,
          milestoneKey: "framing",
          name: "Framing",
          order: 1,
          percentageBps: 5000,
          templateKey: "full",
          type: "framing",
        },
      ],
      scenarios: [
        {
          description: "Standard",
          draws: [
            {
              amountBps: 4000,
              drawKey: "draw-01",
              label: "Draw 01",
              order: 0,
              reviewNote: "Foundation complete",
              scenarioKey: "standard",
              templateKey: "full",
              timingDay: 12,
            },
            {
              amountBps: 6000,
              drawKey: "draw-02",
              label: "Draw 02",
              order: 1,
              reviewNote: "Framing complete",
              scenarioKey: "standard",
              templateKey: "full",
              timingDay: 13,
            },
          ],
          isActive: true,
          isDefault: true,
          name: "Standard",
          scenarioKey: "standard",
          sortOrder: 0,
          templateKey: "full",
        },
      ],
      submilestones: [
        {
          fieldGuidance: {
            cameraAnglesTiptapJson: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Excavation camera"}]}]}',
            whatToVerifyTiptapJson: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Excavation verification"}]}]}',
          },
          description: "Excavation",
          durationDays: 5,
          milestoneKey: "foundation",
          name: "Excavation",
          order: 0,
          percentageBps: 2500,
          scopeOfWorkTiptapJson: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Excavate and grade"}]}]}',
          submilestoneKey: "foundation-excavation",
          templateKey: "full",
        },
        {
          description: "Walls",
          durationDays: 6,
          milestoneKey: "framing",
          name: "Walls",
          order: 0,
          percentageBps: 3000,
          submilestoneKey: "framing-walls",
          templateKey: "full",
        },
      ],
      summary: "2 milestones",
      templateKey: "full",
      title: "Full Build",
    },
  ],
};

describe("timeline demo settings adapter", () => {
  test("normalizes projection, validates PoC and scenario totals", () => {
    const [template] = normalizeTimelineSettingsProjection(projection);

    expect(template.title).toBe("Full Build");
    expect(template.milestones[0]?.submilestones[0]?.name).toBe("Excavation");
    expect(template.milestones[0]?.submilestones[0]).toMatchObject({
      fieldGuidance: {
        cameraAnglesTiptapJson:
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Excavation camera"}]}]}',
        whatToVerifyTiptapJson:
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Excavation verification"}]}]}',
      },
      scopeOfWorkTiptapJson:
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Excavate and grade"}]}]}',
    });
    expect(
      buildTimelineSetupTemplatesFromSettings([template])[0]?.rows[0]
        ?.subMilestoneDetails?.[0]
    ).toMatchObject({
      fieldGuidance: {
        cameraAnglesTiptapJson:
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Excavation camera"}]}]}',
        whatToVerifyTiptapJson:
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Excavation verification"}]}]}',
      },
      scopeOfWorkTiptapJson:
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Excavate and grade"}]}]}',
    });
    expect(includedPocTotalBps(template)).toBe(10_000);
    expect(scenarioDrawTotalBps(template.scenarios[0])).toBe(10_000);
    expect(formatBps(10_000)).toBe("100.00%");
    expect(validateTemplateDraft(template).ok).toBe(true);
    expect(validateScenarioDrafts(template.scenarios, template).ok).toBe(true);
  });

  test("normalizes partial guidance with canonical empty TipTap siblings", () => {
    const sourceTemplate = projection.templates[0];
    const sourceMilestone = sourceTemplate.milestones[0];
    const sourceSubmilestone = sourceTemplate.submilestones[0];
    const whatToVerifyTiptapJson =
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Verify the excavation depth."}]}]}';
    const cameraAnglesTiptapJson =
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Capture the north elevation."}]}]}';
    const emptyTiptapJson = JSON.stringify(emptyDocument());

    const [template] = normalizeTimelineSettingsProjection({
      templates: [
        {
          ...sourceTemplate,
          milestones: [
            {
              ...sourceMilestone,
              submilestones: [
                {
                  ...sourceSubmilestone,
                  fieldGuidance: {
                    cameraAnglesTiptapJson: "",
                    whatToVerifyTiptapJson,
                  },
                  order: 0,
                },
                {
                  ...sourceSubmilestone,
                  fieldGuidance: { cameraAnglesTiptapJson },
                  order: 1,
                  submilestoneKey: "foundation-camera-only",
                },
                {
                  ...sourceSubmilestone,
                  fieldGuidance: {},
                  order: 2,
                  submilestoneKey: "foundation-empty-guidance",
                },
                {
                  ...sourceSubmilestone,
                  fieldGuidance: undefined,
                  order: 3,
                  submilestoneKey: "foundation-no-guidance",
                },
              ],
            },
          ],
          submilestones: [],
        },
      ],
    });
    const submilestones = template.milestones[0]?.submilestones ?? [];

    expect(submilestones[0]?.fieldGuidance).toEqual({
      cameraAnglesTiptapJson: emptyTiptapJson,
      whatToVerifyTiptapJson,
    });
    expect(submilestones[1]?.fieldGuidance).toEqual({
      cameraAnglesTiptapJson,
      whatToVerifyTiptapJson: emptyTiptapJson,
    });
    expect(submilestones[2]?.fieldGuidance).toBeUndefined();
    expect(submilestones[3]).not.toHaveProperty("fieldGuidance");
  });

  test("converts active settings into timeline items and draw markers", () => {
    const [template] = normalizeTimelineSettingsProjection(projection);
    const items = buildTimelineItemsFromSettings(template, 1_000_000_00);
    const draws = buildDrawsFromActiveScenario(template, items, 800_000_00);

    expect(items.map((item) => item.data?.amount)).toEqual([500_000, 500_000]);
    expect(items[0]?.data?.subMilestones).toEqual(["Excavation"]);
    expect(draws).toMatchObject([
      { amount: 320_000, customDate: true, label: "Draw 01", x: 12 },
      { amount: 480_000, customDate: true, label: "Draw 02", x: 13 },
    ]);
    expect(draws.every((draw) => draw.itemId === undefined)).toBe(true);
  });

  test("tracks dirty-state helpers and zero-starting-cash preview assumptions", () => {
    const [template] = normalizeTimelineSettingsProjection(projection);
    const blankScenario = createBlankScenario(template.scenarios, template);
    const customMilestone = createCustomMilestone(
      "Solar readiness",
      template.milestones,
    );
    const preview = buildCashflowPreview(template, template.scenarios[0]);

    expect(blankScenario.isActive).toBe(false);
    expect(blankScenario.draws[0]?.timingDay).toBe(12);
    expect(customMilestone.milestoneKey).toBe("custom-solar-readiness");
    expect(preview[0]?.cashOnHandBps).toBeLessThan(0);
  });

  test("blocks invalid totals", () => {
    const [template] = normalizeTimelineSettingsProjection(projection);
    const invalidTemplate = {
      ...template,
      milestones: template.milestones.map((row, index) =>
        index === 0 ? { ...row, percentageBps: row.percentageBps - 1 } : row,
      ),
    };
    const invalidScenario = {
      ...template.scenarios[0],
      draws: template.scenarios[0].draws.map((row, index) =>
        index === 0 ? { ...row, amountBps: row.amountBps - 1 } : row,
      ),
    };

    expect(validateTemplateDraft(invalidTemplate).ok).toBe(false);
    expect(validateScenarioDrafts([invalidScenario]).ok).toBe(false);
  });

  test("allows draws inside milestone windows", () => {
    const [template] = normalizeTimelineSettingsProjection(projection);
    const inMilestoneScenario = {
      ...template.scenarios[0],
      draws: template.scenarios[0].draws.map((row, index) =>
        index === 0 ? { ...row, timingDay: 9 } : row,
      ),
    };

    expect(validateScenarioDrafts([inMilestoneScenario], template).ok).toBe(
      true,
    );
  });

  test("allows draws in the final closeout handoff window", () => {
    const [template] = normalizeTimelineSettingsProjection(projection);
    const finalWindowScenario = {
      ...template.scenarios[0],
      draws: template.scenarios[0].draws.map((row, index) =>
        index === 0 ? { ...row, timingDay: 11 } : { ...row, timingDay: 28 },
      ),
    };

    expect(validateScenarioDrafts([finalWindowScenario], template).ok).toBe(
      true,
    );
  });
});
