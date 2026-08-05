# 04 — Enforce canonical typed-reference ACLs and a role-safe @ index

**What to build:** Make every collaboration reference a canonical, same-Build, permission-compatible link and ensure autocomplete never reveals an entity or field the current participant cannot read.

**Blocked by:** 01 — Stabilize typed collaboration interfaces and decompose the production feed.

**Status:** completed

**Source contracts:** Build Collaboration Product Contract §§4 and 7; Build Collaboration Production Implementation Plan — Audiences and references and Tasks 4 and 8; Build Collaboration Cutover Runbook — Parity Checks; Build Collaboration Implementation Gap Analysis — Typed references are client-authored snapshots.

- [x] Posts, comments, Action Items, drafts, and system events resolve submitted type/ID pairs through one canonical server authorization interface.
- [x] Publication rejects nonexistent, cross-Build, cross-tenant, inaccessible, or mandatory-reader-incompatible references.
- [x] Labels and summaries are derived from canonical entities; client-provided snapshots are never authoritative.
- [x] Autocomplete covers participants, Milestones, Sub-milestones, Draws, Evidence Packages and Assets, Site Visits, Documents, Materials, and Action Items.
- [x] Contractor and Homeowner autocomplete omits unauthorized financial, supplier, evidence, document, and draw data.
- [x] Renames display current labels while immutable revision/audit snapshots preserve former labels.
- [x] Tests cover every reference kind, role, cross-Build forgery, archived entity, mandatory-reader conflict, and disclosure-safe empty result.
