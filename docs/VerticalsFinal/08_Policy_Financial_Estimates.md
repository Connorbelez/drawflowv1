# Vertical 08 — Policy and Financial Estimates

## I. Actual agile epic / Linear project

### Objective

Build the minimal policy and financial-estimate vertical needed by DrawFlow MVP: reimbursement policy, evidence policy, site visit policy, draw fee policy, interest estimate policy, and draw release policy.

### Technology alignment

Policy definitions live in Convex collections.  Versioned policies are persisted via the Convex schema builder and exposed through `fluent-convex` query functions.  Policy snapshots are taken at the point of planning or decision and attached to records to ensure future explainability.  A minimal internal admin UI for policy management is built using React 19 and shadcn/Base UI components.  No client‑side state mutation may directly change policy values—administrative updates must go through governed transition commands implemented as Convex actions.  Policy calculations (fees, interest) operate on integer cents and basis points and must never use floating‑point arithmetic.

The policy system must be versioned and snapshot-driven. Rich self-serve policy administration can be deferred or support-managed.

### In scope

- Policy version tables/types.
- Active policy resolution by tenant/build/date.
- Reimbursement basis fixed to approved milestone value for MVP.
- Evidence requirements policy.
- Discretionary site visit policy hooks.
- Draw fee policy.
- Compound interest estimate policy.
- Draw release policy.
- Policy snapshots attached to planning/approval decisions.

### Out of scope

- Rich self-serve policy builder.
- Dynamic workflow editor.
- Compliance-grade financial calculations.
- Actual ledger/servicing accrual.
- Capitalized fees.
- Cost-evidence reimbursement policy as default.

### Definition of done

1. Active policy versions can be resolved for tenant/build.
2. Planning engine consumes policy snapshots, not mutable live policy rows.
3. Claims/evidence consume evidence policy.
4. Site visit policy supports discretionary default and future required triggers.
5. Interest estimate supports compounding.
6. Fees are estimated separately and not capitalized.
7. Historical decisions retain policy version references/snapshots.
8. Tests prove policy changes do not mutate historical planning/approval results.

---

## II. PRD for this vertical

### Context

DrawFlow needs enough configurability to support lender operations without building a giant policy editor in MVP. The key architectural requirement is policy versioning. Planning assumptions and approval decisions must remain explainable after policy changes.

### Requirements

#### Reimbursement policy

MVP default:

```text
basis = approved_milestone_value
overrunTreatment = not_reimbursable
allowBuilderRequestedLowerDraw = true
costEvidenceRequired = false
```

#### Evidence policy

Defines required proof for completion claims. It should be structured but simple.

#### Site visit policy

Default is evidence-first discretionary. Policy can later require visits for first draw, final draw, high-value milestones, or high-risk categories.

#### Draw fee policy

Draw fees are configurable and estimated separately.  Fees are not capitalized and are therefore excluded from the compound‑interest principal.  The policy must specify how fees are operationally charged if they are not capitalized: they may be **withheld from the draw amount**, **payable externally**, **billed separately**, or **paid out of pocket**.  The funding source must be captured so that the planning engine and the UI can present accurate cost breakdowns to the builder.  Builder‑facing screens always show draw fees alongside principal and interest estimates to provide full visibility into the running and total cost.

#### Interest estimate policy

Interest shown in DrawFlow is a planning estimate only and must be configurable.  Stakeholders must confirm the **day‑count basis**, **compounding frequency**, **accrual convention**, and **pay‑off date**.  MVP defaults use **Actual/365** day‑count basis, **daily compounding**, a **configured takeout/payoff date** (with the **expected completion date** used as a fallback), and interest that **accrues from the day after each draw release**.  The policy should allow the compounding frequency to be either **daily** or **monthly** on a per‑tenant basis.  The UI must expose these estimates and clearly separate them from fees and principal.

### Handoffs

| Handoff | Consumer | Contract |
|---|---|---|
| Reimbursement policy | Claims / Verification / Draw Release / Planning | `ReimbursementPolicyVersion` |
| Evidence policy | Claims / Verification | `EvidencePolicyVersion` |
| Site visit policy | Verification | `SiteVisitPolicyVersion` |
| Draw fee policy | Planning | `DrawFeePolicyVersion` |
| Interest policy | Planning | `InterestEstimatePolicyVersion` |
| Draw release policy | Draw Release | `DrawReleasePolicyVersion` |

---

## III. Spec

### 1. Reimbursement policy

```ts
export interface ReimbursementPolicyVersion extends PolicyVersionBase {
  policyType: 'reimbursement';

  basis: 'approved_milestone_value';

  allowBuilderRequestedLowerDraw: true;

  overrunTreatment: 'not_reimbursable';

  costEvidenceRequiredForCompletion: false;
  costEvidenceRequiredForRelease: false;

  allowAdminLowerReleaseAmount: true;
}
```

### 2. Evidence policy

```ts
export interface EvidencePolicyVersion extends PolicyVersionBase {
  policyType: 'evidence';

  defaultRequirements: EvidenceRequirement[];
  requirementsByMilestoneCategory: Record<string, EvidenceRequirement[]>;

  allowedMimeTypes: string[];
  maxFileSizeBytes: number;
  maxAssetsPerClaim?: number;

  requireMalwareScanClean: boolean;
}
```

### 3. Site visit policy

```ts
export interface SiteVisitPolicyVersion extends PolicyVersionBase {
  policyType: 'site_visit';

  defaultMode: 'discretionary';

  requiredForFirstDraw: boolean;
  requiredForFinalDraw: boolean;
  requiredForMilestoneCategories: string[];
  requiredForApprovedValueAboveCents?: MoneyCents;

  verifierCanRequest: boolean;
  adminCanRequest: boolean;
  verifierCanWaiveWithReason: boolean;
  adminCanWaiveWithReason: boolean;
}
```

Recommended initial values:

```json
{
  "defaultMode": "discretionary",
  "requiredForFirstDraw": false,
  "requiredForFinalDraw": false,
  "requiredForMilestoneCategories": [],
  "verifierCanRequest": true,
  "adminCanRequest": true,
  "verifierCanWaiveWithReason": true,
  "adminCanWaiveWithReason": true
}
```

### 4. Draw fee policy

```ts
export interface DrawFeePolicyVersion extends PolicyVersionBase {
  policyType: 'draw_fee';

  feeType: 'none' | 'fixed' | 'percent_of_draw' | 'fixed_plus_percent';
  fixedFeeCents?: MoneyCents;
  percentBps?: BasisPoints;

  capitalization: 'not_capitalized';

  // Operational fee source is a stakeholder decision; not required for interest math.

  /**
   * Funding source specifies how draw fees are operationally charged if they are not capitalized.  'withheld_from_draw'
   * means the fee is deducted directly from the draw amount; 'payable_externally' means the builder must pay the fee
   * outside of DrawFlow; 'billed_externally' means an invoice will be sent; 'paid_out_of_pocket' means the fee is
   * absorbed by the lender or another party; 'waived' means the fee is waived.  The policy must specify one of
   * these values so that cost breakdowns are accurate.
   */
  fundingSource:
    | 'withheld_from_draw'
    | 'payable_externally'
    | 'billed_externally'
    | 'paid_out_of_pocket'
    | 'waived';

  showInBuilderPlanning: boolean;
}
```

### 5. Interest estimate policy

```ts
export interface InterestEstimatePolicyVersion extends PolicyVersionBase {
  policyType: 'interest_estimate';

  calculationMode: 'compound_interest_estimate';

  annualRateBps: BasisPoints;

  dayCountBasis: 'actual_365' | 'actual_360';
  compoundingFrequency: 'daily' | 'monthly';

  interestHorizon: 'configured_takeout_date' | 'expected_completion_date';
  configuredTakeoutDate?: ISODate;

  drawAccrualConvention: 'accrues_from_release_date' | 'accrues_day_after_release';

  disclaimer: string;
}
```

Recommended default pending stakeholder confirmation:

```json
{
  "calculationMode": "compound_interest_estimate",
  "dayCountBasis": "actual_365",
  "compoundingFrequency": "daily",
  "interestHorizon": "configured_takeout_date",
  "drawAccrualConvention": "accrues_day_after_release",
  "disclaimer": "Interest shown is a planning estimate only and is not ledger or servicing truth."
}
```

### 6. Draw release policy

```ts
export interface DrawReleasePolicyVersion extends PolicyVersionBase {
  policyType: 'draw_release';

  requireSeparateReleaseApproval: true;
  requireManualReleaseRecording: true;

  adminCanApproveLowerThanEligible: true;
  allowReleaseAboveEligible: false;

  requireExternalReferenceOnManualRecord: boolean;
  requireReasonForCorrection: true;
}
```

### 7. Policy snapshot set

```ts
export interface PolicySnapshotSet {
  reimbursementPolicy: ReimbursementPolicyVersion;
  evidencePolicy: EvidencePolicyVersion;
  siteVisitPolicy: SiteVisitPolicyVersion;
  drawFeePolicy: DrawFeePolicyVersion;
  interestEstimatePolicy: InterestEstimatePolicyVersion;
  drawReleasePolicy: DrawReleasePolicyVersion;
  capturedAt: ISODateTime;
}
```

### 8. Resolver interface

```ts
export interface PolicyResolver {
  getActivePolicySet(params: {
    tenantOrgId: TenantOrgId;
    buildId?: BuildId;
    asOf: ISODateTime;
  }): Promise<PolicySnapshotSet>;
}
```

### 9. UI/admin scope

Recommended MVP:

```text
- Seed default policies per tenant.
- Internal support/admin can update policy rows.
- Rich self-serve policy editor deferred.
```

Minimal UI, if required:

- annual interest rate,
- takeout date,
- draw fee fixed/percent,
- evidence requirement defaults,
- site visit discretionary settings.

### 10. Tests

| Test | Expected |
|---|---|
| Policy changes after plan approval | Historical plan still references old snapshot. |
| Fee estimate | Fee does not affect compound-interest principal. |
| Builder lower draw request | Allowed. |
| Overrun request | Not reimbursable. |
| Cost evidence missing | Does not block v1 completion if completion evidence exists. |
| Site visit discretionary default | No site visit required unless requested/policy-triggered. |

## IV. Screen and Component Manifest
The Policy and Financial Estimates vertical is primarily a backend module that defines and resolves versioned policies.  **Administrative screens for managing policies are registered through the Foundation’s route module contract and live under `/app/:orgSlug/admin/*` or `/admin/*` depending on tenancy.**  End‑users (builders and lenders) do not directly edit policies in MVP.  A minimal internal administration interface may be provided for support staff to view active policy versions and make controlled updates through governed transitions.  The table below outlines this administration UI and how it relates to the vertical’s requirements.

| Screen / Route | Components | Purpose & context | Mapped requirements/use‑cases |
|---|---|---|---|
| **`PolicyAdminListScreen`** (`/admin/policies`) | `PolicyTypeSelector`, `ActivePolicyDisplay`, `PolicyVersionList`, `CreatePolicyVersionButton` | Displays all policy types (reimbursement, evidence, site visit, draw fee, interest estimate, draw release) for the tenant.  Shows the currently active version and lists historical versions.  The `CreatePolicyVersionButton` navigates to the edit screen to create a new version.  Only support/admin users with `policy.manage` permission can access this screen. | PRD: Requirement that policies are versioned and support resolution by tenant/build/date; ability to seed default policies; UI/admin scope (Section II, “UI/admin scope”). |
| **`PolicyVersionEditScreen`** (`/admin/policies/:policyType/edit`) | `PolicyFieldForm`, `EffectiveDatePicker`, `PolicyPreviewPanel`, `SavePolicyVersionButton` | Provides a form for editing the fields of a new policy version.  The `PolicyFieldForm` adapts to the selected policy type: for example, reimbursement policy fields include `basis`, `overrunTreatment`, etc.; evidence policy fields include `defaultRequirements`, allowed MIME types, file size limits; interest policy fields include annual rate basis points, compounding frequency, day‑count basis, etc.  The `EffectiveDatePicker` sets when the new version becomes active; `PolicyPreviewPanel` shows a JSON preview of the resulting version; `SavePolicyVersionButton` invokes a governed command to persist the version.  No existing version is mutated; versions are immutable records. | PRD: Policy changes must not mutate historical decisions (Definition of done 7–8); requirements specifying the fields for each policy type (Section III spec items 1–6); policy version tables/types in scope. |
| **`PolicySnapshotDisplay`** (embedded in other verticals) | `PolicySnapshotBadge`, `PolicyTooltip`, `SnapshotJSONModal` | A small component used in screens like `ProposalBuilderScreen`, `DrawPlanComparison`, and `VerificationClaimReviewScreen` to indicate which policy snapshot set was used when a decision or plan was generated.  Clicking the badge opens a modal showing the snapshot’s JSON.  This ensures that decisions remain explainable after policy changes. | PRD: Context requirement that policy snapshots are attached to planning/approval decisions; ability to resolve active policy set by tenant/build/date; test requirement that policy changes do not mutate historical results. |

**Component notes:**

- **`PolicyTypeSelector`** enumerates the policy types supported (`reimbursement`, `evidence`, `site_visit`, `draw_fee`, `interest_estimate`, `draw_release`).  Selecting a type filters the list and determines which fields appear in the edit form.
- **`PolicyFieldForm`** is dynamic; it renders form inputs appropriate for the selected policy type.  Validation enforces integer cents/bps for monetary fields, non‑empty arrays for evidence requirements, and boolean flags for discretionary settings.  It prevents invalid combinations (e.g., percent basis without specifying basis points).
- **`EffectiveDatePicker`** allows support staff to schedule future policy changes.  Version resolution logic in Convex uses the `capturedAt` timestamp to determine which version applies at plan/decision time.
- **`PolicySnapshotDisplay`** provides cross‑vertical visibility into the policy snapshot set used.  It helps end‑users understand why a draw plan or decision looks the way it does and underpins traceability when policy values change.

No builder or lender‑facing surfaces exist for editing policies in MVP.  All changes must pass through governed Convex actions invoked by the admin UI.  Consumers of policies (Proposal, Planning Engine, Claims, Verification, Draw Release) read snapshot sets via the `PolicyResolver` interface defined in Section III (item 8), ensuring that runtime decisions remain decoupled from live policy mutations.
