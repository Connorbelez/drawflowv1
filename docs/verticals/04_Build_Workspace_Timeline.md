# Vertical 04 — Build Workspace and Timeline

## I. Actual agile epic / Linear project

### Objective

Build the shared Build Workspace: the central role-aware operational control plane showing approved baseline, active forecast/actual reality, milestone states, draw groups, schedule slippage, evidence/verification status, and next actions.

The workspace should be the primary context surface, but not a god-screen. Action-specific workflows should open focused drawers/panels.

### In scope

- Workspace route/shell.
- Build header/summary.
- Gantt/timeline view.
- Approved baseline vs active forecast/actual state.
- Milestone rail/list.
- Draw group visualization.
- Behind-schedule/scary-state visualization.
- Role-aware action panel/drawers.
- Workspace projection consumption.
- Warning/status model.
- Stubbed action entry points for unbuilt verticals.

### Out of scope

- Native mobile app.
- Full construction PM.
- Resource-leveling.
- Complex dependency graph editor in active builds.
- Dragging active approved baseline dates.
- MIC portal UI itself.

### Definition of done

1. Workspace renders from `BuildWorkspaceProjection`.
2. Builder, lender admin, verifier, site visitor, MIC observer have role-appropriate fields/actions.
3. Approved baseline is visually distinct from forecast/actual state.
4. Behind-schedule milestones are visually urgent at a glance.
5. Active Gantt date changes dispatch forecast commands, never baseline mutation.
6. Draw group eligibility/release status is visible.
7. Clicking a milestone opens a focused drawer/panel.
8. Workspace can operate with stubs for claim, verification, site visit, and release actions.

## IV. Screen and Component Manifest
The Build Workspace vertical owns the primary shared operational surface for builders and lender admins.  **Routes for these screens are defined via the Foundation’s route module contract under `/app/:orgSlug/builds/:buildId/workspace` and use the `BuildScopedLayout` to resolve build context and permissions.**  Below are the main screens and components, with mappings to the PRD requirements and use cases.

| Screen / Route | Components | Purpose & context | Mapped requirements/use‑cases |
| --- | --- | --- | --- |
| **`BuildWorkspaceScreen`** (`/app/:orgSlug/builds/:buildId/workspace`) | `BuildHeader`, `MilestoneRail`, `GanttTimeline`, `DrawGroupOverlay`, `WorkspaceStatusBar`, `RoleAwareActionPanel`, `WarningSummary`, `MilestoneDrawer`, `ActionDrawer`, `PlanSummaryPanel` | Central control plane for an active build.  Displays approved baseline vs forecast/actual schedule, milestone cards, draw group bounding boxes, schedule health indicators, evidence/verification status, and role‑aware actions.  Users can update progress, claim completion, view or upload evidence, open milestone and action drawers, and monitor draw eligibility and warnings. | PRD: Build Workspace context (Section 10); requirements for showing baseline vs forecast/actual, behind‑schedule visualization, draw group visualization, role‑aware actions (10.4–10.7); user flows: Active Build Update Flow (11.3), Evidence Review Flow (11.4), Site Visit Flow (11.5), Milestone Approval and Draw Release Flow (11.6).
| **`MilestoneDrawer`** (modal/drawer within `BuildWorkspaceScreen`) | `MilestoneDetailPanel`, `ProgressUpdateForm`, `EvidenceUploadSection`, `ClaimCompletionButton`, `ForecastEditForm`, `DependencyList` | Provides detailed view and editing of a single milestone.  Allows builder to update progress, upload evidence, claim completion, view dependencies, and edit forecast dates.  Lender users can view budget variance and review evidence state. | PRD: Active Build Update Flow (steps 1–9); requirements for progress update, evidence upload, lower draw request, and forecast updates (Sections 13.6, 13.7); forecast editing (Section 10.2 & Vertical 10 requirements).
| **`ActionDrawer`** (modal/drawer within `BuildWorkspaceScreen`) | `CompletionClaimForm`, `EvidenceViewer`, `RequestMoreInfoForm`, `RequestSiteVisitButton`, `ApprovalDecisionButtons`, `DrawReleaseApprovalForm`, `RevisionRequestForm` | Presents context‑specific workflows based on the user’s role and the selected item.  For example, builder sees a completion claim form; verifier sees evidence review and decision buttons; admin sees milestone approval, draw release approval, and revision request forms. | PRD: Evidence Review Flow, Site Visit Flow, Milestone Approval and Draw Release Flow, Budget Revision Flow; requirements for separation of duties and role‑aware actions (10.6, 14.1–14.3).
| **`PlanSummaryPanel`** (sidebar/panel within `BuildWorkspaceScreen`) | `DrawPlanSummary`, `FeeInterestBreakdown`, `PeakExposureIndicator` | Displays a summary of the approved draw plan, including draw group labels, amounts, eligibility and release dates, fee and interest estimates, and peak unreimbursed exposure. | PRD: Draw group visualization and plan comparison (10.3 & 9.7); requirements to show plan details to builder and lender users.

**Component notes:**

* `MilestoneRail` renders a list of milestone cards.  Each card includes name, code, draw group tag, status, blocking counts, warnings, estimated cost, and duration.  It supports drag-and-drop reordering only in draft/proposal mode; in active builds, it is read‑only.
* `GanttTimeline` draws the approved baseline bars, forecast bars, and actual completion markers for each milestone across a timeline grid.  It uses responsive canvas/SVG and Tailwind classes for styling.  It overlays `DrawGroupOverlay` boxes to denote draw group membership and eligibility status.
* `RoleAwareActionPanel` computes available actions based on the `WorkspaceViewContext` from the projection and the selected item.  It ensures that only allowed actions are shown to builders, staff, verifiers, site visitors, admins, MIC observers, or platform admins.

These screens/components are registered via the workspace route module and rely on data from the `BuildWorkspaceProjection` produced by the Foundation and Planning verticals.  They do not perform domain mutations directly; instead, they dispatch governed transition commands through `fluent-convex` actions.

---

## II. PRD for this vertical

### Context

The Build Workspace should answer:

- what was approved,
- what is actually happening,
- what is late,
- what is blocked,
- what evidence/verification is pending,
- what draw money is eligible or nearly eligible,
- what action is required next.

### Requirements

#### Workspace projection

The UI consumes a canonical read model instead of reconstructing raw domain state. This same projection powers the MIC portal API.

#### Approved vs forecast/actual

The workspace must distinguish:

- approved baseline start/end dates,
- forecast start/end dates,
- actual completion approval date,
- draw release dates.

Active build schedule drift updates forecast/actual reality. It does not mutate approved baseline.

#### Behind-schedule visualization

Behind-schedule Gantt cards should look alarming. The requirement is functional: anyone looking at the workspace should immediately see when something is late. Do not rely only on subtle color; use severity badges, warning rails, icons, timeline overrun, and text.

#### Draw group visibility

Draw groups are shown as milestone groupings/overlays with:

- included milestones,
- approved total,
- eligible total,
- readiness state,
- release approval state,
- manual release recorded state.

#### Role-aware actions

Builder sees claim completion actions. Verifier sees evidence review/request-site-visit actions. Admin sees completion approval and draw-release actions. MIC observer sees read-only status/evidence.

### Handoffs

| Handoff | From | To |
|---|---|---|
| `BuildWorkspaceProjection` | Projection service | Workspace UI + MIC API |
| Forecast command | Workspace UI | Revisions/Forecast vertical |
| Claim action | Workspace UI | Completion Claims vertical |
| Verify action | Workspace UI | Verification vertical |
| Draw release action | Workspace UI | Draw Release vertical |

---

## III. Spec

### 1. Workspace projection

```ts
export interface BuildWorkspaceProjection {
  id: Id<'BuildWorkspaceProjection'>;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;

  projectionVersion: number;
  updatedAt: ISODateTime;

  currentUserView?: WorkspaceViewContext;

  buildSummary: BuildSummaryDTO;
  approvedPlan: ApprovedPlanSummaryDTO;
  timeline: WorkspaceTimelineDTO;
  milestones: WorkspaceMilestoneDTO[];
  dependencies: WorkspaceDependencyDTO[];
  drawGroups: WorkspaceDrawGroupDTO[];
  completionClaims: WorkspaceCompletionClaimDTO[];
  siteVisits: WorkspaceSiteVisitDTO[];
  drawReleases: WorkspaceDrawReleaseDTO[];
  evidenceAssets: WorkspaceEvidenceAssetDTO[];
  warnings: WorkspaceWarningDTO[];
  availableActions: WorkspaceActionDTO[];
}
```

### 2. View context and redaction

```ts
export interface WorkspaceViewContext {
  userId?: UserId;
  role:
    | 'builder_principal'
    | 'builder_staff'
    | 'lender_admin'
    | 'lender_verifier'
    | 'site_visitor'
    | 'mic_observer'
    | 'platform_admin';
  redactions: WorkspaceRedaction[];
}

export type WorkspaceRedaction =
  | 'hide_interest_estimates'
  | 'hide_draw_fees'
  | 'hide_internal_notes'
  | 'hide_unapproved_evidence'
  | 'hide_financial_amounts';
```

### 3. Timeline and milestone DTO

```ts
export interface WorkspaceTimelineDTO {
  approvedStartDate: ISODate;
  approvedEndDate: ISODate;
  forecastStartDate?: ISODate;
  forecastEndDate?: ISODate;
  today: ISODate;
  scheduleHealth: 'on_track' | 'at_risk' | 'behind' | 'critical';
}

export interface WorkspaceMilestoneDTO {
  id: MilestoneId;
  name: string;
  category?: string;

  approvedValueCents?: MoneyCents;
  eligibleValueCents?: MoneyCents;

  approvedStartDate: ISODate;
  approvedEndDate: ISODate;

  forecastStartDate?: ISODate;
  forecastEndDate?: ISODate;
  actualCompletionApprovedAt?: ISODateTime;

  scheduleStatus:
    | 'not_started'
    | 'on_track'
    | 'at_risk'
    | 'behind'
    | 'critical'
    | 'complete';

  completionState:
    | 'not_claimed'
    | 'claim_in_review'
    | 'more_info_requested'
    | 'pending_site_visit'
    | 'completion_approved'
    | 'completion_rejected';

  currentCompletionClaimId?: CompletionClaimId;
  approvedCompletionClaimId?: CompletionClaimId;

  evidenceSummary: {
    requiredCount: number;
    submittedCount: number;
    acceptedCount?: number;
  };

  drawGroupId?: DrawGroupId;
}
```

### 4. Draw group DTO

```ts
export interface WorkspaceDrawGroupDTO {
  id: DrawGroupId;
  sequence: number;
  milestoneIds: MilestoneId[];

  approvedTotalCents: MoneyCents;
  eligibleTotalCents: MoneyCents;
  requestedReleaseTotalCents?: MoneyCents;

  status:
    | 'not_ready'
    | 'partially_ready'
    | 'ready_for_release_review'
    | 'release_approved'
    | 'release_recorded';

  drawReleaseId?: DrawReleaseId;
  plannedReleaseDate?: ISODate;
  approvedReleaseAt?: ISODateTime;
  recordedReleasedAt?: ISODateTime;
}
```

### 5. Warning model

```ts
export interface WorkspaceWarningDTO {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  code:
    | 'MILESTONE_BEHIND_SCHEDULE'
    | 'DRAW_GROUP_BLOCKED'
    | 'EVIDENCE_MISSING'
    | 'SITE_VISIT_PENDING'
    | 'CLAIM_AWAITING_VERIFICATION'
    | 'DRAW_READY_NOT_RELEASED'
    | 'POLICY_EXCEPTION'
    | 'FORECAST_EXCEEDS_BASELINE';
  message: string;
  relatedMilestoneIds?: MilestoneId[];
  relatedDrawGroupIds?: DrawGroupId[];
  relatedClaimIds?: CompletionClaimId[];
}
```

### 6. Available actions

```ts
export interface WorkspaceActionDTO {
  id: string;
  label: string;
  command:
    | 'OPEN_COMPLETION_CLAIM_DRAWER'
    | 'OPEN_VERIFICATION_DRAWER'
    | 'OPEN_SITE_VISIT_DRAWER'
    | 'OPEN_DRAW_RELEASE_DRAWER'
    | 'OPEN_FORECAST_EDIT_DRAWER'
    | 'OPEN_CHAT';
  entityType: string;
  entityId: string;
  enabled: boolean;
  disabledReason?: string;
}
```

### 7. UX flows

#### Builder claims completion

```text
1. Builder opens workspace.
2. Milestone card shows Claim Completion.
3. Builder opens claim drawer.
4. Completion Claims vertical owns upload/submission.
5. Workspace projection updates to claim_in_review.
```

#### Schedule goes behind

```text
1. Forecast end date exceeds approved baseline or today passes approved end.
2. Projection marks milestone behind/critical.
3. Gantt renders overrun and severity.
4. Warning rail explains baseline vs forecast/actual slippage.
```

#### Admin approves draw release

```text
1. Draw group overlay shows ready_for_release_review.
2. Admin opens release drawer.
3. Draw Release vertical owns approval/recording.
4. Projection updates release status.
```

### 8. Projection update triggers

```text
build.activated
milestone.forecast_updated
completion_claim.submitted
completion_claim.more_info_requested
completion_claim.approved
completion_claim.rejected
site_visit.requested
site_visit.submitted
draw_group.ready_for_release
draw_release.approved
draw_release.recorded
revision.applied
```

### 9. Tests

| Test | Expected |
|---|---|
| Builder view | No internal notes; claim action available where allowed. |
| Verifier view | Evidence/review actions visible; no release approval. |
| Admin view | Completion/release actions visible. |
| MIC observer | Read-only; internal/rejected evidence hidden. |
| Behind schedule | Warning and visual severity present. |
| Active Gantt edit | Forecast command emitted, baseline unchanged. |
