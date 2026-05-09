# Vertical 02 — Proposal Building and Activation

## I. Actual agile epic / Linear project

### Objective

Build the end-to-end proposal-building vertical: a builder creates a construction build proposal, defines milestone values and schedule assumptions, sets working-capital constraints, receives/edits a draw-plan recommendation, submits the proposal, and a lender admin approves it into an active Build with immutable approved baseline versions.

### Technology alignment

Implementation of the proposal builder must adhere to the DrawFlow tech stack defined in `AGENTS.md`:

- **Frontend:** The builder and admin proposal screens are built with React 19, TypeScript, Vite 8, and TanStack Router/Start.  Forms, Gantt editing, and drag interactions use shadcn-style components, Base UI primitives, and Tailwind CSS 4 for styling.  Use lucide-react icons, Motion for animations, and Sonner for toast notifications where appropriate.
- **Backend:** Proposal data is stored in Convex collections defined via the schema builder.  All create/save/update actions are implemented as Convex mutations/actions using the `fluent-convex` API.  Plan generation requests call the Draw Planning Engine through a Convex action.  Do not use REST endpoints or custom servers for internal API calls.
- **Auth and tenancy:** The proposal flow is authenticated through WorkOS AuthKit.  The builder’s active organisation and grants determine proposal creation rights.  All saved drafts and submitted proposals must be scoped to the tenant organisation.
- **Validation:** Use Convex validators from `convex/values` and Zod from `fluent-convex/zod` for complex field refinement.  Client forms should reuse the same schema definitions to ensure consistent constraints.

### In scope

- Proposal draft creation and save/resume.
- Build identity/location metadata.
- Milestone template selection or manual milestone creation, including adding or removing milestones from a template.
- Permit and supporting-document upload (e.g., permits, blueprints, site photos) with file storage in the evidence pipeline.  Proposal-level documents do not yet require geofence verification.
- Draft milestone approved values.
- Draft start/end dates with Gantt drag support during proposal mode.
- Dependency definition and validation.  The system must prevent dependency cycles and flag suspicious patterns such as reversed sequences or missing expected dependencies.
- Working‑capital assumption input and validation.  The system flags infeasible plans where the working‑capital constraint would stall the build.

- **Cost visibility and running summary.**  Throughout proposal editing the builder must be able to see the estimated principal owed, draw fees, and interest for each milestone and cumulatively across the schedule.  The Gantt editing screen displays a running cost summary at the bottom of the timeline (mirroring the active Build workspace) showing how total cost evolves at each milestone date.  This uses the active policy snapshots for fees and interest and updates whenever milestone dates, groupings, or working‑capital assumptions change.
- Generation of recommended draw plan alternatives using the Draw Planning Engine.  At minimum this includes the **Cheapest Feasible**, **Fastest**, and **Capital‑Constrained** plans.  The builder can compare and select a preferred plan.  The plan includes explanations of grouping rationale, fee and interest estimates, and peak unreimbursed exposure.
- Anomaly detection and warnings: the system flags abnormal cost or duration values relative to template expectations, suspicious dependencies, missing expected milestones, and potential policy violations (e.g., plan exceeding draw policy limits).  Warnings are surfaced to the builder/admin during editing and plan selection.
- Proposal review package generation for admins, including the selected draw plan, the builder’s working‑capital assumption, milestone definitions, warnings, and supporting documents.
- Draft milestone approved values.
- Draft start/end dates with Gantt drag support during proposal mode.
- Dependency definition and validation.
- Working-capital assumption input.
- Integration with Draw Planning Engine through stub or real service.
- Proposal review package.
- Admin approve/reject/request changes.
- Activation into active Build.
- Creation of:
  - `Build`,
  - `BudgetVersion`,
  - `RoadmapVersion`,
  - `DrawPlanVersion`,
  - `ApprovedPlanVersionSet`.

### Out of scope

- Active build forecast editing (handled in the Revisions and Forecasts vertical).
- Completion claims.
- Evidence workflow beyond optional proposal-level documents.
- Draw release.
- Full policy admin UI.
- Contractor registry.
- White-label flows.
- Offline proposal editing and submission.
- Geofence‑verified document uploads (handled in Completion Claims and Evidence).

### Definition of done

1. Builder can create and save a proposal draft.
2. Builder can define milestone names, approved values, planned dates, and dependencies.
3. Proposal-mode Gantt date dragging updates draft planned dates.
4. Dependency validation rejects cycles.
5. Builder can enter working capital available.
6. Proposal can call the Draw Planning Engine via a Convex action and return a set of recommended draw plan alternatives.  Selected plans (including any builder edits within policy constraints) are saved in the proposal draft.
7. The system displays warnings for anomalies such as abnormal costs, durations, missing milestones, infeasible working‑capital assumptions, or policy‑violating draw groupings.
8. Builder can submit proposal and upload all required documents.  Submitted proposals are immutable drafts and cannot be directly edited.
9. Admin can approve, reject, or request changes.  Requested changes return the proposal to draft state with audit trail.
10. Approval creates an active Build and immutable baseline versions (BudgetVersion, RoadmapVersion, DrawPlanVersion, ApprovedPlanVersionSet) and associates them with the selected draw plan alternative and policy snapshots.
11. Activation emits audit and domain events, triggers a `workspace_projection.updated` event, and invalidates relevant read models.  External webhooks fire where configured.
12. Tests prove that activation does not mutate draft objects after approval, that warnings are generated for anomaly cases, and that draw plan selection persists correctly.
13. The proposal builder displays a running cost summary with principal, fees, and interest broken out at each milestone date.  Tests verify that cost estimates update when milestones or plan alternatives change and that the values respect the configured interest and fee policies.

## IV. Screen and Component Manifest
The Proposal Building and Activation vertical delivers the builder‑side proposal flow and the admin review flow.  **All routes described here are registered through the Foundation’s route module contract and live under `/app/:orgSlug/builds/:buildId/*`.**  The build context is provided by `BuildScopedLayout`, and permissions are enforced via `RequirePermission` and `RequireBuildGrant`.  Each screen maps directly to requirements and use cases defined in the PRD and this vertical’s scope.

| Screen / Route | Components | Purpose & context | Mapped requirements/use‑cases |
| --- | --- | --- | --- |
| **`ProposalBuilderScreen`** (`/app/:orgSlug/builds/:buildId/proposal`) | `ProposalForm`, `BuildDetailsSection`, `MilestoneList`, `MilestoneEditor`, `GanttEditor`, `DependencyEditor`, `WorkingCapitalInput`, `DrawPlanComparison`, `WarningBanner`, `DocumentUploader`, `PlanSelectionRadioGroup`, `SubmitProposalButton` | Allows a builder principal or permissioned staff to create and edit a build proposal.  The user can enter build identity and location, upload permits and documents, select or create milestones, edit costs/durations, define dependencies, drag milestones in a Gantt view, input working‑capital assumptions, request plan recommendations from the Draw Planning Engine, compare Cheapest Feasible/Fastest/Capital‑Constrained plans with explanations, see warnings about anomalies, select a preferred plan, and submit the proposal. | PRD: Proposal creation flow steps 1–17; requirements for milestone editing, dependency validation, working‑capital input, plan generation and selection, anomaly warnings, document upload.  Use cases: builder creates proposal, edits milestones, drags Gantt dates, engine warns, selects preferred plan, submits.
| **`ProposalBuilderScreen`** (`/app/:orgSlug/builds/:buildId/proposal`) | `ProposalForm`, `BuildDetailsSection`, `MilestoneList`, `MilestoneEditor`, `GanttEditor`, `DependencyEditor`, `WorkingCapitalInput`, `DrawPlanComparison`, `WarningBanner`, `DocumentUploader`, `PlanSelectionRadioGroup`, `RunningCostSummaryBar`, `SubmitProposalButton` | Allows a builder principal or permissioned staff to create and edit a build proposal.  The user can enter build identity and location, upload permits and documents, select or create milestones, edit costs/durations, define dependencies, drag milestones in a Gantt view, input working‑capital assumptions, request plan recommendations from the Draw Planning Engine, compare Cheapest Feasible/Fastest/Capital‑Constrained plans with explanations, see warnings about anomalies, monitor a running cost summary of principal, draw fees, and interest at each milestone date, select a preferred plan, and submit the proposal. | PRD: Proposal creation flow steps 1–17; working‑capital input; plan generation and selection; anomaly warnings; cost visibility requirement; document upload.  Use cases: builder creates proposal, edits milestones, drags Gantt dates, sees cost breakdown, engine warns, selects preferred plan, submits.
| **`ProposalReviewScreen`** (`/app/:orgSlug/builds/:buildId/proposal-review`) | `ProposalSummary`, `MilestoneSummaryTable`, `PlanComparisonPanel`, `WorkingCapitalSummary`, `WarningList`, `ApproveRejectButtons`, `RequestChangesDialog` | Used by lender admin to review a submitted proposal.  Displays build details, documents, proposed milestones with costs/durations/dependencies, selected plan and its alternatives, warnings generated during proposal, and working‑capital assumption.  Admin can approve, reject, or request changes.  Approval activates the build and creates baseline versions; rejection or changes return the proposal to draft. | PRD: Lender admin proposal review flow steps 1–11; requirements for admin to review and approve/reject/request changes; requirements to see warnings, working‑capital assumptions, and plan comparisons.

**Component notes:**

* `ProposalForm` orchestrates the high‑level form and coordinates data saving through Convex mutations.  It subscribes to planning engine outputs and passes selected plan details down to `DrawPlanComparison`.
* `MilestoneEditor` encapsulates milestone fields (name, category, cost, duration) and dependency selectors.  It enforces template defaults and triggers validations.
* `GanttEditor` is a drag‑and‑drop timeline component built with React and Motion.  It communicates changes to the forecast schedule but only persists draft dates until activation.  It prevents moves that violate dependency constraints.
* `DrawPlanComparison` displays alternative plans in a tabbed or side‑by‑side view, summarising groupings, fees, interest, total cost, unreimbursed exposure, and warnings.  It calls out the recommended plan.
* `WarningBanner` shows anomalies flagged during proposal editing, such as abnormal costs/durations, suspicious dependencies, missing milestones, or infeasible working‑capital assumptions.  It links to details in the UI.

* `RunningCostSummaryBar` mirrors the cost summary bar used in the active Build Workspace.  It computes and displays the cumulative total cost at each milestone date during proposal editing, breaking down the amount into principal owed, draw fees, and interest estimates.  The component uses the active policy snapshot (`InterestEstimatePolicyVersion` and `DrawFeePolicyVersion`) to apply the correct day‑count basis, compounding frequency (daily or monthly), accrual convention (day after release), pay‑off date, and fee funding source.  It updates automatically as the Gantt dates, plan selection, working‑capital assumptions, or policy snapshots change, giving builders real‑time insight into how different plan options impact total cost.

These screens are registered through the route module contract for this vertical.  They rely on the authentication, tenant resolution, and permission boundaries provided by the Foundation vertical.

---

## II. PRD for this vertical

### Context

DrawFlow starts before execution. The builder needs a structured way to express the proposed build, and the lender needs a stable baseline to approve. That baseline later anchors completion claims, draw eligibility, schedule slippage, MIC portal visibility, and audit history.

### Requirements

#### Proposal creation

A builder can provide:

- build name,
- location metadata,
- estimated start and target completion,
- milestone list,
- approved value candidate per milestone,
- planned start/end dates,
- dependencies,
- working-capital constraint,
- optional notes/documents.

#### Draft Gantt editing

During proposal mode only:

- milestone start/end dates can be adjusted by dragging Gantt cards,
- updates mutate draft planned dates,
- invalid dependency/date moves warn or block depending severity.

After activation, approved baseline is immutable. Active-build schedule drift belongs to the Forecast/Revisions vertical.

#### Planning integration

The proposal vertical requests plan alternatives from the planning engine. Builder/admin selects one and may adjust draw groupings within policy constraints.

#### Admin approval

Admin can:

- approve activation,
- reject proposal,
- request changes.

Approval freezes baseline versions. Rejection/request-changes does not create active Build.

### Use cases

1. Builder creates proposal from template and submits.
2. Builder manually creates milestones because no template fits.
3. Builder drags draft milestone end date in Gantt.
4. Engine warns working capital is insufficient.
5. Admin requests changes due to unrealistic values/dates.
6. Admin approves and active Build appears.

### Boundary definitions

Proposal owns draft state and activation. It does not own active forecast changes, evidence, verification, draw release, or revisions after activation.

### Handoffs

| Handoff | To vertical | Contract |
|---|---|---|
| Planning input | Draw Planning Engine | `DrawPlanningInput` |
| Approved baseline | Workspace / Claims / Draw Release / Revisions | `ApprovedPlanVersionSet` |
| Activation event | Webhooks / MIC / Notifications | `build.activated`, `workspace_projection.updated` |

---

## III. Spec

### 1. Build proposal status

```ts
export type BuildProposalStatus =
  | 'draft'
  | 'submitted'
  | 'changes_requested'
  | 'approved'
  | 'rejected'
  | 'activated'
  | 'withdrawn';
```

### 2. Proposal model

```ts
export interface BuildProposal {
  id: Id<'BuildProposal'>;
  tenantOrgId: TenantOrgId;
  createdByUserId: UserId;

  status: BuildProposalStatus;

  buildName: string;
  location: BuildLocation;

  estimatedStartDate: ISODate;
  targetCompletionDate: ISODate;

  workingCapitalAssumption: BuilderCapitalAssumption;
  selectedDrawPlanDraftId?: Id<'DrawPlanDraft'>;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  aggregateVersion: number;
}

export interface BuildLocation {
  addressLine1?: string;
  addressLine2?: string;
  city: string;
  province: string;
  postalCode?: string;
  country: 'CA';
  latitude?: number;
  longitude?: number;
}

export interface BuilderCapitalAssumption {
  availableWorkingCapitalCents: MoneyCents;
  maxAcceptableUnreimbursedExposureCents?: MoneyCents;
}
```

### 3. Draft milestone model

```ts
export interface ProposalMilestoneDraft {
  id: Id<'ProposalMilestoneDraft'>;
  proposalId: Id<'BuildProposal'>;
  tenantOrgId: TenantOrgId;

  name: string;
  description?: string;
  category?: string;

  plannedStartDate: ISODate;
  plannedEndDate: ISODate;

  approvedValueCandidateCents: MoneyCents;

  sortOrder: number;
  dependencyDraftIds: Id<'ProposalMilestoneDraft'>[];

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
```

### 4. Active Build and baseline versions

```ts
export interface Build {
  id: BuildId;
  tenantOrgId: TenantOrgId;
  sourceProposalId: Id<'BuildProposal'>;

  status: 'active' | 'completed' | 'cancelled' | 'archived';
  name: string;
  location: BuildLocation;

  activeApprovedPlanVersionSetId: Id<'ApprovedPlanVersionSet'>;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  aggregateVersion: number;
}

export interface ApprovedPlanVersionSet {
  id: Id<'ApprovedPlanVersionSet'>;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;

  budgetVersionId: Id<'BudgetVersion'>;
  roadmapVersionId: Id<'RoadmapVersion'>;
  drawPlanVersionId: Id<'DrawPlanVersion'>;

  approvedByUserId: UserId;
  approvedAt: ISODateTime;
  sourceProposalId: Id<'BuildProposal'>;
}

export interface BudgetVersion {
  id: Id<'BudgetVersion'>;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;
  version: number;
  status: 'approved' | 'superseded';
  totalApprovedValueCents: MoneyCents;
  milestoneValues: Array<{
    milestoneId: MilestoneId;
    approvedValueCents: MoneyCents;
  }>;
}

export interface RoadmapVersion {
  id: Id<'RoadmapVersion'>;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;
  version: number;
  status: 'approved' | 'superseded';
  milestoneSchedules: Array<{
    milestoneId: MilestoneId;
    approvedStartDate: ISODate;
    approvedEndDate: ISODate;
    dependencyMilestoneIds: MilestoneId[];
  }>;
}

export interface DrawPlanVersion {
  id: Id<'DrawPlanVersion'>;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;
  version: number;
  status: 'approved' | 'superseded';
  drawGroups: DrawGroupDefinition[];
  planningAssumptions: PlanningAssumptionSnapshot;
}
```

### 5. Proposal machine

```ts
import { createMachine } from 'xstate';

export const buildProposalMachine = createMachine({
  id: 'buildProposal',
  initial: 'draft',
  states: {
    draft: {
      on: {
        SAVE_DRAFT: 'draft',
        SUBMIT: { target: 'submitted', guard: 'proposalIsComplete' },
        WITHDRAW: 'withdrawn',
      },
    },
    submitted: {
      on: {
        REQUEST_CHANGES: 'changes_requested',
        APPROVE: { target: 'approved', guard: 'actorCanApproveProposal' },
        REJECT: 'rejected',
      },
    },
    changes_requested: {
      on: {
        SAVE_DRAFT: 'changes_requested',
        SUBMIT: { target: 'submitted', guard: 'proposalIsComplete' },
        WITHDRAW: 'withdrawn',
      },
    },
    approved: {
      on: {
        ACTIVATE: { target: 'activated', guard: 'approvedBaselineCanBeCreated' },
      },
    },
    activated: { type: 'final' },
    rejected: { type: 'final' },
    withdrawn: { type: 'final' },
  },
});
```

### 6. Validation rules

| Rule | Behavior |
|---|---|
| No milestones | Cannot submit. |
| Milestone value <= 0 | Cannot submit. |
| End date before start date | Cannot submit. |
| Dependency cycle | Cannot submit. |
| Missing working capital | Warn or block depending policy; recommended block. |
| No selected draw plan | Cannot submit if planning policy requires it. |
| Plan infeasible | Can submit with explicit warning only if lender policy allows. |

### 7. API commands

```http
POST /api/v1/build-proposals
PATCH /api/v1/build-proposals/:proposalId
POST /api/v1/build-proposals/:proposalId/milestones
PATCH /api/v1/build-proposals/:proposalId/milestones/:draftMilestoneId
POST /api/v1/build-proposals/:proposalId/generate-draw-plans
POST /api/v1/build-proposals/:proposalId/submit
POST /api/v1/build-proposals/:proposalId/request-changes
POST /api/v1/build-proposals/:proposalId/approve
POST /api/v1/build-proposals/:proposalId/activate
```

All status changes route through governed transition service.

### 8. UX flow

```text
Builder proposal
1. Open proposal builder.
2. Enter identity/location.
3. Add/select milestones.
4. Drag draft Gantt dates.
5. Enter approved values.
6. Enter working capital.
7. Generate plan alternatives.
8. Select/edit plan.
9. Review warnings.
10. Submit.
```

```text
Admin activation
1. Open proposal review package.
2. Review values, dates, dependencies, plan assumptions/warnings.
3. Approve.
4. System creates Build + approved baseline versions.
5. Workspace becomes available.
```

### 9. Events

```text
build_proposal.created
build_proposal.updated
build_proposal.submitted
build_proposal.changes_requested
build_proposal.approved
build.activated
workspace_projection.updated
```
