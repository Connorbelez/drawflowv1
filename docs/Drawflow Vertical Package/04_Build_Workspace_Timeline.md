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
