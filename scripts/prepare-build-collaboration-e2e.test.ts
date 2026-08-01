import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { prepareBuildCollaborationE2E } from "./prepare-build-collaboration-e2e";

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
const authEnvironment = {
  admin: "BUILD_COLLABORATION_E2E_AUTH_ADMIN_B64",
  "principle-broker":
    "BUILD_COLLABORATION_E2E_AUTH_PRINCIPLE_BROKER_B64",
  broker: "BUILD_COLLABORATION_E2E_AUTH_BROKER_B64",
  builder: "BUILD_COLLABORATION_E2E_AUTH_BUILDER_B64",
  "broker-staff": "BUILD_COLLABORATION_E2E_AUTH_BROKER_STAFF_B64",
  "builder-staff": "BUILD_COLLABORATION_E2E_AUTH_BUILDER_STAFF_B64",
  homeowner: "BUILD_COLLABORATION_E2E_AUTH_HOMEOWNER_B64",
  contractor: "BUILD_COLLABORATION_E2E_AUTH_CONTRACTOR_B64",
} as const;
const routePrefixByRole = {
  admin: "backoffice",
  "principle-broker": "backoffice",
  broker: "backoffice",
  builder: "builder",
  "broker-staff": "backoffice",
  "builder-staff": "builder-staff",
  homeowner: "homeowner",
  contractor: "contractor",
} as const;
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("prepareBuildCollaborationE2E", () => {
  test("materializes eight auth states and a seeded, non-placeholder fixture", async () => {
    const directory = mkdtempSync(
      resolve(tmpdir(), "drawflow-collaboration-e2e-")
    );
    temporaryDirectories.push(directory);
    const githubEnvironmentPath = resolve(directory, "github.env");
    writeFileSync(githubEnvironmentPath, "");
    const storageState = {
      cookies: [
        {
          domain: "drawflow.test.fairlend.ca",
          expires: -1,
          httpOnly: true,
          name: "auth",
          path: "/",
          sameSite: "Lax",
          secure: true,
          value: "session",
        },
      ],
      origins: [],
    };
    const encodedStorageState = Buffer.from(
      JSON.stringify(storageState)
    ).toString("base64");
    const env: Record<string, string> = {
      BUILD_COLLABORATION_E2E_CONTROL_TOKEN:
        "test-control-token-with-32-characters",
      BUILD_COLLABORATION_E2E_BUILD_ID: "build_01",
      BUILD_COLLABORATION_E2E_OUTPUT_DIR: resolve(directory, "output"),
      BUILD_COLLABORATION_E2E_ORGANIZATION_ID: "org_fairlend",
      BUILD_COLLABORATION_E2E_SETUP_URL:
        "https://fixture-control.test.fairlend.ca/setup",
      GITHUB_ENV: githubEnvironmentPath,
      GITHUB_RUN_ID: "123",
      PLAYWRIGHT_BASE_URL: "https://drawflow.test.fairlend.ca",
    };
    for (const role of roles) {
      env[authEnvironment[role]] = encodedStorageState;
    }
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          personas: roles.map((role) => ({
            actionItemText: "Review the engineer seal",
            buildUrl: `/${routePrefixByRole[role]}/builds/build_01?focus=actionItem:action_01`,
            expectRestricted: role !== "admin",
            externalOrganization: role === "homeowner",
            grantOnly: role === "homeowner" || role === "contractor",
            referenceLabel: "Foundation and footings",
            role,
            visiblePostText: "Foundation inspection complete.",
          })),
          revocation: {
            controlUrl:
              "https://fixture-control.test.fairlend.ca/revoke",
            role: "homeowner",
          },
        }),
        { status: 200 }
      );

    const prepared = await prepareBuildCollaborationE2E({
      env,
      fetchImpl,
    });

    const fixture = JSON.parse(readFileSync(prepared.fixturePath, "utf8"));
    expect(fixture).toMatchObject({
      applicationUrl: "https://drawflow.test.fairlend.ca",
      buildId: "build_01",
      organizationId: "org_fairlend",
    });
    expect(fixture.personas).toHaveLength(8);
    expect(fixture.personas.map((persona: { role: string }) => persona.role))
      .toEqual(roles);
    expect(
      fixture.personas.every(
        (persona: { storageState: string }) =>
          readFileSync(persona.storageState, "utf8") ===
          `${JSON.stringify(storageState)}\n`
      )
    ).toBe(true);
    expect(fixture.revocation).toEqual({
      controlToken: "test-control-token-with-32-characters",
      controlUrl: "https://fixture-control.test.fairlend.ca/revoke",
      role: "homeowner",
    });
    expect(readFileSync(githubEnvironmentPath, "utf8")).toContain(
      `BUILD_COLLABORATION_E2E_FIXTURE=${prepared.fixturePath}`
    );
  });

  test("rejects placeholder Build IDs before Playwright starts", async () => {
    const directory = mkdtempSync(
      resolve(tmpdir(), "drawflow-collaboration-e2e-")
    );
    temporaryDirectories.push(directory);
    const encodedStorageState = Buffer.from(
      JSON.stringify({
        cookies: [{ name: "auth", value: "session" }],
        origins: [],
      })
    ).toString("base64");
    const env: Record<string, string> = {
      BUILD_COLLABORATION_E2E_CONTROL_TOKEN:
        "test-control-token-with-32-characters",
      BUILD_COLLABORATION_E2E_BUILD_ID: "build_01",
      BUILD_COLLABORATION_E2E_OUTPUT_DIR: resolve(directory, "output"),
      BUILD_COLLABORATION_E2E_ORGANIZATION_ID: "org_fairlend",
      BUILD_COLLABORATION_E2E_SETUP_URL:
        "https://fixture-control.test.fairlend.ca/setup",
      PLAYWRIGHT_BASE_URL: "https://drawflow.test.fairlend.ca",
    };
    for (const role of roles) {
      env[authEnvironment[role]] = encodedStorageState;
    }

    await expect(
      prepareBuildCollaborationE2E({
        env,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              personas: roles.map((role) => ({
                actionItemText: "Action",
                buildUrl:
                  "/backoffice/builds/ACTIVE_BUILD_ID?focus=actionItem:ACTION_ITEM_ID",
                expectRestricted: false,
                externalOrganization: role === "homeowner",
                grantOnly: role === "homeowner" || role === "contractor",
                referenceLabel: "Reference",
                role,
                visiblePostText: "Post",
              })),
              revocation: {
                controlUrl:
                  "https://fixture-control.test.fairlend.ca/revoke",
                role: "homeowner",
              },
            })
          ),
      })
    ).rejects.toThrow("invalid persona");
  });
});
