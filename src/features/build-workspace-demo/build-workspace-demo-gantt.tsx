import { addDays, format } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type GanttFeature,
  GanttFeatureList,
  GanttFeatureRow,
  GanttHeader,
  GanttMarker,
  GanttProvider,
  GanttRangeOverlay,
  GanttSelectionLayer,
  GanttTimeline,
  GanttToday,
} from "#/components/kibo-ui/gantt/index.tsx";
import { cn } from "#/lib/utils.ts";
import {
  type BatchShiftPreview,
  compactMoney,
  drawClasses,
  type GanttResolution,
  initialScheduleBaseDate,
  type MilestoneHighlightTones,
  milestoneToFeature,
  money,
  type ScheduleDisplayMode,
  type SelectedMilestoneIds,
  type SingleMilestoneShiftPreview,
  scheduleDateLabel,
  statusLabels,
} from "./build-workspace-demo-contracts";
import { DrawGroupRangeDragHandle } from "./build-workspace-demo-controls";
import { getDrawOverlays, IssueChip } from "./build-workspace-demo-issues";
import {
  GanttMilestoneSidebar,
  MilestoneBlock,
  MilestoneGhostBlock,
  MilestoneRail,
} from "./build-workspace-demo-milestones";
import { useBuildWorkspace } from "./workspace-adapter";

export function GanttRoadmap({
  focusedMilestoneId,
  milestoneHighlightTones,
  onHighlightMilestones,
  onMilestoneFocus,
  onOpenDetail,
  onOpenDraw,
  railCollapsed,
  resolution,
  scheduleDisplayMode,
  zoom,
}: {
  focusedMilestoneId: string | null;
  milestoneHighlightTones: MilestoneHighlightTones;
  onHighlightMilestones: (milestoneTones: MilestoneHighlightTones) => void;
  onMilestoneFocus: (milestoneId: string | null) => void;
  onOpenDetail: (milestoneId: string) => void;
  onOpenDraw: (drawGroupId: string) => void;
  railCollapsed: boolean;
  resolution: GanttResolution;
  scheduleDisplayMode: ScheduleDisplayMode;
  zoom: number;
}) {
  const workspace = useBuildWorkspace();
  const scheduleBaseDate =
    workspace.timelineBaseDate ?? initialScheduleBaseDate(workspace.milestones);
  const [selectedMilestoneIds, setSelectedMilestoneIds] =
    useState<SelectedMilestoneIds>(() => new Set());
  const [batchShiftPreview, setBatchShiftPreview] =
    useState<BatchShiftPreview>(null);
  const [singleMilestoneShiftPreview, setSingleMilestoneShiftPreview] =
    useState<SingleMilestoneShiftPreview>(null);
  const proposalSubmitted =
    workspace.mode === "proposal" &&
    workspace.build.proposalStatus === "submitted";
  const selectionPreview =
    batchShiftPreview?.source === "selection" ? batchShiftPreview : null;
  const drawGroupPreview =
    batchShiftPreview?.source === "drawGroup" ? batchShiftPreview : null;
  const features: GanttFeature[] = workspace.milestones.map((milestone) => {
    const featureMilestone = selectionPreview?.movingMilestoneIds.includes(
      milestone.id
    )
      ? {
          ...milestone,
          startAt: addDays(milestone.startAt, selectionPreview.deltaDays),
          endAt: addDays(milestone.endAt, selectionPreview.deltaDays),
        }
      : milestone;
    return milestoneToFeature(featureMilestone);
  });
  const drawOverlays = getDrawOverlays(
    workspace.milestones,
    workspace.drawGroups
  );
  const drawGroupGhostOverlays = drawGroupPreview
    ? getDrawOverlays(
        workspace.milestones.map((milestone) =>
          drawGroupPreview.movingMilestoneIds.includes(milestone.id)
            ? {
                ...milestone,
                startAt: addDays(milestone.startAt, drawGroupPreview.deltaDays),
                endAt: addDays(milestone.endAt, drawGroupPreview.deltaDays),
              }
            : milestone
        ),
        workspace.drawGroups
      ).filter((draw) => draw.id === drawGroupPreview.sourceId)
    : [];
  const ghostFeatures: GanttFeature[] = workspace.milestones.map((milestone) =>
    drawGroupPreview?.movingMilestoneIds.includes(milestone.id)
      ? {
          ...milestoneToFeature({
            ...milestone,
            startAt: addDays(milestone.startAt, drawGroupPreview.deltaDays),
            endAt: addDays(milestone.endAt, drawGroupPreview.deltaDays),
          }),
        }
      : milestoneToFeature(milestone)
  );
  const singleMilestoneGhostFeature = singleMilestoneShiftPreview
    ? workspace.milestones.find(
        (milestone) => milestone.id === singleMilestoneShiftPreview.milestoneId
      )
    : null;
  const singleMilestoneGhost = singleMilestoneGhostFeature
    ? {
        feature: milestoneToFeature({
          ...singleMilestoneGhostFeature,
          startAt: addDays(
            singleMilestoneGhostFeature.startAt,
            singleMilestoneShiftPreview?.deltaDays ?? 0
          ),
          endAt: addDays(
            singleMilestoneGhostFeature.endAt,
            singleMilestoneShiftPreview?.deltaDays ?? 0
          ),
        }),
        milestone: singleMilestoneGhostFeature,
      }
    : null;
  const focusedMilestone = workspace.milestones.find(
    (milestone) => milestone.id === focusedMilestoneId
  );
  const initialScrollDate = useMemo(
    () =>
      new Date(
        Math.min(
          ...workspace.milestones.map((milestone) =>
            milestone.startAt.getTime()
          )
        )
      ),
    [workspace.milestones]
  );
  const replaceSelection = useCallback((milestoneId: string) => {
    setSelectedMilestoneIds(new Set([milestoneId]));
  }, []);
  const toggleSelection = useCallback((milestoneId: string) => {
    setSelectedMilestoneIds((current) => {
      const next = new Set(current);
      if (next.has(milestoneId)) {
        next.delete(milestoneId);
      } else {
        next.add(milestoneId);
      }
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedMilestoneIds(new Set());
  }, []);
  const selectFromMarquee = useCallback(
    (milestoneIds: string[]) => {
      setSelectedMilestoneIds(new Set(milestoneIds));
      const first = milestoneIds[0];
      if (first) {
        workspace.selectMilestone(first);
        onMilestoneFocus(first);
      }
    },
    [onMilestoneFocus, workspace]
  );
  const handleTimelineMilestoneClick = useCallback(
    (
      milestoneId: string,
      event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }
    ) => {
      workspace.selectMilestone(milestoneId);
      onMilestoneFocus(milestoneId);
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        toggleSelection(milestoneId);
        return;
      }
      replaceSelection(milestoneId);
      onHighlightMilestones({ [milestoneId]: "selected" });
    },
    [
      onHighlightMilestones,
      onMilestoneFocus,
      replaceSelection,
      toggleSelection,
      workspace,
    ]
  );
  const selectedUnlockedIds = workspace.milestones
    .filter(
      (milestone) =>
        selectedMilestoneIds.has(milestone.id) && !milestone.isDragLocked
    )
    .map((milestone) => milestone.id);
  const lockedSelectedIds = workspace.milestones
    .filter(
      (milestone) =>
        selectedMilestoneIds.has(milestone.id) && milestone.isDragLocked
    )
    .map((milestone) => milestone.id);
  const disabledMilestoneIds = new Set(
    workspace.milestones
      .filter((milestone) => milestone.isDragLocked || proposalSubmitted)
      .map((milestone) => milestone.id)
  );
  const commitBatchShift = useCallback(
    async (
      milestoneIds: string[],
      deltaDays: number,
      source: "selection" | "drawGroup",
      sourceId?: string
    ) => {
      if (deltaDays === 0 || proposalSubmitted) {
        setBatchShiftPreview(null);
        setSingleMilestoneShiftPreview(null);
        return;
      }
      const moves = workspace.milestones
        .filter(
          (milestone) =>
            milestoneIds.includes(milestone.id) && !milestone.isDragLocked
        )
        .map((milestone) => ({
          milestoneId: milestone.id,
          startAt: addDays(milestone.startAt, deltaDays),
          endAt: addDays(milestone.endAt, deltaDays),
        }));
      setBatchShiftPreview(null);
      setSingleMilestoneShiftPreview(null);
      if (moves.length === 0) {
        return;
      }
      await workspace.batchMoveMilestoneDates(
        moves,
        undefined,
        source,
        sourceId
      );
    },
    [proposalSubmitted, workspace]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearSelection();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSelection]);

  return (
    <GanttProvider
      className="h-full min-w-0 rounded-none bg-card"
      initialScrollDate={initialScrollDate}
      leadingSidebarWidth={railCollapsed ? 0 : 420}
      range={resolution}
      rowGap={10}
      rowHeight={36}
      zoom={zoom}
    >
      {railCollapsed ? null : (
        <MilestoneRail
          milestoneHighlightTones={milestoneHighlightTones}
          onHighlightMilestones={onHighlightMilestones}
          onMilestoneFocus={onMilestoneFocus}
          onOpenDetail={onOpenDetail}
        />
      )}
      <GanttMilestoneSidebar
        features={features}
        onLockToggle={(milestoneId, locked) => {
          void workspace.setMilestoneDragLocked(milestoneId, locked);
        }}
        onMilestoneFocus={(milestoneId) => {
          const milestone = workspace.milestones.find(
            (item) => item.id === milestoneId
          );
          if (!milestone) {
            return;
          }
          workspace.selectMilestone(milestone.id);
          onHighlightMilestones({ [milestone.id]: "selected" });
          onMilestoneFocus(milestone.id);
        }}
        proposalSubmitted={proposalSubmitted}
        scheduleBaseDate={scheduleBaseDate}
        scheduleDisplayMode={scheduleDisplayMode}
        selectedMilestoneIds={selectedMilestoneIds}
      />
      <GanttTimeline
        style={{
          minHeight: `calc(var(--gantt-header-height) + ${features.length} * (var(--gantt-row-height) + var(--gantt-row-gap)))`,
        }}
      >
        <GanttHeader className="text-muted-foreground [&_p]:text-[0.82rem]" />
        <GanttSelectionLayer
          disabled={proposalSubmitted}
          features={features}
          onEmptyClick={clearSelection}
          onSelectionChange={selectFromMarquee}
        />
        {drawOverlays.map((draw) => (
          <GanttRangeOverlay
            className={cn("pt-1 pl-2", drawClasses[draw.status])}
            dragDisabled={
              proposalSubmitted ||
              workspace.milestones.every(
                (milestone) =>
                  milestone.drawGroupId !== draw.id || milestone.isDragLocked
              )
            }
            endAt={draw.endAt}
            id={draw.id}
            key={draw.id}
            onMoveDelta={(deltaDays) => {
              const ids = workspace.milestones
                .filter((milestone) => milestone.drawGroupId === draw.id)
                .map((milestone) => milestone.id);
              void commitBatchShift(ids, deltaDays, "drawGroup", draw.id);
            }}
            onPreviewDelta={(deltaDays) => {
              if (deltaDays === null) {
                setBatchShiftPreview(null);
                return;
              }
              const drawMilestones = workspace.milestones.filter(
                (milestone) => milestone.drawGroupId === draw.id
              );
              setBatchShiftPreview({
                deltaDays,
                lockedMilestoneIds: drawMilestones
                  .filter((milestone) => milestone.isDragLocked)
                  .map((milestone) => milestone.id),
                movingMilestoneIds: drawMilestones
                  .filter((milestone) => !milestone.isDragLocked)
                  .map((milestone) => milestone.id),
                source: "drawGroup",
                sourceId: draw.id,
              });
            }}
            rowIndex={draw.rowIndex}
            rowSpan={draw.rowSpan}
            startAt={draw.startAt}
            testId={`draw-overlay-${draw.id}`}
          >
            <DrawGroupRangeDragHandle
              draw={draw}
              milestones={workspace.milestones}
              onMoveDelta={(deltaDays) => {
                const ids = workspace.milestones
                  .filter((milestone) => milestone.drawGroupId === draw.id)
                  .map((milestone) => milestone.id);
                void commitBatchShift(ids, deltaDays, "drawGroup", draw.id);
              }}
              onPreviewDelta={(deltaDays) => {
                if (deltaDays === null) {
                  setBatchShiftPreview(null);
                  return;
                }
                const drawMilestones = workspace.milestones.filter(
                  (milestone) => milestone.drawGroupId === draw.id
                );
                setBatchShiftPreview({
                  deltaDays,
                  lockedMilestoneIds: drawMilestones
                    .filter((milestone) => milestone.isDragLocked)
                    .map((milestone) => milestone.id),
                  movingMilestoneIds: drawMilestones
                    .filter((milestone) => !milestone.isDragLocked)
                    .map((milestone) => milestone.id),
                  source: "drawGroup",
                  sourceId: draw.id,
                });
              }}
              proposalSubmitted={proposalSubmitted}
            >
              <span className="font-semibold text-foreground">
                {draw.label}
              </span>
              <span>{compactMoney(draw.amount)}</span>
              <span className="text-muted-foreground">
                {statusLabels[draw.status]}
              </span>
              <IssueChip
                compact
                issues={draw.issues}
                testId={`draw-issue-chip-${draw.id}`}
              />
            </DrawGroupRangeDragHandle>
          </GanttRangeOverlay>
        ))}
        {drawGroupGhostOverlays.map((draw) => (
          <GanttRangeOverlay
            className="z-[4] border-cyan-200/70 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(103,232,249,0.15)]"
            endAt={draw.endAt}
            id={`ghost-${draw.id}`}
            key={`ghost-${draw.id}`}
            rowIndex={draw.rowIndex}
            rowSpan={draw.rowSpan}
            startAt={draw.startAt}
            testId={`draw-ghost-overlay-${draw.id}`}
          >
            <div className="pointer-events-none sticky left-[calc(var(--gantt-sidebar-width)+0.5rem)] inline-flex -translate-y-[calc(100%+0.25rem)] items-center rounded-sm border border-cyan-200/40 bg-cyan-100/95 px-2 py-1 font-medium text-[0.72rem] text-cyan-950 shadow-lg dark:bg-cyan-950/85 dark:text-cyan-50">
              Drop {draw.label} here
            </div>
          </GanttRangeOverlay>
        ))}
        {batchShiftPreview ? (
          <div
            className="pointer-events-none absolute top-16 left-[calc(var(--gantt-sidebar-width)+1rem)] z-40 inline-flex rounded-sm border border-cyan-200/40 bg-cyan-100/95 px-2.5 py-1 font-medium text-[0.72rem] text-cyan-950 shadow-lg dark:bg-cyan-950/90 dark:text-cyan-50"
            data-testid="gantt-batch-shift-preview"
          >
            {batchShiftPreview.source === "drawGroup"
              ? `Shift ${workspace.drawGroups.find((draw) => draw.id === batchShiftPreview.sourceId)?.label ?? "draw"}: ${batchShiftPreview.movingMilestoneIds.length} milestones ${batchShiftPreview.deltaDays > 0 ? "+" : ""}${batchShiftPreview.deltaDays}d, ${batchShiftPreview.lockedMilestoneIds.length} locked`
              : `Shift ${batchShiftPreview.movingMilestoneIds.length} milestones ${batchShiftPreview.deltaDays > 0 ? "+" : ""}${batchShiftPreview.deltaDays}d`}
          </div>
        ) : null}
        {selectedMilestoneIds.size > 1 ? (
          <div
            className="pointer-events-none absolute top-8 left-[calc(var(--gantt-sidebar-width)+1rem)] z-40 inline-flex rounded-sm border border-cyan-200/35 bg-popover/90 px-2 py-1 text-[0.7rem] text-cyan-700 dark:text-cyan-100"
            data-testid="gantt-selection-count"
          >
            {selectedMilestoneIds.size} selected
            {lockedSelectedIds.length > 0
              ? ` / ${lockedSelectedIds.length} locked`
              : ""}
          </div>
        ) : null}
        {drawOverlays.map((draw) => (
          <GanttMarker
            className="bg-cyan-300 text-cyan-950 shadow-cyan-500/30"
            clickLabel={`Edit ${draw.label}`}
            date={draw.plannedAt ?? draw.eligibleAt}
            detail={
              <span className="flex flex-col items-start gap-0.5 leading-tight">
                <span>
                  Planned draw date:{" "}
                  {format(draw.plannedAt ?? draw.eligibleAt, "MMM dd, yyyy")}
                </span>
                <span>Draw value: {money(draw.amount)}</span>
                <span>Total exposure: {money(draw.totalExposure)}</span>
                <span>
                  Interest accrued (14%): {money(draw.interestAccumulated)}
                </span>
                <span>Draw fees to date: {money(draw.drawFeesToDate)}</span>
                <span>Incurred cost: {money(draw.incurredCost)}</span>
              </span>
            }
            detailTestId={`draw-planned-${draw.id}-detail`}
            id={`draw-planned-${draw.id}`}
            key={`draw-planned-${draw.id}`}
            label={`${draw.label} planned`}
            labelClassName="items-start text-left"
            onClick={() => {
              onOpenDraw(draw.id);
            }}
            testId={`draw-planned-${draw.id}`}
          />
        ))}
        {drawGroupGhostOverlays.map((draw) => (
          <GanttMarker
            className="bg-cyan-100 text-cyan-950 shadow-cyan-500/40 ring-2 ring-cyan-300/40"
            containerClassName="z-30 opacity-80"
            date={draw.plannedAt ?? draw.eligibleAt}
            id={`ghost-draw-planned-${draw.id}`}
            key={`ghost-draw-planned-${draw.id}`}
            label={`${draw.label} drop planned`}
            testId={`draw-ghost-planned-${draw.id}`}
          />
        ))}
        {focusedMilestone && (
          <>
            <GanttMarker
              className="bg-cyan-100 text-cyan-950 shadow-cyan-500/25"
              containerClassName="z-30"
              date={focusedMilestone.startAt}
              id={`milestone-start-${focusedMilestone.id}`}
              key={`milestone-start-${focusedMilestone.id}`}
              label={scheduleDateLabel(
                focusedMilestone.startAt,
                scheduleBaseDate,
                scheduleDisplayMode,
                "Start"
              )}
              labelClassName="translate-x-1/2"
              testId={`milestone-start-marker-${focusedMilestone.id}`}
            />
            <GanttMarker
              className="bg-cyan-100 text-cyan-950 shadow-cyan-500/25"
              containerClassName="z-30"
              date={focusedMilestone.endAt}
              id={`milestone-end-${focusedMilestone.id}`}
              key={`milestone-end-${focusedMilestone.id}`}
              label={scheduleDateLabel(
                focusedMilestone.endAt,
                scheduleBaseDate,
                scheduleDisplayMode,
                "End"
              )}
              labelClassName="translate-x-1/2"
              testId={`milestone-end-marker-${focusedMilestone.id}`}
            />
          </>
        )}
        <GanttToday className="bg-emerald-300 text-emerald-950" />
        <GanttFeatureList>
          {features.map((feature) => {
            const milestone = workspace.milestones.find(
              (item) => item.id === feature.id
            );

            return (
              <GanttFeatureRow
                batchMoveIds={Array.from(selectedMilestoneIds)}
                className="border-border/60 border-b"
                disabledIds={disabledMilestoneIds}
                features={[feature]}
                key={feature.id}
                onBatchMove={(_featureId, deltaDays) => {
                  void commitBatchShift(
                    Array.from(selectedMilestoneIds),
                    deltaDays,
                    "selection"
                  );
                }}
                onBatchPreviewChange={(_featureId, preview) => {
                  if (!preview) {
                    setBatchShiftPreview(null);
                    return;
                  }
                  setBatchShiftPreview({
                    deltaDays: preview.deltaDays,
                    lockedMilestoneIds: lockedSelectedIds,
                    movingMilestoneIds: selectedUnlockedIds,
                    source: "selection",
                  });
                }}
                onMove={workspace.moveMilestoneDates}
                onPreviewChange={(featureId, preview) => {
                  if (!preview || preview.deltaDays === 0) {
                    setSingleMilestoneShiftPreview(null);
                    return;
                  }
                  setSingleMilestoneShiftPreview({
                    deltaDays: preview.deltaDays,
                    milestoneId: featureId,
                  });
                }}
                selectedIds={selectedMilestoneIds}
              >
                {(item) => (
                  <MilestoneBlock
                    feature={item}
                    highlightTone={milestoneHighlightTones[item.id]}
                    milestone={milestone ?? workspace.milestones[0]}
                    onTimelineClick={handleTimelineMilestoneClick}
                    scheduleBaseDate={scheduleBaseDate}
                    scheduleDisplayMode={scheduleDisplayMode}
                    selected={selectedMilestoneIds.has(item.id)}
                  />
                )}
              </GanttFeatureRow>
            );
          })}
        </GanttFeatureList>
        {drawGroupPreview ? (
          <GanttFeatureList className="pointer-events-none z-[5]">
            {ghostFeatures.map((feature) => {
              const milestone = workspace.milestones.find(
                (item) => item.id === feature.id
              );
              const isMoving = drawGroupPreview.movingMilestoneIds.includes(
                feature.id
              );

              return (
                <GanttFeatureRow
                  className="border-transparent border-b"
                  features={isMoving ? [feature] : []}
                  key={`ghost-${feature.id}`}
                >
                  {(item) => (
                    <MilestoneGhostBlock
                      feature={item}
                      milestone={milestone ?? workspace.milestones[0]}
                    />
                  )}
                </GanttFeatureRow>
              );
            })}
          </GanttFeatureList>
        ) : null}
        {singleMilestoneGhost ? (
          <GanttFeatureList className="pointer-events-none z-[5]">
            {features.map((feature) => (
              <GanttFeatureRow
                className="border-transparent border-b"
                features={
                  feature.id === singleMilestoneGhost.feature.id
                    ? [singleMilestoneGhost.feature]
                    : []
                }
                key={`single-ghost-${feature.id}`}
              >
                {(item) => (
                  <MilestoneGhostBlock
                    feature={item}
                    milestone={singleMilestoneGhost.milestone}
                  />
                )}
              </GanttFeatureRow>
            ))}
          </GanttFeatureList>
        ) : null}
      </GanttTimeline>
    </GanttProvider>
  );
}
