# Build Workspace Coverage Seed

This is the planned coverage seed derived from the Implementation Companion. It is not the final implemented coverage matrix.

## Interactive Control Coverage Seed

| Control / Contract | Mode | Chunk | Primary test | Convex functions | Status |
| --- | --- | --- | --- | --- | --- |
| IC-ACT-SHELL-SCENARIO-LINK | active | CH-04 | IC-ACT-SHELL-SCENARIO-LINK navigates between isolated active and proposal routes | N/A - view state only | planned |
| IC-ACT-SHELL-PERSONA-SELECT | active | CH-04 | IC-ACT-SHELL-PERSONA-SELECT changes available controls without mutating build state | N/A - view state only | planned |
| IC-ACT-MILESTONE-CARD-SELECT | active | CH-04 | IC-ACT-MILESTONE-CARD-SELECT opens detail sheet and highlights dependency neighborhood | N/A - view state only | planned |
| IC-ACT-RAIL-CARD-SELECT-DATE-RUNNERS | active | CH-04 | IC-ACT-RAIL-CARD-SELECT-DATE-RUNNERS shows start and end date runners for selected milestone | N/A - view state only | planned |
| IC-ACT-GANTT-RESOLUTION-CHANGE | active | CH-04 | IC-ACT-GANTT-RESOLUTION-CHANGE changes timeline granularity without changing domain dates | N/A - view state only | planned |
| IC-ACT-GANTT-COLUMN-SIZE-SLIDER | active | CH-04 | IC-ACT-GANTT-COLUMN-SIZE-SLIDER widens time columns without changing active resolution or persisted dates | N/A - view state only | planned |
| IC-ACT-MILESTONE-RAIL-COLLAPSE | active | CH-04 | IC-ACT-MILESTONE-RAIL-COLLAPSE expands gantt width and preserves selected milestone | N/A - view state only | planned |
| IC-ACT-DRAW-GROUP-BOX-GEOMETRY | active | CH-04 | IC-ACT-DRAW-GROUP-BOX-GEOMETRY encloses all milestones in the draw group and keeps label clear of cards | N/A - view state only | planned |
| IC-ACT-GANTT-FORECAST-RESIZE-END | active | CH-04 | IC-ACT-GANTT-FORECAST-RESIZE-END extends Foundation forecast and pushes Draw 3 start via capital clamp | demo_updateForecastDatesWithReason | planned |
| IC-ACT-GANTT-FORECAST-INVALID-BLOCKS-SUBMIT | active | CH-04 | IC-ACT-GANTT-FORECAST-INVALID-BLOCKS-SUBMIT prevents completion claim while forecast violates hard sequencing | demo_submitCompletionClaim | planned |
| IC-ACT-MILESTONE-MARK-COMPLETE | active | CH-05 | IC-ACT-MILESTONE-MARK-COMPLETE marks Foundation complete but keeps claim blocked until evidence exists | demo_updateMilestoneProgress | planned |
| IC-ACT-EVIDENCE-ADD-SAMPLE | active | CH-05 | IC-ACT-EVIDENCE-ADD-SAMPLE adds deterministic Foundation evidence and updates readiness | demo_addSampleEvidence | planned |
| IC-ACT-EVIDENCE-UPLOAD-METADATA | active | CH-05 | IC-ACT-EVIDENCE-UPLOAD-METADATA stores file metadata only and updates evidence count | demo_registerUploadedEvidenceMetadata | planned |
| IC-ACT-EVIDENCE-REMOVE-DRAFT | active | CH-05 | IC-ACT-EVIDENCE-REMOVE-DRAFT removes draft evidence and re-blocks submission when no evidence remains | demo_removeEvidenceFile | planned |
| IC-ACT-SUBMIT-COMPLETION-CLAIM | active | CH-05 | IC-ACT-SUBMIT-COMPLETION-CLAIM submits Foundation claim, freezes evidence, creates rollover when requested amount is lower, and writes audit/outbox | demo_submitCompletionClaim | planned |
| IC-ACT-LENDER-APPROVE-EVIDENCE | active | CH-05 | IC-ACT-LENDER-APPROVE-EVIDENCE accepts Foundation evidence without approving completion | demo_reviewEvidence | planned |
| IC-ACT-LENDER-REQUEST-SITE-VISIT | active | CH-05 | IC-ACT-LENDER-REQUEST-SITE-VISIT creates Foundation site visit and exposes it to Site Visitor persona | demo_requestSiteVisit | planned |
| IC-ACT-SITE-VISITOR-CLAIM-VISIT | active | CH-05 | IC-ACT-SITE-VISITOR-CLAIM-VISIT claims assigned Foundation site visit and opens report form | demo_claimSiteVisit | planned |
| IC-ACT-SITE-VISITOR-SUBMIT-REPORT | active | CH-05 | IC-ACT-SITE-VISITOR-SUBMIT-REPORT completes Foundation site visit and unlocks Lender Admin completion approval | demo_submitSiteVisitReport | planned |
| IC-ACT-LENDER-APPROVE-COMPLETION | active | CH-05 | IC-ACT-LENDER-APPROVE-COMPLETION approves Foundation and removes hard dependency blocker from Underground Plumbing | demo_approveMilestoneCompletion | planned |
| IC-ACT-LENDER-APPROVE-COMPLETION-WITH-SITE-VISIT-OVERRIDE | active | CH-05 | IC-ACT-LENDER-APPROVE-COMPLETION-WITH-SITE-VISIT-OVERRIDE requires override reason and records it in audit trail | demo_approveMilestoneCompletion | planned |
| IC-ACT-LENDER-REJECT-COMPLETION | active | CH-05 | IC-ACT-LENDER-REJECT-COMPLETION rejects a submitted claim only when reason is provided | demo_rejectMilestoneCompletion | planned |
| IC-ACT-DRAW-GROUP-AUTO-RELEASE | active | CH-05 | IC-ACT-DRAW-GROUP-AUTO-RELEASE release-approves Draw 2 and unblocks Draw 3 capital after final milestone approval | demo_approveMilestoneCompletion, demo_recomputeDrawGroupStatuses | planned |
| IC-ACT-AUDIT-DRAWER-FILTER | active | CH-05 | IC-ACT-AUDIT-DRAWER-FILTER filters append-only audit events by Foundation milestone | demo_getAuditEvents | planned |
| IC-ACT-EVENT-OUTBOX-VIEW | active | CH-05 | IC-ACT-EVENT-OUTBOX-VIEW shows mock-delivered completion and draw release events after active happy path | demo_getEventOutbox | planned |
| IC-ACT-DEMO-RESET | active | CH-05 | IC-ACT-DEMO-RESET reseeds active and proposal scenarios after confirmation | demo_resetDrawFlowDemo | planned |
| IC-PROP-MILESTONE-CARD-SELECT | proposal | CH-06 | IC-PROP-MILESTONE-CARD-SELECT selects milestone, scrolls rail-card into view, and opens detail sheet | N/A - view state only | planned |
| IC-PROP-MILESTONE-REORDER | proposal | CH-06 | IC-PROP-MILESTONE-REORDER changes proposal order and writes audit event | demo_reorderProposalMilestones | planned |
| IC-PROP-GANTT-MOVE | proposal | CH-06 | IC-PROP-GANTT-MOVE shifts proposal milestone dates and updates cost summary | demo_updateProposalMilestonePlannedDates | planned |
| IC-PROP-GANTT-RESIZE-START | proposal | CH-06 | IC-PROP-GANTT-RESIZE-START changes start date and duration | demo_updateProposalMilestonePlannedDates | planned |
| IC-PROP-GANTT-RESIZE-END | proposal | CH-06 | IC-PROP-GANTT-RESIZE-END changes end date, duration, draw box, and audit log | demo_updateProposalMilestonePlannedDates | planned |
| IC-PROP-ADD-MILESTONE | proposal | CH-06 | IC-PROP-ADD-MILESTONE creates selected custom milestone with zero-value validation error | demo_addProposalMilestone | planned |
| IC-PROP-EDIT-VALUE | proposal | CH-06 | IC-PROP-EDIT-VALUE updates draw group total and blocks when over cap | demo_updateProposalMilestoneValue | planned |
| IC-PROP-EDIT-DURATION | proposal | CH-06 | IC-PROP-EDIT-DURATION updates end date and bottom summary | demo_updateProposalMilestoneDuration | planned |
| IC-PROP-DEPENDENCY-ADD | proposal | CH-06 | IC-PROP-DEPENDENCY-ADD creates hard blocker edge and highlights dependency neighborhood | demo_addProposalDependency | planned |
| IC-PROP-DEPENDENCY-CYCLE | proposal | CH-06 | IC-PROP-DEPENDENCY-CYCLE prevents cyclic dependency mutation | demo_addProposalDependency | planned |
| IC-PROP-SYSTEM-DEPENDENCY-REMOVE-BLOCKED | proposal | CH-06 | IC-PROP-SYSTEM-DEPENDENCY-REMOVE-BLOCKED prevents removal of seeded hard dependency | demo_removeProposalDependency | planned |
| IC-PROP-ANALYZE-PLAN | proposal | CH-07 | IC-PROP-ANALYZE-PLAN creates deterministic planning run without mutating proposal | demo_recomputeProposalPlan, demo_recomputePlanningRun | planned |
| IC-PROP-APPLY-RECOMMENDED-PLAN | proposal | CH-07 | IC-PROP-APPLY-RECOMMENDED-PLAN reorders milestones, redraws draw groups, and clears hard ordering errors | demo_applyProposalPlanRecommendation | planned |
| IC-PROP-SPLIT-DRAW-GROUP | proposal | CH-07 | IC-PROP-SPLIT-DRAW-GROUP increases fee count and recomputes financing cost | demo_splitProposalDrawGroup | planned |
| IC-PROP-MERGE-DRAW-GROUP | proposal | CH-07 | IC-PROP-MERGE-DRAW-GROUP decreases fee count and recomputes financing cost | demo_mergeProposalDrawGroups | planned |
| IC-PROP-CAPITAL-CASCADE | proposal | CH-07 | IC-PROP-CAPITAL-CASCADE pushes later draw groups after extending an earlier draw | demo_updateProposalMilestonePlannedDates | planned |
| IC-PROP-SUBMIT-BLOCKED | proposal | CH-07 | IC-PROP-SUBMIT-BLOCKED prevents submission while hard errors remain | demo_submitProposal | planned |
| IC-PROP-SUBMIT-SUCCESS | proposal | CH-07 | IC-PROP-SUBMIT-SUCCESS freezes proposal and writes audit/outbox | demo_submitProposal | planned |

## Projection Coverage Seed

| Projection Element | Source Tables | Engine Helper | Rendered By | Business Rule | Test | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Active draw group box geometry | demo_drawGroups, demo_milestones | computeWorkspaceProjection / Gantt geometry | DrawGroupBoxLayer | Box spans earliest/latest date and first/last row. | IC-ACT-DRAW-GROUP-BOX-GEOMETRY encloses all milestones in the draw group and keeps label clear of cards | planned |
| Proposal draw group cap error | demo_drawGroups, demo_milestones | validateConstructionInvariants | ValidationPanel | Draw group over CAD $260k blocks submit. | IC-PROP-EDIT-VALUE updates draw group total and blocks when over cap | planned |
| Active Framing capital blocker | demo_drawGroups, demo_milestones | computeBlockingReasons | BlockingReasonChips | Future draw blocked until previous draw release-approved. | IC-ACT-DRAW-GROUP-AUTO-RELEASE release-approves Draw 2 and unblocks Draw 3 capital after final milestone approval | planned |
| Cost summary | demo_drawGroups, demo_milestones, demo_rolloverBuffers, demo_policySnapshots | computeFinancingCostEstimate | FooterStatusRegion / ProposalFooterStatusRegion | Interest and fees derive from requested amounts and dates. | IC-PROP-SPLIT-DRAW-GROUP increases fee count and recomputes financing cost | planned |

## Test Coverage Summary Seed

| Area | Required Tests | Implemented Tests | Passing? | Notes |
| --- | --- | --- | --- | --- |
| Active shell/navigation/persona | 3 | 0 | not run | Planned in CH-04. |
| Active Gantt/layout | 7 | 0 | not run | Planned in CH-04 and CH-09. |
| Active claim/review/site visit/approval | 12 | 0 | not run | Planned in CH-05. |
| Active audit/outbox/reset | 3 | 0 | not run | Planned in CH-05 and CH-08. |
| Proposal shell/detail/editing | 6 | 0 | not run | Planned in CH-06. |
| Proposal Gantt/cascade | 5 | 0 | not run | Planned in CH-06 and CH-07. |
| Proposal planning/dependencies | 5 | 0 | not run | Planned in CH-06 and CH-07. |
| Proposal submit | 2 | 0 | not run | Planned in CH-07. |

## Rule

The final implementation may expand this seed, but it must not reduce coverage. No enabled control may end with `Convex Function = TBD` or `Primary Test = TBD`.
