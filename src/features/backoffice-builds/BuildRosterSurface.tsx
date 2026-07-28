"use client";

import { useNavigate } from "@tanstack/react-router";
import {
  type ColumnDef,
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronsUpDown,
  ClipboardCheck,
  FileText,
  MapPin,
  Search,
} from "lucide-react";
import { type ReactElement, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "#/components/ui/pagination.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group.tsx";
import { BuildIdentityCell } from "#/features/builds/BuildIdentityCell.tsx";
import { cn } from "#/lib/utils.ts";

import {
  type BackofficeBuildRosterResult,
  BUILD_PHASE_META,
  BUILD_PHASE_ORDER,
  type BuildRosterPhase,
  type BuildRosterRow,
  formatBuildCompactCurrency,
  formatBuildRelativeTime,
  formatBuildStartDate,
} from "./build-roster-types";

type PhaseFilter = "all" | BuildRosterPhase;

const phaseFilterFn: FilterFn<BuildRosterRow> = (row, _columnId, value) => {
  const phases = value as BuildRosterPhase[];
  if (!phases?.length) {
    return true;
  }
  return phases.includes(row.original.phase);
};

const globalFilterFn: FilterFn<BuildRosterRow> = (row, _columnId, value) => {
  const query = String(value).trim().toLowerCase();
  if (!query) {
    return true;
  }
  const build = row.original;
  const haystack = [
    build.displayId,
    build.buildName,
    build.builderName,
    build.location,
    build.activeMilestoneName,
    build.buildStatusLabel,
    BUILD_PHASE_META[build.phase].label,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
};

export function BuildRosterSurface({
  pending,
  roster,
}: {
  pending: boolean;
  roster: BackofficeBuildRosterResult | undefined;
}): ReactElement {
  const navigate = useNavigate();
  const rows = useMemo(() => roster?.builds ?? [], [roster?.builds]);
  const summary = roster?.summary;
  const [sorting, setSorting] = useState<SortingState>([
    { desc: true, id: "updatedAt" },
  ]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("all");
  const [phaseFacet, setPhaseFacet] = useState<BuildRosterPhase[]>([]);

  const filteredByFacets = useMemo(
    () =>
      rows.filter((row) => {
        if (phaseFilter !== "all" && row.phase !== phaseFilter) {
          return false;
        }
        return true;
      }),
    [rows, phaseFilter]
  );

  const columns = useMemo<ColumnDef<BuildRosterRow>[]>(
    () => buildColumns(),
    []
  );

  const table = useReactTable({
    columns,
    data: filteredByFacets,
    filterFns: { phase: phaseFilterFn },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.buildId,
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn,
    initialState: { pagination: { pageSize: 15 } },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    state: {
      columnFilters: phaseFacet.length
        ? [{ id: "phase", value: phaseFacet }]
        : [],
      globalFilter,
      sorting,
    },
  });

  const phaseColumn = table.getColumn("phase");
  const applyPhaseFacet = (next: BuildRosterPhase[]) => {
    setPhaseFacet(next);
    phaseColumn?.setFilterValue(next.length ? next : undefined);
  };

  const totalFiltered = table.getFilteredRowModel().rows.length;
  const hasAnyFilter =
    Boolean(globalFilter.trim()) ||
    phaseFilter !== "all" ||
    phaseFacet.length > 0;

  const resetFilters = () => {
    setGlobalFilter("");
    setPhaseFilter("all");
    applyPhaseFacet([]);
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-semibold text-xl tracking-tight">Builds</h1>
          <p className="max-w-2xl text-muted-foreground text-sm">
            Every active build in your brokerage, including scheduled starts,
            completed loans, and builds with expired site visits or open draw
            queues.
          </p>
        </div>
        <p className="text-muted-foreground text-xs tabular-nums">
          {pending ? (
            "Loading roster…"
          ) : (
            <>
              {totalFiltered} of {rows.length} builds
              {hasAnyFilter ? " (filtered)" : ""}
            </>
          )}
        </p>
      </header>

      <StatStrip pending={pending} summary={summary} />

      <Frame>
        <FramePanel className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <ToggleGroup
              className="flex flex-wrap justify-start"
              onValueChange={(value) => {
                const next = (value[0] ?? "all") as PhaseFilter;
                setPhaseFilter(next);
                applyPhaseFacet(next === "all" ? [] : [next]);
              }}
              value={[phaseFilter]}
            >
              <ToggleGroupItem aria-label="All phases" value="all">
                All
                {!pending && summary ? (
                  <span className="text-muted-foreground tabular-nums">
                    {summary.total}
                  </span>
                ) : null}
              </ToggleGroupItem>
              {BUILD_PHASE_ORDER.map((phase) => (
                <ToggleGroupItem
                  aria-label={BUILD_PHASE_META[phase].label}
                  key={phase}
                  value={phase}
                >
                  {BUILD_PHASE_META[phase].label}
                  {!pending && summary ? (
                    <span className="text-muted-foreground tabular-nums">
                      {summary[phase]}
                    </span>
                  ) : null}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <div className="grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_11rem_auto] lg:w-[36rem]">
              <span className="relative block">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="*:data-[slot=input]:ps-8"
                  nativeInput
                  onChange={(event) =>
                    setGlobalFilter(event.currentTarget.value)
                  }
                  placeholder="Search build, builder, location, milestone"
                  value={globalFilter}
                />
              </span>
              <Select
                onValueChange={(value) => {
                  const next = (value ?? "all") as PhaseFilter;
                  setPhaseFilter(next);
                  applyPhaseFacet(next === "all" ? [] : [next]);
                }}
                value={phaseFilter}
              >
                <SelectTrigger aria-label="Filter by phase">
                  <SelectValue placeholder="Phase" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All phases</SelectItem>
                  {BUILD_PHASE_ORDER.map((phase) => (
                    <SelectItem key={phase} value={phase}>
                      {BUILD_PHASE_META[phase].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!hasAnyFilter}
                onClick={resetFilters}
                type="button"
                variant="outline"
              >
                Reset
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table
              aria-label="Build roster"
              className="min-w-[1080px]"
              variant="card"
            >
              <TableHeader className="text-muted-foreground text-xs uppercase">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow
                    className="hover:bg-transparent"
                    key={headerGroup.id}
                  >
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        className={cn(
                          "h-10 whitespace-nowrap",
                          header.column.id === "build" &&
                            "sticky left-0 z-10 bg-background",
                          (header.column.id === "budget" ||
                            header.column.id === "actions") &&
                            "text-right"
                        )}
                        key={header.id}
                        style={{ width: header.getSize() }}
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
                {pending ? (
                  <LoadingRows columnCount={columns.length} />
                ) : table.getRowModel().rows.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={columns.length}>
                      <Empty className="py-10">
                        <EmptyMedia variant="icon">
                          <Building2 />
                        </EmptyMedia>
                        <EmptyTitle>No builds match</EmptyTitle>
                        <EmptyDescription>
                          {rows.length === 0
                            ? "Closed proposals with materialized builds will appear here after loan closing."
                            : "Try clearing filters or widening your search."}
                        </EmptyDescription>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      className="group cursor-pointer"
                      key={row.id}
                      onClick={() => {
                        void navigate({ to: row.original.href });
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          className={cn(
                            "align-middle",
                            cell.column.id === "build" &&
                              "sticky left-0 z-10 bg-background group-hover:bg-muted/30",
                            (cell.column.id === "budget" ||
                              cell.column.id === "actions") &&
                              "text-right"
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {!pending && table.getPageCount() > 1 ? (
            <Pagination className="justify-end">
              <PaginationContent>
                <PaginationItem>
                  <Button
                    disabled={!table.getCanPreviousPage()}
                    onClick={() => table.previousPage()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Previous
                  </Button>
                </PaginationItem>
                <PaginationItem>
                  <span className="px-2 text-muted-foreground text-xs tabular-nums">
                    Page {table.getState().pagination.pageIndex + 1} of{" "}
                    {table.getPageCount()}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <Button
                    disabled={!table.getCanNextPage()}
                    onClick={() => table.nextPage()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Next
                  </Button>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          ) : null}
        </FramePanel>
      </Frame>
    </div>
  );
}

function StatStrip({
  pending,
  summary,
}: {
  pending: boolean;
  summary: BackofficeBuildRosterResult["summary"] | undefined;
}): ReactElement {
  const items = [
    { label: "Total builds", value: summary?.total },
    {
      label: "Needs attention",
      tone: "warning" as const,
      value: summary?.attention,
    },
    { label: "Active", value: summary?.active },
    { label: "Scheduled", value: summary?.scheduled },
    { label: "Completed", value: summary?.completed },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => (
        <Frame key={item.label}>
          <FramePanel className="px-4 py-3">
            <p className="text-muted-foreground text-xs">{item.label}</p>
            {pending ? (
              <Skeleton className="mt-2 h-7 w-12" />
            ) : (
              <p
                className={cn(
                  "mt-1 font-semibold text-lg tabular-nums",
                  item.tone === "warning" &&
                    item.value &&
                    item.value > 0 &&
                    "text-warning-foreground"
                )}
              >
                {item.value ?? 0}
              </p>
            )}
          </FramePanel>
        </Frame>
      ))}
    </div>
  );
}

function buildColumns(): ColumnDef<BuildRosterRow>[] {
  return [
    {
      accessorFn: (row) => row.buildName,
      cell: ({ row }) => {
        const build = row.original;
        return (
          <BuildIdentityCell
            buildName={build.buildName}
            href={build.href}
            imageUrl={build.imageUrl}
            latitude={build.locationLatitude}
            location={build.location}
            longitude={build.locationLongitude}
            metadata={
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-muted-foreground text-xs">
                  {build.displayId}
                </span>
                <Badge className="h-5 px-1.5 text-[10px]" variant="outline">
                  {build.buildStatusLabel}
                </Badge>
                {build.loanStatus === "closed" ? (
                  <Badge className="h-5 px-1.5 text-[10px]" variant="secondary">
                    Loan closed
                  </Badge>
                ) : null}
              </div>
            }
          />
        );
      },
      header: ({ column }) => <SortHeader column={column} label="Build" />,
      id: "build",
      size: 260,
    },
    {
      accessorFn: (row) => row.builderName,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.builderName}</span>
      ),
      header: ({ column }) => <SortHeader column={column} label="Builder" />,
      id: "builder",
      size: 160,
    },
    {
      accessorFn: (row) => row.location,
      cell: ({ row }) => (
        <span className="flex max-w-[14rem] items-start gap-1.5 text-muted-foreground text-sm">
          <MapPin className="mt-0.5 size-3.5 shrink-0" />
          <span className="line-clamp-2">{row.original.location}</span>
        </span>
      ),
      header: ({ column }) => <SortHeader column={column} label="Location" />,
      id: "location",
      size: 180,
    },
    {
      accessorFn: (row) => row.phase,
      cell: ({ row }) => {
        const meta = BUILD_PHASE_META[row.original.phase];
        return <Badge variant={meta.tone}>{meta.label}</Badge>;
      },
      filterFn: phaseFilterFn,
      header: ({ column }) => <SortHeader column={column} label="Phase" />,
      id: "phase",
      size: 130,
    },
    {
      accessorFn: (row) => row.activeMilestoneName,
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="line-clamp-1 text-sm">
            {row.original.activeMilestoneName}
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {row.original.milestonesComplete}/{row.original.milestonesTotal}{" "}
            milestones · {row.original.drawCount} draws
          </span>
          {row.original.milestonesBehindSchedule > 0 ? (
            <Badge className="mt-1 w-fit" variant="warning">
              {row.original.milestonesBehindSchedule} behind schedule
            </Badge>
          ) : null}
        </div>
      ),
      header: ({ column }) => (
        <SortHeader column={column} label="Milestone focus" />
      ),
      id: "milestone",
      size: 200,
    },
    {
      accessorFn: (row) => row.totalBudgetCents,
      cell: ({ row }) => (
        <span className="font-medium text-sm tabular-nums">
          {formatBuildCompactCurrency(row.original.totalBudgetCents)}
        </span>
      ),
      header: ({ column }) => (
        <SortHeader align="right" column={column} label="Budget" />
      ),
      id: "budget",
      size: 100,
    },
    {
      accessorFn: (row) => row.daysActive,
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5 text-sm tabular-nums">
          <span>Day {row.original.daysActive}</span>
          <span className="text-muted-foreground text-xs">
            Start {formatBuildStartDate(row.original.startDate)}
          </span>
        </div>
      ),
      header: ({ column }) => <SortHeader column={column} label="Timeline" />,
      id: "timeline",
      size: 130,
    },
    {
      accessorFn: (row) =>
        row.drawRequestsPending +
        row.milestonesInReview +
        row.siteVisitsExpired,
      cell: ({ row }) => <SignalsCell build={row.original} />,
      enableSorting: false,
      header: () => <span>Signals</span>,
      id: "signals",
      size: 150,
    },
    {
      accessorFn: (row) => row.updatedAt,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">
          {formatBuildRelativeTime(row.original.updatedAt)}
        </span>
      ),
      header: ({ column }) => <SortHeader column={column} label="Updated" />,
      id: "updatedAt",
      size: 110,
    },
    {
      cell: ({ row }) => (
        <Button
          aria-label={`Open ${row.original.buildName}`}
          className="pointer-events-none"
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ArrowUpRight className="size-4" />
        </Button>
      ),
      enableSorting: false,
      header: () => <span className="sr-only">Open</span>,
      id: "actions",
      size: 48,
    },
  ];
}

function SignalsCell({ build }: { build: BuildRosterRow }): ReactElement {
  const signals = [
    build.siteVisitsExpired > 0
      ? {
          count: build.siteVisitsExpired,
          icon: AlertTriangle,
          label: "Expired visit",
          tone: "warning" as const,
        }
      : null,
    build.drawRequestsPending > 0
      ? {
          count: build.drawRequestsPending,
          icon: FileText,
          label: "Draw request",
          tone: "info" as const,
        }
      : null,
    build.milestonesInReview > 0
      ? {
          count: build.milestonesInReview,
          icon: ClipboardCheck,
          label: "In review",
          tone: "default" as const,
        }
      : null,
    build.siteVisitsOpen > 0 && build.siteVisitsExpired === 0
      ? {
          count: build.siteVisitsOpen,
          icon: ClipboardCheck,
          label: "Open visit",
          tone: "outline" as const,
        }
      : null,
  ].filter((signal): signal is NonNullable<typeof signal> => signal !== null);

  if (signals.length === 0) {
    return <span className="text-muted-foreground text-xs">Clear</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {signals.map((signal) => (
        <Badge
          className="gap-1 px-1.5 text-[10px]"
          key={signal.label}
          variant={signal.tone}
        >
          <signal.icon className="size-3" />
          {signal.count} {signal.label}
          {signal.count > 1 ? "s" : ""}
        </Badge>
      ))}
    </div>
  );
}

function LoadingRows({ columnCount }: { columnCount: number }): ReactElement {
  return (
    <>
      {Array.from({ length: 6 }, (_, index) => (
        <TableRow className="hover:bg-transparent" key={`loading-${index}`}>
          {Array.from({ length: columnCount }, (__, cellIndex) => (
            <TableCell key={`loading-cell-${cellIndex}`}>
              <Skeleton className="h-5 w-full max-w-[12rem]" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function SortHeader({
  align = "left",
  column,
  label,
}: {
  align?: "left" | "right";
  column: {
    getCanSort: () => boolean;
    getIsSorted: () => false | "asc" | "desc";
    toggleSorting: (desc?: boolean) => void;
  };
  label: string;
}): ReactElement {
  if (!column.getCanSort()) {
    return (
      <span className={cn(align === "right" && "block text-right")}>
        {label}
      </span>
    );
  }
  const sorted = column.getIsSorted();
  return (
    <button
      className={cn(
        "-mx-1.5 flex items-center gap-1 rounded-md px-1.5 py-1 font-medium hover:text-foreground",
        align === "right" && "ml-auto flex-row-reverse"
      )}
      onClick={(event) => {
        event.stopPropagation();
        column.toggleSorting(sorted === "asc");
      }}
      type="button"
    >
      {label}
      {sorted === "asc" ? (
        <ChevronDown className="size-3.5 rotate-180" />
      ) : sorted === "desc" ? (
        <ChevronDown className="size-3.5" />
      ) : (
        <ChevronsUpDown className="size-3.5 opacity-50" />
      )}
    </button>
  );
}
