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

- Added the isolated `build_collaboration_scheduling` Convex domain with exact-bundle human approval, durable scheduled execution, periodic recovery, idempotent publication, current-access and Build-lifecycle revalidation, audited pause-on-conflict, and an observable retry path for explicitly typed operational conditions and untyped action/runtime failures. Deterministic validation is material-tagged at its source or revalidation boundary; closed, purged, tenancy-invalid, and other material conflicts fail closed and require renewed human approval.
- Added optimistic revision preconditions for private drafts and explicit `assert_revision` guards for bundle-declared post/comment/Action Item dependencies. The guard is re-read and recorded in the same Convex publication transaction, so concurrent edits either serialize before publication and pause it or serialize afterward without fabricating an unexecuted target mutation.
- Added a user/tenant/Build-scoped IndexedDB private draft store keyed from the trusted hydrated WorkOS session, preserved camera/file capture timestamps through governed upload, and placed every nested collaboration mutation/action behind one online-state gate driven by both browser reachability and the live Convex WebSocket state. Cold sessions can load and save private device drafts without a Convex query; reconnect requires the server draft identity to match the hydrated session before every server-bound save, upload/publication, scheduling, and local-draft deletion path. Publication still requires the normal human action or exact scheduling checkpoint.
- Replaced scheduler message inference with a typed collaboration validation boundary at the publication source. Removed custom readers, revoked references, unavailable or orphaned governed assets, and other deterministic revalidation failures pause the approval and reactivate the draft; untyped operational failures remain retryable.
- Focused coverage lives in `convex/build_collaboration_scheduling.test.ts`, `src/features/build-collaboration/BuildCollaborationFeed.test.tsx`, `src/features/build-collaboration/build-collaboration-offline-drafts.test.ts`, and `src/features/build-collaboration/build-collaboration-asset-upload.test.ts`.
