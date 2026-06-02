import type {
  ProductionKanban,
  ProductionProposalDetail,
  ProductionProposalSettings,
} from "./ProductionProposalSurfaces.tsx";
import type { ProductionBuildDetail } from "#/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx";
import type { ProductionProposalTemplateProjection } from "./timelineSetupAdapter.ts";
import type { ConvexTimelineWorkspace } from "#/features/timeline-workspace/-timeline-convex-adapter.ts";

export const VISUAL_PARITY_ORGANIZATION_ID = "org_visual_parity_workos";
export const VISUAL_PARITY_PROPOSAL_ID = "proposal_visual_parity";
export const VISUAL_PARITY_SUBMITTED_PROPOSAL_ID = "proposal_visual_submitted";
export const VISUAL_PARITY_APPROVED_PROPOSAL_ID = "proposal_visual_approved";
export const VISUAL_PARITY_CLOSED_PROPOSAL_ID = "proposal_visual_closed";
export const VISUAL_PARITY_ACTIVE_BUILD_ID = "build_visual_hamilton";

type VisualParityProposalStatus = "approved" | "closed" | "draft" | "submitted";

export function isProductionVisualParityFixtureEnabled(): boolean {
  return (
    !import.meta.env.PROD &&
    import.meta.env.VITE_DRAWFLOW_VISUAL_PARITY_FIXTURE === "1"
  );
}

export function getVisualParityCreateContext() {
  return {
    brokerage: {
      _id: "brokerage_visual_parity",
      name: "FairLend Capital",
      organizationId: VISUAL_PARITY_ORGANIZATION_ID,
    },
    builderProfile: {
      _id: "builder_visual_parity",
      companyName: "Northline Homes",
      status: "active",
    },
    templates: VISUAL_PARITY_TEMPLATES,
  };
}

export function getVisualParityKanban(): ProductionKanban {
  const now = Date.UTC(2026, 4, 27, 14, 30);
  return {
    columns: [
      {
        cards: [
          {
            builderName: "Northline Homes",
            column: "draft",
            proposalId: VISUAL_PARITY_PROPOSAL_ID,
            subtitle: "Hamilton, ON - package in progress",
            title: "Hamilton Infill Build",
            totalBudgetCents: 1_250_000_00,
            updatedAt: now,
          },
        ],
        id: "draft",
        name: "Draft",
      },
      {
        cards: [
          {
            builderName: "Northline Homes",
            column: "submitted",
            proposalId: "proposal_visual_submitted",
            subtitle: "Permit linked - ready for broker review",
            title: "King Street Townhomes",
            totalBudgetCents: 1_480_000_00,
            updatedAt: now - 86_400_000,
          },
        ],
        id: "submitted",
        name: "Submitted",
      },
      {
        cards: [
          {
            builderName: "Cedarpoint Builders",
            column: "approved",
            proposalId: "proposal_visual_approved",
            subtitle: "Approved - waiting on offline closing",
            title: "Cedarpoint Duplex",
            totalBudgetCents: 980_000_00,
            updatedAt: now - 172_800_000,
          },
        ],
        id: "approved",
        name: "Approved",
      },
      {
        cards: [
          {
            builderName: "Northline Homes",
            column: "closed",
            proposalId: "proposal_visual_closed",
            subtitle: "Active build created from closed proposal",
            title: "Wentworth Garden Suites",
            totalBudgetCents: 1_110_000_00,
            updatedAt: now - 259_200_000,
          },
        ],
        id: "closed",
        name: "Closed",
      },
    ],
  };
}

export function getVisualParityProposalDetail(
  proposalId = VISUAL_PARITY_PROPOSAL_ID,
): ProductionProposalDetail {
  const proposalStatus = getVisualParityProposalStatus(proposalId);
  return {
    activeBuild:
      proposalStatus === "closed"
        ? {
            _id: "build_visual_parity",
            startDate: "2026-06-03",
          }
        : null,
    documents: [
      {
        documentType: "permit",
        fileName: "hamilton-infill-building-permit.pdf",
        mimeType: "application/pdf",
        sizeBytes: 482_102,
        status: "uploaded",
        storageId: "storage_visual_permit",
        storageUrl: null,
      },
      {
        documentType: "budget",
        fileName: "cost-breakdown-v3.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 94_336,
        status: "uploaded",
        storageId: "storage_visual_budget",
        storageUrl: null,
      },
    ],
    draws: [
      {
        amountCents: 100_000_00,
        drawKey: "draw-site-prep",
        label: "Draw 1 - site prep",
        milestoneKey: "site-prep",
        timingDay: 16,
      },
      {
        amountCents: 128_000_00,
        drawKey: "draw-framing",
        label: "Draw 2 - framing",
        milestoneKey: "framing",
        timingDay: 43,
      },
      {
        amountCents: 196_000_00,
        drawKey: "draw-rough-in",
        label: "Draw 3 - rough-in",
        milestoneKey: "rough-in",
        timingDay: 68,
      },
      {
        amountCents: 168_000_00,
        drawKey: "draw-exterior",
        label: "Draw 4 - exterior",
        milestoneKey: "exterior",
        timingDay: 92,
      },
      {
        amountCents: 152_000_00,
        drawKey: "draw-drywall",
        label: "Draw 5 - drywall",
        milestoneKey: "drywall",
        timingDay: 116,
      },
      {
        amountCents: 128_000_00,
        drawKey: "draw-finishes",
        label: "Draw 6 - finishes",
        milestoneKey: "finishes",
        timingDay: 138,
      },
      {
        amountCents: 128_000_00,
        drawKey: "draw-closeout",
        label: "Draw 7 - closeout",
        milestoneKey: "closeout",
        timingDay: 158,
      },
    ],
    milestones: [
      {
        budgetCents: 125_000_00,
        dayEnd: 14,
        dayStart: 0,
        durationDays: 14,
        key: "site-prep",
        name: "Site prep & foundation",
        order: 1,
      },
      {
        budgetCents: 160_000_00,
        dayEnd: 39,
        dayStart: 19,
        durationDays: 20,
        key: "framing",
        name: "Framing & structure",
        order: 2,
      },
      {
        budgetCents: 245_000_00,
        dayEnd: 64,
        dayStart: 44,
        durationDays: 20,
        icon: "plumbing",
        key: "rough-in",
        name: "Rough-in mechanical",
        order: 3,
      },
      {
        budgetCents: 210_000_00,
        dayEnd: 88,
        dayStart: 69,
        durationDays: 19,
        key: "exterior",
        name: "Windows & exterior",
        order: 4,
      },
      {
        budgetCents: 190_000_00,
        dayEnd: 112,
        dayStart: 93,
        durationDays: 19,
        key: "drywall",
        name: "Inspections & drywall",
        order: 5,
      },
      {
        budgetCents: 160_000_00,
        dayEnd: 136,
        dayStart: 117,
        durationDays: 19,
        icon: "kitchen",
        key: "finishes",
        name: "Finishes & fixtures",
        order: 6,
      },
      {
        budgetCents: 160_000_00,
        dayEnd: 156,
        dayStart: 141,
        durationDays: 15,
        key: "closeout",
        name: "Final inspection & closeout",
        order: 7,
      },
    ],
    permitWaiver: null,
    proposal: {
      borrowerCoPayBps: 2000,
      borrowerWorkingCapitalLimitCents: 250_000_00,
      buildName: "Hamilton Infill Build",
      lenderDrawPolicyLimitCents: 1_000_000_00,
      location: "Hamilton, ON",
      status: proposalStatus,
      totalBudgetCents: 1_250_000_00,
    },
    submilestones: [
      { key: "permit-mobilization", milestoneKey: "site-prep", name: "Permit mobilization" },
      { key: "excavation", milestoneKey: "site-prep", name: "Excavation" },
      { key: "forms", milestoneKey: "site-prep", name: "Concrete forms" },
      { key: "wall-framing", milestoneKey: "framing", name: "Wall framing" },
      { key: "roof-trusses", milestoneKey: "framing", name: "Roof trusses" },
      { key: "sheathing", milestoneKey: "framing", name: "Structural sheathing" },
      { key: "plumbing", milestoneKey: "rough-in", name: "Plumbing rough-in" },
      { key: "electrical", milestoneKey: "rough-in", name: "Electrical rough-in" },
      { key: "hvac", milestoneKey: "rough-in", name: "HVAC ducts" },
      { key: "windows", milestoneKey: "exterior", name: "Window install" },
      { key: "weather-barrier", milestoneKey: "exterior", name: "Weather barrier" },
      { key: "drywall-hang", milestoneKey: "drywall", name: "Drywall hang" },
      { key: "cabinetry", milestoneKey: "finishes", name: "Cabinetry" },
      { key: "fixture-set", milestoneKey: "finishes", name: "Fixture set" },
      { key: "punch-list", milestoneKey: "closeout", name: "Punch list" },
    ],
  };
}

export function getVisualParityTimelineWorkspace(
  proposalId = VISUAL_PARITY_PROPOSAL_ID,
): ConvexTimelineWorkspace & {
  modificationRequests: any[];
  planSummary: {
    address: string;
    includedCount: number;
    templateTitle: string;
    totalBudget: number;
  };
  proposal: NonNullable<ProductionProposalDetail["proposal"]>;
} {
  const detail = getVisualParityProposalDetail(proposalId);
  const milestones = [...(detail.milestones ?? [])].sort(
    (a, b) => a.order - b.order,
  );
  const draws = [...(detail.draws ?? [])].sort(
    (a, b) => a.timingDay - b.timingDay,
  );
  return {
    capitalEvents: [
      {
        amountCents: detail.proposal.borrowerWorkingCapitalLimitCents,
        capitalEventKey: "borrower-reserve",
        eventKind: "cashInfusion",
        label: "Borrower reserve",
        x: 0,
      },
      {
        amountCents: 48_000_00,
        capitalEventKey: "cash-infusion-drywall",
        eventKind: "cashInfusion",
        label: "Drywall cash infusion",
        x: 93,
      },
      {
        amountCents: 36_000_00,
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
          defaultPayRateCents: 8_900,
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
          estimatedCostCents: 138_000_00,
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
          agreedRateCents: 9_500,
          agreedRateUnit: "hour",
          city: "Toronto, ON",
          contractorId: "contractor_visual_masonry",
          defaultPayRateCents: 9_500,
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
          rateCents: 9_500,
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
        draws.find((draw) => draw.milestoneKey === milestone.key)?.amountCents ??
        milestone.budgetCents,
      drawKey:
        draws.find((draw) => draw.milestoneKey === milestone.key)?.label ??
        "Reimbursement draw",
      durationDays: milestone.durationDays,
      evidenceState: index === 0 ? "Submitted package" : "Draft package",
      icon:
        milestone.icon ??
        (iconForTemplateMilestone(milestone.key, milestone.name) as any),
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
        })),
      tone: index === 0 ? "complete" : index === 1 ? "active" : "upcoming",
      x: milestone.dayStart,
    })),
    modificationRequests: [],
    plan: {
      borrowerCoPayBps: detail.proposal.borrowerCoPayBps,
      borrowerCoPayCents: Math.round(
        (detail.proposal.totalBudgetCents * detail.proposal.borrowerCoPayBps) /
          10_000,
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
      startingCashCents: detail.proposal.borrowerWorkingCapitalLimitCents,
    },
    planSummary: {
      address: detail.proposal.location,
      includedCount: milestones.length,
      templateTitle: detail.proposal.buildName,
      totalBudget: detail.proposal.totalBudgetCents,
    },
    proposal: detail.proposal,
  };
}

export function getVisualParityActiveBuildDetail(
  buildId = VISUAL_PARITY_ACTIVE_BUILD_ID,
): ProductionBuildDetail | null {
  if (!buildId.includes("visual")) {
    return null;
  }

  const detail = getVisualParityProposalDetail(VISUAL_PARITY_CLOSED_PROPOSAL_ID);
  const workspace = getVisualParityTimelineWorkspace(
    VISUAL_PARITY_CLOSED_PROPOSAL_ID,
  );
  const now = Date.UTC(2026, 4, 27, 14, 30);

  return {
    auditEvents: [
      {
        _id: "active-build-audit-visual-1",
        actorPersona: "FairLend Principal Broker",
        afterSummary: "Proposal contractors copied forward at offline closing.",
        createdAt: now - 86_400_000,
        entityLabel: "Hamilton Infill Build",
        entityType: "activeBuild",
        eventType: "active_build.contractors.copied_forward",
      },
    ],
    availableContractors:
      workspace.contractorPlanning?.availableContractors?.map((contractor) => ({
        _id: contractor._id,
        city: contractor.city,
        defaultPayRateCents: contractor.defaultPayRateCents,
        defaultPayRateUnit: contractor.defaultPayRateUnit,
        name: contractor.name,
        trades: contractor.trades,
      })) ?? [],
    build: {
      _id: buildId,
      brokerageId: "brokerage_visual_parity",
      buildName: detail.proposal.buildName,
      createdAt: now - 259_200_000,
      location: detail.proposal.location,
      startDate: "2026-06-03",
      status: "active",
      totalBudgetCents: detail.proposal.totalBudgetCents,
      updatedAt: now,
    },
    capitalPlan: {
      borrowerCoPayBps: detail.proposal.borrowerCoPayBps,
      borrowerWorkingCapitalLimitCents:
        detail.proposal.borrowerWorkingCapitalLimitCents,
      lenderDrawPolicyLimitCents: detail.proposal.lenderDrawPolicyLimitCents,
      version: 1,
    },
    contractors:
      workspace.contractorPlanning?.proposalContractors?.map((contractor) => ({
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
      })) ?? [],
    displayId: "B-VISUAL-HAM",
    documents: detail.documents.map((document) => ({
      _id: `active-doc-${document.storageId}`,
      documentType: document.documentType,
      fileName: document.fileName,
      kind: document.documentType,
      name: document.fileName,
      sizeBytes: document.sizeBytes,
    })),
    draws: detail.draws.map((draw, index) => ({
      _id: `active-${draw.drawKey}`,
      amountCents: draw.amountCents,
      drawKey: draw.drawKey,
      label: draw.label,
      milestoneKey: draw.milestoneKey,
      order: index + 1,
      requestedAt: index === 0 ? "2026-06-17T14:30:00.000Z" : undefined,
      status: index === 0 ? "approved" : "planned",
      timingDay: draw.timingDay,
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
        agreedRateCents: 9_500,
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
      _id: `active-milestone-${milestone.key}`,
      budgetCents: milestone.budgetCents,
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      dependencyKeys: [],
      drawAvailabilityCents:
        detail.draws.find((draw) => draw.milestoneKey === milestone.key)
          ?.amountCents ?? milestone.budgetCents,
      durationDays: milestone.durationDays,
      evidenceState: index === 0 ? "Submitted package" : "Draft package",
      key: milestone.key,
      name: milestone.name,
      order: milestone.order,
      progressPercent: index === 0 ? 100 : index === 1 ? 35 : 0,
      status: index === 0 ? "complete" : index === 1 ? "in_progress" : "planned",
      updatedAt: now - index * 43_200_000,
    })),
    notes: {
      internal: [
        {
          _id: "active-note-internal-visual",
          authorPersona: "FairLend Principal Broker",
          body: "Northstar retained for brick veneer scope after permit review.",
          createdAt: now - 43_200_000,
          visibility: "internal",
        },
      ],
      public: [
        {
          _id: "active-note-public-visual",
          authorPersona: "FairLend Principal Broker",
          body: "Closing complete. First reimbursement package is active.",
          createdAt: now - 21_600_000,
          visibility: "public",
        },
      ],
    },
    quickActionEvents: [
      {
        _id: "active-quick-visual",
        createdAt: now,
        eventType: "active_build.contractor.assigned",
        payloadPreview: "Northstar Masonry assigned to exterior brick veneer.",
      },
    ],
    sitePhotos: [
      {
        caption: "Brick veneer mockup and weather barrier tie-in.",
        evidenceKey: "ev_visual_brick_1",
        locationVerified: true,
        takenAt: "2026-06-18",
        url: "production-evidence://ev_visual_brick_1",
      },
    ],
    siteVisits: [],
    submilestones: (detail.submilestones ?? []).map((submilestone, index) => ({
      _id: `active-submilestone-${submilestone.key}`,
      budgetCents:
        detail.milestones.find(
          (milestone) => milestone.key === submilestone.milestoneKey,
        )?.budgetCents ?? undefined,
      durationDays: 2,
      key: submilestone.key,
      milestoneKey: submilestone.milestoneKey,
      name: submilestone.name,
      order: index + 1,
      status: index < 3 ? "complete" : index < 6 ? "in_progress" : "planned",
    })),
  };
}

export function getVisualParityActiveBuildTimelineWorkspace(
  buildId = VISUAL_PARITY_ACTIVE_BUILD_ID,
) {
  if (!buildId.includes("visual")) {
    return null;
  }
  return getVisualParityTimelineWorkspace(VISUAL_PARITY_CLOSED_PROPOSAL_ID);
}

function getVisualParityProposalStatus(
  proposalId: string,
): VisualParityProposalStatus {
  if (proposalId.includes("approved")) {
    return "approved";
  }
  if (proposalId.includes("closed")) {
    return "closed";
  }
  if (proposalId.includes("submitted")) {
    return "submitted";
  }
  return "draft";
}

export function getVisualParitySettings(): ProductionProposalSettings {
  return {
    archetypes: [
      { key: "foundation", name: "Foundation", status: "active" },
      { key: "framing", name: "Framing", status: "active" },
      { key: "rough-in", name: "Rough-in", status: "active" },
    ],
    templates: VISUAL_PARITY_TEMPLATES.map((template) => ({
      milestones: template.milestones.map((milestone) => ({
        archetypeKey: milestone.archetypeKey,
        dependencyKeys: milestone.dependencyKeys,
        durationDays: milestone.durationDays,
        icon: iconForTemplateMilestone(milestone.key, milestone.name),
        key: milestone.key,
        name: milestone.name,
        percentageBps: milestone.percentageBps,
        submilestones: (milestone.submilestones ?? []).map((submilestone) => ({
          budgetCents: submilestone.budgetCents,
          durationDays: submilestone.durationDays,
          key: submilestone.key,
          name: submilestone.name,
        })),
        type: milestone.archetypeKey,
      })),
      scenarios: [
        {
          isDefault: true,
          name: "Capital constrained reimbursement",
          scenarioKey: "capital-constrained",
        },
      ],
      templateKey: template.templateKey,
      title: template.title,
    })),
    workflowRules: [
      {
        allowPermitWaiverByRoles: ["admin", "principle-broker"],
        proposalStates: ["draft", "submitted", "approved", "closed"],
        requirePermitForApproval: true,
        ruleKey: "proposal-foundation-v1",
        settings: {
          interestStartsOn: "funds_released",
          reimbursementOnly: true,
        },
        version: 1,
      },
    ],
  };
}

function iconForTemplateMilestone(key: string, name?: string) {
  const normalized = `${key} ${name ?? ""}`.toLowerCase();
  if (normalized.includes("site") || normalized.includes("foundation")) {
    return "foundation";
  }
  if (normalized.includes("kitchen") || normalized.includes("cabinet")) {
    return "kitchen";
  }
  if (
    normalized.includes("plumb") ||
    normalized.includes("mechanical") ||
    normalized.includes("mep")
  ) {
    return "plumbing";
  }
  if (normalized.includes("roof") || normalized.includes("dry-in")) {
    return "roofing";
  }
  if (normalized.includes("fram")) {
    return "framing";
  }
  if (normalized.includes("rough")) {
    return "roughIn";
  }
  if (normalized.includes("exterior")) {
    return "exterior";
  }
  if (normalized.includes("drywall")) {
    return "drywall";
  }
  if (normalized.includes("finish")) {
    return "finishes";
  }
  if (normalized.includes("close")) {
    return "closeout";
  }
  return "change";
}

const VISUAL_PARITY_TEMPLATES: ProductionProposalTemplateProjection[] = [
  {
    isDefault: true,
    milestones: [
      templateMilestone("site-prep", "Site prep & foundation", 1, 1000, 14, [
        "Permit mobilization",
        "Excavation",
        "Concrete forms",
      ]),
      templateMilestone("framing", "Framing & structure", 2, 1280, 20, [
        "Wall framing",
        "Roof trusses",
        "Structural sheathing",
      ]),
      templateMilestone("rough-in", "Rough-in mechanical", 3, 1960, 20, [
        "Plumbing rough-in",
        "Electrical rough-in",
        "HVAC ducts",
      ]),
      templateMilestone("exterior", "Windows & exterior", 4, 1680, 19, [
        "Window install",
        "Weather barrier",
        "Exterior doors",
      ]),
      templateMilestone("drywall", "Inspections & drywall", 5, 1520, 19, [
        "Rough-in inspection",
        "Insulation",
        "Drywall hang",
      ]),
      templateMilestone("finishes", "Finishes & fixtures", 6, 1280, 19, [
        "Cabinetry",
        "Flooring",
        "Fixture set",
      ]),
      templateMilestone("closeout", "Final inspection & closeout", 7, 1280, 15, [
        "Punch list",
        "Final inspection",
        "Closeout package",
      ]),
    ],
    summary: "Single-family reimbursement draw template",
    templateKey: "single-family-full-build",
    title: "Single-family full build",
  },
];

function templateMilestone(
  key: string,
  name: string,
  order: number,
  percentageBps: number,
  durationDays: number,
  submilestoneNames: string[],
) {
  return {
    archetypeKey: key,
    dependencyKeys: [],
    durationDays,
    key,
    name,
    order,
    percentageBps,
    submilestones: submilestoneNames.map((submilestone, index) => ({
      key: `${key}-${index + 1}`,
      name: submilestone,
      order: index + 1,
    })),
  };
}
