import { describe, expect, test } from "vitest";

import { selectActiveBuildAuthorizationCapacity } from "./activeBuildAccess";

describe("active Build authorization capacity selection", () => {
  test("narrows both the effective role and downstream role set", () => {
    const authorization = {
      effectiveRole: { role: "builder", tier: 70 },
      roles: ["builder", "homeowner"],
    } as unknown as Parameters<
      typeof selectActiveBuildAuthorizationCapacity
    >[0];

    const selected = selectActiveBuildAuthorizationCapacity(
      authorization,
      "homeowner"
    );

    expect(selected.effectiveRole).toEqual({ role: "homeowner", tier: 2 });
    expect(selected.roles).toEqual(["homeowner"]);
    expect(authorization.roles).toEqual(["builder", "homeowner"]);
  });
});
