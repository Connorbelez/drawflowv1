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
## EPIC-016 — Admin Milestone Approval Package and Final Decisioning

### Objective

Allow lender admins to review complete milestone approval packages, including builder evidence, staff recommendations, site visit reports, variance, warnings, and make final approve/reject/request-info decisions.

### Primary Users

- Lender Admin.

### Scope

- Admin Approval Kanban.
- Approval Package Summary.
- Evidence review summary.
- Staff recommendation review.
- Site visit report summary.
- Admin decision controls.
- Override reason modal.
- Milestone final approval/rejection.
- Draw Group readiness recomputation.

### Core User Stories

1. As lender admin, I can see milestones ready for final decision.
2. As lender admin, I can review the full approval package.
3. As lender admin, I can approve milestone completion.
4. As lender admin, I can reject milestone completion.
5. As lender admin, I can request more information or site visit rework.
6. As lender admin, I can override site visit requirement with audited reason.
7. As the system, milestone approval updates Draw Group eligibility.

### Key Screens / Components

- `uiManifest/screenManifest.md` §25.1 SCR-020 — Admin Approval Kanban.
- `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail.
- `uiManifest/componentManifest.md` §25.2 CMP-097 — ApprovalReadinessIndicator.
- `uiManifest/componentManifest.md` §25.2 CMP-098 — ApprovalPackageSummary.
- `uiManifest/componentManifest.md` §25.2 CMP-099 — SiteVisitReportSummary.
- `uiManifest/componentManifest.md` §25.2 CMP-100 — AdminDecisionControls.
- `uiManifest/componentManifest.md` §25.2 CMP-056 — OverrideReasonModal.

### Acceptance Criteria

- Only lender admin can final approve/reject milestone.
- Admin cannot bypass policy gates without explicit override where allowed.
- Overrides require reason.
- Approved milestone updates Draw Group readiness.
- Rejected milestone routes back to builder correction/resubmission path.
- Decision is audited.

### Dependencies

- `agileEpics/EPIC-014.md` §27 EPIC-014 — Lender Evidence Review and Staff Recommendation.
- `agileEpics/EPIC-015.md` §27 EPIC-015 — Site Visit Workflow with Mobile and Offline Support.

### Release Priority

MVP.
