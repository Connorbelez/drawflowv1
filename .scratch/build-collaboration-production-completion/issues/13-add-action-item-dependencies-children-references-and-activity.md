# 13 — Add Action Item dependencies, child items, references, and activity

**What to build:** Let Build teams structure related work without importing software-project abstractions, while keeping every relationship readable, cycle-free, and auditable.

**Blocked by:** 04 — Enforce canonical typed-reference ACLs and a role-safe @ index; 05 — Enforce operation-specific Action Item RBAC; 11 — Create Action Items from live posts and open a full detail surface.

**Status:** ready-for-agent

**Source contracts:** Build Collaboration Product Contract §9; Build Collaboration Production Implementation Plan — Action Items and Task 7; Build Collaboration Cutover Runbook — Verification; Build Collaboration Implementation Gap Analysis — Action Item product gaps.

- [ ] Action Items support dependency, related, and duplicate relationships only between readable items on the same Build.
- [ ] Dependency creation rejects self-links and direct or transitive cycles.
- [ ] A permission conflict suspends a relationship for coordinator repair without deleting history.
- [ ] One level of first-class child Action Items is supported with independent assignment/status and inherited readable context.
- [ ] Lightweight checklist rows remain non-assignable and distinct from child Action Items.
- [ ] Multiple canonical Build references and every relationship/activity transition appear in the detail history.
- [ ] Tests include property-based cycle coverage, ACL conflicts, child-depth enforcement, duplicates, concurrent links, and audit history.
