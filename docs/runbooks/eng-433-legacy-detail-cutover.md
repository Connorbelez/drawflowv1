# ENG-433 legacy detail cutover

This runbook records the rollback boundary for retiring the divergent child
detail implementations.

## Rollback boundary

`059d2624` (`test: exercise homeowner canonical notification denial`) is the
last commit before ENG-433 removes the production nested child detail, lender
child completion-review path, and generated companion workflow rendering.

If the cutover must be rolled back, deploy or reset the application to that
commit and restore the route build from the same revision. Do not restore only
one detail component: the route-owned target controller, collaboration feed,
and canonical sheet must move together.

## Cutover contract

- `SubmilestoneDetailSheet` is the only production child-detail composer.
- `MilestoneDetailSheet` owns the parent aggregate, completion, and approval
  actions; child rows are navigation-only.
- Generated milestone companions dispatch to the canonical child target before
  generic Action Item rendering. Manual and ordinary child Action Items remain
  generic.
- Missing or invalid canonical bindings fail closed and never fall back to a
  generic lifecycle editor.

## Verification

Run the focused collaboration and parent-sheet tests, then the repository
typecheck and production build before promoting the cutover. Capture the exact
commit SHA with the browser and accessibility evidence so the rollback boundary
is auditable.
