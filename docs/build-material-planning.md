# Build Material Planning

Build material planning adds cost-only detail below a milestone without turning
that detail into execution work. Use it for materials and equipment that may
affect the milestone budget but should not appear as sub-milestones.

## Data Model

- `proposalCostItems` stores planning-stage entries scoped by brokerage,
  organization, proposal, and milestone.
- `buildCostItems` stores the active-build copy created at offline closing.
- Each item stores `title`, `description`, `costCents`, `quantity`, `supplier`,
  `itemType` (`material` or `equipment`), `milestoneKey`,
  `relevantSubmilestoneKeys`, `budgetTreatment`, and the optional single
  `budgetSubmilestoneKey` that owns its budget effect.

The item total is `costCents * quantity`. Relevance tags remain many-to-many,
but an item has at most one budget sub-milestone target. Proposal planning
supports three treatments:

- `logOnly` records the item without changing any budget.
- `add` increases the targeted sub-milestone, parent milestone, proposal total,
  and reimbursement availability by the item total.
- `maintain` leaves the targeted sub-milestone total unchanged and allocates
  the item within that total. Maintained item totals cannot exceed the
  sub-milestone budget.

New items created from a sub-milestone default to `logOnly`. Existing records
without a treatment retain the historical `add` behavior during migration.
The entries stay separate from `proposalSubmilestones` and
`buildSubmilestones`.

## Workflow

1. Add milestones and sub-milestones in the proposal planning workspace.
2. Add material/equipment items from the Materials tab on the proposal detail
   route.
3. Choose the budget treatment and, for `add` or `maintain`, one budget
   sub-milestone. Review the rollup in the same tab. Each item shows supplier,
   cost, quantity, total, treatment, budget target, milestone, and relevant
   sub-milestones. The UI accepts cost as a per-unit dollar amount while Convex
   stores cents.
4. On proposal closing, material/equipment items are copied to the active build
   and displayed on the build detail Materials tab. Treatment and budget target
   remain immutable after closing; newly logged active-Build items retain the
   historical additive milestone behavior.

Changes are audited through proposal events and audit events. Draft edits do not
require a reason. Submitted or approved proposal edits require a backoffice role
and a reason.
