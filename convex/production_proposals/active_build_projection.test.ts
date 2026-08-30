import { describe, expect, it } from "vitest";
import type { ActiveBuildProjectionRows } from "./active_build_projection";
import {
  assertActiveBuildProjectionRows,
  projectActiveBuildFunding,
} from "./active_build_projection";

const emptyRows: ActiveBuildProjectionRows = {
  capitalEvents: [],
  drawAllocations: [],
  drawRequests: [],
  facilities: [],
  milestones: [],
  plannedDraws: [],
  submilestones: [],
};

describe("active Build projection", () => {
  it("projects an empty financial ledger without a query-side fallback", () => {
    expect(projectActiveBuildFunding(emptyRows)).toMatchObject({
      approvedMilestoneCents: 0,
      availableCents: 0,
      facilityCents: 0,
      reservedCents: 0,
      unlockedCents: 0,
    });
  });

  it("rejects a sentinel row returned at a bounded read limit", () => {
    expect(() =>
      assertActiveBuildProjectionRows(
        {
          ...emptyRows,
          milestones: [{} as ActiveBuildProjectionRows["milestones"][number]],
        },
        { milestones: 1 },
        "Lender Build",
      ),
    ).toThrow("Lender Build record limit exceeded");
  });
});
