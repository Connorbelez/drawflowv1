import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import type { BuildCollaborationRole } from "../build_collaboration_model";
import type { Doc, MutationCtx, QueryCtx } from "../types";
import {
  type CostDocumentDraftAuthorization,
  type CostDocumentDraftCapabilities,
  type CostDocumentContractorScopePurpose,
  type CurrentCostDocumentContractorScope,
} from "./contracts";
import { canReadOwnSubmittedContractorCostDocument } from "./scope";

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

export function canCreateOrCollaborateOnDrafts(
  authorization: ActiveBuildAuthorization
) {
  return (
    authorization.effectiveRole.role === "admin" ||
    authorization.effectiveRole.role === "principle-broker" ||
    authorization.effectiveRole.role === "builder" ||
    authorization.effectiveRole.role === "builder-staff" ||
    authorization.effectiveRole.role === "homeowner" ||
    authorization.effectiveRole.role === "contractor"
  );
}

/**
 * Inline party creation is part of the Cost Document create workflow. Keep
 * its role policy aligned with the existing Draft create/collaborate policy.
 */
export function canCreateCostDocumentVendor(
  authorization: ActiveBuildAuthorization
) {
  return canCreateOrCollaborateOnDrafts(authorization);
}

/**
 * Draft sharing is intentionally never organization-wide. The eligible-
 * recipient resolver remains Builder-owner / Builder-staff only; this gate
 * lets an authorized creator manage only those exact grants.
 */
export function canManageCostDocumentDraftCollaboration(
  authorization: ActiveBuildAuthorization
) {
  return (
    authorization.effectiveRole.role === "admin" ||
    authorization.effectiveRole.role === "principle-broker" ||
    isBuilderCollaboratorRole(authorization.effectiveRole.role) ||
    authorization.effectiveRole.role === "homeowner" ||
    authorization.effectiveRole.role === "contractor"
  );
}

export function isBuilderCollaboratorRole(role: BuildCollaborationRole) {
  return role === "builder" || role === "builder-staff";
}

export function isDraftCreator(
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
