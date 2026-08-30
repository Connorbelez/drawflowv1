import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import {
  MAX_CONTRACTOR_ASSIGNMENT_ROWS,
  MAX_CONTRACTOR_PROFILE_ROWS,
  MAX_COST_DOCUMENT_ALLOCATION_ROWS,
  type CostDocumentContractorScopePurpose,
  type CurrentCostDocumentContractorScope,
} from "./contracts";

export async function requireCurrentContractorCostDocumentScope(
  ctx: QueryCtx | MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    purpose: CostDocumentContractorScopePurpose;
    workosUserId: string;
  }
): Promise<CurrentCostDocumentContractorScope> {
  const scope = await resolveCurrentContractorCostDocumentScope(ctx, input);
  if (!scope) {
    throw new Error("The Cost Document contractor assignment is unavailable.");
  }
  return scope;
}

/**
 * Enforces every persisted or proposed Cost Allocation against a current
 * Contractor assignment. It is intentionally a no-op for a creator who is
 * not linked to a Contractor profile in this Build; that keeps existing
 * Builder/Homeowner Cost Documents unchanged while preventing a Contractor
 * draft from being widened through a Builder-side collaborator.
 */
export async function assertCurrentCostDocumentAllocationScope(
  ctx: QueryCtx | MutationCtx,
  input: {
    allocationSubmilestoneIds: Id<"buildSubmilestones">[];
    authorization: ActiveBuildAuthorization;
    contractorProfileId?: Id<"contractorProfiles">;
    ownerWorkosUserId: string;
    purpose: CostDocumentContractorScopePurpose;
  }
) {
  if (!input.contractorProfileId) {
    return;
  }
  const contractor = await requireExactContractorProfileProvenance(ctx, {
    authorization: input.authorization,
    contractorProfileId: input.contractorProfileId,
    ownerWorkosUserId: input.ownerWorkosUserId,
  });
  const scope = await resolveCurrentContractorCostDocumentScope(ctx, {
    authorization: input.authorization,
    purpose: input.purpose,
    workosUserId: input.ownerWorkosUserId,
  });
  if (!scope) {
    throw new Error("The Cost Document contractor assignment is unavailable.");
  }
  if (scope.contractorId !== contractor._id) {
    throw new Error("The Cost Document contractor assignment is unavailable.");
  }
  if (
    !hasCurrentCostDocumentAllocationScope(
      scope,
      input.allocationSubmilestoneIds
    )
  ) {
    throw new Error("The Cost Document contractor assignment is unavailable.");
  }
}

export async function assertCurrentCostDocumentBatchOwnerScope(
  ctx: QueryCtx | MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    batch: Doc<"costDocumentBatches">;
  }
) {
  if (!input.batch.contractorProfileId) {
    return;
  }
  const contractor = await requireExactContractorProfileProvenance(ctx, {
    authorization: input.authorization,
    contractorProfileId: input.batch.contractorProfileId,
    ownerWorkosUserId: input.batch.ownerWorkosUserId,
  });
  const scope = await requireCurrentContractorCostDocumentScope(ctx, {
    authorization: input.authorization,
    purpose: "draft.write",
    workosUserId: input.batch.ownerWorkosUserId,
  });
  if (scope.contractorId !== contractor._id) {
    throw new Error("The Cost Document contractor assignment is unavailable.");
  }
}

export async function assertCurrentCostDocumentDraftScope(
  ctx: QueryCtx | MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    draft: Doc<"costDocumentDrafts">;
  }
) {
  if (!input.draft.contractorProfileId) {
    return;
  }
  await requireExactContractorProfileProvenance(ctx, {
    authorization: input.authorization,
    contractorProfileId: input.draft.contractorProfileId,
    ownerWorkosUserId: input.draft.ownerWorkosUserId,
  });
  const allocations = await ctx.db
    .query("costDocumentDraftAllocations")
    .withIndex("by_draftId_and_order", (query) =>
      query.eq("draftId", input.draft._id)
    )
    .take(MAX_COST_DOCUMENT_ALLOCATION_ROWS + 1);
  if (allocations.length > MAX_COST_DOCUMENT_ALLOCATION_ROWS) {
    throw new Error("The Cost Document draft is unavailable.");
  }
  for (const allocation of allocations) {
    if (
      allocation.batchId !== input.draft.batchId ||
      allocation.organizationId !== input.authorization.organizationId ||
      allocation.brokerageId !== input.authorization.brokerage._id ||
      allocation.buildId !== input.authorization.build._id
    ) {
      throw new Error("The Cost Document draft is unavailable.");
    }
  }
  await assertCurrentCostDocumentAllocationScope(ctx, {
    allocationSubmilestoneIds: allocations.map(
      (allocation) => allocation.buildSubmilestoneId
    ),
    authorization: input.authorization,
    contractorProfileId: input.draft.contractorProfileId,
    ownerWorkosUserId: input.draft.ownerWorkosUserId,
    purpose: "draft.write",
  });
}

export async function canReadOwnSubmittedContractorCostDocument(
  ctx: QueryCtx | MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    contractorScope?: CurrentCostDocumentContractorScope;
    document: Doc<"costDocuments">;
  }
) {
  try {
    if (!input.document.contractorProfileId) {
      return false;
    }
    const contractor = await requireExactContractorProfileProvenance(ctx, {
      authorization: input.authorization,
      contractorProfileId: input.document.contractorProfileId,
      ownerWorkosUserId: input.document.uploaderWorkosUserId,
    });
    const allocations = await ctx.db
      .query("costDocumentAllocations")
      .withIndex("by_costDocumentId_and_order", (query) =>
        query.eq("costDocumentId", input.document._id)
      )
      .take(MAX_COST_DOCUMENT_ALLOCATION_ROWS + 1);
    if (
      allocations.length === 0 ||
      allocations.length > MAX_COST_DOCUMENT_ALLOCATION_ROWS
    ) {
      return false;
    }
    for (const allocation of allocations) {
      if (
        allocation.organizationId !== input.authorization.organizationId ||
        allocation.brokerageId !== input.authorization.brokerage._id ||
        allocation.buildId !== input.authorization.build._id
      ) {
        return false;
      }
    }
    const allocationSubmilestoneIds = allocations.map(
      (allocation) => allocation.buildSubmilestoneId
    );
    if (input.contractorScope) {
      return (
        input.contractorScope.contractorId === contractor._id &&
        hasCurrentCostDocumentAllocationScope(
          input.contractorScope,
          allocationSubmilestoneIds
        )
      );
    }
    await assertCurrentCostDocumentAllocationScope(ctx, {
      allocationSubmilestoneIds,
      authorization: input.authorization,
      contractorProfileId: input.document.contractorProfileId,
      ownerWorkosUserId: input.document.uploaderWorkosUserId,
      purpose: "submitted.read",
    });
    return true;
  } catch {
    // Submitted-document lookup and asset status must remain non-enumerating
    // after normal completion, security removal, or a forged child graph.
    return false;
  }
}

async function resolveCurrentContractorCostDocumentScope(
  ctx: QueryCtx | MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    purpose: CostDocumentContractorScopePurpose;
    workosUserId: string;
  }
): Promise<CurrentCostDocumentContractorScope | null> {
  const contractor = await resolveLinkedContractorProfile(ctx, {
    authorization: input.authorization,
    workosUserId: input.workosUserId,
  });
  if (!contractor || contractor.status !== "active") {
    return null;
  }
  const parentAssignments = await ctx.db
    .query("buildContractorAssignments")
    .withIndex("by_build_contractor", (query) =>
      query
        .eq("buildId", input.authorization.build._id)
        .eq("contractorId", contractor._id)
    )
    .take(MAX_CONTRACTOR_ASSIGNMENT_ROWS + 1);
  if (parentAssignments.length > MAX_CONTRACTOR_ASSIGNMENT_ROWS) {
    return null;
  }
  const currentParentAssignmentIds = new Set(
    parentAssignments
      .filter(
        (assignment) =>
          assignment.organizationId === input.authorization.organizationId &&
          assignment.brokerageId === input.authorization.brokerage._id &&
          // `status` was added as optional for legacy assignments. An absent
          // status therefore retains the established active default; only an
          // explicit inactive parent revokes this Build boundary.
          assignment.status !== "inactive"
      )
      .map((assignment) => assignment._id)
  );
  if (currentParentAssignmentIds.size === 0) {
    return null;
  }
  const scopedAssignments = await ctx.db
    .query("milestoneContractorAssignments")
    .withIndex("by_contractor_build", (query) =>
      query
        .eq("contractorId", contractor._id)
        .eq("buildId", input.authorization.build._id)
    )
    .take(MAX_CONTRACTOR_ASSIGNMENT_ROWS + 1);
  if (scopedAssignments.length > MAX_CONTRACTOR_ASSIGNMENT_ROWS) {
    return null;
  }
  const qualifyingSubmilestoneIds = new Set<Id<"buildSubmilestones">>();
  for (const assignment of scopedAssignments) {
    if (
      assignment.organizationId !== input.authorization.organizationId ||
      assignment.brokerageId !== input.authorization.brokerage._id ||
      !currentParentAssignmentIds.has(assignment.buildContractorAssignmentId) ||
      !assignment.buildSubmilestoneId ||
      !isContractorAssignmentCurrentForCostDocuments(
        assignment.status,
        input.purpose
      )
    ) {
      continue;
    }
    const [milestone, submilestone] = await Promise.all([
      ctx.db.get(assignment.buildMilestoneId),
      ctx.db.get(assignment.buildSubmilestoneId),
    ]);
    if (
      !(milestone && submilestone) ||
      milestone.organizationId !== input.authorization.organizationId ||
      milestone.brokerageId !== input.authorization.brokerage._id ||
      milestone.buildId !== input.authorization.build._id ||
      milestone._id !== submilestone.buildMilestoneId ||
      milestone.key !== assignment.milestoneKey ||
      submilestone.organizationId !== input.authorization.organizationId ||
      submilestone.brokerageId !== input.authorization.brokerage._id ||
      submilestone.buildId !== input.authorization.build._id ||
      submilestone.milestoneKey !== assignment.milestoneKey ||
      submilestone.key !== assignment.submilestoneKey
    ) {
      continue;
    }
    qualifyingSubmilestoneIds.add(submilestone._id);
  }
  if (qualifyingSubmilestoneIds.size === 0) {
    return null;
  }
  return {
    contractorId: contractor._id,
    qualifyingSubmilestoneIds: [...qualifyingSubmilestoneIds],
    workosUserId: input.workosUserId,
  };
}

function hasCurrentCostDocumentAllocationScope(
  scope: CurrentCostDocumentContractorScope,
  allocationSubmilestoneIds: Id<"buildSubmilestones">[]
) {
  const qualifyingSubmilestoneIds = new Set(scope.qualifyingSubmilestoneIds);
  return allocationSubmilestoneIds.every((submilestoneId) =>
    qualifyingSubmilestoneIds.has(submilestoneId)
  );
}

async function resolveLinkedContractorProfile(
  ctx: QueryCtx | MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    workosUserId: string;
  }
): Promise<Doc<"contractorProfiles"> | null> {
  const profiles = await ctx.db
    .query("contractorProfiles")
    .withIndex("by_account_user", (query) =>
      query.eq("accountWorkosUserId", input.workosUserId)
    )
    .take(MAX_CONTRACTOR_PROFILE_ROWS + 1);
  if (profiles.length > MAX_CONTRACTOR_PROFILE_ROWS) {
    throw new Error("The Cost Document contractor assignment is unavailable.");
  }
  const matchingProfiles = profiles.filter(
    (profile) =>
      profile.organizationId === input.authorization.organizationId &&
      profile.brokerageId === input.authorization.brokerage._id
  );
  if (matchingProfiles.length === 0) {
    return null;
  }
  if (matchingProfiles.length !== 1) {
    throw new Error("The Cost Document contractor assignment is unavailable.");
  }
  return matchingProfiles[0] ?? null;
}

async function requireExactContractorProfileProvenance(
  ctx: QueryCtx | MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    contractorProfileId: Id<"contractorProfiles">;
    ownerWorkosUserId: string;
  }
) {
  const profile = await ctx.db.get(input.contractorProfileId);
  if (
    !profile ||
    profile.organizationId !== input.authorization.organizationId ||
    profile.brokerageId !== input.authorization.brokerage._id ||
    profile.accountWorkosUserId !== input.ownerWorkosUserId ||
    profile.status !== "active"
  ) {
    throw new Error("The Cost Document contractor assignment is unavailable.");
  }
  return profile;
}

function isContractorAssignmentCurrentForCostDocuments(
  status: Doc<"milestoneContractorAssignments">["status"],
  purpose: CostDocumentContractorScopePurpose
) {
  return (
    status === "active" ||
    (purpose === "submitted.read" && status === "completed")
  );
}
