# Lender Portal MVP current-checkout preflight

## Baseline

- Prepared: 2026-08-14
- Branch: `08-13-lenderdashboard-prod`
- HEAD: `02e825e29936ce5f7a960a68dfca1438010e5645`
- Working tree: dirty state explicitly accepted for preparation by the user
- Historical planning baseline: `e299f6a3` is provenance only

The inventory describes the current working-tree files over the named HEAD. It
must be rerun if HEAD or the selected implementation branch changes before
product implementation.

## Verified canonical owners

| Responsibility | Current owner | Preparation conclusion |
|---|---|---|
| Authenticated role normalization and fluent builders | `convex/authz.ts`, `convex/fluent.ts` | Extend the existing fluent-convex middleware and helpers. Repository `AGENTS.md` overrides generated examples that import function builders from `_generated/server`. |
| WorkOS organization, membership, role, permission, and user projections | `convex/schema.ts`, `convex/workosProjection.ts` | These tables are webhook/sync-owned projections. Product flows reference them and never write them directly. |
| WorkOS-first membership operations | `convex/workosManagement.ts` | Reuse invitation, role update, membership creation, and deactivation actions. Verify accepted-command projection behavior against the required pending-sync contract before modifying it. |
| Brokerage mapping and provisioning | `convex/brokerageProvisioning.ts`, `convex/brokerAssignments.ts` | Extend the existing brokerage boundary. No lender-owned organization or membership model is permitted. |
| Projected WorkOS permission lookup | `convex/workos_permission_access.ts` | Reuse the projection-backed permission seam where a permission check is required. |
| Shared organization directory | `src/routes/backoffice/-user-management-surface.tsx` | `UserManagementDirectoryTable` is canonical and must be extended, not copied. |
| Shared member detail sheet | `src/routes/backoffice/-user-management-detail-sheet.tsx` | `UserDetailSheet` is canonical and must gain composable lender tabs and operations without changing Back Office behavior. |
| Selected organization-management interaction | `src/routes/lender.organization-management-prototype.tsx`, Variant E | Directly promote Variant E. Remove comparison-only behavior only after parity is proven. |
| WorkOS behavior tests | `convex/workosManagement.test.ts`, `convex/workos_projection.test.ts`, `convex/authz.test.ts` | Extend existing suites and test through authenticated fluent function boundaries. |
| Shared user-management UI tests | `src/routes/backoffice/-user-management.test.tsx` | Preserve existing behavior and add focused lender-route parity and accessibility coverage. |

## Verified implementation seams

1. Canonical multi-membership organization projections already exist through
   `listCurrentUserOrganizations` in `convex/workosProjection.ts`.
2. `userManagementWrite` currently permits `admin` and `principle-broker` in
   `convex/authz.ts`; Phase 1 must add active-organization, active-membership,
   supported-role, protected-target, and resource checks beneath that coarse
   capability.
3. WorkOS-first invite, role-change, creation, removal, deactivation, and
   reactivation actions already exist in `convex/workosManagement.ts`.
4. Current repository search found no canonical protected Principal Broker
   transfer-of-control workflow. `LP-P1-02` owns that missing transition.
5. Current production Back Office components already expose the directory table
   and member sheet used by Variant E. `LP-P1-04` owns their composable lender
   promotion; it cannot fork either component.
6. Current repository search found the selected lender Organization Management
   only as a prototype route. A production lender route and canonical loader/
   command adapters remain to be implemented.
7. Proposal assignment, locked review policy, quorum, queues, and notification
   consumers span later phases. Phase 1 must reconcile implemented consumers
   and publish explicit canonical membership-change effects for later owners;
   it must not fabricate later workflow state.

## Unknown and external boundaries

- External API, webhook, analytics, reporting, and support consumers of the new
  lender membership effects remain unknown rather than assumed absent.
- WorkOS delivery timing and failure behavior must be verified at the canonical
  adapter boundary during `LP-P1-02`.
- Any implementation-bearing changes landed after this preflight require a new
  symbol, route, process, projection, test, and consumer inventory.

## Gate result

The current checkout has canonical owners that must be extended and four
bounded Phase 1 implementation seams. Preparation may proceed to ready work
packages. Product implementation has not started.
