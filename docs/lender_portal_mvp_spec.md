# DrawFlow Lender Portal MVP

Status: ready-for-agent; Lender Draw Queue Variant D, Lender Organization Management Variant E, Lender Build Detail Variant C, and Builder Milestone Needs Revision Variant A approved and locked 2026-08-13

Historical planning baseline: `e299f6a3`. This is provenance only. Implementers
must inspect and extend the exact current target branch; they must not rebuild
the historical scaffold or ignore existing production domains and components.

Source artifacts:

- [Confirmed feature brief](lender_portal_mvp_feature_brief.md)
- [Sequenced implementation plan](lender_portal_mvp_implementation_plan.md)
- [DrawFlow product requirements](draw_flow_prd.md)
- [Prototype decision registry](../src/components/prototypes/README.md)
- [Prototype promotion contract](lender-portal-prototype-promotion.md)
- [Route manifest](uiManifest/routeManifest.md)
- [Screen manifest](uiManifest/screenManifest.md)
- [Component manifest](uiManifest/componentManifest.md)
- [Proposal lifecycle epic](agileEpics/EPIC-010.md)

### Locked Lender Build Detail decision

The Lender Build Detail Overview is locked to Variant C, the compact Precision
console at `/lender/build-detail-overview-prototype?variant=C`. A future
authorized implementation must directly promote this selected route and
composition. It must not start from scratch or deliver a
requirements-equivalent redesign. This decision is a durable implementation
contract; it does not authorize product-code work by the prototype task.

### Locked Builder Milestone revision decision

Variant A at
`/builder/milestone-revision-detail-prototype?variant=A` is the approved and
locked Builder Milestone correction interaction. A future authorized
implementation must directly promote its composition of the canonical
`MilestoneDetailSheet`; it must not create a detached correction workspace or
rebuild a requirements-equivalent surface.

The internal request state is `correction_required`; the Builder label is
**Needs revision**. The same durable request returns to draft-like editing with
required free-text `builderVisibleRevisionInstructions`, locked requirements,
current eligibility, and authorized high-level history. Reviewer identity and
any separate `privateReviewerRationale` remain reviewer-only. Resubmission opens
cycle N+1 and resets every policy-required approval. This records a product
contract only and does not authorize product-code work. Builder Draw correction
presentation remains unselected until a separate user decision.

## Problem Statement

DrawFlow does not yet provide an external lender workflow that is separate from its internal Back Office workflow. An external capital provider needs a narrow, organization-scoped portal for confirming a Build Proposal, reviewing relevant evidence, and contributing approvals required by the Build's locked policy. Back Office must retain control of proposal approval, lender assignment, remediation, policy configuration, brokerage provisioning/support, and internal decisions. Canonical Admin and Principal Broker members operate their own organization membership surface.

The workflow crosses proposal, closing, Build activation, Milestone, Draw, evidence, Site Visit, membership, notification, and audit boundaries. Implementing only the lender-facing controls would leave Back Office and builder surfaces unable to handle lender decline, remediation, rejection, correction, resubmission, withdrawal, or approval handoffs. The feature therefore needs one canonical lifecycle used by all participant surfaces, with explicit authorization, immutable history, current-cycle decisions, and privacy-safe projections.

## Solution

Reuse the canonical brokerage-scoped WorkOS organization, membership, role, and permission model already projected into DrawFlow. Authorized `admin` and `principle-broker` members administer their active organization through WorkOS-first commands. DrawFlow adds assignment- and policy-derived product authorization, but no parallel lender organization, membership, manager, or role system. The active Principal Broker is protected by a transfer-of-control workflow that preserves exactly one active Principal Broker.

Separate Back Office proposal approval, optional external lender assignment, closing, and live Build activation. External assignment is available only for external capital and only after Back Office approval. An assigned proposal requires one eligible lender-user approval of the current proposal revision before closing. Once all prerequisites pass, either Back Office Admin or an eligible assigned lender user may record closing, then either side may perform the separate activation action. Withdrawal restores the internal closing path while retaining a read-only lender record of the assignment-period proposal, documents, and history.

Replace simple lender proposal approval with a guided confirmation of Milestone count, Budget, schedule/timeline, builder, and access/review policy. A decline requires a reason. Back Office updates the same proposal, publishes a new immutable revision, and sends the lender through every checkpoint again with changes highlighted.

Before closing, Back Office locks one Build-wide review policy. Milestone and Draw approval independently require Back Office Admin, a numeric lender quorum, or both. Milestone policy also independently controls Site Visit and receipt/invoice requirements. Rejected Milestone and Draw requests return to builder correction and are resubmitted as a new cycle on the same durable request. All required approvals reset. The Builder receives published revision instructions, while reviewer identity and any separate private reviewer rationale remain private.

Provide the external Lender Portal with a dashboard, proposal list and confirmation detail, active-Build list and narrow detail, Milestone queue and detail, Draw queue and detail, and organization administration for authorized Admin and Principal Broker members. Directly promote accepted Organization Management Variant E, including the shared user-management table and member sheet. Use canonical domain commands and participant-specific projections so Back Office, lender, and builder surfaces remain synchronized without exposing Back Office-only data. The narrow Build detail directly promotes locked Variant C: overview; expandable Milestone records with canonical Budget, receipt/invoice coverage, and actual-or-planned dates; focused read-only Milestone-sheet navigation; pooled Build funding and Draw records; review-attached evidence; and participant-visible public Collaboration in read-only form.

## Risk-Rated Blast Radius

### Evidence boundary

The historical `e299f6a3` baseline was a documentation-first scaffold. The
canonical checkout now contains implementation-bearing WorkOS projections,
brokerage and product domains, Back Office user-management components, lender
workspace/prototype routes, and tests. Every implementation task must inventory
the exact target branch and adapt those current owners. Historical absence
claims do not authorize a from-scratch or parallel implementation.

Numeric direct/transitive dependent counts are unavailable for this exact worktree. Memtrace normalized this linked worktree to the main checkout, so its graph is not evidence for baseline `e299f6a3`. No cross-repository caller or governing decision-memory record can be proven. These areas are **unknown**, not zero. If implementation begins from a revision other than the stated baseline, rerun symbol, caller, process, history, decision, and external-consumer analysis before Phase 1 and again before cutover.

The supplementary Memtrace graph covers branch `08-13-lenderdashboard-prod` at `127f9c0c`, with 20,693 symbols, 71,269 relationships, and 44 detected processes. It proves that a likely implementation-bearing branch already has coupled proposal review, Build funding, Draw rejection and release, Back Office Build detail, queue projection, calendar, access, participant activation, and email-transport consumers. Its risk anchors include a **High** Draw-approval action surface with 31 affected symbols across 9 files, a **Medium** email-outcome seam with 6 affected symbols, a **Medium** proposal dashboard projection with 5 affected symbols, and a proposal Draw-availability seam with 2 affected symbols. Low or zero graph counts for locally nested or weakly traced symbols are not proof of low product risk.

**Overall risk: High on baseline `e299f6a3`; Critical on an implementation-bearing branch until its existing consumers are reconciled.** The baseline permits a clean introduction of product domains, but the feature spans several authorization-sensitive, multi-actor state machines. A later branch requires an incremental, feature-gated exposure with one canonical write owner and a complete consumer migration. An incomplete cross-surface cutover can create unauthorized access, early closing, invalid approval, private-data leakage, incorrect Draw release readiness, or stranded work.

| Change cluster | Risk | Blast radius and primary failure mode | Required control |
|---|---:|---|---|
| Lender Organization and membership | High | WorkOS projection binding, tenant/active-organization scope, canonical role authority, invitation, deactivation, Principal Broker transfer, quorum context, notifications, and all lender reads/actions. | Reuse canonical WorkOS and brokerage boundaries before any lender route; preserve subject, membership, and role history. |
| Proposal approval, assignment, withdrawal, closing, and activation | Critical | Back Office and builder proposal state, lender access, closing eligibility, Build creation/activation, audit, email, API/webhook semantics. | One explicit lifecycle with guarded commands; no approval-to-activation shortcut. |
| Lender decline, remediation, revision, and reconfirmation | Critical | Lender confirmation, Back Office queue/detail/editor, builder-safe state, revision diff, closing gate, history, and email. | Deliver as one vertical slice across every participant; older decisions cannot satisfy a new revision. |
| Policy configuration and pre-closing lock | Critical | Proposal confirmation, quorum validation, Build control state, builder gates, reviewer actions, audit, and every Milestone/Draw cycle. | Immutable snapshot tied to the confirmed revision; no post-closing override. |
| Milestone/Draw rejection and same-record resubmission | Critical | Builder correction, both reviewer queues, approval reset, current-cycle guards, history, privacy, counts, and outcomes. | Canonical request-cycle pattern with atomic rejection/reset and stale-cycle rejection. |
| Site Visit and receipt/invoice evidence | High | Builder submission, attachment amounts, mobile/field completion, geofence state, both review surfaces, eligibility, and audit. | Reuse canonical evidence/Site Visit domains; exact integer totals and report-plus-photo qualification. |
| Participant read models and portal routes | High | Dashboard counts, Needs my action, all-assigned queues, Back Office remediation, builder-safe state, withdrawn history, narrow Build data. | Derive explicit role-safe projections from canonical state; loaders enforce the same authorization as commands. |
| Notifications | High | Recipient eligibility changes with membership, assignment, revision/cycle, group progress, withdrawal, and privacy rules. | Transactional intents, current-eligibility resolution, idempotency, and authorization on link open. |
| Audit, migration, API/webhook, analytics, and support contracts | High | Historical interpretation and external consumers may assume simple approval or one sole admin. | Version new contracts, migrate only verifiable data, rebuild projections, and inventory unknown consumers before release. |

Critical clusters require a clean canonical-model cutover and complete multi-actor journey evidence. A feature flag may control release exposure, but it must not permit old and new lifecycle owners to make conflicting decisions.

## User Stories

1. As a Back Office Admin, I want to provision a lender brokerage and its initial Principal Broker through the canonical brokerage/WorkOS boundary, so that external capital providers reuse the existing tenant identity model.
2. As an implementation team, we want WorkOS to remain authoritative for lender organizations, memberships, roles, and permissions, so that DrawFlow does not create a second identity system.
3. As a user with multiple WorkOS memberships, I want every lender request scoped to one active organization context, so that authorization remains unambiguous without prohibiting canonical memberships.
4. As an active Lender Admin or Principal Broker, I want to invite members into my active organization, so that I can maintain my lender team.
5. As an active Lender Admin or Principal Broker, I want to change a member among the supported `admin`, `principle-broker`, `broker`, and `broker-staff` roles, so that access remains explicit and canonical.
6. As an active Lender Admin or Principal Broker, I want to deactivate members in my active organization, so that departed users lose future access after the WorkOS command completes.
7. As an organization administrator, I want my administration rights limited to my active organization, so that I cannot affect another capital provider.
8. As a Principal Broker, I want normal removal and deactivation blocked for the active Principal Broker, so that the organization never loses its required owner.
9. As an authorized administrator, I want Principal Broker control changed only through a protected transfer workflow, so that exactly one active Principal Broker remains.
10. As an implementation team, we want no lender-manager alias or application-only capability, so that role checks do not drift from the canonical role model.
11. As an authorized reviewer, I want membership and role history retained after deactivation, so that past authority can be reconstructed.
12. As a deactivated lender user, I want my prior decisions preserved in history, so that audit records remain truthful.
13. As a Back Office Admin, I want a deactivated lender user's decision to stop counting on pending work, so that only current active members satisfy approval requirements.
14. As an authorized reviewer, I want terminal completed or closed work to remain unchanged after approver deactivation, so that historical outcomes are stable.
15. As a Back Office Admin, I want to approve a Build Proposal before assigning an external lender, so that internal approval remains the first capital decision.
16. As a Back Office Admin, I want external assignment available only for external-capital proposals, so that internally funded proposals use the normal internal path.
17. As a Back Office Admin, I want at most one current external Lender Organization assigned to a proposal, so that approval authority is unambiguous.
18. As an assigned lender user, I want access to the current approved proposal and relevant documents, so that I can evaluate the external capital commitment.
19. As an assigned lender user, I want to confirm the number of Milestones explicitly, so that I acknowledge the proposed scope breakdown.
20. As an assigned lender user, I want to confirm the Budget explicitly, so that I acknowledge the proposed financial plan.
21. As an assigned lender user, I want to confirm the schedule and timeline explicitly, so that I acknowledge the delivery assumptions.
22. As an assigned lender user, I want to confirm the builder explicitly, so that I acknowledge the delivery party.
23. As an assigned lender user, I want to confirm the access and review policy explicitly, so that I acknowledge the controls that will govern the Build.
24. As an assigned lender user, I want every confirmation checkpoint to be read-only, so that Back Office remains the proposal editor.
25. As an assigned lender user, I want partial checkpoint progress to remain insufficient for approval, so that I cannot approve without completing the full flow.
26. As an assigned lender user, I want to decline with a required reason, so that Back Office receives actionable remediation context.
27. As a Back Office Admin, I want lender decline to appear in my proposal queue and detail with its private reason, so that I can remediate the proposal.
28. As a Back Office Admin, I want to update the same proposal after decline, so that the proposal retains one stable identity.
29. As an assigned lender user, I want a changed proposal to start a new full confirmation cycle, so that an older approval cannot apply to new terms.
30. As an assigned lender user, I want changes from the prior lender-reviewed revision highlighted, so that I can focus my re-review without skipping any checkpoint.
31. As an authorized reviewer, I want every proposal revision, checkpoint result, decision, actor, timestamp, and decline reason retained, so that the complete decision path is auditable.
32. As a Back Office Admin, I want lender decline to leave Back Office approval intact, so that remediation does not restart internal proposal approval.
33. As a Back Office Admin, I want an assigned proposal to remain pending closing until both current approvals exist, so that it cannot close early.
34. As an eligible lender user, I want to record closing after all prerequisites pass, so that either authorized side can complete the closing event.
35. As a Back Office Admin, I want to record closing after all prerequisites pass, so that the internal team is not blocked on lender operation.
36. As an authorized closer, I want closing to remain separate from Build activation, so that closing does not make a Build live automatically.
37. As an eligible assigned lender user, I want to activate a closed Build, so that either authorized side can start live execution.
38. As a Back Office Admin, I want to activate a closed Build, so that the internal team can start live execution.
39. As a Back Office Admin, I want to withdraw an external assignment before closing, so that the proposal can return to the internal closing path.
40. As a former assigned lender user, I want a withdrawn proposal to remain read-only with its assignment-period documents and history, so that my prior participation is preserved.
41. As a Back Office Admin, I want withdrawal to preserve Back Office approval and pending-closing state, so that the proposal does not regress unnecessarily.
42. As a builder, I want a high-level proposal state that distinguishes Back Office approval, lender review, pending closing, closed, and active, so that I understand progress without seeing private reviewer detail.
43. As a Back Office Admin, I want to configure independent Milestone and Draw approval modes before closing, so that each workflow uses the intended control model.
44. As a Back Office Admin, I want each approval mode to support Back Office only, lender quorum only, or both, so that policy matches the capital arrangement.
45. As a Back Office Admin, I want lender quorum validated from one through the active membership count, so that an impossible quorum cannot be locked.
46. As an authorized reviewer, I want Back Office and lender approvals to arrive in either order when both are required, so that workflow order does not affect the result.
47. As a Back Office Admin, I want to configure Site Visit required independently from Milestone approval mode, so that inspection policy is not coupled to reviewer composition.
48. As a Back Office Admin, I want to configure receipt/invoice evidence independently from Milestone approval mode, so that cost-document policy is not coupled to reviewer composition.
49. As an assigned lender user, I want the policy I confirmed to match the policy locked for closing, so that the Build cannot close under changed controls without re-confirmation.
50. As an authorized participant, I want the locked policy to be immutable after closing, so that review obligations cannot change during execution.
51. As a Back Office Admin, I want a policy lock to retain its actor, time, proposal revision, assigned organization, and quorum-validation membership count, so that the locked decision is reproducible.
52. As a builder, I want to see the locked evidence and approval requirements before submitting a Milestone, so that I know what completion requires.
53. As a builder, I want Milestone submission blocked when required receipt/invoice totals do not equal actual cost, so that incomplete cost evidence cannot enter review.
54. As an authorized reviewer, I want receipt and invoice amounts calculated in exact Build-currency integer units, so that equality checks do not drift through rounding.
55. As an eligible lender user, I want to complete a required Site Visit, so that lender evidence can satisfy the shared inspection requirement.
56. As a Back Office Admin, I want to complete a required Site Visit, so that the internal side can satisfy the shared inspection requirement.
57. As an authorized reviewer, I want a Site Visit to qualify only with a completed report and at least one photo, so that inspection evidence is substantive.
58. As an evidence uploader, I want geofence failure or unavailability to preserve my evidence as location-unverified, so that valid work is not discarded.
59. As a Back Office reviewer, I want to see all evidence attached to the current Milestone or Draw review, so that I can decide from the same package as the lender.
60. As an assigned lender reviewer, I want to see the same relevant review evidence as Back Office, so that both required groups decide from the same package.
61. As a Back Office or lender reviewer, I want rejection to require Builder-visible revision instructions, with optional separate private rationale, so that the builder knows what to correct without exposing reviewer-only context.
62. As a builder, I want a rejected Milestone or Draw returned to correction on the same request, so that I do not lose its history or create duplicates.
63. As a builder, I want resubmission to create a new decision cycle and reset all required approvals, so that prior-cycle decisions cannot approve changed work.
64. As an authorized reviewer, I want stale-cycle decisions rejected, so that concurrent or delayed actions cannot alter the current request.
65. As a builder, I want to see requirements, high-level request state, and published revision instructions without reviewer identity or private reviewer rationale, so that I can act while reviewer privacy is maintained.
66. As an authorized reviewer, I want the full request-cycle history, including prior evidence and decisions, so that repeated correction can be reconstructed.
67. As an external lender user, I want a dashboard of assigned proposals, live Builds, Milestones, and Draws, so that I can find my work quickly.
68. As an external lender user, I want dashboard and queue counts to prioritize my outstanding actions, so that urgent reviews are visible.
69. As an external lender user, I want a proposal list with needs-action, in-progress, approved, declined/update-pending, closed, and withdrawn states, so that I can understand each assigned record.
70. As an external lender user, I want an active-Build list limited to current assignments, so that withdrawn assignment history does not become live Build access.
71. As an external lender user, I want the locked Variant C Build detail with a narrow overview, expandable Milestone records, pooled Draw position and records, relevant review attachments, and public Build collaboration, so that I receive useful canonical information without Back Office-only data.
72. As an external lender user, I want the full timeline/Gantt, Draw Group visualization, contractors, internal notes, private reviewer rationale, broad document library, generic comment composer, and overview approval/release controls excluded, so that the portal remains narrow, read-only, and privacy-safe.
73. As an external lender user, I want Milestone and Draw queues to contain every assigned request and default to Needs my action, so that I can act quickly without losing access to other assigned work.
74. As an external lender user, I want queue detail to show locked requirements, current-cycle evidence, approval-group progress, and valid actions, so that I can make an informed decision.
75. As a Back Office Admin, I want my proposal, Milestone, and Draw surfaces to show lender state and next actions, so that external workflow is not implemented only in the lender portal.
76. As a builder, I want my submission and correction surfaces synchronized with reviewer state, so that I can respond to rejection and resubmit successfully.
77. As a Lender Admin or Principal Broker, I want the approved Variant E operations surface for my active organization, so that I can search members and stage, review, and execute authorized invite, role-change, deactivation, and protected transfer workflows.
78. As a Back Office Admin, I want brokerage provisioning and cross-organization support to use the existing brokerage/WorkOS administration boundary, so that lender self-service does not create a second organization system.
79. As an eligible outstanding reviewer, I want one approval-required email per resource cycle, so that I know when action is required without duplicate messages.
80. As an active user in an assigned Lender Organization, I want an email when a declined proposal is updated, so that I know a new full confirmation cycle is ready.
81. As an active user in a withdrawn Lender Organization, I want a withdrawal email linked to the read-only record, so that I understand why actions disappeared.
82. As a Back Office reviewer or builder proposal owner/request submitter, I want the appropriate approval outcome email, so that I know the result relevant to my role.
83. As a reviewer in the next required group, I want approval-required instead of a duplicate outcome email when another group's approval creates my action, so that notifications remain actionable.
84. As a participant, I want notification recipients derived from current eligibility and resource access, so that deactivated or unauthorized users are not notified.
85. As a participant, I want email links to re-check authorization when opened, so that URL possession does not grant access.
86. As a participant, I do not want general progress email from this MVP, so that notification scope remains limited to required transactional events.
87. As an auditor, I want every material transition to retain tenant, resource, actor, role, organization, time, prior/new state, cycle, and reason where required, so that activity is reconstructable.
88. As an implementation team, we want all participant views derived from one canonical model, so that no lender-only workflow copy can drift from Back Office or builder state.

## Implementation Decisions

### Domain ownership and identity

- WorkOS is authoritative for user, Lender Organization, membership, role, and permission state. DrawFlow owns assignment, workflow authorization, review policy, decisions, and product-resource access derived from canonical identity state.
- Every organization-scoped projection and related product record is scoped to one DrawFlow tenant and canonical WorkOS organization.
- A user may hold multiple canonical WorkOS memberships. Every request executes in one active organization context and validates active membership, assignment, policy, and resource authority.
- Canonical lender role slugs are `admin`, `principle-broker`, `broker`, and `broker-staff`. There is no application-layer lender-manager capability or alias, and role alone adds no approval weight.
- Admin and Principal Broker own organization-wide member administration. Exactly one active Principal Broker remains; normal removal or deactivation routes to a protected transfer-of-control workflow.
- One broad internal Back Office Admin role owns every Back Office capability in this specification.
- Existing authentication providers, mirrored user identity, and authenticated Convex builders are extended in place. A parallel authentication or identity system is not permitted.
- The mirrored-user deletion path must not erase durable subject references needed by membership, decision, or audit history.

### Canonical transition boundary

- Authenticated canonical Convex commands are the primary product behavior seam. Organization membership commands use the existing WorkOS-first boundary and wait for webhook/sync projection reconciliation. Each material command validates tenant, actor, canonical role/permission, membership, organization, assignment, resource, current revision or cycle, and prior state.
- Back Office, lender, and builder surfaces call the same commands. No lender-only lifecycle state or command set may own proposal or review outcomes.
- Durable records own source-of-truth state. Dashboard counts, queues, badges, Needs my action, and notification delivery are rebuildable projections.
- Material commands must be idempotent and deterministic under retry, duplicate action, stale action, and concurrency.

### Proposal lifecycle

- Proposal lifecycle, capital source, current external assignment, lender confirmation, closing, and activation are separate state dimensions.
- Back Office approval always precedes external assignment. Assignment is optional, limited to external capital, and limited to one current Lender Organization.
- Assignment uses append-only intervals. Withdrawal closes the current interval rather than deleting it.
- With a current assignment, closing requires current Back Office approval, one eligible lender-user approval of the current proposal revision, matching locked policy, and all other closing prerequisites.
- Back Office Admin or an eligible currently assigned lender user may record closing after prerequisites pass.
- Activation is a distinct post-closing action available to Back Office Admin or an eligible currently assigned lender user.
- Withdrawal before closing retains Back Office approval, returns the proposal to the internal closing path, removes lender actions, and preserves the assignment-period proposal record, documents, and history as read-only.
- The former lender does not gain access to later internal-only changes or a live Build after withdrawal.

### Proposal revisions and confirmation

- One stable proposal identity owns monotonic immutable revisions.
- Each lender-reviewable revision snapshots Milestone count, Budget, schedule/timeline, builder, and access/review policy.
- Each confirmation cycle belongs to one proposal revision and assignment. Approval requires explicit confirmation of all five checkpoints.
- Lender checkpoint data is read-only.
- Decline requires a private reason, leaves Back Office approval intact, and creates a Back Office remediation state.
- Back Office edits the same proposal and publishes the next revision. The next cycle highlights deterministic changes from the last lender-reviewed revision while requiring every checkpoint again.
- A lender approval counts only for the exact current revision.

### Locked Build policy

- Back Office configures and locks one immutable Build-wide review policy before closing.
- Milestone and Draw approval modes are independent and each supports Back Office Admin only, lender quorum only, or both groups.
- Milestone Site Visit required and receipt/invoice required are independent Boolean switches.
- Back Office approval requires one authorized Back Office Admin decision.
- Lender quorum is an integer from one through the active assigned-organization membership count at lock time.
- Where both groups are required, either group may act first; the current cycle completes only after both requirements pass.
- An assigned proposal's locked policy must exactly match the lender-confirmed current revision. A pre-closing change creates another proposal revision and full confirmation cycle.
- The closed Build retains the locked policy snapshot and lock evidence. MVP has no post-closing policy edit, waiver, or override path.

### Milestone and Draw request cycles

- Each Milestone completion request and Draw request has one stable identity with monotonic decision cycles.
- Each cycle snapshots submission data, requirements, relevant evidence references, required groups, and decisions.
- Rejection requires Builder-visible revision instructions and returns the same request to Builder-facing **Needs revision**. A reviewer may retain separate private rationale.
- Resubmission increments the cycle and resets all required approvals. Prior evidence, submissions, decisions, reasons, actors, and timestamps remain historical.
- One eligible user contributes at most one current approval per group and cycle.
- A decision by a lender user who is later deactivated stops counting while work is pending. Replacement active-user approval is required. Terminal completed or closed work does not reopen.
- Builder projections include configured requirements, high-level state, and published revision instructions, but exclude reviewer identity and private reviewer rationale from data, errors, email, analytics, and builder-visible audit summaries.

### Evidence and Site Visits

- Reuse the canonical Evidence Package, review-attachment, geofence, and Site Visit concepts. Do not create lender-only copies.
- A required Site Visit qualifies only when its report is completed and at least one photo is attached.
- Back Office Admin or an eligible assigned lender user may complete a required Site Visit.
- Geofence failure or unavailability preserves evidence as location-unverified for review.
- When receipt/invoice evidence is required, builder Milestone submission remains blocked until eligible current-cycle documented total exactly equals entered actual cost.
- Receipt/invoice amounts use exact integer units in the Build currency.
- Both authorized reviewing sides receive the same relevant review evidence.

### Participant projections and UI

- Build explicit Back Office, external-lender, and builder projections from the canonical state model.
- Back Office proposal surfaces include assignment, lender action/outcome, private decline reason, remediation editing, revision publication, withdrawal, policy-lock readiness, closing readiness, and activation.
- Builder proposal state distinguishes Back Office approval, lender review, pending closing, closed, and active without private lender detail.
- The Lender Portal includes dashboard, proposal list/detail, active-Build list/detail, Milestone queue/detail, Draw queue/detail, and Admin/Principal Broker organization administration.
- Lender Organization Management directly promotes Variant E, **Shared user management operations**, at `/lender/organization-management-prototype?variant=E`, locked on 2026-08-13. Production reuses `UserManagementDirectoryTable` and `UserDetailSheet`, including Access, Administration, Review relationship, and History tabs; it replaces local-only execution with authorized WorkOS-first commands and projection states.
- Organization Management is operational but does not own Back Office Review Requirements Setup. It exposes downstream access, assignment, quorum-context, recipient, queue, and audit effects without editing reviewer groups, quorum count, required evidence, Site Visit requirements, approval order, or policy satisfaction.
- Milestone and Draw queues include all assigned requests and default to Needs my action. Needs my action is derived from current active membership, assignment, current cycle, required groups, and counting decisions.
- The Lender Draw Queue approved implementation contract is Variant D,
  **Build packets**, at `/lender/draws-prototype?variant=D`, locked on
  2026-08-13. Production preserves its Build-grouped packet hierarchy,
  lower-left color-and-symbol decision-status signal, peer approval-group
  progress, current-cycle evidence provenance, and reconciled pooled funding
  position. Variants A, B, and C are rejected comparison history.
- The Draw queue projects canonical Build, Draw request, policy, decision-cycle,
  Evidence Package, pooled funding, and audit records. It does not own a
  parallel Draw model and does not add Draw-level receipt/Site Visit gates or
  Milestone/Draw Group funding attribution.
- Lender Build detail directly promotes locked Variant C. It exposes a narrow
  overview; expandable Milestone records with canonical Budget,
  receipt/invoice coverage and actual-or-planned date ranges; focused
  read-only Milestone-sheet navigation; pooled Build funding and Draw records;
  evidence attached only to relevant reviews; and participant-visible public
  Build collaboration in read-only form.
- The lender Build projection does not load the full timeline/Gantt, Draw Group
  visualization, contractors, internal notes, private reviewer rationale, a
  broad document library, detached documents, or overview decision, release,
  edit, upload, policy, or generic comment commands.
- The canonical Build Workspace remains the builder and Back Office shared control plane and shows high-level approval state without becoming the lender portal.
- UI visibility is never the security boundary; every loader and command enforces authorization.

### Notifications

- The MVP sends only approval-required, proposal-updated-after-decline, withdrawal, and approval-outcome email.
- Approval-required goes to every currently eligible actor who has not supplied a counting decision in each outstanding group.
- Proposal-updated-after-decline and withdrawal go to all active users in the assigned or withdrawn Lender Organization.
- Approval outcomes go to appropriate Back Office reviewers and the builder proposal owner or request submitter.
- When an outcome creates the next group's action, send approval-required instead of a duplicate outcome email.
- There is no per-record reviewer assignment system.
- Notification intent creation is transactional with the domain transition. Delivery is idempotent by event, resource, cycle, and recipient, and authorization is checked again on link open.

### Audit, API, and compatibility

- Material changes create append-only audit events with tenant, resource, actor, role, organization, timestamp, prior/new state, revision or cycle, policy snapshot where relevant, warnings, and required reason.
- External API and webhook contracts must not imply that proposal approval activates a Build or that one admin is always the sole reviewer.
- At baseline, product domains, product routes, product notifications, product projections, product tests, and proven external consumers are absent. Introduce the canonical product model cleanly while extending existing authentication seams in place.
- External consumers are unknown rather than proven absent. Version new contracts and repeat symbol, process, caller, job, data, and external-consumer inventory if implementation starts from a different revision and again before release.

### Dependency-aware delivery sequence

1. Phase Zero is complete: decisions, documentation contracts, branch inventory, compatibility disposition, and transition-consumer ownership are resolved for the baseline.
2. Integrate canonical WorkOS organization, membership, role, and brokerage projections with assignment- and policy-derived authorization.
3. Introduce explicit proposal approval, assignment, withdrawal, closing, and activation state.
4. Add proposal revisions, checkpoint snapshots, policy configuration, quorum validation, and pre-closing lock.
5. Implement the guided lender confirmation and Back Office remediation loop together.
6. Introduce stable Milestone and Draw requests with monotonic correction/resubmission cycles.
7. Enforce Site Visit, receipt/invoice, group approval, deactivation recount, and privacy rules.
8. Complete every paired Back Office, lender, and builder projection and UI journey.
9. Add transactional notification intents, recipient resolution, delivery, and retry tracking.
10. Run migration inventory, security review, projection reconciliation, concurrency tests, release controls, and exact-commit acceptance.

No phase that changes a transition is complete until every affected participant surface, projection, notification, attachment permission, audit event, and external contract is updated or explicitly deferred behind an unavailable feature.

## Cross-Surface Refactor Scope

Each row is one delivery boundary. The domain owner and every listed participant consumer must ship together or remain unavailable together.

| Refactor scope | Canonical owner | Back Office impact | External lender impact | Builder impact | Other consumers | Risk |
|---|---|---|---|---|---|---:|
| Identity and membership | Canonical WorkOS organization/membership/role projections plus brokerage mapping | Brokerage provisioning and support through existing boundaries | Variant E organization operations for Admin/Principal Broker; deactivation | None | WorkOS commands/sync, audit, recipient eligibility | High |
| Proposal lifecycle | Proposal lifecycle command set | Approval, assignment, withdrawal, closing readiness, closing, activation | Assigned access, confirmation status, closing, activation, withdrawn history | High-level status and activation visibility | Audit, notifications, APIs/webhooks, support | Critical |
| Proposal revision/remediation | Proposal revisions and confirmation cycles | Private decline reason, same-proposal editing, publish revision, next action | Full checkpoint flow, diff, reapproval, history | Safe pending/remediation state only | Email, audit, analytics | Critical |
| Policy lock | Immutable Build review-policy snapshot | Configure, validate, lock, and view lock evidence | Confirm read-only policy; use it for decisions | View requirements | Closing gate, request eligibility, audit | Critical |
| Milestone request cycle | Stable Milestone review request | Group progress, approve/reject, history | Queue/detail, approve/reject, evidence | Submission, correction, same-record resubmission | Counts, email, audit, Build Workspace | Critical |
| Draw request cycle | Stable Draw review request | Group progress, approve/reject, and Back Office release readiness | Queue/detail, approve/reject, evidence; no Draw-release authority | Correction/resubmission and high-level state where applicable | Counts, email, audit, existing reimbursement/release workflow | Critical |
| Site Visit qualification | Canonical Site Visit | Complete or view qualifying visit | Complete or view qualifying visit | Submission-gate state | Mobile/offline flow, geofence, attachments, audit | High |
| Receipt/invoice gate | Review attachments and documented-total calculation | View and verify evidence | View and verify evidence | Enter actual cost, attach evidence, receive submission block | Currency rules, audit | High |
| Deactivation recount | Membership eligibility plus policy evaluator | Replacement-action state and user administration | Access removal; queue/quorum recalculation | No private detail; terminal state stable | Notifications, audit, dashboard counts | High |
| Dashboard and queues | Rebuildable participant projections | Proposal/Milestone/Draw queues and counts | Dashboard, proposal, Milestone, Draw, and active-Build lists | Proposal/request state | Analytics and operational support | High |
| Narrow Build detail | Lender-safe Build projection | Canonical Build Workspace remains unchanged in ownership | Locked Variant C: overview; expandable Milestone ledger; focused read-only Milestone sheet; pooled Draw position/records; review attachments; public read-only Collaboration | Canonical Build Workspace | Projection ACL, attachment ACL, collaboration visibility, audit | High |
| Withdrawal history | Assignment interval and retained review snapshot | Withdrawal action and internal closing path | Read-only proposal record; no later Build access | High-level proposal state | Documents, email, audit | High |
| Notifications | Transactional notification intent | Reviewer and outcome recipients | Approval-required, update, withdrawal | Outcome recipient | Delivery worker, templates, retry log | High |
| Audit and external events | Append-only audit/event contract | Full internal material history | Authorized lender history | Privacy-safe history | APIs, webhooks, analytics, reporting, support | High |
| Tests, fixtures, migration, release | Canonical state fixtures and release controls | Every Back Office path | Every lender path | Every builder path | Projection rebuild, security review, rollback | Critical |

The full builder/Back Office Build Workspace remains canonical. The external lender detail is a separate, narrower projection, not a fork of Build state. Evidence, Site Visit, proposal, Milestone, Draw, approval, and notification state must not be duplicated for the Lender Portal.

## Transition-Consumer Gates

A transition is not complete when its initiating button works. Each row must pass its command guard, counterparty handoff, derived-consumer update, privacy rule, and acceptance journey before the transition can be enabled.

| Transition | Canonical command gate | Required counterparty handoff | Mandatory derived consumers | Acceptance journey |
|---|---|---|---|---|
| Back Office provisions a brokerage and initial Principal Broker | Existing brokerage/WorkOS command boundary; owning tenant; protected Principal Broker invariant; append-only authority history | Variant E organization administration becomes available for the canonical organization | Portal access, member counts, quorum-context validation, recipient eligibility, audit | E2E-08 |
| Admin or Principal Broker administers an organization member | Active same-organization membership; supported canonical role; protected Principal Broker target rules; WorkOS-first command | Invitation/access state reconciles from the canonical projection without changing review policy | Portal access, quorum context, queue actions, recipients, audit | E2E-08 |
| Back Office approves proposal | Back Office Admin; submitted current proposal; audited decision | Assignment control becomes eligible; builder sees approved/pending closing | Proposal queues/counts, closing eligibility, audit, external event contract | E2E-01, E2E-02 |
| Back Office assigns lender | Approved/pending-closing external-capital proposal; one current assignment | Lender proposal list/detail receives current revision and action | Assignment ACL, dashboard, approval-required email, audit | E2E-02, E2E-04 |
| Lender declines proposal | Active assigned member; current revision; all checkpoints visited; reason required | Back Office remediation queue/detail/editor receives private reason | Confirmation history, builder-safe state, closing gate, outcome routing, audit | E2E-03 |
| Back Office publishes remediation | Back Office Admin; same proposal; new monotonic revision; deterministic diff | Lender receives new full confirmation cycle with highlighted changes | Needs my action, post-decline update email, stale-decision guard, audit | E2E-03 |
| Lender approves proposal | Active assigned member; current revision; five checkpoints confirmed | Back Office closing readiness updates | Dashboard/counts, decision history, outcome or next-action email, audit | E2E-02, E2E-03 |
| Back Office withdraws lender | Back Office Admin; current assignment; before closing | Lender actions disappear and read-only record remains; internal closing path restores | Assignment ACL, retained documents/history, withdrawal email, audit | E2E-04 |
| Proposal closes | Back Office Admin or eligible assigned lender; all applicable approvals and matching policy lock | Both sides see closed/not active | Lists/counts, immutable Build control snapshot, audit, external events | E2E-01, E2E-02 |
| Build activates | Back Office Admin or eligible currently assigned lender; proposal closed; not already active | Builder and both authorized reviewer sides see live Build | Active-Build list, dashboard, Build Workspace state, audit, external events | E2E-01, E2E-02 |
| Back Office locks review policy | Back Office Admin; before closing; current confirmed revision; quorum valid against active membership | Lender confirmation and builder requirements use the exact immutable snapshot | Closing eligibility, Milestone/Draw gates, history, audit, external events | E2E-02, E2E-05, E2E-07 |
| Builder attaches or replaces review evidence | Builder access; current request/cycle; allowed attachment kind and exact currency metadata | Both required reviewer groups see the same current-cycle evidence | Documented-total calculation, Site Visit qualification, attachment ACL, audit | E2E-06, E2E-07 |
| Builder submits Milestone | Builder access; current request; required Site Visit and documented-total gates pass | Required Back Office/lender queues receive current cycle | Evidence ACL, Needs my action, approval-required email, audit | E2E-05, E2E-07 |
| Builder submits Draw | Builder access; current request; Draw prerequisites pass | Required Back Office/lender queues receive current cycle | Evidence ACL, Needs my action, approval-required email, audit | E2E-05 |
| Reviewer rejects request | Authorized required group; current cycle; Builder-visible revision instructions required | Builder receives **Needs revision** on the same canonical detail surface; all reviewer actions for old cycle disappear | Approval reset, authorized history, optional private rationale, counts, outcome email, audit | E2E-06 |
| Builder resubmits correction | Builder access; same request identity; corrected evidence; next cycle | Every required group receives the new cycle | Needs my action, stale-decision guard, approval-required email, audit | E2E-06 |
| Reviewer approves request | Authorized required group; current cycle; one decision per user | Other required group receives/retains action, or request completes | Group progress, queue/count updates, outcome or next-action email, audit; a completed Draw becomes release-ready under the existing Back Office release flow | E2E-05, E2E-06 |
| Required Site Visit completes | Eligible Back Office Admin or assigned lender; completed report plus photo | Both review details expose the qualifying visit; builder gate updates | Evidence ACL, request eligibility, audit | E2E-07 |
| Lender member deactivates | Back Office Admin or active same-organization Admin/Principal Broker; active Principal Broker target prohibited outside transfer | Portal access ends after authoritative completion; pending work that used the decision returns to lender action | Quorum recount, Needs my action, recipient set, history, audit | E2E-08 |

Universal transition gates:

1. One canonical command validates tenant, actor, authority, resource, assignment, revision/cycle, and prior state.
2. Initiating UI exposes only currently valid actions, but server authorization remains authoritative.
3. Every next-responsible actor receives the correct queue/list/detail state.
4. Stale actions disappear and stale commands fail safely.
5. Counts, badges, Needs my action, and all-assigned projections update from canonical state.
6. Audit/history, notification intent, attachment access, and role-safe projections update atomically or from a durable event.
7. Builder-visible data includes published revision instructions but omits reviewer identity and private reviewer rationale.
8. Internal/external, assigned/withdrawn, active/deactivated, and current/stale variants are covered.
9. The mapped multi-actor journey passes through the real participant boundaries.

## Multi-Actor End-to-End Journeys

### E2E-01 — Internal capital

1. Builder submits a valid internal-capital proposal.
2. Back Office Admin approves it.
3. External assignment remains unavailable and no lender action or email is created.
4. Back Office Admin locks the internal review policy and records closing.
5. The proposal is closed but the Build is not active.
6. Back Office Admin activates the Build.
7. Builder and Back Office projections, audit, and active-Build state agree.

### E2E-02 — External approval, closing, and activation

1. Back Office Admin approves an external-capital proposal and assigns a Lender Organization.
2. Every eligible assigned lender user receives Needs my action and one approval-required email.
3. One eligible lender user completes all five checkpoints and approves the current revision.
4. Back Office closing readiness updates without activating the Build.
5. In separate cases, Back Office Admin and an eligible assigned lender user record closing.
6. In separate cases, each authorized side activates the closed Build.
7. Builder, Back Office, and lender projections, history, notifications, and audit agree.

### E2E-03 — Lender decline and Back Office remediation

1. An eligible lender user completes the guided review and declines with a reason.
2. Back Office approval remains valid and closing stays blocked.
3. Back Office queue/detail exposes the private reason and same-proposal remediation action.
4. Builder sees only a safe pending/update state.
5. Back Office updates the same proposal and publishes a new revision.
6. All active assigned lender users receive the post-decline update email and new Needs my action state.
7. The lender sees deterministic change highlights but must confirm all five checkpoints again.
8. The old approval/decline cannot satisfy or mutate the new revision.
9. Current lender approval restores closing readiness; all cycles remain in authorized history.

### E2E-04 — Assignment withdrawal

1. Back Office approves and assigns an external lender.
2. The lender can view the assigned proposal and its review documents.
3. Back Office withdraws the assignment before closing.
4. All active users in the withdrawn organization receive one withdrawal email.
5. Lender actions disappear; the assignment-period proposal, documents, and history remain read-only.
6. Later internal-only edits and the eventual live Build are inaccessible to the former lender.
7. The proposal remains approved/pending closing and follows the internal closing path.

### E2E-05 — Both-groups Milestone and Draw approval

1. A closed Build has a locked both-groups policy with valid lender quorum.
2. Builder submits a valid current-cycle request.
3. Test lender-first then Back-Office approval and Back-Office-first then lender approval.
4. The first group decision produces partial progress and action for the outstanding group.
5. The second group completes the same result without duplicate decisions or email.
6. A completed Draw becomes release-ready under the existing reimbursement flow; external lender approval does not grant Draw-release authority.
7. Queue rows, counts, Build Workspace state, lender detail, builder state, release eligibility, history, and audit agree.

### E2E-06 — Rejection, correction, and same-record resubmission

1. Test rejection by Back Office and by lender in separate cases.
2. Rejection requires Builder-visible revision instructions and returns the same request to Builder-facing **Needs revision**.
3. All approvals from the rejected cycle stop counting and reviewer actions for that cycle disappear.
4. Builder sees the locked Variant A notice, published instructions, requirements, and eligibility in the canonical `MilestoneDetailSheet`, but not reviewer identity or private reviewer rationale.
5. Builder corrects and resubmits the same request, creating the next cycle.
6. Every required reviewer group receives renewed action and the appropriate approval-required email.
7. Stale links and delayed commands from the prior cycle fail.
8. The new cycle can complete while full authorized history remains intact.

### E2E-07 — Evidence gates and shared Site Visit

1. Lock a Milestone policy that requires receipt/invoice evidence and Site Visit.
2. Builder submission fails while documented total differs from actual cost.
3. Exact eligible attachment amounts bring documented total to equality.
4. Site Visit completion fails without a completed report and at least one photo.
5. In separate cases, an eligible lender user and Back Office Admin complete the qualifying visit.
6. A geofence failure retains evidence as location-unverified.
7. Both review sides see the same qualifying report, photos, receipts/invoices, and current-cycle evidence.

### E2E-08 — Membership and deactivation edge cases

1. Back Office provisions a brokerage with one active Principal Broker through the canonical WorkOS boundary; no duplicate organization or membership record is created.
2. An active Admin or Principal Broker uses the promoted Variant E surface to invite a member, change a supported role, and stage deactivation only in the active organization.
3. Cross-organization actions fail, and normal removal or deactivation of the active Principal Broker routes to the protected transfer workflow.
4. An active lender user approves pending work, then is deactivated before terminal completion.
5. The prior decision remains in history but stops counting.
6. Needs my action, quorum progress, and notification recipients recalculate for active members without changing the locked policy.
7. Replacement active-user approval is required.
8. Deactivation after terminal completion does not reopen the work.
9. WorkOS command pending, sync, success, and failure states are visible; projection tables are never written optimistically.

### E2E-09 — Privacy and narrow lender data

1. Exercise proposal decline with identifiable actors and private reasons, plus request rejection with Builder-visible revision instructions and optional separate private reviewer rationale.
2. Inspect builder UI, query payloads, errors, email, analytics events, and builder-visible audit summaries.
3. Verify published revision instructions are present while reviewer identity and private reviewer rationale are absent from every Builder channel.
4. Inspect lender Build list/detail and verify timeline/Gantt, contractors, internal notes, broad documents, and unrelated records are absent.
5. Verify direct URL and loader attempts cannot cross tenant, Lender Organization, assignment, or withdrawn-history boundaries.

### E2E-10 — Concurrency and idempotency

1. Race approval against rejection on one request cycle.
2. Race withdrawal against lender confirmation.
3. Race revision publication against a stale lender decision.
4. Race closing against policy mutation.
5. Race deactivation against quorum completion.
6. Retry closing, activation, decisions, audit creation, and notification delivery.
7. Verify one deterministic state, no duplicate material event, no stale approval, and no private-data leak.

## Testing Decisions

- Test external behavior through the highest available seam. The primary seam is the authenticated canonical Convex command/query boundary used by every participant surface.
- Do not unit-test implementation-private helper structure when the command boundary can prove authorization, lifecycle state, audit, notification intent, and participant projections together.
- Use a small secondary browser/route seam for multi-actor handoffs, accessibility, focus behavior, status announcements, loading/empty/forbidden states, and proof that private data is absent from rendered participant views.
- Establish product fixtures around tenant, WorkOS organization/membership/role projections, brokerage mapping, Back Office Admin, Principal Broker, builder ownership, proposal revision, assignment, locked policy, request cycle, evidence, and notification intent.
- Every authorization suite covers allow and deny cases across tenant, active WorkOS organization, membership status, canonical role/permission, protected Principal Broker target, assignment status, historical withdrawn access, resource, revision, and decision cycle.
- Every transition suite covers valid, stale, duplicate, unauthorized, post-terminal, and out-of-order actions.
- Every material command asserts its durable state, append-only audit event, affected queue/count/badge projections, builder-safe view, notification intent, and attachment visibility.
- Concurrency tests cover competing approval/rejection, withdrawal/confirmation, revision publication/stale decision, closing/policy change, deactivation/quorum completion, and duplicate activation.
- Idempotency tests prove retried commands and notification delivery do not duplicate transitions, decisions, audit events, or email.
- Exact-cycle tests prove an older proposal revision or request cycle cannot receive or satisfy a current decision.
- Privacy tests inspect Builder query payloads, errors, email, analytics, and audit summaries for reviewer identity and private reviewer-rationale leakage while confirming published revision instructions remain available.
- Evidence tests prove Site Visit report/photo requirements, geofence preservation, attachment scoping, and exact documented-total equality.
- Projection tests prove Needs my action and all-assigned results from canonical records, including partial group approval, withdrawal, deactivation, correction, and resubmission.
- The ten journeys in **Multi-Actor End-to-End Journeys** are required release gates. They must run through the real participant boundaries, not mocked copies of the lifecycle.
- Final acceptance evidence must be tied to the exact release commit and must cover every transition-consumer relationship, not only the initiating UI.

## Artifact Cross-Reference and Gap Audit

### Authority and traceability

| Artifact | Governing responsibility | Specification coverage | Back-reference requirement |
|---|---|---|---|
| Confirmed feature brief | MVP scope, non-goals, terms, invariants, permissions, lifecycle, evidence, notifications, and acceptance criteria | Problem, Solution, User Stories, Implementation Decisions, Out of Scope | Links to this consolidated specification as the implementation handoff. |
| Sequenced implementation plan | Baseline inventory, risk, refactor scope, transition ledger, phases, workstreams, tests, migration, and final gate | Risk-Rated Blast Radius, Cross-Surface Refactor Scope, Transition-Consumer Gates, delivery sequence, Testing Decisions | Links to this specification as the executable synthesis; remains detailed planning evidence. |
| Product requirements | DrawFlow domain vocabulary, reimbursement rules, Build Workspace, proposal/Milestone/Draw flows, RBAC, audit, events, and broader MVP context | All domain terms and unchanged platform rules; Lender Portal changes are explicit | Links to this specification for the external-lender feature slice. |
| Route manifest | Intended URL namespaces, guards, loaders, navigation, and route/screen coverage | Participant projections, cross-surface scope, transition gates, privacy journey | Lists this specification as the lifecycle and authorization contract. |
| Screen manifest | Back Office, builder, lender, Site Visit, policy, and audit surface behavior | User Stories, cross-surface rows, end-to-end journeys | Lists this specification as the feature behavior contract. |
| Component manifest | Intended reusable decision, diff, queue, evidence, policy, progress, and administration components | UI implementation decisions and participant handoffs | Lists this specification as the state/permission contract; components do not own workflow state. |
| Proposal lifecycle epic | Proposal review, assignment, confirmation, closing, and activation delivery scope | Proposal lifecycle and remediation decisions; E2E-01 through E2E-04 | Links to this specification for full acceptance and downstream consumers. |
| Repository agent guide | Domain invariants, technology rules, and Convex authoring constraints | Canonical command seam, vocabulary, no parallel systems, implementation sequence | Links to the local tracker conventions and remains mandatory for implementation. |

### Confirmed-scope coverage

| Confirmed requirement area | Covered by | Gap status |
|---|---|---|
| Canonical WorkOS Lender Organizations, memberships, and supported lender roles | User Stories 1–14; identity decisions; identity blast-radius/refactor rows; E2E-08 | Covered |
| Back Office, Admin, and protected Principal Broker boundaries | User Stories 4–10; domain ownership; transition and deactivation gates; E2E-08 | Covered |
| Optional external assignment for external capital | User Stories 15–18; proposal lifecycle; assignment gate; E2E-02/E2E-04 | Covered |
| Separate approval, closing, and activation | User Stories 33–38; proposal lifecycle; Critical risk row; close/activate gates; E2E-01/E2E-02 | Covered |
| Withdrawal and read-only lender history | User Stories 39–41; withdrawal decisions/refactor/gate; E2E-04 | Covered |
| Five-checkpoint confirmation and remediation | User Stories 19–32; revision decisions; Critical risk row; decline/remediation gates; E2E-03 | Covered |
| Pre-closing policy modes, switches, quorum, and immutability | User Stories 43–51; locked-policy decisions; Critical risk row; E2E-05/E2E-07 | Covered |
| Required Site Visit and receipt/invoice equality | User Stories 52–60; evidence decisions/refactor/gate; E2E-07 | Covered |
| Same-record rejection/correction/resubmission and approval reset | User Stories 61–66; request-cycle decisions; Critical risk row; reject/resubmit gates; E2E-06 | Covered |
| Existing reimbursement and Back Office Draw-release authority | Draw request refactor row; approval transition gate; E2E-05 | Covered; no new lender release authority |
| Deactivation recount for pending work | User Stories 11–14; request-cycle decision; deactivation gate; E2E-08 | Covered |
| Dashboard, lists, queues, narrow Build detail, and approved Variant E organization operations | User Stories 67–78; participant UI decisions; read-model/refactor rows; E2E-08/E2E-09 | Covered |
| Four transactional email classes and recipient rules | User Stories 79–86; notification decisions/refactor; transition gates | Covered |
| Builder privacy | User Stories 42, 65, and 76; privacy decisions; universal gate 7; E2E-09 | Covered |
| Audit, API/webhook compatibility, migration, and exact-release evidence | User Stories 87–88; audit/compatibility decisions; final testing gate; E2E-10 | Covered |
| Deferred/non-goal scope | Out of Scope | Covered; no deferred surface is required by a transition gate |

No unresolved product decision remains in the confirmed MVP scope. Remaining implementation unknowns are evidence and integration questions, not silent product choices:

- direct/transitive graph counts and temporal stability on the eventual implementation revision;
- whether an external API, webhook, analytics, reporting, or support consumer appears after the baseline;
- the durable subject-reference treatment for WorkOS user deletion;
- the concrete email delivery provider and operational retry mechanism; and
- migration requirements for any product data introduced after the baseline.

The supplementary later-branch graph also creates a target-branch freshness gate: the implementation plan's named proposal, funding, Build-detail, queue, access, calendar, collaboration, notification, test, and release consumers must be reconciled before the feature is enabled. This is not new product scope; it is refactor work needed to preserve the confirmed scope in an implementation-bearing branch.

These unknowns must be resolved or proven absent in their owning implementation phase. They do not authorize new scope.

## Out of Scope

- Assigning an external lender before Back Office proposal approval.
- Assigning a Lender Organization to an internally funded proposal.
- More than one current external Lender Organization on a proposal.
- Lender edits to proposal content, builder data, Budget, schedule, or review policy.
- A separate lender-manager capability, alias, or appointment workflow.
- A DrawFlow-owned duplicate Lender Organization, membership, role, or permission system.
- Per-record reviewer assignment.
- Post-closing review-policy changes, overrides, or Site Visit waivers.
- Full Build Workspace, timeline/Gantt, Draw Group visualization, contractors, internal notes, or a broad document library in the external Lender Portal.
- Documents that are not attached to a proposal confirmation, Milestone review, Draw review, or qualifying Site Visit.
- General progress, digest, or marketing email.
- New payment, settlement, loan-servicing, accounting-ledger, or general-ledger behavior.
- Changes to reimbursement-only Draws, the interest-start rule, or Draw-plan optimization.
- Actual payment rails, holdbacks/retainage, contractor marketplace, municipal inspection integration, automated lien-waiver tracking, or full offline Build Workspace editing.

## Further Notes

- DrawFlow remains reimbursement-only. Interest begins only after funds are released.
- The feature is high risk because it crosses identity, authorization, proposal lifecycle, immutable policy, evidence gates, multi-group approval, privacy, notifications, and every participant surface.
- Critical workflows require clean canonical-model implementation and full multi-actor acceptance. A lender-facing control without the paired Back Office and builder remediation path is incomplete.
- The repository baseline is a documentation-first scaffold. Product route names and component names are intended contracts, not proof of existing production code.
- The source feature brief, phased implementation plan, and aligned product requirements remain useful evidence. This specification is their consolidated local-tracker handoff for implementation.
