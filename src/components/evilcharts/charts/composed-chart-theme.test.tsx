// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { ReferenceLineLabel } from "./composed-chart.tsx";

afterEach(cleanup);

describe("EvilComposedChart reference labels", () => {
  test("uses a theme-aware surface and foreground while retaining the marker accent", () => {
    const markerAccent = "oklch(0.67 0.18 275)";

    render(
      <svg aria-label="Chart annotation">
        <ReferenceLineLabel
          fill={markerAccent}
          value={["Foundation", "Ends Day 54"]}
          viewBox={{ height: 100, width: 320, x: 140, y: 40 }}
        />
      </svg>
    );

    const label = screen.getByText("Foundation").closest("text");
    const surface = label?.previousElementSibling;

    expect(surface?.getAttribute("fill")).toBe("var(--popover)");
    expect(surface?.getAttribute("stroke")).toBe(markerAccent);
    expect(label?.getAttribute("fill")).toBe("var(--popover-foreground)");
  });

  test("offsets labels into separate annotation lanes", () => {
    render(
      <svg aria-label="Chart annotation">
        <ReferenceLineLabel
          offsetY={-24}
          value="Milestone starts"
          viewBox={{ height: 100, width: 320, x: 140, y: 80 }}
        />
      </svg>
    );

    expect(
      screen.getByText("Milestone starts").closest("text")?.getAttribute("y")
    ).toBe("46");
  });
});
