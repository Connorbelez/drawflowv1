export const COST_QUOTE_CERTIFICATION_SCHEMA_VERSION =
  "cost-quote-public-workflow-certification/v1" as const;
export const COST_QUOTE_MANUAL_QA_SCHEMA_VERSION =
  "cost-quote-manual-browser-qa/v1" as const;

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
