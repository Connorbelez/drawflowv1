# Vertical 03 — Draw Planning Engine

## I. Actual agile epic / Linear project

### Objective

Build a deterministic Draw Planning Engine that produces explainable recommended starting draw plans from milestone approved values, dependencies, schedule assumptions, working-capital constraints, draw fee policy, and compound interest estimate policy.

The engine should be professional and testable. It should not claim perfect real‑world optimization. Builders have unique circumstances DrawFlow will not fully know.

### Technology alignment

The planning engine is implemented as a pure TypeScript module executed under the Bun runtime.  It is invoked via Convex actions using the `fluent-convex` API.  Input validation uses Zod schemas imported via `fluent-convex/zod` and the Domain scalar types defined in the Foundation vertical.  Do not import Node‑only modules, make network calls, or use browser APIs inside the engine.  All calculations must operate on integer cents/basis points (`MoneyCents`, `BasisPoints`) to avoid floating‑point drift.

### In scope

- Planning input DTO and validation.
- Deterministic plan alternatives.
- Working-capital constraints.
- Peak unreimbursed exposure calculation.
- Draw fee estimates as separate non-capitalized costs.
- Compound interest estimate calculation.
- Configurable takeout/payoff date or fallback horizon.
- Plan modes:
  - lowest estimated financing cost,
  - fastest reimbursement,
  - lowest peak unreimbursed exposure,
  - balanced recommended.
- Feasibility warnings.
- Explanation steps.
- Golden test fixtures.

Additional responsibilities:

- Consume versioned policy snapshots for reimbursement, draw fee, interest estimate, and draw policy.  The engine must never read live mutable policy rows; snapshots are provided by the Policy vertical via the caller.
- Produce an array of recommended plan alternatives corresponding to the **Cheapest Feasible**, **Fastest**, **Capital‑Constrained**, and **Balanced** plan modes described in the PRD.  Each alternative includes: draw groupings; planned and expected eligibility/release dates; fee and interest estimates; total estimated financing cost; peak unreimbursed exposure; feasibility flags; warnings; and a step‑by‑step explanation that can be displayed to users.
- Detect infeasible scenarios (for example, where working‑capital constraints or lender policy limits make any plan impossible) and return an explicit reason rather than silently failing or producing an empty result.
- Model borrower working‑capital exposure as unreimbursed approved milestone value and ensure that draw groupings never require more capital than the borrower has available at any point in the schedule.

### Out of scope

- Full stochastic/global optimizer.
- Weather/calendar/resource constraints.
- Vendor payment terms.
- Builder-specific cost of capital.
- Cost evidence validation.
- Budget overrun financing.
- Actual ledger/servicing accrual.
- Capitalized fees.
- Public write optimizer API.

### Definition of done

1. Engine accepts `DrawPlanningInput` and returns `DrawPlanningResult`.
2. Same input always produces same output.
3. At least 12 golden fixtures prove expected groupings, warnings, fee estimates, compound interest estimates, and exposure calculations.
4. Engine can return infeasible results with explicit reasons.
5. Fees are never included in compounding principal.
6. Working-capital constraint is modeled from day one.
7. Output is explainable enough for UI/admin review.

---

## II. PRD for this vertical

### Context

The original “optimizer” should be reframed as a deterministic **Draw Planning Engine**. The output is an editable recommended starting point based on available data and assumptions.

Product language should say:

```text
Recommended starting plan
Estimated financing cost
Peak unreimbursed exposure
Feasible with warnings
```

Avoid:

```text
Perfectly optimized
Guaranteed cheapest
Actual interest due
Ledger balance
```

### Requirements

#### Working capital

The engine must model maximum unreimbursed exposure:

```text
unreimbursed exposure = approved value of completed/reimbursable work not yet released
```

Because MVP reimbursement is based on approved milestone value, exposure uses approved milestone value unless later policy changes.

#### Fees

Fees are configurable and estimated separately. Fees are not capitalized and do not compound.

#### Interest

Interest is planning estimate only and compounds. Compounding frequency, day-count basis, accrual convention, and horizon are policy-defined.

#### Outputs

Every plan alternative must include:

- draw groups,
- estimated eligibility and release dates,
- total estimated draw fees,
- estimated compound interest,
- total estimated financing cost,
- peak unreimbursed exposure,
- feasibility status,
- warnings,
- assumptions,
- explanation steps.

### Use cases

1. Builder wants lowest estimated financing cost under a working-capital limit.
2. Builder wants fastest reimbursement to reduce cash pressure.
3. Lender wants to see policy violations and feasibility warnings.
4. Admin wants an explanation for why milestones were grouped.
5. Engine returns infeasible because working capital is too low.
6. Fee-heavy case merges draws; exposure-heavy case splits draws.

### Handoffs

| Handoff | Consumer | Contract |
|---|---|---|
| Planning input | Engine | `DrawPlanningInput` |
| Alternatives | Proposal / Workspace | `DrawPlanningResult` |
| Assumptions | Audit / Approved draw plan | `PlanningAssumptionSnapshot` |
| Policies | Policy vertical | `DrawFeePolicySnapshot`, `InterestEstimatePolicySnapshot`, `ReimbursementPolicySnapshot` |

---

## III. Spec

### 1. Input contract

```ts
export interface DrawPlanningInput {
  tenantOrgId: TenantOrgId;
  proposalId?: Id<'BuildProposal'>;
  buildId?: BuildId;

  horizon: PlanningHorizon;

  milestones: PlanningMilestoneInput[];
  dependencies: PlanningDependencyInput[];

  workingCapital: BuilderCapitalAssumption;

  reimbursementPolicy: ReimbursementPolicySnapshot;
  drawFeePolicy: DrawFeePolicySnapshot;
  interestPolicy: InterestEstimatePolicySnapshot;
  drawPolicy: DrawPolicySnapshot;

  requestedModes: DrawPlanMode[];
}

export interface PlanningHorizon {
  expectedCompletionDate: ISODate;
  configuredTakeoutDate?: ISODate;
}

export interface PlanningMilestoneInput {
  id: string;
  name: string;
  category?: string;
  plannedStartDate: ISODate;
  plannedEndDate: ISODate;
  approvedValueCents: MoneyCents;
}

export interface PlanningDependencyInput {
  predecessorMilestoneId: string;
  successorMilestoneId: string;
  dependencyType: 'finish_to_start';
}

export type DrawPlanMode =
  | 'lowest_estimated_financing_cost'
  | 'fastest_reimbursement'
  | 'lowest_peak_unreimbursed_exposure'
  | 'balanced_recommended';
```

### 2. Policy snapshots consumed

```ts
export interface ReimbursementPolicySnapshot {
  basis: 'approved_milestone_value';
  allowBuilderRequestedLowerDraw: true;
  overrunTreatment: 'not_reimbursable';
}

export interface DrawFeePolicySnapshot {
  feeType: 'none' | 'fixed' | 'percent_of_draw' | 'fixed_plus_percent';
  fixedFeeCents?: MoneyCents;
  percentBps?: BasisPoints;
  feeCapitalization: 'not_capitalized';
}

export interface InterestEstimatePolicySnapshot {
  calculationMode: 'compound_interest_estimate';
  annualRateBps: BasisPoints;
  dayCountBasis: 'actual_365' | 'actual_360';
  compoundingFrequency: 'daily' | 'monthly';
  interestHorizon: 'configured_takeout_date' | 'expected_completion_date';
  drawAccrualConvention: 'accrues_from_release_date' | 'accrues_day_after_release';
}

export interface DrawPolicySnapshot {
  minDrawAmountCents?: MoneyCents;
  maxDrawCount?: number;
  reviewLagBusinessDays: number;
  releaseLagBusinessDays: number;
  allowPartialDrawGroups: boolean;
}
```

### 3. Output contract

```ts
export interface DrawPlanningResult {
  inputHash: string;
  generatedAt: ISODateTime;
  alternatives: DrawPlanAlternative[];
  globalWarnings: PlanningWarning[];
}

export interface DrawPlanAlternative {
  id: Id<'DrawPlanAlternative'>;
  mode: DrawPlanMode;

  feasibility: 'feasible' | 'feasible_with_warnings' | 'infeasible';

  drawGroups: DrawGroupDraft[];

  estimatedTotalDrawFeesCents: MoneyCents;
  estimatedInterestCents: MoneyCents;
  estimatedTotalFinancingCostCents: MoneyCents;
  peakUnreimbursedExposureCents: MoneyCents;

  estimatedCompletionDate: ISODate;
  interestHorizonDate: ISODate;

  warnings: PlanningWarning[];
  assumptions: PlanningAssumptionSnapshot;
  explanation: PlanExplanationStep[];
}

export interface DrawGroupDraft {
  id: Id<'DrawGroupDraft'>;
  sequence: number;
  milestoneIds: string[];
  plannedEligibilityDate: ISODate;
  plannedReleaseDate: ISODate;
  totalApprovedValueCents: MoneyCents;
  estimatedFeeCents: MoneyCents;
}

export interface PlanningWarning {
  code:
    | 'WORKING_CAPITAL_EXCEEDED'
    | 'MIN_DRAW_AMOUNT_NOT_MET'
    | 'NO_FEASIBLE_PLAN'
    | 'DEPENDENCY_INVALID'
    | 'POLICY_CONSTRAINT_BINDING'
    | 'INTEREST_HORIZON_MISSING'
    | 'DRAW_COUNT_EXCEEDS_POLICY';
  severity: 'info' | 'warning' | 'blocking';
  message: string;
  relatedMilestoneIds?: string[];
  relatedDrawGroupIds?: string[];
}

export interface PlanExplanationStep {
  sequence: number;
  type:
    | 'grouped_due_to_dependency'
    | 'split_to_reduce_exposure'
    | 'merged_to_reduce_fees'
    | 'release_date_estimated'
    | 'warning_generated';
  message: string;
  data?: unknown;
}
```

### 4. Compound interest estimate

Fees are not capitalized and do not compound.

```ts
export function estimateCompoundInterest(params: {
  drawEvents: Array<{ releaseDate: ISODate; amountCents: MoneyCents }>;
  annualRateBps: BasisPoints;
  dayCountBasis: 'actual_365' | 'actual_360';
  compoundingFrequency: 'daily' | 'monthly';
  horizonDate: ISODate;
}): MoneyCents {
  const annualRate = params.annualRateBps / 10_000;
  const sorted = [...params.drawEvents].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));

  let balanceCents = 0;
  let previousDate = sorted[0]?.releaseDate ?? params.horizonDate;

  for (const event of sorted) {
    balanceCents = compoundBetween({
      principalCents: balanceCents,
      from: previousDate,
      to: event.releaseDate,
      annualRate,
      dayCountBasis: params.dayCountBasis,
      compoundingFrequency: params.compoundingFrequency,
    });

    balanceCents += event.amountCents;
    previousDate = event.releaseDate;
  }

  const finalBalanceCents = compoundBetween({
    principalCents: balanceCents,
    from: previousDate,
    to: params.horizonDate,
    annualRate,
    dayCountBasis: params.dayCountBasis,
    compoundingFrequency: params.compoundingFrequency,
  });

  const releasedPrincipal = sorted.reduce((sum, e) => sum + e.amountCents, 0);
  return Math.max(0, Math.round(finalBalanceCents - releasedPrincipal));
}
```

### 5. Fee estimate

```ts
export function estimateDrawFee(
  amountCents: MoneyCents,
  policy: DrawFeePolicySnapshot,
): MoneyCents {
  switch (policy.feeType) {
    case 'none':
      return 0;
    case 'fixed':
      return policy.fixedFeeCents ?? 0;
    case 'percent_of_draw':
      return Math.round(amountCents * ((policy.percentBps ?? 0) / 10_000));
    case 'fixed_plus_percent':
      return (policy.fixedFeeCents ?? 0) +
        Math.round(amountCents * ((policy.percentBps ?? 0) / 10_000));
  }
}
```

### 6. Plan mode semantics

#### Lowest estimated financing cost

```text
Minimize estimated draw fees + estimated compound interest
subject to:
- milestone dependency constraints,
- working-capital limit,
- lender draw policy,
- release/review lag assumptions,
- horizon date.
```

#### Fastest reimbursement

```text
Minimize time from milestone planned completion/eligibility to planned release.
```

#### Lowest peak unreimbursed exposure

```text
Minimize max approved value completed but not yet released.
```

#### Balanced recommended

```text
Choose an explainable feasible plan that avoids obvious extremes in fees, interest, and exposure.
```

### 7. Determinism rules

- Sort milestones by planned end date, then planned start date, then stable ID.
- Normalize input before hashing.
- Store input hash and assumption snapshot with outputs.
- Never rely on database insertion order.
- Ties must use stable deterministic tie-breaks.

### 8. Golden fixture suite

| Fixture | Purpose |
|---|---|
| Single milestone, one draw | Baseline correctness. |
| Two independent milestones, high fixed fee | Lowest-cost should merge if capital allows. |
| Dependency chain | Successor cannot release before predecessor. |
| Low working capital | Split or infeasible. |
| Impossible working capital | Infeasible with blocking warning. |
| Minimum draw amount | Small draw blocked/merged. |
| Fee-dominant | Fewer draws preferred. |
| Interest-dominant | Later releases may reduce interest if exposure allows. |
| Fastest reimbursement | More frequent releases than lowest-cost. |
| Lower requested draw | Uses lower amount if known. |
| Missing takeout date | Fallback/warning per policy. |
| Same dates/no dependencies | Stable tie-break behavior. |

### 9. Internal endpoint

```http
POST /internal/draw-planning/alternatives
```

Request: `DrawPlanningInput`  
Response: `DrawPlanningResult`

## IV. Screen and Component Manifest
The Draw Planning Engine is a headless service and does not own any user‑facing screens or components.  **This vertical defines no routes and therefore does not register a route module with the Foundation; instead, it exposes Convex actions and query functions consumed by other verticals.**  The table below summarises how the engine integrates into UI surfaces defined elsewhere:

| Consuming screen/component | Engine integration | Purpose & context | Mapped requirements/use‑cases |
| --- | --- | --- | --- |
| `ProposalBuilderScreen` → `DrawPlanComparison` (Vertical 02) | Invokes the `DrawPlanningInput` action via `fluent-convex` to compute plan alternatives.  Receives a `DrawPlanningResult` containing Cheapest Feasible, Fastest, Capital‑Constrained, and Balanced plans plus explanations. | Allows builders to compare recommended draw plans during proposal creation, view fees, interest, and peak exposure, and select a preferred plan. | PRD: Proposal flow steps 14–16; requirements for generating plans, computing fees/interest/exposure, and presenting explanations and warnings.
| `BuildWorkspaceScreen` → `PlanSummaryPanel` (Vertical 04) | Reads the approved plan from `DrawPlanVersion` via the workspace projection and displays a summary of draw groups, eligibility dates, fees, interest estimates, and warnings. | Keeps builder and lender users aligned on the approved draw plan during active build execution. | PRD: Build Workspace requirements for draw group visualization and plan comparison; user flow for monitoring draw eligibility and financial impact.

Because the engine itself has no UI, it does not define components.  All display logic belongs to the consuming verticals.  However, the engine’s output types (`DrawPlanningResult`, `PlanningAssumptionSnapshot`) and warnings must be exposed through typed interfaces so that UI components can render them consistently.
