import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
  selectActiveBuildAuthorizationCapacity,
} from "../activeBuildAccess";
import type { AuthorizedViewer } from "../authz";
import { assertOrganizationRetentionWritable } from "../data_retention";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import {
  MAX_DRAFT_COLLABORATION_EVENTS,
  type CostDocumentAccessCtx,
  type CostDocumentActorCapacity,
  type CostDocumentCollaboratorProjection,
  type CostDocumentContractorScopePurpose,
  type CostDocumentDraftAccessMode,
  type CostDocumentDraftAuthorization,
  type CurrentCostDocumentCollaboratorProjection,
  type CostDocumentIntent,
} from "./contracts";
import {
  assertCurrentCostDocumentAllocationScope,
  assertCurrentCostDocumentBatchOwnerScope,
  assertCurrentCostDocumentDraftScope,
  requireCurrentContractorCostDocumentScope,
} from "./scope";
import {
  canAccessSubmittedCostDocuments,
  canCreateOrCollaborateOnDrafts,
  currentCostDocumentBatchCreatorCapacity,
  isBuilderCollaboratorRole,
  isDraftCreator,
} from "./policy";

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
