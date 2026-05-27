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
