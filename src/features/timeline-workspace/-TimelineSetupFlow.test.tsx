// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { TimelineSetupFlow } from "./-TimelineSetupFlow";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restoreObjectUrlStatics();
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

describe("TimelineSetupFlow permit viewer", () => {
  test("requires a proposed start date before continuing", () => {
    render(<TimelineSetupFlow baseItems={baseItems} onComplete={vi.fn()} />);

    const proposedStartDateInput = screen.getByTestId(
      "timeline-setup-proposed-start-date-input"
    );
    expect((proposedStartDateInput as HTMLInputElement).value).toMatch(
      /^\d{4}-\d{2}-\d{2}$/
    );

    fireEvent.change(proposedStartDateInput, { target: { value: "" } });
    fireEvent.click(screen.getByTestId("timeline-setup-continue-budget"));

    expect(screen.getByTestId("timeline-setup-error").textContent).toContain(
      "Enter a proposed start date"
    );
  });

  test("emits a backdated proposed start date in the setup result", () => {
    const onComplete = vi.fn();
    render(<TimelineSetupFlow baseItems={baseItems} onComplete={onComplete} />);

    fireEvent.change(
      screen.getByTestId("timeline-setup-proposed-start-date-input"),
      { target: { value: "2025-01-15" } }
    );
    fireEvent.click(screen.getByTestId("timeline-setup-continue-budget"));
    fireEvent.click(screen.getByTestId("timeline-setup-complete"));

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        proposedStartDate: "2025-01-15",
      })
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
      '1,Draw/Milestone 1,60000,DC/ED,25000,20%,10,20000',
      ",,,Permits,37500,30%,15,30000",
      ",,,Foundation,12500,10%,5,10000",
      '2,Draw/Milestone 2,40000,Framing,50000,40%,20,40000',
    ].join("\n");
    const file = new File([csv], "luverne-budget.csv", { type: "text/csv" });

    fireEvent.change(screen.getByTestId("timeline-budget-import-input"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByTestId("timeline-budget-import-status").textContent)
        .toContain("Imported 2 milestones and 4 budget lines");
    });

    expect(screen.getByText("Draw/Milestone 1")).toBeTruthy();
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
      ])
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

    expect(
      (screen.getByTestId(
        "timeline-setup-row-budget-site-foundation",
      ) as HTMLInputElement).value,
    ).toBe("$100,000");

    fireEvent.change(
      screen.getByTestId(
        "timeline-setup-submilestone-budget-permit-mobilization",
      ),
      { target: { value: "70000" } },
    );

    expect(
      (screen.getByTestId(
        "timeline-setup-row-budget-site-foundation",
      ) as HTMLInputElement).value,
    ).toBe("$120,000");
    expect(screen.getAllByText("$120,000").length).toBeGreaterThan(0);

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
