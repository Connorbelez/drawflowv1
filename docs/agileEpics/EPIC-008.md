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
## EPIC-008 — Milestone Templates, Construction Roadmap Drafting, and Dependency Editing

### Objective

Allow builders and lender admins to generate, edit, and validate a milestone-based Construction Roadmap using templates, custom milestones, costs, durations, work quantities, dependencies, and soft sequence ordering.

### Primary Users

- Builder Lead.
- Lender Admin.

### Scope

- Milestone template selection.
- Template-generated milestones.
- Inline milestone editing.
- Custom milestones.
- Trade/skill category fields.
- Work quantity fields/notes.
- Dependency creation/editing.
- Cycle prevention.
- Warnings for suspicious dependencies and outlier estimates.

### Core User Stories

1. As a builder lead, I can select a construction milestone template.
2. As a builder lead, I can edit milestone cost and duration.
3. As a builder lead, I can add/remove milestones.
4. As a builder lead, I can create custom milestones.
5. As a builder lead, I can define hard and soft dependencies.
6. As a lender admin, I can review dependency and estimate warnings.
7. As the system, I prevent invalid dependency cycles.

### Key Screens / Components

- `uiManifest/screenManifest.md` §25.1 SCR-006 — Milestone Template Selection.
- `uiManifest/screenManifest.md` §25.1 SCR-007 — Draft Build Workspace / Roadmap Wizard.
- UNRESOLVED CMP-026 — TemplateCard (definition missing from current docs).
- `uiManifest/componentManifest.md` §25.2 CMP-031 — MilestoneCard.
- `uiManifest/componentManifest.md` §25.2 CMP-032 — GanttCanvas.
- `uiManifest/componentManifest.md` §25.2 CMP-036 — InlineCostDurationEditor.
- `uiManifest/componentManifest.md` §25.2 CMP-037 — DependencyInspector.
- `uiManifest/componentManifest.md` §25.2 CMP-038 — WarningRail.

### Acceptance Criteria

- Template creates default milestone set.
- User can edit/add/remove milestones.
- Milestones support cost, duration, category, and optional work quantity.
- Dependencies can be hard or soft.
- Dependency cycles are blocked.
- Outlier estimates and suspicious dependencies are flagged.
- Roadmap draft is visible in Build Workspace layout.

### Dependencies

- `agileEpics/EPIC-002.md` §27 EPIC-002 — Core Domain Model and State Machine Foundation.
- `agileEpics/EPIC-004.md` §27 EPIC-004 — Policy Configuration Foundation.
- `agileEpics/EPIC-007.md` §27 EPIC-007 — Build Proposal Intake.

### Release Priority

MVP.
