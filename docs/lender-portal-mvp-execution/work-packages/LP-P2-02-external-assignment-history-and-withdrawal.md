# LP-P2-02 — Lender assignment history and withdrawal

Status: implementation-complete

Package-start SHA: `1a6b164c211989c1762e7199e4eeab9f46aca147`.

Implementation evidence: `docs/lender-portal-mvp-execution/evidence/LP-P2-02-c9d67318.md`.
Independent phase acceptance remains reserved for LP-P2-05.

Depends on: LP-P2-01

## Objective

Implement one current Lender Organization assignment with append-only
assignment intervals, withdrawal, bounded historical access, and no deletion
of review-time records.

## Ownership

Extend the canonical proposal and organization-resource authorization owners.
Reference WorkOS organization projections; never copy membership or assignment
authority into a portal-only model.

## Traceability selectors

- `LP-INV-05`
- `LP-INV-18`
- `LP-PERM-05..LP-PERM-06`
- `LP-PERM-10`
- `LP-AC-PROP-01`
- `LP-AC-PROP-06..LP-AC-PROP-07`
- `LP-US-033..LP-US-035`
- `LP-US-037..LP-US-039`
- `LP-US-041..LP-US-042`
- `LP-E2E-01`
- `LP-E2E-04`

## Context pointers

Load the feature brief lender assignment, withdrawal, permissions, and
proposal acceptance sections; spec User Stories 33–42 and E2E-01/E2E-04;
implementation plan Phase 2; Phase 1 organization authorization evidence; and
the canonical proposal, audit, WorkOS projection, and resource-access owners.

## Steps and completion criteria

1. Define assignment interval and authorization semantics. Completion
   criterion: exactly one current organization can exist and historical
   intervals cannot be overwritten.
2. Implement assign and withdraw commands. Completion criterion: assignment
   requires Back Office Admin approval; withdrawal closes
   the interval, removes current authority, and preserves prior approval.
3. Implement current and historical read authorization. Completion criterion:
   a withdrawn organization sees only the retained proposal record and its own
   authorized review-time history.
4. Test race and replay behavior. Completion criterion: duplicate assignment,
   overlapping intervals, stale withdrawal, cross-tenant access, and
   post-closing mutation all fail.

## Required verification

- Assignment/withdrawal command and authorization tests
- Append-only history and audit reconstruction tests
- E2E-01 and E2E-04 command-boundary evidence

## Completion gate

Complete only when current authority and retained historical access are both
derived from canonical assignment intervals and exact-commit evidence proves
withdrawal does not delete or reverse prior state.
