// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

let routeContext: {
  organizationId?: unknown;
  role?: string | null;
  roles?: string[];
} = {
  organizationId: "org-quote-rounds",
};
const routeParams = { buildId: "build-quote-rounds" };
const routeSearch = { roundId: "quote-round-7" };
const composerRouteProps = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () =>
    (config: {
      component: () => ReactElement;
      validateSearch: (search: Record<string, unknown>) => unknown;
    }) => ({
      ...config,
      useParams: () => routeParams,
      useRouteContext: () => routeContext,
      useSearch: () => routeSearch,
    }),
}));

vi.mock(
  "#/features/quote-solicitation/QuoteRoundComposerRoute.tsx",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("#/features/quote-solicitation/QuoteRoundComposerRoute.tsx")
    >();
    return {
      ...actual,
      QuoteRoundComposerRoute: (props: Record<string, unknown>) => {
        composerRouteProps(props);
        return <div data-testid="quote-round-composer-route" />;
      },
    };
  }
);

import { Route as BuilderQuoteRoute } from "./new.tsx";
import { Route as BuilderStaffQuoteRoute } from "#/routes/builder-staff/builds/$buildId/quotes/new.tsx";
import { Route as BackofficeQuoteRoute } from "#/routes/backoffice/builds/$buildId/quotes/new.tsx";

interface QuoteRouteModule {
  component: () => ReactElement;
  validateSearch: (search: Record<string, unknown>) => {
    roundId?: string;
  };
}

const builderRoute = BuilderQuoteRoute as unknown as QuoteRouteModule;
const builderStaffRoute = BuilderStaffQuoteRoute as unknown as QuoteRouteModule;
const backofficeRoute = BackofficeQuoteRoute as unknown as QuoteRouteModule;

afterEach(cleanup);

describe("Quote Round composer routes", () => {
  beforeEach(() => {
    composerRouteProps.mockClear();
    routeContext = { organizationId: "org-quote-rounds" };
  });

  test("normalizes a refreshable builder round ID and mounts the canonical builder route", () => {
    expect(builderRoute.validateSearch({ roundId: " quote-round-7 " })).toEqual(
      { roundId: "quote-round-7" }
    );
    expect(builderRoute.validateSearch({ roundId: false })).toEqual({});

    render(<builderRoute.component />);
    expect(screen.getByTestId("quote-round-composer-route")).toBeTruthy();
    expect(composerRouteProps).toHaveBeenLastCalledWith({
      buildId: "build-quote-rounds",
      organizationId: "org-quote-rounds",
      republishCapacity: "builder",
      roundId: "quote-round-7",
      routeBase: "/builder",
    });
  });

  test("mirrors the same admission-scoped composer under the builder-staff route", () => {
    expect(
      builderStaffRoute.validateSearch({ roundId: " quote-round-7 " })
    ).toEqual({ roundId: "quote-round-7" });
    expect(builderStaffRoute.validateSearch({ roundId: "   " })).toEqual({});

    render(<builderStaffRoute.component />);
    expect(screen.getByTestId("quote-round-composer-route")).toBeTruthy();
    expect(composerRouteProps).toHaveBeenLastCalledWith({
      buildId: "build-quote-rounds",
      organizationId: "org-quote-rounds",
      republishCapacity: "builder-staff",
      roundId: "quote-round-7",
      routeBase: "/builder-staff",
    });
  });

  test("mounts the same resumable composer under the backoffice Build route", () => {
    expect(backofficeRoute.validateSearch({ roundId: " quote-round-7 " })).toEqual(
      { roundId: "quote-round-7" }
    );

    render(<backofficeRoute.component />);
    expect(screen.getByTestId("quote-round-composer-route")).toBeTruthy();
    expect(composerRouteProps).toHaveBeenLastCalledWith({
      buildId: "build-quote-rounds",
      organizationId: "org-quote-rounds",
      republishCapacity: undefined,
      roundId: "quote-round-7",
      routeBase: "/backoffice",
    });
  });

  test("passes a missing organization context through as unavailable", () => {
    routeContext = {};

    render(<builderRoute.component />);

    expect(composerRouteProps).toHaveBeenLastCalledWith({
      buildId: "build-quote-rounds",
      organizationId: undefined,
      republishCapacity: "builder",
      roundId: "quote-round-7",
      routeBase: "/builder",
    });
  });

  test.each([
    ["admin", ["admin"], "admin"],
    ["principal-broker", ["principal-broker"], "principle-broker"],
    ["broker-only", ["broker"], undefined],
  ] as const)(
    "maps backoffice %s role to the explicit Quote Round republish capacity",
    (_label, roles, republishCapacity) => {
      routeContext = { organizationId: "org-quote-rounds", roles: [...roles] };

      render(<backofficeRoute.component />);

      expect(composerRouteProps).toHaveBeenLastCalledWith(
        expect.objectContaining({ republishCapacity })
      );
    }
  );
});
