/**
 * Production proposals active build draw migration bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { authenticatedMutation } from "../authz";
import { type Doc, type Id, type MutationCtx } from "../types";
import { type ActiveBuildDrawFundingSource, type ActiveBuildDrawSourceAllocation, activeBuildDrawFundingSnapshotFromRows, allocateActiveBuildDrawSources } from "./active_funding.js";
import { authorizeActiveBuildOrThrow, requireApproverActiveBuildWrite } from "./authorization_core.js";
import { writeActiveBuildEvent, activeBuildDrawWorkOrderKey, activeBuildDrawRequestReservesAvailability } from "./proposal_copy_audit.js";

const ACTIVE_BUILD_DRAW_MIGRATION_VERSION =
  "draw-release-work-order-attribution-v1";

const ACTIVE_BUILD_DRAW_MIGRATION_ROW_LIMIT = 256;

const ACTIVE_BUILD_DRAW_MIGRATION_ALLOCATION_LIMIT = 2_048;

type ActiveBuildDrawMigrationStatus = Exclude<
  Doc<"plannedDrawScheduleRows">["status"],
  "planned"
>;

type ActiveBuildDrawMigrationExistingRequestPlan = {
  allocations: ActiveBuildDrawSourceAllocation[];
  nextStatus: Doc<"activeBuildDrawRequests">["status"];
  request: Doc<"activeBuildDrawRequests">;
  workOrderKey: string;
};

type ActiveBuildDrawMigrationLegacyRowPlan = {
  amountCents: number;
  clientOperationId: string;
  displayId: string;
  originalProposalAmountCents: number;
  requestedAt: string;
  requestKey: string;
  row: Doc<"plannedDrawScheduleRows">;
  sourceAllocations: ActiveBuildDrawSourceAllocation[];
  status: ActiveBuildDrawMigrationStatus;
  workOrderKey: string;
};

type ActiveBuildDrawMigrationRestorePlan = {
  originalProposalAmountCents: number;
  row: Doc<"plannedDrawScheduleRows">;
};

type ActiveBuildDrawMigrationPlan = {
  attributed: number;
  availableCents: number;
  existingRequestPlans: ActiveBuildDrawMigrationExistingRequestPlan[];
  migrated: number;
  newRequestPlans: ActiveBuildDrawMigrationLegacyRowPlan[];
  normalized: number;
  planToken: string;
  reservedCents: number;
  restorePlans: ActiveBuildDrawMigrationRestorePlan[];
  restoredForecasts: number;
  skipped: number;
  unlockedCents: number;
  warnings: string[];
  wouldChange: boolean;
};

function assertActiveBuildDrawMigrationScope(
  label: string,
  row: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    organizationId: string;
  },
  expected: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    organizationId: string;
  },
) {
  if (
    String(row.buildId) !== String(expected.buildId) ||
    String(row.brokerageId) !== String(expected.brokerageId) ||
    row.organizationId !== expected.organizationId
  ) {
    throw new Error(
      `Cannot migrate ${label}: organization, brokerage, or build attribution is inconsistent.`,
    );
  }
}

function assertActiveBuildDrawMigrationBound(
  label: string,
  rows: readonly unknown[],
  limit: number,
) {
  if (rows.length > limit) {
    throw new Error(
      `Cannot migrate this build atomically: ${label} exceeds the production safety limit of ${limit}.`,
    );
  }
}

function activeBuildDrawMigrationRequestStatus(
  status: ActiveBuildDrawMigrationStatus,
): Doc<"activeBuildDrawRequests">["status"] {
  return status === "approved" ? "approved_for_release" : status;
}

function reserveActiveBuildDrawMigrationAllocations(
  sources: ActiveBuildDrawFundingSource[],
  allocations: readonly ActiveBuildDrawSourceAllocation[],
) {
  const sourcesByMilestoneId = new Map(
    sources.map((source) => [String(source.buildMilestoneId), source]),
  );
  for (const allocation of allocations) {
    const source = sourcesByMilestoneId.get(
      String(allocation.buildMilestoneId),
    );
    if (!source || source.availableCents < allocation.amountCents) {
      throw new Error(
        "Draw attribution integrity failure: migration reservations exceed an approved source bucket.",
      );
    }
    source.availableCents -= allocation.amountCents;
    source.reservedCents += allocation.amountCents;
  }
}

function activeBuildDrawMigrationSequence(value?: string) {
  const match = value?.match(/(\d+)(?!.*\d)/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function activeBuildDrawMigrationLifecycleTimestamp(
  row: Doc<"plannedDrawScheduleRows">,
) {
  const requestedAt = row.requestedAt?.trim();
  if (requestedAt) {
    const parsed = Date.parse(requestedAt);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return row.createdAt;
}

async function activeBuildDrawMigrationPlanToken(value: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return `${ACTIVE_BUILD_DRAW_MIGRATION_VERSION}:${Array.from(
    new Uint8Array(digest),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

async function planActiveBuildDrawRequestMigration(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    organizationId: string;
  },
): Promise<ActiveBuildDrawMigrationPlan> {
  const [
    plannedDraws,
    existingRequests,
    existingAllocations,
    milestones,
    facilities,
  ] = await Promise.all([
    ctx.db
      .query("plannedDrawScheduleRows")
      .withIndex("by_build", (q) => q.eq("buildId", input.buildId))
      .take(ACTIVE_BUILD_DRAW_MIGRATION_ROW_LIMIT + 1),
    ctx.db
      .query("activeBuildDrawRequests")
      .withIndex("by_build", (q) => q.eq("buildId", input.buildId))
      .take(ACTIVE_BUILD_DRAW_MIGRATION_ROW_LIMIT + 1),
    ctx.db
      .query("activeBuildDrawRequestAllocations")
      .withIndex("by_build", (q) => q.eq("buildId", input.buildId))
      .take(ACTIVE_BUILD_DRAW_MIGRATION_ALLOCATION_LIMIT + 1),
    ctx.db
      .query("buildMilestones")
      .withIndex("by_build", (q) => q.eq("buildId", input.buildId))
      .take(ACTIVE_BUILD_DRAW_MIGRATION_ROW_LIMIT + 1),
    ctx.db
      .query("loanFacilities")
      .withIndex("by_build", (q) => q.eq("buildId", input.buildId))
      .take(ACTIVE_BUILD_DRAW_MIGRATION_ROW_LIMIT + 1),
  ]);
  assertActiveBuildDrawMigrationBound(
    "planned draw rows",
    plannedDraws,
    ACTIVE_BUILD_DRAW_MIGRATION_ROW_LIMIT,
  );
  assertActiveBuildDrawMigrationBound(
    "draw release work orders",
    existingRequests,
    ACTIVE_BUILD_DRAW_MIGRATION_ROW_LIMIT,
  );
  assertActiveBuildDrawMigrationBound(
    "draw source allocations",
    existingAllocations,
    ACTIVE_BUILD_DRAW_MIGRATION_ALLOCATION_LIMIT,
  );
  assertActiveBuildDrawMigrationBound(
    "milestones",
    milestones,
    ACTIVE_BUILD_DRAW_MIGRATION_ROW_LIMIT,
  );
  assertActiveBuildDrawMigrationBound(
    "loan facilities",
    facilities,
    ACTIVE_BUILD_DRAW_MIGRATION_ROW_LIMIT,
  );

  const scopedRows = [
    ...plannedDraws,
    ...existingRequests,
    ...existingAllocations,
    ...milestones,
    ...facilities,
  ];
  for (const row of scopedRows) {
    assertActiveBuildDrawMigrationScope(`${row._id}`, row, input);
  }

  const requestsById = new Map(
    existingRequests.map((request) => [String(request._id), request]),
  );
  const allocationsByRequestId = new Map<
    string,
    Doc<"activeBuildDrawRequestAllocations">[]
  >();
  const approvedMilestonesById = new Map(
    milestones
      .filter((milestone) => milestone.completionReview?.status === "approved")
      .map((milestone) => [String(milestone._id), milestone]),
  );
  for (const allocation of existingAllocations) {
    const request = requestsById.get(String(allocation.drawRequestId));
    if (!request) {
      throw new Error(
        `Cannot migrate allocation ${allocation._id}: its Draw Release Work Order is missing from this build.`,
      );
    }
    const milestone = approvedMilestonesById.get(
      String(allocation.buildMilestoneId),
    );
    if (
      !milestone ||
      milestone.key !== allocation.milestoneKey ||
      !Number.isSafeInteger(allocation.amountCents) ||
      allocation.amountCents <= 0
    ) {
      throw new Error(
        `Cannot migrate ${request.requestKey}: a persisted allocation is not attributable to an approved reimbursement milestone.`,
      );
    }
    const requestAllocations =
      allocationsByRequestId.get(String(request._id)) ?? [];
    requestAllocations.push(allocation);
    allocationsByRequestId.set(String(request._id), requestAllocations);
  }

  const sortedRequests = existingRequests
    .slice()
    .sort(
      (a, b) =>
        a.createdAt - b.createdAt ||
        a.requestKey.localeCompare(b.requestKey) ||
        String(a._id).localeCompare(String(b._id)),
    );
  const unattributedRequestIds = new Set<string>();
  for (const request of sortedRequests) {
    if (
      !Number.isSafeInteger(request.amountCents) ||
      request.amountCents <= 0
    ) {
      throw new Error(
        `Cannot migrate ${request.requestKey}: reimbursement amount must be a positive whole number of cents.`,
      );
    }
    const attributedCents = (
      allocationsByRequestId.get(String(request._id)) ?? []
    ).reduce((total, allocation) => total + allocation.amountCents, 0);
    if (attributedCents !== 0 && attributedCents !== request.amountCents) {
      throw new Error(
        `Cannot migrate ${request.requestKey}: persisted source allocations total ${attributedCents} cents for a ${request.amountCents}-cent request.`,
      );
    }
    if (attributedCents === 0) {
      unattributedRequestIds.add(String(request._id));
    }
  }

  const funding = activeBuildDrawFundingSnapshotFromRows({
    allocations: existingAllocations,
    facilities,
    ignoreUnattributedRequestIds: unattributedRequestIds,
    milestones,
    plannedDraws,
    requests: existingRequests,
  });
  const simulatedSources = funding.sources.map((source) => ({ ...source }));
  const workOrderOwners = new Map<string, string>();
  for (const request of sortedRequests) {
    const explicitKey = request.workOrderKey?.trim();
    if (!explicitKey) {
      continue;
    }
    const owner = workOrderOwners.get(explicitKey);
    if (owner && owner !== String(request._id)) {
      throw new Error(
        `Cannot migrate ${request.requestKey}: Draw Release Work Order key ${explicitKey} is duplicated in this build.`,
      );
    }
    workOrderOwners.set(explicitKey, String(request._id));
  }

  const existingRequestPlans: ActiveBuildDrawMigrationExistingRequestPlan[] =
    [];
  for (const request of sortedRequests) {
    const explicitKey = request.workOrderKey?.trim();
    const derivedKey = activeBuildDrawWorkOrderKey({
      ...request,
      workOrderKey: undefined,
    });
    const workOrderKey =
      explicitKey ??
      (workOrderOwners.has(derivedKey)
        ? `DRWO-LEGACY-${String(request._id)}`
        : derivedKey);
    const keyOwner = workOrderOwners.get(workOrderKey);
    if (keyOwner && keyOwner !== String(request._id)) {
      throw new Error(
        `Cannot migrate ${request.requestKey}: no unique deterministic Draw Release Work Order key is available.`,
      );
    }
    workOrderOwners.set(workOrderKey, String(request._id));
    const allocations = unattributedRequestIds.has(String(request._id))
      ? allocateActiveBuildDrawSources(
          activeBuildDrawRequestReservesAvailability(request.status)
            ? simulatedSources
            : simulatedSources.map((source) => ({
                ...source,
                availableCents: source.unlockedCents,
              })),
          request.amountCents,
        )
      : [];
    if (
      allocations.length > 0 &&
      activeBuildDrawRequestReservesAvailability(request.status)
    ) {
      reserveActiveBuildDrawMigrationAllocations(simulatedSources, allocations);
    }
    existingRequestPlans.push({
      allocations,
      nextStatus:
        request.status === "approved"
          ? ("approved_for_release" as const)
          : request.status,
      request,
      workOrderKey,
    });
  }

  const existingByOperationId = new Map<
    string,
    Doc<"activeBuildDrawRequests">
  >();
  for (const request of sortedRequests) {
    const duplicate = existingByOperationId.get(request.clientOperationId);
    if (duplicate) {
      throw new Error(
        `Cannot migrate ${request.requestKey}: client operation ID ${request.clientOperationId} is duplicated by ${duplicate.requestKey}.`,
      );
    }
    existingByOperationId.set(request.clientOperationId, request);
  }
  const priorMigrationRequests = sortedRequests.filter((request) =>
    request.clientOperationId.startsWith("migration:"),
  );
  const lifecycleRows = plannedDraws
    .filter(
      (
        row,
      ): row is Doc<"plannedDrawScheduleRows"> & {
        status: ActiveBuildDrawMigrationStatus;
      } => row.status !== "planned",
    )
    .sort(
      (a, b) =>
        activeBuildDrawMigrationLifecycleTimestamp(a) -
          activeBuildDrawMigrationLifecycleTimestamp(b) ||
        a.order - b.order ||
        String(a._id).localeCompare(String(b._id)),
    );
  const proposalRows = await Promise.all(
    lifecycleRows.map((row) => ctx.db.get(row.proposalDrawScheduleRowId)),
  );
  const proposalRowsById = new Map(
    proposalRows
      .filter((row): row is Doc<"proposalDrawScheduleRows"> => row !== null)
      .map((row) => [String(row._id), row]),
  );
  for (const proposalRow of proposalRowsById.values()) {
    if (
      String(proposalRow.brokerageId) !== String(input.brokerageId) ||
      proposalRow.organizationId !== input.organizationId
    ) {
      throw new Error(
        `Cannot migrate proposal draw row ${proposalRow._id}: organization or brokerage attribution is inconsistent.`,
      );
    }
  }

  const usedDisplayIds = new Set(
    sortedRequests.map((request) => request.displayId),
  );
  let sequence = sortedRequests.reduce(
    (maximum, request) =>
      Math.max(
        maximum,
        activeBuildDrawMigrationSequence(request.displayId),
        activeBuildDrawMigrationSequence(request.workOrderKey),
      ),
    0,
  );
  const newRequestPlans: ActiveBuildDrawMigrationLegacyRowPlan[] = [];
  const restorePlans: ActiveBuildDrawMigrationRestorePlan[] = [];
  for (const row of lifecycleRows) {
    if (!Number.isSafeInteger(row.amountCents) || row.amountCents <= 0) {
      throw new Error(
        `Cannot migrate ${row.drawKey}: reimbursement amount must be a positive whole number of cents.`,
      );
    }
    const proposalRow = proposalRowsById.get(
      String(row.proposalDrawScheduleRowId),
    );
    if (!proposalRow) {
      throw new Error(
        `Cannot migrate ${row.drawKey}: its original proposal forecast row is missing.`,
      );
    }
    const clientOperationId = `migration:${String(row._id)}`;
    const priorRequest = existingByOperationId.get(clientOperationId);
    if (priorRequest) {
      if (priorRequest.amountCents !== row.amountCents) {
        throw new Error(
          `Cannot replay ${row.drawKey}: its existing Draw Release Work Order amount does not match the legacy lifecycle row.`,
        );
      }
      restorePlans.push({
        originalProposalAmountCents: proposalRow.amountCents,
        row,
      });
      continue;
    }

    let displayId: string;
    let workOrderKey: string;
    do {
      sequence += 1;
      displayId = `DR-${String(sequence).padStart(4, "0")}`;
      workOrderKey = `DRWO-${String(sequence).padStart(4, "0")}`;
    } while (
      usedDisplayIds.has(displayId) ||
      workOrderOwners.has(workOrderKey)
    );
    usedDisplayIds.add(displayId);
    workOrderOwners.set(workOrderKey, `planned:${String(row._id)}`);
    const status = activeBuildDrawMigrationRequestStatus(row.status);
    const sourceAllocations = allocateActiveBuildDrawSources(
      activeBuildDrawRequestReservesAvailability(status)
        ? simulatedSources
        : simulatedSources.map((source) => ({
            ...source,
            availableCents: source.unlockedCents,
          })),
      row.amountCents,
    );
    if (activeBuildDrawRequestReservesAvailability(status)) {
      reserveActiveBuildDrawMigrationAllocations(
        simulatedSources,
        sourceAllocations,
      );
    }
    newRequestPlans.push({
      amountCents: row.amountCents,
      clientOperationId,
      displayId,
      originalProposalAmountCents: proposalRow.amountCents,
      requestedAt: row.requestedAt ?? new Date(row.updatedAt).toISOString(),
      requestKey: `${displayId.toLowerCase()}-migration-${String(row._id)}`,
      row,
      sourceAllocations,
      status,
      workOrderKey,
    });
  }

  const attributed = existingRequestPlans.filter(
    (plan) => plan.allocations.length > 0,
  ).length;
  const normalized = existingRequestPlans.filter(
    (plan) =>
      plan.nextStatus !== plan.request.status ||
      plan.workOrderKey !== plan.request.workOrderKey,
  ).length;
  const migrated = newRequestPlans.length;
  const restoredForecasts = migrated + restorePlans.length;
  const wouldChange =
    attributed > 0 || normalized > 0 || migrated > 0 || restorePlans.length > 0;
  const reservedCents =
    funding.unlockedCents -
    simulatedSources.reduce(
      (total, source) => total + source.availableCents,
      0,
    );
  const availableCents = Math.max(0, funding.unlockedCents - reservedCents);
  const warnings = [
    ...(migrated > 0
      ? [
          `${migrated} legacy lifecycle row(s) do not preserve the original requester identity; the authenticated migration operator is recorded with an audit warning.`,
        ]
      : []),
    ...(existingRequestPlans.some(
      (plan) => plan.nextStatus !== plan.request.status,
    )
      ? [
          "Legacy approved statuses will be normalized to approved_for_release without releasing funds or changing the interest start date.",
        ]
      : []),
  ];
  const planToken = await activeBuildDrawMigrationPlanToken({
    allocations: existingAllocations
      .slice()
      .sort((a, b) => String(a._id).localeCompare(String(b._id)))
      .map((allocation) => ({
        amountCents: allocation.amountCents,
        buildMilestoneId: allocation.buildMilestoneId,
        drawRequestId: allocation.drawRequestId,
        id: allocation._id,
        milestoneKey: allocation.milestoneKey,
      })),
    buildId: input.buildId,
    fundingSources: funding.sources.map((source) => ({
      availableCents: source.availableCents,
      buildMilestoneId: source.buildMilestoneId,
      drawGroupKey: source.drawGroupKey,
      milestoneKey: source.milestoneKey,
      sourceOrder: source.sourceOrder,
      unlockedCents: source.unlockedCents,
    })),
    lifecycleRows: lifecycleRows.map((row) => ({
      amountCents: row.amountCents,
      buildMilestoneId: row.buildMilestoneId,
      createdAt: row.createdAt,
      drawKey: row.drawKey,
      id: row._id,
      label: row.label,
      milestoneKey: row.milestoneKey,
      order: row.order,
      originalProposalAmountCents: proposalRowsById.get(
        String(row.proposalDrawScheduleRowId),
      )?.amountCents,
      proposalDrawScheduleRowId: row.proposalDrawScheduleRowId,
      releaseDate: row.releaseDate,
      releaseNote: row.releaseNote,
      releasedAt: row.releasedAt,
      requestNote: row.requestNote,
      requestReviewNote: row.requestReviewNote,
      requestedAt: row.requestedAt,
      reviewedAt: row.reviewedAt,
      status: row.status,
    })),
    organizationId: input.organizationId,
    requests: sortedRequests.map((request) => ({
      amountCents: request.amountCents,
      clientOperationId: request.clientOperationId,
      createdAt: request.createdAt,
      displayId: request.displayId,
      id: request._id,
      requestKey: request.requestKey,
      status: request.status,
      workOrderKey: request.workOrderKey,
    })),
    version: ACTIVE_BUILD_DRAW_MIGRATION_VERSION,
  });
  return {
    attributed,
    availableCents,
    existingRequestPlans,
    migrated,
    newRequestPlans,
    normalized,
    planToken,
    reservedCents,
    restorePlans,
    restoredForecasts,
    skipped: priorMigrationRequests.length,
    unlockedCents: funding.unlockedCents,
    warnings,
    wouldChange,
  };
}

async function restoreActiveBuildPlannedDrawAfterMigration(
  ctx: MutationCtx,
  plan: ActiveBuildDrawMigrationRestorePlan,
  now: number,
) {
  await ctx.db.patch(plan.row._id, {
    amountCents: plan.originalProposalAmountCents,
    releaseDate: undefined,
    releasedAt: undefined,
    releaseNote: undefined,
    requestedAt: undefined,
    requestNote: undefined,
    requestReviewNote: undefined,
    reviewedAt: undefined,
    status: "planned",
    updatedAt: now,
  });
}

export const migrateActiveBuildDrawRequests = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    dryRun: v.boolean(),
    expectedPlanToken: v.optional(v.string()),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      applied: v.boolean(),
      attributed: v.number(),
      availableCents: v.number(),
      dryRun: v.boolean(),
      migrated: v.number(),
      normalized: v.number(),
      planToken: v.string(),
      replayed: v.boolean(),
      reservedCents: v.number(),
      restoredForecasts: v.number(),
      skipped: v.number(),
      unlockedCents: v.number(),
      warnings: v.array(v.string()),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireApproverActiveBuildWrite(auth);
    const reason = args.reason.trim();
    if (reason.length < 3 || reason.length > 500) {
      throw new Error(
        "Draw migration reason must be between 3 and 500 characters.",
      );
    }
    const plan = await planActiveBuildDrawRequestMigration(ctx, {
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      organizationId: args.workosOrganizationId,
    });
    const result = {
      applied: false,
      attributed: plan.attributed,
      availableCents: plan.availableCents,
      dryRun: args.dryRun,
      migrated: plan.migrated,
      normalized: plan.normalized,
      planToken: plan.planToken,
      replayed: false,
      reservedCents: plan.reservedCents,
      restoredForecasts: plan.restoredForecasts,
      skipped: plan.skipped,
      unlockedCents: plan.unlockedCents,
      warnings: plan.warnings,
    };
    if (args.dryRun) {
      return result;
    }
    if (!plan.wouldChange) {
      return { ...result, replayed: true };
    }
    if (args.expectedPlanToken !== plan.planToken) {
      throw new Error(
        "Draw migration plan changed or was not confirmed. Run dryRun=true again and execute with its exact planToken.",
      );
    }

    const now = Date.now();
    for (const requestPlan of plan.existingRequestPlans) {
      for (const allocation of requestPlan.allocations) {
        await ctx.db.insert("activeBuildDrawRequestAllocations", {
          amountCents: allocation.amountCents,
          brokerageId: requestPlan.request.brokerageId,
          buildId: requestPlan.request.buildId,
          buildMilestoneId: allocation.buildMilestoneId,
          createdAt: requestPlan.request.createdAt,
          drawGroupKey: allocation.drawGroupKey,
          drawRequestId: requestPlan.request._id,
          milestoneKey: allocation.milestoneKey,
          organizationId: requestPlan.request.organizationId,
          sourceOrder: allocation.sourceOrder,
        });
      }
      if (
        requestPlan.nextStatus !== requestPlan.request.status ||
        requestPlan.workOrderKey !== requestPlan.request.workOrderKey
      ) {
        await ctx.db.patch(requestPlan.request._id, {
          status: requestPlan.nextStatus,
          updatedAt: now,
          workOrderKey: requestPlan.workOrderKey,
        });
      }
    }
    for (const requestPlan of plan.newRequestPlans) {
      const row = requestPlan.row;
      const drawRequestId = await ctx.db.insert("activeBuildDrawRequests", {
        amountCents: requestPlan.amountCents,
        brokerageId: row.brokerageId,
        buildId: row.buildId,
        clientOperationId: requestPlan.clientOperationId,
        createdAt: row.updatedAt,
        displayId: requestPlan.displayId,
        label: row.label,
        note: row.requestNote,
        organizationId: row.organizationId,
        plannedDrawKey: row.drawKey,
        releaseDate: row.releaseDate,
        releasedAt: row.releasedAt,
        releaseNote: row.releaseNote,
        requestedAt: requestPlan.requestedAt,
        requestedByWorkosUserId: auth.subject,
        requestKey: requestPlan.requestKey,
        reviewedAt: row.reviewedAt,
        reviewNote: row.requestReviewNote,
        status: requestPlan.status,
        updatedAt: row.updatedAt,
        workOrderKey: requestPlan.workOrderKey,
      });
      for (const allocation of requestPlan.sourceAllocations) {
        await ctx.db.insert("activeBuildDrawRequestAllocations", {
          amountCents: allocation.amountCents,
          brokerageId: row.brokerageId,
          buildId: row.buildId,
          buildMilestoneId: allocation.buildMilestoneId,
          createdAt: row.updatedAt,
          drawGroupKey: allocation.drawGroupKey,
          drawRequestId,
          milestoneKey: allocation.milestoneKey,
          organizationId: row.organizationId,
          sourceOrder: allocation.sourceOrder,
        });
      }
      await restoreActiveBuildPlannedDrawAfterMigration(
        ctx,
        {
          originalProposalAmountCents: requestPlan.originalProposalAmountCents,
          row,
        },
        now,
      );
    }
    for (const restorePlan of plan.restorePlans) {
      await restoreActiveBuildPlannedDrawAfterMigration(ctx, restorePlan, now);
    }

    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "migrateActiveBuildDrawRequests",
      eventType: "active_build.draw_requests.migrated",
      newState: JSON.stringify({
        attributed: plan.attributed,
        availableCents: plan.availableCents,
        migrated: plan.migrated,
        normalized: plan.normalized,
        planToken: plan.planToken,
        reservedCents: plan.reservedCents,
        restoredForecasts: plan.restoredForecasts,
        skipped: plan.skipped,
        unlockedCents: plan.unlockedCents,
        version: ACTIVE_BUILD_DRAW_MIGRATION_VERSION,
      }),
      priorState: JSON.stringify({
        legacyLifecycleRows: plan.newRequestPlans.map((requestPlan) => ({
          amountCents: requestPlan.amountCents,
          drawKey: requestPlan.row.drawKey,
          rowId: requestPlan.row._id,
          status: requestPlan.row.status,
        })),
        requestsNeedingAttribution: plan.existingRequestPlans
          .filter((requestPlan) => requestPlan.allocations.length > 0)
          .map((requestPlan) => ({
            amountCents: requestPlan.request.amountCents,
            requestKey: requestPlan.request.requestKey,
            status: requestPlan.request.status,
          })),
      }),
      reason,
      warnings: plan.warnings,
    });
    return { ...result, applied: true };
  })
  .public();
