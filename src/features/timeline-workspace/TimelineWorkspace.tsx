import { parseAsString } from "nuqs";

import "./timeline-route-header.css";
import type { TimelineWorkspaceProps } from "./TimelineWorkspaceTypes.ts";
import { useTimelineWorkspaceController } from "./TimelineWorkspaceController.ts";
import { TimelineWorkspaceProvider } from "./TimelineWorkspaceContext.tsx";
import { TimelineWorkspaceRuntime } from "./TimelineWorkspaceRuntime.tsx";

export const timelineWorkspaceSearchParsers = {
  share: parseAsString,
};

export {
  buildAbsoluteSiteVisitUrl,
  createTimelineSaveReference,
  dollarsToCents,
  expandTimelineRangeForMilestones,
  getDemoApprovalStartDate,
  LOCAL_TIMELINE_SHARE_PREFIX,
  normalizeTimelineSiteVisitStatus,
  resolveDemoLiveBuildHref,
  resolveTimelinePersistenceSiteVisitMilestoneKey,
  resolveTimelineSiteVisitMilestoneKey,
  toDemoTimelinePlanStateMutationInput,
} from "./TimelineWorkspaceDefaults.ts";
export {
  buildDemoDraws,
  calculateApprovedDrawRequestLimit,
  calculateDrawRequestLimit,
  findDrawUnlockCapacityViolation,
  getMaxSchedulableDrawAmount,
  getDrawTimelineMarkerState,
  isCurrentTimelineSharePath,
  normalizeTimelineShareStateForRoute,
  relabelTimelineDraws,
  resolveSelectedDrawDate,
  formatTimelineDay,
} from "./TimelineWorkspaceDrawUtils.ts";
export type { DrawTimelineMarkerState } from "./TimelineWorkspaceDrawUtils.ts";
export {
  buildCashflowChartData,
  buildDrawAvailabilityChartData,
  buildTimelineCashflowData,
  buildChartProbeDays,
  densifyCashflowData,
  densifyDrawAvailabilityData,
  groupCashflowPointsByDay,
} from "./TimelineWorkspaceCashflow.ts";
export {
  buildCashShortfallPoints,
  buildCashUseSummary,
  buildDrawAvailabilityData,
  buildFinancialOverview,
  getCumulativeDrawPosition,
  getTimelineAlignedTicks,
  interpolateDrawAvailability,
  interpolateLinearCashOnHand,
  resolveMilestoneCumulativeDrawPosition,
  resolveMilestoneDrawPositionDay,
} from "./TimelineWorkspaceChartMath.ts";
export {
  normalizeTimelineProbeValue,
  readLocalTimelineSnapshot,
} from "./TimelineWorkspaceSharing.tsx";
export {
  DrawRequestPanel,
  LenderDrawReviewPanel,
} from "./TimelineWorkspaceRequestPanels.tsx";
export type {
  CashflowDatum,
  CashShortfallPoint,
  CapitalSpikeEditDraft,
  CumulativeDrawPosition,
  DrawAvailabilityDatum,
  DrawEditDraft,
  DrawRequestLimit,
  FinancialOverview,
  PendingNormalizedInsertSelection,
  TimelineCompletionClaimInput,
  TimelineDemoRole,
  TimelineDemoWorkspaceProps,
  TimelineModificationRequestView,
  TimelinePlanStatePersistenceInput,
  TimelineSiteVisitRequestInput,
  TimelineWorkspaceCollaboration,
  TimelineWorkspaceMode,
  TimelineWorkspacePersistence,
  TimelineWorkspaceProps,
  TimelineWorkspaceRemoteCursor,
} from "./TimelineWorkspaceTypes.ts";

export function TimelineWorkspace(
  props: TimelineWorkspaceProps = {}
) {
  const controller = useTimelineWorkspaceController(props);

  return (
    <TimelineWorkspaceProvider value={controller}>
      <TimelineWorkspaceRuntime />
    </TimelineWorkspaceProvider>
  );
}

export const TimelineDemoWorkspace = TimelineWorkspace;
