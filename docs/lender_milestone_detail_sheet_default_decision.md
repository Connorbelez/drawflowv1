# Canonical Milestone detail sheet direction

Status: accepted prototype direction. This document records a product decision;
it is not a production implementation or persistence contract.

## Decision

The Milestone detail sheet demonstrated at
`/lender/milestone-review-prototype?variant=A` should become the default
Milestone detail surface for Builder, Back Office, and Lender routes.

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

## Prototype boundary

The current prototype uses representative in-memory state. Its menus, approval
transitions, comments, and file links must not be treated as production
commands, authorization, persistence, or complete data contracts. Production
work should reuse the canonical Sub-milestone review and collaboration
functions and derive action availability from the active route, WorkOS role,
and locked Build policy.
