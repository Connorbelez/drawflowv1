/**
 * Production proposals active funding bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { activeBuildMilestoneEffectiveDrawAvailabilityCents } from "./active_planning.js";
import { activeBuildDrawRequestReservesAvailability } from "./proposal_copy_audit.js";
import { collectByIndex } from "./storage_helpers.js";

export type ActiveBuildDrawFundingSource = {
  availableCents: number;
  buildMilestoneId: Id<"buildMilestones">;
  drawGroupKey: string;
  milestoneKey: string;
  milestoneName: string;
  reservedCents: number;
  sourceOrder: number;
  unlockedCents: number;
};

export type ActiveBuildDrawSourceAllocation = {
  amountCents: number;
  buildMilestoneId: Id<"buildMilestones">;
  drawGroupKey: string;
  milestoneKey: string;
  milestoneName: string;
  sourceOrder: number;
};

export function activeBuildDrawFundingSnapshotFromRows(input: {
  allowLegacyUnattributedRequests?: boolean;
  allocations: readonly Doc<"activeBuildDrawRequestAllocations">[];
  facilities: readonly Doc<"loanFacilities">[];
  ignoreUnattributedRequestIds?: ReadonlySet<string>;
  milestones: readonly Doc<"buildMilestones">[];
  plannedDraws: readonly Doc<"plannedDrawScheduleRows">[];
  requests: readonly Doc<"activeBuildDrawRequests">[];
}) {
  const approvedMilestones = input.milestones
    .filter(
      (milestone) =>
        milestone.planningState !== "superseded" &&
        milestone.completionReview?.status === "approved",
    )
    .sort(
      (a, b) =>
        a.order - b.order ||
        a.key.localeCompare(b.key) ||
        String(a._id).localeCompare(String(b._id)),
    );
  const approvedMilestoneCents = approvedMilestones.reduce(
    (total, milestone) =>
      total + activeBuildMilestoneEffectiveDrawAvailabilityCents(milestone),
    0,
  );
  const constructionFacility = input.facilities.find(
    (facility) =>
      facility.facilityKind === undefined ||
      facility.facilityKind === "construction",
  );
  const facilityCents = Math.max(
    0,
    Math.round(constructionFacility?.principalCents ?? 0),
  );
  const requestsById = new Map(
    input.requests.map((request) => [String(request._id), request]),
  );
  const approvedMilestoneIds = new Set(
    approvedMilestones.map((milestone) => String(milestone._id)),
  );
  const allocationTotalsByRequest = new Map<string, number>();
  const reservedByMilestone = new Map<string, number>();
  for (const allocation of input.allocations) {
    const requestId = String(allocation.drawRequestId);
    const request = requestsById.get(requestId);
    if (
      !request ||
      input.ignoreUnattributedRequestIds?.has(String(request._id))
    ) {
      continue;
    }
    allocationTotalsByRequest.set(
      requestId,
      (allocationTotalsByRequest.get(requestId) ?? 0) + allocation.amountCents,
    );
    if (
      activeBuildDrawRequestReservesAvailability(request.status) &&
      approvedMilestoneIds.has(String(allocation.buildMilestoneId))
    ) {
      const milestoneId = String(allocation.buildMilestoneId);
      reservedByMilestone.set(
        milestoneId,
        (reservedByMilestone.get(milestoneId) ?? 0) + allocation.amountCents,
      );
    }
  }
  const attributedRequests = input.requests.filter(
    (request) => !input.ignoreUnattributedRequestIds?.has(String(request._id)),
  );
  const legacyUnattributedRequests: Doc<"activeBuildDrawRequests">[] = [];
  for (const request of attributedRequests) {
    const allocationTotal =
      allocationTotalsByRequest.get(String(request._id)) ?? 0;
    if (allocationTotal === request.amountCents) {
      continue;
    }
    if (allocationTotal === 0 && input.allowLegacyUnattributedRequests) {
      legacyUnattributedRequests.push(request);
      continue;
    }
    if (allocationTotal === 0) {
      throw new Error(
        `Draw attribution integrity failure for ${request.requestKey}; run the active-build draw attribution migration before accepting another request.`,
      );
    }
    throw new Error(
      `Draw attribution integrity failure for ${request.requestKey}; persisted allocations total ${allocationTotal} cents for a ${request.amountCents}-cent request.`,
    );
  }
  const reservingRequests = attributedRequests.filter((request) =>
    activeBuildDrawRequestReservesAvailability(request.status),
  );
  const approvedMilestoneKeys = new Set(
    approvedMilestones.map((milestone) => milestone.key),
  );
  const plannedDrawGroupByMilestone = new Map(
    input.plannedDraws
      .filter(
        (
          draw,
        ): draw is Doc<"plannedDrawScheduleRows"> & { milestoneKey: string } =>
          Boolean(
            draw.milestoneKey && approvedMilestoneKeys.has(draw.milestoneKey),
          ),
      )
      .sort((a, b) => a.order - b.order || a.drawKey.localeCompare(b.drawKey))
      .map((draw) => [draw.milestoneKey, draw.drawKey]),
  );
  let facilityRemainingCents =
    constructionFacility !== undefined ? facilityCents : approvedMilestoneCents;
  const sources: ActiveBuildDrawFundingSource[] = approvedMilestones.map(
    (milestone, sourceOrder) => {
      const milestoneValueCents =
        activeBuildMilestoneEffectiveDrawAvailabilityCents(milestone);
      const unlockedCents = Math.min(
        milestoneValueCents,
        facilityRemainingCents,
      );
      facilityRemainingCents = Math.max(
        0,
        facilityRemainingCents - unlockedCents,
      );
      const reservedCents = reservedByMilestone.get(String(milestone._id)) ?? 0;
      return {
        availableCents: Math.max(0, unlockedCents - reservedCents),
        buildMilestoneId: milestone._id,
        drawGroupKey:
          plannedDrawGroupByMilestone.get(milestone.key) ??
          `milestone:${milestone.key}`,
        milestoneKey: milestone.key,
        milestoneName: milestone.name,
        reservedCents,
        sourceOrder,
        unlockedCents,
      };
    },
  );
  let attributionShortfallCents = 0;
  for (const request of legacyUnattributedRequests
    .filter((candidate) =>
      activeBuildDrawRequestReservesAvailability(candidate.status),
    )
    .sort(
      (a, b) =>
        a.createdAt - b.createdAt ||
        a.requestKey.localeCompare(b.requestKey) ||
        String(a._id).localeCompare(String(b._id)),
    )) {
    let remainingCents = request.amountCents;
    for (const source of sources) {
      if (remainingCents <= 0) {
        break;
      }
      const allocatedCents = Math.min(source.availableCents, remainingCents);
      source.availableCents -= allocatedCents;
      source.reservedCents += allocatedCents;
      remainingCents -= allocatedCents;
    }
    attributionShortfallCents += remainingCents;
  }
  const unlockedCents = sources.reduce(
    (total, source) => total + source.unlockedCents,
    0,
  );
  const reservedCents = reservingRequests.reduce(
    (total, request) => total + Math.max(0, Math.round(request.amountCents)),
    0,
  );
  const availableCents = Math.max(0, unlockedCents - reservedCents);
  let availableRemainingCents = availableCents;
  const reconciledSources = sources.map((source) => {
    const sourceAvailableCents = Math.min(
      source.availableCents,
      availableRemainingCents,
    );
    availableRemainingCents -= sourceAvailableCents;
    return { ...source, availableCents: sourceAvailableCents };
  });
  return {
    approvedMilestoneCents,
    attributionShortfallCents,
    availableCents,
    facilityCents,
    legacyUnattributedRequestCount: legacyUnattributedRequests.length,
    legacyUnattributedRequestCents: legacyUnattributedRequests.reduce(
      (total, request) => total + request.amountCents,
      0,
    ),
    requiresAttributionMigration: legacyUnattributedRequests.length > 0,
    reservedCents,
    sources: reconciledSources,
    unlockedCents,
  };
}

export async function activeBuildDrawFundingSnapshot(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  options?: {
    allowLegacyUnattributedRequests?: boolean;
    ignoreUnattributedRequestIds?: ReadonlySet<string>;
  },
) {
  const [milestones, requests, allocations, facilities, plannedDraws] =
    await Promise.all([
      collectByIndex(ctx, "buildMilestones", "by_build", buildId),
      collectByIndex(ctx, "activeBuildDrawRequests", "by_build", buildId),
      collectByIndex(
        ctx,
        "activeBuildDrawRequestAllocations",
        "by_build",
        buildId,
      ),
      collectByIndex(ctx, "loanFacilities", "by_build", buildId),
      collectByIndex(ctx, "plannedDrawScheduleRows", "by_build", buildId),
    ]);
  return activeBuildDrawFundingSnapshotFromRows({
    allowLegacyUnattributedRequests: options?.allowLegacyUnattributedRequests,
    allocations: allocations as Doc<"activeBuildDrawRequestAllocations">[],
    facilities: facilities as Doc<"loanFacilities">[],
    ignoreUnattributedRequestIds: options?.ignoreUnattributedRequestIds,
    milestones: milestones as Doc<"buildMilestones">[],
    plannedDraws: plannedDraws as Doc<"plannedDrawScheduleRows">[],
    requests: requests as Doc<"activeBuildDrawRequests">[],
  });
}

export function allocateActiveBuildDrawSources(
  sources: readonly ActiveBuildDrawFundingSource[],
  amountCents: number,
): ActiveBuildDrawSourceAllocation[] {
  let remainingCents = amountCents;
  const allocations: ActiveBuildDrawSourceAllocation[] = [];
  for (const source of sources) {
    if (remainingCents <= 0) {
      break;
    }
    const allocatedCents = Math.min(source.availableCents, remainingCents);
    if (allocatedCents <= 0) {
      continue;
    }
    allocations.push({
      amountCents: allocatedCents,
      buildMilestoneId: source.buildMilestoneId,
      drawGroupKey: source.drawGroupKey,
      milestoneKey: source.milestoneKey,
      milestoneName: source.milestoneName,
      sourceOrder: source.sourceOrder,
    });
    remainingCents -= allocatedCents;
  }
  if (remainingCents !== 0) {
    throw new Error(
      "Draw attribution integrity failure: available source buckets do not cover the requested amount.",
    );
  }
  return allocations;
}

export async function activeBuildDrawAllocationViews(
  ctx: QueryCtx | MutationCtx,
  drawRequestId: Id<"activeBuildDrawRequests">,
) {
  const allocations = await ctx.db
    .query("activeBuildDrawRequestAllocations")
    .withIndex("by_request", (q) => q.eq("drawRequestId", drawRequestId))
    .take(256);
  const milestoneIds = allocations.map(
    (allocation) => allocation.buildMilestoneId,
  );
  const milestoneRows = await Promise.all(
    milestoneIds.map((milestoneId) => ctx.db.get(milestoneId)),
  );
  const milestoneNameById = new Map(
    milestoneRows
      .filter((milestone): milestone is Doc<"buildMilestones"> =>
        Boolean(milestone),
      )
      .map((milestone) => [String(milestone._id), milestone.name]),
  );
  return allocations
    .slice()
    .sort(
      (a, b) =>
        a.sourceOrder - b.sourceOrder ||
        a.milestoneKey.localeCompare(b.milestoneKey),
    )
    .map((allocation) => ({
      amountCents: allocation.amountCents,
      drawGroupKey: allocation.drawGroupKey,
      milestoneKey: allocation.milestoneKey,
      milestoneName:
        milestoneNameById.get(String(allocation.buildMilestoneId)) ??
        allocation.milestoneKey,
      sourceOrder: allocation.sourceOrder,
    }));
}
