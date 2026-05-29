"use client";

import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import { formatCents, formatDate, formatRelative, initialsFor } from "./format";

export interface MilestoneSheetData {
  canStartWork?: boolean;
  milestoneKey: string;
  name: string;
  column: string;
  drawGroupKey: string;
  requestedAmountCents?: number;
  submittedAt?: number;
  contractors: { name: string; initials: string; role?: string }[];
  recentEvents: {
    _id: string;
    title: string;
    actor: string;
    createdAt: number;
  }[];
}

interface MilestoneDetailSheetProps {
  data: MilestoneSheetData | null;
  pending?: boolean;
  errorMessage?: string;
  assignmentsSourceLabel?: string;
  eventsSourceLabel?: string;
  onApprove: (milestoneKey: string, note?: string) => Promise<void> | void;
  onRequestInfo?: (milestoneKey: string, note: string) => void;
  onAssignVisit?: (milestoneKey: string) => void;
  onReject?: (milestoneKey: string) => void;
  onStartWork?: (milestoneKey: string, note?: string) => Promise<void> | void;
  onClose: () => void;
}

export function MilestoneDetailSheet({
  data,
  pending,
  errorMessage,
  assignmentsSourceLabel = "demo_milestoneContractors",
  eventsSourceLabel = "demo_timelineEvents",
  onApprove,
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
    if (!data) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [data, onClose]);

  if (!data) return null;
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
        className="absolute top-0 right-0 flex h-full w-[640px] max-w-full flex-col gap-3 overflow-y-auto border-l border-border bg-card p-5 shadow-2xl"
        data-testid="milestone-detail-sheet-panel"
      >
        <header className="flex items-start justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
              Milestone detail
            </p>
            <h2 className="font-semibold text-lg">{data.name}</h2>
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

        <section className="grid grid-cols-3 gap-2">
          <KpiCell label="Status" value={data.column} />
          <KpiCell
            label="Unlock value"
            value={
              data.requestedAmountCents
                ? formatCents(data.requestedAmountCents)
                : "—"
            }
          />
          <KpiCell
            label="Submitted"
            value={data.submittedAt ? formatDate(data.submittedAt) : "—"}
          />
        </section>

        <section>
          <h3 className="mb-2 text-[11px] text-muted-foreground uppercase tracking-wider">
            Assignments · {assignmentsSourceLabel}
          </h3>
          {data.contractors.length === 0 ? (
            <p className="text-muted-foreground text-xs">No contractors assigned.</p>
          ) : (
            <ul className="space-y-2">
              {data.contractors.map((c) => (
                <li
                  className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-2"
                  key={`${c.name}-${c.role ?? ""}`}
                >
                  <span className="grid size-8 place-items-center rounded-full bg-primary/30 text-xs font-semibold">
                    {c.initials || initialsFor(c.name)}
                  </span>
                  <div className="text-sm">
                    <p>{c.name}</p>
                    {c.role ? (
                      <p className="text-[11px] text-muted-foreground">{c.role}</p>
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
                  <p className="text-muted-foreground text-[11px]">
                    {event.actor} · {formatRelative(event.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-lg border border-border bg-background/60 p-3">
          <label
            className="text-[11px] text-muted-foreground uppercase tracking-wider"
            htmlFor="milestone-sheet-note"
          >
            Approval / review note
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

        <footer className="mt-auto flex flex-col gap-2">
          {data.canStartWork ? (
            <Button
              className="w-full"
              data-testid="milestone-detail-sheet-start-work"
              disabled={pending || !onStartWork}
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
          <button
            className="rounded-md border border-primary/40 bg-primary/30 px-3 py-2 text-sm font-medium disabled:opacity-50"
            data-testid="milestone-detail-sheet-approve"
            disabled={pending}
            onClick={() => onApprove(data.milestoneKey, note || undefined)}
            type="button"
          >
            {pending ? "Approving…" : "Approve milestone"}
          </button>
          <div className="flex gap-2">
            <button
              className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-xs hover:bg-accent"
              data-testid="milestone-detail-sheet-request-info"
              onClick={() => onRequestInfo?.(data.milestoneKey, note)}
              type="button"
            >
              Request more info
            </button>
            <button
              className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-xs hover:bg-accent"
              data-testid="milestone-detail-sheet-assign-visit"
              onClick={() => onAssignVisit?.(data.milestoneKey)}
              type="button"
            >
              Assign site visit
            </button>
            <button
              className="flex-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive hover:bg-destructive/20"
              data-testid="milestone-detail-sheet-reject"
              onClick={() => onReject?.(data.milestoneKey)}
              type="button"
            >
              Reject
            </button>
          </div>
        </footer>
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
