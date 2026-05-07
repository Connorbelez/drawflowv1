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
## EPIC-002 — Core Domain Model and State Machine Foundation

### Objective

Implement the canonical domain model and governed lifecycle states for Builds, Proposals, Budgets, Milestones, Draw Groups, Draws, Work Orders, Evidence Packages, Site Visits, and Audit Events.

### Primary Users

- System.
- Product/engineering.
- Lender Admin.
- Builder Lead.

### Scope

- Core schema.
- Entity relationships.
- Status models.
- Domain invariants.
- State transition rules.
- Audit event model.
- Work order model foundation.

### Core User Stories

1. As the system, I can represent a Build as the top-level construction project container.
2. As the system, I can represent a Build Proposal separately from an active Build.
3. As the system, I can version Budgets instead of overwriting them.
4. As the system, I can represent Milestones with dependencies, cost, duration, work quantity, evidence state, and draw membership.
5. As the system, I can represent Draw Groups as planned milestone groupings.
6. As the system, I can represent Draws as reimbursement events after approval.
7. As the system, I can represent Evidence Review Work Orders, Site Visit Work Orders, Admin Approval Packages, Draw Release Work Orders, and Receipt Confirmation Tasks.
8. As the system, I can enforce valid status transitions.

### Key Screens / Components

- Internal domain layer.
- `uiManifest/componentManifest.md` §25.2 CMP-065 — StatusTimeline.
- `uiManifest/componentManifest.md` §25.2 CMP-121 — AuditTimeline.
- `uiManifest/componentManifest.md` §25.2 CMP-122 — AuditEventRow.

### Acceptance Criteria

- Domain entities support tenant scope.
- Status transitions are explicit and validated.
- Invalid transitions are rejected.
- Entity relationships are queryable from Build context.
- Audit events can attach to every material transition.
- Core model supports future contractor/work-quantity extensions.

### Dependencies

- `agileEpics/EPIC-001.md` §27 EPIC-001 — Multi-Tenant Foundation, WorkOS Auth, and Organization Scoping.

### Release Priority

MVP Foundation.
