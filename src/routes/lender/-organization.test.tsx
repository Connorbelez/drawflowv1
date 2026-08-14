// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router"
  );
  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
    redirect: (options: unknown) => {
      throw options;
    },
  };
});

import { Route } from "./organization.tsx";

describe("lender organization route authorization", () => {
  test.each(["admin", "principle-broker"])(
    "allows an active-organization %s administrator",
    (role) => {
      expect(
        Route.beforeLoad?.({
          context: {
            organizationId: "org_lender",
            role,
            roles: [role],
            userId: "user_lender",
          },
          location: { pathname: "/lender/organization" },
        } as never)
      ).toEqual({ status: "allowed" });
    }
  );

  test.each([
    { organizationId: "org_lender", role: "broker", userId: "user_broker" },
    { organizationId: undefined, role: "admin", userId: "user_admin" },
    { organizationId: undefined, role: undefined, userId: undefined },
  ])("fails closed for non-administration context %#", (context) => {
    expect(() =>
      Route.beforeLoad?.({
        context: { ...context, roles: context.role ? [context.role] : [] },
        location: { pathname: "/lender/organization" },
      } as never)
    ).toThrow();
  });
});
