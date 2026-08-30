/**
 * Production proposals confirmation history helpers bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type PaginationOptions } from "convex/server";
import { projectProposalLifecycle } from "../production_proposal_lifecycle";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { getCurrentProposalRevision } from "./review_lifecycle_helpers.js";

export async function getCurrentProposalLenderConfirmationCycle(
  ctx: QueryCtx | MutationCtx,
  proposal: Doc<"buildProposals">,
  assignment: Doc<"proposalLenderAssignments">,
) {
  const revision = await getCurrentProposalRevision(ctx, proposal);
  if (!revision || revision.assignmentId !== assignment._id) {
    return null;
  }
  return await ctx.db
    .query("proposalLenderConfirmationCycles")
    .withIndex("by_assignment_and_revision", (query) =>
      query
        .eq("assignmentId", assignment._id)
        .eq("proposalRevisionId", revision._id),
    )
    .unique();
}

export async function getProposalConfirmationDecision(
  ctx: QueryCtx | MutationCtx,
  cycle: Doc<"proposalLenderConfirmationCycles">,
) {
  if (cycle.decisionId) {
    const decision = await ctx.db.get(cycle.decisionId);
    if (
      !decision ||
      decision.confirmationCycleId !== cycle._id ||
      decision.proposalRevisionId !== cycle.proposalRevisionId
    ) {
      throw new Error("Proposal confirmation decision pointer is inconsistent.");
    }
    return decision;
  }
  const decisions = await ctx.db
    .query("proposalLenderApprovals")
    .withIndex("by_confirmation_cycle", (query) =>
      query.eq("confirmationCycleId", cycle._id),
    )
    .take(2);
  if (decisions.length > 1) {
    throw new Error("Proposal confirmation cycle has multiple decisions.");
  }
  return decisions[0] ?? null;
}

export async function projectProposalConfirmationCycle(
  ctx: QueryCtx | MutationCtx,
  cycle: Doc<"proposalLenderConfirmationCycles">,
  options: { includePrivateActors: boolean; includePrivateReason: boolean },
) {
  const [acknowledgements, decision, revision] = await Promise.all([
    ctx.db
      .query("proposalLenderConfirmationAcknowledgements")
      .withIndex("by_cycle", (query) =>
        query.eq("confirmationCycleId", cycle._id),
      )
      .collect(),
    getProposalConfirmationDecision(ctx, cycle),
    ctx.db.get(cycle.proposalRevisionId),
  ]);
  if (!revision || revision.proposalId !== cycle.proposalId) {
    throw new Error("Proposal confirmation revision is unavailable.");
  }
  acknowledgements.sort(
    (left, right) =>
      left.sequence - right.sequence ||
      left.acknowledgedAt - right.acknowledgedAt,
  );
  return {
    acknowledgements: acknowledgements.map((acknowledgement) => ({
      acknowledgedAt: acknowledgement.acknowledgedAt,
      ...(options.includePrivateActors
        ? {
            acknowledgedByRole: acknowledgement.acknowledgedByRole,
            acknowledgedByWorkosUserId:
              acknowledgement.acknowledgedByWorkosUserId,
          }
        : {}),
      acknowledgementId: acknowledgement._id,
      checkpoint: acknowledgement.checkpoint,
      sequence: acknowledgement.sequence,
    })),
    assignmentId: cycle.assignmentId,
    changedCheckpoints: revision.changedCheckpoints,
    checkpoints: revision.checkpoints,
    confirmationCycleId: cycle._id,
    cycleNumber: cycle.cycleNumber,
    decision: decision
      ? {
          decidedAt: decision.approvedAt ?? decision.declinedAt ?? decision.createdAt,
          ...(options.includePrivateActors
            ? {
                decidedByRole: decision.approverRole,
                decidedByWorkosUserId: decision.approverWorkosUserId,
              }
            : {}),
          decisionId: decision._id,
          ...(decision.declinedCheckpoint
            ? { declinedCheckpoint: decision.declinedCheckpoint }
            : {}),
          ...(options.includePrivateReason && decision.reason
            ? { reason: decision.reason }
            : {}),
          status: decision.status,
        }
      : null,
    openedAt: cycle.openedAt,
    proposalRevisionId: cycle.proposalRevisionId,
    proposalRevisionNumber: cycle.proposalRevisionNumber,
    status: cycle.status,
  };
}

export async function paginateProposalConfirmationCycles(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  paginationOpts: PaginationOptions,
  assignmentId?: Id<"proposalLenderAssignments">,
) {
  if (assignmentId) {
    return await ctx.db
      .query("proposalLenderConfirmationCycles")
      .withIndex("by_assignment_and_cycle_number", (query) =>
        query.eq("assignmentId", assignmentId),
      )
      .order("desc")
      .paginate(paginationOpts);
  }
  return await ctx.db
    .query("proposalLenderConfirmationCycles")
    .withIndex("by_proposal", (query) => query.eq("proposalId", proposalId))
    .order("desc")
    .paginate(paginationOpts);
}

export function projectLenderSnapshotRevision(
  revision: Doc<"proposalRevisions">,
) {
  if (!revision.assignmentId) {
    throw new Error("Lender snapshot revision is missing its assignment scope.");
  }
  return {
    assignmentId: revision.assignmentId,
    changedCheckpoints: revision.changedCheckpoints,
    checkpoints: revision.checkpoints,
    createdAt: revision.createdAt,
    ...(revision.priorLenderReviewedRevisionId
      ? {
          priorLenderReviewedRevisionId:
            revision.priorLenderReviewedRevisionId,
        }
      : {}),
    revisionId: revision._id,
    revisionNumber: revision.revisionNumber,
    reviewPolicyVersionId: revision.reviewPolicyVersionId,
  };
}

export function projectLenderSnapshotDecision(
  decision: Doc<"proposalLenderApprovals">,
) {
  return {
    approvalId: decision._id,
    ...(decision.approvedAt === undefined
      ? {}
      : { approvedAt: decision.approvedAt }),
    ...(decision.declinedAt === undefined
      ? {}
      : { declinedAt: decision.declinedAt }),
    ...(decision.proposalRevisionId ? { proposalRevisionId: decision.proposalRevisionId } : {}),
    ...(decision.proposalRevisionNumber === undefined ? {} : { proposalRevisionNumber: decision.proposalRevisionNumber }),
    ...(!decision.proposalRevisionId || decision.proposalRevisionNumber === undefined
      ? { migrationStatus: "legacy_unlinked" as const }
      : {}),
    status: decision.status,
  };
}

function buildLenderSnapshotHistory(input: {
  assignment: Doc<"proposalLenderAssignments">;
  decisions: ReturnType<typeof projectLenderSnapshotDecision>[];
  revisions: ReturnType<typeof projectLenderSnapshotRevision>[];
}) {
  const history = [
    {
      kind: "assignment_created" as const,
      occurredAt: input.assignment.assignedAt,
    },
    ...input.revisions.map((revision) => ({
      kind: "revision_published" as const,
      occurredAt: revision.createdAt,
      proposalRevisionNumber: revision.revisionNumber,
    })),
    ...input.decisions.map((decision) => ({
      kind: "decision_recorded" as const,
      occurredAt:
        decision.status === "approved"
          ? (decision.approvedAt ?? 0)
          : (decision.declinedAt ?? 0),
      proposalRevisionNumber: decision.proposalRevisionNumber,
      status: decision.status,
    })),
    ...(input.assignment.withdrawnAt === undefined
      ? []
      : [
          {
            kind: "assignment_withdrawn" as const,
            occurredAt: input.assignment.withdrawnAt,
          },
        ]),
  ];
  return history.sort(
    (left, right) =>
      left.occurredAt - right.occurredAt || left.kind.localeCompare(right.kind),
  );
}

export async function projectLenderSnapshotDocuments(
  ctx: QueryCtx | MutationCtx,
  documents: Array<
    Pick<
      Doc<"proposalDocuments">,
      | "_id"
      | "createdAt"
      | "documentType"
      | "fileName"
      | "mimeType"
      | "sizeBytes"
      | "status"
      | "storageId"
      | "updatedAt"
    >
  >,
) {
  return await Promise.all(
    documents.map(async (document) => ({
      createdAt: document.createdAt,
      documentId: document._id,
      documentType: document.documentType,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      status: document.status,
      ...(document.storageId
        ? {
            storageId: document.storageId,
            storageUrl:
              (await ctx.storage.getUrl(document.storageId)) ?? undefined,
          }
        : {}),
      updatedAt: document.updatedAt,
    })),
  );
}

async function buildLiveLenderAssignmentSnapshot(
  ctx: QueryCtx | MutationCtx,
  proposal: Doc<"buildProposals">,
  assignment: Doc<"proposalLenderAssignments">,
) {
  const latestDecision = await ctx.db
    .query("proposalLenderApprovals")
    .withIndex("by_assignment", (query) => query.eq("assignmentId", assignment._id))
    .order("desc")
    .first();
  const lifecycle = projectProposalLifecycle(proposal, {
    lenderConfirmation:
      assignment.status === "withdrawn"
        ? "pending"
        : latestDecision?.status ?? "pending",
    state: assignment.status === "withdrawn" ? "withdrawn" : "assigned",
  });
  return {
    assignmentId: assignment._id,
    capturedAt: assignment.withdrawnAt ?? proposal.updatedAt,
    lifecycle,
    proposal: {
      buildName: proposal.buildName,
      location: proposal.location,
      status: proposal.status,
    },
  };
}

export async function createLenderAssignmentManifest(
  ctx: MutationCtx,
  proposal: Doc<"buildProposals">,
  assignment: Doc<"proposalLenderAssignments">,
  capturedAt: number,
  reviewPolicyVersionId: Id<"proposalReviewPolicyVersions">,
) {
  const existing = await ctx.db
    .query("proposalLenderAssignmentManifests")
    .withIndex("by_assignment", (query) =>
      query.eq("assignmentId", assignment._id),
    )
    .unique();
  if (existing) {
    return existing;
  }
  const lenderOrganizationId = ctx.db.normalizeId(
    "lenderOrganizations",
    String(assignment.lenderOrganizationId),
  );
  if (!lenderOrganizationId) {
    throw new Error(
      "Lender assignment must be reconciled before its historical manifest can be frozen.",
    );
  }
  const snapshot = await buildLiveLenderAssignmentSnapshot(ctx, proposal, {
    ...assignment,
    status: "withdrawn",
    withdrawnAt: capturedAt,
  });
  // This indexed read is the transactional document/archive cutover barrier.
  // A concurrent document insert changes the range and forces Convex to retry
  // the withdrawal before it can commit the manifest boundary.
  const latestDocument = await ctx.db
    .query("proposalDocuments")
    .withIndex("by_proposal", (query) => query.eq("proposalId", proposal._id))
    .order("desc")
    .first();
  const manifestId = await ctx.db.insert("proposalLenderAssignmentManifests", {
    assignmentId: assignment._id,
    brokerageId: proposal.brokerageId,
    capturedAt: snapshot.capturedAt,
    lenderOrganizationId,
    lifecycleSnapshot: snapshot.lifecycle,
    organizationId: proposal.organizationId,
    proposalId: proposal._id,
    proposalSnapshot: snapshot.proposal,
    attemptCount: 0,
    cursor: null,
    ...(latestDocument
      ? { documentCreationTimeCutoff: latestDocument._creationTime }
      : {}),
    documentCutoffVersion: 1,
    lastAttemptAt: capturedAt,
    phase: "documents",
    reviewPolicyVersionId,
    status: "building",
    version: 2,
  });
  const inserted = await ctx.db.get(manifestId);
  if (!inserted) {
    throw new Error("Failed to freeze the lender assignment manifest.");
  }
  return inserted;
}
