import { toast } from "sonner";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { insertTimelineItemWithSpacing } from "#/components/roadmap/animated-curved-timeline-utils.ts";
import { type MilestoneCardUpdate } from "./-MilestoneCard.tsx";
import {
  DEFAULT_MILESTONE_DURATION_DAYS,
  getMilestoneEndX,
  normalizeMilestoneTimelineItems,
} from "./-timeline-milestone-schedule.ts";
import { resolveMilestoneSubmilestones, submilestoneNames } from "./-timeline-milestone-submilestones.ts";
import {
  DEFAULT_BORROWER_CO_PAY_BPS,
  getMilestoneDrawAvailabilityAmount,
  PROPOSAL_TIMELINE_MIN_DAY,
  type DemoCapitalSpike,
  type DemoDraw,
  type DemoMilestone,
} from "./-timeline-share-snapshot.ts";
import {
  dollarsToCents,
  expandTimelineRangeForMilestones,
} from "./TimelineWorkspaceDefaults.ts";
import {
  DRAW_UNLOCK_CAPACITY_BLOCKED_MESSAGE,
  findTimelineItemForDay,
  getMaxSchedulableDrawAmount,
  relabelTimelineDraws,
  syncDemoDrawsWithItems,
  timelineItemToMilestoneMutationInput,
} from "./TimelineWorkspaceDrawUtils.ts";
import type {
  TimelineModificationRequestView,
} from "./TimelineWorkspaceTypes.ts";
import type { TimelineWorkspaceBaseControllerModel } from "./TimelineWorkspaceBaseController.ts";

export function createTimelineWorkspacePlanActions(
  base: TimelineWorkspaceBaseControllerModel
) {
  const {
    activeItemId,
    activeSelection,
    approvedDrawLimit,
    canEditPlanStructure,
    canWriteLiveTimeline,
    capitalSpikes,
    draws,
    durablePlanId,
    insertions: {
      capitalSpikeInsertionCount,
      drawInsertionCount,
      insertionCount,
      pendingCapitalEventIds,
      pendingExpandedRange,
      pendingNormalizedInsertSelection,
    },
    items,
    interestAnnualBps,
    liveBuildMode,
    modificationRequests,
    progressValue,
    persistCreateCapitalEvent,
    persistCreateCashInfusion,
    persistCreateDraw,
    persistCreateMilestone,
    persistDeleteCapitalEvent,
    persistDeleteDraw,
    persistDeleteMilestone,
    persistDrawSequenceUpdates,
    persistRequestModification,
    persistUpdateMilestone,
    range,
    resolvedRange,
    runDurableMutation,
    setActiveCapitalSpikeId,
    setActiveDrawId,
    setActiveSelection,
    setCapitalSpikeEditDraft,
    setCapitalSpikes,
    setDrawEditDraft,
    setDraws,
    setItems,
    setModificationRequests,
    setProbeValue,
    setProgressValue,
    setRange,
    setSelectedPanelOpen,
    } = base;
  const openDrawEditor = (draw: DemoDraw) => {
    setActiveCapitalSpikeId(null);
    setActiveDrawId(draw.id);
    setSelectedPanelOpen(true);
    setProbeValue(Math.round(draw.x));
    setDrawEditDraft({
      amount: String(draw.amount),
      x: String(Math.round(draw.x)),
    });
  };

  const openCapitalSpikeEditor = (spike: DemoCapitalSpike) => {
    setActiveDrawId(null);
    setActiveCapitalSpikeId(spike.id);
    setSelectedPanelOpen(false);
    setCapitalSpikeEditDraft({
      amount: String(spike.amount),
      interestAnnualPercent:
        spike.interestAnnualBps === undefined
          ? ""
          : String(spike.interestAnnualBps / 100),
      label: spike.label,
      x: String(Math.round(spike.x)),
    });
  };

  const addLocalModificationRequest = (
    request: TimelineModificationRequestView
  ) => {
    setModificationRequests((current) => [request, ...current]);
  };

  const requestMilestoneCreation = (requestedX: number) => {
    if (requestedX < 0) {
      toast.error("Construction milestones cannot start before T0.");
      return;
    }
    insertionCount.current += 1;
    const count = insertionCount.current;
    const lane = count % 3 === 0 ? 1 : count % 2 === 0 ? -1 : 0;
    const milestone = {
      budgetCents: dollarsToCents(95_000 + count * 12_500),
      dayEnd: requestedX + DEFAULT_MILESTONE_DURATION_DAYS,
      dayStart: requestedX,
      durationDays: DEFAULT_MILESTONE_DURATION_DAYS,
      evidenceState: "Requested change",
      icon: "change",
      included: true,
      lane,
      markerLabel: "+",
      milestoneKey: `requested-${Date.now()}-${count}`,
      name: `Requested field change ${count}`,
      order: items.length + modificationRequests.length + 1,
      policyState: "Admin approval required",
      status: "ready",
      submilestones: [
        { name: "Scope estimate" },
        { name: "Schedule alignment" },
        { name: "Draw planning" },
      ],
      tone: "warning",
      type: "timeline_demo",
      x: requestedX,
    };
    const optimisticRequest = {
      requestedPayload: { milestone },
      requestType: "createMilestone",
      status: "requested",
    } satisfies TimelineModificationRequestView;
    addLocalModificationRequest(optimisticRequest);
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistRequestModification({
            reason: "Builder requested a live-build milestone change.",
            requestedPayload: { milestone },
            requestType: "createMilestone",
          }),
        "milestone modification request"
      );
    }
  };

  const createInsertedMilestoneItem = (requestedX: number) => {
    insertionCount.current += 1;
    const count = insertionCount.current;
    const lane = count % 3 === 0 ? 1 : count % 2 === 0 ? -1 : 0;

    return {
      data: {
        amount: 95_000 + count * 12_500,
        draw: `Inserted ${count}`,
        durationDays: DEFAULT_MILESTONE_DURATION_DAYS,
        evidence: "Draft package",
        icon: "change",
        name: `Field change ${count}`,
        policy: "Needs sequencing",
        status: "ready",
        subMilestones: [
          "Scope estimate",
          "Schedule alignment",
          "Draw planning",
        ],
      },
      eyebrow: "Inserted milestone",
      id: `inserted-${Date.now()}-${count}`,
      label: `Field change ${count}`,
      lane,
      markerLabel: "+",
      tone: "warning",
      x: requestedX,
    } satisfies TimelineItem<DemoMilestone>;
  };

  const addPlanMilestone = (requestedX: number) => {
    if (!canEditPlanStructure) {
      return;
    }

    const requestedDay = Math.round(requestedX);
    if (requestedDay < 0) {
      toast.error("Construction milestones cannot start before T0.");
      return;
    }
    const createdItem = createInsertedMilestoneItem(requestedDay);
    const result = insertTimelineItemWithSpacing(items, createdItem, {
      minGap: 14,
      range: resolvedRange,
    });
    const normalizedItems = normalizeMilestoneTimelineItems(result.items);
    const expandedRange = expandTimelineRangeForMilestones(
      normalizedItems,
      result.range
    );
    const normalizedInsertedItem =
      normalizedItems.find((item) => item.id === result.insertedItem.id) ??
      result.insertedItem;

    pendingNormalizedInsertSelection.current = {
      itemId: normalizedInsertedItem.id,
      x: normalizedInsertedItem.x,
    };
    pendingExpandedRange.current = expandedRange;
    setSelectedPanelOpen(true);
    setActiveDrawId(null);
    setActiveCapitalSpikeId(null);
    setItems(normalizedItems);
    setDraws((currentDraws) =>
      syncDemoDrawsWithItems(currentDraws, normalizedItems, expandedRange)
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistCreateMilestone({
            milestone: timelineItemToMilestoneMutationInput(
              normalizedInsertedItem,
              normalizedItems.findIndex(
                (item) => item.id === normalizedInsertedItem.id
              ) + 1
            ),
          }),
        "milestone creation"
      );
    }
  };

  const addManualDraw = (requestedX: number) => {
    if (!canWriteLiveTimeline) {
      return;
    }
    if (requestedX < 0) {
      toast.error("Reimbursement draws cannot be scheduled before T0.");
      return;
    }
    drawInsertionCount.current += 1;
    const count = drawInsertionCount.current;
    const owner = findTimelineItemForDay(items, requestedX);
    const nextDrawId = `manual-draw-${Date.now()}-${count}`;
    const maxSchedulableAmount = getMaxSchedulableDrawAmount(
      requestedX,
      items,
      draws,
      { proposedDrawId: nextDrawId },
      approvedDrawLimit
    );

    if (maxSchedulableAmount <= 0) {
      toast.error(DRAW_UNLOCK_CAPACITY_BLOCKED_MESSAGE);
      return;
    }

    const nextDraw = {
      amount: Math.min(100_000, maxSchedulableAmount),
      customDate: true,
      id: nextDrawId,
      ...(owner ? { itemId: owner.id } : {}),
      label: `Draw ${draws.length + 1}`,
      x: requestedX,
    } satisfies DemoDraw;
    const nextDraws = relabelTimelineDraws([...draws, nextDraw]);
    const sequencedNextDraw =
      nextDraws.find((draw) => draw.id === nextDraw.id) ?? nextDraw;

    setActiveDrawId(null);
    setActiveCapitalSpikeId(null);
    setDraws((currentDraws) =>
      relabelTimelineDraws([...currentDraws, nextDraw])
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistCreateDraw({
            amountCents: dollarsToCents(sequencedNextDraw.amount),
            customDate: true,
            drawKey: sequencedNextDraw.id,
            ...(sequencedNextDraw.itemId
              ? { itemMilestoneKey: sequencedNextDraw.itemId }
              : {}),
            label: sequencedNextDraw.label,
            order: nextDraws.findIndex((draw) => draw.id === nextDraw.id) + 1,
            x: sequencedNextDraw.x,
          }),
        "draw"
      );
      persistDrawSequenceUpdates(draws, nextDraws, new Set([nextDraw.id]));
    }
  };

  const addCapitalSpike = (requestedX: number) => {
    if (!canWriteLiveTimeline) {
      return;
    }
    capitalSpikeInsertionCount.current += 1;
    const count = capitalSpikeInsertionCount.current;
    const nextSpike = {
      amount: 35_000,
      eventKind: "cost",
      id: `capital-spike-${Date.now()}-${count}`,
      label: `Capital spike ${count}`,
      x: requestedX,
    } satisfies DemoCapitalSpike;

    setActiveDrawId(null);
    setActiveCapitalSpikeId(null);
    setCapitalSpikes((currentSpikes) =>
      [...currentSpikes, nextSpike].sort(
        (a, b) => a.x - b.x || a.id.localeCompare(b.id)
      )
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistCreateCapitalEvent({
            amountCents: dollarsToCents(nextSpike.amount),
            capitalEventKey: nextSpike.id,
            eventKind: "cost",
            label: nextSpike.label,
            order: capitalSpikes.length + 1,
            x: nextSpike.x,
          }),
        "capital event"
      );
    }
  };

  const addCashInfusion = (requestedX: number) => {
    if (!canWriteLiveTimeline) {
      return;
    }
    capitalSpikeInsertionCount.current += 1;
    const count = capitalSpikeInsertionCount.current;
    const nextInfusion = {
      amount: 50_000,
      eventKind: "cashInfusion",
      id: `cash-infusion-${Date.now()}-${count}`,
      label: `Cash infusion ${count}`,
      x: requestedX,
    } satisfies DemoCapitalSpike;

    setActiveDrawId(null);
    setActiveCapitalSpikeId(null);
    setCapitalSpikes((currentSpikes) =>
      [...currentSpikes, nextInfusion].sort(
        (a, b) => a.x - b.x || a.id.localeCompare(b.id)
      )
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistCreateCashInfusion({
            amountCents: dollarsToCents(nextInfusion.amount),
            cashInfusionKey: nextInfusion.id,
            label: nextInfusion.label,
            order: capitalSpikes.length + 1,
            x: nextInfusion.x,
          }),
        "cash infusion"
      );
    }
  };

  const addHomeEquityTakeout = (requestedX: number) => {
    if (!(canWriteLiveTimeline && !liveBuildMode)) {
      return;
    }
    capitalSpikeInsertionCount.current += 1;
    const count = capitalSpikeInsertionCount.current;
    const nextTakeout = {
      amount: 50_000,
      eventKind: "homeEquityTakeout",
      id: `home-equity-takeout-${Date.now()}-${count}`,
      interestAnnualBps,
      label: `Home Equity Takeout ${count}`,
      x: Math.max(PROPOSAL_TIMELINE_MIN_DAY, Math.round(requestedX)),
    } satisfies DemoCapitalSpike;

    pendingCapitalEventIds.current.add(nextTakeout.id);
    setCapitalSpikes((currentSpikes) =>
      [...currentSpikes, nextTakeout].sort(
        (a, b) => a.x - b.x || a.id.localeCompare(b.id)
      )
    );
    openCapitalSpikeEditor(nextTakeout);
  };

  const deleteDraw = (drawId: string) => {
    if (!canWriteLiveTimeline) {
      toast.error("Timeline is locked in this status.");
      return;
    }
    const targetDraw = draws.find((draw) => draw.id === drawId);
    if (targetDraw?.requestStatus === "approved") {
      toast.error("Approved reimbursement draws cannot be deleted.");
      return;
    }

    const nextDraws = relabelTimelineDraws(
      draws.filter((draw) => draw.id !== drawId)
    );
    setActiveDrawId(null);
    setDraws((currentDraws) =>
      relabelTimelineDraws(currentDraws.filter((draw) => draw.id !== drawId))
    );
    if (durablePlanId) {
      runDurableMutation(
        () => persistDeleteDraw({ drawKey: drawId }),
        "draw deletion"
      );
      persistDrawSequenceUpdates(draws, nextDraws);
    }
  };

  const deleteCapitalSpike = (spikeId: string) => {
    if (!canWriteLiveTimeline) {
      toast.error("Timeline is locked in this status.");
      return;
    }
    setActiveCapitalSpikeId(null);
    setCapitalSpikes((currentSpikes) =>
      currentSpikes.filter((spike) => spike.id !== spikeId)
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistDeleteCapitalEvent({
            capitalEventKey: spikeId,
          }),
        "capital event deletion"
      );
    }
  };

  const deleteMilestone = (itemId: string) => {
    if (liveBuildMode) {
      const targetItem = items.find((item) => item.id === itemId);
      if (!targetItem?.data) {
        return;
      }
      const optimisticRequest = {
        milestoneKey: itemId,
        reason: "Builder requested milestone deletion.",
        requestedPayload: {},
        requestType: "deleteMilestone",
        status: "requested",
      } satisfies TimelineModificationRequestView;
      addLocalModificationRequest(optimisticRequest);
      if (durablePlanId) {
        runDurableMutation(
          () =>
            persistRequestModification({
              milestoneKey: itemId,
              reason: "Builder requested milestone deletion.",
              requestedPayload: {},
              requestType: "deleteMilestone",
            }),
          "milestone deletion request"
        );
      }
      return;
    }
    if (!canEditPlanStructure) {
      toast.error("Proposal structure is locked after submission.");
      return;
    }
    const targetItem = items.find((item) => item.id === itemId);

    if (!targetItem) {
      return;
    }

    const nextItems = normalizeMilestoneTimelineItems(
      items.filter((item) => item.id !== targetItem.id)
    );
    const nextRange = expandTimelineRangeForMilestones(nextItems, range);
    setItems(nextItems);
    setRange(nextRange);
    setDraws((currentDraws) =>
      syncDemoDrawsWithItems(currentDraws, nextItems, nextRange)
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistDeleteMilestone({
            milestoneKey: targetItem.id,
          }),
        "milestone deletion"
      );
    }

    if (activeItemId === targetItem.id) {
      const replacementItem =
        nextItems.find((item) => item.x >= targetItem.x) ??
        nextItems.at(-1) ??
        null;
      setActiveSelection({
        itemId: replacementItem?.id ?? "",
        phase: "inProgress",
      });
      setProgressValue(replacementItem?.x ?? nextRange.min);
      setSelectedPanelOpen(Boolean(replacementItem));
    }
  };

  const updateMilestone = (itemId: string, patch: MilestoneCardUpdate) => {
    if (!canWriteLiveTimeline) {
      return;
    }
    const targetItem = items.find((item) => item.id === itemId);

    if (!targetItem?.data) {
      return;
    }

    const requestedBudgetAmount = patch.amount;
    if (liveBuildMode && requestedBudgetAmount !== undefined) {
      const optimisticRequest = {
        milestoneKey: itemId,
        reason: "Builder requested milestone budget change.",
        requestedPayload: { budgetCents: dollarsToCents(requestedBudgetAmount) },
        requestType: "updateMilestoneBudget",
        status: "requested",
      } satisfies TimelineModificationRequestView;
      addLocalModificationRequest(optimisticRequest);
      if (durablePlanId) {
        runDurableMutation(
          () =>
            persistRequestModification({
              milestoneKey: itemId,
              reason: "Builder requested milestone budget change.",
              requestedPayload: {
                budgetCents: dollarsToCents(requestedBudgetAmount),
              },
              requestType: "updateMilestoneBudget",
            }),
          "milestone budget request"
        );
      }
      return;
    }

    const nextItems = normalizeMilestoneTimelineItems(
      items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              data: item.data
                ? {
                    ...item.data,
                    ...(patch.amount === undefined
                      ? {}
                      : { amount: patch.amount }),
                    ...(patch.drawAvailabilityAmount === undefined
                      ? {}
                      : {
                          drawAvailabilityAmount: patch.drawAvailabilityAmount,
                        }),
                    ...(patch.durationDays === undefined
                      ? {}
                      : { durationDays: patch.durationDays }),
                    ...(patch.initialPaymentAmount === undefined
                      ? {}
                      : { initialPaymentAmount: patch.initialPaymentAmount }),
                  }
                : item.data,
              x: patch.x ?? item.x,
            }
          : item
      )
    );
    const nextRange = expandTimelineRangeForMilestones(nextItems, range);

    setItems(nextItems);
    setRange(nextRange);
    setDraws((currentDraws) =>
      syncDemoDrawsWithItems(currentDraws, nextItems, nextRange)
    );
    if (durablePlanId) {
      const nextItem = nextItems.find((item) => item.id === itemId);
      if (nextItem) {
        runDurableMutation(
          () =>
            persistUpdateMilestone({
              ...timelineItemToMilestoneMutationInput(
                nextItem,
                nextItems.findIndex((item) => item.id === itemId) + 1
              ),
            }),
          "milestone update"
        );
      }
    }

    if (activeItemId === itemId) {
      const nextActiveItem = nextItems.find((item) => item.id === itemId);
      setProgressValue(
        activeSelection.phase === "complete" && nextActiveItem
          ? getMilestoneEndX(nextActiveItem)
          : (nextActiveItem?.x ?? patch.x ?? progressValue)
      );
    }
  };

  const updateSubmilestoneBudget = (
    itemId: string,
    submilestoneKey: string,
    budgetCents: number
  ) => {
    if (!(canWriteLiveTimeline && !liveBuildMode)) {
      return;
    }
    const targetItem = items.find((item) => item.id === itemId);

    if (!targetItem?.data) {
      return;
    }

    const currentSubmilestones = resolveMilestoneSubmilestones(
      targetItem.data,
      itemId
    );
    const targetSubmilestone = currentSubmilestones.find(
      (submilestone) => submilestone.key === submilestoneKey
    );

    if (!targetSubmilestone) {
      return;
    }

    const nextBudgetCents = Math.max(0, Math.round(budgetCents));
    const currentAmount = Math.max(0, Math.round(targetItem.data.amount));
    const currentDrawAvailability = getMilestoneDrawAvailabilityAmount(
      targetItem.data,
      DEFAULT_BORROWER_CO_PAY_BPS
    );
    const drawAvailabilityRatio =
      currentAmount > 0 ? currentDrawAvailability / currentAmount : 0;
    const nextSubmilestones = currentSubmilestones.map((submilestone) =>
      submilestone.key === submilestoneKey
        ? { ...submilestone, budgetCents: nextBudgetCents }
        : submilestone
    );
    const nextAmount = Math.round(
      nextSubmilestones.reduce(
        (total, submilestone) =>
          total + Math.max(0, Math.round(submilestone.budgetCents ?? 0)),
        0
      ) / 100
    );
    const nextDrawAvailabilityAmount = Math.max(
      0,
      Math.round(nextAmount * drawAvailabilityRatio)
    );
    const nextItems = normalizeMilestoneTimelineItems(
      items.map((item) =>
        item.id === itemId && item.data
          ? {
              ...item,
              data: {
                ...item.data,
                amount: nextAmount,
                drawAvailabilityAmount: nextDrawAvailabilityAmount,
                subMilestones: submilestoneNames(nextSubmilestones),
                submilestoneDetails: nextSubmilestones,
              },
            }
          : item
      )
    );
    const nextRange = expandTimelineRangeForMilestones(nextItems, range);

    setItems(nextItems);
    setRange(nextRange);
    setDraws((currentDraws) =>
      syncDemoDrawsWithItems(currentDraws, nextItems, nextRange)
    );

    if (durablePlanId) {
      const nextItem = nextItems.find((item) => item.id === itemId);
      if (nextItem) {
        runDurableMutation(
          () =>
            persistUpdateMilestone({
              ...timelineItemToMilestoneMutationInput(
                nextItem,
                nextItems.findIndex((item) => item.id === itemId) + 1
              ),
            }),
          "sub-milestone budget update"
        );
      }
    }
  };

  const updateSubmilestoneDuration = (
    itemId: string,
    submilestoneKey: string,
    durationDays: number
  ) => {
    if (!(canWriteLiveTimeline && !liveBuildMode)) {
      return;
    }
    const targetItem = items.find((item) => item.id === itemId);

    if (!targetItem?.data) {
      return;
    }

    const currentSubmilestones = resolveMilestoneSubmilestones(
      targetItem.data,
      itemId
    );
    const targetSubmilestone = currentSubmilestones.find(
      (submilestone) => submilestone.key === submilestoneKey
    );

    if (!targetSubmilestone) {
      return;
    }

    const nextDurationDays = Math.max(1, Math.round(durationDays));
    const nextSubmilestones = currentSubmilestones.map((submilestone) =>
      submilestone.key === submilestoneKey
        ? { ...submilestone, durationDays: nextDurationDays }
        : submilestone
    );
    const nextMilestoneDurationDays = Math.max(
      1,
      nextSubmilestones.reduce(
        (total, submilestone) =>
          total + Math.max(1, Math.round(submilestone.durationDays ?? 1)),
        0
      )
    );
    const nextItems = normalizeMilestoneTimelineItems(
      items.map((item) =>
        item.id === itemId && item.data
          ? {
              ...item,
              data: {
                ...item.data,
                durationDays: nextMilestoneDurationDays,
                subMilestones: submilestoneNames(nextSubmilestones),
                submilestoneDetails: nextSubmilestones,
              },
            }
          : item
      )
    );
    const nextRange = expandTimelineRangeForMilestones(nextItems, range);

    setItems(nextItems);
    setRange(nextRange);
    setDraws((currentDraws) =>
      syncDemoDrawsWithItems(currentDraws, nextItems, nextRange)
    );

    if (durablePlanId) {
      const nextItem = nextItems.find((item) => item.id === itemId);
      if (nextItem) {
        runDurableMutation(
          () =>
            persistUpdateMilestone({
              ...timelineItemToMilestoneMutationInput(
                nextItem,
                nextItems.findIndex((item) => item.id === itemId) + 1
              ),
            }),
          "sub-milestone duration update"
        );
      }
    }
  };


  return {
    addCapitalSpike,
    addCashInfusion,
    addHomeEquityTakeout,
    addManualDraw,
    addPlanMilestone,
    deleteCapitalSpike,
    deleteDraw,
    deleteMilestone,
    createInsertedMilestoneItem,
    openCapitalSpikeEditor,
    openDrawEditor,
    requestMilestoneCreation,
    updateMilestone,
    updateSubmilestoneBudget,
    updateSubmilestoneDuration,
  };
}

export type TimelineWorkspacePlanActions = ReturnType<
  typeof createTimelineWorkspacePlanActions
>;
