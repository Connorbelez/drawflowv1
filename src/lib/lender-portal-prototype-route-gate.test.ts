import { isNotFound } from "@tanstack/react-router";
import { describe, expect, test } from "vitest";

import {
  enforceLenderPortalPrototypeRouteGate,
  isLenderPortalPrototypeRoute,
  LENDER_PORTAL_PROTOTYPE_ROUTE_PATHS,
} from "./lender-portal-prototype-route-gate.ts";

describe("Lender Portal prototype production route gate", () => {
  test.each(LENDER_PORTAL_PROTOTYPE_ROUTE_PATHS)(
    "fails closed for %s in production",
    (pathname) => {
      try {
        enforceLenderPortalPrototypeRouteGate(pathname, true);
        throw new Error("Expected the production prototype route to fail");
      } catch (error) {
        expect(isNotFound(error)).toBe(true);
      }
    },
  );

  test("normalizes a trailing slash before enforcing the gate", () => {
    expect(
      isLenderPortalPrototypeRoute("/lender/draws-prototype/"),
    ).toBe(true);
  });

  test.each(LENDER_PORTAL_PROTOTYPE_ROUTE_PATHS)(
    "retains frozen development reachability for %s",
    (pathname) => {
      expect(() =>
        enforceLenderPortalPrototypeRouteGate(pathname, false),
      ).not.toThrow();
    },
  );

  test.each([
    "/lender",
    "/lender/builds/build_123",
    "/lender/draws",
    "/lender/milestones",
    "/lender/organization",
    "/lender/proposals/proposal_123",
    "/backoffice/proposals/proposal_123",
    "/builder/proposals/proposal_123",
    "/prototype/action-items",
  ])("does not hide the supported or unrelated route %s", (pathname) => {
    expect(isLenderPortalPrototypeRoute(pathname)).toBe(false);
    expect(() =>
      enforceLenderPortalPrototypeRouteGate(pathname, true),
    ).not.toThrow();
  });
});
