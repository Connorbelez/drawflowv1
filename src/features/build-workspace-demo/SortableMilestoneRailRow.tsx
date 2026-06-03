import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, PanelRightOpen } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";
import type {
  Milestone,
  MilestoneStatus,
  WorkspaceIssue,
} from "./types";
import { useBuildWorkspace } from "./workspace-adapter";

type MilestoneHighlightTone = "selected" | "blocking" | "blocked";

const statusLabels: Record<MilestoneStatus, string> = {
  approved: "Approved",
  blocked: "Blocked",
  evidenceRequired: "Evidence required",
  evidenceSubmitted: "Evidence submitted",
  inProgress: "In progress",
  notStarted: "Not started",
  proposed: "Proposed",
  underReview: "Under review",
};

const statusColors: Record<MilestoneStatus, string> = {
  approved: "#7dd3a8",
  blocked: "#f97373",
  evidenceRequired: "#fbbf24",
  evidenceSubmitted: "#67e8f9",
  inProgress: "#8ab4ff",
  notStarted: "#8b949e",
  proposed: "#c084fc",
  underReview: "#fde047",
};

const compactMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    notation: "compact",
    style: "currency",
  }).format(value);

export interface SortableMilestoneRailRowProps {
  blockedByChipActive: boolean;
  blockers: number;
  blocking: number;
  blockingChipActive: boolean;
  collapsed: boolean;
  highlightBlockers: (milestone: Milestone) => void;
  highlightBlocking: (milestone: Milestone) => void;
  highlightTone: MilestoneHighlightTone | undefined;
  index: number;
  milestone: Milestone;
  onFocusMilestone: (milestone: Milestone) => void;
  onOpenDetail: (milestoneId: string) => void;
  renderIssueChip: (issues: WorkspaceIssue[], testId: string) => ReactNode;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Extracted from the workspace file as-is to preserve row behavior.
export function SortableMilestoneRailRow({
  blockedByChipActive,
  blockers,
  blocking,
  blockingChipActive,
  collapsed,
  highlightBlockers,
  highlightBlocking,
  highlightTone,
  index,
  milestone,
  onFocusMilestone,
  onOpenDetail,
  renderIssueChip,
}: SortableMilestoneRailRowProps) {
  const workspace = useBuildWorkspace();
  const sortableDisabled =
    workspace.mode === "active" ||
    workspace.build.proposalStatus === "submitted";
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: milestone.id,
    disabled: sortableDisabled || collapsed,
  });

  return (
    // biome-ignore lint/a11y/useSemanticElements: The existing row pattern uses a div to host nested controls.
    <div
      className={cn(
        "relative grid w-full items-center overflow-hidden text-left transition-colors",
        collapsed
          ? "grid-cols-[1fr] gap-1 border-border/60 border-b px-1 hover:bg-muted/50"
          : "grid-cols-[1rem_1fr_auto] gap-2 border-border/60 border-b px-2 hover:bg-muted/50",
        highlightTone === "selected" &&
          "bg-cyan-300/10 ring-1 ring-cyan-300/45 ring-inset",
        highlightTone === "blocking" &&
          "bg-amber-300/20 ring-1 ring-amber-300/70 ring-inset",
        highlightTone === "blocked" &&
          "bg-red-500/20 ring-1 ring-red-300/70 ring-inset",
        isDragging && "z-40 opacity-70"
      )}
      data-highlight-tone={highlightTone ?? "none"}
      data-highlighted={highlightTone ? "true" : "false"}
      data-testid={`milestone-rail-row-${milestone.id}`}
      onClick={() => onFocusMilestone(milestone)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onFocusMilestone(milestone);
        }
      }}
      ref={setNodeRef}
      role="button"
      style={{
        height: collapsed ? "var(--gantt-row-height)" : "120px",
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      tabIndex={0}
    >
      {collapsed ? (
        <div className="flex items-center justify-center gap-1">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: statusColors[milestone.status] }}
          />
          <span className="truncate text-[0.62rem] text-muted-foreground">
            {milestone.code.replace("M-", "")}
          </span>
          {milestone.warningCount > 0
            ? renderIssueChip(
                milestone.issues,
                `milestone-issue-chip-${milestone.id}`
              )
            : null}
        </div>
      ) : (
        <>
          <button
            aria-label={
              sortableDisabled
                ? workspace.mode === "active"
                  ? "Reordering is available only in proposal mode."
                  : "Submitted proposals cannot be reordered."
                : `Drag ${milestone.name} to reorder`
            }
            className={cn(
              "grid size-5 place-items-center rounded-sm text-muted-foreground",
              sortableDisabled
                ? "cursor-not-allowed opacity-50"
                : "cursor-grab hover:bg-muted/60 hover:text-foreground"
            )}
            data-testid={`milestone-drag-handle-${milestone.id}`}
            disabled={sortableDisabled}
            {...attributes}
            {...listeners}
            onClick={async (event) => {
              event.stopPropagation();
              if (!sortableDisabled && index > 0) {
                await workspace.reorderMilestone(milestone.id, "up");
              }
            }}
            onDoubleClick={async (event) => {
              event.stopPropagation();
              if (!sortableDisabled && index > 0) {
                await workspace.reorderMilestone(milestone.id, "up");
              }
            }}
            title={
              sortableDisabled
                ? workspace.mode === "active"
                  ? "Reordering is disabled in active execution because the approved roadmap is locked."
                  : "Reordering is disabled after proposal submission."
                : "Drag to reorder proposal milestones"
            }
            type="button"
          >
            <GripVertical className="size-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-xs">
                {milestone.name}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[0.65rem] text-muted-foreground">
              <span>{milestone.code}</span>
              <span>{statusLabels[milestone.status]}</span>
              <span>{compactMoney(milestone.estimatedCost)}</span>
              <span>{milestone.estimatedDurationDays}d</span>
            </div>
            <div className="mt-1 flex gap-1 text-[0.62rem]">
              <button
                aria-label={`Highlight milestones blocked by ${milestone.name}`}
                className={cn(
                  "inline-flex h-4 items-center rounded-sm border border-border bg-muted/40 px-1 text-muted-foreground transition-colors hover:border-red-300/50 hover:bg-red-400/15 hover:text-red-700 dark:text-red-100",
                  blockingChipActive &&
                    "border-red-300/60 bg-red-500/20 text-red-700 dark:text-red-100"
                )}
                data-testid={`milestone-blocking-chip-${milestone.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  highlightBlocking(milestone);
                }}
                type="button"
              >
                {blocking} blocking
              </button>
              <button
                aria-label={`Highlight milestones blocking ${milestone.name}`}
                className={cn(
                  "inline-flex h-4 items-center rounded-sm border border-border bg-muted/40 px-1 text-muted-foreground transition-colors hover:border-amber-300/50 hover:bg-amber-300/15 hover:text-amber-800 dark:text-amber-100",
                  blockedByChipActive &&
                    "border-amber-300/60 bg-amber-300/20 text-amber-800 dark:text-amber-100"
                )}
                data-testid={`milestone-blocked-by-chip-${milestone.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  highlightBlockers(milestone);
                }}
                type="button"
              >
                {blockers} blocked-by
              </button>
              {milestone.warningCount > 0
                ? renderIssueChip(
                    milestone.issues,
                    `milestone-issue-chip-${milestone.id}`
                  )
                : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-1">
              <Button
                data-testid={`milestone-rail-detail-${milestone.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  workspace.selectMilestone(milestone.id);
                  onOpenDetail(milestone.id);
                }}
                size="icon-xs"
                title={`Open ${milestone.name} detail`}
                variant="ghost"
              >
                <PanelRightOpen />
              </Button>
              <Button
                data-testid={`milestone-move-up-${milestone.id}`}
                disabled={index === 0 || sortableDisabled}
                onClick={async (event) => {
                  event.stopPropagation();
                  await workspace.reorderMilestone(milestone.id, "up");
                }}
                size="icon-xs"
                title={
                  sortableDisabled
                    ? "Reorder controls are disabled outside editable proposal mode."
                    : "Move milestone up"
                }
                variant="ghost"
              >
                <ArrowUp />
              </Button>
              <Button
                data-testid={`milestone-move-down-${milestone.id}`}
                disabled={
                  index === workspace.milestones.length - 1 || sortableDisabled
                }
                onClick={async (event) => {
                  event.stopPropagation();
                  await workspace.reorderMilestone(milestone.id, "down");
                }}
                size="icon-xs"
                title={
                  sortableDisabled
                    ? "Reorder controls are disabled outside editable proposal mode."
                    : "Move milestone down"
                }
                variant="ghost"
              >
                <ArrowDown />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
