"use client";

import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import {
  formatCentsExact,
  formatDate,
  formatRelative,
  initialsFor,
} from "./format";

export interface MilestoneSheetData {
  canStartWork?: boolean;
  column: string;
  contractors: { name: string; initials: string; role?: string }[];
  drawGroupKey: string;
  milestoneKey: string;
  name: string;
  recentEvents: {
    _id: string;
    title: string;
    actor: string;
    createdAt: number;
  }[];
  requestedAmountCents?: number;
  reviewRequest?: {
    note: string;
    requestedAt?: number;
  };
  submittedAt?: number;
}

interface MilestoneDetailSheetProps {
  assignmentsSourceLabel?: string;
  data: MilestoneSheetData | null;
  errorMessage?: string;
  eventsSourceLabel?: string;
  onApprove?: (milestoneKey: string, note?: string) => Promise<void> | void;
  onAssignContractor?: (milestoneKey: string) => void;
  onAssignVisit?: (milestoneKey: string) => void;
  onClose: () => void;
  onReject?: (milestoneKey: string) => void;
  onRequestInfo?: (milestoneKey: string, note: string) => void;
  onStartWork?: (milestoneKey: string, note?: string) => Promise<void> | void;
  pending?: boolean;
}

export function MilestoneDetailSheet({
  data,
  pending,
  errorMessage,
  assignmentsSourceLabel = "demo_milestoneContractors",
  eventsSourceLabel = "demo_timelineEvents",
  onApprove,
  onAssignContractor,
  onRequestInfo,
  onAssignVisit,
  onReject,
  onStartWork,
  onClose,
}: MilestoneDetailSheetProps) {
  const [note, setNote] = useState("");

  useEffect(() => {
    setNote("");
  }, [data?.milestoneKey]);

  useEffect(() => {
    if (!data) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [data, onClose]);

  if (!data) {
    return null;
  }
  const hasReviewAction = Boolean(
    onApprove || onAssignVisit || onReject || onRequestInfo
  );
  const hasStartWorkAction = Boolean(data.canStartWork && onStartWork);
  const hasFooterAction = Boolean(
    hasReviewAction || hasStartWorkAction || onAssignContractor
  );
  return (
    <div
      aria-label="Milestone detail"
      aria-modal="false"
      className="fixed inset-0 z-50"
      data-testid="milestone-detail-sheet"
      role="dialog"
    >
      <button
        aria-label="Close milestone detail"
        className="absolute inset-0 bg-black/40"
        data-testid="milestone-detail-sheet-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside
        className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-xl border-border border-t bg-card p-3 shadow-2xl sm:inset-x-auto sm:top-0 sm:right-0 sm:bottom-auto sm:h-full sm:max-h-none sm:w-[640px] sm:max-w-full sm:rounded-none sm:border-t-0 sm:border-l sm:p-5"
        data-testid="milestone-detail-sheet-panel"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
              Milestone detail
            </p>
            <h2 className="text-wrap break-words font-semibold text-lg">
              {data.name}
            </h2>
            <p className="text-muted-foreground text-xs">
              {data.column} · Linked draw {data.drawGroupKey.toUpperCase()}
            </p>
          </div>
          <button
            aria-label="Close"
            className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-accent"
            data-testid="milestone-detail-sheet-close"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </header>

        <section className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <KpiCell label="Status" value={data.column} />
          <KpiCell
            label="Unlock value"
            value={
              data.requestedAmountCents
                ? formatCentsExact(data.requestedAmountCents)
                : "—"
            }
          />
          <KpiCell
            label="Submitted"
            value={data.submittedAt ? formatDate(data.submittedAt) : "—"}
          />
        </section>

        {data.reviewRequest ? (
          <section
            aria-labelledby="milestone-requested-changes-heading"
            className="rounded-lg border border-destructive/30 bg-destructive/8 p-3"
          >
            <h3
              className="font-semibold text-destructive-text text-sm"
              id="milestone-requested-changes-heading"
            >
              Requested changes
            </h3>
            {data.reviewRequest.requestedAt ? (
              <p className="mt-1 text-muted-foreground text-xs">
                Requested {formatDate(data.reviewRequest.requestedAt)}
              </p>
            ) : null}
            <p className="mt-2 whitespace-pre-wrap text-sm">
              {data.reviewRequest.note}
            </p>
          </section>
        ) : null}

        <section>
          <h3 className="mb-2 text-[11px] text-muted-foreground uppercase tracking-wider">
            Assignments · {assignmentsSourceLabel}
          </h3>
          {data.contractors.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No contractors assigned.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.contractors.map((c) => (
                <li
                  className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-background/60 p-2"
                  key={`${c.name}-${c.role ?? ""}`}
                >
                  <span className="grid size-8 place-items-center rounded-full bg-primary/30 font-semibold text-xs">
                    {c.initials || initialsFor(c.name)}
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="break-words">{c.name}</p>
                    {c.role ? (
                      <p className="text-[11px] text-muted-foreground">
                        {c.role}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-[11px] text-muted-foreground uppercase tracking-wider">
            Recent events · {eventsSourceLabel}
          </h3>
          {data.recentEvents.length === 0 ? (
            <p className="text-muted-foreground text-xs">No recent events.</p>
          ) : (
            <ol className="space-y-2">
              {data.recentEvents.map((event) => (
                <li
                  className="rounded-md border border-border bg-background/60 p-2 text-xs"
                  key={event._id}
                >
                  <p className="font-semibold">{event.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {event.actor} · {formatRelative(event.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        {hasReviewAction || hasStartWorkAction ? (
          <section className="rounded-lg border border-border bg-background/60 p-3">
            <label
              className="text-[11px] text-muted-foreground uppercase tracking-wider"
              htmlFor="milestone-sheet-note"
            >
              {hasReviewAction ? "Approval / review note" : "Milestone note"}
            </label>
            <textarea
              className="mt-2 min-h-[80px] w-full rounded-md border border-border bg-card p-2 text-sm"
              data-testid="milestone-detail-sheet-note"
              id="milestone-sheet-note"
              onChange={(e) => setNote(e.target.value)}
              value={note}
            />
            {errorMessage ? (
              <p className="mt-2 text-destructive text-xs" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </section>
        ) : null}

        {hasFooterAction ? (
          <footer className="mt-auto flex flex-col gap-2">
            {hasStartWorkAction ? (
              <Button
                className="w-full"
                data-testid="milestone-detail-sheet-start-work"
                disabled={pending}
                onClick={() =>
                  onStartWork?.(data.milestoneKey, note || undefined)
                }
                size="sm"
                type="button"
                variant="default"
              >
                <Play className="size-4" />
                Start work
              </Button>
            ) : null}
            {onApprove ? (
              <button
                className="rounded-md border border-primary/40 bg-primary/30 px-3 py-2 font-medium text-sm disabled:opacity-50"
                data-testid="milestone-detail-sheet-approve"
                disabled={pending}
                onClick={() => onApprove(data.milestoneKey, note || undefined)}
                type="button"
              >
                {pending ? "Approving…" : "Approve milestone"}
              </button>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              {onAssignContractor ? (
                <button
                  className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-xs hover:bg-accent"
                  data-testid="milestone-detail-sheet-assign-contractor"
                  onClick={() => onAssignContractor(data.milestoneKey)}
                  type="button"
                >
                  Assign contractor
                </button>
              ) : null}
              {onRequestInfo ? (
                <button
                  className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-xs hover:bg-accent"
                  data-testid="milestone-detail-sheet-request-info"
                  onClick={() => onRequestInfo(data.milestoneKey, note)}
                  type="button"
                >
                  Request more info
                </button>
              ) : null}
              {onAssignVisit ? (
                <button
                  className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-xs hover:bg-accent"
                  data-testid="milestone-detail-sheet-assign-visit"
                  onClick={() => onAssignVisit(data.milestoneKey)}
                  type="button"
                >
                  Assign site visit
                </button>
              ) : null}
              {onReject ? (
                <button
                  className="flex-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs hover:bg-destructive/20"
                  data-testid="milestone-detail-sheet-reject"
                  onClick={() => onReject(data.milestoneKey)}
                  type="button"
                >
                  Reject
                </button>
              ) : null}
            </div>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}

function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-2">
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p className="font-semibold text-sm">{value}</p>
    </div>
  );
}
