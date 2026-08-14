# Phase 7 handoff — Participant projections and portal surfaces

Handoff ID: LP-HO-P7

Status: ready; no work package is authorized to start by this
document alone.

## Phase 1 baseline

Use accepted Phase 1 product SHA
`6ba68e82a7c445074b11ae7f08f3c901a3c3b2b9` as the shell,
active-organization, membership, organization-management, and later-consumer
input baseline. `LP-P1-05` supplies exact-SHA evidence.

The candidate directly promotes Organization Management Variant E at
`/lender/organization` and adds
`getLenderOrganizationManagement`. Confirm these owners on the actual Phase 7
target checkout before implementation.

The accepted query uses typed projection rows plus paginated
`getLenderOrganizationManagement` results with `continueCursor` and `isDone`.
The route accumulation behavior is part of the accepted Phase 1 contract.

## Entry prerequisites

1. Verify `LP-P1-05`, `LP-P2-05`, `LP-P4-04`, `LP-P5-05`, and
   `LP-P6-05` with exact evidence.
2. Confirm the accepted Phase 1 route, component, query, authorization, and
   membership-consumer interfaces. Completion criterion:
   LenderShell, organization route, active organization context, and future
   queue input contract are current in this handoff.
3. Re-run the route manifest and transition-consumer inventory on the target
   HEAD. Completion criterion: every Back Office, lender, and Builder reader,
   action, count, queue, history, and notification input has an owner.
4. Read every selected surface entry in
   `src/components/prototypes/README.md` and the promotion contract before its
   UI packet starts.
5. Validate the exact target checkout before `LP-P7-01` starts.

## Canonical owners and context pointers

- organization shell/context: accepted Phase 1 `src/components/lender-shell.tsx`,
  `src/routes/lender/route.tsx`, `src/routes/lender/organization.tsx`,
  `convex/authz.ts`, and `convex/workosProjection.ts`;
- proposal/Build/Milestone/Draw/evidence projections: certified Phase 2–6
  owners and exact evidence;
- production lender routes: `src/routes/lender/index.tsx`,
  `src/routes/lender/builds/$buildId.tsx`,
  `src/routes/lender/milestones.tsx`, `src/routes/lender/draws.tsx`, and
  `src/routes/lender/proposals/$proposalId.tsx`;
- shared sheets: `src/features/backoffice-build-detail/MilestoneDetailSheet.tsx`
  and `src/features/draw-workflow/DrawReviewSheet.tsx`;
- source contract: portal/privacy sections, User Stories 67–76, E2E-09,
  implementation plan Phase 7, promotion contract, and seven Phase 7 packets.

Load only the selected prototype route/components for the active UI lane.
Existing shared components are extended or extracted; they are not copied.

## Package sequence and safe parallel lanes

1. Foundation: `LP-P7-01` completes participant projections, counts,
   Needs-my-action, and the transition-consumer ledger.
2. After the foundation, four independent surface lanes may run:
   - `LP-P7-02`: Lender Dashboard Variant D;
   - `LP-P7-03`: Lender Build Detail Variant C;
   - `LP-P7-04`: Milestone Queue Variant C and shared sheet;
   - `LP-P7-05`: Draw Queue Variant D and shared sheet.
3. Join: `LP-P7-06` completes paired Back Office/Builder consumers,
   LenderShell integration, withdrawn records, and cross-surface states.
4. Certification: `LP-P7-07` accepts all projections and surfaces.

Each UI lane owns only its selected route/components and focused tests.
Coordinate shared shell, table, filter, and sheet edits before merge. The join
packet owns cross-surface reconciliation.

## Participant and prototype contracts

- Needs my action derives from current membership, assignment, request cycle,
  and outstanding policy requirements; all-assigned includes every assigned
  item.
- Server loaders remove deferred and unauthorized fields. UI visibility is not
  the security boundary.
- Directly promote Dashboard D, Build Detail C, Milestone Queue C, and Draw
  Queue D from their selected routes/components.
- Reuse the canonical MilestoneDetailSheet and DrawReviewSheet with route-aware
  actions and permission caps.
- Builder and Back Office surfaces remain actionable for the same transitions;
  Builder-safe loaders omit reviewer identity and private rationale.
- Build Detail stays narrow: no lender dependency on Gantt/timeline,
  contractors, internal notes, or the broad document library.

## Required verification and exact-commit evidence

Foundation evidence records projection types, field inventories, counts/rows,
membership/cycle fixtures, and changed consumers. Each UI lane records its exact
selected prototype, production import, candidate SHA, screenshot/interaction
evidence, accessibility results, and focused tests. Required phase proof:

- authorization, field-absence, count/row equality, Needs-my-action, rebuild,
  withdrawn, and membership-change tests;
- route, loader, navigation, shared-sheet, and participant integration tests;
- visual/interaction parity for all five confirmed portal surfaces, including
  accepted Phase 1 Organization Management Variant E;
- loading, empty, forbidden, withdrawn, stale, correction, partial approval,
  concurrency, keyboard, focus, responsive, error-summary, and live-status
  acceptance;
- E2E-09 plus build and execution validation on the merged SHA.

`LP-P7-07` is a fresh read-only review. Prototype evidence from a comparison
route or different SHA does not pass.

## Rollback and escalation

Rollback disables or reverts the affected route/loader while canonical domain
state and evidence remain intact. Preserve selected prototype source and shared
component call sites. Escalate when a loader requires deferred fields, a queue
count cannot reconcile to rows, a transition lacks a paired participant
surface, a shared component change regresses an existing call site, or final
Phase 1 shell/organization interfaces differ from the provisional baseline.

Return conflicts to the foundation or owning domain packet. Do not compensate
with client filtering, duplicate projections, copied sheets, or redesigned
prototype hierarchy.

## Binary phase exit gate

Phase 7 passes only when `LP-P7-01` through `LP-P7-06` are independently
accepted, `LP-P7-07` proves all five confirmed portal surfaces and every
paired participant transition on one exact SHA, privacy and accessibility pass,
all counts reconcile, and every Phase 7 ledger record is verified.
