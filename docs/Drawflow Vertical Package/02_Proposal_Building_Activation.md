# Vertical 02 — Proposal Building and Activation

## I. Actual agile epic / Linear project

### Objective

Build the end-to-end proposal-building vertical: a builder creates a construction build proposal, defines milestone values and schedule assumptions, sets working-capital constraints, receives/edits a draw-plan recommendation, submits the proposal, and a lender admin approves it into an active Build with immutable approved baseline versions.

### In scope

- Proposal draft creation and save/resume.
- Build identity/location metadata.
- Milestone template selection or manual milestone creation.
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

- Active build forecast editing.
- Completion claims.
- Evidence workflow beyond optional proposal-level documents.
- Draw release.
- Full policy admin UI.
- Contractor registry.
- White-label flows.

### Definition of done

1. Builder can create and save a proposal draft.
2. Builder can define milestone names, approved values, planned dates, and dependencies.
3. Proposal-mode Gantt date dragging updates draft planned dates.
4. Dependency validation rejects cycles.
5. Builder can enter working capital available.
6. Proposal can call planning engine contract and store selected/editable draw plan draft.
7. Builder can submit proposal.
8. Admin can approve, reject, or request changes.
9. Approval creates active Build and immutable baseline versions.
10. Activation emits audit/domain events and updates workspace projection.
11. Tests prove activation does not mutate draft objects after approval.

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
