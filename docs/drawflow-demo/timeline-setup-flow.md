# Timeline Setup Flow

The `/demo/timeline` route now starts with a three-stage proposal-to-roadmap flow unless a shared snapshot URL is loaded.

1. Template selection
   - Uses the same construction template concept as the new proposal demo.
   - Captures total budget, borrower working capital, Loan Percentage, project address, and permit intake/skip state.
   - Mirrors the new proposal summary rail, "what happens next" guidance, compliance note, and four-step setup progress.
   - Defaults to the current single-family full-build roadmap so existing demo expectations remain recognizable.

2. Milestone budget table
   - Implemented with TanStack Table and the local shadcn-style table primitives.
   - Uses a dark blueprint treatment for template budgeting, row inspection, milestone budget edits, duration edits, and milestone exclusion.
   - Renders generated skeuomorphic blueprint milestone icons in the unified Name column beside the drag handle and milestone label; the timeline cards keep their existing isometric art.
   - Uses the shadcn/TanStack sortable-row pattern with `@dnd-kit` so the drag handle reorders active and excluded milestone rows.
   - Expanded rows open a two-pane sub-milestone editor: a scrollable card list on the left, selected detail editing on the right, plus add/remove controls.
   - Each sub-milestone carries editable budget and duration values while the generated timeline continues to consume the ordered sub-milestone names.

3. Generated timeline
   - Active rows are converted into normalized timeline milestones in the table's final visual order.
   - Edited budget and duration values populate the milestone cards, draw markers, cashflow chart, and draw capacity envelope.
   - Shared snapshot links still hydrate directly into the timeline and skip setup.

## Data Mapping

`buildTimelineItemsFromSetupRows` maps active setup rows into `TimelineItem<DemoMilestone>` records. The generated schedule preserves the existing demo conventions:

- first milestones are marked complete,
- the next milestone is ready/in progress,
- later milestones are upcoming,
- reimbursement draw timing follows milestone completion plus the default draw review lag,
- handoff gaps are preserved between milestone completion and the next milestone start.

## Verification

Primary coverage lives in `tests/e2e/timeline-demo.spec.ts`:

- template selection and blueprint table editing,
- blueprint icon rendering, row dragging, and generated timeline order,
- sub-milestone card editing, add/remove controls, and detail-pane selection,
- generated timeline values,
- milestone expansion and inline edit geometry,
- sharing, responsive layout, context menus, chart probing, and draw editing.

Run:

```sh
bun run build
bun run test:e2e tests/e2e/timeline-demo.spec.ts
```
