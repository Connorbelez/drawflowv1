/**
 * Production proposals proposal cost persistence bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type RoleSlug } from "../authz";
import { upsertSubmilestoneScopeV1Draft } from "../submilestone_scope_contracts";
import { assertProposalCollaborationEditAllowed } from "../proposal_collaboration_model";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { requireBackofficeProposalWrite } from "./contractor_policy_helpers.js";
import { EMPTY_CANONICAL_TIPTAP_DOCUMENT } from "./contracts_foundation.js";
import { isBackoffice } from "./proposal_claim.js";
import { getProductionMilestoneOrThrow, upsertKanbanCard } from "./proposal_copy_audit.js";
import { normalizeOptionalTiptapJson, costItemTotalCents, normalizeCostItemBudgetTreatment } from "./proposal_cost_validation.js";
import { normalizeProductionMilestoneSchedule, assertValidProductionSubmilestones, sumProductionSubmilestoneBudgetCents } from "./proposal_draft_model.js";
import { assertProposalSubmilestoneCanonicalAuthoringAllowed, upsertProposalSubmilestoneFieldGuidance, normalizeProposalCapitalEventDay } from "./proposal_draft_persistence.js";
import { calculateDrawAvailability, sumProposalDrawScheduleAmountCents } from "./proposal_lender_approval.js";
import { collectByIndex } from "./storage_helpers.js";

export async function syncMilestoneOwnedDrawAmount(
  ctx: MutationCtx,
  input: {
    amountCents: number;
    milestoneKey: string;
    proposalId: Id<"buildProposals">;
    updatedAt: number;
  },
) {
  const draws = (await collectByIndex(
    ctx,
    "proposalDrawScheduleRows",
    "by_proposal",
    input.proposalId,
  )) as Doc<"proposalDrawScheduleRows">[];
  const draw = draws.find(
    (row) =>
      row.milestoneKey === input.milestoneKey &&
      (row.source === undefined || row.source === "milestone"),
  );

  if (!draw) {
    return;
  }

  await ctx.db.patch(draw._id, {
    amountCents: Math.max(0, Math.round(input.amountCents)),
    updatedAt: input.updatedAt,
  });
}

export async function requireProductionTimelineLiveWrite(
  ctx: QueryCtx | MutationCtx,
  auth: {
    proposal: Doc<"buildProposals">;
    roles: RoleSlug[];
    subject: string;
  },
) {
  if (auth.proposal.status !== "approved") {
    throw new Error(
      "Live-build timeline actions require an approved proposal.",
    );
  }
  if (isBackoffice(auth.roles)) {
    requireBackofficeProposalWrite(auth, auth.proposal);
  }
  await assertProposalCollaborationEditAllowed(ctx, auth);
}

export async function insertProductionMilestoneFromInput(
  ctx: MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    proposal: Doc<"buildProposals">;
    subject: string;
  },
  milestone: {
    budgetCents: number;
    dayEnd: number;
    dayStart: number;
    dependencyKeys?: string[];
    drawAvailabilityCents?: number;
    durationDays: number;
    evidenceState: string;
    icon?: string;
    lane?: number;
    markerLabel?: string;
    milestoneKey: string;
    name: string;
    order: number;
    policyState: string;
    status?: string;
    submilestones?: {
      budgetCents?: number;
      durationDays?: number;
      fieldGuidance?: {
        cameraAnglesTiptapJson: string;
        whatToVerifyTiptapJson: string;
      };
      key: string;
      name: string;
      order: number;
      scopeOfWorkTiptapJson?: string;
      startDay?: number;
    }[];
    tone?: string;
    x: number;
  },
) {
  if (
    !Number.isFinite(milestone.dayStart) ||
    !Number.isFinite(milestone.dayEnd) ||
    !Number.isFinite(milestone.x) ||
    Math.round(milestone.dayStart) < 0 ||
    Math.round(milestone.dayEnd) < 0 ||
    Math.round(milestone.x) < 0
  ) {
    throw new Error("Milestones must start and end on or after T0.");
  }
  const existing = await ctx.db
    .query("proposalMilestones")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", auth.proposal._id).eq("key", milestone.milestoneKey),
    )
    .unique();
  if (existing) {
    throw new Error("Production milestone already exists.");
  }
  const schedule = normalizeProductionMilestoneSchedule(milestone);
  const now = Date.now();
  const budgetCents =
    schedule.submilestones.length > 0
      ? sumProductionSubmilestoneBudgetCents(schedule.submilestones)
      : Math.max(0, Math.round(milestone.budgetCents));
  const milestoneId = await ctx.db.insert("proposalMilestones", {
    brokerageId: auth.brokerage._id,
    budgetCents,
    createdAt: now,
    dayEnd: schedule.dayEnd,
    dayStart: schedule.dayStart,
    dependencyKeys: milestone.dependencyKeys ?? [],
    drawAvailabilityCents:
      milestone.drawAvailabilityCents === undefined
        ? calculateDrawAvailability(budgetCents, auth.proposal.borrowerCoPayBps)
        : Math.max(0, Math.round(milestone.drawAvailabilityCents)),
    durationDays: schedule.durationDays,
    evidenceState: milestone.evidenceState,
    icon: milestone.icon,
    key: milestone.milestoneKey,
    lane: milestone.lane,
    markerLabel: milestone.markerLabel,
    name: milestone.name.trim() || "Requested milestone",
    order: Math.max(1, Math.round(milestone.order)),
    organizationId: auth.proposal.organizationId,
    policyState: milestone.policyState,
    proposalId: auth.proposal._id,
    timelineStatus: milestone.status,
    tone: milestone.tone,
    updatedAt: now,
  });
  await replaceProductionSubmilestones(ctx, auth, {
    milestone: {
      _id: milestoneId,
      key: milestone.milestoneKey,
    },
    proposalId: auth.proposal._id,
    rows: schedule.submilestones,
  });
  return milestoneId;
}

export async function deleteProposalSubmilestoneCanonicalLineage(
  ctx: MutationCtx,
  submilestone: Doc<"proposalSubmilestones"> | null,
  resolved: {
    contract?: Doc<"submilestoneScopeContracts">;
    guidance?: Doc<"submilestoneFieldGuidance">;
  } = {},
  options: { validateOnly?: boolean } = {},
) {
  const contract =
    resolved.contract ??
    (submilestone
      ? await ctx.db
          .query("submilestoneScopeContracts")
          .withIndex("by_proposalSubmilestoneId", (query) =>
            query.eq("proposalSubmilestoneId", submilestone._id),
          )
          .unique()
      : null);
  const guidance =
    resolved.guidance ??
    (submilestone
      ? await ctx.db
          .query("submilestoneFieldGuidance")
          .withIndex("by_proposalSubmilestoneId", (query) =>
            query.eq("proposalSubmilestoneId", submilestone._id),
          )
          .unique()
      : null);
  const expectedProposalId =
    submilestone?.proposalId ?? contract?.proposalId ?? guidance?.proposalId;
  const expectedOrganizationId =
    submilestone?.organizationId ??
    contract?.organizationId ??
    guidance?.organizationId;
  const expectedBrokerageId =
    submilestone?.brokerageId ?? contract?.brokerageId ?? guidance?.brokerageId;
  if (contract) {
    if (
      contract.proposalId !== expectedProposalId ||
      contract.organizationId !== expectedOrganizationId ||
      contract.brokerageId !== expectedBrokerageId ||
      (submilestone !== null &&
        contract.proposalSubmilestoneId !== submilestone._id)
    ) {
      throw new Error("Scope contract lineage is unavailable.");
    }
    const publishedRevisions = await ctx.db
      .query("submilestoneScopeRevisions")
      .withIndex("by_contractId_and_status", (query) =>
        query.eq("contractId", contract._id).eq("status", "published"),
      )
      .take(1);
    if (contract.effectiveRevisionId || publishedRevisions.length > 0) {
      throw new Error(
        "Published Scope lineage cannot be removed from a Proposal draft.",
      );
    }
  }
  if (
    guidance &&
    (guidance.proposalId !== expectedProposalId ||
      guidance.organizationId !== expectedOrganizationId ||
      guidance.brokerageId !== expectedBrokerageId ||
      (submilestone !== null &&
        guidance.proposalSubmilestoneId !== submilestone._id))
  ) {
    throw new Error("Field Guidance lineage is unavailable.");
  }
  if (options.validateOnly) {
    return;
  }
  if (contract) {
    const decisions = await ctx.db
      .query("submilestoneScopeDecisions")
      .withIndex("by_contractId", (query) =>
        query.eq("contractId", contract._id),
      )
      .collect();
    for (const decision of decisions) {
      await ctx.db.delete(decision._id);
    }
    const revisions = await ctx.db
      .query("submilestoneScopeRevisions")
      .withIndex("by_contractId_and_version", (query) =>
        query.eq("contractId", contract._id),
      )
      .collect();
    for (const revision of revisions) {
      await ctx.db.delete(revision._id);
    }
    await ctx.db.delete(contract._id);
  }
  if (guidance) {
    await ctx.db.delete(guidance._id);
  }
}

export async function replaceProductionSubmilestones(
  ctx: MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    proposal: Doc<"buildProposals">;
    subject: string;
  },
  input: {
    milestone: Pick<Doc<"proposalMilestones">, "_id" | "key">;
    proposalId: Id<"buildProposals">;
    rejectEmpty?: boolean;
    rows: {
      budgetCents?: number;
      durationDays?: number;
      fieldGuidance?: {
        cameraAnglesTiptapJson: string;
        whatToVerifyTiptapJson: string;
      };
      key: string;
      name: string;
      order: number;
      scopeOfWorkTiptapJson?: string;
      startDay?: number;
    }[];
  },
) {
  const nextSubmilestoneByKey = new Map(
    input.rows.map((row) => [row.key, row] as const),
  );
  const targetedCostItems = await ctx.db
    .query("proposalCostItems")
    .withIndex("by_milestone", (q) =>
      q.eq("proposalMilestoneId", input.milestone._id),
    )
    .collect();
  const maintainedCentsByTarget = new Map<string, number>();
  for (const item of targetedCostItems) {
    const target = item.budgetSubmilestoneKey;
    if (!target) {
      continue;
    }
    if (!nextSubmilestoneByKey.has(target)) {
      throw new Error(
        `Cannot remove budget sub-milestone ${target} while cost items target it.`,
      );
    }
    if (normalizeCostItemBudgetTreatment(item.budgetTreatment) === "maintain") {
      maintainedCentsByTarget.set(
        target,
        (maintainedCentsByTarget.get(target) ?? 0) + costItemTotalCents(item),
      );
    }
  }
  for (const [target, maintainedCents] of maintainedCentsByTarget) {
    const budgetCents = Math.max(
      0,
      Math.round(nextSubmilestoneByKey.get(target)?.budgetCents ?? 0),
    );
    if (maintainedCents > budgetCents) {
      throw new Error(
        `Maintained cost items exceed the ${target} budget by ${maintainedCents - budgetCents} cents.`,
      );
    }
  }
  if (input.rejectEmpty) {
    assertValidProductionSubmilestones(
      input.rows,
      `Milestone ${input.milestone.key}`,
    );
  }
  const existing = await ctx.db
    .query("proposalSubmilestones")
    .withIndex("by_milestone", (q) =>
      q.eq("proposalMilestoneId", input.milestone._id),
    )
    .collect();
  const existingByKey = new Map(existing.map((row) => [row.key, row]));
  const retainedKeys = new Set(input.rows.map((row) => row.key));
  for (const row of existing) {
    if (retainedKeys.has(row.key)) {
      continue;
    }
    await deleteProposalSubmilestoneCanonicalLineage(ctx, row);
    await ctx.db.delete(row._id);
  }
  const now = Date.now();
  for (const row of [...input.rows].sort((a, b) => a.order - b.order)) {
    assertProposalSubmilestoneCanonicalAuthoringAllowed(auth.proposal, row);
    const existingRow = existingByKey.get(row.key);
    const scopeOfWorkTiptapJson = normalizeOptionalTiptapJson(
      row.scopeOfWorkTiptapJson,
      "Sub-milestone Scope of Work",
    );
    const values = {
      brokerageId: auth.brokerage._id,
      budgetCents: row.budgetCents,
      createdAt: existingRow?.createdAt ?? now,
      durationDays: row.durationDays,
      key: row.key,
      milestoneKey: input.milestone.key,
      name: row.name.trim() || "Submilestone",
      order: Math.max(1, Math.round(row.order)),
      organizationId: auth.proposal.organizationId,
      proposalId: input.proposalId,
      proposalMilestoneId: input.milestone._id,
      startDay: row.startDay,
      updatedAt: now,
    };
    const submilestoneId = existingRow
      ? existingRow._id
      : await ctx.db.insert("proposalSubmilestones", values);
    if (existingRow) {
      await ctx.db.patch(existingRow._id, values);
    }
    if (!existingRow || scopeOfWorkTiptapJson !== undefined) {
      await upsertSubmilestoneScopeV1Draft(ctx, {
        authoredByWorkosUserId: auth.subject,
        brokerageId: auth.brokerage._id,
        now,
        organizationId: auth.proposal.organizationId,
        proposalId: input.proposalId,
        proposalSubmilestoneId: submilestoneId,
        scopeOfWorkTiptapJson:
          scopeOfWorkTiptapJson ?? EMPTY_CANONICAL_TIPTAP_DOCUMENT,
      });
    }
    if (!existingRow || row.fieldGuidance !== undefined) {
      await upsertProposalSubmilestoneFieldGuidance(ctx, {
        auth,
        fieldGuidance: row.fieldGuidance ?? {
          cameraAnglesTiptapJson: EMPTY_CANONICAL_TIPTAP_DOCUMENT,
          whatToVerifyTiptapJson: EMPTY_CANONICAL_TIPTAP_DOCUMENT,
        },
        now,
        proposalId: input.proposalId,
        proposalSubmilestoneId: submilestoneId,
        workosOrganizationId: auth.proposal.organizationId,
      });
    }
  }
}

export async function upsertProposalMilestoneDrawAvailability(
  ctx: MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    proposal: Doc<"buildProposals">;
  },
  input: {
    amountCents: number;
    drawKey?: string;
    milestone: Pick<
      Doc<"proposalMilestones">,
      "_id" | "key" | "name" | "organizationId"
    >;
    proposalId: Id<"buildProposals">;
    timingDay: number;
  },
) {
  const amountCents = Math.max(0, Math.round(input.amountCents));
  const now = Date.now();
  const drawRows = (await collectByIndex(
    ctx,
    "proposalDrawScheduleRows",
    "by_proposal",
    input.proposalId,
  )) as Doc<"proposalDrawScheduleRows">[];
  const requestedDrawKey = normalizeProposalTimelineDrawKey(
    input.drawKey,
    input.milestone.key,
  );
  const existing =
    drawRows.find((row) => row.milestoneKey === input.milestone.key) ??
    drawRows.find((row) => row.drawKey === requestedDrawKey);

  if (existing) {
    await ctx.db.patch(existing._id, {
      amountCents,
      milestoneKey: input.milestone.key,
      proposalMilestoneId: input.milestone._id,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("proposalDrawScheduleRows", {
    amountCents,
    brokerageId: auth.brokerage._id,
    createdAt: now,
    customDate: false,
    drawKey: requestedDrawKey,
    label: `${input.milestone.name} reimbursement draw`,
    milestoneKey: input.milestone.key,
    order: drawRows.length + 1,
    organizationId: input.milestone.organizationId,
    proposalId: input.proposalId,
    proposalMilestoneId: input.milestone._id,
    source: "milestone",
    timingDay: Math.max(0, Math.round(input.timingDay)),
    updatedAt: now,
  });
}

function normalizeProposalTimelineDrawKey(
  drawKey: string | undefined,
  milestoneKey: string,
) {
  const trimmedDrawKey = drawKey?.trim();
  if (trimmedDrawKey && !/^draw\s+\d+$/i.test(trimmedDrawKey)) {
    return trimmedDrawKey;
  }
  return `${milestoneKey}-draw`;
}

export async function deleteProductionMilestoneCascade(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">,
  milestone: Doc<"proposalMilestones">,
) {
  const submilestones = await ctx.db
    .query("proposalSubmilestones")
    .withIndex("by_milestone", (q) =>
      q.eq("proposalMilestoneId", milestone._id),
    )
    .collect();
  for (const row of submilestones) {
    await deleteProposalSubmilestoneCanonicalLineage(ctx, row);
    await ctx.db.delete(row._id);
  }
  const costItems = await ctx.db
    .query("proposalCostItems")
    .withIndex("by_milestone", (q) =>
      q.eq("proposalMilestoneId", milestone._id),
    )
    .collect();
  for (const item of costItems) {
    await ctx.db.delete(item._id);
  }
  const evidenceAssets = await ctx.db
    .query("proposalEvidenceAssets")
    .withIndex("by_proposal_milestone", (q) =>
      q.eq("proposalId", proposalId).eq("milestoneKey", milestone.key),
    )
    .collect();
  for (const asset of evidenceAssets) {
    if (asset.storageId) {
      await ctx.storage.delete(asset.storageId);
    }
    await ctx.db.delete(asset._id);
  }
  const draws = await collectByIndex(
    ctx,
    "proposalDrawScheduleRows",
    "by_proposal",
    proposalId,
  );
  for (const draw of draws.filter(
    (row: any) => row.milestoneKey === milestone.key,
  )) {
    await ctx.db.delete(draw._id);
  }
  await ctx.db.delete(milestone._id);
}

export async function recalculateProposalBudget(
  ctx: MutationCtx,
  auth: { proposal?: Doc<"buildProposals">; subject: string },
  proposalId: Id<"buildProposals">,
) {
  const proposal = auth.proposal ?? (await ctx.db.get(proposalId));
  if (!proposal) {
    throw new Error("Production proposal not found.");
  }
  const milestones = await collectByIndex(
    ctx,
    "proposalMilestones",
    "by_proposal",
    proposalId,
  );
  const capitalEvents = await collectByIndex(
    ctx,
    "proposalCapitalEvents",
    "by_proposal",
    proposalId,
  );
  const milestoneBudgetCents = milestones.reduce(
    (total: number, milestone: any) => total + milestone.budgetCents,
    0,
  );
  const capitalSpikeBudgetCents = capitalEvents.reduce(
    (total: number, event: any) =>
      event.eventKind === "cost" ? total + event.amountCents : total,
    0,
  );
  const totalBudgetCents = milestoneBudgetCents + capitalSpikeBudgetCents;
  const totalDrawAmountCents = await sumProposalDrawScheduleAmountCents(
    ctx,
    proposalId,
  );
  const lenderDrawPolicyLimitCents = Math.max(
    Math.max(0, Math.round(proposal.lenderDrawPolicyLimitCents)),
    totalDrawAmountCents,
  );
  await ctx.db.patch(proposalId, {
    borrowerCoPayCents: Math.round(
      (totalBudgetCents * proposal.borrowerCoPayBps) / 10_000,
    ),
    lenderDrawPolicyLimitCents,
    totalBudgetCents,
    updatedAt: Date.now(),
    updatedByWorkosUserId: auth.subject,
  });
  await upsertKanbanCard(ctx, proposalId, Date.now());
  return totalBudgetCents;
}

export async function refreshProposalMilestoneDrawAvailability(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">,
  input: { borrowerCoPayBps: number; updatedAt: number },
) {
  const milestones = (await collectByIndex(
    ctx,
    "proposalMilestones",
    "by_proposal",
    proposalId,
  )) as Doc<"proposalMilestones">[];

  for (const milestone of milestones) {
    const drawAvailabilityCents = calculateDrawAvailability(
      milestone.budgetCents,
      input.borrowerCoPayBps,
    );
    await ctx.db.patch(milestone._id, {
      drawAvailabilityCents,
      updatedAt: input.updatedAt,
    });
  }
}

export async function applyProductionTimelineModificationRequest(
  ctx: MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    proposal: Doc<"buildProposals">;
    roles: RoleSlug[];
    subject: string;
  },
  request: Doc<"proposalTimelineModificationRequests">,
) {
  if (request.requestType === "createMilestone") {
    const milestone = request.requestedPayload?.milestone;
    if (!milestone) {
      throw new Error("milestone payload is required.");
    }
    await insertProductionMilestoneFromInput(ctx, auth, milestone);
    await recalculateProposalBudget(ctx, auth, request.proposalId);
    return;
  }
  if (!request.milestoneKey) {
    throw new Error("milestoneKey is required.");
  }
  const milestone = await getProductionMilestoneOrThrow(
    ctx,
    request.proposalId,
    request.milestoneKey,
  );
  if (request.requestType === "deleteMilestone") {
    await deleteProductionMilestoneCascade(ctx, request.proposalId, milestone);
    await recalculateProposalBudget(ctx, auth, request.proposalId);
    return;
  }
  if (request.requestType === "updateMilestoneBudget") {
    const budgetCents = request.requestedPayload?.budgetCents;
    if (typeof budgetCents !== "number" || budgetCents < 0) {
      throw new Error("budgetCents is required.");
    }
    await ctx.db.patch(milestone._id, {
      budgetCents: Math.round(budgetCents),
      drawAvailabilityCents: calculateDrawAvailability(
        Math.round(budgetCents),
        auth.proposal.borrowerCoPayBps,
      ),
      updatedAt: Date.now(),
    });
    await recalculateProposalBudget(ctx, auth, request.proposalId);
  }
}

export async function insertProductionCapitalEvent(
  ctx: MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    proposal: Doc<"buildProposals">;
  },
  input: {
    amountCents: number;
    capitalEventKey: string;
    eventKind: "cashInfusion" | "cost" | "homeEquityTakeout";
    interestAnnualBps?: number;
    label: string;
    order?: number;
    proposalId: Id<"buildProposals">;
    x: number;
  },
) {
  const existing = await ctx.db
    .query("proposalCapitalEvents")
    .withIndex("by_proposal_key", (q) =>
      q
        .eq("proposalId", input.proposalId)
        .eq("capitalEventKey", input.capitalEventKey),
    )
    .unique();
  if (existing) {
    throw new Error("Production capital event already exists.");
  }
  if (
    input.eventKind === "homeEquityTakeout" &&
    (!Number.isFinite(input.amountCents) || input.amountCents <= 0)
  ) {
    throw new Error("Home Equity Takeout amount must be greater than zero.");
  }
  const rows = await collectByIndex(
    ctx,
    "proposalCapitalEvents",
    "by_proposal",
    input.proposalId,
  );
  const x = await normalizeProposalCapitalEventDay(ctx, auth.proposal, input.x);
  const now = Date.now();
  await ctx.db.insert("proposalCapitalEvents", {
    amountCents: Math.max(0, Math.round(input.amountCents)),
    brokerageId: auth.brokerage._id,
    capitalEventKey: input.capitalEventKey,
    createdAt: now,
    eventKind: input.eventKind,
    ...(input.interestAnnualBps === undefined
      ? {}
      : { interestAnnualBps: input.interestAnnualBps }),
    label:
      input.label.trim() ||
      (input.eventKind === "cashInfusion"
        ? "Cash infusion"
        : input.eventKind === "homeEquityTakeout"
          ? "Home Equity Takeout"
          : "Capital spike"),
    order: input.order ?? rows.length + 1,
    organizationId: auth.proposal.organizationId,
    proposalId: input.proposalId,
    updatedAt: now,
    x,
  });
}
