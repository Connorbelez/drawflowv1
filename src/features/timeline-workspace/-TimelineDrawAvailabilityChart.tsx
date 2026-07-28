import { memo } from "react";
import { EvilComposedChart } from "#/components/evilcharts/charts/composed-chart.tsx";
import type { ChartConfig } from "#/components/evilcharts/ui/chart.tsx";

export interface TimelineDrawAvailabilityDatum {
  additionalAvailableDraw: number;
  day: number;
  interestBearingDraw: number;
  name: string;
  totalAvailableDraw: number;
  totalInterestAccrued: number;
  [key: string]: unknown;
}

export interface TimelineDrawAvailabilityReferenceLine {
  label?: string | string[];
  onClick?: () => void;
  opacity?: number;
  stroke: string;
  strokeDasharray?: string;
  x: number;
}

interface TimelineDrawAvailabilityChartProps {
  className?: string;
  data: TimelineDrawAvailabilityDatum[];
  formatMoney: (value: number) => string;
  formatTimelineDay: (value: number) => string;
  onProbeChange?: (value: number | null) => void;
  referenceLines?: TimelineDrawAvailabilityReferenceLine[];
  testId?: string;
  xDomain: [number, number];
  xTicks: number[];
  yAxisWidth?: number;
  yDomain: [number, number];
}

export const timelineDrawAvailabilityChartConfig = {
  additionalAvailableDraw: {
    label: "Additional available draw",
    colors: {
      dark: ["oklch(0.72 0.15 240)", "oklch(0.84 0.12 210)"],
      light: ["oklch(0.6 0.18 240)", "oklch(0.72 0.15 240)"],
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

export const TimelineDrawAvailabilityChart = memo(
  function TimelineDrawAvailabilityChart({
    className = "mt-3 h-[220px] min-w-0 sm:h-[210px]",
    data,
    formatMoney,
    formatTimelineDay,
    onProbeChange,
    referenceLines,
    testId,
    xDomain,
    xTicks,
    yAxisWidth = 58,
    yDomain,
  }: TimelineDrawAvailabilityChartProps) {
    const chart = (
      <EvilComposedChart
        activeDotVariant="default"
        areaConfig={{
          interestBearingDraw:
            timelineDrawAvailabilityChartConfig.interestBearingDraw,
          additionalAvailableDraw:
            timelineDrawAvailabilityChartConfig.additionalAvailableDraw,
        }}
        areaCurveType="linear"
        areaOpacity={0.18}
        areaStacked
        areaVariant="gradient"
        barConfig={{}}
        chartProps={{
          margin: { bottom: 0, left: 0, right: 12, top: 48 },
          onMouseLeave: () => onProbeChange?.(null),
          onMouseMove: (state: unknown) => {
            const nextValue = getChartProbeValue(state);
            if (nextValue !== null) {
              onProbeChange?.(nextValue);
            }
          },
        }}
        className={className}
        curveType="linear"
        data={data}
        dotVariant="default"
        hideLegend
        lineConfig={{
          interestBearingDraw:
            timelineDrawAvailabilityChartConfig.interestBearingDraw,
          totalAvailableDraw:
            timelineDrawAvailabilityChartConfig.totalAvailableDraw,
        }}
        referenceLines={referenceLines}
        strokeVariant="solid"
        tooltipRoundness="xl"
        tooltipVariant="frosted-glass"
        xAxisProps={{
          domain: xDomain,
          height: 26,
          tickFormatter: formatTimelineDay,
          ticks: xTicks,
          type: "number",
        }}
        xDataKey="day"
        yAxisProps={{
          domain: yDomain,
          tickFormatter: formatMoney,
          width: yAxisWidth,
        }}
        yDataKey="totalAvailableDraw"
      />
    );

    return testId ? <div data-testid={testId}>{chart}</div> : chart;
  },
  areTimelineDrawAvailabilityChartPropsEqual
);

TimelineDrawAvailabilityChart.displayName = "TimelineDrawAvailabilityChart";

function areTimelineDrawAvailabilityChartPropsEqual(
  previous: TimelineDrawAvailabilityChartProps,
  next: TimelineDrawAvailabilityChartProps
) {
  return (
    previous.className === next.className &&
    previous.data === next.data &&
    previous.formatMoney === next.formatMoney &&
    previous.formatTimelineDay === next.formatTimelineDay &&
    previous.onProbeChange === next.onProbeChange &&
    previous.referenceLines === next.referenceLines &&
    previous.testId === next.testId &&
    sameNumberTuple(previous.xDomain, next.xDomain) &&
    previous.xTicks === next.xTicks &&
    previous.yAxisWidth === next.yAxisWidth &&
    sameNumberTuple(previous.yDomain, next.yDomain)
  );
}

function sameNumberTuple(
  previous: readonly [number, number],
  next: readonly [number, number]
) {
  return previous[0] === next[0] && previous[1] === next[1];
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
  return Boolean(value && typeof value === "object");
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
