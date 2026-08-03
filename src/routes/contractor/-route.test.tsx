// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const { accessQuery, navigate, routeState } = vi.hoisted(() => ({
  accessQuery: vi.fn(),
  navigate: vi.fn().mockResolvedValue(undefined),
  routeState: { pathname: "/contractor" },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  Outlet: () => <div data-testid="contractor-outlet" />,
  useLocation: () => ({ pathname: routeState.pathname }),
  useNavigate: () => navigate,
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => accessQuery(...args),
}));

vi.mock("#/components/app-shell.tsx", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="contractor-shell">{children}</div>
  ),
}));

vi.mock("#/features/contractor/contractorNav.tsx", () => ({
  contractorNavGroups: [],
  footerNavLinks: [],
}));

vi.mock("#/lib/auth/rbac.ts", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

import { Route } from "./route";

describe("Contractor workspace profile-link gate", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    routeState.pathname = "/contractor";
  });

  test("redirects an unlinked Contractor once before protected child queries mount", () => {
    accessQuery.mockReturnValue({ profileLinked: false });

    renderRoute();

    expect(screen.getByTestId("profile-link-redirect")).toBeTruthy();
    expect(screen.queryByTestId("contractor-outlet")).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        replace: true,
        search: {
          reason: "profile-link-required",
          workspace: "contractor",
        },
        to: "/protected-access",
      })
    );
  });

  test("mounts protected children only after the canonical profile is linked", () => {
    accessQuery.mockReturnValue({ profileLinked: true });

    renderRoute();

    expect(screen.getByTestId("contractor-outlet")).toBeTruthy();
    expect(screen.queryByTestId("profile-link-redirect")).toBeNull();
  });

  test("keeps the unlinked onboarding bridge reachable", () => {
    routeState.pathname = "/contractor/onboarding";
    accessQuery.mockReturnValue(undefined);

    renderRoute();

    expect(screen.getByTestId("contractor-outlet")).toBeTruthy();
    expect(accessQuery).not.toHaveBeenCalled();
  });
});

function renderRoute() {
  const Component = (Route as unknown as { component: React.ComponentType })
    .component;
  return render(<Component />);
}
