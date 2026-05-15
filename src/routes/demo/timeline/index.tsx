import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  Check,
  CircleDollarSign,
  Copy,
  ExternalLink,
  Flag,
  LinkIcon,
  Loader2,
  Mail,
  QrCode,
  ReceiptText,
  RotateCcw,
  Share2,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createStandardSchemaV1, parseAsString, useQueryStates } from "nuqs";
import { QRCodeSVG } from "qrcode.react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { EvilComposedChart } from "#/components/evilcharts/charts/composed-chart.tsx";
import type { ChartConfig } from "#/components/evilcharts/ui/chart.tsx";
import {
  AnimatedCurvedTimeline,
  type TimelineItem,
  type TimelineMarker,
  type TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "#/components/ui/context-menu.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover.tsx";
import { Switch } from "#/components/ui/switch.tsx";
import { useMediaQuery } from "#/hooks/use-media-query.ts";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../../convex/_generated/api";
import {
  applyTimelineShareSnapshotV1,
  buildTimelineShareSnapshotV1,
  type DemoDraw,
  type DemoMilestone,
  type DemoStatus,
  type IsometricIconKey,
  initialTimelineShareState,
  type TimelineShareSnapshotV1,
  type TimelineShareState,
} from "./-timeline-share-snapshot.ts";

const timelineSearchParsers = {
  share: parseAsString,
};

export const Route = createFileRoute("/demo/timeline/")({
  component: RouteComponent,
  ssr: false,
  validateSearch: createStandardSchemaV1(timelineSearchParsers, {
    partialOutput: true,
  }),
});

interface DrawEditDraft {
  amount: string;
  x: string;
}

export interface CashflowDatum {
  budget: number;
  cashOnHand: number;
  day: number;
  drawAmount: number;
  event: "draw" | "milestone" | "start";
  id: string;
  name: string;
  [key: string]: unknown;
}

interface DrawAvailabilityDatum {
  additionalAvailableDraw: number;
  day: number;
  interestBearingDraw: number;
  name: string;
  totalAvailableDraw: number;
  [key: string]: unknown;
}

export interface CashShortfallPoint {
  cashBeforeMilestone: number;
  cashOnHand: number;
  day: number;
  milestone: string;
  milestoneCost: number;
  shortfall: number;
}

interface FinancialOverview {
  drawCount: number;
  drawFeesPaid: number;
  interestPaid: number;
  totalDrawReleased: number;
}

const INITIAL_RANGE: TimelineRange = {
  max: 230,
  min: 0,
  unit: "days",
};
const DRAW_REVIEW_LAG_DAYS = 8;
const DRAW_FEE = 500;
const INTEREST_APR = 0.0925;
const MINIMUM_POST_MILESTONE_CASH_RESERVE = 0;
const STARTING_CASH = 400_000;

const cashflowChartConfig = {
  additionalAvailableDraw: {
    label: "Additional available draw",
    colors: {
      dark: ["oklch(0.72 0.15 240)", "oklch(0.84 0.12 210)"],
      light: ["oklch(0.6 0.18 240)", "oklch(0.72 0.15 240)"],
    },
  },
  cashOnHand: {
    label: "Cash on hand",
    colors: {
      dark: ["oklch(0.78 0.16 85)", "oklch(0.62 0.22 25)"],
      light: ["oklch(0.58 0.2 25)", "oklch(0.72 0.18 45)"],
    },
  },
  budget: {
    label: "Milestone cost",
    colors: {
      dark: ["oklch(0.7 0.18 275)", "oklch(0.76 0.17 235)"],
      light: ["oklch(0.67 0.18 275)", "oklch(0.76 0.17 235)"],
    },
  },
  interestBearingDraw: {
    label: "Interest-bearing draw",
    colors: {
      dark: ["oklch(0.7 0.18 275)", "oklch(0.78 0.14 255)"],
      light: ["oklch(0.65 0.18 275)", "oklch(0.78 0.14 255)"],
    },
  },
  totalAvailableDraw: {
    label: "Interest + available draw",
    colors: {
      dark: ["oklch(0.78 0.16 145)", "oklch(0.72 0.18 165)"],
      light: ["oklch(0.58 0.19 150)", "oklch(0.7 0.18 165)"],
    },
  },
} satisfies ChartConfig;

const INITIAL_ITEMS: TimelineItem<DemoMilestone>[] = [
  {
    data: {
      amount: 125_000,
      draw: "Draw 1",
      evidence: "Accepted package",
      icon: "foundation",
      name: "Site prep & foundation",
      policy: "Released",
      status: "complete",
    },
    eyebrow: "Milestone 1",
    id: "site-prep",
    label: "Site prep",
    lane: 0,
    markerLabel: "1",
    tone: "complete",
    x: 14,
  },
  {
    data: {
      amount: 160_000,
      draw: "Draw 2",
      evidence: "Accepted package",
      icon: "framing",
      name: "Framing & structure",
      policy: "Released",
      status: "complete",
    },
    eyebrow: "Milestone 2",
    id: "framing",
    label: "Framing",
    lane: -1,
    markerLabel: "2",
    tone: "complete",
    x: 58,
  },
  {
    data: {
      amount: 245_000,
      draw: "Draw 3",
      evidence: "Site visit today",
      icon: "roughIn",
      name: "Rough-in mechanical",
      policy: "Admin review",
      status: "review",
    },
    eyebrow: "Milestone 3",
    id: "rough-in",
    label: "Rough-in",
    lane: 1,
    markerLabel: "3",
    tone: "active",
    x: 92,
  },
  {
    data: {
      amount: 210_000,
      draw: "Draw 4",
      evidence: "Draft started",
      icon: "exterior",
      name: "Windows & exterior",
      policy: "Evidence required",
      status: "ready",
    },
    eyebrow: "Milestone 4",
    id: "exterior",
    label: "Exterior",
    lane: 0,
    markerLabel: "4",
    tone: "warning",
    x: 132,
  },
  {
    data: {
      amount: 190_000,
      draw: "Draw 5",
      evidence: "Not started",
      icon: "drywall",
      name: "Inspections & drywall",
      policy: "Upcoming",
      status: "upcoming",
    },
    eyebrow: "Milestone 5",
    id: "drywall",
    label: "Drywall",
    lane: -1,
    markerLabel: "5",
    tone: "upcoming",
    x: 168,
  },
  {
    data: {
      amount: 160_000,
      draw: "Draw 6",
      evidence: "Not started",
      icon: "finishes",
      name: "Finishes & fixtures",
      policy: "Upcoming",
      status: "upcoming",
    },
    eyebrow: "Milestone 6",
    id: "finishes",
    label: "Finishes",
    lane: 1,
    markerLabel: "6",
    tone: "upcoming",
    x: 204,
  },
  {
    data: {
      amount: 160_000,
      draw: "Draw 7",
      evidence: "Not started",
      icon: "closeout",
      name: "Final inspection & closeout",
      policy: "Upcoming",
      status: "upcoming",
    },
    eyebrow: "Milestone 7",
    id: "closeout",
    label: "Closeout",
    lane: 0,
    markerLabel: "7",
    tone: "upcoming",
    x: 226,
  },
];

const statusLabels: Record<DemoStatus, string> = {
  complete: "Completed",
  ready: "Evidence pending",
  review: "In review",
  upcoming: "Upcoming",
};

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);

const routeSectionVariants = {
  hidden: {
    filter: "blur(10px)",
    opacity: 0,
    y: 24,
  },
  show: {
    filter: "blur(0px)",
    opacity: 1,
    transition: {
      duration: 0.48,
      ease: [0.16, 1, 0.3, 1],
    },
    y: 0,
  },
} as const;

interface TimelineResponsiveSizing {
  barSize: number;
  cardWidth: number;
  endCardWidth: number;
  minNodeSpacingPx: number;
  pixelsPerUnit: number;
  yAxisWidth: number;
}

function getTimelineResponsiveSizing(
  isCompactLayout: boolean,
  isPhoneLayout: boolean
): TimelineResponsiveSizing {
  if (isPhoneLayout) {
    return {
      barSize: 14,
      cardWidth: 224,
      endCardWidth: 244,
      minNodeSpacingPx: 184,
      pixelsPerUnit: 5.35,
      yAxisWidth: 48,
    };
  }

  if (isCompactLayout) {
    return {
      barSize: 20,
      cardWidth: 232,
      endCardWidth: 260,
      minNodeSpacingPx: 190,
      pixelsPerUnit: 5.85,
      yAxisWidth: 58,
    };
  }

  return {
    barSize: 20,
    cardWidth: 232,
    endCardWidth: 276,
    minNodeSpacingPx: 198,
    pixelsPerUnit: 6.4,
    yAxisWidth: 58,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The demo route is the controlled state orchestration surface for timeline, charts, and sharing.
function RouteComponent() {
  const prefersReducedMotion = useReducedMotion();
  const isCompactLayout = useMediaQuery("max-lg");
  const isPhoneLayout = useMediaQuery("max-sm");
  const insertionCount = useRef(0);
  const drawInsertionCount = useRef(0);
  const [items, setItems] =
    useState<TimelineItem<DemoMilestone>[]>(INITIAL_ITEMS);
  const [draws, setDraws] = useState<DemoDraw[]>(() =>
    buildDemoDraws(INITIAL_ITEMS, INITIAL_RANGE)
  );
  const [range, setRange] = useState<TimelineRange>(INITIAL_RANGE);
  const [activeItemId, setActiveItemId] = useState("rough-in");
  const [progressValue, setProgressValue] = useState(92);
  const [probeValue, setProbeValue] = useState<number | null>(null);
  const [activeDrawId, setActiveDrawId] = useState<string | null>(null);
  const [drawEditDraft, setDrawEditDraft] = useState<DrawEditDraft>({
    amount: "",
    x: "",
  });
  const [selectedPanelOpen, setSelectedPanelOpen] = useState(true);
  const [straightLine, setStraightLine] = useState(false);
  const activeItem = items.find((item) => item.id === activeItemId) ?? items[0];
  const resolvedRange = useMemo(() => normalizeDemoRange(range), [range]);
  const {
    resetTimeline,
    shareMenuProps,
    sharedSnapshotLoading,
    sharedSnapshotMissing,
    share,
  } = useTimelineSnapshotSharing({
    activeItemId,
    drawInsertionCount,
    draws,
    insertionCount,
    items,
    progressValue,
    resolvedRange,
    selectedPanelOpen,
    setActiveDrawId,
    setActiveItemId,
    setDrawEditDraft,
    setDraws,
    setItems,
    setProbeValue,
    setProgressValue,
    setRange,
    setSelectedPanelOpen,
    setStraightLine,
    straightLine,
  });
  const cashflowData = useMemo(
    () => buildTimelineCashflowData(items, draws, resolvedRange),
    [draws, items, resolvedRange]
  );
  const drawAvailabilityData = useMemo(
    () => buildDrawAvailabilityData(cashflowData),
    [cashflowData]
  );
  const cashShortfalls = useMemo(
    () => buildCashShortfallPoints(cashflowData),
    [cashflowData]
  );
  const financialOverview = useMemo(
    () => buildFinancialOverview(cashflowData, draws, resolvedRange),
    [cashflowData, draws, resolvedRange]
  );
  const cashflowTicks = useMemo(
    () => getCashflowTicks(resolvedRange),
    [resolvedRange]
  );
  const cashflowExtent = useMemo(
    () => getCashflowChartExtent(cashflowData),
    [cashflowData]
  );
  const drawAvailabilityExtent = useMemo(
    () => getDrawAvailabilityChartExtent(drawAvailabilityData),
    [drawAvailabilityData]
  );
  const probeCashOnHand =
    probeValue === null
      ? null
      : interpolateCashOnHand(cashflowData, probeValue);
  const probeDrawAvailability =
    probeValue === null
      ? null
      : interpolateDrawAvailability(
          drawAvailabilityData,
          Math.round(probeValue)
        );
  const endingCashOnHand = cashflowData.at(-1)?.cashOnHand ?? STARTING_CASH;
  const endingAvailability = drawAvailabilityData.at(-1) ?? {
    additionalAvailableDraw: 0,
    interestBearingDraw: 0,
    totalAvailableDraw: 0,
  };
  const timelineSizing = useMemo(
    () => getTimelineResponsiveSizing(isCompactLayout, isPhoneLayout),
    [isCompactLayout, isPhoneLayout]
  );
  const cashflowReferenceLines = useMemo(
    () => [
      ...cashShortfalls.map((point) => ({
        label: isPhoneLayout
          ? undefined
          : point.shortfall > 0
            ? `Short ${money(point.shortfall)}`
            : "Cash zero",
        opacity: 0.52,
        stroke: "oklch(0.62 0.22 25)",
        strokeDasharray: "2 3",
        x: point.day,
      })),
      ...(probeValue === null
        ? []
        : [
            {
              label: `Day ${Math.round(probeValue)}`,
              opacity: 0.78,
              stroke: "oklch(0.62 0.22 25)",
              strokeDasharray: "4 3",
              x: probeValue,
            },
          ]),
    ],
    [cashShortfalls, isPhoneLayout, probeValue]
  );
  const drawAvailabilityReferenceLines = useMemo(
    () =>
      probeValue === null
        ? []
        : [
            {
              label: `Delta ${money(
                probeDrawAvailability?.additionalAvailableDraw ?? 0
              )}`,
              opacity: 0.82,
              stroke: "oklch(0.6 0.18 240)",
              strokeDasharray: "4 3",
              x: probeValue,
            },
          ],
    [probeDrawAvailability, probeValue]
  );
  const markers = useMemo<TimelineMarker[]>(
    () => [
      {
        id: "today",
        label: "Today",
        sublabel: "Site visit",
        tone: "today",
        x: 86,
      },
      ...draws.map((draw) => ({
        id: `draw-${draw.id}`,
        label: draw.label,
        sublabel: `${money(draw.amount)} · ${formatTimelineDay(draw.x)}`,
        tone: "accent" as const,
        x: draw.x,
      })),
      {
        id: "policy-limit",
        label: "Policy checkpoint",
        sublabel: "Lender limit",
        tone: "warning",
        x: 154,
      },
      {
        id: "closeout",
        label: "Closeout",
        sublabel: `${Math.round(range.max)} days`,
        tone: "neutral",
        x: range.max,
      },
    ],
    [draws, range.max]
  );

  const openDrawEditor = (draw: DemoDraw) => {
    setActiveDrawId(draw.id);
    setDrawEditDraft({
      amount: String(draw.amount),
      x: String(Math.round(draw.x)),
    });
  };

  const addManualDraw = (requestedX: number) => {
    drawInsertionCount.current += 1;
    const count = drawInsertionCount.current;

    setActiveDrawId(null);
    setDraws((currentDraws) =>
      [
        ...currentDraws,
        {
          amount: 100_000,
          customDate: true,
          id: `manual-draw-${Date.now()}-${count}`,
          label: `Draw ${currentDraws.length + 1}`,
          x: requestedX,
        },
      ].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))
    );
  };

  const deleteDraw = (drawId: string) => {
    setActiveDrawId(null);
    setDraws((currentDraws) =>
      currentDraws.filter((draw) => draw.id !== drawId)
    );
  };

  const deleteMilestone = (itemId: string) => {
    const targetItem = items.find((item) => item.id === itemId);

    if (!targetItem) {
      return;
    }

    const nextItems = items.filter((item) => item.id !== targetItem.id);
    setItems(nextItems);
    setDraws((currentDraws) =>
      currentDraws.filter((draw) => draw.itemId !== targetItem.id)
    );

    if (activeItemId === targetItem.id) {
      const replacementItem =
        nextItems.find((item) => item.x >= targetItem.x) ??
        nextItems.at(-1) ??
        null;
      setActiveItemId(replacementItem?.id ?? "");
      setProgressValue(replacementItem?.x ?? resolvedRange.min);
    }
  };

  const applyDrawEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeDrawId) {
      return;
    }

    const activeDraw = draws.find((draw) => draw.id === activeDrawId);
    if (!activeDraw) {
      return;
    }

    const nextAmount = Math.max(0, Math.round(Number(drawEditDraft.amount)));
    const nextX = Math.max(
      resolvedRange.min,
      Math.round(Number(drawEditDraft.x))
    );

    if (!(Number.isFinite(nextAmount) && Number.isFinite(nextX))) {
      return;
    }

    setDraws((currentDraws) =>
      currentDraws.map((draw) =>
        draw.id === activeDrawId
          ? {
              ...draw,
              amount: nextAmount,
              customDate: true,
              x: nextX,
            }
          : draw
      )
    );
    if (nextX > resolvedRange.max) {
      setRange((currentRange) => ({
        ...currentRange,
        max: nextX,
      }));
    }
    setActiveDrawId(null);
  };

  return (
    <main className="min-h-svh overflow-x-clip bg-[radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_34%),linear-gradient(180deg,var(--background),var(--bg-base))] px-3 py-5 sm:px-6 sm:py-8 lg:px-8">
      <motion.div
        animate="show"
        className="mx-auto flex max-w-7xl flex-col gap-6"
        initial={prefersReducedMotion ? false : "hidden"}
        variants={{
          hidden: {},
          show: {
            transition: {
              delayChildren: 0.04,
              staggerChildren: 0.08,
            },
          },
        }}
      >
        <motion.section
          className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
          variants={routeSectionVariants}
        >
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2">
              <Badge variant="outline">DrawFlow Roadmap</Badge>
              <Badge variant="success">Capital schedule</Badge>
              <ShareStatusBadges
                loading={sharedSnapshotLoading}
                missing={sharedSnapshotMissing}
                share={share}
              />
            </div>
            <h1 className="text-balance font-semibold text-3xl text-foreground tracking-normal sm:text-4xl">
              Elm Street build draw roadmap
            </h1>
            <p className="mt-3 max-w-2xl text-muted-foreground text-sm leading-6">
              Seven reimbursement milestones staged against lender policy,
              evidence review, and borrower working-capital exposure.
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <ShareTimelineMenu {...shareMenuProps} />
            <Button onClick={resetTimeline} size="sm" variant="outline">
              <RotateCcw />
              Reset
            </Button>
            <div className="flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm shadow-xs">
              <Switch
                checked={straightLine}
                onCheckedChange={setStraightLine}
              />
              Straight line
            </div>
          </div>
        </motion.section>

        <motion.section
          className="min-w-0 rounded-lg border border-border bg-background/92 p-3 shadow-sm backdrop-blur sm:p-4"
          data-testid="timeline-cashflow-chart"
          variants={routeSectionVariants}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">Controlled graph</Badge>
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span
                  className="font-medium text-muted-foreground text-xs"
                  data-testid="timeline-cashflow-series-milestone-cost"
                >
                  Milestone cost
                </span>
                <span className="ml-2 h-2 w-2 rounded-full bg-amber-500" />
                <span
                  className="font-medium text-muted-foreground text-xs"
                  data-testid="timeline-cashflow-series-cash-on-hand"
                >
                  Cash on hand
                </span>
              </div>
              <h2 className="font-semibold text-xl">
                Cash requirement vs draw recovery
              </h2>
              <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
                Costs pull borrower cash down at milestone completion; draw
                releases replenish it after lender review.
              </p>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:w-auto lg:min-w-80">
              <div className="min-w-0 rounded-md border border-border bg-muted/30 px-2.5 py-2 sm:px-3">
                <p className="font-medium text-[10px] text-muted-foreground uppercase">
                  Probe
                </p>
                <p
                  className="mt-1 font-semibold text-foreground"
                  data-testid="timeline-cashflow-probe-day"
                >
                  {probeValue === null
                    ? "Hover chart"
                    : `Day ${Math.round(probeValue)}`}
                </p>
              </div>
              <div className="min-w-0 rounded-md border border-border bg-muted/30 px-2.5 py-2 sm:px-3">
                <p className="font-medium text-[10px] text-muted-foreground uppercase">
                  Cash
                </p>
                <p className="mt-1 font-semibold text-foreground tabular-nums">
                  {probeCashOnHand === null ? "-" : money(probeCashOnHand)}
                </p>
              </div>
              <div className="min-w-0 rounded-md border border-border bg-muted/30 px-2.5 py-2 sm:px-3">
                <p className="font-medium text-[10px] text-muted-foreground uppercase">
                  Ending cash
                </p>
                <p
                  className="mt-1 font-semibold text-foreground tabular-nums"
                  data-testid="timeline-cashflow-ending-cash"
                >
                  {money(endingCashOnHand)}
                </p>
              </div>
              <div
                className={cn(
                  "min-w-0 rounded-md border px-2.5 py-2 sm:px-3",
                  cashShortfalls.length > 0
                    ? "border-rose-500/30 bg-rose-500/10"
                    : "border-border bg-muted/30"
                )}
                data-testid="timeline-cashflow-risk-summary"
              >
                <p className="font-medium text-[10px] text-muted-foreground uppercase">
                  Cash risk
                </p>
                <p className="mt-1 font-semibold text-foreground tabular-nums">
                  {cashShortfalls.length > 0
                    ? `${cashShortfalls.length} flagged`
                    : "Clear"}
                </p>
              </div>
            </div>
          </div>
          {cashShortfalls.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {cashShortfalls.slice(0, 4).map((point) => (
                <div
                  className="inline-flex max-w-full items-center gap-2 rounded-md border border-rose-500/25 bg-rose-500/10 px-2.5 py-1.5 text-rose-700 text-xs dark:text-rose-100"
                  data-testid="timeline-cash-shortfall-point"
                  key={`${point.day}-${point.milestone}`}
                >
                  <AlertTriangle className="size-3.5" />
                  <span className="font-medium">
                    {formatTimelineDay(point.day)}
                  </span>
                  <span className="min-w-0 truncate text-muted-foreground">
                    {formatCashShortfallMessage(point)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <EvilComposedChart
            activeDotVariant="default"
            areaConfig={{ cashOnHand: cashflowChartConfig.cashOnHand }}
            areaCurveType="stepAfter"
            areaOpacity={0.16}
            areaVariant="gradient"
            barConfig={{ budget: cashflowChartConfig.budget }}
            barRadius={6}
            barSize={timelineSizing.barSize}
            barVariant="duotone"
            chartProps={{
              margin: { bottom: 0, left: 0, right: 12, top: 18 },
              onMouseLeave: () => setProbeValue(null),
              onMouseMove: (state) => {
                const nextValue = getChartProbeValue(state);

                if (nextValue !== null) {
                  setProbeValue(nextValue);
                }
              },
            }}
            className="mt-3 h-[220px] min-w-0 sm:h-[230px]"
            curveType="stepAfter"
            data={cashflowData}
            dotVariant="default"
            hideLegend
            lineConfig={{ cashOnHand: cashflowChartConfig.cashOnHand }}
            referenceLines={cashflowReferenceLines}
            strokeVariant="solid"
            tooltipRoundness="xl"
            tooltipVariant="frosted-glass"
            xAxisProps={{
              domain: [resolvedRange.min, resolvedRange.max],
              height: 26,
              tickFormatter: formatTimelineDay,
              ticks: cashflowTicks,
              type: "number",
            }}
            xDataKey="day"
            yAxisProps={{
              domain: [cashflowExtent.min, cashflowExtent.max],
              tickFormatter: formatCompactMoney,
              width: timelineSizing.yAxisWidth,
            }}
            yDataKey="budget"
          />
        </motion.section>

        <motion.section
          animate={{
            gridTemplateColumns: isCompactLayout
              ? "minmax(0, 1fr)"
              : selectedPanelOpen
                ? "minmax(0, 1fr) 280px"
                : "minmax(0, 1fr) 0px",
          }}
          className="grid min-w-0 gap-y-4"
          data-testid="timeline-roadmap-grid"
          style={{
            columnGap: isCompactLayout || !selectedPanelOpen ? 0 : 16,
            rowGap: 16,
          }}
          transition={{
            duration: 0.26,
            ease: [0.22, 1, 0.36, 1],
          }}
          variants={routeSectionVariants}
        >
          <AnimatedCurvedTimeline<DemoMilestone>
            activeItemId={activeItemId}
            cardWidth={timelineSizing.cardWidth}
            className="min-w-0"
            endCardWidth={timelineSizing.endCardWidth}
            formatValue={(value) => `Day ${Math.round(value)}`}
            hoverValue={probeValue}
            insertion={{
              actions: [
                {
                  icon: <CircleDollarSign className="size-4 text-rose-500" />,
                  id: "add-draw",
                  label: "Add draw",
                  onSelect: ({ requestedX }) => addManualDraw(requestedX),
                },
              ],
              createItem: (requestedX) => {
                insertionCount.current += 1;
                const count = insertionCount.current;
                const lane = count % 3 === 0 ? 1 : count % 2 === 0 ? -1 : 0;

                return {
                  data: {
                    amount: 95_000 + count * 12_500,
                    draw: `Inserted ${count}`,
                    evidence: "Draft package",
                    icon: "change",
                    name: `Field change ${count}`,
                    policy: "Needs sequencing",
                    status: "ready",
                  },
                  eyebrow: "Inserted milestone",
                  id: `inserted-${Date.now()}-${count}`,
                  label: `Field change ${count}`,
                  lane,
                  markerLabel: "+",
                  tone: "warning",
                  x: requestedX,
                };
              },
              label: "Add milestone",
              minGap: 14,
              step: 1,
            }}
            items={items}
            markers={markers}
            minNodeSpacingPx={timelineSizing.minNodeSpacingPx}
            onActiveItemChange={(item) => setActiveItemId(item.id)}
            onHoverValueChange={setProbeValue}
            onItemsChange={(nextItems, details) => {
              setItems(nextItems);
              setDraws((currentDraws) =>
                syncDemoDrawsWithItems(currentDraws, nextItems, details.range)
              );
            }}
            onProgressValueChange={(value) => setProgressValue(value)}
            onRangeChange={(nextRange) => setRange(nextRange)}
            pixelsPerUnit={timelineSizing.pixelsPerUnit}
            progressValue={progressValue}
            range={range}
            renderCard={(item, context) => (
              <TimelineDeleteContextMenu
                kind="milestone"
                onDelete={() => deleteMilestone(item.id)}
              >
                <MilestoneCard
                  active={context.active}
                  complete={context.complete}
                  item={item}
                  reducedMotion={Boolean(prefersReducedMotion)}
                />
              </TimelineDeleteContextMenu>
            )}
            renderEndCard={() => (
              <FinancialOverviewCard overview={financialOverview} />
            )}
            renderMarker={(marker) => {
              const drawId = marker.id.startsWith("draw-")
                ? marker.id.slice("draw-".length)
                : null;
              const draw = drawId
                ? draws.find((candidate) => candidate.id === drawId)
                : null;

              if (!draw) {
                return <TimelineMarkerBadge marker={marker} />;
              }

              return (
                <TimelineDeleteContextMenu
                  kind="draw"
                  onDelete={() => deleteDraw(draw.id)}
                >
                  <DrawTimelineMarker
                    active={draw.id === activeDrawId}
                    draft={drawEditDraft}
                    draw={draw}
                    onApply={applyDrawEdit}
                    onCancel={() => setActiveDrawId(null)}
                    onDraftChange={setDrawEditDraft}
                    onOpen={() => openDrawEditor(draw)}
                    reducedMotion={Boolean(prefersReducedMotion)}
                  />
                </TimelineDeleteContextMenu>
              );
            }}
            renderNode={(item, context) => (
              <TimelineDeleteContextMenu
                kind="milestone"
                onDelete={() => deleteMilestone(item.id)}
              >
                <TimelineNodeButton
                  active={context.active}
                  complete={context.complete}
                  item={item}
                  onClick={() => {
                    context.activate();
                    setSelectedPanelOpen(true);
                  }}
                  onDoubleClick={() => setSelectedPanelOpen(false)}
                  reducedMotion={Boolean(prefersReducedMotion)}
                />
              </TimelineDeleteContextMenu>
            )}
            straightLine={straightLine}
          />

          <AnimatePresence initial={false} mode="popLayout">
            {selectedPanelOpen ? (
              <motion.aside
                animate={{
                  filter: "blur(0px)",
                  opacity: 1,
                  scale: 1,
                  width: isCompactLayout ? "100%" : 280,
                  x: 0,
                  y: 0,
                }}
                className="min-w-0 overflow-hidden rounded-lg border border-border bg-background/92 p-3 shadow-sm backdrop-blur sm:p-4"
                data-testid="selected-draw-panel"
                exit={{
                  filter: "blur(4px)",
                  opacity: 0,
                  scale: 0.96,
                  width: isCompactLayout ? "100%" : 0,
                  x: isCompactLayout ? 0 : 24,
                  y: isCompactLayout ? -12 : 0,
                }}
                initial={{
                  filter: "blur(4px)",
                  opacity: 0,
                  scale: 0.96,
                  width: isCompactLayout ? "100%" : 0,
                  x: isCompactLayout ? 0 : 24,
                  y: isCompactLayout ? -12 : 0,
                }}
                transition={{
                  duration: 0.24,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <div className="w-full lg:w-[248px]">
                  <div className="flex items-start gap-3">
                    <div className="-mt-4 -mr-4 grid size-24 shrink-0 place-items-center">
                      <IsometricMilestoneIcon
                        className="size-24"
                        type={activeItem?.data?.icon ?? "roughIn"}
                      />
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground text-xs uppercase">
                        Selected draw
                      </p>
                      <h2 className="mt-1 font-semibold text-lg">
                        {activeItem?.data?.draw}
                      </h2>
                    </div>
                  </div>
                  <dl className="mt-5 grid gap-3 text-sm">
                    <div className="flex items-center justify-between gap-3 border-border border-t pt-3">
                      <dt className="text-muted-foreground">Milestone</dt>
                      <dd className="text-right font-medium">
                        {activeItem?.data?.name}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-border border-t pt-3">
                      <dt className="text-muted-foreground">Axis position</dt>
                      <dd className="font-medium">
                        Day {Math.round(activeItem?.x ?? 0)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-border border-t pt-3">
                      <dt className="text-muted-foreground">Milestone cost</dt>
                      <dd className="font-medium">
                        {money(activeItem?.data?.amount ?? 0)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-border border-t pt-3">
                      <dt className="text-muted-foreground">Evidence</dt>
                      <dd className="font-medium">
                        {activeItem?.data?.evidence}
                      </dd>
                    </div>
                  </dl>
                </div>
              </motion.aside>
            ) : null}
          </AnimatePresence>
        </motion.section>

        <motion.section
          className="min-w-0 rounded-lg border border-border bg-background/92 p-3 shadow-sm backdrop-blur sm:p-4"
          data-testid="timeline-draw-availability-chart"
          variants={routeSectionVariants}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">Draw availability</Badge>
                <span className="h-2 w-2 rounded-full bg-violet-500" />
                <span
                  className="font-medium text-muted-foreground text-xs"
                  data-testid="timeline-draw-series-interest-bearing"
                >
                  Interest-bearing draw
                </span>
                <span className="ml-2 h-2 w-2 rounded-full bg-sky-500" />
                <span
                  className="font-medium text-muted-foreground text-xs"
                  data-testid="timeline-draw-series-additional-available"
                >
                  Additional available draw
                </span>
              </div>
              <h2 className="font-semibold text-xl">Draw capacity envelope</h2>
              <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
                Completed milestones unlock draw capacity; released draws become
                interest-bearing principal.
              </p>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:w-auto lg:min-w-80">
              <div className="min-w-0 rounded-md border border-border bg-muted/30 px-2.5 py-2 sm:px-3">
                <p className="font-medium text-[10px] text-muted-foreground uppercase">
                  Top line
                </p>
                <p
                  className="mt-1 font-semibold text-foreground tabular-nums"
                  data-testid="timeline-draw-total-available"
                >
                  {money(endingAvailability.totalAvailableDraw)}
                </p>
              </div>
              <div className="min-w-0 rounded-md border border-border bg-muted/30 px-2.5 py-2 sm:px-3">
                <p className="font-medium text-[10px] text-muted-foreground uppercase">
                  Interest-bearing
                </p>
                <p
                  className="mt-1 font-semibold text-foreground tabular-nums"
                  data-testid="timeline-draw-interest-bearing"
                >
                  {money(endingAvailability.interestBearingDraw)}
                </p>
              </div>
              <div className="min-w-0 rounded-md border border-border bg-muted/30 px-2.5 py-2 sm:px-3">
                <p className="font-medium text-[10px] text-muted-foreground uppercase">
                  Additional
                </p>
                <p
                  className="mt-1 font-semibold text-foreground tabular-nums"
                  data-testid="timeline-draw-additional-available"
                >
                  {money(endingAvailability.additionalAvailableDraw)}
                </p>
              </div>
              <div className="min-w-0 rounded-md border border-sky-500/25 bg-sky-500/10 px-2.5 py-2 sm:px-3">
                <p className="font-medium text-[10px] text-muted-foreground uppercase">
                  Probe delta
                </p>
                <p
                  className="mt-1 font-semibold text-foreground tabular-nums"
                  data-testid="timeline-draw-probe-delta"
                >
                  {probeDrawAvailability === null
                    ? "Hover"
                    : money(probeDrawAvailability.additionalAvailableDraw)}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-md border border-sky-500/20 bg-sky-500/10 px-3 py-2">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-2 font-medium text-sky-700 dark:text-sky-100">
                <span className="size-2 rounded-full bg-sky-500" />
                Delta between lines
              </span>
              <span
                className="font-semibold text-foreground tabular-nums"
                data-testid="timeline-draw-delta-readout"
              >
                {probeDrawAvailability === null
                  ? "Hover the chart or roadmap"
                  : `${formatTimelineDay(probeDrawAvailability.day)}: ${money(
                      probeDrawAvailability.additionalAvailableDraw
                    )} available for draw`}
              </span>
            </div>
          </div>
          <EvilComposedChart
            activeDotVariant="default"
            areaConfig={{
              interestBearingDraw: cashflowChartConfig.interestBearingDraw,
              additionalAvailableDraw:
                cashflowChartConfig.additionalAvailableDraw,
            }}
            areaCurveType="stepAfter"
            areaOpacity={0.18}
            areaStacked
            areaVariant="gradient"
            barConfig={{}}
            chartProps={{
              margin: { bottom: 0, left: 0, right: 12, top: 18 },
              onMouseLeave: () => setProbeValue(null),
              onMouseMove: (state) => {
                const nextValue = getChartProbeValue(state);

                if (nextValue !== null) {
                  setProbeValue(nextValue);
                }
              },
            }}
            className="mt-3 h-[220px] min-w-0 sm:h-[210px]"
            curveType="stepAfter"
            data={drawAvailabilityData}
            dotVariant="default"
            hideLegend
            lineConfig={{
              interestBearingDraw: cashflowChartConfig.interestBearingDraw,
              totalAvailableDraw: cashflowChartConfig.totalAvailableDraw,
            }}
            referenceLines={drawAvailabilityReferenceLines}
            strokeVariant="solid"
            tooltipRoundness="xl"
            tooltipVariant="frosted-glass"
            xAxisProps={{
              domain: [resolvedRange.min, resolvedRange.max],
              height: 26,
              tickFormatter: formatTimelineDay,
              ticks: cashflowTicks,
              type: "number",
            }}
            xDataKey="day"
            yAxisProps={{
              domain: [0, drawAvailabilityExtent.max],
              tickFormatter: formatCompactMoney,
              width: timelineSizing.yAxisWidth,
            }}
            yDataKey="totalAvailableDraw"
          />
        </motion.section>
      </motion.div>
    </main>
  );
}

interface CounterRef {
  current: number;
}

interface UseTimelineSnapshotSharingArgs {
  activeItemId: string;
  drawInsertionCount: CounterRef;
  draws: DemoDraw[];
  insertionCount: CounterRef;
  items: TimelineItem<DemoMilestone>[];
  progressValue: number;
  resolvedRange: Required<TimelineRange>;
  selectedPanelOpen: boolean;
  setActiveDrawId: (value: string | null) => void;
  setActiveItemId: (value: string) => void;
  setDrawEditDraft: (value: DrawEditDraft) => void;
  setDraws: (value: DemoDraw[]) => void;
  setItems: (value: TimelineItem<DemoMilestone>[]) => void;
  setProbeValue: (value: number | null) => void;
  setProgressValue: (value: number) => void;
  setRange: (value: TimelineRange) => void;
  setSelectedPanelOpen: (value: boolean) => void;
  setStraightLine: (value: boolean) => void;
  straightLine: boolean;
}

interface ShareTimelineMenuProps {
  copied: boolean;
  error: string | null;
  loading: boolean;
  onCopy: () => void;
  onCreate: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  shareUrl: string;
}

function ShareStatusBadges({
  loading,
  missing,
  share,
}: {
  loading: boolean;
  missing: boolean;
  share: string | null;
}) {
  if (loading) {
    return <Badge variant="outline">Loading shared snapshot</Badge>;
  }

  if (missing) {
    return <Badge variant="destructive">Share not found</Badge>;
  }

  if (share) {
    return <Badge variant="outline">Shared fork</Badge>;
  }

  return null;
}

function useTimelineSnapshotSharing({
  activeItemId,
  drawInsertionCount,
  draws,
  insertionCount,
  items,
  progressValue,
  resolvedRange,
  selectedPanelOpen,
  setActiveDrawId,
  setActiveItemId,
  setDrawEditDraft,
  setDraws,
  setItems,
  setProbeValue,
  setProgressValue,
  setRange,
  setSelectedPanelOpen,
  setStraightLine,
  straightLine,
}: UseTimelineSnapshotSharingArgs) {
  const [{ share }, setTimelineSearch] = useQueryStates(timelineSearchParsers);
  const createTimelineSnapshot = useMutation(
    api.demo_timeline_snapshots.demo_createTimelineSnapshot
  );
  const sharedSnapshot = useQuery(
    api.demo_timeline_snapshots.demo_getTimelineSnapshot,
    share ? { snapshotId: share } : "skip"
  );
  const hydratedShareId = useRef<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareCreating, setShareCreating] = useState(false);
  const initialShareState = useMemo(
    () =>
      initialTimelineShareState(
        INITIAL_ITEMS,
        buildDemoDraws(INITIAL_ITEMS, INITIAL_RANGE),
        INITIAL_RANGE,
        "rough-in",
        92,
        true,
        false
      ),
    []
  );

  const applyShareState = useCallback(
    (nextState: TimelineShareState) => {
      setItems(nextState.items);
      setDraws(nextState.draws);
      setRange(nextState.range);
      setActiveItemId(nextState.activeItemId);
      setProgressValue(nextState.progressValue);
      setProbeValue(null);
      setActiveDrawId(null);
      setDrawEditDraft({ amount: "", x: "" });
      setSelectedPanelOpen(nextState.selectedPanelOpen);
      setStraightLine(nextState.straightLine);
      insertionCount.current = countInsertedTimelineItems(nextState.items);
      drawInsertionCount.current = countManualDraws(nextState.draws);
    },
    [
      drawInsertionCount,
      insertionCount,
      setActiveDrawId,
      setActiveItemId,
      setDrawEditDraft,
      setDraws,
      setItems,
      setProbeValue,
      setProgressValue,
      setRange,
      setSelectedPanelOpen,
      setStraightLine,
    ]
  );

  useEffect(() => {
    if (!share) {
      hydratedShareId.current = null;
      return;
    }

    setShareUrl(buildTimelineShareUrl(share));
  }, [share]);

  useEffect(() => {
    if (!(share && sharedSnapshot && hydratedShareId.current !== share)) {
      return;
    }

    applyShareState(
      applyTimelineShareSnapshotV1(
        sharedSnapshot as TimelineShareSnapshotV1,
        initialShareState
      )
    );
    hydratedShareId.current = share;
  }, [applyShareState, initialShareState, share, sharedSnapshot]);

  const resetTimeline = useCallback(() => {
    const nextState =
      share && sharedSnapshot
        ? applyTimelineShareSnapshotV1(
            sharedSnapshot as TimelineShareSnapshotV1,
            initialShareState
          )
        : initialShareState;

    applyShareState(nextState);
  }, [applyShareState, initialShareState, share, sharedSnapshot]);

  const createShareSnapshot = useCallback(async () => {
    setShareOpen(true);
    setShareCreating(true);
    setShareCopied(false);
    setShareError(null);

    try {
      const snapshot = buildTimelineShareSnapshotV1({
        activeItemId,
        draws,
        items,
        progressValue,
        range: resolvedRange,
        selectedPanelOpen,
        straightLine,
      });
      const snapshotId = await createTimelineSnapshot({ snapshot });
      const nextShareUrl = buildTimelineShareUrl(snapshotId);

      await setTimelineSearch({ share: snapshotId });
      setShareUrl(nextShareUrl);
    } catch (error) {
      setShareError(
        error instanceof Error
          ? error.message
          : "Unable to create a share link."
      );
    } finally {
      setShareCreating(false);
    }
  }, [
    activeItemId,
    createTimelineSnapshot,
    draws,
    items,
    progressValue,
    resolvedRange,
    selectedPanelOpen,
    setTimelineSearch,
    straightLine,
  ]);

  const copyShareUrl = useCallback(async () => {
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
    } catch (error) {
      setShareError(
        error instanceof Error ? error.message : "Unable to copy the link."
      );
    }
  }, [shareUrl]);

  return {
    resetTimeline,
    share,
    sharedSnapshotLoading: Boolean(share && sharedSnapshot === undefined),
    sharedSnapshotMissing: Boolean(share && sharedSnapshot === null),
    shareMenuProps: {
      copied: shareCopied,
      error: shareError,
      loading: shareCreating,
      onCopy: copyShareUrl,
      onCreate: createShareSnapshot,
      onOpenChange: setShareOpen,
      open: shareOpen,
      shareUrl,
    } satisfies ShareTimelineMenuProps,
  };
}

function buildDemoDraws(
  items: TimelineItem<DemoMilestone>[],
  range: TimelineRange
): DemoDraw[] {
  const resolvedRange = normalizeDemoRange(range);

  return items
    .filter((item) => item.data)
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))
    .map((item) => createDemoDraw(item, resolvedRange));
}

function syncDemoDrawsWithItems(
  draws: DemoDraw[],
  items: TimelineItem<DemoMilestone>[],
  range: TimelineRange
): DemoDraw[] {
  const resolvedRange = normalizeDemoRange(range);
  const itemDraws = items
    .filter((item) => item.data)
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))
    .map((item) => {
      const existingDraw = draws.find((draw) => draw.itemId === item.id);
      const nextDraw = createDemoDraw(item, resolvedRange);

      return existingDraw
        ? {
            ...nextDraw,
            amount: existingDraw.amount,
            customDate: existingDraw.customDate,
            x: existingDraw.customDate ? existingDraw.x : nextDraw.x,
          }
        : nextDraw;
    });
  const manualDraws = draws.filter((draw) => !draw.itemId);

  return [...itemDraws, ...manualDraws].sort(
    (a, b) => a.x - b.x || a.id.localeCompare(b.id)
  );
}

function createDemoDraw(
  item: TimelineItem<DemoMilestone>,
  range: Required<TimelineRange>
): DemoDraw {
  const milestone = item.data;
  const drawX = clampNumber(
    item.x + DRAW_REVIEW_LAG_DAYS,
    range.min,
    range.max
  );

  return {
    amount: milestone?.amount ?? 0,
    id: `${item.id}-draw`,
    itemId: item.id,
    label: milestone?.draw ?? item.label ?? "Draw",
    x: drawX,
  };
}

function formatTimelineDay(value: number) {
  return `Day ${Math.round(value)}`;
}

function getDrawDomId(draw: DemoDraw) {
  return draw.itemId ?? draw.id;
}

function buildTimelineCashflowData(
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
  range: Required<TimelineRange>
): CashflowDatum[] {
  const events = [
    ...items
      .filter((item) => item.data)
      .map((item) => ({
        amount: item.data?.amount ?? 0,
        day: clampNumber(item.x, range.min, range.max),
        id: `${item.id}-milestone`,
        label: item.data?.name ?? item.label ?? "Milestone",
        sortOrder: 0,
        type: "milestone" as const,
      })),
    ...draws.map((draw) => ({
      amount: draw.amount,
      day: clampNumber(draw.x, range.min, range.max),
      id: draw.id,
      label: draw.label,
      sortOrder: 1,
      type: "draw" as const,
    })),
  ].sort(
    (a, b) =>
      a.day - b.day || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
  );
  const data: CashflowDatum[] = [
    {
      budget: 0,
      cashOnHand: STARTING_CASH,
      day: range.min,
      drawAmount: 0,
      event: "start",
      id: "start",
      name: "Starting cash",
    },
  ];
  let cashOnHand = STARTING_CASH;

  for (const event of events) {
    if (event.type === "milestone") {
      cashOnHand -= event.amount;
      data.push({
        budget: event.amount,
        cashOnHand,
        day: event.day,
        drawAmount: 0,
        event: "milestone",
        id: event.id,
        name: event.label,
      });
      continue;
    }

    cashOnHand += event.amount;
    data.push({
      budget: 0,
      cashOnHand,
      day: event.day,
      drawAmount: event.amount,
      event: "draw",
      id: event.id,
      name: event.label,
    });
  }

  return data;
}

function buildDrawAvailabilityData(
  cashflowData: CashflowDatum[]
): DrawAvailabilityDatum[] {
  let unlockedDraw = 0;
  let releasedDraw = 0;

  return cashflowData.map((point) => {
    unlockedDraw += point.budget;
    releasedDraw += point.drawAmount;

    const interestBearingDraw = releasedDraw;
    const additionalAvailableDraw = Math.max(0, unlockedDraw - releasedDraw);

    return {
      additionalAvailableDraw,
      day: point.day,
      interestBearingDraw,
      name: point.name,
      totalAvailableDraw: interestBearingDraw + additionalAvailableDraw,
    };
  });
}

export function buildCashShortfallPoints(
  cashflowData: CashflowDatum[]
): CashShortfallPoint[] {
  return cashflowData.flatMap((point) => {
    if (point.event !== "milestone" || point.budget <= 0) {
      return [];
    }

    const cashBeforeMilestone = point.cashOnHand + point.budget;
    const cashAfterMilestone = point.cashOnHand;

    if (cashAfterMilestone > MINIMUM_POST_MILESTONE_CASH_RESERVE) {
      return [];
    }

    return [
      {
        cashBeforeMilestone,
        cashOnHand: point.cashOnHand,
        day: point.day,
        milestone: point.name,
        milestoneCost: point.budget,
        shortfall: Math.max(
          0,
          MINIMUM_POST_MILESTONE_CASH_RESERVE - cashAfterMilestone
        ),
      },
    ];
  });
}

function formatCashShortfallMessage(point: CashShortfallPoint): string {
  if (point.shortfall > 0) {
    return `needs ${money(point.shortfall)} before ${point.milestone}`;
  }

  return `leaves ${money(point.cashOnHand)} after ${point.milestone}`;
}

function buildFinancialOverview(
  cashflowData: CashflowDatum[],
  draws: DemoDraw[],
  range: Required<TimelineRange>
): FinancialOverview {
  const drawEvents = cashflowData
    .filter((point) => point.event === "draw")
    .sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
  let principal = 0;
  let previousDay = range.min;
  let interestPaid = 0;

  for (const event of drawEvents) {
    const day = clampNumber(event.day, range.min, range.max);
    interestPaid += principal * INTEREST_APR * ((day - previousDay) / 365);
    principal += event.drawAmount;
    previousDay = day;
  }

  interestPaid += principal * INTEREST_APR * ((range.max - previousDay) / 365);

  return {
    drawCount: draws.length,
    drawFeesPaid: draws.length * DRAW_FEE,
    interestPaid,
    totalDrawReleased: drawEvents.reduce(
      (total, event) => total + event.drawAmount,
      0
    ),
  };
}

function normalizeDemoRange(range: TimelineRange): Required<TimelineRange> {
  const min = Number.isFinite(range.min) ? range.min : 0;
  const max =
    Number.isFinite(range.max) && range.max > min ? range.max : min + 1;

  return {
    max,
    min,
    unit: range.unit ?? "",
  };
}

function getCashflowTicks(range: Required<TimelineRange>): number[] {
  const tickCount = 6;

  return Array.from({ length: tickCount }, (_, index) => {
    const ratio = tickCount === 1 ? 0 : index / (tickCount - 1);

    return Math.round(range.min + (range.max - range.min) * ratio);
  });
}

function getCashflowChartExtent(data: CashflowDatum[]) {
  const values = data.flatMap((item) => [item.cashOnHand, item.budget]);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const padding = (max - min) * 0.12;

  return {
    max: max + padding,
    min: min < 0 ? min - padding : 0,
  };
}

function getDrawAvailabilityChartExtent(data: DrawAvailabilityDatum[]) {
  const max = Math.max(
    1,
    ...data.flatMap((item) => [
      item.additionalAvailableDraw,
      item.interestBearingDraw,
      item.totalAvailableDraw,
    ])
  );

  return {
    max: max * 1.12,
  };
}

function interpolateCashOnHand(data: CashflowDatum[], value: number): number {
  if (data.length === 0) {
    return STARTING_CASH;
  }

  let cashOnHand = data[0]?.cashOnHand ?? STARTING_CASH;

  for (const point of data) {
    if (point.day > value) {
      break;
    }

    cashOnHand = point.cashOnHand;
  }

  return cashOnHand;
}

function interpolateDrawAvailability(
  data: DrawAvailabilityDatum[],
  value: number
): DrawAvailabilityDatum {
  const fallback = {
    additionalAvailableDraw: 0,
    day: value,
    interestBearingDraw: 0,
    name: "No draw capacity",
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
  };
}

function getChartProbeValue(state: unknown): number | null {
  if (!isRecord(state)) {
    return null;
  }

  const payloadValue = readChartPayloadValue(state.activePayload);
  if (payloadValue !== null) {
    return payloadValue;
  }

  return toFiniteNumber(state.activeLabel);
}

function readChartPayloadValue(activePayload: unknown): number | null {
  if (!Array.isArray(activePayload)) {
    return null;
  }

  for (const payloadItem of activePayload) {
    if (!(isRecord(payloadItem) && isRecord(payloadItem.payload))) {
      continue;
    }

    const value = toFiniteNumber(payloadItem.payload.day);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number | null {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(numberValue) ? numberValue : null;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatCompactMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    compactDisplay: "short",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: "compact",
    style: "currency",
  }).format(value);
}

function countInsertedTimelineItems(
  items: TimelineItem<DemoMilestone>[]
): number {
  return items.filter((item) => item.id.startsWith("inserted-")).length;
}

function countManualDraws(draws: DemoDraw[]): number {
  return draws.filter((draw) => draw.id.startsWith("manual-draw-")).length;
}

function buildTimelineShareUrl(snapshotId: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  const url = new URL("/demo/timeline", window.location.origin);
  url.searchParams.set("share", snapshotId);

  return url.toString();
}

function ShareTimelineMenu({
  copied,
  error,
  loading,
  onCopy,
  onCreate,
  onOpenChange,
  open,
  shareUrl,
}: {
  copied: boolean;
  error: string | null;
  loading: boolean;
  onCopy: () => void;
  onCreate: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  shareUrl: string;
}) {
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent("Elm Street build draw roadmap");
  const xHref = shareUrl
    ? `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`
    : undefined;
  const mailHref = shareUrl
    ? `mailto:?subject=${encodedTitle}&body=${encodeURIComponent(
        `Review this DrawFlow roadmap snapshot: ${shareUrl}`
      )}`
    : undefined;

  const handleNativeShare = async () => {
    if (!(canNativeShare && shareUrl)) {
      return;
    }

    await navigator.share({
      title: "Elm Street build draw roadmap",
      url: shareUrl,
    });
  };

  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger
        render={
          <Button
            data-testid="timeline-share-button"
            loading={loading}
            onClick={onCreate}
            size="sm"
            variant="default"
          />
        }
      >
        <Share2 />
        Share
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[calc(100vh-1rem)] w-[380px] max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain"
        data-testid="timeline-share-menu"
        sideOffset={10}
      >
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="grid size-28 shrink-0 place-items-center rounded-lg border border-border bg-white p-2 shadow-xs sm:size-36">
            {shareUrl ? (
              <QRCodeSVG
                aria-label="Timeline share QR code"
                data-testid="timeline-share-qr"
                level="M"
                size={96}
                value={shareUrl}
              />
            ) : (
              <QrCode className="size-12 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-medium text-emerald-700 text-xs dark:text-emerald-100">
              <LinkIcon className="size-3.5" />
              Snapshot link
            </div>
            <h2 className="mt-3 font-semibold text-lg leading-tight">
              Share this roadmap setup
            </h2>
            <p className="mt-1 hidden text-muted-foreground text-sm sm:block">
              Generates an editable fork with the same milestones, draws, range,
              selection, and display controls.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <Label htmlFor="timeline-share-link">Share URL</Label>
          <Input
            data-testid="timeline-share-url"
            id="timeline-share-link"
            readOnly
            value={shareUrl}
          />
          {error && (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            disabled={!shareUrl}
            onClick={onCopy}
            size="sm"
            variant="outline"
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button
            disabled={!(shareUrl && canNativeShare)}
            onClick={handleNativeShare}
            size="sm"
            variant="outline"
          >
            <Share2 />
            Native share
          </Button>
          <Button
            disabled={!shareUrl}
            render={
              <a
                data-testid="timeline-share-x"
                href={xHref}
                rel="noreferrer"
                target="_blank"
              >
                Share on X
              </a>
            }
            size="sm"
            variant="outline"
          >
            <ExternalLink />X
          </Button>
          <Button
            disabled={!shareUrl}
            render={
              <a data-testid="timeline-share-email" href={mailHref ?? "#"}>
                Share by email
              </a>
            }
            size="sm"
            variant="outline"
          >
            <Mail />
            Email
          </Button>
        </div>

        <p
          className="mt-4 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-800 text-xs dark:text-amber-100"
          data-testid="timeline-share-disclaimer"
        >
          live collaboration session under construction
        </p>
        {loading && (
          <div className="mt-3 inline-flex items-center gap-2 text-muted-foreground text-xs">
            <Loader2 className="size-3.5 animate-spin" />
            Saving snapshot
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function TimelineMarkerBadge({ marker }: { marker: TimelineMarker }) {
  const toneClass = {
    accent:
      "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100",
    neutral: "border-border bg-background text-foreground dark:bg-zinc-950/80",
    today:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100",
    warning:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
  }[marker.tone ?? "neutral"];

  return (
    <motion.div
      className="flex flex-col items-center"
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ scale: 1.025, y: -1 }}
    >
      <motion.div
        className={cn(
          "rounded-md border px-2.5 py-1 text-center shadow-sm backdrop-blur",
          toneClass
        )}
        layout
      >
        <div className="whitespace-nowrap font-semibold text-xs">
          {marker.label}
        </div>
        {marker.sublabel && (
          <div className="whitespace-nowrap text-[10px] text-muted-foreground">
            {marker.sublabel}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function TimelineDeleteContextMenu({
  children,
  kind,
  onDelete,
}: {
  children: ReactNode;
  kind: "draw" | "milestone";
  onDelete: () => void;
}) {
  const isDraw = kind === "draw";
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="block" />}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        className="max-h-[calc(100vh-1rem)] w-64 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain p-2 shadow-2xl"
        data-testid="timeline-item-context-menu"
        side="right"
        sideOffset={6}
      >
        <div
          className="px-2 pb-2 font-medium text-[10px] text-muted-foreground uppercase"
          role="presentation"
        >
          {isDraw ? "Draw actions" : "Milestone actions"}
        </div>
        <ContextMenuItem
          className="flex min-h-12 items-start gap-3 px-2.5 py-2 text-sm"
          onClick={onDelete}
          variant="destructive"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-destructive/25 bg-destructive/10 text-destructive">
            <Trash2 className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">
              {isDraw ? "Remove draw" : "Remove milestone"}
            </span>
            <span className="mt-0.5 block truncate text-muted-foreground text-xs">
              {isDraw
                ? "Delete this draw marker"
                : "Delete this milestone and its linked draw"}
            </span>
          </span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function DrawTimelineMarker({
  active,
  draw,
  draft,
  onApply,
  onCancel,
  onDraftChange,
  onOpen,
  reducedMotion,
}: {
  active: boolean;
  draw: DemoDraw;
  draft: DrawEditDraft;
  onApply: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onDraftChange: (draft: DrawEditDraft) => void;
  onOpen: () => void;
  reducedMotion: boolean;
}) {
  const dayInputId = `draw-date-${draw.id}`;
  const amountInputId = `draw-amount-${draw.id}`;

  return (
    <div className="relative flex flex-col items-center">
      <motion.button
        aria-expanded={active}
        aria-haspopup="dialog"
        aria-label={`Edit ${draw.label} date and amount`}
        className={cn(
          "group min-w-28 rounded-md border border-rose-200 bg-background/95 px-2.5 py-1.5 text-center text-foreground shadow-sm backdrop-blur transition-colors hover:border-rose-300 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-rose-500/30 dark:bg-zinc-950/90 dark:hover:bg-rose-500/10",
          active &&
            "border-rose-400 bg-rose-50 shadow-rose-500/15 dark:bg-rose-500/10"
        )}
        data-testid={`timeline-draw-marker-${getDrawDomId(draw)}`}
        onClick={onOpen}
        transition={{ damping: 24, stiffness: 430, type: "spring" }}
        type="button"
        whileHover={reducedMotion ? undefined : { scale: 1.035, y: -2 }}
        whileTap={reducedMotion ? undefined : { scale: 0.96, y: 1 }}
      >
        <span className="flex items-center justify-center gap-1 font-semibold text-[10px] text-rose-600 uppercase tracking-normal">
          <CircleDollarSign className="size-3" />
          {draw.label}
        </span>
        <span className="mt-0.5 block whitespace-nowrap font-semibold text-xs tabular-nums">
          {money(draw.amount)}
        </span>
        <span className="mt-0.5 flex items-center justify-center gap-1 whitespace-nowrap text-[10px] text-muted-foreground">
          <CalendarDays className="size-3" />
          {formatTimelineDay(draw.x)}
        </span>
      </motion.button>

      <AnimatePresence initial={false}>
        {active && (
          <motion.form
            animate={{ filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
            aria-label={`Edit ${draw.label}`}
            className="absolute top-full left-1/2 z-40 mt-2 w-64 -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl"
            data-testid={`timeline-draw-editor-${getDrawDomId(draw)}`}
            exit={{ filter: "blur(4px)", opacity: 0, scale: 0.96, y: -8 }}
            initial={{ filter: "blur(6px)", opacity: 0, scale: 0.96, y: -10 }}
            onSubmit={onApply}
            role="dialog"
            transition={{
              duration: reducedMotion ? 0 : 0.2,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <div className="mb-3">
              <p className="font-semibold text-sm">{draw.label}</p>
              <p className="text-muted-foreground text-xs">
                Update release date and reimbursement amount.
              </p>
            </div>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor={dayInputId}>
                  Draw date
                </Label>
                <Input
                  id={dayInputId}
                  min={0}
                  nativeInput
                  onChange={(event) =>
                    onDraftChange({ ...draft, x: event.currentTarget.value })
                  }
                  size="sm"
                  step={1}
                  type="number"
                  value={draft.x}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor={amountInputId}>
                  Draw amount
                </Label>
                <Input
                  id={amountInputId}
                  min={0}
                  nativeInput
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      amount: event.currentTarget.value,
                    })
                  }
                  size="sm"
                  step={1000}
                  type="number"
                  value={draft.amount}
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                onClick={onCancel}
                size="xs"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button size="xs" type="submit">
                Apply
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

function MilestoneCard({
  active,
  complete,
  item,
  reducedMotion,
}: {
  active: boolean;
  complete: boolean;
  item: TimelineItem<DemoMilestone>;
  reducedMotion: boolean;
}) {
  const milestone = item.data;
  if (!milestone) {
    return null;
  }

  const statusTone = complete
    ? "success"
    : active
      ? "info"
      : milestone.status === "ready"
        ? "warning"
        : "outline";

  return (
    <motion.article
      className={cn(
        "min-h-[214px] rounded-lg border bg-card p-3 text-card-foreground shadow-sm transition-colors sm:p-4",
        active && "border-rose-300 shadow-rose-500/10",
        complete && "border-emerald-200 bg-emerald-50/40 dark:bg-emerald-500/5"
      )}
      data-testid={`timeline-card-${item.id}`}
      layout
      transition={{
        duration: reducedMotion ? 0 : 0.22,
        ease: [0.22, 1, 0.36, 1],
        layout: {
          damping: 28,
          stiffness: 360,
          type: "spring",
        },
      }}
      whileHover={reducedMotion ? undefined : { scale: 1.012, y: -3 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-[11px] text-muted-foreground uppercase">
            {item.eyebrow}
          </p>
          <h3 className="mt-1 font-semibold text-sm leading-5">
            {milestone.name}
          </h3>
        </div>
        <div className="-mt-3 -mr-5 grid size-28 shrink-0 place-items-center sm:-mt-4 sm:-mr-6 sm:size-32">
          <IsometricMilestoneIcon
            className="size-28 sm:size-32"
            type={milestone.icon}
          />
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div>
          <p className="text-muted-foreground text-xs">Unlocks</p>
          <p className="mt-1 font-semibold text-xl">
            {money(milestone.amount)}
          </p>
        </div>
        <div className="space-y-2 border-border border-t pt-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Policy</span>
            <span className="text-right font-medium">{milestone.policy}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Evidence</span>
            <span className="text-right font-medium">{milestone.evidence}</span>
          </div>
        </div>
      </div>

      <Badge className="mt-4 w-full" variant={statusTone}>
        {statusLabels[milestone.status]}
      </Badge>
    </motion.article>
  );
}

function FinancialOverviewCard({ overview }: { overview: FinancialOverview }) {
  return (
    <article
      className="min-h-[214px] rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-card-foreground shadow-sm sm:p-4"
      data-testid="timeline-final-financial-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[11px] text-emerald-700 uppercase dark:text-emerald-200">
            Closeout ledger
          </p>
          <h3 className="mt-1 font-semibold text-sm leading-5">
            Live financial overview
          </h3>
        </div>
        <div className="grid size-11 shrink-0 place-items-center rounded-md border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200">
          <Flag className="size-5" />
        </div>
      </div>

      <dl className="mt-5 grid gap-3 text-xs">
        <div className="flex items-center justify-between gap-3 border-emerald-500/20 border-t pt-3">
          <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Banknote className="size-3.5" />
            Released
          </dt>
          <dd
            className="font-semibold tabular-nums"
            data-testid="timeline-final-total-draw"
          >
            {money(overview.totalDrawReleased)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-emerald-500/20 border-t pt-3">
          <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
            <ReceiptText className="size-3.5" />
            Draw fees
          </dt>
          <dd
            className="font-semibold tabular-nums"
            data-testid="timeline-final-draw-fees"
          >
            {money(overview.drawFeesPaid)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-emerald-500/20 border-t pt-3">
          <dt className="text-muted-foreground">Interest paid</dt>
          <dd
            className="font-semibold tabular-nums"
            data-testid="timeline-final-interest-paid"
          >
            {money(overview.interestPaid)}
          </dd>
        </div>
        <div className="rounded-md border border-emerald-500/20 bg-background/65 px-2.5 py-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Draw count</span>
            <span className="font-medium tabular-nums">
              {overview.drawCount} x {money(DRAW_FEE)}
            </span>
          </div>
        </div>
      </dl>
    </article>
  );
}

function IsometricMilestoneIcon({
  className,
  type,
}: {
  className?: string;
  type: IsometricIconKey;
}) {
  return (
    <img
      alt=""
      className={cn("pointer-events-none object-contain", className)}
      height={160}
      src={`/milestone-icons/${type}.png`}
      width={160}
    />
  );
}

function TimelineNodeButton({
  active,
  complete,
  item,
  onClick,
  onDoubleClick,
  reducedMotion,
}: {
  active: boolean;
  complete: boolean;
  item: TimelineItem<DemoMilestone>;
  onClick: () => void;
  onDoubleClick?: () => void;
  reducedMotion: boolean;
}) {
  return (
    <motion.button
      aria-label={`Set progress to ${item.data?.name ?? item.label ?? item.id}`}
      className={cn(
        "grid size-9 place-items-center rounded-full border-2 bg-background text-muted-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        complete &&
          "border-emerald-400 bg-emerald-50 text-emerald-600 ring-4 ring-emerald-500/10 dark:bg-emerald-500/10",
        active &&
          "border-rose-500 bg-rose-500 text-white shadow-rose-500/30 ring-4 ring-rose-500/20",
        !(active || complete) && "border-zinc-300 dark:border-zinc-700"
      )}
      data-testid={`demo-timeline-node-${item.id}`}
      onClick={onClick}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDoubleClick?.();
      }}
      transition={{ damping: 22, stiffness: 420, type: "spring" }}
      type="button"
      whileHover={reducedMotion ? undefined : { scale: 1.1, y: -2 }}
      whileTap={reducedMotion ? undefined : { scale: 0.9, y: 1 }}
    >
      {complete || active ? (
        <Banknote
          className="size-4"
          data-testid={`demo-timeline-node-icon-${item.id}`}
        />
      ) : (
        <span className="font-semibold text-xs">{item.markerLabel}</span>
      )}
    </motion.button>
  );
}
