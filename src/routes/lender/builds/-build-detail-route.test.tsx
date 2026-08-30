// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }));

vi.mock("convex/react", () => ({ useQuery }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    () =>
    (options: Record<string, unknown>) => ({
      ...options,
      useParams: () => ({ buildId: "build_authorized" }),
    }),
}));
vi.mock("#/components/lender-shell.tsx", () => ({
  LenderShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock(
  "#/features/lender-portal/LenderBuildCollaboration.tsx",
  () => ({
    LenderBuildCollaboration: ({ buildId }: { buildId: string }) => (
      <div data-testid="route-lender-collaboration">
        Collaboration · {buildId}
      </div>
    ),
  })
);

import { api } from "../../../../convex/_generated/api";
import type { LenderBuildDetailData } from "../../../features/lender-portal/LenderBuildDetailOverview.tsx";
import { Route } from "./$buildId.tsx";

const canonicalBuildDetail = {
  build: {
    buildId: "build_authorized",
    buildName: "Authorized Build",
    location: "Hamilton, ON",
    startDate: "2026-08-01",
    status: "active",
    timezone: "America/Toronto",
    totalBudgetCents: 30_000_000,
    updatedAt: 1,
  },
  builder: { displayName: "Northstar Builder" },
  draws: [],
  facility: {
    interestAnnualBps: 925,
    interestStartsOn: "funds_released",
    principalCents: 100_000_000,
  },
  funding: {
    approvedMilestoneCents: 0,
    availableCents: 0,
    facilityCents: 100_000_000,
    releasedCents: 0,
    reservedCents: 0,
    unlockedCents: 0,
  },
  milestones: [],
  releasedCents: 0,
  reviewPolicy: { state: "unavailable" },
  reviewSummary: "No current lender review requests.",
} as unknown as LenderBuildDetailData;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/lender/builds/$buildId production route", () => {
  test("queries the authorized canonical boundary and renders promoted Variant C", () => {
    useQuery.mockReturnValue(canonicalBuildDetail);

    const Component = (Route as any).component;
    render(<Component />);

    expect(useQuery).toHaveBeenCalledWith(
      api.lender_portal.getLenderBuildDetail,
      { buildId: "build_authorized" }
    );
    expect(screen.getByTestId("production-lender-build-detail")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Authorized Build" })
    ).toBeTruthy();
    expect(screen.getByTestId("route-lender-collaboration")).toBeTruthy();
  });

  test("renders the authorized Build overview from the supported route entry", () => {
    useQuery.mockReturnValue(canonicalBuildDetail);

    const Component = (Route as any).component;
    render(<Component />);

    expect(screen.getByTestId("production-lender-build-detail")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Authorized Build" })).toBeTruthy();
    expect(useQuery).toHaveBeenCalledWith(
      api.lender_portal.getLenderBuildDetail,
      { buildId: "build_authorized" }
    );
  });
});
