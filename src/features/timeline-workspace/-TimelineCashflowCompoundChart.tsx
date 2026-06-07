import { EvilComposedChart } from "#/components/evilcharts/charts/composed-chart.tsx";
import type { ChartConfig } from "#/components/evilcharts/ui/chart.tsx";

const CASHFLOW_EDGE_BAR_PADDING_RATIO = 0.035;
const CASHFLOW_MIN_EDGE_BAR_PADDING_DAYS = 2;

export interface TimelineCashflowCompoundDatum {
  budget: number;
  cashInfusionAmount?: number;
  capitalSpikeAmount: number;
  cashOnHand: number;
  day: number;
  outOfPocketBudget?: number;
  reimbursableBudget?: number;
  event: "capitalSpike" | "cashInfusion" | "draw" | "milestone" | "start";
  id: string;
  milestoneEndDay?: number;
  name: string;
  [key: string]: unknown;
}

export interface TimelineCashflowReferenceLine {
  label?: string | string[];
  onClick?: () => void;
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
  reimbursableBudget: {
    label: "Reimbursable",
    colors: {
      dark: ["oklch(0.72 0.17 160)", "oklch(0.62 0.2 185)"],
      light: ["oklch(0.58 0.18 160)", "oklch(0.64 0.18 185)"],
    },
  },
  outOfPocketBudget: {
    label: "Out of pocket",
    colors: {
      dark: ["oklch(0.73 0.18 340)", "oklch(0.68 0.2 20)"],
      light: ["oklch(0.65 0.2 340)", "oklch(0.68 0.2 20)"],
    },
  },
  capitalSpikeAmount: {
    label: "Capital spike",
    colors: {
      dark: ["oklch(0.68 0.2 35)", "oklch(0.78 0.18 55)"],
      light: ["oklch(0.62 0.22 35)", "oklch(0.74 0.18 55)"],
    },
  },
  cashInfusionAmount: {
    label: "Cash infusion",
    colors: {
      dark: ["oklch(0.72 0.16 150)", "oklch(0.8 0.14 170)"],
      light: ["oklch(0.58 0.18 150)", "oklch(0.7 0.16 170)"],
    },
  },
} satisfies ChartConfig;

export function isMilestoneEndDatum(row: TimelineCashflowCompoundDatum) {
  if (row.event !== "milestone") {
    return false;
  }

  if (row.id.startsWith("milestone:")) {
    return true;
  }

  const drawCapacityUnlocked = toFiniteNumber(row.drawCapacityUnlocked);
  if (drawCapacityUnlocked !== null && drawCapacityUnlocked > 0) {
    return true;
  }

  return row.id.includes("completion");
}

export function resolveMilestoneEndDay(row: TimelineCashflowCompoundDatum) {
  const explicitEndDay = toFiniteNumber(row.milestoneEndDay);
  if (explicitEndDay !== null) {
    return explicitEndDay;
  }

  return row.day;
}

export function buildMilestoneEndReferenceLines(
  data: TimelineCashflowCompoundDatum[],
  onHotspotDaySelect?: (day: number) => void,
): TimelineCashflowReferenceLine[] {
  return data.filter(isMilestoneEndDatum).map((row) => {
    const endDay = resolveMilestoneEndDay(row);

    return {
      ...(onHotspotDaySelect
        ? {
            onClick: () => onHotspotDaySelect(Math.round(endDay)),
          }
        : {}),
      label: [row.name, `Ends ${formatTimelineDay(endDay)}`],
      opacity: 0.58,
      stroke: "oklch(0.67 0.18 275)",
      strokeDasharray: "5 4",
      x: endDay,
    };
  });
}

export function TimelineCashflowCompoundChart({
  barSize = 18,
  className = "mt-3 h-[220px] min-w-0 sm:h-[230px]",
  data,
  hideMilestoneEndReferenceLines = false,
  onHotspotDaySelect,
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
  hideMilestoneEndReferenceLines?: boolean;
  onHotspotDaySelect?: (day: number) => void;
  onProbeChange?: (value: number | null) => void;
  referenceLines?: TimelineCashflowReferenceLine[];
  testId?: string;
  xDomain: [number, number];
  xTicks: number[];
  yAxisWidth?: number;
  yDomain: [number, number];
}) {
  const milestoneEndReferenceLines = hideMilestoneEndReferenceLines
    ? []
    : buildMilestoneEndReferenceLines(data, onHotspotDaySelect);
  const drawReferenceLines = data
    .filter((row) => row.event === "draw")
    .map((row) => ({
      opacity: 0.46,
      stroke: "oklch(0.62 0.18 245)",
      strokeDasharray: "3 4",
      x: row.day,
    }));
  const allReferenceLines = [
    ...milestoneEndReferenceLines,
    ...drawReferenceLines,
    ...(referenceLines ?? []),
  ];
  const barSafeXDomain = buildCashflowBarSafeXDomain(xDomain);
  const chart = (
    <EvilComposedChart
      activeDotVariant="default"
      areaConfig={{ cashOnHand: timelineCashflowChartConfig.cashOnHand }}
      areaCurveType="linear"
      areaOpacity={0.16}
      areaVariant="gradient"
      barConfig={{
        reimbursableBudget: timelineCashflowChartConfig.reimbursableBudget,
        outOfPocketBudget: timelineCashflowChartConfig.outOfPocketBudget,
        capitalSpikeAmount: timelineCashflowChartConfig.capitalSpikeAmount,
        cashInfusionAmount: timelineCashflowChartConfig.cashInfusionAmount,
      }}
      barRadius={6}
      barSize={barSize}
      barStackId={{
        reimbursableBudget: "milestone-budget",
        outOfPocketBudget: "milestone-budget",
      }}
      barVariant="duotone"
      chartProps={{
        margin: { bottom: 0, left: 0, right: 12, top: 18 },
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
      lineConfig={{ cashOnHand: timelineCashflowChartConfig.cashOnHand }}
      minBarWidth={barSize}
      onBarClick={
        onHotspotDaySelect
          ? ({ dataKey, payload }) => {
              const hotspotDay = getCashflowBarHotspotDay(dataKey, payload);
              if (hotspotDay !== null) {
                onHotspotDaySelect(hotspotDay);
              }
            }
          : undefined
      }
      referenceLines={allReferenceLines}
      strokeVariant="solid"
      tooltipDefaultIndex={0}
      tooltipHiddenKeys={["capitalSpikeAmount"]}
      tooltipLabelFormatter={(_value, payload) => {
        const activeDay = readChartPayloadValue(payload);
        const milestoneEnd = readMilestoneEndFromPayload(payload);
        if (milestoneEnd && activeDay !== null) {
          const endDay = resolveMilestoneEndDay(milestoneEnd);
          if (Math.round(activeDay) === Math.round(endDay)) {
            return [`${milestoneEnd.name} ends`, formatTimelineDay(endDay)];
          }

          if (
            milestoneEnd.budget > 0 &&
            Math.round(activeDay) === Math.round(milestoneEnd.day)
          ) {
            return [
              `${milestoneEnd.name} cost`,
              formatTimelineDay(milestoneEnd.day),
            ];
          }
        }

        return activeDay === null ? "Day" : formatTimelineDay(activeDay);
      }}
      tooltipRoundness="xl"
      tooltipVariant="frosted-glass"
      xAxisProps={{
        domain: barSafeXDomain,
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

export function getCashflowBarHotspotDay(
  dataKey: string,
  row: TimelineCashflowCompoundDatum,
) {
  if (
    (dataKey === "budget" ||
      dataKey === "reimbursableBudget" ||
      dataKey === "outOfPocketBudget") &&
    row.event === "milestone" &&
    row.budget > 0
  ) {
    return Math.round(row.day);
  }
  if (
    dataKey === "capitalSpikeAmount" &&
    row.event === "capitalSpike" &&
    row.capitalSpikeAmount > 0
  ) {
    return Math.round(row.day);
  }
  if (
    dataKey === "cashInfusionAmount" &&
    row.event === "cashInfusion" &&
    (row.cashInfusionAmount ?? 0) > 0
  ) {
    return Math.round(row.day);
  }
  return null;
}

export function buildCashflowBarSafeXDomain(
  domain: [number, number],
): [number, number] {
  const [min, max] = domain;
  if (!(Number.isFinite(min) && Number.isFinite(max) && max > min)) {
    return domain;
  }

  const padding = Math.max(
    CASHFLOW_MIN_EDGE_BAR_PADDING_DAYS,
    (max - min) * CASHFLOW_EDGE_BAR_PADDING_RATIO,
  );

  return [min - padding, max + padding];
}

export function getCashflowCompoundExtent(
  data: TimelineCashflowCompoundDatum[],
) {
  const values = data.flatMap((row) => [
    row.budget,
    row.reimbursableBudget ?? 0,
    row.outOfPocketBudget ?? 0,
    row.cashInfusionAmount ?? 0,
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

function readMilestoneEndFromPayload(
  activePayload: unknown,
): TimelineCashflowCompoundDatum | null {
  if (!Array.isArray(activePayload)) {
    return null;
  }

  for (const payloadItem of activePayload) {
    if (!(isRecord(payloadItem) && isRecord(payloadItem.payload))) {
      continue;
    }

    const row = payloadItem.payload as TimelineCashflowCompoundDatum;
    if (isMilestoneEndDatum(row)) {
      return row;
    }
  }

  return null;
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
