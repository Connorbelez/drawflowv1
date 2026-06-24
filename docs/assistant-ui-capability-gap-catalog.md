# Assistant UI Capability Gap Catalog

This catalog inventories DrawFlow capabilities that are exposed through product UI from new Build Proposal setup through live active builds, and records the assistant interface that now covers each class of capability.

Current assistant capabilities are defined in `src/features/assistant/assistantActionCatalog.ts` and mirrored in `convex/assistant.ts`. The assistant can navigate known routes, operate the proposal setup screen through deterministic client actions, prepare HITL action plans for persisted proposal and active-build mutations, create/update/cancel proposal reminders, set calendar target dates, manage calendar saved views/sync subscriptions, and create active-build revision requests where the UI action should not directly mutate live execution state.

Anything below is either implemented as a deterministic client action, implemented as a Convex HITL action, or explicitly trust-gated when the missing primitive is a user-selected file/external provisioning action.

## Implementation Status

- Setup-screen local state is covered by client actions registered through `assistantClientActionBridge`: setup fields, address, permits skipped, step advancement, milestone/sub-milestone CRUD, sub-milestone budget/cost basis updates, material/equipment cost items, contractor assignments, and budget import rejection without a trusted file.
- Proposal persistence and review is covered by closed Convex HITL actions: setup-to-draft creation, submit/request changes/reject/approve/closing/delete, proposal milestone/draw/capital event CRUD, proposal material/equipment cost items, contractor attachment/scope assignment, staff permission updates/removal, calendar view/sync, reminder CRUD, and collaboration planning/actions.
- Active-build operations are covered by closed Convex HITL actions: non-financial detail updates, notes, material/equipment cost items, contractor attachment/scope assignment, milestone start/completion/review/info requests, evidence metadata review/update/delete, site visit schedule/reschedule/cancel/record, draw request/approve/reject/release, facility change request/review, staff permission updates/removal, direct admin timeline edits, and request-only revision records for live-build changes that should not silently mutate execution state.
- File upload/create actions for permits, documents, and evidence are in the closed catalog but intentionally fail preview/commit without a trusted user-selected attachment. Prompt-only file mutation remains blocked.
- WorkOS user provisioning actions are in the closed catalog but require the WorkOS Management action runtime. Permission updates/removal for existing staff users are covered; new external user provisioning must be routed through an action-runtime HITL executor before it can be committed from the assistant.

The tables below preserve the original audit wording so future reviews can see the source UI capability and intended interface. Treat this implementation status section as the current source of truth for whether a row is covered, delegated through HITL, or intentionally blocked by trust/runtime constraints.

## Source Surfaces

- New proposal setup:
  - `src/routes/backoffice/proposals/new.tsx`
  - `src/routes/builder/proposals/new.tsx`
  - `src/features/timeline-workspace/-TimelineSetupFlow.tsx`
  - `src/features/timeline-workspace/-TimelineMilestoneWorksheetTable.tsx`
- Proposal review/workspace:
  - `src/routes/backoffice/proposals.$planId.tsx`
  - `src/routes/builder/proposals/$proposalId/index.tsx`
  - `src/routes/builder/proposals/$proposalId/roadmap.tsx`
  - `src/features/production-proposals/ProductionProposalSurfaces.tsx`
  - `src/features/production-proposals/ProductionTimelineWorkspace.tsx`
- Active build workspace:
  - `src/routes/backoffice/builds/$buildId/route.tsx`
  - `src/routes/builder/builds/$buildId/index.tsx`
  - `src/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx`
  - `src/features/backoffice-build-detail/ActiveBuildTimelineWorkspace.tsx`
  - `src/features/backoffice-build-detail/ActiveBuildGanttWorkspace.tsx`
- Shared editors:
  - `src/features/material-planning/MaterialPlanningTab.tsx`
  - `src/features/builder-staff/BuilderStaffPermissionsPanel.tsx`

## New Build Proposal Setup

| UI capability | Existing UI / backend path | Assistant gap | Suggested interface |
| --- | --- | --- | --- |
| Set proposed start date | `TimelineSetupFlow` local form state; persisted through `createDraftProposal` / `createBrokerDraftProposal` plus `saveDraftProposalPackage` | Assistant can navigate and select Garden Suite, but cannot fill or validate date fields | `set_proposal_setup_field` client action with `{ field: "proposedStartDate", value }`; final persistence via HITL `create_build_proposal_from_setup` |
| Set total budget | `timeline-setup-budget-input`; later converted to milestone budgets and proposal total | No assistant field control except hardcoded example for existing proposal milestone budget | `set_proposal_setup_field` for local form; later HITL create action |
| Set max cash on hand / borrower working capital | `timeline-setup-cash-input`; persisted in draft package | No assistant action | `set_proposal_setup_field` with cents validation |
| Set co-pay percentage | `timeline-setup-co-pay-input`; determines reimbursable/draw availability | No assistant action | `set_proposal_setup_field` with bps validation |
| Set project address | `GoogleAddressAutocomplete` in setup | No assistant action for address/place selection | `set_proposal_setup_address` client action with selected address/place metadata |
| Upload permit files | `BlueprintPermitUploader`; builder route uploads storage objects before save | Assistant explicitly excludes document upload | Keep excluded until file-attachment trust model exists; later `attach_proposal_permit_document` with HITL and file provenance |
| Skip permits | `timeline-setup-skip-permits`; persisted as permit waiver/empty documents path | No assistant action | `set_proposal_setup_permit_status` client action; final create action should include permit-skipped state |
| Continue from template screen to milestone worksheet | `continueToBudget()` regenerates rows from selected template and budget | No assistant action | `advance_proposal_setup_step` client action |
| Create the draft proposal from setup | Backoffice: `createBrokerDraftProposal` then `saveDraftProposalPackage`; builder: `createDraftProposal`, optional document upload, then `saveDraftProposalPackage` | No assistant action for creating a proposal from setup state | `create_build_proposal_from_setup` HITL action; after confirmation executes the same route flow |
| Choose redirect to durable roadmap vs proposal detail | Builder setup passes `redirectToDurableRoute` | No assistant action | Include `redirectTo` in `create_build_proposal_from_setup` |

## Setup Milestone Worksheet

| UI capability | Existing UI / backend path | Assistant gap | Suggested interface |
| --- | --- | --- | --- |
| Include/exclude a milestone row | `TimelineMilestoneWorksheetTable` local rows | No assistant action | `set_setup_milestone_included` client action |
| Add custom milestone | `addCustomMilestone()` creates a row with default sub-milestone | No assistant action | `create_setup_milestone` client action; persisted by final create HITL |
| Reorder milestones | Drag/reorder helpers in worksheet | No assistant action | `reorder_setup_milestones` client action |
| Edit milestone name/type/icon | Worksheet row editing and detail sheet | Assistant can only update persisted milestone schedule/budget after proposal exists | `update_setup_milestone` client action; persisted by final create HITL |
| Edit milestone start day/duration/budget | Worksheet row fields; cascade helpers | Assistant cannot operate setup rows | `update_setup_milestone_schedule_budget` client action |
| Cascade budget edits | `cascadeBudgetEdit` and setup cascade toggle | No assistant action | `set_setup_budget_cascade_mode` plus normal row update action |
| Add sub-milestone from bank or custom input | `SubMilestoneEditor` / `SubMilestoneBank` | No assistant action | `create_setup_submilestone` client action |
| Edit sub-milestone name, budget, start day, duration | `SubMilestoneDetailEditor`; persisted as proposal submilestones | No assistant action; this is the exact current gap for sub-milestone cost basis | `update_setup_submilestone` client action |
| Move sub-milestone within or between milestones | `moveSubMilestoneWithinSummaryRows` / `moveSubMilestone` | No assistant action | `move_setup_submilestone` client action |
| Delete sub-milestone | `onRemoveSubMilestone` | No assistant action | `delete_setup_submilestone` client action |
| Edit field guidance / verification note | `FieldGuidanceEditor` and `SubMilestoneFieldGuidanceEditor` | No assistant action | `update_setup_field_guidance` client action |
| Import budget worksheet | Setup budget import input/status | No assistant action | Keep as file-ingestion feature; later `import_proposal_budget_workbook` with file trust/HITL |
| Add contractor assignment during setup | `ContractorAssignmentEditor`; includes contractor, role, estimated cost/hours, sub-milestone scope | No assistant action | `create_setup_contractor_assignment` client action |
| Remove contractor assignment during setup | `removeContractorAssignment` | No assistant action | `delete_setup_contractor_assignment` client action |
| Add/edit/delete material or equipment cost item during setup | `MaterialCostItemsEditor` uses embedded `MaterialPlanningTab` and local row `costItems` | No assistant action | `create_setup_cost_item`, `update_setup_cost_item`, `delete_setup_cost_item` client actions |

## Persisted Proposal Workspace

| UI capability | Existing UI / backend path | Assistant gap | Suggested interface |
| --- | --- | --- | --- |
| Submit draft proposal | `ProductionTimelineWorkspace` calls `submitProposal` | No assistant action | `submit_build_proposal` HITL |
| Request changes | Proposal review action `requestChanges` | No assistant action | `request_proposal_changes` HITL |
| Reject proposal | Proposal review action `rejectProposal` | No assistant action | `reject_proposal` HITL |
| Approve proposal, including permit waiver reason | Proposal review action `approveProposal` | No assistant action | `approve_proposal` HITL with required reason/permit waiver checks |
| Assign builder to draft | `assignDraftBuilder` | No assistant action | `assign_proposal_builder` HITL |
| Unassign builder | `unassignDraftBuilder` | No assistant action | `unassign_proposal_builder` HITL |
| Create builder claim link | `createDraftProposalClaimLink` | No assistant action | `create_proposal_claim_link` HITL or guarded client action, depending on token semantics |
| Record offline closing and create active build | `recordOfflineClosing` | No assistant action | `record_proposal_closing` HITL |
| Delete draft proposal | Kanban/list actions call `deleteDraftProposal` | No assistant action | `delete_draft_proposal` HITL destructive action |
| Update approved amount | `updateProductionProposalApprovedAmount` | No assistant action | `update_proposal_approved_amount` HITL |
| Update interest rate | `updateProductionProposalInterestRate` | No assistant action | `update_proposal_interest_rate` HITL |
| Update proposed start date | `updateProductionProposalProposedStartDate` | No assistant action | `update_proposal_start_date` HITL |
| Upload/add proposal document | `generateProposalDocumentUploadUrl` and `addProposalDocument` | Assistant excludes upload/document actions | Later file-trust based `add_proposal_document` |
| Create/update packet milestone | `createProductionTimelineMilestone`, `updateProductionTimelineMilestone` from packet/review workspace | Assistant only supports persisted milestone schedule/budget, not full milestone CRUD | `create_proposal_milestone`, `update_proposal_milestone`, `delete_proposal_milestone` HITL |
| Delete proposal milestone | `deleteProductionTimelineMilestone` in timeline workspace | No assistant action | `delete_proposal_milestone` HITL |
| Create/update/delete proposal draw row beyond planned draw subset | `createProductionTimelineDraw`, `updateProductionTimelineDraw`, `deleteProductionTimelineDraw`, `updateSubmittedProposalDrawScheduleRow` | Assistant has planned draw CRUD, but not the full proposal draw row/updateSubmitted route semantics | Expand draw actions to cover draft/submitted/approved status rules |
| Create/update/delete capital event | `createProductionTimelineCapitalEvent`, `updateProductionTimelineCapitalEvent`, `deleteProductionTimelineCapitalEvent` | No assistant action | `create_proposal_capital_event`, `update_proposal_capital_event`, `delete_proposal_capital_event` HITL |
| Create cash infusion | `createProductionTimelineCashInfusion` | No assistant action | `create_proposal_cash_infusion` HITL |
| Create/update/delete evidence assets on proposal timeline | `generateProductionEvidenceUploadUrl`, `createProductionTimelineEvidenceAsset`, `updateProductionTimelineEvidenceAsset`, `deleteProductionTimelineEvidenceAsset` | Assistant excludes evidence upload and cannot edit existing evidence metadata | Later `update_proposal_evidence_asset` and file-trust upload actions |
| Request/review proposal timeline modification | `requestProductionTimelineModification`, `reviewProductionTimelineModificationRequest` | No assistant action | `request_proposal_timeline_modification`, `review_proposal_timeline_modification` HITL |
| Update proposal timeline plan state | `updateProductionTimelinePlanState` | No assistant action | `update_proposal_timeline_plan_state` HITL |

## Proposal Materials, Contractors, Calendar, Staff

| UI capability | Existing UI / backend path | Assistant gap | Suggested interface |
| --- | --- | --- | --- |
| Create/update/delete material or equipment cost item | `MaterialPlanningTab`; `createProposalCostItem`, `updateProposalCostItem`, `deleteProposalCostItem` | No assistant action | `create_proposal_cost_item`, `update_proposal_cost_item`, `delete_proposal_cost_item` HITL |
| Scope cost item to sub-milestones | `MaterialPlanningPayload.relevantSubmilestoneKeys` | No assistant action | Include `relevantSubmilestoneKeys` in cost item actions |
| Attach existing contractor to proposal | `attachProposalContractor` | No assistant action | `attach_proposal_contractor` HITL |
| Create and attach contractor | `createAndAttachProposalContractor` | No assistant action | `create_and_attach_proposal_contractor` HITL |
| Assign contractor to milestone/sub-milestone with estimated cost/hours | `assignProposalContractorToMilestone` | No assistant action | `assign_proposal_contractor_to_scope` HITL |
| Save/provision/remove proposal builder staff permissions | `BuilderStaffPermissionsPanel`; `saveProposalBuilderStaffPermissions`, `provisionProposalBuilderStaffPermissions`, `removeProposalBuilderStaffMember` | No assistant action | `provision_proposal_builder_staff`, `update_proposal_builder_staff_permissions`, `remove_proposal_builder_staff` HITL |
| Save custom calendar view | `saveCalendarView` | No assistant action | `save_calendar_view` HITL or user-local action depending persistence semantics |
| Create external calendar sync subscription | `createCalendarSyncSubscription` | No assistant action | `create_calendar_sync_subscription` HITL |
| Record external calendar sync change | `recordExternalCalendarSyncChange` | No assistant action | Probably not assistant-facing; internal/system action only |
| Calendar reminder CRUD | `create/update/deleteProposalReminderCalendarEvent` | Mostly covered by assistant catalog (`create/update/cancel_proposal_reminder`) | Need parser/planner coverage for update/cancel, but catalog exists |
| Calendar target dates | `setEvidenceDueDate`, `setReviewTargetDate`, `setAdminDecisionTargetDate`, `setDrawReleaseTargetDate` | Covered by `set_calendar_target_date` catalog | Need broader natural language parser coverage, but not a catalog gap |

## Proposal Collaboration

| UI capability | Existing UI / backend path | Assistant gap | Suggested interface |
| --- | --- | --- | --- |
| Start collaboration session | `proposal_collaboration.startSession` | No assistant action | `start_proposal_collaboration` HITL |
| Stop collaboration session | `proposal_collaboration.stopSession` | No assistant action | `stop_proposal_collaboration` HITL |
| Invite participant | `proposal_collaboration.inviteParticipant` | No assistant action | `invite_proposal_collaborator` HITL |
| Set participant permission | `proposal_collaboration.setParticipantPermission` | No assistant action | `set_proposal_collaborator_permission` HITL |
| Assign session to builder | `proposal_collaboration.assignSessionToBuilder` | No assistant action | `assign_collaboration_to_builder` HITL |
| Undo/redo proposal timeline | `undoProposalTimeline`, `redoProposalTimeline` | No assistant action | `undo_proposal_timeline`, `redo_proposal_timeline` immediate client/Convex action with trace |
| Join session / presence heartbeat / cursor updates | `joinSession`, `presenceHeartbeat`, `updatePresenceData` | No assistant action | Usually not assistant-facing except `join_proposal_collaboration` when opening a shared link |

## Active Build Workspace

| UI capability | Existing UI / backend path | Assistant gap | Suggested interface |
| --- | --- | --- | --- |
| Update active build non-financial details | `updateActiveBuildNonFinancialDetails`; build name, location, start date/place metadata | No assistant action | `update_active_build_details` HITL |
| Add active build note | `addActiveBuildNote` | No assistant action | `add_active_build_note` HITL |
| Add active build document | `addActiveBuildDocument` | No assistant action | Later file-trust based `add_active_build_document` |
| Delete active build | Backoffice dashboard/list action `deleteActiveBuild` | No assistant action | `delete_active_build` destructive HITL |
| Create/update/delete active-build material or equipment cost item | `createActiveBuildCostItem`, `updateActiveBuildCostItem`, `deleteActiveBuildCostItem` | No assistant action | `create_active_build_cost_item`, `update_active_build_cost_item`, `delete_active_build_cost_item` HITL |
| Attach existing contractor to active build | `attachActiveBuildContractor` | No assistant action | `attach_active_build_contractor` HITL |
| Create contractor profile from build and attach/assign | `createContractorProfile`, `createAndAssignContractor` UI flow | No assistant action | `create_and_assign_active_build_contractor` HITL |
| Assign contractor to active-build milestone/sub-milestone | `assignActiveBuildContractorToMilestone` | No assistant action | `assign_active_build_contractor_to_scope` HITL |
| Start milestone work | `startActiveBuildMilestone` | No assistant action | `start_active_build_milestone` HITL |
| Submit milestone completion with actual cost/quality/evidence note | `submitActiveBuildMilestoneCompletion` | No assistant action | `submit_active_build_milestone_completion` HITL |
| Approve active-build milestone | `approveActiveBuildMilestone` | No assistant action | `approve_active_build_milestone` HITL |
| Reject active-build milestone | `rejectActiveBuildMilestone` | No assistant action | `reject_active_build_milestone` HITL |
| Request milestone info | `requestActiveBuildMilestoneInfo` | No assistant action | `request_active_build_milestone_info` HITL |
| Review active-build evidence | `reviewActiveBuildEvidence` | No assistant action | `review_active_build_evidence` HITL |
| Generate/upload/create/update/delete active-build evidence assets | `generateActiveBuildEvidenceUploadUrl`, `create/update/deleteActiveBuildTimelineEvidenceAsset` | Assistant cannot upload or edit evidence metadata | Later upload-trust action plus `update_active_build_evidence_asset` HITL |
| Record completed site visit report | `recordActiveBuildSiteVisit` | Assistant can schedule/reschedule/cancel, but cannot record visit report | `record_active_build_site_visit` HITL |
| Request active-build draw | `requestActiveBuildDraw` | Assistant can request draw-plan revision, not actual draw request | `request_active_build_draw` HITL |
| Approve active-build draw | `approveActiveBuildDraw` | No assistant action | `approve_active_build_draw` HITL |
| Reject active-build draw | `rejectActiveBuildDraw` | No assistant action | `reject_active_build_draw` HITL |
| Release active-build draw | `releaseActiveBuildDraw` | No assistant action | `release_active_build_draw` HITL |
| Request facility/principal/payback change | `requestActiveBuildFacilityChange`, `requestLoanFacilityDateChange` | No assistant action | `request_active_build_facility_change`, `request_active_build_payback_extension` HITL |
| Review facility change request | `reviewActiveBuildFacilityChangeRequest` | No assistant action | `review_active_build_facility_change` HITL |
| Save/provision/remove active-build builder staff permissions | `BuilderStaffPermissionsPanel`; active-build staff permission functions | No assistant action | `provision_active_build_builder_staff`, `update_active_build_builder_staff_permissions`, `remove_active_build_builder_staff` HITL |

## Active Build Timeline And Gantt Editing

These capabilities exist in `ActiveBuildTimelineWorkspace` and `ActiveBuildGanttWorkspace`. The assistant currently only creates active-build revision requests for milestone schedule, milestone budget, and draw plan. It does not expose most direct live-build edits.

| UI capability | Existing UI / backend path | Assistant gap | Suggested interface |
| --- | --- | --- | --- |
| Create/update/delete active-build milestone | `create/update/deleteActiveBuildTimelineMilestone` | Only schedule/budget revision requests exist | Prefer `request_active_build_milestone_*_revision`; direct actions only for admin-only safe cases |
| Create/update/delete active-build draw row | `create/update/deleteActiveBuildTimelineDraw` | Only draw-plan revision request exists | Prefer `request_active_build_draw_plan_revision`; direct admin actions if explicitly allowed |
| Create/update/delete active-build capital event | `create/update/deleteActiveBuildTimelineCapitalEvent` | No assistant action | `request_active_build_capital_event_revision` or admin-only HITL direct action |
| Create active-build cash infusion | `createActiveBuildTimelineCashInfusion` | No assistant action | `request_active_build_cash_infusion` HITL |
| Update active-build timeline plan state | `updateActiveBuildTimelinePlanState` | No assistant action | `update_active_build_timeline_plan_state` HITL |
| Apply active-build modification from timeline UI | `applyActiveBuildModification` path in active timeline workspace | No assistant action | Unify under active-build revision request actions |

## Recommended Build-Out Order

1. Setup client actions: set setup fields, address, permits skipped, advance step, update setup milestones/sub-milestones, setup cost items, setup contractor assignments.
2. Proposal mutation actions: create proposal from setup, submit proposal, proposal review decisions, closing, materials, contractors, staff permissions.
3. Active-build operational actions: milestone completion/review, evidence review, draw request/approve/reject/release, facility changes, notes/documents.
4. Collaboration/calendar-sync actions: start/stop/invite collaboration, calendar sync subscriptions, saved calendar views.
5. File upload actions: permits, evidence, and documents only after the assistant has a trusted attachment model and explicit file-selection HITL.

## Implementation Rule

Do not make the assistant automate these by brittle DOM clicking. Each missing capability should become either:

- a read-only/client-local action bridge entry for unsaved UI state, with `data-agent-id` affordances and AG-UI trace events; or
- a closed Convex HITL action with before/after preview, permission validation, reason handling, and audit persistence.
