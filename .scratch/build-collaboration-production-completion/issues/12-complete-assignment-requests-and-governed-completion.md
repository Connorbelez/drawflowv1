# 12 — Complete assignment requests and governed completion

**What to build:** Make Action Item ownership and completion reflect the Build hierarchy, including upward assignment consent and authority acceptance for governed construction work.

**Blocked by:** 05 — Enforce operation-specific Action Item RBAC; 11 — Create Action Items from live posts and open a full detail surface.

**Status:** completed

**Source contracts:** Build Collaboration Product Contract §9; Build Collaboration Production Implementation Plan — Action Items and Task 7; Build Collaboration Cutover Runbook — Verification and monitoring; Build Collaboration Implementation Gap Analysis — Action Item product gaps.

- [x] Participants can assign themselves, peers, and lower tiers according to the approved hierarchy.
- [x] Upward assignment produces `Assignment requested` without changing workflow status until the higher-tier participant accepts.
- [x] Coordinators can perform authorized lateral/downward reassignment with complete audit history.
- [x] Ordinary work can be completed by the assignee and reopened by the creator or coordinator with a reason.
- [x] Governed approval, evidence, Site Visit remediation, and Draw-blocking work moves to In review and requires the responsible authority to accept Done.
- [x] Blocked and Cancelled transitions require reasons and restore the correct preceding state when reopened.
- [x] Tests cover every assignment direction, acceptance race, removed assignee, completion authority, stale revision, and notification event.
