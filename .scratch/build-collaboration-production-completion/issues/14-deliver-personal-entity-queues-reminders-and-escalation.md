# 14 — Deliver personal/entity queues, reminders, and escalation

**What to build:** Give each participant a reliable view of their work and surface overdue or policy-critical Action Items where the responsible people already operate.

**Blocked by:** 12 — Complete assignment requests and governed completion; 13 — Add Action Item dependencies, child items, references, and activity.

**Status:** completed

**Source contracts:** Build Collaboration Product Contract §§9 and 10; Build Collaboration Production Implementation Plan — Action Items and Tasks 7 and 9; Build Collaboration Cutover Runbook — Verification and monitoring; Build Collaboration Implementation Gap Analysis — Action Item product and notification gaps.

- [x] Post, personal, Build, and referenced-entity queues project the same canonical Action Item rather than copying it.
- [x] Only the personal assignment queue can aggregate authorized work across Builds.
- [x] Overdue state is computed from the due date without silently changing status, assignment, or audience.
- [x] Policy-governed due dates require authorized, reasoned overrides.
- [x] Reminders occur before, at, and after deadlines and escalation targets the correct coordinating authority.
- [x] Action Item creation, assignment, transition, completion, and material reference changes bump meaningful activity exactly as specified.
- [x] Tests cover queue authorization, cross-Build personal aggregation, overdue boundaries, override reasons, escalation, and activity ordering.
