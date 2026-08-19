# LP-P9-01 — Migration and projection reconciliation

Status: ready

Depends on: LP-P1-05, LP-P2-05, LP-P3-05, LP-P4-04, LP-P5-05, LP-P6-05, LP-P7-07, LP-P8-04

## Objective

Inventory actual pre-release data, perform repeatable fail-closed migration of
proposal lifecycle and verifiable policy/assignment facts, and rebuild derived
projections with reconciled totals.

## Ownership

Use canonical domain schema and permitted Convex migration runners. Never infer
ambiguous approvals, activation, assignments, policy, or membership; WorkOS
projection tables remain webhook-owned.

## Traceability selectors

- LP-E2E-01..LP-E2E-10
- LP-TEST-14
- LP-FINAL-02
- LP-FINAL-05..LP-FINAL-06
- LP-QG-01..LP-QG-04

## Context pointers

Load implementation plan Phase 9 migration work and final gate; spec migration
testing decision and all E2E journeys; every phase certification; current
schema/data inventory; canonical migration framework; WorkOS projection rules;
and queue/dashboard projection rebuild owners.

## Steps and completion criteria

1. Inventory actual candidate-environment records and field provenance.
   Completion criterion: counts and every ambiguous pattern are recorded before
   a migration definition is approved.
2. Define repeatable migrations for explicit proposal lifecycle state.
   Completion criterion: approved records never become active by inference and
   ambiguous records stop with actionable evidence.
3. Backfill policy and assignment only from verifiable fields. Completion
   criterion: no default lender, quorum, assignment, or approval is invented.
4. Rebuild projections and reconcile totals by tenant, organization, state, and
   queue. Completion criterion: pre/post canonical counts and derived counts
   balance or every difference is explained and accepted.
5. Rehearse partial failure, resume, and rollback. Completion criterion: no
   revisions, decisions, assignments, or audit history are deleted.

## Required verification

- Migration dry-run, repeatability, partial-failure, resume, and rollback tests
- Pre/post data and projection reconciliation report
- WorkOS projection non-write audit

## Completion gate

Complete only when migration is repeatable and fail-closed, all totals reconcile,
ambiguous data remains unmigrated with evidence, and no history is lost.
