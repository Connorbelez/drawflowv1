import { describe, expect, test } from "vitest";

import type { DrawFlowAssistantRouteContext } from "./assistantRouteContext";
import {
  assistantRouteSitemapSummary,
  findAssistantRouteMatch,
  reachableAssistantRoutes,
} from "./assistantRouteRegistry";

const baseContext: DrawFlowAssistantRouteContext = {
  authDiagnostics: {
    hasOrganization: true,
    hasToken: true,
    hasUser: true,
    normalizedRoles: ["admin"],
    roleCount: 1,
  },
  organizationId: "org_test",
  pathname: "/backoffice",
  role: "admin",
  roles: ["admin"],
  search: {},
  userId: "user_test",
  workspace: "backoffice",
};

describe("assistant route registry", () => {
  test("maps new build requests to the current role-aware workspace route", () => {
    expect(
      findAssistantRouteMatch("I want to create a new build", baseContext)
    ).toMatchObject({
      entry: { id: "backoffice.new-build" },
      to: "/backoffice/proposals/new",
    });

    expect(
      findAssistantRouteMatch("I want to create a new build", {
        ...baseContext,
        pathname: "/builder/proposals",
        roles: ["builder"],
        role: "builder",
        workspace: "builder",
      })
    ).toMatchObject({
      entry: { id: "builder.new-build" },
      to: "/builder/proposals/new",
    });
  });

  test("treats Garden Suite build startup as navigation, not a mutation", () => {
    expect(
      findAssistantRouteMatch("I wanted to start a new Garden Suite build.", {
        ...baseContext,
        pathname: "/backoffice/user-management",
        workspace: "backoffice",
      })
    ).toMatchObject({
      entry: { id: "backoffice.new-build" },
      to: "/backoffice/proposals/new",
    });

    expect(
      findAssistantRouteMatch("I wanted to start a new Garden Suite build.", {
        ...baseContext,
        pathname: "/builder/proposals",
        role: "builder",
        roles: ["builder"],
        workspace: "builder",
      })
    ).toMatchObject({
      entry: { id: "builder.new-build" },
      to: "/builder/proposals/new",
    });
  });

  test("filters reachable pages by normalized role", () => {
    const builderRoutes = reachableAssistantRoutes({
      ...baseContext,
      pathname: "/builder",
      role: "builder",
      roles: ["builder"],
      workspace: "builder",
    });

    expect(builderRoutes.map((route) => route.id)).toContain(
      "builder.new-build"
    );
    expect(builderRoutes.map((route) => route.id)).not.toContain(
      "backoffice.draws"
    );
  });

  test("does not invent dynamic routes when required params are missing", () => {
    expect(findAssistantRouteMatch("open this build", baseContext)).toBeNull();
    expect(
      findAssistantRouteMatch("open this build", {
        ...baseContext,
        activeBuildId: "build_123",
      })
    ).toMatchObject({
      to: "/backoffice/builds/build_123",
    });
  });

  test("summarizes reachable route purposes for sitemap answers", () => {
    expect(assistantRouteSitemapSummary(baseContext)).toContain(
      "Backoffice Proposals"
    );
    expect(assistantRouteSitemapSummary(baseContext)).toContain(
      "/backoffice/proposals/new"
    );
  });
});
