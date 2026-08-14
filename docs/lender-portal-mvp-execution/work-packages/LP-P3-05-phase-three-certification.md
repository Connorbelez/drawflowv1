# LP-P3-05 — Phase 3 certification

Status: ready

Depends on: LP-P3-01, LP-P3-02, LP-P3-03, LP-P3-04

## Objective

Independently certify immutable revisions, policy configuration, policy lock,
and Variant A promotion on one exact commit.

## Ownership

Own only Phase 3 acceptance evidence and traceability. Certification is
read-only; failures reopen their implementation packet.

## Traceability selectors

- `LP-SCOPE-04`
- `LP-INV-05`
- `LP-INV-07..LP-INV-08`
- `LP-INV-13`
- `LP-PERM-07`
- `LP-AC-POL-01..LP-AC-POL-04`
- `LP-US-043..LP-US-051`
- `LP-E2E-05`
- `LP-PROT-POLICY`
- `LP-TEST-01..LP-TEST-13`
- `LP-QG-01..LP-QG-09`
- `LP-VSG-01..LP-VSG-10`

## Context pointers

Load Phase 3 source sections, all Phase 3 packet evidence, the exact diff,
canonical changed owners, the selected Variant A contract, and E2E-05.

## Steps and completion criteria

1. Bind review and runtime evidence to one candidate SHA.
2. Audit immutable revision, deterministic diff, policy matrix, membership
   quorum, lock provenance, closing integration, and canonical ownership.
3. Re-run focused tests, repository checks, E2E-05, and Variant A parity and
   accessibility acceptance.
4. Audit every transition consumer and stale/concurrent failure path.
5. Record accepted or rejected evidence with no unresolved qualification.

## Required verification

- Convex codegen, typecheck, focused tests, relevant full tests, and build
- E2E-05 exact-commit evidence
- Variant A parity evidence
- `bun run validate:lender-portal-execution`

## Completion gate

Phase 3 passes only when all four packets are accepted, the locked snapshot is
immutable and exact-revision-bound, E2E-05 passes, and evidence names one SHA.
