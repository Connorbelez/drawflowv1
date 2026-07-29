// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { ChartContainer } from "./chart.tsx";
import { ChartTooltipContent } from "./tooltip.tsx";

afterEach(cleanup);

describe("ChartTooltipContent theme surfaces", () => {
  test("uses semantic popover tokens for the frosted tooltip", () => {
    render(
      <ChartContainer
        config={{
          cashOnHand: {
            label: "Cash on hand",
            colors: { light: ["oklch(0.58 0.2 25)"] },
          },
        }}
      >
        <ChartTooltipContent
          active
          label="Day 80"
          payload={[
            {
              color: "oklch(0.58 0.2 25)",
              dataKey: "cashOnHand",
              name: "cashOnHand",
              payload: { cashOnHand: 199_525 },
              type: "line",
              value: 199_525,
            },
          ]}
          variant="frosted-glass"
        />
      </ChartContainer>
    );

    const tooltip = screen.getByText("Day 80").parentElement;

    expect(tooltip?.className).toContain("bg-popover/90");
    expect(tooltip?.className).toContain("text-popover-foreground");
    expect(tooltip?.className).toContain("border-border");
    expect(screen.getByText("199,525").className).toContain(
      "text-popover-foreground"
    );
  });
});
