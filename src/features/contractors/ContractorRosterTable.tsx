"use client";

import {
  type Column,
  type ColumnDef,
  type Row,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  ChevronsUpDown,
  Link2,
  Search,
} from "lucide-react";
import { type ReactElement, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Empty, EmptyDescription, EmptyTitle } from "#/components/ui/empty.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { cn } from "#/lib/utils.ts";

export type ContractorRosterRow = {
  _id: string;
  accountWorkosUserId?: string;
  availabilityWindows?: Array<{
    dayOfWeek?: number;
    endMinute?: number;
    startMinute?: number;
    timezone?: string;
  }>;
  capabilities?: Array<{
    capabilityKey?: string;
    label: string;
    trade?: string;
  }>;
  city?: string;
  defaultPayRateCents?: number;
  defaultPayRateUnit?: string;
  email?: string;
  equipment?: Array<{
    equipmentKey?: string;
    name: string;
    quantity?: number;
  }>;
  kind?: string;
  name: string;
  onboardingStatus?: string;
  phone?: string;
  status?: string;
  trades?: string[];
};

type StatusFilter = "active" | "all" | "inactive";
type AccountFilter = "account_linked" | "all" | "profile_only";

export function ContractorRosterTable({
  contractors,
  detailHrefFor,
  onAddContractor,
  pending = false,
}: {
  contractors: ContractorRosterRow[];
  detailHrefFor: (contractor: ContractorRosterRow) => string;
  onAddContractor: () => void;
  pending?: boolean;
}) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [sorting, setSorting] = useState<SortingState>([
    { desc: false, id: "contractor" },
  ]);

  const filteredByFacets = useMemo(
    () =>
      contractors.filter((contractor) => {
        if (
          statusFilter !== "all" &&
          (contractor.status ?? "active") !== statusFilter
        ) {
          return false;
        }
        if (
          accountFilter !== "all" &&
          accountFilter !== getAccountState(contractor)
        ) {
          return false;
        }
        return true;
      }),
    [contractors, statusFilter, accountFilter],
  );

  const columns = useMemo<ColumnDef<ContractorRosterRow>[]>(
    () => buildColumns(detailHrefFor),
    [detailHrefFor],
  );

  const table = useReactTable({
    columns,
    data: filteredByFacets,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row._id,
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: contractorGlobalFilter,
    initialState: {
      pagination: {
        pageSize: 8,
      },
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    state: {
      globalFilter,
      sorting,
    },
  });

  const hasAnyFilter =
    Boolean(globalFilter.trim()) ||
    statusFilter !== "all" ||
    accountFilter !== "all";
  const totalFiltered = table.getFilteredRowModel().rows.length;
  const resetFilters = () => {
    setGlobalFilter("");
    setStatusFilter("all");
    setAccountFilter("all");
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-semibold text-sm">Roster</h2>
          <p className="text-muted-foreground text-xs">
            Sort, filter, and open contractor profiles from one operating table.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_9rem_10rem_auto] lg:w-[49rem]">
          <span className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="*:data-[slot=input]:ps-8"
              nativeInput
              onChange={(event) => setGlobalFilter(event.currentTarget.value)}
              placeholder="Search contractors, trades, equipment"
              value={globalFilter}
            />
          </span>
          <NativeSelect
            aria-label="Filter contractor status"
            className="w-full"
            onChange={(event) =>
              setStatusFilter(event.currentTarget.value as StatusFilter)
            }
            value={statusFilter}
          >
            <NativeSelectOption value="all">All status</NativeSelectOption>
            <NativeSelectOption value="active">Active</NativeSelectOption>
            <NativeSelectOption value="inactive">Inactive</NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            aria-label="Filter account link"
            className="w-full"
            onChange={(event) =>
              setAccountFilter(event.currentTarget.value as AccountFilter)
            }
            value={accountFilter}
          >
            <NativeSelectOption value="all">All accounts</NativeSelectOption>
            <NativeSelectOption value="account_linked">
              Linked
            </NativeSelectOption>
            <NativeSelectOption value="profile_only">
              Profile only
            </NativeSelectOption>
          </NativeSelect>
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

      <div className="overflow-hidden">
        <Table
          aria-label="Contractor roster"
          className="min-w-[1000px] table-fixed"
          variant="card"
        >
          <TableHeader className="text-muted-foreground text-xs uppercase">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow className="hover:bg-transparent" key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    className={cn(
                      "h-10",
                      header.column.id === "rate" ||
                        header.column.id === "actions"
                        ? "text-right"
                        : undefined,
                    )}
                    key={header.id}
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
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
                <TableCell className="h-72" colSpan={columns.length}>
                  <RosterEmpty
                    hasFilters={hasAnyFilter}
                    onAddContractor={onAddContractor}
                    onReset={resetFilters}
                  />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      className={cn(
                        "overflow-hidden whitespace-normal py-3 align-top leading-normal",
                        cell.column.id === "rate" ||
                          cell.column.id === "actions"
                          ? "text-right"
                          : undefined,
                      )}
                      key={cell.id}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          Showing {totalFiltered} contractor{totalFiltered === 1 ? "" : "s"}
          {hasAnyFilter ? ` from ${contractors.length}` : ""}
        </p>
        {table.getPageCount() > 1 ? (
          <div className="flex items-center gap-2">
            <Button
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              size="sm"
              type="button"
              variant="outline"
            >
              Previous
            </Button>
            <span className="px-1 text-muted-foreground text-sm tabular-nums">
              {table.getState().pagination.pageIndex + 1} /{" "}
              {table.getPageCount()}
            </span>
            <Button
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              size="sm"
              type="button"
              variant="outline"
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function buildColumns(
  detailHrefFor: (contractor: ContractorRosterRow) => string,
): ColumnDef<ContractorRosterRow>[] {
  return [
    {
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <ContractorIdentityCell
          contractor={row.original}
          href={detailHrefFor(row.original)}
        />
      ),
      header: ({ column }) => <SortHeader column={column} label="Contractor" />,
      id: "contractor",
      size: 210,
      sortingFn: (left, right) =>
        left.original.name.localeCompare(right.original.name),
    },
    {
      accessorFn: (row) => (row.trades ?? []).join(" "),
      cell: ({ row }) => (
        <div className="grid gap-1.5">
          <ChipList empty="No trades" values={row.original.trades ?? []} />
          <span className="text-muted-foreground text-xs">
            {row.original.city ?? "Market unset"}
          </span>
        </div>
      ),
      header: ({ column }) => (
        <SortHeader column={column} label="Trade / market" />
      ),
      id: "trade",
      size: 130,
    },
    {
      accessorFn: (row) => row.capabilities?.length ?? 0,
      cell: ({ row }) => (
        <ChipList
          empty="No capabilities"
          values={(row.original.capabilities ?? []).map(
            (capability) => capability.label,
          )}
        />
      ),
      header: ({ column }) => <SortHeader column={column} label="Capabilities" />,
      id: "capabilities",
      size: 145,
    },
    {
      accessorFn: (row) => row.equipment?.length ?? 0,
      cell: ({ row }) => (
        <ChipList
          empty="No equipment"
          values={(row.original.equipment ?? []).map((equipment) =>
            equipment.quantity && equipment.quantity > 1
              ? `${equipment.name} x${equipment.quantity}`
              : equipment.name,
          )}
        />
      ),
      header: ({ column }) => <SortHeader column={column} label="Equipment" />,
      id: "equipment",
      size: 135,
    },
    {
      accessorFn: (row) => row.defaultPayRateCents ?? 0,
      cell: ({ row }) => (
        <div className="grid gap-1">
          <span className="font-semibold text-sm tabular-nums">
            {formatContractorRate(row.original)}
          </span>
          <span className="text-muted-foreground text-xs">
            {row.original.defaultPayRateCents ? "default rate" : "needs rate"}
          </span>
        </div>
      ),
      header: ({ column }) => (
        <SortHeader align="right" column={column} label="Rate" />
      ),
      id: "rate",
      size: 100,
    },
    {
      accessorFn: (row) => row.availabilityWindows?.length ?? 0,
      cell: ({ row }) => <AvailabilityCell contractor={row.original} />,
      header: ({ column }) => (
        <SortHeader column={column} label="Availability" />
      ),
      id: "availability",
      size: 125,
    },
    {
      accessorFn: (row) => getAccountState(row),
      cell: ({ row }) => <AccountCell contractor={row.original} />,
      header: ({ column }) => <SortHeader column={column} label="Account" />,
      id: "account",
      size: 105,
    },
    {
      cell: ({ row }) => (
        <Button
          aria-label={`Open ${row.original.name}`}
          render={<a href={detailHrefFor(row.original)} />}
          size="icon-sm"
          variant="outline"
        >
          <ArrowUpRight />
        </Button>
      ),
      enableSorting: false,
      header: "Open",
      id: "actions",
      size: 50,
    },
  ];
}

function ContractorIdentityCell({
  contractor,
  href,
}: {
  contractor: ContractorRosterRow;
  href: string;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("size-2 rounded-full", statusDotClass(contractor))} />
        <a
          className="truncate font-semibold text-sm hover:text-primary"
          href={href}
        >
          {contractor.name}
        </a>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Badge variant="outline">{contractor.kind ?? "company"}</Badge>
        <span className="min-w-0 truncate text-muted-foreground text-xs">
          {contractor.email ?? contractor.phone ?? "No contact recorded"}
        </span>
      </div>
    </div>
  );
}

function AvailabilityCell({
  contractor,
}: {
  contractor: ContractorRosterRow;
}): ReactElement {
  const window = contractor.availabilityWindows?.[0];
  if (!window) {
    return (
      <span className="text-muted-foreground text-sm">Availability unset</span>
    );
  }

  return (
    <div className="grid min-w-0 gap-1">
      <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-sm">
        <CalendarClock className="size-3.5 text-muted-foreground" />
        <span className="truncate">{formatAvailabilityWindow(window)}</span>
      </span>
      {contractor.availabilityWindows &&
      contractor.availabilityWindows.length > 1 ? (
        <span className="truncate text-muted-foreground text-xs">
          +{contractor.availabilityWindows.length - 1} more window
          {contractor.availabilityWindows.length === 2 ? "" : "s"}
        </span>
      ) : (
        <span className="truncate text-muted-foreground text-xs">
          {window.timezone ?? "Timezone unset"}
        </span>
      )}
    </div>
  );
}

function AccountCell({
  contractor,
}: {
  contractor: ContractorRosterRow;
}): ReactElement {
  const linked = getAccountState(contractor) === "account_linked";
  return (
    <div className="grid min-w-0 gap-1.5">
      <Badge variant={linked ? "success" : "warning"}>
        {linked ? <Link2 /> : null}
        {linked ? "Linked" : "Profile only"}
      </Badge>
      <Badge
        variant={
          (contractor.status ?? "active") === "active" ? "outline" : "warning"
        }
      >
        {contractor.status ?? "active"}
      </Badge>
    </div>
  );
}

function ChipList({ empty, values }: { empty: string; values: string[] }) {
  const visible = values.slice(0, 2);
  if (visible.length === 0) {
    return <span className="text-muted-foreground text-sm">{empty}</span>;
  }
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {visible.map((value) => (
        <Badge className="max-w-full truncate" key={value} variant="secondary">
          {value}
        </Badge>
      ))}
      {values.length > visible.length ? (
        <Badge variant="outline">+{values.length - visible.length}</Badge>
      ) : null}
    </div>
  );
}

function SortHeader({
  align = "left",
  column,
  label,
}: {
  align?: "left" | "right";
  column: Column<ContractorRosterRow, unknown>;
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
        align === "right" && "ml-auto flex-row-reverse",
      )}
      onClick={() => column.toggleSorting(sorted === "asc")}
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

function RosterEmpty({
  hasFilters,
  onAddContractor,
  onReset,
}: {
  hasFilters: boolean;
  onAddContractor: () => void;
  onReset: () => void;
}): ReactElement {
  return (
    <Empty className="min-h-64">
      <EmptyTitle>
        {hasFilters ? "No contractors match the table filters" : "No contractor profiles"}
      </EmptyTitle>
      <EmptyDescription>
        {hasFilters
          ? "Reset the filters or search terms to return to the full contractor roster."
          : "Create the first contractor profile to track work history, capabilities, schedule, and quality signals."}
      </EmptyDescription>
      <Button onClick={hasFilters ? onReset : onAddContractor} type="button">
        {hasFilters ? "Reset filters" : "Add contractor"}
      </Button>
    </Empty>
  );
}

function LoadingRows({ columnCount }: { columnCount: number }): ReactElement {
  return (
    <>
      {Array.from({ length: 5 }).map((_, rowIndex) => (
        <TableRow className="hover:bg-transparent" key={rowIndex}>
          {Array.from({ length: columnCount }).map((__, cellIndex) => (
            <TableCell className="py-4" key={cellIndex}>
              <Skeleton
                className={cn(
                  "h-4",
                  cellIndex === 0 ? "w-44" : "w-24",
                  cellIndex === columnCount - 1 && "ml-auto w-16",
                )}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function contractorGlobalFilter(
  row: Row<ContractorRosterRow>,
  _columnId: string,
  filterValue: string,
): boolean {
  const query = filterValue.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const contractor = row.original;
  const haystack = [
    contractor.name,
    contractor.city,
    contractor.email,
    contractor.phone,
    contractor.kind,
    contractor.status,
    contractor.onboardingStatus,
    ...(contractor.trades ?? []),
    ...(contractor.capabilities ?? []).flatMap((capability) => [
      capability.label,
      capability.trade,
      capability.capabilityKey,
    ]),
    ...(contractor.equipment ?? []).flatMap((equipment) => [
      equipment.name,
      equipment.equipmentKey,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function getAccountState(contractor: ContractorRosterRow): AccountFilter {
  return contractor.accountWorkosUserId ||
    contractor.onboardingStatus === "account_linked"
    ? "account_linked"
    : "profile_only";
}

function formatContractorRate(contractor: ContractorRosterRow): string {
  if (!contractor.defaultPayRateCents) {
    return "Unset";
  }
  return `$${Math.round(contractor.defaultPayRateCents / 100).toLocaleString()}/${contractor.defaultPayRateUnit ?? "hour"}`;
}

function formatAvailabilityWindow(
  window: NonNullable<ContractorRosterRow["availabilityWindows"]>[number],
): string {
  const day = WEEKDAYS[window.dayOfWeek ?? -1] ?? "Day unset";
  if (
    typeof window.startMinute !== "number" ||
    typeof window.endMinute !== "number"
  ) {
    return day;
  }
  return `${day} ${formatMinute(window.startMinute)}-${formatMinute(window.endMinute)}`;
}

function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  const suffix = hours >= 12 ? "p" : "a";
  const normalizedHour = hours % 12 || 12;
  return minutes === 0
    ? `${normalizedHour}${suffix}`
    : `${normalizedHour}:${minutes.toString().padStart(2, "0")}${suffix}`;
}

function statusDotClass(contractor: ContractorRosterRow): string {
  if ((contractor.status ?? "active") !== "active") {
    return "bg-muted-foreground/40";
  }
  return getAccountState(contractor) === "account_linked"
    ? "bg-success"
    : "bg-warning";
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
