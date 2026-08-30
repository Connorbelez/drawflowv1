"use client";

import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { type ReactElement, useMemo, useState } from "react";

import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { TooltipProvider } from "#/components/ui/tooltip.tsx";
import { BrokerAssignmentDialog } from "#/features/broker-assignments/BrokerAssignmentDialog.tsx";
import { cn } from "#/lib/utils.ts";

import { BuilderDetailDrawer } from "./-builder-detail-drawer";
import {
  BulkActionBar,
  computeStats,
  globalFilterFn,
  RosterHeader,
  StatStrip,
  type StatusFilter,
  stageFilterFn,
  Toolbar,
} from "./-builder-roster-controls";
import { UnprovisionedBuildersPanel } from "./-builder-roster-provisioning";
import {
  buildColumns,
  LoadingRows,
  RosterEmpty,
  TableFooterBar,
} from "./-builder-roster-table";
import type {
  AssignableBrokerage,
  BrokerageOption,
  BuilderRow,
  BuilderStage,
  UnprovisionedBuilder,
} from "./-builder-roster-types";

export interface BuilderRosterHandlers {
  onAssignBroker: (input: {
    assignedBrokerWorkosUserId: string;
    builderProfileIds: string[];
    reason: string;
  }) => Promise<{
    assigned: number;
    processed: number;
    reassigned: number;
    repaired: number;
    unchanged: number;
  }>;
  onInviteBuilder: () => void;
  onLinkAccount: (input: {
    builderProfileId: string;
    role: "owner" | "staff";
    workosUserId: string;
  }) => Promise<void>;
  onProvisionBuilder: (input: {
    assignedBrokerWorkosUserId: string;
    displayName: string;
    ownerWorkosUserId: string;
    workosOrganizationId: string;
  }) => Promise<void>;
  onSetProfileStatus: (input: {
    builderProfileId: string;
    status: "active" | "inactive";
  }) => Promise<void>;
  onUnlinkAccount: (linkId: string) => Promise<void>;
}

interface BuilderRosterSurfaceProps extends BuilderRosterHandlers {
  assignableBrokerages: AssignableBrokerage[];
  brokerages: BrokerageOption[];
  brokerOptionsPending: boolean;
  builders: BuilderRow[] | undefined;
  pending: boolean;
  unprovisionedBuilders: UnprovisionedBuilder[] | undefined;
}

interface BrokerAssignmentDialogState {
  clearSelectionOnSuccess: boolean;
  targets: BuilderRow[];
}

export function BuilderRosterSurface({
  assignableBrokerages,
  brokerOptionsPending,
  brokerages,
  builders,
  onInviteBuilder,
  onAssignBroker,
  onLinkAccount,
  onProvisionBuilder,
  onSetProfileStatus,
  onUnlinkAccount,
  pending,
  unprovisionedBuilders,
}: BuilderRosterSurfaceProps): ReactElement {
  const rows = useMemo(() => builders ?? [], [builders]);
  const [sorting, setSorting] = useState<SortingState>([
    { desc: true, id: "lastActivity" },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [stageFilter, setStageFilter] = useState<BuilderStage[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [brokerageFilter, setBrokerageFilter] = useState<string>("all");
  const [openBuilderId, setOpenBuilderId] = useState<string | null>(null);
  const [assignmentDialog, setAssignmentDialog] =
    useState<BrokerAssignmentDialogState | null>(null);

  const filteredByFacets = useMemo(
    () =>
      rows.filter((builder) => {
        if (statusFilter !== "all" && builder.status !== statusFilter) {
          return false;
        }
        if (
          brokerageFilter !== "all" &&
          builder.brokerage?._id !== brokerageFilter
        ) {
          return false;
        }
        return true;
      }),
    [rows, statusFilter, brokerageFilter]
  );

  const columns = useMemo<ColumnDef<BuilderRow>[]>(
    () =>
      buildColumns((builder) =>
        setAssignmentDialog({
          clearSelectionOnSuccess: false,
          targets: [builder],
        })
      ),
    []
  );

  const table = useReactTable({
    columns,
    data: filteredByFacets,
    enableRowSelection: true,
    filterFns: { stage: stageFilterFn },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row._id,
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn,
    initialState: { pagination: { pageSize: 12 } },
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: {
      columnFilters,
      columnVisibility,
      globalFilter,
      rowSelection,
      sorting,
    },
  });

  // Drive the stage facet through the column filter so the table model owns it.
  const stageColumn = table.getColumn("stage");
  const applyStageFilter = (next: BuilderStage[]) => {
    setStageFilter(next);
    stageColumn?.setFilterValue(next.length ? next : undefined);
  };

  const selectedRows = table.getSelectedRowModel().rows;
  const selectedCount = selectedRows.length;
  const openBuilder = openBuilderId
    ? (rows.find((row) => row._id === openBuilderId) ?? null)
    : null;

  const stats = useMemo(() => computeStats(rows), [rows]);
  const totalFiltered = table.getFilteredRowModel().rows.length;
  const hasAnyFilter =
    Boolean(globalFilter) ||
    stageFilter.length > 0 ||
    statusFilter !== "all" ||
    brokerageFilter !== "all";

  const resetFilters = () => {
    setGlobalFilter("");
    applyStageFilter([]);
    setStatusFilter("all");
    setBrokerageFilter("all");
  };

  return (
    <TooltipProvider delay={300}>
      <div className="flex flex-col gap-5">
        <RosterHeader
          onInvite={onInviteBuilder}
          pending={pending}
          total={rows.length}
        />

        <StatStrip pending={pending} stats={stats} />

        <Frame>
          <FramePanel className="flex flex-col gap-4 p-4">
            <Toolbar
              brokerageFilter={brokerageFilter}
              brokerages={brokerages}
              columns={table.getAllLeafColumns()}
              globalFilter={globalFilter}
              hasAnyFilter={hasAnyFilter}
              onBrokerageFilter={setBrokerageFilter}
              onGlobalFilter={setGlobalFilter}
              onResetFilters={resetFilters}
              onStageFilter={applyStageFilter}
              onStatusFilter={setStatusFilter}
              stageFilter={stageFilter}
              statusFilter={statusFilter}
            />

            {selectedCount > 0 && (
              <BulkActionBar
                busyDisabled={pending}
                onActivate={async () => {
                  await Promise.all(
                    selectedRows.map((row) =>
                      onSetProfileStatus({
                        builderProfileId: row.original._id,
                        status: "active",
                      })
                    )
                  );
                  setRowSelection({});
                }}
                onAssign={() =>
                  setAssignmentDialog({
                    clearSelectionOnSuccess: true,
                    targets: selectedRows.map((row) => row.original),
                  })
                }
                onClear={() => setRowSelection({})}
                onDeactivate={async () => {
                  await Promise.all(
                    selectedRows.map((row) =>
                      onSetProfileStatus({
                        builderProfileId: row.original._id,
                        status: "inactive",
                      })
                    )
                  );
                  setRowSelection({});
                }}
                selectedCount={selectedCount}
              />
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow
                      className="hover:bg-transparent"
                      key={headerGroup.id}
                    >
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          className={cn(
                            "h-9 whitespace-nowrap",
                            header.column.id === "builder" &&
                              "sticky left-0 z-10 bg-background"
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
                      <TableCell className="h-64" colSpan={columns.length}>
                        <RosterEmpty
                          hasFilters={hasAnyFilter}
                          onInvite={onInviteBuilder}
                          onReset={resetFilters}
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        className={cn(
                          "cursor-pointer",
                          row.getIsSelected() && "bg-accent/40"
                        )}
                        data-state={
                          row.getIsSelected() ? "selected" : undefined
                        }
                        key={row.id}
                        onClick={() => setOpenBuilderId(row.original._id)}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            className={cn(
                              "py-2.5",
                              cell.column.id === "builder" &&
                                "sticky left-0 z-10 bg-background"
                            )}
                            key={cell.id}
                            onClick={
                              cell.column.id === "select" ||
                              cell.column.id === "broker" ||
                              cell.column.id === "actions"
                                ? (event) => event.stopPropagation()
                                : undefined
                            }
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

            <TableFooterBar
              canNext={table.getCanNextPage()}
              canPrev={table.getCanPreviousPage()}
              onNext={() => table.nextPage()}
              onPrev={() => table.previousPage()}
              pageCount={table.getPageCount()}
              pageIndex={table.getState().pagination.pageIndex}
              selectedCount={selectedCount}
              totalFiltered={totalFiltered}
            />
          </FramePanel>
        </Frame>

        <UnprovisionedBuildersPanel
          assignableBrokerages={assignableBrokerages}
          brokerOptionsPending={brokerOptionsPending}
          candidates={unprovisionedBuilders}
          onProvision={onProvisionBuilder}
          pending={pending}
        />
      </div>

      <BuilderDetailDrawer
        builder={openBuilder}
        onLinkAccount={onLinkAccount}
        onOpenChange={(open) => {
          if (!open) {
            setOpenBuilderId(null);
          }
        }}
        onSetProfileStatus={onSetProfileStatus}
        onUnlinkAccount={onUnlinkAccount}
        open={openBuilder !== null}
      />

      <BrokerAssignmentDialog
        brokerages={assignableBrokerages}
        brokerOptionsPending={brokerOptionsPending}
        onAssign={onAssignBroker}
        onAssigned={() => {
          if (assignmentDialog?.clearSelectionOnSuccess) {
            setRowSelection({});
          }
          setAssignmentDialog(null);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setAssignmentDialog(null);
          }
        }}
        open={assignmentDialog !== null}
        targets={assignmentDialog?.targets ?? []}
      />
    </TooltipProvider>
  );
}
