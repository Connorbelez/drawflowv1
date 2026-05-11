import { v } from "convex/values";

import {
  publicMutation,
  publicQuery,
  withMutationTiming,
  withQueryTiming,
} from "./fluent";

const ORG_KEY = "org_fairlend_demo";
const BUILDER_PERSONA = "builder_lead";
const LENDER_DRAW_POLICY_LIMIT_CENTS = 48_000_000;
const SEED_VERSION = 1;
const DEMO_START_DATE = "2026-06-01";

type DemoCtx = {
  db: any;
};

type TemplatePreset = {
  dependencyKeys: string[];
  durationDays: number;
  key: string;
  name: string;
  percentageBps: number;
  type: string;
};

type BuilderTemplate = {
  description: string;
  isDefault: boolean;
  milestonePresets: TemplatePreset[];
  summary: string;
  templateKey: string;
  title: string;
};

type BankItem = {
  bankItemKey: string;
  dependencyKeys: string[];
  durationDays: number;
  name: string;
  percentageBps: number;
  type: string;
};

const BUILDER_TEMPLATES: BuilderTemplate[] = [
  {
    description:
      "Selective demo, rough-in upgrades, envelope repairs, interiors, inspection closeout.",
    isDefault: false,
    milestonePresets: [
      preset(
        "renovation_permits",
        "Permit updates and mobilization",
        800,
        10,
        "permitting",
        []
      ),
      preset(
        "selective_demo",
        "Selective demolition",
        1400,
        16,
        "demolition",
        []
      ),
      preset(
        "structural_repairs",
        "Structural repairs",
        1800,
        24,
        "foundation_structural",
        ["selective_demo"]
      ),
      preset(
        "mep_rework",
        "MEP rework",
        1500,
        21,
        "mechanical_electrical_plumbing",
        ["structural_repairs"]
      ),
      preset(
        "envelope_repairs",
        "Envelope repairs",
        1300,
        18,
        "exterior_envelope",
        ["structural_repairs"]
      ),
      preset(
        "renovation_interiors",
        "Interior rebuild",
        2400,
        36,
        "interior_finish",
        ["mep_rework"]
      ),
      preset(
        "renovation_closeout",
        "Inspection closeout",
        800,
        10,
        "closeout",
        ["renovation_interiors"]
      ),
    ],
    summary: "7 preset milestones",
    templateKey: "single_family_renovation",
    title: "Single Family Renovation",
  },
  {
    description:
      "Production-ready path with permits, sitework, foundation, framing, MEP, envelope, interiors, punch, and closeout.",
    isDefault: true,
    milestonePresets: [
      preset(
        "permits_mobilization",
        "Permits and mobilization",
        500,
        14,
        "permitting",
        []
      ),
      preset(
        "sitework_excavation",
        "Sitework and excavation",
        1000,
        24,
        "site_preparation",
        []
      ),
      preset(
        "foundation_slab",
        "Foundation and slab",
        1300,
        21,
        "foundation_structural",
        ["sitework_excavation"]
      ),
      preset(
        "framing_dried_in",
        "Framing dried in",
        2300,
        35,
        "foundation_structural",
        ["foundation_slab"]
      ),
      preset(
        "mep_rough_ins",
        "MEP rough-ins",
        1500,
        28,
        "mechanical_electrical_plumbing",
        ["framing_dried_in"]
      ),
      preset(
        "envelope_weatherproofing",
        "Envelope weatherproofing",
        900,
        24,
        "exterior_envelope",
        ["framing_dried_in"]
      ),
      preset(
        "interior_finishes",
        "Interior finishes",
        1400,
        42,
        "interior_finish",
        ["mep_rough_ins", "envelope_weatherproofing"]
      ),
      preset(
        "exterior_works",
        "Exterior works",
        400,
        18,
        "landscape_exterior",
        ["envelope_weatherproofing"]
      ),
      preset("punch_corrections", "Punch corrections", 400, 14, "closeout", [
        "interior_finishes",
      ]),
      preset(
        "final_inspection_closeout",
        "Final inspection and closeout",
        300,
        10,
        "closeout",
        ["punch_corrections"]
      ),
    ],
    summary: "10 preset milestones",
    templateKey: "single_family_full_build",
    title: "Single Family Full Build",
  },
  {
    description:
      "Multi-unit sitework, stacked framing, shared systems, unit finishes, exterior works, and closeout.",
    isDefault: false,
    milestonePresets: [
      preset(
        "multiplex_permits",
        "Permits and civil mobilization",
        500,
        16,
        "permitting",
        []
      ),
      preset(
        "shared_sitework",
        "Shared sitework and utilities",
        1000,
        28,
        "site_preparation",
        []
      ),
      preset(
        "podium_foundation",
        "Foundation and podium slab",
        1250,
        30,
        "foundation_structural",
        ["shared_sitework"]
      ),
      preset(
        "stacked_framing",
        "Stacked framing and dry-in",
        1900,
        42,
        "foundation_structural",
        ["podium_foundation"]
      ),
      preset(
        "shared_mep",
        "Shared MEP rough-ins",
        1250,
        35,
        "mechanical_electrical_plumbing",
        ["stacked_framing"]
      ),
      preset(
        "unit_rough_ins",
        "Unit-level rough-ins",
        900,
        24,
        "mechanical_electrical_plumbing",
        ["shared_mep"]
      ),
      preset(
        "building_envelope",
        "Building envelope",
        850,
        28,
        "exterior_envelope",
        ["stacked_framing"]
      ),
      preset("unit_finishes", "Unit finishes", 1350, 45, "interior_finish", [
        "unit_rough_ins",
      ]),
      preset(
        "common_areas",
        "Common areas and life safety",
        450,
        20,
        "interior_finish",
        ["unit_finishes"]
      ),
      preset(
        "exterior_site_finish",
        "Exterior site finish",
        350,
        18,
        "landscape_exterior",
        ["building_envelope"]
      ),
      preset(
        "multiplex_closeout",
        "Final inspections and occupancy",
        250,
        12,
        "closeout",
        ["common_areas", "exterior_site_finish"]
      ),
    ],
    summary: "11 preset milestones",
    templateKey: "multiplex_build",
    title: "Multi-plex Build",
  },
];

const BANK_ITEMS: BankItem[] = [
  {
    bankItemKey: "landscape_exterior_punch",
    dependencyKeys: ["exterior_works"],
    durationDays: 14,
    name: "Landscape and exterior punch",
    percentageBps: 400,
    type: "landscape_exterior",
  },
  {
    bankItemKey: "solar_readiness_package",
    dependencyKeys: ["envelope_weatherproofing"],
    durationDays: 10,
    name: "Solar readiness package",
    percentageBps: 250,
    type: "utility",
  },
  {
    bankItemKey: "accessibility_lift",
    dependencyKeys: ["interior_finishes"],
    durationDays: 21,
    name: "Accessibility lift",
    percentageBps: 300,
    type: "accessibility",
  },
];

function preset(
  key: string,
  name: string,
  percentageBps: number,
  durationDays: number,
  type: string,
  dependencyKeys: string[]
): TemplatePreset {
  return { dependencyKeys, durationDays, key, name, percentageBps, type };
}

function now() {
  return Date.now();
}

function allocateByBps(totalCents: number, rows: { percentageBps: number }[]) {
  const allocations = rows.map((row, order) => {
    const raw = totalCents * row.percentageBps;
    return {
      cents: Math.floor(raw / 10_000),
      order,
      remainder: raw % 10_000,
    };
  });
  let remainderCents =
    totalCents -
    allocations.reduce((sum, allocation) => sum + allocation.cents, 0);
  const byRemainder = [...allocations].sort(
    (a, b) => b.remainder - a.remainder || a.order - b.order
  );
  for (const allocation of byRemainder) {
    if (remainderCents <= 0) {
      break;
    }
    allocation.cents += 1;
    remainderCents -= 1;
  }
  return allocations
    .sort((a, b) => a.order - b.order)
    .map((allocation) => allocation.cents);
}

function templateForKey(templateKey: string) {
  return BUILDER_TEMPLATES.find(
    (template) => template.templateKey === templateKey
  );
}

async function ensureTemplates(ctx: DemoCtx) {
  const rows = await ctx.db
    .query("demo_builderProposalTemplates")
    .withIndex("by_org", (q: any) => q.eq("orgKey", ORG_KEY))
    .collect();
  if (rows.length === BUILDER_TEMPLATES.length) {
    return { seeded: false };
  }
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  const createdAt = now();
  for (const template of BUILDER_TEMPLATES) {
    await ctx.db.insert("demo_builderProposalTemplates", {
      createdAt,
      description: template.description,
      isDefault: template.isDefault,
      milestonePresets: template.milestonePresets,
      orgKey: ORG_KEY,
      seedVersion: SEED_VERSION,
      summary: template.summary,
      templateKey: template.templateKey,
      title: template.title,
      updatedAt: createdAt,
    });
  }
  return { seeded: true };
}

async function cleanupBuilderProposalDemo(ctx: DemoCtx) {
  const tables = [
    "demo_builderProposalBoundaryPayloads",
    "demo_builderProposalMilestones",
    "demo_builderProposalEvents",
    "demo_builderProposalDrafts",
    "demo_builderProposalTemplates",
  ] as const;
  for (const table of tables) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_org", (q: any) => q.eq("orgKey", ORG_KEY))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  }
}

async function appendEvent(
  ctx: DemoCtx,
  input: {
    command: string;
    draftId?: string;
    entityKey?: string;
    entityType: string;
    eventType: string;
    newState?: unknown;
    priorState?: unknown;
    reason?: string;
    requirementIds: string[];
    validationIds: string[];
    warnings?: string[];
  }
) {
  await ctx.db.insert("demo_builderProposalEvents", {
    actorPersona: BUILDER_PERSONA,
    command: input.command,
    createdAt: now(),
    draftId: input.draftId,
    entityKey: input.entityKey,
    entityType: input.entityType,
    eventType: input.eventType,
    newState:
      input.newState === undefined ? undefined : JSON.stringify(input.newState),
    orgKey: ORG_KEY,
    priorState:
      input.priorState === undefined
        ? undefined
        : JSON.stringify(input.priorState),
    reason: input.reason,
    requirementIds: input.requirementIds,
    validationIds: input.validationIds,
    warnings: input.warnings ?? [],
  });
}

async function getDraft(ctx: DemoCtx, draftId: string) {
  const draft = await ctx.db.get(draftId);
  if (!draft || draft.orgKey !== ORG_KEY) {
    throw new Error("Builder proposal draft not found.");
  }
  return draft;
}

async function getOptionalDraft(ctx: DemoCtx, draftId: string) {
  const draft = await ctx.db.get(draftId);
  if (!draft || draft.orgKey !== ORG_KEY) {
    return null;
  }
  return draft;
}

async function getDraftMilestones(ctx: DemoCtx, draftId: string) {
  const rows = await ctx.db
    .query("demo_builderProposalMilestones")
    .withIndex("by_draft_order", (q: any) => q.eq("draftId", draftId))
    .collect();
  return rows.sort((a: any, b: any) => a.order - b.order);
}

async function getDraftBoundary(ctx: DemoCtx, draftId: string) {
  const rows = await ctx.db
    .query("demo_builderProposalBoundaryPayloads")
    .withIndex("by_draft", (q: any) => q.eq("draftId", draftId))
    .collect();
  return rows.sort((a: any, b: any) => b.createdAt - a.createdAt)[0] ?? null;
}

function currentBudgetCents(milestones: any[]) {
  return milestones
    .filter((milestone) => milestone.included)
    .reduce((sum, milestone) => sum + milestone.budgetCents, 0);
}

function projectedPeakExposureCents(milestones: any[]) {
  const included = milestones.filter((milestone) => milestone.included);
  let peak = 0;
  for (let index = 0; index < included.length; index += 1) {
    const current = included[index];
    const next = included[index + 1];
    const overlapCents = next ? Math.round(next.budgetCents * 0.35) : 0;
    peak = Math.max(peak, current.budgetCents + overlapCents);
  }
  return peak;
}

function readinessForDraft(draft: any, milestones: any[]) {
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const included = milestones.filter((milestone) => milestone.included);
  const includedByKey = new Map(
    included.map((milestone) => [milestone.key, milestone])
  );

  if (!draft.templateKey) {
    blockingIssues.push("Select a build type template.");
  }
  if (!draft.originalBudgetCents || draft.originalBudgetCents <= 0) {
    blockingIssues.push("Enter a positive total project budget.");
  }
  if (included.length === 0) {
    blockingIssues.push("Include at least one reimbursable milestone.");
  }
  if (
    !draft.borrowerCashAvailabilityCents ||
    draft.borrowerCashAvailabilityCents <= 0
  ) {
    blockingIssues.push("Enter borrower max cash availability.");
  }

  const seenNames = new Set<string>();
  for (const milestone of included) {
    const normalizedName = milestone.name.trim().toLowerCase();
    if (!normalizedName) {
      blockingIssues.push("Every included milestone needs a name.");
    } else if (seenNames.has(normalizedName)) {
      blockingIssues.push(`Duplicate milestone name: ${milestone.name}.`);
    }
    seenNames.add(normalizedName);
    if (milestone.budgetCents <= 0) {
      blockingIssues.push(`${milestone.name} needs a positive budget.`);
    }
    if (milestone.durationDays <= 0) {
      blockingIssues.push(`${milestone.name} needs a positive duration.`);
    }
    for (const dependencyKey of milestone.dependencyKeys) {
      const dependency = includedByKey.get(dependencyKey);
      if (!dependency) {
        warnings.push(`${milestone.name} depends on an excluded milestone.`);
      } else if (dependency.order >= milestone.order) {
        blockingIssues.push(
          `${dependency.name} must be sequenced before ${milestone.name}.`
        );
      }
    }
  }

  const currentBudget = currentBudgetCents(milestones);
  const originalBudget = draft.originalBudgetCents ?? 0;
  const budgetDiffCents = currentBudget - originalBudget;
  if (originalBudget > 0 && budgetDiffCents !== 0) {
    warnings.push("Current proposal budget differs from the original budget.");
  }

  const peakExposureCents = projectedPeakExposureCents(milestones);
  if (
    draft.borrowerCashAvailabilityCents &&
    draft.borrowerCashAvailabilityCents > 0 &&
    peakExposureCents > draft.borrowerCashAvailabilityCents
  ) {
    warnings.push(
      "Projected unreimbursed exposure exceeds borrower cash availability; split or resize milestones before production draw planning."
    );
  }

  return {
    blockingIssues: [...new Set(blockingIssues)],
    budgetDiffCents,
    canFinalize: blockingIssues.length === 0,
    currentBudgetCents: currentBudget,
    includedCount: included.length,
    originalBudgetCents: originalBudget,
    peakExposureCents,
    totalDurationDays: included.reduce(
      (sum, milestone) => sum + Math.max(0, milestone.durationDays),
      0
    ),
    warningIssues: [...new Set(warnings)],
  };
}

async function recomputeDraftDerived(ctx: DemoCtx, draftId: string) {
  const milestones = await getDraftMilestones(ctx, draftId);
  let cursor = 0;
  for (const milestone of milestones) {
    const dayStart = milestone.included ? cursor + 1 : cursor;
    const dayEnd = milestone.included
      ? cursor + Math.max(0, milestone.durationDays)
      : cursor;
    await ctx.db.patch(milestone._id, {
      dayEnd,
      dayStart,
      updatedAt: now(),
    });
    if (milestone.included) {
      cursor = dayEnd;
    }
  }
  const updatedMilestones = await getDraftMilestones(ctx, draftId);
  await ctx.db.patch(draftId, {
    currentBudgetCents: currentBudgetCents(updatedMilestones),
    updatedAt: now(),
  });
  return updatedMilestones;
}

function boundaryPayload(draft: any, milestones: any[], readiness: any) {
  const included = milestones.filter((milestone) => milestone.included);
  const dependencyKeySet = new Set<string>();
  for (const milestone of included) {
    for (const dependencyKey of milestone.dependencyKeys) {
      if (included.some((candidate) => candidate.key === dependencyKey)) {
        dependencyKeySet.add(`${dependencyKey}->${milestone.key}`);
      }
    }
  }

  return {
    build: {
      buildName: draft.buildName,
      estimatedStartDate: draft.estimatedStartDate ?? DEMO_START_DATE,
      location: draft.buildLocation,
      organizationId: draft.orgKey,
      proposalNumber: draft.proposalNumber,
      reimbursementOnly: true,
      status: "workspace_ready",
      templateKey: draft.templateKey,
      templateTitle: draft.templateTitle,
    },
    budget: {
      borrowerWorkingCapitalLimitCents:
        draft.borrowerCashAvailabilityCents ?? 0,
      currentProposalBudgetCents: readiness.currentBudgetCents,
      lenderDrawPolicyLimitCents: draft.lenderDrawPolicyLimitCents,
      originalBudgetCents: readiness.originalBudgetCents,
      runningDiffFromOriginalCents: readiness.budgetDiffCents,
      version: draft.generatedMilestoneVersion,
    },
    dependencies: [...dependencyKeySet].map((edge) => {
      const [blockerKey, blockedKey] = edge.split("->");
      return {
        blockedKey,
        blockerKey,
        severity: "blocking",
        type: "construction_sequence",
      };
    }),
    milestoneSequence: included.map((milestone) => ({
      budgetCents: milestone.budgetCents,
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      dependencyKeys: milestone.dependencyKeys.filter((dependencyKey: string) =>
        included.some((candidate) => candidate.key === dependencyKey)
      ),
      durationDays: milestone.durationDays,
      key: milestone.key,
      name: milestone.name,
      order: milestone.order,
      source: milestone.source,
      type: milestone.type,
    })),
    planningAssumptions: {
      borrowerCashAvailabilityCents: draft.borrowerCashAvailabilityCents ?? 0,
      interestBeginsAfterFundsReleased: true,
      projectedPeakUnreimbursedExposureCents: readiness.peakExposureCents,
      reimbursementOnly: true,
    },
    validationWarnings: readiness.warningIssues,
  };
}

async function draftProjectionFromDraft(ctx: DemoCtx, draft: any) {
  const draftId = draft._id;
  const milestones = await getDraftMilestones(ctx, draftId);
  const events = await ctx.db
    .query("demo_builderProposalEvents")
    .withIndex("by_draft", (q: any) => q.eq("draftId", draftId))
    .collect();
  const boundary = await getDraftBoundary(ctx, draftId);
  const readiness = readinessForDraft(draft, milestones);
  return {
    boundary,
    draft,
    events: events.sort((a: any, b: any) => b.createdAt - a.createdAt),
    milestones,
    readiness,
  };
}

async function draftProjection(ctx: DemoCtx, draftId: string) {
  const draft = await getDraft(ctx, draftId);
  return await draftProjectionFromDraft(ctx, draft);
}

async function nextProposalNumber(ctx: DemoCtx) {
  const drafts = await ctx.db
    .query("demo_builderProposalDrafts")
    .withIndex("by_org", (q: any) => q.eq("orgKey", ORG_KEY))
    .collect();
  return `PR-2026-${String(drafts.length + 42).padStart(3, "0")}`;
}

function dashboardCards(drafts: any[]) {
  const draftCount = drafts.filter(
    (draft) => draft.status !== "workspace_ready"
  ).length;
  const readyCount = drafts.filter(
    (draft) => draft.status === "workspace_ready"
  ).length;
  const planningBudgetCents = drafts.reduce(
    (sum, draft) => sum + draft.currentBudgetCents,
    0
  );
  return {
    metrics: {
      draftCount,
      planningBudgetCents,
      readyCount,
    },
    workspaceCards: [
      {
        description: "Existing workspace demo link remains separate.",
        href: "/demo/drawflow/proposal",
        title: "Maple Ridge Townhomes",
      },
      {
        description: "Draft missing cash availability.",
        title: "Riverside Infill",
      },
      {
        description:
          "Ready for lender review in production, boundary only in demo.",
        title: "West Lot Phase 2",
      },
    ],
  };
}

export const demo_seedBuilderProposalDemo = publicMutation
  .use(withMutationTiming("demo_builder_proposals.seed"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => await ensureTemplates(ctx))
  .public();

export const demo_resetBuilderProposalDemo = publicMutation
  .use(withMutationTiming("demo_builder_proposals.reset"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    await cleanupBuilderProposalDemo(ctx);
    await ensureTemplates(ctx);
    await appendEvent(ctx, {
      command: "demo_resetBuilderProposalDemo",
      entityType: "demo",
      eventType: "BuilderProposalDemoReset",
      requirementIds: ["REQ-02"],
      validationIds: ["VAL-01"],
    });
    return { reset: true };
  })
  .public();

export const demo_getBuilderDashboard = publicQuery
  .use(withQueryTiming("demo_builder_proposals.getDashboard"))
  .input({ draftId: v.optional(v.id("demo_builderProposalDrafts")) })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const templateRows = await ctx.db
      .query("demo_builderProposalTemplates")
      .withIndex("by_org", (q: any) => q.eq("orgKey", ORG_KEY))
      .collect();
    const drafts = (
      await ctx.db
        .query("demo_builderProposalDrafts")
        .withIndex("by_org", (q: any) => q.eq("orgKey", ORG_KEY))
        .collect()
    ).sort((a: any, b: any) => b.createdAt - a.createdAt);
    const requestedDraft = args.draftId
      ? await getOptionalDraft(ctx, args.draftId)
      : null;
    return {
      activeDraft: requestedDraft
        ? await draftProjectionFromDraft(ctx, requestedDraft)
        : null,
      dashboard: dashboardCards(drafts),
      drafts,
      needsSeed: templateRows.length === 0,
      orgKey: ORG_KEY,
      templates: templateRows.length > 0 ? templateRows : BUILDER_TEMPLATES,
    };
  })
  .public();

export const demo_startBuilderProposal = publicMutation
  .use(withMutationTiming("demo_builder_proposals.startDraft"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    await ensureTemplates(ctx);
    const createdAt = now();
    const proposalNumber = await nextProposalNumber(ctx);
    const draftId = await ctx.db.insert("demo_builderProposalDrafts", {
      buildLocation: "Hamilton, ON",
      buildName: "Untitled reimbursable build",
      createdAt,
      currentBudgetCents: 0,
      generatedMilestoneVersion: 0,
      lenderDrawPolicyLimitCents: LENDER_DRAW_POLICY_LIMIT_CENTS,
      manuallyEdited: false,
      orgKey: ORG_KEY,
      proposalNumber,
      status: "draft",
      updatedAt: createdAt,
    });
    await appendEvent(ctx, {
      command: "demo_startBuilderProposal",
      draftId,
      entityKey: proposalNumber,
      entityType: "builder_proposal_draft",
      eventType: "BuilderProposalDraftStarted",
      newState: { draftId, proposalNumber, status: "draft" },
      requirementIds: ["REQ-01", "REQ-02", "REQ-11"],
      validationIds: ["VAL-01"],
    });
    return { draftId, proposalNumber };
  })
  .public();

export const demo_generateBuilderProposalMilestones = publicMutation
  .use(withMutationTiming("demo_builder_proposals.generateMilestones"))
  .input({
    allowRegenerate: v.optional(v.boolean()),
    draftId: v.id("demo_builderProposalDrafts"),
    estimatedStartDate: v.optional(v.string()),
    originalBudgetCents: v.number(),
    templateKey: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const draft = await getDraft(ctx, args.draftId);
    const template = templateForKey(args.templateKey);
    if (!template) {
      throw new Error("Select a valid build type template.");
    }
    if (
      !Number.isFinite(args.originalBudgetCents) ||
      args.originalBudgetCents <= 0
    ) {
      throw new Error("Enter a positive total project budget.");
    }
    const existingMilestones = await getDraftMilestones(ctx, args.draftId);
    if (
      existingMilestones.length > 0 &&
      draft.manuallyEdited &&
      !args.allowRegenerate
    ) {
      throw new Error(
        "Regenerating after manual edits requires explicit confirmation."
      );
    }
    for (const milestone of existingMilestones) {
      await ctx.db.delete(milestone._id);
    }
    const allocations = allocateByBps(
      Math.round(args.originalBudgetCents),
      template.milestonePresets
    );
    const createdAt = now();
    let dayCursor = 0;
    for (const [index, presetRow] of template.milestonePresets.entries()) {
      const durationDays = Math.max(1, presetRow.durationDays);
      const dayStart = dayCursor + 1;
      const dayEnd = dayCursor + durationDays;
      dayCursor = dayEnd;
      await ctx.db.insert("demo_builderProposalMilestones", {
        budgetCents: allocations[index],
        createdAt,
        dayEnd,
        dayStart,
        dependencyKeys: presetRow.dependencyKeys,
        draftId: args.draftId,
        durationDays,
        included: true,
        key: presetRow.key,
        name: presetRow.name,
        order: index + 1,
        orgKey: ORG_KEY,
        percentageBps: presetRow.percentageBps,
        source: "template",
        templateKey: template.templateKey,
        type: presetRow.type,
        updatedAt: createdAt,
      });
    }
    await ctx.db.patch(args.draftId, {
      currentBudgetCents: Math.round(args.originalBudgetCents),
      estimatedStartDate: args.estimatedStartDate ?? DEMO_START_DATE,
      generatedMilestoneVersion: draft.generatedMilestoneVersion + 1,
      manuallyEdited: false,
      originalBudgetCents: Math.round(args.originalBudgetCents),
      status: "milestones_generated",
      templateKey: template.templateKey,
      templateTitle: template.title,
      updatedAt: now(),
    });
    await appendEvent(ctx, {
      command: "demo_generateBuilderProposalMilestones",
      draftId: args.draftId,
      entityKey: template.templateKey,
      entityType: "builder_proposal_template",
      eventType: "BuilderProposalMilestonesGenerated",
      newState: {
        originalBudgetCents: Math.round(args.originalBudgetCents),
        rowCount: template.milestonePresets.length,
        templateKey: template.templateKey,
      },
      priorState: {
        generatedMilestoneVersion: draft.generatedMilestoneVersion,
      },
      requirementIds: ["REQ-03", "REQ-04", "REQ-05", "REQ-11"],
      validationIds: ["VAL-02", "VAL-03"],
    });
    return await draftProjection(ctx, args.draftId);
  })
  .public();

export const demo_toggleBuilderProposalMilestone = publicMutation
  .use(withMutationTiming("demo_builder_proposals.toggleMilestone"))
  .input({
    included: v.boolean(),
    milestoneId: v.id("demo_builderProposalMilestones"),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone || milestone.orgKey !== ORG_KEY) {
      throw new Error("Milestone not found.");
    }
    await getDraft(ctx, milestone.draftId);
    await ctx.db.patch(milestone._id, {
      included: args.included,
      updatedAt: now(),
    });
    const milestones = await recomputeDraftDerived(ctx, milestone.draftId);
    await ctx.db.patch(milestone.draftId, {
      manuallyEdited: true,
      updatedAt: now(),
    });
    await appendEvent(ctx, {
      command: "demo_toggleBuilderProposalMilestone",
      draftId: milestone.draftId,
      entityKey: milestone.key,
      entityType: "builder_proposal_milestone",
      eventType: args.included
        ? "BuilderProposalMilestoneIncluded"
        : "BuilderProposalMilestoneExcluded",
      newState: { included: args.included },
      priorState: { included: milestone.included },
      requirementIds: ["REQ-06", "REQ-08", "REQ-11"],
      validationIds: ["VAL-04"],
    });
    return {
      currentBudgetCents: currentBudgetCents(milestones),
      ok: true,
    };
  })
  .public();

export const demo_updateBuilderProposalMilestone = publicMutation
  .use(withMutationTiming("demo_builder_proposals.updateMilestone"))
  .input({
    budgetCents: v.optional(v.number()),
    durationDays: v.optional(v.number()),
    milestoneId: v.id("demo_builderProposalMilestones"),
    name: v.optional(v.string()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone || milestone.orgKey !== ORG_KEY) {
      throw new Error("Milestone not found.");
    }
    const patch: Record<string, number | string> = {};
    if (args.name !== undefined) {
      if (!args.name.trim()) {
        throw new Error("Milestone name is required.");
      }
      patch.name = args.name.trim();
    }
    if (args.budgetCents !== undefined) {
      patch.budgetCents = Math.round(args.budgetCents);
    }
    if (args.durationDays !== undefined) {
      patch.durationDays = Math.round(args.durationDays);
    }
    await ctx.db.patch(milestone._id, {
      ...patch,
      updatedAt: now(),
    });
    const milestones = await recomputeDraftDerived(ctx, milestone.draftId);
    await ctx.db.patch(milestone.draftId, {
      manuallyEdited: true,
      updatedAt: now(),
    });
    await appendEvent(ctx, {
      command: "demo_updateBuilderProposalMilestone",
      draftId: milestone.draftId,
      entityKey: milestone.key,
      entityType: "builder_proposal_milestone",
      eventType: "BuilderProposalMilestoneUpdated",
      newState: patch,
      priorState: {
        budgetCents: milestone.budgetCents,
        durationDays: milestone.durationDays,
        name: milestone.name,
      },
      requirementIds: ["REQ-06", "REQ-08", "REQ-11"],
      validationIds: ["VAL-04"],
    });
    return {
      currentBudgetCents: currentBudgetCents(milestones),
      ok: true,
    };
  })
  .public();

export const demo_addBuilderProposalBankItem = publicMutation
  .use(withMutationTiming("demo_builder_proposals.addBankItem"))
  .input({
    bankItemKey: v.optional(v.string()),
    draftId: v.id("demo_builderProposalDrafts"),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const draft = await getDraft(ctx, args.draftId);
    const milestones = await getDraftMilestones(ctx, args.draftId);
    const existingBankKeys = new Set(
      milestones.map((milestone: any) => milestone.bankItemKey).filter(Boolean)
    );
    const item =
      BANK_ITEMS.find(
        (candidate) => candidate.bankItemKey === args.bankItemKey
      ) ??
      BANK_ITEMS.find(
        (candidate) => !existingBankKeys.has(candidate.bankItemKey)
      );
    if (!item) {
      throw new Error("All bank milestones have already been added.");
    }
    if (existingBankKeys.has(item.bankItemKey)) {
      throw new Error(`${item.name} is already in this proposal.`);
    }
    const order =
      milestones.reduce(
        (max: number, milestone: any) => Math.max(max, milestone.order),
        0
      ) + 1;
    const baseBudget = draft.originalBudgetCents ?? 0;
    const budgetCents =
      baseBudget > 0
        ? Math.round((baseBudget * item.percentageBps) / 10_000)
        : 5_000_000;
    const createdAt = now();
    const milestoneId = await ctx.db.insert("demo_builderProposalMilestones", {
      bankItemKey: item.bankItemKey,
      budgetCents,
      createdAt,
      dayEnd: 0,
      dayStart: 0,
      dependencyKeys: item.dependencyKeys,
      draftId: args.draftId,
      durationDays: item.durationDays,
      included: true,
      key: item.bankItemKey,
      name: item.name,
      order,
      orgKey: ORG_KEY,
      percentageBps: item.percentageBps,
      source: "bank",
      type: item.type,
      updatedAt: createdAt,
    });
    await recomputeDraftDerived(ctx, args.draftId);
    await ctx.db.patch(args.draftId, {
      manuallyEdited: true,
      updatedAt: now(),
    });
    await appendEvent(ctx, {
      command: "demo_addBuilderProposalBankItem",
      draftId: args.draftId,
      entityKey: item.bankItemKey,
      entityType: "builder_proposal_milestone",
      eventType: "BuilderProposalBankMilestoneAdded",
      newState: { budgetCents, name: item.name },
      requirementIds: ["REQ-07", "REQ-08", "REQ-11"],
      validationIds: ["VAL-04"],
    });
    return { milestoneId };
  })
  .public();

export const demo_createBuilderProposalCustomMilestone = publicMutation
  .use(withMutationTiming("demo_builder_proposals.createCustomMilestone"))
  .input({
    budgetCents: v.optional(v.number()),
    draftId: v.id("demo_builderProposalDrafts"),
    durationDays: v.optional(v.number()),
    name: v.optional(v.string()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    await getDraft(ctx, args.draftId);
    const milestones = await getDraftMilestones(ctx, args.draftId);
    const order =
      milestones.reduce(
        (max: number, milestone: any) => Math.max(max, milestone.order),
        0
      ) + 1;
    const createdAt = now();
    const key = `custom_${createdAt}`;
    const name = args.name?.trim() || "Owner requested contingency";
    const budgetCents = Math.round(args.budgetCents ?? 2_500_000);
    const durationDays = Math.round(args.durationDays ?? 5);
    const milestoneId = await ctx.db.insert("demo_builderProposalMilestones", {
      budgetCents,
      createdAt,
      dayEnd: 0,
      dayStart: 0,
      dependencyKeys: [],
      draftId: args.draftId,
      durationDays,
      included: true,
      key,
      name,
      order,
      orgKey: ORG_KEY,
      source: "custom",
      type: "custom_scope",
      updatedAt: createdAt,
    });
    await recomputeDraftDerived(ctx, args.draftId);
    await ctx.db.patch(args.draftId, {
      manuallyEdited: true,
      updatedAt: now(),
    });
    await appendEvent(ctx, {
      command: "demo_createBuilderProposalCustomMilestone",
      draftId: args.draftId,
      entityKey: key,
      entityType: "builder_proposal_milestone",
      eventType: "BuilderProposalCustomMilestoneCreated",
      newState: { budgetCents, durationDays, name },
      requirementIds: ["REQ-07", "REQ-08", "REQ-11"],
      validationIds: ["VAL-04"],
    });
    return { milestoneId };
  })
  .public();

export const demo_updateBuilderProposalCashAvailability = publicMutation
  .use(withMutationTiming("demo_builder_proposals.updateCashAvailability"))
  .input({
    borrowerCashAvailabilityCents: v.number(),
    draftId: v.id("demo_builderProposalDrafts"),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const draft = await getDraft(ctx, args.draftId);
    const rounded = Math.round(args.borrowerCashAvailabilityCents);
    await ctx.db.patch(args.draftId, {
      borrowerCashAvailabilityCents: rounded,
      updatedAt: now(),
    });
    const milestones = await getDraftMilestones(ctx, args.draftId);
    const readiness = readinessForDraft(
      { ...draft, borrowerCashAvailabilityCents: rounded },
      milestones
    );
    await appendEvent(ctx, {
      command: "demo_updateBuilderProposalCashAvailability",
      draftId: args.draftId,
      entityType: "builder_proposal_draft",
      eventType: "BuilderProposalCashAvailabilityUpdated",
      newState: {
        borrowerCashAvailabilityCents: rounded,
        lenderDrawPolicyLimitCents: draft.lenderDrawPolicyLimitCents,
      },
      priorState: {
        borrowerCashAvailabilityCents: draft.borrowerCashAvailabilityCents,
        lenderDrawPolicyLimitCents: draft.lenderDrawPolicyLimitCents,
      },
      requirementIds: ["REQ-09", "REQ-11"],
      validationIds: ["VAL-05"],
      warnings: readiness.warningIssues,
    });
    return { readiness };
  })
  .public();

export const demo_finalizeBuilderProposalBoundary = publicMutation
  .use(withMutationTiming("demo_builder_proposals.finalizeBoundary"))
  .input({ draftId: v.id("demo_builderProposalDrafts") })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const draft = await getDraft(ctx, args.draftId);
    const milestones = await getDraftMilestones(ctx, args.draftId);
    const readiness = readinessForDraft(draft, milestones);
    if (!readiness.canFinalize) {
      await appendEvent(ctx, {
        command: "demo_finalizeBuilderProposalBoundary",
        draftId: args.draftId,
        entityType: "builder_proposal_boundary",
        eventType: "BuilderProposalBoundaryRejected",
        reason: readiness.blockingIssues[0],
        requirementIds: ["REQ-08", "REQ-10", "REQ-12"],
        validationIds: ["VAL-06"],
        warnings: readiness.warningIssues,
      });
      throw new Error(readiness.blockingIssues[0] ?? "Proposal is incomplete.");
    }
    const existingPayloads = await ctx.db
      .query("demo_builderProposalBoundaryPayloads")
      .withIndex("by_draft", (q: any) => q.eq("draftId", args.draftId))
      .collect();
    for (const payload of existingPayloads) {
      await ctx.db.delete(payload._id);
    }
    const refreshedMilestones = await recomputeDraftDerived(ctx, args.draftId);
    const refreshedReadiness = readinessForDraft(draft, refreshedMilestones);
    const payload = boundaryPayload(
      draft,
      refreshedMilestones,
      refreshedReadiness
    );
    const payloadId = await ctx.db.insert(
      "demo_builderProposalBoundaryPayloads",
      {
        buildName: draft.buildName,
        createdAt: now(),
        draftId: args.draftId,
        orgKey: ORG_KEY,
        payload,
        payloadVersion: 1,
        snapshotSummary: `${payload.milestoneSequence.length} milestones · ${refreshedReadiness.currentBudgetCents} cents · reimbursement only`,
        status: "workspace_ready",
        validationWarnings: refreshedReadiness.warningIssues,
      }
    );
    await ctx.db.patch(args.draftId, {
      status: "workspace_ready",
      updatedAt: now(),
      workspaceReadyAt: now(),
    });
    await appendEvent(ctx, {
      command: "demo_finalizeBuilderProposalBoundary",
      draftId: args.draftId,
      entityKey: String(payloadId),
      entityType: "builder_proposal_boundary",
      eventType: "BuilderProposalBoundaryPayloadFrozen",
      newState: {
        payloadId,
        status: "workspace_ready",
      },
      requirementIds: ["REQ-10", "REQ-11", "REQ-12"],
      validationIds: ["VAL-06", "VAL-08"],
      warnings: refreshedReadiness.warningIssues,
    });
    return { payload, payloadId };
  })
  .public();
