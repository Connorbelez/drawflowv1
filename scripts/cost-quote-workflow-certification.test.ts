import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, test } from "vitest";

import {
  COST_QUOTE_AUTOMATED_GATES,
  COST_QUOTE_MANUAL_BROWSER_WORKFLOWS,
  COST_QUOTE_MANUAL_QA_SCHEMA_VERSION,
  COST_QUOTE_WORKFLOW_INVARIANTS,
  type ManualBrowserQaEvidence,
  validateAutomatedGateInputs,
  validateEvidenceAnchors,
  validateExecutedEvidenceAnchors,
  validateManualBrowserQaEvidence,
} from "./cost-quote-workflow-certification";

const GIT_COMMIT = "a".repeat(40);
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("Cost and Quote public-workflow certification", () => {
  test("binds every acceptance invariant to an existing unique executable test", () => {
    expect(validateEvidenceAnchors()).toEqual([]);
    expect(validateExecutedEvidenceAnchors(passingReporterJson())).toEqual([]);
    expect(COST_QUOTE_WORKFLOW_INVARIANTS.map(({ id }) => id)).toEqual([
      "fixture.personas-and-scope",
      "cost.public-happy-path",
      "quote.public-happy-path",
      "failure.recovery-and-races",
      "security.scope-and-secrets",
      "retention.controlled-time",
      "routes.components-and-accessibility",
    ]);
    expect(
      COST_QUOTE_WORKFLOW_INVARIANTS.every(
        (invariant) => invariant.evidence.length > 0
      )
    ).toBe(true);
  });

  test("rejects missing, pending, or malformed execution-derived test evidence", () => {
    const reports = passingReporterJson();
    const publicReport = JSON.parse(reports["public-convex-contracts"]);
    publicReport.testResults[0].assertionResults[0].status = "pending";
    reports["public-convex-contracts"] = JSON.stringify(publicReport);
    expect(validateExecutedEvidenceAnchors(reports)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Executed evidence must contain one passing test"),
      ])
    );
    expect(
      validateExecutedEvidenceAnchors({
        "public-convex-contracts": "not-json",
        "route-component-contracts": JSON.stringify({ testResults: [] }),
      })
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("did not produce valid Vitest JSON"),
      ])
    );
  });

  test("keeps automated gates unique, public-contract focused, and free of fake browser certification", () => {
    const gateIds = COST_QUOTE_AUTOMATED_GATES.map(({ id }) => id);
    expect(new Set(gateIds).size).toBe(gateIds.length);
    expect(gateIds).toEqual([
      "public-convex-contracts",
      "route-component-contracts",
      "certifier-contract",
      "repository-tests",
      "convex-codegen",
      "convex-codegen-clean",
      "convex-typecheck",
      "production-build",
    ]);
    const commands = COST_QUOTE_AUTOMATED_GATES.flatMap(({ argv }) => argv);
    expect(commands).toContain("convex/cost_documents.test.ts");
    expect(commands).toContain("convex/quote_rounds.test.ts");
    expect(commands).toContain("convex/data_retention.test.ts");
    expect(commands).toContain(
      "src/routes/builder-staff/builds/$buildId/-index.test.ts"
    );
    expect(commands).toContain(
      "src/routes/contractor/builds/-build-detail.test.tsx"
    );
    expect(commands).toContain(
      "src/features/quote-solicitation/QuoteRoundComposerRoute.test.ts"
    );
    expect(validateAutomatedGateInputs()).toEqual([]);
    for (const forbidden of ["playwright", "puppeteer", "selenium"]) {
      expect(
        commands.some((argument) =>
          argument.toLowerCase().includes(forbidden)
        )
      ).toBe(false);
    }
    expect(
      commands.some((argument) => {
        const normalized = argument.toLowerCase();
        return (
          normalized === "arc" ||
          normalized.includes("arc browser") ||
          normalized.includes("arc.app")
        );
      })
    ).toBe(false);
  });

  test("accepts complete signed-in Codex browser evidence certified by GPT-5.6 Luna", () => {
    const { directory, evidence } = validManualEvidence();
    expect(
      validateManualBrowserQaEvidence(evidence, {
        applicationOrigin: "http://localhost:3000",
        evidenceDirectory: directory,
        gitCommit: GIT_COMMIT,
      })
    ).toEqual([]);
  });

  test("rejects the wrong browser, reviewer, account, commit, and incomplete workflow matrix", () => {
    const { directory, evidence } = validManualEvidence();
    evidence.browser = "arc";
    evidence.reviewerModel = "gpt-5.6-sol";
    evidence.signedInAccountCapabilities = "builder_only";
    evidence.gitCommit = "b".repeat(40);
    evidence.applicationOrigin = "https://<required-production-host>";
    evidence.workflowResults.pop();

    expect(
      validateManualBrowserQaEvidence(evidence, {
        applicationOrigin: "http://localhost:3000",
        evidenceDirectory: directory,
        gitCommit: GIT_COMMIT,
      })
    ).toEqual(
      expect.arrayContaining([
        "Manual browser QA Git commit does not match certification HEAD.",
        "Manual browser QA must use the Codex in-app browser.",
        "Manual browser QA must be certified by GPT-5.6 Luna.",
        "Manual browser QA must use the signed-in all-roles account.",
        "Manual browser QA applicationOrigin must be a valid HTTP origin.",
        `Missing manual browser workflow: ${COST_QUOTE_MANUAL_BROWSER_WORKFLOWS.at(-1)?.id}.`,
      ])
    );
  });

  test("rejects visual regressions, console errors, inaccessible controls, and forged screenshots", () => {
    const { directory, evidence } = validManualEvidence();
    const first = evidence.workflowResults[0];
    first.hierarchyPreserved = false;
    first.horizontalOverflow = true;
    first.inaccessibleControls = ["Submit quote"];
    first.unexpectedConsoleErrors = ["Unhandled error"];
    first.screenshots[0].sha256 = "0".repeat(64);
    first.canonicalRoute = "/wrong-route";
    first.targetViewport = { height: 1, width: 1 };
    first.operationsCompleted = [];
    first.recoveryScenariosCompleted = [];

    expect(
      validateManualBrowserQaEvidence(evidence, {
        applicationOrigin: "http://localhost:3000",
        evidenceDirectory: directory,
        gitCommit: GIT_COMMIT,
      })
    ).toEqual(
      expect.arrayContaining([
        `${first.workflowId} did not preserve the approved hierarchy.`,
        `${first.workflowId} reported horizontal overflow.`,
        `${first.workflowId} reported inaccessible controls.`,
        `${first.workflowId} reported unexpected console errors.`,
        `${first.workflowId} canonical route does not match.`,
        `${first.workflowId} target viewport does not match.`,
        `${first.workflowId} is missing operation coverage: ${COST_QUOTE_MANUAL_BROWSER_WORKFLOWS[0].operations[0]}.`,
        `${first.workflowId} is missing recovery coverage: ${COST_QUOTE_MANUAL_BROWSER_WORKFLOWS[0].recoveryScenarios[0]}.`,
        `Screenshot SHA-256 does not match: ${first.screenshots[0].path}.`,
      ])
    );
  });

  test("rejects screenshot evidence outside the governed evidence directory", () => {
    const { directory, evidence } = validManualEvidence();
    const first = evidence.workflowResults[0];
    first.screenshots[0].path = join(directory, "..", "outside.png");

    expect(
      validateManualBrowserQaEvidence(evidence, {
        applicationOrigin: "http://localhost:3000",
        evidenceDirectory: directory,
        gitCommit: GIT_COMMIT,
      })
    ).toContain(
      `Screenshot evidence must remain inside the evidence directory: ${first.screenshots[0].path}.`
    );
  });

  test("rejects a screenshot symlink whose target leaves the evidence directory", () => {
    const { directory, evidence } = validManualEvidence();
    const outsideDirectory = mkdtempSync(join(tmpdir(), "cost-quote-outside-"));
    temporaryDirectories.push(outsideDirectory);
    const outsidePath = join(outsideDirectory, "outside.png");
    const originalPath = evidence.workflowResults[0].screenshots[0].path;
    writeFileSync(outsidePath, readFileSync(join(directory, originalPath)));
    symlinkSync(outsidePath, join(directory, "linked.png"));
    evidence.workflowResults[0].screenshots[0].path = "linked.png";

    expect(
      validateManualBrowserQaEvidence(evidence, {
        applicationOrigin: "http://localhost:3000",
        evidenceDirectory: directory,
        gitCommit: GIT_COMMIT,
      })
    ).toContain(
      "Screenshot evidence must not link outside the evidence directory: linked.png."
    );
  });

  test("rejects text payloads renamed with a PNG extension", () => {
    const { directory, evidence } = validManualEvidence();
    const first = evidence.workflowResults[0];
    const screenshotPath = first.screenshots[0].path;
    const textPayload = Buffer.from("not actually a PNG");
    writeFileSync(join(directory, screenshotPath), textPayload);
    first.screenshots[0].sha256 = createHash("sha256")
      .update(textPayload)
      .digest("hex");
    expect(
      validateManualBrowserQaEvidence(evidence, {
        applicationOrigin: "http://localhost:3000",
        evidenceDirectory: directory,
        gitCommit: GIT_COMMIT,
      })
    ).toContain(`Screenshot evidence is not a valid PNG: ${screenshotPath}.`);
  });

  test("rejects a valid PNG whose dimensions do not match the workflow viewport", () => {
    const { directory, evidence } = validManualEvidence();
    const first = evidence.workflowResults[0];
    const screenshotPath = first.screenshots[0].path;
    const onePixel = createPng(1, 1);
    writeFileSync(join(directory, screenshotPath), onePixel);
    first.screenshots[0].sha256 = createHash("sha256")
      .update(onePixel)
      .digest("hex");
    expect(
      validateManualBrowserQaEvidence(evidence, {
        applicationOrigin: "http://localhost:3000",
        evidenceDirectory: directory,
        gitCommit: GIT_COMMIT,
      })
    ).toContain(
      `Screenshot pixel dimensions do not match target viewport: ${screenshotPath}.`
    );
  });

  test("returns validation errors for malformed untrusted visual evidence without throwing", () => {
    expect(
      validateManualBrowserQaEvidence(
        {
          applicationOrigin: "http://localhost:3000",
          browser: "codex-in-app",
          completedAt: "2026-08-04T03:00:00.000Z",
          gitCommit: GIT_COMMIT,
          reviewerModel: "gpt-5.6-luna",
          schemaVersion: COST_QUOTE_MANUAL_QA_SCHEMA_VERSION,
          signedInAccountCapabilities: "all_roles",
          workflowResults: "not-an-array",
        },
        {
          applicationOrigin: "http://localhost:3000",
          evidenceDirectory: "/tmp",
          gitCommit: GIT_COMMIT,
        }
      )
    ).toContain("Manual browser QA workflowResults must be an array.");

    const malformed = validManualEvidence();
    const first = malformed.evidence.workflowResults[0] as unknown as Record<
      string,
      unknown
    >;
    first.operationsCompleted = "capture-multi-page-batch";
    first.recoveryScenariosCompleted = "likely-duplicate-override";
    first.screenshots = "evidence.png";
    const malformedErrors = validateManualBrowserQaEvidence(
      malformed.evidence,
      {
        applicationOrigin: "http://localhost:3000",
        evidenceDirectory: malformed.directory,
        gitCommit: GIT_COMMIT,
      }
    );
    expect(malformedErrors).toEqual(
      expect.arrayContaining([
        `${COST_QUOTE_MANUAL_BROWSER_WORKFLOWS[0].id} operationsCompleted must be an array of strings.`,
        `${COST_QUOTE_MANUAL_BROWSER_WORKFLOWS[0].id} recoveryScenariosCompleted must be an array of strings.`,
        `${COST_QUOTE_MANUAL_BROWSER_WORKFLOWS[0].id} has no screenshot evidence.`,
      ])
    );
  });
});

function validManualEvidence() {
  const directory = mkdtempSync(join(tmpdir(), "cost-quote-qa-"));
  temporaryDirectories.push(directory);
  const evidence: ManualBrowserQaEvidence = {
    applicationOrigin: "http://localhost:3000",
    browser: "codex-in-app",
    completedAt: "2026-08-04T03:00:00-04:00",
    gitCommit: GIT_COMMIT,
    reviewerModel: "gpt-5.6-luna",
    schemaVersion: COST_QUOTE_MANUAL_QA_SCHEMA_VERSION,
    signedInAccountCapabilities: "all_roles",
    workflowResults: COST_QUOTE_MANUAL_BROWSER_WORKFLOWS.map((workflow) => {
      const devicePixelRatio = 1;
      const screenshot = createPng(
        workflow.targetViewport.width * devicePixelRatio,
        workflow.targetViewport.height * devicePixelRatio
      );
      const path = `${workflow.id}.png`;
      writeFileSync(join(directory, path), screenshot);
      return {
        canonicalRoute: workflow.canonicalRoute,
        devicePixelRatio,
        hierarchyPreserved: true,
        horizontalOverflow: false,
        inaccessibleControls: [],
        operationsCompleted: workflow.operations,
        recoveryScenariosCompleted: workflow.recoveryScenarios,
        screenshots: [
          {
            path,
            sha256: createHash("sha256").update(screenshot).digest("hex"),
          },
        ],
        targetViewport: workflow.targetViewport,
        unexpectedConsoleErrors: [],
        workflowId: workflow.id,
      };
    }),
  };
  return { directory, evidence };
}

function passingReporterJson() {
  const filesByGate: Record<
    string,
    Map<string, Array<{ status: string; title: string }>>
  > = {
    "public-convex-contracts": new Map(),
    "route-component-contracts": new Map(),
  };
  const seen = new Set<string>();
  for (const invariant of COST_QUOTE_WORKFLOW_INVARIANTS) {
    for (const anchor of invariant.evidence) {
      const key = `${anchor.path}\u0000${anchor.testTitle}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const gateId = anchor.path.startsWith("convex/")
        ? "public-convex-contracts"
        : "route-component-contracts";
      const files = filesByGate[gateId];
      const assertions = files.get(anchor.path) ?? [];
      assertions.push({ status: "passed", title: anchor.testTitle });
      files.set(anchor.path, assertions);
    }
  }
  return Object.fromEntries(
    Object.entries(filesByGate).map(([gateId, files]) => [
      gateId,
      JSON.stringify({
        testResults: [...files].map(([path, assertionResults]) => ({
          assertionResults,
          name: join(process.cwd(), path),
        })),
      }),
    ])
  );
}

function createPng(width: number, height: number) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer) {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), data.length + 8);
  return chunk;
}

function crc32(value: Buffer) {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
