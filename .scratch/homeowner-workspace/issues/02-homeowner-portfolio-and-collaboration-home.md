# 02 — Enter the Homeowner portfolio and shared Collaboration Home

**What to build:** Give an authenticated Homeowner a safe portfolio entry and Build-scoped workspace. A person with multiple assigned Builds sees a useful portfolio; a person with one assigned Build enters it directly. The Build Home surface renders the existing shared Build Collaboration interface as the default experience without introducing a Homeowner-specific feed or interaction variant.

**Blocked by:** 01 — Provision Homeowner organization members and Build assignments.

**Status:** ready-for-agent

- [ ] A Homeowner assigned to multiple Builds sees only those Builds in a portfolio landing surface.
- [ ] Each portfolio entry shows only safe status, unread activity, the next appointment, open Homeowner Action Items, and the latest Homeowner-visible progress.
- [ ] A Homeowner assigned to exactly one Build can enter that Build directly without an unnecessary portfolio step.
- [ ] A person with no eligible Build assignment receives an understandable access state without raw authorization or backend diagnostics.
- [ ] Entering a Build opens Home by default and renders the existing shared Build Collaboration component and data graph.
- [ ] The workspace exposes Home, Progress, Schedule, Documents & Media, Costs & Decisions, and People navigation with durable Build context.
- [ ] Loading, empty, restricted, revoked, unavailable, and wrong-organization states fail closed and disclose no unrelated Build metadata.
- [ ] The collaboration component retains its approved interface, ordering, filters, interaction patterns, and presentation; no Homeowner-specific fork or copied implementation is introduced.
- [ ] Existing Builder and Backoffice collaboration consumers retain unchanged behavior and presentation.
- [ ] Portfolio entry, direct entry, organization switching, route authorization, and the default shared Home surface are covered by route and browser tests.

