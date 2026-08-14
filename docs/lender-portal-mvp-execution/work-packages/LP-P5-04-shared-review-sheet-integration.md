# LP-P5-04 — Shared review-sheet integration

Status: ready

Depends on: LP-P5-01, LP-P5-02, LP-P5-03

## Objective

Bind canonical MilestoneDetailSheet and DrawReviewSheet role adapters to the
same request cycles and directly promote the locked Builder Milestone Variant A
without deciding the Builder Draw presentation.

## Ownership

Reuse the shared MilestoneDetailSheet, DrawReviewSheet, selected lender sheet
prototypes, and Builder Milestone Variant A. Extract or extend existing
components when needed; never create persona-specific copies.

## Traceability selectors

- LP-PERM-11..LP-PERM-13
- LP-AC-POL-05..LP-AC-POL-07
- LP-US-061..LP-US-066
- LP-E2E-05..LP-E2E-06
- LP-PROT-MILESTONE-SHEET
- LP-PROT-DRAW-SHEET
- LP-PROT-BUILDER-MILESTONE
- LP-QG-05..LP-QG-09
- LP-VSG-01..LP-VSG-10

## Context pointers

Load both canonical review specs, the locked Builder Milestone decision doc,
the three selected prototype entries, implementation plan Phase 5 and Phase 7
Builder Milestone clauses, and exact shared sheet production owners and current
call sites.

## Steps and completion criteria

1. Inventory shared sheet definitions and call sites. Completion criterion:
   extraction or extension preserves every current production call site.
2. Add typed role and cycle adapters. Completion criterion: route selects the
   action set, canonical permission caps authority, and all personas render the
   same request/cycle data.
3. Promote locked Builder Milestone Variant A directly. Completion criterion:
   revision instructions precede correction fields and private reviewer data is
   absent; prototype DOM glue is removed in favor of typed seams.
4. Integrate lender Milestone and Draw sheets. Completion criterion: cycle,
   correction, history, eligibility, and decision states match canonical data.
5. Record the Builder Draw boundary. Completion criterion: no Builder Draw UI
   is implemented until a separate product decision selects it.

## Required verification

- Shared-sheet call-site and role-adapter tests
- Locked prototype parity and accessibility evidence
- Same-request correction/resubmission browser evidence

## Completion gate

Complete only when canonical sheets own the production behavior, Builder
Milestone parity is proven, and the unselected Builder Draw UI remains absent.
