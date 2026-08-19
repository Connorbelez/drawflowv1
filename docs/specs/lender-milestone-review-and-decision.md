# Lender Milestone Review and Decision

Status: **Approved and locked; promoted to the canonical production Milestone
detail sheet.**

## Authority

This specification is the implementation contract for Milestone detail and
review work across Builder, Back Office, and Lender routes. Read it with:

- `docs/draw_flow_prd.md`
- `docs/lender_milestone_detail_sheet_default_decision.md`
- `src/components/prototypes/README.md`

If another document or prototype describes a competing Milestone detail
layout, this locked contract wins until an explicit product decision updates
all three sources.

## Locked selection

Variant A at `/lender/milestone-review-prototype?variant=A` is the accepted
visual and interaction contract. Later A-D explorations that changed its
structure were rejected as drift. Do not select, reconstruct, or blend those
alternatives.

The accepted prototype is a representative Lender projection. Its local state
and fixture data are not production persistence or a second domain model.

## Canonical ownership

There is one Milestone record and one shared production detail surface:

- `src/features/backoffice-build-detail/MilestoneDetailSheet.tsx` owns the
  shared information architecture.
- `src/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx`
  supplies canonical Build and Milestone data and route-aware commands.
- `src/features/backoffice-build-detail/MilestoneCollaborationAggregate.tsx`
  projects canonical Sub-milestone discussion threads.
- `src/features/backoffice-build-detail/MilestoneReviewMenuItems.tsx` enters the
  existing governed Sub-milestone Review workflow.

Future work must refactor, extend, or compose these owners. It must not build a
new persona-specific sheet or duplicate Milestone, Sub-milestone, Evidence
Package, Site Visit, cost-document, discussion, review, approval, or audit
state.

## Locked information architecture

The sheet contains four primary tabs in this order:

1. **Overview**
   - Milestone identity, scope, lifecycle, dates, cost, and completion state.
   - Canonical Sub-milestone cards and links to their full detail.
   - Site Visit facts, review state, policy-gate progress, and retained audit
     history when the route is authorized to see them.
   - Sub-milestone cards display Approved, Pending Review, or Rejected.
2. **Evidence**
   - A gallery of authorized evidence aggregated across all canonical
     Sub-milestones.
   - Image bodies are visible in the cards.
   - Every card footer links to the owning Sub-milestone.
3. **Receipts / invoices**
   - Canonical cost documents aggregated across all Sub-milestones.
   - Each row shows subtotal and tax inline and provides the existing
     authorized open/download action.
4. **Collaboration**
   - Canonical Sub-milestone discussion threads aggregated into the parent
     Milestone context.
   - Each thread remains linked to its owning Sub-milestone.
   - No general-purpose or parallel comment store is allowed.

Existing canonical lifecycle, evidence, Site Visit, receipt/invoice, completion,
audit-history, and Sub-milestone navigation behavior must remain available.
Changes are additive and role-aware, not subtractive.

## Persona contract

The active route selects the persona surface. Permissions cap that surface; a
user with several roles does not receive the union of every role's actions.

### Builder route

- Shows requirements, authorized evidence, high-level review state, and
  permitted completion, correction, and resubmission actions.
- Does not show reviewer identity, internal votes, private rejection rationale,
  or reviewer-only approval commands.

### Back Office route

- Uses the same sheet and data ownership.
- May show review, Site Visit, approval, rejection, correction, and supporting
  information commands when canonical capabilities permit them.
- Sub-milestone decisions open the existing governed Review tab; the parent
  sheet does not implement a second mutation or audit path.

### Lender route

- Uses the same sheet with the accepted Variant A information hierarchy.
- May show policy gates, evidence, private reviewer state, and decision commands
  only when the authenticated organization, assignment, role, permissions, and
  locked Build policy authorize them.
- The production external Lender route must supply verified policy and quorum
  facts. The UI must not infer them from Back Office roles or fixture data.

## Review and policy rules

- Locked Build policy may require Back Office approval only, lender quorum
  only, or both.
- When both are required, Back Office and lender quorum are peer gates. They may
  be satisfied in either order.
- Cards show a gate only when policy requires it and the route supplies verified
  facts. Required Back Office approval and lender-quorum progress remain
  separate.
- A required completed Site Visit must include a report and at least one photo.
  An authorized Lender or Back Office Site Visit may satisfy the requirement.
- When cost-document matching is required, documented total must equal actual
  cost before Builder submission.
- Reviewers receive the evidence relevant to the gates they must decide.
- Rejection requires a private reason, returns the same request record to the
  Builder for correction and resubmission, retains all prior-cycle history, and
  resets every required approval.

## Privacy and audit rules

- Builders see requirements and high-level state only.
- Reviewer identity, internal votes, and rejection rationale remain private.
- Every production decision uses canonical authorization, revision checks,
  persistence, and audit events.
- The parent sheet must not bypass the canonical review owner or fabricate
  approval state for display.

## Explicit non-goals

Do not introduce:

- a separate lender Milestone record or sheet;
- per-review deadlines or SLA urgency;
- generic comments outside canonical discussion threads;
- named or additional approver types not present in policy;
- a broad document library;
- prototype-local persistence or production mutations;
- inferred Back Office or lender-quorum requirements;
- removal of existing canonical Milestone functionality.

## Current implementation state

Builder and Back Office Build Detail routes mount the shared
`ProductionBuildDetailSurface`, which opens the canonical
`MilestoneDetailSheet`. Builder routes omit reviewer controls. Back Office
routes supply capability-aware reviewer entrypoints to the existing governed
Sub-milestone Review tab.

The authenticated external Lender production route and its organization/quorum
backend are not yet present. Until they exist, the accepted prototype remains
the exact Lender UI contract. An implementation must mount the same production
sheet and supply verified lender-authorized data and commands; it must not start
from scratch.

## Change control

Any material change to the four-tab hierarchy, evidence or cost-document
placement, gate semantics, privacy boundary, rejection lifecycle, canonical
ownership, or persona action model requires an explicit product decision and a
synchronized update to this specification, the PRD, the repository README, the
prototype registry, and the agent guide.
