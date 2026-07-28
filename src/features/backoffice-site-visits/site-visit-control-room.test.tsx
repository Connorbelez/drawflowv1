// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { BrokerageSiteVisitsResult } from "./site-visit-types.ts";
import { SiteVisitControlRoom } from "./site-visit-control-room.tsx";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a href="/" {...props}>
      {children}
    </a>
  ),
}));

const visit = {
  buildDisplayId: "B-001",
  buildId: "build-01",
  buildName: "QA Build",
  builderName: "QA Builder",
  geofenceFlagged: true,
  location: "Toronto, ON",
  milestoneKey: "foundation",
  milestoneName: "Foundation",
  note: "Field review required.",
  operationalStatus: "expired",
  scheduledDateLabel: "Jul 17",
  tokenExpiresAt: Date.now() - 1_000,
  tokenState: "expired",
  url: "/site-visits/token",
  visitId: "visit-01",
};

const data = {
  builds: [
    {
      activeVisitCount: 1,
      buildDisplayId: "B-001",
      buildId: "build-01",
      buildName: "QA Build",
      builderName: "QA Builder",
      location: "Toronto, ON",
      visits: [visit],
    },
  ],
  summary: {
    cancelled: 0,
    complete: 0,
    expired: 1,
    expiringWithin15Min: 0,
    geofenceFlagged: 1,
    inField: 0,
    open: 0,
    total: 1,
  },
  visits: [visit],
} as unknown as BrokerageSiteVisitsResult;

describe("SiteVisitControlRoom", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("keeps row and copy-link actions as sibling controls", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <SiteVisitControlRoom
        data={data}
        onCancelVisit={vi.fn().mockResolvedValue(undefined)}
        pending={false}
      />
    );

    expect(container.querySelector("button button")).toBeNull();
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("nativeButton");
  });

  test("switches between grouped and table views", () => {
    render(
      <SiteVisitControlRoom
        data={data}
        onCancelVisit={vi.fn().mockResolvedValue(undefined)}
        pending={false}
      />
    );

    const grouped = screen.getByRole("button", { name: "By build" });
    const table = screen.getByRole("button", { name: "All visits" });
    expect(grouped.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(table);

    expect(table.getAttribute("aria-pressed")).toBe("true");
    expect(grouped.getAttribute("aria-pressed")).toBe("false");
  });
});
