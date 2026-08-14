# LP-P4-04 — Phase 4 certification

Status: ready

Depends on: LP-P4-01, LP-P4-02, LP-P4-03

## Objective

Independently certify guided confirmation, remediation, reconfirmation, privacy,
and Variant D promotion on one exact commit.

## Ownership

Own only Phase 4 evidence and traceability. Certification is read-only.

## Traceability selectors

- `LP-SCOPE-03`
- `LP-INV-05`
- `LP-INV-07..LP-INV-08`
- `LP-INV-16`
- `LP-PERM-08..LP-PERM-09`
- `LP-AC-PROP-02..LP-AC-PROP-04`
- `LP-US-019..LP-US-032`
- `LP-E2E-02..LP-E2E-03`
- `LP-PROT-PROP`
- `LP-TEST-01..LP-TEST-13`
- `LP-QG-01..LP-QG-09`
- `LP-VSG-01..LP-VSG-10`

## Context pointers

Load Phase 4 source sections, three packet evidence records, exact diff,
affected canonical owners, Variant D contract, and E2E-02/E2E-03.

## Steps and completion criteria

1. Bind all assertions to one candidate SHA and runtime provenance.
2. Audit confirmation completeness, exact-revision authority, repeated loops,
   privacy, audit, queue effects, and participant-surface parity.
3. Re-run focused and repository checks plus E2E-02 and E2E-03 through real
   participant boundaries.
4. Verify Variant D parity, accessibility, and every failure state.
5. Record accepted or rejected exact-commit evidence.

## Required verification

- Codegen, typecheck, focused tests, relevant full tests, and build
- E2E-02 and E2E-03 exact-commit evidence
- Variant D parity and accessibility evidence
- `bun run validate:lender-portal-execution`

## Completion gate

Phase 4 passes only when all packets are accepted, full reconfirmation is
mandatory after remediation, private data never leaks, and evidence names one
exact commit.
