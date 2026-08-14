# LP-P3-03 — Policy lock and Build control snapshot

Status: ready

Depends on: LP-P3-01, LP-P3-02

## Objective

Lock the review policy to the current proposal revision and assignment before
closing, then copy one immutable snapshot into closed Build control state.

## Ownership

Extend the canonical policy, proposal closing, Build control, authorization,
membership, and audit owners. Do not add an MVP override or mutation path.

## Traceability selectors

- `LP-INV-05`
- `LP-INV-07..LP-INV-08`
- `LP-INV-13`
- `LP-PERM-07`
- `LP-AC-POL-03..LP-AC-POL-04`
- `LP-US-050..LP-US-051`
- `LP-E2E-05`

## Context pointers

Load the feature brief policy lock invariants and acceptance criteria; spec
User Stories 50–51 and E2E-05; implementation plan Phase 3; Phase 2 closing
evidence; and canonical proposal, policy, assignment, Build control, membership,
authorization, and audit implementations.

## Steps and completion criteria

1. Define lock inputs and stored evidence. Completion criterion: actor, time,
   proposal revision, assignment, active-member count, policy bytes, and source
   versions are explicit.
2. Implement the lock command. Completion criterion: external proposals require
   the current lender-confirmed revision and assignment; invalid quorum, stale
   revision, wrong assignment, or closed proposal fails.
3. Integrate closing. Completion criterion: closing requires one lock and copies
   it idempotently to Build control state.
4. Prove immutability and races. Completion criterion: edit-after-lock,
   lock-versus-withdrawal, double lock, and close-versus-lock are deterministic.

## Required verification

- Policy lock authorization and exact-revision tests
- Closing integration and immutable Build snapshot tests
- Concurrency and audit reconstruction tests

## Completion gate

Complete only when every closed Build has exactly one immutable, traceable
policy snapshot and no command can mutate it.
