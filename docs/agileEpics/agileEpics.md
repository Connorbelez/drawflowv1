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

### Epic Files

| Epic | File |
|---|---|
| EPIC-001 — Multi-Tenant Foundation, WorkOS Auth, and Organization Scoping | `agileEpics/EPIC-001.md` |
| EPIC-002 — Core Domain Model and State Machine Foundation | `agileEpics/EPIC-002.md` |
| EPIC-003 — Audit Trail and Event Capture Foundation | `agileEpics/EPIC-003.md` |
| EPIC-004 — Policy Configuration Foundation | `agileEpics/EPIC-004.md` |
| EPIC-005 — Secure File, Evidence, and Attachment Foundation | `agileEpics/EPIC-005.md` |
| EPIC-006 — Build Site Location and Mapbox Map | `agileEpics/EPIC-006.md` |
| EPIC-007 — Build Proposal Intake | `agileEpics/EPIC-007.md` |
| EPIC-008 — Milestone Templates, Construction Roadmap Drafting, and Dependency Editing | `agileEpics/EPIC-008.md` |
| EPIC-009 — Draw Plan Optimizer and Plan Comparison | `agileEpics/EPIC-009.md` |
| EPIC-010 — Proposal Review, Decisioning, and Build Activation | `agileEpics/EPIC-010.md` |
| EPIC-011 — Active Build Workspace | `agileEpics/EPIC-011.md` |
| EPIC-012 — Builder Milestone Progress and Completion Submission | `agileEpics/EPIC-012.md` |
| EPIC-013 — Work Order Engine and Kanban Infrastructure | `agileEpics/EPIC-013.md` |
| EPIC-014 — Lender Evidence Review and Staff Recommendation | `agileEpics/EPIC-014.md` |
| EPIC-015 — Site Visit Workflow with Mobile and Offline Support | `agileEpics/EPIC-015.md` |
| EPIC-016 — Admin Milestone Approval Package and Final Decisioning | `agileEpics/EPIC-016.md` |
| EPIC-017 — Draw Eligibility, Release Approval, and Release Recording | `agileEpics/EPIC-017.md` |
| EPIC-018 — Builder Draw Receipt Confirmation and Exception Handling | `agileEpics/EPIC-018.md` |
| EPIC-019 — Budget Revision and Re-Optimization Workflow | `agileEpics/EPIC-019.md` |
| EPIC-020 — Secure Deal Chat | `agileEpics/EPIC-020.md` |
