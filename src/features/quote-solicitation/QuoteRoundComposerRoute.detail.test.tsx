// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const routeMock = vi.hoisted(() => ({
  comparisonProps: vi.fn(),
  composerProps: vi.fn(),
  mutation: vi.fn(),
  navigate: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => routeMock.navigate,
}));

vi.mock("convex/react", () => ({
  useMutation: () => routeMock.mutation,
  useQuery: (...args: unknown[]) => routeMock.query(...args),
}));

vi.mock("./QuoteRoundComparisonSurface.tsx", () => ({
  QuoteRoundComparisonSurface: (props: Record<string, unknown>) => {
    routeMock.comparisonProps(props);
    return (
      <div>
        <button onClick={props.onExit as () => void} type="button">
          Exit comparison
        </button>
        <button
          onClick={() =>
            (
              props.onSelectPackageRevision as (
                packageRevisionId: string
              ) => void
            )("package-2")
          }
          type="button"
        >
          Select prior Package Revision
        </button>
        <button
          onClick={() =>
            (
              props.onRepublish as (input: {
                breakGlassConfirmed?: boolean;
                deadlinePolicy: { kind: "keep" };
                reason: string;
              }) => Promise<void>
            )({
              deadlinePolicy: { kind: "keep" },
              reason: "Publish effective Scope.",
            })
          }
          type="button"
        >
          Republish Scope
        </button>
        <button
          onClick={() =>
            (
              props.onRepublish as (input: {
                breakGlassConfirmed: boolean;
                deadlinePolicy: { kind: "keep" };
                reason: string;
              }) => Promise<void>
            )({
              breakGlassConfirmed: true,
              deadlinePolicy: { kind: "keep" },
              reason: "Publish effective Scope.",
            })
          }
          type="button"
        >
          Republish Scope with break-glass
        </button>
        <button
          onClick={() =>
            (
              props.onRepublish as (input: {
                breakGlassConfirmed: boolean;
                deadlinePolicy: { kind: "keep" };
                reason: string;
              }) => Promise<void>
            )({
              breakGlassConfirmed: false,
              deadlinePolicy: { kind: "keep" },
              reason: "Publish effective Scope.",
            })
          }
          type="button"
        >
          Republish Scope without break-glass
        </button>
      </div>
    );
  },
}));

vi.mock("./QuoteRoundComposer.tsx", () => ({
  QuoteRoundComposer: (props: Record<string, unknown>) => {
    routeMock.composerProps(props);
    return (
      <div data-testid="quote-round-composer">
        <button
          onClick={() =>
            (
              props.actions as {
                onRefreshScope: (input: {
                  expectedRevision: number;
                }) => Promise<void>;
              }
            ).onRefreshScope({ expectedRevision: 4 })
          }
          type="button"
        >
          Refresh draft Scope
        </button>
      </div>
    );
  },
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
  packageRevision: {
    _id: "package-3",
    responseDeadline: 2_000_000_000_000,
    revision: 3,
  },
  packageRevisionHistory: [
    {
      _id: "package-2",
      publishedAt: 100,
      responseDeadline: 1_900_000_000_000,
      revision: 2,
    },
    {
      _id: "package-3",
      publishedAt: 200,
      responseDeadline: 2_000_000_000_000,
      revision: 3,
    },
  ],
  revision: 4,
  scopeUpdateAvailable: true,
  state: "open",
  title: "Framing bid",
};

beforeEach(() => {
  routeMock.comparisonProps.mockReset();
  routeMock.composerProps.mockReset();
  routeMock.mutation.mockReset();
  routeMock.mutation.mockResolvedValue({ status: "reopened" });
  routeMock.navigate.mockReset();
  routeMock.query.mockReset();
  routeMock.query.mockImplementation(
    (_reference: unknown, args: { quoteRoundId?: string }) =>
      args.quoteRoundId ? openRound : composerProjection
  );
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
          republishCapacity={
            routeBase === "/backoffice"
              ? "admin"
              : routeBase === "/builder-staff"
                ? "builder-staff"
                : "builder"
          }
          roundId="round-1"
          routeBase={routeBase}
        />
      );

      expect(screen.queryByTestId("quote-round-composer")).toBeNull();
      expect(routeMock.comparisonProps).toHaveBeenLastCalledWith(
        expect.objectContaining({
        buildId: "build-1",
        onExit: expect.any(Function),
        organizationId: "org-1",
        packageRevisionHistory: openRound.packageRevisionHistory,
        quoteRoundId: "round-1",
        republishCapacity: expect.any(String),
        scopeUpdateAvailable: true,
        selectedPackageRevisionId: "package-3",
      })
      );

      fireEvent.click(screen.getByRole("button", { name: "Exit comparison" }));
      expect(routeMock.navigate).toHaveBeenCalledWith({
        params: { buildId: "build-1" },
        search: { tab: "quotes" },
        to: exitRoute,
      });
    }
  );

  test("selects an immutable Package Revision and republishes Scope with the explicit deadline policy", async () => {
    render(
      <QuoteRoundComposerRoute
        buildId="build-1"
        organizationId="org-1"
        republishCapacity="admin"
        roundId="round-1"
        routeBase="/backoffice"
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Select prior Package Revision" })
    );
    expect(routeMock.comparisonProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedPackageRevisionId: "package-2" })
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Republish Scope with break-glass" })
    );
    expect(routeMock.mutation).toHaveBeenCalledWith({
      buildId: "build-1",
      changedFieldKeys: ["scope"],
      confirmed: true,
      deadlinePolicy: { kind: "keep" },
      expectedRevision: 4,
      quoteRoundId: "round-1",
      reason: "Publish effective Scope.",
      administrativeCapacity: "admin",
      breakGlassConfirmed: true,
      workosOrganizationId: "org-1",
    });
  });

  test("forwards an explicit false admin break-glass decision", () => {
    render(
      <QuoteRoundComposerRoute
        buildId="build-1"
        organizationId="org-1"
        republishCapacity="admin"
        roundId="round-1"
        routeBase="/backoffice"
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Republish Scope without break-glass" })
    );

    expect(routeMock.mutation).toHaveBeenCalledWith(
      expect.objectContaining({
        administrativeCapacity: "admin",
        breakGlassConfirmed: false,
      })
    );
  });

  test("does not invent admin break-glass confirmation when the operator omits it", () => {
    render(
      <QuoteRoundComposerRoute
        buildId="build-1"
        organizationId="org-1"
        republishCapacity="admin"
        roundId="round-1"
        routeBase="/backoffice"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Republish Scope" }));

    const mutationInput = routeMock.mutation.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(mutationInput).toMatchObject({ administrativeCapacity: "admin" });
    expect(mutationInput).not.toHaveProperty("breakGlassConfirmed");
  });

  test("retains a Package Revision within one Round but resets it when the route Round changes", () => {
    const nextRound = {
      ...openRound,
      _id: "round-2",
      packageRevision: {
        _id: "package-4",
        responseDeadline: 2_100_000_000_000,
        revision: 4,
      },
      packageRevisionHistory: [
        {
          _id: "package-4",
          publishedAt: 300,
          responseDeadline: 2_100_000_000_000,
          revision: 4,
        },
      ],
      title: "Envelope bid",
    };
    routeMock.query.mockImplementation(
      (_reference: unknown, args: { quoteRoundId?: string }) =>
        args.quoteRoundId === "round-2"
          ? nextRound
          : args.quoteRoundId
            ? openRound
            : composerProjection
    );

    const { rerender } = render(
      <QuoteRoundComposerRoute
        buildId="build-1"
        organizationId="org-1"
        republishCapacity="admin"
        roundId="round-1"
        routeBase="/backoffice"
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Select prior Package Revision" })
    );
    expect(routeMock.comparisonProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedPackageRevisionId: "package-2" })
    );

    rerender(
      <QuoteRoundComposerRoute
        buildId="build-1"
        organizationId="org-1"
        republishCapacity="admin"
        roundId="round-1"
        routeBase="/backoffice"
      />
    );
    expect(routeMock.comparisonProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedPackageRevisionId: "package-2" })
    );

    rerender(
      <QuoteRoundComposerRoute
        buildId="build-1"
        organizationId="org-1"
        roundId="round-2"
        routeBase="/backoffice"
      />
    );
    expect(routeMock.comparisonProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedPackageRevisionId: "package-4" })
    );
  });

  test("refreshes pinned draft Scope only through the explicit composer action", () => {
    const draftRound = {
      ...openRound,
      draft: {
        labourLines: [],
        labourSubmilestoneIds: [],
        materialRows: [],
        recipientProfileIds: [],
        responseDeadline: null,
        templateVersionId: null,
      },
      packageRevision: null,
      packageRevisionHistory: [],
      scopeUpdateAvailable: false,
      state: "draft",
    };
    routeMock.query.mockImplementation(
      (_reference: unknown, args: { quoteRoundId?: string }) =>
        args.quoteRoundId ? draftRound : composerProjection
    );

    render(
      <QuoteRoundComposerRoute
        buildId="build-1"
        organizationId="org-1"
        republishCapacity="admin"
        roundId="round-1"
        routeBase="/backoffice"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh draft Scope" }));

    expect(routeMock.mutation).toHaveBeenCalledWith({
      buildId: "build-1",
      expectedRevision: 4,
      quoteRoundId: "round-1",
      workosOrganizationId: "org-1",
    });
  });
});
