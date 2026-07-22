import { describe, expect, test } from "vitest";

import { LANDING_HERO_COPY } from "./landing-copy";

const bannedHeroFragments = [
  `construction plan ${"and"} the capital release plan`,
  `real ${"cost"} of capital`,
] as const;

const requiredPositioning = [
  "on-demand draw",
  "rigid three-draw schedule",
  "Ontario builders",
  "20 years in building and lending",
] as const;

describe("landing copy positioning", () => {
  test("leads with on-demand draw flexibility instead of capital-cost framing", () => {
    const heroCopy = Object.values(LANDING_HERO_COPY).join(" ");

    for (const phrase of bannedHeroFragments) {
      expect(heroCopy).not.toContain(phrase);
    }

    for (const phrase of requiredPositioning) {
      expect(heroCopy).toContain(phrase);
    }
  });
});
