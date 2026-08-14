# LP-P9-02 — Security, privacy, and concurrency review

Status: ready

Depends on: LP-P1-05, LP-P2-05, LP-P3-05, LP-P4-04, LP-P5-05, LP-P6-05, LP-P7-07, LP-P8-04

## Objective

Perform an independent authorization, field-privacy, attachment/link, audit,
and workflow-concurrency review across every query, command, route, and worker.

## Ownership

Review canonical authorization, domain, projection, attachment, notification,
audit, and route owners. This packet owns findings and evidence only; fixes
reopen the implementation packet that owns the defect.

## Traceability selectors

- LP-E2E-01..LP-E2E-10
- LP-TEST-15
- LP-FINAL-01..LP-FINAL-05
- LP-QG-01..LP-QG-09
- LP-VSG-01..LP-VSG-10

## Context pointers

Load all permissions, invariants, privacy clauses, testing decisions, E2E
journeys, implementation plan Phase 9 security/concurrency work, phase evidence,
exact candidate diff, route manifest, changed commands/queries, attachment URL
owners, notification links, audit readers, and deployment configuration.

## Steps and completion criteria

1. Enumerate every exposed boundary and role/resource matrix. Completion
   criterion: no changed query, command, action, HTTP route, attachment URL,
   email link, worker, or historical reader is omitted.
2. Test tenant, organization, assignment, membership, role, resource, cycle,
   and field authorization. Completion criterion: cross-boundary and stale cases
   fail server-side without private error data.
3. Test required races: approval/approval, rejection/approval,
   withdrawal/confirmation, deactivation/decision, closing/withdrawal, and
   activation/closing. Completion criterion: outcomes are deterministic and
   audited with no invalid terminal state.
4. Audit logs, metrics, payloads, history, and URLs for data minimization.
   Completion criterion: no unauthorized private reviewer or participant data
   is exposed.
5. Publish accepted or rejected findings bound to the candidate SHA.

## Required verification

- Full authorization and field-privacy matrix
- Attachment and email-link re-authorization evidence
- Workflow race and audit-completeness suite
- Static/dynamic security checks applicable to the changed boundaries

## Completion gate

Complete only when the independent review has no unresolved cross-tenant,
cross-lender, stale-cycle, concurrency, link, or private-data finding.
