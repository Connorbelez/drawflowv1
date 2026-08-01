# 21 — Execute scheduled publications and offline/concurrency reconciliation

**What to build:** Let coordinating humans approve scheduled updates and let field participants safely prepare work offline without fabricating shared state or overwriting newer collaboration changes.

**Blocked by:** 03 — Bind HITL approval to a trusted human actor and atomic publication bundle; 04 — Enforce canonical typed-reference ACLs and a role-safe @ index; 07 — Add immutable post/comment editing and tombstones; 17 — Govern collaboration assets and attachments.

**Status:** implemented

**Source contracts:** Build Collaboration Product Contract §13; Build Collaboration Production Implementation Plan — Assets, drafts, and publication approval and Tasks 5 and 9; Build Collaboration Cutover Runbook — Verification and monitoring; Build Collaboration Implementation Gap Analysis — Scheduling, concurrency, and offline gaps.

- [x] Authorized coordinating roles can schedule Updates and Announcements only after approving the complete final bundle.
- [x] Execution revalidates human approval, tenant state, membership, hierarchy, audience, entity ACLs, assets, and expected revisions.
- [x] A material conflict pauses publication for renewed human approval rather than publishing stale content.
- [x] Shared mutable records reject stale revisions and the UI presents the latest state alongside the participant's draft.
- [x] Offline mode stores only private drafts, camera captures, and attachment staging until reconnect.
- [x] Reconnect preserves real timestamps and revalidates every shared effect before publication.
- [x] Tests cover scheduler idempotency, removed participants, changed references/audiences, stale writes, reconnect conflicts, and no fabricated notifications or receipts.

## Implementation record

- Added the isolated `build_collaboration_scheduling` Convex domain with exact-bundle human approval, durable scheduled execution, periodic recovery, idempotent publication, current-access revalidation, audited pause-on-conflict, and an observable retry path that keeps transient failures eligible for recovery.
- Added optimistic revision preconditions for private drafts and bundle-declared shared post/comment/Action Item mutations. The feed preserves the participant's editor state and renders the latest server revision alongside it after a conflict.
- Added a user/tenant/Build-scoped IndexedDB private draft store, preserved camera/file capture timestamps through governed upload, and placed every nested collaboration mutation/action behind one online-state gate. Reconnect only stages and saves a private server draft; publication still requires the normal human action or exact scheduling checkpoint.
- Focused coverage lives in `convex/build_collaboration_scheduling.test.ts`, `src/features/build-collaboration/BuildCollaborationFeed.test.tsx`, `src/features/build-collaboration/build-collaboration-offline-drafts.test.ts`, and `src/features/build-collaboration/build-collaboration-asset-upload.test.ts`.
