# Vertical 08 — Policy and Financial Estimates

## I. Actual agile epic / Linear project

### Objective

Build the minimal policy and financial-estimate vertical needed by DrawFlow MVP: reimbursement policy, evidence policy, site visit policy, draw fee policy, interest estimate policy, and draw release policy.

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

Fees are configurable and estimated separately. Fees are not capitalized and not included in compound interest principal.

#### Interest estimate policy

Interest is planning estimate only and compounds. Stakeholders still need to confirm day-count basis, frequency, and accrual convention.

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
  fundingSource:
    | 'stakeholder_decision_pending'
    | 'deducted_externally'
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
  "drawAccrualConvention": "accrues_from_release_date",
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
