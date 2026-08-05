# 10 — Deliver Homeowner inbox, email, digests, and preferences

**What to build:** Deliver authorization-safe collaboration notifications through the in-app inbox and email. Time-sensitive human activity arrives immediately, routine safe Build activity can be digested, and every preview and deep link remains safe after role, assignment, audience, or source-object changes.

**Blocked by:** 04 — Secure Homeowner references, mentions, attachments, and Action Items; 05 — Publish safe Build events into Homeowner collaboration.

**Status:** ready-for-agent

- [ ] Homeowners receive in-app unread state for collaboration they are currently authorized to view.
- [ ] Mentions, replies, assigned Action Items, direct Builder/Backoffice posts, access changes, and appointment changes are eligible for immediate email.
- [ ] Routine allowlisted Build events and general activity are eligible for a configurable daily digest.
- [ ] Homeowners can manage ordinary notification preferences without suppressing mandatory assignments or critical notices.
- [ ] Notification subjects, previews, payloads, counts, and digests contain only authorization-safe projected content.
- [ ] Opening a notification reauthorizes the current organization role, Build assignment, audience, references, attachments, and source objects.
- [ ] Revocation cancels queued deliveries, prevents retry/replay to the removed Homeowner, and makes old deep links fail closed.
- [ ] Audience or source-visibility changes are honored before delivery even when the notification was queued earlier.
- [ ] Delivery remains organization-scoped, deduplicated, retryable, auditable, and bounded by the existing collaboration delivery policy.
- [ ] Push notifications are not introduced in this ticket.
- [ ] Immediate, digest, mute, mandatory, redaction, revocation, retry, and deep-link behavior are covered by delivery-model, integration, and browser tests.

