/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "./fairLendConfig";
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
  const workosOrganizationId = FAIRLEND_WORKOS_ORGANIZATION_ID;
  const workosUserId = "user_lender";
  const roleSlugs = options.roleSlugs ?? ["lender-admin"];

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
        role: { slug: "lender" },
        roles: [{ slug: "lender" }],
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
            workosOrganizationId: "org_lender_brokerage",
          });
    const lenderOrganizationId = brokerageId
      ? await ctx.db.insert("lenderOrganizations", {
          brokerageId,
          createdAt: 1,
          displayName: "Lender Organization",
          legalName: "Lender Organization",
          permissions: {
            drawDecisions: true,
            milestoneDecisions: true,
            proposalReview: true,
            siteVisitReview: true,
          },
          status: options.organizationStatus === "deleted" ? "inactive" : "active",
          updatedAt: 1,
        })
      : null;
    if (lenderOrganizationId && options.includeUser !== false) {
      await ctx.db.insert("lenderOrganizationAssignments", {
        assignedAt: 1,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId: brokerageId!,
        lenderOrganizationId,
        normalizedEmail: "lender@example.com",
        reason: "Authorization fixture assignment.",
        status: "active",
        updatedAt: 1,
        workosUserId,
      });
    }
    const foreignBrokerageId = await ctx.db.insert("brokerages", {
      createdAt: 1,
      displayName: "Foreign Lender",
      legalName: "Foreign Lender",
      status: "active",
      updatedAt: 1,
      workosOrganizationId: "org_foreign",
    });
    if (options.duplicateBrokerage) {
      const duplicateBrokerageId = await ctx.db.insert("brokerages", {
        createdAt: 1,
        displayName: "Duplicate Lender Organization",
        legalName: "Duplicate Lender Organization",
        status: "active",
        updatedAt: 1,
        workosOrganizationId: "org_lender_brokerage_duplicate",
      });
      const duplicateLenderOrganizationId = await ctx.db.insert("lenderOrganizations", {
        brokerageId: duplicateBrokerageId,
        createdAt: 1,
        displayName: "Duplicate Lender Organization",
        legalName: "Duplicate Lender Organization",
        permissions: {
          drawDecisions: true,
          milestoneDecisions: true,
          proposalReview: true,
          siteVisitReview: true,
        },
        status: "active",
        updatedAt: 1,
      });
      if (options.includeUser !== false) {
        await ctx.db.insert("lenderOrganizationAssignments", {
          assignedAt: 1,
          assignedByRole: "admin",
          assignedByWorkosUserId: "user_admin",
          brokerageId: duplicateBrokerageId,
          lenderOrganizationId: duplicateLenderOrganizationId,
          normalizedEmail: "lender@example.com",
          reason: "Ambiguous authorization fixture assignment.",
          status: "active",
          updatedAt: 1,
          workosUserId,
        });
      }
    }
    return {
      brokerageId,
      foreignBrokerageId,
      lenderOrganizationId,
      workosOrganizationId,
      workosUserId,
    };
  });
}

function asLender(
  t: ReturnType<typeof convexTest>,
  organizationId: string | undefined,
  roles: string[] = ["lender"]
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
    const lender = asLender(t, fixture.workosOrganizationId, ["admin"]);
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

  test("allows an active lender admin through a missing projected permission", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedLenderAuthorization(t, {
      roleSlugs: ["admin"],
    });

    await expect(
      asLender(t, fixture.workosOrganizationId, ["admin"]).query(
        internal.authzTest.requireLenderOrganizationQuery,
        { permission: "draw:release" }
      )
    ).resolves.toMatchObject({
      roles: ["admin"],
      workosOrganizationId: fixture.workosOrganizationId,
    });
  });

  test("elevates an authenticated admin over a non-lender projected membership", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedLenderAuthorization(t, {
      roleSlugs: ["builder"],
    });

    await expect(
      asLender(t, fixture.workosOrganizationId, ["admin"]).query(
        internal.authzTest.requireLenderOrganizationQuery,
        {}
      )
    ).resolves.toMatchObject({
      roles: ["admin"],
      workosOrganizationId: fixture.workosOrganizationId,
    });
  });

  test("preserves multi-organization membership and resolves the selected organization", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedLenderAuthorization(t, {
      extraActiveOrganization: true,
      roleSlugs: ["lender"],
    });

    await expect(
      asLender(t, fixture.workosOrganizationId).query(
        internal.authzTest.requireLenderOrganizationQuery,
        {}
      )
    ).resolves.toMatchObject({
      roles: ["lender"],
      workosOrganizationId: fixture.workosOrganizationId,
    });
    await expect(
      asLender(t, undefined).query(
        internal.authzTest.requireLenderOrganizationQuery,
        {}
      )
    ).resolves.toMatchObject({ lenderOrganizationId: fixture.lenderOrganizationId });
  });

  test("resolves one unambiguous membership without an organization claim and rejects a missing context", async () => {
    const t = convexTest(schema, modules);
    await seedLenderAuthorization(t, { roleSlugs: ["lender"] });
    await expect(
      asLender(t, undefined).query(
        internal.authzTest.requireLenderOrganizationQuery,
        {}
      )
    ).resolves.toMatchObject({
      roles: ["lender"],
      workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
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
    ).rejects.toThrow(/active shared lender membership missing/);
  });

  test.each([
    {
      expected: /active lender user projection missing/,
      identityOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      options: { includeUser: false },
    },
    {
      expected: /active lender user projection ambiguous/,
      identityOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      options: { duplicateUserProjection: true },
    },
    {
      expected: /active lender user projection/,
      identityOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      options: { userStatus: "deleted" as const },
    },
    {
      expected: /active shared lender membership missing/,
      identityOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      options: { membershipStatus: "inactive" as const },
    },
    {
      expected: /supported lender WorkOS role required/,
      identityOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      options: { roleSlugs: ["builder"] },
    },
    {
      expected: /inactive lender organization/,
      identityOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      options: { organizationStatus: "deleted" as const },
    },
    {
      expected: /active lender organization assignment missing/,
      identityOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      options: { includeBrokerage: false },
    },
    {
      expected: /lender organization assignment ambiguous/,
      identityOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      options: { duplicateBrokerage: true },
    },
    {
      expected: /inactive lender brokerage/,
      identityOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      options: { brokerageStatus: "inactive" as const },
    },
    {
      expected: /foreign shared lender organization context/,
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
      roleSlugs: ["lender"],
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

  test("limits lender-local user management to projected administrators while honoring the admin superuser", async () => {
    for (const role of ["admin"] as const) {
      const t = convexTest(schema, modules);
      await seedLenderAuthorization(t, { roleSlugs: [role] });
      await expect(
        asLender(t, FAIRLEND_WORKOS_ORGANIZATION_ID, ["admin"]).mutation(
          internal.authzTest.requireLenderUserManagement,
          {}
        )
      ).resolves.toMatchObject({ roles: [role] });
    }

    const brokerTest = convexTest(schema, modules);
    await seedLenderAuthorization(brokerTest, { roleSlugs: ["lender"] });
    await expect(
      asLender(brokerTest, FAIRLEND_WORKOS_ORGANIZATION_ID, ["lender"]).mutation(
        internal.authzTest.requireLenderUserManagement,
        {}
      )
    ).rejects.toThrow(/Forbidden: lenderUserManagementWrite/);

    await expect(
      asLender(brokerTest, FAIRLEND_WORKOS_ORGANIZATION_ID, ["admin"]).mutation(
        internal.authzTest.requireLenderUserManagement,
        {}
      )
    ).resolves.toMatchObject({ roles: ["admin", "lender"] });
  });
});
