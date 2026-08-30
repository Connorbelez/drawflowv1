import type { Id } from "../../../convex/_generated/dataModel";
import {
  type TimelineItem,
  type TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { useMediaQuery } from "#/hooks/use-media-query.ts";
import { useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildTimelineSetupTemplatesFromSettings,
  normalizeTimelineSettingsProjection,
} from "./-timeline-demo-settings-adapter.ts";
import {
  type ActiveMilestoneSelection,
} from "./-timeline-milestone-schedule.ts";
import {
  type DemoCapitalSpike,
  type DemoDraw,
  type DemoMilestone,
  initialTimelineShareState,
  normalizeInterestAnnualBps,
  PROPOSAL_TIMELINE_MIN_DAY,
  type TimelineShareState,
} from "./-timeline-share-snapshot.ts";
import {
  EMPTY_TIMELINE_MODIFICATION_REQUESTS,
  INITIAL_CAPITAL_SPIKES,
  INITIAL_CURRENT_DAY,
  INITIAL_RANGE,
  NORMALIZED_INITIAL_ITEMS,
  STARTING_CASH,
  DEFAULT_TIMELINE_SHARE_PATH,
  createTimelineSaveReference,
  normalizeDemoRange,
  timelineMilestonePayloadToItem,
  toDemoTimelinePlanStateMutationInput,
} from "./TimelineWorkspaceDefaults.ts";
import {
  buildDemoDraws,
  normalizeTimelineShareStateForRoute,
  sortTimelineDraws,
} from "./TimelineWorkspaceDrawUtils.ts";
import {
  countInsertedTimelineItems,
  countManualDraws,
  timelineShareStateSignature,
} from "./TimelineWorkspaceChartMath.ts";
import type {
  CapitalSpikeEditDraft,
  DrawEditDraft,
  PendingNormalizedInsertSelection,
  TimelineDemoRole,
  TimelineModificationRequestView,
  TimelinePlanStatePersistenceInput,
  TimelineWorkspaceProps,
} from "./TimelineWorkspaceTypes.ts";
import {
  useTimelineProbeState,
  useTimelineSnapshotSharing,
} from "./TimelineWorkspaceSharing.tsx";
import { useTimelineWorkspaceMutations } from "./TimelineWorkspaceMutations.ts";

export function useTimelineWorkspaceBaseController({
  allowRoleSwitching = true,
  canApproveMilestoneCompletion = true,
  collaboration,
  contractorPlanning,
  durableMeta,
  durablePlanId,
  embedded = false,
  headerActions,
  initialRole,
  lockedBannerActions,
  initialState,
  modificationRequests:
    initialModificationRequests = EMPTY_TIMELINE_MODIFICATION_REQUESTS,
  onOpenSubmilestone,
  persistence,
  readOnly: forcedReadOnly = false,
  shareUrlPath = DEFAULT_TIMELINE_SHARE_PATH,
  showWorkspaceHeader = true,
  timelineSettingsProjection,
  workspaceMode = "demo",
}: TimelineWorkspaceProps = {}) {
  const workspaceMutations = useTimelineWorkspaceMutations(
    timelineSettingsProjection
  );
  const {
    timelineDemoSettings,
    ...timelineMutations
  } = workspaceMutations;
  const {
    approveTimelinePlan,
    createTimelineCapitalEvent,
    createTimelineCashInfusion,
    createTimelineDraw,
    createTimelineEvidenceAsset,
    createTimelineMilestone,
    createTimelinePlan,
    deleteTimelineCapitalEvent,
    deleteTimelineDraw,
    deleteTimelineEvidenceAsset,
    deleteTimelineMilestone,
    generateTimelineEvidenceUploadUrl,
    requestTimelineModification,
    reviewTimelineDrawRequest,
    reviewTimelineMilestoneCompletion,
    reviewTimelineModificationRequest,
    submitTimelineDrawRequest,
    submitTimelineMilestoneCompletion,
    submitTimelinePlan,
    updateTimelineCapitalEvent,
    updateTimelineDraw,
    updateTimelineEvidenceAssetMutation,
    updateTimelineMilestone,
    updateTimelinePlanState,
  } = timelineMutations;
  const prefersReducedMotion = useReducedMotion();
  const isCompactLayout = useMediaQuery("max-lg");
  const isMobileDrawerLayout = useMediaQuery("max-md");
  const isPhoneLayout = useMediaQuery("max-sm");
  const insertionCount = useRef(0);
  const drawInsertionCount = useRef(0);
  const capitalSpikeInsertionCount = useRef(0);
  const pendingCapitalEventIds = useRef(new Set<string>());
  const pendingNormalizedInsertSelection =
    useRef<PendingNormalizedInsertSelection | null>(null);
  const pendingExpandedRange = useRef<Required<TimelineRange> | null>(null);
  const mobileInitialPanelDismissed = useRef(false);
  const workspaceInitialState = useMemo(() => {
    const normalizedState = initialState
      ? normalizeTimelineShareStateForRoute(initialState)
      : initialTimelineShareState(
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
        );
    if (workspaceMode !== "proposal") {
      return normalizedState;
    }
    return {
      ...normalizedState,
      range: {
        ...normalizedState.range,
        min: PROPOSAL_TIMELINE_MIN_DAY,
      },
    };
  }, [initialState, workspaceMode]);
  const incomingTimelineStateSignature = useMemo(
    () =>
      initialState ? timelineShareStateSignature(workspaceInitialState) : null,
    [initialState, workspaceInitialState]
  );
  const appliedTimelineStateSignature = useRef<string | null>(null);
  const [items, setItems] = useState<TimelineItem<DemoMilestone>[]>(
    () => workspaceInitialState.items
  );
  const [draws, setDraws] = useState<DemoDraw[]>(
    () => workspaceInitialState.draws
  );
  const [interestAnnualBps, setInterestAnnualBps] = useState(() =>
    normalizeInterestAnnualBps(workspaceInitialState.interestAnnualBps)
  );
  const [capitalSpikes, setCapitalSpikes] = useState<DemoCapitalSpike[]>(
    () => workspaceInitialState.capitalSpikes
  );
  const [startingCash, setStartingCash] = useState(
    workspaceInitialState.startingCash
  );
  const [minimumCashReserve, setMinimumCashReserve] = useState(
    workspaceInitialState.minimumCashReserve
  );
  const [approvedDrawLimit, setApprovedDrawLimit] = useState(
    workspaceInitialState.approvedDrawLimit
  );
  const [currentDay, setCurrentDay] = useState(
    workspaceInitialState.currentDay
  );
  const [selectedDay, setSelectedDay] = useState(
    workspaceInitialState.progressValue ?? workspaceInitialState.currentDay
  );
  const [range, setRange] = useState<TimelineRange>(
    workspaceInitialState.range
  );
  const [activeSelection, setActiveSelection] =
    useState<ActiveMilestoneSelection>(workspaceInitialState.activeSelection);
  const [progressValue, setProgressValue] = useState(
    workspaceInitialState.progressValue
  );
  const [probeValue, setProbeValue] = useTimelineProbeState();
  const [showCashflowWarnings, setShowCashflowWarnings] = useState(true);
  const [showCashflowHoverDetails, setShowCashflowHoverDetails] =
    useState(true);
  const [activeDrawId, setActiveDrawId] = useState<string | null>(null);
  const [activeCapitalSpikeId, setActiveCapitalSpikeId] = useState<
    string | null
  >(null);
  const [drawEditDraft, setDrawEditDraft] = useState<DrawEditDraft>({
    amount: "",
    x: "",
  });
  const [capitalSpikeEditDraft, setCapitalSpikeEditDraft] =
    useState<CapitalSpikeEditDraft>({
      amount: "",
      interestAnnualPercent: "",
      label: "",
      x: "",
    });
  const [selectedPanelOpen, setSelectedPanelOpen] = useState(true);
  const [mobileDetailDrawerRequested, setMobileDetailDrawerRequested] =
    useState(false);
  const [modificationRequests, setModificationRequests] = useState<
    TimelineModificationRequestView[]
  >(initialModificationRequests);
  const [durableSavePendingCount, setDurableSavePendingCount] = useState(0);
  const [durableSaveStatus, setDurableSaveStatus] = useState<
    "idle" | "saved" | "error"
  >("idle");
  const [durableSaveReference, setDurableSaveReference] = useState<
    string | null
  >(null);
  const durableSaveAttemptSequence = useRef(0);
  const durableSaveRetry = useRef<{
    label: string;
    operation: () => Promise<unknown> | unknown;
  } | null>(null);
  const [timelineRole, setTimelineRole] = useState<TimelineDemoRole>(
    initialRole ?? "builder"
  );
  const planStatus = durableMeta?.status ?? "draft";
  const demoMode = workspaceMode === "demo";
  const proposalMode = workspaceMode === "proposal";
  const liveBuildMode =
    workspaceMode === "live" ||
    Boolean(demoMode && durableMeta && planStatus === "approved");
  const collaborationViewOnly = collaboration?.permission === "view";
  const statusReadOnly = Boolean(
    durableMeta &&
      ((proposalMode && planStatus !== "draft") ||
        (demoMode && planStatus !== "draft" && !liveBuildMode))
  );
  const readOnly = Boolean(
    forcedReadOnly || statusReadOnly || collaborationViewOnly
  );
  const canWriteLiveTimeline =
    !readOnly && (!durableMeta || planStatus === "draft" || liveBuildMode);
  const canEditPlanStructure =
    !readOnly && (!durableMeta || planStatus === "draft");
  const canUseLiveExecution = liveBuildMode && !readOnly;
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitPending, setSubmitPending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [lenderApprovalPending, setLenderApprovalPending] = useState(false);
  const [lenderApprovedBuildKey, setLenderApprovedBuildKey] = useState<
    string | null
  >(null);
  const [straightLine, setStraightLine] = useState(
    workspaceInitialState.straightLine
  );
  const [setupComplete, setSetupComplete] = useState(Boolean(initialState));
  const [setupBaseline, setSetupBaseline] = useState<TimelineShareState | null>(
    initialState ?? null
  );
  const [mobileEditDatesItemId, setMobileEditDatesItemId] = useState<
    string | null
  >(null);
  const [mobileEditBudgetItemId, setMobileEditBudgetItemId] = useState<
    string | null
  >(null);
  const [mobileEditDrawId, setMobileEditDrawId] = useState<string | null>(null);
  const [mobileDeleteTarget, setMobileDeleteTarget] = useState<{
    id: string;
    kind: "milestone" | "draw";
    label: string;
  } | null>(null);
  const timelineSettingsSource =
    timelineSettingsProjection === undefined
      ? timelineDemoSettings
      : timelineSettingsProjection;
  const settingsTemplates = useMemo(
    () => normalizeTimelineSettingsProjection(timelineSettingsSource),
    [timelineSettingsSource]
  );
  const setupTemplates = useMemo(
    () => buildTimelineSetupTemplatesFromSettings(settingsTemplates),
    [settingsTemplates]
  );
  const settingsFallbackActive =
    timelineSettingsProjection === undefined &&
    timelineDemoSettings !== undefined &&
    settingsTemplates.length === 0;
  useEffect(() => {
    setModificationRequests(initialModificationRequests);
  }, [initialModificationRequests]);
  useEffect(() => {
    if (!isMobileDrawerLayout) {
      mobileInitialPanelDismissed.current = false;
      return;
    }
    if (mobileInitialPanelDismissed.current) {
      return;
    }
    mobileInitialPanelDismissed.current = true;
    setSelectedPanelOpen(false);
    setMobileDetailDrawerRequested(false);
  }, [isMobileDrawerLayout]);
  const activeItemId = activeSelection.itemId;
  const activeItem =
    items.find((item) => item.id === activeItemId) ?? items[0] ?? null;
  const activeItemDraw = null;
  const activePanelDraw =
    activeDrawId === null
      ? null
      : (draws.find((draw) => draw.id === activeDrawId) ?? null);
  const activePanelDrawItem = activePanelDraw
    ? (items.find(
        (item) =>
          item.id === activePanelDraw.itemId ||
          `${item.id}-draw` === activePanelDraw.id ||
          item.data?.draw === activePanelDraw.label
      ) ?? null)
    : null;
  const requestedMilestoneCreations = useMemo(
    () =>
      modificationRequests
        .filter(
          (request) =>
            request.status === "requested" &&
            request.requestType === "createMilestone" &&
            request.requestedPayload?.milestone
        )
        .map((request): TimelineItem<DemoMilestone> => {
          const item = timelineMilestonePayloadToItem(
            request.requestedPayload.milestone
          );
          return {
            ...item,
            id: `requested-${item.id}`,
          };
        }),
    [modificationRequests]
  );
  const timelineItemsForRender = useMemo(
    () =>
      [...items, ...requestedMilestoneCreations].sort(
        (a, b) => a.x - b.x || a.id.localeCompare(b.id)
      ),
    [items, requestedMilestoneCreations]
  );
  const requestedDeletionByMilestone = useMemo(
    () =>
      new Set(
        modificationRequests
          .filter(
            (request) =>
              request.status === "requested" &&
              request.requestType === "deleteMilestone" &&
              request.milestoneKey
          )
          .map((request) => request.milestoneKey as string)
      ),
    [modificationRequests]
  );
  const requestedBudgetByMilestone = useMemo(() => {
    const map = new Map<string, number>();
    for (const request of modificationRequests) {
      if (
        request.status === "requested" &&
        request.requestType === "updateMilestoneBudget" &&
        request.milestoneKey &&
        typeof request.requestedPayload?.budgetCents === "number"
      ) {
        map.set(
          request.milestoneKey,
          request.requestedPayload.budgetCents / 100
        );
      }
    }
    return map;
  }, [modificationRequests]);
  const resolvedRange = useMemo(() => normalizeDemoRange(range), [range]);
  useEffect(() => {
    if (
      workspaceMode === "proposal" &&
      resolvedRange.min !== PROPOSAL_TIMELINE_MIN_DAY
    ) {
      setRange((currentRange) => ({
        ...currentRange,
        min: PROPOSAL_TIMELINE_MIN_DAY,
      }));
    }
  }, [resolvedRange.min, workspaceMode]);
  const durablePlanStateInitialized = useRef(false);
  const runDurableMutation = useCallback(
    (operation: () => Promise<unknown> | unknown, label: string) => {
      if (!(durablePlanId && !readOnly)) {
        return;
      }
      const attemptId = durableSaveAttemptSequence.current + 1;
      durableSaveAttemptSequence.current = attemptId;
      durableSaveRetry.current = { label, operation };
      setDurableSavePendingCount((count) => count + 1);
      setDurableSaveReference(null);
      setDurableSaveStatus("idle");
      const handleFailure = () => {
        const reference = createTimelineSaveReference();
        if (durableSaveAttemptSequence.current === attemptId) {
          setDurableSaveReference(reference);
          setDurableSaveStatus("error");
        }
        toast.error(
          `Unable to save ${label}. Changes are still local. Reference ${reference}.`
        );
      };
      let result: Promise<unknown> | unknown;
      try {
        result = operation();
      } catch {
        handleFailure();
        setDurableSavePendingCount((count) => Math.max(0, count - 1));
        return;
      }
      void Promise.resolve(result)
        .then(() => {
          if (durableSaveAttemptSequence.current !== attemptId) {
            return;
          }
          durableSaveRetry.current = null;
          setDurableSaveReference(null);
          setDurableSaveStatus("saved");
        })
        .catch(handleFailure)
        .finally(() => {
          setDurableSavePendingCount((count) => Math.max(0, count - 1));
        });
    },
    [durablePlanId, readOnly]
  );
  const retryDurableMutation = useCallback(() => {
    const pendingRetry = durableSaveRetry.current;
    if (pendingRetry) {
      runDurableMutation(pendingRetry.operation, pendingRetry.label);
    }
  }, [runDurableMutation]);
  const persistSubmitPlan = useCallback(
    () =>
      persistence?.submitPlan?.() ??
      submitTimelinePlan({ planId: durablePlanId as Id<"demo_timelinePlans"> }),
    [durablePlanId, persistence, submitTimelinePlan]
  );
  const persistUpdatePlanState = useCallback(
    (input: TimelinePlanStatePersistenceInput) => {
      if (persistence?.updatePlanState) {
        return persistence.updatePlanState(input);
      }
      return updateTimelinePlanState({
        ...toDemoTimelinePlanStateMutationInput(input),
        planId: durablePlanId as Id<"demo_timelinePlans">,
      });
    },
    [durablePlanId, persistence, updateTimelinePlanState]
  );
  const persistCreateDraw = useCallback(
    (input: any) =>
      persistence?.createDraw?.(input) ??
      createTimelineDraw({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [createTimelineDraw, durablePlanId, persistence]
  );
  const persistUpdateDraw = useCallback(
    (input: any) =>
      persistence?.updateDraw?.(input) ??
      updateTimelineDraw({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, persistence, updateTimelineDraw]
  );
  const persistDeleteDraw = useCallback(
    (input: any) =>
      persistence?.deleteDraw?.(input) ??
      deleteTimelineDraw({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [deleteTimelineDraw, durablePlanId, persistence]
  );
  const persistDrawSequenceUpdates = useCallback(
    (
      previousDraws: DemoDraw[],
      nextDraws: DemoDraw[],
      skipDrawIds: Set<string> = new Set()
    ) => {
      if (!durablePlanId) {
        return;
      }

      const previousById = new Map(
        sortTimelineDraws(previousDraws).map((draw, index) => [
          draw.id,
          { draw, order: index + 1 },
        ])
      );

      nextDraws.forEach((draw, index) => {
        if (skipDrawIds.has(draw.id)) {
          return;
        }

        const previous = previousById.get(draw.id);
        if (!previous) {
          return;
        }

        const nextOrder = index + 1;
        if (
          previous.draw.label === draw.label &&
          previous.order === nextOrder
        ) {
          return;
        }

        runDurableMutation(
          () =>
            persistUpdateDraw({
              drawKey: draw.id,
              label: draw.label,
              order: nextOrder,
            }),
          "draw sequence update"
        );
      });
    },
    [durablePlanId, persistUpdateDraw, runDurableMutation]
  );
  const persistSubmitDrawRequest = useCallback(
    (input: any) =>
      persistence?.submitDrawRequest?.(input) ??
      submitTimelineDrawRequest({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, persistence, submitTimelineDrawRequest]
  );
  const persistReviewDrawRequest = useCallback(
    (input: any) =>
      persistence?.reviewDrawRequest?.(input) ??
      reviewTimelineDrawRequest({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, persistence, reviewTimelineDrawRequest]
  );
  const persistCreateCapitalEvent = useCallback(
    (input: any) =>
      persistence?.createCapitalEvent?.(input) ??
      createTimelineCapitalEvent({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [createTimelineCapitalEvent, durablePlanId, persistence]
  );
  const persistCreateCashInfusion = useCallback(
    (input: any) =>
      persistence?.createCashInfusion?.(input) ??
      createTimelineCashInfusion({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [createTimelineCashInfusion, durablePlanId, persistence]
  );
  const persistUpdateCapitalEvent = useCallback(
    (input: any) =>
      persistence?.updateCapitalEvent?.(input) ??
      updateTimelineCapitalEvent({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, persistence, updateTimelineCapitalEvent]
  );
  const persistDeleteCapitalEvent = useCallback(
    (input: any) =>
      persistence?.deleteCapitalEvent?.(input) ??
      deleteTimelineCapitalEvent({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [deleteTimelineCapitalEvent, durablePlanId, persistence]
  );
  const persistCreateMilestone = useCallback(
    (input: any) =>
      persistence?.createMilestone?.(input) ??
      createTimelineMilestone({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [createTimelineMilestone, durablePlanId, persistence]
  );
  const persistUpdateMilestone = useCallback(
    (input: any) =>
      persistence?.updateMilestone?.(input) ??
      updateTimelineMilestone({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, persistence, updateTimelineMilestone]
  );
  const persistDeleteMilestone = useCallback(
    (input: any) =>
      persistence?.deleteMilestone?.(input) ??
      deleteTimelineMilestone({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [deleteTimelineMilestone, durablePlanId, persistence]
  );
  const persistRequestModification = useCallback(
    (input: any) =>
      persistence?.requestModification?.(input) ??
      requestTimelineModification({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, persistence, requestTimelineModification]
  );
  const persistReviewModificationRequest = useCallback(
    (input: any) =>
      persistence?.reviewModificationRequest?.(input) ??
      reviewTimelineModificationRequest(input),
    [persistence, reviewTimelineModificationRequest]
  );
  const persistSubmitMilestoneCompletion = useCallback(
    (input: any) =>
      persistence?.submitMilestoneCompletion?.(input) ??
      submitTimelineMilestoneCompletion({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, persistence, submitTimelineMilestoneCompletion]
  );
  const persistReviewMilestoneCompletion = useCallback(
    (input: any) =>
      persistence?.reviewMilestoneCompletion?.(input) ??
      reviewTimelineMilestoneCompletion({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, persistence, reviewTimelineMilestoneCompletion]
  );
  const persistRequestMilestoneSiteVisit = useCallback(
    (input: any) => persistence?.requestMilestoneSiteVisit?.(input),
    [persistence]
  );
  const persistRecordMilestoneSiteVisit = useCallback(
    (input: any) => persistence?.recordMilestoneSiteVisit?.(input),
    [persistence]
  );
  const persistGenerateEvidenceUploadUrl = useCallback(
    () =>
      persistence?.generateEvidenceUploadUrl?.() ??
      generateTimelineEvidenceUploadUrl({
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, generateTimelineEvidenceUploadUrl, persistence]
  );
  const persistCreateEvidenceAsset = useCallback(
    (input: any) =>
      persistence?.createEvidenceAsset?.(input) ??
      createTimelineEvidenceAsset({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [createTimelineEvidenceAsset, durablePlanId, persistence]
  );
  const persistUpdateEvidenceAsset = useCallback(
    (input: any) =>
      persistence?.updateEvidenceAsset?.(input) ??
      updateTimelineEvidenceAssetMutation({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [durablePlanId, persistence, updateTimelineEvidenceAssetMutation]
  );
  const persistDeleteEvidenceAsset = useCallback(
    (input: any) =>
      persistence?.deleteEvidenceAsset?.(input) ??
      deleteTimelineEvidenceAsset({
        ...input,
        planId: durablePlanId as Id<"demo_timelinePlans">,
      }),
    [deleteTimelineEvidenceAsset, durablePlanId, persistence]
  );
  const {
    resetTimeline,
    shareMenuProps,
    sharedSnapshotLoading,
    sharedSnapshotMissing,
    share,
  } = useTimelineSnapshotSharing({
    activeSelection,
    approvedDrawLimit,
    capitalSpikeInsertionCount,
    capitalSpikes,
    drawInsertionCount,
    draws,
    interestAnnualBps,
    insertionCount,
    items,
    currentDay,
    progressValue,
    resolvedRange,
    selectedPanelOpen,
    shareUrlPath,
    setActiveCapitalSpikeId,
    setActiveDrawId,
    setActiveSelection,
    setCapitalSpikeEditDraft,
    setCapitalSpikes,
    setDrawEditDraft,
    setDraws,
    setInterestAnnualBps,
    setItems,
    setCurrentDay,
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
  });

  const applyTimelineState = useCallback((nextState: TimelineShareState) => {
    const hydratedState = normalizeTimelineShareStateForRoute(nextState);

    setItems(hydratedState.items);
    setDraws(hydratedState.draws);
    setInterestAnnualBps(
      normalizeInterestAnnualBps(hydratedState.interestAnnualBps)
    );
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
    setMinimumCashReserve(hydratedState.minimumCashReserve);
    setStartingCash(hydratedState.startingCash);
    setApprovedDrawLimit(hydratedState.approvedDrawLimit);
    setStraightLine(hydratedState.straightLine);
    insertionCount.current = countInsertedTimelineItems(hydratedState.items);
    drawInsertionCount.current = countManualDraws(hydratedState.draws);
    capitalSpikeInsertionCount.current = hydratedState.capitalSpikes.length;
  }, []);

  useEffect(() => {
    if (!(initialState && incomingTimelineStateSignature)) {
      appliedTimelineStateSignature.current = null;
      return;
    }

    if (appliedTimelineStateSignature.current === null) {
      appliedTimelineStateSignature.current = incomingTimelineStateSignature;
      if (!setupComplete) {
        setSetupBaseline(initialState);
        setSetupComplete(true);
        applyTimelineState(workspaceInitialState);
      }
      return;
    }

    if (
      appliedTimelineStateSignature.current === incomingTimelineStateSignature
    ) {
      return;
    }

    appliedTimelineStateSignature.current = incomingTimelineStateSignature;
    setSetupBaseline(initialState);
    setSetupComplete(true);
    applyTimelineState(workspaceInitialState);
  }, [
    applyTimelineState,
    incomingTimelineStateSignature,
    initialState,
    setupComplete,
    workspaceInitialState,
  ]);


  return {
    ...timelineMutations,
    activeCapitalSpikeId,
    activeDrawId,
    activeItem,
    activeItemDraw,
    activeItemId,
    activePanelDraw,
    activePanelDrawItem,
    activeSelection,
    allowRoleSwitching,
    appliedTimelineStateSignature,
    approvedDrawLimit,
    canApproveMilestoneCompletion,
    canEditPlanStructure,
    canUseLiveExecution,
    canWriteLiveTimeline,
    collaboration,
    collaborationViewOnly,
    currentDay,
    contractorPlanning,
    demoMode,
    draws,
    drawEditDraft,
    durableMeta,
    durablePlanId,
    durablePlanStateInitialized,
    durableSavePendingCount,
    durableSaveReference,
    durableSaveRetry,
    durableSaveStatus,
    embedded,
    forcedReadOnly,
    headerActions,
    incomingTimelineStateSignature,
    initialRole,
    initialState,
    insertions: {
      capitalSpikeInsertionCount,
      drawInsertionCount,
      insertionCount,
      pendingCapitalEventIds,
      pendingExpandedRange,
      pendingNormalizedInsertSelection,
    },
    interestAnnualBps,
    isCompactLayout,
    isMobileDrawerLayout,
    isPhoneLayout,
    items,
    liveBuildMode,
    capitalSpikeEditDraft,
    capitalSpikes,
    lenderApprovalPending,
    lenderApprovedBuildKey,
    lockedBannerActions,
    minimumCashReserve,
    mobileDeleteTarget,
    mobileDetailDrawerRequested,
    mobileEditBudgetItemId,
    mobileEditDatesItemId,
    mobileEditDrawId,
    mobileInitialPanelDismissed,
    modificationRequests,
    normalizeTimelineShareStateForRoute,
    onOpenSubmilestone,
    persistence,
    planStatus,
    probeValue,
    progressValue,
    proposalMode,
    range,
    readOnly,
    resolvedRange,
    selectedDay,
    selectedPanelOpen,
    setActiveCapitalSpikeId,
    setActiveDrawId,
    setActiveSelection,
    setApprovedDrawLimit,
    setCapitalSpikeEditDraft,
    setCapitalSpikes,
    setCurrentDay,
    setDrawEditDraft,
    setDraws,
    setInterestAnnualBps,
    setItems,
    setMinimumCashReserve,
    setLenderApprovalPending,
    setLenderApprovedBuildKey,
    setModificationRequests,
    setMobileDeleteTarget,
    setMobileDetailDrawerRequested,
    setMobileEditBudgetItemId,
    setMobileEditDatesItemId,
    setMobileEditDrawId,
    setProbeValue,
    setProgressValue,
    setRange,
    setSelectedDay,
    setSelectedPanelOpen,
    setStartingCash,
    setStraightLine,
    setTimelineRole,
    setSetupBaseline,
    setSetupComplete,
    setShowCashflowHoverDetails,
    setShowCashflowWarnings,
    setSubmitConfirmOpen,
    setSubmitError,
    setSubmitPending,
    setupBaseline,
    setupComplete,
    setupTemplates,
    settingsFallbackActive,
    settingsTemplates,
    showCashflowHoverDetails,
    showCashflowWarnings,
    showWorkspaceHeader,
    shareUrlPath,
    startingCash,
    statusReadOnly,
    straightLine,
    submitConfirmOpen,
    submitError,
    submitPending,
    timelineRole,
    workspaceMode,
    timelineSettingsProjection,
    timelineSettingsSource,
    timelineItemsForRender,
    requestedBudgetByMilestone,
    requestedDeletionByMilestone,
    requestedMilestoneCreations,
    retryDurableMutation,
    runDurableMutation,
    persistCreateCashInfusion,
    persistCreateCapitalEvent,
    persistCreateDraw,
    persistCreateEvidenceAsset,
    persistCreateMilestone,
    persistDeleteCapitalEvent,
    persistDeleteDraw,
    persistDeleteEvidenceAsset,
    persistDeleteMilestone,
    persistGenerateEvidenceUploadUrl,
    persistRequestMilestoneSiteVisit,
    persistRecordMilestoneSiteVisit,
    persistRequestModification,
    persistReviewDrawRequest,
    persistReviewMilestoneCompletion,
    persistReviewModificationRequest,
    persistSubmitDrawRequest,
    persistSubmitMilestoneCompletion,
    persistSubmitPlan,
    persistUpdateCapitalEvent,
    persistUpdateDraw,
    persistUpdateEvidenceAsset,
    persistUpdateMilestone,
    persistUpdatePlanState,
    persistDrawSequenceUpdates,
    applyTimelineState,
    resetTimeline,
    shareMenuProps,
    sharedSnapshotLoading,
    sharedSnapshotMissing,
    share,
    prefersReducedMotion,
    workspaceInitialState,
    approveTimelinePlan,
    createTimelinePlan,
    submitTimelinePlan,
  };
}

export type TimelineWorkspaceBaseControllerModel = ReturnType<
  typeof useTimelineWorkspaceBaseController
>;
