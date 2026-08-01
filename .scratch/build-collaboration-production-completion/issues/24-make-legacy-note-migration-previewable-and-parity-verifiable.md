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

- Split the fluent-convex cutover into dedicated shared, paged-plan,
  bounded-import, and paged-parity domains. The no-write preview pages the exact
  tenant Build/note inventory and advances a SHA-256 accumulator; the final v2
  token covers every source note field plus Build and tenant ownership without
  a whole-tenant `collect()`.
- Starting a migration freezes a durable v2 manifest. A human Admin or
  Principal Broker must advance Build and note validation in at most 25-row
  transactions, and the computed manifest token must equal the exact confirmed
  preview token before import. Import advances at most 25 manifest notes per
  transaction, revalidates each frozen source/Build snapshot, and leaves its
  cursor unchanged on drift or failure.
- Imports preserve author identity and role snapshots, original content and
  timestamps, and deterministic `buildNote:<id>` identities. Existing rows are
  accepted only when their post and sole current revision match exactly; no
  feed activity bump, notifications, receipts, Action Items, or dual write is
  created. The legacy production note mutation now fails closed and the active
  Build detail projection no longer returns Public/Internal Notes. The former
  unguarded migration runner remains disabled.
- Parity is itself a durable, resumable state machine: it creates Build reports,
  validates manifest notes, scans every Build for orphaned imports, and
  finalizes reports in at most 10-row transactions. Every role is observed
  through `canReadCollaborationPost`; expected and observed readable/restricted
  counts are persisted per Build together with bounded mismatch detail.
- Activation accepts only linked, completed v2 migration/parity runs and their
  server-derived `legacy_note_migration_v1` evidence. It rejects operator-
  attested counts, source drift, duplicate/missing imports, and the empty-source
  orphan case that could otherwise mint false passing evidence.
- Six focused tests cover deterministic paged preview, frozen-manifest drift,
  a 39-note bounded-transaction stress trace, replay, all-role canonical ACL
  observations, opaque Contractor denial, orphaned imports after source
  deletion, cross-tenant protection, batch limits, legacy API retirement, and
  rejection of operator-attested activation evidence.
