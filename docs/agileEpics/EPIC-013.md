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
## EPIC-013 — Work Order Engine and Kanban Infrastructure

### Objective

Implement the generic work-order and kanban infrastructure used by evidence review, site visits, admin approval, draw release, receipt confirmation, and site superintendent tasks.

### Primary Users

- Lender Staff.
- Site Visit Staff.
- Lender Admin.
- Site Superintendent later.
- Builder Lead for receipt tasks.

### Scope

- Work Order model.
- Kanban board framework.
- Kanban columns by board type.
- Work order assignment/claiming.
- State transitions.
- SLA/due state.
- Filtering.
- Audit events.

### Core User Stories

1. As lender staff, I can see new review work orders on a kanban board.
2. As staff, I can claim a work order.
3. As admin, I can see work stuck in review queues.
4. As the system, I route work orders based on workflow transitions.
5. As the system, I audit work order claims and status changes.

### Key Screens / Components

- `uiManifest/screenManifest.md` §25.1 SCR-015 — Lender Evidence Review Kanban.
- `uiManifest/screenManifest.md` §25.1 SCR-018 — Site Visit Kanban.
- `uiManifest/screenManifest.md` §25.1 SCR-020 — Admin Approval Kanban.
- `uiManifest/screenManifest.md` §25.1 SCR-022 — Draw Release Kanban.
- `uiManifest/componentManifest.md` §25.2 CMP-078 — KanbanBoard.
- `uiManifest/componentManifest.md` §25.2 CMP-079 — KanbanColumn.
- `uiManifest/componentManifest.md` §25.2 CMP-080 — WorkOrderCard.
- `uiManifest/componentManifest.md` §25.2 CMP-081 — WorkOrderFilterBar.
- `uiManifest/componentManifest.md` §25.2 CMP-082 — ClaimWorkOrderButton.
- `uiManifest/componentManifest.md` §25.2 CMP-083 — SLAIndicator.

### Acceptance Criteria

- Work orders support type, owner, status, priority, entity links, due date, and audit trail.
- Boards render work orders by status.
- Claiming rules are enforced.
- Work order transitions are validated.
- Cards show Build, milestone/draw context, evidence count, variance, owner, and last activity where applicable.

### Dependencies

- `agileEpics/EPIC-002.md` §27 EPIC-002 — Core Domain Model and State Machine Foundation.
- `agileEpics/EPIC-003.md` §27 EPIC-003 — Audit Trail and Event Capture Foundation.
- `agileEpics/EPIC-012.md` §27 EPIC-012 — Builder Milestone Progress and Completion Submission.

### Release Priority

MVP.
