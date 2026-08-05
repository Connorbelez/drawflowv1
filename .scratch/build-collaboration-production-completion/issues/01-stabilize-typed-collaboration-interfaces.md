# 01 — Stabilize typed collaboration interfaces and decompose the production feed

**What to build:** Preserve the approved Familiar Feed behaviour while creating stable, production-owned collaboration modules and typed client/server contracts so subsequent feature slices can land without extending the monolithic feed or relying on prototype code.

**Blocked by:** None — can start immediately.

**Status:** completed

**Source contracts:** Build Collaboration Product Contract; Build Collaboration Production Implementation Plan — Architecture, Module Interfaces, File Plan, and Tasks 1, 3, and 10; Build Collaboration Cutover Runbook — Verification; Build Collaboration Implementation Gap Analysis — Correctly Landed Foundation and Required Delivery Standard.

- [x] Existing production feed, composer, filters, post cards, discussions, Action Item views, references, drafts, and notification controls retain their current user-visible behaviour.
- [x] Production collaboration UI no longer imports implementation from a prototype directory.
- [x] The production feed is decomposed into focused, reusable modules using existing DrawFlow primitives without creating parallel replacement components.
- [x] Public collaboration queries return explicit validated shapes instead of unbounded `any` contracts, and the frontend consumes those generated shapes.
- [x] The missing React list-key warning is eliminated and collaboration tests are warning-clean.
- [x] Focused regression tests prove the refactor does not change authorization, restricted placeholders, composition, or production placement.
