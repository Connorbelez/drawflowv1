import { describe, expect, test } from "vitest";

import { validateBuildCollaborationProductionProbeResults } from "./verify-build-collaboration-production";

const expected = { buildId: "build_123", organizationId: "org_123" };
const passing = [
  { name: "rollout", ok: true, value: { available: true, status: "active" } },
  { name: "certification", ok: true, value: { organizationId: "org_123", representativeBuildId: "build_123", tenant: { status: "active" } } },
  { name: "feed", ok: true, value: { isDone: true, page: [] } },
  { name: "tags", ok: true, value: [] },
  { name: "drafts", ok: true, value: [] },
  { name: "notificationPreferences", ok: true, value: { channels: ["in_app"], workosUserId: "user_123" } },
  { name: "crossTenantDenial", ok: false, error: "Forbidden: organization scope" },
];

describe("authenticated Build Collaboration production probes", () => {
  test("accepts positive handler contracts and a real authorization denial", () => {
    expect(validateBuildCollaborationProductionProbeResults(passing, expected)).toEqual([]);
  });

  test("rejects registration-only or wrong-scope responses", () => {
    const invalid = passing.map((result) => ({ ...result }));
    invalid[1] = { name: "certification", ok: true, value: { organizationId: "wrong", representativeBuildId: "build_123", tenant: { status: "active" } } };
    invalid[6] = { name: "crossTenantDenial", ok: true };
    expect(validateBuildCollaborationProductionProbeResults(invalid, expected)).toEqual(expect.arrayContaining([
      expect.stringContaining("wrong production scope"),
      expect.stringContaining("negative probe"),
    ]));
  });
});
