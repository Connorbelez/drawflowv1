# Goal Contract: WorkOS RBAC Foundation

Status: Approved
Created: 2026-05-26
Source request: Inline `derive-goal-contract` interview for productionizing DrawFlow auth/RBAC before migrating demos.
Target workspace: `/Users/connor/Dev/drawFlow/v1/drawflowv1`

## Source Context

- User intent: Lay the production RBAC, protected-route, WorkOS projection, webhook, and backoffice user-management foundation before productionizing demo surfaces.
- Source artifacts inspected: user prompt and follow-up decisions, `AGENTS.md` instructions, `docs/draw_flow_prd.md`, `docs/draw_flow_production_prd.md`, `docs/payloads.json`, `convex/_generated/ai/guidelines.md`, `convex/auth.ts`, `convex/http.ts`, `convex/convex.config.ts`, `convex/schema.ts`, `convex/fluent.ts`, `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx`, `src/integrations/convex/provider.tsx`, `src/integrations/workos/provider.tsx`, `src/routes/backoffice/route.tsx`, `src/routes/builder/route.tsx`, `src/routes/backoffice/user-management/*`, `package.json`, local `@convex-dev/workos-authkit` package docs/source, local `@workos/authkit-tanstack-react-start` package docs/source, [TanStack authenticated routes](https://tanstack.com/router/latest/docs/guide/authenticated-routes), and [Convex WorkOS AuthKit component](https://www.convex.dev/components/workos-authkit).
- Codebase findings: WorkOS AuthKit is already wired through TanStack Start request middleware, `AuthKitProvider`, `ConvexProviderWithAuth`, the Convex WorkOS AuthKit component, and `authKit.registerRoutes(http)`.
- Codebase findings: `convex/auth.ts` currently handles `user.created`, `user.updated`, `user.deleted`, and logs `session.created`; it does not handle the 15 WorkOS sample event types in `docs/payloads.json`.
- Codebase findings: `convex/fluent.ts` contains reference fluent-convex identity middleware and demo functions, but the user decided production RBAC code must not live there.
- Codebase findings: `convex/schema.ts` currently has only a minimal `users` table for auth projection; it lacks production projection tables for WorkOS organizations, memberships, roles, permissions, webhook receipts, and role-aware user management.
- Codebase findings: `/backoffice/user-management` exists as an empty route scaffold; `/backoffice` and `/builder` route layouts are currently unauthenticated.
- Codebase findings: existing demos must remain unauthenticated, with `/builder/demo` accepted as the one unauthenticated exception under `/builder`.

## Shared Understanding

### Desired End State

DrawFlow has a production RBAC foundation where WorkOS is the source of truth for users, roles, permissions, organizations, and memberships; Convex stores synced read projections for querying and management views; WorkOS webhook handlers cover all current sample event types plus user lifecycle events; `/backoffice` and canonical production `/builder` routes are protected by centralized TanStack Router role guards; Convex queries, mutations, and actions can opt into centralized RBAC builders from a dedicated production authz module; and `/backoffice/user-management` is a read/write management console whose writes call WorkOS first through Convex action boundaries and wait for webhook projection confirmation.

### In Scope

- Preserve the existing `@convex-dev/workos-authkit` component integration instead of replacing it with unrelated manual auth wiring.
- Configure `convex/auth.ts` so the WorkOS AuthKit component dispatches application event handlers for user events and every event represented in `docs/payloads.json`.
- Add Convex read-projection tables for WorkOS-owned users, organizations, organization memberships, roles, organization roles, permissions, and webhook processing receipts.
- Process and test these WorkOS webhook event types: `organization_membership.created`, `organization_membership.updated`, `organization_membership.deleted`, `role.created`, `role.updated`, `role.deleted`, `organization_role.created`, `organization_role.updated`, `organization_role.deleted`, `permission.created`, `permission.updated`, `permission.deleted`, `organization.created`, `organization.updated`, `organization.deleted`, `user.created`, `user.updated`, and `user.deleted`.
- Make webhook processing idempotent by WorkOS event id and record event id, event type, WorkOS event creation time, processing status, processed timestamp, and error text for failures.
- Treat WorkOS delete events as soft deletes in Convex projection tables using inactive/deleted status, `deletedAt`, and source event metadata; do not hard-delete projection rows needed for audit context.
- Normalize these current WorkOS role slugs exactly: `member`, `admin`, `principle-broker`, `broker`, `broker-staff`, `builder`, `builder-staff`, and `contractor`.
- Keep product labels separate from role slugs; the UI may display `Principal Broker` while the source slug remains `principle-broker`.
- Use WorkOS session/JWT claims as the authorization source of truth for route and Convex RBAC decisions in this foundation; use Convex projections for read views, querying, and sync diagnostics.
- Implement a centralized frontend RBAC module, such as `src/lib/auth/rbac.ts`, used by `/backoffice`, `/builder`, and protected-access status routes. Do not scatter role arrays across route files outside tests.
- Protect `/backoffice` for `admin`, `principle-broker`, `broker`, and `broker-staff`.
- Protect canonical production `/builder` routes for `builder`; keep `/builder/demo` unauthenticated as the one legacy demo exception under `/builder`.
- Route authenticated users without workspace access to a minimal protected-access status screen instead of treating them as unauthenticated.
- Route `member` users to an onboarding-required protected-access state for product workspaces while preserving public, auth, profile/session, and demo access.
- Preserve and normalize `builder-staff` and `contractor` in projections and role utilities, but do not build app/domain logic, route semantics, or workspaces for those roles in this goal.
- Add production Convex RBAC builders and shared authorization helpers in a dedicated module such as `convex/authz.ts` or `convex/rbac.ts`, not in `convex/fluent.ts`.
- Provide RBAC builders for authenticated, admin, backoffice, builder, user-management write, non-destructive write, and destructive write capability classes across queries, mutations, and actions where the fluent-convex API supports them.
- Enforce destructive capability only for `admin` and `principle-broker`.
- Treat `broker` and `broker-staff` as backoffice roles with read and non-destructive operational capability in this foundation.
- Implement `/backoffice/user-management` as a read/write console backed by Convex projections and Convex WorkOS management actions.
- Implement user-management reads for users, organizations, memberships, roles, permissions, and webhook sync status.
- Implement user-management writes for WorkOS-owned identity/org administration actions only: invite or create users where supported by the WorkOS SDK/API, update user role or membership, deactivate membership, reactivate membership, and view/sync roles, permissions, and organizations.
- Route user-management writes through Convex action boundaries with WorkOS-first semantics: call WorkOS via SDK/API, return enough immediate WorkOS result data for the UI to show accepted/waiting-for-sync, and let webhooks update Convex projections.
- Use environment-gated WorkOS management adapters with fake/test adapters so tests do not require WorkOS credentials and never mutate real WorkOS data.
- Add `@workos-inc/node` as an explicit dependency with `bun add @workos-inc/node` before importing it from production code.
- Document the foundation in `docs/auth-rbac-foundation.md`.

### Out of Scope

- Do not implement multi-tenant SaaS UX, organization switching, same-org authorization enforcement, or cross-tenant workflows.
- Do not enforce WorkOS organization membership for route access or Convex RBAC in this foundation.
- Do not migrate demo routes or demo Convex data into production domain tables.
- Do not auth-gate public demo routes; `/builder/demo` remains the accepted unauthenticated exception under `/builder`.
- Do not implement domain ownership checks such as assigned builder, assigned broker portfolio, contractor relationship, build participant, work-order assignee, or workflow-state authorization.
- Do not build domain logic or workspaces for `builder-staff` or `contractor`.
- Do not add a `workosOperations` or command-tracking table for pending WorkOS management writes.
- Do not put production RBAC code in `convex/fluent.ts`.
- Do not replace the existing Convex WorkOS AuthKit component integration with older standalone `convex/auth.config.ts` guidance unless current component tooling proves a version-specific file is required.

### Constraints

- WorkOS owns users, organizations, roles, permissions, and memberships.
- Convex projection tables are read models for convenience, querying, diagnostics, and user-management display.
- The authorization decision source for this slice is authenticated WorkOS session/JWT role claims, not Convex org membership projections.
- Admin is god mode and may bypass org-scoped restrictions.
- `principle-broker` is organization-scoped in the product model, but same-org enforcement is intentionally deferred. Until org enforcement is enabled, `principle-broker` user-management writes are broad and must be documented as temporary.
- Route and Convex policy checks must be centralized so future org-membership enforcement changes a small number of auth/RBAC modules.
- All Convex functions added for this work must use fluent-convex authoring patterns, except files where Convex component APIs require generated server helpers.
- Use Bun commands: `bun install`, `bun add`, `bun run test`, `bun run build`, `bun x convex codegen`, and `bun x tsc -p convex/tsconfig.json`.
- Follow DrawFlow domain language and keep demos unauthenticated unless explicitly included above.
- UI surfaces that introduce structural cards must use `src/components/ui/frame.tsx`; content cards must use `src/components/ui/card.tsx`.

### Decisions

| Decision | Answer | Source |
| --- | --- | --- |
| WorkOS and Convex ownership | WorkOS owns orgs/users/roles/permissions/memberships; Convex stores read projections synced by WorkOS webhooks. | User |
| `/builder` meaning | `/builder` is canonical borrower/builder workspace; brokers use `/backoffice`. | User |
| Role slug syntax | Use WorkOS dashboard hyphenated slugs, including `principle-broker`. | User screenshot |
| Recognized role slugs | Preserve and normalize `member`, `admin`, `principle-broker`, `broker`, `broker-staff`, `builder`, `builder-staff`, `contractor`. | User |
| Deferred roles | Hold off on app/domain logic for `builder-staff` and `contractor`. | User |
| Admin authority | `admin` is god mode and may bypass org-scoped restrictions. | User |
| Organization enforcement | Do not enforce WorkOS org membership yet. | User |
| Route guard policy | Authenticated session plus centralized role-to-workspace gating. | User |
| Future org enforcement | Must require changing a handful of functions, not every route. | User |
| Frontend policy module | Use one shared frontend RBAC module with no route-local role arrays outside tests. | User |
| Convex RBAC location | Dedicated production module such as `convex/authz.ts`, not `convex/fluent.ts`. | User |
| Protected access screen | Add minimal protected-access status screen for unauthorized/onboarding states. | User |
| Webhook receipts | Record idempotency and processing/audit receipts. | User |
| Delete events | Soft-delete projection rows rather than hard-delete. | User |
| Backend RBAC depth | Enforce auth, normalized role, broad workspace/capability gates; defer domain relationship and workflow checks. | User |
| Documentation | Add `docs/auth-rbac-foundation.md`. | User |
| User-management mode | Read/write console. Writes use WorkOS SDK/API to modify WorkOS. | User |
| Write confirmation flow | WorkOS first, webhook confirms Convex projection. | User |
| WorkOS adapter tests | Use env-gated real adapter and fake test adapters. | User |
| WorkOS SDK dependency | Add `@workos-inc/node` explicitly if production code imports it. | User |
| User-management write scope | Limit to WorkOS identity/org administration; defer DrawFlow assignments and contractor profile linking. | User |
| Test coverage | Add real route, Convex RBAC, webhook, idempotency, soft-delete, and fake-adapter tests. | User |
| User lifecycle webhooks | Keep and harden `user.created`, `user.updated`, and `user.deleted` in addition to payload-file event types. | User |
| Destructive capability | Only `admin` and `principle-broker` can perform destructive actions. | User |
| `broker-staff` access | Treat as backoffice role with non-destructive operational permissions for now. | User |
| `member` access | Block from product workspaces and show onboarding-required state; allow public/auth/demo access. | User |
| Convex AuthKit setup | Use the current `@convex-dev/workos-authkit` component integration and current component docs. | User |
| WorkOS writes location | Implement WorkOS management writes in Convex actions, not TanStack Start server functions. | User |
| WorkOS action boundary | Keep SDK/API usage centralized in a dedicated Convex management boundary. | User |
| Operation tracking | Do not add a `workosOperations` table in this foundation. | User |
| `principle-broker` temporary breadth | Allow broad user-management writes for now because org enforcement is deferred; document future same-org narrowing. | User |
| `/builder/demo` exception | Keep `/builder/demo` unauthenticated for now. | User |

### Assumptions

- The existing untracked `docs/payloads.json` file is the authoritative local fixture for WorkOS non-user event shapes in this goal.
- The implementing agent may add lightweight fixtures derived from `docs/payloads.json` for tests, but must not alter the semantic event content unless the payload file is malformed and the test fixture records the correction.
- The protected-access screen may be minimal, but it must distinguish unauthenticated redirect, authenticated no-workspace-access, and authenticated onboarding-required states through route/query state or loader data.
- WorkOS API method names may vary by SDK version; the adapter interface must hide SDK specifics from route components and Convex domain files.

## Completion Contract

```text
/goal Implement the DrawFlow WorkOS RBAC foundation so WorkOS remains the source of truth for users, organizations, roles, permissions, and memberships; Convex stores webhook-synced read projections and webhook receipts; `/backoffice`, canonical production `/builder`, and `/backoffice/user-management` use centralized role guards; dedicated Convex RBAC builders protect new backend functions; and user-management reads and WorkOS-first writes operate through Convex action boundaries verified by fake adapters, while leaving demos including `/builder/demo` unauthenticated and leaving organization-membership enforcement plus builder-staff/contractor domain logic deferred. verified by route-guard tests for unauthenticated redirect, allowed-role access, wrong-role protected-access routing, member onboarding state, and `/builder/demo` unauthenticated access; Convex tests for RBAC builders, all 15 payload-file WorkOS events plus user.created/user.updated/user.deleted, duplicate event idempotency, soft-delete projection handling, and fake WorkOS write adapters; generated Convex code; `bun x tsc -p convex/tsconfig.json`; `bun run test`; `bun run build`; and documentation in `docs/auth-rbac-foundation.md` while preserving the existing `@convex-dev/workos-authkit` component integration, WorkOS-owned source-of-truth semantics, no WorkOS org-membership enforcement, no demo migration, no production RBAC code in `convex/fluent.ts`, no `workosOperations` table, and no direct Convex projection writes from user-management UI. Use Bun, fluent-convex patterns in a dedicated production authz module, the current Convex WorkOS AuthKit component docs, the TanStack authenticated-route guide, `docs/payloads.json`, and explicit `@workos-inc/node` dependency ownership if production SDK imports are added. Between iterations, first preserve auth/session correctness and fail-closed RBAC, then make webhook projection idempotent and diagnosable, then make user-management read/write flows work through WorkOS-first adapters, then add tests and docs before visual polish. If blocked or no valid paths remain, report the exact failing auth/component/API assumption, the file and command proving the block, whether the block is due to WorkOS credentials, SDK API mismatch, Convex component limitations, or route-generation behavior, and the smallest credential, SDK method decision, fixture correction, or product policy decision that would unlock progress.
```

## Verification Evidence

- `bun add @workos-inc/node` if production code imports `@workos-inc/node` directly.
- `bun x convex codegen`.
- `bun x tsc -p convex/tsconfig.json`.
- `bun run test`.
- `bun run build`.
- Route tests covering unauthenticated redirect for protected production routes.
- Route tests covering allowed backoffice roles: `admin`, `principle-broker`, `broker`, and `broker-staff`.
- Route tests covering allowed builder role: `builder`.
- Route tests covering wrong-role users reaching the protected-access status screen.
- Route tests covering `member` reaching onboarding-required status for product workspaces.
- Route tests covering `/builder/demo` as unauthenticated exception.
- Convex tests covering RBAC builders for authenticated, admin, backoffice, builder, non-destructive, destructive, and user-management write capability classes.
- Convex webhook tests covering all 15 events in `docs/payloads.json`.
- Convex webhook tests covering `user.created`, `user.updated`, and `user.deleted`.
- Convex webhook tests covering duplicate event id skip behavior.
- Convex webhook tests covering soft-delete projection behavior for user, organization, membership, role, organization role, and permission delete events.
- WorkOS management adapter tests proving fake adapters are used in tests and live WorkOS credentials are not required.
- User-management UI tests or route/component tests proving read tables render projection data and write actions display accepted/waiting-for-sync state from WorkOS action results.
- Documentation file `docs/auth-rbac-foundation.md` explaining role slugs, route policy, Convex RBAC builders, WorkOS projection tables, webhook idempotency, WorkOS-first writes, deferred org enforcement, and deferred domain-role logic.

## Iteration Policy

1. Preserve the existing WorkOS/TanStack/Convex AuthKit integration and verify current auth still loads.
2. Add shared role normalization and frontend route policy in one module, then wire protected routes and protected-access screen.
3. Add dedicated Convex authz/RBAC module and tests before using it in user-management functions.
4. Add projection schema and webhook handlers with idempotency and soft-delete semantics.
5. Add WorkOS management action boundary with real/fake adapter split and explicit SDK dependency ownership.
6. Build `/backoffice/user-management` read/write UI against projection queries and WorkOS-first actions.
7. Add focused tests after each layer, then run Convex codegen, Convex typecheck, full tests, and build.
8. Update `docs/auth-rbac-foundation.md` last so it reflects final code names and command results.

## Blocked Policy

If blocked, report:

- The exact file, command, or API call that failed.
- Whether the failure is in WorkOS AuthKit component integration, WorkOS SDK/API method availability, missing WorkOS credentials, Convex generated API/type generation, TanStack route protection, test fixture shape, or product policy.
- The smallest next input needed: credential name, SDK method choice, payload fixture correction, dependency version decision, route exception decision, or RBAC policy decision.
- The fallback paths already tried and why each failed.

Do not proceed by directly mutating Convex projection rows from user-management UI, by moving production RBAC into `convex/fluent.ts`, by adding org-membership enforcement, by auth-gating demos beyond the stated `/builder/demo` exception policy, or by introducing a command-tracking table.

## Ambiguity Audit

- No material ambiguity remains for this foundation contract.
- Accepted temporary ambiguity: `principle-broker` writes are broad until org enforcement is implemented; this must be documented and isolated behind centralized policy helpers.
- Accepted deferred scope: `builder-staff` and `contractor` are preserved in role normalization and projections only; their product workspaces and domain permissions are future work.
- Accepted deferred scope: WorkOS management operation persistence is future work; actions return immediate result data and webhooks confirm projections.
- Accepted route exception: `/builder/demo` remains unauthenticated even though it is nested under `/builder`.
