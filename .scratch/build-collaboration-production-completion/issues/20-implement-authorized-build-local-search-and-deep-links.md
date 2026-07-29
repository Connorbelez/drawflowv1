# 20 — Implement authorized Build-local search and deep-link hydration

**What to build:** Let participants find the collaboration records they are allowed to see across a Build and open the exact post, comment, Action Item, asset, or referenced entity in context.

**Blocked by:** 07 — Add immutable post/comment editing and tombstones; 10 — Complete focused nested discussions and comment interactions; 13 — Add Action Item dependencies, child items, references, and activity; 17 — Govern collaboration assets and attachments.

**Status:** ready-for-agent

**Source contracts:** Build Collaboration Product Contract §§7, 10, and 13; Build Collaboration Production Implementation Plan — Index and search requirements and Tasks 8 and 14; Build Collaboration Cutover Runbook — Verification; Build Collaboration Implementation Gap Analysis — Search and navigation are presentation-level only.

- [ ] Authorized server-side keyword search covers posts, comments, Action Items, assets, and references within one Build.
- [ ] Semantic retrieval is permission-filtered before ranking and cannot infer restricted content or counts.
- [ ] Filters support type, author, assignee, entity, status, audience policy, date, resolution, and attachment presence.
- [ ] Restricted placeholders, inaccessible entities, and revoked content are absent from results, counts, suggestions, and caches.
- [ ] Deep links hydrate the focused record and surrounding context without moving the user's live-feed scroll position.
- [ ] Every reference kind opens its existing focused detail sheet or the correct page/tab and record focus.
- [ ] Tests cover every role, restricted content, cross-Build attempts, pagination stability, deep links, revoked access, and semantic leakage.
