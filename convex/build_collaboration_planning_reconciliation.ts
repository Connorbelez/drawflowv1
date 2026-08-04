import { v } from "convex/values";

import { authorizeActiveBuildAccess } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  ensureMilestoneSystemPost,
  synchronizeMilestoneSystemPostPlanning,
} from "./build_collaboration_system_posts";
import { resolveCanonicalMilestoneExecutionOwnership } from "./build_collaboration_system_event_access";
import { buildPlanningReconciliationValidator } from "./build_collaboration_validators";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
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

const EMPTY_PLAN: Omit<PlanningSnapshot, "buildId"> = {
  allocations: [],
  budgets: [],
  draws: [],
  evidenceRequirements: [],
  milestones: [],
  submilestones: [],
};

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
        .take(1000),
      ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(2000),
      ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(1000),
      ctx.db
        .query("milestoneContractorAssignments")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(2000),
      ctx.db
        .query("buildCapitalPlans")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(100),
      ctx.db
        .query("buildSubmilestoneEvidenceRequirements")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(5000),
    ]);

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
  buildId: Id<"activeBuilds">
): Promise<PlanningSnapshot> {
  const entities = await ctx.db
    .query("activeBuildPlanningRevisionEntities")
    .withIndex("by_revision", (query) => query.eq("revisionId", revisionId))
    .take(10000);
  const result: PlanningSnapshot = {
    buildId: String(buildId),
    ...EMPTY_PLAN,
  };
  for (const entity of entities) {
    const value: PlanningEntity = {
      canonicalId: entity.canonicalId,
      entityKey: entity.entityKey,
      entityType: entity.entityType,
      planningState: entity.planningState,
      snapshot: JSON.parse(entity.snapshotJson) as Record<string, unknown>,
    };
    if (entity.entityType === "milestone") result.milestones.push(value);
    else if (entity.entityType === "submilestone")
      result.submilestones.push(value);
    else if (entity.entityType === "draw") result.draws.push(value);
    else if (entity.entityType === "budget") result.budgets.push(value);
    else if (entity.entityType === "allocation") result.allocations.push(value);
    else if (entity.entityType === "evidenceRequirement")
      result.evidenceRequirements.push(value);
  }
  return result;
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
    ? await readRevisionSnapshot(ctx, priorRevision._id, input.build._id)
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
  for (const entity of flattenSnapshot(current)) {
    await ctx.db.insert("activeBuildPlanningRevisionEntities", {
      brokerageId: input.build.brokerageId,
      buildId: input.build._id,
      canonicalId: entity.canonicalId,
      createdAt: now,
      entityKey: entity.entityKey,
      entityType: entity.entityType,
      organizationId: input.build.organizationId,
      planningState: entity.planningState,
      revision,
      revisionId,
      snapshotJson: JSON.stringify(entity.snapshot),
    });
  }
  for (const diff of diffs) {
    await ctx.db.insert("activeBuildPlanningRevisionDiffs", {
      brokerageId: input.build.brokerageId,
      buildId: input.build._id,
      category: diff.category,
      changeType: diff.changeType,
      createdAt: now,
      entityKey: diff.entityKey,
      entityType: diff.entityType,
      field: diff.field,
      nextValue: diff.nextValue,
      organizationId: input.build.organizationId,
      priorValue: diff.priorValue,
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
  return await ctx.db.get(revisionId);
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
  for (const submilestone of snapshot.submilestones) {
    const milestone = snapshot.milestones.find(
      (candidate) =>
        candidate.entityKey === submilestone.entityKey.split(":")[0]
    );
    const milestoneId = milestone?.canonicalId
      ? authorization.build._id &&
        ctx.db.normalizeId("buildMilestones", milestone.canonicalId)
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
    const ownership = await resolveCanonicalMilestoneExecutionOwnership(ctx, {
      build: authorization.build,
      milestone: milestoneDoc,
      submilestone: submilestoneDoc,
    });
    if (
      ownership.state === "assigned" &&
      ownership.contractor?.accountWorkosUserId === authorization.viewer.subject
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
    const [revisions, currentSnapshot] = await Promise.all([
      ctx.db
        .query("activeBuildPlanningRevisions")
        .withIndex("by_build_revision", (query) =>
          query.eq("buildId", authorization.build._id)
        )
        .order("desc")
        .take(100),
      collectPlanningSnapshot(ctx, authorization.build),
    ]);
    const activationRevision = revisions.find(
      (revision) => revision.kind === "activation"
    );
    const activationSnapshot = activationRevision
      ? await readRevisionSnapshot(
          ctx,
          activationRevision._id,
          authorization.build._id
        )
      : { buildId: String(authorization.build._id), ...EMPTY_PLAN };
    const diffs = [];
    for (const revision of revisions) {
      const rows = await ctx.db
        .query("activeBuildPlanningRevisionDiffs")
        .withIndex("by_revision", (query) =>
          query.eq("revisionId", revision._id)
        )
        .take(1000);
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
  .returns(v.any())
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
      .take(1000);
    const targets = milestones.filter(
      (milestone) =>
        args.milestoneKey === undefined || milestone.key === args.milestoneKey
    );
    const posts = [];
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
      }
      if (postId) posts.push(postId);
    }
    return {
      buildId: authorization.build._id,
      planningRevision:
        (await latestPlanningRevision(ctx, authorization.build._id))
          ?.revision ?? 0,
      postIds: posts,
      repairedMilestoneCount: posts.length,
    };
  })
  .public();
