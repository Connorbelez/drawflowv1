## 27. Agile Epic Breakdown

This section breaks the PRD into agile epics suitable for roadmap planning, story decomposition, estimation, and phased delivery.

The epics are organized around product capability, not UI pages alone. A single epic may involve backend domain model, RBAC, audit events, UI screens, workflow transitions, notifications, and integration events.

No epic that changes financial, approval, evidence, tenant, or workflow state should be considered complete unless it includes:

- tenant scoping,
- RBAC enforcement,
- audit events,
- validation rules,
- error/exception paths,
- and relevant UI state handling.

---

### 27.1 Epic Release Grouping

| Release Group | Epics | Outcome |
|---|---|---|
| Foundation | `agileEpics/EPIC-001.md` §27 EPIC-001 — Multi-Tenant Foundation, WorkOS Auth, and Organization Scoping to `agileEpics/EPIC-005.md` §27 EPIC-005 — Secure File, Evidence, and Attachment Foundation | Tenant-safe, auditable core platform foundation. |
| Proposal and Planning | `agileEpics/EPIC-006.md` §27 EPIC-006 — Build Site Location and Mapbox Map to `agileEpics/EPIC-010.md` §27 EPIC-010 — Proposal Review, Decisioning, and Build Activation | Builder can create a structured proposal, roadmap, and draw plan. |
| Active Build Execution | `agileEpics/EPIC-011.md` §27 EPIC-011 — Active Build Workspace to `agileEpics/EPIC-016.md` §27 EPIC-016 — Admin Milestone Approval Package and Final Decisioning | Builder can update work; lender staff/admin can review, inspect, and approve milestones. |
| Draw Release and Closure | `agileEpics/EPIC-017.md` §27 EPIC-017 — Draw Eligibility, Release Approval, and Release Recording to `agileEpics/EPIC-019.md` §27 EPIC-019 — Budget Revision and Re-Optimization Workflow | Approved milestones produce draw release workflow and builder receipt confirmation. |
| Collaboration and Integrations | `agileEpics/EPIC-020.md` §27 EPIC-020 — Secure Deal Chat to UNRESOLVED EPIC-023 (definition missing from current docs) | Chat, notifications, API/webhooks, policy configuration. |
| Contractor and Site Super Foundation | UNRESOLVED EPIC-024 (definition missing from current docs) to UNRESOLVED EPIC-026 (definition missing from current docs) | Contractor assignment and site-super daily update workflows. |
| Intelligence Stretch Goals | UNRESOLVED EPIC-027 (definition missing from current docs) to UNRESOLVED EPIC-029 (definition missing from current docs) | Contractor analytics, Smart Selection, advanced estimation, cross-job optimization. |

---
## EPIC-006 — Build Site Location and Mapbox Map

### Objective

Capture the Build site and display it on an integrated Mapbox map with geocoding confidence, satellite/topographical layers, and editable build-area context. Geofencing is intentionally deferred to stretch scope.

### Primary Users

- Builder Lead.
- Lender Admin.
- Builder Staff.
- Site Visit Staff.
- Lender Staff.

### Scope

- Build location capture.
- Geocoding confidence.
- Mapbox integration.
- Satellite and topographical layers.
- Build area circle/boundary.

### Core User Stories

1. As a builder lead, I can enter and confirm the Build site location.
2. As a lender admin, I can review and correct the mapped build area.
3. As a user, I can toggle between satellite and topographical views.
4. As the system, I can store build-area context separately from future geofence verification.

### Key Screens / Components

- `uiManifest/screenManifest.md` §25.1 SCR-003 — Build Site Location and Map Setup.
- `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel.
- `uiManifest/componentManifest.md` §25.2 CMP-012 — MapboxBuildMap.
- `uiManifest/componentManifest.md` §25.2 CMP-013 — MapLayerToggle.
- `uiManifest/componentManifest.md` §25.2 CMP-014 — BuildAreaOverlay.
- `uiManifest/componentManifest.md` §25.2 CMP-016 — GeocodeConfidenceIndicator.

### Out of Scope / Stretch Goal

- Geofence boundary definition.
- Geofence verification for proof uploads or site visits.
- Geofence result model.
- Evidence location markers tied to geofence review.
- Geofence status badges.

These capabilities remain important, but they are deferred until the core Build site location and Mapbox map foundation is stable.

### Acceptance Criteria

- Build can store address, lat/lng, geocoding confidence, and build area.
- Map renders satellite and topographical modes.
- Build area is circled or bounded.
- No geofence boundary, geofence verification, or geofence result model is required for this epic.
- Map is accessible from proposal setup and Build Workspace.
- Build site location and map data model leaves room for later geofence extension without requiring implementation now.

### Dependencies

- `agileEpics/EPIC-001.md` §27 EPIC-001 — Multi-Tenant Foundation, WorkOS Auth, and Organization Scoping.
- `agileEpics/EPIC-002.md` §27 EPIC-002 — Core Domain Model and State Machine Foundation.

### Release Priority

MVP / early planning.
