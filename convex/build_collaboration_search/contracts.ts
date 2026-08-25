import type { Doc, Id } from "../types";
import { stableContentHash } from "../build_collaboration_hash";

const MAX_SEARCH_CURSOR_SEEN_RESULTS = 10_000;
export const MAX_INDEX_PAGES_PER_REQUEST = 5;

type SearchResultType =
  | "post"
  | "comment"
  | "actionItem"
  | "submilestone"
  | "asset"
  | "reference";

export type SearchStatus =
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

export type ReferenceKind = Doc<"buildCollaborationReferences">["entityKind"];
export type AudienceMode = Doc<"buildCollaborationPosts">["audienceMode"];
type SearchFocusEntityKind =
  | "post"
  | "comment"
  | "actionItem"
  | "submilestone"
  | "asset";

export interface NormalizedSearchFilters {
  assigneeWorkosUserIds: string[];
  attachmentPresence: "any" | "with" | "without";
  audienceModes: AudienceMode[];
  authorWorkosUserIds: string[];
  createdFrom?: number;
  createdTo?: number;
  entityKinds: ReferenceKind[];
  resolutionStates: Array<"open" | "resolved">;
  statuses: SearchStatus[];
  types: SearchResultType[];
}

export interface SearchCandidate {
  actionItemId?: Id<"buildActionItems">;
  assigneeWorkosUserId?: string;
  audienceMode: AudienceMode;
  authorDisplayName?: string;
  authorWorkosUserId?: string;
  commentId?: Id<"buildCollaborationComments">;
  createdAt: number;
  entityId?: string;
  entityKind?: ReferenceKind;
  entityKinds: ReferenceKind[];
  focusEntityId?: string;
  focusEntityKind?: SearchFocusEntityKind;
  hasAttachments: boolean;
  href: string;
  id: string;
  ownerId: string;
  ownerKind: "post" | "comment" | "actionItem";
  postId: Id<"buildCollaborationPosts">;
  referenceId?: Id<"buildCollaborationReferences">;
  resolutionState: "open" | "resolved";
  resultType: SearchResultType;
  searchText: string;
  status: SearchStatus;
  title: string;
  updatedAt: number;
}

export interface RankedSearchCandidate {
  candidate: SearchCandidate;
  matchKind: "filter" | "keyword" | "semantic";
  score: number;
}

export interface AuthorizedSearchIndexPage {
  continueCursor: string;
  isDone: boolean;
  page: SearchCandidate[];
  stale: boolean;
}

export type SearchCandidateDiscoveryPhase = "base" | "references" | "assets";

export function normalizeFilters(
  filters: {
    assigneeWorkosUserIds?: string[];
    attachmentPresence?: "any" | "with" | "without";
    audienceModes?: AudienceMode[];
    authorWorkosUserIds?: string[];
    createdFrom?: number;
    createdTo?: number;
    entityKinds?: ReferenceKind[];
    resolutionStates?: Array<"open" | "resolved">;
    statuses?: SearchStatus[];
    types?: SearchResultType[];
  } = {}
): NormalizedSearchFilters {
  const unique = <T extends string>(values: T[] | undefined) =>
    [...new Set(values ?? [])].sort();
  return {
    assigneeWorkosUserIds: unique(filters.assigneeWorkosUserIds),
    attachmentPresence: filters.attachmentPresence ?? "any",
    audienceModes: unique(filters.audienceModes),
    authorWorkosUserIds: unique(filters.authorWorkosUserIds),
    createdFrom: filters.createdFrom,
    createdTo: filters.createdTo,
    entityKinds: unique(filters.entityKinds),
    resolutionStates: unique(filters.resolutionStates),
    statuses: unique(filters.statuses),
    types: unique(filters.types),
  };
}

export function hasActiveSearchFilter(filters: NormalizedSearchFilters) {
  return (
    filters.assigneeWorkosUserIds.length > 0 ||
    filters.attachmentPresence !== "any" ||
    filters.audienceModes.length > 0 ||
    filters.authorWorkosUserIds.length > 0 ||
    filters.createdFrom !== undefined ||
    filters.createdTo !== undefined ||
    filters.entityKinds.length > 0 ||
    filters.resolutionStates.length > 0 ||
    filters.statuses.length > 0 ||
    filters.types.length > 0
  );
}

export function parseSearchCursor(cursor: string | undefined, fingerprint: string) {
  if (!cursor) {
    return {
      seenHashes: [] as string[],
      sourceCursor: null as string | null,
      sourceDone: false,
    };
  }
  try {
    const parsed = JSON.parse(cursor) as {
      fingerprint?: unknown;
      seenHashes?: unknown;
      sourceCursor?: unknown;
      sourceDone?: unknown;
      version?: unknown;
    };
    if (
      parsed.version !== 7 ||
      parsed.fingerprint !== fingerprint ||
      !isSearchSeenHashes(parsed.seenHashes) ||
      !isSearchSourceCursor(parsed.sourceCursor) ||
      typeof parsed.sourceDone !== "boolean"
    ) {
      throw new Error("invalid");
    }
    return {
      seenHashes: parsed.seenHashes,
      sourceCursor: parsed.sourceCursor,
      sourceDone: parsed.sourceDone,
    };
  } catch {
    throw new Error("Search cursor does not match this Build search.");
  }
}

function isSearchSourceCursor(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isSearchSeenHashes(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_SEARCH_CURSOR_SEEN_RESULTS &&
    value.every(
      (hash) =>
        typeof hash === "string" &&
        hash.length <= 32 &&
        hash.startsWith("djb2-")
    )
  );
}

export function searchCandidateHash(candidate: SearchCandidate) {
  return stableContentHash(
    `${candidate.resultType}:${candidate.id}:${candidate.postId}`
  );
}
