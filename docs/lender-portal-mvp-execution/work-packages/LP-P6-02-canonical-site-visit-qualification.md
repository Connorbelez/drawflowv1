# LP-P6-02 — Canonical Site Visit qualification

Status: ready

Depends on: LP-P3-05, LP-P5-05

## Objective

Reuse the canonical Site Visit domain for eligible Back Office or lender users
and require a completed report plus at least one photo without discarding
location-unverified evidence.

## Ownership

Extend canonical Site Visit, evidence attachment, geofence, authorization,
Milestone review, and audit owners. Do not create a lender Site Visit record.

## Traceability selectors

- LP-SCOPE-05
- LP-INV-12
- LP-INV-17..LP-INV-18
- LP-PERM-16
- LP-AC-EVID-01..LP-AC-EVID-02
- LP-US-052..LP-US-054
- LP-E2E-07

## Context pointers

Load feature brief Site Visit rules, permissions, and evidence acceptance; spec
User Stories 52–54 and E2E-07; implementation plan Phase 6; DrawFlow PRD
geofence invariant; and canonical Site Visit, report, photo, location attempt,
attachment authorization, Milestone, and audit owners.

## Steps and completion criteria

1. Define qualifying Site Visit linkage and status. Completion criterion: the
   visit is organization-scoped, tied to the current Milestone review, and uses
   canonical report/photo/location fields.
2. Implement completion and qualification commands. Completion criterion:
   report plus photo is mandatory and either eligible reviewing group may
   complete according to canonical authorization.
3. Preserve geofence failures. Completion criterion: evidence remains stored as
   location-unverified and routes to review instead of being deleted.
4. Test offline/retry, duplicate photos, report state, foreign scope,
   membership change, and attachment access.

## Required verification

- Site Visit qualification, report, photo, and geofence tests
- Back Office/lender authorization parity tests
- E2E-07 command-boundary evidence

## Completion gate

Complete only when required Site Visit qualification uses one canonical record,
geofence failure preserves evidence, and all direct bypasses fail.
