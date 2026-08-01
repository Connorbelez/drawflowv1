import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { validateBuildCollaborationE2EFixture } from "./build-collaboration-cutover-fixture";

const roles = [
  "admin",
  "principle-broker",
  "broker",
  "builder",
  "broker-staff",
  "builder-staff",
  "homeowner",
  "contractor",
] as const;
const context = {
  applicationUrl: "https://drawflow.example.com",
  applicationVersion: "release-2026-08-01",
  convexDeployment: "fairlend:drawflow:prod",
  convexUrl: "https://example.convex.cloud",
  gitCommit: "0123456789abcdef0123456789abcdef01234567",
  organizationId: "org_fairlend",
  representativeBuildId: "build_123",
};

function fixture(overrides?: {
  duplicateStorage?: boolean;
  duplicateWorkosUser?: boolean;
}) {
  const directory = mkdtempSync(join(tmpdir(), "drawflow-e2e-fixture-"));
  const storagePaths = roles.map((role, index) => {
    const path = join(directory, `${role}.json`);
    writeFileSync(
      path,
      JSON.stringify({
        cookies: [
          {
            name: "session",
            value: overrides?.duplicateStorage ? "same" : `session-${index}`,
          },
        ],
        origins: [],
      })
    );
    return path;
  });
  const fixturePath = join(directory, "fixture.json");
  writeFileSync(
    fixturePath,
    JSON.stringify({
      applicationUrl: context.applicationUrl,
      buildId: context.representativeBuildId,
      organizationId: context.organizationId,
      personas: roles.map((role, index) => ({
        buildUrl: `${context.applicationUrl}/backoffice/builds/${context.representativeBuildId}`,
        role,
        storageState: storagePaths[index],
        workosUserId: overrides?.duplicateWorkosUser
          ? "user_same"
          : `user_${index}`,
      })),
    })
  );
  return fixturePath;
}

describe("Build Collaboration production E2E fixture", () => {
  test("accepts distinct authenticated identities and storage states", () => {
    expect(
      validateBuildCollaborationE2EFixture(context, fixture()).storageStates
    ).toHaveLength(roles.length);
  });

  test("rejects role labels bound to a duplicate WorkOS identity", () => {
    expect(() =>
      validateBuildCollaborationE2EFixture(
        context,
        fixture({ duplicateWorkosUser: true })
      )
    ).toThrow(/distinct WorkOS user/i);
  });

  test("rejects copied authentication storage states", () => {
    expect(() =>
      validateBuildCollaborationE2EFixture(
        context,
        fixture({ duplicateStorage: true })
      )
    ).toThrow(/distinct storage state/i);
  });
});
