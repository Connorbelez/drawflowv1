/// <reference types="vite/client" />

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "./fairLendConfig";
import schema from "./schema";
import { LENDER_MEMBERSHIP_CONSUMER_HANDOFFS } from "./workosProjection";

const modules = import.meta.glob("./**/*.ts");

const sampleEvents = loadPayloadEvents();

describe("WorkOS webhook projections", () => {
  test("processes every payload-file event plus user lifecycle events into projections and receipts", async () => {
    const t = convexTest(schema, modules);
    const events = [
      ...sampleEvents.map((event, index) => ({
        ...event,
        id: `${event.id}_${index}`,
      })),
      userEvent("user.created", "user_created"),
      userEvent("user.updated", "user_updated"),
      userEvent("user.deleted", "user_deleted"),
    ];

    for (const event of events) {
      await t.mutation(internal.auth.authKitEvent, {
        data: event,
        event: event.event,
      });
    }

    const authed = asAdmin(t);
    const status = await authed.query(api.workosProjection.listSyncStatus, {});
    expect(status.receipts).toHaveLength(events.length);
    expect(status.receipts.every((row: any) => row.status === "processed")).toBe(
      true
    );

    const projections = await authed.query(api.workosProjection.listUserManagement, {});
    expect(projections.users.some((row: any) => row.workosUserId === "user_fixture")).toBe(
      true
    );
    expect(projections.organizations).toHaveLength(1);
    expect(projections.memberships).toHaveLength(1);
    expect(projections.roles.some((row: any) => row.slug === "member")).toBe(true);
    expect(projections.organizationRoles.some((row: any) => row.slug === "admin")).toBe(
      true
    );
    expect(projections.permissions.some((row: any) => row.slug === "users:read")).toBe(
      true
    );
  });

  test("projects AuthKit camelCase membership payloads", async () => {
    const t = convexTest(schema, modules);
    const membershipId = "om_01KSKFM9DYQN8FBZ12Y734QEZA";
    const event = {
      event: "organization_membership.created",
      data: {
        id: membershipId,
        object: "organization_membership",
        organizationId: "org_01EHWNCE74X7JSDV0X3SZ3KJNY",
        userId: "user_01EHWNC0FCBHZ3BJ7EGKYXK0E6",
        status: "active",
        createdAt: "2023-11-27T19:07:33.155Z",
        updatedAt: "2023-11-27T19:07:33.155Z",
        role: { slug: "member" },
        roles: [{ slug: "member" }],
        directoryManaged: false,
      },
    };

    await t.mutation(internal.auth.authKitEvent, event);

    const projections = await asAdmin(t).query(
      api.workosProjection.listUserManagement,
      {}
    );
    expect(projections.memberships).toHaveLength(1);
    expect(projections.memberships[0]).toMatchObject({
      workosMembershipId: membershipId,
      workosOrganizationId: "org_01EHWNCE74X7JSDV0X3SZ3KJNY",
      workosUserId: "user_01EHWNC0FCBHZ3BJ7EGKYXK0E6",
      status: "active",
      roleSlug: "member",
      roleSlugs: ["member"],
    });
  });

  test("moves a matching contractor invitation into confirmation after WorkOS acceptance", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const seeded = await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        authId: "auth_invited_contractor",
        email: "invited.contractor@example.com",
        name: "Invited Contractor",
        status: "active",
        workosUserId: "user_invited_contractor",
      });
      const brokerageId = await ctx.db.insert("brokerages", {
        createdAt: now,
        displayName: "Invitation Brokerage",
        legalName: "Invitation Brokerage LLC",
        status: "active",
        updatedAt: now,
        workosOrganizationId: "org_invitation",
      });
      const contractorId = await ctx.db.insert("contractorProfiles", {
        brokerageId,
        createdAt: now,
        email: "invited.contractor@example.com",
        name: "Invitation Trade Co",
        normalizedEmail: "invited.contractor@example.com",
        organizationId: "org_invitation",
        status: "active",
        trades: ["masonry"],
        updatedAt: now,
      });
      const claimId = await ctx.db.insert("contractorInviteClaims", {
        brokerageId,
        contractorId,
        createdAt: now,
        invitedNormalizedEmail: "invited.contractor@example.com",
        inviterWorkosUserId: "user_builder",
        organizationId: "org_invitation",
        state: "invited",
        updatedAt: now,
      });
      return { claimId };
    });

    await t.mutation(internal.auth.authKitEvent, {
      event: "organization_membership.created",
      data: {
        id: "om_invited_contractor",
        object: "organization_membership",
        organizationId: "org_invitation",
        userId: "user_invited_contractor",
        status: "active",
        role: { slug: "contractor" },
        roles: [{ slug: "contractor" }],
      },
    });

    const result = await t.run(async (ctx) => {
      const claim = await ctx.db.get(seeded.claimId);
      const audits = (await ctx.db.query("auditEvents").collect()).filter(
        (event) => event.eventType === "contractor.invite.accepted",
      );
      return { audits, claim };
    });
    expect(result.claim).toMatchObject({
      acceptedWorkosUserId: "user_invited_contractor",
      state: "accepted_pending_confirmation",
    });
    expect(result.audits).toHaveLength(1);
  });

  test("preserves pending memberships and aggregates multi-role memberships", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.auth.authKitEvent, {
      data: userEvent("user.created", "user_multi_role"),
      event: "user.created",
    });
    await t.mutation(internal.auth.authKitEvent, {
      data: {
        id: "membership_pending",
        event: "organization_membership.created",
        data: {
          id: "om_pending",
          object: "organization_membership",
          organizationId: "org_fixture",
          userId: "user_fixture",
          status: "pending",
          createdAt: "2023-11-27T19:07:33.155Z",
          updatedAt: "2023-11-27T19:07:33.155Z",
          role: { slug: "builder" },
          roles: [{ slug: "builder" }, { slug: "contractor" }],
          directoryManaged: false,
        },
      },
      event: "organization_membership.created",
    });
    await t.mutation(internal.auth.authKitEvent, {
      data: {
        id: "membership_active",
        event: "organization_membership.created",
        data: {
          id: "om_active",
          object: "organization_membership",
          organizationId: "org_fixture",
          userId: "user_fixture",
          status: "active",
          createdAt: "2023-11-27T19:07:33.155Z",
          updatedAt: "2023-11-27T19:07:33.155Z",
          role: { slug: "admin" },
          roles: [{ slug: "admin" }, { slug: "broker" }],
          directoryManaged: false,
        },
      },
      event: "organization_membership.created",
    });

    const projections = await asAdmin(t).query(
      api.workosProjection.listUserManagement,
      {}
    );
    expect(
      projections.memberships.find(
        (membership: any) => membership.workosMembershipId === "om_pending"
      )
    ).toMatchObject({
      roleSlug: "builder",
      roleSlugs: ["builder", "contractor"],
      status: "pending",
    });
    expect(projections.users[0]).toMatchObject({
      roleSlugs: ["admin", "broker"],
      roles: "admin, broker",
    });
  });

  test("lists only the current user's active organizations with role labels", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("workosOrganizations", {
        domains: [],
        name: "FairLend",
        sourceEventId: "seed_org_fairlend",
        sourceEventType: "organization.created",
        status: "active",
        workosOrganizationId: "org_fairlend",
      });
      await ctx.db.insert("workosOrganizations", {
        domains: [],
        name: "Oakline Builds",
        sourceEventId: "seed_org_oakline",
        sourceEventType: "organization.created",
        status: "active",
        workosOrganizationId: "org_oakline",
      });
      await ctx.db.insert("workosOrganizations", {
        domains: [],
        name: "Deleted Org",
        sourceEventId: "seed_org_deleted",
        sourceEventType: "organization.created",
        status: "deleted",
        workosOrganizationId: "org_deleted",
      });
      await ctx.db.insert("workosOrganizations", {
        domains: [],
        name: "FairLend",
        sourceEventId: "seed_org_fairlend_duplicate",
        sourceEventType: "seed.production_foundation",
        status: "active",
        workosOrganizationId: "org_fairlend_seed_duplicate",
      });
      await ctx.db.insert("workosOrganizationRoles", {
        name: "Principal Broker",
        permissionSlugs: [],
        slug: "principle-broker",
        sourceEventId: "seed_role_principal",
        sourceEventType: "organization_role.created",
        status: "active",
        workosOrganizationId: "org_fairlend",
      });
      await ctx.db.insert("workosOrganizationRoles", {
        name: "Builder",
        permissionSlugs: [],
        slug: "builder",
        sourceEventId: "seed_role_builder",
        sourceEventType: "organization_role.created",
        status: "active",
        workosOrganizationId: "org_oakline",
      });
      await ctx.db.insert("workosOrganizationRoles", {
        name: "Broker",
        permissionSlugs: [],
        slug: "broker",
        sourceEventId: "seed_role_broker",
        sourceEventType: "organization_role.created",
        status: "active",
        workosOrganizationId: "org_fairlend",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "principle-broker",
        roleSlugs: ["principle-broker"],
        sourceEventId: "seed_membership_fairlend",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_fairlend",
        workosOrganizationId: "org_fairlend",
        workosUserId: "user_builder",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "broker",
        roleSlugs: ["broker"],
        sourceEventId: "seed_membership_fairlend_duplicate",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_fairlend_duplicate",
        workosOrganizationId: "org_fairlend",
        workosUserId: "user_builder",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "builder",
        roleSlugs: ["builder"],
        sourceEventId: "seed_membership_oakline",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_oakline",
        workosOrganizationId: "org_oakline",
        workosUserId: "user_builder",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "admin",
        roleSlugs: ["admin"],
        sourceEventId: "seed_membership_fairlend_seed_duplicate",
        sourceEventType: "seed.production_foundation",
        status: "active",
        workosMembershipId: "om_fairlend_seed_duplicate",
        workosOrganizationId: "org_fairlend_seed_duplicate",
        workosUserId: "user_builder",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "admin",
        roleSlugs: ["admin"],
        sourceEventId: "seed_membership_pending",
        sourceEventType: "organization_membership.created",
        status: "pending",
        workosMembershipId: "om_pending",
        workosOrganizationId: "org_pending",
        workosUserId: "user_builder",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "admin",
        roleSlugs: ["admin"],
        sourceEventId: "seed_membership_deleted",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_deleted",
        workosOrganizationId: "org_deleted",
        workosUserId: "user_builder",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "admin",
        roleSlugs: ["admin"],
        sourceEventId: "seed_membership_other",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_other",
        workosOrganizationId: "org_fairlend",
        workosUserId: "user_other",
      });
      await ctx.db.insert("workosOrganizations", {
        domains: [],
        name: "Shared Lender Identity",
        sourceEventId: "seed_shared_lender_identity",
        sourceEventType: "organization.created",
        status: "active",
        workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "lender-admin",
        roleSlugs: ["lender-admin"],
        sourceEventId: "seed_shared_lender_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_shared_lender",
        workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        workosUserId: "user_builder",
      });
      const brokerageId = await ctx.db.insert("brokerages", {
        createdAt: 1,
        displayName: "FairLend",
        legalName: "FairLend",
        status: "active",
        updatedAt: 1,
        workosOrganizationId: "org_fairlend",
      });
      const lenderOrganizationId = await ctx.db.insert("lenderOrganizations", {
        brokerageId,
        createdAt: 1,
        displayName: "FairLend Lender Organization",
        legalName: "FairLend Lender Organization",
        permissions: {
          drawDecisions: true,
          milestoneDecisions: true,
          proposalReview: true,
          siteVisitReview: true,
        },
        status: "active",
        updatedAt: 1,
      });
      await ctx.db.insert("lenderOrganizationAssignments", {
        assignedAt: 1,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId,
        lenderOrganizationId,
        normalizedEmail: "builder@example.com",
        reason: "Lender organization context fixture.",
        status: "active",
        updatedAt: 1,
        workosUserId: "user_builder",
      });
    });

    await expect(
      asBuilder(t).query(api.workosProjection.listCurrentUserOrganizations, {})
    ).resolves.toEqual({
      organizations: [
        {
          membershipId: "om_fairlend",
          organizationName: "FairLend",
          roleNames: ["Principal Broker", "Broker"],
          roleSlug: "principle-broker",
          roleSlugs: ["principle-broker", "broker"],
          workosOrganizationId: "org_fairlend",
        },
        {
          membershipId: "om_oakline",
          organizationName: "Oakline Builds",
          roleNames: ["Builder"],
          roleSlug: "builder",
          roleSlugs: ["builder"],
          workosOrganizationId: "org_oakline",
        },
        {
          membershipId: "om_shared_lender",
          organizationName: "Shared Lender Identity",
          roleNames: ["Lender Admin"],
          roleSlug: "lender-admin",
          roleSlugs: ["lender-admin"],
          workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        },
      ],
    });
    await t.mutation(internal.workosProjection.ingestWorkosEvent, {
      created_at: "2023-11-27T19:07:33.155Z",
      data: {
        created_at: "2023-11-27T19:07:33.155Z",
        email: "builder@example.com",
        email_verified: true,
        first_name: "Builder",
        id: "user_builder",
        last_name: "User",
        updated_at: "2023-11-27T19:07:33.155Z",
      },
      event: "user.created",
      id: "seed_user_builder",
    });
    await expect(
      asLenderMember(t, {
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        roles: ["lender-admin"],
        subject: "user_builder",
      }).query(
        api.workosProjection.getActiveLenderOrganizationContext,
        {}
      )
    ).resolves.toMatchObject({
      membershipIds: ["om_shared_lender"],
      lenderOrganizationId: expect.any(String),
      organizationName: "FairLend Lender Organization",
      roles: ["lender-admin"],
      workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      workosUserId: "user_builder",
    });
  });

  test("scopes tenant-facing user-management projections to the viewer's active organization", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("workosOrganizations", {
        domains: [],
        name: "FairLend",
        sourceEventId: "seed_scope_org_fixture",
        sourceEventType: "organization.created",
        status: "active",
        workosOrganizationId: "org_fixture",
      });
      await ctx.db.insert("workosOrganizations", {
        domains: [],
        name: "Foreign Org",
        sourceEventId: "seed_scope_org_foreign",
        sourceEventType: "organization.created",
        status: "active",
        workosOrganizationId: "org_foreign",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "broker",
        roleSlugs: ["broker"],
        sourceEventId: "seed_scope_membership_viewer",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_scope_viewer",
        workosOrganizationId: "org_fixture",
        workosUserId: "user_broker",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "builder",
        roleSlugs: ["builder"],
        sourceEventId: "seed_scope_membership_foreign",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_scope_foreign",
        workosOrganizationId: "org_foreign",
        workosUserId: "user_foreign",
      });
    });

    const projections = await asBroker(t).query(api.workosProjection.listUserManagement, {});

    expect(
      projections.organizations.map((row: any) => row.workosOrganizationId),
    ).toEqual(["org_fixture"]);
    expect(
      projections.memberships.map((row: any) => row.workosOrganizationId),
    ).toEqual(["org_fixture"]);
  });

  test("skips duplicate WorkOS event ids without mutating projection timestamps twice", async () => {
    const t = convexTest(schema, modules);
    const event = userEvent("user.created", "event_duplicate");

    await t.mutation(internal.auth.authKitEvent, { data: event, event: event.event });
    await t.mutation(internal.auth.authKitEvent, { data: event, event: event.event });

    const authed = asAdmin(t);
    const status = await authed.query(api.workosProjection.listSyncStatus, {});
    const projections = await authed.query(api.workosProjection.listUserManagement, {});

    expect(status.receipts).toHaveLength(1);
    expect(status.receipts[0]).toMatchObject({ eventId: "event_duplicate" });
    expect(projections.users).toHaveLength(1);
  });

  test("records non-projection WorkOS events without blocking webhook delivery", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.auth.authKitEvent, {
      event: "session.created",
      data: {
        id: "session_fixture",
        userId: "user_fixture",
        createdAt: "2023-11-27T19:07:33.155Z",
        updatedAt: "2023-11-27T19:07:33.155Z",
      },
    });
    await t.mutation(internal.auth.authKitEvent, {
      event: "organization_domain.created",
      data: {
        id: "domain_fixture",
        organizationId: "org_fixture",
        domain: "example.com",
        createdAt: "2023-11-27T19:07:33.155Z",
        updatedAt: "2023-11-27T19:07:33.155Z",
      },
    });

    const status = await asAdmin(t).query(api.workosProjection.listSyncStatus, {});
    expect(status.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: "organization_domain.created:domain_fixture",
          eventType: "organization_domain.created",
          status: "processed",
        }),
        expect.objectContaining({
          eventId: "session.created:session_fixture",
          eventType: "session.created",
          status: "processed",
        }),
      ])
    );
  });

  test("requires backoffice authorization to list sync receipts", async () => {
    const t = convexTest(schema, modules);

    await expect(
      asBuilder(t).query(api.workosProjection.listSyncStatus, {})
    ).rejects.toThrow(/Forbidden: backoffice/);
  });

  test("ingests a full WorkOS event contract for internal sync callers", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.workosProjection.ingestWorkosEvent, {
      id: "sync_contract_org",
      event: "organization.created",
      created_at: "2023-11-27T19:07:33.155Z",
      data: {
        id: "org_sync_contract",
        name: "Sync Contract Org",
        domains: [],
        createdAt: "2023-11-27T19:07:33.155Z",
        updatedAt: "2023-11-27T19:07:33.155Z",
      },
    });

    const projections = await asAdmin(t).query(
      api.workosProjection.listUserManagement,
      {}
    );
    expect(projections.organizations).toEqual([
      expect.objectContaining({
        name: "Sync Contract Org",
        sourceEventId: "sync_contract_org",
        workosOrganizationId: "org_sync_contract",
      }),
    ]);
  });

  test("soft-deletes user, organization, membership, role, organization role, and permission projections", async () => {
    const t = convexTest(schema, modules);
    const createEvents = [
      userEvent("user.created", "user_create"),
      payload("organization.created"),
      payload("organization_membership.created"),
      payload("role.created"),
      payload("organization_role.created"),
      payload("permission.created"),
    ];
    const deleteEvents = [
      userEvent("user.deleted", "user_delete"),
      payload("organization.deleted"),
      payload("organization_membership.deleted"),
      payload("role.deleted"),
      payload("organization_role.deleted"),
      payload("permission.deleted"),
    ].map((event, index) => ({ ...event, id: `${event.id}_delete_${index}` }));

    for (const event of [...createEvents, ...deleteEvents]) {
      await t.mutation(internal.auth.authKitEvent, {
        data: event,
        event: event.event,
      });
    }

    const projections = await asAdmin(t).query(
      api.workosProjection.listUserManagement,
      {}
    );
    expect(projections.users[0]).toMatchObject({ status: "deleted" });
    expect(projections.organizations[0]).toMatchObject({ status: "deleted" });
    expect(projections.memberships[0]).toMatchObject({ status: "deleted" });
    expect(projections.roles[0]).toMatchObject({ status: "deleted" });
    expect(projections.organizationRoles[0]).toMatchObject({ status: "deleted" });
    expect(projections.permissions[0]).toMatchObject({ status: "deleted" });
    expect(projections.users[0].deletedAt).toBeTypeOf("number");
  });

  test("preserves existing projection fields on sparse update and delete events", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.auth.authKitEvent, {
      data: payload("organization.created"),
      event: "organization.created",
    });
    await t.mutation(internal.auth.authKitEvent, {
      data: payload("organization_membership.created"),
      event: "organization_membership.created",
    });
    await t.mutation(internal.workosProjection.ingestWorkosEvent, {
      id: "sparse_org_update",
      event: "organization.updated",
      created_at: "2023-11-28T19:07:33.155Z",
      data: {
        id: payload("organization.created").data.id,
      },
    });
    await t.mutation(internal.workosProjection.ingestWorkosEvent, {
      id: "sparse_membership_delete",
      event: "organization_membership.deleted",
      created_at: "2023-11-28T19:07:33.155Z",
      data: {
        id: payload("organization_membership.created").data.id,
      },
    });

    const projections = await asAdmin(t).query(
      api.workosProjection.listUserManagement,
      {}
    );
    expect(projections.organizations[0]).toMatchObject({
      domains: payload("organization.created").data.domains,
      name: payload("organization.created").data.name,
      sourceEventId: "sparse_org_update",
      status: "active",
    });
    expect(projections.memberships[0]).toMatchObject({
      roleSlug: payload("organization_membership.created").data.role.slug,
      roleSlugs: [payload("organization_membership.created").data.role.slug],
      sourceEventId: "sparse_membership_delete",
      status: "deleted",
      workosOrganizationId:
        payload("organization_membership.created").data.organization_id,
      workosUserId: payload("organization_membership.created").data.user_id,
    });
  });

  test("rebuilds the lender membership-effect read model from canonical projection state", async () => {
    const t = convexTest(schema, modules);
    const organizationId = FAIRLEND_WORKOS_ORGANIZATION_ID;

    await t.mutation(internal.workosProjection.ingestWorkosEvent, {
      data: {
        domains: [],
        id: organizationId,
        name: "Northstar Lending",
      },
      event: "organization.created",
      id: "effects_org_created",
    });
    for (const user of [
      { email: "principal@example.com", id: "user_principal", name: "Principal Broker" },
      { email: "broker@example.com", id: "user_effects_broker", name: "Broker User" },
      { email: "pending@example.com", id: "user_pending", name: "Pending User" },
      { email: "foreign@example.com", id: "user_foreign_effects", name: "Foreign User" },
    ]) {
      await t.mutation(internal.workosProjection.ingestWorkosEvent, {
        data: {
          email: user.email,
          firstName: user.name,
          id: user.id,
        },
        event: "user.created",
        id: `effects_${user.id}_created`,
      });
    }
    await t.mutation(internal.workosProjection.ingestWorkosEvent, {
      data: {
        domains: [],
        id: "org_foreign_effects",
        name: "Foreign Lending",
      },
      event: "organization.created",
      id: "effects_foreign_org_created",
    });
    for (const membership of [
      {
        id: "om_principal_effects",
        organizationId,
        role: "lender-admin",
        status: "active",
        userId: "user_principal",
      },
      {
        id: "om_broker_effects",
        organizationId,
        role: "lender",
        status: "active",
        userId: "user_effects_broker",
      },
      {
        id: "om_pending_effects",
        organizationId,
        role: "lender-staff",
        status: "pending",
        userId: "user_pending",
      },
      {
        id: "om_foreign_effects",
        organizationId: "org_foreign_effects",
        role: "admin",
        status: "active",
        userId: "user_foreign_effects",
      },
    ]) {
      await t.mutation(internal.workosProjection.ingestWorkosEvent, {
        data: {
          id: membership.id,
          organizationId: membership.organizationId,
          role: { slug: membership.role },
          roles: [{ slug: membership.role }],
          status: membership.status,
          userId: membership.userId,
        },
        event: "organization_membership.created",
        id: `effects_${membership.id}_created`,
      });
    }
    await t.run(async (ctx) => {
      const brokerageId = await ctx.db.insert("brokerages", {
        createdAt: 1,
        displayName: "Northstar Lending",
        legalName: "Northstar Lending",
        principalBrokerWorkosUserId: "user_principal",
        status: "active",
        updatedAt: 1,
        workosOrganizationId: organizationId,
      });
      const lenderOrganizationId = await ctx.db.insert("lenderOrganizations", {
        brokerageId,
        createdAt: 1,
        displayName: "Northstar Lender Organization",
        legalName: "Northstar Lender Organization",
        permissions: {
          drawDecisions: true,
          milestoneDecisions: true,
          proposalReview: true,
          siteVisitReview: true,
        },
        status: "active",
        updatedAt: 1,
      });
      await ctx.db.insert("lenderOrganizationAssignments", {
        assignedAt: 1,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId,
        lenderOrganizationId,
        normalizedEmail: "principal@example.com",
        reason: "Membership-effect fixture assignment.",
        status: "active",
        updatedAt: 1,
        workosUserId: "user_principal",
      });
      await ctx.db.insert("auditEvents", {
        actorRoles: ["principle-broker"],
        actorWorkosUserId: "user_principal",
        brokerageId,
        command: "membership-history-fixture",
        createdAt: 2,
        entityId: "om_broker_effects",
        entityType: "organization-membership",
        eventType: "organization.membership.changed",
        organizationId,
        warnings: [],
      });
    });

    const principal = asLenderMember(t, {
      organizationId,
      roles: ["admin"],
      subject: "user_principal",
    });
    const first = await principal.query(
      api.workosProjection.getLenderOrganizationManagement,
      {}
    );
    expect(first.projectionVersion).toBe("lender-membership-effects-v1");
    expect(first.pageSummary).toEqual({
      active: 2,
      administrators: 1,
      pending: 1,
      principalBrokers: 1,
      removed: 0,
      total: 3,
      unsupported: 0,
    });
    expect(first.members.map((member: any) => member.membership.workosUserId)).not.toContain(
      "user_foreign_effects"
    );
    expect(first.history).toHaveLength(1);
    expect(LENDER_MEMBERSHIP_CONSUMER_HANDOFFS).toEqual([
      {
        consumer: "authorization-and-access",
        inputContract:
          "active organization id + canonical WorkOS membership status + canonical lender role slugs",
        owner: "Phase 1",
        state: "implemented",
      },
      {
        consumer: "collaboration-search-authority",
        inputContract:
          "canonical WorkOS membership id + organization id + user id + status + role slugs",
        owner: "Phase 1",
        state: "implemented",
      },
      {
        consumer: "proposal-assignment",
        inputContract:
          "active organization id + current canonical membership eligibility + persisted proposal assignment",
        owner: "Phase 2",
        state: "unavailable",
      },
      {
        consumer: "review-quorum-and-policy-eligibility",
        inputContract:
          "immutable review-policy snapshot + current canonical membership eligibility + persisted review assignment",
        owner: "Phase 4",
        state: "unavailable",
      },
      {
        consumer: "participant-queues-and-counts",
        inputContract:
          "canonical request or review-cycle state + current canonical membership eligibility",
        owner: "Phase 7",
        state: "unavailable",
      },
      {
        consumer: "transactional-recipients-and-notification-intent",
        inputContract:
          "durable domain event + resource and cycle scope + current canonical membership eligibility and access",
        owner: "Phase 8",
        state: "unavailable",
      },
      {
        consumer: "external-api-analytics-reporting-and-support",
        inputContract:
          "versioned external contract + canonical organization and membership identifiers",
        owner: "Phase 9",
        state: "unknown",
      },
    ]);
    await expect(
      asLenderMember(t, {
        organizationId,
        roles: ["lender"],
        subject: "user_effects_broker",
      }).query(api.workosProjection.getLenderOrganizationManagement, {})
    ).rejects.toThrow("Forbidden");

    const countsBeforeRepeat = await t.run(async (ctx) => ({
      audits: (await ctx.db.query("auditEvents").collect()).length,
      receipts: (await ctx.db.query("workosWebhookReceipts").collect()).length,
    }));
    expect(
      await principal.query(api.workosProjection.getLenderOrganizationManagement, {})
    ).toEqual(first);
    expect(
      await t.run(async (ctx) => ({
        audits: (await ctx.db.query("auditEvents").collect()).length,
        receipts: (await ctx.db.query("workosWebhookReceipts").collect()).length,
      }))
    ).toEqual(countsBeforeRepeat);

    await t.mutation(internal.workosProjection.ingestWorkosEvent, {
      data: {
        id: "om_broker_effects",
        organizationId,
        role: { slug: "lender" },
        roles: [{ slug: "lender" }],
        status: "inactive",
        userId: "user_effects_broker",
      },
      event: "organization_membership.updated",
      id: "effects_broker_deactivated",
    });
    const deactivated = await principal.query(
      api.workosProjection.getLenderOrganizationManagement,
      {}
    );
    expect(deactivated.pageSummary).toMatchObject({ active: 1, removed: 1 });
    expect(
      deactivated.members.find(
        (member: any) => member.membership.workosMembershipId === "om_broker_effects"
      )
    ).toMatchObject({ accessState: "removed", canManageMembers: false });
    expect(deactivated.history).toEqual(first.history);

    await t.mutation(internal.workosProjection.ingestWorkosEvent, {
      data: {
        id: "om_broker_effects",
        organizationId,
        role: { slug: "lender-admin" },
        roles: [{ slug: "lender-admin" }],
        status: "active",
        userId: "user_effects_broker",
      },
      event: "organization_membership.updated",
      id: "effects_broker_reactivated_as_admin",
    });
    const reactivated = await principal.query(
      api.workosProjection.getLenderOrganizationManagement,
      {}
    );
    expect(reactivated.pageSummary).toMatchObject({
      active: 2,
      administrators: 2,
      removed: 0,
    });
    expect(
      reactivated.members.find(
        (member: any) => member.membership.workosMembershipId === "om_broker_effects"
      )
    ).toMatchObject({
      accessState: "active",
      canManageMembers: true,
      roleSlugs: ["lender-admin"],
    });
  });
  test("paginates the lender directory without an organization-size failure", async () => {
    const t = convexTest(schema, modules);
    const organizationId = FAIRLEND_WORKOS_ORGANIZATION_ID;
    await t.mutation(internal.workosProjection.ingestWorkosEvent, {
      data: {
        domains: [],
        id: organizationId,
        name: "Paginated Lender",
        status: "active",
      },
      event: "organization.created",
      id: "paginated_lender_created",
    });
    await t.mutation(internal.workosProjection.ingestWorkosEvent, {
      data: {
        email: "principal@paginated-lender.test",
        firstName: "Principal",
        id: "user_paginated_0",
      },
      event: "user.created",
      id: "paginated_principal_created",
    });
    for (let index = 0; index < 101; index += 1) {
      const role = index === 0 ? "lender-admin" : "lender";
      await t.mutation(internal.workosProjection.ingestWorkosEvent, {
        data: {
          id: `om_paginated_${index}`,
          organizationId,
          role: { slug: role },
          roles: [{ slug: role }],
          status: "active",
          userId: `user_paginated_${index}`,
        },
        event: "organization_membership.created",
        id: `paginated_membership_${index}`,
      });
    }
    await t.run(async (ctx) => {
      const brokerageId = await ctx.db.insert("brokerages", {
        createdAt: 1,
        displayName: "Paginated Lender",
        legalName: "Paginated Lender",
        principalBrokerWorkosUserId: "user_paginated_0",
        status: "active",
        updatedAt: 1,
        workosOrganizationId: organizationId,
      });
      const lenderOrganizationId = await ctx.db.insert("lenderOrganizations", {
        brokerageId,
        createdAt: 1,
        displayName: "Paginated Lender Organization",
        legalName: "Paginated Lender Organization",
        permissions: {
          drawDecisions: true,
          milestoneDecisions: true,
          proposalReview: true,
          siteVisitReview: true,
        },
        status: "active",
        updatedAt: 1,
      });
      await ctx.db.insert("lenderOrganizationAssignments", {
        assignedAt: 1,
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId,
        lenderOrganizationId,
        normalizedEmail: "principal@paginated-lender.test",
        reason: "Pagination fixture assignment.",
        status: "active",
        updatedAt: 1,
        workosUserId: "user_paginated_0",
      });
    });

    const principal = asLenderMember(t, {
      organizationId,
      roles: ["admin"],
      subject: "user_paginated_0",
    });
    const firstPage = await principal.query(
      api.workosProjection.getLenderOrganizationManagement,
      { cursor: null }
    );
    expect(firstPage.members).toHaveLength(100);
    expect(firstPage.isDone).toBe(false);
    expect(firstPage.continueCursor).not.toBe("");

    const secondPage = await principal.query(
      api.workosProjection.getLenderOrganizationManagement,
      { cursor: firstPage.continueCursor }
    );
    expect(secondPage.members).toHaveLength(1);
    expect(secondPage.isDone).toBe(true);
    expect(
      new Set(
        [...firstPage.members, ...secondPage.members].map(
          (member) => member.membership.workosMembershipId
        )
      ).size
    ).toBe(101);
  });

});

function payload(type: string) {
  const event = sampleEvents.find((row) => row.event === type);
  if (!event) {
    throw new Error(`Missing payload fixture for ${type}`);
  }
  return event;
}

function loadPayloadEvents(): any[] {
  const filePath = fileURLToPath(new URL("../docs/payloads.json", import.meta.url));
  const text = readFileSync(filePath, "utf8");
  const payloads = JSON.parse(text);
  if (!Array.isArray(payloads)) {
    throw new Error("Expected docs/payloads.json to contain a JSON array");
  }
  return payloads;
}

function userEvent(event: "user.created" | "user.updated" | "user.deleted", id: string) {
  return {
    id,
    event,
    data: {
      id: "user_fixture",
      email: "fixture@example.com",
      firstName: "Fixture",
      lastName: "User",
      emailVerified: true,
      profilePictureUrl: null,
      createdAt: "2023-11-27T19:07:33.155Z",
      updatedAt: "2023-11-27T19:07:33.155Z",
    },
    created_at: "2023-11-27T19:07:33.155Z",
  };
}

function asAdmin(t: any) {
  return t.withIdentity({
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
    roles: ["admin"],
    subject: "user_admin",
    tokenIdentifier: "https://api.workos.com/|user_admin",
  } as any);
}

function asBuilder(t: any) {
  return t.withIdentity({
    email: "builder@example.com",
    name: "Builder",
    role: "builder",
    roles: ["builder"],
    subject: "user_builder",
    tokenIdentifier: "https://api.workos.com/|user_builder",
  } as any);
}

function asBuilderInOrganization(t: any, organizationId: string) {
  return t.withIdentity({
    email: "builder@example.com",
    name: "Builder",
    organizationId,
    role: "builder",
    roles: ["builder"],
    subject: "user_builder",
    tokenIdentifier: "https://api.workos.com/|user_builder",
  } as any);
}

function asBroker(t: any) {
  return t.withIdentity({
    email: "broker@example.com",
    name: "Broker",
    organizationId: "org_fixture",
    role: "broker",
    roles: ["broker"],
    subject: "user_broker",
    tokenIdentifier: "https://api.workos.com/|user_broker",
  } as any);
}

function asLenderMember(
  t: any,
  input: { organizationId: string; roles: string[]; subject: string }
) {
  return t.withIdentity({
    email: `${input.subject}@example.com`,
    name: input.subject,
    organizationId: input.organizationId,
    role: input.roles[0],
    roles: input.roles,
    subject: input.subject,
    tokenIdentifier: `https://api.workos.com/|${input.subject}`,
  } as any);
}
