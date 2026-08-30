# DrawFlow Lender Portal MVP Feature Brief

- **Status:** Confirmed MVP scope
- **Confirmed:** 2026-08-13
- **Approved interfaces:** Lender Draw Queue Variant D, Build packets; Lender Organization Management Variant E, Shared user management operations; Lender Build Detail Variant C, Precision console; Builder Milestone Needs Revision Variant A, Inline revision notice; locked 2026-08-13
- **Companion:** [Sequenced implementation plan](lender_portal_mvp_implementation_plan.md)
- **Implementation handoff:** [Consolidated specification](lender_portal_mvp_spec.md)
- **Execution control:** [Traceability and work packages](lender-portal-mvp-execution/README.md)

## Purpose and authority

This brief defines the confirmed Lender Portal MVP for external-capital Builds. It is the product contract for this feature slice. `draw_flow_prd.md` remains authoritative for DrawFlow concepts and rules that do not conflict with this brief.

Execution status, work-package ownership, and evidence live in
`docs/lender-portal-mvp-execution/`. That control layer references this brief
and cannot change its product meaning.

## Prototype promotion rule

The current implementation checkout maintains a Lender Portal prototype registry
at `src/components/prototypes/README.md` and a promotion contract at
`docs/lender-portal-prototype-promotion.md`.

For any surface marked **Accepted**, **Approved**, or **Locked** in that
registry, implementation must directly promote the selected prototype route and
component composition. The production ticket starts from that selected variant,
preserves its documented hierarchy, interaction gates, and authorization
boundaries, then replaces representative local data and local-only actions with
canonical projections and commands. It must not treat the selected prototype as
inspiration and rebuild a different surface from this brief.

Unselected prototype sets are explicit placeholders. Product implementation for
those surfaces waits for a recorded variant decision; it must not infer a
selection or create a requirements-equivalent replacement. Any material change
to a locked interaction requires a new product decision and an updated registry
entry before implementation.

### Locked Builder Milestone revision contract

Variant A at
`/builder/milestone-revision-detail-prototype?variant=A` is the selected Builder
Milestone correction interaction. Future authorized implementation starts from
that route and its direct composition of the canonical `MilestoneDetailSheet`.

- `correction_required` is presented to the Builder as **Needs revision** and
  returns the same durable request to draft-like editing.
- Required free-text `builderVisibleRevisionInstructions` lead the sheet.
  Reviewer identity and any separate `privateReviewerRationale` remain
  reviewer-only.
- The sheet preserves locked requirements, current submission eligibility,
  cycle-scoped evidence, and authorized high-level history.
- Resubmission opens decision cycle N+1 and resets every policy-required
  approval.
- A detached correction workspace, parallel request model, or
  requirements-equivalent rebuild is outside the selected contract.
- This selection governs the Builder Milestone presentation only. Builder Draw
  correction presentation remains unselected until a separate user decision.

### Locked Lender Build Detail decision

Variant C at
`/lender/build-detail-overview-prototype?variant=C` is the approved and locked
Lender Build Detail Overview. Future authorized implementation must directly
promote its compact Precision console composition; it must not rebuild a
requirements-equivalent surface from this brief. The selection records a
product contract only and does not authorize production implementation by the
prototype task.

The exact selected composition is a permission-shaped projection of canonical
Build state:

- a narrow Build overview;
- an expandable Milestone ledger with recorded progress, canonical Budget,
  receipt/invoice coverage, and date ranges that prefer actual dates when
  available and otherwise show planned dates;
- Milestone links that open the established focused, read-only Milestone
  detail/review sheet;
- pooled Build funding and Draw records without inferred Milestone or Draw
  Group attribution;
- evidence attached only to the relevant Milestone or Draw review; and
- the locked Milestone and Draw review policy, displayed read-only from the
  active Build snapshot; and
- participant-visible Build-wide Collaboration where every active member of
  the currently assigned Lender Organization may publish updates, read the
  complete authorized response thread, and reply with governed attachments.

It includes no overview decision, release, policy edit, scheduling, custom
audience, acknowledgement, Action Item, or shared domain mutation. Internal
notes, restricted or moderated content, private reviewer identity or rationale,
and Back Office-only fields remain excluded. Lender posts are fixed to public
Build-wide updates and reuse canonical Collaboration persistence, audit,
notification, moderation, search, webhook, and attachment ownership.

The brief changes three assumptions in the current documentation:

- A Lender Organization is an application-owned child of a DrawFlow Brokerage. WorkOS supplies the shared identity organization, invitations, memberships, roles, and read-only projections; WorkOS never represents or provisions a Lender Organization.
- Back Office proposal approval, proposal closing, and live Build activation are separate transitions.
- An assigned external lender may hold required proposal, Milestone, and Draw approval authority according to a locked policy.

### Lender Organization default Review Requirements

Back Office may configure an immutable, versioned default Review Requirements
policy for each application-owned Lender Organization. Assignment and
reassignment copy the selected organization's current default into the
canonical Proposal assignment and review-policy revision. When no custom
default exists, the assignment records the existing system / Back Office
baseline explicitly.

Default changes apply only to later assignments. They do not silently mutate
assigned Proposals or active Builds. Before the existing policy lock, Back
Office may create an audited per-Build revision or explicitly restore the
organization's current default. Lender confirmation still includes the
`accessReviewPolicy` checkpoint and restarts against the new immutable Proposal
revision. Lender users and Lender Organization administrators do not gain
policy-authoring authority.

## Historical baseline and current-checkout rule

At historical planning commit `e299f6a3`, DrawFlow was a documentation-first
scaffold. That statement records the provenance of the original feature brief;
it is not an implementation instruction for the current canonical checkout.

- `draw_flow_prd.md` defines the current proposal, Build, evidence review, site visit, Milestone approval, and Draw release flows.
- `uiManifest/routeManifest.md` specifies intended product routes, including proposal review, Build Workspace, Milestone approval, Draw release, policy, and audit surfaces.
- `uiManifest/screenManifest.md` and `uiManifest/componentManifest.md` specify intended screens and components.
- The implemented application contains scaffold routes and UI primitives only. The documented production routes and domain workflows are not implemented at this commit.

Before implementation, inspect the exact target branch and reuse its current
organization, membership, role, brokerage, Back Office user-management,
workspace-shell, assignment, approval, and audit boundaries. In the canonical
checkout, the approved Variant E route and shared table/sheet already exist.
Future work starts from those files and the current schema; it must not recreate
the historical scaffold, duplicate current domains, or treat old absence claims
as evidence about the target branch.

Route and component names in the historical manifests remain design contracts,
not evidence about the current target branch. Implementation reconciles them
with current code and this brief before changing product routes.

## Outcome

External lender users can access only the proposals and live Builds assigned to their active application-owned Lender Organization. They can complete a guided proposal confirmation, review relevant evidence, make policy-authorized Milestone and Draw decisions, and retain a read-only record if their organization is withdrawn before closing.

Back Office Admin remains the internal owner of proposal approval, lender assignment, review-policy configuration, Brokerage and Lender Organization provisioning, shared WorkOS membership commands, and the internal closing path. Closing and activation are shared with eligible users from the assigned Lender Organization only where this brief says so.

## Terms

| Term | Meaning in this MVP |
|---|---|
| Back Office Admin | The single broad internal role that owns every Back Office capability in this brief. |
| Lender Organization | An application-owned organization under one DrawFlow Brokerage. It owns lender workflow permissions and user assignments; it does not own identity, WorkOS roles, or WorkOS membership state. |
| Lender user | A WorkOS user with an active user projection, active membership in the shared WorkOS identity organization, an exact lender role, and one active application assignment to the Lender Organization. Membership alone does not establish review eligibility. |
| Lender organization administrator | A user with the shared WorkOS role `lender-admin` or the platform `admin` bypass. `lender` receives normal lender authority and `lender-staff` cannot make final lender decisions. |
| Lender assignment | The current association between one approved-before-closing proposal and one Lender Organization. Capital source does not determine assignment eligibility. |
| Confirmation cycle | One lender review of one proposal revision through every required checkpoint. |
| Review policy | The locked, Build-wide Milestone and Draw approval requirements selected before closing. |
| Decision cycle | One submission or resubmission of the same Milestone or Draw request record. |

## Confirmed MVP scope

The seven numbered scope sections have stable identifiers `LP-SCOPE-01`
through `LP-SCOPE-07`. The identifier number matches the section number and
must not be renumbered after implementation evidence references it.

### 1. Lender Organizations and users

- DrawFlow owns `lenderOrganizations` as child records under `brokerages`. Each record stores display/legal names, active/inactive status, timestamps, and the organization-wide proposal, Milestone, Draw, and Site Visit workflow permission bundle.
- DrawFlow owns `lenderOrganizationAssignments` as a thin relation from a WorkOS user to one active or pending application organization. It stores assignment state, normalized email, the member decision-permission bundle and monotonic permission version, deactivation reconciliation state, actor, reason, and timestamps—not identity, roles, or WorkOS membership state.
- WorkOS remains authoritative for shared identity, invitations, memberships, roles, and projections. Product commands go WorkOS first; webhook/sync projections remain read-only to product flows.
- Back Office Admin provisions Lender Organizations, assigns and unassigns lender users, stages invitations, changes shared lender roles, edits workflow permissions, and soft-deactivates organizations through `/backoffice/lenders`. Provisioning never creates a WorkOS organization.
- The supported lender role slugs are exactly `lender`, `lender-admin`, and `lender-staff`. Lender access requires an active WorkOS user projection, active membership in the configured shared WorkOS organization, a supported role, and one active application assignment.
- The organization-wide permission bundle caps all lender actions. Effective proposal, Milestone, and Draw decision authority additionally requires an active app assignment and the corresponding member grant. Existing active `lender` and `lender-admin` assignments inherit the enabled organization permissions during migration; `lender-staff`, pending, and inactive assignments start with no member grants. Platform Admin may bypass a capability cap only for an explicit, validated target organization.
- An invitation becomes an active application assignment only after the user and shared-membership projections reconcile. Pending and ambiguous records remain visible to Back Office for reconciliation.
- An accepted deactivation command immediately suspends DrawFlow authority. The assignment remains visible as pending reconciliation until the WorkOS webhook projects the membership inactive or deleted, then finalizes the assignment without deleting membership, assignment, decision, or audit history. A provider failure restores access and retains a safe retry state.
- Every membership or assignment change re-evaluates route/query/write access, lender-review assignment and quorum context, recipients, queues, and audit/notification work without changing the locked review policy.

### 2. Lender assignment, closing, and activation

- Lender assignment is optional and may be used for either capital source.
- Back Office Admin approves a proposal before a Lender Organization can be assigned.
- Back Office Admin may assign one Lender Organization while the proposal is approved and pending closing.
- An assigned proposal requires both:
  - Back Office Admin approval; and
  - approval from one eligible lender user in the assigned Lender Organization.
- A proposal cannot close while either required approval is missing.
- When all applicable prerequisites are satisfied, either Back Office Admin or an eligible user in the assigned Lender Organization may record closing.
- Closing and activation are separate. After closing, either Back Office Admin or an eligible user in the assigned Lender Organization may activate the live Build.
- Back Office Admin may withdraw the lender assignment before closing.
- Withdrawal keeps the proposal Back Office-approved and pending closing, removes the current lender assignment, and restores the normal internal closing path.
- The former Lender Organization retains a read-only withdrawn record containing the proposal documents and history that were available through its assignment.
- Withdrawal does not grant access to later internal-only changes or unrelated Build information.

### 3. Guided lender proposal confirmation

Simple lender approval is replaced by a guided confirmation flow. Every confirmation cycle includes these checkpoints:

1. number of Milestones;
2. Budget;
3. schedule and timeline;
4. builder; and
5. access and review policy.

Back Office Admin configures the proposal and policy. The lender explicitly confirms each checkpoint and cannot edit it.

- Approval completes the current confirmation cycle.
- Decline requires a reason.
- Decline leaves the proposal Back Office-approved and pending closing.
- Back Office Admin updates the same proposal in place.
- The update creates a new reviewable proposal revision and confirmation cycle without deleting earlier cycles.
- The lender repeats the full guided flow after every decline/update cycle.
- The new cycle highlights changes since the prior lender-reviewed revision.
- Full revision, checkpoint, decision, actor, timestamp, and decline-reason history is retained.

### 4. Pre-closing Build-wide review policy

Back Office Admin configures and locks one review policy before closing.

| Policy area | Confirmed choices |
|---|---|
| Draw approval | Back Office Admin only; lender quorum only; both Back Office Admin and lender quorum |
| Milestone approval | Back Office Admin only; lender quorum only; both Back Office Admin and lender quorum |
| Milestone site visit | Required or not required, independent of approval mode |
| Milestone receipt/invoice evidence | Required or not required, independent of approval mode |

- A lender quorum is an integer from `1` through the number of active users in the assigned Lender Organization when the policy is locked.
- Back Office Admin approval means one decision from one authorized Back Office Admin.
- Where both groups are required, either group may complete its approval first.
- The request completes only when every group required by the locked policy has approved the current decision cycle.
- The MVP has no post-closing policy override.
- Policy history is immutable. Locking captures the selected values, actor, time, proposal revision, assigned Lender Organization, and active-member count used for quorum validation.
- For an assigned external proposal, the values locked for closing must exactly match the access/review policy confirmed by the lender. A pre-closing policy change creates a new proposal revision and full confirmation cycle.

### 5. Milestone submission gates

- A required site visit reuses DrawFlow's existing Site Visit concept.
- The site-visit requirement is satisfied only by a completed report with at least one attached photo.
- An eligible lender user or Back Office Admin may complete the required site visit.
- A failed or unavailable geofence does not discard evidence; it remains location-unverified for review.
- If receipt/invoice evidence is required, the builder cannot submit Milestone completion until the documented total equals the entered actual cost.
- Receipt/invoice records are attached to that Milestone review and carry the amount data needed to calculate the documented total.
- Both reviewing sides can view the submitted completion evidence, relevant receipt/invoice attachments, and qualifying site-visit report.

### 6. Milestone and Draw correction cycles

- A Milestone or Draw rejection requires free-text Builder-visible revision instructions. The reviewer may also retain a separate private rationale.
- Rejection returns the same request to internal state `correction_required`, presented to the Builder as **Needs revision** with draft-like editing.
- The builder resubmits the same durable request record; the system does not replace it with a new request.
- Every resubmission starts a new decision cycle and resets all approvals required by policy.
- Prior submissions, decisions, reasons, evidence references, actors, and timestamps remain in history.
- Builders see the configured requirements, high-level request state, current eligibility, and published revision instructions.
- Builders do not see reviewer identity or separate private reviewer rationale.
- Authorized reviewers and Back Office Admin retain the private decision history.

### 7. Lender Portal surfaces

The MVP contains:

- dashboard;
- proposal list;
- active-Build list;
- Milestone queue;
- Draw queue; and
- focused detail views reached from those lists and queues.

The Milestone and Draw queues include every request assigned to the user's Lender Organization and default to **Needs my action**. Users can switch to a view of all assigned requests.

Lender Build detail is intentionally narrow and directly promotes locked
Variant C:

- overview;
- expandable Milestone records with recorded progress, canonical Budget,
  receipt/invoice coverage, and actual-or-planned date ranges;
- Draw records and the reviewer-safe pooled Build funding position;
- evidence attached only to the relevant review; and
- participant-visible public Build collaboration in read-only form.

Milestone names navigate to the established focused, read-only Milestone
detail/review sheet. The overview does not expose the canonical Builder/Back
Office Build Workspace in full and does not own decisions or mutations.

## Non-goals and deferred scope

- Assigning a lender before Back Office proposal approval.
- More than one current Lender Organization on a proposal.
- Lender edits to proposal content, builder data, Budget, schedule, or review policy.
- A separate lender-manager appointment system or role alias.
- A duplicate DrawFlow-owned Lender Organization or membership system.
- Post-closing review-policy changes or overrides.
- Full Build Workspace, timeline, Gantt, draw-group visualization, contractors, internal notes, or a broad document library in the Lender Portal.
- Documents detached from a specific proposal confirmation, Milestone review, Draw review, or qualifying site visit.
- General progress, digest, or marketing email.
- New payment, settlement, loan-servicing, or general ledger behavior.
- Changes to the reimbursement-only Draw model or interest start rule.

## Domain invariants

Each numbered invariant has the stable identifier `LP-INV-NN`, where `NN` is
the zero-padded list number. For example, invariant 1 is `LP-INV-01`.

1. Every organization-scoped projection, assignment, proposal revision, policy, request, decision, attachment, notification, and audit event is scoped to the owning DrawFlow tenant and canonical WorkOS organization.
2. WorkOS is authoritative for user, organization, membership, role, and permission state. DrawFlow owns lender assignment, workflow authorization, review policy, decisions, and product-resource access derived from that canonical identity state.
3. Exactly one current lender assignment may exist for an eligible proposal.
4. Back Office Admin approval always precedes lender assignment.
5. With an active assignment, closing eligibility requires the current Back Office Admin approval and one lender approval of the current proposal revision.
6. Withdrawal ends current lender authority without deleting its historical record or documents.
7. A lender decision applies only to the proposal revision or request decision cycle that was reviewed.
8. A changed proposal requires a complete new lender confirmation cycle.
9. A rejected and resubmitted Milestone or Draw retains one request identity and starts a new decision cycle.
10. Required approvals are evaluated independently by group and can arrive in either order.
11. One user contributes at most one current approval per group and decision cycle.
12. Only eligible, active users can cast or contribute current lender decisions. If a lender user is deactivated before pending work reaches terminal completion, that user's decisions remain in history but stop counting and replacement active-user approval is required. Terminal completed or closed work is unchanged.
13. A locked policy is copied into the closed Build's control state and has no MVP override path.
14. Required site-visit and receipt/invoice gates are submission or approval prerequisites, not optional reviewer hints.
15. Evidence survives location-verification failure.
16. Builder-visible state includes published revision instructions but excludes reviewer identity and private reviewer rationale.
17. Draws remain reimbursement-only, and interest begins only after funds are released.
18. External lender authority ends at the policy-required Draw decision. Draw release remains a Back Office Admin action under the existing reimbursement flow.

## Permissions

| Requirement | Capability | Back Office Admin | Lender Admin / Principal Broker | Lender member | Builder |
|---|---|---:|---:|---:|---:|
| `LP-PERM-01` | Provision brokerage organization and initial Principal Broker | Yes, through the canonical brokerage/WorkOS boundary | No | No | No |
| `LP-PERM-02` | Transfer Principal Broker control | Under tenant authority | Yes, through the protected transfer workflow | No | No |
| `LP-PERM-03` | Invite/change role/deactivate members in own Lender Organization | Under tenant authority | Yes | No | No |
| `LP-PERM-04` | Invite/add/deactivate users in another Lender Organization | Within tenant authority | No | No | No |
| `LP-PERM-05` | Approve proposal before lender assignment | Yes | No | No | No |
| `LP-PERM-06` | Assign/withdraw lender before closing | Yes | No | No | No |
| `LP-PERM-07` | Configure and lock review policy before closing | Yes | No | No | No |
| `LP-PERM-08` | Confirm or decline assigned proposal | No lender-side decision | If eligible | If eligible | No |
| `LP-PERM-09` | Edit lender confirmation checkpoints | Yes, through proposal update | No | No | No |
| `LP-PERM-10` | Activate closed Build | Yes | If eligible and assigned | If eligible and assigned | No |
| `LP-PERM-11` | Submit Milestone/Draw correction | No | No | No | Yes |
| `LP-PERM-12` | Decide Milestone/Draw when policy requires lender approval | No lender-side decision | If eligible | If eligible | No |
| `LP-PERM-13` | Decide Milestone/Draw when policy requires Back Office approval | Yes | No | No | No |
| `LP-PERM-14` | Release an approved Draw | Yes | No | No | No |
| `LP-PERM-15` | Record proposal closing after prerequisites | Yes | If eligible and assigned | If eligible and assigned | No |
| `LP-PERM-16` | Complete required site visit | Yes | If eligible | If eligible | No |
| `LP-PERM-17` | View assigned review evidence | Yes | Yes | Yes | Own submission/high-level state only |
| `LP-PERM-18` | View reviewer identity/private reviewer rationale | Yes | Yes, for assigned records | Yes, for assigned records | No |
| `LP-PERM-19` | View withdrawn historical lender record | Yes | Read-only | Read-only | No new lender-facing entitlement |

Manager status grants user-administration authority. It does not create a separate approval weight or bypass record assignment and policy gates.

## State transitions

### Proposal and assignment

Proposal lifecycle, assignment, and lender confirmation are separate state axes.

```text
Back Office Admin review
  -> Back Office Admin approved / pending closing
      -> no lender assignment -> normal internal closing path
      -> lender assigned
          -> confirmation in progress
              -> lender declined -> Back Office Admin updates same proposal -> new full cycle
              -> lender approved -> eligible for closing
          -> assignment withdrawn -> normal internal closing path
      -> prerequisites satisfied
          -> closed by Back Office Admin or eligible assigned lender user
          -> activated by Back Office Admin or eligible assigned lender user
          -> live Build
```

Withdrawal closes the current assignment and confirmation cycle as historical records. It does not reverse Back Office Admin approval.

### Milestone and Draw request

```text
Builder draft/correction
  -> submitted (decision cycle N; approvals empty)
      -> pending required approvals
          -> all required groups approved -> approved
          -> any authorized rejection -> correction_required
              -> Builder sees Needs revision plus published instructions
              -> Builder corrects same request in draft-like editing
              -> resubmitted (decision cycle N+1; approvals reset)
```

## Data-model implications

The names below describe durable responsibilities, not mandatory table names.

| Responsibility | Required durable data |
|---|---|
| Funding path | Proposal capital source with an explicit internal/external distinction used by assignment and closing eligibility. |
| Lender Organization reference | Application-owned `lenderOrganizations` child ID plus parent Brokerage ID, names, status, timestamps, and workflow permission bundle. A legacy WorkOS organization identifier may remain only as migration metadata/reconciliation input. |
| Lender assignment | Thin `lenderOrganizationAssignments` relation keyed by application organization and WorkOS user, with active/pending state, normalized email, actor, reason, and timestamps. It never replaces WorkOS identity, role, or membership projections. |
| Membership projection | Canonical WorkOS user, shared-organization membership, role/permission projections, sync state, and audit references. Product commands go to WorkOS first; webhook/sync owns projection updates. |
| Proposal assignment | Proposal, application Lender Organization ID, preserved parent Brokerage ID, assigned/withdrawn intervals, historical organization-name snapshots, actors, reason where collected, and document-access boundary. |
| Proposal revision | Stable proposal identity, monotonic revision, checkpoint snapshot, changed-field summary, Back Office Admin approval reference. |
| Confirmation cycle | Proposal revision, assigned organization, checkpoint confirmations, decision, decline reason, actor, timestamps. |
| Review policy | Proposal/Build identity, approval modes, numeric quorums, independent evidence switches, lock metadata, immutable snapshot. |
| Review request | Stable Milestone or Draw request identity, current cycle number, high-level state, builder-visible requirements. |
| Decision cycle | Request, cycle number, submission snapshot, required groups, decisions, rejection state, reset boundary. |
| Approval decision | Group, eligible actor, decision, required Builder-visible revision instructions for Milestone/Draw rejection, optional private reviewer rationale, timestamp, request cycle or proposal revision. |
| Review attachment | Parent review context, storage reference, type, amount where receipt/invoice, uploader, visibility, timestamps. |
| Site visit | Existing Site Visit semantics plus completing side, completed report, and at least one photo reference. |
| Notification | Event type, resource, recipient, delivery status, idempotency key, timestamps. |
| Audit | Append-only material event with actor, role, prior/new state, reason where required, and tenant/resource scope. |

Current-state records may be projections for queue and dashboard performance. Immutable revisions, cycles, decisions, and audit events remain the source of history.

## UI behavior

### Dashboard

- Shows assigned proposal, active-Build, Milestone, and Draw counts.
- Prioritizes items that need the current user's action.
- Does not expose records from another Lender Organization.

### Proposal list and confirmation

- Separates needs-action, in-progress, approved, declined/update pending, and withdrawn records.
- Opens the guided five-checkpoint confirmation flow.
- Shows change highlights for a new cycle and full authorized history.
- Makes withdrawn records clearly read-only.

### Active-Build list and detail

- Lists only live Builds tied to the user's current Lender Organization assignment.
- Detail contains overview, Milestone records, Draw records, and review-attached evidence.
- Historical withdrawn access does not turn into live Build access.

### Milestone and Draw queues

- Include all assigned requests.
- Default filter is **Needs my action**.
- Show policy requirements, current group progress, and high-level request state.
- Provide focused evidence and decision controls without exposing Back Office internal notes or unrelated documents.

### Organization management

- The lender-facing view is `/lender/organization` and is application-level. It resolves the current active `lenderOrganizationAssignments` record, shows the Lender Organization, parent Brokerage, shared workflow policy, and filtered assigned-member directory, and never infers a Lender Organization from a WorkOS organization name or ID.
- If no active assignment exists, the view exposes no WorkOS directory data and renders the contact-admin empty state with a `mailto:support@fairlend.ca` CTA.
- The Back Office control plane is `/backoffice/lenders`, directly promoted from the approved Variant E hierarchy where applicable. It owns the Brokerage → Lender Organization → assigned lender user workflow: organization table, search/status filters, unassigned-user queue, detail drawer, assignment controls, staged invitations, permission editing, and soft deactivation.
- WorkOS invitation, role-change, and membership-deactivation commands are WorkOS-first. The UI reports pending projection reconciliation and never writes WorkOS projection tables directly.
- `/lender/organization` directly reuses the approved Variant E searchable and filterable member directory and shared `UserDetailSheet`. Active same-organization `lender-admin` users may update a member's proposal, Milestone, and Draw decision grants through one reviewed, version-checked command with a required reason. Other supported lender roles see assigned and effective grants read-only.
- Active same-organization `lender-admin` users may deactivate another active `lender`, `lender-staff`, or `lender-admin`. The command rejects cross-organization, inactive, self, and last-active-`lender-admin` targets. The surface shows accepted reconciliation, provider failure and retry, stale-version refresh, and safeguard reasons.
- Back Office Admin retains organization provisioning, invitation, role-change, organization-policy editing, and Back Office proposal approval. The lender-facing surface exposes none of those controls, and it exposes no Principal Broker transfer or brokerage-management controls.

The approved Lender Draw Queue interface is
`/lender/draws-prototype?variant=D`, **Build packets**, locked on 2026-08-13.
Production must directly promote its Build-grouped packet hierarchy, large
color-and-symbol decision-status signal at the lower left of each request card,
peer approval-group progress, current-cycle Evidence Package context, and
reconciled pooled funding position. Variants A, B, and C are rejected comparison
history. The queue remains a projection over canonical Build, Draw request,
policy, decision-cycle, evidence, funding, and audit records; it does not own a
parallel Draw model. Draw-level receipt coverage, Draw-level Site Visit gates,
and Milestone or Draw Group funding attribution are not part of this contract.

### Builder state

- Shows evidence prerequisites, submission eligibility, **Needs revision**, published revision instructions, pending review, and approved states.
- Omits reviewer identity and private reviewer rationale.

## Notifications

| Requirement | Event | Required behavior |
|---|---|---|
| `LP-NOTIF-01` | Approval required | Send once per recipient/resource/cycle to every currently eligible actor who has not supplied a counting decision in each outstanding group: active assigned lender users for lender approval and Back Office Admin reviewers for Back Office approval. |
| `LP-NOTIF-02` | Proposal updated after decline | Notify all active users in the assigned Lender Organization that a new full confirmation cycle is ready. |
| `LP-NOTIF-03` | Assignment withdrawn | Notify all active users in the withdrawn Lender Organization and retain a link to their read-only record. |
| `LP-NOTIF-04` | Approval outcome | Notify the appropriate Back Office Admin reviewers and the builder proposal owner or request submitter. When the outcome creates another group's action, send approval-required instead of a duplicate outcome email. |

Retries must be idempotent. Authorization is checked again when an email link is opened.

## Acceptance criteria

### Organization and access

- `LP-AC-ORG-01` Back Office Admin can provision an application-owned Lender Organization under an existing Brokerage without creating a WorkOS organization.
- `LP-AC-ORG-02` WorkOS remains authoritative only for shared identity, invitations, memberships, roles, permissions, and projections; DrawFlow owns Lender Organization records, workflow policy, and user assignments.
- `LP-AC-ORG-03` `/backoffice/lenders` lists organizations, assigned/unassigned users, pending invitations, member counts, statuses, and parent Brokerages, and exposes assignment, permission, membership, and soft-deactivation controls.
- `LP-AC-ORG-04` Lender access requires an active user projection, active membership in the configured shared WorkOS organization, exact role `lender`, `lender-admin`, or `lender-staff`, and one active application assignment.
- `LP-AC-ORG-05` Pending invitations do not grant access; reconciliation activates an application assignment only after the user and membership projections exist and match.
- `LP-AC-ORG-06` Effective lender decision authority requires an active WorkOS user and membership, an active application assignment, an enabled organization-wide permission, and the corresponding versioned member grant. Platform Admin bypass requires an explicit target organization and still validates tenant scope.
- `LP-AC-ORG-07` The assigned `/lender/organization` view shows only application-owned organization data; active same-organization `lender-admin` users may update member decision grants and deactivate eligible members, other lender roles are read-only, and users without an active assignment see a contact-admin empty state with no WorkOS directory details.
- `LP-AC-ORG-08` Cross-Brokerage, cross-Lender-Organization, foreign shared-organization, inactive-projection, and duplicate-assignment checks fail closed.
- `LP-AC-ORG-09` Member permission updates require the expected assignment permission version and an audit reason. Permission-version changes participate in eligibility epochs so revocation removes queue actions and invalidates ineligible active-cycle decisions immediately.
- `LP-AC-ORG-10` Lender-admin deactivation is WorkOS-first, idempotent, retryable, immediately authority-suspending after provider acceptance, and webhook-finalized. It rejects self-deactivation and the last active lender administrator and preserves historical state.

### Proposal lifecycle

- `LP-AC-PROP-01` Lender assignment is unavailable before Back Office Admin approval; capital source does not block an eligible assignment.
- `LP-AC-PROP-02` An assigned proposal cannot close without current Back Office Admin and lender approvals.
- `LP-AC-PROP-03` Lender decline requires a reason and leaves the proposal approved/pending closing.
- `LP-AC-PROP-04` A Back Office Admin update preserves proposal identity, creates a revision, highlights changes, and requires every checkpoint again.
- `LP-AC-PROP-05` Withdrawal removes current lender authority, preserves a read-only lender record, and restores internal closing eligibility.
- `LP-AC-PROP-06` Once applicable prerequisites are satisfied, either Back Office Admin or an eligible assigned lender user can record closing.
- `LP-AC-PROP-07` Closing does not automatically activate the Build; either authorized side can activate after closing.

### Policy and approvals

- `LP-AC-POL-01` Back Office Admin can select each confirmed approval mode and independent Milestone evidence switch.
- `LP-AC-POL-02` Quorum validation accepts only `1..active lender members` at lock time.
- `LP-AC-POL-03` Both-group approvals work in either order and complete only when both requirements are met.
- `LP-AC-POL-04` No post-closing policy edit or override path is available.
- `LP-AC-POL-05` Rejection requires Builder-visible revision instructions, returns the same request to **Needs revision**, and resubmission resets all approvals.
- `LP-AC-POL-06` Completing policy-required Draw approvals may make the Draw release-ready, but does not grant external lender users Draw-release authority.
- `LP-AC-POL-07` Builders see requirements, high-level state, eligibility, and published revision instructions without reviewer identity or private reviewer rationale.

### Evidence

- `LP-AC-EVID-01` A required site visit cannot satisfy the gate without a completed report and at least one photo.
- `LP-AC-EVID-02` An eligible lender user or Back Office Admin can satisfy the site-visit requirement.
- `LP-AC-EVID-03` Location-verification failure preserves the evidence as location-unverified.
- `LP-AC-EVID-04` When receipt/invoice evidence is required, Milestone submission is blocked until documented total equals actual cost.
- `LP-AC-EVID-05` Both required reviewing groups can view evidence attached to the review.

### Portal and email

- `LP-AC-PORTAL-01` Dashboard and lists expose only records authorized through current or historical assignment.
- `LP-AC-PORTAL-02` Milestone and Draw queues contain all assigned requests and default to **Needs my action**.
- `LP-AC-PORTAL-03` Build detail directly promotes locked Variant C and contains only its
  confirmed narrow, permission-shaped surface.
- `LP-AC-PORTAL-04` Emails are emitted only for the four confirmed event classes, are idempotent, and do not leak private reviewer data.

## Phase Zero decisions

Resolved on 2026-08-13:

Each numbered decision has the stable identifier `LP-DEC-NN`, where `NN` is
the zero-padded list number.

1. **Organization authority:** one broad Back Office Admin role owns `/backoffice/lenders`, application Lender Organization provisioning, assignments, workflow policy, and WorkOS-first shared membership commands. Lender roles are exactly `lender`, `lender-admin`, and `lender-staff`; no Principal Broker or lender-manager role is used for lender organization administration.
2. **Closing:** after applicable approvals and policy lock, either Back Office Admin or an eligible user in the assigned Lender Organization may record closing. Activation remains a separate shared action.
3. **Deactivation:** a decision from a later-deactivated lender user remains in audit history but stops counting for pending work. Terminal completed or closed work is unchanged.
4. **Email:** recipients derive from current eligibility and resource access. The MVP has no per-record assignment system.
