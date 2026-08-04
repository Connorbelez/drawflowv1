import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authorizeActiveBuildAccess } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  ensureMilestoneSystemPost,
  synchronizeMilestoneSystemPostPlanning,
} from "./build_collaboration_system_posts";
import {
  buildPlanningActivationSnapshotPageValidator,
  buildPlanningReconciliationDiffPageValidator,
  buildPlanningReconciliationMetadataValidator,
  buildPlanningReconciliationSnapshotPageValidator,
} from "./build_collaboration_validators";
import { internalMutation } from "./fluent";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

/**
 * ENG-412 planning is an immutable audit/projection layer. The active Build
 * rows remain the only command authority; revision entities are rebuildable
 * snapshots and revision diffs are append-only facts.
 */

type PlanningActor = {
  actorRoles: readonly string[];
  actorWorkosUserId: string;
};

type PlanningEntity = {
  entityKey: string;
  entityType: string;
  planningState: "active" | "superseded";
  canonicalId?: string;
  snapshot: Record<string, unknown>;
};

type PlanningSnapshot = {
  buildId: string;
  budgets: PlanningEntity[];
  milestones: PlanningEntity[];
  submilestones: PlanningEntity[];
  draws: PlanningEntity[];
  allocations: PlanningEntity[];
  evidenceRequirements: PlanningEntity[];
};

function emptyPlanningSnapshot(buildId: string): PlanningSnapshot {
  return {
    buildId,
    allocations: [],
    budgets: [],
    draws: [],
    evidenceRequirements: [],
    milestones: [],
    submilestones: [],
  };
}

const PLANNING_SNAPSHOT_LIMITS = {
  allocations: 2_000,
  capitalPlans: 100,
  draws: 1_000,
  milestones: 1_000,
  requirements: 5_000,
  submilestones: 2_000,
} as const;
const PLANNING_REVISION_ENTITY_LIMIT = Object.values(
  PLANNING_SNAPSHOT_LIMITS
).reduce((total, limit) => total + limit, 0);

const PLANNING_REVISION_DIFF_LIMIT = 10_000;
const PLANNING_REVISION_MATERIALIZATION_BATCH_SIZE = 250;
const PLANNING_READ_PAGE_SIZE = 100;
const PLANNING_REVISION_READ_LIMIT = 100;
const PLANNING_REVISION_CHUNK_LIMIT = 100;
const PLANNING_MATERIALIZATION_RECOVERY_BATCH_SIZE = 25;
const PLANNING_MATERIALIZATION_RECOVERY_MAX_ATTEMPTS = 5;
const PLANNING_MATERIALIZATION_RECOVERY_DELAY_MS = 5 * 60 * 1000;
const PLANNING_RECONCILIATION_PAGE_SIZE = 100;

type PlanningMaterializationRecoveryCursor = {
  cursor: string | null;
  phase: "pending" | "legacy";
};

function encodePlanningMaterializationRecoveryCursor(
  cursor: PlanningMaterializationRecoveryCursor,
) {
  return encodeURIComponent(JSON.stringify(cursor));
}

function decodePlanningMaterializationRecoveryCursor(
  cursor: string | null | undefined,
): PlanningMaterializationRecoveryCursor {
  if (!cursor) return { cursor: null, phase: "pending" };
  try {
    const decoded = JSON.parse(decodeURIComponent(cursor)) as {
      cursor?: unknown;
      phase?: unknown;
    };
    if (
      (decoded.phase === "pending" || decoded.phase === "legacy") &&
      (decoded.cursor === null || typeof decoded.cursor === "string")
    ) {
      return {
        cursor: decoded.cursor,
        phase: decoded.phase,
      };
    }
  } catch {
    // A cursor from the pre-index recovery implementation has no phase
    // envelope. Treat it as a legacy scan cursor so an in-flight sweep can
    // finish without restarting from the beginning.
  }
  return { cursor, phase: "legacy" };
}

function boundedPlanningPagination(input: {
  cursor: string | null;
  numItems: number;
}) {
  return {
    cursor: input.cursor,
    numItems: Math.min(
      PLANNING_RECONCILIATION_PAGE_SIZE,
      Math.max(1, input.numItems),
    ),
  };
}

function planningPageOffset(cursor: string | null) {
  if (!cursor) return 0;
  try {
    const decoded = JSON.parse(decodeURIComponent(cursor)) as {
      offset?: unknown;
    };
    if (
      decoded &&
      typeof decoded.offset === "number" &&
      Number.isSafeInteger(decoded.offset) &&
      decoded.offset >= 0
    ) {
      return decoded.offset;
    }
  } catch {
    // Cursors are opaque to callers. A malformed cursor safely restarts the
    // bounded projection rather than reading an unbounded range.
  }
  return 0;
}

function encodePlanningPageCursor(offset: number) {
  return encodeURIComponent(JSON.stringify({ offset }));
}

type PaginatedPlanningQuery<T> = {
  paginate: (input: { cursor: string | null; numItems: number }) => Promise<{
    continueCursor: string;
    isDone: boolean;
    page: T[];
  }>;
};
type PaginatedPlanningQueryFactory<T> = () => PaginatedPlanningQuery<T>;

type PlanningRowsPage<T> = {
  isDone: boolean;
  rows: T[];
};

async function readPlanningRows<T>(
  queryFactory: PaginatedPlanningQueryFactory<T>,
  maxRows: number
): Promise<PlanningRowsPage<T>> {
  const rows: T[] = [];
  let cursor: string | null = null;
  let isDone = false;
  while (!isDone && rows.length < maxRows) {
    const result = await queryFactory().paginate({
      cursor,
      numItems: Math.min(PLANNING_READ_PAGE_SIZE, maxRows - rows.length),
    });
    rows.push(...result.page);
    cursor = result.continueCursor;
    isDone = result.isDone;
  }
  return { isDone, rows };
}

async function nextActiveBuildPlanningRevisionChunk(
  ctx: MutationCtx,
  revisionId: Id<"activeBuildPlanningRevisions">,
) {
  const entityChunk = await ctx.db
    .query("activeBuildPlanningRevisionChunks")
    .withIndex("by_revision_and_kind_and_index", (query) =>
      query.eq("revisionId", revisionId).eq("chunkKind", "entities"),
    )
    .order("asc")
    .take(1)
    .then((rows) => rows[0]);
  if (entityChunk) return entityChunk;
  return await ctx.db
    .query("activeBuildPlanningRevisionChunks")
    .withIndex("by_revision_and_kind_and_index", (query) =>
      query.eq("revisionId", revisionId).eq("chunkKind", "diffs"),
    )
    .order("asc")
    .take(1)
    .then((rows) => rows[0]);
}

async function scheduleActiveBuildPlanningRevisionMaterialization(
  ctx: MutationCtx,
  revisionId: Id<"activeBuildPlanningRevisions">,
  scheduledAt = Date.now(),
) {
  await ctx.scheduler.runAfter(
    0,
    internal.build_collaboration_planning_reconciliation
      .materializeActiveBuildPlanningRevisionChunk,
    { revisionId },
  );
  const nextChunk = await nextActiveBuildPlanningRevisionChunk(ctx, revisionId);
  if (nextChunk) {
    await ctx.db.patch(nextChunk._id, {
      materializationLastScheduledAt: scheduledAt,
    });
  }
}

function assertWithinPlanningSnapshotLimit(
  label: string,
  count: number,
  limit: number
) {
  if (count > limit) {
    throw new Error(
      `Active Build planning snapshot exceeds the ${limit} ${label} safety limit.`
    );
  }
}

function chunkPlanningRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += size) {
    chunks.push(rows.slice(offset, offset + size));
  }
  return chunks;
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function stableEntity(
  entityType: string,
  entityKey: string,
  canonicalId: string | undefined,
  planningState: "active" | "superseded",
  snapshot: Record<string, unknown>
): PlanningEntity {
  return { canonicalId, entityKey, entityType, planningState, snapshot };
}

function canonicalMilestoneSnapshot(milestone: Doc<"buildMilestones">) {
  return jsonValue({
    budgetCents: milestone.budgetCents,
    dayEnd: milestone.dayEnd,
    dayStart: milestone.dayStart,
    dependencyKeys: [...milestone.dependencyKeys].sort(),
    drawAvailabilityCents: milestone.drawAvailabilityCents,
    durationDays: milestone.durationDays,
    evidenceState: milestone.evidenceState,
    isDragLocked: milestone.isDragLocked,
    name: milestone.name,
    order: milestone.order,
    planningState: milestone.planningState ?? "active",
    policyState: milestone.policyState,
    siteVisitGuidance: milestone.siteVisitGuidance,
  });
}

function canonicalSubmilestoneSnapshot(
  submilestone: Doc<"buildSubmilestones">
) {
  return jsonValue({
    budgetCents: submilestone.budgetCents,
    durationDays: submilestone.durationDays,
    name: submilestone.name,
    order: submilestone.order,
    planningState: submilestone.planningState ?? "active",
    startDay: submilestone.startDay,
  });
}

function canonicalDrawSnapshot(draw: Doc<"plannedDrawScheduleRows">) {
  return jsonValue({
    amountCents: draw.amountCents,
    buildMilestoneId: draw.buildMilestoneId
      ? String(draw.buildMilestoneId)
      : undefined,
    label: draw.label,
    milestoneKey: draw.milestoneKey,
    order: draw.order,
    status: draw.status,
    timingDay: draw.timingDay,
  });
}

function drawPlanningState(
  draw: Doc<"plannedDrawScheduleRows">,
): PlanningEntity["planningState"] {
  return draw.status === "rejected" ||
    draw.status === "withdrawn" ||
    draw.status === "cancelled"
    ? "superseded"
    : "active";
}

function canonicalBudgetSnapshot(plan: Doc<"buildCapitalPlans">) {
  return jsonValue({
    borrowerCoPayBps: plan.borrowerCoPayBps,
    borrowerStartingCashCents: plan.borrowerStartingCashCents,
    borrowerWorkingCapitalLimitCents: plan.borrowerWorkingCapitalLimitCents,
    lenderDrawPolicyLimitCents: plan.lenderDrawPolicyLimitCents,
    source: plan.source,
    version: plan.version,
  });
}

function canonicalAllocationSnapshot(
  allocation: Doc<"milestoneContractorAssignments">
) {
  return jsonValue({
    agreedRateCents: allocation.agreedRateCents,
    contractorId: String(allocation.contractorId),
    estimatedCostCents: allocation.estimatedCostCents,
    estimatedHours: allocation.estimatedHours,
    milestoneKey: allocation.milestoneKey,
    role: allocation.role,
    status: allocation.status,
    submilestoneKey: allocation.submilestoneKey,
  });
}

function canonicalEvidenceRequirementSnapshot(
  requirement: Doc<"buildSubmilestoneEvidenceRequirements">
) {
  return jsonValue({
    description: requirement.description,
    kind: requirement.kind,
    label: requirement.label,
    locationRequired: requirement.locationRequired,
    required: requirement.required,
    revision: requirement.revision,
  });
}

function allocationKey(allocation: Doc<"milestoneContractorAssignments">) {
  return [
    allocation.milestoneKey,
    allocation.submilestoneKey ?? "parent",
    String(allocation.contractorId),
    allocation.role,
  ].join(":");
}

async function collectPlanningSnapshot(
  ctx: QueryCtx | MutationCtx,
  build: Doc<"activeBuilds">
): Promise<PlanningSnapshot> {
  const [
    milestonePage,
    submilestonePage,
    drawPage,
    allocationPage,
    capitalPlanPage,
    requirementPage,
  ] = await Promise.all([
    readPlanningRows(
      () =>
        ctx.db
          .query("buildMilestones")
          .withIndex("by_build", (query) => query.eq("buildId", build._id)),
      PLANNING_SNAPSHOT_LIMITS.milestones + 1
    ),
    readPlanningRows(
      () =>
        ctx.db
          .query("buildSubmilestones")
          .withIndex("by_build", (query) => query.eq("buildId", build._id)),
      PLANNING_SNAPSHOT_LIMITS.submilestones + 1
    ),
    readPlanningRows(
      () =>
        ctx.db
          .query("plannedDrawScheduleRows")
          .withIndex("by_build", (query) => query.eq("buildId", build._id)),
      PLANNING_SNAPSHOT_LIMITS.draws + 1
    ),
    readPlanningRows(
      () =>
        ctx.db
          .query("milestoneContractorAssignments")
          .withIndex("by_build", (query) => query.eq("buildId", build._id)),
      PLANNING_SNAPSHOT_LIMITS.allocations + 1
    ),
    readPlanningRows(
      () =>
        ctx.db
          .query("buildCapitalPlans")
          .withIndex("by_build", (query) => query.eq("buildId", build._id)),
      PLANNING_SNAPSHOT_LIMITS.capitalPlans + 1
    ),
    readPlanningRows(
      () =>
        ctx.db
          .query("buildSubmilestoneEvidenceRequirements")
          .withIndex("by_build", (query) => query.eq("buildId", build._id)),
      PLANNING_SNAPSHOT_LIMITS.requirements + 1
    ),
  ]);
  const milestones = milestonePage.rows;
  const submilestones = submilestonePage.rows;
  const draws = drawPage.rows;
  const allocations = allocationPage.rows;
  const capitalPlans = capitalPlanPage.rows;
  const requirementRows = requirementPage.rows;

  assertWithinPlanningSnapshotLimit(
    "Milestones",
    milestones.length,
    PLANNING_SNAPSHOT_LIMITS.milestones
  );
  assertWithinPlanningSnapshotLimit(
    "Sub-milestones",
    submilestones.length,
    PLANNING_SNAPSHOT_LIMITS.submilestones
  );
  assertWithinPlanningSnapshotLimit(
    "planned Draws",
    draws.length,
    PLANNING_SNAPSHOT_LIMITS.draws
  );
  assertWithinPlanningSnapshotLimit(
    "contractor allocations",
    allocations.length,
    PLANNING_SNAPSHOT_LIMITS.allocations
  );
  assertWithinPlanningSnapshotLimit(
    "capital plans",
    capitalPlans.length,
    PLANNING_SNAPSHOT_LIMITS.capitalPlans
  );
  assertWithinPlanningSnapshotLimit(
    "evidence requirements",
    requirementRows.length,
    PLANNING_SNAPSHOT_LIMITS.requirements
  );

  const evidenceRequirements: PlanningEntity[] = [];
  const submilestonesById = new Map(
    submilestones.map((submilestone) => [String(submilestone._id), submilestone])
  );
  for (const requirement of requirementRows) {
    const submilestone = submilestonesById.get(
      String(requirement.buildSubmilestoneId)
    );
    if (
      !submilestone ||
      requirement.organizationId !== build.organizationId ||
      requirement.brokerageId !== build.brokerageId ||
      requirement.proposalId !== build.proposalId ||
      requirement.buildMilestoneId !== submilestone.buildMilestoneId
    ) {
      continue;
    }
    evidenceRequirements.push(
      stableEntity(
        "evidenceRequirement",
        `${submilestone.milestoneKey}:${submilestone.key}:${requirement.requirementKey}`,
        String(requirement._id),
        requirement.active ? "active" : "superseded",
        canonicalEvidenceRequirementSnapshot(requirement)
      )
    );
  }

  return {
    buildId: String(build._id),
    allocations: allocations
      .map((allocation) =>
        stableEntity(
          "allocation",
          allocationKey(allocation),
          String(allocation._id),
          allocation.status === "removed" ? "superseded" : "active",
          canonicalAllocationSnapshot(allocation)
        )
      )
      .sort((left, right) => left.entityKey.localeCompare(right.entityKey)),
    budgets: capitalPlans
      .sort((left, right) => right.version - left.version)
      .slice(0, 1)
      .map((plan) =>
        stableEntity(
          "budget",
          "capital-plan",
          String(plan._id),
          "active",
          canonicalBudgetSnapshot(plan)
        )
      ),
    draws: draws
      .map((draw) =>
        stableEntity(
          "draw",
          draw.drawKey,
          String(draw._id),
          drawPlanningState(draw),
          canonicalDrawSnapshot(draw)
        )
      )
      .sort((left, right) => left.entityKey.localeCompare(right.entityKey)),
    evidenceRequirements: evidenceRequirements.sort((left, right) =>
      left.entityKey.localeCompare(right.entityKey)
    ),
    milestones: milestones
      .map((milestone) =>
        stableEntity(
          "milestone",
          milestone.key,
          String(milestone._id),
          milestone.planningState ?? "active",
          canonicalMilestoneSnapshot(milestone)
        )
      )
      .sort((left, right) => left.entityKey.localeCompare(right.entityKey)),
    submilestones: submilestones
      .map((submilestone) =>
        stableEntity(
          "submilestone",
          `${submilestone.milestoneKey}:${submilestone.key}`,
          String(submilestone._id),
          submilestone.planningState ?? "active",
          canonicalSubmilestoneSnapshot(submilestone)
        )
      )
      .sort((left, right) => left.entityKey.localeCompare(right.entityKey)),
  };
}

function flattenSnapshot(snapshot: PlanningSnapshot) {
  return [
    ...snapshot.milestones,
    ...snapshot.budgets,
    ...snapshot.submilestones,
    ...snapshot.draws,
    ...snapshot.allocations,
    ...snapshot.evidenceRequirements,
  ];
}

function categoryFor(entityType: string, field: string) {
  if (entityType === "evidenceRequirement")
    return "evidence_requirements" as const;
  if (entityType === "budget") return "allocations" as const;
  if (entityType === "allocation" || entityType === "draw") {
    return field === "timingDay"
      ? ("dates" as const)
      : ("allocations" as const);
  }
  if (
    field === "dayStart" ||
    field === "dayEnd" ||
    field === "durationDays" ||
    field === "startDay"
  ) {
    return "dates" as const;
  }
  if (field === "dependencyKeys") return "dependencies" as const;
  if (field === "budgetCents" || field === "drawAvailabilityCents") {
    return "allocations" as const;
  }
  return "scope" as const;
}

type PlanningDiff = {
  category:
    | "scope"
    | "dates"
    | "dependencies"
    | "allocations"
    | "evidence_requirements";
  changeType: "added" | "removed" | "changed";
  entityKey: string;
  entityType: string;
  field: string;
  nextValue?: unknown;
  priorValue?: unknown;
};

function planningDiff(
  previous: PlanningSnapshot | undefined,
  current: PlanningSnapshot
): PlanningDiff[] {
  if (!previous) return [];
  const previousByKey = new Map(
    flattenSnapshot(previous).map((entity) => [
      `${entity.entityType}:${entity.entityKey}`,
      entity,
    ])
  );
  const currentByKey = new Map(
    flattenSnapshot(current).map((entity) => [
      `${entity.entityType}:${entity.entityKey}`,
      entity,
    ])
  );
  const diffs: PlanningDiff[] = [];
  for (const [key, entity] of currentByKey) {
    const prior = previousByKey.get(key);
    if (!prior) {
      diffs.push({
        category: categoryFor(entity.entityType, "scope"),
        changeType: "added",
        entityKey: entity.entityKey,
        entityType: entity.entityType,
        field: "entity",
        nextValue: entity.snapshot,
      });
      continue;
    }
    if (prior.planningState !== entity.planningState) {
      diffs.push({
        category: categoryFor(entity.entityType, "planningState"),
        changeType: "changed",
        entityKey: entity.entityKey,
        entityType: entity.entityType,
        field: "planningState",
        nextValue: entity.planningState,
        priorValue: prior.planningState,
      });
    }
    const fields = new Set([
      ...Object.keys(prior.snapshot),
      ...Object.keys(entity.snapshot),
    ]);
    // `planningState` is represented on the flattened entity as a dedicated
    // lifecycle field above. Canonical snapshots also carry it for
    // reconstruction, but comparing it again here would emit a duplicate
    // diff row for the same state transition.
    fields.delete("planningState");
    for (const field of fields) {
      const before = prior.snapshot[field];
      const after = entity.snapshot[field];
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      diffs.push({
        category: categoryFor(entity.entityType, field),
        changeType: "changed",
        entityKey: entity.entityKey,
        entityType: entity.entityType,
        field,
        nextValue: after,
        priorValue: before,
      });
    }
  }
  for (const [key, entity] of previousByKey) {
    if (currentByKey.has(key)) continue;
    diffs.push({
      category: categoryFor(entity.entityType, "scope"),
      changeType: "removed",
      entityKey: entity.entityKey,
      entityType: entity.entityType,
      field: "entity",
      priorValue: entity.snapshot,
    });
  }
  return diffs.sort(
    (left, right) =>
      left.entityType.localeCompare(right.entityType) ||
      left.entityKey.localeCompare(right.entityKey) ||
      left.field.localeCompare(right.field)
  );
}

async function latestPlanningRevision(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">
) {
  return await ctx.db
    .query("activeBuildPlanningRevisions")
    .withIndex("by_build_revision", (query) => query.eq("buildId", buildId))
    .order("desc")
    .take(1)
    .then((rows) => rows[0]);
}

async function readRevisionSnapshot(
  ctx: QueryCtx | MutationCtx,
  revisionId: Id<"activeBuildPlanningRevisions">,
  buildId: Id<"activeBuilds">,
  options?: { allowPendingMaterialization?: boolean }
): Promise<PlanningSnapshot> {
  const pendingChunkPage = await readPlanningRows(
    () =>
      ctx.db
        .query("activeBuildPlanningRevisionChunks")
        .withIndex("by_revision", (query) => query.eq("revisionId", revisionId))
        .order("asc"),
    PLANNING_REVISION_CHUNK_LIMIT + 1,
  );
  const pendingChunks = pendingChunkPage.rows;
  assertWithinPlanningSnapshotLimit(
    "planning revision materialization chunks",
    pendingChunks.length,
    PLANNING_REVISION_CHUNK_LIMIT
  );
  if (
    pendingChunks.length > 0 &&
    options?.allowPendingMaterialization !== true
  ) {
    throw new Error(
      "Active Build planning revision materialization is still pending; retry after the bounded reconciliation completes."
    );
  }
  const entityPage = await readPlanningRows(
    () =>
      ctx.db
        .query("activeBuildPlanningRevisionEntities")
        .withIndex("by_revision", (query) =>
          query.eq("revisionId", revisionId)
        ),
    PLANNING_REVISION_ENTITY_LIMIT + 1
  );
  const entities = entityPage.rows;
  if (!entityPage.isDone) {
    throw new Error(
      "Active Build planning revision entity materialization is incomplete; refusing to reconstruct or diff the stored snapshot."
    );
  }
  assertWithinPlanningSnapshotLimit(
    "planning revision entities",
    entities.length,
    PLANNING_REVISION_ENTITY_LIMIT
  );
  const stagedEntities: PlanningEntity[] = [];
  for (const chunk of pendingChunks) {
    if (chunk.chunkKind !== "entities") continue;
    stagedEntities.push(
      ...(JSON.parse(chunk.payloadJson) as PlanningEntity[])
    );
    if (
      entities.length + stagedEntities.length >
      PLANNING_REVISION_ENTITY_LIMIT
    ) {
      throw new Error(
        "Active Build planning revision exceeds the supported entity safety limit."
      );
    }
  }
  const result = emptyPlanningSnapshot(String(buildId));
  const values: PlanningEntity[] = [
    ...entities.map((entity) => ({
      canonicalId: entity.canonicalId,
      entityKey: entity.entityKey,
      entityType: entity.entityType,
      planningState: entity.planningState,
      snapshot: JSON.parse(entity.snapshotJson) as Record<string, unknown>,
    })),
    ...stagedEntities,
  ];
  for (const value of values) {
    if (value.entityType === "milestone") result.milestones.push(value);
    else if (value.entityType === "submilestone")
      result.submilestones.push(value);
    else if (value.entityType === "draw") result.draws.push(value);
    else if (value.entityType === "budget") result.budgets.push(value);
    else if (value.entityType === "allocation") result.allocations.push(value);
    else if (value.entityType === "evidenceRequirement")
      result.evidenceRequirements.push(value);
    else {
      throw new Error(
        `Active Build planning revision contains an unknown entity type: ${value.entityType}.`
      );
    }
  }
  return result;
}

async function readRevisionDiffs(
  ctx: QueryCtx | MutationCtx,
  revision: Doc<"activeBuildPlanningRevisions">,
  limit: number
) {
  if (limit <= 0) return { rows: [], truncated: revision.diffCount > 0 };
  const persistedPage = await readPlanningRows(
    () =>
      ctx.db
        .query("activeBuildPlanningRevisionDiffs")
        .withIndex("by_revision", (query) =>
          query.eq("revisionId", revision._id)
        ),
    limit + 1
  );
  const persisted = persistedPage.rows;
  if (persisted.length > limit) {
    return { rows: persisted.slice(0, limit), truncated: true };
  }
  const pendingChunkPage = await readPlanningRows(
    () =>
      ctx.db
        .query("activeBuildPlanningRevisionChunks")
        .withIndex("by_revision", (query) =>
          query.eq("revisionId", revision._id)
        )
        .order("asc"),
    PLANNING_REVISION_CHUNK_LIMIT + 1
  );
  const pendingChunks = pendingChunkPage.rows;
  assertWithinPlanningSnapshotLimit(
    "planning revision materialization chunks",
    pendingChunks.length,
    PLANNING_REVISION_CHUNK_LIMIT
  );
  const staged: PlanningDiff[] = [];
  let stagedTruncated = false;
  for (const chunk of pendingChunks) {
    if (chunk.chunkKind !== "diffs") continue;
    const chunkRows = JSON.parse(chunk.payloadJson) as PlanningDiff[];
    const remaining = limit - persisted.length - staged.length;
    if (chunkRows.length > remaining) {
      staged.push(...chunkRows.slice(0, remaining + 1));
      stagedTruncated = true;
      break;
    }
    staged.push(...chunkRows);
  }
  const rows = [
    ...persisted,
    ...staged.map((diff) => ({ ...diff, revision: revision.revision })),
  ];
  return {
    rows: rows.slice(0, limit),
    truncated:
      !persistedPage.isDone ||
      !pendingChunkPage.isDone ||
      stagedTruncated ||
      rows.length > limit,
  };
}

function snapshotEntitySummary(snapshot: PlanningSnapshot) {
  return [
    `${snapshot.milestones.length} milestone(s)`,
    `${snapshot.budgets.length} budget(s)`,
    `${snapshot.submilestones.length} sub-milestone(s)`,
    `${snapshot.draws.length} draw(s)`,
  ].join(" · ");
}

export async function ensureActiveBuildPlanningActivationRevision(
  ctx: MutationCtx,
  input: {
    actor: PlanningActor;
    build: Doc<"activeBuilds">;
    now?: number;
  }
) {
  const existing = await ctx.db
    .query("activeBuildPlanningRevisions")
    .withIndex("by_build_kind", (query) =>
      query.eq("buildId", input.build._id).eq("kind", "activation")
    )
    .take(1);
  if (existing[0]) return existing[0];
  return await recordApprovedActiveBuildPlanningRevision(ctx, {
    actor: input.actor,
    build: input.build,
    kind: "activation",
    reason: "Activation snapshot captured from the approved Build plan.",
    sourceCommand: "activateActiveBuildPlanning",
    now: input.now,
  });
}

export async function recordApprovedActiveBuildPlanningRevision(
  ctx: MutationCtx,
  input: {
    actor: PlanningActor;
    build: Doc<"activeBuilds">;
    kind?: "activation" | "approved";
    reason: string;
    sourceCommand: string;
    now?: number;
  }
) {
  const now = input.now ?? Date.now();
  const current = await collectPlanningSnapshot(ctx, input.build);
  const priorRevision = await latestPlanningRevision(ctx, input.build._id);
  const previous = priorRevision
    ? await readRevisionSnapshot(ctx, priorRevision._id, input.build._id, {
        allowPendingMaterialization: true,
      })
    : undefined;
  const kind = input.kind ?? "approved";
  if (kind === "approved" && priorRevision) {
    const diffs = planningDiff(previous, current);
    if (diffs.length === 0) return priorRevision;
  }
  const revision = (priorRevision?.revision ?? 0) + 1;
  const diffs = kind === "activation" ? [] : planningDiff(previous, current);
  // Build all bounded materialization payloads before creating the revision
  // row.  If a diff safety limit is exceeded, the mutation fails without
  // leaving a partially persisted revision or transient chunks behind.
  if (diffs.length > PLANNING_REVISION_DIFF_LIMIT) {
    throw new Error(
      `Active Build planning revision exceeds the ${PLANNING_REVISION_DIFF_LIMIT} diff safety limit.`,
    );
  }
  const entityChunks = chunkPlanningRows(
    flattenSnapshot(current),
    PLANNING_REVISION_MATERIALIZATION_BATCH_SIZE
  );
  const diffChunks = chunkPlanningRows(
    diffs,
    PLANNING_REVISION_MATERIALIZATION_BATCH_SIZE
  );
  if (diffChunks.length > PLANNING_REVISION_CHUNK_LIMIT) {
    throw new Error(
      `Active Build planning revision exceeds the ${PLANNING_REVISION_CHUNK_LIMIT} materialization chunk safety limit.`,
    );
  }
  const revisionId = await ctx.db.insert("activeBuildPlanningRevisions", {
    actorRoles: [...input.actor.actorRoles],
    actorWorkosUserId: input.actor.actorWorkosUserId,
    approvedAt: now,
    brokerageId: input.build.brokerageId,
    buildId: input.build._id,
    createdAt: now,
    diffCount: diffs.length,
    kind,
    organizationId: input.build.organizationId,
    previousRevision: priorRevision?.revision,
    reason: input.reason.trim() || "Approved planning revision.",
    revision,
    sourceCommand: input.sourceCommand,
    summary: snapshotEntitySummary(current),
  });
  for (const [chunkIndex, entities] of entityChunks.entries()) {
    await ctx.db.insert("activeBuildPlanningRevisionChunks", {
      brokerageId: input.build.brokerageId,
      buildId: input.build._id,
      chunkIndex,
      chunkKind: "entities",
      createdAt: now,
      organizationId: input.build.organizationId,
      payloadJson: JSON.stringify(entities),
      revision,
      revisionId,
      materializationRecoveryState: "pending",
    });
  }
  for (const [chunkIndex, diffChunk] of diffChunks.entries()) {
    await ctx.db.insert("activeBuildPlanningRevisionChunks", {
      brokerageId: input.build.brokerageId,
      buildId: input.build._id,
      chunkIndex,
      chunkKind: "diffs",
      createdAt: now,
      organizationId: input.build.organizationId,
      payloadJson: JSON.stringify(diffChunk),
      revision,
      revisionId,
      materializationRecoveryState: "pending",
    });
  }
  await ctx.db.insert("auditEvents", {
    actorRoles: [...input.actor.actorRoles],
    actorWorkosUserId: input.actor.actorWorkosUserId,
    brokerageId: input.build.brokerageId,
    command: input.sourceCommand,
    createdAt: now,
    entityId: String(revisionId),
    entityType: "activeBuildPlanningRevision",
    eventType:
      kind === "activation"
        ? "active_build.planning.activated"
        : "active_build.planning.revised",
    newState: JSON.stringify({
      buildId: String(input.build._id),
      diffCount: diffs.length,
      revision,
      summary: snapshotEntitySummary(current),
    }),
    organizationId: input.build.organizationId,
    priorState: priorRevision
      ? JSON.stringify({ revision: priorRevision.revision })
      : undefined,
    reason: input.reason.trim() || "Approved planning revision.",
    warnings: [],
  });
  if (entityChunks.length > 0 || diffChunks.length > 0) {
    await scheduleActiveBuildPlanningRevisionMaterialization(ctx, revisionId, now);
  }
  return await ctx.db.get(revisionId);
}

/**
 * Materialize one transient planning chunk in a bounded mutation. The chunk
 * is deleted in the same transaction as its canonical projection rows, so a
 * retry is idempotent and readers can fail closed while any chunk remains.
 */
export const materializeActiveBuildPlanningRevisionChunk = internalMutation
  .input({ revisionId: v.id("activeBuildPlanningRevisions") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const revision = await ctx.db.get(args.revisionId);
    if (!revision) return null;

    const chunk = await nextActiveBuildPlanningRevisionChunk(ctx, args.revisionId);
    if (!chunk) return null;
    if (chunk.materializationRecoveryState === "exhausted") return null;
    if (
      chunk.buildId !== revision.buildId ||
      chunk.brokerageId !== revision.brokerageId ||
      chunk.organizationId !== revision.organizationId ||
      chunk.revision !== revision.revision
    ) {
      throw new Error(
        "Active Build planning revision materialization chunk scope is invalid."
      );
    }

    if (chunk.chunkKind === "entities") {
      const entities = JSON.parse(chunk.payloadJson) as PlanningEntity[];
      if (entities.length > PLANNING_REVISION_MATERIALIZATION_BATCH_SIZE) {
        throw new Error(
          "Active Build planning revision entity chunk exceeds its bounded batch size."
        );
      }
      for (const entity of entities) {
        await ctx.db.insert("activeBuildPlanningRevisionEntities", {
          brokerageId: revision.brokerageId,
          buildId: revision.buildId,
          ...(entity.canonicalId === undefined
            ? {}
            : { canonicalId: entity.canonicalId }),
          createdAt: revision.createdAt,
          entityKey: entity.entityKey,
          entityType: entity.entityType,
          organizationId: revision.organizationId,
          planningState: entity.planningState,
          revision: revision.revision,
          revisionId: revision._id,
          snapshotJson: JSON.stringify(entity.snapshot),
        });
      }
    } else {
      const diffs = JSON.parse(chunk.payloadJson) as PlanningDiff[];
      if (diffs.length > PLANNING_REVISION_MATERIALIZATION_BATCH_SIZE) {
        throw new Error(
          "Active Build planning revision diff chunk exceeds its bounded batch size."
        );
      }
      for (const diff of diffs) {
        await ctx.db.insert("activeBuildPlanningRevisionDiffs", {
          brokerageId: revision.brokerageId,
          buildId: revision.buildId,
          category: diff.category,
          changeType: diff.changeType,
          createdAt: revision.createdAt,
          entityKey: diff.entityKey,
          entityType: diff.entityType,
          field: diff.field,
          ...(diff.nextValue === undefined ? {} : { nextValue: diff.nextValue }),
          organizationId: revision.organizationId,
          ...(diff.priorValue === undefined
            ? {}
            : { priorValue: diff.priorValue }),
          revision: revision.revision,
          revisionId: revision._id,
        });
      }
    }

    await ctx.db.delete(chunk._id);
    const remaining = await ctx.db
      .query("activeBuildPlanningRevisionChunks")
      .withIndex("by_revision", (query) => query.eq("revisionId", revision._id))
      .take(1);
    if (remaining.length > 0) {
      await scheduleActiveBuildPlanningRevisionMaterialization(
        ctx,
        revision._id,
        Date.now(),
      );
    }
    return null;
  })
  .internal();

async function emitPlanningMaterializationRecoveryExhausted(
  ctx: MutationCtx,
  revision: Doc<"activeBuildPlanningRevisions">,
  residualChunkCount: number,
  now: number,
) {
  const reconciliationKey = [
    "active-build-planning-materialization",
    revision._id,
    "exhausted",
  ].join(":");
  const existing = await ctx.db
    .query("auditEvents")
    .withIndex("by_organizationId_and_reconciliationKey", (query) =>
      query
        .eq("organizationId", revision.organizationId)
        .eq("reconciliationKey", reconciliationKey),
    )
    .first();
  if (existing) return;

  const newState = JSON.stringify({
    buildId: revision.buildId,
    maxRecoveryAttempts: PLANNING_MATERIALIZATION_RECOVERY_MAX_ATTEMPTS,
    residualChunkCount,
    revision: revision.revision,
    revisionId: revision._id,
    state: "recovery_exhausted",
  });
  const reason =
    "Active Build planning revision materialization retained residual chunks after the bounded scheduler recovery budget was exhausted.";
  const warnings = [
    "planning_materialization_recovery_exhausted",
    "canonical_planning_revision_requires_operator_repair",
  ];
  await Promise.all([
    ctx.db.insert("auditEvents", {
      actorRoles: ["system"],
      actorWorkosUserId: "system:build-collaboration-planning-recovery",
      brokerageId: revision.brokerageId,
      command: "recoverActiveBuildPlanningRevisionMaterialization",
      createdAt: now,
      entityId: String(revision._id),
      entityType: "activeBuildPlanningRevision",
      eventType: "active_build.planning.materialization_recovery_exhausted",
      newState,
      organizationId: revision.organizationId,
      reason,
      reconciliationKey,
      warnings,
    }),
    ctx.db.insert("eventOutbox", {
      brokerageId: revision.brokerageId,
      createdAt: now,
      eventType: "active_build.planning.materialization_recovery_exhausted",
      organizationId: revision.organizationId,
      payloadPreview: JSON.stringify({
        buildId: revision.buildId,
        reconciliationKey,
        residualChunkCount,
        revision: revision.revision,
        revisionId: revision._id,
      }),
      relatedEntityId: String(revision._id),
      relatedEntityType: "activeBuildPlanningRevision",
      status: "pending",
    }),
  ]);
}

async function exhaustPlanningMaterializationRecovery(
  ctx: MutationCtx,
  revision: Doc<"activeBuildPlanningRevisions">,
  now: number,
) {
  const residualChunks = await ctx.db
    .query("activeBuildPlanningRevisionChunks")
    .withIndex("by_revision", (query) => query.eq("revisionId", revision._id))
    .take(PLANNING_REVISION_CHUNK_LIMIT + 1);
  assertWithinPlanningSnapshotLimit(
    "planning revision materialization chunks",
    residualChunks.length,
    PLANNING_REVISION_CHUNK_LIMIT,
  );
  for (const chunk of residualChunks) {
    await ctx.db.patch(chunk._id, {
      materializationRecoveryExhaustedAt:
        chunk.materializationRecoveryExhaustedAt ?? now,
      materializationRecoveryState: "exhausted",
    });
  }
  await emitPlanningMaterializationRecoveryExhausted(
    ctx,
    revision,
    residualChunks.length,
    now,
  );
}

async function processPlanningMaterializationRecoveryPage(
  ctx: MutationCtx,
  chunks: Doc<"activeBuildPlanningRevisionChunks">[],
  asOf: number,
) {
  const revisionIds = new Set(chunks.map((chunk) => String(chunk.revisionId)));
  for (const revisionIdString of revisionIds) {
    const revisionId = ctx.db.normalizeId(
      "activeBuildPlanningRevisions",
      revisionIdString,
    );
    if (!revisionId) continue;
    const nextChunk = await nextActiveBuildPlanningRevisionChunk(
      ctx,
      revisionId,
    );
    // Only the first chunk in the canonical entity-then-diff order may be
    // retried. The materializer schedules its own continuation after each
    // successful deletion, so this keeps a single in-flight retry per
    // revision even when a global recovery page splits its chunks.
    if (!nextChunk || !chunks.some((chunk) => chunk._id === nextChunk._id)) {
      continue;
    }
    if (nextChunk.materializationRecoveryState === "exhausted") continue;
    const lastScheduledAt = nextChunk.materializationLastScheduledAt;
    if (
      lastScheduledAt !== undefined &&
      asOf - lastScheduledAt < PLANNING_MATERIALIZATION_RECOVERY_DELAY_MS
    ) {
      continue;
    }
    const attempts = nextChunk.materializationRecoveryAttemptCount ?? 0;
    const revision = await ctx.db.get(revisionId);
    if (!revision) continue;
    if (attempts >= PLANNING_MATERIALIZATION_RECOVERY_MAX_ATTEMPTS) {
      await exhaustPlanningMaterializationRecovery(ctx, revision, asOf);
      continue;
    }
    await ctx.db.patch(nextChunk._id, {
      materializationRecoveryAttemptCount: attempts + 1,
      materializationRecoveryState: "pending",
    });
    await scheduleActiveBuildPlanningRevisionMaterialization(
      ctx,
      revisionId,
      asOf,
    );
  }
}

/**
 * Recover residual planning materialization chunks when a scheduled
 * materializer failed after the creating mutation committed.  This is a
 * bounded reconciliation pass over the existing transient chunk rows, not a
 * second job system: every retry re-enters the canonical materializer and the
 * canonical materializer owns continuation scheduling.
 */
export const recoverActiveBuildPlanningRevisionMaterialization = internalMutation
  .input({
    asOf: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const asOf = args.asOf ?? Date.now();
    const recoveryCursor = decodePlanningMaterializationRecoveryCursor(
      args.cursor,
    );
    const page =
      recoveryCursor.phase === "pending"
        ? await ctx.db
            .query("activeBuildPlanningRevisionChunks")
            .withIndex("by_materialization_recovery_state", (query) =>
              query.eq("materializationRecoveryState", "pending"),
            )
            .order("asc")
            .paginate({
              cursor: recoveryCursor.cursor,
              numItems: PLANNING_MATERIALIZATION_RECOVERY_BATCH_SIZE,
            })
        : await ctx.db
            .query("activeBuildPlanningRevisionChunks")
            // Older chunks predate recovery metadata and therefore cannot be
            // addressed by the state index. This is deliberately a separate,
            // bounded legacy pass; new rows always take the indexed path.
            .order("asc")
            .paginate({
              cursor: recoveryCursor.cursor,
              numItems: PLANNING_MATERIALIZATION_RECOVERY_BATCH_SIZE,
            });
    const candidateChunks =
      recoveryCursor.phase === "legacy"
        ? page.page.filter(
            (chunk) => chunk.materializationRecoveryState === undefined,
          )
        : page.page;
    await processPlanningMaterializationRecoveryPage(
      ctx,
      candidateChunks,
      asOf,
    );

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.build_collaboration_planning_reconciliation
          .recoverActiveBuildPlanningRevisionMaterialization,
        {
          asOf,
          cursor: encodePlanningMaterializationRecoveryCursor({
            cursor: page.continueCursor,
            phase: recoveryCursor.phase,
          }),
        },
      );
    } else if (recoveryCursor.phase === "pending") {
      // Once the indexed pending state is exhausted, make the first bounded
      // legacy pass in this same mutation. This preserves the historical
      // recovery contract for chunks that predate the state metadata; any
      // remaining legacy pages continue through the scheduler.
      const legacyPage = await ctx.db
        .query("activeBuildPlanningRevisionChunks")
        .order("asc")
        .paginate({ cursor: null, numItems: PLANNING_MATERIALIZATION_RECOVERY_BATCH_SIZE });
      await processPlanningMaterializationRecoveryPage(
        ctx,
        legacyPage.page.filter(
          (chunk) => chunk.materializationRecoveryState === undefined,
        ),
        asOf,
      );
      if (!legacyPage.isDone) {
        await ctx.scheduler.runAfter(
          0,
          internal.build_collaboration_planning_reconciliation
            .recoverActiveBuildPlanningRevisionMaterialization,
          {
            asOf,
            cursor: encodePlanningMaterializationRecoveryCursor({
              cursor: legacyPage.continueCursor,
              phase: "legacy",
            }),
          },
        );
      }
    }
    return null;
  })
  .internal();

const CONTRACTOR_FINANCIAL_PLANNING_FIELDS = new Set([
  "budgetCents",
  "drawAvailabilityCents",
]);

function redactContractorPlanningSnapshot(
  snapshot: Record<string, unknown>,
) {
  const redacted = { ...snapshot };
  for (const field of CONTRACTOR_FINANCIAL_PLANNING_FIELDS) {
    delete redacted[field];
  }
  return redacted;
}

function redactContractorPlanningDiff(diff: PlanningDiff) {
  if (diff.entityType !== "milestone" && diff.entityType !== "submilestone") {
    return null;
  }
  if (
    diff.changeType === "changed" &&
    CONTRACTOR_FINANCIAL_PLANNING_FIELDS.has(diff.field)
  ) {
    return null;
  }
  return {
    ...diff,
    ...(diff.changeType === "added" && diff.nextValue !== undefined
      ? {
          nextValue:
            typeof diff.nextValue === "object" && diff.nextValue !== null
              ? redactContractorPlanningSnapshot(
                  diff.nextValue as Record<string, unknown>,
                )
              : diff.nextValue,
        }
      : {}),
    ...(diff.changeType === "removed" && diff.priorValue !== undefined
      ? {
          priorValue:
            typeof diff.priorValue === "object" && diff.priorValue !== null
              ? redactContractorPlanningSnapshot(
                  diff.priorValue as Record<string, unknown>,
                )
              : diff.priorValue,
        }
      : {}),
  };
}

async function redactSnapshotForViewer(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  snapshot: PlanningSnapshot
) {
  if (authorization.effectiveRole.role !== "contractor") {
    return { snapshot };
  }
  const visibleSubmilestoneKeys = new Set<string>();
  const milestonesByKey = new Map(
    snapshot.milestones.map((entity) => [entity.entityKey, entity])
  );
  const contractorProfiles = await ctx.db
    .query("contractorProfiles")
    .withIndex("by_account_user", (query) =>
      query.eq("accountWorkosUserId", authorization.viewer.subject)
    )
    .take(101);
  const authorizedContractors = contractorProfiles.filter(
    (contractor) =>
      contractor.organizationId === authorization.organizationId &&
      contractor.brokerageId === authorization.brokerage._id &&
      contractor.status === "active" &&
      contractor.accountWorkosUserId === authorization.viewer.subject
  );
  if (authorizedContractors.length !== 1) {
    return {
      snapshot: emptyPlanningSnapshot(snapshot.buildId),
      visibleMilestoneKeys: new Set<string>(),
      visibleSubmilestoneKeys: new Set<string>(),
    };
  }
  const authorizedContractor = authorizedContractors[0]!;
  const snapshotAllocationIds = new Set(
    snapshot.allocations
      .map((entity) => entity.canonicalId)
      .filter((canonicalId): canonicalId is string => canonicalId !== undefined)
  );
  const assignmentDocs = await ctx.db
    .query("milestoneContractorAssignments")
    .withIndex("by_contractor_build", (query) =>
      query
        .eq("contractorId", authorizedContractor._id)
        .eq("buildId", authorization.build._id)
    )
    .take(PLANNING_SNAPSHOT_LIMITS.allocations + 1);
  if (assignmentDocs.length > PLANNING_SNAPSHOT_LIMITS.allocations) {
    return {
      snapshot: emptyPlanningSnapshot(snapshot.buildId),
      visibleMilestoneKeys: new Set<string>(),
      visibleSubmilestoneKeys: new Set<string>(),
    };
  }
  const assignmentsBySubmilestoneId = new Map<
    string,
    Doc<"milestoneContractorAssignments">[]
  >();
  for (const assignment of assignmentDocs) {
    if (
      !snapshotAllocationIds.has(String(assignment._id)) ||
      assignment.organizationId !== authorization.organizationId ||
      assignment.brokerageId !== authorization.brokerage._id ||
      assignment.buildId !== authorization.build._id ||
      assignment.contractorId !== authorizedContractor._id ||
      !assignment.buildSubmilestoneId ||
      !(assignment.status === "planned" || assignment.status === "active")
    ) {
      continue;
    }
    const key = String(assignment.buildSubmilestoneId);
    const existing = assignmentsBySubmilestoneId.get(key) ?? [];
    existing.push(assignment);
    assignmentsBySubmilestoneId.set(key, existing);
  }
  const assignmentCandidates = [...assignmentsBySubmilestoneId.entries()]
    .filter(([, assignments]) => assignments.length === 1)
    .map(([submilestoneId, assignments]) => ({
      assignment: assignments[0]!,
      submilestoneId,
    }));
  const ownershipCandidates = await Promise.all(
    assignmentCandidates.map(async ({ assignment, submilestoneId }) => {
      const [rootAssignment, contractor] = await Promise.all([
        ctx.db.get(assignment.buildContractorAssignmentId),
        ctx.db.get(assignment.contractorId),
      ]);
      if (
        !rootAssignment ||
        rootAssignment.organizationId !== authorization.organizationId ||
        rootAssignment.brokerageId !== authorization.brokerage._id ||
        rootAssignment.buildId !== authorization.build._id ||
        rootAssignment.contractorId !== assignment.contractorId ||
        rootAssignment.status !== "active" ||
        !contractor ||
        contractor.organizationId !== authorization.organizationId ||
        contractor.brokerageId !== authorization.brokerage._id ||
        contractor.status !== "active" ||
        !contractor.accountWorkosUserId
      ) {
        return null;
      }
      return {
        submilestoneId,
        workosUserId: contractor.accountWorkosUserId,
      };
    })
  );
  const ownerBySubmilestoneId = new Map(
    ownershipCandidates
      .filter(
        (candidate): candidate is {
          submilestoneId: string;
          workosUserId: string;
        } => candidate !== null
      )
      .map((candidate) => [candidate.submilestoneId, candidate.workosUserId])
  );
  for (const submilestone of snapshot.submilestones) {
    const ownerWorkosUserId = submilestone.canonicalId
      ? ownerBySubmilestoneId.get(submilestone.canonicalId)
      : undefined;
    if (ownerWorkosUserId !== authorization.viewer.subject) continue;
    const assignment = submilestone.canonicalId
      ? assignmentsBySubmilestoneId.get(submilestone.canonicalId)?.[0]
      : undefined;
    const milestone = milestonesByKey.get(
      submilestone.entityKey.split(":")[0] ?? ""
    );
    const milestoneId = milestone?.canonicalId
      ? ctx.db.normalizeId("buildMilestones", milestone.canonicalId)
      : null;
    const submilestoneId = submilestone.canonicalId
      ? ctx.db.normalizeId("buildSubmilestones", submilestone.canonicalId)
      : null;
    if (!(milestoneId && submilestoneId)) continue;
    const [milestoneDoc, submilestoneDoc] = await Promise.all([
      ctx.db.get(milestoneId),
      ctx.db.get(submilestoneId),
    ]);
    if (!(milestoneDoc && submilestoneDoc)) continue;
    // Ownership was resolved from the bounded allocation batch above; these
    // canonical reads only validate that the snapshot IDs still belong to the
    // same Build before exposing the projection.
    if (
      milestoneDoc.buildId === authorization.build._id &&
      milestoneDoc.organizationId === authorization.organizationId &&
      milestoneDoc.brokerageId === authorization.brokerage._id &&
      submilestoneDoc.buildId === authorization.build._id &&
      submilestoneDoc.organizationId === authorization.organizationId &&
      submilestoneDoc.brokerageId === authorization.brokerage._id &&
      submilestoneDoc.buildMilestoneId === milestoneDoc._id &&
      submilestoneDoc.milestoneKey === milestoneDoc.key &&
      assignment?.buildMilestoneId === milestoneDoc._id &&
      assignment.milestoneKey === milestoneDoc.key &&
      assignment.buildSubmilestoneId === submilestoneDoc._id &&
      assignment.submilestoneKey === submilestoneDoc.key
    ) {
      visibleSubmilestoneKeys.add(submilestone.entityKey);
    }
  }
  const visibleMilestoneKeys = new Set(
    [...visibleSubmilestoneKeys].map((key) => key.split(":")[0])
  );
  return {
    snapshot: {
      buildId: snapshot.buildId,
      milestones: snapshot.milestones
        .filter((entity) => visibleMilestoneKeys.has(entity.entityKey))
        .map((entity) => ({
          ...entity,
          snapshot: redactContractorPlanningSnapshot(entity.snapshot),
        })),
      submilestones: snapshot.submilestones
        .filter((entity) => visibleSubmilestoneKeys.has(entity.entityKey))
        .map((entity) => ({
          ...entity,
          snapshot: redactContractorPlanningSnapshot(entity.snapshot),
        })),
      // Financial ownership, Draw allocations, and Evidence requirements are
      // restricted facts and are absent rather than client-hidden.
      allocations: [],
      draws: [],
      evidenceRequirements: [],
      budgets: [],
    } satisfies PlanningSnapshot,
    visibleMilestoneKeys,
    visibleSubmilestoneKeys,
  };
}

function planningRevisionSummary(
  revisions: Doc<"activeBuildPlanningRevisions">[],
  contractorProjection: boolean,
) {
  return revisions.map((revision) =>
    contractorProjection
      ? {
          approvedAt: revision.approvedAt,
          kind: revision.kind,
          revision: revision.revision,
        }
      : {
          actorRoles: revision.actorRoles,
          actorWorkosUserId: revision.actorWorkosUserId,
          approvedAt: revision.approvedAt,
          diffCount: revision.diffCount,
          kind: revision.kind,
          reason: revision.reason,
          revision: revision.revision,
          sourceCommand: revision.sourceCommand,
          summary: revision.summary,
        },
  );
}

function planningActivationSummary(
  revision: Doc<"activeBuildPlanningRevisions"> | undefined,
  contractorProjection: boolean,
) {
  if (!revision) return null;
  return contractorProjection
    ? {
        approvedAt: revision.approvedAt,
        revision: revision.revision,
      }
    : {
        actorRoles: revision.actorRoles,
        actorWorkosUserId: revision.actorWorkosUserId,
        approvedAt: revision.approvedAt,
        revision: revision.revision,
      };
}

async function planningRevisionPage(
  ctx: QueryCtx,
  buildId: Id<"activeBuilds">,
) {
  const page = await readPlanningRows(
    () =>
      ctx.db
        .query("activeBuildPlanningRevisions")
        .withIndex("by_build_revision", (query) => query.eq("buildId", buildId))
        .order("desc"),
    PLANNING_REVISION_READ_LIMIT + 1,
  );
  return {
    isTruncated:
      !page.isDone || page.rows.length > PLANNING_REVISION_READ_LIMIT,
    rows: page.rows.slice(0, PLANNING_REVISION_READ_LIMIT),
  };
}

function pagedPlanningSnapshot(
  snapshot: PlanningSnapshot,
  cursor: string | null,
  numItems: number,
) {
  const rows = flattenSnapshot(snapshot);
  const offset = planningPageOffset(cursor);
  const limit = Math.min(PLANNING_RECONCILIATION_PAGE_SIZE, Math.max(1, numItems));
  const page = rows.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    isDone: nextOffset >= rows.length,
    page,
    continueCursor: encodePlanningPageCursor(nextOffset),
  };
}

export const getActiveBuildPlanningReconciliation = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(buildPlanningReconciliationMetadataValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const [revisionPage, pendingChunks] = await Promise.all([
      planningRevisionPage(ctx, authorization.build._id),
      ctx.db
        .query("activeBuildPlanningRevisionChunks")
        .withIndex("by_build", (query) =>
          query.eq("buildId", authorization.build._id),
        )
        .take(1),
    ]);
    const contractorProjection = authorization.effectiveRole.role === "contractor";
    const activationRevision = revisionPage.rows.find(
      (revision) => revision.kind === "activation",
    );
    const diffsTruncated =
      revisionPage.rows.reduce((total, revision) => total + revision.diffCount, 0) >
      PLANNING_REVISION_DIFF_LIMIT;
    return {
      activation: planningActivationSummary(
        activationRevision,
        contractorProjection,
      ),
      current: { revision: revisionPage.rows[0]?.revision ?? 0 },
      diffsTruncated,
      materializationPending: pendingChunks.length > 0,
      revisionsTruncated: revisionPage.isTruncated,
      revisions: planningRevisionSummary(
        revisionPage.rows,
        contractorProjection,
      ),
    };
  })
  .public();

export const getActiveBuildPlanningReconciliationSnapshot = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  })
  .returns(buildPlanningReconciliationSnapshotPageValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const [currentSnapshot, pendingChunks, revision] = await Promise.all([
      collectPlanningSnapshot(ctx, authorization.build),
      ctx.db
        .query("activeBuildPlanningRevisionChunks")
        .withIndex("by_build", (query) =>
          query.eq("buildId", authorization.build._id),
        )
        .take(1),
      latestPlanningRevision(ctx, authorization.build._id),
    ]);
    const projection = await redactSnapshotForViewer(
      ctx,
      authorization,
      currentSnapshot,
    );
    const page = pagedPlanningSnapshot(
      projection.snapshot,
      args.paginationOpts.cursor,
      boundedPlanningPagination(args.paginationOpts).numItems,
    );
    return {
      buildId: currentSnapshot.buildId,
      isDone: page.isDone,
      materializationPending: pendingChunks.length > 0,
      page: page.page,
      revision: revision?.revision ?? 0,
      continueCursor: page.continueCursor,
    };
  })
  .public();

export const getActiveBuildPlanningActivationSnapshot = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  })
  .returns(buildPlanningActivationSnapshotPageValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const activationRevision = await ctx.db
      .query("activeBuildPlanningRevisions")
      .withIndex("by_build_kind", (query) =>
        query.eq("buildId", authorization.build._id).eq("kind", "activation"),
      )
      .order("desc")
      .take(1)
      .then((rows) => rows[0]);
    if (!activationRevision) {
      return {
        activation: null,
        buildId: String(authorization.build._id),
        isDone: true,
        materializationPending: false,
        page: [],
        continueCursor: encodePlanningPageCursor(0),
      };
    }
    const [snapshot, pendingChunks] = await Promise.all([
      readRevisionSnapshot(
        ctx,
        activationRevision._id,
        authorization.build._id,
        { allowPendingMaterialization: true },
      ),
      ctx.db
        .query("activeBuildPlanningRevisionChunks")
        .withIndex("by_revision", (query) =>
          query.eq("revisionId", activationRevision._id),
        )
        .take(1),
    ]);
    const projection = await redactSnapshotForViewer(
      ctx,
      authorization,
      snapshot,
    );
    const page = pagedPlanningSnapshot(
      projection.snapshot,
      args.paginationOpts.cursor,
      boundedPlanningPagination(args.paginationOpts).numItems,
    );
    return {
      activation: planningActivationSummary(
        activationRevision,
        authorization.effectiveRole.role === "contractor",
      ),
      buildId: snapshot.buildId,
      isDone: page.isDone,
      materializationPending: pendingChunks.length > 0,
      page: page.page,
      continueCursor: page.continueCursor,
    };
  })
  .public();

export const listActiveBuildPlanningReconciliationDiffs = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  })
  .returns(buildPlanningReconciliationDiffPageValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const [revisionPage, pendingChunks] = await Promise.all([
      planningRevisionPage(ctx, authorization.build._id),
      ctx.db
        .query("activeBuildPlanningRevisionChunks")
        .withIndex("by_build", (query) =>
          query.eq("buildId", authorization.build._id),
        )
        .take(1),
    ]);
    const diffs: Array<PlanningDiff & { revision: number }> = [];
    let diffsTruncated = false;
    for (const revision of revisionPage.rows) {
      const remainingDiffLimit = PLANNING_REVISION_DIFF_LIMIT - diffs.length;
      if (remainingDiffLimit <= 0) {
        diffsTruncated ||= revision.diffCount > 0;
        if (diffsTruncated) break;
        continue;
      }
      const result = await readRevisionDiffs(ctx, revision, remainingDiffLimit);
      diffs.push(...result.rows);
      if (result.truncated) {
        diffsTruncated = true;
        break;
      }
    }
    let visibleDiffs = diffs;
    if (authorization.effectiveRole.role === "contractor") {
      const currentProjection = await redactSnapshotForViewer(
        ctx,
        authorization,
        await collectPlanningSnapshot(ctx, authorization.build),
      );
      visibleDiffs = diffs.flatMap((diff) => {
        const redacted = redactContractorPlanningDiff(diff);
        if (!redacted) return [];
        if (
          diff.entityType === "milestone" &&
          !currentProjection.visibleMilestoneKeys?.has(diff.entityKey)
        ) {
          return [];
        }
        if (
          diff.entityType === "submilestone" &&
          !currentProjection.visibleSubmilestoneKeys?.has(diff.entityKey)
        ) {
          return [];
        }
        return [{ ...redacted, revision: diff.revision }];
      });
    }
    const pagination = boundedPlanningPagination(args.paginationOpts);
    const offset = planningPageOffset(pagination.cursor);
    const page = visibleDiffs.slice(offset, offset + pagination.numItems);
    const nextOffset = offset + page.length;
    return {
      diffsTruncated,
      isDone: nextOffset >= visibleDiffs.length,
      materializationPending: pendingChunks.length > 0,
      page: page.map((diff) => ({
        category: diff.category,
        changeType: diff.changeType,
        entityKey: diff.entityKey,
        entityType: diff.entityType,
        field: diff.field,
        nextValue: diff.nextValue,
        priorValue: diff.priorValue,
        revision: diff.revision,
      })),
      revisionsTruncated: revisionPage.isTruncated,
      continueCursor: encodePlanningPageCursor(nextOffset),
    };
  })
  .public();

/**
 * Rebuild only the collaboration projection. This command deliberately does
 * not mutate canonical Milestone, Draw, Evidence, or ownership state.
 */
export const reconcileActiveBuildMilestonePlanning = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    milestoneKey: v.optional(v.string()),
    organizationId: v.string(),
  })
  .returns(
    v.object({
      buildId: v.id("activeBuilds"),
      planningRevision: v.number(),
      postIds: v.array(v.id("buildCollaborationPosts")),
      repairedMilestoneCount: v.number(),
      synchronizedMilestoneCount: v.number(),
    })
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    if (authorization.effectiveRole.tier < 3) {
      throw new Error(
        "Forbidden: planning reconciliation requires an authorized operator."
      );
    }
    await ensureActiveBuildPlanningActivationRevision(ctx, {
      actor: {
        actorRoles: authorization.roles,
        actorWorkosUserId: authorization.viewer.subject,
      },
      build: authorization.build,
    });
    const milestones = await ctx.db
      .query("buildMilestones")
      .withIndex("by_build", (query) =>
        query.eq("buildId", authorization.build._id)
      )
      .take(PLANNING_SNAPSHOT_LIMITS.milestones + 1);
    assertWithinPlanningSnapshotLimit(
      "Milestones",
      milestones.length,
      PLANNING_SNAPSHOT_LIMITS.milestones
    );
    const targets = milestones.filter(
      (milestone) =>
        args.milestoneKey === undefined || milestone.key === args.milestoneKey
    );
    const posts: Id<"buildCollaborationPosts">[] = [];
    let repairedMilestoneCount = 0;
    for (const milestone of targets) {
      let postId = await synchronizeMilestoneSystemPostPlanning(ctx, {
        actor: {
          roles: authorization.roles,
          workosUserId: authorization.viewer.subject,
        },
        build: authorization.build,
        milestone,
      });
      if (!postId && milestone.planningState !== "superseded") {
        const repaired = await ensureMilestoneSystemPost(ctx, {
          actor: {
            roles: authorization.roles,
            workosUserId: authorization.viewer.subject,
          },
          activationReason: "recovery",
          build: authorization.build,
          milestone,
        });
        postId = repaired?.postId ?? null;
        if (postId) repairedMilestoneCount += 1;
      }
      if (postId) posts.push(postId);
    }
    return {
      buildId: authorization.build._id,
      planningRevision:
        (await latestPlanningRevision(ctx, authorization.build._id))
          ?.revision ?? 0,
      postIds: posts,
      repairedMilestoneCount,
      synchronizedMilestoneCount: posts.length,
    };
  })
  .public();
