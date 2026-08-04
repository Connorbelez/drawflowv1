import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const COST_QUOTE_CERTIFICATION_SCHEMA_VERSION =
  "cost-quote-public-workflow-certification/v1" as const;
export const COST_QUOTE_MANUAL_QA_SCHEMA_VERSION =
  "cost-quote-manual-browser-qa/v1" as const;

const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const SAFE_SHELL_ARGUMENT_PATTERN = /^[A-Za-z0-9_./:=-]+$/;
const AUTOMATED_GATE_TIMEOUT_MS = 20 * 60 * 1000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export interface EvidenceAnchor {
  path: string;
  testTitle: string;
}

export interface WorkflowInvariant {
  evidence: EvidenceAnchor[];
  id: string;
  requirement: string;
}

export interface AutomatedGateDefinition {
  argv: string[];
  id: string;
  requireEmptyStdout?: boolean;
  requirement: string;
  vitestJsonReport?: boolean;
}

export interface ManualBrowserWorkflow {
  canonicalRoute: string;
  id: string;
  operations: string[];
  persona: string;
  recoveryScenarios: string[];
  requirement: string;
  targetViewport: { height: number; width: number };
  viewport: "desktop" | "mobile";
}

interface ManualScreenshot {
  path: string;
  sha256: string;
}

interface ManualWorkflowResult {
  canonicalRoute: string;
  devicePixelRatio: number;
  hierarchyPreserved: boolean;
  horizontalOverflow: boolean;
  inaccessibleControls: string[];
  operationsCompleted: string[];
  recoveryScenariosCompleted: string[];
  screenshots: ManualScreenshot[];
  targetViewport: { height: number; width: number };
  unexpectedConsoleErrors: string[];
  workflowId: string;
}

export interface ManualBrowserQaEvidence {
  applicationOrigin: string;
  browser: string;
  completedAt: string;
  gitCommit: string;
  reviewerModel: string;
  schemaVersion: string;
  signedInAccountCapabilities: string;
  workflowResults: ManualWorkflowResult[];
}

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

export const COST_QUOTE_WORKFLOW_INVARIANTS: WorkflowInvariant[] = [
  {
    id: "fixture.personas-and-scope",
    requirement:
      "Authenticated Builder Owner, Builder Staff, Homeowner, Contractor, Backoffice, provisional recipient, Build, planned-material, file, and captured-email fixture seams are exercised.",
    evidence: [
      {
        path: "convex/cost_documents.test.ts",
        testTitle:
          "enforces the active-role submitted-document and asset matrix, including homeowner ownership and contractor uploader isolation",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "provisions one brokerage-scoped cold recipient and attaches the complete mode capability",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "allows read-only Build roles to see the same register while preserving authoring boundaries",
      },
      {
        path: "convex/email_transport.test.ts",
        testTitle:
          "claims an intent and creates the provider message only after dispatch acceptance",
      },
    ],
  },
  {
    id: "cost.public-happy-path",
    requirement:
      "The public Cost workflow covers batch capture, exact allocation, publication, receipt, reconciliation, progressive detail, correction, void, and private download.",
    evidence: [
      {
        path: "convex/cost_documents.test.ts",
        testTitle:
          "submits, reads, and privately downloads one immutable multi-page Invoice",
      },
      {
        path: "convex/cost_documents.test.ts",
        testTitle:
          "persists independent draft recovery, exact allocations/components, and reopens only the selected draft",
      },
      {
        path: "convex/cost_documents.test.ts",
        testTitle:
          "creates one immutable Receipt communication intent atomically and replays without duplicating it",
      },
      {
        path: "convex/cost_documents.test.ts",
        testTitle:
          "projects an auditable, tenant-scoped Roadmap Reconciliation without exposing uploader identity",
      },
      {
        path: "convex/cost_documents.test.ts",
        testTitle:
          "keeps Builder and Brokerage review annotations independent and voids without deleting lineage",
      },
      {
        path: "convex/cost_documents.test.ts",
        testTitle:
          "creates linear corrected revisions and records durable action-required integrity exceptions",
      },
      {
        path: "src/features/cost-documents/CostDocumentRoadmapReconciliation.test.tsx",
        testTitle:
          "opens route-owned progressive detail and retrieves private source pages with an access token",
      },
    ],
  },
  {
    id: "quote.public-happy-path",
    requirement:
      "The public Quote workflow covers templates, Combined publication, cold invitation, reusable access, Field Ledger, submission lifecycle, deadlines, comparison, Control Register, and Preferred clearing.",
    evidence: [
      {
        path: "convex/quote_response_templates.test.ts",
        testTitle:
          "authors a draft, publishes immutable versions, and selects history",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "opens a combined round atomically with immutable rich scope, hashed attachments, credentials, and idempotency",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "exchanges a reusable private credential into a bounded browser lease without exposing recipient peers",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "does not create on read, creates one canonical draft on first edit, and resumes it across browser sessions",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "returns the same immutable receipt for a lost submission response or a double tap",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "supersedes only after explicit resubmission and retains immutable revision history",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "withdraws only after confirmation, keeps the event immutable, and permits resubmission",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "closes read-only, reopens with the same Invitation identity, and gates the new Package Revision until acknowledgement",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "compares multiple current submissions only and never leaks another Build or recipient route",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "sets and reversibly clears exactly one Preferred pointer in Open and Closed rounds with optimistic concurrency and audit only",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "projects the exact Preferred Submission Revision into the control register without duplicating commercial state",
      },
    ],
  },
  {
    id: "failure.recovery-and-races",
    requirement:
      "Interrupted, quarantined, missing, duplicate, stale, delivery, webhook, deadline, supersession, and revocation failures fail closed and remain recoverable where allowed.",
    evidence: [
      {
        path: "src/features/cost-documents/CostDocumentBatchWorkspace.test.tsx",
        testTitle:
          "retains only unbound Capture files after a partial multi-page upload failure",
      },
      {
        path: "convex/cost_documents.test.ts",
        testTitle:
          "fails closed when a submitted batch replay has a missing, corrupt, or foreign durable graph",
      },
      {
        path: "convex/cost_documents.test.ts",
        testTitle:
          "blocks exact source duplicates while requiring an audited override for likely same-Build duplicates",
      },
      {
        path: "convex/cost_documents.test.ts",
        testTitle:
          "rechecks Contractor scope on every existing Draft mutation, reopen, submission, and governed asset path",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "rejects a stale Draft version without replacing the newer Field Ledger",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "still returns the original accepted receipt when its network retry arrives after the deadline",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "rotates and revokes Invitation credentials and browser sessions, and preserves audit reasons",
      },
      {
        path: "convex/email_transport.test.ts",
        testTitle:
          "retries transient dispatch failures and escalates a permanent action-required outcome",
      },
      {
        path: "convex/email_transport.test.ts",
        testTitle:
          "uses provider time and terminal-failure precedence for duplicate, out-of-order, and equal-time callbacks",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "rechecks the server deadline after validation before it writes a submission",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "clears Preferred instead of migrating it on resubmit, withdrawal, revocation, recipient replacement, Package supersession, and cancellation",
      },
      {
        path: "src/features/quote-solicitation/QuoteFieldLedger.test.tsx",
        testTitle:
          "removes stale claimed content when claimed recipient access is revoked",
      },
    ],
  },
  {
    id: "security.scope-and-secrets",
    requirement:
      "Organization, Build, recipient, Draft, file, assignment, audit, token, role, and break-glass boundaries are covered.",
    evidence: [
      {
        path: "convex/cost_documents.test.ts",
        testTitle:
          "recovers an exact batch only for its requested Build, tenant, and owner",
      },
      {
        path: "convex/cost_documents.test.ts",
        testTitle:
          "lets an exact Draft collaborator retain, reorder, and remove consumed creator pages while rejecting foreign Draft and tenant assets",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "never reveals or changes another invitation's response, including to an internal user",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "opens a combined round atomically with immutable rich scope, hashed attachments, credentials, and idempotency",
      },
      {
        path: "convex/cost_documents.test.ts",
        testTitle:
          "submits, reads, and privately downloads one immutable multi-page Invoice",
      },
      {
        path: "convex/cost_documents.test.ts",
        testTitle:
          "fails closed for Contractor allocation, assignment-child, and tenant forgeries",
      },
      {
        path: "convex/administrative_override_policy.test.ts",
        testTitle:
          "appends exact privacy-minimized immutable history and never mutates Budget, Cost, Milestone, Draw, or release state",
      },
      {
        path: "convex/administrative_override_policy.test.ts",
        testTitle:
          "marks Brokerage Admin break-glass conspicuously and emits a security-critical notification",
      },
      {
        path: "convex/quote_rounds.test.ts",
        testTitle:
          "uses the active Build authorization role instead of a caller JWT role claim",
      },
    ],
  },
  {
    id: "retention.controlled-time",
    requirement:
      "Transient purge, canonical retention, legal hold, restricted archive, verified restore, and isolated drill behavior are clock-controlled.",
    evidence: [
      {
        path: "convex/data_retention.test.ts",
        testTitle:
          "keeps terminal Quote Drafts recoverable for 90 days, then purges only editable children",
      },
      {
        path: "convex/data_retention.test.ts",
        testTitle:
          "derives the seven-year schedule from the later Build/Loan closure",
      },
      {
        path: "convex/data_retention.test.ts",
        testTitle:
          "fails closed on a Build legal hold and scopes a sweep to one organization",
      },
      {
        path: "convex/data_retention.test.ts",
        testTitle:
          "restricted archive makes canonical Quote/Cost writes read-only without changing retention eligibility",
      },
      {
        path: "convex/data_retention.test.ts",
        testTitle:
          "requires explicit Brokerage Admin break-glass and a fresh verified backup for restore",
      },
      {
        path: "convex/data_retention.test.ts",
        testTitle:
          "reconciles changed closure inputs and records quarterly isolated drill evidence",
      },
    ],
  },
  {
    id: "routes.components-and-accessibility",
    requirement:
      "Production route state, component hierarchy, responsive structure, keyboard access, and role revocation are covered before manual browser review.",
    evidence: [
      {
        path: "src/routes/builder/builds/$buildId/-index.test.tsx",
        testTitle: "keeps the Cost Document batch sheet route-addressable",
      },
      {
        path: "src/routes/homeowner/builds/-build-collaboration.test.tsx",
        testTitle:
          "opens the canonical read-only Quote Round comparison and never exposes authoring actions",
      },
      {
        path: "src/features/cost-documents/CostDocumentBatchWorkspace.test.tsx",
        testTitle:
          "renders an accessible, mobile-first register before the active document editor",
      },
      {
        path: "src/features/quote-solicitation/QuoteRoundsSurface.test.tsx",
        testTitle:
          "keeps lifecycle states and actions keyboard-accessible while respecting read-only mode",
      },
      {
        path: "src/features/quote-solicitation/QuoteRoundComparisonSurface.test.tsx",
        testTitle:
          "renders a responsive immutable multi-response comparison and selects the exact submission revision",
      },
      {
        path: "src/features/cost-documents/CostDocumentRoadmapReconciliation.test.tsx",
        testTitle:
          "removes the detail immediately when the current Build role is revoked",
      },
    ],
  },
];

const ROUTE_COMPONENT_TESTS = [
  "src/features/cost-documents/CostDocumentBatchWorkspace.test.tsx",
  "src/features/cost-documents/CostDocumentDraftCollaboration.test.tsx",
  "src/features/cost-documents/CostDocumentRoadmapReconciliation.test.tsx",
  "src/features/cost-documents/SingleCostDocumentCapture.test.tsx",
  "src/features/quote-solicitation/QuoteFieldLedger.test.tsx",
  "src/features/quote-solicitation/QuoteRoundComparisonSurface.test.tsx",
  "src/features/quote-solicitation/QuoteRoundComposer.test.tsx",
  "src/features/quote-solicitation/QuoteRoundComposerRoute.detail.test.tsx",
  // Canonical route-state contract; this is a TypeScript test (not TSX).
  "src/features/quote-solicitation/QuoteRoundComposerRoute.test.ts",
  "src/features/quote-solicitation/QuoteRoundRecipientEditor.test.tsx",
  "src/features/quote-solicitation/QuoteRoundsSurface.test.tsx",
  "src/features/quote-solicitation/QuoteTemplateRegistry.test.tsx",
  "src/routes/-quote-invitation.$magicToken.test.tsx",
  "src/routes/backoffice/builds/$buildId/-route-search.test.ts",
  "src/routes/builder-staff/builds/$buildId/-index.test.ts",
  "src/routes/builder/builds/$buildId/-index.test.tsx",
  "src/routes/builder/builds/$buildId/quotes/-new.test.tsx",
  "src/routes/contractor/builds/-build-detail.test.tsx",
  "src/routes/homeowner/builds/-build-collaboration.test.tsx",
];

export const COST_QUOTE_AUTOMATED_GATES: AutomatedGateDefinition[] = [
  {
    id: "public-convex-contracts",
    requirement:
      "Public Cost, Quote, email, override, and retention contracts pass.",
    argv: [
      "bun",
      "run",
      "test",
      "--run",
      "convex/cost_documents.test.ts",
      "convex/quote_response_templates.test.ts",
      "convex/quote_rounds.test.ts",
      "convex/email_transport.test.ts",
      "convex/administrative_override_policy.test.ts",
      "convex/data_retention.test.ts",
      "--reporter=json",
    ],
    vitestJsonReport: true,
  },
  {
    id: "route-component-contracts",
    requirement:
      "Production route and component contracts pass at the public application seam.",
    argv: [
      "bun",
      "run",
      "test",
      "--run",
      ...ROUTE_COMPONENT_TESTS,
      "--reporter=json",
    ],
    vitestJsonReport: true,
  },
  {
    id: "certifier-contract",
    requirement: "The certification validator itself fails closed.",
    argv: [
      "bun",
      "run",
      "test",
      "--run",
      "scripts/cost-quote-workflow-certification.test.ts",
    ],
  },
  {
    id: "repository-tests",
    requirement: "The complete repository test suite passes.",
    argv: ["bun", "run", "test", "--run"],
  },
  {
    id: "convex-codegen",
    requirement: "Convex generated API bindings are current.",
    argv: ["bun", "x", "convex", "codegen"],
  },
  {
    id: "convex-codegen-clean",
    requirement: "Convex code generation produced no tracked binding changes.",
    argv: [
      "git",
      "status",
      "--porcelain",
      "--untracked-files=all",
      "--",
      "convex/_generated",
    ],
    requireEmptyStdout: true,
  },
  {
    id: "convex-typecheck",
    requirement: "Convex TypeScript contracts compile without emission.",
    argv: ["bun", "x", "tsc", "-p", "convex/tsconfig.json", "--noEmit"],
  },
  {
    id: "production-build",
    requirement: "The production TanStack application build succeeds.",
    argv: ["bun", "run", "build"],
  },
];

const DESKTOP_VIEWPORT = { height: 1000, width: 1440 } as const;
const MOBILE_VIEWPORT = { height: 844, width: 390 } as const;

export const COST_QUOTE_MANUAL_BROWSER_WORKFLOWS: ManualBrowserWorkflow[] = [
  {
    canonicalRoute: "/builder/builds/<buildId>?tab=costs",
    id: "cost.builder-owner.desktop",
    operations: [
      "capture-multi-page-batch",
      "save-exact-multi-allocation",
      "publish-and-open-receipt",
      "inspect-roadmap-reconciliation-and-progressive-detail",
      "correct-and-void",
      "privately-download-page",
    ],
    persona: "Builder Owner",
    recoveryScenarios: ["likely-duplicate-override", "interrupted-upload"],
    requirement:
      "Create a multi-page batch, allocate, publish, open reconciliation/detail, correct, void, and privately download.",
    targetViewport: DESKTOP_VIEWPORT,
    viewport: "desktop",
  },
  {
    canonicalRoute: "/builder/builds/<buildId>?tab=costs",
    id: "cost.builder-owner.mobile",
    operations: [
      "capture-cost-document",
      "inspect-progressive-detail",
      "privately-download-page",
    ],
    persona: "Builder Owner",
    recoveryScenarios: ["partial-upload-recovery"],
    requirement:
      "Repeat capture, progressive detail, and private download at a compact viewport.",
    targetViewport: MOBILE_VIEWPORT,
    viewport: "mobile",
  },
  {
    canonicalRoute: "/builder-staff/builds/<buildId>?tab=costs",
    id: "cost.builder-staff.desktop",
    operations: ["open-shared-draft", "edit-exact-draft", "submit-in-scope"],
    persona: "Builder Staff",
    recoveryScenarios: ["draft-revocation", "stale-assignment"],
    requirement:
      "Exercise exact Draft collaboration and assignment-scoped Cost access.",
    targetViewport: DESKTOP_VIEWPORT,
    viewport: "desktop",
  },
  {
    canonicalRoute: "/homeowner/builds/<buildId>?tab=costs",
    id: "cost.homeowner.mobile",
    operations: ["capture-in-homeowner-capacity", "inspect-redacted-detail"],
    persona: "Homeowner",
    recoveryScenarios: ["assignment-removal"],
    requirement:
      "Exercise capacity-pinned capture and redacted immutable detail.",
    targetViewport: MOBILE_VIEWPORT,
    viewport: "mobile",
  },
  {
    canonicalRoute: "/contractor/builds/<buildId>",
    id: "cost.contractor.desktop",
    operations: ["capture-in-assigned-scope", "submit", "inspect-own-record"],
    persona: "Contractor",
    recoveryScenarios: ["assignment-revocation", "stale-draft-denial"],
    requirement:
      "Exercise assignment-scoped capture, submission, and revoked-scope denial.",
    targetViewport: DESKTOP_VIEWPORT,
    viewport: "desktop",
  },
  {
    canonicalRoute: "/backoffice/builds/<buildId>?tab=costs",
    id: "cost.backoffice.desktop",
    operations: [
      "inspect-private-detail",
      "annotate-review",
      "record-correction-or-void",
      "inspect-integrity-exception",
    ],
    persona: "Backoffice",
    recoveryScenarios: ["missing-private-file", "break-glass-denial"],
    requirement:
      "Exercise review annotation, correction/void authority, integrity exceptions, and private detail.",
    targetViewport: DESKTOP_VIEWPORT,
    viewport: "desktop",
  },
  {
    canonicalRoute: "/builder/builds/<buildId>?tab=quotes",
    id: "quote.builder-owner.desktop",
    operations: [
      "publish-combined-round",
      "inspect-control-register-and-comparison",
      "select-and-clear-preferred",
      "close-and-reopen",
    ],
    persona: "Builder Owner",
    recoveryScenarios: ["package-supersession", "deadline-race"],
    requirement:
      "Publish a Combined Round, inspect Control Register/comparison, select and clear Preferred, close, and reopen.",
    targetViewport: DESKTOP_VIEWPORT,
    viewport: "desktop",
  },
  {
    canonicalRoute: "/builder-staff/builds/<buildId>?tab=quotes",
    id: "quote.builder-staff.desktop",
    operations: ["author-admitted-round", "inspect-register"],
    persona: "Builder Staff",
    recoveryScenarios: ["current-role-revocation"],
    requirement: "Exercise admitted Quote authoring and stale-role denial.",
    targetViewport: DESKTOP_VIEWPORT,
    viewport: "desktop",
  },
  {
    canonicalRoute: "/homeowner/builds/<buildId>?tab=quotes",
    id: "quote.homeowner.mobile",
    operations: ["inspect-redacted-register", "inspect-read-only-comparison"],
    persona: "Homeowner",
    recoveryScenarios: ["authoring-control-denial"],
    requirement:
      "Inspect redacted read-only register and comparison without authoring controls.",
    targetViewport: MOBILE_VIEWPORT,
    viewport: "mobile",
  },
  {
    canonicalRoute: "/quote-invitation/<magicToken>",
    id: "quote.recipient.desktop",
    operations: [
      "exchange-reusable-access",
      "autosave-field-ledger",
      "submit-revise-and-withdraw",
      "inspect-immutable-receipt",
    ],
    persona: "Provisional Contractor or Supplier recipient",
    recoveryScenarios: [
      "stale-autosave",
      "idempotent-submit-retry",
      "deadline-and-reopen",
      "rotated-or-revoked-access",
    ],
    requirement:
      "Exchange reusable access, autosave Field Ledger, submit, revise, withdraw, and observe deadline/reopen behavior.",
    targetViewport: DESKTOP_VIEWPORT,
    viewport: "desktop",
  },
  {
    canonicalRoute: "/quote-invitation/<magicToken>",
    id: "quote.recipient.mobile",
    operations: [
      "exchange-reusable-access",
      "autosave-field-ledger",
      "inspect-immutable-receipt",
    ],
    persona: "Provisional Contractor or Supplier recipient",
    recoveryScenarios: ["expired-access", "revoked-claimed-content"],
    requirement:
      "Repeat Field Ledger access, autosave, and immutable receipt inspection at a compact viewport.",
    targetViewport: MOBILE_VIEWPORT,
    viewport: "mobile",
  },
  {
    canonicalRoute: "/backoffice/builds/<buildId>?tab=quotes",
    id: "quote.backoffice.desktop",
    operations: [
      "inspect-read-only-register-and-comparison",
      "inspect-delivery-recovery",
      "perform-governed-administrative-recovery",
    ],
    persona: "Backoffice",
    recoveryScenarios: ["permanent-delivery-failure", "break-glass-denial"],
    requirement:
      "Inspect read-only register/comparison, delivery recovery, and governed administrative recovery.",
    targetViewport: DESKTOP_VIEWPORT,
    viewport: "desktop",
  },
];

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown) {
  return Array.isArray(value) &&
    value.every((entry): entry is string => typeof entry === "string")
    ? value
    : undefined;
}

function validDevicePixelRatio(value: unknown) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0.5 &&
    value <= 4
    ? value
    : undefined;
}

function isUniformViewportRaster(
  dimensions: { height: number; width: number },
  targetViewport: { height: number; width: number }
) {
  const widthScale = dimensions.width / targetViewport.width;
  const heightScale = dimensions.height / targetViewport.height;
  return (
    widthScale >= 0.5 &&
    widthScale <= 4 &&
    heightScale >= 0.5 &&
    heightScale <= 4 &&
    Math.abs(widthScale - heightScale) <= 0.002
  );
}

function isPng(value: Buffer) {
  return (
    value.length >= 45 &&
    value.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) &&
    value.readUInt32BE(8) === 13 &&
    value.subarray(12, 16).toString("ascii") === "IHDR" &&
    value.readUInt32BE(16) > 0 &&
    value.readUInt32BE(20) > 0 &&
    value.readUInt32BE(value.length - 12) === 0 &&
    value.subarray(value.length - 8, value.length - 4).toString("ascii") ===
      "IEND"
  );
}

function pngDimensions(value: Buffer) {
  return { height: value.readUInt32BE(20), width: value.readUInt32BE(16) };
}

function isValidHttpOrigin(value: string) {
  if (value.includes("<") || value.includes(">")) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

function isValidIsoDate(value: string) {
  if (!ISO_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

function serializeCommand(argv: string[]) {
  return argv
    .map((argument) =>
      SAFE_SHELL_ARGUMENT_PATTERN.test(argument)
        ? argument
        : `'${argument.replaceAll("'", `'\\''`)}'`
    )
    .join(" ");
}

function sha256(input: string | Buffer) {
  return createHash("sha256").update(input).digest("hex");
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectExecution) {
  try {
    runCostQuoteWorkflowCertification(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
