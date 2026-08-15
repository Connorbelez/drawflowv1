# Lender Portal Prototype Promotion Contract

## Authority

This contract binds implementation work for the Lender Portal MVP. Required
local authority is:

- `docs/draw_flow_prd.md` for the canonical product requirements;
- `docs/draw_flow_production_prd.md` for brokerage tenancy, roles, and required
  production surfaces;
- `docs/core-product-workflow-manifest.md` for ordered cross-persona workflows;
- `docs/auth-rbac-foundation.md` for WorkOS ownership and command boundaries;
- `docs/specs/lender-portal-draw-review.md` for the shared role-aware Draw
  Request review, decision, correction, and persona-integration contract;
- `docs/lender_portal_mvp_feature_brief.md` for the confirmed lender product
  contract;
- `docs/lender_portal_mvp_implementation_plan.md` for sequenced delivery;
- `docs/lender_portal_mvp_spec.md` for the ready-for-agent implementation
  contract; and
- `src/components/prototypes/README.md` for the selected-variant decision
  registry and evidence map.

The lender feature brief, implementation plan, and consolidated specification
are stored in this canonical checkout. Implementers must use these durable local
contracts, exclude unsupported fields or behavior, and raise a product question
instead of reconstructing requirements from memory or another worktree.

## Promotion rule

For a surface marked **Accepted**, **Approved**, or **Locked** in the registry,
the implementation ticket must directly promote that selected prototype's
information architecture, interaction model, component composition, and
documented boundaries. It must start from the selected prototype route and
components, replacing only representative local data and local-only actions
with canonical loaders, commands, authorization, audit, and error states.

An implementer must not use a locked prototype merely as visual reference and
then build a new surface from the PRD/specification. New production behavior is
allowed only where required to connect the selected contract to canonical
records. Any material departure needs an explicit product decision and an
updated prototype contract before implementation begins.

The normal promotion order is:

1. preserve the selected variant's route-level hierarchy and interaction gates;
2. replace local fixture/state with permission-shaped canonical projections;
3. connect canonical commands, validation, audit, and transitions;
4. remove the comparison switcher and rejected variants from the production
   surface only after the selected interaction is preserved and verified.

## Locked promotion set

| Requirement | Surface | Selected prototype | Required promotion boundary |
| --- | --- | --- | --- |
| `LP-PROT-DASH` | Lender Dashboard | `lender.prototype.tsx`, Variant D | Action-led portfolio: `Needs my attention` precedes the durable portfolio ledger; no inferred urgency/SLA data. |
| `LP-PROT-ORG` | Lender Organization Management | `lender.organization-management-prototype.tsx`, Variant E | Promote the shared user-management table/detail-sheet contract only through the canonical organization/membership authority boundary. |
| `LP-PROT-PROP` | Lender Proposal Review | `lender.proposal-confirmation-prototype.tsx`, Variant D | Promote the Back Office Proposal Packet host plus right-side lender confirmation sheet, five acknowledgements, audit evidence, confirmation gate, and decline-reason gate. |
| `LP-PROT-POLICY` | Back Office Review Requirements Setup | `backoffice/proposals/review-requirements-prototype.tsx`, Variant A | Promote the Closing-workspace policy configuration/lock model; do not build a standalone policy system. |
| `LP-PROT-ASSIGN` | Back Office Approval and Lender Assignment | `backoffice/proposals/lender-assignment-prototype.tsx`, Variant A, approved and locked 2026-08-14 | Preserve the compact Lender assignment row in the canonical proposal header and its single focused assignment modal. Keep policy editing, guided lender confirmation, closing, and activation as separate existing transitions. Capital source does not block an eligible assignment. |
| `LP-PROT-BUILD` | Lender Build Detail Overview | `lender.build-detail-overview-prototype.tsx`, Variant C, approved and locked 2026-08-13 | Promote the compact Precision console: narrow Build overview, expandable Milestone ledger with canonical budget, receipt/invoice coverage, actual-or-planned date ranges and a focused read-only Milestone sheet; pooled Build funding and Draw records; review-attached evidence; and participant-visible public Collaboration. Do not promote the full Build Workspace or add overview decisions. |
| `LP-PROT-MILESTONE-QUEUE` | Lender Milestone Queue | `lender.milestones-prototype.tsx`, Variant C | Promote evidence-rich workflow lanes over canonical current-cycle Milestone projections. |
| `LP-PROT-MILESTONE-SHEET` | Canonical Milestone Detail and Review Sheet | `lender.milestone-review-prototype.tsx`, Variant A | Promoted through the shared `MilestoneDetailSheet`; preserve the four-tab hierarchy, role-aware actions, verified policy gates, canonical child records, privacy, correction/resubmission, and audit ownership. |
| `LP-PROT-DRAW-QUEUE` | Lender Draw Queue | `lender.draws-prototype.tsx`, Variant D, approved and locked 2026-08-13 | Promote Build-packet queue structure, lower-left color-and-symbol decision status, and its validated pooled-funding/evidence provenance contract. |
| `LP-PROT-DRAW-SHEET` | Canonical Draw Review Sheet | `lender.draw-review-sheet-prototype.tsx`, Variant A | Promote one role-aware Draw sheet; preserve pooled availability, request-level evidence, peer gates, private decline rationale, collaboration, and non-gating Action Items. |
| `LP-PROT-BUILDER-MILESTONE` | Builder Milestone Needs Revision | `builder.milestone-revision-detail-prototype.tsx`, Variant A | Promote the locked inline revision notice inside the canonical `MilestoneDetailSheet`: `Needs revision` returns the same request to draft-like editing, leads with Builder-visible free-text revision instructions, preserves locked requirements and authorized history, and resubmits as cycle N+1 with every required approval reset. |

The detailed interaction and data contracts remain in
`src/components/prototypes/README.md`; this table does not weaken them.

## Lender Build Detail Overview — locked implementation contract

Variant C at
`/lender/build-detail-overview-prototype?variant=C` is the approved and locked
Lender Build Detail Overview. It is a compact Precision console and a
permission-shaped projection of canonical Build state. The prototype task that
produced and selected it did not authorize production implementation.

A future authorized implementation must start from the selected prototype
route and composition. It must preserve:

1. the compact header, section index, and separator-led information hierarchy;
2. the read-only Build overview and the expandable Milestone ledger;
3. canonical Milestone budget, receipt/invoice coverage, and date ranges that
   prefer actual dates when available and otherwise show planned dates;
4. Milestone links that open the established focused, read-only Milestone
   detail/review sheet rather than placing decisions in the overview;
5. pooled Build-level funding and Draw records without inferred Milestone or
   Draw Group attribution;
6. evidence attached only to the relevant Milestone or Draw review; and
7. read-only Collaboration limited to participant-visible public Build updates.

The promoted surface must not expose the full Builder or Back Office Build
Workspace, timeline/Gantt, Draw Group visualization, contractors, internal
notes, private reviewer identity or rationale, a broad document library,
detached documents, a generic comment composer, lender edits, policy controls,
evidence upload, or approval/release decisions. A requirements-equivalent
redesign is not an acceptable substitute for direct promotion of Variant C.

## Back Office Review Requirements — locked implementation contract

The locked source artifacts are the **Back Office Review Requirements Setup**
section in `src/components/prototypes/README.md`, Variant A at
`/backoffice/proposals/review-requirements-prototype?variant=A`, and
`src/components/prototypes/BackOfficeReviewRequirementsSetupPrototype.tsx`.

Implementation agents must:

1. start from Variant A instead of recreating the surface from this document;
2. preserve its placement inside the existing Back Office proposal Closing
   workspace;
3. preserve the separate Milestone and Draw requirement groups, the separate
   Milestone evidence controls, and the pre-closing active-Build policy summary;
4. replace only the representative active-lender-member fixture and local state
   with canonical membership, policy, audit, and closing integrations; and
5. keep the policy locked after closing.

Implementation must not introduce a standalone policy route or policy system,
a post-closing editor, deadlines or SLAs, generic comments, or additional
reviewer roles. A ticket or pull request that materially diverges from Variant
A is blocked until an explicit product decision updates the prototype registry,
this promotion contract, and the relevant PRDs.

## Lender Organization Management — locked implementation contract

The ownership boundary below supersedes older Variant E wording that described
a WorkOS organization as the Lender Organization. WorkOS cannot provision a
Lender Organization in DrawFlow.

### Decision

Variant E, **Shared user management operations**, is approved. Start from
`src/routes/lender.organization-management-prototype.tsx` with
`?variant=E`. Variants A–D are rejected comparison history. Production may
remove the switcher and rejected variants only after Variant E has been promoted
and verified.

### Product question settled

Back Office Admin manages application-owned Lender Organizations through
`/backoffice/lenders`, using the Builder roster pattern for the organization
table, unassigned-user queue, organization detail drawer, assignment controls,
staged invitations, workflow permissions, and soft deactivation. The hierarchy
is `Brokerage → Lender Organization → assigned lender users`.

The lender-facing `/lender/organization` route is a read-only application
organization view. It resolves the active app assignment, never infers an
organization from a WorkOS organization name or ID, and renders a
`mailto:support@fairlend.ca` empty state without WorkOS directory data when the
user has no assignment.

### Required component composition

1. Reuse the existing Back Office shell and Builder roster patterns; preserve
   functional breadcrumbs and the Back Office navigation link at
   `/backoffice/lenders`.
2. Preserve Variant E's directory-first information hierarchy through the
   application-owned organization table, search/status toolbar, detail drawer,
   member list, and staged command states.
3. Keep the assignment queue separate from the organization table so unassigned
   shared-WorkOS lender users can be attached to an explicit app organization.
4. Show the parent Brokerage, member/pending counts, app status, shared policy,
   exact lender role, assignment state, and WorkOS reconciliation state without
   turning WorkOS projections into writable application records.

### Required operations

| Operation | Required interface | Production command boundary | Completion state |
| --- | --- | --- | --- |
| Provision organization | Choose an existing Brokerage and create an app-owned Lender Organization with its initial workflow policy. | Fluent Convex admin mutation; no WorkOS organization command. | App organization exists under the Brokerage with audit history. |
| Assign lender user | Select an eligible shared-WorkOS user from the unassigned queue and require a reason. | Fluent Convex admin mutation against `lenderOrganizationAssignments`. | One active app assignment exists; duplicate/cross-Brokerage assignment fails. |
| Invite member | Collect a valid email and exact lender starting role. | WorkOS-first invitation to the configured shared identity organization, then pending app assignment staging. | Accepted invitation is pending; active app assignment appears only after user and membership projection reconciliation. |
| Change access | Show current and proposed exact lender role and require a reason. | WorkOS-first shared-membership role action scoped by app organization and assignment. | Accepted or failed command is visible; projections remain webhook-owned. |
| Deactivate member | Require an operational reason and preserve history. | WorkOS-first shared-membership deactivation, followed by app unassignment. | Future access ends after command/projection reconciliation; membership and decision history remain readable. |
| Edit workflow policy | Toggle proposal, Milestone, Draw, and Site Visit permissions for the whole app organization. | Fluent Convex admin mutation with audit reason. | The shared bundle caps every assigned lender action. |

Production commands must expose validation, authorization, pending sync,
success, and failure states. Material changes record actor, role, timestamp,
prior state, new state, warnings, and reason where applicable. Direct writes to
`users`, `workosOrganizations`, `workosOrganizationMemberships`,
`workosOrganizationRoles`, `workosRoles`, or `workosPermissions` are outside the
contract.

### Roles and authority

- WorkOS is authoritative for the shared identity organization, user,
  membership, role, permission, invitation, and projection state.
- DrawFlow is authoritative for Lender Organization records, parent Brokerage
  relationships, workflow permissions, and user assignments.
- Verified lender role slugs are exactly `lender`, `lender-admin`, and
  `lender-staff`. Platform Admin may bypass capability caps only for an explicit
  target app organization after parent and target-scope validation.
- Every lender request checks active user projection, active membership in the
  configured shared WorkOS organization, exact lender role, one active app
  assignment, active parent Brokerage, active target organization, and the
  organization-wide policy cap.
- No Principal Broker transfer or brokerage membership-management controls
  appear on the lender organization surface. No manager alias or parallel
  WorkOS identity/membership system exists.

### Lender review relationship

After a membership command, production must re-evaluate or enqueue the affected
route/query/write access, lender-review assignment and quorum context, recipient
routing, work queues, and audit/notification work. The interface shows these as
effects, not as policy controls.

Back Office owns Review Requirements Setup before closing and the locked policy
handed to the active Build. Organization Management cannot change reviewer
groups, quorum count, required evidence, Site Visit requirements, approval
order, or policy satisfaction. Role labels and active membership count alone do
not establish quorum eligibility or prove that a review gate is satisfied.

### Production acceptance criteria

Implementation is complete only when all of the following are true:

1. `/backoffice/lenders` preserves the directory-first Variant E hierarchy
   through an app-owned organization table, assignment queue, detail drawer,
   member controls, and staged command states.
2. Search/status filters and member lists are bounded to validated Brokerage or
   application organization scope.
3. Invitation, role-change, and deactivation actions use WorkOS-first commands
   against the shared identity organization and render pending sync, success,
   and failure without optimistic projection writes.
4. Organization provisioning never creates a WorkOS organization.
5. One-active-assignment, pending-reconciliation, cross-Brokerage,
   cross-organization, exact-role, and policy-cap checks are tested.
6. Deactivation preserves membership and decision history and requires an audit
   reason.
7. The lender `/lender/organization` route is read-only, app-level, and shows a
   contact-admin empty state without WorkOS directory data when unassigned.
8. No manager role, duplicate WorkOS identity/membership source, or
   lender-owned approval-policy model is introduced.
9. Authorization and WorkOS command behavior have focused tests; the promoted
   routes have SSR/render, keyboard, responsive, and browser interaction evidence.

### Prototype-to-production boundary

The prototype intentionally keeps all drafts in memory and leaves final
execution unavailable. Production must replace that unavailable execution step
with the authorized commands and states above. It must not copy prototype
fixtures, claim that the one displayed member is complete production data, or
ship the fixed comparison switcher.

## Undecided prototype placeholders

The following surface sets are active exploration only. They are placeholders,
not alternate implementation designs. No production ticket may construct a
replacement from requirements or select a variant by inference. It must wait
for an explicit selected/approved/locked result and a registry update.

| Surface set | Prototype route/pending location | Status |
| --- | --- | --- |
| Builder Draw Needs Revision | canonical Draw-detail integration not yet prototyped | Awaiting decision; the locked Milestone layout must not be inferred as the Draw layout |
| Lender Proposal List | no prototype selected | Deferred placeholder |

The locked Builder Milestone contract supersedes the rejected dedicated
correction-workspace direction. It does not select a Builder Draw presentation.
Both resources still use the same durable request/cycle domain pattern, but a
future Draw UI decision must be recorded separately.

## Required implementation-ticket language

Every ticket for a locked set must include this statement verbatim or with no
weaker meaning:

> Directly promote the selected Lender Portal prototype. Start from its route
> and component structure; do not rebuild an alternative surface from the
> requirements. Replace only representative local data and local-only actions
> with canonical production integrations while preserving the documented
> hierarchy, interaction gates, and authorization boundaries.

Every ticket for an undecided set must state that product implementation is
blocked pending a selected prototype variant.
