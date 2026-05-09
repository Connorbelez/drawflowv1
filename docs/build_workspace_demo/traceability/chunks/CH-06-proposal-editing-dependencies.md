# CH-06: Proposal Editing Dependencies

## Purpose

Proposal Editing Dependencies is a bounded work packet for the DrawFlow Build Workspace demo. Read the source ranges below before implementation; do not load or duplicate the full source specs unless a cited range is insufficient.

## Source References

- interactionSpec 2487-2818: Proposal builder interaction model.
- interactionSpec 2819-3541: Proposal selection, editing, Gantt, add, value/duration, and dependency contracts.
- implementationCompanion 543-738: Proposal component responsibilities and selectors.

## Companion References

- ProposalWorkspacePage: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:545-571
- ProposalMilestoneDetailSheet: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:604-644
- ProposalDependencyEditor: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:645-668
- MilestoneRailPane: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:304-325
- MilestoneCard: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:326-354
- RailCard: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:405-445
- DrawGroupBoxLayer: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:466-496
- ValidationPanel: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:517-542
- ProposalFooterStatusRegion: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:713-738
- proposal.workspace.spec.ts: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1235-1242
- proposal.gantt.spec.ts: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1243-1250
- src/routes/demo/drawflow/proposal.tsx: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1014-1021

## Interaction Contracts

| Contract | Spec lines | Primary test |
| --- | --- | --- |
| IC-PROP-MILESTONE-CARD-SELECT | 2821-2857 | IC-PROP-MILESTONE-CARD-SELECT selects milestone, scrolls rail-card into view, and opens detail sheet |
| IC-PROP-MILESTONE-REORDER | 2858-2898 | IC-PROP-MILESTONE-REORDER changes proposal order and writes audit event |
| IC-PROP-GANTT-MOVE | 2899-2942 | IC-PROP-GANTT-MOVE shifts proposal milestone dates and updates cost summary |
| IC-PROP-GANTT-RESIZE-START | 2943-2985 | IC-PROP-GANTT-RESIZE-START changes start date and duration |
| IC-PROP-GANTT-RESIZE-END | 2986-3033 | IC-PROP-GANTT-RESIZE-END changes end date, duration, draw box, and audit log |
| IC-PROP-ADD-MILESTONE | 3034-3073 | IC-PROP-ADD-MILESTONE creates selected custom milestone with zero-value validation error |
| IC-PROP-EDIT-VALUE | 3074-3114 | IC-PROP-EDIT-VALUE updates draw group total and blocks when over cap |
| IC-PROP-EDIT-DURATION | 3115-3155 | IC-PROP-EDIT-DURATION updates end date and bottom summary |
| IC-PROP-DEPENDENCY-ADD | 3156-3195 | IC-PROP-DEPENDENCY-ADD creates hard blocker edge and highlights dependency neighborhood |
| IC-PROP-DEPENDENCY-CYCLE | 3196-3227 | IC-PROP-DEPENDENCY-CYCLE prevents cyclic dependency mutation |
| IC-PROP-SYSTEM-DEPENDENCY-REMOVE-BLOCKED | 3228-3257 | IC-PROP-SYSTEM-DEPENDENCY-REMOVE-BLOCKED prevents removal of seeded hard dependency |

## Target Files Or Areas

**Convex files**
- convex/demo_drawflow/mutations.ts
- convex/demo_drawflow/engine.ts
- convex/demo_drawflow/audit.ts
**Route files**
- src/routes/demo/drawflow/proposal.tsx
**Test files**
- proposal.workspace.spec.ts
- proposal.gantt.spec.ts
**Components / UI areas**
- ProposalWorkspacePage
- ProposalMilestoneDetailSheet
- ProposalDependencyEditor
- MilestoneRailPane
- MilestoneCard
- RailCard
- DrawGroupBoxLayer
- ValidationPanel
- ProposalFooterStatusRegion

## Implementation Boundary

- This dossier chunk is a planning/reference artifact, not an implementation patch.
- Later implementers must keep source specs authoritative and update traceability if behavior changes.
- Do not create fake enabled controls, fake drag handles, or TODO behavior paths.
- Do not count render-only smoke tests as behavioral coverage.
- Keep Convex as the domain source of truth for domain state.

## Required Downstream Tests

- IC-PROP-MILESTONE-CARD-SELECT selects milestone, scrolls rail-card into view, and opens detail sheet
- IC-PROP-MILESTONE-REORDER changes proposal order and writes audit event
- IC-PROP-GANTT-MOVE shifts proposal milestone dates and updates cost summary
- IC-PROP-GANTT-RESIZE-START changes start date and duration
- IC-PROP-GANTT-RESIZE-END changes end date, duration, draw box, and audit log
- IC-PROP-ADD-MILESTONE creates selected custom milestone with zero-value validation error
- IC-PROP-EDIT-VALUE updates draw group total and blocks when over cap
- IC-PROP-EDIT-DURATION updates end date and bottom summary
- IC-PROP-DEPENDENCY-ADD creates hard blocker edge and highlights dependency neighborhood
- IC-PROP-DEPENDENCY-CYCLE prevents cyclic dependency mutation
- IC-PROP-SYSTEM-DEPENDENCY-REMOVE-BLOCKED prevents removal of seeded hard dependency

## Acceptance Gates

- Proposal starts messy and persists invalid-but-draft states except cycles.
- System hard dependencies cannot be removed.
- Every edit marks analysis stale/pending and writes audit.
- Draw group cap and zero-value errors block submit but do not block draft persistence.
## Known Risks

- Proposal must persist messy/invalid draft states instead of silently fixing them.
- Cycle rejection must happen before persistence.
