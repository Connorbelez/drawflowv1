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

  test("keeps approved proposals without an accessible build assignment on the proposal route", () => {
    const onNavigate = vi.fn();
    render(
      <BuilderTimelineDashboardSurface
        onNavigate={onNavigate}
        rows={[
          {
            ...baseRow,
            buildName: "Approved proposal without assignment",
            kind: "proposal",
            planId: "proposal_unassigned",
            status: "approved",
          } as TimelinePlanRow,
        ]}
      />,
    );

    expect(
      screen.queryByRole("button", {
        name: "Open live build Approved proposal without assignment",
      }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open proposal Approved proposal without assignment",
      }),
    );
    expect(onNavigate).toHaveBeenCalledWith(
      "/builder/demo/dashboard/proposals/$draftId",
      { draftId: "proposal_unassigned" },
    );
  });

  test("surfaces pending budget revision governance before opening a live build", () => {
    render(
      <BuilderTimelineDashboardSurface
        onNavigate={vi.fn()}
        rows={[
          {
            ...baseRow,
            budgetGovernance: {
              activeVersion: 1,
              activeVersionLabel: "Capital plan v1",
              affectedDrawRequestCount: 1,
              affectedMilestoneCount: 2,
              currentOwner: "Lender Admin",
              decisionStatus: "pending",
              proposedVersion: 2,
              proposedVersionLabel: "Proposed capital plan v2",
              revisionDeadline: null,
              revisionPriority: "required",
              varianceBps: 909,
              varianceCents: 50_000,
            },
            buildKey: "build_budget_revision",
            buildName: "Budget revision build",
            kind: "activeBuild",
            planId: "build_budget_revision",
            status: "approved",
          } as TimelinePlanRow,
        ]}
      />,
    );

    expect(screen.getByText("Required budget revision")).toBeTruthy();
    expect(
      screen.getByText("Capital plan v1 → Proposed capital plan v2"),
    ).toBeTruthy();
    expect(screen.getByText("+$500 · +9.1%")).toBeTruthy();
    expect(screen.getByText("Lender Admin · Pending")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "View revision Budget revision build" }),
    ).toBeTruthy();
    expect(screen.getByText("2 milestones · 1 open draw")).toBeTruthy();
  });

  test("shows active-build operational state, counts, requests, builder, and preview", () => {
    render(
      <BuilderTimelineDashboardSurface
        onNavigate={vi.fn()}
        rows={[
          {
            ...baseRow,
            buildKey: "build_behind",
            buildName: "Behind schedule build",
            builderName: "Northline Builders",
            drawCount: 4,
            imageUrl: "https://example.com/site.jpg",
            kind: "activeBuild",
            location: "1200 Stone Road",
            milestoneCount: 6,
            milestonesBehindSchedule: 2,
            pendingDrawRequestCount: 1,
            pendingModificationRequestCount: 2,
            planId: "build_behind",
            status: "approved",
          } as TimelinePlanRow,
        ]}
      />,
    );

    const row = screen.getByText("Behind schedule build").closest("tr");
    expect(row).not.toBeNull();
    expect(
      screen.getByRole("img", { name: "Behind schedule build site preview" }),
    ).toBeTruthy();
    expect(screen.getByText("Northline Builders")).toBeTruthy();
    expect(screen.getByText("2 milestones behind schedule")).toBeTruthy();
    expect(screen.getByText("6 / 4")).toBeTruthy();
    expect(screen.getByText("1 draw / 2 changes")).toBeTruthy();
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
