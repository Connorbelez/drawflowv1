# LP-P7-02 — Promote Lender Dashboard Variant D

Status: ready

Depends on: LP-P7-01

## Objective

Directly promote the selected Lender Dashboard Variant D against canonical
counts, proposal lists, active Builds, and role-aware navigation.

## Ownership

Start from the LP-PROT-DASH selected route and LenderDashboardVariantD
components. Reuse LenderShell and existing UI primitives. Do not redesign or
copy the dashboard into a new component tree.

## Traceability selectors

- LP-AC-PORTAL-01
- LP-US-067..LP-US-069
- LP-US-075..LP-US-076
- LP-PROT-DASH
- LP-E2E-09
- LP-QG-05..LP-QG-09

## Context pointers

Load the LP-PROT-DASH promotion entry and prototype README selection; feature
brief Lender Portal dashboard clauses; spec User Stories 67–69 and 75–76;
implementation plan Phase 7; and production shell, route, loader, shared table,
empty-state, and navigation owners found by current-checkout inventory.

## Steps and completion criteria

1. Reconcile route manifest and production shell. Completion criterion: one
   stable lender route and navigation entry exists without prototype comparison
   behavior.
2. Promote Variant D directly. Completion criterion: locked hierarchy, density,
   responsive behavior, and interactions are preserved.
3. Bind canonical loaders and navigation. Completion criterion: counts match
   rows, links open authorized records, and no prototype/local data remains.
4. Verify loading, empty, forbidden, partial-data, stale membership, keyboard,
   focus, responsive, and dark/light behavior.

## Required verification

- Dashboard loader, route, count, and navigation tests
- Variant D visual and interaction parity evidence
- Accessibility and responsive browser evidence

## Completion gate

Complete only when Variant D is the production dashboard over canonical data
and exact-commit parity and accessibility evidence is attached.
