/**
 * Production proposals active planning bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError } from "convex/values";
import { attachSubmilestoneFieldGuidanceBuildLineage } from "../submilestone_field_guidance";
import { attachSubmilestoneScopeBuildLineage, upsertSubmilestoneScopeV1Draft } from "../submilestone_scope_contracts";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { supersedeActiveBuildMilestoneCascade } from "./active_cost.js";
import { authorizeActiveBuildOrThrow, requireBackofficeActiveBuildWrite } from "./authorization_core.js";
import { requireActiveBuildAppPermission } from "./builder_staff_access.js";
import { requireAnyRole } from "./contractor_policy_helpers.js";
import { APPROVER_ROLES, EMPTY_CANONICAL_TIPTAP_DOCUMENT } from "./contracts_foundation.js";
import { isBackoffice } from "./proposal_claim.js";
import { costItemTotalCents, normalizeCostItemBudgetTreatment } from "./proposal_cost_validation.js";
import { normalizeProductionMilestoneSchedule, assertValidProductionSubmilestones, sumProductionSubmilestoneBudgetCents } from "./proposal_draft_model.js";
import { upsertProposalSubmilestoneFieldGuidance } from "./proposal_draft_persistence.js";
import { calculateDrawAvailability } from "./proposal_lender_approval.js";
import { collectByIndex } from "./storage_helpers.js";

export async function getActiveBuildMilestoneOrThrow(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  milestoneKey: string,
) {
  const milestone = await ctx.db
    .query("buildMilestones")
    .withIndex("by_build_key", (q) =>
      q.eq("buildId", buildId).eq("key", milestoneKey),
    )
    .unique();
  if (!milestone) {
    throw new Error("Production active-build milestone not found.");
  }
  return milestone;
}

export function assertActiveBuildPlanningTargetActive(
  milestone: Pick<Doc<"buildMilestones">, "key" | "planningState">,
  submilestone?: Pick<Doc<"buildSubmilestones">, "key" | "planningState">,
) {
  if (milestone.planningState === "superseded") {
    throw new ConvexError({
      code: "MILESTONE_SUPERSEDED",
      message:
        "This Milestone was removed by an approved planning revision and cannot execute commands.",
      milestoneKey: milestone.key,
    });
  }
  if (submilestone?.planningState === "superseded") {
    throw new ConvexError({
      code: "SUBMILESTONE_SUPERSEDED",
      message:
        "This Sub-milestone was removed by an approved planning revision and cannot execute commands.",
      submilestoneKey: submilestone.key,
    });
  }
}

export function findActiveBuildSubmilestoneByKey(
  rows: readonly Doc<"buildSubmilestones">[],
  key: string,
) {
  return (
    rows.find(
      (row) => row.key === key && row.planningState !== "superseded",
    ) ?? rows.find((row) => row.key === key)
  );
}

export async function activeBuildStartTarget(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    milestoneKey: string;
    submilestoneKey: string;
  },
): Promise<{
  milestone: Doc<"buildMilestones">;
  submilestone: Doc<"buildSubmilestones">;
}>;

export async function activeBuildStartTarget(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    milestoneKey: string;
    submilestoneKey?: string;
  },
): Promise<{
  milestone: Doc<"buildMilestones">;
  submilestone: Doc<"buildSubmilestones"> | undefined;
}>;

export async function activeBuildStartTarget(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    milestoneKey: string;
    submilestoneKey?: string;
  },
) {
  const milestone = await getActiveBuildMilestoneOrThrow(
    ctx,
    input.buildId,
    input.milestoneKey,
  );
  if (milestone.planningState === "superseded") {
    throw new ConvexError({
      code: "MILESTONE_SUPERSEDED",
      message:
        "This Milestone was removed by an approved planning revision and cannot execute commands.",
      milestoneKey: input.milestoneKey,
    });
  }
  if (!input.submilestoneKey) {
    return {
      milestone,
      submilestone: undefined,
    };
  }
  const submilestones = (await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_milestone", (query) =>
      query.eq("buildMilestoneId", milestone._id),
    )
    .take(500)) as Doc<"buildSubmilestones">[];
  const submilestone = findActiveBuildSubmilestoneByKey(
    submilestones,
    input.submilestoneKey,
  );
  if (!submilestone) {
    throw new ConvexError({
      code: "SUBMILESTONE_NOT_FOUND",
      message: "Submilestone is unavailable for this milestone.",
      submilestoneKey: input.submilestoneKey,
    });
  }
  if (submilestone.planningState === "superseded") {
    throw new ConvexError({
      code: "SUBMILESTONE_SUPERSEDED",
      message:
        "This Sub-milestone was removed by an approved planning revision and cannot execute commands.",
      submilestoneKey: input.submilestoneKey,
    });
  }
  return { milestone, submilestone };
}

export async function authorizeStartAmendment(
  ctx: QueryCtx | MutationCtx,
  auth: Awaited<ReturnType<typeof authorizeActiveBuildOrThrow>>,
  milestone: Doc<"buildMilestones">,
  submilestone?: Doc<"buildSubmilestones">,
) {
  const afterCompletion =
    milestone.status === "complete" ||
    Boolean(milestone.completionClaim) ||
    submilestone?.status === "complete";
  if (isBackoffice(auth.roles)) {
    requireAnyRole(auth.roles, APPROVER_ROLES);
    requireBackofficeActiveBuildWrite(auth);
    return;
  }
  if (afterCompletion) {
    throw new Error(
      "Forbidden: only Lender Admin can amend a start after completion.",
    );
  }
  await requireActiveBuildAppPermission(ctx, auth, "milestone", "update");
  if (submilestone) {
    await requireActiveBuildAppPermission(ctx, auth, "submilestone", "update");
  }
}

export function activeBuildMilestoneEffectiveDrawAvailabilityCents(
  milestone: Doc<"buildMilestones">,
) {
  return Math.max(0, Math.round(milestone.drawAvailabilityCents));
}

function activeBuildMilestoneEffectiveCompletionDay(
  milestone: Doc<"buildMilestones">,
) {
  const completedDay = (
    milestone.completionClaim as { completedDay?: number } | undefined
  )?.completedDay;

  if (completedDay !== undefined && Number.isFinite(completedDay)) {
    return Math.max(0, Math.round(completedDay));
  }

  return Math.round(milestone.dayEnd);
}

async function calculateActiveBuildDrawAvailableLimitCents(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  targetDraw: Doc<"plannedDrawScheduleRows">,
) {
  const drawDay = Math.round(targetDraw.timingDay);
  const [milestones, draws] = await Promise.all([
    collectByIndex(ctx, "buildMilestones", "by_build", buildId),
    collectByIndex(ctx, "plannedDrawScheduleRows", "by_build", buildId),
  ]);
  const totalUnlockedCents = (milestones as Doc<"buildMilestones">[]).reduce(
    (total, milestone) => {
      if (activeBuildMilestoneEffectiveCompletionDay(milestone) > drawDay) {
        return total;
      }

      return (
        total + activeBuildMilestoneEffectiveDrawAvailabilityCents(milestone)
      );
    },
    0,
  );
  const alreadyDrawnCents = (draws as Doc<"plannedDrawScheduleRows">[]).reduce(
    (total, draw) => {
      if (draw._id === targetDraw._id || draw.timingDay > drawDay) {
        return total;
      }

      if (
        draw.timingDay === drawDay &&
        draw.drawKey.localeCompare(targetDraw.drawKey) > 0
      ) {
        return total;
      }

      return total + Math.max(0, Math.round(draw.amountCents));
    },
    0,
  );

  return Math.max(0, totalUnlockedCents - alreadyDrawnCents);
}

export async function insertActiveBuildMilestoneFromInput(
  ctx: MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    build: Doc<"activeBuilds">;
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
    milestoneKey: string;
    name: string;
    order: number;
    policyState: string;
    submilestones?: {
      budgetCents?: number;
      durationDays?: number;
      key: string;
      name: string;
      order: number;
      startDay?: number;
    }[];
  },
) {
  const existing = await ctx.db
    .query("buildMilestones")
    .withIndex("by_build_key", (q) =>
      q.eq("buildId", auth.build._id).eq("key", milestone.milestoneKey),
    )
    .unique();
  if (existing) {
    throw new Error("Production active-build milestone already exists.");
  }
  const schedule = normalizeProductionMilestoneSchedule(milestone);
  assertValidProductionSubmilestones(
    schedule.submilestones,
    `Milestone ${milestone.milestoneKey}`,
  );
  const now = Date.now();
  const budgetCents =
    schedule.submilestones.length > 0
      ? sumProductionSubmilestoneBudgetCents(schedule.submilestones)
      : Math.max(0, Math.round(milestone.budgetCents));
  const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
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
    key: milestone.milestoneKey,
    name: milestone.name.trim() || "Active build milestone",
    order: Math.max(1, Math.round(milestone.order)),
    organizationId: auth.build.organizationId,
    policyState: milestone.policyState,
    proposalId: auth.proposal._id,
    timelineStatus: "ready",
    tone: "active",
    updatedAt: now,
  });
  const buildMilestoneId = await ctx.db.insert("buildMilestones", {
    brokerageId: auth.brokerage._id,
    budgetCents,
    buildId: auth.build._id,
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
    key: milestone.milestoneKey,
    name: milestone.name.trim() || "Active build milestone",
    order: Math.max(1, Math.round(milestone.order)),
    organizationId: auth.build.organizationId,
    policyState: milestone.policyState,
    planningState: "active",
    progressPercent: 0,
    proposalMilestoneId,
    status: "planned",
    workflowRevision: 0,
    updatedAt: now,
  });
  await replaceActiveBuildSubmilestones(ctx, auth, {
    buildId: auth.build._id,
    milestone: {
      _id: buildMilestoneId,
      key: milestone.milestoneKey,
      proposalMilestoneId,
    },
    rows: schedule.submilestones,
  });
  return buildMilestoneId;
}

export async function replaceActiveBuildSubmilestones(
  ctx: MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    build: Doc<"activeBuilds">;
    proposal: Doc<"buildProposals">;
    subject: string;
  },
  input: {
    buildId: Id<"activeBuilds">;
    milestone: Pick<
      Doc<"buildMilestones">,
      "_id" | "key" | "proposalMilestoneId"
    >;
    rejectEmpty?: boolean;
    rows: {
      budgetCents?: number;
      durationDays?: number;
      key: string;
      name: string;
      order: number;
      startDay?: number;
    }[];
  },
): Promise<{ supersededIds: Id<"buildSubmilestones">[] }> {
  const nextSubmilestoneByKey = new Map(
    input.rows.map((row) => [row.key, row] as const),
  );
  const targetedCostItems = await ctx.db
    .query("buildCostItems")
    .withIndex("by_milestone", (q) =>
      q.eq("buildMilestoneId", input.milestone._id),
    )
    .collect();
  const maintainedCentsByTarget = new Map<string, number>();
  for (const item of targetedCostItems) {
    const target = item.budgetSubmilestoneKey;
    if (!target) {
      continue;
    }
    // Removed planning rows remain as superseded canonical records so cost,
    // evidence, review, and discussion lineage stays addressable. Coverage
    // validation still applies to rows that remain executable.
    if (!nextSubmilestoneByKey.has(target)) continue;
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
  const existing = (await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_milestone", (q) =>
      q.eq("buildMilestoneId", input.milestone._id),
    )
    .take(1000)) as Doc<"buildSubmilestones">[];
  const now = Date.now();
  const supersededIds: Id<"buildSubmilestones">[] = [];
  const existingByKey = new Map<string, Doc<"buildSubmilestones">>();
  for (const row of existing) {
    // Reintroducing a removed planning row creates a new canonical occurrence.
    // The superseded row and its collaboration companion remain historical.
    if (row.planningState === "superseded") continue;
    const current = existingByKey.get(row.key);
    if (!current || row.createdAt > current.createdAt) {
      existingByKey.set(row.key, row);
    }
  }
  for (const row of existing) {
    if (nextSubmilestoneByKey.has(row.key)) continue;
    if (row.planningState === "superseded") continue;
    await ctx.db.patch(row._id, {
      planningState: "superseded",
      supersededAt: now,
      supersededByPlanningRevision: undefined,
      updatedAt: now,
    });
    supersededIds.push(row._id);
  }
  for (const row of [...input.rows].sort((a, b) => a.order - b.order)) {
    const normalizedName = row.name.trim() || "Submilestone";
    const existingRow = existingByKey.get(row.key);
    if (existingRow) {
      await ctx.db.patch(existingRow._id, {
        budgetCents: row.budgetCents,
        durationDays: row.durationDays,
        key: row.key,
        name: normalizedName,
        order: Math.max(1, Math.round(row.order)),
        planningState: "active",
        startDay: row.startDay,
        supersededAt: undefined,
        supersededByPlanningRevision: undefined,
        updatedAt: now,
      });
      const proposalRow = await ctx.db.get(existingRow.proposalSubmilestoneId);
      if (proposalRow) {
        await ctx.db.patch(proposalRow._id, {
          budgetCents: row.budgetCents,
          durationDays: row.durationDays,
          key: row.key,
          name: normalizedName,
          order: Math.max(1, Math.round(row.order)),
          startDay: row.startDay,
          updatedAt: now,
        });
      }
      continue;
    }
    const proposalSubmilestoneId = await ctx.db.insert("proposalSubmilestones", {
      brokerageId: auth.brokerage._id,
      budgetCents: row.budgetCents,
      createdAt: now,
      durationDays: row.durationDays,
      key: row.key,
      milestoneKey: input.milestone.key,
      name: normalizedName,
      order: Math.max(1, Math.round(row.order)),
      organizationId: auth.build.organizationId,
      proposalId: auth.proposal._id,
      proposalMilestoneId: input.milestone.proposalMilestoneId,
      startDay: row.startDay,
      updatedAt: now,
    });
    const buildSubmilestoneId = await ctx.db.insert("buildSubmilestones", {
      brokerageId: auth.brokerage._id,
      buildId: input.buildId,
      buildMilestoneId: input.milestone._id,
      budgetCents: row.budgetCents,
      createdAt: now,
      durationDays: row.durationDays,
      key: row.key,
      milestoneKey: input.milestone.key,
      name: normalizedName,
      order: Math.max(1, Math.round(row.order)),
      organizationId: auth.build.organizationId,
      proposalSubmilestoneId,
      planningState: "active",
      startDay: row.startDay,
      status: "planned",
      updatedAt: now,
    });
    await upsertSubmilestoneScopeV1Draft(ctx, {
      authoredByWorkosUserId: auth.subject,
      brokerageId: auth.brokerage._id,
      now,
      organizationId: auth.build.organizationId,
      proposalId: auth.proposal._id,
      proposalSubmilestoneId,
      scopeOfWorkTiptapJson: EMPTY_CANONICAL_TIPTAP_DOCUMENT,
    });
    await upsertProposalSubmilestoneFieldGuidance(ctx, {
      auth,
      fieldGuidance: {
        cameraAnglesTiptapJson: EMPTY_CANONICAL_TIPTAP_DOCUMENT,
        whatToVerifyTiptapJson: EMPTY_CANONICAL_TIPTAP_DOCUMENT,
      },
      now,
      proposalId: auth.proposal._id,
      proposalSubmilestoneId,
      workosOrganizationId: auth.build.organizationId,
    });
    await attachSubmilestoneScopeBuildLineage(ctx, {
      brokerageId: auth.brokerage._id,
      buildId: input.buildId,
      buildSubmilestoneId,
      organizationId: auth.build.organizationId,
      proposalId: auth.proposal._id,
      proposalSubmilestoneId,
    });
    await attachSubmilestoneFieldGuidanceBuildLineage(ctx, {
      brokerageId: auth.brokerage._id,
      buildId: input.buildId,
      buildSubmilestoneId,
      organizationId: auth.build.organizationId,
      proposalId: auth.proposal._id,
      proposalSubmilestoneId,
    });
  }
  return { supersededIds };
}

async function deleteActiveBuildStorageRow(
  ctx: MutationCtx,
  row: {
    _id: Id<"buildDocuments"> | Id<"buildEvidenceAssets">;
    storageId?: Id<"_storage">;
  },
) {
  if (row.storageId) {
    await ctx.storage.delete(row.storageId);
  }
  await ctx.db.delete(row._id);
}

export async function latestActiveBuildPlanningRevision(
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">,
) {
  return await ctx.db
    .query("activeBuildPlanningRevisions")
    .withIndex("by_build_revision", (query) => query.eq("buildId", buildId))
    .order("desc")
    .take(1)
    .then((rows) => rows[0]);
}

export async function deleteActiveBuildCascade(
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">,
) {
  const milestones = await collectByIndex(
    ctx,
    "buildMilestones",
    "by_build",
    buildId,
  );
  for (const milestone of milestones) {
    await supersedeActiveBuildMilestoneCascade(ctx, buildId, milestone);
  }

  const documents = await collectByIndex(
    ctx,
    "buildDocuments",
    "by_build",
    buildId,
  );
  for (const document of documents) {
    await deleteActiveBuildStorageRow(ctx, document);
  }

  const evidenceAssets = await collectByIndex(
    ctx,
    "buildEvidenceAssets",
    "by_build",
    buildId,
  );
  for (const asset of evidenceAssets) {
    await deleteActiveBuildStorageRow(ctx, asset);
  }

  for (const table of [
    "milestoneContractorAssignments",
    "contractorQualityRatings",
    "buildContractorAssignments",
    "buildBrokerAssignments",
    "activeBuildFacilityChangeRequests",
    "loanFacilities",
    "buildCapitalPlans",
    "buildMilestones",
    "plannedDrawScheduleRows",
    "buildCostItems",
    "buildSubmilestones",
    "buildSiteVisits",
    "capitalEvents",
    "buildNotes",
    "calendarTargetDates",
    "scheduleRevisionRecords",
  ] as const) {
    const rows = await collectByIndex(ctx, table, "by_build", buildId);
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  }

  await ctx.db.delete(buildId);
}
