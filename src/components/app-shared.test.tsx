import { describe, expect, test } from "vitest";

import { isNavItemActive, navGroups } from "./app-shared";

describe("navGroups", () => {
  test("includes proposals in the backoffice sidebar", () => {
    const backofficeGroup = navGroups.find((group) => group.label === "Backoffice");
    const titles = backofficeGroup?.items.map((item) => item.title);
    const proposalsItem = backofficeGroup?.items.find(
      (item) => item.title === "Proposals"
    );

    expect(titles).toEqual([
      "Dashboard",
      "Proposals",
      "Builds",
      "Builders",
      "Onboard builder",
      "Onboard contractor",
      "Contractors",
      "Contractor onboarding",
      "Draws",
      "Site Visits",
    ]);
    expect(proposalsItem?.to).toBe("/backoffice/proposals");
    expect(proposalsItem?.matchPrefix).toBe(true);
    expect(proposalsItem).toBeDefined();
    expect(isNavItemActive(proposalsItem!, "/backoffice/proposals/new")).toBe(
      true
    );
  });
});
