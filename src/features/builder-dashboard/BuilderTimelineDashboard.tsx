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
import { cn } from "#/lib/utils.ts";
import { MOCK_BUILDER_PERSONA } from "../../../convex/demo_personas";

export type TimelinePlanRow = {
  buildKey?: string;
  buildName: string;
  drawCount: number;
  kind?: "activeBuild" | "proposal";
  milestoneCount: number;
  pendingDrawRequestCount?: number;
  pendingModificationRequestCount?: number;
  planId: string;
  proposalId?: string;
  proposalSlug?: string;
  status: "approved" | "archived" | "draft" | "submitted";
  totalBudgetCents: number;
  updatedAt: number;
};

type BuilderDashboardNavigate = (
  to: string,
  params?: Record<string, string>
) => void;

export function BuilderTimelineDashboardSurface({
  chrome = "page",
  liveBuildRoute = "/builder/demo/dashboard/builds/$buildId",
  onNavigate,
  personaLabel = MOCK_BUILDER_PERSONA,
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
        row.kind ? row.kind === "activeBuild" : row.status === "approved",
      ),
    [rows]
  );
  const proposalRows = useMemo(
    () =>
      rows.filter((row: TimelinePlanRow) =>
        row.kind ? row.kind === "proposal" : row.status !== "approved",
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
              rows={liveBuilds}
              onOpen={(row) =>
                onNavigate(liveBuildRoute, {
                  buildId: resolveBuildKey(row),
                })
              }
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
              rows={proposalRows}
              onOpen={(row) =>
                onNavigate("/builder/demo/dashboard/proposals/$draftId", {
                  draftId: row.planId,
                })
              }
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
  liveBuildRoute = "/builder/demo/dashboard/builds/$buildId",
  onNavigate,
  rows,
  showStartProposalAction = true,
}: {
  chrome?: "embedded" | "page";
  liveBuildRoute?: string;
  onNavigate: BuilderDashboardNavigate;
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
              Builder proposals · {MOCK_BUILDER_PERSONA}
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
              rows={rows}
              onOpen={(row) =>
                isLiveBuildRow(row)
                  ? onNavigate(liveBuildRoute, {
                      buildId: resolveBuildKey(row),
                    })
                  : onNavigate("/builder/demo/dashboard/proposals/$draftId", {
                      draftId: row.planId,
                    })
              }
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
  liveBuildRoute = "/builder/demo/dashboard/builds/$buildId",
  onNavigate,
  rows,
  showStartProposalAction = true,
}: {
  chrome?: "embedded" | "page";
  liveBuildRoute?: string;
  onNavigate: BuilderDashboardNavigate;
  rows: TimelinePlanRow[];
  showStartProposalAction?: boolean;
}) {
  const liveRows = useMemo(
    () =>
      rows.filter((row: TimelinePlanRow) =>
        row.kind ? row.kind === "activeBuild" : row.status === "approved",
      ),
    [rows]
  );

  return (
    <BuilderDashboardScaffold chrome={chrome}>
      <Frame>
        <FramePanel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Builder live builds · {MOCK_BUILDER_PERSONA}
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
              rows={liveRows}
              onOpen={(row) =>
                onNavigate(liveBuildRoute, {
                  buildId: resolveBuildKey(row),
                })
              }
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
          onClick={() => onNavigate("/builder/demo/dashboard")}
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
          onClick={() => onNavigate("/demo/timeline")}
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
          <TableHead>Status</TableHead>
          <TableHead>Budget</TableHead>
          <TableHead>Milestones / draws</TableHead>
          <TableHead>Open requests</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const resolvedActionLabel =
            actionLabel ??
            (isLiveBuildRow(row) ? "Open live build" : "Open proposal");
          return (
            <TableRow key={row.planId}>
              <TableCell className="font-medium">{row.buildName}</TableCell>
              <TableCell>
                <PlanStatusBadge status={row.status} />
              </TableCell>
              <TableCell>{formatCents(row.totalBudgetCents)}</TableCell>
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
  return (
    <Badge variant={variant}>
      {status === "approved" ? "moved to live build" : status}
    </Badge>
  );
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
  return row.buildKey ?? `demo-timeline-${row.proposalSlug ?? row.planId}`;
}

function isLiveBuildRow(row: TimelinePlanRow) {
  return row.kind ? row.kind === "activeBuild" : row.status === "approved";
}

function formatOpenRequests(row: TimelinePlanRow) {
  const drawCount = row.pendingDrawRequestCount ?? 0;
  const modificationCount = row.pendingModificationRequestCount ?? 0;
  if (drawCount === 0 && modificationCount === 0) {
    return "-";
  }
  return `${drawCount} draw / ${modificationCount} change`;
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
