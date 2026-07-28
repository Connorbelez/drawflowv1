import type {
  TimelineItem,
  TimelineMarker,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import type {
  TimelineCashflowCompoundDatum,
  TimelineCashflowReferenceLine,
} from "#/features/timeline-workspace/-TimelineCashflowCompoundChart.tsx";
import type {
  TimelineDrawAvailabilityDatum,
  TimelineDrawAvailabilityReferenceLine,
} from "#/features/timeline-workspace/-TimelineDrawAvailabilityChart.tsx";
import type { DemoMilestone } from "#/features/timeline-workspace/-timeline-share-snapshot.ts";
import { calculateDrawAvailabilityAmount } from "#/features/timeline-workspace/-timeline-share-snapshot.ts";

import type { ProductionProposalDetail } from "./ProductionProposalSurfaces.tsx";

const DEFAULT_INTEREST_ANNUAL_BPS = 925;

export interface ProductionRoadmapProjection {
  cashflow: {
    data: TimelineCashflowCompoundDatum[];
    referenceLines: TimelineCashflowReferenceLine[];
    xDomain: [number, number];
    xTicks: number[];
    yDomain: [number, number];
  };
  drawAvailability: {
    data: TimelineDrawAvailabilityDatum[];
    referenceLines: TimelineDrawAvailabilityReferenceLine[];
    xDomain: [number, number];
    xTicks: number[];
    yDomain: [number, number];
  };
  items: TimelineItem<DemoMilestone>[];
  markers: TimelineMarker[];
}

interface DerivedCapitalSupportEvent {
  amount: number;
  day: number;
  id: string;
  milestoneKey: string;
  name: string;
}

export function buildProductionRoadmapProjection(
  detail: ProductionProposalDetail
): ProductionRoadmapProjection {
  const milestones = [...(detail.milestones ?? [])].sort(
    (a, b) => a.order - b.order
  );
  const draws = [...(detail.draws ?? detail.plannedDraws ?? [])].sort(
    (a, b) => a.timingDay - b.timingDay
  );
  const drawByMilestoneKey = new Map(
    draws
      .filter((draw) => draw.milestoneKey)
      .map((draw) => [draw.milestoneKey as string, draw])
  );
  const maxDay = Math.max(
    60,
    ...milestones.map((milestone) => milestone.dayEnd + 10),
    ...draws.map((draw) => draw.timingDay + 10)
  );
  const xDomain: [number, number] = [0, maxDay];
  const xTicks = buildTicks(maxDay);

  const cashflow = buildCashflowProjection(
    detail,
    milestones,
    draws,
    xDomain,
    xTicks
  );

  return {
    cashflow,
    drawAvailability: buildDrawAvailabilityProjection(
      milestones,
      draws,
      detail.proposal.borrowerCoPayBps,
      detail.loanFacility?.interestAnnualBps ??
        detail.proposal.interestAnnualBps ??
        DEFAULT_INTEREST_ANNUAL_BPS,
      xDomain,
      xTicks
    ),
    items: milestones.map((milestone, index) => ({
      data: {
        amount: centsToDollars(milestone.budgetCents),
        draw: drawByMilestoneKey.get(milestone.key)?.label ?? "Planned draw",
        drawAvailabilityAmount: milestoneDrawAvailabilityDollars(
          milestone,
          detail.proposal.borrowerCoPayBps
        ),
        drawX:
          drawByMilestoneKey.get(milestone.key)?.timingDay ?? milestone.dayEnd,
        durationDays:
          milestone.durationDays ??
          Math.max(1, milestone.dayEnd - milestone.dayStart),
        evidence: "Future evidence package",
        icon: milestone.icon ?? iconForMilestone(milestone.key, milestone.name),
        name: milestone.name,
        policy: "Within proposal policy",
        status: index === 0 ? "ready" : "upcoming",
        subMilestones: (detail.submilestones ?? [])
          .filter((submilestone) => submilestone.milestoneKey === milestone.key)
          .map((submilestone) => submilestone.name),
      },
      eyebrow: `Milestone ${index + 1}`,
      id: milestone.key,
      label: milestone.name,
      lane: index % 3 === 1 ? -1 : index % 3 === 2 ? 1 : 0,
      markerLabel: String(index + 1),
      tone: index === 0 ? "active" : "upcoming",
      x: milestone.dayStart,
    })),
    markers: buildTimelineMarkers(
      detail,
      milestones,
      draws,
      cashflow.derivedCapitalSupportEvents
    ),
  };
}

function buildCashflowProjection(
  detail: ProductionProposalDetail,
  milestones: NonNullable<ProductionProposalDetail["milestones"]>,
  draws: NonNullable<ProductionProposalDetail["draws"]>,
  xDomain: [number, number],
  xTicks: number[]
) {
  let cashOnHand = centsToDollars(
    detail.proposal.borrowerStartingCashCents
  );
  const derivedCapitalSupportEvents: DerivedCapitalSupportEvent[] = [];
  const data: TimelineCashflowCompoundDatum[] = [
    {
      budget: 0,
      cashInfusionAmount: cashOnHand,
      capitalSpikeAmount: 0,
      cashOnHand,
      day: 0,
      event: "start",
      id: "start",
      name: "Borrower working capital",
    },
  ];
  const events = [
    ...milestones.map((milestone) => ({
      amount: centsToDollars(milestone.budgetCents),
      day: milestone.dayStart,
      id: `milestone:${milestone.key}`,
      milestoneEndDay: milestone.dayEnd,
      name: milestone.name,
      type: "milestone" as const,
    })),
    ...draws.map((draw) => ({
      amount: centsToDollars(draw.amountCents),
      day: draw.timingDay,
      id: `draw:${draw.drawKey}`,
      name: draw.label,
      type: "draw" as const,
    })),
  ].sort((a, b) => a.day - b.day || a.type.localeCompare(b.type));

  for (const event of events) {
    if (event.type === "draw") {
      cashOnHand += event.amount;
      data.push({
        budget: 0,
        cashInfusionAmount: 0,
        capitalSpikeAmount: 0,
        cashOnHand,
        day: event.day,
        event: "draw",
        id: event.id,
        name: event.name,
      });
      continue;
    }

    const shortfallBeforeMilestone = Math.max(0, event.amount - cashOnHand);
    if (shortfallBeforeMilestone > 0) {
      cashOnHand += shortfallBeforeMilestone;
      const supportEvent = {
        amount: shortfallBeforeMilestone,
        day: event.day,
        id: `cash-infusion:${event.id}`,
        milestoneKey: event.id.replace(/^milestone:/, ""),
        name: `${event.name} cash infusion`,
      };
      derivedCapitalSupportEvents.push(supportEvent);
      data.push({
        budget: 0,
        cashInfusionAmount: shortfallBeforeMilestone,
        capitalSpikeAmount: 0,
        cashOnHand,
        day: event.day,
        event: "cashInfusion",
        id: supportEvent.id,
        name: supportEvent.name,
      });
    }

    cashOnHand -= event.amount;
    data.push({
      budget: event.amount,
      cashInfusionAmount: 0,
      capitalSpikeAmount: 0,
      cashOnHand,
      day: event.day,
      event: "milestone",
      id: event.id,
      milestoneEndDay: event.milestoneEndDay,
      name: event.name,
    });
  }

  const values = data.flatMap((row) => [
    row.budget,
    row.cashInfusionAmount ?? 0,
    row.capitalSpikeAmount,
    row.cashOnHand,
  ]);
  return {
    data,
    derivedCapitalSupportEvents,
    referenceLines: [
      ...draws.map((draw) => drawReferenceLine(draw.timingDay)),
      ...derivedCapitalSupportEvents.map((event) =>
        cashInfusionReferenceLine(event.day)
      ),
    ],
    xDomain,
    xTicks,
    yDomain: paddedDomain(values),
  };
}

function milestoneDrawAvailabilityDollars(
  milestone: {
    budgetCents: number;
    drawAvailabilityCents?: number;
  },
  borrowerCoPayBps: number | undefined
) {
  if (milestone.drawAvailabilityCents !== undefined) {
    return centsToDollars(milestone.drawAvailabilityCents);
  }

  return calculateDrawAvailabilityAmount(
    centsToDollars(milestone.budgetCents),
    borrowerCoPayBps
  );
}

function buildDrawAvailabilityProjection(
  milestones: NonNullable<ProductionProposalDetail["milestones"]>,
  draws: NonNullable<ProductionProposalDetail["draws"]>,
  borrowerCoPayBps: number | undefined,
  interestAnnualBps: number,
  xDomain: [number, number],
  xTicks: number[]
) {
  let unlockedDraw = 0;
  let releasedDraw = 0;
  let previousDay = 0;
  let totalInterestAccrued = 0;
  const data: TimelineDrawAvailabilityDatum[] = [
    {
      additionalAvailableDraw: 0,
      day: 0,
      interestBearingDraw: 0,
      name: "Proposal start",
      totalInterestAccrued: 0,
      totalAvailableDraw: 0,
    },
  ];

  const events = [
    ...milestones.map((milestone) => ({
      amount: milestoneDrawAvailabilityDollars(milestone, borrowerCoPayBps),
      day: milestone.dayEnd,
      id: `unlock:${milestone.key}`,
      name: `${milestone.name} draw capacity`,
      sortOrder: 1,
      type: "unlock" as const,
    })),
    ...draws.map((draw) => ({
      amount: centsToDollars(draw.amountCents),
      day: draw.timingDay,
      id: `release:${draw.drawKey}`,
      name: draw.label,
      sortOrder: 2,
      type: "release" as const,
    })),
  ].sort(
    (a, b) =>
      a.day - b.day || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
  );

  for (const event of events) {
    totalInterestAccrued += calculateDailyCompoundedInterest(
      releasedDraw + totalInterestAccrued,
      event.day - previousDay,
      interestAnnualBps
    );
    previousDay = event.day;

    if (event.type === "unlock") {
      unlockedDraw += event.amount;
    } else {
      releasedDraw += event.amount;
    }

    const additionalAvailableDraw = Math.max(0, unlockedDraw - releasedDraw);
    data.push({
      additionalAvailableDraw,
      day: event.day,
      interestBearingDraw: releasedDraw,
      name: event.name,
      totalInterestAccrued,
      totalAvailableDraw: releasedDraw + additionalAvailableDraw,
    });
  }
  const yMax = Math.max(
    1,
    ...data.map((row) => row.totalAvailableDraw + row.additionalAvailableDraw)
  );
  return {
    data,
    referenceLines: [
      ...milestones.map((milestone) =>
        milestoneEndReferenceLine(milestone.dayEnd)
      ),
      ...draws.map((draw) => drawReferenceLine(draw.timingDay)),
    ],
    xDomain,
    xTicks,
    yDomain: [0, Math.ceil(yMax * 1.12)] as [number, number],
  };
}

function calculateDailyCompoundedInterest(
  principal: number,
  elapsedDays: number,
  interestAnnualBps: number
) {
  if (principal <= 0 || elapsedDays <= 0 || interestAnnualBps <= 0) {
    return 0;
  }

  const dailyRate = interestAnnualBps / 10_000 / 365;
  return principal * ((1 + dailyRate) ** elapsedDays - 1);
}

function buildTimelineMarkers(
  detail: ProductionProposalDetail,
  milestones: NonNullable<ProductionProposalDetail["milestones"]>,
  draws: NonNullable<ProductionProposalDetail["draws"]>,
  capitalSupportEvents: DerivedCapitalSupportEvent[]
): TimelineMarker[] {
  const borrowerWorkingCapital = centsToDollars(
    detail.proposal.borrowerStartingCashCents
  );
  const lenderPolicyLimit = centsToDollars(
    detail.proposal.lenderDrawPolicyLimitCents
  );
  const capitalStressMarkers = milestones.flatMap((milestone) => {
    const amount = centsToDollars(milestone.budgetCents);
    if (amount <= Math.min(borrowerWorkingCapital, lenderPolicyLimit)) {
      return [];
    }
    return [
      {
        id: `capital-spike:${milestone.key}`,
        label: "Capital spike",
        sublabel: `${formatCompactMoney(amount)} · Day ${milestone.dayStart}`,
        tone: "warning" as const,
        x: milestone.dayStart,
      },
    ];
  });

  return [
    {
      id: "working-capital",
      label: "Cash infusion",
      sublabel: `${formatCompactMoney(borrowerWorkingCapital)} · Day 0`,
      tone: "today" as const,
      x: 0,
    },
    ...draws.map((draw, index) => ({
      id: `draw:${draw.drawKey}`,
      label: draw.label || `Draw ${index + 1}`,
      sublabel: `${formatCompactMoney(centsToDollars(draw.amountCents))} · Day ${draw.timingDay}`,
      tone: "accent" as const,
      x: draw.timingDay,
    })),
    ...capitalSupportEvents.map((event) => ({
      id: event.id,
      label: "Cash infusion needed",
      sublabel: `${formatCompactMoney(event.amount)} · Day ${event.day}`,
      tone: "warning" as const,
      x: event.day,
    })),
    ...capitalStressMarkers,
  ].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
}

function buildTicks(maxDay: number) {
  const interval = maxDay <= 90 ? 15 : 30;
  const ticks: number[] = [];
  for (let day = 0; day <= maxDay; day += interval) {
    ticks.push(day);
  }
  if (ticks[ticks.length - 1] !== maxDay) {
    ticks.push(maxDay);
  }
  return ticks;
}

function drawReferenceLine(x: number) {
  return {
    opacity: 0.46,
    stroke: "oklch(0.62 0.18 245)",
    strokeDasharray: "3 4",
    x,
  };
}

function cashInfusionReferenceLine(x: number) {
  return {
    opacity: 0.54,
    stroke: "oklch(0.58 0.18 150)",
    strokeDasharray: "4 3",
    x,
  };
}

function milestoneEndReferenceLine(x: number) {
  return {
    opacity: 0.42,
    stroke: "oklch(0.67 0.18 275)",
    strokeDasharray: "5 4",
    x,
  };
}

function paddedDomain(values: number[]): [number, number] {
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const padding = Math.max(10_000, Math.round((max - min) * 0.12));
  return [min - padding, max + padding];
}

function centsToDollars(cents: number) {
  return Math.round(cents / 100);
}

function formatCompactMoney(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absolute >= 1_000_000) {
    return `${sign}$${(absolute / 1_000_000).toFixed(1)}M`;
  }

  if (absolute >= 1000) {
    return `${sign}$${Math.round(absolute / 1000)}K`;
  }

  return `${sign}$${Math.round(absolute)}`;
}

function iconForMilestone(key: string, name?: string): DemoMilestone["icon"] {
  const normalized = `${key} ${name ?? ""}`.toLowerCase();
  if (normalized.includes("foundation") || normalized.includes("site")) {
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
  if (normalized.includes("shell") || normalized.includes("fram")) {
    return "framing";
  }
  if (normalized.includes("rough")) {
    return "roughIn";
  }
  if (normalized.includes("exterior") || normalized.includes("dry")) {
    return "exterior";
  }
  if (normalized.includes("finish") || normalized.includes("interior")) {
    return "finishes";
  }
  if (normalized.includes("close")) {
    return "closeout";
  }
  return "drywall";
}
