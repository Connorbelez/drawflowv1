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

**Verification:** Focused Biome checks passed. The authenticated route was
verified across Variants A–D for local controls, guided navigation, URL and
keyboard switching, refresh reset, console errors, and desktop overflow. A
full-build rerun remains limited by unrelated missing `fairlend-*` output
assets.

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

## Lender Draw Queue

**Purpose:** Explore how a lender scans assigned Draw requests and chooses the
next canonical Draw decision to open without duplicating Draw, Evidence Package,
policy, approval, or audit records.

**Selected status:** Variant D, **Locked · Build packets**. Variant A remains a
dense decision-ledger comparison, Variant B remains a split-triage comparison,
and Variant C remains a workflow-lane comparison. They are not selected.

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

**Prototype:** `../../routes/lender.draw-review-sheet-prototype.tsx` at
`/lender/draw-review-sheet-prototype?variant=A`, composed with
`LenderPrototypeShell.tsx` and the production sheet, tabs, Frame, Card, Badge,
Button, Separator, and Textarea primitives.

## Coverage

Every accepted or locked lender decision documented above has a matching
prototype route. This README does not assign status to any surface beyond what
the route source declares.
