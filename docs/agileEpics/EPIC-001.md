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
## EPIC-001 — Multi-Tenant Foundation, WorkOS Auth, and Organization Scoping

### Objective

Establish the tenant-safe identity, organization, and access-control foundation required for DrawFlow to operate as both a FairLend module and future standalone licensed software.

### Primary Users

- All authenticated users.
- Organization Admin.
- Lender Admin.
- Technical Admin.

### Scope

- WorkOS organization integration.
- User membership model.
- Organization-scoped tenant boundaries.
- Role assignment.
- Permission model foundation.
- Authenticated App Shell.
- Organization switcher.
- Role-aware navigation.

### Core User Stories

1. As a user, I can sign in and access DrawFlow only through an organization where I am a member.
2. As a user who belongs to multiple organizations, I can switch organizations without data leakage.
3. As an organization admin, I can assign roles to users.
4. As a lender admin, I can see only Builds, Proposals, Loans, Milestones, Draws, and Work Orders scoped to my organization.
5. As a builder-side user, I can access only the Builds/deals where I am a participant.
6. As the system, every domain query and mutation enforces tenant scope.

### Key Screens / Components

- `uiManifest/screenManifest.md` §25.1 SCR-001 — Authenticated App Shell.
- `uiManifest/componentManifest.md` §25.2 CMP-001 — AppShell.
- `uiManifest/componentManifest.md` §25.2 CMP-002 — OrgSwitcher.
- `uiManifest/componentManifest.md` §25.2 CMP-003 — RoleAwareNav.
- `uiManifest/componentManifest.md` §25.2 CMP-004 — UserMenu.

### Acceptance Criteria

- Every tenant-owned entity includes organization scope.
- Cross-tenant access is blocked at the backend authorization layer.
- Navigation is role-aware.
- Users with multiple org memberships can switch org context.
- Unauthorized routes/actions return safe errors.
- Audit records include tenant/org context.

### Dependencies

None. This is foundational.

### Release Priority

MVP Foundation.
