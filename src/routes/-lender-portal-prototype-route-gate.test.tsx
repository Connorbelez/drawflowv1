// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";

const enforcePrototypeRouteGate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
  };
});

vi.mock("#/lib/lender-portal-prototype-route-gate.ts", () => ({
  enforceLenderPortalPrototypeRouteGate: enforcePrototypeRouteGate,
}));

import { Route as BackofficeRoute } from "./backoffice/route.tsx";
import { Route as BuilderRoute } from "./builder/route.tsx";
import { Route as LenderRoute } from "./lender/route.tsx";

type ParentRouteWithBeforeLoad = {
  beforeLoad?: (input: never) => unknown;
};

const routeCases = [
  {
    context: {
      organizationId: "org_brokerage",
      role: "principle-broker",
      roles: ["principle-broker"],
      userId: "user_backoffice",
    },
    pathname: "/backoffice/proposals/lender-assignment-prototype",
    route: BackofficeRoute as unknown as ParentRouteWithBeforeLoad,
  },
  {
    context: {
      organizationId: "org_builder",
      role: "builder",
      roles: ["builder"],
      userId: "user_builder",
    },
    pathname: "/builder/correction-resubmission-prototype",
    route: BuilderRoute as unknown as ParentRouteWithBeforeLoad,
  },
  {
    context: {
      organizationId: "org_lender",
      role: "lender",
      roles: ["lender"],
      userId: "user_lender",
    },
    pathname: "/lender/prototype",
    route: LenderRoute as unknown as ParentRouteWithBeforeLoad,
  },
] as const;

describe("Lender Portal prototype parent-route wiring", () => {
  beforeEach(() => {
    enforcePrototypeRouteGate.mockReset();
  });

  test.each(routeCases)(
    "$pathname crosses the production prototype gate before rendering",
    ({ context, pathname, route }) => {
      expect(
        route.beforeLoad?.({
          context,
          location: { pathname },
        } as never),
      ).toEqual({ status: "allowed" });
      expect(enforcePrototypeRouteGate).toHaveBeenCalledOnce();
      expect(enforcePrototypeRouteGate).toHaveBeenCalledWith(pathname);
    },
  );
});
