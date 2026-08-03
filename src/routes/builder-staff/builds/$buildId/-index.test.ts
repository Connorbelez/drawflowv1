import { describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => config,
}));

vi.mock("#/routes/builder/builds/$buildId/index.tsx", () => ({
  BuilderBuildWorkspaceRoute: () => null,
}));

import { Route } from "./index";

describe("Builder Staff Build route search", () => {
  test("keeps Costs batch deep links refreshable and rejects invalid IDs", () => {
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
        costDocumentDraft: " draft-shared ",
        tab: "costs",
      })
    ).toEqual({ costDocumentDraft: "draft-shared", tab: "costs" });
    expect(
      validateSearch({
        costBatch: " batch-private ",
        costDocumentDraft: false,
        tab: "costs",
      })
    ).toEqual({ costBatch: "batch-private", tab: "costs" });
  });
});
