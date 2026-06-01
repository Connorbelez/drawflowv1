# Build Material Planning

Build material planning adds cost-only detail below a milestone without turning
that detail into execution work. Use it for materials and equipment that affect
the milestone budget but should not appear as sub-milestones.

## Data Model

- `proposalCostItems` stores planning-stage entries scoped by brokerage,
  organization, proposal, and milestone.
- `buildCostItems` stores the active-build copy created at offline closing.
- Each item stores `title`, `description`, `costCents`, `quantity`, `supplier`,
  `itemType` (`material` or `equipment`), `milestoneKey`, and
  `relevantSubmilestoneKeys`.

The item total is `costCents * quantity`. Proposal item creates, updates, and
deletes adjust the attached milestone budget by delta, recalculate the
milestone draw availability from borrower co-pay rules, and refresh the
proposal total budget. The entries stay separate from `proposalSubmilestones`
and `buildSubmilestones`.

## Workflow

1. Add milestones and sub-milestones in the proposal planning workspace.
2. Add material/equipment items from the Materials tab on the proposal detail
   route.
3. Review the rollup in the same tab. Each item shows supplier, cost, quantity,
   total, milestone, and relevant sub-milestones.
4. On proposal closing, material/equipment items are copied to the active build
   and displayed on the build detail Materials tab.

Changes are audited through proposal events and audit events. Draft edits do not
require a reason. Submitted or approved proposal edits require a backoffice role
and a reason.
