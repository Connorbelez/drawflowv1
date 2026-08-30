// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  dispatchAssistantClientAction,
  queueAssistantClientActions,
} from "#/features/assistant/assistantClientActionBridge";

import { TimelineSetupFlow } from "./-TimelineSetupFlow";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restoreObjectUrlStatics();
  window.history.pushState(null, "", "/");
  window.sessionStorage.clear();
});

const baseItems = [
  {
    data: {
      amount: 100_000,
      draw: "Draw 1",
      drawX: 12,
      durationDays: 10,
      evidence: "Not started",
      icon: "foundation" as const,
      name: "Foundation",
      policy: "Upcoming",
      status: "upcoming" as const,
      subMilestones: ["Permit mobilization"],
    },
    eyebrow: "Milestone 1",
    id: "foundation",
    label: "Foundation",
    lane: 0,
    markerLabel: "1",
    tone: "upcoming" as const,
    x: 0,
  },
];

const templateActionFixture = [
  {
    isDefault: true,
    rows: [
      {
        dependencyKeys: [],
        durationDays: 10,
        icon: "foundation" as const,
        key: "single-family-foundation",
        name: "Foundation",
        percentageBps: 10_000,
        subMilestones: ["Permit mobilization"],
        type: "foundation",
      },
    ],
    summary: "Single family fixture",
    templateKey: "single-family-full-build",
    title: "Single Family Full Build",
  },
  {
    rows: [
      {
        dependencyKeys: [],
        durationDays: 14,
        icon: "foundation" as const,
        key: "garden-suite-permits",
        name: "Garden suite permits and mobilization",
        percentageBps: 10_000,
        subMilestones: ["Permit release"],
        type: "permitting",
      },
    ],
    summary: "Garden Suite fixture",
    templateKey: "garden-suite",
    title: "Garden Suite",
  },
];

const brokerOptions = [
  {
    email: "principal@fairlend.example",
    isPrincipal: true,
    name: "Priya Principal",
    workosUserId: "user_principal",
  },
  {
    email: "broker@fairlend.example",
    isPrincipal: false,
    name: "Jordan Broker",
    workosUserId: "user_broker",
  },
];

describe("TimelineSetupFlow assigned broker", () => {
  test("places the primary continuation after setup content and advances to the budget step", () => {
    render(<TimelineSetupFlow baseItems={baseItems} onComplete={vi.fn()} />);

    const permitAction = screen.getByTestId("timeline-setup-skip-permits");
    const footer = screen.getByTestId("timeline-setup-action-footer");
    const continueButton = screen.getByRole("button", {
      name: "Continue to milestone budget",
    });

    expect(
      permitAction.compareDocumentPosition(footer) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(continueButton.closest("aside")).toBeNull();
    expect(footer.contains(continueButton)).toBe(true);
    expect(continueButton.className).toContain("active:scale-[0.96]");
    expect(continueButton.className).toContain(
      "timeline-setup-footer-primary",
    );

    fireEvent.click(continueButton);

    expect(screen.getByText("Step 2 of 4 - Milestones & Budget")).toBeTruthy();
  });

  test("keeps the primary action and setup inputs usable at the narrow breakpoint", () => {
    const css = readFileSync(
      "src/features/timeline-workspace/-timeline-setup-flow.css",
      "utf8",
    );
    const narrowStyles = css.slice(css.indexOf("@media (max-width: 540px)"));

    expect(narrowStyles).toMatch(
      /\.timeline-setup-footer-primary,\s*\.timeline-setup-primary\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/s,
    );
    expect(narrowStyles).toMatch(
      /\.timeline-setup-money-input input,\s*\.timeline-setup-address-field input\s*\{[^}]*font-size:\s*1rem;/s,
    );
  });

  test("shows the selector on the first screen and emits the principal broker default", () => {
    const onComplete = vi.fn();
    render(
      <TimelineSetupFlow
        baseItems={baseItems}
        brokerOptions={brokerOptions}
        defaultAssignedBrokerWorkosUserId="user_principal"
        onComplete={onComplete}
      />,
    );

    expect(screen.getByText("4. Assigned Broker")).toBeTruthy();
    expect(
      screen.getByText("Defaulted to your organization’s principal broker."),
    ).toBeTruthy();
    expect(
      screen.getByTestId("timeline-setup-assigned-broker-select").textContent,
    ).toContain("Priya Principal");

    fireEvent.click(screen.getByTestId("timeline-setup-continue-budget"));
    fireEvent.click(screen.getByTestId("timeline-setup-complete"));

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedBrokerWorkosUserId: "user_principal",
      }),
    );
  });

  test("blocks progress when the organization has no active broker members", () => {
    render(
      <TimelineSetupFlow
        baseItems={baseItems}
        brokerOptions={[]}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("timeline-setup-continue-budget"));

    expect(screen.getByRole("alert").textContent).toContain(
      "No active broker is available",
    );
  });
});

describe("TimelineSetupFlow loan percentage", () => {
  test("defines borrower starting cash as borrower-owned funds available at build commencement", () => {
    render(<TimelineSetupFlow baseItems={baseItems} onComplete={vi.fn()} />);

    expect(screen.getAllByText("Borrower Starting Cash")).toHaveLength(2);
    expect(
      screen.getByText(
        "The borrower's own cash available at the start of the build, before any reimbursement draws are released.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Cash on hand is how much the borrower can spend before needing a draw.",
      ),
    ).toBeNull();
  });

  test("displays an 80% default and persists the complementary borrower contribution", () => {
    const onComplete = vi.fn();
    render(<TimelineSetupFlow baseItems={baseItems} onComplete={onComplete} />);

    const loanPercentageInput = screen.getByTestId(
      "timeline-setup-loan-percentage-input",
    ) as HTMLInputElement;
    expect(loanPercentageInput.value).toBe("80");
    const loanPercentageLabels = screen.getAllByText("Loan Percentage");
    expect(loanPercentageLabels).toHaveLength(2);
    expect(loanPercentageLabels[1]?.closest("div")?.textContent).toContain(
      "80% · $1,000,000",
    );
    expect(
      screen.getByText("Borrower Contribution").closest("div")?.textContent,
    ).toContain("20% · $250,000");

    fireEvent.change(loanPercentageInput, { target: { value: "75" } });
    fireEvent.click(screen.getByTestId("timeline-setup-continue-budget"));
    fireEvent.click(screen.getByTestId("timeline-setup-complete"));

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        borrowerCoPayBps: 2_500,
        borrowerCoPayCents: 31_250_000,
        reimbursementBps: 7_500,
        reimbursableBudgetCents: 93_750_000,
      }),
    );
  });
});

describe("TimelineSetupFlow permit viewer", () => {
  test("requires a proposed start date before continuing", () => {
    render(<TimelineSetupFlow baseItems={baseItems} onComplete={vi.fn()} />);

    const proposedStartDateInput = screen.getByTestId(
      "timeline-setup-proposed-start-date-input",
    );
    expect((proposedStartDateInput as HTMLInputElement).value).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );

    fireEvent.change(proposedStartDateInput, { target: { value: "" } });
    fireEvent.click(screen.getByTestId("timeline-setup-continue-budget"));

    expect(screen.getByTestId("timeline-setup-error").textContent).toContain(
      "Enter a proposed start date",
    );
  });

  test("opens the proposed start date picker from the calendar trigger", () => {
    render(<TimelineSetupFlow baseItems={baseItems} onComplete={vi.fn()} />);
    const proposedStartDateInput = screen.getByTestId(
      "timeline-setup-proposed-start-date-input",
    ) as HTMLInputElement;
    const showPicker = vi.fn();
    Object.defineProperty(proposedStartDateInput, "showPicker", {
      configurable: true,
      value: showPicker,
    });

    fireEvent.click(
      screen.getByTestId("timeline-setup-proposed-start-date-input-picker"),
    );

    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  test("emits a backdated proposed start date in the setup result", () => {
    const onComplete = vi.fn();
    render(<TimelineSetupFlow baseItems={baseItems} onComplete={onComplete} />);

    fireEvent.change(
      screen.getByTestId("timeline-setup-proposed-start-date-input"),
      { target: { value: "2025-01-15" } },
    );
    fireEvent.click(screen.getByTestId("timeline-setup-continue-budget"));
    fireEvent.click(screen.getByTestId("timeline-setup-complete"));

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        proposedStartDate: "2025-01-15",
      }),
    );
  });

  test("shows permit viewer after leaving template selection when a permit is attached", () => {
    ensureObjectUrlStatics();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:permit");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const file = new File(["permit"], "setup-permit.pdf", {
      type: "application/pdf",
    });

    render(<TimelineSetupFlow baseItems={baseItems} onComplete={vi.fn()} />);

    fireEvent.change(screen.getByTestId("timeline-setup-permit-input"), {
      target: { files: [file] },
    });
    expect(screen.queryByTestId("build-permit-viewer-trigger")).toBeNull();

    fireEvent.click(screen.getByTestId("timeline-setup-continue-budget"));

    expect(screen.getByTestId("build-permit-viewer-trigger")).toBeTruthy();
  });

  test("does not show permit viewer after template selection without an attached permit", () => {
    render(<TimelineSetupFlow baseItems={baseItems} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByTestId("timeline-setup-continue-budget"));

    expect(screen.queryByTestId("build-permit-viewer-trigger")).toBeNull();
  });
});

describe("TimelineSetupFlow assistant client actions", () => {
  test("selects the Garden Suite template through the agent action bridge", async () => {
    render(
      <TimelineSetupFlow
        baseItems={baseItems}
        onComplete={vi.fn()}
        settingsTemplates={templateActionFixture}
      />,
    );

    const gardenSuiteCard = screen.getByTestId(
      "timeline-setup-template-card-garden-suite",
    );
    expect(gardenSuiteCard.getAttribute("data-agent-id")).toBe(
      "proposal-template:garden-suite",
    );
    expect(gardenSuiteCard.getAttribute("aria-pressed")).toBe("false");

    expect(
      dispatchAssistantClientAction({
        actionKey: "select_proposal_template",
        input: { templateKey: "Garden Suite" },
      }),
    ).toBe(true);

    await waitFor(() => {
      expect(gardenSuiteCard.getAttribute("aria-pressed")).toBe("true");
    });
  });

  test("consumes queued Garden Suite selection after navigation", async () => {
    queueAssistantClientActions([
      {
        actionKey: "select_proposal_template",
        input: { templateKey: "garden-suite" },
      },
    ]);

    render(
      <TimelineSetupFlow
        baseItems={baseItems}
        onComplete={vi.fn()}
        settingsTemplates={templateActionFixture}
      />,
    );

    await waitFor(() => {
      expect(
        screen
          .getByTestId("timeline-setup-template-card-garden-suite")
          .getAttribute("aria-pressed"),
      ).toBe("true");
    });
    expect(
      screen.getByTestId("timeline-setup-assistant-notice").textContent,
    ).toBe("Garden Suite selected");
  });

  test("consumes queued Garden Suite selection when route strings differ by slash or search", async () => {
    window.history.pushState(
      null,
      "",
      "/builder/proposals/new/?from=assistant",
    );
    queueAssistantClientActions([
      {
        actionKey: "select_proposal_template",
        input: { templateKey: "garden-suite" },
        route: "/builder/proposals/new",
      },
    ]);

    render(
      <TimelineSetupFlow
        baseItems={baseItems}
        onComplete={vi.fn()}
        settingsTemplates={templateActionFixture}
      />,
    );

    await waitFor(() => {
      expect(
        screen
          .getByTestId("timeline-setup-template-card-garden-suite")
          .getAttribute("aria-pressed"),
      ).toBe("true");
    });
    expect(
      screen.getByTestId("timeline-setup-assistant-notice").textContent,
    ).toBe("Garden Suite selected");
  });

  test("waits for loaded settings templates before consuming queued Garden Suite selection", async () => {
    queueAssistantClientActions([
      {
        actionKey: "select_proposal_template",
        input: { templateKey: "garden-suite" },
      },
    ]);

    const { rerender } = render(
      <TimelineSetupFlow baseItems={baseItems} onComplete={vi.fn()} />,
    );

    expect(screen.queryByText(/garden-suite is not available/i)).toBeNull();
    expect(
      screen.queryByTestId("timeline-setup-template-card-garden-suite"),
    ).toBeNull();

    rerender(
      <TimelineSetupFlow
        baseItems={baseItems}
        onComplete={vi.fn()}
        settingsTemplates={templateActionFixture}
      />,
    );

    await waitFor(() => {
      expect(
        screen
          .getByTestId("timeline-setup-template-card-garden-suite")
          .getAttribute("aria-pressed"),
      ).toBe("true");
    });
    expect(screen.queryByText(/garden-suite is not available/i)).toBeNull();
  });

  test("updates setup fields, sub-milestone cost basis, and material costs through the agent action bridge", async () => {
    const onComplete = vi.fn();
    render(
      <TimelineSetupFlow
        baseItems={baseItems}
        onComplete={onComplete}
        settingsTemplates={[
          {
            isDefault: true,
            rows: [
              {
                dependencyKeys: [],
                durationDays: 8,
                icon: "foundation",
                key: "site-foundation",
                name: "Site prep & foundation",
                percentageBps: 10_000,
                subMilestoneDetails: [
                  {
                    key: "permit-mobilization",
                    name: "Permit mobilization",
                    percentageBps: 5_000,
                  },
                  {
                    key: "excavation",
                    name: "Excavation",
                    percentageBps: 5_000,
                  },
                ],
                subMilestones: [],
                type: "foundation",
              },
            ],
            summary: "Agent setup fixture",
            templateKey: "agent-setup-fixture",
            title: "Agent setup fixture",
          },
        ]}
      />,
    );

    await act(async () => {
      expect(
        dispatchAssistantClientAction({
          actionKey: "set_proposal_setup_field",
          input: {
            field: "totalBudget",
            value: "100000",
          },
        }),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(
        (screen.getByTestId("timeline-setup-budget-input") as HTMLInputElement)
          .value,
      ).toBe("100,000");
    });
    await act(async () => {
      expect(
        dispatchAssistantClientAction({
          actionKey: "advance_proposal_setup_step",
          input: { step: "budget" },
        }),
      ).toBe(true);
    });
    await screen.findByTestId("timeline-setup-budget-screen");

    await act(async () => {
      expect(
        dispatchAssistantClientAction({
          actionKey: "update_setup_submilestone",
          input: {
            budgetCents: 7_000_000,
            subMilestoneId: "permit-mobilization",
          },
        }),
      ).toBe(true);
    });
    await act(async () => {
      expect(
        dispatchAssistantClientAction({
          actionKey: "create_setup_cost_item",
          input: {
            costCents: 2_500_000,
            itemId: "assistant-lumber",
            itemType: "material",
            quantity: 1,
            relevantSubmilestoneKeys: ["permit-mobilization"],
            rowKey: "site-foundation",
            supplier: "A1 Lumber",
            title: "Framing lumber package",
          },
        }),
      ).toBe(true);
    });

    fireEvent.click(screen.getByTestId("timeline-setup-complete"));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledOnce();
    });
    const result = onComplete.mock.calls[0]?.[0];
    expect(result.totalBudget).toBe(120_000);
    expect(result.items[0].data.submilestoneDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          budgetCents: 7_000_000,
          key: "permit-mobilization",
        }),
      ]),
    );
    expect(result.costItems).toEqual([
      expect.objectContaining({
        costCents: 2_500_000,
        milestoneKey: "site-foundation",
        relevantSubmilestoneKeys: ["permit-mobilization"],
        supplier: "A1 Lumber",
        title: "Framing lumber package",
      }),
    ]);
  });
});

describe("TimelineSetupFlow budget import", () => {
  test("imports a Budget Import csv on the milestones and budget screen", async () => {
    const onComplete = vi.fn();
    render(<TimelineSetupFlow baseItems={baseItems} onComplete={onComplete} />);

    fireEvent.click(screen.getByTestId("timeline-setup-continue-budget"));

    const csv = [
      "DrawFlow Proposal Budget Import v1",
      "",
      "Build Name,25 Luverne",
      "Total Drawable Amount,100000",
      "Total Budget,125000",
      "Total Sqft,2500",
      "Cost per Total Sqft,50",
      "",
      [
        "Milestone Order",
        "Milestone Name",
        "Milestone Drawable Amount",
        "Category",
        "Budget",
        "% of Total",
        "$ / Total Sqft",
        "Drawable Amount",
      ].join(","),
      "1,Draw/Milestone 1,60000,DC/ED,25000,20%,10,20000",
      ",,,Permits,37500,30%,15,30000",
      ",,,Foundation,12500,10%,5,10000",
      "2,Draw/Milestone 2,40000,Framing,50000,40%,20,40000",
    ].join("\n");
    const file = new File([csv], "luverne-budget.csv", { type: "text/csv" });

    fireEvent.change(screen.getByTestId("timeline-budget-import-input"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("timeline-budget-import-status").textContent,
      ).toContain("Imported 2 milestones and 4 budget lines");
    });

    expect(
      within(
        screen.getByTestId("timeline-setup-table-row-draw-milestone-1"),
      ).getByText("Draw/Milestone 1"),
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId("timeline-setup-complete"));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledOnce();
    });
    const result = onComplete.mock.calls[0]?.[0];
    expect(result.templateTitle).toBe("25 Luverne");
    expect(result.totalBudget).toBe(125_000);
    expect(result.reimbursableBudgetCents).toBe(10_000_000);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].data.submilestoneDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          budgetCents: 2_500_000,
          key: "draw-milestone-1-dc-ed",
          name: "DC/ED",
        }),
        expect.objectContaining({
          budgetCents: 3_750_000,
          key: "draw-milestone-1-permits",
          name: "Permits",
        }),
      ]),
    );
  });
});

describe("TimelineSetupFlow sub-milestone budget rollups", () => {
  test("recalculates milestone and build budgets from edited sub-milestone budgets", async () => {
    const onComplete = vi.fn();
    render(
      <TimelineSetupFlow
        baseItems={baseItems}
        onComplete={onComplete}
        settingsTemplates={[
          {
            isDefault: true,
            rows: [
              {
                dependencyKeys: [],
                durationDays: 8,
                icon: "foundation",
                key: "site-foundation",
                name: "Site prep & foundation",
                percentageBps: 10_000,
                subMilestoneDetails: [
                  {
                    key: "permit-mobilization",
                    name: "Permit mobilization",
                    percentageBps: 5_000,
                  },
                  {
                    key: "excavation",
                    name: "Excavation",
                    percentageBps: 5_000,
                  },
                ],
                subMilestones: [],
                type: "foundation",
              },
            ],
            summary: "One milestone",
            templateKey: "rollup-fixture",
            title: "Rollup fixture",
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByTestId("timeline-setup-budget-input"), {
      target: { value: "100000" },
    });
    fireEvent.click(screen.getByTestId("timeline-setup-continue-budget"));
    await screen.findByTestId("timeline-setup-budget-screen");

    fireEvent.change(
      await screen.findByLabelText(/permit mobilization.*budget/i),
      { target: { value: "70000" } },
    );

    fireEvent.click(screen.getByTestId("timeline-setup-complete"));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledOnce();
    });
    const result = onComplete.mock.calls[0]?.[0];
    expect(result.totalBudget).toBe(120_000);
    expect(result.borrowerCoPayCents).toBe(2_400_000);
    expect(result.reimbursableBudgetCents).toBe(9_600_000);
    expect(result.items[0].data.amount).toBe(120_000);
    expect(result.items[0].data.submilestoneDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          budgetCents: 7_000_000,
          key: "permit-mobilization",
          name: "Permit mobilization",
        }),
        expect.objectContaining({
          budgetCents: 5_000_000,
          key: "excavation",
          name: "Excavation",
        }),
      ]),
    );
  });
});

function ensureObjectUrlStatics() {
  if (!URL.createObjectURL) {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => "",
    });
  }
  if (!URL.revokeObjectURL) {
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: () => undefined,
    });
  }
}

function restoreObjectUrlStatics() {
  if (originalCreateObjectURL) {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectURL,
    });
  } else {
    delete (URL as Partial<typeof URL>).createObjectURL;
  }
  if (originalRevokeObjectURL) {
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  } else {
    delete (URL as Partial<typeof URL>).revokeObjectURL;
  }
}
