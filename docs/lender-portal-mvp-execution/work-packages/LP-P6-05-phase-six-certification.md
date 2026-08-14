# LP-P6-05 — Phase 6 certification

Status: ready

Depends on: LP-P6-01, LP-P6-02, LP-P6-03, LP-P6-04

## Objective

Independently certify evidence qualification, approval evaluation, deactivation
behavior, privacy, and submission gates on one exact commit.

## Ownership

Own only Phase 6 acceptance evidence and traceability. Certification is
read-only.

## Traceability selectors

- LP-SCOPE-05
- LP-INV-10..LP-INV-12
- LP-INV-14..LP-INV-18
- LP-PERM-12..LP-PERM-18
- LP-AC-EVID-01..LP-AC-EVID-05
- LP-US-052..LP-US-060
- LP-E2E-05
- LP-E2E-07
- LP-TEST-01..LP-TEST-13
- LP-QG-01..LP-QG-09
- LP-VSG-01..LP-VSG-10

## Context pointers

Load Phase 6 source sections, four packet evidence records, exact candidate
diff, canonical evidence/policy owners, and E2E-05/E2E-07.

## Steps and completion criteria

1. Bind review and runtime evidence to one candidate SHA.
2. Audit cost-document arithmetic, Site Visit qualification, geofence behavior,
   policy matrix, quorum uniqueness, deactivation, privacy, and direct gates.
3. Re-run focused and repository checks and both multi-actor journeys.
4. Inspect every attachment, projection, error, queue, audit, and notification
   input boundary for unauthorized data.
5. Record unconditional accepted or rejected evidence.

## Required verification

- Codegen, typecheck, focused tests, relevant full tests, and build
- E2E-05 and E2E-07 exact-commit evidence
- Attachment and privacy acceptance evidence
- bun run validate:lender-portal-execution

## Completion gate

Phase 6 passes only when all packets are accepted, evidence and policy gates
cannot be bypassed, geofence failure preserves evidence, and one SHA is named.
