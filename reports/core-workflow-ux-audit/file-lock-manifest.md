# Core Workflow UX Audit File Locks

Worktree: `/Users/connor/Dev/drawFlow/v1/drawflowv1-core-workflow-remediation-20260717`

A path may have exactly one current owner. Adjacent tests follow the code owner unless listed as coordinator-owned shared coverage. Generated Convex files are never manually owned or edited.

| Path / glob | Current owner | Notes |
|---|---|---|
| `reports/core-workflow-ux-audit/remediation-ledger.md` | coordinator | Operational source of truth |
| `reports/core-workflow-ux-audit/verification-matrix.md` | coordinator | Updated after proof runs |
| `reports/core-workflow-ux-audit/target-manifest.json` | coordinator | Frozen target set and revisions |
| `reports/core-workflow-ux-audit/file-lock-manifest.md` | coordinator | This file |
| `reports/core-workflow-ux-audit/audit-report.md` | coordinator | Append remediation results only |
| `reports/core-workflow-ux-audit/agent-notes/**` | coordinator | Append remediation results only |
| `reports/core-workflow-ux-audit/safety/**` | coordinator | Dirty-root snapshots, overlap results, and checkpoint-matched Convex guideline source record |
| `reports/core-workflow-ux-audit/drafts/backend-state.json` | backend-state | Phase 0 ledger/matrix draft only |
| `reports/core-workflow-ux-audit/drafts/auth-error.json` | auth-error | Phase 0 ledger/matrix draft only |
| `reports/core-workflow-ux-audit/drafts/workspace-ui.json` | workspace-ui | Phase 0 ledger/matrix draft only |
| `reports/core-workflow-ux-audit/drafts/planning.json` | planning | Phase 0 ledger/matrix draft only |
| `reports/core-workflow-ux-audit/drafts/comms-contractor.json` | comms-contractor | Phase 0 ledger/matrix draft only |
| `convex/schema.ts` | coordinator | Shared schema and index changes |
| `convex/_generated/**` | coordinator-read-only | Codegen output only; never hand-edit |
| `src/routeTree.gen.ts` | coordinator-read-only | Generated route output only |
| `src/components/app-shared*` | coordinator | Shared test/helper boundary |
| `src/components/app-shell*` | coordinator | Shared shell and inbox integration boundary |
| `src/features/assistant/**` | coordinator | Preserve closed catalog and HITL patterns |
| `src/features/assistant/assistantRouteRegistry*` | coordinator | Shared route registry |
| `convex/production_proposals.ts` | backend-state | Build/draw/budget/activation contracts; auth-error onboarding slice released after green verification |
| `convex/production_proposals.test.ts` | backend-state | Adjacent invariant coverage |
| `convex/demo_drawflow.ts` | backend-state | Demo/production separation preserved |
| `convex/demo_timeline_plans*` | backend-state | Timeline persistence invariants |
| `convex/demo_site_visit_tokens*` | backend-state | Immutable handoff token invariants |
| `convex/authz*` | auth-error | Server permission boundary |
| `convex/brokerageProvisioning.ts` | auth-error | Tenant provisioning and onboarding |
| `convex/workosManagement*` | auth-error | WorkOS role/membership writes |
| `convex/workosProjection.ts` | auth-error | WorkOS projection reads |
| `convex/workos_projection.test.ts` | auth-error | Projection coverage |
| `convex/http.ts` | auth-error | HTTP auth/error containment |
| `src/features/access-portal/**` | auth-error | Typed access states and recovery |
| `src/lib/auth/**` | auth-error | Client role projection |
| `src/routes/__root.tsx` | auth-error | Shared typed route errors |
| `src/routes/protected-access.tsx` | auth-error | Unauthorized/error persona surface |
| `src/features/backoffice-build-detail/**` | workspace-ui | Shared production build detail surfaces |
| `src/features/timeline-workspace/**` | workspace-ui | Timeline/draw workspace |
| `src/features/build-funding/**` | workspace-ui | Funding and draw state UI |
| `src/routes/backoffice/builds/**` | workspace-ui | Backoffice build route |
| `src/routes/builder/builds/**` | workspace-ui | Builder build route |
| `src/routes/builder-staff/builds/**` | workspace-ui | Builder staff build route |
| `src/features/production-proposals/**` | planning | Proposal authority/planning UI |
| `src/features/material-planning/**` | planning | Material planning UI |
| `src/features/calendar-workspace/**` | planning | Calendar semantics and accessibility |
| `convex/production_calendar.test.ts` | planning | Calendar backend coverage |
| `src/features/contractors/**` | comms-contractor | Contractor lifecycle UI |
| `src/routes/contractor/**` | comms-contractor | Contractor receiver routes |
| `src/routes/backoffice/contractors/**` | comms-contractor | Backoffice contractor routes |
| `src/routes/builder/contractors/**` | comms-contractor | Builder contractor routes |
| `convex/contractorAuth.ts` | comms-contractor | Contractor auth boundary |
| `convex/contractorEvidence*` | comms-contractor | Evidence handoff records |
| `convex/contractorMerge*` | comms-contractor | Identity merge invariants |
| `convex/contractorOnboarding*` | comms-contractor | Contractor onboarding lifecycle |
| `convex/contractorWorkspace*` | comms-contractor | Contractor workspace projections |
| `tests/e2e/core-workflow-remediation/**` | verification | New non-overlapping e2e specs after owner release |
| `reports/core-workflow-ux-audit/evidence/UX-WF-*/**` | verification | Fresh proof only after owner release |

## Exact residual target locks

These exact rows complete exclusive ownership for target-manifest paths not matched by the domain globs above. Exact rows take precedence over broader globs; reassignment requires a coordinator update before mutation.

| Path | Current owner | Notes |
|---|---|---|
| `convex/assistant.test.ts` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `convex/assistant.ts` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `convex/builderOnboarding.test.ts` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `convex/builderRoster.test.ts` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `convex/builderRoster.ts` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `convex/builderStaffIdentity.ts` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `convex/contractors_v1.test.ts` | comms-contractor | Frozen target path; owner may edit only within its assigned phase |
| `convex/demo_settings.test.ts` | backend-state | Frozen target path; owner may edit only within its assigned phase |
| `docs/core-product-workflow-manifest.md` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `src/components/app-devtools.tsx` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `src/components/app-header.test.tsx` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `src/components/app-header.tsx` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `src/components/nav-user.test.tsx` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `src/components/nav-user.tsx` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `src/components/ui/event-manager.tsx` | planning | Frozen target path; owner may edit only within its assigned phase |
| `src/components/ui/tabs.tsx` | planning | Frozen target path; owner may edit only within its assigned phase |
| `src/features/backoffice-dashboard/backoffice-build-links.ts` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `src/features/backoffice-draws/draw-control-room.tsx` | comms-contractor | Frozen target path; owner may edit only within its assigned phase |
| `src/features/backoffice-site-visits/site-visit-control-room.tsx` | comms-contractor | Frozen target path; owner may edit only within its assigned phase |
| `src/features/build-workspace-demo/AdminBuildDashboardRoute.test.ts` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/features/build-workspace-demo/AdminBuildDashboardRoute.tsx` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/features/build-workspace-demo/BuildWorkspaceDemo.test.tsx` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/features/build-workspace-demo/BuildWorkspaceDemo.tsx` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/features/build-workspace-demo/SiteVisitTokenRoute.test.tsx` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/features/build-workspace-demo/SiteVisitTokenRoute.tsx` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/features/build-workspace-demo/build-workspace-contractor-planning.test.ts` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/features/build-workspace-demo/build-workspace-contractor-planning.ts` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/features/build-workspace-demo/site-visit-evidence-staging.test.ts` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/features/build-workspace-demo/site-visit-evidence-staging.ts` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/features/build-workspace-demo/site-visit-token-route-model.test.ts` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/features/build-workspace-demo/site-visit-token-route-model.ts` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/features/build-workspace-demo/types.ts` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/features/builder-dashboard/BuilderTimelineDashboard.test.tsx` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/features/builder-dashboard/BuilderTimelineDashboard.tsx` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/features/builder-onboarding/BuilderFirstRun.tsx` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/features/builder-onboarding/ProvisionBuilderWizard.tsx` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/features/builder-onboarding/onboarding-gate.test.ts` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/features/builder-onboarding/onboarding-gate.ts` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/features/builder-staff/app-permissions.ts` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/-__root.test.tsx` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/-marketing.test.tsx` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/-index.test.tsx` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/-proposals.$planId.test.tsx` | planning | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/-user-management-detail-sheet.tsx` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/-user-management-surface.tsx` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/-user-management-types.ts` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/-user-management.test.tsx` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/builders/-builder-detail-drawer.tsx` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/builders/-builder-roster-surface.tsx` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/builders/-builder-roster-types.ts` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/builders/index.tsx` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/draws/route.tsx` | comms-contractor | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/index.tsx` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/onboard-builder.tsx` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/proposals.$planId.tsx` | planning | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/route.tsx` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/settings/-index.test.tsx` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/settings/index.tsx` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/settings/route.tsx` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/site-visits/route.tsx` | comms-contractor | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/user-management.tsx` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/builder-staff/proposals/$proposalId/index.tsx` | planning | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/builder/demo/dashboard/builds/$buildId.tsx` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/builder/index.tsx` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/builder/proposals/$proposalId/index.tsx` | planning | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/builder/proposals/-proposal.$proposalId.test.ts` | planning | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/builder/proposals/new.tsx` | planning | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/builder/route.tsx` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/index.tsx` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/newsitevisit.$buildId.$siteVisitToken.tsx` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `tests/e2e/admin-build-dashboard.spec.ts` | verification | Frozen target path; owner may edit only within its assigned phase |
| `tests/e2e/builder-new-proposal-demo.spec.ts` | verification | Frozen target path; owner may edit only within its assigned phase |
| `tests/e2e/timeline-demo.spec.ts` | verification | Frozen target path; owner may edit only within its assigned phase |
| `convex/contractorNotifications.test.ts` | comms-contractor | Frozen target path; owner may edit only within its assigned phase |
| `convex/production_proposals.active-build-timeline-audit.spec.ts` | backend-state | Frozen target path; owner may edit only within its assigned phase |
| `convex/production_proposals.live-build-activation.spec.ts` | backend-state | Frozen target path; owner may edit only within its assigned phase |
| `convex/production_proposals.reject-active-build-draw.spec.ts` | backend-state | Frozen target path; owner may edit only within its assigned phase |
| `convex/site_visit_report_provenance.test.ts` | comms-contractor | Frozen target path; owner may edit only within its assigned phase |
| `convex/site_visit_token_recovery_request.test.ts` | comms-contractor | Frozen target path; owner may edit only within its assigned phase |
| `convex/site_visit_token_scope.test.ts` | comms-contractor | Frozen target path; owner may edit only within its assigned phase |
| `docs/specs/wf-com-001-notification-center.md` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `docs/specs/wf-int-001-integration-operations-console.md` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `docs/specs/wf-ops-001-operations-queue.md` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `src/components/ui/event-manager.a11y.test.tsx` | planning | Frozen target path; owner may edit only within its assigned phase |
| `src/features/backoffice-draws/draw-review-reason.spec.tsx` | comms-contractor | Frozen target path; owner may edit only within its assigned phase |
| `src/features/build-workspace-demo/SiteVisitTokenRoute.provenance.test.tsx` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/features/build-workspace-demo/SiteVisitTokenRoute.recovery.test.tsx` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/features/builder-dashboard/budget-governance-row.spec.tsx` | workspace-ui | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/-protected-access.test.tsx` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/backoffice/builders/-builder-roster-surface.test.tsx` | auth-error | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/builder/-index.test.tsx` | coordinator | Frozen target path; owner may edit only within its assigned phase |
| `src/routes/builder/builder-live-build-gating.spec.tsx` | coordinator | Frozen target path; owner may edit only within its assigned phase |

## Phase 1 verification release

On 2026-07-17, backend-state, auth-error, planning, and comms-contractor released their Phase 1 mutation locks after targeted suites passed. The ownership rows remain the source for any later rework, but no implementation agent is active. Independent verification has read-only access to all Phase 1 paths and may not mutate product or test files without an explicit coordinator reassignment.

## Phase 1 idempotency rework override

Independent verification reopened the draw-reservation slice; the rework and independent closure verification passed. The exact route lock is released back to workspace-ui:

| Path | Current owner | Notes |
|---|---|---|
| `src/routes/builder/builds/$buildId/index.tsx` | workspace-ui | Phase 1 idempotency re-verification passed; exact route lock released back to workspace-ui |

## Phase 2 execution override

Phase 2 runs in seven dependency-ordered waves with no more than two disjoint mutating agents. Exact rows below override earlier broad ownership while their wave is active. Every mutating prompt must use the absolute remediation worktree path and reject the checkpoint source root.

### Wave 1 — foundation builder relationship and planning semantics

| Path / glob | Current owner | Notes |
|---|---|---|
| `convex/schema.ts` | coordinator | May receive only the minimal `builderBrokerAssignments` model/index change after public auth reds prove it necessary |
| `convex/builderOnboarding.test.ts` | auth-error | Builder/broker relationship red coverage |
| `convex/brokerageProvisioning.ts` | auth-error | Canonical builder/broker relationship projection |
| `src/features/builder-onboarding/**` | auth-error | Builder relationship and recovery UI/tests |
| `src/routes/builder/index.tsx` | auth-error | Builder activation/create-context gating |
| `src/routes/builder/-index.test.tsx` | auth-error | Builder route red coverage |
| `src/components/nav-user.tsx` | auth-error | Wave 1 only; released after targeted green verification |
| `src/components/nav-user.test.tsx` | auth-error | Wave 1 only; released after targeted green verification |
| `convex/production_proposals.ts` | planning | Wave 1 proposal/material/calendar slice only; do not edit auth onboarding implementation |
| `convex/production_proposals.test.ts` | planning | Shared adjacent coverage; no concurrent backend-state/comms edits |
| `src/features/production-proposals/**` | planning | Proposal authority and immutable submission semantics |
| `src/features/material-planning/**` | planning | Packet-default and tab/timeframe contract |
| `src/features/calendar-workspace/**` | planning | Reminder/schedule semantics and cancel confirmation |
| `convex/production_calendar.test.ts` | planning | Calendar backend coverage |
| `src/routes/builder/proposals/**` | planning | Builder proposal route semantics |
| `src/routes/builder-staff/proposals/**` | planning | Supported builder-staff tabs only |
| `src/routes/backoffice/proposals.$planId.tsx` | planning | Backoffice proposal review semantics |
| `src/routes/backoffice/-proposals.$planId.test.tsx` | planning | Backoffice proposal red coverage |

### Deferred shared handoffs

- Site-visit red tests remain owned by comms-contractor; `convex/demo_site_visit_tokens.ts` remains a backend-state green implementation lock. This enforces the wave 2 red / wave 3 green handoff.
- `src/components/app-header*`, `src/components/app-shell*`, `src/routes/backoffice/index.tsx`, `src/features/backoffice-build-detail/EventRail.tsx`, and `src/routes/backoffice/settings/index.tsx` are reserved for the comms-contractor lane in waves 6–7.
- `convex/production_proposals.ts`, `convex/production_proposals.test.ts`, and `convex/schema.ts` are serial shared seams. Their current wave must finish and release before the next owner mutates them.

