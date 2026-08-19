# LP-P5-03 — Canonical review decisions and privacy

Status: ready

Depends on: LP-P5-01, LP-P5-02

## Objective

Implement shared authorized approval and rejection commands with separate
Builder-visible revision instructions and reviewer-only private rationale.

## Ownership

Extend the governed review decision owner used by canonical Milestone and Draw
surfaces. Reuse revision checks, authorization, persistence, audit events, and
role-aware projections; no route may own a parallel decision path.

## Traceability selectors

- LP-INV-10..LP-INV-11
- LP-INV-16
- LP-PERM-11..LP-PERM-13
- LP-AC-POL-05..LP-AC-POL-07
- LP-US-062..LP-US-066
- LP-E2E-05..LP-E2E-06
- LP-QG-01..LP-QG-09
- LP-VSG-01..LP-VSG-10

## Context pointers

Load the canonical Milestone review/decision and Draw review specs; feature
brief permissions and privacy; spec User Stories 62–66; implementation plan
Phase 5 and vertical-slice gate; and the governed review, audit, authorization,
projection, error, and collaboration owners.

## Steps and completion criteria

1. Define typed decision inputs and privacy fields. Completion criterion:
   rejection requires Builder-visible instructions and may store a separate
   private rationale behind explicit authorization.
2. Implement shared approve/reject commands for current cycles. Completion
   criterion: duplicate, stale, unauthorized, and post-terminal decisions fail.
3. Emit auditable state and consumer effects. Completion criterion: any
   rejection moves to correction and blocks old approvals from completion.
4. Test privacy at every boundary. Completion criterion: Builder loaders,
   errors, notifications, audit readers, and collaboration never expose reviewer
   identity or private rationale.

## Required verification

- Shared decision command and audit tests
- Stale, duplicate, concurrent, and terminal-state tests
- Field-level projection, error, and payload privacy tests

## Completion gate

Complete only when both domains use one governed decision boundary and private
review data is absent from every unauthorized response.
