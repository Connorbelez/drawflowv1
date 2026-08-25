export const DOMAIN_CONCEPTS = [
  ["foundation", "footing", "footings"],
  ["inspection", "inspect", "site", "visit"],
  ["photo", "image", "evidence", "proof"],
  ["payment", "funding", "draw", "disbursement", "release"],
  ["permit", "approval", "approved", "authorize"],
  ["task", "action", "todo", "item"],
  ["document", "file", "attachment", "report", "pdf"],
  ["contractor", "trade", "subtrade", "vendor"],
  ["milestone", "stage", "phase"],
  ["issue", "blocker", "problem", "blocked"],
  ["complete", "completed", "done", "finished"],
  ["material", "supply", "supplies", "product"],
] as const;
export const SEARCH_TOKEN_SUFFIX_PATTERN =
  /(ments|ment|ings|ing|ers|ies|ied|ed|es|s)$/u;
export const FIRST_LINE_PATTERN = /\\r?\\n/u;
