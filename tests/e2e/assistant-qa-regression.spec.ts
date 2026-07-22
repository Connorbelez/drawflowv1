import { expect, test, type Page } from "@playwright/test";
import {
  buildDeterministicWorkflowPlan,
  buildNavigationResumeWorkflowPlan,
  buildReminderTargetWorkflowPlan,
  type AssistantWorkflowPlan,
} from "../../src/features/assistant/assistantWorkflow.ts";
import type { DrawFlowAssistantRouteContext } from "../../src/features/assistant/assistantRouteContext.ts";

const builderContext: DrawFlowAssistantRouteContext = {
  authDiagnostics: {
    hasOrganization: true,
    hasToken: true,
    hasUser: true,
    normalizedRoles: ["builder"],
    roleCount: 1,
  },
  organizationId: "org_assistant_e2e",
  pathname: "/builder",
  role: "builder",
  roles: ["builder"],
  search: {},
  userId: "user_assistant_e2e",
  workspace: "builder",
};

const backofficeContext: DrawFlowAssistantRouteContext = {
  ...builderContext,
  authDiagnostics: {
    ...builderContext.authDiagnostics,
    normalizedRoles: ["admin"],
  },
  pathname: "/backoffice",
  role: "admin",
  roles: ["admin"],
  workspace: "backoffice",
};

type HarnessOptions = {
  capabilities?: string[];
  initialRoute: string;
  plan: AssistantWorkflowPlan;
  selectionOptions?: Array<Record<string, unknown>>;
};

async function mountWorkflowHarness(page: Page, options: HarnessOptions) {
  await page.setContent(`
    <main>
      <button id="launcher" aria-label="Open DrawFlow AI assistant">Open assistant</button>
      <section id="assistant" aria-label="DrawFlow AI assistant" hidden>
        <button id="close" aria-label="Close assistant">Close</button>
        <button id="run">Run workflow</button>
        <div id="goal"></div>
        <div id="route"></div>
        <div id="steps"></div>
        <div id="surface"></div>
      </section>
    </main>
    <script>
      const assistant = document.querySelector("#assistant");
      const goal = document.querySelector("#goal");
      const route = document.querySelector("#route");
      const steps = document.querySelector("#steps");
      const surface = document.querySelector("#surface");
      const state = {
        capabilities: new Set(),
        plan: null,
        route: "/",
        selectedTemplate: "single-family-full-build",
        selectionOptions: [],
      };

      function normalizeRoute(value) {
        if (!value) return "";
        const withoutSearch = String(value).split(/[?#]/, 1)[0] || "/";
        return withoutSearch.length > 1
          ? withoutSearch.replace(/\\/+$/, "")
          : withoutSearch;
      }

      function routeForStep(step) {
        return step?.input?.to || step?.input?.route;
      }

      function nextOpenStep() {
        return state.plan.steps.find(
          (step) => !["succeeded", "skipped", "failed"].includes(step.status)
        );
      }

      function renderShell() {
        goal.textContent = state.plan.goal;
        route.textContent = state.route;
        steps.innerHTML = state.plan.steps
          .map(
            (step) =>
              '<div data-testid="workflow-step-' +
              step.id +
              '">' +
              step.label +
              ': ' +
              step.status +
              (step.error ? " - " + step.error : "") +
              "</div>"
          )
          .join("");
      }

      function renderTemplateSurface() {
        if (!normalizeRoute(state.route).endsWith("/proposals/new")) return;
        surface.innerHTML =
          '<section data-testid="proposal-template-surface">' +
          '<button data-template="single-family-full-build">Single Family Full Build' +
          (state.selectedTemplate === "single-family-full-build" ? " selected" : "") +
          "</button>" +
          '<button data-template="garden-suite">Garden Suite' +
          (state.selectedTemplate === "garden-suite" ? " selected" : "") +
          "</button>" +
          '<p data-testid="selected-template">' +
          state.selectedTemplate +
          "</p>" +
          "</section>";
      }

      function renderPreview(label) {
        surface.insertAdjacentHTML(
          "beforeend",
          '<section data-testid="assistant-hitl-preview">' +
            label +
            '<button id="confirm">Confirm accepted batch</button>' +
            '<p id="commit-state">Preview pending confirmation</p>' +
          "</section>"
        );
        document.querySelector("#confirm")?.addEventListener("click", () => {
          document.querySelector("#commit-state").textContent =
            "Accepted assistant actions committed.";
        });
      }

      function renderUiPart(part) {
        if (part.type === "selector") {
          surface.innerHTML =
            '<section data-testid="assistant-selector"><label>' +
            part.title +
            '<input aria-label="' +
            part.title +
            '"></label><div id="selector-options"></div></section>';
          const container = document.querySelector("#selector-options");
          state.selectionOptions.forEach((option, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = String(option.label || option.id || index);
            button.addEventListener("click", () => {
              const waitStep = state.plan.steps.find(
                (step) => step.id === part.stepId
              );
              waitStep.status = "succeeded";
              waitStep.result = {
                payload: { option, selectorKind: part.selectorKind },
                type: "select",
              };
              runUntilBlocked();
            });
            container.appendChild(button);
          });
          return;
        }
        if (part.type === "reviewTable") {
          surface.innerHTML =
            '<section data-testid="assistant-review-table"><h2>' +
            part.title +
            "</h2><table><tbody>" +
            part.rows
              .map(
                (row) =>
                  "<tr>" +
                  row.values.map((value) => "<td>" + value + "</td>").join("") +
                  "<td>" +
                  (row.actions || [])
                    .map(
                      (action) =>
                        '<button data-to="' +
                        (action.to || "") +
                        '">' +
                        action.label +
                        "</button>"
                    )
                    .join("") +
                  "</td></tr>"
              )
              .join("") +
            "</tbody></table></section>";
          return;
        }
        if (part.type === "briefing") {
          surface.innerHTML =
            '<section data-testid="assistant-briefing"><h2>' +
            part.title +
            "</h2>" +
            (part.sections || [])
              .flatMap((section) => section.items || [])
              .map((item) => '<p>' + item.title + "</p>")
              .join("") +
            "</section>";
          return;
        }
        if (part.type === "structuredForm") {
          surface.innerHTML =
            '<form data-testid="assistant-structured-form"><label>Quantity<input value="' +
            (part.defaults?.quantity || "") +
            '"></label><label>Unit<input value="' +
            (part.defaults?.unit || "") +
            '"></label><label>Unit cost, cents<input value="' +
            (part.defaults?.costCents || "") +
            '"></label><label>Supplier<input value="' +
            (part.defaults?.supplier || "") +
            '"></label><button type="button">Prepare HITL batch</button></form>';
        }
      }

      function uiPartsForStep(step) {
        const parts = step.input?.uiParts || [];
        const submitStepId =
          step.input?.submitStepId ||
          state.plan.steps.find((candidate) => candidate.kind === "wait_for_agui_submit")
            ?.id;
        return parts.map((part) => ({
          ...part,
          stepId: submitStepId || step.id,
          workflowRunId: "workflow_e2e",
        }));
      }

      function runUntilBlocked() {
        for (;;) {
          const step = nextOpenStep();
          if (!step || step.status === "needs_input") {
            renderShell();
            return;
          }
          if (step.kind === "navigate") {
            state.route = routeForStep(step);
            step.result = { to: state.route };
            step.status = "succeeded";
            renderTemplateSurface();
            continue;
          }
          if (step.kind === "wait_for_route") {
            const expected = routeForStep(step);
            if (normalizeRoute(state.route) === normalizeRoute(expected)) {
              step.result = { pathname: state.route };
              step.status = "succeeded";
              continue;
            }
            step.error = "Route did not match";
            step.status = "needs_input";
            renderShell();
            return;
          }
          if (step.kind === "wait_for_client_capability") {
            if (state.capabilities.has(step.input?.actionKey)) {
              step.result = { actionKey: step.input.actionKey };
              step.status = "succeeded";
              continue;
            }
            step.error = "Client capability missing";
            step.status = "needs_input";
            renderShell();
            return;
          }
          if (step.kind === "run_client_action") {
            const action = step.input?.action;
            if (action?.actionKey === "select_proposal_template") {
              state.selectedTemplate = action.input.templateKey;
              step.result = { ok: true, templateKey: state.selectedTemplate };
              step.status = "succeeded";
              renderTemplateSurface();
              continue;
            }
            step.error = "Unsupported client action";
            step.status = "needs_input";
            renderShell();
            return;
          }
          if (step.kind === "render_agui") {
            const parts = uiPartsForStep(step);
            if (parts.length === 0) {
              step.error = "No UI parts";
              step.status = "failed";
              renderShell();
              return;
            }
            parts.forEach(renderUiPart);
            step.result = { renderedPartCount: parts.length };
            step.status = "succeeded";
            continue;
          }
          if (step.kind === "wait_for_agui_submit") {
            step.result = { waitingFor: step.input?.selectorKind || "agui" };
            step.status = "needs_input";
            renderShell();
            return;
          }
          if (step.kind === "prepare_hitl_action_plan") {
            let hasAction = Array.isArray(step.input?.actions) && step.input.actions.length > 0;
            if (step.input?.actionBuilder === "create_reminder_from_target") {
              const source = state.plan.steps.find(
                (candidate) => candidate.id === step.input.sourceStepId
              );
              hasAction = Boolean(source?.result?.payload?.option);
            }
            if (!hasAction) {
              step.error =
                "I could not derive a valid HITL action preview from the workflow state.";
              step.status = "needs_input";
              renderShell();
              return;
            }
            renderPreview("Scoped reminder preview");
            step.result = { actionCount: 1 };
            step.status = "succeeded";
            continue;
          }
          if (step.kind === "self_check") {
            const expectedTemplate = step.input?.templateKey;
            const expectedRoute = step.input?.expectedRoute;
            const complete = expectedTemplate
              ? state.selectedTemplate === expectedTemplate
              : normalizeRoute(state.route) === normalizeRoute(expectedRoute);
            step.status = complete ? "succeeded" : "needs_input";
            step.result = { complete };
            if (complete) {
              surface.insertAdjacentHTML(
                "beforeend",
                '<p data-testid="workflow-final-summary">Workflow complete</p>'
              );
            } else {
              step.error = "Self-check failed";
            }
            renderShell();
            return;
          }
          step.status = "succeeded";
        }
      }

      window.__mountAssistantHarness = (input) => {
        state.capabilities = new Set(input.capabilities || []);
        state.plan = input.plan;
        state.route = input.initialRoute;
        state.selectionOptions = input.selectionOptions || [];
        state.selectedTemplate = "single-family-full-build";
        state.plan.steps = state.plan.steps.map((step) => ({ ...step }));
        surface.innerHTML = "";
        renderShell();
      };
      document.querySelector("#launcher").addEventListener("click", () => {
        assistant.hidden = false;
      });
      document.querySelector("#close").addEventListener("click", () => {
        assistant.hidden = true;
      });
      document.querySelector("#run").addEventListener("click", runUntilBlocked);
    </script>
  `);
  await page.evaluate((input) => window.__mountAssistantHarness(input), {
    capabilities: ["select_proposal_template", ...(options.capabilities ?? [])],
    initialRoute: options.initialRoute,
    plan: options.plan,
    selectionOptions: options.selectionOptions ?? [],
  });
  await page.getByLabel("Open DrawFlow AI assistant").click();
}

function requirePlan(plan: AssistantWorkflowPlan | null): AssistantWorkflowPlan {
  if (!plan) {
    throw new Error("Expected assistant workflow planner to return a workflow plan.");
  }
  return plan;
}

test("Garden build prompt runs the real planner workflow and reopens the launcher", async ({
  page,
}) => {
  const plan = requirePlan(
    buildDeterministicWorkflowPlan(
      "I want to start a new gardensuite build",
      builderContext
    )
  );

  await mountWorkflowHarness(page, { initialRoute: "/builder", plan });
  await page.getByRole("button", { name: "Run workflow" }).click();

  await expect(page.locator("#route")).toHaveText("/builder/proposals/new");
  await expect(page.getByTestId("selected-template")).toHaveText("garden-suite");
  await expect(page.getByText("Single Family Full Build")).not.toContainText(
    "selected"
  );
  await page.getByLabel("Close assistant").click();
  await expect(page.locator("#assistant")).toBeHidden();
  await page.getByLabel("Open DrawFlow AI assistant").click();
  await expect(page.locator("#assistant")).toBeVisible();
});

test("Backoffice garden build prompt selects Garden Suite after navigation", async ({
  page,
}) => {
  const plan = requirePlan(
    buildDeterministicWorkflowPlan(
      "I want to start a new gardensuite build",
      backofficeContext
    )
  );

  await mountWorkflowHarness(page, { initialRoute: "/backoffice", plan });
  await page.getByRole("button", { name: "Run workflow" }).click();

  await expect(page.locator("#route")).toHaveText("/backoffice/proposals/new");
  await expect(page.getByTestId("selected-template")).toHaveText("garden-suite");
});

test("Unscoped reminder workflow blocks HITL preview until target selection", async ({
  page,
}) => {
  const plan = buildReminderTargetWorkflowPlan({
    intent: {
      allDay: false,
      startsAt: "2026-06-26T09:00:00",
      timezone: "America/Toronto",
      title: "purchase stucco from my supplier",
    },
    message: "Choose the Build Proposal or live Build for this reminder.",
    title: "Choose reminder target",
  });

  await mountWorkflowHarness(page, {
    initialRoute: "/builder",
    plan,
    selectionOptions: [
      {
        buildId: "build_123",
        id: "activeBuild:build_123",
        kind: "activeBuild",
        label: "4-plex Proposal live build",
      },
    ],
  });
  await page.getByRole("button", { name: "Run workflow" }).click();

  await expect(page.getByTestId("assistant-selector")).toBeVisible();
  await expect(page.getByTestId("assistant-hitl-preview")).toHaveCount(0);
  await expect(page.getByTestId("workflow-step-wait:reminder-target-selector")).toContainText(
    "needs_input"
  );
  await page.getByRole("button", { name: "4-plex Proposal live build" }).click();
  await expect(page.getByTestId("assistant-hitl-preview")).toContainText(
    "Scoped reminder preview"
  );
});

test("Navigation-plus-summary workflows wait for route and rendered follow-up", async ({
  page,
}) => {
  const plan = buildNavigationResumeWorkflowPlan({
    finalSummary: "There are no draw requests needing review; 8 planned draws are visible.",
    message: "Opening draw queue and summarizing requests.",
    navigation: {
      label: "Draw queue",
      reason: "Review reimbursement draw status and next actions.",
      routeId: "backoffice.draws",
      to: "/backoffice/draws?status=requested",
    },
    uiParts: [
      {
        columns: ["Build", "Draw", "Status", "Next action"],
        rows: [
          {
            actions: [
              {
                kind: "drawQueueAction",
                label: "Open planned draws",
                reason: "No requested draws are waiting.",
                to: "/backoffice/draws",
              },
            ],
            id: "draw-summary",
            values: ["4-plex Proposal", "8 planned", "No review requests", "Open planned draws"],
          },
        ],
        title: "Draw queue next actions",
        type: "reviewTable",
      },
    ],
  });

  await mountWorkflowHarness(page, { initialRoute: "/backoffice", plan });
  await page.getByRole("button", { name: "Run workflow" }).click();

  await expect(page.locator("#route")).toHaveText(
    "/backoffice/draws?status=requested"
  );
  await expect(page.getByTestId("assistant-review-table")).toContainText(
    "8 planned"
  );
  await expect(page.getByTestId("workflow-final-summary")).toBeVisible();
});
