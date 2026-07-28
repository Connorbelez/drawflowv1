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
        budgetCents: 70_000_000,
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

  test("shows one selected-milestone list and one scoped creation action", () => {
    render(
      <MaterialPlanningTab
        actions={{ create: vi.fn() }}
        items={[
          {
            _id: "item-1",
            costCents: 8_000_000,
            itemType: "material",
            milestoneKey: "foundation",
            quantity: 1,
            relevantSubmilestoneKeys: [],
            title: "Foundation material package",
          },
        ]}
        milestones={[
          ...milestones,
          {
            budgetCents: 50_000_000,
            key: "framing",
            name: "Framing",
            order: 2,
            submilestones: [],
          },
        ]}
        scopeLabel="Build Proposal"
      />,
    );

    expect(
      screen.getAllByRole("button", { name: "Add cost item to Foundation" }),
    ).toHaveLength(1);
    expect(screen.getByText("Foundation material package")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Framing" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Select milestone"), {
      target: { value: "framing" },
    });

    expect(
      screen.getAllByRole("button", { name: "Add cost item to Framing" }),
    ).toHaveLength(1);
    expect(screen.queryByText("Foundation material package")).toBeNull();
    expect(screen.getByRole("heading", { name: "Framing" })).toBeTruthy();
    expect(
      screen.getByText(
        "No material or equipment entries are attached to Framing.",
      ),
    ).toBeTruthy();
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

    expect(screen.queryByLabelText("Title")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Add cost item to Foundation" }),
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

  test("defaults sub-milestone cost items to log only and submits one budget target", () => {
    const create = vi.fn();
    render(
      <MaterialPlanningTab
        actions={{ create }}
        budgetTreatmentEnabled
        defaultBudgetSubmilestoneKey="forms"
        defaultBudgetTreatment="logOnly"
        items={[]}
        milestones={milestones}
        scopeLabel="Sub-milestone"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add cost item to Foundation" }),
    );

    expect(
      (screen.getByLabelText("Budget treatment") as HTMLSelectElement).value,
    ).toBe("logOnly");
    expect(
      (screen.getByLabelText("Budget sub-milestone") as HTMLSelectElement).value,
    ).toBe("");

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Concrete package" },
    });
    fireEvent.change(screen.getByLabelText("Cost per unit (USD)"), {
      target: { value: "100000" },
    });
    fireEvent.change(screen.getByLabelText("Budget treatment"), {
      target: { value: "maintain" },
    });
    fireEvent.change(screen.getByLabelText("Budget sub-milestone"), {
      target: { value: "forms" },
    });

    const preview = screen.getByRole("region", { name: "Budget impact" });
    expect(preview.textContent).toContain(
      "Forms and pour budgetBefore $700,000After $700,000",
    );
    expect(preview.textContent).toContain(
      "Unallocated sub-milestone balance$600,000",
    );

    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        budgetSubmilestoneKey: "forms",
        budgetTreatment: "maintain",
        costCents: 10_000_000,
      }),
    );
  });

  test("clears the budget target when a scoped item remains log only", () => {
    const create = vi.fn();
    render(
      <MaterialPlanningTab
        actions={{ create }}
        budgetTreatmentEnabled
        defaultBudgetSubmilestoneKey="forms"
        defaultBudgetTreatment="logOnly"
        items={[]}
        milestones={milestones}
        scopeLabel="Sub-milestone"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add cost item to Foundation" }),
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Logged concrete quote" },
    });
    fireEvent.change(screen.getByLabelText("Cost per unit (USD)"), {
      target: { value: "2500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        budgetSubmilestoneKey: null,
        budgetTreatment: "logOnly",
      }),
    );
  });

  test("previews additive sub-milestone and proposal budget changes", () => {
    render(
      <MaterialPlanningTab
        actions={{ create: vi.fn() }}
        budgetImpact={{
          borrowerCoPayBps: 2000,
          proposalBudgetCents: 70_000_000,
        }}
        budgetTreatmentEnabled
        defaultBudgetSubmilestoneKey="forms"
        items={[]}
        milestones={milestones}
        scopeLabel="Sub-milestone"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add cost item to Foundation" }),
    );
    fireEvent.change(screen.getByLabelText("Cost per unit (USD)"), {
      target: { value: "2500" },
    });
    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("Budget treatment"), {
      target: { value: "add" },
    });
    fireEvent.change(screen.getByLabelText("Budget sub-milestone"), {
      target: { value: "forms" },
    });

    const preview = screen.getByRole("region", { name: "Budget impact" });
    expect(preview.textContent).toContain(
      "Forms and pour budgetBefore $700,000After $707,500",
    );
    expect(preview.textContent).toContain(
      "Proposal budgetBefore $700,000After $707,500",
    );
  });

  test("identifies cost and quantity errors independently and recovers without unrelated edits", () => {
    render(
      <MaterialPlanningTab
        actions={{ create: vi.fn() }}
        items={[]}
        milestones={milestones}
        scopeLabel="Build Proposal"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add cost item to Foundation" }),
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Partial pallet" },
    });

    const cost = screen.getByLabelText("Cost per unit (USD)");
    const quantity = screen.getByLabelText("Quantity");
    fireEvent.change(cost, { target: { value: "-5" } });
    fireEvent.change(quantity, { target: { value: "0" } });

    expect(cost.getAttribute("aria-invalid")).toBe("true");
    expect(cost.getAttribute("aria-describedby")).toContain(
      "material-planning-new-costError",
    );
    expect(quantity.getAttribute("aria-invalid")).toBe("true");
    expect(quantity.getAttribute("aria-describedby")).toContain(
      "material-planning-new-quantityError",
    );
    expect(
      screen.getByRole("alert", {
        name: "Cost per unit cannot be negative.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("alert", {
        name: "Quantity must be greater than 0.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Partial quantities such as 0.5 are allowed.")).toBeTruthy();

    const addItem = screen.getByRole("button", { name: "Add item" });
    expect(addItem.hasAttribute("disabled")).toBe(true);
    expect(addItem.getAttribute("aria-describedby")).toContain(
      "material-planning-new-submitGuidance",
    );
    expect(
      screen.getByText(
        "Add item is unavailable because Cost per unit cannot be negative and Quantity must be greater than zero.",
      ),
    ).toBeTruthy();

    fireEvent.change(cost, { target: { value: "0" } });
    expect(cost.hasAttribute("aria-invalid")).toBe(false);
    expect(
      screen.queryByText("Cost per unit cannot be negative."),
    ).toBeNull();
    expect(quantity.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(quantity, { target: { value: "0.5" } });
    expect(quantity.hasAttribute("aria-invalid")).toBe(false);
    expect(screen.queryByText("Quantity must be greater than 0.")).toBeNull();
    expect(addItem.hasAttribute("disabled")).toBe(false);
  });

  test("previews selected milestone, proposal, and draw impact before creating an item", () => {
    render(
      <MaterialPlanningTab
        actions={{ create: vi.fn() }}
        budgetImpact={{
          borrowerCoPayBps: 2000,
          proposalBudgetCents: 70_000_000,
        }}
        items={[]}
        milestones={milestones}
        scopeLabel="Build Proposal"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add cost item to Foundation" }),
    );
    fireEvent.change(screen.getByLabelText("Cost per unit (USD)"), {
      target: { value: "2500" },
    });
    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "3" },
    });

    const preview = screen.getByRole("region", { name: "Budget impact" });
    expect(preview.textContent).toContain("Item total$7,500");
    expect(preview.textContent).toContain(
      "Foundation budgetBefore $700,000After $707,500",
    );
    expect(preview.textContent).toContain(
      "Proposal budgetBefore $700,000After $707,500",
    );
    expect(preview.textContent).toContain(
      "Foundation draw availabilityBefore $560,000After $566,000",
    );
  });

  test("previews the full destination milestone increase when moving an additive item", () => {
    render(
      <MaterialPlanningTab
        actions={{ update: vi.fn() }}
        budgetImpact={{
          borrowerCoPayBps: 2000,
          proposalBudgetCents: 120_000_000,
        }}
        budgetTreatmentEnabled
        items={[
          {
            _id: "item-1",
            budgetSubmilestoneKey: "forms",
            budgetTreatment: "add",
            costCents: 8_000_000,
            itemType: "material",
            milestoneKey: "foundation",
            quantity: 1,
            relevantSubmilestoneKeys: ["forms"],
            title: "Concrete package",
          },
        ]}
        milestones={[
          ...milestones,
          {
            budgetCents: 50_000_000,
            key: "framing",
            name: "Framing",
            order: 2,
            submilestones: [
              {
                budgetCents: 50_000_000,
                key: "rough-framing",
                milestoneKey: "framing",
                name: "Rough framing",
                order: 1,
              },
            ],
          },
        ]}
        scopeLabel="Build Proposal"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Milestone"), {
      target: { value: "framing" },
    });
    fireEvent.change(screen.getByLabelText("Budget sub-milestone"), {
      target: { value: "rough-framing" },
    });

    const preview = screen.getByRole("region", { name: "Budget impact" });
    expect(preview.textContent).toContain(
      "Framing draw availabilityBefore $400,000After $464,000",
    );
    expect(preview.textContent).toContain(
      "Proposal budgetBefore $1,200,000After $1,200,000",
    );
  });

  test("opens the edit form in a sheet from an existing material card", () => {
    const update = vi.fn();
    render(
      <MaterialPlanningTab
        actions={{ update }}
        items={[
          {
            _id: "item-1",
            costCents: 8_000_000,
            itemType: "equipment",
            milestoneKey: "foundation",
            quantity: 1,
            relevantSubmilestoneKeys: [],
            supplier: "Rental Desk",
            title: "Pump rental",
          },
        ]}
        milestones={milestones}
        scopeLabel="Build Proposal"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Edit cost item" })).toBeTruthy();
    expect(screen.getByLabelText("Title").getAttribute("value")).toBe(
      "Pump rental",
    );

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Concrete pump rental" },
    });
    fireEvent.change(screen.getByLabelText("Change reason"), {
      target: { value: "Supplier quote updated." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Pump rental" }),
      expect.objectContaining({
        reason: "Supplier quote updated.",
        title: "Concrete pump rental",
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

  test("submits a cost item with no cost as a zero-value logged line", () => {
    const create = vi.fn();
    render(
      <MaterialPlanningTab
        actions={{ create }}
        budgetTreatmentEnabled
        defaultBudgetTreatment="logOnly"
        items={[]}
        milestones={milestones}
        scopeLabel="Build Proposal"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add cost item to Foundation" }),
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "TBD concrete allowance" },
    });
    // Cost is intentionally left blank. Quantity still required.
    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "1" },
    });

    const addItem = screen.getByRole("button", { name: "Add item" });
    expect(addItem.hasAttribute("disabled")).toBe(false);

    fireEvent.click(addItem);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        costCents: 0,
        budgetTreatment: "logOnly",
        title: "TBD concrete allowance",
      }),
    );
  });

  test("locks the budget treatment selectors on the active build surface", () => {
    render(
      <MaterialPlanningTab
        actions={{ create: vi.fn(), update: vi.fn() }}
        budgetTreatmentEnabled
        items={[
          {
            _id: "item-1",
            budgetSubmilestoneKey: "forms",
            budgetTreatment: "add",
            costCents: 8_000_000,
            itemType: "material",
            milestoneKey: "foundation",
            quantity: 1,
            relevantSubmilestoneKeys: ["forms"],
            title: "Concrete package",
          },
        ]}
        lockBudgetTreatment
        milestones={milestones}
        scopeLabel="Active Build"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const treatment = screen.getByLabelText("Budget treatment");
    const target = screen.getByLabelText("Budget sub-milestone");
    expect(treatment.hasAttribute("disabled")).toBe(true);
    expect(target.hasAttribute("disabled")).toBe(true);
    expect((treatment as HTMLSelectElement).value).toBe("add");
    expect((target as HTMLSelectElement).value).toBe("forms");
    expect(
      screen.getByText(
        "Budget treatment is locked after proposal closing. Cost and quantity remain editable.",
      ),
    ).toBeTruthy();
  });

  test("allows editing cost and quantity while budget treatment is locked", () => {
    render(
      <MaterialPlanningTab
        actions={{ update: vi.fn() }}
        budgetTreatmentEnabled
        items={[
          {
            _id: "item-1",
            budgetSubmilestoneKey: "forms",
            budgetTreatment: "add",
            costCents: 8_000_000,
            itemType: "material",
            milestoneKey: "foundation",
            quantity: 1,
            relevantSubmilestoneKeys: ["forms"],
            title: "Concrete package",
          },
        ]}
        lockBudgetTreatment
        milestones={milestones}
        scopeLabel="Active Build"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const cost = screen.getByLabelText("Cost per unit (USD)");
    const quantity = screen.getByLabelText("Quantity");
    const treatment = screen.getByLabelText("Budget treatment");
    expect(cost.hasAttribute("disabled")).toBe(false);
    expect(quantity.hasAttribute("disabled")).toBe(false);
    expect(treatment.hasAttribute("disabled")).toBe(true);
  });
});
