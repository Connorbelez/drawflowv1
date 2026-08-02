import { ArrowUpRight, Flag, Plus } from "lucide-react";
import { type Dispatch, type SetStateAction, useState } from "react";
import { toast } from "sonner";

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
import type {
  ActionStatus,
  CollaborationActionItem,
  CollaborationActionItemQueueRow,
} from "./model.ts";

type MoveActionItem = (
  actionItemId: Id<"buildActionItems">,
  status: ActionStatus,
  reason?: string,
  expectedRevision?: number
) => Promise<void>;

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
    compactOnNarrow && mobileExpanded ? rows.length : visibleCount
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
                  <div className="flex items-start justify-between gap-2">
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
                  <span className="flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-sm max-xl:w-auto max-xl:border-0 max-xl:p-0">
                    <span className="max-xl:sr-only">Open details</span>
                    <ArrowUpRight aria-hidden="true" className="size-4" />
                  </span>
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
}: {
  actionView: "board" | "list";
  items: CollaborationActionItem[];
  mutationsAllowed: boolean;
  onCreate: () => void;
  onMove: MoveActionItem;
  onOpen: (actionItemId: Id<"buildActionItems">) => void;
}) {
  const columns: Array<{ label: string; status: ActionStatus }> = [
    { label: "To do", status: "todo" },
    { label: "In progress", status: "in_progress" },
    { label: "In review", status: "in_review" },
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
        <div className="grid gap-2 lg:grid-cols-4">
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
}: {
  item: CollaborationActionItem;
  mutationsAllowed: boolean;
  onMove: MoveActionItem;
  onOpen: (actionItemId: Id<"buildActionItems">) => void;
}) {
  const [pendingTerminalStatus, setPendingTerminalStatus] = useState<
    "blocked" | "cancelled" | null
  >(null);
  const [reason, setReason] = useState("");

  const selectStatus = (status: ActionStatus) => {
    if (status === "blocked" || status === "cancelled") {
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
      toast.error(
        pendingTerminalStatus === "cancelled"
          ? "Explain why this Action Item is being cancelled."
          : "Explain what is blocking this Action Item."
      );
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

  return (
    <Card
      className="rounded-xl"
      data-collaboration-focus={`actionItem:${item._id}`}
    >
      <CardPanel className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm">{item.title}</p>
          <Badge variant="outline">{item.priority}</Badge>
        </div>
        <Button
          className="w-full justify-between"
          onClick={() => onOpen(item._id)}
          size="sm"
          type="button"
          variant="outline"
        >
          Open details
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </Button>
        <Select
          disabled={!mutationsAllowed}
          onValueChange={(value) => selectStatus(value as ActionStatus)}
          value={item.status}
        >
          <SelectTrigger aria-label={`Status for ${item.title}`} size="sm">
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
        {pendingTerminalStatus ? (
          <div className="space-y-2 rounded-lg border bg-muted/20 p-2">
            <Input
              aria-label={
                pendingTerminalStatus === "cancelled"
                  ? `Cancellation reason for ${item.title}`
                  : `Blocked reason for ${item.title}`
              }
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                pendingTerminalStatus === "cancelled"
                  ? "Why is this being cancelled?"
                  : "What is blocking this work?"
              }
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
              <Button
                onClick={confirmReasonedTransition}
                size="sm"
                type="button"
              >
                Confirm
              </Button>
            </div>
          </div>
        ) : null}
      </CardPanel>
    </Card>
  );
}
