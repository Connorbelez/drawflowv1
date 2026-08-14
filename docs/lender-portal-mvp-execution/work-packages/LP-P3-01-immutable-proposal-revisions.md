# LP-P3-01 — Immutable proposal revisions

Status: ready

Depends on: LP-P2-05

## Objective

Add monotonic immutable revisions beneath one stable Build Proposal, snapshot
the five lender checkpoints, and produce deterministic changed-field data.

## Ownership

Extend the canonical proposal, budget, schedule, builder, and audit owners. A
revision snapshots references or values from those owners; it does not create
a second editable proposal or overwrite prior revisions.

## Traceability selectors

- `LP-SCOPE-04`
- `LP-INV-07..LP-INV-08`
- `LP-US-043..LP-US-045`
- `LP-E2E-05`
- `LP-QG-01..LP-QG-04`

## Context pointers

Load the feature brief revision, confirmation, and policy sections; spec User
Stories 43–51; implementation plan Phase 3; and canonical proposal, Budget,
Construction Roadmap, builder identity, audit, and revision implementations
found by current-checkout search.

## Steps and completion criteria

1. Define stable proposal and monotonic revision identities. Completion
   criterion: older revisions are immutable and reconstructable.
2. Snapshot all five checkpoint values with explicit version provenance.
   Completion criterion: a revision is self-consistent and no lender review
   depends on mutable live values.
3. Implement deterministic prior-reviewed-to-current diff generation.
   Completion criterion: only checkpoint fields appear and identical inputs
   produce identical ordered output.
4. Test concurrency and replay. Completion criterion: duplicate publication,
   stale base revision, concurrent publication, and attempted overwrite fail.

## Required verification

- Revision schema, command, immutability, and audit tests
- Snapshot consistency and deterministic diff tests
- Convex codegen and typecheck

## Completion gate

Complete only when every lender-reviewable proposal version is immutable,
unambiguous, diffable, and backed by exact-commit evidence.
