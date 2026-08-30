import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import { currentCostDocumentDraftRevision } from "../cost_document_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import { MAX_ALLOCATIONS } from "./contracts";

interface CostDocumentAuditInput {
  command: string;
  eventType: string;
  newState?: string;
  now: number;
  priorState?: string;
}

export async function recordCostDocumentBatchAudit(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: CostDocumentAuditInput & { batchId: Id<"costDocumentBatches"> }
) {
  await ctx.db.insert("auditEvents", {
    actorKind: authorization.viewer.actorKind,
    actorRole: authorization.effectiveRole.role,
    actorRoles: authorization.viewer.roles,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    command: input.command,
    createdAt: input.now,
    entityId: String(input.batchId),
    entityType: "costDocumentBatch",
    effectiveCapacity: authorization.effectiveRole.role,
    eventType: input.eventType,
    newState: input.newState,
    organizationId: authorization.organizationId,
    priorState: input.priorState,
    targetRevisions: [
      { entityId: String(input.batchId), entityType: "costDocumentBatch" },
    ],
    warnings: [],
  });
}

export async function costDocumentFinancialAuditSummary(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  document: Doc<"costDocuments">
) {
  const allocations = await ctx.db
    .query("costDocumentAllocations")
    .withIndex("by_costDocumentId_and_order", (query) =>
      query.eq("costDocumentId", document._id)
    )
    .take(MAX_ALLOCATIONS + 1);
  if (
    allocations.length < 1 ||
    allocations.length > MAX_ALLOCATIONS ||
    allocations.some(
      (allocation) =>
        allocation.organizationId !== authorization.organizationId ||
        allocation.brokerageId !== authorization.brokerage._id ||
        allocation.buildId !== authorization.build._id
    )
  ) {
    throw new Error(
      "The Cost Document financial audit summary is unavailable."
    );
  }
  return {
    allocationCount: allocations.length,
    allocationTotalCents: allocations.reduce(
      (total, allocation) => total + allocation.amountCents,
      0
    ),
    grossTotalCents: document.grossTotalCents,
    revision: document.revisionNumber ?? 1,
  };
}

export async function recordCostDocumentAudit(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  costDocumentId: Id<"costDocuments">,
  input: CostDocumentAuditInput
) {
  await ctx.db.insert("auditEvents", {
    actorKind: authorization.viewer.actorKind,
    actorRole: authorization.effectiveRole.role,
    actorRoles: authorization.viewer.roles,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    command: input.command,
    createdAt: input.now,
    entityId: String(costDocumentId),
    entityType: "costDocument",
    effectiveCapacity: authorization.effectiveRole.role,
    eventType: input.eventType,
    newState: input.newState,
    organizationId: authorization.organizationId,
    priorState: input.priorState,
    targetRevisions: [
      { entityId: String(costDocumentId), entityType: "costDocument" },
    ],
    warnings: [],
  });
}

export async function recordCostDocumentDraftAudit(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  draft: Doc<"costDocumentDrafts">,
  input: CostDocumentAuditInput
) {
  await ctx.db.insert("auditEvents", {
    actorKind: authorization.viewer.actorKind,
    actorRole: authorization.effectiveRole.role,
    actorRoles: authorization.viewer.roles,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    command: input.command,
    createdAt: input.now,
    entityId: String(draft._id),
    entityType: "costDocumentDraft",
    effectiveCapacity: authorization.effectiveRole.role,
    eventType: input.eventType,
    newState: input.newState,
    organizationId: authorization.organizationId,
    priorState: input.priorState,
    targetRevisions: [
      {
        entityId: String(draft._id),
        entityType: "costDocumentDraft",
        revision: currentCostDocumentDraftRevision(draft),
      },
    ],
    warnings: [],
  });
}
