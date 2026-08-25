/**
 * Production proposals active cost bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError } from "convex/values";
import { type AuthorizedViewer } from "../authz";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { assertActiveBuildPlanningTargetActive, activeBuildStartTarget } from "./active_planning.js";
import { authorizeActiveBuildOrThrow, requireBackofficeActiveBuildWrite } from "./authorization_core.js";
import { type BuilderStaffPermissionAction, requireActiveBuildAppPermission } from "./builder_staff_access.js";
import { isBackoffice } from "./proposal_claim.js";
import { costItemTotalCents, type CostItemBudgetTreatment, normalizeCostItemBudgetTreatment, normalizeCostItemBudgetSubmilestoneKey, slugifyKey } from "./proposal_cost_validation.js";
import { requireReason, calculateDrawAvailability } from "./proposal_lender_approval.js";
import { collectByIndex } from "./storage_helpers.js";

export async function supersedeActiveBuildMilestoneCascade(
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">,
  milestone: Doc<"buildMilestones">,
): Promise<Id<"buildSubmilestones">[]> {
  const now = Date.now();
  const supersededIds: Id<"buildSubmilestones">[] = [];
  const submilestones = await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_milestone", (q) => q.eq("buildMilestoneId", milestone._id))
    .take(1000);
  for (const row of submilestones) {
    if (row.planningState === "superseded") continue;
    await ctx.db.patch(row._id, {
      planningState: "superseded",
      supersededAt: now,
      supersededByPlanningRevision: undefined,
      updatedAt: now,
    });
    supersededIds.push(row._id);
  }
  await ctx.db.patch(milestone._id, {
    planningState: "superseded",
    supersededAt: now,
    supersededByPlanningRevision: undefined,
    updatedAt: now,
  });
  return supersededIds;
}

export async function authorizeActiveBuildCostItemWrite(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  buildId: Id<"activeBuilds">,
  workosOrganizationId: string,
  action: BuilderStaffPermissionAction,
  reason?: string,
  options?: { requireReason?: boolean },
) {
  const auth = await authorizeActiveBuildOrThrow(
    ctx,
    buildId,
    workosOrganizationId,
  );
  if (isBackoffice(auth.roles)) {
    requireBackofficeActiveBuildWrite(auth);
  } else {
    await requireActiveBuildAppPermission(ctx, auth, "material", action);
  }
  if (options?.requireReason ?? true) {
    requireReason(reason ?? "");
  }
  return auth;
}

export async function validateBuildCostItemSubmilestones(
  ctx: QueryCtx | MutationCtx,
  milestone: Pick<Doc<"buildMilestones">, "_id" | "key">,
  relevantSubmilestoneKeys: string[],
) {
  const available = await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_milestone", (q) => q.eq("buildMilestoneId", milestone._id))
    .collect();
  const availableKeys = new Set(available.map((row) => row.key));
  const normalized = [
    ...new Set(
      relevantSubmilestoneKeys
        .map((key) => key.trim())
        .filter((key) => key.length > 0),
    ),
  ];
  const invalid = normalized.filter((key) => !availableKeys.has(key));
  if (invalid.length > 0) {
    throw new Error(
      `Relevant sub-milestones must belong to ${milestone.key}: ${invalid.join(", ")}.`,
    );
  }
  return normalized;
}

export async function validateBuildCostItemBudgetTarget(
  ctx: QueryCtx | MutationCtx,
  milestone: Pick<Doc<"buildMilestones">, "_id" | "key">,
  requestedKey: null | string | undefined,
  treatment: CostItemBudgetTreatment,
) {
  if (treatment === "logOnly") {
    return;
  }
  const budgetSubmilestoneKey =
    normalizeCostItemBudgetSubmilestoneKey(requestedKey);
  if (!budgetSubmilestoneKey) {
    if (treatment === "maintain") {
      throw new Error("Maintain requires one budget sub-milestone target.");
    }
    return;
  }
  const submilestones = await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_milestone", (q) => q.eq("buildMilestoneId", milestone._id))
    .collect();
  if (!submilestones.some((row) => row.key === budgetSubmilestoneKey)) {
    throw new Error(
      `Budget sub-milestone must belong to ${milestone.key}: ${budgetSubmilestoneKey}.`,
    );
  }
  return budgetSubmilestoneKey;
}

export async function nextBuildCostItemKey(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  title: string,
  now: number,
) {
  const base = slugifyKey(title) || "cost-item";
  let candidate = `${base}-${now.toString(36)}`;
  let attempt = 1;
  while (
    await ctx.db
      .query("buildCostItems")
      .withIndex("by_build_key", (q) =>
        q.eq("buildId", buildId).eq("itemKey", candidate),
      )
      .unique()
  ) {
    attempt += 1;
    candidate = `${base}-${now.toString(36)}-${attempt}`;
  }
  return candidate;
}

export async function getBuildCostItemOrThrow(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  itemId: Id<"buildCostItems">,
) {
  const item = await ctx.db.get(itemId);
  if (!item || item.buildId !== buildId) {
    throw new Error("Active build cost item not found.");
  }
  return item;
}

export async function activeBuildMaterialTarget(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    milestone: Doc<"buildMilestones">;
    submilestoneKey: string;
  },
) {
  const { submilestone } = await activeBuildStartTarget(ctx, {
    buildId: input.buildId,
    milestoneKey: input.milestone.key,
    submilestoneKey: input.submilestoneKey.trim(),
  });
  if (!submilestone) {
    throw new ConvexError({
      code: "SUBMILESTONE_NOT_FOUND",
      message: "Submilestone is unavailable for this milestone.",
      submilestoneKey: input.submilestoneKey,
    });
  }
  assertActiveBuildPlanningTargetActive(input.milestone, submilestone);
  return submilestone;
}

export function latestBuildCapitalPlan(
  plans: readonly Doc<"buildCapitalPlans">[],
): Doc<"buildCapitalPlans"> | undefined {
  return plans.reduce<Doc<"buildCapitalPlans"> | undefined>(
    (latest, candidate) =>
      !latest || candidate.version > latest.version ? candidate : latest,
    undefined,
  );
}

async function activeBuildBorrowerCoPayBps(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  proposal: Doc<"buildProposals">,
) {
  const capitalPlan = latestBuildCapitalPlan(
    await collectByIndex(ctx, "buildCapitalPlans", "by_build", buildId),
  );
  return capitalPlan?.borrowerCoPayBps ?? proposal.borrowerCoPayBps;
}

export async function applyActiveBuildCostItemBudgetDelta(
  ctx: MutationCtx,
  auth: {
    build: Doc<"activeBuilds">;
    proposal: Doc<"buildProposals">;
  },
  input: {
    buildId: Id<"activeBuilds">;
    deltaCents: number;
    milestone: Doc<"buildMilestones">;
    submilestoneKey?: string;
  },
) {
  if (input.deltaCents === 0) {
    return;
  }
  const now = Date.now();
  const borrowerCoPayBps = await activeBuildBorrowerCoPayBps(
    ctx,
    input.buildId,
    auth.proposal,
  );
  const nextMilestoneBudgetCents = Math.max(
    0,
    input.milestone.budgetCents + input.deltaCents,
  );
  const nextDrawAvailabilityCents = calculateDrawAvailability(
    nextMilestoneBudgetCents,
    borrowerCoPayBps,
  );
  if (input.submilestoneKey) {
    const submilestones = await ctx.db
      .query("buildSubmilestones")
      .withIndex("by_milestone", (q) =>
        q.eq("buildMilestoneId", input.milestone._id),
      )
      .collect();
    const submilestone = submilestones.find(
      (row) => row.key === input.submilestoneKey,
    );
    if (!submilestone) {
      throw new Error(
        `Budget sub-milestone not found: ${input.submilestoneKey}.`,
      );
    }
    assertActiveBuildPlanningTargetActive(input.milestone, submilestone);
    await ctx.db.patch(submilestone._id, {
      budgetCents: Math.max(
        0,
        Math.round((submilestone.budgetCents ?? 0) + input.deltaCents),
      ),
      updatedAt: now,
    });
  }
  await ctx.db.patch(input.milestone._id, {
    budgetCents: nextMilestoneBudgetCents,
    drawAvailabilityCents: nextDrawAvailabilityCents,
    updatedAt: now,
  });
  await recalculateActiveBuildBudget(ctx, input.buildId);
}

export async function validateBuildMaintainedCostCoverage(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    milestoneId: Id<"buildMilestones">;
    submilestoneKey: string;
  },
) {
  const [submilestones, costItems] = await Promise.all([
    ctx.db
      .query("buildSubmilestones")
      .withIndex("by_milestone", (q) =>
        q.eq("buildMilestoneId", input.milestoneId),
      )
      .collect(),
    ctx.db
      .query("buildCostItems")
      .withIndex("by_milestone", (q) =>
        q.eq("buildMilestoneId", input.milestoneId),
      )
      .collect(),
  ]);
  const submilestone = submilestones.find(
    (row) => row.key === input.submilestoneKey,
  );
  if (!submilestone || submilestone.buildId !== input.buildId) {
    throw new Error(
      `Budget sub-milestone not found: ${input.submilestoneKey}.`,
    );
  }
  if (submilestone.planningState === "superseded") {
    return;
  }
  const maintainedCents = costItems.reduce(
    (total, item) =>
      normalizeCostItemBudgetTreatment(item.budgetTreatment) === "maintain" &&
      item.budgetSubmilestoneKey === input.submilestoneKey
        ? total + costItemTotalCents(item)
        : total,
    0,
  );
  const budgetCents = Math.max(0, Math.round(submilestone.budgetCents ?? 0));
  if (maintainedCents > budgetCents) {
    throw new Error(
      `Maintained cost items exceed the ${submilestone.name} budget by ${maintainedCents - budgetCents} cents.`,
    );
  }
}

export async function recalculateActiveBuildBudget(
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">,
) {
  const milestones = await collectByIndex(
    ctx,
    "buildMilestones",
    "by_build",
    buildId,
  );
  const totalBudgetCents = milestones.reduce(
    (total: number, milestone: any) =>
      milestone.planningState === "superseded"
        ? total
        : total + milestone.budgetCents,
    0,
  );
  await ctx.db.patch(buildId, {
    totalBudgetCents,
    updatedAt: Date.now(),
  });
}
