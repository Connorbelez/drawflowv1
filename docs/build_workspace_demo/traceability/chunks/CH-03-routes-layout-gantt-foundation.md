# CH-03: Routes Layout Gantt Foundation

## Purpose

Routes Layout Gantt Foundation is a bounded work packet for the DrawFlow Build Workspace demo. Read the source ranges below before implementation; do not load or duplicate the full source specs unless a cited range is insufficient.

## Source References

- interactionSpec 987-1007: Route/screen inventory.
- interactionSpec 1056-1508: Active workspace shell, selection, Gantt, draw-group geometry, and controls.
- implementationCompanion 92-964: Component layering and shared layout/Gantt component responsibilities.
- implementationCompanion 965-1265: Route and feature directory manifest.

## Companion References

- DrawFlowDemoLayout: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:109-140
- DrawFlowTopBar: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:141-177
- DemoScenarioLinks: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:178-201
- PersonaSelector: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:202-234
- DemoResetControls: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:235-269
- GanttWorkspaceFrame: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:272-303
- MilestoneRailPane: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:304-325
- MilestoneCard: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:326-354
- GanttToolbar: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:355-382
- RailCardLayer: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:383-404
- RailCard: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:405-445
- DateRunners: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:446-465
- DrawGroupBoxLayer: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:466-496
- BlockingReasonChips: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:497-516
- ValidationPanel: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:517-542
- src/routes/demo/drawflow/index.tsx: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1004-1007
- src/routes/demo/drawflow/active.tsx: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1008-1013
- src/routes/demo/drawflow/proposal.tsx: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1014-1021

## Interaction Contracts

No primary interaction contracts in this chunk.

## Target Files Or Areas

**Convex files**
- None
**Route files**
- src/routes/demo/drawflow/index.tsx
- src/routes/demo/drawflow/active.tsx
- src/routes/demo/drawflow/proposal.tsx
**Test files**
- None
**Components / UI areas**
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

## Implementation Boundary

- This dossier chunk is a planning/reference artifact, not an implementation patch.
- Later implementers must keep source specs authoritative and update traceability if behavior changes.
- Do not create fake enabled controls, fake drag handles, or TODO behavior paths.
- Do not count render-only smoke tests as behavioral coverage.
- Keep Convex as the domain source of truth for domain state.

## Required Downstream Tests

- No direct IC tests; verify via downstream chunks and final coverage gates.

## Acceptance Gates

- Shared route shell is real navigation, not tab-only state.
- Gantt is full-width, horizontally and vertically scrollable, and rail-collapsible.
- Rail-cards and draw-group boxes use one coordinate model.
- View-state controls never mutate Convex domain state.
## Known Risks

- Gantt geometry can drift if draw boxes and rail cards use separate coordinate math.
- Starter app header/footer may need route-specific suppression or adaptation.
