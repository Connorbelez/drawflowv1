

I’ll start with **Vertical 01 — Foundation, Contracts, Auth Shell, and Governed Transitions** because this vertical defines the route architecture and component contracts that every later vertical plugs into.

The biggest design rule for this whole pass:

> Verticals should expose screens/routes/components through contracts, not by reaching into each other’s internals.

So each vertical should be able to land with stubbed dependencies, so long as it respects:

```text
shared types
route contracts
permission contracts
transition command contracts
projection/read-model contracts
event contracts
```

---

# Vertical 01 — Foundation Screen, Route, and Component Manifest

## 0. What this vertical owns

Foundation owns the application substrate:

```text
Auth
Tenant resolution
App shell
Route guards
Resource guards
Permission-aware UI
Transition command UI primitives
Audit/event display primitives
Shared component contracts
Shared route registration contracts
Error/loading/empty states
```

Foundation should **not** own business workflows like:

```text
proposal creation
draw planning
workspace timeline
completion claims
verification
draw release
policy editing
MIC portal
```

Those plug into Foundation later.

The clean boundary is:

```text
Foundation owns “how a user safely enters and acts inside DrawFlow.”
Other verticals own “what domain work the user performs.”
```

---

# 1. Global routing philosophy

## 1.1 Route hierarchy

I recommend this high-level route structure:

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

Important distinction:

```text
orgSlug is a routing/display alias.
tenantOrgId is the real security boundary.
```

The backend must never trust `orgSlug` as authorization proof. The route should resolve:

```text
orgSlug
→ tenantOrgId
→ WorkOS organization membership
→ DrawFlow tenant user
→ build/resource grants
```

The authenticated app can show nice URLs, but all API calls should use authenticated tenant context or explicit `tenantOrgId` validated server-side.

---

## 1.2 Recommended route conventions

Use these conventions across all verticals:

```txt
/app/:orgSlug/builds/:buildId/workspace
/app/:orgSlug/builds/:buildId/proposal
/app/:orgSlug/builds/:buildId/planning
/app/:orgSlug/builds/:buildId/claims/:completionClaimId
/app/:orgSlug/builds/:buildId/site-visits/:siteVisitId
/app/:orgSlug/builds/:buildId/draw-releases/:drawReleaseId
/app/:orgSlug/builds/:buildId/revisions/:revisionId
```

Do **not** put workflow state in the route.

Bad:

```txt
/app/acme/builds/build_123/milestones/ms_1/approved
```

Good:

```txt
/app/acme/builds/build_123/milestones/ms_1
```

The UI should derive state from the domain object/projection.

---

## 1.3 Route ownership model

Each vertical should register its routes through a route module contract.

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

Later verticals should be able to add:

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

Foundation composes these modules into the app router.

---

# 2. Foundation route manifest

## 2.1 Public/auth routes

| Route                 | Screen               | Owner      | Purpose                                                                       | Notes                                                  |
| --------------------- | -------------------- | ---------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| `/`                   | `RootRedirectScreen` | Foundation | Redirect authenticated users into active org; unauthenticated users to login. | No business UI.                                        |
| `/login`              | `LoginScreen`        | Foundation | Start WorkOS auth flow.                                                       | Should be extremely simple.                            |
| `/auth/callback`      | `AuthCallbackScreen` | Foundation | Complete WorkOS auth callback and establish DrawFlow session.                 | Mostly loading/error states.                           |
| `/select-org`         | `TenantSelectScreen` | Foundation | Let multi-org users choose active tenant.                                     | Required if user belongs to more than one org.         |
| `/error/unauthorized` | `UnauthorizedScreen` | Foundation | Auth required or session invalid.                                             | Should provide re-login action.                        |
| `/error/forbidden`    | `ForbiddenScreen`    | Foundation | User authenticated but lacks permission/resource grant.                       | Should show active org/user context for support/debug. |
| `/error/not-found`    | `NotFoundScreen`     | Foundation | Unknown route or inaccessible resource masked as not found.                   | Useful for tenant/resource isolation.                  |

---

## 2.2 Authenticated shell routes

| Route                              | Screen                         | Owner                                     | Purpose                                                        | Notes                                                         |
| ---------------------------------- | ------------------------------ | ----------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| `/app/:orgSlug`                    | `OrgRootRedirectScreen`        | Foundation                                | Redirect to `/home` or last active route.                      | Must resolve tenant context first.                            |
| `/app/:orgSlug/home`               | `HomeShellScreen`              | Foundation initially, later Ops/Workspace | Basic authenticated landing shell.                             | Can be a stub until Build list/queues land.                   |
| `/app/:orgSlug/builds`             | `BuildsIndexShellScreen`       | Foundation stub, later Proposal/Workspace | Placeholder route for build list.                              | Real build list can land with Proposal or Workspace vertical. |
| `/app/:orgSlug/settings`           | `SettingsRootScreen`           | Foundation                                | Settings shell redirect.                                       | Minimal in MVP.                                               |
| `/app/:orgSlug/settings/access`    | `AccessManagementShellScreen`  | Foundation stub                           | View tenant users/build grants in a minimal support/admin way. | WorkOS-managed; do not overbuild.                             |
| `/app/:orgSlug/settings/developer` | `DeveloperSettingsShellScreen` | Foundation stub, Webhook vertical later   | Reserved for webhook/API settings.                             | Hidden unless permissioned.                                   |
| `/app/:orgSlug/admin/diagnostics`  | `DiagnosticsScreen`            | Foundation/internal                       | Internal diagnostics for state, grants, event health.          | Platform/admin only; optional but useful.                     |

I would keep `/settings/access` very thin in MVP. WorkOS is the identity/role backbone, so DrawFlow should only show enough local resource grants to debug who can see/act on a Build.

---

# 3. Foundation screen manifest

## 3.1 `LoginScreen`

### Route

```txt
/login
```

### Purpose

Allow unauthenticated users to begin WorkOS authentication.

### Primary user stories

```text
As an unauthenticated user, I can sign in.
As a returning user, I am redirected away from login if I already have a valid session.
```

### Components

```text
AuthLayout
LoginCard
WorkOSLoginButton
AuthErrorBanner
```

### Data/API dependencies

```http
GET /api/session
POST /api/auth/workos/start
```

### Definition of done

* Already-authenticated users are redirected to their active org.
* Failed auth start shows an actionable error.
* No tenant-specific data is loaded on this screen.

---

## 3.2 `AuthCallbackScreen`

### Route

```txt
/auth/callback
```

### Purpose

Handle WorkOS callback, create/update local `UserIdentity`, resolve org memberships, and redirect.

### Primary user stories

```text
As a signing-in user, I complete authentication and land in the correct tenant context.
As a multi-org user, I am sent to tenant selection.
As a failed-auth user, I see a clear error state.
```

### Components

```text
AuthLayout
FullPageSpinner
AuthCallbackErrorState
```

### Data/API dependencies

```http
GET /api/auth/workos/callback?code=...
GET /api/session
```

### Definition of done

* New WorkOS users are materialized into `user_identities`.
* WorkOS organization memberships are synchronized enough to resolve tenant context.
* Multi-org users are routed to `/select-org`.
* Single-org users are routed to `/app/:orgSlug/home`.

---

## 3.3 `TenantSelectScreen`

### Route

```txt
/select-org
```

### Purpose

Let users with multiple tenant memberships choose the active tenant.

### Primary user stories

```text
As a multi-org user, I can choose which lender/FairLend tenant I am acting under.
As a user, I cannot select an org where I do not have active membership.
```

### Components

```text
AuthLayout
TenantSelectCard
TenantOptionList
TenantStatusBadge
```

### Data/API dependencies

```http
GET /api/session/orgs
POST /api/session/active-org
```

### Definition of done

* Only active tenant orgs are selectable.
* Suspended/archived orgs are either hidden or visibly disabled.
* Active org is persisted in the session.
* Redirect lands at `/app/:orgSlug/home`.

---

## 3.4 `AppShell`

### Route

```txt
/app/:orgSlug/*
```

### Purpose

Authenticated, tenant-scoped application container.

### Primary user stories

```text
As an authenticated user, I see tenant-aware navigation.
As a user with insufficient permission, I do not see actions I cannot perform.
As a user in the wrong org/resource, I am blocked before the child screen renders.
```

### Components

```text
AuthenticatedLayout
GlobalTopNav
TenantSwitcher
UserMenu
AppSidebar
BreadcrumbBar
PermissionBoundary
RouteErrorBoundary
GlobalCommandToaster
```

### Data/API dependencies

```http
GET /api/session
GET /api/session/active-org
GET /api/session/permissions
```

### Definition of done

* All child routes inherit tenant context.
* All child routes can consume permission/grant context.
* Route-level loading/error/forbidden states are standardized.
* Org switch invalidates tenant-scoped cached queries.

---

## 3.5 `HomeShellScreen`

### Route

```txt
/app/:orgSlug/home
```

### Purpose

Temporary authenticated landing page. Later it can be replaced by build list, ops queue, or dashboard.

### Initial MVP content

```text
Welcome / active org
Recently viewed builds placeholder
Primary CTA placeholder: Create Proposal
Pending actions placeholder
```

### Components

```text
PageHeader
OrgSummaryCard
StubbedRecentBuildsPanel
StubbedPendingActionsPanel
```

### Definition of done

* Page proves authenticated shell works.
* Navigation and tenant context are visible.
* No business commitments are made before later verticals land.

---

## 3.6 `AccessManagementShellScreen`

### Route

```txt
/app/:orgSlug/settings/access
```

### Purpose

Minimal visibility into tenant users and Build-level grants.

This is not a full WorkOS admin console.

### Primary user stories

```text
As a platform/lender admin, I can see which users have DrawFlow access.
As a platform/lender admin, I can inspect Build participant grants.
As support, I can debug why a user cannot access a Build.
```

### Components

```text
SettingsLayout
TenantUserTable
BuildGrantInspector
PermissionPillList
GrantStatusBadge
```

### Data/API dependencies

```http
GET /api/tenant/users
GET /api/tenant/build-grants?buildId=...
```

### Deferred

```text
Inviting users
Editing WorkOS roles
Bulk permission management
Self-serve access workflows
```

Those can be WorkOS/admin-console handled or built later.

---

## 3.7 `ForbiddenScreen`

### Route

```txt
/error/forbidden
```

or route-level fallback under:

```txt
/app/:orgSlug/*
```

### Purpose

Show a safe access-denied state.

### Components

```text
AccessDeniedCard
ActiveOrgDebugSummary
ContactAdminHint
BackToHomeButton
```

### Definition of done

* Does not leak inaccessible Build names/details.
* Shows enough local context for support: active org, user email, missing permission if safe.
* Does not expose internal grants to regular users.

---

## 3.8 `DiagnosticsScreen`

### Route

```txt
/app/:orgSlug/admin/diagnostics
```

### Purpose

Internal-only debug surface for lifecycle, outbox, projection invalidation, and permission issues.

### Components

```text
DiagnosticsLayout
SessionInspectorPanel
TenantContextPanel
OutboxHealthPanel
LifecycleInstanceLookup
AuditEventLookup
```

### Access

```ts
requiredPermissions: ['audit.view'];
platformAdminOnly: true;
```

### MVP stance

Optional but valuable. If engineering velocity is tight, this can be CLI/internal admin only. But some diagnostic capability should exist because governed transitions are otherwise painful to debug.

---

# 4. Foundation component manifest

## 4.1 Layout components

### `AuthLayout`

Used for:

```text
/login
/auth/callback
/select-org
```

Responsibilities:

```text
Centered auth-safe layout
No tenant data
No app navigation
Auth error display
```

Props:

```ts
interface AuthLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}
```

---

### `AuthenticatedLayout`

Used for:

```text
/app/:orgSlug/*
```

Responsibilities:

```text
Resolve tenant context
Render global nav
Render side nav
Provide route outlet
Install route error boundary
Install command/toast provider
```

Props:

```ts
interface AuthenticatedLayoutProps {
  children: React.ReactNode;
}
```

---

### `BuildScopedLayout`

Owned by Foundation as a shell primitive, populated by later verticals.

Used later for:

```txt
/app/:orgSlug/builds/:buildId/*
```

Responsibilities:

```text
Load build resource context
Check build access grant
Render build-level breadcrumbs/nav
Provide build context to children
```

Props:

```ts
interface BuildScopedLayoutProps {
  buildId: BuildId;
  children: React.ReactNode;
}
```

This should land as a stub in Foundation because later verticals will use it constantly.

---

## 4.2 Navigation components

### `GlobalTopNav`

Contains:

```text
Product mark
TenantSwitcher
Global search placeholder
UserMenu
```

Do not add too much nav yet. It will bloat.

---

### `AppSidebar`

Initial nav items:

```text
Home
Builds
Settings
```

Later verticals register additional nav entries.

Contract:

```ts
interface DrawFlowNavItem {
  id: string;
  label: string;
  href: string;
  icon?: React.ComponentType;
  requiredPermissions?: DrawFlowPermission[];
  featureFlag?: string;
  verticalKey: string;
}
```

Foundation filters nav items by permission and feature flags.

---

### `TenantSwitcher`

Responsibilities:

```text
Show active org
Switch between allowed orgs
Invalidate tenant-scoped caches
Redirect to selected org home
```

Props:

```ts
interface TenantSwitcherProps {
  activeTenantOrgId: TenantOrgId;
  activeOrgSlug: string;
  orgs: TenantOrgSummary[];
}
```

---

### `BreadcrumbBar`

Later verticals provide route handles.

```ts
type BreadcrumbFactory = (ctx: RouteContext) => BreadcrumbItem[];

interface BreadcrumbItem {
  label: string;
  href?: string;
}
```

---

## 4.3 Auth and tenant components

### `SessionProvider`

Provides:

```ts
interface SessionContextValue {
  user: UserIdentity | null;
  activeTenantOrg: TenantOrgSummary | null;
  orgs: TenantOrgSummary[];
  permissions: DrawFlowPermission[];
  isLoading: boolean;
  refreshSession: () => Promise<void>;
}
```

---

### `TenantProvider`

Provides tenant-scoped context:

```ts
interface TenantContextValue {
  tenantOrgId: TenantOrgId;
  orgSlug: string;
  orgName: string;
  tenantStatus: 'active' | 'suspended' | 'archived';
}
```

All tenant-scoped API clients should require this context.

---

### `RequireAuth`

Route-level guard.

```ts
interface RequireAuthProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}
```

Behavior:

```text
loading → spinner
unauthenticated → redirect /login
authenticated → render children
```

---

### `RequireTenant`

Route-level guard.

```ts
interface RequireTenantProps {
  orgSlug: string;
  children: React.ReactNode;
}
```

Behavior:

```text
unknown orgSlug → not found
inactive org → forbidden/suspended state
valid org → render children
```

---

### `RequirePermission`

Component/route guard.

```ts
interface RequirePermissionProps {
  permissions: DrawFlowPermission[];
  mode?: 'all' | 'any';
  children: React.ReactNode;
  fallback?: React.ReactNode;
}
```

---

### `RequireBuildGrant`

Used by later Build-scoped screens.

```ts
interface RequireBuildGrantProps {
  buildId: BuildId;
  permissions?: DrawFlowPermission[];
  children: React.ReactNode;
}
```

Foundation owns this primitive, but the full Build resource may be populated by later verticals.

---

## 4.4 Guarded transition components

This is one of the most important component families.

### `GuardedTransitionButton`

Any lifecycle state change should go through this, or an equivalent hook.

Examples later:

```text
Submit proposal
Approve activation
Submit completion claim
Request site visit
Approve completion
Approve draw release
Record draw released
Submit revision
Approve revision
```

Props:

```ts
interface GuardedTransitionButtonProps<TPayload = unknown> {
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

  requiredPermission: DrawFlowPermission;

  label: string;
  confirmLabel?: string;

  reason?: {
    required: boolean;
    label?: string;
    placeholder?: string;
  };

  disabledReason?: string;

  onSuccess?: (result: TransitionResult) => void;
  onFailure?: (failure: TransitionFailure) => void;

  variant?: 'primary' | 'secondary' | 'danger';
}
```

Usage example:

```tsx
<GuardedTransitionButton
  entityType="completion_claim"
  entityId={claim.id}
  eventType="APPROVE_COMPLETION"
  requiredPermission="completion_claim.verify"
  expectedAggregateVersion={claim.aggregateVersion}
  label="Approve completion"
  reason={{
    required: false,
    label: 'Approval notes',
  }}
  onSuccess={() => invalidateWorkspaceProjection(buildId)}
/>
```

---

### `useTransitionCommand`

Hook used by custom screens.

```ts
interface UseTransitionCommandResult {
  execute: <TPayload>(
    command: Omit<TransitionCommand<TPayload>, 'tenantOrgId' | 'actorUserId' | 'correlationId'>,
  ) => Promise<TransitionResult | TransitionFailure>;

  isExecuting: boolean;
}
```

The hook should inject:

```text
tenantOrgId
actorUserId
correlationId
idempotency key, if generated client-side
```

---

### `TransitionFailureBanner`

Standard display for transition failures.

Failure codes:

```ts
type TransitionFailureCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'TENANT_MISMATCH'
  | 'INVALID_EVENT'
  | 'GUARD_REJECTED'
  | 'STALE_AGGREGATE_VERSION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'NOT_FOUND';
```

UI behavior:

| Failure                   | UX                                           |
| ------------------------- | -------------------------------------------- |
| `FORBIDDEN`               | Show insufficient permission message.        |
| `INVALID_EVENT`           | Refresh entity and show stale state message. |
| `GUARD_REJECTED`          | Show guard-specific reason.                  |
| `STALE_AGGREGATE_VERSION` | Prompt refresh/reload latest state.          |
| `TENANT_MISMATCH`         | Hard forbidden/not found.                    |
| `IDEMPOTENCY_CONFLICT`    | Show retry-safe conflict message.            |

---

### `ReasonRequiredDialog`

Used for auditable overrides.

Examples:

```text
Waive site visit
Reject completion claim
Correct recorded draw release
Approve material revision
Reject revision
```

Props:

```ts
interface ReasonRequiredDialogProps {
  title: string;
  description?: string;
  reasonLabel: string;
  minLength?: number;
  onConfirm: (reason: string) => Promise<void>;
}
```

Important: do not create many one-off reason modals. Use a shared primitive.

---

## 4.5 Permission-aware display components

### `PermissionGate`

Unlike `RequirePermission`, this is for inline hiding/disabling.

```ts
interface PermissionGateProps {
  permissions: DrawFlowPermission[];
  mode?: 'all' | 'any';
  behavior?: 'hide' | 'disable' | 'readonly';
  children: React.ReactNode;
}
```

---

### `PermissionPillList`

Used in settings/debug/access screens.

```ts
interface PermissionPillListProps {
  permissions: DrawFlowPermission[];
  maxVisible?: number;
}
```

---

### `RoleBadge`

```ts
interface RoleBadgeProps {
  role:
    | 'builder_principal'
    | 'builder_staff'
    | 'lender_admin'
    | 'lender_verifier'
    | 'site_visitor'
    | 'platform_admin';
}
```

---

## 4.6 Audit/event primitives

Foundation should not build the full audit UX, but it should provide primitives.

### `AuditTrailPanel`

Reusable domain-object audit panel.

```ts
interface AuditTrailPanelProps {
  entityType: string;
  entityId: string;
  buildId?: BuildId;
  defaultCollapsed?: boolean;
}
```

Data:

```http
GET /api/audit-events?entityType=...&entityId=...
```

Usage later:

```text
Completion claim detail
Draw release detail
Revision detail
Site visit detail
```

---

### `AuditEventRow`

```ts
interface AuditEventRowProps {
  event: AuditEvent;
  redactionMode?: 'internal' | 'participant' | 'observer';
}
```

---

### `OutboxHealthBadge`

Internal-only.

```ts
interface OutboxHealthBadgeProps {
  pendingCount: number;
  failedCount: number;
}
```

---

## 4.7 Loading/error/empty primitives

These should be standardized early because every vertical will need them.

```text
FullPageSpinner
InlineSpinner
PageErrorState
RouteErrorBoundary
EmptyState
ForbiddenState
NotFoundState
StaleDataState
RetryableErrorState
```

Recommended shape:

```ts
interface EmptyStateProps {
  title: string;
  description?: string;
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
}
```

---

# 5. API contracts exposed by Foundation

## 5.1 Session APIs

```http
GET /api/session
GET /api/session/orgs
POST /api/session/active-org
DELETE /api/session
```

Response:

```ts
interface SessionResponse {
  user: UserIdentityDTO | null;

  activeTenantOrg?: TenantOrgDTO;

  orgs: TenantOrgDTO[];

  permissions: DrawFlowPermission[];

  platformAdmin: boolean;
}
```

---

## 5.2 Grant/permission APIs

```http
GET /api/tenant/users
GET /api/tenant/build-grants?buildId={buildId}
GET /api/tenant/observer-grants?buildId={buildId}
```

These are mostly for settings/debug. Later verticals should not depend on these for ordinary page rendering unless needed.

---

## 5.3 Transition API

This is the key Foundation API.

```http
POST /api/transitions
```

Request:

```ts
interface TransitionCommandRequest<TPayload = unknown> {
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
}
```

Response:

```ts
type TransitionCommandResponse =
  | TransitionResult
  | TransitionFailure;
```

The server injects:

```text
tenantOrgId from active session/org
actorUserId from session
correlationId/requestId
```

Clients should not be allowed to spoof those fields.

---

## 5.4 Audit API

```http
GET /api/audit-events?buildId={buildId}
GET /api/audit-events?entityType={entityType}&entityId={entityId}
```

MVP access:

```text
lender_admin
lender_verifier
platform_admin
```

Builder-visible audit can be deferred or redacted.

---

# 6. Shared frontend contracts

## 6.1 Route module registry

```ts
export const routeModules: DrawFlowRouteModule[] = [
  foundationRouteModule,
  proposalRouteModule,
  planningRouteModule,
  workspaceRouteModule,
  evidenceRouteModule,
  verificationRouteModule,
  drawReleaseRouteModule,
  policyRouteModule,
  micApiRouteModule,
  revisionsRouteModule,
  opsRouteModule,
];
```

Each vertical can export routes independently.

---

## 6.2 Navigation registry

```ts
export function buildNavigationItems(ctx: {
  tenantOrgId: TenantOrgId;
  permissions: DrawFlowPermission[];
  featureFlags: Record<string, boolean>;
  routeModules: DrawFlowRouteModule[];
}): DrawFlowNavItem[] {
  return routeModules
    .flatMap((m) => m.navItems ?? [])
    .filter((item) => hasRequiredPermissions(ctx.permissions, item.requiredPermissions))
    .filter((item) => !item.featureFlag || ctx.featureFlags[item.featureFlag]);
}
```

---

## 6.3 Resource context

```ts
interface ResourceContext {
  tenantOrgId: TenantOrgId;

  buildId?: BuildId;
  completionClaimId?: CompletionClaimId;
  siteVisitId?: SiteVisitId;
  drawReleaseId?: DrawReleaseId;

  permissions: DrawFlowPermission[];
  grants: ResourceGrantSummary[];
}
```

Later verticals can read this context but should not mutate it.

---

# 7. UX flows owned by Foundation

## 7.1 Sign-in flow

```text
User lands at /
→ no session
→ redirect /login
→ clicks Sign in
→ WorkOS auth
→ /auth/callback
→ session established
→ if one org: /app/:orgSlug/home
→ if multiple orgs: /select-org
```

Failure states:

```text
WorkOS callback failed
user has no active org
tenant suspended
session expired
```

---

## 7.2 Tenant switch flow

```text
User opens TenantSwitcher
→ sees active orgs
→ selects org
→ POST /api/session/active-org
→ app clears tenant-scoped query cache
→ redirect /app/:newOrgSlug/home
```

Important: do not keep user on the same Build route after switching org unless that Build exists and is accessible in the new tenant. Safer default is org home.

---

## 7.3 Route authorization flow

```text
Route matches /app/:orgSlug/builds/:buildId/workspace
→ RequireAuth
→ RequireTenant resolves orgSlug
→ BuildScopedLayout loads build access
→ required route permission checked
→ child screen renders
```

Failure behavior:

```text
unauthenticated → /login
invalid orgSlug → not found
no org membership → forbidden
no build grant → not found or forbidden, depending desired leakage posture
missing permission → forbidden
```

For Build existence/resource access, I lean toward `not found` for unauthorized external users and `forbidden` for authenticated tenant users who lack a specific permission. But the PRD can standardize this later.

---

## 7.4 Guarded action flow

Example: later “Approve completion.”

```text
User clicks guarded action
→ component checks visible permission
→ optional confirmation/reason dialog
→ POST /api/transitions
→ transition service validates state/permission/guards
→ transaction writes mutation + lifecycle + audit + outbox
→ response returns next aggregate version
→ client invalidates relevant projection/query
→ toast shows success
```

Failure:

```text
stale version → refresh entity and show stale state
guard rejected → show domain reason
forbidden → hide/disable future action after refresh
invalid event → refresh state
```

---

# 8. Component ownership and handoffs to later verticals

## 8.1 Foundation exports

Foundation should export:

```text
AppShell
BuildScopedLayout
SessionProvider
TenantProvider
PermissionGate
RequirePermission
RequireBuildGrant
GuardedTransitionButton
useTransitionCommand
AuditTrailPanel
RouteErrorBoundary
EmptyState primitives
Route module contracts
Navigation item contracts
Shared ID/scalar types
Permission constants
```

## 8.2 Later verticals import

Later verticals should consume Foundation primitives instead of reinventing:

```tsx
<BuildScopedLayout buildId={buildId}>
  <WorkspaceScreen />
</BuildScopedLayout>
```

```tsx
<PermissionGate permissions={['completion_claim.submit']} behavior="disable">
  <ClaimCompletionButton milestoneId={milestone.id} />
</PermissionGate>
```

```tsx
<GuardedTransitionButton
  entityType="draw_release"
  entityId={drawRelease.id}
  eventType="RECORD_RELEASED"
  requiredPermission="draw_release.record_manual_release"
  reason={{ required: false }}
  label="Record draw released"
/>
```

---

# 9. Foundation component manifest summary

| Component                 | Type             | Owner      | Used by                          | MVP priority |
| ------------------------- | ---------------- | ---------- | -------------------------------- | ------------ |
| `AuthLayout`              | Layout           | Foundation | Auth routes                      | P0           |
| `AuthenticatedLayout`     | Layout           | Foundation | All app routes                   | P0           |
| `BuildScopedLayout`       | Layout           | Foundation | Build verticals                  | P0           |
| `GlobalTopNav`            | Navigation       | Foundation | App shell                        | P0           |
| `AppSidebar`              | Navigation       | Foundation | App shell                        | P0           |
| `TenantSwitcher`          | Navigation       | Foundation | App shell                        | P0           |
| `UserMenu`                | Navigation       | Foundation | App shell                        | P0           |
| `BreadcrumbBar`           | Navigation       | Foundation | All app screens                  | P1           |
| `SessionProvider`         | Provider         | Foundation | All app routes                   | P0           |
| `TenantProvider`          | Provider         | Foundation | Tenant routes                    | P0           |
| `RequireAuth`             | Guard            | Foundation | Public/app routes                | P0           |
| `RequireTenant`           | Guard            | Foundation | Tenant routes                    | P0           |
| `RequirePermission`       | Guard            | Foundation | Permissioned routes              | P0           |
| `RequireBuildGrant`       | Guard            | Foundation | Build routes                     | P0           |
| `PermissionGate`          | UI guard         | Foundation | All verticals                    | P0           |
| `GuardedTransitionButton` | Action primitive | Foundation | All lifecycle verticals          | P0           |
| `useTransitionCommand`    | Hook             | Foundation | Custom workflow UIs              | P0           |
| `TransitionFailureBanner` | Feedback         | Foundation | Guarded actions                  | P0           |
| `ReasonRequiredDialog`    | Modal            | Foundation | Overrides/rejections/corrections | P0           |
| `AuditTrailPanel`         | Audit UI         | Foundation | Claim/release/revision screens   | P1           |
| `AuditEventRow`           | Audit UI         | Foundation | Audit panels                     | P1           |
| `RouteErrorBoundary`      | Error handling   | Foundation | All routes                       | P0           |
| `EmptyState`              | State primitive  | Foundation | All verticals                    | P0           |
| `ForbiddenState`          | State primitive  | Foundation | All verticals                    | P0           |
| `StaleDataState`          | State primitive  | Foundation | Transitions                      | P0           |
| `DiagnosticsScreen`       | Internal screen  | Foundation | Platform/admin                   | P2           |

---

# 10. Foundation route manifest summary

| Route                              | Screen                         | Layout                | Permission                           | Priority   |
| ---------------------------------- | ------------------------------ | --------------------- | ------------------------------------ | ---------- |
| `/`                                | `RootRedirectScreen`           | none                  | none                                 | P0         |
| `/login`                           | `LoginScreen`                  | `AuthLayout`          | none                                 | P0         |
| `/auth/callback`                   | `AuthCallbackScreen`           | `AuthLayout`          | none                                 | P0         |
| `/select-org`                      | `TenantSelectScreen`           | `AuthLayout`          | authenticated                        | P0         |
| `/app/:orgSlug`                    | `OrgRootRedirectScreen`        | `AuthenticatedLayout` | authenticated + tenant               | P0         |
| `/app/:orgSlug/home`               | `HomeShellScreen`              | `AuthenticatedLayout` | authenticated + tenant               | P0         |
| `/app/:orgSlug/builds`             | `BuildsIndexShellScreen`       | `AuthenticatedLayout` | `build.view_workspace` or equivalent | P1         |
| `/app/:orgSlug/settings`           | `SettingsRootScreen`           | `AuthenticatedLayout` | authenticated + tenant               | P1         |
| `/app/:orgSlug/settings/access`    | `AccessManagementShellScreen`  | `AuthenticatedLayout` | admin/platform                       | P2         |
| `/app/:orgSlug/settings/developer` | `DeveloperSettingsShellScreen` | `AuthenticatedLayout` | `webhook.manage`                     | P2 / later |
| `/app/:orgSlug/admin/diagnostics`  | `DiagnosticsScreen`            | `AuthenticatedLayout` | platform/internal                    | P2         |
| `/error/forbidden`                 | `ForbiddenScreen`              | simple/app-aware      | none                                 | P0         |
| `/error/not-found`                 | `NotFoundScreen`               | simple/app-aware      | none                                 | P0         |

---

# 11. What I would not build in Foundation

Do **not** build these yet:

```text
Full user invite flow
Full WorkOS role editor
Full policy admin UI
Build list with full filtering
Workflow designer
Webhook settings UI
MIC portal UI
Dashboard analytics
Notification center
Chat
Global search
```

The temptation with Foundation is to build a lot of “platform” surface. Resist that.

Foundation should feel boring. If Foundation feels exciting, it is probably absorbing product work that belongs to a later vertical.

---

# 12. Definition of done for this vertical

Foundation is done when:

1. A user can authenticate through WorkOS.
2. A user can select an active tenant org.
3. App shell renders tenant-aware navigation.
4. Route guards prevent unauthorized tenant/resource access.
5. Later verticals can register routes and nav items.
6. Shared types package is available to frontend and backend.
7. `GuardedTransitionButton` and `useTransitionCommand` can execute a sample lifecycle transition.
8. Transition failures render consistently.
9. Audit events can be queried and rendered in a generic panel.
10. Tenant-scoped cache invalidation works when switching orgs.
11. Cross-tenant route/API access is tested.
12. A stub Build-scoped route can prove `BuildScopedLayout` and `RequireBuildGrant` work.
13. No business workflow state can be mutated directly through UI bypassing transition commands.

---

# 13. Key decisions I recommend locking now

## Decision 1 — Use `orgSlug` in routes, `tenantOrgId` in APIs

Route:

```txt
/app/:orgSlug/builds/:buildId/workspace
```

API/security:

```text
tenantOrgId resolved server-side from session and orgSlug.
```

Never trust route params for authorization.

---

## Decision 2 — Foundation owns `BuildScopedLayout`

Even though Build Workspace lands later, Foundation should own the generic Build-scoped route boundary.

Reason:

```text
Proposal
Workspace
Claims
Verification
Draw release
Revisions
```

all need the same build resource guard.

---

## Decision 3 — All lifecycle action UI uses the transition command contract

No screen should call:

```http
PATCH /completion-claims/:id
{ "status": "approved" }
```

It should call:

```http
POST /api/transitions
{
  "entityType": "completion_claim",
  "entityId": "claim_123",
  "eventType": "APPROVE_COMPLETION",
  "expectedAggregateVersion": 7,
  "reason": "Evidence reviewed and acceptable."
}
```

This is the most important architectural discipline in the whole app.

---

## Decision 4 — Foundation provides stubs, not fake product

For example, `/app/:orgSlug/builds` can exist as a stub. But it should not try to solve Build list UX before Proposal/Workspace verticals define the actual data model.

---

# 14. Next vertical

The next vertical should be:

```text
Vertical 02 — Proposal Building and Activation
```

That is where we define the first real product workflow screens:

```text
Build proposal list/create
Proposal builder workspace
Budget/milestone editor
Draft Gantt editing
Draw plan preview handoff
Submit proposal
Admin activation review
Activation result
```

Foundation gives it:

```text
authenticated shell
tenant context
BuildScopedLayout
route module registration
guarded transition action
permission filtering
shared types
audit panel primitive
```

Proposal Building will be the first place where we decide how dense the UI should be versus how many focused screens/drawers we need.
