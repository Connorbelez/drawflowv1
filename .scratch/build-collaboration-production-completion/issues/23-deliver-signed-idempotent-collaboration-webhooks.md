# 23 — Deliver signed, idempotent collaboration webhooks

**What to build:** Let authorized integrations react to collaboration lifecycle events through organization-scoped, replayable webhooks without receiving bodies or assets they have not fetched through the governed application API.

**Blocked by:** 08 — Add hierarchical moderation and appeal; 09 — Implement thread resolution and intent-specific outcomes; 12 — Complete assignment requests and governed completion; 18 — Publish Evidence and Site Visit transitions into collaboration; 19 — Publish Milestone, Draw, and Document transitions into collaboration; 22 — Implement export, retention, legal hold, and Build closure.

**Status:** complete

**Source contracts:** Build Collaboration Product Contract §15; Build Collaboration Production Implementation Plan — Internal event interface and Tasks 9 and 14; Build Collaboration Cutover Runbook — Verification and monitoring; Build Collaboration Implementation Gap Analysis — API and webhook gaps.

- [x] Webhooks cover post/comment publication, thread resolution/reopening, Action Item transitions, asset versions, moderation, and Build closure/reopening.
- [x] Events are organization-scoped, signed, versioned, idempotent, observable, and safely replayable.
- [x] Payloads contain identifiers and permission-safe metadata; consumers fetch bodies/assets through the authorized API.
- [x] Seen receipts are excluded by default and no event reveals restricted placeholders or inaccessible references.
- [x] Retries preserve ordering/idempotency without duplicating downstream effects.
- [x] Subscription changes and tenant/access revocation stop future delivery without deleting historical audit events.
- [x] Tests verify signatures, replay, deduplication, ordering, organization isolation, restricted content, and delivery failure recovery.

## Implementation record

- Added a dedicated fluent-convex webhook domain and schema for Admin-managed
  organization endpoints, typed subscriptions, immutable Build sequences,
  endpoint-ordered deliveries, durable attempts, and idempotent replay requests.
- Canonical post/comment publication, thread resolution/reopening, Action Item
  workflow, asset-version publication, moderation, and Build close/reopen
  transactions now emit their approved event families without coupling the
  collaboration aggregate to `production_proposals.ts`.
- Payloads are deterministically versioned and HMAC-SHA256 signed with one-time
  generated secret material. They expose identifiers and validated scalar state
  only; restricted content, TipTap bodies, assets/download URLs, references,
  placeholders, and receipts are excluded.
- Delivery uses endpoint-local ordering, bounded exponential retries, terminal
  failure blocking, in-place failed-sequence recovery, delivered-event replay,
  stable replay idempotency, current subscription/tenant revalidation, and a
  one-minute abandoned-lease recovery cron. Revocation invalidates the endpoint
  secret and stops future fan-out without deleting event or attempt history.
- Added focused Convex coverage for signatures, payload redaction, canonical
  event wiring, deduplication, strict ordering, retry exhaustion and recovery,
  replay idempotency, lease recovery, revocation, Admin-only management, and
  cross-organization denial. The cutover runbook now documents consumer
  verification, activation, monitoring, replay, and revocation procedures.
