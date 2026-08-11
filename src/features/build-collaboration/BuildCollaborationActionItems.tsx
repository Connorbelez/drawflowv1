import {
  Bell,
  CalendarClock,
  Clock3,
  Flag,
  Link2,
  MessageCircle,
  Plus,
  UserRound,
} from "lucide-react";
import { type Dispatch, type SetStateAction, useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import { cn } from "#/lib/utils.ts";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
import { focusForBuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
import {
  type ActionStatus,
  type CollaborationActionItem,
  type CollaborationActionItemQueueRow,
  classifyCollaborationActionItem,
  initials,
  isCanonicalMilestoneItem,
  type ReferenceOption,
  systemPresentationLabels,
  systemPresentationSummary,
} from "./model.ts";

type MoveActionItem = (
  actionItemId: Id<"buildActionItems">,
  status: ActionStatus,
  reason?: string,
  expectedRevision?: number
) => Promise<void>;

type SystemPresentation = NonNullable<
  CollaborationActionItem["systemPresentation"]
>;

function SystemPresentationBadges({
  id,
  presentation,
}: {
  id?: string;
  presentation?: SystemPresentation;
}) {
  if (!presentation) {
    return null;
  }
  const summary = systemPresentationSummary(presentation);
  return (
    <fieldset
      aria-label={summary}
      className="m-0 flex min-w-0 flex-wrap items-center gap-1 border-0 p-0"
      id={id}
    >
      <Badge
        variant={
          presentation.column === "behind_schedule" ? "warning" : "outline"
        }
      >
        {systemPresentationLabels[presentation.column]}
      </Badge>
      {presentation.attention === "overdue_completion" ? (
        <Badge variant="destructive">Overdue completion</Badge>
      ) : null}
      {presentation.executionOwnership?.state === "assignment_required" ? (
        <Badge variant="warning">Assignment required</Badge>
      ) : null}
      {presentation.state === "unknown" ? (
        <span className="text-muted-foreground text-xs">
          Schedule state unavailable
          {presentation.unknownReason ? `: ${presentation.unknownReason}` : ""}
        </span>
      ) : null}
    </fieldset>
  );
}

function actionItemQueueVisibleCount({
  compactOnNarrow,
  mobileExpanded,
  rowCount,
  visibleCount,
}: {
  compactOnNarrow: boolean;
  mobileExpanded: boolean;
  rowCount: number;
  visibleCount: number;
}) {
  return compactOnNarrow && mobileExpanded ? rowCount : visibleCount;
}

export function BuildCollaborationActionItemQueue({
  compactOnNarrow = false,
  emptyLabel,
  hasMore = false,
  loading = false,
  loadingMore = false,
  onLoadMore,
  onOpen,
  rows,
  title,
}: {
  compactOnNarrow?: boolean;
  emptyLabel: string;
  hasMore?: boolean;
  loading?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onOpen: (row: CollaborationActionItemQueueRow) => void;
  rows: CollaborationActionItemQueueRow[];
  title: string;
}) {
  const [visibleCount, setVisibleCount] = useState(5);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const visibleRows = rows.slice(
    0,
    actionItemQueueVisibleCount({
      compactOnNarrow,
      mobileExpanded,
      rowCount: rows.length,
      visibleCount,
    })
  );
  const remainingCount = Math.max(0, rows.length - visibleRows.length);
  const generatedCount = rows.filter(
    (row) =>
      classifyCollaborationActionItem(row.item).kind ===
      "generated_submilestone"
  ).length;
  const actionItemCount = rows.length - generatedCount;
  return (
    <Frame>
      <FramePanel className="space-y-3 p-3">
        <ActionItemQueueHeader
          actionItemCount={actionItemCount}
          generatedCount={generatedCount}
          hasMore={hasMore}
          title={title}
        />
        <ActionItemQueueContent
          compactOnNarrow={compactOnNarrow}
          emptyLabel={emptyLabel}
          hasMore={hasMore}
          loading={loading}
          loadingMore={loadingMore}
          mobileExpanded={mobileExpanded}
          onLoadMore={onLoadMore}
          onOpen={onOpen}
          remainingCount={remainingCount}
          rows={rows}
          setMobileExpanded={setMobileExpanded}
          setVisibleCount={setVisibleCount}
          title={title}
          visibleRows={visibleRows}
        />
      </FramePanel>
    </Frame>
  );
}

function ActionItemQueueHeader({
  actionItemCount,
  generatedCount,
  hasMore,
  title,
}: {
  actionItemCount: number;
  generatedCount: number;
  hasMore: boolean;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Flag aria-hidden="true" className="size-4 text-primary" />
        <p className="font-medium text-sm">{title}</p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1">
        {generatedCount > 0 ? (
          <Badge variant="secondary">
            {generatedCount} Sub-milestone{generatedCount === 1 ? "" : "s"}
            {hasMore ? "+" : ""}
          </Badge>
        ) : null}
        {actionItemCount > 0 || generatedCount === 0 ? (
          <Badge variant="outline">
            {actionItemCount} Action Item{actionItemCount === 1 ? "" : "s"}
            {hasMore ? "+" : ""}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function ActionItemQueueContent({
  compactOnNarrow,
  emptyLabel,
  hasMore,
  loading,
  loadingMore,
  mobileExpanded,
  onLoadMore,
  onOpen,
  remainingCount,
  rows,
  setMobileExpanded,
  setVisibleCount,
  title,
  visibleRows,
}: {
  compactOnNarrow: boolean;
  emptyLabel: string;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  mobileExpanded: boolean;
  onLoadMore?: () => void;
  onOpen: (row: CollaborationActionItemQueueRow) => void;
  remainingCount: number;
  rows: CollaborationActionItemQueueRow[];
  setMobileExpanded: Dispatch<SetStateAction<boolean>>;
  setVisibleCount: Dispatch<SetStateAction<number>>;
  title: string;
  visibleRows: CollaborationActionItemQueueRow[];
}) {
  if (loading) {
    return <p className="text-muted-foreground text-xs">Loading work…</p>;
  }
  if (rows.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">{emptyLabel}</p>
        <QueueLoadMoreButton
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={onLoadMore}
          remainingCount={0}
          setVisibleCount={setVisibleCount}
          totalRows={rows.length}
        />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {visibleRows.map((row, index) => (
        <ActionItemQueueRowCard
          compactOnNarrow={compactOnNarrow}
          index={index}
          key={row.item._id}
          mobileExpanded={mobileExpanded}
          onOpen={onOpen}
          row={row}
          title={title}
        />
      ))}
      {compactOnNarrow && (rows.length > 3 || hasMore) ? (
        <Button
          className="w-full xl:hidden"
          onClick={() => setMobileExpanded((current) => !current)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {mobileExpanded
            ? "Show fewer"
            : `View all ${rows.length}${hasMore ? "+" : ""}`}
        </Button>
      ) : null}
      <QueueLoadMoreButton
        className={cn(compactOnNarrow && !mobileExpanded && "max-xl:hidden")}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        remainingCount={remainingCount}
        setVisibleCount={setVisibleCount}
        totalRows={rows.length}
      />
    </div>
  );
}

function ActionItemQueueRowCard({
  compactOnNarrow,
  index,
  mobileExpanded,
  onOpen,
  row,
  title,
}: {
  compactOnNarrow: boolean;
  index: number;
  mobileExpanded: boolean;
  onOpen: (row: CollaborationActionItemQueueRow) => void;
  row: CollaborationActionItemQueueRow;
  title: string;
}) {
  const presentation = classifyCollaborationActionItem(row.item);
  const systemSummary = systemPresentationSummary(row.item.systemPresentation);
  const systemSummaryId = systemSummary
    ? `queue-system-presentation-${String(title).replace(
        /[^a-zA-Z0-9_-]/g,
        "-"
      )}-${index}-${String(row.item._id).replace(/[^a-zA-Z0-9_-]/g, "-")}`
    : undefined;
  return (
    <Card
      className={cn(
        "rounded-xl text-left",
        compactOnNarrow &&
          "max-xl:rounded-lg max-xl:border-0 max-xl:bg-transparent max-xl:shadow-none max-xl:before:hidden",
        compactOnNarrow && index >= 3 && !mobileExpanded && "max-xl:hidden"
      )}
      render={
        <button
          aria-describedby={systemSummaryId}
          aria-label={`Open ${presentation.label}: ${row.item.title}`}
          onClick={() => onOpen(row)}
          type="button"
        />
      }
    >
      <CardPanel className="space-y-2 p-3 max-xl:flex max-xl:items-center max-xl:gap-2 max-xl:p-2">
        <div className="flex w-full items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{row.item.title}</p>
            <Badge
              className="mt-1"
              variant={
                presentation.kind === "generated_submilestone"
                  ? "secondary"
                  : "outline"
              }
            >
              {presentation.label}
            </Badge>
            <p className="truncate text-muted-foreground text-xs">
              {row.buildName}
            </p>
            {row.item.systemPresentation ? (
              <SystemPresentationBadges
                presentation={row.item.systemPresentation}
              />
            ) : null}
          </div>
          {row.overdue && presentation.kind !== "generated_submilestone" ? (
            <Badge variant="destructive">Overdue</Badge>
          ) : null}
        </div>
        {systemSummary ? (
          <span className="sr-only" id={systemSummaryId}>
            {systemSummary}
          </span>
        ) : null}
      </CardPanel>
    </Card>
  );
}

function QueueLoadMoreButton({
  className,
  hasMore,
  loadingMore,
  onLoadMore,
  remainingCount,
  setVisibleCount,
  totalRows,
}: {
  className?: string;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore?: () => void;
  remainingCount: number;
  setVisibleCount: Dispatch<SetStateAction<number>>;
  totalRows: number;
}) {
  if (!(remainingCount > 0 || hasMore)) {
    return null;
  }
  const label = loadingMore
    ? "Loading more…"
    : remainingCount > 0
      ? `Show ${Math.min(5, remainingCount)} more of ${remainingCount}`
      : "Load more Action Items";
  return (
    <Button
      className={cn("w-full", className)}
      disabled={loadingMore}
      onClick={() => {
        if (remainingCount > 0) {
          setVisibleCount((current) => Math.min(current + 5, totalRows));
          return;
        }
        onLoadMore?.();
      }}
      size="sm"
      type="button"
      variant="ghost"
    >
      {label}
    </Button>
  );
}

export function BuildCollaborationActionItems({
  actionView,
  items,
  mutationsAllowed,
  onCreate,
  onMove,
  onOpen,
  participants,
}: {
  actionView: "board" | "list";
  items: CollaborationActionItem[];
  mutationsAllowed: boolean;
  onCreate: () => void;
  onMove: MoveActionItem;
  onOpen: (target: BuildDetailTarget) => void;
  participants: ReferenceOption[];
}) {
  const columns: Array<{ label: string; status: ActionStatus }> = [
    { label: "To do", status: "todo" },
    { label: "In progress", status: "in_progress" },
    { label: "In review", status: "in_review" },
    { label: "Blocked", status: "blocked" },
    { label: "Done", status: "done" },
  ];
  const generatedCount = items.filter(
    (item) =>
      classifyCollaborationActionItem(item).kind === "generated_submilestone"
  ).length;
  const actionItemCount = items.length - generatedCount;
  const countSummary = [
    generatedCount > 0
      ? `${generatedCount} Sub-milestone${generatedCount === 1 ? "" : "s"}`
      : undefined,
    actionItemCount > 0
      ? `${actionItemCount} Action Item${actionItemCount === 1 ? "" : "s"}`
      : undefined,
  ]
    .filter(Boolean)
    .join(" and ");

  return (
    <section className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          {countSummary || "No Action Items"} anchored to this post
        </p>
        <Button
          disabled={!mutationsAllowed}
          onClick={onCreate}
          size="sm"
          type="button"
        >
          <Plus aria-hidden="true" className="size-4" />
          Add Action Item
        </Button>
      </div>
      {items.length === 0 ? (
        <Frame>
          <FramePanel className="border-dashed py-8 text-center text-muted-foreground text-sm">
            No Action Items on this post yet.
          </FramePanel>
        </Frame>
      ) : actionView === "board" ? (
        <div className="max-w-full overflow-x-auto pb-2">
          <div className="grid min-w-[68rem] grid-cols-5 gap-2">
            {columns.map((column) => (
              <Frame key={column.status}>
                <FramePanel className="h-full bg-muted/20 p-2">
                  <p className="mb-2 font-medium text-xs">{column.label}</p>
                  <div className="space-y-2">
                    {items
                      .filter(
                        (item) => actionItemBoardStatus(item) === column.status
                      )
                      .map((item) => (
                        <ActionItemCard
                          item={item}
                          key={item._id}
                          mutationsAllowed={mutationsAllowed}
                          onMove={onMove}
                          onOpen={onOpen}
                          participants={participants}
                          view="board"
                        />
                      ))}
                  </div>
                </FramePanel>
              </Frame>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <ActionItemCard
              item={item}
              key={item._id}
              mutationsAllowed={mutationsAllowed}
              onMove={onMove}
              onOpen={onOpen}
              participants={participants}
              view="list"
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ActionItemCard({
  item,
  mutationsAllowed,
  onMove,
  onOpen,
  participants,
  view,
}: {
  item: CollaborationActionItem;
  mutationsAllowed: boolean;
  onMove: MoveActionItem;
  onOpen: (target: BuildDetailTarget) => void;
  participants: ReferenceOption[];
  view: "board" | "list";
}) {
  const presentation = classifyCollaborationActionItem(item);
  if (presentation.kind === "generated_submilestone") {
    return (
      <GeneratedSubmilestoneCard
        item={item}
        onOpen={onOpen}
        target={presentation.target}
        view={view}
      />
    );
  }
  return (
    <GenericActionItemCard
      item={item}
      mutationsAllowed={mutationsAllowed}
      onMove={onMove}
      onOpen={onOpen}
      participants={participants}
      view={view}
    />
  );
}

function GeneratedSubmilestoneCard({
  item,
  onOpen,
  target,
  view,
}: {
  item: CollaborationActionItem;
  onOpen: (target: BuildDetailTarget) => void;
  target: BuildDetailTarget;
  view: "board" | "list";
}) {
  const systemSummary = systemPresentationSummary(item.systemPresentation);
  const systemSummaryId = systemSummary
    ? `submilestone-system-presentation-${String(item._id).replace(
        /[^a-zA-Z0-9_-]/g,
        "-"
      )}`
    : undefined;
  const card = (
    <Card
      aria-describedby={systemSummaryId}
      aria-label={`Open Sub-milestone: ${item.title}`}
      className={cn(
        "w-full rounded-lg text-left shadow-none transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        view === "board" && "min-h-24"
      )}
      data-collaboration-focus={focusForBuildDetailTarget(target)}
      onClick={() => onOpen(target)}
      render={<button type="button" />}
    >
      <CardPanel
        className={cn(
          "gap-3 p-3",
          view === "board"
            ? "grid min-h-24 content-between"
            : "flex min-h-12 items-center justify-between"
        )}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <p className="break-words font-medium text-sm leading-5 [overflow-wrap:anywhere]">
            {item.title}
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="secondary">Sub-milestone</Badge>
            <SystemPresentationBadges
              id={systemSummaryId}
              presentation={item.systemPresentation}
            />
          </div>
        </div>
        <CanonicalSubmilestoneMetadata presentation={item.systemPresentation} />
      </CardPanel>
    </Card>
  );
  if (view === "board") {
    return card;
  }
  return (
    <div className="space-y-2">
      {card}
      <p className="text-muted-foreground text-xs">
        Status follows the canonical Sub-milestone.
      </p>
    </div>
  );
}

function GenericActionItemCard({
  item,
  mutationsAllowed,
  onMove,
  onOpen,
  participants,
  view,
}: {
  item: CollaborationActionItem;
  mutationsAllowed: boolean;
  onMove: MoveActionItem;
  onOpen: (target: BuildDetailTarget) => void;
  participants: ReferenceOption[];
  view: "board" | "list";
}) {
  const [pendingTerminalStatus, setPendingTerminalStatus] = useState<
    "blocked" | null
  >(null);
  const [reason, setReason] = useState("");
  const assignee = participants.find(
    (participant) => participant.id === item.assigneeWorkosUserId
  );
  const assigneeLabel =
    assignee?.label ??
    (item.assigneeWorkosUserId ? "Assigned participant" : "No assignee");
  const assignmentStateLabel =
    item.assignmentState === "requested"
      ? "Acceptance requested"
      : item.assignmentState === "assigned"
        ? "Assigned"
        : "Unassigned";
  const unreadCommentCount = item.unreadCommentCount ?? 0;
  const otherUnreadCount = Math.max(
    0,
    (item.actionableUnreadCount ?? 0) - unreadCommentCount
  );
  const target = classifyCollaborationActionItem(item).target;

  const selectStatus = (status: ActionStatus) => {
    if (status === "blocked") {
      setPendingTerminalStatus(status);
      setReason("");
      return;
    }
    setPendingTerminalStatus(null);
    onMove(item._id, status, undefined, item.currentRevision).catch(
      () => undefined
    );
  };

  const confirmReasonedTransition = () => {
    const normalizedReason = reason.trim();
    if (!(pendingTerminalStatus && normalizedReason)) {
      toast.error("Explain what is blocking this Action Item.");
      return;
    }
    onMove(
      item._id,
      pendingTerminalStatus,
      normalizedReason,
      item.currentRevision
    ).catch(() => undefined);
    setPendingTerminalStatus(null);
    setReason("");
  };

  const renderTerminalReasonEditor = () =>
    pendingTerminalStatus ? (
      <Frame>
        <FramePanel className="space-y-2 bg-muted/20 p-2">
          <Input
            aria-label={`Blocked reason for ${item.title}`}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What is blocking this work?"
            value={reason}
          />
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => setPendingTerminalStatus(null)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button onClick={confirmReasonedTransition} size="sm" type="button">
              Confirm
            </Button>
          </div>
        </FramePanel>
      </Frame>
    ) : null;

  const actionItemCard = (
    <Card
      aria-label={`Open Action Item: ${item.title}`}
      className={cn(
        "w-full rounded-lg text-left shadow-none transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        view === "board" && "min-h-24"
      )}
      data-collaboration-focus={focusForBuildDetailTarget(target)}
      onClick={() => onOpen(target)}
      render={<button type="button" />}
    >
      <CardPanel
        className={cn(
          "gap-3 p-3",
          view === "board"
            ? "grid min-h-24 content-between"
            : "flex min-h-12 items-center justify-between"
        )}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="break-words font-medium text-sm leading-5 [overflow-wrap:anywhere]">
              {item.title}
            </p>
          </div>
        </div>
        <GenericActionItemSignals
          item={item}
          otherUnreadCount={otherUnreadCount}
          unreadCommentCount={unreadCommentCount}
        />
        <GenericActionItemMetadata
          assignee={assignee}
          assigneeLabel={assigneeLabel}
          assignmentStateLabel={assignmentStateLabel}
          item={item}
        />
      </CardPanel>
    </Card>
  );

  if (view === "board") {
    return actionItemCard;
  }

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-stretch gap-2">
        {actionItemCard}
        <Select
          disabled={!mutationsAllowed}
          onValueChange={(value) => selectStatus(value as ActionStatus)}
          value={item.status}
        >
          <SelectTrigger
            aria-label={`Status for ${item.title}`}
            className="h-auto w-36 shrink-0"
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todo">To do</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="in_review">In review</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {renderTerminalReasonEditor()}
    </div>
  );
}

function GenericActionItemSignals({
  item,
  otherUnreadCount,
  unreadCommentCount,
}: {
  item: CollaborationActionItem;
  otherUnreadCount: number;
  unreadCommentCount: number;
}) {
  const hasSignals =
    item.dependencyCount > 0 ||
    item.unblocksCount > 0 ||
    unreadCommentCount > 0 ||
    otherUnreadCount > 0;
  return (
    <>
      {hasSignals ? (
        <div className="flex min-w-0 flex-wrap gap-1">
          {item.dependencyCount > 0 ? (
            <Badge variant="warning">
              <Link2 aria-hidden="true" />
              Blocked by {item.dependencyCount}
            </Badge>
          ) : null}
          {item.unblocksCount > 0 ? (
            <Badge variant="secondary">
              <Link2 aria-hidden="true" />
              Blocking {item.unblocksCount}
            </Badge>
          ) : null}
          {unreadCommentCount > 0 ? (
            <Badge
              aria-label={`${unreadCommentCount} unread comments`}
              variant="info"
            >
              <MessageCircle aria-hidden="true" />
              {unreadCommentCount} unread
            </Badge>
          ) : null}
          {otherUnreadCount > 0 ? (
            <Badge
              aria-label={`${otherUnreadCount} other unread updates`}
              variant="outline"
            >
              <Bell aria-hidden="true" />
              {otherUnreadCount}
            </Badge>
          ) : null}
        </div>
      ) : null}
      {(item.labels ?? []).length > 0 ? (
        <div className="flex min-w-0 flex-wrap gap-1">
          {(item.labels ?? []).map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </div>
      ) : null}
      {item.status === "blocked" && item.blockedReason ? (
        <p className="line-clamp-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-amber-900 text-xs dark:text-amber-200">
          {item.blockedReason}
        </p>
      ) : null}
    </>
  );
}

function GenericActionItemMetadata({
  assignee,
  assigneeLabel,
  assignmentStateLabel,
  item,
}: {
  assignee?: ReferenceOption;
  assigneeLabel: string;
  assignmentStateLabel: string;
  item: CollaborationActionItem;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs">
      <div className="flex items-center gap-2">
        <Avatar
          aria-label={`Assignee: ${assigneeLabel}`}
          className="size-6 border text-xs"
          title={`${assigneeLabel} · ${assignmentStateLabel}`}
        >
          <AvatarFallback className="bg-muted">
            {assignee ? (
              initials(assigneeLabel)
            ) : (
              <UserRound aria-hidden="true" className="size-3.5" />
            )}
          </AvatarFallback>
        </Avatar>
        <span className="flex items-center gap-1">
          <Clock3 aria-hidden="true" className="size-3.5" />
          {actionItemAge(item.createdAt)}
        </span>
      </div>
      {item.dueAt ? (
        <span className="flex items-center gap-1">
          <CalendarClock aria-hidden="true" className="size-3.5" />
          {actionItemDueLabel(item.dueAt)}
        </span>
      ) : null}
    </div>
  );
}

function CanonicalSubmilestoneMetadata({
  presentation,
}: {
  presentation?: SystemPresentation;
}) {
  const owner = presentation?.executionOwnership;
  const start = presentation?.plannedStartDate;
  const completion = presentation?.plannedCompletionDate;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs">
      <span className="flex items-center gap-1">
        <UserRound aria-hidden="true" className="size-3.5" />
        {owner?.assigneeDisplayName ??
          (owner?.state === "assignment_required"
            ? "Assignment required"
            : "Canonical owner unavailable")}
      </span>
      {start || completion ? (
        <fieldset
          aria-label={`Planned schedule: ${start ?? "unscheduled"} to ${completion ?? "unscheduled"}`}
          className="m-0 flex min-w-0 items-center gap-1 border-0 p-0"
        >
          <CalendarClock aria-hidden="true" className="size-3.5" />
          {start ?? "Unscheduled"} – {completion ?? "Unscheduled"}
        </fieldset>
      ) : null}
    </div>
  );
}

function actionItemBoardStatus(item: CollaborationActionItem): ActionStatus {
  if (!isCanonicalMilestoneItem(item)) {
    return item.status;
  }
  switch (item.systemPresentation?.column) {
    case "in_progress":
      return "in_progress";
    case "in_review":
      return "in_review";
    case "approved":
    case "superseded":
      return "done";
    case "behind_schedule":
      return "blocked";
    default:
      return "todo";
  }
}

function actionItemAge(createdAt: number) {
  const elapsed = Math.max(0, Date.now() - createdAt);
  const days = Math.floor(elapsed / 86_400_000);
  if (days > 0) {
    return `${days}d`;
  }
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${Math.max(1, Math.floor(elapsed / 60_000))}m`;
}

function actionItemDueLabel(dueAt: number) {
  const today = new Date();
  const due = new Date(dueAt);
  const dayDelta = Math.round(
    (new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() -
      new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      ).getTime()) /
      86_400_000
  );
  if (dayDelta === 0) {
    return "Due today";
  }
  if (dayDelta === 1) {
    return "Due tomorrow";
  }
  if (dayDelta < 0) {
    return `${Math.abs(dayDelta)}d overdue`;
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(due);
}
