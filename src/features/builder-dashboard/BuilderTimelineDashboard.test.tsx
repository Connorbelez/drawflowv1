// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  BuilderProposalListSurface,
  BuilderTimelineDashboardSurface,
  type TimelinePlanRow,
} from "./BuilderTimelineDashboard";

const baseRow = {
  drawCount: 1,
  milestoneCount: 2,
  totalBudgetCents: 1_000_000,
  updatedAt: Date.UTC(2026, 5, 1, 12),
} satisfies Partial<TimelinePlanRow>;

describe("BuilderTimelineDashboardSurface", () => {
  test("hides the proposal creation action for staff workspaces", () => {
    render(
      <BuilderTimelineDashboardSurface
        onNavigate={vi.fn()}
        rows={[]}
        showStartProposalAction={false}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Start new proposal" }),
    ).toBeNull();
  });

  test("routes explicit proposal and active-build rows independently", () => {
    const onNavigate = vi.fn();
    render(
      <BuilderTimelineDashboardSurface
        onNavigate={onNavigate}
        rows={[
          {
            ...baseRow,
            buildName: "Approved proposal only",
            kind: "proposal",
            planId: "proposal_1",
            status: "approved",
          } as TimelinePlanRow,
          {
            ...baseRow,
            buildKey: "build_1",
            buildName: "Assigned live build",
            kind: "activeBuild",
            planId: "build_1",
            status: "approved",
          } as TimelinePlanRow,
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open proposal Approved proposal only",
      }),
    );
    expect(onNavigate).toHaveBeenCalledWith(
      "/builder/demo/dashboard/proposals/$draftId",
      { draftId: "proposal_1" },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open live build Assigned live build",
      }),
    );
    expect(onNavigate).toHaveBeenCalledWith(
      "/builder/demo/dashboard/builds/$buildId",
      { buildId: "build_1" },
    );
  });
});

describe("BuilderProposalListSurface", () => {
  test("opens approved proposal-kind rows as proposals, not live builds", () => {
    const onNavigate = vi.fn();
    render(
      <BuilderProposalListSurface
        onNavigate={onNavigate}
        rows={[
          {
            ...baseRow,
            buildKey: "build_from_proposal",
            buildName: "Approved proposal assignment",
            kind: "proposal",
            planId: "proposal_approved",
            status: "approved",
          } as TimelinePlanRow,
        ]}
        showStartProposalAction={false}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open proposal Approved proposal assignment",
      }),
    );

    expect(onNavigate).toHaveBeenCalledWith(
      "/builder/demo/dashboard/proposals/$draftId",
      { draftId: "proposal_approved" },
    );
  });
});
