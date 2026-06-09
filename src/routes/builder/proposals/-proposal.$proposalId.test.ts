import { describe, expect, test } from "vitest";

import {
  resolveBuilderProposalRouteTab,
  shouldLoadBuilderProposalCalendarWorkspace,
  shouldLoadBuilderProposalContractorPlanning,
  shouldMountBuilderProposalStaffPanel,
} from "./$proposalId/index.tsx";

describe("builder proposal detail subscription gates", () => {
  test("uses the shared packet-first proposal tab contract", () => {
    const activeTab = resolveBuilderProposalRouteTab({});

    expect(activeTab).toBe("packet");
    expect(shouldLoadBuilderProposalCalendarWorkspace(activeTab)).toBe(false);
    expect(shouldLoadBuilderProposalContractorPlanning(activeTab)).toBe(false);
    expect(shouldMountBuilderProposalStaffPanel(activeTab)).toBe(false);
  });

  test("loads heavyweight subscriptions only for matching shared tabs", () => {
    expect(shouldLoadBuilderProposalCalendarWorkspace("calendar")).toBe(true);
    expect(shouldLoadBuilderProposalCalendarWorkspace("packet")).toBe(false);

    expect(shouldLoadBuilderProposalContractorPlanning("contractors")).toBe(
      true
    );
    expect(shouldLoadBuilderProposalContractorPlanning("gantt")).toBe(true);
    expect(shouldLoadBuilderProposalContractorPlanning("milestones")).toBe(
      true
    );
    expect(shouldLoadBuilderProposalContractorPlanning("packet")).toBe(false);

    expect(shouldMountBuilderProposalStaffPanel("staff")).toBe(true);
    expect(shouldMountBuilderProposalStaffPanel("packet")).toBe(false);
  });
});
