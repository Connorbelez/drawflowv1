import { EvilComposedChart } from "#/components/evilcharts/charts/composed-chart.tsx";
import type { ChartConfig } from "#/components/evilcharts/ui/chart.tsx";

export interface TimelineCashflowCompoundDatum {
  budget: number;
  capitalSpikeAmount: number;
  cashOnHand: number;
  day: number;
  event: "capitalSpike" | "draw" | "milestone" | "start";
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface TimelineCashflowReferenceLine {
  label?: string | string[];
  opacity?: number;
  stroke: string;
  strokeDasharray?: string;
  x: number;
}

export const timelineCashflowChartConfig = {
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
  capitalSpikeAmount: {
    label: "Capital spike",
    colors: {
      dark: ["oklch(0.68 0.2 35)", "oklch(0.78 0.18 55)"],
      light: ["oklch(0.62 0.22 35)", "oklch(0.74 0.18 55)"],
    },
  },
} satisfies ChartConfig;

export function TimelineCashflowCompoundChart({
  barSize = 18,
  className = "mt-3 h-[220px] min-w-0 sm:h-[230px]",
  data,
  onProbeChange,
  referenceLines,
  testId,
  xDomain,
  xTicks,
  yAxisWidth = 56,
  yDomain,
}: {
  barSize?: number;
  className?: string;
  data: TimelineCashflowCompoundDatum[];
  onProbeChange?: (value: number | null) => void;
  referenceLines?: TimelineCashflowReferenceLine[];
  testId?: string;
  xDomain: [number, number];
  xTicks: number[];
  yAxisWidth?: number;
  yDomain: [number, number];
}) {
  const drawReferenceLines = data
    .filter((row) => row.event === "draw")
    .map((row) => ({
      opacity: 0.46,
      stroke: "oklch(0.62 0.18 245)",
      strokeDasharray: "3 4",
      x: row.day,
    }));
  const allReferenceLines = [...drawReferenceLines, ...(referenceLines ?? [])];
  const chart = (
    <EvilComposedChart
      activeDotVariant="default"
      areaConfig={{ cashOnHand: timelineCashflowChartConfig.cashOnHand }}
      areaCurveType="linear"
      areaOpacity={0.16}
      areaVariant="gradient"
      barConfig={{
        budget: timelineCashflowChartConfig.budget,
        capitalSpikeAmount: timelineCashflowChartConfig.capitalSpikeAmount,
      }}
      barRadius={6}
      barSize={barSize}
      barVariant="duotone"
      chartProps={{
        margin: { bottom: 0, left: 0, right: 12, top: 18 },
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
      lineConfig={{ cashOnHand: timelineCashflowChartConfig.cashOnHand }}
      minBarWidth={barSize}
      referenceLines={allReferenceLines}
      strokeVariant="solid"
      tooltipDefaultIndex={0}
      tooltipHiddenKeys={["capitalSpikeAmount"]}
      tooltipLabelFormatter={(_value, payload) => {
        const day = readChartPayloadValue(payload);
        return day === null ? "Day" : formatTimelineDay(day);
      }}
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
        tickFormatter: formatCompactMoney,
        width: yAxisWidth,
      }}
      yDataKey="budget"
    />
  );

  return testId ? <div data-testid={testId}>{chart}</div> : chart;
}

export function getCashflowCompoundExtent(
  data: TimelineCashflowCompoundDatum[],
) {
  const values = data.flatMap((row) => [
    row.budget,
    row.capitalSpikeAmount,
    row.cashOnHand,
  ]);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const padding = Math.max(10_000, Math.round((max - min) * 0.12));

  return {
    max: max + padding,
    min: min - padding,
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
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatTimelineDay(value: number) {
  return `Day ${Math.round(value)}`;
}

function formatCompactMoney(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absolute >= 1_000_000) {
    return `${sign}$${(absolute / 1_000_000).toFixed(1)}M`;
  }

  if (absolute >= 1_000) {
    return `${sign}$${Math.round(absolute / 1_000)}K`;
  }

  return `${sign}$${Math.round(absolute)}`;
}
