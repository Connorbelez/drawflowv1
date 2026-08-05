# Resend email transport

DrawFlow records transactional communication intent in the same Convex
mutation as the domain transition, then dispatches it after commit through the
official `@convex-dev/resend` component. Domain code must not call Resend or
require provider configuration to commit a Build, Cost Document, Quote Round,
Invitation, or response transition.

## Durable delivery model

- `communicationIntents` is the organization-scoped domain outbox. It stores a
  safe payload snapshot, recipient snapshot, immutable business correlation,
  idempotency key, current dispatch state, and bounded retry metadata.
- `communicationAttempts` is append-only. Every claim, lease expiry, provider
  enqueue, or failed retry has its own attempt row; a stale `dispatching` lease
  is abandoned before the next claim.
- `communicationOutcomes` is append-only and records dispatch, suppression,
  action-required, and provider outcomes. It is the reconciliation ledger, not
  a second queue.
- `emailMessages` correlates the provider message to the intent and attempt.
  `emailDeliveryEvents` retains each unique signed Resend callback.
- Independent one-minute crons schedule Quote Invitation reminders and dispatch
  communication intents. The reminder sweep advances a durable bounded cursor
  and gives each Round its own mutation; it cannot block the delivery worker.
  `internal.quote_notifications.processDueCommunicationIntents` claims a
  bounded batch, renders from the immutable snapshot, sends through Resend with
  the intent key as the provider idempotency key, and records success or failure
  in a follow-up mutation. Reclaimed leases therefore cannot duplicate a
  provider send.

The dispatcher retries transient failures at one, five, and thirty minutes.
After the retry budget, the intent becomes `action_required` with a safe error
that operations can reconcile. Provider failures do not roll back the domain
transition. A missing sender/API configuration is therefore visible as an
action-required communication while the underlying domain record remains
durable.

## Domain sending contract

Use `enqueueCommunicationIntent` from `convex/email_transport.ts` only inside
the mutation that records the triggering transition. Supply:

- a stable organization-scoped idempotency key derived from the immutable
  business event or revision;
- the Build, Brokerage, and organization IDs;
- a closed `kind`, template key, and JSON-safe payload snapshot; and
- the recipient snapshot and immutable entity correlation.

The helper replays an identical intent and fails closed if the same key is
reused with different scope, recipient, entity, template, or payload. It never
stores a raw bearer token. Quote Invitation links use HMAC-SHA-256 over the
intent ID with `COMMUNICATION_TOKEN_SECRET`; only the credential verifier is
persisted. Rotating that secret invalidates every outstanding Quote Invitation
link, so rotate it only through a planned access-rotation operation.

Commercial changes do not mutate a live deadline or access window. Reopen a
Quote Round through a new Package Revision. The revision communication payload
must include the changed-field keys (including `responseDeadline` and any
material access-window mapping) plus the operator reason. Manual reminders are
additive credentials with a 24-hour cooldown and do not revoke the prior link.

Current durable intents include Cost Document submission receipts, Quote
Invitation initial/revision/rotation/replacement/reminder/revocation notices,
Quote Round cancellation notices, and Quote response submitted/resubmitted/
withdrawn notices. Autosaves, draft reads, link exchanges, comparisons, and
Preferred Quote projections do not send email.

## Required Convex environment variables

Set these on every deployment that sends email:

```sh
bun x convex env set RESEND_API_KEY
bun x convex env set RESEND_FROM_EMAIL 'DrawFlow <notifications@updates.fairlend.ca>'
bun x convex env set RESEND_WEBHOOK_SECRET
bun x convex env set COMMUNICATION_TOKEN_SECRET
```

`RESEND_FROM_EMAIL` must use a verified Resend domain. Never commit any of the
values above to the repository.

## Resend webhook

After deploying the HTTP action, create or reconcile one enabled Resend webhook
for the current Convex deployment:

```sh
bun run configure:resend-webhook
```

The command targets:

```text
https://<deployment>.convex.site/resend-webhook
```

It enables all email events supported by the component and writes the returned
signing secret to `RESEND_WEBHOOK_SECRET` in that same Convex deployment without
printing the secret. Running it again updates the existing endpoint instead of
creating a duplicate webhook.

Callbacks are signed, at-least-once, and may arrive out of order. The handler
deduplicates the fingerprint `(provider message ID, event type, provider
created-at)`, appends a normalized `emailDeliveryEvents` row, and appends a
corresponding `communicationOutcomes` row. A terminal failure, bounce, or
complaint cannot be downgraded by a later engagement/delivery callback. Other
strictly newer provider timestamps advance the projection. Equal timestamps
use the conservative precedence failure/bounce/complaint, delivered,
opened/clicked, sent, delayed.

## Reconciliation checklist

1. Inspect the organization-scoped intent by its immutable idempotency key or
   invitation/entity index. Do not infer state from a provider dashboard alone.
2. Inspect all append-only attempts and outcomes. Confirm whether the latest
   attempt is `enqueued`, `failed`, `abandoned`, or still leased.
3. Match `providerResendEmailId` to `emailMessages` and the signed
   `emailDeliveryEvents` rows. Check provider timestamps before declaring a
   regression; an old callback must not overwrite a newer state.
4. For `retry_scheduled`, allow the next cron lease to run. For
   `action_required`, correct sender/API/webhook configuration or the recipient
   data, then use the owning domain revision/reminder/replacement path to create
   a new immutable intent. Do not edit an attempt or rewrite a sent intent.
5. Re-run the bounded register projection. It exposes per-recipient latest
   status, outcome time, bounded coarse history, retry/action-required recovery
   state, and reminder eligibility without returning recipient names, email
   addresses, or raw provider errors. Raw normalized errors remain available in
   `communicationOutcomes` to authorized operators.

For local verification, run `bun x convex codegen`,
`bun x tsc -p convex/tsconfig.json --noEmit`, and the focused email, Cost
Document, and Quote Round suites before claiming a transport repair.
