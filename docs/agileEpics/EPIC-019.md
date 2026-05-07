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
## EPIC-019 — Budget Revision and Re-Optimization Workflow

### Objective

Allow builders to request budget revisions when actual/projected costs materially change, and allow admins to review variance, approve/reject revisions, and recompute draw plan impact.

### Primary Users

- Builder Lead.
- Lender Admin.

### Scope

- Budget variance detection.
- Budget Revision Request.
- Budget revision diff.
- Milestone-level cost/duration changes.
- Re-optimization impact panel.
- Admin review/approval.
- Budget versioning.
- Active Build Workspace update.

### Core User Stories

1. As a builder lead, I can request budget revision when costs materially change.
2. As the system, I can recommend/require revision when variance threshold is breached.
3. As lender admin, I can compare approved budget vs proposed revision.
4. As lender admin, I can see draw plan impact.
5. As lender admin, I can approve/reject/request changes.
6. As the system, approved revision creates a new Budget version.

### Key Screens / Components

- `uiManifest/screenManifest.md` §25.1 SCR-025 — Budget Revision Request / Review.
- `uiManifest/componentManifest.md` §25.2 CMP-111 — BudgetRevisionDiff.
- `uiManifest/componentManifest.md` §25.2 CMP-112 — MilestoneCostDiffTable.
- `uiManifest/componentManifest.md` §25.2 CMP-113 — ReoptimizationImpactPanel.
- UNRESOLVED CMP-055 — AdminDecisionPanel (definition missing from current docs).

### Acceptance Criteria

- Budget revisions are versioned.
- Existing approved budget history is preserved.
- Revisions show cost/duration/draw-plan impact.
- Admin approval is required for material changes.
- Approved revision updates active Build and triggers re-optimization where needed.
- Decisions are audited.

### Dependencies

- `agileEpics/EPIC-009.md` §27 EPIC-009 — Draw Plan Optimizer and Plan Comparison.
- `agileEpics/EPIC-011.md` §27 EPIC-011 — Active Build Workspace.
- `agileEpics/EPIC-016.md` §27 EPIC-016 — Admin Milestone Approval Package and Final Decisioning.

### Release Priority

MVP or early Phase 2 depending on first demo scope.
