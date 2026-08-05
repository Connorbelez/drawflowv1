import { describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => config,
}));

vi.mock("#/features/cost-documents/costDocumentRouteState.ts", () => ({
  normalizeCostDocumentSearch: (search: Record<string, unknown>) => {
    const draft =
      typeof search.costDocumentDraft === "string" &&
      search.costDocumentDraft.trim()
        ? search.costDocumentDraft.trim()
        : undefined;
    const document =
      !draft &&
      typeof search.costDocument === "string" &&
      /^[a-z0-9]{32}$/.test(search.costDocument.trim())
        ? search.costDocument.trim()
        : undefined;
    const batch =
      !(draft || document) &&
      typeof search.costBatch === "string" &&
      search.costBatch.trim()
        ? search.costBatch.trim()
        : undefined;
    return {
      ...(batch ? { costBatch: batch } : {}),
      ...(document ? { costDocument: document } : {}),
      ...(draft ? { costDocumentDraft: draft } : {}),
    };
  },
}));

vi.mock("#/routes/builder/builds/$buildId/index.tsx", () => ({
  BuilderBuildWorkspaceRoute: () => null,
}));

import { Route } from "./index";

describe("Builder Staff Build route search", () => {
  test("keeps Costs batch and reconciliation deep links refreshable and rejects invalid IDs", () => {
    const costDocumentId = "ks7n0k9bhpe2qzzd3h2r9fg6ah87xg4r";
    const validateSearch = (
      Route as unknown as {
        validateSearch: (
          search: Record<string, unknown>
        ) => Record<string, unknown>;
      }
    ).validateSearch;

    expect(
      validateSearch({ costBatch: " batch-01 ", tab: "costs" })
    ).toEqual({ costBatch: "batch-01", tab: "costs" });
    expect(validateSearch({ costBatch: 42, tab: "costs" })).toEqual({
      tab: "costs",
    });
    expect(
      validateSearch({
        costBatch: "batch-private",
        costDocument: costDocumentId,
        costDocumentDraft: " draft-shared ",
        tab: "costs",
      })
    ).toEqual({ costDocumentDraft: "draft-shared", tab: "costs" });
    expect(
      validateSearch({
        costBatch: " batch-private ",
        costDocument: ` ${costDocumentId} `,
        costDocumentDraft: false,
        tab: "costs",
      })
    ).toEqual({ costDocument: costDocumentId, tab: "costs" });
    expect(
      validateSearch({ costBatch: "batch-private", costDocument: false, tab: "costs" })
    ).toEqual({ costBatch: "batch-private", tab: "costs" });
    expect(
      validateSearch({ costDocument: "not-an-id", tab: "costs" })
    ).toEqual({ tab: "costs" });
  });
});
