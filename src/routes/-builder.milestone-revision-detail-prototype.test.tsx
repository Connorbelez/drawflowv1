// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BuilderMilestoneRevisionPrototype } from "./builder.milestone-revision-detail-prototype.tsx";

afterEach(cleanup);

describe("Builder Milestone revision detail prototype", () => {
  for (const variant of ["A", "B", "C"] as const) {
    it(`renders Builder-safe integrated Variant ${variant}`, async () => {
      render(<BuilderMilestoneRevisionPrototype variant={variant} />);

      expect(
        screen.getByRole("heading", { name: "Framing and roof dry-in" })
      ).toBeTruthy();
      expect(screen.getByLabelText("Status: Needs revision")).toBeTruthy();
      expect(
        screen.getAllByText(/Documented receipts and invoices total \$144,800/)
          .length
      ).toBeGreaterThan(1);
      expect(screen.getAllByText("Decision cycle 2").length).toBeGreaterThan(0);
      expect(screen.getByText("Completion submission")).toBeTruthy();
      expect(screen.getByText("Required Site Visit complete")).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Overview" })).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Evidence" })).toBeTruthy();
      expect(
        screen.getByRole("tab", { name: "Receipts / invoices" })
      ).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Collaboration" })).toBeTruthy();
      expect(
        await screen.findByTestId("prototype-milestone-resubmit")
      ).toBeTruthy();
      expect(
        screen.getByText("Resubmission blocked by a $3,200.00 evidence gap")
      ).toBeTruthy();

      for (const text of [
        "Approve milestone",
        "Reject milestone",
        "Release Draw",
        "Lender reviewer",
        "Private decision reason",
        "Gantt",
        "Contractors",
      ]) {
        expect(screen.queryByText(text)).toBeNull();
      }
    });
  }

  it("preserves cycle history after local resubmission", () => {
    render(
      <BuilderMilestoneRevisionPrototype
        initialAttached
        initialCycle={3}
        initialState="pending"
        variant="A"
      />
    );

    expect(screen.getByText("Decision cycle 1")).toBeTruthy();
    expect(screen.getAllByText("Decision cycle 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Decision cycle 3").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Status: Pending review")).toBeTruthy();
    expect(screen.getByText(/every required approval reset/)).toBeTruthy();
    expect(screen.queryByText(/Decision cycle 4/)).toBeNull();
  });

  it("repairs evidence and resubmits the same Milestone locally", async () => {
    render(<BuilderMilestoneRevisionPrototype variant="A" />);

    const resubmit = await screen.findByTestId(
      "prototype-milestone-resubmit"
    );
    expect(resubmit.hasAttribute("disabled")).toBe(true);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Use representative evidence without a file",
      })
    );
    expect(resubmit.hasAttribute("disabled")).toBe(false);

    fireEvent.click(resubmit);
    expect(screen.getByLabelText("Status: Pending review")).toBeTruthy();
    expect(screen.getAllByText("Decision cycle 3").length).toBeGreaterThan(0);
    expect(
      screen
        .getByTestId("prototype-milestone-resubmit")
        .hasAttribute("disabled")
    ).toBe(true);
  });

  it("derives the next decision cycle from an arbitrary current cycle", async () => {
    render(
      <BuilderMilestoneRevisionPrototype
        initialCycle={5}
        variant="A"
      />
    );

    expect(screen.getAllByText("Decision cycle 5").length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Use representative evidence without a file",
      })
    );
    fireEvent.click(
      await screen.findByTestId("prototype-milestone-resubmit")
    );

    expect(screen.getAllByText("Decision cycle 6").length).toBeGreaterThan(0);
    expect(screen.queryByText("Decision cycle 3")).toBeNull();
  });

  it("does not announce false eligibility after the entered cost changes", async () => {
    render(<BuilderMilestoneRevisionPrototype variant="A" />);

    fireEvent.change(
      document.getElementById(
        "prototype-milestone-actual-cost"
      ) as HTMLInputElement,
      { target: { value: "150000" } }
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Use representative evidence without a file",
      })
    );

    expect(
      screen.getByText(
        "Representative invoice added. The documented total still does not equal the entered actual cost."
      )
    ).toBeTruthy();
    expect(
      (await screen.findByTestId("prototype-milestone-resubmit")).hasAttribute(
        "disabled"
      )
    ).toBe(true);
  });
});
