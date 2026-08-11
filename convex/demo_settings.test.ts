/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import { MOCK_BUILDER_PERSONA, MOCK_STAFF_PERSONA } from "./demo_personas";
import { coerceGuidanceField } from "./demo_site_visit_guidance";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const timelineDemoKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe("timeline demo settings Convex functions", () => {
  test("seed defaults replaces existing timeline settings with canonical rows", async () => {
    const t = convexTest(schema, modules);

    const first = await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});
    const seeded = await t.query(api.demo_settings.getTimelineDemoSettings, {});
    const template = seeded.templates.find(
      (row: any) => row.templateKey === "single-family-full-build"
    );
    const gardenTemplate = seeded.templates.find(
      (row: any) => row.templateKey === "garden-suite"
    );

    expect(first.templates).toBe(4);
    expect(first.personas).toBe(2);
    expect(first.settings.templates).toHaveLength(4);
    expectSettingsKeysToUseHyphenSlugs(first.settings.templates);
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
    expect(gardenTemplate).toMatchObject({
      activeScenarioName: "Standard Garden Suite reimbursement",
      summary: "16 milestones, 65 budget line items, 100.00% PoC, 141 field days",
      title: "Garden Suite",
    });
    expect(gardenTemplate.milestones).toHaveLength(16);
    expect(gardenTemplate.status.totalPocBps).toBe(10_000);
    expect(gardenTemplate.milestones.map((row: any) => row.name)).toEqual([
      "Soft Costs & Pre-Construction",
      "Site Work & Servicing",
      "Concrete & Foundation",
      "Framing & Structure",
      "Roofing & Exterior Envelope",
      "Windows & Exterior Doors",
      "Mechanical - HVAC & Plumbing",
      "Electrical",
      "Insulation & Drywall",
      "Flooring & Stairs",
      "Interior Doors, Trim & Paint",
      "Kitchen",
      "Bathrooms & Powder Room",
      "Exterior Site Finishes",
      "Laundry & Misc. Equipment",
      "General Conditions",
    ]);
    expect(gardenTemplate.submilestones).toHaveLength(65);
    expect(
      gardenTemplate.submilestones
        .filter(
          (row: any) => row.milestoneKey === "soft-costs-and-pre-construction"
        )
        .map((row: any) => row.name)
    ).toEqual([
      "Legal / topographic survey",
      "Architectural & permit drawings",
      "Structural engineering",
      "Arborist report & tree protection plan",
      "Geotechnical / soils investigation",
      "City of Toronto building permit",
      "Builder's risk insurance",
      "Legal & disbursements",
    ]);
    expect(
      gardenTemplate.submilestones
        .filter((row: any) => row.milestoneKey === "general-conditions")
        .map((row: any) => row.name)
    ).toEqual([
      "Supervision, PM, temp services, dumpsters, scaffold, final clean",
    ]);
    expect(gardenTemplate.submilestones.map((row: any) => row.name)).not.toEqual(
      expect.arrayContaining([
        "Project subtotal (pre-contingency)",
        "HST  (D10)",
        "TOTAL INCL. HST",
        "NET ALL-IN (if rebate eligible)",
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
      scenarioKey: "conservative-review-lag",
      templateKey: template.templateKey,
    });

    const second = await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});
    const afterReseed = await t.query(api.demo_settings.getTimelineDemoSettings, {});
    const reseededTemplate = afterReseed.templates.find(
      (row: any) => row.templateKey === "single-family-full-build"
    );

    expect(second.templates).toBe(4);
    expect(afterReseed.templates).toHaveLength(4);
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

  test("projects legacy underscore template keys as valid hyphen slugs", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});
    await rewriteSeededFullBuildRowsToLegacyKeys(t);

    const settings = await t.query(api.demo_settings.getTimelineDemoSettings, {});
    const template = settings.templates.find(
      (row: any) => row.title === "Single Family Full Build"
    );

    expect(template.templateKey).toBe("single-family-full-build");
    expect(template.activeScenarioKey).toBe("standard-reimbursement");
    expect(template.scenarios.map((row: any) => row.scenarioKey).sort()).toEqual(
      ["conservative-review-lag", "standard-reimbursement"]
    );
    expectSettingsKeysToUseHyphenSlugs(settings.templates);
  });

  test("validates PoC totals and draw scenario active uniqueness", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});
    const settings = await t.query(api.demo_settings.getTimelineDemoSettings, {});
    const template = settings.templates.find(
      (row: any) => row.templateKey === "single-family-full-build"
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

    await expect(
      t.mutation(api.demo_settings.saveTimelineTemplateConfiguration, {
        milestones: toMilestoneInputs(template),
        scenarios: template.scenarios.map(toScenarioInput),
        template: {
          description: template.description,
          isDefault: template.isDefault,
          summary: template.summary,
          templateKey: "single_family_full_build",
          title: template.title,
        },
      })
    ).rejects.toThrow(/Template key must use lowercase letters/);

    await t.mutation(api.demo_settings.setActiveTimelineDrawScenario, {
      scenarioKey: "conservative-review-lag",
      templateKey: template.templateKey,
    });
    const afterActiveChange = await t.query(
      api.demo_settings.getTimelineDemoSettings,
      {}
    );
    const changedTemplate = afterActiveChange.templates.find(
      (row: any) => row.templateKey === "single-family-full-build"
    );

    expect(changedTemplate.scenarios.filter((row: any) => row.isActive)).toHaveLength(
      1
    );
    expect(changedTemplate.activeScenarioKey).toBe("conservative-review-lag");
    await expect(
      t.mutation(api.demo_settings.deleteTimelineDrawScenario, {
        scenarioKey: "conservative-review-lag",
        templateKey: template.templateKey,
      })
    ).rejects.toThrow(/Active scenario/);
  });

  test("saves configurable field guidance per milestone", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});
    const settings = await t.query(api.demo_settings.getTimelineDemoSettings, {});
    const template = settings.templates.find(
      (row: any) => row.templateKey === "single-family-full-build"
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
      (row: any) => row.templateKey === "single-family-full-build"
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

  test("persists optional submilestone scope and field guidance through both settings mutations", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});
    const settings = await t.query(api.demo_settings.getTimelineDemoSettings, {});
    const template = settings.templates.find(
      (row: any) => row.templateKey === "single-family-full-build",
    );
    const milestones = toMilestoneInputs(template);
    const firstSubmilestone = milestones[0].submilestones[0];
    firstSubmilestone.scopeOfWorkTiptapJson = JSON.stringify({
      content: [{ content: [{ text: "Demo template scope", type: "text" }], type: "paragraph" }],
      type: "doc",
    });
    firstSubmilestone.fieldGuidance = {
      cameraAnglesTiptapJson: JSON.stringify({
        content: [{ content: [{ text: "Demo camera angles", type: "text" }], type: "paragraph" }],
        type: "doc",
      }),
      whatToVerifyTiptapJson: JSON.stringify({
        content: [{ content: [{ text: "Demo verification", type: "text" }], type: "paragraph" }],
        type: "doc",
      }),
    };

    await t.mutation(api.demo_settings.saveTimelineTemplateConfiguration, {
      milestones,
      scenarios: template.scenarios.map(toScenarioInput),
      template: {
        description: template.description,
        isDefault: template.isDefault,
        summary: template.summary,
        templateKey: template.templateKey,
        title: template.title,
      },
    });

    const afterConfiguration = await t.query(
      api.demo_settings.getTimelineDemoSettings,
      {},
    );
    const configuredSubmilestone = afterConfiguration.templates
      .find((row: any) => row.templateKey === template.templateKey)
      .submilestones.find(
        (row: any) => row.submilestoneKey === firstSubmilestone.submilestoneKey,
      );
    expect(configuredSubmilestone).toMatchObject({
      fieldGuidance: firstSubmilestone.fieldGuidance,
      scopeOfWorkTiptapJson: firstSubmilestone.scopeOfWorkTiptapJson,
    });

    const worksheetMilestones = milestones.map((row: any, index: number) =>
      index === 0
        ? {
            ...row,
            submilestones: row.submilestones.map((subRow: any, subIndex: number) =>
              subIndex === 0
                ? {
                    ...subRow,
                    scopeOfWorkTiptapJson: JSON.stringify({
                      content: [{ content: [{ text: "Worksheet scope", type: "text" }], type: "paragraph" }],
                      type: "doc",
                    }),
                    fieldGuidance: {
                      cameraAnglesTiptapJson: JSON.stringify({
                        content: [{ content: [{ text: "Worksheet camera angles", type: "text" }], type: "paragraph" }],
                        type: "doc",
                      }),
                      whatToVerifyTiptapJson: JSON.stringify({
                        content: [{ content: [{ text: "Worksheet verification", type: "text" }], type: "paragraph" }],
                        type: "doc",
                      }),
                    },
                  }
                : subRow,
            ),
          }
        : row,
    );
    await t.mutation(api.demo_settings.saveTimelineTemplateWorksheet, {
      milestones: worksheetMilestones,
      templateKey: template.templateKey,
    });
    const afterWorksheet = await t.query(
      api.demo_settings.getTimelineDemoSettings,
      {},
    );
    const worksheetSubmilestone = afterWorksheet.templates
      .find((row: any) => row.templateKey === template.templateKey)
      .submilestones.find(
        (row: any) => row.submilestoneKey === firstSubmilestone.submilestoneKey,
      );
    expect(worksheetSubmilestone).toMatchObject({
      fieldGuidance: {
        cameraAnglesTiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: "Worksheet camera angles", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
        whatToVerifyTiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: "Worksheet verification", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
      scopeOfWorkTiptapJson: JSON.stringify({
        content: [
          {
            content: [{ text: "Worksheet scope", type: "text" }],
            type: "paragraph",
          },
        ],
        type: "doc",
      }),
    });

    const malformedMilestones = milestones.map((row: any, index: number) =>
      index === 0
        ? {
            ...row,
            submilestones: row.submilestones.map((subRow: any, subIndex: number) =>
              subIndex === 0
                ? {
                    ...subRow,
                    fieldGuidance: {
                      cameraAnglesTiptapJson: "valid",
                      whatToVerifyTiptapJson: 42,
                    },
                  }
                : subRow,
            ),
          }
        : row,
    );
    await expect(
      t.mutation(api.demo_settings.saveTimelineTemplateWorksheet, {
        milestones: malformedMilestones as any,
        templateKey: template.templateKey,
      }),
    ).rejects.toThrow(/Validator error|whatToVerifyTiptapJson/i);

    const malformedTiptapMilestones = milestones.map((row: any, index: number) =>
      index === 0
        ? {
            ...row,
            submilestones: row.submilestones.map(
              (subRow: any, subIndex: number) =>
                subIndex === 0
                  ? {
                      ...subRow,
                      fieldGuidance: {
                        cameraAnglesTiptapJson: JSON.stringify({
                          content: [
                            {
                              content: [{ text: "Valid camera angles", type: "text" }],
                              type: "paragraph",
                            },
                          ],
                          type: "doc",
                        }),
                        whatToVerifyTiptapJson: "{not-valid-tiptap-json",
                      },
                    }
                  : subRow,
            ),
          }
        : row,
    );
    await expect(
      t.mutation(api.demo_settings.saveTimelineTemplateWorksheet, {
        milestones: malformedTiptapMilestones,
        templateKey: template.templateKey,
      }),
    ).rejects.toThrow(/valid TipTap JSON|whatToVerify/i);
  });

  test("enforces the shared TipTap boundary on both timeline save mutations", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});
    const settings = await t.query(api.demo_settings.getTimelineDemoSettings, {});
    const template = settings.templates.find(
      (row: any) => row.templateKey === "single-family-full-build",
    );
    const validDocument = JSON.stringify({ content: [], type: "doc" });
    const values = {
      blank: " ",
      malformed: "{not-json",
      maxLength: tiptapJsonWithPadding(250_000),
      nonDocumentRoot: JSON.stringify({ content: [], type: "paragraph" }),
      overMaxLength: tiptapJsonWithPadding(250_001),
    } as const;

    for (const [label, value] of Object.entries(values)) {
      for (const field of ["scope", "whatToVerify", "cameraAngles"] as const) {
        for (const mutation of ["configuration", "worksheet"] as const) {
          const milestones = toMilestoneInputs(template);
          const firstSubmilestone = milestones[0].submilestones[0];
          if (field === "scope") {
            firstSubmilestone.scopeOfWorkTiptapJson = value;
          } else {
            firstSubmilestone.fieldGuidance = {
              cameraAnglesTiptapJson:
                field === "cameraAngles" ? value : validDocument,
              whatToVerifyTiptapJson:
                field === "whatToVerify" ? value : validDocument,
            };
          }

          const save =
            mutation === "configuration"
              ? t.mutation(api.demo_settings.saveTimelineTemplateConfiguration, {
                  milestones,
                  scenarios: template.scenarios.map(toScenarioInput),
                  template: {
                    description: template.description,
                    isDefault: template.isDefault,
                    summary: template.summary,
                    templateKey: template.templateKey,
                    title: template.title,
                  },
                })
              : t.mutation(api.demo_settings.saveTimelineTemplateWorksheet, {
                  milestones,
                  templateKey: template.templateKey,
                });

          if (label === "maxLength") {
            await expect(save).resolves.toBeDefined();
          } else {
            await expect(save).rejects.toThrow(
              label === "malformed"
                ? /valid TipTap JSON/i
                : label === "nonDocumentRoot"
                  ? /document root/i
                  : label === "overMaxLength"
                    ? /supported length/i
                    : /contain TipTap JSON/i,
            );
          }
        }
      }
    }
  });

  test("allows draw timing inside milestone windows", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});
    const settings = await t.query(api.demo_settings.getTimelineDemoSettings, {});
    const template = settings.templates.find(
      (row: any) => row.templateKey === "single-family-full-build"
    );
    const scenario = toScenarioInput({
      ...template.scenarios.find(
        (row: any) => row.scenarioKey === "standard-reimbursement"
      ),
      draws: template.scenarios
        .find((row: any) => row.scenarioKey === "standard-reimbursement")
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
    ).resolves.toBeTruthy();
  });

  test("allows final draw timing in the final closeout handoff window", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});
    const settings = await t.query(api.demo_settings.getTimelineDemoSettings, {});
    const template = settings.templates.find(
      (row: any) => row.templateKey === "single-family-full-build"
    );
    const scenario = toScenarioInput({
      ...template.scenarios.find(
        (row: any) => row.scenarioKey === "standard-reimbursement"
      ),
      draws: template.scenarios
        .find((row: any) => row.scenarioKey === "standard-reimbursement")
        .draws.map((row: any, index: number, draws: any[]) => ({
          ...row,
          timingDay: index === draws.length - 1 ? 133 : row.timingDay,
        })),
    });

    const result = await t.mutation(api.demo_settings.saveTimelineDrawScenario, {
      scenario,
      templateKey: template.templateKey,
    });

    expect(
      result.templates
        .find((row: any) => row.templateKey === "single-family-full-build")
        .scenarios.find(
          (row: any) => row.scenarioKey === "standard-reimbursement"
        ).draws.at(-1).timingDay
    ).toBe(133);
  });

  test("replaces nonconforming seeded draw timings on reseed", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.demo_settings.seedTimelineDemoDefaults, {});
    await t.run(async (ctx) => {
      const scenario = await ctx.db
        .query("demo_timelineDrawScenarios")
        .withIndex("by_scenario", (q) =>
          q
            .eq("templateKey", "single-family-full-build")
            .eq("scenarioKey", "standard-reimbursement")
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
            .eq("templateKey", "single-family-full-build")
            .eq("scenarioKey", "standard-reimbursement")
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
      (row: any) => row.templateKey === "single-family-full-build"
    );
    const scenario = template.scenarios.find(
      (row: any) => row.scenarioKey === "standard-reimbursement"
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
    const finalIndex = included.length - 1;
    if (finalIndex >= 0) {
      const finalEnd = milestoneEndDay(included, finalIndex);
      windows.push({
        afterEnd: finalEnd,
        beforeStart: finalEnd + 5,
      });
    }
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

function expectSettingsKeysToUseHyphenSlugs(templates: any[]) {
  for (const template of templates) {
    expect(template.templateKey).toMatch(timelineDemoKeyPattern);
    for (const scenario of template.scenarios) {
      expect(scenario.scenarioKey).toMatch(timelineDemoKeyPattern);
    }
  }
}

async function rewriteSeededFullBuildRowsToLegacyKeys(t: any) {
  const canonicalTemplateKey = "single-family-full-build";
  const legacyTemplateKey = "single_family_full_build";
  await t.run(async (ctx: any) => {
    for (const table of [
      "demo_timelineTemplates",
      "demo_timelineTemplateMilestones",
      "demo_timelineTemplateSubmilestones",
      "demo_timelineTemplateMilestoneGuidance",
      "demo_timelineTemplateMilestoneGuidanceItems",
      "demo_timelineDrawScenarios",
      "demo_timelineDrawScenarioDraws",
    ]) {
      for (const row of await ctx.db.query(table).take(500)) {
        if (row.templateKey === canonicalTemplateKey) {
          await ctx.db.patch(row._id, {
            templateKey: legacyTemplateKey,
            ...(typeof row.scenarioKey === "string"
              ? { scenarioKey: row.scenarioKey.replaceAll("-", "_") }
              : {}),
          });
        }
      }
    }
  });
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
    "multiplex-build:standard-multiplex": [51, 86, 119, 143, 167],
    "garden-suite:standard-garden-suite-reimbursement": [
      48, 95, 142, 192, 218,
    ],
    "single-family-full-build:conservative-review-lag": [18, 41, 66, 110, 127],
    "single-family-full-build:standard-reimbursement": [16, 39, 64, 108, 125],
    "single-family-renovation:quick-inspection": [33, 57, 93, 111],
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
        ...(subRow.fieldGuidance === undefined
          ? {}
          : { fieldGuidance: subRow.fieldGuidance }),
        name: subRow.name,
        order: subRow.order,
        percentageBps: subRow.percentageBps,
        ...(subRow.scopeOfWorkTiptapJson === undefined
          ? {}
          : { scopeOfWorkTiptapJson: subRow.scopeOfWorkTiptapJson }),
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

function tiptapJsonWithPadding(length: number) {
  const prefix = '{"content":[],"padding":"';
  const suffix = '","type":"doc"}';
  const paddingLength = length - prefix.length - suffix.length;
  if (paddingLength < 0) {
    throw new Error("TipTap padding length must be positive.");
  }
  return `${prefix}${"x".repeat(paddingLength)}${suffix}`;
}
