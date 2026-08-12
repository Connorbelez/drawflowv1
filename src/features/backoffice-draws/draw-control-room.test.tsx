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
import type { BrokerageDrawRow, BrokerageDrawsResult } from "./draw-types.ts";
import type { DrawWorkflowCapabilities } from "../draw-workflow/drawWorkflow.ts";
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

const inReviewDraw = {
  amountCents: 125_000,
  buildDisplayId: "BLD-001",
  buildId: "build-01",
  buildName: "Control Room Build",
  builderName: "Builder One",
  drawId: "draw-01",
  drawKey: "draw-01",
  label: "Draw 01",
  location: "Toronto",
  scheduledDateLabel: "Aug 12, 2026",
  status: "in_review",
} as unknown as BrokerageDrawRow;

const inReviewData = {
  ...emptyDraws,
  draws: [inReviewDraw],
  summary: {
    ...emptyDraws.summary,
    requested: 1,
    total: 1,
  },
} as BrokerageDrawsResult;

const adminCapabilities: DrawWorkflowCapabilities = {
  canApprove: false,
  canOpenCanonical: true,
  canOpenReview: true,
  canReject: false,
  canRelease: false,
  canStartReview: false,
  canSubmitForAdmin: false,
};

const operationsCapabilities: DrawWorkflowCapabilities = {
  ...adminCapabilities,
  canSubmitForAdmin: true,
};

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

  test("keeps an in-review admin detail sheet open-only", () => {
    render(
      <DrawControlRoom
        data={inReviewData}
        drawCapabilities={adminCapabilities}
        pending={false}
      />,
    );

    fireEvent.click(screen.getAllByText("Draw 01")[0]);

    expect(
      screen.getByRole("link", { name: "Open build workspace" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Send to admin" }),
    ).toBeNull();
  });

  test("retains the operations recommendation action in the detail sheet", () => {
    render(
      <DrawControlRoom
        data={inReviewData}
        drawCapabilities={operationsCapabilities}
        onAdvanceDraw={vi.fn().mockResolvedValue(undefined)}
        pending={false}
      />,
    );

    fireEvent.click(screen.getAllByText("Draw 01")[0]);

    expect(
      screen.getByRole("button", { name: "Send to admin" }),
    ).toBeTruthy();
  });

  test("does not expose release without a control-room release handler", () => {
    const approvedData = {
      ...inReviewData,
      draws: [{ ...inReviewDraw, status: "approved_for_release" }],
      summary: {
        ...inReviewData.summary,
        approved: 1,
        requested: 0,
      },
    } as BrokerageDrawsResult;

    render(
      <DrawControlRoom
        data={approvedData}
        drawCapabilities={{ ...adminCapabilities, canRelease: true }}
        pending={false}
      />,
    );

    fireEvent.click(screen.getByText("All", { exact: true }));
    fireEvent.click(screen.getAllByText("Draw 01")[0]);

    expect(screen.queryByRole("button", { name: "Release" })).toBeNull();
  });
});
