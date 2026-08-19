# Phase 8 handoff — Transactional notifications

Handoff ID: LP-HO-P8

Status: ready; no work package is authorized to start by this
document alone.

## Phase 1 baseline

The accepted recipient-eligibility interface comes from Phase 1 product SHA
`6ba68e82a7c445074b11ae7f08f3c901a3c3b2b9`, certified by `LP-P1-05`.

The Phase 1 consumer contract assigns Phase 8 this deterministic input:
durable domain event + resource/cycle scope + current canonical membership
eligibility and access. Preserve this split; notification delivery never owns
membership, resource authority, or workflow state.

## Entry prerequisites

1. Verify `LP-P1-05`, `LP-P2-05`, `LP-P4-04`, `LP-P5-05`, and
   `LP-P6-05` with exact evidence. Phase 7 is not a dependency.
2. Confirm the accepted Phase 1 interfaces. Completion criterion:
   current membership, deactivation, supported-role, and organization-scope
   semantics used at recipient resolution are confirmed.
3. Reconcile existing email transport, scheduler/worker, audit, notification,
   route-link, environment, and observability owners on the target HEAD.
4. Confirm the four-event recipient matrix and every event-producing command
   from certified upstream phases.
5. Validate the exact checkout before `LP-P8-01` starts.

## Canonical owners and context pointers

- email provider seam: `convex/email_transport.ts` and its tests/runbook;
- existing notification patterns:
  `convex/build_collaboration_notifications.ts`,
  `convex/build_participant_revocation_notifications.ts`, and
  `convex/quote_notifications.ts` for patterns only after ownership review;
- membership and resource authorization: accepted Phase 1 boundaries plus
  certified proposal/request policy owners;
- authorized routes: production lender, Back Office, and Builder route
  manifests from certified phases;
- source contract: notification triggers, recipient matrix, User Stories
  79–86, implementation plan Phase 8, and four Phase 8 packets.

Fresh inventory selects the durable intent/outbox and worker owner. Reuse one
canonical delivery system rather than treating an example notification module
as automatic ownership.

## Package sequence and safe parallel lanes

1. `LP-P8-01` creates transactional notification intents and idempotency for
   the four confirmed event classes.
2. `LP-P8-02` resolves current eligible recipients and authorized links after
   `LP-P8-01`.
3. `LP-P8-03` implements provider delivery, retries, terminal state, and
   health after the intent and recipient contracts.
4. `LP-P8-04` independently certifies the phase.

The package chain is sequential because each layer consumes the prior durable
contract. Phase 8 as a whole may run alongside Phase 7 after its Phase 2/4/5/6
dependencies are certified.

## Participant and prototype contracts

- Only approval-required, post-decline proposal update, withdrawal, and
  approval-outcome event classes emit.
- When an outcome creates the next group action, approval-required replaces the
  duplicate outcome email.
- Recipient eligibility comes from current canonical membership and resource
  access; no per-record user-assignment system is introduced.
- Email payloads omit reviewer identity and private rationale for unauthorized
  recipients.
- Possession of a link grants no authority; the target route re-authorizes on
  open.
- General progress changes produce no notification intent.

## Required verification and exact-commit evidence

Packet evidence names the originating domain event/transaction, resource and
cycle, recipient fixture, candidate SHA, idempotency key, provider attempt
state, link-open authorization result, observability result, and independent
review. Required phase proof:

- transaction rollback, event allowlist, next-group suppression, replay, and
  logical-intent deduplication tests;
- membership/withdrawal/cycle recipient matrix and payload field-absence tests;
- link-open re-authorization tests;
- provider timeout/crash/retry/idempotency/terminal-failure tests;
- tenant-scoped backlog, latency, failure, and privacy-safe health evidence;
- all relevant upstream event journeys plus build and execution validation.

`LP-P8-04` certifies one exact merged SHA. Mock delivery without durable
intent, recipient, and link evidence cannot pass.

## Rollback and escalation

Rollback disables intent production or delivery workers while retaining
auditable intents and attempts; it does not reverse workflow transitions.
Escalate when no canonical outbox/worker owner exists, provider idempotency
cannot prevent duplicates, current access cannot be checked at send/open time,
an event falls outside the four-class contract, or final Phase 1 eligibility
semantics differ from the provisional baseline.

Prefer fail-closed paused delivery with observable backlog over duplicate or
private-data-unsafe sending. Do not expand event scope inside this phase.

## Binary phase exit gate

Phase 8 passes only when `LP-P8-01` through `LP-P8-03` are independently
accepted, `LP-P8-04` proves exactly four event classes deliver transactionally,
idempotently, privately, and with link re-authorization and observable retries
on one SHA, and all Phase 8 ledger records are verified.
