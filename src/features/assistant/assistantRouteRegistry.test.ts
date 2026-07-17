import { describe, expect, test } from "vitest";
import type { DrawFlowAssistantRouteContext } from "./assistantRouteContext.ts";
import {
  assistantRouteSitemapSummary,
  canonicalizeAssistantRoute,
  findAssistantRouteMatch,
} from "./assistantRouteRegistry.ts";

const backofficeContext: DrawFlowAssistantRouteContext = {
  authDiagnostics: {
    hasOrganization: true,
    hasToken: true,
    hasUser: true,
    normalizedRoles: ["admin"],
    roleCount: 1,
  },
  organizationId: "org_test",
  pathname: "/backoffice/proposals/new",
  role: "admin",
  roles: ["admin"],
  search: {},
  userId: "user_test",
  workspace: "backoffice",
};

describe("assistant route registry", () => {
  test("routes template-settings prompts to the canonical backoffice settings screen", () => {
    expect(
      findAssistantRouteMatch("change template settings", backofficeContext)
    ).toMatchObject({
      entry: {
        id: "backoffice.settings",
        label: "Backoffice Settings",
      },
      to: "/backoffice/settings",
    });
  });

  test("includes settings in the role-scoped assistant sitemap", () => {
    expect(assistantRouteSitemapSummary(backofficeContext)).toContain(
      "Backoffice Settings"
    );
  });

  test("canonicalizes common model-generated settings child paths", () => {
    expect(canonicalizeAssistantRoute("/backoffice/settings/template")).toBe(
      "/backoffice/settings"
    );
    expect(
      canonicalizeAssistantRoute("/backoffice/settings/proposal-templates")
    ).toBe("/backoffice/settings");
  });

  test("rejects unknown assistant navigation targets", () => {
    expect(canonicalizeAssistantRoute("/backoffice/settings/not-a-real-tab")).toBeNull();
    expect(canonicalizeAssistantRoute("/made-up-route")).toBeNull();
  });
});
