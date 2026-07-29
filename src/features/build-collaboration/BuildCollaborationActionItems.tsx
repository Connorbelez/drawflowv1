import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ActionStatus, CollaborationActionItem } from "./model.ts";

type MoveActionItem = (
  actionItemId: Id<"buildActionItems">,
  status: ActionStatus,
  reason?: string,
  expectedRevision?: number
) => Promise<void>;

export function BuildCollaborationActionItems({
  actionView,
  items,
  onMove,
}: {
  actionView: "board" | "list";
  items: CollaborationActionItem[];
  onMove: MoveActionItem;
}) {
  const columns: Array<{ label: string; status: ActionStatus }> = [
    { label: "To do", status: "todo" },
    { label: "In progress", status: "in_progress" },
    { label: "In review", status: "in_review" },
    { label: "Done", status: "done" },
  ];

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-8 text-center text-muted-foreground text-sm">
        No Action Items on this post.
      </div>
    );
  }

  if (actionView === "board") {
    return (
      <div className="grid gap-2 lg:grid-cols-4">
        {columns.map((column) => (
          <div className="rounded-xl bg-muted/30 p-2" key={column.status}>
            <p className="mb-2 font-medium text-xs">{column.label}</p>
            <div className="space-y-2">
              {items
                .filter((item) => item.status === column.status)
                .map((item) => (
                  <ActionItemCard item={item} key={item._id} onMove={onMove} />
                ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <ActionItemCard item={item} key={item._id} onMove={onMove} />
      ))}
    </div>
  );
}

function ActionItemCard({
  item,
  onMove,
}: {
  item: CollaborationActionItem;
  onMove: MoveActionItem;
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
    <Card className="rounded-xl">
      <CardPanel className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm">{item.title}</p>
          <Badge variant="outline">{item.priority}</Badge>
        </div>
        <Select
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
