# Build Workspace Chunk Manifest

Chunks are grouped execution packets. Each chunk file is intentionally compact and points back to exact source ranges instead of duplicating source prose.

| Chunk | Title | Depends on | IC count | Target file |
| --- | --- | --- | --- | --- |
| CH-00 | Preflight Repo Context | None | 0 | docs/build_workspace_demo/traceability/chunks/CH-00-preflight-repo-context.md |
| CH-01 | Domain Seed Schema | CH-00 | 0 | docs/build_workspace_demo/traceability/chunks/CH-01-domain-seed-schema.md |
| CH-02 | Engine Projections Costs | CH-01 | 0 | docs/build_workspace_demo/traceability/chunks/CH-02-engine-projections-costs.md |
| CH-03 | Routes Layout Gantt Foundation | CH-01, CH-02 | 0 | docs/build_workspace_demo/traceability/chunks/CH-03-routes-layout-gantt-foundation.md |
| CH-04 | Active Selection Gantt Forecast | CH-01, CH-02, CH-03 | 10 | docs/build_workspace_demo/traceability/chunks/CH-04-active-selection-gantt-forecast.md |
| CH-05 | Active Evidence Review Release | CH-01, CH-02, CH-03, CH-04 | 16 | docs/build_workspace_demo/traceability/chunks/CH-05-active-evidence-review-release.md |
| CH-06 | Proposal Editing Dependencies | CH-01, CH-02, CH-03 | 11 | docs/build_workspace_demo/traceability/chunks/CH-06-proposal-editing-dependencies.md |
| CH-07 | Proposal Planning Submit | CH-01, CH-02, CH-03, CH-06 | 7 | docs/build_workspace_demo/traceability/chunks/CH-07-proposal-planning-submit.md |
| CH-08 | Playwright Coverage Definition Of Done | CH-01, CH-02, CH-03, CH-04, CH-05, CH-06, CH-07 | 44 | docs/build_workspace_demo/traceability/chunks/CH-08-playwright-coverage-dod.md |
| CH-09 | Visual Parity Mockup | CH-03, CH-04, CH-06 | 6 | docs/build_workspace_demo/traceability/chunks/CH-09-visual-parity-mockup.md |

## Chunk Details

### CH-00: Preflight Repo Context

**Source refs**
- prd 12-25: Product truth: DrawFlow is construction draw-management, not generic project management.
- implementationCompanion 19-91: Non-negotiable persistence, naming, selector, and no-fake-affordance rules.
- mockup n/a: Mockup metadata and visual target.
- repo n/a: Current starter-shell, Convex, generated-file, and test infrastructure facts.

**Interaction contracts**
- None
**Companion components**
- None
**Convex files**
- None
**Route files**
- None
**Test files**
- None
**Acceptance gates**
- Record Bun as package manager/runtime.
- Record missing convex/_generated/ai/guidelines.md as a later implementation preflight finding.
- Record absence of Playwright config and current starter shell routes.
- Record mockup dimensions 1995x1106.

### CH-01: Domain Seed Schema

**Source refs**
- interactionSpec 16-254: Runtime, mode, role, evidence, audit, and forbidden-shortcut decisions.
- interactionSpec 255-543: Canonical milestone catalog, active/proposal seed state, draw grouping, and happy path.
- interactionSpec 3567-4796: Final Convex schema, function, seed, and guardrail contract.
- implementationCompanion 1110-1188: Companion Convex file split.

**Interaction contracts**
- None
**Companion components**
- None
**Convex files**
- convex/schema.ts
- convex/demo_drawflow/domain.ts
- convex/demo_drawflow/seedData.ts
- convex/demo_drawflow/seed.ts
**Route files**
- None
**Test files**
- None
**Acceptance gates**
- All final Round 6 demo tables are represented; do not include superseded demo_buildScenarios as a required table.
- All public demo Convex functions use demo_ prefix.
- Seed/reset is idempotent and deterministic with DEMO_TODAY = 2026-05-08.
- All monetary persistence uses integer cents.

### CH-02: Engine Projections Costs

**Source refs**
- interactionSpec 544-650: Dependency, blocker, and recompute semantics.
- interactionSpec 651-741: Interest, fee, payoff, and bottom summary formulas.
- interactionSpec 742-804: Active-only rollover and capital shock guardrail.
- interactionSpec 4481-4533: Required query projection shape and derived fields.
- implementationCompanion 1573-1600: Projection coverage expectations.

**Interaction contracts**
- None
**Companion components**
- None
**Convex files**
- convex/demo_drawflow/engine.ts
- convex/demo_drawflow/projections.ts
- convex/demo_drawflow/money.ts
- convex/demo_drawflow/dateMath.ts
**Route files**
- None
**Test files**
- None
**Acceptance gates**
- Engine helpers are deterministic and do not use the real current date.
- Projection contains derived blockers/capabilities; UI does not reconstruct raw domain rules.
- Cost formula uses daily compounding and rounded cents at persistence/display boundary.
- Rollover buffer cannot overfund project or violate max-cash-on-hand guardrail.

### CH-03: Routes Layout Gantt Foundation

**Source refs**
- interactionSpec 987-1007: Route/screen inventory.
- interactionSpec 1056-1508: Active workspace shell, selection, Gantt, draw-group geometry, and controls.
- implementationCompanion 92-964: Component layering and shared layout/Gantt component responsibilities.
- implementationCompanion 965-1265: Route and feature directory manifest.

**Interaction contracts**
- None
**Companion components**
- DrawFlowDemoLayout
- DrawFlowTopBar
- DemoScenarioLinks
- PersonaSelector
- DemoResetControls
- GanttWorkspaceFrame
- MilestoneRailPane
- MilestoneCard
- GanttToolbar
- RailCardLayer
- RailCard
- DateRunners
- DrawGroupBoxLayer
- BlockingReasonChips
- ValidationPanel
**Convex files**
- None
**Route files**
- src/routes/demo/drawflow/index.tsx
- src/routes/demo/drawflow/active.tsx
- src/routes/demo/drawflow/proposal.tsx
**Test files**
- None
**Acceptance gates**
- Shared route shell is real navigation, not tab-only state.
- Gantt is full-width, horizontally and vertically scrollable, and rail-collapsible.
- Rail-cards and draw-group boxes use one coordinate model.
- View-state controls never mutate Convex domain state.

### CH-04: Active Selection Gantt Forecast

**Source refs**
- interactionSpec 1056-1508: Active workspace interaction model.
- interactionSpec 1509-2453: Active shell, selection, Gantt, and forecast contracts.
- interactionSpec 2454-2486: Required active shell/Gantt tests.

**Interaction contracts**
- IC-ACT-SHELL-SCENARIO-LINK
- IC-ACT-SHELL-PERSONA-SELECT
- IC-ACT-MILESTONE-CARD-SELECT
- IC-ACT-RAIL-CARD-SELECT-DATE-RUNNERS
- IC-ACT-GANTT-RESOLUTION-CHANGE
- IC-ACT-GANTT-COLUMN-SIZE-SLIDER
- IC-ACT-MILESTONE-RAIL-COLLAPSE
- IC-ACT-DRAW-GROUP-BOX-GEOMETRY
- IC-ACT-GANTT-FORECAST-RESIZE-END
- IC-ACT-GANTT-FORECAST-INVALID-BLOCKS-SUBMIT
**Companion components**
- ActiveWorkspacePage
- ActiveMilestoneDetailSheet
- ForecastReasonDialog
- GanttWorkspaceFrame
- MilestoneRailPane
- MilestoneCard
- RailCard
- DateRunners
- DrawGroupBoxLayer
- ValidationPanel
**Convex files**
- convex/demo_drawflow/queries.ts
- convex/demo_drawflow/mutations.ts
- convex/demo_drawflow/audit.ts
- convex/demo_drawflow/outbox.ts
**Route files**
- src/routes/demo/drawflow/active.tsx
**Test files**
- active.workspace.spec.ts
**Acceptance gates**
- Selection opens non-modal detail sheet and highlights dependency neighborhood.
- Active forecast drag persists forecast only after required reason.
- Invalid forecast blocks claim submission with explicit reason.
- Shared Gantt controls leave domain dates unchanged.

### CH-05: Active Evidence Review Release

**Source refs**
- interactionSpec 1509-2453: Active evidence, review, site visit, approval, release, audit, outbox, and reset contracts.
- interactionSpec 2454-2486: Required active workflow/audit/outbox/reset tests.
- implementationCompanion 739-964: Active component responsibilities and selectors.

**Interaction contracts**
- IC-ACT-MILESTONE-MARK-COMPLETE
- IC-ACT-EVIDENCE-ADD-SAMPLE
- IC-ACT-EVIDENCE-UPLOAD-METADATA
- IC-ACT-EVIDENCE-REMOVE-DRAFT
- IC-ACT-SUBMIT-COMPLETION-CLAIM
- IC-ACT-LENDER-APPROVE-EVIDENCE
- IC-ACT-LENDER-REQUEST-SITE-VISIT
- IC-ACT-SITE-VISITOR-CLAIM-VISIT
- IC-ACT-SITE-VISITOR-SUBMIT-REPORT
- IC-ACT-LENDER-APPROVE-COMPLETION
- IC-ACT-LENDER-APPROVE-COMPLETION-WITH-SITE-VISIT-OVERRIDE
- IC-ACT-LENDER-REJECT-COMPLETION
- IC-ACT-DRAW-GROUP-AUTO-RELEASE
- IC-ACT-AUDIT-DRAWER-FILTER
- IC-ACT-EVENT-OUTBOX-VIEW
- IC-ACT-DEMO-RESET
**Companion components**
- ActiveMilestoneDetailSheet
- EvidencePanel
- RolloverBufferPanel
- AssignedSiteVisitsPanel
- SiteVisitDrawer
- AuditDrawer
- EventOutboxDrawer
- DemoResetControls
**Convex files**
- convex/demo_drawflow/mutations.ts
- convex/demo_drawflow/audit.ts
- convex/demo_drawflow/outbox.ts
- convex/demo_drawflow/projections.ts
**Route files**
- src/routes/demo/drawflow/active.tsx
**Test files**
- active.workflow.spec.ts
- active.audit-outbox.spec.ts
**Acceptance gates**
- All persona permissions are enforced as demo validation rules.
- Evidence submission freezes package and lower requests create rollover buffers.
- Foundation requires accepted evidence and site visit or override before approval.
- Draw 2 auto release-approves and removes Framing capital blocker after final milestone approval.

### CH-06: Proposal Editing Dependencies

**Source refs**
- interactionSpec 2487-2818: Proposal builder interaction model.
- interactionSpec 2819-3541: Proposal selection, editing, Gantt, add, value/duration, and dependency contracts.
- implementationCompanion 543-738: Proposal component responsibilities and selectors.

**Interaction contracts**
- IC-PROP-MILESTONE-CARD-SELECT
- IC-PROP-MILESTONE-REORDER
- IC-PROP-GANTT-MOVE
- IC-PROP-GANTT-RESIZE-START
- IC-PROP-GANTT-RESIZE-END
- IC-PROP-ADD-MILESTONE
- IC-PROP-EDIT-VALUE
- IC-PROP-EDIT-DURATION
- IC-PROP-DEPENDENCY-ADD
- IC-PROP-DEPENDENCY-CYCLE
- IC-PROP-SYSTEM-DEPENDENCY-REMOVE-BLOCKED
**Companion components**
- ProposalWorkspacePage
- ProposalMilestoneDetailSheet
- ProposalDependencyEditor
- MilestoneRailPane
- MilestoneCard
- RailCard
- DrawGroupBoxLayer
- ValidationPanel
- ProposalFooterStatusRegion
**Convex files**
- convex/demo_drawflow/mutations.ts
- convex/demo_drawflow/engine.ts
- convex/demo_drawflow/audit.ts
**Route files**
- src/routes/demo/drawflow/proposal.tsx
**Test files**
- proposal.workspace.spec.ts
- proposal.gantt.spec.ts
**Acceptance gates**
- Proposal starts messy and persists invalid-but-draft states except cycles.
- System hard dependencies cannot be removed.
- Every edit marks analysis stale/pending and writes audit.
- Draw group cap and zero-value errors block submit but do not block draft persistence.

### CH-07: Proposal Planning Submit

**Source refs**
- interactionSpec 2819-3541: Proposal planning, recommendation, split/merge, cascade, and submit contracts.
- interactionSpec 3542-3566: Required proposal planning/submit tests.
- implementationCompanion 543-738: Planning panel, recommendation dialog, footer, and submit UI responsibilities.

**Interaction contracts**
- IC-PROP-ANALYZE-PLAN
- IC-PROP-APPLY-RECOMMENDED-PLAN
- IC-PROP-SPLIT-DRAW-GROUP
- IC-PROP-MERGE-DRAW-GROUP
- IC-PROP-CAPITAL-CASCADE
- IC-PROP-SUBMIT-BLOCKED
- IC-PROP-SUBMIT-SUCCESS
**Companion components**
- PlanningComparisonPanel
- ApplyRecommendationDialog
- ProposalFooterStatusRegion
- DrawFlowTopBar
- ValidationPanel
- DrawGroupBoxLayer
**Convex files**
- convex/demo_drawflow/mutations.ts
- convex/demo_drawflow/engine.ts
- convex/demo_drawflow/projections.ts
- convex/demo_drawflow/audit.ts
- convex/demo_drawflow/outbox.ts
**Route files**
- src/routes/demo/drawflow/proposal.tsx
**Test files**
- proposal.planning.spec.ts
- proposal.submit.spec.ts
**Acceptance gates**
- Analyze Plan creates deterministic planning run without mutating current proposal.
- Apply recommendation mutates order/dates/groups only after confirmation.
- Split/merge recomputes fee count and financing cost.
- Submit blocks stale/error states and freezes proposal on success with audit/outbox.

### CH-08: Playwright Coverage Definition Of Done

**Source refs**
- interactionSpec 1015-1024: Global behavioral test expectations.
- interactionSpec 2454-2486: Active test matrix.
- interactionSpec 3542-3566: Proposal test matrix.
- implementationCompanion 1266-1519: Fixture, reset, clock, drag helper, selector, and assertion rules.
- implementationCompanion 1520-1619: Coverage matrix columns and projection rows.
- implementationCompanion 1690-1795: Completion audit checklist.
- implementationCompanion 1796-1843: Final DoD.

**Interaction contracts**
- IC-ACT-SHELL-SCENARIO-LINK
- IC-ACT-SHELL-PERSONA-SELECT
- IC-ACT-MILESTONE-CARD-SELECT
- IC-ACT-RAIL-CARD-SELECT-DATE-RUNNERS
- IC-ACT-GANTT-RESOLUTION-CHANGE
- IC-ACT-GANTT-COLUMN-SIZE-SLIDER
- IC-ACT-MILESTONE-RAIL-COLLAPSE
- IC-ACT-DRAW-GROUP-BOX-GEOMETRY
- IC-ACT-GANTT-FORECAST-RESIZE-END
- IC-ACT-GANTT-FORECAST-INVALID-BLOCKS-SUBMIT
- IC-ACT-MILESTONE-MARK-COMPLETE
- IC-ACT-EVIDENCE-ADD-SAMPLE
- IC-ACT-EVIDENCE-UPLOAD-METADATA
- IC-ACT-EVIDENCE-REMOVE-DRAFT
- IC-ACT-SUBMIT-COMPLETION-CLAIM
- IC-ACT-LENDER-APPROVE-EVIDENCE
- IC-ACT-LENDER-REQUEST-SITE-VISIT
- IC-ACT-SITE-VISITOR-CLAIM-VISIT
- IC-ACT-SITE-VISITOR-SUBMIT-REPORT
- IC-ACT-LENDER-APPROVE-COMPLETION
- IC-ACT-LENDER-APPROVE-COMPLETION-WITH-SITE-VISIT-OVERRIDE
- IC-ACT-LENDER-REJECT-COMPLETION
- IC-ACT-DRAW-GROUP-AUTO-RELEASE
- IC-ACT-AUDIT-DRAWER-FILTER
- IC-ACT-EVENT-OUTBOX-VIEW
- IC-ACT-DEMO-RESET
- IC-PROP-MILESTONE-CARD-SELECT
- IC-PROP-MILESTONE-REORDER
- IC-PROP-GANTT-MOVE
- IC-PROP-GANTT-RESIZE-START
- IC-PROP-GANTT-RESIZE-END
- IC-PROP-ADD-MILESTONE
- IC-PROP-EDIT-VALUE
- IC-PROP-EDIT-DURATION
- IC-PROP-DEPENDENCY-ADD
- IC-PROP-DEPENDENCY-CYCLE
- IC-PROP-SYSTEM-DEPENDENCY-REMOVE-BLOCKED
- IC-PROP-ANALYZE-PLAN
- IC-PROP-APPLY-RECOMMENDED-PLAN
- IC-PROP-SPLIT-DRAW-GROUP
- IC-PROP-MERGE-DRAW-GROUP
- IC-PROP-CAPITAL-CASCADE
- IC-PROP-SUBMIT-BLOCKED
- IC-PROP-SUBMIT-SUCCESS
**Companion components**
- None
**Convex files**
- None
**Route files**
- None
**Test files**
- active.workspace.spec.ts
- active.workflow.spec.ts
- active.audit-outbox.spec.ts
- proposal.workspace.spec.ts
- proposal.gantt.spec.ts
- proposal.planning.spec.ts
- proposal.submit.spec.ts
**Acceptance gates**
- All Playwright test titles start with an IC ID.
- Tests reset Convex directly and run serially until isolated keys exist.
- Coverage matrix has no TBD for enabled controls or primary tests.
- Final audit proves no enabled controls or drag handles are no-ops.

### CH-09: Visual Parity Mockup

**Source refs**
- mockup n/a: Build Workspace mockup visual target.
- implementationCompanion 1766-1778: Layout audit requirements.
- implementationCompanion 270-542: Gantt visual structure and selectors.

**Interaction contracts**
- IC-ACT-DRAW-GROUP-BOX-GEOMETRY
- IC-ACT-MILESTONE-RAIL-COLLAPSE
- IC-ACT-GANTT-COLUMN-SIZE-SLIDER
- IC-PROP-GANTT-MOVE
- IC-PROP-GANTT-RESIZE-END
- IC-PROP-CAPITAL-CASCADE
**Companion components**
- DrawFlowDemoLayout
- GanttWorkspaceFrame
- MilestoneRailPane
- RailCardLayer
- DrawGroupBoxLayer
- ProposalFooterStatusRegion
**Convex files**
- None
**Route files**
- src/routes/demo/drawflow/index.tsx
- src/routes/demo/drawflow/active.tsx
- src/routes/demo/drawflow/proposal.tsx
**Test files**
- visual-regression verification artifact, if added by implementer
**Acceptance gates**
- Desktop screenshot preserves dense dark operations workspace shape from mockup.
- Left rail, compact top bar, full-width Gantt, draw boxes, and bottom summary are all visible.
- Narrow viewport avoids incoherent overlap and preserves scroll behavior.
- Referenced visual checks use browser screenshots, not eyeballing only.

