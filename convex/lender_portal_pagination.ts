import { ConvexError } from "convex/values";

export type LenderQueueScope = "action" | "all";

export interface LenderQueueCursorPosition {
  anchorId: string;
  anchorValue: number;
}

interface LenderQueueCursorInput<Row, Scope extends string> {
  cursor: string | null;
  getAnchorId: (row: Row) => string;
  getAnchorValue: (row: Row) => number;
  label: "Draw" | "Milestone" | "Proposal";
  rows: readonly Row[];
  scope: Scope;
}

const LENDER_QUEUE_CURSOR_VERSION = 2;

/**
 * Decode a queue cursor and prove its anchor still belongs to the complete
 * authorized result set. Scope binding prevents a cursor issued for one queue
 * view from changing the boundary of another view.
 */
export function parseValidatedLenderQueueCursor<Row, Scope extends string>(
  input: LenderQueueCursorInput<Row, Scope>
): LenderQueueCursorPosition | null {
  if (!input.cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(input.cursor) as {
      anchorId?: unknown;
      anchorValue?: unknown;
      scope?: unknown;
      version?: unknown;
    };
    if (
      parsed.version === LENDER_QUEUE_CURSOR_VERSION &&
      parsed.scope === input.scope &&
      typeof parsed.anchorId === "string" &&
      typeof parsed.anchorValue === "number" &&
      Number.isFinite(parsed.anchorValue) &&
      input.rows.some(
        (row) =>
          input.getAnchorId(row) === parsed.anchorId &&
          input.getAnchorValue(row) === parsed.anchorValue
      )
    ) {
      return {
        anchorId: parsed.anchorId,
        anchorValue: parsed.anchorValue,
      };
    }
  } catch {
    // Invalid cursors fail closed below.
  }

  throw new ConvexError({
    code: "INVALID_PAGINATION_CURSOR",
    message: `${input.label} queue cursor is invalid.`,
    recoverable: true,
  });
}

export function encodeLenderQueueCursor<Scope extends string>(input: {
  position: LenderQueueCursorPosition;
  scope: Scope;
}) {
  return JSON.stringify({
    anchorId: input.position.anchorId,
    anchorValue: input.position.anchorValue,
    scope: input.scope,
    version: LENDER_QUEUE_CURSOR_VERSION,
  });
}
