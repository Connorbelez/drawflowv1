import { ExternalLink, Plus, RefreshCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { BuildIdentityCell } from "#/features/builds/BuildIdentityCell.tsx";
import { cn } from "#/lib/utils.ts";

export type TimelineBudgetGovernance = {
  activeVersion: number;
  activeVersionLabel: string;
  affectedDrawRequestCount: number;
  affectedDrawRequestIds?: string[];
  affectedMilestoneCount: number;
  affectedMilestoneKeys?: string[];
  currentOwner: string;
  decisionStatus: "approved" | "current" | "pending" | "rejected";
  proposedVersion: number | null;
  proposedVersionLabel: string | null;
  requestId?: string | null;
  requestReason?: string | null;
  requestType?:
    | "capitalPlanRevision"
    | "paybackExtension"
    | "principalIncrease"
    | null;
  revisionDeadline: string | null;
  revisionPriority: "recommended" | "required" | null;
  varianceBps: number;
  varianceCents: number;
};

export type TimelinePlanRow = {
  budgetGovernance?: TimelineBudgetGovernance | null;
  buildStatus?: "active" | "future_start";
  buildKey?: string;
  buildName: string;
  builderName?: string;
  drawCount: number;
  imageUrl?: string | null;
  kind?: "activeBuild" | "proposal";
  location?: string;
  locationLatitude?: number;
  locationLongitude?: number;
  milestoneCount: number;
  milestonesBehindSchedule?: number;
  pendingDrawRequestCount?: number;
  pendingModificationRequestCount?: number;
  planId: string;
  proposalSlug?: string;
  status: "approved" | "archived" | "draft" | "submitted";
  totalBudgetCents: number;
  updatedAt: number;
};

type BuilderDashboardNavigate = (
  to: string,
  params?: Record<string, string>
) => void;

const DEFAULT_PERSONA_LABEL = "Builder";

export function BuilderTimelineDashboardSurface({
  chrome = "page",
  liveBuildRoute = "/builder/builds/$buildId",
  onNavigate,
  personaLabel = DEFAULT_PERSONA_LABEL,
  rows,
  showBuilderShellAction = false,
  showStartProposalAction = true,
}: {
  chrome?: "embedded" | "page";
  liveBuildRoute?: string;
  onNavigate: BuilderDashboardNavigate;
  personaLabel?: string;
  rows: TimelinePlanRow[];
  showBuilderShellAction?: boolean;
  showStartProposalAction?: boolean;
}) {
  const counts = useMemo(() => countByStatus(rows), [rows]);
  const liveBuilds = useMemo(
    () =>
      rows.filter((row: TimelinePlanRow) =>
        row.kind ? row.kind === "activeBuild" : row.status === "approved"
      ),
    [rows]
  );
  const proposalRows = useMemo(
    () =>
      rows.filter((row: TimelinePlanRow) =>
        row.kind ? row.kind === "proposal" : row.status !== "approved"
      ),
    [rows]
  );

  return (
    <BuilderDashboardScaffold chrome={chrome}>
      <Frame>
        <FramePanel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Builder home · {personaLabel}
            </p>
            <h1 className="mt-1 font-semibold text-2xl tracking-tight">
              Builder dashboard
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Proposal workspaces, submitted plans, and approved live builds
              owned by your builder account.
            </p>
          </div>
          <BuilderDashboardActions
            onNavigate={onNavigate}
            showBuilderShellAction={showBuilderShellAction}
            showStartProposalAction={showStartProposalAction}
          />
        </FramePanel>
      </Frame>

      <div className="grid gap-3 md:grid-cols-4">
        <StatusKpi label="Drafts" value={counts.draft} />
        <StatusKpi label="Submitted" value={counts.submitted} />
        <StatusKpi label="Live Builds" value={counts.approved} />
        <StatusKpi label="Archived" value={counts.archived} />
      </div>

      <Card>
        <CardHeader className="border-b p-4">
          <CardTitle className="text-base">Live builds</CardTitle>
          <CardDescription>
            Approved plans that now serve as day-to-day build timelines.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {liveBuilds.length ? (
            <TimelinePlanTable
              actionLabel="Open live build"
              onOpen={(row) =>
                onNavigate(liveBuildRoute, {
                  buildId: resolveBuildKey(row),
                })
              }
              rows={liveBuilds}
            />
          ) : (
            <div className="p-4 text-muted-foreground text-sm">
              No approved live builds yet.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b p-4">
          <CardTitle className="text-base">
            Recent proposal workspaces
          </CardTitle>
          <CardDescription>
            Draft, submitted, rejected, and archived proposal workspaces.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {proposalRows.length ? (
            <TimelinePlanTable
              actionLabel="Open proposal"
              onOpen={(row) =>
                onNavigate("/builder/proposals/$draftId", {
                  draftId: row.planId,
                })
              }
              rows={proposalRows}
            />
          ) : (
            <div className="p-4 text-muted-foreground text-sm">
              No draft, submitted, or archived proposals exist yet.
            </div>
          )}
        </CardContent>
      </Card>
    </BuilderDashboardScaffold>
  );
}

export function BuilderProposalListSurface({
  chrome = "embedded",
  liveBuildRoute = "/builder/builds/$buildId",
  onNavigate,
  personaLabel = DEFAULT_PERSONA_LABEL,
  rows,
  showStartProposalAction = true,
}: {
  chrome?: "embedded" | "page";
  liveBuildRoute?: string;
  onNavigate: BuilderDashboardNavigate;
  personaLabel?: string;
  rows: TimelinePlanRow[];
  showStartProposalAction?: boolean;
}) {
  const counts = useMemo(() => countByStatus(rows), [rows]);

  return (
    <BuilderDashboardScaffold chrome={chrome}>
      <Frame>
        <FramePanel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Builder proposals · {personaLabel}
            </p>
            <h1 className="mt-1 font-semibold text-2xl tracking-tight">
              Proposals
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              All proposal workspaces stay visible here; approved plans move
              into live builds without losing their proposal history.
            </p>
          </div>
          <BuilderDashboardActions
            onNavigate={onNavigate}
            showStartProposalAction={showStartProposalAction}
          />
        </FramePanel>
      </Frame>

      <div className="grid gap-3 md:grid-cols-4">
        <StatusKpi label="Drafts" value={counts.draft} />
        <StatusKpi label="Submitted" value={counts.submitted} />
        <StatusKpi label="Moved Live" value={counts.approved} />
        <StatusKpi label="Archived" value={counts.archived} />
      </div>

      <Card>
        <CardHeader className="border-b p-4">
          <CardTitle className="text-base">Proposal registry</CardTitle>
          <CardDescription>
            Draft, submitted, archived, rejected, and approved proposal rows.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length ? (
            <TimelinePlanTable
              onOpen={(row) =>
                isLiveBuildRow(row)
                  ? onNavigate(liveBuildRoute, {
                      buildId: resolveBuildKey(row),
                    })
                  : onNavigate("/builder/proposals/$draftId", {
                      draftId: row.planId,
                    })
              }
              rows={rows}
            />
          ) : (
            <div className="p-4 text-muted-foreground text-sm">
              No proposal workspaces exist yet.
            </div>
          )}
        </CardContent>
      </Card>
    </BuilderDashboardScaffold>
  );
}

export function BuilderLiveBuildListSurface({
  chrome = "embedded",
  liveBuildRoute = "/builder/builds/$buildId",
  onNavigate,
  personaLabel = DEFAULT_PERSONA_LABEL,
  rows,
  showStartProposalAction = true,
}: {
  chrome?: "embedded" | "page";
  liveBuildRoute?: string;
  onNavigate: BuilderDashboardNavigate;
  personaLabel?: string;
  rows: TimelinePlanRow[];
  showStartProposalAction?: boolean;
}) {
  const liveRows = useMemo(
    () =>
      rows.filter((row: TimelinePlanRow) =>
        row.kind ? row.kind === "activeBuild" : row.status === "approved"
      ),
    [rows]
  );

  return (
    <BuilderDashboardScaffold chrome={chrome}>
      <Frame>
        <FramePanel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Builder live builds · {personaLabel}
            </p>
            <h1 className="mt-1 font-semibold text-2xl tracking-tight">
              Live builds
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Approved reimbursement roadmaps now running as day-to-day build
              timelines.
            </p>
          </div>
          <BuilderDashboardActions
            onNavigate={onNavigate}
            showStartProposalAction={showStartProposalAction}
          />
        </FramePanel>
      </Frame>

      <Card>
        <CardHeader className="border-b p-4">
          <CardTitle className="text-base">Active live builds</CardTitle>
          <CardDescription>
            Open an approved build to manage draws, dates, evidence, and live
            cashflow changes.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {liveRows.length ? (
            <TimelinePlanTable
              actionLabel="Open live build"
              onOpen={(row) =>
                onNavigate(liveBuildRoute, {
                  buildId: resolveBuildKey(row),
                })
              }
              rows={liveRows}
            />
          ) : (
            <div className="p-4 text-muted-foreground text-sm">
              No approved live builds yet.
            </div>
          )}
        </CardContent>
      </Card>
    </BuilderDashboardScaffold>
  );
}

function BuilderDashboardScaffold({
  children,
  chrome,
}: {
  children: ReactNode;
  chrome: "embedded" | "page";
}) {
  return (
    <main
      className={cn(
        "flex flex-col gap-4",
        chrome === "page" && "min-h-[calc(100vh-4rem)] bg-muted/30 p-4"
      )}
    >
      <div
        className={cn(
          "flex flex-col gap-4",
          chrome === "page" && "mx-auto w-full max-w-6xl"
        )}
      >
        {children}
      </div>
    </main>
  );
}

function BuilderDashboardActions({
  onNavigate,
  showBuilderShellAction = false,
  showStartProposalAction = true,
}: {
  onNavigate: BuilderDashboardNavigate;
  showBuilderShellAction?: boolean;
  showStartProposalAction?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {showBuilderShellAction ? (
        <Button
          data-ixc-ref="UI-DASHBOARD-OPEN-BUILDER-SHELL"
          onClick={() => onNavigate("/builder")}
          size="sm"
          variant="outline"
        >
          <ExternalLink />
          Builder shell
        </Button>
      ) : null}
      <Button
        aria-label="Refresh plan list"
        data-ixc-ref="UI-DASHBOARD-REFRESH"
        onClick={() => window.location.reload()}
        size="sm"
        variant="outline"
      >
        <RefreshCcw />
        Refresh
      </Button>
      {showStartProposalAction ? (
        <Button
          data-ixc-ref="UI-DASHBOARD-START-PLAN"
          onClick={() => onNavigate("/builder/proposals/new")}
          size="sm"
        >
          <Plus />
          Start new proposal
        </Button>
      ) : null}
    </div>
  );
}

function TimelinePlanTable({
  actionLabel,
  onOpen,
  rows,
}: {
  actionLabel?: string;
  onOpen: (row: TimelinePlanRow) => void;
  rows: TimelinePlanRow[];
}) {
  return (
    <Table data-ixc-ref="UI-DASHBOARD-PLAN-TABLE">
      <TableHeader>
        <TableRow>
          <TableHead>Build</TableHead>
          <TableHead>Builder</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Budget / governance</TableHead>
          <TableHead>Milestones / draws</TableHead>
          <TableHead>Open requests</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const resolvedActionLabel =
            isLiveBuildRow(row) && row.budgetGovernance?.revisionPriority
              ? row.budgetGovernance.decisionStatus === "pending"
                ? "View revision"
                : "Review variance"
              : (actionLabel ??
                (isLiveBuildRow(row) ? "Open live build" : "Open proposal"));
          return (
            <TableRow key={row.planId}>
              <TableCell>
                <BuildIdentityCell
                  buildName={row.buildName}
                  imageUrl={row.imageUrl}
                  latitude={row.locationLatitude}
                  location={row.location}
                  longitude={row.locationLongitude}
                  metadata={
                    row.location ? (
                      <span className="block max-w-52 truncate text-muted-foreground text-xs">
                        {row.location}
                      </span>
                    ) : null
                  }
                />
              </TableCell>
              <TableCell>{row.builderName ?? "Builder"}</TableCell>
              <TableCell>
                {isLiveBuildRow(row) ? (
                  <LiveBuildStatusBadge row={row} />
                ) : (
                  <PlanStatusBadge status={row.status} />
                )}
              </TableCell>
              <TableCell>
                <div className="font-medium">
                  {formatCents(row.totalBudgetCents)}
                </div>
                {row.budgetGovernance?.revisionPriority ? (
                  <BudgetGovernanceSummary
                    governance={row.budgetGovernance}
                    rowLabel={row.buildName}
                  />
                ) : null}
              </TableCell>
              <TableCell>
                {row.milestoneCount} / {row.drawCount}
              </TableCell>
              <TableCell>{formatOpenRequests(row)}</TableCell>
              <TableCell>{formatDateTime(row.updatedAt)}</TableCell>
              <TableCell className="text-right">
                <Button
                  aria-label={`${resolvedActionLabel} ${row.buildName}`}
                  data-ixc-ref={
                    isLiveBuildRow(row)
                      ? "UI-DASHBOARD-OPEN-LIVE-BUILD"
                      : "UI-DASHBOARD-OPEN-PROPOSAL"
                  }
                  onClick={() => onOpen(row)}
                  size="sm"
                  variant="outline"
                >
                  <ExternalLink />
                  {resolvedActionLabel}
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function BudgetGovernanceSummary({
  governance,
  rowLabel,
}: {
  governance: TimelineBudgetGovernance;
  rowLabel: string;
}) {
  const priorityLabel =
    governance.revisionPriority === "required"
      ? "Required budget revision"
      : "Recommended budget revision";
  const decisionLabel =
    governance.decisionStatus.charAt(0).toUpperCase() +
    governance.decisionStatus.slice(1);
  return (
    <section
      aria-label={`Budget governance for ${rowLabel}`}
      className="mt-2 min-w-56 space-y-1 text-xs"
    >
      <Badge
        variant={
          governance.revisionPriority === "required" ? "warning" : "outline"
        }
      >
        {priorityLabel}
      </Badge>
      <p className="font-medium text-foreground">
        {governance.activeVersionLabel}
        {governance.proposedVersionLabel
          ? ` → ${governance.proposedVersionLabel}`
          : null}
      </p>
      <p className="text-muted-foreground">
        {formatSignedCents(governance.varianceCents)} ·{" "}
        {formatSignedBps(governance.varianceBps)}
      </p>
      <p className="text-muted-foreground">
        {governance.currentOwner} · {decisionLabel}
      </p>
      <p className="text-muted-foreground">
        {governance.affectedMilestoneCount}{" "}
        {governance.affectedMilestoneCount === 1 ? "milestone" : "milestones"} ·{" "}
        {governance.affectedDrawRequestCount} open{" "}
        {governance.affectedDrawRequestCount === 1 ? "draw" : "draws"}
      </p>
      {governance.revisionDeadline ? (
        <p className="text-muted-foreground">
          Decision due {governance.revisionDeadline}
        </p>
      ) : null}
    </section>
  );
}

function StatusKpi({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          {label}
        </p>
        <p className="mt-1 font-semibold text-3xl tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

export function PlanStatusBadge({
  status,
}: {
  status: TimelinePlanRow["status"];
}) {
  const variant =
    status === "approved"
      ? "success"
      : status === "submitted"
        ? "warning"
        : status === "archived"
          ? "destructive"
          : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

function LiveBuildStatusBadge({ row }: { row: TimelinePlanRow }) {
  const behindCount = row.milestonesBehindSchedule ?? 0;
  if (behindCount > 0) {
    return (
      <Badge variant="warning">
        {behindCount} {behindCount === 1 ? "milestone" : "milestones"} behind
        schedule
      </Badge>
    );
  }
  if (row.buildStatus === "future_start") {
    return <Badge variant="outline">Scheduled</Badge>;
  }
  return <Badge variant="success">Active</Badge>;
}

function countByStatus(rows: TimelinePlanRow[]) {
  return rows.reduce(
    (counts, row) => {
      counts[row.status] += 1;
      return counts;
    },
    { approved: 0, archived: 0, draft: 0, submitted: 0 }
  );
}

function resolveBuildKey(row: TimelinePlanRow) {
  if (!row.buildKey) {
    throw new Error("An accessible live build assignment is required.");
  }
  return row.buildKey;
}

function isLiveBuildRow(row: TimelinePlanRow) {
  if (!row.buildKey) {
    return false;
  }
  return row.kind ? row.kind === "activeBuild" : row.status === "approved";
}

function formatOpenRequests(row: TimelinePlanRow) {
  const drawCount = row.pendingDrawRequestCount ?? 0;
  const modificationCount = row.pendingModificationRequestCount ?? 0;
  if (drawCount === 0 && modificationCount === 0) {
    return "None";
  }
  return `${drawCount} ${drawCount === 1 ? "draw" : "draws"} / ${modificationCount} ${modificationCount === 1 ? "change" : "changes"}`;
}

function formatSignedCents(cents: number) {
  return `${cents >= 0 ? "+" : "-"}${formatCents(Math.abs(cents))}`;
}

function formatSignedBps(bps: number) {
  const percentage = Math.abs(bps) / 100;
  return `${bps >= 0 ? "+" : "-"}${percentage.toFixed(1)}%`;
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function formatDateTime(epochMs: number) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(epochMs);
}
