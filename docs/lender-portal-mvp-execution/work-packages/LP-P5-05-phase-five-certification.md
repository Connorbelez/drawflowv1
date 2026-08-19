# LP-P5-05 — Phase 5 certification

Status: ready

Depends on: LP-P5-01, LP-P5-02, LP-P5-03, LP-P5-04

## Objective

Independently certify stable Milestone and Draw cycles, canonical decisions,
privacy, and shared-sheet integration on one exact commit.

## Ownership

Own only Phase 5 evidence and traceability. Certification is read-only.

## Traceability selectors

- LP-SCOPE-06
- LP-INV-09..LP-INV-11
- LP-INV-16
- LP-PERM-11..LP-PERM-13
- LP-AC-POL-05..LP-AC-POL-07
- LP-US-061..LP-US-066
- LP-E2E-05..LP-E2E-06
- LP-PROT-MILESTONE-SHEET
- LP-PROT-DRAW-SHEET
- LP-PROT-BUILDER-MILESTONE
- LP-TEST-01..LP-TEST-13
- LP-QG-01..LP-QG-09
- LP-VSG-01..LP-VSG-10

## Context pointers

Load Phase 5 source sections, four packet evidence records, exact candidate
diff, canonical review specs and owners, locked prototypes, and E2E-05/E2E-06.

## Steps and completion criteria

1. Bind evidence to one candidate SHA and runtime provenance.
2. Audit stable identity, immutable cycles, reset semantics, decisions, privacy,
   pooled availability, shared ownership, and absence of Builder Draw UI.
3. Re-run focused and repository checks and both multi-actor journeys.
4. Verify sheet parity, accessibility, correction ordering, and every stale,
   concurrent, forbidden, and terminal state.
5. Record unconditional accepted or rejected evidence.

## Required verification

- Codegen, typecheck, focused tests, relevant full tests, and build
- E2E-05 and E2E-06 exact-commit evidence
- Shared-sheet and locked-prototype parity evidence
- bun run validate:lender-portal-execution

## Completion gate

Phase 5 passes only when all packets are accepted, both domains preserve one
request across cycles, privacy holds at every boundary, and evidence names one
exact commit.
