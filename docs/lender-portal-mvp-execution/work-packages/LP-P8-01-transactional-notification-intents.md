# LP-P8-01 — Transactional notification intents

Status: ready

Depends on: LP-P2-05, LP-P4-04, LP-P5-05, LP-P6-05

## Objective

Emit durable tenant-scoped notification intents transactionally for only the
four confirmed email event classes and deduplicate by event, resource, cycle,
and recipient.

## Ownership

Extend canonical workflow transition, audit/outbox, and notification owners
found by current-checkout inventory. Notification records are downstream facts;
they do not become workflow state or a general progress-event system.

## Traceability selectors

- LP-NOTIF-01..LP-NOTIF-04
- LP-DEC-04
- LP-US-079..LP-US-081
- LP-US-085
- LP-QG-01..LP-QG-04
- LP-VSG-01..LP-VSG-10

## Context pointers

Load feature brief Notification Triggers and Phase Zero decision 4; spec User
Stories 79–86 and notification testing decisions; implementation plan Phase 8;
prior workflow certification evidence; and canonical transition, audit, outbox,
notification, scheduler, and tenant-scope owners found by fresh search.

## Steps and completion criteria

1. Inventory current notification infrastructure and event consumers.
   Completion criterion: one canonical durable intent/outbox boundary is named.
2. Define typed confirmed event classes and idempotency keys. Completion
   criterion: approval-required, post-decline update, withdrawal, and approval
   outcome are explicit; unsupported progress events are unrepresentable.
3. Emit intents in the same transaction as accepted transitions. Completion
   criterion: retry/replay creates no duplicate logical intent.
4. Apply next-group suppression. Completion criterion: when an outcome creates
   the next required action, only approval-required is emitted.

## Required verification

- Transaction rollback, replay, and idempotency tests
- Event-class allowlist and unsupported-progress tests
- Next-group suppression and audit correlation tests

## Completion gate

Complete only when every confirmed transition atomically creates at most one
logical intent per recipient and no unconfirmed event class can emit.
