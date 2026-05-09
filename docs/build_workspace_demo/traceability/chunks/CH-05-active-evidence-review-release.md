# CH-05: Active Evidence Review Release

## Purpose

Active Evidence Review Release is a bounded work packet for the DrawFlow Build Workspace demo. Read the source ranges below before implementation; do not load or duplicate the full source specs unless a cited range is insufficient.

## Source References

- interactionSpec 1509-2453: Active evidence, review, site visit, approval, release, audit, outbox, and reset contracts.
- interactionSpec 2454-2486: Required active workflow/audit/outbox/reset tests.
- implementationCompanion 739-964: Active component responsibilities and selectors.

## Companion References

- ActiveMilestoneDetailSheet: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:760-804
- EvidencePanel: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:827-851
- RolloverBufferPanel: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:852-871
- AssignedSiteVisitsPanel: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:872-891
- SiteVisitDrawer: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:892-921
- AuditDrawer: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:922-943
- EventOutboxDrawer: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:944-964
- DemoResetControls: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:235-269
- active.workflow.spec.ts: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1218-1228
- active.audit-outbox.spec.ts: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1229-1234
- src/routes/demo/drawflow/active.tsx: docs/build_workspace_demo/Drawflow Demo Implementation Companion.md:1008-1013

## Interaction Contracts

| Contract | Spec lines | Primary test |
| --- | --- | --- |
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

## Target Files Or Areas

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
**Components / UI areas**
- ActiveMilestoneDetailSheet
- EvidencePanel
- RolloverBufferPanel
- AssignedSiteVisitsPanel
- SiteVisitDrawer
- AuditDrawer
- EventOutboxDrawer
- DemoResetControls

## Implementation Boundary

- This dossier chunk is a planning/reference artifact, not an implementation patch.
- Later implementers must keep source specs authoritative and update traceability if behavior changes.
- Do not create fake enabled controls, fake drag handles, or TODO behavior paths.
- Do not count render-only smoke tests as behavioral coverage.
- Keep Convex as the domain source of truth for domain state.

## Required Downstream Tests

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

## Acceptance Gates

- All persona permissions are enforced as demo validation rules.
- Evidence submission freezes package and lower requests create rollover buffers.
- Foundation requires accepted evidence and site visit or override before approval.
- Draw 2 auto release-approves and removes Framing capital blocker after final milestone approval.
## Known Risks

- Persona validation is demo-domain validation, not real auth.
- Completion approval must enforce evidence and site visit/override requirements.
