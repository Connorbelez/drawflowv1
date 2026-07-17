import { describe, expect, test } from "vitest";

import {
  ARCHIVED_MARKETING_ROUTE_ENTRIES,
  MARKETING_ROUTE_ARCHIVE_PATTERN,
} from "./marketing-route-archive.ts";

describe("marketing route archive", () => {
  test("keeps every archived marketing source entry out of route generation", () => {
    const pattern = new RegExp(MARKETING_ROUTE_ARCHIVE_PATTERN);

    for (const entry of ARCHIVED_MARKETING_ROUTE_ENTRIES) {
      expect(pattern.test(entry)).toBe(true);
    }
  });

  test.each([
    "index.tsx",
    "builder",
    "builder-staff",
    "backoffice",
    "contractor",
    "callback.tsx",
    "proposal-claim.$claimToken.tsx",
  ])("does not hide the application entry %s", (entry) => {
    expect(new RegExp(MARKETING_ROUTE_ARCHIVE_PATTERN).test(entry)).toBe(false);
  });
});
