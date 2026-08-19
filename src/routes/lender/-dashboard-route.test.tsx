// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }));

vi.mock("convex/react", () => ({ useQuery }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useSearch: () => ({ variant: "D" }),
  }),
  Link: ({
    children,
    params: _params,
    preload: _preload,
    search: _search,
    to,
    viewTransition: _viewTransition,
    ...props
  }: {
    children: ReactNode;
    params?: unknown;
    preload?: unknown;
    search?: unknown;
    to: string;
    viewTransition?: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));
vi.mock("#/components/lender-shell.tsx", () => ({
  LenderShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { api } from "../../../convex/_generated/api";
import { Route } from "./index";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/lender production Dashboard", () => {
  test("renders every Review requirement beyond the former three-row cap", () => {
    const actionTitles = [
      "Proposal review one",
      "Milestone review two",
      "Draw review three",
      "Draw review four",
    ];
    useQuery
      .mockReturnValueOnce({ organization: { _id: "lender_org" } })
      .mockReturnValueOnce({
        actions: actionTitles.map((title, index) => ({
          actionId: `draw:${index + 1}`,
          buildId: `build_${index + 1}`,
          fact: "Lender approval required",
          meta: "Draw request in review",
          title,
          type: index === 0 ? "Proposal" : index === 1 ? "Milestone" : "Draw",
          updatedAt: 1_000 - index,
        })),
        builds: [],
        stats: {
          activeBuildCount: 0,
          assignedProposalCount: 4,
          drawCount: 7,
          milestoneCount: 12,
          releasedCents: 0,
          totalFacilityCents: 0,
        },
        updatedAt: 1_000,
      });

    const Component = (Route as any).component;
    render(<Component />);

    expect(useQuery).toHaveBeenNthCalledWith(
      1,
      api.lenderOrganizations.getCurrentLenderOrganization,
      {},
    );
    expect(useQuery).toHaveBeenNthCalledWith(
      2,
      api.lender_portal.getLenderDashboard,
      {},
    );

    expect(
      screen.getByRole("heading", { name: "Review requirements" }),
    ).toBeTruthy();
    expect(screen.getByText("12 Milestones")).toBeTruthy();
    expect(screen.getByText("7 Draws")).toBeTruthy();
    for (const title of actionTitles) {
      expect(screen.getAllByText(title)).toHaveLength(2);
    }
    expect(
      screen.getAllByRole("link", { name: "Open draw Draw review four" }),
    ).toHaveLength(2);
  });

  test("imports the production-owned Dashboard instead of the prototype route", () => {
    const routeSource = readFileSync("src/routes/lender/index.tsx", "utf8");

    expect(routeSource).toContain(
      "#/features/lender-dashboard/LenderDashboardVariantD.tsx",
    );
    expect(routeSource).not.toContain("lender.prototype");
  });

  test("does not request portfolio data without an assigned lender organization", () => {
    useQuery
      .mockReturnValueOnce({ organization: null })
      .mockReturnValueOnce(undefined);

    const Component = (Route as any).component;
    render(<Component />);

    expect(useQuery).toHaveBeenNthCalledWith(
      2,
      api.lender_portal.getLenderDashboard,
      "skip",
    );
    expect(
      screen.getByRole("heading", {
        name: "Your assigned portfolio is still being arranged.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", {
        name: "Contact DrawFlow admin about lender organization access",
      }),
    ).toBeTruthy();
  });

  test("keeps an assigned lender in loading state until Dashboard data is defined", () => {
    useQuery
      .mockReturnValueOnce({ organization: { _id: "lender_org" } })
      .mockReturnValueOnce(undefined);

    const Component = (Route as any).component;
    render(<Component />);

    expect(useQuery).toHaveBeenNthCalledWith(
      2,
      api.lender_portal.getLenderDashboard,
      {},
    );
    expect(screen.getByText("Loading assigned portfolio…")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Assigned portfolio" }),
    ).toBeNull();
  });
});
