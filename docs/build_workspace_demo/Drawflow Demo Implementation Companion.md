# DrawFlow Demo Implementation Companion

## 0. Purpose

This file is the final implementation companion for the DrawFlow Core Build Workspace demo. It covers:

1. UI component manifest.
2. Route and file manifest.
3. Playwright fixture strategy.
4. Final coverage matrix format.
5. Agent instruction block and anti-punting checklist.

Core rule:

> A control is not implemented when it renders. A control is implemented when it has a real handler, mutates or reads the correct Convex-backed state, updates derived projections, and is covered by a behavior test.

---

## 1. Non-Negotiable Implementation Rules

### 1.1 Persistence

Convex is the domain source of truth. Do **not** use Zustand for domain state.

React local state is allowed only for ephemeral UI state:

- selected milestone key,
- drawer/sheet open state,
- selected persona,
- current time resolution,
- column size slider value,
- collapsed/expanded rail state,
- pending drag preview,
- pending form input before submit,
- modal open/close state.

Anything that changes the build/proposal/workflow must persist through a `demo_` Convex mutation.

### 1.2 Naming

All demo Convex tables must start with `demo_`.

All public Convex functions must start with `demo_`.

Use these UI terms consistently:

- `milestone-card`: vertical card in the left milestone rail.
- `rail-card`: Gantt/timeline card.
- `draw-group-box`: visual box enclosing all rail-cards in a draw group.

Do not use ambiguous names like `TaskCard` or `GanttItem` for the core domain components.

### 1.3 No Fake Affordances

Forbidden:

- enabled button that only shows `Coming soon`,
- enabled button that only logs to console,
- drag handle that appears but does not drag,
- drag interaction that updates visuals but does not persist the required state,
- tests that only assert that the page rendered,
- controls wired to component state while pretending to mutate domain state,
- disabled controls with no explanation,
- TODO comments in behavior paths,
- placeholder mutation names that do not exist in Convex.

### 1.4 Required Test Selectors

Every interactive control must have a stable selector.

Use this convention:

```tsx
data-testid="drawflow:<mode>:<component>:<semantic-key>"
```

Examples:

```tsx
data-testid="drawflow:active:milestone-card:foundation"
data-testid="drawflow:active:rail-card:foundation"
data-testid="drawflow:proposal:draw-group-box:d7"
data-testid="drawflow:proposal:submit"
data-testid="drawflow:active:persona-selector"
data-testid="drawflow:active:audit-drawer"
```

Prefer semantic demo keys over Convex `_id` values.

---

# 2. UI Component Manifest

## 2.1 Component Layering

Organize the UI into four layers:

1. Route pages.
2. Workspace shells.
3. Domain components.
4. Primitive interaction components.

A component may receive derived projection data from Convex queries, but it must not reconstruct business invariants from raw rows unless it is rendering an already-derived projection field.

---

## 2.2 Shared Layout Components

### `DrawFlowDemoLayout`

Purpose: global shell for both Proposal Builder and Active Workspace.

Used by:

- `/demo/drawflow/proposal`
- `/demo/drawflow/active`

Responsibilities:

- Provide page-level layout.
- Render route-specific top bar.
- Render full-height workspace content.
- Preserve full available Gantt width.
- Avoid fixed-width clipping of the right side.

Must not:

- Own domain state.
- Compute milestone blocking rules.
- Contain hardcoded seed milestone arrays.

Required selectors:

```txt
drawflow:layout:root
drawflow:layout:workspace
```

---

### `DrawFlowTopBar`

Purpose: top navigation/control bar.

Active top bar includes:

- Proposal route link.
- Active route indicator.
- Persona selector.
- Reset Demo.
- Audit.
- Event Outbox.

Proposal top bar includes:

- Active Build route link.
- Proposal route indicator.
- Reset Demo.
- Analyze Plan.
- Apply Recommended Plan.
- Submit Proposal.
- Time Resolution.
- Column Size Slider.

Proposal top bar must **not** include primary Audit/Event Outbox actions. In Proposal Builder, those controls live in the footer/bottom status region.

Required selectors:

```txt
drawflow:active:topbar
drawflow:proposal:topbar
drawflow:active:scenario-link:proposal
drawflow:proposal:scenario-link:active
```

---

### `DemoScenarioLinks`

Purpose: route-based navigation between proposal and active scenarios.

Responsibilities:

- Render links, not tab-only state.
- Navigate to `/demo/drawflow/proposal` and `/demo/drawflow/active`.
- Preserve scenario isolation.

Must not:

- Mutate Convex domain state.
- Pretend active build was generated from proposal submission.

Required selectors:

```txt
drawflow:shared:scenario-link:proposal
drawflow:shared:scenario-link:active
```

---

### `PersonaSelector`

Purpose: demo persona selector for Active Workspace.

Personas:

- Builder Lead.
- Lender Admin.
- Site Visitor.

Responsibilities:

- Change available controls.
- May persist selected persona in URL search params, local storage, or route state.
- May reload the page if simpler.

Must not:

- Implement real auth.
- Mutate domain state.
- Hide that this is a demo persona selector.

Required selectors:

```txt
drawflow:active:persona-selector
drawflow:active:persona-option:builder-lead
drawflow:active:persona-option:lender-admin
drawflow:active:persona-option:site-visitor
```

---

### `DemoResetControls`

Purpose: internal demo reset/seed controls.

Controls:

- Reset Demo.
- Seed Active Build Scenario.
- Seed Proposal Scenario.
- Clear Audit/Event Logs, if implemented.
- Confirmation dialog.

Responsibilities:

- Call `demo_resetDrawFlowDemo`.
- Confirm before destructive reset.
- Show visible toast/banner after reset.
- Preserve route after reset where possible.

Must not:

- Only clear client state.
- Reset without touching Convex demo tables.

Required selectors:

```txt
drawflow:shared:reset-demo
drawflow:shared:reset-confirm
drawflow:shared:reset-cancel
drawflow:shared:reset-toast
```

---

## 2.3 Shared Gantt Components

### `GanttWorkspaceFrame`

Purpose: main two-column workspace frame.

Regions:

- Collapsible left milestone rail.
- Scrollable Gantt canvas.
- Bottom/footer status region.

Responsibilities:

- Maintain full available width.
- Allow horizontal/vertical Gantt scrolling.
- Preserve selected milestone where feasible when rail collapses.
- Coordinate left rail and Gantt row alignment.

Must not:

- Hardcode a fixed Gantt width that clips right-side content.
- Render draw-group boxes in a coordinate system separate from rail-cards.

Required selectors:

```txt
drawflow:shared:gantt-frame
drawflow:shared:gantt-scroll-area
drawflow:shared:gantt-canvas
```

---

### `MilestoneRailPane`

Purpose: collapsible vertical milestone list.

Responsibilities:

- Render milestone-cards in current sort order.
- Show summary counts.
- Support collapse/expand.
- In Proposal mode, support vertical reordering.
- In Active mode, do not show reorder drag handles.

Required selectors:

```txt
drawflow:shared:milestone-rail
drawflow:shared:milestone-rail-collapse
drawflow:shared:milestone-rail-expand
```

---

### `MilestoneCard`

Purpose: vertical milestone card.

Responsibilities:

- Display milestone code/name.
- Display lifecycle status.
- Display blocking reason chips/icons.
- Display approved value.
- Display requested amount when active claim amount exists.
- Display progress.
- Display draw group label.
- Open/select milestone on click.
- In Proposal mode, expose drag handle and up/down buttons when draft.
- In Active mode, never expose reorder handles.

Required selectors:

```txt
drawflow:<mode>:milestone-card:<milestoneKey>
drawflow:<mode>:milestone-card-details:<milestoneKey>
drawflow:proposal:milestone-card-drag-handle:<milestoneKey>
drawflow:proposal:milestone-card-move-up:<milestoneKey>
drawflow:proposal:milestone-card-move-down:<milestoneKey>
```

---

### `GanttToolbar`

Purpose: controls above the timeline.

Controls:

- Time resolution: Days / Weeks / Months.
- Column size slider.
- Proposal setup button in Proposal mode.

Responsibilities:

- Keep time resolution as view state.
- Keep column size as view state.
- Never mutate Convex domain state for view-only controls.

Required selectors:

```txt
drawflow:shared:time-resolution
drawflow:shared:time-resolution:days
drawflow:shared:time-resolution:weeks
drawflow:shared:time-resolution:months
drawflow:shared:column-size-slider
```

---

### `RailCardLayer`

Purpose: renders Gantt rail-cards.

Responsibilities:

- Use the same row/date coordinate model as draw-group boxes.
- Render baseline and forecast bars in Active mode.
- Render draft planned bars in Proposal mode.
- Support selection.
- Support date runners.
- Support drag/resize behavior according to mode.

Required selectors:

```txt
drawflow:<mode>:rail-card-layer
drawflow:<mode>:rail-card:<milestoneKey>
```

---

### `RailCard`

Purpose: Gantt/timeline card for one milestone.

Active mode responsibilities:

- Render baseline bar.
- Render forecast foreground bar.
- Support forecast drag/resize only.
- Open reason modal before persistence.
- Never mutate baseline dates.

Proposal mode responsibilities:

- Render draft planned bar.
- Support body drag.
- Support left resize.
- Support right resize.
- Persist draft date changes immediately.
- Surface JIT warnings after debounce.

Edge handles:

- Show on hover/focus.
- Do not render if behavior is not implemented.

Required selectors:

```txt
drawflow:active:rail-card:<milestoneKey>
drawflow:active:rail-card-baseline:<milestoneKey>
drawflow:active:rail-card-forecast:<milestoneKey>
drawflow:proposal:rail-card:<milestoneKey>
drawflow:proposal:rail-card-left-handle:<milestoneKey>
drawflow:proposal:rail-card-right-handle:<milestoneKey>
drawflow:active:rail-card-left-handle:<milestoneKey>
drawflow:active:rail-card-right-handle:<milestoneKey>
```

---

### `DateRunners`

Purpose: vertical start/end date indicators for selected rail-card.

Responsibilities:

- Appear when a rail-card is selected.
- Align to selected milestone start/end dates.
- Update when time resolution or column size changes.
- Update when selected milestone date changes.

Required selectors:

```txt
drawflow:<mode>:date-runner:start
drawflow:<mode>:date-runner:end
```

---

### `DrawGroupBoxLayer`

Purpose: draw group bounding boxes.

Responsibilities:

- Render boxes behind/around rail-cards.
- Use same coordinate system as rail-cards.
- Compute visual bounds from projection fields:
  - earliest milestone start,
  - latest milestone end,
  - first row in group,
  - last row in group.
- Keep labels from overlapping rail-cards.

Must not:

- Wrap only the first row.
- Position labels directly over rail-cards.
- Use a separate hardcoded row height from rail-card rendering.

Required selectors:

```txt
drawflow:<mode>:draw-group-box-layer
drawflow:<mode>:draw-group-box:<drawGroupKey>
drawflow:<mode>:draw-group-label:<drawGroupKey>
```

---

### `BlockingReasonChips`

Purpose: compact visual representation of lifecycle blockers and warnings.

Responsibilities:

- Render icon/chip for each blocking reason.
- Show full text on hover.
- Show full text on tap/focus for mobile.
- Support multiple reasons.

Required selectors:

```txt
drawflow:<mode>:blocking-reasons:<milestoneKey>
drawflow:<mode>:blocking-reason:<milestoneKey>:<reason>
```

---

### `ValidationPanel`

Purpose: JIT planning errors/warnings or active workflow blockers.

Proposal responsibilities:

- Show initial spinner while JIT analysis is pending.
- Show hard errors, warnings, cap errors, stale analysis state.
- Distinguish blocking errors from non-blocking warnings.

Active responsibilities:

- Show milestone-specific blockers in detail sheet.
- Show forecast-invalid blockers.
- Show capital blockers.

Required selectors:

```txt
drawflow:proposal:analysis-status
drawflow:proposal:validation-panel
drawflow:active:validation-panel
```

---

## 2.4 Proposal Builder Components

### `ProposalWorkspacePage`

Purpose: route page for `/demo/drawflow/proposal`.

Responsibilities:

- Query `demo_getProposalWorkspace`.
- Render Proposal shell.
- Own JIT debounce orchestration at the UI edge:
  - mark pending,
  - display spinner,
  - call `demo_recomputeProposalPlan({ runType: "jit" })` after debounce.

Must not:

- Compute validation rules locally.
- Directly mutate milestone arrays.
- Hide analysis errors to make submit pass.

Required selectors:

```txt
drawflow:proposal:page
```

---

### `ProposalSetupDrawer`

Purpose: planner input controls.

Fields:

- Working capital cap.
- Annual interest rate.
- Payoff/takeout date.
- Flat draw fee.
- Project start date.
- Planning mode.

Responsibilities:

- Persist setup changes through Convex if editable.
- Trigger JIT recalculation after changes.
- Show stale/pending analysis state during debounce.

Required selectors:

```txt
drawflow:proposal:setup-open
drawflow:proposal:setup-drawer
drawflow:proposal:setup-working-capital
drawflow:proposal:setup-interest-rate
drawflow:proposal:setup-payoff-date
drawflow:proposal:setup-flat-fee
```

---

### `ProposalMilestoneDetailSheet`

Purpose: non-modal sheet for selected proposal milestone.

Required fields/controls:

- Name input.
- Approved/proposed value input.
- Duration input.
- Draft planned start date input.
- Draft planned end date input.
- Draw group selector.
- Dependency editor.
- Blocking/blocked-by list.
- Warning/error list.
- Delete milestone.
- Duplicate milestone.

Responsibilities:

- Never blur/darken background.
- Persist each field through Convex mutations.
- Show validation state after JIT.
- Disable edits when proposal is submitted.

Required selectors:

```txt
drawflow:proposal:milestone-detail-sheet
drawflow:proposal:milestone-name-input
drawflow:proposal:milestone-value-input
drawflow:proposal:milestone-duration-input
drawflow:proposal:milestone-start-date-input
drawflow:proposal:milestone-end-date-input
drawflow:proposal:milestone-draw-group-select
drawflow:proposal:milestone-delete
drawflow:proposal:milestone-duplicate
```

---

### `ProposalDependencyEditor`

Purpose: add/remove/update dependency edges.

Responsibilities:

- Searchable milestone picker.
- Edge type selector.
- Prevent cycles before persistence.
- Prevent removal of system hard dependencies.
- Visually distinguish system dependencies from user-created dependencies.

Required selectors:

```txt
drawflow:proposal:dependency-editor
drawflow:proposal:dependency-add
drawflow:proposal:dependency-source-picker
drawflow:proposal:dependency-type-select
drawflow:proposal:dependency-remove:<dependencyKey>
```

---

### `PlanningComparisonPanel`

Purpose: explicit Analyze Plan output.

Responsibilities:

- Show formal planning run.
- Show errors/warnings.
- Show current vs recommended order.
- Show current vs recommended draw groups.
- Show fee/interest/cost delta.
- Enable Apply Recommended Plan only for fresh run.

Required selectors:

```txt
drawflow:proposal:analyze-plan
drawflow:proposal:planning-panel
drawflow:proposal:recommendation-diff
drawflow:proposal:apply-recommended-plan
```

---

### `ApplyRecommendationDialog`

Purpose: confirmation dialog before applying recommendation.

Responsibilities:

- Summarize what will change.
- Require confirmation.
- Call `demo_applyProposalPlanRecommendation`.

Required selectors:

```txt
drawflow:proposal:apply-recommendation-dialog
drawflow:proposal:apply-recommendation-confirm
drawflow:proposal:apply-recommendation-cancel
```

---

### `ProposalFooterStatusRegion`

Purpose: bottom/footer summary for Proposal Builder.

Responsibilities:

- Show project value.
- Show working capital cap.
- Show draw count.
- Show flat draw fees.
- Show estimated interest.
- Show projected borrower cost.
- Show analysis status.
- Show compact Audit/Event Outbox access.

Required selectors:

```txt
drawflow:proposal:footer
drawflow:proposal:footer-cost-summary
drawflow:proposal:footer-audit
drawflow:proposal:footer-outbox
```

---

## 2.5 Active Workspace Components

### `ActiveWorkspacePage`

Purpose: route page for `/demo/drawflow/active`.

Responsibilities:

- Query `demo_getActiveWorkspace({ persona })`.
- Render Active workspace shell.
- Pass persona capabilities to controls.
- Keep persona selector deterministic.

Required selectors:

```txt
drawflow:active:page
```

---

### `ActiveMilestoneDetailSheet`

Purpose: non-modal sheet for selected active milestone.

Builder Lead controls:

- Update Progress.
- Mark Complete.
- Add Evidence.
- Add Sample Evidence.
- Submit Completion Claim.
- Requested Draw Amount input.
- View Blocking/Dependency Info.

Lender Admin controls:

- Review Evidence.
- Approve Evidence.
- Request More Information.
- Request Site Visit.
- Approve Completion.
- Reject Completion.
- Site visit override reason where applicable.

Responsibilities:

- Show disabled controls with reasons.
- Persist all domain actions through Convex.
- Never blur/darken workspace.

Required selectors:

```txt
drawflow:active:milestone-detail-sheet
drawflow:active:mark-complete
drawflow:active:submit-completion-claim
drawflow:active:requested-draw-amount
drawflow:active:approve-evidence
drawflow:active:request-site-visit
drawflow:active:approve-completion
drawflow:active:reject-completion
```

---

### `ForecastReasonDialog`

Purpose: reason modal after Active forecast drag/resize.

Responsibilities:

- Open after drag preview.
- Require non-empty reason.
- Confirm persists through `demo_updateForecastDatesWithReason`.
- Cancel reverts preview.

Required selectors:

```txt
drawflow:active:forecast-reason-dialog
drawflow:active:forecast-reason-input
drawflow:active:forecast-reason-confirm
drawflow:active:forecast-reason-cancel
```

---

### `EvidencePanel`

Purpose: evidence metadata UI.

Responsibilities:

- Real file input stores metadata only.
- Add Sample Evidence creates deterministic fake metadata.
- Remove draft evidence before submission.
- Freeze evidence after submission.
- Show count and readiness state.

Required selectors:

```txt
drawflow:active:evidence-panel
drawflow:active:evidence-upload-input
drawflow:active:add-sample-evidence
drawflow:active:evidence-count
drawflow:active:evidence-readiness
drawflow:active:evidence-remove:<evidenceFileKey>
```

---

### `RolloverBufferPanel`

Purpose: active-build underdrawn budget buffer.

Responsibilities:

- Show buffers created by lower requested draw amount.
- Show available/remaining/applied status.
- Show capital shock warning where applicable.

Required selectors:

```txt
drawflow:active:rollover-buffer-panel
drawflow:active:rollover-buffer-row:<bufferKey>
drawflow:active:capital-shock-warning
```

---

### `AssignedSiteVisitsPanel`

Purpose: focused panel for Site Visitor persona.

Responsibilities:

- List requested/claimed visits.
- Open Site Visit Drawer.
- Claim visit.

Required selectors:

```txt
drawflow:active:assigned-site-visits
drawflow:active:site-visit-row:<siteVisitKey>
drawflow:active:claim-site-visit
```

---

### `SiteVisitDrawer`

Purpose: site visitor claim/report workflow.

Fields:

- completion observed,
- notes,
- risk flags,
- recommended outcome,
- sample photos.

Responsibilities:

- Persist claim/report through Convex.
- Prevent site visitor from approving milestone completion.

Required selectors:

```txt
drawflow:active:site-visit-drawer
drawflow:active:site-visit-completion-observed
drawflow:active:site-visit-notes
drawflow:active:site-visit-risk-flags
drawflow:active:site-visit-recommended-outcome
drawflow:active:site-visit-submit-report
```

---

### `AuditDrawer`

Purpose: append-only audit display.

Responsibilities:

- Show timestamp, actor, command, event type, entity, before/after summary, validation result, correlation ID.
- Filter by milestone/draw group.
- Never allow edit/delete.

Required selectors:

```txt
drawflow:active:audit-drawer
drawflow:active:audit-filter-entity
drawflow:active:audit-row:<auditEventKey>
```

Proposal footer may reuse this drawer with proposal-specific selectors.

---

### `EventOutboxDrawer`

Purpose: mock integration event log.

Responsibilities:

- Show event type, payload preview, status, createdAt, related entity.
- Mark as mock-delivered automatically.
- Never send real network calls.

Required selectors:

```txt
drawflow:active:event-outbox-drawer
drawflow:active:outbox-row:<outboxEventKey>
```

Proposal footer may reuse this drawer with proposal-specific selectors.

---

# 3. Route and File Manifest

## 3.1 Route Manifest

Canonical routes:

```txt
/demo/drawflow/active
/demo/drawflow/proposal
```

Default landing behavior:

- `/demo/drawflow` redirects to `/demo/drawflow/active`.

Persona selection may be represented as:

```txt
/demo/drawflow/active?persona=builder_lead
/demo/drawflow/active?persona=lender_admin
/demo/drawflow/active?persona=site_visitor
```

If the existing app uses a different query-param convention, adapt the exact URL mechanism but preserve behavior.

---

## 3.2 Suggested Route Files

Assuming TanStack Start / file-based routing:

```txt
src/routes/demo/drawflow/index.tsx
src/routes/demo/drawflow/active.tsx
src/routes/demo/drawflow/proposal.tsx
```

Responsibilities:

### `src/routes/demo/drawflow/index.tsx`

- Redirect to `/demo/drawflow/active`.

### `src/routes/demo/drawflow/active.tsx`

- Parse persona param.
- Default persona to `builder_lead`.
- Render `ActiveWorkspacePage`.

### `src/routes/demo/drawflow/proposal.tsx`

- Render `ProposalWorkspacePage`.

If the repository uses a generated route tree, update the route tree according to existing conventions.

---

## 3.3 Suggested Feature Directory

```txt
src/features/drawflow-demo/
  README.md
  types.ts
  constants.ts
  formatters.ts
  dateMath.ts

  pages/
    ActiveWorkspacePage.tsx
    ProposalWorkspacePage.tsx

  layout/
    DrawFlowDemoLayout.tsx
    DrawFlowTopBar.tsx
    DemoScenarioLinks.tsx
    DemoResetControls.tsx
    FooterStatusRegion.tsx

  shared/
    BlockingReasonChips.tsx
    MoneyText.tsx
    StatusChip.tsx
    ValidationPanel.tsx
    ConfirmDialog.tsx
    EmptyState.tsx
    TooltipOrPopover.tsx

  gantt/
    GanttWorkspaceFrame.tsx
    GanttToolbar.tsx
    TimeResolutionControl.tsx
    ColumnSizeSlider.tsx
    MilestoneRailPane.tsx
    MilestoneCard.tsx
    RailCardLayer.tsx
    RailCard.tsx
    DateRunners.tsx
    DrawGroupBoxLayer.tsx
    DrawGroupBox.tsx
    DependencyHighlightOverlay.tsx
    ganttGeometry.ts
    dragUtils.ts

  proposal/
    ProposalTopBar.tsx
    ProposalSetupDrawer.tsx
    ProposalMilestoneDetailSheet.tsx
    ProposalDependencyEditor.tsx
    PlanningComparisonPanel.tsx
    ApplyRecommendationDialog.tsx
    ProposalFooterStatusRegion.tsx
    DrawGroupEditorPanel.tsx

  active/
    ActiveTopBar.tsx
    PersonaSelector.tsx
    ActiveMilestoneDetailSheet.tsx
    ForecastReasonDialog.tsx
    EvidencePanel.tsx
    RequestedDrawAmountInput.tsx
    RolloverBufferPanel.tsx
    LenderReviewPanel.tsx
    AssignedSiteVisitsPanel.tsx
    SiteVisitDrawer.tsx
    CompletionApprovalPanel.tsx
    AuditDrawer.tsx
    EventOutboxDrawer.tsx

  hooks/
    useDrawFlowWorkspace.ts
    useGanttViewState.ts
    useMilestoneSelection.ts
    useProposalJitAnalysis.ts
    useDragRailCard.ts
```

Rules:

- Components may be reorganized to match repo conventions.
- Keep proposal-specific and active-specific components separated.
- Keep Gantt geometry logic outside React components where practical.
- Keep Convex API calls in pages/hooks, not deep leaf rendering components, unless the existing codebase convention favors colocated mutations.

---

## 3.4 Convex File Manifest

```txt
convex/demo_drawflow/
  domain.ts
  seedData.ts
  seed.ts
  queries.ts
  mutations.ts
  engine.ts
  projections.ts
  audit.ts
  outbox.ts
  money.ts
  dateMath.ts
```

### `domain.ts`

- Type unions.
- Constants.
- Demo keys.
- Shared validators where useful.

### `seedData.ts`

- Canonical milestone catalog.
- Dependency edge catalog.
- Proposal seed grouping.
- Active seed grouping.
- Fixed seed dates.

### `seed.ts`

- `demo_seedDrawFlowDemo`.
- `demo_cleanupDrawFlowDemo`.
- `demo_resetDrawFlowDemo`.

### `queries.ts`

- Workspace/detail/audit/outbox/planning queries.

### `mutations.ts`

- Proposal and active mutations.

### `engine.ts`

- Deterministic validation/recompute/optimizer helpers.

### `projections.ts`

- Convert tables + engine output into `DemoWorkspaceProjection`.

### `audit.ts`

- Append audit helpers.
- Correlation ID helpers.

### `outbox.ts`

- Append mock outbox event helpers.
- Mark mock-delivered helpers.

### `money.ts`

- Cents math.
- Interest formula.
- Formatting helpers if server-side needed.

### `dateMath.ts`

- ISO date helpers.
- Inclusive date diff.
- Add days.
- Capital-constrained cascade date math.

---

## 3.5 Test File Manifest

```txt
tests/e2e/drawflow/
  drawflow.fixtures.ts
  drawflow.selectors.ts
  drawflow.drag.ts
  active.workspace.spec.ts
  active.workflow.spec.ts
  active.audit-outbox.spec.ts
  proposal.workspace.spec.ts
  proposal.gantt.spec.ts
  proposal.planning.spec.ts
  proposal.submit.spec.ts
```

Suggested grouping:

### `active.workspace.spec.ts`

- scenario route link,
- persona switching,
- milestone selection,
- date runners,
- rail collapse,
- Gantt resolution,
- column size slider,
- draw group geometry.

### `active.workflow.spec.ts`

- mark complete,
- add evidence,
- submit claim,
- approve evidence,
- request site visit,
- site visitor report,
- approve completion,
- auto release draw.

### `active.audit-outbox.spec.ts`

- audit filtering,
- outbox display,
- reset behavior.

### `proposal.workspace.spec.ts`

- proposal milestone selection,
- reorder,
- add milestone,
- edit values/duration,
- detail sheet behavior.

### `proposal.gantt.spec.ts`

- rail-card move,
- resize start,
- resize end,
- capital cascade,
- draw group geometry.

### `proposal.planning.spec.ts`

- dependency add,
- cycle rejection,
- system dependency removal blocked,
- analyze plan,
- apply recommendation.

### `proposal.submit.spec.ts`

- submit blocked,
- submit success/read-only/audit/outbox.

---

# 4. Playwright Fixture Strategy

## 4.1 Core Principle

E2E tests use the real app and live Convex demo functions.

Do not mock Convex for these tests.

Do not use browser-only fake state for assertions.

The test suite resets Convex demo state before each test or test group.

---

## 4.2 Serial Execution

Because the demo uses deterministic demo keys and shared Convex demo tables, run DrawFlow E2E tests with one worker unless explicit per-test isolation keys are added.

Recommended Playwright project config:

```ts
{
  name: "drawflow-demo",
  testDir: "tests/e2e/drawflow",
  fullyParallel: false,
  workers: 1,
}
```

This avoids tests racing against shared seeded state.

---

## 4.3 Convex Reset Fixture

Create a fixture that calls `demo_resetDrawFlowDemo` directly before tests.

Suggested API:

```ts
type DrawFlowScenario = "proposal" | "active" | "all";

async function resetDrawFlowDemo(scenarioKey: DrawFlowScenario = "all") {
  // Use Convex HTTP client or the repo's existing Convex test helper.
  // Call api.demo_drawflow.seed.demo_resetDrawFlowDemo({ scenarioKey }).
}
```

Pseudo-structure:

```ts
import { test as base, expect } from "@playwright/test";

export const test = base.extend<{
  resetDrawFlow: (scenario?: "proposal" | "active" | "all") => Promise<void>;
  gotoActive: (persona?: "builder_lead" | "lender_admin" | "site_visitor") => Promise<void>;
  gotoProposal: () => Promise<void>;
}>({
  resetDrawFlow: async ({}, use) => {
    await use(async (scenario = "all") => {
      // await convex.mutation(api.demo_drawflow.seed.demo_resetDrawFlowDemo, { scenarioKey: scenario });
    });
  },

  gotoActive: async ({ page }, use) => {
    await use(async (persona = "builder_lead") => {
      await page.goto(`/demo/drawflow/active?persona=${persona}`);
      await expect(page.getByTestId("drawflow:active:page")).toBeVisible();
    });
  },

  gotoProposal: async ({ page }, use) => {
    await use(async () => {
      await page.goto("/demo/drawflow/proposal");
      await expect(page.getByTestId("drawflow:proposal:page")).toBeVisible();
    });
  },
});
```

Do not click UI reset before every test. Direct reset is faster and less flaky.

Still implement and test the UI reset once through `IC-ACT-DEMO-RESET`.

---

## 4.4 Test Data Clock

Tests must not depend on the real current date.

The app should use seeded demo dates for all demo schedule labels:

```ts
DEMO_TODAY = "2026-05-08"
```

Tests may assert visible labels like `Today`, but not the real system date.

If any UI logic needs `today`, route it through a demo constant/helper rather than `new Date()`.

---

## 4.5 JIT Analysis Waiting Strategy

Proposal Builder JIT analysis has a 2–3 second debounce.

Tests must not use arbitrary sleeps unless there is no alternative.

Required UI state:

```txt
drawflow:proposal:analysis-status
```

Expected states:

- `idle`
- `pending`
- `analyzing`
- `fresh`
- `stale`
- `failed`

Tests should wait for fresh analysis:

```ts
await expect(page.getByTestId("drawflow:proposal:analysis-status")).toContainText("Analyzing");
await expect(page.getByTestId("drawflow:proposal:analysis-status")).toContainText("Fresh", {
  timeout: 7000,
});
```

If the implementation uses icon-only status, expose accessible text or `aria-label`.

---

## 4.6 Drag Helpers

Create deterministic drag helpers. Do not repeat raw mouse math in every test.

Suggested helper file:

```txt
tests/e2e/drawflow/drawflow.drag.ts
```

Suggested functions:

```ts
async function dragRailCardRightEdgeToDate(page, mode, milestoneKey, targetDateLabel) {}
async function dragRailCardLeftEdgeToDate(page, mode, milestoneKey, targetDateLabel) {}
async function dragRailCardBodyByColumns(page, mode, milestoneKey, columnDelta) {}
async function dragMilestoneCardToPosition(page, milestoneKey, targetIndex) {}
```

Requirements:

- Use `data-testid` selectors.
- Use bounding boxes from the actual browser layout.
- Assert the handle is visible before dragging.
- Assert the relevant Convex-backed UI state changed after drag.
- For Active forecast drag, complete the reason modal.

Do not test drag behavior only by checking that mouse events fired.

---

## 4.7 Selector Strategy

Prefer `getByTestId`.

Use accessible role selectors for ordinary buttons when stable:

```ts
page.getByRole("button", { name: "Submit Proposal" })
```

Still provide test IDs for domain-critical controls because labels may change during UI polish.

Required selector helpers:

```ts
export const drawflow = {
  activePage: "drawflow:active:page",
  proposalPage: "drawflow:proposal:page",
  milestoneCard: (mode: string, key: string) => `drawflow:${mode}:milestone-card:${key}`,
  railCard: (mode: string, key: string) => `drawflow:${mode}:rail-card:${key}`,
  drawGroupBox: (mode: string, key: string) => `drawflow:${mode}:draw-group-box:${key}`,
};
```

---

## 4.8 Assertion Levels

Each behavioral test should assert at least three levels where applicable:

1. Visible UI state changed.
2. Derived projection changed.
3. Audit/outbox record exists for material domain commands.

Example for `IC-ACT-SUBMIT-COMPLETION-CLAIM`:

- UI: Foundation status is Submitted for Review.
- UI: evidence remove button disabled.
- UI: rollover buffer appears when requested amount < approved value.
- Audit: `CompletionClaimSubmitted` exists.
- Outbox: `demo.milestone.completionClaimSubmitted` exists.

Direct Convex query assertions are allowed when visible UI is insufficient, but tests should still assert user-visible behavior.

---

## 4.9 Smoke Tests Are Not Coverage

A smoke test may exist, but it does not satisfy interaction coverage.

Forbidden as primary coverage:

```ts
test("renders workspace", async ({ page }) => {
  await page.goto("/demo/drawflow/active");
  await expect(page.getByText("Maple Ridge Townhomes")).toBeVisible();
});
```

Acceptable smoke test only if paired with behavior tests:

```ts
test("active workspace loads seeded Draw 2 active state", async ({ page, resetDrawFlow, gotoActive }) => {
  await resetDrawFlow("active");
  await gotoActive("builder_lead");
  await expect(page.getByTestId("drawflow:active:draw-group-box:active-draw-2")).toBeVisible();
  await expect(page.getByTestId("drawflow:active:milestone-card:foundation")).toContainText("Behind");
});
```

---

## 4.10 Required Test Naming Rule

Every Playwright test title must start with the interaction contract ID.

Examples:

```ts
test("IC-ACT-MILESTONE-MARK-COMPLETE marks Foundation complete but keeps claim blocked until evidence exists", async () => {})
test("IC-PROP-GANTT-RESIZE-END changes end date, duration, draw box, and audit log", async () => {})
```

This creates requirement-to-verification mapping.

---

# 5. Final Coverage Matrix Format

The coding agent must produce a final coverage matrix after implementation.

The matrix is mandatory and should be committed as:

```txt
docs/drawflow-demo/COVERAGE_MATRIX.md
```

## 5.1 Interactive Control Coverage Matrix

Every visible interactive control must have a row.

Columns:

| Column | Meaning |
|---|---|
| `Control ID` | Stable identifier, usually test ID or semantic control name. |
| `Component` | Component that renders it. |
| `Route` | `/demo/drawflow/active`, `/demo/drawflow/proposal`, or shared. |
| `Mode` | `active`, `proposal`, or shared. |
| `Persona / Permission` | Persona required, or `view-state-only`, or `all`. |
| `Visible When` | Condition for visibility. |
| `Enabled When` | Condition for enabled state. |
| `Disabled Reason` | Exact user-facing explanation when disabled. |
| `User Action` | Click, drag, type, select, resize, etc. |
| `Handler` | React handler or hook name. |
| `Convex Function` | `demo_` function called, or `N/A — view state only`. |
| `Tables Mutated` | Demo tables affected, or `None`. |
| `Derived Projection Updated` | Projection fields updated. |
| `Audit Event` | Audit event emitted, or `N/A — view state only`. |
| `Outbox Event` | Outbox event emitted, or `N/A`. |
| `Primary Test` | Playwright test name starting with IC ID. |
| `Status` | `implemented`, `deferred-disabled`, or `removed`. |

Rules:

- No enabled control may have `Convex Function = TBD`.
- No enabled control may have `Primary Test = TBD`.
- `N/A — view state only` is acceptable for controls like time resolution and column size slider.
- `deferred-disabled` is acceptable only when the control is visibly disabled and explains why.
- `removed` is acceptable if the visible control was removed from the UI.

Example:

| Control ID | Component | Route | Mode | Persona / Permission | Visible When | Enabled When | Disabled Reason | User Action | Handler | Convex Function | Tables Mutated | Derived Projection Updated | Audit Event | Outbox Event | Primary Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `drawflow:active:mark-complete` | `ActiveMilestoneDetailSheet` | `/demo/drawflow/active` | active | Builder Lead | selected milestone in active draw | milestone is in progress and unblocked | `Milestone is blocked by hard dependency.` | click | `onMarkComplete` | `demo_updateMilestoneProgress` | `demo_milestones`, `demo_auditEvents` | milestone status, draw group status, submission readiness | `MilestoneMarkedComplete` | N/A | `IC-ACT-MILESTONE-MARK-COMPLETE marks Foundation complete but keeps claim blocked until evidence exists` | implemented |
| `drawflow:shared:column-size-slider` | `ColumnSizeSlider` | shared | shared | view-state-only | Gantt visible | always | N/A | drag | `setColumnScale` | `N/A — view state only` | None | rendered geometry only | N/A | N/A | `IC-ACT-GANTT-COLUMN-SIZE-SLIDER widens time columns without changing active resolution or persisted dates` | implemented |

---

## 5.2 Projection Coverage Matrix

Non-interactive derived visual elements also require coverage when they encode business logic.

Columns:

| Column | Meaning |
|---|---|
| `Projection Element` | Visual/business projection. |
| `Source Tables` | Tables used. |
| `Engine Helper` | Helper that computes it. |
| `Rendered By` | Component. |
| `Business Rule` | Rule being represented. |
| `Test` | Playwright test proving it updates. |

Required projection rows:

| Projection Element | Source Tables | Engine Helper | Rendered By | Business Rule | Test |
|---|---|---|---|---|---|
| Active draw group box geometry | `demo_drawGroups`, `demo_milestones` | `computeWorkspaceProjection` / Gantt geometry | `DrawGroupBoxLayer` | Box spans earliest/latest date and first/last row | `IC-ACT-DRAW-GROUP-BOX-GEOMETRY encloses all milestones in the draw group and keeps label clear of cards` |
| Proposal draw group cap error | `demo_drawGroups`, `demo_milestones` | `validateConstructionInvariants` | `ValidationPanel` | Draw group over CAD $260k blocks submit | `IC-PROP-EDIT-VALUE updates draw group total and blocks when over cap` |
| Active Framing capital blocker | `demo_drawGroups`, `demo_milestones` | `computeBlockingReasons` | `BlockingReasonChips` | Future draw blocked until previous draw release-approved | `IC-ACT-DRAW-GROUP-AUTO-RELEASE release-approves Draw 2 and unblocks Draw 3 capital after final milestone approval` |
| Cost summary | `demo_drawGroups`, `demo_milestones`, `demo_rolloverBuffers`, `demo_policySnapshots` | `computeFinancingCostEstimate` | `FooterStatusRegion` | Interest/fees derive from requested amounts and dates | `IC-PROP-SPLIT-DRAW-GROUP increases fee count and recomputes financing cost` |

The final implementation report must include all projection elements that encode non-trivial domain behavior.

---

## 5.3 Test Coverage Summary

The agent must include a summary table:

| Area | Required Tests | Implemented Tests | Passing? | Notes |
|---|---:|---:|---|---|
| Active shell/navigation/persona | N | N | yes/no | |
| Active Gantt/layout | N | N | yes/no | |
| Active claim/review/site visit/approval | N | N | yes/no | |
| Active audit/outbox/reset | N | N | yes/no | |
| Proposal shell/detail/editing | N | N | yes/no | |
| Proposal Gantt/cascade | N | N | yes/no | |
| Proposal planning/dependencies | N | N | yes/no | |
| Proposal submit | N | N | yes/no | |

Any missing required test must be listed with reason. `Ran out of time` is not an acceptable reason for calling the implementation complete.

---

# 6. Agent Instruction Block

Use this block as the coding-agent prompt.

```md
You are implementing the DrawFlow Core Build Workspace demo.

The goal is a functional Convex-backed demo, not a static UI mock.

Read and follow:
1. DrawFlow Demo Interaction Specification.
2. DrawFlow Demo Implementation Companion.
3. Existing AGENTS.md / repository conventions.

Non-negotiable rules:
- Convex is the domain source of truth.
- Do not use Zustand for domain state.
- Every demo table starts with `demo_`.
- Every public demo Convex function starts with `demo_`.
- Every visible enabled control must have a real handler.
- No dummy buttons.
- No dummy drag handles.
- No enabled control may only toast/log/console.
- No TODO comments in behavior paths.
- No render-only tests counted as coverage.
- Active Build baseline dates are immutable.
- Active forecast drag mutates forecast only and requires reason.
- Proposal drag/resize persists draft dates and triggers debounced JIT analysis.
- Proposal starts messy and surfaces validation errors; do not silently fix the initial proposal.
- System hard dependencies on seeded milestones cannot be removed.
- Proposal submit is blocked by hard errors, cycles, draw group over cap, zero values, invalid dates, or stale analysis.
- Active completion approval requires accepted evidence and required site visit or override reason.
- Draw 2 auto release-approves when all included milestones are completion-approved.
- Draw 3/Framing must lose capital_blocked after Draw 2 release approval.

Implementation order:
1. Inspect the existing repo structure, package manager, routing convention, Convex convention, UI component convention, and test convention.
2. Add Convex schema tables for all `demo_` tables.
3. Add `convex/demo_drawflow/domain.ts`, `seedData.ts`, `seed.ts`, `engine.ts`, `projections.ts`, `queries.ts`, `mutations.ts`, `audit.ts`, `outbox.ts`, `money.ts`, and `dateMath.ts` or nearest repo-equivalent layout.
4. Implement deterministic seed/reset first.
5. Implement workspace projection queries next.
6. Implement proposal mutations and JIT planning.
7. Implement active mutations and automatic draw release recomputation.
8. Implement route pages.
9. Implement shared Gantt layout and geometry.
10. Implement Active Workspace interactions.
11. Implement Proposal Builder interactions.
12. Implement audit/outbox drawers or footer panels.
13. Implement Playwright fixtures and required behavior tests.
14. Produce final coverage matrix.

Verification requirements:
- Run typecheck.
- Run lint.
- Run unit tests if present.
- Run Playwright E2E tests for DrawFlow.
- If a command is unavailable, document the exact command attempted and the error.
- Do not claim tests passed unless they actually passed.

Final response must include:
- Summary of implemented functionality.
- Commands run and results.
- Path to coverage matrix.
- Any deviations from spec.
- Any controls intentionally disabled and why.
- Confirmation that no enabled controls are no-ops.
```

---

# 7. Anti-Punting Checklist

Before declaring completion, the agent must answer every line.

## 7.1 Static Control Audit

- [ ] I searched the implementation for `Coming soon`.
- [ ] I searched the implementation for `TODO`.
- [ ] I searched the implementation for `console.log` in behavior paths.
- [ ] I clicked every visible enabled button in Active Workspace.
- [ ] I clicked every visible enabled button in Proposal Builder.
- [ ] I verified every visible drag handle actually drags.
- [ ] I verified no Active milestone-card reorder handle is visible.
- [ ] I verified Proposal milestone-card reorder works.
- [ ] I verified rail-card edge handles appear only when implemented.
- [ ] I verified disabled controls show reasons.

## 7.2 Convex Audit

- [ ] All demo tables start with `demo_`.
- [ ] All public demo functions start with `demo_`.
- [ ] Seed/reset is idempotent.
- [ ] Proposal and Active scenarios are isolated.
- [ ] Queries return projections, not raw tables only.
- [ ] Every material mutation writes audit.
- [ ] Required external-like events write outbox entries.
- [ ] Outbox uses mock delivery only; no real network calls.
- [ ] Active baseline dates are not mutated by forecast changes.
- [ ] System hard dependencies cannot be removed.

## 7.3 Proposal Behavior Audit

- [ ] Proposal loads all 44 legible milestones.
- [ ] Proposal starts in builder-provided messy order.
- [ ] Initial JIT analysis shows spinner then warnings/errors.
- [ ] Add milestone creates selected custom zero-value milestone.
- [ ] Zero-value milestone blocks submit.
- [ ] Reorder milestone-card changes proposal sort order.
- [ ] Rail-card body drag persists date changes.
- [ ] Rail-card left resize persists start/duration.
- [ ] Rail-card right resize persists end/duration.
- [ ] Draw group boxes enclose all rows in group.
- [ ] Extending draw group pushes later draw groups.
- [ ] Reducing draw group can pull later groups earlier.
- [ ] Editing value updates draw group total.
- [ ] Over CAD $260k draw group blocks submit.
- [ ] Dependency cycle is rejected before persistence.
- [ ] System hard dependency remove is blocked.
- [ ] Analyze Plan creates recommendation without mutating current plan.
- [ ] Apply Recommended Plan mutates order/dates/groups.
- [ ] Submit Proposal freezes proposal and writes audit/outbox.

## 7.4 Active Behavior Audit

- [ ] Active route loads Draw 1 historical, Draw 2 active, Draw 3 future.
- [ ] Framing initially shows capital_blocked and hard_dependency_blocked.
- [ ] Clicking milestone-card opens detail sheet without blurring workspace.
- [ ] Clicking rail-card shows date runners.
- [ ] Active forecast drag opens reason modal.
- [ ] Cancelling reason modal reverts drag preview.
- [ ] Confirming reason persists forecast only, never baseline.
- [ ] Extending Draw 2 pushes Draw 3.
- [ ] Mark Complete changes status but claim remains blocked without evidence.
- [ ] Add Sample Evidence creates deterministic metadata.
- [ ] Real upload stores metadata only.
- [ ] Submit Completion Claim freezes evidence.
- [ ] Lower requested amount creates rollover buffer.
- [ ] Builder cannot approve completion.
- [ ] Lender Admin can approve evidence without approving completion.
- [ ] Foundation requires site visit unless override reason supplied.
- [ ] Site Visitor can claim and submit site visit.
- [ ] Site Visitor cannot approve completion.
- [ ] Lender Admin approval of Foundation unblocks Underground Plumbing.
- [ ] Final Draw 2 milestone approval auto release-approves Draw 2.
- [ ] Draw 2 release approval removes capital_blocked from Framing.

## 7.5 Layout Audit

- [ ] Gantt uses full available width.
- [ ] Gantt is horizontally scrollable.
- [ ] Gantt is vertically scrollable.
- [ ] Milestone rail is collapsible.
- [ ] Collapsing rail expands Gantt.
- [ ] Draw group labels do not overlap rail-cards.
- [ ] Draw group boxes use same coordinate model as rail-cards.
- [ ] Time resolution control works.
- [ ] Column size slider works without changing resolution.
- [ ] Selected milestone remains coherent after scroll/collapse/resize.

## 7.6 Playwright Audit

- [ ] Every test title starts with an interaction contract ID.
- [ ] Tests reset Convex state directly.
- [ ] DrawFlow tests run serially or use explicit per-test isolation.
- [ ] Active shell tests pass.
- [ ] Active Gantt/layout tests pass.
- [ ] Active workflow tests pass.
- [ ] Active audit/outbox/reset tests pass.
- [ ] Proposal workspace tests pass.
- [ ] Proposal Gantt tests pass.
- [ ] Proposal planning tests pass.
- [ ] Proposal submit tests pass.
- [ ] No render-only smoke test is counted as feature coverage.

---

# 8. Definition of Done

The demo is complete only when all of the following are true:

1. Both routes exist:
   - `/demo/drawflow/active`
   - `/demo/drawflow/proposal`

2. Convex demo schema/functions exist and use required `demo_` prefixes.

3. Seed/reset can restore canonical Proposal and Active states.

4. Active Workspace supports:
   - persona-specific controls,
   - milestone selection,
   - Gantt selection/date runners,
   - forecast drag with reason,
   - evidence,
   - completion claim,
   - lender review,
   - site visit,
   - completion approval,
   - automatic draw release,
   - rollover buffer,
   - audit/outbox.

5. Proposal Builder supports:
   - editable milestones,
   - milestone-card reorder,
   - rail-card drag/resize,
   - detail-sheet edits,
   - dependencies,
   - JIT analysis,
   - Analyze Plan,
   - Apply Recommendation,
   - split/merge draw groups,
   - capital cascade,
   - submit blocked/success flows.

6. All required Playwright interaction tests pass.

7. Coverage matrix is complete.

8. No enabled UI control is a no-op.

9. No visible drag handle is fake.

10. The agent final report honestly lists any deviations.
