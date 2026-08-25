import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  Layers3,
  MapPin,
  PackageOpen,
  Wrench,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { cn } from "#/lib/utils.ts";
import { actionLabel, StatusBadge } from "./contractor-quotes-prototype-status.tsx";
import type {
  BuildGroup,
  ContractorQuotesPrototypeMode,
  PanelState,
  QuoteInput,
  QuotePricing,
  QuoteRequest,
  QuoteRow,
} from "./contractor-quotes-prototype-types.ts";
export function ScopeMatrix({
  builds,
  expandedIds,
  mode,
  onExpand,
  onOpenPanel,
  onSelect,
  selectedId,
}: {
  builds: BuildGroup[];
  expandedIds: Set<string>;
  mode: ContractorQuotesPrototypeMode;
  onExpand: (quote: QuoteRow) => void;
  onOpenPanel: (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => void;
  onSelect: (quote: QuoteRow) => void;
  selectedId: string;
}) {
  return (
    <div className="space-y-4">
      <Frame>
        <FramePanel className="overflow-hidden p-0">
          <FrameHeader className="flex-row items-start justify-between gap-4">
            <div>
              <FrameTitle>
                {mode === "my" ? "Your scope matrix" : "Public work matrix"}
              </FrameTitle>
              <FrameDescription>
                Labour and materials remain separate decisions on every package.
              </FrameDescription>
            </div>
            <Badge variant="outline">Labour + Materials</Badge>
          </FrameHeader>
          <div className="overflow-x-auto">
            <div className="min-w-[850px]">
              <div className="grid grid-cols-[minmax(260px,1.2fr)_minmax(160px,0.72fr)_minmax(160px,0.72fr)_minmax(190px,0.8fr)] border-y bg-muted/35 text-muted-foreground text-xs uppercase tracking-[0.12em]">
                <div className="px-4 py-3">Sub-milestone</div>
                <div className="border-l px-4 py-3">Labour</div>
                <div className="border-l px-4 py-3">Materials</div>
                <div className="border-l px-4 py-3">Response window</div>
              </div>
              {builds.map((build) => (
                <div key={build.id}>
                  <div className="flex items-center gap-2 border-b bg-background px-4 py-3">
                    <Building2 className="size-4 text-primary" />
                    <span className="font-semibold text-sm">{build.name}</span>
                    <span className="truncate text-muted-foreground text-xs">
                      {build.address} · {build.city}
                    </span>
                  </div>
                  {build.quoteRequests.map((request) => (
                    <div key={request.id}>
                      <div className="border-b bg-muted/20 px-4 py-2 text-muted-foreground text-xs">
                        {request.title} · deadline {request.deadline}
                      </div>
                      <div className="divide-y">
                        {request.rows.map((quote) => (
                          <ScopeMatrixRow
                            expanded={expandedIds.has(quote.id)}
                            key={quote.id}
                            onExpand={() => onExpand(quote)}
                            onOpenPanel={onOpenPanel}
                            onSelect={() => onSelect(quote)}
                            quote={quote}
                            selected={selectedId === quote.id}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </FramePanel>
      </Frame>
      <FramePanel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Wrench className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <p className="font-medium text-sm">One quote can cover more than one lane</p>
            <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
              Labour and Materials may be accepted independently. The matrix keeps that boundary visible without duplicating the response editor.
            </p>
          </div>
        </div>
        <Badge variant="secondary">Scope-level state</Badge>
      </FramePanel>
    </div>
  );
}

const buildScopeLedgerColumns =
  "lg:grid-cols-[minmax(240px,1.15fr)_minmax(160px,0.72fr)_minmax(160px,0.72fr)_minmax(160px,0.8fr)_minmax(150px,0.92fr)] lg:gap-4";

export function BuildScopeLedger({
  builds,
  expandedIds,
  mode,
  onExpand,
  onOpenPanel,
  onSelect,
  selectedId,
}: {
  builds: BuildGroup[];
  expandedIds: Set<string>;
  mode: ContractorQuotesPrototypeMode;
  onExpand: (quote: QuoteRow) => void;
  onOpenPanel: (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => void;
  onSelect: (quote: QuoteRow) => void;
  selectedId: string;
}) {
  const [buildOpenState, setBuildOpenState] = useState<Record<string, boolean>>({});

  if (builds.length === 0) {
    return (
      <Frame>
        <FramePanel className="py-14 text-center">
          <p className="font-medium">No matching opportunities</p>
          <p className="mt-1 text-muted-foreground text-sm">
            Adjust the search to restore the build scope ledger.
          </p>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <div className="space-y-4">
      {builds.map((build) => {
        const rows = build.quoteRequests.flatMap((request) => request.rows);
        const completed = rows.filter(isQuoteCompletion).length;
        const buildComplete = rows.length > 0 && completed === rows.length;
        const open = buildOpenState[build.id] ?? !buildComplete;
        const progress = rows.length === 0 ? 0 : Math.round((completed / rows.length) * 100);

        return (
          <Frame key={build.id}>
            <FramePanel className="overflow-hidden p-0">
              <FrameHeader className="border-b p-0">
                <button
                  aria-expanded={open}
                  className="w-full px-5 py-4 text-left outline-none transition-colors hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  onClick={() =>
                    setBuildOpenState((previous) => ({
                      ...previous,
                      [build.id]: !open,
                    }))
                  }
                  type="button"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <Building2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <FrameTitle>{build.name}</FrameTitle>
                          {buildComplete ? (
                            <Badge size="sm" variant="success">
                              Complete
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 flex items-start gap-1.5 text-muted-foreground text-xs">
                          <MapPin className="mt-0.5 size-3.5 shrink-0" />
                          <span>{build.address} · {build.city}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground text-xs sm:justify-end">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="size-3.5 text-primary" />
                        {buildDateRange(build)}
                      </span>
                      {buildPermit(build) ? (
                        <span className="flex items-center gap-1.5">
                          <FileText className="size-3.5 text-primary" />
                          {buildPermit(build)}
                        </span>
                      ) : null}
                      {open ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <div
                      aria-label={
                        String(completed) +
                        " of " +
                        String(rows.length) +
                        " Sub-milestones complete"
                      }
                      aria-valuemax={rows.length}
                      aria-valuemin={0}
                      aria-valuenow={completed}
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                    >
                      <div
                        className={cn(
                          "h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none",
                          buildComplete && "bg-success",
                        )}
                        style={{ width: String(progress) + "%" }}
                      />
                    </div>
                    <span className="whitespace-nowrap text-muted-foreground text-xs">
                      {completed} of {rows.length} complete
                    </span>
                  </div>
                </button>
              </FrameHeader>

              {open ? (
                <>
                  {build.quoteRequests.map((request) => (
                    <div key={request.id}>
                      <div className="flex flex-col gap-1 border-b bg-muted/20 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium text-sm">{request.title}</p>
                          <p className="mt-0.5 text-muted-foreground text-xs">
                            Quote request · response deadline {request.deadline}
                          </p>
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {request.rows.length} Sub-milestone{request.rows.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className={cn("hidden border-b bg-background/70 px-5 py-2 text-muted-foreground text-[11px] uppercase tracking-[0.12em] lg:grid", buildScopeLedgerColumns)}>
                        <span>Sub-milestone</span>
                        <span>Labour basis</span>
                        <span>Materials basis</span>
                        <span>Build window</span>
                        <span className="text-right">Action</span>
                      </div>
                      {request.rows.map((quote) => (
                        <BuildScopeLedgerRow
                          build={build}
                          expanded={expandedIds.has(quote.id)}
                          key={quote.id}
                          onExpand={() => onExpand(quote)}
                          onOpenPanel={onOpenPanel}
                          onSelect={() => onSelect(quote)}
                          quote={quote}
                          request={request}
                          selected={selectedId === quote.id}
                        />
                      ))}
                    </div>
                  ))}
                  <FrameFooter className="flex items-start gap-2 border-t text-muted-foreground text-xs">
                    <Layers3 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>
                      {mode === "my"
                        ? "The expanded row is context and routing; the canonical response editor remains QuoteFieldLedger."
                        : "Public package context is shared. Any response you start remains private to you and the publishing team."}
                    </span>
                  </FrameFooter>
                </>
              ) : (
                <div className="flex items-center justify-between gap-3 px-5 py-3 text-muted-foreground text-xs">
                  <span>All Sub-milestones have been submitted or passed on.</span>
                  <span>Expand to review</span>
                </div>
              )}
            </FramePanel>
          </Frame>
        );
      })}
    </div>
  );
}

function BuildScopeLedgerRow({
  build,
  expanded,
  onExpand,
  onOpenPanel,
  onSelect,
  quote,
  request,
  selected,
}: {
  build: BuildGroup;
  expanded: boolean;
  onExpand: () => void;
  onOpenPanel: (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => void;
  onSelect: () => void;
  quote: QuoteRow;
  request: QuoteRequest;
  selected: boolean;
}) {
  const pricing = pricingForQuote(quote);
  const offer = quote.status === "offer";
  return (
    <div
      className={cn(
        "border-b border-l-2 last:border-b-0",
        offer
          ? "border-l-info bg-info/[0.06]"
          : quote.status === "stale"
            ? "border-l-warning bg-warning/[0.035]"
            : "border-l-transparent",
        selected && "bg-primary/[0.06]",
      )}
    >
      <div className={cn("grid gap-3 px-5 py-4 lg:items-center", buildScopeLedgerColumns)}>
        <button
          aria-current={selected ? "true" : undefined}
          className="min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onSelect}
          type="button"
        >
          <span className="block truncate font-semibold text-sm">{quote.name}</span>
          <span className="mt-1 block line-clamp-2 text-muted-foreground text-xs leading-relaxed">
            {quote.scopePreview}
          </span>
          <span className="mt-2 block lg:hidden">
            <JQuoteStatusBadge quote={quote} />
          </span>
        </button>
        <QuoteBasisPreview inputs={pricing.labour} label="Labour" />
        <QuoteBasisPreview inputs={pricing.materials} label="Materials" />
        <div className="min-w-0 text-xs">
          <p className="truncate font-medium">{buildDateRange(build)}</p>
          <p className="mt-1 truncate text-muted-foreground">
            {offer
              ? quote.offerExpires ?? "Offer pending"
              : String(quote.deadline) + " · " + quote.deadlineLabel}
          </p>
        </div>
        <div className="flex items-center gap-2 lg:justify-self-end">
          <span className="hidden lg:block">
            <JQuoteStatusBadge quote={quote} />
          </span>
          <Button
            onClick={() => onOpenPanel(dossierPanelKind(quote), quote)}
            size="xs"
            variant={selected ? "default" : "outline"}
          >
            {quote.status === "public" ? "Start bid" : actionLabel(quote.status)}
            <ArrowUpRight />
          </Button>
          <Button
            aria-expanded={expanded}
            aria-label={
              (expanded ? "Collapse " : "Expand ") + quote.name
            }
            onClick={onExpand}
            size="icon-xs"
            variant="ghost"
          >
            {expanded ? <ChevronDown /> : <ChevronRight />}
          </Button>
        </div>
      </div>
      {expanded ? (
        <QuoteExpandedDetails
          build={build}
          onOpenPanel={onOpenPanel}
          quote={quote}
          request={request}
        />
      ) : null}
    </div>
  );
}

function QuoteExpandedDetails({
  build,
  onOpenPanel,
  quote,
  request,
}: {
  build: BuildGroup;
  onOpenPanel: (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => void;
  quote: QuoteRow;
  request: QuoteRequest;
}) {
  return (
    <div className="border-t bg-muted/20 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap gap-px overflow-hidden border-y bg-border/60">
        <ContextDatum icon={<CalendarDays />} label="Build window" value={buildDateRange(build)} />
        {buildPermit(build) ? (
          <ContextDatum icon={<FileText />} label="Permit" value={buildPermit(build) ?? ""} />
        ) : null}
        <ContextDatum icon={<Layers3 />} label="Quote request" value={request.title} />
        <ContextDatum
          icon={<Clock3 />}
          label={quote.status === "offer" ? "Offer expires" : "Response due"}
          value={quote.status === "offer" ? quote.offerExpires ?? quote.deadline : quote.deadline}
        />
      </div>
      <div className="grid gap-5 pt-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <div className="min-w-0">
          <p className="font-semibold text-xs uppercase tracking-[0.12em]">Scope & materials</p>
          <p className="mt-2 text-muted-foreground text-sm leading-relaxed">{quote.scopePreview}</p>
          <p className="mt-3 text-muted-foreground text-sm leading-relaxed">
            <span className="font-medium text-foreground/80">Materials:</span>{" "}
            {quote.materialsPreview}
          </p>
          {quote.packageNote ? (
            <p className="mt-4 flex items-start gap-2 border-border/60 border-t pt-3 text-muted-foreground text-xs leading-relaxed">
              <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{quote.packageNote}</span>
            </p>
          ) : null}
        </div>
        <QuoteBasisTable quote={quote} />
      </div>
      {quote.staleReason ? (
        <div className="mt-4 flex items-start gap-2 border-warning/25 border-t pt-3 text-muted-foreground text-xs leading-relaxed">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            <span className="font-medium text-foreground">Plan changed since submission.</span>{" "}
            {quote.staleReason} Compare the submission-time plan before deciding whether this quote still applies.
          </span>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <JQuoteStatusBadge quote={quote} />
        {quote.status === "stale" ? (
          <Button onClick={() => onOpenPanel("snapshot", quote)} size="xs" variant="outline">
            View plan snapshot
          </Button>
        ) : null}
        <Button onClick={() => onOpenPanel(dossierPanelKind(quote), quote)} size="xs">
          {quote.status === "public" ? "Start private quote" : actionLabel(quote.status)}
          <ArrowUpRight />
        </Button>
      </div>
    </div>
  );
}

function ContextDatum({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 flex-1 basis-[200px] bg-background/80 px-3 py-3">
      <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] uppercase tracking-[0.1em]">
        <span className="text-primary [&_svg]:size-3.5">{icon}</span>
        <span>{label}</span>
      </div>
      <p className="mt-1 truncate font-medium text-xs">{value}</p>
    </div>
  );
}

function QuoteBasisTable({ quote }: { quote: QuoteRow }) {
  const pricing = pricingForQuote(quote);
  const lanes = [
    { inputs: pricing.labour, label: "Labour", icon: <Wrench /> },
    { inputs: pricing.materials, label: "Materials", icon: <PackageOpen /> },
  ];
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-xs uppercase tracking-[0.12em]">
          {quote.status === "public" ? "Bid inputs requested" : "Quote basis"}
        </p>
        <span className="text-muted-foreground text-xs">Rate · quantity · total</span>
      </div>
      <div className="mt-2 overflow-x-auto border-y">
        <table className="w-full min-w-[460px] text-xs">
          <thead className="bg-background/70 text-muted-foreground">
            <tr className="border-b text-left">
              <th className="px-3 py-2 font-medium">Lane</th>
              <th className="px-3 py-2 font-medium">Input</th>
              <th className="px-3 py-2 font-medium">Quantity</th>
              <th className="px-3 py-2 text-right font-medium">Quote</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lanes.flatMap((lane) =>
              lane.inputs.map((input) => (
                <tr key={lane.label + "-" + input.label}>
                  <th className="px-3 py-2.5 text-left font-medium">
                    <span className="flex items-center gap-1.5">
                      <span className="text-primary [&_svg]:size-3.5">{lane.icon}</span>
                      {lane.label}
                    </span>
                  </th>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    <span className="block text-foreground/85">{input.label}</span>
                    <span className="mt-0.5 block">{input.basis}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{input.quantity}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium">{input.total}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 pt-2 text-xs">
        <span className="text-muted-foreground">Current quote total</span>
        <span className="font-semibold">{quote.amount ?? "Not submitted"}</span>
      </div>
    </div>
  );
}

function QuoteBasisPreview({
  inputs,
  label,
}: {
  inputs: QuoteInput[];
  label: string;
}) {
  const input = inputs[0];
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-[11px] uppercase tracking-[0.1em]">{label}</p>
      {input ? (
        <>
          <p className="mt-1 truncate font-medium text-xs">{input.basis}</p>
          <p className="mt-0.5 truncate text-muted-foreground text-xs">
            {input.quantity} · {input.total}
          </p>
        </>
      ) : (
        <p className="mt-1 text-muted-foreground text-xs">Not included</p>
      )}
    </div>
  );
}

function JQuoteStatusBadge({ quote }: { quote: QuoteRow }) {
  if (quote.status === "offer") {
    return (
      <Badge size="sm" variant="info">
        <Clock3 />
        Offer pending
      </Badge>
    );
  }
  if (quote.status === "closed") {
    return (
      <Badge size="sm" variant="success">
        <Check />
        Passed
      </Badge>
    );
  }
  return <StatusBadge status={quote.status} />;
}

function dossierPanelKind(quote: QuoteRow): NonNullable<PanelState>["kind"] {
  return quote.status === "offer" ? "offer" : "workspace";
}

function pricingForQuote(quote: QuoteRow): QuotePricing {
  if (quote.pricing) {
    return quote.pricing;
  }
  const fallback: Record<string, QuotePricing> = {
    "windows-doors": {
      labour: [{ basis: "$95 / hr", label: "Install crew", quantity: "48 hr", total: "$4,560" }],
      materials: [{ basis: "$42 / sqft", label: "Aluminum-clad windows", quantity: "312 sqft", total: "$13,104" }],
    },
    "mechanical-rough-in": {
      labour: [{ basis: "$105 / hr", label: "Mechanical rough-in crew", quantity: "112 hr", total: "$11,760" }],
      materials: [{ basis: "Allowance", label: "Rough-in accessories", quantity: "1 package", total: "$6,880" }],
    },
    "hvac-equipment": {
      labour: [{ basis: "$125 / hr", label: "Startup and commissioning", quantity: "24 hr", total: "Included" }],
      materials: [{ basis: "$8,300 / unit", label: "Cold-climate heat pump package", quantity: "3 units", total: "$24,900" }],
    },
    "riverside-drywall": {
      labour: [{ basis: "$78 / hr", label: "Board and finish crew", quantity: "64 hr", total: "Draft" }],
      materials: [{ basis: "$5.20 / sqft", label: "Board, compound, and bead", quantity: "1,120 sqft", total: "Draft" }],
    },
  };
  return (
    fallback[quote.id] ?? {
      labour: [{ basis: "$ / hr", label: "Labour input", quantity: "Planned quantity", total: "Bid requested" }],
      materials: [{ basis: "$ / unit", label: "Materials input", quantity: "Planned quantity", total: "Bid requested" }],
    }
  );
}

function buildDateRange(build: BuildGroup) {
  return (
    build.plannedDateRange ??
    ({
      "alder-house": "Aug 24 – Sep 14, 2026",
      "riverside-suite": "Sep 14 – Oct 02, 2026",
      "briarwood-suite": "Sep 07 – Sep 25, 2026",
      "maple-kitchen": "Sep 21 – Oct 16, 2026",
    }[build.id] ?? "Schedule to be confirmed")
  );
}

function buildPermit(build: BuildGroup) {
  return build.permit ?? (build.id === "alder-house" ? "Permit issued · P-26-1184" : undefined);
}

function isQuoteCompletion(quote: QuoteRow) {
  return quote.status === "submitted" || quote.status === "closed";
}

function ScopeMatrixRow({
  expanded,
  onExpand,
  onOpenPanel,
  onSelect,
  quote,
  selected,
}: {
  expanded: boolean;
  onExpand: () => void;
  onOpenPanel: (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => void;
  onSelect: () => void;
  quote: QuoteRow;
  selected: boolean;
}) {
  const laneLabel =
    quote.status === "public"
      ? "Open for bid"
      : quote.status === "offer"
        ? "Accepted · offer"
        : quote.status === "stale"
          ? "Plan changed"
          : quote.status === "closed"
            ? "Closed"
            : quote.status === "submitted"
              ? "Submitted"
              : "Draft response";

  return (
    <>
      <div
        className={cn(
          "grid grid-cols-[minmax(260px,1.2fr)_minmax(160px,0.72fr)_minmax(160px,0.72fr)_minmax(190px,0.8fr)] transition-colors motion-reduce:transition-none",
          selected && "bg-primary/[0.035]"
        )}
      >
        <button
          aria-current={selected ? "true" : undefined}
          className="flex min-w-0 items-center gap-3 px-4 py-3 text-left outline-none hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={onSelect}
          type="button"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/8 text-primary">
            <FileText className="size-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-sm">{quote.name}</span>
            <span className="mt-0.5 block truncate text-muted-foreground text-xs">{quote.scopePreview}</span>
          </span>
        </button>
        <div className="border-l px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Wrench className="size-3.5 text-primary" />
            <span className="truncate">{laneLabel}</span>
          </div>
          <p className="mt-1 truncate text-muted-foreground text-xs">{quote.amount ?? "No amount yet"}</p>
        </div>
        <div className="border-l px-4 py-3">
          <p className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">{quote.materialsPreview}</p>
          <p className="mt-1 text-muted-foreground text-xs">Materials context</p>
        </div>
        <div className="flex items-start justify-between gap-2 border-l px-4 py-3">
          <div className="min-w-0">
            <p className={cn("truncate font-medium text-sm", quote.status === "stale" && "text-warning")}>
              {quote.status === "offer" ? (quote.offerExpires ?? "Aug 18, 2026") : quote.deadline}
            </p>
            <div className="mt-1">
              <StatusBadge status={quote.status} />
            </div>
          </div>
          <button
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${quote.name}`}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onExpand}
            type="button"
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="grid grid-cols-[minmax(260px,1.2fr)_minmax(160px,0.72fr)_minmax(160px,0.72fr)_minmax(190px,0.8fr)] bg-muted/25">
          <div className="col-span-3 border-t px-4 py-3 pl-14 text-xs">
            <p className="font-medium">Expanded scope and materials</p>
            <p className="mt-1 text-muted-foreground leading-relaxed">{quote.scopePreview}</p>
            <p className="mt-2 text-muted-foreground"><span className="font-medium text-foreground/80">Materials:</span> {quote.materialsPreview}</p>
          </div>
          <div className="flex items-end justify-end gap-2 border-t px-4 py-3">
            {quote.status === "stale" ? (
              <Button onClick={() => onOpenPanel("snapshot", quote)} size="xs" variant="outline">Plan snapshot</Button>
            ) : null}
            <Button onClick={() => onOpenPanel(quote.status === "offer" ? "offer" : "workspace", quote)} size="xs">
              {quote.status === "public" ? "Start bid" : actionLabel(quote.status)}
              <ArrowUpRight />
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
