# LP-P4-03 — Promote Proposal Review Variant D

Status: ready

Depends on: LP-P4-01, LP-P4-02

## Objective

Directly promote the selected Lender Proposal Review Variant D and complete the
paired Back Office remediation and Builder-safe lifecycle surfaces.

## Ownership

Start from the selected `LP-PROT-PROP` route and components. Extend canonical
proposal queue/detail/editor components and adapters; never recreate the
prototype hierarchy or fork confirmation state.

## Traceability selectors

- `LP-SCOPE-03`
- `LP-PERM-08..LP-PERM-09`
- `LP-AC-PROP-02..LP-AC-PROP-04`
- `LP-US-019..LP-US-032`
- `LP-E2E-02..LP-E2E-03`
- `LP-PROT-PROP`
- `LP-QG-05..LP-QG-09`
- `LP-VSG-01..LP-VSG-10`

## Context pointers

Load `LP-PROT-PROP` in the promotion contract and prototype README; feature
brief guided confirmation and privacy sections; spec User Stories 19–32;
implementation plan Phase 4; and exact lender, Back Office, and Builder proposal
route/component owners found by implementation-checkout inventory.

## Steps and completion criteria

1. Map every prototype region and interaction to canonical projections and
   commands. Completion criterion: no prototype data or local workflow action
   remains.
2. Promote Variant D directly with progress, change highlights, decline reason,
   and authorized history. Completion criterion: locked hierarchy and behavior
   are preserved on the production route.
3. Complete paired Back Office remediation and Builder-safe state. Completion
   criterion: decline is actionable through new revision publication and the
   builder sees no private reviewer data.
4. Verify loading, empty, forbidden, withdrawn, stale, repeated-cycle,
   concurrent-decision, responsive, keyboard, focus, and live-status states.

## Required verification

- Lender, Back Office, and Builder route/component tests
- Variant D visual and interaction parity evidence
- Accessibility and projection privacy tests
- E2E-02 and E2E-03 browser evidence

## Completion gate

Complete only when Variant D is the production lender review surface and the
same canonical transition is usable and privacy-correct for all participants.
