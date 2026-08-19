import { describe, expect, test } from "vitest";

import { validateBuildDetailSearch } from "./-route-search.ts";

const COST_DOCUMENT_ID = "ks7n0k9bhpe2qzzd3h2r9fg6ah87xg4r";

describe("Backoffice Build Cost route search", () => {
  test("keeps only stable Sub-milestone detail tabs route-addressable", () => {
    expect(
      validateBuildDetailSearch({
        detailTab: "review",
        focus: "submilestone:submilestone-01",
        tab: "details",
      }),
    ).toEqual({
      detailTab: "review",
      focus: "submilestone:submilestone-01",
      tab: "details",
    });
    expect(
      validateBuildDetailSearch({ detailTab: "notes", tab: "details" }),
    ).toEqual({ tab: "details" });
  });

  test("keeps the canonical Costs tab and submitted detail route-addressable", () => {
    expect(validateBuildDetailSearch({ tab: "costs" })).toEqual({
      tab: "costs",
    });
    expect(
      validateBuildDetailSearch({ costDocument: ` ${COST_DOCUMENT_ID} ` })
    ).toEqual({ costDocument: COST_DOCUMENT_ID, tab: "costs" });
  });

  test("keeps batch capture and exact draft recovery route-addressable", () => {
    expect(validateBuildDetailSearch({ costBatch: " batch-active " })).toEqual({
      costBatch: "batch-active",
      tab: "costs",
    });
    expect(
      validateBuildDetailSearch({
        costDocument: COST_DOCUMENT_ID,
        costDocumentDraft: " draft-private ",
        tab: "details",
      })
    ).toEqual({ costDocumentDraft: "draft-private", tab: "costs" });
  });

  test("rejects malformed submitted-record state without disturbing another valid tab", () => {
    expect(
      validateBuildDetailSearch({ costDocument: "forged", tab: "documents" })
    ).toEqual({ tab: "documents" });
  });

  test("normalizes a Quote Round detail deep link into the shared Quotes context", () => {
    expect(
      validateBuildDetailSearch({ roundId: " round-open ", tab: "details" })
    ).toEqual({ roundId: "round-open", tab: "quotes" });
    expect(validateBuildDetailSearch({ roundId: "   " })).toEqual({});
  });

  test("keeps an exact notification review target and cycle route-addressable", () => {
    expect(
      validateBuildDetailSearch({
        drawRequestId: "draw-1",
        reviewCycleId: "cycle-2",
        reviewCycleNumber: "2",
        tab: "draws",
      }),
    ).toEqual({
      drawRequestId: "draw-1",
      reviewCycleId: "cycle-2",
      reviewCycleNumber: 2,
    });
  });
});
