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

- Added a fail-closed v2 deployment-record certifier, authenticated production
  certification-state query, and versioned JSON template. Certification parses
  typed artifacts and cross-checks their tenant, Build, release, linked migration
  and parity runs, epoch, verification time, latest-Build boundary, activation,
  and stable-record hashes against server-derived production state.
- Separated the twelve-query function-registration check from authenticated
  positive handler/response-contract and cross-tenant negative probes against a
  designated production organization and Build.
- Rollback evidence now proves active → disabled → active state, exactly one
  cutover-epoch increment, an actually executed legacy-write denial, and
  tenant-wide stable IDs/content for posts, revisions, assets, receipts, and
  pre-disable audit events. The before/after snapshots are durable, indexed,
  cursor-paged server records rather than operator-authored arrays.
- Added a governed gate runner that binds its artifact to the checked-out Git
  commit and fixed argv, writes automated evidence only after a real zero exit,
  and requires a human WorkOS identity plus hashed files for visual/keyboard
  review. Certification binds the exact declared Convex deployment to
  Convex-side release metadata and the web deployment's `/api/release` response.
- Removed the dormant duplicate `BuildDetailRoute` Notes UI and the assistant's
  legacy Note mutation command from both frontend and backend closed catalogs,
  with exact catalog-parity regression coverage. The compatibility mutation remains fail-closed
  so stale clients receive an explicit retirement error without writing.
- Hardened deadline processing so corrupt Action Item tenant scope is
  quarantined and attributed from the canonical Build rather than silently left
  pending. Raised the bounded scheduler-drain ceiling for the intentionally
  paged participant-activation/search-rebuild regression.
- Local release gates on 2026-08-01: Convex codegen/typecheck passed; 206 test
  files and 1,725 tests passed; application typecheck and production build
  passed; 78 HTML interaction snippets passed; the warning regression check
  passed; all 12 development-deployment parity probes passed. The full 55-test
  Familiar Feed suite, 124-test production proposal suite, 25-test Action Item
  suite, 12-test Action Item queue suite, 10-test migration/rehearsal suite,
  3 certifier tests, and 3 governed-runner tests passed.

## Required production checkpoint

Production activation is deliberately not recorded from the local development
deployment. The current environment has no production Convex target, operator
identity, authenticated eight-role fixture, production monitoring links, or
retained migration artifacts. The Playwright command therefore reported its
single fixture-contract test as skipped. Complete the runbook against the
explicit production tenant, fill the deployment-record template from the
retained outputs, and run `bun run certify:build-collaboration-cutover` before
checking the acceptance items above.
