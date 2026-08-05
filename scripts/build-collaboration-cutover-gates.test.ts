import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  BUILD_COLLABORATION_CUTOVER_GATE_RUNNER,
  buildCollaborationCutoverGateArgv,
  isProductionConvexDeployment,
  serializeCommand,
} from "./build-collaboration-cutover-gates";
import { runBuildCollaborationCutoverGate } from "./run-build-collaboration-cutover-gate";
import { runBuildCollaborationCutoverEvidence } from "./run-build-collaboration-cutover-evidence";

const gitCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const context = {
  applicationUrl: "https://drawflow.example.com",
  applicationVersion: "release-2026-08-01",
  convexDeployment: "fairlend:drawflow:prod",
  convexUrl: "https://example.convex.cloud",
  forbiddenOrganizationId: "org_forbidden",
  gitCommit,
  organizationId: "org_fairlend",
  representativeBuildId: "build_123",
};

describe("Build Collaboration governed cutover gates", () => {
  test("binds the authenticated production probe to the exact release scope", () => {
    const argv = buildCollaborationCutoverGateArgv(
      "authenticatedProductionProbes",
      context
    );
    expect(serializeCommand(argv ?? [])).toContain(
      "--convex-deployment fairlend:drawflow:prod"
    );
    expect(serializeCommand(argv ?? [])).toContain(
      "--forbidden-organization-id org_forbidden"
    );
  });

  test("accepts only canonical production Convex deployment selectors", () => {
    expect(isProductionConvexDeployment("prod")).toBe(true);
    expect(isProductionConvexDeployment("fairlend:drawflow:prod")).toBe(true);
    expect(isProductionConvexDeployment("dev/example-drawflow")).toBe(false);
    expect(isProductionConvexDeployment("fairlend:drawflow:staging")).toBe(
      false
    );
    expect(isProductionConvexDeployment("example-production")).toBe(false);
    expect(
      serializeCommand(
        buildCollaborationCutoverGateArgv("deploymentRegistration", context) ??
          []
      )
    ).toContain(`--url ${context.convexUrl}`);
  });

  test("writes manual-review evidence only through the governed runner", () => {
    const directory = mkdtempSync(join(tmpdir(), "drawflow-gate-runner-"));
    const manifestPath = join(directory, "manifest.json");
    const evidencePath = join(directory, "visual.png");
    const outputPath = join(directory, "visual-review.json");
    writeFileSync(evidencePath, "browser evidence");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        forbiddenOrganizationId: context.forbiddenOrganizationId,
        organizationId: context.organizationId,
        release: {
          applicationUrl: context.applicationUrl,
          applicationVersion: context.applicationVersion,
          convexDeployment: context.convexDeployment,
          convexUrl: context.convexUrl,
          gitCommit,
        },
        representativeBuildId: context.representativeBuildId,
      })
    );
    runBuildCollaborationCutoverGate([
      "--gate",
      "visualReview",
      "--manifest",
      manifestPath,
      "--output",
      outputPath,
      "--reviewer-workos-user-id",
      "user_admin",
      "--evidence",
      evidencePath,
    ]);
    const artifact = JSON.parse(readFileSync(outputPath, "utf8"));
    expect(artifact).toMatchObject({
      commandName: "visualReview",
      exitCode: 0,
      gitHead: gitCommit,
      mode: "human_review",
      producer: "drawflow-build-collaboration-manual-review/v1",
      reviewerWorkosUserId: "user_admin",
      schemaVersion: "build-collaboration-command-evidence/v2",
    });
    expect(artifact.evidence[0].sha256).toHaveLength(64);

    const keyboardPath = join(directory, "keyboard-review.json");
    const interfacePath = join(directory, "interface.json");
    runBuildCollaborationCutoverGate([
      "--gate",
      "keyboardReview",
      "--manifest",
      manifestPath,
      "--output",
      keyboardPath,
      "--reviewer-workos-user-id",
      "user_admin",
      "--evidence",
      evidencePath,
    ]);
    runBuildCollaborationCutoverEvidence([
      "--kind",
      "interface",
      "--manifest",
      manifestPath,
      "--output",
      interfacePath,
      "--visual-evidence",
      outputPath,
      "--keyboard-evidence",
      keyboardPath,
    ]);
    expect(JSON.parse(readFileSync(interfacePath, "utf8"))).toMatchObject({
      buildOverviewUnchanged: true,
      canonicalTabsOwnContent: true,
      detailsIsDefault: true,
      legacyNotesRetired: true,
      producer: "drawflow-build-collaboration-interface-runner/v1",
      schemaVersion: "build-collaboration-interface-evidence/v2",
    });
  });

  test("uses the governed producer contract for automated gates", () => {
    expect(BUILD_COLLABORATION_CUTOVER_GATE_RUNNER).toBe(
      "drawflow-build-collaboration-cutover-gate/v1"
    );
    expect(
      serializeCommand(
        buildCollaborationCutoverGateArgv("fullTestSuite", context) ?? []
      )
    ).toBe("bun run test");
  });
});
