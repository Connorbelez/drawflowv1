# Production Foundation Proposal Flow Implementation Notes

Created: 2026-05-27

## Scope Landed

- Added production Convex tables for brokerages, builder profiles, builder account links, contractor profiles, proposal templates, workflow rules, workflow snapshots, Build Proposals, proposal documents, permit waivers, proposal milestones, proposal submilestones, proposal draw schedule rows, proposal kanban cards, proposal events, audit events, event outbox rows, active builds, broker assignments, loan facilities, capital plans, build milestones, build submilestones, planned draw schedule rows, and capital events.
- Preserved all existing `demo_*` tables and public demo routes.
- Removed the obsolete AuthKit action-secret requirement. WorkOS AuthKit now uses `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, and `WORKOS_WEBHOOK_SECRET`; tests receive deterministic placeholders only under Vitest.
- Added fluent-convex production functions in `convex/production_proposals.ts`.
- Added deterministic production development seed data through
  `dev_seedProductionFoundation` and lifecycle scenario data through
  `dev_seedProductionProposalScenarios`.
- Seed data now includes production milestone archetypes, proposal template milestones,
  proposal template submilestones, draw schedule scenarios, and active workflow
  rules for the proposal-flow settings slice.
- Scenario seed data now creates idempotent production Build Proposals for
  draft, submitted, approval with permit, approval with permit waiver,
  request-changes, rejection, and closed/active-build paths, plus a contractor
  profile without an account link. These rows use production proposal, audit,
  outbox, kanban, active-build, loan, capital-plan, milestone, and planned-draw
  tables only.
- Added canonical production routes:
  - `/builder`
  - `/builder/proposals`
  - `/builder/proposals/new`
  - `/builder/proposals/$proposalId`
  - `/builder/proposals/$proposalId/roadmap`
  - `/backoffice/proposals`
  - `/backoffice/proposals/$planId` with production-first detection and demo fallback
  - `/backoffice/builds/$buildId` with production active-build detection and demo fallback
- Added the production proposal-flow settings slice to `/backoffice/settings`
  while preserving the existing demo settings workspace below it.
- Added production proposal UI surfaces under `src/features/production-proposals/`.
- `/builder/proposals/new` now reuses the demo Timeline Setup flow for the
  production proposal intake screen and maps the generated milestone worksheet
  directly into production Build Proposal rows. Builders resolve brokerage,
  builder profile, and template context through
  `getBuilderProposalCreateContext` instead of calling admin-only development
  seed mutations from the route.
- Added production proposal document upload plumbing:
  `generateProposalDocumentUploadUrl` returns a Convex storage upload URL,
  draft proposal document rows store real `_storage` IDs when files are
  uploaded, and proposal detail queries resolve `storageUrl` values for stored
  files.

## Lifecycle Rules

- Proposal states are exactly `draft`, `submitted`, `approved`, and `closed`.
- Request changes moves `submitted` back to `draft` and writes proposal events, audit events, and kanban updates.
- Reject records `reviewOutcome: "rejected"` without adding a fifth lifecycle state and without creating a build.
- Approval moves `submitted` to `approved`, writes audit/outbox events, and does not create an active build.
- Approval without a permit document requires an audited permit waiver by `admin` or `principle-broker`.
- Permit, budget, plan, and supporting document metadata are saved with draft
  proposal packages. Builder draft routes upload selected files to Convex
  storage before saving the returned storage ID in `proposalDocuments`.
- Backoffice users with write authority can edit proposal draw schedule rows
  after submission or approval without forcing request-changes. These edits
  preserve the proposal lifecycle state and write proposal events, audit events,
  and outbox rows with the prior and new row state.
- Closing requires an approved proposal, a reason, and a build start date. Future start dates are accepted.
- Closing moves the proposal to `closed` and creates the active build, broker assignment, loan facility, capital plan, build milestones, build submilestones, planned draw schedule rows, capital event, audit events, proposal events, and event outbox rows.
- Loan interest is recorded as starting on `funds_released`.
- Draw availability is derived from milestone budget and borrower co-pay bps.

## Authorization

- Production functions require authenticated fluent-convex chains.
- Brokerage scope resolves from the active WorkOS organization projection.
- WorkOS membership must be active before resource scope checks.
- Canonical `/builder`, `/backoffice`, and `/backoffice/user-management`
  route guards require an authenticated WorkOS session with an active
  organization. Missing organization context redirects to `/protected-access`
  with `reason=missing-organization`.
- Canonical production routes no longer synthesize
  `org_production_foundation` as a runtime fallback. Test seed data still uses
  deterministic organization IDs inside isolated fixtures.
- Backoffice roles can see brokerage proposal queues.
- Builder roles require a `builderAccountLinks` ownership row for proposal access.
- Admin and principal broker roles are required for approval, permit waiver, and closing.
- Admin, principal broker, or the assigned broker can write post-submission draw
  schedule updates. Builder roles are blocked from post-submission proposal edits.
- Contractor profiles can be created without an authenticated contractor account link.

## P0 Port Strategy

- VP-001 builder proposal list: reused `BuilderProposalListSurface` from `src/features/builder-dashboard/BuilderTimelineDashboard.tsx` through a production kanban-to-timeline-row adapter.
- VP-002 project setup: `/builder/proposals/new` reuses
  `TimelineSetupFlow` from `src/routes/demo/timeline/-TimelineSetupFlow.tsx`
  with production template context.
- VP-003 milestones and budget: `/builder/proposals/new` reuses
  `TimelineMilestoneWorksheetTable` through the same `TimelineSetupFlow`
  Step 2 path and persists generated rows to production proposal milestones,
  submilestones, and draw schedule rows.
- VP-004 roadmap: production route reuses `AnimatedCurvedTimeline` from `src/components/roadmap/AnimatedCurvedTimeline.tsx`.
  It also reuses the demo `TimelineCashflowCompoundChart` and
  `TimelineDrawAvailabilityChart` components with a production proposal adapter
  so the canonical roadmap preserves the cashflow and draw-availability
  analysis affordances from the demo workspace.

## Visual Parity

Captured public demo baselines at `1440x1000`, `1024x768`, and `390x844`:

- `reports/visual-parity/vp-001/baseline-*.png`
- `reports/visual-parity/vp-002/baseline-*.png`
- `reports/visual-parity/vp-003/baseline-*.png`
- `reports/visual-parity/vp-004/baseline-*.png`

Captured production canonical route screenshots at `1440x1000`, `1024x768`,
and `390x844`:

- `reports/visual-parity/vp-001/production-*.png`
- `reports/visual-parity/vp-002/production-*.png`
- `reports/visual-parity/vp-003/production-*.png`
- `reports/visual-parity/vp-004/production-*.png`

Production screenshots are captured with `bun run visual:production`, which
starts Vite in a local-only visual parity fixture mode. The fixture mode returns
a deterministic WorkOS-shaped route context and skips live Convex subscriptions
for the four canonical P0 screenshot routes so screenshots can be captured when
the browser has no real WorkOS session. It is gated by
`DRAWFLOW_VISUAL_PARITY_FIXTURE=1` and
`VITE_DRAWFLOW_VISUAL_PARITY_FIXTURE=1`, is disabled in production builds, and
does not change normal route behavior.

Normal unauthenticated production route behavior still fails closed. Opening
`http://localhost:3000/backoffice` without a WorkOS session redirects to the
WorkOS sign-in page and `getAuth()` reports `userPresent: false`,
`organizationId: null`, and no token. Production workspaces require an active
WorkOS organization rather than falling back to a synthetic organization ID.

## Verification

- `bun x convex codegen --typecheck disable`
- `bun x tsc -p convex/tsconfig.json --noEmit`
- `bun run test`
- `bun run build`

Latest run on 2026-05-27:

- `bun x convex codegen --typecheck disable && bun x tsc -p convex/tsconfig.json --noEmit && bun run test && bun run build`
- Result before storage upload wiring: 35 test files passed, 202 tests passed,
  build passed.

Additional focused storage verification:

- `bun x convex codegen --typecheck disable && bun x tsc -p convex/tsconfig.json --noEmit && bun run test convex/production_proposals.test.ts src/features/production-proposals/ProductionProposalSurfaces.test.tsx`
- Result: 2 test files passed, 16 tests passed.

Latest full run after production roadmap chart parity wiring:

- `bun x convex codegen --typecheck disable && bun x tsc -p convex/tsconfig.json --noEmit && bun run test && bun run build`
- Result: 37 test files passed, 210 tests passed, build passed.

Latest full run after fail-closed WorkOS organization route guard hardening:

- `bun x convex codegen --typecheck disable && bun x tsc -p convex/tsconfig.json --noEmit && bun run test && bun run build`
- Result: 37 test files passed, 210 tests passed, build passed.

Latest full run after production visual parity screenshot fixture wiring:

- `bun x convex codegen --typecheck disable && bun x tsc -p convex/tsconfig.json --noEmit && bun run test && bun run build`
- Result: 37 test files passed, 210 tests passed, build passed.

Additional production visual parity capture verification:

- `bun run visual:production`
- Result: production screenshots captured for VP-001 through VP-004 at
  `1440x1000`, `1024x768`, and `390x844`.

Additional focused scenario seed verification:

- `bun run test convex/production_proposals.test.ts`
- Result: 1 test file passed, 10 tests passed.
