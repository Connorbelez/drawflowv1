const MAX_WORKING_STATE_JSON_LENGTH = 32_000;
const MAX_WORKING_STATE_ROWS = 100;
const MAX_ROW_ID_LENGTH = 128;
const MAX_AMOUNT_LENGTH = 64;
const MAX_LABEL_LENGTH = 240;

const FINANCIAL_COMPONENT_KINDS = new Set([
  "subtotal",
  "tax",
  "fee",
  "discount",
]);

interface WorkingStateRow {
  amount: string;
  id: string;
}

interface WorkingStateAllocation extends WorkingStateRow {
  buildSubmilestoneId: string;
}

interface WorkingStateFinancialComponent extends WorkingStateRow {
  kind: "subtotal" | "tax" | "fee" | "discount";
  label: string;
}

/**
 * Validates and canonicalizes the exact, owner-private editor snapshot used to
 * recover incomplete monetary input. It never replaces the validated monetary
 * rows that become authoritative when the workflow advances.
 */
export function normalizeCostDocumentWorkingStateJson(value: string) {
  if (value.length > MAX_WORKING_STATE_JSON_LENGTH) {
    throw new Error("Cost Document working state is too large.");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    throw new Error("Cost Document working state is invalid.");
  }
  if (!(isRecord(decoded) && decoded.version === 1)) {
    throw new Error("Cost Document working state is invalid.");
  }
  const grossTotal = requiredBoundedString(
    decoded.grossTotal,
    MAX_AMOUNT_LENGTH
  );
  const allocations = workingStateRows(
    decoded.allocations,
    (row): WorkingStateAllocation => ({
      amount: requiredBoundedString(row.amount, MAX_AMOUNT_LENGTH),
      buildSubmilestoneId: requiredBoundedString(
        row.buildSubmilestoneId,
        MAX_ROW_ID_LENGTH
      ),
      id: requiredBoundedString(row.id, MAX_ROW_ID_LENGTH),
    })
  );
  const financialComponents = workingStateRows(
    decoded.financialComponents,
    (row): WorkingStateFinancialComponent => {
      const kind = requiredBoundedString(row.kind, 32);
      if (!FINANCIAL_COMPONENT_KINDS.has(kind)) {
        throw new Error("Cost Document working state is invalid.");
      }
      return {
        amount: requiredBoundedString(row.amount, MAX_AMOUNT_LENGTH),
        id: requiredBoundedString(row.id, MAX_ROW_ID_LENGTH),
        kind: kind as WorkingStateFinancialComponent["kind"],
        label: requiredBoundedString(row.label, MAX_LABEL_LENGTH),
      };
    }
  );
  return JSON.stringify({
    allocations,
    financialComponents,
    grossTotal,
    version: 1,
  });
}

function workingStateRows<T>(
  value: unknown,
  project: (row: Record<string, unknown>) => T
) {
  if (!(Array.isArray(value) && value.length <= MAX_WORKING_STATE_ROWS)) {
    throw new Error("Cost Document working state is invalid.");
  }
  return value.map((row) => {
    if (!isRecord(row)) {
      throw new Error("Cost Document working state is invalid.");
    }
    return project(row);
  });
}

function requiredBoundedString(value: unknown, maxLength: number) {
  if (typeof value !== "string" || value.length > maxLength) {
    throw new Error("Cost Document working state is invalid.");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
