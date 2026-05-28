import { describe, expect, test } from "vitest";

import {
  mapSubmilestoneSnapshotRows,
  resolveMilestoneSubmilestones,
} from "./-timeline-milestone-submilestones.ts";

describe("timeline milestone submilestones", () => {
  test("maps snapshot rows with scope notes and stable keys", () => {
    expect(
      mapSubmilestoneSnapshotRows(
        [
          { name: "Pour", order: 2 },
          {
            description: "Basis, scope, and quantities",
            key: "foundation-forms",
            name: "Forms",
            order: 1,
            budgetCents: 12_500,
          },
        ],
        "foundation"
      )
    ).toEqual([
      {
        budgetCents: 12_500,
        description: "Basis, scope, and quantities",
        key: "foundation-forms",
        name: "Forms",
        order: 1,
      },
      {
        key: "foundation-sub-01",
        name: "Pour",
        order: 2,
      },
    ]);
  });

  test("falls back to string sub-milestones when details are absent", () => {
    expect(
      resolveMilestoneSubmilestones(
        {
          subMilestones: ["Wall framing", "Roof trusses"],
        },
        "framing"
      )
    ).toEqual([
      { key: "framing-sub-01", name: "Wall framing", order: 1 },
      { key: "framing-sub-02", name: "Roof trusses", order: 2 },
    ]);
  });
});
