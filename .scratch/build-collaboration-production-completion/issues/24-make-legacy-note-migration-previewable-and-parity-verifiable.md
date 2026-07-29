# 24 — Make legacy-note migration previewable and parity-verifiable

**What to build:** Give operators a deterministic, no-write preview and guarded application workflow that migrates legacy Public/Internal Notes exactly once and proves Build-by-Build role parity before activation.

**Blocked by:** 02 — Enforce tenant collaboration rollout state; 04 — Enforce canonical typed-reference ACLs and a role-safe @ index; 07 — Add immutable post/comment editing and tombstones.

**Status:** ready-for-agent

**Source contracts:** Build Collaboration Product Contract §§2–4 and 13; Build Collaboration Production Implementation Plan — Task 13; Build Collaboration Cutover Runbook — Preconditions, Migration, Parity Checks, and Rollback; Build Collaboration Implementation Gap Analysis — Migration exists without an executable cutover.

- [ ] A no-write preview reports exact tenants, Builds, source notes, audience mappings, expected revisions, warnings, and deterministic plan token.
- [ ] Application requires confirmation of the exact plan token, revalidates tenant ownership/state, and performs bounded writes.
- [ ] Public Notes become Build-wide imported Updates and Internal Notes become author-tier-and-higher imported Updates.
- [ ] Original author, role snapshot, content, and timestamps are preserved without creating notifications, receipts, Action Items, or artificial activity bumps.
- [ ] Replay is idempotent and produces zero duplicate posts or revisions.
- [ ] A durable parity report proves counts, one current revision per import, audience mapping, opaque Contractor denial, and the full approved role matrix per Build.
- [ ] Failure recovery never dual-writes or restores content into legacy notes, and tests cover preview drift, partial failure, replay, and cross-tenant protection.
