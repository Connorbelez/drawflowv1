/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
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

    await expect(t.query(internal.authzTest.requireAuthenticated, {})).rejects.toThrow(
      /Unauthorized/
    );
  });

  test("allows admin, backoffice, builder, user-management, non-destructive, and destructive classes", async () => {
    await expect(
      authed(["admin"]).query(internal.authzTest.requireAdmin, {})
    ).resolves.toMatchObject({ capability: "admin", roles: ["admin"] });

    await expect(
      authed(["broker-staff"]).query(internal.authzTest.requireBackoffice, {})
    ).resolves.toMatchObject({ capability: "backoffice" });

    await expect(
      authed(["builder"]).query(internal.authzTest.requireBuilder, {})
    ).resolves.toMatchObject({ capability: "builder" });

    await expect(
      authed(["builder-staff"]).query(internal.authzTest.requireBuilder, {})
    ).resolves.toMatchObject({ capability: "builder", roles: ["builder-staff"] });

    await expect(
      authed(["admin"]).query(internal.authzTest.requireBuilder, {})
    ).resolves.toMatchObject({ capability: "builder", roles: ["admin"] });

    await expect(
      authed(["principle-broker"]).mutation(internal.authzTest.requireUserManagementWrite, {})
    ).resolves.toMatchObject({ capability: "userManagementWrite" });

    await expect(
      authed(["broker"]).mutation(internal.authzTest.requireNonDestructiveWrite, {})
    ).resolves.toMatchObject({ capability: "nonDestructiveWrite" });

    await expect(
      authed(["principle-broker"]).mutation(internal.authzTest.requireDestructiveWrite, {})
    ).resolves.toMatchObject({ capability: "destructiveWrite" });
  });

  test("denies member workspace access and limits destructive writes to admin and principle-broker", async () => {
    await expect(
      authed(["member"]).query(internal.authzTest.requireBackoffice, {})
    ).rejects.toThrow(/Forbidden: backoffice/);

    await expect(
      authed(["broker"]).mutation(internal.authzTest.requireDestructiveWrite, {})
    ).rejects.toThrow(/Forbidden: destructiveWrite/);
  });
});

type LenderFixtureOptions = {
  brokerageStatus?: "active" | "inactive";
  duplicateBrokerage?: boolean;
  duplicateUserProjection?: boolean;
  extraActiveOrganization?: boolean;
  includeBrokerage?: boolean;
  includeUser?: boolean;
  membershipStatus?: "active" | "deleted" | "inactive" | "pending";
  organizationStatus?: "active" | "deleted";
  permissionSlugs?: string[];
  roleSlugs?: string[];
  userStatus?: "active" | "deleted";
};

const workosFixtureTime = "2023-11-27T19:07:33.155Z";

async function projectWorkosFixture(
  t: ReturnType<typeof convexTest>,
  event: string,
  id: string,
  data: Record<string, unknown>
) {
  await t.mutation(internal.workosProjection.ingestWorkosEvent, {
    created_at: workosFixtureTime,
    data,
    event,
    id,
  });
}

async function seedLenderAuthorization(
  t: ReturnType<typeof convexTest>,
  options: LenderFixtureOptions = {}
) {
  const workosOrganizationId = "org_lender";
  const workosUserId = "user_lender";
  const roleSlugs = options.roleSlugs ?? ["admin"];

  if (options.includeUser !== false) {
    await projectWorkosFixture(t, "user.created", "authz_test_user", {
      created_at: workosFixtureTime,
      email: "lender@example.com",
      email_verified: true,
      first_name: "Lender",
      id: workosUserId,
      last_name: "User",
      updated_at: workosFixtureTime,
    });
    if (options.userStatus === "deleted") {
      await projectWorkosFixture(t, "user.deleted", "authz_test_user_deleted", {
        id: workosUserId,
      });
    }
  }

  await projectWorkosFixture(t, "organization.created", "authz_test_org", {
    created_at: workosFixtureTime,
    domains: [],
    id: workosOrganizationId,
    name: "Lender Organization",
    object: "organization",
    updated_at: workosFixtureTime,
  });
  if (options.organizationStatus === "deleted") {
    await projectWorkosFixture(
      t,
      "organization.deleted",
      "authz_test_org_deleted",
      { id: workosOrganizationId }
    );
  }

  const membershipStatus = options.membershipStatus ?? "active";
  await projectWorkosFixture(
    t,
    "organization_membership.created",
    "authz_test_membership",
    {
      created_at: workosFixtureTime,
      directory_managed: false,
      id: "om_lender",
      object: "organization_membership",
      organization_id: workosOrganizationId,
      ...(roleSlugs[0] ? { role: { slug: roleSlugs[0] } } : {}),
      roles: roleSlugs.map((slug) => ({ slug })),
      status: membershipStatus === "deleted" ? "active" : membershipStatus,
      updated_at: workosFixtureTime,
      user_id: workosUserId,
    }
  );
  if (membershipStatus === "deleted") {
    await projectWorkosFixture(
      t,
      "organization_membership.deleted",
      "authz_test_membership_deleted",
      { id: "om_lender" }
    );
  }

  if (roleSlugs[0]) {
    await projectWorkosFixture(
      t,
      "organization_role.created",
      "authz_test_role",
      {
        created_at: workosFixtureTime,
        name: roleSlugs[0],
        object: "organization_role",
        organization_id: workosOrganizationId,
        permissions: options.permissionSlugs ?? [],
        resource_type_slug: "organization",
        slug: roleSlugs[0],
        updated_at: workosFixtureTime,
      }
    );
  }

  if (options.extraActiveOrganization) {
    await projectWorkosFixture(
      t,
      "organization.created",
      "authz_test_org_second",
      {
        created_at: workosFixtureTime,
        domains: [],
        id: "org_lender_second",
        name: "Second Lender Organization",
        object: "organization",
        updated_at: workosFixtureTime,
      }
    );
    await projectWorkosFixture(
      t,
      "organization_membership.created",
      "authz_test_membership_second",
      {
        created_at: workosFixtureTime,
        directory_managed: false,
        id: "om_lender_second",
        object: "organization_membership",
        organization_id: "org_lender_second",
        role: { slug: "broker" },
        roles: [{ slug: "broker" }],
        status: "active",
        updated_at: workosFixtureTime,
        user_id: workosUserId,
      }
    );
  }

  return await t.run(async (ctx) => {
    if (options.duplicateUserProjection) {
      // Corruption-only fixture: canonical webhook ingestion deduplicates this
      // state, so inject it explicitly to prove the authorization boundary
      // rejects an already-malformed projection.
      await ctx.db.insert("users", {
        authId: `${workosUserId}_duplicate`,
        email: "duplicate-lender@example.com",
        name: "Duplicate Lender User",
        status: "active",
        workosUserId,
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
    if (options.duplicateBrokerage) {
      await ctx.db.insert("brokerages", {
        createdAt: 1,
        displayName: "Duplicate Lender Organization",
        legalName: "Duplicate Lender Organization",
        status: "active",
        updatedAt: 1,
        workosOrganizationId,
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
      lender.query(internal.authzTest.requireLenderOrganizationQuery, args)
    ).resolves.toMatchObject({
      brokerageId: fixture.brokerageId,
      membershipIds: ["om_lender"],
      roles: ["admin"],
      workosOrganizationId: fixture.workosOrganizationId,
      workosUserId: fixture.workosUserId,
    });
    await expect(
      lender.mutation(internal.authzTest.requireLenderOrganizationMutation, args)
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
        internal.authzTest.requireLenderOrganizationQuery,
        {}
      )
    ).resolves.toMatchObject({
      roles: ["broker"],
      workosOrganizationId: fixture.workosOrganizationId,
    });
    await expect(
      asLender(t, undefined).query(
        internal.authzTest.requireLenderOrganizationQuery,
        {}
      )
    ).rejects.toThrow(/active organization context ambiguous/);
  });

  test("resolves one unambiguous membership without an organization claim and rejects a missing context", async () => {
    const t = convexTest(schema, modules);
    await seedLenderAuthorization(t, { roleSlugs: ["broker"] });
    await expect(
      asLender(t, undefined).query(
        internal.authzTest.requireLenderOrganizationQuery,
        {}
      )
    ).resolves.toMatchObject({
      roles: ["broker"],
      workosOrganizationId: "org_lender",
    });

    const missing = convexTest(schema, modules);
    await projectWorkosFixture(missing, "user.created", "missing_context_user", {
      created_at: workosFixtureTime,
      email: "lender@example.com",
      email_verified: true,
      first_name: "Lender",
      id: "user_lender",
      last_name: "User",
      updated_at: workosFixtureTime,
    });
    await expect(
      asLender(missing, undefined).query(
        internal.authzTest.requireLenderOrganizationQuery,
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
      expected: /active user projection ambiguous/,
      identityOrganizationId: "org_lender",
      options: { duplicateUserProjection: true },
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
      expected: /lender tenant ambiguous/,
      identityOrganizationId: "org_lender",
      options: { duplicateBrokerage: true },
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
          internal.authzTest.requireLenderOrganizationQuery,
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
      lender.query(internal.authzTest.requireLenderOrganizationQuery, {
        organizationId: "org_foreign",
      })
    ).rejects.toThrow(/organization resource/);
    await expect(
      lender.query(internal.authzTest.requireLenderOrganizationQuery, {
        brokerageId: fixture.foreignBrokerageId,
      })
    ).rejects.toThrow(/tenant resource/);
    await expect(
      lender.query(internal.authzTest.requireLenderOrganizationQuery, {
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
          internal.authzTest.requireLenderUserManagement,
          {}
        )
      ).resolves.toMatchObject({ roles: [role] });
    }

    const brokerTest = convexTest(schema, modules);
    await seedLenderAuthorization(brokerTest, { roleSlugs: ["broker"] });
    await expect(
      asLender(brokerTest, "org_lender", ["admin"]).mutation(
        internal.authzTest.requireLenderUserManagement,
        {}
      )
    ).rejects.toThrow(/Forbidden: lenderUserManagementWrite/);
  });
});
