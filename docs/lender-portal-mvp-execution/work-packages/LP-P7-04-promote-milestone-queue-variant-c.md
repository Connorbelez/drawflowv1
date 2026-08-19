# LP-P7-04 — Promote Milestone Queue Variant C

Status: ready

Depends on: LP-P5-05, LP-P6-05, LP-P7-01

## Objective

Directly promote the selected Lender Milestone Queue Variant C with Needs my
action as default and canonical MilestoneDetailSheet integration.

## Ownership

Start from LP-PROT-MILESTONE-QUEUE and reuse the shared
MilestoneDetailSheet, canonical request cycle, evidence, policy progress, and
queue projections. Do not create a lender Milestone sheet.

## Traceability selectors

- LP-PERM-16..LP-PERM-18
- LP-AC-PORTAL-03
- LP-US-073
- LP-PROT-MILESTONE-QUEUE
- LP-PROT-MILESTONE-SHEET
- LP-E2E-09
- LP-QG-05..LP-QG-09

## Context pointers

Load selected Milestone queue and sheet promotion entries; canonical Milestone
review specs; feature brief portal and permission clauses; spec User Story 73;
implementation plan Phase 7; and exact queue, filter, shared sheet, evidence,
Site Visit, and decision owners.

## Steps and completion criteria

1. Bind canonical all-assigned and Needs-my-action projections. Completion
   criterion: default filter, counts, rows, and action eligibility agree.
2. Promote Variant C directly. Completion criterion: locked hierarchy, row
   states, filters, density, and navigation are preserved.
3. Integrate the shared MilestoneDetailSheet. Completion criterion: cycle,
   evidence, group progress, Site Visit, rejection, correction, and history use
   the same canonical data and commands.
4. Verify empty, forbidden, withdrawn, stale-cycle, correction, partial
   approval, concurrent decision, keyboard, focus, and responsive behavior.

## Required verification

- Queue/filter/count and shared-sheet integration tests
- Variant C parity and accessibility evidence
- Milestone participant browser journey evidence

## Completion gate

Complete only when the selected queue is production, counts and actions are
canonical, and no lender-specific Milestone state or sheet exists.
