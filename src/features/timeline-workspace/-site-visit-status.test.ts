import { describe, expect, test } from "vitest";

import {
  normalizeTimelineSiteVisitStatus,
  resolveTimelinePersistenceSiteVisitMilestoneKey,
  resolveTimelineSiteVisitMilestoneKey,
} from "./index.tsx";

describe("timeline site visit status helpers", () => {
  test("normalizes requested, opened, completed, and expired token states", () => {
    const now = Date.UTC(2026, 4, 20, 12);

    expect(
      normalizeTimelineSiteVisitStatus("requested", now + 60_000, now)
    ).toBe("un-opened");
    expect(normalizeTimelineSiteVisitStatus("claimed", now + 60_000, now)).toBe(
      "in progress"
    );
    expect(
      normalizeTimelineSiteVisitStatus("completed", now - 60_000, now)
    ).toBe("complete");
    expect(
      normalizeTimelineSiteVisitStatus("requested", now - 60_000, now)
    ).toBe("expired");
  });

  test("maps timeline milestones to Convex demo milestones in build order", () => {
    expect(
      [
        "site-prep",
        "framing",
        "rough-in",
        "exterior",
        "drywall",
        "finishes",
        "closeout",
      ].map(resolveTimelineSiteVisitMilestoneKey)
    ).toEqual([
      "foundation",
      "framing",
      "aluminum_windows",
      "aluminum_windows",
      "aluminum_windows",
      "aluminum_windows",
      "aluminum_windows",
    ]);
  });

  test("keeps production active-build site visits on production milestone keys", () => {
    expect(
      resolveTimelinePersistenceSiteVisitMilestoneKey("drywall", "demo")
    ).toBe("aluminum_windows");
    expect(
      resolveTimelinePersistenceSiteVisitMilestoneKey("drywall", "live")
    ).toBe("drywall");
    expect(
      resolveTimelinePersistenceSiteVisitMilestoneKey("drywall", "proposal")
    ).toBe("drywall");
  });
});
