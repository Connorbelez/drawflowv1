/**
 * Production proposals settings helpers bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { defaultSiteVisitGuidance, guidanceHtmlExceedsMaxLength, normalizeSiteVisitGuidance, SITE_VISIT_GUIDANCE_HTML_MAX_LENGTH } from "../demo_site_visit_guidance";
import { type Id, type MutationCtx, type QueryCtx } from "../types";
import { type ProductionSettingsSiteVisitGuidanceInput, TOTAL_BPS, PRODUCTION_SETTINGS_HANDOFF_GAP_DAYS } from "./contracts_foundation.js";
import { type ProductionDefaultScenarioDraw, PRODUCTION_DEFAULT_TEMPLATES } from "./seed_template_defaults.js";
import { deleteTemplateSubmilestones, ensureDrawScheduleScenario } from "./seed_template_writer.js";
import { listProductionScenarioDraws } from "./storage_helpers.js";

export async function getProductionSettingsTemplate(
  ctx: QueryCtx | MutationCtx,
  brokerageId: Id<"brokerages">,
  templateKey: string,
) {
  return await ctx.db
    .query("proposalTemplates")
    .withIndex("by_brokerage_template", (q) =>
      q.eq("brokerageId", brokerageId).eq("templateKey", templateKey),
    )
    .unique();
}

export async function getProductionSettingsScenario(
  ctx: QueryCtx | MutationCtx,
  templateId: Id<"proposalTemplates">,
  scenarioKey: string,
) {
  return await ctx.db
    .query("drawScheduleScenarios")
    .withIndex("by_template_scenario", (q) =>
      q.eq("templateId", templateId).eq("scenarioKey", scenarioKey),
    )
    .unique();
}

export async function upsertProductionSettingsTemplate(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    description: string;
    isDefault: boolean;
    now: number;
    organizationId: string;
    summary: string;
    templateKey: string;
    title: string;
  },
) {
  const existing = await getProductionSettingsTemplate(
    ctx,
    input.brokerageId,
    input.templateKey,
  );
  const payload = {
    isDefault: input.isDefault,
    status: "active" as const,
    summary: input.summary || input.description,
    title: input.title.trim() || "Production template",
    updatedAt: input.now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }
  return await ctx.db.insert("proposalTemplates", {
    ...payload,
    brokerageId: input.brokerageId,
    createdAt: input.now,
    organizationId: input.organizationId,
    templateKey: input.templateKey,
  });
}

export async function replaceProductionSettingsMilestones(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    milestones: Array<{
      dependencyKeys: string[];
      durationDays: number;
      included: boolean;
      milestoneKey: string;
      name: string;
      order: number;
      percentageBps: number;
      siteVisitGuidance?: ProductionSettingsSiteVisitGuidanceInput;
      submilestones: Array<{
        durationDays: number;
        fieldGuidance?: {
          cameraAnglesTiptapJson: string;
          whatToVerifyTiptapJson: string;
        };
        name: string;
        order: number;
        percentageBps: number;
        scopeOfWorkTiptapJson?: string;
        submilestoneKey: string;
      }>;
      type: string;
    }>;
    now: number;
    organizationId: string;
    templateId: Id<"proposalTemplates">;
  },
) {
  const existing = await ctx.db
    .query("proposalTemplateMilestones")
    .withIndex("by_template", (q) => q.eq("templateId", input.templateId))
    .collect();
  for (const milestone of existing) {
    await deleteTemplateSubmilestones(ctx, milestone._id);
    await ctx.db.delete(milestone._id);
  }
  const includedRows = input.milestones
    .filter((row) => row.included)
    .slice()
    .sort(
      (a, b) =>
        a.order - b.order || a.milestoneKey.localeCompare(b.milestoneKey),
    );
  for (const [index, row] of includedRows.entries()) {
    const milestoneId = await ctx.db.insert("proposalTemplateMilestones", {
      archetypeKey: row.type || row.milestoneKey,
      brokerageId: input.brokerageId,
      createdAt: input.now,
      dependencyKeys: row.dependencyKeys.filter((dependencyKey) =>
        includedRows.some(
          (candidate) => candidate.milestoneKey === dependencyKey,
        ),
      ),
      durationDays: Math.max(1, Math.round(row.durationDays)),
      key: row.milestoneKey,
      name: row.name.trim(),
      order: index + 1,
      organizationId: input.organizationId,
      percentageBps: Math.max(0, Math.round(row.percentageBps)),
      siteVisitGuidance: normalizeProductionSettingsGuidance(row),
      templateId: input.templateId,
      updatedAt: input.now,
    });
    for (const [subIndex, submilestone] of row.submilestones.entries()) {
      await ctx.db.insert("proposalTemplateSubmilestones", {
        brokerageId: input.brokerageId,
        createdAt: input.now,
        durationDays: Math.max(1, Math.round(submilestone.durationDays)),
        ...(submilestone.fieldGuidance === undefined
          ? {}
          : { fieldGuidance: submilestone.fieldGuidance }),
        key: submilestone.submilestoneKey,
        milestoneKey: row.milestoneKey,
        name: submilestone.name.trim(),
        order: subIndex + 1,
        organizationId: input.organizationId,
        percentageBps: Math.max(0, Math.round(submilestone.percentageBps)),
        ...(submilestone.scopeOfWorkTiptapJson === undefined
          ? {}
          : { scopeOfWorkTiptapJson: submilestone.scopeOfWorkTiptapJson }),
        templateMilestoneId: milestoneId,
        updatedAt: input.now,
      });
    }
  }
}

export async function replaceProductionSettingsScenarios(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    now: number;
    organizationId: string;
    scenarios: Array<{
      description: string;
      draws: ProductionDefaultScenarioDraw[];
      isActive: boolean;
      isDefault: boolean;
      name: string;
      scenarioKey: string;
      sortOrder: number;
    }>;
    templateId: Id<"proposalTemplates">;
  },
) {
  const desiredKeys = new Set(input.scenarios.map((row) => row.scenarioKey));
  const existing = await ctx.db
    .query("drawScheduleScenarios")
    .withIndex("by_template", (q) => q.eq("templateId", input.templateId))
    .collect();
  for (const stale of existing.filter(
    (row) => !desiredKeys.has(row.scenarioKey),
  )) {
    await deleteProductionScenarioDraws(
      ctx,
      input.templateId,
      stale.scenarioKey,
    );
    await ctx.db.patch(stale._id, {
      status: "inactive",
      updatedAt: input.now,
    });
  }
  for (const [index, scenario] of input.scenarios.entries()) {
    await ensureDrawScheduleScenario(ctx, {
      ...input,
      description: scenario.description,
      isActive: scenario.isActive,
      isDefault: scenario.isDefault,
      name: scenario.name,
      scenarioKey: scenario.scenarioKey,
      sortOrder: scenario.sortOrder ?? index,
    });
    await replaceProductionScenarioDraws(ctx, {
      ...input,
      draws: scenario.draws,
      scenarioKey: scenario.scenarioKey,
    });
  }
}

export async function replaceProductionScenarioDraws(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    draws: ProductionDefaultScenarioDraw[];
    now: number;
    organizationId: string;
    scenarioKey: string;
    templateId: Id<"proposalTemplates">;
  },
) {
  await deleteProductionScenarioDraws(ctx, input.templateId, input.scenarioKey);
  for (const [index, draw] of input.draws.entries()) {
    await ctx.db.insert("drawScheduleScenarioRows", {
      amountBps: Math.max(0, Math.round(draw.amountBps)),
      brokerageId: input.brokerageId,
      createdAt: input.now,
      drawKey: draw.drawKey,
      label: draw.label.trim() || `Draw ${String(index + 1).padStart(2, "0")}`,
      order: draw.order ?? index,
      organizationId: input.organizationId,
      reviewNote: draw.reviewNote,
      scenarioKey: input.scenarioKey,
      templateId: input.templateId,
      timingDay: Math.max(0, Math.round(draw.timingDay)),
      updatedAt: input.now,
    });
  }
}

export async function deleteProductionScenarioDraws(
  ctx: MutationCtx,
  templateId: Id<"proposalTemplates">,
  scenarioKey: string,
) {
  const rows = await listProductionScenarioDraws(ctx, templateId, scenarioKey);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

function normalizeProductionSettingsGuidance(row: {
  milestoneKey: string;
  name: string;
  siteVisitGuidance?: ProductionSettingsSiteVisitGuidanceInput;
  submilestones: Array<{ name: string }>;
}) {
  return normalizeSiteVisitGuidance(
    row.siteVisitGuidance,
    defaultSiteVisitGuidance(
      row.milestoneKey,
      row.name,
      row.submilestones.map((submilestone) => submilestone.name),
    ),
  );
}

export function validateProductionTemplateRows(
  rows: Array<{
    durationDays: number;
    included: boolean;
    milestoneKey: string;
    name: string;
    order: number;
    percentageBps: number;
    siteVisitGuidance?: ProductionSettingsSiteVisitGuidanceInput;
    submilestones: Array<{ name: string }>;
  }>,
) {
  const included = rows.filter((row) => row.included);
  const total = included.reduce((sum, row) => sum + row.percentageBps, 0);
  if (total !== TOTAL_BPS) {
    throw new Error(
      `Included PoC total must equal 100.00%; received ${(total / 100).toFixed(2)}%.`,
    );
  }
  for (const row of included) {
    if (!row.name.trim()) {
      throw new Error("Included milestones require names.");
    }
    if (row.durationDays <= 0) {
      throw new Error("Included milestones require positive durations.");
    }
    if (row.submilestones.some((submilestone) => !submilestone.name.trim())) {
      throw new Error("Sub-milestones require names.");
    }
    const guidance = normalizeProductionSettingsGuidance(row);
    if (guidanceHtmlExceedsMaxLength(guidance)) {
      throw new Error(
        `Field guidance must be ${SITE_VISIT_GUIDANCE_HTML_MAX_LENGTH} characters or less per section.`,
      );
    }
  }
  validateProductionMilestoneHandoffGaps(rows);
}

export function validateProductionScenarios(
  rows: Array<{
    draws: Array<{ amountBps: number; label: string; timingDay: number }>;
    isActive: boolean;
    name: string;
  }>,
  milestones: Array<{
    durationDays: number;
    included: boolean;
    milestoneKey: string;
    name: string;
    order: number;
  }>,
) {
  const names = new Set<string>();
  for (const row of rows) {
    const name = row.name.trim().toLowerCase();
    if (!name) {
      throw new Error("Scenario name is required.");
    }
    if (names.has(name)) {
      throw new Error("Scenario names must be unique within a template.");
    }
    names.add(name);
    validateProductionScenarioDrawRows(row.draws, milestones);
  }
  if (rows.length > 0 && rows.filter((row) => row.isActive).length !== 1) {
    throw new Error("Exactly one active scenario is required.");
  }
}

function validateProductionScenarioDrawRows(
  rows: Array<{ amountBps: number; label: string; timingDay: number }>,
  milestones: Array<{
    durationDays: number;
    included: boolean;
    milestoneKey: string;
    name: string;
    order: number;
  }>,
) {
  if (rows.length === 0) {
    throw new Error("Scenario requires at least one draw.");
  }
  const total = rows.reduce((sum, row) => sum + row.amountBps, 0);
  if (total !== TOTAL_BPS) {
    throw new Error(
      `Draw total must equal 100.00%; received ${(total / 100).toFixed(2)}%.`,
    );
  }
  for (const row of rows) {
    if (!row.label.trim()) {
      throw new Error("Draw labels are required.");
    }
    if (row.timingDay < 0) {
      throw new Error("Draw timing day must be non-negative.");
    }
    if (row.amountBps <= 0) {
      throw new Error("Draw percentage must be positive.");
    }
  }
  const includedMilestones = sortedProductionIncludedMilestones(milestones);
  const firstCompletedWorkDay = productionMilestoneEndDay(
    includedMilestones,
    0,
  );
  if (rows.some((row) => row.timingDay < firstCompletedWorkDay)) {
    throw new Error(
      "Reimbursement draws must be scheduled after completed work. Advance funding is not supported.",
    );
  }
}

function validateProductionMilestoneHandoffGaps(
  rows: Array<{
    durationDays: number;
    included: boolean;
    milestoneKey: string;
    name: string;
    order: number;
  }>,
) {
  const included = sortedProductionIncludedMilestones(rows);
  for (let index = 0; index < included.length - 1; index += 1) {
    const gap =
      productionMilestoneStartDay(included, index + 1) -
      productionMilestoneEndDay(included, index);
    if (gap > PRODUCTION_SETTINGS_HANDOFF_GAP_DAYS) {
      throw new Error(
        `Milestone handoff gap cannot exceed ${PRODUCTION_SETTINGS_HANDOFF_GAP_DAYS} days.`,
      );
    }
  }
}

function sortedProductionIncludedMilestones(
  rows: Array<{
    durationDays: number;
    included: boolean;
    milestoneKey: string;
    name: string;
    order: number;
  }>,
) {
  return rows
    .filter((row) => row.included)
    .slice()
    .sort(
      (a, b) =>
        a.order - b.order || a.milestoneKey.localeCompare(b.milestoneKey),
    );
}

function productionMilestoneStartDay(
  rows: Array<{ durationDays: number }>,
  index: number,
) {
  return rows
    .slice(0, index)
    .reduce(
      (day, row) =>
        day + row.durationDays + PRODUCTION_SETTINGS_HANDOFF_GAP_DAYS,
      0,
    );
}

function productionMilestoneEndDay(
  rows: Array<{ durationDays: number }>,
  index: number,
) {
  return (
    productionMilestoneStartDay(rows, index) + (rows[index]?.durationDays ?? 0)
  );
}

function assertHardCodedProductionDefaultTemplatesConform() {
  for (const template of PRODUCTION_DEFAULT_TEMPLATES) {
    const milestones = template.milestones.map((milestone, order) => ({
      durationDays: milestone.durationDays,
      included: true,
      milestoneKey: milestone.key,
      name: milestone.name,
      order,
      percentageBps: milestone.percentageBps,
      siteVisitGuidance: milestone.siteVisitGuidance,
      submilestones: milestone.submilestones.map((submilestone) => ({
        name: submilestone.name,
      })),
    }));
    validateProductionTemplateRows(milestones);
    validateProductionScenarios(
      template.scenarios.map((scenario) => ({
        draws: scenario.draws,
        isActive: scenario.isActive,
        name: scenario.name,
      })),
      milestones,
    );
  }
}

assertHardCodedProductionDefaultTemplatesConform();

export function requiredProductionDefaultTemplate(templateKey: string) {
  const seed = PRODUCTION_DEFAULT_TEMPLATES.find(
    (template) => template.templateKey === templateKey,
  );
  if (!seed) {
    throw new Error(`Unknown production template: ${templateKey}`);
  }
  return seed;
}

export async function ensureProposalTemplate(
  ctx: MutationCtx,
  input: { brokerageId: Id<"brokerages">; now: number; organizationId: string },
) {
  const existing = await ctx.db
    .query("proposalTemplates")
    .withIndex("by_brokerage_template", (q) =>
      q
        .eq("brokerageId", input.brokerageId)
        .eq("templateKey", "single-family-full-build"),
    )
    .unique();
  if (existing) {
    return existing._id;
  }
  return await ctx.db.insert("proposalTemplates", {
    brokerageId: input.brokerageId,
    createdAt: input.now,
    isDefault: true,
    organizationId: input.organizationId,
    status: "active",
    summary: "Production foundation seed template",
    templateKey: "single-family-full-build",
    title: "Single Family Full Build",
    updatedAt: input.now,
  });
}
