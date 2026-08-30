import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  COST_QUOTE_AUTOMATED_GATES,
  COST_QUOTE_MANUAL_BROWSER_WORKFLOWS,
  COST_QUOTE_MANUAL_QA_SCHEMA_VERSION,
  COST_QUOTE_WORKFLOW_INVARIANTS,
  type ManualBrowserWorkflow,
} from "./cost-quote-workflow-contract";
import {
  isPng,
  isRecord,
  isUniformViewportRaster,
  isValidHttpOrigin,
  isValidIsoDate,
  pngDimensions,
  SHA256_PATTERN,
  sha256,
  stringArray,
  validDevicePixelRatio,
} from "./cost-quote-workflow-utils";

export function validateEvidenceAnchors(root = process.cwd()) {
  const errors: string[] = [];
  const invariantIds = new Set<string>();
  for (const invariant of COST_QUOTE_WORKFLOW_INVARIANTS) {
    if (invariantIds.has(invariant.id)) {
      errors.push(`Duplicate workflow invariant ID: ${invariant.id}.`);
    }
    invariantIds.add(invariant.id);
    if (invariant.evidence.length === 0) {
      errors.push(
        `Workflow invariant ${invariant.id} has no evidence anchors.`
      );
    }
    for (const anchor of invariant.evidence) {
      const path = resolve(root, anchor.path);
      if (!existsSync(path)) {
        errors.push(`Evidence file does not exist: ${anchor.path}.`);
      }
      if (!anchor.testTitle.trim()) {
        errors.push(`Evidence anchor test title is empty for ${anchor.path}.`);
      }
    }
  }
  return errors;
}

export function validateExecutedEvidenceAnchors(
  reportJsonByGate: Record<string, string>,
  root = process.cwd()
) {
  const errors: string[] = [];
  const executed = new Map<string, string[]>();
  const reportingGateIds = COST_QUOTE_AUTOMATED_GATES.filter(
    (gate) => gate.vitestJsonReport
  ).map((gate) => gate.id);
  for (const gateId of reportingGateIds) {
    const reportJson = reportJsonByGate[gateId];
    if (!reportJson) {
      errors.push(`Missing Vitest JSON report for ${gateId}.`);
      continue;
    }
    collectVitestResults(errors, executed, gateId, reportJson, root);
  }
  for (const invariant of COST_QUOTE_WORKFLOW_INVARIANTS) {
    for (const anchor of invariant.evidence) {
      const key = evidenceKey(anchor.path, anchor.testTitle);
      const statuses = executed.get(key) ?? [];
      if (statuses.length !== 1 || statuses[0] !== "passed") {
        errors.push(
          `Executed evidence must contain one passing test: ${anchor.path} :: ${anchor.testTitle} (statuses ${statuses.join(", ") || "missing"}).`
        );
      }
    }
  }
  return errors;
}

function collectVitestResults(
  errors: string[],
  executed: Map<string, string[]>,
  gateId: string,
  reportJson: string,
  root: string
) {
  let report: unknown;
  try {
    report = JSON.parse(reportJson);
  } catch (error) {
    errors.push(
      `${gateId} did not produce valid Vitest JSON: ${error instanceof Error ? error.message : String(error)}.`
    );
    return;
  }
  if (!(isRecord(report) && Array.isArray(report.testResults))) {
    errors.push(`${gateId} Vitest JSON report has no testResults array.`);
    return;
  }
  for (const fileResult of report.testResults) {
    if (
      !isRecord(fileResult) ||
      typeof fileResult.name !== "string" ||
      !Array.isArray(fileResult.assertionResults)
    ) {
      errors.push(`${gateId} Vitest file result is malformed.`);
      continue;
    }
    const filePath = relative(root, resolve(root, fileResult.name));
    for (const assertion of fileResult.assertionResults) {
      if (
        !isRecord(assertion) ||
        typeof assertion.title !== "string" ||
        typeof assertion.status !== "string"
      ) {
        errors.push(`${gateId} Vitest assertion result is malformed.`);
        continue;
      }
      const key = evidenceKey(filePath, assertion.title);
      const statuses = executed.get(key) ?? [];
      statuses.push(assertion.status);
      executed.set(key, statuses);
    }
  }
}

function evidenceKey(path: string, testTitle: string) {
  return `${path}\u0000${testTitle}`;
}

export function validateAutomatedGateInputs(root = process.cwd()) {
  const errors: string[] = [];
  const configuredTestPaths = COST_QUOTE_AUTOMATED_GATES.flatMap(({ argv }) =>
    argv.filter(
      (argument) =>
        argument.endsWith(".test.ts") || argument.endsWith(".test.tsx")
    )
  );
  for (const path of new Set(configuredTestPaths)) {
    if (!existsSync(resolve(root, path))) {
      errors.push(
        `Configured certification test file does not exist: ${path}.`
      );
    }
  }
  return errors;
}

export function validateManualBrowserQaEvidence(
  evidence: unknown,
  input: {
    applicationOrigin: string;
    evidenceDirectory: string;
    gitCommit: string;
  }
) {
  if (!isRecord(evidence)) {
    return ["Manual browser QA evidence must be an object."];
  }
  const errors = validateManualEvidenceMetadata(evidence, {
    applicationOrigin: input.applicationOrigin,
    gitCommit: input.gitCommit,
  });
  const expected = new Set(
    COST_QUOTE_MANUAL_BROWSER_WORKFLOWS.map((workflow) => workflow.id)
  );
  const actual = new Set<string>();
  const workflowResults = Array.isArray(evidence.workflowResults)
    ? evidence.workflowResults
    : [];
  if (!Array.isArray(evidence.workflowResults)) {
    errors.push("Manual browser QA workflowResults must be an array.");
  }
  for (const result of workflowResults) {
    validateManualWorkflowResult(errors, result, {
      actual,
      evidenceDirectory: input.evidenceDirectory,
      expected,
    });
  }
  for (const workflowId of expected) {
    if (!actual.has(workflowId)) {
      errors.push(`Missing manual browser workflow: ${workflowId}.`);
    }
  }
  return errors;
}

function validateManualEvidenceMetadata(
  evidence: Record<string, unknown>,
  expected: { applicationOrigin: string; gitCommit: string }
) {
  const errors: string[] = [];
  if (evidence.schemaVersion !== COST_QUOTE_MANUAL_QA_SCHEMA_VERSION) {
    errors.push("Manual browser QA schema version is invalid.");
  }
  if (evidence.gitCommit !== expected.gitCommit) {
    errors.push(
      "Manual browser QA Git commit does not match certification HEAD."
    );
  }
  if (evidence.browser !== "codex-in-app") {
    errors.push("Manual browser QA must use the Codex in-app browser.");
  }
  if (evidence.reviewerModel !== "gpt-5.6-luna") {
    errors.push("Manual browser QA must be certified by GPT-5.6 Luna.");
  }
  if (evidence.signedInAccountCapabilities !== "all_roles") {
    errors.push("Manual browser QA must use the signed-in all-roles account.");
  }
  if (
    typeof evidence.applicationOrigin !== "string" ||
    !isValidHttpOrigin(evidence.applicationOrigin)
  ) {
    errors.push(
      "Manual browser QA applicationOrigin must be a valid HTTP origin."
    );
  }
  if (evidence.applicationOrigin !== expected.applicationOrigin) {
    errors.push(
      "Manual browser QA applicationOrigin does not match the release record."
    );
  }
  if (
    typeof evidence.completedAt !== "string" ||
    !isValidIsoDate(evidence.completedAt)
  ) {
    errors.push("Manual browser QA completedAt must be an ISO timestamp.");
  }
  return errors;
}

function validateManualWorkflowResult(
  errors: string[],
  result: unknown,
  input: {
    actual: Set<string>;
    evidenceDirectory: string;
    expected: Set<string>;
  }
) {
  if (!isRecord(result) || typeof result.workflowId !== "string") {
    errors.push("Manual browser QA workflow result is invalid.");
    return;
  }
  const workflowId = result.workflowId;
  const workflow = COST_QUOTE_MANUAL_BROWSER_WORKFLOWS.find(
    (candidate) => candidate.id === workflowId
  );
  if (input.actual.has(workflowId)) {
    errors.push(`Duplicate manual browser workflow: ${workflowId}.`);
  }
  input.actual.add(workflowId);
  if (input.expected.has(workflowId) && workflow) {
    validateManualWorkflowCoverage(errors, result, workflow);
  } else {
    errors.push(`Unknown manual browser workflow: ${workflowId}.`);
  }
  if (result.hierarchyPreserved !== true) {
    errors.push(`${workflowId} did not preserve the approved hierarchy.`);
  }
  if (result.horizontalOverflow !== false) {
    errors.push(`${workflowId} reported horizontal overflow.`);
  }
  if (
    !Array.isArray(result.inaccessibleControls) ||
    result.inaccessibleControls.length > 0
  ) {
    errors.push(`${workflowId} reported inaccessible controls.`);
  }
  if (
    !Array.isArray(result.unexpectedConsoleErrors) ||
    result.unexpectedConsoleErrors.length > 0
  ) {
    errors.push(`${workflowId} reported unexpected console errors.`);
  }
  const screenshots = Array.isArray(result.screenshots)
    ? result.screenshots
    : [];
  const devicePixelRatio = validDevicePixelRatio(result.devicePixelRatio);
  if (!devicePixelRatio) {
    errors.push(
      `${workflowId} devicePixelRatio must be a finite number from 0.5 to 4.`
    );
  }
  if (screenshots.length === 0) {
    errors.push(`${workflowId} has no screenshot evidence.`);
  }
  const expectedViewport =
    workflow && devicePixelRatio ? workflow.targetViewport : undefined;
  for (const screenshot of screenshots) {
    validateScreenshot(
      errors,
      screenshot,
      input.evidenceDirectory,
      expectedViewport
    );
  }
}

function validateManualWorkflowCoverage(
  errors: string[],
  result: Record<string, unknown>,
  workflow: ManualBrowserWorkflow
) {
  const workflowId = workflow.id;
  if (result.canonicalRoute !== workflow.canonicalRoute) {
    errors.push(`${workflowId} canonical route does not match.`);
  }
  const targetViewport = isRecord(result.targetViewport)
    ? result.targetViewport
    : {};
  if (
    targetViewport.height !== workflow.targetViewport.height ||
    targetViewport.width !== workflow.targetViewport.width
  ) {
    errors.push(`${workflowId} target viewport does not match.`);
  }
  const operationsCompleted = stringArray(result.operationsCompleted);
  if (!operationsCompleted) {
    errors.push(
      `${workflowId} operationsCompleted must be an array of strings.`
    );
  }
  for (const operation of workflow.operations) {
    if (!operationsCompleted?.includes(operation)) {
      errors.push(`${workflowId} is missing operation coverage: ${operation}.`);
    }
  }
  const recoveryScenariosCompleted = stringArray(
    result.recoveryScenariosCompleted
  );
  if (!recoveryScenariosCompleted) {
    errors.push(
      `${workflowId} recoveryScenariosCompleted must be an array of strings.`
    );
  }
  for (const recovery of workflow.recoveryScenarios) {
    if (!recoveryScenariosCompleted?.includes(recovery)) {
      errors.push(`${workflowId} is missing recovery coverage: ${recovery}.`);
    }
  }
}

function validateScreenshot(
  errors: string[],
  screenshot: unknown,
  evidenceDirectory: string,
  expectedViewport?: { height: number; width: number }
) {
  if (
    !isRecord(screenshot) ||
    typeof screenshot.path !== "string" ||
    typeof screenshot.sha256 !== "string"
  ) {
    errors.push("Screenshot evidence entry is invalid.");
    return;
  }
  if (!SHA256_PATTERN.test(screenshot.sha256)) {
    errors.push(`Screenshot has an invalid SHA-256: ${screenshot.path}.`);
    return;
  }
  const evidenceRoot = resolve(evidenceDirectory);
  if (!(existsSync(evidenceRoot) && statSync(evidenceRoot).isDirectory())) {
    errors.push(
      `Screenshot evidence directory does not exist: ${evidenceRoot}.`
    );
    return;
  }
  const path = resolve(evidenceRoot, screenshot.path);
  const relativePath = relative(evidenceRoot, path);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    errors.push(
      `Screenshot evidence must remain inside the evidence directory: ${screenshot.path}.`
    );
    return;
  }
  if (!(existsSync(path) && statSync(path).isFile())) {
    errors.push(`Screenshot evidence does not exist: ${screenshot.path}.`);
    return;
  }
  let realEvidenceRoot: string;
  let realPath: string;
  try {
    realEvidenceRoot = realpathSync(evidenceRoot);
    realPath = realpathSync(path);
  } catch {
    errors.push(
      `Screenshot evidence path cannot be resolved: ${screenshot.path}.`
    );
    return;
  }
  const realRelativePath = relative(realEvidenceRoot, realPath);
  if (
    realRelativePath === ".." ||
    realRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(realRelativePath)
  ) {
    errors.push(
      `Screenshot evidence must not link outside the evidence directory: ${screenshot.path}.`
    );
    return;
  }
  const screenshotBytes = readFileSync(realPath);
  if (
    !(screenshot.path.toLowerCase().endsWith(".png") && isPng(screenshotBytes))
  ) {
    errors.push(`Screenshot evidence is not a valid PNG: ${screenshot.path}.`);
    return;
  }
  const dimensions = pngDimensions(screenshotBytes);
  if (
    expectedViewport &&
    !isUniformViewportRaster(dimensions, expectedViewport)
  ) {
    errors.push(
      `Screenshot pixel dimensions are not a uniform raster of the target viewport: ${screenshot.path}.`
    );
  }
  const actualSha256 = sha256(screenshotBytes);
  if (actualSha256 !== screenshot.sha256.toLowerCase()) {
    errors.push(`Screenshot SHA-256 does not match: ${screenshot.path}.`);
  }
}
