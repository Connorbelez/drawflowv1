# DrawFlow Auth and RBAC Foundation

## Ownership Model

WorkOS is the source of truth for users, organizations, roles, permissions, and organization memberships. Convex stores read projections for product queries, management views, and webhook diagnostics. User-management UI writes must call Convex actions that call WorkOS first; the UI must not directly write Convex projection tables.

The existing `@convex-dev/workos-authkit` component remains installed in `convex/convex.config.ts` and registered in `convex/http.ts`. DrawFlow adds projection handling around that integration instead of replacing it.

## Role Slugs

Accepted WorkOS role slugs are centralized in frontend and Convex RBAC modules:

- `member`
- `admin`
- `principle-broker`
- `broker`
- `broker-staff`
- `builder`
- `builder-staff`
- `contractor`

The slug `principle-broker` is intentionally preserved because it is the current WorkOS source value. UI labels may display `Principal Broker`, but authorization checks use the source slug.

## Route Policy

Route authorization is centralized in `src/lib/auth/rbac.ts`.

- `/backoffice` allows `admin`, `principle-broker`, `broker`, and `broker-staff`.
- `/backoffice/user-management` allows `admin` and `principle-broker`.
- canonical production `/builder` allows `builder`.
- `/builder/demo` remains unauthenticated and is not migrated in this foundation.
- authenticated users with the wrong role route to `/protected-access`.
- authenticated `member` users route to `/protected-access/onboarding`.
- unauthenticated users route to WorkOS sign-in with a return path.

This foundation intentionally does not enforce WorkOS organization membership for route access. The active session role claims are the authorization source for this slice.

## Convex RBAC Builders

Production Convex authorization lives in `convex/authz.ts`, not `convex/fluent.ts`.

The module provides fluent-convex builders and middleware for these capability classes:

- authenticated
- admin
- backoffice
- builder
- user-management write
- non-destructive write
- destructive write

These builders derive identity from `ctx.auth.getUserIdentity()` and fail closed when no authenticated WorkOS identity or required role exists. Organization-membership relationship enforcement, builder-staff domain behavior, and contractor domain behavior are deferred.

## Projection Tables

Convex stores WorkOS read projections in:

- `users`
- `workosOrganizations`
- `workosOrganizationMemberships`
- `workosRoles`
- `workosOrganizationRoles`
- `workosPermissions`
- `workosWebhookReceipts`

There is intentionally no `workosOperations` table. Pending WorkOS command tracking is outside this foundation.

Delete events soft-delete projection rows by setting status/deleted metadata instead of removing rows. This keeps user-management and sync diagnostics auditable.

## Webhooks

Webhook projection handling covers:

- `organization_membership.created`
- `organization_membership.updated`
- `organization_membership.deleted`
- `role.created`
- `role.updated`
- `role.deleted`
- `organization_role.created`
- `organization_role.updated`
- `organization_role.deleted`
- `permission.created`
- `permission.updated`
- `permission.deleted`
- `organization.created`
- `organization.updated`
- `organization.deleted`
- `user.created`
- `user.updated`
- `user.deleted`

Receipts are idempotent by event id plus event type. That preserves idempotency for duplicate deliveries while tolerating the current `docs/payloads.json` fixture, which contains repeated event ids across different sample event types.

## User Management

`/backoffice/user-management` reads Convex projections via `api.workos.listUserManagementProjection`.

Writes use Convex action boundaries:

- `api.workos.inviteUser`
- `api.workos.updateMembership`

Those actions call WorkOS through an adapter. Tests use fake adapters to verify that writes go through the WorkOS-first boundary instead of mutating Convex projection tables directly. Production actions use `WORKOS_API_KEY` and `fetch`; no production import from `@workos-inc/node` was added, so no new SDK dependency is owned by this change.

## Deferred Scope

This foundation deliberately defers:

- WorkOS organization-membership enforcement for route and backend authorization.
- builder-staff workspace semantics.
- contractor workspace semantics.
- builder/contractor domain profile linking and assignment logic.
- command tracking for pending WorkOS operations.

Future work should add those policies behind the centralized route RBAC module and `convex/authz.ts` builders rather than scattering role checks through UI or domain functions.
