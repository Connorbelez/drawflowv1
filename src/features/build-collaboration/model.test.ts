import { describe, expect, test } from "vitest";

import type { CollaborationSystemPresentation } from "./model";
import { systemPresentationSummary } from "./model";

describe("systemPresentationSummary", () => {
  test("keeps the known presentation label", () => {
    expect(
      systemPresentationSummary({
        column: "behind_schedule",
      } as CollaborationSystemPresentation),
    ).toBe("Behind Schedule");
  });

  test("falls back to the raw runtime column when no label exists", () => {
    expect(
      systemPresentationSummary({
        column: "future_runtime_column",
      } as unknown as CollaborationSystemPresentation),
    ).toBe("future_runtime_column");
  });
});
