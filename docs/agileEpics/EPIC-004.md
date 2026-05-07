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
## EPIC-004 — Policy Configuration Foundation

### Objective

Allow lender admins to configure lender-specific draw, interest, evidence, site visit, variance, partial draw, and approval policies.

### Primary Users

- Lender Admin.
- Organization Admin.

### Scope

- Draw fee configuration.
- Interest configuration.
- Lender draw policy limits.
- Evidence requirements by milestone/trade type.
- Site visit rules.
- Variance thresholds.
- Override behavior.
- Policy audit events.

### Core User Stories

1. As a lender admin, I can configure draw fee amount and treatment.
2. As a lender admin, I can configure interest calculation assumptions.
3. As a lender admin, I can configure evidence requirements by milestone type.
4. As a lender admin, I can configure when site visits are required.
5. As a lender admin, I can configure budget/time variance thresholds.
6. As a lender admin, I can configure whether partial draws are allowed, even if partial draws are not implemented in MVP.

### Key Screens / Components

- `uiManifest/screenManifest.md` §25.1 SCR-026 — Policy Configuration.
- `uiManifest/componentManifest.md` §25.2 CMP-114 — PolicySettingsShell.
- `uiManifest/componentManifest.md` §25.2 CMP-115 — DrawPolicyForm.
- `uiManifest/componentManifest.md` §25.2 CMP-116 — InterestPolicyForm.
- `uiManifest/componentManifest.md` §25.2 CMP-117 — EvidencePolicyMatrix.
- `uiManifest/componentManifest.md` §25.2 CMP-118 — SiteVisitPolicyForm.
- `uiManifest/componentManifest.md` §25.2 CMP-119 — VarianceThresholdForm.
- `uiManifest/componentManifest.md` §25.2 CMP-120 — DangerousChangeConfirm.

### Acceptance Criteria

- Policy values are tenant-scoped.
- Policy changes are audited.
- Policy is available to workflow validators and optimizer.
- Dangerous changes require confirmation.
- Sensitive policy overrides require reason where configured.

### Dependencies

- `agileEpics/EPIC-001.md` §27 EPIC-001 — Multi-Tenant Foundation, WorkOS Auth, and Organization Scoping.
- `agileEpics/EPIC-002.md` §27 EPIC-002 — Core Domain Model and State Machine Foundation.
- `agileEpics/EPIC-003.md` §27 EPIC-003 — Audit Trail and Event Capture Foundation.

### Release Priority

MVP Foundation.
