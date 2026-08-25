import type { FilterFn } from "@tanstack/react-table";
import {
  Building2,
  Columns3,
  Power,
  Search,
  SlidersHorizontal,
  UserPlus,
  UserRoundCog,
  X,
} from "lucide-react";
import type { ReactElement } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group.tsx";
import {
  type BrokerageOption,
  type BuilderAccount,
  type BuilderBuild,
  type BuilderProposal,
  type BuilderRow,
  type BuilderStage,
  formatCompactCurrency,
  STAGE_META,
} from "./-builder-roster-types";

export type StatusFilter = "all" | "active" | "inactive";

export const stageFilterFn: FilterFn<BuilderRow> = (row, _columnId, value) => {
  const stages = value as BuilderStage[];
  if (!stages || stages.length === 0) {
    return true;
  }
  return stages.includes(row.original.stage);
};

export const globalFilterFn: FilterFn<BuilderRow> = (row, _columnId, value) => {
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
    ...builder.accounts.flatMap((account: BuilderAccount) => [
      account.name ?? "",
      account.email ?? "",
    ]),
    ...builder.proposals.map((proposal: BuilderProposal) => proposal.buildName),
    ...builder.builds.map((build: BuilderBuild) => build.buildName),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
};

export function RosterHeader({
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

export function computeStats(rows: BuilderRow[]): RosterStats {
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

export function StatStrip({
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

export function Toolbar({
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

        <Select
          onValueChange={(value) => onBrokerageFilter(value as string)}
          value={brokerageFilter}
        >
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

export function BulkActionBar({
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

function StageDot({ stage }: { stage: BuilderStage }): ReactElement {
  return <span className={stageDotClass(stage)} data-slot="stage-dot" />;
}

function stageDotClass(stage: BuilderStage): string {
  switch (stage) {
    case "building":
      return "size-2 rounded-full bg-primary";
    case "approved":
      return "size-2 rounded-full bg-success";
    case "in_review":
      return "size-2 rounded-full bg-info";
    case "drafting":
      return "size-2 rounded-full bg-warning";
    case "closed":
      return "size-2 rounded-full bg-secondary-foreground/40";
    default:
      return "size-2 rounded-full bg-muted-foreground/40";
  }
}
