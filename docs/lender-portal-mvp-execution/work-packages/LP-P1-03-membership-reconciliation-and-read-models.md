# LP-P1-03 — Membership reconciliation and read models

Status: ready

Depends on: LP-P1-01, LP-P1-02

## Objective

Make canonical membership changes propagate to every currently implemented
access, queue, recipient, assignment, quorum-context, and audit consumer. Define
an explicit handoff for later proposal and review-policy consumers without
creating their state early.

## Ownership

Extend canonical membership projections, existing read-model owners, audit and
notification-intent boundaries, and reconciliation tests. Durable WorkOS
projections remain the source; derived queues and counts remain rebuildable.

## Traceability selectors

- `LP-INV-01`
- `LP-INV-12`
- `LP-AC-ORG-05..LP-AC-ORG-07`
- `LP-US-013..LP-US-014`
- `LP-US-084`
- `LP-US-087..LP-US-088`
- `LP-E2E-08`
- `LP-P1-W08..LP-P1-W09`
- `LP-P1-T01`
- `LP-P1-T05..LP-P1-T07`
- `LP-P1-X01`
- `LP-P1-X04`
- `LP-QG-04..LP-QG-07`

## Context pointers

Load these sections only:

- `docs/lender_portal_mvp_feature_brief.md`: Domain invariants, Notifications,
  Organization and access acceptance criteria.
- `docs/lender_portal_mvp_spec.md`: Transition-Consumer Gates, E2E-08,
  Testing Decisions.
- `docs/lender_portal_mvp_implementation_plan.md`: Phase Zero
  transition-consumer ledger, Vertical-slice completion gate, Phase 1.
- Current membership projection and every repository consumer found by a fresh
  `rg` inventory on the implementation checkout.
- `convex/_generated/ai/guidelines.md` and repository `AGENTS.md`.

## Steps and completion criteria

1. Inventory all current membership-status and role consumers. Completion
   criterion: routes, queries, writes, assignments, queues, counts, recipients,
   audit, jobs, and external contracts are recorded as implemented, absent, or
   unknown rather than inferred.
2. Define one canonical post-reconciliation membership-effect boundary.
   Completion criterion: consumers respond only to canonical projected state,
   retries are idempotent, and no later-phase workflow record is fabricated.
3. Reconcile implemented access and read models after invite acceptance, role
   change, deactivation, reactivation, and Principal Broker transfer.
   Completion criterion: removed access and stale actions disappear, eligible
   replacements appear, history remains, and cross-organization projections do
   not leak.
4. Preserve locked policy ownership. Completion criterion: membership changes
   can change current eligibility and counting decisions but cannot mutate the
   immutable policy snapshot or reopen terminal work.
5. Record later-owner handoffs for proposal assignment, review quorum, queues,
   and transactional recipients. Completion criterion: each unavailable
   consumer has one named future phase and deterministic input contract.
6. Prove projection rebuildability. Completion criterion: reconciliation can be
   rerun without duplicate audit, notification intent, queue membership, or
   counting decisions.

## Required verification

- Consumer-inventory assertion covering every current membership reader
- Focused reconciliation, deactivation, history, and idempotency tests
- Projection rebuild test from canonical membership state
- `bun x convex codegen`
- `bun x tsc -p convex/tsconfig.json`
- `bun run validate:lender-portal-execution`

## Completion gate

The packet is complete only when every implemented consumer is reconciled or
explicitly proven unaffected, every future consumer has a named phase and
input contract, locked policy remains immutable, and exact-commit evidence
contains the updated transition-consumer inventory.
