# LP-P4-02 — Decline, remediation, and reconfirmation

Status: ready

Depends on: LP-P4-01

## Objective

Implement reasoned lender decline, Back Office remediation on the same
proposal, a new immutable revision, and complete reconfirmation without losing
history or Back Office approval.

## Ownership

Extend canonical proposal, revision, decision, remediation projection,
authorization, audit, and queue-effect owners. Keep private decline rationale
out of Builder-safe and unauthorized notification payloads.

## Traceability selectors

- `LP-INV-16`
- `LP-PERM-08..LP-PERM-09`
- `LP-AC-PROP-03..LP-AC-PROP-04`
- `LP-US-026..LP-US-032`
- `LP-E2E-02..LP-E2E-03`
- `LP-QG-03..LP-QG-09`
- `LP-VSG-01..LP-VSG-10`

## Context pointers

Load feature brief decline/remediation, privacy, and proposal acceptance;
spec User Stories 26–32 and E2E-02/E2E-03; implementation plan Phase 4 and
vertical-slice gate; Phase 3 revision evidence; and canonical proposal editor,
decision, audit, queue-effect, and privacy projection owners.

## Steps and completion criteria

1. Implement decline with a required private reason. Completion criterion:
   decline retains Back Office approval and pending-closing state and creates
   one remediation-required effect.
2. Implement same-proposal remediation and revision publication. Completion
   criterion: proposal identity and prior cycles remain, the next revision is
   immutable, and publication opens one new full cycle.
3. Produce Back Office, lender, and Builder-safe projections. Completion
   criterion: each persona receives the permitted fields only and the builder
   never receives reviewer identity or private reason.
4. Test repeated loops, stale publication, duplicate effects, and privacy in
   errors, audit readers, queues, and notification intent payloads.

## Required verification

- Decline/reason, remediation, and reconfirmation cycle tests
- Permission-shaped projection and payload privacy tests
- E2E-02 and E2E-03 command-boundary evidence

## Completion gate

Complete only when decline/update/re-review can repeat on one proposal with
complete history, correct privacy, and no duplicate next-action effect.
