import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileText,
  Inbox,
  Layers3,
  MapPin,
  PackageOpen,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "#/components/app-shell.tsx";
import {
  contractorNavGroups,
  footerNavLinks,
} from "#/features/contractor/contractorNav.tsx";
import type { SidebarNavGroup, SidebarNavItem } from "#/components/app-shared.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { cn } from "#/lib/utils.ts";
import {
  InfoStat,
  MetricCard,
  PackageDossier,
  PrototypePanel,
  PrototypeSwitcher,
  RailItem,
  ScopeMatrix,
  StatusBadge,
  actionLabel,
  statusLabel,
} from "./contractor-quotes-workspace-recovery-variants.tsx";
import type {
  BuildGroup,
  ContractorQuotesPrototypeMode,
  PanelState,
  QuoteRequest,
  QuoteRow,
} from "./contractor-quotes-prototype-types.ts";
import {
  DeadlineBoard,
  OpportunityQueue,
  PrototypeHeader,
} from "./contractor-quotes-workspace-recovery-surfaces.tsx";

export type ContractorQuotesPrototypeVariant =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F";
export type { ContractorQuotesPrototypeMode } from "./contractor-quotes-prototype-types.ts";
export function isContractorQuotesPrototypeVariant(
  value: unknown,
): value is ContractorQuotesPrototypeVariant {
  return (
    value === "A" ||
    value === "B" ||
    value === "C" ||
    value === "D" ||
    value === "E" ||
    value === "F"
  );
}
export function isContractorQuotesPrototypeMode(
  value: unknown,
): value is ContractorQuotesPrototypeMode {
  return value === "my" || value === "public";
}

export type { BuildGroup, PanelState, QuoteRow } from "./contractor-quotes-prototype-types.ts";

const myBuilds: BuildGroup[] = [
  {
    id: "alder-house",
    name: "Alder House Addition",
    city: "Toronto, ON",
    address: "18 Kingfisher Lane",
    quoteRequests: [
      {
        id: "alder-envelope",
        title: "Exterior envelope + HVAC",
        deadline: "Aug 22, 2026",
        rows: [
          {
            id: "windows-doors",
            name: "Windows & exterior doors",
            scopePreview:
              "Supply and install exterior windows and doors per A4.01–A4.04, including flashing and weatherproofing.",
            materialsPreview:
              "Aluminum-clad windows, exterior doors, hardware, flashing, sealants",
            status: "stale",
            deadline: "Aug 18, 2026",
            deadlineLabel: "4 days left",
            staleReason: "Window opening plan changed after submission",
          },
          {
            id: "mechanical-rough-in",
            name: "Mechanical rough-in",
            scopePreview:
              "Furnish and install plumbing, HVAC, and fire suppression rough-in through commissioning.",
            materialsPreview:
              "Ductwork, piping, hangers, controls, sleeves and rough-in accessories",
            status: "submitted",
            deadline: "Aug 20, 2026",
            deadlineLabel: "6 days left",
            amount: "$18,640",
          },
          {
            id: "hvac-equipment",
            name: "HVAC equipment package",
            scopePreview:
              "Furnish and deliver the heat pump, air handlers, controls, and startup documentation.",
            materialsPreview:
              "Cold-climate heat pump, air handlers, thermostats, line sets",
            status: "offer",
            deadline: "Aug 22, 2026",
            deadlineLabel: "Offer pending",
            offerExpires: "Offer expires Aug 18, 2026",
            amount: "$24,900",
          },
        ],
      },
    ],
  },
  {
    id: "riverside-suite",
    name: "Riverside Garden Suite",
    city: "Mississauga, ON",
    address: "42 Cedarbank Road",
    quoteRequests: [
      {
        id: "riverside-interiors",
        title: "Interior finishes package",
        deadline: "Sep 04, 2026",
        rows: [
          {
            id: "riverside-drywall",
            name: "Drywall & interior finishes",
            scopePreview:
              "Board, tape, finish, and prepare all new suite walls and ceilings for paint.",
            materialsPreview: "5/8 in. board, corner bead, compound, sanding materials",
            status: "draft",
            deadline: "Sep 04, 2026",
            deadlineLabel: "21 days left",
          },
        ],
      },
    ],
  },
];

const publicBuilds: BuildGroup[] = [
  {
    id: "briarwood-suite",
    name: "Briarwood Garden Suite",
    city: "Toronto, ON",
    address: "91 Briarwood Avenue",
    permit: "Permit issued · P-26-1047",
    quoteRequests: [
      {
        id: "briarwood-public",
        title: "Public bid · Insulation + drywall",
        deadline: "Aug 28, 2026",
        rows: [
          {
            id: "briarwood-envelope",
            name: "Garden suite insulation + drywall",
            scopePreview:
              "Complete exterior wall insulation, air sealing, board, tape, and ready-for-paint finish.",
            materialsPreview:
              "Mineral wool, smart membrane, 5/8 in. board, corner bead, compound",
            status: "public",
            deadline: "Aug 28, 2026",
            deadlineLabel: "12 days left",
            location: "91 Briarwood Avenue · Toronto, ON",
            packageNote: "Permit, drawings, schedule, and attachments disclosed",
          },
        ],
      },
    ],
  },
  {
    id: "maple-kitchen",
    name: "Maple Street Kitchen",
    city: "Oakville, ON",
    address: "7 Maple Street",
    permit: "Permit issued · P-26-0952",
    quoteRequests: [
      {
        id: "maple-millwork",
        title: "Public bid · Kitchen millwork",
        deadline: "Sep 02, 2026",
        rows: [
          {
            id: "maple-cabinetry",
            name: "Kitchen cabinetry + millwork",
            scopePreview:
              "Fabricate, deliver, and install the cabinetry, island, panels, and hardware package.",
            materialsPreview:
              "Painted MDF fronts, oak veneer panels, stone-ready carcasses, hardware",
            status: "public",
            deadline: "Sep 02, 2026",
            deadlineLabel: "17 days left",
            location: "7 Maple Street · Oakville, ON",
            packageNote: "Permit, elevations, specifications, and attachments disclosed",
          },
        ],
      },
    ],
  },
];

const prototypeNavGroups: SidebarNavGroup[] = contractorNavGroups.map((group) => {
  const quotesItem: SidebarNavItem = {
    title: "Quotes",
    to: "/prototype/contractor-quotes" as never,
    icon: <FileText className="size-4" />,
    matchPrefix: true,
  };

  return {
    ...group,
    items: group.items.flatMap((item) =>
      item.title === "Work" ? [quotesItem, item] : [item],
    ),
  };
});

export interface ContractorQuotesWorkspacePrototypeProps {
  mode: ContractorQuotesPrototypeMode;
  onModeChange: (mode: ContractorQuotesPrototypeMode) => void;
  onVariantChange: (variant: ContractorQuotesPrototypeVariant) => void;
  variant: ContractorQuotesPrototypeVariant;
}

export function ContractorQuotesWorkspacePrototype({
  mode,
  onModeChange,
  onVariantChange,
  variant,
}: ContractorQuotesWorkspacePrototypeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(["windows-doors"]),
  );
  const [notice, setNotice] = useState(
    "Prototype state: select a quote to inspect its next action.",
  );
  const [panel, setPanel] = useState<PanelState>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(
    mode === "public" ? "briarwood-envelope" : "windows-doors",
  );

  const builds = mode === "public" ? publicBuilds : myBuilds;
  const rows = useMemo(
    () => builds.flatMap((build) => build.quoteRequests.flatMap((request) => request.rows)),
    [builds],
  );
  const filteredBuilds = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return builds;
    }
    return builds
      .map((build) => ({
        ...build,
        quoteRequests: build.quoteRequests
          .map((request) => ({
            ...request,
            rows: request.rows.filter((row) =>
              [
                build.name,
                build.address,
                request.title,
                row.name,
                row.scopePreview,
                row.materialsPreview,
              ]
                .join(" ")
                .toLowerCase()
                .includes(query),
            ),
          }))
          .filter((request) => request.rows.length > 0),
      }))
      .filter((build) => build.quoteRequests.length > 0);
  }, [builds, search]);

  useEffect(() => {
    if (rows.some((row) => row.id === selectedId)) {
      return;
    }
    setSelectedId(rows[0]?.id ?? "");
  }, [rows, selectedId]);

  const selectedQuote = rows.find((row) => row.id === selectedId) ?? rows[0];
  const selectedBuild = builds.find((build) =>
    build.quoteRequests.some((request) => request.rows.some((row) => row.id === selectedQuote?.id)),
  );
  const selectedRequest = selectedBuild?.quoteRequests.find((request) =>
    request.rows.some((row) => row.id === selectedQuote?.id),
  );

  const selectQuote = (quote: QuoteRow) => {
    setSelectedId(quote.id);
    setNotice(`${quote.name} selected. ${actionLabel(quote.status)} is ready.`);
  };

  const toggleExpanded = (quote: QuoteRow) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(quote.id)) {
        next.delete(quote.id);
      } else {
        next.add(quote.id);
      }
      return next;
    });
    setNotice(
      `${quote.name} scope ${expandedIds.has(quote.id) ? "collapsed" : "expanded"}.`,
    );
  };

  const openPanel = (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => {
    setSelectedId(quote.id);
    setPanel({ kind, quoteId: quote.id });
    setNotice(
      kind === "workspace"
        ? `Opening the canonical QuoteFieldLedger for ${quote.name}.`
        : kind === "snapshot"
          ? `Showing the submission-time plan snapshot for ${quote.name}.`
          : `Reviewing the work offer for ${quote.name}.`,
    );
  };

  return (
    <AppShell
      contentClassName="bg-muted/30"
      sidebar={{
        brand: {
          label: "DrawFlow Contractor",
          to: "/prototype/contractor-quotes" as never,
        },
        footerLinks: footerNavLinks,
        groups: prototypeNavGroups,
      }}
    >
      <main className="min-h-full bg-muted/30 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
          <PrototypeHeader
            mode={mode}
            onModeChange={(nextMode) => {
              onModeChange(nextMode);
              setPanel(null);
              setNotice(
                nextMode === "public"
                  ? "Public Bidding selected. These opportunities are globally discoverable; responses stay private."
                  : "My Quotes selected. Your private requests and offer history are grouped by Build.",
              );
            }}
            search={search}
            setSearch={setSearch}
          />

          <div
            aria-live="polite"
            className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/65 px-3 py-2 text-muted-foreground text-xs shadow-xs/5 backdrop-blur-xl"
          >
            <Sparkles className="size-3.5 text-primary" />
            <span>{notice}</span>
            <span className="ml-auto hidden font-medium text-foreground/45 uppercase tracking-[0.16em] sm:inline">
              Prototype only
            </span>
          </div>

          {variant === "A" ? (
            <SplitWorkbench
              builds={filteredBuilds}
              expandedIds={expandedIds}
              mode={mode}
              onExpand={toggleExpanded}
              onOpenPanel={openPanel}
              onSelect={selectQuote}
              selectedId={selectedId}
              selectedBuild={selectedBuild}
              selectedQuote={selectedQuote}
              selectedRequest={selectedRequest}
            />
          ) : null}
          {variant === "B" ? (
            <BuildLedger
              builds={filteredBuilds}
              expandedIds={expandedIds}
              mode={mode}
              onExpand={toggleExpanded}
              onOpenPanel={openPanel}
              onSelect={selectQuote}
              selectedId={selectedId}
            />
          ) : null}
          {variant === "C" ? (
            <OpportunityQueue
              builds={filteredBuilds}
              mode={mode}
              onOpenPanel={openPanel}
              onSelect={selectQuote}
            />
          ) : null}
          {variant === "D" ? (
            <DeadlineBoard
              builds={filteredBuilds}
              expandedIds={expandedIds}
              mode={mode}
              onExpand={toggleExpanded}
              onOpenPanel={openPanel}
              onSelect={selectQuote}
            />
          ) : null}
          {variant === "E" ? (
            <PackageDossier
              builds={filteredBuilds}
              mode={mode}
              onOpenPanel={openPanel}
              onSelect={selectQuote}
              selectedBuild={selectedBuild}
              selectedQuote={selectedQuote}
              selectedRequest={selectedRequest}
            />
          ) : null}
          {variant === "F" ? (
            <ScopeMatrix
              builds={filteredBuilds}
              expandedIds={expandedIds}
              mode={mode}
              onExpand={toggleExpanded}
              onOpenPanel={openPanel}
              onSelect={selectQuote}
              selectedId={selectedId}
            />
          ) : null}
        </div>
      </main>

      {panel ? (
        <PrototypePanel
          build={selectedBuild}
          onClose={() => setPanel(null)}
          panel={panel}
          quote={rows.find((row) => row.id === panel.quoteId) ?? selectedQuote}
          request={selectedRequest}
        />
      ) : null}

      <PrototypeSwitcher onVariantChange={onVariantChange} variant={variant} />
    </AppShell>
  );
}

function SplitWorkbench({
  builds,
  expandedIds,
  mode,
  onExpand,
  onOpenPanel,
  onSelect,
  selectedId,
  selectedBuild,
  selectedQuote,
  selectedRequest,
}: {
  builds: BuildGroup[];
  expandedIds: Set<string>;
  mode: ContractorQuotesPrototypeMode;
  onExpand: (quote: QuoteRow) => void;
  onOpenPanel: (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => void;
  onSelect: (quote: QuoteRow) => void;
  selectedId: string;
  selectedBuild?: BuildGroup;
  selectedQuote?: QuoteRow;
  selectedRequest?: QuoteRequest;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(210px,0.55fr)_minmax(390px,1.2fr)_minmax(300px,0.8fr)]">
      <Frame className="h-fit xl:sticky xl:top-6">
        <FramePanel className="p-0">
          <FrameHeader>
            <FrameTitle>Quote navigator</FrameTitle>
            <FrameDescription>
              {mode === "my" ? "Your private requests" : "Open global opportunities"}
            </FrameDescription>
          </FrameHeader>
          <Separator />
          <div className="space-y-1 p-3">
            <RailItem active icon={<Inbox />} label="All quotes" value={mode === "my" ? "4" : "2"} />
            <RailItem icon={<CircleAlert />} label={mode === "my" ? "Needs response" : "Closing soon"} value={mode === "my" ? "2" : "1"} tone="warning" />
            <RailItem icon={<Clock3 />} label="Deadlines" value={mode === "my" ? "3" : "2"} />
            <RailItem icon={<CircleCheck />} label="History" value={mode === "my" ? "6" : "—"} />
          </div>
          <Separator />
          <FrameFooter className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
            <span>Sort by</span>
            <button className="font-medium text-foreground" type="button">
              Deadline <ChevronDown className="ml-1 inline size-3.5" />
            </button>
          </FrameFooter>
        </FramePanel>
      </Frame>

      <Frame className="min-w-0">
        <FramePanel className="p-0">
          <FrameHeader className="flex-row items-center justify-between gap-4">
            <div>
              <FrameTitle>{mode === "my" ? "Your quote requests" : "Open public bids"}</FrameTitle>
              <FrameDescription>
                {mode === "my" ? "Grouped by Build and response request" : "Publisher-approved package context"}
              </FrameDescription>
            </div>
            <Button aria-label="More quote filters" size="icon-sm" variant="ghost">
              <SlidersHorizontal />
            </Button>
          </FrameHeader>
          <div className="space-y-3 px-3 pb-3 sm:px-4 sm:pb-4">
            {builds.map((build) => (
              <WorkbenchBuild
                build={build}
                expandedIds={expandedIds}
                key={build.id}
                onExpand={onExpand}
                onOpenPanel={onOpenPanel}
                onSelect={onSelect}
                selectedId={selectedId}
              />
            ))}
          </div>
        </FramePanel>
      </Frame>

      <WorkbenchInspector
        build={selectedBuild}
        mode={mode}
        onOpenPanel={onOpenPanel}
        quote={selectedQuote}
        request={selectedRequest}
      />
    </div>
  );
}

function WorkbenchBuild({
  build,
  expandedIds,
  onExpand,
  onOpenPanel,
  onSelect,
  selectedId,
}: {
  build: BuildGroup;
  expandedIds: Set<string>;
  onExpand: (quote: QuoteRow) => void;
  onOpenPanel: (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => void;
  onSelect: (quote: QuoteRow) => void;
  selectedId: string;
}) {
  return (
    <Frame className="bg-muted/60 p-1">
      <FramePanel className="p-0">
        <div className="flex items-start gap-3 px-4 py-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="size-4.5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">{build.name}</p>
            <p className="truncate text-muted-foreground text-xs">
              {build.address} · {build.city}
            </p>
          </div>
          <span className="ml-auto whitespace-nowrap text-muted-foreground text-xs">
            {build.quoteRequests.flatMap((request) => request.rows).length} scopes
          </span>
        </div>
        {build.quoteRequests.map((request) => (
          <div key={request.id}>
            <div className="flex items-center justify-between gap-3 border-y bg-background/60 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">{request.title}</p>
                <p className="text-muted-foreground text-xs">Quote request · deadline {request.deadline}</p>
              </div>
              <span className="hidden whitespace-nowrap text-muted-foreground text-xs sm:inline">
                {request.rows.length} Sub-milestone{request.rows.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="divide-y">
              {request.rows.map((quote) => (
                <QuoteListRow
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
      </FramePanel>
    </Frame>
  );
}

function QuoteListRow({
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
  return (
    <div className={cn("bg-background transition-colors motion-reduce:transition-none", selected && "bg-primary/[0.035]")}>
      <Card className={cn("rounded-none border-0 shadow-none before:hidden", selected && "bg-transparent")}>
        <div className="flex w-full items-center gap-3 px-4 py-3">
          <button
            aria-current={selected ? "true" : undefined}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onSelect}
            type="button"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/8 font-semibold text-primary text-xs">
              <FileText className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-sm">{quote.name}</span>
              <span className="mt-0.5 block truncate text-muted-foreground text-xs">
                {quote.scopePreview}
              </span>
            </span>
            <span className="hidden shrink-0 text-right sm:block">
              <StatusBadge status={quote.status} />
              <span className="mt-1 block text-muted-foreground text-xs">{quote.deadlineLabel}</span>
            </span>          </button>
        <button          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} scope for ${quote.name}`}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(event) => {
            event.stopPropagation();
            onExpand();
          }}
          type="button"
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        </div>
      </Card>      {expanded ? (
        <div className="border-t bg-muted/35 px-4 py-3 pl-14 text-xs">
          <p className="font-medium text-foreground">Scope & materials</p>
          <p className="mt-1 leading-relaxed text-muted-foreground">{quote.scopePreview}</p>
          <p className="mt-2 text-muted-foreground">
            <span className="font-medium text-foreground/80">Materials:</span> {quote.materialsPreview}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={quote.status} />
            {quote.status === "stale" ? (
              <Button onClick={() => onOpenPanel("snapshot", quote)} size="xs" variant="outline">
                View plan snapshot
              </Button>
            ) : null}
            <Button onClick={() => onOpenPanel(quote.status === "offer" ? "offer" : "workspace", quote)} size="xs">
              {actionLabel(quote.status)}
              <ArrowUpRight />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WorkbenchInspector({
  build,
  mode,
  onOpenPanel,
  quote,
  request,
}: {
  build?: BuildGroup;
  mode: ContractorQuotesPrototypeMode;
  onOpenPanel: (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => void;
  quote?: QuoteRow;
  request?: QuoteRequest;
}) {
  if (!quote) {
    return (
      <FramePanel className="grid min-h-[360px] place-items-center text-center">
        <div>
          <PackageOpen className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-3 font-medium text-sm">Select a quote to inspect it</p>
        </div>
      </FramePanel>
    );
  }

  return (
    <Frame className="h-fit xl:sticky xl:top-6">
      <FramePanel className="p-0">
        <FrameHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <FrameTitle>{quote.name}</FrameTitle>
              <FrameDescription>
                {build?.name} · {build?.address}
              </FrameDescription>
            </div>
            <StatusBadge status={quote.status} />
          </div>
        </FrameHeader>
        <Separator />
        <div className="space-y-5 p-5">
          <div>
            <p className="font-semibold text-xs uppercase tracking-[0.14em]">Scope</p>
            <p className="mt-2 text-muted-foreground text-sm leading-relaxed">{quote.scopePreview}</p>
            <p className="mt-2 text-muted-foreground text-xs">
              <span className="font-medium text-foreground/80">Materials:</span> {quote.materialsPreview}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <InfoStat icon={<CalendarDays />} label="Response deadline" value={quote.deadline} />
            <InfoStat icon={<Clock3 />} label={quote.status === "offer" ? "Offer deadline" : "Response status"} value={quote.status === "offer" ? quote.offerExpires ?? "Aug 18, 2026" : statusLabel(quote.status)} />
          </div>
          {quote.amount ? (
            <div className="rounded-xl bg-muted/55 p-3">
              <p className="text-muted-foreground text-xs">Current quoted amount</p>
              <p className="mt-1 font-semibold text-2xl tracking-[-0.03em]">{quote.amount}</p>
            </div>
          ) : null}
          {quote.status === "stale" ? (
            <div className="rounded-xl border border-warning/30 bg-warning/8 p-3">
              <div className="flex gap-2">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                <div>
                  <p className="font-medium text-sm">Plan changed since submission</p>
                  <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                    {quote.staleReason}. Review the historical plan before deciding whether this quote still applies.
                  </p>
                  <Button className="mt-3" onClick={() => onOpenPanel("snapshot", quote)} size="xs" variant="outline">
                    View plan snapshot
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          {quote.packageNote ? (
            <div className="flex items-start gap-2 rounded-xl border border-primary/15 bg-primary/5 p-3 text-muted-foreground text-xs">
              <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{quote.packageNote}</span>
            </div>
          ) : null}
          <Button
            className="w-full"
            onClick={() => onOpenPanel(quote.status === "offer" ? "offer" : "workspace", quote)}
          >
            {quote.status === "offer" ? "Review work offer" : mode === "public" ? "Start private quote" : actionLabel(quote.status)}
            <ArrowUpRight />
          </Button>
          <p className="text-center text-muted-foreground text-xs">
            {request?.title} · response surface remains the existing QuoteFieldLedger          </p>
        </div>
      </FramePanel>
    </Frame>
  );
}

function BuildLedger({
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
  const counts = builds.flatMap((build) => build.quoteRequests.flatMap((request) => request.rows));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={<Inbox />} label={mode === "my" ? "Private requests" : "Open opportunities"} value={`${counts.length}`} />
        <MetricCard icon={<CircleAlert />} label={mode === "my" ? "Need attention" : "Closing this week"} value={mode === "my" ? "2" : "1"} tone="warning" />
        <MetricCard icon={<CalendarDays />} label="Next deadline" value={mode === "my" ? "Aug 18" : "Aug 28"} />
      </div>
      <Frame>
        <FramePanel className="p-0">
          <FrameHeader className="border-b">
            <FrameTitle>{mode === "my" ? "My quote ledger" : "Public bid ledger"}</FrameTitle>
            <FrameDescription>
              Every row resolves to one atomic Sub-milestone scope. Expand a row to inspect the package before opening the response workspace.
            </FrameDescription>
          </FrameHeader>
          {builds.map((build) => (
            <div key={build.id}>
              <div className="flex flex-col gap-1 border-b bg-muted/40 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-semibold text-lg tracking-[-0.02em]">{build.name}</p>
                  <p className="flex items-center gap-1 text-muted-foreground text-xs">
                    <MapPin className="size-3.5" /> {build.address} · {build.city}
                  </p>
                </div>
                {build.permit ? <span className="text-muted-foreground text-xs">{build.permit}</span> : null}
              </div>
              {build.quoteRequests.map((request) => (
                <div key={request.id}>
                  <div className="flex flex-col gap-1 border-b px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-sm">{request.title}</p>
                      <p className="text-muted-foreground text-xs">Quote request · deadline {request.deadline}</p>
                    </div>
                    <Button size="xs" variant="ghost">
                      <SlidersHorizontal />
                      Request details
                    </Button>
                  </div>
                  <div className="divide-y">
                    {request.rows.map((quote, index) => (
                      <LedgerRow
                        expanded={expandedIds.has(quote.id)}
                        index={index + 1}
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
          <FrameFooter className="flex items-center gap-2 border-t text-muted-foreground text-xs">
            <Layers3 className="size-4" />
            {mode === "my" ? "Private invitation history stays linked to the Build." : "Package disclosure follows the publisher-approved public bid."}
          </FrameFooter>
        </FramePanel>
      </Frame>
    </div>
  );
}

function LedgerRow({
  expanded,
  index,
  onExpand,
  onOpenPanel,
  onSelect,
  quote,
  selected,
}: {
  expanded: boolean;
  index: number;
  onExpand: () => void;
  onOpenPanel: (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => void;
  onSelect: () => void;
  quote: QuoteRow;
  selected: boolean;
}) {
  return (
    <div className={cn(selected && "bg-primary/[0.035]")}>
      <div className="grid gap-3 px-5 py-4 md:grid-cols-[34px_minmax(190px,1.1fr)_minmax(180px,1.25fr)_minmax(130px,0.55fr)_minmax(120px,0.45fr)_auto] md:items-center">
        <span className="font-medium text-muted-foreground text-xs">{index}</span>
        <button className="min-w-0 text-left" onClick={onSelect} type="button">
          <span className="block truncate font-semibold text-sm">{quote.name}</span>
          <span className="mt-1 block truncate text-muted-foreground text-xs">Sub-milestone · {quote.status === "public" ? "global opportunity" : "private request"}</span>
        </button>
        <div className="min-w-0 text-xs">
          <p className="truncate text-muted-foreground">{quote.scopePreview}</p>
          <p className="mt-1 truncate text-muted-foreground/75">Materials · {quote.materialsPreview}</p>
        </div>
        <div>
          <StatusBadge status={quote.status} />
        </div>
        <div className="text-muted-foreground text-xs">
          <span className="block">{quote.deadline}</span>
          <span className="mt-1 block">{quote.amount ?? quote.deadlineLabel}</span>
        </div>
        <div className="flex items-center gap-1 justify-self-start md:justify-self-end">
          <Button onClick={() => onOpenPanel(quote.status === "offer" ? "offer" : "workspace", quote)} size="xs" variant={selected ? "default" : "outline"}>
            {quote.status === "public" ? "Bid" : actionLabel(quote.status)}
            <ArrowUpRight />
          </Button>
          <Button aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${quote.name}`} onClick={onExpand} size="icon-xs" variant="ghost">
            {expanded ? <ChevronDown /> : <ChevronRight />}
          </Button>
        </div>
      </div>
      {expanded ? (
        <div className="mx-5 mb-4 grid gap-3 rounded-xl border border-border/70 bg-muted/35 p-4 text-sm sm:grid-cols-[1fr_1fr_auto] sm:items-start">
          <div>
            <p className="font-medium">Scope</p>
            <p className="mt-1 text-muted-foreground text-xs leading-relaxed">{quote.scopePreview}</p>
          </div>
          <div>
            <p className="font-medium">Materials</p>
            <p className="mt-1 text-muted-foreground text-xs leading-relaxed">{quote.materialsPreview}</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {quote.status === "stale" ? <Button onClick={() => onOpenPanel("snapshot", quote)} size="xs" variant="outline">Plan snapshot</Button> : null}
            <Button onClick={() => onOpenPanel(quote.status === "offer" ? "offer" : "workspace", quote)} size="xs">Open workspace</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
