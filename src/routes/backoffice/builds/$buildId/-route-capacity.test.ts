import { describe, expect, test } from "vitest";

import { resolveBackofficeBuildViewerCapacity } from "./-route-capacity.ts";

describe("backoffice Build viewer capacity", () => {
  test("selects the highest backoffice capacity from a dual-role identity", () => {
    expect(
      resolveBackofficeBuildViewerCapacity(["builder", "broker-staff", "admin"]),
    ).toBe("admin");
    expect(
      resolveBackofficeBuildViewerCapacity(["builder", "broker-staff"]),
    ).toBe("broker-staff");
  });

  test("does not invent a lender capacity for builder-only identities", () => {
    expect(resolveBackofficeBuildViewerCapacity(["builder", "builder-staff"])).toBe(
      undefined,
    );
    expect(resolveBackofficeBuildViewerCapacity([])).toBeUndefined();
  });

  test("normalizes principal-broker aliases before selecting capacity", () => {
    expect(resolveBackofficeBuildViewerCapacity(["principal-broker"])).toBe(
      "principle-broker",
    );
  });
});
