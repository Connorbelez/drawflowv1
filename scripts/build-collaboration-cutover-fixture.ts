import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import type { BuildCollaborationCutoverGateContext } from "./build-collaboration-cutover-gates";

const ROLES = [
  "admin",
  "principle-broker",
  "broker",
  "builder",
  "broker-staff",
  "builder-staff",
  "homeowner",
  "contractor",
] as const;

interface FixturePersona {
  buildUrl: string;
  role: string;
  storageState: string;
  workosUserId: string;
}

interface CollaborationFixture {
  applicationUrl: string;
  buildId: string;
  organizationId: string;
  personas: FixturePersona[];
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readEvidenceFile(path: string) {
  const resolved = isAbsolute(path) ? path : resolve(path);
  if (!(existsSync(resolved) && statSync(resolved).isFile())) {
    throw new Error(`E2E fixture evidence does not exist: ${path}`);
  }
  const bytes = readFileSync(resolved);
  return { bytes, path: resolved, sha256: sha256(bytes) };
}

export function validateBuildCollaborationE2EFixture(
  context: BuildCollaborationCutoverGateContext,
  fixturePath = process.env.BUILD_COLLABORATION_E2E_FIXTURE
) {
  if (!fixturePath) {
    throw new Error(
      "BUILD_COLLABORATION_E2E_FIXTURE is required for production role journeys."
    );
  }
  const fixtureFile = readEvidenceFile(fixturePath);
  const fixture = JSON.parse(
    fixtureFile.bytes.toString("utf8")
  ) as CollaborationFixture;
  const applicationOrigin = new URL(context.applicationUrl).origin;
  if (
    fixture.applicationUrl !== applicationOrigin ||
    fixture.buildId !== context.representativeBuildId ||
    fixture.organizationId !== context.organizationId ||
    !Array.isArray(fixture.personas)
  ) {
    throw new Error(
      "Authenticated E2E fixture does not match the manifest application, organization, and Build."
    );
  }
  const roleSet = fixture.personas.map((persona) => persona.role).sort();
  if (JSON.stringify(roleSet) !== JSON.stringify([...ROLES].sort())) {
    throw new Error("Authenticated E2E fixture must contain every role once.");
  }
  const workosUserIds = fixture.personas.map((persona) =>
    persona.workosUserId?.trim()
  );
  if (
    workosUserIds.some((workosUserId) => !workosUserId) ||
    new Set(workosUserIds).size !== ROLES.length
  ) {
    throw new Error(
      "Authenticated E2E fixture must bind every role to a distinct WorkOS user."
    );
  }
  const storageStates = fixture.personas.map((persona) => {
    const url = new URL(persona.buildUrl, applicationOrigin);
    if (
      url.origin !== applicationOrigin ||
      url.pathname.split("/").at(-1) !== context.representativeBuildId
    ) {
      throw new Error(
        `E2E ${persona.role} journey is not scoped to the manifest application and Build.`
      );
    }
    const storage = readEvidenceFile(persona.storageState);
    return { path: storage.path, role: persona.role, sha256: storage.sha256 };
  });
  if (new Set(storageStates.map((state) => state.sha256)).size !== ROLES.length) {
    throw new Error(
      "Authenticated E2E fixture must use a distinct storage state for every WorkOS user."
    );
  }
  return {
    fixturePath: fixtureFile.path,
    fixtureSha256: fixtureFile.sha256,
    storageStates,
  };
}
