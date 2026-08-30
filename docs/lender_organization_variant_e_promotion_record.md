# Prototype Promotion Record — Lender Organization Management

- Promotion ID: `LP-PROT-ORG-2026-08-18`
- Surface / actor / user task: Back Office Lender Organization Management; a Platform Admin opens `/backoffice/lenders`, selects an application-owned Lender Organization, inspects assigned shared-WorkOS lender members, and stages membership commands.
- Selected variant and registry status: Variant E, Shared user management operations; approved and locked.
- Product decision authority and decision date: Lender Portal prototype registry and corrected promotion contract; 2026-08-13.
- Source prototype path: `src/routes/lender.organization-management-prototype.tsx`.
- Source commit and file hash: checkout `62b8eb75e9c1ebfa6ac3323a38e303d9af2b1df4`; source SHA-256 `6bf373524e86244a3af2096d4544188bb3b99eb2eb4f49e909408619c9e74414`.
- Production destination paths: `src/routes/backoffice/lenders/-lender-control-plane.tsx`, `src/features/lender-organization-management/LenderOrganizationManagementVariantE.tsx`, `src/features/lender-organization-management/LenderOrganizationOperationDialog.tsx`, and the shared `UserManagementDirectoryTable` / `UserDetailSheet` composition.
- Supported routes: Platform Admin management at `/backoffice/lenders`; assigned-member directory and lender-admin member operations, or contact-admin privacy state, at `/lender/organization`.
- Domain/auth owner: application Lender Organizations, Brokerage relationship,
  assignments, immutable default Review Requirements, and audit remain
  application-owned; shared identity, invitation, membership, and role commands
  remain WorkOS-owned through `convex/workosManagement.ts`. Only Back Office may
  configure organization defaults.
- Release owner: not assigned in this dirty checkout.

## Direct-promotion checkpoint

- Selected source remained frozen: yes; the source route SHA-256 is unchanged and its Git diff is empty.
- Transfer boundary: Variant E had already been extracted into the production-owned `LenderOrganizationManagementVariantE` shared component and was used by the selected prototype. GAP-13 imports that exact component into the supported Back Office drawer rather than recreating its directory, tabs, or staged command flow.
- Preserved composition: directory-first hierarchy, member search/status filters, shared directory table, four member-detail tabs, staged draft/review operation dialog, membership effects, and policy boundary.
- Productionization edits: canonical app-organization/member projection adapter; exact lender roles; reviewed existing-user assignment with an operator-entered audit reason; persistent pending reconciliation states; WorkOS-first invitation, role-change, and deactivation; app unassignment only after the scoped WorkOS projection confirms deactivation; no optimistic projection writes; nested production heading semantics; no Principal Broker transfer control.
- Locked-render protection: prototype mode retains the original `Verified active members` summary and count while the production-only branch may show active plus pending app assignments. The frozen route file remains byte-clean and a route render test covers Variant E.
- Approved 2026-08-25 amendment: production also mounts the production-owned Variant E directory and shared member sheet at `/lender/organization`. The organization policy remains read-only; only active same-organization `lender-admin` users receive versioned member-decision controls and eligible-member deactivation. Invitation, role change, Brokerage controls, and Back Office proposal operations stay absent.
- Prototype-only comparison fixtures, rejected variants, local draft history, and Principal Broker transfer behavior are not shipped through the production route.

## Wiring ledger

| Element | Canonical loader/command | Scope and permission | Observable state | Evidence |
| --- | --- | --- | --- | --- |
| Production entry | `/backoffice/lenders` route and `LenderControlPlaneRoute` | `requireIntegrationAdminAccess`; non-Platform-Admin roles fail closed | organization table, assignment queue, selected organization drawer | `src/routes/backoffice/lenders/-index.test.ts`, `-lender-control-plane.test.tsx` |
| Organization directory | `listLenderOrganizations` and `listLenderOrganizationMembersForAdmin` | exact target app organization under a validated Brokerage | Variant E table, exact lender roles, active/pending counts, reconciliation rows | `-lender-control-plane.test.tsx`, `convex/lenderOrganizations.test.ts` |
| Default Review Requirements | `getLenderOrganizationDefaultReviewPolicy` and `saveLenderOrganizationDefaultReviewPolicy` | Back Office, exact Brokerage and app Lender Organization, expected current version, approval-eligible quorum | current immutable version or explicit baseline; actor/time/reason; actionable membership-drift failure; future-assignment copy notice | `-lender-control-plane.test.tsx`, `convex/lenderOrganizations.test.ts` |
| Existing-user assignment | `listUnassignedLenderUsers` then `assignLenderUser` | eligible shared WorkOS user, active target app organization, exact Brokerage scope | both production entry points require an operator reason and a review step; no command before confirmation | `-lender-control-plane.test.tsx`, `convex/lenderOrganizations.test.ts` |
| Invitation | `inviteLenderUser` | exact app organization plus exact lender starting role | accepted command waits for WorkOS webhook/projection reconciliation | `-lender-control-plane.test.tsx`, `convex/lenderOrganizations.test.ts` |
| Access change | `updateSharedLenderMembershipRoles` plus `getLenderMembershipReconciliation` | current app assignment and exact shared WorkOS membership under the selected app organization | accepted command remains visibly pending; success appears only when the reactive projection has the exact requested role; errors leave the current projection unchanged | `-lender-control-plane.test.tsx`, `convex/lenderOrganizations.test.ts` |
| Member grants | `updateLenderMemberDecisionPermissions` | active same-organization `lender-admin`, target assignment, expected permission version | reviewed proposal/Milestone/Draw grant update, organization-capped effective state, stale-version refresh, audit | `src/routes/lender/-organization.test.tsx`, `convex/lenderOrganizations.test.ts` |
| Deactivation | `deactivateSharedLenderMembership` plus webhook finalization | scope derived from assignment; self/last-admin/cross-organization/inactive targets rejected | accepted command suspends authority and remains pending until inactive/deleted projection finalizes; provider failure restores access and remains retryable | `-lender-control-plane.test.tsx`, `src/routes/lender/-organization.test.tsx`, `convex/lenderOrganizations.test.ts` |
| Lender privacy | `getCurrentLenderOrganization` | current active assignment only | assigned Variant E directory with role-shaped member controls, or contact-admin state with no directory data | `src/routes/lender/-organization.test.tsx`, `convex/lenderOrganizations.test.ts` |

## Interface review

- Reference parity: production uses the exact already-extracted Variant E component, shared directory table, shared detail sheet, and staged operation dialog. No reference screenshot was supplied or captured, so pixel metrics are unavailable.
- `better-interface`: reviewed hierarchy, semantic headings, native controls, focusable table actions, exact-role labels, assignment validation, pending/error states, and responsive wrapping. The assignment and policy audit-reason textareas start blank with visible required hints, policy controls expose `aria-pressed`, and accepted WorkOS operations use persistent polite status regions rather than completion copy.
- `make-interfaces-feel-better`: reviewed action priority, command labels, status wording, spacing, shared tokens, icon consistency, and restrained motion. No parallel component system or decorative animation was introduced.
- `impeccable harden`: reviewed missing membership IDs, absent shared organization ID, long values, whitespace-only reasons, duplicate submissions, WorkOS failure, stale/mismatched projection, and deactivation ordering. Missing identifiers and mismatched assignment identities fail closed; pending disables command controls; errors preserve the current projection and entered reason.
- `impeccable polish`: reviewed final information hierarchy, app-organization versus WorkOS language, exact lender vocabulary, status badges, and removal of Principal Broker controls from the production composition.
- Detector: `node /Users/connor/.agents/skills/impeccable/scripts/detect.mjs --json ...` returned `[]` for the changed production UI files.

## Verification

- Focused tests: `bun run test -- convex/lenderOrganizations.test.ts convex/production_proposals.test.ts convex/lender_portal_phase5.test.ts src/routes/lender/-organization.test.tsx src/routes/backoffice/lenders/-lender-control-plane.test.tsx --reporter=dot` — 5 files, 290 tests passed.
- Convex generation: `bun x convex codegen` passed, including function upload to the configured development deployment, generated bindings, and Convex TypeScript validation.
- Typecheck: `bun run typecheck` passed, including Convex TypeScript and client/server typecheck builds.
- Production build: `bun run build` passed; Convex deployment registration was skipped outside Vercel. Existing large-chunk and plugin-timing warnings remain.
- Lender execution validator: `bun run validate:lender-portal-execution` is blocked by the pre-existing `proof-surface-dashboard` trust-root assertion, which no longer uniquely matches its executable body and observable route behavior. This amendment does not own that dashboard proof.
- Diff hygiene: `git diff --check` passed.
- Interface gates: `better-interface`, `make-interfaces-feel-better`, `impeccable harden`, and `impeccable polish` completed against the production composition. The one-time Impeccable detector returned `[]` for the three changed production UI files.
- Browser/visual evidence: the in-app browser control runtime was not exposed to this task. Route-level render and interaction tests cover direct-route authorization, directory pagination, member-sheet controls, reviewed permission saving, read-only role behavior, and destructive safeguards, but no authenticated browser screenshot is claimed.
- Migration release gate: Stage 1 keeps the new assignment fields optional so the idempotent backfill can run. `getLenderMemberDecisionPermissionMigrationCoverage` must report `complete: true` before the Stage 2 required-field schema cutover and operator enablement deployment.
- Exact release commit: unavailable; work remains in a shared dirty checkout and no commit was authorized.
- Rollback: remove the lender-route capability composition and member command wiring together while retaining the pre-existing canonical backend owners and Back Office Variant E composition. WorkOS mutations accepted before rollback still reconcile through their canonical webhook owner.
- Known limitations: no authenticated browser, screen-reader, 200% zoom, responsive screenshot, deployed-SHA, live WorkOS-provider, Stage 2 required-field cutover, or release-owner verification. The coordinator's GAP-06 waiver for pre-existing user-owned `src/routes/lender.prototype.tsx` hunks remains in effect; GAP-13 did not edit that file.
- Final status: Wired; release-gated by Stage 2 required-field cutover and authenticated browser evidence.
- Sign-offs: product: selected/locked contract; domain-auth: focused implementation evidence complete, independent review pending; design-accessibility: source/test review complete, browser evidence pending; release: pending.
