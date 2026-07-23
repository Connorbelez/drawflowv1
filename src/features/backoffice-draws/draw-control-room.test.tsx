// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a href="/" {...props}>
      {children}
    </a>
  ),
}));
import type { BrokerageDrawsResult } from "./draw-types.ts";
import { DrawControlRoom } from "./draw-control-room.tsx";

const emptyDraws = {
  builds: [],
  chartSeries: [],
  draws: [],
  exposureSnapshot: [],
  summary: {
    approved: 0,
    exposureApprovedCents: 0,
    exposureRequestedCents: 0,
    planned: 0,
    rejected: 0,
    released: 0,
    releasedCents: 0,
    requested: 0,
    total: 0,
    upcomingPlannedCents: 0,
  },
} as unknown as BrokerageDrawsResult;

describe("DrawControlRoom", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("contains chart tracks on narrow viewports", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<DrawControlRoom data={emptyDraws} pending={false} />);

    const title = screen.getByRole("heading", {
      name: "Scheduled draw pipeline",
    });
    const chartColumn = title.parentElement?.parentElement;
    const chartPanel = chartColumn?.parentElement;

    expect(chartColumn?.className).toContain("min-w-0");
    expect(chartPanel?.className).toContain("min-w-0");
    expect(chartPanel?.className).toContain("overflow-hidden");
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("nativeButton");
  });

  test("switches between grouped and table views", () => {
    render(<DrawControlRoom data={emptyDraws} pending={false} />);

    const grouped = screen.getByRole("button", { name: "By build" });
    const table = screen.getByRole("button", { name: "All draws" });
    expect(table.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(grouped);

    expect(grouped.getAttribute("aria-pressed")).toBe("true");
    expect(table.getAttribute("aria-pressed")).toBe("false");
  });
});
