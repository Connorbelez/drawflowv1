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
## EPIC-009 — Draw Plan Optimizer and Plan Comparison

### Objective

Generate and compare reimbursement-based Draw Plans that account for milestone dependencies, draw fees, interest rules, lender draw policy, review/site-visit lag, and borrower working-capital constraints.

### Primary Users

- Builder Lead.
- Lender Admin.

### Scope

- Cheapest Feasible Plan.
- Fastest Plan.
- Capital-Constrained Plan.
- Draw grouping generation.
- Draw fee calculation.
- Interest estimate calculation.
- Peak unreimbursed exposure calculation.
- Feasibility warnings.
- Plan explanation.

### Core User Stories

1. As a builder lead, I can compare Cheapest Feasible, Fastest, and Capital-Constrained plans.
2. As a builder lead, I can see estimated interest, fees, total cost, timeline, and peak capital exposure.
3. As a lender admin, I can review whether a proposed plan is feasible under policy.
4. As the system, I mark infeasible plans where working capital or dependencies make the plan impossible.
5. As the system, I explain why a plan bundles or splits draws.

### Key Screens / Components

- `uiManifest/screenManifest.md` §25.1 SCR-008 — Draw Plan Comparison.
- `uiManifest/screenManifest.md` §25.1 SCR-007 — Draft Build Workspace / Roadmap Wizard Draft Build Workspace.
- `uiManifest/componentManifest.md` §25.2 CMP-040 — OptimizationPlanCard.
- `uiManifest/componentManifest.md` §25.2 CMP-041 — PlanComparisonTable.
- `uiManifest/componentManifest.md` §25.2 CMP-042 — FinancingCostBreakdown.
- `uiManifest/componentManifest.md` §25.2 CMP-043 — CapitalExposureSummary.
- `uiManifest/componentManifest.md` §25.2 CMP-044 — FeasibilityBadge.
- `uiManifest/componentManifest.md` §25.2 CMP-045 — PlanExplanationPanel.
- `uiManifest/componentManifest.md` §25.2 CMP-035 — DrawGroupBoundary.

### Acceptance Criteria

- Optimizer consumes policy, milestone, dependency, cost, duration, and working-capital data.
- System generates at least Cheapest Feasible and Fastest plans.
- Capital-Constrained plan is generated when working-capital input exists.
- Draw groups are visible in roadmap.
- Plan outputs include cost, fee, interest, duration, and capital exposure estimates.
- Infeasible plans are clearly marked.

### Dependencies

- `agileEpics/EPIC-004.md` §27 EPIC-004 — Policy Configuration Foundation.
- `agileEpics/EPIC-008.md` §27 EPIC-008 — Milestone Templates, Construction Roadmap Drafting, and Dependency Editing.

### Release Priority

MVP.
