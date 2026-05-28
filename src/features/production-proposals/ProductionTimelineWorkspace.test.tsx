// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  buildCollaborationShareUrl,
  ProductionTimelineWorkspace,
} from "./ProductionTimelineWorkspace";
import { api } from "../../../convex/_generated/api";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("#/features/timeline-workspace/-timeline-convex-adapter.ts", () => ({
  convexWorkspaceToTimelineState: () => ({
    activeSelection: { itemId: "foundation", phase: "inProgress" },
    capitalSpikes: [],
    currentDay: 0,
    draws: [],
    items: [],
    progressValue: 0,
    range: { max: 60, min: 0, unit: "days" },
    selectedPanelOpen: false,
    startingCash: 400_000,
    straightLine: true,
  }),
}));

vi.mock("#/features/timeline-workspace/index.tsx", () => ({
  TimelineWorkspace: ({ collaboration, workspaceMode }: any) => (
    <div data-testid="mock-timeline-workspace">
      <div data-testid="mock-workspace-mode">{workspaceMode ?? "none"}</div>
      <div data-testid="mock-collaboration-permission">
        {collaboration?.permission ?? "none"}
      </div>
      <div data-testid="mock-collaboration-cursor-count">
        {collaboration?.cursors?.length ?? 0}
      </div>
      {collaboration?.toolbar}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const workspace = {
  capitalEvents: [],
  draws: [],
  evidenceAssets: [],
  milestones: [
    {
      budgetCents: 50_000_000,
      dayEnd: 30,
      dayStart: 0,
      drawAvailabilityCents: 40_000_000,
      durationDays: 30,
      key: "foundation",
      name: "Foundation",
      order: 1,
    },
  ],
  plan: {
    currentDay: 0,
    progressValue: 0,
    rangeMax: 60,
    rangeMin: 0,
    routeState: { selectedPanelOpen: false, straightLine: true },
    startingCashCents: 40_000_000,
  },
  proposal: {
    buildName: "Collaborative proposal",
    location: "42 Collaboration Ave",
    status: "draft",
    totalBudgetCents: 50_000_000,
  },
  submilestones: [],
};

describe("ProductionTimelineWorkspace collaboration integration", () => {
  test("builds live collaboration share links from the current workspace route", () => {
    window.history.pushState(
      null,
      "",
      "/backoffice/proposals/proposal_123?tab=timeline",
    );

    expect(buildCollaborationShareUrl("share-token")).toBe(
      "http://localhost:3000/backoffice/proposals/proposal_123?tab=timeline&collab=share-token",
    );
  });

  test("renders live collaboration controls and passes view-only state into the reused timeline", async () => {
    vi.mocked(useQuery).mockImplementation((fn: any, args: any) => {
      const functionName = getFunctionName(fn);
      if (args === "skip") {
        return undefined;
      }
      if (
        functionName ===
        getFunctionName(api.proposal_collaboration.listPresence)
      ) {
        return [
          {
            name: "Assignee Builder",
            online: true,
            userId: "user_assignee_builder",
          },
        ];
      }
      if (
        functionName === getFunctionName(api.proposal_collaboration.getSession)
      ) {
        return {
          activeSession: {
            _id: "session_123",
            initiatorSide: "broker",
            status: "active",
          },
          canManage: true,
          currentPermission: "view",
          currentWorkosUserId: "user_builder",
          participants: [
            {
              _id: "participant_builder",
              assignableBuilderProfileId: "builder_profile_123",
              displayName: "Assignee Builder",
              permission: "edit",
              roleSlugs: ["builder"],
              status: "invited",
              workosUserId: "user_assignee_builder",
            },
          ],
          roomId: "org:org_test:proposal:proposal_123:session:session_123",
        };
      }
      return { canRedo: false, canUndo: true, length: 2, position: 1 };
    });
    vi.mocked(useMutation).mockReturnValue(
      vi.fn().mockResolvedValue({ roomToken: "room-token", sessionToken: "session-token" }),
    );

    render(
      <ProductionTimelineWorkspace
        backofficeHref="/backoffice/proposals/proposal_123"
        proposalHref="/builder/proposals/proposal_123"
        proposalId={"proposal_123" as any}
        workspace={workspace as any}
        workosOrganizationId="org_test"
      />,
    );

    expect(screen.getByTestId("mock-workspace-mode").textContent).toBe(
      "proposal",
    );
    expect(screen.getByTestId("mock-collaboration-permission").textContent).toBe(
      "view",
    );
    expect(screen.getByTestId("production-collaboration-toolbar")).toBeTruthy();
    expect(screen.getByText("View only")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /undo/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: /redo/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await waitFor(() =>
      expect(screen.getByTestId("production-active-collaborators")).toBeTruthy(),
    );
    expect(screen.getByText("Assignee Builder")).toBeTruthy();
  });

  test("treats active-session nonparticipants as read-only in the reused timeline", () => {
    vi.mocked(useQuery).mockImplementation((fn: any, args: any) => {
      const functionName = getFunctionName(fn);
      if (args === "skip") {
        return undefined;
      }
      if (
        functionName === getFunctionName(api.proposal_collaboration.getSession)
      ) {
        return {
          activeSession: {
            _id: "session_123",
            initiatorSide: "broker",
            status: "active",
          },
          canManage: false,
          currentPermission: null,
          currentWorkosUserId: "user_observer",
          participants: [],
          roomId: "org:org_test:proposal:proposal_123:session:session_123",
        };
      }
      return { canRedo: false, canUndo: true, length: 2, position: 1 };
    });
    vi.mocked(useMutation).mockReturnValue(vi.fn().mockResolvedValue({}));

    render(
      <ProductionTimelineWorkspace
        backofficeHref="/backoffice/proposals/proposal_123"
        proposalHref="/builder/proposals/proposal_123"
        proposalId={"proposal_123" as any}
        workspace={workspace as any}
        workosOrganizationId="org_test"
      />,
    );

    expect(screen.getByTestId("mock-collaboration-permission").textContent).toBe(
      "view",
    );
    expect(screen.getByText("View only")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /undo/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
