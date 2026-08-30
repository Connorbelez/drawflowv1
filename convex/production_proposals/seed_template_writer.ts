/**
 * Production proposals seed template writer bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type SiteVisitGuidance } from "../demo_site_visit_guidance";
import { type Id, type MutationCtx } from "../types";
import { PROPOSAL_COLUMNS, DEFAULT_WORKFLOW_RULE_KEY } from "./contracts_foundation.js";
import { titleCase } from "./legacy_seed.js";
import { type ProductionDefaultScenario } from "./seed_foundation.js";
import { type ProductionDefaultMilestone, type ProductionDefaultTemplate, PRODUCTION_DEFAULT_TEMPLATES } from "./seed_template_defaults.js";
import { replaceProductionScenarioDraws, deleteProductionScenarioDraws } from "./settings_helpers.js";

export async function seedProductionDefaultTemplates(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    now: number;
    organizationId: string;
  },
) {
  const result = {
    draws: 0,
    milestones: 0,
    scenarios: 0,
    submilestones: 0,
    templates: 0,
  };

  for (const template of PRODUCTION_DEFAULT_TEMPLATES) {
    const templateId = await ensureProductionDefaultTemplate(ctx, {
      ...input,
      template,
    });
    result.templates += 1;

    for (const milestone of template.milestones) {
      await ensureMilestoneArchetype(ctx, {
        ...input,
        description: milestone.archetypeDescription,
        key: milestone.archetypeKey,
        name: titleCase(milestone.archetypeKey),
        sortOrder: result.milestones + 1,
      });
    }

    await replaceProductionDefaultMilestones(ctx, {
      ...input,
      template,
      templateId,
    });
    result.milestones += template.milestones.length;
    result.submilestones += template.milestones.reduce(
      (sum, milestone) => sum + milestone.submilestones.length,
      0,
    );

    await replaceProductionDefaultScenarios(ctx, {
      ...input,
      scenarios: template.scenarios,
      templateId,
    });
    result.scenarios += template.scenarios.length;
    result.draws += template.scenarios.reduce(
      (sum, scenario) => sum + scenario.draws.length,
      0,
    );
  }

  return result;
}

export async function ensureProductionDefaultTemplate(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    now: number;
    organizationId: string;
    template: ProductionDefaultTemplate;
  },
) {
  const existing = await ctx.db
    .query("proposalTemplates")
    .withIndex("by_brokerage_template", (q) =>
      q
        .eq("brokerageId", input.brokerageId)
        .eq("templateKey", input.template.templateKey),
    )
    .unique();
  const payload = {
    isDefault: input.template.isDefault,
    status: "active" as const,
    summary: input.template.summary,
    title: input.template.title,
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
    templateKey: input.template.templateKey,
  });
}

export async function replaceProductionDefaultMilestones(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    now: number;
    organizationId: string;
    template: ProductionDefaultTemplate;
    templateId: Id<"proposalTemplates">;
  },
) {
  const desiredKeys = new Set(
    input.template.milestones.map((milestone) => milestone.key),
  );
  const existing = await ctx.db
    .query("proposalTemplateMilestones")
    .withIndex("by_template", (q) => q.eq("templateId", input.templateId))
    .collect();

  for (const staleMilestone of existing.filter(
    (milestone) => !desiredKeys.has(milestone.key),
  )) {
    await deleteTemplateSubmilestones(ctx, staleMilestone._id);
    await ctx.db.delete(staleMilestone._id);
  }

  for (const [index, milestone] of input.template.milestones.entries()) {
    const templateMilestoneId = await ensureTemplateMilestone(ctx, {
      ...input,
      archetypeKey: milestone.archetypeKey,
      dependencyKeys: milestone.dependencyKeys,
      durationDays: milestone.durationDays,
      key: milestone.key,
      name: milestone.name,
      order: index + 1,
      percentageBps: milestone.percentageBps,
      siteVisitGuidance: milestone.siteVisitGuidance,
    });
    await replaceProductionDefaultSubmilestones(ctx, {
      ...input,
      milestone,
      templateMilestoneId,
    });
  }
}

async function replaceProductionDefaultSubmilestones(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    milestone: ProductionDefaultMilestone;
    now: number;
    organizationId: string;
    templateMilestoneId: Id<"proposalTemplateMilestones">;
  },
) {
  const desiredKeys = new Set(
    input.milestone.submilestones.map((submilestone) => submilestone.key),
  );
  const existing = await ctx.db
    .query("proposalTemplateSubmilestones")
    .withIndex("by_template_milestone", (q) =>
      q.eq("templateMilestoneId", input.templateMilestoneId),
    )
    .collect();
  for (const staleSubmilestone of existing.filter(
    (submilestone) => !desiredKeys.has(submilestone.key),
  )) {
    await ctx.db.delete(staleSubmilestone._id);
  }

  for (const [index, submilestone] of input.milestone.submilestones.entries()) {
    await ensureTemplateSubmilestone(ctx, {
      ...input,
      durationDays: submilestone.durationDays,
      key: submilestone.key,
      milestoneKey: input.milestone.key,
      name: submilestone.name,
      order: index + 1,
      percentageBps: submilestone.percentageBps,
    });
  }
}

export async function deleteTemplateSubmilestones(
  ctx: MutationCtx,
  templateMilestoneId: Id<"proposalTemplateMilestones">,
) {
  const submilestones = await ctx.db
    .query("proposalTemplateSubmilestones")
    .withIndex("by_template_milestone", (q) =>
      q.eq("templateMilestoneId", templateMilestoneId),
    )
    .collect();
  for (const submilestone of submilestones) {
    await ctx.db.delete(submilestone._id);
  }
}

async function replaceProductionDefaultScenarios(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    now: number;
    organizationId: string;
    scenarios: ProductionDefaultScenario[];
    templateId: Id<"proposalTemplates">;
  },
) {
  const desiredKeys = new Set(
    input.scenarios.map((scenario) => scenario.scenarioKey),
  );
  const existing = await ctx.db
    .query("drawScheduleScenarios")
    .withIndex("by_template", (q) => q.eq("templateId", input.templateId))
    .collect();
  for (const staleScenario of existing.filter(
    (scenario) => !desiredKeys.has(scenario.scenarioKey),
  )) {
    await deleteProductionScenarioDraws(
      ctx,
      input.templateId,
      staleScenario.scenarioKey,
    );
    await ctx.db.patch(staleScenario._id, {
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
      sortOrder: index,
    });
    await replaceProductionScenarioDraws(ctx, {
      ...input,
      draws: scenario.draws,
      scenarioKey: scenario.scenarioKey,
    });
  }
}

export async function ensureProductionSettingsRows(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    now: number;
    organizationId: string;
    templateId: Id<"proposalTemplates">;
  },
) {
  for (const archetype of [
    {
      description:
        "Site prep, excavation, footings, forms, and foundation pour.",
      key: "foundation",
      name: "Foundation",
      sortOrder: 1,
    },
    {
      description: "Framing, roof dry-in, windows, and exterior enclosure.",
      key: "shell",
      name: "Shell and Dry-In",
      sortOrder: 2,
    },
    {
      description: "MEP rough-ins, insulation, drywall, finishes, and punch.",
      key: "interior-finish",
      name: "Interior Finish",
      sortOrder: 3,
    },
  ]) {
    await ensureMilestoneArchetype(ctx, { ...input, ...archetype });
  }

  const foundationMilestoneId = await ensureTemplateMilestone(ctx, {
    ...input,
    archetypeKey: "foundation",
    dependencyKeys: [],
    durationDays: 30,
    key: "foundation",
    name: "Foundation",
    order: 1,
    percentageBps: 2500,
  });
  await ensureTemplateSubmilestone(ctx, {
    ...input,
    durationDays: 12,
    key: "forms-and-pour",
    milestoneKey: "foundation",
    name: "Forms and pour",
    order: 1,
    percentageBps: 1200,
    templateMilestoneId: foundationMilestoneId,
  });
  await ensureTemplateSubmilestone(ctx, {
    ...input,
    durationDays: 8,
    key: "waterproofing",
    milestoneKey: "foundation",
    name: "Waterproofing and backfill",
    order: 2,
    percentageBps: 1300,
    templateMilestoneId: foundationMilestoneId,
  });

  await ensureTemplateMilestone(ctx, {
    ...input,
    archetypeKey: "shell",
    dependencyKeys: ["foundation"],
    durationDays: 45,
    key: "shell-dry-in",
    name: "Shell and Dry-In",
    order: 2,
    percentageBps: 3500,
  });
  await ensureTemplateMilestone(ctx, {
    ...input,
    archetypeKey: "interior-finish",
    dependencyKeys: ["shell-dry-in"],
    durationDays: 60,
    key: "interior-finish",
    name: "Interior Finish",
    order: 3,
    percentageBps: 4000,
  });

  for (const scenario of [
    {
      description:
        "Cheapest feasible draw timing and reimbursement amount assumptions.",
      isActive: true,
      isDefault: true,
      name: "Cheapest Feasible",
      scenarioKey: "cheapest-feasible",
      sortOrder: 0,
    },
    {
      description: "Fastest draw timing and reimbursement amount assumptions.",
      isActive: false,
      isDefault: false,
      name: "Fastest",
      scenarioKey: "fastest",
      sortOrder: 1,
    },
    {
      description:
        "Capital-constrained draw timing and reimbursement amount assumptions.",
      isActive: false,
      isDefault: false,
      name: "Capital-Constrained",
      scenarioKey: "capital-constrained",
      sortOrder: 2,
    },
  ]) {
    await ensureDrawScheduleScenario(ctx, { ...input, ...scenario });
  }
}

async function ensureMilestoneArchetype(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    description: string;
    key: string;
    name: string;
    now: number;
    organizationId: string;
    sortOrder: number;
  },
) {
  const existing = await ctx.db
    .query("milestoneArchetypes")
    .withIndex("by_brokerage_key", (q) =>
      q.eq("brokerageId", input.brokerageId).eq("key", input.key),
    )
    .unique();
  const payload = {
    description: input.description,
    name: input.name,
    sortOrder: input.sortOrder,
    status: "active" as const,
    updatedAt: input.now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }
  return await ctx.db.insert("milestoneArchetypes", {
    ...payload,
    brokerageId: input.brokerageId,
    createdAt: input.now,
    key: input.key,
    organizationId: input.organizationId,
  });
}

async function ensureTemplateMilestone(
  ctx: MutationCtx,
  input: {
    archetypeKey: string;
    brokerageId: Id<"brokerages">;
    dependencyKeys: string[];
    durationDays: number;
    key: string;
    name: string;
    now: number;
    order: number;
    organizationId: string;
    percentageBps: number;
    siteVisitGuidance?: SiteVisitGuidance;
    templateId: Id<"proposalTemplates">;
  },
) {
  const existing = (
    await ctx.db
      .query("proposalTemplateMilestones")
      .withIndex("by_template", (q) => q.eq("templateId", input.templateId))
      .collect()
  ).find((row) => row.key === input.key);
  const payload = {
    archetypeKey: input.archetypeKey,
    dependencyKeys: input.dependencyKeys,
    durationDays: input.durationDays,
    name: input.name,
    order: input.order,
    percentageBps: input.percentageBps,
    ...(input.siteVisitGuidance
      ? { siteVisitGuidance: input.siteVisitGuidance }
      : {}),
    updatedAt: input.now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }
  return await ctx.db.insert("proposalTemplateMilestones", {
    ...payload,
    brokerageId: input.brokerageId,
    createdAt: input.now,
    key: input.key,
    organizationId: input.organizationId,
    templateId: input.templateId,
  });
}

async function ensureTemplateSubmilestone(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    durationDays: number;
    key: string;
    milestoneKey: string;
    name: string;
    now: number;
    order: number;
    organizationId: string;
    percentageBps: number;
    templateMilestoneId: Id<"proposalTemplateMilestones">;
  },
) {
  const existing = (
    await ctx.db
      .query("proposalTemplateSubmilestones")
      .withIndex("by_template_milestone", (q) =>
        q.eq("templateMilestoneId", input.templateMilestoneId),
      )
      .collect()
  ).find((row) => row.key === input.key);
  const payload = {
    durationDays: input.durationDays,
    name: input.name,
    order: input.order,
    percentageBps: input.percentageBps,
    updatedAt: input.now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }
  return await ctx.db.insert("proposalTemplateSubmilestones", {
    ...payload,
    brokerageId: input.brokerageId,
    createdAt: input.now,
    key: input.key,
    milestoneKey: input.milestoneKey,
    organizationId: input.organizationId,
    templateMilestoneId: input.templateMilestoneId,
  });
}

export async function ensureDrawScheduleScenario(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    description: string;
    isActive: boolean;
    isDefault: boolean;
    name: string;
    now: number;
    organizationId: string;
    scenarioKey: string;
    sortOrder: number;
    templateId: Id<"proposalTemplates">;
  },
) {
  const existing = await ctx.db
    .query("drawScheduleScenarios")
    .withIndex("by_template_scenario", (q) =>
      q.eq("templateId", input.templateId).eq("scenarioKey", input.scenarioKey),
    )
    .unique();
  const payload = {
    description: input.description,
    isActive: input.isActive,
    isDefault: input.isDefault,
    name: input.name,
    sortOrder: input.sortOrder,
    status: "active" as const,
    updatedAt: input.now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }
  return await ctx.db.insert("drawScheduleScenarios", {
    ...payload,
    brokerageId: input.brokerageId,
    createdAt: input.now,
    organizationId: input.organizationId,
    scenarioKey: input.scenarioKey,
    templateId: input.templateId,
  });
}

export async function ensureWorkflowRule(
  ctx: MutationCtx,
  input: { brokerageId: Id<"brokerages">; now: number; organizationId: string },
) {
  const existing = await ctx.db
    .query("workflowRules")
    .withIndex("by_brokerage_rule", (q) =>
      q
        .eq("brokerageId", input.brokerageId)
        .eq("ruleKey", DEFAULT_WORKFLOW_RULE_KEY),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      status: "active",
      updatedAt: input.now,
    });
    return existing._id;
  }
  return await ctx.db.insert("workflowRules", {
    allowPermitWaiverByRoles: ["admin", "principle-broker"],
    brokerageId: input.brokerageId,
    createdAt: input.now,
    organizationId: input.organizationId,
    proposalStates: [...PROPOSAL_COLUMNS],
    requirePermitForApproval: true,
    ruleKey: DEFAULT_WORKFLOW_RULE_KEY,
    settings: {
      reimbursementOnly: true,
      interestStartsOn: "funds_released",
    },
    status: "active",
    updatedAt: input.now,
    version: 1,
  });
}
