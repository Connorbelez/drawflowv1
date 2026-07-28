// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  BuilderProposalListSurface,
  BuilderTimelineDashboardSurface,
} from "./builder-dashboard";

afterEach(() => cleanup());

describe("BuilderTimelineDashboardSurface", () => {
  test("renders persona-owned plan rows, KPI counts, and Open routing", () => {
    const onNavigate = vi.fn();

    render(
      <BuilderTimelineDashboardSurface
        onNavigate={onNavigate}
        rows={[
          {
            buildName: "Submitted build",
            drawCount: 2,
            milestoneCount: 3,
            planId: "submitted-plan",
            status: "submitted",
            totalBudgetCents: 450_000_00,
            updatedAt: Date.UTC(2026, 4, 25, 12),
          },
          {
            buildKey: "demo-timeline-live-build",
            buildName: "Live build",
            drawCount: 3,
            milestoneCount: 4,
            planId: "approved-plan",
            status: "approved",
            totalBudgetCents: 650_000_00,
            updatedAt: Date.UTC(2026, 4, 25, 13),
          },
          {
            buildName: "Draft build",
            drawCount: 1,
            milestoneCount: 2,
            planId: "draft-plan",
            status: "draft",
            totalBudgetCents: 250_000_00,
            updatedAt: Date.UTC(2026, 4, 25, 14),
          },
        ]}
      />,
    );

    expect(screen.getByText("Drafts").nextSibling?.textContent).toBe("1");
    expect(screen.getByText("Submitted").nextSibling?.textContent).toBe("1");
    expect(screen.getByText("Live Builds").nextSibling?.textContent).toBe("1");
    expect(screen.getByText("Live builds")).toBeTruthy();
    expect(screen.getByText("Recent proposal workspaces")).toBeTruthy();

    const liveRow = screen.getByText("Live build").closest("tr");
    expect(liveRow).not.toBeNull();
    expect(
      within(liveRow as HTMLTableRowElement).getByText("Active"),
    ).toBeTruthy();
    fireEvent.click(
      within(liveRow as HTMLTableRowElement).getByRole("button", {
        name: /open live build live build/i,
      }),
    );
    expect(onNavigate).toHaveBeenCalledWith(
      "/builder/demo/dashboard/builds/$buildId",
      {
        buildId: "demo-timeline-live-build",
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /start new proposal/i,
      }),
    );
    expect(onNavigate).toHaveBeenCalledWith("/demo/timeline");
  });
});

describe("BuilderProposalListSurface", () => {
  test("lists every proposal status and opens proposal or live-build routes", () => {
    const onNavigate = vi.fn();

    render(
      <BuilderProposalListSurface
        onNavigate={onNavigate}
        rows={[
          {
            buildName: "Draft build",
            drawCount: 1,
            milestoneCount: 2,
            planId: "draft-plan",
            status: "draft",
            totalBudgetCents: 250_000_00,
            updatedAt: Date.UTC(2026, 4, 25, 14),
          },
          {
            buildName: "Submitted build",
            drawCount: 2,
            milestoneCount: 3,
            planId: "submitted-plan",
            status: "submitted",
            totalBudgetCents: 450_000_00,
            updatedAt: Date.UTC(2026, 4, 25, 12),
          },
          {
            buildName: "Archived build",
            drawCount: 2,
            milestoneCount: 3,
            planId: "archived-plan",
            status: "archived",
            totalBudgetCents: 400_000_00,
            updatedAt: Date.UTC(2026, 4, 25, 11),
          },
          {
            buildKey: "demo-timeline-live-build",
            buildName: "Approved build",
            drawCount: 3,
            milestoneCount: 4,
            planId: "approved-plan",
            status: "approved",
            totalBudgetCents: 650_000_00,
            updatedAt: Date.UTC(2026, 4, 25, 13),
          },
        ]}
      />,
    );

    expect(screen.getByText("Draft build")).toBeTruthy();
    expect(screen.getByText("Submitted build")).toBeTruthy();
    expect(screen.getByText("Archived build")).toBeTruthy();
    expect(screen.getByText("Approved build")).toBeTruthy();
    expect(screen.getByText("Moved Live").nextSibling?.textContent).toBe("1");

    fireEvent.click(
      screen.getByRole("button", {
        name: /open proposal draft build/i,
      }),
    );
    expect(onNavigate).toHaveBeenCalledWith(
      "/builder/demo/dashboard/proposals/$draftId",
      { draftId: "draft-plan" },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /open live build approved build/i,
      }),
    );
    expect(onNavigate).toHaveBeenCalledWith(
      "/builder/demo/dashboard/builds/$buildId",
      { buildId: "demo-timeline-live-build" },
    );
  });
});
