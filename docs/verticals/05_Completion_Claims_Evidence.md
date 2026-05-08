# Vertical 05 — Completion Claims and Evidence

## I. Actual agile epic / Linear project

### Objective

Build the vertical that lets builders and builder staff claim milestone completion by uploading structured proof. Completion proof is mandatory. Cost evidence is not required in v1. Builder may request a lower draw amount than the approved milestone value.

### Technology alignment

Completion claims are captured through a responsive web/PWA interface built with React 19 and TanStack Router/Query.  Evidence uploads use shadcn-style inputs and integrate directly with Convex via `fluent-convex` mutations.  Authentication and organisation scoping use WorkOS AuthKit.  All evidence metadata and claims are stored in Convex collections; file blobs live in a private object store accessible via signed URLs.  Zod schemas define client/server validation.

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

Additional responsibilities:

- **Geofence verification:** Evidence uploads must attempt to capture geolocation at the time of upload when permissions allow.  The result of the geofence check (verified, failed, unavailable, suspected spoof) is stored on each `EvidenceAsset` and surfaced in the verifier workflow.  Location‑unverified evidence is accepted but flagged.
- **Basic location metadata:** When available, captured latitude and longitude should be stored for manual review.  Coordinates are not exposed to builder users but help lenders validate upload location.
- **User warnings:** The UI should warn the builder if geolocation is not captured or verification fails, explaining that additional review may be required.  Evidence should never be silently discarded due to geofence failure.

### Out of scope

- Offline sync (offline site‑visit workflows are handled in the Verification vertical).
- Advanced anti‑spoofing or geolocation fraud detection.  This vertical records geofence results but does not enforce location‑based blocking.
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
8. Evidence uploads record geofence verification status and, where available, latitude and longitude.  Location‑unverified evidence is flagged for review but does not block submission.
9. Tests cover missing evidence, oversized file, forbidden access, lower‑draw validation, geofence verification scenarios (verified, failed, unavailable, spoof), and audit/event emission.

## IV. Screen and Component Manifest
The Completion Claims and Evidence vertical defines the user interfaces used by builders to submit completion claims and by verifiers to view submitted evidence packages.  **Screens defined here are registered via the Foundation’s route module contract and live under `/app/:orgSlug/builds/:buildId/claims/*`, using `BuildScopedLayout` to resolve build context.**  Permissions are enforced via `RequirePermission` and `RequireBuildGrant`.  Below are the primary screens and components along with their context and mapping to requirements.

| Screen / Route | Components | Purpose & context | Mapped requirements/use‑cases |
| --- | --- | --- | --- |
| **`CompletionClaimFormScreen`** (`/app/:orgSlug/builds/:buildId/claims/new` or drawer in workspace) | `ClaimMilestoneSelector`, `EvidenceChecklist`, `EvidenceUploadSection`, `GeofenceStatusIndicator`, `LowerDrawAmountInput`, `AdditionalNotesInput`, `SubmitClaimButton` | Provides builders and authorised builder staff a form to create a new completion claim for a milestone.  Users select the milestone, review the required evidence checklist, capture/upload evidence files (photos, videos, PDFs) using direct camera capture if supported, see geofence verification status, request a lower draw amount, add optional notes, and submit the claim.  The form enforces that required evidence is uploaded and that the requested amount does not exceed the approved remaining value. | PRD: Completion claim requirements (Section 13.6), Evidence requirements (Section 13.7), Geofence proof-of-completion (Section 8.8); user flow 11.3 steps 5–9.
| **`ClaimHistoryScreen`** (`/app/:orgSlug/builds/:buildId/claims/:completionClaimId`) | `ClaimStatusBanner`, `EvidencePackageList`, `ClaimDetails`, `LowerDrawSummary`, `GeofenceResultDisplay`, `ClaimTimeline`, `WithdrawClaimButton` | Displays details of an existing completion claim, including the submitted evidence packages, geofence verification results for each asset, requested lower draw amount, site visit status, and verification/approval status.  Builders can withdraw draft claims; verifiers can see the same information in read‑only mode and prepare for review. | PRD: Evidence upload and storage (Section 13.7), Geofence status display (Section 8.8), Claim history (In scope), user flows for claim submission and verification.
| **`EvidenceMoreInfoUploadScreen`** (`/app/:orgSlug/builds/:buildId/claims/:completionClaimId/more-info`) | `MoreInfoRequestDetails`, `EvidenceChecklist`, `EvidenceUploadSection`, `SubmitAdditionalEvidenceButton` | Used when a verifier has requested more information.  Allows builder to view the specific items requested, upload additional evidence, and resubmit. | PRD: Evidence review flow step 4 (“request more information”) and response path.

**Component notes:**

* `EvidenceChecklist` renders the required evidence items derived from the `EvidencePolicyVersion`.  It visually indicates which items have been satisfied.
* `EvidenceUploadSection` handles file selection, direct camera capture, geolocation capture, upload progress, virus scan status, and error handling.  It writes `EvidenceAsset` entries with geofence metadata via Convex mutations.
* `GeofenceStatusIndicator` displays whether each uploaded asset was geofence‑verified, failed, unavailable, or suspected spoof, and surfaces warnings accordingly.
* `LowerDrawAmountInput` enforces validation rules (`0 < requestedDrawAmount <= approvedMilestoneValueRemaining`) and shows the approved milestone value for context.

All routes are protected by the Foundation’s permission boundaries.  Completion claim creation requires `completion_claim.create`; submission requires `completion_claim.submit`; and withdrawal or evidence resubmission obey corresponding permissions.  Verifier screens in the Verification vertical consume the submitted evidence via the `EvidencePackage` and `EvidenceAsset` models.

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

  /**
   * Result of the geofence verification attempt when the asset was uploaded.
   *
   * - `verified` — device location matched the build site within configured radius.
   * - `failed` — a geofence check was attempted but location was outside the allowed radius.
   * - `unavailable` — no geolocation data was provided or permission was denied.
   * - `suspected_spoof` — evidence suggests location spoofing or other anomaly.
   */
  geofenceVerification: 'verified' | 'failed' | 'unavailable' | 'suspected_spoof';

  /** Optional captured latitude when geolocation was provided. */
  capturedLatitude?: number;
  /** Optional captured longitude when geolocation was provided. */
  capturedLongitude?: number;

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
