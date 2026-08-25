import {
  AlertTriangle,
  Banknote,
  CircleDollarSign,
  Flag,
  House,
} from "lucide-react";
import { motion } from "motion/react";
import {
  lazy,
  Suspense,
} from "react";
import {
  AnimatedCurvedTimeline,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { TimelineEndNodeButton } from "./-TimelineEndNodeButton.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Switch } from "#/components/ui/switch.tsx";
import { MobileTimelineDayDialWorkspace } from "./MobileTimelineWorkspace.tsx";
import { MilestoneCard } from "./-MilestoneCard.tsx";
import { normalizeMilestoneTimelineItems, getMilestoneEndX } from "./-timeline-milestone-schedule.ts";
import { hasCompletionClaim, formatTimelineDay, getMaxSchedulableDrawAmount, syncDemoDrawsWithItems, timelineItemToMilestoneMutationInput } from "./TimelineWorkspaceDrawUtils.ts";
import { formatCompactMoney } from "./TimelineWorkspaceChartMath.ts";
import { expandTimelineRangeForMilestones, money, routeSectionVariants } from "./TimelineWorkspaceDefaults.ts";
import { useTimelineWorkspaceContext } from "./TimelineWorkspaceContext.tsx";
import {
  ResponsiveAnalyticsDisclosure,
} from "./TimelineWorkspaceSharing.tsx";
import { TimelineWorkspaceMobileOverlays } from "./TimelineWorkspaceMobileOverlays.tsx";
import {
  DrawAvailabilityDeltaReadout,
  DrawAvailabilityMetrics,
} from "./TimelineWorkspaceCompletionPanels.tsx";
import {
  CapitalSpikeTimelineMarker,
  DrawTimelineMarker,
  MilestoneRequestBadges,
  TimelineDeleteContextMenu,
  TimelineMarkerBadge,
  TimelineNodeButton,
} from "./TimelineWorkspaceMarkers.tsx";
import type { DemoMilestone } from "./-timeline-share-snapshot.ts";

const TimelineCashflowCompoundChart = lazy(() =>
  import("./-TimelineCashflowCompoundChart.tsx").then((m) => ({
    default: m.TimelineCashflowCompoundChart,
  }))
);
const TimelineDrawAvailabilityChart = lazy(() =>
  import("./-TimelineDrawAvailabilityChart.tsx").then((m) => ({
    default: m.TimelineDrawAvailabilityChart,
  }))
);

export function TimelineWorkspaceMainColumn() {
  const {
    activeCapitalSpikeId,
    activeDrawId,
    activeItemId,
    activeSelection,
    addCapitalSpike,
    addCashInfusion,
    addHomeEquityTakeout,
    addManualDraw,
    addPlanMilestone,
    applyCapitalSpikeEdit,
    applyDrawEdit,
    approvedDrawLimit,
    canEditPlanStructure,
    canWriteLiveTimeline,
    cancelCapitalSpikeEdit,
    capitalSpikeEditDraft,
    capitalSpikes,
    cashflowChartData,
    cashflowExtent,
    cashflowReferenceLines,
    cashflowTicks,
    createInsertedMilestoneItem,
    currentDay,
    deleteCapitalSpike,
    deleteDraw,
    deleteMilestone,
    drawAvailabilityChartData,
    drawAvailabilityExtent,
    drawAvailabilityReferenceLines,
    drawEditDraft,
    draws,
    durablePlanId,
    endingAvailability,
    handleChartHotspotDaySelect,
    handleMobileDayChange,
    handleMobileOpenCapitalEvent,
    handleMobileOpenDraw,
    handleMobileOpenMilestoneDrawer,
    isCompactLayout,
    isMobileDrawerLayout,
    items,
    liveBuildMode,
    minimumCashReserve,
    mobileFeedItems,
    markers,
    openCapitalSpikeEditor,
    openDrawEditor,
    persistCreateMilestone,
    persistUpdateMilestone,
    probeDrawAvailability,
    probeValue,
    prefersReducedMotion,
    progressValue,
    proposalMode,
    range,
    resolvedRange,
    requestedBudgetByMilestone,
    requestedDeletionByMilestone,
    runDurableMutation,
    selectedDay,
    setActiveCapitalSpikeId,
    setActiveDrawId,
    setActiveSelection,
    setCapitalSpikeEditDraft,
    setDrawEditDraft,
    setDraws,
    setItems,
    setProbeValue,
    setProgressValue,
    setRange,
    setSelectedPanelOpen,
    showCashflowHoverDetails,
    showCashflowWarnings,
    setShowCashflowHoverDetails,
    setShowCashflowWarnings,
    setMinimumCashReserve,
    setStartingCash,
    startingCash,
    statusReadOnly,
    straightLine,
    timelineItemsForRender,
    timelineSizing,
    updateMilestone,
    requestMilestoneCreation,
    insertions: {
      pendingExpandedRange,
      pendingNormalizedInsertSelection,
    },
  } = useTimelineWorkspaceContext();

  return (
          <div
            className="grid min-w-0 gap-1 overflow-x-clip"
            data-testid="timeline-workspace-main"
          >
            <ResponsiveAnalyticsDisclosure
              compact={isCompactLayout}
              label="Cash flow analytics"
            >
              <motion.section
                aria-label="Cash flow analytics detail"
                className="min-w-0 rounded-none border border-border border-x-0 bg-background/92 p-0 shadow-sm backdrop-blur sm:rounded-lg sm:border-x sm:px-4 sm:pt-4 sm:pb-1"
                data-ixc-ref={
                  statusReadOnly ? "UI-SUBMITTED-PANEL-CASHFLOW" : undefined
                }
                data-testid="timeline-cashflow-chart"
                id="timeline-submitted-panel-cashflow"
                variants={routeSectionVariants}
              >
                <div className="flex min-w-0 flex-col gap-1 sm:gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2 sm:mb-2">
                      <Badge variant="outline">Controlled graph</Badge>
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span
                        className="font-medium text-muted-foreground text-xs"
                        data-testid="timeline-cashflow-series-milestone-cost"
                      >
                        Milestone cost
                      </span>
                      <span className="ml-2 h-2 w-2 rounded-full bg-amber-500" />
                      <span
                        className="font-medium text-muted-foreground text-xs"
                        data-testid="timeline-cashflow-series-cash-on-hand"
                      >
                        Cash on hand
                      </span>
                    </div>
                    <h2 className="font-semibold text-lg sm:text-xl">
                      Cash requirement vs draw recovery
                    </h2>
                  </div>
                  <div className="grid w-full min-w-0 max-w-full gap-1 sm:gap-3 lg:ml-auto lg:w-full lg:max-w-2xl 2xl:max-w-4xl">
                    <div className="rounded-md border border-primary/25 bg-primary/10 px-2 py-1.5 sm:hidden">
                      <p className="font-medium text-[10px] text-muted-foreground uppercase">
                        Initial cash on hand
                      </p>
                      <p className="mt-1 font-semibold text-sm tabular-nums">
                        {money(startingCash)}
                      </p>
                    </div>
                    <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 sm:hidden">
                      <p className="font-medium text-[10px] text-muted-foreground uppercase">
                        Minimum cash reserve
                      </p>
                      <p className="mt-1 font-semibold text-sm tabular-nums">
                        {money(minimumCashReserve)}
                      </p>
                    </div>
                    <div className="hidden gap-2 sm:ml-auto sm:grid sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label
                          className="text-xs"
                          htmlFor="timeline-starting-cash"
                        >
                          Initial cash on hand
                        </Label>
                        <Input
                          aria-disabled={!canEditPlanStructure}
                          data-testid="timeline-starting-cash-input"
                          disabled={!canEditPlanStructure}
                          id="timeline-starting-cash"
                          min={0}
                          nativeInput
                          onChange={(event) => {
                            const nextValue = Math.max(
                              0,
                              Math.round(Number(event.currentTarget.value))
                            );

                            if (Number.isFinite(nextValue)) {
                              setStartingCash(nextValue);
                            }
                          }}
                          size="sm"
                          step={5000}
                          type="number"
                          value={startingCash}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label
                          className="text-xs"
                          htmlFor="timeline-minimum-cash-reserve"
                        >
                          Minimum cash reserve
                        </Label>
                        <Input
                          aria-disabled={!canEditPlanStructure}
                          data-testid="timeline-minimum-cash-reserve-input"
                          disabled={!canEditPlanStructure}
                          id="timeline-minimum-cash-reserve"
                          min={0}
                          nativeInput
                          onChange={(event) => {
                            const nextValue = Math.max(
                              0,
                              Math.round(Number(event.currentTarget.value))
                            );

                            if (Number.isFinite(nextValue)) {
                              setMinimumCashReserve(nextValue);
                            }
                          }}
                          size="sm"
                          step={5000}
                          type="number"
                          value={minimumCashReserve}
                        />
                      </div>
                    </div>
                    <div
                      aria-label="Cash flow chart display controls"
                      className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2"
                      role="group"
                    >
                      <label className="flex cursor-pointer items-center gap-2 font-medium text-muted-foreground text-xs">
                        <Switch
                          checked={showCashflowWarnings}
                          data-testid="timeline-cashflow-warnings-toggle"
                          onCheckedChange={setShowCashflowWarnings}
                        />
                        Cash warnings
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 font-medium text-muted-foreground text-xs">
                        <Switch
                          checked={showCashflowHoverDetails}
                          data-testid="timeline-cashflow-hover-toggle"
                          onCheckedChange={(checked) => {
                            setShowCashflowHoverDetails(checked);

                            if (!checked) {
                              setProbeValue(null);
                            }
                          }}
                        />
                        Hover details
                      </label>
                    </div>
                  </div>
                </div>
                <Suspense fallback={null}>
                  <TimelineCashflowCompoundChart
                    barSize={timelineSizing.barSize}
                    data={cashflowChartData}
                    hideTooltip={!showCashflowHoverDetails}
                    onHotspotDaySelect={handleChartHotspotDaySelect}
                    onProbeChange={
                      showCashflowHoverDetails ? setProbeValue : undefined
                    }
                    referenceLines={cashflowReferenceLines}
                    xDomain={[resolvedRange.min, resolvedRange.max]}
                    xTicks={cashflowTicks}
                    yAxisWidth={timelineSizing.yAxisWidth}
                    yDomain={[cashflowExtent.min, cashflowExtent.max]}
                  />
                </Suspense>
              </motion.section>
            </ResponsiveAnalyticsDisclosure>

            <motion.section
              className="relative z-30 min-w-0 overflow-visible"
              data-ixc-ref={
                statusReadOnly ? "UI-SUBMITTED-PANEL-TIMELINE" : undefined
              }
              data-testid="timeline-roadmap-grid"
              id="timeline-submitted-panel-timeline"
              role={statusReadOnly ? "tabpanel" : undefined}
              variants={routeSectionVariants}
            >
              {isMobileDrawerLayout ? (
                <MobileTimelineDayDialWorkspace
                  capitalSpikes={capitalSpikes}
                  currentDay={currentDay}
                  draws={draws}
                  insertMenu={
                    canWriteLiveTimeline
                      ? {
                          milestoneLabel: liveBuildMode
                            ? "Request milestone"
                            : "Add milestone",
                          onAddCapitalSpike: addCapitalSpike,
                          onAddCashInfusion: addCashInfusion,
                          onAddDraw: addManualDraw,
                          onAddMilestone: liveBuildMode
                            ? requestMilestoneCreation
                            : canEditPlanStructure
                              ? addPlanMilestone
                              : undefined,
                        }
                      : undefined
                  }
                  items={mobileFeedItems}
                  onDayChange={handleMobileDayChange}
                  onOpenCapitalEvent={handleMobileOpenCapitalEvent}
                  onOpenDraw={handleMobileOpenDraw}
                  onOpenMilestone={handleMobileOpenMilestoneDrawer}
                  range={resolvedRange}
                  selectedDay={selectedDay}
                />
              ) : (
                <>
                  <AnimatedCurvedTimeline<DemoMilestone>
                    activeItemId={activeItemId}
                    activeItemPhase={
                      activeSelection.phase === "complete" ? "end" : "start"
                    }
                    cardWidth={timelineSizing.cardWidth}
                    className="min-w-0"
                    endCardWidth={timelineSizing.endCardWidth}
                    focusedMarkerId={
                      activeDrawId
                        ? `draw-${activeDrawId}`
                        : activeCapitalSpikeId
                          ? `capital-spike-${activeCapitalSpikeId}`
                          : null
                    }
                    formatValue={formatTimelineDay}
                    getItemEndValue={getMilestoneEndX}
                    hoverValue={probeValue}
                    insertion={
                      canWriteLiveTimeline
                        ? {
                            actions: [
                              ...(liveBuildMode
                                ? [
                                    {
                                      icon: (
                                        <Flag className="size-4 text-amber-500" />
                                      ),
                                      id: "request-milestone",
                                      label: "Request milestone",
                                      onSelect: ({ requestedX }: { requestedX: number }) =>
                                        requestMilestoneCreation(requestedX),
                                    },
                                  ]
                                : []),
                              {
                                icon: (
                                  <CircleDollarSign className="size-4 text-rose-500" />
                                ),
                                id: "add-draw",
                                label: "Add draw",
                                onSelect: ({ requestedX }: { requestedX: number }) =>
                                  addManualDraw(requestedX),
                              },
                              {
                                icon: (
                                  <AlertTriangle className="size-4 text-amber-500" />
                                ),
                                id: "add-capital-spike",
                                label: "Add capital spike",
                                onSelect: ({ requestedX }: { requestedX: number }) =>
                                  addCapitalSpike(requestedX),
                              },
                              {
                                icon: (
                                  <Banknote className="size-4 text-emerald-600" />
                                ),
                                id: "add-cash-infusion",
                                label: "Add cash infusion",
                                onSelect: ({ requestedX }: { requestedX: number }) =>
                                  addCashInfusion(requestedX),
                              },
                              ...(proposalMode
                                ? [
                                    {
                                      icon: (
                                        <House className="size-4 text-sky-600" />
                                      ),
                                      id: "add-home-equity-takeout",
                                      label: "Add Home Equity Takeout",
                                      onSelect: ({
                                        requestedX,
                                      }: {
                                        requestedX: number;
                                      }) => addHomeEquityTakeout(requestedX),
                                    },
                                  ]
                                : []),
                            ],
                            createItem: canEditPlanStructure
                              ? createInsertedMilestoneItem
                              : undefined,
                            label: liveBuildMode
                              ? "Request milestone"
                              : "Add milestone",
                            minGap: 14,
                            step: 1,
                          }
                        : undefined
                    }
                    items={timelineItemsForRender}
                    markerStackProximityPx={88}
                    markers={markers}
                    minInlineNodeSpacingPx={72}
                    minNodeSpacingPx={timelineSizing.minNodeSpacingPx}
                    onActiveItemChange={(item) => {
                      setActiveDrawId(null);
                      setActiveCapitalSpikeId(null);
                      setActiveSelection({
                        itemId: item.id,
                        phase: "inProgress",
                      });
                    }}
                    onEndNodeClick={(item) => {
                      setActiveDrawId(null);
                      setActiveCapitalSpikeId(null);
                      setActiveSelection({
                        itemId: item.id,
                        phase: "complete",
                      });
                      setProgressValue(getMilestoneEndX(item));
                      setSelectedPanelOpen(true);
                    }}
                    onHoverValueChange={setProbeValue}
                    onItemsChange={(nextItems, details) => {
                      if (!canEditPlanStructure) {
                        return;
                      }
                      const normalizedItems =
                        normalizeMilestoneTimelineItems(nextItems);
                      const expandedRange = expandTimelineRangeForMilestones(
                        normalizedItems,
                        details.range
                      );
                      const normalizedInsertedItem =
                        details.type === "insert"
                          ? normalizedItems.find(
                              (item) => item.id === details.insertedItem.id
                            )
                          : null;

                      if (normalizedInsertedItem) {
                        pendingNormalizedInsertSelection.current = {
                          itemId: normalizedInsertedItem.id,
                          x: normalizedInsertedItem.x,
                        };
                        setSelectedPanelOpen(true);
                      }

                      pendingExpandedRange.current = expandedRange;
                      setItems(normalizedItems);
                      setDraws((currentDraws) =>
                        syncDemoDrawsWithItems(
                          currentDraws,
                          normalizedItems,
                          expandedRange
                        )
                      );
                      if (durablePlanId) {
                        if (normalizedInsertedItem) {
                          runDurableMutation(
                            () =>
                              persistCreateMilestone({
                                milestone: timelineItemToMilestoneMutationInput(
                                  normalizedInsertedItem,
                                  normalizedItems.findIndex(
                                    (item) =>
                                      item.id === normalizedInsertedItem.id
                                  ) + 1
                                ),
                              }),
                            "milestone creation"
                          );
                        } else {
                          for (const [
                            index,
                            item,
                          ] of normalizedItems.entries()) {
                            runDurableMutation(
                              () =>
                                persistUpdateMilestone({
                                  ...timelineItemToMilestoneMutationInput(
                                    item,
                                    index + 1
                                  ),
                                }),
                              "milestone position"
                            );
                          }
                        }
                      }
                    }}
                    onProgressValueChange={(value, item) => {
                      const pendingSelection =
                        pendingNormalizedInsertSelection.current;

                      if (
                        pendingSelection &&
                        item?.id === pendingSelection.itemId
                      ) {
                        setActiveSelection({
                          itemId: pendingSelection.itemId,
                          phase: "inProgress",
                        });
                        setProgressValue(pendingSelection.x);
                        pendingNormalizedInsertSelection.current = null;
                        return;
                      }

                      setProgressValue(value);
                    }}
                    onRangeChange={(nextRange) => {
                      if (!canEditPlanStructure) {
                        return;
                      }
                      const expandedRange = pendingExpandedRange.current;
                      pendingExpandedRange.current = null;
                      setRange(
                        expandedRange ??
                          expandTimelineRangeForMilestones(items, nextRange)
                      );
                    }}
                    paddingX={timelineSizing.paddingX}
                    pixelsPerUnit={timelineSizing.pixelsPerUnit}
                    progressValue={progressValue}
                    range={range}
                    renderCard={(item, context) => (
                      <TimelineDeleteContextMenu
                        canDelete={canEditPlanStructure || liveBuildMode}
                        deleteDescription={
                          liveBuildMode
                            ? "Create an admin-reviewed deletion request"
                            : "Delete this milestone"
                        }
                        deleteDisabledReason={
                          liveBuildMode
                            ? "Request deletion for admin approval."
                            : "Proposal structure is locked after submission."
                        }
                        deleteLabel={
                          liveBuildMode
                            ? "Request deletion"
                            : "Remove milestone"
                        }
                        kind="milestone"
                        onDelete={() => deleteMilestone(item.id)}
                      >
                        <div className="relative">
                          <MilestoneRequestBadges
                            currentAmount={item.data?.amount}
                            deleteRequested={requestedDeletionByMilestone.has(
                              item.id
                            )}
                            isRequestedCreate={item.id.startsWith("requested-")}
                            requestedAmount={requestedBudgetByMilestone.get(
                              item.id
                            )}
                          />
                          <MilestoneCard
                            active={context.active}
                            complete={hasCompletionClaim(item)}
                            item={item}
                            onUpdate={updateMilestone}
                            readOnly={!canWriteLiveTimeline || item.disabled}
                            reducedMotion={Boolean(prefersReducedMotion)}
                          />
                        </div>
                      </TimelineDeleteContextMenu>
                    )}
                    renderEndNode={(item, context) => (
                      <TimelineEndNodeButton
                        active={context.active}
                        complete={hasCompletionClaim(item)}
                        item={item}
                        onClick={() => {
                          context.activate();
                          setActiveDrawId(null);
                          setActiveCapitalSpikeId(null);
                          setSelectedPanelOpen(true);
                        }}
                        reducedMotion={Boolean(prefersReducedMotion)}
                      />
                    )}
                    renderMarker={(marker) => {
                      const drawId = marker.id.startsWith("draw-")
                        ? marker.id.slice("draw-".length)
                        : null;
                      const capitalSpikeId = marker.id.startsWith(
                        "capital-spike-"
                      )
                        ? marker.id.slice("capital-spike-".length)
                        : null;
                      const draw = drawId
                        ? draws.find((candidate) => candidate.id === drawId)
                        : null;
                      const capitalSpike = capitalSpikeId
                        ? capitalSpikes.find(
                            (candidate) => candidate.id === capitalSpikeId
                          )
                        : null;

                      if (!draw) {
                        if (capitalSpike) {
                          return (
                            <TimelineDeleteContextMenu
                              canDelete={
                                canWriteLiveTimeline &&
                                !(
                                  liveBuildMode &&
                                  capitalSpike.eventKind === "homeEquityTakeout"
                                )
                              }
                              deleteDisabledReason="Timeline is locked in this status."
                              deleteLabel={
                                capitalSpike.eventKind === "cashInfusion"
                                  ? "Remove cash infusion"
                                  : capitalSpike.eventKind ===
                                      "homeEquityTakeout"
                                    ? "Remove Home Equity Takeout"
                                    : "Remove capital cost"
                              }
                              kind="capitalSpike"
                              onDelete={() =>
                                deleteCapitalSpike(capitalSpike.id)
                              }
                            >
                              <CapitalSpikeTimelineMarker
                                active={
                                  capitalSpike.id === activeCapitalSpikeId
                                }
                                draft={capitalSpikeEditDraft}
                                maxDay={resolvedRange.max}
                                onApply={applyCapitalSpikeEdit}
                                onCancel={cancelCapitalSpikeEdit}
                                onDraftChange={setCapitalSpikeEditDraft}
                                onOpen={() => {
                                  if (
                                    canWriteLiveTimeline &&
                                    !(
                                      liveBuildMode &&
                                      capitalSpike.eventKind ===
                                        "homeEquityTakeout"
                                    )
                                  ) {
                                    openCapitalSpikeEditor(capitalSpike);
                                  }
                                }}
                                reducedMotion={Boolean(prefersReducedMotion)}
                                spike={capitalSpike}
                              />
                            </TimelineDeleteContextMenu>
                          );
                        }
                        return <TimelineMarkerBadge marker={marker} />;
                      }

                      return (
                        <TimelineDeleteContextMenu
                          canDelete={
                            canWriteLiveTimeline &&
                            draw.requestStatus !== "approved"
                          }
                          deleteDescription="Delete this draw marker"
                          deleteDisabledReason={
                            canWriteLiveTimeline
                              ? "Approved reimbursement draws cannot be deleted."
                              : "Timeline is locked in this status."
                          }
                          kind="draw"
                          onDelete={() => deleteDraw(draw.id)}
                        >
                          <DrawTimelineMarker
                            active={draw.id === activeDrawId}
                            availableAmount={getMaxSchedulableDrawAmount(
                              Math.round(
                                Number(
                                  draw.id === activeDrawId
                                    ? drawEditDraft.x
                                    : draw.x
                                )
                              ) || draw.x,
                              items,
                              draws,
                              {
                                excludeDrawId: draw.id,
                                proposedDrawId: draw.id,
                              },
                              approvedDrawLimit
                            )}
                            currentDay={currentDay}
                            draft={drawEditDraft}
                            draw={draw}
                            inlineEditorEnabled={!liveBuildMode}
                            onApply={applyDrawEdit}
                            onCancel={() => setActiveDrawId(null)}
                            onDraftChange={(draft) => {
                              setDrawEditDraft(draft);
                              const nextDay = Math.round(Number(draft.x));
                              if (Number.isFinite(nextDay)) {
                                setProbeValue(nextDay);
                              }
                            }}
                            onOpen={() => openDrawEditor(draw)}
                            reducedMotion={Boolean(prefersReducedMotion)}
                          />
                        </TimelineDeleteContextMenu>
                      );
                    }}
                    renderNode={(item, context) => (
                      <TimelineDeleteContextMenu
                        canDelete={canEditPlanStructure || liveBuildMode}
                        deleteDescription={
                          liveBuildMode
                            ? "Create an admin-reviewed deletion request"
                            : "Delete this milestone"
                        }
                        deleteDisabledReason={
                          liveBuildMode
                            ? "Request deletion for admin approval."
                            : "Proposal structure is locked after submission."
                        }
                        deleteLabel={
                          liveBuildMode
                            ? "Request deletion"
                            : "Remove milestone"
                        }
                        kind="milestone"
                        onDelete={() => deleteMilestone(item.id)}
                      >
                        <TimelineNodeButton
                          active={context.active}
                          complete={hasCompletionClaim(item)}
                          item={item}
                          onClick={() => {
                            context.activate();
                            setActiveDrawId(null);
                            setActiveCapitalSpikeId(null);
                            setActiveSelection({
                              itemId: item.id,
                              phase: "inProgress",
                            });
                            setProgressValue(item.x);
                            setSelectedPanelOpen(true);
                          }}
                          onDoubleClick={() => setSelectedPanelOpen(false)}
                          reducedMotion={Boolean(prefersReducedMotion)}
                        />
                      </TimelineDeleteContextMenu>
                    )}
                    straightLine={straightLine}
                  />
                </>
              )}
            </motion.section>

            <TimelineWorkspaceMobileOverlays />

            <ResponsiveAnalyticsDisclosure
              compact={isCompactLayout}
              label="Draw availability analytics"
            >
              <motion.section
                aria-label="Draw availability analytics detail"
                className="relative z-0 min-w-0 rounded-none border border-border border-x-0 bg-background/92 p-0 shadow-sm backdrop-blur sm:rounded-lg sm:border-x sm:px-4 sm:pt-1 sm:pb-4"
                data-ixc-ref={
                  statusReadOnly ? "UI-SUBMITTED-PANEL-DRAWS" : undefined
                }
                data-testid="timeline-draw-availability-chart"
                id="timeline-submitted-panel-draws"
                variants={routeSectionVariants}
              >
                <div className="flex flex-col gap-0.5">
                  <div className="mb-1 flex flex-wrap items-center gap-2 sm:mb-2">
                    <Badge variant="outline">Draw availability</Badge>
                    <span className="h-2 w-2 rounded-full bg-violet-500" />
                    <span
                      className="font-medium text-muted-foreground text-xs"
                      data-testid="timeline-draw-series-interest-bearing"
                    >
                      Interest-bearing draw
                    </span>
                    <span className="ml-2 h-2 w-2 rounded-full bg-sky-500" />
                    <span
                      className="font-medium text-muted-foreground text-xs"
                      data-testid="timeline-draw-series-additional-available"
                    >
                      Additional available draw
                    </span>
                  </div>
                  <div>
                    {/*<h2 className="font-semibold text-xl">Draw capacity envelope</h2>*/}
                    {/*<p className="mt-1 max-w-2xl text-muted-foreground text-sm">
                Top line is interest-bearing principal plus available draw;
                lower line is interest-bearing principal.
              </p>*/}
                  </div>
                </div>
                <Suspense fallback={null}>
                  <TimelineDrawAvailabilityChart
                    data={drawAvailabilityChartData}
                    formatMoney={formatCompactMoney}
                    formatTimelineDay={formatTimelineDay}
                    onProbeChange={setProbeValue}
                    referenceLines={drawAvailabilityReferenceLines}
                    xDomain={[resolvedRange.min, resolvedRange.max]}
                    xTicks={cashflowTicks}
                    yAxisWidth={timelineSizing.yAxisWidth}
                    yDomain={[0, drawAvailabilityExtent.max]}
                  />
                </Suspense>
                <DrawAvailabilityMetrics
                  endingAvailability={endingAvailability}
                  probeDrawAvailability={probeDrawAvailability}
                />
                <DrawAvailabilityDeltaReadout
                  probeDrawAvailability={probeDrawAvailability}
                />
              </motion.section>
            </ResponsiveAnalyticsDisclosure>
          </div>

  );
}
