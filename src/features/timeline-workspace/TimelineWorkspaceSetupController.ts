import {
  useCallback,
  useEffect,
} from "react";
import { toast } from "sonner";
import type {
  TimelineItem,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  buildDrawsFromActiveScenario,
  timelineSettingsRange,
} from "./-timeline-demo-settings-adapter.ts";
import { optimizeTimelineDrawSchedule } from "./-timeline-draw-optimizer.ts";
import type { TimelineSetupResult } from "./-TimelineSetupFlow.tsx";
import {
  DEFAULT_BORROWER_CO_PAY_BPS,
  getMilestoneDrawAvailabilityAmount,
  PROPOSAL_TIMELINE_MIN_DAY,
  type DemoMilestone,
  type TimelineShareState,
} from "./-timeline-share-snapshot.ts";
import { resolveMilestoneSubmilestones } from "./-timeline-milestone-submilestones.ts";
import {
  BASE_INITIAL_RANGE,
  dollarsToCents,
  expandTimelineRangeForMilestones,
  getDemoApprovalStartDate,
  INITIAL_CAPITAL_SPIKES,
  money,
} from "./TimelineWorkspaceDefaults.ts";
import {
  buildDemoDraws,
  drawSchedulesMatchForOptimization,
  relabelTimelineDraws,
} from "./TimelineWorkspaceDrawUtils.ts";
import type { TimelineWorkspaceBaseControllerModel } from "./TimelineWorkspaceBaseController.ts";

export function useTimelineWorkspaceSetupController(
  base: TimelineWorkspaceBaseControllerModel
) {
  const {
    applyTimelineState,
    approveTimelinePlan,
    canEditPlanStructure,
    canWriteLiveTimeline,
    capitalSpikes,
    createTimelinePlan,
    durablePlanId,
    draws,
    interestAnnualBps,
    items,
    liveBuildMode,
    minimumCashReserve,
    persistCreateDraw,
    persistDeleteDraw,
    persistSubmitPlan,
    persistUpdatePlanState,
    persistence,
    planStatus,
    readOnly,
    resetTimeline,
    resolvedRange,
    runDurableMutation,
    setActiveCapitalSpikeId,
    setActiveDrawId,
    setDrawEditDraft,
    setDraws,
    setLenderApprovalPending,
    setLenderApprovedBuildKey,
    setRange,
    setSetupBaseline,
    setSetupComplete,
    setSubmitConfirmOpen,
    setSubmitError,
    setSubmitPending,
    share,
    setupBaseline,
    startingCash,
    currentDay,
    progressValue,
    activeCapitalSpikeId,
    activeDrawId,
    activeSelection,
    selectedPanelOpen,
    straightLine,
    settingsTemplates,
    workspaceMode,
    durablePlanStateInitialized,
  } = base;
  const completeTimelineSetup = useCallback(
    (result: TimelineSetupResult) => {
      const settingsTemplate = settingsTemplates.find(
        (template) => template.templateKey === result.templateKey
      );
      const computedRange = settingsTemplate
        ? timelineSettingsRange(result.items)
        : expandTimelineRangeForMilestones(result.items, BASE_INITIAL_RANGE);
      const nextRange =
        workspaceMode === "proposal"
          ? {
              ...computedRange,
              min: PROPOSAL_TIMELINE_MIN_DAY,
            }
          : computedRange;
      const nextDraws = settingsTemplate
        ? buildDrawsFromActiveScenario(
            settingsTemplate,
            result.items,
            result.reimbursableBudgetCents
          )
        : buildDemoDraws(result.items, nextRange);
      const activeItem =
        result.items.find((item) => item.id === result.activeItemId) ??
        result.items[0] ??
        null;
      const nextState: TimelineShareState = {
        activeSelection: {
          itemId: activeItem?.id ?? "",
          phase: "inProgress",
        },
        capitalSpikes: INITIAL_CAPITAL_SPIKES,
        currentDay: result.currentDay,
        draws: nextDraws,
        interestAnnualBps,
        items: result.items,
        minimumCashReserve,
        progressValue: result.currentDay,
        range: nextRange,
        selectedPanelOpen: Boolean(activeItem),
        startingCash: result.startingCash,
        straightLine: true,
      };

      setSetupBaseline(nextState);
      applyTimelineState(nextState);
      setSetupComplete(true);
      void createTimelinePlan({
        actorPersona: "lender_admin",
        address: result.projectAddress,
        buildName: result.templateTitle,
        currentDay: result.currentDay,
        draws: nextDraws.map((draw, index) => ({
          amountCents: dollarsToCents(draw.amount),
          customDate: Boolean(draw.customDate),
          drawKey: draw.id,
          ...(draw.itemId ? { itemMilestoneKey: draw.itemId } : {}),
          label: draw.label,
          order: index + 1,
          requestNote: draw.requestNote,
          requestReviewNote: draw.requestReviewNote,
          requestStatus: draw.requestStatus,
          reviewedAt: draw.reviewedAt,
          requestedAt: draw.requestedAt,
          x: draw.x,
        })),
        milestones: result.items
          .filter(
            (
              item
            ): item is TimelineItem<DemoMilestone> & {
              data: DemoMilestone;
            } => Boolean(item.data)
          )
          .map((item, index) => ({
            budgetCents: dollarsToCents(item.data.amount),
            dayEnd: Math.round(item.x + item.data.durationDays),
            dayStart: Math.round(item.x),
            drawAvailabilityCents: dollarsToCents(
              getMilestoneDrawAvailabilityAmount(
                item.data,
                DEFAULT_BORROWER_CO_PAY_BPS
              )
            ),
            drawKey: item.data.draw,
            durationDays: item.data.durationDays,
            evidenceState: item.data.evidence,
            icon: item.data.icon,
            included: true,
            key: item.id,
            lane: item.lane,
            markerLabel: item.markerLabel,
            name: item.data.name,
            order: index + 1,
            policyState: item.data.policy,
            status: item.data.status,
            siteVisitGuidance: item.data.siteVisitGuidance,
            submilestones: resolveMilestoneSubmilestones(
              item.data,
              item.id
            ).map((submilestone) => ({
              ...(submilestone.budgetCents === undefined
                ? {}
                : { budgetCents: submilestone.budgetCents }),
              ...(submilestone.description
                ? { description: submilestone.description }
                : {}),
              ...(submilestone.durationDays === undefined
                ? {}
                : { durationDays: submilestone.durationDays }),
              key: submilestone.key,
              name: submilestone.name,
              order: submilestone.order,
            })),
            tone: item.tone,
            type: "timeline_demo",
            x: item.x,
          })),
        progressValue: result.currentDay,
        borrowerCoPayBps: result.borrowerCoPayBps,
        borrowerCoPayCents: result.borrowerCoPayCents,
        rangeMax: nextRange.max,
        rangeMin: nextRange.min,
        lenderDrawPolicyLimitCents: result.reimbursableBudgetCents,
        startingCashCents: dollarsToCents(result.startingCash),
        templateTitle: result.templateTitle,
        totalBudgetCents: dollarsToCents(result.totalBudget),
      })
        .then((created) => {
          console.info("Durable timeline plan created", created);
          if (result.redirectToDurableRoute) {
            window.location.assign(created.shareUrl);
          }
        })
        .catch((error) => {
          console.error("Unable to create durable timeline plan", error);
        });
      if (!result.redirectToDurableRoute) {
        window.requestAnimationFrame(() => {
          window.scrollTo({ left: 0, top: 0 });
        });
      }
    },
    [
      applyTimelineState,
      createTimelinePlan,
      interestAnnualBps,
      minimumCashReserve,
      settingsTemplates,
      workspaceMode,
    ]
  );

  const resetCurrentTimeline = useCallback(() => {
    if (!canEditPlanStructure) {
      return;
    }
    if (share || !setupBaseline) {
      resetTimeline();
      return;
    }

    applyTimelineState(setupBaseline);
  }, [
    applyTimelineState,
    canEditPlanStructure,
    resetTimeline,
    setupBaseline,
    share,
  ]);

  const optimizeCurrentScenario = useCallback(
    (exactDrawCount?: number) => {
      if (!(canWriteLiveTimeline && !liveBuildMode)) {
        toast.error("Timeline is locked in this status.");
        return;
      }

      const result = optimizeTimelineDrawSchedule({
        capitalSpikes,
        ...(exactDrawCount === undefined ? {} : { exactDrawCount }),
        interestAnnualBps,
        items,
        minimumCashReserve,
        range: resolvedRange,
        startingCash,
      });

      if (result.status === "infeasible") {
        toast.error(result.infeasibleReason);
        return;
      }

      const optimizationRunId = Date.now().toString(36);
      const nextDraws = relabelTimelineDraws(
        result.draws.map((draw, index) => ({
          ...draw,
          id: `optimized-draw-${optimizationRunId}-${index + 1}`,
        }))
      );

      if (drawSchedulesMatchForOptimization(draws, nextDraws)) {
        if (nextDraws.length === 0) {
          toast.success(
            "Scenario is already optimized; no draw is needed to maintain the minimum cash reserve."
          );
          return;
        }

        toast.success(
          `Scenario is already optimized: ${nextDraws.length} draw${
            nextDraws.length === 1 ? "" : "s"
          } minimize estimated interest and draw fees while maintaining the minimum cash reserve.`
        );
        return;
      }

      setActiveDrawId(null);
      setActiveCapitalSpikeId(null);
      setDrawEditDraft({ amount: "", x: "" });
      setDraws(nextDraws);
      const optimizedRangeMax = Math.max(
        resolvedRange.max,
        ...nextDraws.map((draw) => Math.ceil(draw.x + 1))
      );
      if (optimizedRangeMax > resolvedRange.max) {
        setRange((currentRange) => ({
          ...currentRange,
          max: optimizedRangeMax,
        }));
      }

      if (durablePlanId && persistence?.replaceDrawSchedule) {
        runDurableMutation(
          () =>
            persistence.replaceDrawSchedule?.({
              draws: nextDraws.map((draw, index) => ({
                amountCents: dollarsToCents(draw.amount),
                customDate: true,
                drawKey: draw.id,
                ...(draw.itemId ? { itemMilestoneKey: draw.itemId } : {}),
                label: draw.label,
                order: index + 1,
                x: draw.x,
              })),
              metrics: {
                drawCount: nextDraws.length,
                drawFeesCents: dollarsToCents(result.drawFees),
                interestCostCents: dollarsToCents(result.interestCost),
                totalCostCents: dollarsToCents(result.totalCost),
                totalDrawAmountCents: dollarsToCents(result.totalDrawAmount),
              },
            }),
          exactDrawCount === undefined
            ? "optimized draw replacement"
            : `exact ${exactDrawCount}-draw replacement`
        );
      } else if (durablePlanId) {
        for (const draw of draws) {
          runDurableMutation(
            () => persistDeleteDraw({ drawKey: draw.id }),
            "optimized draw replacement"
          );
        }

        nextDraws.forEach((draw, index) => {
          runDurableMutation(
            () =>
              persistCreateDraw({
                amountCents: dollarsToCents(draw.amount),
                customDate: true,
                drawKey: draw.id,
                ...(draw.itemId ? { itemMilestoneKey: draw.itemId } : {}),
                label: draw.label,
                order: index + 1,
                x: draw.x,
              }),
            "optimized draw"
          );
        });
      }

      if (nextDraws.length === 0) {
        toast.success(
          "No draw is needed to maintain the minimum cash reserve."
        );
        return;
      }

      toast.success(
        `Optimized ${nextDraws.length} draw${
          nextDraws.length === 1 ? "" : "s"
        }: ${money(result.totalCost)} total interest and fee cost.`
      );
    },
    [
      canWriteLiveTimeline,
      capitalSpikes,
      draws,
      durablePlanId,
      interestAnnualBps,
      items,
      liveBuildMode,
      minimumCashReserve,
      persistCreateDraw,
      persistDeleteDraw,
      persistence,
      resolvedRange,
      runDurableMutation,
      startingCash,
    ]
  );

  const submitCurrentPlan = useCallback(async () => {
    if (!(durablePlanId && !readOnly)) {
      return;
    }
    setSubmitPending(true);
    setSubmitError("");
    try {
      await persistSubmitPlan();
      setSubmitConfirmOpen(false);
      toast.success("Proposal submitted to lender review.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit proposal.";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSubmitPending(false);
    }
  }, [durablePlanId, persistSubmitPlan, readOnly]);

  const approveAndCloseFromLenderDemo = useCallback(async () => {
    if (!(durablePlanId && planStatus === "submitted")) {
      toast.error("This proposal is no longer awaiting approval.");
      return;
    }

    setLenderApprovalPending(true);
    try {
      const result = await approveTimelinePlan({
        adminNote: "Approved and closed from the lender demo timeline.",
        planId: durablePlanId,
        startDate: getDemoApprovalStartDate(),
      });
      if (typeof result?.buildKey === "string") {
        setLenderApprovedBuildKey(result.buildKey);
      }
      toast.success("Proposal approved. Live build is ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approval failed.");
    } finally {
      setLenderApprovalPending(false);
    }
  }, [approveTimelinePlan, durablePlanId, planStatus]);

  useEffect(() => {
    if (share) {
      setSetupComplete(true);
    }
  }, [share]);
  useEffect(() => {
    if (!(durablePlanId && !readOnly)) {
      return;
    }
    if (!durablePlanStateInitialized.current) {
      durablePlanStateInitialized.current = true;
      return;
    }
    const timeout = window.setTimeout(() => {
      runDurableMutation(
        () =>
          persistUpdatePlanState({
            currentDay,
            progressValue,
            rangeMax: resolvedRange.max,
            rangeMin: resolvedRange.min,
            routeState: {
              activeCapitalSpikeId: activeCapitalSpikeId ?? undefined,
              activeDrawId: activeDrawId ?? undefined,
              activeMilestoneKey: activeSelection.itemId,
              selectedPanelOpen,
              straightLine,
            },
            minimumCashReserveCents: dollarsToCents(minimumCashReserve),
            startingCashCents: dollarsToCents(startingCash),
          }),
        "timeline state"
      );
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [
    activeCapitalSpikeId,
    activeDrawId,
    activeSelection.itemId,
    currentDay,
    durablePlanId,
    progressValue,
    readOnly,
    resolvedRange.max,
    resolvedRange.min,
    persistUpdatePlanState,
    runDurableMutation,
    selectedPanelOpen,
    minimumCashReserve,
    startingCash,
    straightLine,
  ]);

  return {
    approveAndCloseFromLenderDemo,
    completeTimelineSetup,
    optimizeCurrentScenario,
    resetCurrentTimeline,
    submitCurrentPlan,
  };
}

export type TimelineWorkspaceSetupControllerModel = ReturnType<
  typeof useTimelineWorkspaceSetupController
>;
