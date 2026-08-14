# LP-P1-05 — Phase 1 certification

Status: ready

Depends on: LP-P1-01, LP-P1-02, LP-P1-03, LP-P1-04

## Objective

Independently verify Phase 1 at one exact commit. Certification is read-only:
failures return to the owning work package and do not receive fixes inside the
certification task.

## Ownership

Own only Phase 1 acceptance evidence and traceability status. Inspect all
changed code and tests; do not modify product code, tests, or prototypes.

## Traceability selectors

- `LP-SCOPE-01`
- `LP-INV-01..LP-INV-02`
- `LP-INV-12`
- `LP-PERM-01..LP-PERM-04`
- `LP-AC-ORG-01..LP-AC-ORG-07`
- `LP-DEC-01`
- `LP-DEC-03`
- `LP-US-001..LP-US-014`
- `LP-US-077..LP-US-078`
- `LP-US-084`
- `LP-US-087..LP-US-088`
- `LP-E2E-08`
- `LP-PROT-ORG`
- `LP-P1-W01..LP-P1-W09`
- `LP-P1-T01..LP-P1-T07`
- `LP-P1-X01..LP-P1-X04`
- `LP-TEST-01`
- `LP-TEST-03..LP-TEST-07`
- `LP-TEST-09`
- `LP-TEST-14..LP-TEST-15`
- `LP-QG-01..LP-QG-09`
- `LP-VSG-01..LP-VSG-10`

## Context pointers

Load:

- all Phase 1 source sections identified by the selectors above;
- all four implementation packet evidence records;
- the exact accepted diff and changed canonical owners;
- the Variant E prototype contract and selected route;
- current `AGENTS.md` and Convex guidance for compliance review.

Do not load later-phase implementation branches unless a changed consumer
requires a targeted check.

## Steps and completion criteria

1. Bind certification to the candidate commit. Completion criterion: checkout,
   branch, dirty state, server/deployment provenance where used, and SHA are
   recorded before any assertion.
2. Audit traceability. Completion criterion: every Phase 1 requirement is
   implemented, verified, and referenced by at least one automated or human
   acceptance result; every changed behavior maps back to a source requirement.
3. Inspect canonical ownership. Completion criterion: no application-owned
   lender organization, membership, manager capability, policy, or portal-only
   workflow copy exists.
4. Re-run Phase 1 automated checks. Completion criterion: codegen, Convex
   typecheck, focused suites, full relevant tests, build, and preparation
   validation pass on the candidate commit.
5. Run E2E-08 through real participant boundaries. Completion criterion:
   provisioning, same-organization administration, cross-organization denial,
   protected transfer, deactivation, history, reconciliation, and WorkOS sync
   states all pass.
6. Verify Variant E. Completion criterion: production preserves the selected
   hierarchy, shared table, shared sheet, four tabs, staged review gates,
   keyboard flow, responsive behavior, and canonical command states.
7. Audit every vertical-slice consumer. Completion criterion: access, stale
   actions, queues, counts, recipients, history, audit, notification intent,
   and later-phase handoffs are updated or explicitly proven unavailable.
8. Write independent evidence using `evidence-template.md`. Completion
   criterion: the verifier records accepted or rejected with no unresolved
   qualification and ties the decision to the candidate SHA.

## Required verification

- `bun run validate:lender-portal-execution`
- `bun x convex codegen`
- `bun x tsc -p convex/tsconfig.json`
- Phase 1 focused Convex and UI tests
- `bun run build`
- E2E-08 browser and command-boundary evidence

## Completion gate

Phase 1 is complete only when all four implementation packets are independently
accepted, every `LP-P1-X` criterion passes, E2E-08 passes at the real boundaries,
Variant E parity is proven, and the traceability ledger points to exact-commit
evidence. Any failure rejects certification and reopens the owning packet.
