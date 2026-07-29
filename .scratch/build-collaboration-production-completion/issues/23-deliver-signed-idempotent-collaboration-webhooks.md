# 23 — Deliver signed, idempotent collaboration webhooks

**What to build:** Let authorized integrations react to collaboration lifecycle events through organization-scoped, replayable webhooks without receiving bodies or assets they have not fetched through the governed application API.

**Blocked by:** 08 — Add hierarchical moderation and appeal; 09 — Implement thread resolution and intent-specific outcomes; 12 — Complete assignment requests and governed completion; 18 — Publish Evidence and Site Visit transitions into collaboration; 19 — Publish Milestone, Draw, and Document transitions into collaboration; 22 — Implement export, retention, legal hold, and Build closure.

**Status:** ready-for-agent

**Source contracts:** Build Collaboration Product Contract §15; Build Collaboration Production Implementation Plan — Internal event interface and Tasks 9 and 14; Build Collaboration Cutover Runbook — Verification and monitoring; Build Collaboration Implementation Gap Analysis — API and webhook gaps.

- [ ] Webhooks cover post/comment publication, thread resolution/reopening, Action Item transitions, asset versions, moderation, and Build closure/reopening.
- [ ] Events are organization-scoped, signed, versioned, idempotent, observable, and safely replayable.
- [ ] Payloads contain identifiers and permission-safe metadata; consumers fetch bodies/assets through the authorized API.
- [ ] Seen receipts are excluded by default and no event reveals restricted placeholders or inaccessible references.
- [ ] Retries preserve ordering/idempotency without duplicating downstream effects.
- [ ] Subscription changes and tenant/access revocation stop future delivery without deleting historical audit events.
- [ ] Tests verify signatures, replay, deduplication, ordering, organization isolation, restricted content, and delivery failure recovery.
