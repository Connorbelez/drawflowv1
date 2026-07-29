# 25 — Activate, rollback, and certify the production cutover

**What to build:** Execute and retain evidence for the complete Build Collaboration cutover so activated tenants receive the approved workspace, legacy notes are retired safely, and operators can disable the surface without losing the collaboration record.

**Blocked by:** 06 — Complete participant lifecycle and role-complete Build access; 16 — Deliver digests, email, and push with revocation-safe delivery; 18 — Publish Evidence and Site Visit transitions into collaboration; 19 — Publish Milestone, Draw, and Document transitions into collaboration; 20 — Implement authorized Build-local search and deep-link hydration; 21 — Execute scheduled publications and offline/concurrency reconciliation; 22 — Implement export, retention, legal hold, and Build closure; 23 — Deliver signed, idempotent collaboration webhooks; 24 — Make legacy-note migration previewable and parity-verifiable.

**Status:** ready-for-agent

**Source contracts:** Build Collaboration Product Contract — complete contract; Build Collaboration Production Implementation Plan — Tasks 10–15 and Definition of Done; Build Collaboration Cutover Runbook — complete runbook; Build Collaboration Implementation Gap Analysis — Completion Definition.

- [ ] Full collaboration tests, Convex codegen/typecheck, application tests/typecheck/build, UI audit, and deployment parity checks pass warning-free.
- [ ] Migration preview, confirmed application, replay, and Build-by-Build parity evidence are retained for the production tenant.
- [ ] Admin, Principal Broker, Broker/Builder/Broker Staff, Builder Staff, Homeowner, and Contractor production smoke journeys pass.
- [ ] Details remains default, Build Overview remains unchanged above the feed, canonical tabs own their content, and Public/Internal Notes have no remaining read/write paths.
- [ ] The tenant is explicitly activated only after all prerequisites pass, and authorization denials, disclosure alarms, fan-out, idempotency, stale approvals, revision conflicts, and parity are monitored.
- [ ] A rollback rehearsal proves the surface can be disabled without deleting migrated posts, revisions, assets, receipts, or audit history and without restoring dual writes.
- [ ] The deployment record retains activation actor, versions, commands, results, parity artifacts, smoke evidence, monitoring links, and rollback evidence.
