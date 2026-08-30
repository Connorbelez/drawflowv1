import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
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
import { RecipientDisclosure } from "./QuoteRoundsSurfaceCommunication.tsx";
import type {
  QuoteRoundListProjection,
  QuoteRoundRegisterMode,
  QuoteRoundRegisterRow,
  QuoteRoundRegisterSort,
} from "./QuoteRoundsSurfaceContracts.ts";
import {
  DETAIL_UNAVAILABLE_LABEL,
  DETAIL_UNAVAILABLE_TITLE,
  formatDeadline,
  formatDeadlineRelative,
  modeLabel,
  primaryActionLabel,
} from "./QuoteRoundsSurfaceContracts.ts";
import {
  MobileControlRegister,
  NoResults,
  RegisterEmpty,
} from "./QuoteRoundsSurfaceMobile.tsx";
import {
  CurrentState,
  LifecycleRail,
  PreferredQuote,
  ScopeUpdateBadge,
} from "./QuoteRoundsSurfacePresentation.tsx";

export function QuoteRoundsRegister({
  buildId,
  cached = false,
  deleteError,
  deletingId,
  hardError = false,
  list,
  onCreate,
  onDeleteDraft,
  onDeleteErrorReset,
  onOpen,
  onRetry,
  organizationId,
  readOnly = false,
  readOnlyLabel = "Read-only",
}: {
  buildId: string;
  cached?: boolean;
  deleteError?: string;
  deletingId?: string;
  hardError?: boolean;
  list: QuoteRoundListProjection;
  onCreate?: () => void;
  onDeleteDraft: (row: QuoteRoundRegisterRow) => Promise<void>;
  onDeleteErrorReset: () => void;
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
  const [draftPendingDeletion, setDraftPendingDeletion] =
    useState<QuoteRoundRegisterRow | null>(null);
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
                onRequestDelete={setDraftPendingDeletion}
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
                onRequestDelete={setDraftPendingDeletion}
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
      <DeleteQuoteRoundDraftDialog
        deleting={deletingId === draftPendingDeletion?._id}
        error={deleteError}
        onConfirm={async () => {
          if (!draftPendingDeletion) {
            return;
          }
          await onDeleteDraft(draftPendingDeletion);
          setDraftPendingDeletion(null);
        }}
        onOpenChange={(open) => {
          if (!(open || deletingId)) {
            setDraftPendingDeletion(null);
            onDeleteErrorReset();
          }
        }}
        row={draftPendingDeletion}
      />
    </div>
  );
}

function DeleteQuoteRoundDraftDialog({
  deleting,
  error,
  onConfirm,
  onOpenChange,
  row,
}: {
  deleting: boolean;
  error?: string;
  onConfirm: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  row: QuoteRoundRegisterRow | null;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={row !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete draft Quote Request</AlertDialogTitle>
          <AlertDialogDescription>
            {row
              ? `Delete “${row.title}”? Its unpublished scope and recipient setup will be removed. This action cannot be undone.`
              : "Delete this unpublished Quote Request draft?"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogClose
            render={<Button disabled={deleting} variant="outline" />}
          >
            Keep draft
          </AlertDialogClose>
          <Button
            disabled={deleting}
            onClick={() => onConfirm().catch(() => undefined)}
            variant="destructive"
          >
            <Trash2 /> {deleting ? "Deleting…" : "Delete draft"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
                      <ScopeUpdateBadge className="shrink-0" row={row} />
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
                <div className="flex justify-end gap-1">
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
