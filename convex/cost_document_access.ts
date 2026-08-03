import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "./activeBuildAccess";
import type { AuthorizedViewer } from "./authz";
import type { BuildCollaborationRole } from "./build_collaboration_model";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_DRAFT_COLLABORATION_EVENTS = 250;

export type CostDocumentIntent =
  | "create"
  | "draft.read"
  | "draft.edit"
  | "batch.submit"
  | "submitted.list"
  | "submitted.read"
  | "asset.read";

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
 * The only role-to-intent boundary for Cost Documents. Target-specific guards
 * below decide whether a caller is the creator or holds an exact active Draft
 * grant; this function never treats a Build role as draft-wide access.
 */
export async function authorizeCostDocumentIntent(
  ctx: CostDocumentAccessCtx,
  input: {
    buildId: Id<"activeBuilds">;
    intent: CostDocumentIntent;
    organizationId: string;
  }
) {
  const authorization = await authorizeActiveBuildAccess(ctx, {
    buildId: input.buildId,
    organizationId: input.organizationId,
  });
  if (authorization.viewer.actorKind !== "human") {
    throw new Error("The Cost Document is unavailable.");
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

  if (!canCreateOrCollaborateOnDrafts(authorization)) {
    throw new Error("The Cost Document draft is unavailable.");
  }
  return authorization;
}

export async function requireCostDocumentDraftAccess(
  ctx: CostDocumentAccessCtx,
  input: {
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
    intent: input.intent,
    organizationId: draft.organizationId,
  });
  assertCostDocumentDraftGraph(draft, batch, authorization);
  if (batch.state !== "active" || draft.lifecycle === "submitted") {
    throw new Error("The Cost Document draft is unavailable.");
  }

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
  if (
    !(draft && batch) ||
    batch.state !== "active" ||
    draft.lifecycle === "submitted" ||
    !canCreateOrCollaborateOnDrafts(input.authorization)
  ) {
    return null;
  }
  try {
    assertCostDocumentDraftGraph(draft, batch, input.authorization);
  } catch {
    return null;
  }
  if (isDraftCreator(draft, batch, input.authorization)) {
    return {
      authorization: input.authorization,
      batch,
      draft,
      mode: "creator",
    };
  }
  if (
    !(
      isBuilderCollaboratorRole(input.authorization.effectiveRole.role) &&
      (await hasCurrentDraftCollaborationGrant(ctx, {
        draft,
        workosUserId: input.authorization.viewer.subject,
      }))
    )
  ) {
    return null;
  }
  return {
    authorization: input.authorization,
    batch,
    draft,
    mode: "collaborator",
  };
}

export async function requireCostDocumentBatchCreator(
  ctx: CostDocumentAccessCtx,
  input: {
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
    intent: input.intent,
    organizationId: batch.organizationId,
  });
  assertCostDocumentBatchScope(batch, authorization);
  if (batch.ownerWorkosUserId !== authorization.viewer.subject) {
    throw new Error("The Cost Document batch is unavailable.");
  }
  return { authorization, batch };
}

export async function requireCostDocumentDraftCreator(
  ctx: CostDocumentAccessCtx,
  input: {
    draftId: Id<"costDocumentDrafts">;
    intent: "draft.read" | "draft.edit" | "batch.submit";
  }
) {
  const access = await requireCostDocumentDraftAccess(ctx, {
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
    // A homeowner can own and complete their own batch, but cannot project
    // Builder-side staff access into it. Exact grants are Builder-only.
    canManageDraftCollaboration:
      creator &&
      editable &&
      isBuilderCollaboratorRole(access.authorization.effectiveRole.role),
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

export function canReadSubmittedCostDocument(
  authorization: ActiveBuildAuthorization,
  document: Doc<"costDocuments">
) {
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
    role === "builder-staff" ||
    role === "homeowner"
  ) {
    return true;
  }
  return (
    role === "contractor" &&
    document.uploaderWorkosUserId === authorization.viewer.subject
  );
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
    authorization.effectiveRole.role === "homeowner"
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
    batch.ownerWorkosUserId === authorization.viewer.subject
  );
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
    batch.ownerWorkosUserId !== draft.ownerWorkosUserId
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
