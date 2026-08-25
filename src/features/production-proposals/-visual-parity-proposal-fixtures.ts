import type {
  ProductionKanban,
  ProductionProposalDetail,
} from "./ProductionProposalSurfaces.tsx";
import {
  VISUAL_PARITY_ORGANIZATION_ID,
  VISUAL_PARITY_PROPOSAL_ID,
} from "./visualParityConstants.ts";
import { getVisualParityCostItems } from "./-visual-parity-cost-fixtures.ts";
import { VISUAL_PARITY_TEMPLATES } from "./-visual-parity-template-fixtures.ts";

type VisualParityProposalStatus = "approved" | "closed" | "draft" | "submitted";

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
    brokers: [
      {
        email: "principal@fairlend.local",
        isPrincipal: true,
        name: "FairLend Principal Broker",
        workosUserId: "user_01KR207FRFHQT46EV9N538XBF3",
      },
      {
        email: "broker@fairlend.local",
        isPrincipal: false,
        name: "Jordan Lee",
        workosUserId: "user_visual_broker",
      },
    ],
    defaultAssignedBrokerWorkosUserId: "user_01KR207FRFHQT46EV9N538XBF3",
    availableContractors: [
      {
        city: "Hamilton",
        contractorId: "contractor_visual_framing",
        defaultPayRateCents: 12_500,
        defaultPayRateUnit: "hour" as const,
        name: "Ledger Frame Co.",
        trades: ["Framing", "Rough carpentry"],
      },
      {
        city: "Burlington",
        contractorId: "contractor_visual_concrete",
        defaultPayRateCents: 9500,
        defaultPayRateUnit: "hour" as const,
        name: "Apex Concrete Works",
        trades: ["Foundation", "Concrete"],
      },
    ],
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
            totalBudgetCents: 125_000_000,
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
            totalBudgetCents: 148_000_000,
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
            totalBudgetCents: 98_000_000,
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
            totalBudgetCents: 111_000_000,
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
  proposalId = VISUAL_PARITY_PROPOSAL_ID
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
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 94_336,
        status: "uploaded",
        storageId: "storage_visual_budget",
        storageUrl: null,
      },
    ],
    draws: [
      {
        amountCents: 10_000_000,
        drawKey: "draw-site-prep",
        label: "Draw 1 - site prep",
        milestoneKey: "site-prep",
        timingDay: 16,
      },
      {
        amountCents: 12_800_000,
        drawKey: "draw-framing",
        label: "Draw 2 - framing",
        milestoneKey: "framing",
        timingDay: 43,
      },
      {
        amountCents: 19_600_000,
        drawKey: "draw-rough-in",
        label: "Draw 3 - rough-in",
        milestoneKey: "rough-in",
        timingDay: 68,
      },
      {
        amountCents: 16_800_000,
        drawKey: "draw-exterior",
        label: "Draw 4 - exterior",
        milestoneKey: "exterior",
        timingDay: 92,
      },
      {
        amountCents: 15_200_000,
        drawKey: "draw-drywall",
        label: "Draw 5 - drywall",
        milestoneKey: "drywall",
        timingDay: 116,
      },
      {
        amountCents: 12_800_000,
        drawKey: "draw-finishes",
        label: "Draw 6 - finishes",
        milestoneKey: "finishes",
        timingDay: 138,
      },
      {
        amountCents: 12_800_000,
        drawKey: "draw-closeout",
        label: "Draw 7 - closeout",
        milestoneKey: "closeout",
        timingDay: 158,
      },
    ],
    milestones: [
      {
        budgetCents: 12_500_000,
        dayEnd: 14,
        dayStart: 0,
        durationDays: 14,
        key: "site-prep",
        name: "Site prep & foundation",
        order: 1,
      },
      {
        budgetCents: 16_000_000,
        dayEnd: 39,
        dayStart: 19,
        durationDays: 20,
        key: "framing",
        name: "Framing & structure",
        order: 2,
      },
      {
        budgetCents: 24_500_000,
        dayEnd: 64,
        dayStart: 44,
        durationDays: 20,
        icon: "plumbing",
        key: "rough-in",
        name: "Rough-in mechanical",
        order: 3,
      },
      {
        budgetCents: 21_000_000,
        dayEnd: 88,
        dayStart: 69,
        durationDays: 19,
        key: "exterior",
        name: "Windows & exterior",
        order: 4,
      },
      {
        budgetCents: 19_000_000,
        dayEnd: 112,
        dayStart: 93,
        durationDays: 19,
        key: "drywall",
        name: "Inspections & drywall",
        order: 5,
      },
      {
        budgetCents: 16_000_000,
        dayEnd: 136,
        dayStart: 117,
        durationDays: 19,
        icon: "kitchen",
        key: "finishes",
        name: "Finishes & fixtures",
        order: 6,
      },
      {
        budgetCents: 16_000_000,
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
      borrowerStartingCashCents: 25_000_000,
      buildName: "Hamilton Infill Build",
      lenderDrawPolicyLimitCents: 100_000_000,
      location: "Hamilton, ON",
      status: proposalStatus,
      totalBudgetCents: 125_000_000,
    },
    costItems: getVisualParityCostItems(),
    submilestones: [
      {
        key: "permit-mobilization",
        milestoneKey: "site-prep",
        name: "Permit mobilization",
      },
      { key: "excavation", milestoneKey: "site-prep", name: "Excavation" },
      { key: "forms", milestoneKey: "site-prep", name: "Concrete forms" },
      { key: "wall-framing", milestoneKey: "framing", name: "Wall framing" },
      { key: "roof-trusses", milestoneKey: "framing", name: "Roof trusses" },
      {
        key: "sheathing",
        milestoneKey: "framing",
        name: "Structural sheathing",
      },
      { key: "plumbing", milestoneKey: "rough-in", name: "Plumbing rough-in" },
      {
        key: "electrical",
        milestoneKey: "rough-in",
        name: "Electrical rough-in",
      },
      { key: "hvac", milestoneKey: "rough-in", name: "HVAC ducts" },
      { key: "windows", milestoneKey: "exterior", name: "Window install" },
      {
        key: "weather-barrier",
        milestoneKey: "exterior",
        name: "Weather barrier",
      },
      { key: "drywall-hang", milestoneKey: "drywall", name: "Drywall hang" },
      { key: "cabinetry", milestoneKey: "finishes", name: "Cabinetry" },
      { key: "fixture-set", milestoneKey: "finishes", name: "Fixture set" },
      { key: "punch-list", milestoneKey: "closeout", name: "Punch list" },
    ],
  };
}

function getVisualParityProposalStatus(
  proposalId: string
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
