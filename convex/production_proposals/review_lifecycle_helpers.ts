/**
 * Production proposals review lifecycle helpers bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type Infer } from "convex/values";
import { type RoleSlug } from "../authz";
import { normalizeOperationalIdempotencyKey, operationalRequestFingerprint } from "../build_operational_idempotency";
import { DEFAULT_PROPOSAL_REVIEW_POLICY, deterministicProposalRevisionDiff, type ProposalReviewPolicySnapshot, type ProposalRevisionCheckpointSnapshot } from "../lender_portal_phase3";
import { proposalRevisionLenderContentSnapshotValidator } from "../production_proposal_detail";
import { MAX_PROPOSAL_REVISION_LENDER_CONTENT_ROWS } from "../proposal_revision_lender_snapshot";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { assignedBuilderProfileIdOrThrow } from "./authorization_core.js";
import { APPROVER_ROLES } from "./contracts_foundation.js";
import { MAX_PROPOSAL_MILESTONES } from "./contracts_workflow.js";
import { buildProposalIdentityProjection } from "./proposal_claim.js";
import { projectProposalDetailProposal, projectProposalDetailMilestone, projectProposalDetailSubmilestone, projectProposalDetailCostItem, projectProposalDetailDraw, projectProposalDetailAssignment, projectProposalDetailPermitWaiver, projectProposalDetailActiveBuild } from "./proposal_detail_projection.js";
import { requireReason } from "./proposal_lender_approval.js";
import { getPermitWaiver } from "./storage_helpers.js";

export function requireState(
  proposal: Doc<"buildProposals">,
  expected: Doc<"buildProposals">["status"],
) {
  if (proposal.status !== expected) {
    throw new Error(`Expected proposal state ${expected}.`);
  }
}

export function requirePhase3BackofficeRole(auth: {
  roles: readonly RoleSlug[];
}) {
  const role = auth.roles.find((candidate) =>
    APPROVER_ROLES.includes(candidate as (typeof APPROVER_ROLES)[number]),
  );
  if (!role) {
    throw new Error("Forbidden: review policy authority");
  }
  return role;
}

export function assertExpectedProposalReviewBase(input: {
  assignment: Doc<"proposalLenderAssignments"> | null;
  expectedAssignmentId: Id<"proposalLenderAssignments"> | null;
  expectedProposalRevisionNumber: number | null;
  proposal: Doc<"buildProposals">;
}) {
  const currentRevisionNumber = input.proposal.currentProposalRevisionNumber ?? null;
  if (input.expectedProposalRevisionNumber !== currentRevisionNumber) {
    throw new Error("Stale proposal revision.");
  }
  if ((input.assignment?._id ?? null) !== input.expectedAssignmentId) {
    throw new Error("Stale lender assignment.");
  }
}

export async function getCurrentProposalReviewPolicyVersion(
  ctx: QueryCtx | MutationCtx,
  proposal: Doc<"buildProposals">,
) {
  if (proposal.currentReviewPolicyVersionId) {
    const current = await ctx.db.get(proposal.currentReviewPolicyVersionId);
    if (
      !current ||
      current.proposalId !== proposal._id ||
      current.organizationId !== proposal.organizationId ||
      current.brokerageId !== proposal.brokerageId
    ) {
      throw new Error("Proposal review policy pointer is inconsistent.");
    }
    return current;
  }
  const versions = await ctx.db
    .query("proposalReviewPolicyVersions")
    .withIndex("by_proposal", (query) => query.eq("proposalId", proposal._id))
    .order("desc")
    .take(1);
  return versions[0] ?? null;
}

export async function ensureDefaultProposalReviewPolicyVersion(
  ctx: MutationCtx,
  input: {
    auth: {
      brokerage: Doc<"brokerages">;
      proposal: Doc<"buildProposals">;
      roles: RoleSlug[];
      subject: string;
    };
    now: number;
  },
) {
  const current = await getCurrentProposalReviewPolicyVersion(
    ctx,
    input.auth.proposal,
  );
  if (current) {
    if (!input.auth.proposal.currentReviewPolicyVersionId) {
      await ctx.db.patch(input.auth.proposal._id, {
        currentReviewPolicyVersionId: current._id,
      });
    }
    return current;
  }
  const configuredByRole = requirePhase3BackofficeRole(input.auth);
  const policyVersionId = await ctx.db.insert("proposalReviewPolicyVersions", {
    brokerageId: input.auth.brokerage._id,
    configuredAt: input.now,
    configuredByRole,
    configuredByWorkosUserId: input.auth.subject,
    idempotencyKey: "system:default-backoffice-policy",
    organizationId: input.auth.proposal.organizationId,
    policy: DEFAULT_PROPOSAL_REVIEW_POLICY,
    proposalId: input.auth.proposal._id,
    reason: "Initialize the default Back Office-only review policy.",
    version: 1,
  });
  await ctx.db.patch(input.auth.proposal._id, {
    currentReviewPolicyVersionId: policyVersionId,
  });
  const inserted = await ctx.db.get(policyVersionId);
  if (!inserted) {
    throw new Error("Failed to initialize proposal review policy.");
  }
  return inserted;
}

export async function getCurrentProposalRevision(
  ctx: QueryCtx | MutationCtx,
  proposal: Doc<"buildProposals">,
) {
  if (proposal.currentProposalRevisionId) {
    const current = await ctx.db.get(proposal.currentProposalRevisionId);
    if (
      !current ||
      current.proposalId !== proposal._id ||
      current.revisionNumber !== proposal.currentProposalRevisionNumber
    ) {
      throw new Error("Current proposal revision pointer is inconsistent.");
    }
    return current;
  }
  const revisions = await ctx.db
    .query("proposalRevisions")
    .withIndex("by_proposal_and_revision_number", (query) =>
      query.eq("proposalId", proposal._id),
    )
    .order("desc")
    .take(1);
  return revisions[0] ?? null;
}

async function getPriorLenderReviewedProposalRevision(
  ctx: QueryCtx | MutationCtx,
  proposal: Doc<"buildProposals">,
) {
  if (proposal.latestLenderReviewedRevisionId) {
    const pointedRevision = await ctx.db.get(
      proposal.latestLenderReviewedRevisionId,
    );
    if (
      !pointedRevision ||
      pointedRevision.proposalId !== proposal._id ||
      (proposal.latestLenderReviewedRevisionNumber !== undefined &&
        pointedRevision.revisionNumber !==
          proposal.latestLenderReviewedRevisionNumber)
    ) {
      throw new Error("Latest lender-reviewed proposal revision pointer is inconsistent.");
    }
    return pointedRevision;
  }
  const decisions = await ctx.db
    .query("proposalLenderApprovals")
    .withIndex("by_proposal", (query) =>
      query.eq("proposalId", proposal._id),
    )
    .order("desc")
    .take(1_001);
  for (const decision of decisions) {
    if (!decision.proposalRevisionId) {
      continue;
    }
    const revision = await ctx.db.get(decision.proposalRevisionId);
    if (revision?.proposalId === proposal._id) {
      return revision;
    }
  }
  if (decisions.length > 1_000) {
    throw new Error(
      "Legacy lender approval history exceeds the safe revision-diff recovery boundary; run the Phase 3 lifecycle backfill.",
    );
  }
  return null;
}

async function buildProposalRevisionCheckpoints(
  ctx: QueryCtx | MutationCtx,
  input: {
    brokerage: Doc<"brokerages">;
    policy: ProposalReviewPolicySnapshot;
    proposal: Doc<"buildProposals">;
  },
): Promise<{
  checkpoints: ProposalRevisionCheckpointSnapshot;
  lenderContent: {
    costItems: ReturnType<typeof projectProposalDetailCostItem>[];
    documents: Array<{
      _id: Id<"proposalDocuments">;
      contractorVisible?: boolean;
      createdAt: number;
      documentType: "permit" | "budget" | "plan" | "supporting";
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      status: "uploaded" | "linked" | "waived";
      storageId?: Id<"_storage">;
      storageUrl: null;
      updatedAt: number;
    }>;
    draws: ReturnType<typeof projectProposalDetailDraw>[];
    milestones: ReturnType<typeof projectProposalDetailMilestone>[];
    root: Infer<typeof proposalRevisionLenderContentSnapshotValidator>;
    submilestones: ReturnType<typeof projectProposalDetailSubmilestone>[];
  };
  milestones: Array<{
    dayEnd: number;
    dayStart: number;
    dependencyKeys: string[];
    durationDays: number;
    key: string;
    order: number;
  }>;
}> {
  const builderProfileId = assignedBuilderProfileIdOrThrow(
    input.proposal,
    "A proposal revision requires an assigned builder.",
  );
  const [
    builder,
    milestones,
    submilestones,
    costItems,
    draws,
    documents,
    permitWaiver,
    assignment,
    activeBuild,
  ] = await Promise.all([
    ctx.db.get(builderProfileId),
    ctx.db
      .query("proposalMilestones")
      .withIndex("by_proposal", (query) => query.eq("proposalId", input.proposal._id))
      .take(MAX_PROPOSAL_MILESTONES + 1),
    ctx.db
      .query("proposalSubmilestones")
      .withIndex("by_proposal", (query) => query.eq("proposalId", input.proposal._id))
      .take(MAX_PROPOSAL_REVISION_LENDER_CONTENT_ROWS + 1),
    ctx.db
      .query("proposalCostItems")
      .withIndex("by_proposal", (query) => query.eq("proposalId", input.proposal._id))
      .take(MAX_PROPOSAL_REVISION_LENDER_CONTENT_ROWS + 1),
    ctx.db
      .query("proposalDrawScheduleRows")
      .withIndex("by_proposal", (query) => query.eq("proposalId", input.proposal._id))
      .take(MAX_PROPOSAL_REVISION_LENDER_CONTENT_ROWS + 1),
    ctx.db
      .query("proposalDocuments")
      .withIndex("by_proposal", (query) => query.eq("proposalId", input.proposal._id))
      .take(MAX_PROPOSAL_REVISION_LENDER_CONTENT_ROWS + 1),
    getPermitWaiver(ctx, input.proposal._id),
    buildProposalIdentityProjection(ctx, input.proposal, input.brokerage),
    input.proposal.activeBuildId
      ? ctx.db.get(input.proposal.activeBuildId)
      : null,
  ]);
  if (milestones.length > MAX_PROPOSAL_MILESTONES) {
    throw new Error(`A proposal revision supports at most ${MAX_PROPOSAL_MILESTONES} milestones.`);
  }
  if (milestones.some((milestone) => milestone.dependencyKeys.length > MAX_PROPOSAL_MILESTONES)) {
    throw new Error(`A proposal revision milestone supports at most ${MAX_PROPOSAL_MILESTONES} dependencies.`);
  }
  if (
    milestones.length +
      submilestones.length +
      costItems.length +
      draws.length +
      documents.length >
    MAX_PROPOSAL_REVISION_LENDER_CONTENT_ROWS
  ) {
    throw new Error(
      `A proposal revision supports at most ${MAX_PROPOSAL_REVISION_LENDER_CONTENT_ROWS} lender-visible content rows.`,
    );
  }
  if (
    !builder ||
    builder.brokerageId !== input.proposal.brokerageId ||
    builder.organizationId !== input.proposal.organizationId ||
    builder.status !== "active"
  ) {
    throw new Error("Proposal revision builder is outside the proposal scope.");
  }
  if (
    activeBuild &&
    (activeBuild.proposalId !== input.proposal._id ||
      activeBuild.brokerageId !== input.proposal.brokerageId ||
      activeBuild.organizationId !== input.proposal.organizationId)
  ) {
    throw new Error("Proposal revision active Build is outside the proposal scope.");
  }
  const scheduleMilestones = milestones
    .map((milestone) => ({
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      dependencyKeys: [...milestone.dependencyKeys].sort(),
      durationDays: milestone.durationDays,
      key: milestone.key,
      order: milestone.order,
    }))
    .sort((left, right) =>
      left.order - right.order || left.key.localeCompare(right.key),
    );
  const milestonesFingerprint = await operationalRequestFingerprint(
    scheduleMilestones,
  );
  return {
    checkpoints: {
      accessReviewPolicy: input.policy,
      budget: { totalBudgetCents: input.proposal.totalBudgetCents },
      builder: {
        builderProfileId,
        displayName: builder.displayName,
      },
      milestoneCount: { count: scheduleMilestones.length },
      scheduleTimeline: {
        milestonesFingerprint,
        proposedStartDate: input.proposal.proposedStartDate ?? null,
        timelineRangeMax: input.proposal.timelineRangeMax ?? null,
        timelineRangeMin: input.proposal.timelineRangeMin ?? null,
      },
    },
    lenderContent: {
      costItems: costItems.map((item) =>
        projectProposalDetailCostItem(item, false),
      ),
      documents: documents.map((document) => ({
        _id: document._id,
        contractorVisible: document.contractorVisible,
        createdAt: document.createdAt,
        documentType: document.documentType,
        fileName: document.fileName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        status: document.status,
        storageId: document.storageId,
        storageUrl: null,
        updatedAt: document.updatedAt,
      })),
      draws: draws.map((draw) => projectProposalDetailDraw(draw, false)),
      milestones: milestones.map(projectProposalDetailMilestone),
      root: {
        activeBuild: projectProposalDetailActiveBuild(activeBuild),
        assignment: projectProposalDetailAssignment(assignment, false),
        counts: {
          costItems: costItems.length,
          documents: documents.length,
          draws: draws.length,
          milestones: milestones.length,
          submilestones: submilestones.length,
        },
        permitWaiver: projectProposalDetailPermitWaiver(permitWaiver, false),
        proposal: projectProposalDetailProposal(input.proposal, false),
      },
      submilestones: submilestones.map(projectProposalDetailSubmilestone),
    },
    milestones: scheduleMilestones,
  };
}

export async function createImmutableProposalRevision(
  ctx: MutationCtx,
  input: {
    assignment: Doc<"proposalLenderAssignments"> | null;
    auth: {
      brokerage: Doc<"brokerages">;
      proposal: Doc<"buildProposals">;
      roles: RoleSlug[];
      subject: string;
    };
    idempotencyKey: string;
    policyVersion: Doc<"proposalReviewPolicyVersions">;
    reason: string;
  },
) {
  const idempotencyKey = normalizeOperationalIdempotencyKey(
    input.idempotencyKey,
    "Proposal revision idempotency key",
  );
  const existing = await ctx.db
    .query("proposalRevisions")
    .withIndex("by_proposal_and_idempotency_key", (query) =>
      query
        .eq("proposalId", input.auth.proposal._id)
        .eq("idempotencyKey", idempotencyKey),
    )
    .unique();
  if (existing) {
    return existing;
  }
  if (input.auth.proposal.status !== "approved") {
    throw new Error("A lender-reviewable revision requires Back Office approval.");
  }
  if (!input.auth.proposal.backOfficeApprovedByWorkosUserId) {
    throw new Error("A proposal revision requires a Back Office approval reference.");
  }
  const createdByRole = requirePhase3BackofficeRole(input.auth);
  const [currentRevision, priorLenderReviewedRevision, revisionSnapshot] =
    await Promise.all([
      getCurrentProposalRevision(ctx, input.auth.proposal),
      getPriorLenderReviewedProposalRevision(ctx, input.auth.proposal),
      buildProposalRevisionCheckpoints(ctx, {
        brokerage: input.auth.brokerage,
        policy: input.policyVersion.policy,
        proposal: input.auth.proposal,
      }),
    ]);
  const revisionNumber = (currentRevision?.revisionNumber ?? 0) + 1;
  const changedCheckpoints = deterministicProposalRevisionDiff(
    priorLenderReviewedRevision?.checkpoints ?? null,
    revisionSnapshot.checkpoints,
  );
  const now = Date.now();
  requireReason(input.reason);
  const revisionId = await ctx.db.insert("proposalRevisions", {
    ...(input.assignment ? { assignmentId: input.assignment._id } : {}),
    backOfficeApprovedByWorkosUserId:
      input.auth.proposal.backOfficeApprovedByWorkosUserId,
    brokerageId: input.auth.brokerage._id,
    changedCheckpoints,
    checkpoints: revisionSnapshot.checkpoints,
    createdAt: now,
    createdByRole,
    createdByWorkosUserId: input.auth.subject,
    idempotencyKey,
    organizationId: input.auth.proposal.organizationId,
    ...(priorLenderReviewedRevision
      ? { priorLenderReviewedRevisionId: priorLenderReviewedRevision._id }
      : {}),
    proposalId: input.auth.proposal._id,
    reason: input.reason.trim(),
    revisionNumber,
    reviewPolicyVersionId: input.policyVersion._id,
  });
  for (const milestone of revisionSnapshot.milestones) {
    await ctx.db.insert("proposalRevisionMilestones", {
      brokerageId: input.auth.brokerage._id,
      organizationId: input.auth.proposal.organizationId,
      proposalId: input.auth.proposal._id,
      revisionId,
      ...milestone,
    });
  }
  const lenderContentScope = {
    brokerageId: input.auth.brokerage._id,
    organizationId: input.auth.proposal.organizationId,
    proposalId: input.auth.proposal._id,
    revisionId,
  };
  await ctx.db.insert("proposalRevisionLenderContentSnapshots", {
    ...lenderContentScope,
    ...revisionSnapshot.lenderContent.root,
    proposal: {
      ...revisionSnapshot.lenderContent.root.proposal,
      currentProposalRevisionId: revisionId,
      currentProposalRevisionNumber: revisionNumber,
      currentReviewPolicyVersionId: input.policyVersion._id,
    },
  });
  for (const document of revisionSnapshot.lenderContent.documents) {
    const { _id: sourceDocumentId, ...snapshot } = document;
    await ctx.db.insert("proposalRevisionLenderDocuments", {
      ...lenderContentScope,
      ...snapshot,
      sourceDocumentId,
    });
  }
  for (const milestone of revisionSnapshot.lenderContent.milestones) {
    const { _id: sourceMilestoneId, ...snapshot } = milestone;
    await ctx.db.insert("proposalRevisionLenderMilestones", {
      ...lenderContentScope,
      ...snapshot,
      sourceMilestoneId,
    });
  }
  for (const submilestone of revisionSnapshot.lenderContent.submilestones) {
    const { _id: sourceSubmilestoneId, ...snapshot } = submilestone;
    await ctx.db.insert("proposalRevisionLenderSubmilestones", {
      ...lenderContentScope,
      ...snapshot,
      sourceSubmilestoneId,
    });
  }
  for (const costItem of revisionSnapshot.lenderContent.costItems) {
    const { _id: sourceCostItemId, ...snapshot } = costItem;
    await ctx.db.insert("proposalRevisionLenderCostItems", {
      ...lenderContentScope,
      ...snapshot,
      sourceCostItemId,
    });
  }
  for (const draw of revisionSnapshot.lenderContent.draws) {
    const { _id: sourceDrawId, ...snapshot } = draw;
    await ctx.db.insert("proposalRevisionLenderDraws", {
      ...lenderContentScope,
      ...snapshot,
      sourceDrawId,
    });
  }
  await ctx.db.patch(input.auth.proposal._id, {
    currentProposalRevisionId: revisionId,
    currentProposalRevisionNumber: revisionNumber,
    updatedAt: now,
    updatedByWorkosUserId: input.auth.subject,
  });
  if (input.assignment) {
    await openProposalLenderConfirmationCycle(ctx, {
      assignment: input.assignment,
      proposal: input.auth.proposal,
      proposalRevisionId: revisionId,
      proposalRevisionNumber: revisionNumber,
    });
  }
  const revision = await ctx.db.get(revisionId);
  if (!revision) {
    throw new Error("Failed to create proposal revision.");
  }
  return revision;
}

export async function openProposalLenderConfirmationCycle(
  ctx: MutationCtx,
  input: {
    assignment: Doc<"proposalLenderAssignments">;
    proposal: Doc<"buildProposals">;
    proposalRevisionId: Id<"proposalRevisions">;
    proposalRevisionNumber: number;
  },
) {
  const existing = await ctx.db
    .query("proposalLenderConfirmationCycles")
    .withIndex("by_assignment_and_revision", (query) =>
      query
        .eq("assignmentId", input.assignment._id)
        .eq("proposalRevisionId", input.proposalRevisionId),
    )
    .unique();
  if (existing) {
    return existing;
  }
  const [latestCycle, pendingCycles] = await Promise.all([
    ctx.db
      .query("proposalLenderConfirmationCycles")
      .withIndex("by_assignment_and_cycle_number", (query) =>
        query.eq("assignmentId", input.assignment._id),
      )
      .order("desc")
      .take(1),
    ctx.db
      .query("proposalLenderConfirmationCycles")
      .withIndex("by_assignment_and_status", (query) =>
        query.eq("assignmentId", input.assignment._id).eq("status", "pending"),
      )
      .take(2),
  ]);
  if (pendingCycles.length > 1) {
    throw new Error("Proposal assignment has multiple pending confirmation cycles.");
  }
  const now = Date.now();
  for (const pendingCycle of pendingCycles) {
    await ctx.db.patch(pendingCycle._id, {
      closedAt: now,
      status: "superseded",
      supersededAt: now,
    });
  }
  const confirmationCycleId = await ctx.db.insert(
    "proposalLenderConfirmationCycles",
    {
      assignmentId: input.assignment._id,
      brokerageId: input.proposal.brokerageId,
      createdAt: now,
      cycleNumber: (latestCycle[0]?.cycleNumber ?? 0) + 1,
      openedAt: now,
      organizationId: input.proposal.organizationId,
      proposalId: input.proposal._id,
      proposalRevisionId: input.proposalRevisionId,
      proposalRevisionNumber: input.proposalRevisionNumber,
      status: "pending",
    },
  );
  const cycle = await ctx.db.get(confirmationCycleId);
  if (!cycle) {
    throw new Error("Failed to create proposal confirmation cycle.");
  }
  return cycle;
}
