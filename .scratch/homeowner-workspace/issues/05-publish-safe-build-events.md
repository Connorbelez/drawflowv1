# 05 — Publish safe Build events into Homeowner collaboration

**What to build:** Automatically project a narrow allowlist of Homeowner-safe Build activity into the shared collaboration record so routine progress is visible without manual republication. The projection must never serialize lender-internal state, and repeated event processing must not create duplicate posts or notifications.

**Blocked by:** 03 — Enable full Homeowner collaboration authorship and audiences.

**Status:** ready-for-agent

- [ ] Homeowner-visible Milestone starts and completions can generate automatic collaboration events.
- [ ] Homeowner-visible schedule changes and upcoming appointments can generate automatic collaboration events.
- [ ] Explicitly published Documents and Media can generate automatic collaboration events.
- [ ] Homeowner-visible Action Item changes can generate automatic collaboration events.
- [ ] Each automatic event links to the canonical authorized Build entity and uses plain, Homeowner-safe language.
- [ ] Automatic event processing is organization-scoped, idempotent, auditable, and safe to retry.
- [ ] Non-allowlisted events generate no Homeowner post, placeholder, count, notification, search result, or retrieval metadata.
- [ ] Lender comments, policy limits, working-capital analysis, interest calculations, internal evidence review, geofence detail, risk flags, approval deliberation, and internal Draw state never serialize into automatic Homeowner content.
- [ ] Changes to the source object's visibility immediately govern the event, linked detail, notification, search, and export behavior.
- [ ] Allowlisted and prohibited event families are covered by projection-contract and negative serialization tests.

