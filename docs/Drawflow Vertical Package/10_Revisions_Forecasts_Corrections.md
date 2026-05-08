# Vertical 10 — Revisions, Forecasts, and Corrections

## I. Actual agile epic / Linear project

### Objective

Build the minimal versioning/revision model that protects approved baselines while allowing active-build reality to change. The system must distinguish approved plan, forecast schedule, actual completion, and auditable corrections.

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

In active Build mode, date shifts update forecast/actual reality. Gantt bars may grow or slip when the build goes behind schedule. Behind schedule must look alarming in workspace.

#### Material revisions

Changes affecting money, dependencies, or draw eligibility require controlled revision or admin-only action.

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
| Correction without reason | Rejected. |
