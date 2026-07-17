// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const convexMock = vi.hoisted(() => ({
  actionCalls: [] as any[],
  commitOutcome: { applied: [], ok: true } as any,
  mutationCalls: [] as any[],
  navigateCalls: [] as any[],
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
      context: {
        organizationId: "org_test",
        role: "admin",
        roles: ["admin"],
        token: "token_test",
        userId: "user_test",
      },
    },
  ],
};

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    navigate: (input: any) => {
      convexMock.navigateCalls.push(input);
      return Promise.resolve();
    },
    options: {
      context: {
        organizationId: null,
        role: null,
        roles: [],
        token: null,
        userId: null,
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
  useConvex: () => ({
    query: vi.fn().mockResolvedValue({
      operationalBriefing: { sections: [], summary: { total: 0 } },
      route: {
        activeBuildId: (routerState.matches[0]?.params as any)?.buildId,
        proposalId: (routerState.matches[0]?.params as any)?.proposalId,
        selectedMilestoneKey: routerState.location.search.milestoneKey,
      },
      target: {
        kind: "proposal",
        milestones: [{ key: "framing", name: "Framing" }],
        proposalId: (routerState.matches[0]?.params as any)?.proposalId,
      },
    }),
  }),
  useMutation: () => async (args: any) => {
    convexMock.mutationCalls.push(args);
    if (args?.goal && args?.steps) {
      return "assistant_workflow_test";
    }
    if (args?.workflowRunId && args?.stepId) {
      return { ok: true };
    }
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
  useQuery: (_ref: unknown, args: any) =>
    args?.threadId
      ? null
      : {
          targets: [
            {
              kind: "proposal",
              label: "Assistant test proposal",
              proposalId: "proposal_123",
              subtitle: "Build Proposal",
            },
            {
              buildId: "build_123",
              kind: "activeBuild",
              label: "Assistant live build",
              subtitle: "Live Build",
            },
          ],
        },
}));

import { AppShell } from "./app-shell.tsx";

describe("AppShell assistant integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    convexMock.actionCalls.length = 0;
    convexMock.mutationCalls.length = 0;
    convexMock.navigateCalls.length = 0;
    convexMock.commitOutcome = { applied: [], ok: true };
    convexMock.providerReadOnly = true;
    window.sessionStorage.clear();
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

  test("renders a single full-width shell junction rule", () => {
    render(
      <AppShell>
        <main>Workspace</main>
      </AppShell>,
    );

    const rule = screen.getByTestId("app-shell-junction-rule");

    expect(rule.getAttribute("aria-hidden")).toBe("true");
    expect(rule.className).toContain("fixed");
    expect(rule.className).toContain("inset-x-0");
    expect(rule.className).toContain("top-14");
    expect(rule.className).toContain("border-t");
    expect(rule.className).not.toContain("left-(--sidebar-width)");
  });

  test("Cmd/Ctrl+J opens the global assistant with route-aware context", async () => {
    render(
      <AppShell>
        <main>Workspace</main>
      </AppShell>,
    );

    fireEvent.keyDown(window, { key: "j", metaKey: true });

    expect(
      await screen.findByTestId(
        "drawflow-assistant-surface",
        {},
        { timeout: 5000 },
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("assistant-route-context").textContent).toContain(
      "/builder/proposals/proposal_123",
    );
    expect(screen.getByTestId("assistant-route-context").textContent).toContain(
      "proposal_123",
    );
    expect(screen.getByTestId("assistant-route-context").textContent).toContain(
      "org_test",
    );
    expect(
      screen.getByTestId("assistant-route-context").textContent,
    ).not.toContain("Missing organization claim");
  });

  test("persists open assistant state across shell remounts after navigation", async () => {
    const firstRender = render(
      <AppShell>
        <main>Workspace</main>
      </AppShell>,
    );

    fireEvent.keyDown(window, { key: "j", metaKey: true });

    expect(await screen.findByTestId("drawflow-assistant-surface")).toBeTruthy();
    expect(window.sessionStorage.getItem("drawflow.assistant.open")).toBe("true");

    firstRender.unmount();
    render(
      <AppShell>
        <main>Workspace after navigation</main>
      </AppShell>,
    );

    expect(await screen.findByTestId("drawflow-assistant-surface")).toBeTruthy();
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

  test("opens without stale HITL checkpoint cards", async () => {
    render(
      <AppShell>
        <main>Workspace</main>
      </AppShell>,
    );

    fireEvent.keyDown(window, { key: "j", metaKey: true });

    expect(await screen.findByTestId("drawflow-assistant-surface")).toBeTruthy();
    expect(screen.queryByTestId("assistant-hitl-preview")).toBeNull();
    expect(screen.queryAllByTestId("assistant-preview-card")).toHaveLength(0);
  });

  test("canonicalizes assistant template-settings navigation before routing", async () => {
    render(
      <AppShell>
        <main>Workspace</main>
      </AppShell>,
    );

    fireEvent(
      window,
      new CustomEvent("drawflow-assistant:readonly-action", {
        detail: {
          actionKey: "open_route",
          afterNavigationActions: [
            {
              actionKey: "select_proposal_template",
              input: { templateKey: "garden-suite" },
            },
          ],
          label: "Template settings",
          to: "/backoffice/settings/template",
        },
      }),
    );

    await waitFor(() =>
      expect(convexMock.navigateCalls).toEqual([{ to: "/backoffice/settings" }])
    );
    expect(
      JSON.parse(
        window.sessionStorage.getItem(
          "drawflow.assistant.pendingClientActions",
        ) ?? "[]",
      )[0],
    ).toMatchObject({
      actionKey: "select_proposal_template",
      route: "/backoffice/settings",
    });
  });

  test("ignores unknown assistant routes instead of sending them to TanStack Router", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(
      <AppShell>
        <main>Workspace</main>
      </AppShell>,
    );

    fireEvent(
      window,
      new CustomEvent("drawflow-assistant:readonly-action", {
        detail: {
          actionKey: "open_route",
          label: "Bad route",
          to: "/backoffice/settings/not-a-real-tab",
        },
      }),
    );

    expect(convexMock.navigateCalls).toEqual([]);
    expect(
      window.sessionStorage.getItem("drawflow.assistant.pendingClientActions"),
    ).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "Ignored assistant navigation to an unknown DrawFlow route.",
      { to: "/backoffice/settings/not-a-real-tab" },
    );
    warn.mockRestore();
  });

  test("closing and reopening clears chat and HITL state", async () => {
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
    expect(await screen.findByTestId("assistant-hitl-preview")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Close assistant"));
    fireEvent.click(await screen.findByLabelText("Open DrawFlow AI assistant"));

    expect(await screen.findByTestId("drawflow-assistant-surface")).toBeTruthy();
    expect(screen.queryByText(/persisted HITL action batch/i)).toBeNull();
    expect(screen.queryByTestId("assistant-hitl-preview")).toBeNull();
  });

  test("missing provider configuration shows read-only help state", async () => {
    render(
      <AppShell>
        <main>Workspace</main>
      </AppShell>,
    );

    fireEvent.keyDown(window, { key: "j", metaKey: true });
    await sendAssistantMessage("summarize the current operational risk");

    expect(
      await screen.findByText(/Model-backed answers are unavailable/i),
    ).toBeTruthy();
    expect(convexMock.mutationCalls.some((call) => call?.actions)).toBe(false);
  });

  test("new build requests navigate through the assistant route registry", async () => {
    render(
      <AppShell>
        <main>Workspace</main>
      </AppShell>,
    );

    fireEvent.keyDown(window, { key: "j", metaKey: true });
    await sendAssistantMessage("I want to create a new build");

    expect(await screen.findByText(/I can take you to New Build/i)).toBeTruthy();
    await waitFor(() => {
      expect(convexMock.navigateCalls).toContainEqual({
        to: "/builder/proposals/new",
      });
    });
    expect(convexMock.mutationCalls.some((call) => call?.actions)).toBe(false);
  });

  test("Garden Suite build startup creates a workflow instead of plain navigation", async () => {
    render(
      <AppShell>
        <main>Workspace</main>
      </AppShell>,
    );

    fireEvent.keyDown(window, { key: "j", metaKey: true });
    await sendAssistantMessage("I wanted to start a new Garden Suite build.");

    await waitFor(() => {
      expect(convexMock.mutationCalls.some((call) => call?.goal)).toBe(true);
    });
    expect(
      await screen.findByText(/open the new Build Proposal flow and select Garden Suite/i)
    ).toBeTruthy();
    const workflowCall = convexMock.mutationCalls.find((call) => call?.goal);
    expect(workflowCall.steps.map((step: any) => step.kind)).toEqual([
      "navigate",
      "wait_for_route",
      "wait_for_client_capability",
      "run_client_action",
      "self_check",
    ]);
    expect(workflowCall.steps[3].input.action).toMatchObject({
      actionKey: "select_proposal_template",
      input: { templateKey: "garden-suite" },
      route: "/builder/proposals/new",
    });
    expect(convexMock.navigateCalls).toEqual([]);
    expect(screen.queryByText(/requires a HITL preview/i)).toBeNull();
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
      expect(screen.getByTestId("assistant-commit-message").textContent).toMatch(
        /committed/i,
      );
    });
    expect(screen.getByTestId("assistant-commit-state").textContent).toMatch(
      /committed/i,
    );
    const commitCall = convexMock.mutationCalls.find((call) => call?.planId);
    expect(commitCall.acceptedClientRequestIds).toHaveLength(3);
    expect(commitCall.rejectedClientRequestIds).toEqual([]);
  });

  test("builder reminder requests create HITL action plans without direct mutation", async () => {
    render(
      <AppShell>
        <main>Workspace</main>
      </AppShell>,
    );

    fireEvent.keyDown(window, { key: "j", metaKey: true });
    await sendAssistantMessage(
      "add a builder reminder to call the framer on 2026-06-16",
    );

    expect(await screen.findByText(/HITL reminder/i)).toBeTruthy();
    const planCall = convexMock.mutationCalls.find((call) => call?.actions);
    expect(planCall.actions).toEqual([
      expect.objectContaining({
        actionKey: "create_proposal_reminder",
        input: expect.objectContaining({
          proposalId: "proposal_123",
          startsAt: "2026-06-16",
          title: "call the framer",
        }),
      }),
    ]);
    expect(convexMock.mutationCalls.some((call) => call?.planId)).toBe(false);
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
