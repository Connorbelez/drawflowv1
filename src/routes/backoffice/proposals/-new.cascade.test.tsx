// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const navigateMock = vi.hoisted(() => vi.fn());
const createContext = vi.hoisted(() => ({
  availableContractors: [],
  brokers: [
    {
      email: "principal@fairlend.example",
      isPrincipal: true,
      name: "Priya Principal",
      workosUserId: "user-principal",
    },
  ],
  defaultAssignedBrokerWorkosUserId: "user-principal",
  templates: [],
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (fullPath: string) =>
    (options: Record<string, unknown>) => ({
      ...options,
      fullPath,
      options,
      useRouteContext: () => ({ organizationId: "org-1" }),
    }),
  useNavigate: () => navigateMock,
}));

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useQuery: () => createContext,
}));

vi.mock(
  "#/features/production-proposals/timelineSetupAdapter.ts",
  () => ({
    PRODUCTION_SETUP_BASE_ITEMS: [],
    productionTemplatesToTimelineSetupTemplates: () => [
      {
        isDefault: true,
        rows: [
          {
            dependencyKeys: [],
            durationDays: 4,
            icon: "foundation",
            key: "foundation",
            name: "Foundation",
            percentageBps: 10_000,
            subMilestoneDetails: [
              { key: "sub-1", name: "Sub 1", percentageBps: 1000 },
              { key: "sub-2", name: "Sub 2", percentageBps: 3000 },
              { key: "sub-3", name: "Sub 3", percentageBps: 5000 },
              { key: "sub-4", name: "Sub 4", percentageBps: 1000 },
            ],
            subMilestones: [],
            type: "foundation",
          },
        ],
        summary: "Cascade route fixture",
        templateKey: "cascade-route-fixture",
        title: "Cascade route fixture",
      },
    ],
    timelineSetupResultToDraftPackage: vi.fn(),
  })
);

vi.mock(
  "#/features/production-proposals/visualParityFixtures.ts",
  () => ({
    getVisualParityCreateContext: vi.fn(),
    isProductionVisualParityFixtureEnabled: () => false,
  })
);

import { Route } from "./new";

afterEach(() => cleanup());

async function renderBudgetWorksheet({ cascade }: { cascade: boolean }) {
  const RouteComponent = Route.options.component;
  if (!RouteComponent) {
    throw new Error("Expected the production route component to be registered.");
  }
  render(<RouteComponent />);
  fireEvent.change(screen.getByTestId("timeline-setup-budget-input"), {
    target: { value: "100000" },
  });
  fireEvent.click(screen.getByTestId("timeline-setup-continue-budget"));
  await screen.findByTestId("timeline-setup-budget-screen");
  if (cascade) {
    fireEvent.click(
      screen.getByTestId("timeline-setup-budget-cascade-toggle")
    );
  }
}

function budgetInput(subMilestoneId: string) {
  return screen.getByTestId(
    `timeline-setup-table-subrow-budget-${subMilestoneId}`
  ) as HTMLInputElement;
}

describe("/backoffice/proposals/new Cascade budget allocation", () => {
  test("keeps direct Sub-milestone edit semantics when Cascade is off", async () => {
    await renderBudgetWorksheet({ cascade: false });

    fireEvent.change(budgetInput("sub-2"), { target: { value: "20000" } });
    fireEvent.blur(budgetInput("sub-2"));

    expect(Route.fullPath).toBe("/backoffice/proposals/new");
    expect(budgetInput("sub-1").value).toBe("$10,000");
    expect(budgetInput("sub-2").value).toBe("$20,000");
    expect(budgetInput("sub-3").value).toBe("$50,000");
    expect(budgetInput("sub-4").value).toBe("$10,000");
  });

  test("fixes the edited value and balances only downstream Sub-milestones when Cascade is on", async () => {
    await renderBudgetWorksheet({ cascade: true });

    fireEvent.change(budgetInput("sub-2"), { target: { value: "20000" } });
    fireEvent.blur(budgetInput("sub-2"));

    expect(budgetInput("sub-1").value).toBe("$10,000");
    expect(budgetInput("sub-2").value).toBe("$20,000");
    expect(budgetInput("sub-3").value).toBe("$58,333.33");
    expect(budgetInput("sub-4").value).toBe("$11,666.67");
    expect(screen.queryByTestId("timeline-setup-error")).toBeNull();
  });

  test("rejects an edit that downstream Sub-milestones cannot safely absorb", async () => {
    await renderBudgetWorksheet({ cascade: true });

    fireEvent.change(budgetInput("sub-2"), { target: { value: "100000" } });
    fireEvent.blur(budgetInput("sub-2"));

    expect(budgetInput("sub-1").value).toBe("$10,000");
    expect(budgetInput("sub-2").value).toBe("$30,000");
    expect(budgetInput("sub-3").value).toBe("$50,000");
    expect(budgetInput("sub-4").value).toBe("$10,000");
    expect(screen.getByRole("alert").textContent).toContain(
      "downstream allocations have only $60,000 available"
    );
  });
});
