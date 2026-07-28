# Builder Milestone Start Interface Manifest

**Status:** Grilling complete; approved product contract, selected interaction, and implementation manifest
**Decision date:** 2026-07-22  
**Interaction decision date:** 2026-07-28
**Scope:** Builder and Builder Staff interactions with proposal milestones and active-build milestones  
**Primary implementation route:** `/builder/builds/$buildId` and its `/builder-staff/builds/$buildId` mirror

## 1. Purpose

This manifest identifies every repository interface through which a Builder or Builder Staff user views, plans, selects, updates, evidences, or completes a milestone. It defines which interfaces must expose the active-build **Start work** workflow, which must only display its resulting state, and which are proposal-planning or demo-only surfaces where the action must not appear.

The repository already contains an uncommitted partial implementation of milestone start. That implementation is not the target contract: it rejects early and dependency-violating starts, infers `5%` progress, overwrites evidence state with `Work started`, and permits several unrelated operations to start a milestone implicitly. The implementation must be remediated against this manifest before the UI is considered complete.

This document complements rather than replaces:

- `docs/draw_flow_prd.md`
- `docs/draw_flow_production_prd.md`
- `docs/specs/builder-milestone-execution-sheet-interface.md`
- `docs/uiManifest/screenManifest.md`
- `docs/uiManifest/routeManifest.md`
- `docs/uiManifest/componentManifest.md`

The `docs/uiManifest/*` documents contain aspirational `/app/builds/:buildId` route contracts. This manifest records the production route/component graph that exists in this repository today.

## 2. Approved Product Contract

### 2.1 Lifecycle semantics

1. **Start work records reality.** An early, late, or dependency-violating start is recorded rather than rejected.
2. A start transitions the active-build milestone lifecycle from `planned` to `in_progress`.
3. Starting does not infer a progress percentage and does not change evidence state.
4. Starting does not rewrite `dayStart`, `dayEnd`, duration, downstream schedules, draw groups, or any approved-plan baseline.
5. Planned and actual dates remain separate. Schedule variance is calculated and displayed.
6. Multiple milestones may be in progress concurrently.
7. A future actual-start timestamp is invalid. A current or backdated timestamp is valid.
8. Backdating does not require a reason.
9. A reason is required only when one or more configured `dependencyKeys` identify milestones that are not complete.
10. Dependency violations do not unlock completion, approval, evidence, or draw-release gates.

### 2.2 Authority

1. Builder Leads and Builder Staff with `milestone:update` may record a milestone start.
2. Contractors may update their assigned submilestone execution state but may not transition the parent milestone.
3. An authorized Builder starting the first submilestone may start the parent only through the same explicit confirmation workflow and one atomic domain mutation.
4. Lender staff may not originate a builder start declaration.
5. Lender Admin may perform an audited correction after completion submission.

### 2.3 Time and audit model

The canonical record distinguishes:

- `actualStartedAt`: when work actually began, supplied by the authorized builder and constrained to `<= now`;
- `reportedAt`: server time when the declaration was persisted;
- `reportedByWorkosUserId`: actor who made the declaration;
- dependency blockers observed at submission time;
- dependency override reason, required only when blockers exist.

Backdated starts preserve the later `reportedAt`; they do not rewrite history. Corrections and retractions create new audit events with actor, role, timestamp, and prior/new state. They never delete an earlier audit event.

### 2.4 Notifications and integrations

- Every normal start creates an organization-scoped activity/audit event.
- A normal start does not create a lender inbox notification.
- A dependency-override start alerts the Build's assigned lender staff and lender admin.
- If nobody is assigned, the alert falls back to the organization's lender-admin queue.
- Integration events are first-class: `milestone.started`, `milestone.start_corrected`, and `milestone.start_retracted`.
- Event payloads include actor, actual/report timestamps, prior/new state, dependency warnings, and the override reason when applicable.

### 2.5 UX contract

- **Start work** is not a one-click mutation.
- Every entry point opens one shared confirmation dialog.
- The dialog shows milestone identity, actual start date/time defaulted to now, planned start, schedule variance, and configured dependency status.
- If dependencies are incomplete, the dialog shows a prominent warning and requires an override reason.
- Evidence and notes are not required for an ordinary start.
- The flow is responsive on mobile but requires connectivity.
- If completion is submitted before a start was recorded, the completion flow requires the missing actual start date/time and atomically records both transitions.
- Conversational assistant requests prepare the same structured confirmation; free-form text never commits the mutation by itself.

### 2.6 Selected interaction design

**Variant A — Compact confirmation** is the selected production direction.

- The workflow opens as a focused dialog over the current Build Workspace context rather than navigating to a separate page or replacing the workspace with a full-height task flow.
- The same dialog serves milestone and submilestone triggers. A submilestone invocation preserves and displays both the selected submilestone and its parent milestone context.
- The default view prioritizes the selected scope, actual start date/time, planned start, schedule variance, dependency status, and one explicit confirmation action.
- Dependency detail and the override reason appear conditionally only when configured predecessor milestones are incomplete.
- Backdating changes the variance preview but does not reveal or require a reason field by itself.
- Every source—milestone sheet, milestone card, calendar, Gantt, submilestone, and assistant—opens this same interaction with source and scope context preselected.
- The wider context-split and guided field-check-in prototype variants are not production interaction patterns. They remain prototype evidence only until the prototype is captured off the implementation branch.

## 3. Action Placement Rules

| Surface class | Start action | Required behavior |
|---|---:|---|
| Active-build milestone detail | Yes | Open shared start dialog. |
| Active-build milestone card / kanban | Yes | Open shared start dialog for that milestone. |
| Active-build Gantt milestone | Yes | Expose selected-milestone action that opens shared dialog. |
| Active-build calendar milestone event | Yes | Open shared dialog; never submit a fixed note directly. |
| Builder assistant | Yes | Produce structured human-in-the-loop confirmation card. |
| First Builder-authorized submilestone start | Conditional | If parent is `planned`, compose the parent start into the same confirmation and atomic mutation. |
| Active-build timeline/evidence/activity/readiness projections | Display or deep-link only | Reflect actual start and variance; do not create another mutation path unless explicitly listed above. |
| Builder dashboard | No | Show status/exception summary and deep-link to Build Workspace. |
| Proposal planning | No | Planned dates and dependencies only; never expose active-build lifecycle actions. |
| Contractor activity | No parent action | Contractor submilestone activity does not start the parent milestone. |
| Demo/prototype | Separate parity scope | Must not be treated as production implementation evidence. |

## 4. Production Interface Inventory

### 4.1 Entry and list surfaces

| ID | Route / interface | Source | Current milestone interaction | Start-work requirement | Required change |
|---|---|---|---|---|---|
| BMI-001 | Builder home | `/builder`; `src/routes/builder/index.tsx`; `BuilderTimelineDashboardSurface` | Lists live builds and proposals; opens a live Build Workspace. It does not own milestone lifecycle state. | No direct action | Preserve the deep link. If milestone exceptions are added to the summary, display only; do not add a dashboard mutation. |
| BMI-002 | Builder proposal list | `/builder/proposals`; `src/routes/builder/proposals/index.tsx`; `BuilderProposalListSurface` | Lists proposal workspaces and statuses. | None | No start-work affordance. |
| BMI-003 | Builder Staff proposal list | `/builder-staff/proposals`; shared `BuilderProductionProposalsWorkspace` | Staff-scoped mirror of proposal list. | None | No start-work affordance. |
| BMI-004 | Contractor detail work history | `/builder/contractors/$contractorId`; `ContractorDetailSurface` | Displays build/milestone assignments in contractor work history and links back to the Build Workspace. | None | Display actual-start status only if work-history rows need it; never allow a parent milestone transition here. |
| BMI-005 | Builder Staff home | `/builder-staff`; `src/routes/builder-staff/index.tsx`; shared `BuilderProductionHomeWorkspace` | Staff-scoped live-build/proposal summary and navigation. | No direct action | Preserve permission-scoped deep links; do not add a dashboard mutation. |
| BMI-006 | Builder Staff live-build list | `/builder-staff/builds`; `src/routes/builder-staff/builds/index.tsx`; `BuilderLiveBuildListSurface` | Lists assigned live builds and opens the staff Build Workspace. | No direct action | Preserve the deep link and assignment scope. |

### 4.2 Active Build Workspace route shells

| ID | Route / interface | Source | Current behavior | Start-work requirement | Required change |
|---|---|---|---|---|---|
| BMI-010 | Builder active Build Workspace | `/builder/builds/$buildId`; `src/routes/builder/builds/$buildId/index.tsx` | Loads detail, timeline, calendar, permissions, and all active-build mutations; supplies `ProductionBuildDetailActions`. | Orchestration owner | Replace the current `{ milestoneKey, note }` start action with the approved input contract. Own one dialog state/controller and pass an `openStartWork` command to all direct entry points. |
| BMI-011 | Builder Staff active Build Workspace | `/builder-staff/builds/$buildId`; `src/routes/builder-staff/builds/$buildId/index.tsx` | Reuses `BuilderBuildWorkspaceRoute` with staff permissions and without the Staff tab. | Same as Builder route when `milestone:update` is granted | Keep the shared route implementation; verify limited staff cannot see or invoke the action. Do not fork the workflow. |
| BMI-012 | Build Workspace tab navigation | `BuildDetailTabBar` in `src/features/backoffice-build-detail/BuildDetailTabs.tsx` | Provides Details, Milestones, Contractors, Materials, Timeline, Evidence, Staff, Calendar, and Gantt tabs; mobile uses a select. | None | Preserve navigation and query state while a shared dialog opens/closes. |

### 4.3 Active-build direct start entry points

| ID | Interface | Source | Current behavior | Required change |
|---|---|---|---|---|
| BMI-020 | Milestone execution sheet | `MilestoneDetailSheet.tsx`, mounted by `ProductionBuildDetailSurface.tsx` | Renders **Start work** only when `data.canStartWork`; invokes `onStartWork(milestoneKey, note)` directly. | Make this the canonical detailed entry point. Open the shared dialog. Replace the boolean-only eligibility contract with start context containing permission, lifecycle, actual start, planned start, and dependency blockers. |
| BMI-021 | Details tab current-milestone cards | `ProductionDetailsTab` and `CurrentMilestoneHorizonSection` in `ProductionBuildDetailSurface.tsx` | Behind/current/upcoming cards open the milestone sheet. | Add an explicit card action for eligible `planned` milestones while preserving card-to-sheet navigation. Both entry paths open the same dialog. Early, late, and dependency-blocked milestones remain actionable. |
| BMI-022 | Details tab milestone kanban | `MilestoneKanban.tsx`, mounted by `ProductionDetailsTab` | Cards open milestone detail; current card status derives from planned day, dependencies, completion, and progress. | Add/reuse the shared card start action. Do not use column placement as authority to block recording reality. |
| BMI-023 | Milestones tab kanban | `ProductionMilestonesTab` and `MilestoneKanban.tsx` | Dedicated milestone-card board; opens the same detail sheet. | Same shared card action and dialog as BMI-022. No duplicated mutation logic. |
| BMI-024 | Calendar event action | `ProductionCalendarTab`; `activeBuildCalendarAdapter.ts`; `CalendarWorkspace.tsx`; `CalendarEventDetailDrawer.tsx` | `start-milestone-work` calls the mutation immediately and injects the fixed note `Started from calendar workspace.` Action availability is based primarily on action presence. | Replace direct execution with `openStartWork(milestoneKey)`. Show only for milestone events in a startable lifecycle. Pass server-projected dependency context to the shared dialog. Remove the fabricated fixed note. |
| BMI-025 | Gantt selected milestone action | `ProductionGanttTab`; `ActiveBuildGanttWorkspace.tsx` | Displays/selects active-build milestones but receives no builder start callback. | Add a selected-milestone **Start work** action wired to the shared dialog. Preserve lender approval/rejection controls as separate authority paths. |
| BMI-026 | Builder assistant confirmation | `DrawFlowAssistant.tsx`; `convex/assistant.ts` action `start_active_build_milestone` | The assistant can dispatch `startActiveBuildMilestone` through the generic persisted HITL action pipeline. | Add a structured start confirmation card with actual start and dependency data. The confirmed action must call the same domain command as the Build Workspace; free-form intent alone cannot commit. |

### 4.4 Active-build indirect execution surfaces

These interfaces interact with milestone execution and therefore must consume the new fields and invariants, but they do not gain an independent milestone-level start mutation.

| ID | Interface | Source | Milestone interaction | Required change |
|---|---|---|---|---|
| BMI-030 | Timeline tab | `ProductionTimelineTab`; `ActiveBuildTimelineWorkspace.tsx` | Displays milestone/submilestone execution and allows authorized submilestone updates and evidence activity. | Display actual start and variance. When an authorized Builder starts the first submilestone and the parent is planned, open the shared parent-start confirmation and commit both atomically. Contractor-originated activity cannot do this. |
| BMI-031 | Evidence tab | `ProductionEvidenceTab` | Groups builder/site-visit evidence by milestone and deep-links into milestone detail. | Display lifecycle independently from evidence state. Evidence upload must not start the milestone implicitly. Preserve the detail-sheet deep link. |
| BMI-032 | Evidence upload inside milestone sheet | `MilestoneDetailSheet.tsx`; route action `uploadSubmilestoneEvidence` | Uploads evidence against milestone/submilestone scope. Backend currently changes a planned milestone to `in_progress`. | Remove the implicit lifecycle transition. Uploading evidence is valid independently of a start declaration. |
| BMI-033 | Submilestone ledger/guided completion | `MilestoneDetailSheet.tsx`; `updateActiveBuildSubmilestoneExecution` | Updates submilestone status, notes, cost, and completion; backend currently derives parent `planned`/`in_progress` from progress. | Builder first-start uses the shared parent confirmation and atomic command. Subsequent submilestone updates do not rewrite the parent's actual start. Contractor updates never transition the parent. |
| BMI-034 | Completion submission | `MilestoneDetailSheet.tsx`; `submitActiveBuildMilestoneCompletion` | Submits completion after all persisted submilestones are complete. | If the parent lacks an actual start, require it in the completion UI and persist start plus completion atomically. Do not synthesize an actual start from completion time. |
| BMI-035 | Event/activity rail | `EventRail.tsx`; mounted by `ProductionBuildDetailSurface.tsx` | Displays audit and quick-action events. | Render start, dependency-override, correction, and retraction events with actor, actual time, report time, and reason when present. Read-only. |
| BMI-036 | Contractors tab and assignment drawers | `ProductionContractorsTab`; `ContractorsCard.tsx`; `ContractorPlanningPanel.tsx`; `ContractorQuickAddDrawer.tsx` | Assigns contractors to milestone/submilestone scope. | No parent start action. Assignment or acknowledgement is not evidence that work began. Display lifecycle only when useful context. |
| BMI-037 | Materials tab | `ProductionBuildMaterialsTab`; `MaterialPlanningTab.tsx` | Edits milestone-scoped material cost/planning data. | No start action. Material creation, ordering, or delivery must not transition milestone lifecycle. |
| BMI-038 | Funding/draw workspace in Details | `BuildFundingWorkspace.tsx` | Displays milestone-linked draw availability and requests. | Consume actual-start status only as informational context. Start never changes draw availability or bypasses completion/approval/release gates. |
| BMI-039 | Site-visit request dialog | `SiteVisitOrderDialog.tsx` and active-build site-visit actions | Requests or schedules milestone-scoped visits. Backend currently has paths that change a planned milestone to `in_progress`. | Do not infer builder start from site-visit scheduling, assignment, or completion. |
| BMI-040 | Missing-information workflows | `requestActiveBuildMilestoneInfo` and related lender controls | Associates lender requests with a milestone. Backend currently changes some planned milestones to `in_progress`. | Keep the builder lifecycle unchanged. An information request is not a start declaration. |
| BMI-041 | Staff permissions tab | `BuilderStaffPermissionsPanel.tsx` | Grants resource/action permissions including `milestone:update`. | Continue using `milestone:update` as the start authority. Permission changes must immediately affect all shared action entry points. |

## 5. Proposal-Planning Interface Inventory

Proposal milestones are plans, not active-build execution records. They may edit proposed dates, dependencies, budgets, contractors, submilestones, and draw grouping, but they must never expose **Start work** or write actual-start fields.

| ID | Route / interface | Source | Milestone interaction | Start-work treatment |
|---|---|---|---|---|
| BMP-001 | New proposal setup | `/builder/proposals/new`; `TimelineSetupFlow` in `src/routes/builder/proposals/new.tsx` | Selects templates and defines initial milestone/submilestone roadmap data. | Excluded; planned start only. |
| BMP-002 | Proposal Milestones tab | `/builder/proposals/$proposalId?tab=milestones`; `src/routes/builder/proposals/$proposalId/index.tsx`; `ProductionProposalMilestoneWorksheetContainer.tsx` | Creates/updates/deletes draft milestones and submilestones. | Excluded. Ensure status copy says planned/draft, never active execution. |
| BMP-003 | Proposal Gantt | `ProductionProposalGanttWorkspace.tsx` | Edits planned timing/dependencies for draft proposals; submitted proposals are read-only/noop. | Excluded. |
| BMP-004 | Proposal Timeline | `ProductionTimelineWorkspace.tsx` | Displays/edits proposal timeline according to persistence mode. | Excluded. |
| BMP-005 | Proposal Calendar | `ProductionProposalReviewSurface`; proposal calendar adapter | Displays and, where authorized, edits planned schedule events. | Excluded. Calendar action registry must not inherit active-build start actions. |
| BMP-006 | Proposal Contractors tab | `ProductionContractorPlanningTab.tsx` | Assigns intended contractor scope to proposal milestones/submilestones. | Excluded. Assignment is planning, not execution. |
| BMP-007 | Proposal Materials tab | `MaterialPlanningTab.tsx` through `ProductionProposalReviewSurface` | Edits milestone-scoped planned materials/costs. | Excluded. |
| BMP-008 | Proposal packet/review/draw tabs | `ProductionProposalSurfaces.tsx` | Summarizes milestones and draw plans before submission. | Display planned status only. |
| BMP-009 | Roadmap compatibility route | `/builder/proposals/$proposalId/roadmap`; `ProductionTimelineWorkspace.tsx` | Dedicated proposal roadmap compatibility surface. | Excluded. |
| BMP-010 | Builder Staff proposal workspace | `/builder-staff/proposals/$proposalId`; `src/routes/builder-staff/proposals/$proposalId/index.tsx`; shared `BuilderProductionProposalWorkspace` | Permission-scoped mirror of proposal interfaces. | Excluded. |

## 6. Demo and Prototype Inventory

These surfaces are inventoried because they contain builder-facing milestone interactions and are exercised by visual/E2E workflows, but they are not proof that the production route is correct.

| ID | Route / interface | Source | Current role | Parity obligation |
|---|---|---|---|---|
| BMD-001 | Builder demo active-build detail | `/builder/demo/dashboard/builds/$buildId`; `src/routes/builder/demo/dashboard/builds/$buildId.tsx` | Renders `TimelineWorkspace` and `MilestoneExecutionSheetPrototype`. | Keep clearly demo-only. If retained for stakeholder demos, update its lifecycle vocabulary and confirmation behavior after production is correct. |
| BMD-002 | Development execution-sheet variants | `?variant=` on `/builder/builds/$buildId`; `MilestoneExecutionSheet.prototype.tsx` | DEV-only prototype overlay. | May explore layout, but must call/reuse the production dialog and domain contract before being used as acceptance evidence. |
| BMD-003 | Borrower demo milestone rail | `build-workspace-demo/BorrowerDashboardRoute.tsx` | Milestone rail, selected-milestone summary, evidence and completion claim. | No production authority. Align status copy and start affordance only if this demo remains user-visible. |
| BMD-004 | Generic Build Workspace demo | `build-workspace-demo/BuildWorkspaceDemo.tsx` | Editable milestone rail/Gantt/detail sheet with role-specific primary actions. | No production authority. Do not copy its `Mark complete` behavior into production. |
| BMD-005 | Demo timeline setup/workspace | `timeline-workspace/*`; `/demo/timeline` and builder demo routes | Proposal/roadmap experimentation and fixture persistence. | Planning-only unless explicitly backed by an active-build production adapter. |
| BMD-006 | Builder demo proposal workspace | `/builder/demo/dashboard/proposals/$draftId`; `src/routes/builder/demo/dashboard/proposals/$draftId.tsx`; `TimelineWorkspace` | Demo-persisted proposal milestones and roadmap editing. | Proposal-planning only; never expose active-build **Start work**. |
| BMD-007 | Builder demo dashboard and proposal list | `/builder/demo/dashboard`; `/builder/demo/dashboard/proposals`; shared builder dashboard/list surfaces | Demo navigation into proposal and active-build fixtures. | No direct start mutation; deep-link only. |

## 7. Shared UI Contract

The implementation should adapt existing dialog, form, date/time input, warning, and frame primitives under `src/components/` rather than introduce a custom card/modal system.

### 7.1 Shared start controller

All direct entry points call one controller with:

```ts
type OpenMilestoneStartInput = {
  milestoneKey: string;
  source: "assistant" | "calendar" | "gantt" | "milestone_card" | "milestone_sheet" | "submilestone";
  submilestoneKey?: string;
};
```

The controller resolves authoritative start context from the active-build query projection and opens the same dialog. Source is analytics/audit context, not a substitute for actor identity.

### 7.2 Dialog input

```ts
type RecordMilestoneStartInput = {
  actualStartedAt: number;
  buildId: Id<"activeBuilds">;
  dependencyOverrideReason?: string;
  milestoneKey: string;
  submilestoneStart?: {
    status: "in_progress";
    submilestoneKey: string;
  };
  workosOrganizationId: string;
};
```

`reportedAt` and actor identity are server-owned. The server recalculates dependency blockers inside the mutation; client-projected blockers are explanatory UI, never authorization.

### 7.3 Projection required by every execution surface

```ts
type MilestoneStartContext = {
  actualStartedAt?: number;
  canRecordStart: boolean;
  dependencyBlockers: Array<{ key: string; name: string }>;
  lifecycleState: "planned" | "in_progress" | "completion_submitted" | "complete";
  plannedStartedAt: number;
  reportedAt?: number;
  scheduleVarianceDays?: number;
};
```

The projection must not collapse `dependencyBlockers` into `canStartWork: false`. Incomplete dependencies change the dialog into an override flow; they do not remove the action.

### 7.4 Dialog states

1. Normal on-time start: date/time defaulted to now; confirm enabled.
2. Backdated start: valid without reason; variance preview shown.
3. Early planned-date start: valid without reason; variance warning shown.
4. Dependency override: valid only after a non-empty reason.
5. Future time: invalid with inline error.
6. Permission denied: action absent; server still enforces permission.
7. Already started: show actual/report timestamps and correction action instead of duplicate start.
8. Completion already submitted/complete: no start action; route to the agreed correction authority.
9. Offline/network failure: preserve entered values, show retry, and do not optimistically transition lifecycle.

## 8. Backend and Projection Dependencies

The UI cannot satisfy this manifest until these current contradictions are removed.

| ID | Current implementation | Source | Required remediation |
|---|---|---|---|
| BMB-001 | Rejects any configured dependency blocker. | `startActiveBuildMilestone` in `convex/production_proposals.ts` | Record the start; require `dependencyOverrideReason`; emit warning/audit/notification. |
| BMB-002 | Rejects starts before `dayStart`. | Same mutation | Permit early actual starts; calculate variance without rewriting the plan. |
| BMB-003 | Sets `progressPercent` to at least `5`. | Same mutation | Remove progress mutation. |
| BMB-004 | Changes `evidenceState` to `Work started`. | Same mutation | Remove evidence mutation. |
| BMB-005 | Stores only `startedAt`. | `buildMilestones` in `convex/schema.ts` | Cleanly model actual/report timestamps and reporting actor; preserve organization scope. |
| BMB-006 | Repeated start is a silent no-op. | Same mutation | Return an explicit already-started result/context; UI routes to correction rather than pretending success. |
| BMB-007 | Evidence upload starts a planned milestone. | `createActiveBuildTimelineEvidenceAsset` | Remove implicit parent lifecycle transition. |
| BMB-008 | Submilestone progress derives parent status directly. | `updateActiveBuildSubmilestoneExecution` | Use the explicit atomic builder start flow; contractor updates never start parent. |
| BMB-009 | Site-visit scheduling/assignment can start a planned milestone. | `scheduleActiveBuildSiteVisit`, `assignActiveBuildSiteVisit` | Remove implicit builder lifecycle transition. |
| BMB-010 | Missing-information request can start a planned milestone. | `requestActiveBuildMilestoneInfo` | Remove implicit builder lifecycle transition. |
| BMB-011 | UI `canStartWork` is false for dependency blockers, dates before `dayStart`, and behind-schedule work. | `resolveProductionMilestoneKanbanState` | Separate lifecycle/permission from warnings. Planned milestones remain recordable regardless of schedule position; blockers require reason. |
| BMB-012 | Calendar action executes directly with a fabricated note. | `ProductionCalendarTab`; active-build calendar adapter | Open the shared dialog. |
| BMB-013 | No explicit correction/retraction command contract is exposed to the Builder UI. | Active-build mutations/actions | Add audited correction and retraction commands with the agreed pre/post-completion authority. |
| BMB-014 | Completion does not capture a missing actual start. | Completion input/mutation and `MilestoneDetailSheet` | Accept required missing-start input and persist both transitions atomically. |
| BMB-015 | Assistant action forwards only `note`/`reason`. | `convex/assistant.ts` | Carry confirmed actual start and dependency override reason through the same domain command. |

## 9. Required Test Manifest

### 9.1 Domain tests

Primary file: `convex/production_proposals.test.ts`

- Authorized Builder records an on-time start.
- Authorized Builder Staff with `milestone:update` records a start.
- Staff without `milestone:update` is rejected.
- Contractor cannot start the parent milestone.
- Backdated start succeeds without a reason.
- Future start is rejected.
- Early planned-date start succeeds without a reason.
- Dependency-violating start without a reason is rejected.
- Dependency-violating start with a reason succeeds and persists blockers/reason.
- Independent milestones may be in progress concurrently.
- Start changes lifecycle only; progress and evidence remain unchanged.
- `actualStartedAt`, server `reportedAt`, and reporting actor are distinct and audited.
- Routine start creates audit/activity but no lender inbox notification.
- Dependency override alerts assigned lender staff/admin, with admin-queue fallback.
- Started/corrected/retracted webhook events are organization-scoped and complete.
- Evidence upload does not start a milestone.
- Site-visit scheduling/assignment does not start a milestone.
- Missing-information requests do not start a milestone.
- Builder first-submilestone start can atomically start parent and child after confirmation.
- Contractor submilestone activity never starts parent.
- Completion with no prior start requires/persists the supplied actual start atomically.
- Correction/retraction permissions change after completion submission.
- Cross-organization access is rejected for every new command/query.

### 9.2 Component and route tests

| Test target | Existing test file | Required coverage |
|---|---|---|
| Shared start dialog/controller | New colocated test | Default-now behavior, backdating, future validation, dependency reason, pending/error/retry, mobile layout, and focus restoration. |
| Builder route action plumbing | `src/routes/builder/builds/$buildId/-index.test.tsx` | Permission-aware action presence and approved mutation payload. |
| Milestone sheet | `MilestoneDetailSheet.test.tsx` | Opens shared dialog; no direct mutation; already-started/correction state; missing-start completion capture. |
| Production surface | `ProductionBuildDetailSurface.test.tsx` | Details card, kanban, calendar, Gantt, and sheet all open the same controller with the selected milestone. |
| Kanban/card | `MilestoneKanban.test.tsx` | Planned, early, late, and dependency-blocked cards expose the action; completion-submitted/complete cards do not. |
| Calendar | `CalendarWorkspace.test.tsx`, `CalendarEventDetailDrawer.test.tsx`, plus a new active-build adapter test | Only milestone events expose start; action opens confirmation and never commits directly. |
| Gantt | New `ActiveBuildGanttWorkspace.test.tsx` or coverage in the production surface test | Selected planned milestone opens shared dialog; lender-only controls remain separate. |
| Timeline/submilestone | `ActiveBuildTimelineWorkspace.test.tsx` | First Builder submilestone start composes parent confirmation; contractor path does not. |
| Event rail | `EventRail.test.tsx` | Start, override, correction, and retraction event rendering. |
| Builder dashboard | `BuilderTimelineDashboard.test.tsx` | No direct start mutation; deep link remains. |
| Assistant | `DrawFlowAssistant.test.ts`, `convex/assistant.test.ts` | Free-form request prepares structured confirmation; only explicit confirmation commits approved payload. |
| Proposal surfaces | `ProductionProposalSurfaces.test.tsx` and builder proposal route tests | No active-build **Start work** action leaks into proposal worksheet, Gantt, timeline, or calendar. |

### 9.3 Browser acceptance

Add production-route E2E coverage for Builder Lead and limited Builder Staff:

1. Open a planned milestone from Details, Milestones, Calendar, and Gantt.
2. Verify each entry point opens the same confirmation UI.
3. Record a backdated normal start without a reason.
4. Record a dependency override with the mandatory reason and observe the warning/audit state.
5. Confirm actual start and schedule variance across card, sheet, calendar, Gantt, timeline, and activity rail.
6. Confirm progress and evidence did not change.
7. Confirm proposal-planning routes contain no start action.
8. Verify mobile viewport behavior and keyboard/focus accessibility.
9. Simulate a failed mutation and verify entered values remain available for retry.

Demo E2E tests such as `tests/e2e/drawflow-demo.spec.ts` may verify visual parity, but they cannot replace production route acceptance.

## 10. Implementation Completion Checklist

- [ ] One canonical start domain command implements the approved truth-recording rules.
- [ ] Schema and projections expose actual/report timestamps, actor, blockers, and variance without conflating progress/evidence.
- [ ] Every implicit non-builder parent-start side effect is removed.
- [ ] One shared start dialog/controller is reused by sheet, cards/kanban, calendar, Gantt, submilestone composition, and assistant confirmation.
- [ ] Builder and Builder Staff permission behavior is identical except for granted `milestone:update` scope.
- [ ] Dashboard and proposal surfaces remain mutation-free for milestone start.
- [ ] Missing-start completion is atomic.
- [ ] Corrections/retractions preserve audit history and enforce authority.
- [ ] Routine activity, exception notifications, and webhook events follow the approved fan-out rules.
- [ ] Domain, component, route, and browser tests in Section 9 pass.
- [ ] `bun x convex codegen`, `bun x tsc -p convex/tsconfig.json`, `bun run test`, and `bun run build` pass after implementation.

## 11. Out of Scope

- Proactive funding or draw release triggered by milestone start.
- Automatic progress percentage from elapsed time or start declaration.
- Evidence-state mutation caused by start.
- Automatic schedule re-baselining.
- Contractor authority to declare the parent milestone started.
- Offline queued lifecycle mutations.
- Start-work controls on proposal-planning surfaces.
- Treating demo/prototype behavior as production acceptance.

## 12. Grilling Session Closeout

**Status:** Closed on 2026-07-28.

The grilling session has no outstanding product or interaction questions. The approved contract resolves:

- milestone and submilestone trigger placement;
- lifecycle transitions and concurrent in-progress milestones;
- actual versus reported timestamps and backdating;
- dependency exceptions and the conditionally required reason;
- builder, Builder Staff, contractor, lender staff, and lender-admin authority;
- audit history, lender exception alerts, and integration events;
- completion submitted without a prior recorded start;
- shared confirmation behavior across sheet, card, calendar, Gantt, submilestone, and assistant entry points;
- dashboard, proposal-planning, demo, and read-only projection exclusions; and
- Variant A as the shared production interaction.

Unchecked items in Section 10 are implementation work, not unresolved product decisions.
