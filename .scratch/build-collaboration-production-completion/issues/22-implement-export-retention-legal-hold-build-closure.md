# 22 — Implement export, retention, legal hold, and Build closure

**What to build:** Give authorized participants compliant access to collaboration records after day-to-day work while preventing unauthorized bulk disclosure or premature destruction.

**Blocked by:** 08 — Add hierarchical moderation and appeal; 14 — Deliver personal/entity queues, reminders, and escalation; 17 — Govern collaboration assets and attachments; 20 — Implement authorized Build-local search and deep-link hydration.

**Status:** ready-for-agent

**Source contracts:** Build Collaboration Product Contract §14; Build Collaboration Production Implementation Plan — Task 14; Build Collaboration Cutover Runbook — Rollback and Verification; Build Collaboration Implementation Gap Analysis — Operational integration and lifecycle gaps.

- [ ] Admin/Principal Broker, Broker/Builder/Broker Staff, Builder Staff/Homeowner, and Contractor exports match the approved scope for each role.
- [ ] Exports omit restricted placeholders, capture the effective ACL snapshot, use expiring links, and record an audit event.
- [ ] Tenant retention policy governs eligible purge while legal hold prevents destructive retention actions.
- [ ] Build completion does not lock collaboration until Admin or Principal Broker explicitly closes it.
- [ ] Closure is blocked until open Action Items are completed, cancelled, or waived with appropriate authority.
- [ ] Closed Builds are read-only but remain searchable/exportable to authorized users; reopening requires authority, reason, and audit.
- [ ] Tests cover every role's export, restricted content, expired links, legal hold, closure blockers, reopen authority, and retained history.
