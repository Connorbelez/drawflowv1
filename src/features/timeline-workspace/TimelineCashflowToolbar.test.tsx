// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { TimelineCashflowToolbar } from "./TimelineCashflowToolbar.tsx";

afterEach(() => cleanup());

describe("TimelineCashflowToolbar", () => {
  test("renders flat metrics and discloses every cash warning", async () => {
    render(
      <TimelineCashflowToolbar
        metrics={[
          {
            label: "Ending cash",
            testId: "timeline-cashflow-ending-cash",
            value: "$250,000",
          },
          {
            label: "Available",
            testId: "timeline-cashflow-available-to-draw",
            tone: "positive",
            value: "$0",
          },
        ]}
        warnings={Array.from({ length: 6 }, (_, index) => ({
          dayLabel: `Day ${65 + index}`,
          id: `warning-${index}`,
          message: `needs $${(index + 1) * 10_000} before milestone ${index + 1}`,
        }))}
      />
    );

    expect(screen.getByTestId("timeline-cashflow-toolbar").tagName).toBe(
      "SECTION"
    );
    expect(screen.getByTestId("timeline-cashflow-ending-cash").textContent).toBe(
      "$250,000"
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Cash risk: 6 issues. Show issues",
      })
    );

    expect(
      await screen.findByTestId("timeline-cashflow-warning-menu")
    ).toBeTruthy();
    expect(screen.getAllByTestId("timeline-cash-shortfall-point")).toHaveLength(
      6
    );
    expect(screen.getByText("Day 70")).toBeTruthy();
  });

  test("shows an inline clear state when there are no cash warnings", () => {
    render(
      <TimelineCashflowToolbar
        metrics={[]}
        warnings={[]}
      />
    );

    expect(screen.getByTestId("timeline-cashflow-risk-summary").textContent).toBe(
      "Cash risk · Clear"
    );
    expect(screen.queryByRole("button", { name: /Cash risk/ })).toBeNull();
  });
});
