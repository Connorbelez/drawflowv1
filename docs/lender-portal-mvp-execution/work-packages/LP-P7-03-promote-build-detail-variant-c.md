# LP-P7-03 — Promote Lender Build Detail Variant C

Status: ready

Depends on: LP-P7-01

## Objective

Directly promote the compact Lender Build Detail Variant C with only the
confirmed narrow summary, Milestones, Draws, and public Collaboration data.

## Ownership

Start from the LP-PROT-BUILD selected route/components. Reuse canonical Build,
Milestone, Draw, cost-document, and Collaboration owners. Do not load timeline,
Gantt, contractors, internal notes, or the broad document library.

## Traceability selectors

- LP-PERM-14..LP-PERM-19
- LP-AC-PORTAL-02
- LP-US-070..LP-US-072
- LP-PROT-BUILD
- LP-E2E-09
- LP-QG-05..LP-QG-09

## Context pointers

Load LP-PROT-BUILD in the promotion contract and prototype README; feature brief
Lender Portal Build-detail clauses and privacy; spec User Stories 70–72;
implementation plan Phase 7 clauses for Variant C; and exact production Build,
Milestone, Draw, cost-document, collaboration, loader, and route owners.

## Steps and completion criteria

1. Define a narrow authorized loader contract. Completion criterion: deferred
   and Back Office-only fields are absent at the server response boundary.
2. Promote Variant C directly. Completion criterion: selected hierarchy,
   compact density, expansion behavior, and focused sheet navigation match.
3. Bind canonical Milestone, Draw, cost-document coverage, and public
   Collaboration. Completion criterion: all figures and state come from existing
   owners and shared sheets.
4. Verify forbidden, withdrawn, empty, partial, stale, keyboard, focus,
   responsive, and attachment-access states.

## Required verification

- Narrow loader field-absence and authorization tests
- Variant C visual and interaction parity evidence
- Shared sheet navigation and collaboration privacy tests

## Completion gate

Complete only when Variant C is production, its loader has no dependency on
deferred fields, and privacy/parity evidence is tied to one commit.
