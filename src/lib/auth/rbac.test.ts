import { describe, expect, test } from "vitest";

import {
  BACKOFFICE_ROLE_SLUGS,
  BUILDER_ROLE_SLUGS,
  DESTRUCTIVE_WRITE_ROLE_SLUGS,
  getWorkspaceAccessDecision,
  normalizeRoleSlug,
  normalizeRoleSlugs,
} from "./rbac";

describe("DrawFlow frontend RBAC policy", () => {
  test("normalizes only current WorkOS role slugs and preserves principle-broker spelling", () => {
    expect(normalizeRoleSlug(" Principal Broker ")).toBe("principle-broker");
    expect(normalizeRoleSlug("principle-broker")).toBe("principle-broker");
    expect(normalizeRoleSlug("builder_staff")).toBe("builder-staff");
    expect(normalizeRoleSlug("unknown")).toBeNull();
    expect(normalizeRoleSlugs(["member", "admin", "ADMIN", "contractor"])).toEqual([
      "member",
      "admin",
      "contractor",
    ]);
  });

  test("central role sets match production route and capability policy", () => {
    expect(BACKOFFICE_ROLE_SLUGS).toEqual([
      "admin",
      "principle-broker",
      "broker",
      "broker-staff",
    ]);
    expect(BUILDER_ROLE_SLUGS).toEqual(["admin", "builder"]);
    expect(DESTRUCTIVE_WRITE_ROLE_SLUGS).toEqual(["admin", "principle-broker"]);
  });

  test("routes unauthenticated, allowed, wrong-role, member, and builder demo access centrally", () => {
    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: false,
        pathname: "/backoffice",
        roles: [],
        workspace: "backoffice",
      })
    ).toMatchObject({ status: "unauthenticated" });

    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        pathname: "/backoffice",
        roles: ["broker-staff"],
        workspace: "backoffice",
      })
    ).toMatchObject({ status: "allowed" });

    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        pathname: "/builder",
        roles: ["admin"],
        workspace: "builder",
      })
    ).toMatchObject({ status: "allowed" });

    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        pathname: "/builder",
        roles: ["builder"],
        workspace: "builder",
      })
    ).toMatchObject({ status: "allowed" });

    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        pathname: "/backoffice",
        roles: ["builder"],
        workspace: "backoffice",
      })
    ).toMatchObject({ status: "forbidden", reason: "no-workspace-access" });

    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        pathname: "/builder",
        roles: ["member"],
        workspace: "builder",
      })
    ).toMatchObject({ status: "forbidden", reason: "onboarding-required" });

    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: false,
        pathname: "/builder/demo/dashboard",
        roles: [],
        workspace: "builder",
      })
    ).toMatchObject({ status: "allowed", reason: "demo-exception" });
  });
});
