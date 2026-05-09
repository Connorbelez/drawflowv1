# CH-04: Active Selection Gantt Forecast

## Purpose

Active Selection Gantt Forecast is a bounded work packet for the DrawFlow Build Workspace demo. Read the source ranges below before implementation; do not load or duplicate the full source specs unless a cited range is insufficient.

## Source References

- interactionSpec 1056-1508: Active workspace interaction model.
- interactionSpec 1509-2453: Active shell, selection, Gantt, and forecast contracts.
- interactionSpec 2454-2486: Required active shell/Gantt tests.

## Companion References

- ActiveWorkspacePage: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:741-759
- ActiveMilestoneDetailSheet: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:760-804
- ForecastReasonDialog: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:805-826
- GanttWorkspaceFrame: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:272-303
- MilestoneRailPane: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:304-325
- MilestoneCard: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:326-354
- RailCard: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:405-445
- DateRunners: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:446-465
- DrawGroupBoxLayer: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:466-496
- ValidationPanel: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:517-542
- active.workspace.spec.ts: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1207-1217
- src/routes/demo/drawflow/active.tsx: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1008-1013

## Interaction Contracts

| Contract | Spec lines | Primary test |
| --- | --- | --- |
| IC-ACT-SHELL-SCENARIO-LINK | 1511-1541 | IC-ACT-SHELL-SCENARIO-LINK navigates between isolated active and proposal routes |
| IC-ACT-SHELL-PERSONA-SELECT | 1542-1574 | IC-ACT-SHELL-PERSONA-SELECT changes available controls without mutating build state |
| IC-ACT-MILESTONE-CARD-SELECT | 1575-1610 | IC-ACT-MILESTONE-CARD-SELECT opens detail sheet and highlights dependency neighborhood |
| IC-ACT-RAIL-CARD-SELECT-DATE-RUNNERS | 1611-1642 | IC-ACT-RAIL-CARD-SELECT-DATE-RUNNERS shows start and end date runners for selected milestone |
| IC-ACT-GANTT-RESOLUTION-CHANGE | 1643-1675 | IC-ACT-GANTT-RESOLUTION-CHANGE changes timeline granularity without changing domain dates |
| IC-ACT-GANTT-COLUMN-SIZE-SLIDER | 1676-1709 | IC-ACT-GANTT-COLUMN-SIZE-SLIDER widens time columns without changing active resolution or persisted dates |
| IC-ACT-MILESTONE-RAIL-COLLAPSE | 1710-1741 | IC-ACT-MILESTONE-RAIL-COLLAPSE expands gantt width and preserves selected milestone |
| IC-ACT-DRAW-GROUP-BOX-GEOMETRY | 1742-1776 | IC-ACT-DRAW-GROUP-BOX-GEOMETRY encloses all milestones in the draw group and keeps label clear of cards |
| IC-ACT-GANTT-FORECAST-RESIZE-END | 1777-1825 | IC-ACT-GANTT-FORECAST-RESIZE-END extends Foundation forecast and pushes Draw 3 start via capital clamp |
| IC-ACT-GANTT-FORECAST-INVALID-BLOCKS-SUBMIT | 1826-1856 | IC-ACT-GANTT-FORECAST-INVALID-BLOCKS-SUBMIT prevents completion claim while forecast violates hard sequencing |

## Target Files Or Areas

**Convex files**
- convex/demo_drawflow/queries.ts
- convex/demo_drawflow/mutations.ts
- convex/demo_drawflow/audit.ts
- convex/demo_drawflow/outbox.ts
**Route files**
- src/routes/demo/drawflow/active.tsx
**Test files**
- active.workspace.spec.ts
**Components / UI areas**
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

## Implementation Boundary

- This dossier chunk is a planning/reference artifact, not an implementation patch.
- Later implementers must keep source specs authoritative and update traceability if behavior changes.
- Do not create fake enabled controls, fake drag handles, or TODO behavior paths.
- Do not count render-only smoke tests as behavioral coverage.
- Keep Convex as the domain source of truth for domain state.

## Required Downstream Tests

- IC-ACT-SHELL-SCENARIO-LINK navigates between isolated active and proposal routes
- IC-ACT-SHELL-PERSONA-SELECT changes available controls without mutating build state
- IC-ACT-MILESTONE-CARD-SELECT opens detail sheet and highlights dependency neighborhood
- IC-ACT-RAIL-CARD-SELECT-DATE-RUNNERS shows start and end date runners for selected milestone
- IC-ACT-GANTT-RESOLUTION-CHANGE changes timeline granularity without changing domain dates
- IC-ACT-GANTT-COLUMN-SIZE-SLIDER widens time columns without changing active resolution or persisted dates
- IC-ACT-MILESTONE-RAIL-COLLAPSE expands gantt width and preserves selected milestone
- IC-ACT-DRAW-GROUP-BOX-GEOMETRY encloses all milestones in the draw group and keeps label clear of cards
- IC-ACT-GANTT-FORECAST-RESIZE-END extends Foundation forecast and pushes Draw 3 start via capital clamp
- IC-ACT-GANTT-FORECAST-INVALID-BLOCKS-SUBMIT prevents completion claim while forecast violates hard sequencing

## Acceptance Gates

- Selection opens non-modal detail sheet and highlights dependency neighborhood.
- Active forecast drag persists forecast only after required reason.
- Invalid forecast blocks claim submission with explicit reason.
- Shared Gantt controls leave domain dates unchanged.
## Known Risks

- Active forecast edits must not mutate baseline dates.
- Fake drag handles are explicitly forbidden.
