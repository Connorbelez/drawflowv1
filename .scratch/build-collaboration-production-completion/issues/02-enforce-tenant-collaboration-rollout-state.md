# 02 — Enforce tenant collaboration rollout state

**What to build:** Give each originating brokerage/lender organization an explicit, audited collaboration rollout state so the feed and shared mutations fail closed until migration parity has been established and the tenant is deliberately activated.

**Blocked by:** None — can start immediately.

**Status:** completed

**Source contracts:** Build Collaboration Product Contract §§3, 13, and 14; Build Collaboration Production Implementation Plan — Participation and tenant rollout and Tasks 3, 4, 11, and 13; Build Collaboration Cutover Runbook — Preconditions, Activation, and Rollback; Build Collaboration Implementation Gap Analysis — Tenant rollout state is schema-only.

- [x] A tenant with no collaboration setting or `disabled` state cannot read or mutate shared collaboration data and sees the approved unavailable/disabled production state.
- [x] Authorized operators can transition `disabled → migration_ready → active` only through explicit audited commands with actor, role, timestamp, prior/new state, and reason where required.
- [x] Activation is rejected until durable migration/parity evidence for the tenant exists.
- [x] Rollback disables the UI and shared mutations without deleting migrated posts, revisions, or audit history.
- [x] The production Details surface renders the Familiar Feed only when the tenant is active while leaving Build Overview operational.
- [x] Tests cover missing settings, every legal and illegal transition, cross-tenant attempts, activation prerequisites, and rollback preservation.
