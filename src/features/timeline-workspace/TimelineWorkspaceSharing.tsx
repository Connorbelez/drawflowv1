import { useMutation, useQuery } from "convex/react";
import { AlertTriangle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { parseAsString, useQueryStates } from "nuqs";
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { CursorPointer } from "#/components/ui/cursor.tsx";
import { api } from "../../../convex/_generated/api";
import type {
  TimelineItem,
  TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import type { ActiveMilestoneSelection } from "./-timeline-milestone-schedule.ts";
import { TIMELINE_DEMO_SETTINGS_MISSING_NOTICE } from "./-timeline-demo-settings-adapter.ts";
import type {
  DemoCapitalSpike,
  DemoDraw,
  DemoMilestone,
  TimelineShareState,
} from "./-timeline-share-snapshot.ts";
import {
  applyTimelineShareSnapshotV2,
  buildTimelineShareSnapshotV2,
  initialTimelineShareState,
  normalizeInterestAnnualBps,
} from "./-timeline-share-snapshot.ts";
import {
  INITIAL_CAPITAL_SPIKES,
  INITIAL_CURRENT_DAY,
  INITIAL_RANGE,
  LOCAL_TIMELINE_SHARE_PREFIX,
  NORMALIZED_INITIAL_ITEMS,
  STARTING_CASH,
} from "./TimelineWorkspaceDefaults.ts";
import {
  buildDemoDraws,
  isCurrentTimelineSharePath,
  normalizeTimelineShareStateForRoute,
} from "./TimelineWorkspaceDrawUtils.ts";
import {
  buildTimelineShareUrl,
  countInsertedTimelineItems,
  countManualDraws,
} from "./TimelineWorkspaceChartMath.ts";
import type {
  CapitalSpikeEditDraft,
  DrawEditDraft,
  TimelineWorkspaceRemoteCursor,
} from "./TimelineWorkspaceTypes.ts";

export const timelineWorkspaceSearchParsers = { share: parseAsString };

export function ResponsiveAnalyticsDisclosure({
  children,
  compact,
  label,
}: {
  children: ReactNode;
  compact: boolean;
  label: string;
}) {
  const [expanded, setExpanded] = useState(!compact);
  const contentId = `timeline-${label.toLowerCase().replace(/\s+/g, "-")}-content`;

  useEffect(() => {
    setExpanded(!compact);
  }, [compact]);

  if (!compact) {
    return children;
  }

  return (
    <section
      aria-label={`${label} disclosure`}
      className="min-w-0 px-2 sm:px-0"
    >
      <Button
        aria-controls={contentId}
        aria-expanded={expanded}
        className="min-h-11 w-full justify-between"
        onClick={() => setExpanded((current) => !current)}
        type="button"
        variant="outline"
      >
        {label}
        <span aria-hidden="true" className="text-muted-foreground text-xs">
          {expanded ? "Hide" : "Show"}
        </span>
      </Button>
      <div className="mt-2 min-w-0" hidden={!expanded} id={contentId}>
        {children}
      </div>
    </section>
  );
}
export function TimelineRemoteCursors({
  cursors,
}: {
  cursors: TimelineWorkspaceRemoteCursor[];
}) {
  const activeCursors = cursors.filter(
    (
      cursor
    ): cursor is TimelineWorkspaceRemoteCursor & {
      cursor: { x: number; y: number };
    } => Boolean(cursor.cursor)
  );

  if (activeCursors.length === 0) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      data-testid="timeline-remote-cursors"
    >
      {activeCursors.map((cursor) => {
        const color = cursor.color ?? "oklch(0.54 0.14 240)";
        return (
          <TimelineRemoteCursorMarker
            color={color}
            cursor={cursor.cursor}
            key={cursor.userId}
            name={cursor.name}
          />
        );
      })}
    </div>
  );
}

export function TimelineRemoteCursorMarker({
  color,
  cursor,
  name,
}: {
  color: string;
  cursor: { x: number; y: number };
  name: string;
}) {
  const reducedMotion = useReducedMotion();
  const left = `${clampUnit(cursor.x) * 100}%`;
  const top = `${clampUnit(cursor.y) * 100}%`;

  return (
    <motion.div
      animate={{ left, top }}
      className="absolute -translate-x-1 -translate-y-1"
      initial={false}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { bounce: 0, damping: 42, stiffness: 520, type: "spring" }
      }
    >
      <div
        className="drop-shadow-sm"
        data-testid="timeline-remote-cursor-pointer"
        style={{ color }}
      >
        <CursorPointer />
      </div>
      <div
        className="absolute top-4 left-[18px] rounded-lg px-2 py-1 font-medium text-[11px] text-white shadow-lg"
        data-testid="timeline-remote-cursor-label"
        style={{ backgroundColor: color }}
      >
        <span className="block whitespace-nowrap">{name}</span>
      </div>
    </motion.div>
  );
}

export function clampUnit(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

interface CounterRef {
  current: number;
}

export interface UseTimelineSnapshotSharingArgs {
  activeSelection: ActiveMilestoneSelection;
  approvedDrawLimit?: number;
  capitalSpikeInsertionCount: CounterRef;
  capitalSpikes: DemoCapitalSpike[];
  currentDay: number;
  drawInsertionCount: CounterRef;
  draws: DemoDraw[];
  insertionCount: CounterRef;
  interestAnnualBps: number;
  items: TimelineItem<DemoMilestone>[];
  minimumCashReserve: number;
  progressValue: number;
  resolvedRange: Required<TimelineRange>;
  selectedPanelOpen: boolean;
  setActiveCapitalSpikeId: (value: string | null) => void;
  setActiveDrawId: (value: string | null) => void;
  setActiveSelection: (value: ActiveMilestoneSelection) => void;
  setApprovedDrawLimit: (value: number | undefined) => void;
  setCapitalSpikeEditDraft: (value: CapitalSpikeEditDraft) => void;
  setCapitalSpikes: Dispatch<SetStateAction<DemoCapitalSpike[]>>;
  setCurrentDay: (value: number) => void;
  setDrawEditDraft: (value: DrawEditDraft) => void;
  setDraws: (value: DemoDraw[]) => void;
  setInterestAnnualBps: (value: number) => void;
  setItems: (value: TimelineItem<DemoMilestone>[]) => void;
  setMinimumCashReserve: (value: number) => void;
  setProbeValue: (value: number | null) => void;
  setProgressValue: (value: number) => void;
  setRange: (value: TimelineRange) => void;
  setSelectedDay: (value: number) => void;
  setSelectedPanelOpen: (value: boolean) => void;
  setStartingCash: (value: number) => void;
  setStraightLine: (value: boolean) => void;
  shareUrlPath: string;
  startingCash: number;
  straightLine: boolean;
}

export interface ShareTimelineMenuProps {
  copied: boolean;
  error: string | null;
  loading: boolean;
  onCopy: () => void;
  onCreate: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  shareUrl: string;
}

export function normalizeTimelineProbeValue(value: number | null) {
  if (value === null) {
    return null;
  }

  return Number.isFinite(value) ? Math.round(value) : null;
}

export function useTimelineProbeState() {
  const [probeValue, setProbeValueState] = useState<number | null>(null);
  const committedValueRef = useRef<number | null>(null);
  const pendingValueRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  const commitProbeValue = useCallback((value: number | null) => {
    const nextValue = normalizeTimelineProbeValue(value);
    if (committedValueRef.current === nextValue) {
      return;
    }

    committedValueRef.current = nextValue;
    setProbeValueState(nextValue);
  }, []);

  const setProbeValue = useCallback(
    (value: number | null) => {
      const nextValue = normalizeTimelineProbeValue(value);
      pendingValueRef.current = nextValue;

      if (nextValue === null) {
        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        commitProbeValue(null);
        return;
      }

      if (committedValueRef.current === nextValue) {
        return;
      }

      if (frameRef.current !== null) {
        return;
      }

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        const pendingValue = pendingValueRef.current;
        pendingValueRef.current = null;
        commitProbeValue(pendingValue);
      });
    },
    [commitProbeValue]
  );

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    },
    []
  );

  return [probeValue, setProbeValue] as const;
}

export function TimelineDemoSettingsNotice() {
  return (
    <div
      className="mx-auto mb-4 max-w-full rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
      data-testid="timeline-demo-config-notice"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div>
          <strong>Timeline settings missing</strong>
          <p className="mt-1 text-fg-secondary">
            {TIMELINE_DEMO_SETTINGS_MISSING_NOTICE}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ShareStatusBadges({
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

export function useTimelineSnapshotSharing({
  activeSelection,
  approvedDrawLimit,
  capitalSpikeInsertionCount,
  capitalSpikes,
  currentDay,
  drawInsertionCount,
  draws,
  interestAnnualBps,
  insertionCount,
  items,
  progressValue,
  resolvedRange,
  selectedPanelOpen,
  shareUrlPath,
  setActiveCapitalSpikeId,
  setActiveDrawId,
  setActiveSelection,
  setCapitalSpikeEditDraft,
  setCapitalSpikes,
  setCurrentDay,
  setDrawEditDraft,
  setDraws,
  setInterestAnnualBps,
  setItems,
  setProbeValue,
  setProgressValue,
  setRange,
  setSelectedDay,
  setSelectedPanelOpen,
  setApprovedDrawLimit,
  setMinimumCashReserve,
  setStartingCash,
  setStraightLine,
  minimumCashReserve,
  startingCash,
  straightLine,
}: UseTimelineSnapshotSharingArgs) {
  const [{ share }, setTimelineSearch] = useQueryStates(
    timelineWorkspaceSearchParsers
  );
  const shareHydrationEnabled = isCurrentTimelineSharePath(shareUrlPath);
  const hydratedShare = shareHydrationEnabled ? share : null;
  const createTimelineSnapshot = useMutation(
    api.demo_timeline_snapshots.demo_createTimelineSnapshot
  );
  const sharedSnapshot = useQuery(
    api.demo_timeline_snapshots.demo_getTimelineSnapshot,
    hydratedShare && !hydratedShare.startsWith(LOCAL_TIMELINE_SHARE_PREFIX)
      ? { snapshotId: hydratedShare }
      : "skip"
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
        NORMALIZED_INITIAL_ITEMS,
        buildDemoDraws(NORMALIZED_INITIAL_ITEMS, INITIAL_RANGE),
        INITIAL_CAPITAL_SPIKES,
        INITIAL_RANGE,
        { itemId: "rough-in", phase: "inProgress" },
        66,
        INITIAL_CURRENT_DAY,
        true,
        STARTING_CASH,
        true,
        0
      ),
    []
  );

  const applyShareState = useCallback(
    (nextState: TimelineShareState) => {
      const hydratedState = normalizeTimelineShareStateForRoute(nextState);

      setItems(hydratedState.items);
      setDraws(hydratedState.draws);
      setCapitalSpikes(hydratedState.capitalSpikes);
      setRange(hydratedState.range);
      setActiveSelection(hydratedState.activeSelection);
      setCurrentDay(hydratedState.currentDay);
      setSelectedDay(hydratedState.progressValue);
      setProgressValue(hydratedState.progressValue);
      setProbeValue(null);
      setActiveDrawId(null);
      setActiveCapitalSpikeId(null);
      setDrawEditDraft({ amount: "", x: "" });
      setCapitalSpikeEditDraft({
        amount: "",
        interestAnnualPercent: "",
        label: "",
        x: "",
      });
      setSelectedPanelOpen(hydratedState.selectedPanelOpen);
      setApprovedDrawLimit(hydratedState.approvedDrawLimit);
      setInterestAnnualBps(
        normalizeInterestAnnualBps(hydratedState.interestAnnualBps)
      );
      setMinimumCashReserve(hydratedState.minimumCashReserve);
      setStartingCash(hydratedState.startingCash);
      setStraightLine(hydratedState.straightLine);
      insertionCount.current = countInsertedTimelineItems(hydratedState.items);
      drawInsertionCount.current = countManualDraws(hydratedState.draws);
      capitalSpikeInsertionCount.current = hydratedState.capitalSpikes.length;
    },
    [
      capitalSpikeInsertionCount,
      drawInsertionCount,
      insertionCount,
      setActiveCapitalSpikeId,
      setActiveDrawId,
      setActiveSelection,
      setCapitalSpikeEditDraft,
      setCapitalSpikes,
      setCurrentDay,
      setDrawEditDraft,
      setDraws,
      setInterestAnnualBps,
      setItems,
      setProbeValue,
      setProgressValue,
      setRange,
      setSelectedDay,
      setSelectedPanelOpen,
      setApprovedDrawLimit,
      setMinimumCashReserve,
      setStartingCash,
      setStraightLine,
    ]
  );

  useEffect(() => {
    if (!hydratedShare) {
      hydratedShareId.current = null;
      return;
    }

    setShareUrl(buildTimelineShareUrl(hydratedShare, shareUrlPath));
  }, [hydratedShare, shareUrlPath]);

  useEffect(() => {
    if (
      !(
        hydratedShare?.startsWith(LOCAL_TIMELINE_SHARE_PREFIX) &&
        hydratedShareId.current !== hydratedShare
      )
    ) {
      return;
    }

    const storedSnapshot = readLocalTimelineSnapshot(hydratedShare);
    if (storedSnapshot) {
      applyShareState(
        applyTimelineShareSnapshotV2(storedSnapshot, initialShareState)
      );
      hydratedShareId.current = hydratedShare;
    }
  }, [applyShareState, hydratedShare, initialShareState]);

  useEffect(() => {
    if (
      !(
        hydratedShare &&
        sharedSnapshot &&
        hydratedShareId.current !== hydratedShare
      )
    ) {
      return;
    }

    applyShareState(
      applyTimelineShareSnapshotV2(sharedSnapshot, initialShareState)
    );
    hydratedShareId.current = hydratedShare;
  }, [applyShareState, hydratedShare, initialShareState, sharedSnapshot]);

  const resetTimeline = useCallback(() => {
    const localSnapshot = hydratedShare?.startsWith(LOCAL_TIMELINE_SHARE_PREFIX)
      ? readLocalTimelineSnapshot(hydratedShare)
      : null;
    const nextState = localSnapshot
      ? applyTimelineShareSnapshotV2(localSnapshot, initialShareState)
      : hydratedShare && sharedSnapshot
        ? applyTimelineShareSnapshotV2(sharedSnapshot, initialShareState)
        : initialShareState;

    applyShareState(nextState);
  }, [applyShareState, hydratedShare, initialShareState, sharedSnapshot]);

  const createShareSnapshot = useCallback(async () => {
    setShareOpen(true);
    setShareCreating(true);
    setShareCopied(false);
    setShareError(null);

    try {
      const snapshot = buildTimelineShareSnapshotV2({
        activeSelection,
        approvedDrawLimit,
        capitalSpikes,
        currentDay,
        draws,
        interestAnnualBps,
        items,
        progressValue,
        range: resolvedRange,
        selectedPanelOpen,
        minimumCashReserve,
        startingCash,
        straightLine,
      });
      const snapshotInput = snapshot as Parameters<
        typeof createTimelineSnapshot
      >[0]["snapshot"];
      const snapshotId = await createTimelineSnapshot({
        snapshot: snapshotInput,
      });
      const nextShareUrl = buildTimelineShareUrl(snapshotId, shareUrlPath);

      if (shareHydrationEnabled) {
        await setTimelineSearch({ share: snapshotId });
      }
      setShareUrl(nextShareUrl);
    } catch {
      const snapshot = buildTimelineShareSnapshotV2({
        activeSelection,
        approvedDrawLimit,
        capitalSpikes,
        currentDay,
        draws,
        interestAnnualBps,
        items,
        progressValue,
        range: resolvedRange,
        selectedPanelOpen,
        minimumCashReserve,
        startingCash,
        straightLine,
      });
      const localShareId = `${LOCAL_TIMELINE_SHARE_PREFIX}${Date.now().toString(
        36
      )}`;
      writeLocalTimelineSnapshot(localShareId, snapshot);
      if (shareHydrationEnabled) {
        await setTimelineSearch({ share: localShareId });
      }
      setShareUrl(buildTimelineShareUrl(localShareId, shareUrlPath));
      setShareError(null);
    } finally {
      setShareCreating(false);
    }
  }, [
    activeSelection,
    approvedDrawLimit,
    capitalSpikes,
    createTimelineSnapshot,
    currentDay,
    draws,
    interestAnnualBps,
    items,
    progressValue,
    resolvedRange,
    selectedPanelOpen,
    setTimelineSearch,
    shareUrlPath,
    shareHydrationEnabled,
    minimumCashReserve,
    startingCash,
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
    share: hydratedShare,
    sharedSnapshotLoading: Boolean(
      hydratedShare &&
        !hydratedShare.startsWith(LOCAL_TIMELINE_SHARE_PREFIX) &&
        sharedSnapshot === undefined
    ),
    sharedSnapshotMissing: Boolean(
      hydratedShare &&
        !hydratedShare.startsWith(LOCAL_TIMELINE_SHARE_PREFIX) &&
        sharedSnapshot === null
    ),
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

export function readLocalTimelineSnapshot(snapshotId: string): unknown {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSnapshot = window.localStorage.getItem(
    `${LOCAL_TIMELINE_SHARE_PREFIX}snapshot:${snapshotId}`
  );

  if (!rawSnapshot) {
    return null;
  }

  try {
    return JSON.parse(rawSnapshot);
  } catch {
    return null;
  }
}

export function writeLocalTimelineSnapshot(snapshotId: string, snapshot: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    `${LOCAL_TIMELINE_SHARE_PREFIX}snapshot:${snapshotId}`,
    JSON.stringify(snapshot)
  );
}
