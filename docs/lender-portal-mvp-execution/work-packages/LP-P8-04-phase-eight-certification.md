# LP-P8-04 — Phase 8 certification

Status: ready

Depends on: LP-P8-01, LP-P8-02, LP-P8-03

## Objective

Independently certify the event allowlist, transactional intents, recipient
eligibility, privacy, link authorization, delivery, retries, and observability.

## Ownership

Own only Phase 8 evidence and traceability. Certification is read-only.

## Traceability selectors

- LP-NOTIF-01..LP-NOTIF-04
- LP-AC-PORTAL-04
- LP-DEC-04
- LP-US-079..LP-US-086
- LP-TEST-01..LP-TEST-13
- LP-QG-01..LP-QG-09
- LP-VSG-01..LP-VSG-10

## Context pointers

Load Phase 8 source sections, three packet evidence records, exact candidate
diff, recipient matrix, canonical delivery owners, and relevant event journeys.

## Steps and completion criteria

1. Bind transition, worker, provider, and link-open evidence to one candidate
   SHA and runtime/deployment provenance.
2. Audit event allowlist, transactional consistency, deduplication, current
   eligibility, privacy, link re-authorization, retries, and health.
3. Re-run focused and repository checks plus all event-producing journeys.
4. Inspect stored payloads, logs, metrics, errors, and links for private data and
   tenant scope.
5. Record unconditional accepted or rejected exact-commit evidence.

## Required verification

- Focused notification, authorization, provider, and observability tests
- Relevant exact-commit multi-actor journey evidence
- Build and repository checks
- bun run validate:lender-portal-execution

## Completion gate

Phase 8 passes only when all three packets are accepted, only four event classes
deliver reliably and privately, links re-authorize, and evidence names one SHA.
