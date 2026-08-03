"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FilePlus2,
  FileStack,
  type LucideIcon,
  MailWarning,
  PackageSearch,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { ErrorInfo, ReactNode } from "react";
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type QuoteRoundListProjection = FunctionReturnType<
  typeof api.quote_rounds.listQuoteRounds
>;
export type QuoteRoundRegisterRow = QuoteRoundListProjection["rounds"][number];
export type QuoteRoundRegisterMode = "all" | QuoteRoundRegisterRow["mode"];
export type QuoteRoundRegisterSort =
  | "attention"
  | "deadline"
  | "recent"
  | "title";

const LIFECYCLE_PHASES: QuoteRoundRegisterRow["state"][] = [
  "draft",
  "open",
  "closed",
  "cancelled",
];
const APP_TIME_ZONE = "America/Toronto";

interface QuoteRoundsSurfaceProps {
  buildId: string;
  onCreate?: () => void;
  onOpen?: (roundId: string) => void;
  organizationId: string;
  readOnly?: boolean;
  readOnlyLabel?: string;
}

type QuoteRoundsQueryProps = QuoteRoundsSurfaceProps & {
  cachedList?: QuoteRoundListProjection;
  onData: (value: QuoteRoundListProjection) => void;
  onRetry: () => void;
};

type QuoteRoundsRegisterContext = QuoteRoundsSurfaceProps;

function formatDeadline(value: number | undefined) {
  if (!value) {
    return "Not set";
  }
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(value));
}

function formatLastActivity(value: number) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(value));
}

function formatDeadlineRelative(
  deadline: number | undefined,
  state: QuoteRoundRegisterRow["state"],
  now: number
) {
  if (state === "closed") {
    return "Closed";
  }
  if (state === "cancelled") {
    return "Cancelled";
  }
  if (!deadline) {
    return "Not set";
  }
  const delta = deadline - now;
  if (delta <= 0) {
    return "Overdue";
  }
  const hours = Math.ceil(delta / (60 * 60 * 1000));
  if (hours < 48) {
    return `${hours}h`;
  }
  return `${Math.ceil(hours / 24)}d`;
}

function modeLabel(mode: QuoteRoundRegisterRow["mode"]) {
  return mode === "combined"
    ? "Labour + Materials"
    : mode === "labour"
      ? "Labour"
      : "Materials";
}

function stateLabel(state: QuoteRoundRegisterRow["state"]) {
  return state === "open"
    ? "Open"
    : state === "closed"
      ? "Closed"
      : state === "cancelled"
        ? "Cancelled"
        : "Draft";
}

function actionLabel(row: QuoteRoundRegisterRow) {
  return row.state === "draft"
    ? "Continue draft"
    : row.state === "open"
      ? "Review responses"
      : row.state === "closed"
        ? "Compare responses"
        : "View history";
}

const DETAIL_UNAVAILABLE_LABEL = "View (quote detail unavailable)";
const DETAIL_UNAVAILABLE_TITLE =
  "Quote detail view is unavailable in this workspace.";

function primaryActionLabel(
  row: QuoteRoundRegisterRow,
  onOpen: ((roundId: string) => void) | undefined,
  readOnly: boolean,
  mobile = false
) {
  if (!onOpen) {
    return DETAIL_UNAVAILABLE_LABEL;
  }
  if (readOnly) {
    return mobile ? "View round" : "View";
  }
  return actionLabel(row);
}

function deliveryLabel(row: QuoteRoundRegisterRow) {
  if (row.delivery.status === "not_dispatched") {
    return row.delivery.undispatched > 0
      ? `${row.delivery.undispatched} not dispatched`
      : "Not dispatched";
  }
  const parts: string[] = [];
  if (row.delivery.delivered) {
    parts.push(`${row.delivery.delivered} delivered`);
  }
  if (row.delivery.pending) {
    parts.push(`${row.delivery.pending} pending`);
  }
  if (row.delivery.failed) {
    parts.push(`${row.delivery.failed} failed`);
  }
  if (row.delivery.undispatched) {
    parts.push(`${row.delivery.undispatched} not dispatched`);
  }
  return parts.join(" · ") || "Not dispatched";
}

function communicationSummary(row: QuoteRoundRegisterRow) {
  const recipientDelivery = row.recipientDelivery ?? [];
  const actionRequired = recipientDelivery.filter(
    (recipient) => recipient.actionRequired
  ).length;
  const retrying = recipientDelivery.filter(
    (recipient) => recipient.recoveryState === "retrying"
  ).length;
  const reminders = recipientDelivery.filter(
    (recipient) => recipient.reminderEligible
  ).length;
  const parts = [`${recipientDelivery.length} tracked`];
  if (actionRequired) {
    parts.push(`${actionRequired} action required`);
  }
  if (retrying) {
    parts.push(`${retrying} retrying`);
  }
  if (reminders) {
    parts.push(`${reminders} reminder${reminders === 1 ? "" : "s"} eligible`);
  }
  return parts.join(" · ");
}

export function QuoteRoundsSurface(props: QuoteRoundsSurfaceProps) {
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const [cachedSnapshot, setCachedSnapshot] = useState<{
    identity: string;
    value: QuoteRoundListProjection;
  }>();
  const cacheIdentity = `${props.organizationId}\u0000${props.buildId}`;
  const cachedList =
    cachedSnapshot?.identity === cacheIdentity
      ? cachedSnapshot.value
      : undefined;
  const onData = useCallback(
    (value: QuoteRoundListProjection) => {
      setCachedSnapshot({ identity: cacheIdentity, value });
    },
    [cacheIdentity]
  );
  const onRetry = () => setRefreshGeneration((value) => value + 1);

  return (
    <QuoteRoundsErrorBoundary
      cachedList={cachedList}
      key={`${cacheIdentity}:${refreshGeneration}`}
      onRetry={onRetry}
      registerContext={props}
    >
      <QuoteRoundsQuery
        {...props}
        cachedList={cachedList}
        onData={onData}
        onRetry={onRetry}
      />
    </QuoteRoundsErrorBoundary>
  );
}

function QuoteRoundsQuery({
  buildId,
  cachedList,
  onCreate,
  onData,
  onOpen,
  onRetry,
  organizationId,
  readOnly = false,
  readOnlyLabel = "Read-only",
}: QuoteRoundsQueryProps) {
  const quoteRoundList = useQuery(api.quote_rounds.listQuoteRounds, {
    buildId: buildId as Id<"activeBuilds">,
    workosOrganizationId: organizationId,
  });

  useEffect(() => {
    if (quoteRoundList) {
      onData(quoteRoundList);
    }
  }, [onData, quoteRoundList]);

  if (quoteRoundList === undefined && !cachedList) {
    return <QuoteRoundsLoading onRetry={onRetry} />;
  }

  return (
    <QuoteRoundsRegister
      buildId={buildId}
      cached={quoteRoundList === undefined}
      list={quoteRoundList ?? cachedList ?? { rounds: [] }}
      onCreate={onCreate}
      onOpen={onOpen}
      onRetry={onRetry}
      organizationId={organizationId}
      readOnly={readOnly}
      readOnlyLabel={readOnlyLabel}
    />
  );
}

interface QuoteRoundsErrorBoundaryProps {
  cachedList?: QuoteRoundListProjection;
  children: ReactNode;
  onRetry: () => void;
  registerContext: QuoteRoundsRegisterContext;
}

class QuoteRoundsErrorBoundary extends Component<
  QuoteRoundsErrorBoundaryProps,
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The surrounding Build workspace remains usable. The retry action below
    // remounts the Convex subscription without mutating Quote Round state.
  }

  render() {
    if (this.state.error) {
      if (this.props.cachedList) {
        return (
          <QuoteRoundsRegister
            cached
            hardError
            list={this.props.cachedList}
            onRetry={this.props.onRetry}
            {...this.props.registerContext}
          />
        );
      }
      return <QuoteRoundsErrorState onRetry={this.props.onRetry} />;
    }
    return this.props.children;
  }
}

function QuoteRoundsLoading({ onRetry }: { onRetry: () => void }) {
  return (
    <Frame data-testid="quote-rounds-loading">
      <FramePanel className="animate-pulse space-y-3 p-5">
        <div className="h-5 w-48 rounded bg-muted" />
        <div className="h-3 w-80 max-w-full rounded bg-muted/70" />
        <div className="h-12 rounded bg-muted/60" />
        <div className="h-12 rounded bg-muted/60" />
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Loading quote register…</span>
          <Button onClick={onRetry} size="sm" variant="outline">
            <RefreshCw /> Refresh
          </Button>
        </div>
      </FramePanel>
    </Frame>
  );
}

function QuoteRoundsErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Frame data-testid="quote-rounds-error">
      <FramePanel className="grid min-h-64 place-items-center p-6 text-center">
        <div>
          <XCircle className="mx-auto size-7 text-destructive" />
          <h2 className="mt-3 font-semibold">Quote register unavailable</h2>
          <p className="mt-1 max-w-md text-muted-foreground text-sm">
            The Build remains available, but its Quote Round register could not
            be loaded.
          </p>
          <Button className="mt-4" onClick={onRetry} variant="outline">
            <RefreshCw /> Retry
          </Button>
        </div>
      </FramePanel>
    </Frame>
  );
}

function QuoteRoundsRegister({
  buildId,
  cached = false,
  hardError = false,
  list,
  onCreate,
  onOpen,
  onRetry,
  organizationId,
  readOnly = false,
  readOnlyLabel = "Read-only",
}: {
  buildId: string;
  cached?: boolean;
  hardError?: boolean;
  list: QuoteRoundListProjection;
  onCreate?: () => void;
  onOpen?: (roundId: string) => void;
  onRetry: () => void;
  organizationId: string;
  readOnly?: boolean;
  readOnlyLabel?: string;
}) {
  const [now] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<QuoteRoundRegisterMode>("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [sort, setSort] = useState<QuoteRoundRegisterSort>("attention");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const canCreate = !readOnly && Boolean(onCreate);
  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return [...list.rounds]
      .filter((row) => {
        const matchesQuery = normalizedQuery
          ? `${row._id} ${row.title} ${row.scope}`
              .toLocaleLowerCase()
              .includes(normalizedQuery)
          : true;
        const matchesMode = mode === "all" || row.mode === mode;
        const matchesAttention = !attentionOnly || Boolean(row.attention);
        return matchesQuery && matchesMode && matchesAttention;
      })
      .sort((left, right) => {
        if (sort === "title") {
          return left.title.localeCompare(right.title);
        }
        if (sort === "recent") {
          return right.lastActivityAt - left.lastActivityAt;
        }
        if (sort === "deadline") {
          return (
            (left.responseDeadline ?? Number.POSITIVE_INFINITY) -
              (right.responseDeadline ?? Number.POSITIVE_INFINITY) ||
            left.title.localeCompare(right.title)
          );
        }
        return (
          (left.attention?.rank ?? 99) - (right.attention?.rank ?? 99) ||
          right.lastActivityAt - left.lastActivityAt ||
          left.title.localeCompare(right.title)
        );
      });
  }, [attentionOnly, list.rounds, mode, query, sort]);
  const openCount = list.rounds.filter((row) => row.state === "open").length;
  const attentionCount = list.rounds.filter((row) => row.attention).length;
  const failureCount = list.rounds.filter(
    (row) => row.delivery.failed > 0
  ).length;

  const clearFilters = () => {
    setAttentionOnly(false);
    setMode("all");
    setQuery("");
    setSort("attention");
  };

  return (
    <div className="grid gap-4 pb-24" data-testid="build-quote-rounds-surface">
      <Frame className="rounded-xl">
        <FramePanel className="overflow-hidden rounded-lg p-0">
          <FrameHeader className="gap-4 border-b px-4 py-4 sm:px-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <FrameTitle className="text-lg">Quote requests</FrameTitle>
                {readOnly ? (
                  <Badge variant="outline">{readOnlyLabel} · read-only</Badge>
                ) : null}
                {cached ? <Badge variant="warning">Cached view</Badge> : null}
              </div>
              <FrameDescription className="mt-1">
                {list.rounds.length}{" "}
                {list.rounds.length === 1 ? "round" : "rounds"} · {openCount}{" "}
                open · {attentionCount} need attention · {failureCount} delivery{" "}
                {failureCount === 1 ? "failure" : "failures"}
              </FrameDescription>
            </div>
            {canCreate ? (
              <Button onClick={onCreate}>
                <FilePlus2 /> New quote request
              </Button>
            ) : null}
          </FrameHeader>

          {hardError ? (
            <Alert
              className="rounded-none border-x-0 border-t-0"
              variant="error"
            >
              <XCircle />
              <AlertTitle>Refresh failed</AlertTitle>
              <AlertDescription>
                Showing the last successful register snapshot. Retry when the
                Build connection is available.
                <Button
                  className="mt-2 w-fit"
                  onClick={onRetry}
                  size="sm"
                  variant="outline"
                >
                  <RefreshCw /> Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : cached ? (
            <div className="flex items-center gap-3 border-warning/30 border-b bg-warning/8 px-4 py-3 text-sm sm:px-5">
              <RefreshCw className="size-4 text-warning" />
              <span className="flex-1">Refreshing Quote Round register…</span>
              <Button onClick={onRetry} size="sm" variant="outline">
                Retry
              </Button>
            </div>
          ) : null}

          <ControlRegisterToolbar
            attentionOnly={attentionOnly}
            mode={mode}
            onAttentionOnlyChange={setAttentionOnly}
            onModeChange={setMode}
            onQueryChange={setQuery}
            onSortChange={setSort}
            query={query}
            sort={sort}
          />

          {list.rounds.length === 0 ? (
            <RegisterEmpty canCreate={canCreate} onCreate={onCreate} />
          ) : rows.length === 0 ? (
            <NoResults onClear={clearFilters} />
          ) : (
            <>
              <AttentionStrip rows={rows} />
              <DesktopControlRegister
                buildId={buildId}
                expandedId={expandedId}
                now={now}
                onExpand={setExpandedId}
                onOpen={onOpen}
                organizationId={organizationId}
                readOnly={readOnly}
                rows={rows}
              />
              <MobileControlRegister
                buildId={buildId}
                expandedId={expandedId}
                now={now}
                onExpand={setExpandedId}
                onOpen={onOpen}
                organizationId={organizationId}
                readOnly={readOnly}
                rows={rows}
              />
            </>
          )}
        </FramePanel>
      </Frame>
      <Alert variant="info">
        <ShieldCheck />
        <AlertTitle>Publication is immutable</AlertTitle>
        <AlertDescription>
          Open Quote Rounds retain their package, response-template, and
          invitation snapshots even when the Build changes later.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function ControlRegisterToolbar({
  attentionOnly,
  mode,
  onAttentionOnlyChange,
  onModeChange,
  onQueryChange,
  onSortChange,
  query,
  sort,
}: {
  attentionOnly: boolean;
  mode: QuoteRoundRegisterMode;
  onAttentionOnlyChange: (value: boolean) => void;
  onModeChange: (value: QuoteRoundRegisterMode) => void;
  onQueryChange: (value: string) => void;
  onSortChange: (value: QuoteRoundRegisterSort) => void;
  query: string;
  sort: QuoteRoundRegisterSort;
}) {
  return (
    <div className="grid gap-3 border-b px-4 py-3 sm:px-5 lg:grid-cols-[minmax(15rem,1fr)_auto_auto] lg:items-center">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search quote requests"
          className="pl-9"
          nativeInput
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search round or scope"
          value={query}
        />
      </div>
      <fieldset className="flex min-w-0 gap-1 overflow-x-auto">
        <legend className="sr-only">Quote request type</legend>
        {(["all", "labour", "material", "combined"] as const).map((value) => (
          <Button
            aria-pressed={mode === value}
            className="shrink-0"
            key={value}
            onClick={() => onModeChange(value)}
            size="sm"
            variant={mode === value ? "secondary" : "ghost"}
          >
            {value === "all" ? "All" : modeLabel(value)}
          </Button>
        ))}
      </fieldset>
      <div className="flex items-center gap-1">
        <Button
          aria-pressed={attentionOnly}
          onClick={() => onAttentionOnlyChange(!attentionOnly)}
          size="sm"
          variant={attentionOnly ? "secondary" : "ghost"}
        >
          <AlertTriangle /> Needs attention
        </Button>
        <NativeSelect
          aria-label="Sort quote requests"
          onChange={(event) =>
            onSortChange(event.target.value as QuoteRoundRegisterSort)
          }
          value={sort}
        >
          <NativeSelectOption value="attention">
            Attention order
          </NativeSelectOption>
          <NativeSelectOption value="deadline">Deadline</NativeSelectOption>
          <NativeSelectOption value="recent">
            Recent activity
          </NativeSelectOption>
          <NativeSelectOption value="title">Title</NativeSelectOption>
        </NativeSelect>
      </div>
    </div>
  );
}

function AttentionStrip({ rows }: { rows: QuoteRoundRegisterRow[] }) {
  const attention = rows
    .filter((row) => row.attention)
    .sort(
      (left, right) =>
        (left.attention?.rank ?? 99) - (right.attention?.rank ?? 99) ||
        right.lastActivityAt - left.lastActivityAt ||
        left.title.localeCompare(right.title)
    )
    .slice(0, 3);
  if (attention.length === 0) {
    return null;
  }
  return (
    <div className="border-b bg-muted/22 px-4 py-3 sm:px-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-semibold text-xs uppercase tracking-[0.08em]">
          Attention order
        </p>
        <p className="text-muted-foreground text-xs">
          Delivery, deadline, revision, reminder, then readiness
        </p>
      </div>
      <ol className="grid gap-px overflow-hidden rounded-md border bg-border md:grid-cols-3">
        {attention.map((row, index) => (
          <li
            className="flex min-w-0 items-start gap-3 bg-background px-3 py-2.5"
            key={row._id}
          >
            <span className="whitespace-nowrap font-semibold text-primary text-xs tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-sm">
                {row.attention?.label}
              </span>
              <span className="block truncate text-muted-foreground text-xs">
                {row.title} · {row.attention?.detail}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DesktopControlRegister({
  buildId,
  expandedId,
  now,
  onExpand,
  onOpen,
  organizationId,
  readOnly,
  rows,
}: {
  buildId: string;
  expandedId: string | null;
  now: number;
  onExpand: (id: string | null) => void;
  onOpen?: (roundId: string) => void;
  organizationId: string;
  readOnly: boolean;
  rows: QuoteRoundRegisterRow[];
}) {
  return (
    <div className="hidden overflow-x-auto lg:block">
      <div className="min-w-[70rem]">
        <div className="grid grid-cols-[minmax(13rem,1.3fr)_12rem_minmax(10rem,1fr)_7rem_6rem_8rem_8rem] border-b bg-muted/36 px-4 py-2 font-medium text-[0.6875rem] text-muted-foreground uppercase tracking-[0.08em]">
          <span>Round and scope</span>
          <span>Lifecycle</span>
          <span>Current state</span>
          <span>Deadline</span>
          <span>Responses</span>
          <span>Preferred quote</span>
          <span className="text-right">Action</span>
        </div>
        {rows.map((row) => {
          const expanded = expandedId === row._id;
          return (
            <div className="border-b last:border-b-0" key={row._id}>
              <div
                className={cn(
                  "grid grid-cols-[minmax(13rem,1.3fr)_12rem_minmax(10rem,1fr)_7rem_6rem_8rem_8rem] items-center px-4 py-3",
                  row.attention?.tone === "critical" &&
                    "border-destructive border-l-4 pl-3",
                  row.attention?.tone === "warning" &&
                    "border-warning border-l-4 pl-3"
                )}
              >
                <button
                  aria-controls={`quote-round-desktop-details-${row._id}`}
                  aria-expanded={expanded}
                  className="flex min-w-0 items-start gap-2 text-left"
                  onClick={() => onExpand(expanded ? null : row._id)}
                  type="button"
                >
                  {expanded ? (
                    <ChevronDown className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <ChevronRight className="mt-0.5 size-4 shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold text-sm">
                        {row.title}
                      </span>
                      <span className="text-[0.6875rem] text-muted-foreground">
                        {row._id}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-muted-foreground text-xs">
                      {modeLabel(row.mode)} · R{row.revision} · {row.scope}
                    </span>
                  </span>
                </button>
                <LifecycleRail phase={row.state} />
                <CurrentState row={row} />
                <div className="text-xs">
                  <p className="font-medium">
                    {formatDeadlineRelative(
                      row.responseDeadline,
                      row.state,
                      now
                    )}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {formatDeadline(row.responseDeadline)}
                  </p>
                </div>
                <div className="text-xs tabular-nums">
                  <p className="font-semibold">
                    {row.responses.submitted} / {row.responses.total}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {row.responses.drafting} drafting
                  </p>
                </div>
                <PreferredQuote row={row} />
                <div className="text-right">
                  <Button
                    aria-label={onOpen ? undefined : DETAIL_UNAVAILABLE_LABEL}
                    disabled={!onOpen}
                    onClick={() => onOpen?.(row._id)}
                    size="sm"
                    title={onOpen ? undefined : DETAIL_UNAVAILABLE_TITLE}
                    variant="outline"
                  >
                    {primaryActionLabel(row, onOpen, readOnly)}
                  </Button>
                </div>
              </div>
              {expanded ? (
                <RecipientDisclosure
                  buildId={buildId}
                  id={`quote-round-desktop-details-${row._id}`}
                  onOpen={onOpen}
                  organizationId={organizationId}
                  readOnly={readOnly}
                  row={row}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LifecycleRail({ phase }: { phase: QuoteRoundRegisterRow["state"] }) {
  const cancelled = phase === "cancelled";
  const activeIndex = cancelled
    ? LIFECYCLE_PHASES.length - 1
    : LIFECYCLE_PHASES.indexOf(phase);
  return (
    <div
      aria-label={`Lifecycle: ${stateLabel(phase)}`}
      className="flex items-center pr-5"
      role="img"
    >
      {LIFECYCLE_PHASES.map((item, index) => {
        const completed = !cancelled && index < activeIndex;
        const active = index === activeIndex;
        return (
          <div
            className="flex min-w-0 flex-1 items-center last:flex-none"
            key={item}
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full border text-[0.625rem]",
                completed && "border-success/50 bg-success/12 text-success",
                active && "border-primary bg-primary text-primary-foreground",
                !(completed || active) && "text-muted-foreground"
              )}
              title={stateLabel(item)}
            >
              {completed ? <Check className="size-3" /> : index + 1}
            </span>
            {index < LIFECYCLE_PHASES.length - 1 &&
            !(cancelled && item === "closed") ? (
              <span
                className={cn(
                  "h-px min-w-2 flex-1 bg-border",
                  completed && "bg-success/50"
                )}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function CurrentState({ row }: { row: QuoteRoundRegisterRow }) {
  const Icon = currentStateIcon(row);
  return (
    <div className="flex min-w-0 items-start gap-2 pr-3 text-xs">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0 text-muted-foreground",
          row.attention?.tone === "critical" && "text-destructive",
          row.attention?.tone === "warning" && "text-warning"
        )}
      />
      <span className="min-w-0">
        <span className="block truncate font-medium">
          {row.attention?.label ?? stateLabel(row.state)}
        </span>
        <span className="mt-1 block truncate text-muted-foreground">
          {row.attention?.detail ?? deliveryLabel(row)}
        </span>
      </span>
    </div>
  );
}

function currentStateIcon(row: QuoteRoundRegisterRow): LucideIcon {
  if (row.attention?.tone === "critical") {
    return MailWarning;
  }
  if (row.attention?.tone === "warning") {
    return AlertTriangle;
  }
  switch (row.state) {
    case "closed":
      return ShieldCheck;
    case "draft":
      return FileStack;
    case "cancelled":
      return XCircle;
    case "open":
      return Clock3;
    default:
      return CalendarClock;
  }
}

function formatPreferredTotal(value: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value / 100);
}

function PreferredQuote({ row }: { row: QuoteRoundRegisterRow }) {
  if (!row.preferredQuote) {
    return <span className="text-muted-foreground text-xs">Not selected</span>;
  }
  return (
    <span className="grid gap-0.5 text-xs">
      <span className="font-medium text-success">Preferred Quote</span>
      <span className="text-muted-foreground">
        R{row.preferredQuote.revision} ·{" "}
        {formatPreferredTotal(row.preferredQuote.canonicalTotalCents)}
      </span>
    </span>
  );
}

function RecipientDisclosure({
  buildId,
  id,
  onOpen,
  organizationId,
  readOnly,
  row,
}: {
  buildId: string;
  id: string;
  onOpen?: (roundId: string) => void;
  organizationId: string;
  readOnly: boolean;
  row: QuoteRoundRegisterRow;
}) {
  const recipientDelivery = row.recipientDelivery ?? [];
  return (
    <section
      aria-label={`${row.title} recipient activity`}
      className="grid grid-cols-[15rem_1fr_1fr_1fr_8rem] gap-4 border-t bg-muted/18 px-10 py-3 text-xs"
      id={id}
    >
      <div>
        <p className="font-medium">Recipient activity</p>
        <p className="mt-1 text-muted-foreground">
          {row.recipients.active} active · {row.recipients.revoked} revoked
        </p>
        <p className="mt-1 text-muted-foreground">
          {communicationSummary(row)}
        </p>
        {recipientDelivery.length > 0 ? (
          <ul className="mt-2 grid gap-1 text-muted-foreground">
            {recipientDelivery.slice(0, 6).map((recipient, index) => (
              <li key={recipient.invitationId}>
                Recipient {index + 1}: {recipient.latestStatus ?? "not sent"}
                {recipient.actionRequired ? " · action required" : ""}
                {recipient.reminderEligible ? " · reminder eligible" : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div>
        <p className="font-medium">Delivery</p>
        <p className="mt-1 text-muted-foreground">{deliveryLabel(row)}</p>
      </div>
      <div>
        <p className="font-medium">Access</p>
        <p className="mt-1 text-muted-foreground">
          {row.access.active} active credential · {row.access.expired} expired
        </p>
      </div>
      <div>
        <p className="font-medium">Last activity</p>
        <p className="mt-1 text-muted-foreground">
          {formatLastActivity(row.lastActivityAt)}
        </p>
      </div>
      <Button
        aria-label={
          onOpen ? undefined : "Open detail (quote detail unavailable)"
        }
        disabled={!onOpen}
        onClick={() => onOpen?.(row._id)}
        size="sm"
        title={onOpen ? undefined : DETAIL_UNAVAILABLE_TITLE}
        variant="ghost"
      >
        Open detail <ChevronRight />
      </Button>
      <RecipientCommunicationHistory
        buildId={buildId}
        organizationId={organizationId}
        readOnly={readOnly}
        row={row}
      />
    </section>
  );
}

function RecipientCommunicationHistory({
  buildId,
  organizationId,
  readOnly,
  row,
}: {
  buildId: string;
  organizationId: string;
  readOnly: boolean;
  row: QuoteRoundRegisterRow;
}) {
  const recipientDelivery = row.recipientDelivery ?? [];
  const retryDelivery = useMutation(
    api.quote_notifications.retryCommunicationDelivery
  );
  const [retryError, setRetryError] = useState<string>();
  const [retryingIntentId, setRetryingIntentId] = useState<string>();
  const [retryReasons, setRetryReasons] = useState<Record<string, string>>({});
  const retryIdempotencyKeys = useRef(new Map<string, string>());

  const retry = async (communicationIntentId: Id<"communicationIntents">) => {
    const key = String(communicationIntentId);
    const reason = retryReasons[key]?.trim();
    if (!(reason && !retryingIntentId)) {
      return;
    }
    let idempotencyKey = retryIdempotencyKeys.current.get(key);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      retryIdempotencyKeys.current.set(key, idempotencyKey);
    }
    setRetryError(undefined);
    setRetryingIntentId(key);
    try {
      await retryDelivery({
        buildId: buildId as Id<"activeBuilds">,
        communicationIntentId,
        idempotencyKey,
        reason,
        workosOrganizationId: organizationId,
      });
      retryIdempotencyKeys.current.delete(key);
      setRetryReasons((current) => ({ ...current, [key]: "" }));
    } catch (cause) {
      setRetryError(
        cause instanceof Error
          ? cause.message
          : "Communication delivery retry failed."
      );
    } finally {
      setRetryingIntentId(undefined);
    }
  };
  return (
    <details
      className="col-span-full border-t pt-3"
      data-testid="quote-recipient-communication-history"
    >
      <summary className="cursor-pointer font-medium text-xs">
        Communication history · {communicationSummary(row)}
      </summary>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {recipientDelivery.length === 0 ? (
          <p className="text-muted-foreground">
            No communication intents recorded.
          </p>
        ) : (
          recipientDelivery.map((recipient, index) => (
            <RecipientCommunicationCard
              index={index}
              key={recipient.invitationId}
              onReasonChange={(intentId, value) =>
                setRetryReasons((current) => ({
                  ...current,
                  [String(intentId)]: value,
                }))
              }
              onRetry={retry}
              readOnly={readOnly}
              reason={
                recipient.recoveryIntentId
                  ? (retryReasons[String(recipient.recoveryIntentId)] ?? "")
                  : ""
              }
              recipient={recipient}
              retryingIntentId={retryingIntentId}
            />
          ))
        )}
      </div>
      {retryError ? (
        <p className="mt-3 text-destructive text-xs" role="alert">
          {retryError}
        </p>
      ) : null}
    </details>
  );
}

function RecipientCommunicationCard({
  index,
  onReasonChange,
  onRetry,
  readOnly,
  reason,
  recipient,
  retryingIntentId,
}: {
  index: number;
  onReasonChange: (intentId: Id<"communicationIntents">, value: string) => void;
  onRetry: (intentId: Id<"communicationIntents">) => Promise<void>;
  readOnly: boolean;
  reason: string;
  recipient: QuoteRoundRegisterRow["recipientDelivery"][number];
  retryingIntentId?: string;
}) {
  const intentId = recipient.recoveryIntentId;
  return (
    <Card className="gap-0 rounded-lg p-3 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">Recipient {index + 1}</p>
          <p className="mt-1 text-muted-foreground">
            Latest: {recipient.latestStatus ?? "not sent"}
            {recipient.latestOutcomeAt
              ? ` · ${formatLastActivity(recipient.latestOutcomeAt)}`
              : ""}
          </p>
        </div>
        <span className="text-muted-foreground text-xs">
          {recipient.attemptCount} attempt
          {recipient.attemptCount === 1 ? "" : "s"}
        </span>
      </div>
      <p className="mt-2 text-muted-foreground">
        Recovery: {recipient.recoveryState}
        {recipient.actionRequired ? " · action required" : ""}
        {recipient.reminderEligible ? " · reminder eligible" : ""}
        {recipient.cooldownUntil
          ? ` · cooldown until ${formatLastActivity(recipient.cooldownUntil)}`
          : ""}
      </p>
      <ol className="mt-2 grid gap-1 border-t pt-2 text-muted-foreground">
        {recipient.history.map((entry) => (
          <li
            className="grid gap-0.5 text-[0.6875rem]"
            key={`${entry.createdAt}:${entry.lastOutcomeAt ?? "none"}:${entry.kind}:${entry.status}:${entry.detail ?? "none"}`}
          >
            <span>
              {formatLastActivity(entry.createdAt)} · {entry.kind} ·{" "}
              {entry.status}
            </span>
            {entry.detail ? <span>{entry.detail}</span> : null}
          </li>
        ))}
      </ol>
      {!readOnly && intentId ? (
        <div className="mt-3 grid gap-2 border-t pt-3">
          <Input
            aria-label={`Retry reason for recipient ${index + 1}`}
            onChange={(event) => onReasonChange(intentId, event.target.value)}
            placeholder="Reason for retrying this failed delivery"
            value={reason}
          />
          <Button
            disabled={!reason.trim() || Boolean(retryingIntentId)}
            onClick={() => onRetry(intentId)}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw />
            {retryingIntentId === String(intentId)
              ? "Retrying delivery…"
              : "Retry delivery"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function MobileControlRegister({
  buildId,
  expandedId,
  now,
  onExpand,
  onOpen,
  organizationId,
  readOnly,
  rows,
}: {
  buildId: string;
  expandedId: string | null;
  now: number;
  onExpand: (id: string | null) => void;
  onOpen?: (roundId: string) => void;
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
                  <span className="font-semibold text-sm">{row.title}</span>
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
            <div className="mt-4 flex justify-end">
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

function RegisterEmpty({
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

function NoResults({ onClear }: { onClear: () => void }) {
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
