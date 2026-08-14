# LP-P7-07 — Phase 7 certification

Status: ready

Depends on: LP-P7-01, LP-P7-02, LP-P7-03, LP-P7-04, LP-P7-05, LP-P7-06

## Objective

Independently certify all participant projections, five confirmed portal
surfaces, paired Back Office/Builder behavior, privacy, and accessibility.

## Ownership

Own only Phase 7 evidence and traceability. Certification is read-only.

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
- LP-TEST-01..LP-TEST-13
- LP-QG-01..LP-QG-09
- LP-VSG-01..LP-VSG-10

## Context pointers

Load Phase 7 source sections, six packet evidence records, exact candidate diff,
all selected surface contracts, canonical review contracts, transition-consumer
ledger, and E2E-09.

## Steps and completion criteria

1. Bind all evidence to one candidate SHA and authenticated runtime provenance.
2. Audit projection correctness, canonical ownership, data minimization,
   participant parity, route manifests, and every transition consumer.
3. Re-run focused and repository checks plus E2E-09 on real participant routes.
4. Independently compare each production surface to its selected prototype and
   verify keyboard, focus, responsive, error, and live-status behavior.
5. Record accepted or rejected exact-commit evidence without qualification.

## Required verification

- Codegen, typecheck, focused tests, relevant full tests, and build
- E2E-09 exact-commit multi-actor evidence
- Five-surface parity, privacy, and accessibility evidence
- bun run validate:lender-portal-execution

## Completion gate

Phase 7 passes only when every packet and surface is accepted, no loader exposes
deferred/private fields, all paired consumers work, and evidence names one SHA.
