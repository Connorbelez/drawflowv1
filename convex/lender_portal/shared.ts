import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../types";
import {
  lenderPortalReviewGroupValidator,
  lenderPortalReviewRequestStateValidator,
} from "../lender_portal_phase5_contracts";

export const LENDER_PORTAL_RESULT_LIMIT = 50;
export const LENDER_DRAW_QUEUE_MAX_PAGE_SIZE = 50;
export const LENDER_PROPOSAL_PORTFOLIO_MAX_PAGE_SIZE = 50;
export const LENDER_DASHBOARD_MAX_ASSIGNMENT_ROWS = 200;
export const LENDER_DASHBOARD_MAX_BUILDS = LENDER_PORTAL_RESULT_LIMIT;
export const LENDER_DASHBOARD_MAX_ACTIONS = 100;

export const lenderProposalListRowFields = {
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

export const lenderProposalListRow = v.object(lenderProposalListRowFields);

export const lenderProposalPortfolioViewValidator = v.union(
  v.literal("needs_action"),
  v.literal("in_progress"),
  v.literal("approved"),
  v.literal("update_pending"),
  v.literal("closed"),
  v.literal("withdrawn")
);

export type LenderProposalPortfolioView =
  | "needs_action"
  | "in_progress"
  | "approved"
  | "update_pending"
  | "closed"
  | "withdrawn";

export const lenderProposalPortfolioRow = v.object({
  ...lenderProposalListRowFields,
  view: lenderProposalPortfolioViewValidator,
});

export const lenderProposalPortfolioPage = paginationResultValidator(
  lenderProposalPortfolioRow
);

export const lenderBuildListRow = v.object({
  buildId: v.id("activeBuilds"),
  buildName: v.string(),
  location: v.string(),
  milestonesBehindSchedule: v.number(),
  proposalId: v.id("buildProposals"),
  status: v.union(v.literal("active"), v.literal("future_start")),
  updatedAt: v.number(),
});

export const lenderDashboardActionItem = v.object({
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

export const lenderDashboardBuildRow = v.object({
  buildId: v.id("activeBuilds"),
  buildName: v.string(),
  facilityCents: v.number(),
  location: v.string(),
  milestonesBehindSchedule: v.number(),
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

export const lenderDashboardData = v.object({
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

export const lenderBuildDetailMilestone = v.object({
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

export const lenderBuildDetailDraw = v.object({
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

export const lenderBuildDetailData = v.object({
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
  reviewPolicy: v.union(
    v.object({ state: v.literal("unavailable") }),
    v.object({
      draw: v.object({
        approvalMode: v.union(
          v.literal("backoffice_only"),
          v.literal("lender_quorum"),
          v.literal("both")
        ),
        lenderQuorum: v.union(v.number(), v.null()),
      }),
      milestone: v.object({
        approvalMode: v.union(
          v.literal("backoffice_only"),
          v.literal("lender_quorum"),
          v.literal("both")
        ),
        lenderQuorum: v.union(v.number(), v.null()),
        receiptInvoiceRequired: v.boolean(),
        siteVisitRequired: v.boolean(),
      }),
      state: v.literal("locked"),
    })
  ),
  reviewSummary: v.string(),
});

export const lenderDrawQueueRow = v.object({
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

export const lenderDrawQueuePage =
  paginationResultValidator(lenderDrawQueueRow);

export const backofficeLenderOrganizationPortfolio = v.object({
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

export async function lenderDrawQueueReviewCycle(
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

export async function lenderMilestoneQueueReviewCycle(
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

export function assertLenderBuildScopedRows(
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

export function isCurrentBuildMilestone(milestone: Doc<"buildMilestones">) {
  return (
    milestone.planningState !== "superseded" &&
    milestone.supersededAt === undefined
  );
}

export function isCurrentBuildDrawRequest(
  drawRequest: Doc<"activeBuildDrawRequests">
) {
  return (
    drawRequest.status !== "cancelled" && drawRequest.status !== "withdrawn"
  );
}
