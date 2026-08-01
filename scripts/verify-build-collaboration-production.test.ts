import { describe, expect, test } from "vitest";

import { validateBuildCollaborationProductionProbeResults } from "./verify-build-collaboration-production";

const expected = {
  applicationUrl: "https://drawflow.example.com",
  applicationVersion: "deployment_123",
  buildId: "build_123",
  gitCommit: "a".repeat(40),
  organizationId: "org_123",
};
const passing = [
  { name: "rollout", ok: true, value: { available: true, status: "active" } },
  { name: "certification", ok: true, value: { organizationId: "org_123", representativeBuildId: "build_123", tenant: { status: "active" } } },
  { name: "feed", ok: true, value: { isDone: true, page: [] } },
  { name: "tags", ok: true, value: [] },
  { name: "drafts", ok: true, value: [] },
  { name: "notificationPreferences", ok: true, value: { channels: ["in_app"], workosUserId: "user_123" } },
  { name: "applicationRelease", ok: true, value: { applicationUrl: expected.applicationUrl, applicationVersion: expected.applicationVersion, gitCommit: expected.gitCommit } },
  { name: "crossTenantDenial", ok: false, error: "Forbidden: organization scope" },
];

describe("authenticated Build Collaboration production probes", () => {
  test("accepts positive handler contracts and a real authorization denial", () => {
    expect(validateBuildCollaborationProductionProbeResults(passing, expected)).toEqual([]);
  });

  test("rejects registration-only or wrong-scope responses", () => {
    const invalid = passing.map((result) => ({ ...result }));
    invalid[1] = { name: "certification", ok: true, value: { organizationId: "wrong", representativeBuildId: "build_123", tenant: { status: "active" } } };
    invalid[7] = { name: "crossTenantDenial", ok: true };
    expect(validateBuildCollaborationProductionProbeResults(invalid, expected)).toEqual(expect.arrayContaining([
      expect.stringContaining("wrong production scope"),
      expect.stringContaining("negative probe"),
    ]));
  });

  test("does not mistake an unrelated Build error for authorization denial", () => {
    const invalid = passing.map((result) => ({ ...result }));
    invalid[7] = {
      error: "Server Error: failed to load build records",
      name: "crossTenantDenial",
      ok: false,
    };
    expect(
      validateBuildCollaborationProductionProbeResults(invalid, expected)
    ).toEqual(
      expect.arrayContaining([expect.stringContaining("authorization handler")])
    );
  });
});
