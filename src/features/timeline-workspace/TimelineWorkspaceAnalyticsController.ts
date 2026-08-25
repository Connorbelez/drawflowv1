import {
  useCallback,
  useMemo,
} from "react";
import type { TimelineMarker } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  getMilestoneEndX,
} from "./-timeline-milestone-schedule.ts";
import {
  GENERATED_TIMELINE_CURRENT_DAY,
  getTimelineResponsiveSizing,
  money,
} from "./TimelineWorkspaceDefaults.ts";
import {
  clampNumber,
  findDrawUnlockCapacityViolation,
  formatTimelineDay,
} from "./TimelineWorkspaceDrawUtils.ts";
import {
  buildCashShortfallPoints,
  buildCashUseSummary,
  buildDrawAvailabilityData,
  buildFinancialOverview,
  getCashflowChartExtent,
  getCumulativeDrawPosition,
  getDrawAvailabilityChartExtent,
  getTimelineAlignedTicks,
  interpolateDrawAvailability,
  interpolateLinearCashOnHand,
  withHomeEquityInterest,
} from "./TimelineWorkspaceChartMath.ts";
import {
  buildCashflowChartData,
  buildDrawAvailabilityChartData,
  buildTimelineCashflowData,
} from "./TimelineWorkspaceCashflow.ts";
import type { TimelineWorkspaceBaseControllerModel } from "./TimelineWorkspaceBaseController.ts";

export function useTimelineWorkspaceAnalyticsController(
  base: TimelineWorkspaceBaseControllerModel
) {
  const {
    capitalSpikes,
    currentDay,
    draws,
    approvedDrawLimit,
    interestAnnualBps,
    isCompactLayout,
    isMobileDrawerLayout,
    isPhoneLayout,
    items,
    minimumCashReserve,
    probeValue,
    resolvedRange,
    selectedDay,
    setActiveSelection,
    setProbeValue,
    setProgressValue,
    setSelectedDay,
    showCashflowWarnings,
    startingCash,
  } = base;
  const cashflowData = useMemo(
    () =>
      buildTimelineCashflowData(
        items,
        draws,
        capitalSpikes,
        resolvedRange,
        startingCash
      ),
    [capitalSpikes, draws, items, resolvedRange, startingCash]
  );
  const cashflowChartData = useMemo(
    () =>
      buildCashflowChartData(cashflowData, items, resolvedRange, startingCash),
    [cashflowData, items, resolvedRange, startingCash]
  );
  const drawAvailabilityData = useMemo(
    () =>
      buildDrawAvailabilityData(
        cashflowData,
        approvedDrawLimit,
        interestAnnualBps
      ),
    [approvedDrawLimit, cashflowData, interestAnnualBps]
  );
  const drawAvailabilityChartData = useMemo(
    () =>
      buildDrawAvailabilityChartData(
        drawAvailabilityData,
        cashflowData,
        items,
        resolvedRange
      ),
    [cashflowData, drawAvailabilityData, items, resolvedRange]
  );
  const cashShortfalls = useMemo(
    () => buildCashShortfallPoints(cashflowData, minimumCashReserve),
    [cashflowData, minimumCashReserve]
  );
  const financialOverview = useMemo(
    () =>
      buildFinancialOverview(
        cashflowData,
        draws,
        resolvedRange,
        interestAnnualBps,
        capitalSpikes
      ),
    [capitalSpikes, cashflowData, draws, interestAnnualBps, resolvedRange]
  );
  const cashUseSummary = useMemo(
    () => buildCashUseSummary(items, draws, capitalSpikes),
    [capitalSpikes, draws, items]
  );
  const drawAvailabilityViolation = useMemo(
    () => findDrawUnlockCapacityViolation(items, draws),
    [draws, items]
  );
  const cashflowExtent = useMemo(
    () => getCashflowChartExtent(cashflowChartData),
    [cashflowChartData]
  );
  const drawAvailabilityExtent = useMemo(
    () => getDrawAvailabilityChartExtent(drawAvailabilityData),
    [drawAvailabilityData]
  );
  const probeCashOnHand =
    probeValue === null
      ? null
      : interpolateLinearCashOnHand(cashflowChartData, probeValue);
  const rawProbeDrawAvailability =
    probeValue === null
      ? null
      : interpolateDrawAvailability(
          drawAvailabilityData,
          Math.round(probeValue)
        );
  const probeDrawAvailability =
    rawProbeDrawAvailability === null
      ? null
      : withHomeEquityInterest(
          rawProbeDrawAvailability,
          capitalSpikes,
          Math.round(probeValue ?? rawProbeDrawAvailability.day)
        );
  const probeInterestPaid = probeDrawAvailability?.totalInterestAccrued ?? null;
  const endingCashOnHand = cashflowData.at(-1)?.cashOnHand ?? startingCash;
  const endingAvailability = withHomeEquityInterest(
    interpolateDrawAvailability(drawAvailabilityData, resolvedRange.max),
    capitalSpikes,
    resolvedRange.max
  );
  const cashflowDrawPosition = getCumulativeDrawPosition(
    probeDrawAvailability ?? endingAvailability
  );
  const timelineSizing = useMemo(
    () => getTimelineResponsiveSizing(isCompactLayout, isPhoneLayout),
    [isCompactLayout, isPhoneLayout]
  );
  const cashflowTicks = useMemo(
    () => getTimelineAlignedTicks(resolvedRange, timelineSizing.pixelsPerUnit),
    [resolvedRange, timelineSizing.pixelsPerUnit]
  );
  const handleChartHotspotDaySelect = useCallback(
    (day: number) => {
      const nextDay = clampNumber(
        Math.round(day),
        resolvedRange.min,
        resolvedRange.max
      );
      setSelectedDay(nextDay);
      setProgressValue(nextDay);
      setProbeValue(null);

      const activeMilestone = items.find((item) => {
        if (!item.data) {
          return false;
        }
        const startDay = Math.round(item.x);
        const endDay = Math.round(getMilestoneEndX(item));
        return nextDay >= startDay && nextDay <= endDay;
      });

      if (activeMilestone) {
        setActiveSelection({
          itemId: activeMilestone.id,
          phase: "inProgress",
        });
      }
    },
    [items, resolvedRange.max, resolvedRange.min]
  );
  const drawAvailabilityHotspotReferenceLines = useMemo(
    () => [
      ...items
        .filter((item) => item.data)
        .map((item) => {
          const endDay = Math.round(
            clampNumber(
              getMilestoneEndX(item),
              resolvedRange.min,
              resolvedRange.max
            )
          );

          return {
            label: undefined,
            onClick: () => handleChartHotspotDaySelect(endDay),
            opacity: 0.42,
            stroke: "oklch(0.67 0.18 275)",
            strokeDasharray: "5 4",
            x: endDay,
          };
        }),
      ...capitalSpikes.map((spike) => {
        const day = Math.round(
          clampNumber(spike.x, resolvedRange.min, resolvedRange.max)
        );
        const isCashInfusion = spike.eventKind === "cashInfusion";

        return {
          label: undefined,
          onClick: () => handleChartHotspotDaySelect(day),
          opacity: 0.5,
          stroke: isCashInfusion
            ? "oklch(0.58 0.18 150)"
            : "oklch(0.62 0.22 35)",
          strokeDasharray: "2 3",
          x: day,
        };
      }),
    ],
    [
      capitalSpikes,
      handleChartHotspotDaySelect,
      items,
      resolvedRange.max,
      resolvedRange.min,
    ]
  );
  const cashflowReferenceLines = useMemo(
    () => [
      ...(showCashflowWarnings
        ? cashShortfalls.map((point) => ({
            label: isPhoneLayout
              ? undefined
              : point.shortfall > 0
                ? `Short ${money(point.shortfall)}`
                : "Cash zero",
            opacity: 0.52,
            stroke: "oklch(0.62 0.22 25)",
            strokeDasharray: "2 3",
            x: point.day,
          }))
        : []),
      ...(isMobileDrawerLayout
        ? [
            {
              label: isPhoneLayout
                ? undefined
                : ["Viewing day", `Day ${Math.round(selectedDay)}`],
              opacity: 0.92,
              stroke: "oklch(0.841 0.238 128.85)",
              strokeDasharray: "1 0",
              x: selectedDay,
            },
          ]
        : []),
      ...(probeValue === null
        ? []
        : [
            {
              label: [
                `Day ${Math.round(probeValue)}`,
                `Cash on hand ${money(probeCashOnHand ?? startingCash)}`,
              ],
              opacity: 0.78,
              stroke: "oklch(0.62 0.22 25)",
              strokeDasharray: "4 3",
              x: probeValue,
            },
          ]),
    ],
    [
      cashShortfalls,
      isMobileDrawerLayout,
      isPhoneLayout,
      probeCashOnHand,
      probeValue,
      selectedDay,
      showCashflowWarnings,
      startingCash,
    ]
  );
  const drawAvailabilityReferenceLines = useMemo(
    () => [
      ...drawAvailabilityHotspotReferenceLines,
      ...(isMobileDrawerLayout
        ? [
            {
              label: isPhoneLayout
                ? undefined
                : ["Viewing day", `Day ${Math.round(selectedDay)}`],
              opacity: 0.92,
              stroke: "oklch(0.841 0.238 128.85)",
              strokeDasharray: "1 0",
              x: selectedDay,
            },
          ]
        : []),
      ...(probeValue === null
        ? []
        : [
            {
              label: [
                `Delta ${money(
                  probeDrawAvailability?.additionalAvailableDraw ?? 0
                )}`,
                `Interest-bearing ${money(
                  probeDrawAvailability?.interestBearingDraw ?? 0
                )}`,
                `Total interest ${money(
                  probeDrawAvailability?.totalInterestAccrued ?? 0
                )}`,
              ],
              opacity: 0.82,
              stroke: "oklch(0.6 0.18 240)",
              strokeDasharray: "4 3",
              x: probeValue,
            },
          ]),
    ],
    [
      drawAvailabilityHotspotReferenceLines,
      isMobileDrawerLayout,
      isPhoneLayout,
      probeDrawAvailability,
      probeValue,
      selectedDay,
    ]
  );
  const markers = useMemo<TimelineMarker[]>(
    () => [
      {
        id: "today",
        label: "Today",
        sublabel:
          currentDay === GENERATED_TIMELINE_CURRENT_DAY
            ? "Proposal start"
            : "Site visit",
        tone: "today",
        x: currentDay,
      },
      ...draws.map((draw) => ({
        id: `draw-${draw.id}`,
        label: draw.label,
        sublabel: `${money(draw.amount)} · ${formatTimelineDay(draw.x)}`,
        tone: "accent" as const,
        x: draw.x,
      })),
      ...capitalSpikes.map((spike) => ({
        id: `capital-spike-${spike.id}`,
        label: spike.label,
        sublabel: `${money(spike.amount)} · ${formatTimelineDay(spike.x)}`,
        tone: "warning" as const,
        x: spike.x,
      })),
      {
        id: "policy-limit",
        label: "Policy checkpoint",
        sublabel: "Lender limit",
        tone: "warning",
        x: 154,
      },
    ],
    [capitalSpikes, currentDay, draws]
  );
  return {
    cashflowChartData,
    cashflowData,
    cashflowDrawPosition,
    cashflowExtent,
    cashflowReferenceLines,
    cashflowTicks,
    cashShortfalls,
    cashUseSummary,
    drawAvailabilityChartData,
    drawAvailabilityData,
    drawAvailabilityExtent,
    drawAvailabilityHotspotReferenceLines,
    drawAvailabilityReferenceLines,
    drawAvailabilityViolation,
    endingAvailability,
    endingCashOnHand,
    financialOverview,
    handleChartHotspotDaySelect,
    markers,
    probeCashOnHand,
    probeDrawAvailability,
    probeInterestPaid,
    timelineSizing,
  };
}

export type TimelineWorkspaceAnalyticsControllerModel = ReturnType<
  typeof useTimelineWorkspaceAnalyticsController
>;
