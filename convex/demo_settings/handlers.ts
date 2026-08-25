import { v } from "convex/values";
import {
  publicMutation,
  publicQuery,
  publicZodMutation,
  withMutationTiming,
  withQueryTiming,
} from "../fluent";
import {
  TOTAL_BPS,
  buildSettingsProjection,
  canonicalTimelineDemoKey,
  defaultDrawTimingDay,
  deleteScenarioDraws,
  draw,
  enforceSingleActiveScenario,
  getScenario,
  insertEvent,
  listMilestones,
  listScenarioDraws,
  listScenarios,
  normalizeMilestoneInputs,
  replaceScenarioDraws,
  replaceTemplateMilestones,
  requiredSeedTemplate,
  seedDefaults,
  seedIndex,
  toScenarioInput,
  toMilestoneInput,
  uniqueKey,
  upsertScenario,
  upsertTemplate,
  validateScenarioDrawRows,
  validateScenarios,
  validateTemplateKey,
  validateTemplateRows,
} from "./core";
import { scenarioInputValidator, timelineTemplateConfigurationInputSchema, timelineTemplateWorksheetInputSchema } from "./core";
import type { ScenarioInput } from "./core";
export const getTimelineDemoSettings = publicQuery
  .use(withQueryTiming("demo_settings.getTimelineDemoSettings"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => await buildSettingsProjection(ctx))
  .public();

export const seedTimelineDemoDefaults = publicMutation
  .use(withMutationTiming("demo_settings.seedTimelineDemoDefaults"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    const result = await seedDefaults(ctx);
    await insertEvent(ctx, {
      command: "seedTimelineDemoDefaults",
      entityKey: "timeline-demo",
      entityType: "timelineDemoSettings",
      eventType: "seed_defaults",
      newState: JSON.stringify(result),
      warnings: [],
    });
    return {
      ...result,
      settings: await buildSettingsProjection(ctx),
    };
  })
  .public();

export const listDemoPersonas = publicQuery
  .use(withQueryTiming("demo_settings.listDemoPersonas"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    const rows = await ctx.db.query("demo_personas").take(50);
    return rows.sort((a, b) => a.key.localeCompare(b.key));
  })
  .public();

export const saveTimelineTemplateConfiguration = publicZodMutation
  .use(withMutationTiming("demo_settings.saveTimelineTemplateConfiguration"))
  .input(timelineTemplateConfigurationInputSchema)
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestones = normalizeMilestoneInputs(args.milestones);
    validateTemplateKey(args.template.templateKey);
    validateTemplateRows(milestones);
    validateScenarios(args.scenarios, milestones);
    await upsertTemplate(ctx, args.template, 0, true);
    await replaceTemplateMilestones(ctx, args.template.templateKey, milestones);
    for (const scenarioRow of args.scenarios) {
      await upsertScenario(ctx, args.template.templateKey, scenarioRow, true);
      await replaceScenarioDraws(
        ctx,
        args.template.templateKey,
        scenarioRow.scenarioKey,
        scenarioRow.draws
      );
    }
    await enforceSingleActiveScenario(
      ctx,
      args.template.templateKey,
      args.scenarios.find((scenarioRow) => scenarioRow.isActive)?.scenarioKey
    );
    await insertEvent(ctx, {
      command: "saveTimelineTemplateConfiguration",
      entityKey: args.template.templateKey,
      entityType: "timelineTemplate",
      eventType: "template_configuration_saved",
      newState: JSON.stringify({
        milestoneCount: milestones.length,
        scenarioCount: args.scenarios.length,
      }),
      warnings: [],
    });
    return await buildSettingsProjection(ctx);
  })
  .public();

export const saveTimelineTemplateWorksheet = publicZodMutation
  .use(withMutationTiming("demo_settings.saveTimelineTemplateWorksheet"))
  .input(timelineTemplateWorksheetInputSchema)
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestones = normalizeMilestoneInputs(args.milestones);
    validateTemplateRows(milestones);
    await replaceTemplateMilestones(ctx, args.templateKey, milestones);
    await insertEvent(ctx, {
      command: "saveTimelineTemplateWorksheet",
      entityKey: args.templateKey,
      entityType: "timelineTemplate",
      eventType: "template_worksheet_saved",
      warnings: [],
    });
    return await buildSettingsProjection(ctx);
  })
  .public();

export const createTimelineDrawScenario = publicMutation
  .use(withMutationTiming("demo_settings.createTimelineDrawScenario"))
  .input({
    mode: v.union(
      v.literal("blank"),
      v.literal("duplicate"),
      v.literal("generated-standard")
    ),
    sourceScenarioKey: v.optional(v.string()),
    templateKey: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const scenarios = await listScenarios(ctx, args.templateKey);
    const milestones = await listMilestones(ctx, args.templateKey);
    const key = uniqueKey(
      `${args.mode}-scenario`,
      scenarios.map((row) => row.scenarioKey)
    );
    const source = args.sourceScenarioKey
      ? scenarios.find((row) => row.scenarioKey === args.sourceScenarioKey)
      : null;
    const sourceDraws = source
      ? await listScenarioDraws(ctx, args.templateKey, source.scenarioKey)
      : [];
    const scenarioRow: ScenarioInput = {
      description:
        source?.description ??
        "Editable scenario draft for timeline demo reimbursement timing.",
      draws:
        sourceDraws.length > 0
          ? sourceDraws.map((row, order) => ({
              amountBps: row.amountBps,
              drawKey: uniqueKey(row.drawKey, []),
              label: row.label,
              order,
              reviewNote: row.reviewNote,
              timingDay: row.timingDay,
            }))
          : [
              {
                ...draw(
                  "draw-01",
                  "Draw 01",
                  defaultDrawTimingDay(milestones),
                  TOTAL_BPS,
                  "Generated standard draw"
                ),
                order: 0,
              },
            ],
      isActive: scenarios.length === 0,
      isDefault: false,
      name: source ? `${source.name} copy` : "New reimbursement scenario",
      scenarioKey: key,
      sortOrder: scenarios.length,
    };
    validateScenarios([scenarioRow], milestones);
    await upsertScenario(ctx, args.templateKey, scenarioRow, false);
    await replaceScenarioDraws(ctx, args.templateKey, key, scenarioRow.draws);
    await insertEvent(ctx, {
      command: "createTimelineDrawScenario",
      entityKey: `${args.templateKey}:${key}`,
      entityType: "timelineDrawScenario",
      eventType: "scenario_created",
      warnings: [],
    });
    return await buildSettingsProjection(ctx);
  })
  .public();

export const saveTimelineDrawScenario = publicMutation
  .use(withMutationTiming("demo_settings.saveTimelineDrawScenario"))
  .input({
    scenario: scenarioInputValidator,
    templateKey: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestones = await listMilestones(ctx, args.templateKey);
    validateScenarios([args.scenario], milestones);
    await upsertScenario(ctx, args.templateKey, args.scenario, true);
    await replaceScenarioDraws(
      ctx,
      args.templateKey,
      args.scenario.scenarioKey,
      args.scenario.draws
    );
    if (args.scenario.isActive) {
      await enforceSingleActiveScenario(
        ctx,
        args.templateKey,
        args.scenario.scenarioKey
      );
    }
    await insertEvent(ctx, {
      command: "saveTimelineDrawScenario",
      entityKey: `${args.templateKey}:${args.scenario.scenarioKey}`,
      entityType: "timelineDrawScenario",
      eventType: "scenario_saved",
      warnings: [],
    });
    return await buildSettingsProjection(ctx);
  })
  .public();

export const setActiveTimelineDrawScenario = publicMutation
  .use(withMutationTiming("demo_settings.setActiveTimelineDrawScenario"))
  .input({
    scenarioKey: v.string(),
    templateKey: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestones = await listMilestones(ctx, args.templateKey);
    validateScenarioDrawRows(
      await listScenarioDraws(ctx, args.templateKey, args.scenarioKey),
      milestones
    );
    await enforceSingleActiveScenario(ctx, args.templateKey, args.scenarioKey);
    await insertEvent(ctx, {
      command: "setActiveTimelineDrawScenario",
      entityKey: `${args.templateKey}:${args.scenarioKey}`,
      entityType: "timelineDrawScenario",
      eventType: "active_scenario_changed",
      warnings: [],
    });
    return await buildSettingsProjection(ctx);
  })
  .public();

export const deleteTimelineDrawScenario = publicMutation
  .use(withMutationTiming("demo_settings.deleteTimelineDrawScenario"))
  .input({
    scenarioKey: v.string(),
    templateKey: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const scenarioRow = await getScenario(
      ctx,
      args.templateKey,
      args.scenarioKey
    );
    if (!scenarioRow) {
      return await buildSettingsProjection(ctx);
    }
    if (scenarioRow.isActive) {
      throw new Error("Active scenario cannot be deleted.");
    }
    await deleteScenarioDraws(ctx, args.templateKey, args.scenarioKey);
    await ctx.db.delete(scenarioRow._id);
    await insertEvent(ctx, {
      command: "deleteTimelineDrawScenario",
      entityKey: `${args.templateKey}:${args.scenarioKey}`,
      entityType: "timelineDrawScenario",
      eventType: "scenario_deleted",
      warnings: [],
    });
    return await buildSettingsProjection(ctx);
  })
  .public();

export const resetTimelineTemplateToDefaults = publicMutation
  .use(withMutationTiming("demo_settings.resetTimelineTemplateToDefaults"))
  .input({ templateKey: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const seed = requiredSeedTemplate(args.templateKey);
    await upsertTemplate(ctx, seed, seedIndex(seed.templateKey), true);
    await replaceTemplateMilestones(
      ctx,
      seed.templateKey,
      seed.milestones.map(toMilestoneInput)
    );
    await insertEvent(ctx, {
      command: "resetTimelineTemplateToDefaults",
      entityKey: seed.templateKey,
      entityType: "timelineTemplate",
      eventType: "template_reset",
      warnings: [],
    });
    return await buildSettingsProjection(ctx);
  })
  .public();

export const resetTimelineDrawScenarioToDefaults = publicMutation
  .use(withMutationTiming("demo_settings.resetTimelineDrawScenarioToDefaults"))
  .input({
    scenarioKey: v.string(),
    templateKey: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const seed = requiredSeedTemplate(args.templateKey);
    const scenarioKey = canonicalTimelineDemoKey(args.scenarioKey);
    const scenarioRow = seed.scenarios.find(
      (row) => row.scenarioKey === scenarioKey
    );
    if (!scenarioRow) {
      throw new Error("No default scenario exists for reset.");
    }
    await upsertScenario(
      ctx,
      seed.templateKey,
      toScenarioInput(scenarioRow, seed.scenarios.indexOf(scenarioRow)),
      true
    );
    await replaceScenarioDraws(
      ctx,
      seed.templateKey,
      scenarioRow.scenarioKey,
      scenarioRow.draws.map((row, order) => ({ ...row, order }))
    );
    await insertEvent(ctx, {
      command: "resetTimelineDrawScenarioToDefaults",
      entityKey: `${seed.templateKey}:${scenarioRow.scenarioKey}`,
      entityType: "timelineDrawScenario",
      eventType: "scenario_reset",
      warnings: [],
    });
    return await buildSettingsProjection(ctx);
  })
  .public();
