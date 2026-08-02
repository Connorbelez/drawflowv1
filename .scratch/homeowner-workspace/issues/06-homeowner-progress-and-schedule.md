# 06 — Project homeowner-safe Progress and Schedule views

**What to build:** Give Homeowners read-only Progress and Schedule views composed from canonical Build state. Each view should make current progress and upcoming activity understandable while routing questions and correction requests into the same entity-linked collaboration record.

**Blocked by:** 03 — Enable full Homeowner collaboration authorship and audiences.

**Status:** ready-for-agent

- [ ] Progress shows only Homeowner-visible Milestones, published progress, safe status language, and expected next activity.
- [ ] Schedule shows only Homeowner-visible construction dates, appointments, and published schedule changes.
- [ ] Internal dependencies, operational estimates, staff notes, risk, evidence review, lender review, and financing state are excluded.
- [ ] Empty, partially published, delayed, completed, restricted, and unavailable states are understandable without leaking hidden counts or metadata.
- [ ] A Homeowner can start or open a collaboration conversation linked to a visible Milestone, progress event, schedule item, or appointment.
- [ ] Discussion actions do not create a second comment store and do not directly mutate the canonical Milestone or schedule.
- [ ] Homeowner requests for corrections or schedule changes remain collaboration posts or Action Items until an authorized role updates the source record.
- [ ] Progress and Schedule remain consistent with the same canonical Build state used by Builder and Backoffice workspaces.
- [ ] Desktop and mobile tests cover authorized projections, contextual discussion, redaction, and read-only behavior.

