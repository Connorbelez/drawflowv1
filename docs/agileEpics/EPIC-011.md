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
## EPIC-011 — Active Build Workspace

### Objective

Deliver the canonical shared Build Workspace for builder leads and lender admins, including milestone rail, Gantt roadmap, draw group bounding boxes, status, warnings, map/chat drawers, and role-aware actions.

### Primary Users

- Builder Lead.
- Lender Admin.
- Builder Staff.
- Lender Staff.
- Site Superintendent later.

### Scope

- Active Build Workspace shell.
- Milestone card rail.
- Gantt canvas.
- Draw group visualization.
- Role-aware actions.
- Workspace summary bar.
- Milestone detail drawer.
- Map drawer integration.
- Chat drawer slot.
- Activity feed drawer.

### Core User Stories

1. As a builder lead, I can see the active roadmap and upcoming milestones.
2. As a builder lead, I can understand which milestones map to which draw.
3. As a lender admin, I can see build progress and approval blockers.
4. As a user, I can open milestone detail without losing workspace context.
5. As a user, I can open map and chat panels from the workspace.
6. As the system, actions shown are role- and state-aware.

### Key Screens / Components

- `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace.
- `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page.
- `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel.
- `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel.
- `uiManifest/componentManifest.md` §25.2 CMP-029 — BuildWorkspaceShell.
- `uiManifest/componentManifest.md` §25.2 CMP-030 — MilestoneRail.
- `uiManifest/componentManifest.md` §25.2 CMP-031 — MilestoneCard.
- `uiManifest/componentManifest.md` §25.2 CMP-032 — GanttCanvas.
- `uiManifest/componentManifest.md` §25.2 CMP-035 — DrawGroupBoundary.
- `uiManifest/componentManifest.md` §25.2 CMP-058 — BuildHeader.
- `uiManifest/componentManifest.md` §25.2 CMP-059 — WorkspaceSummaryBar.
- `uiManifest/componentManifest.md` §25.2 CMP-060 — RoleAwareActionPanel.

### Acceptance Criteria

- Workspace displays active Build roadmap.
- Milestones and draw groups are visible together.
- Draw group boundaries show ID, amount, and status.
- Role-aware actions are enforced by backend permissions.
- Workspace reflects milestone and draw status changes in near-real time or refresh-safe manner.
- Workspace is desktop optimized.

### Dependencies

- `agileEpics/EPIC-010.md` §27 EPIC-010 — Proposal Review, Decisioning, and Build Activation.
- `agileEpics/EPIC-006.md` §27 EPIC-006 — Build Site Location and Mapbox Map.

### Release Priority

MVP.
