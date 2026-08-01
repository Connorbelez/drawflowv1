# Resend email transport

DrawFlow sends transactional email through the official `@convex-dev/resend`
component. Product mutations enqueue email through
`enqueueTransactionalEmail` in `convex/email_transport.ts`; they must not call
Resend directly.

The wrapper provides:

- organization-scoped message correlation;
- a domain idempotency key that is atomic with the triggering Convex mutation;
- component-managed durable queueing, batching, retries, rate limiting, and
  provider idempotency;
- append-only normalized delivery events retained by DrawFlow; and
- signed provider status ingestion at `POST /resend-webhook`.

## Required Convex environment variables

Set these on every deployment that sends email:

```sh
bun x convex env set RESEND_API_KEY
bun x convex env set RESEND_FROM_EMAIL 'DrawFlow <notifications@updates.fairlend.ca>'
bun x convex env set RESEND_WEBHOOK_SECRET
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

Resend webhooks are at-least-once and may arrive out of order. DrawFlow dedupes
callbacks and orders the current projection by the provider timestamp while
retaining every unique normalized event.

## Sending contract

Call `enqueueTransactionalEmail` only inside the mutation that records the
triggering domain transition. Supply a stable idempotency key derived from the
immutable business event or revision. Reusing a key with a different recipient,
subject, entity, or brokerage fails closed.

The transport stores recipient, sender, subject, entity correlation, and
delivery metadata. It deliberately does not duplicate message bodies in the app
database; Resend component retention is managed separately once the product
retention policy is locked.
