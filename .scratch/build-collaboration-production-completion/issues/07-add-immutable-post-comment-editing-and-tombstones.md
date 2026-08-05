# 07 — Add immutable post/comment editing and tombstones

**What to build:** Let authors correct their own posts and comments without erasing history, and let them remove visible content through auditable tombstones rather than destructive deletion.

**Blocked by:** 03 — Bind HITL approval to a trusted human actor and atomic publication bundle.

**Status:** completed

**Source contracts:** Build Collaboration Product Contract §§5, 6, 13, and 14; Build Collaboration Production Implementation Plan — Posts and discussion and Task 6; Build Collaboration Cutover Runbook — Verification; Build Collaboration Implementation Gap Analysis — Post, comment, and moderation lifecycle is absent.

- [x] Authors can edit their own active posts and comments through an expected-revision command.
- [x] Every edit creates an immutable revision containing canonical rich text, derived plain text, reference snapshots, actor, and timestamp.
- [x] The UI displays `Edited`, exposes authorized revision history, and reconciles stale writes without losing the user's draft.
- [x] Editing does not bump meaningful activity or erase Seen history; readers become unread for the new revision.
- [x] Authors can tombstone their content while revisions, references, attachments, and audit history remain durable.
- [x] Tombstones reveal only the approved replacement state and cannot leak content to unauthorized readers.
- [x] Tests cover authorship, stale revisions, concurrent edits, tombstones, receipt revision semantics, and direct unauthorized mutations.
