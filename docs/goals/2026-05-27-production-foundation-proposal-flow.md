# Goal Contract: Production Foundation Proposal Flow

Status: Approved
Created: 2026-05-27
Source request: Derive a `/goal` completion contract from `docs/production-foundation-proposal-flow-prd.md`.
Target workspace: `/Users/connor/Dev/drawFlow/v1/drawflowv1`

## Source Context

- User intent: Turn the production foundation and proposal flow PRD into a durable implementation contract for moving DrawFlow proposal workflows from demo routes to authenticated production routes without breaking demos.
- Source artifacts inspected: user request, `AGENTS.md` instructions, `docs/production-foundation-proposal-flow-prd.md`, `docs/draw_flow_prd.md`, `docs/draw_flow_production_prd.md`, `docs/auth-rbac-foundation.md`, `docs/vocabulary.md`, `docs/uiManifest/routeManifest.md`, `docs/goals/2026-05-26-rbac-workos-foundation.md`, `convex/_generated/ai/guidelines.md`, `convex/schema.ts`, `convex/fluent.ts`, `convex/authz.ts`, `src/lib/auth/rbac.ts`, production and demo route files under `src/routes`, proposal and workspace demo components under `src/features`, and `package.json`.
- Codebase findings: The WorkOS RBAC foundation exists: centralized frontend role policy lives in `src/lib/auth/rbac.ts`, Convex RBAC builders live in `convex/authz.ts`, and `/builder/demo` remains an unauthenticated exception.
- Codebase findings: `convex/schema.ts` still contains demo proposal/build/timeline tables and WorkOS projection tables, but it does not yet contain the production proposal, brokerage, builder, contractor, workflow rule, active build, loan, capital, document, kanban, audit, or outbox tables described by the PRD.
- Codebase findings: Existing demo surfaces for the production port include `src/features/builder-proposal-demo/BuilderProposalDemo.tsx`, `src/routes/demo/timeline/-TimelineSetupFlow.tsx`, `src/routes/demo/timeline/-TimelineMilestoneWorksheetTable.tsx`, `src/routes/demo/timeline/$timelineId.tsx`, `src/components/roadmap/AnimatedCurvedTimeline.tsx`, `src/features/builder-dashboard/BuilderTimelineDashboard.tsx`, `src/routes/backoffice/index.tsx`, and `src/routes/backoffice/proposals.$planId.tsx`.
- Codebase findings: Current backoffice proposal review and dashboard surfaces still call demo Convex functions and encode demo lifecycle assumptions where approved timeline plans are treated as active builds.
- Codebase findings: `package.json` uses Bun scripts for `dev`, `build`, `typecheck`, `test`, and `test:e2e`; verification must use Bun.

## Shared Understanding

### Desired End State

DrawFlow has a production proposal-to-approved-proposal-to-closed-active-build foundation. Builders can create, edit, save, preview roadmap output for, and submit production Build Proposals through authenticated canonical `/builder` routes. Backoffice users can review submitted proposals in authenticated canonical `/backoffice` routes, request changes, reject, approve without creating a build, and record offline loan closing with a required build start date. Recording closing moves the proposal to `closed`, creates an active Build with associated loan, capital plan, broker assignment, milestones, submilestones, planned draw schedule, permit or permit waiver link, events, and audit records. Demo routes and `demo_*` tables remain public and unchanged.

### In Scope

- Add production Convex schema, indexes, validators, and generated API for the PRD's persisted facts while preserving existing `demo_*` tables.
- Add production fluent-convex functions for brokerages, permissions, workflow rules and snapshots, builder profiles, contractor profiles, settings/templates, proposal package data, documents and waivers, proposal kanban read model, review actions, approval, closing, active build creation, audit events, and event outbox foundation.
- Enforce WorkOS-backed authorization at TanStack route guards, frontend query/mutation wrappers, Convex fluent middleware chains, and resource ownership checks before handler logic.
- Extend the existing RBAC foundation from broad role gates into active WorkOS organization, WorkOS membership, brokerage, proposal, build, assigned broker, builder ownership, workflow state, permission, and audit-reason enforcement.
- Implement centralized workflow rule configuration and workflow rule snapshots. Proposal submission creates the governing snapshot. Approval, request changes, rejection, and closing use the submitted proposal's snapshot. The active build created at closing links to that snapshot.
- Implement canonical builder routes: `/builder`, `/builder/proposals`, `/builder/proposals/new`, `/builder/proposals/$proposalId`, and `/builder/proposals/$proposalId/roadmap`.
- Implement canonical backoffice routes: `/backoffice`, `/backoffice/proposals`, `/backoffice/proposals/$proposalId`, `/backoffice/builds/$buildId`, and production-ready `/backoffice/settings` for the proposal-flow settings slice.
- Implement the builder proposal package as one coherent workspace with proposal identity, documents, budget and capital, template selection, milestone worksheet, draw schedule, review, readiness warnings, and submit.
- Persist permit PDFs and supporting documents through Convex storage metadata rows. Approval may proceed without a permit only when an admin or principal broker records an audited permit waiver reason.
- Persist borrower co-pay as bps and calculate milestone draw availability from milestone budget and co-pay bps. Do not add a separate global reimbursement budget source of truth unless a measured read-model need is documented.
- Materialize proposal kanban cards with exactly `draft`, `submitted`, `approved`, and `closed` columns. Move cards only through explicit workflow mutations.
- Model request-changes, reject, archive-like visibility, and review decisions as proposal events, review outcomes, secondary flags, and audit events, not as extra proposal lifecycle states.
- Allow backoffice to edit proposal draw schedule rows after submission without forcing request changes.
- Make contractor profiles creatable without authenticated contractor accounts.
- Preserve P0 visual parity for VP-001 through VP-004 by extracting/refactoring or copying/adapting the existing demo implementation. Do not rebuild these surfaces from scratch by visual approximation.
- Capture baseline and production screenshots for P0 parity screens at the PRD-specified viewports and store them under `reports/visual-parity/<screen-id>/`.
- Add development seed data for production tables sufficient to exercise builder proposal creation, submission, backoffice review, approval with permit, approval with permit waiver, request changes, rejection, closing, active build creation, and contractor profile without account link.
- Document the production proposal foundation after implementation in a dedicated docs artifact or an update to the PRD-linked implementation notes.

### Out of Scope

- Do not mutate, migrate, delete, or reuse `demo_*` tables as production source-of-truth tables.
- Do not auth-gate `/demo/*`, `/builder/demo/*`, existing demo timeline routes, existing drawflow demo routes, or existing site visit demo routes.
- Do not productionize the complete live Build Workspace after closing beyond the active build detail target and the rows needed to prove closing succeeded.
- Do not implement full draw request, draw review, draw release, milestone completion, evidence review, or site visit mobile production workflows.
- Do not implement contractor login workspace, contractor analytics, contractor smart selection, contractor recommendation ranking, or cross-brokerage builder transfer.
- Do not implement production external webhook dispatch beyond an audit/event outbox foundation.
- Do not build a GUI for workflow rule configuration beyond the settings data and production settings slice required by proposal templates, archetypes, guidance, and draw schedule scenarios.
- Do not introduce compatibility adapters that translate production data into demo data assumptions.
- Do not create new proposal lifecycle states beyond `draft`, `submitted`, `approved`, and `closed`.
- Do not create an active Build when a proposal is approved.
- Do not treat an approved proposal as a live build until closing is recorded.

### Constraints

- DrawFlow is reimbursement-only in v1. No production workflow may release proactive advance funding before work completion.
- Interest begins only after funds are released; this proposal foundation must not imply interest accrual before release.
- WorkOS remains the source of truth for users, organizations, organization membership, and organization role assignment.
- `brokerages` is a DrawFlow domain extension of a WorkOS organization projection and must not become a competing membership model.
- Every production Build, Loan, Budget or capital plan, Milestone, Draw planning row, Evidence-related future row, Site Visit-related future row, Policy or workflow rule, Webhook config or outbox row, and Audit Event must be organization-scoped through the active brokerage boundary.
- Principal broker uses the WorkOS slug `principle-broker`; product UI may display `Principal Broker`.
- Builder working capital and lender draw policy concepts must remain distinct. Borrower co-pay bps must not be collapsed into lender principal or a cash-only reimbursement field.
- Budgets must be versioned or copied for lifecycle transitions, not overwritten in place across proposal and active build boundaries.
- Material decisions and overrides require audit events with actor, role or permission context, timestamp, prior state, new state, warnings, and reason where required.
- Geofence failures in deferred evidence workflows must not discard evidence; future evidence should be marked location-unverified and routed for review.
- Production Convex application functions must use fluent-convex chains. Do not import or call raw `query`, `mutation`, `action`, `internalQuery`, `internalMutation`, or `internalAction` from `convex/_generated/server` in application function files.
- Use `convex/fluent.ts` only for shared fluent helpers, reusable chains, middleware, and validators. Do not move unrelated feature functions into it.
- Before editing Convex code in the implementation run, read `convex/_generated/ai/guidelines.md`.
- Use Bun for dependency, codegen, test, build, and script commands.
- UI wrapper or structural card-like containers must use `src/components/ui/frame.tsx`. Content cards and clickable card-like surfaces must use `src/components/ui/card.tsx`.
- Reused production UI must adapt existing components or primitives under `src/components/`; do not create replacement components from scratch when an existing component can be extracted, extended, or copied and adapted.

### Decisions

| Decision | Answer | Source |
| --- | --- | --- |
| Production data boundary | Use new non-demo production tables; leave demo tables unchanged. | PRD |
| Demo access | `/demo/*` and `/builder/demo/*` remain unauthenticated. | PRD, existing RBAC goal |
| WorkOS ownership | WorkOS owns identity, organization, membership, and role assignment. | PRD, auth foundation |
| Brokerage model | `brokerages` extends `workosOrganizations` one-to-one and is not a membership table. | PRD |
| Function style | Use fluent-convex for application functions. | AGENTS.md, Convex rules |
| Proposal lifecycle states | Use exactly `draft`, `submitted`, `approved`, and `closed`. | PRD |
| Request changes | Return proposal to `draft` and record events/audit. | PRD |
| Reject | Record audited review outcome and keep lifecycle state model unchanged. | PRD |
| Approval | Approval moves `submitted` to `approved`; it does not create a Build. | PRD |
| Closing | Closing moves `approved` to `closed` and creates active Build rows. | PRD |
| Closing start date | Closing requires a build start date and may use a future date. | PRD |
| Permit waiver | Approval without permit requires admin or principal broker audited waiver reason. | PRD |
| Proposal kanban | Materialize exactly `draft`, `submitted`, `approved`, and `closed` columns; no drag-and-drop movement. | PRD |
| Draw schedule mutability | Backoffice may edit proposal draw schedule rows after submission without request changes. | PRD |
| Workflow rules | Define workflow rules centrally and snapshot them on proposal submission. | PRD, vocabulary |
| Contractor accounts | Contractor profiles can exist without authenticated contractor accounts. | PRD |
| P0 route for roadmap | Use `/builder/proposals/$proposalId/roadmap` for VP-004. | User decision |
| P0 visual preservation | Use copy/adapt or extract/decouple/refactor from demo implementation; do not rebuild by visual approximation. | PRD |
| P0 screenshot standard | Capture baseline and production parity screenshots at `1440x1000`, `1024x768`, and `390x844` where required. | PRD |

### Assumptions

- The implementation may choose table and field names that differ from the PRD sketch when Convex constraints, generated API ergonomics, query performance, or fluent-convex composition justify it, but it must preserve the domain facts, tenant boundaries, authorization checks, lifecycle semantics, and auditability in the PRD.
- Existing demo components may be copied into production feature folders before being adapted when extracting clean presentational components would increase regression risk.
- Production proposal seed data may be deterministic local development data and does not need to mirror every demo record.
- A production active build detail target after closing can be narrower than the future full Build Workspace if it proves the active build and associated rows were created and linked correctly.

## Completion Contract

```text
/goal Implement the DrawFlow production foundation and canonical proposal flow so authenticated builders can create, edit, save, preview at `/builder/proposals/$proposalId/roadmap`, and submit production Build Proposals; authenticated backoffice users can review submitted proposals at `/backoffice/proposals`, request changes, reject, approve without creating a build, and record offline loan closing with a required build start date; closing moves the proposal to `closed` and creates the active Build, broker assignment, loan facility, capital plan, milestones, submilestones, planned draw schedule, permit or permit-waiver link, proposal events, audit events, and event outbox foundation, verified by Convex tests for schema/lifecycle/RBAC/resource ownership/workflow rules/proposal submission/approval/permit waiver/request changes/reject/closing/future start date/contractor profile without account/proposal kanban materialization, frontend route and component tests for guarded builder and backoffice routes plus proposal package and review workflows, P0 visual-parity baseline and production screenshots under `reports/visual-parity/<screen-id>/`, `bun x convex codegen`, `bun x tsc -p convex/tsconfig.json`, `bun run test`, and `bun run build` while preserving unauthenticated demo routes, unchanged `demo_*` tables, WorkOS source-of-truth semantics, reimbursement-only v1 rules, centralized workflow rules and snapshots, four proposal states only, no active build before closing, no demo-shape compatibility adapters, fluent-convex application functions, DrawFlow domain vocabulary, UI frame/card primitives, and copy/adapt or extract/decouple/refactor reuse of P0 demo surfaces. Use `docs/production-foundation-proposal-flow-prd.md`, `docs/draw_flow_prd.md`, `docs/draw_flow_production_prd.md`, `docs/vocabulary.md`, `docs/auth-rbac-foundation.md`, `docs/uiManifest/routeManifest.md`, `convex/_generated/ai/guidelines.md`, existing RBAC modules, existing demo proposal/dashboard/timeline/backoffice components, Bun, Convex storage, WorkOS AuthKit, TanStack Router, TanStack Query, fluent-convex, and the existing UI primitives under `src/components`. Between iterations, first protect domain correctness and tenant/RBAC fail-closed behavior, then land schema and workflow-rule foundations, then implement proposal lifecycle mutations with audit/read-model side effects in the same transactions, then port builder/backoffice UI by reusing demo surfaces, then seed data, then tests, then screenshots and documentation. If blocked or no valid paths remain, report the exact PRD requirement or source file at risk, the failing command or route, whether the block is caused by WorkOS organization context, Convex schema/API generation, fluent-convex limitations, storage upload constraints, route generation, visual parity capture, or a product-policy conflict, and the smallest credential, schema decision, route decision, workflow-rule decision, fixture correction, or dependency/API decision that would unlock progress.
```

## Verification Evidence

- `bun x convex codegen`.
- `bun x tsc -p convex/tsconfig.json`.
- `bun run test`.
- `bun run build`.
- Convex tests proving WorkOS role normalization still works after new middleware is added.
- Convex tests proving unauthenticated callers, wrong roles, wrong organization, wrong brokerage, unassigned brokers, and non-owner builders are rejected before handler side effects.
- Convex tests proving brokerages resolve one-to-one from WorkOS organization projections.
- Convex tests proving builder profiles and builder account links gate builder proposal access.
- Convex tests proving contractor profiles can exist with no contractor account link.
- Convex tests proving production proposal draft creation, draft update, autosave or explicit save, document metadata persistence, permit PDF link, template selection, milestone/submilestone persistence, draw schedule row persistence, readiness validation, and submission.
- Convex tests proving submitted and approved proposals reject builder edits.
- Convex tests proving workflow rule snapshots are created on submission and used by approval and closing.
- Convex tests proving request changes requires a reason, returns status to `draft`, updates kanban in the same mutation, and writes proposal/audit events.
- Convex tests proving reject requires a reason, records a review outcome and audit event, creates no active build, and does not create an extra proposal lifecycle state.
- Convex tests proving admin or principal broker can approve a submitted proposal, approval moves kanban to `approved`, writes events/audit, and creates no active build.
- Convex tests proving approval without permit PDF requires a permit waiver reason and records `documentWaivers` plus audit.
- Convex tests proving closing requires `approved` status, requires start date, accepts a future start date, moves proposal to `closed`, updates kanban in the same mutation, and creates active build rows.
- Convex tests proving the active build links to the original permit document when present or the permit waiver when waived.
- Convex tests proving active build creation copies proposal milestones, proposal submilestones, and proposal draw schedule rows into active build tables.
- Convex tests proving proposal kanban read model materializes `draft`, `submitted`, `approved`, and `closed` columns and filters visibility by principal broker, assigned broker, broker staff permission, builder ownership, and admin override.
- Frontend route tests proving `/demo/*` and `/builder/demo/*` remain unauthenticated.
- Frontend route tests proving `/builder/proposals/new`, `/builder/proposals/$proposalId`, and `/builder/proposals/$proposalId/roadmap` require authenticated builder, builder-staff, or admin access plus proposal ownership where applicable.
- Frontend route tests proving `/backoffice/proposals` and `/backoffice/proposals/$proposalId` require authenticated backoffice access plus proposal scope.
- Frontend tests proving proposal package sections render: identity, documents, budget/capital, template selection, milestone worksheet, draw schedule, readiness warnings, and submit.
- Frontend tests proving co-pay is displayed and stored as percentage/bps semantics.
- Frontend tests proving permit PDF upload state and permit waiver review state are visible.
- Frontend tests proving proposal kanban displays `draft`, `submitted`, `approved`, and `closed` lanes.
- Frontend tests proving approve moves submitted proposal to approved without creating a build.
- Frontend tests proving record-closing requires start date, creates or links to an active build detail target, and shows future start dates as valid.
- Visual parity baseline screenshots for VP-001, VP-002, VP-003, and VP-004 from demo routes.
- Visual parity production screenshots for VP-001, VP-002, VP-003, and VP-004 from canonical production routes.
- Implementation notes naming the port strategy for each P0 screen: copy/adapt or extract/decouple/refactor.
- Documentation describing production tables, route policy, lifecycle states, workflow rule snapshots, permit waiver handling, closing side effects, seeded data, and deferred scope.

## Iteration Policy

1. Read `convex/_generated/ai/guidelines.md`, the PRD, vocabulary, route manifest, RBAC foundation docs, and existing demo source before editing.
2. Inspect current git status and preserve unrelated user changes.
3. Add production schema validators and indexes without touching `demo_*` tables.
4. Add or extend fluent-convex authz middleware for identity, active organization, WorkOS membership, role, permission, brokerage, proposal scope, build scope, assigned broker/principal, builder ownership, workflow state, and audit reason.
5. Implement workflow rules and snapshots before lifecycle mutations use them.
6. Implement proposal create/save/submit/review/request-changes/reject/approve/closing mutations with proposal events, audit events, and kanban read-model updates in the same mutation where lifecycle state changes.
7. Implement closing copy/link semantics for active build, loan facility, capital plan, broker assignment, milestones, submilestones, planned draw schedule, permit document, and permit waiver.
8. Implement production query/mutation wrappers and canonical route guards.
9. Port P0 builder dashboard, proposal setup, milestone worksheet, and roadmap screens by copy/adapt or extract/decouple/refactor from the existing demo code.
10. Implement backoffice proposal kanban and review detail by reusing existing backoffice surfaces where possible and replacing demo data calls with production functions.
11. Add deterministic production seed data.
12. Add focused Convex and frontend tests for each lifecycle and access boundary.
13. Run codegen, Convex typecheck, tests, and build; fix failures by tracing the failing invariant before changing behavior.
14. Capture visual parity screenshots after routes render with seeded data.
15. Update documentation and final implementation notes after commands and screenshots are complete.

## Blocked Policy

If blocked, report:

- The exact source requirement that cannot be satisfied, with file path and section or nearby heading.
- The exact command, route, test, or screenshot capture that proves the block.
- Whether the block is due to WorkOS organization context, missing credentials, Convex schema or generated API constraints, fluent-convex API limitations, Convex storage upload constraints, TanStack route generation, visual parity tooling, seeded data, or conflicting product policy.
- The smallest input that would unlock progress: credential name, WorkOS organization selection rule, schema naming decision, workflow rule decision, route decision, fixture correction, dependency/API decision, or explicit product exception.
- The fallback paths already tried and why they failed.

Do not bypass a block by mutating demo tables, by adding a fifth proposal state, by creating a Build on approval, by treating route params as authorization, by moving production feature functions into `convex/fluent.ts`, by scattering workflow rules across route handlers and Convex handlers, by rebuilding P0 UI from scratch, or by hiding failed visual parity evidence.

## Ambiguity Audit

- No material ambiguity remains for this implementation contract.
- Accepted implementation flexibility: production table and field names may vary from the PRD sketch when implementation evidence supports the change, but domain facts, tenant scope, authorization, lifecycle semantics, auditability, and verification evidence must remain intact.
- Accepted route decision: VP-004 lands at `/builder/proposals/$proposalId/roadmap`.
- Accepted active-build-detail boundary: this slice creates and routes to an active build detail target after closing, but the complete live Build Workspace productionization remains out of scope.
- Accepted deferred scope: draw request/release, site visit mobile, evidence review production workflows, contractor workspace, external webhook dispatch, and workflow-rule GUI remain future work.
