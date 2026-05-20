import { createFileRoute } from "@tanstack/react-router";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
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
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";

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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
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
  type ActiveBuild,
  type BackofficeDashboardData,
  type DashboardKanbanColumn,
  type DashboardMetric,
  getBackofficeDashboardData,
  type MilestoneKanbanCard,
  type ProposalKanbanCard,
  type QuickAction,
  type ScheduleEvent,
} from "#/features/backoffice-dashboard/mock-data.ts";
import { cn } from "#/lib/utils.ts";

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

function RouteComponent() {
  const dashboard = useMemo(() => getBackofficeDashboardData(), []);

  return <BackofficeDashboard dashboard={dashboard} />;
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
        <MetricGrid metrics={dashboard.metrics} />
        <ActiveBuildsCard builds={dashboard.activeBuilds} />
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
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs/5 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Home</h1>
        <p className="text-muted-foreground text-sm">
          Lender operations dashboard for draw requests, active builds, and
          field review.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <span>Last sync</span>
          <span className="font-medium text-foreground">4 min ago</span>
          <Badge variant="success">Live</Badge>
        </div>
        <div className="relative min-w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search builds"
            className="pl-8"
            placeholder="Search builds..."
            type="search"
          />
        </div>
      </div>
    </div>
  );
}

function MetricGrid({ metrics }: { metrics: DashboardMetric[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card className="min-h-32" key={metric.id}>
          <CardHeader className="gap-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    metricToneClass[metric.tone]
                  )}
                />
                {metric.label}
              </div>
              <Button
                aria-label={`Open ${metric.label}`}
                size="icon-xs"
                variant="ghost"
              >
                <ChevronDown />
              </Button>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="font-semibold text-4xl tracking-tight">
                  {metric.value}
                </div>
                <CardDescription className="mt-1">
                  {metric.detail}
                </CardDescription>
              </div>
              {metric.tone === "destructive" ? (
                <CircleAlert className="size-8 text-destructive" />
              ) : (
                <ArrowUpDown className="size-8 text-muted-foreground" />
              )}
            </div>
            {metric.trend ? (
              <p className="text-muted-foreground text-xs">{metric.trend}</p>
            ) : null}
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

function ActiveBuildsCard({ builds }: { builds: ActiveBuild[] }) {
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
              size="icon-xs"
              variant="ghost"
            >
              <Eye />
            </Button>
            <Button
              aria-label={`More actions for ${row.original.id}`}
              size="icon-xs"
              variant="ghost"
            >
              <MoreHorizontal />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    columns,
    data: filteredBuilds,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Card>
      <CardHeader className="border-b p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <CardTitle className="text-base">Builds - Active</CardTitle>
            <CardDescription>
              {filteredBuilds.length} of {builds.length} builds in view
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative min-w-72">
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
            <div className="flex rounded-lg border bg-background p-0.5">
              {(["all", "onTrack", "behind", "overBudget"] as const).map(
                (status) => (
                  <Button
                    aria-pressed={statusFilter === status}
                    className={cn(
                      "h-7 rounded-md px-2 text-xs",
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
            <Button>
              <Plus />
              New Build
            </Button>
          </div>
        </div>
      </CardHeader>
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
              <TableRow key={row.id}>
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

function MilestoneKanban({
  columns,
  milestones,
}: {
  columns: DashboardKanbanColumn[];
  milestones: MilestoneKanbanCard[];
}) {
  const [cards, setCards] = useState(milestones);

  return (
    <Card>
      <CardHeader className="border-b p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Milestone Kanban</CardTitle>
            <CardDescription>
              Milestones grouped by build; drag to move state
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Switch aria-label="Show completed milestones" />
            Show completed
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <KanbanProvider
          className="min-h-80 min-w-[56rem] gap-0"
          columns={columns}
          data={cards}
          onDataChange={setCards}
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
                    {cards.filter((card) => card.column === column.id).length}
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
                {(card) => <MilestoneCard {...card} />}
              </KanbanCards>
            </KanbanBoard>
          )}
        </KanbanProvider>
      </CardContent>
    </Card>
  );
}

function MilestoneCard(card: MilestoneKanbanCard) {
  return (
    <KanbanCard {...card} className="gap-2 p-3">
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
        <Badge variant={priorityVariant[card.priority]}>{card.priority}</Badge>
        {card.dueLabel ? (
          <Badge variant="outline">{card.dueLabel}</Badge>
        ) : null}
      </div>
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
  const [cards, setCards] = useState(proposals);

  return (
    <Card>
      <CardHeader className="border-b p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-base">Builds - Proposals</CardTitle>
            <CardDescription>Pipeline by stage</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Filter />
              Filter
            </Button>
            <Button variant="outline">
              <Plus />
              Draft new
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <KanbanProvider
          className="min-h-96 min-w-[56rem] gap-0"
          columns={columns}
          data={cards}
          onDataChange={setCards}
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
                      {cards.filter((card) => card.column === column.id).length}
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
                {(card) => <ProposalCard {...card} />}
              </KanbanCards>
            </KanbanBoard>
          )}
        </KanbanProvider>
      </CardContent>
    </Card>
  );
}

function ProposalCard(card: ProposalKanbanCard) {
  return (
    <KanbanCard {...card} className="gap-3 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">{card.name}</p>
          <p className="truncate font-medium text-sm">{card.address}</p>
          <p className="truncate text-muted-foreground text-xs">
            {card.builder}
          </p>
        </div>
        {card.closeLabel ? (
          <Badge variant="success">{card.closeLabel}</Badge>
        ) : null}
      </div>
      <div className="flex items-center justify-between border-t pt-2 text-sm">
        <span className="font-medium">{card.loanAmount}</span>
        <span className="text-muted-foreground">{card.ltv}% LTV</span>
      </div>
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
