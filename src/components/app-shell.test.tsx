// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const convexMock = vi.hoisted(() => ({
  actionCalls: [] as any[],
  commitOutcome: { applied: [], ok: true } as any,
  mutationCalls: [] as any[],
  providerReadOnly: true,
}));

vi.mock("#/components/app-header.tsx", () => ({
  AppHeader: () => <header data-testid="app-header" />,
}));

vi.mock("#/components/app-sidebar.tsx", () => ({
  AppSidebar: () => <aside data-testid="app-sidebar" />,
}));

vi.mock("#/components/decor-icon.tsx", () => ({
  DecorIcon: () => <div data-testid="decor-icon" />,
}));

vi.mock("#/components/ui/sidebar.tsx", () => ({
  SidebarInset: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-inset">{children}</div>
  ),
  SidebarProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-provider">{children}</div>
  ),
}));

const routerState = {
  location: {
    pathname: "/builder/proposals/proposal_123",
    search: {
      drawKey: "draw-2",
      milestoneKey: "framing",
      tab: "calendar",
    },
  },
  matches: [
    {
      id: "/builder/proposals/$proposalId",
      params: { proposalId: "proposal_123" },
      routeId: "/builder/proposals/$proposalId",
      search: {
        drawKey: "draw-2",
        milestoneKey: "framing",
        tab: "calendar",
      },
    },
  ],
};

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    options: {
      context: {
        organizationId: "org_test",
        role: "admin",
        roles: ["admin"],
        userId: "user_test",
      },
    },
  }),
  useRouterState: ({ select }: { select: (state: typeof routerState) => any }) =>
    select(routerState),
}));

vi.mock("convex/react", () => ({
  useAction: () => async (args: any) => {
    convexMock.actionCalls.push(args);
    if (args?.prompt !== undefined) {
      return {
        model: "gpt-test",
        provider: "openai",
        text: "Assistant response",
      };
    }
    return {
      defaultModel: "gpt-test",
      openaiConfigured: !convexMock.providerReadOnly,
      openrouterConfigured: false,
      provider: convexMock.providerReadOnly ? "unconfigured" : "openai",
      readOnly: convexMock.providerReadOnly,
    };
  },
  useMutation: () => async (args: any) => {
    convexMock.mutationCalls.push(args);
    if (args?.actions) {
      return "assistant_plan_test";
    }
    if (args?.planId) {
      return convexMock.commitOutcome;
    }
    if (args?.title || args?.threadId === undefined) {
      return "assistant_thread_test";
    }
    return "assistant_trace_test";
  },
}));

import { AppShell } from "./app-shell.tsx";

describe("AppShell assistant integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    convexMock.actionCalls.length = 0;
    convexMock.mutationCalls.length = 0;
    convexMock.commitOutcome = { applied: [], ok: true };
    convexMock.providerReadOnly = true;
    globalThis.ResizeObserver = class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    };
    HTMLElement.prototype.getAnimations = () => [];
    HTMLElement.prototype.scrollTo = () => {};
  });

  afterEach(() => {
    cleanup();
  });

  test("Cmd/Ctrl+J opens the global assistant with route-aware context", async () => {
    render(
      <AppShell>
        <main>Workspace</main>
      </AppShell>,
    );

    fireEvent.keyDown(window, { key: "j", metaKey: true });

    expect(await screen.findByTestId("drawflow-assistant-surface")).toBeTruthy();
    expect(screen.getByTestId("assistant-route-context").textContent).toContain(
      "/builder/proposals/proposal_123",
    );
    expect(screen.getByTestId("assistant-route-context").textContent).toContain(
      "proposal_123",
    );
  });

  test("Cmd/Ctrl+K command surface includes an assistant entry that opens the same assistant", async () => {
    render(
      <AppShell>
        <main>Workspace</main>
      </AppShell>,
    );

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(await screen.findByTestId("drawflow-command-palette")).toBeTruthy();
    const entry = await screen.findByText("Open DrawFlow AI assistant");
    fireEvent.click(entry);

    expect(await screen.findByTestId("drawflow-assistant-surface")).toBeTruthy();
  });

  test("renders editable HITL preview cards before any mutation commit", async () => {
    render(
      <AppShell>
        <main>Workspace</main>
      </AppShell>,
    );

    fireEvent.keyDown(window, { key: "j", metaKey: true });

    expect(await screen.findByTestId("assistant-hitl-preview")).toBeTruthy();
    expect(screen.getAllByTestId("assistant-preview-card")).toHaveLength(2);
    fireEvent.change(
      screen.getByLabelText("Edit after value for example_schedule"),
      {
        target: { value: '{"dayEnd":46,"dayStart":30}' },
      },
    );
    expect(await screen.findByText("edited")).toBeTruthy();
    fireEvent.click(screen.getAllByText("Reject")[0]);

    await waitFor(() => {
      expect(screen.getByText("1 accepted in batch")).toBeTruthy();
    });
  });

  test("missing provider configuration shows read-only help state", async () => {
    render(
      <AppShell>
        <main>Workspace</main>
      </AppShell>,
    );

    fireEvent.keyDown(window, { key: "j", metaKey: true });
    await sendAssistantMessage(
      "make the second milestone go from T30 to T45, budget 120000 and add a draw 2 days after for 80000",
    );

    expect(
      await screen.findByText(/Model-backed actions are unavailable/i),
    ).toBeTruthy();
    expect(convexMock.mutationCalls.some((call) => call?.actions)).toBe(false);
  });

  test("read-only focus tools execute without action-plan preview commit", async () => {
    convexMock.providerReadOnly = false;
    render(
      <AppShell>
        <main>Workspace</main>
      </AppShell>,
    );

    fireEvent.keyDown(window, { key: "j", metaKey: true });
    await sendAssistantMessage("focus this milestone");

    expect(await screen.findByText(/Focused milestone framing/i)).toBeTruthy();
    expect(
      convexMock.mutationCalls.some(
        (call) => call?.aguiEvent?.action?.actionKey === "focus_milestone",
      ),
    ).toBe(true);
    expect(convexMock.mutationCalls.some((call) => call?.actions)).toBe(false);
    expect(convexMock.mutationCalls.some((call) => call?.planId)).toBe(false);
  });

  test("example proposal request creates a persisted action plan and commits accepted items", async () => {
    convexMock.providerReadOnly = false;
    render(
      <AppShell>
        <main>Workspace</main>
      </AppShell>,
    );

    fireEvent.keyDown(window, { key: "j", metaKey: true });
    await sendAssistantMessage(
      "make the second milestone go from T30 to T45, budget 120000 and add a draw 2 days after for 80000",
    );

    expect(await screen.findByText(/persisted HITL action batch/i)).toBeTruthy();
    const planCall = convexMock.mutationCalls.find((call) => call?.actions);
    expect(planCall.actions.map((action: any) => action.actionKey)).toEqual([
      "update_proposal_milestone_schedule",
      "update_proposal_milestone_budget",
      "create_proposal_planned_draw",
    ]);

    fireEvent.click(screen.getByText("Confirm accepted batch"));

    await waitFor(() => {
      expect(screen.getByTestId("assistant-commit-message").textContent).toContain(
        "committed",
      );
    });
    const commitCall = convexMock.mutationCalls.find((call) => call?.planId);
    expect(commitCall.acceptedClientRequestIds).toHaveLength(3);
    expect(commitCall.rejectedClientRequestIds).toEqual([]);
  });

  test("commit validation failure keeps failed item in preview state", async () => {
    convexMock.providerReadOnly = false;
    convexMock.commitOutcome = {
      failedClientRequestId: "assistant_example_draw",
      ok: false,
      reason: "Draw amount must be greater than zero.",
    };
    render(
      <AppShell>
        <main>Workspace</main>
      </AppShell>,
    );

    fireEvent.keyDown(window, { key: "j", metaKey: true });
    await sendAssistantMessage(
      "make the second milestone go from T30 to T45, budget 120000 and add a draw 2 days after for 80000",
    );
    fireEvent.click(await screen.findByText("Confirm accepted batch"));

    expect(
      await screen.findAllByText(/Draw amount must be greater than zero/i),
    ).toHaveLength(2);
    expect(screen.getAllByTestId("assistant-preview-card")).toHaveLength(3);
  });
});

async function sendAssistantMessage(message: string) {
  const input = await screen.findByPlaceholderText(
    "Ask about this build, proposal, draw, or calendar...",
  );
  fireEvent.change(input, { target: { value: message } });
  fireEvent.click(screen.getByLabelText("Send assistant message"));
}
