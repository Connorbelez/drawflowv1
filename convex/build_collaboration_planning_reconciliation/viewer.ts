import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import type { Doc, Id, QueryCtx } from "../types";
import {
  type PlanningDiff,
  type PlanningEntity,
  type PlanningSnapshot,
  PLANNING_RECONCILIATION_PAGE_SIZE,
  PLANNING_REVISION_READ_LIMIT,
  PLANNING_SNAPSHOT_LIMITS,
  boundedPlanningPagination,
  collectPlanningSnapshot,
  encodePlanningPageCursor,
  emptyPlanningSnapshot,
  flattenSnapshot,
  planningPageOffset,
  readPlanningRows,
} from "./core";

const CONTRACTOR_FINANCIAL_PLANNING_FIELDS = new Set([
  "budgetCents",
  "drawAvailabilityCents",
]);

export function redactContractorPlanningSnapshot(
  snapshot: Record<string, unknown>,
) {
  const redacted = { ...snapshot };
  for (const field of CONTRACTOR_FINANCIAL_PLANNING_FIELDS) {
    delete redacted[field];
  }
  return redacted;
}

export function redactContractorPlanningDiff(diff: PlanningDiff) {
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

export async function redactSnapshotForViewer(
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

export function planningRevisionSummary(
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

export function planningActivationSummary(
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

export async function planningRevisionPage(
  ctx: QueryCtx,
  buildId: Id<"activeBuilds">,
) {
  const page = await readPlanningRows(
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

export function pagedPlanningSnapshot(
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
