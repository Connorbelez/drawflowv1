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
## EPIC-005 — Secure File, Evidence, and Attachment Foundation

### Objective

Implement secure upload, storage, metadata, preview, and authorization for permits, proposal documents, milestone evidence, site visit evidence, contractor attachments, and chat attachments.

### Primary Users

- Builder Lead.
- Builder Staff.
- Site Superintendent.
- Lender Staff.
- Site Visit Staff.
- Lender Admin.

### Scope

- Secure file uploader.
- Document checklist.
- Evidence metadata.
- Attachment preview.
- File authorization.
- Evidence package linking.
- Upload audit events.

### Core User Stories

1. As a builder lead, I can upload permits and documents for a Build Proposal.
2. As a builder staff member, I can upload proof-of-completion evidence.
3. As a site visit staff member, I can upload inspection photos and reports.
4. As a lender staff member, I can review evidence securely.
5. As the system, every uploaded file is linked to the correct tenant, Build, Milestone, Draw, Site Visit, or Contractor.

### Key Screens / Components

- `uiManifest/screenManifest.md` §25.1 SCR-004 — Permit and Document Upload.
- `uiManifest/screenManifest.md` §25.1 SCR-014 — Mobile Proof Upload.
- `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail.
- `uiManifest/screenManifest.md` §25.1 SCR-019 — Mobile Site Visit Detail.
- `uiManifest/componentManifest.md` §25.2 CMP-017 — DocumentChecklist.
- `uiManifest/componentManifest.md` §25.2 CMP-018 — SecureFileUploader.
- `uiManifest/componentManifest.md` §25.2 CMP-021 — AttachmentPreviewDrawer.
- `uiManifest/componentManifest.md` §25.2 CMP-069 — EvidenceGallery.

### Acceptance Criteria

- Files are access-controlled by tenant, role, and deal/build membership.
- Files can be linked to domain entities.
- Upload metadata includes uploader, timestamp, file type, and entity context.
- Evidence packages can include multiple files.
- Deletion/replacement behavior is explicit and audited.

### Dependencies

- `agileEpics/EPIC-001.md` §27 EPIC-001 — Multi-Tenant Foundation, WorkOS Auth, and Organization Scoping.
- `agileEpics/EPIC-002.md` §27 EPIC-002 — Core Domain Model and State Machine Foundation.
- `agileEpics/EPIC-003.md` §27 EPIC-003 — Audit Trail and Event Capture Foundation.

### Release Priority

MVP Foundation.
