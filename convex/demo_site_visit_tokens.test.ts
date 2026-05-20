import { describe, expect, test } from "vitest";

import {
  hashSiteVisitToken,
  validateIncludedSiteVisitMilestones,
} from "./demo_site_visit_tokens";

const milestoneOrder = ["foundation", "framing", "rough-in", "drywall"];

describe("site visit token helpers", () => {
  test("allows the selected milestone with previous milestones", () => {
    expect(
      validateIncludedSiteVisitMilestones({
        includedMilestoneKeys: ["foundation", "framing"],
        milestoneOrder,
        selectedMilestoneKey: "framing",
      })
    ).toEqual(["foundation", "framing"]);
  });

  test("requires the selected milestone", () => {
    expect(() =>
      validateIncludedSiteVisitMilestones({
        includedMilestoneKeys: ["foundation"],
        milestoneOrder,
        selectedMilestoneKey: "framing",
      })
    ).toThrow("Selected milestone must be included");
  });

  test("rejects future milestones", () => {
    expect(() =>
      validateIncludedSiteVisitMilestones({
        includedMilestoneKeys: ["foundation", "framing", "drywall"],
        milestoneOrder,
        selectedMilestoneKey: "framing",
      })
    ).toThrow("Site visit can only include current and previous milestones");
  });

  test("hashes tokens without storing the raw token value", async () => {
    const token = "token_demo_123";

    const hash = await hashSiteVisitToken(token);

    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
    expect(await hashSiteVisitToken(token)).toBe(hash);
  });
});
