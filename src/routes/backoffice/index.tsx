import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ArrowUpDown, ChevronDown, CircleAlert, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent, CardDescription } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
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
import { MetricDetailSheet } from "#/features/backoffice-dashboard/metric-detail-sheet.tsx";
import { getMetricDrilldownItems } from "#/features/backoffice-dashboard/metric-drilldown.ts";
import type {
  ActiveBuild,
  BackofficeDashboardData,
  DashboardMetric,
  ProposalKanbanCard,
  QuickAction,
} from "#/features/backoffice-dashboard/mock-data.ts";
import { MILESTONE_KANBAN_COLUMNS } from "#/features/backoffice-dashboard/mock-data.ts";
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
import { MilestoneKanban } from "./-backoffice-milestone-kanban.tsx";
import { ProposalKanban } from "./-backoffice-proposal-kanban.tsx";
import type { ProductionBuilderOption } from "./-backoffice-queue-surfaces.tsx";
import {
  ActiveBuildsCard,
  SubmittedProposalsCard,
} from "./-backoffice-queue-surfaces.tsx";
import type {
  OperationsEscalationInput,
  OperationsReturnDecisionInput,
} from "./-backoffice-schedule.tsx";
import {
  centsToCurrency,
  formatTimestamp,
  ScheduleRail,
} from "./-backoffice-schedule.tsx";

export type { ClosingConfirmationInput } from "#/features/production-proposals/ProposalLifecycleDialogs.tsx";
// biome-ignore lint/performance/noBarrelFile: preserve the existing public route exports
export { MilestoneKanban } from "./-backoffice-milestone-kanban.tsx";
export { ProposalKanban } from "./-backoffice-proposal-kanban.tsx";
export type { ProductionBuilderOption } from "./-backoffice-queue-surfaces.tsx";
export {
  ActiveBuildsCard,
  ArchiveProposalDialog,
  SubmittedProposalsCard,
} from "./-backoffice-queue-surfaces.tsx";
export type {
  OperationsEscalationInput,
  OperationsReturnDecisionInput,
} from "./-backoffice-schedule.tsx";
export { ScheduleRail } from "./-backoffice-schedule.tsx";

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
