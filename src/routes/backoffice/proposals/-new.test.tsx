// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    () =>
    (options: Record<string, unknown>) => ({
      options,
      useRouteContext: () => ({ organizationId: "org-browser-comment" }),
    }),
  useNavigate: () => routeMocks.navigate,
}));

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useQuery: () => undefined,
}));

vi.mock(
  "#/features/production-proposals/visualParityFixtures.ts",
  () => ({
    getVisualParityCreateContext: () => ({
      availableContractors: [],
      brokers: [
        {
          email: "principal@example.test",
          isPrincipal: true,
          name: "Principal broker",
          workosUserId: "user_principal",
        },
      ],
      defaultAssignedBrokerWorkosUserId: "user_principal",
      templates: [],
    }),
    isProductionVisualParityFixtureEnabled: () => true,
  }),
);

import { Route } from "./new";

const NewProposalRoute = Route.options.component as ComponentType;

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("/backoffice/proposals/new", () => {
  test("reaches project setup and advances through its production continuation action", () => {
    render(<NewProposalRoute />);

    expect(screen.getByText("Step 1 of 4 - Project Setup")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("Enter Canadian project address"),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Continue to milestone budget",
      }),
    );

    expect(screen.getByText("Step 2 of 4 - Milestones & Budget")).toBeTruthy();
  });
});
