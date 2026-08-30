import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

import {
  type AutomatedGateDefinition,
  COST_QUOTE_AUTOMATED_GATES,
  COST_QUOTE_CERTIFICATION_SCHEMA_VERSION,
  COST_QUOTE_MANUAL_BROWSER_WORKFLOWS,
  COST_QUOTE_WORKFLOW_INVARIANTS,
  type ManualBrowserQaEvidence,
} from "./cost-quote-workflow-contract";
import {
  AUTOMATED_GATE_TIMEOUT_MS,
  GIT_SHA_PATTERN,
  isValidHttpOrigin,
  serializeCommand,
  sha256,
} from "./cost-quote-workflow-utils";
import {
  validateAutomatedGateInputs,
  validateEvidenceAnchors,
  validateExecutedEvidenceAnchors,
  validateManualBrowserQaEvidence,
} from "./cost-quote-workflow-validation";

interface GateResult {
  command: string;
  completedAt: string;
  exitCode: number;
  id: string;
  startedAt: string;
  stderr: { path: string; sha256: string };
  stdout: { path: string; sha256: string };
  vitestReport?: { path: string; sha256: string };
}

interface RunnerArguments {
  applicationOrigin?: string;
  outputPath?: string;
  visualEvidencePath?: string;
}

function parseArguments(argv: string[]) {
  const parsed: RunnerArguments = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      continue;
    }
    const value = argv[index + 1];
    switch (argument) {
      case "--application-origin":
        parsed.applicationOrigin = requireArgumentValue(
          "--application-origin",
          value
        );
        index += 1;
        break;
      case "--output":
        parsed.outputPath = requireArgumentValue("--output", value);
        index += 1;
        break;
      case "--visual-evidence":
        parsed.visualEvidencePath = requireArgumentValue(
          "--visual-evidence",
          value
        );
        index += 1;
        break;
      default:
        throw new Error(`Unknown certification argument: ${argument}`);
    }
  }
  if (!(parsed.outputPath && parsed.applicationOrigin)) {
    throw new Error("--application-origin and --output are required.");
  }
  if (!isValidHttpOrigin(parsed.applicationOrigin)) {
    throw new Error("--application-origin must be a valid HTTP origin.");
  }
  return parsed;
}

function requireArgumentValue(flag: string, value: string | undefined) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function runGit(args: string[]) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  const command = `git ${args.join(" ")}`;
  if (result.error) {
    throw new Error(`${command} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} exited with ${result.status}: ${(result.stderr || result.stdout || "").trim()}`
    );
  }
  return result.stdout.trim();
}

function runGate(gate: AutomatedGateDefinition, outputPath: string) {
  const startedAt = new Date().toISOString();
  const vitestReportPath = gate.vitestJsonReport
    ? `${resolve(outputPath)}.${gate.id}.vitest.json`
    : undefined;
  if (vitestReportPath && existsSync(vitestReportPath)) {
    unlinkSync(vitestReportPath);
  }
  const argv = vitestReportPath
    ? [...gate.argv, `--outputFile=${vitestReportPath}`]
    : gate.argv;
  const result = spawnSync(argv[0], argv.slice(1), {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["inherit", "pipe", "pipe"],
    timeout: AUTOMATED_GATE_TIMEOUT_MS,
  });
  const completedAt = new Date().toISOString();
  const unexpectedStdout =
    gate.requireEmptyStdout && (result.stdout ?? "").trim()
      ? `\n[certification] ${serializeCommand(argv)} produced unexpected output.\n`
      : "";
  const spawnError = result.error
    ? `\n[certification] ${serializeCommand(argv)} failed to run: ${result.error.message}\n`
    : "";
  const stdout = writeLog(outputPath, gate.id, "stdout", result.stdout ?? "");
  const stderrContents = `${result.stderr ?? ""}${spawnError}${unexpectedStdout}`;
  const stderr = writeLog(outputPath, gate.id, "stderr", stderrContents);
  const gateResult: GateResult = {
    command: serializeCommand(argv),
    completedAt,
    exitCode: unexpectedStdout || result.error ? 1 : (result.status ?? -1),
    id: gate.id,
    startedAt,
    stderr,
    stdout,
  };
  if (gateResult.exitCode !== 0) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(stderrContents);
  }
  return { result: gateResult, vitestReportPath };
}

function writeLog(
  outputPath: string,
  gateId: string,
  stream: "stderr" | "stdout",
  contents: string
) {
  const path = `${resolve(outputPath)}.${gateId}.${stream}.log`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  return { path, sha256: sha256(contents) };
}

function writeArtifact(outputPath: string, artifact: Record<string, unknown>) {
  const target = resolve(outputPath);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(artifact, null, 2)}\n`);
  renameSync(temporary, target);
}

function workflowInvariantResults(status: "not_verified" | "passed") {
  return COST_QUOTE_WORKFLOW_INVARIANTS.map((invariant) => ({
    evidence: invariant.evidence,
    id: invariant.id,
    requirement: invariant.requirement,
    status,
    verification: "executed-passing-vitest-json-assertion",
  }));
}

export function runCostQuoteWorkflowCertification(argv: string[]) {
  const args = parseArguments(argv);
  const context = resolveCertificationContext(args);
  const startedAt = new Date().toISOString();
  const automatedGates = runAutomatedCertificationGates(context, startedAt);
  let manual: ReturnType<typeof resolveManualBrowserCertification>;
  try {
    manual = resolveManualBrowserCertification(args, context);
  } catch (error) {
    writeFailedCertification(context, startedAt, automatedGates, {
      invariantStatus: "passed",
      manualStatus: "rejected",
    });
    throw error;
  }
  writeArtifact(context.outputPath, {
    automatedGates,
    completedAt: new Date().toISOString(),
    applicationOrigin: context.applicationOrigin,
    gitCommit: context.gitCommit,
    manualBrowserQa: manual.evidence,
    schemaVersion: COST_QUOTE_CERTIFICATION_SCHEMA_VERSION,
    startedAt,
    status: manual.status,
    workflowInvariants: workflowInvariantResults("passed"),
  });
}

function resolveCertificationContext(args: RunnerArguments) {
  const outputPath = resolve(args.outputPath ?? "");
  mkdirSync(dirname(outputPath), { recursive: true });
  const applicationOrigin = args.applicationOrigin ?? "";
  const gitCommit = runGit(["rev-parse", "HEAD"]);
  if (!GIT_SHA_PATTERN.test(gitCommit)) {
    throw new Error("Unable to resolve a valid Git HEAD for certification.");
  }
  const trackedChanges = runGit([
    "status",
    "--porcelain",
    "--untracked-files=no",
  ]);
  if (trackedChanges) {
    throw new Error(
      "Certification requires a clean tracked working tree so every result binds to Git HEAD."
    );
  }
  const evidenceErrors = validateEvidenceAnchors();
  const gateInputErrors = validateAutomatedGateInputs();
  const preflightErrors = [...evidenceErrors, ...gateInputErrors];
  if (preflightErrors.length > 0) {
    throw new Error(
      `Workflow certification preflight is invalid:\n- ${preflightErrors.join("\n- ")}`
    );
  }
  return { applicationOrigin, gitCommit, outputPath };
}

function runAutomatedCertificationGates(
  context: ReturnType<typeof resolveCertificationContext>,
  startedAt: string
) {
  const gateResults: GateResult[] = [];
  const reportJsonByGate: Record<string, string> = {};
  const reportLoadErrors: string[] = [];
  for (const gate of COST_QUOTE_AUTOMATED_GATES) {
    const execution = runGate(gate, context.outputPath);
    const result = execution.result;
    gateResults.push(result);
    if (result.exitCode !== 0) {
      writeFailedCertification(context, startedAt, gateResults);
      throw new Error(`${gate.id} failed with exit code ${result.exitCode}.`);
    }
    if (gate.vitestJsonReport) {
      loadVitestGateReport(gate, execution, reportJsonByGate, reportLoadErrors);
    }
  }
  const executedEvidenceErrors = [
    ...reportLoadErrors,
    ...validateExecutedEvidenceAnchors(reportJsonByGate),
  ];
  if (executedEvidenceErrors.length > 0) {
    writeFailedCertification(context, startedAt, gateResults);
    throw new Error(
      `Executed workflow evidence is invalid:\n- ${executedEvidenceErrors.join("\n- ")}`
    );
  }
  return gateResults;
}

function loadVitestGateReport(
  gate: AutomatedGateDefinition,
  execution: ReturnType<typeof runGate>,
  reportJsonByGate: Record<string, string>,
  errors: string[]
) {
  const reportPath = execution.vitestReportPath;
  try {
    if (!reportPath) {
      throw new Error("gate did not configure a Vitest report path");
    }
    const reportBytes = readFileSync(reportPath);
    reportJsonByGate[gate.id] = reportBytes.toString("utf8");
    execution.result.vitestReport = {
      path: reportPath,
      sha256: sha256(reportBytes),
    };
  } catch (error) {
    errors.push(
      `${gate.id} Vitest report could not be read: ${error instanceof Error ? error.message : String(error)}.`
    );
  }
}

function writeFailedCertification(
  context: ReturnType<typeof resolveCertificationContext>,
  startedAt: string,
  automatedGates: GateResult[],
  options: {
    invariantStatus?: "not_verified" | "passed";
    manualStatus?: "not_reached" | "rejected";
  } = {}
) {
  writeArtifact(context.outputPath, {
    automatedGates,
    completedAt: new Date().toISOString(),
    applicationOrigin: context.applicationOrigin,
    gitCommit: context.gitCommit,
    manualBrowserQa: { status: options.manualStatus ?? "not_reached" },
    schemaVersion: COST_QUOTE_CERTIFICATION_SCHEMA_VERSION,
    startedAt,
    status: "failed",
    workflowInvariants: workflowInvariantResults(
      options.invariantStatus ?? "not_verified"
    ),
  });
}

function resolveManualBrowserCertification(
  args: RunnerArguments,
  context: ReturnType<typeof resolveCertificationContext>
) {
  if (!args.visualEvidencePath) {
    return {
      evidence: {
        browser: "codex-in-app",
        reason:
          "Deferred until ENG-384 through ENG-403 are all In Review; no visual certification is claimed.",
        requiredReviewerModel: "gpt-5.6-luna",
        requiredWorkflowIds: COST_QUOTE_MANUAL_BROWSER_WORKFLOWS.map(
          (workflow) => workflow.id
        ),
        status: "pending",
      },
      status: "automated_passed_manual_qa_pending",
    };
  }
  const visualEvidencePath = resolve(args.visualEvidencePath);
  const { evidence, evidenceBytes } =
    readManualBrowserEvidence(visualEvidencePath);
  const visualErrors = validateManualBrowserQaEvidence(evidence, {
    evidenceDirectory: dirname(visualEvidencePath),
    applicationOrigin: context.applicationOrigin,
    gitCommit: context.gitCommit,
  });
  if (visualErrors.length > 0) {
    throw new Error(
      `Manual browser QA evidence is invalid:\n- ${visualErrors.join("\n- ")}`
    );
  }
  return {
    evidence: {
      browser: evidence.browser,
      completedAt: evidence.completedAt,
      evidencePath: visualEvidencePath,
      evidenceSha256: sha256(evidenceBytes),
      reviewerModel: evidence.reviewerModel,
      status: "passed",
    },
    status: "certified",
  };
}

function readManualBrowserEvidence(visualEvidencePath: string) {
  try {
    const evidenceBytes = readFileSync(visualEvidencePath);
    const evidence = JSON.parse(
      evidenceBytes.toString("utf8")
    ) as ManualBrowserQaEvidence;
    return { evidence, evidenceBytes };
  } catch (error) {
    throw new Error(
      `Unable to read manual browser QA evidence at ${visualEvidencePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
