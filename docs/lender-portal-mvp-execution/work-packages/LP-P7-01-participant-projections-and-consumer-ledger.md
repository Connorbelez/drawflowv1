# LP-P7-01 — Participant projections and consumer ledger

Status: ready

Depends on: LP-P1-05, LP-P2-05, LP-P4-04, LP-P5-05, LP-P6-05

## Objective

Complete permission-shaped Back Office, lender, and Builder projections for
every transition consumer, including exact queue counts and Needs my action.

## Ownership

Extend canonical proposal, Build, Milestone, Draw, evidence, Site Visit,
membership, authorization, and projection owners. Projections are rebuildable;
they do not become new sources of workflow truth.

## Traceability selectors

- LP-SCOPE-07
- LP-PERM-14..LP-PERM-19
- LP-AC-PORTAL-01..LP-AC-PORTAL-03
- LP-US-067..LP-US-076
- LP-E2E-09
- LP-QG-01..LP-QG-09
- LP-VSG-01..LP-VSG-10

## Context pointers

Load feature brief Lender Portal, permissions, and portal acceptance; spec User
Stories 67–76 and E2E-09; implementation plan transition-consumer ledger,
Phase 7, and vertical-slice gate; all prior phase certification evidence; and
canonical projection, membership, authorization, audit, and queue owners.

## Steps and completion criteria

1. Reconcile the transition-consumer ledger against current code. Completion
   criterion: every changed transition has named readers, commands, counts,
   history, notification inputs, and participant surfaces.
2. Define canonical queue/detail read models. Completion criterion: every
   assigned item appears in all-assigned and only current eligible work appears
   in Needs my action.
3. Enforce server-side permission shaping. Completion criterion: withdrawn,
   inactive, foreign-organization, Builder, lender, and Back Office responses
   contain only authorized fields.
4. Add consistency and rebuild tests. Completion criterion: counts equal rows,
   projections rebuild from canonical state, and all personas agree on public
   lifecycle state.

## Required verification

- Projection authorization, count/row equality, and rebuild tests
- Needs-my-action membership, cycle, and policy matrix tests
- Transition-consumer ledger audit

## Completion gate

Complete only when every required consumer has a canonical projection and no
queue, count, or UI owns independent workflow truth.
