import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import type {
  DemoCapitalSpike,
  DemoDraw,
  DemoMilestone,
  TimelineShareState,
} from "./-timeline-share-snapshot.ts";
import {
  mapSubmilestoneSnapshotRows,
  type TimelineSubmilestoneSnapshotRow,
} from "./-timeline-milestone-submilestones.ts";

const statusMap = {
  complete: "complete",
  ready: "ready",
  review: "ready",
  upcoming: "upcoming",
} as const;

export interface ConvexTimelineWorkspace {
  capitalEvents: {
    amountCents: number;
    capitalEventKey: string;
    eventKind?: "cashInfusion" | "cost";
    label: string;
    x: number;
  }[];
  draws: {
    amountCents: number;
    customDate?: boolean;
    drawKey: string;
    itemMilestoneKey?: string;
    label: string;
    requestNote?: string;
    requestReviewNote?: string;
    requestStatus?: "approved" | "draft" | "rejected" | "requested";
    reviewedAt?: string;
    requestedAt?: string;
    x: number;
  }[];
  evidenceAssets?: {
    evidenceKey: string;
    fileName: string;
    label: string;
    milestoneKey: string;
    mimeType: string;
    previewUrl?: string | null;
    sizeBytes: number;
    tag: string;
  }[];
  milestones: {
    budgetCents: number;
    completionClaim?: DemoMilestone["completionClaim"];
    completionReview?: DemoMilestone["completionReview"];
    drawAvailabilityCents?: number;
    drawKey?: string;
    durationDays: number;
    evidenceState: string;
    icon: DemoMilestone["icon"];
    lane?: number;
    markerLabel?: string;
    milestoneKey: string;
    name: string;
    order: number;
    policyState: string;
    status: "complete" | "ready" | "review" | "upcoming";
    submilestoneSnapshot: TimelineSubmilestoneSnapshotRow[];
    tone?: TimelineItem<DemoMilestone>["tone"];
    x: number;
  }[];
  plan: {
    borrowerCoPayBps?: number;
    borrowerCoPayCents?: number;
    currentDay: number;
    progressValue: number;
    rangeMax: number;
    rangeMin: number;
    routeState: {
      activeMilestoneKey?: string;
      selectedPanelOpen: boolean;
      straightLine: boolean;
    };
    startingCashCents: number;
  };
}

export function convexWorkspaceToTimelineState(
  workspace: ConvexTimelineWorkspace
): TimelineShareState {
  const draws = workspace.draws.map(
    (draw): DemoDraw => ({
      amount: centsToDollars(draw.amountCents),
      customDate: draw.customDate,
      id: draw.drawKey,
      itemId: draw.itemMilestoneKey,
      label: draw.label,
      requestNote: draw.requestNote,
      requestReviewNote: draw.requestReviewNote,
      requestStatus: draw.requestStatus,
      reviewedAt: draw.reviewedAt,
      requestedAt: draw.requestedAt,
      x: draw.x,
    })
  );
  const evidenceByMilestone = new Map<
    string,
    NonNullable<DemoMilestone["evidencePackage"]>["assets"]
  >();
  for (const asset of workspace.evidenceAssets ?? []) {
    const current = evidenceByMilestone.get(asset.milestoneKey) ?? [];
    current.push({
      fileName: asset.fileName,
      id: asset.evidenceKey,
      label: asset.label,
      mimeType: asset.mimeType,
      ...(asset.previewUrl ? { previewUrl: asset.previewUrl } : {}),
      size: asset.sizeBytes,
      tag: asset.tag,
    });
    evidenceByMilestone.set(asset.milestoneKey, current);
  }
  const items = workspace.milestones.map(
    (milestone): TimelineItem<DemoMilestone> => {
      const evidenceAssets =
        evidenceByMilestone.get(milestone.milestoneKey) ?? [];
      const completionClaim = milestone.completionClaim as
        | (DemoMilestone["completionClaim"] & {
            completionReview?: DemoMilestone["completionReview"];
          })
        | undefined;
      const submilestoneDetails = mapSubmilestoneSnapshotRows(
        milestone.submilestoneSnapshot,
        milestone.milestoneKey
      );
      return {
        data: {
          amount: centsToDollars(milestone.budgetCents),
          ...(completionClaim === undefined ? {} : { completionClaim }),
          ...((milestone.completionReview ?? completionClaim?.completionReview)
            ? {
                completionReview:
                  milestone.completionReview ??
                  completionClaim?.completionReview,
              }
            : {}),
          draw: milestone.drawKey ?? "Reimbursement draw",
          ...(milestone.drawAvailabilityCents === undefined
            ? {}
            : {
                drawAvailabilityAmount: centsToDollars(
                  milestone.drawAvailabilityCents
                ),
              }),
          durationDays: milestone.durationDays,
          evidence: milestone.evidenceState,
          ...(evidenceAssets.length > 0
            ? { evidencePackage: { assets: evidenceAssets } }
            : {}),
          icon: milestone.icon,
          name: milestone.name,
          policy: milestone.policyState,
          status: statusMap[milestone.status],
          subMilestones: submilestoneDetails.map((item) => item.name),
          submilestoneDetails,
        },
        eyebrow: `Milestone ${milestone.order}`,
        id: milestone.milestoneKey,
        label: milestone.name,
        lane: milestone.lane,
        markerLabel: milestone.markerLabel ?? String(milestone.order),
        tone: milestone.tone,
        x: milestone.x,
      };
    }
  );
  const activeMilestoneKey =
    workspace.plan.routeState.activeMilestoneKey ?? items[0]?.id ?? "";

  return {
    activeSelection: {
      itemId: activeMilestoneKey,
      phase: "inProgress",
    },
    capitalSpikes: workspace.capitalEvents
      .filter((event) => !isInitialBorrowerCapitalEvent(event.label))
      .map(
        (event): DemoCapitalSpike => ({
          amount: centsToDollars(event.amountCents),
          eventKind:
            event.eventKind === "cashInfusion" ? "cashInfusion" : "cost",
          id: event.capitalEventKey,
          label: event.label,
          x: event.x,
        })
      ),
    currentDay: workspace.plan.currentDay,
    draws,
    items,
    progressValue: workspace.plan.progressValue,
    range: {
      max: workspace.plan.rangeMax,
      min: workspace.plan.rangeMin,
      unit: "days",
    },
    selectedPanelOpen: workspace.plan.routeState.selectedPanelOpen,
    startingCash: centsToDollars(workspace.plan.startingCashCents),
    straightLine: workspace.plan.routeState.straightLine,
  };
}

function centsToDollars(value: number) {
  return Math.round(value / 100);
}

function isInitialBorrowerCapitalEvent(label: string) {
  return /^(borrower reserve|initial cash|cash on hand)$/i.test(label.trim());
}
