import type {
  BuilderProposalDraft,
  BuilderProposalDraftId,
  BuilderProposalMilestone,
  CashAwareDrawGroup,
  DemoCtx,
  DemoWriteCtx,
  DraftMilestoneLike,
} from "./shared";
import {
  BUILDER_PERSONA,
  BUILDER_TEMPLATES,
  DEMO_START_DATE,
  ORG_KEY,
  SEED_VERSION,
  now,
} from "./shared";

export async function ensureTemplates(ctx: DemoWriteCtx) {
  const rows = await ctx.db
    .query("demo_builderProposalTemplates")
    .withIndex("by_org", (q) => q.eq("orgKey", ORG_KEY))
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

export async function cleanupBuilderProposalDemo(ctx: DemoWriteCtx) {
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
      .withIndex("by_org", (q) => q.eq("orgKey", ORG_KEY))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  }
}

export async function appendEvent(
  ctx: DemoWriteCtx,
  input: {
    command: string;
    draftId?: BuilderProposalDraftId;
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

export async function getDraft(ctx: DemoCtx, draftId: BuilderProposalDraftId) {
  const draft = await ctx.db.get(draftId);
  if (!draft || draft.orgKey !== ORG_KEY) {
    throw new Error("Builder proposal draft not found.");
  }
  return draft;
}

export async function getOptionalDraft(ctx: DemoCtx, draftId: BuilderProposalDraftId) {
  const draft = await ctx.db.get(draftId);
  if (!draft || draft.orgKey !== ORG_KEY) {
    return null;
  }
  return draft;
}

export async function getDraftMilestones(
  ctx: DemoCtx,
  draftId: BuilderProposalDraftId
) {
  const rows = await ctx.db
    .query("demo_builderProposalMilestones")
    .withIndex("by_draft_order", (q) => q.eq("draftId", draftId))
    .collect();
  return rows.sort((a, b) => a.order - b.order);
}

export async function getDraftBoundary(ctx: DemoCtx, draftId: BuilderProposalDraftId) {
  const rows = await ctx.db
    .query("demo_builderProposalBoundaryPayloads")
    .withIndex("by_draft", (q) => q.eq("draftId", draftId))
    .collect();
  return rows.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}

export function currentBudgetCents(milestones: DraftMilestoneLike[]) {
  return milestones
    .filter((milestone) => milestone.included)
    .reduce((sum, milestone) => sum + milestone.budgetCents, 0);
}

export function cashAwareDrawGroups(
  milestones: DraftMilestoneLike[],
  borrowerCashAvailabilityCents?: number
) {
  const included = milestones.filter((milestone) => milestone.included);
  const cashLimit = Math.round(borrowerCashAvailabilityCents ?? 0);

  if (included.length === 0) {
    return [];
  }
  if (
    included.every(
      (milestone) =>
        typeof milestone.drawGroupIndex === "number" &&
        Number.isFinite(milestone.drawGroupIndex)
    )
  ) {
    const explicitGroups = new Map<number, DraftMilestoneLike[]>();
    for (const milestone of included) {
      const groupIndex = Math.max(0, Math.round(milestone.drawGroupIndex ?? 0));
      explicitGroups.set(groupIndex, [
        ...(explicitGroups.get(groupIndex) ?? []),
        milestone,
      ]);
    }

    return [...explicitGroups.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, groupMilestones]) => ({
        milestones: groupMilestones,
        totalBudgetCents: groupMilestones.reduce(
          (sum, milestone) => sum + milestone.budgetCents,
          0
        ),
      }));
  }
  if (cashLimit <= 0) {
    const targetGroups = Math.min(3, Math.ceil(included.length / 2));
    const groupSize = Math.max(2, Math.ceil(included.length / targetGroups));
    const groups: CashAwareDrawGroup[] = [];
    for (let index = 0; index < included.length; index += groupSize) {
      const groupMilestones = included.slice(index, index + groupSize);
      groups.push({
        milestones: groupMilestones,
        totalBudgetCents: groupMilestones.reduce(
          (sum, milestone) => sum + milestone.budgetCents,
          0
        ),
      });
    }
    return groups;
  }

  const groups: CashAwareDrawGroup[] = [];
  let currentMilestones: DraftMilestoneLike[] = [];
  let currentTotal = 0;

  function pushCurrent() {
    if (currentMilestones.length === 0) {
      return;
    }
    groups.push({
      milestones: currentMilestones,
      totalBudgetCents: currentTotal,
    });
    currentMilestones = [];
    currentTotal = 0;
  }

  for (const milestone of included) {
    const budgetCents = Math.max(0, milestone.budgetCents);
    if (budgetCents > cashLimit) {
      pushCurrent();
      groups.push({
        milestones: [milestone],
        totalBudgetCents: budgetCents,
      });
      continue;
    }

    if (
      currentMilestones.length > 0 &&
      currentTotal + budgetCents > cashLimit
    ) {
      pushCurrent();
    }

    currentMilestones.push(milestone);
    currentTotal += budgetCents;
  }

  pushCurrent();
  return groups;
}

export function projectedPeakExposureCents(
  milestones: DraftMilestoneLike[],
  borrowerCashAvailabilityCents?: number
) {
  return cashAwareDrawGroups(milestones, borrowerCashAvailabilityCents).reduce(
    (peak, group) => Math.max(peak, group.totalBudgetCents),
    0
  );
}

export function nextExplicitDrawGroupIndex(milestones: DraftMilestoneLike[]) {
  const included = milestones.filter((milestone) => milestone.included);
  const indexes = included
    .map((milestone) => milestone.drawGroupIndex)
    .filter((index): index is number => typeof index === "number");
  if (included.length === 0 || indexes.length !== included.length) {
    return;
  }
  return Math.max(...indexes) + 1;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Demo readiness rules intentionally stay together for auditability.
export function readinessForDraft(
  draft: BuilderProposalDraft,
  milestones: BuilderProposalMilestone[]
) {
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

  const peakExposureCents = projectedPeakExposureCents(
    milestones,
    draft.borrowerCashAvailabilityCents
  );
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

export async function recomputeDraftDerived(
  ctx: DemoWriteCtx,
  draftId: BuilderProposalDraftId
) {
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

export function boundaryPayload(
  draft: BuilderProposalDraft,
  milestones: BuilderProposalMilestone[],
  readiness: ReturnType<typeof readinessForDraft>
) {
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
      borrowerCoPayCents: draft.borrowerCoPayCents ?? 0,
      borrowerStartingCashCents:
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
      drawGroupIndex: milestone.drawGroupIndex,
      durationDays: milestone.durationDays,
      key: milestone.key,
      name: milestone.name,
      order: milestone.order,
      source: milestone.source,
      type: milestone.type,
    })),
    planningAssumptions: {
      borrowerCashAvailabilityCents: draft.borrowerCashAvailabilityCents ?? 0,
      borrowerCoPayCents: draft.borrowerCoPayCents ?? 0,
      interestBeginsAfterFundsReleased: true,
      projectedPeakUnreimbursedExposureCents: readiness.peakExposureCents,
      reimbursementOnly: true,
    },
    validationWarnings: readiness.warningIssues,
  };
}

export async function draftProjectionFromDraft(
  ctx: DemoCtx,
  draft: BuilderProposalDraft
) {
  const draftId = draft._id;
  const milestones = await getDraftMilestones(ctx, draftId);
  const events = await ctx.db
    .query("demo_builderProposalEvents")
    .withIndex("by_draft", (q) => q.eq("draftId", draftId))
    .collect();
  const boundary = await getDraftBoundary(ctx, draftId);
  const readiness = readinessForDraft(draft, milestones);
  return {
    boundary,
    draft,
    events: events.sort((a, b) => b.createdAt - a.createdAt),
    milestones,
    readiness,
  };
}

export async function draftProjection(ctx: DemoCtx, draftId: BuilderProposalDraftId) {
  const draft = await getDraft(ctx, draftId);
  return await draftProjectionFromDraft(ctx, draft);
}

export async function nextProposalNumber(ctx: DemoCtx) {
  const drafts = await ctx.db
    .query("demo_builderProposalDrafts")
    .withIndex("by_org", (q) => q.eq("orgKey", ORG_KEY))
    .collect();
  return `PR-2026-${String(drafts.length + 42).padStart(3, "0")}`;
}

export function dashboardCards(drafts: BuilderProposalDraft[]) {
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
