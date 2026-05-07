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
## EPIC-015 — Site Visit Workflow with Mobile and Offline Support

### Objective

Support lender-controlled site visit work orders, mobile/tablet inspection flows, direct evidence capture, offline drafts, sync, and site visit reports.

### Primary Users

- Site Visit Staff / Inspector.
- Lender Staff.
- Lender Admin.

### Scope

- Site Visit Work Order creation.
- Site Visit Kanban board.
- Claim/assign site visit.
- Mobile Site Visit Detail.
- Map and checklist.
- Camera capture.
- Offline draft save.
- Sync status.
- Site visit report and recommendation.
- Admin acceptance/rework.

### Core User Stories

1. As lender staff, I can request a site visit from evidence review.
2. As site visit staff, I can claim or receive an assigned site visit.
3. As site visit staff, I can inspect target milestones from mobile/tablet.
4. As site visit staff, I can capture photos and notes.
5. As site visit staff, I can save a draft offline and sync later.
6. As site visit staff, I can submit a structured report and recommendation.
7. As lender admin, I can review site visit report before milestone approval.

### Key Screens / Components

- `uiManifest/screenManifest.md` §25.1 SCR-018 — Site Visit Kanban.
- `uiManifest/screenManifest.md` §25.1 SCR-019 — Mobile Site Visit Detail.
- `uiManifest/componentManifest.md` §25.2 CMP-090 — SiteVisitCardMetadata.
- `uiManifest/componentManifest.md` §25.2 CMP-091 — AssignmentPicker.
- `uiManifest/componentManifest.md` §25.2 CMP-092 — ScheduleVisitControl.
- `uiManifest/componentManifest.md` §25.2 CMP-093 — SiteVisitChecklist.
- `uiManifest/componentManifest.md` §25.2 CMP-094 — OfflineSyncBanner.
- `uiManifest/componentManifest.md` §25.2 CMP-095 — SiteVisitReportForm.
- `uiManifest/componentManifest.md` §25.2 CMP-096 — SyncStatusIndicator.
- `uiManifest/componentManifest.md` §25.2 CMP-099 — SiteVisitReportSummary.

### Acceptance Criteria

- Site visits can be created from evidence review or admin review.
- Site visit staff can claim/complete work.
- Mobile flow supports camera capture.
- Offline draft save/sync works for report and evidence.
- Site visit report attaches to Admin Approval Package.
- Site visit transitions are audited.

### Dependencies

- `agileEpics/EPIC-005.md` §27 EPIC-005 — Secure File, Evidence, and Attachment Foundation.
- `agileEpics/EPIC-006.md` §27 EPIC-006 — Build Site Location and Mapbox Map.
- `agileEpics/EPIC-013.md` §27 EPIC-013 — Work Order Engine and Kanban Infrastructure.
- `agileEpics/EPIC-014.md` §27 EPIC-014 — Lender Evidence Review and Staff Recommendation.

### Release Priority

MVP.
