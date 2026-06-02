// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { MaterialPlanningTab } from "./MaterialPlanningTab";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const milestones = [
  {
    budgetCents: 70_000_000,
    key: "foundation",
    name: "Foundation",
    order: 1,
    submilestones: [
      {
        key: "forms",
        milestoneKey: "foundation",
        name: "Forms and pour",
        order: 1,
      },
    ],
  },
];

describe("MaterialPlanningTab", () => {
  test("renders material attributes with attached milestone and sub-milestones", () => {
    render(
      <MaterialPlanningTab
        items={[
          {
            _id: "item-1",
            costCents: 8_000_000,
            description: "Concrete and rebar package.",
            itemType: "material",
            milestoneKey: "foundation",
            quantity: 2.5,
            relevantSubmilestoneKeys: ["forms"],
            supplier: "Apex Supply",
            title: "Foundation material package",
          },
        ]}
        milestones={milestones}
        readOnly
        scopeLabel="Build Proposal"
      />,
    );

    expect(screen.getByTestId("material-planning-tab")).toBeTruthy();
    expect(screen.getByText("Foundation material package")).toBeTruthy();
    expect(screen.getByText("Apex Supply")).toBeTruthy();
    expect(screen.getAllByText("Forms and pour").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$200,000").length).toBeGreaterThan(0);
    expect(screen.getByText("$80,000 x 2.5")).toBeTruthy();
  });

  test("renders rich description images in material item previews", () => {
    render(
      <MaterialPlanningTab
        items={[
          {
            _id: "item-1",
            costCents: 8_000_000,
            description:
              '<p>Concrete and rebar package.</p><img src="data:image/png;base64,abc" alt="site detail" />',
            itemType: "material",
            milestoneKey: "foundation",
            quantity: 1,
            relevantSubmilestoneKeys: [],
            title: "Foundation material package",
          },
        ]}
        milestones={milestones}
        readOnly
        scopeLabel="Build Proposal"
      />,
    );

    expect(screen.getByAltText("site detail").getAttribute("src")).toBe(
      "data:image/png;base64,abc",
    );
  });

  test("submits a cost item payload without creating a submilestone", () => {
    const create = vi.fn();
    render(
      <MaterialPlanningTab
        actions={{ create }}
        items={[]}
        milestones={milestones}
        scopeLabel="Build Proposal"
      />,
    );

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Pump rental" },
    });
    fireEvent.change(screen.getByLabelText("Cost per unit (USD)"), {
      target: { value: "2500" },
    });
    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("Supplier"), {
      target: { value: "Rental Desk" },
    });
    fireEvent.click(screen.getByText("Add item"));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        costCents: 250_000,
        itemType: "material",
        milestoneKey: "foundation",
        quantity: 3,
        relevantSubmilestoneKeys: [],
        supplier: "Rental Desk",
        title: "Pump rental",
      }),
    );
  });

  test("collects an inline removal reason instead of using a browser prompt", () => {
    const remove = vi.fn();
    render(
      <MaterialPlanningTab
        actions={{ delete: remove }}
        items={[
          {
            _id: "item-1",
            costCents: 8_000_000,
            itemType: "equipment",
            milestoneKey: "foundation",
            quantity: 1,
            relevantSubmilestoneKeys: [],
            title: "Pump rental",
          },
        ]}
        milestones={milestones}
        scopeLabel="Build Proposal"
      />,
    );

    fireEvent.click(screen.getByText("Delete"));
    fireEvent.change(screen.getByLabelText("Removal reason"), {
      target: { value: "Rental moved into contractor scope." },
    });
    fireEvent.click(screen.getByText("Remove item"));

    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Pump rental" }),
      "Rental moved into contractor scope.",
    );
  });
});
