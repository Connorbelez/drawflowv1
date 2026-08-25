import type {
  TimelineItem,
  TimelineMarker,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import type { MilestoneCardUpdate } from "#/features/timeline-workspace/-MilestoneCard.tsx";
import type {
  TimelineCashflowCompoundDatum,
  TimelineCashflowReferenceLine,
} from "#/features/timeline-workspace/-TimelineCashflowCompoundChart.tsx";
import type {
  TimelineDrawAvailabilityDatum,
  TimelineDrawAvailabilityReferenceLine,
} from "#/features/timeline-workspace/-TimelineDrawAvailabilityChart.tsx";
import type { DemoMilestone } from "#/features/timeline-workspace/-timeline-share-snapshot.ts";

const PROPOSAL_REVIEW_INTEREST_APR = 0.0925;
const proposalMilestoneStatusMap = {
  complete: "complete",
  ready: "ready",
  review: "ready",
  upcoming: "upcoming",
} as const satisfies Record<string, DemoMilestone["status"]>;

export function buildProposalMilestoneMutationArgs(
  milestone: ProposalReviewMilestone,
  milestoneKey: string,
  patch: MilestoneCardUpdate,
  planId: string
) {
  const mutationArgs: {
    budgetCents?: number;
    dayEnd?: number;
    dayStart?: number;
    durationDays?: number;
    milestoneKey: string;
    planId: string;
  } = {
    milestoneKey,
    planId,
  };

  if (patch.amount !== undefined) {
    mutationArgs.budgetCents = dollarsToCents(patch.amount);
  }

  const nextDayStart =
    patch.x === undefined
      ? Math.round(milestone.x ?? milestone.dayStart)
      : Math.round(patch.x);

  if (patch.x !== undefined) {
    mutationArgs.dayStart = nextDayStart;
  }

  if (patch.durationDays !== undefined) {
    mutationArgs.durationDays = Math.max(1, Math.round(patch.durationDays));
    mutationArgs.dayEnd = nextDayStart + mutationArgs.durationDays;
  }

  if (
    mutationArgs.budgetCents === undefined &&
    mutationArgs.dayStart === undefined &&
    mutationArgs.durationDays === undefined
  ) {
    return null;
  }

  return mutationArgs;
}

export function buildProposalTimelineMarkers(viewModel: any): TimelineMarker[] {
  const draws = viewModel?.workingCopy?.draws ?? [];
  const capitalEvents = viewModel?.workingCopy?.capitalEvents ?? [];

  return [
    ...draws.map((draw: ProposalReviewDraw) => ({
      id: `draw-${draw.drawKey}`,
      label: draw.label,
      sublabel: `${formatProbeMoney(centsToDollars(draw.amountCents))} · Day ${Math.round(draw.x)}`,
      tone: "accent" as const,
      x: draw.x,
    })),
    ...capitalEvents
      .filter(
        (event: ProposalReviewCapitalEvent) =>
          !isInitialBorrowerCapitalEvent(event.label)
      )
      .map((event: ProposalReviewCapitalEvent) => ({
        id: `capital-spike-${event.capitalEventKey}`,
        label: event.label,
        sublabel: `${formatProbeMoney(centsToDollars(event.amountCents))} · Day ${Math.round(event.x)}`,
        tone:
          event.eventKind === "cashInfusion"
            ? ("today" as const)
            : ("warning" as const),
        x: event.x,
      })),
  ];
}

export function buildProposalTimelineItems(
  viewModel: any
): TimelineItem<DemoMilestone>[] {
  return (viewModel?.workingCopy?.milestones ?? []).map(
    (milestone: ProposalReviewMilestone) => ({
      data: {
        amount: centsToDollars(milestone.budgetCents),
        draw: milestone.drawKey ?? "Reimbursement draw",
        durationDays: milestone.durationDays,
        evidence: milestone.evidenceState,
        icon: milestone.icon,
        name: milestone.name,
        policy: milestone.policyState,
        status: proposalMilestoneStatusMap[milestone.status] ?? "upcoming",
        subMilestones: (milestone.submilestoneSnapshot ?? []).map(
          (row) => row.name
        ),
      },
      eyebrow: `Milestone ${milestone.order}`,
      id: milestone.milestoneKey,
      label: milestone.name,
      lane: milestone.lane,
      markerLabel: milestone.markerLabel ?? String(milestone.order),
      tone: milestone.tone,
      x: milestone.x ?? milestone.dayStart,
    })
  );
}

export type ProposalReviewDraw = {
  amountCents: number;
  drawKey: string;
  label: string;
  x: number;
};

export type ProposalReviewCapitalEvent = {
  amountCents: number;
  capitalEventKey: string;
  eventKind?: "cashInfusion" | "cost";
  label: string;
  x: number;
};

export type ProposalReviewSnapshotMilestone = {
  budgetCents: number;
  dayStart: number;
  durationDays: number;
  sourceTimelineMilestoneId: string;
};

export type ProposalReviewMilestone = {
  _id: string;
  budgetCents: number;
  dayEnd: number;
  dayStart: number;
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
  status: keyof typeof proposalMilestoneStatusMap;
  submilestoneSnapshot?: { name: string }[];
  tone?: TimelineItem<DemoMilestone>["tone"];
  x?: number;
};

export function buildTimelineItems(
  viewModel: any
): TimelineItem<DemoMilestone>[] {
  return buildProposalTimelineItems(viewModel);
}

export function buildReviewChartData(viewModel: any) {
  const milestones = viewModel?.workingCopy?.milestones ?? [];
  const draws = viewModel?.workingCopy?.draws ?? [];
  const capitalEvents = viewModel?.workingCopy?.capitalEvents ?? [];
  const startingCash = centsToDollars(viewModel?.plan?.startingCashCents ?? 0);
  const cashEvents = [
    ...milestones.map((row: any) => ({
      amount: centsToDollars(row.budgetCents),
      day: row.dayStart,
      drawCapacityUnlocked: centsToDollars(
        row.drawAvailabilityCents ?? row.budgetCents
      ),
      event: "milestone" as const,
      id: row.milestoneKey,
      name: row.name,
      sort: 1,
    })),
    ...capitalEvents
      .filter((row: any) => !isInitialBorrowerCapitalEvent(row.label))
      .map((row: any) => ({
        amount: centsToDollars(row.amountCents),
        day: row.x,
        event: "capitalSpike" as const,
        id: row.capitalEventKey,
        name: row.label,
        sort: 2,
      })),
    ...draws.map((row: any) => ({
      amount: centsToDollars(row.amountCents),
      day: row.x,
      event: "draw" as const,
      id: row.drawKey,
      name: row.label,
      sort: 3,
    })),
  ].sort((a, b) => a.day - b.day || a.sort - b.sort);
  let cashOnHand = startingCash;
  const cashflow: TimelineCashflowCompoundDatum[] = [
    {
      budget: 0,
      capitalSpikeAmount: 0,
      cashOnHand,
      day: 0,
      event: "start" as const,
      id: "starting-cash",
      name: "Initial cash on hand",
    },
  ];
  for (const event of cashEvents) {
    if (event.event === "draw") {
      cashOnHand += event.amount;
      cashflow.push({
        budget: 0,
        capitalSpikeAmount: 0,
        cashOnHand,
        day: event.day,
        event: "draw" as const,
        id: event.id,
        name: event.name,
      });
      continue;
    }
    cashOnHand -= event.amount;
    const reimbursableBudget =
      event.event === "milestone"
        ? Math.min(event.amount, event.drawCapacityUnlocked)
        : 0;
    cashflow.push({
      budget: event.event === "milestone" ? event.amount : 0,
      capitalSpikeAmount: event.event === "capitalSpike" ? event.amount : 0,
      cashOnHand,
      day: event.day,
      event: event.event,
      id: event.id,
      name: event.name,
      outOfPocketBudget:
        event.event === "milestone"
          ? Math.max(0, event.amount - reimbursableBudget)
          : 0,
      reimbursableBudget,
    });
  }
  let unlockedDraw = 0;
  let releasedDraw = 0;
  let previousAvailabilityDay = 0;
  let totalInterestAccrued = 0;
  const availabilityEvents = [
    ...milestones.map((row: any) => ({
      amount: centsToDollars(row.budgetCents),
      day: row.dayEnd,
      label: `${row.name} completion`,
      type: "unlock" as const,
    })),
    ...draws.map((row: any) => ({
      amount: centsToDollars(row.amountCents),
      day: row.x,
      label: row.label,
      type: "release" as const,
    })),
  ].sort((a, b) => a.day - b.day);
  const drawAvailability = availabilityEvents.map((event) => {
    totalInterestAccrued += calculateProposalDailyCompoundedInterest(
      releasedDraw + totalInterestAccrued,
      event.day - previousAvailabilityDay
    );
    previousAvailabilityDay = event.day;

    if (event.type === "unlock") {
      unlockedDraw += event.amount;
    } else {
      releasedDraw += event.amount;
    }
    return {
      additionalAvailableDraw: Math.max(0, unlockedDraw - releasedDraw),
      day: event.day,
      interestBearingDraw: releasedDraw,
      name: event.label,
      totalInterestAccrued,
      totalAvailableDraw: unlockedDraw,
    };
  });
  const maxDay = Math.max(
    30,
    ...milestones.map((row: any) => row.dayEnd),
    ...draws.map((row: any) => row.x),
    ...capitalEvents.map((row: any) => row.x)
  );
  const maxValue = Math.max(
    100_000,
    startingCash,
    ...cashflow.flatMap((row) => [
      Math.abs(row.cashOnHand),
      row.budget,
      row.capitalSpikeAmount,
    ]),
    ...drawAvailability.flatMap((row) => [
      row.additionalAvailableDraw,
      row.interestBearingDraw,
      row.totalAvailableDraw,
    ])
  );
  return {
    cashflow,
    drawAvailability,
    maxDay,
    maxValue,
    ticks: Array.from({ length: 6 }, (_, index) =>
      Math.round((maxDay / 5) * index)
    ),
  };
}

export function buildProposalProbeReferenceLines(
  probeValue: number | null,
  cashflow: TimelineCashflowCompoundDatum[],
  drawAvailability: TimelineDrawAvailabilityDatum[],
  startingCash: number
): {
  cashflow: TimelineCashflowReferenceLine[];
  drawAvailability: TimelineDrawAvailabilityReferenceLine[];
} {
  if (probeValue === null) {
    return { cashflow: [], drawAvailability: [] };
  }

  const probeCashOnHand = interpolateProposalCashOnHand(
    cashflow,
    probeValue,
    startingCash
  );
  const probeDrawAvailability = interpolateProposalDrawAvailability(
    drawAvailability,
    Math.round(probeValue)
  );

  return {
    cashflow: [
      {
        label: [
          `Day ${Math.round(probeValue)}`,
          `Cash on hand ${formatProbeMoney(probeCashOnHand)}`,
        ],
        opacity: 0.78,
        stroke: "oklch(0.62 0.22 25)",
        strokeDasharray: "4 3",
        x: probeValue,
      },
    ],
    drawAvailability: [
      {
        label: [
          `Delta ${formatProbeMoney(
            probeDrawAvailability.additionalAvailableDraw
          )}`,
          `Interest-bearing ${formatProbeMoney(
            probeDrawAvailability.interestBearingDraw
          )}`,
          `Total interest ${formatProbeMoney(
            probeDrawAvailability.totalInterestAccrued
          )}`,
        ],
        opacity: 0.82,
        stroke: "oklch(0.6 0.18 240)",
        strokeDasharray: "4 3",
        x: probeValue,
      },
    ],
  };
}

function interpolateProposalCashOnHand(
  data: TimelineCashflowCompoundDatum[],
  value: number,
  startingCash: number
) {
  if (data.length === 0) {
    return startingCash;
  }

  const sorted = [...data].sort(
    (a, b) => a.day - b.day || a.id.localeCompare(b.id)
  );
  let previous = sorted[0];

  if (!previous) {
    return startingCash;
  }

  if (value <= previous.day) {
    return previous.cashOnHand;
  }

  for (const point of sorted.slice(1)) {
    if (point.day < value) {
      previous = point;
      continue;
    }

    if (point.day === value || point.day === previous.day) {
      return point.cashOnHand;
    }

    const ratio = (value - previous.day) / (point.day - previous.day);

    return (
      previous.cashOnHand + (point.cashOnHand - previous.cashOnHand) * ratio
    );
  }

  return previous.cashOnHand;
}

function interpolateProposalDrawAvailability(
  data: TimelineDrawAvailabilityDatum[],
  value: number
) {
  const fallback: TimelineDrawAvailabilityDatum = {
    additionalAvailableDraw: 0,
    day: value,
    interestBearingDraw: 0,
    name: "No draw capacity",
    totalInterestAccrued: 0,
    totalAvailableDraw: 0,
  };

  if (data.length === 0) {
    return fallback;
  }

  let current = data[0] ?? fallback;

  for (const point of data) {
    if (point.day > value) {
      break;
    }

    current = point;
  }

  return {
    ...current,
    day: value,
    totalInterestAccrued:
      current.totalInterestAccrued +
      calculateProposalDailyCompoundedInterest(
        current.interestBearingDraw + current.totalInterestAccrued,
        Math.max(0, value - current.day)
      ),
  };
}

function calculateProposalDailyCompoundedInterest(
  principal: number,
  elapsedDays: number
) {
  if (principal <= 0 || elapsedDays <= 0) {
    return 0;
  }

  return (
    principal * ((1 + PROPOSAL_REVIEW_INTEREST_APR / 365) ** elapsedDays - 1)
  );
}

function formatProbeMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export function formatUtcDateInputValue(epochMs: number) {
  const date = new Date(epochMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDefaultApprovalStartDateInput(plan?: {
  startDate?: number;
  status?: string;
}) {
  if (plan?.status !== "submitted") {
    return "";
  }

  const todayUtc = floorUtcMidnight(Date.now());
  if (plan.startDate !== undefined && plan.startDate >= todayUtc) {
    return formatUtcDateInputValue(plan.startDate);
  }

  return formatUtcDateInputValue(Date.now());
}

export function validateApprovalStartDate(
  startDate: string,
  status?: string
):
  | {
      message: string;
      ok: false;
      reason: "invalid_date" | "missing_date" | "not_submitted" | "past_date";
    }
  | { ok: true; parsed: number } {
  if (status !== "submitted") {
    return {
      message: "This proposal is no longer awaiting approval.",
      ok: false,
      reason: "not_submitted",
    };
  }

  if (!startDate.trim()) {
    return {
      message:
        "Choose an approval start date (today or later) in Admin decision before approving.",
      ok: false,
      reason: "missing_date",
    };
  }

  const parsed = Date.parse(`${startDate}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) {
    return {
      message: "Approval start date is invalid.",
      ok: false,
      reason: "invalid_date",
    };
  }

  if (parsed < floorUtcMidnight(Date.now())) {
    return {
      message: "Start date must be today or later (UTC).",
      ok: false,
      reason: "past_date",
    };
  }

  return { ok: true, parsed };
}

function floorUtcMidnight(epochMs: number) {
  const date = new Date(epochMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function formatCents(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
}

export function formatCompactMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function centsToDollars(value: number) {
  return Math.round(value / 100);
}

function dollarsToCents(value: number) {
  return Math.round(value * 100);
}

function isInitialBorrowerCapitalEvent(label: string) {
  return /^(borrower reserve|initial cash|cash on hand)$/i.test(label.trim());
}
