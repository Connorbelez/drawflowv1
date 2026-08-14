/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function authed(roles: string[]) {
  return convexTest(schema, modules).withIdentity({
    email: "rbac@example.com",
    name: "RBAC User",
    role: roles[0],
    roles,
    subject: "user_rbac",
    tokenIdentifier: "https://api.workos.com/|user_rbac",
  } as any);
}

describe("production Convex RBAC builders", () => {
  test("requires authentication before checking capability classes", async () => {
    const t = convexTest(schema, modules);

    await expect(t.query(api.authzTest.requireAuthenticated, {})).rejects.toThrow(
      /Unauthorized/
    );
  });

  test("allows admin, backoffice, builder, user-management, non-destructive, and destructive classes", async () => {
    await expect(
      authed(["admin"]).query(api.authzTest.requireAdmin, {})
    ).resolves.toMatchObject({ capability: "admin", roles: ["admin"] });

    await expect(
      authed(["broker-staff"]).query(api.authzTest.requireBackoffice, {})
    ).resolves.toMatchObject({ capability: "backoffice" });

    await expect(
      authed(["builder"]).query(api.authzTest.requireBuilder, {})
    ).resolves.toMatchObject({ capability: "builder" });

    await expect(
      authed(["builder-staff"]).query(api.authzTest.requireBuilder, {})
    ).resolves.toMatchObject({ capability: "builder", roles: ["builder-staff"] });

    await expect(
      authed(["admin"]).query(api.authzTest.requireBuilder, {})
    ).resolves.toMatchObject({ capability: "builder", roles: ["admin"] });

    await expect(
      authed(["principle-broker"]).mutation(api.authzTest.requireUserManagementWrite, {})
    ).resolves.toMatchObject({ capability: "userManagementWrite" });

    await expect(
      authed(["broker"]).mutation(api.authzTest.requireNonDestructiveWrite, {})
    ).resolves.toMatchObject({ capability: "nonDestructiveWrite" });

    await expect(
      authed(["principle-broker"]).mutation(api.authzTest.requireDestructiveWrite, {})
    ).resolves.toMatchObject({ capability: "destructiveWrite" });
  });

  test("denies member workspace access and limits destructive writes to admin and principle-broker", async () => {
    await expect(
      authed(["member"]).query(api.authzTest.requireBackoffice, {})
    ).rejects.toThrow(/Forbidden: backoffice/);

    await expect(
      authed(["broker"]).mutation(api.authzTest.requireDestructiveWrite, {})
    ).rejects.toThrow(/Forbidden: destructiveWrite/);
  });
});

type LenderFixtureOptions = {
  brokerageStatus?: "active" | "inactive";
  extraActiveOrganization?: boolean;
  includeBrokerage?: boolean;
  includeUser?: boolean;
  membershipStatus?: "active" | "deleted" | "inactive" | "pending";
  organizationStatus?: "active" | "deleted";
  permissionSlugs?: string[];
  roleSlugs?: string[];
  userStatus?: "active" | "deleted";
};

async function seedLenderAuthorization(
  t: ReturnType<typeof convexTest>,
  options: LenderFixtureOptions = {}
) {
  const workosOrganizationId = "org_lender";
  const workosUserId = "user_lender";
  const roleSlugs = options.roleSlugs ?? ["admin"];
  return await t.run(async (ctx) => {
    if (options.includeUser !== false) {
      await ctx.db.insert("users", {
        authId: workosUserId,
        email: "lender@example.com",
        name: "Lender User",
        status: options.userStatus ?? "active",
        workosUserId,
      });
    }
    await ctx.db.insert("workosOrganizations", {
      domains: [],
      name: "Lender Organization",
      sourceEventId: "authz_test_org",
      sourceEventType: "organization.created",
      status: options.organizationStatus ?? "active",
      workosOrganizationId,
    });
    await ctx.db.insert("workosOrganizationMemberships", {
      roleSlug: roleSlugs[0],
      roleSlugs,
      sourceEventId: "authz_test_membership",
      sourceEventType: "organization_membership.created",
      status: options.membershipStatus ?? "active",
      workosMembershipId: "om_lender",
      workosOrganizationId,
      workosUserId,
    });
    if (roleSlugs[0]) {
      await ctx.db.insert("workosOrganizationRoles", {
        name: roleSlugs[0],
        permissionSlugs: options.permissionSlugs ?? [],
        slug: roleSlugs[0],
        sourceEventId: "authz_test_role",
        sourceEventType: "organization_role.created",
        status: "active",
        workosOrganizationId,
      });
    }
    const brokerageId =
      options.includeBrokerage === false
        ? null
        : await ctx.db.insert("brokerages", {
            createdAt: 1,
            displayName: "Lender Organization",
            legalName: "Lender Organization",
            status: options.brokerageStatus ?? "active",
            updatedAt: 1,
            workosOrganizationId,
          });
    const foreignBrokerageId = await ctx.db.insert("brokerages", {
      createdAt: 1,
      displayName: "Foreign Lender",
      legalName: "Foreign Lender",
      status: "active",
      updatedAt: 1,
      workosOrganizationId: "org_foreign",
    });
    if (options.extraActiveOrganization) {
      await ctx.db.insert("workosOrganizations", {
        domains: [],
        name: "Second Lender Organization",
        sourceEventId: "authz_test_org_second",
        sourceEventType: "organization.created",
        status: "active",
        workosOrganizationId: "org_lender_second",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "broker",
        roleSlugs: ["broker"],
        sourceEventId: "authz_test_membership_second",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_lender_second",
        workosOrganizationId: "org_lender_second",
        workosUserId,
      });
    }
    return {
      brokerageId,
      foreignBrokerageId,
      workosOrganizationId,
      workosUserId,
    };
  });
}

function asLender(
  t: ReturnType<typeof convexTest>,
  organizationId: string | undefined,
  roles: string[] = ["member"]
) {
  return t.withIdentity({
    email: "lender@example.com",
    name: "Lender User",
    ...(organizationId ? { organizationId } : {}),
    role: roles[0],
    roles,
    subject: "user_lender",
    tokenIdentifier: "https://api.workos.com/|user_lender",
  } as any);
}

describe("canonical lender organization authorization", () => {
  test("resolves query and mutation context from active projections and projected permissions", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedLenderAuthorization(t, {
      permissionSlugs: ["users:write"],
      roleSlugs: ["admin"],
    });
    const lender = asLender(t, fixture.workosOrganizationId);
    const args = {
      brokerageId: fixture.brokerageId!,
      organizationId: fixture.workosOrganizationId,
      permission: "users:write",
    };

    await expect(
      lender.query(api.authzTest.requireLenderOrganizationQuery, args)
    ).resolves.toMatchObject({
      brokerageId: fixture.brokerageId,
      membershipIds: ["om_lender"],
      roles: ["admin"],
      workosOrganizationId: fixture.workosOrganizationId,
      workosUserId: fixture.workosUserId,
    });
    await expect(
      lender.mutation(api.authzTest.requireLenderOrganizationMutation, args)
    ).resolves.toMatchObject({
      brokerageId: fixture.brokerageId,
      roles: ["admin"],
    });
  });

  test("preserves multi-organization membership and resolves the selected organization", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedLenderAuthorization(t, {
      extraActiveOrganization: true,
      roleSlugs: ["broker"],
    });

    await expect(
      asLender(t, fixture.workosOrganizationId).query(
        api.authzTest.requireLenderOrganizationQuery,
        {}
      )
    ).resolves.toMatchObject({
      roles: ["broker"],
      workosOrganizationId: fixture.workosOrganizationId,
    });
    await expect(
      asLender(t, undefined).query(
        api.authzTest.requireLenderOrganizationQuery,
        {}
      )
    ).rejects.toThrow(/active organization context ambiguous/);
  });

  test("resolves one unambiguous membership without an organization claim and rejects a missing context", async () => {
    const t = convexTest(schema, modules);
    await seedLenderAuthorization(t, { roleSlugs: ["broker"] });
    await expect(
      asLender(t, undefined).query(
        api.authzTest.requireLenderOrganizationQuery,
        {}
      )
    ).resolves.toMatchObject({
      roles: ["broker"],
      workosOrganizationId: "org_lender",
    });

    const missing = convexTest(schema, modules);
    await missing.run(async (ctx) => {
      await ctx.db.insert("users", {
        authId: "user_lender",
        email: "lender@example.com",
        name: "Lender User",
        status: "active",
        workosUserId: "user_lender",
      });
    });
    await expect(
      asLender(missing, undefined).query(
        api.authzTest.requireLenderOrganizationQuery,
        {}
      )
    ).rejects.toThrow(/active organization context missing/);
  });

  test.each([
    {
      expected: /active user projection missing/,
      identityOrganizationId: "org_lender",
      options: { includeUser: false },
    },
    {
      expected: /active user projection/,
      identityOrganizationId: "org_lender",
      options: { userStatus: "deleted" as const },
    },
    {
      expected: /inactive organization membership/,
      identityOrganizationId: "org_lender",
      options: { membershipStatus: "inactive" as const },
    },
    {
      expected: /unsupported lender role/,
      identityOrganizationId: "org_lender",
      options: { roleSlugs: ["builder"] },
    },
    {
      expected: /inactive organization/,
      identityOrganizationId: "org_lender",
      options: { organizationStatus: "deleted" as const },
    },
    {
      expected: /lender tenant missing/,
      identityOrganizationId: "org_lender",
      options: { includeBrokerage: false },
    },
    {
      expected: /inactive lender tenant/,
      identityOrganizationId: "org_lender",
      options: { brokerageStatus: "inactive" as const },
    },
    {
      expected: /foreign organization context/,
      identityOrganizationId: "org_foreign",
      options: {},
    },
  ])(
    "fails closed for $expected",
    async ({ expected, identityOrganizationId, options }) => {
      const t = convexTest(schema, modules);
      await seedLenderAuthorization(t, options);

      await expect(
        asLender(t, identityOrganizationId).query(
          api.authzTest.requireLenderOrganizationQuery,
          {}
        )
      ).rejects.toThrow(expected);
    }
  );

  test("rejects foreign organization, tenant, and permission resources", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedLenderAuthorization(t, {
      roleSlugs: ["broker"],
    });
    const lender = asLender(t, fixture.workosOrganizationId);

    await expect(
      lender.query(api.authzTest.requireLenderOrganizationQuery, {
        organizationId: "org_foreign",
      })
    ).rejects.toThrow(/organization resource/);
    await expect(
      lender.query(api.authzTest.requireLenderOrganizationQuery, {
        brokerageId: fixture.foreignBrokerageId,
      })
    ).rejects.toThrow(/tenant resource/);
    await expect(
      lender.query(api.authzTest.requireLenderOrganizationQuery, {
        permission: "users:write",
      })
    ).rejects.toThrow(/permission users:write/);
  });

  test("limits lender-local user management to projected admin and principal broker roles", async () => {
    for (const role of ["admin", "principle-broker"] as const) {
      const t = convexTest(schema, modules);
      await seedLenderAuthorization(t, { roleSlugs: [role] });
      await expect(
        asLender(t, "org_lender").mutation(
          api.authzTest.requireLenderUserManagement,
          {}
        )
      ).resolves.toMatchObject({ roles: [role] });
    }

    const brokerTest = convexTest(schema, modules);
    await seedLenderAuthorization(brokerTest, { roleSlugs: ["broker"] });
    await expect(
      asLender(brokerTest, "org_lender", ["admin"]).mutation(
        api.authzTest.requireLenderUserManagement,
        {}
      )
    ).rejects.toThrow(/Forbidden: lenderUserManagementWrite/);
  });
});
