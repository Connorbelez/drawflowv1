# Vertical 10 — Revisions, Forecasts, and Corrections

## I. Actual agile epic / Linear project

### Objective

Build the minimal versioning/revision model that protects approved baselines while allowing active-build reality to change. The system must distinguish approved plan, forecast schedule, actual completion, and auditable corrections.

### Technology alignment

Forecast updates and revisions are executed through Convex actions using `fluent-convex`.  The Gantt/forecast editing UI in the Build Workspace uses React 19 and TanStack Query to dispatch `updateMilestoneForecast` commands.  Data persistence uses Convex collections with immutable baseline versions and mutable forecast fields.  All money/date calculations operate on integer cents and ISO date strings.  No direct writes to approved baseline documents are allowed—every material change requires a governed transition.

This area needs further product refinement. The minimal baseline/forecast split is required for MVP; full material revision workflow can be thin.

### In scope

- Approved baseline vs forecast/actual model.
- Forecast date updates for active builds.
- Schedule slippage calculation.
- Warning severity for behind-schedule milestones.
- Correction events for erroneous manual records.
- Minimal admin-only material revision model.
- Versioned budget/roadmap/draw plan references.

### Out of scope

- Full collaborative change-order system.
- Contractor change management.
- Overrun financing.
- Full policy-driven revision approval matrix.
- Complex dependency rewrite UX.
- Automatic re-optimization after every change unless explicitly invoked.

### Definition of done

1. Active-build Gantt/forecast updates never mutate approved baseline dates.
2. Forecast schedule can be updated through governed command.
3. Behind-schedule status is computed from approved baseline vs forecast/actual.
4. Material changes have admin-only revision/correction path or are explicitly blocked.
5. Manual release correction is auditable.
6. Tests prove approved baseline immutability.

---

## II. PRD for this vertical

### Context

After activation, reality will diverge from the approved plan. The product needs a simple but rigorous model:

```text
Approved baseline = what lender approved.
Forecast = current best expectation.
Actual = recorded completion/release facts.
Revision = controlled change to approved baseline.
Correction = auditable fix to erroneous recorded fact.
```

### Requirements

#### Approved baseline immutability

Once a proposal is activated, approved baseline versions cannot be edited directly.

#### Forecast changes

In active Build mode, date shifts update forecast/actual reality.  Users can adjust the forecast start and end dates for milestones, and the system will recompute schedule health accordingly.  When a milestone goes behind schedule, **all dependent milestones automatically shift** their forecast start dates forward in a waterfall effect to preserve dependency ordering.  The approved baseline dates remain immutable.  Gantt bars should grow or slip when the build goes behind schedule or completes early, and behind schedule must look alarming in the workspace.

#### Material revisions

Changes affecting money, dependencies, or draw eligibility require a controlled revision or admin‑only action and are therefore **deferred out of scope for the MVP** unless explicitly invoked by a revision request.  This includes changing approved milestone values, adding or removing milestones, altering dependencies, or moving milestones between draw groups.  Approved baselines are immutable; active schedule adjustments only affect forecast/actual fields.

Examples:

- milestone approved value changes,
- milestone added/removed,
- dependency changed,
- draw group membership changed,
- approved draw amount changed.

#### Overruns

Budget overruns are not reimbursed. Approved amount is the cap. If builder needs more capital, that is handled outside DrawFlow v1.

#### Under-budget / lower draw

Handled through completion claim requested lower draw amount and release approval amount.

### Handoffs

| Handoff | From | To |
|---|---|---|
| Forecast updates | Workspace UI | Forecast command |
| Slippage warnings | Forecast service | Workspace projection |
| Material revision applied | Revision service | Proposal/Planning/Workspace/MIC |
| Corrections | Draw Release/Verification | Audit/projection |

---

## III. Spec

### 1. Schedule state

```ts
export interface MilestoneScheduleState {
  tenantOrgId: TenantOrgId;
  buildId: BuildId;
  milestoneId: MilestoneId;

  approvedStartDate: ISODate;
  approvedEndDate: ISODate;

  forecastStartDate?: ISODate;
  forecastEndDate?: ISODate;

  actualStartedAt?: ISODateTime;
  actualCompletionApprovedAt?: ISODateTime;

  scheduleStatus:
    | 'not_started'
    | 'on_track'
    | 'at_risk'
    | 'behind'
    | 'critical'
    | 'complete';

  updatedAt: ISODateTime;
}
```

### 2. Forecast update command

```ts
export interface UpdateMilestoneForecastCommand {
  tenantOrgId: TenantOrgId;
  actorUserId: UserId;
  buildId: BuildId;
  milestoneId: MilestoneId;

  forecastStartDate?: ISODate;
  forecastEndDate?: ISODate;

  reason?: string;
  correlationId: string;
}

/**
 * When a milestone’s forecast end date is extended beyond its approved or current forecast end, the system must
 * propagate the delay to all dependent milestones.  Dependent milestones’ forecast start dates shift forward so
 * that no milestone starts before its dependencies complete.  This propagation is performed inside the command
 * handler and updates the forecast fields of all affected milestones while leaving the approved baseline unchanged.
 */
```

Rules:

```text
- User must have milestone.update_forecast.
- Forecast end cannot be before forecast start.
- Approved baseline remains unchanged.
- Forecast change emits audit and workspace_projection.updated.
```

### 3. Slippage calculation

```ts
export function computeScheduleStatus(params: {
  today: ISODate;
  approvedEndDate: ISODate;
  forecastEndDate?: ISODate;
  actualCompletionApprovedAt?: ISODateTime;
}): MilestoneScheduleState['scheduleStatus'] {
  if (params.actualCompletionApprovedAt) return 'complete';

  const effectiveEnd = params.forecastEndDate ?? params.approvedEndDate;
  const daysLate = diffDays(effectiveEnd, params.approvedEndDate);
  const daysPastApprovedEnd = diffDays(params.today, params.approvedEndDate);

  if (daysLate >= 30 || daysPastApprovedEnd >= 14) return 'critical';
  if (daysLate >= 14 || daysPastApprovedEnd >= 7) return 'behind';
  if (daysLate > 0 || daysPastApprovedEnd > 0) return 'at_risk';
  return 'on_track';
}
```

Thresholds are placeholders and can become policy-configurable later.

### 4. Revision model

```ts
export type RevisionType =
  | 'budget_revision'
  | 'roadmap_revision'
  | 'draw_plan_revision'
  | 'combined_plan_revision'
  | 'correction';

export interface RevisionRequest {
  id: Id<'RevisionRequest'>;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;

  type: RevisionType;

  status:
    | 'draft'
    | 'submitted'
    | 'approved'
    | 'rejected'
    | 'applied'
    | 'cancelled';

  basePlanVersionSetId: Id<'ApprovedPlanVersionSet'>;
  proposedPlanVersionSetId?: Id<'ApprovedPlanVersionSet'>;

  requestedByUserId: UserId;
  approvedByUserId?: UserId;

  reason: string;
  createdAt: ISODateTime;
  approvedAt?: ISODateTime;
  appliedAt?: ISODateTime;

  aggregateVersion: number;
}
```

### 5. Revision machine

```ts
import { createMachine } from 'xstate';

export const revisionRequestMachine = createMachine({
  id: 'revisionRequest',
  initial: 'draft',
  states: {
    draft: {
      on: {
        SUBMIT: { target: 'submitted', guard: 'revisionHasReasonAndDiff' },
        CANCEL: 'cancelled',
      },
    },
    submitted: {
      on: {
        APPROVE: { target: 'approved', guard: 'actorCanApproveRevision' },
        REJECT: 'rejected',
        CANCEL: 'cancelled',
      },
    },
    approved: {
      on: {
        APPLY: { target: 'applied', guard: 'proposedVersionSetValid' },
      },
    },
    applied: { type: 'final' },
    rejected: { type: 'final' },
    cancelled: { type: 'final' },
  },
});
```

### 6. MVP material change policy

| Change | MVP handling |
|---|---|
| Forecast start/end date | Allowed through forecast command. |
| Progress notes | Allowed. |
| Evidence upload | Allowed through claim/evidence vertical. |
| Approved milestone value | Requires admin revision or out of scope. |
| Dependency change | Requires admin revision or out of scope. |
| Draw group membership | Requires admin revision. |
| Milestone add/delete | Requires admin revision or defer. |
| Completed milestone reversal | Correction/reversal flow; no silent edit. |
| Manual release record error | Draw release correction flow. |

### 7. UX flows

#### Build slips behind schedule

```text
1. User updates forecast end date or time passes beyond approved end.
2. Forecast service computes behind/critical status.
3. Workspace Gantt shows alarming overrun.
4. Warning rail explains baseline vs forecast/actual slippage.
5. MIC projection can expose schedule status.
```

#### Material revision

```text
1. Admin opens revision action.
2. Selects revision type.
3. Provides reason.
4. Creates proposed version set or targeted diff.
5. Approves and applies.
6. New approved baseline version set becomes active.
7. Old approvals remain tied to old baseline version.
```

### 8. Events

```text
milestone.forecast_updated
milestone.schedule_status_changed
revision.submitted
revision.approved
revision.applied
manual_record.corrected
workspace_projection.updated
```

### 9. Tests

| Test | Expected |
|---|---|
| Forecast update | Approved baseline unchanged. |
| Forecast end before start | Rejected. |
| Time beyond approved end | Status at_risk/behind/critical. |
| Direct approved value edit | Forbidden. |
| Revision applied | New version active; old history preserved. |

## IV. Screen and Component Manifest
The Revisions, Forecasts, and Corrections vertical introduces UI surfaces for updating forecasts during active builds, initiating material revisions, reviewing revisions, and displaying schedule slippage.  **Routes defined here register through the Foundation’s route module contract** and live under `/app/:orgSlug/builds/:buildId/*` for forecast updates and revision creation, and `/app/:orgSlug/revisions/:revisionRequestId` for revision review.  These screens extend the Build Workspace and provide admin‑only flows for revision approval.  The table below maps these screens and components to the requirements and use cases described in the PRD.

| Screen / Route | Components | Purpose & context | Mapped requirements/use‑cases |
|---|---|---|---|
| **`ForecastEditorPanel`** (embedded in `BuildWorkspaceScreen`) | `ForecastDatePicker`, `ReasonInput`, `UpdateForecastButton`, `ScheduleStatusBadge` | Appears in the active Build Workspace for each milestone.  Users with `milestone.update_forecast` permission can adjust forecast start and end dates via `ForecastDatePicker`.  `ReasonInput` captures a short justification; `UpdateForecastButton` dispatches an `UpdateMilestoneForecastCommand` through a `fluent-convex` action.  `ScheduleStatusBadge` displays whether the milestone is on track, at risk, behind, critical, or complete, computed via `computeScheduleStatus`.  Visual cues (colour-coded bars, warning rail) highlight slippage compared to the approved baseline. | PRD: Forecast changes (Section II Requirements: Forecast changes); Schedule slippage calculation and warning severity; definition‑of‑done items 1–4; tests verifying approved baseline immutability. |
| **`SlippageWarningPanel`** (embedded in workspace sidebar) | `MilestoneScheduleStatusList`, `WarningExplanationPopover`, `PolicyConfigLink` | Consolidates schedule statuses across milestones and explains behind/critical states.  Links to policy configuration (future) or help documentation for how slippage is computed. | PRD: Slippage warnings (Section II Requirements: Forecast changes; Section III Spec item 3); ensures behind‑schedule milestones are alarming. |
| **`RevisionRequestScreen`** (`/app/:orgSlug/builds/:buildId/revisions/new`) | `RevisionTypeSelector`, `AffectedMilestonesSelector`, `ProposedChangesForm`, `RevisionReasonInput`, `SubmitRevisionButton` | Allows an admin to draft a material revision.  `RevisionTypeSelector` chooses between budget, roadmap, draw plan, combined plan, or correction; `AffectedMilestonesSelector` identifies which milestones are affected; `ProposedChangesForm` captures proposed new values (e.g., new approved values, dependency changes); `RevisionReasonInput` provides justification; `SubmitRevisionButton` creates a `RevisionRequest` with status `draft` or `submitted` and triggers the `SUBMIT` event if ready. | PRD: Material changes requiring controlled revision (Section II Requirements: Material revisions); Spec items 4–6; definition‑of‑done item 4. |
| **`RevisionReviewScreen`** (`/app/:orgSlug/revisions/:revisionRequestId`) | `RevisionSummary`, `DiffViewer`, `ApproveButton`, `RejectButton`, `ApplyButton`, `RevisionStatusBadge` | Used by authorized administrators to review, approve, and apply revision requests.  `RevisionSummary` displays the type, reason, and requested changes; `DiffViewer` compares the base plan version set with the proposed changes; `ApproveButton` and `RejectButton` trigger the `APPROVE` or `REJECT` events; once approved, `ApplyButton` invokes the `APPLY` event to make the proposed version set active.  `RevisionStatusBadge` indicates whether the request is draft, submitted, approved, applied, rejected, or cancelled. | PRD: Revision approval workflow (Spec items 5–6); requirement that approved baseline vs forecast/actual model remains immutable; tests verifying baseline immutability. |
| **`CorrectionForm`** (contextual modal) | `CorrectedValueInputs`, `CorrectionReasonInput`, `SubmitCorrectionButton` | Used when an erroneous manual record (e.g., draw release) needs correction.  Collects corrected values and a required reason, then triggers a correction command (e.g., `CORRECT` event in Draw Release).  Typically opened from within the `DrawReleaseDetailScreen`. | PRD: Corrections flow (Section II Requirements: Correction events for erroneous manual records; Spec items 6 and 8); tests verifying corrections require a reason. |

**Component notes:**

- **`ForecastDatePicker`** ensures that forecast end dates cannot precede forecast start dates and that only forecast fields are mutated.  It uses ISO date strings and validates against the baseline dates.
- **`ScheduleStatusBadge`** derives its state from `MilestoneScheduleState.scheduleStatus` and applies Tailwind classes (`on_track`, `at_risk`, `behind`, `critical`, `complete`) to colour the milestone bar in the Gantt timeline.
- **`RevisionTypeSelector`** enumerates the revision types defined in Spec item 4 (`budget_revision`, `roadmap_revision`, etc.) and disables options that are out of scope for the current build state or user role.
- **`DiffViewer`** visualises differences between the base plan and proposed version sets.  It may be implemented using a tree or side‑by‑side diff component and highlights changed values.

Forecast editing is available only after a proposal is activated.  Material revisions and corrections require administrative permissions (`revision.manage`) and leverage the revision request state machine defined in Spec item 5.  All commands are dispatched through `fluent-convex` actions to enforce governance and audit.  The workspace projection updates in response to forecast updates (`workspace_projection.updated` event), and slippage warnings propagate to the MIC portal via the read‑only API.
| Correction without reason | Rejected. |
