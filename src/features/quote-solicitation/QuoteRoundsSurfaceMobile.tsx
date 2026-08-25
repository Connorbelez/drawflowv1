import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  PackageSearch,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";
import { RecipientCommunicationHistory } from "./QuoteRoundsSurfaceCommunication.tsx";
import type { QuoteRoundRegisterRow } from "./QuoteRoundsSurfaceContracts.ts";
import {
  communicationSummary,
  DETAIL_UNAVAILABLE_LABEL,
  DETAIL_UNAVAILABLE_TITLE,
  deliveryLabel,
  formatDeadlineRelative,
  LIFECYCLE_PHASES,
  modeLabel,
  primaryActionLabel,
  stateLabel,
} from "./QuoteRoundsSurfaceContracts.ts";
import {
  PreferredQuote,
  ScopeUpdateBadge,
} from "./QuoteRoundsSurfacePresentation.tsx";

export function MobileControlRegister({
  buildId,
  expandedId,
  now,
  onExpand,
  onOpen,
  onRequestDelete,
  organizationId,
  readOnly,
  rows,
}: {
  buildId: string;
  expandedId: string | null;
  now: number;
  onExpand: (id: string | null) => void;
  onOpen?: (roundId: string) => void;
  onRequestDelete: (row: QuoteRoundRegisterRow) => void;
  organizationId: string;
  readOnly: boolean;
  rows: QuoteRoundRegisterRow[];
}) {
  return (
    <div className="lg:hidden">
      {rows.map((row, index) => {
        const expanded = expandedId === row._id;
        return (
          <section
            className={cn(
              "border-b px-4 py-4 last:border-b-0",
              row.attention?.tone === "critical" &&
                "border-l-4 border-l-destructive pl-3",
              row.attention?.tone === "warning" &&
                "border-l-4 border-l-warning pl-3"
            )}
            key={row._id}
          >
            <button
              aria-controls={`quote-round-details-${row._id}`}
              aria-expanded={expanded}
              className="flex w-full items-start gap-3 text-left"
              onClick={() => onExpand(expanded ? null : row._id)}
              type="button"
            >
              <span className="whitespace-nowrap font-semibold text-primary text-xs tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-semibold text-sm">
                      {row.title}
                    </span>
                    <ScopeUpdateBadge className="mt-1" row={row} />
                  </span>
                  <span className="text-[0.6875rem] text-muted-foreground uppercase tracking-[0.08em]">
                    {modeLabel(row.mode)}
                  </span>
                </span>
                <span className="mt-1 block text-muted-foreground text-xs">
                  {row.scope} · Package R{row.revision}
                </span>
              </span>
              {expanded ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </button>
            <div className="mt-3 grid grid-cols-2 gap-3 border-y py-3 text-xs">
              <div>
                <p className="text-muted-foreground">Deadline</p>
                <p className="mt-1 font-semibold">
                  {formatDeadlineRelative(row.responseDeadline, row.state, now)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Responses</p>
                <p className="mt-1 font-semibold tabular-nums">
                  {row.responses.submitted} / {row.responses.total}
                </p>
              </div>
            </div>
            {row.attention ? (
              <div className="mt-3 flex items-start gap-2 text-xs">
                <AlertTriangle
                  className={cn(
                    "mt-0.5 size-4 shrink-0 text-muted-foreground",
                    row.attention.tone === "critical" && "text-destructive",
                    row.attention.tone === "warning" && "text-warning"
                  )}
                />
                <div>
                  <p className="font-medium">{row.attention.label}</p>
                  <p className="mt-1 text-muted-foreground">
                    {row.attention.detail}
                  </p>
                </div>
              </div>
            ) : null}
            {expanded ? (
              <div
                className="mt-4 border-primary/50 border-l-2 pl-4"
                id={`quote-round-details-${row._id}`}
              >
                <VerticalLifecycle phase={row.state} row={row} />
                <div className="mt-4">
                  <RecipientCommunicationHistory
                    buildId={buildId}
                    organizationId={organizationId}
                    readOnly={readOnly}
                    row={row}
                  />
                </div>
                <div className="mt-4 grid gap-3 border-t pt-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Preferred Quote</p>
                    <PreferredQuote row={row} />
                  </div>
                  <div>
                    <p className="text-muted-foreground">Delivery and access</p>
                    <p className="mt-1">
                      {deliveryLabel(row)} · {row.access.active} active
                      credential
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {communicationSummary(row)}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end gap-1">
              {!readOnly && row.state === "draft" ? (
                <Button
                  aria-label={`Delete draft ${row.title}`}
                  onClick={() => onRequestDelete(row)}
                  size="icon-sm"
                  title="Delete draft"
                  variant="ghost"
                >
                  <Trash2 />
                </Button>
              ) : null}
              <Button
                aria-label={onOpen ? undefined : DETAIL_UNAVAILABLE_LABEL}
                disabled={!onOpen}
                onClick={() => onOpen?.(row._id)}
                size="sm"
                title={onOpen ? undefined : DETAIL_UNAVAILABLE_TITLE}
                variant={expanded ? "outline" : "ghost"}
              >
                {primaryActionLabel(row, onOpen, readOnly, true)}{" "}
                <ChevronRight />
              </Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function VerticalLifecycle({
  phase,
  row,
}: {
  phase: QuoteRoundRegisterRow["state"];
  row: QuoteRoundRegisterRow;
}) {
  const cancelled = phase === "cancelled";
  const activeIndex = cancelled
    ? LIFECYCLE_PHASES.length - 1
    : LIFECYCLE_PHASES.indexOf(phase);
  return (
    <ol aria-label="Quote Round lifecycle" className="grid gap-0">
      {LIFECYCLE_PHASES.map((item, index) => {
        const completed = !cancelled && index < activeIndex;
        const active = index === activeIndex;
        return (
          <li className="grid grid-cols-[1.25rem_1fr] gap-3" key={item}>
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full border text-[0.625rem]",
                  completed && "border-success/50 bg-success/12 text-success",
                  active && "border-primary bg-primary text-primary-foreground",
                  !(completed || active) && "text-muted-foreground"
                )}
              >
                {completed ? <Check className="size-3" /> : index + 1}
              </span>
              {index < LIFECYCLE_PHASES.length - 1 &&
              !(cancelled && item === "closed") ? (
                <span
                  className={cn(
                    "min-h-6 w-px flex-1 bg-border",
                    completed && "bg-success/50"
                  )}
                />
              ) : null}
            </div>
            <div className="pb-4">
              <p
                className={cn(
                  "font-medium text-muted-foreground text-xs",
                  active && "text-foreground"
                )}
              >
                {stateLabel(item)}
              </p>
              {active ? (
                <div className="mt-1 text-xs">
                  <p>{deliveryLabel(row)}</p>
                  <p className="mt-1 text-muted-foreground">
                    {row.responses.submitted} submitted ·{" "}
                    {row.responses.drafting} drafting
                  </p>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function RegisterEmpty({
  canCreate,
  onCreate,
}: {
  canCreate: boolean;
  onCreate?: () => void;
}) {
  return (
    <div className="grid min-h-72 place-items-center px-4 py-10 text-center">
      <div>
        <PackageSearch className="mx-auto size-7 text-muted-foreground" />
        <h3 className="mt-3 font-semibold">No quote requests yet</h3>
        <p className="mt-1 max-w-md text-muted-foreground text-sm">
          Quote Rounds for this Build will appear here with delivery, response,
          deadline, lifecycle, and Preferred Quote status.
        </p>
        {canCreate ? (
          <Button className="mt-4" onClick={onCreate}>
            <FilePlus2 /> Create first quote request
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="grid min-h-56 place-items-center px-4 py-8 text-center">
      <div>
        <Search className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-3 font-medium">No requests match these filters</p>
        <Button className="mt-3" onClick={onClear} size="sm" variant="outline">
          Clear filters
        </Button>
      </div>
    </div>
  );
}
