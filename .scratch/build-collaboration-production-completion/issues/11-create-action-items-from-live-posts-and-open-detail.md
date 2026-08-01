# 11 — Create Action Items from live posts and open a full detail surface

**What to build:** Let any authorized reader turn an existing post into accountable work and manage that work through a reusable, production Action Item detail experience.

**Blocked by:** 04 — Enforce canonical typed-reference ACLs and a role-safe @ index; 05 — Enforce operation-specific Action Item RBAC.

**Status:** completed

**Source contracts:** Build Collaboration Product Contract §9; Build Collaboration Production Implementation Plan — Action Items, Production collaboration feature, and Task 7; Build Collaboration Cutover Runbook — Verification; Build Collaboration Implementation Gap Analysis — Action Item read access and Action Item product gaps.

- [x] An authorized reader can create one or more Action Items on an existing visible post without changing the originating post or its audience.
- [x] The Action Item supports rich title/description, priority, due date, labels, attachments, multiple same-Build references, creator, and assignee.
- [x] Clicking an Action Item reference or card opens the existing reusable detail-sheet pattern focused on that canonical item.
- [x] The detail experience includes discussion and immutable activity/revision history.
- [x] New Action Items project into the parent post and referenced-entity activity without duplicating records.
- [x] Creation updates post open-item count and meaningful activity exactly once and emits an audit/outbox event.
- [x] Tests cover creation authority, audience inheritance, cross-Build references, detail deep links, duplicate submission, and restricted posts.
