# Vertical 07 — Draw Release Approval and Manual Recording

## I. Actual agile epic / Linear project

### Objective

Build the draw release vertical that turns approved milestone completions into draw-group eligibility, lets an admin separately approve draw release, and lets an admin manually record that the draw was released outside DrawFlow.

DrawFlow does not move money. It records workflow decisions and manual release status.

### In scope

- Draw group readiness calculation.
- Eligible amount calculation using approved completion amounts.
- Admin release approval.
- Manual release recording.
- External reference and notes.
- Correction flow for mistaken release records.
- Audit and events.
- Workspace/MIC projection updates.

### Out of scope

- Payment rails.
- Ledger/accounting truth.
- Actual servicing accrual.
- Builder receipt confirmation.
- Double confirmation.
- Automatic bank/payment integration.

### Definition of done

1. Draw group becomes ready only when included milestones have approved completion.
2. Draw group eligible amount uses approved completion eligible amounts, including builder-requested lower draw amounts.
3. Admin can approve release separately from completion approval.
4. Admin can manually record release with release date, amount, optional reference, and notes.
5. System language never implies authoritative payment execution.
6. Correction flow exists for wrong manual release records.
7. Approval, recording, and correction emit audit/domain events.
8. Tests cover blocked draw group, lower requested amount, approval, recording, correction, and unauthorized access.

---

## II. PRD for this vertical

### Context

Milestone completion approval and draw release approval are intentionally decoupled. Completion approval means the work claim is accepted. Draw release approval means the lender is ready to release the eligible funds. Manual release recording means an admin asserts the release was handled outside DrawFlow.

This separation prevents dangerous assumptions and preserves future flexibility.

### Requirements

#### Draw group readiness

A draw group is ready only when all included milestones have approved completion and no blocking policy exception remains.

#### Eligible amount

```text
draw group eligible amount =
  sum(approved eligible amount for each included milestone)
```

For normal cases, approved eligible amount equals approved milestone value. If builder requested lower amount, approved eligible amount should use that lower amount unless admin lowers further with reason.

#### Release approval

Admin may approve a release amount less than or equal to eligible amount. Admin cannot approve more than eligible amount.

#### Manual release recording

Admin records:

- released amount,
- release date,
- optional external reference,
- optional notes.

This is CRM-style tracking, not payment execution.

### Handoffs

| Handoff | From | To |
|---|---|---|
| Completion approval | Verification | Draw readiness recomputation |
| Release status | Workspace/MIC/Webhooks | `DrawRelease` and projection |
| Release amount/date | Reporting/planning future | Manual record only |
| Audit/event | Foundation/Webhooks | `draw_release.approved`, `draw_release.recorded` |

---

## III. Spec

### 1. Status types

```ts
export type DrawGroupStatus =
  | 'not_ready'
  | 'partially_ready'
  | 'ready_for_release_review'
  | 'release_approved'
  | 'release_recorded';

export type DrawReleaseStatus =
  | 'ready_for_release_review'
  | 'release_approved'
  | 'release_recorded'
  | 'cancelled'
  | 'corrected';
```

### 2. Draw release model

```ts
export interface DrawRelease {
  id: DrawReleaseId;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;
  drawGroupId: DrawGroupId;

  status: DrawReleaseStatus;

  eligibleAmountCents: MoneyCents;
  approvedReleaseAmountCents?: MoneyCents;

  approvedByUserId?: UserId;
  approvedAt?: ISODateTime;
  approvalReason?: string;

  recordedReleasedByUserId?: UserId;
  recordedReleasedAt?: ISODateTime;
  recordedReleaseDate?: ISODate;
  recordedReleasedAmountCents?: MoneyCents;
  externalReference?: string;
  releaseNotes?: string;

  correctedByUserId?: UserId;
  correctedAt?: ISODateTime;
  correctionReason?: string;
  supersedingDrawReleaseId?: DrawReleaseId;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  aggregateVersion: number;
}
```

### 3. Readiness calculation

```ts
export function computeDrawGroupReadiness(params: {
  drawGroupMilestoneIds: MilestoneId[];
  approvedCompletionClaimsByMilestone: Map<MilestoneId, CompletionClaim>;
}): {
  status: 'not_ready' | 'partially_ready' | 'ready_for_release_review';
  eligibleAmountCents: MoneyCents;
  missingMilestoneIds: MilestoneId[];
} {
  let eligibleAmountCents = 0;
  const missingMilestoneIds: MilestoneId[] = [];

  for (const milestoneId of params.drawGroupMilestoneIds) {
    const claim = params.approvedCompletionClaimsByMilestone.get(milestoneId);

    if (!claim || claim.status !== 'completion_approved' || claim.approvedEligibleAmountCents == null) {
      missingMilestoneIds.push(milestoneId);
    } else {
      eligibleAmountCents += claim.approvedEligibleAmountCents;
    }
  }

  if (missingMilestoneIds.length === params.drawGroupMilestoneIds.length) {
    return { status: 'not_ready', eligibleAmountCents, missingMilestoneIds };
  }

  if (missingMilestoneIds.length > 0) {
    return { status: 'partially_ready', eligibleAmountCents, missingMilestoneIds };
  }

  return { status: 'ready_for_release_review', eligibleAmountCents, missingMilestoneIds };
}
```

### 4. Draw release machine

```ts
import { createMachine } from 'xstate';

export const drawReleaseMachine = createMachine({
  id: 'drawRelease',
  initial: 'ready_for_release_review',
  states: {
    ready_for_release_review: {
      on: {
        APPROVE_RELEASE: { target: 'release_approved', guard: 'canApproveRelease' },
        CANCEL: 'cancelled',
      },
    },
    release_approved: {
      on: {
        RECORD_MANUAL_RELEASE: { target: 'release_recorded', guard: 'manualReleaseRecordValid' },
        CANCEL: 'cancelled',
      },
    },
    release_recorded: {
      on: {
        CORRECT: { target: 'corrected', guard: 'correctionReasonPresent' },
      },
    },
    corrected: { type: 'final' },
    cancelled: { type: 'final' },
  },
});
```

### 5. Guards

```ts
export function canApproveRelease(params: {
  actorUserId: UserId;
  eligibleAmountCents: MoneyCents;
  requestedApprovalAmountCents: MoneyCents;
  drawGroupStatus: DrawGroupStatus;
}): boolean {
  return hasPermissionSync(params.actorUserId, 'draw_release.approve') &&
    params.drawGroupStatus === 'ready_for_release_review' &&
    params.requestedApprovalAmountCents > 0 &&
    params.requestedApprovalAmountCents <= params.eligibleAmountCents;
}

export function manualReleaseRecordValid(params: {
  approvedReleaseAmountCents: MoneyCents;
  recordedReleasedAmountCents: MoneyCents;
  recordedReleaseDate: ISODate;
}): boolean {
  return params.recordedReleasedAmountCents > 0 &&
    params.recordedReleasedAmountCents <= params.approvedReleaseAmountCents &&
    Boolean(params.recordedReleaseDate);
}
```

### 6. API endpoints

```http
POST /api/v1/draw-groups/:drawGroupId/recompute-readiness
POST /api/v1/draw-releases/:drawReleaseId/approve-release
POST /api/v1/draw-releases/:drawReleaseId/record-manual-release
POST /api/v1/draw-releases/:drawReleaseId/correct
GET  /api/v1/draw-releases/:drawReleaseId
```

### 7. UX flows

#### Release approval

```text
1. Admin opens ready draw group.
2. Sees included milestones and eligible amount.
3. Enters/accepts release amount.
4. Clicks Approve Release.
5. System transitions to release_approved.
```

#### Manual record

```text
1. Admin opens approved release.
2. Enters release date, amount, optional external reference.
3. Clicks Record Draw Released.
4. System transitions to release_recorded.
5. Workspace/MIC projection updates.
```

### 8. Events

```text
draw_group.ready_for_release
draw_release.created
draw_release.approved
draw_release.recorded
draw_release.corrected
workspace_projection.updated
```

### 9. Tests

| Test | Expected |
|---|---|
| Missing milestone approval | Draw group not ready. |
| Completion lower requested amount | Eligible amount uses lower amount. |
| Approve release above eligible | Rejected. |
| Record before approval | Rejected. |
| Record amount above approval | Rejected. |
| Correction without reason | Rejected. |
| Release recorded | Audit/event/projection update. |
