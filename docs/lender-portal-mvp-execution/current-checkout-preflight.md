# Lender Portal MVP current-checkout preflight

## Baseline

- Prepared: 2026-08-14
- Branch: `08-13-lenderdashboard-prod`
- HEAD: `1b6b33b58c13fa22db150bc0f16203c853d9e0e1`
- Working tree: dirty state explicitly accepted for preparation by the user
- Historical planning baseline: `e299f6a3` is provenance only

The inventory was refreshed against the current named HEAD after the branch
advanced during preparation. It describes the current working-tree files over
that HEAD and must be rerun if HEAD or the selected implementation branch
changes again before product implementation.

## Phase 2 implementation checkout

- Worktree: `/Users/connor/.codex/worktrees/lp-p2-02/drawflowv1`
- Branch: `codex/lp-phase-2-proposal-lifecycle`
- Source branch: `codex/lp-phase-1-completion`
- Source HEAD before Phase 2 setup: `7837a1cd5409be895020adf406947938333a66fa`
- Accepted Phase 1 product code SHA:
  `6ba68e82a7c445074b11ae7f08f3c901a3c3b2b9`
- Source-to-accepted-code delta: documentation and evidence only
- Preparation checkout remains untouched at `08-13-lenderdashboard-prod`.

The Phase 2 setup commit and the immutable `LP-P2-01` package-start SHA are
recorded on this branch before product code changes begin. The setup commit is
`d3d75341fb662242a4d18c92337975f5d637a31e`; it is the clean package-start baseline for `LP-P2-01`.

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

## Accepted Phase 1 baseline

The Phase 2–9 handoffs use the accepted Phase 1 implementation baseline:

- branch: `codex/lp-phase-1-completion`;
- accepted product SHA: `6ba68e82a7c445074b11ae7f08f3c901a3c3b2b9`;
- certification: `LP-P1-05` verified with explicit human acceptance authority;
- primary integration commit: `7837a1cd5409be895020adf406947938333a66fa`.

The candidate extends the verified owners rather than replacing them:

1. `convex/authz.ts` enforces active organization, active membership,
   supported lender role, protected targets, and resource authority through
   shared fluent-convex boundaries.
2. `convex/workosProjection.ts` exposes
   `getLenderOrganizationManagement`,
   `listCurrentUserOrganizations`, and
   `LENDER_MEMBERSHIP_CONSUMER_HANDOFFS` from webhook-owned projections.
3. `convex/workosManagement.ts` remains the WorkOS-first operation boundary,
   including protected Principal Broker transfer and recoverable sync states.
4. `src/features/lender-organization-management/` owns the extracted Variant
   E feature components, while `src/routes/lender/organization.tsx` owns the
   production route.
5. Later phases consume current membership eligibility plus their own
   persisted resource state. They do not write membership projections or
   fabricate assignment, policy, queue, or notification state.

The accepted contract includes typed organization, membership, and audit rows;
paginated `getLenderOrganizationManagement` results with `continueCursor` and
`isDone`; and production-route page accumulation. Each later phase must still
confirm these owners on its actual implementation checkout and refresh its
handoff if the interfaces drift.

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

## LP-P1-01 implementation-checkout rerun

- Rerun: 2026-08-14
- Implementation branch: `codex/lp-p1-01`
- Source branch: `08-13-lenderdashboard-prod`
- Base HEAD: `1b6b33b58c13fa22db150bc0f16203c853d9e0e1`
- Working tree before the rerun: clean

The canonical owners and four bounded implementation seams above are unchanged.
The rerun found these preparation-to-implementation differences:

1. The source branch advanced from the dirty preparation HEAD `02e825e2` to
   `1b6b33b5`, which committed the prepared contract and execution documents.
2. The validator script and package command remained only in the accepted dirty
   preparation checkout. Their exact prepared bytes were carried into this
   worktree and committed before verification; unrelated preparation-checkout
   `bun.lock` drift was not copied. The committed traceability ledger was
   already present at the base HEAD.
3. The generated Convex AI guidance was ignored and absent from the clean base
   checkout. The prepared checkout copy with SHA-256
   `62d72acb9afcc18f658d88dd772f34b5b1da5fa60ef0402e57a784d97c458e57`
   was read before implementation. The verification checkout now tracks the
   current generated guidance, so a clean checkout contains every required
   instruction input without relying on another worktree.
4. The auth foundation remains WorkOS AuthKit plus the webhook-owned `users`,
   `workosOrganizations`, `workosOrganizationMemberships`,
   `workosOrganizationRoles`, `workosRoles`, and `workosPermissions`
   projections. Brokerage tenant mapping remains owned by `brokerages`.
5. Existing capability middleware still trusts token roles and does not resolve
   an active projected organization membership. Existing Back Office
   organization scope also intentionally differs from the new lender-local
   boundary and must remain separate.

`LP-P1-01` became dependency-unblocked only after the required execution inputs
above were present and the preparation validator passed. No additional product
owner was required for this packet's read-only authorization boundary.

The external API, webhook, analytics, reporting, and support consumer boundaries
remain explicitly pending; `LP-P1-01` does not close them or assume that no
consumers exist. This packet adds no membership command or membership-effect
publication. `LP-P1-05` owns the Phase 1 consumer audit and may certify only
after a fresh inventory names each implemented consumer, proves no impact where
applicable, and records any still-unavailable external evidence as unknown.

## LP-P1-02 implementation-checkout rerun

- Rerun: 2026-08-14
- Implementation branch: `codex/lp-p1-02`
- Verified dependency HEAD: `509d13c11a189a15adb670181552fbcca335cdf6`
- Accepted LP-P1-01 product SHA: `4fb59b5743be08936705cad2bb3ccda3ca3dabad`
- Working tree before the rerun: clean

The rerun confirmed that the accepted LP-P1-01 product SHA is an ancestor of
the implementation branch and that exact-SHA evidence is attached. The
canonical owners remain `convex/workosManagement.ts` for WorkOS commands,
`convex/workosProjection.ts` for webhook/sync projection writes,
`convex/brokerageProvisioning.ts` for brokerage provisioning, and
`auditEvents` for material history.

The LP-P1-02 gaps are unchanged and bounded:

1. Existing invite, role update, membership creation, deactivation, and
   reactivation commands accept broader string role inputs than the four lender
   roles permitted by this packet.
2. Existing user-management scope checks do not yet prove the target membership
   belongs to the caller's exact active lender organization before invoking the
   external adapter.
3. Existing accepted command paths may project returned membership data before
   the webhook/sync boundary reconciles it; LP-P1-02 must return an explicit
   pending-sync state instead of treating that optimistic write as canonical.
4. No protected, idempotent Principal Broker transfer command exists. Normal
   role removal and deactivation are not yet guarded against removing the last
   active Principal Broker.
5. The canonical `auditEvents` table exists, but the WorkOS membership command
   seam does not yet append the packet's required actor, role, tenant,
   organization, prior/new state, warning, timestamp, and reason history.

No new identity, organization, membership, role, permission, brokerage, audit,
or projection owner is required. External API, analytics, reporting, and support
consumers remain pending for the LP-P1-05 consumer audit.

## LP-P1-03 implementation-checkout rerun

- Rerun: 2026-08-14
- Implementation branch: `codex/lp-phase-1-completion`
- Verified dependency HEAD: `83fe51d0e5d5a66add92bb5e70c08080fe3adf58`
- Accepted LP-P1-02 product SHA: `360f11dd3d950a6bc896969df587ef909af45ee1`
- Working tree before the rerun: clean
- Authorization: the user explicitly authorized completing `LP-P1-03` through
  `LP-P1-05` end to end and deferring packet review gates to one consolidated
  Phase 1 review.

Historical snapshot at dependency commit
`83fe51d0e5d5a66add92bb5e70c08080fe3adf58`: the fresh consumer inventory
found 1,974 role, membership, access, assignment,
queue, recipient, quorum, notification, and audit references before
classification. Implemented membership readers span shared authorization,
active-Build access, broker assignments, Builder onboarding and roster,
collaboration access and recipients, cost documents, production proposals, and
current user-management surfaces. No production lender Organization Management
route exists yet; the selected Variant E remains a prototype and is owned by
`LP-P1-04`.

Follow-up: commit `51bf4691d20153414b629b65fe5f73966486a6b8`
directly promoted the extracted shared Variant E composition into
`src/routes/lender/organization.tsx`. The production route, shared component,
canonical loader, and WorkOS operation wiring are now owned by `LP-P1-04`.

The bounded LP-P1-03 implementation seam is one rebuildable membership-effect
projection derived only from canonical WorkOS membership state. It must publish
current access/role effects and named later-phase handoffs without fabricating
proposal assignment, review-policy, quorum-satisfaction, queue, or
transactional-recipient records. Existing canonical consumers continue to read
the WorkOS projections directly; the effect projection describes reconciliation
and feeds the Phase 1 organization-management UI.

The read contract is versioned as `lender-membership-effects-v1`. Pages sort by
member name, email, or WorkOS user id, then by `workosMembershipId` as the
deterministic tie-breaker. Consumers merge pages by `workosMembershipId` with
replace-by-identity semantics, so reconciliation replaces the current effect
instead of appending a second effect. Replay remains write-free and WorkOS
event processing remains receipt-idempotent. The projection contains only
canonical membership-derived access and role effects; later-phase handoffs are
contract metadata, not fabricated domain records.

## Phase 1 closure

- Closed: 2026-08-14
- Branch: `codex/lp-phase-1-completion`
- Accepted product SHA: `6ba68e82a7c445074b11ae7f08f3c901a3c3b2b9`
- Working tree at product acceptance: clean
- Acceptance authority: explicit human override by the user

The full candidate preserved the existing canonical WorkOS, brokerage,
authorization, audit, shared user-management, and Build participant-access
owners. The Phase 1 consumer inventory, focused tests, critical regressions,
full-suite baseline, codegen, Convex typecheck, production build, execution
validator, CodeRabbit CLI review, and Variant E browser evidence were complete.

The independent Pi acceptance review was dispatched against the exact
candidate using `openrouter/deepseek/deepseek-v4-flash-latest`, with
`kimi-coding/k3` configured as the fallback. It remained connected without
producing a decision. The user explicitly superseded the pending independent
gate so execution could continue. Evidence records state this override rather
than representing the missing Pi decision as independent acceptance.

All five Phase 1 packets are verified. Phase 2 remains out of scope until a new
explicit implementation instruction confirms the target checkout and reruns
the dependency and consumer preflight.

The preparation checkout has canonical owners plus an explicit fresh-inventory
step in every later packet whose concrete file owner can drift before its
dependency is implemented. All 45 work packages and eight later-phase handoffs
are bounded and dependency ordered. They are now reconciled to the accepted
Phase 1 product SHA. No Phase 2–9 product implementation has started.
