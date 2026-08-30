import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import type { AuthorizedViewer } from "../authz";
import type { BuildCollaborationRole } from "../build_collaboration_model";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

export const MAX_DRAFT_COLLABORATION_EVENTS = 250;
export const MAX_CONTRACTOR_ASSIGNMENT_ROWS = 200;
export const MAX_CONTRACTOR_PROFILE_ROWS = 20;
export const MAX_COST_DOCUMENT_ALLOCATION_ROWS = 100;

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

export type CostDocumentAccessCtx = (QueryCtx | MutationCtx) & {
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
