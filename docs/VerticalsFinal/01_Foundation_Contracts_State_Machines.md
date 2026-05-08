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

### Technology alignment

This vertical defines the fundamental domain contracts and authorisation layer for DrawFlow.  All implementation must adhere to the core technology stack described in `AGENTS.md`:

- **Runtime:** Use Bun for package management and scripts.  All TypeScript code should be compiled and executed via `bun run` and never via node or npm.
- **Backend:** Persistence and workflows run on **Convex**.  Tables and documents are defined via the Convex schema builder and are strongly typed.  Domain mutations and actions must be implemented through the `fluent-convex` API.  Do not perform ad‑hoc writes against Convex or import `query`, `mutation` or `action` directly in feature code.
- **State machines:** DrawFlow uses **XState** to model workflow lifecycles.  The machines defined in this vertical should be pure state/transition definitions; durable side effects (DB writes, audit events, outbox) belong in command handlers executed via `fluent-convex` actions.  Do not embed direct persistence calls inside XState actions.
- **Auth:** All authentication and organisation resolution must use **WorkOS AuthKit**.  The server side uses `@convex-dev/workos-authkit` and the client uses `@workos/authkit-tanstack-react-start`.
- **Shared types:** Place all domain type definitions in a shared TypeScript package consumed by both the backend and the frontend.  Use the scalar/ID conventions defined below.

These notes supersede any legacy implementation guidance.  For example, any SQL shown in this document is for conceptual illustration only—the actual storage is implemented via Convex, not a relational database.

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

The following schema snippets illustrate the shape of core entities using SQL for readability.  **They are not intended to be executed directly.**  DrawFlow uses Convex as its persistence layer, so these tables will be implemented as Convex document types and indexes via the Convex schema builder.  Use `fluent-convex` to define and access these collections and to create secondary indexes where appropriate.

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

## IV. Screen and Component Manifest

The Foundation vertical owns the core application shell and route primitives.  It does not implement domain workflow UIs, but it provides the scaffolding on which other verticals register their routes.  Below is the screen and component manifest for Foundation, with mappings to the relevant requirements and use cases defined in the PRD and vertical objectives.

| Screen / Route | Components | Purpose & context | Requirements/use‑cases |
| --- | --- | --- | --- |
| **`LoginScreen`** (`/login`) | `AuthLayout`, `LoginCard`, `WorkOSLoginButton`, `AuthErrorBanner` | Entry point for unauthenticated users to begin the WorkOS auth flow.  Handles sign‑in and redirects already‑authenticated users away. | PRD: multi‑tenant auth; Foundation requirement to provide secure app shell.
| **`AuthCallbackScreen`** (`/auth/callback`) | `AuthLayout`, `FullPageSpinner`, `AuthCallbackErrorState` | Completes WorkOS OAuth callback, creates/updates local `UserIdentity`, resolves org memberships, and redirects to tenant selection or home. | PRD: WorkOS integration; Foundation requirement to materialise identity and resolve tenant context.
| **`TenantSelectScreen`** (`/select-org`) | `AuthLayout`, `TenantSelectCard`, `TenantOptionList`, `TenantStatusBadge` | Allows users with memberships in multiple WorkOS organisations to choose their active tenant.  Persists choice in session. | PRD: Multi‑tenant support; Foundation requirement for organisation scoping.
| **`UnauthorizedScreen` / `ForbiddenScreen`** (`/error/*`) | `ErrorLayout`, `AuthRetryButton` | Displayed when the user is unauthenticated or lacks permission.  Provides context and options to re‑authenticate. | PRD: RBAC enforcement; Foundation requirement for secure access boundaries.
| **`AppShell`** (`/app/:orgSlug/*`) | `AuthenticatedLayout`, `GlobalTopNav`, `TenantSwitcher`, `UserMenu`, `AppSidebar`, `BreadcrumbBar`, `PermissionBoundary`, `RouteErrorBoundary` | Provides the authenticated, tenant‑scoped container for all application routes.  Handles top‑level navigation, permission filtering, and error boundaries. | PRD: shared workspace as central surface; Foundation requirement to provide consistent shell for all verticals.
| **`OrgRootRedirectScreen`** (`/app/:orgSlug`) | `AppShell` | Redirects authenticated users to `/home` or last active route. | PRD: ease of navigation; Foundation objective to manage route entry.
| **Settings shells** (`/app/:orgSlug/settings/*`) | `SettingsRootScreen`, `AccessManagementShellScreen`, `DeveloperSettingsShellScreen` | Thin placeholders for organisation settings, access management, and developer/webhook settings.  Real functionality will be provided by later verticals (e.g., webhook registry). | PRD: Webhooks and MIC API; Policy admin; Foundation requirement to stub future admin UIs.

These screens use the shared components defined in this manifest.  Each component is permission‑aware and tenant‑aware, so they can be reused by later verticals without leaking security concerns.  Other verticals must register their own route modules and screens, but they should use these foundational components for consistent look, feel, and behaviour.

---

## V. Extended Foundation Contract and Reference

The Foundation vertical not only provides the initial shell screens, it establishes the contracts and patterns that all other verticals must follow.  This section summarises the routing philosophy, route‑module contract, core layouts, guard components, transition primitives, permission‑aware display components, and audit/event primitives as referenced in the detailed Pasted markdown document.  Later verticals consume these contracts rather than re‑implementing them.

### 5.1 What Foundation owns (and does not own)

Foundation owns the substrate for DrawFlow:

```text
Auth (WorkOS integration)
Tenant resolution and active‑org context
Application shell and navigation
Route guards and resource guards
Permission‑aware UI primitives
Transition command primitives and hooks
Audit/event display primitives
Shared component contracts and props
Shared route registration contracts
Standardised loading, error, and empty states
```

Foundation does **not** own business workflows such as proposal creation, planning, workspace timeline, completion claims, verification, draw release, policy editing, or MIC portal.  Those workflows plug into Foundation via the contracts below.

### 5.2 Global routing philosophy and hierarchy

Routing is hierarchical and tenant‑scoped.  The high‑level structure is:

```txt
/
├── /login
├── /auth/callback
├── /select-org
├── /app/:orgSlug
│   ├── /home
│   ├── /builds
│   ├── /builds/:buildId/*
│   ├── /settings/*
│   └── /admin/*
└── /error/*
```

Important principles:

* The `orgSlug` is a display alias; the backend always resolves `tenantOrgId` and validates membership/grants.  Never trust the URL slug alone.
* Do not encode workflow state in the route; derive state from domain objects.  For example, use `/app/acme/builds/bld_123/milestones/ms_1` rather than `/app/acme/builds/bld_123/milestones/ms_1/approved`.
* Build‑scoped screens should live under `/app/:orgSlug/builds/:buildId/*` and must acquire the build context via the `BuildScopedLayout`.

### 5.3 Route ownership and route module contract

Each vertical defines its own routes by exporting a `DrawFlowRouteModule`.  Foundation composes these modules into the top‑level router.

```ts
export interface DrawFlowRouteModule {
  verticalKey: string;
  routes: DrawFlowRouteDefinition[];
  navItems?: DrawFlowNavItem[];
}

export interface DrawFlowRouteDefinition {
  id: string;
  path: string;
  element: React.ReactNode;

  requiresAuth?: boolean;
  requiresTenant?: boolean;

  requiredPermissions?: DrawFlowPermission[];

  resourceScope?: {
    type: 'tenant' | 'build' | 'completion_claim' | 'site_visit' | 'draw_release';
    paramName?: string;
  };

  featureFlag?: string;

  handle?: {
    title?: string;
    breadcrumb?: BreadcrumbFactory;
    layout?: 'auth' | 'app' | 'build' | 'fullscreen' | 'mobile_field';
  };
}
```

Later verticals register modules like:

```ts
export const proposalRouteModule: DrawFlowRouteModule = {
  verticalKey: 'proposal_activation',
  routes: [
    {
      id: 'proposal_builder',
      path: '/app/:orgSlug/builds/:buildId/proposal',
      element: <ProposalBuilderScreen />,
      requiresAuth: true,
      requiresTenant: true,
      requiredPermissions: ['build.create_proposal'],
      resourceScope: {
        type: 'build',
        paramName: 'buildId',
      },
      handle: {
        title: 'Proposal Builder',
        layout: 'build',
      },
    },
  ],
};
```

### 5.4 Core layout components

Foundation provides layout primitives that other verticals reuse:

* **`AuthLayout`** – centered unauthenticated layout for `/login`, `/auth/callback`, and `/select-org`.  It has no tenant data and renders auth errors.
* **`AuthenticatedLayout`** – wraps `/app/:orgSlug/*` routes.  Resolves the active tenant context, renders global navigation (`GlobalTopNav`, `AppSidebar`, `TenantSwitcher`, `UserMenu`, `BreadcrumbBar`), installs a route error boundary, and provides toast providers.
* **`BuildScopedLayout`** – used for `/app/:orgSlug/builds/:buildId/*` routes.  Loads the build resource and build grants, checks access via `RequireBuildGrant`, renders build‑level breadcrumbs/nav, and provides the build context to children.

These layouts ensure that tenant and build context is available to nested components and that permission boundaries are enforced consistently.

### 5.5 Guard components

Guard components enforce authentication, tenancy, permissions, and resource grants at the component and route level:

* **`RequireAuth`** – route‑level guard.  Displays a spinner while loading; redirects unauthenticated users to `/login`; renders children for authenticated users.
* **`RequireTenant`** – route‑level guard requiring a valid tenant (`orgSlug`).  Unknown or inactive tenants result in a not‑found or forbidden state.
* **`RequirePermission`** – component‑level guard.  Renders children only if the user has the specified permissions (all or any).  Accepts a fallback element.
* **`RequireBuildGrant`** – build‑scoped guard.  Checks that the user has access to the specified `buildId` and optionally required permissions.  Used inside `BuildScopedLayout`.

These guards should wrap screens rather than performing ad‑hoc permission checks inside components.

### 5.6 Transition primitives

Workflow state transitions must be invoked through governed commands.  Foundation exposes primitives to standardise these interactions:

* **`GuardedTransitionButton`** – a button component that dispatches a transition command for a given entity type, entity ID, and event type.  It injects `tenantOrgId`, `actorUserId`, `correlationId`, and optionally `expectedAggregateVersion`.  It enforces required permissions, prompts for optional or required reasons, and displays appropriate error banners (`TransitionFailureBanner`) on failure.
* **`useTransitionCommand`** – a React hook that provides an `execute` function to dispatch arbitrary transition commands.  This is useful for custom forms such as manual release recording or revision submission.
* **`TransitionFailureBanner`** – displays error messages based on the `TransitionFailure` code (`UNAUTHENTICATED`, `FORBIDDEN`, `INVALID_EVENT`, `GUARD_REJECTED`, `STALE_AGGREGATE_VERSION`, etc.).  It suggests corrective actions (e.g. refresh data, check permissions).
* **`ReasonRequiredDialog`** – a shared modal that collects a reason for auditable overrides (waive site visit, reject claim, correct draw release, approve/reject revisions).  Components should use this rather than creating ad‑hoc reason modals.

### 5.7 Permission‑aware display components

Foundation includes components to hide, disable, or annotate UI based on permissions:

* **`PermissionGate`** – wraps content and either hides it, disables it, or renders a readonly view depending on the user’s permissions.  Supports requiring all or any of a set of permissions.
* **`PermissionPillList`** – displays a list of permission names as coloured pills; used in access management and debugging.
* **`RoleBadge`** – renders a badge for roles such as `builder_principal`, `builder_staff`, `lender_admin`, `lender_verifier`, `site_visitor`, or `platform_admin`.

### 5.8 Audit and event primitives

While full audit UX is out of scope for the Foundation vertical, it provides primitives to display audit trails and outbox health:

* **`AuditTrailPanel`** – given an `entityType` and `entityId`, fetches and renders an audit event list for that object.  Useful in detail screens across verticals (completion claims, draw releases, revisions, site visits).
* **`AuditEventRow`** – renders a single audit event with redaction modes (`internal`, `participant`, `observer`).
* **`OutboxHealthBadge`** – displays counts of pending and failed outbox entries; useful in an internal diagnostics screen.

### 5.9 Loading, error, and empty state primitives

Foundation standardises the UI for loading and error states:

* **`FullPageSpinner`** and **`InlineSpinner`** – used during async data loading.
* **`PageErrorState`**, **`RouteErrorBoundary`**, **`ForbiddenState`**, **`NotFoundState`**, **`StaleDataState`**, **`RetryableErrorState`** – provide consistent messaging for various error conditions.  These components should be used instead of hand‑rolled error displays.
* **`EmptyState`** – renders a friendly message when a list or table has no results.  It accepts a title, optional description, and optional primary/secondary actions (e.g. create new, refresh).

### 5.10 Usage by other verticals

All other verticals must register their routes via the route module contract defined above.  They should:

1. Define a `verticalKey` for their module.
2. Provide route definitions with paths matching the Foundation’s hierarchy (e.g. `/app/:orgSlug/builds/:buildId/claims/:completionClaimId`).
3. Specify required authentication, tenancy, permissions, and resource scope.  The router will automatically enforce `RequireAuth` and `RequireTenant`, and verticals may wrap screens with `RequirePermission` or `RequireBuildGrant` as needed.
4. Use the shared layouts (`AuthenticatedLayout`, `BuildScopedLayout`) and guard components rather than duplicating logic.
5. Use `GuardedTransitionButton` and `ReasonRequiredDialog` when invoking transitions, ensuring that state changes remain governed and auditable.

Adhering to these patterns ensures that every vertical fits cleanly into the overall architecture, shares a consistent look and feel, and respects security boundaries.  This extended reference should be considered the canonical guide for integrating new verticals into DrawFlow.

### 5.11 Foundation route manifest

For completeness, Foundation defines a small set of routes that make up the authenticated shell and unauthenticated entry points.  Later verticals should register their routes via the route module contract and nest them under the appropriate prefixes.  The tables below summarise these foundational routes and their purposes, as originally described in the Pasted markdown.

#### Public/auth routes

| Route | Screen | Owner | Purpose | Notes |
| --- | --- | --- | --- | --- |
| `/` | `RootRedirectScreen` | Foundation | Redirect authenticated users into their active tenant; send unauthenticated users to `/login`. | No business UI. |
| `/login` | `LoginScreen` | Foundation | Start WorkOS authentication flow. | Should be extremely simple. |
| `/auth/callback` | `AuthCallbackScreen` | Foundation | Complete WorkOS OAuth callback and establish a DrawFlow session. | Mostly loading/error states. |
| `/select-org` | `TenantSelectScreen` | Foundation | Let multi‑org users choose their active tenant. | Required if the user belongs to more than one org. |
| `/error/unauthorized` | `UnauthorizedScreen` | Foundation | Display when auth is required or the session is invalid. | Should provide a re‑login action. |
| `/error/forbidden` | `ForbiddenScreen` | Foundation | Display when the user lacks permission or resource grant. | Should show active org/user context for support and debugging. |
| `/error/not-found` | `NotFoundScreen` | Foundation | Show when a route is unknown or a resource is inaccessible (masked as not found). | Useful for tenant/resource isolation. |

#### Authenticated shell routes

| Route | Screen | Owner | Purpose | Notes |
| --- | --- | --- | --- | --- |
| `/app/:orgSlug` | `OrgRootRedirectScreen` | Foundation | Redirect to `/home` or the last active route within the tenant. | Must resolve tenant context first. |
| `/app/:orgSlug/home` | `HomeShellScreen` | Foundation initially; later verticals augment | Minimal authenticated landing shell until build list/queue surfaces are implemented. | Can be stubbed until builds or ops verticals land. |
| `/app/:orgSlug/builds` | `BuildsIndexShellScreen` | Foundation stub; later Proposal/Workspace verticals implement | Placeholder route for a build list. | Real build list can land with Proposal or Workspace vertical. |
| `/app/:orgSlug/settings` | `SettingsRootScreen` | Foundation | Settings shell redirect. | Minimal in MVP. |
| `/app/:orgSlug/settings/access` | `AccessManagementShellScreen` | Foundation stub | Show tenant users and build grants in a minimal support/admin way. | WorkOS manages roles; avoid overbuilding. |
| `/app/:orgSlug/settings/developer` | `DeveloperSettingsShellScreen` | Foundation stub; Webhook vertical later | Reserved for webhook and API settings. | Hidden unless the user has the appropriate permission. |
| `/app/:orgSlug/admin/diagnostics` | `DiagnosticsScreen` | Foundation/internal | Internal diagnostics surface for lifecycle, outbox, projection invalidation, and permission issues. | Platform/admin only; optional but useful. |

These tables do not cover domain‑specific routes such as `/app/:orgSlug/builds/:buildId/proposal` or `/app/:orgSlug/site-visits/:siteVisitId`; those are defined by other verticals and registered via the `DrawFlowRouteModule`.  The purpose of summarising the foundational routes here is to clarify the minimal shell that exists before any business workflows are mounted.
