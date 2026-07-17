import { describe, expect, test } from "vitest";

import { resolveAccessDestination } from "./access-routing.ts";

describe("resolveAccessDestination", () => {
  test.each([
    { destination: "/backoffice", roles: ["admin"] },
    { destination: "/backoffice", roles: ["principal-broker"] },
    { destination: "/backoffice", roles: ["broker-staff", "builder"] },
    { destination: "/builder", roles: ["builder"] },
    { destination: "/builder-staff", roles: ["builder-staff"] },
    { destination: "/contractor", roles: ["contractor"] },
    { destination: "/contractor/onboarding", roles: ["member"] },
  ])("routes $roles to $destination", ({ destination, roles }) => {
    expect(resolveAccessDestination(roles)).toBe(destination);
  });

  test("keeps unauthenticated or unassigned visitors on the access portal", () => {
    expect(resolveAccessDestination([])).toBeNull();
    expect(resolveAccessDestination([null, undefined, "unknown-role"])).toBeNull();
  });
});
