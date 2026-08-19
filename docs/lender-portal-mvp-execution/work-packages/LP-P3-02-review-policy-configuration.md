# LP-P3-02 — Review policy configuration

Status: ready

Depends on: LP-P1-05, LP-P2-05

## Objective

Model Build-wide Milestone and Draw approval modes, site-visit and receipt
requirements, and valid lender quorums against canonical active membership.

## Ownership

Extend the canonical policy, WorkOS membership projection, authorization, and
audit owners. Keep Milestone and Draw policy dimensions explicit and do not
embed policy copies in queues or portal components.

## Traceability selectors

- `LP-SCOPE-04`
- `LP-INV-13`
- `LP-PERM-07`
- `LP-AC-POL-01..LP-AC-POL-02`
- `LP-US-046..LP-US-049`
- `LP-E2E-05`
- `LP-PROT-POLICY`

## Context pointers

Load the feature brief review policy, permissions, and policy acceptance
sections; spec User Stories 46–51 and E2E-05; implementation plan Phase 3;
Phase 1 membership evidence; the selected policy prototype contract; and
canonical policy, organization membership, authorization, and audit owners.

## Steps and completion criteria

1. Define typed approval modes and independent evidence switches. Completion
   criterion: every confirmed combination is representable without nullable or
   contradictory booleans.
2. Define quorum validation against active members of the current assigned
   organization. Completion criterion: only values from one through the active
   member count pass and validation is server-side.
3. Implement authenticated policy draft commands and audit. Completion
   criterion: only eligible Back Office actors may configure the proposal policy
   and stale proposal/assignment inputs fail.
4. Add policy matrix and membership-change tests. Completion criterion: every
   mode, switch, quorum boundary, tenant denial, and organization denial passes.

## Required verification

- Policy validator and command-boundary tests
- Active-membership quorum matrix tests
- Existing WorkOS and authorization tests

## Completion gate

Complete only when one canonical typed policy covers all confirmed modes and
quorums and all invalid configurations fail before persistence.
