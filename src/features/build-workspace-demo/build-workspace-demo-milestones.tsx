import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Lock, MoveRight, Unlock } from "lucide-react";
import { useRef, useState } from "react";

import {
  type GanttFeature,
  GanttSidebar,
  GanttSidebarItem,
  useGanttContext,
} from "#/components/kibo-ui/gantt/index.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#/components/ui/context-menu.tsx";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "#/components/ui/hover-card.tsx";
import { cn } from "#/lib/utils.ts";
import {
  compactMoney,
  type MilestoneHighlightTone,
  type MilestoneHighlightTones,
  milestoneToFeature,
  type ScheduleDisplayMode,
  type SelectedMilestoneIds,
  scheduleDateRangeLabel,
  statusLabels,
  toDateInputValue,
} from "./build-workspace-demo-contracts";
import { IssueChip, IssueList } from "./build-workspace-demo-issues";
import { SortableMilestoneRailRow } from "./SortableMilestoneRailRow";
import type { Milestone } from "./types";
import { useBuildWorkspace } from "./workspace-adapter";

export function MilestoneRail({
  milestoneHighlightTones,
  onHighlightMilestones,
  onMilestoneFocus,
  onOpenDetail,
}: {
  milestoneHighlightTones: MilestoneHighlightTones;
  onHighlightMilestones: (milestoneTones: MilestoneHighlightTones) => void;
  onMilestoneFocus: (milestoneId: string | null) => void;
  onOpenDetail: (milestoneId: string) => void;
}) {
  const workspace = useBuildWorkspace();
  const gantt = useGanttContext();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const focusMilestone = (milestone: Milestone) => {
    workspace.selectMilestone(milestone.id);
    onHighlightMilestones({ [milestone.id]: "selected" });
    onMilestoneFocus(milestone.id);
    gantt.scrollToFeature?.(milestoneToFeature(milestone));
  };

  const highlightBlocking = (milestone: Milestone) => {
    const blockedIds = workspace.dependencies
      .filter((dependency) => dependency.fromMilestoneId === milestone.id)
      .map((dependency) => dependency.toMilestoneId);

    onMilestoneFocus(null);
    onHighlightMilestones(
      Object.fromEntries(
        blockedIds.map((milestoneId) => [milestoneId, "blocked"])
      )
    );
  };

  const highlightBlockers = (milestone: Milestone) => {
    const blockerIds = workspace.dependencies
      .filter((dependency) => dependency.toMilestoneId === milestone.id)
      .map((dependency) => dependency.fromMilestoneId);

    onMilestoneFocus(null);
    onHighlightMilestones(
      Object.fromEntries(
        blockerIds.map((milestoneId) => [milestoneId, "blocking"])
      )
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const fromIndex = workspace.milestones.findIndex(
      (milestone) => milestone.id === active.id
    );
    const toIndex = workspace.milestones.findIndex(
      (milestone) => milestone.id === over.id
    );
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    void workspace.reorderMilestoneAbsolute(
      String(active.id),
      fromIndex,
      toIndex
    );
  };

  return (
    <aside
      className="sticky left-0 z-30 h-full max-h-full min-h-0 overflow-hidden border-border border-r bg-card/95 backdrop-blur-md"
      data-testid="milestone-rail"
      style={{ width: 420 }}
    >
      <div className="sticky top-0 z-20 flex h-[60px] items-end justify-between border-border border-b bg-card/95 px-3 py-2 text-muted-foreground text-xs backdrop-blur-md">
        <span>Milestones</span>
        <span>Draw / Risk</span>
      </div>
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <SortableContext
          items={workspace.milestones.map((milestone) => milestone.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="h-[calc(100%-60px)] min-h-0 overflow-y-auto overscroll-contain">
            {workspace.milestones.map((milestone, index) => {
              const blockers = workspace.dependencies.filter(
                (dependency) => dependency.toMilestoneId === milestone.id
              ).length;
              const blocking = workspace.dependencies.filter(
                (dependency) => dependency.fromMilestoneId === milestone.id
              ).length;
              const blockingChipActive = workspace.dependencies
                .filter(
                  (dependency) => dependency.fromMilestoneId === milestone.id
                )
                .some(
                  (dependency) =>
                    milestoneHighlightTones[dependency.toMilestoneId] ===
                    "blocked"
                );
              const blockedByChipActive = workspace.dependencies
                .filter(
                  (dependency) => dependency.toMilestoneId === milestone.id
                )
                .some(
                  (dependency) =>
                    milestoneHighlightTones[dependency.fromMilestoneId] ===
                    "blocking"
                );
              const selected = milestone.id === workspace.selectedMilestoneId;
              const highlightTone: MilestoneHighlightTone | undefined = selected
                ? "selected"
                : milestoneHighlightTones[milestone.id];

              return (
                <SortableMilestoneRailRow
                  blockedByChipActive={blockedByChipActive}
                  blockers={blockers}
                  blocking={blocking}
                  blockingChipActive={blockingChipActive}
                  collapsed={false}
                  highlightBlockers={highlightBlockers}
                  highlightBlocking={highlightBlocking}
                  highlightTone={highlightTone}
                  index={index}
                  key={milestone.id}
                  milestone={milestone}
                  onFocusMilestone={focusMilestone}
                  onOpenDetail={onOpenDetail}
                  renderIssueChip={(issues, testId) => (
                    <IssueChip compact issues={issues} testId={testId} />
                  )}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </aside>
  );
}

export function GanttMilestoneSidebar({
  features,
  onLockToggle,
  onMilestoneFocus,
  proposalSubmitted,
  scheduleBaseDate,
  scheduleDisplayMode,
  selectedMilestoneIds,
}: {
  features: GanttFeature[];
  onLockToggle: (milestoneId: string, locked: boolean) => void;
  onMilestoneFocus: (milestoneId: string) => void;
  proposalSubmitted: boolean;
  scheduleBaseDate: Date;
  scheduleDisplayMode: ScheduleDisplayMode;
  selectedMilestoneIds: SelectedMilestoneIds;
}) {
  const workspace = useBuildWorkspace();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  return (
    <GanttSidebar
      className={cn(
        "shrink-0 border-border bg-popover/95 text-muted-foreground",
        sidebarCollapsed ? "w-[64px]" : "w-[220px]"
      )}
      collapsed={sidebarCollapsed}
      onCollapsedChange={setSidebarCollapsed}
    >
      <div className="divide-y divide-border/60">
        {features.map((feature) => {
          const milestone = workspace.milestones.find(
            (item) => item.id === feature.id
          );
          return (
            <GanttSidebarItem
              className={cn(
                "gap-2 px-3 py-0 hover:bg-muted/40",
                sidebarCollapsed && "justify-center gap-1.5 px-1.5",
                milestone?.id === workspace.selectedMilestoneId &&
                  "bg-lime-300/10 text-lime-800 dark:text-lime-100",
                milestone &&
                  selectedMilestoneIds.has(milestone.id) &&
                  "ring-1 ring-cyan-300/40 ring-inset"
              )}
              feature={feature}
              key={feature.id}
              onSelectItem={onMilestoneFocus}
            >
              {sidebarCollapsed ? (
                <span className="pointer-events-none flex min-w-0 items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: feature.status.color }}
                  />
                  <span className="truncate font-medium text-[0.7rem] text-muted-foreground">
                    {feature.name}
                  </span>
                </span>
              ) : (
                <>
                  <span
                    className="pointer-events-none h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: feature.status.color }}
                  />
                  <span className="pointer-events-none min-w-0 flex-1">
                    <span className="block truncate font-medium text-[0.72rem] text-foreground">
                      {feature.name}
                    </span>
                    {milestone ? (
                      <span
                        className="block truncate text-[0.65rem] text-muted-foreground"
                        data-testid={`gantt-sidebar-schedule-${milestone.id}`}
                      >
                        {scheduleDateRangeLabel({
                          baseDate: scheduleBaseDate,
                          displayMode: scheduleDisplayMode,
                          endAt: milestone.endAt,
                          startAt: milestone.startAt,
                        })}
                      </span>
                    ) : null}
                  </span>
                  {milestone ? (
                    <button
                      aria-label={
                        milestone.isDragLocked
                          ? `Unlock timeline dragging for ${milestone.name}`
                          : `Lock timeline dragging for ${milestone.name}`
                      }
                      aria-pressed={milestone.isDragLocked}
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-sm border border-border text-muted-foreground transition-colors hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-cyan-700 dark:text-cyan-100",
                        milestone.isDragLocked &&
                          "border-cyan-300/40 bg-cyan-300/15 text-cyan-700 dark:text-cyan-100",
                        proposalSubmitted && "cursor-not-allowed opacity-50"
                      )}
                      data-gantt-interactive="true"
                      data-testid={`gantt-sidebar-lock-${milestone.id}`}
                      disabled={proposalSubmitted}
                      onClick={(event) => {
                        event.stopPropagation();
                        onLockToggle(milestone.id, !milestone.isDragLocked);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.stopPropagation();
                        }
                      }}
                      title={
                        proposalSubmitted
                          ? "Submitted proposals cannot change milestone drag locks."
                          : milestone.isDragLocked
                            ? "Unlock milestone timeline dragging"
                            : "Lock milestone timeline dragging"
                      }
                      type="button"
                    >
                      {milestone.isDragLocked ? (
                        <Lock className="size-3.5" />
                      ) : (
                        <Unlock className="size-3.5" />
                      )}
                    </button>
                  ) : null}
                </>
              )}
            </GanttSidebarItem>
          );
        })}
      </div>
    </GanttSidebar>
  );
}

export function MilestoneBlock({
  feature,
  highlightTone,
  milestone,
  onTimelineClick,
  scheduleBaseDate,
  scheduleDisplayMode,
  selected,
}: {
  feature: GanttFeature;
  highlightTone: MilestoneHighlightTone | undefined;
  milestone: Milestone;
  onTimelineClick: (
    milestoneId: string,
    event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }
  ) => void;
  scheduleBaseDate: Date;
  scheduleDisplayMode: ScheduleDisplayMode;
  selected: boolean;
}) {
  const workspace = useBuildWorkspace();
  const [previewOpen, setPreviewOpen] = useState(false);
  const handledModifiedPointerRef = useRef(false);
  const effectiveHighlightTone =
    selected || milestone.id === workspace.selectedMilestoneId
      ? "selected"
      : highlightTone;
  const parentMoveTargets =
    workspace.listSubmilestoneParentTargets?.(milestone.id) ?? [];
  const canShowParentMoveMenu =
    workspace.mode === "proposal" &&
    Boolean(workspace.moveSubmilestoneToParent) &&
    parentMoveTargets.length > 0;
  const parentMoveDisabled =
    workspace.build.proposalStatus === "submitted" ||
    parentMoveTargets.every((target) => target.disabled);
  const parentMoveDisabledReason =
    workspace.build.proposalStatus === "submitted"
      ? "Submitted proposals cannot move sub-milestones."
      : (parentMoveTargets.find((target) => target.disabled)?.reason ??
        "No other parent milestones.");

  const block = (
    <HoverCard onOpenChange={setPreviewOpen} open={previewOpen}>
      <HoverCardTrigger
        className="flex h-full min-w-0 flex-1 items-center"
        render={
          <div
            className={cn(
              "flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-sm border border-border bg-muted/60 px-1.5 text-left transition-colors hover:border-cyan-200/40",
              effectiveHighlightTone === "selected" &&
                "border-cyan-200/60 bg-cyan-300/20 ring-2 ring-cyan-300/70",
              effectiveHighlightTone === "blocking" &&
                "bg-amber-300/20 ring-1 ring-amber-300/70",
              effectiveHighlightTone === "blocked" &&
                "bg-red-500/20 ring-1 ring-red-300/70",
              milestone.isDragLocked &&
                "cursor-not-allowed border-stone-500/40 bg-muted text-muted-foreground"
            )}
            data-end-date={toDateInputValue(milestone.endAt)}
            data-gantt-interactive="true"
            data-highlight-tone={effectiveHighlightTone ?? "none"}
            data-highlighted={effectiveHighlightTone ? "true" : "false"}
            data-locked={milestone.isDragLocked ? "true" : "false"}
            data-selected={selected ? "true" : "false"}
            data-start-date={toDateInputValue(milestone.startAt)}
            data-testid={`timeline-milestone-${milestone.id}`}
            onClick={(event) => {
              if (handledModifiedPointerRef.current) {
                handledModifiedPointerRef.current = false;
                return;
              }
              onTimelineClick(milestone.id, event);
              if (event.shiftKey || event.metaKey || event.ctrlKey) {
                return;
              }
              window.dispatchEvent(
                new CustomEvent("drawflow-open-milestone-detail", {
                  detail: milestone.id,
                })
              );
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") {
                return;
              }
              event.preventDefault();
              onTimelineClick(milestone.id, event);
              window.dispatchEvent(
                new CustomEvent("drawflow-open-milestone-detail", {
                  detail: milestone.id,
                })
              );
            }}
            onMouseEnter={() => setPreviewOpen(true)}
            onMouseLeave={() => setPreviewOpen(false)}
            onPointerDown={(event) => {
              if (event.shiftKey || event.metaKey || event.ctrlKey) {
                handledModifiedPointerRef.current = true;
                event.preventDefault();
                event.stopPropagation();
                onTimelineClick(milestone.id, event);
              }
            }}
            role="button"
            style={{
              scrollMarginLeft:
                "calc(var(--gantt-leading-sidebar-width) + var(--gantt-kibo-sidebar-width) + 2rem)",
            }}
            tabIndex={0}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: feature.status.color }}
            />
            <span className="min-w-0 flex-1 truncate text-[0.68rem]">
              <span className="font-medium text-foreground">
                {feature.name}
              </span>
            </span>
            <IssueChip
              compact
              issues={milestone.issues}
              testId={`gantt-issue-chip-${milestone.id}`}
            />
            {milestone.isDragLocked ? (
              <Lock className="size-3 shrink-0 text-cyan-700 dark:text-cyan-100" />
            ) : null}
          </div>
        }
      />
      <HoverCardContent
        className="border border-border bg-popover text-foreground"
        data-testid={`gantt-preview-${milestone.id}`}
        side="top"
      >
        <div className="grid gap-1">
          <div className="font-medium">{milestone.name}</div>
          <div className="text-muted-foreground">
            {statusLabels[milestone.status]}
          </div>
          <div className="text-muted-foreground">
            {scheduleDateRangeLabel({
              baseDate: scheduleBaseDate,
              displayMode: scheduleDisplayMode,
              endAt: milestone.endAt,
              startAt: milestone.startAt,
            })}{" "}
            / {compactMoney(milestone.estimatedCost)}
          </div>
          <IssueList
            issues={milestone.issues}
            surface="gantt-preview"
            testIdPrefix={`gantt-preview-issue-${milestone.id}`}
          />
        </div>
      </HoverCardContent>
    </HoverCard>
  );

  if (!canShowParentMoveMenu) {
    return block;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="flex h-full min-w-0 flex-1"
        render={<div />}
      >
        {block}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-72">
        <ContextMenuGroup>
          <ContextMenuLabel className="truncate">
            Move sub-milestone
          </ContextMenuLabel>
          <ContextMenuSeparator />
          {parentMoveDisabled ? (
            <ContextMenuItem disabled>
              {parentMoveDisabledReason}
            </ContextMenuItem>
          ) : (
            parentMoveTargets.map((target) => (
              <ContextMenuItem
                disabled={target.disabled}
                key={target.id}
                onClick={(event) => {
                  event.preventDefault();
                  setPreviewOpen(false);
                  void workspace.moveSubmilestoneToParent?.(
                    milestone.id,
                    target.id
                  );
                }}
              >
                <MoveRight aria-hidden="true" />
                <span className="truncate">Move to {target.label}</span>
              </ContextMenuItem>
            ))
          )}
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function MilestoneGhostBlock({
  feature,
  milestone,
}: {
  feature: GanttFeature;
  milestone: Milestone;
}) {
  return (
    <div
      className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-sm border border-cyan-200/70 bg-cyan-300/20 px-1.5 text-left shadow-[0_0_0_1px_rgba(103,232,249,0.18)]"
      data-testid={`timeline-milestone-ghost-${milestone.id}`}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full opacity-80"
        style={{ backgroundColor: feature.status.color }}
      />
      <span className="min-w-0 flex-1 truncate text-[0.68rem] text-cyan-950 dark:text-cyan-50">
        <span className="font-medium">{feature.name}</span>
      </span>
    </div>
  );
}
