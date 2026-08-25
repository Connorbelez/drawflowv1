import type { ColumnDef } from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronsUpDown,
  Hammer,
  HardHat,
  Search,
  UserPlus,
} from "lucide-react";
import type { ReactElement } from "react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty.tsx";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "#/components/ui/pagination.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { TableCell, TableRow } from "#/components/ui/table.tsx";
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from "#/components/ui/tooltip.tsx";
import { cn } from "#/lib/utils.ts";
import {
  type BuilderAccount,
  type BuilderBuild,
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
} from "./-builder-roster-types";

export function buildColumns(
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
                ? ("indeterminate" as never)
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
        const meta = STAGE_META[row.original.stage as BuilderStage];
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
      filterFn: "stage" as never,
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
        const active = builds.filter(
          (b: BuilderBuild) => b.status === "active"
        ).length;
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
        {shown.map((account: BuilderAccount) => (
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
              {" · "}
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

export function TableFooterBar({
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
        {selectedCount > 0 ? ` · ${selectedCount} selected` : ""}
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

export function LoadingRows({
  columnCount,
}: {
  columnCount: number;
}): ReactElement {
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

export function RosterEmpty({
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
