# 05 — Enforce operation-specific Action Item RBAC

**What to build:** Let participants collaborate on visible Action Items while restricting creation, editing, assignment, acceptance, workflow transitions, completion, checklists, and relationships to the actors authorized for each operation.

**Blocked by:** 01 — Stabilize typed collaboration interfaces and decompose the production feed.

**Status:** ready-for-agent

**Source contracts:** Build Collaboration Product Contract §§4 and 9; Build Collaboration Production Implementation Plan — Action Items and Tasks 1 and 7; Build Collaboration Cutover Runbook — Parity Checks and Verification; Build Collaboration Implementation Gap Analysis — Action Item read access is incorrectly used as mutation authority.

- [ ] The authorization model declares and enforces distinct permissions for every Action Item operation.
- [ ] Creator, assignee, assigning authority, coordinator, and ordinary reader receive only their contractually permitted actions.
- [ ] A participant cannot gain Action Item authority by merely reading the parent post.
- [ ] Upward, lateral, downward, and self-assignment rules are enforced independently of audience visibility.
- [ ] Unauthorized fields and transitions are rejected server-side even if a client submits them directly.
- [ ] Every accepted mutation records actor, exercised role, prior/new state, revision, reason where required, and warnings.
- [ ] An exhaustive operation-by-role test matrix covers Admin through Contractor, removed participants, and cross-tenant attempts.
