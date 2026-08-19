# LP-P8-03 — Delivery, retry, and health

Status: ready

Depends on: LP-P8-01, LP-P8-02

## Objective

Deliver confirmed notification intents with recorded attempts, idempotent
retries, observable terminal state, and tenant-scoped health signals.

## Ownership

Extend the canonical email provider adapter, notification worker/scheduler,
attempt ledger, audit, and observability owners. Do not mark workflow completion
from delivery success or create a second retry system.

## Traceability selectors

- LP-NOTIF-01..LP-NOTIF-04
- LP-AC-PORTAL-04
- LP-US-079..LP-US-086
- LP-QG-03..LP-QG-09
- LP-VSG-01..LP-VSG-10

## Context pointers

Load feature brief notification delivery and acceptance; spec User Stories
79–86 and testing decisions; implementation plan Phase 8; and canonical email
adapter, scheduler, durable function, observability, audit, and environment
configuration owners found by implementation-checkout inventory.

## Steps and completion criteria

1. Define attempt, success, retryable failure, and terminal failure states.
   Completion criterion: state transitions are explicit, tenant-scoped, and
   auditable.
2. Implement provider delivery with one idempotency boundary. Completion
   criterion: worker retry, timeout, crash, and provider retry cannot send a
   duplicate logical email.
3. Implement bounded retry and operational health. Completion criterion:
   attempts, latency, failures, backlog, and terminal errors are observable
   without exposing message private data.
4. Test provider failures and recovery. Completion criterion: deterministic
   fake/provider seams prove retry schedule, deduplication, and terminal state.

## Required verification

- Delivery state-machine and provider-adapter tests
- Crash/retry/idempotency and terminal-failure tests
- Tenant-scoped observability and data-minimization review

## Completion gate

Complete only when delivery is durable, retries cannot duplicate a logical
email, failure is observable, and notification state remains auditable.
