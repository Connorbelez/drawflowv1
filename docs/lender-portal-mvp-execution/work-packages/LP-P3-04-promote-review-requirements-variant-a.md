# LP-P3-04 — Promote Review Requirements Variant A

Status: ready

Depends on: LP-P3-02, LP-P3-03

## Objective

Directly promote the selected Back Office Review Requirements Variant A and
bind it to canonical policy draft, validation, lock, and proposal revision data.

## Ownership

Start from the selected prototype route and components named by
`LP-PROT-POLICY`. Extend the existing Back Office proposal editor and shared
components. Do not recreate the surface or create client-owned policy state.

## Traceability selectors

- `LP-PERM-07`
- `LP-AC-POL-01..LP-AC-POL-04`
- `LP-US-046..LP-US-051`
- `LP-PROT-POLICY`
- `LP-QG-05..LP-QG-09`
- `LP-VSG-01..LP-VSG-10`

## Context pointers

Load the `LP-PROT-POLICY` promotion entry and selected route README entry;
feature brief policy configuration and acceptance; spec User Stories 46–51;
implementation plan Phase 3 and vertical-slice gate; and exact production Back
Office proposal editor, policy loader, command, and shared component owners.

## Steps and completion criteria

1. Reconcile the prototype with production owners and routes. Completion
   criterion: every visual element maps to canonical data, commands, or a
   confirmed static label.
2. Promote Variant A directly. Completion criterion: hierarchy, controls,
   responsive behavior, and interaction states match the selected surface.
3. Bind typed draft, validation, and lock commands. Completion criterion:
   current proposal revision and assignment are visible, server errors are
   actionable, and stale locks cannot appear successful.
4. Verify accessibility and state coverage. Completion criterion: keyboard,
   focus, validation summary, loading, forbidden, stale, locked, and concurrent
   states pass without internal implementation notes in user-facing UI.

## Required verification

- Production component and route tests
- Variant A visual and interaction parity evidence
- Policy command integration and accessibility tests

## Completion gate

Complete only when the selected prototype is the production surface over the
canonical policy and exact-commit parity evidence is attached.
