import { describe, expect, test } from "vitest";

import {
  contractorPlanningFromProductionDetail,
  parseGanttMilestoneScopeId,
} from "./build-workspace-contractor-planning.ts";

describe("parseGanttMilestoneScopeId", () => {
  test("returns parent milestone key for submilestone row ids", () => {
    expect(parseGanttMilestoneScopeId("foundation::footings")).toEqual({
      milestoneKey: "foundation",
      submilestoneKeys: ["footings"],
    });
  });

  test("returns milestone key unchanged for parent ids", () => {
    expect(parseGanttMilestoneScopeId("foundation")).toEqual({
      milestoneKey: "foundation",
    });
  });
});

describe("contractorPlanningFromProductionDetail", () => {
  test("maps milestone contractor assignments for milestone detail display", () => {
    const planning = contractorPlanningFromProductionDetail({
      contractors: [
        {
          _id: "build-contractor-1",
          contractorId: "contractor-1",
          name: "Northline Framing Crew",
          role: "Framing contractor",
          trades: ["framing"],
        },
      ],
      milestoneContractorAssignments: [
        {
          _id: "assignment-1",
          contractorId: "contractor-1",
          milestoneKey: "foundation",
          role: "Concrete lead",
          status: "assigned",
        },
      ],
      milestones: [{ key: "foundation", name: "Foundation" }],
    });

    expect(planning.milestoneAssignments).toHaveLength(1);
    expect(planning.milestoneAssignments?.[0]).toMatchObject({
      contractorName: "Northline Framing Crew",
      milestoneKey: "foundation",
      milestoneName: "Foundation",
      role: "Concrete lead",
    });
  });
});
