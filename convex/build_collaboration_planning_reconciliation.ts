import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authorizeActiveBuildAccess } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  ensureMilestoneSystemPost,
  synchronizeMilestoneSystemPostPlanning,
} from "./build_collaboration_system_posts";
import { buildPlanningReconciliationValidator } from "./build_collaboration_validators";
import { internalMutation } from "./fluent";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

/**
 * ENG-412 planning is an immutable audit/projection layer. The active Build
 * rows remain the only command authority; revision entities are rebuildable
 * snapshots and revision diffs are append-only facts.
 */

type PlanningContext = Pick<
  ActiveBuildAuthorization,
  "brokerage" | "build" | "organizationId" | "proposal" | "roles" | "viewer"
>;

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
    milestones,
    submilestones,
    draws,
    allocations,
    capitalPlans,
    requirementRows,
  ] =
    await Promise.all([
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(PLANNING_SNAPSHOT_LIMITS.milestones + 1),
      ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(PLANNING_SNAPSHOT_LIMITS.submilestones + 1),
      ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(PLANNING_SNAPSHOT_LIMITS.draws + 1),
      ctx.db
        .query("milestoneContractorAssignments")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(PLANNING_SNAPSHOT_LIMITS.allocations + 1),
      ctx.db
        .query("buildCapitalPlans")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(PLANNING_SNAPSHOT_LIMITS.capitalPlans + 1),
      ctx.db
        .query("buildSubmilestoneEvidenceRequirements")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(PLANNING_SNAPSHOT_LIMITS.requirements + 1),
    ]);

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
          "active",
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
  const pendingChunks = await ctx.db
    .query("activeBuildPlanningRevisionChunks")
    .withIndex("by_revision", (query) => query.eq("revisionId", revisionId))
    .order("asc")
    .collect();
  if (
    pendingChunks.length > 0 &&
    options?.allowPendingMaterialization !== true
  ) {
    throw new Error(
      "Active Build planning revision materialization is still pending; retry after the bounded reconciliation completes."
    );
  }
  const entities = await ctx.db
    .query("activeBuildPlanningRevisionEntities")
    .withIndex("by_revision", (query) => query.eq("revisionId", revisionId))
    .take(PLANNING_REVISION_ENTITY_LIMIT + 1);
  const stagedEntities = pendingChunks
    .filter((chunk) => chunk.chunkKind === "entities")
    .flatMap((chunk) => JSON.parse(chunk.payloadJson) as PlanningEntity[]);
  if (entities.length + stagedEntities.length > PLANNING_REVISION_ENTITY_LIMIT) {
    throw new Error(
      "Active Build planning revision exceeds the supported entity safety limit."
    );
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
  const persisted = await ctx.db
    .query("activeBuildPlanningRevisionDiffs")
    .withIndex("by_revision", (query) => query.eq("revisionId", revision._id))
    .take(limit + 1);
  const pendingChunks = await ctx.db
    .query("activeBuildPlanningRevisionChunks")
    .withIndex("by_revision", (query) => query.eq("revisionId", revision._id))
    .collect();
  const staged = pendingChunks
    .filter((chunk) => chunk.chunkKind === "diffs")
    .flatMap((chunk) => JSON.parse(chunk.payloadJson) as PlanningDiff[])
    .map((diff) => ({ ...diff, revision: revision.revision }));
  const rows = [...persisted, ...staged];
  if (rows.length > limit) {
    throw new Error(
      "Active Build planning revision diff history exceeds the supported read window."
    );
  }
  return rows;
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
  const entityChunks = chunkPlanningRows(
    flattenSnapshot(current),
    PLANNING_REVISION_MATERIALIZATION_BATCH_SIZE
  );
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
    });
  }
  const diffChunks = chunkPlanningRows(
    diffs,
    PLANNING_REVISION_MATERIALIZATION_BATCH_SIZE
  );
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
    });
  }
  await ctx.db.insert("auditEvents", {
    actorRoles: [...input.actor.actorRoles],
    actorWorkosUserId: input.actor.actorWorkosUserId,
    brokerageId: input.build.brokerageId,
    command: input.sourceCommand,
    createdAt: now,
    entityId: String(input.build._id),
    entityType: "activeBuildPlanningRevision",
    eventType:
      kind === "activation"
        ? "active_build.planning.activated"
        : "active_build.planning.revised",
    newState: JSON.stringify({
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
    await ctx.scheduler.runAfter(
      0,
      internal.build_collaboration_planning_reconciliation
        .materializeActiveBuildPlanningRevisionChunk,
      { revisionId }
    );
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

    let chunk = await ctx.db
      .query("activeBuildPlanningRevisionChunks")
      .withIndex("by_revision_and_kind_and_index", (query) =>
        query.eq("revisionId", args.revisionId).eq("chunkKind", "entities")
      )
      .order("asc")
      .take(1)
      .then((rows) => rows[0]);
    if (!chunk) {
      chunk = await ctx.db
        .query("activeBuildPlanningRevisionChunks")
        .withIndex("by_revision_and_kind_and_index", (query) =>
          query.eq("revisionId", args.revisionId).eq("chunkKind", "diffs")
        )
        .order("asc")
        .take(1)
        .then((rows) => rows[0]);
    }
    if (!chunk) return null;
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
      await ctx.scheduler.runAfter(
        0,
        internal.build_collaboration_planning_reconciliation
          .materializeActiveBuildPlanningRevisionChunk,
        { revisionId: revision._id }
      );
    }
    return null;
  })
  .internal();

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
  const assignmentIds = snapshot.allocations
    .map((entity) =>
      entity.canonicalId
        ? ctx.db.normalizeId("milestoneContractorAssignments", entity.canonicalId)
        : null
    )
    .filter(
      (id): id is Id<"milestoneContractorAssignments"> => id !== null
    );
  const assignmentDocs = await Promise.all(
    assignmentIds.map((assignmentId) => ctx.db.get(assignmentId))
  );
  const assignmentsBySubmilestoneId = new Map<
    string,
    Doc<"milestoneContractorAssignments">[]
  >();
  for (const assignment of assignmentDocs) {
    if (
      !assignment ||
      assignment.organizationId !== authorization.organizationId ||
      assignment.brokerageId !== authorization.brokerage._id ||
      assignment.buildId !== authorization.build._id ||
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
      milestones: snapshot.milestones.filter((entity) =>
        visibleMilestoneKeys.has(entity.entityKey)
      ),
      submilestones: snapshot.submilestones.filter((entity) =>
        visibleSubmilestoneKeys.has(entity.entityKey)
      ),
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

export const getActiveBuildPlanningReconciliation = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(buildPlanningReconciliationValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const [revisions, currentSnapshot, pendingChunks] = await Promise.all([
      ctx.db
        .query("activeBuildPlanningRevisions")
        .withIndex("by_build_revision", (query) =>
          query.eq("buildId", authorization.build._id)
        )
        .order("desc")
        .take(100),
      collectPlanningSnapshot(ctx, authorization.build),
      ctx.db
        .query("activeBuildPlanningRevisionChunks")
        .withIndex("by_build", (query) =>
          query.eq("buildId", authorization.build._id)
        )
        .take(1),
    ]);
    const activationRevision = revisions.find(
      (revision) => revision.kind === "activation"
    );
    const activationSnapshot = activationRevision
      ? await readRevisionSnapshot(
          ctx,
          activationRevision._id,
          authorization.build._id,
          { allowPendingMaterialization: true }
        )
      : emptyPlanningSnapshot(String(authorization.build._id));
    const diffs = [];
    for (const revision of revisions) {
      const remainingDiffLimit = PLANNING_REVISION_DIFF_LIMIT - diffs.length;
      if (remainingDiffLimit <= 0) {
        throw new Error(
          "Active Build planning revision diff history exceeds the supported read window."
        );
      }
      const rows = await readRevisionDiffs(
        ctx,
        revision,
        remainingDiffLimit
      );
      diffs.push(...rows);
    }
    const activationProjection = activationRevision
      ? await redactSnapshotForViewer(ctx, authorization, activationSnapshot)
      : null;
    const currentProjection = await redactSnapshotForViewer(
      ctx,
      authorization,
      currentSnapshot,
    );
    return {
      activation: activationRevision
        ? {
            approvedAt: activationRevision.approvedAt,
            actorRoles: activationRevision.actorRoles,
            actorWorkosUserId: activationRevision.actorWorkosUserId,
            revision: activationRevision.revision,
            snapshot: activationProjection!.snapshot,
          }
        : null,
      current: {
        revision: revisions[0]?.revision ?? 0,
        snapshot: currentProjection.snapshot,
      },
      diffs: diffs
        .filter((diff) => {
          if (authorization.effectiveRole.role !== "contractor") return true;
          if (diff.entityType === "milestone") {
            return currentProjection.visibleMilestoneKeys?.has(diff.entityKey) ?? false;
          }
          if (diff.entityType === "submilestone") {
            return currentProjection.visibleSubmilestoneKeys?.has(diff.entityKey) ?? false;
          }
          return false;
        })
        .map((diff) => ({
          category: diff.category,
          changeType: diff.changeType,
          entityKey: diff.entityKey,
          entityType: diff.entityType,
          field: diff.field,
          nextValue: diff.nextValue,
          priorValue: diff.priorValue,
          revision: diff.revision,
        })),
      materializationPending: pendingChunks.length > 0,
      revisions: revisions.map((revision) => ({
        approvedAt: revision.approvedAt,
        actorRoles: revision.actorRoles,
        actorWorkosUserId: revision.actorWorkosUserId,
        diffCount: revision.diffCount,
        kind: revision.kind,
        reason: revision.reason,
        revision: revision.revision,
        sourceCommand: revision.sourceCommand,
        summary: revision.summary,
      })),
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
