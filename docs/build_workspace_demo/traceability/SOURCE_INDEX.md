# Build Workspace Source Index

This index points to the authoritative source material by line range. JSON consumers should use `manifests/source-index.json` for the full heading tree.

## Sources

| ID | Path | Lines / dimensions | SHA-256 |
| --- | --- | --- | --- |
| interactionSpec | docs/build_workspace_demo/Drawflow Demo Interaction Spec.md | 4806 | adfda238b1b1577f31877fc9733cd248410ee2ea2221027c5772f73a852006ab |
| implementationCompanion | docs/build_workspace_demo/Drawflow Demo Implementation Companion.md | 1843 | a7e24fd283b6289aba9959a3df42aeadfefab9a11ddb56aa93317f490155b701 |
| prd | docs/draw_flow_prd.md | 2381 | 6e8109b917f7a368e6d496cf52b637f116b0eb82500354260de92afc4ddb7046 |
| mockup | docs/build_workspace_demo/build_workspace_mockup.png | 1995x1106 | df8e118c1a33ceb4c20adca9c54ef8d080fc8024804f78a971db78a9c67653b8 |
| repo | . | n/a | n/a |

## Interaction Spec Major Sections

| Section | Lines |
| --- | --- |
| 0. Purpose | 3-15 |
| 1. Round 1 Locked Decisions | 16-254 |
| 2. Canonical Seed Build | 255-543 |
| 3. Round 2 Locked Decisions: Domain Logic | 544-650 |
| 4. Cost, Fee, and Interest Model | 651-741 |
| 5. Rollover Buffer Model | 742-804 |
| 6. Required Demo Tables | 805-826 |
| 7. Required Demo Functions | 827-893 |
| 8. Core Invariants | 894-920 |
| 9. Status Lifecycle | 921-986 |
| 10. Screens and Panels | 987-1007 |
| 11. Executable Interaction Contract Shape | 1008-1014 |
| 12. Playwright Behavioral Test Requirements | 1015-1024 |
| 13. Round 3 Locked Decisions Summary | 1025-1055 |
| 14. Round 4 Locked Decisions: Active Workspace Interaction Model | 1056-1508 |
| 15. Active Workspace Interaction Contracts | 1509-2453 |
| 16. Active Workspace Playwright Test Matrix | 2454-2486 |
| 17. Round 5 Locked Decisions: Proposal Builder Interaction Model | 2487-2818 |
| 18. Proposal Builder Interaction Contracts | 2819-3541 |
| 19. Proposal Builder Playwright Test Matrix | 3542-3566 |
| 20. Round 6 Locked Decisions: Convex Schema, Functions, and Seed Contract | 3567-4796 |
| 21. Final Round 6 Open Items | 4797-4806 |

## Implementation Companion Major Sections

| Section | Lines |
| --- | --- |
| DrawFlow Demo Implementation Companion | 1-91 |
| 0. Purpose | 3-18 |
| 1. Non-Negotiable Implementation Rules | 19-91 |
| 2. UI Component Manifest | 92-964 |
| 2.1 Component Layering | 94-106 |
| 2.2 Shared Layout Components | 107-269 |
| 2.3 Shared Gantt Components | 270-542 |
| 2.4 Proposal Builder Components | 543-738 |
| 2.5 Active Workspace Components | 739-964 |
| 3. Route and File Manifest | 965-1265 |
| 3.1 Route Manifest | 967-991 |
| 3.2 Suggested Route Files | 992-1021 |
| 3.3 Suggested Feature Directory | 1022-1109 |
| 3.4 Convex File Manifest | 1110-1188 |
| 3.5 Test File Manifest | 1189-1265 |
| 4. Playwright Fixture Strategy | 1266-1519 |
| 4.1 Core Principle | 1268-1279 |
| 4.2 Serial Execution | 1280-1298 |
| 4.3 Convex Reset Fixture | 1299-1351 |
| 4.4 Test Data Clock | 1352-1367 |
| 4.5 JIT Analysis Waiting Strategy | 1368-1401 |
| 4.6 Drag Helpers | 1402-1432 |
| 4.7 Selector Strategy | 1433-1458 |
| 4.8 Assertion Levels | 1459-1478 |
| 4.9 Smoke Tests Are Not Coverage | 1479-1504 |
| 4.10 Required Test Naming Rule | 1505-1519 |
| 5. Final Coverage Matrix Format | 1520-1619 |
| 5.1 Interactive Control Coverage Matrix | 1530-1572 |
| 5.2 Projection Coverage Matrix | 1573-1600 |
| 5.3 Test Coverage Summary | 1601-1619 |
| 6. Agent Instruction Block | 1620-1689 |
| 7. Anti-Punting Checklist | 1690-1795 |
| 7.1 Static Control Audit | 1694-1706 |
| 7.2 Convex Audit | 1707-1719 |
| 7.3 Proposal Behavior Audit | 1720-1741 |
| 7.4 Active Behavior Audit | 1742-1765 |
| 7.5 Layout Audit | 1766-1778 |
| 7.6 Playwright Audit | 1779-1795 |
| 8. Definition of Done | 1796-1843 |

## Interaction Contracts

| Contract | Lines | Primary chunk | Required test |
| --- | --- | --- | --- |
| IC-ACT-SHELL-SCENARIO-LINK | 1511-1541 | CH-04 | IC-ACT-SHELL-SCENARIO-LINK navigates between isolated active and proposal routes |
| IC-ACT-SHELL-PERSONA-SELECT | 1542-1574 | CH-04 | IC-ACT-SHELL-PERSONA-SELECT changes available controls without mutating build state |
| IC-ACT-MILESTONE-CARD-SELECT | 1575-1610 | CH-04 | IC-ACT-MILESTONE-CARD-SELECT opens detail sheet and highlights dependency neighborhood |
| IC-ACT-RAIL-CARD-SELECT-DATE-RUNNERS | 1611-1642 | CH-04 | IC-ACT-RAIL-CARD-SELECT-DATE-RUNNERS shows start and end date runners for selected milestone |
| IC-ACT-GANTT-RESOLUTION-CHANGE | 1643-1675 | CH-04 | IC-ACT-GANTT-RESOLUTION-CHANGE changes timeline granularity without changing domain dates |
| IC-ACT-GANTT-COLUMN-SIZE-SLIDER | 1676-1709 | CH-04 | IC-ACT-GANTT-COLUMN-SIZE-SLIDER widens time columns without changing active resolution or persisted dates |
| IC-ACT-MILESTONE-RAIL-COLLAPSE | 1710-1741 | CH-04 | IC-ACT-MILESTONE-RAIL-COLLAPSE expands gantt width and preserves selected milestone |
| IC-ACT-DRAW-GROUP-BOX-GEOMETRY | 1742-1776 | CH-04 | IC-ACT-DRAW-GROUP-BOX-GEOMETRY encloses all milestones in the draw group and keeps label clear of cards |
| IC-ACT-GANTT-FORECAST-RESIZE-END | 1777-1825 | CH-04 | IC-ACT-GANTT-FORECAST-RESIZE-END extends Foundation forecast and pushes Draw 3 start via capital clamp |
| IC-ACT-GANTT-FORECAST-INVALID-BLOCKS-SUBMIT | 1826-1856 | CH-04 | IC-ACT-GANTT-FORECAST-INVALID-BLOCKS-SUBMIT prevents completion claim while forecast violates hard sequencing |
| IC-ACT-MILESTONE-MARK-COMPLETE | 1857-1897 | CH-05 | IC-ACT-MILESTONE-MARK-COMPLETE marks Foundation complete but keeps claim blocked until evidence exists |
| IC-ACT-EVIDENCE-ADD-SAMPLE | 1898-1934 | CH-05 | IC-ACT-EVIDENCE-ADD-SAMPLE adds deterministic Foundation evidence and updates readiness |
| IC-ACT-EVIDENCE-UPLOAD-METADATA | 1935-1970 | CH-05 | IC-ACT-EVIDENCE-UPLOAD-METADATA stores file metadata only and updates evidence count |
| IC-ACT-EVIDENCE-REMOVE-DRAFT | 1971-2003 | CH-05 | IC-ACT-EVIDENCE-REMOVE-DRAFT removes draft evidence and re-blocks submission when no evidence remains |
| IC-ACT-SUBMIT-COMPLETION-CLAIM | 2004-2054 | CH-05 | IC-ACT-SUBMIT-COMPLETION-CLAIM submits Foundation claim, freezes evidence, creates rollover when requested amount is lower, and writes audit/outbox |
| IC-ACT-LENDER-APPROVE-EVIDENCE | 2055-2091 | CH-05 | IC-ACT-LENDER-APPROVE-EVIDENCE accepts Foundation evidence without approving completion |
| IC-ACT-LENDER-REQUEST-SITE-VISIT | 2092-2129 | CH-05 | IC-ACT-LENDER-REQUEST-SITE-VISIT creates Foundation site visit and exposes it to Site Visitor persona |
| IC-ACT-SITE-VISITOR-CLAIM-VISIT | 2130-2165 | CH-05 | IC-ACT-SITE-VISITOR-CLAIM-VISIT claims assigned Foundation site visit and opens report form |
| IC-ACT-SITE-VISITOR-SUBMIT-REPORT | 2166-2205 | CH-05 | IC-ACT-SITE-VISITOR-SUBMIT-REPORT completes Foundation site visit and unlocks Lender Admin completion approval |
| IC-ACT-LENDER-APPROVE-COMPLETION | 2206-2251 | CH-05 | IC-ACT-LENDER-APPROVE-COMPLETION approves Foundation and removes hard dependency blocker from Underground Plumbing |
| IC-ACT-LENDER-APPROVE-COMPLETION-WITH-SITE-VISIT-OVERRIDE | 2252-2288 | CH-05 | IC-ACT-LENDER-APPROVE-COMPLETION-WITH-SITE-VISIT-OVERRIDE requires override reason and records it in audit trail |
| IC-ACT-LENDER-REJECT-COMPLETION | 2289-2323 | CH-05 | IC-ACT-LENDER-REJECT-COMPLETION rejects a submitted claim only when reason is provided |
| IC-ACT-DRAW-GROUP-AUTO-RELEASE | 2324-2362 | CH-05 | IC-ACT-DRAW-GROUP-AUTO-RELEASE release-approves Draw 2 and unblocks Draw 3 capital after final milestone approval |
| IC-ACT-AUDIT-DRAWER-FILTER | 2363-2392 | CH-05 | IC-ACT-AUDIT-DRAWER-FILTER filters append-only audit events by Foundation milestone |
| IC-ACT-EVENT-OUTBOX-VIEW | 2393-2422 | CH-05 | IC-ACT-EVENT-OUTBOX-VIEW shows mock-delivered completion and draw release events after active happy path |
| IC-ACT-DEMO-RESET | 2423-2453 | CH-05 | IC-ACT-DEMO-RESET reseeds active and proposal scenarios after confirmation |
| IC-PROP-MILESTONE-CARD-SELECT | 2821-2857 | CH-06 | IC-PROP-MILESTONE-CARD-SELECT selects milestone, scrolls rail-card into view, and opens detail sheet |
| IC-PROP-MILESTONE-REORDER | 2858-2898 | CH-06 | IC-PROP-MILESTONE-REORDER changes proposal order and writes audit event |
| IC-PROP-GANTT-MOVE | 2899-2942 | CH-06 | IC-PROP-GANTT-MOVE shifts proposal milestone dates and updates cost summary |
| IC-PROP-GANTT-RESIZE-START | 2943-2985 | CH-06 | IC-PROP-GANTT-RESIZE-START changes start date and duration |
| IC-PROP-GANTT-RESIZE-END | 2986-3033 | CH-06 | IC-PROP-GANTT-RESIZE-END changes end date, duration, draw box, and audit log |
| IC-PROP-ADD-MILESTONE | 3034-3073 | CH-06 | IC-PROP-ADD-MILESTONE creates selected custom milestone with zero-value validation error |
| IC-PROP-EDIT-VALUE | 3074-3114 | CH-06 | IC-PROP-EDIT-VALUE updates draw group total and blocks when over cap |
| IC-PROP-EDIT-DURATION | 3115-3155 | CH-06 | IC-PROP-EDIT-DURATION updates end date and bottom summary |
| IC-PROP-DEPENDENCY-ADD | 3156-3195 | CH-06 | IC-PROP-DEPENDENCY-ADD creates hard blocker edge and highlights dependency neighborhood |
| IC-PROP-DEPENDENCY-CYCLE | 3196-3227 | CH-06 | IC-PROP-DEPENDENCY-CYCLE prevents cyclic dependency mutation |
| IC-PROP-SYSTEM-DEPENDENCY-REMOVE-BLOCKED | 3228-3257 | CH-06 | IC-PROP-SYSTEM-DEPENDENCY-REMOVE-BLOCKED prevents removal of seeded hard dependency |
| IC-PROP-ANALYZE-PLAN | 3258-3295 | CH-07 | IC-PROP-ANALYZE-PLAN creates deterministic planning run without mutating proposal |
| IC-PROP-APPLY-RECOMMENDED-PLAN | 3296-3342 | CH-07 | IC-PROP-APPLY-RECOMMENDED-PLAN reorders milestones, redraws draw groups, and clears hard ordering errors |
| IC-PROP-SPLIT-DRAW-GROUP | 3343-3384 | CH-07 | IC-PROP-SPLIT-DRAW-GROUP increases fee count and recomputes financing cost |
| IC-PROP-MERGE-DRAW-GROUP | 3385-3425 | CH-07 | IC-PROP-MERGE-DRAW-GROUP decreases fee count and recomputes financing cost |
| IC-PROP-CAPITAL-CASCADE | 3426-3461 | CH-07 | IC-PROP-CAPITAL-CASCADE pushes later draw groups after extending an earlier draw |
| IC-PROP-SUBMIT-BLOCKED | 3462-3498 | CH-07 | IC-PROP-SUBMIT-BLOCKED prevents submission while hard errors remain |
| IC-PROP-SUBMIT-SUCCESS | 3499-3541 | CH-07 | IC-PROP-SUBMIT-SUCCESS freezes proposal and writes audit/outbox |

