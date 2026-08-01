# 24 — Make legacy-note migration previewable and parity-verifiable

**What to build:** Give operators a deterministic, no-write preview and guarded application workflow that migrates legacy Public/Internal Notes exactly once and proves Build-by-Build role parity before activation.

**Blocked by:** 02 — Enforce tenant collaboration rollout state; 04 — Enforce canonical typed-reference ACLs and a role-safe @ index; 07 — Add immutable post/comment editing and tombstones.

**Status:** complete

**Source contracts:** Build Collaboration Product Contract §§2–4 and 13; Build Collaboration Production Implementation Plan — Task 13; Build Collaboration Cutover Runbook — Preconditions, Migration, Parity Checks, and Rollback; Build Collaboration Implementation Gap Analysis — Migration exists without an executable cutover.

- [x] A no-write preview reports exact tenants, Builds, source notes, audience mappings, expected revisions, warnings, and deterministic plan token.
- [x] Application requires confirmation of the exact plan token, revalidates tenant ownership/state, and performs bounded writes.
- [x] Public Notes become Build-wide imported Updates and Internal Notes become author-tier-and-higher imported Updates.
- [x] Original author, role snapshot, content, and timestamps are preserved without creating notifications, receipts, Action Items, or artificial activity bumps.
- [x] Replay is idempotent and produces zero duplicate posts or revisions.
- [x] A durable parity report proves counts, one current revision per import, audience mapping, opaque Contractor denial, and the full approved role matrix per Build.
- [x] Failure recovery never dual-writes or restores content into legacy notes, and tests cover preview drift, partial failure, replay, and cross-tenant protection.

## Implementation record

- Added a dedicated fluent-convex legacy-note migration domain with an
  organization-scoped, no-write preview. Its SHA-256 plan token covers every
  source note field plus Build and tenant ownership, while the response exposes
  the exact Build/note inventory, audience mapping, expected revision, rollout
  state, and blocking warnings.
- Application requires the exact preview token, a human Admin or Principal
  Broker, a non-active tenant, and a clean ownership/role snapshot. It processes
  at most 50 notes per transaction through a durable offset run, revalidates
  source and Build ownership, and resumes safely after drift or partial work.
- Imports preserve author identity and role snapshots, original content and
  timestamps, and deterministic `buildNote:<id>` identities. Existing rows are
  accepted only when their post and sole current revision match exactly; no
  feed activity bump, notifications, receipts, Action Items, or dual write is
  created. The former unguarded migration runner is disabled.
- The server-derived parity verifier persists top-level evidence and one report
  per Build, including exact counts, mismatch details, audience and revision
  checks, orphan/duplicate detection, and all-role readability matrices. A
  report query exposes that evidence to operators without trusting submitted
  counts.
- Tenant activation now accepts only current server-derived
  `legacy_note_migration_v1` evidence. Source drift invalidates the activation
  gate; the former operator-attested evidence path cannot activate a tenant
  containing legacy notes. Tenants with no legacy notes receive a server-derived
  empty-plan report for backwards-compatible cutover automation.
- Focused tests cover deterministic no-write preview, exact-token drift,
  bounded partial recovery, completed-run replay, durable parity, preserved
  records, absence of side effects, live opaque Contractor denial, role-matrix
  expectations, cross-tenant rejection, and rejection of attested counts.
