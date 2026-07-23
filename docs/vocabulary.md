# DrawFlow Vocabulary

**Status:** Working vocabulary  
**Purpose:** Shared product and engineering language for productionizing DrawFlow demos.

This document defines domain terms used in production planning. If code or product language changes, update this file first so PRDs, schema names, and implementation discussions stay aligned.

---

## Identity And Tenancy

### WorkOS Organization

The organization record stored in WorkOS. WorkOS is the source of truth for organization identity, membership, and role assignment.

In DrawFlow, each brokerage maps one-to-one to a WorkOS Organization.

### WorkOS Membership

The WorkOS record connecting a user to a WorkOS Organization with one or more roles.

A broker belongs to a brokerage because they have a WorkOS membership in that brokerage's WorkOS Organization with the `broker` role. DrawFlow should not create a competing Convex membership table for brokerage staff membership.

### Brokerage

The DrawFlow domain extension of a WorkOS Organization.

It stores brokerage-specific fields that WorkOS does not own, such as:

- legal name,
- display name,
- operating status,
- DrawFlow settings references,
- domain metadata.

Brokerage membership still comes from WorkOS.

### Principal Broker

The top brokerage authority inside a brokerage.

The role source is WorkOS. DrawFlow enforces the one-active-principal-broker rule in application logic when managing WorkOS role assignments.

DrawFlow stores the principal's normalized email as the durable brokerage setting and resolves the current active WorkOS user and membership at assignment time. WorkOS user IDs are cached references, not durable identity, because an account recreation can replace them. FairLendBrokerage uses `elie@fairlend.ca` as its configured principal identity.

### Broker

A brokerage user assigned to manage a build or proposal.

The brokerage owns the build. A broker is assigned to it and may later be replaced. Principal brokers retain access to the entire brokerage portfolio.

---

## Roles, Permissions, And Workflow Rules

### Role

A WorkOS role slug describing a user's broad persona in an organization.

Examples:

- `admin`
- `principle-broker`
- `broker`
- `broker-staff`
- `builder`
- `builder-staff`
- `contractor`
- `member`

Roles are useful for default access and route eligibility, but they are not precise enough to govern every production action.

### Permission

A specific application capability checked by DrawFlow.

Examples:

- `proposals:create`
- `proposals:approve`
- `builds:assign-broker`
- `documents:upload`
- `settings:manage`

Permissions are derived from WorkOS role defaults plus any DrawFlow-specific overrides. Backend Convex functions should check permissions through reusable fluent-convex middleware.

### Permission Override

A DrawFlow-specific exception to the default permission set for a WorkOS membership.

Examples:

- grant a broker a high-authority review permission temporarily,
- deny a normally available permission while preserving the WorkOS role,
- add an expiring operational exception with an audit reason.

### Workflow Rule

A workflow rule is brokerage-level workflow configuration, not identity membership and not a WorkOS role.

Avoid using "policy" as the primary product term unless referring to an external lender policy document or a legacy implementation name.

Workflow rules must be defined from a single centralized location. A future GUI can edit these rules, but the first production implementation should still avoid scattering rule constants across route handlers, Convex functions, and frontend conditionals.

Examples:

- whether a site visit is required before milestone approval,
- which roles can final-approve a proposal,
- whether assigned brokers can approve under a threshold,
- whether principal broker approval is required for draw release,
- which actions require an audit reason,
- how draw availability is calculated if a brokerage customizes it later,
- whether permit upload can be waived and by whom.

Workflow rules answer: "What must be true for this workflow action to be allowed?"

### Workflow Rule Snapshot

A frozen copy of workflow rules at a specific moment.

Workflow rule snapshots are useful when later settings changes should not rewrite the historical rules that governed an old proposal or build.

Example:

1. On May 1, a brokerage requires principal broker approval for every proposal.
2. A proposal is approved on May 10 under that rule.
3. On June 1, the brokerage changes settings so assigned brokers can approve proposals under `$500,000`.
4. The May 10 approval should still show it was governed by the old principal-broker-required rule.

That frozen copy is the workflow rule snapshot.

For the current production foundation, workflow rule snapshots are created on proposal submission. Approval and closing are governed by the submitted proposal's workflow rule snapshot, and the active build created at closing links back to that snapshot unless implementation identifies a concrete reason to split review and build-activation snapshots.

---

## Prototype Preservation

### Prototype

An existing demo route, component, or workflow that proved out a production interaction before production schema and auth existed.

Prototypes are not disposable. They preserve UI/UX decisions, motion, layout, edge-case handling, and interaction details that are easy to lose during a rewrite.

### Production Port

The act of moving prototype functionality into canonical authenticated routes backed by production schema and authorization.

A production port must not be a from-scratch rebuild based on visually inspecting the prototype.

Allowed approaches:

- extract and decouple original demo components when they can become clean presentational components,
- literally copy the original route/component into the production area and adapt the copy,
- leave the original demo implementation unchanged and publicly available.

Disallowed approach:

- look at the prototype and write a new approximation from scratch.

---

## Proposal And Build

### Build Proposal

A builder-submitted package describing a proposed construction project before it becomes an active build.

It includes:

- build identity,
- address/location,
- build permit PDF,
- supporting documents,
- total budget,
- Loan Percentage,
- starting cash,
- milestone template selection,
- milestone worksheet,
- draw schedule,
- readiness checks.

### Proposal Kanban

The backoffice proposal workflow board for this production slice.

Columns are:

- `draft`,
- `submitted`,
- `approved`,
- `closed`.

Cards are not moved by drag-and-drop in this slice. They move through explicit workflow actions: builder submit, backoffice approve, and backoffice record closing.

### Proposal State

The canonical lifecycle state stored on a build proposal.

For this slice, the only proposal states are:

- `draft`,
- `submitted`,
- `approved`,
- `closed`.

Request-changes, reject, and archive behavior are review outcomes/events or secondary flags, not proposal lifecycle states.

### Proposal Approval

The backoffice decision that a submitted proposal package is acceptable.

Approval moves the proposal to the `approved` proposal kanban column. It does not create an active build.

### Loan Closing

The offline workflow where the approved loan/deal is finalized.

Backoffice records that closing occurred. Recording closing moves the proposal to the `closed` proposal kanban column and creates the active build. Closing requires a build start date. The start date can be in the future and the build is still considered active after closing is recorded.

### Active Build

The production build record created when closing is recorded for an approved proposal.

### Build Start Date

The date selected by backoffice when recording closing.

Milestone schedule state is derived from this date plus milestone offsets.

### Build Permit

The permit PDF uploaded during the proposal flow.

The active build created when closing is recorded must retain a direct link to the original permit document from the approved proposal.

Approval may proceed without a permit PDF only when a principal broker or admin records an audited waiver with a reason. The waiver is a material decision and must be visible in review and audit history.

### Document Waiver

An audited record allowing a required or expected document to be bypassed for a specific proposal/build workflow.

For v1, the important waiver is the build permit waiver. It must record the document kind, actor, role/permission context, reason, timestamp, and owning proposal/build.

---

## Capital And Draws

### Total Budget

The full cost of the build.

Example: `$1,000,000`.

### Loan Principal

The lender-approved amount available for reimbursement.

Example: if total budget is `$1,000,000` and the Loan Percentage is `80%`, the loan principal may be `$800,000`.

### Loan Percentage

The percentage of each completed milestone budget funded by the loan.

The product displays and accepts Loan Percentage. The legacy `borrowerCoPayBps` field stores the complementary borrower contribution in basis points for compatibility.

Example:

- `80%` Loan Percentage corresponds to `borrowerCoPayBps: 2000`.
- A `$100,000` milestone unlocks `$80,000` in draw availability.

Formula:

```ts
drawAvailabilityCents = round(
  milestoneBudgetCents * (10000 - borrowerCoPayBps) / 10000
);
```

### Starting Cash

The builder's cash on hand at the start of the build.

This belongs to the build capital model, not the loan facility.

It is an opening balance, not a revolving limit and not the maximum amount the
builder may spend before requesting a draw. Reimbursements and later borrower
cash infusions are separate ledger events.

### Required Working Capital

The maximum borrower cash tied up by a specific schedule and draw plan before
eligible reimbursements are released. This is a derived feasibility metric,
also described as Peak Unreimbursed Exposure; it is not a borrower-entered
alias for Starting Cash.

### Cash Infusion

Additional builder cash added during the build.

Cash infusions increase available cash and should be tracked as build capital events.

### Capital Spike

A non-recurring cost or cash-impacting event on the build timeline.

Capital spikes and cash infusions are part of the build capital event timeline used to derive cash position projections.

### Derived Cash Position

A computed projection of available builder cash over time.

This is not a separate source-of-truth accounting table for this slice. It is derived from starting cash, borrower cash infusions, capital spikes/costs, draw reimbursements, and the mutable draw schedule.

### Draw Schedule

The planned reimbursement timing and amount structure selected during proposal creation.

Draw schedule rows are not milestone children. They define planned draw timing and planned draw amounts.

The draw schedule is mutable by design. Builders may request less than the planned draw amount, move draw timing, skip a planned draw, or request a later draw that consumes accumulated availability. Backoffice may edit submitted proposal draw schedules and active build planned draw schedules without automatically sending the proposal back through request-changes.

The hard constraint is draw availability, not the original planned row.

### Draw Availability

The amount unlocked for reimbursement by approved milestone completion.

Milestones unlock availability. Draw requests consume availability.

### Draw Request

A request to receive reimbursement funds.

Draw requests are build-level records. They are not directly linked to a single required milestone. Their allowable amount is determined by total approved milestone unlocks minus prior non-draft/non-rejected draws.

---

## Milestones And Site Visits

### Milestone Archetype

A reusable construction work type configured in backoffice settings.

Examples:

- foundation,
- framing,
- rough-in,
- drywall,
- finishes.

Milestone archetypes are the shared anchor for:

- milestone template rows,
- contractor capabilities,
- site visit guidance.

### Milestone Template

A reusable roadmap template configured by backoffice.

It contains milestone rows, ordering, durations, percentage allocations, and saved submilestones.

### Submilestone

A lower-level checklist or work item under a milestone.

Submilestones can exist in templates, proposals, and active builds.

### Submilestone Execution

The Build-specific operational state of one submilestone, including its status, dates, blocker, and status history. It does not create lender approval authority below the Milestone boundary.

### Site Visit Guidance

Inspection guidance authored in backoffice settings against milestone archetypes.

When a site visit targets specific milestones, DrawFlow should pull guidance from each target milestone's archetype and snapshot it into the site visit package.

### Site Visit

A field inspection workflow requested by backoffice.

A single site visit can target multiple milestones.

### Site Visit Target

The join record connecting a site visit to a targeted milestone.

This is required because one site visit can cover multiple milestones.

### Site Visit Token

A scoped, expiring token that allows a site visitor to complete a site visit without full app navigation.

The raw token is not stored. Store a hash, expiry, consumed timestamp, and status.

### Milestone Completion Submission

The builder's act of marking a milestone complete.

This is distinct from backoffice approval.

### Milestone Completion Review

Backoffice review of a builder completion submission.

Approval can create draw availability. Rejection or revision request keeps the milestone out of approved draw availability.

### Milestone Kanban State

A derived display state for `/backoffice/builds/$buildId`.

States include:

- backlog,
- in progress,
- marked complete,
- site visit,
- needs approval,
- approved,
- revision requested.

These should be derived from persisted facts where possible: start date, milestone schedule offsets, completion submissions, site visits, site visit reports, and completion reviews.

---

## Contractors

### Contractor Profile

A domain record for a contractor company or individual.

Contractor profiles can exist without authenticated user accounts.

### Contractor Account

An optional authenticated user account linked to a contractor profile.

This should be supported by schema groundwork but is not required for the first proposal-flow production slice.

### Contractor Trade

A trade label associated with a contractor.

Examples:

- electrical,
- plumbing,
- drywall,
- framing.

### Contractor Capability

A structured mapping between a contractor and a milestone archetype or work capability.

This lets DrawFlow know which contractors are suitable for which system milestone types.

### Milestone Contractor Assignment

The relationship connecting a contractor to a specific milestone.

Contractors are not necessarily assigned to every milestone. Production must track contractor-to-milestone assignment explicitly.

### Work Assignment

The relationship connecting a contractor to assigned Milestone or submilestone scope on a proposal or active Build. It is the canonical assignment record; a Work Package presents one or more Work Assignments to the contractor.

### Work Package

A versioned contractor-facing brief that groups Work Assignments with scope, location, instructions, schedule, documents, and required Work Evidence. It is not an Evidence Package and carries no Draw approval authority.

### Work Evidence

Proof or context uploaded against assigned construction work. Work Evidence only becomes part of lender-facing completion evidence through the governed Milestone submission and review workflow.

### Evidence Feedback

A review state or request about a Work Evidence item’s relevance, sufficiency, or required replacement. It is distinct from a Work Review of contractor performance.

### Work Review

A published assessment of contractor performance for assigned scope. A contractor may contest a published Work Review, while raw internal risk and quality signals remain private.

---

## Participant Experiences And Communication

### Homeowner Portal

An allowlisted projection of Build progress, schedule, published updates, selected media/documents, and permitted communication for a homeowner. It excludes financing, lender policy, approval deliberation, internal risk detail, and unrelated participant data.

### Build Channel

A Build-scoped communication space with an explicit participant audience and visibility policy. A Build Channel contains participant-created Conversations.

### Conversation

A participant-created topic within a Build Channel containing ordered Messages and nested Replies. Avoid using “thread” for both the topic and its nested reply chain.

### Person Mention

A reference to an authorized Build participant inside a Message that can create a notification. A Person Mention never changes the participant’s underlying access.

### Entity Reference

A typed link from a Message to a DrawFlow domain object such as a submilestone, Milestone, Draw, Evidence Package, Work Package, Site Visit, contractor, Material, or document. An Entity Reference never grants access or copies restricted object data into the Conversation.

---

## Resource Bank

### Resource Bank

The versioned set of typed construction definitions used by templates and Builds, including submilestones, trades, equipment, certifications, evidence requirements, and constraints. It is not an untyped key/value catalog.

### Resource Definition

A stable, versioned, typed entry in one Resource Bank catalog. Builds pin the Resource Definition version they use so later catalog edits do not rewrite historical scope or requirements.

---

## Availability And Calendar Connectivity

### Manual Availability

Contractor-entered recurring working windows and dated availability exceptions. Manual Availability expresses preferences/capacity and is never overwritten by assignment automation.

### Assignment Reservation

The portion of contractor capacity occupied by an accepted, scheduled Work Assignment. It is derived from the Work Assignment and cannot be edited independently of that source.

### Effective Availability

The contractor capacity remaining after Assignment Reservations and unavailable exceptions are subtracted from Manual Availability. It is a planning projection, not a second editable availability calendar.

### Calendar Connection

An authorized link between one DrawFlow user and one external calendar provider account. A Calendar Connection can publish authorized Calendar Event Projections but does not transfer ownership of provider credentials to the organization.

### Calendar Event Projection

The role-safe external representation of a DrawFlow schedule object. Editing a projection never bypasses the authority and change-control rules of its source Milestone, submilestone, Work Assignment, Site Visit, or Draw.

### Schedule Change Request

A proposed change to authoritative DrawFlow schedule state originating from a participant or external calendar. It remains pending until an authorized DrawFlow workflow applies or rejects it.

---

## External Integrations

### Public Event Contract

A stable, versioned, authorization-safe representation of a DrawFlow domain event for external consumers. It is distinct from the internal event outbox record that triggered publication.

### Webhook Subscription

An organization-scoped configuration selecting an HTTPS endpoint, Public Event Contract types, filters, payload version, and delivery status. A creator can subscribe only to resource scopes they are authorized to export.

### Webhook Delivery

The immutable relationship between one Public Event Contract instance and one matching Webhook Subscription. A Webhook Delivery may have multiple signed delivery attempts and manual replays without changing the original event.

### Webhook Delivery Attempt

One signed HTTP request made for a Webhook Delivery, including its timing, outcome, and retry disposition. It is not itself the domain event and receives a distinct attempt identifier.
