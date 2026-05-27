/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function adminTest() {
  return convexTest(schema, modules).withIdentity({
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
    roles: ["admin"],
    subject: "user_admin",
    tokenIdentifier: "https://api.workos.com/|user_admin",
  } as any);
}

describe("WorkOS management actions", () => {
  test("uses fake adapters in tests and returns waiting-for-sync accepted results", async () => {
    const t = adminTest();

    await expect(
      t.action(api.workosManagement.inviteUser, {
        email: "new.builder@example.com",
        organizationId: "org_fixture",
        roleSlug: "builder",
      })
    ).resolves.toMatchObject({
      adapter: "fake",
      operation: "inviteUser",
      status: "accepted",
      sync: "waiting-for-webhook",
    });

    await expect(
      t.action(api.workosManagement.updateMembershipRole, {
        membershipId: "om_fixture",
        roleSlug: "broker",
      })
    ).resolves.toMatchObject({
      adapter: "fake",
      operation: "updateMembershipRole",
      status: "accepted",
    });
  });

  test("requires user-management write capability for WorkOS-owned writes", async () => {
    const t = convexTest(schema, modules).withIdentity({
      email: "builder@example.com",
      name: "Builder",
      role: "builder",
      roles: ["builder"],
      subject: "user_builder",
      tokenIdentifier: "https://api.workos.com/|user_builder",
    } as any);

    await expect(
      t.action(api.workosManagement.deactivateMembership, {
        membershipId: "om_fixture",
      })
    ).rejects.toThrow(/Forbidden: userManagementWrite/);
  });
});
