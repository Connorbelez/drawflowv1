# CH-09: Visual Parity Mockup

## Purpose

Visual Parity Mockup is a bounded work packet for the DrawFlow Build Workspace demo. Read the source ranges below before implementation; do not load or duplicate the full source specs unless a cited range is insufficient.

## Source References

- mockup n/a: Build Workspace mockup visual target.
- implementationCompanion 1766-1778: Layout audit requirements.
- implementationCompanion 270-542: Gantt visual structure and selectors.

## Companion References

- DrawFlowDemoLayout: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:109-140
- GanttWorkspaceFrame: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:272-303
- MilestoneRailPane: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:304-325
- RailCardLayer: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:383-404
- DrawGroupBoxLayer: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:466-496
- ProposalFooterStatusRegion: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:713-738
- src/routes/demo/drawflow/index.tsx: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1004-1007
- src/routes/demo/drawflow/active.tsx: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1008-1013
- src/routes/demo/drawflow/proposal.tsx: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1014-1021

## Interaction Contracts

| Contract | Spec lines | Primary test |
| --- | --- | --- |
| IC-ACT-DRAW-GROUP-BOX-GEOMETRY | 1742-1776 | IC-ACT-DRAW-GROUP-BOX-GEOMETRY encloses all milestones in the draw group and keeps label clear of cards |
| IC-ACT-MILESTONE-RAIL-COLLAPSE | 1710-1741 | IC-ACT-MILESTONE-RAIL-COLLAPSE expands gantt width and preserves selected milestone |
| IC-ACT-GANTT-COLUMN-SIZE-SLIDER | 1676-1709 | IC-ACT-GANTT-COLUMN-SIZE-SLIDER widens time columns without changing active resolution or persisted dates |
| IC-PROP-GANTT-MOVE | 2899-2942 | IC-PROP-GANTT-MOVE shifts proposal milestone dates and updates cost summary |
| IC-PROP-GANTT-RESIZE-END | 2986-3033 | IC-PROP-GANTT-RESIZE-END changes end date, duration, draw box, and audit log |
| IC-PROP-CAPITAL-CASCADE | 3426-3461 | IC-PROP-CAPITAL-CASCADE pushes later draw groups after extending an earlier draw |

## Target Files Or Areas

**Convex files**
- None
**Route files**
- src/routes/demo/drawflow/index.tsx
- src/routes/demo/drawflow/active.tsx
- src/routes/demo/drawflow/proposal.tsx
**Test files**
- visual-regression verification artifact, if added by implementer
**Components / UI areas**
- DrawFlowDemoLayout
- GanttWorkspaceFrame
- MilestoneRailPane
- RailCardLayer
- DrawGroupBoxLayer
- ProposalFooterStatusRegion

## Implementation Boundary

- This dossier chunk is a planning/reference artifact, not an implementation patch.
- Later implementers must keep source specs authoritative and update traceability if behavior changes.
- Do not create fake enabled controls, fake drag handles, or TODO behavior paths.
- Do not count render-only smoke tests as behavioral coverage.
- Keep Convex as the domain source of truth for domain state.

## Required Downstream Tests

- IC-ACT-DRAW-GROUP-BOX-GEOMETRY encloses all milestones in the draw group and keeps label clear of cards
- IC-ACT-MILESTONE-RAIL-COLLAPSE expands gantt width and preserves selected milestone
- IC-ACT-GANTT-COLUMN-SIZE-SLIDER widens time columns without changing active resolution or persisted dates
- IC-PROP-GANTT-MOVE shifts proposal milestone dates and updates cost summary
- IC-PROP-GANTT-RESIZE-END changes end date, duration, draw box, and audit log
- IC-PROP-CAPITAL-CASCADE pushes later draw groups after extending an earlier draw

## Acceptance Gates

- Desktop screenshot preserves dense dark operations workspace shape from mockup.
- Left rail, compact top bar, full-width Gantt, draw boxes, and bottom summary are all visible.
- Narrow viewport avoids incoherent overlap and preserves scroll behavior.
- Referenced visual checks use browser screenshots, not eyeballing only.
## Known Risks

- Visual polish must not turn the operational workspace into a marketing page.
- Dense layout needs scroll/overflow checks at desktop and narrow widths.
