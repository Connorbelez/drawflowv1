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
  CircleAlert,
  ClipboardCheck,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  PanelRightClose,
  Plus,
  Search,
  Trash2,
  UserPlus,
  UserRound,
  UserRoundX,
} from "lucide-react";
import {
  type FormEvent,
  type ReactElement,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

import {
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from "#/features/backoffice-dashboard/readonly-kanban.tsx";
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
import { MILESTONE_KANBAN_COLUMNS } from "#/features/backoffice-dashboard/mock-data.ts";
import type {
  ActiveBuild,
  BackofficeDashboardData,
  DashboardKanbanColumn,
  DashboardMetric,
  MilestoneKanbanCard,
  OperationsHandoffReturnDecision,
  ProposalKanbanCard,
  QuickAction,
  ScheduleEvent,
} from "#/features/backoffice-dashboard/mock-data.ts";
import { BuildIdentityCell } from "#/features/builds/BuildIdentityCell.tsx";
import {
  ProposalDirectoryControls,
  type ProposalDirectoryFilterOptions,
  useBackofficeProposalDirectory,
} from "#/features/production-proposals/ProposalDirectoryControls.tsx";
import {
  type ClosingConfirmationInput,
  ProposalActivationDialog,
  ProposalClosingDialog,
} from "#/features/production-proposals/ProposalLifecycleDialogs.tsx";
export type { ClosingConfirmationInput } from "#/features/production-proposals/ProposalLifecycleDialogs.tsx";
import type { ProductionKanbanCard } from "#/features/production-proposals/ProductionProposalSurfaces.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/backoffice/")({
  ssr: false,
  loader: ({ context }) => {
    if (!context.organizationId) {
      throw new Error("Backoffice route requires an active organization.");
    }
    // Do not prefetch authenticated Convex queries here. ensureQueryData /
    // useSuspenseQuery throw Unauthorized into the route match during the
    // brief client auth-token race; sibling backoffice routes use useQuery
    // and wait for data in-component instead.
    return { asOfDate: new Date().toISOString().slice(0, 10) };
  },
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
  build: CircleAlert,
  drawRequest: FileText,
  milestone: CheckCircle2,
  proposal: FileText,
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

export interface OperationsEscalationInput {
  decisionPreview: string;
  evidenceSummary: string;
  reason: string;
  recommendation: string;
  requiredAction: string;
  warnings: string[];
}

export interface OperationsReturnDecisionInput {
  decision: OperationsHandoffReturnDecision;
  followUpAssignment: string;
  reason: string;
}

export interface ProductionBuilderOption {
  _id: string;
  displayName: string;
  email?: string;
  workosUserIds?: string[];
}

export function ClosingConfirmationDialog({
  proposal,
  ...props
}: {
  onConfirm: (input: ClosingConfirmationInput) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
  proposal: ProposalKanbanCard | null;
}) {
  return (
    <ProposalClosingDialog
      {...props}
      proposal={
        proposal
          ? {
              buildName: proposal.name,
              interestAnnualBps: proposal.interestAnnualBps,
            }
          : null
      }
    />
  );
}

export function createBackofficeDashboardLifecycleHandlers({
  activateClosedProposal,
  navigateToBuild,
  recordClosing,
  workosOrganizationId,
}: {
  activateClosedProposal: (input: {
    proposalId: Id<"buildProposals">;
    reason: string;
    workosOrganizationId: string;
  }) => Promise<{ buildId: Id<"activeBuilds"> }>;
  navigateToBuild: (buildId: string) => Promise<void> | void;
  recordClosing: (input: {
    buildStartDate: string;
    ianaTimezone: string;
    loanFacility: {
      interestAnnualBps: number;
      principalCents: number;
    };
    proposalId: Id<"buildProposals">;
    reason: string;
    workosOrganizationId: string;
  }) => Promise<unknown>;
  workosOrganizationId: string;
}) {
  return {
    onActivateClosedProposal: async (
      proposal: ProposalKanbanCard,
      reason: string
    ) => {
      const proposalId = (proposal.proposalId ??
        proposal.id) as Id<"buildProposals">;
      const result = await activateClosedProposal({
        proposalId,
        reason,
        workosOrganizationId,
      });
      await navigateToBuild(String(result.buildId));
    },
    onRecordClosing: async (
      proposal: ProposalKanbanCard,
      input: ClosingConfirmationInput
    ) => {
      const proposalId = (proposal.proposalId ??
        proposal.id) as Id<"buildProposals">;
      await recordClosing({
        buildStartDate: input.buildStartDate,
        ianaTimezone: input.ianaTimezone,
        loanFacility: {
          interestAnnualBps: input.interestAnnualBps,
          principalCents: input.principalCents,
        },
        proposalId,
        reason: input.reason,
        workosOrganizationId,
      });
    },
  };
}

export function normalizeProductionBackofficeDashboard(
  result: ProductionDashboardQueryResult
): ProductionBackofficeDashboardData {
  const milestoneColumnsById = new Map(
    result.milestoneColumns.map((column) => [column.id, column])
  );
  const canonicalMilestoneColumnIds = new Set(
    MILESTONE_KANBAN_COLUMNS.map((column) => column.id)
  );
  const milestoneColumns = [
    ...MILESTONE_KANBAN_COLUMNS.map((column) => ({
      ...column,
      ...milestoneColumnsById.get(column.id),
    })),
    ...result.milestoneColumns.filter(
      (column) => !canonicalMilestoneColumnIds.has(column.id)
    ),
  ];

  return {
    ...result,
    approvedPendingClosing: result.approvedPendingClosing ?? [],
    milestoneColumns,
    scheduleDate: new Date(result.scheduleDate),
    submittedProposals: result.submittedProposals ?? [],
  };
}

function dashboardProposalDirectoryCard(
  card: ProductionKanbanCard
): ProposalKanbanCard {
  return {
    activeBuildId: card.activeBuildId,
    address: card.location ?? card.subtitle ?? "Location unavailable",
    approvedAt: card.approvedAt,
    borrowerStartingCashCents: card.borrowerStartingCashCents,
    builder: card.builderName ?? "Unassigned builder",
    builderAssigned: card.builderAssigned,
    builderEmail: card.builderEmail,
    builderProfileId: card.builderProfileId,
    closeLabel:
      card.column === "approved" && !card.activeBuildId
        ? "Pending closing"
        : card.column === "closed" && !card.activeBuildId
          ? "Pending activation"
          : undefined,
    column: card.column,
    createdAt: card.createdAt,
    href: card.href,
    interestAnnualBps: card.interestAnnualBps,
    id: card.proposalId,
    lenderDrawPolicyLimitCents: card.lenderDrawPolicyLimitCents,
    loanAmount: centsToCurrency(card.totalBudgetCents),
    ltv: 0,
    name: card.title,
    proposalId: card.proposalId,
    reviewOutcome: card.reviewOutcome,
    statusLabel: card.statusLabel,
    submittedAt: card.submittedAt,
    tag: "production",
    totalBudgetCents: card.totalBudgetCents,
    updatedAt: card.updatedAt,
  };
}

function RouteComponent() {
  const context = Route.useRouteContext();
  const { asOfDate } = Route.useLoaderData();
  const workosOrganizationId = context.organizationId as string;
  const dashboardResult = useQuery(
    api.production_proposals.getBackofficeDashboard,
    workosOrganizationId ? { asOfDate, workosOrganizationId } : "skip"
  );
  const buildersResult = useQuery(
    api.production_proposals.listBackofficeProposalFilterOptions,
    workosOrganizationId ? { workosOrganizationId } : "skip"
  );
  const recordClosing = useMutation(
    api.production_proposals.recordProposalClosing
  );
  const activateClosedProposal = useMutation(
    api.production_proposals.activateClosedProposal
  );
  const assignBuilder = useMutation(
    api.production_proposals.assignDraftBuilder
  );
  const deleteDraft = useMutation(api.production_proposals.deleteDraftProposal);
  const deleteActiveBuild = useMutation(
    api.production_proposals.deleteActiveBuild
  );
  const archiveProposal = useMutation(api.production_proposals.rejectProposal);
  const escalateOperationsQueueItem = useMutation(
    api.production_proposals.escalateOperationsQueueItem
  );
  const returnOperationsEscalationDecision = useMutation(
    api.production_proposals.returnOperationsEscalationDecision
  );
  const acknowledgeOperationsEscalationReturn = useMutation(
    api.production_proposals.acknowledgeOperationsEscalationReturn
  );
  const proposalDirectory =
    useBackofficeProposalDirectory(workosOrganizationId);
  const navigate = useNavigate();
  const lifecycleHandlers = createBackofficeDashboardLifecycleHandlers({
    activateClosedProposal,
    navigateToBuild: (buildId) =>
      navigate({
        params: { buildId },
        to: "/backoffice/builds/$buildId",
      }),
    recordClosing,
    workosOrganizationId,
  });

  const dashboard = useMemo(
    () =>
      dashboardResult
        ? normalizeProductionBackofficeDashboard(dashboardResult)
        : null,
    [dashboardResult]
  );

  if (!(dashboard && buildersResult)) {
    return (
      <main
        className="grid min-h-[calc(100vh-4rem)] gap-4 bg-muted/30 p-4 lg:grid-cols-[minmax(0,1fr)_20rem]"
        data-testid="backoffice-dashboard-grid"
      >
        <section className="flex min-w-0 flex-col gap-4">
          <DashboardToolbar />
          <Frame>
            <FramePanel className="flex min-h-[8rem] items-center justify-center gap-2 p-6 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading lender operations dashboard…
            </FramePanel>
          </Frame>
          <Frame>
            <FramePanel className="min-h-[12rem] animate-pulse bg-muted/40" />
          </Frame>
          <Frame>
            <FramePanel className="min-h-[16rem] animate-pulse bg-muted/40" />
          </Frame>
        </section>
        <Frame className="hidden lg:block">
          <FramePanel className="min-h-[24rem] animate-pulse bg-muted/40" />
        </Frame>
      </main>
    );
  }

  return (
    <BackofficeDashboard
      builders={buildersResult.builders ?? []}
      dashboard={dashboard}
      onAcknowledgeHandoff={(handoffId) =>
        acknowledgeOperationsEscalationReturn({
          handoffId: handoffId as Id<"operationsQueueHandoffs">,
          workosOrganizationId,
        })
      }
      onActivateClosedProposal={lifecycleHandlers.onActivateClosedProposal}
      onArchiveProposal={(proposal, reason) =>
        archiveProposal({
          proposalId: (proposal.proposalId ??
            proposal.id) as Id<"buildProposals">,
          reason,
          workosOrganizationId,
        })
      }
      onAssignBuilder={(proposal, builderProfileId) =>
        assignBuilder({
          builderProfileId: builderProfileId as Id<"builderProfiles">,
          proposalId: (proposal.proposalId ??
            proposal.id) as Id<"buildProposals">,
          workosOrganizationId,
        })
      }
      onDeleteActiveBuild={(build, reason) =>
        deleteActiveBuild({
          buildId: build.buildKey as Id<"activeBuilds">,
          reason,
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
      onEscalate={(action, input) =>
        escalateOperationsQueueItem({
          ...input,
          queueItemId: action.id,
          workosOrganizationId,
        })
      }
      onOpenUnassignedDrafts={() =>
        navigate({ to: "/backoffice/proposals/unassigned" })
      }
      onRecordClosing={lifecycleHandlers.onRecordClosing}
      onReturnDecision={(handoffId, input) =>
        returnOperationsEscalationDecision({
          ...input,
          handoffId: handoffId as Id<"operationsQueueHandoffs">,
          workosOrganizationId,
        })
      }
      onStartNewBuildWorkflow={() =>
        navigate({ to: "/backoffice/proposals/new" })
      }
      proposalDirectory={proposalDirectory}
      proposalFilterOptions={buildersResult}
    />
  );
}

export function BackofficeDashboard({
  builders,
  dashboard,
  onActivateClosedProposal,
  onAcknowledgeHandoff,
  onArchiveProposal,
  onAssignBuilder,
  onDeleteActiveBuild,
  onDeleteDraft,
  onEscalate,
  onOpenUnassignedDrafts,
  onStartNewBuildWorkflow,
  onRecordClosing,
  onReturnDecision,
  proposalDirectory,
  proposalFilterOptions,
}: {
  builders: ProductionBuilderOption[];
  dashboard: ProductionBackofficeDashboardData;
  onActivateClosedProposal: (
    proposal: ProposalKanbanCard,
    reason: string
  ) => Promise<unknown>;
  onAcknowledgeHandoff: (handoffId: string) => Promise<unknown>;
  onArchiveProposal: (
    proposal: ProposalKanbanCard,
    reason: string
  ) => Promise<unknown>;
  onAssignBuilder: (
    proposal: ProposalKanbanCard,
    builderProfileId: string
  ) => Promise<unknown>;
  onDeleteActiveBuild: (build: ActiveBuild, reason: string) => Promise<unknown>;
  onDeleteDraft: (proposal: ProposalKanbanCard) => Promise<unknown>;
  onEscalate: (
    action: QuickAction,
    input: OperationsEscalationInput
  ) => Promise<unknown>;
  onOpenUnassignedDrafts: () => Promise<unknown> | unknown;
  onStartNewBuildWorkflow: () => Promise<unknown> | unknown;
  onRecordClosing: (
    proposal: ProposalKanbanCard,
    input: ClosingConfirmationInput
  ) => Promise<unknown>;
  onReturnDecision: (
    handoffId: string,
    input: OperationsReturnDecisionInput
  ) => Promise<unknown>;
  proposalDirectory: ReturnType<typeof useBackofficeProposalDirectory>;
  proposalFilterOptions: ProposalDirectoryFilterOptions;
}) {
  const [sidebarProposal, setSidebarProposal] =
    useState<ProposalKanbanCard | null>(null);
  const [closingProposal, setClosingProposal] =
    useState<ProposalKanbanCard | null>(null);
  const [closingPending, setClosingPending] = useState(false);
  const [activationProposal, setActivationProposal] =
    useState<ProposalKanbanCard | null>(null);
  const [activationPending, setActivationPending] = useState(false);
  const [activationError, setActivationError] = useState<string>();
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

  const handleConfirmActivation = async (reason: string) => {
    if (!activationProposal) {
      return;
    }
    setActivationPending(true);
    setActivationError(undefined);
    try {
      await onActivateClosedProposal(activationProposal, reason);
      toast.success("Build activated.");
      setActivationProposal(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to activate Build.";
      setActivationError(message);
      toast.error(message);
    } finally {
      setActivationPending(false);
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
            onDeleteActiveBuild={onDeleteActiveBuild}
            onOpenUnassignedDrafts={onOpenUnassignedDrafts}
            onStartNewBuildWorkflow={onStartNewBuildWorkflow}
          />
          <SubmittedProposalsCard
            approvedPendingClosing={dashboard.approvedPendingClosing}
            onArchiveProposal={onArchiveProposal}
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
            controls={
              <ProposalDirectoryControls
                activeFilterCount={proposalDirectory.activeFilterCount}
                filters={proposalDirectory.filters}
                loading={proposalDirectory.isLoading}
                onFiltersChange={proposalDirectory.setFilters}
                onReset={proposalDirectory.reset}
                onSearchChange={proposalDirectory.setSearch}
                options={proposalFilterOptions}
                resultCount={proposalDirectory.cards.length}
                search={proposalDirectory.search}
              />
            }
            loadingMore={proposalDirectory.status === "LoadingMore"}
            onActivateClosedProposal={setActivationProposal}
            onArchiveProposal={onArchiveProposal}
            onAssignBuilder={onAssignBuilder}
            onDeleteDraft={onDeleteDraft}
            onLoadMore={
              proposalDirectory.status === "CanLoadMore"
                ? proposalDirectory.loadMore
                : undefined
            }
            onOpenApprovedProposal={setSidebarProposal}
            onRecordClosing={setClosingProposal}
            onStartNewBuildWorkflow={onStartNewBuildWorkflow}
            proposals={proposalDirectory.cards.map(
              dashboardProposalDirectoryCard
            )}
          />
        </section>
        <ScheduleRail
          canMakeFinalDecision={dashboard.canMakeFinalDecision ?? false}
          collapsed={scheduleCalendarCollapsed}
          date={dashboard.scheduleDate}
          events={dashboard.scheduleEvents}
          onAcknowledgeHandoff={onAcknowledgeHandoff}
          onCollapsedChange={setScheduleCalendarCollapsed}
          onEscalate={onEscalate}
          onReturnDecision={onReturnDecision}
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
      <ProposalActivationDialog
        buildName={activationProposal?.name ?? "Closed proposal"}
        error={activationError}
        onConfirm={handleConfirmActivation}
        onOpenChange={(open) => {
          if (!(open || activationPending)) {
            setActivationProposal(null);
            setActivationError(undefined);
          }
        }}
        open={activationProposal !== null}
        pending={activationPending}
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
  onDeleteActiveBuild,
  onOpenUnassignedDrafts,
  onStartNewBuildWorkflow,
}: {
  builds: ActiveBuild[];
  onDeleteActiveBuild: (build: ActiveBuild, reason: string) => Promise<unknown>;
  onOpenUnassignedDrafts: () => Promise<unknown> | unknown;
  onStartNewBuildWorkflow: () => Promise<unknown> | unknown;
}) {
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<ActiveBuild | null>(null);
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
        accessorKey: "buildName",
        header: "Build",
        cell: ({ row }) => (
          <BuildIdentityCell
            buildName={row.original.buildName ?? row.original.id}
            imageUrl={row.original.imageUrl}
            latitude={row.original.locationLatitude}
            location={row.original.address}
            longitude={row.original.locationLongitude}
            metadata={
              <span className="block max-w-56 truncate text-muted-foreground text-xs">
                {row.original.id} · {row.original.address}
              </span>
            }
          />
        ),
      },
      {
        accessorKey: "builder",
        header: "Builder",
      },
      {
        id: "milestonesDraws",
        header: "Milestones / draws",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.milestoneCount ?? 0} / {row.original.drawCount ?? 0}
          </span>
        ),
      },
      {
        id: "openRequests",
        header: "Open requests",
        cell: ({ row }) => {
          const count = row.original.pendingDrawRequestCount ?? 0;
          return count > 0
            ? `${count} ${count === 1 ? "draw" : "draws"}`
            : "None";
        },
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
              {table.getRowModel().rows.map((row) => {
                const buildRow = (
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
                );

                return (
                  <ActiveBuildContextMenu
                    build={row.original}
                    key={row.id}
                    onDeleteRequest={() => setDeleteTarget(row.original)}
                    onOpen={() =>
                      openBackofficeBuildWorkspace(navigate, row.original)
                    }
                  >
                    {buildRow}
                  </ActiveBuildContextMenu>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <DeleteActiveBuildDialog
        build={deleteTarget}
        onDelete={onDeleteActiveBuild}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      />
    </>
  );
}

export function SubmittedProposalsCard({
  approvedPendingClosing,
  onArchiveProposal,
  onOpenProposal,
  onRecordClosing,
  submittedProposals,
}: {
  approvedPendingClosing: ProposalKanbanCard[];
  onArchiveProposal: (
    proposal: ProposalKanbanCard,
    reason: string
  ) => Promise<unknown>;
  onOpenProposal: (proposal: ProposalKanbanCard) => void;
  onRecordClosing: (proposal: ProposalKanbanCard) => void;
  submittedProposals: ProposalKanbanCard[];
}) {
  const navigate = useNavigate();
  const [archiveTarget, setArchiveTarget] = useState<ProposalKanbanCard | null>(
    null
  );
  const reviewCount = submittedProposals.length;
  const closingCount = approvedPendingClosing.length;

  return (
    <>
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
            onArchiveRequest={setArchiveTarget}
            onPrimaryAction={(proposal) => {
              navigate({
                params: { planId: proposal.proposalId ?? proposal.id },
                to: "/backoffice/proposals/$planId",
              });
            }}
            primaryActionLabel="Review"
            proposals={submittedProposals}
            showArchive
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
      <ArchiveProposalDialog
        onArchive={onArchiveProposal}
        onOpenChange={(open) => {
          if (!open) {
            setArchiveTarget(null);
          }
        }}
        proposal={archiveTarget}
      />
    </>
  );
}

function ProposalQueueTable({
  emptyLabel,
  onArchiveRequest,
  onOpenProposal,
  onPrimaryAction,
  onRecordClosing,
  primaryActionLabel,
  proposals,
  showArchive = false,
  title,
}: {
  emptyLabel: string;
  onArchiveRequest?: (proposal: ProposalKanbanCard) => void;
  onOpenProposal?: (proposal: ProposalKanbanCard) => void;
  onPrimaryAction: (proposal: ProposalKanbanCard) => void;
  onRecordClosing?: (proposal: ProposalKanbanCard) => void;
  primaryActionLabel: string;
  proposals: ProposalKanbanCard[];
  showArchive?: boolean;
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
                    {proposal.builderEmail ? (
                      <div className="text-muted-foreground text-xs">
                        {proposal.builderEmail}
                      </div>
                    ) : null}
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

              if (showArchive && onArchiveRequest) {
                return (
                  <SubmittedProposalContextMenu
                    key={proposal.id}
                    onArchiveRequest={() => onArchiveRequest(proposal)}
                    onOpen={() => onPrimaryAction(proposal)}
                    proposal={proposal}
                  >
                    {row}
                  </SubmittedProposalContextMenu>
                );
              }

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

export function MilestoneKanban({
  columns,
  milestones,
}: {
  columns: DashboardKanbanColumn[];
  milestones: MilestoneKanbanCard[];
}) {
  const [activeMilestone, setActiveMilestone] =
    useState<MilestoneKanbanCard | null>(null);
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
            Milestones grouped by build and review state
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
              data={milestones}
            >
              {(column) => (
                <KanbanBoard
                  className={cn(
                    "rounded-none border-0 border-r bg-card shadow-none ring-0 last:border-r-0",
                    column.id === "behindSchedule" && "bg-destructive/5"
                  )}
                  id={column.id}
                  key={column.id}
                >
                  <KanbanHeader
                    className={cn(
                      "space-y-1 border-b p-4",
                      column.id === "behindSchedule" && "bg-destructive/8"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span>{column.name}</span>
                      <Badge variant="outline">
                        {
                          milestones.filter((card) => card.column === column.id)
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
  controls,
  loadingMore = false,
  onActivateClosedProposal,
  onArchiveProposal,
  onAssignBuilder,
  onDeleteDraft,
  onLoadMore,
  onOpenApprovedProposal,
  onRecordClosing,
  onStartNewBuildWorkflow = () => undefined,
  proposals,
}: {
  builders: ProductionBuilderOption[];
  columns: DashboardKanbanColumn[];
  controls?: ReactElement;
  loadingMore?: boolean;
  onActivateClosedProposal?: (proposal: ProposalKanbanCard) => void;
  onArchiveProposal: (
    proposal: ProposalKanbanCard,
    reason: string
  ) => Promise<unknown>;
  onAssignBuilder: (
    proposal: ProposalKanbanCard,
    builderProfileId: string
  ) => Promise<unknown>;
  onDeleteDraft: (proposal: ProposalKanbanCard) => Promise<unknown>;
  onLoadMore?: () => void;
  onOpenApprovedProposal: (proposal: ProposalKanbanCard) => void;
  onRecordClosing: (proposal: ProposalKanbanCard) => void;
  onStartNewBuildWorkflow?: () => Promise<unknown> | unknown;
  proposals: ProposalKanbanCard[];
}) {
  const [assignTarget, setAssignTarget] = useState<ProposalKanbanCard | null>(
    null
  );
  const [archiveTarget, setArchiveTarget] = useState<ProposalKanbanCard | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<ProposalKanbanCard | null>(
    null
  );
  const navigate = useNavigate();
  const [activeProposal, setActiveProposal] =
    useState<ProposalKanbanCard | null>(null);
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
        <CardHeader className="flex flex-col items-stretch gap-3 border-b p-4">
          <div className="flex w-full items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base">Builds - Proposals</CardTitle>
              <CardDescription>Pipeline by stage</CardDescription>
            </div>
            <Button
              className="shrink-0"
              onClick={onStartNewBuildWorkflow}
              variant="outline"
            >
              <Plus />
              Draft new
            </Button>
          </div>
          {controls ? (
            <div className="w-full min-w-0 border-t pt-3">{controls}</div>
          ) : null}
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <ClientOnly fallback={<div className="min-h-96 min-w-4xl" />}>
            <KanbanProvider
              className="min-h-96 min-w-4xl gap-0"
              columns={columns}
              data={proposals}
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
                            proposals.filter(
                              (card) => card.column === column.id
                            ).length
                          }
                        </Badge>
                      </div>
                      {column.id === "draft" ? (
                        <Button
                          aria-label="Draft new proposal"
                          onClick={onStartNewBuildWorkflow}
                          size="icon-xs"
                          variant="ghost"
                        >
                          <Plus />
                        </Button>
                      ) : null}
                    </div>
                  </KanbanHeader>
                  <KanbanCards<ProposalKanbanCard>
                    className="gap-3 p-3"
                    id={column.id}
                  >
                    {(card) => (
                      <ProposalCard
                        card={card}
                        onActivateRequest={
                          onActivateClosedProposal
                            ? () => onActivateClosedProposal(card)
                            : undefined
                        }
                        onArchiveRequest={() => setArchiveTarget(card)}
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
        {onLoadMore ? (
          <div className="flex justify-center border-t p-3">
            <Button
              loading={loadingMore}
              onClick={onLoadMore}
              variant="outline"
            >
              Load more proposals
            </Button>
          </div>
        ) : null}
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
      <ArchiveProposalDialog
        onArchive={onArchiveProposal}
        onOpenChange={(open) => {
          if (!open) {
            setArchiveTarget(null);
          }
        }}
        proposal={archiveTarget}
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
  onActivateRequest,
  onArchiveRequest,
  onAssignRequest,
  onDeleteRequest,
  onOpenApprovedProposal,
  onRecordClosing,
  onSelect,
}: {
  card: ProposalKanbanCard;
  onActivateRequest?: () => void;
  onArchiveRequest: () => void;
  onAssignRequest: () => void;
  onDeleteRequest: () => void;
  onOpenApprovedProposal: (card: ProposalKanbanCard) => void;
  onRecordClosing: (card: ProposalKanbanCard) => void;
  onSelect: (card: ProposalKanbanCard) => void;
}) {
  const isDraft = card.column === "draft";
  const isSubmitted = card.column === "submitted";
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
                <span className="grid min-w-0">
                  <span className="truncate">{card.builder}</span>
                  {card.builderEmail ? (
                    <span className="truncate text-muted-foreground">
                      {card.builderEmail}
                    </span>
                  ) : null}
                </span>
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
      onActivateRequest={onActivateRequest}
      onArchiveRequest={onArchiveRequest}
      onAssignRequest={onAssignRequest}
      onDeleteRequest={onDeleteRequest}
      onOpen={() =>
        card.column === "approved"
          ? onOpenApprovedProposal(card)
          : onSelect(card)
      }
      onRecordClosing={() => onRecordClosing(card)}
      proposal={card}
      showActivate={
        card.column === "closed" &&
        !card.activeBuildId &&
        Boolean(onActivateRequest)
      }
      showArchive={isSubmitted}
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
  onActivateRequest,
  onArchiveRequest,
  onAssignRequest,
  onDeleteRequest,
  onOpen,
  onRecordClosing,
  proposal,
  showArchive,
  showActivate,
  showAssign,
  showDelete,
  showRecordClosing,
}: {
  children: ReactElement;
  onActivateRequest?: () => void;
  onArchiveRequest: () => void;
  onAssignRequest: () => void;
  onDeleteRequest: () => void;
  onOpen: () => void;
  onRecordClosing: () => void;
  proposal: ProposalKanbanCard;
  showArchive: boolean;
  showActivate: boolean;
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
          {showActivate ? (
            <ContextMenuItem onClick={onActivateRequest}>
              <CheckCircle2 aria-hidden />
              Activate Build
            </ContextMenuItem>
          ) : null}
          {showArchive || showDelete ? (
            <>
              <ContextMenuSeparator />
              {showArchive ? (
                <ContextMenuItem
                  onClick={onArchiveRequest}
                  variant="destructive"
                >
                  <Trash2 aria-hidden />
                  Archive proposal
                </ContextMenuItem>
              ) : null}
              {showDelete ? (
                <ContextMenuItem
                  onClick={onDeleteRequest}
                  variant="destructive"
                >
                  <Trash2 aria-hidden />
                  Delete draft
                </ContextMenuItem>
              ) : null}
            </>
          ) : null}
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ActiveBuildContextMenu({
  build,
  children,
  onDeleteRequest,
  onOpen,
}: {
  build: ActiveBuild;
  children: ReactElement;
  onDeleteRequest: () => void;
  onOpen: () => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="w-56">
        <ContextMenuGroup>
          <ContextMenuLabel className="truncate">{build.id}</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onOpen}>
            <Eye aria-hidden />
            Open build workspace
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onDeleteRequest} variant="destructive">
            <Trash2 aria-hidden />
            Delete active build
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function SubmittedProposalContextMenu({
  children,
  onArchiveRequest,
  onOpen,
  proposal,
}: {
  children: ReactElement;
  onArchiveRequest: () => void;
  onOpen: () => void;
  proposal: ProposalKanbanCard;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="w-56">
        <ContextMenuGroup>
          <ContextMenuLabel className="truncate">
            {proposal.name}
          </ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onOpen}>
            <FileText aria-hidden />
            Review proposal
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onArchiveRequest} variant="destructive">
            <Trash2 aria-hidden />
            Archive proposal
          </ContextMenuItem>
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
      toast.success("Draft proposal deleted.");
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

export function ArchiveProposalDialog({
  onArchive,
  onOpenChange,
  proposal,
}: {
  onArchive: (proposal: ProposalKanbanCard, reason: string) => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
  proposal: ProposalKanbanCard | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const proposalKey = proposal?.proposalId ?? proposal?.id ?? null;

  useEffect(() => {
    setError(null);
    setPending(false);
    setReason("");
  }, [proposalKey]);

  async function handleArchive() {
    if (!proposal) {
      return;
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("Archive reason is required.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onArchive(proposal, trimmedReason);
      toast.success("Proposal archived.");
      onOpenChange(false);
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "Could not archive proposal."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={proposal !== null}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Archive submitted proposal</AlertDialogTitle>
          <AlertDialogDescription>
            {proposal
              ? `"${proposal.name}" will be removed from the submitted review queue. This action is audited.`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="px-6 pb-2">
          <label
            className="grid gap-2 text-sm"
            htmlFor="archive-proposal-reason"
          >
            <span>Archive reason</span>
            <Textarea
              data-testid="archive-proposal-reason"
              id="archive-proposal-reason"
              onChange={(event) => setReason(event.currentTarget.value)}
              placeholder="Explain why this proposal is being archived."
              rows={3}
              value={reason}
            />
          </label>
        </div>
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
            data-testid="archive-proposal-confirm"
            disabled={!reason.trim()}
            loading={pending}
            onClick={handleArchive}
            variant="destructive"
          >
            Archive proposal
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteActiveBuildDialog({
  build,
  onDelete,
  onOpenChange,
}: {
  build: ActiveBuild | null;
  onDelete: (build: ActiveBuild, reason: string) => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const buildKey = build?.buildKey ?? null;

  useEffect(() => {
    setError(null);
    setPending(false);
    setReason("");
  }, [buildKey]);

  async function handleDelete() {
    if (!build) {
      return;
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("Delete reason is required.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onDelete(build, trimmedReason);
      toast.success("Active build deleted.");
      onOpenChange(false);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete active build."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={build !== null}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete active build</AlertDialogTitle>
          <AlertDialogDescription>
            {build
              ? `"${build.id}" at ${build.address} and its live build workspace data will be permanently removed. This cannot be undone.`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="px-6 pb-2">
          <label
            className="grid gap-2 text-sm"
            htmlFor="delete-active-build-reason"
          >
            <span>Delete reason</span>
            <Textarea
              data-testid="delete-active-build-reason"
              id="delete-active-build-reason"
              onChange={(event) => setReason(event.currentTarget.value)}
              placeholder="Explain why this active build is being deleted."
              rows={3}
              value={reason}
            />
          </label>
        </div>
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
            data-testid="delete-active-build-confirm"
            disabled={!reason.trim()}
            loading={pending}
            onClick={handleDelete}
            variant="destructive"
          >
            Delete active build
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

export function ScheduleRail({
  canMakeFinalDecision = false,
  collapsed,
  date,
  events,
  onAcknowledgeHandoff,
  onCollapsedChange,
  onEscalate,
  onReturnDecision,
  quickActions,
}: {
  canMakeFinalDecision?: boolean;
  collapsed: boolean;
  date: Date;
  events: ScheduleEvent[];
  onAcknowledgeHandoff?: (handoffId: string) => Promise<unknown>;
  onCollapsedChange: (collapsed: boolean) => void;
  onEscalate?: (
    action: QuickAction,
    input: OperationsEscalationInput
  ) => Promise<unknown>;
  onReturnDecision?: (
    handoffId: string,
    input: OperationsReturnDecisionInput
  ) => Promise<unknown>;
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
          {quickActions.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
              No operational items need action.
            </p>
          ) : (
            quickActions.map((action) => (
              <QuickActionCard
                action={action}
                canMakeFinalDecision={canMakeFinalDecision}
                key={action.id}
                onAcknowledgeHandoff={onAcknowledgeHandoff}
                onEscalate={onEscalate}
                onReturnDecision={onReturnDecision}
              />
            ))
          )}
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

function QuickActionCard({
  action,
  canMakeFinalDecision,
  onAcknowledgeHandoff,
  onEscalate,
  onReturnDecision,
}: {
  action: QuickAction;
  canMakeFinalDecision: boolean;
  onAcknowledgeHandoff?: (handoffId: string) => Promise<unknown>;
  onEscalate?: (
    action: QuickAction,
    input: OperationsEscalationInput
  ) => Promise<unknown>;
  onReturnDecision?: (
    handoffId: string,
    input: OperationsReturnDecisionInput
  ) => Promise<unknown>;
}) {
  const Icon = actionIcon[action.type];
  const [dialogMode, setDialogMode] = useState<"escalate" | "return" | null>(
    null
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnDecision, setReturnDecision] =
    useState<OperationsHandoffReturnDecision>("continue");
  const handoff = action.handoff;

  async function handleEscalationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onEscalate) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await onEscalate(action, {
        decisionPreview: String(formData.get("decisionPreview") ?? ""),
        evidenceSummary: String(formData.get("evidenceSummary") ?? ""),
        reason: String(formData.get("reason") ?? ""),
        recommendation: String(formData.get("recommendation") ?? ""),
        requiredAction: String(formData.get("requiredAction") ?? ""),
        warnings: String(formData.get("warnings") ?? "")
          .split("\n")
          .map((warning) => warning.trim())
          .filter(Boolean),
      });
      setDialogMode(null);
    } catch {
      setError("Unable to send this escalation. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleReturnSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!(handoff && onReturnDecision)) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await onReturnDecision(handoff._id, {
        decision: returnDecision,
        followUpAssignment: String(formData.get("followUpAssignment") ?? ""),
        reason: String(formData.get("returnReason") ?? ""),
      });
      setDialogMode(null);
    } catch {
      setError("Unable to return this decision. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleAcknowledge() {
    if (!(handoff && onAcknowledgeHandoff)) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onAcknowledgeHandoff(handoff._id);
    } catch {
      setError("Unable to acknowledge this return. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <article className="space-y-3 rounded-lg border bg-background p-3">
        <div className="flex items-start gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
            <Icon aria-hidden="true" className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-sm">{action.title}</p>
              <span className="shrink-0 text-muted-foreground text-xs">
                {action.ageLabel}
              </span>
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              {action.entityLabel}
            </p>
            <p className="text-muted-foreground text-xs">
              {action.buildId} · {action.address}
            </p>
          </div>
        </div>
        <dl className="grid gap-2 text-xs">
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">Owner</dt>
            <dd className="text-right font-medium">{action.ownerLabel}</dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">Blocker</dt>
            <dd className="max-w-44 text-right">{action.blocker}</dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">Recommendation</dt>
            <dd className="max-w-44 text-right">
              {action.recommendationLabel}
            </dd>
          </div>
        </dl>

        {handoff ? <OperationsHandoffSummary action={action} /> : null}
        {error ? (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div>
            <p className="font-medium text-xs">{action.authorityLabel}</p>
            <p className="text-muted-foreground text-xs">{action.dueLabel}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              render={<a href={action.href}>{action.actionLabel}</a>}
              size="sm"
              variant="outline"
            >
              {action.actionLabel}
            </Button>
            {!handoff && onEscalate ? (
              <Button onClick={() => setDialogMode("escalate")} size="sm">
                Prepare escalation
              </Button>
            ) : null}
            {handoff?.acknowledgementState === "pending_decision" &&
            canMakeFinalDecision &&
            onReturnDecision ? (
              <Button onClick={() => setDialogMode("return")} size="sm">
                Record return decision
              </Button>
            ) : null}
            {handoff?.acknowledgementState === "pending_decision" &&
            !canMakeFinalDecision ? (
              <Badge variant="warning">Awaiting Lender Admin</Badge>
            ) : null}
            {handoff?.acknowledgementState === "returned" &&
            action.canAcknowledgeHandoff &&
            onAcknowledgeHandoff ? (
              <Button
                loading={pending}
                onClick={handleAcknowledge}
                size="sm"
                variant="secondary"
              >
                Acknowledge return
              </Button>
            ) : null}
            {handoff?.acknowledgementState === "acknowledged" ? (
              <Badge variant="success">Return acknowledged</Badge>
            ) : null}
          </div>
        </div>
      </article>

      <Dialog
        onOpenChange={(open) => {
          if (!(open || pending)) {
            setDialogMode(null);
            setError(null);
          }
        }}
        open={dialogMode === "escalate"}
      >
        <DialogContent className="sm:max-w-xl">
          <form onSubmit={handleEscalationSubmit}>
            <DialogHeader>
              <DialogTitle>Escalate {action.title.toLowerCase()}</DialogTitle>
              <DialogDescription>
                Package the evidence, recommendation, warnings, required action,
                and decision preview before handing this item to Lender Admin.
              </DialogDescription>
            </DialogHeader>
            <DialogPanel className="grid gap-4">
              <OperationsHandoffTextarea
                label="Evidence summary"
                name="evidenceSummary"
              />
              <OperationsHandoffTextarea
                label="Recommendation"
                name="recommendation"
              />
              <OperationsHandoffTextarea
                description="Enter one warning per line."
                label="Warnings"
                name="warnings"
                required={false}
              />
              <OperationsHandoffTextarea
                label="Required action"
                name="requiredAction"
              />
              <OperationsHandoffTextarea
                label="Decision preview"
                name="decisionPreview"
              />
              <OperationsHandoffTextarea
                label="Escalation reason"
                name="reason"
              />
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
            </DialogPanel>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button loading={pending} type="submit">
                Send to Lender Admin
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!(open || pending)) {
            setDialogMode(null);
            setError(null);
          }
        }}
        open={dialogMode === "return"}
      >
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleReturnSubmit}>
            <DialogHeader>
              <DialogTitle>Return operations decision</DialogTitle>
              <DialogDescription>
                Record the decision, reason, and follow-up assignment. This does
                not replace the canonical approval or release action.
              </DialogDescription>
            </DialogHeader>
            <DialogPanel className="grid gap-4">
              <label
                className="grid gap-1.5 text-sm"
                htmlFor={`decision-${action.id}`}
              >
                <span className="font-medium">Return decision</span>
                <select
                  className="h-9 rounded-lg border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  id={`decision-${action.id}`}
                  onChange={(event) =>
                    setReturnDecision(
                      event.target.value as OperationsHandoffReturnDecision
                    )
                  }
                  value={returnDecision}
                >
                  <option value="continue">Continue</option>
                  <option value="reroute">Reroute</option>
                  <option value="close">Close</option>
                </select>
              </label>
              <OperationsHandoffTextarea
                label="Return reason"
                name="returnReason"
              />
              <OperationsHandoffTextarea
                label="Follow-up assignment"
                name="followUpAssignment"
              />
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
            </DialogPanel>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button loading={pending} type="submit">
                Return to operations
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function OperationsHandoffSummary({ action }: { action: QuickAction }) {
  const handoff = action.handoff;
  if (!handoff) {
    return null;
  }
  return (
    <section
      aria-label="Operations handoff"
      className="grid gap-2 rounded-lg bg-muted/60 p-3 text-xs"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">Operations handoff</p>
        <Badge variant="outline">
          {formatHandoffState(handoff.acknowledgementState)}
        </Badge>
      </div>
      <p>
        <span className="text-muted-foreground">Evidence: </span>
        {handoff.evidenceSummary}
      </p>
      <p>
        <span className="text-muted-foreground">Recommendation: </span>
        {handoff.recommendation}
      </p>
      <p>
        <span className="text-muted-foreground">Required action: </span>
        {handoff.requiredAction}
      </p>
      <p>
        <span className="text-muted-foreground">Decision preview: </span>
        {handoff.decisionPreview}
      </p>
      {handoff.warnings.length > 0 ? (
        <div>
          <p className="text-muted-foreground">Warnings</p>
          <ul className="list-disc pl-4">
            {handoff.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {handoff.returnReason ? (
        <div className="grid gap-1 border-t pt-2">
          <p className="font-medium">
            Returned: {formatReturnDecision(handoff.returnDecision)}
          </p>
          <p>{handoff.returnReason}</p>
          {handoff.followUpAssignment ? (
            <p>
              <span className="text-muted-foreground">Follow-up: </span>
              {handoff.followUpAssignment}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function OperationsHandoffTextarea({
  description,
  label,
  name,
  required = true,
}: {
  description?: string;
  label: string;
  name: string;
  required?: boolean;
}) {
  const id = `operations-handoff-${name}`;
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <label className="grid gap-1.5 text-sm" htmlFor={id}>
      <span className="font-medium">{label}</span>
      {description ? (
        <span className="text-muted-foreground text-xs" id={descriptionId}>
          {description}
        </span>
      ) : null}
      <Textarea
        aria-describedby={descriptionId}
        aria-label={label}
        id={id}
        minLength={required ? 8 : undefined}
        name={name}
        required={required}
        rows={3}
      />
    </label>
  );
}

function formatHandoffState(
  state: NonNullable<QuickAction["handoff"]>["acknowledgementState"]
) {
  const labels = {
    acknowledged: "Acknowledged",
    pending_decision: "Awaiting decision",
    returned: "Returned",
  } satisfies Record<
    NonNullable<QuickAction["handoff"]>["acknowledgementState"],
    string
  >;
  return labels[state];
}

function formatReturnDecision(
  decision: OperationsHandoffReturnDecision | undefined
) {
  if (!decision) {
    return "Decision recorded";
  }
  return {
    close: "Close",
    continue: "Continue",
    reroute: "Reroute",
  }[decision];
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

function centsToCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
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
