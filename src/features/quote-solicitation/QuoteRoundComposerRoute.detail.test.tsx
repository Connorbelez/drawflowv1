// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const routeMock = vi.hoisted(() => ({
  comparisonProps: vi.fn(),
  navigate: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => routeMock.navigate,
}));

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useQuery: (...args: unknown[]) => routeMock.query(...args),
}));

vi.mock("./QuoteRoundComparisonSurface.tsx", () => ({
  QuoteRoundComparisonSurface: (props: Record<string, unknown>) => {
    routeMock.comparisonProps(props);
    return (
      <button onClick={props.onExit as () => void} type="button">
        Exit comparison
      </button>
    );
  },
}));

vi.mock("./QuoteRoundComposer.tsx", () => ({
  QuoteRoundComposer: () => <div data-testid="quote-round-composer" />,
}));

import { QuoteRoundComposerRoute } from "./QuoteRoundComposerRoute.tsx";

const composerProjection = {
  build: {
    _id: "build-1",
    buildName: "Framing Build",
    location: "101 Framing Way",
    startDate: "2026-08-01",
  },
  eligibleRecipients: [],
  labourSubmilestones: [],
  materialCostItems: [],
  permit: null,
  responseTemplates: [],
};

const openRound = {
  _id: "round-1",
  draft: null,
  mode: "combined",
  packageRevision: { revision: 3 },
  revision: 4,
  state: "open",
  title: "Framing bid",
};

beforeEach(() => {
  routeMock.comparisonProps.mockReset();
  routeMock.navigate.mockReset();
  routeMock.query.mockReset();
  routeMock.query
    .mockReturnValueOnce(composerProjection)
    .mockReturnValueOnce(openRound);
});

afterEach(() => cleanup());

describe("QuoteRoundComposerRoute durable comparison deep link", () => {
  test.each([
    ["Builder", "/builder", "/builder/builds/$buildId"],
    ["Builder Staff", "/builder-staff", "/builder-staff/builds/$buildId"],
    ["Backoffice", "/backoffice", "/backoffice/builds/$buildId"],
  ] as const)(
    "opens an immutable Round Detail for %s and exits to the same Build Quotes tab",
    (_role, routeBase, exitRoute) => {
      render(
        <QuoteRoundComposerRoute
          buildId="build-1"
          organizationId="org-1"
          roundId="round-1"
          routeBase={routeBase}
        />
      );

      expect(screen.queryByTestId("quote-round-composer")).toBeNull();
      expect(routeMock.comparisonProps).toHaveBeenLastCalledWith({
        buildId: "build-1",
        onExit: expect.any(Function),
        organizationId: "org-1",
        quoteRoundId: "round-1",
      });

      fireEvent.click(screen.getByRole("button", { name: "Exit comparison" }));
      expect(routeMock.navigate).toHaveBeenCalledWith({
        params: { buildId: "build-1" },
        search: { tab: "quotes" },
        to: exitRoute,
      });
    }
  );
});
