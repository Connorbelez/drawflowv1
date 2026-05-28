import { describe, expect, test } from "vitest";

import { getMinimumWidthBarX } from "./composed-chart.tsx";

describe("EvilComposedChart bar geometry", () => {
  test("keeps min-width bars centered on their data coordinate", () => {
    expect(getMinimumWidthBarX(100, 8, 18)).toBe(95);
    expect(getMinimumWidthBarX(100, 18, 18)).toBe(100);
  });
});
