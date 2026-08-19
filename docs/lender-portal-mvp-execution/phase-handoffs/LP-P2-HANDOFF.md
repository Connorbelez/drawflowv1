# Phase 2 handoff — Proposal lifecycle

Handoff ID: LP-HO-P2

Status: `LP-P2-01` through `LP-P2-04` implementation-complete; `LP-P2-05`
remains the independent Phase 2 certification package on the dedicated
checkout.

## Ownership correction addendum — 2026-08-14

This handoff's earlier references to a WorkOS-backed Lender Organization are
superseded. WorkOS cannot provision a Lender Organization. The production
hierarchy is `Brokerage → Lender Organization → assigned lender users`, where
Lender Organizations, workflow permissions, and user assignments are
application-owned. WorkOS remains the shared identity container for users,
invitations, exact lender roles (`lender`, `lender-admin`, `lender-staff`),
memberships, and read-only projections.

The control-plane entry point is `/backoffice/lenders`. The lender-facing
`/lender/organization` route is app-level and shows a contact-admin empty state
without WorkOS directory data when no active assignment exists. The active
implementation checkout contains this correction plus migration helpers and
focused tests; it is dirty and is not being represented as an independently
certified Phase 2 SHA by this addendum.

## Phase 1 baseline

This handoff is reconciled to the accepted Phase 1 implementation:

- task: `019ffe80-df8f-7a62-8d09-74882be38877`;
- branch: `codex/lp-phase-1-completion`;
- accepted product SHA: `6ba68e82a7c445074b11ae7f08f3c901a3c3b2b9`;
- certification: `LP-P1-05` verified with exact-SHA evidence at
  `docs/lender-portal-mvp-execution/evidence/LP-P1-05-6ba68e82.md`.

The final candidate-to-accepted delta is reconciled. Phase 2 must still rerun
its fresh proposal inventory on the actual target checkout before implementation.

## Entry prerequisites

1. Confirm the accepted Phase 1 product SHA in the implementation checkout.
   Completion criterion: `LP-P1-05` is verified with exact-SHA evidence and
   every Phase 1 package dependency is verified in the ledger.
2. Confirm the accepted Phase 1 interfaces and the corrected ownership seam.
   Completion criterion: shared WorkOS projections remain read-only, the app
   Lender Organization/assignment owners are identified, active-organization
   authorization resolves an explicit app assignment, and WorkOS-first
   management operations target the configured shared identity organization.
3. Re-run the proposal transition-consumer inventory on the actual target HEAD.
   Completion criterion: every lifecycle writer, projection, route, queue,
   audit consumer, and external contract is assigned to a package.
4. Run `bun run validate:lender-portal-execution`. Completion criterion: the
   validator accepts the exact target HEAD before `LP-P2-01` becomes
   `in-progress`.

## Canonical owners and context pointers

Always load repository `AGENTS.md`, Convex guidance, this handoff, and only the
active package. Reach for these owners when their branch applies:

- lifecycle and Build Proposal state: `convex/production_proposals.ts`,
  `convex/schema.ts`, and `convex/production_proposals.test.ts`;
- organization and membership eligibility:
  `convex/authz.ts`, `convex/lenderOrganizationAccess.ts`,
  `convex/lenderOrganizations.ts`, `convex/workosProjection.ts`, and the
  accepted Phase 1 evidence;
- audit and provisioning: `convex/brokerageProvisioning.ts` and the canonical
  audit-event schema/migrations;
- Back Office proposal consumers:
  `src/routes/backoffice/proposals.$planId.tsx`,
  `src/routes/backoffice/proposals/index.tsx`, and existing production
  proposal components;
- app-owned lender control plane and lender organization view:
  `src/routes/backoffice/lenders/`, `src/routes/lender/organization.tsx`,
  `convex/lenderOrganizations.ts`, and `convex/schema.ts`;
- source contract: feature brief proposal lifecycle sections, spec User Stories
  15–18 and 33–42, implementation plan Phase 2, and the four Phase 2 packets.

Search the implementation checkout before adding an owner. Extend the highest
canonical seam and record any changed owner in the evidence.

## Package sequence and safe parallel lanes

1. `LP-P2-01` defines the canonical proposal lifecycle state machine.
2. `LP-P2-02` adds lender assignment intervals and withdrawal after
   `LP-P2-01`.
3. `LP-P2-03` adds closing eligibility and separate activation after
   `LP-P2-01` and `LP-P2-02`.
4. `LP-P2-04` completes participant projections and promotes the assignment
   surface after all three domain packets.
5. `LP-P2-05` independently certifies the phase.

There is no package-level parallel lane in Phase 2. Focused tests and
read-only consumer inventories may run concurrently inside a packet, but each
state transition owner remains single-writer.

## Participant and prototype contracts

- Back Office, Builder, and lender projections expose the same canonical
  proposal lifecycle with permission-shaped fields.
- Withdrawal removes current authority while retaining bounded historical
  access and audit history.
- Closing and activation remain separate transitions; proposal approval never
  activates a Build.
- Promote `LP-PROT-ASSIGN` directly from the selected route/components.
  Production loaders and commands replace prototype data and local actions;
  the locked hierarchy is not redesigned.
- Lender assignment consumes active organization and current canonical
  shared-membership eligibility from Phase 1 plus persisted app assignment. It
  consumes `Id<"lenderOrganizations">` proposal references and does not create
  another WorkOS organization or membership authority.

## Required verification and exact-commit evidence

Each implementation packet records its candidate SHA, diff, focused commands,
authorization cases, audit assertions, affected consumers, and reviewer result
using `evidence-template.md`. Required phase evidence includes:

- Convex codegen and typecheck;
- proposal state, assignment, withdrawal, closing, activation, authorization,
  audit, replay, and concurrency suites;
- production route/component tests and direct-promotion parity for
  `LP-PROT-ASSIGN`;
- app-owned lender control-plane tests for provisioning without WorkOS
  organization creation, one-assignment enforcement, pending invitation
  reconciliation, policy caps, admin target bypass, cross-scope denial, and the
  unassigned lender empty state;
- E2E-01, E2E-02, and E2E-04 at real participant boundaries;
- build and `bun run validate:lender-portal-execution` on the certification
  SHA.

Evidence is stale after any behavior-bearing change to the accepted SHA.
`LP-P2-05` is read-only and must reject the phase when a required result is
missing, qualified, or bound to another checkout.

## Implementation-complete candidate handoff

This is an implementation handoff, not independent Phase 2 certification.

- Worktree: `/Users/connor/.codex/worktrees/lp-p2-02/drawflowv1`
- Branch: `codex/lp-phase-2-proposal-lifecycle`
- Accepted Phase 1 product SHA: `6ba68e82a7c445074b11ae7f08f3c901a3c3b2b9`
- Implementation-complete candidate SHA:
  `d6d155ab679c4cdc8f22df300b7ebad370a90a38`
- `LP-P2-01` through `LP-P2-04`: implementation-complete with exact package
  evidence and no behavior-bearing uncommitted changes.
- `LP-P2-05`: ready; a fresh verifier owns read-only browser/E2E checks,
  exact-candidate comparison, and the binary Phase 2 decision.
- Last completed targeted CodeRabbit review: base
  `c9d67318ea436c7117388086c908b1ec749b4730` through `01fadbde`; its one
  validator finding was fixed in `7d44627e`, `6c8b47d9`, and `d6d155ab`.
- Final targeted CodeRabbit closure request: rate-limited by the service; no
  clean result is claimed until that exact candidate review completes.

The candidate preserves the separate closing and activation commands, the
canonical WorkOS/organization owners, append-only assignment history, and the
directly promoted assignment surface. Convex codegen remains deployment-context
dependent in this isolated checkout and must be rerun by the certifier when a
`CONVEX_DEPLOYMENT` is available.

Candidate checks recorded before handoff:

- `bun run test -- convex/production_proposals.test.ts`: 180 passed;
- assignment surface, calendar, and assistant checks: 37 passed;
- `bun x tsc -p convex/tsconfig.json --noEmit`: passed;
- `bun run build`: passed;
- `bun run validate:lender-portal-execution`: passed in execution mode;
- `bun run validate:lender-portal-execution --release`: rejected as required
  because Phase 2 is not independently verified;
- `bun x convex codegen`: unavailable because `CONVEX_DEPLOYMENT` is not set;
- full suite: 253 files passed, 7 known unrelated suites failed, 2,607 tests
  passed, 15 failed, and 8 skipped. The Phase 2-owned focused suites remain
  green; one affected completion-review suite was confirmed with the same
  failures on the accepted Phase 1 baseline.

## Rollback and escalation

Keep proposal revisions, assignment intervals, decisions, and audit events
append-only during rollback. Disable new entry points or revert the owning
packet without deleting retained history. Escalate before continuing when:

- the final Phase 1 interface differs from the provisional contract;
- existing proposal state cannot map to the explicit lifecycle without
  inference;
- an external API, analytics, reporting, or support consumer is discovered;
- a participant transition lacks a canonical opposite-side consumer; or
- a selected prototype conflicts with the feature brief.

Record the conflict in the owning packet and return to the product owner; do not
settle it with a compatibility alias or portal-only state.

## Binary phase exit gate

Phase 2 passes only when `LP-P2-01` through `LP-P2-04` have independent
exact-commit evidence, `LP-P2-05` accepts every required journey and
participant surface, all proposal transitions are explicit and auditable, the
assignment prototype is directly promoted, and the ledger marks the Phase 2
coverage group and all five packages verified.
