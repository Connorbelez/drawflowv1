import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileText,
  Filter,
  Inbox,
  Layers3,
  MapPin,
  PackageOpen,
  Search,
  SlidersHorizontal,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppShell } from "#/components/app-shell.tsx";
import {
  contractorNavGroups,
  footerNavLinks,
} from "#/features/contractor/contractorNav.tsx";
import type { SidebarNavGroup, SidebarNavItem } from "#/components/app-shared.tsx";
import {
  Badge,
  type BadgeProps,
} from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
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

export type ContractorQuotesPrototypeVariant =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F";
export type ContractorQuotesPrototypeMode = "my" | "public";
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

type QuoteStatus =
  | "draft"
  | "submitted"
  | "stale"
  | "offer"
  | "closed"
  | "public";

interface QuoteRow {
  id: string;  name: string;
  scopePreview: string;
  materialsPreview: string;
  status: QuoteStatus;
  deadline: string;
  deadlineLabel: string;
  amount?: string;
  location?: string;
  packageNote?: string;
  offerExpires?: string;
  staleReason?: string;
}

interface QuoteRequest {
  id: string;  title: string;
  deadline: string;
  rows: QuoteRow[];
}

interface BuildGroup {
  id: string;  name: string;
  city: string;
  address: string;
  permit?: string;
  quoteRequests: QuoteRequest[];
}


type PanelState =
  | { kind: "workspace" | "snapshot" | "offer"; quoteId: string }
  | null;

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

const variantMeta: Record<
  ContractorQuotesPrototypeVariant,
  { label: string; description: string }
> = {
  A: {
    label: "Split Workbench",
    description: "Hierarchy and selected quote context in one desktop surface.",
  },
  B: {
    label: "Build Ledger",
    description: "Build → request → Sub-milestone as the visual system.",
  },
  C: {
    label: "Opportunity Queue",
    description: "The next useful quote action leads the page.",
  },
  D: {
    label: "Deadline Board",
    description: "Time windows turn response work into a daily dispatch.",
  },
  E: {
    label: "Package Dossier",
    description: "One build package, one selected Sub-milestone, one handoff.",
  },
  F: {
    label: "Scope Matrix",
    description: "Labour and materials stay visible as separate response lanes.",
  },
};
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

function PrototypeHeader({
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
  onClick: () => void;}) {
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

function OpportunityQueue({
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
            <p className="mt-1 truncate font-medium text-sm">{quote.name}</p>            <p className="mt-1 truncate text-muted-foreground text-xs">{quote.scopePreview}</p>
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs uppercase tracking-[0.12em]">{quote.status === "offer" ? "Offer expires" : "Response deadline"}</p>
            <p className={cn("mt-1 font-medium text-sm", quote.status === "stale" && "text-warning")}>{quote.status === "offer" ? quote.offerExpires ?? "Aug 18, 2026" : quote.deadline}</p>            <div className="mt-1"><StatusBadge status={quote.status} /></div>
          </div>
        </button>
        <div className="flex items-center gap-2 sm:justify-self-end">
          <Button onClick={() => onOpenPanel(quote.status === "offer" ? "offer" : quote.status === "stale" ? "snapshot" : "workspace", quote)} size="sm" variant="outline">
            {quote.status === "offer" ? "Review offer" : quote.status === "public" ? "View opportunity" : actionLabel(quote.status)}
            <ArrowRight />
          </Button>
          <ChevronRight className="hidden size-4 text-muted-foreground sm:block" />
        </div>
      </div>    </Card>
  );
}

function DeadlineBoard({
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

function PackageDossier({
  builds,
  mode,
  onOpenPanel,
  onSelect,
  selectedBuild,
  selectedQuote,
  selectedRequest,
}: {
  builds: BuildGroup[];
  mode: ContractorQuotesPrototypeMode;
  onOpenPanel: (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => void;
  onSelect: (quote: QuoteRow) => void;
  selectedBuild?: BuildGroup;
  selectedQuote?: QuoteRow;
  selectedRequest?: QuoteRequest;
}) {
  const build = selectedBuild ?? builds[0];
  const rows = build?.quoteRequests.flatMap((request) => request.rows) ?? [];
  const request =
    selectedRequest ??
    build?.quoteRequests.find((candidate) =>
      candidate.rows.some((row) => row.id === selectedQuote?.id)
    ) ??
    build?.quoteRequests[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
      <PackageDossierBuildPanel
        build={build}
        onSelect={onSelect}
        request={request}
        rows={rows}
        selectedQuote={selectedQuote}
      />
      <PackageDossierQuotePanel
        mode={mode}
        onOpenPanel={onOpenPanel}
        quote={selectedQuote}
        request={selectedRequest}
      />
    </div>
  );
}

function PackageDossierBuildPanel({
  build,
  onSelect,
  request,
  rows,
  selectedQuote,
}: {
  build?: BuildGroup;
  onSelect: (quote: QuoteRow) => void;
  request?: QuoteRequest;
  rows: QuoteRow[];
  selectedQuote?: QuoteRow;
}) {
  return (
    <Frame className="h-fit xl:sticky xl:top-6">
      <FramePanel className="p-0">
        <FrameHeader>
          <FrameTitle>Build package</FrameTitle>
          <FrameDescription>
            Read the issued context once, then choose the exact scope.
          </FrameDescription>
        </FrameHeader>
        {build ? (
          <>
            <div className="border-y bg-muted/35 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Building2 className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-lg tracking-[-0.02em]">
                    {build.name}
                  </p>
                  <p className="mt-1 flex items-start gap-1.5 text-muted-foreground text-xs leading-relaxed">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      {build.address} · {build.city}
                    </span>
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                <div className="rounded-lg bg-background px-3 py-2">
                  <p className="text-muted-foreground">Permit</p>
                  <p className="mt-0.5 font-medium">
                    {build.permit ?? "Issued package"}
                  </p>
                </div>
                <div className="rounded-lg bg-background px-3 py-2">
                  <p className="text-muted-foreground">Scopes in package</p>
                  <p className="mt-0.5 font-medium">{rows.length} Sub-milestones</p>
                </div>
              </div>
            </div>
            <div className="px-3 py-3">
              <p className="px-2 pb-2 font-semibold text-xs uppercase tracking-[0.12em]">
                {request?.title ?? "Quote request"}
              </p>
              <div className="space-y-1">
                {rows.map((quote) => (
                  <PackageDossierScopeButton
                    isSelected={quote.id === selectedQuote?.id}
                    key={quote.id}
                    onClick={() => onSelect(quote)}
                    quote={quote}
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="p-5 text-muted-foreground text-sm">No package selected.</div>
        )}
      </FramePanel>
    </Frame>
  );
}

function PackageDossierScopeButton({
  isSelected,
  onClick,
  quote,
}: {
  isSelected: boolean;
  onClick: () => void;
  quote: QuoteRow;
}) {
  return (
    <button
      aria-current={isSelected ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        isSelected && "bg-primary/8"
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full text-xs",
          isSelected
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        <FileText className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-sm">{quote.name}</span>
        <span className="mt-0.5 block truncate text-muted-foreground text-xs">
          {quote.deadlineLabel}
        </span>
      </span>
      <StatusBadge status={quote.status} />
    </button>
  );
}

function PackageDossierQuotePanel({
  mode,
  onOpenPanel,
  quote,
  request,
}: {
  mode: ContractorQuotesPrototypeMode;
  onOpenPanel: (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => void;
  quote?: QuoteRow;
  request?: QuoteRequest;
}) {
  if (!quote) {
    return (
      <Frame>
        <FramePanel className="grid min-h-[460px] place-items-center p-7 text-center">
          <div>
            <PackageOpen className="mx-auto size-8 text-muted-foreground/50" />
            <p className="mt-3 font-medium text-sm">Choose a Sub-milestone</p>
            <p className="mt-1 text-muted-foreground text-xs">
              The package dossier will open here.
            </p>
          </div>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <Frame>
      <FramePanel className="p-0">
        <FrameHeader className="flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <FrameTitle>{quote.name}</FrameTitle>
            <FrameDescription>
              {request?.title ?? "Quote request"} · {quote.deadline}
            </FrameDescription>
          </div>
          <StatusBadge status={quote.status} />
        </FrameHeader>
        <div className="border-y bg-muted/35 px-5 py-5 sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-semibold text-3xl tracking-[-0.04em]">
                {quote.amount ?? "Quote in progress"}
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                {mode === "public"
                  ? "Your response will be private to the publisher."
                  : "Your current response for this exact scope."}
              </p>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <CalendarDays className="size-4 text-primary" />
              {dossierDeadlineLabel(quote)}
            </div>
          </div>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
          <Card className="p-4">
            <p className="font-semibold text-sm">Scope</p>
            <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
              {quote.scopePreview}
            </p>
          </Card>
          <Card className="p-4">
            <p className="font-semibold text-sm">Materials</p>
            <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
              {quote.materialsPreview}
            </p>
          </Card>
        </div>
        {quote.status === "stale" ? (
          <DossierStaleNotice onOpenPanel={onOpenPanel} quote={quote} />
        ) : null}
        <FrameFooter className="flex flex-col gap-3 border-t sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-muted-foreground text-xs">
            <Layers3 className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              {mode === "public"
                ? "Shared package context only. Your draft and response stay private."
                : "The canonical response surface remains QuoteFieldLedger."}
            </span>
          </div>
          <Button onClick={() => onOpenPanel(dossierPanelKind(quote), quote)}>
            {dossierActionLabel(mode, quote)}
            <ArrowUpRight />
          </Button>
        </FrameFooter>
      </FramePanel>
    </Frame>
  );
}

function DossierStaleNotice({
  onOpenPanel,
  quote,
}: {
  onOpenPanel: (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => void;
  quote: QuoteRow;
}) {
  return (
    <div className="mx-5 mb-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/8 p-4 text-sm sm:mx-7">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
      <div>
        <p className="font-medium">Plan changed after submission</p>
        <p className="mt-1 text-muted-foreground leading-relaxed">
          {quote.staleReason}. The quote remains visible while you compare the
          historical plan.
        </p>
        <Button
          className="mt-3"
          onClick={() => onOpenPanel("snapshot", quote)}
          size="xs"
          variant="outline"
        >
          View plan snapshot
        </Button>
      </div>
    </div>  );
}

function dossierDeadlineLabel(quote: QuoteRow) {
  return quote.status === "offer"
    ? `Offer expires ${quote.offerExpires ?? "Aug 18, 2026"}`
    : `Response due ${quote.deadline}`;
}

function dossierPanelKind(quote: QuoteRow): NonNullable<PanelState>["kind"] {
  return quote.status === "offer" ? "offer" : "workspace";
}

function dossierActionLabel(
  mode: ContractorQuotesPrototypeMode,
  quote: QuoteRow
) {
  return quote.status === "offer"
    ? "Review work offer"
    : mode === "public"
      ? "Start private quote"
      : actionLabel(quote.status);
}

function ScopeMatrix({
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
  const laneLabel = scopeLaneLabel(quote.status);
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
        <ScopeMatrixExpanded onOpenPanel={onOpenPanel} quote={quote} />
      ) : null}    </>
  );
}

function scopeLaneLabel(status: QuoteStatus) {
  switch (status) {
    case "public":
      return "Open for bid";
    case "offer":
      return "Accepted · offer";
    case "stale":
      return "Plan changed";
    case "closed":
      return "Closed";
    case "submitted":
      return "Submitted";
    default:
      return "Draft response";
  }
}

function ScopeMatrixExpanded({
  onOpenPanel,
  quote,
}: {
  onOpenPanel: (kind: NonNullable<PanelState>["kind"], quote: QuoteRow) => void;
  quote: QuoteRow;
}) {
  return (
    <div className="grid grid-cols-[minmax(260px,1.2fr)_minmax(160px,0.72fr)_minmax(160px,0.72fr)_minmax(190px,0.8fr)] bg-muted/25">
      <div className="col-span-3 border-t px-4 py-3 pl-14 text-xs">
        <p className="font-medium">Expanded scope and materials</p>
        <p className="mt-1 text-muted-foreground leading-relaxed">
          {quote.scopePreview}
        </p>
        <p className="mt-2 text-muted-foreground">
          <span className="font-medium text-foreground/80">Materials:</span>{" "}
          {quote.materialsPreview}
        </p>
      </div>
      <div className="flex items-end justify-end gap-2 border-t px-4 py-3">
        {quote.status === "stale" ? (
          <Button
            onClick={() => onOpenPanel("snapshot", quote)}
            size="xs"
            variant="outline"
          >
            Plan snapshot
          </Button>
        ) : null}
        <Button
          onClick={() => onOpenPanel(dossierPanelKind(quote), quote)}
          size="xs"
        >
          {quote.status === "public" ? "Start bid" : actionLabel(quote.status)}
          <ArrowUpRight />
        </Button>
      </div>
    </div>
  );
}

function PrototypePanel({
  build,
  onClose,
  panel,
  quote,
  request,
}: {
  build?: BuildGroup;
  onClose: () => void;
  panel: NonNullable<PanelState>;
  quote?: QuoteRow;
  request?: QuoteRequest;
}) {
  if (!quote) {
    return null;
  }
  const isSnapshot = panel.kind === "snapshot";
  const isOffer = panel.kind === "offer";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/18 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" role="presentation">
      <button aria-label="Close prototype panel" className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
      <div aria-label={isSnapshot ? "Plan snapshot" : isOffer ? "Work offer" : "Quote workspace"} className="relative z-10 max-h-[min(760px,calc(100svh-2rem))] w-full max-w-3xl overflow-auto rounded-t-3xl border bg-background shadow-2xl sm:rounded-3xl" role="dialog">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/82 px-5 py-4 backdrop-blur-xl sm:px-7">
          <div>
            <p className="font-semibold text-sm">{isSnapshot ? "Submission-time plan snapshot" : isOffer ? "Quote Work Offer" : "QuoteFieldLedger handoff"}</p>
            <p className="mt-0.5 text-muted-foreground text-xs">{quote.name} · {build?.name}</p>
          </div>
          <Button aria-label="Close" onClick={onClose} size="icon-sm" variant="ghost"><X /></Button>
        </div>
        <div className="space-y-6 p-5 sm:p-7">
          {isSnapshot ? <SnapshotContent quote={quote} /> : null}
          {isOffer ? <OfferContent onClose={onClose} quote={quote} /> : null}
          {!isSnapshot && !isOffer ? <WorkspaceContent build={build} quote={quote} request={request} /> : null}
        </div>
      </div>
    </div>
  );
}

function SnapshotContent({ quote }: { quote: QuoteRow }) {
  return (
    <>
      <div className="rounded-2xl border border-warning/30 bg-warning/8 p-4">
        <div className="flex gap-3">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="font-semibold">Stale does not mean unusable</p>
            <p className="mt-1 text-muted-foreground text-sm leading-relaxed">
              The Sub-milestone changed after this quote was submitted. Compare the states, then decide whether the quote still applies. Budget and roadmap state are not changed here.
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <PlanColumn label="When quote was submitted" tone="muted" values={[`${quote.name} scope`, "Start Aug 24, 2026", "Duration 7 days", "Opening plan A4.01", `Quoted ${quote.amount ?? "amount pending"}`]} />
        <PlanColumn label="Current Sub-milestone plan" tone="primary" values={["Windows & doors scope", "Start Aug 26, 2026", "Duration 8 days", "Opening plan A4.02"]} />
      </div>
      <Button className="w-full sm:w-auto" variant="outline">Open full plan context <ArrowUpRight /></Button>
    </>
  );
}

function OfferContent({ onClose, quote }: { onClose: () => void; quote: QuoteRow }) {
  return (
    <>
      <div>
        <p className="font-semibold text-2xl tracking-[-0.03em]">Your work offer</p>
        <p className="mt-1 text-muted-foreground text-sm">The publishing team accepted this quote for the exact Sub-milestone scope.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <InfoStat icon={<Wrench />} label="Scope" value="HVAC equipment" />
        <InfoStat icon={<CalendarDays />} label="Offer expires" value={quote.offerExpires ?? "Aug 18, 2026"} />
        <InfoStat icon={<CircleCheck />} label="Quoted amount" value={quote.amount ?? "$24,900"} />
      </div>
      <div className="rounded-2xl bg-muted/55 p-4 text-sm leading-relaxed">
        Accepting this offer activates your assignment for this exact Sub-milestone. You can still review the assignment acknowledgement and request clarification afterward.
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose} variant="outline">Keep reviewing</Button>
        <Button onClick={onClose}>Accept work offer <Check /></Button>
      </div>
    </>
  );
}

function WorkspaceContent({
  build,
  quote,
  request,
}: {
  build?: BuildGroup;
  quote: QuoteRow;
  request?: QuoteRequest;
}) {
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-2xl tracking-[-0.03em]">QuoteFieldLedger handoff</p>
          <p className="mt-1 text-muted-foreground text-sm">The response workspace remains one canonical surface.</p>
        </div>
        <Badge variant="info"><FileText /> Prototype route</Badge>
      </div>
      <div className="rounded-2xl border bg-muted/35 p-4">
        <p className="font-medium text-sm">{quote.name}</p>
        <p className="mt-1 text-muted-foreground text-xs">{build?.name} · {build?.address}</p>
        <Separator className="my-4" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="font-medium text-xs uppercase tracking-[0.12em]">Labour</p><p className="mt-1 text-muted-foreground text-sm">Enter or review line-item labour amounts.</p></div>
          <div><p className="font-medium text-xs uppercase tracking-[0.12em]">Materials</p><p className="mt-1 text-muted-foreground text-sm">Enter or review material lines and delivery context.</p></div>
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="font-medium text-sm">Open the real response surface</p><p className="mt-1 text-muted-foreground text-xs">{request?.title} · deadline {quote.deadline}</p></div>
        <Button>Open Field Ledger <ArrowUpRight /></Button>
      </div>
    </>
  );
}

function PlanColumn({ label, tone, values }: { label: string; tone: "muted" | "primary"; values: string[] }) {
  return (
    <div className={cn("rounded-2xl border p-4", tone === "primary" ? "border-primary/25 bg-primary/5" : "bg-muted/45")}>
      <p className="font-medium text-xs uppercase tracking-[0.12em]">{label}</p>
      <ul className="mt-3 space-y-2 text-muted-foreground text-sm">
        {values.map((value) => <li className="flex gap-2" key={value}><span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", tone === "primary" ? "bg-primary" : "bg-muted-foreground/50")} />{value}</li>)}
      </ul>
    </div>
  );
}

function RailItem({ active, icon, label, tone, value }: { active?: boolean; icon: ReactNode; label: string; tone?: "warning"; value: string }) {
  return (    <button className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted", active && "bg-primary/8 font-medium text-primary")} type="button">
      <span className={cn("text-muted-foreground", tone === "warning" && "text-warning")}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-muted-foreground text-xs">{value}</span>
    </button>
  );
}

function InfoStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (        <div className="min-w-0 rounded-xl bg-muted/45 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-[0.08em]">{icon}<span className="truncate">{label}</span></div>
      <p className="mt-1 truncate font-medium text-sm">{value}</p>

    </div>
  );
}

function MetricCard({ icon, label, tone, value }: { icon: ReactNode; label: string; tone?: "warning"; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs"><span className={cn("text-primary", tone === "warning" && "text-warning")}>{icon}</span>{label}</div>
      <p className="mt-3 font-semibold text-2xl tracking-[-0.03em]">{value}</p>
    </Card>
  );
}

function PulseItem({ color, label, value }: { color: string; label: string; value: string }) {
  return <div className="flex items-center gap-3"><span className={cn("size-2 rounded-full", color)} /><span className="flex-1 text-muted-foreground text-sm">{label}</span><span className="font-semibold text-sm">{value}</span></div>;
}

function StatusBadge({ status }: { status: QuoteStatus }) {
  const meta = statusMeta(status);
  return <Badge size="sm" variant={meta.variant}><span className={cn("size-1.5 rounded-full", meta.dot)} />{meta.label}</Badge>;
}

function statusMeta(status: QuoteStatus): { dot: string; label: string; variant: BadgeProps["variant"] } {
  switch (status) {
    case "draft": return { dot: "bg-warning", label: "Draft", variant: "warning" };
    case "submitted": return { dot: "bg-success", label: "Submitted", variant: "success" };
    case "stale": return { dot: "bg-warning", label: "Stale", variant: "warning" };
    case "offer": return { dot: "bg-primary", label: "Offer pending", variant: "info" };
    case "closed": return { dot: "bg-muted-foreground", label: "Closed", variant: "secondary" };
    case "public": return { dot: "bg-primary", label: "Open bid", variant: "info" };
  }
}

function statusLabel(status: QuoteStatus) {
  return statusMeta(status).label;
}

function actionLabel(status: QuoteStatus) {
  switch (status) {
    case "draft": return "Continue draft";
    case "stale": return "Review quote";
    case "submitted": return "View submission";
    case "offer": return "Review offer";
    case "public": return "Start bid";
    case "closed": return "View history";
  }
}

function PrototypeSwitcher({
  onVariantChange,
  variant,
}: {
  onVariantChange: (variant: ContractorQuotesPrototypeVariant) => void;
  variant: ContractorQuotesPrototypeVariant;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      event.preventDefault();
      const variants: ContractorQuotesPrototypeVariant[] = [
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
      ];
      const currentIndex = variants.indexOf(variant);ntIndex = variants.indexOf(variant);
      const nextIndex = event.key === "ArrowRight"
        ? (currentIndex + 1) % variants.length
        : (currentIndex - 1 + variants.length) % variants.length;
      onVariantChange(variants[nextIndex]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onVariantChange, variant]);

  if (import.meta.env.PROD) {
    return null;
  }

  const variants: ContractorQuotesPrototypeVariant[] = ["A", "B", "C"];
  const currentIndex = variants.indexOf(variant);
  const move = (direction: -1 | 1) => {
    onVariantChange(variants[(currentIndex + direction + variants.length) % variants.length]);
  };

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4" data-prototype-only="true">
      <div className="flex items-center gap-1 rounded-full border border-foreground/15 bg-foreground px-2 py-1.5 text-background shadow-2xl">
        <button aria-label="Previous prototype variant" className="grid size-8 place-items-center rounded-full transition-colors hover:bg-background/15 focus-visible:ring-2 focus-visible:ring-background" onClick={() => move(-1)} type="button"><ArrowLeft className="size-4" /></button>
        <div className="min-w-[170px] px-3 text-center">
          <p className="font-semibold text-xs">{variant} — {variantMeta[variant].label}</p>
          <p className="hidden text-background/65 text-xs sm:block">{variantMeta[variant].description}</p>
        </div>
        <button aria-label="Next prototype variant" className="grid size-8 place-items-center rounded-full transition-colors hover:bg-background/15 focus-visible:ring-2 focus-visible:ring-background" onClick={() => move(1)} type="button"><ArrowRight className="size-4" /></button>
      </div>
    </div>
  );
}
