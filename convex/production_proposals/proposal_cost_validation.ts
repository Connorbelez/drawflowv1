/**
 * Production proposals proposal cost validation bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { syncMilestoneOwnedDrawAmount, recalculateProposalBudget } from "./proposal_cost_persistence.js";
import { calculateDrawAvailability } from "./proposal_lender_approval.js";

export function normalizeRequiredText(value: string, label: string) {
  const text = value.trim();
  if (!text) {
    throw new Error(`${label} is required.`);
  }
  return text;
}

export function normalizeOptionalText(value: string | undefined) {
  const text = value?.trim();
  return text ? text : undefined;
}

function normalizeOptionalNonNegativeDay(
  value: number | undefined,
  label: string,
) {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative whole day.`);
  }
  return value;
}

export function normalizeOptionalTiptapJson(value: string | undefined, label: string) {
  if (value === undefined) {
    return undefined;
  }
  if (!value.trim()) {
    return undefined;
  }
  if (value.length > 250_000) {
    throw new Error(`${label} exceeds the supported length.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid TipTap JSON.`);
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("type" in parsed) ||
    parsed.type !== "doc"
  ) {
    throw new Error(`${label} must contain a TipTap document root.`);
  }
  // Preserve the supplied canonical JSON exactly; quote-package snapshots use
  // this content verbatim rather than flattening or reserializing it.
  return value;
}

export function normalizeRequiredTiptapJson(value: string, label: string) {
  const normalized = normalizeOptionalTiptapJson(value, label);
  if (normalized === undefined) {
    throw new Error(`${label} must contain TipTap JSON.`);
  }
  return normalized;
}

export function validateCostItemDeliveryWindow(input: {
  deliveryEndDay?: number;
  deliveryStartDay?: number;
}) {
  const deliveryStartDay = normalizeOptionalNonNegativeDay(
    input.deliveryStartDay,
    "Delivery start day",
  );
  const deliveryEndDay = normalizeOptionalNonNegativeDay(
    input.deliveryEndDay,
    "Delivery end day",
  );
  if (
    deliveryStartDay !== undefined &&
    deliveryEndDay !== undefined &&
    deliveryEndDay < deliveryStartDay
  ) {
    throw new Error("Delivery end day cannot precede delivery start day.");
  }
  return { deliveryEndDay, deliveryStartDay };
}

export function normalizeCostItemCost(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error("Cost item cost must be finite.");
  }
  return Math.max(0, Math.round(value));
}

export function normalizeCostItemQuantity(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Cost item quantity must be greater than zero.");
  }
  return Math.round(value * 1000) / 1000;
}

export function costItemTotalCents(
  item: Pick<Doc<"proposalCostItems">, "costCents" | "quantity">,
) {
  return Math.round(item.costCents * item.quantity);
}

export type CostItemBudgetTreatment = "add" | "logOnly" | "maintain";

type ProposalCostItemBudgetState = Pick<
  Doc<"proposalCostItems">,
  | "_id"
  | "budgetSubmilestoneKey"
  | "budgetTreatment"
  | "costCents"
  | "milestoneKey"
  | "proposalMilestoneId"
  | "quantity"
>;

export function normalizeCostItemBudgetTreatment(
  value: CostItemBudgetTreatment | undefined,
): CostItemBudgetTreatment {
  return value ?? "add";
}

export function normalizeCostItemBudgetSubmilestoneKey(
  value: null | string | undefined,
) {
  const key = value?.trim();
  return key ? key : undefined;
}

export function proposalCostItemAuditWarnings(proposal: Doc<"buildProposals">) {
  return proposal.status === "draft"
    ? []
    : [`proposal-state:${proposal.status}`];
}

export async function validateProposalCostItemSubmilestones(
  ctx: QueryCtx | MutationCtx,
  milestone: Pick<Doc<"proposalMilestones">, "_id" | "key">,
  relevantSubmilestoneKeys: string[],
) {
  const available = await ctx.db
    .query("proposalSubmilestones")
    .withIndex("by_milestone", (q) =>
      q.eq("proposalMilestoneId", milestone._id),
    )
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

export async function validateProposalCostItemBudgetTarget(
  ctx: QueryCtx | MutationCtx,
  milestone: Pick<Doc<"proposalMilestones">, "_id" | "key">,
  requestedKey: null | string | undefined,
  treatment: CostItemBudgetTreatment,
  requireAddTarget: boolean,
) {
  if (treatment === "logOnly") {
    return;
  }
  const budgetSubmilestoneKey =
    normalizeCostItemBudgetSubmilestoneKey(requestedKey);
  if (!budgetSubmilestoneKey) {
    if (treatment === "maintain" || (treatment === "add" && requireAddTarget)) {
      throw new Error(
        `${treatment === "add" ? "Add" : "Maintain"} requires one budget sub-milestone target.`,
      );
    }
    return;
  }
  const submilestones = await ctx.db
    .query("proposalSubmilestones")
    .withIndex("by_milestone", (q) =>
      q.eq("proposalMilestoneId", milestone._id),
    )
    .collect();
  if (!submilestones.some((row) => row.key === budgetSubmilestoneKey)) {
    throw new Error(
      `Budget sub-milestone must belong to ${milestone.key}: ${budgetSubmilestoneKey}.`,
    );
  }
  return budgetSubmilestoneKey;
}

export async function nextProposalCostItemKey(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  title: string,
  now: number,
) {
  const base = slugifyKey(title) || "cost-item";
  let candidate = `${base}-${now.toString(36)}`;
  let attempt = 1;
  while (
    await ctx.db
      .query("proposalCostItems")
      .withIndex("by_proposal_key", (q) =>
        q.eq("proposalId", proposalId).eq("itemKey", candidate),
      )
      .unique()
  ) {
    attempt += 1;
    candidate = `${base}-${now.toString(36)}-${attempt}`;
  }
  return candidate;
}

export function slugifyKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function getProposalCostItemOrThrow(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  itemId: Id<"proposalCostItems">,
) {
  const item = await ctx.db.get(itemId);
  if (!item || item.proposalId !== proposalId) {
    throw new Error("Proposal cost item not found.");
  }
  return item;
}

export async function getProposalMilestoneByIdOrThrow(
  ctx: QueryCtx | MutationCtx,
  milestoneId: Id<"proposalMilestones">,
) {
  const milestone = await ctx.db.get(milestoneId);
  if (!milestone) {
    throw new Error("Production milestone not found.");
  }
  return milestone;
}

export async function applyProposalCostItemBudgetChange(
  ctx: MutationCtx,
  auth: {
    proposal: Doc<"buildProposals">;
    subject: string;
  },
  input: {
    nextItem?: ProposalCostItemBudgetState;
    priorItem?: ProposalCostItemBudgetState;
    proposalId: Id<"buildProposals">;
  },
) {
  const operations = new Map<
    string,
    {
      deltaCents: number;
      milestoneId: Id<"proposalMilestones">;
      submilestoneKey?: string;
    }
  >();
  const addOperation = (
    item: ProposalCostItemBudgetState | undefined,
    direction: -1 | 1,
  ) => {
    if (
      !item ||
      normalizeCostItemBudgetTreatment(item.budgetTreatment) !== "add"
    ) {
      return;
    }
    const submilestoneKey = normalizeCostItemBudgetSubmilestoneKey(
      item.budgetSubmilestoneKey,
    );
    const operationKey = `${item.proposalMilestoneId}:${submilestoneKey ?? "milestone"}`;
    const current = operations.get(operationKey);
    operations.set(operationKey, {
      deltaCents:
        (current?.deltaCents ?? 0) + direction * costItemTotalCents(item),
      milestoneId: item.proposalMilestoneId,
      submilestoneKey,
    });
  };
  addOperation(input.priorItem, -1);
  addOperation(input.nextItem, 1);

  const milestoneDeltaById = new Map<Id<"proposalMilestones">, number>();
  const milestoneById = new Map<
    Id<"proposalMilestones">,
    Doc<"proposalMilestones">
  >();
  const maintainedTargets = new Set<string>();
  for (const item of [input.priorItem, input.nextItem]) {
    const target = normalizeCostItemBudgetSubmilestoneKey(
      item?.budgetSubmilestoneKey,
    );
    if (item && target) {
      maintainedTargets.add(`${item.proposalMilestoneId}:${target}`);
    }
  }
  const now = Date.now();
  for (const operation of operations.values()) {
    if (operation.deltaCents === 0) {
      continue;
    }
    const milestone = await getProposalMilestoneByIdOrThrow(
      ctx,
      operation.milestoneId,
    );
    milestoneById.set(milestone._id, milestone);
    milestoneDeltaById.set(
      milestone._id,
      (milestoneDeltaById.get(milestone._id) ?? 0) + operation.deltaCents,
    );
    if (operation.submilestoneKey) {
      const submilestones = await ctx.db
        .query("proposalSubmilestones")
        .withIndex("by_milestone", (q) =>
          q.eq("proposalMilestoneId", milestone._id),
        )
        .collect();
      const submilestone = submilestones.find(
        (row) => row.key === operation.submilestoneKey,
      );
      if (!submilestone) {
        throw new Error(
          `Budget sub-milestone not found: ${operation.submilestoneKey}.`,
        );
      }
      await ctx.db.patch(submilestone._id, {
        budgetCents: Math.max(
          0,
          Math.round((submilestone.budgetCents ?? 0) + operation.deltaCents),
        ),
        updatedAt: now,
      });
    }
  }

  for (const [milestoneId, deltaCents] of milestoneDeltaById) {
    const milestone = milestoneById.get(milestoneId);
    if (!milestone) {
      continue;
    }
    const nextMilestoneBudgetCents = Math.max(
      0,
      milestone.budgetCents + deltaCents,
    );
    const nextDrawAvailabilityCents = calculateDrawAvailability(
      nextMilestoneBudgetCents,
      auth.proposal.borrowerCoPayBps,
    );
    await ctx.db.patch(milestone._id, {
      budgetCents: nextMilestoneBudgetCents,
      drawAvailabilityCents: nextDrawAvailabilityCents,
      updatedAt: now,
    });
    await syncMilestoneOwnedDrawAmount(ctx, {
      amountCents: nextDrawAvailabilityCents,
      milestoneKey: milestone.key,
      proposalId: input.proposalId,
      updatedAt: now,
    });
  }

  for (const target of maintainedTargets) {
    const separator = target.indexOf(":");
    const milestoneId = target.slice(0, separator) as Id<"proposalMilestones">;
    const submilestoneKey = target.slice(separator + 1);
    await validateProposalMaintainedCostCoverage(ctx, {
      milestoneId,
      proposalId: input.proposalId,
      submilestoneKey,
    });
  }

  if (milestoneDeltaById.size > 0) {
    await recalculateProposalBudget(ctx, auth, input.proposalId);
  }
}

export async function validateProposalMaintainedCostCoverage(
  ctx: QueryCtx | MutationCtx,
  input: {
    milestoneId: Id<"proposalMilestones">;
    proposalId: Id<"buildProposals">;
    submilestoneKey: string;
  },
) {
  const [submilestones, costItems] = await Promise.all([
    ctx.db
      .query("proposalSubmilestones")
      .withIndex("by_milestone", (q) =>
        q.eq("proposalMilestoneId", input.milestoneId),
      )
      .collect(),
    ctx.db
      .query("proposalCostItems")
      .withIndex("by_milestone", (q) =>
        q.eq("proposalMilestoneId", input.milestoneId),
      )
      .collect(),
  ]);
  const submilestone = submilestones.find(
    (row) => row.key === input.submilestoneKey,
  );
  if (!submilestone || submilestone.proposalId !== input.proposalId) {
    throw new Error(
      `Budget sub-milestone not found: ${input.submilestoneKey}.`,
    );
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
