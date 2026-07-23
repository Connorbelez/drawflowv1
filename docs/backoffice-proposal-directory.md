# Backoffice Proposal Directory

The proposal boards on `/backoffice` and `/backoffice/proposals` use the same
organization-scoped proposal directory query and filter contract.

## Identity display

The displayed Builder email is resolved from active `builderAccountLinks` and
the WorkOS `users` projection. The preferred address is the verified owner,
then any verified account, then an owner account, then the first attached
account. WorkOS projection tables remain webhook-owned and are never changed by
proposal flows.

## Search

Search is case-insensitive, supports multiple whitespace-separated terms, and
requires every term to match. The searchable document includes the canonical
Build Proposal, selected plan metrics, active Build reference, formatted money
values, Builder identity (profile display/legal name plus every attached
account name and email), assigned Broker identity, and creator/updater IDs.
Nested milestones, documents, contractors, materials, and draws are outside the
directory search contract.

The query is cursor-paginated over `proposalKanbanCards`. Each page hydrates the
authoritative `buildProposals`, Builder accounts, and Broker identity before
authorization, search, and filter matching. When search or filters are active,
the client advances through remaining pages so matching records are not limited
to the dashboard's initial 50-card batch. Without filters, operators can load
additional pages explicitly.

## Filters

- Lifecycle stage and review outcome
- Assigned or unassigned Builder
- Specific Builder and assigned Broker
- Selected draw-plan strategy
- Pre-closing, pending-closing, or active-Build state
- Total budget, Borrower Starting Cash, Lender Draw Policy Limit, interest, and
  borrower co-pay ranges
- Proposed start, created, updated, submitted, approved, and closed date ranges

All reads reapply backoffice role, organization, brokerage, and proposal-level
authorization on the server. Client-side controls are not an authorization
boundary.
