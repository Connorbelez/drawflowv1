# 21 — Execute scheduled publications and offline/concurrency reconciliation

**What to build:** Let coordinating humans approve scheduled updates and let field participants safely prepare work offline without fabricating shared state or overwriting newer collaboration changes.

**Blocked by:** 03 — Bind HITL approval to a trusted human actor and atomic publication bundle; 04 — Enforce canonical typed-reference ACLs and a role-safe @ index; 07 — Add immutable post/comment editing and tombstones; 17 — Govern collaboration assets and attachments.

**Status:** ready-for-agent

**Source contracts:** Build Collaboration Product Contract §13; Build Collaboration Production Implementation Plan — Assets, drafts, and publication approval and Tasks 5 and 9; Build Collaboration Cutover Runbook — Verification and monitoring; Build Collaboration Implementation Gap Analysis — Scheduling, concurrency, and offline gaps.

- [ ] Authorized coordinating roles can schedule Updates and Announcements only after approving the complete final bundle.
- [ ] Execution revalidates human approval, tenant state, membership, hierarchy, audience, entity ACLs, assets, and expected revisions.
- [ ] A material conflict pauses publication for renewed human approval rather than publishing stale content.
- [ ] Shared mutable records reject stale revisions and the UI presents the latest state alongside the participant's draft.
- [ ] Offline mode stores only private drafts, camera captures, and attachment staging until reconnect.
- [ ] Reconnect preserves real timestamps and revalidates every shared effect before publication.
- [ ] Tests cover scheduler idempotency, removed participants, changed references/audiences, stale writes, reconnect conflicts, and no fabricated notifications or receipts.
