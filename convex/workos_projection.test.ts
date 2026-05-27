/// <reference types="vite/client" />

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

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
