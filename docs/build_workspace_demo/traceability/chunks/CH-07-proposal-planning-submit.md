# CH-07: Proposal Planning Submit

## Purpose

Proposal Planning Submit is a bounded work packet for the DrawFlow Build Workspace demo. Read the source ranges below before implementation; do not load or duplicate the full source specs unless a cited range is insufficient.

## Source References

- interactionSpec 2819-3541: Proposal planning, recommendation, split/merge, cascade, and submit contracts.
- interactionSpec 3542-3566: Required proposal planning/submit tests.
- implementationCompanion 543-738: Planning panel, recommendation dialog, footer, and submit UI responsibilities.

## Companion References

- PlanningComparisonPanel: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:669-692
- ApplyRecommendationDialog: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:693-712
- ProposalFooterStatusRegion: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:713-738
- DrawFlowTopBar: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:141-177
- ValidationPanel: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:517-542
- DrawGroupBoxLayer: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:466-496
- proposal.planning.spec.ts: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1251-1258
- proposal.submit.spec.ts: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1259-1265
- src/routes/demo/drawflow/proposal.tsx: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1014-1021

## Interaction Contracts

| Contract | Spec lines | Primary test |
| --- | --- | --- |
| IC-PROP-ANALYZE-PLAN | 3258-3295 | IC-PROP-ANALYZE-PLAN creates deterministic planning run without mutating proposal |
| IC-PROP-APPLY-RECOMMENDED-PLAN | 3296-3342 | IC-PROP-APPLY-RECOMMENDED-PLAN reorders milestones, redraws draw groups, and clears hard ordering errors |
| IC-PROP-SPLIT-DRAW-GROUP | 3343-3384 | IC-PROP-SPLIT-DRAW-GROUP increases fee count and recomputes financing cost |
| IC-PROP-MERGE-DRAW-GROUP | 3385-3425 | IC-PROP-MERGE-DRAW-GROUP decreases fee count and recomputes financing cost |
| IC-PROP-CAPITAL-CASCADE | 3426-3461 | IC-PROP-CAPITAL-CASCADE pushes later draw groups after extending an earlier draw |
| IC-PROP-SUBMIT-BLOCKED | 3462-3498 | IC-PROP-SUBMIT-BLOCKED prevents submission while hard errors remain |
| IC-PROP-SUBMIT-SUCCESS | 3499-3541 | IC-PROP-SUBMIT-SUCCESS freezes proposal and writes audit/outbox |

## Target Files Or Areas

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
**Components / UI areas**
- PlanningComparisonPanel
- ApplyRecommendationDialog
- ProposalFooterStatusRegion
- DrawFlowTopBar
- ValidationPanel
- DrawGroupBoxLayer

## Implementation Boundary

- This dossier chunk is a planning/reference artifact, not an implementation patch.
- Later implementers must keep source specs authoritative and update traceability if behavior changes.
- Do not create fake enabled controls, fake drag handles, or TODO behavior paths.
- Do not count render-only smoke tests as behavioral coverage.
- Keep Convex as the domain source of truth for domain state.

## Required Downstream Tests

- IC-PROP-ANALYZE-PLAN creates deterministic planning run without mutating proposal
- IC-PROP-APPLY-RECOMMENDED-PLAN reorders milestones, redraws draw groups, and clears hard ordering errors
- IC-PROP-SPLIT-DRAW-GROUP increases fee count and recomputes financing cost
- IC-PROP-MERGE-DRAW-GROUP decreases fee count and recomputes financing cost
- IC-PROP-CAPITAL-CASCADE pushes later draw groups after extending an earlier draw
- IC-PROP-SUBMIT-BLOCKED prevents submission while hard errors remain
- IC-PROP-SUBMIT-SUCCESS freezes proposal and writes audit/outbox

## Acceptance Gates

- Analyze Plan creates deterministic planning run without mutating current proposal.
- Apply recommendation mutates order/dates/groups only after confirmation.
- Split/merge recomputes fee count and financing cost.
- Submit blocks stale/error states and freezes proposal on success with audit/outbox.
## Known Risks

- Analyze Plan must not mutate current proposal; Apply Recommendation does.
- Submit requires fresh analysis and no blocking errors.
