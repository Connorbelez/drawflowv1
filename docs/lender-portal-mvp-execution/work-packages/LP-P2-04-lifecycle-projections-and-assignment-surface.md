# LP-P2-04 — Lifecycle projections and assignment surface

Status: implementation-complete

Depends on: LP-P2-01, LP-P2-02, LP-P2-03

Package-start SHA: `77145bfb0a6d51a5e8030f17e90b24b7104485fd`.

Implementation evidence: `docs/lender-portal-mvp-execution/evidence/LP-P2-04-f6c2cda8.md`.
Independent phase acceptance remains reserved for LP-P2-05.

## Objective

Expose permission-shaped Back Office, Builder, and lender lifecycle
projections, and directly promote the selected lender assignment prototype
against canonical commands.

## Ownership

Extend existing proposal queue/detail/editor and builder status surfaces.
Promote `LP-PROT-ASSIGN` from its selected route and components. Use shared UI
primitives and do not fork proposal state or components.

## Traceability selectors

- `LP-PERM-05..LP-PERM-06`
- `LP-PERM-10`
- `LP-PERM-15`
- `LP-AC-PROP-05..LP-AC-PROP-07`
- `LP-US-033..LP-US-042`
- `LP-E2E-01`
- `LP-E2E-04`
- `LP-PROT-ASSIGN`
- `LP-QG-05..LP-QG-09`
- `LP-VSG-01..LP-VSG-10`

## Context pointers

Load `docs/lender-portal-prototype-promotion.md` entry `LP-PROT-ASSIGN`, its
selected route in the prototype README, feature brief proposal permissions,
spec User Stories 33–42, implementation plan Phase 2 and vertical-slice gate,
and the exact production proposal consumers found by inventory.

## Steps and completion criteria

1. Inventory every consumer of approval, assignment, closing, and activation.
   Completion criterion: each reader is updated or named as a downstream
   dependency with an explicit typed seam.
2. Build canonical permission-shaped projections. Completion criterion: all
   three personas agree on state while private and withdrawn fields remain
   server-filtered.
3. Promote the assignment prototype directly. Completion criterion: the
   selected hierarchy and interactions use production loaders and commands,
   with loading, empty, forbidden, stale, and concurrent states.
4. Verify paired participant behavior. Completion criterion: assignment,
   withdrawal, closing readiness, closing, and activation update every affected
   surface without client-side authorization assumptions.

## Required verification

- Projection privacy and authorization tests
- Production route/component tests and accessibility checks
- Selected-prototype parity evidence
- E2E-01 and E2E-04 browser evidence

## Completion gate

Complete only when the lifecycle is visible and actionable on all required
participant surfaces, `LP-PROT-ASSIGN` is directly promoted, and no UI owns a
parallel state transition.
