import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CircleDollarSign,
  Flag,
  House,
  ReceiptText,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, type ReactNode } from "react";

import type {
  TimelineItem,
  TimelineMarker,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "#/components/ui/context-menu.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import type {
  CapitalSpikeEditDraft,
  DrawEditDraft,
} from "./TimelineWorkspaceTypes.ts";
import type {
  DemoCapitalSpike,
  DemoDraw,
  DemoMilestone,
} from "./-timeline-share-snapshot.ts";
import {
  formatTimelineDay,
  getDrawDomId,
  getDrawTimelineMarkerCopy,
  getDrawTimelineMarkerState,
} from "./TimelineWorkspaceDrawUtils.ts";
import { cn } from "#/lib/utils.ts";
import {
  money,
} from "./TimelineWorkspaceDefaults.ts";
import { PROPOSAL_TIMELINE_MIN_DAY } from "./-timeline-share-snapshot.ts";
import { OPTIMIZED_DRAW_FEE as DRAW_FEE } from "./-timeline-draw-optimizer.ts";
import type { FinancialOverview } from "./TimelineWorkspaceTypes.ts";
import type { DrawTimelineMarkerState } from "./TimelineWorkspaceDrawUtils.ts";

export function TimelineMarkerBadge({ marker }: { marker: TimelineMarker }) {
  const toneClass = {
    accent:
      "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100",
    neutral: "border-border bg-background text-foreground dark:bg-zinc-950/80",
    today:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100",
    warning:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
  }[marker.tone ?? "neutral"];

  return (
    <motion.div
      className="flex flex-col items-center"
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ scale: 1.025, y: -1 }}
    >
      <motion.div
        className={cn(
          "rounded-md border px-2.5 py-1 text-center shadow-sm backdrop-blur",
          toneClass
        )}
        layout
      >
        <div className="whitespace-nowrap font-semibold text-xs">
          {marker.label}
        </div>
        {marker.sublabel && (
          <div className="whitespace-nowrap text-[10px] text-muted-foreground">
            {marker.sublabel}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
export function TimelineDeleteContextMenu({
  canDelete = true,
  children,
  deleteDescription,
  deleteDisabledReason,
  deleteLabel,
  kind,
  onDelete,
}: {
  canDelete?: boolean;
  children: ReactNode;
  deleteDescription?: string;
  deleteDisabledReason?: string;
  deleteLabel?: string;
  kind: "capitalSpike" | "draw" | "milestone";
  onDelete: () => void;
}) {
  const isDraw = kind === "draw";
  const isCapitalSpike = kind === "capitalSpike";
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="block" />}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        className="max-h-[calc(100vh-1rem)] w-64 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain p-2 shadow-2xl"
        data-testid="timeline-item-context-menu"
        side="right"
        sideOffset={6}
      >
        <div
          className="px-2 pb-2 font-medium text-[10px] text-muted-foreground uppercase"
          role="presentation"
        >
          {isDraw
            ? "Draw actions"
            : isCapitalSpike
              ? "Capital spike actions"
              : "Milestone actions"}
        </div>
        <ContextMenuItem
          className="flex min-h-12 items-start gap-3 px-2.5 py-2 text-sm"
          disabled={!canDelete}
          onClick={() => {
            if (canDelete) {
              onDelete();
            }
          }}
          variant="destructive"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-destructive/25 bg-destructive/10 text-destructive">
            <Trash2 className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">
              {deleteLabel ??
                (isDraw
                  ? "Remove draw"
                  : isCapitalSpike
                    ? "Remove capital spike"
                    : "Remove milestone")}
            </span>
            <span className="mt-0.5 block truncate text-muted-foreground text-xs">
              {deleteDescription ??
                (isDraw && !canDelete
                  ? (deleteDisabledReason ?? "This draw is locked")
                  : isDraw
                    ? "Delete this draw marker"
                    : isCapitalSpike
                      ? "Delete this unexpected cost"
                      : "Delete this milestone")}
            </span>
          </span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function MilestoneRequestBadges({
  currentAmount,
  deleteRequested,
  isRequestedCreate,
  requestedAmount,
}: {
  currentAmount?: number;
  deleteRequested: boolean;
  isRequestedCreate: boolean;
  requestedAmount?: number;
}) {
  if (
    !(deleteRequested || isRequestedCreate || requestedAmount !== undefined)
  ) {
    return null;
  }

  return (
    <div className="absolute -top-2 -left-2 z-20 flex max-w-[calc(100%-0.5rem)] flex-wrap gap-1">
      {isRequestedCreate ? (
        <Badge
          className="border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-100"
          data-testid="timeline-requested-milestone-badge"
          variant="outline"
        >
          Requested
        </Badge>
      ) : null}
      {deleteRequested ? (
        <Badge
          className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-100"
          data-testid="timeline-delete-requested-badge"
          variant="outline"
        >
          Deletion requested
        </Badge>
      ) : null}
      {requestedAmount === undefined ? null : (
        <Badge
          className="border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-100"
          data-testid="timeline-budget-requested-badge"
          variant="outline"
        >
          {currentAmount === undefined
            ? money(requestedAmount)
            : `${money(currentAmount)} -> ${money(requestedAmount)}`}
        </Badge>
      )}
    </div>
  );
}

export function DrawTimelineMarker({
  active,
  availableAmount,
  currentDay,
  draw,
  draft,
  inlineEditorEnabled,
  onApply,
  onCancel,
  onDraftChange,
  onOpen,
  reducedMotion,
}: {
  active: boolean;
  availableAmount?: number;
  currentDay: number;
  draw: DemoDraw;
  draft: DrawEditDraft;
  inlineEditorEnabled: boolean;
  onApply: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onDraftChange: (draft: DrawEditDraft) => void;
  onOpen: () => void;
  reducedMotion: boolean;
}) {
  const dayInputId = `draw-date-${draw.id}`;
  const amountInputId = `draw-amount-${draw.id}`;
  const markerState = getDrawTimelineMarkerState(draw, currentDay);
  const stateCopy = getDrawTimelineMarkerCopy(markerState);
  const draftDay = Math.round(Number(draft.x));
  const resolvedAvailableAmount =
    typeof availableAmount === "number" && Number.isFinite(availableAmount)
      ? Math.max(0, Math.round(availableAmount))
      : null;
  const markerClasses = {
    happened:
      "border-emerald-300 hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-500/35 dark:hover:bg-emerald-500/10",
    planned:
      "border-sky-300 hover:border-sky-400 hover:bg-sky-50 dark:border-sky-500/35 dark:hover:bg-sky-500/10",
    rejected:
      "border-rose-300 hover:border-rose-400 hover:bg-rose-50 dark:border-rose-500/35 dark:hover:bg-rose-500/10",
    requested:
      "border-amber-300 hover:border-amber-400 hover:bg-amber-50 dark:border-amber-500/35 dark:hover:bg-amber-500/10",
  } satisfies Record<DrawTimelineMarkerState, string>;
  const activeMarkerClasses = {
    happened: "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10",
    planned: "border-sky-500 bg-sky-50 dark:bg-sky-500/10",
    rejected: "border-rose-500 bg-rose-50 dark:bg-rose-500/10",
    requested: "border-amber-500 bg-amber-50 dark:bg-amber-500/10",
  } satisfies Record<DrawTimelineMarkerState, string>;
  const labelClasses = {
    happened: "text-emerald-700 dark:text-emerald-100",
    planned: "text-sky-700 dark:text-sky-100",
    rejected: "text-rose-700 dark:text-rose-100",
    requested: "text-amber-700 dark:text-amber-100",
  } satisfies Record<DrawTimelineMarkerState, string>;

  return (
    <div className="relative flex flex-col items-center">
      <motion.button
        aria-expanded={active}
        aria-haspopup="dialog"
        aria-label={`Edit ${draw.label} date and amount`}
        className={cn(
          "group min-w-28 rounded-md border bg-background/95 px-2.5 py-1.5 text-center text-foreground shadow-sm backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:bg-zinc-950/90",
          markerClasses[markerState],
          active && activeMarkerClasses[markerState]
        )}
        data-state={markerState}
        data-testid={`timeline-draw-marker-${getDrawDomId(draw)}`}
        onClick={onOpen}
        transition={{ damping: 24, stiffness: 430, type: "spring" }}
        type="button"
        whileHover={reducedMotion ? undefined : { scale: 1.035, y: -2 }}
        whileTap={reducedMotion ? undefined : { scale: 0.96, y: 1 }}
      >
        <span
          className={cn(
            "flex items-center justify-center gap-1 font-semibold text-[10px] uppercase tracking-normal",
            labelClasses[markerState]
          )}
        >
          <CircleDollarSign className="size-3" />
          {draw.label}
        </span>
        <span className="mt-0.5 block whitespace-nowrap font-semibold text-xs tabular-nums">
          {money(draw.amount)}
        </span>
        <span className="mt-0.5 flex items-center justify-center gap-1 whitespace-nowrap text-[10px] text-muted-foreground">
          <CalendarDays className="size-3" />
          {formatTimelineDay(draw.x)}
        </span>
        <span
          className={cn(
            "mt-1 inline-flex rounded-full border px-1.5 py-0.5 font-medium text-[9px] uppercase",
            labelClasses[markerState]
          )}
        >
          {stateCopy}
        </span>
      </motion.button>

      <AnimatePresence initial={false}>
        {active && inlineEditorEnabled ? (
          <motion.form
            animate={{ filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
            aria-label={`Edit ${draw.label}`}
            className="absolute top-full left-1/2 z-40 mt-2 w-64 -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl"
            data-testid={`timeline-draw-editor-${getDrawDomId(draw)}`}
            exit={{ filter: "blur(4px)", opacity: 0, scale: 0.96, y: -8 }}
            initial={{ filter: "blur(6px)", opacity: 0, scale: 0.96, y: -10 }}
            onSubmit={onApply}
            role="dialog"
            transition={{
              duration: reducedMotion ? 0 : 0.2,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <div className="mb-3">
              <p className="font-semibold text-sm">{draw.label}</p>
              <p className="text-muted-foreground text-xs">
                Update release date and reimbursement amount.
              </p>
              {resolvedAvailableAmount === null ? null : (
                <p
                  className="mt-1 text-muted-foreground text-xs tabular-nums"
                  data-testid={`timeline-draw-available-${getDrawDomId(draw)}`}
                >
                  {Number.isFinite(draftDay)
                    ? `${money(resolvedAvailableAmount)} unlocked by day ${draftDay}`
                    : `${money(resolvedAvailableAmount)} unlocked`}
                </p>
              )}
            </div>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor={dayInputId}>
                  Draw date
                </Label>
                <Input
                  id={dayInputId}
                  min={0}
                  name="drawDate"
                  nativeInput
                  onChange={(event) =>
                    onDraftChange({ ...draft, x: event.currentTarget.value })
                  }
                  size="sm"
                  step={1}
                  type="number"
                  value={draft.x}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor={amountInputId}>
                  Draw amount
                </Label>
                <Input
                  id={amountInputId}
                  min={1}
                  name="drawAmount"
                  nativeInput
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      amount: event.currentTarget.value,
                    })
                  }
                  size="sm"
                  step="any"
                  type="number"
                  value={draft.amount}
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                onClick={onCancel}
                size="xs"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button size="xs" type="submit">
                Apply
              </Button>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function CapitalSpikeTimelineMarker({
  active,
  draft,
  maxDay,
  onApply,
  onCancel,
  onDraftChange,
  onOpen,
  reducedMotion,
  spike,
}: {
  active: boolean;
  draft: CapitalSpikeEditDraft;
  maxDay: number;
  onApply: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onDraftChange: (draft: CapitalSpikeEditDraft) => void;
  onOpen: () => void;
  reducedMotion: boolean;
  spike: DemoCapitalSpike;
}) {
  const titleInputId = `capital-spike-label-${spike.id}`;
  const dayInputId = `capital-spike-date-${spike.id}`;
  const amountInputId = `capital-spike-amount-${spike.id}`;
  const interestInputId = `capital-spike-interest-${spike.id}`;
  const isCashInfusion = spike.eventKind === "cashInfusion";
  const isHomeEquityTakeout = spike.eventKind === "homeEquityTakeout";
  const isCashSource = isCashInfusion || isHomeEquityTakeout;
  const MarkerIcon = isHomeEquityTakeout
    ? House
    : isCashInfusion
      ? Banknote
      : AlertTriangle;

  return (
    <div className="relative flex flex-col items-center">
      <motion.button
        aria-expanded={active}
        aria-haspopup="dialog"
        aria-label={`Edit ${spike.label}`}
        className={cn(
          "group min-w-32 rounded-md border bg-background/95 px-2.5 py-1.5 text-center text-foreground shadow-sm backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:bg-zinc-950/90",
          isCashSource
            ? isHomeEquityTakeout
              ? "border-sky-300 hover:border-sky-400 hover:bg-sky-50 dark:border-sky-500/35 dark:hover:bg-sky-500/10"
              : "border-emerald-300 hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-500/35 dark:hover:bg-emerald-500/10"
            : "border-amber-300 hover:border-amber-400 hover:bg-amber-50 dark:border-amber-500/35 dark:hover:bg-amber-500/10",
          active &&
            (isCashSource
              ? isHomeEquityTakeout
                ? "border-sky-500 bg-sky-50 shadow-sky-500/15 dark:bg-sky-500/10"
                : "border-emerald-500 bg-emerald-50 shadow-emerald-500/15 dark:bg-emerald-500/10"
              : "border-amber-500 bg-amber-50 shadow-amber-500/15 dark:bg-amber-500/10")
        )}
        data-testid={`timeline-capital-spike-marker-${spike.id}`}
        onClick={onOpen}
        transition={{ damping: 24, stiffness: 430, type: "spring" }}
        type="button"
        whileHover={reducedMotion ? undefined : { scale: 1.035, y: -2 }}
        whileTap={reducedMotion ? undefined : { scale: 0.96, y: 1 }}
      >
        <span
          className={cn(
            "flex items-center justify-center gap-1 font-semibold text-[10px] uppercase tracking-normal",
            isCashSource
              ? isHomeEquityTakeout
                ? "text-sky-700 dark:text-sky-100"
                : "text-emerald-700 dark:text-emerald-100"
              : "text-amber-700 dark:text-amber-200"
          )}
        >
          <MarkerIcon className="size-3" />
          {spike.label}
        </span>
        <span className="mt-0.5 block whitespace-nowrap font-semibold text-xs tabular-nums">
          {money(spike.amount)}
        </span>
        {isHomeEquityTakeout ? (
          <span className="mt-0.5 block whitespace-nowrap text-[10px] text-sky-700 tabular-nums dark:text-sky-200">
            {((spike.interestAnnualBps ?? 0) / 100).toFixed(2)}% annual
          </span>
        ) : null}
        <span className="mt-0.5 flex items-center justify-center gap-1 whitespace-nowrap text-[10px] text-muted-foreground">
          <CalendarDays className="size-3" />
          {formatTimelineDay(spike.x)}
        </span>
      </motion.button>

      <AnimatePresence initial={false}>
        {active && (
          <motion.form
            animate={{ filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
            aria-label={`Edit ${spike.label}`}
            className="absolute top-full left-1/2 z-40 mt-2 w-64 -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl"
            data-testid={`timeline-capital-spike-editor-${spike.id}`}
            exit={{ filter: "blur(4px)", opacity: 0, scale: 0.96, y: -8 }}
            initial={{ filter: "blur(6px)", opacity: 0, scale: 0.96, y: -10 }}
            onSubmit={onApply}
            role="dialog"
            transition={{
              duration: reducedMotion ? 0 : 0.2,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <div className="mb-3">
              <p className="font-semibold text-sm">
                {isHomeEquityTakeout
                  ? "Home Equity Takeout"
                  : isCashInfusion
                    ? "Cash infusion"
                    : "Capital cost"}
              </p>
              <p className="text-muted-foreground text-xs">
                {isHomeEquityTakeout
                  ? "Track the funded amount, takeout date, and annual interest rate."
                  : isCashInfusion
                    ? "Update the borrower cash infusion label, date, and amount."
                    : "Update the unexpected cost label, date, and amount."}
              </p>
            </div>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor={titleInputId}>
                  {isCashInfusion
                    ? "Cash infusion title"
                    : isHomeEquityTakeout
                      ? "Loan title"
                      : "Capital cost title"}
                </Label>
                <Input
                  id={titleInputId}
                  name="capitalSpikeLabel"
                  nativeInput
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      label: event.currentTarget.value,
                    })
                  }
                  size="sm"
                  value={draft.label}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor={dayInputId}>
                  {isHomeEquityTakeout
                    ? "Takeout date"
                    : isCashInfusion
                      ? "Cash infusion date"
                      : "Capital cost date"}
                </Label>
                <Input
                  id={dayInputId}
                  max={maxDay}
                  min={PROPOSAL_TIMELINE_MIN_DAY}
                  name="capitalSpikeDate"
                  nativeInput
                  onChange={(event) =>
                    onDraftChange({ ...draft, x: event.currentTarget.value })
                  }
                  size="sm"
                  step={1}
                  type="number"
                  value={draft.x}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor={amountInputId}>
                  {isCashInfusion
                    ? "Cash infusion amount"
                    : isHomeEquityTakeout
                      ? "Takeout amount"
                      : "Capital cost amount"}
                </Label>
                <Input
                  id={amountInputId}
                  min={0}
                  name="capitalSpikeAmount"
                  nativeInput
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      amount: event.currentTarget.value,
                    })
                  }
                  size="sm"
                  step={1000}
                  type="number"
                  value={draft.amount}
                />
              </div>
              {isHomeEquityTakeout ? (
                <div className="grid gap-1.5">
                  <Label className="text-xs" htmlFor={interestInputId}>
                    Annual interest rate
                  </Label>
                  <Input
                    id={interestInputId}
                    max={100}
                    min={0}
                    name="capitalSpikeInterestAnnualPercent"
                    nativeInput
                    onChange={(event) =>
                      onDraftChange({
                        ...draft,
                        interestAnnualPercent: event.currentTarget.value,
                      })
                    }
                    size="sm"
                    step={0.01}
                    type="number"
                    value={draft.interestAnnualPercent}
                  />
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                onClick={onCancel}
                size="xs"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button size="xs" type="submit">
                Apply
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FinancialOverviewCard({ overview }: { overview: FinancialOverview }) {
  return (
    <article
      className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-card-foreground shadow-sm"
      data-testid="timeline-final-financial-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[11px] text-emerald-700 uppercase dark:text-emerald-200">
            Closeout ledger
          </p>
          <h3 className="mt-1 font-semibold text-sm leading-5">
            Live financial overview
          </h3>
        </div>
        <div className="grid size-11 shrink-0 place-items-center rounded-md border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200">
          <Flag className="size-5" />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-emerald-500/20 bg-background/65 px-2.5 py-2">
          <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Banknote className="size-3.5" />
            Released
          </dt>
          <dd
            className="font-semibold tabular-nums"
            data-testid="timeline-final-total-draw"
          >
            {money(overview.totalDrawReleased)}
          </dd>
        </div>
        <div className="rounded-md border border-emerald-500/20 bg-background/65 px-2.5 py-2">
          <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
            <ReceiptText className="size-3.5" />
            Draw fees
          </dt>
          <dd
            className="font-semibold tabular-nums"
            data-testid="timeline-final-draw-fees"
          >
            {money(overview.drawFeesPaid)}
          </dd>
        </div>
        <div className="rounded-md border border-emerald-500/20 bg-background/65 px-2.5 py-2">
          <dt className="text-muted-foreground">Interest paid</dt>
          <dd
            className="font-semibold tabular-nums"
            data-testid="timeline-final-interest-paid"
          >
            {money(overview.interestPaid)}
          </dd>
        </div>
        <div className="rounded-md border border-emerald-500/20 bg-background/65 px-2.5 py-2">
          <dt className="text-muted-foreground">Draw count</dt>
          <dd className="font-medium tabular-nums">
            {overview.drawCount} x {money(DRAW_FEE)}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function TimelineNodeButton({
  active,
  complete,
  item,
  onClick,
  onDoubleClick,
  reducedMotion,
}: {
  active: boolean;
  complete: boolean;
  item: TimelineItem<DemoMilestone>;
  onClick: () => void;
  onDoubleClick?: () => void;
  reducedMotion: boolean;
}) {
  return (
    <motion.button
      aria-label={`Set progress to ${item.data?.name ?? item.label ?? item.id}`}
      className={cn(
        "grid size-9 place-items-center rounded-full border-2 bg-background text-muted-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        complete &&
          "border-emerald-400 bg-card text-emerald-600 ring-4 ring-emerald-500/10",
        active &&
          !complete &&
          "border-rose-500 bg-rose-500 text-white shadow-rose-500/30 ring-4 ring-rose-500/20",
        !(active || complete) && "border-zinc-300 dark:border-zinc-700"
      )}
      data-testid={`demo-timeline-node-${item.id}`}
      onClick={onClick}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDoubleClick?.();
      }}
      transition={{ damping: 22, stiffness: 420, type: "spring" }}
      type="button"
      whileHover={reducedMotion ? undefined : { scale: 1.1, y: -2 }}
      whileTap={reducedMotion ? undefined : { scale: 0.9, y: 1 }}
    >
      {complete || active ? (
        <Banknote
          className="size-4"
          data-testid={`demo-timeline-node-icon-${item.id}`}
        />
      ) : (
        <span className="font-semibold text-xs">{item.markerLabel}</span>
      )}
    </motion.button>
  );
}
