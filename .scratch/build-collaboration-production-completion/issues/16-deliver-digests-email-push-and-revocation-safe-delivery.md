# 16 — Deliver digests, email, and push with revocation-safe delivery

**What to build:** Honour collaboration notification preferences through real digest and external-channel delivery while keeping in-app notifications canonical and rechecking access at send time.

**Blocked by:** 15 — Emit canonical notification events for collaboration activity.

**Status:** completed

**Source contracts:** Build Collaboration Product Contract §12; Build Collaboration Production Implementation Plan — Task 9; Build Collaboration Cutover Runbook — Verification and monitoring; Build Collaboration Implementation Gap Analysis — Notifications stop at initial publication.

- [x] General activity can be bundled into configurable daily or weekly digests and critical/direct events remain immediate.
- [x] Email is enabled by default for direct and critical events, push is opt-in where supported, and SMS remains excluded.
- [x] Delivery workers revalidate tenant, Build, participant, post, reference, and asset access immediately before rendering or sending.
- [x] Muting ordinary notifications cannot suppress compliance-critical assignments or approvals.
- [x] Failed and retried sends are observable and idempotent without duplicating user-visible delivery.
- [x] Access revocation cancels queued external delivery and prevents restricted preview content.
- [x] Tests cover channel combinations, cadence, critical overrides, revocation races, retries, and digest ACL boundaries.
