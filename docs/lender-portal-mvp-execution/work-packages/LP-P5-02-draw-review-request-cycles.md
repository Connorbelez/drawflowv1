# LP-P5-02 — Draw review-request cycles

Status: ready

Depends on: LP-P3-05

## Objective

Apply the same stable request-cycle pattern to Draw Requests while preserving
Draw-specific pooled Build availability, submission data, and eligibility.

## Ownership

Extend the canonical Draw Request, pooled Build availability, DrawReviewSheet,
review, authorization, audit, and revision owners. Do not fork a lender Draw or
implement the still-unselected Builder Draw presentation.

## Traceability selectors

- LP-SCOPE-06
- LP-INV-09..LP-INV-11
- LP-INV-16
- LP-PERM-11..LP-PERM-13
- LP-AC-POL-05..LP-AC-POL-07
- LP-US-061..LP-US-066
- LP-E2E-05..LP-E2E-06
- LP-PROT-DRAW-SHEET

## Context pointers

Load docs/specs/lender-portal-draw-review.md; feature brief request-cycle,
privacy, and policy sections; spec User Stories 61–66; implementation plan
Phase 5; and canonical Draw Request, Build availability, DrawReviewSheet,
review, authorization, audit, and revision implementations.

## Steps and completion criteria

1. Reconcile the shared cycle model with Draw-specific data. Completion
   criterion: shared semantics are reused without collapsing Milestone and Draw
   payloads or eligibility.
2. Snapshot each Draw submission and relevant evidence references. Completion
   criterion: a reviewed cycle is immutable and tied to pooled availability.
3. Implement correction and same-request resubmission. Completion criterion:
   published instructions are Builder-safe and every required approval resets.
4. Test stale cycles, availability changes, replay, and concurrent decisions.
   Completion criterion: no earlier cycle or stale availability can complete.

## Required verification

- Draw request/cycle and pooled-availability tests
- Correction, resubmission, reset, stale-cycle, and audit tests
- Reviewer and Builder-safe projection privacy tests

## Completion gate

Complete only when Draw review uses the canonical stable cycle pattern and no
work in this packet invents a Builder Draw UI decision.
