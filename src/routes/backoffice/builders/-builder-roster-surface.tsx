"use client";

import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
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
import {
  Building2,
  ChevronDown,
  ChevronsUpDown,
  Columns3,
  Hammer,
  HardHat,
  Power,
  Search,
  SlidersHorizontal,
  UserPlus,
  UserRoundCog,
  X,
} from "lucide-react";
import { type ReactElement, useMemo, useState } from "react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
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
import {
  Tooltip,
  TooltipPopup,
  TooltipProvider,
  TooltipTrigger,
} from "#/components/ui/tooltip.tsx";
import { BrokerAssignmentDialog } from "#/features/broker-assignments/BrokerAssignmentDialog.tsx";
import { cn } from "#/lib/utils.ts";

import { BuilderDetailDrawer } from "./-builder-detail-drawer";
import {
  type AssignableBrokerage,
  type BrokerageOption,
  type BuilderRow,
  type BuilderStage,
  formatCompactCurrency,
  formatCurrency,
  formatRelativeTime,
  initials,
  PROPOSAL_STATUS_META,
  PROPOSAL_STATUS_ORDER,
  type ProposalStatus,
  STAGE_META,
  type UnprovisionedBuilder,
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

type StatusFilter = "all" | "active" | "inactive";

const stageFilterFn: FilterFn<BuilderRow> = (row, _columnId, value) => {
  const stages = value as BuilderStage[];
  if (!stages || stages.length === 0) {
    return true;
  }
  return stages.includes(row.original.stage);
};

const globalFilterFn: FilterFn<BuilderRow> = (row, _columnId, value) => {
  const query = String(value).trim().toLowerCase();
  if (!query) {
    return true;
  }
  const builder = row.original;
  const haystack = [
    builder.displayName,
    builder.legalName ?? "",
    builder.organizationName,
    builder.brokerage?.displayName ?? "",
    builder.brokerAssignment?.broker?.name ?? "",
    builder.brokerAssignment?.broker?.email ?? "",
    ...builder.accounts.flatMap((account) => [
      account.name ?? "",
      account.email ?? "",
    ]),
    ...builder.proposals.map((proposal) => proposal.buildName),
    ...builder.builds.map((build) => build.buildName),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
};

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

function UnprovisionedBuildersPanel({
  assignableBrokerages,
  brokerOptionsPending,
  candidates,
  onProvision,
  pending,
}: {
  assignableBrokerages: AssignableBrokerage[];
  brokerOptionsPending: boolean;
  candidates: UnprovisionedBuilder[] | undefined;
  onProvision: BuilderRosterHandlers["onProvisionBuilder"];
  pending: boolean;
}): ReactElement | null {
  const canonicalCandidates = canonicalizeUnprovisionedBuilders(candidates);
  // Hide entirely once loaded and empty: nothing to provision.
  if (!pending && canonicalCandidates.length === 0) {
    return null;
  }
  return (
    <Frame>
      <FramePanel className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <HardHat aria-hidden className="size-4 text-warning-foreground" />
          <h2 className="font-medium text-sm">Builders awaiting a profile</h2>
          {canonicalCandidates.length > 0 ? (
            <Badge size="sm" variant="outline">
              {canonicalCandidates.length}
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          These users hold a builder role but have no builder profile yet.
          Provision one to start underwriting their proposals.
        </p>
        {pending && !candidates ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {canonicalCandidates.map((candidate) => (
              <li
                className="flex items-center justify-between gap-3 p-3"
                key={candidate.workosMembershipId}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-8">
                    {candidate.profilePictureUrl ? (
                      <AvatarImage alt="" src={candidate.profilePictureUrl} />
                    ) : null}
                    <AvatarFallback className="text-[0.7rem]">
                      {initials(candidate.name, candidate.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-sm">
                      {candidate.name ??
                        candidate.email ??
                        candidate.workosUserId}
                    </div>
                    <div className="truncate text-muted-foreground text-xs">
                      {candidate.email ?? candidate.workosUserId}
                      {candidate.brokerageDisplayName
                        ? ` \u00b7 ${candidate.brokerageDisplayName}`
                        : ""}
                    </div>
                  </div>
                </div>
                <ProvisionBuilderDialog
                  assignableBrokerages={assignableBrokerages}
                  brokerOptionsPending={brokerOptionsPending}
                  candidate={candidate}
                  onProvision={onProvision}
                />
              </li>
            ))}
          </ul>
        )}
      </FramePanel>
    </Frame>
  );
}

function canonicalizeUnprovisionedBuilders(
  candidates: UnprovisionedBuilder[] | undefined
) {
  const canonical = new Map<string, UnprovisionedBuilder>();
  for (const candidate of candidates ?? []) {
    const existing = canonical.get(candidate.workosMembershipId);
    canonical.set(
      candidate.workosMembershipId,
      existing
        ? {
            ...existing,
            roleSlugs: [
              ...new Set([...existing.roleSlugs, ...candidate.roleSlugs]),
            ],
          }
        : candidate
    );
  }
  return [...canonical.values()];
}

function ProvisionBuilderDialog({
  assignableBrokerages,
  brokerOptionsPending,
  candidate,
  onProvision,
}: {
  assignableBrokerages: AssignableBrokerage[];
  brokerOptionsPending: boolean;
  candidate: UnprovisionedBuilder;
  onProvision: BuilderRosterHandlers["onProvisionBuilder"];
}): ReactElement {
  const [open, setOpen] = useState(false);
  // Default the company name to the owner's name, then email local part, per
  // the convention that builders fall back to their owner's identity.
  const ownerFallback =
    candidate.name?.trim() ||
    candidate.email?.split("@")[0]?.trim() ||
    candidate.workosUserId;
  const [name, setName] = useState(ownerFallback);
  const brokerage = assignableBrokerages.find(
    (option) => option.workosOrganizationId === candidate.workosOrganizationId
  );
  const brokers = brokerage?.brokers ?? [];
  const defaultBrokerWorkosUserId =
    brokers.find((broker) => broker.isPrincipal)?.workosUserId ??
    brokers[0]?.workosUserId ??
    "";
  const [assignedBrokerWorkosUserId, setAssignedBrokerWorkosUserId] = useState(
    defaultBrokerWorkosUserId
  );
  const [saving, setSaving] = useState(false);
  const trimmed = name.trim();
  const brokerageName = candidate.brokerageDisplayName?.trim().toLowerCase();
  const mirrorsBrokerage =
    brokerageName !== undefined && trimmed.toLowerCase() === brokerageName;
  const selectedBroker = brokers.find(
    (broker) => broker.workosUserId === assignedBrokerWorkosUserId
  );
  const invalid =
    trimmed.length === 0 || mirrorsBrokerage || !selectedBroker || saving;

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName(ownerFallback);
          setAssignedBrokerWorkosUserId(defaultBrokerWorkosUserId);
        }
      }}
      open={open}
    >
      <Button onClick={() => setOpen(true)} size="sm" variant="outline">
        <UserPlus className="size-3.5" />
        Create profile
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create builder profile</DialogTitle>
          <DialogDescription>
            Provision a builder profile for{" "}
            {candidate.name ?? candidate.email ?? candidate.workosUserId} and
            link them as the owner account.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-1">
          <Label htmlFor="builder-company-name">Builder company name</Label>
          <Input
            autoFocus
            id="builder-company-name"
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Northwind Custom Homes"
            value={name}
          />
          {mirrorsBrokerage ? (
            <p className="text-destructive text-xs">
              The builder name must differ from the brokerage name.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Defaults to the owner's name. Edit to use the real company name.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 py-1">
          <Label htmlFor={`builder-broker-${candidate.workosMembershipId}`}>
            Assigned broker
          </Label>
          <Select
            disabled={brokerOptionsPending || brokers.length === 0}
            items={brokers.map((broker) => broker.workosUserId)}
            onValueChange={(value) =>
              setAssignedBrokerWorkosUserId(value ?? "")
            }
            value={assignedBrokerWorkosUserId || undefined}
          >
            <SelectTrigger
              id={`builder-broker-${candidate.workosMembershipId}`}
            >
              <SelectValue>
                {(value) => {
                  const broker = brokers.find(
                    (option) => option.workosUserId === value
                  );
                  return (
                    broker?.name ??
                    broker?.email ??
                    (brokerOptionsPending
                      ? "Loading brokers..."
                      : "Select broker")
                  );
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {brokers.map((broker) => (
                <SelectItem
                  key={broker.workosUserId}
                  onClick={() =>
                    setAssignedBrokerWorkosUserId(broker.workosUserId)
                  }
                  value={broker.workosUserId}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {broker.name ?? broker.email ?? broker.workosUserId}
                    </span>
                    <span className="truncate text-muted-foreground text-xs">
                      {broker.email ?? broker.workosUserId}
                      {broker.isPrincipal ? " · Principal broker" : ""}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!brokerOptionsPending && brokers.length === 0 ? (
            <p className="text-destructive text-xs" role="alert">
              No active eligible brokers are available for this brokerage.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Required. Only active broker members of this brokerage can be
              assigned.
            </p>
          )}
        </div>
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            }
          />
          <Button
            disabled={invalid}
            onClick={async () => {
              setSaving(true);
              try {
                await onProvision({
                  assignedBrokerWorkosUserId,
                  displayName: trimmed,
                  ownerWorkosUserId: candidate.workosUserId,
                  workosOrganizationId: candidate.workosOrganizationId,
                });
                setOpen(false);
              } finally {
                setSaving(false);
              }
            }}
            type="button"
          >
            {saving ? "Creating..." : "Create profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function buildColumns(
  onOpenBrokerAssignment: (builder: BuilderRow) => void
): ColumnDef<BuilderRow>[] {
  return [
    {
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Select ${row.original.displayName}`}
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(checked === true)}
        />
      ),
      enableHiding: false,
      enableSorting: false,
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all Builders on this page"
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? "indeterminate"
                : false
          }
          onCheckedChange={(checked) =>
            table.toggleAllPageRowsSelected(checked === true)
          }
        />
      ),
      id: "select",
      size: 40,
    },
    {
      accessorFn: (row) => row.displayName,
      cell: ({ row }) => <BuilderIdentityCell builder={row.original} />,
      header: ({ column }) => <SortHeader column={column} label="Builder" />,
      id: "builder",
      size: 280,
      sortingFn: (a, b) =>
        a.original.displayName.localeCompare(b.original.displayName),
    },
    {
      accessorFn: (row) =>
        row.brokerAssignment?.broker?.name ??
        row.brokerAssignment?.assignedBrokerWorkosUserId ??
        "",
      cell: ({ row }) => (
        <BrokerAssignmentCell
          builder={row.original}
          onAssign={() => onOpenBrokerAssignment(row.original)}
        />
      ),
      header: ({ column }) => <SortHeader column={column} label="Broker" />,
      id: "broker",
      size: 280,
    },
    {
      accessorFn: (row) => row.stage,
      cell: ({ row }) => {
        const meta = STAGE_META[row.original.stage];
        return (
          <Tooltip>
            <TooltipTrigger
              render={
                <Badge variant={meta.tone}>
                  <StageDot stage={row.original.stage} />
                  {meta.label}
                </Badge>
              }
            />
            <TooltipPopup>{meta.hint}</TooltipPopup>
          </Tooltip>
        );
      },
      filterFn: "stage",
      header: ({ column }) => <SortHeader column={column} label="Stage" />,
      id: "stage",
      size: 132,
    },
    {
      accessorFn: (row) => row.accountCount,
      cell: ({ row }) => <AccountsCell builder={row.original} />,
      header: ({ column }) => <SortHeader column={column} label="Accounts" />,
      id: "accounts",
      size: 132,
    },
    {
      accessorFn: (row) => row.proposalCount,
      cell: ({ row }) => <ProposalsCell builder={row.original} />,
      enableSorting: true,
      header: "Proposal pipeline",
      id: "proposals",
      size: 196,
    },
    {
      accessorFn: (row) => row.builds.length,
      cell: ({ row }) => {
        const builds = row.original.builds;
        const active = builds.filter((b) => b.status === "active").length;
        if (builds.length === 0) {
          return <span className="text-muted-foreground text-sm">{"—"}</span>;
        }
        return (
          <div className="flex items-center gap-1.5 text-sm tabular-nums">
            <Hammer className="size-3.5 text-muted-foreground" />
            <span className="font-medium">{builds.length}</span>
            {active > 0 && (
              <span className="text-muted-foreground text-xs">
                {active} active
              </span>
            )}
          </div>
        );
      },
      header: ({ column }) => <SortHeader column={column} label="Builds" />,
      id: "builds",
      size: 96,
    },
    {
      accessorFn: (row) => row.proposedCapitalCents,
      cell: ({ row }) => (
        <CapitalCell
          approved={row.original.approvedCapitalCents}
          proposed={row.original.proposedCapitalCents}
        />
      ),
      header: ({ column }) => (
        <SortHeader align="right" column={column} label="Capital" />
      ),
      id: "capital",
      size: 148,
    },
    {
      accessorFn: (row) => row.lastActivityAt,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground text-sm">
          {formatRelativeTime(row.original.lastActivityAt)}
        </span>
      ),
      header: ({ column }) => (
        <SortHeader align="right" column={column} label="Last activity" />
      ),
      id: "lastActivity",
      size: 132,
    },
  ];
}

function RosterHeader({
  onInvite,
  pending,
  total,
}: {
  onInvite: () => void;
  pending: boolean;
  total: number;
}): ReactElement {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <h1 className="font-heading font-semibold text-2xl tracking-tight sm:text-3xl">
            Builders
          </h1>
          {!pending && (
            <Badge size="lg" variant="outline">
              {total}
            </Badge>
          )}
        </div>
        <p className="max-w-prose text-muted-foreground text-sm">
          Every provisioned builder, their linked accounts, proposal pipeline,
          and active builds. Select a row to open the full dossier and manage
          accounts.
        </p>
      </div>
      <Button onClick={onInvite} size="sm">
        <UserPlus />
        Invite builder
      </Button>
    </header>
  );
}

interface RosterStats {
  building: number;
  inReview: number;
  pipelineCents: number;
  stalled: number;
  total: number;
}

function computeStats(rows: BuilderRow[]): RosterStats {
  let building = 0;
  let inReview = 0;
  let pipelineCents = 0;
  let stalled = 0;
  for (const row of rows) {
    pipelineCents += row.proposedCapitalCents;
    if (row.stage === "building") {
      building += 1;
    }
    if (row.stage === "in_review") {
      inReview += 1;
    }
    if (
      row.stage === "invited" ||
      row.stage === "no_proposal" ||
      row.stage === "dormant"
    ) {
      stalled += 1;
    }
  }
  return { building, inReview, pipelineCents, stalled, total: rows.length };
}

function StatStrip({
  pending,
  stats,
}: {
  pending: boolean;
  stats: RosterStats;
}): ReactElement {
  const items: { hint: string; label: string; value: string }[] = [
    {
      hint: "Provisioned builder profiles",
      label: "Builders",
      value: String(stats.total),
    },
    {
      hint: "Proposals submitted and awaiting review",
      label: "In review",
      value: String(stats.inReview),
    },
    {
      hint: "Builders with an active build underway",
      label: "Building",
      value: String(stats.building),
    },
    {
      hint: "Total budget across open proposals",
      label: "Pipeline capital",
      value: formatCompactCurrency(stats.pipelineCents),
    },
    {
      hint: "Invited, no-proposal, or dormant builders",
      label: "Needs attention",
      value: String(stats.stalled),
    },
  ];
  return (
    <Frame className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <FramePanel className="flex flex-col gap-1 p-4" key={item.label}>
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {item.label}
          </span>
          {pending ? (
            <Skeleton className="h-7 w-12" />
          ) : (
            <span className="font-heading font-semibold text-2xl tabular-nums">
              {item.value}
            </span>
          )}
        </FramePanel>
      ))}
    </Frame>
  );
}

function Toolbar({
  brokerageFilter,
  brokerages,
  columns,
  globalFilter,
  hasAnyFilter,
  onBrokerageFilter,
  onGlobalFilter,
  onResetFilters,
  onStageFilter,
  onStatusFilter,
  stageFilter,
  statusFilter,
}: {
  brokerageFilter: string;
  brokerages: BrokerageOption[];
  columns: {
    id: string;
    getCanHide: () => boolean;
    getIsVisible: () => boolean;
    toggleVisibility: (v: boolean) => void;
  }[];
  globalFilter: string;
  hasAnyFilter: boolean;
  onBrokerageFilter: (value: string) => void;
  onGlobalFilter: (value: string) => void;
  onResetFilters: () => void;
  onStageFilter: (value: BuilderStage[]) => void;
  onStatusFilter: (value: StatusFilter) => void;
  stageFilter: BuilderStage[];
  statusFilter: StatusFilter;
}): ReactElement {
  const stageOrder: BuilderStage[] = [
    "invited",
    "no_proposal",
    "drafting",
    "in_review",
    "approved",
    "building",
    "closed",
    "dormant",
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search builders"
            className="ps-8"
            onChange={(event) => onGlobalFilter(event.target.value)}
            placeholder="Search builders, accounts, builds"
            type="search"
            value={globalFilter}
          />
        </div>

        <Select
          onValueChange={(value) => onStatusFilter(value as StatusFilter)}
          value={statusFilter}
        >
          <SelectTrigger className="w-36" size="sm">
            <SelectValue>
              {(value) =>
                statusItems.find((item) => item.value === value)?.label ??
                "All statuses"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {statusItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select onValueChange={onBrokerageFilter} value={brokerageFilter}>
          <SelectTrigger className="w-44" size="sm">
            <Building2 className="size-3.5 opacity-80" />
            <SelectValue>
              {(value) =>
                value === "all"
                  ? "All brokerages"
                  : (brokerages.find((b) => b._id === value)?.displayName ??
                    "All brokerages")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All brokerages</SelectItem>
            {brokerages.map((brokerage) => (
              <SelectItem key={brokerage._id} value={brokerage._id}>
                {brokerage.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ColumnVisibilityMenu columns={columns} />

        {hasAnyFilter && (
          <Button onClick={onResetFilters} size="sm" variant="ghost">
            <X />
            Clear
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        <SlidersHorizontal className="size-3.5 shrink-0 text-muted-foreground" />
        <ToggleGroup
          className="flex-wrap"
          onValueChange={(value) => onStageFilter(value as BuilderStage[])}
          size="sm"
          value={stageFilter}
          variant="outline"
        >
          {stageOrder.map((stage) => (
            <ToggleGroupItem
              className="gap-1.5 px-2.5"
              key={stage}
              value={stage}
            >
              <StageDot stage={stage} />
              {STAGE_META[stage].label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
}

const statusItems = [
  { label: "All statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

function ColumnVisibilityMenu({
  columns,
}: {
  columns: {
    id: string;
    getCanHide: () => boolean;
    getIsVisible: () => boolean;
    toggleVisibility: (v: boolean) => void;
  }[];
}): ReactElement {
  const hideable = columns.filter((column) => column.getCanHide());
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" variant="outline">
            <Columns3 />
            Columns
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hideable.map((column) => (
          <DropdownMenuCheckboxItem
            checked={column.getIsVisible()}
            closeOnClick={false}
            key={column.id}
            onCheckedChange={(checked) =>
              column.toggleVisibility(checked === true)
            }
          >
            {COLUMN_LABELS[column.id] ?? column.id}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const COLUMN_LABELS: Record<string, string> = {
  accounts: "Accounts",
  builder: "Builder",
  builds: "Builds",
  capital: "Capital",
  lastActivity: "Last activity",
  proposals: "Proposal pipeline",
  stage: "Stage",
};

function BulkActionBar({
  busyDisabled,
  onActivate,
  onAssign,
  onClear,
  onDeactivate,
  selectedCount,
}: {
  busyDisabled: boolean;
  onActivate: () => Promise<void>;
  onAssign: () => void;
  onClear: () => void;
  onDeactivate: () => Promise<void>;
  selectedCount: number;
}): ReactElement {
  return (
    <Frame>
      <FramePanel className="flex flex-wrap items-center gap-2 p-2.5">
        <span className="font-medium text-sm">{selectedCount} selected</span>
        <div className="flex-1" />
        <Button disabled={busyDisabled} onClick={onAssign} size="sm">
          <UserRoundCog />
          Assign broker
        </Button>
        <Button
          disabled={busyDisabled}
          onClick={() => onActivate()}
          size="sm"
          variant="outline"
        >
          <Power />
          Activate
        </Button>
        <Button
          disabled={busyDisabled}
          onClick={() => onDeactivate()}
          size="sm"
          variant="destructive-outline"
        >
          <Power />
          Deactivate
        </Button>
        <Button onClick={onClear} size="sm" variant="ghost">
          <X />
          Clear
        </Button>
      </FramePanel>
    </Frame>
  );
}

function BrokerAssignmentCell({
  builder,
  onAssign,
}: {
  builder: BuilderRow;
  onAssign: () => void;
}): ReactElement {
  const assignment = builder.brokerAssignment;
  const broker = assignment?.broker;
  const assignedBrokerId = assignment?.assignedBrokerWorkosUserId;
  const actionLabel = assignedBrokerId
    ? assignment?.healthy
      ? "Change"
      : "Repair"
    : "Assign";
  const brokerName = broker?.name ?? broker?.email ?? "Unassigned";
  const brokerDetail = broker?.name
    ? broker.email
    : assignedBrokerId && !broker
      ? "Broker record unavailable"
      : "No active broker assignment";

  return (
    <div className="flex min-w-60 items-center gap-2.5">
      <Avatar className="size-7">
        <AvatarImage alt="" src={broker?.profilePictureUrl ?? undefined} />
        <AvatarFallback className="text-[10px]">
          {broker ? initials(broker.name, broker.email) : "?"}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-sm">{brokerName}</span>
          <Badge variant={assignment?.healthy ? "success" : "warning"}>
            {assignment?.healthy ? "Assigned" : "Needs assignment"}
          </Badge>
        </div>
        <p className="truncate text-muted-foreground text-xs">{brokerDetail}</p>
      </div>
      <Button
        aria-label={`${actionLabel} broker for ${builder.displayName}`}
        disabled={builder.status !== "active" || !builder.brokerage}
        onClick={(event) => {
          event.stopPropagation();
          onAssign();
        }}
        size="sm"
        variant="outline"
      >
        {actionLabel}
      </Button>
    </div>
  );
}

function BuilderIdentityCell({
  builder,
}: {
  builder: BuilderRow;
}): ReactElement {
  const owner = builder.ownerAccount;
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-9 rounded-lg">
        {owner?.profilePictureUrl ? (
          <AvatarImage alt="" src={owner.profilePictureUrl} />
        ) : null}
        <AvatarFallback className="rounded-lg bg-primary/12 font-semibold text-[0.7rem] text-primary-foreground">
          {initials(builder.displayName, owner?.email)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-sm">
            {builder.displayName}
          </span>
          {builder.status === "inactive" && (
            <Badge size="sm" variant="outline">
              inactive
            </Badge>
          )}
        </div>
        <span className="truncate text-muted-foreground text-xs">
          {builder.brokerage?.displayName ?? builder.organizationName}
        </span>
      </div>
    </div>
  );
}

function AccountsCell({ builder }: { builder: BuilderRow }): ReactElement {
  if (builder.accounts.length === 0) {
    return <span className="text-muted-foreground text-sm">No accounts</span>;
  }
  const shown = builder.accounts.slice(0, 3);
  const overflow = builder.accounts.length - shown.length;
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {shown.map((account) => (
          <Tooltip key={account.linkId}>
            <TooltipTrigger
              render={
                <Avatar className="size-6 ring-2 ring-background">
                  {account.profilePictureUrl ? (
                    <AvatarImage alt="" src={account.profilePictureUrl} />
                  ) : null}
                  <AvatarFallback className="bg-muted text-[0.6rem]">
                    {initials(account.name, account.email)}
                  </AvatarFallback>
                </Avatar>
              }
            />
            <TooltipPopup>
              {account.name ?? account.email ?? account.workosUserId}
              {" \u00b7 "}
              {account.role}
            </TooltipPopup>
          </Tooltip>
        ))}
      </div>
      {overflow > 0 && (
        <span className="text-muted-foreground text-xs tabular-nums">
          +{overflow}
        </span>
      )}
    </div>
  );
}

function ProposalsCell({ builder }: { builder: BuilderRow }): ReactElement {
  const total = builder.proposalCount;
  if (total === 0) {
    return <span className="text-muted-foreground text-sm">{"—"}</span>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {PROPOSAL_STATUS_ORDER.map((status) => {
          const count = builder.proposalCounts[status];
          if (count === 0) {
            return null;
          }
          return (
            <span
              className={cn("h-full", statusBarClass(status))}
              key={status}
              style={{ width: `${(count / total) * 100}%` }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-xs">
        {PROPOSAL_STATUS_ORDER.filter(
          (status) => builder.proposalCounts[status] > 0
        ).map((status) => (
          <span className="flex items-center gap-1" key={status}>
            <span
              className={cn("size-1.5 rounded-full", statusBarClass(status))}
            />
            {builder.proposalCounts[status]}{" "}
            {PROPOSAL_STATUS_META[status].label.toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

function CapitalCell({
  approved,
  proposed,
}: {
  approved: number;
  proposed: number;
}): ReactElement {
  if (proposed === 0 && approved === 0) {
    return (
      <div className="text-right text-muted-foreground text-sm">{"—"}</div>
    );
  }
  return (
    <div className="flex flex-col items-end">
      <span className="font-medium text-sm tabular-nums">
        {formatCurrency(proposed)}
      </span>
      {approved > 0 && (
        <span className="text-success-foreground text-xs tabular-nums">
          {formatCompactCurrency(approved)} approved
        </span>
      )}
    </div>
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

function StageDot({ stage }: { stage: BuilderStage }): ReactElement {
  return (
    <span
      className={cn("size-2 rounded-full", stageDotClass(stage))}
      data-slot="stage-dot"
    />
  );
}

function stageDotClass(stage: BuilderStage): string {
  switch (stage) {
    case "building":
      return "bg-primary";
    case "approved":
      return "bg-success";
    case "in_review":
      return "bg-info";
    case "drafting":
      return "bg-warning";
    case "closed":
      return "bg-secondary-foreground/40";
    default:
      return "bg-muted-foreground/40";
  }
}

function statusBarClass(status: ProposalStatus): string {
  switch (status) {
    case "approved":
      return "bg-success";
    case "submitted":
      return "bg-info";
    case "draft":
      return "bg-warning";
    default:
      return "bg-muted-foreground/40";
  }
}

function TableFooterBar({
  canNext,
  canPrev,
  onNext,
  onPrev,
  pageCount,
  pageIndex,
  selectedCount,
  totalFiltered,
}: {
  canNext: boolean;
  canPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  pageCount: number;
  pageIndex: number;
  selectedCount: number;
  totalFiltered: number;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-muted-foreground text-sm">
        {totalFiltered} builder{totalFiltered === 1 ? "" : "s"}
        {selectedCount > 0 ? ` \u00b7 ${selectedCount} selected` : ""}
      </span>
      {pageCount > 1 && (
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <Button
                disabled={!canPrev}
                onClick={onPrev}
                size="sm"
                variant="outline"
              >
                Previous
              </Button>
            </PaginationItem>
            <PaginationItem>
              <span className="px-2 text-muted-foreground text-sm tabular-nums">
                {pageIndex + 1} / {pageCount}
              </span>
            </PaginationItem>
            <PaginationItem>
              <Button
                disabled={!canNext}
                onClick={onNext}
                size="sm"
                variant="outline"
              >
                Next
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

function LoadingRows({ columnCount }: { columnCount: number }): ReactElement {
  return (
    <>
      {Array.from({ length: 6 }).map((_, rowIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
        <TableRow className="hover:bg-transparent" key={rowIndex}>
          {Array.from({ length: columnCount }).map((__, cellIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
            <TableCell className="py-3" key={cellIndex}>
              <Skeleton className="h-5 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function RosterEmpty({
  hasFilters,
  onInvite,
  onReset,
}: {
  hasFilters: boolean;
  onInvite: () => void;
  onReset: () => void;
}): ReactElement {
  if (hasFilters) {
    return (
      <Empty>
        <EmptyMedia variant="icon">
          <Search />
        </EmptyMedia>
        <EmptyTitle>No builders match</EmptyTitle>
        <EmptyDescription>
          No builder matches the current search and filters.
        </EmptyDescription>
        <Button className="mt-2" onClick={onReset} size="sm" variant="outline">
          Clear filters
        </Button>
      </Empty>
    );
  }
  return (
    <Empty>
      <EmptyMedia variant="icon">
        <HardHat />
      </EmptyMedia>
      <EmptyTitle>No builders yet</EmptyTitle>
      <EmptyDescription>
        Invite a builder to provision their account and start a proposal.
      </EmptyDescription>
      <Button className="mt-2" onClick={onInvite} size="sm">
        <UserPlus />
        Invite builder
      </Button>
    </Empty>
  );
}
