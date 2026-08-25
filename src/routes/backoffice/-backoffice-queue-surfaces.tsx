import { useNavigate } from "@tanstack/react-router";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Eye,
  FileText,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#/components/ui/context-menu.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { BACKOFFICE_BUILD_WORKSPACE_SEARCH } from "#/features/backoffice-dashboard/backoffice-build-links.ts";
import type {
  ActiveBuild,
  ProposalKanbanCard,
} from "#/features/backoffice-dashboard/mock-data.ts";
import { BuildIdentityCell } from "#/features/builds/BuildIdentityCell.tsx";
import { cn } from "#/lib/utils.ts";
import {
  formatBuildStatusFilter,
  formatMilestoneState,
} from "./-backoffice-schedule.tsx";

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

export interface ProductionBuilderOption {
  _id: string;
  displayName: string;
  email?: string;
  workosUserIds?: string[];
}

function openBackofficeBuildWorkspace(
  navigate: ReturnType<typeof useNavigate>,
  build: ActiveBuild
) {
  navigate({
    params: { buildId: build.buildKey },
    search: BACKOFFICE_BUILD_WORKSPACE_SEARCH,
    to: "/backoffice/builds/$buildId",
  });
}

export function ActiveBuildsCard({
  builds,
  onDeleteActiveBuild,
  onOpenUnassignedDrafts,
  onStartNewBuildWorkflow,
}: {
  builds: ActiveBuild[];
  onDeleteActiveBuild: (build: ActiveBuild, reason: string) => Promise<unknown>;
  onOpenUnassignedDrafts: () => Promise<unknown> | unknown;
  onStartNewBuildWorkflow: () => Promise<unknown> | unknown;
}) {
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<ActiveBuild | null>(null);
  const [newBuildPending, setNewBuildPending] = useState(false);
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
        accessorKey: "buildName",
        header: "Build",
        cell: ({ row }) => (
          <BuildIdentityCell
            buildName={row.original.buildName ?? row.original.id}
            imageUrl={row.original.imageUrl}
            latitude={row.original.locationLatitude}
            location={row.original.address}
            longitude={row.original.locationLongitude}
            metadata={
              <span className="block max-w-56 truncate text-muted-foreground text-xs">
                {row.original.id} · {row.original.address}
              </span>
            }
          />
        ),
      },
      {
        accessorKey: "builder",
        header: "Builder",
      },
      {
        id: "milestonesDraws",
        header: "Milestones / draws",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.milestoneCount ?? 0} / {row.original.drawCount ?? 0}
          </span>
        ),
      },
      {
        id: "openRequests",
        header: "Open requests",
        cell: ({ row }) => {
          const count = row.original.pendingDrawRequestCount ?? 0;
          return count > 0
            ? `${count} ${count === 1 ? "draw" : "draws"}`
            : "None";
        },
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
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              aria-label={`View ${row.original.id}`}
              onClick={(event) => {
                event.stopPropagation();
                openBackofficeBuildWorkspace(navigate, row.original);
              }}
              size="icon-xs"
              variant="ghost"
            >
              <Eye />
            </Button>
            <Button
              aria-label={`More actions for ${row.original.id}`}
              onClick={(event) => event.stopPropagation()}
              size="icon-xs"
              variant="ghost"
            >
              <MoreHorizontal />
            </Button>
          </div>
        ),
      },
    ],
    [navigate]
  );

  const table = useReactTable({
    columns,
    data: filteredBuilds,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <>
      <Card id="active-builds">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 shrink-0">
            <CardTitle className="text-base">Builds - Active</CardTitle>
            <CardDescription>
              {filteredBuilds.length} of {builds.length} builds in view
            </CardDescription>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:justify-end">
            <div className="relative w-full min-w-48 sm:w-auto sm:max-w-xs sm:flex-1 lg:flex-none">
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
            <div className="flex max-w-full shrink-0 overflow-x-auto rounded-lg border bg-background p-0.5">
              {(["all", "onTrack", "behind", "overBudget"] as const).map(
                (status) => (
                  <Button
                    aria-pressed={statusFilter === status}
                    className={cn(
                      "h-7 shrink-0 rounded-md px-2 text-xs",
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
            <Button
              className="shrink-0"
              onClick={async () => {
                try {
                  await onOpenUnassignedDrafts();
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Unable to open unassigned drafts."
                  );
                }
              }}
              variant="outline"
            >
              <FileText />
              Unassigned drafts
            </Button>
            <Button
              className="shrink-0"
              loading={newBuildPending}
              onClick={async () => {
                setNewBuildPending(true);
                try {
                  await onStartNewBuildWorkflow();
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Unable to start new build workflow."
                  );
                } finally {
                  setNewBuildPending(false);
                }
              }}
            >
              <Plus />
              New Build
            </Button>
          </div>
        </div>
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
              {table.getRowModel().rows.map((row) => {
                const buildRow = (
                  <TableRow
                    className="cursor-pointer"
                    key={row.id}
                    onClick={() => {
                      openBackofficeBuildWorkspace(navigate, row.original);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openBackofficeBuildWorkspace(navigate, row.original);
                      }
                    }}
                    tabIndex={0}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        className={cn(
                          cell.column.id === "actions" && "text-right"
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
                );

                return (
                  <ActiveBuildContextMenu
                    build={row.original}
                    key={row.id}
                    onDeleteRequest={() => setDeleteTarget(row.original)}
                    onOpen={() =>
                      openBackofficeBuildWorkspace(navigate, row.original)
                    }
                  >
                    {buildRow}
                  </ActiveBuildContextMenu>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <DeleteActiveBuildDialog
        build={deleteTarget}
        onDelete={onDeleteActiveBuild}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      />
    </>
  );
}

export function SubmittedProposalsCard({
  approvedPendingClosing,
  onArchiveProposal,
  onOpenProposal,
  onRecordClosing,
  submittedProposals,
}: {
  approvedPendingClosing: ProposalKanbanCard[];
  onArchiveProposal: (
    proposal: ProposalKanbanCard,
    reason: string
  ) => Promise<unknown>;
  onOpenProposal: (proposal: ProposalKanbanCard) => void;
  onRecordClosing: (proposal: ProposalKanbanCard) => void;
  submittedProposals: ProposalKanbanCard[];
}) {
  const navigate = useNavigate();
  const [archiveTarget, setArchiveTarget] = useState<ProposalKanbanCard | null>(
    null
  );
  const reviewCount = submittedProposals.length;
  const closingCount = approvedPendingClosing.length;

  return (
    <>
      <Card id="submitted-proposals">
        <CardHeader className="gap-3 border-b p-4">
          <CardTitle className="text-base">Submitted Proposals</CardTitle>
          <CardDescription>
            Lender-admin review queue and approved proposals pending closing
          </CardDescription>
          <CardAction className="row-span-1">
            <Badge variant={reviewCount + closingCount ? "warning" : "outline"}>
              {reviewCount} submitted · {closingCount} closing
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-0 p-0">
          <ProposalQueueTable
            emptyLabel="No submitted proposals are waiting for admin approval."
            onArchiveRequest={setArchiveTarget}
            onPrimaryAction={(proposal) => {
              navigate({
                params: { planId: proposal.proposalId ?? proposal.id },
                to: "/backoffice/proposals/$planId",
              });
            }}
            primaryActionLabel="Review"
            proposals={submittedProposals}
            showArchive
            title="Submitted for lender review"
          />
          <ProposalQueueTable
            emptyLabel="No approved proposals are pending closing."
            onOpenProposal={onOpenProposal}
            onPrimaryAction={onOpenProposal}
            onRecordClosing={onRecordClosing}
            primaryActionLabel="Details"
            proposals={approvedPendingClosing}
            title="Approved, pending closing"
          />
        </CardContent>
      </Card>
      <ArchiveProposalDialog
        onArchive={onArchiveProposal}
        onOpenChange={(open) => {
          if (!open) {
            setArchiveTarget(null);
          }
        }}
        proposal={archiveTarget}
      />
    </>
  );
}

function ProposalQueueTable({
  emptyLabel,
  onArchiveRequest,
  onOpenProposal,
  onPrimaryAction,
  onRecordClosing,
  primaryActionLabel,
  proposals,
  showArchive = false,
  title,
}: {
  emptyLabel: string;
  onArchiveRequest?: (proposal: ProposalKanbanCard) => void;
  onOpenProposal?: (proposal: ProposalKanbanCard) => void;
  onPrimaryAction: (proposal: ProposalKanbanCard) => void;
  onRecordClosing?: (proposal: ProposalKanbanCard) => void;
  primaryActionLabel: string;
  proposals: ProposalKanbanCard[];
  showArchive?: boolean;
  title: string;
}) {
  return (
    <section className="border-b last:border-b-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h3 className="font-medium text-sm">{title}</h3>
        <Badge variant="outline">{proposals.length}</Badge>
      </div>
      {proposals.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proposal</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {proposals.map((proposal) => {
              const row = (
                <TableRow
                  className={cn(onOpenProposal && "cursor-pointer")}
                  key={proposal.id}
                  onClick={() => onOpenProposal?.(proposal)}
                >
                  <TableCell>
                    <div className="font-medium">{proposal.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {proposal.builder}
                    </div>
                    {proposal.builderEmail ? (
                      <div className="text-muted-foreground text-xs">
                        {proposal.builderEmail}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{proposal.address}</TableCell>
                  <TableCell>{proposal.loanAmount}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        proposal.column === "approved" ? "success" : "warning"
                      }
                    >
                      {proposal.statusLabel ?? "Submitted"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        onClick={(event) => {
                          event.stopPropagation();
                          onPrimaryAction(proposal);
                        }}
                        size="sm"
                        variant="outline"
                      >
                        {primaryActionLabel}
                      </Button>
                      {proposal.column === "approved" && onRecordClosing ? (
                        <Button
                          onClick={(event) => {
                            event.stopPropagation();
                            onRecordClosing(proposal);
                          }}
                          size="sm"
                        >
                          Record closing
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );

              if (showArchive && onArchiveRequest) {
                return (
                  <SubmittedProposalContextMenu
                    key={proposal.id}
                    onArchiveRequest={() => onArchiveRequest(proposal)}
                    onOpen={() => onPrimaryAction(proposal)}
                    proposal={proposal}
                  >
                    {row}
                  </SubmittedProposalContextMenu>
                );
              }

              return proposal.column === "approved" && onRecordClosing ? (
                <ApprovedProposalContextMenu
                  key={proposal.id}
                  onOpenProposal={onOpenProposal}
                  onRecordClosing={onRecordClosing}
                  proposal={proposal}
                >
                  {row}
                </ApprovedProposalContextMenu>
              ) : (
                row
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <div className="px-4 pb-4 text-muted-foreground text-sm">
          {emptyLabel}
        </div>
      )}
    </section>
  );
}

function ActiveBuildContextMenu({
  build,
  children,
  onDeleteRequest,
  onOpen,
}: {
  build: ActiveBuild;
  children: ReactElement;
  onDeleteRequest: () => void;
  onOpen: () => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="w-56">
        <ContextMenuGroup>
          <ContextMenuLabel className="truncate">{build.id}</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onOpen}>
            <Eye aria-hidden />
            Open build workspace
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onDeleteRequest} variant="destructive">
            <Trash2 aria-hidden />
            Delete active build
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function SubmittedProposalContextMenu({
  children,
  onArchiveRequest,
  onOpen,
  proposal,
}: {
  children: ReactElement;
  onArchiveRequest: () => void;
  onOpen: () => void;
  proposal: ProposalKanbanCard;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="w-56">
        <ContextMenuGroup>
          <ContextMenuLabel className="truncate">
            {proposal.name}
          </ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onOpen}>
            <FileText aria-hidden />
            Review proposal
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onArchiveRequest} variant="destructive">
            <Trash2 aria-hidden />
            Archive proposal
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function ArchiveProposalDialog({
  onArchive,
  onOpenChange,
  proposal,
}: {
  onArchive: (proposal: ProposalKanbanCard, reason: string) => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
  proposal: ProposalKanbanCard | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const proposalKey = proposal?.proposalId ?? proposal?.id ?? null;

  useEffect(() => {
    setError(null);
    setPending(false);
    setReason("");
  }, [proposalKey]);

  async function handleArchive() {
    if (!proposal) {
      return;
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("Archive reason is required.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onArchive(proposal, trimmedReason);
      toast.success("Proposal archived.");
      onOpenChange(false);
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "Could not archive proposal."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={proposal !== null}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Archive submitted proposal</AlertDialogTitle>
          <AlertDialogDescription>
            {proposal
              ? `"${proposal.name}" will be removed from the submitted review queue. This action is audited.`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="px-6 pb-2">
          <label
            className="grid gap-2 text-sm"
            htmlFor="archive-proposal-reason"
          >
            <span>Archive reason</span>
            <Textarea
              data-testid="archive-proposal-reason"
              id="archive-proposal-reason"
              onChange={(event) => setReason(event.currentTarget.value)}
              placeholder="Explain why this proposal is being archived."
              rows={3}
              value={reason}
            />
          </label>
        </div>
        {error ? (
          <p className="px-6 text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogClose
            render={<Button variant="outline">Cancel</Button>}
          />
          <Button
            data-testid="archive-proposal-confirm"
            disabled={!reason.trim()}
            loading={pending}
            onClick={handleArchive}
            variant="destructive"
          >
            Archive proposal
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteActiveBuildDialog({
  build,
  onDelete,
  onOpenChange,
}: {
  build: ActiveBuild | null;
  onDelete: (build: ActiveBuild, reason: string) => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const buildKey = build?.buildKey ?? null;

  useEffect(() => {
    setError(null);
    setPending(false);
    setReason("");
  }, [buildKey]);

  async function handleDelete() {
    if (!build) {
      return;
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("Delete reason is required.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onDelete(build, trimmedReason);
      toast.success("Active build deleted.");
      onOpenChange(false);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete active build."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={build !== null}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete active build</AlertDialogTitle>
          <AlertDialogDescription>
            {build
              ? `"${build.id}" at ${build.address} and its live build workspace data will be permanently removed. This cannot be undone.`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="px-6 pb-2">
          <label
            className="grid gap-2 text-sm"
            htmlFor="delete-active-build-reason"
          >
            <span>Delete reason</span>
            <Textarea
              data-testid="delete-active-build-reason"
              id="delete-active-build-reason"
              onChange={(event) => setReason(event.currentTarget.value)}
              placeholder="Explain why this active build is being deleted."
              rows={3}
              value={reason}
            />
          </label>
        </div>
        {error ? (
          <p className="px-6 text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogClose
            render={<Button variant="outline">Cancel</Button>}
          />
          <Button
            data-testid="delete-active-build-confirm"
            disabled={!reason.trim()}
            loading={pending}
            onClick={handleDelete}
            variant="destructive"
          >
            Delete active build
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ApprovedProposalContextMenu({
  children,
  onOpenProposal,
  onRecordClosing,
  proposal,
}: {
  children: ReactElement;
  onOpenProposal?: (proposal: ProposalKanbanCard) => void;
  onRecordClosing: (proposal: ProposalKanbanCard) => void;
  proposal: ProposalKanbanCard;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="w-56">
        <ContextMenuGroup>
          <ContextMenuLabel>Approved proposal</ContextMenuLabel>
          {onOpenProposal ? (
            <ContextMenuItem onClick={() => onOpenProposal(proposal)}>
              Open sidebar
            </ContextMenuItem>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onRecordClosing(proposal)}>
            Record closing
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
