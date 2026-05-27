# DrawFlow Auth and RBAC Foundation

DrawFlow uses WorkOS as the source of truth for users, organizations, roles,
permissions, and organization memberships. Convex stores synced read projections
for product queries, backoffice user-management views, and webhook diagnostics.

## Role Slugs

The recognized WorkOS role slugs are:

- `member`
- `admin`
- `principle-broker`
- `broker`
- `broker-staff`
- `builder`
- `builder-staff`
- `contractor`

The source slug `principle-broker` is intentionally preserved. Product UI may
display `Principal Broker`, but policy code and persisted projection data keep
the WorkOS slug.

`builder-staff` and `contractor` are normalized and projected only in this
foundation. Product workspace semantics for those roles are deferred.

## Route Policy

Frontend route policy is centralized in `src/lib/auth/rbac.ts`.

- `/backoffice` is restricted to `admin`, `principle-broker`, `broker`, and
  `broker-staff`.
- Canonical production `/builder` routes are restricted to `admin` and
  `builder`; `admin` is god-mode for product workspace access.
- `/builder/demo` remains unauthenticated as the legacy demo exception.
- Authenticated users without workspace access are redirected to
  `/protected-access`.
- `member` users are routed to the onboarding-required protected-access state.

Public, auth, profile/session, and demo routes outside the protected production
workspaces remain public.

## Convex RBAC Builders

Production Convex authorization helpers live in `convex/authz.ts`, not
`convex/fluent.ts`. The module exposes builders for:

- authenticated functions
- admin functions
- backoffice functions
- builder functions
- user-management writes
- non-destructive writes
- destructive writes

Destructive capability is limited to `admin` and `principle-broker`.
`admin` also satisfies builder workspace capability. `broker` and
`broker-staff` have backoffice and non-destructive operational capability.
Same-organization enforcement is intentionally deferred, so
`principle-broker` user-management writes are broad until the future
organization-scoped policy layer is added.

## Projection Tables

Convex projection tables added for this foundation:

- `users`
- `workosOrganizations`
- `workosOrganizationMemberships`
- `workosRoles`
- `workosOrganizationRoles`
- `workosPermissions`
- `workosWebhookReceipts`

Delete events soft-delete projections by setting deleted status and `deletedAt`.
Projection rows are retained for audit context and backoffice diagnostics.

## Webhook Processing

`convex/auth.ts` preserves the existing `@convex-dev/workos-authkit`
component integration and configures handlers for:

- organization membership create/update/delete
- role create/update/delete
- organization role create/update/delete
- permission create/update/delete
- organization create/update/delete
- user create/update/delete

`convex/workosProjection.ts` records webhook receipts and skips already processed
event ids. The current WorkOS AuthKit component passes entity data to the app
handler and not the top-level WorkOS event id, so the projection processor uses
the true event id when present and a deterministic event/entity fallback when
called through component data that lacks the top-level id.

## User Management

`/backoffice/user-management` reads Convex projections for users,
organizations, memberships, roles, permissions, organization roles, and sync
receipts. Writes are routed through Convex actions in
`convex/workosManagement.ts`.

Write actions call WorkOS first and return an accepted result with
`waiting-for-webhook` sync state. The UI does not directly mutate Convex
projection tables. Tests use the fake adapter automatically, so WorkOS
credentials are not required and real WorkOS data is never mutated in test runs.

Admins can also trigger `workosManagement.syncWorkosDirectory` from
`/backoffice/user-management`. This action lists the current WorkOS
organizations, memberships, users, organization roles, and permissions, then
feeds them through the same projection ingestion path as webhook events. It is
the recovery path for records created before the webhook existed and for
temporary webhook delivery outages.

## Deferred Scope

This foundation does not enforce WorkOS organization membership for route access
or Convex RBAC. It also does not migrate demo data, add DrawFlow domain ownership
checks, create contractor or builder-staff workspaces, or add a WorkOS operation
tracking table.

## Verification

Expected verification commands:

```sh
bun x convex codegen
bun x tsc -p convex/tsconfig.json
bun run test
bun run build
```
