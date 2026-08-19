# Canonical Draw Review Sheet Specification

Status: **Approved and locked**

Applies to: Builder, Back Office, and lender Draw Request review surfaces

Production component: `src/features/draw-workflow/DrawReviewSheet.tsx`

Prototype contract: `src/components/prototypes/README.md#canonical-draw-review-sheet`

## Read This First

Read this specification before changing any Draw Request detail, review,
approval, rejection, or correction surface for Builder, Back Office, or lender
personas. All three personas use one role-aware component over the same
canonical Draw Request. A new persona integration extends this component; it
does not create another Draw review sheet.

## Product Decision

The approved interaction is Variant A of
`src/routes/lender.draw-review-sheet-prototype.tsx`.

The production sheet must:

- preserve the canonical Draw Request identity and retained history,
- lead with pooled funding facts and the submitted request,
- show the Builder and available Builder contact information prominently,
- show only evidence explicitly linked to the Draw Request,
- explain required peer approval gates without inventing an order or deadline,
- project collaboration from the Draw System Post,
- project linked Action Items as coordination records only,
- expose only route- and role-permitted commands,
- keep reviewer identity, private rejection rationale, and internal votes away
  from Builder views.

## Canonical Ownership

| Concern | Canonical owner | Sheet responsibility |
| --- | --- | --- |
| Requested amount, note, submission cycle, status, decision, history | Draw Request | Read and render; invoke authorized Draw Request commands |
| Release preparation reference | Draw Release Work Order | Show a reference when available; do not add payment execution controls |
| Unlocked, drawn, and available amounts | Build funding snapshot | Render the authoritative snapshot |
| Evidence used for this review | Draw Request evidence relationship/current-cycle submission snapshot | Render only explicit request links |
| Back Office and lender approval requirements | Locked Draw review policy and approval-group state | Render peer gates and quorum state |
| Comments | Draw System Post | Route to or project the canonical thread |
| Action Items | Canonical Action Item records associated through the Draw System Post | Project and route; never use as lifecycle gates |
| Builder identity and contact data | Builder Profile and active Builder account relationship | Render the authorized contact projection |

The sheet is a projection and command surface. It owns no parallel Draw,
Evidence Package, approval, comment, Action Item, or audit record.

## Loose Coupling and Pooled Availability

Milestone approval unlocks reimbursement availability for the Build. Unlocked
availability enters one pooled balance and may be requested later when the
Builder needs it.

An executed Draw Request is a Build-level reimbursement request. It is not
assigned to a Milestone or Draw Group. Draw Groups remain planning/forecast
concepts only; they do not define actual Draw Request eligibility, evidence,
review, or release ownership.

The review sheet must not show or infer:

- a source Milestone for the requested dollars,
- a source Draw Group,
- a one-to-one relationship between evidence and a Milestone merely because
  the evidence exists on the same Build,
- a semantic allocation of the Draw Request across earlier unlock events.

Implementation-era funding ledgers or allocation rows may be used internally
to reconcile availability. They are not a product relationship and must not be
presented as Draw-to-Milestone or Draw-to-Draw-Group attribution.

## Required Information Architecture

### Header

Show:

- canonical Draw Request display ID,
- requested amount,
- current high-level status,
- Build identity,
- submitted time when available,
- retained-history statement.

### Overview

Show these funding metrics from one authoritative snapshot:

1. **Total approved** — total reimbursement availability unlocked so far.
2. **Drawn amount** — released Draw Request value.
3. **Draw availability** — pooled amount available immediately before the
   current active request reservation where that value can be calculated.
4. **This request** — the submitted requested amount.
5. **After this request** — authoritative available balance after the current
   request reservation.
6. **Receipt and invoice coverage** — explicitly linked covered amount divided
   by Total approved.

The coverage visualization uses Total approved as its denominator. When the
canonical coverage relationship is unavailable, render **Not linked**. Do not
calculate coverage from all Build documents or all Milestone evidence.

The Overview also shows:

- Builder organization/profile name,
- primary authorized contact name, role, email, and phone when present,
- submission note and context,
- relevant safe operational references such as Work Order key,
- request-linked Attached Evidence.

When no canonical Draw Request evidence relationship exists, render an explicit
empty/unavailable state. Do not fill the section from a broad document library.

### Approval Policy

A locked Draw policy can require:

- Back Office approval,
- lender quorum approval,
- both.

Back Office and lender quorum are peer gates. Either may complete first. The
sheet shows each required group, satisfied/pending state, and lender quorum
progress when canonical data exists.

The sheet has no implied priority, per-review deadline, SLA timer, or overdue
state. Show policy details as unavailable until a persisted policy and
approval-group snapshot exists.

### Collaboration

The Collaboration tab is the Draw System Post comments projection. It routes to
or embeds that canonical thread and applies the active route's role visibility.
It does not create a generic or sheet-local comment thread.

### Action Items

The Action Items tab projects canonical Action Items associated through the
Draw System Post. Action Items coordinate work; they never approve, reject,
release, reserve availability, reset approval groups, or mutate Draw status.

### Decision or Review Status

Back Office and lender views show only authorized decision controls and private
review fields. Builder views show high-level review status and permitted
correction, resubmission, or withdrawal commands.

## Rejection and Resubmission

Rejection requires a private reason. It returns the same Draw Request record to
Builder correction and resubmission, retains its history, and resets all
required approvals for the next submission cycle.

Builder views may show that correction is required and which high-level
requirements remain unsatisfied. They do not show reviewer identity, private
rejection reason, internal recommendation notes, individual lender votes, or
private approval-group details.

## Role Matrix

| Capability | Builder | Back Office | Lender |
| --- | --- | --- | --- |
| Request facts and authorized evidence | Yes | Yes | Yes, when assigned and authorized |
| Builder contact projection | Own/authorized Build context | Yes | Yes, when assigned and authorized |
| High-level review state | Yes | Yes | Yes |
| Private review notes/rejection reason | No | When authorized | When authorized |
| Internal voter identity/votes | No | Policy-authorized projection only | Policy-authorized projection only |
| Withdraw/correct/resubmit | When lifecycle permits | No Builder commands | No Builder commands |
| Back Office decision | No | When policy and role permit | No |
| Lender vote/decision | No | Read only when policy permits | When assignment, quorum, and role permit |
| Release/payment execution | No | Outside this sheet | Outside this sheet |

The active route selects the persona-facing command set. Organization roles cap
authority; they do not replace route context.

## Production Integration

Current production hosts:

- `src/features/build-funding/BuildFundingWorkspace.tsx` for the Builder and
  active-Build funding context,
- `src/features/backoffice-draws/draw-control-room.tsx` for Back Office,
- future lender routes must import the same `DrawReviewSheet` component.

Canonical read projections currently come from
`convex/production_proposals.ts`:

- active Build detail supplies the funding snapshot and Builder contact,
- brokerage Draw rows supply the same data for the Back Office control room.

The current canonical model does not yet expose persisted Draw Request receipt
coverage, request-level evidence links, or locked approval-group snapshots in
every route. The component must show explicit unavailable states until those
records exist. Future integration work extends the projection; it must not
invent local state or derive these facts from timestamps, planned dates,
Milestone membership, or the Build document collection.

## Non-Goals

- payment or bank execution controls,
- a broad document library,
- a new comments system,
- sheet-local Action Items,
- inferred review deadlines or urgency,
- a Draw-to-Milestone or Draw-to-Draw-Group allocation UI,
- persona-specific Draw Request copies,
- local persistence that competes with canonical records.

## Acceptance Checklist

A Draw Review change is complete only when all applicable statements are true:

- Builder, Back Office, and lender use `DrawReviewSheet` rather than parallel
  review components.
- Direct entry renders the correct Draw Request and role-safe command set.
- The financial summary uses the canonical funding snapshot.
- Missing coverage, evidence, or policy data renders an explicit unavailable
  state.
- No Milestone or Draw Group allocation is shown or inferred.
- Builder cannot see reviewer identity, private rationale, or internal votes.
- Rejection requires a reason and preserves the same request's history.
- Collaboration routes to the Draw System Post.
- Action Items remain non-gating coordination records.
- Focused tests cover Builder privacy, Back Office decisions, shared component
  use, and absence of allocation semantics.
- Type checks and a fresh authenticated render pass without client errors.

