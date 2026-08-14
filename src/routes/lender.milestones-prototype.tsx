import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Building2,
  CalendarRange,
  Camera,
  Check,
  ChevronRight,
  CircleDot,
  FileCheck2,
  Filter,
  History,
  MapPinCheck,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { type ComponentType, useState } from "react";

import { LenderPrototypeShell } from "../components/prototypes/LenderPrototypeShell";
import { PrototypeVariantSwitcher } from "../components/prototypes/PrototypeVariantSwitcher";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Progress } from "../components/ui/progress";
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

// PROTOTYPE ONLY: three read-only structures for the lender Milestone queue,
// switchable on /lender/milestones-prototype?variant=A|B|C.
const prototypeVariants = [
  { key: "A", label: "Rejected · Decision roster" },
  { key: "B", label: "Rejected · Build-grouped queue" },
  { key: "C", label: "Locked · Evidence-rich workflow lanes" },
] as const;

type PrototypeVariantKey = (typeof prototypeVariants)[number]["key"];
type QueueScope = "action" | "all";
type MilestoneQueueState =
  | "needs-action"
  | "waiting"
  | "correction"
  | "approved";

interface PrototypeSearch {
  variant: PrototypeVariantKey;
}

interface MilestoneRequest {
  actualCost: string;
  actualDates: string;
  approval: string;
  build: string;
  evidence: readonly EvidenceFact[];
  milestone: string;
  plannedBudget: string;
  plannedDates: string;
  policy: string;
  receiptCoverage: ReceiptCoverage;
  state: MilestoneQueueState;
  stateLabel: string;
  subMilestones: readonly SubMilestoneSummary[];
  summary: string;
}

interface ReceiptCoverage {
  label: string;
  percent: number | null;
}

interface SubMilestoneSummary {
  builderEvidence: boolean;
  lenderSiteVisitApproval: boolean;
  name: string;
  receiptCoverage: number | null;
  siteVisitAddressed: boolean;
}

interface EvidenceFact {
  icon: ComponentType<{ className?: string }>;
  label: string;
}

const isPrototypeVariant = (value: unknown): value is PrototypeVariantKey =>
  prototypeVariants.some((variant) => variant.key === value);

export const Route = createFileRoute("/lender/milestones-prototype")({
  validateSearch: (search: Record<string, unknown>): PrototypeSearch => ({
    variant: isPrototypeVariant(search.variant) ? search.variant : "C",
  }),
  component: LenderMilestoneQueuePrototype,
});

const milestoneRequests: readonly MilestoneRequest[] = [
  {
    build: "Harbourline Residences",
    milestone: "Framing complete",
    state: "needs-action",
    stateLabel: "Needs my action",
    summary: "Builder resubmitted the same request after correction",
    policy: "Back Office + lender quorum",
    approval: "Back Office approved · lender 1 of 2",
    plannedBudget: "$620,000",
    actualCost: "$608,400",
    plannedDates: "Apr 8 – May 17",
    actualDates: "Apr 10 – May 21",
    receiptCoverage: { label: "$608,400 of $608,400", percent: 100 },
    subMilestones: [
      {
        name: "Level 1 framing",
        siteVisitAddressed: true,
        lenderSiteVisitApproval: true,
        receiptCoverage: 100,
        builderEvidence: true,
      },
      {
        name: "Level 2 framing",
        siteVisitAddressed: true,
        lenderSiteVisitApproval: false,
        receiptCoverage: 100,
        builderEvidence: true,
      },
      {
        name: "Roof framing",
        siteVisitAddressed: false,
        lenderSiteVisitApproval: true,
        receiptCoverage: 100,
        builderEvidence: true,
      },
    ],
    evidence: [
      { icon: MapPinCheck, label: "Site visit complete" },
      { icon: Camera, label: "Report + photos attached" },
      { icon: History, label: "Cycle 2 retained" },
    ],
  },
  {
    build: "Cedar & King",
    milestone: "Mechanical rough-in",
    state: "needs-action",
    stateLabel: "Needs my action",
    summary: "Current-cycle evidence is ready for lender review",
    policy: "Lender quorum only",
    approval: "Lender 0 of 1",
    plannedBudget: "$410,000",
    actualCost: "$402,750",
    plannedDates: "Jun 3 – Jul 12",
    actualDates: "Jun 5 – Jul 14",
    receiptCoverage: { label: "$402,750 of $402,750", percent: 100 },
    subMilestones: [
      {
        name: "Plumbing rough-in",
        siteVisitAddressed: false,
        lenderSiteVisitApproval: false,
        receiptCoverage: 100,
        builderEvidence: true,
      },
      {
        name: "Electrical rough-in",
        siteVisitAddressed: false,
        lenderSiteVisitApproval: false,
        receiptCoverage: 100,
        builderEvidence: true,
      },
      {
        name: "HVAC rough-in",
        siteVisitAddressed: false,
        lenderSiteVisitApproval: false,
        receiptCoverage: 100,
        builderEvidence: true,
      },
    ],
    evidence: [
      { icon: ReceiptText, label: "Invoices total actual cost" },
      { icon: FileCheck2, label: "Evidence attached" },
      { icon: ShieldCheck, label: "Site visit not required" },
    ],
  },
  {
    build: "Parkview Mews",
    milestone: "Foundation complete",
    state: "waiting",
    stateLabel: "Waiting on lender group",
    summary: "Your current-cycle approval is already recorded",
    policy: "Back Office + lender quorum",
    approval: "Back Office approved · lender 1 of 2",
    plannedBudget: "$540,000",
    actualCost: "$552,200",
    plannedDates: "Feb 12 – Mar 22",
    actualDates: "Feb 14 – Mar 27",
    receiptCoverage: { label: "$552,200 of $552,200", percent: 100 },
    subMilestones: [
      {
        name: "Footings",
        siteVisitAddressed: true,
        lenderSiteVisitApproval: true,
        receiptCoverage: 100,
        builderEvidence: true,
      },
      {
        name: "Foundation walls",
        siteVisitAddressed: true,
        lenderSiteVisitApproval: true,
        receiptCoverage: 100,
        builderEvidence: true,
      },
    ],
    evidence: [
      { icon: MapPinCheck, label: "Site visit complete" },
      { icon: Camera, label: "Report + photos attached" },
    ],
  },
  {
    build: "Northfield Commons",
    milestone: "Roof dry-in",
    state: "correction",
    stateLabel: "Builder correction",
    summary: "Rejected request is waiting for same-record resubmission",
    policy: "Back Office only",
    approval: "Approvals reset for next cycle",
    plannedBudget: "$275,000",
    actualCost: "$271,900",
    plannedDates: "May 6 – May 31",
    actualDates: "May 8 – Jun 3",
    receiptCoverage: { label: "$271,900 of $271,900", percent: 100 },
    subMilestones: [
      {
        name: "Roof membrane",
        siteVisitAddressed: true,
        lenderSiteVisitApproval: false,
        receiptCoverage: 100,
        builderEvidence: true,
      },
      {
        name: "Flashing",
        siteVisitAddressed: false,
        lenderSiteVisitApproval: false,
        receiptCoverage: 100,
        builderEvidence: true,
      },
    ],
    evidence: [
      { icon: RotateCcw, label: "Correction requested" },
      { icon: History, label: "Prior cycle retained" },
    ],
  },
  {
    build: "Harbourline Residences",
    milestone: "Foundation complete",
    state: "approved",
    stateLabel: "Approved",
    summary: "All locked approval requirements are complete",
    policy: "Back Office + lender quorum",
    approval: "Back Office approved · lender 2 of 2",
    plannedBudget: "$480,000",
    actualCost: "$474,600",
    plannedDates: "Jan 8 – Feb 9",
    actualDates: "Jan 9 – Feb 12",
    receiptCoverage: { label: "$474,600 of $474,600", percent: 100 },
    subMilestones: [
      {
        name: "Excavation",
        siteVisitAddressed: true,
        lenderSiteVisitApproval: true,
        receiptCoverage: 100,
        builderEvidence: true,
      },
      {
        name: "Footings",
        siteVisitAddressed: true,
        lenderSiteVisitApproval: true,
        receiptCoverage: 100,
        builderEvidence: true,
      },
    ],
    evidence: [
      { icon: Check, label: "Current cycle complete" },
      { icon: FileCheck2, label: "Evidence retained" },
    ],
  },
];

function LenderMilestoneQueuePrototype() {
  const { variant } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [scope, setScope] = useState<QueueScope>("action");
  const visibleRequests =
    scope === "action"
      ? milestoneRequests.filter((request) => request.state === "needs-action")
      : milestoneRequests;

  const selectVariant = (nextVariant: string) => {
    if (!isPrototypeVariant(nextVariant)) {
      return;
    }
    return navigate({
      replace: true,
      search: { variant: nextVariant },
      to: "/lender/milestones-prototype",
    });
  };

  return (
    <LenderPrototypeShell
      activeNavigation="Milestones"
      pageTitle="Milestone queue"
    >
      <div className="min-h-[calc(100vh-3.5rem)] bg-muted/30 pb-28">
        <div className="border-amber-500/30 border-y bg-amber-50 px-4 py-2 text-center font-medium text-[11px] text-amber-950 tracking-wide dark:bg-amber-950/40 dark:text-amber-100">
          THROWAWAY PROTOTYPE · READ-ONLY REPRESENTATIVE DATA · NO DECISIONS ARE
          SAVED
        </div>
        <main className="mx-auto min-w-0 max-w-[1440px] p-4">
          <QueueHeader scope={scope} setScope={setScope} />
          {variant === "A" ? <VariantA requests={visibleRequests} /> : null}
          {variant === "B" ? <VariantB requests={visibleRequests} /> : null}
          {variant === "C" ? (
            <VariantC requests={visibleRequests} scope={scope} />
          ) : null}
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
        <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
          Assigned Milestone requests
        </p>
        <h1 className="mt-1 font-semibold text-2xl tracking-tight sm:text-3xl">
          Milestone queue
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm leading-6">
          Review current-cycle requirements, evidence, and approval-group
          progress across your organization&apos;s assigned Builds.
        </p>
      </div>
      <fieldset className="flex w-fit rounded-lg border bg-background p-1">
        <legend className="sr-only">Milestone queue scope</legend>
        <Button
          aria-pressed={scope === "action"}
          onClick={() => setScope("action")}
          size="sm"
          variant={scope === "action" ? "default" : "ghost"}
        >
          Needs my action <Badge variant="secondary">2</Badge>
        </Button>
        <Button
          aria-pressed={scope === "all"}
          onClick={() => setScope("all")}
          size="sm"
          variant={scope === "all" ? "default" : "ghost"}
        >
          All assigned <Badge variant="secondary">5</Badge>
        </Button>
      </fieldset>
    </header>
  );
}

function VariantA({ requests }: { requests: readonly MilestoneRequest[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between border-b">
        <div>
          <CardTitle>Decision roster</CardTitle>
          <p className="mt-1 text-muted-foreground text-xs">
            Dense scan of current state, requirements, and group progress
          </p>
        </div>
        <Badge className="gap-1" variant="outline">
          <Filter className="size-3" /> {requests.length} shown
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Build / Milestone</TableHead>
              <TableHead>Current state</TableHead>
              <TableHead>Evidence</TableHead>
              <TableHead>Locked policy / progress</TableHead>
              <TableHead className="pr-5 text-right">Review</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={`${request.build}-${request.milestone}`}>
                <TableCell className="min-w-56 py-4 pl-5">
                  <p className="font-semibold">{request.milestone}</p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {request.build}
                  </p>
                </TableCell>
                <TableCell className="min-w-44">
                  <StateBadge
                    label={request.stateLabel}
                    state={request.state}
                  />
                  <p className="mt-2 max-w-52 text-muted-foreground text-xs leading-5">
                    {request.summary}
                  </p>
                </TableCell>
                <TableCell className="min-w-52">
                  <EvidenceList evidence={request.evidence} />
                </TableCell>
                <TableCell className="min-w-56">
                  <p className="font-semibold text-xs">{request.policy}</p>
                  <p className="mt-2 text-muted-foreground text-xs">
                    {request.approval}
                  </p>
                </TableCell>
                <TableCell className="pr-5 text-right">
                  <Button size="sm" variant="outline">
                    View <ArrowUpRight className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function VariantB({ requests }: { requests: readonly MilestoneRequest[] }) {
  const grouped = requests.reduce<Record<string, MilestoneRequest[]>>(
    (groups, request) => {
      const buildRequests = groups[request.build];
      if (buildRequests) {
        buildRequests.push(request);
      } else {
        groups[request.build] = [request];
      }
      return groups;
    },
    {}
  );

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start gap-3">
          <Building2 className="mt-0.5 size-5" />
          <div>
            <p className="font-semibold text-sm">Build-grouped queue</p>
            <p className="mt-1 text-muted-foreground text-xs leading-5">
              Keep related Milestone requests together while retaining each
              request&apos;s independent review cycle.
            </p>
          </div>
        </div>
      </div>

      {Object.entries(grouped).map(([build, buildRequests]) => (
        <Card key={build}>
          <CardHeader className="flex-row items-center justify-between border-b py-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Building2 className="size-4" /> {build}
              </CardTitle>
              <p className="mt-1 text-muted-foreground text-xs">
                {buildRequests.length} assigned Milestone
                {buildRequests.length === 1 ? "" : "s"}
              </p>
            </div>
            <Button size="sm" variant="ghost">
              Build overview <ChevronRight className="size-4" />
            </Button>
          </CardHeader>
          <CardContent className="divide-y px-0">
            {buildRequests.map((request) => (
              <div
                className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(180px,1fr)_minmax(220px,1.25fr)_minmax(220px,1.2fr)_auto] lg:items-center"
                key={request.milestone}
              >
                <div>
                  <p className="font-semibold text-sm">{request.milestone}</p>
                  <div className="mt-2">
                    <StateBadge
                      label={request.stateLabel}
                      state={request.state}
                    />
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-xs">{request.policy}</p>
                  <p className="mt-1 text-muted-foreground text-xs leading-5">
                    {request.approval}
                  </p>
                </div>
                <EvidenceList evidence={request.evidence} />
                <Button size="sm" variant="outline">
                  Open review <ChevronRight className="size-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const laneDefinitions = [
  {
    key: "needs-action",
    title: "Needs my action",
    description: "Your current-cycle lender decision is outstanding",
    icon: CircleDot,
  },
  {
    key: "waiting",
    title: "Waiting on others",
    description: "Your action is complete; another required group remains",
    icon: Users,
  },
  {
    key: "correction",
    title: "Builder correction",
    description: "Same request is waiting for corrected resubmission",
    icon: RotateCcw,
  },
  {
    key: "approved",
    title: "Approved",
    description: "All locked current-cycle requirements are complete",
    icon: Check,
  },
] as const;

function VariantC({
  requests,
  scope,
}: {
  requests: readonly MilestoneRequest[];
  scope: QueueScope;
}) {
  const lanes =
    scope === "action"
      ? laneDefinitions.filter((lane) => lane.key === "needs-action")
      : laneDefinitions;

  return (
    <div className="grid gap-4">
      <div className="flex flex-col justify-between gap-3 rounded-lg border bg-card px-4 py-3 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Badge>Locked Variant C</Badge>
            <p className="font-semibold text-sm">
              Evidence-rich workflow lanes
            </p>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            Each card combines cost, schedule, evidence coverage, and
            SubMilestone signals.
          </p>
        </div>
        <SubMilestoneLegend />
      </div>

      <div className={cn("grid gap-4", scope === "all" && "2xl:grid-cols-4")}>
        {lanes.map((lane) => {
          const LaneIcon = lane.icon;
          const laneRequests = requests.filter(
            (request) => request.state === lane.key
          );

          return (
            <section
              className="min-w-0 rounded-lg border bg-muted/30"
              key={lane.key}
            >
              <header className="border-b bg-card px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <LaneIcon className="size-4" />
                    <h2 className="font-semibold text-sm">{lane.title}</h2>
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
                  scope === "action" && "xl:grid-cols-2"
                )}
              >
                {laneRequests.map((request) => (
                  <MilestoneWorkflowCard
                    key={`${request.build}-${request.milestone}`}
                    request={request}
                  />
                ))}
                {laneRequests.length === 0 ? (
                  <p className="rounded-lg border border-dashed bg-background p-4 text-center text-muted-foreground text-xs">
                    No assigned requests in this state
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// TODO(lender-portal): replace the representative request array with the
// canonical lender current-cycle Milestone projection without changing Variant C.
export function LenderMilestoneQueueVariantC() {
  const [scope, setScope] = useState<QueueScope>("action");
  const requests =
    scope === "action"
      ? milestoneRequests.filter((request) => request.state === "needs-action")
      : milestoneRequests;
  return (
    <>
      <QueueHeader scope={scope} setScope={setScope} />
      <VariantC requests={requests} scope={scope} />
    </>
  );
}

function MilestoneWorkflowCard({ request }: { request: MilestoneRequest }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="border-b px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-muted-foreground text-xs">
              {request.build}
            </p>
            <CardTitle className="mt-1 text-sm">{request.milestone}</CardTitle>
          </div>
          <StateBadge label={request.stateLabel} state={request.state} />
        </div>
        <p className="text-muted-foreground text-xs leading-5">
          {request.summary}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 px-4 py-4">
        <div className="grid grid-cols-2 gap-2">
          <ReviewFact label="Planned Budget" value={request.plannedBudget} />
          <ReviewFact label="Actual entered cost" value={request.actualCost} />
          <ReviewFact
            icon={CalendarRange}
            label="Planned start / end"
            value={request.plannedDates}
          />
          <ReviewFact
            icon={CalendarRange}
            label="Actual start / end"
            value={request.actualDates}
          />
        </div>

        <ReceiptCoverageSummary coverage={request.receiptCoverage} />

        <div className="grid gap-2 rounded-lg border bg-muted/20 p-3">
          <div>
            <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">
              Locked policy
            </p>
            <p className="mt-1 font-semibold text-xs">{request.policy}</p>
          </div>
          <Separator />
          <div>
            <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">
              Approval progress
            </p>
            <p className="mt-1 font-semibold text-xs">{request.approval}</p>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">
              SubMilestones
            </p>
            <Badge variant="outline">{request.subMilestones.length}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {request.subMilestones.map((subMilestone) => (
              <SubMilestoneTile
                key={subMilestone.name}
                subMilestone={subMilestone}
              />
            ))}
          </div>
        </div>

        {/* TODO(lender-portal): enable this only after the lender-authorized
            current-cycle Milestone projection can identify the canonical sheet. */}
        <Button
          aria-description="Request details become available when the lender Milestone projection is connected."
          className="w-full"
          disabled
          size="sm"
          title="Request details are not available yet"
          variant="outline"
        >
          Request details unavailable <ArrowUpRight className="size-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}

function ReviewFact({
  icon: Icon,
  label,
  value,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-background p-2.5">
      <p className="flex items-center gap-1 font-semibold text-[9px] text-muted-foreground uppercase tracking-wide">
        {Icon ? <Icon className="size-3" /> : null} {label}
      </p>
      <p className="mt-1 truncate font-semibold text-xs">{value}</p>
    </div>
  );
}

function ReceiptCoverageSummary({ coverage }: { coverage: ReceiptCoverage }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 font-semibold text-xs">
          <ReceiptText className="size-3.5" /> Receipt/invoice coverage
        </p>
        <Badge variant="secondary">
          {coverage.percent === null ? "Not required" : `${coverage.percent}%`}
        </Badge>
      </div>
      <p className="mt-2 text-muted-foreground text-xs">{coverage.label}</p>
      {coverage.percent === null ? null : (
        <Progress
          aria-label="Receipt and invoice coverage"
          className="mt-2 h-1.5"
          value={coverage.percent}
        />
      )}
    </div>
  );
}

function SubMilestoneLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] text-muted-foreground">
      <LegendItem icon={MapPinCheck} label="Site Visit addressed" />
      <LegendItem icon={ShieldCheck} label="Lender Site Visit approval" />
      <LegendItem icon={ReceiptText} label="Receipt/invoice coverage" />
      <LegendItem icon={FileCheck2} label="Builder evidence" />
    </div>
  );
}

function LegendItem({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <Icon className="size-3.5" /> {label}
    </span>
  );
}

function SubMilestoneTile({
  subMilestone,
}: {
  subMilestone: SubMilestoneSummary;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-background p-2.5">
      <p className="truncate font-semibold text-[11px]">{subMilestone.name}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <SubMilestoneSignal
          active={subMilestone.siteVisitAddressed}
          icon={MapPinCheck}
          label="Site Visit addressed this SubMilestone"
          tone="success"
        />
        <SubMilestoneSignal
          active={subMilestone.lenderSiteVisitApproval}
          icon={ShieldCheck}
          label="Site Visit requires lender approval"
          tone="warning"
        />
        <SubMilestoneSignal
          active={subMilestone.builderEvidence}
          icon={FileCheck2}
          label="Builder submitted evidence"
          tone="evidence"
        />
      </div>
      <div className="mt-2 border-t pt-2">
        <div className="flex items-center justify-between gap-2 text-[9px]">
          <span className="flex items-center gap-1 text-muted-foreground">
            <ReceiptText className="size-3" /> Receipt/invoice coverage
          </span>
          <span className="font-semibold">
            {subMilestone.receiptCoverage === null
              ? "Not required"
              : `${subMilestone.receiptCoverage}%`}
          </span>
        </div>
        {subMilestone.receiptCoverage === null ? null : (
          <Progress
            aria-label={`${subMilestone.name} receipt and invoice coverage`}
            className="mt-1.5 h-1"
            value={subMilestone.receiptCoverage}
          />
        )}
      </div>
    </div>
  );
}

function SubMilestoneSignal({
  active,
  icon: Icon,
  label,
  tone,
}: {
  active: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  tone: "evidence" | "success" | "warning";
}) {
  return (
    <span
      aria-label={active ? label : `${label}: no`}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 font-semibold text-[9px]",
        !active && "border-transparent bg-muted text-muted-foreground/45",
        active &&
          tone === "success" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        active &&
          tone === "warning" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
        active &&
          tone === "evidence" &&
          "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
      )}
      role="img"
      title={active ? label : `${label}: no`}
    >
      <Icon className="size-3" />
    </span>
  );
}

function StateBadge({
  label,
  state,
}: {
  label: string;
  state: MilestoneQueueState;
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

function EvidenceList({ evidence }: { evidence: readonly EvidenceFact[] }) {
  return (
    <div className="grid gap-1.5">
      {evidence.map((fact) => {
        const Icon = fact.icon;
        return (
          <p
            className="flex items-center gap-1.5 text-muted-foreground text-xs"
            key={fact.label}
          >
            <Icon className="size-3.5 shrink-0" /> {fact.label}
          </p>
        );
      })}
    </div>
  );
}
