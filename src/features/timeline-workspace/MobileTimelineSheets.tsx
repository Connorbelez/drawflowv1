"use client";

import { useEffect, useState } from "react";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import type { DemoDraw, DemoMilestone } from "./-timeline-share-snapshot.ts";

function parseIntOrNull(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

// ---------------------------------------------------------------------------
// Edit milestone dates (replaces drag-to-move)
// ---------------------------------------------------------------------------

export interface EditDatesSheetProps {
  item: TimelineItem<DemoMilestone> | null;
  onClose: () => void;
  onCommit: (
    itemId: string,
    patch: { durationDays: number; x: number }
  ) => void;
}

export function EditDatesSheet({
  item,
  onClose,
  onCommit,
}: EditDatesSheetProps) {
  const [startDay, setStartDay] = useState("");
  const [duration, setDuration] = useState("");

  useEffect(() => {
    if (item?.data) {
      setStartDay(String(Math.round(item.x)));
      setDuration(String(Math.round(item.data.durationDays ?? 14)));
    }
  }, [item]);

  const open = Boolean(item?.data);
  const submit = () => {
    if (!item?.data) {
      return;
    }
    const x = parseIntOrNull(startDay);
    const durationDays = parseIntOrNull(duration);
    if (x === null || durationDays === null || durationDays < 1 || x < 0) {
      return;
    }
    onCommit(item.id, { durationDays, x });
    onClose();
  };

  return (
    <Sheet onOpenChange={(next) => (next ? undefined : onClose())} open={open}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Edit dates</SheetTitle>
        </SheetHeader>
        <SheetPanel className="grid gap-4 px-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="mobile-edit-start-day">Start day</Label>
            <Input
              data-testid="mobile-edit-start-day"
              id="mobile-edit-start-day"
              inputMode="numeric"
              onChange={(event) => setStartDay(event.currentTarget.value)}
              value={startDay}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mobile-edit-duration">Duration (days)</Label>
            <Input
              data-testid="mobile-edit-duration"
              id="mobile-edit-duration"
              inputMode="numeric"
              onChange={(event) => setDuration(event.currentTarget.value)}
              value={duration}
            />
          </div>
        </SheetPanel>
        <SheetFooter>
          <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
          <Button data-testid="mobile-edit-dates-save" onClick={submit}>
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Edit milestone budget (replaces inline-edit metric)
// ---------------------------------------------------------------------------

export interface EditBudgetSheetProps {
  item: TimelineItem<DemoMilestone> | null;
  onClose: () => void;
  onCommit: (itemId: string, patch: { amount: number }) => void;
}

export function EditBudgetSheet({
  item,
  onClose,
  onCommit,
}: EditBudgetSheetProps) {
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (item?.data) {
      setAmount(String(Math.round(item.data.amount ?? 0)));
    }
  }, [item]);

  const open = Boolean(item?.data);
  const submit = () => {
    if (!item?.data) {
      return;
    }
    const parsed = parseIntOrNull(amount);
    if (parsed === null || parsed < 0) {
      return;
    }
    onCommit(item.id, { amount: parsed });
    onClose();
  };

  return (
    <Sheet onOpenChange={(next) => (next ? undefined : onClose())} open={open}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Edit budget</SheetTitle>
        </SheetHeader>
        <SheetPanel className="grid gap-4 px-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="mobile-edit-amount">Budget (USD)</Label>
            <Input
              data-testid="mobile-edit-amount"
              id="mobile-edit-amount"
              inputMode="numeric"
              onChange={(event) => setAmount(event.currentTarget.value)}
              value={amount}
            />
          </div>
        </SheetPanel>
        <SheetFooter>
          <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
          <Button data-testid="mobile-edit-budget-save" onClick={submit}>
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Edit draw timing + amount (replaces marker drag)
// ---------------------------------------------------------------------------

export interface EditDrawSheetProps {
  draw: DemoDraw | null;
  onClose: () => void;
  onCommit: (drawId: string, patch: { amount: number; x: number }) => void;
}

export function EditDrawSheet({ draw, onClose, onCommit }: EditDrawSheetProps) {
  const [timing, setTiming] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (draw) {
      setTiming(String(Math.round(draw.x)));
      setAmount(String(Math.round(draw.amount)));
    }
  }, [draw]);

  const open = Boolean(draw);
  const submit = () => {
    if (!draw) {
      return;
    }
    const x = parseIntOrNull(timing);
    const parsedAmount = parseIntOrNull(amount);
    if (x === null || parsedAmount === null || x < 0 || parsedAmount < 0) {
      return;
    }
    onCommit(draw.id, { amount: parsedAmount, x });
    onClose();
  };

  return (
    <Sheet onOpenChange={(next) => (next ? undefined : onClose())} open={open}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Edit draw</SheetTitle>
        </SheetHeader>
        <SheetPanel className="grid gap-4 px-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="mobile-edit-draw-timing">Timing (day)</Label>
            <Input
              data-testid="mobile-edit-draw-timing"
              id="mobile-edit-draw-timing"
              inputMode="numeric"
              onChange={(event) => setTiming(event.currentTarget.value)}
              value={timing}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mobile-edit-draw-amount">Amount (USD)</Label>
            <Input
              data-testid="mobile-edit-draw-amount"
              id="mobile-edit-draw-amount"
              inputMode="numeric"
              onChange={(event) => setAmount(event.currentTarget.value)}
              value={amount}
            />
          </div>
        </SheetPanel>
        <SheetFooter>
          <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
          <Button data-testid="mobile-edit-draw-save" onClick={submit}>
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Delete (milestone or draw) — confirm + reason (replaces context-menu)
// ---------------------------------------------------------------------------

export interface DeleteSheetProps {
  description: string;
  onClose: () => void;
  onConfirm: (id: string, reason: string) => void;
  /** When true, a reason is required before the confirm handler fires. */
  requireReason?: boolean;
  target: { id: string; kind: "milestone" | "draw"; label: string } | null;
  title: string;
}

export function DeleteSheet({
  description,
  requireReason = false,
  target,
  onClose,
  onConfirm,
  title,
}: DeleteSheetProps) {
  const [reason, setReason] = useState("");
  const close = () => {
    setReason("");
    onClose();
  };

  const open = Boolean(target);
  const reasonMissing = requireReason && reason.trim().length === 0;
  const submit = () => {
    if (!target || reasonMissing) {
      return;
    }
    onConfirm(target.id, reason.trim());
    close();
  };

  return (
    <Sheet onOpenChange={(next) => (next ? undefined : close())} open={open}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <SheetPanel className="grid gap-4 px-4 py-2">
          <p className="text-muted-foreground text-sm">{description}</p>
          {requireReason ? (
            <div className="grid gap-1.5">
              <Label htmlFor="mobile-delete-reason">Reason</Label>
              <Textarea
                data-testid="mobile-delete-reason"
                id="mobile-delete-reason"
                onChange={(event) => setReason(event.currentTarget.value)}
                value={reason}
              />
            </div>
          ) : null}
        </SheetPanel>
        <SheetFooter>
          <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
          <Button
            data-testid="mobile-delete-confirm"
            disabled={reasonMissing}
            onClick={submit}
            variant="destructive"
          >
            Delete
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
