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
## EPIC-010 — Proposal Review, Decisioning, and Build Activation

### Objective

Allow lender admins to review submitted Build Proposals, inspect documents, location, budget, roadmap, draw plans, warnings, and approve/reject/request changes. Approved proposals become active Builds.

### Primary Users

- Lender Admin.
- Builder Lead.

### Scope

- Proposal review queue.
- Proposal detail review.
- Package summary.
- Warning review.
- Draw plan review.
- Admin approve/reject/request changes.
- Admin override with reason.
- Build activation.

### Core User Stories

1. As a lender admin, I can triage submitted proposals.
2. As a lender admin, I can review the full proposal package.
3. As a lender admin, I can approve a proposal into an active Build.
4. As a lender admin, I can reject or request changes with comments.
5. As a builder lead, I can receive change requests and resubmit.

### Key Screens / Components

- `uiManifest/screenManifest.md` §25.1 SCR-010 — Admin Proposal Review Queue.
- `uiManifest/screenManifest.md` §25.1 SCR-011 — Admin Proposal Review Detail.
- `uiManifest/screenManifest.md` §25.1 SCR-009 — Proposal Review and Submit.
- UNRESOLVED CMP-050 — ProposalQueueTable (definition missing from current docs).
- UNRESOLVED CMP-055 — AdminDecisionPanel (definition missing from current docs).
- `uiManifest/componentManifest.md` §25.2 CMP-056 — OverrideReasonModal.
- UNRESOLVED CMP-057 — ReviewCommentBox (definition missing from current docs).

### Acceptance Criteria

- Admin can approve/reject/request changes.
- Approval creates active Build from approved Proposal.
- Decision is audited.
- Override requires reason.
- Builder is notified of decision.
- Active Build preserves approved Budget, Roadmap, and Draw Plan version.

### Dependencies

- `agileEpics/EPIC-007.md` §27 EPIC-007 — Build Proposal Intake.
- `agileEpics/EPIC-008.md` §27 EPIC-008 — Milestone Templates, Construction Roadmap Drafting, and Dependency Editing.
- `agileEpics/EPIC-009.md` §27 EPIC-009 — Draw Plan Optimizer and Plan Comparison.
- `agileEpics/EPIC-003.md` §27 EPIC-003 — Audit Trail and Event Capture Foundation.

### Release Priority

MVP.
