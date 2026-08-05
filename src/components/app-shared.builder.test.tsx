import { describe, expect, test } from "vitest";

import { builderNavGroups, builderStaffNavGroups } from "./app-shared";

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
      "Quote templates",
      "Timeline Setup",
    ]);
    expect(targets).toContain("/builder");
    expect(targets).toContain("/builder/proposals");
    expect(targets).toContain("/demo/timeline");
    expect(titles).not.toContain("Builders");
    expect(titles).not.toContain("Draws");
    expect(titles).not.toContain("Site Visits");
  });

  test("uses staff-specific builder shell links without creation/demo entries", () => {
    const titles = builderStaffNavGroups.flatMap((group) =>
      group.items.map((item) => item.title),
    );
    const targets = builderStaffNavGroups.flatMap((group) =>
      group.items.map((item) => item.to),
    );

    expect(titles).toEqual([
      "Dashboard",
      "Proposals",
      "Live Builds",
      "Quote templates",
    ]);
    expect(targets).toEqual([
      "/builder-staff",
      "/builder-staff/proposals",
      "/builder-staff/builds",
      "/builder-staff/quote-templates",
    ]);
    expect(titles).not.toContain("Timeline Setup");
    expect(titles).not.toContain("Builders");
    expect(titles).not.toContain("Draws");
  });
});
