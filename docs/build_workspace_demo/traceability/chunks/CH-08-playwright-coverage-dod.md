# CH-08: Playwright Coverage Definition Of Done

## Purpose

Playwright Coverage Definition Of Done is a bounded work packet for the DrawFlow Build Workspace demo. Read the source ranges below before implementation; do not load or duplicate the full source specs unless a cited range is insufficient.

## Source References

- interactionSpec 1015-1024: Global behavioral test expectations.
- interactionSpec 2454-2486: Active test matrix.
- interactionSpec 3542-3566: Proposal test matrix.
- implementationCompanion 1266-1519: Fixture, reset, clock, drag helper, selector, and assertion rules.
- implementationCompanion 1520-1619: Coverage matrix columns and projection rows.
- implementationCompanion 1690-1795: Completion audit checklist.
- implementationCompanion 1796-1843: Final DoD.

## Companion References

- active.workspace.spec.ts: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1207-1217
- active.workflow.spec.ts: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1218-1228
- active.audit-outbox.spec.ts: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1229-1234
- proposal.workspace.spec.ts: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1235-1242
- proposal.gantt.spec.ts: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1243-1250
- proposal.planning.spec.ts: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1251-1258
- proposal.submit.spec.ts: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1259-1265

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
| IC-ACT-MILESTONE-MARK-COMPLETE | 1857-1897 | IC-ACT-MILESTONE-MARK-COMPLETE marks Foundation complete but keeps claim blocked until evidence exists |
| IC-ACT-EVIDENCE-ADD-SAMPLE | 1898-1934 | IC-ACT-EVIDENCE-ADD-SAMPLE adds deterministic Foundation evidence and updates readiness |
| IC-ACT-EVIDENCE-UPLOAD-METADATA | 1935-1970 | IC-ACT-EVIDENCE-UPLOAD-METADATA stores file metadata only and updates evidence count |
| IC-ACT-EVIDENCE-REMOVE-DRAFT | 1971-2003 | IC-ACT-EVIDENCE-REMOVE-DRAFT removes draft evidence and re-blocks submission when no evidence remains |
| IC-ACT-SUBMIT-COMPLETION-CLAIM | 2004-2054 | IC-ACT-SUBMIT-COMPLETION-CLAIM submits Foundation claim, freezes evidence, creates rollover when requested amount is lower, and writes audit/outbox |
| IC-ACT-LENDER-APPROVE-EVIDENCE | 2055-2091 | IC-ACT-LENDER-APPROVE-EVIDENCE accepts Foundation evidence without approving completion |
| IC-ACT-LENDER-REQUEST-SITE-VISIT | 2092-2129 | IC-ACT-LENDER-REQUEST-SITE-VISIT creates Foundation site visit and exposes it to Site Visitor persona |
| IC-ACT-SITE-VISITOR-CLAIM-VISIT | 2130-2165 | IC-ACT-SITE-VISITOR-CLAIM-VISIT claims assigned Foundation site visit and opens report form |
| IC-ACT-SITE-VISITOR-SUBMIT-REPORT | 2166-2205 | IC-ACT-SITE-VISITOR-SUBMIT-REPORT completes Foundation site visit and unlocks Lender Admin completion approval |
| IC-ACT-LENDER-APPROVE-COMPLETION | 2206-2251 | IC-ACT-LENDER-APPROVE-COMPLETION approves Foundation and removes hard dependency blocker from Underground Plumbing |
| IC-ACT-LENDER-APPROVE-COMPLETION-WITH-SITE-VISIT-OVERRIDE | 2252-2288 | IC-ACT-LENDER-APPROVE-COMPLETION-WITH-SITE-VISIT-OVERRIDE requires override reason and records it in audit trail |
| IC-ACT-LENDER-REJECT-COMPLETION | 2289-2323 | IC-ACT-LENDER-REJECT-COMPLETION rejects a submitted claim only when reason is provided |
| IC-ACT-DRAW-GROUP-AUTO-RELEASE | 2324-2362 | IC-ACT-DRAW-GROUP-AUTO-RELEASE release-approves Draw 2 and unblocks Draw 3 capital after final milestone approval |
| IC-ACT-AUDIT-DRAWER-FILTER | 2363-2392 | IC-ACT-AUDIT-DRAWER-FILTER filters append-only audit events by Foundation milestone |
| IC-ACT-EVENT-OUTBOX-VIEW | 2393-2422 | IC-ACT-EVENT-OUTBOX-VIEW shows mock-delivered completion and draw release events after active happy path |
| IC-ACT-DEMO-RESET | 2423-2453 | IC-ACT-DEMO-RESET reseeds active and proposal scenarios after confirmation |
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
| IC-PROP-ANALYZE-PLAN | 3258-3295 | IC-PROP-ANALYZE-PLAN creates deterministic planning run without mutating proposal |
| IC-PROP-APPLY-RECOMMENDED-PLAN | 3296-3342 | IC-PROP-APPLY-RECOMMENDED-PLAN reorders milestones, redraws draw groups, and clears hard ordering errors |
| IC-PROP-SPLIT-DRAW-GROUP | 3343-3384 | IC-PROP-SPLIT-DRAW-GROUP increases fee count and recomputes financing cost |
| IC-PROP-MERGE-DRAW-GROUP | 3385-3425 | IC-PROP-MERGE-DRAW-GROUP decreases fee count and recomputes financing cost |
| IC-PROP-CAPITAL-CASCADE | 3426-3461 | IC-PROP-CAPITAL-CASCADE pushes later draw groups after extending an earlier draw |
| IC-PROP-SUBMIT-BLOCKED | 3462-3498 | IC-PROP-SUBMIT-BLOCKED prevents submission while hard errors remain |
| IC-PROP-SUBMIT-SUCCESS | 3499-3541 | IC-PROP-SUBMIT-SUCCESS freezes proposal and writes audit/outbox |

## Target Files Or Areas

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
**Components / UI areas**
- None

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
- IC-ACT-MILESTONE-MARK-COMPLETE marks Foundation complete but keeps claim blocked until evidence exists
- IC-ACT-EVIDENCE-ADD-SAMPLE adds deterministic Foundation evidence and updates readiness
- IC-ACT-EVIDENCE-UPLOAD-METADATA stores file metadata only and updates evidence count
- IC-ACT-EVIDENCE-REMOVE-DRAFT removes draft evidence and re-blocks submission when no evidence remains
- IC-ACT-SUBMIT-COMPLETION-CLAIM submits Foundation claim, freezes evidence, creates rollover when requested amount is lower, and writes audit/outbox
- IC-ACT-LENDER-APPROVE-EVIDENCE accepts Foundation evidence without approving completion
- IC-ACT-LENDER-REQUEST-SITE-VISIT creates Foundation site visit and exposes it to Site Visitor persona
- IC-ACT-SITE-VISITOR-CLAIM-VISIT claims assigned Foundation site visit and opens report form
- IC-ACT-SITE-VISITOR-SUBMIT-REPORT completes Foundation site visit and unlocks Lender Admin completion approval
- IC-ACT-LENDER-APPROVE-COMPLETION approves Foundation and removes hard dependency blocker from Underground Plumbing
- IC-ACT-LENDER-APPROVE-COMPLETION-WITH-SITE-VISIT-OVERRIDE requires override reason and records it in audit trail
- IC-ACT-LENDER-REJECT-COMPLETION rejects a submitted claim only when reason is provided
- IC-ACT-DRAW-GROUP-AUTO-RELEASE release-approves Draw 2 and unblocks Draw 3 capital after final milestone approval
- IC-ACT-AUDIT-DRAWER-FILTER filters append-only audit events by Foundation milestone
- IC-ACT-EVENT-OUTBOX-VIEW shows mock-delivered completion and draw release events after active happy path
- IC-ACT-DEMO-RESET reseeds active and proposal scenarios after confirmation
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
- IC-PROP-ANALYZE-PLAN creates deterministic planning run without mutating proposal
- IC-PROP-APPLY-RECOMMENDED-PLAN reorders milestones, redraws draw groups, and clears hard ordering errors
- IC-PROP-SPLIT-DRAW-GROUP increases fee count and recomputes financing cost
- IC-PROP-MERGE-DRAW-GROUP decreases fee count and recomputes financing cost
- IC-PROP-CAPITAL-CASCADE pushes later draw groups after extending an earlier draw
- IC-PROP-SUBMIT-BLOCKED prevents submission while hard errors remain
- IC-PROP-SUBMIT-SUCCESS freezes proposal and writes audit/outbox

## Acceptance Gates

- All Playwright test titles start with an IC ID.
- Tests reset Convex directly and run serially until isolated keys exist.
- Coverage matrix has no TBD for enabled controls or primary tests.
- Final audit proves no enabled controls or drag handles are no-ops.
## Known Risks

- Render-only tests do not count as coverage.
- Shared deterministic demo state requires serial Playwright execution unless isolated keys are added.
