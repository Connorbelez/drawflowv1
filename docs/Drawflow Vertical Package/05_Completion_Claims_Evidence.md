# Vertical 05 — Completion Claims and Evidence

## I. Actual agile epic / Linear project

### Objective

Build the vertical that lets builders and builder staff claim milestone completion by uploading structured proof. Completion proof is mandatory. Cost evidence is not required in v1. Builder may request a lower draw amount than the approved milestone value.

### In scope

- Completion claim creation/submission.
- Structured evidence requirement checklist.
- Responsive web/PWA-style online evidence capture.
- Direct camera capture where browser supports it.
- File upload pipeline.
- Evidence asset metadata, hash, private storage descriptor.
- Evidence package linking.
- Requested lower draw amount.
- More-info response upload path.
- Claim history.
- Completion claim state machine.

### Out of scope

- Offline sync.
- Geofence verification.
- Anti-spoofing.
- Cost evidence requirement.
- Contractor registry.
- Native mobile app.
- Chat as workflow state.

### Definition of done

1. Builder can create a completion claim for a milestone.
2. Required completion proof must be uploaded before submission.
3. Evidence assets are tenant/build scoped and privately stored.
4. Evidence assets have immutable metadata and content hash.
5. Builder can request a lower draw amount not exceeding approved remaining milestone value.
6. Submitted claim enters verification through governed transition.
7. Rejected claim cannot be overwritten.
8. Tests cover missing evidence, oversized file, forbidden access, lower-draw validation, and audit/event emission.

---

## II. PRD for this vertical

### Context

“All work must be verified” means every claim of milestone completion must be backed by uploaded proof and reviewed by an authorized human. The system should not pretend to verify work automatically. It collects proof, preserves evidence, and routes the claim into verification.

### Requirements

#### Completion claim

A completion claim is the builder’s assertion that a milestone is complete. It is separate from the milestone so rejected/superseded/resubmitted claims do not destroy history.

#### Evidence

Proof of completion is required. Evidence should be structured enough to be reviewable, but the workflow should stay simple.

Evidence purposes:

- `completion_verification`,
- `site_visit`,
- `cost_support`,
- `admin_internal`.

MVP primarily uses `completion_verification`. Cost support is optional and does not block release in v1.

#### Lower draw request

Because reimbursement basis is approved milestone value, the builder normally becomes eligible for the approved amount after completion approval. If under budget or intentionally wanting less debt/interest, builder may request lower draw amount.

Validation:

```text
0 < requestedDrawAmount <= approvedMilestoneValueRemaining
```

If omitted, requested amount defaults to approved remaining milestone value.

### Handoffs

| Handoff | To vertical | Contract |
|---|---|---|
| Submitted claim | Verification | `CompletionClaim` and evidence package |
| Evidence descriptors | Workspace / MIC API | visibility-filtered descriptors |
| Requested draw amount | Draw Release | `approvedEligibleAmountCents` after verification |
| Events | Foundation/Webhooks | `completion_claim.submitted`, `evidence_asset.created` |

---

## III. Spec

### 1. Completion claim state

```ts
export type CompletionClaimStatus =
  | 'draft'
  | 'submitted'
  | 'under_verification'
  | 'more_info_requested'
  | 'pending_site_visit'
  | 'ready_for_completion_decision'
  | 'completion_approved'
  | 'completion_rejected'
  | 'withdrawn'
  | 'superseded';
```

### 2. Completion claim model

```ts
export interface CompletionClaim {
  id: CompletionClaimId;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;
  milestoneId: MilestoneId;

  status: CompletionClaimStatus;

  submittedByUserId: UserId;
  submittedAt?: ISODateTime;

  evidencePackageIds: Id<'EvidencePackage'>[];

  requestedDrawAmountCents: MoneyCents;
  approvedEligibleAmountCents?: MoneyCents;

  siteVisitRequirement:
    | 'not_required'
    | 'required_by_policy'
    | 'requested_by_verifier'
    | 'waived_by_verifier';

  siteVisitWaiverReason?: string;

  verifierUserId?: UserId;
  verifierDecisionAt?: ISODateTime;
  verifierDecisionReason?: string;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  aggregateVersion: number;
}
```

### 3. Evidence package and asset

```ts
export interface EvidencePackage {
  id: Id<'EvidencePackage'>;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;
  milestoneId?: MilestoneId;
  completionClaimId?: CompletionClaimId;
  siteVisitId?: SiteVisitId;

  purpose:
    | 'completion_verification'
    | 'cost_support'
    | 'site_visit'
    | 'admin_internal';

  assetIds: EvidenceAssetId[];
  submittedByUserId: UserId;
  submittedAt: ISODateTime;
}

export interface EvidenceAsset {
  id: EvidenceAssetId;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;

  milestoneId?: MilestoneId;
  completionClaimId?: CompletionClaimId;
  siteVisitId?: SiteVisitId;

  uploadedByUserId: UserId;
  uploadedAt: ISODateTime;

  source:
    | 'builder_upload'
    | 'builder_staff_upload'
    | 'site_visit_upload'
    | 'admin_upload'
    | 'chat_promoted_attachment';

  purpose:
    | 'completion_verification'
    | 'cost_support'
    | 'site_visit'
    | 'admin_internal';

  fileName: string;
  mimeType: string;
  sizeBytes: number;

  storageKey: string;
  sha256Hash: string;

  scanStatus: 'pending' | 'clean' | 'failed' | 'infected';

  visibility:
    | 'builder_and_lender'
    | 'lender_internal'
    | 'mic_portal_visible'
    | 'admin_only';

  metadataJson?: unknown;
}
```

### 4. Evidence requirement

```ts
export interface EvidenceRequirement {
  id: Id<'EvidenceRequirement'>;
  tenantOrgId: TenantOrgId;

  appliesTo:
    | { type: 'milestone_category'; category: string }
    | { type: 'specific_milestone'; milestoneId: MilestoneId }
    | { type: 'default' };

  requirementType:
    | 'photo'
    | 'video'
    | 'document'
    | 'permit_or_inspection_doc'
    | 'other';

  label: string;
  instructions?: string;
  required: boolean;
  minCount?: number;
}
```

### 5. Completion claim machine

```ts
import { createMachine } from 'xstate';

export const completionClaimMachine = createMachine({
  id: 'completionClaim',
  initial: 'draft',
  states: {
    draft: {
      on: {
        SUBMIT: { target: 'submitted', guard: 'requiredEvidencePresent' },
        WITHDRAW: 'withdrawn',
      },
    },
    submitted: {
      always: 'under_verification',
    },
    under_verification: {
      on: {
        REQUEST_MORE_INFO: 'more_info_requested',
        REQUEST_SITE_VISIT: 'pending_site_visit',
        MARK_READY_FOR_DECISION: {
          target: 'ready_for_completion_decision',
          guard: 'verificationPackageReviewable',
        },
        APPROVE_COMPLETION: {
          target: 'completion_approved',
          guard: 'canApproveCompletion',
        },
        REJECT_COMPLETION: 'completion_rejected',
      },
    },
    more_info_requested: {
      on: {
        SUBMIT_MORE_INFO: { target: 'under_verification', guard: 'additionalEvidencePresent' },
        WITHDRAW: 'withdrawn',
      },
    },
    pending_site_visit: {
      on: {
        SITE_VISIT_SUBMITTED: 'under_verification',
        WAIVE_SITE_VISIT: { target: 'under_verification', guard: 'waiverReasonPresent' },
        REJECT_COMPLETION: 'completion_rejected',
      },
    },
    ready_for_completion_decision: {
      on: {
        APPROVE_COMPLETION: {
          target: 'completion_approved',
          guard: 'canApproveCompletion',
        },
        REJECT_COMPLETION: 'completion_rejected',
        REQUEST_MORE_INFO: 'more_info_requested',
        REQUEST_SITE_VISIT: 'pending_site_visit',
      },
    },
    completion_approved: { type: 'final' },
    completion_rejected: { type: 'final' },
    withdrawn: { type: 'final' },
    superseded: { type: 'final' },
  },
});
```

### 6. Critical guards

```ts
export async function requiredEvidencePresent(claim: CompletionClaim): Promise<boolean> {
  const requirements = await loadEvidenceRequirementsForMilestone(claim.milestoneId);
  const assets = await loadEvidenceAssetsForClaim(claim.id);

  return requirements
    .filter(r => r.required)
    .every(r => countMatchingAssets(r, assets) >= (r.minCount ?? 1));
}

export async function canApproveCompletion(claim: CompletionClaim): Promise<boolean> {
  const hasEvidence = await requiredEvidencePresent(claim);
  const siteVisitSatisfied =
    claim.siteVisitRequirement === 'not_required' ||
    claim.siteVisitRequirement === 'waived_by_verifier' ||
    await submittedSiteVisitExistsForClaim(claim.id);

  return hasEvidence && siteVisitSatisfied;
}

export function validateRequestedDrawAmount(params: {
  requestedDrawAmountCents: MoneyCents;
  approvedRemainingValueCents: MoneyCents;
}): void {
  if (params.requestedDrawAmountCents <= 0) {
    throw new Error('Requested draw amount must be positive');
  }

  if (params.requestedDrawAmountCents > params.approvedRemainingValueCents) {
    throw new Error('Requested draw amount cannot exceed approved milestone value remaining');
  }
}
```

### 7. Upload flow

```text
1. Client requests upload slot.
2. Server validates tenant/build/milestone/claim access.
3. Server creates pending EvidenceAsset row.
4. Server returns signed upload URL/session.
5. Client uploads file.
6. Server records upload completion, hash, metadata, scan status.
7. Asset can satisfy requirement only when policy permits its scan/status/type.
```

### 8. API endpoints

```http
POST /api/v1/builds/:buildId/milestones/:milestoneId/completion-claims
POST /api/v1/completion-claims/:claimId/evidence-assets/upload-slot
POST /api/v1/completion-claims/:claimId/submit
POST /api/v1/completion-claims/:claimId/submit-more-info
GET  /api/v1/completion-claims/:claimId
GET  /api/v1/evidence-assets/:assetId/access-url
```

### 9. Events

```text
evidence_asset.created
evidence_asset.scan_completed
completion_claim.created
completion_claim.submitted
completion_claim.more_info_submitted
workspace_projection.updated
```

### 10. Tests

| Test | Expected |
|---|---|
| Submit without required proof | Guard rejection. |
| Requested amount over approved value | Validation failure. |
| Requested amount omitted | Defaults to approved remaining value. |
| Cross-tenant evidence access | Forbidden. |
| Infected scan status | Asset cannot satisfy requirement. |
| Rejected claim resubmission | New claim or controlled more-info flow only. |
| Chat attachment as proof | Only if promoted to EvidenceAsset. |
