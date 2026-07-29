# 15 — Emit canonical notification events for collaboration activity

**What to build:** Produce one permission-aware in-app notification stream for the collaboration events that require a participant's awareness or action.

**Blocked by:** 03 — Bind HITL approval to a trusted human actor and atomic publication bundle; 04 — Enforce canonical typed-reference ACLs and a role-safe @ index; 09 — Implement thread resolution and intent-specific outcomes; 10 — Complete focused nested discussions and comment interactions; 12 — Complete assignment requests and governed completion; 14 — Deliver personal/entity queues, reminders, and escalation.

**Status:** ready-for-agent

**Source contracts:** Build Collaboration Product Contract §12; Build Collaboration Production Implementation Plan — User interaction and Task 9; Build Collaboration Cutover Runbook — Verification and monitoring; Build Collaboration Implementation Gap Analysis — Notifications stop at initial publication.

- [ ] Direct mentions, assignments, assignment requests, followed replies, required approvals, blockers, Build-wide pins, acknowledgements, reminders, and escalation emit classified in-app events.
- [ ] Mandatory events cannot be suppressed by unfollowing or ordinary-notification mute settings.
- [ ] Notification bodies and reference context are derived from canonical readable data and never include restricted metadata.
- [ ] Delivery records use deterministic idempotency keys and retries do not duplicate notifications.
- [ ] Access removal cancels future events and existing notification previews revalidate access before displaying content.
- [ ] Every source mutation emits its notification/outbox effects atomically with the domain change.
- [ ] Tests cover event classification, mute/follow rules, deduplication, revoked access, restricted posts, and transaction rollback.
