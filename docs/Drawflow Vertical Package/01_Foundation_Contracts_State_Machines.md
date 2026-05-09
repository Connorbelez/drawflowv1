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
