# Lender Prototype Contracts

These prototypes preserve approved lender-portal interaction decisions. Treat the
selected variants as implementation contracts: production code may replace
representative data and local state, but it must preserve the documented
information hierarchy, interaction gates, and ownership boundaries.

The shared prototype chrome lives in `LenderPrototypeShell.tsx`; the fixed
comparison control lives in `PrototypeVariantSwitcher.tsx`.

## Lender Dashboard

**Purpose:** Define the lender's action-first portfolio landing surface.

**Selected status:** Variant D, **Accepted · Action-led portfolio**. Variants A,
B, and C remain comparison history and are rejected.

**Interaction and data constraints:**

- `Needs my attention` is the leading section; the assigned portfolio ledger
  remains visible as the durable overview.
- Attention rows show canonical workflow facts such as current state, recorded
  approvals, outstanding quorum, waiting actor, or evidence state. They do not
  infer urgency.
- Per-review deadlines, SLA timers, and overdue claims require canonical source
  data. Do not derive them from timestamps, planned construction dates, or UI
  copy.
- The surface uses the shared DrawFlow workspace-shell structure used by Back
  Office and Builder, with lender-specific navigation. It is not a separate
  lender application shell.

**Canonical reuse boundary:** Reuse the production workspace shell, navigation
primitives, Build identity, and workflow state. Dashboard cards and rows are
projections; they do not own proposal, Milestone, Draw, approval, or evidence
records.

**Prototype:** `../../routes/lender.prototype.tsx` at
`/lender/prototype?variant=D`, composed with `LenderPrototypeShell.tsx`.

## Lender Organization Management

**Purpose:** Define the directory-first interaction contract for managing
application-owned Lender Organizations, their assigned lender users, and the
effect of shared WorkOS membership operations on lender review work.

**Selected status:** Variant E, **Approved · Shared user management
operations**. Variants A, B, C, and D remain rejected comparison history and
must not be promoted as competing production layouts.

**Locked information architecture:**

- The directory-first hierarchy is `Brokerage → Lender Organization → assigned
  lender users`. Production may reuse the Builder roster pattern for the
  organization table and unassigned-user queue while preserving the Variant E
  member-directory information hierarchy.
- The toolbar contains search/status filters and member counts. Back Office may
  add organization provisioning and invitation operations. The lender route
  omits those controls.
- Selecting a Lender Organization opens the detail drawer. It retains parent
  Brokerage, application status, assigned/pending members, exact lender roles,
  shared workflow permissions, and reconciliation context.
- Back Office Administration exposes provisioning, assignment, invitation
  staging, shared role change, policy editing, and soft deactivation. The lender
  route instead exposes versioned member decision grants and eligible-member
  deactivation only to active same-organization `lender-admin` users. Each
  workflow validates a draft, shows current/proposed state, and records a
  reason before execution.
- Principal Broker transfer and brokerage membership controls are not part of
  the lender organization surface.
- Membership changes show their relationship to lender-quorum re-evaluation,
  recipient routing, work queues, and audit history. They do not determine
  quorum eligibility or claim that a review requirement is satisfied.
- Back Office owns immutable, versioned default Review Requirements for each
  application-owned Lender Organization. The selected organization detail
  surface reuses the approved Variant A fields to configure defaults for future
  assignment snapshots. Lender users and organization administrators cannot
  edit them.
- Existing assigned Proposals and active Builds remain unchanged when an
  organization default changes. Before lock, the canonical Build policy shows
  inherited/customized provenance and supports an explicit audited restore of
  the organization's current default.

**Role and ownership contract:**

- WorkOS remains authoritative for the shared identity organization, users,
  memberships, roles, permissions, invitations, and projections. Production
  commands call WorkOS first and wait for webhook/sync updates; they never write
  directly to WorkOS projection tables.
- DrawFlow owns Lender Organization records, parent Brokerage relationships,
  workflow permissions, and a thin user-assignment relation. WorkOS never
  provisions a Lender Organization.
- The exact lender role slugs are `lender`, `lender-admin`, and `lender-staff`.
  Platform Admin can bypass a policy cap only for an explicit app target after
  parent and target-scope validation. Effective final-decision authority is the
  intersection of active WorkOS state, active app assignment, organization cap,
  and the corresponding versioned member grant.
- No `manager` alias, Principal Broker lender-surface control, or duplicate
  identity/membership system exists.

**Prototype safety boundary:** The approved prototype is an operations
simulation, not a read-only information page. Its controls are interactive and
its draft/review states are visible, but all state remains in memory. It sends
no invitation, performs no WorkOS mutation, assigns no real role, deactivates no
membership, changes no permission or approval policy, and creates no audit
event. The final execution control stays unavailable in the prototype.

**Evidence:** Brokerage tenancy and the corrected application Lender
Organization boundary come from `docs/draw_flow_production_prd.md` §§3.1–3.5
and 9.2.1. Shared WorkOS ownership and exact lender roles come from
`docs/lender-portal-prototype-promotion.md`, `src/lib/auth/rbac.ts`, and
`convex/lenderOrganizationAccess.ts`. The Builder roster pattern comes from
the existing Back Office builders surface. The review-policy ownership
boundary comes from this README's Back Office Review Requirements Setup
contract, and the representative lender quorum comes from
`../../routes/lender.proposal-confirmation-prototype.tsx`.

**Prototype:** `../../routes/lender.organization-management-prototype.tsx` at
`/lender/organization-management-prototype?variant=E`, composed with
`LenderPrototypeShell.tsx`, `PrototypeVariantSwitcher.tsx`, the shared
`UserManagementDirectoryTable`, and the shared `UserDetailSheet`.

**Production implementation contract:**
`../../../docs/lender-portal-prototype-promotion.md`, section **Lender
Organization Management — locked implementation contract**. Future
implementation must start from Variant E and satisfy that section's command,
authority, downstream-effect, and verification criteria. The same decision is
recorded in `../../../docs/lender_portal_mvp_feature_brief.md` §Confirmed MVP
scope, `../../../docs/lender_portal_mvp_spec.md` §Domain ownership and identity
and §Participant projections and UI, and
`../../../docs/lender_portal_mvp_implementation_plan.md` Phase 1.

**Approved amendment, 2026-08-25:** `/lender/organization` is an application-
level operator surface for active same-organization `lender-admin` users. It
reuses the production-owned Variant E directory and `UserDetailSheet`; other
lender roles receive the same member facts and effective permissions read-only.
The organization-wide workflow policy remains read-only. Invitation,
role-change, organization-policy, Brokerage, and Back Office proposal controls
remain outside the lender-facing composition.

## Proposal Review

**Purpose:** Define how a lender reviews and records a complete proposal
confirmation without duplicating the Back Office proposal record.

**Selected status:** Variant D, **Accepted · Progressive dossier**. Variants A
and C remain rejected comparison history.

**Interaction and data constraints:**

- The page is a representative Back Office Proposal Packet host. Full lender
  confirmation opens in the right-side sheet.
- The sheet contains five expandable acknowledgement areas: Property,
  Milestones & schedule, Budget, Builder, and Access/review policy.
- Every acknowledgement or cleared acknowledgement appends visible prototype
  audit evidence. Confirmation unlocks only when all five areas are
  acknowledged.
- Decline remains available only with a reason. Access/review policy is
  Back Office-configured and lender read-only.
- Scope is limited to the five acknowledgements and the confirm-or-decline
  decision. The prototype defines no general comment thread, persistence
  contract, additional role taxonomy, or review-deadline data.

**Canonical reuse boundary:** The Back Office Proposal Packet and its canonical
proposal revision remain the host and source of truth. Production should add the
lender decision sheet to that surface and write acknowledgements and decisions
through the canonical audit and proposal workflows; it should not create a
lender-owned proposal copy. The prototype's in-memory state demonstrates the
interaction only.

**Prototype:** `../../routes/lender.proposal-confirmation-prototype.tsx` at
`/lender/proposal-confirmation-prototype?variant=D`, composed with
`LenderPrototypeShell.tsx`.

## Back Office Review Requirements Setup

**Purpose:** Define how Back Office authors the Milestone and Draw review
requirements that will govern the active Build before proposal closing.

**Selected status:** Variant A, **Approved and locked · Closing workspace**.
Variants B, C, and D remain unselected comparison history.

**Interaction and data constraints:**

- Review Requirements Setup lives inside the existing Back Office proposal
  Closing workspace, before closing is recorded.
- Draw review supports Back Office only, lender quorum only, or both.
- Milestone review supports the same three reviewer alternatives, with separate
  Site Visit and receipt / invoice requirements.
- Back Office approval is one authorized approval. When both groups are
  required, Back Office and the lender quorum may complete in either order.
- Lender quorum is selectable from one through the count of active assigned
  lender members. The four-member prototype value is a local fixture, not live
  membership data.
- The pre-closing summary shows the policy that will govern the active Build.
  The policy locks when closing is recorded.
- The prototype is read-only and uses local state. It does not define
  persistence, post-closing editing, deadlines, SLAs, generic comments,
  additional roles, or production closing behavior.

**Canonical reuse boundary:** The existing Back Office proposal detail and
Closing workflow remain the host and source of truth. Production must extend
that canonical flow and its active-Build policy handoff; it must not create a
parallel policy system. Reuse the shared prototype switcher and existing
Frame, Card, RadioGroup, Checkbox, NativeSelect, Table, Separator, Badge, and
Button primitives.

**Prototype:**
`../../routes/backoffice/proposals/review-requirements-prototype.tsx` at
`/backoffice/proposals/review-requirements-prototype?variant=A`, composed with
`BackOfficeReviewRequirementsSetupPrototype.tsx`.

**Implementation handoff:** Future agents must start from the selected Variant
A route and component structure. Do not redesign or reconstruct this surface
from the written requirements. Replace only the representative membership
fixture and local interaction state with canonical production integrations.
Any material structural divergence requires a new product decision and aligned
updates to this registry, the promotion contract, and the relevant PRDs before
implementation begins.

**Verification:** Focused Biome checks passed. The authenticated route was
verified across Variants A–D for local controls, guided navigation, URL and
keyboard switching, refresh reset, console errors, and desktop overflow. A
full-build rerun remains limited by unrelated missing `fairlend-*` output
assets.

## Back Office Approval and Lender Assignment

**Purpose:** Embed Lender Organization assignment into the existing
production proposal detail. This is not a replacement proposal screen.

**Selection status:** Variant A was explicitly approved and locked on
2026-08-14. A product placement decision on 2026-08-19 moved the compact
**Lender assignment** row from the proposal header into the shared **Approval
status** card. It still opens one focused assignment modal. Builder, Back
Office, and Lender proposal-review consumers use the same card placement with
permission-shaped content. Variants B and C were comparison hypotheses and are
not part of the locked surface.

Selection records the future promotion contract only. It does not authorize
production integration, loaders, persistence, authorization, or domain work in
this prototype task.

**Interaction and data constraints:**

- Variant A renders the real `ProductionProposalReviewSurface` with its approved
  visual-parity fixture. Production injects the permission-shaped assignment or
  confirmation region through the shared Approval status card slot.
- A successful assignment changes local in-memory state only. Refresh or
  direct navigation restores the unassigned fixture. No proposal, assignment,
  policy, confirmation, withdrawal, closing, activation, or audit record is
  persisted.
- The modal assigns exactly one application-owned Lender Organization.
  It does not expose user administration, model a Lender Organization as a
  WorkOS organization, or imply that organization membership carries approval
  weight.
- The assignment impact is limited to current-revision lender access, lender
  confirmation before closing, and confirmation of the configured
  review policy.
- The focused modal shows the current representative review-policy state and
  links to **Edit review policy**. Changing that policy creates a new proposal
  revision and requires full lender reconfirmation.
- The assigned state names the next actor and closing gate. Before closing, the
  Back Office Admin can use the focused withdrawal confirmation to remove
  current lender authority, restore internal closing, and preserve the former
  lender's authorized read-only historical record.

**Canonical reuse boundary:** The production Back Office proposal detail is the
visible host and proposal source of truth. The existing Back Office Review
Requirements Setup remains the policy authoring surface. The locked lender
Proposal Review remains the confirmation contract. This prototype adds no
parallel proposal, policy, identity, assignment, audit, or authorization
system.

**Impeccable application-pipeline interaction contract:** The primary actor is
the Back Office Admin. The primary job is to assign exactly one eligible
Lender Organization to an approved proposal regardless of capital source while
keeping the current revision, current review policy, next actor, and closing
effect visible. Keyboard focus returns to the Approval status card trigger
after dismissal, selection changes clear acknowledgement, completion is
announced, long names wrap, and modal content remains scrollable on narrow
viewports. Builder-facing lender identity and private lender rationale remain
excluded.

**Prototype:**
`../../routes/backoffice/proposals/lender-assignment-prototype.tsx` at
`/backoffice/proposals/lender-assignment-prototype?variant=A|B|C`, composed with
`BackOfficeLenderAssignmentPrototype.tsx` and the shared
`PrototypeVariantSwitcher.tsx`.

## Lender Build Detail Overview

**Purpose:** Compare three throwaway structures for the narrow, read-only
Lender Build detail projection. The surface helps an eligible external lender
user understand one assigned live Build without exposing the canonical Builder
or Back Office Build Workspace.

**Selected status:** Variant C, **Approved and locked · Precision console**.
This lock records the winning prototype contract only; it does not promote the
route or make it production-ready. Variants A and B remain comparison history.
Production implementation remains outside this task; a future implementation
must directly promote this locked prototype rather than reimplement a
requirements-equivalent surface.

**Variant hypotheses:**

- Variant A adapts the current DrawFlow Build detail composition into a dense,
  lender-safe operational overview.
- Variant B uses a calm, plain-language stakeholder brief with the narrowest
  non-technical hierarchy.
- Variant C is the locked compact precision console. Iteration removes
  internal contract narration and decorative wrapper surfaces while retaining
  its local section index, sharp information density, DrawFlow facts, and
  accessibility.

**Information, interaction, and authorization constraints:**

- Every variant exposes overview facts, Milestone records, Draw records, and
  evidence attached to the relevant Milestone or Draw review. Selected Variant
  C also includes the explicit public Collaboration projection described below.
- The canonical Build Workspace remains the source of truth. This surface is a
  permission-shaped participant projection and owns no Build, Milestone, Draw,
  Evidence Package, Site Visit, policy, or audit data.
- Build identity, location, high-level construction state, recorded Milestone
  progress, relevant review evidence, and reviewer-safe pooled funding position
  are representative local data only.
- Locked Variant C now shows each Milestone's canonical budget and planned
  date range, preferring actual start/completion timestamps when the fixture
  supplies them. Rows expand into their canonical Sub-milestone records, and
  the Milestone name opens a prototype-local read-only review sheet with no
  decision controls.
- Receipt/invoice coverage is present as a column and review fact, but renders
  `Not recorded` because the representative Build fixture supplies no canonical
  cost-document input. The prototype does not infer coverage from Draw evidence
  or reimbursement amounts.
- A 2026-08-25 production amendment extends locked Variant C with the immutable
  Milestone and Draw review policy below Build identity and with writable
  participant-visible Collaboration after Review evidence. Every active member
  of the currently assigned Lender Organization may publish fixed Build-wide
  updates, attach governed files, paginate the complete authorized response
  thread, and reply. Production reuses canonical Build Collaboration
  persistence, lifecycle, audit, notification, moderation, search, webhook,
  and attachment ownership. The prototype fixture remains local and does not
  define a parallel comment model.
- Draw funding does not infer a Milestone or Draw Group allocation. The overview
  adds no receipt gate or Draw-specific Site Visit gate.
- The only outbound actions navigate to the existing focused Milestone and Draw
  review prototypes. They do not record a decision or release funds.
- The prototype has no Builder/Budget/schedule changes, policy controls,
  evidence upload, review decision, Draw release, deadline, SLA, private
  audiences, scheduling, acknowledgements, Action Items, private reviewer
  rationale, internal reviewer identity, contractors, timeline/Gantt, Draw
  Group visualization, internal notes, broad document library, or detached
  documents. Production collaboration mutations are limited to public
  Build-wide posts, responses, and governed attachments.
- Back Office Admin remains the internal owner. Builder and Builder Staff appear
  only as the source of submitted work or evidence. Withdrawal is not a normal
  live-Build detail state because it removes live Build access.
- Variant switching and in-page navigation are local only. Refresh preserves no
  product decision or domain state.

**Controlling evidence:** The canonical main-checkout contracts are the
`Locked Lender Build Detail decision` in
`../../../docs/lender_portal_mvp_feature_brief.md`, the matching participant
projection and user-story contract in
`../../../docs/lender_portal_mvp_spec.md`, the `Locked Lender Build Detail
implementation contract` and Phase 7 acceptance gates in
`../../../docs/lender_portal_mvp_implementation_plan.md`, and the locked
promotion boundary in `../../../docs/lender-portal-prototype-promotion.md`.
Together they require direct promotion of selected Variant C and prohibit a
requirements-equivalent redesign. They do not authorize promotion in this
prototype task.

**Representative source and reuse boundary:** Build identity, Draw state,
review-attached Draw evidence, and pooled funding facts reuse
`lenderDrawQueueContract.ts`. Milestone status/progress and relevant Milestone
evidence/Site Visit facts reuse
  `../../features/production-proposals/visualParityFixtures.ts`. The selected
  Variant C budget, planned/actual date fallback, Sub-milestone breakdown, and
  public collaboration update come from that same fixture. These local fixtures
  are composed only for prototype evaluation and are not asserted to be one
  persisted Build. The route reuses `LenderPrototypeShell.tsx`,
  `PrototypeVariantSwitcher.tsx`, and the existing Frame, Card, Button, Badge,
  Progress, Separator, Table, and Sheet primitives. It adds no loader, mutation,
  domain model, authorization rule, or production component.

**Verification evidence and limits:**

- Final validation used the main checkout on branch
  `08-13-lenderdashboard-prod` at HEAD
  `d253f4c56d5ec5ebbd9a5cf38238269d8fc97b07`. The exact local URLs were
  `http://127.0.0.1:3026/lender/build-detail-overview-prototype?variant=A`,
  `?variant=B`, and `?variant=C` on the same route.
- `bun test src/routes/-lender.build-detail-overview-prototype.test.tsx` passed
  all 3 SSR cases with 70 assertions. The contract covers the requested finance
  and schedule columns, disclosure controls, public Collaboration projection,
  and internal-note exclusion while retaining the prohibited-workspace and
  mutation checks.
- Focused Biome passed. `bun run typecheck` passed its Convex TypeScript and Vite
  build stages after one shared-output race was retried with the output idle.
  The Impeccable detector returned no findings when run once after the selected
  Variant C iteration.
- The selected Variant C in-app desktop pass on port 3026 verified the
  disclosure state, read-only Milestone sheet, public Collaboration update,
  internal-note exclusion, and zero decision controls. The table has no
  horizontal clipping at the supplied 1375px viewport. `bun run build`
  completed successfully during the final verification window.
- A later fresh direct-SSR probe returned HTTP 500 because a concurrent,
  unrelated generated route imports the now-missing
  `BackOfficeLenderAssignmentPrototype.tsx`. This Build Detail task does not own
  that route or component and did not restore or modify it. Final fresh-process
  SSR remains blocked by that shared-worktree condition, not by a diagnostic in
  the Build Detail prototype route.
- The exact in-app browser exposed no mobile viewport-emulation capability, so
  this iteration does not claim a post-change mobile visual pass. Responsive
  behavior remains covered by the route's breakpoint/overflow implementation
  and SSR, not a mobile screenshot. This is also not an authenticated loader or
  authorization integration test because the prototype uses representative
  local data only.

**Scope audit and restoration:** The final audit found no production route,
production component, Convex/domain, loader, authorization, or shared
production-test edit owned by this Build Detail task. Concurrent Draw Review and
other dirty-worktree changes were preserved untouched. The coordinator-owned
`../../../docs/lender-portal-prototype-promotion.md` remains unchanged. A
task-created standalone handoff document was removed so the retained Build
Detail surface is limited to this registry entry, the named prototype route,
its focused test, and generated route registration.

**Prototype:** `../../routes/lender.build-detail-overview-prototype.tsx` at
`/lender/build-detail-overview-prototype?variant=A|B|C`, composed with
`LenderPrototypeShell.tsx`, `PrototypeVariantSwitcher.tsx`, and existing UI
primitives. Focused contract:
`../../routes/-lender.build-detail-overview-prototype.test.tsx`.

## Lender Milestone Queue

**Purpose:** Define the lender's read-only organization queue for inspecting
current-cycle Milestone requirements before entering a decision workflow.

**Selected status:** Variant C, **Locked · Evidence-rich workflow lanes**.
Variants A and B remain rejected comparison history.

**Interaction and data constraints:**

- The scope control switches between `Needs my action` and `All assigned`.
  Requests remain grouped into Needs my action, Waiting on others, Builder
  correction, and Approved lanes.
- Queue and detail views expose only the representative facts present in the
  route: policy and approval progress, planned versus actual cost and dates,
  receipt coverage, evidence facts, and Sub-milestone site-visit, receipt, and
  Builder-evidence signals.
- The prototype is read-only and uses local representative data. It does not
  define persisted approval, correction, or request-transition behavior.

**Canonical reuse boundary:** Production projections must read canonical Build,
Milestone, Evidence Package, Site Visit, policy, and approval state. The queue
may organize those records but must not own parallel copies of them. Reuse the
shared lender shell and existing UI primitives.

**Prototype:** `../../routes/lender.milestones-prototype.tsx` at
`/lender/milestones-prototype?variant=C`, composed with
`LenderPrototypeShell.tsx`.

## Canonical Milestone Detail and Review Sheet

**Purpose:** Define the one shared Milestone detail and decision surface used by
Builder, Back Office, and Lender routes over the same canonical Milestone.

**Selected status:** Variant A, **Approved, locked, and promoted to
production**. Later A-D structural explorations were rejected as drift and must
not be used as alternative implementation designs.

**Locked contract:** Preserve Overview, Evidence, Receipts / invoices, and
Collaboration. Evidence is an aggregated image-card gallery with owning
Sub-milestone links. Cost-document rows show subtotal, tax, and the authorized
open/download action. Collaboration aggregates canonical Sub-milestone
discussion threads. Sub-milestone cards show Approved, Pending Review, or
Rejected and separately show required Back Office and lender-quorum gates when
verified policy facts are available.

**Role and lifecycle boundary:** The active route selects Builder, Back Office,
or Lender actions, and canonical permissions cap them. Builder views do not
expose reviewer identity, internal votes, or private rejection rationale.
Rejection requires a private reason, returns the same request record for
correction and resubmission, retains history, and resets required approvals.
Reviewer actions reuse the existing governed Review workflow.

**Canonical reuse boundary:** Production must extend
`../../features/backoffice-build-detail/MilestoneDetailSheet.tsx` through its existing route
adapters. It must not create a parallel sheet or duplicate Milestone,
Sub-milestone, evidence, Site Visit, cost-document, collaboration, review,
approval, or audit state. The normative contract is
`../../../docs/specs/lender-milestone-review-and-decision.md`.

**Prototype:** `../../routes/lender.milestone-review-prototype.tsx` at
`/lender/milestone-review-prototype?variant=A`.

## Lender Draw Queue

**Purpose:** Explore how a lender scans assigned Draw requests and chooses the
next canonical Draw decision to open without duplicating Draw, Evidence Package,
policy, approval, or audit records.

**Selected status:** Variant D, **Approved and locked · Build packets**.
Approved by product on 2026-08-13. Variant A remains a dense decision-ledger
comparison, Variant B remains a split-triage comparison, and Variant C remains
a workflow-lane comparison. They are retained only as rejected comparison
history and must not be promoted as competing production layouts.

**Locked interface contract:** Production must preserve the Build-grouped packet
hierarchy, the large color-and-symbol decision-status signal at the lower left
of each request card, peer approval-group progress, focused current-cycle
evidence context, and reconciled pooled funding position. Material changes need
a new product decision and an updated prototype contract before implementation.

**Interaction and data constraints:**

- The queue defaults to `Needs my action`; `All assigned` retains requests that
  are waiting on another required group, waiting for Builder correction, or
  already approved.
- Draw policy supports Back Office only, lender quorum only, or both. When both
  are required, the groups are peers and may complete in either order.
- Rejection returns the same request record to the Builder for correction,
  retains prior-cycle history, and resets every required approval for the next
  submission cycle.
- Builder-visible information is limited to requirements and high-level status.
  Reviewer identity and lender-only decision rationale remain private.
- The prototype is read-only and uses representative local data. It defines no
  persisted decisions, release/payment controls, review deadlines, general
  comments, additional approver taxonomy, or broad document library.

**Locked data contract:** Visible claims are projected from structured source
facts in `lenderDrawQueueContract.ts`; the fixture does not store UI sentences
such as `Evidence package complete` as data. The contract validates that source
funding reconciles before/request/after, evidence completion has current-cycle
package provenance, and approval/evidence counts are internally valid.

| Variant D fact | Canonical owner / deterministic projection |
| --- | --- |
| Build, Builder, location | `activeBuilds` and its canonical organization / Builder relationship |
| Draw ID, label, amount, submission time, request note | `activeBuildDrawRequests` |
| Draw Release Work Order | Draw request `workOrderKey` and the canonical Work Order record when production exposes it |
| Pooled funding position | Canonical Build funding availability before the request, the request amount, and the reconciled remaining availability; the lender queue does not associate the Draw with a Milestone or Draw Group |
| Evidence package complete | The durable current decision-cycle submission snapshot and its exact relevant evidence references required by Lender Portal MVP implementation-plan Phase 5; current canonical Evidence Package revisions are reused where they own those references |
| Location signals verified | Every package item satisfying a location-required requirement has `locationVerified: true`; location failure remains evidence and projects as incomplete, never discarded |
| Policy and approval progress | The locked active-Build Draw policy snapshot plus append-only decisions for Back Office and lender quorum; group order does not affect completion |
| Needs my action | Authenticated lender assignment plus an outstanding decision in the current lender-quorum requirement |
| Correction, resubmission cycle, retained history | Same `activeBuildDrawRequests` identity plus an append-only submission-cycle and decision ledger; rejection resets current-cycle approvals but never deletes prior decisions |

These future-facing claims are intentional. The Lender Portal MVP feature brief
is the product contract for this slice, and implementation-plan Phases 3, 5, 6,
and 7 require the locked policy snapshot, stable same-record decision cycles,
current-cycle evidence references, group decisions, privacy projections,
Needs-my-action derivation, and all-assigned Draw queue before the specification
is considered landed. Variant D may rely on those promised canonical records
even though the current schema does not expose all of them yet. It must not
infer them from mutable Milestone state or create a second Draw model.

Draw-level receipt coverage and Draw-level Site Visit requirement labels are
excluded: the MVP contract defines those independent gates for Milestone review,
not Draw review.

**Canonical reuse boundary:** Production must project canonical Build, Draw
request, Draw Release Work Order, pooled funding availability, current-cycle
Evidence Package, approval policy, and audit history. The queue organizes those
records and opens the existing Draw decision context; it does not own a parallel
Draw model. Reuse the shared lender shell, fixed prototype switcher, Frame/Card
primitives, and existing Draw approval surface.

**Prototype:** `../../routes/lender.draws-prototype.tsx` at
`/lender/draws-prototype?variant=D`, composed with
`LenderPrototypeShell.tsx`.

## Canonical Draw Review Sheet

**Purpose:** Define the shared Draw Request detail and review sheet used by
Builder, Back Office, and lender personas. This is one role-aware surface over
the same canonical Draw Request, not separate persona-owned review screens.

**Selected status:** Variant A, **Approved and locked · Financial summary
sheet**. Variants B and C remain rejected comparison history and must not be
carried into production as alternative layouts.

**Locked information architecture:**

- The sheet opens with the canonical Draw Request identity, requested amount,
  submission cycle, Build, submission context, and retained-history state.
- Builder identity and available contact information are prominent, not buried
  in a secondary people or allocation view.
- The financial summary leads with Total approved, Drawn amount, current Draw
  availability, this request, post-request availability, and receipt / invoice
  coverage of total unlocked funds. The coverage ring uses Total approved as
  its denominator.
- Draw availability is pooled once unlocked and may be used when needed.
  Attached Evidence is request-level and must not imply that a Draw Request is
  allocated to a Milestone or Draw Group.
- The approval-policy section shows each required peer gate and its current
  satisfaction state. Back Office and lender quorum may approve in either
  order; the UI must not invent priority, deadlines, or SLA urgency.
- Collaboration is the comments projection of the Draw System Post. Linked
  Action Items are canonical coordination records associated through that
  System Post; they never gate, approve, release, or mutate the Draw Request.
- Decline requires a private reason, returns the same Draw Request record for
  Builder correction and resubmission, retains history, and resets required
  approvals for the next submission cycle.

**Role-aware contract:**

- Every persona uses this same sheet structure and canonical record identity.
- Builder views show submitted request facts, requirements, evidence they are
  authorized to see, high-level review state, collaboration, and permitted
  correction/resubmission actions. Builder views do not expose reviewer
  identity, private decline rationale, internal votes, or lender-only controls.
- Back Office and lender views expose only the review gates, evidence,
  collaboration, linked Action Items, and decision controls permitted by the
  active route, organization, assignment, role, and locked Draw policy.
- Role awareness changes visibility and available commands; it does not fork
  the sheet, copy the Draw Request, or create persona-specific lifecycle state.

**Canonical reuse boundary:** The Draw Request owns reimbursement, submission
cycles, policy evaluation, review, decisions, and retained history. The Draw
System Post owns the collaboration projection. Action Items retain their own
canonical ownership and remain non-gating. Production must adapt the existing
shared entity-sheet structure and role-aware command boundaries; it must not
introduce payment execution, a generic comment system, a broad document
library, per-review deadlines, or milestone-based Draw allocation semantics.

**Production component:** Builder and Back Office Draw review entry points use
`../../features/draw-workflow/DrawReviewSheet.tsx`. The lender portal must mount
this same role-aware component and supply lender-authorized data and commands;
it must not create a separate lender Draw review sheet.

**Implementation authority:** Read
`../../../docs/specs/lender-portal-draw-review.md` before changing this surface.
The product decision is also recorded in `../../../docs/draw_flow_prd.md`
§23.8. The README selects the interaction, the PRD owns the product rule, and
the SPEC owns the implementation contract.

**Prototype:** `../../routes/lender.draw-review-sheet-prototype.tsx` at
`/lender/draw-review-sheet-prototype?variant=A`, composed with
`LenderPrototypeShell.tsx` and the production sheet, tabs, Frame, Card, Badge,
Button, Separator, and Textarea primitives.

## Builder Correction and Resubmission

**Purpose:** Compare three Builder-safe structures for correcting and
resubmitting the same durable Milestone completion or Draw Request after a
rejection.

**Selection status:** Rejected direction. The dedicated correction surface was
explicitly rejected in favor of returning the existing Milestone or Draw detail
sheet to a draft-like `Needs revision` state. No variant was selected, accepted,
locked, or promoted. This set remains throwaway comparison history only.

**Variant hypotheses:**

- Variant A directly adapts the current Builder workspace hierarchy with the
  request, configured requirements, review-context evidence, resubmission
  control, and permitted history on one page.
- Variant B uses a mobile-conscious guided repair sequence that makes the
  configured gate, missing evidence, and next resubmission explicit.
- Variant C uses a stable-request cycle ledger, central correction bench, and
  bounded cycle command for a compact operating surface.

**Interaction and privacy constraints:**

- Rejection returns the existing request to internal `correction_required`,
  presented to the Builder as `Needs revision`; resubmission increments the
  decision cycle on that same request identity and resets every policy-required
  approval.
- The Builder sees configured requirements, submission eligibility, published
  Builder-visible revision instructions, current high-level state, relevant
  evidence references, and permitted cycle history. Reviewer identity,
  separate private reviewer rationale, internal votes, and private audit
  content are excluded.
- Required Milestone Site Visit and receipt/invoice gates are shown only when
  configured. A qualifying Site Visit has a completed report and photo; the
  documented receipt/invoice total must exactly equal entered actual cost.
- The Draw example has no invented receipt/invoice or Site Visit gate, no
  Milestone or Draw Group funding allocation, and no Draw release control.
- Evidence is limited to the current request review context and cycle. The
  prototype has no broad document library, generic comments, deadline or SLA,
  policy editor, reviewer assignment, approval/rejection action, or access to
  another Build.
- Correction, evidence attachment, state preview, and resubmission actions use
  in-memory representative state only. Refresh resets them. No loader, command,
  upload, notification, audit, approval, or release is persisted.

**Canonical reuse boundary:** This rejected set remains historical evidence
only and must not be promoted. The locked Milestone contract is the integrated
Variant A below. The Builder Draw presentation remains unselected. Both retain
canonical Milestone/Draw Request, Evidence Package/review attachment, locked
policy, decision-cycle, and audit ownership; neither may create Builder-owned
request or evidence models.

**Prototype:**
`../../routes/builder.correction-resubmission-prototype.tsx` at
`/builder/correction-resubmission-prototype?variant=A|B|C`, composed with the
shared `PrototypeVariantSwitcher.tsx`, `FileUploader`, and existing Frame,
Card, Alert, Progress, Badge, Button, and Separator primitives.

## Builder Milestone Needs Revision Integration

**Purpose:** Compare three ways to integrate Builder correction and
resubmission directly into the existing Milestone detail sheet. The prototype
tests a draft-like `Needs revision` state, not a separate correction page or a
new request model.

**Selection status:** Variant A — Inline revision notice was explicitly selected
and locked by the user on August 13, 2026. Variants B and C remain comparison
history. This records the prototype decision only; no production promotion or
integration was authorized in this task.

**Future implementation handoff:** Directly promote Variant A from
`builder.milestone-revision-detail-prototype.tsx` into the canonical
`MilestoneDetailSheet`; do not rebuild a requirements-equivalent surface or
revive the rejected dedicated correction workspace. Replace representative
local state and prototype-only DOM glue with typed canonical extension seams,
loaders, authorization, commands, audit, and error/concurrency states while
preserving the locked hierarchy and interaction gates. This selection does not
choose a Builder Draw correction layout; record that decision separately.

**Variant hypotheses:**

- **Locked — Variant A** inserts one prominent revision notice into the
  canonical Overview review layer while leaving the normal tab and section
  model intact.
- Variant B leads with a guided repair checklist that states the free-text
  instruction, unaffected gates, missing evidence, and resubmission readiness.
- Variant C uses an affected-section summary panel before the correction
  fields, marking exactly where the requested change belongs.

**Interaction and privacy constraints:**

- The same Milestone and completion request enter `Needs revision`; existing
  pre-submission inputs become editable without deleting prior decision cycles.
- The shown free text is explicitly Builder-visible revision instructions, not
  the raw private reviewer note. Reviewer identity, internal rationale, votes,
  and private audit content remain excluded.
- The existing Site Visit remains complete. The representative receipt/invoice
  total must equal entered actual cost before resubmission becomes eligible.
- Resubmission starts decision cycle N+1 on the same request and resets every
  policy-required approval. Refresh resets all representative local state.
- No loader, mutation, upload, notification, decision, approval, audit event,
  or production workflow is connected.

**Canonical reuse boundary:** The production target remains the existing
Builder `ProductionBuildDetailSurface` and shared `MilestoneDetailSheet`. This
prototype directly renders the unchanged shared `MilestoneDetailSheet` through
its supported Overview review layer and Collaboration composition seams. It
also reuses existing Frame, FileUploader, Input, Alert, Progress, Badge, Button,
and Separator primitives. It does not modify the production sheet, Builder
route, loaders, authorization, Convex/domain code, or shared production tests.

**Prototype:**
`../../routes/builder.milestone-revision-detail-prototype.tsx` at
`/builder/milestone-revision-detail-prototype?variant=A|B|C`. Focused contract:
`../../routes/-builder.milestone-revision-detail-prototype.test.tsx`.

## Coverage

Every accepted or locked lender decision documented above has a matching
prototype route. This README does not assign status to any surface beyond what
the route source declares.
