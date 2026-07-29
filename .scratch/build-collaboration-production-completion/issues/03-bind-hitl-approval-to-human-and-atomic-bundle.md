# 03 — Bind HITL approval to a trusted human actor and atomic publication bundle

**What to build:** Allow agents to prepare collaboration work while ensuring every shared publication is approved by a verifiably human actor against the exact final bundle and is always authored by that human.

**Blocked by:** 01 — Stabilize typed collaboration interfaces and decompose the production feed.

**Status:** completed

**Source contracts:** Build Collaboration Product Contract §§11 and 13; Build Collaboration Production Implementation Plan — Assets, drafts, and publication approval and Task 5; Build Collaboration Cutover Runbook — Verification; Build Collaboration Implementation Gap Analysis — HITL publication is not a trustworthy security boundary.

- [x] Human, agent, service, system, and deterministic automation actors are distinguished by trusted authorization provenance rather than subject-name conventions.
- [x] An agent can prepare content, audiences, references, attachments, Action Items, notification effects, and other proposed shared mutations without publishing them.
- [x] The HITL checkpoint displays the complete effective bundle, including readers, exclusions, references, assets, Action Items, notifications, and shared mutations.
- [x] Human approval is single-use, bound to a deterministic bundle hash, and invalidated by every material change.
- [x] Publishing records the approving human as author and retains agent involvement only as internal drafting provenance.
- [x] Direct agent/service publication attempts are rejected for posts, comments, Action Items, pins, acknowledgements, lifecycle changes, and other shared mutations.
- [x] Tests use multiple agent/service subject formats and prove no naming convention can bypass approval.
