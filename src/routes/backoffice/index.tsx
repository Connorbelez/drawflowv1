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
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  PanelRightClose,
  CircleAlert,
  ClipboardCheck,
  Eye,
  FileText,
  Filter,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UserPlus,
  UserRound,
  UserRoundX,
} from "lucide-react";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from "#/components/kibo-ui/kanban/index.tsx";
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
import { Calendar } from "#/components/ui/calendar.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#/components/ui/context-menu.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Switch } from "#/components/ui/switch.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { BACKOFFICE_BUILD_WORKSPACE_SEARCH } from "#/features/backoffice-dashboard/backoffice-build-links.ts";
import {
  MilestoneCardDetailSheet,
  ProposalCardDetailSheet,
} from "#/features/backoffice-dashboard/kanban-card-detail-sheet.tsx";
import { MetricDetailSheet } from "#/features/backoffice-dashboard/metric-detail-sheet.tsx";
import { getMetricDrilldownItems } from "#/features/backoffice-dashboard/metric-drilldown.ts";
import type {
  ActiveBuild,
  BackofficeDashboardData,
  DashboardKanbanColumn,
  DashboardMetric,
  MilestoneKanbanCard,
  ProposalKanbanCard,
  QuickAction,
  ScheduleEvent,
} from "#/features/backoffice-dashboard/mock-data.ts";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

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

type ProductionDashboardQueryResult = Omit<
  BackofficeDashboardData,
  "scheduleDate"
> & {
  approvedPendingClosing?: ProposalKanbanCard[];
  scheduleDate: string;
  submittedProposals?: ProposalKanbanCard[];
};

type ProductionBackofficeDashboardData = BackofficeDashboardData & {
  approvedPendingClosing: ProposalKanbanCard[];
  submittedProposals: ProposalKanbanCard[];
};

export interface ClosingConfirmationInput {
  buildStartDate: string;
  reason: string;
}

export interface ProductionBuilderOption {
  _id: string;
  displayName: string;
}

export function normalizeProductionBackofficeDashboard(
  result: ProductionDashboardQueryResult
): ProductionBackofficeDashboardData {
  return {
    ...result,
    approvedPendingClosing: result.approvedPendingClosing ?? [],
    scheduleDate: new Date(result.scheduleDate),
    submittedProposals: result.submittedProposals ?? [],
  };
}

function RouteComponent() {
  const context = Route.useRouteContext();
  const workosOrganizationId = context.organizationId as string;
  const dashboardResult = useQuery(
    api.production_proposals.getBackofficeDashboard,
    { workosOrganizationId }
  );
  const recordClosing = useMutation(
    api.production_proposals.recordOfflineClosing
  );
  const assignBuilder = useMutation(
    api.production_proposals.assignDraftBuilder
  );
  const deleteDraft = useMutation(api.production_proposals.deleteDraftProposal);
  const buildersResult = useQuery(
    api.production_proposals.listBrokerageBuilders,
    { workosOrganizationId }
  );
  const navigate = useNavigate();

  const dashboard = useMemo(
    () =>
      dashboardResult
        ? normalizeProductionBackofficeDashboard(dashboardResult)
        : null,
    [dashboardResult]
  );

  if (!dashboard) {
    return (
      <main className="grid min-h-[24rem] place-items-center bg-muted/30">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading production backoffice dashboard...
        </div>
      </main>
    );
  }

  return (
    <BackofficeDashboard
      builders={buildersResult ?? []}
      dashboard={dashboard}
      onAssignBuilder={(proposal, builderProfileId) =>
        assignBuilder({
          builderProfileId: builderProfileId as Id<"builderProfiles">,
          proposalId: (proposal.proposalId ??
            proposal.id) as Id<"buildProposals">,
          workosOrganizationId,
        })
      }
      onDeleteDraft={(proposal) =>
        deleteDraft({
          proposalId: (proposal.proposalId ??
            proposal.id) as Id<"buildProposals">,
          workosOrganizationId,
        })
      }
      onOpenUnassignedDrafts={() =>
        navigate({ to: "/backoffice/proposals/unassigned" })
      }
      onRecordClosing={(proposal, input) =>
        recordClosing({
          buildStartDate: input.buildStartDate,
          loanFacility: {
            interestAnnualBps: 925,
            principalCents: proposal.lenderDrawPolicyLimitCents ?? 0,
          },
          proposalId: (proposal.proposalId ??
            proposal.id) as Id<"buildProposals">,
          reason: input.reason,
          workosOrganizationId,
        })
      }
      onStartNewBuildWorkflow={() =>
        navigate({ to: "/backoffice/proposals/new" })
      }
    />
  );
}

export function BackofficeDashboard({
  builders,
  dashboard,
  onAssignBuilder,
  onDeleteDraft,
  onOpenUnassignedDrafts,
  onStartNewBuildWorkflow,
  onRecordClosing,
}: {
  builders: ProductionBuilderOption[];
  dashboard: ProductionBackofficeDashboardData;
  onAssignBuilder: (
    proposal: ProposalKanbanCard,
    builderProfileId: string
  ) => Promise<unknown>;
  onDeleteDraft: (proposal: ProposalKanbanCard) => Promise<unknown>;
  onOpenUnassignedDrafts: () => Promise<unknown> | unknown;
  onStartNewBuildWorkflow: () => Promise<unknown> | unknown;
  onRecordClosing: (
    proposal: ProposalKanbanCard,
    input: ClosingConfirmationInput
  ) => Promise<unknown>;
}) {
  const [sidebarProposal, setSidebarProposal] =
    useState<ProposalKanbanCard | null>(null);
  const [closingProposal, setClosingProposal] =
    useState<ProposalKanbanCard | null>(null);
  const [closingPending, setClosingPending] = useState(false);
  const [scheduleCalendarCollapsed, setScheduleCalendarCollapsed] =
    useState(false);

  const handleConfirmClosing = async (input: ClosingConfirmationInput) => {
    if (!closingProposal) {
      return;
    }
    setClosingPending(true);
    try {
      await onRecordClosing(closingProposal, input);
      toast.success("Closing recorded.");
      setClosingProposal(null);
      setSidebarProposal(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to record closing."
      );
    } finally {
      setClosingPending(false);
    }
  };

  return (
    <>
      <main
        className={cn(
          "grid min-h-[calc(100vh-4rem)] gap-4 bg-muted/30 p-4",
          scheduleCalendarCollapsed
            ? "lg:grid-cols-[minmax(0,1fr)_2.75rem]"
            : "lg:grid-cols-[minmax(0,1fr)_20rem]"
        )}
        data-schedule-calendar-collapsed={scheduleCalendarCollapsed}
        data-testid="backoffice-dashboard-grid"
      >
        <section className="flex min-w-0 flex-col gap-4">
          <DashboardToolbar />
          <MetricGrid dashboard={dashboard} />
          <ActiveBuildsCard
            builds={dashboard.activeBuilds}
            onOpenUnassignedDrafts={onOpenUnassignedDrafts}
            onStartNewBuildWorkflow={onStartNewBuildWorkflow}
          />
          <SubmittedProposalsCard
            approvedPendingClosing={dashboard.approvedPendingClosing}
            onOpenProposal={setSidebarProposal}
            onRecordClosing={setClosingProposal}
            submittedProposals={dashboard.submittedProposals}
          />
          <MilestoneKanban
            columns={dashboard.milestoneColumns}
            milestones={dashboard.milestones}
          />
          <ProposalKanban
            builders={builders}
            columns={dashboard.proposalColumns}
            onAssignBuilder={onAssignBuilder}
            onDeleteDraft={onDeleteDraft}
            onOpenApprovedProposal={setSidebarProposal}
            onRecordClosing={setClosingProposal}
            proposals={dashboard.proposals}
          />
        </section>
        <ScheduleRail
          collapsed={scheduleCalendarCollapsed}
          date={dashboard.scheduleDate}
          events={dashboard.scheduleEvents}
          onCollapsedChange={setScheduleCalendarCollapsed}
          quickActions={dashboard.quickActions}
        />
      </main>
      <ApprovedProposalSidebar
        onOpenChange={(open) => {
          if (!open) {
            setSidebarProposal(null);
          }
        }}
        onRecordClosing={setClosingProposal}
        proposal={sidebarProposal}
      />
      <ClosingConfirmationDialog
        onConfirm={handleConfirmClosing}
        onOpenChange={(open) => {
          if (!(open || closingPending)) {
            setClosingProposal(null);
          }
        }}
        open={closingProposal !== null}
        pending={closingPending}
        proposal={closingProposal}
      />
    </>
  );
}

function DashboardToolbar() {
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
            Production Convex tables
          </span>
          <Badge variant="success">Live</Badge>
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
  build: ActiveBuild
) {
  navigate({
    params: { buildId: build.buildKey },
    search: BACKOFFICE_BUILD_WORKSPACE_SEARCH,
    to: "/backoffice/builds/$buildId",
  });
}

export function ActiveBuildsCard({
  builds,
  onOpenUnassignedDrafts,
  onStartNewBuildWorkflow,
}: {
  builds: ActiveBuild[];
  onOpenUnassignedDrafts: () => Promise<unknown> | unknown;
  onStartNewBuildWorkflow: () => Promise<unknown> | unknown;
}) {
  const navigate = useNavigate();
  const [newBuildPending, setNewBuildPending] = useState(false);
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
    <>
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
            <Button
              className="shrink-0"
              onClick={async () => {
                try {
                  await onOpenUnassignedDrafts();
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Unable to open unassigned drafts."
                  );
                }
              }}
              variant="outline"
            >
              <FileText />
              Unassigned drafts
            </Button>
            <Button
              className="shrink-0"
              loading={newBuildPending}
              onClick={async () => {
                setNewBuildPending(true);
                try {
                  await onStartNewBuildWorkflow();
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Unable to start new build workflow."
                  );
                } finally {
                  setNewBuildPending(false);
                }
              }}
            >
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
                      className={cn(
                        cell.column.id === "actions" && "text-right"
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
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

export function SubmittedProposalsCard({
  approvedPendingClosing,
  onOpenProposal,
  onRecordClosing,
  submittedProposals,
}: {
  approvedPendingClosing: ProposalKanbanCard[];
  onOpenProposal: (proposal: ProposalKanbanCard) => void;
  onRecordClosing: (proposal: ProposalKanbanCard) => void;
  submittedProposals: ProposalKanbanCard[];
}) {
  const navigate = useNavigate();
  const reviewCount = submittedProposals.length;
  const closingCount = approvedPendingClosing.length;

  return (
    <Card id="submitted-proposals">
      <CardHeader className="gap-3 border-b p-4">
        <CardTitle className="text-base">Submitted Proposals</CardTitle>
        <CardDescription>
          Lender-admin review queue and approved proposals pending closing
        </CardDescription>
        <CardAction className="row-span-1">
          <Badge variant={reviewCount + closingCount ? "warning" : "outline"}>
            {reviewCount} submitted · {closingCount} closing
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-0 p-0">
        <ProposalQueueTable
          emptyLabel="No submitted proposals are waiting for admin approval."
          onPrimaryAction={(proposal) => {
            navigate({
              params: { planId: proposal.proposalId ?? proposal.id },
              to: "/backoffice/proposals/$planId",
            });
          }}
          primaryActionLabel="Review"
          proposals={submittedProposals}
          title="Submitted for lender review"
        />
        <ProposalQueueTable
          emptyLabel="No approved proposals are pending closing."
          onOpenProposal={onOpenProposal}
          onPrimaryAction={onOpenProposal}
          onRecordClosing={onRecordClosing}
          primaryActionLabel="Details"
          proposals={approvedPendingClosing}
          title="Approved, pending closing"
        />
      </CardContent>
    </Card>
  );
}

function ProposalQueueTable({
  emptyLabel,
  onOpenProposal,
  onPrimaryAction,
  onRecordClosing,
  primaryActionLabel,
  proposals,
  title,
}: {
  emptyLabel: string;
  onOpenProposal?: (proposal: ProposalKanbanCard) => void;
  onPrimaryAction: (proposal: ProposalKanbanCard) => void;
  onRecordClosing?: (proposal: ProposalKanbanCard) => void;
  primaryActionLabel: string;
  proposals: ProposalKanbanCard[];
  title: string;
}) {
  return (
    <section className="border-b last:border-b-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h3 className="font-medium text-sm">{title}</h3>
        <Badge variant="outline">{proposals.length}</Badge>
      </div>
      {proposals.length ? (
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
            {proposals.map((proposal) => {
              const row = (
                <TableRow
                  className={cn(onOpenProposal && "cursor-pointer")}
                  key={proposal.id}
                  onClick={() => onOpenProposal?.(proposal)}
                >
                  <TableCell>
                    <div className="font-medium">{proposal.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {proposal.builder}
                    </div>
                  </TableCell>
                  <TableCell>{proposal.address}</TableCell>
                  <TableCell>{proposal.loanAmount}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        proposal.column === "approved" ? "success" : "warning"
                      }
                    >
                      {proposal.statusLabel ?? "Submitted"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        onClick={(event) => {
                          event.stopPropagation();
                          onPrimaryAction(proposal);
                        }}
                        size="sm"
                        variant="outline"
                      >
                        {primaryActionLabel}
                      </Button>
                      {proposal.column === "approved" && onRecordClosing ? (
                        <Button
                          onClick={(event) => {
                            event.stopPropagation();
                            onRecordClosing(proposal);
                          }}
                          size="sm"
                        >
                          Record closing
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );

              return proposal.column === "approved" && onRecordClosing ? (
                <ApprovedProposalContextMenu
                  key={proposal.id}
                  onOpenProposal={onOpenProposal}
                  onRecordClosing={onRecordClosing}
                  proposal={proposal}
                >
                  {row}
                </ApprovedProposalContextMenu>
              ) : (
                row
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <div className="px-4 pb-4 text-muted-foreground text-sm">
          {emptyLabel}
        </div>
      )}
    </section>
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
      <Card id="milestones-kanban">
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

export function ProposalKanban({
  builders,
  columns,
  onAssignBuilder,
  onDeleteDraft,
  onOpenApprovedProposal,
  onRecordClosing,
  proposals,
}: {
  builders: ProductionBuilderOption[];
  columns: DashboardKanbanColumn[];
  onAssignBuilder: (
    proposal: ProposalKanbanCard,
    builderProfileId: string
  ) => Promise<unknown>;
  onDeleteDraft: (proposal: ProposalKanbanCard) => Promise<unknown>;
  onOpenApprovedProposal: (proposal: ProposalKanbanCard) => void;
  onRecordClosing: (proposal: ProposalKanbanCard) => void;
  proposals: ProposalKanbanCard[];
}) {
  const [assignTarget, setAssignTarget] = useState<ProposalKanbanCard | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<ProposalKanbanCard | null>(
    null
  );
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
      <Card id="proposals-kanban">
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
                        onAssignRequest={() => setAssignTarget(card)}
                        onDeleteRequest={() => setDeleteTarget(card)}
                        onOpenApprovedProposal={onOpenApprovedProposal}
                        onRecordClosing={onRecordClosing}
                        onSelect={(selected) => {
                          if (selected.column === "approved") {
                            onOpenApprovedProposal(selected);
                            return;
                          }
                          if (
                            selected.href?.startsWith("/backoffice/proposals/")
                          ) {
                            navigate({
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
      <AssignBuilderDialog
        builders={builders}
        card={assignTarget}
        onAssign={onAssignBuilder}
        onOpenChange={(open) => {
          if (!open) {
            setAssignTarget(null);
          }
        }}
      />
      <DeleteDraftDialog
        card={deleteTarget}
        onDelete={onDeleteDraft}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      />
    </>
  );
}

function isUnassignedProposalBuilder(builder: string | undefined) {
  if (!builder) {
    return true;
  }
  const normalized = builder.trim().toLowerCase();
  return normalized === "" || normalized === "unassigned builder";
}

function ProposalCard({
  card,
  onAssignRequest,
  onDeleteRequest,
  onOpenApprovedProposal,
  onRecordClosing,
  onSelect,
}: {
  card: ProposalKanbanCard;
  onAssignRequest: () => void;
  onDeleteRequest: () => void;
  onOpenApprovedProposal: (card: ProposalKanbanCard) => void;
  onRecordClosing: (card: ProposalKanbanCard) => void;
  onSelect: (card: ProposalKanbanCard) => void;
}) {
  const isDraft = card.column === "draft";
  const assigned =
    card.builderAssigned ?? !isUnassignedProposalBuilder(card.builder);
  const body = (
    <KanbanCard {...card} className="gap-3 p-3">
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
            {assigned ? (
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
                <UserRound aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">{card.builder}</span>
              </span>
            ) : (
              <span
                className="mt-0.5 flex min-w-0 items-center gap-1.5 text-warning text-xs"
                data-testid="proposal-card-unassigned"
              >
                <UserRoundX aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate font-medium">Unassigned</span>
              </span>
            )}
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
          {card.ltv ? (
            <span className="text-muted-foreground">{card.ltv}% LTV</span>
          ) : (
            <span className="text-muted-foreground">Production proposal</span>
          )}
        </div>
      </button>
    </KanbanCard>
  );

  return (
    <ProposalContextMenu
      onAssignRequest={onAssignRequest}
      onDeleteRequest={onDeleteRequest}
      onOpen={() =>
        card.column === "approved"
          ? onOpenApprovedProposal(card)
          : onSelect(card)
      }
      onRecordClosing={() => onRecordClosing(card)}
      proposal={card}
      showAssign={isDraft && !assigned}
      showDelete={isDraft}
      showRecordClosing={card.column === "approved"}
    >
      {body}
    </ProposalContextMenu>
  );
}

function ProposalContextMenu({
  children,
  onAssignRequest,
  onDeleteRequest,
  onOpen,
  onRecordClosing,
  proposal,
  showAssign,
  showDelete,
  showRecordClosing,
}: {
  children: ReactElement;
  onAssignRequest: () => void;
  onDeleteRequest: () => void;
  onOpen: () => void;
  onRecordClosing: () => void;
  proposal: ProposalKanbanCard;
  showAssign: boolean;
  showDelete: boolean;
  showRecordClosing: boolean;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuGroup>
          <ContextMenuLabel className="truncate">
            {proposal.name}
          </ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onOpen}>
            <FileText aria-hidden />
            Open
          </ContextMenuItem>
          {showAssign ? (
            <ContextMenuItem onClick={onAssignRequest}>
              <UserPlus aria-hidden />
              Assign builder
            </ContextMenuItem>
          ) : null}
          {showRecordClosing ? (
            <ContextMenuItem onClick={onRecordClosing}>
              <ClipboardCheck aria-hidden />
              Record closing
            </ContextMenuItem>
          ) : null}
          {showDelete ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={onDeleteRequest} variant="destructive">
                <Trash2 aria-hidden />
                Delete draft
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function AssignBuilderDialog({
  builders,
  card,
  onAssign,
  onOpenChange,
}: {
  builders: ProductionBuilderOption[];
  card: ProposalKanbanCard | null;
  onAssign: (
    proposal: ProposalKanbanCard,
    builderProfileId: string
  ) => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardKey = card?.proposalId ?? card?.id ?? null;

  useEffect(() => {
    setSelected(null);
    setError(null);
    setPending(false);
  }, [cardKey]);

  async function handleAssign() {
    if (!(card && selected)) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onAssign(card, selected);
      onOpenChange(false);
    } catch (assignError) {
      setError(
        assignError instanceof Error
          ? assignError.message
          : "Could not assign builder."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={card !== null}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign builder</DialogTitle>
          <DialogDescription>
            {card
              ? `Assign a builder to "${card.name}". This is only available while the proposal is an unassigned draft.`
              : null}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {builders.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No active builders are available in this brokerage yet.
            </p>
          ) : (
            <Select
              onValueChange={(value) => setSelected(value as string)}
              value={selected ?? undefined}
            >
              <SelectTrigger data-testid="assign-builder-select">
                <SelectValue placeholder="Select a builder" />
              </SelectTrigger>
              <SelectContent>
                {builders.map((builder) => (
                  <SelectItem key={builder._id} value={builder._id}>
                    {builder.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {error ? (
            <p className="mt-2 text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button
            data-testid="assign-builder-confirm"
            disabled={!selected}
            loading={pending}
            onClick={handleAssign}
          >
            Assign builder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDraftDialog({
  card,
  onDelete,
  onOpenChange,
}: {
  card: ProposalKanbanCard | null;
  onDelete: (proposal: ProposalKanbanCard) => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardKey = card?.proposalId ?? card?.id ?? null;

  useEffect(() => {
    setError(null);
    setPending(false);
  }, [cardKey]);

  async function handleDelete() {
    if (!card) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onDelete(card);
      onOpenChange(false);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete draft."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={card !== null}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete draft proposal</AlertDialogTitle>
          <AlertDialogDescription>
            {card
              ? `"${card.name}" and its draft plan will be permanently removed. This cannot be undone.`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="px-6 text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogClose
            render={<Button variant="outline">Cancel</Button>}
          />
          <Button
            data-testid="delete-draft-confirm"
            loading={pending}
            onClick={handleDelete}
            variant="destructive"
          >
            Delete draft
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ApprovedProposalContextMenu({
  children,
  onOpenProposal,
  onRecordClosing,
  proposal,
}: {
  children: ReactElement;
  onOpenProposal?: (proposal: ProposalKanbanCard) => void;
  onRecordClosing: (proposal: ProposalKanbanCard) => void;
  proposal: ProposalKanbanCard;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="w-56">
        <ContextMenuGroup>
          <ContextMenuLabel>Approved proposal</ContextMenuLabel>
          {onOpenProposal ? (
            <ContextMenuItem onClick={() => onOpenProposal(proposal)}>
              Open sidebar
            </ContextMenuItem>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onRecordClosing(proposal)}>
            Record closing
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function ApprovedProposalSidebar({
  onOpenChange,
  onRecordClosing,
  proposal,
}: {
  onOpenChange: (open: boolean) => void;
  onRecordClosing: (proposal: ProposalKanbanCard) => void;
  proposal: ProposalKanbanCard | null;
}) {
  const navigate = useNavigate();

  return (
    <Sheet onOpenChange={onOpenChange} open={proposal !== null}>
      <SheetContent className="w-full min-w-0 sm:max-w-lg">
        {proposal ? (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="pr-8">{proposal.name}</SheetTitle>
              <SheetDescription>
                Approved Build Proposal pending loan closing
              </SheetDescription>
            </SheetHeader>
            <SheetPanel>
              <div className="grid gap-4 text-sm">
                <div className="grid gap-1">
                  <span className="text-muted-foreground">Builder</span>
                  <span className="font-medium">{proposal.builder}</span>
                </div>
                <div className="grid gap-1">
                  <span className="text-muted-foreground">Location</span>
                  <span className="font-medium">{proposal.address}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Card className="rounded-lg shadow-none before:hidden">
                    <CardContent className="p-3">
                      <div className="text-muted-foreground text-xs">
                        Total budget
                      </div>
                      <div className="font-semibold">{proposal.loanAmount}</div>
                    </CardContent>
                  </Card>
                  <Card className="rounded-lg shadow-none before:hidden">
                    <CardContent className="p-3">
                      <div className="text-muted-foreground text-xs">
                        Lender Draw Policy Limit
                      </div>
                      <div className="font-semibold">
                        {centsToCurrency(
                          proposal.lenderDrawPolicyLimitCents ?? 0
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <Card className="rounded-lg shadow-none before:hidden">
                  <CardContent className="grid gap-2 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant="success">
                        {proposal.statusLabel ?? "Approved - pending closing"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Submitted</span>
                      <span>{formatTimestamp(proposal.submittedAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Approved</span>
                      <span>{formatTimestamp(proposal.approvedAt)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </SheetPanel>
            <SheetFooter>
              <SheetClose render={<Button variant="outline" />}>
                Close
              </SheetClose>
              <Button
                onClick={() => {
                  navigate({
                    params: { planId: proposal.proposalId ?? proposal.id },
                    to: "/backoffice/proposals/$planId",
                  });
                }}
                variant="outline"
              >
                Open review
              </Button>
              <Button onClick={() => onRecordClosing(proposal)}>
                Record closing
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function ClosingConfirmationDialog({
  onConfirm,
  onOpenChange,
  open,
  pending,
  proposal,
}: {
  onConfirm: (input: ClosingConfirmationInput) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
  proposal: ProposalKanbanCard | null;
}) {
  const [buildStartDate, setBuildStartDate] = useState(todayInputDate());
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setBuildStartDate(todayInputDate());
      setReason("");
    }
  }, [open]);

  const canSubmit =
    buildStartDate.trim().length > 0 && reason.trim().length > 0 && !pending;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) {
              onConfirm({
                buildStartDate: buildStartDate.trim(),
                reason: reason.trim(),
              });
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Record loan closing</DialogTitle>
            <DialogDescription>
              This creates the production active Build and copies proposal
              milestones and planned reimbursement draws.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="grid gap-4">
              <Card className="rounded-lg bg-muted/30 shadow-none before:hidden">
                <CardContent className="p-3 text-sm">
                  <div className="font-medium">
                    {proposal?.name ?? "Approved proposal"}
                  </div>
                  <div className="text-muted-foreground">
                    Principal:{" "}
                    {centsToCurrency(proposal?.lenderDrawPolicyLimitCents ?? 0)}{" "}
                    · Interest starts on funds released
                  </div>
                </CardContent>
              </Card>
              <label className="grid gap-2 text-sm" htmlFor="build-start-date">
                <span className="font-medium">Build start date</span>
                <Input
                  id="build-start-date"
                  onChange={(event) => setBuildStartDate(event.target.value)}
                  required
                  type="date"
                  value={buildStartDate}
                />
              </label>
              <label className="grid gap-2 text-sm" htmlFor="closing-reason">
                <span className="font-medium">Audit reason</span>
                <Textarea
                  id="closing-reason"
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Confirm the offline loan closing and any closing notes."
                  required
                  value={reason}
                />
              </label>
            </div>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button disabled={!canSubmit} type="submit">
              {pending ? <Loader2 className="animate-spin" /> : null}
              Confirm closing
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ScheduleRail({
  collapsed,
  date,
  events,
  onCollapsedChange,
  quickActions,
}: {
  collapsed: boolean;
  date: Date;
  events: ScheduleEvent[];
  onCollapsedChange: (collapsed: boolean) => void;
  quickActions: QuickAction[];
}) {
  const eventDays = useMemo(
    () => events.map((event) => new Date(event.date)),
    [events]
  );

  if (collapsed) {
    return (
      <aside
        className="flex min-w-0 flex-col items-center gap-2"
        data-testid="backoffice-schedule-rail-collapsed"
      >
        <Button
          aria-label="Expand schedule calendar"
          className="relative size-11 shrink-0"
          data-testid="backoffice-schedule-calendar-expand"
          onClick={() => onCollapsedChange(false)}
          size="icon"
          title="Show schedule"
          variant="outline"
        >
          <CalendarDays className="size-5" />
          {quickActions.length > 0 ? (
            <Badge
              className="absolute -top-1 -right-1 min-w-5 px-1 text-[10px]"
              variant="warning"
            >
              {quickActions.length}
            </Badge>
          ) : null}
        </Button>
      </aside>
    );
  }

  return (
    <aside
      className="flex min-w-0 flex-col gap-4"
      data-testid="backoffice-schedule-rail-expanded"
    >
      <Card>
        <CardHeader className="border-b p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base">Schedule</CardTitle>
              <CardDescription>{formatMonthYear(date)}</CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                aria-label="Collapse schedule calendar"
                data-testid="backoffice-schedule-calendar-collapse"
                onClick={() => onCollapsedChange(true)}
                size="icon-sm"
                title="Collapse schedule"
                variant="ghost"
              >
                <PanelRightClose className="size-4" />
              </Button>
              <CalendarClock className="size-5 text-muted-foreground" />
            </div>
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

function todayInputDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatTimestamp(value: number | undefined) {
  if (!value) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
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
