/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import { MOCK_BUILDER_PERSONA, MOCK_STAFF_PERSONA } from "./demo_personas";
import { coerceGuidanceField } from "./demo_site_visit_guidance";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("timeline demo settings Convex functions", () => {
  test("seed defaults replaces existing timeline settings with canonical rows", async () => {
    const t = convexTest(schema, modules);

    const first = await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});
    const seeded = await t.query(api.demo_settings.getTimelineDemoSettings, {});
    const template = seeded.templates.find(
      (row: any) => row.templateKey === "single_family_full_build"
    );

    expect(first.templates).toBe(3);
    expect(first.personas).toBe(2);
    expect(first.settings.templates).toHaveLength(3);
    expectDefaultDrawTimings(first.settings.templates);
    expect(template.milestones).toHaveLength(7);
    expect(template.status.totalPocBps).toBe(10_000);
    expect(template.activeScenarioName).toBe("Standard reimbursement");
    expect(template.guidanceItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "whatToVerify",
          milestoneKey: "framing",
          text: expect.stringContaining("load-bearing walls"),
        }),
        expect.objectContaining({
          kind: "cameraAngle",
          milestoneKey: "framing",
          text: expect.stringContaining("Wide shot"),
        }),
      ])
    );
    expectDefaultTimingRules(seeded.templates);
    expectDefaultDrawTimings(seeded.templates);

    const editedMilestones = template.milestones.map((row: any) => ({
      dependencyKeys: row.dependencyKeys,
      durationDays: row.durationDays,
      icon: row.icon,
      included: row.included,
      milestoneKey: row.milestoneKey,
      name:
        row.milestoneKey === "site-prep"
          ? "Edited site prep & foundation"
          : row.name,
      order: row.order,
      percentageBps: row.percentageBps,
      submilestones: template.submilestones
        .filter((subRow: any) => subRow.milestoneKey === row.milestoneKey)
        .map((subRow: any) => ({
          description: subRow.description,
          durationDays: subRow.durationDays,
          name: subRow.name,
          order: subRow.order,
          percentageBps: subRow.percentageBps,
          submilestoneKey: subRow.submilestoneKey,
        })),
      type: row.type,
    }));

    await t.mutation(api.demo_settings.saveTimelineTemplateWorksheet, {
      milestones: editedMilestones,
      templateKey: template.templateKey,
    });
    await t.mutation(api.demo_settings.setActiveTimelineDrawScenario, {
      scenarioKey: "conservative_review_lag",
      templateKey: template.templateKey,
    });

    const second = await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});
    const afterReseed = await t.query(api.demo_settings.getTimelineDemoSettings, {});
    const reseededTemplate = afterReseed.templates.find(
      (row: any) => row.templateKey === "single_family_full_build"
    );

    expect(second.templates).toBe(3);
    expect(afterReseed.templates).toHaveLength(3);
    expect(reseededTemplate.activeScenarioName).toBe("Standard reimbursement");
    expect(
      reseededTemplate.milestones.find(
        (row: any) => row.milestoneKey === "site-prep"
      ).name
    ).toBe("Site prep & foundation");
    expectDefaultDrawTimings(afterReseed.templates);
    expect(afterReseed.events.some((row: any) => row.eventType === "seed_defaults")).toBe(
      true
    );
  });

  test("seed defaults upserts demo personas idempotently", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});
    await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});

    const personas = await t.query(api.demo_settings.listDemoPersonas, {});

    expect(personas).toHaveLength(2);
    expect(personas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: MOCK_BUILDER_PERSONA,
          label: "Mock Builder",
          role: "builder",
        }),
        expect.objectContaining({
          key: MOCK_STAFF_PERSONA,
          label: "Mock Staff",
          role: "staff",
        }),
      ]),
    );
  });

  test("validates PoC totals and draw scenario active uniqueness", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});
    const settings = await t.query(api.demo_settings.getTimelineDemoSettings, {});
    const template = settings.templates.find(
      (row: any) => row.templateKey === "single_family_full_build"
    );
    const invalidMilestones = template.milestones.map((row: any) => ({
      dependencyKeys: row.dependencyKeys,
      durationDays: row.durationDays,
      icon: row.icon,
      included: row.included,
      milestoneKey: row.milestoneKey,
      name: row.name,
      order: row.order,
      percentageBps:
        row.milestoneKey === "site-prep" ? row.percentageBps - 1 : row.percentageBps,
      submilestones: template.submilestones
        .filter((subRow: any) => subRow.milestoneKey === row.milestoneKey)
        .map((subRow: any) => ({
          description: subRow.description,
          durationDays: subRow.durationDays,
          name: subRow.name,
          order: subRow.order,
          percentageBps: subRow.percentageBps,
          submilestoneKey: subRow.submilestoneKey,
        })),
      type: row.type,
    }));

    await expect(
      t.mutation(api.demo_settings.saveTimelineTemplateWorksheet, {
        milestones: invalidMilestones,
        templateKey: template.templateKey,
      })
    ).rejects.toThrow(/100\.00%/);

    await t.mutation(api.demo_settings.setActiveTimelineDrawScenario, {
      scenarioKey: "conservative_review_lag",
      templateKey: template.templateKey,
    });
    const afterActiveChange = await t.query(
      api.demo_settings.getTimelineDemoSettings,
      {}
    );
    const changedTemplate = afterActiveChange.templates.find(
      (row: any) => row.templateKey === "single_family_full_build"
    );

    expect(changedTemplate.scenarios.filter((row: any) => row.isActive)).toHaveLength(
      1
    );
    expect(changedTemplate.activeScenarioKey).toBe("conservative_review_lag");
    await expect(
      t.mutation(api.demo_settings.deleteTimelineDrawScenario, {
        scenarioKey: "conservative_review_lag",
        templateKey: template.templateKey,
      })
    ).rejects.toThrow(/Active scenario/);
  });

  test("saves configurable field guidance per milestone", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});
    const settings = await t.query(api.demo_settings.getTimelineDemoSettings, {});
    const template = settings.templates.find(
      (row: any) => row.templateKey === "single_family_full_build"
    );
    const milestones = toMilestoneInputs(template).map((row: any) =>
      row.milestoneKey === "framing"
        ? {
            ...row,
            siteVisitGuidance: {
              cameraAngles: ["Custom north elevation", "Custom truss bay"],
              whatToVerify: ["Custom shear wall verification"],
            },
          }
        : row
    );

    await t.mutation(api.demo_settings.saveTimelineTemplateWorksheet, {
      milestones,
      templateKey: template.templateKey,
    });
    const after = await t.query(api.demo_settings.getTimelineDemoSettings, {});
    const updated = after.templates.find(
      (row: any) => row.templateKey === "single_family_full_build"
    );

    expect(updated.guidanceItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "whatToVerify",
          milestoneKey: "framing",
          text: expect.stringContaining("Custom shear wall verification"),
        }),
        expect.objectContaining({
          kind: "cameraAngle",
          milestoneKey: "framing",
          text: expect.stringContaining("Custom north elevation"),
        }),
      ])
    );
  });

  test("rejects draw timing outside adjacent milestone handoff windows", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});
    const settings = await t.query(api.demo_settings.getTimelineDemoSettings, {});
    const template = settings.templates.find(
      (row: any) => row.templateKey === "single_family_full_build"
    );
    const scenario = toScenarioInput({
      ...template.scenarios.find(
        (row: any) => row.scenarioKey === "standard_reimbursement"
      ),
      draws: template.scenarios
        .find((row: any) => row.scenarioKey === "standard_reimbursement")
        .draws.map((row: any, index: number) => ({
          ...row,
          timingDay: index === 0 ? 10 : row.timingDay,
        })),
    });

    await expect(
      t.mutation(api.demo_settings.saveTimelineDrawScenario, {
        scenario,
        templateKey: template.templateKey,
      })
    ).rejects.toThrow(/between the end of one milestone/);
  });

  test("replaces nonconforming seeded draw timings on reseed", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});
    await t.run(async (ctx) => {
      const scenario = await ctx.db
        .query("demo_timelineDrawScenarios")
        .withIndex("by_scenario", (q) =>
          q
            .eq("templateKey", "single_family_full_build")
            .eq("scenarioKey", "standard_reimbursement")
        )
        .unique();
      if (!scenario) {
        throw new Error("Missing seeded scenario.");
      }
      await ctx.db.patch(scenario._id, { seedVersion: 2 });
      const draw = await ctx.db
        .query("demo_timelineDrawScenarioDraws")
        .withIndex("by_scenario_and_order", (q) =>
          q
            .eq("templateKey", "single_family_full_build")
            .eq("scenarioKey", "standard_reimbursement")
        )
        .first();
      if (!draw) {
        throw new Error("Missing seeded draw.");
      }
      await ctx.db.patch(draw._id, { timingDay: 32 });
    });

    await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});
    const settings = await t.query(api.demo_settings.getTimelineDemoSettings, {});
    const template = settings.templates.find(
      (row: any) => row.templateKey === "single_family_full_build"
    );
    const scenario = template.scenarios.find(
      (row: any) => row.scenarioKey === "standard_reimbursement"
    );

    expect(scenario.seedVersion).toBe(2);
    expect(scenario.draws[0].timingDay).toBe(16);
    expectDefaultTimingRules([template]);
  });
});

function expectDefaultTimingRules(templates: any[]) {
  for (const template of templates) {
    const included = template.milestones
      .filter((row: any) => row.included)
      .sort((a: any, b: any) => a.order - b.order);
    for (let index = 0; index < included.length - 1; index += 1) {
      expect(milestoneStartDay(included, index + 1) - milestoneEndDay(included, index)).toBeLessThanOrEqual(5);
    }
    const windows = included.slice(0, -1).map((_: any, index: number) => ({
      afterEnd: milestoneEndDay(included, index),
      beforeStart: milestoneStartDay(included, index + 1),
    }));
    for (const scenario of template.scenarios) {
      for (const draw of scenario.draws) {
        expect(
          windows.some(
            (window: any) =>
              draw.timingDay > window.afterEnd && draw.timingDay < window.beforeStart
          )
        ).toBe(true);
      }
    }
  }
}

function expectDefaultDrawTimings(templates: any[]) {
  const timingsByScenario = Object.fromEntries(
    templates.flatMap((template) =>
      template.scenarios.map((scenario: any) => [
        `${template.templateKey}:${scenario.scenarioKey}`,
        scenario.draws.map((draw: any) => draw.timingDay),
      ])
    )
  );

  expect(timingsByScenario).toMatchObject({
    "multiplex_build:standard_multiplex": [51, 86, 119, 143, 167],
    "single_family_full_build:conservative_review_lag": [18, 41, 66, 110, 127],
    "single_family_full_build:standard_reimbursement": [16, 39, 64, 108, 125],
    "single_family_renovation:quick_inspection": [33, 57, 93, 111],
  });
}

function milestoneStartDay(rows: any[], index: number) {
  return rows
    .slice(0, index)
    .reduce((day, row) => day + row.durationDays + 5, 0);
}

function milestoneEndDay(rows: any[], index: number) {
  return milestoneStartDay(rows, index) + rows[index].durationDays;
}

function toScenarioInput(row: any) {
  return {
    description: row.description,
    draws: row.draws.map((draw: any, order: number) => ({
      amountBps: draw.amountBps,
      drawKey: draw.drawKey,
      label: draw.label,
      order,
      reviewNote: draw.reviewNote,
      timingDay: draw.timingDay,
    })),
    isActive: row.isActive,
    isDefault: row.isDefault,
    name: row.name,
    scenarioKey: row.scenarioKey,
    sortOrder: row.sortOrder,
  };
}

function toMilestoneInputs(template: any) {
  return template.milestones.map((row: any) => ({
    dependencyKeys: row.dependencyKeys,
    durationDays: row.durationDays,
    icon: row.icon,
    included: row.included,
    milestoneKey: row.milestoneKey,
    name: row.name,
    order: row.order,
    percentageBps: row.percentageBps,
    siteVisitGuidance: {
      cameraAngles: guidanceFieldHtml(
        template,
        row.milestoneKey,
        "cameraAngle"
      ),
      whatToVerify: guidanceFieldHtml(
        template,
        row.milestoneKey,
        "whatToVerify"
      ),
    },
    submilestones: template.submilestones
      .filter((subRow: any) => subRow.milestoneKey === row.milestoneKey)
      .map((subRow: any) => ({
        description: subRow.description,
        durationDays: subRow.durationDays,
        name: subRow.name,
        order: subRow.order,
        percentageBps: subRow.percentageBps,
        submilestoneKey: subRow.submilestoneKey,
      })),
    type: row.type,
  }));
}

function guidanceItems(template: any, milestoneKey: string, kind: string) {
  return template.guidanceItems
    .filter(
      (row: any) => row.milestoneKey === milestoneKey && row.kind === kind
    )
    .sort((a: any, b: any) => a.order - b.order)
    .map((row: any) => row.text);
}

function guidanceFieldHtml(template: any, milestoneKey: string, kind: string) {
  return coerceGuidanceField(guidanceItems(template, milestoneKey, kind));
}
