import { describe, expect, test } from "vitest";
import type { DrawFlowAssistantRouteContext } from "./assistantRouteContext.ts";
import {
  buildDeterministicWorkflowPlan,
  buildNavigationResumeWorkflowPlan,
  buildReminderTargetWorkflowPlan,
  enrichWorkflowForPlannerNavigation,
  nextRunnableWorkflowStep,
} from "./assistantWorkflow.ts";

const baseContext: DrawFlowAssistantRouteContext = {
  authDiagnostics: {
    hasOrganization: true,
    hasToken: true,
    hasUser: true,
    normalizedRoles: ["builder"],
    roleCount: 1,
  },
  organizationId: "org_test",
  pathname: "/builder",
  role: "builder",
  roles: ["builder"],
  search: {},
  userId: "user_test",
  workspace: "builder",
};

const backofficeContext: DrawFlowAssistantRouteContext = {
  ...baseContext,
  authDiagnostics: {
    ...baseContext.authDiagnostics,
    normalizedRoles: ["admin"],
  },
  pathname: "/backoffice",
  role: "admin",
  roles: ["admin"],
  workspace: "backoffice",
};

describe("assistant workflow planning", () => {
  test("creates a Garden Suite startup workflow instead of plain navigation", () => {
    const plan = buildDeterministicWorkflowPlan(
      "Start a new Garden Suite build",
      baseContext
    );

    expect(plan).toMatchObject({
      goal: "Start a new Garden Suite build proposal",
      steps: [
        { kind: "navigate" },
        { kind: "wait_for_route" },
        { kind: "wait_for_client_capability" },
        {
          input: {
            action: {
              actionKey: "select_proposal_template",
              input: { templateKey: "garden-suite" },
              route: "/builder/proposals/new",
            },
          },
          kind: "run_client_action",
        },
        { kind: "self_check" },
      ],
    });
  });

  test.each([
    "I want to start a new garden build",
    "I want to start a new gardensuite build",
    "I want to start a new garden suite build",
    "I want to start a new garden-suite build",
    "Start a new Garden Suite build",
    "Start a new gardensuite proposal",
    "Create a new laneway suite proposal",
    "Create a new lanewaysuite proposal",
    "Start a new accessory dwelling unit build",
  ])("infers the Garden Suite template for %s", (prompt) => {
    const plan = buildDeterministicWorkflowPlan(prompt, baseContext);

    expect(plan).toMatchObject({
      goal: "Start a new Garden Suite build proposal",
      steps: [
        { input: { to: "/builder/proposals/new" }, kind: "navigate" },
        { kind: "wait_for_route" },
        { kind: "wait_for_client_capability" },
        {
          input: {
            action: {
              actionKey: "select_proposal_template",
              input: { templateKey: "garden-suite" },
            },
          },
          kind: "run_client_action",
        },
        { kind: "self_check" },
      ],
    });
  });

  test("selects Garden Suite for the exact no-space prompt on an already-open backoffice proposal route", () => {
    const plan = buildDeterministicWorkflowPlan(
      "I want to start a new gardensuite build",
      {
        ...backofficeContext,
        pathname: "/backoffice/proposals/new",
      }
    );

    expect(plan).toMatchObject({
      goal: "Start a new Garden Suite build proposal",
      steps: [
        { input: { to: "/backoffice/proposals/new" }, kind: "navigate" },
        { input: { route: "/backoffice/proposals/new" }, kind: "wait_for_route" },
        { kind: "wait_for_client_capability" },
        {
          input: {
            action: {
              actionKey: "select_proposal_template",
              input: { templateKey: "garden-suite" },
              route: "/backoffice/proposals/new",
            },
          },
          kind: "run_client_action",
        },
        { kind: "self_check" },
      ],
    });
  });

  test("selects Garden Suite after backoffice new-build navigation for garden build prompts", () => {
    const plan = buildDeterministicWorkflowPlan(
      "I want to start a new garden build",
      backofficeContext
    );

    expect(plan).toMatchObject({
      steps: [
        { input: { to: "/backoffice/proposals/new" }, kind: "navigate" },
        { input: { route: "/backoffice/proposals/new" }, kind: "wait_for_route" },
        { kind: "wait_for_client_capability" },
        {
          input: {
            action: {
              actionKey: "select_proposal_template",
              input: { templateKey: "garden-suite" },
              route: "/backoffice/proposals/new",
            },
          },
          kind: "run_client_action",
        },
        { kind: "self_check" },
      ],
    });
  });

  test("enriches planner navigation for Garden Suite with template-selection steps", () => {
    const plan = enrichWorkflowForPlannerNavigation({
      prompt: "create a new garden suite build",
      routeContext: baseContext,
      to: "/builder/proposals/new",
    });

    expect(plan?.steps.map((step) => step.kind)).toEqual([
      "navigate",
      "wait_for_route",
      "wait_for_client_capability",
      "run_client_action",
      "self_check",
    ]);
  });

  test.each([
    "/builder/proposals/new/",
    "/builder/proposals/new?template=garden-suite",
    "/backoffice/proposals/new/?source=assistant",
  ])("enriches model-provided new proposal route variant %s", (to) => {
    const context = to.startsWith("/backoffice")
      ? backofficeContext
      : baseContext;
    const plan = enrichWorkflowForPlannerNavigation({
      prompt: "create a new garden build",
      routeContext: context,
      to,
    });

    expect(plan?.steps.map((step) => step.kind)).toEqual([
      "navigate",
      "wait_for_route",
      "wait_for_client_capability",
      "run_client_action",
      "self_check",
    ]);
    expect(plan?.steps[3]).toMatchObject({
      input: {
        action: {
          actionKey: "select_proposal_template",
          input: { templateKey: "garden-suite" },
        },
      },
    });
  });

  test("does not self-complete while workflow still has pending verification", () => {
    const plan = buildDeterministicWorkflowPlan(
      "Start a new Garden Suite build",
      baseContext
    )!;
    const run = {
      _id: "workflow_123",
      goal: plan.goal,
      prompt: "Start a new Garden Suite build",
      routeContext: baseContext,
      status: "running" as const,
      steps: plan.steps.map((step, index) =>
        index < 4 ? { ...step, status: "succeeded" as const } : step
      ),
    };

    expect(nextRunnableWorkflowStep(run)).toMatchObject({
      id: "self-check:proposal-template",
      kind: "self_check",
    });
  });

  test("models reminder target selection as AGUI and HITL workflow steps", () => {
    const plan = buildReminderTargetWorkflowPlan({
      intent: {
        allDay: false,
        startsAt: "2026-06-26T09:00:00",
        timezone: "America/Toronto",
        title: "purchase stucco from my supplier",
      },
      message: "Which live build or Build Proposal should this reminder belong to?",
      title: "Choose reminder target",
    });

    expect(plan.steps.map((step) => step.kind)).toEqual([
      "render_agui",
      "wait_for_agui_submit",
      "prepare_hitl_action_plan",
    ]);
    expect(plan.steps[0]).toMatchObject({
      input: {
        submitStepId: "wait:reminder-target-selector",
        uiParts: [
          {
            selectorKind: "reminderTarget",
            type: "selector",
          },
        ],
      },
    });
    expect(plan.steps[2]).toMatchObject({
      input: {
        actionBuilder: "create_reminder_from_target",
        sourceStepId: "wait:reminder-target-selector",
      },
    });
  });

  test("does not advance past AGUI waits until valid generated UI input arrives", () => {
    const plan = buildReminderTargetWorkflowPlan({
      intent: {
        allDay: true,
        startsAt: "2026-06-26",
        timezone: "America/Toronto",
        title: "call supplier",
      },
      message: "Choose a reminder target.",
      title: "Choose reminder target",
    });
    const run = {
      _id: "workflow_123",
      goal: plan.goal,
      prompt: "remind me to call supplier tomorrow",
      routeContext: baseContext,
      status: "needs_input" as const,
      steps: plan.steps.map((step) =>
        step.id === "render:reminder-target-selector"
          ? { ...step, status: "succeeded" as const }
          : step.id === "wait:reminder-target-selector"
            ? { ...step, status: "needs_input" as const }
            : step
      ),
    };

    expect(nextRunnableWorkflowStep(run)).toBeNull();
  });

  test("keeps route waits ahead of post-navigation summary rendering", () => {
    const plan = buildNavigationResumeWorkflowPlan({
      message: "Open the draw queue and summarize it.",
      navigation: {
        label: "Draw queue",
        reason: "Review draw status.",
        to: "/backoffice/draws",
      },
      uiParts: [
        {
          columns: ["Build", "Draw"],
          rows: [],
          title: "Draw queue",
          type: "reviewTable",
        },
      ],
    });
    const run = {
      _id: "workflow_456",
      goal: plan.goal,
      prompt: "show the draw queue and summarize it",
      routeContext: baseContext,
      status: "running" as const,
      steps: plan.steps.map((step) =>
        step.id === "navigate:target-route"
          ? { ...step, status: "succeeded" as const }
          : step.id === "wait:target-route"
            ? { ...step, status: "running" as const }
            : step
      ),
    };

    expect(nextRunnableWorkflowStep(run)).toMatchObject({
      id: "wait:target-route",
      kind: "wait_for_route",
    });
  });

  test("plans navigation resume workflows with rendered output and self-check", () => {
    const plan = buildNavigationResumeWorkflowPlan({
      finalSummary: "Opened draw queue and summarized next action.",
      message: "Open draw queue.",
      navigation: {
        label: "Draw queue",
        reason: "Review draw status.",
        routeId: "backoffice.draws",
        to: "/backoffice/draws",
      },
      uiParts: [
        {
          columns: ["Build", "Draw"],
          rows: [],
          title: "Draw queue",
          type: "reviewTable",
        },
      ],
    });

    expect(plan.steps.map((step) => step.kind)).toEqual([
      "navigate",
      "wait_for_route",
      "render_agui",
      "self_check",
    ]);
    expect(plan.steps[2]).toMatchObject({
      input: {
        refreshPlannerResponse: true,
      },
      kind: "render_agui",
    });
    expect(plan.steps.at(-1)).toMatchObject({
      input: {
        checkKind: "post_navigation_goal",
        expectedRoute: "/backoffice/draws",
        renderedStepId: "render:post-navigation-response",
      },
      kind: "self_check",
    });
  });
});
