// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useRouteContext: vi.fn(),
  useSearch: vi.fn(),
}));

const proposalClaimMocks = vi.hoisted(() => ({
  takeProposalClaimReturnPath: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () =>
    (config: unknown) => ({
      options: config,
      useRouteContext: routerMocks.useRouteContext,
      useSearch: routerMocks.useSearch,
    }),
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => routerMocks.navigate,
}));

vi.mock("#/components/ui/frame.tsx", () => ({
  Frame: ({ children, ...props }: { children: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  FrameDescription: ({ children, ...props }: { children: ReactNode }) => (
    <p {...props}>{children}</p>
  ),
  FramePanel: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  FrameTitle: ({ children, ...props }: { children: ReactNode }) => (
    <h1 {...props}>{children}</h1>
  ),
}));

vi.mock("#/lib/proposal-claim-return.ts", () => ({
  takeProposalClaimReturnPath: proposalClaimMocks.takeProposalClaimReturnPath,
}));

import { Route } from "./protected-access.tsx";

const ProtectedAccessRoute = Route.options.component as ComponentType;

beforeEach(() => {
  routerMocks.navigate.mockReset();
  routerMocks.useRouteContext.mockReset();
  routerMocks.useRouteContext.mockReturnValue(undefined);
  routerMocks.useSearch.mockReturnValue({
    reason: "no-workspace-access",
    workspace: "backoffice",
  });
  proposalClaimMocks.takeProposalClaimReturnPath.mockReset();
  proposalClaimMocks.takeProposalClaimReturnPath.mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("protected access route", () => {
  test("normalizes unknown search params to the safest protected-access defaults", () => {
    const validateSearch = Route.options.validateSearch as (
      search: Record<string, unknown>
    ) => { reason: string; workspace: string };

    expect(validateSearch({ reason: "mystery", workspace: "elsewhere" })).toEqual({
      reason: "no-workspace-access",
      workspace: "backoffice",
    });
  });

  test("preserves the intended return path when the active organization is missing", async () => {
    routerMocks.useSearch.mockReturnValue({
      reason: "missing-organization",
      workspace: "builder",
    });
    proposalClaimMocks.takeProposalClaimReturnPath.mockReturnValue(
      "/builder/proposals/proposal_123",
    );

    render(<ProtectedAccessRoute />);

    await waitFor(() =>
      expect(routerMocks.navigate).toHaveBeenCalledWith({
        replace: true,
        to: "/builder/proposals/proposal_123",
      }),
    );
  });

  test("renders a dedicated typed recovery state when a contractor profile link is missing", () => {
    routerMocks.useSearch.mockReturnValue({
      reason: "profile-link-required",
      workspace: "contractor",
    });

    const markup = renderToStaticMarkup(<ProtectedAccessRoute />);

    expect(markup).toContain("Profile link required");
    expect(markup).toContain("linked contractor profile");
    expect(markup).not.toContain("Workspace access required");
  });
});
