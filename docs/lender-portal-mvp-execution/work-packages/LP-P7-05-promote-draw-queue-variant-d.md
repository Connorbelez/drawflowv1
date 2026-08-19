# LP-P7-05 — Promote Draw Queue Variant D

Status: ready

Depends on: LP-P5-05, LP-P6-05, LP-P7-01

## Objective

Directly promote the selected Lender Draw Queue Variant D with Needs my action
as default and canonical DrawReviewSheet integration.

## Ownership

Start from LP-PROT-DRAW-QUEUE and reuse the shared DrawReviewSheet, canonical
Draw request cycle, pooled Build availability, evidence, policy progress, and
queue projections. Do not create a lender Draw review model.

## Traceability selectors

- LP-PERM-14..LP-PERM-15
- LP-AC-PORTAL-03
- LP-US-074
- LP-PROT-DRAW-QUEUE
- LP-PROT-DRAW-SHEET
- LP-E2E-09
- LP-QG-05..LP-QG-09

## Context pointers

Load selected Draw queue/sheet promotion entries and
docs/specs/lender-portal-draw-review.md; feature brief portal and permissions;
spec User Story 74; implementation plan Phase 7 Draw clauses; and exact queue,
filter, pooled availability, shared sheet, evidence, and decision owners.

## Steps and completion criteria

1. Bind canonical all-assigned and Needs-my-action projections. Completion
   criterion: default filter, counts, rows, and eligibility agree.
2. Promote Variant D directly. Completion criterion: locked hierarchy, filters,
   density, row states, and navigation are preserved.
3. Integrate DrawReviewSheet. Completion criterion: pooled availability, cycle,
   evidence, group progress, rejection, correction, and history use canonical
   data and commands.
4. Verify empty, forbidden, withdrawn, stale-cycle, correction, partial
   approval, concurrent decision, keyboard, focus, and responsive behavior.

## Required verification

- Queue/filter/count and shared-sheet integration tests
- Variant D parity and accessibility evidence
- Draw participant browser journey evidence

## Completion gate

Complete only when Variant D is production, shared Draw ownership is preserved,
and queue/action/parity evidence names one exact commit.
