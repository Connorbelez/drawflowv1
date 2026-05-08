# Vertical 06 — Verification and Site Visits

## I. Actual agile epic / Linear project

### Objective

Build the evidence-first verification vertical. Authorized verifiers review completion claims, inspect uploaded proof, request more information, order discretionary site visits, review site-visit evidence, and approve or reject milestone completion.

### Technology alignment

Verification flows are implemented as authenticated pages built with React 19/TypeScript and TanStack Router/Query.  Evidence review panels reuse shadcn/Base UI components and display metadata captured in the Completion Claims vertical, including geofence results and captured coordinates.  Site visit workflows run in a PWA‑style interface optimised for mobile and tablet, with offline capability implemented via client‑side storage (e.g., IndexedDB) and Convex offline mutations.  Authentication and grants use WorkOS AuthKit on both the server and client.  All verification decisions and site visit submissions are dispatched through `fluent-convex` actions and obey the governed transition service defined in the Foundation vertical.

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

Additional responsibilities:

- **Offline site visits:** Site visit inspectors must be able to load assigned visits, capture photos/videos/notes, and draft their report offline when connectivity is unavailable.  Evidence and report data are stored locally in the PWA and synchronised automatically through Convex when connectivity resumes.  Offline support is limited to the site visit workflow and does not extend to the full Build Workspace.

### Out of scope

- Advanced complex scheduling or calendar management beyond assignment/due date display.
- Route optimisation or automatic inspector assignment.
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

7. Site visit inspectors can load assigned visits and create draft reports and evidence offline.  When connectivity is restored, the PWA syncs the draft through Convex, and the state machine transitions accordingly.
8. Tests cover evidence review, more‑info and site‑visit requests, offline site visit draft/save/sync, verifier/admin approval/rejection, auditable waiver reasons, and permission checks.
7. Approval sets `approvedEligibleAmountCents` not exceeding approved milestone value remaining or builder-requested amount.
8. Completion approval emits audit/domain events and updates workspace projection.
9. Site visit flow has tests for request, assignment, submission, waiver, and forbidden access.

---

## II. PRD for this vertical

### Context

Verification is a human discretionary decision and access to verification actions is governed by explicit permissions rather than hard‑coded roles.  Actors granted the `completion_claim.verify` permission (for example lender admins by default) may review completion claims, make recommendations, and issue final decisions.  Future role configurations can separate recommendation authority from final approval by granting a `completion_claim.verify_recommend` permission only.

The system does not prove construction quality; it preserves evidence and the human decision.

Site visits are **evidence‑first and discretionary** in the MVP.  No milestone categories require visits by default.  If uploaded proof is sufficient, a verifier can approve completion without a visit.  If the proof is weak, incomplete, suspicious, or triggers a policy hook, the verifier or admin can order a site visit as part of the approval flow.  Site visit reports are hidden from MIC observers by default; inspectors must explicitly mark report items as portal‑visible before they appear in the MIC portal.

### Requirements

#### Verification decisions

Authorized users (those with the `completion_claim.verify` permission) can:

- request more information,
- request a site visit,
- approve completion,
- reject completion,
- waive a site visit with a reason if applicable.

These actions are enforced by permission checks; there is no blanket “role always allowed” except that lender admins are initially granted the relevant permissions.  If the product later introduces a verifier role distinct from admin, it can be given recommendation‑only permissions while final approval remains with admins.

Approval requires that completion proof is present and any requested or policy‑required site visit has either been satisfied or explicitly waived with a reason.

#### Site visit policy

The MVP default is discretionary: there are no categories of milestones that automatically trigger a site visit.  Policy hooks still exist for future first/final/high‑risk/high‑value requirements.  Site visit orders can be generated during the approval flow for a milestone completion if evidence is insufficient or if a policy trigger fires.  Site visit reports are hidden from MIC observers unless individual report items are marked portal‑visible by the inspector.

#### Site visit flow

Minimal flow:

```text
requested → assigned → submitted
```

Cancellation is supported. No offline mode. No complex scheduling. Assignment, due date, notes, and report upload are enough.

#### Verifier authority

Verifier authority is permission‑based.  Any user with the `completion_claim.verify` permission may perform verification actions.  By default the lender admin role is granted this permission.  A lender verifier may be granted recommendation permissions only, and final approval remains with lender admin.  All access is configured through WorkOS resource grants and enforced by DrawFlow guard functions.

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

## IV. Screen and Component Manifest
This section describes the user interfaces and UI components used by the Verification and Site Visits vertical.  **Routes described here are registered through the Foundation’s route module contract.**  Build‑scoped screens (e.g. claim review) live under `/app/:orgSlug/builds/:buildId/claims/*` and use `BuildScopedLayout` to resolve context.  Site visit routes live under `/app/:orgSlug/site-visits/*` and enforce assignment/permission guards via `RequirePermission` and `RequireBuildGrant`.  The table below details the primary screens, their components, and how those elements map to the requirements and use cases defined in the PRD.  Many components are shared with the Completion Claims vertical and Build Workspace.

| Screen / Route | Components | Purpose & context | Mapped requirements/use‑cases |
|---|---|---|---|
| **`VerificationClaimReviewScreen`** (`/app/:orgSlug/builds/:buildId/claims/:completionClaimId/review` or drawer from queue/workspace) | `EvidenceReviewPanel`, `MilestoneSummary`, `DecisionHistory`, `SiteVisitStatusBadge`, `VerifierDecisionActions`, `ApprovalAmountInput`, `MoreInfoRequestModal`, `SiteVisitRequestModal`, `WaiveSiteVisitModal` | Provides verifiers and administrators a full view of a submitted completion claim.  The `EvidenceReviewPanel` displays uploaded proof with geofence status and metadata; `MilestoneSummary` and `DecisionHistory` summarize milestone info and prior decisions; `SiteVisitStatusBadge` shows current site visit status; `VerifierDecisionActions` renders controls to request more info, request a site visit, waive a site visit (with reason), approve completion (entering approved amount), or reject completion.  Modals capture reasons and due dates.  This screen enforces permission checks and invokes governed transitions via Convex actions. | PRD: Verification decisions (approve/reject/more info/site visit/waive) and site visit policy (Section II Requirements); use cases 1–6; definition‑of‑done items 1–8. |
| **`SiteVisitAssignmentScreen`** (`/app/:orgSlug/site-visits/:siteVisitId/assign`) | `SiteVisitSummary`, `AssigneeSelector`, `DueDatePicker`, `AssignmentNotesInput`, `AssignButton` | Used by verifiers or admins to assign a requested site visit to an inspector.  The screen displays the visit summary (milestone, claim, requested reason) and allows selection of an available inspector (`AssigneeSelector`), optional due date (`DueDatePicker`), optional instructions, and assignment.  On submission it triggers the `ASSIGN` event in the site visit state machine. | PRD: Site visit flow minimal state (requested → assigned); assignment; due date; notes; requirement that scheduling beyond this is out of scope. |
| **`SiteVisitReportScreen`** (`/app/:orgSlug/site-visits/:siteVisitId/report`, offline PWA) | `SiteVisitSummary`, `EvidenceUploadSection`, `ReportNotesEditor`, `DraftSyncStatus`, `SubmitReportButton` | This responsive, PWA‑capable screen is used by the assigned site visitor to capture and upload photos, videos, and notes during an on‑site inspection.  `EvidenceUploadSection` reuses the evidence pipeline from Completion Claims but labels assets with `site_visit` purpose; `ReportNotesEditor` (TipTap) captures observations; `DraftSyncStatus` indicates offline/online state and sync progress via Convex offline mutation support; `SubmitReportButton` triggers the `SUBMIT_REPORT` event.  Drafts are stored locally and synchronised when connectivity resumes. | PRD: Site visit submission, offline support for site visits, capturing evidence, notes, and due date; use case 4; definition‑of‑done items 5–9. |
| **`SiteVisitDetailScreen`** (`/app/:orgSlug/site-visits/:siteVisitId`) | `SiteVisitSummary`, `EvidencePackageList`, `ReportNotesViewer`, `StatusTimeline`, `CancellationForm`, `WaiverReasonDisplay` | Displays details of a site visit for verifiers/admins and builders (role‑filtered).  Shows the request reason, assignment, due date, uploaded evidence and notes, submission status, and waiver/cancellation reasons.  Allows cancellation of a visit (if still requested/assigned) via `CancellationForm`. | PRD: Site visit state machine statuses; ability to cancel; waiver reasons; evidence review; use cases 3–5. |
| **`VerificationDecisionLogScreen`** (embedded in Claim and Workspace history) | `DecisionHistoryList`, `DecisionEntry`, `ReasonCodeDisplay` | Read‑only history of all verification decisions for a completion claim, including reasons, notes, approved amounts, and related site visits.  Typically displayed as a panel within Claim History or Workspace; helps maintain auditability and explainability. | PRD: Evidence‑first verification preserves decisions and reasons; approval amount calculation; events such as `completion_claim.more_info_requested`, `site_visit.requested`, etc., must be auditable. |

**Component notes:**

- **`EvidenceReviewPanel`** is shared with the Completion Claims vertical and renders the `EvidencePackage` and `EvidenceAsset` thumbnails, metadata, geofence status, and file viewer.  It ensures MIC‑visible and internal‑only evidence is flagged appropriately.  For site visit reports the panel treats all uploaded evidence and report notes as hidden from MIC observers by default; inspectors must explicitly mark individual assets or report sections as portal‑visible before they can be exposed via the MIC API.
- **`VerifierDecisionActions`** enforces guard rules (`canApproveCompletion`, `canRequestSiteVisit`, etc.), collects required inputs (approved amount, reasons), and dispatches the appropriate transition commands via `fluent-convex`.  It disables actions when evidence is missing or a site visit is pending.
- **`EvidenceUploadSection`** used in site visits is adapted to record `site_visit` purpose and stores local drafts for offline operation.  It reuses virus scanning and file‑type validation rules from the evidence pipeline.
- **`DraftSyncStatus`** listens for connectivity changes and displays whether the local PWA has unsynchronised drafts; it surfaces errors if an offline mutation fails.
- **`SiteVisitSummary`** appears in multiple screens and displays key fields from the `SiteVisit` model (status, milestones, request reason, assigned inspector, due date) to provide context across the assignment and report flows.

All screens are protected by the Foundation’s permission system.  Claim review and site visit assignment require `completion_claim.verify` and `site_visit.request`/`site_visit.assign` permissions, respectively.  Site visit report submission requires `site_visit.submit` permission.  Waiver reasons are enforced by the corresponding guard.  These UI surfaces route to backend transition endpoints defined in the Spec section (`/api/v1/completion-claims/...` and `/api/v1/site-visits/...`).
