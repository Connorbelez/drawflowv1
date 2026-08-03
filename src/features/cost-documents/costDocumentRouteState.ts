/**
 * Cost capture, immutable-record detail, and exact Draft recovery are mutually
 * exclusive route states. Keeping this normalization shared makes pasted Cost
 * links behave identically across every Build-local workspace.
 */
export interface CostDocumentRouteSearch {
  costBatch?: string;
  costDocument?: string;
  costDocumentDraft?: string;
}

function normalizeOptionalSearchString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// Convex document ids are opaque, but accepting only the generated-id shape
// prevents an arbitrary query string from being treated as a submitted record.
const CONVEX_DOCUMENT_ID_PATTERN = /^[a-z0-9]{32}$/;

function normalizeCostDocumentId(value: unknown) {
  const normalized = normalizeOptionalSearchString(value);
  return normalized && CONVEX_DOCUMENT_ID_PATTERN.test(normalized)
    ? normalized
    : undefined;
}

export function normalizeCostDocumentSearch(
  search: Record<string, unknown>
): CostDocumentRouteSearch {
  const costDocumentDraft = normalizeOptionalSearchString(
    search.costDocumentDraft
  );
  const costDocument =
    !costDocumentDraft && normalizeCostDocumentId(search.costDocument);
  const costBatch =
    !(costDocumentDraft || costDocument) &&
    normalizeOptionalSearchString(search.costBatch);

  return {
    ...(costBatch ? { costBatch } : {}),
    ...(costDocument ? { costDocument } : {}),
    ...(costDocumentDraft ? { costDocumentDraft } : {}),
  };
}
