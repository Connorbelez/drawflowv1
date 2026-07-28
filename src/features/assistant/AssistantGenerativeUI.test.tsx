// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AssistantGenerativeUI } from "./AssistantGenerativeUI.tsx";

describe("AssistantGenerativeUI", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders milestone selection as a dropdown for material forms", () => {
    const onSubmitCostItem = vi.fn();

    render(
      <AssistantGenerativeUI
        onNavigate={vi.fn()}
        onSubmitCostItem={onSubmitCostItem}
        parts={[
          {
            defaults: {
              costCents: 125_000,
              title: "Stucco supplies",
            },
            fields: [
              "milestoneKey",
              "title",
              "itemType",
              "quantity",
              "costCents",
              "supplier",
              "description",
            ],
            formKind: "costItem",
            milestoneOptions: [
              { key: "foundation", label: "Foundation (foundation)" },
              { key: "exterior", label: "Exterior (exterior)" },
            ],
            target: {
              kind: "proposal",
              proposalId: "proposal_123",
            },
            title: "Supplier purchase draft",
            type: "structuredForm",
          },
        ]}
      />
    );

    const milestoneSelect = screen.getByTestId(
      "assistant-cost-item-milestone-select"
    ) as HTMLSelectElement;
    expect(milestoneSelect.value).toBe("foundation");

    fireEvent.change(milestoneSelect, { target: { value: "exterior" } });
    const form = screen.getByTestId("assistant-structured-form");
    fireEvent.click(
      within(form).getByRole("button", { name: /prepare hitl batch/i })
    );

    expect(onSubmitCostItem).toHaveBeenCalledWith(
      expect.objectContaining({
        milestoneKey: "exterior",
        target: { kind: "proposal", proposalId: "proposal_123" },
        title: "Stucco supplies",
      })
    );
  });

  test("renders known clarifying answers as selectable controls", () => {
    render(
      <AssistantGenerativeUI
        onNavigate={vi.fn()}
        onSubmitCostItem={vi.fn()}
        parts={[
          {
            questions: [
              {
                choices: [
                  { label: "Use current build", value: "current-build" },
                  { label: "Choose another", value: "choose-another" },
                ],
                id: "target",
                label: "Which build should I use?",
              },
            ],
            title: "Quick details",
            type: "questionnaire",
          },
        ]}
      />
    );

    const choice = screen.getByRole("button", { name: /use current build/i });
    fireEvent.click(choice);

    expect(choice.getAttribute("aria-pressed")).toBe("true");
  });

  test("submits workflow-aware forms through the workflow UI event bridge", () => {
    const onSubmitCostItem = vi.fn();
    const onWorkflowUiEvent = vi.fn();

    render(
      <AssistantGenerativeUI
        onNavigate={vi.fn()}
        onSubmitCostItem={onSubmitCostItem}
        onWorkflowUiEvent={onWorkflowUiEvent}
        parts={[
          {
            defaults: {
              costCents: 125_000,
              title: "Stucco supplies",
            },
            fields: ["milestoneKey", "title", "itemType", "quantity", "costCents"],
            formKind: "costItem",
            milestoneOptions: [{ key: "exterior", label: "Exterior" }],
            stepId: "step-form",
            target: {
              kind: "proposal",
              proposalId: "proposal_123",
            },
            title: "Supplier purchase draft",
            type: "structuredForm",
            workflowRunId: "workflow_123",
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /prepare hitl batch/i }));

    expect(onSubmitCostItem).not.toHaveBeenCalled();
    expect(onWorkflowUiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stepId: "step-form",
        type: "submit",
        workflowRunId: "workflow_123",
      })
    );
  });

  test("renders extracted material quantity, unit, price, supplier, and milestone defaults", () => {
    const onSubmitCostItem = vi.fn();

    render(
      <AssistantGenerativeUI
        onNavigate={vi.fn()}
        onSubmitCostItem={onSubmitCostItem}
        parts={[
          {
            defaults: {
              costCents: 1_800,
              description: "60 bags stucco mix at $18 per bag.",
              itemType: "material",
              milestoneKey: "exterior",
              quantity: 60,
              supplier: "Unspecified supplier",
              title: "Stucco mix",
              unit: "bags",
            },
            fields: [
              "milestoneKey",
              "title",
              "itemType",
              "quantity",
              "unit",
              "costCents",
              "supplier",
              "description",
            ],
            formKind: "costItem",
            milestoneOptions: [
              { key: "foundation", label: "Foundation" },
              { key: "exterior", label: "Exterior finish" },
            ],
            target: {
              buildId: "build_123",
              kind: "activeBuild",
            },
            title: "Draft live-build material item",
            type: "structuredForm",
          },
        ]}
      />
    );

    expect(
      (screen.getByTestId("assistant-cost-item-milestone-select") as HTMLSelectElement)
        .value
    ).toBe("exterior");
    expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe(
      "60"
    );
    expect((screen.getByLabelText("Unit") as HTMLInputElement).value).toBe(
      "bags"
    );
    expect(
      (screen.getByLabelText("Unit cost, cents") as HTMLInputElement).value
    ).toBe("1800");
    expect((screen.getByLabelText("Supplier") as HTMLInputElement).value).toBe(
      "Unspecified supplier"
    );

    fireEvent.click(screen.getByRole("button", { name: /prepare hitl batch/i }));
    expect(onSubmitCostItem).toHaveBeenCalledWith(
      expect.objectContaining({
        costCents: 1800,
        milestoneKey: "exterior",
        quantity: 60,
        supplier: "Unspecified supplier",
        title: "Stucco mix",
        unit: "bags",
      })
    );
  });

  test("emits workflow events and navigates from briefing action rows", () => {
    const onNavigate = vi.fn();
    const onWorkflowUiEvent = vi.fn();

    render(
      <AssistantGenerativeUI
        onNavigate={onNavigate}
        onSubmitCostItem={vi.fn()}
        onWorkflowUiEvent={onWorkflowUiEvent}
        parts={[
          {
            sections: [
              {
                id: "today",
                items: [
                  {
                    actions: [
                      {
                        kind: "briefingAction",
                        label: "Open review",
                        reason: "Review submitted proposal",
                        to: "/backoffice/proposals/proposal_123",
                      },
                    ],
                    id: "proposal_123",
                    kind: "proposalReview",
                    priority: "high",
                    title: "Review submitted proposal",
                  },
                ],
                title: "Today",
              },
            ],
            stepId: "render-briefing",
            title: "Operational briefing",
            type: "briefing",
            workflowRunId: "workflow_123",
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /open review/i }));

    expect(onWorkflowUiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stepId: "render-briefing",
        type: "navigate",
        workflowRunId: "workflow_123",
      })
    );
    expect(onNavigate).toHaveBeenCalledWith({
      label: "Open review",
      reason: "Review submitted proposal",
      to: "/backoffice/proposals/proposal_123",
    });
  });

  test("renders review-table action rows with workflow events", () => {
    const onNavigate = vi.fn();
    const onWorkflowUiEvent = vi.fn();

    render(
      <AssistantGenerativeUI
        onNavigate={onNavigate}
        onSubmitCostItem={vi.fn()}
        onWorkflowUiEvent={onWorkflowUiEvent}
        parts={[
          {
            columns: ["Build", "Status", "Next action"],
            rows: [
              {
                actions: [
                  {
                    kind: "drawQueueAction",
                    label: "Review draw",
                    reason: "Requested draw needs approval",
                    to: "/backoffice/builds/build_123",
                  },
                ],
                id: "draw_123",
                values: ["Garden Suite", "requested", "Review draw"],
              },
            ],
            stepId: "render-table",
            title: "Draw queue next actions",
            type: "reviewTable",
            workflowRunId: "workflow_123",
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /review draw/i }));

    expect(onWorkflowUiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stepId: "render-table",
        type: "navigate",
        workflowRunId: "workflow_123",
      })
    );
    expect(onNavigate).toHaveBeenCalledWith({
      label: "Review draw",
      reason: "Requested draw needs approval",
      to: "/backoffice/builds/build_123",
    });
  });

  test("submits workflow-aware autocomplete selections through the workflow UI event bridge", async () => {
    const onWorkflowUiEvent = vi.fn();

    render(
      <AssistantGenerativeUI
        onNavigate={vi.fn()}
        onSubmitCostItem={vi.fn()}
        onWorkflowUiEvent={onWorkflowUiEvent}
        parts={[
          {
            selectorKind: "reminderTarget",
            stepId: "wait-selector",
            title: "Choose reminder target",
            type: "selector",
            workflowRunId: "workflow_123",
          },
        ]}
        selectionOptions={[
          {
            buildId: "build_123",
            id: "activeBuild:build_123",
            kind: "activeBuild",
            label: "Assistant live build",
            subtitle: "Live Build",
          },
        ]}
      />
    );

    fireEvent.change(screen.getByLabelText("Choose reminder target"), {
      target: { value: "live" },
    });
    fireEvent.click(await screen.findByText("Assistant live build"));

    expect(onWorkflowUiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          option: expect.objectContaining({
            buildId: "build_123",
            kind: "activeBuild",
          }),
          selectorKind: "reminderTarget",
        },
        stepId: "wait-selector",
        type: "select",
        workflowRunId: "workflow_123",
      })
    );
  });
});
