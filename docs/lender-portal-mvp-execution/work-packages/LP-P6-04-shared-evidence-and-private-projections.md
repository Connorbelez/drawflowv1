# LP-P6-04 — Shared evidence and private projections

Status: ready

Depends on: LP-P6-01, LP-P6-02, LP-P6-03

## Objective

Expose the same submitted evidence package and approval progress to both
authorized reviewing groups while enforcing participant-specific field and
attachment privacy.

## Ownership

Extend canonical Evidence Package, cost-document, Site Visit, request-cycle,
projection, attachment URL, and authorization owners. Do not construct separate
Back Office and lender evidence records.

## Traceability selectors

- LP-INV-10..LP-INV-12
- LP-INV-16..LP-INV-18
- LP-PERM-12..LP-PERM-18
- LP-AC-EVID-01..LP-AC-EVID-05
- LP-US-052..LP-US-060
- LP-E2E-05
- LP-E2E-07
- LP-QG-05..LP-QG-09
- LP-VSG-01..LP-VSG-10

## Context pointers

Load feature brief evidence, privacy, permissions, and acceptance; spec User
Stories 52–60 and E2E-05/E2E-07; implementation plan Phase 6 and vertical-slice
gate; and exact Evidence Package, Site Visit, cost-document, attachment URL,
request projection, audit, and authorization owners.

## Steps and completion criteria

1. Define one canonical review evidence projection. Completion criterion: both
   reviewing groups receive the same current-cycle evidence identities and
   policy progress.
2. Apply server-side field and URL authorization. Completion criterion: Builder,
   withdrawn, inactive, foreign-organization, and foreign-tenant cases receive
   only allowed data and cannot use retained URLs as authority.
3. Integrate rejection/correction and cycle changes. Completion criterion:
   ineligible old-cycle evidence is historical, never current.
4. Test loaders, errors, signed URLs, notification payload inputs, queue
   summaries, and history readers for privacy and consistency.

## Required verification

- Cross-persona projection equivalence and privacy tests
- Attachment URL authorization and expiry tests
- E2E-05 and E2E-07 participant evidence

## Completion gate

Complete only when reviewers share one canonical evidence package, every
unauthorized field and URL fails server-side, and both journeys pass.
