# LP-P7-06 — Paired participant surfaces and shell

Status: ready

Depends on: LP-P7-02, LP-P7-03, LP-P7-04, LP-P7-05

## Objective

Complete the paired Back Office and Builder transition surfaces, production
lender shell, read-only withdrawn records, and cross-surface accessibility and
privacy behavior.

## Ownership

Extend existing Back Office proposal queue/detail/editor, Builder proposal and
Build Workspace, LenderShell, shared review sheets, collaboration, and route
owners. Active route chooses exposed actions; canonical roles cap authority.

## Traceability selectors

- LP-SCOPE-07
- LP-PERM-14..LP-PERM-19
- LP-AC-PORTAL-01..LP-AC-PORTAL-03
- LP-US-067..LP-US-076
- LP-E2E-09
- LP-PROT-DASH
- LP-PROT-BUILD
- LP-PROT-MILESTONE-QUEUE
- LP-PROT-DRAW-QUEUE
- LP-QG-01..LP-QG-09
- LP-VSG-01..LP-VSG-10

## Context pointers

Load implementation plan Phase 7 transition-consumer ledger and participant
clauses; feature brief portal/privacy; spec User Stories 67–76; all four surface
promotion contracts; canonical proposal and review specs; and exact Back Office,
Builder, lender shell, route, Build Workspace, and collaboration owners.

## Steps and completion criteria

1. Complete Back Office assignment, remediation, policy, closing, activation,
   Milestone, and Draw consumers. Completion criterion: every changed transition
   is actionable from the authorized Back Office surface.
2. Complete Builder-safe proposal, correction, resubmission, and high-level
   Build Workspace state. Completion criterion: actionable instructions exist
   with no reviewer identity, private rationale, or lender-only data.
3. Finalize LenderShell and read-only withdrawn records. Completion criterion:
   route manifest, navigation, organization context, forbidden states, and
   retained history are consistent.
4. Run cross-surface state and accessibility acceptance. Completion criterion:
   loading, empty, forbidden, withdrawn, stale, correction, partial approval,
   concurrency, keyboard, focus, error summary, and live status all pass.

## Required verification

- Back Office, Builder, and lender integration tests
- Privacy and field-absence tests across all loaders/errors
- Cross-surface accessibility and E2E-09 browser evidence

## Completion gate

Complete only when every transition has all required participant consumers,
security is server-enforced, and all five confirmed portal surfaces work.
