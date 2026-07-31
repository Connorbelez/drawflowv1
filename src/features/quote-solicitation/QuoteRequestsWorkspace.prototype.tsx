"use client";

// PROTOTYPE ONLY — selected synthesis for the Build Workspace Quotes tab.
// A: scalable register and sortable facts.
// B: ranked attention and explicit exception reasons.
// C: compact, non-draggable lifecycle rail.

import {
  AlertTriangle,
  ArrowDownUp,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileStack,
  MailWarning,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

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

export const QUOTE_REQUESTS_PROTOTYPE_VARIANT =
  "quote-requests-control" as const;

export const QUOTE_REQUESTS_SCENARIOS = [
  ["active", "Active operations"],
  ["homeowner", "Homeowner read-only"],
  ["backoffice", "Backoffice audit"],
  ["empty", "First-use empty"],
  ["loading", "Loading"],
  ["stale", "Cached refresh error"],
  ["error", "Hard error"],
] as const;

export type QuoteRequestsPrototypeScenario =
  (typeof QUOTE_REQUESTS_SCENARIOS)[number][0];

export function isQuoteRequestsPrototypeScenario(
  value: unknown
): value is QuoteRequestsPrototypeScenario {
  return QUOTE_REQUESTS_SCENARIOS.some(([scenario]) => scenario === value);
}

type QuoteMode = "labour" | "material";
type QuotePhase = "draft" | "scheduled" | "open" | "closed";
type AttentionTone = "critical" | "warning" | "neutral";

interface QuoteRoundRow {
  action: string;
  attention?: {
    detail: string;
    label: string;
    rank: number;
    tone: AttentionTone;
  };
  deadline: string;
  deadlineRelative: string;
  delivery: string;
  id: string;
  lastActivity: string;
  mode: QuoteMode;
  phase: QuotePhase;
  preferred?: {
    amount: string;
    name: string;
  };
  recipients: number;
  responses: {
    drafting: number;
    submitted: number;
  };
  revision: number;
  scope: string;
  title: string;
}

const QUOTE_ROUNDS: QuoteRoundRow[] = [
  {
    action: "Review delivery",
    attention: {
      detail: "Northline Materials · mailbox unavailable",
      label: "Delivery failed",
      rank: 1,
      tone: "critical",
    },
    deadline: "Aug 16 · 5:00 PM",
    deadlineRelative: "4h",
    delivery: "2 delivered · 1 failed",
    id: "QR-0051",
    lastActivity: "Failure recorded 12m ago",
    mode: "material",
    phase: "open",
    recipients: 3,
    responses: { drafting: 0, submitted: 1 },
    revision: 2,
    scope: "Trusses · roof sheathing · delivery",
    title: "Roof structure materials",
  },
  {
    action: "Remind 2",
    attention: {
      detail: "Two eligible recipients have not started",
      label: "Deadline approaching",
      rank: 2,
      tone: "warning",
    },
    deadline: "Aug 18 · 5:00 PM",
    deadlineRelative: "2d",
    delivery: "4 delivered",
    id: "QR-0048",
    lastActivity: "Summit submitted 1h ago",
    mode: "labour",
    phase: "open",
    preferred: { amount: "$48,250", name: "McLeod Forming" },
    recipients: 4,
    responses: { drafting: 1, submitted: 2 },
    revision: 3,
    scope: "Foundation walls · structural slab · waterproofing",
    title: "Foundation labour",
  },
  {
    action: "Review revision",
    attention: {
      detail: "One supplier has not acknowledged Package R3",
      label: "Revision outstanding",
      rank: 3,
      tone: "warning",
    },
    deadline: "Aug 21 · 12:00 PM",
    deadlineRelative: "5d",
    delivery: "3 delivered",
    id: "QR-0047",
    lastActivity: "Package R3 published yesterday",
    mode: "material",
    phase: "open",
    recipients: 3,
    responses: { drafting: 1, submitted: 1 },
    revision: 3,
    scope: "Window package · exterior doors · flashing",
    title: "Windows and exterior doors",
  },
  {
    action: "Review schedule",
    deadline: "Dispatch Aug 19 · 8:30 AM",
    deadlineRelative: "3d",
    delivery: "Not dispatched",
    id: "QR-0046",
    lastActivity: "Schedule set by Maya Chen",
    mode: "labour",
    phase: "scheduled",
    recipients: 5,
    responses: { drafting: 0, submitted: 0 },
    revision: 1,
    scope: "Electrical rough-in · service · panel",
    title: "Electrical rough-in",
  },
  {
    action: "Continue draft",
    attention: {
      detail: "Insurance question and deadline are incomplete",
      label: "Draft needs setup",
      rank: 5,
      tone: "neutral",
    },
    deadline: "Not set",
    deadlineRelative: "—",
    delivery: "Not dispatched",
    id: "QR-0052",
    lastActivity: "Edited 18m ago",
    mode: "labour",
    phase: "draft",
    recipients: 3,
    responses: { drafting: 0, submitted: 0 },
    revision: 1,
    scope: "HVAC rough-in · ventilation · startup",
    title: "Mechanical rough-in",
  },
  {
    action: "Compare responses",
    deadline: "Closed Jul 12 · 5:00 PM",
    deadlineRelative: "Closed",
    delivery: "4 delivered",
    id: "QR-0041",
    lastActivity: "Preferred marked Jul 14",
    mode: "labour",
    phase: "closed",
    preferred: { amount: "$31,400", name: "Apex Siteworks" },
    recipients: 4,
    responses: { drafting: 0, submitted: 4 },
    revision: 2,
    scope: "Excavation · drainage · rough grading",
    title: "Sitework package",
  },
];

const PHASES: QuotePhase[] = ["draft", "scheduled", "open", "closed"];

export function QuoteRequestsWorkspacePrototype({
  onScenarioChange,
  onStartQuote,
  scenario,
}: {
  onScenarioChange: (scenario: QuoteRequestsPrototypeScenario) => void;
  onStartQuote: () => void;
  scenario: QuoteRequestsPrototypeScenario;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | QuoteMode>("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>("QR-0048");
  const readOnly = scenario === "homeowner" || scenario === "backoffice";
  const rows = useMemo(
    () =>
      QUOTE_ROUNDS.filter((row) => {
        const matchesQuery = `${row.id} ${row.title} ${row.scope}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const matchesMode = mode === "all" || row.mode === mode;
        const matchesAttention = !attentionOnly || Boolean(row.attention);
        return matchesQuery && matchesMode && matchesAttention;
      }),
    [attentionOnly, mode, query]
  );

  return (
    <div className="grid gap-4 pb-24">
      <Frame className="rounded-xl">
        <FramePanel className="overflow-hidden rounded-lg p-0">
          <FrameHeader className="gap-4 border-b px-4 py-4 sm:px-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <FrameTitle className="text-lg">Quote requests</FrameTitle>
                {readOnly ? (
                  <Badge variant="outline">
                    {scenario === "homeowner" ? "Homeowner" : "Audit"} ·
                    read-only
                  </Badge>
                ) : null}
              </div>
              <FrameDescription className="mt-1">
                6 rounds · 3 open · 3 need attention · 1 delivery failure
              </FrameDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {import.meta.env.DEV ? (
                <NativeSelect
                  aria-label="Prototype scenario"
                  className="w-44"
                  onChange={(event) =>
                    onScenarioChange(
                      event.target.value as QuoteRequestsPrototypeScenario
                    )
                  }
                  value={scenario}
                >
                  {QUOTE_REQUESTS_SCENARIOS.map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              ) : null}
              {readOnly ? null : (
                <Button onClick={onStartQuote}>
                  <Plus /> New quote request
                </Button>
              )}
            </div>
          </FrameHeader>

          {scenario === "stale" ? (
            <div className="flex items-center gap-3 border-warning/30 border-b bg-warning/8 px-4 py-3 text-sm sm:px-5">
              <RefreshCw className="size-4 text-warning" />
              <span className="flex-1">
                Couldn&apos;t refresh · showing data from 4 minutes ago
              </span>
              <Button size="sm" variant="outline">
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
            query={query}
          />

          <RegisterBody
            expandedId={expandedId}
            onClear={() => {
              setAttentionOnly(false);
              setMode("all");
              setQuery("");
            }}
            onExpand={setExpandedId}
            onStartQuote={readOnly ? undefined : onStartQuote}
            readOnly={readOnly}
            rows={rows}
            scenario={scenario}
          />
        </FramePanel>
      </Frame>
    </div>
  );
}

function RegisterBody({
  expandedId,
  onClear,
  onExpand,
  onStartQuote,
  readOnly,
  rows,
  scenario,
}: {
  expandedId: string | null;
  onClear: () => void;
  onExpand: (id: string | null) => void;
  onStartQuote?: () => void;
  readOnly: boolean;
  rows: QuoteRoundRow[];
  scenario: QuoteRequestsPrototypeScenario;
}) {
  if (scenario === "loading") {
    return <RegisterLoading />;
  }
  if (scenario === "error") {
    return <RegisterError />;
  }
  if (scenario === "empty") {
    return <RegisterEmpty onStartQuote={onStartQuote} />;
  }
  if (rows.length === 0) {
    return <NoResults onClear={onClear} />;
  }
  return (
    <>
      <AttentionStrip rows={rows} />
      <DesktopControlRegister
        expandedId={expandedId}
        onExpand={onExpand}
        readOnly={readOnly}
        rows={rows}
      />
      <MobileControlRegister
        expandedId={expandedId}
        onExpand={onExpand}
        readOnly={readOnly}
        rows={rows}
      />
    </>
  );
}

function ControlRegisterToolbar({
  attentionOnly,
  mode,
  onAttentionOnlyChange,
  onModeChange,
  onQueryChange,
  query,
}: {
  attentionOnly: boolean;
  mode: "all" | QuoteMode;
  onAttentionOnlyChange: (value: boolean) => void;
  onModeChange: (value: "all" | QuoteMode) => void;
  onQueryChange: (value: string) => void;
  query: string;
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
          placeholder="Search round, scope, recipient, or email"
          value={query}
        />
      </div>
      <fieldset className="flex min-w-0 gap-1 overflow-x-auto">
        <legend className="sr-only">Quote request type</legend>
        {(["all", "labour", "material"] as const).map((value) => (
          <Button
            className="shrink-0"
            key={value}
            onClick={() => onModeChange(value)}
            size="sm"
            variant={mode === value ? "secondary" : "ghost"}
          >
            {value === "all"
              ? "All"
              : value === "labour"
                ? "Labour"
                : "Materials"}
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
        <Button aria-label="More filters" size="icon-sm" variant="ghost">
          <SlidersHorizontal />
        </Button>
        <Button aria-label="Sort quote requests" size="icon-sm" variant="ghost">
          <ArrowDownUp />
        </Button>
      </div>
    </div>
  );
}

function AttentionStrip({ rows }: { rows: QuoteRoundRow[] }) {
  const attention = [...rows]
    .filter((row) => row.attention)
    .sort((a, b) => (a.attention?.rank ?? 99) - (b.attention?.rank ?? 99));
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
          Ranked by delivery, deadline, revision, then readiness
        </p>
      </div>
      <ol className="grid gap-px overflow-hidden rounded-md border bg-border md:grid-cols-3">
        {attention.slice(0, 3).map((row, index) => (
          <li
            className="flex min-w-0 items-start gap-3 bg-background px-3 py-2.5"
            key={row.id}
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
  expandedId,
  onExpand,
  readOnly,
  rows,
}: {
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  readOnly: boolean;
  rows: QuoteRoundRow[];
}) {
  return (
    <div className="hidden overflow-x-auto lg:block">
      <div className="min-w-[66rem]">
        <div className="grid grid-cols-[minmax(13rem,1.3fr)_12rem_minmax(10rem,1fr)_7rem_6rem_8rem_7rem] border-b bg-muted/36 px-4 py-2 font-medium text-[0.6875rem] text-muted-foreground uppercase tracking-[0.08em]">
          <span>Round and scope</span>
          <span>Lifecycle</span>
          <span>Current state</span>
          <span>Deadline</span>
          <span>Responses</span>
          <span>Preferred quote</span>
          <span className="text-right">Action</span>
        </div>
        {rows.map((row) => (
          <div className="border-b last:border-b-0" key={row.id}>
            <div
              className={cn(
                "grid grid-cols-[minmax(13rem,1.3fr)_12rem_minmax(10rem,1fr)_7rem_6rem_8rem_7rem] items-center px-4 py-3",
                row.attention?.tone === "critical" &&
                  "border-destructive border-l-4 pl-3",
                row.attention?.tone === "warning" &&
                  "border-warning border-l-4 pl-3"
              )}
            >
              <button
                className="flex min-w-0 items-start gap-2 text-left"
                onClick={() => onExpand(expandedId === row.id ? null : row.id)}
                type="button"
              >
                {expandedId === row.id ? (
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
                      {row.id}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-muted-foreground text-xs">
                    {row.mode === "labour" ? "Labour" : "Materials"} · R
                    {row.revision} · {row.scope}
                  </span>
                </span>
              </button>
              <LifecycleRail phase={row.phase} />
              <CurrentState row={row} />
              <div className="text-xs">
                <p className="font-medium">{row.deadlineRelative}</p>
                <p className="mt-1 text-muted-foreground">{row.deadline}</p>
              </div>
              <div className="text-xs tabular-nums">
                <p className="font-semibold">
                  {row.responses.submitted} / {row.recipients}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {row.responses.drafting} drafting
                </p>
              </div>
              <PreferredQuote preferred={row.preferred} />
              <div className="text-right">
                <Button size="sm" variant="outline">
                  {readOnly ? "View" : row.action}
                </Button>
              </div>
            </div>
            {expandedId === row.id ? <RecipientDisclosure row={row} /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function LifecycleRail({ phase }: { phase: QuotePhase }) {
  const activeIndex = PHASES.indexOf(phase);
  return (
    <div
      aria-label={`Lifecycle: ${phase}`}
      className="flex items-center pr-5"
      role="img"
    >
      {PHASES.map((item, index) => {
        const completed = index < activeIndex;
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
              title={item}
            >
              {completed ? <Check className="size-3" /> : index + 1}
            </span>
            {index < PHASES.length - 1 ? (
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

function CurrentState({ row }: { row: QuoteRoundRow }) {
  const Icon =
    row.attention?.tone === "critical"
      ? MailWarning
      : row.attention?.tone === "warning"
        ? AlertTriangle
        : row.phase === "scheduled"
          ? CalendarClock
          : row.phase === "closed"
            ? ShieldCheck
            : row.phase === "draft"
              ? FileStack
              : Clock3;
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
          {row.attention?.label ?? titleCase(row.phase)}
        </span>
        <span className="mt-1 block truncate text-muted-foreground">
          {row.attention?.detail ?? row.delivery}
        </span>
      </span>
    </div>
  );
}

function PreferredQuote({
  preferred,
}: {
  preferred?: QuoteRoundRow["preferred"];
}) {
  if (!preferred) {
    return <span className="text-muted-foreground text-xs">Not selected</span>;
  }
  return (
    <div className="min-w-0 text-xs">
      <p className="truncate font-medium">{preferred.name}</p>
      <p className="mt-1 text-muted-foreground tabular-nums">
        {preferred.amount} · informational
      </p>
    </div>
  );
}

function RecipientDisclosure({ row }: { row: QuoteRoundRow }) {
  return (
    <div className="grid grid-cols-[15rem_1fr_1fr_8rem] gap-4 border-t bg-muted/18 px-10 py-3 text-xs">
      <div>
        <p className="font-medium">Recipient activity</p>
        <p className="mt-1 text-muted-foreground">{row.lastActivity}</p>
      </div>
      <div>
        <p className="font-medium">Delivery</p>
        <p className="mt-1 text-muted-foreground">{row.delivery}</p>
      </div>
      <div>
        <p className="font-medium">Package</p>
        <p className="mt-1 text-muted-foreground">
          Revision {row.revision} · identical package
        </p>
      </div>
      <Button size="sm" variant="ghost">
        Open detail <ChevronRight />
      </Button>
    </div>
  );
}

function MobileControlRegister({
  expandedId,
  onExpand,
  readOnly,
  rows,
}: {
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  readOnly: boolean;
  rows: QuoteRoundRow[];
}) {
  return (
    <div className="lg:hidden">
      {rows.map((row, index) => {
        const expanded = expandedId === row.id;
        return (
          <section
            className={cn(
              "border-b px-4 py-4 last:border-b-0",
              row.attention?.tone === "critical" &&
                "border-l-4 border-l-destructive pl-3",
              row.attention?.tone === "warning" &&
                "border-l-4 border-l-warning pl-3"
            )}
            key={row.id}
          >
            <button
              aria-expanded={expanded}
              className="flex w-full items-start gap-3 text-left"
              onClick={() => onExpand(expanded ? null : row.id)}
              type="button"
            >
              <span className="whitespace-nowrap font-semibold text-primary text-xs tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-3">
                  <span className="font-semibold text-sm">{row.title}</span>
                  <span className="text-[0.6875rem] text-muted-foreground uppercase tracking-[0.08em]">
                    {row.mode === "labour" ? "Labour" : "Materials"}
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
                <p className="mt-1 font-semibold">{row.deadlineRelative}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Responses</p>
                <p className="mt-1 font-semibold tabular-nums">
                  {row.responses.submitted} / {row.recipients}
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
              <div className="mt-4 border-primary/50 border-l-2 pl-4">
                <VerticalLifecycle phase={row.phase} row={row} />
                <div className="mt-4 border-t pt-3">
                  <p className="text-muted-foreground text-xs">
                    Preferred Quote
                  </p>
                  <PreferredQuote preferred={row.preferred} />
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end">
              <Button size="sm" variant={expanded ? "outline" : "ghost"}>
                {readOnly ? "View round" : row.action} <ChevronRight />
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
  phase: QuotePhase;
  row: QuoteRoundRow;
}) {
  const activeIndex = PHASES.indexOf(phase);
  return (
    <ol className="grid gap-0">
      {PHASES.map((item, index) => {
        const completed = index < activeIndex;
        const active = index === activeIndex;
        return (
          <li className="grid grid-cols-[1.25rem_1fr] gap-3" key={item}>
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full border text-[0.625rem]",
                  completed && "border-success/50 bg-success/12 text-success",
                  active && "border-primary bg-primary text-primary-foreground"
                )}
              >
                {completed ? <Check className="size-3" /> : index + 1}
              </span>
              {index < PHASES.length - 1 ? (
                <span className="min-h-6 w-px flex-1 bg-border" />
              ) : null}
            </div>
            <div className="pb-4">
              <p
                className={cn(
                  "font-medium text-muted-foreground text-xs",
                  active && "text-foreground"
                )}
              >
                {titleCase(item)}
              </p>
              {active ? (
                <div className="mt-1 text-xs">
                  <p>{row.delivery}</p>
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

function RegisterLoading() {
  const skeletonRows = ["one", "two", "three", "four", "five"];
  return (
    <div
      aria-label="Loading quote requests"
      className="animate-pulse"
      role="status"
    >
      {skeletonRows.map((row) => (
        <div className="grid gap-3 border-b px-4 py-4" key={row}>
          <div className="h-4 w-1/3 rounded bg-muted" />
          <div className="h-3 w-2/3 rounded bg-muted/70" />
        </div>
      ))}
    </div>
  );
}

function RegisterError() {
  return (
    <div className="grid min-h-72 place-items-center px-4 py-10 text-center">
      <div>
        <XCircle className="mx-auto size-7 text-destructive" />
        <h3 className="mt-3 font-semibold">Quote requests unavailable</h3>
        <p className="mt-1 max-w-md text-muted-foreground text-sm">
          The Build remains available, but this register could not be loaded.
          Reference QRW-204.
        </p>
        <Button className="mt-4" variant="outline">
          <RefreshCw /> Retry
        </Button>
      </div>
    </div>
  );
}

function RegisterEmpty({ onStartQuote }: { onStartQuote?: () => void }) {
  return (
    <div className="grid min-h-72 place-items-center px-4 py-10 text-center">
      <div>
        <PackageSearch className="mx-auto size-7 text-muted-foreground" />
        <h3 className="mt-3 font-semibold">No quote requests yet</h3>
        <p className="mt-1 max-w-md text-muted-foreground text-sm">
          Quote Rounds for this Build will appear here with their delivery,
          response, deadline, lifecycle, and Preferred Quote status.
        </p>
        {onStartQuote ? (
          <Button className="mt-4" onClick={onStartQuote}>
            <Plus /> Create first quote request
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

function titleCase(value: string) {
  return value.replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}
