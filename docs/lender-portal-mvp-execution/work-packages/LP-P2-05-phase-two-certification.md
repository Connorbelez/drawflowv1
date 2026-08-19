# LP-P2-05 — Phase 2 certification

Status: ready

Depends on: LP-P2-01, LP-P2-02, LP-P2-03, LP-P2-04

## Objective

Independently certify the complete Phase 2 lifecycle on one exact commit.
Certification is read-only; failures reopen their owning packet.

## Ownership

Own only Phase 2 acceptance evidence and traceability status. Do not modify
product code, tests, migrations, or prototype sources.

## Traceability selectors

- `LP-SCOPE-02`
- `LP-INV-03..LP-INV-06`
- `LP-INV-18`
- `LP-PERM-05..LP-PERM-06`
- `LP-PERM-10`
- `LP-PERM-15`
- `LP-AC-PROP-01..LP-AC-PROP-02`
- `LP-AC-PROP-05..LP-AC-PROP-07`
- `LP-DEC-02`
- `LP-US-015..LP-US-018`
- `LP-US-033..LP-US-042`
- `LP-E2E-01..LP-E2E-02`
- `LP-E2E-04`
- `LP-PROT-ASSIGN`
- `LP-TEST-01..LP-TEST-13`
- `LP-QG-01..LP-QG-09`
- `LP-VSG-01..LP-VSG-10`

## Context pointers

Load the Phase 2 source sections, four implementation evidence records, exact
candidate diff, affected canonical owners, selected assignment prototype, and
the three required participant journeys. Load later phases only for a targeted
consumer check caused by the diff.

## Steps and completion criteria

1. Bind the review to one clean candidate SHA and deployment/server provenance.
2. Audit requirements, ownership, state invariants, privacy, audit events, and
   every transition consumer; completion requires no unmapped behavior.
3. Re-run focused and repository checks plus E2E-01, E2E-02, and E2E-04 at real
   participant boundaries.
4. Verify assignment prototype parity and all forbidden, stale, withdrawn, and
   concurrent states.
5. Record an unconditional accepted or rejected result using the evidence
   template and attach it to the candidate SHA.

## Required verification

- Convex codegen, typecheck, focused tests, and relevant full test suite
- `bun run build`
- E2E-01, E2E-02, and E2E-04 exact-commit evidence
- `bun run validate:lender-portal-execution`

## Completion gate

Phase 2 passes only when all implementation packets are accepted, all required
journeys pass on one SHA, selected-prototype parity is proven, and no proposal
transition is implemented on only one participant surface.
