// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

let routeContext: { organizationId?: unknown } = {
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
  () => ({
    normalizeQuoteRoundOrganizationId: (value: unknown) =>
      typeof value === "string" && value.trim() ? value.trim() : undefined,
    QuoteRoundComposerRoute: (props: Record<string, unknown>) => {
      composerRouteProps(props);
      return <div data-testid="quote-round-composer-route" />;
    },
  })
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

const builderRoute = BuilderQuoteRoute as QuoteRouteModule;
const builderStaffRoute = BuilderStaffQuoteRoute as QuoteRouteModule;
const backofficeRoute = BackofficeQuoteRoute as QuoteRouteModule;

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
      roundId: "quote-round-7",
      routeBase: "/builder",
    });
  });
});
