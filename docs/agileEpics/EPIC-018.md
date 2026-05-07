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
## EPIC-018 — Builder Draw Receipt Confirmation and Exception Handling

### Objective

Allow builders to confirm receipt of released draw funds or report receipt exceptions, creating lender operations follow-up where required.

### Primary Users

- Builder Lead.
- Lender Staff.
- Lender Admin.

### Scope

- Draw Receipt Confirmation Task.
- Builder receipt screen.
- Receipt confirmed state.
- Receipt exception state.
- Exception work order.
- Audit trail.

### Core User Stories

1. As builder lead, I can confirm that released draw funds were received.
2. As builder lead, I can report that funds were not received.
3. As builder lead, I can report amount discrepancy.
4. As lender ops, I can see receipt exceptions on a board.
5. As the system, I treat builder confirmation as operational acknowledgement, not authoritative ledger settlement.

### Key Screens / Components

- `uiManifest/screenManifest.md` §25.1 SCR-024 — Builder Draw Receipt Confirmation.
- `uiManifest/screenManifest.md` §25.1 SCR-022 — Draw Release Kanban.
- `uiManifest/componentManifest.md` §25.2 CMP-109 — ReceiptConfirmationPanel.
- `uiManifest/componentManifest.md` §25.2 CMP-110 — ReceiptExceptionForm.
- `uiManifest/componentManifest.md` §25.2 CMP-103 — ReceiptStatusPill.

### Acceptance Criteria

- Draw transitions to Receipt Confirmed when builder confirms.
- Receipt exceptions create/reroute work items.
- Confirmation/exception is audited.
- Build Workspace reflects draw receipt state.

### Dependencies

- `agileEpics/EPIC-017.md` §27 EPIC-017 — Draw Eligibility, Release Approval, and Release Recording.
- `agileEpics/EPIC-013.md` §27 EPIC-013 — Work Order Engine and Kanban Infrastructure.

### Release Priority

MVP.
