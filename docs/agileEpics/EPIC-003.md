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
## EPIC-003 — Audit Trail and Event Capture Foundation

### Objective

Create an append-only audit/event layer for material actions, approval decisions, overrides, evidence submissions, work-order transitions, draw releases, integration events, and later geofence events if stretch geofencing is implemented.

### Primary Users

- Lender Admin.
- Organization Admin.
- Compliance/audit users.
- System.

### Scope

- Audit event schema.
- Actor/role/timestamp capture.
- Previous/new state capture.
- Reason/comment support.
- Entity links.
- Audit History screen.
- Event emission foundation for webhooks.

### Core User Stories

1. As a lender admin, I can reconstruct who approved a milestone and why.
2. As a lender admin, I can see when evidence was uploaded and whether any implemented verification controls passed.
3. As a lender admin, I can see all override reasons.
4. As the system, every sensitive state change records an audit event.
5. As a technical admin, lifecycle events can later be emitted externally through webhooks.

### Key Screens / Components

- `uiManifest/screenManifest.md` §25.1 SCR-027 — Audit History.
- `uiManifest/componentManifest.md` §25.2 CMP-121 — AuditTimeline.
- `uiManifest/componentManifest.md` §25.2 CMP-122 — AuditEventRow.
- `uiManifest/componentManifest.md` §25.2 CMP-123 — AuditFilterBar.
- `uiManifest/componentManifest.md` §25.2 CMP-124 — EntityLinkChip.
- `uiManifest/componentManifest.md` §25.2 CMP-125 — BeforeAfterDiffViewer.

### Acceptance Criteria

- Audit events include org, actor, role, timestamp, entity type, entity ID, action, previous state, new state, and reason where applicable.
- Audit history is filterable by Build, entity, actor, event type, and date.
- Override events require reason capture.
- Audit events cannot be modified through normal app workflows.
- Audit events are generated for core lifecycle transitions.

### Dependencies

- `agileEpics/EPIC-001.md` §27 EPIC-001 — Multi-Tenant Foundation, WorkOS Auth, and Organization Scoping.
- `agileEpics/EPIC-002.md` §27 EPIC-002 — Core Domain Model and State Machine Foundation.

### Release Priority

MVP Foundation.
