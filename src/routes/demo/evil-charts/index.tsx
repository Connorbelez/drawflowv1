import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  Hammer,
  Home,
  type LucideIcon,
  Paintbrush,
  Pickaxe,
  Shovel,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";

import { EvilComposedChart } from "#/components/evilcharts/charts/composed-chart.tsx";
import type { ChartConfig } from "#/components/evilcharts/ui/chart.tsx";
import {
  buildEvilChartDrawSchedule,
  type EvilChartDatum,
  type EvilChartMilestone,
  evilChartMilestones,
  evilChartStartingCash,
} from "./-draw-schedule.ts";

export const Route = createFileRoute("/demo/evil-charts/")({
  component: EvilChartsDemo,
});

interface TimelineMarker<TData> {
  data: TData;
  kind: "milestone" | "draw";
  value: number;
}

const milestoneIcons: Record<string, LucideIcon> = {
  "Dry-in": Home,
  "Final punch": CheckCircle2,
  Foundation: Pickaxe,
  Framing: Hammer,
  Interior: Paintbrush,
  "MEP rough-in": Wrench,
  Sitework: Shovel,
};

const chartData = buildEvilChartDrawSchedule(
  evilChartMilestones,
  evilChartStartingCash
);
const chartCeiling = getChartCeiling(chartData);
const drawPoolCeiling = getDrawPoolCeiling(chartData);

const chartConfig = {
  budget: {
    label: "Milestone budget",
    colors: {
      light: ["oklch(0.67 0.18 275)", "oklch(0.76 0.17 235)"],
      dark: ["oklch(0.7 0.18 275)", "oklch(0.76 0.17 235)"],
    },
  },
  drawPool: {
    label: "Draw pool availability",
    colors: {
      light: ["oklch(0.6 0.18 240)", "oklch(0.72 0.15 240)"],
      dark: ["oklch(0.72 0.15 240)", "oklch(0.84 0.12 210)"],
    },
  },
  invertedDrawPool: {
    label: "Unlocked draw pool",
    colors: {
      light: ["oklch(0.65 0.18 275)", "oklch(0.78 0.14 255)"],
      dark: ["oklch(0.7 0.18 275)", "oklch(0.78 0.14 255)"],
    },
  },
  cashOnHand: {
    label: "Cash on hand",
    colors: {
      light: ["oklch(0.58 0.2 25)", "oklch(0.72 0.18 45)"],
      dark: ["oklch(0.78 0.16 85)", "oklch(0.62 0.22 25)"],
    },
  },
} satisfies ChartConfig;

function EvilChartsDemo() {
  const totalBudget = chartData.reduce((sum, item) => sum + item.budget, 0);
  const totalDraws = chartData.reduce((sum, item) => sum + item.drawAmount, 0);
  const endingCash = chartData.at(-1)?.cashOnHand ?? evilChartStartingCash;
  const endingPool = chartData.at(-1)?.drawPool ?? 0;
  const drawEvents = chartData.filter((item) => item.drawAmount > 0);
  const drawReferenceLines = drawEvents.map((event) => ({
    label: `Draw W${event.completionWeek}`,
    opacity: 0.32,
    stroke: "oklch(0.65 0.015 285)",
    x: event.completionWeek,
  }));
  const timelineWeeks = getTimelineWeeks(
    evilChartMilestones,
    drawReferenceLines
  );
  const timelineMarkers: TimelineMarker<EvilChartMilestone | EvilChartDatum>[] =
    [
      ...evilChartMilestones.map((milestone) => ({
        data: milestone,
        kind: "milestone" as const,
        value: milestone.completionWeek,
      })),
      ...drawEvents.map((event) => ({
        data: event,
        kind: "draw" as const,
        value: event.completionWeek,
      })),
    ];

  return (
    <main className="min-h-screen bg-[oklch(0.08_0.01_260)] px-6 py-10 text-[oklch(0.94_0.005_285)] md:px-10">
      <section className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <p className="font-medium text-[11px] text-[oklch(0.72_0.22_145)] uppercase tracking-[0.18em]">
            Evil Charts demo
          </p>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <h1 className="font-semibold text-3xl tracking-tight md:text-5xl">
                Draw pool and borrower cash runway
              </h1>
              <p className="mt-3 text-[oklch(0.65_0.01_285)] text-sm leading-6">
                The x-axis is project week. Each bar lands on the week its
                milestone is completed. Draw indicators come after completion to
                reflect lender review and release lag.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 md:min-w-96">
              <Metric
                label="Starting cash"
                value={formatCurrency(evilChartStartingCash)}
              />
              <Metric
                label="Total budget"
                value={formatCurrency(totalBudget)}
              />
              <Metric
                label="Draws executed"
                value={formatCurrency(totalDraws)}
              />
              <Metric label="Ending pool" value={formatCurrency(endingPool)} />
            </div>
          </div>
        </header>

        <section className="rounded-xl border border-white/10 bg-[oklch(0.12_0.015_260)] p-4 md:p-6">
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="font-semibold text-xl">
              Milestone reimbursement simulation
            </h2>
            <p className="text-[oklch(0.65_0.01_285)] text-sm">
              Cash falls as the borrower funds work, then replenishes from
              available completed work when the next milestone would exceed
              remaining cash.
            </p>
          </div>
          <EvilComposedChart
            activeDotVariant="default"
            areaConfig={{
              cashOnHand: chartConfig.cashOnHand,
            }}
            areaCurveType="basis"
            areaOpacity={0.1}
            areaVariant="gradient"
            // areaStacked
            barConfig={{
              budget: chartConfig.budget,
            }}
            barRadius={7}
            barSize={28}
            barVariant="duotone"
            chartProps={{
              margin: { top: 0, right: 10, bottom: 0, left: 0 },
            }}
            className="h-[calc(100vh-170px)] min-h-[560px]"
            curveType="bump"
            data={chartData}
            dotVariant="default"
            enableHoverHighlight
            lineConfig={{}}
            referenceLines={drawReferenceLines}
            strokeVariant="dashed"
            tooltipRoundness="xl"
            tooltipVariant="frosted-glass"
            xAxisProps={{
              domain: [0, timelineWeeks.at(-1) ?? 0],
              height: 96,
              interval: 0,
              tick: (
                <TimelineTick
                  markers={timelineMarkers}
                  renderMarker={(marker) =>
                    marker.kind === "milestone" ? (
                      <MilestoneIconCard
                        milestone={marker.data as EvilChartMilestone}
                      />
                    ) : null
                  }
                />
              ),
              tickFormatter: formatWeek,
              tickMargin: 0,
              ticks: timelineWeeks,
              type: "number",
            }}
            xDataKey="completionWeek"
            yAxisProps={{
              domain: [0, chartCeiling],
              tickFormatter: formatCompactCurrency,
            }}
            yDataKey="budget"
          />
          <EvilComposedChart
            areaConfig={{
              invertedDrawPool: chartConfig.invertedDrawPool,
            }}
            areaCurveType="stepAfter"
            areaOpacity={0.16}
            areaVariant="gradient-reverse"
            barConfig={{}}
            chartProps={{
              margin: { top: 0, right: 24, bottom: 0, left: 8 },
            }}
            className="h-[160px]"
            data={chartData}
            hideLegend
            lineConfig={{}}
            referenceLines={drawReferenceLines}
            strokeVariant="solid"
            tooltipRoundness="xl"
            tooltipVariant="frosted-glass"
            xAxisProps={{
              domain: [0, timelineWeeks.at(-1) ?? 0],
              height: 22,
              interval: 0,
              tickFormatter: formatWeek,
              ticks: timelineWeeks,
              type: "number",
            }}
            xDataKey="completionWeek"
            yAxisProps={{
              domain: [-drawPoolCeiling, 0],
              tickFormatter: formatAbsCompactCurrency,
            }}
            yDataKey="invertedDrawPool"
          />
          {/*</div>*/}
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-[oklch(0.12_0.015_260)] p-4">
            <h3 className="mb-3 font-medium text-sm uppercase tracking-[0.14em]">
              Draw execution points
            </h3>
            <div className="grid gap-2">
              {drawEvents.map((event) => (
                <div
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                  key={event.name}
                >
                  <span className="text-[oklch(0.65_0.01_285)] text-sm">
                    {event.name}
                  </span>
                  <span className="font-mono text-[oklch(0.72_0.22_145)] text-sm">
                    +{formatCurrency(event.drawAmount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[oklch(0.12_0.015_260)] p-4">
            <h3 className="mb-3 font-medium text-sm uppercase tracking-[0.14em]">
              Ending position
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Cash on hand" value={formatCurrency(endingCash)} />
              <Metric label="Undrawn pool" value={formatCurrency(endingPool)} />
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

interface TimelineTickProps<TData> {
  markers: TimelineMarker<TData>[];
  payload?: {
    value?: number | string;
  };
  renderMarker: (marker: TimelineMarker<TData>) => ReactNode;
  x?: number;
  y?: number;
}

function TimelineTick<TData>({
  markers,
  payload,
  renderMarker,
  x = 0,
  y = 0,
}: TimelineTickProps<TData>) {
  const week = typeof payload?.value === "number" ? payload.value : undefined;
  const marker = markers.find((item) => item.value === week);
  const markerNode = marker ? renderMarker(marker) : null;
  const cardHalfWidth = 50;
  const cardHeight = 96;
  const cardYOffset = -8;

  return (
    <g transform={`translate(${x},${y})`}>
      {/*<line
        stroke="oklch(1 0 0 / 0.1)"
        strokeWidth={1}
        x1={-railSegment}
        x2={-railGap}
        y1={40}
        y2={40}
      />
      <line
        stroke="oklch(1 0 0 / 0.1)"
        strokeWidth={1}
        x1={railGap}
        x2={railSegment}
        y1={40}
        y2={40}
      />*/}
      {/*<line
        stroke="oklch(1 0 0 / 0.22)"
        strokeWidth={1}
        x1={0}
        x2={0}
        y1={34}
        y2={46}
      />*/}
      {/*<circle
        className={
          isMilestone
            ? "fill-[oklch(0.76_0.17_235)]"
            : isDraw
              ? "fill-[oklch(0.65_0.015_285)]"
              : "fill-[oklch(1_0_0/0.2)]"
        }
        cx={0}
        cy={40}
        r={isMilestone ? 4 : isDraw ? 3 : 1.5}
      />*/}
      {markerNode && (
        <foreignObject
          className="z-50 rounded-lg bg-card outline-2"
          height={cardHeight}
          width={100}
          x={-cardHalfWidth}
          y={cardYOffset}
        >
          {markerNode}
        </foreignObject>
      )}
    </g>
  );
}

function MilestoneIconCard({ milestone }: { milestone: EvilChartMilestone }) {
  const Icon = milestoneIcons[milestone.name] ?? CheckCircle2;

  return (
    <div
      className="z-50 flex h-full w-full items-center justify-center border border-white/10 bg-black text-[oklch(0.76_0.17_235)] shadow-[0_0_0_1px_oklch(1_0_0/0.03)]"
      id="milestone-card"
      title={`${milestone.name} completed W${milestone.completionWeek}`}
    >
      <Icon aria-hidden className="h-4 w-4" strokeWidth={1.8} />
      <span className="sr-only">
        {milestone.name} completed week {milestone.completionWeek}
      </span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="text-[10px] text-[oklch(0.45_0.008_285)] uppercase tracking-[0.16em]">
        {label}
      </p>
      <p className="mt-1 font-mono font-semibold text-lg">{value}</p>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    compactDisplay: "short",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: "compact",
    style: "currency",
  }).format(value);
}

function formatAbsCompactCurrency(value: number) {
  return formatCompactCurrency(Math.abs(value));
}

function formatWeek(value: number) {
  return `W${value}`;
}

function getTimelineWeeks(
  items: EvilChartMilestone[],
  drawMarkers: { x: number | string }[]
) {
  const maxWeek = Math.max(
    ...items.map((item) => item.completionWeek),
    ...drawMarkers
      .map((marker) => marker.x)
      .filter((week): week is number => typeof week === "number")
  );
  const weeks = [
    ...Array.from({ length: maxWeek + 1 }, (_, week) => week),
    ...items.map((item) => item.completionWeek),
    ...drawMarkers
      .map((marker) => marker.x)
      .filter((week): week is number => typeof week === "number"),
  ];

  return [...new Set(weeks)].sort((a, b) => a - b);
}

function getChartCeiling(items: EvilChartDatum[]) {
  const maxValue = Math.max(
    ...items.flatMap((item) => [
      item.budget,
      item.cashOnHand,
      item.drawPool,
      item.cashOnHand + item.drawPool,
    ])
  );

  return Math.ceil((maxValue * 1.18) / 50_000) * 50_000;
}

function getDrawPoolCeiling(items: EvilChartDatum[]) {
  const maxValue = Math.max(...items.map((item) => item.drawPool));

  return Math.ceil((maxValue * 1.1) / 25_000) * 25_000;
}
