# Lender Portal MVP — Comprehensive Implementation Gap Analysis

**Audit date:** 2026-08-17
**Audited checkout:** `codex/phase-9-implementation`
**HEAD:** `62b8eb75e9c1ebfa6ac3323a38e303d9af2b1df4`
**Working-tree policy:** Current tracked and untracked Phase 9 work was included in the audit. Existing changes were treated as user-owned and were not modified.

## Executive verdict

The Lender Portal MVP is **not production-complete** against the feature brief, specification, and implementation plan.

The backend contains substantial canonical lifecycle, authorization, review-cycle, evidence, notification, migration, and release-control work. Several production lender routes also query canonical Convex data. However, required participant journeys are still broken at their intended production interfaces. Four issues are release blockers:

1. Production seed mutations write directly to WorkOS-owned projection tables and accept a client-supplied WorkOS organization ID.
2. Back Office cannot configure and lock the review policy required by proposal closing.
3. A lender decline can be recorded, but Back Office cannot run the required remediation/revision-publication loop through production UI.
4. `/lender/milestones` renders hard-coded prototype data, does not consume the existing Build-scoped canonical review projector, lacks a route-ready all-assigned Milestone projection, and cannot open an ordinary queue item for review.

Other high-impact gaps include missing lender close/activate controls, missing participant Site Visit controls, inaccurate and truncated **Needs my action** projections, incomplete locked Build Detail/Draw Queue/Proposal Review promotions, a missing Builder Milestone Variant A production flow, sparse shared-sheet adapters, shipped prototype routes, incomplete browser/E2E proof, and stale execution-control evidence.

Compilation and focused tests do not change this verdict. The audited tree passes 98 focused tests, Convex TypeScript, and the production build, but the tests do not exercise the missing consumer journeys. The execution-control validator fails because its source hash is stale.

## Audit question and completion standard

This audit answers:

> Does every feature, requirement, surface, permission, lifecycle transition, projection, notification, migration, and release gate in the three controlling documents exist in the current code and work through its intended production consumer?

The completion standard follows the repository contract: a backend function or React component existing is not sufficient. A feature is complete only when the intended authorized actor can reach it through the supported production route, API, or operator interface and focused verification covers entry, wiring, authorization, state change, counterparty projection, privacy, audit, notification, and observable result.

## Sources and authority

Primary sources:

- `docs/lender_portal_mvp_feature_brief.md` — confirmed product contract.
- `docs/lender_portal_mvp_spec.md` — detailed behavioral, journey, testing, and compatibility contract.
- `docs/lender_portal_mvp_implementation_plan.md` — delivery sequence, locked promotion targets, quality gates, and release criteria.

Supporting implementation contracts:

- `docs/lender-portal-prototype-promotion.md`
- `src/components/prototypes/README.md`
- `docs/lender-portal-mvp-execution/traceability.json`
- `docs/runbooks/lender-portal-phase9-release.md`
- Repository `AGENTS.md` reachability, canonical ownership, Convex, and prototype-promotion rules.

## Method

The audit used five evidence layers:

1. Normalized every scope family, invariant, permission, acceptance criterion, phase exit criterion, locked surface, notification class, E2E journey, and release gate from the three documents.
2. Mapped requirements to current schema, fluent-convex functions, authorization helpers, mutations, queries, projections, routes, components, adapters, navigation, and tests.
3. Cross-referenced public and internal Convex capabilities against non-test production callers.
4. Inspected route reachability, prototype imports, hard-coded data, disabled actions, and required route guards.
5. Ran focused tests, Convex TypeScript, the production build, and the execution-control validator.

The current signed-in local browser identity was redirected from lender-only and integration-admin routes to `/backoffice`. This proves the route guards were active for that identity, but it prevented a full screenshot-level lender-persona flow audit. No claim of complete browser behavior or WCAG compliance is made.

## Status and severity definitions

| Status | Meaning |
|---|---|
| **Complete** | Canonical implementation and intended production consumer are present, reachable, and supported by focused evidence. |
| **Substantial** | Core implementation is present; live-provider, browser, operational, or exact-release proof remains. |
| **Partial** | Some canonical implementation is present, but required behavior, data, interface, parity, or proof is missing. |
| **Prototype-only** | The production path still uses representative/local prototype data or an unavailable prototype action. |
| **Missing** | Required implementation or interface was not found. |
| **Blocked** | A required journey cannot complete because a prerequisite or consumer is absent. |
| **Unverified** | Static or focused test evidence exists, but the required live/system boundary was not proven. |

| Severity | Meaning |
|---|---|
| **P0 — Release blocker** | Security/ownership breach or a required MVP journey cannot complete. |
| **P1 — High** | Required surface, authorization path, projection truth, or participant action is missing or materially incorrect. |
| **P2 — Medium** | Contract parity, typing, performance, test, evidence, or release-control weakness that must close before certification. |

## Contract defects in the controlling documents

These are documentation conflicts, not code gaps. The corrected/later contract should govern, and the source documents should be reconciled before final certification.

| ID | Conflict | Governing interpretation | Evidence |
|---|---|---|---|
| DOC-01 | `LP-US-002` describes WorkOS ownership of lender organizations, while the corrected contract makes Lender Organizations application-owned children of Brokerages. | DrawFlow owns Lender Organizations and workflow assignments. WorkOS owns shared identity, membership, role, permission, invitation, and webhook projections. | Spec `22-37`, `121-123`; brief `127-129`, `493-503`. |
| DOC-02 | Older stories/Phase 0 retain `admin`, `principle-broker`, `broker`, and `broker-staff`; the corrected lender contract requires exact `lender`, `lender-admin`, and `lender-staff` roles. | Use the corrected exact lender roles. Do not introduce Principal Broker or lender-manager as lender-organization administration roles. | Spec `124-130`; plan `356-358`; brief `147-148`, `493-503`. |
| DOC-03 | Permission rows and older stories describe lender self-administration; the corrected locked organization contract makes `/backoffice/lenders` the operating control plane and `/lender/organization` read-only. | Back Office performs organization/member operations; the lender application surface is read-only. | Spec `197-198`, `287-289`; brief `409-415`, `493-503`; plan `79-92`. |
| DOC-04 | Phase 7 says “five lender surfaces,” while the product contract also requires `/lender/organization`. | The five Phase 7 operating surfaces are dashboard, proposals, active Builds, Milestones, and Draws. Organization is still required under Phase 1 organization/access scope. | Brief `230-255`, `409-415`; plan `386`, `706-714`. |

## Phase-by-phase status

| Phase | Required outcome | Current status | Key evidence and gap |
|---|---|---|---|
| Phase 0 | Current-checkout inventory, decisions, consumer ledger, compatibility disposition, aligned documents. | **Partial / drifted** | Planning artifacts exist, but `bun run validate:lender-portal-execution` fails because the feature-brief source hash changed. Traceability still records only Phase 1 as verified, four Phase 2 packages as implementation-complete, and later packages as `ready`, despite substantial Phase 3–9 code. |
| Phase 1 | Canonical organization authorization, WorkOS-first operations, exact lender roles, Back Office control plane, read-only lender organization. | **Partial; P0 exception** | Strong application-owned organization/auth helpers exist (`convex/lenderOrganizationAccess.ts:195-348`; `convex/schema.ts:2026-2055`). `/backoffice/lenders` and `/lender/organization` exist. Public production seed mutations bypass the ownership boundary and write WorkOS projections directly. Locked Variant E is not the production composition. |
| Phase 2 | Separate approval, assignment, withdrawal, closing, activation, retained history, paired projections. | **Partial** | Backend lifecycle exists. Back Office close/activate is wired. Eligible lender close/activate is backend-only. Withdrawal/history UI is incomplete in the lender proposal surface. |
| Phase 3 | Immutable revisions, review-policy configuration, publication, pre-close lock, policy snapshot, migration. | **Blocked at intended consumer; cutover pending** | APIs and durable records exist, but no production UI calls configure/publish/lock or policy/revision list APIs. Closing requires the unreachable lock. Required migration/cutover indexes remain staged, and dry-run/apply/readback evidence is absent. |
| Phase 4 | Five-checkpoint exact-revision confirmation and repeatable remediation/reconfirmation loop. | **Partial / blocked remediation** | Lender acknowledge/approve/decline is wired. Back Office remediation, revision publication, explicit Builder-safe confirmation state, diffs, full history, and withdrawn presentation are not production-reachable. |
| Phase 5 | Stable Milestone/Draw identity, monotonic cycles, correction/resubmission, paired projections, privacy. | **Backend substantial; UI partial** | Canonical cycle helpers are integrated into production mutations and focused tests pass. Ordinary Builder, Back Office, and lender queue/detail consumers are missing or deep-link-only. |
| Phase 6 | Evidence, cost-document equality, Site Visit/report/photo, geofence preservation, approval evaluator, deactivation recount. | **Backend substantial; UI partial** | Strong backend tests cover evidence and Site Visit gates. Lender Site Visit completion and ordinary evidence consumers have no production UI. Shared-sheet adapters omit required evidence context. |
| Phase 7 | Every participant projection and GUI; direct locked promotions of Dashboard D, Proposal Review D, Build Detail C, Milestone Queue C, Draw Queue D, Builder Milestone A, and organization management E. | **Incomplete / blocked** | Milestone queue is static prototype data. Draw Queue, Build Detail, Proposal Review, Dashboard, organization management, and Builder correction diverge from locked contracts or omit required data/actions. The authoritative locked set is `docs/lender-portal-prototype-promotion.md:51-65` and `src/components/prototypes/README.md`. |
| Phase 8 | Four transactional notification classes, current recipient resolution, idempotent intents/delivery, safe deep links. | **Substantial / live delivery unverified** | Four-event allowlist and reauthorizing deep link exist. Static/focused evidence supports intent handling. Provider, inbox, browser-open, retry, and current-production recipient behavior were not demonstrated in this audit. |
| Phase 9 | Safe migration, security/race review, reconciliation, release controls, exact-commit E2E proof, rollback. | **In progress / release blocked** | Internal operator APIs and runbook exist in the dirty tree. Execution-control validation fails; manifests use broad types; exact production rehearsal, all ten journeys, human acceptance, and exact-commit certification are absent. |

## P0 release blockers

### GAP-01 — Production seed path violates WorkOS projection ownership and organization trust

**Requirements:** Phase 1 WorkOS-first ownership (`plan:380-388`); `LP-AC-ORG-02`, `LP-AC-ORG-04`, `LP-AC-ORG-08` (`brief:448-455`).

**Current implementation:**

- `dev_seedProductionFoundation` and `seedProductionDefaultsToProd` are public authenticated admin mutations that accept `workosOrganizationId` from the client: `convex/production_proposals.ts:1085-1178`.
- The seed calls `upsertWorkosProjection` and `upsertWorkosUserAndMembership`: `convex/production_proposals.ts:1183-1202`.
- The helpers insert/patch webhook-owned `workosOrganizations`, `users`, and `workosOrganizationMemberships`: `convex/production_proposals.ts:43162-43250`.
- The production Settings route exposes and invokes the mutation: `src/routes/backoffice/settings/index.tsx:139-148`, `265-270`.
- The mutation does not establish equality between a canonical authenticated organization context and the client-provided organization ID before these writes.

**Impact:** This breaks the canonical WorkOS boundary and creates a cross-organization mutation risk for any actor satisfying the broad admin role check. The Brokerage bootstrap role vocabulary is not itself a lender-organization role defect; the defect is the direct projection write and untrusted target scope.

**Required remediation:** Remove product-flow writes to WorkOS projection tables. Require pre-existing webhook projections, perform identity/membership changes through the WorkOS Management API, derive the target app context from authenticated canonical scope, and seed only DrawFlow-owned defaults.

### GAP-02 — Review-policy configuration and lock are unreachable, blocking closing

**Requirements:** `LP-SCOPE-04`, `LP-AC-POL-01–04`; Phase 3 and Phase 7 Back Office policy UI (`plan:441-469`, `647-650`).

**Current implementation:**

- Backend APIs exist: `configureProposalReviewPolicy` (`convex/production_proposals.ts:3357`), `publishProposalRevision` (`:3750`), `lockProposalReviewPolicy` (`:3884`), `getProposalPhase3ReviewControl` (`:4043`), policy versions (`:4181`), and revisions (`:4204`).
- No non-test `src` consumer references these APIs.
- `ProposalLenderAssignmentSection` renders a static policy boundary and disables **Edit review policy** unless an optional callback is supplied: `src/features/production-proposals/ProposalLenderAssignmentSection.tsx:962-1012`.
- The Back Office proposal route does not supply that callback: `src/routes/backoffice/proposals.$planId.tsx:661-717`.
- Closing readiness rejects a missing/mismatched lock: `convex/production_proposals.ts:37898-37935`.
- `recordProposalClosing` enforces the lock: `convex/production_proposals.ts:8249-8323`.

**Impact:** The production Back Office surface can attempt closing but cannot establish its mandatory precondition. External-capital closing is therefore not reachable through the intended product interface.

**Required remediation:** Wire a typed Back Office policy editor to the exact assignment and current revision, support configure/publish/explicit immutable lock, surface validation/quorum readiness, and handle stale, duplicate, and idempotent commands.

### GAP-03 — Decline remediation and revision publication loop are unreachable

**Requirements:** `LP-SCOPE-03`, `LP-AC-PROP-03–04`, E2E-03; Phase 4 remediation (`plan:549-580`, `647-655`, `699-701`).

**Current implementation:**

- Lender acknowledgement/approve/decline is wired through `LenderProposalNotificationReviewSurface`: `src/features/lender-portal/LenderProposalNotificationReviewSurface.tsx:35-55`, `77-102`.
- The lender proposal route loads lifecycle, confirmation, and current detail: `src/routes/lender/proposals/$proposalId.tsx:56-129`.
- `publishProposalRevision` (`convex/production_proposals.ts:3750`), `getBackofficeProposalRemediation` (`:5250`), and `getBuilderProposalConfirmationState` (`:5326`) have no production frontend consumer.
- The production review component does not render the required immutable diff/change highlights, full confirmation history, explicit withdrawn mode, or the five-acknowledgement locked interaction contract.

**Impact:** A decline can enter durable state, but Back Office cannot make the governed same-proposal update and publish revision N+1 through production UI. The next lender cycle and Builder-safe handoff cannot be completed as specified.

**Required remediation:** Add Back Office remediation/publish controls on the canonical proposal detail, render deterministic revision diffs and exact cycle state, expose the Builder-safe status, and prove decline → remediation → publish → full reconfirmation end to end.

### GAP-04 — Lender Milestone queue is prototype-only and does not consume canonical review truth

**Requirements:** `LP-SCOPE-07`, `LP-AC-PORTAL-02`; locked Milestone Queue Variant C (`plan:651-653`, `662`, `672`, `685-700`).

**Current implementation:**

- `/lender/milestones` imports `LenderMilestoneQueueVariantC` directly from the prototype route and has no Convex query: `src/routes/lender/milestones.tsx:1-4`, `39-74`.
- The exported component filters a hard-coded representative `milestoneRequests` array: `src/routes/lender.milestones-prototype.tsx:108-150`, `641-653`.
- Its **Request details** action is disabled pending canonical integration: `src/routes/lender.milestones-prototype.tsx:725-736`.
- A canonical paginated, actor-personalized lender review projector exists, but it is Build-scoped and unconsumed: `lender_portal_phase5.listLenderReviewRequests` requires `buildId` and pagination and calls `reviewerQueueProjection` with current-actor eligibility (`convex/lender_portal_phase5.ts:208-251`).
- `convex/lender_portal.ts` provides route-ready proposal list, Build list/detail, Draw queue, and dashboard projections but no all-assigned Milestone queue projection for `/lender/milestones`: `convex/lender_portal.ts:422-683`.
- The only production review entry is a notification/deep-link tuple requiring `milestoneId`, `reviewCycleId`, and `reviewCycleNumber`; the ordinary queue cannot produce it: `src/routes/lender/milestones.tsx:43-66`.

**Impact:** The primary Milestone operating surface displays fixture data and cannot exercise the canonical review cycle from normal navigation.

**Required remediation:** Reuse/extend the Phase 5 projector into a paginated all-assigned lender Milestone projection, adapt the locked Variant C directly to those rows, enable focused `MilestoneDetailSheet` review, and test all-assigned/default-action scopes, stale cycles, evidence, and privacy.

## P1 functional and reachability gaps

### GAP-05 — Draw queue uses real data but does not promote locked Variant D

`/lender/draws` queries `api.lender_portal.getLenderDrawQueue` (`src/routes/lender/draws.tsx:105-217`) but renders a new flat list rather than locked Build-grouped packets. It omits the all-assigned/action scope toggle, peer-group progress, evidence provenance, pooled funding position, and required lower-left color-plus-symbol state signal. Review opens only when `actionRequired` and cycle identifiers exist (`:197-204`). This is **Partial**, not prototype-only.

### GAP-06 — “Needs my action” is coarse and queues silently truncate

The production projections cap scans/results at 200/50 (`convex/lender_portal.ts:13-14`, `225-299`, `368-372`). Draw `actionRequired` uses organization permission plus request/cycle state, not whether the current actor already supplied a counting decision or which approval group remains outstanding (`convex/lender_portal.ts:586-638`). Build detail and dashboard repeat coarse state logic (`:498-510`, `826-873`) and slice results (`:909-922`). The canonical Phase 5 projector already supports actor personalization and pagination (`convex/lender_portal_phase5.ts:208+`). `LP-AC-PORTAL-02` requires **all** assigned requests and a truthful default **Needs my action** view.

### GAP-07 — Locked Build Detail Variant C data and interface are incomplete

The route correctly queries canonical detail (`src/routes/lender/builds/$buildId.tsx:47-78`) but renders a new basic `LenderBuildProjection` (`:95-305`). The backend validator/loader lacks actual dates, submilestones, receipt/invoice coverage, cost allocations, evidence assets, Site Visit report/photo state, participant-visible Collaboration, and complete pooled funding (`convex/lender_portal.ts:89-163`, `452-585`). The UI has flat Milestone/Draw facts and action-only review, not the locked expandable ledger, focused read-only Milestone sheet, canonical Budget/coverage, evidence, funding, and public Collaboration contract.

### GAP-08 — Proposal list/review is live but incomplete and contract-divergent

Proposal list/detail routes use canonical queries (`src/routes/lender/proposals/index.tsx:18-41`; `src/routes/lender/proposals/$proposalId.tsx:56-129`). The list is a flat table rather than required needs-action, in-progress, approved, declined/update-pending, closed, and withdrawn views (`src/features/lender-portfolio/LenderAssignedProposalList.tsx:17-90`). Review uses a generic production surface rather than the locked five-acknowledgement sheet and does not render `confirmation.history`, revision diffs, change highlights, or explicit withdrawn read-only state (`src/features/lender-portal/LenderProposalNotificationReviewSurface.tsx:104-220`).

### GAP-09 — Eligible lender closing and activation have no lender interface

`recordProposalClosing` and `activateClosedProposal` authorize eligible assigned lender actors (`convex/production_proposals.ts:8267-8332`, `8481-8505`). Only Back Office routes call them (`src/routes/backoffice/proposals.$planId.tsx:419-435`, `792-800`; `src/routes/backoffice/index.tsx:325-328`). Lender proposal UI exposes only acknowledgement/approve/decline. This violates `LP-AC-PROP-06–07`.

### GAP-10 — Ordinary participant interfaces for review cycles and Site Visits are missing

Phase 5 exposes Builder submit/resubmit, Back Office/lender queues/detail/evidence, and Back Office/lender Site Visit completion (`convex/lender_portal_phase5.ts:88-225`, `356-374`, `725-780`). No production frontend caller was found for the ordinary participant queue/detail APIs, `getLenderReviewEvidence`, or `completeLenderMilestoneSiteVisit`. Notification-correlated getters and decisions are wired, making the system largely deep-link-only. Backend tests prove report/photo and location-unverified behavior (`convex/lender_portal_phase6.test.ts:739`, `892`), but the intended actor cannot exercise it through product UI.

### GAP-11 — Shared review sheets receive incomplete canonical data

`LenderNotificationReviewSurface` reuses `DrawReviewSheet` and `MilestoneDetailSheet` and wires approve/reject (`src/features/lender-portal/LenderNotificationReviewSurface.tsx:156-327`). The Milestone adapter passes empty contractors/submilestones and omits receipts, Site Visit, evidence, history, and Collaboration (`:307-327`). The Draw adapter maps basic evidence labels and group gates but omits full funding, coverage, and history (`:248-303`). Queries bypass generated typing with `(api as any)` (`:95-114`). The shared component reuse is correct; the adapter contract is incomplete.

### GAP-12 — Builder Milestone Variant A is not promoted into production

The locked Builder correction contract requires **Needs revision**, instructions first, requirements/eligibility, cycle evidence/history, same-record resubmission, and privacy (`plan:54-77`, `663-668`, `702-714`). The selected prototype remains on `/builder/milestone-revision-detail-prototype`. Production Builder handling uses the sparse shared adapter and maps `correction_required` to generic `in_progress` (`src/features/lender-portal/LenderNotificationReviewSurface.tsx:353-356`). `submitBuilderReviewRequest` has no frontend caller. Builder Draw correction remains correctly deferred and must not be invented.

### GAP-13 — Organization management is functional but the locked Variant E was not promoted

`/backoffice/lenders` is wired to app-owned lender organization and WorkOS-first operations (`src/routes/backoffice/lenders/-lender-control-plane.tsx:115-147`). `/lender/organization` is protected, canonical, read-only, and has contact-admin/error states (`src/routes/lender/organization.tsx:22-75`). However, the approved `LenderOrganizationManagementVariantE`, shared `UserManagementDirectoryTable`, and `UserDetailSheet` composition is used only by the prototype route (`src/features/lender-organization-management/LenderOrganizationManagementVariantE.tsx:28-58`; `src/routes/lender.organization-management-prototype.tsx:59-67`). Production uses a separate composition, contrary to the locked direct-promotion contract.

### GAP-14 — Dashboard is live but partial and still owned by a prototype route module

`/lender` imports `LenderDashboardVariantD` from `src/routes/lender.prototype.tsx` (`src/routes/lender/index.tsx:1-13`). The exported component does query canonical organization/dashboard data (`src/routes/lender.prototype.tsx:697-723`) and is therefore not fixture-only. It does not expose the required explicit Milestone and Draw counts and remains coupled to a prototype route/variant module (`:795-825`). Per repository reuse rules, the accepted component should be extracted into a production-owned reusable component while preserving the locked hierarchy at both call sites.

## P2 quality, security-hardening, and release-evidence gaps

### GAP-15 — Prototype routes remain in the shipped production route graph

`src/routeTree.gen.ts` registers lender dashboard, confirmation, Build Detail, Milestone queue, Draw queue, review requirements, assignment, organization management, and Builder correction prototype routes (`src/routeTree.gen.ts:36-55`, `96-98`, `242-347`, `569-581`). Their source still labels representative/local behavior as prototype-only or TODO, including Milestones (`src/routes/lender.milestones-prototype.tsx:641-642`, `725-736`) and Draws (`src/routes/lender.draws-prototype.tsx:808-810`). They are not in primary navigation but are authorized direct routes. Release must explicitly gate/remove fixture-bearing routes or prove a product requirement for shipping them.

### GAP-16 — Phase 9 durable validators and TypeScript types remain broad

Phase 9 migration records use `v.any()` for `countsBefore`/`countsAfter` in function and schema validators (`convex/lender_portal_phase9.ts:87-105`; `convex/schema.ts:4678-4717`). Implementation also includes `decisionDependencyRows: any[]` and dynamic `as any` (`convex/lender_portal_phase9.ts:1227`, `2059-2060`). Exact release evidence should use explicit validators and table-specific typed helpers.

### GAP-17 — Lender organization projections use bounded N+1 reads

`listLenderOrganizations` loads up to 500 organizations and queries assignments per organization (`convex/lenderOrganizations.ts:99-190`). Current organization/member loaders query users and memberships per member (`convex/lenderOrganizations.ts:356-486`; `convex/lenderOrganizationAccess.ts:120-192`). Queries are bounded and indexed, so this is not a current security defect, but it risks Convex read/latency limits. Paginate and batch or precompute canonical projections.

### GAP-18 — Acceptance evidence does not prove required production journeys

Focused unit/integration tests pass, but frontend coverage centers on prototype contracts, list rendering, organization route/auth helpers, and query parsing. No test mounts and proves `CanonicalLenderDrawQueue`, `LenderBuildProjection`, `LenderDashboardVariantD`, or the production Milestone queue from canonical data. The only lender review-route test checks query parsing/status mapping (`src/routes/lender/-notification-review-routes.test.ts:11-76`). No current evidence proves all ten `LP-E2E` journeys, the `LP-VSG-01–10` transition-consumer gates, accessibility/focus/status announcements, provider/inbox delivery, or exact-release-commit behavior.

### GAP-19 — Phase 3 migration and staged-index cutover are not certified

The implementation plan requires dry-run/apply lifecycle and normalized-email backfills, fail-closed ambiguity handling, operator-visible issues, resumable withdrawal-manifest sealing, staged indexes, and authenticated readback (`plan:470-547`). The current schema still marks required migration/cutover indexes as staged (`convex/schema.ts:3903-3911`, `9117-9120`). Phase 9 migration/operator code exists, but this audit found no exact-environment evidence that the Phase 3 backfills and manifest cutover were dry-run, applied, read back, reconciled, unstaged, and rollback-rehearsed. Treat the staged state as intentionally pending until those gates pass; do not unstage indexes solely to make validation green.

## Production surface reachability matrix

| Surface / consumer | Production entry | Data/action owner | Status | Gap |
|---|---|---|---|---|
| Lender shell/navigation | `/lender` | `requireWorkspaceAccess`; `LenderShell` | **Substantial / unverified persona** | Navigation links dashboard, proposals, Builds, Milestones, Draws, and organization (`src/components/lender-shell.tsx:54-87`, `171-188`), but an eligible lender-persona browser journey was not available. |
| Dashboard Variant D | `/lender` | `lender_portal.getLenderDashboard` | **Partial** | Live data; incomplete counts/action semantics; implementation remains in prototype route module. |
| Proposal list | `/lender/proposals` | `lender_portal.listLenderAssignedProposals` | **Partial** | Live data; required lifecycle/action groupings absent. |
| Proposal detail/confirmation | `/lender/proposals/$proposalId` | canonical proposal lifecycle/confirmation/detail | **Partial** | Approve/decline wired; locked sheet, diffs, history, withdrawn mode, close/activate absent. |
| Active-Build list | `/lender/builds` | `lender_portal.listLenderActiveBuilds` | **Substantial / unverified persona** | Live current-assignment list links to detail; retained-history/no-live-access and eligible-persona reachability still need E2E proof. |
| Build Detail Variant C | `/lender/builds/$buildId` | `lender_portal.getLenderBuildDetail` | **Partial** | Canonical but incomplete projection and divergent interface. |
| Milestone queue Variant C | `/lender/milestones` | none | **Prototype-only / blocked** | Static rows; disabled ordinary detail; no canonical queue. |
| Milestone detail/review | notification/deep-link search tuple | Phase 5/6 review cycle + shared sheet | **Partial / deep-link-only** | Decision works with exact tuple; ordinary queue and complete evidence contract absent. |
| Draw queue Variant D | `/lender/draws` | `lender_portal.getLenderDrawQueue` | **Partial** | Live flat list; locked Build packets and complete context absent. |
| Draw detail/review | notification/deep-link search tuple | Phase 5/6 review cycle + shared sheet | **Partial / deep-link-only** | Decisions wired; complete funding/evidence/history and ordinary participant flows absent. |
| Lender organization | `/lender/organization` | `lenderOrganizations.getCurrentLenderOrganization` | **Substantial / unverified persona** | Correct read-only boundary in source; current browser persona could not enter it. |
| Back Office lender control plane | `/backoffice/lenders` | lenderOrganizations + WorkOS Management operations | **Partial** | Operationally wired; locked Variant E composition not promoted; browser persona lacked integration-admin access. |
| Back Office policy/remediation | Back Office proposal detail | production proposal APIs | **Missing / blocked** | Required configure/lock/remediate/publish controls absent. |
| Builder Milestone correction Variant A | required production Builder route/sheet | Phase 5 review-cycle commands | **Missing/partial** | Prototype remains; same-record resubmit consumer absent. |
| Site Visit completion | required Back Office/lender review surface | Phase 5/6 canonical Site Visit | **Missing consumer** | Backend and tests exist; no production participant control. |
| Notification link | `/notifications/$intentId` | `authorizeLenderPortalNotificationLink` | **Complete static path** | Reauthorizes and redirects only to returned `linkPath` (`src/routes/notifications/$intentId.tsx:10-42`); live email/provider proof remains. |
| Phase 9 operator workflow | authenticated Convex operator API/runbook | `lender_portal_phase9`, `lender_portal_release` | **Internal and reachable** | Direct operator API is a valid system interface; release evidence and exact typing remain incomplete. |

## Required backend capabilities without their intended production consumer

This table distinguishes valid internal/operator functions from product capabilities that require participant GUI/API reachability.

| Capability | Backend evidence | Required consumer | Current disposition |
|---|---|---|---|
| Configure review policy | `production_proposals.configureProposalReviewPolicy` | Back Office proposal detail | **No production caller; P0** |
| Publish immutable revision | `production_proposals.publishProposalRevision` | Back Office remediation | **No production caller; P0** |
| Lock review policy | `production_proposals.lockProposalReviewPolicy` | Back Office pre-close flow | **No production caller; P0** |
| Review policy/revision history | `getProposalPhase3ReviewControl`, `listProposalReviewPolicyVersions`, `listProposalRevisions` | Back Office history/readiness UI | **No production caller** |
| Back Office remediation projection | `getBackofficeProposalRemediation` | Back Office proposal detail | **No production caller; P0** |
| Builder-safe confirmation state | `getBuilderProposalConfirmationState` | Builder proposal/status UI | **No production caller** |
| Lender close | `recordProposalClosing` lender authorization | Lender proposal detail | **Back Office-only caller** |
| Lender activate | `activateClosedProposal` lender authorization | Lender proposal detail | **Back Office-only caller** |
| Submit/resubmit stable review request | Phase 5 Builder command | Builder canonical Milestone/Draw correction surface | **No ordinary production caller** |
| Participant review queues/details | Phase 5 Back Office/lender list/detail APIs | Back Office and lender queues | **No ordinary frontend caller** |
| Lender review evidence | `lender_portal_phase5.getLenderReviewEvidence` | Milestone/Draw detail sheet | **No complete consumer** |
| Lender Site Visit completion | `completeLenderMilestoneSiteVisit` | Lender Milestone review | **No production caller** |
| Phase 9 migration/release APIs | `lender_portal_phase9`, `lender_portal_release` | Authenticated operator/runbook | **Valid internal/system interface; no GUI required** |

## Requirements-family traceability

| Requirement family | Coverage judgment | Main unresolved gaps |
|---|---|---|
| `LP-SCOPE-01`, `LP-US-001–014`, `LP-AC-ORG-01–08` | **Partial** | WorkOS seed boundary breach; locked Variant E not promoted; documentation role/ownership conflicts. |
| `LP-SCOPE-02`, proposal lifecycle stories, `LP-AC-PROP-01–07` | **Partial** | Lender close/activate missing; withdrawal/history UX incomplete; closing blocked by policy lock. |
| `LP-SCOPE-03`, confirmation/remediation stories | **Partial / blocked** | Back Office remediation/publish, diffs, full history, Builder-safe state missing. |
| `LP-SCOPE-04`, policy stories, `LP-AC-POL-01–04` | **Backend present / UI blocked** | No configure/lock/history consumer; Phase 3 migration and staged-index cutover are not certified. |
| `LP-SCOPE-05`, evidence stories, `LP-AC-EVID-01–05` | **Backend substantial / UI partial** | Participant Site Visit/evidence interfaces and complete adapters missing. |
| `LP-SCOPE-06`, correction-cycle stories, `LP-AC-POL-05–07` | **Backend substantial / UI partial** | Builder Variant A/same-record resubmit missing; sparse privacy-shaped participant UI. |
| `LP-SCOPE-07`, `LP-AC-PORTAL-01–03` | **Incomplete** | Milestone queue blocked; locked Draw/Build/Proposal/Dashboard promotions partial; queues inaccurate/truncated. |
| `LP-NOTIF-01–04`, `LP-AC-PORTAL-04` | **Substantial / unverified live** | Provider/inbox/browser-open/retry/current-recipient evidence absent. |
| `LP-INV-01–18` | **Mixed** | Strong canonical tests for many lifecycle/evidence rules; WorkOS ownership exception, unreachable interfaces, queue truth, and exact production journey proof remain. |
| `LP-PERM-01–19` | **Mixed** | Corrected permission contract needs documentation reconciliation; several backend-authorized lender/participant actions lack UI. |
| `LP-E2E-01–10`, `LP-TEST-01–15`, `LP-QG-01–09`, `LP-VSG-01–10` | **Not certified** | No exact-commit, real-participant, all-journey browser/system proof. |
| `LP-FINAL-01–07` | **Fail** | Deferred/missing scope, stale traceability, unresolved security boundary, incomplete journeys, and no exact release certification. |

## Validation evidence from this audit

| Check | Result | Interpretation |
|---|---|---|
| Focused lender portal test run | **PASS** — 14 files, 98 tests | Covers organization auth, lifecycle/policy helpers, Phase 5/6 behavior, Phase 9, selected routes/components. Does not cover missing production consumers or all required journeys. |
| `bun x tsc -p convex/tsconfig.json --noEmit` | **PASS** | Convex TypeScript compiles. Broad `any`/`v.any()` remain design-quality gaps. |
| `bun run build` | **PASS** | Production build succeeds. Vite reports large-chunk warnings. Build reachability does not prove feature reachability. |
| `bun run validate:lender-portal-execution` | **FAIL** | `docs/lender_portal_mvp_feature_brief.md: source hash changed; refresh traceability and pre-implementation evidence intentionally`. |
| Browser route check as current local identity | **LIMITED** | `/lender` and `/backoffice/lenders` redirected to `/backoffice` under current role/permission context. Full lender/integration-admin flow and visual/accessibility checks were not possible with this identity. |
| External provider/inbox/retry verification | **NOT RUN / NOT PROVEN** | Required before Phase 8/9 release certification. |
| Ten multi-actor E2E journeys | **NOT PROVEN** | No current exact-commit evidence demonstrates all `LP-E2E-01–10`. |

Focused test files run:

- `convex/lenderOrganizations.test.ts`
- `convex/lender_portal.test.ts`
- `convex/lender_portal_phase3.test.ts`
- `convex/lender_portal_phase5.test.ts`
- `convex/lender_portal_phase6.test.ts`
- `convex/lender_portal_phase9.test.ts`
- `src/features/lender-organization-management/LenderOrganizationManagementVariantE.test.tsx`
- `src/features/lender-portfolio/LenderPortfolioLists.test.tsx`
- `src/features/production-proposals/ProposalLenderAssignmentSection.test.tsx`
- `src/routes/-lender.build-detail-overview-prototype.test.tsx`
- `src/routes/backoffice/lenders/-index.test.ts`
- `src/routes/backoffice/lenders/$lenderId/-route.test.tsx`
- `src/routes/lender/-notification-review-routes.test.ts`
- `src/routes/lender/-organization.test.tsx`

## Recommended remediation sequence

The dependency order matters. Fixing visual parity before canonical entry points and ownership would create more throwaway work.

### 1. Close the security and canonical-boundary blocker

- Remove direct application writes to WorkOS projection tables.
- Replace client-supplied organization targeting with authenticated canonical scope.
- Preserve WorkOS Management API → webhook/sync → read-only projection ownership.
- Add allow/deny tests for foreign organization IDs and verify no product mutation writes `users` or `workos*` projections.

### 2. Make proposal closing genuinely reachable

- Wire Back Office review-policy configure, validate, publish, and immutable lock.
- Wire decline remediation and revision publication on the same proposal.
- Render exact revision diffs, five checkpoint progress/history, and withdrawn read-only state.
- Add eligible lender close and separate activate actions.
- Prove E2E-02, E2E-03, E2E-04, and the relevant concurrency/idempotency cases.

### 3. Complete the canonical participant-review vertical

- Add paginated actor-personalized Milestone and Draw queue projections over Phase 5/6 truth.
- Replace coarse `actionRequired` logic and silent 50-row slicing.
- Wire ordinary queue → exact cycle → shared sheet → decision → next actor.
- Wire Builder same-record resubmission and both participant Site Visit completion paths.
- Fill shared-sheet adapters with explicit loaded/unloaded evidence, cost, Site Visit, submilestone, history, funding, and public Collaboration data.

### 4. Promote the locked interfaces directly

- Extract production-owned reusable versions of Dashboard D and the accepted proposal review composition.
- Promote Proposal Review D, Build Detail C, Milestone Queue C, Draw Queue D, Builder Milestone A, and organization management E without redesigning their hierarchy. The locked set is authoritative at `docs/lender-portal-prototype-promotion.md:51-65` and `src/components/prototypes/README.md`.
- Keep Builder Draw correction unavailable until its separate variant decision.
- Remove or gate fixture-bearing prototype routes from the production route graph.

### 5. Close Phase 8/9 operational and evidence gates

- Replace Phase 9 `any`/`v.any()` migration evidence with exact durable validators.
- Complete the Phase 3 lifecycle/normalized-email backfills, ambiguity review, withdrawal-manifest sealing, staged-index cutover, authenticated readback, and rollback rehearsal before unstaging indexes.
- Refresh traceability hashes and package statuses intentionally after the product changes land.
- Run migration dry-run/apply/readback and rollback rehearsal against the intended environment.
- Verify notification provider, inbox, retry, dedupe, recipient changes, safe content, and deep-link reauthorization.
- Run all ten real multi-actor journeys through supported routes at the exact release commit.
- Add keyboard, focus, validation, status-announcement, empty/loading/forbidden/stale, privacy, and responsive checks.

## Release acceptance checklist

The Lender Portal should not be called complete until every item below is checked:

- [ ] No product/runtime function writes WorkOS-owned projection tables.
- [ ] Review policy can be configured, validated, published, and immutably locked from Back Office UI.
- [ ] Proposal close succeeds only after the exact current approvals and locked policy.
- [ ] Lender decline → Back Office remediation → immutable revision → five-checkpoint reconfirmation works in production UI.
- [ ] Eligible lender and Back Office actors can independently close and then activate.
- [ ] Milestone and Draw queues contain all assigned requests, paginate, and default to truthful actor-specific **Needs my action**.
- [ ] Ordinary queue items open exact-cycle canonical shared review sheets.
- [ ] Locked Dashboard D, Proposal Review D, Build Detail C, Milestone Queue C, Draw Queue D, Builder Milestone A, and organization management E are directly promoted.
- [ ] Build Detail includes only the narrow authorized contract and all required cost/evidence/Site Visit/funding/Collaboration facts.
- [ ] Builder same-record correction/resubmission works without reviewer identity/private-rationale leakage.
- [ ] Eligible lender and Back Office actors can complete the same canonical Site Visit report/photo requirement.
- [ ] Four notification classes are verified through provider delivery, retry/dedupe, inbox content, and reauthorized links.
- [ ] Phase 3 lifecycle/normalized-email backfills, ambiguity handling, withdrawal-manifest sealing, staged-index cutover, authenticated readback, and rollback rehearsal are complete.
- [ ] Prototype fixture routes are gated/removed from the production route graph or explicitly accepted for release.
- [ ] Execution traceability validates against current source and every package/coverage group has exact-commit evidence.
- [ ] `LP-E2E-01–10`, `LP-TEST-01–15`, `LP-QG-01–09`, `LP-VSG-01–10`, and `LP-FINAL-01–07` pass at the release commit.

## Positive controls worth preserving

- Lender authorization validates shared WorkOS claim, active user/membership, exact lender role/assignment, active application organization, Brokerage scope, and decision capability (`convex/lenderOrganizationAccess.ts:195-348`).
- Reviewed product functions use fluent-convex builders and input/return validators; no application-function imports of generated query/mutation primitives were found.
- Canonical Phase 5/6 review-cycle, evidence, Site Visit, exact-cycle, privacy, quorum, and deactivation behavior has strong focused backend coverage.
- Builder-visible proposal approval projections do not expose private reviewer rationale in the reviewed generic detail path.
- Notification deep links reauthorize at open time rather than trusting the email URL alone.
- The current tree compiles and builds, providing a sound base for remediation rather than requiring a parallel implementation.

## Final conclusion

The Lender Portal has a strong backend foundation, but backend existence has been mistaken for feature completion in several phases. The dominant gap is **consumer reachability**: policy, remediation, Milestone review, Site Visit completion, lender closing/activation, and Builder correction either have no production interface or have only a notification/deep-link seam. The dominant UI gap is **promotion drift**: accepted prototypes were frequently imported partially, reimplemented with reduced data, or left as fixture routes instead of being productionized directly.

The permanent path is to repair the WorkOS boundary first, complete the proposal close/remediation vertical, complete the canonical participant-review projection/interface vertical, promote the locked interfaces directly, and then rebuild exact release evidence. No parallel lifecycle, identity, organization, evidence, Site Visit, Draw, notification, or audit system is needed.
