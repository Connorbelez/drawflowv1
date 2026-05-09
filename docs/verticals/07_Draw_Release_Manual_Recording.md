# Vertical 07 — Draw Release Approval and Manual Recording

## I. Actual agile epic / Linear project

### Objective

Build the draw release vertical that turns approved milestone completions into draw-group eligibility, lets an admin separately approve draw release, and lets an admin manually record that the draw was released outside DrawFlow.

DrawFlow does not move money. It records workflow decisions and manual release status.

### Technology alignment

All draw release workflows are implemented on the same Bun/Convex stack used throughout DrawFlow.  Release readiness calculations and release approvals are performed in Convex actions authored via `fluent-convex`.  The admin interface uses React 19 and TanStack Query to display draw eligibility, approved amounts, and release history.  Notifications use Sonner for toasts, and workspace projections update via outbox events.  Authentication and tenant scoping continue to rely on WorkOS AuthKit.

### In scope

- Draw group readiness calculation.
- Eligible amount calculation using approved completion amounts.
- Admin release approval.
- Manual release recording.
- External reference and notes.
- Correction flow for mistaken release records.
- Audit and events.
- Workspace/MIC projection updates.

Additional responsibilities:

- **Builder receipt confirmation:** After a release is recorded, the builder lead must confirm receipt of funds or report a discrepancy.  DrawFlow records this acknowledgement or exception for operational tracking but does not treat it as authoritative payment settlement.  Unconfirmed receipts are surfaced in the operations queue for follow‑up.

### Out of scope

- Payment rails.
- Ledger/accounting truth.
- Actual servicing accrual.
- Double confirmation (additional multi-step release approval beyond the builder receipt acknowledgement).
- Automatic bank/payment integration.

### Definition of done

1. Draw group becomes ready only when included milestones have approved completion.
2. Draw group eligible amount uses approved completion eligible amounts, including builder-requested lower draw amounts.
3. Admin can approve release separately from completion approval.
4. Admin can manually record release with release date, amount, optional reference, and notes.
5. System language never implies authoritative payment execution.
6. Correction flow exists for wrong manual release records.
7. Approval, recording, and correction emit audit/domain events.
8. Builder receipt confirmation is captured: after manual release recording, the builder lead can confirm receipt or report an exception.  Unconfirmed receipts are surfaced in the operations queue.  Receipt confirmation events do not affect legal disbursement status.
9. Tests cover blocked draw group, lower requested amount, approval, recording, correction, builder receipt confirmation flows, and unauthorized access.

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

  /**
   * Builder receipt acknowledgement.  After a draw is recorded, the builder lead confirms
   * that funds were received or reports an exception.  This does not affect legal
   * disbursement but is used for operational tracking.
   */
  receiptStatus?: 'pending' | 'confirmed' | 'exception';
  receiptConfirmedByUserId?: UserId;
  receiptConfirmedAt?: ISODateTime;
  receiptExceptionReason?: string;

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

## IV. Screen and Component Manifest
This section outlines the user‑facing screens and UI components that implement the Draw Release Approval and Manual Recording vertical.  **Routes for these screens are registered via the Foundation’s route module contract.**  Build‑scoped pages live under `/app/:orgSlug/builds/:buildId/*` using `BuildScopedLayout`, while release‑scoped pages live under `/app/:orgSlug/draw-releases/:drawReleaseId`.  These surfaces are primarily used by lender administrators to approve and record draw releases and by builders to acknowledge receipt.  The mapping below ties each screen and component back to the requirements and use cases defined in the PRD.

| Screen / Route | Components | Purpose & context | Mapped requirements/use‑cases |
|---|---|---|---|
| **`DrawGroupListScreen`** (`/app/:orgSlug/builds/:buildId/draw-groups`) | `DrawGroupRow`, `DrawGroupStatusBadge`, `EligibleAmountDisplay`, `ReadyIndicator`, `ViewDetailsButton` | Presents a list of draw groups for a build along with their readiness status (`not_ready`, `partially_ready`, or `ready_for_release_review`), the sum of approved eligible amounts, and an indicator if release review is pending.  Clicking the details button navigates to the `DrawReleaseDetailScreen`.  This screen helps admins prioritise which groups need release approval. | PRD: Draw group readiness determination and eligible amount calculation (Definition of done 1–2); requirement that admin must approve release separately from completion approval. |
| **`DrawReleaseDetailScreen`** (`/app/:orgSlug/draw-releases/:drawReleaseId` or `/app/:orgSlug/builds/:buildId/draw-groups/:drawGroupId`) | `DrawGroupSummary`, `MilestoneBreakdownList`, `EligibleAmountDisplay`, `ApprovalForm`, `ManualReleaseForm`, `CorrectionForm`, `ReceiptStatusBanner`, `ReleaseHistoryTimeline` | Displays details for a specific draw group and associated release record.  `DrawGroupSummary` shows included milestones and approved eligible amounts; `MilestoneBreakdownList` itemises each milestone’s approved eligible amount and requested lower draw; `EligibleAmountDisplay` calculates the maximum release amount.  If no release exists, the `ApprovalForm` allows an admin to enter the approved release amount (≤ eligible amount) and optional reason; this triggers the `APPROVE_RELEASE` event.  Once a release is approved, the `ManualReleaseForm` collects the actual released amount, release date, optional external reference, and notes; submission triggers the `RECORD_MANUAL_RELEASE` event.  If a release record is incorrect, `CorrectionForm` allows admin to enter corrected values and a reason; this triggers the `CORRECT` event.  `ReceiptStatusBanner` shows whether the builder has confirmed receipt, reported an exception, or is pending.  `ReleaseHistoryTimeline` lists previous approvals, recordings, and corrections for auditability. | PRD: Eligible amount (Definition of done 2); Release approval (Requirements: Release approval); Manual release recording (Requirements: Manual release recording); Correction flow for mistaken release records (In scope); Builder receipt confirmation (Additional responsibilities). |
| **`ManualReleaseRecordModal`** (child of detail screen) | `ReleaseAmountInput`, `ReleaseDatePicker`, `ExternalReferenceInput`, `ReleaseNotesInput`, `RecordButton` | A focused modal for entering manual release details after approval.  Validates that the recorded amount is > 0 and ≤ approved amount, and that a release date is provided.  On submission invokes the `RECORD_MANUAL_RELEASE` transition.  This modal may be a separate screen on mobile. | PRD: Manual release record (Definition of done 4–7); requirement to record released amount/date/reference/notes; policy for external reference requirement enforced via guard. |
| **`ReceiptConfirmationScreen`** (`/app/:orgSlug/draw-releases/:drawReleaseId/receipt`) | `ReleaseSummary`, `ConfirmReceiptButton`, `ReportExceptionButton`, `ExceptionReasonInput` | Used by the builder lead to acknowledge that funds have been received or to report an exception.  `ReleaseSummary` shows the recorded release amount, date, and reference; `ConfirmReceiptButton` sets receipt status to `confirmed` and triggers an acknowledgement event; `ReportExceptionButton` prompts for a reason and sets receipt status to `exception`.  Unconfirmed receipts surface to the operations queue. | PRD: Builder receipt confirmation (Additional responsibilities); requirement that confirmation does not affect legal disbursement but is tracked for operational follow‑up. |

**Component notes:**

- **`DrawGroupRow`** displays the draw group identifier, readiness status badge, eligible amount, and an action button.  It responds to changes in draw group status projected from the planning engine and completion verification.
- **`EligibleAmountDisplay`** computes the sum of `approvedEligibleAmountCents` across the draw group’s milestones and formats it for display.  It updates when builder requests lower draw amounts or admin lowers the release approval.
- **`ApprovalForm`** enforces guard logic (via `canApproveRelease`) to ensure the requested approval amount is > 0 and ≤ eligible amount.  It collects an optional reason and triggers the `APPROVE_RELEASE` event through a `fluent-convex` action.
- **`ManualReleaseForm`** collects the recorded release date and amount and optional external reference and notes.  It validates inputs and calls the `RECORD_MANUAL_RELEASE` transition.  External reference may be required depending on tenant policy (Draw Release Policy).  Notes provide context but are not authoritative.
- **`CorrectionForm`** appears when a release record exists and allows an admin to correct the record with a reason.  It calls the `CORRECT` transition and marks the existing record as corrected.
- **`ReceiptStatusBanner`** surfaces whether receipt has been confirmed, is pending, or has an exception.  It prompts the builder lead to confirm receipt via `ReceiptConfirmationScreen` and surfaces exceptions to the operations queue.

All screens enforce permissions defined in the Foundation vertical.  Release approval requires the `draw_release.approve` permission; manual release recording requires `draw_release.record`; builder receipt confirmation requires the builder’s `draw_release.confirm_receipt` permission.  They dispatch commands through the API endpoints described in the Spec (Section 6) and rely on the state machine defined in Section 4.
