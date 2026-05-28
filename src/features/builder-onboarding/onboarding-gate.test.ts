import { describe, expect, test } from "vitest";

import {
  type BuilderOnboardingState,
  resolveBuilderHomeView,
} from "./onboarding-gate";

const newBuilder: BuilderOnboardingState = {
  complete: false,
  dismissed: false,
  hasProfile: true,
  hasProposals: false,
  isBuilder: true,
};

describe("resolveBuilderHomeView", () => {
  test("fixtures always render the dashboard", () => {
    expect(
      resolveBuilderHomeView({
        fixtureEnabled: true,
        forceDashboard: false,
        state: undefined,
      }),
    ).toBe("dashboard");
  });

  test("shows loading until onboarding state resolves", () => {
    expect(
      resolveBuilderHomeView({
        fixtureEnabled: false,
        forceDashboard: false,
        state: undefined,
      }),
    ).toBe("loading");
  });

  test("a freshly provisioned builder with no proposals sees first-run", () => {
    expect(
      resolveBuilderHomeView({
        fixtureEnabled: false,
        forceDashboard: false,
        state: newBuilder,
      }),
    ).toBe("first-run");
  });

  test("a builder who reached first value (has proposals) skips first-run", () => {
    expect(
      resolveBuilderHomeView({
        fixtureEnabled: false,
        forceDashboard: false,
        state: { ...newBuilder, complete: true, hasProposals: true },
      }),
    ).toBe("dashboard");
  });

  test("a builder who dismissed first-run sees the dashboard", () => {
    expect(
      resolveBuilderHomeView({
        fixtureEnabled: false,
        forceDashboard: false,
        state: { ...newBuilder, dismissed: true },
      }),
    ).toBe("dashboard");
  });

  test("starting the build forces the dashboard this session", () => {
    expect(
      resolveBuilderHomeView({
        fixtureEnabled: false,
        forceDashboard: true,
        state: newBuilder,
      }),
    ).toBe("dashboard");
  });

  test("a builder without a linked profile sees profile-pending guidance", () => {
    expect(
      resolveBuilderHomeView({
        fixtureEnabled: false,
        forceDashboard: false,
        state: { ...newBuilder, hasProfile: false },
      }),
    ).toBe("profile-pending");
  });

  test("non-builders (admin/backoffice) are never gated", () => {
    expect(
      resolveBuilderHomeView({
        fixtureEnabled: false,
        forceDashboard: false,
        state: {
          complete: false,
          dismissed: false,
          hasProfile: false,
          hasProposals: false,
          isBuilder: false,
        },
      }),
    ).toBe("dashboard");
  });
});
