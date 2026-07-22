# Timeline Milestone End Date Design

## Summary

The demo timeline should model each construction milestone as an interval, not a single point. The existing milestone `x` value becomes the start day. Each milestone derives a completion day from its duration, renders a second inline completion marker on the timeline, and drives a smoother borrower cash usage model across the interval.

The feature is scoped to the `/demo/timeline` demo and its reusable `AnimatedCurvedTimeline` support code. This is demo data, so the implementation should use a clean schema/snapshot cutover rather than preserving old shared snapshot data.

## Goals

- Show both milestone start and milestone completion on the timeline.
- Keep one milestone as one domain object; completion markers must not be fake timeline items.
- Let the user click the start marker to show the milestone as in progress and click the completion marker to show it as complete.
- Prevent marker/card overlap by enforcing a minimum 5-day gap between one milestone completion and the next milestone start.
- Replace lump-sum milestone spending with a realistic interval spend model while preserving reimbursement-only draw capacity unlocks at completion.

## Data Model

`TimelineItem<DemoMilestone>.x` is the milestone start day.

`DemoMilestone` should add:

```ts
durationDays: number;
initialPaymentAmount?: number;
completionPaymentAmount?: number;
```

Derived fields:

```ts
startX = item.x;
endX = item.x + milestone.durationDays;
distributedAmount =
  milestone.amount -
  (milestone.initialPaymentAmount ?? 0) -
  (milestone.completionPaymentAmount ?? 0);
```

Rules:

- `durationDays` is at least `1`.
- Initial and completion payments default to `0`.
- Normalize explicit payments as non-negative amounts. Cap `initialPaymentAmount` at `amount`, then cap `completionPaymentAmount` at the remaining amount so total modeled spend never exceeds milestone `amount`.
- The next milestone start must be at least 5 days after the previous milestone completion.
- Inserted milestones receive default duration/payment values and are inserted with enough day spacing to preserve completion-to-next-start gaps.
- Default draw dates should be derived from completion, not start. A draw with a manually edited date keeps its custom date.

## Timeline Rendering And Interaction

Extend `AnimatedCurvedTimeline` with interval-aware layout support instead of representing completion as separate items.

- Layout should compute `layoutX` for the start node and an `endLayoutX` for the derived completion node.
- Scale calculation must include start-to-completion spacing and completion-to-next-start spacing so the timeline widens before it shifts nodes.
- The main rail/path remains routed through milestone start nodes only.
- Completion nodes render inline on the same lane as the start node.
- Completion nodes must not render a card connector line, hanging card, or path waypoint.
- Completion nodes should support hover, active/fill styling, and stable test ids such as `demo-timeline-end-node-rough-in`.
- The existing start node keeps ids like `demo-timeline-node-rough-in`.

Selection state should become phase-aware:

```ts
type ActiveMilestoneSelection = {
  itemId: string;
  phase: "inProgress" | "complete";
};
```

Interaction rules:

- Clicking the start node sets `{ itemId, phase: "inProgress" }`.
- Clicking the completion node sets `{ itemId, phase: "complete" }`.
- The selected milestone card remains one card and reflects the selected phase.
- Start selected displays an in-progress state.
- Completion selected displays a complete state.
- Deleting a milestone deletes both markers because they are part of the same milestone.

## Milestone Cards

Milestone cards should be enhanced to make the interval model clear.

Each card should show:

- Status derived from the selected phase when the card is active.
- Start day.
- Completion day.
- Duration in days.
- Initial payment amount when configured.
- Completion payment amount when configured.
- Distributed daily spend summary for the remaining amount.

When neither marker for the card is active, the card may continue to use its existing milestone status for styling and label fallback.

## Financial Model

Cash-on-hand and draw availability should separate spend timing from reimbursement eligibility.

For each milestone:

- On `startX`, subtract `initialPaymentAmount` if present.
- Spread the remaining distributed amount evenly across `durationDays` integer day buckets from `startX` inclusive to `endX` exclusive.
- On `endX`, subtract `completionPaymentAmount` if present.
- On `endX`, unlock draw capacity equal to the full milestone `amount`.

Draw capacity must not unlock during the interval. It unlocks only when the milestone reaches completion.

If a milestone has no initial or completion payment, the full milestone amount is distributed evenly across the `durationDays` workday buckets. If it has both, only the remainder is distributed.

Draw releases remain positive cash events on `draw.x`. Default draw dates should be after milestone completion. Manually edited draw dates remain unchanged.

Charts:

- Cash-on-hand should decline gradually during milestone work.
- Milestone spend bars should reflect spend events at chart/probe granularity rather than one lump-sum start-day bar.
- Draw availability should step up only on completion days.
- Cash shortfall detection should evaluate interval spend events and label the relevant milestone/day.

## Sharing And Demo Data

Use a clean demo-data cutover.

- Replace the current share snapshot shape with a version that includes milestone duration and payment fields.
- Old shared snapshot payloads do not need compatibility migration.
- If an old or invalid payload is loaded, fall back to the current initial demo state.
- Snapshot normalization should preserve valid duration/payment fields and cap invalid payment totals.

## Testing

Unit tests:

- Derived completion day from `x + durationDays`.
- Minimum 5-day completion-to-next-start normalization.
- Inserted milestone spacing with duration included.
- Interval cashflow with initial payment, distributed spend, completion payment, and completion-only draw capacity unlock.
- Cash shortfall detection during distributed milestone spend.
- Snapshot round-trip for the new clean snapshot shape and fallback for invalid/old payloads.

Playwright tests:

- Start and completion inline nodes render for every milestone.
- Completion nodes do not render card connectors or hanging cards.
- Completion-to-next-start spacing prevents overlap.
- Clicking the start node sets the card status to in progress.
- Clicking the completion node sets the card status to complete.
- Cashflow chart shows smoother cash drawdown.
- Draw availability changes only at milestone completion.

## Non-Goals

- No backwards compatibility for old shared demo snapshots.
- No separate completion cards.
- No fake completion milestones in the item list.
- No proactive advance funding; draw capacity still unlocks only after milestone completion.
