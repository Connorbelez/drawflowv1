# DrawFlow Core Build Workspace Demo — Compact PRD + Agent Implementation Instructions

## 1. Purpose

Build a functional internal demo of the DrawFlow Core Build Workspace. This is not a static UI mock. The demo must prove that the workspace interactions are real: controls mutate live Convex demo state, derived projections update, validation/invariants are enforced, audit/outbox records are written, and Playwright tests verify the user flows.

The demo has two isolated routes:

- `/demo/drawflow/proposal` — Proposal Builder: editable draft planning workspace ending at `Submit Proposal`.
- `/demo/drawflow/active` — Active Build Workspace: seeded active reimbursement workflow for milestone completion, evidence, review, site visit, approval, automatic draw release, and capital unblocking.

The active route is the default landing route.

## 2. Source-of-Truth Resources

Before implementing any slice, read the relevant source documents in this order:

1. **AGENTS.md** — repo conventions, tech stack, architecture rules, test expectations.
2. **DrawFlow Demo Interaction Specification** — authoritative product/interaction contract source. Use the contract IDs directly.
3. **DrawFlow Demo Implementation Companion** — component manifest, route/file manifest, testing and coverage matrix conventions.
4. Existing repo code for routing, Convex usage, UI primitives, Gantt starter, shadcn components, and Playwright setup.

Do not implement from memory. For every component or mutation, identify the relevant interaction contract IDs first, then implement exactly those behaviors.

## 3. Non-Negotiable Product Rules

- Convex is the domain source of truth.
- Zustand must not be used for domain state.
- All demo tables must use the `demo_` prefix.
- All public Convex demo functions must use the `demo_` prefix.
- Every visible enabled control must have a real handler.
- No dummy buttons, no fake drag handles, no `Coming soon` behavior on enabled controls.
- React state is allowed only for ephemeral view state: selected milestone, open drawer, current persona, time resolution, column size slider, drag preview, temporary form drafts.
- Active Build baseline dates and approved draw-group membership are immutable.
- Proposal Builder may persist invalid draft states, but must surface errors/warnings and block submission.
- System hard dependencies on seeded milestones cannot be removed.
- All material mutations must append audit events.
- Completion/submission/review/site-visit/approval/draw-release events must append mock event-outbox records.
- Playwright tests must verify behavior, not rendering alone.
- Every Playwright test title must map to a user flow or interaction contract ID.
- Final delivery must include a visible coverage matrix mapping controls/contracts/functions/tests.

## 4. Demo Domain Snapshot

### 4.1 Project

- Name: `Maple Ridge Townhomes`
- Subtitle: `Phase 1 reimbursement proposal · Hamilton, ON · reimbursement only`
- Total included milestone value: `$1,963,000`
- Working capital cap: `$260,000`
- Flat draw fee: `$500` per non-zero draw
- Interest: `12.00% annual nominal`, daily compounding, Actual/365
- Seed project start: `2026-01-05`
- Seed today: `2026-05-08`
- Seed payoff/takeout: `2027-01-05`

### 4.2 Milestones

Every legible budget row is a milestone. There are no non-Gantt budget rows. The unlabeled `$10,000` row is omitted. The seeded catalog contains 44 cleaned milestones.

### 4.3 Proposal Scenario

Proposal Builder starts with:

- all 44 cleaned milestones,
- builder-provided messy row order,
- naive draw groups under the `$260,000` cap,
- editable `draft` status,
- initial JIT validation spinner, then warnings/errors,
- Submit Proposal disabled until hard errors are resolved.

Proposal Builder ends at `Submit Proposal`. Approval is out of scope.

### 4.4 Active Scenario

Active Build starts with:

- Draw 1 historically `release_approved`.
- Draw 2 active.
- Draw 3 future preview.

Draw 1: `$216,500`, release-approved.

- Permits
- Drawings / Insurance
- DC / ED
- Utilities Disconnect
- Temp Fencing
- Tree Removal
- Demo / Excavation
- Shoring

Draw 2: `$232,000`, active.

- Foundation — `in_progress_behind_schedule`, 80%, requires site visit.
- Underground Plumbing — `planned`, blocked by Foundation.
- Water / Sewer — `in_progress_on_schedule`, 60%.
- Lumber — `completion_approved`, 100%.

Draw 3: `$241,000`, future.

- Framing — initially `capital_blocked` and `hard_dependency_blocked`.
- General Labour
- Roof Flat / Shingles — blocked by Framing.
- Aluminum Windows — blocked by Framing.

## 5. Primary User Flows

### 5.1 Active Build Happy Path

1. Builder Lead opens Foundation detail sheet.
2. Builder marks Foundation complete.
3. Builder adds real or sample evidence.
4. Builder optionally requests less than the approved amount, creating rollover buffer.
5. Builder submits completion claim.
6. Lender Admin reviews/accepts evidence.
7. Lender Admin requests site visit.
8. Site Visitor claims and submits site visit report.
9. Lender Admin approves Foundation completion.
10. Underground Plumbing loses hard dependency block.
11. Builder completes/submits Underground Plumbing.
12. Lender Admin approves Underground Plumbing.
13. Builder completes/submits Water / Sewer.
14. Lender Admin approves Water / Sewer.
15. Draw 2 automatically transitions to `release_approved`.
16. Draw 3 becomes capital-reachable.
17. Framing loses `capital_blocked` and becomes ready if all hard blockers are satisfied.

### 5.2 Proposal Builder Happy Path

1. Builder opens proposal route.
2. Initial JIT analysis surfaces messy-order dependency/capital warnings.
3. Builder edits milestone dates/values/durations and dependency graph.
4. Builder reorders milestone-cards and rail-cards.
5. JIT analysis recalculates warnings/cost/submit-readiness after 2–3 seconds idle.
6. Builder runs explicit Analyze Plan.
7. System creates deterministic planning run with recommended order/grouping/cost diff.
8. Builder applies recommended plan.
9. Hard ordering/cap errors clear.
10. Builder submits proposal.
11. Proposal becomes read-only and shows terminal banner: `Proposal submitted for review. Approval workflow is out of scope for this demo.`

## 6. Agent Workflow Loop

Use this loop for every slice. Do not skip steps.

### 6.1 Contract Selection

For the component, function, or workflow being implemented:

1. Find all relevant interaction contract IDs.
2. Copy the contract IDs into your working notes or task checklist.
3. Identify required Convex functions, tables, derived selectors/projection fields, UI controls, audit events, outbox events, and Playwright tests.
4. If a visible control has no contract, either map it to an existing contract, create a small local implementation note, or render it disabled with a clear reason.

### 6.2 Test-First Behavioral Skeleton

Before or alongside implementation, create/extend Playwright tests with contract-ID titles.

Tests must assert at least one real behavioral outcome:

- Convex-backed state changes visible in UI.
- Derived blocking reason changes.
- Gantt geometry changes.
- Draw group shifts.
- Audit event appears.
- Outbox event appears.
- Disabled/blocked action explains why.
- Reset restores seed state.

A render-only smoke test is not sufficient.

### 6.3 Convex First, UI Second

For each behavior:

1. Implement/extend schema if needed.
2. Implement mutation/query/helper.
3. Implement derived workspace projection.
4. Implement UI wiring.
5. Verify the UI uses projection fields rather than rebuilding domain rules locally.
6. Add audit/outbox emission where required.
7. Run the targeted Playwright test.

### 6.4 Slice Completion Gate

A slice is not complete until:

- the relevant contract tests pass,
- all enabled controls in the slice have real handlers,
- audit/outbox behavior is implemented where specified,
- no TODO/punt remains in the behavior path,
- the coverage matrix is updated.

## 7. Work Chunking Plan / Implementation Checklist

### Phase 0 — Reconnaissance and Setup

- [ ] Read AGENTS.md.
- [ ] Locate existing app routing conventions.
- [ ] Locate Convex schema/function patterns.
- [ ] Locate current UI primitives and shadcn setup.
- [ ] Locate or create Gantt starter component area.
- [ ] Locate Playwright config and fixture patterns.
- [ ] Create implementation checklist with contract IDs.

### Phase 1 — Convex Domain Foundation

- [ ] Add all `demo_` tables to Convex schema.
- [ ] Add shared demo domain types/enums.
- [ ] Implement deterministic seed data catalog.
- [ ] Implement `demo_seedDrawFlowDemo`.
- [ ] Implement `demo_cleanupDrawFlowDemo`.
- [ ] Implement `demo_resetDrawFlowDemo`.
- [ ] Verify reset is idempotent.
- [ ] Add direct dev/test reset utility if repo conventions allow.

### Phase 2 — Deterministic Engine and Projections

- [ ] Implement dependency graph validation.
- [ ] Implement construction invariant validation.
- [ ] Implement blocking reason computation.
- [ ] Implement draw group status computation.
- [ ] Implement capital-constrained cascading.
- [ ] Implement financing cost estimate.
- [ ] Implement proposal recommendation engine.
- [ ] Implement workspace projection builders.
- [ ] Ensure projection includes control capabilities and disabled reasons.

### Phase 3 — Routes and Workspace Shells

- [ ] Add `/demo/drawflow/active`.
- [ ] Add `/demo/drawflow/proposal`.
- [ ] Make active route the default demo landing route if applicable.
- [ ] Implement route-based scenario links.
- [ ] Implement active top bar with persona selector, reset, audit, outbox.
- [ ] Implement proposal top bar without audit/outbox; put audit/outbox in footer.
- [ ] Implement reset confirmation and reset behavior.

### Phase 4 — Shared Workspace Layout and Gantt Infrastructure

- [ ] Implement collapsible milestone rail.
- [ ] Implement milestone-card terminology/components.
- [ ] Implement rail-card terminology/components.
- [ ] Implement full-width scrollable Gantt area.
- [ ] Implement Days/Weeks/Months time resolution control.
- [ ] Implement column size slider.
- [ ] Implement selected milestone state.
- [ ] Implement dependency neighborhood highlighting.
- [ ] Implement start/end date runners.
- [ ] Implement draw group boxes using correct full-span geometry.
- [ ] Prevent draw group labels from overlapping rail-cards.

### Phase 5 — Proposal Builder Contracts

Implement and test these contracts:

- [ ] `IC-PROP-MILESTONE-CARD-SELECT`
- [ ] `IC-PROP-MILESTONE-REORDER`
- [ ] `IC-PROP-GANTT-MOVE`
- [ ] `IC-PROP-GANTT-RESIZE-START`
- [ ] `IC-PROP-GANTT-RESIZE-END`
- [ ] `IC-PROP-ADD-MILESTONE`
- [ ] `IC-PROP-EDIT-VALUE`
- [ ] `IC-PROP-EDIT-DURATION`
- [ ] `IC-PROP-DEPENDENCY-ADD`
- [ ] `IC-PROP-DEPENDENCY-CYCLE`
- [ ] `IC-PROP-SYSTEM-DEPENDENCY-REMOVE-BLOCKED`
- [ ] `IC-PROP-ANALYZE-PLAN`
- [ ] `IC-PROP-APPLY-RECOMMENDED-PLAN`
- [ ] `IC-PROP-SPLIT-DRAW-GROUP`
- [ ] `IC-PROP-MERGE-DRAW-GROUP`
- [ ] `IC-PROP-CAPITAL-CASCADE`
- [ ] `IC-PROP-SUBMIT-BLOCKED`
- [ ] `IC-PROP-SUBMIT-SUCCESS`

### Phase 6 — Active Build Contracts

Implement and test these contracts:

- [ ] `IC-ACT-SHELL-SCENARIO-LINK`
- [ ] `IC-ACT-SHELL-PERSONA-SELECT`
- [ ] `IC-ACT-MILESTONE-CARD-SELECT`
- [ ] `IC-ACT-RAIL-CARD-SELECT-DATE-RUNNERS`
- [ ] `IC-ACT-GANTT-RESOLUTION-CHANGE`
- [ ] `IC-ACT-GANTT-COLUMN-SIZE-SLIDER`
- [ ] `IC-ACT-MILESTONE-RAIL-COLLAPSE`
- [ ] `IC-ACT-DRAW-GROUP-BOX-GEOMETRY`
- [ ] `IC-ACT-GANTT-FORECAST-RESIZE-END`
- [ ] `IC-ACT-GANTT-FORECAST-INVALID-BLOCKS-SUBMIT`
- [ ] `IC-ACT-MILESTONE-MARK-COMPLETE`
- [ ] `IC-ACT-EVIDENCE-ADD-SAMPLE`
- [ ] `IC-ACT-EVIDENCE-UPLOAD-METADATA`
- [ ] `IC-ACT-EVIDENCE-REMOVE-DRAFT`
- [ ] `IC-ACT-SUBMIT-COMPLETION-CLAIM`
- [ ] `IC-ACT-LENDER-APPROVE-EVIDENCE`
- [ ] `IC-ACT-LENDER-REQUEST-SITE-VISIT`
- [ ] `IC-ACT-SITE-VISITOR-CLAIM-VISIT`
- [ ] `IC-ACT-SITE-VISITOR-SUBMIT-REPORT`
- [ ] `IC-ACT-LENDER-APPROVE-COMPLETION`
- [ ] `IC-ACT-LENDER-APPROVE-COMPLETION-WITH-SITE-VISIT-OVERRIDE`
- [ ] `IC-ACT-LENDER-REJECT-COMPLETION`
- [ ] `IC-ACT-DRAW-GROUP-AUTO-RELEASE`
- [ ] `IC-ACT-AUDIT-DRAWER-FILTER`
- [ ] `IC-ACT-EVENT-OUTBOX-VIEW`
- [ ] `IC-ACT-DEMO-RESET`

### Phase 7 — Audit, Outbox, and Observability Polish

- [ ] Make audit drawer append-only and filterable.
- [ ] Make outbox append-only and mock-delivered.
- [ ] Include correlation IDs.
- [ ] Include before/after summaries.
- [ ] Verify failed meaningful domain commands produce audit events where specified.
- [ ] Verify no network delivery occurs.

### Phase 8 — Hardening and Final Verification

- [ ] Run unit/type/lint checks per repo convention.
- [ ] Run all Playwright tests.
- [ ] Manually perform the active happy path.
- [ ] Manually perform the proposal happy path.
- [ ] Check all buttons/handles/dropdowns visible in the UI have real behavior or disabled explanations.
- [ ] Check no static hardcoded domain arrays are used after seed.
- [ ] Check reset restores deterministic state.
- [ ] Fill final coverage matrix.
- [ ] Prepare final implementation report.

## 8. Playwright Fixture Strategy

- Tests should reset Convex demo state before each major test or test group.
- Prefer direct Convex reset utility for speed/reliability.
- Test the UI Reset Demo control once.
- Use fixed seed dates; do not depend on actual current date.
- Use sample evidence for deterministic tests.
- Use real file metadata upload test at least once.
- For drag/drop, assert visible date/duration/draw-box/audit changes, not only pointer events.
- For JIT analysis, use deterministic waits based on UI state such as `Analyzing…` disappearing, not arbitrary sleeps where possible.
- Test names must start with or include the relevant interaction contract ID.

## 9. Final Coverage Matrix Format

The agent must maintain and submit this matrix:

| Area | Contract ID | Visible Control / Affordance | Convex Function(s) | Tables Mutated | Derived Projection Updated | Audit Event | Outbox Event | Playwright Test | Status |
|---|---|---|---|---|---|---|---|---|---|
| Proposal | IC-PROP-GANTT-RESIZE-END | Right rail-card resize handle | demo_updateProposalMilestonePlannedDates | demo_milestones, demo_auditEvents | draw boxes, cost summary, validation | ProposalMilestoneDurationChanged | none | IC-PROP-GANTT-RESIZE-END changes end date, duration, draw box, and audit log | Done |

Rules:

- Every visible enabled control must appear at least once.
- Every interaction contract must appear at least once.
- Every Playwright behavior test must map to at least one contract.
- Any intentionally disabled control must list its disabled reason and related contract.

## 10. Final Agent Response Requirements

When finished, the coding agent must report:

1. Summary of implemented phases.
2. List of changed files.
3. Commands run.
4. Test results.
5. Final coverage matrix.
6. Known deviations from the spec, if any.
7. Any controls intentionally disabled and why.
8. Any contracts not completed, with exact reason.

Do not claim completion if a visible enabled control has no real behavior.

## 11. Anti-Punting Checklist

Before finalizing, answer each item with evidence:

- [ ] Are there any enabled buttons that only toast/log?
- [ ] Are there any drag handles without drag behavior?
- [ ] Are any Playwright tests render-only?
- [ ] Does every test title map to a contract/user flow?
- [ ] Does every material mutation write audit?
- [ ] Do required external-like events write outbox records?
- [ ] Does reset truly reseed Convex state?
- [ ] Are Proposal and Active scenarios isolated?
- [ ] Are active baseline dates immutable?
- [ ] Are active draw group memberships frozen?
- [ ] Are proposal hard errors allowed to persist but blocked from submit?
- [ ] Are dependency cycles rejected before persistence?
- [ ] Are system hard dependencies protected from removal?
- [ ] Does extending an earlier draw push later draws via capital clamp?
- [ ] Does reducing an earlier draw pull later draws earlier where possible?
- [ ] Does Draw 2 auto-release when all included milestones are approved?
- [ ] Does Framing lose capital block after Draw 2 release approval?
- [ ] Does the footer/top bar placement match the route-specific design?
- [ ] Does the Gantt use full available width and scroll instead of clipping?
- [ ] Does the draw group box enclose all rows in the draw group?

