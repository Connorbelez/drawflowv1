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
## EPIC-014 — Lender Evidence Review and Staff Recommendation

### Objective

Allow lender staff to review builder completion packages, evaluate proof, cost variance, and submit formal recommendations without final approval authority.

### Primary Users

- Lender Staff.
- Lender Admin.

### Scope

- Evidence Review Kanban board.
- Work order claim.
- Evidence review detail.
- Staff review checklist.
- Recommendation composer.
- Request more information.
- Request site visit.
- Recommend approval/rejection.
- Staff audit events.

### Core User Stories

1. As lender staff, I can claim a milestone evidence review work order.
2. As lender staff, I can review all builder evidence and completion context.
3. As lender staff, I can compare actual cost to approved budget.
4. As lender staff, I can request more information from builder.
5. As lender staff, I can request a site visit.
6. As lender staff, I can recommend approval or rejection.
7. As the system, I prevent staff from final approving a milestone.

### Key Screens / Components

- `uiManifest/screenManifest.md` §25.1 SCR-015 — Lender Evidence Review Kanban.
- `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail.
- `uiManifest/screenManifest.md` §25.1 SCR-017 — More Information Request / Builder Response.
- `uiManifest/componentManifest.md` §25.2 CMP-084 — EvidenceReviewLayout.
- `uiManifest/componentManifest.md` §25.2 CMP-085 — StaffReviewChecklist.
- `uiManifest/componentManifest.md` §25.2 CMP-086 — RecommendationComposer.
- `uiManifest/componentManifest.md` §25.2 CMP-087 — RequestMoreInfoForm.
- `uiManifest/componentManifest.md` §25.2 CMP-088 — RequestSiteVisitButton.

### Acceptance Criteria

- Staff can submit recommendation but not final approval.
- Requesting more information routes task back to builder.
- Requesting site visit creates Site Visit Work Order.
- Recommendation moves package to Ready for Admin if no site visit is required.
- All staff decisions are audited.

### Dependencies

- `agileEpics/EPIC-012.md` §27 EPIC-012 — Builder Milestone Progress and Completion Submission.
- `agileEpics/EPIC-013.md` §27 EPIC-013 — Work Order Engine and Kanban Infrastructure.

### Release Priority

MVP.
