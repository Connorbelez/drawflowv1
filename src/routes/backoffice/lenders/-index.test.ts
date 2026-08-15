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

import { Route } from "./route.tsx";

const routeConfig = Route as unknown as {
  beforeLoad?: (input: never) => unknown;
  staticData?: { breadcrumb?: unknown };
};

describe("Back Office lender control plane route", () => {
  test("allows Platform Admin and keeps the Lenders breadcrumb functional", () => {
    expect(
      routeConfig.beforeLoad?.({
        context: {
          organizationId: "org_shared",
          role: "admin",
          roles: ["admin"],
          userId: "user_admin",
        },
        location: { pathname: "/backoffice/lenders" },
      } as never)
    ).toEqual({ status: "allowed" });
    expect(routeConfig.staticData?.breadcrumb).toEqual({
      label: "Lenders",
      to: "/backoffice/lenders",
    });
  });

  test.each(["lender", "lender-admin", "lender-staff", "principle-broker"])(
    "denies non-Platform Admin role %s",
    (role) => {
      expect(() =>
        routeConfig.beforeLoad?.({
          context: {
            organizationId: "org_shared",
            role,
            roles: [role],
            userId: "user_lender",
          },
          location: { pathname: "/backoffice/lenders" },
        } as never)
      ).toThrow();
    }
  );
});
