/**
 * Production proposals audit helpers bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { PROPOSAL_COLUMNS } from "./contracts_foundation.js";
import { titleCase, AUDIT_FIELD_PRIORITY } from "./legacy_seed.js";
import { centsToCurrency } from "./roster_projection_helpers.js";

function parseAuditState(value?: string): unknown {
  if (value === undefined) {
    return;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function isAuditRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shouldProjectAuditField(field: string): boolean {
  const lower = field.toLowerCase();
  return !(
    field.startsWith("_") ||
    lower.endsWith("id") ||
    lower.endsWith("ids") ||
    lower.endsWith("at") ||
    lower.includes("workos") ||
    lower === "organizationid" ||
    lower === "brokerageid"
  );
}

function auditFieldRank(field: string): number {
  const rank = AUDIT_FIELD_PRIORITY.indexOf(field);
  return rank === -1 ? AUDIT_FIELD_PRIORITY.length : rank;
}

function auditFieldLabel(field: string): string {
  const withoutUnit = field
    .replace(/Cents$/, "")
    .replace(/Bps$/, " rate")
    .replace(/Percent$/, " percentage");
  return titleCase(
    withoutUnit.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase(),
  );
}

function auditValueLabel(field: string, value: unknown): string {
  if (value === undefined) {
    return "Not set";
  }
  if (value === null) {
    return "None";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    if (field.endsWith("Cents")) {
      return centsToCurrency(value);
    }
    if (field.endsWith("Bps")) {
      return `${value / 100}%`;
    }
    if (field.endsWith("Percent")) {
      return `${value}%`;
    }
    return new Intl.NumberFormat("en-US").format(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "Empty";
    }
    if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(trimmed)) {
      return titleCase(trimmed.toLowerCase());
    }
    return trimmed.length > 96 ? `${trimmed.slice(0, 93)}...` : trimmed;
  }
  if (Array.isArray(value)) {
    const simpleValues = value.filter((item) =>
      ["boolean", "number", "string"].includes(typeof item),
    );
    if (simpleValues.length === value.length && value.length <= 3) {
      return simpleValues.map((item) => String(item)).join(", ") || "None";
    }
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  }
  if (isAuditRecord(value)) {
    const identifyingValue = value.label ?? value.name ?? value.status;
    return identifyingValue === undefined
      ? `${Object.keys(value).length} recorded fields`
      : auditValueLabel(field, identifyingValue);
  }
  return String(value);
}

export function projectAuditStateChanges(priorState?: string, newState?: string) {
  const before = parseAuditState(priorState);
  const after = parseAuditState(newState);
  if (!(isAuditRecord(before) || isAuditRecord(after))) {
    if (before === undefined && after === undefined) {
      return [];
    }
    return [
      {
        after: auditValueLabel("state", after),
        before: auditValueLabel("state", before),
        field: "State",
      },
    ];
  }

  const beforeRecord = isAuditRecord(before) ? before : {};
  const afterRecord = isAuditRecord(after) ? after : {};
  const fields = [
    ...new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]),
  ]
    .filter(shouldProjectAuditField)
    .filter(
      (field) =>
        JSON.stringify(beforeRecord[field]) !==
        JSON.stringify(afterRecord[field]),
    )
    .sort((left, right) => {
      const rankDelta = auditFieldRank(left) - auditFieldRank(right);
      return rankDelta || left.localeCompare(right);
    })
    .slice(0, 5);

  return fields.map((field) => ({
    after: auditValueLabel(field, afterRecord[field]),
    before: auditValueLabel(field, beforeRecord[field]),
    field: auditFieldLabel(field),
  }));
}

export function emptyProposalKanbanColumns() {
  return PROPOSAL_COLUMNS.map((id) => ({
    cards: [],
    id,
    name: titleCase(id),
  }));
}
