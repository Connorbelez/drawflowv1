import {
  ClientOnly,
  createFileRoute,
  useNavigate,
} from "@tanstack/react-router";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowUpDown,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  Eye,
  FileText,
  Filter,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from "#/components/kibo-ui/kanban/index.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Calendar } from "#/components/ui/calendar.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Switch } from "#/components/ui/switch.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import {
  MilestoneCardDetailSheet,
  ProposalCardDetailSheet,
} from "#/features/backoffice-dashboard/kanban-card-detail-sheet.tsx";
import { MetricDetailSheet } from "#/features/backoffice-dashboard/metric-detail-sheet.tsx";
import {
  BACKOFFICE_BUILD_WORKSPACE_SEARCH,
  backofficeBuildWorkspaceHref,
} from "#/features/backoffice-dashboard/backoffice-build-links.ts";
import { getMetricDrilldownItems } from "#/features/backoffice-dashboard/metric-drilldown.ts";
import {
  type ActiveBuild,
  type BackofficeDashboardData,
  type DashboardDrawRequest,
  type DashboardKanbanColumn,
  type DashboardMetric,
  getExplicitMockBackofficeDashboardData,
  type MilestoneKanbanCard,
  type ProposalKanbanCard,
  type QuickAction,
  type ScheduleEvent,
} from "#/features/backoffice-dashboard/mock-data.ts";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/backoffice/")({
  staticData: {
    breadcrumb: {
      label: "Home",
      to: "/backoffice",
    },
  },
  component: RouteComponent,
});

const metricToneClass: Record<DashboardMetric["tone"], string> = {
  default: "bg-info/10 text-info-foreground",
  destructive: "bg-destructive/10 text-destructive-foreground",
  success: "bg-success/10 text-success-foreground",
  warning: "bg-warning/10 text-warning-foreground",
};

const buildStatusVariant: Record<ActiveBuild["status"], "success" | "warning"> =
  {
    behind: "warning",
    onTrack: "success",
    overBudget: "warning",
  };

const milestoneStateVariant: Record<
  ActiveBuild["milestoneState"],
  "outline" | "secondary" | "info"
> = {
  backlog: "outline",
  inProgress: "info",
  inReview: "secondary",
};

const priorityVariant: Record<
  MilestoneKanbanCard["priority"],
  "outline" | "warning" | "destructive"
> = {
  high: "destructive",
  low: "outline",
  medium: "warning",
};

const actionIcon = {
  drawRequest: FileText,
  milestone: CheckCircle2,
  siteVisit: ClipboardCheck,
} satisfies Record<QuickAction["type"], typeof FileText>;

interface BackofficeDashboardQueryResult {
  dashboard?: Omit<BackofficeDashboardData, "drawRequests" | "scheduleDate"> & {
    drawRequests?: DashboardDrawRequest[];
    scheduleDate: string;
  };
  needsSeed?: boolean;
}

interface TimelineBackofficeDrawRequestRow {
  amountCents?: number;
  drawKey?: string;
  href?: string;
  id?: string;
  label?: string;
  x?: number;
}

interface TimelineBackofficeRow {
  activeMilestone?: string;
  address: string;
  buildId?: string;
  buildKey?: string;
  buildName: string;
  buildStatus?: ActiveBuild["status"];
  currentDay?: number;
  builder?: string;
  drawRequests?: TimelineBackofficeDrawRequestRow[];
  href?: string;
  liveStatusLabel?: string;
  milestoneCount?: number;
  ownerPersona?: string;
  pendingDrawRequestCount?: number;
  pendingModificationRequestCount?: number;
  planId: string;
  status: "approved" | "draft" | "submitted" | string;
  statusLabel?: string;
  totalBudgetCents?: number;
}

export function normalizeBackofficeDashboardQuery(
  result: BackofficeDashboardQueryResult | null | undefined
): BackofficeDashboardData {
  if (!result?.dashboard || result.needsSeed) {
    return getExplicitMockBackofficeDashboardData();
  }

  return {
    ...result.dashboard,
    drawRequests: result.dashboard.drawRequests ?? [],
    scheduleDate: new Date(result.dashboard.scheduleDate),
  };
}

function RouteComponent() {
  const generatedDashboard = useQuery(
    api.demo_timeline_plans.demo_getBackofficeDashboard,
    {}
  );
  const submittedTimelineProposals = useQuery(
    api.demo_timeline_plans.demo_getSubmittedProposalsForBackoffice,
    {}
  );
  const dashboard = useMemo(() => {
    const normalized = normalizeBackofficeDashboardQuery(generatedDashboard);
    return mergeTimelineRowsIntoBackofficeDashboard(
      normalized,
      submittedTimelineProposals ?? []
    );
  }, [generatedDashboard, submittedTimelineProposals]);

  return <BackofficeDashboard dashboard={dashboard} />;
}

export function mergeTimelineRowsIntoBackofficeDashboard(
  normalized: BackofficeDashboardData,
  timelineRows: TimelineBackofficeRow[]
): BackofficeDashboardData {
  const timelineProposalCards = timelineRows
    .filter((row) => row.status === "draft" || row.status === "submitted")
    .map((row): ProposalKanbanCard => ({
      address: row.address,
      buildKey: row.buildKey,
      builder: row.ownerPersona ?? row.builder ?? "Timeline builder",
      column: row.status === "submitted" ? "submitted" : "draft",
      href: row.href,
      id: String(row.planId),
      isMockBuilder: true,
      isMockLtv: true,
      loanAmount: centsToCurrency(row.totalBudgetCents ?? 0),
      ltv: 68,
      name: row.buildName,
      statusLabel: row.statusLabel,
      tag: "demo",
    }));
  const timelineActiveBuilds = timelineRows
    .filter((row) => row.status === "approved")
    .map((row): ActiveBuild => ({
      activeMilestone:
        row.pendingDrawRequestCount || row.pendingModificationRequestCount
          ? `${row.pendingDrawRequestCount ?? 0} draw requests; ${row.pendingModificationRequestCount ?? 0} change requests`
          : (row.activeMilestone ?? `${row.milestoneCount ?? 0} milestones`),
      address: row.address,
      buildKey: row.buildKey ?? String(row.buildId),
      builder: row.ownerPersona ?? row.builder ?? "Timeline builder",
      daysActive: Math.max(0, Math.round(row.currentDay ?? 0)),
      href: backofficeBuildWorkspaceHref(
        String(row.buildKey ?? row.buildId ?? row.planId),
      ),
      id: String(row.buildKey ?? row.planId),
      milestoneState:
        row.buildStatus === "behind" ? ("inProgress" as const) : ("backlog" as const),
      status: row.buildStatus ?? ("onTrack" as const),
      statusLabel: row.liveStatusLabel ?? "Live timeline",
    }));
  const timelineDrawRequests = timelineRows.flatMap((row) =>
    (row.drawRequests ?? []).map((request): DashboardDrawRequest => ({
      address: row.address,
      buildId: String(row.buildKey ?? row.buildId ?? row.planId),
      buildKey: String(row.buildKey ?? row.buildId ?? row.planId),
      eligibleDate: `Day ${Math.round(request.x ?? 0)}`,
      href:
        row.status === "approved"
          ? backofficeBuildWorkspaceHref(
              String(row.buildKey ?? row.buildId ?? row.planId),
            )
          : (request.href ?? `/demo/timeline/${row.planId}`),
      id: String(request.drawKey ?? request.id),
      label: request.label ?? "Timeline draw request",
      requestedAmount: centsToCurrency(request.amountCents ?? 0),
      statusLabel: "Requested",
    }))
  );
  const generatedTimelineProposalIds = new Set(
    timelineProposalCards.map((proposal) => String(proposal.id))
  );
  const retainedGeneratedProposals = normalized.proposals.filter(
    (proposal) => !generatedTimelineProposalIds.has(String(proposal.id))
  );
  const proposals = [...retainedGeneratedProposals, ...timelineProposalCards];
  const draftCount = timelineProposalCards.filter(
    (card) => card.column === "draft"
  ).length;
  const submittedCount = timelineProposalCards.filter(
    (card) => card.column === "submitted"
  ).length;

  return {
    ...normalized,
    activeBuilds: [...normalized.activeBuilds, ...timelineActiveBuilds],
    drawRequests: [...normalized.drawRequests, ...timelineDrawRequests],
    metrics: normalized.metrics.map((metric) =>
      metric.id === "proposals"
        ? {
            ...metric,
            detail: `${proposals.length} draft/submitted proposals`,
            trend: `${draftCount} timeline drafts; ${submittedCount} submitted`,
            value: proposals.length,
          }
        : metric.id === "active-builds"
          ? {
              ...metric,
              detail: `${normalized.activeBuilds.length + timelineActiveBuilds.length} active builds including approved timelines`,
              value:
                normalized.activeBuilds.length + timelineActiveBuilds.length,
            }
          : metric.id === "draw-requests"
            ? {
                ...metric,
                detail: `${normalized.drawRequests.length + timelineDrawRequests.length} draw requests including live timelines`,
                trend: `${timelineDrawRequests.length} timeline draw requests`,
                value:
                  normalized.drawRequests.length + timelineDrawRequests.length,
              }
            : metric
    ),
    proposals,
    proposalColumns: normalized.proposalColumns.map((column) =>
      column.id === "submitted"
        ? {
            ...column,
            description: `${submittedCount} timeline proposals waiting for review`,
          }
        : column.id === "draft"
          ? {
              ...column,
              description: `${draftCount} timeline drafts ready to open`,
            }
          : column
    ),
  };
}

function BackofficeDashboard({
  dashboard,
}: {
  dashboard: BackofficeDashboardData;
}) {
  return (
    <main className="grid min-h-[calc(100vh-4rem)] gap-4 bg-muted/30 p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="flex min-w-0 flex-col gap-4">
        <DashboardToolbar />
        <MetricGrid dashboard={dashboard} />
        <ActiveBuildsCard builds={dashboard.activeBuilds} />
        <SubmittedProposalsCard proposals={dashboard.proposals} />
        <MilestoneKanban
          columns={dashboard.milestoneColumns}
          milestones={dashboard.milestones}
        />
        <ProposalKanban
          columns={dashboard.proposalColumns}
          proposals={dashboard.proposals}
        />
      </section>
      <ScheduleRail
        date={dashboard.scheduleDate}
        events={dashboard.scheduleEvents}
        quickActions={dashboard.quickActions}
      />
    </main>
  );
}

function DashboardToolbar() {
  const syncTimelines = useMutation(
    api.demo_timeline_plans.demo_syncApprovedTimelinesNow
  );
  const [isSyncing, setIsSyncing] = useState(false);

  const runTimelineSync = async () => {
    setIsSyncing(true);
    try {
      const summary = await syncTimelines({});
      toast.success(
        `Timeline sync complete: ${summary.plansUpdated ?? 0} plans updated, ${summary.milestonesUpdated ?? 0} milestones updated, ${summary.autoRequestedDraws ?? 0} draws requested.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Timeline sync failed."
      );
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Frame>
      <FramePanel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-semibold text-2xl tracking-tight">Home</h1>
          <p className="text-muted-foreground text-sm">
            Lender operations dashboard for draw requests, active builds, and
            field review.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 text-muted-foreground text-sm">
          <span>Source</span>
          <span className="font-medium text-foreground">
            Convex demo tables
          </span>
          <Badge variant="success">Live</Badge>
          <Button
            disabled={isSyncing}
            onClick={runTimelineSync}
            size="sm"
            type="button"
            variant="outline"
          >
            {isSyncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Sync timelines
          </Button>
        </div>
      </FramePanel>
    </Frame>
  );
}

function MetricGrid({ dashboard }: { dashboard: BackofficeDashboardData }) {
  const [activeMetricId, setActiveMetricId] = useState<string | null>(null);
  const metrics = dashboard.metrics;
  const activeMetric =
    metrics.find((metric) => metric.id === activeMetricId) ?? null;
  const activeItems = useMemo(
    () =>
      activeMetric ? getMetricDrilldownItems(activeMetric.id, dashboard) : [],
    [activeMetric, dashboard]
  );

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card
            aria-label={`Open ${metric.label}`}
            className="overflow-hidden text-left transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            key={metric.id}
            onClick={() => setActiveMetricId(metric.id)}
            render={<button type="button" />}
          >
            <div className="flex h-full flex-col gap-2 p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      metricToneClass[metric.tone]
                    )}
                  />
                  <span className="truncate">{metric.label}</span>
                </div>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-2xl tracking-tight sm:text-3xl">
                    {metric.value}
                  </div>
                  <CardDescription className="mt-1 line-clamp-2 text-xs sm:text-sm">
                    {metric.detail}
                  </CardDescription>
                </div>
                {metric.tone === "destructive" ? (
                  <CircleAlert className="hidden size-7 shrink-0 text-destructive md:block" />
                ) : (
                  <ArrowUpDown className="hidden size-7 shrink-0 text-muted-foreground md:block" />
                )}
              </div>
              {metric.trend ? (
                <p className="line-clamp-2 text-muted-foreground text-xs">
                  {metric.trend}
                </p>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
      {activeMetric ? (
        <MetricDetailSheet
          items={activeItems}
          metric={activeMetric}
          onOpenChange={(open) => {
            if (!open) {
              setActiveMetricId(null);
            }
          }}
          open={activeMetric !== null}
        />
      ) : null}
    </>
  );
}

function openBackofficeBuildWorkspace(
  navigate: ReturnType<typeof useNavigate>,
  build: ActiveBuild,
) {
  void navigate({
    params: { buildId: build.buildKey },
    search: BACKOFFICE_BUILD_WORKSPACE_SEARCH,
    to: "/backoffice/builds/$buildId",
  });
}

function ActiveBuildsCard({ builds }: { builds: ActiveBuild[] }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    ActiveBuild["status"] | "all"
  >("all");

  const filteredBuilds = useMemo(() => {
    const query = search.trim().toLowerCase();

    return builds.filter((build) => {
      const matchesStatus =
        statusFilter === "all" ? true : build.status === statusFilter;
      const matchesSearch =
        query.length === 0 ||
        [build.id, build.address, build.builder, build.activeMilestone]
          .join(" ")
          .toLowerCase()
          .includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [builds, search, statusFilter]);

  const columns = useMemo<ColumnDef<ActiveBuild>[]>(
    () => [
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => (
          <span className="font-medium text-foreground">{row.original.id}</span>
        ),
      },
      {
        accessorKey: "address",
        header: "Address",
      },
      {
        accessorKey: "builder",
        header: "Builder",
      },
      {
        accessorKey: "daysActive",
        header: () => (
          <span className="inline-flex items-center gap-1">T+days</span>
        ),
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">
            {row.original.daysActive}
          </span>
        ),
      },
      {
        accessorKey: "statusLabel",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={buildStatusVariant[row.original.status]}>
            {row.original.statusLabel}
          </Badge>
        ),
      },
      {
        accessorKey: "activeMilestone",
        header: "Active milestone + state",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span>{row.original.activeMilestone}</span>
            <Badge variant={milestoneStateVariant[row.original.milestoneState]}>
              {formatMilestoneState(row.original.milestoneState)}
            </Badge>
          </div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              aria-label={`View ${row.original.id}`}
              onClick={(event) => {
                event.stopPropagation();
                openBackofficeBuildWorkspace(navigate, row.original);
              }}
              size="icon-xs"
              variant="ghost"
            >
              <Eye />
            </Button>
            <Button
              aria-label={`More actions for ${row.original.id}`}
              onClick={(event) => event.stopPropagation()}
              size="icon-xs"
              variant="ghost"
            >
              <MoreHorizontal />
            </Button>
          </div>
        ),
      },
    ],
    [navigate]
  );

  const table = useReactTable({
    columns,
    data: filteredBuilds,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Card id="active-builds">
      <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 shrink-0">
          <CardTitle className="text-base">Builds - Active</CardTitle>
          <CardDescription>
            {filteredBuilds.length} of {builds.length} builds in view
          </CardDescription>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:justify-end">
          <div className="relative w-full min-w-48 sm:w-auto sm:max-w-xs sm:flex-1 lg:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search active builds"
              className="pl-8"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search ID, address, builder..."
              type="search"
              value={search}
            />
          </div>
          <div className="flex max-w-full shrink-0 overflow-x-auto rounded-lg border bg-background p-0.5">
            {(["all", "onTrack", "behind", "overBudget"] as const).map(
              (status) => (
                <Button
                  aria-pressed={statusFilter === status}
                  className={cn(
                    "h-7 shrink-0 rounded-md px-2 text-xs",
                    statusFilter === status && "bg-secondary"
                  )}
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  variant="ghost"
                >
                  {formatBuildStatusFilter(status)}
                </Button>
              )
            )}
          </div>
          <Button className="shrink-0">
            <Plus />
            New Build
          </Button>
        </div>
      </div>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    className={cn(header.id === "actions" && "text-right")}
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
            {table.getRowModel().rows.map((row) => (
              <TableRow
                className="cursor-pointer"
                key={row.id}
                onClick={() => {
                  openBackofficeBuildWorkspace(navigate, row.original);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openBackofficeBuildWorkspace(navigate, row.original);
                  }
                }}
                tabIndex={0}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    className={cn(cell.column.id === "actions" && "text-right")}
                    key={cell.id}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SubmittedProposalsCard({
  proposals,
}: {
  proposals: ProposalKanbanCard[];
}) {
  const navigate = useNavigate();
  const submitted = proposals.filter(
    (proposal) => proposal.column === "submitted"
  );

  return (
    <Card id="milestones-kanban">
      <CardHeader className="gap-3 border-b p-4">
        <CardTitle className="text-base">Submitted Proposals</CardTitle>
        <CardDescription>
          Lender-admin review and final approval queue
        </CardDescription>
        <CardAction className="row-span-1">
          <Badge variant={submitted.length ? "warning" : "outline"}>
            {submitted.length} submitted
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {submitted.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proposal</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submitted.map((proposal) => (
                <TableRow key={proposal.id}>
                  <TableCell>
                    <div className="font-medium">{proposal.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {proposal.builder}
                    </div>
                  </TableCell>
                  <TableCell>{proposal.address}</TableCell>
                  <TableCell>{proposal.loanAmount}</TableCell>
                  <TableCell>
                    <Badge variant="warning">
                      {proposal.statusLabel ?? "Submitted"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {proposal.href ? (
                        <Button
                          onClick={() =>
                            void navigate({
                              params: { planId: proposal.id },
                              to: "/backoffice/proposals/$planId",
                            })
                          }
                          size="sm"
                          variant="outline"
                        >
                          Review
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-4 text-muted-foreground text-sm">
            No submitted proposals are waiting for admin approval.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MilestoneKanban({
  columns,
  milestones,
}: {
  columns: DashboardKanbanColumn[];
  milestones: MilestoneKanbanCard[];
}) {
  const [cards, setCards] = useState(milestones);
  const [activeMilestone, setActiveMilestone] =
    useState<MilestoneKanbanCard | null>(null);
  useEffect(() => {
    setCards(milestones);
  }, [milestones]);
  useEffect(() => {
    if (!activeMilestone) {
      return;
    }
    const latest = milestones.find((entry) => entry.id === activeMilestone.id);
    if (latest && latest !== activeMilestone) {
      setActiveMilestone(latest);
    } else if (!latest) {
      setActiveMilestone(null);
    }
  }, [activeMilestone, milestones]);

  return (
    <>
      <Card id="proposals-kanban">
        <CardHeader className="gap-3 border-b p-4">
          <CardTitle className="text-base">Milestone Kanban</CardTitle>
          <CardDescription>
            Milestones grouped by build; drag to move state
          </CardDescription>
          <CardAction className="row-span-1 flex items-center gap-2 text-muted-foreground text-sm">
            <Switch aria-label="Show completed milestones" />
            Show completed
          </CardAction>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <ClientOnly fallback={<div className="min-h-80 min-w-4xl" />}>
            <KanbanProvider
              className="min-h-80 min-w-4xl gap-0"
              columns={columns}
              data={cards}
              onDataChange={setCards}
              readOnly
            >
              {(column) => (
                <KanbanBoard
                  className="rounded-none border-0 border-r bg-card shadow-none ring-0 last:border-r-0"
                  id={column.id}
                  key={column.id}
                >
                  <KanbanHeader className="space-y-1 border-b p-4">
                    <div className="flex items-center gap-2">
                      <span>{column.name}</span>
                      <Badge variant="outline">
                        {
                          cards.filter((card) => card.column === column.id)
                            .length
                        }
                      </Badge>
                    </div>
                    {column.description ? (
                      <p className="font-normal text-muted-foreground text-xs">
                        {column.description}
                      </p>
                    ) : null}
                  </KanbanHeader>
                  <KanbanCards<MilestoneKanbanCard>
                    className="gap-2 p-3"
                    id={column.id}
                  >
                    {(card) => (
                      <MilestoneCard
                        card={card}
                        onSelect={setActiveMilestone}
                      />
                    )}
                  </KanbanCards>
                </KanbanBoard>
              )}
            </KanbanProvider>
          </ClientOnly>
        </CardContent>
      </Card>
      <MilestoneCardDetailSheet
        card={activeMilestone}
        columns={columns}
        onOpenChange={(open) => {
          if (!open) {
            setActiveMilestone(null);
          }
        }}
      />
    </>
  );
}

function MilestoneCard({
  card,
  onSelect,
}: {
  card: MilestoneKanbanCard;
  onSelect: (card: MilestoneKanbanCard) => void;
}) {
  return (
    <KanbanCard {...card} className="gap-2 p-3">
      <button
        aria-label={`Open ${card.name} detail`}
        className="contents text-left"
        onClick={() => onSelect(card)}
        type="button"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">
              {card.buildId} · {card.address}
            </p>
            <p className="truncate font-medium text-sm">{card.name}</p>
          </div>
          {card.reviewerInitials ? (
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[0.625rem] text-primary-foreground">
              {card.reviewerInitials}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={priorityVariant[card.priority]}>
            {card.priority}
          </Badge>
          {card.dueLabel ? (
            <Badge variant="outline">{card.dueLabel}</Badge>
          ) : null}
        </div>
      </button>
    </KanbanCard>
  );
}

function ProposalKanban({
  columns,
  proposals,
}: {
  columns: DashboardKanbanColumn[];
  proposals: ProposalKanbanCard[];
}) {
  const navigate = useNavigate();
  const [cards, setCards] = useState(proposals);
  const [activeProposal, setActiveProposal] =
    useState<ProposalKanbanCard | null>(null);
  useEffect(() => {
    setCards(proposals);
  }, [proposals]);
  useEffect(() => {
    if (!activeProposal) {
      return;
    }
    const latest = proposals.find((entry) => entry.id === activeProposal.id);
    if (latest && latest !== activeProposal) {
      setActiveProposal(latest);
    } else if (!latest) {
      setActiveProposal(null);
    }
  }, [activeProposal, proposals]);

  return (
    <>
      <Card>
        <CardHeader className="gap-3 border-b p-4">
          <CardTitle className="text-base">Builds - Proposals</CardTitle>
          <CardDescription>Pipeline by stage</CardDescription>
          <CardAction className="row-span-1 flex flex-wrap gap-2">
            <Button variant="outline">
              <Filter />
              Filter
            </Button>
            <Button variant="outline">
              <Plus />
              Draft new
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <ClientOnly fallback={<div className="min-h-96 min-w-4xl" />}>
            <KanbanProvider
              className="min-h-96 min-w-4xl gap-0"
              columns={columns}
              data={cards}
              onDataChange={setCards}
              readOnly
            >
              {(column) => (
                <KanbanBoard
                  className="rounded-none border-0 border-r bg-card shadow-none ring-0 last:border-r-0"
                  id={column.id}
                  key={column.id}
                >
                  <KanbanHeader className="border-b p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span>{column.name}</span>
                        <Badge variant="outline">
                          {
                            cards.filter((card) => card.column === column.id)
                              .length
                          }
                        </Badge>
                      </div>
                      <Button
                        aria-label={`Add ${column.name} proposal`}
                        size="icon-xs"
                        variant="ghost"
                      >
                        <Plus />
                      </Button>
                    </div>
                  </KanbanHeader>
                  <KanbanCards<ProposalKanbanCard>
                    className="gap-3 p-3"
                    id={column.id}
                  >
                    {(card) => (
                      <ProposalCard
                        card={card}
                        onSelect={(selected) => {
                          if (
                            selected.href?.startsWith("/backoffice/proposals/")
                          ) {
                            void navigate({
                              params: { planId: selected.id },
                              to: "/backoffice/proposals/$planId",
                            });
                            return;
                          }
                          if (selected.href?.startsWith("/demo/timeline/")) {
                            window.location.assign(selected.href);
                            return;
                          }
                          setActiveProposal(selected);
                        }}
                      />
                    )}
                  </KanbanCards>
                </KanbanBoard>
              )}
            </KanbanProvider>
          </ClientOnly>
        </CardContent>
      </Card>
      <ProposalCardDetailSheet
        card={activeProposal}
        columns={columns}
        onOpenChange={(open) => {
          if (!open) {
            setActiveProposal(null);
          }
        }}
      />
    </>
  );
}

function ProposalCard({
  card,
  onSelect,
}: {
  card: ProposalKanbanCard;
  onSelect: (card: ProposalKanbanCard) => void;
}) {
  return (
    <KanbanCard
      {...card}
      className="gap-3 p-3"
      data-ixc-ref={card.tag === "demo" ? "UI-DEMO-PROPOSAL-CARD" : undefined}
    >
      <button
        aria-label={`Open ${card.name} detail`}
        className="contents text-left"
        onClick={() => onSelect(card)}
        type="button"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">{card.name}</p>
            <p className="truncate font-medium text-sm">{card.address}</p>
            <p className="truncate text-muted-foreground text-xs">
              {card.builder}
            </p>
            {card.isMockAddress || card.isMockBuilder ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {card.isMockAddress ? (
                  <Badge variant="outline">Mock address</Badge>
                ) : null}
                {card.isMockBuilder ? (
                  <Badge variant="outline">Mock builder</Badge>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-1">
            {card.closeLabel ? (
              <Badge
                data-ixc-ref={card.tag === "demo" ? "UI-DEMO-TAG" : undefined}
                variant="success"
              >
                {card.closeLabel}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between border-t pt-2 text-sm">
          <span className="font-medium">{card.loanAmount}</span>
          <span className="text-muted-foreground">
            {card.isMockLtv ? "Mock " : ""}
            {card.ltv}% LTV
          </span>
        </div>
      </button>
    </KanbanCard>
  );
}

function ScheduleRail({
  date,
  events,
  quickActions,
}: {
  date: Date;
  events: ScheduleEvent[];
  quickActions: QuickAction[];
}) {
  const eventDays = useMemo(
    () => events.map((event) => new Date(event.date)),
    [events]
  );

  return (
    <aside className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader className="border-b p-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Schedule</CardTitle>
              <CardDescription>{formatMonthYear(date)}</CardDescription>
            </div>
            <CalendarClock className="size-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <Calendar
            className="mx-auto w-full"
            defaultMonth={date}
            modifiers={{ hasEvent: eventDays }}
            modifiersClassNames={{
              hasEvent:
                "after:absolute after:right-1 after:top-1 after:size-1.5 after:rounded-full after:bg-primary",
            }}
            selected={date}
          />
          <div className="space-y-2">
            {events.map((event) => (
              <ScheduleEventRow event={event} key={event.id} />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Events + Quick Action</CardTitle>
              <CardDescription>Admin review queue</CardDescription>
            </div>
            <Badge variant="warning">{quickActions.length} items</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          {quickActions.map((action) => (
            <QuickActionCard action={action} key={action.id} />
          ))}
          <Button className="w-full" variant="outline">
            View all events
          </Button>
        </CardContent>
      </Card>
    </aside>
  );
}

function ScheduleEventRow({ event }: { event: ScheduleEvent }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
      <div className="w-12 shrink-0 text-center">
        <div className="text-[0.625rem] text-muted-foreground uppercase">
          {formatWeekday(event.date)}
        </div>
        <div className="font-semibold">{formatDay(event.date)}</div>
      </div>
      <div className="min-w-0 border-l pl-3">
        <p className="truncate font-medium text-sm">{event.label}</p>
        <p className="text-muted-foreground text-xs">
          {formatTime(event.date)}
        </p>
      </div>
    </div>
  );
}

function QuickActionCard({ action }: { action: QuickAction }) {
  const Icon = actionIcon[action.type];

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="flex items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              {formatActionType(action.type)}
            </p>
            <span className="text-muted-foreground text-xs">
              {action.dueLabel}
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            {action.buildId} · {action.address}
          </p>
          <p className="font-medium text-sm">{action.title}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" size="sm">
          {action.actionLabel}
        </Button>
        <Button
          aria-label={`More actions for ${action.title}`}
          size="icon-sm"
          variant="outline"
        >
          <ChevronDown />
        </Button>
      </div>
    </div>
  );
}

function formatMilestoneState(state: ActiveBuild["milestoneState"]) {
  const labels: Record<ActiveBuild["milestoneState"], string> = {
    backlog: "Backlog",
    inProgress: "In progress",
    inReview: "In review",
  };

  return labels[state];
}

function formatBuildStatusFilter(status: ActiveBuild["status"] | "all") {
  const labels: Record<ActiveBuild["status"] | "all", string> = {
    all: "All",
    behind: "Behind",
    onTrack: "On track",
    overBudget: "Over budget",
  };

  return labels[status];
}

function formatActionType(type: QuickAction["type"]) {
  const labels: Record<QuickAction["type"], string> = {
    drawRequest: "Draw request",
    milestone: "Milestone",
    siteVisit: "Site visit",
  };

  return labels[type];
}

function centsToCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
}

function formatMonthYear(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatWeekday(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" })
    .format(new Date(value))
    .toUpperCase();
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(
    new Date(value)
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
