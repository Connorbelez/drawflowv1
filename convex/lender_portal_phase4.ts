import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import {
  proposalLifecycleProjectionValidator,
  proposalRevisionCheckpointNameValidator,
  proposalRevisionCheckpointSnapshotValidator,
} from "./lender_portal_phase3";

export const PROPOSAL_CONFIRMATION_CHECKPOINTS = [
  "milestoneCount",
  "budget",
  "scheduleTimeline",
  "builder",
  "accessReviewPolicy",
] as const;

export const LENDER_PROPOSAL_DECISION_ROLES = [
  "lender",
  "lender-admin",
] as const;

export const proposalConfirmationCycleStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("superseded")
);

export const proposalConfirmationAcknowledgementProjectionValidator = v.object({
  acknowledgedAt: v.number(),
  acknowledgedByRole: v.optional(v.string()),
  acknowledgedByWorkosUserId: v.optional(v.string()),
  acknowledgementId: v.id("proposalLenderConfirmationAcknowledgements"),
  checkpoint: proposalRevisionCheckpointNameValidator,
  sequence: v.number(),
});

export const proposalConfirmationDecisionProjectionValidator = v.object({
  decidedAt: v.number(),
  decidedByRole: v.optional(v.string()),
  decidedByWorkosUserId: v.optional(v.string()),
  decisionId: v.id("proposalLenderApprovals"),
  declinedCheckpoint: v.optional(proposalRevisionCheckpointNameValidator),
  reason: v.optional(v.string()),
  status: v.union(v.literal("approved"), v.literal("declined")),
});

export const proposalConfirmationCycleProjectionValidator = v.object({
  acknowledgements: v.array(
    proposalConfirmationAcknowledgementProjectionValidator
  ),
  assignmentId: v.id("proposalLenderAssignments"),
  changedCheckpoints: v.array(proposalRevisionCheckpointNameValidator),
  checkpoints: proposalRevisionCheckpointSnapshotValidator,
  confirmationCycleId: v.id("proposalLenderConfirmationCycles"),
  cycleNumber: v.number(),
  decision: v.union(proposalConfirmationDecisionProjectionValidator, v.null()),
  openedAt: v.number(),
  proposalRevisionId: v.id("proposalRevisions"),
  proposalRevisionNumber: v.number(),
  status: proposalConfirmationCycleStatusValidator,
});

export const builderProposalConfirmationCycleProjectionValidator = v.object({
  closedAt: v.union(v.number(), v.null()),
  cycleNumber: v.number(),
  openedAt: v.number(),
  proposalRevisionNumber: v.number(),
  status: proposalConfirmationCycleStatusValidator,
});

export const lenderProposalConfirmationProjectionValidator = v.object({
  canAcknowledge: v.boolean(),
  canDecide: v.boolean(),
  closingGateSatisfied: v.boolean(),
  currentCycle: v.union(proposalConfirmationCycleProjectionValidator, v.null()),
  decisionAuthorized: v.boolean(),
  history: paginationResultValidator(
    proposalConfirmationCycleProjectionValidator
  ),
  lenderNeedsAction: v.boolean(),
});

export const backofficeProposalRemediationProjectionValidator = v.object({
  currentCycle: v.union(proposalConfirmationCycleProjectionValidator, v.null()),
  history: paginationResultValidator(
    proposalConfirmationCycleProjectionValidator
  ),
  lenderNeedsAction: v.boolean(),
  remediation: v.union(
    v.object({
      confirmationCycleId: v.id("proposalLenderConfirmationCycles"),
      declinedCheckpoint: proposalRevisionCheckpointNameValidator,
      declinedProposalRevisionId: v.id("proposalRevisions"),
      declinedProposalRevisionNumber: v.number(),
      editableProposalId: v.id("buildProposals"),
      privateReason: v.string(),
      publishBase: v.object({
        expectedAssignmentId: v.id("proposalLenderAssignments"),
        expectedProposalRevisionNumber: v.number(),
      }),
      updateRequired: v.literal(true),
    }),
    v.null()
  ),
});

export const builderProposalConfirmationProjectionValidator = v.object({
  currentProposalRevisionNumber: v.union(v.number(), v.null()),
  history: paginationResultValidator(
    builderProposalConfirmationCycleProjectionValidator
  ),
  lifecycle: proposalLifecycleProjectionValidator,
  updateRequired: v.boolean(),
});
