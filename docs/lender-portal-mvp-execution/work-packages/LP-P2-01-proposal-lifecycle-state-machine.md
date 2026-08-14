# LP-P2-01 — Proposal lifecycle state machine

Status: in-progress

Depends on: LP-P1-05

## Objective

Model approval, external assignment, lender confirmation, closing, and
activation as explicit, auditable state dimensions. Preserve the internal
funding path and prevent proposal approval from activating a Build.

## Ownership

Extend the canonical Build Proposal domain, schema, fluent-convex commands,
and audit events found by the implementation-checkout inventory. Do not create
a lender-owned proposal record or boolean compatibility state.

## Traceability selectors

- `LP-SCOPE-02`
- `LP-INV-03..LP-INV-04`
- `LP-INV-06`
- `LP-PERM-05`
- `LP-AC-PROP-01`
- `LP-AC-PROP-05`
- `LP-US-015..LP-US-018`
- `LP-US-033`
- `LP-US-036`
- `LP-US-040`
- `LP-E2E-01`
- `LP-QG-01..LP-QG-04`

## Context pointers

Load the feature brief sections Proposal assignment and lifecycle, Domain
invariants 3–6, Permissions, and Proposal acceptance criteria; spec User
Stories 15–18 and 33–42; implementation plan Phase 2; the canonical proposal
schema, functions, state tests, and audit owner found by fresh search; and
Convex guidance before backend work.

## Steps and completion criteria

1. Inventory every proposal lifecycle reader and writer on the implementation
   checkout. Completion criterion: all approval-as-activation assumptions are
   assigned to this or a named downstream packet.
2. Define the typed transition model and invariants. Completion criterion:
   internal and external paths, approved/pending-closing, closed, and active
   states are representable without contradictory combinations.
3. Implement transitions through authenticated fluent-convex commands.
   Completion criterion: stale, duplicate, unauthorized, and post-closing
   commands fail and every accepted transition emits a complete audit event.
4. Add state-machine tests. Completion criterion: every allowed edge and
   forbidden edge has command-boundary coverage.

## Required verification

- Convex codegen and typecheck
- Focused proposal state-machine and audit tests
- Existing proposal and Build lifecycle tests
- `bun run validate:lender-portal-execution`

## Completion gate

Complete only when the canonical proposal model represents every Phase 2
state, no approval path activates a Build, invalid transitions fail closed,
and exact-commit evidence is attached.
