import { describe, expect, test } from "vitest";

import {
  BACKOFFICE_ROLE_SLUGS,
  BUILDER_ROLE_SLUGS,
  DESTRUCTIVE_WRITE_ROLE_SLUGS,
  getUserManagementAccessDecision,
  getWorkspaceAccessDecision,
  normalizeRoleSlug,
  normalizeRoleSlugs,
  requireUserManagementWriteAccess,
  requireWorkspaceAccess,
  USER_MANAGEMENT_WRITE_ROLE_SLUGS,
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
    expect(BUILDER_ROLE_SLUGS).toEqual(["admin", "builder", "builder-staff"]);
    expect(USER_MANAGEMENT_WRITE_ROLE_SLUGS).toEqual([
      "admin",
      "principle-broker",
    ]);
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
        roles: ["builder-staff"],
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

  test("requireWorkspaceAccess redirects unauthenticated and forbidden sessions", () => {
    expectRedirect(
      () =>
        requireWorkspaceAccess({
          isAuthenticated: false,
          pathname: "/backoffice/user-management",
          roles: [],
          workspace: "backoffice",
        }),
      {
        location:
          "/api/auth/sign-in?returnTo=%2Fbackoffice%2Fuser-management",
      }
    );

    expectRedirect(
      () =>
        requireWorkspaceAccess({
          isAuthenticated: true,
          pathname: "/builder",
          roles: ["broker"],
          workspace: "builder",
        }),
      {
        options: {
          search: {
            reason: "no-workspace-access",
            workspace: "builder",
          },
          to: "/protected-access",
        },
      }
    );

    expectRedirect(
      () =>
        requireWorkspaceAccess({
          isAuthenticated: true,
          pathname: "/backoffice",
          roles: ["member"],
          workspace: "backoffice",
        }),
      {
        options: {
          search: {
            reason: "onboarding-required",
            workspace: "backoffice",
          },
          to: "/protected-access",
        },
      }
    );
  });

  test("user management route access requires user-management write roles", () => {
    expect(
      getUserManagementAccessDecision({
        isAuthenticated: true,
        pathname: "/backoffice/user-management",
        roles: ["admin"],
        workspace: "backoffice",
      })
    ).toMatchObject({ status: "allowed" });

    expect(
      getUserManagementAccessDecision({
        isAuthenticated: true,
        pathname: "/backoffice/user-management",
        roles: ["principle-broker"],
        workspace: "backoffice",
      })
    ).toMatchObject({ status: "allowed" });

    expect(
      getUserManagementAccessDecision({
        isAuthenticated: true,
        pathname: "/backoffice/user-management",
        roles: ["broker-staff"],
        workspace: "backoffice",
      })
    ).toMatchObject({ reason: "no-workspace-access", status: "forbidden" });

    expectRedirect(
      () =>
        requireUserManagementWriteAccess({
          isAuthenticated: true,
          pathname: "/backoffice/user-management",
          roles: ["broker"],
          workspace: "backoffice",
        }),
      {
        options: {
          search: {
            reason: "no-workspace-access",
            workspace: "backoffice",
          },
          to: "/protected-access",
        },
      }
    );
  });
});

function expectRedirect(
  fn: () => unknown,
  expected: {
    location?: string;
    options?: {
      search: Record<string, string>;
      to: string;
    };
  }
) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    const redirect = error as Response & {
      options?: {
        search?: Record<string, string>;
        to?: string;
      };
    };
    expect(redirect.status).toBe(307);
    if (expected.location) {
      expect(redirect.headers.get("location")).toBe(expected.location);
    }
    if (expected.options) {
      expect(redirect.options).toMatchObject(expected.options);
    }
    return;
  }

  throw new Error("Expected TanStack redirect response to be thrown");
}
