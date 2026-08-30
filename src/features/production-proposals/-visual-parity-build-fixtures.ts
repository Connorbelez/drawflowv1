import type { ProductionBuildDetail } from "#/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx";
import {
  VISUAL_PARITY_ACTIVE_BUILD_ID,
  VISUAL_PARITY_CLOSED_PROPOSAL_ID,
} from "./visualParityConstants.ts";
import { getVisualParityCostItems } from "./-visual-parity-cost-fixtures.ts";
import { getVisualParityProposalDetail } from "./-visual-parity-proposal-fixtures.ts";
import { getVisualParityTimelineWorkspace } from "./-visual-parity-timeline-fixtures.ts";

export function getVisualParityActiveBuildDetail(
  buildId = VISUAL_PARITY_ACTIVE_BUILD_ID
): ProductionBuildDetail | null {
  if (!buildId.includes("visual")) {
    return null;
  }

  const detail = getVisualParityProposalDetail(
    VISUAL_PARITY_CLOSED_PROPOSAL_ID
  );
  const workspace = getVisualParityTimelineWorkspace(
    VISUAL_PARITY_CLOSED_PROPOSAL_ID
  );
  const now = Date.UTC(2026, 5, 1, 14, 30);

  return {
    auditEvents: [
      {
        _id: "audit-visual-materials",
        actorPersona: "user_visual_parity",
        afterSummary: "Material plan copied from approved proposal.",
        changes: [
          { after: "3 copied items", before: "Not set", field: "Cost items" },
        ],
        createdAt: now,
        entityLabel: "Build material planning",
        entityType: "buildCostItems",
        eventType: "active_build.material_plan.copied",
        reason:
          "Approved proposal material plan carried into the Active Build.",
        warnings: [],
      },
      {
        _id: "active-build-audit-visual-contractors",
        actorPersona: "FairLend Principal Broker",
        afterSummary: "Proposal contractors copied forward at offline closing.",
        changes: [
          { after: "2 attached", before: "Not set", field: "Contractors" },
        ],
        createdAt: now - 43_200_000,
        entityLabel: detail.proposal.buildName,
        entityType: "activeBuild",
        eventType: "active_build.contractors.copied_forward",
        reason: "Preserve approved contractor assignments at loan closing.",
        warnings: [],
      },
      {
        _id: "audit-visual-closing",
        actorPersona: "user_visual_parity",
        afterSummary: "Offline closing recorded and active build opened.",
        changes: [
          {
            after: "Active Build",
            before: "Approved proposal",
            field: "State",
          },
        ],
        createdAt: now - 86_400_000,
        entityLabel: detail.proposal.buildName,
        entityType: "activeBuild",
        eventType: "active_build.created",
        reason: "Loan closing completed and construction execution opened.",
        warnings: [],
      },
    ],
    availableContractors: [
      ...(workspace.contractorPlanning?.availableContractors?.map(
        (contractor) => ({
          _id: contractor._id,
          city: contractor.city,
          defaultPayRateCents: contractor.defaultPayRateCents,
          defaultPayRateUnit: contractor.defaultPayRateUnit,
          name: contractor.name,
          trades: contractor.trades,
        })
      ) ?? []),
      {
        _id: "contractor-visual-available",
        city: "Hamilton",
        name: "Harbour City Supply Crew",
        skills: ["material staging", "equipment handling"],
        trades: ["framing", "rough-in"],
      },
    ],
    build: {
      _id: buildId,
      brokerageId: "brokerage_visual_parity",
      buildName: detail.proposal.buildName,
      createdAt: now - 172_800_000,
      location: detail.proposal.location,
      startDate: "2026-06-03",
      status: "active",
      totalBudgetCents: detail.proposal.totalBudgetCents,
      updatedAt: now,
    },
    capitalPlan: {
      borrowerCoPayBps: detail.proposal.borrowerCoPayBps,
      borrowerStartingCashCents: detail.proposal.borrowerStartingCashCents,
      lenderDrawPolicyLimitCents: detail.proposal.lenderDrawPolicyLimitCents,
      version: 1,
    },
    contractors: [
      ...(workspace.contractorPlanning?.proposalContractors?.map(
        (contractor) => ({
          _id: `active-assignment-${contractor.contractorId}`,
          agreedRateCents: contractor.agreedRateCents,
          agreedRateUnit: contractor.agreedRateUnit,
          city: contractor.city,
          contractorId: contractor.contractorId,
          defaultPayRateCents: contractor.defaultPayRateCents,
          defaultPayRateUnit: contractor.defaultPayRateUnit,
          name: contractor.name,
          role: contractor.role,
          trades: contractor.trades,
        })
      ) ?? []),
      {
        _id: "assignment-visual-framing",
        contractorId: "contractor-visual-framing",
        email: "ops@northline.example",
        name: "Northline Framing Crew",
        role: "Framing contractor",
        trades: ["framing"],
      },
    ],
    costItems: getVisualParityCostItems().map((item) => ({
      ...item,
      _id: item._id.replace("proposal", "build"),
    })),
    displayId: "B-VISUAL-001",
    documents: detail.documents.map((document, index) => ({
      _id: `build-document-visual-${index + 1}`,
      documentType: document.documentType,
      fileName: document.fileName,
      kind: document.documentType,
      name: document.fileName,
      sizeBytes: document.sizeBytes,
    })),
    draws: detail.draws.map((draw, index) => ({
      _id: `build-draw-visual-${index + 1}`,
      amountCents: draw.amountCents,
      drawKey: draw.drawKey,
      label: draw.label,
      milestoneKey: draw.milestoneKey,
      order: index + 1,
      status: index === 0 ? "released" : index === 1 ? "requested" : "planned",
      timingDay: draw.timingDay,
      ...(index === 0
        ? {
            releaseDate: "2026-06-19",
            releaseNote: "Foundation reimbursement released.",
            releasedAt: "2026-06-19T14:30:00.000Z",
          }
        : {}),
      ...(index === 1
        ? {
            requestNote: "Framing package staged for review.",
            requestedAt: "2026-06-25T14:30:00.000Z",
          }
        : {}),
    })),
    facilityChangeRequests: [],
    loanFacility: {
      interestAnnualBps: 925,
      interestStartsOn: "funds_released",
      paybackDate: "2027-06-03",
      principalCents: detail.proposal.lenderDrawPolicyLimitCents,
      status: "active",
    },
    milestoneContractorAssignments:
      workspace.contractorPlanning?.milestoneAssignments?.map((assignment) => ({
        _id: `active-${assignment._id}`,
        agreedRateCents: 9500,
        agreedRateUnit: "hour",
        contractor: {
          _id: assignment.contractorId,
          name: assignment.contractorName,
          trades: ["masonry", "brick"],
        },
        contractorId: assignment.contractorId,
        estimatedCostCents: assignment.estimatedCostCents,
        estimatedHours: assignment.estimatedHours,
        milestoneKey: assignment.milestoneKey,
        role: assignment.role,
        status: "assigned",
        submilestoneKey: assignment.submilestoneKey,
      })) ?? [],
    milestones: detail.milestones.map((milestone, index) => ({
      _id: `build-milestone-visual-${milestone.key}`,
      budgetCents: milestone.budgetCents,
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      dependencyKeys:
        index > 0 && detail.milestones[index - 1]
          ? [detail.milestones[index - 1].key]
          : [],
      drawAvailabilityCents:
        detail.draws.find((draw) => draw.milestoneKey === milestone.key)
          ?.amountCents ?? milestone.budgetCents,
      durationDays: milestone.durationDays,
      evidenceState: index === 0 ? "Approved package" : "Draft package",
      key: milestone.key,
      name: milestone.name,
      order: milestone.order,
      policyState: "Within active draw policy",
      progressPercent: index === 0 ? 100 : index === 1 ? 35 : 0,
      status:
        index === 0 ? "complete" : index === 1 ? "in_progress" : "planned",
      updatedAt: now - index * 3_600_000,
    })),
    notes: {
      internal: [
        {
          _id: "note-visual-internal",
          authorPersona: "user_visual_parity",
          body: "Confirm supplier lead times before framing draw review.",
          createdAt: now,
          visibility: "internal",
        },
      ],
      public: [
        {
          _id: "note-visual-public",
          authorPersona: "user_visual_parity",
          body: "Material plan is copied from the approved proposal.",
          createdAt: now,
          visibility: "public",
        },
      ],
    },
    quickActionEvents: [],
    sitePhotos: [
      {
        caption: "Foundation progress",
        evidenceKey: "fixture-foundation-photo",
        locationVerified: true,
        takenAt: "2026-06-18",
        url: "production-evidence://fixture-foundation-photo",
      },
    ],
    siteVisits: [
      {
        _id: "site-visit-visual-framing",
        milestoneKey: "framing",
        note: "Framing staging visit requested.",
        requestedAt: "2026-06-24T14:30:00.000Z",
        requestedDay: 34,
        status: "requested",
        visitId: "visit-visual-framing",
      },
    ],
    submilestones: detail.submilestones.map((submilestone, index) => ({
      _id: `build-submilestone-visual-${submilestone.key}`,
      budgetCents: 0,
      durationDays: 0,
      key: submilestone.key,
      milestoneKey: submilestone.milestoneKey,
      name: submilestone.name,
      order: index + 1,
      startDay: submilestone.startDay,
      status: index < 3 ? "complete" : index < 6 ? "in_progress" : "planned",
    })),
  };
}
