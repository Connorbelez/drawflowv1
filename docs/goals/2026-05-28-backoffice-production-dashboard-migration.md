# Goal Contract: Backoffice Production Dashboard Migration

Status: Verified
Created: 2026-05-28
Source request: Browser annotations on `/backoffice` requiring Active Builds, Builds - Proposals, Submitted Proposals, and Milestone Kanban to use production data, plus interview decisions about approved-not-closed proposal visibility and closing workflow.
Target workspace: `/Users/connor/Dev/drawFlow/v1/drawflowv1`

## Source Context

- User intent: Migrate the annotated `/backoffice` dashboard sections from demo/timeline data to production Build Proposal and active Build data, and add an approved-proposal closing workflow without letting approved-but-not-closed proposals leak into active-build surfaces.
- Source artifacts inspected: browser comments and screenshots for `/backoffice`; `AGENTS.md`; `convex/_generated/ai/guidelines.md`; `docs/draw_flow_prd.md`; `docs/draw_flow_production_prd.md`; `docs/production-foundation-proposal-flow-prd.md`; `docs/production-foundation-proposal-flow-implementation.md`; `docs/vocabulary.md`; `docs/goals/2026-05-27-production-foundation-proposal-flow.md`; `src/routes/backoffice/index.tsx`; `src/routes/backoffice/-index.test.ts`; `src/routes/backoffice/proposals/index.tsx`; `src/routes/backoffice/proposals.$planId.tsx`; `src/routes/backoffice/builds/$buildId/index.tsx`; `src/features/backoffice-dashboard/*`; `src/features/production-proposals/ProductionProposalSurfaces.tsx`; `convex/schema.ts`; `convex/production_proposals.ts`; `convex/production_proposals.test.ts`; `src/components/ui/context-menu.tsx`; `src/components/ui/dialog.tsx`; `src/components/ui/sheet.tsx`; `package.json`.
- Codebase findings: `/backoffice` currently calls `api.demo_timeline_plans.demo_getBackofficeDashboard`, `api.demo_timeline_plans.demo_getSubmittedProposalsForBackoffice`, and `api.demo_timeline_plans.demo_syncApprovedTimelinesNow`, normalizes into `BackofficeDashboardData`, and falls back to explicit mock rows when demo data is missing.
- Codebase findings: `mergeTimelineRowsIntoBackofficeDashboard` currently treats `status === "approved"` timeline rows as active builds and adds their draw requests to the dashboard, which conflicts with production vocabulary where active builds are created only by `recordOfflineClosing`.
- Codebase findings: Production data already exists in `buildProposals`, `proposalKanbanCards`, `activeBuilds`, `buildMilestones`, `plannedDrawScheduleRows`, `buildCapitalPlans`, `loanFacilities`, `proposalEvents`, `auditEvents`, and related tables in `convex/schema.ts`.
- Codebase findings: `convex/production_proposals.ts` already exposes `listProposalKanban`, `getProposalDetailByString`, `getActiveBuildDetailByString`, and `recordOfflineClosing`; `recordOfflineClosing` requires `proposalId`, `workosOrganizationId`, `buildStartDate`, `reason`, and `loanFacility`, creates `activeBuilds` and copied build rows, then moves the proposal to `closed`.
- Codebase findings: Production proposal detail currently derives closing loan principal from `productionDetail.proposal.lenderDrawPolicyLimitCents` and uses `interestAnnualBps: 925`.
- Codebase findings: `/backoffice/proposals` already uses production `listProposalKanban`; `/backoffice/proposals/$planId` and `/backoffice/builds/$buildId` are production-first with demo fallback. The gap is the `/backoffice` home dashboard.
- Codebase findings: Section ids are currently mismatched: `SubmittedProposalsCard` uses `id="milestones-kanban"`, `MilestoneKanban` uses `id="proposals-kanban"`, and `Builds - Proposals` has no stable `proposals-kanban` id.
- Codebase findings: UI primitives for this work already exist: `Card`, `Frame`, `ContextMenu`, `Dialog`, and `Sheet`/sidebar-style slide-over primitives.

## Shared Understanding

### Desired End State

The `/backoffice` dashboard home is production-backed. Active Builds shows only production active Build rows created by closing. Milestone Kanban shows only milestones from those production active Builds. Builds - Proposals shows production Build Proposals in the canonical `draft`, `submitted`, `approved`, and `closed` proposal kanban columns. Submitted Proposals shows production submitted proposals plus a distinct approved-pending-closing group. Approved-but-not-closed proposals appear only in Builds - Proposals and Submitted Proposals, never in Active Builds, Milestone Kanban, dashboard draw-request rows, schedule events, or quick actions as if they were active builds. Approved proposal cards/rows expose a contextual sidebar and a right-click menu; both paths use the same confirmation modal to record offline closing, deriving loan principal from `lenderDrawPolicyLimitCents` and using `interestAnnualBps: 925`.

### In Scope

- Replace `/backoffice` route-level demo queries, demo mock fallback, demo source label, and Sync timelines action with production query/mutation wiring.
- Add or extend a production Convex dashboard view-model query, preferably in `convex/production_proposals.ts` unless a cleaner production module already exists, using fluent-convex/authz patterns and active WorkOS organization scope.
- Build the production dashboard view model from production tables only: `proposalKanbanCards`/`buildProposals` for proposal queues, `activeBuilds` for active builds, `buildMilestones` for milestone kanban, `plannedDrawScheduleRows` for draw request summaries, and production audit/event rows where useful for schedule or quick actions.
- Preserve the existing dashboard layout and component structure where possible while replacing demo-shaped adapters with production-shaped data mapping.
- Keep approved-but-not-closed proposals visible only in Builds - Proposals and Submitted Proposals.
- Add a separate “Approved, pending closing” group below submitted-review rows inside Submitted Proposals.
- Add a contextual `Sheet`/sidebar opened from approved proposal rows/cards in Submitted Proposals and Builds - Proposals. The sidebar may show production proposal summary, builder, location, budget, lender draw policy limit, submitted/approved dates, permit/waiver status when available, and a Record closing action.
- Add a right-click `ContextMenu` on approved proposal rows/cards with a Record closing item.
- Use one shared confirmation `Dialog` for the sidebar action and the right-click action. The dialog must collect required `buildStartDate` and required audit `reason`.
- Call `recordOfflineClosing` with `proposalId`, `workosOrganizationId`, `buildStartDate`, `reason`, and `loanFacility: { principalCents: proposal.lenderDrawPolicyLimitCents, interestAnnualBps: 925 }`.
- On successful closing, close the modal/sidebar as appropriate, show a success toast, let Convex refresh the dashboard, move the proposal to `closed`, and make the created active Build appear in Active Builds and Milestone Kanban.
- Fix section ids so `#active-builds` is Active Builds, `#submitted-proposals` is Submitted Proposals, `#milestones-kanban` is Milestone Kanban, and `#proposals-kanban` is Builds - Proposals. Update metric drilldown hrefs/tests accordingly.
- Keep production route guards and Convex resource checks fail-closed for wrong roles, wrong organization, and missing brokerage.
- Update tests and implementation notes/docs to describe the production dashboard source and closing workflow.

### Out of Scope

- Do not migrate or modify public demo routes.
- Do not delete `demo_*` tables or remove demo fallback behavior from detail routes that intentionally support demo URLs.
- Do not create an active Build when a proposal is merely approved.
- Do not show approved-but-not-closed proposals in Active Builds, Milestone Kanban, dashboard schedule events, dashboard draw requests, or quick actions.
- Do not add new proposal lifecycle states beyond `draft`, `submitted`, `approved`, and `closed`.
- Do not implement a full loan-term editor in the dashboard closing modal.
- Do not implement production draw release, payment ledger, borrower receipt confirmation, or full active Build Workspace productionization beyond the dashboard projection needed here.
- Do not create compatibility adapters that translate production data into demo table assumptions.

### Constraints

- DrawFlow v1 is reimbursement-only; no UI or data copy may imply proactive advance funding before completed work.
- Interest begins only after funds are released; the dashboard closing flow must keep `interestStartsOn: "funds_released"` through the existing closing mutation.
- Approval does not create an active Build. Only `recordOfflineClosing` creates the production active Build.
- Every returned row must be scoped to the active WorkOS organization and brokerage.
- Production Convex application functions must use fluent-convex chains and existing authz patterns. Do not import raw `query`, `mutation`, `action`, `internalQuery`, `internalMutation`, or `internalAction` from `convex/_generated/server` in application function files.
- Before editing Convex code, read `convex/_generated/ai/guidelines.md`.
- Use Bun commands for codegen, tests, type checks, builds, and scripts.
- UI wrapping surfaces must use `Frame`/`FramePanel`; repeated cards and clickable card-like surfaces must use `Card` primitives. Use existing `ContextMenu`, `Dialog`, `Sheet`, `Button`, `Input`, `Textarea`, `Badge`, and `Table` primitives.
- Preserve DrawFlow domain vocabulary: Build, Build Proposal, active Build, Milestone, Draw, Borrower Working Capital Limit, Lender Draw Policy Limit, Loan Closing, and Proposal Kanban.

### Decisions

| Decision | Answer | Source |
| --- | --- | --- |
| Active Builds data source | Use only production `activeBuilds` created by closing. | User decision |
| Milestone Kanban data source | Use only production active Build milestones, not approved proposal milestones. | User decision, `docs/vocabulary.md` |
| Approved-but-not-closed visibility | Only Builds - Proposals and Submitted Proposals may show approved-not-closed proposals. | User decision |
| Closing modal fields | Collect only `buildStartDate` and `reason`; derive loan principal from `lenderDrawPolicyLimitCents` and use `interestAnnualBps: 925`. | User decision, existing proposal detail route |
| Sidebar type | Use contextual slide-over/sidebar tied to approved proposal rows/cards, not a persistent global dashboard sidebar. | User decision |
| Submitted Proposals structure | Add a distinct approved-pending-closing group below submitted proposals. | User decision |
| Route-level demo removal | Remove `/backoffice` demo dashboard fallback, source label, and Sync timelines control. | User decision |
| Closing confirmation path | Sidebar action and right-click action both use the same confirmation dialog. | User decision |
| Proposal kanban columns | Keep exactly `draft`, `submitted`, `approved`, `closed`. | PRD, vocabulary |
| Right-click menu | Add Record closing context menu action to approved proposal rows/cards. | User request |

### Assumptions

- The executing agent may add a dedicated production dashboard query or extend `production_proposals.ts`; whichever path is chosen must keep production data direct and avoid demo-shaped compatibility layers.
- The dashboard may keep empty production schedule/quick action sections if no production facts exist yet, but those sections must not be populated from demo data.
- The confirmation dialog may offer a sensible default date such as today or the existing approved proposal’s planned start context if present, but the submitted value must be visible and editable before closing.

## Completion Contract

```text
/goal Migrate the `/backoffice` dashboard home so Active Builds, Builds - Proposals, Submitted Proposals, and Milestone Kanban are backed only by production Convex data; Active Builds and Milestone Kanban include only production active Builds created by `recordOfflineClosing`; Builds - Proposals renders production Build Proposal kanban columns `draft`, `submitted`, `approved`, and `closed`; Submitted Proposals renders submitted proposals plus a separate approved-pending-closing group; approved-but-not-closed proposals appear only in Builds - Proposals and Submitted Proposals; approved proposal rows/cards expose a contextual sidebar and a right-click Record closing menu item; both actions open the same confirmation modal that collects required `buildStartDate` and audit `reason`, then calls `recordOfflineClosing` with principal derived from `lenderDrawPolicyLimitCents` and `interestAnnualBps: 925`; successful closing moves the proposal to `closed` and makes the created active Build appear in Active Builds and Milestone Kanban, verified by Convex tests for production dashboard scoping/no-demo rows/approved-not-closed exclusion from active surfaces/closing side effects, frontend tests for the dashboard mappings, section ids, approved-pending-closing group, contextual sidebar, right-click confirmation modal, and closing mutation payload, browser verification of `/backoffice`, `bun x convex codegen`, `bun x tsc -p convex/tsconfig.json --noEmit`, `bun run test`, and `bun run build` while preserving WorkOS source-of-truth semantics, fail-closed RBAC and brokerage scoping, reimbursement-only v1 rules, four proposal states only, no active Build before closing, unchanged demo routes and `demo_*` tables, fluent-convex application functions, DrawFlow vocabulary, and existing UI primitives. Use `convex/_generated/ai/guidelines.md`, `docs/production-foundation-proposal-flow-prd.md`, `docs/production-foundation-proposal-flow-implementation.md`, `docs/draw_flow_prd.md`, `docs/draw_flow_production_prd.md`, `docs/vocabulary.md`, existing production proposal functions, existing RBAC modules, existing backoffice dashboard components, `ContextMenu`, `Dialog`, `Sheet`, `Card`, `Frame`, Bun, Convex, WorkOS AuthKit, TanStack Router, and TanStack Query. Between iterations, first remove demo data dependencies from `/backoffice`, then add the production dashboard query with tenant/RBAC correctness, then wire the four annotated surfaces, then implement approved proposal sidebar/context-menu/confirmation closing workflow, then fix ids and drilldowns, then add tests, browser verification, and docs. If blocked or no valid paths remain, report the exact source file or product rule at risk, the failing command or route, whether the block is due to WorkOS organization context, Convex schema/API generation, fluent-convex limitations, missing production fields, route-generation behavior, UI primitive constraints, or product-policy conflict, and the smallest credential, schema decision, field mapping decision, route decision, fixture correction, or dependency/API decision that would unlock progress.
```

## Verification Evidence

Implementation verification completed on 2026-05-28:

- `bun x convex codegen`
- `bun x tsc -p convex/tsconfig.json --noEmit`
- `bun run test`
- `bun run build`
- Browser verification completed in the Codex in-app browser against `http://localhost:3000/backoffice` with an authenticated backoffice session. The dashboard showed `Production Convex tables`, no `Sync timelines` control, and no `demo-timeline`, `demo_`, `mock_`, `Mock address`, `Mock builder`, or `Convex demo tables` text within `#active-builds`, `#submitted-proposals`, `#milestones-kanban`, or `#proposals-kanban`.
- Browser verification seeded production proposal scenarios for `org_01KSNW6JHW9P9YS41DZX1YHHGS` with `production_proposals:dev_seedProductionProposalScenarios`, then verified the four annotated surfaces from production rows: Active Builds from closed active Builds only, Milestone Kanban from production `buildMilestones`, Builds - Proposals with `Draft`, `Submitted`, `Approved`, and `Closed` lanes, and Submitted Proposals with `Submitted for lender review` plus `Approved, pending closing`.
- Browser verification right-clicked the approved `Seed Scenario - Approved With Permit` proposal row, confirmed the context menu contained `Open sidebar` and `Record closing`, opened the shared `Record loan closing` modal, observed the `Confirm closing` button disabled until `Build start date` and `Audit reason` were filled, confirmed closing with `2026-06-01`, and observed the proposal move from `Approved` to `Closed`.
- Browser verification after closing showed `#active-builds` containing the new `Approved With Permit Site, Toronto, ON` active Build, `#milestones-kanban` containing that active Build's `Foundation` and `Shell and Dry-In` milestones, `#submitted-proposals` changing to `1 submitted · 1 closing`, and `#proposals-kanban` changing to `Approved 1` and `Closed 2`.
- Browser verification opened the sidebar for the remaining approved `Seed Scenario - Approved With Waiver` proposal, observed `Approved Build Proposal pending loan closing`, `Lender Draw Policy Limit`, and `Record closing`, then triggered the sidebar action and observed the same `Record loan closing` modal with principal `$550,000`, `Interest starts on funds released`, `Build start date`, and `Audit reason`.

- Convex test proving the production dashboard query returns no `demo_*`, `mock_`, `Mock`, `demo-timeline`, or demo URL values in the four annotated surfaces.
- Convex test proving Active Builds uses `activeBuilds` only and excludes approved-but-not-closed `buildProposals`.
- Convex test proving Milestone Kanban uses `buildMilestones` for production active Builds only and excludes approved-but-not-closed proposal milestones.
- Convex test proving Builds - Proposals returns production proposal kanban columns `draft`, `submitted`, `approved`, and `closed`.
- Convex test proving Submitted Proposals includes submitted proposals and a separate approved-pending-closing collection.
- Convex test proving wrong organization, missing brokerage, and non-backoffice roles cannot read the production backoffice dashboard.
- Convex or integration test proving `recordOfflineClosing` from an approved dashboard proposal creates the active Build, moves the proposal to `closed`, updates the kanban card, creates copied build milestones/planned draws, and writes audit/event/outbox rows.
- Frontend test replacing `src/routes/backoffice/-index.test.ts` demo fallback expectations with production mapping expectations.
- Frontend test proving `#active-builds`, `#submitted-proposals`, `#milestones-kanban`, and `#proposals-kanban` are assigned to the correct dashboard sections and metric drilldowns target the correct anchors.
- Frontend test proving approved-but-not-closed proposals render in Builds - Proposals and the approved-pending-closing group, but not in Active Builds or Milestone Kanban.
- Frontend test proving right-clicking an approved proposal row/card opens a context menu with Record closing.
- Frontend test proving the contextual sidebar opens from approved proposal rows/cards and uses the same closing dialog action path.
- Frontend test proving the shared closing dialog requires build start date and reason and calls the closing callback/mutation with `loanFacility.principalCents` from `lenderDrawPolicyLimitCents` and `interestAnnualBps: 925`.
- Browser verification of `/backoffice` in the in-app browser or Playwright showing production source labeling, no Sync timelines control, no demo/mock labels in the four annotated surfaces, and the approved closing affordances.
- `bun x convex codegen`.
- `bun x tsc -p convex/tsconfig.json --noEmit`.
- `bun run test`.
- `bun run build`.
- Documentation update describing the production dashboard migration and close-from-dashboard workflow.

## Iteration Policy

1. Read `convex/_generated/ai/guidelines.md`, the production proposal PRD/implementation notes, vocabulary, and current `/backoffice` source before editing.
2. Inspect `git status` and preserve unrelated user changes.
3. Remove `/backoffice` dependencies on demo dashboard queries, demo submitted timeline query, demo sync mutation, mock fallback, and demo source label.
4. Add the production dashboard query and tests before wiring the UI, keeping WorkOS organization and brokerage scoping fail-closed.
5. Map production data directly into the dashboard surface shape or a new production-specific shape without demo compatibility adapters.
6. Wire Active Builds and Milestone Kanban from active Build tables only.
7. Wire Builds - Proposals and Submitted Proposals from production proposal/kanban data, keeping approved-pending-closing visibility scoped to those surfaces.
8. Add contextual sidebar, context menu, and shared confirmation dialog for approved proposal closing.
9. Fix section ids and metric drilldown anchors.
10. Run focused tests after each major backend/frontend boundary, then run full codegen, typecheck, tests, build, and browser verification.
11. Update docs with the production dashboard source, approved-pending-closing behavior, and close-from-dashboard path.

## Blocked Policy

If blocked, report:

- The exact file, function, route, or product rule that cannot be satisfied.
- The command, test, or browser action proving the block.
- Whether the blocker is WorkOS organization context, Convex schema/API generation, fluent-convex behavior, missing production fields, route generation, UI primitive behavior, or product-policy conflict.
- The smallest concrete input or decision that would unlock progress, such as a missing field mapping, loan default rule, organization fixture, permission decision, or route behavior decision.

## Ambiguity Audit

- No material ambiguity remains for implementation. The user explicitly decided active Build boundaries, approved-not-closed visibility, closing modal fields/defaults, contextual sidebar scope, Submitted Proposals grouping, demo fallback removal, and shared confirmation behavior.
