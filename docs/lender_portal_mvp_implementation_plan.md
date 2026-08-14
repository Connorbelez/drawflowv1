# DrawFlow Lender Portal MVP Implementation Plan

- **Status:** Phase Zero decisions complete; current-checkout preparation refreshed for `02e825e29936ce5f7a960a68dfca1438010e5645`
- **Feature contract:** [Confirmed feature brief](lender_portal_mvp_feature_brief.md)
- **Consolidated specification:** [Lender Portal MVP spec](lender_portal_mvp_spec.md)
- **Approved interfaces:** Lender Draw Queue Variant D, Build packets; Lender Build Detail Variant C, Precision console; Lender Organization Management Variant E, Shared user management operations; Builder Milestone Needs Revision Variant A, Inline revision notice; locked 2026-08-13
- **Historical planning baseline:** `e299f6a3`; provenance only, not the current implementation baseline

## Delivery rule

Implement the feature brief in the phases below. A phase is complete only when its exit criteria pass. Preserve one canonical domain model; queue counts, dashboards, and notification work are rebuildable projections of durable records.

Before product implementation, run
`bun run validate:lender-portal-execution` and open only the next ready packet
under `docs/lender-portal-mvp-execution/work-packages/`. A packet narrows
context and evidence ownership; it does not replace this plan or the feature
contract.

For a Lender Portal surface with an **Accepted**, **Approved**, or **Locked**
prototype in `src/components/prototypes/README.md`, directly promote that
selected prototype. Begin from its route/component structure and preserve its
information hierarchy, interaction gates, and authorization boundary. Replace
only representative local data and local-only actions with canonical loaders,
commands, validation, audit, and error states. Do not rebuild a new surface
from the requirements or use the prototype only as visual reference.

For an unselected prototype set, the prototype registry is a placeholder and
the corresponding production implementation is blocked pending a recorded
variant decision. `docs/lender-portal-prototype-promotion.md` defines the
selected promotion set and the required ticket language.

This plan does not authorize product-code work by itself.

### Mandatory current-checkout gate

The scaffold inventory below records historical planning evidence. It must not
be used to conclude that the current target branch lacks product code. Before
opening or implementing any phase, inspect the exact target branch and extend
its existing canonical owners. At minimum, reconcile:

- `convex/schema.ts` WorkOS projection and `brokerages` tables;
- the existing WorkOS-first management functions and webhook/sync ownership;
- `src/routes/backoffice/-user-management-surface.tsx` and
  `src/routes/backoffice/-user-management-detail-sheet.tsx`;
- `src/components/prototypes/LenderPrototypeShell.tsx`; and
- `src/routes/lender.organization-management-prototype.tsx` Variant E.

Search before building. Extract or extend current components when needed. Do
not recreate the historical scaffold, add duplicate identity domains, or use a
stale absence statement as permission to replace existing production code.

### Locked Builder Milestone revision implementation target

Variant A at
`/builder/milestone-revision-detail-prototype?variant=A` is the selected Builder
Milestone correction contract. A future authorized ticket must start from that
route's direct composition of the canonical `MilestoneDetailSheet`; it must not
create a detached correction workspace or rebuild a requirements-equivalent
surface.

The implementation must preserve these behaviors:

1. `correction_required` renders as Builder-facing **Needs revision**.
2. The same durable request returns to draft-like editing with required
   free-text `builderVisibleRevisionInstructions` before correction fields.
3. Locked requirements, current eligibility, cycle-scoped evidence, and
   authorized high-level history remain in the canonical sheet.
4. Reviewer identity and any separate `privateReviewerRationale` remain outside
   every Builder projection.
5. Resubmission opens cycle N+1 and resets every policy-required approval.

Replace prototype-local data and DOM/portal glue with typed canonical extension
seams, loaders, authorization, commands, audit, and error/concurrency states.
This selection is Milestone-specific. Builder Draw correction presentation
remains unselected until a separate user decision.

### Locked Lender Organization Management implementation contract

Variant E at `/lender/organization-management-prototype?variant=E` is approved
and locked. Production must directly promote its directory-first operations
surface, shared shadcn/TanStack `UserManagementDirectoryTable`, and shared
`UserDetailSheet`. Replace prototype-only execution with existing WorkOS-first
organization commands and projection reconciliation. Do not add a DrawFlow-owned
lender organization, membership, manager capability, or role alias. The full
contract is in `docs/lender-portal-prototype-promotion.md`.

### Locked Lender Build Detail implementation contract

The Lender Build Detail Overview is no longer an undecided placeholder.
Variant C at `/lender/build-detail-overview-prototype?variant=C` is approved and
locked. A future authorized production task must directly promote that route's
compact Precision console composition; a requirements-equivalent
reimplementation fails this plan.

Promotion preserves the narrow Build overview; expandable Milestone ledger
with canonical Budget, receipt/invoice coverage, and actual-or-planned dates;
focused read-only Milestone sheet navigation; pooled Build funding and Draw
records; review-attached evidence; and read-only participant-visible public
Collaboration. It must keep full-workspace capabilities, private data, generic
comments, and overview decisions or mutations out of the lender projection.

## Baseline and cutover

The current repository implements scaffold routes and UI primitives. Product workflows are specified in documentation but are not present in production code.

The documentation baseline now:

- reconciles `draw_flow_prd.md`, `uiManifest/routeManifest.md`, `uiManifest/screenManifest.md`, and `uiManifest/componentManifest.md` with the feature brief;
- separates Back Office approval, optional lender assignment, closing, and activation;
- preserves the canonical Build Workspace for builder and Back Office use while defining the lender's narrower Build detail;
- retains the existing Evidence Package and Site Visit concepts rather than create parallel evidence or inspection systems; and
- requires implementation to follow `convex/_generated/ai/guidelines.md` and `convex/fluent.ts` when Convex work begins.

## Cross-phase quality gates

Every phase that changes authorization or workflow state must include:

- `LP-QG-01` tenant-isolation and Lender Organization isolation tests;
- `LP-QG-02` allow/deny permission tests for every actor in the feature brief matrix;
- `LP-QG-03` state-transition tests for valid, stale, duplicate, and out-of-order actions;
- `LP-QG-04` paired-surface tests proving every initiating action appears correctly for the next responsible actor;
- `LP-QG-05` consumer-inventory checks for queues, counts, badges, notifications, history, and builder-safe projections affected by the transition;
- `LP-QG-06` append-only audit assertions for material changes;
- `LP-QG-07` idempotency tests for retried commands and notifications;
- `LP-QG-08` accessibility tests for keyboard flow, focus movement, validation, and status announcements; and
- `LP-QG-09` exact-cycle checks so a stale proposal revision or request cycle cannot receive a current decision.

## Blast-radius assessment

### Evidence and confidence

At baseline `e299f6a3`, the repository contains product documentation, scaffold routes, auth providers, and UI primitives. It does not contain implemented proposal, Build, Milestone, Draw, evidence, Site Visit, approval, queue, notification, or audit domains. The route, screen, and component manifests describe intended contracts but their product paths are not implemented.

Therefore:

- direct and transitive code-dependent counts are **not available** at this baseline;
- zero observed product symbols must not be interpreted as zero blast radius;
- there are no proven cross-repository callers at this baseline;
- no additional governing decision could be proven from decision memory, so the confirmed feature brief and repository agent guide govern this plan; and
- implementation must rerun symbol, caller, process, and external-consumer analysis against the exact target branch before Phase 1 and again before cutover.

### Exact-branch implementation inventory

This inventory was run on the actual checked-out implementation baseline: detached `HEAD` at `e299f6a3`. “Absent” means no implementation was found on this exact revision. “Unknown” means the repository cannot prove whether an external consumer exists.

| Inventory area | Verified implementation evidence | Phase Zero conclusion and implementation seam |
|---|---|---|
| Routes | Implemented routes are `src/routes/__root.tsx`, `/`, `/about`, `/callback`, `/api/auth/sign-in`, `/api/auth/sign-up`, and demo routes for Convex, TanStack Query, and WorkOS. | Every product route in `uiManifest/routeManifest.md`, including `/backoffice/*`, `/builder/*`, `/app/*`, and `/lender/*`, is absent. Implement the manifest as a new route contract; do not mistake it for shipped code. |
| Authentication shell | `src/routes/__root.tsx` calls WorkOS `getAuth`, configures Convex server HTTP auth, and mounts the WorkOS and Convex providers. `src/hooks/useUser.tsx` and `src/components/workos-user.tsx` consume authenticated user state. | Reuse the existing authentication shell. Add application authorization beneath it; do not make a second auth/session system. |
| Authorization and role consumers | `convex/fluent.ts` supplies generic identity-required builders. The baseline lacks the later organization-role consumers, tenant-resource grant, and current-assignment authorization consumers. | Reuse the canonical WorkOS organization, membership, role, and permission projections and brokerage boundary. Add assignment- and policy-derived authorization only; do not add an application-owned lender membership or manager capability. |
| WorkOS identity mirror | `convex/auth.ts` mirrors WorkOS user create/update/delete events into the `users` table. The delete handler currently deletes the mirrored user row. | Decide the durable subject-reference strategy before adding audit foreign keys. Membership deactivation must preserve history; WorkOS deletion handling must not erase material decision records. This is a schema-design seam, not an unresolved product decision. |
| Data/schema | `convex/schema.ts` contains only scaffold `products`, `todos`, and `users` tables; `users` has `authId`, `email`, and `name`. | Product-owned proposal/revision/assignment, policy snapshot, Build lifecycle, Milestone/Draw cycles, decision, evidence attachment, Site Visit, audit, notification intent, and read-projection records are absent. Organization and membership must arrive through the canonical WorkOS projection boundary on the implementation branch, not new product-owned tables. |
| Proposal and Build lifecycle | No proposal approval, lender assignment, closing, activation, or remediation command/state consumer exists. | Implement one canonical lifecycle and shared transition guards. There is no legacy approval command to wrap, but fixtures and future branches must not reintroduce approval-to-activation coupling. |
| Milestone, Draw, evidence, and Site Visit lifecycle | No implemented Milestone, Draw, Evidence Package, Site Visit, review-cycle, approval, rejection, correction, or resubmission domain exists. | Introduce same-record cycles and locked-policy evaluation together. Reuse the documented domain concepts rather than separate lender-only models. |
| Notifications and jobs | No product email sender, notification-intent table, notification worker/job, recipient resolver, or product notification template exists. | Build the four confirmed email classes from canonical transitions. Recipient resolution must use current eligibility and resource access at send time; do not add per-record reviewer assignment. |
| Read models and UI projections | No product dashboard, queue, list, count, badge, builder-safe view, Back Office view, or lender view is implemented. Generic UI primitives and Kibo Gantt/Kanban/status components exist. | Create explicit participant projections from canonical records. UI primitives may be reused, but they do not prove workflow behavior or access control. |
| APIs, webhooks, analytics, reporting, and cross-service consumers | Webhook/API behavior is documented in the PRD, but no product endpoint, webhook emitter, analytics event, reporting export, or cross-repository caller is implemented here. | No compatibility payload is required at this baseline. External consumers remain unknown, so new contracts must be versioned/documented and the inventory must be rerun before cutover. |
| Tests and fixtures | No test/spec files for product behavior were found. Existing demo code is not product coverage. | Create state-machine, permission, privacy, idempotency, exact-cycle, projection, and multi-actor journey tests with each phase. There is no legacy product fixture migration at this baseline. |

### Supplementary implementation-bearing branch inventory

Memtrace could not maintain an independent graph overlay for this linked worktree. It normalized the repository to the main checkout and indexed branch `08-13-lenderdashboard-prod` at `127f9c0c`. That graph contains 20,693 symbols, 71,269 relationships, and 44 detected processes. It is not evidence about `e299f6a3`; it is branch-scoped evidence of the refactor surface that must be rechecked if implementation starts from that branch or one descended from it.

| Later-branch seam | Verified consumers | Risk and required reconciliation |
|---|---|---|
| Proposal lifecycle | `convex/production_proposals.ts`; `src/features/production-proposals/ProductionProposalSurfaces.tsx`; Back Office and builder proposal routes | Critical. Replace simple approval/closing assumptions across both participant surfaces, current-revision guards, dashboard cards, Build creation, and route loaders. Do not add a lender-only write path. |
| Draw availability and refresh | `refreshProposalMilestoneDrawAvailability` in `convex/production_proposals.ts` | High product risk even though the graph reports 2 affected symbols. Policy-group completion must feed existing availability once, on the current cycle, without bypassing reimbursement gates. |
| Build funding and Draw decisions | `src/features/build-funding/BuildFundingWorkspace.tsx`; `DrawRejectionDialog.tsx`; `src/features/draw-workflow/DrawApprovalFlowSheet.tsx`; `BuildFundingWorkspace.test.tsx` | High graph risk: `FundingDrawApprovalActions` reaches 31 symbols across 9 files. Refactor approve/reject/correction/group progress and tests together. Preserve Back Office-only Draw release authority. |
| Back Office Build detail | `src/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx`; `MilestoneDetailSheet.tsx` | High. Show lender-group progress and private reasons to Back Office while keeping the canonical Build Workspace and current-cycle actions consistent. |
| Collaboration and queue projections | `src/features/build-collaboration/BuildCollaborationApprovalReview.tsx`; `convex/build_action_item_queue_projection.ts`; collaboration feed route projection | High. Existing action-item and collaboration projections must consume canonical approval state or be explicitly excluded from this MVP; they cannot retain stale actions. |
| Dashboard and cross-surface projections | `productionDashboardProposalCard`; Back Office dashboard route and mock data; proposal and active-Build lists | Medium graph risk for the dashboard card with 5 affected symbols. Update counts, badges, next action, partial-group progress, withdrawal, and activation states from canonical records. |
| Access and participant activation | `convex/activeBuildAccess.ts`; `convex/build_participant_activation.ts`; Back Office user-management surfaces; WorkOS membership helpers | Critical authorization seam. Reuse the canonical WorkOS organization/membership/role helpers and add current assignment and policy checks. Preserve the protected Principal Broker boundary and do not create lender-specific identity tables or a manager role. |
| Membership-derived notification eligibility | `isEligibleLenderMembership` and membership recipient logic in `convex/milestone_start.ts` | High product risk despite a local zero-dependent graph result. Replace Back Office-role-derived lender eligibility where relevant; deactivation must recalculate pending decisions and recipients. |
| Email delivery | `convex/email_transport.ts`, including `applyCommunicationOutcome` | Medium graph risk with 6 affected symbols. Emit the four confirmed intent classes, resolve current recipients, preserve idempotency, and prevent private-data leakage. |
| Calendar and other projections | Proposal calendar adapter; Build calendar and collaboration target helpers | Medium. Proposal state names and editability can leak into secondary projections; each consumer must either support the new lifecycle or stay unavailable for this feature. |
| Draw release downstream | Release controls in `BuildFundingWorkspace.tsx` and existing Draw-release routes/contracts | Critical boundary. Required approvals may make a Draw release-ready, but this feature does not grant external lenders release authority. Test the approval-to-release-readiness handoff and Back Office release guard. |

Memtrace reported a **High** raw impact for `FundingDrawApprovalActions`, **Medium** for `applyCommunicationOutcome`, **Medium** for `productionDashboardProposalCard`, and **Low** for the locally bounded availability and membership helpers. Treat the low or zero results as incomplete graph connectivity, not product-risk downgrades. Timeline lookup did not resolve these symbols, and the 30-day evolution window contained one index episode with no code delta, so temporal stability is unknown. Decision-memory recall was unavailable; no additional decision, ban, or contract is proven.

### Compatibility disposition

- **Clean introduction:** product domain records, product routes, commands, projections, notifications, and tests are absent at `e299f6a3`; introduce the canonical model without compatibility shims.
- **Refactor in place:** extend the existing WorkOS/Convex authentication shell, mirrored user identity, and fluent-convex builders. Do not replace them with parallel systems.
- **Documentation contract:** treat the PRD and UI manifests as intended consumers that must remain aligned with the feature brief.
- **Unknown external scope:** no external caller is proven by this repository. Record and version new API/webhook contracts, then repeat the external-consumer check before cutover.
- **Freshness gate:** if implementation begins from a revision other than `e299f6a3`, rerun this inventory before Phase 1 and add any discovered consumer to the ledger below.

### Risk rating

**Overall risk: High on baseline `e299f6a3`; Critical on an implementation-bearing branch until its existing consumers are reconciled.** The feature changes multiple participant workflows and introduces authorization-sensitive state shared by Back Office, lender, and builder surfaces. On a mature branch, expose the new lifecycle incrementally behind a feature gate, but keep one canonical write owner so old and new approval systems cannot diverge.

| Change cluster | Risk | Why |
|---|---:|---|
| Lender Organization and membership | High | Affects WorkOS projection binding, tenant/active-organization scope, canonical role authority, protected Principal Broker transfer, deactivation, invitations, and every lender query. |
| Proposal approval/assignment/closing/activation | Critical | Replaces one documented transition with several ordered state dimensions; an incomplete cutover can activate early or strand closing. |
| Lender decline/remediation/reconfirmation | Critical | Requires one canonical cycle across lender decisioning, Back Office editing, change highlighting, queues, email, and history. |
| Policy configuration and lock | Critical | Drives builder submission gates and two independent reviewer groups; stale or mutable policy data can approve invalid requests. |
| Milestone/Draw rejection and resubmission | Critical | Same-record history, approval resets, private reasons, and counterparty queues must move atomically. |
| Site Visit and receipt/invoice prerequisites | High | Crosses builder capture, attachment metadata, review visibility, exact totals, and approval eligibility. |
| Portal/read projections | High | Every list, badge, dashboard count, and default filter must derive from canonical state without leaking another lender's data. |
| Notifications | High | Recipient eligibility changes with assignment, membership, cycle, and withdrawal; email can leak private data or stale links. |
| Audit, migration, and external event contracts | High | State names and authority change across history, migrations, webhooks, APIs, reporting, and operational support. |

Critical clusters require a clean canonical-model cutover with explicit state migration and full multi-actor journey tests. Do not implement a parallel lender-only approval system.

## Refactor-scope map

The following scopes must be inventoried on the implementation branch. A ticket that changes a state transition owns the affected rows or records an explicit dependent ticket and keeps the feature disabled until all rows are complete.

| Scope | Required refactor |
|---|---|
| Domain state | Replace overloaded proposal/request status flags with explicit lifecycle, assignment, revision/cycle, approval-group, and activation state. |
| Commands and validation | Centralize transition eligibility, reason requirements, quorum evaluation, submission gates, approval resets, and stale-cycle rejection. |
| Back Office proposal queue | Add assigned-lender state, lender action/outcome, decline/remediation state, closing readiness, withdrawal state, and next action. |
| Back Office proposal detail/editor | Show lender checkpoint decision and private decline reason; update the same proposal; publish a revision; preview changes; resubmit for full lender confirmation. |
| Lender proposal list/detail | Add needs-action state, five-checkpoint flow, change highlights, approve/decline, history, and withdrawn read-only mode. |
| Builder proposal status | Separate Back Office approved, external lender review, pending closing, closed, and activated without exposing private lender details. |
| Back Office policy configuration | Configure, validate, version, and lock Draw/Milestone modes, quorums, and evidence switches against the confirmed proposal revision. |
| Builder Milestone/Draw submission | Show locked requirements, enforce site-visit/documented-total gates, accept correction, and resubmit the same request. |
| Back Office Milestone/Draw queues and detail | Show lender-group progress, own action, rejection/correction/resubmission cycles, evidence, and private history. |
| Lender Milestone/Draw queues and detail | Show all assigned work, default needs-my-action, evidence, policy progress, and permitted current-cycle decisions. |
| Build views | Keep the canonical builder/Back Office Build Workspace synchronized with high-level approval state; provide a separate narrow lender Build detail projection. |
| Site Visit surfaces | Allow eligible lender or Back Office completion; require report plus photo; link the qualifying visit to the current review cycle. |
| Attachments and evidence | Scope each attachment to a review context and cycle; expose it to both reviewing groups; carry exact receipt/invoice amount metadata. |
| Authorization | Enforce tenant, membership, assignment, historical-withdrawal, role, resource, revision, and decision-cycle checks in loaders and commands. |
| Read models | Rebuild dashboard counts, lists, badges, queue membership, and needs-my-action from canonical records after every transition. |
| Privacy projections | Produce explicit Back Office, lender, and Builder views; Builder surfaces receive published revision instructions but payloads, errors, audit summaries, email, and analytics omit reviewer identity/private reviewer rationale. |
| Audit/history | Record every material prior/new state, actor, role, cycle, reason where required, policy snapshot, assignment interval, and activation event. |
| Notifications | Trigger only the four confirmed email classes and update recipient eligibility after decline, revision, deactivation, approval, and withdrawal. |
| Existing production proposal consumers | Refactor proposal domain commands, Back Office review, builder proposal state, dashboard projection, calendar projection, Build creation, and closing/activation together on any branch where they exist. |
| Existing funding and release consumers | Refactor Draw approval actions, rejection dialog, approval sheet, Build detail, tests, and release-readiness calculation; external lender decisions must not grant Draw release. |
| Existing collaboration consumers | Reconcile action-item queue, collaboration approval review, feed targets, and stale-action removal with canonical current-cycle state, or keep those projections disabled for the feature. |
| API/webhook/event consumers | Inventory any implemented consumers on the target branch; version or migrate payloads that currently assume approval immediately activates or that one admin is the sole approver. |
| Tests, fixtures, and seed data | Replace simple approval fixtures with internal/external, assigned/withdrawn, revision, quorum, rejection, correction, and privacy cases. |
| Documentation and support | Update PRD, manifests, operational runbooks, audit terminology, and customer-support state explanations with shipped behavior. |

## Multi-actor flow completeness

### Lender proposal decline, remediation, and approval

This vertical slice is incomplete until all of the following work together:

1. Lender confirmation detail validates the current revision and requires a decline reason.
2. The canonical transition records the declined confirmation cycle without reversing Back Office approval.
3. The Back Office proposal queue changes to **Lender declined — update required** or equivalent product copy.
4. Back Office proposal detail shows the private decline reason and the checkpoint/revision that was declined.
5. Back Office edits the same proposal record rather than cloning or replacing it.
6. Publishing the update creates a monotonic revision and deterministic change set.
7. The old lender decision cannot satisfy the new revision.
8. The lender proposal list returns to needs-action and the full five-checkpoint flow restarts with changes highlighted.
9. The post-decline update email is emitted once to eligible recipients.
10. Authorized history shows both cycles; builder-safe state omits lender identity and decline reason.
11. Closing stays blocked until the current revision has both required approvals and the matching policy is locked.

### Phase Zero transition-consumer ledger

| Transition | Initiating surface | Required counterparty refactor | Other mandatory consumers | Delivery owner and acceptance proof |
|---|---|---|---|---|
| Back Office provisions brokerage and initial Principal Broker | Existing brokerage/WorkOS administration boundary | Variant E organization administration appears for the canonical organization | Membership/role history, quorum-context validation, recipients, audit | Phase 1; Journey 8 |
| Admin or Principal Broker administers an organization member | Approved Variant E surface using WorkOS-first commands | User access and current eligibility reconcile without changing review policy | Queues, quorum recount, recipients, audit | Phases 1, 6, and 8; Journey 8 |
| Back Office approves proposal | Back Office proposal detail | Lender assignment control becomes eligible; builder status changes | Audit, queue counts, closing eligibility | Phase 2; Journeys 1–3 |
| Back Office assigns lender | Back Office proposal detail | Lender proposal list/detail gains the record and action | ACL, approval-required email, audit, dashboard | Phases 2 and 4; Journeys 2–4 |
| Lender declines | Lender confirmation | Back Office queue/detail/editor gains remediation task and private reason | Revision history, outcome routing, closing gate, builder-safe status | Phase 4; Journey 3 |
| Back Office publishes remediation | Back Office editor | Lender receives a new full cycle with change highlights | Diff, post-decline update email, stale-decision guard, audit | Phases 3 and 4; Journey 3 |
| Lender approves proposal | Lender confirmation | Back Office sees lender requirement complete and closing readiness | Dashboard, history, outcome or next-action email | Phase 4; Journeys 2 and 3 |
| Back Office withdraws lender | Back Office proposal detail | Lender record becomes read-only; actions disappear | Internal closing path, ACL, withdrawal email, audit | Phases 2 and 4; Journey 4 |
| Proposal closes | Back Office or eligible lender closing surface | Both sides see closed/not-yet-active state | Locked policy, lists, audit | Phase 2; Journeys 1–3 |
| Build activates | Back Office or eligible lender closed-proposal surface | Builder and both reviewer sides see live Build state | Active-Build lists, dashboard, audit | Phase 2; Journeys 1 and 2 |
| Back Office locks review policy | Back Office policy configuration | Lender confirmation and builder requirements consume the exact immutable snapshot | Closing eligibility, Milestone/Draw gates, audit | Phase 3; Journeys 2, 5, and 7 |
| Builder attaches/replaces review evidence | Builder request surface | Both required reviewer details receive the same current-cycle evidence | Attachment ACL, documented total, Site Visit qualification, audit | Phases 5 and 6; Journeys 6 and 7 |
| Builder submits Milestone/Draw | Builder request surface | Back Office and lender queues add current-cycle work as policy requires | Evidence ACL, needs-action, approval-required email, audit | Phases 5 and 7; Journeys 5 and 7 |
| Reviewer rejects request | Back Office or lender review detail | Builder correction state; other reviewer side loses current action | Approval reset, private history, outcome email | Phases 5 and 7; Journey 6 |
| Builder resubmits correction | Builder request surface | Both required reviewer groups receive the new cycle | Stale-decision guard, needs-action, approval-required email, audit | Phases 5 and 7; Journey 6 |
| Reviewer approves request | Back Office or lender review detail | Other required group sees partial progress or request completes | Queue removal/update, outcome or next-action email, audit; completed Draw enters existing Back Office release-readiness flow | Phases 5 and 7; Journeys 5 and 6 |
| Required Site Visit completes | Lender or Back Office Site Visit surface | Both review details show qualifying report/photos; builder gate updates | Evidence ACL, eligibility, audit | Phase 5; Journey 7 |
| Membership deactivates | Back Office or active same-organization Admin/Principal Broker; protected Principal Broker target rules apply | Lender navigation/queues/access and quorum eligibility update after canonical sync | Pending approval recount, replacement action, recipients, audit | Phases 1, 6, and 8; Journey 8 |

## Vertical-slice completion gate

No workflow ticket is complete because one actor can click its new action. For each material transition, the implementing ticket or tightly bound ticket set must prove:

Each numbered proof obligation has the stable identifier `LP-VSG-NN`, where
`NN` is the zero-padded list number.

1. one canonical command owns the transition and validates actor, resource, revision/cycle, and prior state;
2. the initiating actor's surface exposes only valid actions;
3. every next-responsible actor receives the correct queue/list/detail state;
4. unrelated actors lose stale actions and cannot submit stale commands;
5. dashboard counts, badges, and needs-my-action projections update;
6. audit/history and privacy-safe participant projections update;
7. required notification intent is emitted once, or explicitly proven out of scope;
8. attachment and document visibility changes correctly;
9. internal/external and assigned/withdrawn variants are covered; and
10. an end-to-end test traverses the transition from one participant surface to the next.

## Existing documentation surfaces affected

The baseline implementation must refactor these verified documentation contracts before product code is accepted:

| Contract | Refactor scope |
|---|---|
| `draw_flow_prd.md` proposal flows | Separate Back Office approval, lender assignment/confirmation, closing, and activation; add remediation loop. |
| `draw_flow_prd.md` evidence and approval flows | Replace sole-admin finality with locked Back Office/lender/both modes while preserving reimbursement and evidence rules. |
| `draw_flow_prd.md` organization/RBAC sections | Reuse the canonical WorkOS brokerage organization, membership, and role boundary; keep lender assignment and review eligibility as product-owned authorization. |
| `uiManifest/routeManifest.md` RTE-016/RTE-017 | Expand Back Office proposal queue/detail for assignment, lender decision, remediation, withdrawal, closing readiness, and activation. |
| `uiManifest/routeManifest.md` RTE-008/RTE-009 | Keep canonical Build Workspace for builder/Back Office and define narrow lender Build access rather than reuse the full loader. |
| `uiManifest/routeManifest.md` RTE-018 through RTE-025 | Reconcile evidence, Site Visit, Milestone, and Draw routes with two reviewer groups and same-record resubmission. |
| `uiManifest/routeManifest.md` RTE-027/RTE-028 | Restrict policy mutation to Back Office and expand audit coverage for lender decisions and assignments. |
| `uiManifest/screenManifest.md` SCR-010/SCR-011 | Add Back Office lender-assignment, decline remediation, revision diff, withdrawal, and closing state. |
| `uiManifest/screenManifest.md` SCR-012 through SCR-023 | Split lender detail from full workspace and update evidence/approval screens for policy-group progress and correction cycles. |
| `uiManifest/screenManifest.md` SCR-026/SCR-027 | Add pre-closing immutable policy lock and full decision/assignment history. |
| `uiManifest/componentManifest.md` | Reconcile planned decision, status, history, policy, queue, evidence, and role-aware controls; do not treat unresolved component IDs as implemented code. |

## Required end-to-end journeys

These journeys are release gates, not optional browser spot checks:

Each numbered journey uses the same stable `LP-E2E-NN` identifier as the
corresponding journey in `lender_portal_mvp_spec.md`.

1. **Internal capital:** Back Office approval -> no lender assignment -> internal close -> Back Office activation.
2. **External approval:** Back Office approval -> lender assignment -> full lender confirmation -> close -> activation by each authorized side in separate tests.
3. **Lender remediation:** lender decline with reason -> Back Office queue/detail remediation -> update same proposal -> revision/diff -> full lender reconfirmation -> close.
4. **Withdrawal:** assignment -> lender access -> withdrawal -> read-only historical record -> internal closing path -> no live Build lender access.
5. **Both-groups approval:** builder submission -> lender then Back Office approval, and Back Office then lender approval -> same completed result -> Draw becomes release-ready without granting lender release authority.
6. **Correction:** either reviewer rejects with Builder-visible revision instructions -> canonical Milestone detail shows **Needs revision** and draft-like editing -> same-record resubmission -> all approvals reset -> current-cycle approval.
7. **Evidence gates:** required Site Visit fails without report/photo; required receipts fail until documented total exactly equals actual cost; both reviewer sides see qualifying evidence.
8. **Membership edge:** Admin/Principal Broker role changes and member deactivation update access, quorum eligibility, needs-action, and recipients without erasing history; protected Principal Broker transfer preserves exactly one active owner.
9. **Privacy:** Builder UI, query payloads, errors, email, and audit summaries show published revision instructions but never reveal reviewer identity or private reviewer rationale.
10. **Concurrency:** approval versus rejection, withdrawal versus lender decision, revision publication versus stale decision, closing versus policy change, and duplicate activation resolve deterministically.

## Phase 0 — Resolve decisions and align documentation

**Status:** Product decisions completed on 2026-08-13 for historical baseline
`e299f6a3`. The current-checkout implementation inventory was refreshed on
2026-08-14 for `02e825e29936ce5f7a960a68dfca1438010e5645`; see
`docs/lender-portal-mvp-execution/current-checkout-preflight.md`. Re-run that
gate if the checkout changes before Phase 1 product implementation.

**Depends on:** Confirmed feature brief.

### Work

1. [x] Resolve the four required implementation decisions in the feature brief.
2. [x] Record one broad internal Back Office Admin role; reuse canonical `admin`, `principle-broker`, `broker`, and `broker-staff` organization roles and prohibit a lender-manager alias or application-layer capability.
3. [x] Inventory symbols, callers, routes, processes, APIs/webhooks, jobs, data, tests, projections, and external consumers on exact baseline `e299f6a3`; record absent and unknown areas explicitly.
4. [x] Create the transition-consumer ledger in this plan, mapping each material command to participant surfaces, queues/read models, notifications, audit, attachments, and external contracts.
5. [x] Update the PRD proposal flow to separate Back Office Admin approval, optional lender assignment, closing, and activation.
6. [x] Reconcile the route, screen, and component manifests for Back Office Admin, lender, and builder surfaces in the cross-surface matrix—not only the five Lender Portal surfaces.
7. [x] Mark the existing full Build Workspace as builder/Back Office Admin context, not the lender portal detail surface.
8. [x] Define canonical terminology and event names across the feature brief, PRD, manifests, audit, email, analytics, and external event contracts.
9. [x] Record compatibility disposition: clean introduction for absent product domains, in-place extension for auth seams, documented contracts for intended routes/surfaces, and versioned handling for any external consumer discovered before cutover.

### Exit criteria

- No source document says that Back Office approval immediately creates or activates a Build.
- Route and screen manifests cover every confirmed surface without adding a non-goal.
- The Back Office Admin mapping, shared closing authority, deactivation-counting rule, and email recipients have recorded decisions.
- The transition-consumer ledger has an owner and acceptance test for every affected consumer.
- Symbol/process impact and cross-service analysis has been rerun against the exact implementation branch; unavailable evidence is recorded as unknown, not zero.

## Phase 1 — Integrate canonical organization authorization and operations

**Depends on:** Phase 0 role mapping.

### Work

1. `LP-P1-W01` Reconcile the target branch's existing brokerage mapping, WorkOS organization, membership, role, permission, invitation, and webhook/sync projection boundaries before adding product authorization.
2. `LP-P1-W02` Use one active organization context per lender request while preserving canonical support for a user to hold memberships in more than one WorkOS organization.
3. `LP-P1-W03` Implement authorization helpers for Back Office Admin, lender Admin, Principal Broker, lender member, builder, current assignment, historical withdrawn access, and locked review-policy eligibility.
4. `LP-P1-W04` Reuse the existing WorkOS-first invite, membership-role-change, and membership-deactivation commands; never write WorkOS projection tables from product flows.
5. `LP-P1-W05` Enforce organization-local administration and the supported `admin`, `principle-broker`, `broker`, and `broker-staff` role set.
6. `LP-P1-W06` Fail closed when normal role removal or deactivation targets the active Principal Broker; route the user to the protected transfer-of-control workflow and preserve exactly one active Principal Broker.
7. `LP-P1-W07` Directly promote Variant E using the shared `UserManagementDirectoryTable` and `UserDetailSheet`, including Access, Administration, Review relationship, and History tabs.
8. `LP-P1-W08` Expose command validation, authorization, pending sync, success, and failure. Reconcile route/query/write access, assignment and quorum context, recipients, queues, and audit/notification work without mutating Back Office review requirements.
9. `LP-P1-W09` Audit brokerage provisioning, invitation, role changes, membership activation/deactivation, and Principal Broker transfer with actor, role, timestamp, prior/new state, warning, and reason where applicable.

### Tests

- `LP-P1-T01` Users with multiple WorkOS memberships remain isolated to the active organization context for every lender request.
- `LP-P1-T02` Admin and Principal Broker commands cannot cross organization boundaries or assign unsupported roles.
- `LP-P1-T03` Normal role removal or deactivation cannot leave the organization without exactly one active Principal Broker.
- `LP-P1-T04` WorkOS command failure or delayed sync never produces an optimistic projection write or false success state.
- `LP-P1-T05` Deactivated users cannot perform new lender reads or actions; withdrawn-record access remains available only to eligible active users in the former Lender Organization.
- `LP-P1-T06` Historical memberships and decisions survive deactivation.
- `LP-P1-T07` Membership changes recalculate pending review eligibility, queues, and recipients without changing the locked review policy.

### Exit criteria

- `LP-P1-X01` Every lender-facing query and command resolves one active organization context and validates canonical membership plus product assignment/policy authority.
- `LP-P1-X02` Back Office Admin, Lender Admin, and Principal Broker administration matches the feature brief permission matrix and the approved Variant E contract.
- `LP-P1-X03` No application-owned lender organization, membership, manager capability, or role alias is introduced.
- `LP-P1-X04` Cross-tenant and cross-lender access suites are red for forbidden cases and green for allowed cases.

## Phase 2 — Separate proposal approval, assignment, closing, and activation

**Depends on:** Phase 1 authorization.

### Work

1. Model proposal lifecycle, external assignment, lender confirmation, closing, and activation as explicit state dimensions.
2. Require Back Office Admin approval before external assignment.
3. Restrict external assignment to external-capital proposals and one current Lender Organization.
4. Create append-only assignment intervals so withdrawal closes an assignment instead of deleting it.
5. Preserve the withdrawn organization's review-time proposal documents and history under read-only authorization.
6. Calculate closing eligibility from current funding path, assignment, Back Office Admin approval, and lender approval.
7. Keep withdrawal in approved/pending-closing state and restore the normal internal closing path.
8. Authorize closing by Back Office Admin or an eligible currently assigned lender user after applicable prerequisites pass.
9. Separate closed from active and authorize activation by Back Office Admin or an eligible currently assigned lender user.
10. Reject stale, duplicate, post-closing, and unauthorized assignment/withdrawal/closing/activation commands.
11. Replace every Back Office Admin and builder read model that treats approval as activation with explicit approved/pending-closing/closed/active state.
12. Define queue and detail projections for assignment, lender action, withdrawal, closing readiness, and activation so the UI phase cannot implement only the lender half.

### Tests

- Internal proposals never require or accept external assignment.
- Assignment fails before Back Office Admin approval.
- Active assignment blocks closing until both approvals exist.
- Withdrawal removes lender authority without reversing Back Office approval or deleting history.
- Either Back Office Admin or an eligible assigned lender user can record closing after prerequisites.
- Closing and activation are distinct audited transitions.

### Exit criteria

- Proposal state can represent every transition in the feature brief without boolean ambiguity.
- Withdrawn lender read access is bounded to the retained record.
- No path activates a Build directly from proposal approval.

## Phase 3 — Add revisions, policy configuration, and pre-closing lock

**Depends on:** Phase 2 proposal lifecycle.

### Work

1. Add immutable proposal revisions under one stable proposal identity.
2. Snapshot the five lender confirmation checkpoints for every lender-reviewable revision.
3. Produce deterministic changed-field data between the prior lender-reviewed revision and the new revision.
4. Add Build-wide Draw and Milestone approval modes.
5. Add independent Milestone site-visit-required and receipt/invoice-required switches.
6. Validate each lender quorum against active assigned-organization membership at lock time.
7. For an assigned external proposal, require the policy to match the current lender-confirmed revision before locking.
8. Lock the policy before closing with actor, time, proposal revision, assignment, and active-member-count evidence.
9. Copy the locked policy into the closed Build control state without an MVP mutation or override path.

### Tests

- Revisions are monotonic and older snapshots cannot be overwritten.
- Diff output is deterministic and contains only fields in the confirmed checkpoints.
- Every approval-mode combination validates correctly.
- Quorum values outside `1..active members` fail.
- Policy writes fail after lock/closing.

### Exit criteria

- A closed Build always has one immutable review-policy snapshot.
- The current proposal revision and the revision reviewed by the lender are unambiguous.

## Phase 4 — Implement the guided lender confirmation flow

**Depends on:** Phase 3 checkpoint snapshots and policy lock data.

### Work

1. Create one confirmation cycle for the current proposal revision and assignment.
2. Require explicit confirmation of Milestone count, Budget, schedule/timeline, builder, and access/review policy.
3. Keep all checkpoint fields read-only for lender users.
4. Require a reason for decline.
5. On decline, retain Back Office approval and pending-closing state.
6. Let Back Office update the same proposal, create the next revision, and open a new full confirmation cycle.
7. Show changes from the prior lender-reviewed revision while requiring every checkpoint again.
8. Preserve all cycles and decisions in authorized history.
9. Count one eligible lender-user approval of the current revision toward proposal closing eligibility.
10. Produce the Back Office remediation projection: declined checkpoint/revision, private reason, update-required state, editable same-proposal target, and publish-new-revision command.
11. Produce lender and builder projections for the same transition with their permitted fields only.

### Tests

- A partial flow cannot approve the proposal.
- A lender cannot edit checkpoint data.
- Decline without reason fails.
- An earlier revision's approval cannot satisfy a later revision.
- Update-in-place retains proposal identity and every prior cycle.
- Lender decline creates a Back Office remediation task; publishing remediation creates a new lender needs-action task.
- Builder-safe proposal state omits lender identity and private decline reason throughout the loop.

### Exit criteria

- The external closing gate is driven by a complete approval of the current revision.
- Decline/update/re-review can repeat without lost history or duplicate proposal records.

## Phase 5 — Build durable Milestone and Draw request cycles

**Depends on:** Phase 3 locked policy.

### Work

1. Introduce one stable review-request identity for each submitted Milestone completion or Draw request.
2. Add monotonic decision cycles under that request.
3. Snapshot submission data, requirements, and relevant evidence references per cycle.
4. Model builder correction as a request state, not a new request.
5. Require Builder-visible revision instructions for rejection and permit separate reviewer-only private rationale.
6. On resubmission, increment the cycle and start with no current approvals.
7. Provide a Builder-safe projection containing requirements, eligibility, high-level state, and published revision instructions.
8. Preserve reviewer identity and private-rationale fields behind explicit authorization.
9. Define paired Back Office and lender queue/detail projections for partial approval, rejection, correction, resubmission, and completion.
10. Define the builder correction projection and resubmission command against the same request identity.

### Tests

- Rejection and resubmission retain request identity.
- Every required approval resets on resubmission.
- Stale-cycle decisions fail.
- Builder projections include published revision instructions but never reviewer identity or private reviewer rationale, including in errors and notification payloads.

### Exit criteria

- Milestone and Draw workflows share one explicit cycle pattern without conflating their domain-specific data.
- Complete history can be reconstructed from revisions, cycles, decisions, and audit events.

## Phase 6 — Enforce evidence and approval policy

**Depends on:** Phases 3 and 5.

### Work

1. Reuse the canonical Site Visit domain for lender- or Back Office-completed visits.
2. Require completed report state and at least one photo before the required-site-visit gate passes.
3. Preserve location-unverified evidence after geofence failure or unavailability.
4. Attach receipt/invoice records to the Milestone review and store amounts in Build currency integer units.
5. Calculate documented total from eligible current-cycle receipt/invoice records.
6. Block builder Milestone submission when the required documented total differs from actual cost.
7. Implement Back Office, lender-quorum, and both-groups evaluation for Milestone and Draw cycles.
8. Allow required groups to approve in either order.
9. When a lender approver is deactivated before terminal completion, preserve the decision in history, remove its contribution from current eligibility, and require replacement active-user approval. Do not reopen terminal completed or closed work.
10. Expose the same submitted evidence package to both authorized reviewing groups.

### Tests

- Site visit without report or photo fails the gate.
- Receipt/invoice equality uses exact integer arithmetic and excludes ineligible cycles or attachments.
- Every policy combination passes only when its required groups approve.
- Duplicate user approval does not increase quorum.
- Any rejection moves the request to correction and prevents old approvals from completing it.

### Exit criteria

- Policy evaluation is deterministic from the locked policy and current decision cycle.
- Submission and approval gates cannot be bypassed through direct commands.

## Phase 7 — Complete queue projections and every participant UI

**Depends on:** Phases 1, 2, 4, 5, and 6.

### Work

1. Complete query projections for all Back Office, lender, and builder consumers in the transition-consumer ledger.
2. Refactor Back Office proposal queue/detail/editor for assignment, lender decline/remediation, publish-new-revision, lender approval, withdrawal, closing readiness, and activation.
3. Refactor builder proposal status to distinguish Back Office approval, lender review, pending closing, closed, and active while preserving privacy.
4. Implement Back Office policy configuration and lock UI against the exact proposal revision the lender confirms.
5. Define lender dashboard counts, proposal list, active-Build list, Milestone queue, and Draw queue.
6. Derive **Needs my action** from current membership, assignment, request cycle, and outstanding policy group requirements.
7. Include every assigned request in the all-assigned queue view.
8. Implement the lender shell and navigation only after route-manifest reconciliation.
9. Implement guided proposal confirmation with progress, change highlights, decline reason, and history.
10. Directly promote locked Lender Build Detail Variant C: compact narrow
    overview, expandable Milestone ledger with canonical Budget,
    receipt/invoice coverage and actual-or-planned dates, focused read-only
    Milestone sheet navigation, pooled Build funding and Draw records,
    review-attached evidence, and read-only participant-visible public
    Collaboration. Do not rebuild an equivalent surface from the requirements.
11. Refactor Back Office and lender Milestone/Draw queue and detail surfaces to show the same canonical cycle, group progress, evidence, rejection, correction, and resubmission state.
12. Directly promote locked Builder Milestone Variant A inside the canonical
    `MilestoneDetailSheet`: render **Needs revision**, published revision
    instructions, locked requirements, current eligibility, and same-record
    resubmission. Replace prototype-only local/DOM integration with typed seams.
    Keep Builder Draw correction presentation as an explicit unselected
    placeholder; do not infer the Milestone layout.
13. Implement required Site Visit completion for eligible Back Office and lender users and display the same qualifying report on both review sides.
14. Keep the canonical builder/Back Office Build Workspace synchronized with high-level approval state without exposing its timeline/Gantt, contractors, internal notes, or broad document library to lender loaders.
15. Implement read-only withdrawn proposal records.
16. Add clear loading, empty, forbidden, withdrawn, stale-cycle, correction, partial-approval, and concurrent-decision states on every participant surface.
17. Directly promote every selected Lender Portal prototype listed in
    `docs/lender-portal-prototype-promotion.md`; do not replace it with a
    requirements-equivalent design. Leave undecided prototype sets as explicit
    implementation placeholders until a variant is selected.
18. For the Lender Draw Queue, directly promote locked Variant D from
    `/lender/draws-prototype?variant=D`. Preserve Build-grouped packets, the
    lower-left color-and-symbol action signal, peer approval-group progress,
    current-cycle evidence provenance, and reconciled pooled funding. Replace
    representative data with permission-shaped canonical projections; do not
    introduce Draw-level receipt/Site Visit gates, Milestone or Draw Group
    funding attribution, or a parallel Draw model.

### Tests

- Queue counts and rows are correct for users with and without an outstanding action.
- Default filter is **Needs my action**; all-assigned remains available.
- Withdrawn and active records have different permissions and actions.
- Lender Build loaders do not return deferred or Back Office-only fields.
- Lender Build Milestone rows use canonical Budget and cost-document coverage,
  prefer actual dates when available, fall back to planned dates, and display
  an explicit not-recorded state instead of inferring missing values.
- Expanded Milestone rows and focused Milestone-sheet navigation expose only
  authorized canonical child records and no overview decision command.
- Lender Build Collaboration contains only participant-visible public Build
  updates; internal notes, private reviewer rationale, and a generic comment
  composer are absent from both loader output and rendered UI.
- Lender decline is actionable from the Back Office queue/detail through update, revision publication, and renewed lender confirmation.
- Either-side Milestone/Draw rejection is actionable from the builder surface through same-record resubmission and renewed review on both sides.
- Back Office, lender, and builder views agree on canonical state while exposing different permitted detail.
- The locked Builder Milestone Variant A renders **Needs revision** and `builderVisibleRevisionInstructions` in the canonical `MilestoneDetailSheet` before the correction fields, while excluding reviewer identity and `privateReviewerRationale`.
- Blocked, eligible, and pending footer behavior matches the same-request cycle N+1 lifecycle. Production uses typed extension seams, loaders, and commands instead of the prototype's `MutationObserver`, portal, or DOM integration glue.
- Keyboard, focus, error summary, and live status behavior pass accessibility checks.

### Exit criteria

- All five confirmed portal surfaces and every paired Back Office/builder refactor work against real authorization and state transitions.
- UI visibility is not used as the security boundary.
- Narrow Build detail has no data dependency on deferred surfaces.
- Narrow Build detail matches locked Variant C; a requirements-equivalent
  reimplementation does not satisfy this phase.
- Every row in the transition-consumer ledger has implementation and acceptance evidence.
- The Builder Milestone production surface has parity evidence against locked Variant A. Builder Draw presentation remains unimplemented and unselected until a separate user decision.

## Phase 8 — Add transactional notification delivery

**Depends on:** Durable event boundaries from Phases 2, 4, 5, and 6; Phase 0 recipient matrix.

### Work

1. Emit notification intents transactionally for approval-required, post-decline proposal update, withdrawal, and approval-outcome events.
2. Resolve recipients from current eligibility and resource access without a per-record assignment system:
   - approval-required: every eligible actor in each outstanding lender or Back Office Admin group;
   - post-decline proposal update and withdrawal: all active users in the assigned or withdrawn Lender Organization; and
   - approval outcome: appropriate Back Office Admin reviewers and the builder proposal owner or request submitter.
3. When an outcome creates the next group's action, emit approval-required instead of a duplicate outcome email.
4. Deduplicate by event, resource, cycle, and recipient.
5. Send private-data-safe email content with links to authorized portal records.
6. Re-check authorization on link open; never rely on possession of an email URL.
7. Record delivery attempts, success/failure, and retry state.
8. Do not create general progress notification triggers.

### Tests

- Retries do not send duplicate email for the same event and recipient.
- Membership change or withdrawal affects recipient eligibility correctly.
- Email payloads omit private reviewer identity and rejection reason where the recipient lacks access.
- Unsupported progress changes emit no email intent.

### Exit criteria

- The four confirmed email event classes deliver reliably and idempotently.
- Notification records are auditable and tenant-scoped.

## Phase 9 — Migration, security review, and release

**Depends on:** Phases 1–8.

### Work

1. Inventory any data created after this baseline before defining migration behavior.
2. Migrate proposal states so approval, closing, and activation are explicit and no approved proposal is activated accidentally.
3. Backfill policy and assignment data only from verifiable source fields; stop on ambiguous records.
4. Rebuild queue/dashboard projections from canonical data and compare totals.
5. Run authorization review across every query, command, attachment URL, email link, and historical-withdrawn access path.
6. Run workflow concurrency tests for approval races, rejection versus approval, withdrawal versus confirmation, deactivation, closing, and activation.
7. Verify audit completeness for every material state change.
8. Roll out behind a tenant-scoped release control with observable errors and notification delivery health.
9. Run all required end-to-end journeys from the blast-radius analysis across real participant surfaces.
10. Compare actual changed symbols/processes and event consumers with the Phase 0 inventory; investigate every unplanned dependency before release.

### Exit criteria

- Migration is repeatable, audited, and safe on partial failure.
- Security review finds no cross-tenant, cross-lender, stale-cycle, or private-data exposure.
- All feature-brief acceptance criteria have automated coverage or explicit human acceptance evidence.
- Every required end-to-end journey passes on the exact release commit.
- No transition is implemented on only one participant surface.
- Release rollback does not delete revisions, decisions, assignment history, or audit events.

## Suggested workstream decomposition

Create implementation tickets only after Phase 0. Keep ownership aligned to canonical domains:

| Workstream | Owns | Must not own |
|---|---|---|
| Identity and access | Canonical WorkOS organization/membership/role integration, brokerage mapping, Principal Broker protection, assignment authorization helpers | Parallel identity tables or proposal/review state machines |
| Proposal lifecycle | Approval, assignment, withdrawal, closing eligibility, activation, revisions, confirmation | Portal-only state copies |
| Policy and approvals | Locked policy, request cycles, decisions, quorum evaluation | Membership source of truth |
| Evidence | Review attachments, documented totals, Site Visit qualification | Separate lender-only evidence store |
| Read models | Participant-specific projections, queue membership, counts, needs-my-action, privacy shaping | Independent workflow state |
| Participant surfaces | Paired Back Office, lender, and builder routes, loaders, accessibility, and transition handoffs | Security decisions enforced only in UI or lender-only workflow copies |
| Notifications | Transactional intents, recipient resolution, delivery, idempotency | Workflow state ownership |

## Final acceptance gate

The MVP is complete only when:

Each numbered condition has the stable identifier `LP-FINAL-NN`, where `NN` is
the zero-padded list number.

1. every acceptance criterion in `lender_portal_mvp_feature_brief.md` passes;
2. all required implementation decisions are recorded and reflected in tests;
3. no deferred surface or notification class has entered the release;
4. every transition-consumer ledger row and required multi-actor journey has acceptance evidence;
5. final symbol/process/external-consumer impact matches the recorded blast-radius inventory;
6. repository documentation matches shipped routes, permissions, and state transitions; and
7. release evidence is tied to the exact commit being accepted.
