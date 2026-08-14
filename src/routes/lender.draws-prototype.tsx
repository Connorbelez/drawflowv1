import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  type Row,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUpRight,
  Banknote,
  Building2,
  Check,
  ChevronRight,
  CircleDot,
  FileCheck2,
  Files,
  History,
  MapPinCheck,
  RotateCcw,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { type ComponentType, Fragment, type ReactNode, useState } from "react";

import { LenderPrototypeShell } from "../components/prototypes/LenderPrototypeShell";
import {
  type ApprovalGroupProjection as ApprovalGroup,
  type DrawEvidenceFactProjection as DrawEvidenceFact,
  type DrawQueueState,
  type LenderDrawQueueProjection as DrawRequest,
  type FundingPositionProjection,
  lenderDrawQueue,
} from "../components/prototypes/lenderDrawQueueContract";
import { PrototypeVariantSwitcher } from "../components/prototypes/PrototypeVariantSwitcher";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Frame, FramePanel } from "../components/ui/frame";
import { Separator } from "../components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { cn } from "../lib/utils";

// PROTOTYPE ONLY: four read-only structures for the lender Draw queue,
// switchable on /lender/draws-prototype?variant=A|B|C|D.
const prototypeVariants = [
  { key: "A", label: "Decision ledger" },
  { key: "B", label: "Split triage desk" },
  { key: "C", label: "Workflow lanes" },
  { key: "D", label: "Build packets" },
] as const;

type PrototypeVariantKey = (typeof prototypeVariants)[number]["key"];
type QueueScope = "action" | "all";

interface PrototypeSearch {
  variant: PrototypeVariantKey;
}

const isPrototypeVariant = (value: unknown): value is PrototypeVariantKey =>
  prototypeVariants.some((variant) => variant.key === value);

export const Route = createFileRoute("/lender/draws-prototype")({
  validateSearch: (search: Record<string, unknown>): PrototypeSearch => ({
    variant: isPrototypeVariant(search.variant) ? search.variant : "D",
  }),
  component: LenderDrawQueuePrototype,
});

const drawRequests: readonly DrawRequest[] = lenderDrawQueue;

function LenderDrawQueuePrototype() {
  const { variant } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [scope, setScope] = useState<QueueScope>("action");
  const visibleRequests =
    scope === "action"
      ? drawRequests.filter((request) => request.state === "needs-action")
      : drawRequests;

  const selectVariant = (nextVariant: string) => {
    if (!isPrototypeVariant(nextVariant)) {
      return;
    }
    navigate({
      replace: true,
      search: { variant: nextVariant },
      to: "/lender/draws-prototype",
    });
  };

  return (
    <LenderPrototypeShell activeNavigation="Draws" pageTitle="Draw queue">
      <div className="min-h-[calc(100vh-3.5rem)] bg-muted/30 pb-28">
        <div className="border-amber-500/30 border-y bg-amber-50 px-4 py-2 text-center font-medium text-amber-950 text-xs tracking-wide dark:bg-amber-950/40 dark:text-amber-100">
          THROWAWAY PROTOTYPE · READ-ONLY REPRESENTATIVE DATA · NO DECISIONS ARE
          SAVED
        </div>
        <main className="mx-auto min-w-0 max-w-[1560px] p-4">
          <QueueHeader scope={scope} setScope={setScope} />
          {variant === "A" ? <VariantA requests={visibleRequests} /> : null}
          {variant === "B" ? <VariantB requests={visibleRequests} /> : null}
          {variant === "C" ? (
            <VariantC requests={visibleRequests} scope={scope} />
          ) : null}
          {variant === "D" ? <VariantD requests={visibleRequests} /> : null}
        </main>
      </div>
      <PrototypeVariantSwitcher
        current={variant}
        onChange={selectVariant}
        variants={prototypeVariants}
      />
    </LenderPrototypeShell>
  );
}

function QueueHeader({
  scope,
  setScope,
}: {
  scope: QueueScope;
  setScope: (scope: QueueScope) => void;
}) {
  return (
    <header className="mb-5 flex flex-col justify-between gap-4 border-b pb-5 lg:flex-row lg:items-end">
      <div>
        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
          Assigned Draw requests
        </p>
        <h1 className="mt-1 font-semibold text-2xl tracking-tight sm:text-3xl">
          Draw queue
        </h1>
        <p className="mt-1 max-w-3xl text-muted-foreground text-sm leading-6">
          Scan canonical request status, required approval groups, and linked
          reimbursement evidence before opening a Draw decision.
        </p>
      </div>
      <fieldset
        aria-label="Draw queue scope"
        className="flex w-fit rounded-lg border bg-background p-1"
      >
        <Button
          aria-pressed={scope === "action"}
          onClick={() => setScope("action")}
          size="sm"
          variant={scope === "action" ? "default" : "ghost"}
        >
          Needs my action <Badge variant="secondary">3</Badge>
        </Button>
        <Button
          aria-pressed={scope === "all"}
          onClick={() => setScope("all")}
          size="sm"
          variant={scope === "all" ? "default" : "ghost"}
        >
          All assigned <Badge variant="secondary">6</Badge>
        </Button>
      </fieldset>
    </header>
  );
}

const drawQueueColumnHelper = createColumnHelper<DrawRequest>();

const drawQueueColumns = [
  drawQueueColumnHelper.display({
    id: "request",
    header: "Request / Build",
    cell: ({ row }) => {
      const request = row.original;
      return (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{request.displayId}</p>
              <p className="mt-1 font-medium text-xs">{request.requestLabel}</p>
            </div>
            <StateBadge label={request.stateLabel} state={request.state} />
          </div>
          <p className="mt-2 text-muted-foreground text-xs">
            {request.build} · {request.location}
          </p>
          <p className="mt-1 font-mono text-muted-foreground text-xs">
            {request.workOrderKey}
          </p>
        </>
      );
    },
  }),
  drawQueueColumnHelper.display({
    id: "amount",
    header: "Amount / submitted",
    cell: ({ row }) => (
      <>
        <p className="font-semibold tabular-nums">{row.original.amount}</p>
        <p className="mt-2 text-muted-foreground text-xs leading-5">
          {row.original.submittedAt}
        </p>
      </>
    ),
  }),
  drawQueueColumnHelper.display({
    id: "approvals",
    header: "Required approvals",
    cell: ({ row }) => (
      <>
        <p className="mb-2 font-semibold text-xs">{row.original.policy}</p>
        <ApprovalGroups compact groups={row.original.approvals} />
      </>
    ),
  }),
  drawQueueColumnHelper.display({
    id: "evidence",
    header: "Decision context",
    cell: ({ row }) => <EvidenceList evidence={row.original.evidence} />,
  }),
  drawQueueColumnHelper.display({
    id: "funding",
    header: "Funding position",
    cell: ({ row }) => (
      <FundingPosition position={row.original.fundingPosition} />
    ),
  }),
  drawQueueColumnHelper.display({
    id: "actions",
    header: "Open",
    cell: () => (
      <Button size="sm" variant="outline">
        Open Draw <ArrowUpRight className="size-3.5" />
      </Button>
    ),
  }),
];

function VariantA({ requests }: { requests: readonly DrawRequest[] }) {
  const table = useReactTable({
    columns: drawQueueColumns,
    data: [...requests],
    getCoreRowModel: getCoreRowModel(),
  });
  const groupedRows = table
    .getRowModel()
    .rows.reduce<Array<{ build: string; rows: Row<DrawRequest>[] }>>(
      (groups, row) => {
        const existingGroup = groups.find(
          (group) => group.build === row.original.build
        );
        if (existingGroup) {
          existingGroup.rows.push(row);
        } else {
          groups.push({ build: row.original.build, rows: [row] });
        }
        return groups;
      },
      []
    );

  return (
    <Frame>
      <FramePanel className="p-0">
        <div className="flex flex-col justify-between gap-3 border-b px-5 py-4 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Variant A</Badge>
              <h2 className="font-semibold text-sm">Decision ledger</h2>
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              A dense sortable-style scan with policy and evidence in one row.
            </p>
          </div>
          <p className="text-muted-foreground text-xs">
            {requests.length} assigned request{requests.length === 1 ? "" : "s"}
          </p>
        </div>
        <Table aria-label="Assigned Draw requests grouped by Build">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    className={cn(
                      header.column.id === "request" &&
                        "sticky left-0 z-20 bg-background pl-5",
                      header.column.id === "actions" && "pr-5 text-right"
                    )}
                    key={header.id}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {groupedRows.map((group) => {
              const build = group.rows[0]?.original;
              return (
                <Fragment key={group.build}>
                  <TableRow className="bg-muted/55 hover:bg-muted/55">
                    <TableCell
                      className="border-y bg-muted/55 p-0"
                      colSpan={table.getVisibleLeafColumns().length}
                    >
                      <div className="sticky left-0 flex w-fit min-w-max flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-8">
                        <div>
                          <p className="flex items-center gap-2 font-semibold text-sm">
                            <Building2 className="size-4" /> {group.build}
                          </p>
                          <p className="mt-1 text-muted-foreground text-xs">
                            {build?.builder} · {build?.location}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {group.rows.length} request
                          {group.rows.length === 1 ? "" : "s"}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                  {group.rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          className={cn(
                            "align-top",
                            cell.column.id === "request" &&
                              "sticky left-0 z-10 min-w-60 bg-background py-4 pl-5",
                            cell.column.id === "amount" && "min-w-44",
                            cell.column.id === "approvals" && "min-w-60",
                            cell.column.id === "evidence" && "min-w-64",
                            cell.column.id === "sources" && "min-w-60",
                            cell.column.id === "actions" && "pr-5 text-right"
                          )}
                          key={cell.id}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </FramePanel>
    </Frame>
  );
}

function VariantB({ requests }: { requests: readonly DrawRequest[] }) {
  const [selectedId, setSelectedId] = useState(requests[0]?.displayId ?? "");
  const selected =
    requests.find((request) => request.displayId === selectedId) ?? requests[0];

  return (
    <Frame className="lg:grid lg:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.28fr)] lg:gap-1">
      <FramePanel className="p-0">
        <div className="border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Variant B</Badge>
            <h2 className="font-semibold text-sm">Split triage desk</h2>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            Select a request to inspect its complete read-only decision context.
          </p>
        </div>
        <div className="grid gap-2 p-2">
          {requests.map((request) => {
            const selectedRequest = request.displayId === selected?.displayId;
            return (
              <Card
                aria-pressed={selectedRequest}
                className={cn(
                  "w-full cursor-pointer p-0 text-left transition-colors hover:bg-muted/40",
                  selectedRequest && "border-primary bg-primary/5"
                )}
                key={request.displayId}
                onClick={() => setSelectedId(request.displayId)}
                render={<button type="button" />}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-muted-foreground text-xs">
                        {request.displayId} · {request.build}
                      </p>
                      <p className="mt-1 truncate font-semibold text-sm">
                        {request.requestLabel}
                      </p>
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <StateBadge
                      label={request.stateLabel}
                      state={request.state}
                    />
                    <p className="font-semibold text-sm tabular-nums">
                      {request.amount}
                    </p>
                  </div>
                  <p className="mt-3 text-muted-foreground text-xs leading-5">
                    {request.summary}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </FramePanel>

      <FramePanel className="p-0">
        {selected ? <DrawDossier request={selected} /> : <EmptyQueueState />}
      </FramePanel>
    </Frame>
  );
}

function DrawDossier({ request }: { request: DrawRequest }) {
  return (
    <div>
      <header className="flex flex-col justify-between gap-4 border-b px-5 py-5 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge label={request.stateLabel} state={request.state} />
            <Badge variant="outline">{request.cycle}</Badge>
          </div>
          <h2 className="mt-3 font-semibold text-xl tracking-tight">
            {request.displayId} · {request.requestLabel}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {request.build} · {request.builder} · {request.location}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="font-semibold text-2xl tabular-nums">
            {request.amount}
          </p>
          <p className="mt-1 font-mono text-muted-foreground text-xs">
            {request.workOrderKey}
          </p>
        </div>
      </header>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
        <div className="grid gap-5 border-b p-5 xl:border-r xl:border-b-0">
          <DossierSection
            description="Required groups are peers and may complete in either order."
            title="Approval policy"
          >
            <p className="mb-3 font-semibold text-sm">{request.policy}</p>
            <ApprovalGroups groups={request.approvals} />
          </DossierSection>

          <Separator />

          <DossierSection
            description="One pooled balance unlocked by previously approved work; no Milestone or Draw Group is assigned to this request."
            title="Funding position"
          >
            <FundingPosition detailed position={request.fundingPosition} />
          </DossierSection>

          <Separator />

          <DossierSection title="Builder request note">
            <p className="text-muted-foreground text-sm leading-6">
              {request.requestNote}
            </p>
          </DossierSection>
        </div>

        <aside className="grid content-start gap-5 p-5">
          <DossierSection title="Decision context">
            <EvidenceList evidence={request.evidence} />
          </DossierSection>
          <FundingPosition detailed position={request.fundingPosition} />
          <div className="border-t pt-4">
            <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
              Submitted
            </p>
            <p className="mt-1 font-medium text-sm">{request.submittedAt}</p>
          </div>
          <div className="border-t pt-4">
            <p className="text-muted-foreground text-xs leading-5">
              Reviewer identity and lender-only decision rationale stay inside
              the private review history. Builders receive requirements and
              high-level status only.
            </p>
          </div>
          <Button className="w-full" variant="outline">
            Open canonical Draw <ArrowUpRight className="size-4" />
          </Button>
        </aside>
      </div>
    </div>
  );
}

function DossierSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section>
      <h3 className="font-semibold text-sm">{title}</h3>
      {description ? (
        <p className="mt-1 text-muted-foreground text-xs leading-5">
          {description}
        </p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const laneDefinitions = [
  {
    key: "needs-action",
    title: "Needs my action",
    description: "A required lender decision is outstanding",
    icon: CircleDot,
  },
  {
    key: "waiting",
    title: "Waiting on others",
    description: "Your required action is complete or not required",
    icon: Users,
  },
  {
    key: "correction",
    title: "Builder correction",
    description: "Same record is waiting for corrected resubmission",
    icon: RotateCcw,
  },
  {
    key: "approved",
    title: "Approved",
    description: "All locked approval requirements are complete",
    icon: Check,
  },
] as const;

function VariantC({
  requests,
  scope,
}: {
  requests: readonly DrawRequest[];
  scope: QueueScope;
}) {
  const lanes =
    scope === "action"
      ? laneDefinitions.filter((lane) => lane.key === "needs-action")
      : laneDefinitions;

  return (
    <Frame>
      <FramePanel className="flex flex-col justify-between gap-3 py-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Variant C</Badge>
            <h2 className="font-semibold text-sm">Workflow lanes</h2>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            State-led triage with policy, receipt coverage, and evidence on
            every card.
          </p>
        </div>
        <p className="max-w-lg text-muted-foreground text-xs leading-5">
          Correction retains the request history and resets required approvals
          for the next cycle.
        </p>
      </FramePanel>
      <div className={cn("grid gap-1", scope === "all" && "2xl:grid-cols-4")}>
        {lanes.map((lane) => {
          const LaneIcon = lane.icon;
          const laneRequests = requests.filter(
            (request) => request.state === lane.key
          );
          return (
            <FramePanel className="p-0" key={lane.key}>
              <header className="border-b px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <LaneIcon className="size-4" />
                    <h3 className="font-semibold text-sm">{lane.title}</h3>
                  </div>
                  <Badge variant="outline">{laneRequests.length}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground text-xs leading-5">
                  {lane.description}
                </p>
              </header>
              <div
                className={cn(
                  "grid gap-3 p-3",
                  scope === "action" && "xl:grid-cols-3"
                )}
              >
                {laneRequests.map((request) => (
                  <DrawWorkflowCard key={request.displayId} request={request} />
                ))}
                {laneRequests.length === 0 ? <EmptyQueueState /> : null}
              </div>
            </FramePanel>
          );
        })}
      </div>
    </Frame>
  );
}

function DrawWorkflowCard({ request }: { request: DrawRequest }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-muted-foreground text-xs">
              {request.displayId} · {request.build}
            </p>
            <CardTitle className="mt-1 text-sm">
              {request.requestLabel}
            </CardTitle>
          </div>
          <p className="shrink-0 font-semibold text-sm tabular-nums">
            {request.amount}
          </p>
        </div>
        <p className="text-muted-foreground text-xs leading-5">
          {request.summary}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 p-4">
        <div>
          <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            Locked policy
          </p>
          <p className="mt-1 font-semibold text-xs">{request.policy}</p>
          <div className="mt-2">
            <ApprovalGroups compact groups={request.approvals} />
          </div>
        </div>
        <FundingPosition position={request.fundingPosition} />
        <EvidenceList evidence={request.evidence} />
        <Button className="w-full" size="sm" variant="outline">
          Open request <ArrowUpRight className="size-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}

function VariantD({ requests }: { requests: readonly DrawRequest[] }) {
  const grouped = requests.reduce<Record<string, DrawRequest[]>>(
    (groups, request) => {
      const buildRequests = groups[request.build] ?? [];
      buildRequests.push(request);
      groups[request.build] = buildRequests;
      return groups;
    },
    {}
  );

  return (
    <Frame>
      <FramePanel className="flex flex-col justify-between gap-3 py-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Variant D</Badge>
            <h2 className="font-semibold text-sm">Build packets</h2>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            Group assigned Draw requests by their canonical Build context.
          </p>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Building2 className="size-4" /> {Object.keys(grouped).length} Builds
        </div>
      </FramePanel>

      {Object.entries(grouped).map(([build, buildRequests]) => (
        <FramePanel className="p-0" key={build}>
          <header className="flex flex-col justify-between gap-3 border-b px-5 py-4 md:flex-row md:items-center">
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-sm">
                <Building2 className="size-4" /> {build}
              </h3>
              <p className="mt-1 text-muted-foreground text-xs">
                {buildRequests[0]?.builder} · {buildRequests[0]?.location}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {buildRequests.length} request
                {buildRequests.length === 1 ? "" : "s"}
              </Badge>
              <Button size="sm" variant="ghost">
                Build overview <ChevronRight className="size-4" />
              </Button>
            </div>
          </header>
          <div className="grid gap-3 p-3 xl:grid-cols-2">
            {buildRequests.map((request) => (
              <Card key={request.displayId}>
                <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(280px,1.2fr)]">
                  <div className="flex min-w-0 flex-col">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-muted-foreground text-xs">
                        {request.displayId}
                      </p>
                      <Badge variant="outline">{request.cycle}</Badge>
                    </div>
                    <h4 className="mt-1 font-semibold text-sm">
                      {request.requestLabel}
                    </h4>
                    <p className="mt-2 whitespace-nowrap font-semibold text-lg tabular-nums">
                      {request.amount}
                    </p>
                    <p className="mt-2 text-muted-foreground text-xs leading-5">
                      {request.summary}
                    </p>
                    <p className="mt-3 font-mono text-muted-foreground text-xs">
                      {request.workOrderKey}
                    </p>
                    <div className="mt-auto pt-5">
                      <DecisionStateSignal
                        label={request.stateLabel}
                        state={request.state}
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
                    <div>
                      <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                        {request.policy}
                      </p>
                      <div className="mt-2">
                        <ApprovalGroups compact groups={request.approvals} />
                      </div>
                    </div>
                    <EvidenceList evidence={request.evidence} />
                    <FundingPosition position={request.fundingPosition} />
                    <Button className="w-full" size="sm" variant="outline">
                      Open Draw <ArrowUpRight className="size-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </FramePanel>
      ))}
    </Frame>
  );
}

// TODO(lender-portal): supply the lender-authorized Draw queue projection.
// This exports the selected Variant D composition without the prototype switcher.
export function LenderDrawQueueVariantD() {
  return <VariantD requests={drawRequests} />;
}

function ApprovalGroups({
  compact = false,
  groups,
}: {
  compact?: boolean;
  groups: readonly ApprovalGroup[];
}) {
  return (
    <div className={cn("grid gap-2", !compact && "sm:grid-cols-2")}>
      {groups.map((group) => (
        <div
          className={cn(
            "flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2",
            group.state === "approved" &&
              "border-emerald-500/30 bg-emerald-500/10",
            group.state === "outstanding" &&
              "border-amber-500/30 bg-amber-500/10",
            group.state === "reset" && "border-dashed bg-muted/40"
          )}
          key={group.label}
        >
          <span className="flex min-w-0 items-center gap-1.5 font-medium text-xs">
            {group.label === "Back Office" ? (
              <ShieldCheck className="size-3.5 shrink-0" />
            ) : (
              <Users className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{group.label}</span>
          </span>
          <span className="shrink-0 font-semibold text-xs">
            {group.progress}
          </span>
        </div>
      ))}
    </div>
  );
}

function FundingPosition({
  detailed = false,
  position,
}: {
  detailed?: boolean;
  position: FundingPositionProjection;
}) {
  const rows = [
    ["Available before", position.availableBefore],
    ["This request", position.requested],
    ["Remaining after", position.remainingAfter],
  ] as const;

  return (
    <div className={cn("grid gap-2", detailed && "rounded-lg border p-3")}>
      <p className="flex items-center gap-1.5 font-semibold text-xs">
        <Banknote className="size-3.5" /> Pooled funding position
      </p>
      {rows.map(([label, value]) => (
        <div
          className={cn(
            "flex items-center justify-between gap-3 text-xs",
            detailed && "border-b pb-2 last:border-b-0 last:pb-0"
          )}
          key={label}
        >
          <span className="text-muted-foreground">{label}</span>
          <span className="font-semibold tabular-nums">{value}</span>
        </div>
      ))}
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: readonly DrawEvidenceFact[] }) {
  const evidenceIcons = {
    approved: Check,
    correction: RotateCcw,
    "decision-history": History,
    "decision-cycle": History,
    "evidence-package": FileCheck2,
    "evidence-retained": Files,
    "lender-approval": UserRoundCheck,
    location: MapPinCheck,
  } satisfies Record<
    DrawEvidenceFact["kind"],
    ComponentType<{ className?: string }>
  >;

  return (
    <div className="grid gap-1.5">
      {evidence.map((fact) => {
        const Icon = evidenceIcons[fact.kind];
        return (
          <p
            className={cn(
              "flex items-center gap-1.5 text-muted-foreground text-xs",
              fact.tone === "success" &&
                "text-emerald-700 dark:text-emerald-300",
              fact.tone === "warning" && "text-amber-800 dark:text-amber-200"
            )}
            key={fact.label}
          >
            <Icon className="size-3.5 shrink-0" /> {fact.label}
          </p>
        );
      })}
    </div>
  );
}

const decisionStateSignals = {
  "needs-action": {
    cue: "Your lender decision is required",
    icon: CircleDot,
    iconClassName: "bg-primary text-primary-foreground",
    signalClassName: "border-l-primary bg-primary/10",
  },
  waiting: {
    cue: "Another required group remains",
    icon: Users,
    iconClassName: "bg-sky-500 text-white",
    signalClassName: "border-l-sky-500 bg-sky-500/10",
  },
  correction: {
    cue: "Builder correction is in progress",
    icon: RotateCcw,
    iconClassName: "bg-amber-500 text-amber-950",
    signalClassName: "border-l-amber-500 bg-amber-500/10",
  },
  approved: {
    cue: "All required approvals are complete",
    icon: Check,
    iconClassName: "bg-emerald-500 text-emerald-950",
    signalClassName: "border-l-emerald-500 bg-emerald-500/10",
  },
} satisfies Record<
  DrawQueueState,
  {
    cue: string;
    icon: ComponentType<{ className?: string }>;
    iconClassName: string;
    signalClassName: string;
  }
>;

function DecisionStateSignal({
  label,
  state,
}: {
  label: string;
  state: DrawQueueState;
}) {
  const signal = decisionStateSignals[state];
  const Icon = signal.icon;

  return (
    <div className={cn("border-l-4 px-3 py-3", signal.signalClassName)}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg shadow-sm",
            signal.iconClassName
          )}
        >
          <Icon className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-sm">{label}</span>
          <span className="mt-0.5 block text-muted-foreground text-xs leading-4">
            {signal.cue}
          </span>
        </span>
      </div>
    </div>
  );
}

function StateBadge({
  label,
  state,
}: {
  label: string;
  state: DrawQueueState;
}) {
  return (
    <Badge
      className={cn(
        state === "needs-action" && "bg-primary text-primary-foreground",
        state === "correction" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100"
      )}
      variant={state === "approved" ? "secondary" : "outline"}
    >
      {label}
    </Badge>
  );
}

function EmptyQueueState() {
  return (
    <div className="p-6 text-center text-muted-foreground text-xs">
      No assigned Draw requests in this state.
    </div>
  );
}
