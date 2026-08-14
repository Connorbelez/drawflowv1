# LP-P9-05 — Final release certification

Status: ready

Depends on: LP-P9-01, LP-P9-02, LP-P9-03, LP-P9-04

## Objective

Perform the final independent, read-only release decision over all 252
requirements, all work packages, all participant journeys, and exact-commit
evidence.

## Ownership

Own only the final traceability decision and release evidence. Do not modify
product code, tests, data, migrations, runtime configuration, or prior evidence.

## Traceability selectors

- LP-SCOPE-01..LP-SCOPE-07
- LP-INV-01..LP-INV-18
- LP-PERM-01..LP-PERM-19
- LP-NOTIF-01..LP-NOTIF-04
- LP-AC-ORG-01..LP-AC-ORG-07
- LP-AC-PROP-01..LP-AC-PROP-07
- LP-AC-POL-01..LP-AC-POL-07
- LP-AC-EVID-01..LP-AC-EVID-05
- LP-AC-PORTAL-01..LP-AC-PORTAL-04
- LP-DEC-01..LP-DEC-04
- LP-US-001..LP-US-088
- LP-E2E-01..LP-E2E-10
- LP-TEST-01..LP-TEST-15
- LP-QG-01..LP-QG-09
- LP-VSG-01..LP-VSG-10
- LP-P1-W01..LP-P1-W09
- LP-P1-T01..LP-P1-T07
- LP-P1-X01..LP-P1-X04
- LP-FINAL-01..LP-FINAL-07
- LP-PROT-DASH
- LP-PROT-ORG
- LP-PROT-PROP
- LP-PROT-POLICY
- LP-PROT-ASSIGN
- LP-PROT-BUILD
- LP-PROT-MILESTONE-QUEUE
- LP-PROT-MILESTONE-SHEET
- LP-PROT-DRAW-QUEUE
- LP-PROT-DRAW-SHEET
- LP-PROT-BUILDER-MILESTONE

## Context pointers

Load the traceability ledger, source hashes, all phase certification evidence,
all Phase 9 evidence, exact release diff and SHA, final repository docs, release
control/runbook, and independent E2E/security/migration results. Load a source
section only when validating its referenced requirement.

## Steps and completion criteria

1. Prove traceability completeness. Completion criterion: every catalogued
   requirement maps to verified work and reproducible exact-commit evidence and
   every changed behavior maps back to a requirement.
2. Verify evidence provenance and freshness. Completion criterion: no evidence
   references a different checkout, commit, deployment, route, fixture, or
   participant identity.
3. Confirm scope and documentation. Completion criterion: deferred surfaces and
   event classes remain absent and docs match shipped routes, permissions,
   states, ownership, and operations.
4. Run the release-mode validator. Completion criterion:
   bun run validate:lender-portal-execution --release reports valid only after
   every group and package is verified with evidence.
5. Record one binary accepted or rejected release decision, reviewer identity,
   timestamp, release SHA, and evidence manifest.

## Required verification

- bun run validate:lender-portal-execution --release
- Exact-release-commit build, test, E2E, security, migration, and rollback proof
- Source/ledger/doc hash and evidence-manifest audit
- Independent final diff and scope review

## Completion gate

The MVP may release only when the release validator passes, every final gate is
accepted without qualification, all evidence names the exact release commit,
and the independent reviewer records a binary accepted decision.
