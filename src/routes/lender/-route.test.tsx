// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
    redirect: (options: unknown) => {
      throw options;
    },
  };
});

import { Route } from "./route.tsx";

describe("lender workspace route authorization", () => {
  test.each(["admin", "lender", "lender-admin", "lender-staff"])(
    "allows an authenticated, organization-scoped %s actor",
    (role) => {
      expect(
        Route.beforeLoad?.({
          context: {
            organizationId: "org_lender",
            role,
            roles: [role],
            userId: "user_lender",
          },
          location: { pathname: "/lender/draws" },
        } as never),
      ).toEqual({ status: "allowed" });
    },
  );

  test.each([
    {
      organizationId: "org_lender",
      role: "principle-broker",
      userId: "user_broker",
    },
    { organizationId: undefined, role: "lender", userId: "user_lender" },
    { organizationId: undefined, role: undefined, userId: undefined },
  ])("fails closed for unauthorized lender route context %#", (context) => {
    expect(() =>
      Route.beforeLoad?.({
        context: { ...context, roles: context.role ? [context.role] : [] },
        location: { pathname: "/lender/draws" },
      } as never),
    ).toThrow();
  });
});
