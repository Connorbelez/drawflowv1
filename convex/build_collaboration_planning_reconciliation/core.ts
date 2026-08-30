import { internal } from "../_generated/api";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

/**
 * ENG-412 planning is an immutable audit/projection layer. The active Build
 * rows remain the only command authority; revision entities are rebuildable
 * snapshots and revision diffs are append-only facts.
 */

export type PlanningActor = {
  actorRoles: readonly string[];
  actorWorkosUserId: string;
};

export type PlanningEntity = {
  entityKey: string;
  entityType: string;
  planningState: "active" | "superseded";
  canonicalId?: string;
  snapshot: Record<string, unknown>;
};

export type PlanningSnapshot = {
  buildId: string;
  budgets: PlanningEntity[];
  milestones: PlanningEntity[];
  submilestones: PlanningEntity[];
  draws: PlanningEntity[];
  allocations: PlanningEntity[];
  evidenceRequirements: PlanningEntity[];
};

export function emptyPlanningSnapshot(buildId: string): PlanningSnapshot {
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

export const PLANNING_SNAPSHOT_LIMITS = {
  allocations: 2_000,
  capitalPlans: 100,
  draws: 1_000,
  milestones: 1_000,
  requirements: 5_000,
  submilestones: 2_000,
} as const;
export const PLANNING_REVISION_ENTITY_LIMIT = Object.values(
  PLANNING_SNAPSHOT_LIMITS
).reduce((total, limit) => total + limit, 0);

export const PLANNING_REVISION_DIFF_LIMIT = 10_000;
export const PLANNING_REVISION_MATERIALIZATION_BATCH_SIZE = 250;
export const PLANNING_REVISION_READ_LIMIT = 100;
export const PLANNING_REVISION_CHUNK_LIMIT = 100;
export const PLANNING_MATERIALIZATION_RECOVERY_BATCH_SIZE = 25;
export const PLANNING_MATERIALIZATION_RECOVERY_MAX_ATTEMPTS = 5;
export const PLANNING_MATERIALIZATION_RECOVERY_DELAY_MS = 5 * 60 * 1000;
export const PLANNING_RECONCILIATION_PAGE_SIZE = 100;

export type PlanningMaterializationRecoveryCursor = {
  cursor: string | null;
  phase: "pending" | "legacy";
};

export function encodePlanningMaterializationRecoveryCursor(
  cursor: PlanningMaterializationRecoveryCursor,
) {
  return encodeURIComponent(JSON.stringify(cursor));
}

export function decodePlanningMaterializationRecoveryCursor(
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

export function boundedPlanningPagination(input: {
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

export function planningPageOffset(cursor: string | null) {
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

export function encodePlanningPageCursor(offset: number) {
  return encodeURIComponent(JSON.stringify({ offset }));
}

export type TakeablePlanningQuery<T> = {
  take: (n: number) => Promise<T[]>;
};

export type PlanningRowsPage<T> = {
  isDone: boolean;
  rows: T[];
};

/**
 * Bounded multi-table planning reads must use `.take()`, not `.paginate()`.
 * Convex allows only one paginated query per function, and snapshot/diff
 * loaders fan out across several tables in a single query or mutation.
 * Callers that need truncation detection request `limit + 1`.
 */
export async function readPlanningRows<T>(
  query: TakeablePlanningQuery<T>,
  maxRows: number
): Promise<PlanningRowsPage<T>> {
  const rows = await query.take(maxRows);
  return {
    isDone: rows.length < maxRows,
    rows,
  };
}

export async function nextActiveBuildPlanningRevisionChunk(
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

export async function scheduleActiveBuildPlanningRevisionMaterialization(
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

export function assertWithinPlanningSnapshotLimit(
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

export function chunkPlanningRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += size) {
    chunks.push(rows.slice(offset, offset + size));
  }
  return chunks;
}

export function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function stableEntity(
  entityType: string,
  entityKey: string,
  canonicalId: string | undefined,
  planningState: "active" | "superseded",
  snapshot: Record<string, unknown>
): PlanningEntity {
  return { canonicalId, entityKey, entityType, planningState, snapshot };
}

export function canonicalMilestoneSnapshot(milestone: Doc<"buildMilestones">) {
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

export function canonicalSubmilestoneSnapshot(
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

export function canonicalDrawSnapshot(draw: Doc<"plannedDrawScheduleRows">) {
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

export function drawPlanningState(
  draw: Doc<"plannedDrawScheduleRows">,
): PlanningEntity["planningState"] {
  return draw.status === "rejected" ||
    draw.status === "withdrawn" ||
    draw.status === "cancelled"
    ? "superseded"
    : "active";
}

export function canonicalBudgetSnapshot(plan: Doc<"buildCapitalPlans">) {
  return jsonValue({
    borrowerCoPayBps: plan.borrowerCoPayBps,
    borrowerStartingCashCents: plan.borrowerStartingCashCents,
    borrowerWorkingCapitalLimitCents: plan.borrowerWorkingCapitalLimitCents,
    lenderDrawPolicyLimitCents: plan.lenderDrawPolicyLimitCents,
    source: plan.source,
    version: plan.version,
  });
}

export function canonicalAllocationSnapshot(
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

export function canonicalEvidenceRequirementSnapshot(
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

export function allocationKey(allocation: Doc<"milestoneContractorAssignments">) {
  return [
    allocation.milestoneKey,
    allocation.submilestoneKey ?? "parent",
    String(allocation.contractorId),
    allocation.role,
  ].join(":");
}

export async function collectPlanningSnapshot(
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
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build", (query) => query.eq("buildId", build._id)),
      PLANNING_SNAPSHOT_LIMITS.milestones + 1
    ),
    readPlanningRows(
      ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (query) => query.eq("buildId", build._id)),
      PLANNING_SNAPSHOT_LIMITS.submilestones + 1
    ),
    readPlanningRows(
      ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build", (query) => query.eq("buildId", build._id)),
      PLANNING_SNAPSHOT_LIMITS.draws + 1
    ),
    readPlanningRows(
      ctx.db
        .query("milestoneContractorAssignments")
        .withIndex("by_build", (query) => query.eq("buildId", build._id)),
      PLANNING_SNAPSHOT_LIMITS.allocations + 1
    ),
    readPlanningRows(
      ctx.db
        .query("buildCapitalPlans")
        .withIndex("by_build", (query) => query.eq("buildId", build._id)),
      PLANNING_SNAPSHOT_LIMITS.capitalPlans + 1
    ),
    readPlanningRows(
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

export function flattenSnapshot(snapshot: PlanningSnapshot) {
  return [
    ...snapshot.milestones,
    ...snapshot.budgets,
    ...snapshot.submilestones,
    ...snapshot.draws,
    ...snapshot.allocations,
    ...snapshot.evidenceRequirements,
  ];
}

export function categoryFor(entityType: string, field: string) {
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

export type PlanningDiff = {
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

export function planningDiff(
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

export async function latestPlanningRevision(
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

export async function readRevisionSnapshot(
  ctx: QueryCtx | MutationCtx,
  revisionId: Id<"activeBuildPlanningRevisions">,
  buildId: Id<"activeBuilds">,
  options?: { allowPendingMaterialization?: boolean }
): Promise<PlanningSnapshot> {
  const pendingChunkPage = await readPlanningRows(
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

export async function readRevisionDiffs(
  ctx: QueryCtx | MutationCtx,
  revision: Doc<"activeBuildPlanningRevisions">,
  limit: number
) {
  if (limit <= 0) return { rows: [], truncated: revision.diffCount > 0 };
  const persistedPage = await readPlanningRows(
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

export function snapshotEntitySummary(snapshot: PlanningSnapshot) {
  return [
    `${snapshot.milestones.length} milestone(s)`,
    `${snapshot.budgets.length} budget(s)`,
    `${snapshot.submilestones.length} sub-milestone(s)`,
    `${snapshot.draws.length} draw(s)`,
  ].join(" · ");
}
