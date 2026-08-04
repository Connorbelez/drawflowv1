import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
  selectActiveBuildAuthorizationCapacity,
} from "./activeBuildAccess";
import type { AuthorizedViewer } from "./authz";
import type { BuildCollaborationRole } from "./build_collaboration_model";
import { assertOrganizationRetentionWritable } from "./data_retention";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_DRAFT_COLLABORATION_EVENTS = 250;
const MAX_CONTRACTOR_ASSIGNMENT_ROWS = 200;
const MAX_CONTRACTOR_PROFILE_ROWS = 20;
const MAX_COST_DOCUMENT_ALLOCATION_ROWS = 100;

export type CostDocumentIntent =
  | "create"
  | "draft.read"
  | "draft.edit"
  | "batch.submit"
  | "submitted.list"
  | "submitted.read"
  | "asset.read";

export type CostDocumentActorCapacity = BuildCollaborationRole;

export type CostDocumentDraftAccessMode = "creator" | "collaborator";

type CostDocumentAccessCtx = (QueryCtx | MutationCtx) & {
  viewer: AuthorizedViewer;
};

export interface CostDocumentDraftAuthorization {
  authorization: ActiveBuildAuthorization;
  batch: Doc<"costDocumentBatches">;
  draft: Doc<"costDocumentDrafts">;
  mode: CostDocumentDraftAccessMode;
}

export interface CostDocumentDraftCapabilities {
  canDiscardBatch: boolean;
  canEditDraft: boolean;
  canManageDraftCollaboration: boolean;
  canManageSourcePages: boolean;
  canReadDraft: boolean;
  canSubmitBatch: boolean;
}

export interface CostDocumentCollaboratorProjection {
  displayName: string;
  role: "builder" | "builder-staff";
  workosUserId: string;
}

export interface CurrentCostDocumentCollaboratorProjection
  extends CostDocumentCollaboratorProjection {
  grantedAt: number;
}

/**
 * A Contractor Cost Document may only target the Sub-milestones held by the
 * linked Contractor profile at the moment an operation is authorized. A
 * completed scoped assignment remains readable for that Contractor's own
 * submitted records, but never authorizes a new or revised Draft.
 */
export type CostDocumentContractorScopePurpose =
  | "draft.write"
  | "submitted.read";

export interface CurrentCostDocumentContractorScope {
  contractorId: Id<"contractorProfiles">;
  qualifyingSubmilestoneIds: Id<"buildSubmilestones">[];
  workosUserId: string;
}

/**
 * The only role-to-intent boundary for Cost Documents. Target-specific guards
 * below decide whether a caller is the creator or holds an exact active Draft
 * grant; this function never treats a Build role as draft-wide access.
 */
export async function authorizeCostDocumentIntent(
  ctx: CostDocumentAccessCtx,
  input: {
    actorCapacity?: CostDocumentActorCapacity;
    buildId: Id<"activeBuilds">;
    intent: CostDocumentIntent;
    organizationId: string;
  }
) {
  const baseAuthorization = await authorizeActiveBuildAccess(ctx, {
    backofficePolicy: "proposal-read",
    buildId: input.buildId,
    organizationId: input.organizationId,
  });
  let authorization: ActiveBuildAuthorization;
  try {
    authorization = selectActiveBuildAuthorizationCapacity(
      baseAuthorization,
      input.actorCapacity
    );
  } catch {
    throw new Error("The Cost Document is unavailable.");
  }
  if (authorization.viewer.actorKind !== "human") {
    throw new Error("The Cost Document is unavailable.");
  }

  if (
    input.intent === "create" ||
    input.intent === "draft.edit" ||
    input.intent === "batch.submit"
  ) {
    await assertOrganizationRetentionWritable(
      ctx,
      authorization.organizationId
    );
  }

  if (input.intent === "submitted.list" || input.intent === "submitted.read") {
    if (!canAccessSubmittedCostDocuments(authorization)) {
      throw new Error("The Cost Document is unavailable.");
    }
    return authorization;
  }

  if (input.intent === "asset.read") {
    // The exact Draft/document boundary below decides whether this is a
    // draft-collaboration read or a submitted-document read.
    return authorization;
  }

  if (authorization.effectiveRole.role === "contractor") {
    // A new Batch has no allocations yet, so creation still has to prove that
    // the Contractor currently owns at least one concrete Sub-milestone. The
    // exact allocation assertion below is repeated on every material Draft
    // mutation and submission.
    await requireCurrentContractorCostDocumentScope(ctx, {
      authorization,
      purpose: "draft.write",
      workosUserId: authorization.viewer.subject,
    });
  }

  if (!canCreateOrCollaborateOnDrafts(authorization)) {
    throw new Error("The Cost Document draft is unavailable.");
  }
  return authorization;
}

export async function requireCostDocumentDraftAccess(
  ctx: CostDocumentAccessCtx,
  input: {
    actorCapacity?: CostDocumentActorCapacity;
    draftId: Id<"costDocumentDrafts">;
    intent: "draft.read" | "draft.edit" | "asset.read";
  }
): Promise<CostDocumentDraftAuthorization> {
  const draft = await ctx.db.get(input.draftId);
  const batch = draft ? await ctx.db.get(draft.batchId) : null;
  if (!(draft && batch)) {
    throw new Error("The Cost Document draft is unavailable.");
  }
  const authorization = await authorizeCostDocumentIntent(ctx, {
    buildId: draft.buildId,
    actorCapacity: input.actorCapacity,
    intent: input.intent,
    organizationId: draft.organizationId,
  });
  assertCostDocumentDraftGraph(draft, batch, authorization);
  if (batch.state !== "active" || draft.lifecycle === "submitted") {
    throw new Error("The Cost Document draft is unavailable.");
  }
  await assertCurrentCostDocumentDraftScope(ctx, { authorization, draft });

  // `asset.read` deliberately admits every current Build participant at the
  // top-level intent boundary because a published Cost Document page has a
  // broader submitted-document audience. Once the asset resolves to a Draft,
  // however, it is governed by the same creator/exact-grant boundary as every
  // other draft read. Do not let a former creator retain private source-page
  // access merely because their current Build role can read submitted records.
  if (!canCreateOrCollaborateOnDrafts(authorization)) {
    throw new Error("The Cost Document draft is unavailable.");
  }

  if (isDraftCreator(draft, batch, authorization)) {
    return { authorization, batch, draft, mode: "creator" };
  }

  if (
    !(
      isBuilderCollaboratorRole(authorization.effectiveRole.role) &&
      (await hasCurrentDraftCollaborationGrant(ctx, {
        draft,
        workosUserId: authorization.viewer.subject,
      }))
    )
  ) {
    throw new Error("The Cost Document draft is unavailable.");
  }
  return { authorization, batch, draft, mode: "collaborator" };
}

/**
 * Resolves an exact-Draft audience from an already-authorized current Build
 * participant. This is intentionally non-throwing so asset/status callers can
 * fail closed without converting a revoked grant into a generic session-owner
 * fallback. Public Cost Document mutations still use requireCostDocumentDraftAccess
 * above, which reauthorizes the Build itself on every operation.
 */
export async function resolveCostDocumentDraftAccessForAuthorization(
  ctx: QueryCtx | MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    draftId: Id<"costDocumentDrafts">;
  }
): Promise<CostDocumentDraftAuthorization | null> {
  const draft = await ctx.db.get(input.draftId);
  const batch = draft ? await ctx.db.get(draft.batchId) : null;
  let authorization = input.authorization;
  if (
    !(draft && batch) ||
    batch.state !== "active" ||
    draft.lifecycle === "submitted"
  ) {
    return null;
  }
  try {
    if (batch.ownerWorkosUserId === authorization.viewer.subject) {
      authorization = selectActiveBuildAuthorizationCapacity(
        authorization,
        currentCostDocumentBatchCreatorCapacity(batch, authorization)
      );
    } else if (authorization.roles.includes("builder")) {
      authorization = selectActiveBuildAuthorizationCapacity(
        authorization,
        "builder"
      );
    } else if (authorization.roles.includes("builder-staff")) {
      authorization = selectActiveBuildAuthorizationCapacity(
        authorization,
        "builder-staff"
      );
    }
  } catch {
    return null;
  }
  if (!canCreateOrCollaborateOnDrafts(authorization)) {
    return null;
  }
  try {
    assertCostDocumentDraftGraph(draft, batch, authorization);
    await assertCurrentCostDocumentDraftScope(ctx, {
      authorization,
      draft,
    });
  } catch {
    return null;
  }
  if (isDraftCreator(draft, batch, authorization)) {
    return {
      authorization,
      batch,
      draft,
      mode: "creator",
    };
  }
  if (
    !(
      isBuilderCollaboratorRole(authorization.effectiveRole.role) &&
      (await hasCurrentDraftCollaborationGrant(ctx, {
        draft,
        workosUserId: input.authorization.viewer.subject,
      }))
    )
  ) {
    return null;
  }
  return {
    authorization,
    batch,
    draft,
    mode: "collaborator",
  };
}

export async function requireCostDocumentBatchCreator(
  ctx: CostDocumentAccessCtx,
  input: {
    actorCapacity?: CostDocumentActorCapacity;
    batchId: Id<"costDocumentBatches">;
    intent: "create" | "draft.read" | "batch.submit";
  }
) {
  const batch = await ctx.db.get(input.batchId);
  if (!batch) {
    throw new Error("The Cost Document batch is unavailable.");
  }
  const authorization = await authorizeCostDocumentIntent(ctx, {
    buildId: batch.buildId,
    actorCapacity: input.actorCapacity,
    intent: input.intent,
    organizationId: batch.organizationId,
  });
  assertCostDocumentBatchScope(batch, authorization);
  if (batch.ownerWorkosUserId !== authorization.viewer.subject) {
    throw new Error("The Cost Document batch is unavailable.");
  }
  if (
    currentCostDocumentBatchCreatorCapacity(batch, authorization) !==
    authorization.effectiveRole.role
  ) {
    throw new Error("The Cost Document batch is unavailable.");
  }
  await assertCurrentCostDocumentBatchOwnerScope(ctx, {
    authorization,
    batch,
  });
  return { authorization, batch };
}

export async function requireCostDocumentDraftCreator(
  ctx: CostDocumentAccessCtx,
  input: {
    actorCapacity?: CostDocumentActorCapacity;
    draftId: Id<"costDocumentDrafts">;
    intent: "draft.read" | "draft.edit" | "batch.submit";
  }
) {
  const access = await requireCostDocumentDraftAccess(ctx, {
    actorCapacity: input.actorCapacity,
    draftId: input.draftId,
    intent: input.intent === "batch.submit" ? "draft.edit" : input.intent,
  });
  if (access.mode !== "creator") {
    throw new Error("The Cost Document draft is unavailable.");
  }
  return access;
}

export function currentCostDocumentDraftRevision(
  draft: Pick<Doc<"costDocumentDrafts">, "revision">
) {
  return draft.revision ?? 1;
}

export function currentCostDocumentBatchRevision(
  batch: Pick<Doc<"costDocumentBatches">, "revision">
) {
  return batch.revision ?? 1;
}

export function assertExpectedCostDocumentDraftRevision(
  draft: Pick<Doc<"costDocumentDrafts">, "revision">,
  expectedRevision: number
) {
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 1 ||
    currentCostDocumentDraftRevision(draft) !== expectedRevision
  ) {
    throw new Error(
      "Draft revision conflict: this Cost Document changed while you were editing. Your draft was preserved; review the latest version and retry."
    );
  }
}

export function assertExpectedCostDocumentBatchRevision(
  batch: Pick<Doc<"costDocumentBatches">, "revision">,
  expectedRevision: number
) {
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 1 ||
    currentCostDocumentBatchRevision(batch) !== expectedRevision
  ) {
    throw new Error(
      "Batch revision conflict: this Cost Document batch changed while you were editing. Review the latest batch and retry."
    );
  }
}

export function costDocumentDraftCapabilities(
  access: Pick<
    CostDocumentDraftAuthorization,
    "authorization" | "batch" | "draft" | "mode"
  >
): CostDocumentDraftCapabilities {
  const editable =
    access.batch.state === "active" && access.draft.lifecycle === "draft";
  const creator = access.mode === "creator";
  return {
    canDiscardBatch: creator && access.batch.state === "active",
    canEditDraft: editable,
    // Every eligible creator can invite only the Builder-side collaborators
    // resolved below. The grant never widens the creator's allocation scope or
    // changes authorship/provenance.
    canManageDraftCollaboration:
      creator &&
      editable &&
      canManageCostDocumentDraftCollaboration(access.authorization),
    canManageSourcePages:
      editable && access.draft.activeStep === "capture_confirm",
    canReadDraft: true,
    canSubmitBatch: creator && access.batch.state === "active",
  };
}

export async function listEligibleCostDocumentDraftCollaborators(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization
): Promise<CostDocumentCollaboratorProjection[]> {
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder", (query) =>
      query.eq("builderProfileId", authorization.build.builderProfileId)
    )
    .take(201);
  if (links.length > 200) {
    throw new Error("Cost Document collaboration eligibility is unavailable.");
  }
  const participantNames = new Map(
    authorization.participants.map((participant) => [
      participant.workosUserId,
      participant.displayName,
    ])
  );
  const collaborators: CostDocumentCollaboratorProjection[] = [];
  for (const link of links) {
    if (
      link.status !== "active" ||
      link.brokerageId !== authorization.brokerage._id ||
      (await hasRemovedBuildParticipation(ctx, {
        buildId: authorization.build._id,
        workosUserId: link.workosUserId,
      }))
    ) {
      continue;
    }
    if (link.role === "staff") {
      const grants = await ctx.db
        .query("builderStaffPermissionGrants")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query
            .eq("buildId", authorization.build._id)
            .eq("workosUserId", link.workosUserId)
        )
        .take(101);
      if (
        grants.length > 100 ||
        !grants.some(
          (grant) =>
            grant.organizationId === authorization.organizationId &&
            grant.brokerageId === authorization.brokerage._id &&
            grant.builderAccountLinkId === link._id &&
            (grant.canCreate ||
              grant.canDelete ||
              grant.canUpdate ||
              grant.canView)
        )
      ) {
        continue;
      }
    }
    collaborators.push({
      displayName:
        participantNames.get(link.workosUserId) ??
        link.assignedEmail ??
        link.workosUserId,
      role: link.role === "owner" ? "builder" : "builder-staff",
      workosUserId: link.workosUserId,
    });
  }
  return collaborators.sort(
    (left, right) =>
      left.displayName.localeCompare(right.displayName) ||
      left.workosUserId.localeCompare(right.workosUserId)
  );
}

export async function listCurrentCostDocumentDraftCollaborators(
  ctx: QueryCtx | MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    draft: Doc<"costDocumentDrafts">;
  }
): Promise<CurrentCostDocumentCollaboratorProjection[]> {
  if (input.draft.lifecycle === "submitted") {
    return [];
  }
  const events = await ctx.db
    .query("costDocumentDraftCollaborationEvents")
    .withIndex("by_draftId_and_draftRevision", (query) =>
      query.eq("draftId", input.draft._id)
    )
    .order("desc")
    .take(MAX_DRAFT_COLLABORATION_EVENTS + 1);
  if (events.length > MAX_DRAFT_COLLABORATION_EVENTS) {
    throw new Error("Cost Document collaboration history is unavailable.");
  }
  const latestByCollaborator = new Map<
    string,
    Doc<"costDocumentDraftCollaborationEvents">
  >();
  for (const event of events) {
    if (!latestByCollaborator.has(event.collaboratorWorkosUserId)) {
      latestByCollaborator.set(event.collaboratorWorkosUserId, event);
    }
  }
  const eligibleById = new Map(
    (
      await listEligibleCostDocumentDraftCollaborators(ctx, input.authorization)
    ).map((collaborator) => [collaborator.workosUserId, collaborator])
  );
  return [...latestByCollaborator.values()]
    .filter((event) => event.eventType === "granted")
    .map((event) => {
      const eligible = eligibleById.get(event.collaboratorWorkosUserId);
      return eligible ? { ...eligible, grantedAt: event.createdAt } : null;
    })
    .filter(
      (
        collaborator
      ): collaborator is CurrentCostDocumentCollaboratorProjection =>
        collaborator !== null
    )
    .sort(
      (left, right) =>
        left.displayName.localeCompare(right.displayName) ||
        left.workosUserId.localeCompare(right.workosUserId)
    );
}

export async function requireEligibleCostDocumentDraftCollaborator(
  ctx: QueryCtx | MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    creatorWorkosUserId: string;
    collaboratorWorkosUserId: string;
  }
) {
  if (input.collaboratorWorkosUserId === input.creatorWorkosUserId) {
    throw new Error("The Cost Document collaborator is unavailable.");
  }
  const collaborator = (
    await listEligibleCostDocumentDraftCollaborators(ctx, input.authorization)
  ).find(
    (candidate) => candidate.workosUserId === input.collaboratorWorkosUserId
  );
  if (!collaborator) {
    throw new Error("The Cost Document collaborator is unavailable.");
  }
  return collaborator;
}

export async function hasCurrentDraftCollaborationGrant(
  ctx: QueryCtx | MutationCtx,
  input: {
    draft: Doc<"costDocumentDrafts">;
    workosUserId: string;
  }
) {
  const latest = await ctx.db
    .query("costDocumentDraftCollaborationEvents")
    .withIndex(
      "by_draftId_and_collaboratorWorkosUserId_and_draftRevision",
      (query) =>
        query
          .eq("draftId", input.draft._id)
          .eq("collaboratorWorkosUserId", input.workosUserId)
    )
    .order("desc")
    .first();
  return Boolean(
    latest &&
      latest.eventType === "granted" &&
      latest.organizationId === input.draft.organizationId &&
      latest.brokerageId === input.draft.brokerageId &&
      latest.buildId === input.draft.buildId &&
      latest.batchId === input.draft.batchId &&
      latest.creatorWorkosUserId === input.draft.ownerWorkosUserId
  );
}

/**
 * Resolves the current Contractor scope for an exact WorkOS identity. This is
 * deliberately exported as the single reusable authorization seam for a
 * future submitted-correction endpoint: ENG-392 must call it (and the exact
 * allocation assertion below) rather than reproduce assignment logic. There
 * is no submitted-correction create API in this module today.
 */
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

async function assertCurrentCostDocumentBatchOwnerScope(
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

async function assertCurrentCostDocumentDraftScope(
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

async function canReadOwnSubmittedContractorCostDocument(
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

export async function canReadSubmittedCostDocument(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  document: Doc<"costDocuments">,
  contractorScope?: CurrentCostDocumentContractorScope
): Promise<boolean> {
  if (!isCostDocumentInScope(document, authorization)) {
    return false;
  }
  const role = authorization.effectiveRole.role;
  if (role === "admin") {
    return true;
  }
  if (
    role === "principle-broker" ||
    role === "broker" ||
    role === "broker-staff" ||
    role === "builder" ||
    role === "builder-staff"
  ) {
    return true;
  }
  if (role === "homeowner") {
    // The dedicated governed submission flow remains visible to its Homeowner
    // submitter. Other commercial records require an explicit collaboration
    // share; until that canonical reference exists they must be absent from
    // list, count, search, exact retrieval, and asset delivery.
    return document.uploaderWorkosUserId === authorization.viewer.subject;
  }
  if (
    role !== "contractor" ||
    document.uploaderWorkosUserId !== authorization.viewer.subject
  ) {
    return false;
  }
  const reusableContractorScope =
    contractorScope?.workosUserId === authorization.viewer.subject &&
    contractorScope.workosUserId === document.uploaderWorkosUserId
      ? contractorScope
      : undefined;
  return await canReadOwnSubmittedContractorCostDocument(ctx, {
    authorization,
    contractorScope: reusableContractorScope,
    document,
  });
}

export function canAccessSubmittedCostDocuments(
  authorization: ActiveBuildAuthorization
) {
  return [
    "admin",
    "principle-broker",
    "broker",
    "broker-staff",
    "builder",
    "builder-staff",
    "homeowner",
    "contractor",
  ].includes(authorization.effectiveRole.role);
}

export function isCostDocumentInScope(
  document: Doc<"costDocuments"> | null,
  authorization: ActiveBuildAuthorization
): document is Doc<"costDocuments"> {
  return Boolean(
    document &&
      document.organizationId === authorization.organizationId &&
      document.brokerageId === authorization.brokerage._id &&
      document.buildId === authorization.build._id
  );
}

function canCreateOrCollaborateOnDrafts(
  authorization: ActiveBuildAuthorization
) {
  return (
    authorization.effectiveRole.role === "builder" ||
    authorization.effectiveRole.role === "builder-staff" ||
    authorization.effectiveRole.role === "homeowner" ||
    authorization.effectiveRole.role === "contractor"
  );
}

/**
 * Draft sharing is intentionally never a Contractor-to-Contractor or
 * organization-wide capability. The eligible-recipient resolver remains
 * Builder-owner / Builder-staff only; this gate simply lets a qualifying
 * Contractor creator manage those exact grants.
 */
export function canManageCostDocumentDraftCollaboration(
  authorization: ActiveBuildAuthorization
) {
  return (
    isBuilderCollaboratorRole(authorization.effectiveRole.role) ||
    authorization.effectiveRole.role === "homeowner" ||
    authorization.effectiveRole.role === "contractor"
  );
}

function isBuilderCollaboratorRole(role: BuildCollaborationRole) {
  return role === "builder" || role === "builder-staff";
}

function isDraftCreator(
  draft: Doc<"costDocumentDrafts">,
  batch: Doc<"costDocumentBatches">,
  authorization: ActiveBuildAuthorization
) {
  return (
    draft.ownerWorkosUserId === authorization.viewer.subject &&
    batch.ownerWorkosUserId === authorization.viewer.subject &&
    currentCostDocumentBatchCreatorCapacity(batch, authorization) ===
      authorization.effectiveRole.role
  );
}

export function currentCostDocumentBatchCreatorCapacity(
  batch: Pick<
    Doc<"costDocumentBatches">,
    "contractorProfileId" | "creatorCapacity"
  >,
  authorization: ActiveBuildAuthorization
): BuildCollaborationRole | undefined {
  if (batch.creatorCapacity === "contractor" && !batch.contractorProfileId) {
    return;
  }
  if (batch.creatorCapacity) {
    return batch.creatorCapacity;
  }
  if (batch.contractorProfileId) {
    return "contractor";
  }
  if (authorization.roles.includes("builder")) {
    return "builder";
  }
  if (authorization.roles.includes("builder-staff")) {
    return "builder-staff";
  }
  if (authorization.roles.includes("homeowner")) {
    return "homeowner";
  }
  return;
}

function assertCostDocumentBatchScope(
  batch: Doc<"costDocumentBatches">,
  authorization: ActiveBuildAuthorization
) {
  if (
    batch.organizationId !== authorization.organizationId ||
    batch.brokerageId !== authorization.brokerage._id ||
    batch.buildId !== authorization.build._id
  ) {
    throw new Error("The Cost Document batch is unavailable.");
  }
}

function assertCostDocumentDraftGraph(
  draft: Doc<"costDocumentDrafts">,
  batch: Doc<"costDocumentBatches">,
  authorization: ActiveBuildAuthorization
) {
  if (
    draft.batchId !== batch._id ||
    draft.organizationId !== authorization.organizationId ||
    draft.brokerageId !== authorization.brokerage._id ||
    draft.buildId !== authorization.build._id ||
    batch.organizationId !== draft.organizationId ||
    batch.brokerageId !== draft.brokerageId ||
    batch.buildId !== draft.buildId ||
    batch.ownerWorkosUserId !== draft.ownerWorkosUserId ||
    batch.contractorProfileId !== draft.contractorProfileId
  ) {
    throw new Error("The Cost Document draft is unavailable.");
  }
}

async function hasRemovedBuildParticipation(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    workosUserId: string;
  }
) {
  const latest = await ctx.db
    .query("buildParticipants")
    .withIndex("by_buildId_and_workosUserId_and_participationPeriod", (query) =>
      query.eq("buildId", input.buildId).eq("workosUserId", input.workosUserId)
    )
    .order("desc")
    .first();
  return latest?.status === "removed";
}
