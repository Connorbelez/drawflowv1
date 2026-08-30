/**
 * Production proposals proposal draft persistence bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { attachSubmilestoneFieldGuidanceBuildLineage } from "../submilestone_field_guidance";
import { upsertSubmilestoneScopeV1Draft } from "../submilestone_scope_contracts";
import { type Doc, type Id, type MutationCtx } from "../types";
import { normalizeOptionalString, normalizeOptionalMoneyCents, normalizeOptionalHours, getScopedContractorOrThrow, resolveDraftProposalContractorProfile } from "./contractor_policy_helpers.js";
import { ensureProposalContractorAssignment } from "./contractor_proposal_helpers.js";
import { EMPTY_CANONICAL_TIPTAP_DOCUMENT, PROPOSAL_TIMELINE_MIN_DAY } from "./contracts_foundation.js";
import { syncMilestoneOwnedDrawAmount } from "./proposal_cost_persistence.js";
import { normalizeRequiredText, normalizeOptionalText, normalizeOptionalTiptapJson, normalizeRequiredTiptapJson, validateCostItemDeliveryWindow, normalizeCostItemCost, normalizeCostItemQuantity, costItemTotalCents, normalizeCostItemBudgetTreatment, validateProposalCostItemSubmilestones, validateProposalCostItemBudgetTarget, nextProposalCostItemKey, validateProposalMaintainedCostCoverage } from "./proposal_cost_validation.js";
import { type DraftProposalSaveAuth, type DraftProposalSubmilestoneInput, type DraftProposalMilestoneInput, normalizeProductionMilestoneSchedule, sumProductionSubmilestoneBudgetCents, type DraftProposalDrawInput, type DraftProposalCostItemInput, type DraftProposalContractorAssignmentInput, type DraftProposalSavedMilestone, type DraftProposalPlanRows } from "./proposal_draft_model.js";
import { calculateDrawAvailability } from "./proposal_lender_approval.js";
import { collectByIndex } from "./storage_helpers.js";

export async function insertDraftProposalPlanRows(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    borrowerCoPayBps: number;
    draws?: DraftProposalDrawInput[];
    lenderDrawPolicyLimitCents?: number;
    milestones: DraftProposalMilestoneInput[];
    now: number;
    proposalId: Id<"buildProposals">;
    workosOrganizationId: string;
  },
): Promise<DraftProposalPlanRows> {
  const planRows: DraftProposalPlanRows = {
    drawIdByMilestoneKey: new Map(),
    milestoneByKey: new Map(),
    submilestoneByMilestoneAndKey: new Map(),
    totalBudgetCents: 0,
  };
  // Tracks cumulative drawn from auto-generated milestone draws for clamping.
  let cumulativeAutoDrawnCents = 0;

  for (const rawRow of [...input.milestones].sort(
    (a, b) => a.order - b.order,
  )) {
    const schedule = normalizeProductionMilestoneSchedule(rawRow);
    const budgetCents =
      schedule.submilestones.length > 0
        ? sumProductionSubmilestoneBudgetCents(schedule.submilestones)
        : rawRow.budgetCents;
    const row = {
      ...rawRow,
      ...schedule,
      budgetCents,
    };
    const drawAvailabilityCents = calculateDrawAvailability(
      row.budgetCents,
      input.borrowerCoPayBps,
    );
    const milestoneId = await insertDraftProposalMilestone(ctx, input, {
      drawAvailabilityCents,
      row,
    });
    planRows.totalBudgetCents += row.budgetCents;
    planRows.milestoneByKey.set(row.key, {
      _id: milestoneId,
      budgetCents: row.budgetCents,
      dayEnd: row.dayEnd,
      drawAvailabilityCents,
      key: row.key,
    });
    for (const submilestone of row.submilestones) {
      const submilestoneId = await insertDraftProposalSubmilestone(ctx, input, {
        milestoneId,
        row,
        submilestone,
      });
      planRows.submilestoneByMilestoneAndKey.set(
        `${row.key}:${submilestone.key}`,
        submilestoneId,
      );
    }
    if (input.draws === undefined) {
      // Clamp auto-generated draw to cumulative milestone capacity available
      // at this draw's timing day (backend eligibility: dayEnd <= timingDay).
      const cumulativeAvailable = [...planRows.milestoneByKey.values()].reduce(
        (total, m) =>
          m.dayEnd <= row.dayEnd ? total + m.drawAvailabilityCents : total,
        0,
      );
      const limit = input.lenderDrawPolicyLimitCents ?? Infinity;
      const remainingMilestoneCapacity = Math.max(
        0,
        cumulativeAvailable - cumulativeAutoDrawnCents,
      );
      const remainingLenderLimit = Math.max(
        0,
        limit - cumulativeAutoDrawnCents,
      );
      const maxAllowed = Math.min(
        remainingMilestoneCapacity,
        remainingLenderLimit,
      );
      const clampedAmount = Math.min(drawAvailabilityCents, maxAllowed);
      const drawId = await insertDraftProposalMilestoneDraw(ctx, input, {
        drawAvailabilityCents: clampedAmount,
        milestoneId,
        row,
      });
      cumulativeAutoDrawnCents += clampedAmount;
      planRows.drawIdByMilestoneKey.set(row.key, drawId);
    }
  }

  if (input.draws !== undefined) {
    await insertDraftProposalDrawRows(ctx, input, planRows);
  }

  return planRows;
}

async function insertDraftProposalMilestone(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    now: number;
    proposalId: Id<"buildProposals">;
    workosOrganizationId: string;
  },
  milestone: {
    drawAvailabilityCents: number;
    row: DraftProposalMilestoneInput;
  },
) {
  const existing = await ctx.db
    .query("proposalMilestones")
    .withIndex("by_proposal_key", (query) =>
      query
        .eq("proposalId", input.proposalId)
        .eq("key", milestone.row.key),
    )
    .unique();
  const values = {
    brokerageId: input.auth.brokerage._id,
    budgetCents: milestone.row.budgetCents,
    createdAt: input.now,
    dayEnd: milestone.row.dayEnd,
    dayStart: milestone.row.dayStart,
    dependencyKeys: milestone.row.dependencyKeys,
    drawAvailabilityCents: milestone.drawAvailabilityCents,
    durationDays: milestone.row.durationDays,
    icon: milestone.row.icon,
    key: milestone.row.key,
    name: milestone.row.name,
    order: milestone.row.order,
    organizationId: input.workosOrganizationId,
    proposalId: input.proposalId,
    siteVisitGuidance: milestone.row.siteVisitGuidance,
    updatedAt: input.now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, values);
    return existing._id;
  }
  return await ctx.db.insert("proposalMilestones", values);
}

async function insertDraftProposalSubmilestone(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    now: number;
    proposalId: Id<"buildProposals">;
    workosOrganizationId: string;
  },
  milestone: {
    milestoneId: Id<"proposalMilestones">;
    row: DraftProposalMilestoneInput;
    submilestone: DraftProposalSubmilestoneInput;
  },
) {
  assertProposalSubmilestoneCanonicalAuthoringAllowed(
    input.auth.proposal,
    milestone.submilestone,
  );
  const scopeOfWorkTiptapJson = normalizeOptionalTiptapJson(
    milestone.submilestone.scopeOfWorkTiptapJson,
    "Sub-milestone Scope of Work",
  );
  const existingRows = await ctx.db
    .query("proposalSubmilestones")
    .withIndex("by_milestone", (query) =>
      query.eq("proposalMilestoneId", milestone.milestoneId),
    )
    .collect();
  const existing = existingRows.find(
    (row) => row.key === milestone.submilestone.key,
  );
  const values = {
    brokerageId: input.auth.brokerage._id,
    budgetCents: milestone.submilestone.budgetCents,
    createdAt: input.now,
    durationDays: milestone.submilestone.durationDays,
    key: milestone.submilestone.key,
    milestoneKey: milestone.row.key,
    name: milestone.submilestone.name,
    order: milestone.submilestone.order,
    organizationId: input.workosOrganizationId,
    proposalId: input.proposalId,
    proposalMilestoneId: milestone.milestoneId,
    startDay: milestone.submilestone.startDay,
    updatedAt: input.now,
  };
  const submilestoneId = existing
    ? existing._id
    : await ctx.db.insert("proposalSubmilestones", values);
  if (existing) {
    await ctx.db.patch(existing._id, values);
  }
  if (!existing || scopeOfWorkTiptapJson !== undefined) {
    await upsertSubmilestoneScopeV1Draft(ctx, {
      authoredByWorkosUserId: input.auth.subject,
      brokerageId: input.auth.brokerage._id,
      now: input.now,
      organizationId: input.workosOrganizationId,
      proposalId: input.proposalId,
      proposalSubmilestoneId: submilestoneId,
      scopeOfWorkTiptapJson:
        scopeOfWorkTiptapJson ?? EMPTY_CANONICAL_TIPTAP_DOCUMENT,
    });
  }
  if (!existing || milestone.submilestone.fieldGuidance) {
    await upsertProposalSubmilestoneFieldGuidance(ctx, {
      auth: input.auth,
      fieldGuidance: milestone.submilestone.fieldGuidance ?? {
        cameraAnglesTiptapJson: EMPTY_CANONICAL_TIPTAP_DOCUMENT,
        whatToVerifyTiptapJson: EMPTY_CANONICAL_TIPTAP_DOCUMENT,
      },
      now: input.now,
      proposalId: input.proposalId,
      proposalSubmilestoneId: submilestoneId,
      workosOrganizationId: input.workosOrganizationId,
    });
  }
  return submilestoneId;
}

export function assertProposalSubmilestoneCanonicalAuthoringAllowed(
  proposal: Pick<Doc<"buildProposals">, "submittedAt">,
  input: {
    fieldGuidance?: {
      cameraAnglesTiptapJson: string;
      whatToVerifyTiptapJson: string;
    };
    scopeOfWorkTiptapJson?: string;
  },
) {
  if (proposal.submittedAt === undefined) {
    return;
  }
  if (input.scopeOfWorkTiptapJson !== undefined) {
    throw new Error(
      "Scope authoring is unavailable after the first Proposal submission.",
    );
  }
  if (input.fieldGuidance !== undefined) {
    throw new Error(
      "Field Guidance authoring is unavailable after the first Proposal submission.",
    );
  }
}

export async function upsertProposalSubmilestoneFieldGuidance(
  ctx: MutationCtx,
  input: {
    auth: Pick<DraftProposalSaveAuth, "brokerage" | "subject">;
    fieldGuidance: {
      cameraAnglesTiptapJson: string;
      whatToVerifyTiptapJson: string;
    };
    now: number;
    proposalId: Id<"buildProposals">;
    proposalSubmilestoneId: Id<"proposalSubmilestones">;
    workosOrganizationId: string;
  },
) {
  const whatToVerifyTiptapJson = normalizeRequiredTiptapJson(
    input.fieldGuidance.whatToVerifyTiptapJson,
    "Field Guidance what to verify",
  );
  const cameraAnglesTiptapJson = normalizeRequiredTiptapJson(
    input.fieldGuidance.cameraAnglesTiptapJson,
    "Field Guidance camera angles",
  );
  const existing = await ctx.db
    .query("submilestoneFieldGuidance")
    .withIndex("by_proposalSubmilestoneId", (query) =>
      query.eq("proposalSubmilestoneId", input.proposalSubmilestoneId),
    )
    .unique();
  if (existing) {
    if (
      existing.organizationId !== input.workosOrganizationId ||
      existing.brokerageId !== input.auth.brokerage._id ||
      existing.proposalId !== input.proposalId ||
      existing.proposalSubmilestoneId !== input.proposalSubmilestoneId
    ) {
      throw new Error("Field Guidance lineage is unavailable.");
    }
    await ctx.db.patch(existing._id, {
      cameraAnglesTiptapJson,
      updatedAt: input.now,
      updatedByWorkosUserId: input.auth.subject,
      whatToVerifyTiptapJson,
    });
    await attachSubmilestoneFieldGuidanceBuildLineage(ctx, {
      brokerageId: input.auth.brokerage._id,
      organizationId: input.workosOrganizationId,
      proposalId: input.proposalId,
      proposalSubmilestoneId: input.proposalSubmilestoneId,
    });
    return existing._id;
  }
  const guidanceId = await ctx.db.insert("submilestoneFieldGuidance", {
    brokerageId: input.auth.brokerage._id,
    cameraAnglesTiptapJson,
    createdAt: input.now,
    organizationId: input.workosOrganizationId,
    proposalId: input.proposalId,
    proposalSubmilestoneId: input.proposalSubmilestoneId,
    updatedAt: input.now,
    updatedByWorkosUserId: input.auth.subject,
    whatToVerifyTiptapJson,
  });
  await attachSubmilestoneFieldGuidanceBuildLineage(ctx, {
    brokerageId: input.auth.brokerage._id,
    organizationId: input.workosOrganizationId,
    proposalId: input.proposalId,
    proposalSubmilestoneId: input.proposalSubmilestoneId,
  });
  return guidanceId;
}

async function insertDraftProposalMilestoneDraw(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    now: number;
    proposalId: Id<"buildProposals">;
    workosOrganizationId: string;
  },
  milestone: {
    drawAvailabilityCents: number;
    milestoneId: Id<"proposalMilestones">;
    row: DraftProposalMilestoneInput;
  },
) {
  return await ctx.db.insert("proposalDrawScheduleRows", {
    amountCents: milestone.drawAvailabilityCents,
    brokerageId: input.auth.brokerage._id,
    createdAt: input.now,
    drawKey: `draw-${String(milestone.row.order).padStart(2, "0")}`,
    label: `${milestone.row.name} reimbursement draw`,
    milestoneKey: milestone.row.key,
    order: milestone.row.order,
    organizationId: input.workosOrganizationId,
    proposalId: input.proposalId,
    proposalMilestoneId: milestone.milestoneId,
    source: "milestone",
    timingDay: milestone.row.dayEnd,
    updatedAt: input.now,
  });
}

async function insertDraftProposalDrawRows(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    draws?: DraftProposalDrawInput[];
    now: number;
    proposalId: Id<"buildProposals">;
    workosOrganizationId: string;
  },
  planRows: DraftProposalPlanRows,
) {
  const draws = [...(input.draws ?? [])].sort(
    (a, b) =>
      (a.order ?? 0) - (b.order ?? 0) ||
      a.timingDay - b.timingDay ||
      a.drawKey.localeCompare(b.drawKey),
  );
  for (const [index, draw] of draws.entries()) {
    const milestoneKey = draw.milestoneKey?.trim();
    const milestone = milestoneKey
      ? planRows.milestoneByKey.get(milestoneKey)
      : undefined;
    if (milestoneKey && !milestone) {
      throw new Error(
        `Draw ${draw.drawKey} references missing milestone ${milestoneKey}.`,
      );
    }
    const drawId = await ctx.db.insert("proposalDrawScheduleRows", {
      amountCents: Math.max(0, Math.round(draw.amountCents)),
      brokerageId: input.auth.brokerage._id,
      createdAt: input.now,
      drawKey:
        draw.drawKey.trim() || `draw-${String(index + 1).padStart(2, "0")}`,
      label:
        draw.label.trim() ||
        `${milestone?.key ?? `Draw ${index + 1}`} reimbursement draw`,
      milestoneKey: milestone?.key,
      order: draw.order ?? index + 1,
      organizationId: input.workosOrganizationId,
      proposalId: input.proposalId,
      proposalMilestoneId: milestone?._id,
      source: "milestone",
      customDate: draw.customDate,
      timingDay: Math.max(0, Math.round(draw.timingDay)),
      updatedAt: input.now,
    });
    if (milestone) {
      planRows.drawIdByMilestoneKey.set(milestone.key, drawId);
    }
  }
}

export async function insertDraftProposalCostItems(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    borrowerCoPayBps: number;
    costItems: DraftProposalCostItemInput[];
    now: number;
    planRows: DraftProposalPlanRows;
    proposalId: Id<"buildProposals">;
    workosOrganizationId: string;
  },
) {
  const costDeltaByMilestoneKey = new Map<string, number>();
  const costDeltaBySubmilestoneKey = new Map<string, number>();
  const maintainedTargets = new Set<string>();
  for (const costItem of input.costItems) {
    const { item, milestone, totalCents } = await insertDraftProposalCostItem(
      ctx,
      input,
      costItem,
    );
    if (item.budgetTreatment === "add") {
      costDeltaByMilestoneKey.set(
        milestone.key,
        (costDeltaByMilestoneKey.get(milestone.key) ?? 0) + totalCents,
      );
      if (item.budgetSubmilestoneKey) {
        const target = `${milestone.key}:${item.budgetSubmilestoneKey}`;
        costDeltaBySubmilestoneKey.set(
          target,
          (costDeltaBySubmilestoneKey.get(target) ?? 0) + totalCents,
        );
      }
    }
    if (item.budgetTreatment === "maintain" && item.budgetSubmilestoneKey) {
      maintainedTargets.add(`${milestone.key}:${item.budgetSubmilestoneKey}`);
    }
  }
  return await applyDraftProposalCostItemDeltas(ctx, input, {
    costDeltaByMilestoneKey,
    costDeltaBySubmilestoneKey,
    maintainedTargets,
  });
}

async function insertDraftProposalCostItem(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    now: number;
    planRows: DraftProposalPlanRows;
    proposalId: Id<"buildProposals">;
    workosOrganizationId: string;
  },
  costItem: DraftProposalCostItemInput,
) {
  const milestone = getDraftProposalSavedMilestone(
    input.planRows,
    costItem.milestoneKey,
  );
  const relevantSubmilestoneKeys = await validateProposalCostItemSubmilestones(
    ctx,
    milestone,
    costItem.relevantSubmilestoneKeys,
  );
  const budgetTreatment = normalizeCostItemBudgetTreatment(
    costItem.budgetTreatment,
  );
  const budgetSubmilestoneKey = await validateProposalCostItemBudgetTarget(
    ctx,
    milestone,
    costItem.budgetSubmilestoneKey,
    budgetTreatment,
    costItem.budgetTreatment !== undefined,
  );
  const costCents = normalizeCostItemCost(costItem.costCents);
  const quantity = normalizeCostItemQuantity(costItem.quantity);
  const title = normalizeRequiredText(costItem.title, "Cost item title");
  const delivery = validateCostItemDeliveryWindow(costItem);
  const item = {
    brokerageId: input.auth.brokerage._id,
    budgetSubmilestoneKey,
    budgetTreatment,
    costCents,
    createdAt: input.now,
    createdByWorkosUserId: input.auth.subject,
    deliveryEndDay: delivery.deliveryEndDay,
    deliveryInstructions: normalizeOptionalText(costItem.deliveryInstructions),
    deliveryLocation: normalizeOptionalText(costItem.deliveryLocation),
    deliveryStartDay: delivery.deliveryStartDay,
    description: normalizeOptionalText(costItem.description),
    itemKey: await nextProposalCostItemKey(
      ctx,
      input.proposalId,
      title,
      input.now,
    ),
    itemType: costItem.itemType,
    milestoneKey: milestone.key,
    organizationId: input.workosOrganizationId,
    proposalId: input.proposalId,
    proposalMilestoneId: milestone._id,
    quantity,
    relevantSubmilestoneKeys,
    specificationTiptapJson: normalizeOptionalTiptapJson(
      costItem.specificationTiptapJson,
      "Material specification",
    ),
    supplier: normalizeOptionalText(costItem.supplier),
    title,
    unit: normalizeOptionalText(costItem.unit),
    updatedAt: input.now,
    updatedByWorkosUserId: input.auth.subject,
  };
  const itemId = await ctx.db.insert("proposalCostItems", item);
  return {
    item: { ...item, _id: itemId },
    milestone,
    totalCents: costItemTotalCents(item),
  };
}

async function applyDraftProposalCostItemDeltas(
  ctx: MutationCtx,
  input: {
    borrowerCoPayBps: number;
    now: number;
    planRows: DraftProposalPlanRows;
    proposalId: Id<"buildProposals">;
  },
  deltas: {
    costDeltaByMilestoneKey: Map<string, number>;
    costDeltaBySubmilestoneKey: Map<string, number>;
    maintainedTargets: Set<string>;
  },
) {
  let totalDeltaCents = 0;
  for (const [target, deltaCents] of deltas.costDeltaBySubmilestoneKey) {
    const separator = target.indexOf(":");
    const milestoneKey = target.slice(0, separator);
    const submilestoneKey = target.slice(separator + 1);
    const submilestoneId = input.planRows.submilestoneByMilestoneAndKey.get(
      `${milestoneKey}:${submilestoneKey}`,
    );
    if (!submilestoneId) {
      throw new Error(`Budget sub-milestone not found: ${submilestoneKey}.`);
    }
    const submilestone = await ctx.db.get(submilestoneId);
    if (!submilestone) {
      throw new Error(`Budget sub-milestone not found: ${submilestoneKey}.`);
    }
    await ctx.db.patch(submilestone._id, {
      budgetCents: Math.max(
        0,
        Math.round((submilestone.budgetCents ?? 0) + deltaCents),
      ),
      updatedAt: input.now,
    });
  }
  for (const [milestoneKey, deltaCents] of deltas.costDeltaByMilestoneKey) {
    if (deltaCents === 0) {
      continue;
    }
    const milestone = getDraftProposalSavedMilestone(
      input.planRows,
      milestoneKey,
    );
    const nextBudgetCents = milestone.budgetCents + deltaCents;
    const nextDrawAvailabilityCents = calculateDrawAvailability(
      nextBudgetCents,
      input.borrowerCoPayBps,
    );
    await ctx.db.patch(milestone._id, {
      budgetCents: nextBudgetCents,
      drawAvailabilityCents: nextDrawAvailabilityCents,
      updatedAt: input.now,
    });
    await syncMilestoneOwnedDrawAmount(ctx, {
      amountCents: nextDrawAvailabilityCents,
      milestoneKey: milestone.key,
      proposalId: input.proposalId,
      updatedAt: input.now,
    });
    totalDeltaCents += deltaCents;
  }
  for (const target of deltas.maintainedTargets) {
    const separator = target.indexOf(":");
    const milestoneKey = target.slice(0, separator);
    const submilestoneKey = target.slice(separator + 1);
    const milestone = getDraftProposalSavedMilestone(
      input.planRows,
      milestoneKey,
    );
    await validateProposalMaintainedCostCoverage(ctx, {
      milestoneId: milestone._id,
      proposalId: input.proposalId,
      submilestoneKey,
    });
  }
  return totalDeltaCents;
}

export async function insertDraftProposalContractorAssignments(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    contractorAssignments: DraftProposalContractorAssignmentInput[];
    now: number;
    planRows: DraftProposalPlanRows;
    proposalId: Id<"buildProposals">;
    workosOrganizationId: string;
  },
) {
  let contractorMilestoneAssignmentCount = 0;
  for (const assignment of input.contractorAssignments) {
    contractorMilestoneAssignmentCount +=
      await insertDraftProposalContractorAssignment(ctx, input, assignment);
  }
  return contractorMilestoneAssignmentCount;
}

async function insertDraftProposalContractorAssignment(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    now: number;
    planRows: DraftProposalPlanRows;
    proposalId: Id<"buildProposals">;
    workosOrganizationId: string;
  },
  assignment: DraftProposalContractorAssignmentInput,
) {
  const milestone = getDraftProposalSavedMilestone(
    input.planRows,
    assignment.milestoneKey,
  );
  const role = normalizeOptionalString(assignment.role) ?? "Contractor";
  const contractor = await resolveDraftProposalAssignmentContractor(
    ctx,
    input,
    {
      assignment,
      role,
    },
  );
  const proposalContractorAssignmentId =
    await ensureProposalContractorAssignment(ctx, {
      agreedRateCents: contractor.defaultPayRateCents,
      agreedRateUnit: contractor.defaultPayRateUnit ?? "hour",
      auth: input.auth,
      contractorId: contractor._id,
      proposalId: input.proposalId,
      preserveExistingRole: true,
      role,
      workosOrganizationId: input.workosOrganizationId,
    });
  const targets = resolveDraftProposalAssignmentTargets(input.planRows, {
    assignment,
    milestone,
  });
  const estimatedHours = normalizeOptionalHours(assignment.estimatedHours);
  const estimatedCostCents = normalizeOptionalMoneyCents(
    assignment.estimatedCostCents,
  );
  for (const target of targets) {
    await ctx.db.insert("proposalMilestoneContractorAssignments", {
      assignedAt: input.now,
      assignedByWorkosUserId: input.auth.subject,
      brokerageId: input.auth.brokerage._id,
      contractorId: contractor._id,
      createdAt: input.now,
      estimatedCostCents,
      estimatedHours,
      milestoneKey: milestone.key,
      organizationId: input.workosOrganizationId,
      proposalContractorAssignmentId,
      proposalId: input.proposalId,
      proposalMilestoneId: milestone._id,
      proposalSubmilestoneId: target.id,
      role,
      status: "planned",
      submilestoneKey: target.key,
      updatedAt: input.now,
    });
  }
  return targets.length;
}

async function resolveDraftProposalAssignmentContractor(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    now: number;
    workosOrganizationId: string;
  },
  contractorInput: {
    assignment: DraftProposalContractorAssignmentInput;
    role: string;
  },
) {
  const contractorId = await resolveDraftProposalContractorProfile(ctx, {
    auth: input.auth,
    contractorId: contractorInput.assignment.contractorId,
    contractorName: contractorInput.assignment.contractorName,
    now: input.now,
    role: contractorInput.role,
    workosOrganizationId: input.workosOrganizationId,
  });
  const contractor = await getScopedContractorOrThrow(
    ctx,
    contractorId,
    input.auth.brokerage._id,
  );
  if (contractor.status !== "active") {
    throw new Error("Production contractor is inactive.");
  }
  return contractor;
}

function resolveDraftProposalAssignmentTargets(
  planRows: DraftProposalPlanRows,
  input: {
    assignment: DraftProposalContractorAssignmentInput;
    milestone: DraftProposalSavedMilestone;
  },
) {
  const submilestoneKeys = [
    ...new Set(
      input.assignment.submilestoneKeys
        .map((key) => key.trim())
        .filter((key) => key.length > 0),
    ),
  ];
  const invalidSubmilestoneKeys = submilestoneKeys.filter(
    (key) =>
      !planRows.submilestoneByMilestoneAndKey.has(
        `${input.milestone.key}:${key}`,
      ),
  );
  if (invalidSubmilestoneKeys.length > 0) {
    throw new Error(
      `Contractor sub-milestones must belong to ${input.milestone.key}: ${invalidSubmilestoneKeys.join(", ")}.`,
    );
  }
  if (submilestoneKeys.length === 0) {
    return [{ id: undefined, key: undefined }];
  }
  return submilestoneKeys.map((key) => ({
    id: planRows.submilestoneByMilestoneAndKey.get(
      `${input.milestone.key}:${key}`,
    ),
    key,
  }));
}

function getDraftProposalSavedMilestone(
  planRows: DraftProposalPlanRows,
  milestoneKey: string,
) {
  const milestone = planRows.milestoneByKey.get(milestoneKey);
  if (!milestone) {
    throw new Error(`Production milestone not found: ${milestoneKey}`);
  }
  return milestone;
}

export const productionSelectedPlanNames = {
  capitalConstrained: "Capital-Constrained",
  cheapestFeasible: "Cheapest Feasible",
  fastest: "Fastest",
} as const;

export function normalizeSelectedPlanMetric(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return Math.round(value);
}

export function normalizeCapitalEventInterestRate(
  eventKind: "cashInfusion" | "cost" | "homeEquityTakeout",
  value: number | undefined,
) {
  if (eventKind !== "homeEquityTakeout") {
    return undefined;
  }
  if (
    value === undefined ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 10_000
  ) {
    throw new Error(
      "Home Equity Takeout interest rate must be between 0 and 10,000 basis points.",
    );
  }
  return Math.round(value);
}

export async function normalizeProposalCapitalEventDay(
  ctx: MutationCtx,
  proposal: Pick<Doc<"buildProposals">, "_id" | "timelineRangeMax">,
  value: number,
) {
  const day = Math.round(value);
  const [milestones, draws] = await Promise.all([
    collectByIndex(
      ctx,
      "proposalMilestones",
      "by_proposal",
      proposal._id,
    ) as Promise<Doc<"proposalMilestones">[]>,
    collectByIndex(
      ctx,
      "proposalDrawScheduleRows",
      "by_proposal",
      proposal._id,
    ) as Promise<Doc<"proposalDrawScheduleRows">[]>,
  ]);
  const timelineEnd = Math.max(
    60,
    Math.round(proposal.timelineRangeMax ?? 0),
    ...milestones.map((milestone) => milestone.dayEnd + 10),
    ...draws.map((draw) => draw.timingDay + 10),
  );
  if (
    !Number.isFinite(value) ||
    day < PROPOSAL_TIMELINE_MIN_DAY ||
    day > timelineEnd
  ) {
    throw new Error(
      `Capital event day must be between T−30 and T+${timelineEnd}.`,
    );
  }
  return day;
}
