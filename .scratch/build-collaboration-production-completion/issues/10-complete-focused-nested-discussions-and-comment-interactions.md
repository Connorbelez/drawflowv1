# 10 — Complete focused nested discussions and comment interactions

**What to build:** Give participants a usable deep conversation experience with stable context, accessible navigation, and the approved comment-level communication controls.

**Blocked by:** 01 — Stabilize typed collaboration interfaces and decompose the production feed; 07 — Add immutable post/comment editing and tombstones; 09 — Implement thread resolution and intent-specific outcomes.

**Status:** completed

**Source contracts:** Build Collaboration Product Contract §6; Build Collaboration Production Implementation Plan — Posts and discussion, Production collaboration feature, and Tasks 6 and 10; Build Collaboration Cutover Runbook — Verification; Build Collaboration Implementation Gap Analysis — Discussion completeness.

- [x] Replies retain unlimited logical ancestry within the generous safety bound and display no more than three visual indentation levels.
- [x] Deeper replies show `Replying to` context and a focused view can hydrate ancestors and descendants around any comment deep link.
- [x] Comments cannot be reparented, moved, or split.
- [x] Authorized participants can react to comments with Acknowledged, Agree, or Question without implying approval or bumping the thread.
- [x] Authors and authorized Build-wide pinners can pin eligible replies without widening visibility.
- [x] Keyboard navigation, focus restoration, loading, deleted-parent, and revoked-content states are accessible and deterministic.
- [x] Tests cover deep nesting, flattened rendering, focused hydration, comment reactions/pins, resolution reopening, and access revocation.
