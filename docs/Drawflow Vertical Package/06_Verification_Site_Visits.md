# Vertical 06 — Verification and Site Visits

## I. Actual agile epic / Linear project

### Objective

Build the evidence-first verification vertical. Authorized verifiers review completion claims, inspect uploaded proof, request more information, order discretionary site visits, review site-visit evidence, and approve or reject milestone completion.

### In scope

- Verification detail surface.
- Evidence review checklist.
- Request more information.
- Request/order site visit.
- Site visit assignment.
- Online responsive site visit report.
- Site visit evidence upload.
- Site visit submission.
- Verifier/admin discretionary completion decision.
- Auditable site-visit waiver if a site visit was required/requested.
- Completion approval amount calculation based on requested lower draw and approved cap.

### Out of scope

- Offline sync.
- Geofence verification.
- Complex scheduling/calendar.
- Route optimization.
- Native mobile app.
- Cost evidence enforcement.
- Payment/draw release approval.

### Definition of done

1. Submitted completion claims appear in verifier workflow.
2. Verifier can review all evidence attached to claim.
3. Verifier can request more info.
4. Verifier can order a site visit.
5. Assigned site visitor can submit report/evidence from responsive web UI while online.
6. Verifier/admin can approve or reject completion through governed transition.
7. Approval sets `approvedEligibleAmountCents` not exceeding approved milestone value remaining or builder-requested amount.
8. Completion approval emits audit/domain events and updates workspace projection.
9. Site visit flow has tests for request, assignment, submission, waiver, and forbidden access.

---

## II. PRD for this vertical

### Context

Verification is a human discretionary decision. The system does not prove construction quality. It preserves the evidence and the decision.

Site visits are **evidence-first and discretionary**. If uploaded proof is sufficient, the verifier can approve without site visit. If proof is weak, incomplete, suspicious, or policy-triggered, verifier/admin can order a site visit.

### Requirements

#### Verification decisions

Verifier/admin can:

- request more information,
- request site visit,
- approve completion,
- reject completion,
- waive site visit with reason if applicable.

Approval requires completion proof and any requested/required site visit to be satisfied or waived with reason.

#### Site visit policy

MVP default is discretionary. Policy hooks should still exist for future first/final/high-risk/high-value requirements.

#### Site visit flow

Minimal flow:

```text
requested → assigned → submitted
```

Cancellation is supported. No offline mode. No complex scheduling. Assignment, due date, notes, and report upload are enough.

#### Verifier authority

A staff verifier may be allowed to verify completion if granted permission. Lender admin can verify/override if permitted. Exact roles are configured through WorkOS/resource grants and DrawFlow guards.

### Use cases

1. Evidence is sufficient; verifier approves completion.
2. Evidence is missing; verifier requests more info.
3. Evidence is ambiguous; verifier orders site visit.
4. Site visitor submits report/photos; verifier approves completion.
5. Site visit requested but waived with reason.
6. Verifier rejects completion due to inadequate proof.

### Handoffs

| Handoff | From | To |
|---|---|---|
| Submitted claim | Completion Claims | Verification workflow |
| Site visit evidence | Evidence pipeline | Verification package |
| Completion approval | Draw Release / Workspace / MIC | `milestone_completion.approved` |
| More info/rejection | Claims / Notifications | Claim state update |

---

## III. Spec

### 1. Site visit state

```ts
export type SiteVisitStatus =
  | 'requested'
  | 'assigned'
  | 'submitted'
  | 'cancelled';
```

### 2. Site visit model

```ts
export interface SiteVisit {
  id: SiteVisitId;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;
  completionClaimId: CompletionClaimId;
  milestoneIds: MilestoneId[];

  status: SiteVisitStatus;

  requestedByUserId: UserId;
  requestedAt: ISODateTime;
  requestReason: string;

  assignedToUserId?: UserId;
  assignedAt?: ISODateTime;
  dueDate?: ISODate;

  submittedByUserId?: UserId;
  submittedAt?: ISODateTime;

  reportNotes?: string;
  evidencePackageId?: Id<'EvidencePackage'>;

  cancelledByUserId?: UserId;
  cancelledAt?: ISODateTime;
  cancellationReason?: string;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  aggregateVersion: number;
}
```

### 3. Site visit machine

```ts
import { createMachine } from 'xstate';

export const siteVisitMachine = createMachine({
  id: 'siteVisit',
  initial: 'requested',
  states: {
    requested: {
      on: {
        ASSIGN: { target: 'assigned', guard: 'assigneeCanPerformSiteVisit' },
        CANCEL: 'cancelled',
      },
    },
    assigned: {
      on: {
        SUBMIT_REPORT: { target: 'submitted', guard: 'siteVisitReportComplete' },
        REASSIGN: { target: 'assigned', guard: 'assigneeCanPerformSiteVisit' },
        CANCEL: 'cancelled',
      },
    },
    submitted: { type: 'final' },
    cancelled: { type: 'final' },
  },
});
```

### 4. Verification decision

```ts
export interface VerificationDecision {
  id: Id<'VerificationDecision'>;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;
  completionClaimId: CompletionClaimId;

  decidedByUserId: UserId;
  decidedAt: ISODateTime;

  decision:
    | 'approve_completion'
    | 'reject_completion'
    | 'request_more_info'
    | 'request_site_visit'
    | 'waive_site_visit';

  authorityLevel: 'recommendation' | 'final_decision';

  reasonCodes: string[];
  notes?: string;
  reviewedEvidenceAssetIds: EvidenceAssetId[];
  relatedSiteVisitIds?: SiteVisitId[];

  approvedEligibleAmountCents?: MoneyCents;
}
```

### 5. Completion approval amount

```ts
export function computeApprovedEligibleAmount(params: {
  approvedMilestoneValueRemainingCents: MoneyCents;
  requestedDrawAmountCents: MoneyCents;
  verifierApprovedAmountOverrideCents?: MoneyCents;
}): MoneyCents {
  const requested = Math.min(
    params.requestedDrawAmountCents,
    params.approvedMilestoneValueRemainingCents,
  );

  if (params.verifierApprovedAmountOverrideCents == null) return requested;

  if (params.verifierApprovedAmountOverrideCents > requested) {
    throw new Error('Cannot approve more than builder requested or approved milestone remaining');
  }

  if (params.verifierApprovedAmountOverrideCents <= 0) {
    throw new Error('Approved eligible amount must be positive');
  }

  return params.verifierApprovedAmountOverrideCents;
}
```

### 6. Guards

```ts
export async function canRequestSiteVisit(params: {
  actorUserId: UserId;
  claim: CompletionClaim;
}): Promise<boolean> {
  return hasPermission(params.actorUserId, params.claim.buildId, 'site_visit.request') &&
    ['under_verification', 'ready_for_completion_decision'].includes(params.claim.status);
}

export async function canApproveCompletion(params: {
  actorUserId: UserId;
  claim: CompletionClaim;
}): Promise<boolean> {
  const permissionOk = await hasPermission(
    params.actorUserId,
    params.claim.buildId,
    'completion_claim.verify',
  );

  const evidenceOk = await requiredEvidencePresent(params.claim);
  const siteVisitOk = await siteVisitRequirementSatisfied(params.claim);

  return permissionOk && evidenceOk && siteVisitOk;
}
```

### 7. UX flows

#### Approve without site visit

```text
1. Verifier opens completion claim.
2. Reviews builder-uploaded proof.
3. Evidence is satisfactory.
4. Verifier clicks Approve Completion.
5. System checks permission/evidence/site-visit guards.
6. Claim transitions to completion_approved.
7. approvedEligibleAmountCents is set.
8. Workspace/draw readiness updates.
```

#### Request site visit

```text
1. Verifier opens claim.
2. Evidence is insufficient.
3. Verifier clicks Request Site Visit.
4. Provides reason and optional due date.
5. SiteVisit is created.
6. Claim state becomes pending_site_visit.
```

#### Submit site visit

```text
1. Assigned site visitor opens responsive flow on phone/tablet.
2. Captures/uploads photos/documents while online.
3. Adds report notes.
4. Submits report.
5. SiteVisit becomes submitted.
6. Claim returns to under_verification or ready_for_completion_decision.
```

### 8. API endpoints

```http
POST /api/v1/completion-claims/:claimId/request-more-info
POST /api/v1/completion-claims/:claimId/request-site-visit
POST /api/v1/completion-claims/:claimId/waive-site-visit
POST /api/v1/completion-claims/:claimId/approve-completion
POST /api/v1/completion-claims/:claimId/reject-completion

POST /api/v1/site-visits/:siteVisitId/assign
POST /api/v1/site-visits/:siteVisitId/submit-report
POST /api/v1/site-visits/:siteVisitId/cancel
```

All endpoints invoke governed transitions.

### 9. Events

```text
completion_claim.more_info_requested
site_visit.requested
site_visit.assigned
site_visit.submitted
site_visit.cancelled
site_visit.waived
milestone_completion.approved
milestone_completion.rejected
draw_group.readiness_recomputed
workspace_projection.updated
```

### 10. Tests

| Test | Expected |
|---|---|
| Approve without evidence | Guard rejection. |
| Approve with requested site visit pending | Guard rejection. |
| Waive site visit without reason | Guard rejection. |
| Site visitor accesses unassigned visit | Forbidden. |
| Site visit evidence uploaded | Linked to site visit and claim. |
| Completion approved | Milestone summary/draw readiness update. |
| Verifier approves more than requested | Rejected. |
