
---

## 25.2 Component Manifest

### Application and Navigation Components

#### CMP-001 — AppShell

**Description:** Authenticated product shell that wraps all DrawFlow screens.

**UI/design:** Professional SaaS application frame with restrained density, clear navigation, and tenant context. Should support desktop-first admin workflows and responsive mobile surfaces for field workflows.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-001 — Authenticated App Shell through `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel as applicable.

**Workflow references:** All authenticated workflows.

---

#### CMP-002 — OrgSwitcher

**Description:** WorkOS organization switcher for users with access to multiple tenants.

**UI/design:** Compact dropdown in global shell. Must make current organization obvious and prevent cross-org confusion.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-001 — Authenticated App Shell, all tenant-scoped screens.

**Workflow references:** `draw_flow_prd.md` §13.1 Multi-Tenancy and Organization Scoping.

---

#### CMP-003 — RoleAwareNav

**Description:** Navigation menu filtered by user role and organization permissions.

**UI/design:** Shows only accessible areas. Disabled inaccessible items should generally be hidden, not merely greyed out.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-001 — Authenticated App Shell.

**Workflow references:** `draw_flow_prd.md` §14 RBAC and Permissions.

---

#### CMP-004 — UserMenu

**Description:** Account/profile menu.

**UI/design:** Compact menu with identity, org, role, settings, sign-out.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-001 — Authenticated App Shell.

**Workflow references:** all authenticated workflows.

---

#### CMP-005 — Breadcrumbs

**Description:** Hierarchical navigation for build/proposal/work-order context.

**UI/design:** Compact, muted, useful for deep admin/review screens.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-002 — Build Proposal Start, `uiManifest/screenManifest.md` §25.1 SCR-009 — Proposal Review and Submit, `uiManifest/screenManifest.md` §25.1 SCR-011 — Admin Proposal Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page, `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail, `uiManifest/screenManifest.md` §25.1 SCR-023 — Draw Release Approval Detail, `uiManifest/screenManifest.md` §25.1 SCR-027 — Audit History.

**Workflow references:** `draw_flow_prd.md` §11 User Flows; `draw_flow_prd.md` §18.3 Kanban-Based Operational Workflows.

---

### Proposal Intake Components

#### CMP-006 — ProposalStepper

**Description:** Stepper for Build Proposal creation.

**UI/design:** Shows required proposal stages without making the flow feel bureaucratic. Supports draft save state and incomplete warnings.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-002 — Build Proposal Start through `uiManifest/screenManifest.md` §25.1 SCR-009 — Proposal Review and Submit.

**Workflow references:** `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow.

---

#### CMP-007 — BuildIdentityForm

**Description:** Captures project/build identity and high-level borrower/build metadata.

**UI/design:** Clean structured form with lender-grade labels and validation.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-002 — Build Proposal Start.

**Workflow references:** `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow.

---

#### CMP-008 — PrimaryActionBar

**Description:** Persistent or section-level action bar for save/continue/submit flows.

**UI/design:** Clear primary CTA and secondary actions. Should not crowd field workflows.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-002 — Build Proposal Start, `uiManifest/screenManifest.md` §25.1 SCR-006 — Milestone Template Selection, `uiManifest/screenManifest.md` §25.1 SCR-009 — Proposal Review and Submit.

**Workflow references:** `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow.

---

#### CMP-009 — ValidationSummary

**Description:** Aggregates blocking errors and warnings.

**UI/design:** Differentiates hard blockers from warnings. Allows jump-to-field behavior.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-002 — Build Proposal Start, `uiManifest/screenManifest.md` §25.1 SCR-009 — Proposal Review and Submit, `uiManifest/screenManifest.md` §25.1 SCR-011 — Admin Proposal Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-025 — Budget Revision Request / Review.

**Workflow references:** `draw_flow_prd.md` §8.6 Milestone Dependencies; `draw_flow_prd.md` §8.9 Budget Overrun and Revision; `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow.

---

#### CMP-010 — SaveDraftIndicator

**Description:** Shows draft save/sync state.

**UI/design:** Subtle but visible. Critical for long proposal flows and offline mobile workflows.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-002 — Build Proposal Start, `uiManifest/screenManifest.md` §25.1 SCR-014 — Mobile Proof Upload, `uiManifest/screenManifest.md` §25.1 SCR-019 — Mobile Site Visit Detail.

**Workflow references:** `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow; `draw_flow_prd.md` §13.11 Offline Sync.

---

### Map and Geofence Components

#### CMP-011 — BuildLocationForm

**Description:** Captures address, coordinates, and build location metadata.

**UI/design:** Address field, geocode result, confidence state, and manual correction affordance.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-003 — Build Site Location and Map Setup.

**Workflow references:** `draw_flow_prd.md` §8.8 Geofenced Proof-of-Completion; `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow; `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel.

---

#### CMP-012 — MapboxBuildMap

**Description:** Interactive Mapbox map for the Build site.

**UI/design:** Satellite/topographical map with build area and geofence overlays. Must support both desktop drawer use and mobile site visit use.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-003 — Build Site Location and Map Setup, `uiManifest/screenManifest.md` §25.1 SCR-011 — Admin Proposal Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-019 — Mobile Site Visit Detail, `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel.

**Workflow references:** `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel; `draw_flow_prd.md` §8.8 Geofenced Proof-of-Completion; `draw_flow_prd.md` §11.5 Site Visit Flow.

---

#### CMP-013 — MapLayerToggle

**Description:** Switches between satellite and topographical/terrain views.

**UI/design:** Small segmented control or map overlay control. Should not obscure the site boundary.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-003 — Build Site Location and Map Setup, `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel.

**Workflow references:** `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel.

---

#### CMP-014 — BuildAreaOverlay

**Description:** Human-readable build area circle/polygon.

**UI/design:** Clear boundary with subtle fill. Should visually distinguish site footprint from geofence tolerance.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-003 — Build Site Location and Map Setup, `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel.

**Workflow references:** `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel.

---

#### CMP-015 — GeofenceBoundaryOverlay

**Description:** Shows the geofence validation boundary.

**UI/design:** Distinct but not alarming. Should be visible when reviewing evidence/geofence controls.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-003 — Build Site Location and Map Setup, `uiManifest/screenManifest.md` §25.1 SCR-014 — Mobile Proof Upload, `uiManifest/screenManifest.md` §25.1 SCR-019 — Mobile Site Visit Detail, `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel.

**Workflow references:** `draw_flow_prd.md` §8.8 Geofenced Proof-of-Completion; `draw_flow_prd.md` §18.3.4 Flow 1 — Builder Marks Milestone Complete.

---

#### CMP-016 — GeocodeConfidenceIndicator

**Description:** Displays confidence level of geocoded build location.

**UI/design:** Compact indicator with tooltip explaining low-confidence locations.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-003 — Build Site Location and Map Setup.

**Workflow references:** `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel.

---

#### CMP-073 — GeofenceCaptureGate

**Description:** Performs or displays geofence verification attempt during direct proof capture.

**UI/design:** Shows checking/success/failure/unavailable states. Should explain consequences without blocking unless policy requires.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-014 — Mobile Proof Upload, `uiManifest/screenManifest.md` §25.1 SCR-019 — Mobile Site Visit Detail.

**Workflow references:** `draw_flow_prd.md` §8.8 Geofenced Proof-of-Completion; `draw_flow_prd.md` §18.3.4 Flow 1 — Builder Marks Milestone Complete; `draw_flow_prd.md` §18.3.7 Flow 4 — Site Visit Work Order Fulfillment.

---

#### CMP-074 — GeofenceStatusBadge

**Description:** Compact status indicator for evidence location verification.

**UI/design:** States include verified, failed, unavailable, low-confidence, suspected spoofing, not required.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-014 — Mobile Proof Upload, `uiManifest/screenManifest.md` §25.1 SCR-015 — Lender Evidence Review Kanban, `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail, `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel.

**Workflow references:** `draw_flow_prd.md` §8.8 Geofenced Proof-of-Completion; `draw_flow_prd.md` §18.3 Kanban-Based Operational Workflows.

---

#### CMP-136 — EvidenceLocationMarker

**Description:** Marker showing where a piece of evidence was captured relative to the build site.

**UI/design:** Small, inspectable map marker linked to evidence item.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel, optionally `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail and `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail.

**Workflow references:** `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel; `draw_flow_prd.md` §18.3.4 Flow 1 — Builder Marks Milestone Complete.

---

### Document and Evidence Components

#### CMP-017 — DocumentChecklist

**Description:** Proposal or milestone document/evidence requirements checklist.

**UI/design:** Checklist rows with required/optional status, upload state, review status, and missing requirements.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-004 — Permit and Document Upload, `uiManifest/screenManifest.md` §25.1 SCR-011 — Admin Proposal Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page.

**Workflow references:** `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow; `draw_flow_prd.md` §13.2 Proposal Intake.

---

#### CMP-018 — SecureFileUploader

**Description:** Authenticated upload component for permits, documents, evidence, and chat attachments.

**UI/design:** Drag/drop desktop, file picker mobile, progress state, upload failure state.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-004 — Permit and Document Upload, `uiManifest/screenManifest.md` §25.1 SCR-017 — More Information Request / Builder Response, `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel.

**Workflow references:** `draw_flow_prd.md` §13.7 Evidence Upload, `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel.

---

#### CMP-019 — DocumentStatusRow

**Description:** Row for a single required or uploaded document.

**UI/design:** Shows title, type, status, uploader, timestamp, and actions.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-004 — Permit and Document Upload, `uiManifest/screenManifest.md` §25.1 SCR-011 — Admin Proposal Review Detail.

**Workflow references:** `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow.

---

#### CMP-020 — MissingRequirementCallout

**Description:** Highlights missing required documentation or evidence.

**UI/design:** Clear but not visually hysterical. Should identify exactly what is missing.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-004 — Permit and Document Upload, `uiManifest/screenManifest.md` §25.1 SCR-009 — Proposal Review and Submit, `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail.

**Workflow references:** `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow; `draw_flow_prd.md` §18.3.5 Flow 2 — Staff Picks Up Evidence Review Work Order.

---

#### CMP-021 — AttachmentPreviewDrawer

**Description:** Preview for uploaded PDFs/images/documents.

**UI/design:** Drawer/modal with metadata and download/view controls respecting permissions.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-004 — Permit and Document Upload, `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail, `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel.

**Workflow references:** `draw_flow_prd.md` §13.7 Evidence Upload; `draw_flow_prd.md` §17 Audit and Compliance Requirements.

---

#### CMP-068 — EvidenceRequirementChecklist

**Description:** Checklist of required proof for a milestone or site visit.

**UI/design:** Domain-specific list with required, satisfied, missing, waived states.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page, `uiManifest/screenManifest.md` §25.1 SCR-014 — Mobile Proof Upload, `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-019 — Mobile Site Visit Detail.

**Workflow references:** `draw_flow_prd.md` §13.7 Evidence Upload; `draw_flow_prd.md` §18.3.4 Flow 1 — Builder Marks Milestone Complete.

---

#### CMP-069 — EvidenceGallery

**Description:** Gallery/list of uploaded evidence.

**UI/design:** Supports images, videos, PDFs, invoices, reports. Shows metadata, geofence status, uploader, timestamp.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page, `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-017 — More Information Request / Builder Response, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail.

**Workflow references:** `draw_flow_prd.md` §13.7 Evidence Upload; `draw_flow_prd.md` §18.3.5 Flow 2 — Staff Picks Up Evidence Review Work Order; `draw_flow_prd.md` §18.3.8 Flow 5 — Admin Reviews Proof and Recommendation.

---

### Working Capital and Optimizer Components

#### CMP-022 — WorkingCapitalInput

**Description:** Numeric input for available borrower working capital.

**UI/design:** Currency input with plain-language helper text and validation.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-005 — Available Working Capital Input.

**Workflow references:** `draw_flow_prd.md` §7.10 Borrower Working Capital Limit; `draw_flow_prd.md` §8.5 Borrower Working Capital Constraint; `draw_flow_prd.md` §9.2 Optimization Inputs.

---

#### CMP-023 — CapitalConstraintExplainer

**Description:** Explains how reimbursement-only draws constrain parallel work.

**UI/design:** Short educational panel, preferably with simple example math or visual timeline.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-005 — Available Working Capital Input, `uiManifest/screenManifest.md` §25.1 SCR-008 — Draw Plan Comparison.

**Workflow references:** `draw_flow_prd.md` §8.5 Borrower Working Capital Constraint; `draw_flow_prd.md` §9.6 Capital-Constrained Plan.

---

#### CMP-024 — FeasibilityPreview

**Description:** Quick preview of whether entered working capital can support proposed milestone grouping.

**UI/design:** Shows feasible/warning/infeasible states and likely stall points.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-005 — Available Working Capital Input, `uiManifest/screenManifest.md` §25.1 SCR-008 — Draw Plan Comparison.

**Workflow references:** `draw_flow_prd.md` §9.3 Optimization Outputs; `draw_flow_prd.md` §9.6 Capital-Constrained Plan.

---

#### CMP-025 — CurrencyInput

**Description:** Currency-safe input used for budgets, costs, draw amounts, working capital, fees.

**UI/design:** Locale-aware formatting, validation, no ambiguous decimals.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-005 — Available Working Capital Input, `uiManifest/screenManifest.md` §25.1 SCR-007 — Draft Build Workspace / Roadmap Wizard, `uiManifest/screenManifest.md` §25.1 SCR-014 — Mobile Proof Upload, `uiManifest/screenManifest.md` §25.1 SCR-023 — Draw Release Approval Detail, `uiManifest/screenManifest.md` §25.1 SCR-025 — Budget Revision Request / Review, `uiManifest/screenManifest.md` §25.1 SCR-026 — Policy Configuration.

**Workflow references:** all financial input workflows.

---

#### CMP-040 — OptimizationPlanCard

**Description:** Summary card for one generated plan.

**UI/design:** Displays plan type, total estimated cost, interest, fees, duration, peak capital exposure, and feasibility.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-008 — Draw Plan Comparison, `uiManifest/screenManifest.md` §25.1 SCR-011 — Admin Proposal Review Detail.

**Workflow references:** `draw_flow_prd.md` §9 Optimization Requirements.

---

#### CMP-041 — PlanComparisonTable

**Description:** Detailed side-by-side plan comparison.

**UI/design:** Dense table with strong alignment and row grouping for cost/time/capital dimensions.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-008 — Draw Plan Comparison.

**Workflow references:** `draw_flow_prd.md` §§9.3–9.7 (Optimization Outputs through Plan Comparison).

---

#### CMP-042 — FinancingCostBreakdown

**Description:** Breaks down interest, draw fees, and total estimated financing cost.

**UI/design:** Compact financial summary with tooltip definitions.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-008 — Draw Plan Comparison, `uiManifest/screenManifest.md` §25.1 SCR-023 — Draw Release Approval Detail.

**Workflow references:** `draw_flow_prd.md` §8.2 Interest Accrual; `draw_flow_prd.md` §8.3 Draw Fee; `draw_flow_prd.md` §9.4 Default Recommendation: Cheapest Feasible Plan.

---

#### CMP-043 — CapitalExposureSummary

**Description:** Shows peak unreimbursed borrower exposure and working-capital utilization.

**UI/design:** Numeric summary with warning threshold state.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-008 — Draw Plan Comparison, `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace.

**Workflow references:** `draw_flow_prd.md` §7.10 Borrower Working Capital Limit; `draw_flow_prd.md` §9.6 Capital-Constrained Plan.

---

#### CMP-044 — FeasibilityBadge

**Description:** Compact indicator for feasible, conditionally feasible, infeasible.

**UI/design:** Should distinguish economic suboptimality from hard infeasibility.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-008 — Draw Plan Comparison, `uiManifest/screenManifest.md` §25.1 SCR-010 — Admin Proposal Review Queue, `uiManifest/screenManifest.md` §25.1 SCR-011 — Admin Proposal Review Detail.

**Workflow references:** `draw_flow_prd.md` §9 Optimization Requirements.

---

#### CMP-045 — PlanExplanationPanel

**Description:** Natural-language explanation of why optimizer selected or rejected a plan.

**UI/design:** Concise explanation with expandable details.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-008 — Draw Plan Comparison.

**Workflow references:** `draw_flow_prd.md` §9.4 Default Recommendation: Cheapest Feasible Plan.

---

### Build Workspace Components

#### CMP-029 — BuildWorkspaceShell

**Description:** Structural shell for the core Build Workspace.

**UI/design:** Two-column dense workspace. Left milestone rail, right Gantt/schedule, top build header, bottom summary/status region.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-007 — Draft Build Workspace / Roadmap Wizard, `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace.

**Workflow references:** `draw_flow_prd.md` §10 Core Build Workspace.

---

#### CMP-030 — MilestoneRail

**Description:** Vertical list of milestone cards.

**UI/design:** Approximately 25 percent width on desktop. Supports scrolling, drag-and-drop, filters, status grouping where needed.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-007 — Draft Build Workspace / Roadmap Wizard, `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace.

**Workflow references:** `draw_flow_prd.md` §10.2 Layout; `draw_flow_prd.md` §11.3 Active Build Update Flow.

---

#### CMP-031 — MilestoneCard

**Description:** Compact card representing a milestone.

**UI/design:** Linear-inspired productivity card. Shows milestone name, code, draw tag, status, blocking/blocked-by counts, warning count, cost, duration, drag handle.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-007 — Draft Build Workspace / Roadmap Wizard, `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace.

**Workflow references:** `draw_flow_prd.md` §10.2 Layout; `draw_flow_prd.md` §13.6 Milestone Progress.

---

#### CMP-032 — GanttCanvas

**Description:** Main schedule visualization canvas.

**UI/design:** Time-grid with milestone task blocks, parallel lanes, draw boundaries, status markers. No dependency arrows by default.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-007 — Draft Build Workspace / Roadmap Wizard, `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace.

**Workflow references:** `draw_flow_prd.md` §10.2 Layout.

---

#### CMP-033 — TimelineHeader

**Description:** Time axis for the Gantt roadmap.

**UI/design:** Week/month ticks with sticky behavior where appropriate.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-007 — Draft Build Workspace / Roadmap Wizard, `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace.

**Workflow references:** `draw_flow_prd.md` §10 Core Build Workspace.

---

#### CMP-034 — GanttTaskBlock

**Description:** Visual task block for a milestone on the Gantt canvas.

**UI/design:** Shows milestone name, cost, duration/status. Shape and visual state should support parallel work readability.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-007 — Draft Build Workspace / Roadmap Wizard, `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace.

**Workflow references:** `draw_flow_prd.md` §10.2 Layout.

---

#### CMP-035 — DrawGroupBoundary

**Description:** Bounded visual region containing milestones in a planned draw.

**UI/design:** Semi-transparent bounding box with draw ID, amount, status, warning state.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-007 — Draft Build Workspace / Roadmap Wizard, `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace.

**Workflow references:** `draw_flow_prd.md` §7.9 Draw Group; `draw_flow_prd.md` §10.3 Draw Group Visualization.

---

#### CMP-036 — InlineCostDurationEditor

**Description:** Inline editing component for milestone cost and duration.

**UI/design:** Low-friction editing that does not destroy card density. Validation and dirty state visible.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-007 — Draft Build Workspace / Roadmap Wizard, `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace.

**Workflow references:** `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow; `draw_flow_prd.md` §11.7 Budget Revision Flow.

---

#### CMP-037 — DependencyInspector

**Description:** View/edit dependencies for selected milestone.

**UI/design:** Compact drawer/popover showing blockers, blocked milestones, hard/soft labels, warnings, and cycle-prevention validation.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-007 — Draft Build Workspace / Roadmap Wizard, `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace, `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page.

**Workflow references:** `draw_flow_prd.md` §8.6 Milestone Dependencies; `draw_flow_prd.md` §13.4 Dependency Management.

---

#### CMP-038 — WarningRail

**Description:** Aggregated warning/issue rail for roadmap and proposal issues.

**UI/design:** Compact side or bottom panel with severity grouping and click-to-focus behavior.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-007 — Draft Build Workspace / Roadmap Wizard, `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace.

**Workflow references:** `draw_flow_prd.md` §8.6 Milestone Dependencies; `draw_flow_prd.md` §8.9 Budget Overrun and Revision.

---

#### CMP-039 — DraftModeBanner

**Description:** Indicates workspace is in proposal/draft mode.

**UI/design:** Subtle but clear; prevents users confusing proposed plan with active approved plan.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-007 — Draft Build Workspace / Roadmap Wizard.

**Workflow references:** `draw_flow_prd.md` §11.1 Builder Application / Build Proposal Flow.

---

#### CMP-058 — BuildHeader

**Description:** Header for active Build identity and summary.

**UI/design:** Shows build name, phase/status, loan/budget summary, current draw state, and role-aware actions.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace.

**Workflow references:** `draw_flow_prd.md` §10.2 Layout.

---

#### CMP-059 — WorkspaceSummaryBar

**Description:** Bottom or header summary for total draw amount, milestone counts, warning counts, status distribution.

**UI/design:** Compact operational summary with strong hierarchy.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace.

**Workflow references:** `draw_flow_prd.md` §10.2 Layout.

---

#### CMP-060 — RoleAwareActionPanel

**Description:** Action panel that changes by role and current entity state.

**UI/design:** Shows only valid next actions. Avoids clutter by grouping secondary actions.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace, `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail, `uiManifest/screenManifest.md` §25.1 SCR-023 — Draw Release Approval Detail.

**Workflow references:** `draw_flow_prd.md` §14 RBAC and Permissions; `draw_flow_prd.md` §18.3 Kanban-Based Operational Workflows.

---

#### CMP-061 — BuildMapDrawer

**Description:** Drawer for integrated map inside the Build Workspace.

**UI/design:** Opens without navigating away from workspace. Map layers and geofence visible.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace, `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel.

**Workflow references:** `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel.

---

#### CMP-062 — DealChatPanel

**Description:** Secure deal-scoped chat panel.

**UI/design:** Right-side drawer/panel, compact message stream, entity references, attachments.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace, `uiManifest/screenManifest.md` §25.1 SCR-017 — More Information Request / Builder Response, `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel.

**Workflow references:** `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel; `draw_flow_prd.md` §18.3 Kanban-Based Operational Workflows.

---

#### CMP-063 — ActivityFeedDrawer

**Description:** Contextual activity feed for Build, milestone, draw, and work-order events.

**UI/design:** Timeline list with event type, actor, timestamp, and entity links.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace, `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page.

**Workflow references:** `draw_flow_prd.md` §17 Audit and Compliance Requirements.

---

### Milestone Detail Components

#### CMP-064 — MilestoneDetailDrawer

**Description:** Context-preserving detailed milestone panel.

**UI/design:** Drawer with tabs/sections: Overview, Progress, Evidence, Dependencies, Draw, Audit.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page.

**Workflow references:** `draw_flow_prd.md` §11.3 Active Build Update Flow; `draw_flow_prd.md` §18.3.4 Flow 1 — Builder Marks Milestone Complete.

---

#### CMP-065 — StatusTimeline

**Description:** Timeline of state transitions for milestone, draw, site visit, or work order.

**UI/design:** Vertical timeline with actors, timestamps, comments, and audit markers.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail, `uiManifest/screenManifest.md` §25.1 SCR-024 — Builder Draw Receipt Confirmation.

**Workflow references:** `draw_flow_prd.md` §15 Status Models; `draw_flow_prd.md` §17 Audit and Compliance Requirements; `draw_flow_prd.md` §18.3.14 Audit Events for Kanban Flow.

---

#### CMP-066 — BudgetVariancePanel

**Description:** Shows estimated vs actual cost and variance threshold state.

**UI/design:** Numeric comparison with variance color/severity and revision trigger hint.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page, `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail, `uiManifest/screenManifest.md` §25.1 SCR-025 — Budget Revision Request / Review.

**Workflow references:** `draw_flow_prd.md` §8.9 Budget Overrun and Revision; `draw_flow_prd.md` §11.7 Budget Revision Flow.

---

#### CMP-067 — DependencyList

**Description:** Lists blockers and downstream blocked milestones.

**UI/design:** Compact list with hard/soft labels and click-through to related milestone.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page.

**Workflow references:** `draw_flow_prd.md` §8.6 Milestone Dependencies; `draw_flow_prd.md` §13.4 Dependency Management.

---

#### CMP-070 — RelatedDrawSummary

**Description:** Shows draw group associated with milestone/evidence/receipt.

**UI/design:** Compact summary with draw ID, amount, status, included milestone count.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page, `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail, `uiManifest/screenManifest.md` §25.1 SCR-024 — Builder Draw Receipt Confirmation.

**Workflow references:** `draw_flow_prd.md` §7.8 Draw; `draw_flow_prd.md` §7.9 Draw Group; `draw_flow_prd.md` §18.3 Kanban-Based Operational Workflows.

---

### Mobile Field Components

#### CMP-071 — MobileCaptureShell

**Description:** Mobile shell for camera/evidence/site visit workflows.

**UI/design:** Large touch targets, offline-aware, minimal navigation, sticky submit/save actions.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-014 — Mobile Proof Upload, `uiManifest/screenManifest.md` §25.1 SCR-019 — Mobile Site Visit Detail.

**Workflow references:** `draw_flow_prd.md` §13.7 Evidence Upload; `draw_flow_prd.md` §13.8 Site Visits; `draw_flow_prd.md` §13.11 Offline Sync.

---

#### CMP-072 — CameraCapture

**Description:** Direct camera capture component.

**UI/design:** Native camera integration where possible, upload queue, retry state.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-014 — Mobile Proof Upload, `uiManifest/screenManifest.md` §25.1 SCR-019 — Mobile Site Visit Detail.

**Workflow references:** `draw_flow_prd.md` §8.8 Geofenced Proof-of-Completion; `draw_flow_prd.md` §13.7 Evidence Upload; `draw_flow_prd.md` §18.3.4 Flow 1 — Builder Marks Milestone Complete.

---

#### CMP-075 — ActualCostInput

**Description:** Captures actual cost incurred for milestone completion.

**UI/design:** Currency input with optional supporting notes/invoice attachment prompt.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-014 — Mobile Proof Upload, `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page.

**Workflow references:** `draw_flow_prd.md` §11.3 Active Build Update Flow; `draw_flow_prd.md` §18.3.4 Flow 1 — Builder Marks Milestone Complete.

---

#### CMP-076 — CompletionReportForm

**Description:** Builder-side structured completion report.

**UI/design:** Short field report with notes, actual dates, cost explanation, and exception comments.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-014 — Mobile Proof Upload.

**Workflow references:** `draw_flow_prd.md` §18.3.4 Flow 1 — Builder Marks Milestone Complete.

---

#### CMP-077 — MobileSubmitBar

**Description:** Sticky mobile action bar.

**UI/design:** Large primary action, save draft, validation count.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-014 — Mobile Proof Upload, `uiManifest/screenManifest.md` §25.1 SCR-019 — Mobile Site Visit Detail.

**Workflow references:** `draw_flow_prd.md` §13.11 Offline Sync; `draw_flow_prd.md` §18.3 Kanban-Based Operational Workflows.

---

#### CMP-093 — SiteVisitChecklist

**Description:** Required inspection checklist for site visit staff.

**UI/design:** Mobile-friendly checklist with required evidence and notes fields.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-019 — Mobile Site Visit Detail.

**Workflow references:** `draw_flow_prd.md` §11.5 Site Visit Flow; `draw_flow_prd.md` §18.3.7 Flow 4 — Site Visit Work Order Fulfillment.

---

#### CMP-094 — OfflineSyncBanner

**Description:** Indicates offline status and pending sync queue.

**UI/design:** Persistent but unobtrusive banner; clear sync failure and retry states.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-019 — Mobile Site Visit Detail, `uiManifest/screenManifest.md` §25.1 SCR-014 — Mobile Proof Upload where offline proof capture is later supported.

**Workflow references:** `draw_flow_prd.md` §13.11 Offline Sync.

---

#### CMP-095 — SiteVisitReportForm

**Description:** Structured report submitted by inspector/site visit staff.

**UI/design:** Checklist plus narrative notes, recommendation, attachments, and submit state.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-019 — Mobile Site Visit Detail.

**Workflow references:** `draw_flow_prd.md` §11.5 Site Visit Flow; `draw_flow_prd.md` §18.3.7 Flow 4 — Site Visit Work Order Fulfillment.

---

#### CMP-096 — SyncStatusIndicator

**Description:** Shows local draft and upload sync state.

**UI/design:** States: saved locally, syncing, synced, failed, conflict.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-019 — Mobile Site Visit Detail.

**Workflow references:** `draw_flow_prd.md` §13.11 Offline Sync.

---

### Kanban and Work Order Components

#### CMP-078 — KanbanBoard

**Description:** Generic board surface for operations work orders.

**UI/design:** Dense, role-aware, filterable. Must support drag/drop only where workflow state transitions allow it.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-015 — Lender Evidence Review Kanban, `uiManifest/screenManifest.md` §25.1 SCR-018 — Site Visit Kanban, `uiManifest/screenManifest.md` §25.1 SCR-020 — Admin Approval Kanban, `uiManifest/screenManifest.md` §25.1 SCR-022 — Draw Release Kanban.

**Workflow references:** `draw_flow_prd.md` §18.3 Kanban-Based Operational Workflows.

---

#### CMP-079 — KanbanColumn

**Description:** Column in kanban board.

**UI/design:** Shows count, WIP warnings where configured, empty state.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-015 — Lender Evidence Review Kanban, `uiManifest/screenManifest.md` §25.1 SCR-018 — Site Visit Kanban, `uiManifest/screenManifest.md` §25.1 SCR-020 — Admin Approval Kanban, `uiManifest/screenManifest.md` §25.1 SCR-022 — Draw Release Kanban.

**Workflow references:** `draw_flow_prd.md` §18.3.3 Kanban Board Types.

---

#### CMP-080 — WorkOrderCard

**Description:** Generic operational work item card.

**UI/design:** Shows build, milestone/draw, work type, status, assigned user, due date, evidence count, geofence state, variance, last activity.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-015 — Lender Evidence Review Kanban, `uiManifest/screenManifest.md` §25.1 SCR-018 — Site Visit Kanban, `uiManifest/screenManifest.md` §25.1 SCR-020 — Admin Approval Kanban.

**Workflow references:** `draw_flow_prd.md` §18.3.2 Operational Objects; `draw_flow_prd.md` §18.3.13 Kanban Card Requirements.

---

#### CMP-081 — WorkOrderFilterBar

**Description:** Filters kanban work orders by user, state, risk, SLA, build, role.

**UI/design:** Compact filter chips/search controls.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-015 — Lender Evidence Review Kanban, `uiManifest/screenManifest.md` §25.1 SCR-018 — Site Visit Kanban, `uiManifest/screenManifest.md` §25.1 SCR-020 — Admin Approval Kanban, `uiManifest/screenManifest.md` §25.1 SCR-022 — Draw Release Kanban.

**Workflow references:** `draw_flow_prd.md` §18.3 Kanban-Based Operational Workflows.

---

#### CMP-082 — ClaimWorkOrderButton

**Description:** Claims an unowned work order.

**UI/design:** Clear ownership action; disabled when already claimed by another user unless reassignment is allowed.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-015 — Lender Evidence Review Kanban, `uiManifest/screenManifest.md` §25.1 SCR-018 — Site Visit Kanban.

**Workflow references:** `draw_flow_prd.md` §18.3.5 Flow 2 — Staff Picks Up Evidence Review Work Order; `draw_flow_prd.md` §18.3.7 Flow 4 — Site Visit Work Order Fulfillment.

---

#### CMP-083 — SLAIndicator

**Description:** Shows age/due/SLA status for operations work.

**UI/design:** Compact time indicator with overdue state.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-015 — Lender Evidence Review Kanban, `uiManifest/screenManifest.md` §25.1 SCR-018 — Site Visit Kanban, `uiManifest/screenManifest.md` §25.1 SCR-020 — Admin Approval Kanban.

**Workflow references:** `draw_flow_prd.md` §18.3.13 Kanban Card Requirements.

---

#### CMP-090 — SiteVisitCardMetadata

**Description:** Additional card metadata for site visit work orders.

**UI/design:** Shows site address, target milestones, scheduled time, map shortcut.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-018 — Site Visit Kanban.

**Workflow references:** `draw_flow_prd.md` §18.3.7 Flow 4 — Site Visit Work Order Fulfillment.

---

#### CMP-091 — AssignmentPicker

**Description:** Assigns staff/inspector to work order.

**UI/design:** User picker constrained by role and tenant.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-018 — Site Visit Kanban, `uiManifest/screenManifest.md` §25.1 SCR-015 — Lender Evidence Review Kanban where assignment is supported.

**Workflow references:** `draw_flow_prd.md` §18.3.5 Flow 2 — Staff Picks Up Evidence Review Work Order; `draw_flow_prd.md` §18.3.7 Flow 4 — Site Visit Work Order Fulfillment.

---

#### CMP-092 — ScheduleVisitControl

**Description:** Optional scheduler for site visit appointment date/time.

**UI/design:** Lightweight date/time control; not a full calendar product.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-018 — Site Visit Kanban.

**Workflow references:** `draw_flow_prd.md` §18.3.7 Flow 4 — Site Visit Work Order Fulfillment.

---

#### CMP-097 — ApprovalReadinessIndicator

**Description:** Shows whether a milestone package is ready for admin decision.

**UI/design:** Checklist-style compact status: staff recommendation, site visit, evidence, geofence, variance.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-020 — Admin Approval Kanban, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail.

**Workflow references:** `draw_flow_prd.md` §18.3.8 Flow 5 — Admin Reviews Proof and Recommendation.

---

### Evidence Review and Approval Components

#### CMP-084 — EvidenceReviewLayout

**Description:** Structured layout for staff evidence review.

**UI/design:** Evidence on left, checklist/recommendation on right; sticky action footer.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail.

**Workflow references:** `draw_flow_prd.md` §18.3.5 Flow 2 — Staff Picks Up Evidence Review Work Order.

---

#### CMP-085 — StaffReviewChecklist

**Description:** Checklist lender staff uses to evaluate submission.

**UI/design:** Required review steps, freeform notes, issue flags.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail.

**Workflow references:** `draw_flow_prd.md` §18.3.5 Flow 2 — Staff Picks Up Evidence Review Work Order.

---

#### CMP-086 — RecommendationComposer

**Description:** Captures staff/site visit recommendation.

**UI/design:** Explicit options: recommend approval, request more info, request site visit, recommend rejection. Requires notes for adverse recommendations.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail.

**Workflow references:** `draw_flow_prd.md` §18.3.5 Flow 2 — Staff Picks Up Evidence Review Work Order; `draw_flow_prd.md` §18.3.7 Flow 4 — Site Visit Work Order Fulfillment; `draw_flow_prd.md` §18.3.8 Flow 5 — Admin Reviews Proof and Recommendation.

---

#### CMP-087 — RequestMoreInfoForm

**Description:** Creates formal missing information request.

**UI/design:** Structured request with required items, message, due date optional.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-017 — More Information Request / Builder Response, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail.

**Workflow references:** `draw_flow_prd.md` §18.3.5 Flow 2 — Staff Picks Up Evidence Review Work Order; `draw_flow_prd.md` §18.3.6 Flow 3 — Builder Responds to More Information Request.

---

#### CMP-088 — RequestSiteVisitButton

**Description:** Creates linked Site Visit Work Order.

**UI/design:** Action with confirmation and optional notes/target milestone selection.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail.

**Workflow references:** `draw_flow_prd.md` §18.3.5 Flow 2 — Staff Picks Up Evidence Review Work Order; `draw_flow_prd.md` §18.3.7 Flow 4 — Site Visit Work Order Fulfillment.

---

#### CMP-098 — ApprovalPackageSummary

**Description:** Aggregates all evidence, reports, recommendations, and warnings for admin decision.

**UI/design:** Decision-ready summary with sections and completion indicators.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail.

**Workflow references:** `draw_flow_prd.md` §18.3.8 Flow 5 — Admin Reviews Proof and Recommendation.

---

#### CMP-099 — SiteVisitReportSummary

**Description:** Summary of site visit report and evidence.

**UI/design:** Shows recommendation, notes, photos, geofence/location state, submitter, timestamp.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail.

**Workflow references:** `draw_flow_prd.md` §11.5 Site Visit Flow; `draw_flow_prd.md` §18.3.7 Flow 4 — Site Visit Work Order Fulfillment.

---

#### CMP-100 — AdminDecisionControls

**Description:** Final decision controls for milestone approval.

**UI/design:** Strongly gated controls: approve, reject, request info, request/reopen site visit, override. Destructive/adverse decisions require comments where policy requires.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail.

**Workflow references:** `draw_flow_prd.md` §18.3.8 Flow 5 — Admin Reviews Proof and Recommendation.

---

#### CMP-056 — OverrideReasonModal

**Description:** Captures audited reason for admin override.

**UI/design:** Modal with prior state, override type, reason required, confirmation.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-011 — Admin Proposal Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail.

**Workflow references:** `draw_flow_prd.md` §8.7 Site Visit Control; `draw_flow_prd.md` §18.3.8 Flow 5 — Admin Reviews Proof and Recommendation.

---

### Draw Release Components

#### CMP-101 — DrawReleaseCard

**Description:** Kanban card for draw release workflow.

**UI/design:** Shows draw ID, build, amount, readiness, release state, receipt state.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-022 — Draw Release Kanban.

**Workflow references:** `draw_flow_prd.md` §§18.3.9–18.3.11 (Flow 6 — Draw Becomes Ready for Release through Flow 8 — Builder Confirms Receipt of Draw).

---

#### CMP-102 — DrawEligibilityIndicator

**Description:** Shows whether a draw is eligible for release.

**UI/design:** Compact checklist: all milestones approved, no blockers, loan availability, policy gates.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-022 — Draw Release Kanban, `uiManifest/screenManifest.md` §25.1 SCR-023 — Draw Release Approval Detail, `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace.

**Workflow references:** `draw_flow_prd.md` §18.3.9 Flow 6 — Draw Becomes Ready for Release.

---

#### CMP-103 — ReceiptStatusPill

**Description:** Shows draw receipt state.

**UI/design:** States: pending confirmation, confirmed, exception, not required.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-022 — Draw Release Kanban, `uiManifest/screenManifest.md` §25.1 SCR-024 — Builder Draw Receipt Confirmation.

**Workflow references:** `draw_flow_prd.md` §18.3.11 Flow 8 — Builder Confirms Receipt of Draw.

---

#### CMP-104 — DrawReleaseSummary

**Description:** Financial and operational summary for draw release.

**UI/design:** Displays amount, included milestones, fee treatment, release date, interest start, warnings.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-023 — Draw Release Approval Detail.

**Workflow references:** `draw_flow_prd.md` §18.3.10 Flow 7 — Admin Approves and Releases Draw.

---

#### CMP-105 — IncludedMilestonesTable

**Description:** Table of milestones included in draw.

**UI/design:** Shows milestone status, approved amount/cost, approval timestamp, evidence link.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-023 — Draw Release Approval Detail.

**Workflow references:** `draw_flow_prd.md` §7.9 Draw Group; `draw_flow_prd.md` §18.3.9 Flow 6 — Draw Becomes Ready for Release.

---

#### CMP-106 — FeeTreatmentSelector

**Description:** Shows/configures draw fee treatment at release time where policy allows.

**UI/design:** Usually read-only from policy; admin override if allowed requires reason.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-023 — Draw Release Approval Detail, `uiManifest/screenManifest.md` §25.1 SCR-026 — Policy Configuration.

**Workflow references:** `draw_flow_prd.md` §8.3 Draw Fee; `draw_flow_prd.md` §18.3.10 Flow 7 — Admin Approves and Releases Draw.

---

#### CMP-107 — ReleaseConfirmationModal

**Description:** Final confirmation before draw release.

**UI/design:** High-friction confirmation with amount, fee, interest start, irreversible/audit warning.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-023 — Draw Release Approval Detail.

**Workflow references:** `draw_flow_prd.md` §18.3.10 Flow 7 — Admin Approves and Releases Draw.

---

#### CMP-108 — LedgerIntegrationStatus

**Description:** Shows payment/ledger/servicing integration state if connected.

**UI/design:** Distinguishes recorded release from external settlement status.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-023 — Draw Release Approval Detail.

**Workflow references:** `draw_flow_prd.md` §16 API and Webhook Requirements; `draw_flow_prd.md` §18.3.10 Flow 7 — Admin Approves and Releases Draw.

---

#### CMP-109 — ReceiptConfirmationPanel

**Description:** Builder-facing draw receipt confirmation.

**UI/design:** Simple confirmation with clear amount/date/draw identity.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-024 — Builder Draw Receipt Confirmation.

**Workflow references:** `draw_flow_prd.md` §18.3.11 Flow 8 — Builder Confirms Receipt of Draw.

---

#### CMP-110 — ReceiptExceptionForm

**Description:** Captures missing/incorrect draw receipt issue.

**UI/design:** Issue type selector, notes, optional attachment.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-024 — Builder Draw Receipt Confirmation.

**Workflow references:** `draw_flow_prd.md` §18.3.11 Flow 8 — Builder Confirms Receipt of Draw.

---

### Budget Revision Components

#### CMP-111 — BudgetRevisionDiff

**Description:** Shows before/after budget version comparison.

**UI/design:** Diff-style layout with changed rows highlighted.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-025 — Budget Revision Request / Review.

**Workflow references:** `draw_flow_prd.md` §11.7 Budget Revision Flow.

---

#### CMP-112 — MilestoneCostDiffTable

**Description:** Milestone-level cost/duration comparison.

**UI/design:** Dense table with old value, new value, delta, threshold status.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-025 — Budget Revision Request / Review.

**Workflow references:** `draw_flow_prd.md` §8.9 Budget Overrun and Revision; `draw_flow_prd.md` §11.7 Budget Revision Flow.

---

#### CMP-113 — ReoptimizationImpactPanel

**Description:** Shows how budget revision affects draw plan.

**UI/design:** Summarizes changed draw groupings, feasibility, financing cost, timeline.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-025 — Budget Revision Request / Review.

**Workflow references:** `draw_flow_prd.md` §9 Optimization Requirements; `draw_flow_prd.md` §11.7 Budget Revision Flow.

---

### Policy and Integration Components

#### CMP-114 — PolicySettingsShell

**Description:** Settings shell for lender policies.

**UI/design:** Sectioned admin settings with save/review state.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-026 — Policy Configuration.

**Workflow references:** `draw_flow_prd.md` §8 Core Business Rules.

---

#### CMP-115 — DrawPolicyForm

**Description:** Configures draw policy limits and partial draw rules.

**UI/design:** Domain-specific form with explanatory copy.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-026 — Policy Configuration.

**Workflow references:** `draw_flow_prd.md` §7.11 Lender Draw Policy Limit; `draw_flow_prd.md` §8.4 Lender Draw Policy.

---

#### CMP-116 — InterestPolicyForm

**Description:** Configures interest model assumptions.

**UI/design:** Structured fields for rate/accrual/day-count/capitalization.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-026 — Policy Configuration.

**Workflow references:** `draw_flow_prd.md` §8.2 Interest Accrual.

---

#### CMP-117 — EvidencePolicyMatrix

**Description:** Configures required evidence by milestone type.

**UI/design:** Matrix of milestone types vs evidence requirements and site visit requirements.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-026 — Policy Configuration.

**Workflow references:** `draw_flow_prd.md` §8.8 Geofenced Proof-of-Completion; `draw_flow_prd.md` §13.7 Evidence Upload.

---

#### CMP-118 — SiteVisitPolicyForm

**Description:** Configures when site visits are required and override behavior.

**UI/design:** Policy controls with override audit requirement visible.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-026 — Policy Configuration.

**Workflow references:** `draw_flow_prd.md` §8.7 Site Visit Control.

---

#### CMP-119 — VarianceThresholdForm

**Description:** Configures budget/time variance thresholds.

**UI/design:** Numeric threshold controls with warning/blocking policy selection.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-026 — Policy Configuration.

**Workflow references:** `draw_flow_prd.md` §8.9 Budget Overrun and Revision.

---

#### CMP-120 — DangerousChangeConfirm

**Description:** Confirmation component for sensitive policy/integration changes.

**UI/design:** Requires explicit acknowledgement and reason where appropriate.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-026 — Policy Configuration, `uiManifest/screenManifest.md` §25.1 SCR-028 — API and Webhook Configuration.

**Workflow references:** `draw_flow_prd.md` §14 RBAC and Permissions; `draw_flow_prd.md` §17 Audit and Compliance Requirements.

---

#### CMP-126 — ApiKeyManager

**Description:** Manages tenant API keys.

**UI/design:** Secure key creation, reveal-once behavior, rotation/revocation controls.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-028 — API and Webhook Configuration.

**Workflow references:** `draw_flow_prd.md` §16 API and Webhook Requirements.

---

#### CMP-127 — WebhookEndpointForm

**Description:** Configures tenant webhook endpoints.

**UI/design:** Endpoint URL, signing secret, status, test event action.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-028 — API and Webhook Configuration.

**Workflow references:** `draw_flow_prd.md` §16.3 Webhook Registry.

---

#### CMP-128 — WebhookEventSelector

**Description:** Selects subscribed webhook event types.

**UI/design:** Grouped event checklist by lifecycle domain.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-028 — API and Webhook Configuration.

**Workflow references:** `draw_flow_prd.md` §16.3 Webhook Registry.

---

#### CMP-129 — WebhookDeliveryLog

**Description:** Displays webhook delivery attempts and failures.

**UI/design:** Table with event, endpoint, status, retry count, timestamp, response preview.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-028 — API and Webhook Configuration.

**Workflow references:** `draw_flow_prd.md` §16.3 Webhook Registry.

---

#### CMP-130 — ExternalIdMappingTable

**Description:** Shows external system ID mappings for Builds, Loans, Milestones, Draws.

**UI/design:** Technical table with source system, external ID, entity type, created/updated timestamps.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-028 — API and Webhook Configuration.

**Workflow references:** `draw_flow_prd.md` §16.2 External ID Mapping.

---

### Chat Components

#### CMP-131 — ChatMessageList

**Description:** Chronological deal chat message stream.

**UI/design:** Compact, professional, timestamped. Supports attachments and entity references.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel.

**Workflow references:** `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel.

---

#### CMP-132 — ChatComposer

**Description:** Secure message composer.

**UI/design:** Text input, send action, attachment button, mention support.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel.

**Workflow references:** `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel.

---

#### CMP-133 — MentionPicker

**Description:** Participant mention/autocomplete control.

**UI/design:** Only shows authorized deal participants.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel.

**Workflow references:** `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel; `draw_flow_prd.md` §14 RBAC and Permissions.

---

#### CMP-134 — ChatAttachmentUploader

**Description:** Uploads attachments into deal chat.

**UI/design:** Uses secure attachment model and deal authorization.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel.

**Workflow references:** `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel.

---

#### CMP-135 — ContextEntityReference

**Description:** Inline reference to milestone, draw, evidence, site visit, or budget revision.

**UI/design:** Small chip/link with entity label and status.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel, `uiManifest/screenManifest.md` §25.1 SCR-017 — More Information Request / Builder Response.

**Workflow references:** `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel; `draw_flow_prd.md` §18.3 Kanban-Based Operational Workflows.

---

### Audit Components

#### CMP-121 — AuditTimeline

**Description:** Timeline of material audit events.

**UI/design:** Chronological event stream with filters and entity links.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-027 — Audit History, `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail.

**Workflow references:** `draw_flow_prd.md` §17 Audit and Compliance Requirements.

---

#### CMP-122 — AuditEventRow

**Description:** Single audit event row.

**UI/design:** Actor, role, event type, timestamp, entity, previous/new state, reason.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-027 — Audit History.

**Workflow references:** `draw_flow_prd.md` §17 Audit and Compliance Requirements.

---

#### CMP-123 — AuditFilterBar

**Description:** Filters audit events.

**UI/design:** Filter by actor, entity, date, event type, override, geofence failure.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-027 — Audit History.

**Workflow references:** `draw_flow_prd.md` §17 Audit and Compliance Requirements.

---

#### CMP-124 — EntityLinkChip

**Description:** Compact link to Build, Milestone, Draw, Evidence, Site Visit, Work Order.

**UI/design:** Chip with type icon/label and status where useful.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-027 — Audit History, `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel, `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail.

**Workflow references:** all workflow contexts.

---

#### CMP-125 — BeforeAfterDiffViewer

**Description:** Displays previous/new values for audited changes.

**UI/design:** Diff viewer optimized for settings, budget, status, and dependency changes.

**Used in screens:** `uiManifest/screenManifest.md` §25.1 SCR-027 — Audit History, `uiManifest/screenManifest.md` §25.1 SCR-025 — Budget Revision Request / Review.

**Workflow references:** `draw_flow_prd.md` §11.7 Budget Revision Flow; `draw_flow_prd.md` §17 Audit and Compliance Requirements.

---

## 25.3 Workflow-to-Screen Traceability Matrix

| Workflow / Story Area | Primary Screens | Supporting Screens |
|---|---|---|
| Builder creates Build Proposal | `uiManifest/screenManifest.md` §25.1 SCR-002 — Build Proposal Start, `uiManifest/screenManifest.md` §25.1 SCR-003 — Build Site Location and Map Setup, `uiManifest/screenManifest.md` §25.1 SCR-004 — Permit and Document Upload, `uiManifest/screenManifest.md` §25.1 SCR-005 — Available Working Capital Input, `uiManifest/screenManifest.md` §25.1 SCR-006 — Milestone Template Selection, `uiManifest/screenManifest.md` §25.1 SCR-007 — Draft Build Workspace / Roadmap Wizard, `uiManifest/screenManifest.md` §25.1 SCR-008 — Draw Plan Comparison, `uiManifest/screenManifest.md` §25.1 SCR-009 — Proposal Review and Submit | `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel, `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel |
| Admin reviews proposal | `uiManifest/screenManifest.md` §25.1 SCR-010 — Admin Proposal Review Queue, `uiManifest/screenManifest.md` §25.1 SCR-011 — Admin Proposal Review Detail | `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel, `uiManifest/screenManifest.md` §25.1 SCR-027 — Audit History |
| Builder updates active milestone | `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace, `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page | `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel |
| Builder marks milestone complete and uploads proof | `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page, `uiManifest/screenManifest.md` §25.1 SCR-014 — Mobile Proof Upload | `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace, `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel |
| Geofenced proof capture | `uiManifest/screenManifest.md` §25.1 SCR-014 — Mobile Proof Upload | `uiManifest/screenManifest.md` §25.1 SCR-003 — Build Site Location and Map Setup, `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel, `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail |
| Staff reviews evidence | `uiManifest/screenManifest.md` §25.1 SCR-015 — Lender Evidence Review Kanban, `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail | `uiManifest/screenManifest.md` §25.1 SCR-017 — More Information Request / Builder Response, `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel, `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel |
| Builder responds to missing info | `uiManifest/screenManifest.md` §25.1 SCR-017 — More Information Request / Builder Response | `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace, `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel |
| Staff requests site visit | `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail | `uiManifest/screenManifest.md` §25.1 SCR-018 — Site Visit Kanban |
| Inspector completes site visit | `uiManifest/screenManifest.md` §25.1 SCR-018 — Site Visit Kanban, `uiManifest/screenManifest.md` §25.1 SCR-019 — Mobile Site Visit Detail | `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel |
| Admin approves milestone | `uiManifest/screenManifest.md` §25.1 SCR-020 — Admin Approval Kanban, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail | `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace, `uiManifest/screenManifest.md` §25.1 SCR-027 — Audit History |
| Draw becomes ready for release | `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace, `uiManifest/screenManifest.md` §25.1 SCR-022 — Draw Release Kanban | `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail |
| Admin approves and records draw release | `uiManifest/screenManifest.md` §25.1 SCR-022 — Draw Release Kanban, `uiManifest/screenManifest.md` §25.1 SCR-023 — Draw Release Approval Detail | `uiManifest/screenManifest.md` §25.1 SCR-027 — Audit History |
| Builder confirms draw receipt | `uiManifest/screenManifest.md` §25.1 SCR-024 — Builder Draw Receipt Confirmation | `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace, `uiManifest/screenManifest.md` §25.1 SCR-022 — Draw Release Kanban |
| Budget revision | `uiManifest/screenManifest.md` §25.1 SCR-025 — Budget Revision Request / Review | `uiManifest/screenManifest.md` §25.1 SCR-007 — Draft Build Workspace / Roadmap Wizard, `uiManifest/screenManifest.md` §25.1 SCR-008 — Draw Plan Comparison, `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace, `uiManifest/screenManifest.md` §25.1 SCR-027 — Audit History |
| Lender configures policy | `uiManifest/screenManifest.md` §25.1 SCR-026 — Policy Configuration | `uiManifest/screenManifest.md` §25.1 SCR-027 — Audit History |
| Tenant configures API/webhooks | `uiManifest/screenManifest.md` §25.1 SCR-028 — API and Webhook Configuration | `uiManifest/screenManifest.md` §25.1 SCR-027 — Audit History |
| Secure deal communication | `uiManifest/screenManifest.md` §25.1 SCR-029 — Secure Deal Chat Panel | `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace, `uiManifest/screenManifest.md` §25.1 SCR-016 — Evidence Review Detail, `uiManifest/screenManifest.md` §25.1 SCR-017 — More Information Request / Builder Response, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail |
| Build site map context | `uiManifest/screenManifest.md` §25.1 SCR-030 — Build Site Map Panel | `uiManifest/screenManifest.md` §25.1 SCR-003 — Build Site Location and Map Setup, `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace, `uiManifest/screenManifest.md` §25.1 SCR-014 — Mobile Proof Upload, `uiManifest/screenManifest.md` §25.1 SCR-019 — Mobile Site Visit Detail, `uiManifest/screenManifest.md` §25.1 SCR-021 — Admin Milestone Approval Detail |

## 25.4 Design System Notes

### 25.4.1 Interface Density

DrawFlow should use high-density professional UI, especially for admin, kanban, and Build Workspace surfaces. Builder-facing proposal and mobile flows may be more guided, but should not become consumer-style or decorative.

### 25.4.2 Visual Hierarchy

Primary visual hierarchy should prioritize:

1. Build / milestone / draw identity.
2. Current operational state.
3. Required next action.
4. Risk/warnings.
5. Financial impact.
6. Historical/audit detail.

### 25.4.3 Status Language

Use precise operational status language. Avoid vague labels like “pending” when a specific state exists, such as:

- Submitted for Review.
- Site Visit Required.
- Ready for Admin.
- Ready for Release Review.
- Receipt Exception.

### 25.4.4 Role-Aware Actions

Components should not merely hide unauthorized actions in frontend code. The UI should be role-aware, but backend authorization must enforce every sensitive action.

### 25.4.5 DrawFlow-Specific Reusable Patterns

The following patterns should be reused consistently:

- Work Order Card.
- Evidence Package Summary.
- Geofence Status Badge.
- Budget Variance Panel.
- Approval Package Summary.
- Override Reason Modal.
- Draw Group Boundary.
- Related Draw Summary.
- Status Timeline.
- Entity Link Chip.

### 25.4.6 Mobile vs Desktop Priority

Desktop-first:

- Build Workspace.
- Proposal review.
- Draw plan comparison.
- Admin approval.
- Policy configuration.
- Audit review.

Mobile/tablet-first:

- Proof upload.
- Site visit workflow.
- Field evidence capture.
- Receipt confirmation.

Responsive but not primary:

- kanban boards,
- proposal intake,
- chat panel,
- map panel.



