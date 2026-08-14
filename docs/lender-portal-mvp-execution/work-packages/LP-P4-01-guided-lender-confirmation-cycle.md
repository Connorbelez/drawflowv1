# LP-P4-01 — Guided lender confirmation cycle

Status: ready

Depends on: LP-P3-05

## Objective

Implement one five-checkpoint confirmation cycle for the current proposal
revision and assignment, with read-only checkpoint data and explicit decisions.

## Ownership

Extend canonical proposal revision, assignment, lender decision, closing
eligibility, authorization, audit, and projection owners. Do not create a
second proposal or store confirmation in UI state.

## Traceability selectors

- `LP-SCOPE-03`
- `LP-INV-05`
- `LP-INV-07..LP-INV-08`
- `LP-PERM-08..LP-PERM-09`
- `LP-AC-PROP-02`
- `LP-AC-PROP-04`
- `LP-US-019..LP-US-025`
- `LP-US-030..LP-US-032`
- `LP-E2E-02`
- `LP-QG-01..LP-QG-04`

## Context pointers

Load the feature brief guided confirmation, revision, permissions, and proposal
acceptance sections; spec User Stories 19–32 and E2E-02/E2E-03;
implementation plan Phase 4; Phase 3 revision and lock evidence; and canonical
proposal decision, authorization, audit, and closing eligibility owners.

## Steps and completion criteria

1. Define stable confirmation cycle and checkpoint identities. Completion
   criterion: the cycle binds exactly one current revision and assignment.
2. Implement checkpoint confirmation and final approval commands. Completion
   criterion: all five explicit confirmations are required, lender users cannot
   edit source data, and earlier revision decisions never count.
3. Integrate closing eligibility. Completion criterion: exactly one eligible
   current lender approval of the current revision satisfies the lender gate.
4. Test replay, staleness, withdrawal, membership change, and concurrent final
   decisions at authenticated command boundaries.

## Required verification

- Five-checkpoint and partial-flow tests
- Exact-revision, assignment, and membership authorization tests
- Closing-eligibility integration and audit tests

## Completion gate

Complete only when no partial or stale cycle can approve a proposal and every
accepted decision is authorized, auditable, and exact-revision-bound.
