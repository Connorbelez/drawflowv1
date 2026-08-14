# LP-P6-01 — Receipts, invoices, and documented total

Status: ready

Depends on: LP-P3-05, LP-P5-05

## Objective

Attach canonical receipt/invoice records to Milestone review cycles, store
amounts as Build-currency integer units, and enforce exact documented-total
equality when policy requires it.

## Ownership

Reuse canonical cost-document, Budget, Milestone, Evidence Package, and review
cycle owners. Do not duplicate receipts, invoices, or actual cost inside the
lender portal.

## Traceability selectors

- LP-SCOPE-05
- LP-INV-10..LP-INV-11
- LP-INV-14..LP-INV-15
- LP-PERM-17
- LP-AC-EVID-03..LP-AC-EVID-04
- LP-US-055..LP-US-057
- LP-E2E-05

## Context pointers

Load feature brief Evidence and approval policy plus evidence acceptance; spec
User Stories 55–57 and E2E-05; implementation plan Phase 6; canonical cost
document, Budget currency, Milestone, Evidence Package, attachment access, and
review-cycle implementations.

## Steps and completion criteria

1. Define eligible current-cycle cost-document references. Completion
   criterion: earlier, removed, foreign-Build, and unauthorized records never
   contribute.
2. Implement exact integer documented-total calculation. Completion criterion:
   currency units and equality semantics are explicit and deterministic.
3. Enforce the Builder submission gate when required. Completion criterion:
   mismatch blocks submission at the command boundary with a Builder-safe error.
4. Test attachment races, cycle changes, duplicate references, currency values,
   URL authorization, and audit history.

## Required verification

- Cost-document eligibility and integer arithmetic tests
- Milestone submission gate and cycle isolation tests
- Attachment authorization and audit tests

## Completion gate

Complete only when documented total is canonical, exact, cycle-bounded, and
cannot be bypassed by a direct submission command.
