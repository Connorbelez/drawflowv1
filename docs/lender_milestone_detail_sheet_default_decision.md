# Canonical Milestone detail sheet direction

Status: implemented for the existing Builder and Back Office production routes;
locked as the shared surface contract for the external Lender route.

Normative implementation specification:
`docs/specs/lender-milestone-review-and-decision.md`.

## Decision

The Milestone detail sheet demonstrated at
`/lender/milestone-review-prototype?variant=A` is the source design for the
default Milestone detail surface for Builder, Back Office, and Lender routes.

There must be one canonical Milestone detail surface and one canonical
Milestone record. Role-specific pages should compose role-aware tabs, facts,
and actions into that shared surface. They must not create parallel milestone,
evidence, Site Visit, cost-document, collaboration, or approval records.

The accepted information architecture is:

1. Overview: canonical scope, lifecycle, Sub-milestones, Site Visits, review
   state, and audit history.
2. Evidence: evidence aggregated from the Milestone's canonical
   Sub-milestones, with every asset linked back to its owning Sub-milestone.
3. Receipts / invoices: cost documents aggregated from the canonical
   Sub-milestones, including subtotal, tax, documented total, and source-file
   actions.
4. Collaboration: canonical Sub-milestone comment threads aggregated for the
   Milestone, with each thread linked back to its owning Sub-milestone.

## Role-aware action availability

- Builder routes expose Builder actions such as completing requirements,
  submitting, correcting, and resubmitting. Builders see requirements and
  high-level review state, but not reviewer identity or private rejection
  rationale.
- Back Office routes expose review, Site Visit, approval, rejection, and
  correction actions only when the active role and Build policy permit them.
- Lender routes expose review, approval, and rejection actions only when the
  active role and lender quorum policy permit them.
- A user who holds several roles sees actions for the active route, capped by
  their permissions. Holding an Admin role must not make Lender or Back Office
  controls appear on a Builder route.

## Approval display contract

Each Sub-milestone card should show its review state as Approved, Pending
Review, or Rejected. When required by Build policy, the card should separately
show Back Office approval and lender quorum progress. A rejection returns the
same request record for correction, retains history, and resets all required
approvals.

## Production implementation boundary

`MilestoneDetailSheet` owns the shared information architecture. Production
route adapters supply canonical Milestone and Sub-milestone data, canonical
comment-thread projections, and route-aware action availability. Child menu
decisions route into the existing governed Sub-milestone Review tab; they do
not duplicate review mutations, authorization, revision checks, or audit
history in the parent sheet.

The current production child-review contract exposes canonical review state
and capability-aware Back Office decision entrypoints, but it does not expose
the locked Build approval-policy gates. The sheet therefore omits Back Office
and lender-quorum gate badges unless a route supplies verified policy facts.
The external Lender route must populate and authorize those gates from its
locked Build policy when its organization and quorum backend is introduced.
The UI must not infer quorum from Back Office roles or manufacture a parallel
approval record.

The throwaway prototype remains representative only. Its in-memory transitions
are not production commands or persistence contracts.
