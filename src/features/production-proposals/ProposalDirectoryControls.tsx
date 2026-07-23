import { usePaginatedQuery } from "convex/react";
import { Filter, Loader2, Search, X } from "lucide-react";
import type { ReactNode } from "react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import { api } from "../../../convex/_generated/api";
import { cn } from "#/lib/utils.ts";

import type {
  ProductionBuilderOption,
  ProductionKanban,
  ProductionKanbanCard,
  ProductionProposalStatus,
} from "./ProductionProposalSurfaces.tsx";

type AssignmentFilter = "all" | "assigned" | "unassigned";
type ClosingFilter = "all" | "active_build" | "pending_closing" | "pre_closing";
type PlanFilter =
  | "all"
  | "capitalConstrained"
  | "cheapestFeasible"
  | "fastest"
  | "unselected";
type ReviewFilter =
  | "all"
  | "none"
  | "approved"
  | "requested_changes"
  | "rejected";
type StageFilter = "all" | ProductionProposalStatus;

export interface ProposalDirectoryBrokerOption {
  email?: string;
  isPrincipal: boolean;
  name: string;
  workosUserId: string;
}

export interface ProposalDirectoryFilterOptions {
  brokers: ProposalDirectoryBrokerOption[];
  builders: ProductionBuilderOption[];
}

export interface ProposalDirectoryFilterState {
  approvedFrom: string;
  approvedTo: string;
  assignedBrokerWorkosUserId: string;
  assignment: AssignmentFilter;
  builderProfileId: string;
  closedFrom: string;
  closedTo: string;
  closingState: ClosingFilter;
  createdFrom: string;
  createdTo: string;
  maxBorrowerCoPayRate: string;
  maxBorrowerStartingCash: string;
  maxBudget: string;
  maxInterestRate: string;
  maxLenderDrawPolicyLimit: string;
  minBorrowerCoPayRate: string;
  minBorrowerStartingCash: string;
  minBudget: string;
  minInterestRate: string;
  minLenderDrawPolicyLimit: string;
  planKey: PlanFilter;
  proposedStartFrom: string;
  proposedStartTo: string;
  reviewOutcome: ReviewFilter;
  stage: StageFilter;
  submittedFrom: string;
  submittedTo: string;
  updatedFrom: string;
  updatedTo: string;
}

export const EMPTY_PROPOSAL_DIRECTORY_FILTERS: ProposalDirectoryFilterState = {
  approvedFrom: "",
  approvedTo: "",
  assignedBrokerWorkosUserId: "all",
  assignment: "all",
  builderProfileId: "all",
  closingState: "all",
  closedFrom: "",
  closedTo: "",
  createdFrom: "",
  createdTo: "",
  maxBorrowerStartingCash: "",
  maxBorrowerCoPayRate: "",
  maxBudget: "",
  maxInterestRate: "",
  maxLenderDrawPolicyLimit: "",
  minBorrowerStartingCash: "",
  minBorrowerCoPayRate: "",
  minBudget: "",
  minInterestRate: "",
  minLenderDrawPolicyLimit: "",
  planKey: "all",
  proposedStartFrom: "",
  proposedStartTo: "",
  reviewOutcome: "all",
  stage: "all",
  submittedFrom: "",
  submittedTo: "",
  updatedFrom: "",
  updatedTo: "",
};

const PROPOSAL_COLUMNS: Array<{
  id: ProductionProposalStatus;
  name: string;
}> = [
  { id: "draft", name: "Draft" },
  { id: "submitted", name: "Submitted" },
  { id: "approved", name: "Approved" },
  { id: "closed", name: "Closed" },
];

export function useBackofficeProposalDirectory(
  workosOrganizationId: string | null
) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ProposalDirectoryFilterState>({
    ...EMPTY_PROPOSAL_DIRECTORY_FILTERS,
  });
  const deferredSearch = useDeferredValue(search.trim());
  const queryFilters = useMemo(() => proposalQueryFilters(filters), [filters]);
  const activeFilterCount = countActiveProposalFilters(filters);
  const hasActiveQuery = deferredSearch.length > 0 || activeFilterCount > 0;
  const args = useMemo(
    () =>
      workosOrganizationId
        ? {
            ...(Object.keys(queryFilters).length > 0
              ? { filters: queryFilters }
              : {}),
            ...(deferredSearch ? { search: deferredSearch } : {}),
            workosOrganizationId,
          }
        : "skip",
    [deferredSearch, queryFilters, workosOrganizationId]
  );
  const { isLoading, loadMore, results, status } = usePaginatedQuery(
    api.production_proposals.listBackofficeProposalDirectory,
    args,
    { initialNumItems: 50 }
  );

  useEffect(() => {
    if (hasActiveQuery && status === "CanLoadMore") {
      loadMore(50);
    }
  }, [hasActiveQuery, loadMore, status]);

  const cards = results as ProductionKanbanCard[];
  const kanban = useMemo<ProductionKanban>(
    () => ({
      columns: PROPOSAL_COLUMNS.map((column) => ({
        ...column,
        cards: cards.filter((card) => card.column === column.id),
      })),
    }),
    [cards]
  );

  return {
    activeFilterCount,
    cards,
    filters,
    hasActiveQuery,
    isLoading,
    kanban,
    loadMore: () => loadMore(50),
    reset: () => {
      startTransition(() => {
        setSearch("");
        setFilters({ ...EMPTY_PROPOSAL_DIRECTORY_FILTERS });
      });
    },
    search,
    setFilters,
    setSearch,
    status,
  };
}

export function ProposalDirectoryControls({
  activeFilterCount,
  filters,
  loading,
  options,
  onFiltersChange,
  onReset,
  onSearchChange,
  resultCount,
  search,
}: {
  activeFilterCount: number;
  filters: ProposalDirectoryFilterState;
  loading: boolean;
  options: ProposalDirectoryFilterOptions;
  onFiltersChange: (filters: ProposalDirectoryFilterState) => void;
  onReset: () => void;
  onSearchChange: (search: string) => void;
  resultCount: number;
  search: string;
}) {
  const update = <Key extends keyof ProposalDirectoryFilterState>(
    key: Key,
    value: ProposalDirectoryFilterState[Key]
  ) => {
    startTransition(() => onFiltersChange({ ...filters, [key]: value }));
  };
  const hasQuery = Boolean(search.trim()) || activeFilterCount > 0;

  return (
    <div className="@container flex w-full min-w-0 flex-col gap-2">
      <div className="flex flex-col gap-2 @[72rem]:flex-row @[72rem]:items-center">
        <div className="relative min-w-0 flex-1 @[72rem]:min-w-[14rem]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search proposals"
            className="pl-8"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search every proposal, builder, broker, email, ID, amount, or date"
            type="search"
            value={search}
          />
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2 @[52rem]:grid-cols-4 @[72rem]:flex @[72rem]:shrink-0 @[72rem]:items-end">
          <FilterSelect
            className="@[72rem]:w-[9.5rem]"
            label="Stage"
            onValueChange={(value) => update("stage", value as StageFilter)}
            value={filters.stage}
          >
            <SelectItem value="all">All stages</SelectItem>
            {PROPOSAL_COLUMNS.map((column) => (
              <SelectItem key={column.id} value={column.id}>
                {column.name}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect
            className="@[72rem]:w-[9.5rem]"
            label="Assignment"
            onValueChange={(value) =>
              update("assignment", value as AssignmentFilter)
            }
            value={filters.assignment}
          >
            <SelectItem value="all">All assignment</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
          </FilterSelect>
          <FilterSelect
            className="@[72rem]:w-[9.5rem]"
            label="Review outcome"
            onValueChange={(value) =>
              update("reviewOutcome", value as ReviewFilter)
            }
            value={filters.reviewOutcome}
          >
            <SelectItem value="all">All outcomes</SelectItem>
            <SelectItem value="none">No decision</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="requested_changes">Changes requested</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </FilterSelect>
          <div className="col-span-2 min-w-0 @[52rem]:col-span-1 @[72rem]:w-auto">
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    className="w-full whitespace-nowrap @[72rem]:w-auto"
                    type="button"
                    variant="outline"
                  >
                    <Filter />
                    More filters
                    {activeFilterCount > 0 ? (
                      <Badge variant="secondary">{activeFilterCount}</Badge>
                    ) : null}
                  </Button>
              }
            />
            <PopoverContent
              align="end"
              className="w-[min(42rem,calc(100vw-2rem))]"
            >
              <div className="grid gap-4">
                <div>
                  <h3 className="font-medium text-sm">Proposal filters</h3>
                  <p className="text-muted-foreground text-xs">
                    Combine ownership, workflow, capital, and date constraints.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <FilterSelect
                    label="Builder"
                    onValueChange={(value) =>
                      update("builderProfileId", value ?? "all")
                    }
                    value={filters.builderProfileId}
                  >
                    <SelectItem value="all">All builders</SelectItem>
                    {options.builders.map((builder) => (
                      <SelectItem key={builder._id} value={builder._id}>
                        <span className="grid min-w-0">
                          <span className="truncate">
                            {builder.displayName}
                          </span>
                          {builder.email ? (
                            <span className="truncate text-muted-foreground text-xs">
                              {builder.email}
                            </span>
                          ) : null}
                        </span>
                      </SelectItem>
                    ))}
                  </FilterSelect>
                  <FilterSelect
                    label="Assigned broker"
                    onValueChange={(value) =>
                      update("assignedBrokerWorkosUserId", value ?? "all")
                    }
                    value={filters.assignedBrokerWorkosUserId}
                  >
                    <SelectItem value="all">All brokers</SelectItem>
                    {options.brokers.map((broker) => (
                      <SelectItem
                        key={broker.workosUserId}
                        value={broker.workosUserId}
                      >
                        {broker.name}
                      </SelectItem>
                    ))}
                  </FilterSelect>
                  <FilterSelect
                    label="Selected plan"
                    onValueChange={(value) =>
                      update("planKey", value as PlanFilter)
                    }
                    value={filters.planKey}
                  >
                    <SelectItem value="all">All plans</SelectItem>
                    <SelectItem value="cheapestFeasible">
                      Cheapest Feasible
                    </SelectItem>
                    <SelectItem value="fastest">Fastest</SelectItem>
                    <SelectItem value="capitalConstrained">
                      Capital-Constrained
                    </SelectItem>
                    <SelectItem value="unselected">No plan selected</SelectItem>
                  </FilterSelect>
                  <FilterSelect
                    label="Closing state"
                    onValueChange={(value) =>
                      update("closingState", value as ClosingFilter)
                    }
                    value={filters.closingState}
                  >
                    <SelectItem value="all">All closing states</SelectItem>
                    <SelectItem value="pre_closing">Pre-closing</SelectItem>
                    <SelectItem value="pending_closing">
                      Pending closing
                    </SelectItem>
                    <SelectItem value="active_build">
                      Converted to active Build
                    </SelectItem>
                  </FilterSelect>
                </div>
                <div className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-5">
                  <RangeInput
                    label="Budget"
                    max={filters.maxBudget}
                    min={filters.minBudget}
                    onMaxChange={(value) => update("maxBudget", value)}
                    onMinChange={(value) => update("minBudget", value)}
                    suffix="$"
                  />
                  <RangeInput
                    label="Borrower starting cash"
                    max={filters.maxBorrowerStartingCash}
                    min={filters.minBorrowerStartingCash}
                    onMaxChange={(value) =>
                      update("maxBorrowerStartingCash", value)
                    }
                    onMinChange={(value) =>
                      update("minBorrowerStartingCash", value)
                    }
                    suffix="$"
                  />
                  <RangeInput
                    label="Lender policy limit"
                    max={filters.maxLenderDrawPolicyLimit}
                    min={filters.minLenderDrawPolicyLimit}
                    onMaxChange={(value) =>
                      update("maxLenderDrawPolicyLimit", value)
                    }
                    onMinChange={(value) =>
                      update("minLenderDrawPolicyLimit", value)
                    }
                    suffix="$"
                  />
                  <RangeInput
                    label="Interest rate"
                    max={filters.maxInterestRate}
                    min={filters.minInterestRate}
                    onMaxChange={(value) => update("maxInterestRate", value)}
                    onMinChange={(value) => update("minInterestRate", value)}
                    suffix="%"
                  />
                  <RangeInput
                    label="Borrower co-pay"
                    max={filters.maxBorrowerCoPayRate}
                    min={filters.minBorrowerCoPayRate}
                    onMaxChange={(value) =>
                      update("maxBorrowerCoPayRate", value)
                    }
                    onMinChange={(value) =>
                      update("minBorrowerCoPayRate", value)
                    }
                    suffix="%"
                  />
                </div>
                <div className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">
                  <DateRangeInput
                    from={filters.proposedStartFrom}
                    label="Proposed start"
                    onFromChange={(value) => update("proposedStartFrom", value)}
                    onToChange={(value) => update("proposedStartTo", value)}
                    to={filters.proposedStartTo}
                  />
                  <DateRangeInput
                    from={filters.createdFrom}
                    label="Created"
                    onFromChange={(value) => update("createdFrom", value)}
                    onToChange={(value) => update("createdTo", value)}
                    to={filters.createdTo}
                  />
                  <DateRangeInput
                    from={filters.updatedFrom}
                    label="Last activity"
                    onFromChange={(value) => update("updatedFrom", value)}
                    onToChange={(value) => update("updatedTo", value)}
                    to={filters.updatedTo}
                  />
                  <DateRangeInput
                    from={filters.submittedFrom}
                    label="Submitted"
                    onFromChange={(value) => update("submittedFrom", value)}
                    onToChange={(value) => update("submittedTo", value)}
                    to={filters.submittedTo}
                  />
                  <DateRangeInput
                    from={filters.approvedFrom}
                    label="Approved"
                    onFromChange={(value) => update("approvedFrom", value)}
                    onToChange={(value) => update("approvedTo", value)}
                    to={filters.approvedTo}
                  />
                  <DateRangeInput
                    from={filters.closedFrom}
                    label="Closed"
                    onFromChange={(value) => update("closedFrom", value)}
                    onToChange={(value) => update("closedTo", value)}
                    to={filters.closedTo}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 border-t pt-4">
                  <span className="text-muted-foreground text-xs">
                    {loading
                      ? "Searching all proposals..."
                      : `${resultCount} loaded matches`}
                  </span>
                  <Button
                    disabled={!hasQuery}
                    onClick={onReset}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <X />
                    Reset filters
                  </Button>
                </div>
              </div>
            </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
      <div className="flex min-h-5 items-center justify-between gap-3 text-muted-foreground text-xs">
        <span>
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" />
              Searching proposal directory
            </span>
          ) : (
            `${resultCount} proposals loaded${hasQuery ? " after filters" : ""}`
          )}
        </span>
        {hasQuery ? (
          <Button onClick={onReset} size="xs" type="button" variant="ghost">
            Clear all
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function FilterSelect({
  children,
  className,
  label,
  onValueChange,
  value,
}: {
  children: ReactNode;
  className?: string;
  label: string;
  onValueChange: (value: string | null) => void;
  value: string;
}) {
  return (
    <div className={cn("grid min-w-0 gap-1 text-xs", className)}>
      <span className="text-muted-foreground">{label}</span>
      <Select onValueChange={onValueChange} value={value}>
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

function RangeInput({
  label,
  max,
  min,
  onMaxChange,
  onMinChange,
  suffix,
}: {
  label: string;
  max: string;
  min: string;
  onMaxChange: (value: string) => void;
  onMinChange: (value: string) => void;
  suffix: string;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="text-muted-foreground text-xs">{label}</legend>
      <div className="grid grid-cols-2 gap-1.5">
        <Input
          aria-label={`Minimum ${label}`}
          inputMode="decimal"
          onChange={(event) => onMinChange(event.target.value)}
          placeholder={`Min ${suffix}`}
          value={min}
        />
        <Input
          aria-label={`Maximum ${label}`}
          inputMode="decimal"
          onChange={(event) => onMaxChange(event.target.value)}
          placeholder={`Max ${suffix}`}
          value={max}
        />
      </div>
    </fieldset>
  );
}

function DateRangeInput({
  from,
  label,
  onFromChange,
  onToChange,
  to,
}: {
  from: string;
  label: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  to: string;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="text-muted-foreground text-xs">{label}</legend>
      <div className="grid grid-cols-2 gap-1.5">
        <Input
          aria-label={`${label} from`}
          onChange={(event) => onFromChange(event.target.value)}
          type="date"
          value={from}
        />
        <Input
          aria-label={`${label} to`}
          onChange={(event) => onToChange(event.target.value)}
          type="date"
          value={to}
        />
      </div>
    </fieldset>
  );
}

function proposalQueryFilters(filters: ProposalDirectoryFilterState) {
  const result: Record<string, number | string> = {};
  addStringFilter(
    result,
    "assignedBrokerWorkosUserId",
    filters.assignedBrokerWorkosUserId
  );
  addStringFilter(result, "assignment", filters.assignment);
  addStringFilter(result, "builderProfileId", filters.builderProfileId);
  addStringFilter(result, "closingState", filters.closingState);
  addStringFilter(result, "planKey", filters.planKey);
  addStringFilter(result, "proposedStartFrom", filters.proposedStartFrom);
  addStringFilter(result, "proposedStartTo", filters.proposedStartTo);
  addStringFilter(result, "reviewOutcome", filters.reviewOutcome);
  addStringFilter(result, "stage", filters.stage);
  addDateFilter(result, "createdFrom", filters.createdFrom, false);
  addDateFilter(result, "createdTo", filters.createdTo, true);
  addDateFilter(result, "updatedFrom", filters.updatedFrom, false);
  addDateFilter(result, "updatedTo", filters.updatedTo, true);
  addDateFilter(result, "submittedFrom", filters.submittedFrom, false);
  addDateFilter(result, "submittedTo", filters.submittedTo, true);
  addDateFilter(result, "approvedFrom", filters.approvedFrom, false);
  addDateFilter(result, "approvedTo", filters.approvedTo, true);
  addDateFilter(result, "closedFrom", filters.closedFrom, false);
  addDateFilter(result, "closedTo", filters.closedTo, true);
  addMoneyFilter(result, "minBudgetCents", filters.minBudget);
  addMoneyFilter(result, "maxBudgetCents", filters.maxBudget);
  addMoneyFilter(
    result,
    "minBorrowerStartingCashCents",
    filters.minBorrowerStartingCash
  );
  addMoneyFilter(
    result,
    "maxBorrowerStartingCashCents",
    filters.maxBorrowerStartingCash
  );
  addMoneyFilter(
    result,
    "minLenderDrawPolicyLimitCents",
    filters.minLenderDrawPolicyLimit
  );
  addMoneyFilter(
    result,
    "maxLenderDrawPolicyLimitCents",
    filters.maxLenderDrawPolicyLimit
  );
  addRateFilter(result, "minInterestAnnualBps", filters.minInterestRate);
  addRateFilter(result, "maxInterestAnnualBps", filters.maxInterestRate);
  addRateFilter(result, "minBorrowerCoPayBps", filters.minBorrowerCoPayRate);
  addRateFilter(result, "maxBorrowerCoPayBps", filters.maxBorrowerCoPayRate);
  return result;
}

function addStringFilter(
  result: Record<string, number | string>,
  key: string,
  value: string
) {
  if (value && value !== "all") {
    result[key] = value;
  }
}

function addMoneyFilter(
  result: Record<string, number | string>,
  key: string,
  value: string
) {
  const parsed = Number(value);
  if (value.trim() && Number.isFinite(parsed)) {
    result[key] = Math.round(parsed * 100);
  }
}

function addRateFilter(
  result: Record<string, number | string>,
  key: string,
  value: string
) {
  const parsed = Number(value);
  if (value.trim() && Number.isFinite(parsed)) {
    result[key] = Math.round(parsed * 100);
  }
}

function addDateFilter(
  result: Record<string, number | string>,
  key: string,
  value: string,
  endOfDay: boolean
) {
  if (!value) {
    return;
  }
  const parsed = Date.parse(
    `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
  );
  if (Number.isFinite(parsed)) {
    result[key] = parsed;
  }
}

function countActiveProposalFilters(filters: ProposalDirectoryFilterState) {
  return Object.entries(filters).filter(
    ([, value]) => value !== "" && value !== "all"
  ).length;
}
