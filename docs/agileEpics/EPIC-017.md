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
## EPIC-017 — Draw Eligibility, Release Approval, and Release Recording

### Objective

Create the draw release workflow that activates when all milestones in a Draw Group are approved, allowing lender admins to review, approve, and record draw release with fee treatment and interest start date.

### Primary Users

- Lender Admin.
- Finance/Ops user where applicable.
- Builder Lead as notified party.

### Scope

- Draw eligibility computation.
- Draw Release Work Order creation.
- Draw Release Kanban.
- Draw Release Approval Detail.
- Fee treatment display/configurable override.
- Interest accrual start recording.
- Release confirmation.
- Release audit events.

### Core User Stories

1. As the system, I mark a Draw Group ready when all included milestones are approved.
2. As lender admin, I can see draws ready for release.
3. As lender admin, I can review included milestones and approval evidence.
4. As lender admin, I can approve draw release.
5. As the system, I record release amount, fee treatment, release date, and interest start.
6. As builder lead, I am notified when the draw is released.

### Key Screens / Components

- `uiManifest/screenManifest.md` §25.1 SCR-022 — Draw Release Kanban.
- `uiManifest/screenManifest.md` §25.1 SCR-023 — Draw Release Approval Detail.
- `uiManifest/componentManifest.md` §25.2 CMP-101 — DrawReleaseCard.
- `uiManifest/componentManifest.md` §25.2 CMP-102 — DrawEligibilityIndicator.
- `uiManifest/componentManifest.md` §25.2 CMP-104 — DrawReleaseSummary.
- `uiManifest/componentManifest.md` §25.2 CMP-105 — IncludedMilestonesTable.
- `uiManifest/componentManifest.md` §25.2 CMP-106 — FeeTreatmentSelector.
- `uiManifest/componentManifest.md` §25.2 CMP-107 — ReleaseConfirmationModal.
- `uiManifest/componentManifest.md` §25.2 CMP-108 — LedgerIntegrationStatus.

### Acceptance Criteria

- Draw release is blocked until all included milestones are approved.
- Release approval is admin-only.
- Release records amount, date, fee treatment, interest start.
- Release emits audit event.
- Builder is notified after release.
- If external payment/ledger integration is not present, UI clearly distinguishes recorded release from external settlement.

### Dependencies

- `agileEpics/EPIC-016.md` §27 EPIC-016 — Admin Milestone Approval Package and Final Decisioning.
- `agileEpics/EPIC-004.md` §27 EPIC-004 — Policy Configuration Foundation.
- `agileEpics/EPIC-003.md` §27 EPIC-003 — Audit Trail and Event Capture Foundation.

### Release Priority

MVP.
