# 09 — Implement thread resolution and intent-specific outcomes

**What to build:** Make Questions, Decisions, Issues/Blockers, Announcements, and ordinary Updates behave as distinct operational records with enforceable resolution and reopening rules.

**Blocked by:** 03 — Bind HITL approval to a trusted human actor and atomic publication bundle; 07 — Add immutable post/comment editing and tombstones.

**Status:** completed

**Source contracts:** Build Collaboration Product Contract §5; Build Collaboration Production Implementation Plan — Posts and discussion and Task 6; Build Collaboration Cutover Runbook — Verification; Build Collaboration Implementation Gap Analysis — Post, comment, and moderation lifecycle is absent.

- [x] Authors and authorized coordinators can resolve eligible threads and otherwise reopen them only with the required reason.
- [x] A new reply to a resolved thread automatically reopens it and records the actor without altering linked operational state.
- [x] A Question resolves only through an accepted visible reply and clearly presents the accepted answer.
- [x] A Decision requires a concise outcome and owner before resolution and preserves outcome revisions.
- [x] An Issue/Blocker requires linked work and a recorded disposition before resolution.
- [x] Announcement prominence can expire without deleting the historical post.
- [x] Tests cover intent-specific invariants, unauthorized resolution, automatic reopening, restricted replies, and audit/outbox effects.
