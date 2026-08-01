"use client";

import { useAction } from "convex/react";
import {
  Filter,
  ListChecks,
  MessageCircle,
  Paperclip,
  Search,
  Text,
  Workflow,
} from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
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
import type { Id } from "../../../convex/_generated/dataModel";
import type { ReferenceOption } from "./model.ts";

type SearchResultType =
  | "post"
  | "comment"
  | "actionItem"
  | "asset"
  | "reference";

type SearchStatus =
  | "active"
  | "open"
  | "resolved"
  | "todo"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "done"
  | "cancelled"
  | "available"
  | "superseded";

type AudienceMode = "author_tier_and_higher" | "build_wide" | "custom";

type ReferenceKind =
  | "participant"
  | "milestone"
  | "submilestone"
  | "draw"
  | "evidencePackage"
  | "evidenceAsset"
  | "siteVisit"
  | "document"
  | "material"
  | "actionItem";

export interface BuildCollaborationSearchResult {
  actionItemId?: Id<"buildActionItems">;
  assigneeWorkosUserId?: string;
  audienceMode: AudienceMode;
  authorDisplayName?: string;
  authorWorkosUserId?: string;
  commentId?: Id<"buildCollaborationComments">;
  createdAt: number;
  entityId?: string;
  entityKind?: ReferenceKind;
  excerpt: string;
  focusEntityId?: string;
  focusEntityKind?: "post" | "comment" | "actionItem";
  hasAttachments: boolean;
  href: string;
  id: string;
  matchKind: "filter" | "keyword" | "semantic";
  postId: Id<"buildCollaborationPosts">;
  referenceId?: Id<"buildCollaborationReferences">;
  resolutionState: "open" | "resolved";
  resultType: SearchResultType;
  score: number;
  status: SearchStatus;
  title: string;
  updatedAt: number;
}

interface SearchResponse {
  continueCursor: string | null;
  isDone: boolean;
  page: BuildCollaborationSearchResult[];
}

interface SearchRequest {
  buildId: Id<"activeBuilds">;
  cursor?: string;
  filters: ReturnType<typeof searchRequestFilters>;
  limit: number;
  organizationId: string;
  query: string;
  searchMode: "hybrid";
}

export interface SearchFilterState {
  assignee: string;
  attachmentPresence: "any" | "with" | "without";
  audience: "any" | AudienceMode;
  author: string;
  createdFrom: string;
  createdTo: string;
  entity: "any" | ReferenceKind;
  resolution: "any" | "open" | "resolved";
  status: "any" | SearchStatus;
  type: "any" | SearchResultType;
}

const EMPTY_FILTERS: SearchFilterState = {
  assignee: "any",
  attachmentPresence: "any",
  audience: "any",
  author: "any",
  createdFrom: "",
  createdTo: "",
  entity: "any",
  resolution: "any",
  status: "any",
  type: "any",
};

export function BuildCollaborationSearch({
  buildId,
  onOpen,
  organizationId,
  participants,
}: {
  buildId: Id<"activeBuilds">;
  onOpen: (result: BuildCollaborationSearchResult) => void;
  organizationId?: string;
  participants: ReferenceOption[];
}) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const deferredQuery = useDebouncedValue(query.trim(), 250);
  const activeFilterCount = countActiveFilters(filters);
  const requestFilters = useMemo(
    () => searchRequestFilters(filters),
    [filters]
  );
  const active = deferredQuery.length > 0 || activeFilterCount > 0;
  const runSearch = useAction(
    api.build_collaboration_search.searchBuildCollaboration
  );
  const request = useMemo(
    () =>
      organizationId && active
        ? {
            buildId,
            filters: requestFilters,
            limit: 50,
            organizationId,
            query: deferredQuery,
            searchMode: "hybrid" as const,
          }
        : null,
    [active, buildId, deferredQuery, organizationId, requestFilters]
  );
  const { loadMore, loadingMore, response, searchError } =
    useAuthorizedBuildSearch({ request, runSearch });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search all authorized Build collaboration"
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search posts, replies, work, files, and references"
            value={query}
          />
        </div>
        <SearchFilters
          activeCount={activeFilterCount}
          filters={filters}
          onChange={setFilters}
          participants={participants}
        />
      </div>

      <SearchResultsPanel
        active={active}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
        onOpen={onOpen}
        response={response}
        searchError={searchError}
      />
    </div>
  );
}

function SearchResultsPanel({
  active,
  loadingMore,
  onLoadMore,
  onOpen,
  response,
  searchError,
}: {
  active: boolean;
  loadingMore: boolean;
  onLoadMore: () => Promise<void>;
  onOpen: (result: BuildCollaborationSearchResult) => void;
  response?: SearchResponse;
  searchError?: string;
}) {
  if (!active) {
    return null;
  }
  return (
    <Frame>
      <FramePanel className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <p className="font-medium text-sm">Authorized Build results</p>
            <p className="text-muted-foreground text-xs">
              Permission checks run before retrieval and ranking.
            </p>
          </div>
          {response ? (
            <Badge variant="secondary">{response.page.length} shown</Badge>
          ) : null}
        </div>
        <SearchResultsBody
          loadingMore={loadingMore}
          onLoadMore={onLoadMore}
          onOpen={onOpen}
          response={response}
          searchError={searchError}
        />
      </FramePanel>
    </Frame>
  );
}

function SearchResultsBody({
  loadingMore,
  onLoadMore,
  onOpen,
  response,
  searchError,
}: Omit<Parameters<typeof SearchResultsPanel>[0], "active">) {
  if (searchError && response?.page.length === 0) {
    return (
      <div className="py-8 text-center text-destructive text-sm">
        {searchError}
      </div>
    );
  }
  if (!response) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        Searching this Build…
      </div>
    );
  }
  if (response.page.length === 0) {
    return (
      <div className="grid justify-items-center gap-3 py-8 text-center text-muted-foreground text-sm">
        <p>No authorized collaboration records match this search.</p>
        {!response.isDone && response.continueCursor ? (
          <Button
            disabled={loadingMore}
            onClick={onLoadMore}
            type="button"
            variant="outline"
          >
            {loadingMore ? "Searching more…" : "Search more results"}
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <>
      <div className="grid gap-2">
        {response.page.map((result) => (
          <SearchResultCard
            key={searchResultKey(result)}
            onOpen={onOpen}
            result={result}
          />
        ))}
      </div>
      {searchError ? (
        <p className="text-center text-destructive text-xs">{searchError}</p>
      ) : null}
      {!response.isDone && response.continueCursor ? (
        <div className="flex justify-center pt-1">
          <Button
            disabled={loadingMore}
            onClick={onLoadMore}
            type="button"
            variant="outline"
          >
            {loadingMore ? "Loading more…" : "Load more results"}
          </Button>
        </div>
      ) : null}
    </>
  );
}

function useAuthorizedBuildSearch({
  request,
  runSearch,
}: {
  request: SearchRequest | null;
  runSearch: (request: SearchRequest) => Promise<SearchResponse>;
}) {
  const requestGeneration = useRef(0);
  const [response, setResponse] = useState<SearchResponse>();
  const [searchError, setSearchError] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    setLoadingMore(false);
    setSearchError(undefined);
    if (!request) {
      setResponse(undefined);
      return;
    }
    setResponse(undefined);
    runSearch(request)
      .then((next) => {
        if (requestGeneration.current === generation) {
          setResponse(next);
        }
      })
      .catch(() => {
        if (requestGeneration.current === generation) {
          setSearchError("Search could not load. Try again.");
          setResponse({ continueCursor: null, isDone: true, page: [] });
        }
      });
  }, [request, runSearch]);

  const loadMore = async () => {
    if (!(request && response?.continueCursor) || loadingMore) {
      return;
    }
    const generation = requestGeneration.current;
    setLoadingMore(true);
    setSearchError(undefined);
    try {
      const next = await runSearch({
        ...request,
        cursor: response.continueCursor,
      });
      if (requestGeneration.current !== generation) {
        return;
      }
      setResponse((current) =>
        current
          ? {
              continueCursor: next.continueCursor,
              isDone: next.isDone,
              page: mergeSearchResults(current.page, next.page),
            }
          : next
      );
    } catch {
      if (requestGeneration.current === generation) {
        setSearchError("More results could not load. Try again.");
      }
    } finally {
      if (requestGeneration.current === generation) {
        setLoadingMore(false);
      }
    }
  };

  return { loadMore, loadingMore, response, searchError };
}

function mergeSearchResults(
  current: BuildCollaborationSearchResult[],
  next: BuildCollaborationSearchResult[]
) {
  const merged = new Map(
    current.map((result) => [searchResultKey(result), result])
  );
  for (const result of next) {
    const key = searchResultKey(result);
    const existing = merged.get(key);
    merged.set(
      key,
      existing?.hasAttachments && !result.hasAttachments ? existing : result
    );
  }
  return [...merged.values()];
}

function searchResultKey(result: BuildCollaborationSearchResult) {
  return `${result.resultType}:${result.id}:${result.postId}`;
}

function SearchResultCard({
  onOpen,
  result,
}: {
  onOpen: (result: BuildCollaborationSearchResult) => void;
  result: BuildCollaborationSearchResult;
}) {
  const Icon = searchResultIcon(result.resultType);
  return (
    <Card
      aria-label={`Open ${result.title}`}
      className="w-full rounded-xl text-left shadow-none transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onOpen(result)}
      render={<button type="button" />}
    >
      <CardHeader className="grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 p-3">
        <span className="row-span-2 flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <CardTitle className="truncate text-sm leading-5">
          {result.title}
        </CardTitle>
        <div className="flex items-center gap-1">
          {result.matchKind === "semantic" ? (
            <Badge variant="outline">Related</Badge>
          ) : null}
          <Badge variant="secondary">
            {resultTypeLabel(result.resultType)}
          </Badge>
        </div>
        <CardDescription className="col-start-2 line-clamp-2 text-xs">
          {result.excerpt || "Matching Build record"}
        </CardDescription>
        <div className="col-span-3 mt-2 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
          {result.authorDisplayName ? (
            <span>{result.authorDisplayName}</span>
          ) : null}
          <span>{formatSearchDate(result.updatedAt)}</span>
          <span>{statusLabel(result.status)}</span>
          {result.hasAttachments ? (
            <span className="inline-flex items-center gap-1">
              <Paperclip aria-hidden="true" className="size-3" />
              Attachment
            </span>
          ) : null}
        </div>
      </CardHeader>
    </Card>
  );
}

function SearchFilters({
  activeCount,
  filters,
  onChange,
  participants,
}: {
  activeCount: number;
  filters: SearchFilterState;
  onChange: Dispatch<SetStateAction<SearchFilterState>>;
  participants: ReferenceOption[];
}) {
  const participantOptions = participants.filter(
    (participant) => participant.entityKind === "participant"
  );
  const update = <Key extends keyof SearchFilterState>(
    key: Key,
    value: SearchFilterState[Key]
  ) => onChange((current) => ({ ...current, [key]: value }));
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline">
            <Filter aria-hidden="true" className="size-4" />
            Filters
            {activeCount ? (
              <Badge variant="secondary">{activeCount}</Badge>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[min(38rem,calc(100vw-2rem))]">
        <div className="space-y-4">
          <div>
            <PopoverTitle>Search filters</PopoverTitle>
            <PopoverDescription>
              Narrow only within records you can currently read.
            </PopoverDescription>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FilterSelect
              label="Record type"
              onChange={(value) =>
                update("type", value as SearchFilterState["type"])
              }
              options={TYPE_OPTIONS}
              value={filters.type}
            />
            <FilterSelect
              label="Author"
              onChange={(value) => update("author", value)}
              options={[
                { label: "Any author", value: "any" },
                ...participantOptions.map((participant) => ({
                  label: participant.label,
                  value: participant.id,
                })),
              ]}
              value={filters.author}
            />
            <FilterSelect
              label="Assignee"
              onChange={(value) => update("assignee", value)}
              options={[
                { label: "Any assignee", value: "any" },
                ...participantOptions.map((participant) => ({
                  label: participant.label,
                  value: participant.id,
                })),
              ]}
              value={filters.assignee}
            />
            <FilterSelect
              label="Referenced entity"
              onChange={(value) =>
                update("entity", value as SearchFilterState["entity"])
              }
              options={ENTITY_OPTIONS}
              value={filters.entity}
            />
            <FilterSelect
              label="Status"
              onChange={(value) =>
                update("status", value as SearchFilterState["status"])
              }
              options={STATUS_OPTIONS}
              value={filters.status}
            />
            <FilterSelect
              label="Audience"
              onChange={(value) =>
                update("audience", value as SearchFilterState["audience"])
              }
              options={AUDIENCE_OPTIONS}
              value={filters.audience}
            />
            <FilterSelect
              label="Resolution"
              onChange={(value) =>
                update("resolution", value as SearchFilterState["resolution"])
              }
              options={RESOLUTION_OPTIONS}
              value={filters.resolution}
            />
            <FilterSelect
              label="Attachments"
              onChange={(value) =>
                update(
                  "attachmentPresence",
                  value as SearchFilterState["attachmentPresence"]
                )
              }
              options={ATTACHMENT_OPTIONS}
              value={filters.attachmentPresence}
            />
            <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
              <label
                className="space-y-1 text-xs"
                htmlFor="build-collaboration-search-created-from"
              >
                <span className="font-medium">From</span>
                <Input
                  aria-label="Search created from"
                  id="build-collaboration-search-created-from"
                  onChange={(event) =>
                    update("createdFrom", event.target.value)
                  }
                  type="date"
                  value={filters.createdFrom}
                />
              </label>
              <label
                className="space-y-1 text-xs"
                htmlFor="build-collaboration-search-created-to"
              >
                <span className="font-medium">To</span>
                <Input
                  aria-label="Search created to"
                  id="build-collaboration-search-created-to"
                  onChange={(event) => update("createdTo", event.target.value)}
                  type="date"
                  value={filters.createdTo}
                />
              </label>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              disabled={activeCount === 0}
              onClick={() => onChange(EMPTY_FILTERS)}
              type="button"
              variant="ghost"
            >
              Clear filters
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  const controlId = useId();
  return (
    <label className="space-y-1 text-xs" htmlFor={controlId}>
      <span className="font-medium">{label}</span>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger aria-label={label} id={controlId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export function searchRequestFilters(filters: SearchFilterState) {
  return {
    assigneeWorkosUserIds:
      filters.assignee === "any" ? undefined : [filters.assignee],
    attachmentPresence: filters.attachmentPresence,
    audienceModes: filters.audience === "any" ? undefined : [filters.audience],
    authorWorkosUserIds:
      filters.author === "any" ? undefined : [filters.author],
    createdFrom: dateBoundary(filters.createdFrom, false),
    createdTo: dateBoundary(filters.createdTo, true),
    entityKinds: filters.entity === "any" ? undefined : [filters.entity],
    resolutionStates:
      filters.resolution === "any" ? undefined : [filters.resolution],
    statuses: filters.status === "any" ? undefined : [filters.status],
    types: filters.type === "any" ? undefined : [filters.type],
  };
}

function countActiveFilters(filters: SearchFilterState) {
  return Object.entries(filters).filter(([key, value]) =>
    key === "createdFrom" || key === "createdTo"
      ? Boolean(value)
      : value !== "any"
  ).length;
}

function dateBoundary(value: string, endOfDay: boolean) {
  if (!value) {
    return;
  }
  const timestamp = new Date(
    `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`
  ).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);
  return debounced;
}

function searchResultIcon(type: SearchResultType) {
  switch (type) {
    case "comment":
      return MessageCircle;
    case "actionItem":
      return ListChecks;
    case "asset":
      return Paperclip;
    case "reference":
      return Workflow;
    default:
      return Text;
  }
}

function resultTypeLabel(type: SearchResultType) {
  switch (type) {
    case "actionItem":
      return "Action Item";
    case "asset":
      return "File";
    case "comment":
      return "Reply";
    case "reference":
      return "Reference";
    default:
      return "Post";
  }
}

function statusLabel(status: SearchStatus) {
  return status.replaceAll("_", " ");
}

function formatSearchDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(timestamp);
}

const TYPE_OPTIONS = [
  { label: "Any record", value: "any" },
  { label: "Posts", value: "post" },
  { label: "Replies", value: "comment" },
  { label: "Action Items", value: "actionItem" },
  { label: "Files", value: "asset" },
  { label: "References", value: "reference" },
];

const ENTITY_OPTIONS = [
  { label: "Any entity", value: "any" },
  { label: "Participant", value: "participant" },
  { label: "Milestone", value: "milestone" },
  { label: "Sub-milestone", value: "submilestone" },
  { label: "Draw", value: "draw" },
  { label: "Evidence package", value: "evidencePackage" },
  { label: "Evidence asset", value: "evidenceAsset" },
  { label: "Site visit", value: "siteVisit" },
  { label: "Document", value: "document" },
  { label: "Material", value: "material" },
  { label: "Action Item", value: "actionItem" },
];

const STATUS_OPTIONS = [
  { label: "Any status", value: "any" },
  { label: "Active", value: "active" },
  { label: "Open", value: "open" },
  { label: "Resolved", value: "resolved" },
  { label: "To do", value: "todo" },
  { label: "In progress", value: "in_progress" },
  { label: "In review", value: "in_review" },
  { label: "Blocked", value: "blocked" },
  { label: "Done", value: "done" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Available", value: "available" },
  { label: "Superseded", value: "superseded" },
];

const AUDIENCE_OPTIONS = [
  { label: "Any audience", value: "any" },
  { label: "Everyone on the Build", value: "build_wide" },
  { label: "Author tier and higher", value: "author_tier_and_higher" },
  { label: "Custom participants", value: "custom" },
];

const RESOLUTION_OPTIONS = [
  { label: "Any resolution", value: "any" },
  { label: "Open", value: "open" },
  { label: "Resolved", value: "resolved" },
];

const ATTACHMENT_OPTIONS = [
  { label: "Any attachment state", value: "any" },
  { label: "Has attachments", value: "with" },
  { label: "No attachments", value: "without" },
];
