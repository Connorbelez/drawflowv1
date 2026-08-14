# Phase 2 handoff — Proposal lifecycle

Handoff ID: LP-HO-P2

Status: `LP-P2-01` implementation-complete and CodeRabbit-clean; no Phase 2
package is active while its evidence is recorded.

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
2. Confirm the accepted Phase 1 interfaces. Completion criterion:
   `getLenderOrganizationManagement`, `listCurrentUserOrganizations`,
   `LENDER_MEMBERSHIP_CONSUMER_HANDOFFS`, active-organization authorization,
   and WorkOS-first management operations are confirmed or this handoff and its
   affected packets are revised before implementation.
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
  `convex/authz.ts`, `convex/workosProjection.ts`, and the accepted Phase 1
  evidence;
- audit and provisioning: `convex/brokerageProvisioning.ts` and the canonical
  audit-event schema/migrations;
- Back Office proposal consumers:
  `src/routes/backoffice/proposals.$planId.tsx`,
  `src/routes/backoffice/proposals/index.tsx`, and existing production
  proposal components;
- source contract: feature brief proposal lifecycle sections, spec User Stories
  15–18 and 33–42, implementation plan Phase 2, and the four Phase 2 packets.

Search the implementation checkout before adding an owner. Extend the highest
canonical seam and record any changed owner in the evidence.

## Package sequence and safe parallel lanes

1. `LP-P2-01` defines the canonical proposal lifecycle state machine.
2. `LP-P2-02` adds external assignment intervals and withdrawal after
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
  membership eligibility from Phase 1 plus persisted proposal assignment. It
  does not create another organization or membership authority.

## Required verification and exact-commit evidence

Each implementation packet records its candidate SHA, diff, focused commands,
authorization cases, audit assertions, affected consumers, and reviewer result
using `evidence-template.md`. Required phase evidence includes:

- Convex codegen and typecheck;
- proposal state, assignment, withdrawal, closing, activation, authorization,
  audit, replay, and concurrency suites;
- production route/component tests and direct-promotion parity for
  `LP-PROT-ASSIGN`;
- E2E-01, E2E-02, and E2E-04 at real participant boundaries;
- build and `bun run validate:lender-portal-execution` on the certification
  SHA.

Evidence is stale after any behavior-bearing change to the accepted SHA.
`LP-P2-05` is read-only and must reject the phase when a required result is
missing, qualified, or bound to another checkout.

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
