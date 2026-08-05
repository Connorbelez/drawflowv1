import { describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => config,
  useNavigate: vi.fn(),
}));

import { Route } from "./route";

const COST_DOCUMENT_ID = "ks7n0k9bhpe2qzzd3h2r9fg6ah87xg4r";

describe("Backoffice Build Cost route search", () => {
  const validateSearch = (Route as unknown as {
    validateSearch: (
      search: Record<string, unknown>
    ) => Record<string, unknown>;
  }).validateSearch;

  test("keeps the canonical Costs tab and submitted detail route-addressable", () => {
    expect(validateSearch({ tab: "costs" })).toEqual({ tab: "costs" });
    expect(
      validateSearch({ costDocument: ` ${COST_DOCUMENT_ID} ` })
    ).toEqual({ costDocument: COST_DOCUMENT_ID, tab: "costs" });
  });

  test("keeps batch capture and exact draft recovery route-addressable", () => {
    expect(validateSearch({ costBatch: " batch-active " })).toEqual({
      costBatch: "batch-active",
      tab: "costs",
    });
    expect(
      validateSearch({
        costDocument: COST_DOCUMENT_ID,
        costDocumentDraft: " draft-private ",
        tab: "details",
      })
    ).toEqual({ costDocumentDraft: "draft-private", tab: "costs" });
  });

  test("rejects malformed submitted-record state without disturbing another valid tab", () => {
    expect(
      validateSearch({ costDocument: "forged", tab: "documents" })
    ).toEqual({ tab: "documents" });
  });

  test("normalizes a Quote Round detail deep link into the shared Quotes context", () => {
    expect(
      validateSearch({ roundId: " round-open ", tab: "details" })
    ).toEqual({ roundId: "round-open", tab: "quotes" });
    expect(validateSearch({ roundId: "   " })).toEqual({});
  });
});
