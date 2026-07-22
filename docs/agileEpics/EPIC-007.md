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
## EPIC-007 — Build Proposal Intake

### Objective

Allow builder/developer borrowers to create a structured Build Proposal with build details, location, permits, working-capital input, milestone template selection, and initial budget context.

### Primary Users

- Builder Lead.
- Builder Staff where configured.
- Lender Admin assisting manually.

### Scope

- Proposal start.
- Build identity form.
- Build site location step.
- Permit/document checklist.
- Available Working Capital input.
- Draft save.
- Validation summary.
- Submit readiness.

### Core User Stories

1. As a builder lead, I can start a new Build Proposal.
2. As a builder lead, I can enter Build details and site location.
3. As a builder lead, I can upload required permits and documents.
4. As a builder lead, I can enter Available Working Capital.
5. As a builder lead, I can save draft and return later.
6. As a builder lead, I can see missing required information before submission.

### Key Screens / Components

- `uiManifest/screenManifest.md` §25.1 SCR-002 — Build Proposal Start.
- `uiManifest/screenManifest.md` §25.1 SCR-003 — Build Site Location and Map Setup.
- `uiManifest/screenManifest.md` §25.1 SCR-004 — Permit and Document Upload.
- `uiManifest/screenManifest.md` §25.1 SCR-005 — Borrower Starting Cash Input.
- `uiManifest/componentManifest.md` §25.2 CMP-006 — ProposalStepper.
- `uiManifest/componentManifest.md` §25.2 CMP-007 — BuildIdentityForm.
- `uiManifest/componentManifest.md` §25.2 CMP-022 — BorrowerStartingCashInput.
- UNRESOLVED CMP-047 — ReadinessChecklist (definition missing from current docs).

### Acceptance Criteria

- Builder can create and save a draft proposal.
- Required proposal fields are validated.
- Required documents are tracked.
- Working-capital input is captured and stored.
- Proposal cannot be submitted while hard blockers remain unresolved.
- All proposal actions are tenant-scoped and audited where material.

### Dependencies

- `agileEpics/EPIC-001.md` §27 EPIC-001 — Multi-Tenant Foundation, WorkOS Auth, and Organization Scoping to `agileEpics/EPIC-006.md` §27 EPIC-006 — Build Site Location and Mapbox Map.

### Release Priority

MVP.
