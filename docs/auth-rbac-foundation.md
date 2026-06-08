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

`builder-staff` and `contractor` are normalized and projected in this
foundation. Builder-staff app-level proposal and active-build permissions are
managed from DrawFlow builder account links, while WorkOS remains authoritative
for the user, organization membership, and role assignment.

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

## Builder Staff Provisioning

Builder staff assignment uses a WorkOS-first flow. Adding staff by email calls
`workosManagement.provisionBuilderStaffUser`, which creates or reuses the
WorkOS user, creates or reactivates the organization membership in the linked
brokerage WorkOS organization, adds the `builder-staff` role without stripping
other active roles, and sends an invitation when possible.

The proposal or active-build mutation stores only DrawFlow assignment metadata
on `builderAccountLinks`: the WorkOS user id, membership id, and assigned email.
It does not write directly to `users` or
`workosOrganizationMemberships`. Those projection tables are updated only by
WorkOS webhooks or explicit directory sync.

Builder staff directories and permission checks fail closed when WorkOS
projection data says the linked user or membership is deleted, inactive, or no
longer has the `builder-staff` role. Fresh assignments can appear as pending
while webhooks catch up because DrawFlow already has the real WorkOS user and
membership ids returned by the management action.

## Deferred Scope

This foundation does not enforce WorkOS organization membership for route access
or Convex RBAC. It also does not migrate demo data, create contractor
workspaces, or add a WorkOS operation tracking table.

## Verification

Expected verification commands:

```sh
bun x convex codegen
bun x tsc -p convex/tsconfig.json
bun run test
bun run build
```
