import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import type { BuildCollaborationRole } from "../build_collaboration_model";
import type { Doc } from "../types";
import type {
  NormalizedSearchFilters,
  RankedSearchCandidate,
  SearchCandidate,
  SearchStatus,
} from "./contracts";
import { DOMAIN_CONCEPTS, FIRST_LINE_PATTERN, SEARCH_TOKEN_SUFFIX_PATTERN } from "./ranking_constants";

export function participantDisplayName(
  authorization: ActiveBuildAuthorization,
  workosUserId: string
) {
  return authorization.participants.find(
    (participant) => participant.workosUserId === workosUserId
  )?.displayName;
}

export function canonicalSearchStatus(
  column:
    | "backlog"
    | "behind_schedule"
    | "in_progress"
    | "in_review"
    | "approved"
    | "superseded"
    | undefined
): SearchStatus | undefined {
  switch (column) {
    case "backlog":
      return "todo";
    case "behind_schedule":
      return "blocked";
    case "approved":
      return "done";
    case "superseded":
      return "superseded";
    default:
      return column;
  }
}

export function candidateMatchesFilters(
  candidate: SearchCandidate,
  filters: NormalizedSearchFilters
) {
  return (
    (!filters.types.length || filters.types.includes(candidate.resultType)) &&
    (!filters.authorWorkosUserIds.length ||
      (candidate.authorWorkosUserId !== undefined &&
        filters.authorWorkosUserIds.includes(candidate.authorWorkosUserId))) &&
    (!filters.assigneeWorkosUserIds.length ||
      (candidate.assigneeWorkosUserId !== undefined &&
        filters.assigneeWorkosUserIds.includes(
          candidate.assigneeWorkosUserId
        ))) &&
    (!filters.entityKinds.length ||
      candidate.entityKinds.some((kind) =>
        filters.entityKinds.includes(kind)
      )) &&
    (!filters.statuses.length || filters.statuses.includes(candidate.status)) &&
    (!filters.audienceModes.length ||
      filters.audienceModes.includes(candidate.audienceMode)) &&
    (filters.createdFrom === undefined ||
      candidate.createdAt >= filters.createdFrom) &&
    (filters.createdTo === undefined ||
      candidate.createdAt <= filters.createdTo) &&
    (!filters.resolutionStates.length ||
      filters.resolutionStates.includes(candidate.resolutionState)) &&
    (filters.attachmentPresence === "any" ||
      (filters.attachmentPresence === "with") === candidate.hasAttachments)
  );
}

export function rankCandidate(
  candidate: SearchCandidate,
  query: string,
  mode: "hybrid" | "keyword" | "semantic"
): RankedSearchCandidate | null {
  if (!query) {
    return { candidate, matchKind: "filter", score: 0 };
  }
  const keywordScore =
    mode === "semantic" ? 0 : lexicalScore(query, candidate.searchText);
  const semanticScore =
    mode === "keyword" ? 0 : conceptScore(query, candidate.searchText);
  const score = keywordScore + semanticScore;
  if (score <= 0) {
    return null;
  }
  return {
    candidate,
    matchKind: keywordScore > 0 ? "keyword" : "semantic",
    score,
  };
}

export function compareRankedCandidates(
  left: RankedSearchCandidate,
  right: RankedSearchCandidate
) {
  return (
    right.score - left.score ||
    right.candidate.updatedAt - left.candidate.updatedAt ||
    left.candidate.resultType.localeCompare(right.candidate.resultType) ||
    left.candidate.id.localeCompare(right.candidate.id) ||
    left.candidate.postId.localeCompare(right.candidate.postId)
  );
}

export function deduplicateCandidates(candidates: SearchCandidate[]) {
  const byKey = new Map<string, SearchCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.resultType}:${candidate.id}:${candidate.postId}`;
    const existing = byKey.get(key);
    if (!existing || existing.updatedAt < candidate.updatedAt) {
      byKey.set(key, candidate);
    }
  }
  return [...byKey.values()];
}

function lexicalScore(query: string, content: string) {
  const normalizedQuery = normalizeText(query);
  const normalizedContent = normalizeText(content);
  if (!normalizedQuery) {
    return 0;
  }
  let score = normalizedContent.includes(normalizedQuery) ? 100 : 0;
  const contentTokens = new Set(searchTokens(normalizedContent));
  for (const token of searchTokens(normalizedQuery)) {
    if (contentTokens.has(token)) {
      score += 20;
    } else if (
      token.length >= 4 &&
      [...contentTokens].some(
        (candidate) =>
          candidate.startsWith(token) || token.startsWith(candidate)
      )
    ) {
      score += 6;
    }
  }
  return score;
}
function conceptScore(query: string, content: string) {
  const queryConcepts = semanticConcepts(searchTokens(query));
  const contentConcepts = semanticConcepts(searchTokens(content));
  let score = 0;
  for (const concept of queryConcepts) {
    if (contentConcepts.has(concept)) {
      score += 12;
    }
  }
  return score;
}

function semanticConcepts(tokens: string[]) {
  const concepts = new Set<string>();
  for (const token of tokens) {
    const concept = DOMAIN_CONCEPTS.find((group) =>
      group.some((term) => stemSearchToken(term) === token)
    );
    concepts.add(concept?.[0] ?? token);
  }
  return concepts;
}
export function buildSearchIndexText(value: string) {
  const normalized = normalizeText(value);
  const tokens = searchTokens(normalized);
  const concepts = [...semanticConcepts(tokens)].map(
    (concept) => `concept_${concept}`
  );
  return [...new Set([normalized, ...tokens, ...concepts])].join(" ");
}
export function buildSearchIndexQuery(
  value: string,
  mode: "hybrid" | "keyword" | "semantic"
) {
  const tokens = searchTokens(value);
  if (mode === "keyword") {
    return [...new Set(tokens)].join(" ");
  }
  return [...semanticConcepts(tokens)]
    .map((concept) => `concept_${concept}`)
    .join(" ");
}

function searchTokens(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 2)
    .map(stemSearchToken);
}

function stemSearchToken(token: string) {
  return token.replace(SEARCH_TOKEN_SUFFIX_PATTERN, "").slice(0, 48);
}

export function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

export function searchTitle(content: string, fallback: string) {
  const firstLine = content.split(FIRST_LINE_PATTERN)[0]?.trim();
  return (firstLine || fallback).slice(0, 120);
}

export function searchExcerpt(content: string, query: string) {
  const compact = content.replace(/\s+/gu, " ").trim();
  if (compact.length <= 220) {
    return compact;
  }
  const normalizedQuery = normalizeText(query);
  const normalizedContent = normalizeText(compact);
  const index = normalizedQuery
    ? normalizedContent.indexOf(normalizedQuery)
    : 0;
  const start = Math.max(0, index > 0 ? index - 70 : 0);
  const prefix = start > 0 ? "…" : "";
  const suffix = start + 220 < compact.length ? "…" : "";
  return `${prefix}${compact.slice(start, start + 220)}${suffix}`;
}
