# 20 — Implement authorized Build-local search and deep-link hydration

**What to build:** Let participants find the collaboration records they are allowed to see across a Build and open the exact post, comment, Action Item, asset, or referenced entity in context.

**Blocked by:** 07 — Add immutable post/comment editing and tombstones; 10 — Complete focused nested discussions and comment interactions; 13 — Add Action Item dependencies, child items, references, and activity; 17 — Govern collaboration assets and attachments.

**Status:** ready-for-agent

**Source contracts:** Build Collaboration Product Contract §§7, 10, and 13; Build Collaboration Production Implementation Plan — Index and search requirements and Tasks 8 and 14; Build Collaboration Cutover Runbook — Verification; Build Collaboration Implementation Gap Analysis — Search and navigation are presentation-level only.

- [x] Authorized server-side keyword search covers posts, comments, Action Items, assets, and references within one Build.
- [x] Semantic retrieval is permission-filtered before ranking and cannot infer restricted content or counts.
- [x] Filters support type, author, assignee, entity, status, audience policy, date, resolution, and attachment presence.
- [x] Restricted placeholders, inaccessible entities, and revoked content are absent from results, counts, suggestions, and caches.
- [x] Deep links hydrate the focused record and surrounding context without moving the user's live-feed scroll position.
- [x] Every reference kind opens its existing focused detail sheet or the correct page/tab and record focus.
- [x] Tests cover every role, restricted content, cross-Build attempts, pagination stability, deep links, revoked access, and semantic leakage.

Implementation note: search records are activated behind a Build-local
generation/readiness gate. Origin mutations enqueue coalesced owner or Build
jobs; scheduled internal mutations page record retirement, exact-reader
materialization, and activation. Active clients subscribe to the generation,
clear cached rows on change, and never query stale partitions while maintenance
or backfill is incomplete. Durable retry leases and watchdogs recover failed or
orphaned continuations without allowing search traffic to bypass backoff. A
bounded WorkOS-derived authority projection preserves secondary Admin and
Principal Broker roles. The tenant cutover verifier includes empty Builds, and
activation atomically rejects stale authority or implicit-reader fingerprints,
pending jobs, and incomplete Build coverage using organization-scoped indexes.
Contractor and Homeowner deep links hydrate every typed entity into the reusable
detail sheets before offering canonical page/tab navigation.
