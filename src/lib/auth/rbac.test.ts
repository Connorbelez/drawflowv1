import { describe, expect, test } from "vitest";

import {
  canMakeActiveBuildFinalDecision,
  BACKOFFICE_ROLE_SLUGS,
  BUILDER_ROLE_SLUGS,
  DESTRUCTIVE_WRITE_ROLE_SLUGS,
  getIntegrationAdminAccessDecision,
  getUserManagementAccessDecision,
  getWorkspaceAccessDecision,
  hasBuilderStaffWorkspaceAccess,
  requireHomeownerWorkspaceAccess,
  INTEGRATION_ADMIN_ROLE_SLUGS,
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
    expect(normalizeRoleSlug("homeowner")).toBeNull();
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
    expect(INTEGRATION_ADMIN_ROLE_SLUGS).toEqual(["admin"]);
  });

  test("reserves integration operations for organization admins", () => {
    const input = {
      isAuthenticated: true,
      organizationId: "org_123",
      pathname: "/backoffice/integrations",
      workspace: "backoffice" as const,
    };

    expect(
      getIntegrationAdminAccessDecision({ ...input, roles: ["admin"] })
    ).toMatchObject({ status: "allowed" });
    expect(
      getIntegrationAdminAccessDecision({
        ...input,
        roles: ["principle-broker"],
      })
    ).toMatchObject({ status: "forbidden", reason: "no-workspace-access" });
    expect(
      getIntegrationAdminAccessDecision({ ...input, roles: ["broker"] })
    ).toMatchObject({ status: "forbidden", reason: "no-workspace-access" });
  });

  test("reserves active-build final decisions for lender admins", () => {
    expect(canMakeActiveBuildFinalDecision(["admin"])).toBe(true);
    expect(canMakeActiveBuildFinalDecision(["principal-broker"])).toBe(true);
    expect(canMakeActiveBuildFinalDecision(["broker"])).toBe(false);
    expect(canMakeActiveBuildFinalDecision(["broker-staff"])).toBe(false);
    expect(canMakeActiveBuildFinalDecision(["builder"])).toBe(false);
  });

  test("fails closed on missing organization even for privileged mixed-role sessions", () => {
    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        organizationId: "   ",
        pathname: "/backoffice",
        roles: ["admin", "builder"],
        workspace: "backoffice",
      })
    ).toMatchObject({ status: "forbidden", reason: "missing-organization" });

    expect(
      getUserManagementAccessDecision({
        isAuthenticated: true,
        organizationId: "   ",
        pathname: "/backoffice/user-management",
        roles: ["admin", "builder"],
        workspace: "backoffice",
      })
    ).toMatchObject({ status: "forbidden", reason: "missing-organization" });
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
        organizationId: null,
        pathname: "/backoffice",
        roles: ["admin"],
        workspace: "backoffice",
      })
    ).toMatchObject({ status: "forbidden", reason: "missing-organization" });

    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        organizationId: "org_123",
        pathname: "/backoffice",
        roles: ["broker-staff"],
        workspace: "backoffice",
      })
    ).toMatchObject({ status: "allowed" });

    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        organizationId: "org_123",
        pathname: "/builder",
        roles: ["admin"],
        workspace: "builder",
      })
    ).toMatchObject({ status: "allowed" });

    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        organizationId: "org_123",
        pathname: "/builder",
        roles: ["builder-staff"],
        workspace: "builder",
      })
    ).toMatchObject({ status: "allowed" });

    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        organizationId: "org_123",
        pathname: "/builder",
        roles: ["builder"],
        workspace: "builder",
      })
    ).toMatchObject({ status: "allowed" });

    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        organizationId: "org_123",
        pathname: "/backoffice",
        roles: ["builder"],
        workspace: "backoffice",
      })
    ).toMatchObject({ status: "forbidden", reason: "no-workspace-access" });

    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        organizationId: "org_123",
        pathname: "/backoffice",
        roles: ["member", "admin"],
        workspace: "backoffice",
      })
    ).toMatchObject({ status: "allowed" });

    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        organizationId: "org_123",
        pathname: "/builder",
        roles: ["member"],
        workspace: "builder",
      })
    ).toMatchObject({ status: "forbidden", reason: "onboarding-required" });

    // A Build-scoped invitation member can enter the exact Build route without
    // an organization-wide Contractor role; Convex enforces the active grant.
    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        organizationId: null,
        pathname: "/contractor/builds/build_01",
        roles: ["member"],
        workspace: "contractor",
      })
    ).toMatchObject({ status: "allowed" });

    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: false,
        pathname: "/builder/demo/dashboard",
        roles: [],
        workspace: "builder",
      })
    ).toMatchObject({ status: "allowed", reason: "demo-exception" });
  });

  test("builder-staff workspace allows admins and builder staff only", () => {
    expect(hasBuilderStaffWorkspaceAccess(["admin"])).toBe(true);
    expect(hasBuilderStaffWorkspaceAccess(["builder-staff"])).toBe(true);
    expect(hasBuilderStaffWorkspaceAccess(["builder_staff"])).toBe(true);
    expect(hasBuilderStaffWorkspaceAccess(["builder"])).toBe(false);
    expect(hasBuilderStaffWorkspaceAccess(["broker"])).toBe(false);
  });

  test("homeowner shell requires authentication but delegates tenant and Build scope to the participation grant", () => {
    expect(
      requireHomeownerWorkspaceAccess({
        isAuthenticated: true,
        pathname: "/homeowner/builds/build_01",
      })
    ).toEqual({ status: "allowed" });
    expectRedirect(
      () =>
        requireHomeownerWorkspaceAccess({
          isAuthenticated: false,
          pathname: "/homeowner/builds/build_01",
        }),
      {
        options: {
          search: { returnTo: "/homeowner/builds/build_01" },
          to: "/api/auth/sign-in",
        },
      }
    );
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
          "/api/auth/sign-in?returnPathname=%2Fbackoffice%2Fuser-management",
      }
    );

    expectRedirect(
      () =>
        requireWorkspaceAccess({
          isAuthenticated: true,
          organizationId: null,
          pathname: "/builder/proposals",
          roles: ["builder"],
          workspace: "builder",
        }),
      {
        options: {
          search: {
            reason: "missing-organization",
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
          organizationId: "org_123",
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
          organizationId: "org_123",
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

  test("canonical production proposal routes are guarded while demo routes remain public", () => {
    for (const pathname of [
      "/builder/proposals/new",
      "/builder/proposals/proposal_123",
      "/builder/proposals/proposal_123/roadmap",
    ]) {
      expect(
        getWorkspaceAccessDecision({
          isAuthenticated: false,
          pathname,
          roles: [],
          workspace: "builder",
        }),
      ).toMatchObject({ reason: "unauthenticated", status: "unauthenticated" });
      expect(
        getWorkspaceAccessDecision({
          isAuthenticated: true,
          organizationId: "org_123",
          pathname,
          roles: ["builder"],
          workspace: "builder",
        }),
      ).toMatchObject({ status: "allowed" });
      expect(
        getWorkspaceAccessDecision({
          isAuthenticated: true,
          organizationId: "org_123",
          pathname,
          roles: ["broker"],
          workspace: "builder",
        }),
      ).toMatchObject({ reason: "no-workspace-access", status: "forbidden" });
    }

    for (const pathname of [
      "/backoffice/proposals",
      "/backoffice/proposals/proposal_123",
    ]) {
      expect(
        getWorkspaceAccessDecision({
          isAuthenticated: false,
          pathname,
          roles: [],
          workspace: "backoffice",
        }),
      ).toMatchObject({ reason: "unauthenticated", status: "unauthenticated" });
      expect(
        getWorkspaceAccessDecision({
          isAuthenticated: true,
          organizationId: "org_123",
          pathname,
          roles: ["broker-staff"],
          workspace: "backoffice",
        }),
      ).toMatchObject({ status: "allowed" });
      expect(
        getWorkspaceAccessDecision({
          isAuthenticated: true,
          organizationId: "org_123",
          pathname,
          roles: ["builder"],
          workspace: "backoffice",
        }),
      ).toMatchObject({ reason: "no-workspace-access", status: "forbidden" });
    }

    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: false,
        pathname: "/builder/demo/dashboard/proposals",
        roles: [],
        workspace: "builder",
      }),
    ).toMatchObject({ reason: "demo-exception", status: "allowed" });
  });

  test("user management route access requires user-management write roles", () => {
    expect(
      getUserManagementAccessDecision({
        isAuthenticated: true,
        organizationId: "org_123",
        pathname: "/backoffice/user-management",
        roles: ["admin"],
        workspace: "backoffice",
      })
    ).toMatchObject({ status: "allowed" });

    expect(
      getUserManagementAccessDecision({
        isAuthenticated: true,
        organizationId: "org_123",
        pathname: "/backoffice/user-management",
        roles: ["principle-broker"],
        workspace: "backoffice",
      })
    ).toMatchObject({ status: "allowed" });

    expect(
      getUserManagementAccessDecision({
        isAuthenticated: true,
        organizationId: "org_123",
        pathname: "/backoffice/user-management",
        roles: ["broker-staff"],
        workspace: "backoffice",
      })
    ).toMatchObject({ reason: "no-workspace-access", status: "forbidden" });

    expectRedirect(
      () =>
        requireUserManagementWriteAccess({
          isAuthenticated: true,
          organizationId: "org_123",
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

  test("contractor workspace route guard: onboarding bridge, full workspace, member, profile-link", () => {
    // Unauthenticated contractor route → sign-in.
    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: false,
        pathname: "/contractor",
        roles: [],
        workspace: "contractor",
      })
    ).toMatchObject({ status: "unauthenticated" });

    // Member can reach the onboarding bridge only (PRD §5.2, §11.1).
    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        organizationId: "org_123",
        pathname: "/contractor/onboarding",
        roles: ["member"],
        workspace: "contractor",
      })
    ).toMatchObject({ status: "allowed" });

    // Member cannot reach the full workspace → onboarding-required.
    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        organizationId: "org_123",
        pathname: "/contractor",
        roles: ["member"],
        workspace: "contractor",
      })
    ).toMatchObject({ status: "forbidden", reason: "onboarding-required" });

    // Contractor role + linked profile → full workspace allowed.
    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        organizationId: "org_123",
        pathname: "/contractor",
        profileLinked: true,
        roles: ["contractor"],
        workspace: "contractor",
      })
    ).toMatchObject({ status: "allowed" });

    // Contractor role without a linked profile → profile-link-required (PRD
    // §11.1, §5.2 contractor role without linked profile sees resolution state).
    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        organizationId: "org_123",
        pathname: "/contractor",
        profileLinked: false,
        roles: ["contractor"],
        workspace: "contractor",
      })
    ).toMatchObject({ status: "forbidden", reason: "profile-link-required" });

    // A non-member, non-contractor role (e.g. builder) cannot reach the
    // contractor workspace at all.
    expect(
      getWorkspaceAccessDecision({
        isAuthenticated: true,
        organizationId: "org_123",
        pathname: "/contractor",
        roles: ["builder"],
        workspace: "contractor",
      })
    ).toMatchObject({ status: "forbidden", reason: "no-workspace-access" });

    // Contractor role redirects to onboarding bridge when profile link missing.
    expectRedirect(
      () =>
        requireWorkspaceAccess({
          isAuthenticated: true,
          organizationId: "org_123",
          pathname: "/contractor",
          profileLinked: false,
          roles: ["contractor"],
          workspace: "contractor",
        }),
      {
        options: { to: "/contractor/onboarding" },
      }
    );
  });
});

function expectRedirect(
  fn: () => unknown,
  expected: {
    location?: string;
    options?: {
      search?: Record<string, string>;
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
