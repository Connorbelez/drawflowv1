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
import {
  type ActionStatus,
  type CollaborationActionItem,
  type CollaborationActionItemQueueRow,
  initials,
  type ReferenceOption,
} from "./model.ts";

type MoveActionItem = (
  actionItemId: Id<"buildActionItems">,
  status: ActionStatus,
  reason?: string,
  expectedRevision?: number
) => Promise<void>;

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
  return (
    <Frame>
      <FramePanel className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Flag aria-hidden="true" className="size-4 text-primary" />
            <p className="font-medium text-sm">{title}</p>
          </div>
          <Badge variant="outline">
            {rows.length}
            {hasMore ? "+" : ""}
          </Badge>
        </div>
        {loading ? (
          <p className="text-muted-foreground text-xs">Loading work…</p>
        ) : rows.length === 0 ? (
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
        ) : (
          <div className="space-y-2">
            {visibleRows.map((row, index) => (
              <Card
                className={cn(
                  "rounded-xl text-left",
                  compactOnNarrow &&
                    "max-xl:rounded-lg max-xl:border-0 max-xl:bg-transparent max-xl:shadow-none max-xl:before:hidden",
                  compactOnNarrow &&
                    index >= 3 &&
                    !mobileExpanded &&
                    "max-xl:hidden"
                )}
                key={row.item._id}
                render={
                  <button
                    aria-label={`Open ${row.item.title}`}
                    onClick={() => onOpen(row)}
                    type="button"
                  />
                }
              >
                <CardPanel className="space-y-2 p-3 max-xl:flex max-xl:items-center max-xl:gap-2 max-xl:p-2">
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">
                        {row.item.title}
                      </p>
                      <p className="truncate text-muted-foreground text-xs">
                        {row.buildName}
                      </p>
                    </div>
                    {row.overdue ? (
                      <Badge variant="destructive">Overdue</Badge>
                    ) : null}
                  </div>
                </CardPanel>
              </Card>
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
              className={cn(
                compactOnNarrow && !mobileExpanded && "max-xl:hidden"
              )}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={onLoadMore}
              remainingCount={remainingCount}
              setVisibleCount={setVisibleCount}
              totalRows={rows.length}
            />
          </div>
        )}
      </FramePanel>
    </Frame>
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
  onOpen: (actionItemId: Id<"buildActionItems">) => void;
  participants: ReferenceOption[];
}) {
  const columns: Array<{ label: string; status: ActionStatus }> = [
    { label: "To do", status: "todo" },
    { label: "In progress", status: "in_progress" },
    { label: "In review", status: "in_review" },
    { label: "Blocked", status: "blocked" },
    { label: "Done", status: "done" },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          {items.length} {items.length === 1 ? "item" : "items"} anchored to
          this post
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
        <div className="grid min-w-[68rem] grid-cols-5 gap-2 overflow-x-auto pb-2">
          {columns.map((column) => (
            <Frame key={column.status}>
              <FramePanel className="h-full bg-muted/20 p-2">
                <p className="mb-2 font-medium text-xs">{column.label}</p>
                <div className="space-y-2">
                  {items
                    .filter((item) => item.status === column.status)
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
  onOpen: (actionItemId: Id<"buildActionItems">) => void;
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
      data-collaboration-focus={`actionItem:${item._id}`}
      onClick={() => onOpen(item._id)}
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
          <p className="min-w-0 flex-1 break-words font-medium text-sm leading-5 [overflow-wrap:anywhere]">
            {item.title}
          </p>
        </div>
        {item.dependencyCount > 0 ||
        item.unblocksCount > 0 ||
        unreadCommentCount > 0 ||
        otherUnreadCount > 0 ? (
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            {item.dueAt ? (
              <span className="flex items-center gap-1">
                <CalendarClock aria-hidden="true" className="size-3.5" />
                {actionItemDueLabel(item.dueAt)}
              </span>
            ) : null}
          </div>
        </div>
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
