import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  CalendarDays,
  Download,
  Landmark,
  Loader2,
  ReceiptText,
} from "lucide-react";
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
import {
  LOCAL_TIMELINE_SHARE_PREFIX,
  readLocalTimelineSnapshot,
  TimelineWorkspace,
} from "#/features/timeline-workspace";
import {
  buildTimelinePreviewCsv,
  buildTimelinePreviewCsvFilename,
  buildTimelinePreviewModel,
  type TimelinePreviewModel,
} from "#/features/timeline-workspace/timeline-preview-export.ts";
import { api } from "../../convex/_generated/api";

type ProposalPreviewSearch = {
  share?: string;
};

export const Route = createFileRoute("/proposal-preview")({
  component: ProposalPreviewRoute,
  ssr: false,
  validateSearch: (search: Record<string, unknown>): ProposalPreviewSearch => ({
    share: typeof search.share === "string" ? search.share : undefined,
  }),
});

function ProposalPreviewRoute() {
  const { share } = Route.useSearch();
  const remoteSnapshot = useQuery(
    api.demo_timeline_snapshots.demo_getTimelineSnapshot,
    share && !share.startsWith(LOCAL_TIMELINE_SHARE_PREFIX)
      ? { snapshotId: share }
      : "skip"
  );
  const localSnapshot = useMemo(
    () =>
      share?.startsWith(LOCAL_TIMELINE_SHARE_PREFIX)
        ? readLocalTimelineSnapshot(share)
        : null,
    [share]
  );
  const snapshot = share?.startsWith(LOCAL_TIMELINE_SHARE_PREFIX)
    ? localSnapshot
    : remoteSnapshot;
  const loading =
    Boolean(share && !share.startsWith(LOCAL_TIMELINE_SHARE_PREFIX)) &&
    remoteSnapshot === undefined;
  const model = useMemo(
    () => (snapshot ? buildTimelinePreviewModel(snapshot) : null),
    [snapshot]
  );

  if (!share) {
    return (
      <PreviewShell>
        <PreviewMessage
          eyebrow="Proposal preview"
          title="Snapshot link missing"
          body="Open this page from a DrawFlow share link."
        />
      </PreviewShell>
    );
  }

  if (loading) {
    return (
      <PreviewShell>
        <div className="grid min-h-[24rem] place-items-center">
          <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading proposal preview
          </div>
        </div>
      </PreviewShell>
    );
  }

  if (!snapshot) {
    return (
      <PreviewShell>
        <PreviewMessage
          eyebrow="Proposal preview"
          title="Snapshot not found"
          body="This share link does not resolve to a saved DrawFlow snapshot."
        />
      </PreviewShell>
    );
  }

  if (!model) {
    return (
      <PreviewShell>
        <PreviewMessage
          eyebrow="Proposal preview"
          title="Snapshot cannot be previewed"
          body="This snapshot is missing proposal timeline data."
        />
      </PreviewShell>
    );
  }

  return (
    <PreviewShell>
      <div className="flex flex-col gap-5">
        <Frame>
          <FramePanel className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <Badge variant="outline">Proposal preview</Badge>
              <h1 className="mt-3 text-balance font-semibold text-2xl tracking-tight md:text-3xl">
                {model.title}
              </h1>
              <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
                {model.snapshotSummary}
              </p>
            </div>
            <Button
              className="w-full lg:w-auto"
              onClick={() => downloadPreviewCsv(model, share)}
            >
              <Download />
              Export CSV
            </Button>
          </FramePanel>
        </Frame>

        <TimelineWorkspace
          allowRoleSwitching={false}
          embedded
          initialRole="builder"
          initialState={model.state}
          readOnly
          showWorkspaceHeader={false}
          timelineSettingsProjection={null}
          workspaceMode="proposal"
        />
        <PreviewMetrics model={model} />
        <BudgetTimelineTable model={model} />
        <MilestoneBreakdown model={model} />
        <DrawPlanTable model={model} />
      </div>
    </PreviewShell>
  );
}

function PreviewShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-svh bg-muted/30 p-4 text-foreground lg:p-6">
      <div className="mx-auto max-w-7xl">{children}</div>
    </main>
  );
}

function PreviewMessage({
  body,
  eyebrow,
  title,
}: {
  body: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <Frame className="mx-auto mt-16 max-w-2xl">
      <FramePanel className="p-6">
        <Badge variant="outline">{eyebrow}</Badge>
        <h1 className="mt-3 font-semibold text-2xl tracking-tight">{title}</h1>
        <p className="mt-2 text-muted-foreground text-sm">{body}</p>
      </FramePanel>
    </Frame>
  );
}

function PreviewMetrics({ model }: { model: TimelinePreviewModel }) {
  const metrics = [
    {
      icon: <ReceiptText />,
      label: "Building budget",
      value: formatCurrency(model.totalMilestoneBudgetDollars),
    },
    {
      icon: <Landmark />,
      label: "Draw schedule",
      value: formatCurrency(model.totalDrawDollars),
    },
    {
      icon: <CalendarDays />,
      label: "Timeline",
      value: `${model.durationDays} days`,
    },
    {
      icon: <ReceiptText />,
      label: "Sub-milestone budget",
      value: formatCurrency(model.totalSubmilestoneBudgetDollars),
    },
  ];

  return (
    <section
      aria-label="Proposal preview summary"
      className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
    >
      {metrics.map((metric) => (
        <Card key={metric.label}>
          <CardHeader className="gap-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-muted-foreground text-sm">
                {metric.label}
              </p>
              <span className="text-muted-foreground [&_svg]:size-4">
                {metric.icon}
              </span>
            </div>
            <CardTitle className="text-2xl">{metric.value}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </section>
  );
}

function BudgetTimelineTable({ model }: { model: TimelinePreviewModel }) {
  return (
    <Card>
      <CardHeader className="border-b p-4">
        <CardTitle>Building budget and timeline</CardTitle>
        <CardDescription>
          Milestone costs, schedule windows, draw availability, and review
          state.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Milestone</TableHead>
              <TableHead>Window</TableHead>
              <TableHead className="text-right">Budget</TableHead>
              <TableHead className="text-right">Draw availability</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Policy</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {model.milestones.map((milestone) => (
              <TableRow key={milestone.id}>
                <TableCell className="whitespace-normal">
                  <div className="font-medium">{milestone.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {milestone.submilestones.length} sub-milestones
                  </div>
                </TableCell>
                <TableCell>
                  Day {milestone.dayStart} to Day {milestone.dayEnd}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(milestone.amountDollars)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(milestone.drawAvailabilityDollars)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{labelize(milestone.status)}</Badge>
                </TableCell>
                <TableCell className="whitespace-normal">
                  {milestone.policy}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function MilestoneBreakdown({ model }: { model: TimelinePreviewModel }) {
  return (
    <section
      aria-label="Milestone and sub-milestone breakdown"
      className="grid gap-4"
    >
      {model.milestones.map((milestone) => (
        <Card key={milestone.id}>
          <CardHeader className="border-b p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>{milestone.name}</CardTitle>
                <CardDescription>
                  Day {milestone.dayStart} to Day {milestone.dayEnd} ·{" "}
                  {formatCurrency(milestone.amountDollars)}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{milestone.evidence}</Badge>
                <Badge variant="secondary">{milestone.drawLabel}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {milestone.submilestones.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sub-milestone</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scope notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {milestone.submilestones.map((submilestone) => (
                    <TableRow key={submilestone.key}>
                      <TableCell className="whitespace-normal font-medium">
                        {submilestone.name}
                      </TableCell>
                      <TableCell>
                        {submilestone.durationDays === null
                          ? "-"
                          : `${submilestone.durationDays} days`}
                      </TableCell>
                      <TableCell className="text-right">
                        {submilestone.budgetDollars === null
                          ? "-"
                          : formatCurrency(submilestone.budgetDollars)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {labelize(submilestone.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-normal text-muted-foreground">
                        {submilestone.description || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-4 text-muted-foreground text-sm">
                No sub-milestones captured for this milestone.
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function DrawPlanTable({ model }: { model: TimelinePreviewModel }) {
  return (
    <Card>
      <CardHeader className="border-b p-4">
        <CardTitle>Draw plan</CardTitle>
        <CardDescription>
          Reimbursement-only planned draw schedule for this preview snapshot.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Draw</TableHead>
              <TableHead>Milestone</TableHead>
              <TableHead>Timing</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {model.draws.map((draw) => (
              <TableRow key={draw.id}>
                <TableCell className="whitespace-normal font-medium">
                  {draw.label}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {draw.linkedMilestoneName || "-"}
                </TableCell>
                <TableCell>
                  Day {draw.day}
                  {draw.customDate ? " · custom" : ""}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(draw.amountDollars)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {labelize(draw.requestStatus)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function downloadPreviewCsv(model: TimelinePreviewModel, snapshotId: string) {
  const csv = buildTimelinePreviewCsv(model);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = buildTimelinePreviewCsvFilename(model.title, snapshotId);
  anchor.click();
  URL.revokeObjectURL(url);
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
});

function formatCurrency(value: number) {
  return currencyFormatter.format(Math.round(value));
}

function labelize(value: string) {
  return value.replaceAll("_", " ");
}
