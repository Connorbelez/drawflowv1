import { DEMO_PERSONAS } from "../demo_personas";
import {
  defaultSiteVisitGuidance,
  guidanceToItems,
  normalizeSiteVisitGuidance,
} from "../demo_site_visit_guidance";
import type { Doc } from "../types";
import {
  DEFAULT_TEMPLATES,
  NOW,
  SEED_VERSION,
  canonicalTimelineDemoKey,
  settingsCompleteness,
  templateStatus,
  toScenarioInput,
} from "./shared";
import type {
  MilestoneInput,
  ReadCtx,
  ScenarioInput,
  SeedDraw,
  SeedMilestone,
  SeedScenario,
  SeedSubmilestone,
  SeedTemplate,
  WriteCtx,
} from "./shared";
export async function buildSettingsProjection(ctx: ReadCtx) {
  const templates = await ctx.db.query("demo_timelineTemplates").take(20);
  const sortedTemplates = [...templates].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder || a.templateKey.localeCompare(b.templateKey)
  );
  const templateProjections = [];

  for (const templateRow of sortedTemplates) {
    const canonicalTemplateKey = canonicalTimelineDemoKey(
      templateRow.templateKey
    );
    const milestones = await listMilestones(ctx, templateRow.templateKey);
    const guidanceItems = await listGuidanceItemsForTemplate(
      ctx,
      templateRow.templateKey
    );
    const scenarios = await listScenarios(ctx, templateRow.templateKey);
    const scenarioProjections = [];
    for (const scenarioRow of scenarios) {
      const canonicalScenarioKey = canonicalTimelineDemoKey(
        scenarioRow.scenarioKey
      );
      const draws = await listScenarioDraws(
        ctx,
        templateRow.templateKey,
        scenarioRow.scenarioKey
      );
      scenarioProjections.push({
        ...scenarioRow,
        scenarioKey: canonicalScenarioKey,
        templateKey: canonicalTemplateKey,
        draws: draws.map((draw) => ({
          ...draw,
          scenarioKey: canonicalScenarioKey,
          templateKey: canonicalTemplateKey,
        })),
      });
    }
    const activeScenario =
      scenarioProjections.find((scenarioRow) => scenarioRow.isActive) ?? null;
    templateProjections.push({
      ...templateRow,
      templateKey: canonicalTemplateKey,
      activeScenarioKey: activeScenario?.scenarioKey ?? null,
      activeScenarioName: activeScenario?.name ?? null,
      milestones: milestones.map((milestone) => ({
        ...milestone,
        templateKey: canonicalTemplateKey,
      })),
      scenarios: scenarioProjections,
      status: templateStatus(
        canonicalTemplateKey,
        milestones,
        scenarioProjections
      ),
      guidanceItems: guidanceItems.map((item) => ({
        ...item,
        templateKey: canonicalTemplateKey,
      })),
      submilestones: (
        await listSubmilestonesForTemplate(ctx, templateRow.templateKey)
      ).map((submilestone) => ({
        ...submilestone,
        templateKey: canonicalTemplateKey,
      })),
    });
  }

  const events = await ctx.db
    .query("demo_timelineSettingsEvents")
    .order("desc")
    .take(25);

  return {
    completeness: settingsCompleteness(templateProjections),
    events,
    seedVersion: SEED_VERSION,
    templates: templateProjections,
  };
}

export async function seedDefaults(ctx: WriteCtx) {
  await clearTimelineDemoSettings(ctx);
  const inserted = {
    draws: 0,
    guidanceItems: 0,
    guidanceMilestones: 0,
    milestones: 0,
    personas: 0,
    scenarios: 0,
    submilestones: 0,
    templates: 0,
  };
  inserted.personas = await upsertDemoPersonas(ctx);
  for (const [templateIndex, templateRow] of DEFAULT_TEMPLATES.entries()) {
    if (await upsertTemplate(ctx, templateRow, templateIndex, false)) {
      inserted.templates += 1;
    }
    for (const [
      milestoneIndex,
      milestoneRow,
    ] of templateRow.milestones.entries()) {
      if (
        await insertMissingMilestone(
          ctx,
          templateRow.templateKey,
          milestoneRow,
          milestoneIndex
        )
      ) {
        inserted.milestones += 1;
      }
      for (const [subIndex, subRow] of milestoneRow.submilestones.entries()) {
        if (
          await insertMissingSubmilestone(
            ctx,
            templateRow.templateKey,
            milestoneRow.milestoneKey,
            subRow,
            subIndex
          )
        ) {
          inserted.submilestones += 1;
        }
      }
      const guidanceResult = await insertMissingTemplateGuidance(
        ctx,
        templateRow.templateKey,
        milestoneRow
      );
      inserted.guidanceMilestones += guidanceResult.guidanceMilestones;
      inserted.guidanceItems += guidanceResult.guidanceItems;
    }
    const existingScenarios = await listScenarios(ctx, templateRow.templateKey);
    for (const [
      scenarioIndex,
      scenarioRow,
    ] of templateRow.scenarios.entries()) {
      if (
        await upsertScenario(
          ctx,
          templateRow.templateKey,
          toScenarioInput(scenarioRow, scenarioIndex),
          false
        )
      ) {
        inserted.scenarios += 1;
      }
      for (const [drawIndex, drawRow] of scenarioRow.draws.entries()) {
        if (
          await insertMissingDraw(
            ctx,
            templateRow.templateKey,
            scenarioRow.scenarioKey,
            drawRow,
            drawIndex
          )
        ) {
          inserted.draws += 1;
        }
      }
    }
    const activeAfterSeed = (
      await listScenarios(ctx, templateRow.templateKey)
    ).filter((row) => row.isActive);
    if (
      activeAfterSeed.length === 0 &&
      existingScenarios.length === 0 &&
      templateRow.scenarios[0]
    ) {
      await enforceSingleActiveScenario(
        ctx,
        templateRow.templateKey,
        templateRow.scenarios[0].scenarioKey
      );
    }
  }
  return inserted;
}

export async function upsertDemoPersonas(ctx: WriteCtx) {
  let changed = 0;
  for (const persona of DEMO_PERSONAS) {
    const existing = await ctx.db
      .query("demo_personas")
      .withIndex("by_key", (q) => q.eq("key", persona.key))
      .unique();
    const nextRow = {
      createdAt: existing?.createdAt ?? NOW,
      key: persona.key,
      label: persona.label,
      role: persona.role,
      updatedAt: NOW,
    };
    if (existing) {
      await ctx.db.patch(existing._id, nextRow);
    } else {
      await ctx.db.insert("demo_personas", nextRow);
    }
    changed += 1;
  }
  return changed;
}

export async function clearTimelineDemoSettings(ctx: WriteCtx) {
  for (const row of await ctx.db
    .query("demo_timelineDrawScenarioDraws")
    .take(500)) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("demo_timelineDrawScenarios")
    .take(200)) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("demo_timelineTemplateSubmilestones")
    .take(500)) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("demo_timelineTemplateMilestoneGuidanceItems")
    .take(500)) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("demo_timelineTemplateMilestoneGuidance")
    .take(200)) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("demo_timelineTemplateMilestones")
    .take(200)) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db.query("demo_timelineTemplates").take(100)) {
    await ctx.db.delete(row._id);
  }
}

export async function upsertTemplate(
  ctx: WriteCtx,
  templateRow: Pick<
    SeedTemplate,
    "description" | "isDefault" | "summary" | "templateKey" | "title"
  >,
  sortOrder: number,
  overwrite: boolean
) {
  const existing = await ctx.db
    .query("demo_timelineTemplates")
    .withIndex("by_template", (q) =>
      q.eq("templateKey", templateRow.templateKey)
    )
    .unique();
  if (existing && !overwrite) {
    return false;
  }
  const nextRow = {
    createdAt: existing?._creationTime ?? NOW,
    description: templateRow.description,
    isDefault: templateRow.isDefault,
    seedVersion: SEED_VERSION,
    sortOrder,
    summary: templateRow.summary,
    templateKey: templateRow.templateKey,
    title: templateRow.title,
    updatedAt: NOW,
  };
  if (existing) {
    await ctx.db.replace(existing._id, nextRow);
    return false;
  }
  await ctx.db.insert("demo_timelineTemplates", nextRow);
  return true;
}

export async function insertMissingMilestone(
  ctx: WriteCtx,
  templateKey: string,
  milestoneRow: SeedMilestone,
  order: number
) {
  const existing = await getMilestone(
    ctx,
    templateKey,
    milestoneRow.milestoneKey
  );
  if (existing) {
    return false;
  }
  await ctx.db.insert("demo_timelineTemplateMilestones", {
    createdAt: NOW,
    dependencyKeys: milestoneRow.dependencyKeys,
    durationDays: milestoneRow.durationDays,
    icon: milestoneRow.icon,
    included: milestoneRow.included,
    milestoneKey: milestoneRow.milestoneKey,
    name: milestoneRow.name,
    order,
    percentageBps: milestoneRow.percentageBps,
    templateKey,
    type: milestoneRow.type,
    updatedAt: NOW,
  });
  return true;
}

export async function insertMissingSubmilestone(
  ctx: WriteCtx,
  templateKey: string,
  milestoneKey: string,
  row: SeedSubmilestone,
  order: number
) {
  const existing = (
    await listSubmilestones(ctx, templateKey, milestoneKey)
  ).find((subRow) => subRow.submilestoneKey === row.submilestoneKey);
  if (existing) {
    return false;
  }
  await ctx.db.insert("demo_timelineTemplateSubmilestones", {
    createdAt: NOW,
    description: row.description,
    durationDays: row.durationDays,
    ...(row.fieldGuidance === undefined
      ? {}
      : { fieldGuidance: row.fieldGuidance }),
    milestoneKey,
    name: row.name,
    order,
    percentageBps: row.percentageBps,
    ...(row.scopeOfWorkTiptapJson === undefined
      ? {}
      : { scopeOfWorkTiptapJson: row.scopeOfWorkTiptapJson }),
    submilestoneKey: row.submilestoneKey,
    templateKey,
    updatedAt: NOW,
  });
  return true;
}

export async function insertMissingTemplateGuidance(
  ctx: WriteCtx,
  templateKey: string,
  milestoneRow: SeedMilestone
) {
  const existing = await getTemplateGuidance(
    ctx,
    templateKey,
    milestoneRow.milestoneKey
  );
  if (existing) {
    return { guidanceItems: 0, guidanceMilestones: 0 };
  }
  const guidanceId = await ctx.db.insert(
    "demo_timelineTemplateMilestoneGuidance",
    {
      createdAt: NOW,
      milestoneKey: milestoneRow.milestoneKey,
      templateKey,
      updatedAt: NOW,
    }
  );
  const items = guidanceToItems(
    milestoneRow.siteVisitGuidance,
    defaultSiteVisitGuidance(
      milestoneRow.milestoneKey,
      milestoneRow.name,
      milestoneRow.submilestones.map((row) => row.name)
    )
  );
  for (const item of items) {
    await ctx.db.insert("demo_timelineTemplateMilestoneGuidanceItems", {
      createdAt: NOW,
      guidanceId,
      kind: item.kind,
      milestoneKey: milestoneRow.milestoneKey,
      order: item.order ?? 0,
      templateKey,
      text: item.text,
      updatedAt: NOW,
    });
  }
  return { guidanceItems: items.length, guidanceMilestones: 1 };
}

export async function upsertScenario(
  ctx: WriteCtx,
  templateKey: string,
  scenarioRow: ScenarioInput,
  overwrite: boolean
) {
  const existing = await getScenario(ctx, templateKey, scenarioRow.scenarioKey);
  if (existing && !overwrite) {
    return false;
  }
  const nextRow = {
    createdAt: existing?._creationTime ?? NOW,
    description: scenarioRow.description,
    isActive: scenarioRow.isActive,
    isDefault: scenarioRow.isDefault,
    name: scenarioRow.name,
    scenarioKey: scenarioRow.scenarioKey,
    seedVersion: SEED_VERSION,
    sortOrder: scenarioRow.sortOrder,
    templateKey,
    updatedAt: NOW,
  };
  if (existing) {
    await ctx.db.replace(existing._id, nextRow);
    return false;
  }
  await ctx.db.insert("demo_timelineDrawScenarios", nextRow);
  return true;
}

export async function insertMissingDraw(
  ctx: WriteCtx,
  templateKey: string,
  scenarioKey: string,
  row: SeedDraw,
  order: number
) {
  const existing = (
    await listScenarioDraws(ctx, templateKey, scenarioKey)
  ).find((drawRow) => drawRow.drawKey === row.drawKey);
  if (existing) {
    return false;
  }
  await ctx.db.insert("demo_timelineDrawScenarioDraws", {
    amountBps: row.amountBps,
    amountMode: "percentage",
    createdAt: NOW,
    drawKey: row.drawKey,
    label: row.label,
    order,
    reviewNote: row.reviewNote,
    scenarioKey,
    templateKey,
    timingDay: row.timingDay,
    updatedAt: NOW,
  });
  return true;
}

export async function replaceTemplateMilestones(
  ctx: WriteCtx,
  templateKey: string,
  rows: MilestoneInput[]
) {
  const existingMilestones = await listMilestones(ctx, templateKey);
  const existingSubmilestones = await listSubmilestonesForTemplate(
    ctx,
    templateKey
  );
  for (const row of existingMilestones) {
    await ctx.db.delete(row._id);
  }
  for (const row of existingSubmilestones) {
    await ctx.db.delete(row._id);
  }
  for (const row of await listTemplateGuidanceRows(ctx, templateKey)) {
    await deleteTemplateGuidance(ctx, row._id);
  }
  for (const [index, row] of rows.entries()) {
    await ctx.db.insert("demo_timelineTemplateMilestones", {
      createdAt: NOW,
      dependencyKeys: row.dependencyKeys,
      durationDays: row.durationDays,
      icon: row.icon,
      included: row.included,
      milestoneKey: row.milestoneKey,
      name: row.name,
      order: index,
      percentageBps: row.percentageBps,
      templateKey,
      type: row.type,
      updatedAt: NOW,
    });
    for (const [subIndex, subRow] of row.submilestones.entries()) {
      await ctx.db.insert("demo_timelineTemplateSubmilestones", {
        createdAt: NOW,
        description: subRow.description,
        durationDays: subRow.durationDays,
        ...(subRow.fieldGuidance === undefined
          ? {}
          : { fieldGuidance: subRow.fieldGuidance }),
        milestoneKey: row.milestoneKey,
        name: subRow.name,
        order: subIndex,
        percentageBps: subRow.percentageBps,
        ...(subRow.scopeOfWorkTiptapJson === undefined
          ? {}
          : { scopeOfWorkTiptapJson: subRow.scopeOfWorkTiptapJson }),
        submilestoneKey: subRow.submilestoneKey,
        templateKey,
        updatedAt: NOW,
      });
    }
    await replaceTemplateGuidance(ctx, templateKey, row);
  }
}

export async function replaceScenarioDraws(
  ctx: WriteCtx,
  templateKey: string,
  scenarioKey: string,
  rows: (SeedDraw & { order?: number })[]
) {
  await deleteScenarioDraws(ctx, templateKey, scenarioKey);
  for (const [index, row] of rows.entries()) {
    await ctx.db.insert("demo_timelineDrawScenarioDraws", {
      amountBps: row.amountBps,
      amountMode: "percentage",
      createdAt: NOW,
      drawKey: row.drawKey,
      label: row.label,
      order: row.order ?? index,
      reviewNote: row.reviewNote,
      scenarioKey,
      templateKey,
      timingDay: row.timingDay,
      updatedAt: NOW,
    });
  }
}

export async function deleteScenarioDraws(
  ctx: WriteCtx,
  templateKey: string,
  scenarioKey: string
) {
  for (const row of await listScenarioDraws(ctx, templateKey, scenarioKey)) {
    await ctx.db.delete(row._id);
  }
}

export async function enforceSingleActiveScenario(
  ctx: WriteCtx,
  templateKey: string,
  scenarioKey: string | undefined
) {
  if (!scenarioKey) {
    throw new Error("An active scenario is required.");
  }
  const scenarios = await listScenarios(ctx, templateKey);
  if (!scenarios.some((row) => row.scenarioKey === scenarioKey)) {
    throw new Error("Active scenario does not exist.");
  }
  for (const row of scenarios) {
    await ctx.db.patch(row._id, {
      isActive: row.scenarioKey === scenarioKey,
      updatedAt: NOW,
    });
  }
}

export async function listMilestones(ctx: ReadCtx, templateKey: string) {
  return await ctx.db
    .query("demo_timelineTemplateMilestones")
    .withIndex("by_template_and_order", (q) => q.eq("templateKey", templateKey))
    .take(100);
}

export async function getMilestone(
  ctx: ReadCtx,
  templateKey: string,
  milestoneKey: string
) {
  return await ctx.db
    .query("demo_timelineTemplateMilestones")
    .withIndex("by_milestone", (q) =>
      q.eq("templateKey", templateKey).eq("milestoneKey", milestoneKey)
    )
    .unique();
}

export async function listSubmilestones(
  ctx: ReadCtx,
  templateKey: string,
  milestoneKey: string
) {
  return await ctx.db
    .query("demo_timelineTemplateSubmilestones")
    .withIndex("by_milestone_and_order", (q) =>
      q.eq("templateKey", templateKey).eq("milestoneKey", milestoneKey)
    )
    .take(100);
}

export async function listSubmilestonesForTemplate(ctx: ReadCtx, templateKey: string) {
  const rows = [];
  const milestones = await listMilestones(ctx, templateKey);
  for (const milestoneRow of milestones) {
    rows.push(
      ...(await listSubmilestones(ctx, templateKey, milestoneRow.milestoneKey))
    );
  }
  return rows;
}

export async function listTemplateGuidanceRows(ctx: ReadCtx, templateKey: string) {
  return await ctx.db
    .query("demo_timelineTemplateMilestoneGuidance")
    .withIndex("by_template", (q) => q.eq("templateKey", templateKey))
    .take(100);
}

export async function getTemplateGuidance(
  ctx: ReadCtx,
  templateKey: string,
  milestoneKey: string
) {
  return await ctx.db
    .query("demo_timelineTemplateMilestoneGuidance")
    .withIndex("by_milestone", (q) =>
      q.eq("templateKey", templateKey).eq("milestoneKey", milestoneKey)
    )
    .unique();
}

export async function listGuidanceItemsForTemplate(ctx: ReadCtx, templateKey: string) {
  const rows = [];
  for (const guidanceRow of await listTemplateGuidanceRows(ctx, templateKey)) {
    rows.push(...(await listTemplateGuidanceItems(ctx, guidanceRow._id)));
  }
  return rows.sort(
    (a, b) =>
      a.milestoneKey.localeCompare(b.milestoneKey) ||
      a.kind.localeCompare(b.kind) ||
      a.order - b.order
  );
}

export async function listTemplateGuidanceItems(
  ctx: ReadCtx,
  guidanceId: Doc<"demo_timelineTemplateMilestoneGuidance">["_id"]
) {
  return await ctx.db
    .query("demo_timelineTemplateMilestoneGuidanceItems")
    .withIndex("by_guidance", (q) => q.eq("guidanceId", guidanceId))
    .take(100);
}

export async function deleteTemplateGuidance(
  ctx: WriteCtx,
  guidanceId: Doc<"demo_timelineTemplateMilestoneGuidance">["_id"]
) {
  for (const item of await listTemplateGuidanceItems(ctx, guidanceId)) {
    await ctx.db.delete(item._id);
  }
  await ctx.db.delete(guidanceId);
}

export async function replaceTemplateGuidance(
  ctx: WriteCtx,
  templateKey: string,
  row: MilestoneInput
) {
  const existing = await getTemplateGuidance(
    ctx,
    templateKey,
    row.milestoneKey
  );
  if (existing) {
    await deleteTemplateGuidance(ctx, existing._id);
  }
  const guidanceId = await ctx.db.insert(
    "demo_timelineTemplateMilestoneGuidance",
    {
      createdAt: NOW,
      milestoneKey: row.milestoneKey,
      templateKey,
      updatedAt: NOW,
    }
  );
  const guidance = normalizeSiteVisitGuidance(
    row.siteVisitGuidance,
    defaultSiteVisitGuidance(
      row.milestoneKey,
      row.name,
      row.submilestones.map((subRow) => subRow.name)
    )
  );
  for (const item of guidanceToItems(guidance)) {
    await ctx.db.insert("demo_timelineTemplateMilestoneGuidanceItems", {
      createdAt: NOW,
      guidanceId,
      kind: item.kind,
      milestoneKey: row.milestoneKey,
      order: item.order ?? 0,
      templateKey,
      text: item.text,
      updatedAt: NOW,
    });
  }
}

export async function listScenarios(ctx: ReadCtx, templateKey: string) {
  const rows = await ctx.db
    .query("demo_timelineDrawScenarios")
    .withIndex("by_template", (q) => q.eq("templateKey", templateKey))
    .take(50);
  return rows.sort(
    (a, b) =>
      a.sortOrder - b.sortOrder || a.scenarioKey.localeCompare(b.scenarioKey)
  );
}

export async function getScenario(
  ctx: ReadCtx,
  templateKey: string,
  scenarioKey: string
) {
  return await ctx.db
    .query("demo_timelineDrawScenarios")
    .withIndex("by_scenario", (q) =>
      q.eq("templateKey", templateKey).eq("scenarioKey", scenarioKey)
    )
    .unique();
}

export async function listScenarioDraws(
  ctx: ReadCtx,
  templateKey: string,
  scenarioKey: string
) {
  const rows = await ctx.db
    .query("demo_timelineDrawScenarioDraws")
    .withIndex("by_scenario_and_order", (q) =>
      q.eq("templateKey", templateKey).eq("scenarioKey", scenarioKey)
    )
    .take(100);
  return rows.sort(
    (a, b) => a.order - b.order || a.drawKey.localeCompare(b.drawKey)
  );
}

export async function insertEvent(
  ctx: WriteCtx,
  row: Omit<
    Doc<"demo_timelineSettingsEvents">,
    "_creationTime" | "_id" | "actorPersona" | "createdAt"
  >
) {
  await ctx.db.insert("demo_timelineSettingsEvents", {
    actorPersona: "demo-operator",
    createdAt: NOW,
    ...row,
  });
}
