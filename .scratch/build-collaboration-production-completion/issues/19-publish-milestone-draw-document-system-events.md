# 19 — Publish Milestone, Draw, and Document transitions into collaboration

**What to build:** Turn material Milestone, Draw, and governing Document transitions into the shared Build record without duplicating operational state or bypassing lender authority.

**Blocked by:** 04 — Enforce canonical typed-reference ACLs and a role-safe @ index; 11 — Create Action Items from live posts and open a full detail surface; 15 — Emit canonical notification events for collaboration activity; 17 — Govern collaboration assets and attachments.

**Status:** ready-for-agent

**Source contracts:** Build Collaboration Product Contract §11; Build Collaboration Production Implementation Plan — Internal event interface and Task 9; Build Collaboration Cutover Runbook — Verification and monitoring; Build Collaboration Implementation Gap Analysis — Operational integration is not connected.

- [ ] Milestone submitted, approved, rejected, or blocked transitions emit canonical system posts from the authoritative mutation.
- [ ] Draw submitted, approved, released, or returned transitions emit canonical system posts without changing reimbursement or lender-approval rules.
- [ ] Governing Documents added or superseded emit canonical system posts and preserve document version history.
- [ ] Each event is idempotent, uses canonical references, inherits the correct audience, and deep-links to the focused operational detail.
- [ ] Deterministic policy Action Items are duplicate-safe and AI/ad hoc recommendations require human approval.
- [ ] Non-material operational updates remain audit-only and do not create feed noise.
- [ ] Tests cover every transition, retries, transaction rollback, lender/admin authority, restricted roles, and no duplicate records.
