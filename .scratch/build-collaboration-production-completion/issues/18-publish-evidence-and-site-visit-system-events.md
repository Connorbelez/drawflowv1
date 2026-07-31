# 18 — Publish Evidence and Site Visit transitions into collaboration

**What to build:** Turn material Evidence and Site Visit transitions into idempotent, discussable Build posts with canonical references, the correct audience, notifications, and deterministic remediation work.

**Blocked by:** 04 — Enforce canonical typed-reference ACLs and a role-safe @ index; 11 — Create Action Items from live posts and open a full detail surface; 15 — Emit canonical notification events for collaboration activity; 17 — Govern collaboration assets and attachments.

**Status:** completed

**Source contracts:** Build Collaboration Product Contract §11; Build Collaboration Production Implementation Plan — Internal event interface and Task 9; Build Collaboration Cutover Runbook — Verification and monitoring; Build Collaboration Implementation Gap Analysis — Operational integration is not connected.

- [x] Evidence submitted, rejected, completed, or location-unverified transitions emit canonical system posts from their authoritative transaction.
- [x] Site Visit scheduled, rescheduled, completed, or flagged transitions emit canonical system posts from their authoritative transaction.
- [x] Every event uses a deterministic idempotency key and retries do not duplicate posts, notifications, references, or Action Items.
- [x] System posts carry canonical Evidence/Site Visit context and never widen access beyond the referenced entity.
- [x] Deterministic policy rules can create duplicate-safe remediation Action Items; AI-inferred work remains a human-approved draft.
- [x] The system post is immediately discussable and deep-links to the existing focused Evidence or Site Visit detail.
- [x] Tests cover each transition, no-op/non-material changes, geofence failure preservation, retries, rollback, and role visibility.
