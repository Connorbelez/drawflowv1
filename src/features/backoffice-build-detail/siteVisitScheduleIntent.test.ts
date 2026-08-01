import { describe, expect, test } from "vitest";

import { SiteVisitScheduleIntentRegistry } from "./siteVisitScheduleIntent.ts";

describe("SiteVisitScheduleIntentRegistry", () => {
  test("retains one key through ambiguous retries and rotates after confirmation", () => {
    let sequence = 0;
    const registry = new SiteVisitScheduleIntentRegistry(
      () => `schedule-intent-${++sequence}`
    );
    const intent = {
      milestoneKey: "foundation",
      note: "Inspect footing forms.",
      requestedDay: 12,
      requestedTime: "09:00",
      submilestoneKeys: ["forms", "excavation"],
    };

    const first = registry.keyFor(intent);
    expect(registry.keyFor({
      ...intent,
      submilestoneKeys: ["excavation", "forms"],
    })).toBe(first);

    registry.confirm(intent);
    expect(registry.keyFor(intent)).not.toBe(first);
  });

  test("does not collapse materially different schedule intents", () => {
    let sequence = 0;
    const registry = new SiteVisitScheduleIntentRegistry(
      () => `schedule-intent-${++sequence}`
    );
    const first = registry.keyFor({
      milestoneKey: "foundation",
      requestedDay: 12,
    });
    const changed = registry.keyFor({
      milestoneKey: "foundation",
      requestedDay: 13,
    });

    expect(changed).not.toBe(first);
  });
});
