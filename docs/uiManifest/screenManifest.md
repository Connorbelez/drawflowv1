

## 25. Screen Manifest

This manifest defines the required product screens and reusable UI components for DrawFlow. It is intended to align product, design, and engineering around a coherent interface system before detailed implementation.

The manifest uses the following reference conventions:

- **Screen IDs:** `SCR-*`
- **Component IDs:** `CMP-*`
- **Workflow references:** existing PRD workflow sections, especially `draw_flow_prd.md` §10 Core Build Workspace; `draw_flow_prd.md` §11 User Flows; `draw_flow_prd.md` §18.3 Kanban-Based Operational Workflows.
- **Primary workspace:** the Build Workspace remains the canonical domain surface. Kanban, evidence review, site visit, approval, receipt, and policy screens are operational surfaces that route into or out of the Build Workspace.

---

## 25.1 Screen Manifest

### SCR-001 — Authenticated App Shell

**Purpose:** Provides the tenant-scoped application frame for all authenticated DrawFlow screens.

**Primary users:** All authenticated users.

**UI / design description:**

- Dense professional SaaS shell.
- Left or top navigation depending on product shell direction.
- Organization switcher visible where users belong to multiple WorkOS organizations.
- Current role/org context should be visible but not visually noisy.
- Navigation should separate primary domains: Builds, Proposals, Operations, Site Visits, Draw Releases, Policies, Audit, Integrations.
- Must support role-aware navigation; users should not see inaccessible areas.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-001 — AppShell, `uiManifest/componentManifest.md` §25.2 CMP-002 — OrgSwitcher, `uiManifest/componentManifest.md` §25.2 CMP-003 — RoleAwareNav, `uiManifest/componentManifest.md` §25.2 CMP-004 — UserMenu, `uiManifest/componentManifest.md` §25.2 CMP-005 — Breadcrumbs.

**Workflow references:** all authenticated workflows; tenant/org scoping requirements in `draw_flow_prd.md` §13.1 Multi-Tenancy and Organization Scoping.

---

### SCR-002 — Build Proposal Start

**Purpose:** Entry screen for creating a new Build Proposal.

**Primary users:** Builder Lead, optionally Builder Staff, Lender Admin.

**UI / design description:**

- Form-oriented but not a generic intake form.
- Should feel like the beginning of a structured construction lending package.
- Captures project name, builder/developer identity, build type, location start point, requested loan/budget context, and high-level notes.
- Uses progressive disclosure so early intake feels approachable while still preparing for deep roadmap planning.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-006 — ProposalStepper, `uiManifest/componentManifest.md` §25.2 CMP-007 — BuildIdentityForm, `uiManifest/componentManifest.md` §25.2 CMP-008 — PrimaryActionBar, `uiManifest/componentManifest.md` §25.2 CMP-009 — ValidationSummary, `uiManifest/componentManifest.md` §25.2 CMP-010 — SaveDraftIndicator.

**Workflow references:** `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow.

**User stories:**

- As a builder lead, I can start a Build Proposal without needing to know the complete draw plan yet.
- As a lender admin, I can create or assist with a proposal on behalf of a builder where policy allows.

---

### SCR-003 — Build Site Location and Map Setup

**Purpose:** Capture and confirm the physical build site and initial geofence/build-area configuration.

**Primary users:** Builder Lead, Lender Admin.

**UI / design description:**

- Split layout with address/location fields on one side and interactive Mapbox map on the other.
- Satellite view should be default for precise visual confirmation.
- Topographical view toggle must be available.
- Build area should be circled or bounded.
- Users should be able to adjust/confirm the site marker and proposed geofence radius where permissioned.
- Admin review state should be visually distinct from builder draft state.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-011 — BuildLocationForm, `uiManifest/componentManifest.md` §25.2 CMP-012 — MapboxBuildMap, `uiManifest/componentManifest.md` §25.2 CMP-013 — MapLayerToggle, `uiManifest/componentManifest.md` §25.2 CMP-014 — BuildAreaOverlay, `uiManifest/componentManifest.md` §25.2 CMP-015 — GeofenceBoundaryOverlay, `uiManifest/componentManifest.md` §25.2 CMP-016 — GeocodeConfidenceIndicator.

**Workflow references:** `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow; `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel; `draw_flow_prd.md` §8.8 Geofenced Proof-of-Completion.

**User stories:**

- As a builder lead, I can confirm the build site location before submitting a proposal.
- As a lender admin, I can verify or correct the build area used for geofence validation.

---

### SCR-004 — Permit and Document Upload

**Purpose:** Collect required proposal documentation before roadmap submission.

**Primary users:** Builder Lead, Builder Staff, Lender Admin.

**UI / design description:**

- Checklist-driven document upload surface.
- Required vs optional documents must be obvious.
- Each document row should show upload status, validation state, uploader, timestamp, and review status where applicable.
- Drag-and-drop upload on desktop; direct file/camera support on mobile where relevant.
- Should avoid a generic file-manager feel; this is a governed proposal package.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-017 — DocumentChecklist, `uiManifest/componentManifest.md` §25.2 CMP-018 — SecureFileUploader, `uiManifest/componentManifest.md` §25.2 CMP-019 — DocumentStatusRow, `uiManifest/componentManifest.md` §25.2 CMP-020 — MissingRequirementCallout, `uiManifest/componentManifest.md` §25.2 CMP-021 — AttachmentPreviewDrawer.

**Workflow references:** `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow; `draw_flow_prd.md` §13.2 Proposal Intake.

**User stories:**

- As a builder lead, I can see exactly which permits/documents are required before submission.
- As a lender admin, I can see whether the proposal package is complete.

---

### SCR-005 — Borrower Starting Cash Input

**Purpose:** Capture the borrower's own opening cash balance used by the optimizer.

**Primary users:** Builder Lead, Lender Admin.

**UI / design description:**

- Focused financial input screen or step inside proposal flow.
- Primary field is named **Borrower Starting Cash**.
- Helper text must explain that this is the borrower's own cash available at the start of the build, before any reimbursement draws are released.
- Starting cash must be shown separately from the optimizer-derived **Required Working Capital / Peak Unreimbursed Exposure** metric.
- The screen should preview whether starting cash covers the derived requirement and identify likely cash-ledger stalls.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-022 — BorrowerStartingCashInput, `uiManifest/componentManifest.md` §25.2 CMP-023 — CapitalConstraintExplainer, `uiManifest/componentManifest.md` §25.2 CMP-024 — FeasibilityPreview, `uiManifest/componentManifest.md` §25.2 CMP-025 — CurrencyInput.

**Workflow references:** `draw_flow_prd.md` §7.10 Borrower Starting Cash; `draw_flow_prd.md` §8.5 Borrower Cash-Flow Feasibility Constraint; `draw_flow_prd.md` §9.2 Optimization Inputs; `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow.

**User stories:**

- As a builder lead, I can enter the cash I bring into the build so the system can test plan feasibility.
- As a lender admin, I can compare borrower starting cash with the plan's derived working-capital requirement.

---

### SCR-006 — Milestone Template Selection

**Purpose:** Let builder select a starting construction milestone template.

**Primary users:** Builder Lead, Lender Admin.

**UI / design description:**

- Template gallery/list with concise construction-use labels.
- Each template should summarize expected phases, milestone count, default duration model, and default dependency model.
- The user should understand templates are starting points, not rigid workflows.

**Key components:** UNRESOLVED CMP-026 — TemplateCard (definition missing from current docs), UNRESOLVED CMP-027 — TemplatePreview (definition missing from current docs), UNRESOLVED CMP-028 — TemplateComparisonDrawer (definition missing from current docs), `uiManifest/componentManifest.md` §25.2 CMP-008 — PrimaryActionBar.

**Workflow references:** `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow; `draw_flow_prd.md` §13.3 Milestone Templates.

**User stories:**

- As a builder lead, I can start from a construction template instead of building every milestone manually.

---

### SCR-007 — Draft Build Workspace / Roadmap Wizard

**Purpose:** Draft-mode version of the Build Workspace used during proposal creation.

**Primary users:** Builder Lead, Lender Admin.

**UI / design description:**

- Same core spatial model as active Build Workspace: left milestone rail and right Gantt schedule.
- Draft mode should emphasize editing, validation, and plan generation.
- Milestone cards should be reorderable.
- Cost and duration should be editable inline.
- Draw groups can be visually represented even before approval, but should be labelled as proposed.
- Warnings should be surfaced before submission.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-029 — BuildWorkspaceShell, `uiManifest/componentManifest.md` §25.2 CMP-030 — MilestoneRail, `uiManifest/componentManifest.md` §25.2 CMP-031 — MilestoneCard, `uiManifest/componentManifest.md` §25.2 CMP-032 — GanttCanvas, `uiManifest/componentManifest.md` §25.2 CMP-033 — TimelineHeader, `uiManifest/componentManifest.md` §25.2 CMP-034 — GanttTaskBlock, `uiManifest/componentManifest.md` §25.2 CMP-035 — DrawGroupBoundary, `uiManifest/componentManifest.md` §25.2 CMP-036 — InlineCostDurationEditor, `uiManifest/componentManifest.md` §25.2 CMP-037 — DependencyInspector, `uiManifest/componentManifest.md` §25.2 CMP-038 — WarningRail, `uiManifest/componentManifest.md` §25.2 CMP-039 — DraftModeBanner.

**Workflow references:** `draw_flow_prd.md` §10 Core Build Workspace; `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow; `draw_flow_prd.md` §13.4 Dependency Management; `draw_flow_prd.md` §13.5 Draw Planning.

**User stories:**

- As a builder lead, I can edit milestones and dependencies in one workspace.
- As a lender admin, I can quickly understand the proposed construction sequence and draw grouping.

---

### SCR-008 — Draw Plan Comparison

**Purpose:** Compare generated optimizer outputs before proposal submission or after budget revision.

**Primary users:** Builder Lead, Lender Admin.

**UI / design description:**

- Three-plan comparison: Cheapest Feasible, Fastest, Capital-Constrained.
- Should use cards for summary and a deeper comparison table for financing/capital tradeoffs.
- Must separately show estimated interest, draw fees, total financing cost, peak unreimbursed exposure, expected duration, and feasibility warnings.
- Recommended plan should be visually emphasized but not coercive.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-040 — OptimizationPlanCard, `uiManifest/componentManifest.md` §25.2 CMP-041 — PlanComparisonTable, `uiManifest/componentManifest.md` §25.2 CMP-042 — FinancingCostBreakdown, `uiManifest/componentManifest.md` §25.2 CMP-043 — CapitalExposureSummary, `uiManifest/componentManifest.md` §25.2 CMP-044 — FeasibilityBadge, `uiManifest/componentManifest.md` §25.2 CMP-045 — PlanExplanationPanel.

**Workflow references:** `draw_flow_prd.md` §§9.3–9.7 (Optimization Outputs through Plan Comparison); `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow; `draw_flow_prd.md` §11.7 Budget Revision Flow.

**User stories:**

- As a builder lead, I can understand why the cheapest plan may not be the fastest.
- As a lender admin, I can review whether the selected plan is economically and operationally reasonable.

---

### SCR-009 — Proposal Review and Submit

**Purpose:** Final builder-side review before proposal submission.

**Primary users:** Builder Lead.

**UI / design description:**

- Package review page with collapsible sections: Build Details, Site Map, Documents, Budget, Roadmap, Draw Plan, Warnings.
- Submission readiness should be explicit.
- Blocking issues vs warnings must be clearly separated.
- Builder should be able to jump back to any incomplete section.

**Key components:** UNRESOLVED CMP-046 — ProposalPackageSummary (definition missing from current docs), UNRESOLVED CMP-047 — ReadinessChecklist (definition missing from current docs), UNRESOLVED CMP-048 — WarningSummary (definition missing from current docs), UNRESOLVED CMP-049 — SubmitConfirmationModal (definition missing from current docs), `uiManifest/componentManifest.md` §25.2 CMP-005 — Breadcrumbs.

**Workflow references:** `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow.

**User stories:**

- As a builder lead, I can review the full proposal package before submitting it to the lender.

---

### SCR-010 — Admin Proposal Review Queue

**Purpose:** Lender admin queue for submitted Build Proposals.

**Primary users:** Lender Admin.

**UI / design description:**

- Queue/table hybrid optimized for triage.
- Cards or rows should show builder, build name, requested budget/loan, warning count, document completeness, plan feasibility, working-capital flag, and submission age.
- Filters for status, risk, missing docs, high variance, and assigned reviewer.

**Key components:** UNRESOLVED CMP-050 — ProposalQueueTable (definition missing from current docs), UNRESOLVED CMP-051 — RiskSummaryPill (definition missing from current docs), UNRESOLVED CMP-052 — QueueFilterBar (definition missing from current docs), UNRESOLVED CMP-053 — AssignmentControl (definition missing from current docs), UNRESOLVED CMP-054 — EmptyState (definition missing from current docs).

**Workflow references:** `draw_flow_prd.md` §11.2 Lender Admin Proposal Review Flow.

**User stories:**

- As a lender admin, I can triage incoming proposals by completeness and risk.

---

### SCR-011 — Admin Proposal Review Detail

**Purpose:** Lender admin review surface for accepting, rejecting, or requesting changes to a Build Proposal.

**Primary users:** Lender Admin.

**UI / design description:**

- Review-oriented detail page with sticky decision panel.
- Should include proposal package summary, site map, document checklist, roadmap preview, draw plan comparison, warnings, and comment/decision controls.
- Admin should be able to approve, reject, request changes, or override warnings with reason.

**Key components:** UNRESOLVED CMP-046 — ProposalPackageSummary (definition missing from current docs), `uiManifest/componentManifest.md` §25.2 CMP-012 — MapboxBuildMap, `uiManifest/componentManifest.md` §25.2 CMP-017 — DocumentChecklist, `uiManifest/componentManifest.md` §25.2 CMP-040 — OptimizationPlanCard, UNRESOLVED CMP-055 — AdminDecisionPanel (definition missing from current docs), `uiManifest/componentManifest.md` §25.2 CMP-056 — OverrideReasonModal, UNRESOLVED CMP-057 — ReviewCommentBox (definition missing from current docs).

**Workflow references:** `draw_flow_prd.md` §11.2 Lender Admin Proposal Review Flow; `draw_flow_prd.md` §8.6 Milestone Dependencies; `draw_flow_prd.md` §8.7 Site Visit Control; `draw_flow_prd.md` §8.9 Budget Overrun and Revision.

**User stories:**

- As a lender admin, I can approve a complete and credible proposal into an active Build.
- As a lender admin, I can request changes with specific reasons.

---

### SCR-012 — Active Build Workspace

**Purpose:** Main operational workspace for active Builds.

**Primary users:** Builder Lead, Lender Admin. Secondary: Builder Staff, Lender Staff.

**UI / design description:**

- The product’s canonical workspace.
- Dark/dense productivity layout matching product vision: left milestone card rail; right schedule/Gantt; draw group bounding boxes; top build summary bar; bottom status summary.
- Role-aware controls: builder users see update/proof actions; lender admins see review/approval actions; staff see review/routing actions.
- Should support map and chat panels/drawers without displacing the core roadmap.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-029 — BuildWorkspaceShell, `uiManifest/componentManifest.md` §25.2 CMP-030 — MilestoneRail, `uiManifest/componentManifest.md` §25.2 CMP-031 — MilestoneCard, `uiManifest/componentManifest.md` §25.2 CMP-032 — GanttCanvas, `uiManifest/componentManifest.md` §25.2 CMP-035 — DrawGroupBoundary, `uiManifest/componentManifest.md` §25.2 CMP-058 — BuildHeader, `uiManifest/componentManifest.md` §25.2 CMP-059 — WorkspaceSummaryBar, `uiManifest/componentManifest.md` §25.2 CMP-060 — RoleAwareActionPanel, `uiManifest/componentManifest.md` §25.2 CMP-061 — BuildMapDrawer, `uiManifest/componentManifest.md` §25.2 CMP-062 — DealChatPanel, `uiManifest/componentManifest.md` §25.2 CMP-063 — ActivityFeedDrawer.

**Workflow references:** `draw_flow_prd.md` §10 Core Build Workspace; `draw_flow_prd.md` §§11.3–11.7 (Active Build Update Flow through Budget Revision Flow); `draw_flow_prd.md` §18.3 Kanban-Based Operational Workflows.

**User stories:**

- As a builder lead, I can understand what work is next and which draw it supports.
- As a lender admin, I can see build progress, draw readiness, and approval blockers in one place.

---

### SCR-013 — Milestone Detail Drawer / Page

**Purpose:** Detailed milestone view for progress, evidence, costs, dependencies, subtasks, and review state.

**Primary users:** Builder Lead, Builder Staff, Lender Staff, Lender Admin.

**UI / design description:**

- Prefer drawer from Build Workspace for context preservation.
- Full page is acceptable on mobile or deep links.
- Should show milestone summary, status timeline, estimated vs actual cost, estimated vs actual duration, dependencies, evidence requirements, uploaded evidence, and related draw group.
- Builder-facing actions and lender-facing actions must be role-separated.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-064 — MilestoneDetailDrawer, `uiManifest/componentManifest.md` §25.2 CMP-065 — StatusTimeline, `uiManifest/componentManifest.md` §25.2 CMP-066 — BudgetVariancePanel, `uiManifest/componentManifest.md` §25.2 CMP-067 — DependencyList, `uiManifest/componentManifest.md` §25.2 CMP-068 — EvidenceRequirementChecklist, `uiManifest/componentManifest.md` §25.2 CMP-069 — EvidenceGallery, `uiManifest/componentManifest.md` §25.2 CMP-070 — RelatedDrawSummary.

**Workflow references:** `draw_flow_prd.md` §11.3 Active Build Update Flow; `draw_flow_prd.md` §18.3.4 Flow 1 — Builder Marks Milestone Complete; `draw_flow_prd.md` §18.3.8 Flow 5 — Admin Reviews Proof and Recommendation.

**User stories:**

- As a builder staff member, I can update a milestone without losing the build context.
- As a lender admin, I can review milestone state before approval.

---

### SCR-014 — Mobile Proof Upload

**Purpose:** Mobile-first proof-of-completion capture flow with geofence verification.

**Primary users:** Builder Lead, Builder Staff.

**UI / design description:**

- Camera-first mobile flow.
- Should feel like a field submission workflow, not a file manager.
- Shows milestone name, required evidence checklist, geofence status, camera capture, notes, actual cost, and submit action.
- Geofence state should be visible but not confusing: verified, checking, failed, unavailable, low-confidence.
- Failed geofence should warn the user that lender review may be required, not block by default unless policy demands.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-071 — MobileCaptureShell, `uiManifest/componentManifest.md` §25.2 CMP-072 — CameraCapture, `uiManifest/componentManifest.md` §25.2 CMP-073 — GeofenceCaptureGate, `uiManifest/componentManifest.md` §25.2 CMP-074 — GeofenceStatusBadge, `uiManifest/componentManifest.md` §25.2 CMP-075 — ActualCostInput, `uiManifest/componentManifest.md` §25.2 CMP-076 — CompletionReportForm, `uiManifest/componentManifest.md` §25.2 CMP-077 — MobileSubmitBar, `uiManifest/componentManifest.md` §25.2 CMP-010 — SaveDraftIndicator.

**Workflow references:** `draw_flow_prd.md` §8.8 Geofenced Proof-of-Completion; `draw_flow_prd.md` §11.3 Active Build Update Flow; `draw_flow_prd.md` §18.3.4 Flow 1 — Builder Marks Milestone Complete.

**User stories:**

- As builder staff at the site, I can capture proof directly from my phone.
- As a lender admin, I can later see whether the proof was captured within the site geofence.

---

### SCR-015 — Lender Evidence Review Kanban

**Purpose:** Kanban board for lender staff reviewing milestone completion submissions.

**Primary users:** Lender Staff, Lender Admin.

**UI / design description:**

- Operational kanban board with columns: New Submission, Claimed/In Review, Needs More Information, Site Visit Required, Ready for Admin, Closed.
- Cards should be dense and triage-oriented.
- Use compact signals: geofence status, evidence count, budget variance, SLA, assigned user, draw group.
- Board should route into Evidence Review Detail.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-078 — KanbanBoard, `uiManifest/componentManifest.md` §25.2 CMP-079 — KanbanColumn, `uiManifest/componentManifest.md` §25.2 CMP-080 — WorkOrderCard, `uiManifest/componentManifest.md` §25.2 CMP-081 — WorkOrderFilterBar, `uiManifest/componentManifest.md` §25.2 CMP-082 — ClaimWorkOrderButton, `uiManifest/componentManifest.md` §25.2 CMP-083 — SLAIndicator, `uiManifest/componentManifest.md` §25.2 CMP-074 — GeofenceStatusBadge.

**Workflow references:** `draw_flow_prd.md` §18.3.3 Kanban Board Types; `draw_flow_prd.md` §18.3.5 Flow 2 — Staff Picks Up Evidence Review Work Order.

**User stories:**

- As lender staff, I can claim new milestone evidence submissions from a board.
- As lender admin, I can see operational review bottlenecks.

---

### SCR-016 — Evidence Review Detail

**Purpose:** Staff review screen for submitted milestone completion packages.

**Primary users:** Lender Staff, Lender Admin.

**UI / design description:**

- Split review layout: evidence/gallery on one side, structured checklist and recommendation controls on the other.
- Must show milestone context, builder report, actual cost, budget variance, geofence status, related draw group, and required evidence checklist.
- Staff actions: recommend approval, request more information, request site visit, recommend rejection.
- Should prevent final approval by non-admin users.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-084 — EvidenceReviewLayout, `uiManifest/componentManifest.md` §25.2 CMP-069 — EvidenceGallery, `uiManifest/componentManifest.md` §25.2 CMP-085 — StaffReviewChecklist, `uiManifest/componentManifest.md` §25.2 CMP-086 — RecommendationComposer, `uiManifest/componentManifest.md` §25.2 CMP-087 — RequestMoreInfoForm, `uiManifest/componentManifest.md` §25.2 CMP-088 — RequestSiteVisitButton, `uiManifest/componentManifest.md` §25.2 CMP-066 — BudgetVariancePanel, `uiManifest/componentManifest.md` §25.2 CMP-070 — RelatedDrawSummary.

**Workflow references:** `draw_flow_prd.md` §11.4 Evidence Review Flow; `draw_flow_prd.md` §18.3.5 Flow 2 — Staff Picks Up Evidence Review Work Order; `draw_flow_prd.md` §18.3.6 Flow 3 — Builder Responds to More Information Request.

**User stories:**

- As lender staff, I can review proof and submit a recommendation without final-approving the milestone.

---

### SCR-017 — More Information Request / Builder Response

**Purpose:** Resolve missing or unclear evidence requests.

**Primary users:** Builder Lead, Builder Staff, Lender Staff.

**UI / design description:**

- Request/response thread tied to a specific milestone completion package.
- Should show staff request, missing items, original evidence, response upload controls, and submission state.
- Can be integrated with secure deal chat but must preserve formal workflow state outside of chat.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-087 — RequestMoreInfoForm, UNRESOLVED CMP-089 — MoreInfoResponsePanel (definition missing from current docs), `uiManifest/componentManifest.md` §25.2 CMP-018 — SecureFileUploader, `uiManifest/componentManifest.md` §25.2 CMP-069 — EvidenceGallery, `uiManifest/componentManifest.md` §25.2 CMP-062 — DealChatPanel.

**Workflow references:** `draw_flow_prd.md` §18.3.5 Flow 2 — Staff Picks Up Evidence Review Work Order; `draw_flow_prd.md` §18.3.6 Flow 3 — Builder Responds to More Information Request.

**User stories:**

- As a builder lead, I can respond to a specific missing evidence request.
- As lender staff, I can see the builder’s response in the original review context.

---

### SCR-018 — Site Visit Kanban

**Purpose:** Kanban board for site visit work orders.

**Primary users:** Site Visit Staff, Lender Staff, Lender Admin.

**UI / design description:**

- Columns: Requested, Assigned/Claimed, Scheduled, In Progress, Submitted, Needs Rework, Accepted/Closed.
- Cards should show build name, milestone(s), site address, due date, assignment, prior evidence count, and geofence requirement.
- Should support quick claim/assign and mobile handoff.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-078 — KanbanBoard, `uiManifest/componentManifest.md` §25.2 CMP-079 — KanbanColumn, `uiManifest/componentManifest.md` §25.2 CMP-080 — WorkOrderCard, `uiManifest/componentManifest.md` §25.2 CMP-090 — SiteVisitCardMetadata, `uiManifest/componentManifest.md` §25.2 CMP-091 — AssignmentPicker, `uiManifest/componentManifest.md` §25.2 CMP-092 — ScheduleVisitControl.

**Workflow references:** `draw_flow_prd.md` §11.5 Site Visit Flow; `draw_flow_prd.md` §18.3.7 Flow 4 — Site Visit Work Order Fulfillment.

**User stories:**

- As a site visit staff member, I can claim site inspections from a dedicated queue.

---

### SCR-019 — Mobile Site Visit Detail

**Purpose:** Mobile/tablet workflow for performing and submitting site visits.

**Primary users:** Site Visit Staff / Inspector.

**UI / design description:**

- Field-first mobile interface.
- Should show build site map, target milestones, prior builder evidence, required checklist, camera capture, notes, geofence status, and offline sync state.
- Primary action should be completion/report submission.
- Must support offline draft save and later sync.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-071 — MobileCaptureShell, `uiManifest/componentManifest.md` §25.2 CMP-012 — MapboxBuildMap, `uiManifest/componentManifest.md` §25.2 CMP-093 — SiteVisitChecklist, `uiManifest/componentManifest.md` §25.2 CMP-072 — CameraCapture, `uiManifest/componentManifest.md` §25.2 CMP-094 — OfflineSyncBanner, `uiManifest/componentManifest.md` §25.2 CMP-095 — SiteVisitReportForm, `uiManifest/componentManifest.md` §25.2 CMP-096 — SyncStatusIndicator.

**Workflow references:** `draw_flow_prd.md` §11.5 Site Visit Flow; `draw_flow_prd.md` §13.8 Site Visits; `draw_flow_prd.md` §13.11 Offline Sync; `draw_flow_prd.md` §18.3.7 Flow 4 — Site Visit Work Order Fulfillment.

**User stories:**

- As an inspector, I can complete a site visit from a tablet even with poor connectivity.

---

### SCR-020 — Admin Approval Kanban

**Purpose:** Admin queue for milestone decisions after staff review/site visit completion.

**Primary users:** Lender Admin.

**UI / design description:**

- Kanban board with columns: Ready for Milestone Decision, Admin Reviewing, Changes Requested, Milestone Approved, Milestone Rejected, Closed.
- Cards should emphasize decision-readiness: staff recommendation, site visit complete/waived, geofence status, variance, draw group impact.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-078 — KanbanBoard, `uiManifest/componentManifest.md` §25.2 CMP-079 — KanbanColumn, `uiManifest/componentManifest.md` §25.2 CMP-080 — WorkOrderCard, `uiManifest/componentManifest.md` §25.2 CMP-097 — ApprovalReadinessIndicator, UNRESOLVED CMP-051 — RiskSummaryPill (definition missing from current docs), `uiManifest/componentManifest.md` §25.2 CMP-083 — SLAIndicator.

**Workflow references:** `draw_flow_prd.md` §18.3.3 Kanban Board Types; `draw_flow_prd.md` §18.3.8 Flow 5 — Admin Reviews Proof and Recommendation.

**User stories:**

- As a lender admin, I can quickly identify milestone decisions ready for final approval.

---

### SCR-021 — Admin Milestone Approval Detail

**Purpose:** Final admin decision screen for milestone completion.

**Primary users:** Lender Admin.

**UI / design description:**

- Decision-focused page with complete approval package.
- Should show builder evidence, geofence result, staff recommendation, site visit report if applicable, budget variance, warnings, and related draw group.
- Sticky final decision panel: approve, reject, request more info, request/reopen site visit, override.
- Override flows must require reason entry.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-098 — ApprovalPackageSummary, `uiManifest/componentManifest.md` §25.2 CMP-069 — EvidenceGallery, `uiManifest/componentManifest.md` §25.2 CMP-086 — RecommendationComposer, `uiManifest/componentManifest.md` §25.2 CMP-099 — SiteVisitReportSummary, `uiManifest/componentManifest.md` §25.2 CMP-056 — OverrideReasonModal, `uiManifest/componentManifest.md` §25.2 CMP-100 — AdminDecisionControls, `uiManifest/componentManifest.md` §25.2 CMP-065 — StatusTimeline.

**Workflow references:** `draw_flow_prd.md` §11.6 Milestone Approval and Draw Release Flow; `draw_flow_prd.md` §18.3.8 Flow 5 — Admin Reviews Proof and Recommendation.

**User stories:**

- As a lender admin, I can make a final milestone decision based on the full evidence and recommendation package.

---

### SCR-022 — Draw Release Kanban

**Purpose:** Queue for draw release readiness, approval, release, and receipt confirmation.

**Primary users:** Lender Admin, finance/ops users where applicable.

**UI / design description:**

- Kanban board with columns: Not Yet Eligible, Ready for Release Review, Release Review In Progress, Approved for Release, Released, Receipt Confirmed, Receipt Exception.
- Cards show draw ID, build, amount, included milestones, release readiness, fee treatment, and receipt state.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-078 — KanbanBoard, `uiManifest/componentManifest.md` §25.2 CMP-079 — KanbanColumn, `uiManifest/componentManifest.md` §25.2 CMP-101 — DrawReleaseCard, `uiManifest/componentManifest.md` §25.2 CMP-102 — DrawEligibilityIndicator, `uiManifest/componentManifest.md` §25.2 CMP-103 — ReceiptStatusPill.

**Workflow references:** `draw_flow_prd.md` §18.3.9 Flow 6 — Draw Becomes Ready for Release; `draw_flow_prd.md` §18.3.10 Flow 7 — Admin Approves and Releases Draw; `draw_flow_prd.md` §18.3.11 Flow 8 — Builder Confirms Receipt of Draw.

**User stories:**

- As lender admin, I can see which draws are ready to release.
- As lender ops, I can track released draws awaiting borrower confirmation.

---

### SCR-023 — Draw Release Approval Detail

**Purpose:** Final admin screen to approve and record draw release.

**Primary users:** Lender Admin.

**UI / design description:**

- Financial-control-oriented approval screen.
- Must show included approved milestones, evidence summary, release amount, fee treatment, interest start implications, loan availability, and warnings.
- Release button should be protected by confirmation modal.
- If external payment/ledger integration exists, clearly distinguish “approved for release” from “released/settled.”

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-104 — DrawReleaseSummary, `uiManifest/componentManifest.md` §25.2 CMP-105 — IncludedMilestonesTable, `uiManifest/componentManifest.md` §25.2 CMP-042 — FinancingCostBreakdown, `uiManifest/componentManifest.md` §25.2 CMP-106 — FeeTreatmentSelector, `uiManifest/componentManifest.md` §25.2 CMP-107 — ReleaseConfirmationModal, `uiManifest/componentManifest.md` §25.2 CMP-108 — LedgerIntegrationStatus.

**Workflow references:** `draw_flow_prd.md` §11.6 Milestone Approval and Draw Release Flow; `draw_flow_prd.md` §18.3.10 Flow 7 — Admin Approves and Releases Draw.

**User stories:**

- As lender admin, I can approve a draw release only after all included milestones are approved.

---

### SCR-024 — Builder Draw Receipt Confirmation

**Purpose:** Builder acknowledgement screen after draw release.

**Primary users:** Builder Lead.

**UI / design description:**

- Simple confirmation task, not a complex financial ledger screen.
- Shows released amount, expected fee treatment, release date, draw ID, and included milestones.
- Builder can confirm receipt or report exception.
- Exception path should collect issue type and notes.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-109 — ReceiptConfirmationPanel, `uiManifest/componentManifest.md` §25.2 CMP-110 — ReceiptExceptionForm, `uiManifest/componentManifest.md` §25.2 CMP-103 — ReceiptStatusPill, `uiManifest/componentManifest.md` §25.2 CMP-070 — RelatedDrawSummary.

**Workflow references:** `draw_flow_prd.md` §18.3.11 Flow 8 — Builder Confirms Receipt of Draw.

**User stories:**

- As a builder lead, I can confirm that released draw funds were received.
- As lender ops, I can investigate receipt exceptions.

---

### SCR-025 — Budget Revision Request / Review

**Purpose:** Builder and admin workflow for revising approved budgets.

**Primary users:** Builder Lead, Lender Admin.

**UI / design description:**

- Comparison-first interface.
- Shows current approved budget vs proposed revised budget by milestone.
- Should highlight changed costs, durations, dependencies, draw group effects, and optimizer recomputation impact.
- Admin review should include approve/reject/request changes controls.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-111 — BudgetRevisionDiff, `uiManifest/componentManifest.md` §25.2 CMP-112 — MilestoneCostDiffTable, `uiManifest/componentManifest.md` §25.2 CMP-113 — ReoptimizationImpactPanel, UNRESOLVED CMP-055 — AdminDecisionPanel (definition missing from current docs), UNRESOLVED CMP-057 — ReviewCommentBox (definition missing from current docs).

**Workflow references:** `draw_flow_prd.md` §8.9 Budget Overrun and Revision; `draw_flow_prd.md` §11.7 Budget Revision Flow; `draw_flow_prd.md` §15.4 Budget Revision Statuses.

**User stories:**

- As a builder lead, I can request a budget revision when costs materially change.
- As lender admin, I can see exactly how a revision affects the draw plan.

---

### SCR-026 — Policy Configuration

**Purpose:** Configure lender policy for draw fees, interest, evidence, site visits, approvals, and variance thresholds.

**Primary users:** Lender Admin, Organization Admin.

**UI / design description:**

- Admin settings interface with domain-specific sections.
- Avoid generic key-value config dumps.
- Should separate: Draw Policy, Interest Policy, Evidence Requirements, Site Visit Rules, Variance Thresholds, Partial Draw Policy, Notifications, Webhooks.
- Dangerous changes should require confirmation.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-114 — PolicySettingsShell, `uiManifest/componentManifest.md` §25.2 CMP-115 — DrawPolicyForm, `uiManifest/componentManifest.md` §25.2 CMP-116 — InterestPolicyForm, `uiManifest/componentManifest.md` §25.2 CMP-117 — EvidencePolicyMatrix, `uiManifest/componentManifest.md` §25.2 CMP-118 — SiteVisitPolicyForm, `uiManifest/componentManifest.md` §25.2 CMP-119 — VarianceThresholdForm, `uiManifest/componentManifest.md` §25.2 CMP-120 — DangerousChangeConfirm.

**Workflow references:** `draw_flow_prd.md` §§8.2–8.7 (Interest Accrual through Site Visit Control); `draw_flow_prd.md` §13.1 Multi-Tenancy and Organization Scoping; `draw_flow_prd.md` §13.10 Draw Release.

**User stories:**

- As a lender admin, I can configure lender-specific rules without engineering changes.

---

### SCR-027 — Audit History

**Purpose:** Review material state transitions, approvals, overrides, evidence events, and draw release events.

**Primary users:** Lender Admin, Organization Admin, auditors/compliance users where supported.

**UI / design description:**

- Timeline/table hybrid.
- Filterable by Build, actor, event type, entity type, date, approval state, override events, geofence failures.
- Audit events should be human-readable but preserve technical identifiers for traceability.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-121 — AuditTimeline, `uiManifest/componentManifest.md` §25.2 CMP-122 — AuditEventRow, `uiManifest/componentManifest.md` §25.2 CMP-123 — AuditFilterBar, `uiManifest/componentManifest.md` §25.2 CMP-124 — EntityLinkChip, `uiManifest/componentManifest.md` §25.2 CMP-125 — BeforeAfterDiffViewer.

**Workflow references:** `draw_flow_prd.md` §17 Audit and Compliance Requirements; `draw_flow_prd.md` §18.3.14 Audit Events for Kanban Flow.

**User stories:**

- As a lender admin, I can reconstruct why a milestone or draw was approved.

---

### SCR-028 — API and Webhook Configuration

**Purpose:** Tenant-scoped integration management for standalone-ready product architecture.

**Primary users:** Organization Admin, technical admin.

**UI / design description:**

- Developer/admin-oriented settings area.
- Should expose API keys, webhook endpoints, event subscriptions, delivery logs, signing secret state, and external ID mappings.
- Must feel secure and controlled, not like a casual settings page.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-126 — ApiKeyManager, `uiManifest/componentManifest.md` §25.2 CMP-127 — WebhookEndpointForm, `uiManifest/componentManifest.md` §25.2 CMP-128 — WebhookEventSelector, `uiManifest/componentManifest.md` §25.2 CMP-129 — WebhookDeliveryLog, `uiManifest/componentManifest.md` §25.2 CMP-130 — ExternalIdMappingTable, `uiManifest/componentManifest.md` §25.2 CMP-120 — DangerousChangeConfirm.

**Workflow references:** `draw_flow_prd.md` §16 API and Webhook Requirements.

**User stories:**

- As a technical admin, I can configure webhook events to sync DrawFlow lifecycle changes into external systems.

---

### SCR-029 — Secure Deal Chat Panel

**Purpose:** Deal-scoped secure communication layer accessible from the Build Workspace and operational screens.

**Primary users:** Builder Lead, Builder Staff, Lender Staff, Site Visit Staff, Lender Admin.

**UI / design description:**

- Right-side drawer or panel, not a separate social messaging product.
- Message stream should be compact and professional.
- Support mentions, attachments, unread state, and links to milestones/draws/evidence where available.
- Chat must not be used to perform formal approvals.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-062 — DealChatPanel, `uiManifest/componentManifest.md` §25.2 CMP-131 — ChatMessageList, `uiManifest/componentManifest.md` §25.2 CMP-132 — ChatComposer, `uiManifest/componentManifest.md` §25.2 CMP-133 — MentionPicker, `uiManifest/componentManifest.md` §25.2 CMP-134 — ChatAttachmentUploader, `uiManifest/componentManifest.md` §25.2 CMP-135 — ContextEntityReference.

**Workflow references:** `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel; `draw_flow_prd.md` §10.7 Relationship to Other Interfaces; `draw_flow_prd.md` §18.3.6 Flow 3 — Builder Responds to More Information Request.

**User stories:**

- As lender staff, I can ask for clarification without losing deal context.
- As a builder lead, I can communicate with the lender team inside the Build context.

---

### SCR-030 — Build Site Map Panel

**Purpose:** Integrated map panel/drawer showing build area, geofence, satellite view, and topographical view.

**Primary users:** Builder Lead, Builder Staff, Lender Staff, Site Visit Staff, Lender Admin.

**UI / design description:**

- Drawer or panel accessible from Build Workspace, Evidence Review, and Site Visit flow.
- Mapbox-based with satellite/topographical toggles.
- Build area should be circled/bounded.
- Evidence markers may be shown when location metadata exists.
- Geofence boundary should be distinguishable from human-readable build area where necessary.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-061 — BuildMapDrawer, `uiManifest/componentManifest.md` §25.2 CMP-012 — MapboxBuildMap, `uiManifest/componentManifest.md` §25.2 CMP-013 — MapLayerToggle, `uiManifest/componentManifest.md` §25.2 CMP-014 — BuildAreaOverlay, `uiManifest/componentManifest.md` §25.2 CMP-015 — GeofenceBoundaryOverlay, `uiManifest/componentManifest.md` §25.2 CMP-136 — EvidenceLocationMarker.

**Workflow references:** `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel; `draw_flow_prd.md` §8.8 Geofenced Proof-of-Completion; `draw_flow_prd.md` §11.5 Site Visit Flow; `draw_flow_prd.md` §18.3.4 Flow 1 — Builder Marks Milestone Complete.

**User stories:**

- As lender admin, I can verify whether evidence was captured near the mapped build area.
- As site visit staff, I can orient myself to the build site before inspection.
