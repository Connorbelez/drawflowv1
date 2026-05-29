import { describe, expect, test } from "vitest";

import { builderNavGroups } from "./app-shared";

describe("builderNavGroups", () => {
  test("uses builder-specific sidebar links without backoffice-only entries", () => {
    const titles = builderNavGroups.flatMap((group) =>
      group.items.map((item) => item.title),
    );
    const targets = builderNavGroups.flatMap((group) =>
      group.items.map((item) => item.to),
    );

    expect(titles).toEqual([
      "Dashboard",
      "Proposals",
      "Live Builds",
      "Timeline Setup",
    ]);
    expect(targets).toContain("/builder");
    expect(targets).toContain("/builder/proposals");
    expect(targets).toContain("/demo/timeline");
    expect(titles).not.toContain("Builders");
    expect(titles).not.toContain("Draws");
    expect(titles).not.toContain("Site Visits");
  });
});
