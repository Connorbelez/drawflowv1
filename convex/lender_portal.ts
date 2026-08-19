import {
  type PaginationOptions,
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import {
  type ActiveLenderOrganizationContext,
  adminQuery,
  lenderOrganizationQuery,
  requireLenderOrganizationPermission,
} from "./authz";
import { drawSystemOccurrenceKey } from "./build_collaboration_system_posts";
import { loadFrozenLenderAssignmentSnapshot } from "./lender_assignment_manifest";
import {
  type LenderAssignment,
  type LenderPortalQueryCtx,
  latestLenderAssignments,
  listAccessibleLenderBuilds,
} from "./lender_portal_access";
import {
  encodeLenderQueueCursor,
  type LenderQueueScope,
  parseValidatedLenderQueueCursor,
} from "./lender_portal_pagination";
import {
  LENDER_PROPOSAL_DECISION_ROLES,
  PROPOSAL_CONFIRMATION_CHECKPOINTS,
} from "./lender_portal_phase4";
import {
  currentLenderApproverMaps,
  projectCurrentMilestoneReviewEvidence,
  reviewerQueueRow,
} from "./lender_portal_phase5";
import {
  lenderPortalReviewGroupValidator,
  lenderPortalReviewRequestStateValidator,
} from "./lender_portal_phase5_contracts";
import { resolveLenderOrganizationTarget } from "./lenderOrganizationAccess";
import { activeBuildDrawFundingSnapshotFromRows } from "./production_proposals";
import type { QueryCtx } from "./types";

const LENDER_PORTAL_RESULT_LIMIT = 50;
const LENDER_DRAW_QUEUE_MAX_PAGE_SIZE = 50;
const LENDER_PROPOSAL_PORTFOLIO_MAX_PAGE_SIZE = 50;
const LENDER_DASHBOARD_MAX_ASSIGNMENT_ROWS = 200;
const LENDER_DASHBOARD_MAX_BUILDS = LENDER_PORTAL_RESULT_LIMIT;
const LENDER_DASHBOARD_MAX_ACTIONS = 100;

const lenderProposalListRowFields = {
  assignedAt: v.number(),
  assignmentId: v.id("proposalLenderAssignments"),
  assignmentStatus: v.union(v.literal("current"), v.literal("withdrawn")),
  buildName: v.string(),
  lenderConfirmation: v.union(v.literal("approved"), v.literal("pending")),
  location: v.string(),
  proposalId: v.id("buildProposals"),
  proposalStatus: v.union(
    v.literal("draft"),
    v.literal("submitted"),
    v.literal("approved"),
    v.literal("closed")
  ),
  readOnly: v.boolean(),
  withdrawnAt: v.optional(v.number()),
};

const lenderProposalListRow = v.object(lenderProposalListRowFields);

const lenderProposalPortfolioViewValidator = v.union(
  v.literal("needs_action"),
  v.literal("in_progress"),
  v.literal("approved"),
  v.literal("update_pending"),
  v.literal("closed"),
  v.literal("withdrawn")
);

type LenderProposalPortfolioView =
  | "needs_action"
  | "in_progress"
  | "approved"
  | "update_pending"
  | "closed"
  | "withdrawn";

const lenderProposalPortfolioRow = v.object({
  ...lenderProposalListRowFields,
  view: lenderProposalPortfolioViewValidator,
});

const lenderProposalPortfolioPage = paginationResultValidator(
  lenderProposalPortfolioRow
);

const lenderBuildListRow = v.object({
  buildId: v.id("activeBuilds"),
  buildName: v.string(),
  location: v.string(),
  proposalId: v.id("buildProposals"),
  status: v.union(v.literal("active"), v.literal("future_start")),
  updatedAt: v.number(),
});

const lenderDashboardActionItem = v.object({
  actionId: v.string(),
  amountCents: v.optional(v.number()),
  assignmentId: v.optional(v.id("proposalLenderAssignments")),
  buildId: v.optional(v.id("activeBuilds")),
  fact: v.string(),
  meta: v.string(),
  proposalId: v.optional(v.id("buildProposals")),
  title: v.string(),
  type: v.union(
    v.literal("Proposal"),
    v.literal("Milestone"),
    v.literal("Draw")
  ),
  updatedAt: v.number(),
});

const lenderDashboardBuildRow = v.object({
  buildId: v.id("activeBuilds"),
  buildName: v.string(),
  facilityCents: v.number(),
  location: v.string(),
  nextState: v.string(),
  progressPercent: v.number(),
  releasedCents: v.number(),
  status: v.union(
    v.literal("active"),
    v.literal("future_start"),
    v.literal("needs_action"),
    v.literal("on_track")
  ),
  updatedAt: v.number(),
});

const lenderDashboardData = v.object({
  actions: v.array(lenderDashboardActionItem),
  builds: v.array(lenderDashboardBuildRow),
  stats: v.object({
    activeBuildCount: v.number(),
    assignedProposalCount: v.number(),
    drawCount: v.number(),
    milestoneCount: v.number(),
    releasedCents: v.number(),
    totalFacilityCents: v.number(),
  }),
  updatedAt: v.number(),
});

const lenderBuildDetailMilestone = v.object({
  actualCompletedAt: v.union(v.number(), v.null()),
  actualStartedAt: v.union(v.number(), v.null()),
  actionRequired: v.boolean(),
  budgetCents: v.number(),
  buildMilestoneId: v.id("buildMilestones"),
  dayEnd: v.number(),
  dayStart: v.number(),
  drawAvailabilityCents: v.number(),
  durationDays: v.number(),
  key: v.string(),
  name: v.string(),
  order: v.number(),
  plannedEndDate: v.string(),
  plannedStartDate: v.string(),
  progressPercent: v.union(v.number(), v.null()),
  contractors: v.array(
    v.object({
      contractorId: v.id("contractorProfiles"),
      name: v.string(),
      role: v.string(),
      status: v.string(),
    })
  ),
  receiptCoverage: v.object({
    actualCostCents: v.union(v.number(), v.null()),
    documentedCents: v.number(),
    documents: v.array(
      v.object({
        amountCents: v.number(),
        costDocumentId: v.id("costDocuments"),
        kind: v.union(v.literal("invoice"), v.literal("receipt")),
        label: v.string(),
        pages: v.array(
          v.object({
            assetId: v.id("buildCollaborationAssets"),
            downloadUrl: v.union(v.string(), v.null()),
            fileName: v.string(),
            mimeType: v.string(),
          })
        ),
        allocations: v.array(
          v.object({
            amountCents: v.number(),
            buildSubmilestoneId: v.id("buildSubmilestones"),
          })
        ),
        subtotalCents: v.union(v.number(), v.null()),
        taxCents: v.union(v.number(), v.null()),
      })
    ),
    required: v.boolean(),
    state: v.union(
      v.literal("not_required"),
      v.literal("not_recorded"),
      v.literal("partial"),
      v.literal("covered")
    ),
  }),
  reviewEvidence: v.array(
    v.object({
      downloadUrl: v.union(v.string(), v.null()),
      evidenceAssetId: v.id("buildEvidenceAssets"),
      fileName: v.string(),
      label: v.string(),
      locationVerified: v.boolean(),
      mimeType: v.string(),
      sizeBytes: v.number(),
      source: v.union(v.literal("evidence_package"), v.literal("site_visit")),
      siteVisitId: v.union(v.id("buildSiteVisits"), v.null()),
      submilestoneKey: v.union(v.string(), v.null()),
    })
  ),
  reviewCycleId: v.union(v.id("lenderPortalReviewCycles"), v.null()),
  reviewCycleNumber: v.union(v.number(), v.null()),
  reviewState: v.union(v.string(), v.null()),
  siteVisit: v.union(
    v.object({
      completedAt: v.string(),
      photoCount: v.number(),
      report: v.string(),
      requestedAt: v.string(),
      siteVisitId: v.id("buildSiteVisits"),
      submilestoneId: v.union(v.id("buildSubmilestones"), v.null()),
    }),
    v.null()
  ),
  siteVisits: v.array(
    v.object({
      completedAt: v.string(),
      photoCount: v.number(),
      report: v.string(),
      requestedAt: v.string(),
      requestedDay: v.number(),
      siteVisitId: v.id("buildSiteVisits"),
      submilestoneId: v.union(v.id("buildSubmilestones"), v.null()),
      tokenExpiresAt: v.number(),
      tokenOpenedAt: v.union(v.number(), v.null()),
      updatedAt: v.number(),
      visitId: v.string(),
    })
  ),
  status: v.union(
    v.literal("planned"),
    v.literal("in_progress"),
    v.literal("complete")
  ),
  submilestones: v.array(
    v.object({
      actualCostCents: v.union(v.number(), v.null()),
      actualStartedAt: v.union(v.number(), v.null()),
      assignments: v.array(
        v.object({
          contractorId: v.id("contractorProfiles"),
          name: v.string(),
          role: v.string(),
          status: v.string(),
        })
      ),
      budgetCents: v.number(),
      completedAt: v.union(v.number(), v.null()),
      description: v.string(),
      durationDays: v.union(v.number(), v.null()),
      key: v.string(),
      name: v.string(),
      order: v.number(),
      progressPercent: v.union(v.number(), v.null()),
      startDay: v.union(v.number(), v.null()),
      status: v.union(
        v.literal("planned"),
        v.literal("in_progress"),
        v.literal("complete")
      ),
      submilestoneId: v.id("buildSubmilestones"),
    })
  ),
});

const lenderBuildDetailDraw = v.object({
  actionItems: v.array(
    v.object({
      actionItemId: v.id("buildActionItems"),
      status: v.union(
        v.literal("todo"),
        v.literal("in_progress"),
        v.literal("in_review"),
        v.literal("blocked"),
        v.literal("done"),
        v.literal("cancelled")
      ),
      title: v.string(),
      updatedAt: v.number(),
    })
  ),
  actionRequired: v.boolean(),
  amountCents: v.number(),
  currentReviewCycleId: v.union(v.id("lenderPortalReviewCycles"), v.null()),
  currentReviewCycleNumber: v.union(v.number(), v.null()),
  displayId: v.string(),
  drawRequestId: v.id("activeBuildDrawRequests"),
  fundingPosition: v.object({
    availableBeforeCents: v.number(),
    reconciled: v.boolean(),
    remainingAfterCents: v.number(),
  }),
  label: v.string(),
  lenderPortalReviewState: v.union(v.string(), v.null()),
  note: v.union(v.string(), v.null()),
  requestedAt: v.string(),
  status: v.union(
    v.literal("requested"),
    v.literal("approved"),
    v.literal("in_review"),
    v.literal("ready_for_admin"),
    v.literal("approved_for_release"),
    v.literal("rejected"),
    v.literal("withdrawn"),
    v.literal("cancelled"),
    v.literal("released")
  ),
  updatedAt: v.number(),
  workOrderKey: v.union(v.string(), v.null()),
});

const lenderBuildDetailData = v.object({
  build: v.object({
    buildId: v.id("activeBuilds"),
    buildName: v.string(),
    location: v.string(),
    startDate: v.string(),
    status: v.union(v.literal("active"), v.literal("future_start")),
    timezone: v.union(v.string(), v.null()),
    totalBudgetCents: v.number(),
    updatedAt: v.number(),
  }),
  draws: v.array(lenderBuildDetailDraw),
  builder: v.object({
    displayName: v.string(),
  }),
  collaboration: v.array(
    v.object({
      body: v.string(),
      postId: v.id("buildCollaborationPosts"),
      primaryReferenceId: v.union(v.string(), v.null()),
      primaryReferenceKind: v.union(
        v.literal("milestone"),
        v.literal("submilestone"),
        v.literal("draw"),
        v.null()
      ),
      publishedAt: v.number(),
      sourceLabel: v.string(),
    })
  ),
  facility: v.union(
    v.object({
      interestAnnualBps: v.number(),
      interestStartsOn: v.literal("funds_released"),
      principalCents: v.number(),
    }),
    v.null()
  ),
  funding: v.object({
    approvedMilestoneCents: v.number(),
    availableCents: v.number(),
    facilityCents: v.number(),
    releasedCents: v.number(),
    reservedCents: v.number(),
    unlockedCents: v.number(),
  }),
  milestones: v.array(lenderBuildDetailMilestone),
  releasedCents: v.number(),
  reviewSummary: v.string(),
});

const lenderDrawQueueRow = v.object({
  actionRequired: v.boolean(),
  amountCents: v.number(),
  buildId: v.id("activeBuilds"),
  buildName: v.string(),
  builderName: v.string(),
  currentReviewCycleId: v.union(v.id("lenderPortalReviewCycles"), v.null()),
  currentReviewCycleNumber: v.union(v.number(), v.null()),
  displayId: v.string(),
  drawRequestId: v.id("activeBuildDrawRequests"),
  fundingPosition: v.object({
    availableBeforeCents: v.number(),
    reconciled: v.boolean(),
    remainingAfterCents: v.number(),
  }),
  label: v.string(),
  lenderPortalReviewState: v.union(v.string(), v.null()),
  location: v.string(),
  note: v.union(v.string(), v.null()),
  requestedAt: v.string(),
  reviewCycle: v.union(
    v.object({
      approvedGroups: v.array(lenderPortalReviewGroupValidator),
      evidencePackageRevisionCount: v.number(),
      evidenceReferenceCount: v.number(),
      lenderApprovalCount: v.number(),
      lenderQuorum: v.union(v.number(), v.null()),
      locationReferenceCount: v.number(),
      locationVerifiedCount: v.number(),
      requiredGroups: v.array(lenderPortalReviewGroupValidator),
      state: lenderPortalReviewRequestStateValidator,
    }),
    v.null()
  ),
  status: v.union(
    v.literal("requested"),
    v.literal("approved"),
    v.literal("in_review"),
    v.literal("ready_for_admin"),
    v.literal("approved_for_release"),
    v.literal("rejected"),
    v.literal("withdrawn"),
    v.literal("cancelled"),
    v.literal("released")
  ),
  updatedAt: v.number(),
  targetAvailability: v.union(v.literal("available"), v.literal("unavailable")),
  viewerActionState: v.union(
    v.literal("needs_action"),
    v.literal("acted"),
    v.literal("not_required"),
    v.literal("ineligible"),
    v.literal("closed"),
    v.literal("unavailable")
  ),
  viewerDecision: v.union(
    v.literal("approved"),
    v.literal("rejected"),
    v.null()
  ),
  workOrderKey: v.union(v.string(), v.null()),
});

const lenderDrawQueuePage = paginationResultValidator(lenderDrawQueueRow);

const backofficeLenderOrganizationPortfolio = v.object({
  organization: v.object({
    id: v.id("lenderOrganizations"),
    displayName: v.string(),
    legalName: v.string(),
    status: v.union(v.literal("active"), v.literal("inactive")),
    brokerageId: v.id("brokerages"),
    brokerageName: v.string(),
    permissions: v.object({
      proposalReview: v.boolean(),
      milestoneDecisions: v.boolean(),
      drawDecisions: v.boolean(),
      siteVisitReview: v.boolean(),
    }),
  }),
  proposals: v.array(lenderProposalListRow),
  builds: v.array(lenderBuildListRow),
});

async function projectLenderAssignedProposals(
  ctx: Pick<QueryCtx, "db">,
  assignments: readonly LenderAssignment[]
) {
  const rows = await Promise.all(
    assignments.map((assignment) =>
      projectLenderAssignedProposalRecord(ctx, assignment)
    )
  );

  return rows
    .filter((record): record is NonNullable<typeof record> => record !== null)
    .map((record) => record.row)
    .sort(compareLenderProposalRows)
    .slice(0, LENDER_PORTAL_RESULT_LIMIT);
}

async function projectLenderAssignedProposalRecord(
  ctx: Pick<QueryCtx, "db">,
  assignment: LenderAssignment
) {
  if (assignment.status === "archiving") {
    return null;
  }
  if (assignment.status === "withdrawn") {
    const snapshot = await loadFrozenLenderAssignmentSnapshot(ctx, assignment);
    return {
      proposal: null,
      row: {
        assignedAt: assignment.assignedAt,
        assignmentId: assignment._id,
        assignmentStatus: assignment.status,
        buildName: snapshot.proposal.buildName,
        lenderConfirmation:
          snapshot.lifecycle.lenderConfirmation === "approved"
            ? ("approved" as const)
            : ("pending" as const),
        location: snapshot.proposal.location,
        proposalId: assignment.proposalId,
        proposalStatus: snapshot.proposal.status,
        readOnly: true,
        ...(assignment.withdrawnAt === undefined
          ? {}
          : { withdrawnAt: assignment.withdrawnAt }),
      },
    };
  }
  const proposal = await ctx.db.get(assignment.proposalId);
  if (!proposal) {
    return null;
  }

  const lenderConfirmation = await getCurrentLenderConfirmationStatus(
    ctx,
    proposal,
    assignment
  );

  return {
    proposal,
    row: {
      assignedAt: assignment.assignedAt,
      assignmentId: assignment._id,
      assignmentStatus: assignment.status,
      buildName: proposal.buildName,
      lenderConfirmation,
      location: proposal.location,
      proposalId: proposal._id,
      proposalStatus: proposal.status,
      readOnly: false,
      ...(assignment.withdrawnAt === undefined
        ? {}
        : { withdrawnAt: assignment.withdrawnAt }),
    },
  };
}

function compareLenderProposalRows(
  left: {
    assignedAt: number;
    assignmentId: Doc<"proposalLenderAssignments">["_id"];
  },
  right: {
    assignedAt: number;
    assignmentId: Doc<"proposalLenderAssignments">["_id"];
  }
) {
  return (
    right.assignedAt - left.assignedAt ||
    String(right.assignmentId).localeCompare(String(left.assignmentId))
  );
}

async function getCurrentLenderConfirmationStatus(
  ctx: Pick<QueryCtx, "db">,
  proposal: Doc<"buildProposals">,
  assignment: LenderAssignment
): Promise<"approved" | "pending"> {
  if (!proposal.currentProposalRevisionId) {
    return "pending";
  }
  const revision = await ctx.db.get(proposal.currentProposalRevisionId);
  if (
    !revision ||
    revision.proposalId !== proposal._id ||
    revision.assignmentId !== assignment._id
  ) {
    return "pending";
  }
  const cycle = await ctx.db
    .query("proposalLenderConfirmationCycles")
    .withIndex("by_assignment_and_revision", (query) =>
      query
        .eq("assignmentId", assignment._id)
        .eq("proposalRevisionId", revision._id)
    )
    .unique();
  if (!cycle) {
    return "pending";
  }
  const decisions = await ctx.db
    .query("proposalLenderApprovals")
    .withIndex("by_confirmation_cycle", (query) =>
      query.eq("confirmationCycleId", cycle._id)
    )
    .take(2);
  return decisions.some((decision) => decision.status === "approved")
    ? "approved"
    : "pending";
}

async function projectLenderProposalPortfolioRows(
  ctx: Pick<QueryCtx, "db">,
  assignments: readonly LenderAssignment[],
  activeOrganization: ActiveLenderOrganizationContext
) {
  const assignmentsById = new Map(
    assignments.map((assignment) => [String(assignment._id), assignment])
  );
  const records = await Promise.all(
    assignments.map((assignment) =>
      projectLenderAssignedProposalRecord(ctx, assignment)
    )
  );
  const rows = await Promise.all(
    records
      .filter((record): record is NonNullable<typeof record> => record !== null)
      .map(async (record) => {
        if (record.row.assignmentStatus === "withdrawn") {
          return { ...record.row, view: "withdrawn" as const };
        }
        if (!record.proposal) {
          throw new Error(
            "Lender Proposal portfolio projection is unavailable."
          );
        }
        const assignment = assignmentsById.get(String(record.row.assignmentId));
        if (!assignment || assignment.status !== "current") {
          throw new Error(
            "Lender Proposal portfolio assignment is unavailable."
          );
        }
        return {
          ...record.row,
          view: await getLenderProposalPortfolioView(
            ctx,
            record.proposal,
            assignment,
            activeOrganization
          ),
        };
      })
  );
  return rows.sort(compareLenderProposalRows);
}

async function getLenderProposalPortfolioView(
  ctx: Pick<QueryCtx, "db">,
  proposal: Doc<"buildProposals">,
  assignment: LenderAssignment,
  activeOrganization: ActiveLenderOrganizationContext
): Promise<LenderProposalPortfolioView> {
  validateLenderProposalPortfolioScope(
    proposal,
    assignment,
    activeOrganization
  );
  if (!proposal.currentProposalRevisionId) {
    return "in_progress";
  }
  const revision = await requireLenderProposalPortfolioRevision(
    ctx,
    proposal,
    assignment
  );
  const cycle = await ctx.db
    .query("proposalLenderConfirmationCycles")
    .withIndex("by_assignment_and_revision", (query) =>
      query
        .eq("assignmentId", assignment._id)
        .eq("proposalRevisionId", revision._id)
    )
    .unique();
  if (!cycle) {
    return "in_progress";
  }
  validateLenderProposalPortfolioCycle(cycle, proposal, assignment, revision);

  if (cycle.status === "approved" || cycle.status === "declined") {
    return requireLenderProposalTerminalPortfolioView(
      ctx,
      proposal,
      assignment,
      revision,
      cycle,
      activeOrganization
    );
  }
  if (cycle.decisionId) {
    throw new Error("Lender Proposal pending cycle is unavailable.");
  }
  if (proposal.status === "closed") {
    throw new Error("Lender Proposal closed lifecycle is unavailable.");
  }

  const acknowledgedCheckpoints =
    await getLenderProposalActorAcknowledgedCheckpoints(
      ctx,
      proposal,
      assignment,
      revision,
      cycle,
      activeOrganization
    );

  if (
    PROPOSAL_CONFIRMATION_CHECKPOINTS.some(
      (checkpoint) => !acknowledgedCheckpoints.has(checkpoint)
    )
  ) {
    return "needs_action";
  }
  return canActorDecideLenderProposal(activeOrganization)
    ? "needs_action"
    : "in_progress";
}

function validateLenderProposalPortfolioScope(
  proposal: Doc<"buildProposals">,
  assignment: LenderAssignment,
  activeOrganization: ActiveLenderOrganizationContext
) {
  if (
    assignment.status !== "current" ||
    assignment.proposalId !== proposal._id ||
    assignment.organizationId !== proposal.organizationId ||
    assignment.brokerageId !== proposal.brokerageId ||
    assignment.lenderBrokerageId !== activeOrganization.brokerageId ||
    assignment.lenderOrganizationId !==
      activeOrganization.lenderOrganizationId ||
    proposal.brokerageId !== activeOrganization.brokerageId
  ) {
    throw new Error("Lender Proposal portfolio scope is unavailable.");
  }
}

async function requireLenderProposalPortfolioRevision(
  ctx: Pick<QueryCtx, "db">,
  proposal: Doc<"buildProposals">,
  assignment: LenderAssignment
) {
  const revisionId = proposal.currentProposalRevisionId;
  if (!revisionId) {
    throw new Error("Lender Proposal portfolio revision is unavailable.");
  }
  const revision = await ctx.db.get(revisionId);
  if (
    !revision ||
    revision.proposalId !== proposal._id ||
    revision.assignmentId !== assignment._id ||
    revision.organizationId !== proposal.organizationId ||
    revision.brokerageId !== proposal.brokerageId ||
    revision.revisionNumber !== proposal.currentProposalRevisionNumber
  ) {
    throw new Error("Lender Proposal portfolio revision is unavailable.");
  }
  return revision;
}

function validateLenderProposalPortfolioCycle(
  cycle: Doc<"proposalLenderConfirmationCycles">,
  proposal: Doc<"buildProposals">,
  assignment: LenderAssignment,
  revision: Doc<"proposalRevisions">
) {
  if (
    cycle.assignmentId !== assignment._id ||
    cycle.proposalId !== proposal._id ||
    cycle.proposalRevisionId !== revision._id ||
    cycle.proposalRevisionNumber !== revision.revisionNumber ||
    cycle.organizationId !== proposal.organizationId ||
    cycle.brokerageId !== proposal.brokerageId ||
    cycle.status === "superseded"
  ) {
    throw new Error("Lender Proposal portfolio cycle is unavailable.");
  }
}

async function requireLenderProposalTerminalPortfolioView(
  ctx: Pick<QueryCtx, "db">,
  proposal: Doc<"buildProposals">,
  assignment: LenderAssignment,
  revision: Doc<"proposalRevisions">,
  cycle: Doc<"proposalLenderConfirmationCycles">,
  activeOrganization: ActiveLenderOrganizationContext
): Promise<LenderProposalPortfolioView> {
  if (!cycle.decisionId) {
    throw new Error("Lender Proposal portfolio decision is unavailable.");
  }
  const decision = await ctx.db.get(cycle.decisionId);
  if (
    !decision ||
    decision.confirmationCycleId !== cycle._id ||
    decision.assignmentId !== assignment._id ||
    decision.proposalId !== proposal._id ||
    decision.proposalRevisionId !== revision._id ||
    decision.proposalRevisionNumber !== revision.revisionNumber ||
    decision.organizationId !== proposal.organizationId ||
    decision.brokerageId !== proposal.brokerageId ||
    String(decision.lenderOrganizationId) !==
      String(activeOrganization.lenderOrganizationId) ||
    decision.status !== cycle.status
  ) {
    throw new Error("Lender Proposal portfolio decision is unavailable.");
  }
  if (proposal.status === "closed") {
    if (cycle.status !== "approved") {
      throw new Error("Lender Proposal closed lifecycle is unavailable.");
    }
    return "closed";
  }
  return cycle.status === "approved" ? "approved" : "update_pending";
}

async function getLenderProposalActorAcknowledgedCheckpoints(
  ctx: Pick<QueryCtx, "db">,
  proposal: Doc<"buildProposals">,
  assignment: LenderAssignment,
  revision: Doc<"proposalRevisions">,
  cycle: Doc<"proposalLenderConfirmationCycles">,
  activeOrganization: ActiveLenderOrganizationContext
) {
  const acknowledgements = await ctx.db
    .query("proposalLenderConfirmationAcknowledgements")
    .withIndex("by_cycle_and_actor", (query) =>
      query
        .eq("confirmationCycleId", cycle._id)
        .eq("acknowledgedByWorkosUserId", activeOrganization.workosUserId)
    )
    .collect();
  const acknowledgedCheckpoints = new Set<string>();
  for (const acknowledgement of acknowledgements) {
    if (
      acknowledgement.assignmentId !== assignment._id ||
      acknowledgement.proposalId !== proposal._id ||
      acknowledgement.proposalRevisionId !== revision._id ||
      acknowledgement.confirmationCycleId !== cycle._id ||
      acknowledgement.organizationId !== proposal.organizationId ||
      acknowledgement.brokerageId !== proposal.brokerageId ||
      acknowledgement.acknowledgedByWorkosUserId !==
        activeOrganization.workosUserId ||
      !PROPOSAL_CONFIRMATION_CHECKPOINTS.includes(acknowledgement.checkpoint) ||
      acknowledgedCheckpoints.has(acknowledgement.checkpoint)
    ) {
      throw new Error(
        "Lender Proposal portfolio acknowledgement is unavailable."
      );
    }
    acknowledgedCheckpoints.add(acknowledgement.checkpoint);
  }
  return acknowledgedCheckpoints;
}

function canActorDecideLenderProposal(
  activeOrganization: ActiveLenderOrganizationContext
) {
  return (
    activeOrganization.roles.includes("admin") ||
    (activeOrganization.permissions.proposalReview &&
      activeOrganization.roles.some((role) =>
        LENDER_PROPOSAL_DECISION_ROLES.includes(
          role as (typeof LENDER_PROPOSAL_DECISION_ROLES)[number]
        )
      ))
  );
}

function paginateLenderProposalPortfolioRows<
  T extends {
    assignedAt: number;
    assignmentId: Doc<"proposalLenderAssignments">["_id"];
  },
>(input: {
  authorizedRows: T[];
  paginationOpts: PaginationOptions;
  rows: T[];
  scope: LenderProposalPortfolioView;
}) {
  const cursor = parseValidatedLenderQueueCursor({
    cursor: input.paginationOpts.cursor,
    getAnchorId: (row) => String(row.assignmentId),
    getAnchorValue: (row) => row.assignedAt,
    label: "Proposal",
    rows: input.authorizedRows,
    scope: input.scope,
  });
  const endCursor = parseValidatedLenderQueueCursor({
    cursor: input.paginationOpts.endCursor ?? null,
    getAnchorId: (row) => String(row.assignmentId),
    getAnchorValue: (row) => row.assignedAt,
    label: "Proposal",
    rows: input.authorizedRows,
    scope: input.scope,
  });
  const afterStart = cursor
    ? input.rows.filter((row) =>
        lenderProposalPortfolioRowIsAfterCursor(row, cursor)
      )
    : input.rows;
  const candidates = endCursor
    ? afterStart.filter(
        (row) => !lenderProposalPortfolioRowIsAfterCursor(row, endCursor)
      )
    : afterStart;
  const page = endCursor
    ? candidates
    : candidates.slice(0, input.paginationOpts.numItems);
  if (endCursor) {
    return {
      continueCursor: input.paginationOpts.endCursor ?? "",
      isDone: true,
      page,
    };
  }
  const isDone = candidates.length <= input.paginationOpts.numItems;
  const last = page.at(-1);
  return {
    continueCursor:
      isDone || !last
        ? ""
        : encodeLenderQueueCursor({
            position: {
              anchorId: String(last.assignmentId),
              anchorValue: last.assignedAt,
            },
            scope: input.scope,
          }),
    isDone,
    page,
  };
}

function lenderProposalPortfolioRowIsAfterCursor(
  row: {
    assignedAt: number;
    assignmentId: Doc<"proposalLenderAssignments">["_id"];
  },
  cursor: { anchorId: string; anchorValue: number }
) {
  return (
    row.assignedAt < cursor.anchorValue ||
    (row.assignedAt === cursor.anchorValue &&
      String(row.assignmentId).localeCompare(cursor.anchorId) < 0)
  );
}

function validateLenderProposalPortfolioPageSize(numItems: number) {
  if (
    !Number.isSafeInteger(numItems) ||
    numItems < 1 ||
    numItems > LENDER_PROPOSAL_PORTFOLIO_MAX_PAGE_SIZE
  ) {
    throw new ConvexError({
      code: "INVALID_PAGINATION_PAGE_SIZE",
      message: `Proposal portfolio page size must be between 1 and ${LENDER_PROPOSAL_PORTFOLIO_MAX_PAGE_SIZE}.`,
      recoverable: true,
    });
  }
}

async function projectLenderActiveBuilds(
  ctx: Pick<QueryCtx, "db">,
  assignments: readonly LenderAssignment[]
) {
  const rows = await Promise.all(
    assignments
      .filter((assignment) => assignment.status === "current")
      .map(async (assignment) => {
        const proposal = await ctx.db.get(assignment.proposalId);
        if (!proposal?.activeBuildId) {
          return null;
        }

        const build = await ctx.db.get(proposal.activeBuildId);
        if (!build || build.proposalId !== proposal._id) {
          return null;
        }

        return {
          buildId: build._id,
          buildName: build.buildName,
          location: build.location,
          proposalId: proposal._id,
          status: build.status,
          updatedAt: build.updatedAt,
        };
      })
  );

  return rows
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, LENDER_PORTAL_RESULT_LIMIT);
}

async function requireAccessibleLenderBuild(
  ctx: LenderPortalQueryCtx,
  buildId: Doc<"activeBuilds">["_id"]
) {
  const accessibleBuild = (await listAccessibleLenderBuilds(ctx)).find(
    (row) => row.build._id === buildId
  );
  if (!accessibleBuild) {
    throw new Error("Forbidden: lender Build access");
  }
  return accessibleBuild.build;
}

export const listLenderAssignedProposals = lenderOrganizationQuery
  .input({})
  .returns(v.array(lenderProposalListRow))
  .handler(async (ctx) => {
    const assignments = await latestLenderAssignments({
      db: ctx.db,
      scope: {
        brokerageId: ctx.activeOrganization.brokerageId,
        lenderOrganizationId: ctx.activeOrganization.lenderOrganizationId,
      },
    });
    return projectLenderAssignedProposals(ctx, assignments);
  })
  .public();

export const listLenderAssignedProposalPage = lenderOrganizationQuery
  .input({
    paginationOpts: paginationOptsValidator,
    view: lenderProposalPortfolioViewValidator,
  })
  .returns(lenderProposalPortfolioPage)
  .handler(async (ctx, args) => {
    validateLenderProposalPortfolioPageSize(args.paginationOpts.numItems);
    const assignments = await latestLenderAssignments({
      db: ctx.db,
      scope: {
        brokerageId: ctx.activeOrganization.brokerageId,
        lenderOrganizationId: ctx.activeOrganization.lenderOrganizationId,
      },
    });
    const authorizedRows = await projectLenderProposalPortfolioRows(
      ctx,
      assignments.filter((assignment) =>
        args.view === "withdrawn"
          ? assignment.status === "withdrawn"
          : assignment.status === "current"
      ),
      ctx.activeOrganization
    );
    const rows = authorizedRows.filter((row) => row.view === args.view);
    return paginateLenderProposalPortfolioRows({
      authorizedRows,
      paginationOpts: args.paginationOpts,
      rows,
      scope: args.view,
    });
  })
  .public();

export const listLenderActiveBuilds = lenderOrganizationQuery
  .input({})
  .returns(v.array(lenderBuildListRow))
  .handler(async (ctx) => {
    const assignments = await latestLenderAssignments({
      db: ctx.db,
      scope: {
        brokerageId: ctx.activeOrganization.brokerageId,
        lenderOrganizationId: ctx.activeOrganization.lenderOrganizationId,
      },
    });
    return projectLenderActiveBuilds(ctx, assignments);
  })
  .public();

export const getLenderBuildDetail = lenderOrganizationQuery
  .input({ buildId: v.id("activeBuilds") })
  .returns(lenderBuildDetailData)
  .handler(async (ctx, args) => {
    const build = await requireAccessibleLenderBuild(ctx, args.buildId);
    const [
      eligibleLenderWorkosUserIds,
      builder,
      facilities,
      capitalEvents,
      milestones,
      drawRequests,
      submilestones,
      drawAllocations,
      plannedDraws,
    ] = await Promise.all([
      currentLenderApproverMaps(ctx),
      ctx.db.get(build.builderProfileId),
      ctx.db
        .query("loanFacilities")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(50),
      ctx.db
        .query("capitalEvents")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(501),
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build_order", (query) => query.eq("buildId", build._id))
        .take(501),
      ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(501),
      ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(501),
      ctx.db
        .query("activeBuildDrawRequestAllocations")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(501),
      ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(501),
    ]);
    if (
      !builder ||
      builder.organizationId !== build.organizationId ||
      builder.brokerageId !== build.brokerageId ||
      capitalEvents.length > 500 ||
      milestones.length > 500 ||
      drawRequests.length > 500 ||
      submilestones.length > 500 ||
      drawAllocations.length > 500 ||
      plannedDraws.length > 500
    ) {
      throw new Error("Lender Build record limit exceeded");
    }

    assertLenderBuildScopedRows(build, [
      ...facilities,
      ...capitalEvents,
      ...milestones,
      ...drawRequests,
      ...submilestones,
      ...drawAllocations,
      ...plannedDraws,
    ]);

    const visibleMilestones = milestones.filter(isCurrentBuildMilestone);
    const visibleDraws = drawRequests.filter(isCurrentBuildDrawRequest);
    const drawReviewStates = new Map(
      await Promise.all(
        visibleDraws.map(async (drawRequest) => {
          const cycle = await lenderDrawQueueReviewCycle(
            ctx,
            build,
            drawRequest
          );
          return [
            drawRequest._id,
            cycle
              ? await reviewerQueueRow(ctx, {
                  build,
                  cycle,
                  eligibleLenderIds: eligibleLenderWorkosUserIds.draw,
                  group: "lender",
                  viewerWorkosUserId: ctx.activeOrganization.workosUserId,
                })
              : null,
          ] as const;
        })
      )
    );
    const milestoneReviewStates = new Map(
      await Promise.all(
        visibleMilestones.map(async (milestone) => {
          const cycle = await lenderMilestoneQueueReviewCycle(
            ctx,
            build,
            milestone
          );
          return [
            milestone._id,
            cycle
              ? await reviewerQueueRow(ctx, {
                  build,
                  cycle,
                  eligibleLenderIds: eligibleLenderWorkosUserIds.milestone,
                  group: "lender",
                  viewerWorkosUserId: ctx.activeOrganization.workosUserId,
                })
              : null,
          ] as const;
        })
      )
    );
    const actionRequiredDraws = [...drawReviewStates.values()].filter(
      (state) => state?.actionRequired
    ).length;
    const actionRequiredMilestones = [...milestoneReviewStates.values()].filter(
      (state) => state?.actionRequired
    ).length;
    const facility = [...facilities]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .find((candidate) => candidate.status === "active");
    const releasedCents = capitalEvents
      .filter((event) => event.eventType === "draw_release")
      .reduce((total, event) => total + event.amountCents, 0);
    const funding = activeBuildDrawFundingSnapshotFromRows({
      allocations: drawAllocations,
      allowLegacyUnattributedRequests: true,
      facilities,
      milestones,
      plannedDraws,
      requests: drawRequests,
    });
    const submilestonesByMilestone = new Map<
      string,
      Doc<"buildSubmilestones">[]
    >();
    for (const submilestone of submilestones) {
      if (submilestone.planningState === "superseded") {
        continue;
      }
      const key = String(submilestone.buildMilestoneId);
      const current = submilestonesByMilestone.get(key) ?? [];
      current.push(submilestone);
      submilestonesByMilestone.set(key, current);
    }
    const milestoneRows = await Promise.all(
      visibleMilestones.map((milestone) =>
        projectLenderBuildMilestone(ctx, {
          build,
          milestone,
          reviewState: milestoneReviewStates.get(milestone._id) ?? null,
          submilestones:
            submilestonesByMilestone.get(String(milestone._id)) ?? [],
        })
      )
    );
    const drawActionItems = new Map(
      await Promise.all(
        visibleDraws.map(
          async (drawRequest) =>
            [
              drawRequest._id,
              await projectLenderDrawActionItems(ctx, {
                build,
                drawRequest,
                plannedDraws,
              }),
            ] as const
        )
      )
    );

    return {
      build: {
        buildId: build._id,
        buildName: build.buildName,
        location: build.location,
        startDate: build.startDate,
        status: build.status,
        timezone: build.timezone ?? null,
        totalBudgetCents: build.totalBudgetCents,
        updatedAt: build.updatedAt,
      },
      builder: { displayName: builder.displayName },
      collaboration: await projectLenderBuildWideCollaboration(ctx, build),
      draws: visibleDraws.map((drawRequest) => {
        const beforeRequest = activeBuildDrawFundingSnapshotFromRows({
          allocations: drawAllocations,
          allowLegacyUnattributedRequests: true,
          facilities,
          ignoreUnattributedRequestIds: new Set([String(drawRequest._id)]),
          milestones,
          plannedDraws,
          requests: drawRequests,
        });
        const remainingAfterCents =
          beforeRequest.availableCents - drawRequest.amountCents;
        return {
          actionItems: drawActionItems.get(drawRequest._id) ?? [],
          actionRequired:
            drawReviewStates.get(drawRequest._id)?.actionRequired ?? false,
          amountCents: drawRequest.amountCents,
          currentReviewCycleId:
            drawRequest.currentLenderPortalReviewCycleId ?? null,
          currentReviewCycleNumber:
            drawRequest.currentLenderPortalReviewCycleNumber ?? null,
          displayId: drawRequest.displayId,
          drawRequestId: drawRequest._id,
          fundingPosition: {
            availableBeforeCents: beforeRequest.availableCents,
            reconciled: remainingAfterCents >= 0,
            remainingAfterCents,
          },
          label: drawRequest.label,
          lenderPortalReviewState: drawRequest.lenderPortalReviewState ?? null,
          note: drawRequest.note ?? null,
          requestedAt: drawRequest.requestedAt,
          status: drawRequest.status,
          updatedAt: drawRequest.updatedAt,
          workOrderKey: drawRequest.workOrderKey ?? null,
        };
      }),
      facility: facility
        ? {
            interestAnnualBps: facility.interestAnnualBps,
            interestStartsOn: facility.interestStartsOn,
            principalCents: facility.principalCents,
          }
        : null,
      funding: {
        approvedMilestoneCents: funding.approvedMilestoneCents,
        availableCents: funding.availableCents,
        facilityCents: funding.facilityCents,
        releasedCents,
        reservedCents: funding.reservedCents,
        unlockedCents: funding.unlockedCents,
      },
      milestones: milestoneRows,
      releasedCents,
      reviewSummary:
        actionRequiredDraws + actionRequiredMilestones > 0
          ? `${actionRequiredDraws + actionRequiredMilestones} lender review request${actionRequiredDraws + actionRequiredMilestones === 1 ? "" : "s"} require attention.`
          : "No current lender review requests.",
    };
  })
  .public();

function addUtcDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function projectLenderDrawActionItems(
  ctx: QueryCtx,
  input: {
    build: Doc<"activeBuilds">;
    drawRequest: Doc<"activeBuildDrawRequests">;
    plannedDraws: Doc<"plannedDrawScheduleRows">[];
  }
) {
  const { build, drawRequest } = input;
  const plannedDraw = drawRequest.plannedDrawKey
    ? input.plannedDraws.find(
        (row) =>
          row.buildId === build._id &&
          row.drawKey === drawRequest.plannedDrawKey
      )
    : undefined;
  const occurrenceKey = plannedDraw
    ? drawSystemOccurrenceKey(build, plannedDraw)
    : `draw-system:${String(build._id)}:${String(build.proposalId)}:request:${String(drawRequest._id)}`;
  const post = await ctx.db
    .query("buildCollaborationPosts")
    .withIndex("by_buildId_and_systemPostKind_and_drawOccurrenceKey", (query) =>
      query
        .eq("buildId", build._id)
        .eq("systemPostKind", "draw")
        .eq("canonicalBuildDrawOccurrenceKey", occurrenceKey)
    )
    .unique();
  if (!post) {
    return [];
  }
  if (
    post.organizationId !== build.organizationId ||
    post.brokerageId !== build.brokerageId ||
    post.source !== "system" ||
    post.systemPostKind !== "draw" ||
    post.canonicalBuildDrawOccurrenceKey !== occurrenceKey ||
    post.primaryReferenceKind !== "draw" ||
    post.contentState !== "active" ||
    post.tombstonedAt !== undefined
  ) {
    throw new Error("Lender Draw Action Items are unavailable");
  }
  const actionItems = await ctx.db
    .query("buildActionItems")
    .withIndex("by_originatingPostId_and_createdAt", (query) =>
      query.eq("originatingPostId", post._id)
    )
    .take(2001);
  if (actionItems.length > 2000) {
    throw new Error("Lender Draw Action Item record limit exceeded");
  }
  for (const item of actionItems) {
    if (
      item.originatingPostId !== post._id ||
      item.buildId !== build._id ||
      item.organizationId !== build.organizationId ||
      item.brokerageId !== build.brokerageId
    ) {
      throw new Error("Lender Draw Action Items are unavailable");
    }
  }
  return actionItems
    .map((item) => ({
      actionItemId: item._id,
      status: item.status,
      title: item.title,
      updatedAt: item.updatedAt,
    }))
    .sort(
      (left, right) =>
        right.updatedAt - left.updatedAt ||
        String(left.actionItemId).localeCompare(String(right.actionItemId))
    );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: One fail-closed projection keeps exact review evidence, cost coverage, dates, and child scope consistent.
async function projectLenderBuildMilestone(
  ctx: QueryCtx,
  input: {
    build: Doc<"activeBuilds">;
    milestone: Doc<"buildMilestones">;
    reviewState: Awaited<ReturnType<typeof reviewerQueueRow>> | null;
    submilestones: Doc<"buildSubmilestones">[];
  }
) {
  const { build, milestone } = input;
  for (const submilestone of input.submilestones) {
    if (
      submilestone.buildId !== build._id ||
      submilestone.buildMilestoneId !== milestone._id ||
      submilestone.organizationId !== build.organizationId ||
      submilestone.brokerageId !== build.brokerageId ||
      submilestone.milestoneKey !== milestone.key
    ) {
      throw new Error("Lender Build Milestone detail is unavailable");
    }
  }
  const orderedSubmilestones = [...input.submilestones].sort(
    (left, right) =>
      left.order - right.order ||
      left.key.localeCompare(right.key) ||
      String(left._id).localeCompare(String(right._id))
  );
  const completedAtValues = orderedSubmilestones
    .map((submilestone) => submilestone.completedAt)
    .filter((value): value is number => typeof value === "number");
  const actualCompletedAt =
    orderedSubmilestones.length > 0 &&
    completedAtValues.length === orderedSubmilestones.length
      ? Math.max(...completedAtValues)
      : null;
  const currentReview = await projectCurrentMilestoneReviewEvidence(
    ctx,
    build,
    milestone
  );
  const references = currentReview?.evidence.evidenceReferences ?? [];
  const files = currentReview?.evidence.files ?? [];
  const contractorAssignments = await ctx.db
    .query("milestoneContractorAssignments")
    .withIndex("by_build_milestone", (query) =>
      query.eq("buildId", build._id).eq("milestoneKey", milestone.key)
    )
    .take(501);
  if (contractorAssignments.length > 500) {
    throw new Error("Lender Build Milestone contractor limit exceeded");
  }
  const contractors = await Promise.all(
    contractorAssignments.map(async (assignment) => {
      const contractor = await ctx.db.get(assignment.contractorId);
      if (
        !contractor ||
        assignment.buildId !== build._id ||
        assignment.buildMilestoneId !== milestone._id ||
        assignment.organizationId !== build.organizationId ||
        assignment.brokerageId !== build.brokerageId ||
        contractor.organizationId !== build.organizationId ||
        contractor.brokerageId !== build.brokerageId
      ) {
        throw new Error("Lender Build Milestone contractor is unavailable");
      }
      if (
        assignment.buildSubmilestoneId !== undefined &&
        !input.submilestones.some(
          (submilestone) =>
            submilestone._id === assignment.buildSubmilestoneId &&
            submilestone.key === assignment.submilestoneKey
        )
      ) {
        throw new Error("Lender Build Milestone contractor is unavailable");
      }
      return {
        contractorId: contractor._id,
        name: contractor.name,
        role: assignment.role,
        status: assignment.status,
        submilestoneId: assignment.buildSubmilestoneId ?? null,
      };
    })
  );
  const documents = await Promise.all(
    references
      .filter((reference) => reference.kind === "cost_document")
      .map(async (reference) => {
        const [allocations, components] = await Promise.all([
          ctx.db
            .query("costDocumentAllocations")
            .withIndex("by_costDocumentId_and_order", (query) =>
              query.eq("costDocumentId", reference.costDocumentId)
            )
            .take(501),
          ctx.db
            .query("costDocumentFinancialComponents")
            .withIndex("by_costDocumentId_and_order", (query) =>
              query.eq("costDocumentId", reference.costDocumentId)
            )
            .take(101),
        ]);
        if (allocations.length > 500 || components.length > 100) {
          throw new Error("Lender Build cost document detail limit exceeded");
        }
        for (const row of [...allocations, ...components]) {
          if (
            row.buildId !== build._id ||
            row.organizationId !== build.organizationId ||
            row.brokerageId !== build.brokerageId ||
            row.costDocumentId !== reference.costDocumentId
          ) {
            throw new Error("Lender Build cost document detail is unavailable");
          }
        }
        for (const allocation of allocations) {
          if (
            !input.submilestones.some(
              (submilestone) =>
                submilestone._id === allocation.buildSubmilestoneId &&
                submilestone.key === allocation.submilestoneKeySnapshot
            )
          ) {
            throw new Error("Lender Build cost document detail is unavailable");
          }
        }
        const sumComponents = (kind: "subtotal" | "tax") => {
          const rows = components.filter(
            (component) => component.kind === kind
          );
          return rows.length > 0
            ? rows.reduce(
                (total, component) => total + component.amountCents,
                0
              )
            : null;
        };
        return {
          allocations: allocations.map((allocation) => ({
            amountCents: allocation.amountCents,
            buildSubmilestoneId: allocation.buildSubmilestoneId,
          })),
          amountCents: reference.amountCents,
          costDocumentId: reference.costDocumentId,
          kind: reference.documentKind,
          label: reference.label,
          pages: files
            .filter(
              (file) =>
                file.reference.kind === "cost_document_page" &&
                file.reference.costDocumentId === reference.costDocumentId
            )
            .map((file) => ({
              assetId:
                file.reference.kind === "cost_document_page"
                  ? file.reference.assetId
                  : (() => {
                      throw new Error("Lender Build cost page is unavailable");
                    })(),
              downloadUrl: file.downloadUrl,
              fileName: file.fileName,
              mimeType: file.mimeType,
            })),
          subtotalCents: sumComponents("subtotal"),
          taxCents: sumComponents("tax"),
        };
      })
  );
  const documentedCents = documents.reduce(
    (total, document) => total + document.amountCents,
    0
  );
  const submission =
    currentReview?.submission.kind === "milestone"
      ? currentReview.submission
      : null;
  const actualCostCents = submission?.actualCostCents ?? null;
  const receiptRequired =
    currentReview?.requirements.receiptInvoiceRequired ?? false;
  const receiptCoverageState = receiptRequired
    ? documentedCents === 0
      ? ("not_recorded" as const)
      : actualCostCents !== null && documentedCents < actualCostCents
        ? ("partial" as const)
        : ("covered" as const)
    : ("not_required" as const);
  const assetReferences = references.filter(
    (reference) => reference.kind === "asset"
  );
  const reviewEvidence = assetReferences.map((reference) => {
    const file = files.find(
      (candidate) =>
        candidate.reference.kind === "asset" &&
        candidate.reference.evidenceAssetId === reference.evidenceAssetId
    );
    if (!file) {
      throw new Error("Lender Build review evidence is unavailable");
    }
    return {
      downloadUrl: file.downloadUrl,
      evidenceAssetId: reference.evidenceAssetId,
      fileName: file.fileName,
      label: reference.label,
      locationVerified: reference.locationVerified,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      source:
        reference.association.kind === "site_visit"
          ? ("site_visit" as const)
          : ("evidence_package" as const),
      siteVisitId:
        reference.association.kind === "site_visit"
          ? reference.association.siteVisitId
          : null,
      submilestoneKey: reference.submilestoneKey ?? null,
    };
  });
  const siteVisitReferences = references.filter(
    (reference) => reference.kind === "site_visit"
  );
  if (
    new Set(siteVisitReferences.map((reference) => reference.siteVisitId))
      .size !== siteVisitReferences.length
  ) {
    throw new Error("Lender Build Site Visit is unavailable");
  }
  const siteVisitRows = await Promise.all(
    siteVisitReferences.map(async (reference) => ({
      reference,
      row: await ctx.db.get(reference.siteVisitId),
    }))
  );
  const siteVisits = siteVisitRows.map(({ reference, row }) => {
    if (
      !row ||
      row.buildId !== build._id ||
      row.buildMilestoneId !== milestone._id ||
      row.milestoneKey !== milestone.key ||
      row.organizationId !== build.organizationId ||
      row.brokerageId !== build.brokerageId ||
      (row.submilestoneId !== undefined &&
        !input.submilestones.some(
          (submilestone) => submilestone._id === row.submilestoneId
        ))
    ) {
      throw new Error("Lender Build Site Visit is unavailable");
    }
    return {
      completedAt: reference.completedAt,
      photoCount: assetReferences.filter(
        (assetReference) =>
          assetReference.association.kind === "site_visit" &&
          assetReference.association.siteVisitId === reference.siteVisitId
      ).length,
      report: reference.report,
      requestedAt: row.requestedAt,
      requestedDay: row.requestedDay,
      siteVisitId: reference.siteVisitId,
      submilestoneId: row.submilestoneId ?? null,
      tokenExpiresAt: row.tokenExpiresAt,
      tokenOpenedAt: row.tokenOpenedAt ?? null,
      updatedAt: row.updatedAt,
      visitId: row.visitId,
    };
  });
  const firstSiteVisit = siteVisits[0];
  const siteVisit = firstSiteVisit
    ? {
        completedAt: firstSiteVisit.completedAt,
        photoCount: firstSiteVisit.photoCount,
        report: firstSiteVisit.report,
        requestedAt: firstSiteVisit.requestedAt,
        siteVisitId: firstSiteVisit.siteVisitId,
        submilestoneId: firstSiteVisit.submilestoneId,
      }
    : null;

  return {
    actualCompletedAt,
    actualStartedAt: milestone.actualStartedAt ?? null,
    actionRequired: input.reviewState?.actionRequired ?? false,
    budgetCents: milestone.budgetCents,
    buildMilestoneId: milestone._id,
    contractors: contractors.map(
      ({ submilestoneId: _submilestoneId, ...row }) => row
    ),
    dayEnd: milestone.dayEnd,
    dayStart: milestone.dayStart,
    drawAvailabilityCents: milestone.drawAvailabilityCents,
    durationDays: milestone.durationDays,
    key: milestone.key,
    name: milestone.name,
    order: milestone.order,
    plannedEndDate: addUtcDays(build.startDate, milestone.dayEnd),
    plannedStartDate: addUtcDays(build.startDate, milestone.dayStart),
    progressPercent: milestone.progressPercent ?? null,
    receiptCoverage: {
      actualCostCents,
      documentedCents,
      documents,
      required: receiptRequired,
      state: receiptCoverageState,
    },
    reviewCycleId: milestone.currentLenderPortalReviewCycleId ?? null,
    reviewCycleNumber: milestone.currentLenderPortalReviewCycleNumber ?? null,
    reviewEvidence,
    reviewState: milestone.lenderPortalReviewState ?? null,
    siteVisit,
    siteVisits,
    status: milestone.status,
    submilestones: orderedSubmilestones.map((submilestone) => ({
      actualCostCents: submilestone.actualCostCents ?? null,
      actualStartedAt: submilestone.actualStartedAt ?? null,
      assignments: contractors
        .filter((contractor) => contractor.submilestoneId === submilestone._id)
        .map(({ submilestoneId: _submilestoneId, ...row }) => row),
      budgetCents: submilestone.budgetCents ?? 0,
      completedAt: submilestone.completedAt ?? null,
      // Field notes are operational/private; the lender projection exposes
      // only the canonical child identity and execution facts.
      description: "",
      durationDays: submilestone.durationDays ?? null,
      key: submilestone.key,
      name: submilestone.name,
      order: submilestone.order,
      progressPercent: submilestone.progressPercent ?? null,
      startDay: submilestone.startDay ?? null,
      status: submilestone.status,
      submilestoneId: submilestone._id,
    })),
  };
}

async function projectLenderBuildWideCollaboration(
  ctx: QueryCtx,
  build: Doc<"activeBuilds">
) {
  const posts = await ctx.db
    .query("buildCollaborationPosts")
    .withIndex("by_buildId_and_lastMeaningfulActivityAt", (query) =>
      query.eq("buildId", build._id)
    )
    .order("desc")
    .take(501);
  if (posts.length > 500) {
    throw new Error("Lender Build Collaboration record limit exceeded");
  }
  const visiblePosts = posts.filter(
    (post) =>
      post.audienceMode === "build_wide" &&
      post.contentState === "active" &&
      post.source !== "system" &&
      post.currentRevisionId !== undefined &&
      post.tombstonedAt === undefined
  );
  return await Promise.all(
    visiblePosts.map(async (post) => {
      if (
        post.buildId !== build._id ||
        post.organizationId !== build.organizationId ||
        post.brokerageId !== build.brokerageId ||
        !post.currentRevisionId
      ) {
        throw new Error("Lender Build Collaboration is unavailable");
      }
      const revision = await ctx.db.get(post.currentRevisionId);
      if (
        !revision ||
        revision.postId !== post._id ||
        revision.buildId !== build._id ||
        revision.organizationId !== build.organizationId ||
        revision.brokerageId !== build.brokerageId ||
        revision.revision !== post.revision
      ) {
        throw new Error("Lender Build Collaboration is unavailable");
      }
      return {
        body: revision.plainText,
        postId: post._id,
        primaryReferenceId:
          post.primaryReferenceKind === "milestone" ||
          post.primaryReferenceKind === "submilestone" ||
          post.primaryReferenceKind === "draw"
            ? (post.primaryReferenceId ?? null)
            : null,
        primaryReferenceKind:
          post.primaryReferenceKind === "milestone" ||
          post.primaryReferenceKind === "submilestone" ||
          post.primaryReferenceKind === "draw"
            ? post.primaryReferenceKind
            : null,
        publishedAt: revision.createdAt,
        sourceLabel:
          post.authorRole === "builder" || post.authorRole === "builder-staff"
            ? "Builder team"
            : "Build participant",
      };
    })
  );
}

async function lenderDrawQueueReviewCycle(
  ctx: Pick<QueryCtx, "db">,
  build: Doc<"activeBuilds">,
  drawRequest: Doc<"activeBuildDrawRequests">
) {
  const cycleId = drawRequest.currentLenderPortalReviewCycleId;
  const cycleNumber = drawRequest.currentLenderPortalReviewCycleNumber;
  if (!cycleId || cycleNumber === undefined) {
    return null;
  }

  const cycle = await ctx.db.get(cycleId);
  if (
    !cycle ||
    cycle.kind !== "draw" ||
    cycle.drawRequestId !== drawRequest._id ||
    cycle.submission.kind !== "draw" ||
    cycle.submission.drawRequestId !== drawRequest._id ||
    cycle.requestIdentity !== `draw:${String(drawRequest._id)}` ||
    cycle.buildId !== build._id ||
    cycle.brokerageId !== build.brokerageId ||
    cycle.organizationId !== build.organizationId ||
    !cycle.isCurrent ||
    cycle.cycleNumber !== cycleNumber
  ) {
    return null;
  }

  return cycle;
}

async function lenderMilestoneQueueReviewCycle(
  ctx: Pick<QueryCtx, "db">,
  build: Doc<"activeBuilds">,
  milestone: Doc<"buildMilestones">
) {
  const cycleId = milestone.currentLenderPortalReviewCycleId;
  const cycleNumber = milestone.currentLenderPortalReviewCycleNumber;
  if (!cycleId || cycleNumber === undefined) {
    return null;
  }

  const cycle = await ctx.db.get(cycleId);
  if (
    !cycle ||
    cycle.kind !== "milestone" ||
    cycle.milestoneId !== milestone._id ||
    cycle.submission.kind !== "milestone" ||
    cycle.submission.milestoneId !== milestone._id ||
    cycle.requestIdentity !== `milestone:${String(milestone._id)}` ||
    cycle.buildId !== build._id ||
    cycle.brokerageId !== build.brokerageId ||
    cycle.organizationId !== build.organizationId ||
    !cycle.isCurrent ||
    cycle.cycleNumber !== cycleNumber
  ) {
    return null;
  }

  return cycle;
}

function lenderDrawQueueReviewCycleProjection(
  cycle: Doc<"lenderPortalReviewCycles">,
  canonical: Awaited<ReturnType<typeof reviewerQueueRow>>
) {
  const evidencePackageRevisionIds = new Set<string>();
  let locationReferenceCount = 0;
  let locationVerifiedCount = 0;

  for (const reference of cycle.evidenceReferences) {
    if (reference.kind === "package_revision") {
      evidencePackageRevisionIds.add(
        String(reference.evidencePackageRevisionId)
      );
    }
    if (reference.kind === "asset") {
      locationReferenceCount += 1;
      if (reference.locationVerified) {
        locationVerifiedCount += 1;
      }
      if (reference.association.kind === "package_revision") {
        evidencePackageRevisionIds.add(
          String(reference.association.evidencePackageRevisionId)
        );
      }
    }
  }

  return {
    approvedGroups: canonical.approvedGroups,
    evidencePackageRevisionCount: evidencePackageRevisionIds.size,
    evidenceReferenceCount: cycle.evidenceReferences.length,
    lenderApprovalCount: canonical.lenderApprovalCount,
    lenderQuorum: cycle.requirements.lenderQuorum,
    locationReferenceCount,
    locationVerifiedCount,
    requiredGroups: cycle.requirements.requiredGroups,
    state: canonical.state,
  };
}

export const getLenderDrawQueue = lenderOrganizationQuery
  .input({
    paginationOpts: paginationOptsValidator,
    scope: v.union(v.literal("action"), v.literal("all")),
  })
  .returns(lenderDrawQueuePage)
  .handler(async (ctx, args) => {
    validateLenderDrawQueuePageSize(args.paginationOpts.numItems);
    const [accessibleBuilds, eligibleLenderWorkosUserIds] = await Promise.all([
      listAccessibleLenderBuilds(ctx),
      currentLenderApproverMaps(ctx),
    ]);
    const rows = await Promise.all(
      accessibleBuilds.map(async ({ build }) => {
        const [
          builder,
          drawRequests,
          milestones,
          allocations,
          facilities,
          plannedDraws,
        ] = await Promise.all([
          ctx.db.get(build.builderProfileId),
          ctx.db
            .query("activeBuildDrawRequests")
            .withIndex("by_build", (query) => query.eq("buildId", build._id)),
          exhaustRows(
            ctx.db
              .query("buildMilestones")
              .withIndex("by_build", (query) => query.eq("buildId", build._id))
          ),
          exhaustRows(
            ctx.db
              .query("activeBuildDrawRequestAllocations")
              .withIndex("by_build", (query) => query.eq("buildId", build._id))
          ),
          exhaustRows(
            ctx.db
              .query("loanFacilities")
              .withIndex("by_build", (query) => query.eq("buildId", build._id))
          ),
          exhaustRows(
            ctx.db
              .query("plannedDrawScheduleRows")
              .withIndex("by_build", (query) => query.eq("buildId", build._id))
          ),
        ]);
        const allDrawRequests = await exhaustRows(drawRequests);
        if (
          !builder ||
          builder.brokerageId !== build.brokerageId ||
          builder.organizationId !== build.organizationId
        ) {
          throw new Error("Lender Draw builder scope is unavailable.");
        }
        return await Promise.all(
          allDrawRequests
            .filter(
              (drawRequest) =>
                drawRequest.status !== "cancelled" &&
                drawRequest.status !== "withdrawn"
            )
            .map(async (drawRequest) => {
              const fundingPosition = activeBuildDrawFundingSnapshotFromRows({
                allocations,
                allowLegacyUnattributedRequests: true,
                facilities,
                ignoreUnattributedRequestIds: new Set([
                  String(drawRequest._id),
                ]),
                milestones,
                plannedDraws,
                requests: allDrawRequests,
              });
              const remainingAfterCents =
                fundingPosition.availableCents - drawRequest.amountCents;
              const reviewCycle = await lenderDrawQueueReviewCycle(
                ctx,
                build,
                drawRequest
              );
              const canonicalReview = reviewCycle
                ? await reviewerQueueRow(ctx, {
                    build,
                    cycle: reviewCycle,
                    eligibleLenderIds: eligibleLenderWorkosUserIds.draw,
                    group: "lender",
                    viewerWorkosUserId: ctx.activeOrganization.workosUserId,
                  })
                : null;
              return {
                actionRequired: canonicalReview?.actionRequired ?? false,
                amountCents: drawRequest.amountCents,
                buildId: build._id,
                buildName: build.buildName,
                builderName: builder.displayName,
                currentReviewCycleId: reviewCycle?._id ?? null,
                currentReviewCycleNumber: reviewCycle?.cycleNumber ?? null,
                displayId: drawRequest.displayId,
                drawRequestId: drawRequest._id,
                fundingPosition: {
                  availableBeforeCents: fundingPosition.availableCents,
                  reconciled: remainingAfterCents >= 0,
                  remainingAfterCents,
                },
                label: drawRequest.label,
                lenderPortalReviewState:
                  reviewCycle?.state ??
                  drawRequest.lenderPortalReviewState ??
                  null,
                location: build.location,
                note: drawRequest.note ?? null,
                requestedAt: drawRequest.requestedAt,
                reviewCycle:
                  reviewCycle && canonicalReview
                    ? lenderDrawQueueReviewCycleProjection(
                        reviewCycle,
                        canonicalReview
                      )
                    : null,
                status: drawRequest.status,
                targetAvailability:
                  canonicalReview?.targetAvailability ?? "unavailable",
                updatedAt: drawRequest.updatedAt,
                viewerActionState:
                  canonicalReview?.viewerActionState ?? "unavailable",
                viewerDecision: canonicalReview?.viewerDecision ?? null,
                workOrderKey: drawRequest.workOrderKey ?? null,
              };
            })
        );
      })
    );
    const authorizedRows = rows.flat().sort(compareLenderDrawQueueRows);
    const scopedRows =
      args.scope === "action"
        ? authorizedRows.filter((row) => row.actionRequired)
        : authorizedRows;
    return paginateLenderDrawQueueRows({
      authorizedRows,
      paginationOpts: args.paginationOpts,
      rows: scopedRows,
      scope: args.scope,
    });
  })
  .public();

async function exhaustRows<T>(rows: AsyncIterable<T>) {
  const result: T[] = [];
  for await (const row of rows) {
    result.push(row);
  }
  return result;
}

function compareLenderDrawQueueRows(
  left: {
    drawRequestId: Doc<"activeBuildDrawRequests">["_id"];
    updatedAt: number;
  },
  right: {
    drawRequestId: Doc<"activeBuildDrawRequests">["_id"];
    updatedAt: number;
  }
) {
  return (
    right.updatedAt - left.updatedAt ||
    String(right.drawRequestId).localeCompare(String(left.drawRequestId))
  );
}

function paginateLenderDrawQueueRows<
  T extends {
    drawRequestId: Doc<"activeBuildDrawRequests">["_id"];
    updatedAt: number;
  },
>(input: {
  authorizedRows: T[];
  paginationOpts: PaginationOptions;
  rows: T[];
  scope: LenderQueueScope;
}) {
  const cursor = parseValidatedLenderQueueCursor({
    cursor: input.paginationOpts.cursor,
    getAnchorId: (row) => String(row.drawRequestId),
    getAnchorValue: (row) => row.updatedAt,
    label: "Draw",
    rows: input.authorizedRows,
    scope: input.scope,
  });
  const endCursor = parseValidatedLenderQueueCursor({
    cursor: input.paginationOpts.endCursor ?? null,
    getAnchorId: (row) => String(row.drawRequestId),
    getAnchorValue: (row) => row.updatedAt,
    label: "Draw",
    rows: input.authorizedRows,
    scope: input.scope,
  });
  const afterStart = cursor
    ? input.rows.filter((row) => lenderDrawQueueRowIsAfterCursor(row, cursor))
    : input.rows;
  const candidates = endCursor
    ? afterStart.filter(
        (row) => !lenderDrawQueueRowIsAfterCursor(row, endCursor)
      )
    : afterStart;
  const page = endCursor
    ? candidates
    : candidates.slice(0, input.paginationOpts.numItems);
  if (endCursor) {
    return {
      continueCursor: input.paginationOpts.endCursor ?? "",
      isDone: true,
      page,
    };
  }
  const isDone = candidates.length <= input.paginationOpts.numItems;
  const last = page.at(-1);
  return {
    continueCursor:
      isDone || !last
        ? ""
        : encodeLenderQueueCursor({
            position: {
              anchorId: String(last.drawRequestId),
              anchorValue: last.updatedAt,
            },
            scope: input.scope,
          }),
    isDone,
    page,
  };
}

function lenderDrawQueueRowIsAfterCursor(
  row: {
    drawRequestId: Doc<"activeBuildDrawRequests">["_id"];
    updatedAt: number;
  },
  cursor: { anchorId: string; anchorValue: number }
) {
  return (
    row.updatedAt < cursor.anchorValue ||
    (row.updatedAt === cursor.anchorValue &&
      String(row.drawRequestId).localeCompare(cursor.anchorId) < 0)
  );
}

function validateLenderDrawQueuePageSize(numItems: number) {
  if (
    !Number.isSafeInteger(numItems) ||
    numItems < 1 ||
    numItems > LENDER_DRAW_QUEUE_MAX_PAGE_SIZE
  ) {
    throw new ConvexError({
      code: "INVALID_PAGE_SIZE",
      message: `Draw queue pages must contain between 1 and ${LENDER_DRAW_QUEUE_MAX_PAGE_SIZE} rows.`,
      recoverable: true,
    });
  }
}

export const getBackofficeLenderOrganizationPortfolio = adminQuery
  .input({ lenderOrganizationId: v.id("lenderOrganizations") })
  .returns(backofficeLenderOrganizationPortfolio)
  .handler(async (ctx, args) => {
    const { brokerage, organization } = await resolveLenderOrganizationTarget(
      ctx,
      args.lenderOrganizationId
    );
    const assignments = await latestLenderAssignments({
      db: ctx.db,
      scope: {
        brokerageId: brokerage._id,
        lenderOrganizationId: organization._id,
      },
    });

    const [proposals, builds] = await Promise.all([
      projectLenderAssignedProposals(ctx, assignments),
      projectLenderActiveBuilds(ctx, assignments),
    ]);

    return {
      organization: {
        id: organization._id,
        displayName: organization.displayName,
        legalName: organization.legalName,
        status: organization.status,
        brokerageId: brokerage._id,
        brokerageName: brokerage.displayName,
        permissions: organization.permissions,
      },
      proposals,
      builds,
    };
  })
  .public();

interface LenderDashboardAction {
  actionId: string;
  amountCents?: number;
  assignmentId?: Doc<"proposalLenderAssignments">["_id"];
  buildId?: Doc<"activeBuilds">["_id"];
  fact: string;
  meta: string;
  proposalId?: Doc<"buildProposals">["_id"];
  title: string;
  type: "Proposal" | "Milestone" | "Draw";
  updatedAt: number;
}

type LenderDashboardQueryCtx = Parameters<typeof reviewerQueueRow>[0] &
  LenderPortalQueryCtx;

/**
 * Return the live Variant D dashboard projection for the current application
 * lender organization. Every row is derived from the assigned proposal,
 * active Build, facility, capital-event, milestone, site-visit, and draw
 * records; this query intentionally has no representative fallback data.
 */
export const getLenderDashboard = lenderOrganizationQuery
  .input({})
  .returns(lenderDashboardData)
  .handler(async (ctx) => {
    const [
      latestAssignments,
      eligibleLenderWorkosUserIds,
      canReviewProposals,
      canReviewSiteVisits,
    ] = await Promise.all([
      latestLenderAssignments(
        {
          db: ctx.db,
          scope: {
            brokerageId: ctx.activeOrganization.brokerageId,
            lenderOrganizationId: ctx.activeOrganization.lenderOrganizationId,
          },
        },
        {
          maxScannedRows: LENDER_DASHBOARD_MAX_ASSIGNMENT_ROWS,
          overflowMessage: "Lender dashboard assignment limit exceeded",
        }
      ),
      currentLenderApproverMaps(ctx),
      canUseLenderPermission(ctx, "proposalReview"),
      canUseLenderPermission(ctx, "siteVisitReview"),
    ]);
    const assignments = latestAssignments.filter(
      (assignment) => assignment.status === "current"
    );
    const accessibleBuilds = await listAccessibleLenderBuilds(ctx, {
      assignments,
    });
    const accessibleBuildByProposalId = new Map(
      accessibleBuilds.map((row) => [String(row.proposal._id), row] as const)
    );

    const actions: LenderDashboardAction[] = [];
    const builds = new Map<Doc<"activeBuilds">["_id"], Doc<"activeBuilds">>();
    let assignedProposalCount = 0;
    let latestUpdatedAt = 0;

    for (const assignment of assignments) {
      const proposal = await ctx.db.get(assignment.proposalId);
      if (
        !proposal ||
        proposal.brokerageId !== assignment.brokerageId ||
        proposal.organizationId !== assignment.organizationId
      ) {
        continue;
      }
      assignedProposalCount += 1;
      latestUpdatedAt = Math.max(latestUpdatedAt, proposal.updatedAt);

      const accessibleBuild = accessibleBuildByProposalId.get(
        String(proposal._id)
      );
      if (accessibleBuild) {
        builds.set(accessibleBuild.build._id, accessibleBuild.build);
        latestUpdatedAt = Math.max(
          latestUpdatedAt,
          accessibleBuild.build.updatedAt
        );
      }

      if (!canReviewProposals) {
        continue;
      }
      const lenderConfirmation = await getCurrentLenderConfirmationStatus(
        ctx,
        proposal,
        assignment
      );
      if (lenderConfirmation === "pending") {
        actions.push({
          actionId: `proposal:${String(proposal._id)}`,
          assignmentId: assignment._id,
          fact: "Lender confirmation required",
          meta: `Current assignment · ${formatWorkflowStatus(proposal.status)}`,
          proposalId: proposal._id,
          title: proposal.buildName,
          type: "Proposal",
          updatedAt: proposal.updatedAt,
          ...(accessibleBuild ? { buildId: accessibleBuild.build._id } : {}),
        });
        assertLenderDashboardActionCapacity(actions);
      }
    }

    if (builds.size > LENDER_DASHBOARD_MAX_BUILDS) {
      throw new Error("Lender dashboard Build limit exceeded");
    }

    const buildProjections = await Promise.all(
      [...builds.values()].map(async (build) => {
        const [
          facilities,
          capitalEvents,
          milestones,
          siteVisits,
          drawRequests,
        ] = await Promise.all([
          ctx.db
            .query("loanFacilities")
            .withIndex("by_build", (query) => query.eq("buildId", build._id))
            .take(51),
          ctx.db
            .query("capitalEvents")
            .withIndex("by_build", (query) => query.eq("buildId", build._id))
            .take(501),
          ctx.db
            .query("buildMilestones")
            .withIndex("by_build_order", (query) =>
              query.eq("buildId", build._id)
            )
            .take(501),
          ctx.db
            .query("buildSiteVisits")
            .withIndex("by_build", (query) => query.eq("buildId", build._id))
            .take(501),
          ctx.db
            .query("activeBuildDrawRequests")
            .withIndex("by_build", (query) => query.eq("buildId", build._id))
            .take(501),
        ]);
        if (
          facilities.length > 50 ||
          capitalEvents.length > 500 ||
          milestones.length > 500 ||
          siteVisits.length > 500 ||
          drawRequests.length > 500
        ) {
          throw new Error("Lender dashboard record limit exceeded");
        }

        assertLenderBuildScopedRows(build, [
          ...facilities,
          ...capitalEvents,
          ...milestones,
          ...siteVisits,
          ...drawRequests,
        ]);

        const visibleMilestones = milestones.filter(isCurrentBuildMilestone);
        const visibleDrawRequests = drawRequests.filter(
          isCurrentBuildDrawRequest
        );
        const visibleMilestoneIds = new Set(
          visibleMilestones.map((milestone) => milestone._id)
        );
        const visibleSiteVisits = siteVisits.filter((siteVisit) =>
          visibleMilestoneIds.has(siteVisit.buildMilestoneId)
        );

        const facility = [...facilities]
          .sort((left, right) => right.updatedAt - left.updatedAt)
          .find((candidate) => candidate.status === "active");
        const facilityCents = facility?.principalCents ?? 0;
        const releasedCents = capitalEvents
          .filter((event) => event.eventType === "draw_release")
          .reduce((total, event) => total + event.amountCents, 0);
        const progressPercent = averageProgress(visibleMilestones);
        await appendLenderDashboardMilestoneActions(ctx, {
          actions,
          build,
          canReviewSiteVisits,
          eligibleLenderIds: eligibleLenderWorkosUserIds.milestone,
          milestones: visibleMilestones,
          siteVisits: visibleSiteVisits,
        });
        await appendLenderDashboardDrawActions(ctx, {
          actions,
          build,
          drawRequests: visibleDrawRequests,
          eligibleLenderIds: eligibleLenderWorkosUserIds.draw,
        });
        assertLenderDashboardActionCapacity(actions);

        const buildActions = actions.filter(
          (action) => action.buildId === build._id
        );
        const nextAction = [...buildActions].sort(
          (left, right) => right.updatedAt - left.updatedAt
        )[0];
        latestUpdatedAt = Math.max(
          latestUpdatedAt,
          build.updatedAt,
          ...visibleMilestones.map((milestone) => milestone.updatedAt),
          ...visibleDrawRequests.map((drawRequest) => drawRequest.updatedAt),
          ...visibleSiteVisits.map((siteVisit) => siteVisit.updatedAt)
        );

        return {
          build: {
            buildId: build._id,
            buildName: build.buildName,
            facilityCents,
            location: build.location,
            nextState: nextAction?.fact ?? "No action required",
            progressPercent,
            releasedCents,
            status: nextAction
              ? ("needs_action" as const)
              : build.status === "future_start"
                ? ("future_start" as const)
                : ("on_track" as const),
            updatedAt: build.updatedAt,
          },
          drawCount: visibleDrawRequests.length,
          milestoneCount: visibleMilestones.length,
        };
      })
    );

    const buildRows = buildProjections.map((projection) => projection.build);
    actions.sort((left, right) => right.updatedAt - left.updatedAt);
    const totalFacilityCents = buildRows.reduce(
      (total, build) => total + build.facilityCents,
      0
    );
    const releasedCents = buildRows.reduce(
      (total, build) => total + build.releasedCents,
      0
    );

    return {
      actions,
      builds: buildRows.sort((left, right) => right.updatedAt - left.updatedAt),
      stats: {
        activeBuildCount: buildRows.filter(
          (build) => build.status !== "future_start"
        ).length,
        assignedProposalCount,
        drawCount: buildProjections.reduce(
          (total, projection) => total + projection.drawCount,
          0
        ),
        milestoneCount: buildProjections.reduce(
          (total, projection) => total + projection.milestoneCount,
          0
        ),
        releasedCents,
        totalFacilityCents,
      },
      updatedAt: latestUpdatedAt,
    };
  })
  .public();

async function appendLenderDashboardMilestoneActions(
  ctx: LenderDashboardQueryCtx,
  input: {
    actions: LenderDashboardAction[];
    build: Doc<"activeBuilds">;
    canReviewSiteVisits: boolean;
    eligibleLenderIds: Awaited<
      ReturnType<typeof currentLenderApproverMaps>
    >["milestone"];
    milestones: Doc<"buildMilestones">[];
    siteVisits: Doc<"buildSiteVisits">[];
  }
) {
  const completedSiteVisits = new Map<string, number>();
  for (const siteVisit of input.siteVisits) {
    if (siteVisit.status === "complete") {
      completedSiteVisits.set(
        String(siteVisit.buildMilestoneId),
        Math.max(
          completedSiteVisits.get(String(siteVisit.buildMilestoneId)) ?? 0,
          siteVisit.updatedAt
        )
      );
    }
  }

  for (const milestone of input.milestones) {
    const cycle = await lenderMilestoneQueueReviewCycle(
      ctx,
      input.build,
      milestone
    );
    const reviewState = cycle
      ? await reviewerQueueRow(ctx, {
          build: input.build,
          cycle,
          eligibleLenderIds: input.eligibleLenderIds,
          group: "lender",
          viewerWorkosUserId: ctx.activeOrganization.workosUserId,
        })
      : null;
    if (reviewState?.actionRequired) {
      input.actions.push({
        actionId: `milestone:${String(milestone._id)}`,
        buildId: input.build._id,
        fact: "Lender decision required",
        meta: "Milestone ready for approval",
        title: `${input.build.buildName} · ${milestone.name}`,
        type: "Milestone",
        updatedAt: milestone.updatedAt,
      });
      continue;
    }
    const siteVisitUpdatedAt = completedSiteVisits.get(String(milestone._id));
    if (
      input.canReviewSiteVisits &&
      siteVisitUpdatedAt &&
      milestone.reviewDecisionState !== "approved"
    ) {
      input.actions.push({
        actionId: `site-visit:${String(milestone._id)}`,
        buildId: input.build._id,
        fact: "Site visit report ready",
        meta: "Completed site visit",
        title: `${input.build.buildName} · ${milestone.name}`,
        type: "Milestone",
        updatedAt: siteVisitUpdatedAt,
      });
    }
  }
}

async function appendLenderDashboardDrawActions(
  ctx: LenderDashboardQueryCtx,
  input: {
    actions: LenderDashboardAction[];
    build: Doc<"activeBuilds">;
    drawRequests: Doc<"activeBuildDrawRequests">[];
    eligibleLenderIds: Awaited<
      ReturnType<typeof currentLenderApproverMaps>
    >["draw"];
  }
) {
  for (const drawRequest of input.drawRequests) {
    const cycle = await lenderDrawQueueReviewCycle(
      ctx,
      input.build,
      drawRequest
    );
    const reviewState = cycle
      ? await reviewerQueueRow(ctx, {
          build: input.build,
          cycle,
          eligibleLenderIds: input.eligibleLenderIds,
          group: "lender",
          viewerWorkosUserId: ctx.activeOrganization.workosUserId,
        })
      : null;
    if (reviewState?.actionRequired) {
      input.actions.push({
        actionId: `draw:${String(drawRequest._id)}`,
        amountCents: drawRequest.amountCents,
        buildId: input.build._id,
        fact: "Lender approval required",
        meta: "Draw request in review",
        title: `${input.build.buildName} · ${drawRequest.label}`,
        type: "Draw",
        updatedAt: drawRequest.updatedAt,
      });
    }
  }
}

async function canUseLenderPermission(
  ctx: LenderPortalQueryCtx,
  permission:
    | "proposalReview"
    | "milestoneDecisions"
    | "drawDecisions"
    | "siteVisitReview"
) {
  try {
    await requireLenderOrganizationPermission(
      ctx,
      ctx.activeOrganization,
      permission
    );
    return true;
  } catch {
    return false;
  }
}

function assertLenderBuildScopedRows(
  build: Pick<Doc<"activeBuilds">, "_id" | "brokerageId" | "organizationId">,
  rows: ReadonlyArray<{
    brokerageId: Doc<"brokerages">["_id"];
    buildId: Doc<"activeBuilds">["_id"];
    organizationId: string;
  }>
) {
  for (const row of rows) {
    if (
      row.buildId !== build._id ||
      row.organizationId !== build.organizationId ||
      row.brokerageId !== build.brokerageId
    ) {
      throw new Error("Lender Build data is unavailable");
    }
  }
}

function isCurrentBuildMilestone(milestone: Doc<"buildMilestones">) {
  return (
    milestone.planningState !== "superseded" &&
    milestone.supersededAt === undefined
  );
}

function isCurrentBuildDrawRequest(
  drawRequest: Doc<"activeBuildDrawRequests">
) {
  return (
    drawRequest.status !== "cancelled" && drawRequest.status !== "withdrawn"
  );
}

function assertLenderDashboardActionCapacity(actions: LenderDashboardAction[]) {
  if (actions.length > LENDER_DASHBOARD_MAX_ACTIONS) {
    throw new Error("Lender dashboard action limit exceeded");
  }
}

function averageProgress(milestones: Doc<"buildMilestones">[]) {
  if (milestones.length === 0) {
    return 0;
  }
  const total = milestones.reduce(
    (sum, milestone) => sum + (milestone.progressPercent ?? 0),
    0
  );
  return Math.round(total / milestones.length);
}

function formatWorkflowStatus(status: Doc<"buildProposals">["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
