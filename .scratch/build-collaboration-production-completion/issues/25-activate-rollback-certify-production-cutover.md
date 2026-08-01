# 25 — Activate, rollback, and certify the production cutover

**What to build:** Execute and retain evidence for the complete Build Collaboration cutover so activated tenants receive the approved workspace, legacy notes are retired safely, and operators can disable the surface without losing the collaboration record.

**Blocked by:** 06 — Complete participant lifecycle and role-complete Build access; 16 — Deliver digests, email, and push with revocation-safe delivery; 18 — Publish Evidence and Site Visit transitions into collaboration; 19 — Publish Milestone, Draw, and Document transitions into collaboration; 20 — Implement authorized Build-local search and deep-link hydration; 21 — Execute scheduled publications and offline/concurrency reconciliation; 22 — Implement export, retention, legal hold, and Build closure; 23 — Deliver signed, idempotent collaboration webhooks; 24 — Make legacy-note migration previewable and parity-verifiable.

**Status:** ready-for-production-cutover

**Source contracts:** Build Collaboration Product Contract — complete contract; Build Collaboration Production Implementation Plan — Tasks 10–15 and Definition of Done; Build Collaboration Cutover Runbook — complete runbook; Build Collaboration Implementation Gap Analysis — Completion Definition.

- [ ] Full collaboration tests, Convex codegen/typecheck, application tests/typecheck/build, UI audit, and deployment parity checks pass warning-free.
- [ ] Migration preview, confirmed application, replay, and Build-by-Build parity evidence are retained for the production tenant.
- [ ] Admin, Principal Broker, Broker/Builder/Broker Staff, Builder Staff, Homeowner, and Contractor production smoke journeys pass.
- [ ] Details remains default, Build Overview remains unchanged above the feed, canonical tabs own their content, and Public/Internal Notes have no remaining read/write paths.
- [ ] The tenant is explicitly activated only after all prerequisites pass, and authorization denials, disclosure alarms, fan-out, idempotency, stale approvals, revision conflicts, and parity are monitored.
- [ ] A rollback rehearsal proves the surface can be disabled without deleting migrated posts, revisions, assets, receipts, or audit history and without restoring dual writes.
- [ ] The deployment record retains activation actor, versions, commands, results, parity artifacts, smoke evidence, monitoring links, and rollback evidence.

## Implementation record

- Added a fail-closed deployment-record certifier and versioned JSON template.
  Certification verifies every retained artifact SHA-256 and refuses partial,
  placeholder, non-human, stale-parity, failed-gate, missing-role, or destructive
  rollback evidence.
- Expanded Convex deployment parity from four feed-foundation queries to twelve
  critical query surfaces spanning rollout, search, lifecycle, retention,
  moderation, webhooks, and the split v2 legacy-note plan/parity domains.
- Removed the dormant duplicate `BuildDetailRoute` Notes UI and the assistant's
  legacy Note mutation command. The compatibility mutation remains fail-closed
  so stale clients receive an explicit retirement error without writing.
- Hardened deadline processing so corrupt Action Item tenant scope is
  quarantined and attributed from the canonical Build rather than silently left
  pending. Raised the bounded scheduler-drain ceiling for the intentionally
  paged participant-activation/search-rebuild regression.
- Local release gates on 2026-08-01: Convex codegen/typecheck passed; 202 test
  files and 1,714 tests passed; application typecheck and production build
  passed; 78 HTML interaction snippets passed; the warning regression check
  passed; all 12 development-deployment parity probes passed. The full 55-test
  Familiar Feed suite, 124-test production proposal suite, 25-test Action Item
  suite, 12-test Action Item queue suite, and 3 certifier tests passed.

## Required production checkpoint

Production activation is deliberately not recorded from the local development
deployment. The current environment has no production Convex target, operator
identity, authenticated eight-role fixture, production monitoring links, or
retained migration artifacts. The Playwright command therefore reported its
single fixture-contract test as skipped. Complete the runbook against the
explicit production tenant, fill the deployment-record template from the
retained outputs, and run `bun run certify:build-collaboration-cutover` before
checking the acceptance items above.
