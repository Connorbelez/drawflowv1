import type { ConvexTimelineWorkspace } from "#/features/timeline-workspace/-timeline-convex-adapter.ts";
import type { ProductionProposalDetail } from "./ProductionProposalSurfaces.tsx";
import type { TimelineModificationRequestView } from "#/features/timeline-workspace/index.tsx";
import {
  VISUAL_PARITY_ACTIVE_BUILD_ID,
  VISUAL_PARITY_CLOSED_PROPOSAL_ID,
  VISUAL_PARITY_PROPOSAL_ID,
} from "./visualParityConstants.ts";
import { getVisualParityProposalDetail } from "./-visual-parity-proposal-fixtures.ts";
import { iconForTemplateMilestone } from "./-visual-parity-template-fixtures.ts";

export function getVisualParityTimelineWorkspace(
  proposalId = VISUAL_PARITY_PROPOSAL_ID
): ConvexTimelineWorkspace & {
  modificationRequests: TimelineModificationRequestView[];
  proposal: NonNullable<ProductionProposalDetail["proposal"]>;
} {
  const detail = getVisualParityProposalDetail(proposalId);
  const milestones = [...(detail.milestones ?? [])].sort(
    (a, b) => a.order - b.order
  );
  const draws = [...(detail.draws ?? [])].sort(
    (a, b) => a.timingDay - b.timingDay
  );
  return {
    capitalEvents: [
      {
        amountCents: detail.proposal.borrowerStartingCashCents,
        capitalEventKey: "borrower-reserve",
        eventKind: "cashInfusion",
        label: "Borrower reserve",
        x: 0,
      },
      {
        amountCents: 4_800_000,
        capitalEventKey: "cash-infusion-drywall",
        eventKind: "cashInfusion",
        label: "Drywall cash infusion",
        x: 93,
      },
      {
        amountCents: 3_600_000,
        capitalEventKey: "material-spike-framing",
        eventKind: "cost",
        label: "Framing material spike",
        x: 32,
      },
    ],
    contractorPlanning: {
      allocationCalendar: [
        {
          assignmentId: "proposal-assign-visual-exterior",
          contractorId: "contractor_visual_masonry",
          contractorName: "Northstar Masonry",
          dayEnd: 88,
          dayStart: 72,
          label: "Exterior envelope / Masonry lead",
          milestoneKey: "exterior",
        },
      ],
      availableContractors: [
        {
          _id: "contractor_visual_framing",
          city: "Hamilton, ON",
          defaultPayRateCents: 8900,
          defaultPayRateUnit: "hour",
          name: "Ironline Framing Co.",
          trades: ["framing", "carpentry"],
        },
      ],
      conflicts: [],
      equipmentSchedule: [
        {
          contractorName: "Northstar Masonry",
          dayEnd: 88,
          dayStart: 72,
          equipmentKey: "telehandler",
          name: "Telehandler",
          quantity: 1,
        },
      ],
      materialSignals: [
        { key: "brick", label: "Brick siding", source: "permit_and_roadmap" },
        { key: "masonry", label: "Masonry", source: "permit_and_roadmap" },
      ],
      milestoneAssignments: [
        {
          _id: "proposal-assign-visual-exterior",
          contractorId: "contractor_visual_masonry",
          contractorName: "Northstar Masonry",
          estimatedCostCents: 13_800_000,
          estimatedHours: 184,
          milestoneKey: "exterior",
          milestoneName: "Exterior envelope",
          role: "Masonry lead",
          status: "planned",
          submilestoneKey: "brick-veneer",
          submilestoneName: "Brick veneer",
        },
      ],
      proposalContractors: [
        {
          _id: "proposal-contractor-visual-masonry",
          agreedRateCents: 9500,
          agreedRateUnit: "hour",
          city: "Toronto, ON",
          contractorId: "contractor_visual_masonry",
          defaultPayRateCents: 9500,
          defaultPayRateUnit: "hour",
          name: "Northstar Masonry",
          role: "Masonry lead",
          status: "active",
          trades: ["masonry", "brick"],
        },
      ],
      recommendations: [
        {
          contractorId: "contractor_visual_masonry",
          matchedSignals: [
            { key: "brick", label: "Brick siding" },
            { key: "masonry", label: "Masonry" },
          ],
          name: "Northstar Masonry",
          rateCents: 9500,
          score: 80,
          trades: ["masonry", "brick"],
        },
      ],
      utilization: [
        {
          assignedDays: 16,
          contractorId: "contractor_visual_masonry",
          name: "Northstar Masonry",
          scheduledHours: 184,
          utilizationPercent: 72,
          weeklyWindowHours: 64,
        },
      ],
    },
    draws: draws.map((draw) => ({
      amountCents: draw.amountCents,
      customDate: true,
      drawKey: draw.drawKey,
      itemMilestoneKey: draw.milestoneKey,
      label: draw.label,
      requestStatus: draw.drawKey === "draw-site-prep" ? "approved" : "draft",
      x: draw.timingDay,
    })),
    evidenceAssets: [
      {
        evidenceKey: "fixture-foundation-photo",
        fileName: "foundation-progress.jpg",
        label: "Foundation progress",
        milestoneKey: "site-prep",
        mimeType: "image/jpeg",
        previewUrl: null,
        sizeBytes: 238_000,
        tag: "Site prep & foundation",
      },
    ],
    milestones: milestones.map((milestone, index) => ({
      budgetCents: milestone.budgetCents,
      completionClaim:
        index === 0
          ? {
              actualCost: 126_500,
              completedDay: milestone.dayEnd,
              note: "Foundation package submitted.",
              submittedAt: "2026-05-27T14:30:00.000Z",
            }
          : undefined,
      completionReview:
        index === 0
          ? {
              note: "Approved after permit check.",
              reviewedAt: "2026-05-27T15:30:00.000Z",
              status: "approved",
            }
          : undefined,
      drawAvailabilityCents:
        draws.find((draw) => draw.milestoneKey === milestone.key)
          ?.amountCents ?? milestone.budgetCents,
      drawKey:
        draws.find((draw) => draw.milestoneKey === milestone.key)?.label ??
        "Reimbursement draw",
      durationDays: milestone.durationDays,
      evidenceState: index === 0 ? "Submitted package" : "Draft package",
      icon:
        milestone.icon ??
        iconForTemplateMilestone(milestone.key, milestone.name),
      lane: index % 3 === 1 ? -1 : index % 3 === 2 ? 1 : 0,
      markerLabel: String(index + 1),
      milestoneKey: milestone.key,
      name: milestone.name,
      order: index + 1,
      policyState: "Within proposal policy",
      status: index === 0 ? "complete" : index === 1 ? "ready" : "upcoming",
      submilestoneSnapshot: (detail.submilestones ?? [])
        .filter((submilestone) => submilestone.milestoneKey === milestone.key)
        .map((submilestone, subIndex) => ({
          key: submilestone.key,
          name: submilestone.name,
          order: subIndex + 1,
          startDay: submilestone.startDay,
        })),
      tone: index === 0 ? "complete" : index === 1 ? "active" : "upcoming",
      x: milestone.dayStart,
    })),
    modificationRequests: [],
    plan: {
      borrowerCoPayBps: detail.proposal.borrowerCoPayBps,
      borrowerCoPayCents: Math.round(
        (detail.proposal.totalBudgetCents * detail.proposal.borrowerCoPayBps) /
          10_000
      ),
      currentDay: 28,
      progressValue: 28,
      rangeMax: 166,
      rangeMin: 0,
      routeState: {
        activeMilestoneKey: "site-prep",
        selectedPanelOpen: true,
        straightLine: true,
      },
      startingCashCents: detail.proposal.borrowerStartingCashCents,
    },
    proposal: detail.proposal,
  };
}

export function getVisualParityActiveBuildTimelineWorkspace(
  buildId = VISUAL_PARITY_ACTIVE_BUILD_ID
) {
  if (!buildId.includes("visual")) {
    return null;
  }
  return getVisualParityTimelineWorkspace(VISUAL_PARITY_CLOSED_PROPOSAL_ID);
}
