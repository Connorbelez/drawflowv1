import type { FormEvent } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { toast } from "sonner";
import { getMilestoneEndX } from "./-timeline-milestone-schedule.ts";
import { clampUnit } from "./TimelineWorkspaceSharing.tsx";
import {
  dollarsToCents,
  resolveDemoLiveBuildHref,
} from "./TimelineWorkspaceDefaults.ts";
import { clampNumber } from "./TimelineWorkspaceDrawUtils.ts";
import type { TimelineWorkspaceBaseControllerModel } from "./TimelineWorkspaceBaseController.ts";

export function useTimelineWorkspaceCapitalActions(
  base: TimelineWorkspaceBaseControllerModel
) {
  const {
    activeCapitalSpikeId,
    canEditPlanStructure,
    canWriteLiveTimeline,
    capitalSpikes,
    capitalSpikeEditDraft,
    collaboration,
    demoMode,
    durableMeta,
    durablePlanId,
    draws,
    items,
    lenderApprovedBuildKey,
    liveBuildMode,
    lockedBannerActions,
    insertions: { pendingCapitalEventIds },
    persistCreateCapitalEvent,
    persistUpdateCapitalEvent,
    planStatus,
    resolvedRange,
    runDurableMutation,
    setActiveCapitalSpikeId,
    setActiveDrawId,
    setActiveSelection,
    setCapitalSpikes,
    setMobileDetailDrawerRequested,
    setMobileEditDrawId,
    setProbeValue,
    setProgressValue,
    setSelectedDay,
    setSelectedPanelOpen,
    timelineRole,
    mobileEditBudgetItemId,
    mobileEditDatesItemId,
    mobileEditDrawId,
  } = base;
  const applyCapitalSpikeEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEditPlanStructure) {
      toast.error("Proposal structure is locked after submission.");
      return;
    }
    if (!activeCapitalSpikeId) {
      return;
    }
    const targetSpike = capitalSpikes.find(
      (spike) => spike.id === activeCapitalSpikeId
    );
    if (!targetSpike) {
      return;
    }
    const isHomeEquityTakeout = targetSpike.eventKind === "homeEquityTakeout";

    const formData = new FormData(event.currentTarget);
    const nextAmount = Math.max(
      0,
      Math.round(
        Number(
          formData.get("capitalSpikeAmount") ?? capitalSpikeEditDraft.amount
        )
      )
    );
    const nextX = Math.max(
      resolvedRange.min,
      Math.min(
        resolvedRange.max,
        Math.round(
          Number(formData.get("capitalSpikeDate") ?? capitalSpikeEditDraft.x)
        )
      )
    );
    const nextLabel =
      String(
        formData.get("capitalSpikeLabel") ?? capitalSpikeEditDraft.label
      ).trim() || "Capital spike";
    const nextInterestAnnualBps = isHomeEquityTakeout
      ? Math.round(
          Number(
            formData.get("capitalSpikeInterestAnnualPercent") ??
              capitalSpikeEditDraft.interestAnnualPercent
          ) * 100
        )
      : undefined;

    if (
      !(
        Number.isFinite(nextAmount) &&
        Number.isFinite(nextX) &&
        (!isHomeEquityTakeout ||
          (nextAmount > 0 &&
            nextInterestAnnualBps !== undefined &&
            Number.isFinite(nextInterestAnnualBps) &&
            nextInterestAnnualBps >= 0 &&
            nextInterestAnnualBps <= 10_000))
      )
    ) {
      toast.error(
        isHomeEquityTakeout
          ? "Enter a positive takeout amount and an annual interest rate between 0% and 100%."
          : "Enter a valid capital event amount and date."
      );
      return;
    }

    setCapitalSpikes((currentSpikes) =>
      currentSpikes
        .map((spike) =>
          spike.id === activeCapitalSpikeId
            ? {
                ...spike,
                amount: nextAmount,
                ...(nextInterestAnnualBps === undefined
                  ? {}
                  : { interestAnnualBps: nextInterestAnnualBps }),
                label: nextLabel,
                x: nextX,
              }
            : spike
        )
        .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))
    );
    if (durablePlanId) {
      const mutationInput = {
        amountCents: dollarsToCents(nextAmount),
        capitalEventKey: activeCapitalSpikeId,
        eventKind: targetSpike.eventKind ?? "cost",
        ...(nextInterestAnnualBps === undefined
          ? {}
          : { interestAnnualBps: nextInterestAnnualBps }),
        label: nextLabel,
        order:
          capitalSpikes.findIndex(
            (spike) => spike.id === activeCapitalSpikeId
          ) + 1,
        x: nextX,
      };
      if (pendingCapitalEventIds.current.has(activeCapitalSpikeId)) {
        runDurableMutation(
          () => persistCreateCapitalEvent(mutationInput),
          "home equity takeout"
        );
        pendingCapitalEventIds.current.delete(activeCapitalSpikeId);
      } else {
        runDurableMutation(
          () => persistUpdateCapitalEvent(mutationInput),
          "capital event update"
        );
      }
    }
    setActiveCapitalSpikeId(null);
  };

  const cancelCapitalSpikeEdit = () => {
    if (
      activeCapitalSpikeId &&
      pendingCapitalEventIds.current.has(activeCapitalSpikeId)
    ) {
      pendingCapitalEventIds.current.delete(activeCapitalSpikeId);
      setCapitalSpikes((currentSpikes) =>
        currentSpikes.filter((spike) => spike.id !== activeCapitalSpikeId)
      );
    }
    setActiveCapitalSpikeId(null);
  };
  // --- Mobile (max-md) day dial + drawer handlers ------------------------
  const mobileFeedItems = useMemo(
    () => items.filter((item) => item.data),
    [items]
  );
  const handleMobileDayChange = useCallback(
    (day: number) => {
      const nextDay = clampNumber(
        Math.round(day),
        resolvedRange.min,
        resolvedRange.max
      );
      setSelectedDay(nextDay);
      setProgressValue(nextDay);
      setProbeValue(null);
      const activeMilestone = mobileFeedItems.find((item) => {
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
    [mobileFeedItems, resolvedRange.max, resolvedRange.min]
  );
  const handleMobileOpenDraw = useCallback(
    (drawId: string) => {
      const owner = draws.find((draw) => draw.id === drawId);
      // Mirror desktop: inline timing/amount editing is available only when the
      // plan is not in live-execution mode. In live mode draws are requested or
      // reviewed through the action panel, not directly repositioned.
      if (canWriteLiveTimeline && !liveBuildMode) {
        setMobileEditDrawId(drawId);
        return;
      }
      setActiveDrawId(drawId);
      setActiveCapitalSpikeId(null);
      if (owner?.itemId) {
        setActiveSelection({ itemId: owner.itemId, phase: "inProgress" });
      }
      setMobileDetailDrawerRequested(true);
      setSelectedPanelOpen(true);
    },
    [canWriteLiveTimeline, draws, liveBuildMode]
  );
  const handleMobileOpenCapitalEvent = useCallback((capitalSpikeId: string) => {
    setActiveCapitalSpikeId(capitalSpikeId);
    setActiveDrawId(null);
    setMobileDetailDrawerRequested(true);
    setSelectedPanelOpen(true);
  }, []);
  const handleMobileOpenMilestoneDrawer = useCallback((itemId: string) => {
    setActiveDrawId(null);
    setActiveCapitalSpikeId(null);
    setActiveSelection({ itemId, phase: "inProgress" });
    setMobileDetailDrawerRequested(true);
    setSelectedPanelOpen(true);
  }, []);
  const mobileEditDatesItem =
    items.find((item) => item.id === mobileEditDatesItemId) ?? null;
  const mobileEditBudgetItem =
    items.find((item) => item.id === mobileEditBudgetItemId) ?? null;
  const mobileEditDraw =
    draws.find((draw) => draw.id === mobileEditDrawId) ?? null;

  useEffect(() => {
    const onCursorChange = collaboration?.onCursorChange;
    if (!onCursorChange || typeof window === "undefined") {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      onCursorChange({
        x: clampUnit(event.clientX / width),
        y: clampUnit(event.clientY / height),
      });
    };
    const clearCursor = () => onCursorChange(null);
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearCursor();
      }
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    window.addEventListener("blur", clearCursor);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("blur", clearCursor);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearCursor();
    };
  }, [collaboration?.onCursorChange]);

  const lenderLiveBuildHref = resolveDemoLiveBuildHref({
    buildKey: lenderApprovedBuildKey ?? durableMeta?.buildKey,
    liveBuildHref: durableMeta?.liveBuildHref,
  });
  const showLenderDealControls = Boolean(
    demoMode && durableMeta && timelineRole === "lender"
  );
  const showLenderApproveCta = Boolean(
    showLenderDealControls &&
      planStatus === "submitted" &&
      !lenderApprovedBuildKey
  );
  const hasLockedBannerActions = Boolean(lockedBannerActions);
  const showLenderLiveBuildLink = Boolean(
    showLenderDealControls &&
      lenderLiveBuildHref &&
      (planStatus === "approved" || lenderApprovedBuildKey)
  );


  return {
    applyCapitalSpikeEdit,
    cancelCapitalSpikeEdit,
    handleMobileDayChange,
    handleMobileOpenCapitalEvent,
    handleMobileOpenDraw,
    handleMobileOpenMilestoneDrawer,
    hasLockedBannerActions,
    lenderLiveBuildHref,
    mobileEditBudgetItem,
    mobileEditDatesItem,
    mobileEditDraw,
    mobileFeedItems,
    showLenderApproveCta,
    showLenderDealControls,
    showLenderLiveBuildLink,
  };
}

export type TimelineWorkspaceCapitalActions = ReturnType<
  typeof useTimelineWorkspaceCapitalActions
>;
