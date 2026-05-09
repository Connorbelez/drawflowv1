# DrawFlow MVP Vertical Package

This combined document concatenates the tightened PRD, vertical index, and all vertical specs.



---

<!-- Source: 00_Tightened_PRD.md -->


# DrawFlow Tightened MVP PRD

**Product:** DrawFlow  
**Document type:** Tightened PRD  
**Status:** Scope-clarified MVP draft  
**Last updated:** May 8, 2026  
**Inputs:** Original DrawFlow PRD plus follow-up scoping decisions from the product review conversation.

---

## 1. Executive summary

DrawFlow is a tenant-scoped construction draw workflow product for lenders, builders, and authorized observers. The MVP should not attempt to be a generic construction-management suite. Its wedge is narrower:

> DrawFlow records planned construction milestones, lender-approved milestone values, builder completion claims, uploaded proof, discretionary verification decisions, optional site visits, draw eligibility, manual draw-release approvals, operational audit history, and read-only project state for downstream portals.

The MVP is reimbursement-only in the workflow sense: builders complete milestone work first, upload proof, and only after completion approval can the associated approved milestone value become eligible for draw release. DrawFlow is not the authoritative system for ledger balances, servicing interest, accounting entries, payments, settlement, or funds movement. It is closer to a specialized construction draw CRM / workflow control plane.

Implementation should be organized as **verticals**, not loose agile epics. The first vertical must establish contracts: authenticated shell, tenant model, canonical schemas, shared TypeScript types, governed transition architecture, policy contracts, audit events, domain events, and outbox/webhook primitives. Later verticals should be buildable against stubs if they respect those contracts.

---

## 2. Core MVP lifecycle

```text
Proposal build
→ approved baseline budget / roadmap / draw plan
→ active Build Workspace
→ builder claims milestone completion
→ builder/staff uploads proof
→ verifier reviews evidence
→ discretionary site visit if evidence is insufficient or policy requires it
→ verifier approves or rejects milestone completion
→ draw group becomes eligible when included milestones are approved
→ admin separately approves draw release
→ admin manually records draw as released
→ audit + events + read-model projections preserve the history
```

The system does **not** claim to objectively prove construction quality. It records evidence and human verification decisions.

---

## 3. Locked scope decisions

| Area | MVP decision |
|---|---|
| Offline sync | Out of scope. Online responsive/PWA-style capture only. |
| Geofencing | Out of scope. No physical-presence verification claims. |
| Verification model | Evidence-first, site visit discretionary. |
| Completion proof | Required for every milestone completion claim. |
| Completion approval vs draw release | Decoupled. Completion approval creates eligibility; draw release requires separate admin action. |
| Reimbursement basis | Approved milestone value, not documented actual cost. |
| Cost evidence | Not required for v1. |
| Overruns | Not reimbursed in v1. Builder can pursue other loan products outside DrawFlow. |
| Under-budget/lower draw | Builder can request a lower draw amount than approved milestone value. This is in MVP. |
| Financial authority | DrawFlow is workflow/CRM truth, not payment/ledger/servicing truth. |
| Fees | Configurable and estimated separately. Fees are not capitalized and do not compound. |
| Interest | Planning estimate only. Interest compounds. |
| Timeline | Approved baseline separated from active forecast/actual reality. |
| Gantt drag | Allowed in proposal-building mode for planned dates. Active build drift updates forecast/actual only. |
| Site visits | Admin/verifier can order if evidence is insufficient. Not default-required for all milestones. |
| API/webhook | Read-only API and webhook registry/event publishing are in MVP. Future CRUD should be architecturally supported. |
| MIC portal | Required. Provide workspace projection and conservative evidence access. |
| Chat | Convenience feature only; not workflow state. |
| White label | Deferred. Tenant-safe architecture remains mandatory. |
| Contractor registry/analytics | Deferred/stretch only. |

---

## 4. Goals

1. Let builders construct a proposal with milestone budgets, dates, dependencies, and working-capital assumptions.
2. Generate deterministic draw-plan recommendations as editable starting points.
3. Freeze an approved baseline after lender/admin approval.
4. Provide a shared Build Workspace showing approved baseline, actual/forecast state, milestone status, draw group status, warnings, and actions.
5. Let builders claim milestone completion by uploading structured proof.
6. Let authorized verifiers review evidence, request more information, order site visits, approve completion, or reject completion.
7. Let admins separately approve and manually record draw releases.
8. Preserve audit history and domain events for decisions and integrations.
9. Provide a read-only workspace API for a MIC portal or other FairLend product.
10. Use WorkOS for identity/org primitives while keeping domain-specific resource authorization in DrawFlow.

---

## 5. Non-goals / deferred

DrawFlow MVP is not:

- a full construction project-management suite,
- a contractor marketplace,
- contractor smart selection,
- contractor analytics,
- superintendent daily updates,
- offline-first field software,
- geofence/anti-spoofing software,
- native mobile app,
- payment rails,
- ledger/accounting/servicing authority,
- full public CRUD API,
- developer portal,
- white-label SaaS admin,
- compliance-certified audit product,
- cost-evidence reimbursement workflow,
- budget-overrun financing workflow,
- builder receipt/double-confirmation workflow.

---

## 6. Users and authorization

| Persona | Responsibilities |
|---|---|
| Builder / developer principal | Proposal, budget/milestones, working-capital inputs, completion claims, lower-draw request. |
| Builder staff | Upload proof, assist claims, update progress where allowed; restricted financial visibility. |
| Lender verifier/staff | Review evidence, request more info, order site visits, verify completion where permitted. |
| Lender admin | Approve activation, verify/override completion, approve release, record release, configure policy. |
| Site visitor / inspector | Complete online site visit report and upload site evidence. |
| MIC observer | Read-only status/evidence view via API with conservative visibility. |
| Platform admin | Support/ops access with strict audit requirements. |

Authorization should layer:

```text
WorkOS authenticated identity
→ WorkOS org/RBAC/FGA primitive
→ DrawFlow tenant/resource grant
→ build participant or observer grant
→ transition-specific guard
→ domain mutation + audit + event
```

---

## 7. Requirements by module

### 7.1 Proposal and activation

A builder can create a draft proposal with build identity, location metadata, milestones, approved value candidates, dates, dependencies, working capital, and selected draw plan. Proposal-mode Gantt date dragging mutates draft planned dates.

Admin approval activates the build and freezes:

```text
ApprovedPlanVersionSet = BudgetVersion + RoadmapVersion + DrawPlanVersion
```

### 7.2 Draw Planning Engine

The engine generates deterministic starting plans using milestone approved values, dependencies, working-capital constraints, draw fees, compound interest estimates, draw policy, and takeout/payoff horizon. Outputs must include assumptions, warnings, explanation steps, total fees, estimated compound interest, total estimated financing cost, and peak unreimbursed exposure.

Use language like **recommended starting plan**, not “perfect optimizer.”

### 7.3 Build Workspace

The workspace should expose approved baseline, actual/forecast reality, milestone state, draw groups, completion claims, evidence/verification state, release state, warnings, and role-specific actions. It should avoid both excessive screen fragmentation and a single god-screen.

Behind-schedule milestones should be visually alarming at a glance.

### 7.4 Completion claims and evidence

To claim a milestone complete, the builder/staff uploads proof and optionally requests a lower draw amount. Completion proof is required. Cost evidence is not required in v1.

### 7.5 Verification and site visits

An authorized verifier/admin reviews proof and can approve completion, reject completion, request more info, or order a site visit. Site visits are evidence-first/discretionary by default.

### 7.6 Draw release

Completion approval does not automatically release funds. A draw group becomes eligible when included milestones have approved completion. Admin separately approves release and manually records release. DrawFlow must use language such as “release approved” and “manual release recorded,” not “funds disbursed” unless an authoritative external system confirms it.

### 7.7 Policy and finance

Policies must be versioned and snapshot-driven. MVP policy defaults:

```text
reimbursement basis = approved_milestone_value
cost evidence required = false
overrun treatment = not_reimbursable
builder lower draw request = allowed
fees = configurable, not capitalized
interest = compound planning estimate
```

### 7.8 API / MIC / webhooks

Expose read-only workspace projections and conservative evidence access. Webhooks are driven by the domain outbox. The most important event for downstream portals is `workspace_projection.updated`, letting the portal refetch canonical state.

---

## 8. Critical open questions

1. Daily or monthly compounding?
2. Actual/365 or Actual/360?
3. Does interest accrue on release date or day after release?
4. How are draw fees paid/charged operationally if not capitalized?
5. Which exact roles can verify completion?
6. Which evidence is visible to MIC observers?
7. If builder requests less than approved amount, is the remaining approved balance waived, preserved, or manually recoverable?
8. How much material revision workflow is needed in v1?
9. Can dependencies/draw groups change after activation?
10. Should policy configuration be support-managed or minimally self-serve?

---

## 9. MVP definition of done

DrawFlow MVP is done when a production-like build can complete this loop:

```text
Builder creates proposal
→ planning engine recommends draw plan with working-capital and compound-interest estimates
→ admin approves proposal and activates Build
→ workspace shows approved baseline and active forecast state
→ builder claims milestone completion with proof and optional lower draw amount
→ verifier reviews proof and optionally orders site visit
→ verifier/admin approves completion
→ draw group becomes eligible
→ admin approves release
→ admin manually records release
→ MIC portal can read permitted workspace state/evidence
→ audit/events/webhooks record the lifecycle
```

All material state transitions must be guarded server-side, audited, and covered by tests.


---

<!-- Source: 00_Verticals_Index_and_Handoff_Map.md -->


# DrawFlow Vertical Package Index and Handoff Map

This package decomposes DrawFlow into implementation **verticals**. A vertical is a complete module boundary that includes backend, frontend, tests, contracts, and integration handoffs. Each vertical contains:

1. **Actual agile epic / Linear project** — outcome, verifiability, definition of done.
2. **PRD for that vertical** — requirements, use cases, context, boundaries, and handoffs.
3. **Spec** — contracts, types, schemas, UX flows, and explicit integration points.

The Foundation vertical must land first. Other verticals can be developed against stubs if they respect its contracts.

---

## Files

| File | Vertical |
|---|---|
| `00_Tightened_PRD.md` | Single tightened MVP PRD. |
| `01_Foundation_Contracts_State_Machines.md` | Auth shell, tenancy, schema/types, governed transitions, audit, outbox. |
| `02_Proposal_Building_Activation.md` | Proposal builder, draft Gantt, activation, approved baseline. |
| `03_Draw_Planning_Engine.md` | Deterministic planning engine, capital constraints, compound interest estimates. |
| `04_Build_Workspace_Timeline.md` | Workspace, Gantt/timeline, approved-vs-actual/forecast, warnings. |
| `05_Completion_Claims_Evidence.md` | Completion claims, structured proof upload, lower draw request, evidence pipeline. |
| `06_Verification_Site_Visits.md` | Evidence-first verification and discretionary site visits. |
| `07_Draw_Release_Manual_Recording.md` | Draw eligibility, admin release approval, manual release record. |
| `08_Policy_Financial_Estimates.md` | Versioned policies, fee/interest estimates, reimbursement policy. |
| `09_MIC_Read_API_Webhooks.md` | Read-only API, MIC projection, evidence access, webhook registry. |
| `10_Revisions_Forecasts_Corrections.md` | Approved baseline vs forecast/actual, slippage, corrections, material revisions. |
| `11_Ops_Queues_Notifications_Chat.md` | Queues, kanban-as-visualization, notifications, chat as non-state communication. |
| `12_Open_Questions_and_Decision_Log.md` | Remaining product ambiguities and recommended defaults. |

---

## Dependency model

```text
01 Foundation
  ├─ 02 Proposal Building and Activation
  ├─ 03 Draw Planning Engine
  ├─ 04 Build Workspace and Timeline
  ├─ 05 Completion Claims and Evidence
  ├─ 06 Verification and Site Visits
  ├─ 07 Draw Release and Manual Recording
  ├─ 08 Policy and Financial Estimates
  ├─ 09 MIC Read API and Webhooks
  ├─ 10 Revisions, Forecasts, and Corrections
  └─ 11 Ops Queues, Notifications, and Chat
```

Recommended real implementation order after Foundation:

1. Proposal Building and Activation.
2. Policy and Financial Estimates.
3. Draw Planning Engine.
4. Build Workspace and Timeline.
5. Completion Claims and Evidence.
6. Verification and Site Visits.
7. Draw Release and Manual Recording.
8. MIC Read API and Webhooks.
9. Revisions, Forecasts, and Corrections.
10. Ops Queues, Notifications, and Chat.

---

## Handoff map

| Consumer vertical | Required handoff contract | Producer/source |
|---|---|---|
| Proposal | Tenant/session/contracts/policies | Foundation |
| Planning Engine | Milestones, dependencies, policy snapshots, working capital | Proposal + Policy |
| Workspace | `BuildWorkspaceProjection` | Workspace projection service |
| Completion Claims | `Milestone`, `EvidenceRequirement`, transition service | Foundation + Policy + Workspace context |
| Verification | `CompletionClaim`, `EvidencePackage`, `SiteVisit` | Claims/Evidence |
| Draw Release | Approved completion claims and draw groups | Verification + Planning |
| MIC API | Workspace projection, observer grants, evidence visibility | Workspace + Evidence + Foundation |
| Webhooks | Domain event outbox | Foundation |
| Forecast/Revisions | Approved baseline version set | Proposal + Foundation |
| Queues/Notifications | Domain events and work items | Foundation + all vertical events |

---

## Contract-first rule

Before implementation, every vertical must identify:

1. consumed Foundation types,
2. emitted domain events,
3. emitted audit events,
4. owned state machines,
5. command/transition endpoints,
6. required permissions,
7. workspace projection fields it reads/writes,
8. user/role visibility rules,
9. test fixtures proving boundary behavior.


---

<!-- Source: 01_Foundation_Contracts_State_Machines.md -->


# Vertical 01 — Foundation, Contracts, Auth Shell, and Governed Transitions

## I. Actual agile epic / Linear project

### Objective

Establish the stable platform and domain contracts that every other DrawFlow vertical depends on:

- authenticated app shell,
- tenant/resource model,
- shared schema and TypeScript types,
- policy base contracts,
- governed state-machine transition service,
- lifecycle snapshot persistence,
- audit event persistence,
- domain event outbox,
- read-model invalidation hooks.

This vertical lands first because schemas and types are the contract layer that prevents drift in later phases.

### In scope

- WorkOS-backed authenticated shell.
- Tenant organization model.
- User identity model.
- Build participant grants.
- MIC/external observer grants.
- Canonical scalar/type conventions.
- Core domain table conventions.
- Lifecycle instance table.
- Machine registry.
- Governed transition command handler.
- Audit event writer.
- Domain event outbox writer.
- Idempotency keys and optimistic concurrency.
- Policy version base contract.
- Shared TypeScript package consumed by all verticals.
- Server-side authorization helpers.
- Contract/state-machine test harness.

### Out of scope

- Full proposal builder.
- Full workspace UI.
- Full policy admin UI.
- MIC portal UI.
- Payment rails.
- Ledger/servicing integration.
- Full public CRUD API.
- Admin-configurable workflow designer.

### Definition of done

1. Every core entity has `tenant_org_id`, immutable ID, timestamps, and aggregate version.
2. Auth shell resolves authenticated user, active org, tenant context, and grants.
3. Transition service can load lifecycle state, validate transition, run guards, persist mutation/audit/outbox atomically, and return transition result.
4. A sample machine can be persisted/restored/transitioned.
5. Cross-tenant access, stale version, missing permission, invalid event, failed guard, duplicate idempotency key, and transaction rollback are tested.
6. Shared type package is imported by at least one stub module.

---

## II. PRD for this vertical

### Context

DrawFlow is lifecycle-heavy. Proposal activation, completion claims, site visits, draw release, revisions, and webhooks all require governed transitions. No meaningful workflow status should be mutated directly by UI handlers or arbitrary SQL updates.

The core pattern is:

```text
authenticated actor
→ tenant/resource authorization
→ state-machine transition
→ domain guards
→ domain mutation
→ lifecycle snapshot update
→ audit event
→ outbox event
→ projection invalidation
```

XState should model state machines and enable lifecycle snapshot persistence/restoration. DrawFlow should not rely on XState actions for durable side effects; durable persistence belongs in command handlers and the outbox.

WorkOS should provide identity, organizations, and coarse authorization primitives. DrawFlow still owns resource-specific and state-specific domain guards.

### Requirements

#### Tenant model

- MVP tenant is lender/FairLend customer organization.
- Every Build is owned by one tenant org.
- Builders, builder staff, inspectors, and MIC observers are build-scoped participants/grantees in MVP.
- Future cross-tenant collaboration must not be blocked, but should not be fully solved in MVP.

#### Authorization

Authorization is layered:

```text
WorkOS user/org
→ DrawFlow tenant user
→ build participant grant or observer grant
→ permission
→ transition guard
```

#### Governed transition service

The service must:

- reject invalid state transitions,
- reject unauthorized actors,
- reject cross-tenant access,
- reject stale aggregate versions,
- run domain-specific guards,
- persist domain mutation, lifecycle snapshot, audit, and outbox in one transaction,
- support idempotency keys for retry-safe clients.

#### Audit

Audit is operational decision history, not compliance certification. It must answer who did what, when, why, against which entity, and under which baseline/policy version.

#### Domain events/outbox

Outbox events power:

- webhooks,
- MIC portal refresh,
- workspace projection updates,
- notifications,
- future analytics.

No direct webhook publish inside request transaction.

### Handoff contracts

Foundation exposes:

- `TransitionCommand`,
- `TransitionResult`,
- lifecycle instance schema,
- audit event schema,
- domain event envelope,
- tenant/resource grants,
- policy base contract,
- shared IDs/scalars,
- permission constants.

---

## III. Spec

### 1. Scalar and ID conventions

```ts
export type Id<T extends string> = string & { readonly __brand: T };

export type TenantOrgId = Id<'TenantOrg'>;
export type UserId = Id<'User'>;
export type BuildId = Id<'Build'>;
export type MilestoneId = Id<'Milestone'>;
export type CompletionClaimId = Id<'CompletionClaim'>;
export type EvidenceAssetId = Id<'EvidenceAsset'>;
export type SiteVisitId = Id<'SiteVisit'>;
export type DrawGroupId = Id<'DrawGroup'>;
export type DrawReleaseId = Id<'DrawRelease'>;
export type PolicyVersionId = Id<'PolicyVersion'>;
export type AuditEventId = Id<'AuditEvent'>;
export type DomainEventId = Id<'DomainEvent'>;

export type ISODate = string;      // YYYY-MM-DD
export type ISODateTime = string;  // UTC ISO timestamp
export type MoneyCents = number;   // integer cents only
export type BasisPoints = number;  // 100 bps = 1%
```

### 2. Tenant, user, participants, observers

```ts
export interface TenantOrg {
  id: TenantOrgId;
  workosOrgId: string;
  name: string;
  type: 'fairlend_internal' | 'lender';
  status: 'active' | 'suspended' | 'archived';
  createdAt: ISODateTime;
}

export interface UserIdentity {
  id: UserId;
  workosUserId: string;
  email: string;
  displayName: string;
  createdAt: ISODateTime;
}

export type BuildParticipantRole =
  | 'builder_principal'
  | 'builder_staff'
  | 'lender_admin'
  | 'lender_verifier'
  | 'site_visitor'
  | 'platform_admin';

export interface BuildParticipantGrant {
  id: Id<'BuildParticipantGrant'>;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;
  userId: UserId;
  role: BuildParticipantRole;
  permissions: DrawFlowPermission[];
  grantedByUserId: UserId;
  grantedAt: ISODateTime;
  revokedAt?: ISODateTime;
}

export type ObserverAccessLevel =
  | 'workspace_summary'
  | 'workspace_with_portal_evidence'
  | 'workspace_financials';

export interface BuildObserverGrant {
  id: Id<'BuildObserverGrant'>;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;
  observerOrgExternalId: string;
  accessLevel: ObserverAccessLevel;
  grantedByUserId: UserId;
  grantedAt: ISODateTime;
  revokedAt?: ISODateTime;
}
```

### 3. Permission constants

```ts
export type DrawFlowPermission =
  | 'build.create_proposal'
  | 'build.submit_proposal'
  | 'build.approve_activation'
  | 'build.view_workspace'
  | 'milestone.update_forecast'
  | 'completion_claim.create'
  | 'completion_claim.submit'
  | 'completion_claim.verify'
  | 'completion_claim.request_more_info'
  | 'completion_claim.reject'
  | 'site_visit.request'
  | 'site_visit.assign'
  | 'site_visit.submit'
  | 'draw_release.approve'
  | 'draw_release.record_manual_release'
  | 'revision.submit'
  | 'revision.approve'
  | 'policy.manage'
  | 'audit.view'
  | 'webhook.manage';
```

### 4. SQL conventions

```sql
create table tenant_orgs (
  id uuid primary key,
  workos_org_id text not null unique,
  name text not null,
  type text not null check (type in ('fairlend_internal', 'lender')),
  status text not null check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now()
);

create table user_identities (
  id uuid primary key,
  workos_user_id text not null unique,
  email citext not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table build_participant_grants (
  id uuid primary key,
  tenant_org_id uuid not null references tenant_orgs(id),
  build_id uuid not null,
  user_id uuid not null references user_identities(id),
  role text not null,
  permissions text[] not null default '{}',
  granted_by_user_id uuid not null references user_identities(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (tenant_org_id, build_id, user_id, role)
);

create index idx_build_participant_grants_active
  on build_participant_grants (tenant_org_id, build_id, user_id)
  where revoked_at is null;

create table build_observer_grants (
  id uuid primary key,
  tenant_org_id uuid not null references tenant_orgs(id),
  build_id uuid not null,
  observer_org_external_id text not null,
  access_level text not null,
  granted_by_user_id uuid not null references user_identities(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
```

### 5. Lifecycle persistence

```ts
export interface LifecycleInstance<TState = unknown, TContext = unknown> {
  id: Id<'LifecycleInstance'>;
  tenantOrgId: TenantOrgId;
  entityType:
    | 'build_proposal'
    | 'completion_claim'
    | 'site_visit'
    | 'draw_release'
    | 'revision_request';
  entityId: string;
  machineKey: string;
  machineVersion: string;
  stateValue: TState;
  contextSnapshot: TContext;
  persistedActorSnapshot?: unknown;
  aggregateVersion: number;
  updatedAt: ISODateTime;
}
```

```sql
create table lifecycle_instances (
  id uuid primary key,
  tenant_org_id uuid not null references tenant_orgs(id),
  entity_type text not null,
  entity_id uuid not null,
  machine_key text not null,
  machine_version text not null,
  state_value jsonb not null,
  context_snapshot jsonb not null,
  persisted_actor_snapshot jsonb,
  aggregate_version integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (tenant_org_id, entity_type, entity_id)
);
```

### 6. Transition command contract

```ts
export interface TransitionCommand<TPayload = unknown> {
  tenantOrgId: TenantOrgId;
  actorUserId: UserId;

  entityType:
    | 'build_proposal'
    | 'completion_claim'
    | 'site_visit'
    | 'draw_release'
    | 'revision_request';
  entityId: string;

  eventType: string;
  payload?: TPayload;

  expectedAggregateVersion?: number;
  idempotencyKey?: string;
  reason?: string;
  correlationId: string;
}

export interface TransitionResult<TState = unknown> {
  ok: true;
  entityType: string;
  entityId: string;
  previousState: TState;
  nextState: TState;
  aggregateVersion: number;
  auditEventId: AuditEventId;
  domainEventIds: DomainEventId[];
}

export interface TransitionFailure {
  ok: false;
  code:
    | 'UNAUTHENTICATED'
    | 'FORBIDDEN'
    | 'TENANT_MISMATCH'
    | 'INVALID_EVENT'
    | 'GUARD_REJECTED'
    | 'STALE_AGGREGATE_VERSION'
    | 'IDEMPOTENCY_CONFLICT'
    | 'NOT_FOUND';
  message: string;
  details?: unknown;
}
```

### 7. Transition service pseudocode

```ts
export async function executeTransition(
  command: TransitionCommand,
): Promise<TransitionResult | TransitionFailure> {
  return db.transaction(async (tx) => {
    const actor = await loadActor(tx, command.actorUserId);
    if (!actor) return fail('UNAUTHENTICATED', 'Actor not found');

    const lifecycle = await loadLifecycleForUpdate(
      tx,
      command.tenantOrgId,
      command.entityType,
      command.entityId,
    );
    if (!lifecycle) return fail('NOT_FOUND', 'Lifecycle instance not found');

    if (
      command.expectedAggregateVersion &&
      lifecycle.aggregateVersion !== command.expectedAggregateVersion
    ) {
      return fail('STALE_AGGREGATE_VERSION', 'Entity has changed');
    }

    const entity = await loadDomainEntityForUpdate(tx, command.entityType, command.entityId);
    if (!entity || entity.tenantOrgId !== command.tenantOrgId) {
      return fail('TENANT_MISMATCH', 'Entity outside tenant boundary');
    }

    const permission = permissionForTransition(command.entityType, command.eventType);
    const authorized = await canActorPerformTransition(tx, { actor, entity, permission, command });
    if (!authorized) return fail('FORBIDDEN', 'Actor lacks permission');

    const machine = machineRegistry.get(lifecycle.machineKey, lifecycle.machineVersion);
    const next = machine.transition(lifecycle.stateValue, {
      type: command.eventType,
      ...command.payload,
    });

    if (!transitionChanged(lifecycle.stateValue, next.value)) {
      return fail('INVALID_EVENT', 'Invalid event from current state');
    }

    const guard = await evaluateDomainGuards(tx, { command, entity, lifecycle, next });
    if (!guard.ok) return fail('GUARD_REJECTED', guard.message, guard.details);

    const mutation = await applyDomainMutation(tx, { command, entity, lifecycle, next });

    const nextLifecycle = await persistLifecycleSnapshot(tx, {
      ...lifecycle,
      stateValue: next.value,
      contextSnapshot: next.context,
      aggregateVersion: lifecycle.aggregateVersion + 1,
    });

    const auditEvent = await writeAuditEvent(tx, buildAuditEvent({
      command,
      entityBefore: entity,
      entityAfter: mutation.entityAfter,
      previousState: lifecycle.stateValue,
      nextState: next.value,
    }));

    const domainEvents = await writeDomainEvents(tx, buildDomainEvents({
      command,
      entityAfter: mutation.entityAfter,
      previousState: lifecycle.stateValue,
      nextState: next.value,
    }));

    await markProjectionDirty(tx, command.tenantOrgId, mutation.buildId);

    return {
      ok: true,
      entityType: command.entityType,
      entityId: command.entityId,
      previousState: lifecycle.stateValue,
      nextState: next.value,
      aggregateVersion: nextLifecycle.aggregateVersion,
      auditEventId: auditEvent.id,
      domainEventIds: domainEvents.map(e => e.id),
    };
  });
}
```

### 8. Audit event contract

```ts
export interface AuditEvent {
  id: AuditEventId;
  tenantOrgId: TenantOrgId;
  buildId?: BuildId;

  actorUserId?: UserId;
  actorRoleSnapshot?: string;

  eventType: string;
  entityType: string;
  entityId: string;

  occurredAt: ISODateTime;
  reason?: string;

  before?: unknown;
  after?: unknown;

  policyVersionIds?: PolicyVersionId[];
  planVersionSetId?: Id<'ApprovedPlanVersionSet'>;

  correlationId: string;
  requestId?: string;
}
```

### 9. Domain event outbox

```ts
export interface DomainEventEnvelope<TData = unknown> {
  id: DomainEventId;
  tenantOrgId: TenantOrgId;
  buildId?: BuildId;

  type: string;
  version: string;
  occurredAt: ISODateTime;

  actor: {
    type: 'user' | 'system';
    userId?: UserId;
  };

  data: TData;
  deliveryState: 'pending' | 'published' | 'failed';
  correlationId: string;
}
```

```sql
create table domain_event_outbox (
  id uuid primary key,
  tenant_org_id uuid not null references tenant_orgs(id),
  build_id uuid,
  type text not null,
  version text not null,
  occurred_at timestamptz not null default now(),
  actor jsonb not null,
  data jsonb not null,
  delivery_state text not null default 'pending',
  delivery_attempts integer not null default 0,
  last_delivery_error text,
  correlation_id uuid not null
);
```

### 10. Policy base contract

```ts
export interface PolicyVersionBase {
  id: PolicyVersionId;
  tenantOrgId: TenantOrgId;
  policyType:
    | 'reimbursement'
    | 'evidence'
    | 'site_visit'
    | 'draw_fee'
    | 'interest_estimate'
    | 'draw_release';
  version: number;
  status: 'draft' | 'active' | 'retired';
  effectiveFrom: ISODateTime;
  effectiveTo?: ISODateTime;
  createdByUserId: UserId;
  createdAt: ISODateTime;
}
```

### 11. Foundation test matrix

| Test | Expected |
|---|---|
| Cross-tenant transition | Rejected. |
| Missing build grant | Rejected. |
| Invalid event from state | Rejected. |
| Guard fails | Rejected with guard reason. |
| Stale aggregate version | Rejected. |
| Duplicate idempotency key/same payload | Same result or no-op success. |
| Duplicate idempotency key/different payload | Conflict. |
| Successful transition | Domain mutation, lifecycle, audit, outbox committed atomically. |
| Transaction rollback | No partial audit/outbox rows. |
| Outbox publish failure | Mutation remains committed; event is retryable. |

### 12. Non-obvious implementation rules

1. Do not let XState actions write critical durable state.
2. Do not rely on UI state for security or transition validity.
3. Do not store money in floating-point types.
4. Do not expose raw storage keys to clients.
5. Do not include evidence URLs or internal notes in webhook payloads.
6. Do not make policy changes retroactively alter historical decisions.
7. Do not build an admin workflow editor in MVP.


---

<!-- Source: 02_Proposal_Building_Activation.md -->


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


---

<!-- Source: 03_Draw_Planning_Engine.md -->


# Vertical 03 — Draw Planning Engine

## I. Actual agile epic / Linear project

### Objective

Build a deterministic Draw Planning Engine that produces explainable recommended starting draw plans from milestone approved values, dependencies, schedule assumptions, working-capital constraints, draw fee policy, and compound interest estimate policy.

The engine should be professional and testable. It should not claim perfect real-world optimization. Builders have unique circumstances DrawFlow will not fully know.

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


---

<!-- Source: 04_Build_Workspace_Timeline.md -->


# Vertical 04 — Build Workspace and Timeline

## I. Actual agile epic / Linear project

### Objective

Build the shared Build Workspace: the central role-aware operational control plane showing approved baseline, active forecast/actual reality, milestone states, draw groups, schedule slippage, evidence/verification status, and next actions.

The workspace should be the primary context surface, but not a god-screen. Action-specific workflows should open focused drawers/panels.

### In scope

- Workspace route/shell.
- Build header/summary.
- Gantt/timeline view.
- Approved baseline vs active forecast/actual state.
- Milestone rail/list.
- Draw group visualization.
- Behind-schedule/scary-state visualization.
- Role-aware action panel/drawers.
- Workspace projection consumption.
- Warning/status model.
- Stubbed action entry points for unbuilt verticals.

### Out of scope

- Native mobile app.
- Full construction PM.
- Resource-leveling.
- Complex dependency graph editor in active builds.
- Dragging active approved baseline dates.
- MIC portal UI itself.

### Definition of done

1. Workspace renders from `BuildWorkspaceProjection`.
2. Builder, lender admin, verifier, site visitor, MIC observer have role-appropriate fields/actions.
3. Approved baseline is visually distinct from forecast/actual state.
4. Behind-schedule milestones are visually urgent at a glance.
5. Active Gantt date changes dispatch forecast commands, never baseline mutation.
6. Draw group eligibility/release status is visible.
7. Clicking a milestone opens a focused drawer/panel.
8. Workspace can operate with stubs for claim, verification, site visit, and release actions.

---

## II. PRD for this vertical

### Context

The Build Workspace should answer:

- what was approved,
- what is actually happening,
- what is late,
- what is blocked,
- what evidence/verification is pending,
- what draw money is eligible or nearly eligible,
- what action is required next.

### Requirements

#### Workspace projection

The UI consumes a canonical read model instead of reconstructing raw domain state. This same projection powers the MIC portal API.

#### Approved vs forecast/actual

The workspace must distinguish:

- approved baseline start/end dates,
- forecast start/end dates,
- actual completion approval date,
- draw release dates.

Active build schedule drift updates forecast/actual reality. It does not mutate approved baseline.

#### Behind-schedule visualization

Behind-schedule Gantt cards should look alarming. The requirement is functional: anyone looking at the workspace should immediately see when something is late. Do not rely only on subtle color; use severity badges, warning rails, icons, timeline overrun, and text.

#### Draw group visibility

Draw groups are shown as milestone groupings/overlays with:

- included milestones,
- approved total,
- eligible total,
- readiness state,
- release approval state,
- manual release recorded state.

#### Role-aware actions

Builder sees claim completion actions. Verifier sees evidence review/request-site-visit actions. Admin sees completion approval and draw-release actions. MIC observer sees read-only status/evidence.

### Handoffs

| Handoff | From | To |
|---|---|---|
| `BuildWorkspaceProjection` | Projection service | Workspace UI + MIC API |
| Forecast command | Workspace UI | Revisions/Forecast vertical |
| Claim action | Workspace UI | Completion Claims vertical |
| Verify action | Workspace UI | Verification vertical |
| Draw release action | Workspace UI | Draw Release vertical |

---

## III. Spec

### 1. Workspace projection

```ts
export interface BuildWorkspaceProjection {
  id: Id<'BuildWorkspaceProjection'>;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;

  projectionVersion: number;
  updatedAt: ISODateTime;

  currentUserView?: WorkspaceViewContext;

  buildSummary: BuildSummaryDTO;
  approvedPlan: ApprovedPlanSummaryDTO;
  timeline: WorkspaceTimelineDTO;
  milestones: WorkspaceMilestoneDTO[];
  dependencies: WorkspaceDependencyDTO[];
  drawGroups: WorkspaceDrawGroupDTO[];
  completionClaims: WorkspaceCompletionClaimDTO[];
  siteVisits: WorkspaceSiteVisitDTO[];
  drawReleases: WorkspaceDrawReleaseDTO[];
  evidenceAssets: WorkspaceEvidenceAssetDTO[];
  warnings: WorkspaceWarningDTO[];
  availableActions: WorkspaceActionDTO[];
}
```

### 2. View context and redaction

```ts
export interface WorkspaceViewContext {
  userId?: UserId;
  role:
    | 'builder_principal'
    | 'builder_staff'
    | 'lender_admin'
    | 'lender_verifier'
    | 'site_visitor'
    | 'mic_observer'
    | 'platform_admin';
  redactions: WorkspaceRedaction[];
}

export type WorkspaceRedaction =
  | 'hide_interest_estimates'
  | 'hide_draw_fees'
  | 'hide_internal_notes'
  | 'hide_unapproved_evidence'
  | 'hide_financial_amounts';
```

### 3. Timeline and milestone DTO

```ts
export interface WorkspaceTimelineDTO {
  approvedStartDate: ISODate;
  approvedEndDate: ISODate;
  forecastStartDate?: ISODate;
  forecastEndDate?: ISODate;
  today: ISODate;
  scheduleHealth: 'on_track' | 'at_risk' | 'behind' | 'critical';
}

export interface WorkspaceMilestoneDTO {
  id: MilestoneId;
  name: string;
  category?: string;

  approvedValueCents?: MoneyCents;
  eligibleValueCents?: MoneyCents;

  approvedStartDate: ISODate;
  approvedEndDate: ISODate;

  forecastStartDate?: ISODate;
  forecastEndDate?: ISODate;
  actualCompletionApprovedAt?: ISODateTime;

  scheduleStatus:
    | 'not_started'
    | 'on_track'
    | 'at_risk'
    | 'behind'
    | 'critical'
    | 'complete';

  completionState:
    | 'not_claimed'
    | 'claim_in_review'
    | 'more_info_requested'
    | 'pending_site_visit'
    | 'completion_approved'
    | 'completion_rejected';

  currentCompletionClaimId?: CompletionClaimId;
  approvedCompletionClaimId?: CompletionClaimId;

  evidenceSummary: {
    requiredCount: number;
    submittedCount: number;
    acceptedCount?: number;
  };

  drawGroupId?: DrawGroupId;
}
```

### 4. Draw group DTO

```ts
export interface WorkspaceDrawGroupDTO {
  id: DrawGroupId;
  sequence: number;
  milestoneIds: MilestoneId[];

  approvedTotalCents: MoneyCents;
  eligibleTotalCents: MoneyCents;
  requestedReleaseTotalCents?: MoneyCents;

  status:
    | 'not_ready'
    | 'partially_ready'
    | 'ready_for_release_review'
    | 'release_approved'
    | 'release_recorded';

  drawReleaseId?: DrawReleaseId;
  plannedReleaseDate?: ISODate;
  approvedReleaseAt?: ISODateTime;
  recordedReleasedAt?: ISODateTime;
}
```

### 5. Warning model

```ts
export interface WorkspaceWarningDTO {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  code:
    | 'MILESTONE_BEHIND_SCHEDULE'
    | 'DRAW_GROUP_BLOCKED'
    | 'EVIDENCE_MISSING'
    | 'SITE_VISIT_PENDING'
    | 'CLAIM_AWAITING_VERIFICATION'
    | 'DRAW_READY_NOT_RELEASED'
    | 'POLICY_EXCEPTION'
    | 'FORECAST_EXCEEDS_BASELINE';
  message: string;
  relatedMilestoneIds?: MilestoneId[];
  relatedDrawGroupIds?: DrawGroupId[];
  relatedClaimIds?: CompletionClaimId[];
}
```

### 6. Available actions

```ts
export interface WorkspaceActionDTO {
  id: string;
  label: string;
  command:
    | 'OPEN_COMPLETION_CLAIM_DRAWER'
    | 'OPEN_VERIFICATION_DRAWER'
    | 'OPEN_SITE_VISIT_DRAWER'
    | 'OPEN_DRAW_RELEASE_DRAWER'
    | 'OPEN_FORECAST_EDIT_DRAWER'
    | 'OPEN_CHAT';
  entityType: string;
  entityId: string;
  enabled: boolean;
  disabledReason?: string;
}
```

### 7. UX flows

#### Builder claims completion

```text
1. Builder opens workspace.
2. Milestone card shows Claim Completion.
3. Builder opens claim drawer.
4. Completion Claims vertical owns upload/submission.
5. Workspace projection updates to claim_in_review.
```

#### Schedule goes behind

```text
1. Forecast end date exceeds approved baseline or today passes approved end.
2. Projection marks milestone behind/critical.
3. Gantt renders overrun and severity.
4. Warning rail explains baseline vs forecast/actual slippage.
```

#### Admin approves draw release

```text
1. Draw group overlay shows ready_for_release_review.
2. Admin opens release drawer.
3. Draw Release vertical owns approval/recording.
4. Projection updates release status.
```

### 8. Projection update triggers

```text
build.activated
milestone.forecast_updated
completion_claim.submitted
completion_claim.more_info_requested
completion_claim.approved
completion_claim.rejected
site_visit.requested
site_visit.submitted
draw_group.ready_for_release
draw_release.approved
draw_release.recorded
revision.applied
```

### 9. Tests

| Test | Expected |
|---|---|
| Builder view | No internal notes; claim action available where allowed. |
| Verifier view | Evidence/review actions visible; no release approval. |
| Admin view | Completion/release actions visible. |
| MIC observer | Read-only; internal/rejected evidence hidden. |
| Behind schedule | Warning and visual severity present. |
| Active Gantt edit | Forecast command emitted, baseline unchanged. |


---

<!-- Source: 05_Completion_Claims_Evidence.md -->


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


---

<!-- Source: 06_Verification_Site_Visits.md -->


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


---

<!-- Source: 07_Draw_Release_Manual_Recording.md -->


# Vertical 07 — Draw Release Approval and Manual Recording

## I. Actual agile epic / Linear project

### Objective

Build the draw release vertical that turns approved milestone completions into draw-group eligibility, lets an admin separately approve draw release, and lets an admin manually record that the draw was released outside DrawFlow.

DrawFlow does not move money. It records workflow decisions and manual release status.

### In scope

- Draw group readiness calculation.
- Eligible amount calculation using approved completion amounts.
- Admin release approval.
- Manual release recording.
- External reference and notes.
- Correction flow for mistaken release records.
- Audit and events.
- Workspace/MIC projection updates.

### Out of scope

- Payment rails.
- Ledger/accounting truth.
- Actual servicing accrual.
- Builder receipt confirmation.
- Double confirmation.
- Automatic bank/payment integration.

### Definition of done

1. Draw group becomes ready only when included milestones have approved completion.
2. Draw group eligible amount uses approved completion eligible amounts, including builder-requested lower draw amounts.
3. Admin can approve release separately from completion approval.
4. Admin can manually record release with release date, amount, optional reference, and notes.
5. System language never implies authoritative payment execution.
6. Correction flow exists for wrong manual release records.
7. Approval, recording, and correction emit audit/domain events.
8. Tests cover blocked draw group, lower requested amount, approval, recording, correction, and unauthorized access.

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


---

<!-- Source: 08_Policy_Financial_Estimates.md -->


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


---

<!-- Source: 09_MIC_Read_API_Webhooks.md -->


# Vertical 09 — MIC Read API and Webhooks

## I. Actual agile epic / Linear project

### Objective

Build the integration vertical required for another FairLend product/MIC portal to display build status, Gantt/workspace state, draw status, documents/images, and lifecycle events. MVP API is read-only, but the architecture must not block future full CRUD API.

### In scope

- Canonical workspace projection API.
- MIC observer grant authorization.
- Portal-safe evidence visibility.
- Short-lived signed evidence access URLs.
- Build event timeline read API.
- Webhook endpoint registry.
- Event subscription config.
- Signed webhook delivery.
- Retry/delivery log.
- `workspace_projection.updated` event for downstream refresh.

### Out of scope

- Public write API.
- Developer portal.
- API-key self-service UI unless trivial.
- Raw evidence URLs in webhook payloads.
- Internal review notes exposed by default.
- Rejected claims/evidence exposed by default.

### Definition of done

1. MIC portal can call read-only workspace endpoint for authorized build.
2. MIC portal can render milestone/draw/timeline state from projection without reproducing domain logic.
3. MIC portal can request short-lived signed URL for portal-visible evidence.
4. Unauthorized observer cannot access build or evidence.
5. Webhook endpoint can subscribe to selected events.
6. Webhooks are signed, retried, and logged.
7. `workspace_projection.updated` lets downstream product refetch state.
8. Tests cover authorization, redaction, signed URL behavior, webhook retry, and idempotency.

---

## II. PRD for this vertical

### Context

The MIC portal integration is required for MVP. Another product must show build status and a similar Gantt/workspace view. DrawFlow therefore needs a stable read model early.

The read API exposes canonical projections, not raw tables. The MIC portal should not reconstruct DrawFlow domain logic.

### Requirements

#### Read-only API

MVP external API is read-only. Future CRUD architecture should remain possible, but future write operations must route through governed transition commands.

#### Evidence visibility

Start conservative.

MIC users can see:

- build summary,
- approved/forecast milestone status,
- draw group/release status,
- portal-visible evidence assets,
- approved completion evidence if explicitly visible.

MIC users should not see by default:

- internal reviewer notes,
- rejected/raw evidence packages,
- admin override notes,
- lender-only policy config,
- full chat,
- unapproved claims.

#### Webhooks

Webhooks are domain-event driven through outbox delivery. The most useful event is `workspace_projection.updated`, because downstream systems can refetch canonical state.

### Handoffs

| Handoff | From | To |
|---|---|---|
| Projection dirty events | Foundation/Workspace | Projection rebuild |
| Workspace API | MIC portal | `BuildWorkspaceProjection` |
| Evidence access | Evidence vertical | Signed URL endpoint |
| Domain events | Foundation outbox | Webhook delivery |

---

## III. Spec

### 1. Read-only endpoints

```http
GET /api/v1/builds/:buildId/workspace
GET /api/v1/builds/:buildId/events
GET /api/v1/builds/:buildId/evidence-assets
GET /api/v1/evidence-assets/:assetId/access-url
GET /api/v1/builds/:buildId/draw-releases
GET /api/v1/builds/:buildId/milestones
```

### 2. Authorization

```ts
export async function canReadWorkspace(params: {
  actorUserId?: UserId;
  externalObserverOrgId?: string;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;
  requestedAccessLevel: ObserverAccessLevel;
}): Promise<boolean> {
  if (params.actorUserId) {
    return hasBuildPermission(params.actorUserId, params.buildId, 'build.view_workspace');
  }

  if (params.externalObserverOrgId) {
    return hasActiveObserverGrant({
      buildId: params.buildId,
      observerOrgExternalId: params.externalObserverOrgId,
      accessLevel: params.requestedAccessLevel,
    });
  }

  return false;
}
```

### 3. Evidence descriptor DTO

```ts
export interface EvidenceAssetDescriptorDTO {
  id: EvidenceAssetId;
  buildId: BuildId;
  milestoneId?: MilestoneId;
  completionClaimId?: CompletionClaimId;
  siteVisitId?: SiteVisitId;

  fileName: string;
  mimeType: string;
  sizeBytes: number;

  uploadedAt: ISODateTime;
  uploadedByDisplayName: string;

  source:
    | 'builder_upload'
    | 'builder_staff_upload'
    | 'site_visit_upload'
    | 'admin_upload';

  purpose:
    | 'completion_verification'
    | 'site_visit'
    | 'cost_support'
    | 'admin_internal';

  visibility:
    | 'builder_and_lender'
    | 'lender_internal'
    | 'mic_portal_visible'
    | 'admin_only';

  access: {
    method: 'signed_url';
    accessUrlEndpoint: string;
    expiresInSeconds: number;
  };
}
```

### 4. Evidence access flow

```text
1. Caller requests /evidence-assets/:assetId/access-url.
2. Server loads asset.
3. Server verifies tenant/build/observer grant.
4. Server verifies asset visibility is allowed for caller.
5. Server returns short-lived signed URL.
6. Server audits evidence access if policy requires it.
```

Never return raw storage keys.

### 5. Webhook endpoint and delivery

```ts
export interface WebhookEndpoint {
  id: Id<'WebhookEndpoint'>;
  tenantOrgId: TenantOrgId;
  url: string;
  description?: string;
  status: 'active' | 'disabled';
  secretRef: string;
  subscribedEventTypes: string[];
  createdByUserId: UserId;
  createdAt: ISODateTime;
}

export interface WebhookDelivery {
  id: Id<'WebhookDelivery'>;
  tenantOrgId: TenantOrgId;
  webhookEndpointId: Id<'WebhookEndpoint'>;
  domainEventId: DomainEventId;

  status: 'pending' | 'delivered' | 'failed' | 'abandoned';
  attemptCount: number;
  nextAttemptAt?: ISODateTime;
  lastAttemptAt?: ISODateTime;
  lastStatusCode?: number;
  lastError?: string;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
```

### 6. Webhook event envelope

```json
{
  "id": "evt_...",
  "type": "workspace_projection.updated",
  "version": "2026-05-08",
  "tenant_org_id": "org_...",
  "build_id": "bld_...",
  "occurred_at": "2026-05-08T14:30:00Z",
  "actor": {
    "type": "user",
    "user_id": "usr_..."
  },
  "data": {
    "projection_version": 42
  }
}
```

### 7. Webhook signing

Recommended headers:

```text
DrawFlow-Event-Id: evt_...
DrawFlow-Timestamp: 2026-05-08T14:30:00Z
DrawFlow-Signature: v1=<hmac_sha256>
```

Signature base string:

```text
<timestamp>.<raw_body>
```

### 8. Events exposed in MVP

```text
workspace_projection.updated
build.activated
completion_claim.submitted
milestone_completion.approved
milestone_completion.rejected
site_visit.requested
site_visit.submitted
draw_group.ready_for_release
draw_release.approved
draw_release.recorded
```

### 9. Redaction matrix

| Caller | Evidence | Financials | Notes |
|---|---|---|---|
| Builder principal | Builder/lender-visible | Builder-facing | No internal notes |
| Builder staff | Assigned/allowed | Limited/redacted | No internal notes |
| Lender admin | Full tenant/build | Full | Full except platform-only |
| Verifier | Review-relevant | Permission-dependent | Review notes |
| MIC observer | Portal-visible only | Observer-grant dependent | No internal notes |
| Platform admin | Support access | As permitted | Fully audited |

### 10. Tests

| Test | Expected |
|---|---|
| MIC without grant | 403. |
| MIC summary grant | No evidence URLs; limited financials. |
| MIC evidence grant | Portal-visible descriptors only. |
| Rejected evidence | Hidden by default. |
| Signed URL for lender-internal asset by MIC | 403. |
| Webhook receives 500 | Retry scheduled. |
| Duplicate delivery | Same event ID; receiver can dedupe. |
| Disabled endpoint | No delivery created. |


---

<!-- Source: 10_Revisions_Forecasts_Corrections.md -->


# Vertical 10 — Revisions, Forecasts, and Corrections

## I. Actual agile epic / Linear project

### Objective

Build the minimal versioning/revision model that protects approved baselines while allowing active-build reality to change. The system must distinguish approved plan, forecast schedule, actual completion, and auditable corrections.

This area needs further product refinement. The minimal baseline/forecast split is required for MVP; full material revision workflow can be thin.

### In scope

- Approved baseline vs forecast/actual model.
- Forecast date updates for active builds.
- Schedule slippage calculation.
- Warning severity for behind-schedule milestones.
- Correction events for erroneous manual records.
- Minimal admin-only material revision model.
- Versioned budget/roadmap/draw plan references.

### Out of scope

- Full collaborative change-order system.
- Contractor change management.
- Overrun financing.
- Full policy-driven revision approval matrix.
- Complex dependency rewrite UX.
- Automatic re-optimization after every change unless explicitly invoked.

### Definition of done

1. Active-build Gantt/forecast updates never mutate approved baseline dates.
2. Forecast schedule can be updated through governed command.
3. Behind-schedule status is computed from approved baseline vs forecast/actual.
4. Material changes have admin-only revision/correction path or are explicitly blocked.
5. Manual release correction is auditable.
6. Tests prove approved baseline immutability.

---

## II. PRD for this vertical

### Context

After activation, reality will diverge from the approved plan. The product needs a simple but rigorous model:

```text
Approved baseline = what lender approved.
Forecast = current best expectation.
Actual = recorded completion/release facts.
Revision = controlled change to approved baseline.
Correction = auditable fix to erroneous recorded fact.
```

### Requirements

#### Approved baseline immutability

Once a proposal is activated, approved baseline versions cannot be edited directly.

#### Forecast changes

In active Build mode, date shifts update forecast/actual reality. Gantt bars may grow or slip when the build goes behind schedule. Behind schedule must look alarming in workspace.

#### Material revisions

Changes affecting money, dependencies, or draw eligibility require controlled revision or admin-only action.

Examples:

- milestone approved value changes,
- milestone added/removed,
- dependency changed,
- draw group membership changed,
- approved draw amount changed.

#### Overruns

Budget overruns are not reimbursed. Approved amount is the cap. If builder needs more capital, that is handled outside DrawFlow v1.

#### Under-budget / lower draw

Handled through completion claim requested lower draw amount and release approval amount.

### Handoffs

| Handoff | From | To |
|---|---|---|
| Forecast updates | Workspace UI | Forecast command |
| Slippage warnings | Forecast service | Workspace projection |
| Material revision applied | Revision service | Proposal/Planning/Workspace/MIC |
| Corrections | Draw Release/Verification | Audit/projection |

---

## III. Spec

### 1. Schedule state

```ts
export interface MilestoneScheduleState {
  tenantOrgId: TenantOrgId;
  buildId: BuildId;
  milestoneId: MilestoneId;

  approvedStartDate: ISODate;
  approvedEndDate: ISODate;

  forecastStartDate?: ISODate;
  forecastEndDate?: ISODate;

  actualStartedAt?: ISODateTime;
  actualCompletionApprovedAt?: ISODateTime;

  scheduleStatus:
    | 'not_started'
    | 'on_track'
    | 'at_risk'
    | 'behind'
    | 'critical'
    | 'complete';

  updatedAt: ISODateTime;
}
```

### 2. Forecast update command

```ts
export interface UpdateMilestoneForecastCommand {
  tenantOrgId: TenantOrgId;
  actorUserId: UserId;
  buildId: BuildId;
  milestoneId: MilestoneId;

  forecastStartDate?: ISODate;
  forecastEndDate?: ISODate;

  reason?: string;
  correlationId: string;
}
```

Rules:

```text
- User must have milestone.update_forecast.
- Forecast end cannot be before forecast start.
- Approved baseline remains unchanged.
- Forecast change emits audit and workspace_projection.updated.
```

### 3. Slippage calculation

```ts
export function computeScheduleStatus(params: {
  today: ISODate;
  approvedEndDate: ISODate;
  forecastEndDate?: ISODate;
  actualCompletionApprovedAt?: ISODateTime;
}): MilestoneScheduleState['scheduleStatus'] {
  if (params.actualCompletionApprovedAt) return 'complete';

  const effectiveEnd = params.forecastEndDate ?? params.approvedEndDate;
  const daysLate = diffDays(effectiveEnd, params.approvedEndDate);
  const daysPastApprovedEnd = diffDays(params.today, params.approvedEndDate);

  if (daysLate >= 30 || daysPastApprovedEnd >= 14) return 'critical';
  if (daysLate >= 14 || daysPastApprovedEnd >= 7) return 'behind';
  if (daysLate > 0 || daysPastApprovedEnd > 0) return 'at_risk';
  return 'on_track';
}
```

Thresholds are placeholders and can become policy-configurable later.

### 4. Revision model

```ts
export type RevisionType =
  | 'budget_revision'
  | 'roadmap_revision'
  | 'draw_plan_revision'
  | 'combined_plan_revision'
  | 'correction';

export interface RevisionRequest {
  id: Id<'RevisionRequest'>;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;

  type: RevisionType;

  status:
    | 'draft'
    | 'submitted'
    | 'approved'
    | 'rejected'
    | 'applied'
    | 'cancelled';

  basePlanVersionSetId: Id<'ApprovedPlanVersionSet'>;
  proposedPlanVersionSetId?: Id<'ApprovedPlanVersionSet'>;

  requestedByUserId: UserId;
  approvedByUserId?: UserId;

  reason: string;
  createdAt: ISODateTime;
  approvedAt?: ISODateTime;
  appliedAt?: ISODateTime;

  aggregateVersion: number;
}
```

### 5. Revision machine

```ts
import { createMachine } from 'xstate';

export const revisionRequestMachine = createMachine({
  id: 'revisionRequest',
  initial: 'draft',
  states: {
    draft: {
      on: {
        SUBMIT: { target: 'submitted', guard: 'revisionHasReasonAndDiff' },
        CANCEL: 'cancelled',
      },
    },
    submitted: {
      on: {
        APPROVE: { target: 'approved', guard: 'actorCanApproveRevision' },
        REJECT: 'rejected',
        CANCEL: 'cancelled',
      },
    },
    approved: {
      on: {
        APPLY: { target: 'applied', guard: 'proposedVersionSetValid' },
      },
    },
    applied: { type: 'final' },
    rejected: { type: 'final' },
    cancelled: { type: 'final' },
  },
});
```

### 6. MVP material change policy

| Change | MVP handling |
|---|---|
| Forecast start/end date | Allowed through forecast command. |
| Progress notes | Allowed. |
| Evidence upload | Allowed through claim/evidence vertical. |
| Approved milestone value | Requires admin revision or out of scope. |
| Dependency change | Requires admin revision or out of scope. |
| Draw group membership | Requires admin revision. |
| Milestone add/delete | Requires admin revision or defer. |
| Completed milestone reversal | Correction/reversal flow; no silent edit. |
| Manual release record error | Draw release correction flow. |

### 7. UX flows

#### Build slips behind schedule

```text
1. User updates forecast end date or time passes beyond approved end.
2. Forecast service computes behind/critical status.
3. Workspace Gantt shows alarming overrun.
4. Warning rail explains baseline vs forecast/actual slippage.
5. MIC projection can expose schedule status.
```

#### Material revision

```text
1. Admin opens revision action.
2. Selects revision type.
3. Provides reason.
4. Creates proposed version set or targeted diff.
5. Approves and applies.
6. New approved baseline version set becomes active.
7. Old approvals remain tied to old baseline version.
```

### 8. Events

```text
milestone.forecast_updated
milestone.schedule_status_changed
revision.submitted
revision.approved
revision.applied
manual_record.corrected
workspace_projection.updated
```

### 9. Tests

| Test | Expected |
|---|---|
| Forecast update | Approved baseline unchanged. |
| Forecast end before start | Rejected. |
| Time beyond approved end | Status at_risk/behind/critical. |
| Direct approved value edit | Forbidden. |
| Revision applied | New version active; old history preserved. |
| Correction without reason | Rejected. |


---

<!-- Source: 11_Ops_Queues_Notifications_Chat.md -->


# Vertical 11 — Operations Queues, Notifications, and Chat

## I. Actual agile epic / Linear project

### Objective

Build the operational convenience layer: work queues, optional kanban visualization, notifications, and chat/comments. These features improve usability but must not become authoritative workflow state.

### In scope

- Work item / work order projection.
- Queue/table view for lender operations.
- Optional kanban presentation.
- Notifications for required actions.
- Chat/comment implementation reuse.
- Entity-scoped chat threads.
- Chat attachments as ordinary attachments unless promoted to evidence.

### Out of scope

- Drag/drop state mutation bypassing governed transitions.
- Chat-driven approvals.
- Chat as audit replacement.
- Complex SLA automation.
- Analytics dashboard.
- Contractor work orders.

### Definition of done

1. Submitted claims, site visits, and ready draw releases appear as work items.
2. Queue filters by type/status/assignee/build.
3. Kanban, if used, is visual only; final state transitions invoke governed actions.
4. Notifications are emitted from domain events.
5. Chat can be scoped to Build/milestone/claim/draw release.
6. Chat messages do not change workflow state.
7. Chat attachments are not evidence unless explicitly promoted to `EvidenceAsset`.
8. Tests cover queue projection updates, notification triggers, and chat/evidence separation.

---

## II. PRD for this vertical

### Context

Lender operations needs a way to see what needs attention. Kanban can be a nice visualization, but the domain object is a work item/work order, not a kanban card. Workflow transitions must go through the governed transition service.

Chat is a convenience feature. It should improve collaboration without weakening decision provenance.

### Requirements

#### Work queues

Work items should be created/projected from domain state:

- completion claim needs review,
- more info requested,
- site visit requested/assigned/submitted,
- completion ready for decision,
- draw group ready for release,
- manual release awaiting record,
- revision awaiting approval.

#### Kanban visualization

If implemented, kanban columns map to work item statuses. Dragging should be disabled or should open an action modal that invokes the proper governed transition.

#### Notifications

Notifications should be event-driven:

- builder notified when more info requested,
- verifier notified when claim submitted,
- site visitor notified when assigned,
- admin notified when draw ready,
- downstream MIC/webhook refresh handled separately.

#### Chat

Chat is communication, not state.

Rules:

- “Looks good” in chat is not approval.
- Attachments in chat are not evidence until promoted.
- Important decisions use state-changing controls tied to transition commands.
- Chat is entity-scoped.

### Handoffs

| Handoff | From | To |
|---|---|---|
| Domain events | Foundation | Queue/notification projection |
| Work item actions | Queue UI | Module transition endpoints |
| Chat attachment promotion | Chat | Evidence vertical |

---

## III. Spec

### 1. Work item model

```ts
export type WorkItemType =
  | 'completion_claim_review'
  | 'more_info_response'
  | 'site_visit'
  | 'completion_decision'
  | 'draw_release_approval'
  | 'manual_release_recording'
  | 'revision_approval';

export type WorkItemStatus =
  | 'open'
  | 'claimed'
  | 'blocked'
  | 'waiting_on_builder'
  | 'waiting_on_site_visit'
  | 'ready_for_admin'
  | 'closed';

export interface WorkItem {
  id: Id<'WorkItem'>;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;

  type: WorkItemType;
  status: WorkItemStatus;

  entityType: string;
  entityId: string;

  title: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';

  assignedToUserId?: UserId;
  dueAt?: ISODateTime;

  createdFromDomainEventId: DomainEventId;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  closedAt?: ISODateTime;
}
```

### 2. Queue projection rules

```text
completion_claim.submitted -> create completion_claim_review work item
completion_claim.more_info_requested -> create waiting_on_builder work item
completion_claim.more_info_submitted -> reopen/route review work item
site_visit.requested -> create site_visit work item
site_visit.assigned -> assign site_visit work item
site_visit.submitted -> close site_visit item; create/reopen completion_decision item
draw_group.ready_for_release -> create draw_release_approval item
draw_release.approved -> create manual_release_recording item
draw_release.recorded -> close release work items
revision.submitted -> create revision_approval item
```

### 3. Notification model

```ts
export interface Notification {
  id: Id<'Notification'>;
  tenantOrgId: TenantOrgId;
  recipientUserId: UserId;
  buildId?: BuildId;

  type:
    | 'claim_submitted'
    | 'more_info_requested'
    | 'site_visit_assigned'
    | 'completion_approved'
    | 'completion_rejected'
    | 'draw_ready_for_release'
    | 'draw_release_recorded';

  title: string;
  body: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  createdAt: ISODateTime;
  readAt?: ISODateTime;
}
```

### 4. Chat model

```ts
export interface ChatThread {
  id: Id<'ChatThread'>;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;

  scope:
    | { type: 'build'; buildId: BuildId }
    | { type: 'milestone'; milestoneId: MilestoneId }
    | { type: 'completion_claim'; completionClaimId: CompletionClaimId }
    | { type: 'draw_release'; drawReleaseId: DrawReleaseId };

  createdAt: ISODateTime;
}

export interface ChatMessage {
  id: Id<'ChatMessage'>;
  tenantOrgId: TenantOrgId;
  threadId: Id<'ChatThread'>;
  authorUserId: UserId;
  body: string;
  attachmentIds: Id<'ChatAttachment'>[];
  createdAt: ISODateTime;
  editedAt?: ISODateTime;
  deletedAt?: ISODateTime;
}

export interface ChatAttachment {
  id: Id<'ChatAttachment'>;
  tenantOrgId: TenantOrgId;
  uploadedByUserId: UserId;
  fileName: string;
  mimeType: string;
  storageKey: string;
  createdAt: ISODateTime;
  promotedEvidenceAssetId?: EvidenceAssetId;
}
```

### 5. Promotion to evidence

```ts
export interface PromoteChatAttachmentToEvidenceCommand {
  tenantOrgId: TenantOrgId;
  actorUserId: UserId;
  chatAttachmentId: Id<'ChatAttachment'>;
  buildId: BuildId;
  milestoneId?: MilestoneId;
  completionClaimId?: CompletionClaimId;
  purpose: 'completion_verification' | 'site_visit' | 'admin_internal';
  visibility: EvidenceAsset['visibility'];
  correlationId: string;
}
```

Promotion creates a real `EvidenceAsset` and emits `evidence_asset.created`. The chat attachment alone does not satisfy evidence requirements.

### 6. UX rules

```text
- Queue row/card has action buttons: Review, Request More Info, Request Site Visit, Approve Completion, Approve Release.
- Buttons call module transition endpoints.
- Kanban drag is disabled for final/status-changing transitions unless it opens the same action modal.
- Chat panel appears in build/milestone/claim context.
- Chat approvals are visually discouraged; state-changing actions use dedicated controls.
```

### 7. Events

```text
work_item.created
work_item.assigned
work_item.closed
notification.created
chat_message.created
chat_attachment.promoted_to_evidence
```

### 8. Tests

| Test | Expected |
|---|---|
| Claim submitted | Review work item created. |
| Site visit submitted | Site visit item closed; decision item created. |
| Drag card to approved | Not allowed without transition command. |
| Chat message says approved | No domain state change. |
| Chat attachment uploaded | Does not satisfy evidence requirement. |
| Chat attachment promoted | Evidence asset created and can satisfy requirement. |


---

<!-- Source: 12_Open_Questions_and_Decision_Log.md -->


# DrawFlow Open Questions and Decision Log

## Locked decisions

| Decision | Status |
|---|---|
| Offline sync | Scoped out of MVP. |
| Geofencing | Scoped out of MVP. |
| Verification model | Evidence-first, site visit discretionary. |
| Completion proof | Required for milestone completion claim. |
| Completion approval vs draw release | Decoupled. |
| Reimbursement basis | Approved milestone value. |
| Cost evidence | Not required for v1. |
| Overruns | Not reimbursed in v1; outside DrawFlow workflow. |
| Under-budget/lower draw | Builder can request lower draw amount; in MVP. |
| Financial authority | DrawFlow is workflow/CRM, not ledger/payment source of truth. |
| Fees | Not capitalized; do not compound. |
| Interest | Planning estimate only; compounds. |
| Timeline | Approved baseline separated from active forecast/actual. |
| Proposal Gantt drag | Allowed for draft planned dates. |
| Active Gantt mutation | Updates forecast/actual, not approved baseline. |
| Site visits | Discretionary/evidence-first by default. |
| MIC portal API | Required; read-only workspace projection. |
| Webhooks | Required; outbox/event-driven. |
| Chat | Convenience only; not workflow state. |
| White-label | Deferred. |
| Contractor registry/analytics | Deferred/stretch only. |

---

## Remaining open questions

### Interest and fees

1. Should compound interest be daily or monthly?
2. Should day-count basis be Actual/365 or Actual/360?
3. Does interest accrue from release date or day after release?
4. Is configured takeout/payoff date required, or can expected completion date always be fallback?
5. How are draw fees operationally paid or charged if not capitalized?
6. Should builder-facing UI show draw fees, interest estimates, both, or role-dependent visibility?

Recommended default:

```text
Daily compounding, Actual/365, configured takeout date preferred, fallback expected completion date, release-date accrual, fees shown separately and not capitalized.
```

### Verification authority

7. Which roles may verify milestone completion?
8. Is lender admin always allowed to verify directly?
9. Can lender verifier make final approval, or only recommendation, for all tenants?
10. Which roles may request site visits?
11. Which roles may waive a requested/required site visit?

Recommended default:

```text
Lender admin can verify. Lender verifier can verify if granted completion_claim.verify. Site visit waiver requires permission and reason.
```

### Site visit policy

12. Are any milestone categories policy-required for site visit at launch?
13. Should first draw or final draw require site visit?
14. Should high-value milestones require site visit above threshold?
15. Should MIC portal see site visit reports?

Recommended default:

```text
No required site visits at launch unless stakeholder demands it. Evidence-first discretionary. Site visit reports hidden from MIC unless marked portal-visible.
```

### Reimbursement / lower draw

16. Does builder request lower draw during completion claim, draw release, or both?
17. Can admin reduce the approved release below builder requested amount?
18. If builder requests lower amount, does the unrequested approved balance remain available later or become waived?
19. Can a builder later request remaining approved amount for the same completed milestone?

Recommended default:

```text
Capture requested lower amount at completion claim. Admin may approve lower with reason. Remaining approved amount handling needs stakeholder decision; simplest MVP treats lower request as the eligible amount for that claim/draw group and does not automatically preserve later balance unless a manual revision/adjustment exists.
```

This is one of the highest-impact open questions because it affects accounting semantics, UI copy, and draw group eligibility.

### Revisions and corrections

20. How much material revision workflow is needed in v1?
21. Can dependencies change after activation?
22. Can draw group membership change after activation?
23. Can a completed milestone be reopened?
24. Can a recorded draw release be corrected by superseding record only?
25. Should forecast changes require reason/comment?

Recommended default:

```text
Forecast changes allowed. Approved baseline immutable. Money/dependency/draw-group changes require admin-only revision or are deferred. Corrections require reason and audit event.
```

### MIC portal visibility

26. Can MIC users see unapproved completion claims?
27. Can MIC users see rejected evidence?
28. Can MIC users see internal reviewer/admin notes?
29. Can MIC users see financial amounts, fees, and interest estimates?
30. Should asset access be proxied through DrawFlow or direct signed URLs?

Recommended default:

```text
MIC sees approved/status summary and portal-visible evidence only. No internal notes and no rejected/raw evidence by default. Use short-lived signed URLs through DrawFlow authorization endpoint.
```

### Policy admin

31. Is there any self-serve policy UI in MVP?
32. Who can edit policy versions?
33. How are policy changes approved?
34. Are tenant policy changes support-managed initially?

Recommended default:

```text
Support-managed or minimal internal admin only. Rich self-serve policy editor deferred.
```

### API and future CRUD

35. What authentication method will MIC portal use to call DrawFlow API?
36. Are API clients tied to WorkOS organizations, internal service accounts, or separate integration credentials?
37. Which object IDs must be stable across products?
38. Should read-only API responses include external IDs for mapping?
39. What is the future CRUD API boundary, and which commands must remain governed transitions?

Recommended default:

```text
Use service-to-service auth or integration credentials mapped to observer grants. Include stable DrawFlow IDs and optional external IDs. Future CRUD commands must still route through transition service.
```

---

## Product risks to watch

1. **Lower draw amount ambiguity** — decide whether remaining approved capacity is preserved, waived, or manually recoverable.
2. **Policy drift** — policy snapshots must attach to decisions.
3. **Workspace complexity** — avoid embedding every workflow in one god screen.
4. **Webhook overexposure** — do not include sensitive evidence URLs or internal notes in webhook payloads.
5. **Chat ambiguity** — chat must not become informal approval state.
6. **Revision underdesign** — active build reality will diverge from approved plan; baseline/forecast split is mandatory.
7. **Financial wording** — avoid “disbursed” unless an external authoritative system confirmed it. Use “release approved” and “manual release recorded.”
8. **XState misuse** — state machines should govern transitions, but durable side effects belong in command handlers/outbox.
