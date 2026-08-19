# LP-P5-01 — Milestone review-request cycles

Status: ready

Depends on: LP-P3-05

## Objective

Add one stable review-request identity and monotonic decision cycles for each
submitted Milestone completion, including immutable cycle snapshots and
same-record builder correction.

## Ownership

Extend the canonical Milestone, Evidence Package, review owner, authorization,
audit, and revision owners named by the Milestone review contract. Do not create
a lender-specific Milestone or review record.

## Traceability selectors

- LP-SCOPE-06
- LP-INV-09..LP-INV-11
- LP-INV-16
- LP-PERM-11..LP-PERM-13
- LP-AC-POL-05..LP-AC-POL-07
- LP-US-061..LP-US-064
- LP-E2E-05..LP-E2E-06
- LP-PROT-MILESTONE-SHEET
- LP-PROT-BUILDER-MILESTONE

## Context pointers

Load the feature brief review cycles, privacy, policy acceptance, and evidence
sections; spec User Stories 61–66 and E2E-05/E2E-06; implementation plan Phase
5; canonical Milestone review specs; and existing Milestone, Evidence Package,
review, revision, authorization, audit, and collaboration owners.

## Steps and completion criteria

1. Define stable request and monotonic cycle identities. Completion criterion:
   resubmission cannot create a new logical request or overwrite an old cycle.
2. Snapshot submission data, requirements, and evidence references per cycle.
   Completion criterion: later edits cannot change the reviewed submission.
3. Implement correction and resubmission commands. Completion criterion:
   rejection creates correction state, revision instructions are publishable,
   resubmission increments the cycle, and current approvals reset.
4. Test stale-cycle, replay, concurrent resubmission, and privacy behavior.

## Required verification

- Milestone request/cycle schema and command tests
- Snapshot immutability, correction, reset, and stale-decision tests
- Builder-safe and reviewer projection privacy tests

## Completion gate

Complete only when a Milestone review remains one stable request across all
cycles, old approvals never count, and full history is reconstructable.
