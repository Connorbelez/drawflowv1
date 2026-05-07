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
## EPIC-012 — Builder Milestone Progress and Completion Submission

### Objective

Allow builder-side users to update active milestone progress, submit completion reports, enter actual cost, upload proof, and trigger lender review work orders.

### Primary Users

- Builder Lead.
- Builder Staff where permitted.
- Site Superintendent later.

### Scope

- Milestone progress updates.
- Status changes.
- Actual cost input.
- Completion report form.
- Evidence checklist.
- Mobile proof upload.
- Location metadata capture where available, without geofence verification.
- Milestone Completion Package creation.
- Evidence Review Work Order creation.

### Core User Stories

1. As a builder lead, I can update milestone progress.
2. As a builder staff member, I can upload proof of work from the field.
3. As a builder lead, I can mark a milestone complete.
4. As a builder lead, I can enter actual cost incurred.
5. As the system, I can preserve upload location metadata where available without requiring geofence verification.
6. As the system, I create a lender review work order after submission.

### Key Screens / Components

- `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page.
- `uiManifest/screenManifest.md` §25.1 SCR-014 — Mobile Proof Upload.
- `uiManifest/componentManifest.md` §25.2 CMP-068 — EvidenceRequirementChecklist.
- `uiManifest/componentManifest.md` §25.2 CMP-071 — MobileCaptureShell.
- `uiManifest/componentManifest.md` §25.2 CMP-072 — CameraCapture.
- `uiManifest/componentManifest.md` §25.2 CMP-075 — ActualCostInput.
- `uiManifest/componentManifest.md` §25.2 CMP-076 — CompletionReportForm.

### Acceptance Criteria

- Completion submission validates required fields and evidence.
- Actual cost is captured.
- Evidence is linked to milestone and Build.
- Geofence verification is not required; any captured location metadata is preserved for later review.
- Milestone transitions to Submitted for Review.
- Evidence Review Work Order is created.
- Work order appears on Lender Evidence Review Board.

### Dependencies

- `agileEpics/EPIC-005.md` §27 EPIC-005 — Secure File, Evidence, and Attachment Foundation.
- `agileEpics/EPIC-006.md` §27 EPIC-006 — Build Site Location and Mapbox Map.
- `agileEpics/EPIC-011.md` §27 EPIC-011 — Active Build Workspace.

### Release Priority

MVP.
