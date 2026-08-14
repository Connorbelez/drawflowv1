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

| Surface | Selected prototype | Required promotion boundary |
| --- | --- | --- |
| Lender Dashboard | `lender.prototype.tsx`, Variant D | Action-led portfolio: `Needs my attention` precedes the durable portfolio ledger; no inferred urgency/SLA data. |
| Lender Organization Management | `lender.organization-management-prototype.tsx`, Variant E | Promote the shared user-management table/detail-sheet contract only through the canonical organization/membership authority boundary. |
| Lender Proposal Review | `lender.proposal-confirmation-prototype.tsx`, Variant D | Promote the Back Office Proposal Packet host plus right-side lender confirmation sheet, five acknowledgements, audit evidence, confirmation gate, and decline-reason gate. |
| Back Office Review Requirements Setup | `backoffice/proposals/review-requirements-prototype.tsx`, Variant A | Promote the Closing-workspace policy configuration/lock model; do not build a standalone policy system. |
| Lender Build Detail Overview | `lender.build-detail-overview-prototype.tsx`, Variant C, approved and locked 2026-08-13 | Promote the compact Precision console: narrow Build overview, expandable Milestone ledger with canonical budget, receipt/invoice coverage, actual-or-planned date ranges and a focused read-only Milestone sheet; pooled Build funding and Draw records; review-attached evidence; and participant-visible public Collaboration. Do not promote the full Build Workspace or add overview decisions. |
| Lender Milestone Queue | `lender.milestones-prototype.tsx`, Variant C | Promote evidence-rich workflow lanes over canonical current-cycle Milestone projections. |
| Canonical Milestone Detail and Review Sheet | `lender.milestone-review-prototype.tsx`, Variant A | Promoted through the shared `MilestoneDetailSheet`; preserve the four-tab hierarchy, role-aware actions, verified policy gates, canonical child records, privacy, correction/resubmission, and audit ownership. |
| Lender Draw Queue | `lender.draws-prototype.tsx`, Variant D, approved and locked 2026-08-13 | Promote Build-packet queue structure, lower-left color-and-symbol decision status, and its validated pooled-funding/evidence provenance contract. |
| Canonical Draw Review Sheet | `lender.draw-review-sheet-prototype.tsx`, Variant A | Promote one role-aware Draw sheet; preserve pooled availability, request-level evidence, peer gates, private decline rationale, collaboration, and non-gating Action Items. |
| Builder Milestone Needs Revision | `builder.milestone-revision-detail-prototype.tsx`, Variant A | Promote the locked inline revision notice inside the canonical `MilestoneDetailSheet`: `Needs revision` returns the same request to draft-like editing, leads with Builder-visible free-text revision instructions, preserves locked requirements and authorized history, and resubmits as cycle N+1 with every required approval reset. |

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

### Decision

Variant E, **Shared user management operations**, is approved. Start from
`src/routes/lender.organization-management-prototype.tsx` with
`?variant=E`. Variants A–D are rejected comparison history. Production may
remove the switcher and rejected variants only after Variant E has been promoted
and verified.

### Product question settled

An authorized lender administrator or Principal Broker manages the brokerage
organization through the existing User Management directory and member sheet,
extended with lender-specific administration and review-relationship context.
The surface is operational: it starts and completes authorized organization
membership commands. It is not a read-only directory and it does not own lender
approval policy.

### Required component composition

1. Reuse `LenderPrototypeShell` as the lender workspace-shell reference and
   preserve Organization as the active navigation context.
2. Reuse `UserManagementDirectoryTable` from
   `src/routes/backoffice/-user-management-surface.tsx`. This is the canonical
   shadcn Table backed by TanStack Table; extend it rather than copying it.
3. Reuse `UserDetailSheet` from
   `src/routes/backoffice/-user-management-detail-sheet.tsx`. Preserve its
   membership, role, organization, profile, and status information hierarchy.
4. Preserve the Variant E directory toolbar: member search,
   membership-status filters, and the organization-level Invite member action.
5. Preserve the member-sheet tabs: Access, Administration, Review relationship,
   and History.

### Required operations

| Operation | Required interface | Production command boundary | Completion state |
| --- | --- | --- | --- |
| Invite member | Collect a valid email and verified starting role; show a complete draft and review step. | Existing WorkOS-first invitation/user-management action. | Accepted or failed command is visible; active membership appears only after canonical webhook/sync projection. |
| Change access | Show current and proposed canonical role slugs together; require at least one supported role and a review step. | Existing WorkOS-first membership-role action. | Accepted or failed command is visible; effective access follows canonical projection state. |
| Deactivate member | Require an operational reason and explicit acknowledgement that history is retained; show affected access and work. | Existing WorkOS-first membership deactivation action. | Future access ends only after authorized completion; membership and decision history remain readable. |
| Transfer Principal Broker control | Block normal role removal and deactivation when the target is the active Principal Broker. | Canonical protected transfer-of-control workflow, not the normal member command. | Exactly one active Principal Broker remains and transfer history is audited. |

Production commands must expose validation, authorization, pending sync,
success, and failure states. Material changes record actor, role, timestamp,
prior state, new state, warnings, and reason where applicable. Direct writes to
`users`, `workosOrganizations`, `workosOrganizationMemberships`,
`workosOrganizationRoles`, `workosRoles`, or `workosPermissions` are outside the
contract.

### Roles and authority

- WorkOS is authoritative for user, organization, membership, role, and
  permission state.
- Verified organization-management slugs are `admin`, `principle-broker`,
  `broker`, and `broker-staff`.
- Admin and Principal Broker have the current organization-wide
  user-management capability. Authorization still checks active organization,
  membership, role, permission, and protected-target rules on the server.
- The UI label is `Principal Broker`; policy and projection data retain the
  canonical `principle-broker` slug.
- No canonical `manager` role exists. The approved MVP has no manager
  appointment capability. Do not add an alias, app-only capability, or
  parallel role/membership system.

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

1. The production surface preserves Variant E's directory-first hierarchy,
   toolbar, shared table, shared sheet, four tabs, and staged review gates.
2. Search and status filters use permission-shaped canonical organization
   projections and never cross the active organization boundary.
3. Invite, role-change, and deactivation actions use the canonical WorkOS-first
   actions and render pending sync, success, and failure without optimistic
   projection writes.
4. Principal Broker removal and deactivation fail closed into the protected
   transfer-of-control workflow.
5. Deactivation preserves membership and decision history and requires an audit
   reason.
6. Downstream access, assignments, lender-review quorum context, recipients,
   work queues, and audit/notification effects are reconciled or visibly
   pending.
7. The surface describes but cannot mutate Back Office-owned review
   requirements or approval policy.
8. No `manager` role, duplicate organization model, duplicate membership table,
   or lender-owned approval-policy model is introduced.
9. Authorization and WorkOS command behavior have focused tests; the promoted
   route has SSR/render, keyboard, responsive, and browser interaction evidence.

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
| Back Office Approval and Lender Assignment | dedicated Back Office proposal prototype, Variants A-C | Awaiting decision |
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
