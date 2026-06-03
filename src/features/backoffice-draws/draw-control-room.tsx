"use client";

import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Loader2,
  Search,
  TrendingUp,
} from "lucide-react";
import { type ReactElement, useMemo, useState } from "react";
import { toast } from "sonner";

import { EvilComposedChart } from "#/components/evilcharts/charts/composed-chart.tsx";
import type { ChartConfig } from "#/components/evilcharts/ui/chart.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent } from "#/components/ui/card.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group.tsx";
import { formatCompactCurrency, formatCurrency } from "#/routes/backoffice/builders/-builder-roster-types.ts";
import { cn } from "#/lib/utils.ts";

import {
  drawBadgeVariant,
  drawNeedsAction,
  drawStatusLabel,
} from "./draw-format.ts";
import type {
  BrokerageDrawBuildGroup,
  BrokerageDrawRow,
  BrokerageDrawsResult,
  DrawPulseFilter,
  DrawViewMode,
} from "./draw-types.ts";

const pipelineChartConfig = {
  approved: {
    label: "Approved to release",
    colors: {
      light: ["oklch(0.54 0.14 240)", "oklch(0.62 0.12 240)"],
      dark: ["oklch(0.58 0.14 240)", "oklch(0.68 0.12 240)"],
    },
  },
  planned: {
    label: "Upcoming planned",
    colors: {
      light: ["oklch(0.78 0.02 286)", "oklch(0.88 0.01 286)"],
      dark: ["oklch(0.55 0.02 286)", "oklch(0.72 0.02 286)"],
    },
  },
  released: {
    label: "Released",
    colors: {
      light: ["oklch(0.58 0.16 145)", "oklch(0.68 0.14 145)"],
      dark: ["oklch(0.62 0.16 145)", "oklch(0.72 0.14 145)"],
    },
  },
  requested: {
    label: "Under review",
    colors: {
      light: ["oklch(0.72 0.16 85)", "oklch(0.8 0.14 85)"],
      dark: ["oklch(0.68 0.16 85)", "oklch(0.78 0.14 85)"],
    },
  },
} satisfies ChartConfig;

const exposureChartConfig = {
  amount: {
    label: "Capital",
    colors: {
      light: ["oklch(0.841 0.238 128.85)", "oklch(0.72 0.18 128)"],
      dark: ["oklch(0.78 0.2 128)", "oklch(0.62 0.18 128)"],
    },
  },
} satisfies ChartConfig;

export interface DrawControlRoomHandlers {
  onApproveDraw?: (input: {
    buildId: string;
    drawKey: string;
    note: string;
  }) => Promise<void>;
  onRejectDraw?: (input: {
    buildId: string;
    drawKey: string;
    note: string;
  }) => Promise<void>;
}

interface DrawControlRoomProps extends DrawControlRoomHandlers {
  data: BrokerageDrawsResult | undefined;
  pending: boolean;
}

function matchesPulseFilter(draw: BrokerageDrawRow, filter: DrawPulseFilter) {
  if (filter === "all") {
    return true;
  }
  return draw.status === filter;
}

function matchesSearch(draw: BrokerageDrawRow, query: string) {
  if (!query.trim()) {
    return true;
  }
  const haystack = [
    draw.buildName,
    draw.buildDisplayId,
    draw.builderName,
    draw.location,
    draw.label,
    draw.drawKey,
    draw.milestoneName ?? "",
    draw.requestNote ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

function filterDraws(
  draws: BrokerageDrawRow[],
  pulseFilter: DrawPulseFilter,
  search: string,
) {
  return draws.filter(
    (draw) => matchesPulseFilter(draw, pulseFilter) && matchesSearch(draw, search),
  );
}

export function DrawControlRoom({
  data,
  onApproveDraw,
  onRejectDraw,
  pending,
}: DrawControlRoomProps): ReactElement {
  const [pulseFilter, setPulseFilter] = useState<DrawPulseFilter>("requested");
  const [viewMode, setViewMode] = useState<DrawViewMode>("table");
  const [search, setSearch] = useState("");
  const [selectedDrawId, setSelectedDrawId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewPending, setReviewPending] = useState(false);

  const draws = data?.draws ?? [];
  const filteredDraws = useMemo(
    () => filterDraws(draws, pulseFilter, search),
    [draws, pulseFilter, search],
  );
  const requestQueue = useMemo(
    () => draws.filter((draw) => draw.status === "requested"),
    [draws],
  );

  const filteredBuilds = useMemo(() => {
    const drawIds = new Set(filteredDraws.map((draw) => String(draw.drawId)));
    return (data?.builds ?? [])
      .map((group) => ({
        ...group,
        draws: group.draws.filter((draw) => drawIds.has(String(draw.drawId))),
      }))
      .filter((group) => group.draws.length > 0);
  }, [data?.builds, filteredDraws]);

  const selectedDraw = useMemo(
    () => draws.find((draw) => String(draw.drawId) === selectedDrawId) ?? null,
    [draws, selectedDrawId],
  );

  const summary = data?.summary;
  const pipelineChartData = useMemo(
    () =>
      (data?.chartSeries ?? []).map((row) => ({
        approved: row.approvedCents / 100,
        period: row.periodLabel,
        planned: row.plannedCents / 100,
        released: row.releasedCents / 100,
        requested: row.requestedCents / 100,
      })),
    [data?.chartSeries],
  );
  const exposureChartData = useMemo(
    () =>
      (data?.exposureSnapshot ?? [])
        .filter((row) => row.amountCents > 0)
        .map((row) => ({
          amount: row.amountCents / 100,
          status: row.label,
        })),
    [data?.exposureSnapshot],
  );

  const currentExposureCents =
    (summary?.exposureApprovedCents ?? 0) +
    (summary?.exposureRequestedCents ?? 0);

  async function handleApprove() {
    if (!selectedDraw || !onApproveDraw || reviewNote.trim().length < 3) {
      return;
    }
    setReviewPending(true);
    try {
      await onApproveDraw({
        buildId: String(selectedDraw.buildId),
        drawKey: selectedDraw.drawKey,
        note: reviewNote.trim(),
      });
      toast.success("Draw approved");
      setSelectedDrawId(null);
      setReviewNote("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approval failed");
    } finally {
      setReviewPending(false);
    }
  }

  async function handleReject() {
    if (!selectedDraw || !onRejectDraw || reviewNote.trim().length < 3) {
      return;
    }
    setReviewPending(true);
    try {
      await onRejectDraw({
        buildId: String(selectedDraw.buildId),
        drawKey: selectedDraw.drawKey,
        note: reviewNote.trim(),
      });
      toast.success("Draw rejected");
      setSelectedDrawId(null);
      setReviewNote("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rejection failed");
    } finally {
      setReviewPending(false);
    }
  }

  if (pending && !data) {
    return (
      <div className="grid min-h-[24rem] place-items-center">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading draws...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Draws
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Org-wide reimbursement pipeline: review requests, track approved
          exposure, and scan upcoming planned releases across every active build.
        </p>
      </header>

      {summary ? (
        <InstrumentStrip
          currentExposureCents={currentExposureCents}
          summary={summary}
        />
      ) : null}

      <Frame>
        <FramePanel className="grid gap-4 xl:grid-cols-2">
          <div className="flex min-h-[280px] flex-col gap-2">
            <div>
              <h2 className="font-medium text-sm">Scheduled draw pipeline</h2>
              <p className="text-muted-foreground text-xs">
                Monthly reimbursement volume by lifecycle state (excludes
                rejected draws).
              </p>
            </div>
            {pipelineChartData.length > 0 ? (
              <EvilComposedChart
                barConfig={{
                  approved: pipelineChartConfig.approved,
                  planned: pipelineChartConfig.planned,
                  released: pipelineChartConfig.released,
                  requested: pipelineChartConfig.requested,
                }}
                barRadius={5}
                barSize={22}
                barVariant="duotone"
                chartProps={{ margin: { top: 8, right: 8, bottom: 0, left: 0 } }}
                className="min-h-[240px] flex-1"
                data={pipelineChartData}
                enableHoverHighlight
                lineConfig={{}}
                tooltipRoundness="lg"
                tooltipVariant="frosted-glass"
                xDataKey="period"
                xAxisProps={{
                  tickLine: false,
                  axisLine: false,
                }}
                yAxisProps={{
                  tickFormatter: (value) => formatCompactCurrency(Number(value) * 100),
                  width: 56,
                }}
              />
            ) : (
              <ChartPlaceholder message="Draw schedule chart appears when active builds have planned rows." />
            )}
          </div>
          <div className="flex min-h-[280px] flex-col gap-2">
            <div>
              <h2 className="font-medium text-sm">Capital by state</h2>
              <p className="text-muted-foreground text-xs">
                Snapshot of dollars in each draw lifecycle bucket right now.
              </p>
            </div>
            {exposureChartData.length > 0 ? (
              <EvilComposedChart
                barConfig={{ amount: exposureChartConfig.amount }}
                barRadius={6}
                barSize={36}
                barVariant="gradient"
                chartProps={{ margin: { top: 8, right: 8, bottom: 0, left: 0 } }}
                className="min-h-[240px] flex-1"
                data={exposureChartData}
                enableHoverHighlight
                lineConfig={{}}
                tooltipRoundness="lg"
                tooltipVariant="frosted-glass"
                xDataKey="status"
                xAxisProps={{
                  interval: 0,
                  tickLine: false,
                  axisLine: false,
                }}
                yAxisProps={{
                  tickFormatter: (value) => formatCompactCurrency(Number(value) * 100),
                  width: 56,
                }}
              />
            ) : (
              <ChartPlaceholder message="Exposure breakdown appears when draws exist on active builds." />
            )}
          </div>
        </FramePanel>
      </Frame>

      {requestQueue.length > 0 ? (
        <RequestQueue
          draws={requestQueue}
          onOpen={(draw) => setSelectedDrawId(String(draw.drawId))}
        />
      ) : null}

      {summary ? (
        <PulseStrip
          active={pulseFilter}
          onChange={setPulseFilter}
          summary={summary}
        />
      ) : null}

      <Frame>
        <FramePanel className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search build, draw label, builder, address..."
                value={search}
              />
            </div>
            <ToggleGroup
              onValueChange={(value) => {
                if (value === "by_build" || value === "table") {
                  setViewMode(value);
                }
              }}
              value={viewMode}
              variant="outline"
            >
              <ToggleGroupItem value="by_build">By build</ToggleGroupItem>
              <ToggleGroupItem value="table">All draws</ToggleGroupItem>
            </ToggleGroup>
          </div>

          {filteredDraws.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyMedia variant="icon">
                <CircleDollarSign />
              </EmptyMedia>
              <EmptyTitle>No draws match</EmptyTitle>
              <EmptyDescription>
                {draws.length === 0
                  ? "When builders request reimbursement on active builds, draws appear here for broker review."
                  : "Try clearing filters or widening your search."}
              </EmptyDescription>
              {draws.length === 0 ? (
                <Button nativeButton={false} render={<Link to="/backoffice" />}>
                  Open backoffice home
                </Button>
              ) : null}
            </Empty>
          ) : viewMode === "table" ? (
            <DrawsTable draws={filteredDraws} onOpen={setSelectedDrawId} />
          ) : (
            <div className="flex flex-col gap-3">
              {filteredBuilds.map((group) => (
                <BuildDrawGroup
                  group={group}
                  key={String(group.buildId)}
                  onOpen={setSelectedDrawId}
                />
              ))}
            </div>
          )}
        </FramePanel>
      </Frame>

      <DrawDetailSheet
        canReview={
          selectedDraw?.status === "requested" &&
          Boolean(onApproveDraw && onRejectDraw)
        }
        onApprove={() => void handleApprove()}
        onClose={() => {
          setSelectedDrawId(null);
          setReviewNote("");
        }}
        onReject={() => void handleReject()}
        onReviewNoteChange={setReviewNote}
        open={selectedDraw !== null}
        reviewNote={reviewNote}
        reviewPending={reviewPending}
        draw={selectedDraw}
      />
    </div>
  );
}

function InstrumentStrip({
  currentExposureCents,
  summary,
}: {
  currentExposureCents: number;
  summary: BrokerageDrawsResult["summary"];
}) {
  const tiles = [
    {
      detail: `${summary.requested} awaiting staff review`,
      icon: Clock3,
      label: "Under review",
      tone: summary.requested > 0 ? "text-warning" : "text-muted-foreground",
      value: formatCurrency(summary.exposureRequestedCents),
    },
    {
      detail: `${summary.approved} approved, not yet released`,
      icon: Banknote,
      label: "Approved exposure",
      tone: summary.approved > 0 ? "text-info" : "text-muted-foreground",
      value: formatCurrency(summary.exposureApprovedCents),
    },
    {
      detail: `${summary.planned} scheduled draws`,
      icon: TrendingUp,
      label: "Upcoming planned",
      tone: "text-muted-foreground",
      value: formatCurrency(summary.upcomingPlannedCents),
    },
    {
      detail: `${summary.released} released historically`,
      icon: CheckCircle2,
      label: "Released to date",
      tone: "text-success",
      value: formatCurrency(summary.releasedCents),
    },
  ] as const;

  return (
    <Frame>
      <FramePanel className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="sm:col-span-2 xl:col-span-4 flex flex-col gap-1 border-b border-border/80 pb-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Current capital exposure
          </p>
          <p className="font-display text-3xl font-semibold tabular-nums tracking-tight">
            {formatCurrency(currentExposureCents)}
          </p>
          <p className="text-muted-foreground text-xs">
            Requested plus approved draws not yet released across the portfolio.
          </p>
        </div>
        {tiles.map((tile) => (
          <div
            className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-3"
            key={tile.label}
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <tile.icon className="size-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wide">
                {tile.label}
              </span>
            </div>
            <p className={cn("font-semibold text-lg tabular-nums", tile.tone)}>
              {tile.value}
            </p>
            <p className="text-muted-foreground text-xs">{tile.detail}</p>
          </div>
        ))}
      </FramePanel>
    </Frame>
  );
}

function ChartPlaceholder({ message }: { message: string }) {
  return (
    <div className="grid flex-1 place-items-center rounded-lg border border-dashed bg-muted/15 px-4 text-center text-muted-foreground text-sm">
      {message}
    </div>
  );
}

function RequestQueue({
  draws,
  onOpen,
}: {
  draws: BrokerageDrawRow[];
  onOpen: (draw: BrokerageDrawRow) => void;
}) {
  return (
    <Frame>
      <FramePanel className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-medium text-sm">Draw requests</h2>
            <p className="text-muted-foreground text-xs">
              New reimbursement requests needing broker review.
            </p>
          </div>
          <Badge variant="warning">{draws.length} open</Badge>
        </div>
        <div className="flex flex-col gap-2">
          {draws.map((draw) => (
            <Card
              className="cursor-pointer transition-colors hover:bg-muted/30"
              key={String(draw.drawId)}
              onClick={() => onOpen(draw)}
            >
              <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-sm">{draw.label}</p>
                    <Badge variant={drawBadgeVariant(draw.status)}>
                      {drawStatusLabel(draw.status)}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {draw.buildName} · {draw.buildDisplayId} ·{" "}
                    {draw.builderName}
                  </p>
                  {draw.requestNote ? (
                    <p className="line-clamp-2 text-xs">{draw.requestNote}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <p className="font-semibold text-sm tabular-nums">
                      {formatCurrency(draw.amountCents)}
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      {draw.scheduledDateLabel}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </FramePanel>
    </Frame>
  );
}

function PulseStrip({
  active,
  onChange,
  summary,
}: {
  active: DrawPulseFilter;
  onChange: (filter: DrawPulseFilter) => void;
  summary: BrokerageDrawsResult["summary"];
}) {
  const chips: Array<{
    filter: DrawPulseFilter;
    label: string;
    tone?: "destructive" | "warning" | "default";
    value: number;
  }> = [
    {
      filter: "requested",
      label: "Needs review",
      tone: summary.requested > 0 ? "warning" : "default",
      value: summary.requested,
    },
    {
      filter: "approved",
      label: "Approved",
      tone: summary.approved > 0 ? "default" : "default",
      value: summary.approved,
    },
    { filter: "planned", label: "Planned", value: summary.planned },
    { filter: "released", label: "Released", value: summary.released },
    {
      filter: "rejected",
      label: "Rejected",
      tone: summary.rejected > 0 ? "destructive" : "default",
      value: summary.rejected,
    },
    { filter: "all", label: "All", value: summary.total },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
            active === chip.filter
              ? "border-primary/40 bg-primary/10"
              : "border-border bg-background hover:bg-muted/60",
          )}
          key={chip.filter}
          onClick={() => onChange(chip.filter)}
          type="button"
        >
          <span className="font-medium">{chip.label}</span>
          <span
            className={cn(
              "tabular-nums",
              chip.tone === "destructive" && "text-destructive",
              chip.tone === "warning" && "text-warning",
            )}
          >
            {chip.value}
          </span>
        </button>
      ))}
    </div>
  );
}

function DrawsTable({
  draws,
  onOpen,
}: {
  draws: BrokerageDrawRow[];
  onOpen: (drawId: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Draw</TableHead>
          <TableHead>Build</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Schedule</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {draws.map((draw) => (
          <TableRow
            className="cursor-pointer"
            key={String(draw.drawId)}
            onClick={() => onOpen(String(draw.drawId))}
          >
            <TableCell>
              <div className="font-medium">{draw.label}</div>
              <div className="text-muted-foreground text-xs">{draw.drawKey}</div>
            </TableCell>
            <TableCell>
              <div>{draw.buildName}</div>
              <div className="text-muted-foreground text-xs">
                {draw.builderName}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={drawBadgeVariant(draw.status)}>
                {drawStatusLabel(draw.status)}
              </Badge>
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatCurrency(draw.amountCents)}
            </TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {draw.scheduledDateLabel}
            </TableCell>
            <TableCell>
              {drawNeedsAction(draw.status) ? (
                <ArrowUpRight className="size-4 text-primary" />
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function BuildDrawGroup({
  group,
  onOpen,
}: {
  group: BrokerageDrawBuildGroup;
  onOpen: (drawId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-background/60">
      <div className="flex flex-col gap-2 border-b border-border/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            <p className="font-medium text-sm">{group.buildName}</p>
            <span className="text-muted-foreground text-xs">
              {group.buildDisplayId}
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            {group.builderName} · {group.location}
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link params={{ buildId: String(group.buildId) }} to="/backoffice/builds/$buildId" search={{ tab: "timeline" }} />}
          size="sm"
          variant="outline"
        >
          Open build
          <ExternalLink className="size-3.5" />
        </Button>
      </div>
      <div className="divide-y divide-border/70">
        {group.draws.map((draw) => (
          <button
            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
            key={String(draw.drawId)}
            onClick={() => onOpen(String(draw.drawId))}
            type="button"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">{draw.label}</span>
                <Badge variant={drawBadgeVariant(draw.status)}>
                  {drawStatusLabel(draw.status)}
                </Badge>
              </div>
              <p className="text-muted-foreground text-xs">
                {draw.scheduledDateLabel}
                {draw.milestoneName ? ` · ${draw.milestoneName}` : ""}
              </p>
            </div>
            <span className="shrink-0 font-medium text-sm tabular-nums">
              {formatCurrency(draw.amountCents)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DrawDetailSheet({
  canReview,
  draw,
  onApprove,
  onClose,
  onReject,
  onReviewNoteChange,
  open,
  reviewNote,
  reviewPending,
}: {
  canReview: boolean;
  draw: BrokerageDrawRow | null;
  onApprove: () => void;
  onClose: () => void;
  onReject: () => void;
  onReviewNoteChange: (value: string) => void;
  open: boolean;
  reviewNote: string;
  reviewPending: boolean;
}) {
  return (
    <Sheet onOpenChange={(next) => !next && onClose()} open={open}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{draw?.label ?? "Draw"}</SheetTitle>
          <SheetDescription>
            {draw
              ? `${draw.buildName} · ${formatCurrency(draw.amountCents)}`
              : "Draw details"}
          </SheetDescription>
        </SheetHeader>
        {draw ? (
          <SheetPanel className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={drawBadgeVariant(draw.status)}>
                {drawStatusLabel(draw.status)}
              </Badge>
              <Badge variant="outline">{draw.buildDisplayId}</Badge>
            </div>
            <dl className="grid gap-2 text-sm">
              <DetailRow label="Builder" value={draw.builderName} />
              <DetailRow label="Location" value={draw.location} />
              <DetailRow label="Scheduled" value={draw.scheduledDateLabel} />
              {draw.milestoneName ? (
                <DetailRow label="Milestone" value={draw.milestoneName} />
              ) : null}
              {draw.requestNote ? (
                <DetailRow label="Request note" value={draw.requestNote} />
              ) : null}
              {draw.requestReviewNote ? (
                <DetailRow label="Review note" value={draw.requestReviewNote} />
              ) : null}
            </dl>
            {canReview ? (
              <div className="grid gap-2">
                <Label htmlFor="draw-review-note">Review note</Label>
                <Textarea
                  id="draw-review-note"
                  onChange={(event) => onReviewNoteChange(event.target.value)}
                  placeholder="Document evidence and policy checks..."
                  rows={3}
                  value={reviewNote}
                />
              </div>
            ) : null}
          </SheetPanel>
        ) : null}
        <SheetFooter className="flex-col gap-2 sm:flex-col">
          <Button
            nativeButton={false}
            render={
              draw ? (
                <Link search={{ tab: "timeline" }} params={{ buildId: String(draw.buildId) }} to="/backoffice/builds/$buildId" />
              ) : (
                <span />
              )
            }
            variant="outline"
          >
            Open build workspace
          </Button>
          {canReview ? (
            <div className="flex w-full gap-2">
              <Button
                className="flex-1"
                disabled={reviewNote.trim().length < 3 || reviewPending}
                onClick={onReject}
                variant="outline"
              >
                Reject
              </Button>
              <Button
                className="flex-1"
                disabled={reviewNote.trim().length < 3 || reviewPending}
                onClick={onApprove}
              >
                {reviewPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Approve"
                )}
              </Button>
            </div>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-[11px] uppercase tracking-wide">
        {label}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}
