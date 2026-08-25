import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  Filter,
  Inbox,
  Layers3,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";

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
import { Separator } from "#/components/ui/separator.tsx";
import { cn } from "#/lib/utils.ts";
import { PulseItem, StatusBadge, actionLabel } from "./contractor-quotes-prototype-variants.tsx";
import type {
  BuildGroup,
  ContractorQuotesPrototypeMode,
  PanelState,
  QuoteRequest,
  QuoteRow,
} from "./contractor-quotes-prototype-types.ts";
export function PrototypeHeader({
  mode,
  onModeChange,
  search,
  setSearch,
}: {
  mode: ContractorQuotesPrototypeMode;
  onModeChange: (mode: ContractorQuotesPrototypeMode) => void;
  search: string;
  setSearch: (value: string) => void;
}) {
  return (
    <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-2">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.18em]">
          Contractor workspace
        </p>
        <div>
          <h1 className="font-semibold text-4xl text-foreground tracking-[-0.04em] sm:text-5xl">
            Quotes
          </h1>
          <p className="mt-2 max-w-xl text-muted-foreground text-sm sm:text-base">
            Private requests and public opportunities, with one response workspace.
          </p>
        </div>
        <div
          aria-label="Quote workspace view"
          className="inline-flex rounded-xl border border-border/80 bg-background/75 p-1 shadow-xs/5 backdrop-blur-xl"
          role="tablist"
        >
          <ModeButton
            active={mode === "my"}
            icon={<Inbox className="size-4" />}
            onClick={() => onModeChange("my")}
          >
            My Quotes
          </ModeButton>
          <ModeButton
            active={mode === "public"}
            icon={<Layers3 className="size-4" />}
            onClick={() => onModeChange("public")}
          >
            Public Bidding
          </ModeButton>
        </div>
      </div>

      <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
        <label className="relative min-w-0 flex-1 sm:min-w-[260px] lg:w-[320px]">
          <span className="sr-only">Search quotes</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-10 w-full rounded-xl border border-border/80 bg-background/75 pr-3 pl-10 text-sm shadow-xs/5 outline-none transition-shadow placeholder:text-muted-foreground/75 focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={mode === "my" ? "Search builds or requests" : "Search public opportunities"}
            value={search}
          />
        </label>
        <Button className="h-10" variant="outline">
          <Filter />
          Filters
        </Button>
      </div>
    </header>
  );
}

function ModeButton({
  active,
  children,
  icon,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-lg px-3.5 font-medium text-sm transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {icon}
      {children}
    </button>
  );
}


export function OpportunityQueue({
  builds,
  mode,
  onOpenPanel,
  onSelect,
}: {
  builds: BuildGroup[];
  mode: ContractorQuotesPrototypeMode;
  onOpenPanel: (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => void;
  onSelect: (quote: QuoteRow) => void;
}) {
  const rows = builds.flatMap((build) =>
    build.quoteRequests.flatMap((request) =>
      request.rows.map((quote) => ({ build, request, quote })),
    ),
  );
  const sections = mode === "public"
    ? [{ label: "Open public opportunities", icon: <Layers3 />, tone: "primary", rows }]
    : [
        { label: "Needs your response", icon: <CircleAlert />, tone: "warning", rows: rows.filter(({ quote }) => ["draft", "stale"].includes(quote.status)) },
        { label: "Offer pending", icon: <Clock3 />, tone: "primary", rows: rows.filter(({ quote }) => quote.status === "offer") },
        { label: "Submitted & history", icon: <CircleCheck />, tone: "neutral", rows: rows.filter(({ quote }) => ["submitted", "closed"].includes(quote.status)) },
      ];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.55fr)]">
      <div className="space-y-6">
        {sections.map((section) => (
          <section key={section.label}>
            <div className="mb-3 flex items-center gap-2">
              <span className={cn("grid size-7 place-items-center rounded-full", section.tone === "warning" ? "bg-warning/12 text-warning" : section.tone === "primary" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                {section.icon}
              </span>
              <h2 className="font-semibold text-lg tracking-[-0.02em]">{section.label}</h2>
              <span className="text-muted-foreground text-xs">{section.rows.length}</span>
            </div>
            <div className="space-y-3">
              {section.rows.length > 0 ? section.rows.map(({ build, request, quote }) => (
                <QueueCard
                  build={build}
                  key={quote.id}
                  onOpenPanel={onOpenPanel}
                  onSelect={() => onSelect(quote)}
                  quote={quote}
                  request={request}
                />
              )) : (
                <FramePanel className="flex items-center gap-3 border-dashed py-5 text-muted-foreground text-sm">
                  <Check className="size-4 text-success" /> Nothing waiting in this lane.
                </FramePanel>
              )}
            </div>
          </section>
        ))}
      </div>
      <Frame className="h-fit xl:sticky xl:top-6">
        <FramePanel>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>Quote pulse</FrameTitle>
            <FrameDescription>One place for the decisions that need your attention.</FrameDescription>
          </FrameHeader>
          <div className="space-y-4">
            <PulseItem color="bg-warning" label="Need attention" value={mode === "my" ? "2" : "—"} />
            <PulseItem color="bg-primary" label={mode === "my" ? "Offer pending" : "Open opportunities"} value={mode === "my" ? "1" : `${rows.length}`} />
            <PulseItem color="bg-success" label="Submitted" value={mode === "my" ? "1" : "—"} />
          </div>
          <Separator className="my-5" />
          <p className="flex items-start gap-2 text-muted-foreground text-xs leading-relaxed">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            Public bids are global to authenticated contractors. Response details remain private to you and the publishing team.
          </p>
        </FramePanel>
      </Frame>
    </div>
  );
}

function QueueCard({
  build,
  onOpenPanel,
  onSelect,
  quote,
  request,
}: {
  build: BuildGroup;
  onOpenPanel: (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => void;
  onSelect: () => void;
  quote: QuoteRow;
  request: QuoteRequest;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-3 p-4 sm:grid-cols-[minmax(150px,0.65fr)_minmax(180px,0.95fr)_minmax(160px,0.75fr)_auto] sm:items-center">
        <button
          className="grid min-w-0 cursor-pointer gap-4 text-left outline-none transition-[background-color,transform] hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:scale-[0.998] motion-reduce:transition-none motion-reduce:active:scale-100 sm:col-span-3 sm:grid-cols-3"
          onClick={onSelect}
          type="button"
        >
          <div className="min-w-0">
            <p className="truncate font-semibold text-sm">{build.name}</p>
            <p className="mt-1 flex items-center gap-1 truncate text-muted-foreground text-xs"><MapPin className="size-3.5" /> {build.city}</p>
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs uppercase tracking-[0.12em]">{request.title}</p>
            <p className="mt-1 truncate font-medium text-sm">{quote.name}</p>
            <p className="mt-1 truncate text-muted-foreground text-xs">{quote.scopePreview}</p>
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs uppercase tracking-[0.12em]">{quote.status === "offer" ? "Offer expires" : "Response deadline"}</p>
            <p className={cn("mt-1 font-medium text-sm", quote.status === "stale" && "text-warning")}>{quote.status === "offer" ? quote.offerExpires ?? "Aug 18, 2026" : quote.deadline}</p>
            <div className="mt-1"><StatusBadge status={quote.status} /></div>
          </div>
        </button>
        <div className="flex items-center gap-2 sm:justify-self-end">
          <Button onClick={() => onOpenPanel(quote.status === "offer" ? "offer" : quote.status === "stale" ? "snapshot" : "workspace", quote)} size="sm" variant="outline">
            {quote.status === "offer" ? "Review offer" : quote.status === "public" ? "View opportunity" : actionLabel(quote.status)}
            <ArrowRight />
          </Button>
          <ChevronRight className="hidden size-4 text-muted-foreground sm:block" />
        </div>
      </div>
    </Card>
  );
}

export function DeadlineBoard({
  builds,
  expandedIds,
  mode,
  onExpand,
  onOpenPanel,
  onSelect,
}: {
  builds: BuildGroup[];
  expandedIds: Set<string>;
  mode: ContractorQuotesPrototypeMode;
  onExpand: (quote: QuoteRow) => void;
  onOpenPanel: (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => void;
  onSelect: (quote: QuoteRow) => void;
}) {
  const entries = builds.flatMap((build) =>
    build.quoteRequests.flatMap((request) =>
      request.rows.map((quote) => ({ build, request, quote }))
    )
  );
  const buckets =
    mode === "my"
      ? [
          {
            caption: "Drafts and changed plans",
            entries: entries.filter(({ quote }) =>
              ["draft", "stale"].includes(quote.status)
            ),
            label: "Needs action",
            tone: "warning" as const,
          },
          {
            caption: "Submitted or awaiting work acceptance",
            entries: entries.filter(({ quote }) =>
              ["submitted", "offer"].includes(quote.status)
            ),
            label: "In flight",
            tone: "primary" as const,
          },
          {
            caption: "Read-only response history",
            entries: entries.filter(({ quote }) => quote.status === "closed"),
            label: "History",
            tone: "neutral" as const,
          },
        ]
      : [
          {
            caption: "Packages worth opening now",
            entries: entries.filter(({ quote }) => quote.status === "public"),
            label: "Open now",
            tone: "primary" as const,
          },
          {
            caption: "The next response windows to close",
            entries: entries.slice(0, 2),
            label: "Closing soon",
            tone: "warning" as const,
          },
          {
            caption: "Publisher-approved scope context",
            entries: entries.slice(2),
            label: "More packages",
            tone: "neutral" as const,
          },
        ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Frame>
        <FramePanel className="overflow-hidden p-0">
          <FrameHeader className="flex-row items-start justify-between gap-4">
            <div>
              <FrameTitle>
                {mode === "my" ? "Response windows" : "Bidding windows"}
              </FrameTitle>
              <FrameDescription>
                {mode === "my"
                  ? "A time-oriented dispatch for every quote decision."
                  : "Global opportunities grouped by the next useful moment."}
              </FrameDescription>
            </div>
            <Badge variant="outline">August 2026</Badge>
          </FrameHeader>
          <div className="grid border-y bg-muted/35 text-muted-foreground text-xs uppercase tracking-[0.12em] sm:grid-cols-3">
            {[
              "Aug 11–17",
              "Aug 18–24",
              "Aug 25–31",
            ].map((window) => (
              <div className="border-b px-4 py-2.5 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0" key={window}>
                {window}
              </div>
            ))}
          </div>
          <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {buckets.map((bucket) => (
              <section className="min-w-0 p-3" key={bucket.label}>
                <div className="mb-3 flex items-start gap-2 px-1">
                  <span
                    className={cn(
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                      bucket.tone === "warning"
                        ? "bg-warning/12 text-warning"
                        : bucket.tone === "primary"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {bucket.tone === "warning" ? (
                      <CircleAlert className="size-3.5" />
                    ) : bucket.tone === "primary" ? (
                      <CalendarDays className="size-3.5" />
                    ) : (
                      <CircleCheck className="size-3.5" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-sm">{bucket.label}</h2>
                    <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
                      {bucket.caption}
                    </p>
                  </div>
                  <span className="ml-auto text-muted-foreground text-xs">
                    {bucket.entries.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {bucket.entries.length > 0 ? (
                    bucket.entries.map(({ build, quote, request }) => (
                      <DeadlineCard
                        build={build}
                        expanded={expandedIds.has(quote.id)}
                        key={`${bucket.label}-${quote.id}`}
                        onExpand={() => onExpand(quote)}
                        onOpenPanel={onOpenPanel}
                        onSelect={() => onSelect(quote)}
                        quote={quote}
                        request={request}
                      />
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed px-3 py-5 text-center text-muted-foreground text-xs">
                      No quote decisions in this window.
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        </FramePanel>
      </Frame>
      <Frame className="h-fit xl:sticky xl:top-6">
        <FramePanel>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>Dispatch notes</FrameTitle>
            <FrameDescription>
              What this timeline is designed to make obvious.
            </FrameDescription>
          </FrameHeader>
          <div className="space-y-4 text-sm">
            <div className="flex gap-3">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-muted-foreground leading-relaxed">
                The date is the response deadline first. Schedule dates stay in
                the package detail so the two clocks do not compete.
              </p>
            </div>
            <Separator />
            <div className="flex gap-3">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <p className="text-muted-foreground leading-relaxed">
                A stale quote stays in its original lane. Open its plan
                snapshot before deciding whether the change matters.
              </p>
            </div>
            <Separator />
            <div className="flex gap-3">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-muted-foreground leading-relaxed">
                Public Bidding is global to authenticated contractors. A bid
                becomes private when you start the response.
              </p>
            </div>
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}

function DeadlineCard({
  build,
  expanded,
  onExpand,
  onOpenPanel,
  onSelect,
  quote,
  request,
}: {
  build: BuildGroup;
  expanded: boolean;
  onExpand: () => void;
  onOpenPanel: (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => void;
  onSelect: () => void;
  quote: QuoteRow;
  request: QuoteRequest;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-2 p-3">
        <button
          className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onSelect}
          type="button"
        >
          <span className="block truncate font-semibold text-sm">
            {quote.name}
          </span>
          <span className="mt-1 block truncate text-muted-foreground text-xs">
            {build.name} · {request.title}
          </span>
          <span className="mt-2 flex items-center gap-1.5 font-medium text-xs">
            <CalendarDays className="size-3.5 text-primary" />
            {quote.status === "offer"
              ? (quote.offerExpires ?? "Aug 18, 2026")
              : quote.deadline}
          </span>
        </button>
        <button
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${quote.name}`}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onExpand}
          type="button"
        >
          {expanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 border-t bg-muted/25 px-3 py-2">
        <StatusBadge status={quote.status} />
        <Button
          onClick={() =>
            onOpenPanel(
              quote.status === "offer"
                ? "offer"
                : quote.status === "stale"
                  ? "snapshot"
                  : "workspace",
              quote
            )
          }
          size="xs"
          variant="ghost"
        >
          {quote.status === "public" ? "Open package" : actionLabel(quote.status)}
          <ArrowRight />
        </Button>
      </div>
      {expanded ? (
        <div className="border-t px-3 py-3 text-xs">
          <p className="font-medium">Scope & materials</p>
          <p className="mt-1 text-muted-foreground leading-relaxed">
            {quote.scopePreview}
          </p>
          <p className="mt-2 text-muted-foreground">
            <span className="font-medium text-foreground/80">Materials:</span>{" "}
            {quote.materialsPreview}
          </p>
        </div>
      ) : null}
    </Card>
  );
}
