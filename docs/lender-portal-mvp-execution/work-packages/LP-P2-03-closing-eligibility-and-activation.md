# LP-P2-03 — Closing eligibility and activation

Status: ready

Depends on: LP-P2-01, LP-P2-02

## Objective

Calculate closing eligibility from the funding path and current approvals,
authorize closing by either eligible side, and keep closing separate from
Build activation.

## Ownership

Extend the canonical proposal-to-Build transition, authorization, audit, and
projection owners. Do not introduce a lender-specific close or activate path.

## Traceability selectors

- `LP-INV-03..LP-INV-06`
- `LP-PERM-06`
- `LP-PERM-15`
- `LP-AC-PROP-05..LP-AC-PROP-07`
- `LP-DEC-02`
- `LP-US-036..LP-US-042`
- `LP-E2E-01..LP-E2E-02`
- `LP-E2E-04`

## Context pointers

Load the feature brief lifecycle invariants, Permissions, Phase Zero decision
2, and Proposal acceptance criteria; spec User Stories 36–42 and relevant E2E
journeys; implementation plan Phase 2; and canonical closing, activation,
Build provisioning, authorization, and audit implementations.

## Steps and completion criteria

1. Define one deterministic closing-eligibility evaluator. Completion
   criterion: internal, externally assigned, and withdrawn paths produce the
   expected prerequisites and failure reasons.
2. Implement closing. Completion criterion: an eligible Back Office Admin or
   active current lender member may close only after applicable prerequisites;
   stale, duplicate, and unauthorized requests fail.
3. Implement activation as a later explicit command. Completion criterion:
   only a closed proposal can activate and the Build receives one audited,
   idempotent activation transition.
4. Test races and participant changes. Completion criterion: withdrawal versus
   closing, membership deactivation, double close, and close versus activate
   have deterministic results.

## Required verification

- Eligibility matrix tests for internal, assigned, and withdrawn paths
- Closing/activation authorization and concurrency tests
- Proposal-to-Build audit and idempotency tests

## Completion gate

Complete only when closing readiness is deterministic, either authorized side
can record closing, activation remains separate, and no race can skip a gate.
