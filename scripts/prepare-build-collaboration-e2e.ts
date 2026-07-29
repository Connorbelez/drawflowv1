import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PERSONA_ROLES = [
  "admin",
  "principle-broker",
  "broker",
  "builder",
  "broker-staff",
  "builder-staff",
  "homeowner",
  "contractor",
] as const;
type PersonaRole = (typeof PERSONA_ROLES)[number];

const AUTH_ENV_BY_ROLE: Record<PersonaRole, string> = {
  admin: "BUILD_COLLABORATION_E2E_AUTH_ADMIN_B64",
  "principle-broker": "BUILD_COLLABORATION_E2E_AUTH_PRINCIPLE_BROKER_B64",
  broker: "BUILD_COLLABORATION_E2E_AUTH_BROKER_B64",
  builder: "BUILD_COLLABORATION_E2E_AUTH_BUILDER_B64",
  "broker-staff": "BUILD_COLLABORATION_E2E_AUTH_BROKER_STAFF_B64",
  "builder-staff": "BUILD_COLLABORATION_E2E_AUTH_BUILDER_STAFF_B64",
  homeowner: "BUILD_COLLABORATION_E2E_AUTH_HOMEOWNER_B64",
  contractor: "BUILD_COLLABORATION_E2E_AUTH_CONTRACTOR_B64",
};

interface SetupPersona {
  actionItemText: string;
  buildUrl: string;
  expectRestricted: boolean;
  externalOrganization: boolean;
  grantOnly: boolean;
  referenceLabel: string;
  role: PersonaRole;
  visiblePostText: string;
}

interface SetupResponse {
  personas: SetupPersona[];
  revocation: {
    controlUrl: string;
    role: "homeowner" | "contractor";
  };
}

export async function prepareBuildCollaborationE2E(input: {
  env: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}) {
  const env = input.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  const setupUrl = requireEnvironment(env, "BUILD_COLLABORATION_E2E_SETUP_URL");
  const controlToken = requireEnvironment(
    env,
    "BUILD_COLLABORATION_E2E_CONTROL_TOKEN"
  );
  const baseUrl = requireEnvironment(env, "PLAYWRIGHT_BASE_URL");
  const outputDirectory = resolve(
    env.BUILD_COLLABORATION_E2E_OUTPUT_DIR ??
      resolve(env.RUNNER_TEMP ?? "tmp", "build-collaboration-e2e")
  );
  mkdirSync(outputDirectory, { recursive: true });

  const setupResponse = await fetchImpl(setupUrl, {
    body: JSON.stringify({
      baseUrl,
      runId: env.GITHUB_RUN_ID ?? `local-${Date.now()}`,
    }),
    headers: {
      authorization: `Bearer ${controlToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!setupResponse.ok) {
    throw new Error(
      `Build collaboration E2E setup failed with HTTP ${setupResponse.status}.`
    );
  }
  const setup = validateSetupResponse(await setupResponse.json());
  const storageStateByRole = new Map<PersonaRole, string>();
  for (const role of PERSONA_ROLES) {
    const encodedState = requireEnvironment(env, AUTH_ENV_BY_ROLE[role]);
    const storageState = decodeStorageState(encodedState, role);
    const storageStatePath = resolve(
      outputDirectory,
      `${role.replaceAll("-", "_")}.json`
    );
    writeFileSync(storageStatePath, `${JSON.stringify(storageState)}\n`, {
      mode: 0o600,
    });
    storageStateByRole.set(role, storageStatePath);
  }

  const fixturePath = resolve(outputDirectory, "fixture.json");
  writeFileSync(
    fixturePath,
    `${JSON.stringify(
      {
        personas: setup.personas.map((persona) => ({
          ...persona,
          storageState: storageStateByRole.get(persona.role),
        })),
        revocation: {
          ...setup.revocation,
          controlToken,
        },
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );
  if (env.GITHUB_ENV) {
    appendFileSync(
      env.GITHUB_ENV,
      `BUILD_COLLABORATION_E2E_FIXTURE=${fixturePath}\n`
    );
  }
  return { fixturePath, outputDirectory };
}

function requireEnvironment(
  env: Record<string, string | undefined>,
  name: string
) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Required CI environment variable ${name} is missing.`);
  }
  return value;
}

function decodeStorageState(encodedState: string, role: PersonaRole) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encodedState, "base64").toString("utf8"));
  } catch {
    throw new Error(`The ${role} Playwright storage state is not valid JSON.`);
  }
  const isValidStorageState =
    isRecord(parsed) &&
    Array.isArray(parsed.cookies) &&
    Array.isArray(parsed.origins);
  if (!isValidStorageState) {
    throw new Error(
      `The ${role} Playwright storage state must contain cookies and origins arrays.`
    );
  }
  return parsed;
}

function validateSetupResponse(value: unknown): SetupResponse {
  if (!(isRecord(value) && Array.isArray(value.personas))) {
    throw new Error("The E2E setup response does not contain personas.");
  }
  const personas = value.personas as unknown[];
  const roles = personas
    .filter(isRecord)
    .map((persona) => persona.role)
    .filter((role): role is string => typeof role === "string")
    .sort();
  if (JSON.stringify(roles) !== JSON.stringify([...PERSONA_ROLES].sort())) {
    throw new Error(
      "The E2E setup response must contain each approved persona exactly once."
    );
  }
  for (const persona of personas) {
    if (
      !isRecord(persona) ||
      typeof persona.actionItemText !== "string" ||
      typeof persona.buildUrl !== "string" ||
      persona.buildUrl.includes("ACTIVE_BUILD_ID") ||
      typeof persona.expectRestricted !== "boolean" ||
      typeof persona.externalOrganization !== "boolean" ||
      typeof persona.grantOnly !== "boolean" ||
      typeof persona.referenceLabel !== "string" ||
      typeof persona.visiblePostText !== "string"
    ) {
      throw new Error("The E2E setup response contains an invalid persona.");
    }
  }
  const homeowner = personas.find(
    (persona) => isRecord(persona) && persona.role === "homeowner"
  );
  const contractor = personas.find(
    (persona) => isRecord(persona) && persona.role === "contractor"
  );
  if (
    !isRecord(homeowner) ||
    homeowner.externalOrganization !== true ||
    homeowner.grantOnly !== true ||
    !isRecord(contractor) ||
    contractor.grantOnly !== true
  ) {
    throw new Error(
      "The E2E setup must provision an external grant-only Homeowner and a grant-only Contractor."
    );
  }
  if (
    !isRecord(value.revocation) ||
    typeof value.revocation.controlUrl !== "string" ||
    value.revocation.controlUrl.includes("replace.invalid") ||
    !["homeowner", "contractor"].includes(String(value.revocation.role))
  ) {
    throw new Error(
      "The E2E setup response must include a usable participant revocation control."
    );
  }
  return value as unknown as SetupResponse;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

if (import.meta.main) {
  const prepared = await prepareBuildCollaborationE2E({
    env: process.env,
  });
  process.stdout.write(
    `Prepared Build collaboration E2E fixture at ${prepared.fixturePath}\n`
  );
}
