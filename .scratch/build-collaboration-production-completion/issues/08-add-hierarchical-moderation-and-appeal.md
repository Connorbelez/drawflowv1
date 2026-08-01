# 08 — Add hierarchical moderation and appeal

**What to build:** Allow authorized higher-tier participants to moderate harmful or inappropriate collaboration content while preserving the record, requiring accountability, notifying the author, and supporting appeal.

**Blocked by:** 07 — Add immutable post/comment editing and tombstones.

**Status:** completed

**Source contracts:** Build Collaboration Product Contract §14; Build Collaboration Production Implementation Plan — Task 14; Build Collaboration Cutover Runbook — Verification and monitoring; Build Collaboration Implementation Gap Analysis — Post, comment, and moderation lifecycle is absent.

- [x] Author, Admin, Principal Broker, Broker/Builder/Broker Staff, Builder Staff, Homeowner, and Contractor moderation capabilities match the approved hierarchy.
- [x] Moderation requires a non-empty reason and records actor, exercised role, prior/new state, timestamp, and retained evidence.
- [x] Moderated content preserves revisions, references, attachments, receipts, and audit history.
- [x] The author receives a permission-safe notification and can appeal to the next eligible tier.
- [x] Authorized reviewers can resolve an appeal by restoring or retaining moderation with an audited reason.
- [x] Moderation and appeal never widen visibility or expose restricted metadata.
- [x] Tests cover every hierarchy edge, self-tombstone versus moderation, appeal authority, notifications, and direct API attempts.
