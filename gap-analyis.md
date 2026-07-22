# Core Workflow Audit Gap Analysis

<!-- markdownlint-disable MD013 -->

**Assessment date:** 2026-07-22
**Scope:** Current working tree in `drawflowv1-core-workflow-remediation-20260717`, including the partially completed work inherited from checkpoint `42d6d212`.
**Product authority:** `docs/draw_flow_prd.md`, `docs/core-product-workflow-manifest.md`, and `AGENTS.md`.

## Executive conclusion

The workflow remediation is now functionally complete except for one deliberately blocked product-policy item.

- **38 of 39 findings are fixed.**
- **1 of 39 is blocked:** `UX-WF-TEN-003-001`, cross-brokerage Builder transfer.
- **0 findings are regressed.**
- Full automated QA passes: **151 test files / 1,147 tests**.
- Convex code generation, Convex TypeScript, production build, and workflow-manifest integrity all pass.
- Chromium QA now includes deterministic fixture coverage plus production-backed authenticated Builder and Lender Admin walkthroughs at desktop and 390×844.

The remaining transfer item is not an unfinished coding task. The workflow manifest still marks `WF-TEN-003` as `NEEDS_VALIDATION`, and the repository does not define who may authorize a transfer or how active regulated records move. Shipping a guessed transfer command would violate tenant isolation, WorkOS projection ownership, and audit-history requirements. The current implementation therefore fails closed, rejects implicit transfer, and prevents Principal cross-tenant reads.

Canonical machine-readable dispositions and per-finding proof are in `reports/core-workflow-ux-audit/remediation-summary.json`.

The authenticated repeat did not merely confirm the fixture pass: it found and closed nine additional implementation defects, including submitted-Builder mutation leakage, three responsive containment failures, a crashing Contractor detail route, invalid Site Visit interaction markup/coss composition, two broken view-mode toggles, and a stale placeholder route. Detailed route-by-route proof is in `reports/core-workflow-ux-audit/authenticated-browser-qa-report.md`.

## Audit manifest, trackers, and related artifacts

### Canonical workflow sources

- `docs/core-product-workflow-manifest.md` — generated inventory of **16 parent workflows, 63 persona segments, 52 handoffs, and 409 stable step IDs**.
- `scripts/core-workflow-manifest.ts` — manifest generator and integrity validator.
- `docs/draw_flow_prd.md` — product source of truth.
- `reports/core-workflow-ux-audit/audit-report.md` — original 39-finding audit: **4 CRITICAL, 9 BLOCKER, 23 MAJOR, 3 MODERATE**.
- `reports/core-workflow-ux-audit/agent-notes/*.md` — original detailed finding records.

### Current closeout artifacts

- `reports/core-workflow-ux-audit/remediation-summary.json` — canonical current dispositions, verification commands, changed areas, tests, evidence, risks, and human decisions.
- `reports/core-workflow-ux-audit/final-qa-report.md` — human-readable final QA record.
- `reports/core-workflow-ux-audit/evidence/final-qa/` — fresh responsive, accessibility, and interaction evidence.
- `reports/core-workflow-ux-audit/evidence/phase-4-browser-verification-blocker.md` — updated record showing the old browser blocker is resolved.
- `gap-analyis.md` — this current-state gap analysis.
- `reports/core-workflow-ux-audit/authenticated-browser-qa-report.md` — production-backed Builder/Admin route, interaction, responsive, console, repair, and evidence-limit record.
- `reports/core-workflow-ux-audit/evidence/authenticated-qa/` — authenticated DOM snapshots, measurements, and screenshots.

### Historical execution records

- `reports/core-workflow-ux-audit/remediation-ledger.md` — detailed Phase 0/3 finding plans and acceptance checklists. Its row-level statuses are historical; its reconciliation header points to current closeout artifacts.
- `reports/core-workflow-ux-audit/verification-matrix.md` — historical route/persona/test matrix, likewise superseded by the closeout summary.
- `reports/core-workflow-ux-audit/target-manifest.json` — immutable checkpoint target set; intentionally not rewritten as a closeout snapshot.
- `reports/core-workflow-ux-audit/file-lock-manifest.md` and `phase-2-execution-plan.md` — orchestration history.
- `reports/core-workflow-ux-audit/drafts/*.json` — archived workstream drafts; `drafts/README.md` records their status.
- `reports/core-workflow-ux-audit/safety/**` — checkpoint, dirty-root, overlap, and Convex safety records.

## What was partially complete and is now finished

### Active Build and audit state

- A single active-milestone projection now drives Build detail and timeline surfaces.
- Budget and draw availability are distinct fields.
- Contradictory lifecycle/submilestone/assignment states surface reconciliation warnings.
- Presentation-only timeline state no longer creates material audit events.
- Normalized no-op transitions are suppressed.
- Failed timeline saves preserve an explicit unsaved state, sanitize feedback, and support safe retry.

Closed findings: `UX-WF-BLD-001-001`, `UX-WF-BLD-001-002`, `UX-WF-DRW-001-001`.

### Draw request and review lifecycle

- Production and demo paths enforce authoritative draw availability.
- Request keys and terminal-state rules provide idempotency and collision safety.
- Concurrent requests cannot over-reserve capacity.
- Rejection requires a nonblank reason in the UI and server contract.
- Draw decisions and releases create recipient handoffs and resolve prior deliveries.
- Lender review remains authority-gated and responsive.

Closed findings: `UX-WF-DRW-001-002`, `UX-WF-DRW-001-003`, `UX-WF-DRW-001-004`.

### Proposal, budget, material, and activation flows

- Builder and lender proposal controls are role-correct.
- Compact proposal navigation preserves route/search state.
- Three plan options, explicit selection, selected-plan persistence, and submission gating are integrated across formerly stale fixtures.
- Proposal close and active-Build provisioning are transactional.
- Budget changes create immutable versions with variance, revision requests, and admin decisions.
- Material entry has one milestone-scoped action, impact preview, correct mutation payload, and accessible validation.

Closed findings: `UX-WF-PRP-001-001`, `UX-WF-PRP-001-002`, `UX-WF-PRP-001-003`, `UX-WF-BUD-001-001`, `UX-WF-BUD-001-002`, `UX-WF-MAT-001-001`, `UX-WF-MAT-001-002`.

### Tenant and identity recovery

- Builder and Principal activation failures are typed rather than raw Convex errors.
- Recovery states identify the failed layer, responsible actor, safe next action, and support reference.
- Builder-to-broker relationship state is canonical across onboarding and workspace confirmation.
- Staff access changes fail closed and expose pending/failed/deactivated state and affected-work warnings.
- Principal roster and provisioning reads are scoped to the active organization; Platform Admin retains explicit global visibility.

Closed findings: `UX-WF-TEN-001-001`, `UX-WF-TEN-002-001`, `UX-WF-TEN-002-002`, `UX-WF-TEN-004-001`.

Blocked finding: `UX-WF-TEN-003-001`.

### Contractor lifecycle and assignment handoffs

- Attached/invited contractors open through Builder-scoped detail routes with Build return paths.
- WorkOS membership acceptance is the canonical invitation transition; confirmation is bound to the authenticated user.
- Duplicate live claims are revoked and lifecycle transitions are audited.
- Attach-and-invite is atomic.
- Assignment create/update/remove uses one server contract.
- Removal requires a reason, retains history as `removed`, resolves acknowledgement, sends a contractor notice, and deactivates the root Build relationship when no active scope remains.
- Contractor receivers can acknowledge, request clarification, or dispute exact assignment scope.
- Builder resolution returns a delivery to the contractor.
- Removed/stale assignment deep links return a typed recovery state instead of a raw authorization error.
- Quick Add, validation, crew selection, invitation, editing, and removal are separated into accessible modes.

Closed findings: `UX-WF-CTR-001-001`, `UX-WF-CTR-001-002`, `UX-WF-CTR-001-003`, `UX-WF-CTR-001-004`, `UX-WF-CTR-002-001`, `UX-WF-CTR-002-002`, `UX-WF-CTR-002-003`.

### Site visits, operations, communications, and integrations

- Site-visit tokens preserve immutable organization/Build/milestone/request provenance in production and demo paths.
- Cross-Build, cross-organization, and tampered token use is rejected.
- Geofence failure retains evidence and routes review.
- Consumed tokens are terminal and idempotent.
- Operations queues cover proposal, Build, draw, milestone, and site-visit work with authority and escalation.
- Recipient inboxes are delivery-first and separate from audit history.
- Draw, release, site-visit, and contractor outcomes create deduplicated, resolvable handoffs.
- Integration delivery executes signed requests through pending/delivered/failed/retry states and redacts sensitive response data.

Closed findings: `UX-WF-MIL-001-001`, `UX-WF-MIL-001-002`, `UX-WF-MIL-001-003`, `UX-WF-OPS-001-001`, `UX-WF-COM-001-001`, `UX-WF-COM-001-002`, `UX-WF-INT-001-001`.

### Calendar and responsive workspaces

- Calendar export preserves filters and reports success/failure.
- Submitted event actions are authority-correct.
- Reminder actions are partitioned from milestone/draw mutations and cancel softly with audit history.
- Multi-day records no longer duplicate keyboard or accessibility-tree entries.
- Proposal and Build shells reflow at all target widths.
- Document horizontal overflow is eliminated at 1,024, 512, and 390 CSS pixels.
- Mobile shell controls are 44×44 CSS pixels.
- Staff fixture coverage is populated rather than blank.

Closed findings: `UX-WF-CAL-001-001`, `UX-WF-CAL-001-002`, `UX-WF-CAL-001-003`, `UX-WF-CAL-001-004`, `UX-WF-CAL-001-005`, `UX-WF-BLD-001-003`, `UX-WF-BLD-001-004`.

### Authenticated browser follow-through

- Submitted Builder proposals now fail closed for all material mutation channels, not only visible top-level buttons.
- Shared Card, Frame, Textarea, and app-header containment prevents authenticated data and long identifiers from widening 390 px pages.
- Backoffice Draw and Site Visit grouped/table toggles now use Base UI's actual controlled-array contract.
- Site Visit cards use sibling primary/copy controls, eliminating nested buttons and the unsupported `nativeButton` prop.
- The real Contractor profile route no longer crashes from a missing Button import.
- The stray `/backoffice/builders/builderId` scaffold redirects to the canonical roster.

Regression coverage was added for every repair above; the authenticated QA report records exact browser proof.

## Remaining gap

### `UX-WF-TEN-003-001` — blocked on validated transfer governance

A cross-brokerage Builder transfer must not be implemented until the following are explicit:

1. the Platform Admin capability authorized to initiate and complete transfer;
2. whether source brokerage, destination brokerage, and Builder consent are required;
3. WorkOS organization-membership sequencing and rollback behavior;
4. disposition of active Builds, Loans, Budget versions, Milestones, Draws, Evidence Packages, Site Visits, webhook configurations, and audit ownership;
5. queue reassignment and acknowledgement by newly responsible staff;
6. treatment of pending approvals and in-flight releases;
7. immutable prior/new organization history and required transfer reason;
8. denial and recovery behavior when any prerequisite fails.

Current safety posture:

- implicit reassignment to a different active broker is rejected;
- same-broker duplicate repair remains idempotent;
- Principal roster/provisioning reads cannot cross tenant boundaries;
- regression tests cover transfer rejection and tenant isolation.

This gap needs a product/legal decision and workflow-manifest validation, not speculative code.

## QA results

### Automated

- `bun run test` — **PASS: 151 files, 1,147 tests**.
- `bun x convex codegen` — **PASS**.
- `bun x tsc -p convex/tsconfig.json --noEmit` — **PASS**.
- `bun run typecheck` — **PASS**.
- `bun run build` — **PASS**.
- `bun run verify:build-warnings` — **PASS**.
- `bun run ui:html:audit` — **PASS: 78 interaction snippets**.
- `bun run scripts/core-workflow-manifest.ts --check` — **PASS: 16 parents, 63 persona segments, 52 handoffs, 409 steps**.

The mocked AuthKit `HTTPError` diagnostic in the full suite is an expected assertion path, not a test failure.

### Chromium

Deterministic fixture walkthroughs covered proposal workspace, active Build Details, Contractors, Materials, Timeline, Evidence, Staff, and Calendar at 1,440×900, 1,024×768, 512×768, and 390×844.

Production-backed authenticated walkthroughs used the supplied Builder and Lender Admin accounts at 1,280×900 and 390×844. They covered Builder dashboard/proposals/new/submitted proposal tabs/active Build tabs/Notifications/recovery and Admin dashboard/proposals/Builds/Draws/Site Visits/Builder onboarding/Contractors/User Management/Settings/Integrations.

Verified:

- submitted Builder mutation controls are absent and persistence paths are no-op after submission;
- no document-level horizontal overflow in the repaired authenticated proposal, Build, Draw, Site Visit, Contractor, dashboard, and onboarding surfaces at 390 px;
- wide Milestone Kanban content remains inside its own horizontal scroller;
- lender proposal reason gating and site-visit cancellation reason gating prevent blank audited decisions;
- Draw and Site Visit grouped/table toggles change pressed state and rendered mode;
- real Contractor detail loads without the prior `Button is not defined` crash;
- isolated post-fix Draw and Site Visit console passes have no React errors.

Evidence: `reports/core-workflow-ux-audit/evidence/final-qa/`, `reports/core-workflow-ux-audit/evidence/authenticated-qa/`, and `reports/core-workflow-ux-audit/authenticated-browser-qa-report.md`.

## Release assessment

The implemented remediation set is release-ready under the repository's configured automated gates, deterministic fixture QA, and authenticated Builder/Lender Admin browser QA. The cross-brokerage transfer feature must remain disabled/fail-closed until `WF-TEN-003` is validated and its governance contract is approved.

Authenticated repetition is still unavailable for Contractor, Inspector, Builder Staff, Lender Operations, Platform Admin, and Technical Admin personas. The live tenant also had no requested draw, and destructive/external mutations were intentionally not committed. These are evidence limits, not hidden passing claims.

A supplementary root-wide `bun x tsc --noEmit` remains outside the configured `typecheck` script and currently reports **374 strict errors across 100 files**, concentrated in legacy marketing/demo code plus a smaller set of production modules. The final diagnostic follow-up reduced `ProductionProposalSurfaces`, `ProductionBuildDetailSurface`, `ActiveBuildGanttWorkspace`, `BuildRosterSurface`, `CalendarWorkspace`, and `ContractorQuickAddDrawer` to zero errors under that same check. The remaining root debt is explicit engineering-quality work separate from the 39 workflow findings.
