# Timeline Milestone End Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interval-aware milestone start/completion markers to `/demo/timeline` and update the demo cashflow model so borrower spend accrues over milestone duration while draw capacity unlocks only at completion.

**Architecture:** Keep each milestone as one domain object. Add pure schedule/payment helpers for duration, completion date, spacing, and cashflow math; extend `AnimatedCurvedTimeline` to render optional inline completion nodes derived from each item; update the route to use phase-aware selection and interval cashflow.

**Tech Stack:** React 19, TypeScript, Vite, Motion, TanStack Router, Vitest, Playwright, Bun, Graphite.

---

## File Structure

- Create `src/routes/demo/timeline/-timeline-milestone-schedule.ts`: pure helpers for milestone duration, payment normalization, completion dates, spacing, draw defaults, and interval spend event generation.
- Create `src/routes/demo/timeline/-timeline-milestone-schedule.test.ts`: unit coverage for schedule/payment normalization and interval spend generation.
- Modify `src/routes/demo/timeline/-timeline-share-snapshot.ts`: clean snapshot cutover to payload version 2 with duration/payment fields and no v1 migration.
- Modify `src/routes/demo/timeline/-timeline-share-snapshot.test.ts`: v2 round-trip and invalid/old payload fallback tests.
- Modify `src/components/roadmap/animated-curved-timeline-utils.ts`: interval layout support, inline end-node coordinates, and separate spacing floors for card-bearing start nodes and inline markers.
- Modify `src/components/roadmap/animated-curved-timeline-utils.test.ts`: layout tests for start/end marker spacing and proportional scale.
- Modify `src/components/roadmap/AnimatedCurvedTimeline.tsx`: render optional completion nodes on the rail without connectors/cards/path waypoints.
- Modify `src/components/roadmap/README.md`: document interval node props and spacing behavior.
- Modify `src/routes/demo/timeline/index.tsx`: demo data, phase-aware selection, milestone card fields/status, draw defaults, cashflow, draw availability, and rendering callbacks.
- Modify `src/routes/demo/timeline/-index.test.ts`: interval cashflow and completion-only capacity tests.
- Modify `tests/e2e/timeline-demo.spec.ts`: browser coverage for completion nodes, card phase status, no completion connectors, spacing, and charts.

---

### Task 1: Add Milestone Schedule Helpers

**Files:**
- Create: `src/routes/demo/timeline/-timeline-milestone-schedule.ts`
- Test: `src/routes/demo/timeline/-timeline-milestone-schedule.test.ts`

- [ ] **Step 1: Write failing tests for payment normalization and derived end dates**

Create `src/routes/demo/timeline/-timeline-milestone-schedule.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import type { DemoMilestone } from "./-timeline-share-snapshot.ts";
import {
  DEFAULT_DRAW_REVIEW_LAG_DAYS,
  DEFAULT_MILESTONE_DURATION_DAYS,
  MINIMUM_MILESTONE_HANDOFF_GAP_DAYS,
  buildMilestoneSpendEvents,
  getMilestoneEndX,
  getMilestonePaymentSchedule,
  normalizeMilestoneSchedule,
  normalizeMilestoneTimelineItems,
  resolveDefaultDrawX,
} from "./-timeline-milestone-schedule.ts";

describe("timeline milestone schedule helpers", () => {
  test("derives completion day from start day plus duration", () => {
    const item = milestoneItem({
      amount: 120_000,
      durationDays: 12,
      x: 40,
    });

    expect(getMilestoneEndX(item)).toBe(52);
    expect(resolveDefaultDrawX(item, { max: 80, min: 0, unit: "days" })).toBe(
      52 + DEFAULT_DRAW_REVIEW_LAG_DAYS
    );
  });

  test("normalizes invalid durations and caps explicit payments", () => {
    const schedule = getMilestonePaymentSchedule(
      milestoneItem({
        amount: 100_000,
        completionPaymentAmount: 60_000,
        durationDays: 0,
        initialPaymentAmount: 70_000,
        x: 10,
      })
    );

    expect(schedule).toMatchObject({
      completionPaymentAmount: 30_000,
      distributedAmount: 0,
      durationDays: DEFAULT_MILESTONE_DURATION_DAYS,
      initialPaymentAmount: 70_000,
      totalAmount: 100_000,
    });
  });

  test("enforces five days between previous completion and next start", () => {
    const items = normalizeMilestoneTimelineItems([
      milestoneItem({ durationDays: 10, id: "one", x: 10 }),
      milestoneItem({ durationDays: 12, id: "two", x: 22 }),
      milestoneItem({ durationDays: 8, id: "three", x: 35 }),
    ]);

    expect(items.map((item) => [item.id, item.x, getMilestoneEndX(item)])).toEqual(
      [
        ["one", 10, 20],
        ["two", 25, 37],
        ["three", 42, 50],
      ]
    );
    expect(MINIMUM_MILESTONE_HANDOFF_GAP_DAYS).toBe(5);
  });

  test("builds daily distributed spend events from start inclusive to end exclusive", () => {
    const events = buildMilestoneSpendEvents(
      milestoneItem({
        amount: 100_000,
        completionPaymentAmount: 20_000,
        durationDays: 4,
        initialPaymentAmount: 40_000,
        name: "Foundation",
        x: 10,
      })
    );

    expect(events).toEqual([
      {
        amount: 40_000,
        day: 10,
        id: "foundation-initial-payment",
        kind: "initial",
        label: "Foundation initial payment",
        milestoneAmount: 100_000,
        milestoneId: "foundation",
        milestoneName: "Foundation",
      },
      {
        amount: 10_000,
        day: 10,
        id: "foundation-distributed-10",
        kind: "distributed",
        label: "Foundation daily spend",
        milestoneAmount: 100_000,
        milestoneId: "foundation",
        milestoneName: "Foundation",
      },
      {
        amount: 10_000,
        day: 11,
        id: "foundation-distributed-11",
        kind: "distributed",
        label: "Foundation daily spend",
        milestoneAmount: 100_000,
        milestoneId: "foundation",
        milestoneName: "Foundation",
      },
      {
        amount: 10_000,
        day: 12,
        id: "foundation-distributed-12",
        kind: "distributed",
        label: "Foundation daily spend",
        milestoneAmount: 100_000,
        milestoneId: "foundation",
        milestoneName: "Foundation",
      },
      {
        amount: 10_000,
        day: 13,
        id: "foundation-distributed-13",
        kind: "distributed",
        label: "Foundation daily spend",
        milestoneAmount: 100_000,
        milestoneId: "foundation",
        milestoneName: "Foundation",
      },
      {
        amount: 20_000,
        day: 14,
        id: "foundation-completion-payment",
        kind: "completion",
        label: "Foundation completion payment",
        milestoneAmount: 100_000,
        milestoneId: "foundation",
        milestoneName: "Foundation",
      },
    ]);
  });
});

function milestoneItem(
  overrides: Partial<TimelineItem<DemoMilestone> & DemoMilestone> = {}
): TimelineItem<DemoMilestone> {
  const id = overrides.id ?? "foundation";
  const name = overrides.name ?? "Foundation";

  return {
    data: normalizeMilestoneSchedule({
      amount: overrides.amount ?? 100_000,
      completionPaymentAmount: overrides.completionPaymentAmount,
      draw: "Draw 1",
      drawX: overrides.drawX,
      durationDays: overrides.durationDays,
      evidence: "Planning",
      icon: "foundation",
      initialPaymentAmount: overrides.initialPaymentAmount,
      name,
      policy: "Planning",
      status: "ready",
      subMilestones: ["Excavation"],
    }),
    id,
    x: overrides.x ?? 10,
  };
}
```

- [ ] **Step 2: Run schedule tests and verify they fail**

Run:

```bash
bun run test src/routes/demo/timeline/-timeline-milestone-schedule.test.ts
```

Expected: fail because `-timeline-milestone-schedule.ts` does not exist.

- [ ] **Step 3: Implement the schedule helper module**

Create `src/routes/demo/timeline/-timeline-milestone-schedule.ts`:

```ts
import type {
  TimelineItem,
  TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import type { DemoMilestone } from "./-timeline-share-snapshot.ts";

export const DEFAULT_MILESTONE_DURATION_DAYS = 14;
export const DEFAULT_DRAW_REVIEW_LAG_DAYS = 8;
export const MINIMUM_MILESTONE_HANDOFF_GAP_DAYS = 5;

export type MilestonePhase = "inProgress" | "complete";
export type MilestoneSpendKind = "completion" | "distributed" | "initial";

export interface ActiveMilestoneSelection {
  itemId: string;
  phase: MilestonePhase;
}

export interface MilestonePaymentSchedule {
  completionPaymentAmount: number;
  dailyDistributedAmount: number;
  distributedAmount: number;
  durationDays: number;
  endX: number;
  initialPaymentAmount: number;
  startX: number;
  totalAmount: number;
}

export interface MilestoneSpendEvent {
  amount: number;
  day: number;
  id: string;
  kind: MilestoneSpendKind;
  label: string;
  milestoneAmount: number;
  milestoneId: string;
  milestoneName: string;
}

type DemoMilestoneInput = Omit<DemoMilestone, "durationDays"> &
  Partial<
    Pick<
      DemoMilestone,
      "completionPaymentAmount" | "durationDays" | "initialPaymentAmount"
    >
  >;

export function normalizeMilestoneSchedule(
  milestone: DemoMilestoneInput
): DemoMilestone {
  const amount = Math.max(0, Math.round(normalizeNumber(milestone.amount, 0)));
  const initialPaymentAmount = Math.min(
    amount,
    Math.max(0, Math.round(normalizeNumber(milestone.initialPaymentAmount, 0)))
  );
  const completionPaymentAmount = Math.min(
    amount - initialPaymentAmount,
    Math.max(
      0,
      Math.round(normalizeNumber(milestone.completionPaymentAmount, 0))
    )
  );

  return {
    ...milestone,
    amount,
    completionPaymentAmount,
    durationDays: normalizeDurationDays(milestone.durationDays),
    initialPaymentAmount,
  };
}

export function getMilestonePaymentSchedule(
  item: TimelineItem<DemoMilestone>
): MilestonePaymentSchedule {
  const milestone = normalizeMilestoneSchedule(
    item.data ?? createFallbackMilestone()
  );
  const durationDays = milestone.durationDays;
  const initialPaymentAmount = milestone.initialPaymentAmount ?? 0;
  const completionPaymentAmount = milestone.completionPaymentAmount ?? 0;
  const distributedAmount = Math.max(
    0,
    milestone.amount - initialPaymentAmount - completionPaymentAmount
  );

  return {
    completionPaymentAmount,
    dailyDistributedAmount: distributedAmount / durationDays,
    distributedAmount,
    durationDays,
    endX: item.x + durationDays,
    initialPaymentAmount,
    startX: item.x,
    totalAmount: milestone.amount,
  };
}

export function getMilestoneEndX(item: TimelineItem<DemoMilestone>): number {
  return getMilestonePaymentSchedule(item).endX;
}

export function resolveDefaultDrawX(
  item: TimelineItem<DemoMilestone>,
  range: TimelineRange
): number {
  const endX = getMilestoneEndX(item);
  const max = Number.isFinite(range.max) ? range.max : endX;
  const min = Number.isFinite(range.min) ? range.min : 0;

  return Math.min(Math.max(endX + DEFAULT_DRAW_REVIEW_LAG_DAYS, min), max);
}

export function normalizeMilestoneTimelineItems(
  items: TimelineItem<DemoMilestone>[]
): TimelineItem<DemoMilestone>[] {
  const sortedItems = [...items].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  let previousEndX = Number.NEGATIVE_INFINITY;

  return sortedItems.map((item) => {
    const nextX = Math.max(
      item.x,
      previousEndX + MINIMUM_MILESTONE_HANDOFF_GAP_DAYS
    );
    const nextItem = {
      ...item,
      data: item.data ? normalizeMilestoneSchedule(item.data) : item.data,
      x: nextX,
    };

    previousEndX = getMilestoneEndX(nextItem);

    return nextItem;
  });
}

export function buildMilestoneSpendEvents(
  item: TimelineItem<DemoMilestone>
): MilestoneSpendEvent[] {
  const milestone = normalizeMilestoneSchedule(
    item.data ?? createFallbackMilestone()
  );
  const schedule = getMilestonePaymentSchedule({ ...item, data: milestone });
  const milestoneName = milestone.name;
  const events: MilestoneSpendEvent[] = [];

  if (schedule.initialPaymentAmount > 0) {
    events.push({
      amount: schedule.initialPaymentAmount,
      day: schedule.startX,
      id: `${item.id}-initial-payment`,
      kind: "initial",
      label: `${milestoneName} initial payment`,
      milestoneAmount: schedule.totalAmount,
      milestoneId: item.id,
      milestoneName,
    });
  }

  if (schedule.dailyDistributedAmount > 0) {
    for (
      let day = Math.round(schedule.startX);
      day < Math.round(schedule.endX);
      day += 1
    ) {
      events.push({
        amount: schedule.dailyDistributedAmount,
        day,
        id: `${item.id}-distributed-${day}`,
        kind: "distributed",
        label: `${milestoneName} daily spend`,
        milestoneAmount: schedule.totalAmount,
        milestoneId: item.id,
        milestoneName,
      });
    }
  }

  if (schedule.completionPaymentAmount > 0) {
    events.push({
      amount: schedule.completionPaymentAmount,
      day: schedule.endX,
      id: `${item.id}-completion-payment`,
      kind: "completion",
      label: `${milestoneName} completion payment`,
      milestoneAmount: schedule.totalAmount,
      milestoneId: item.id,
      milestoneName,
    });
  }

  return events;
}

function normalizeDurationDays(value: number | undefined): number {
  return Math.max(
    1,
    Math.round(normalizeNumber(value, DEFAULT_MILESTONE_DURATION_DAYS))
  );
}

function normalizeNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function createFallbackMilestone(): DemoMilestone {
  return {
    amount: 0,
    completionPaymentAmount: 0,
    draw: "Draw",
    durationDays: DEFAULT_MILESTONE_DURATION_DAYS,
    evidence: "Draft package",
    icon: "change",
    initialPaymentAmount: 0,
    name: "Milestone",
    policy: "Needs review",
    status: "upcoming",
    subMilestones: [],
  };
}
```

- [ ] **Step 4: Run schedule tests and verify they pass**

Run:

```bash
bun run test src/routes/demo/timeline/-timeline-milestone-schedule.test.ts
```

Expected: pass all tests in `-timeline-milestone-schedule.test.ts`.

- [ ] **Step 5: Record the helper change**

Run:

```bash
gt modify -am "Add timeline milestone schedule helpers"
```

Expected: Graphite records the helper module and tests on the current branch.

---

### Task 2: Update Demo Milestone Types And Share Snapshots

**Files:**
- Modify: `src/routes/demo/timeline/-timeline-share-snapshot.ts`
- Modify: `src/routes/demo/timeline/-timeline-share-snapshot.test.ts`
- Modify: `src/routes/demo/timeline/index.tsx`

- [ ] **Step 1: Write failing snapshot tests for clean v2 cutover**

In `src/routes/demo/timeline/-timeline-share-snapshot.test.ts`, replace `payloadVersion` expectations and inserted fixture data so every `DemoMilestone` includes `durationDays`. Add this test:

```ts
test("falls back to current state for old snapshot payloads", () => {
  const fallback = initialTimelineShareState(
    initialItems,
    initialDraws,
    [],
    { max: 230, min: 0, unit: "days" },
    { itemId: "framing", phase: "inProgress" },
    58,
    true,
    400_000,
    false
  );
  const oldSnapshot = {
    ...buildTimelineShareSnapshotV2(fallback),
    payloadVersion: 1,
  } as unknown as TimelineShareSnapshotV2;

  expect(applyTimelineShareSnapshotV2(oldSnapshot, fallback)).toEqual(fallback);
});
```

Update the round-trip assertion:

```ts
expect(snapshot.payloadVersion).toBe(2);
expect(snapshot.items[0]?.data).toMatchObject({
  durationDays: 14,
  initialPaymentAmount: 25_000,
});
```

- [ ] **Step 2: Run snapshot tests and verify they fail**

Run:

```bash
bun run test src/routes/demo/timeline/-timeline-share-snapshot.test.ts
```

Expected: fail because v2 functions/types and phase-aware selection are not implemented.

- [ ] **Step 3: Update share snapshot types and normalization**

In `src/routes/demo/timeline/-timeline-share-snapshot.ts`:

```ts
import type {
  ActiveMilestoneSelection,
} from "./-timeline-milestone-schedule.ts";
import { normalizeMilestoneSchedule } from "./-timeline-milestone-schedule.ts";

export interface DemoMilestone {
  amount: number;
  completionPaymentAmount?: number;
  draw: string;
  drawX?: number;
  durationDays: number;
  evidence: string;
  icon: IsometricIconKey;
  initialPaymentAmount?: number;
  name: string;
  policy: string;
  status: DemoStatus;
  subMilestones: string[];
}

export interface TimelineShareSnapshotV2 {
  activeSelection: ActiveMilestoneSelection;
  capitalSpikes: DemoCapitalSpike[];
  draws: DemoDraw[];
  items: DemoTimelineSnapshotItem[];
  payloadVersion: 2;
  progressValue: number;
  range: TimelineRange;
  selectedPanelOpen: boolean;
  snapshotSummary: string;
  startingCash: number;
  straightLine: boolean;
  title: string;
}
```

Rename exported v1 functions and types:

```ts
export function buildTimelineShareSnapshotV2(
  input: TimelineShareSnapshotInput
): TimelineShareSnapshotV2

export function applyTimelineShareSnapshotV2(
  snapshot: TimelineShareSnapshotV2,
  fallback: TimelineShareState
): TimelineShareState
```

Use a clean fallback:

```ts
if (snapshot.payloadVersion !== 2) {
  return fallbackSnapshot;
}
```

Normalize milestone data with the helper:

```ts
function normalizeMilestoneData(
  data: DemoMilestone | undefined,
  index: number
): DemoMilestone {
  return normalizeMilestoneSchedule({
    amount: Math.max(0, Math.round(normalizeNumber(data?.amount, 0))),
    completionPaymentAmount: data?.completionPaymentAmount,
    draw: data?.draw?.trim() || `Draw ${index + 1}`,
    drawX:
      data?.drawX === undefined
        ? undefined
        : Math.max(0, normalizeNumber(data.drawX, 0)),
    durationDays: data?.durationDays,
    evidence: data?.evidence?.trim() || "Draft package",
    icon: data?.icon ?? "change",
    initialPaymentAmount: data?.initialPaymentAmount,
    name: data?.name?.trim() || `Milestone ${index + 1}`,
    policy: data?.policy?.trim() || "Needs review",
    status: data?.status ?? "upcoming",
    subMilestones: normalizeShareSubMilestones(data?.subMilestones, index),
  });
}
```

- [ ] **Step 4: Update route imports and share state calls**

In `src/routes/demo/timeline/index.tsx`, replace imports:

```ts
import {
  applyTimelineShareSnapshotV2,
  buildTimelineShareSnapshotV2,
  type DemoCapitalSpike,
  type DemoDraw,
  type DemoMilestone,
  type IsometricIconKey,
  initialTimelineShareState,
  type TimelineShareSnapshotV2,
  type TimelineShareState,
} from "./-timeline-share-snapshot.ts";
```

Replace function calls:

```ts
const snapshot = buildTimelineShareSnapshotV2(state);
const nextState = applyTimelineShareSnapshotV2(sharedSnapshot.snapshot, fallback);
```

- [ ] **Step 5: Run snapshot tests and verify they pass**

Run:

```bash
bun run test src/routes/demo/timeline/-timeline-share-snapshot.test.ts
```

Expected: pass all snapshot tests.

- [ ] **Step 6: Record the snapshot change**

Run:

```bash
gt modify -am "Update timeline share snapshots for milestone intervals"
```

Expected: Graphite records the v2 snapshot cutover.

---

### Task 3: Extend Timeline Layout Utilities For Inline End Nodes

**Files:**
- Modify: `src/components/roadmap/animated-curved-timeline-utils.ts`
- Modify: `src/components/roadmap/animated-curved-timeline-utils.test.ts`

- [ ] **Step 1: Write failing layout tests for end node coordinates and spacing**

Add tests to `src/components/roadmap/animated-curved-timeline-utils.test.ts`:

```ts
test("computes inline end node positions without adding path waypoints", () => {
  const layout = buildTimelineLayout(
    [
      { id: "one", x: 10 },
      { id: "two", x: 35 },
    ],
    {
      baselineY: 100,
      getItemEndValue: (item) => (item.id === "one" ? 20 : 50),
      laneStepY: 18,
      minInlineNodeSpacingPx: 72,
      minNodeSpacingPx: 160,
      paddingX: 72,
      pixelsPerUnit: 4,
      range: { max: 80, min: 0, unit: "days" },
      viewportWidth: 500,
    }
  );

  expect(layout.items[0]?.endX).toBe(20);
  expect(layout.items[0]?.endLayoutX).toBeGreaterThan(
    layout.items[0]?.layoutX ?? 0
  );
  expect(layout.points).toEqual([
    { x: layout.startX, y: 100 },
    { x: layout.items[0]?.layoutX, y: 100 },
    { x: layout.items[1]?.layoutX, y: 100 },
    { x: layout.endX, y: 100 },
  ]);
});

test("scales for inline completion-to-next-start spacing separately from card spacing", () => {
  const layout = buildTimelineLayout(
    [
      { id: "one", x: 10 },
      { id: "two", x: 25 },
    ],
    {
      baselineY: 100,
      getItemEndValue: (item) => (item.id === "one" ? 20 : 35),
      laneStepY: 18,
      minInlineNodeSpacingPx: 72,
      minNodeSpacingPx: 160,
      paddingX: 72,
      pixelsPerUnit: 2,
      range: { max: 60, min: 0, unit: "days" },
      viewportWidth: 500,
    }
  );
  const first = layout.items[0];
  const second = layout.items[1];

  expect(first?.endLayoutX).toBeDefined();
  expect(second).toBeDefined();
  expect((first?.endLayoutX ?? 0) - (first?.layoutX ?? 0)).toBeGreaterThanOrEqual(72);
  expect((second?.layoutX ?? 0) - (first?.endLayoutX ?? 0)).toBeGreaterThanOrEqual(72);
  expect((second?.layoutX ?? 0) - (first?.layoutX ?? 0)).toBeGreaterThanOrEqual(160);
});
```

- [ ] **Step 2: Run layout utility tests and verify they fail**

Run:

```bash
bun run test src/components/roadmap/animated-curved-timeline-utils.test.ts
```

Expected: fail because `getItemEndValue`, `minInlineNodeSpacingPx`, `endX`, and `endLayoutX` do not exist.

- [ ] **Step 3: Add layout fields and options**

In `src/components/roadmap/animated-curved-timeline-utils.ts`, update interfaces:

```ts
export interface TimelineLayoutItem<TData = unknown>
  extends TimelineItem<TData> {
  endLayoutX?: number;
  endRawX?: number;
  endX?: number;
  layoutX: number;
  layoutY: number;
  normalized: number;
  order: number;
  rawX: number;
}

export interface TimelineLayoutOptions<TData = unknown> {
  baselineY: number;
  getItemEndValue?: (item: TimelineItem<TData>) => number | null | undefined;
  laneStepY: number;
  minInlineNodeSpacingPx?: number;
  minNodeSpacingPx: number;
  paddingX: number;
  pixelsPerUnit: number;
  range: TimelineRange;
  viewportWidth: number;
}
```

Update the function signature:

```ts
export function buildTimelineLayout<TData>(
  items: TimelineItem<TData>[],
  options: TimelineLayoutOptions<TData>
): TimelineLayout<TData> {
```

- [ ] **Step 4: Include inline marker spacing in axis width**

In `buildTimelineLayout`, compute start/end spacing values:

```ts
const minInlineNodeSpacingPx = Math.max(
  0,
  options.minInlineNodeSpacingPx ?? 48
);
const sortedItems = [...items]
  .map((item, inputIndex) => ({ inputIndex, item }))
  .sort((a, b) => a.item.x - b.item.x || a.inputIndex - b.inputIndex);
const startValues = sortedItems.map(({ item }) => item.x);
const inlineValues = sortedItems.flatMap(({ item }) => {
  const endValue = options.getItemEndValue?.(item);
  return Number.isFinite(endValue) ? [item.x, Number(endValue)] : [item.x];
}).sort((a, b) => a - b);
const minimumSpacingAxisWidth = Math.max(
  getMinimumSpacingAxisWidth(startValues, range, minNodeSpacingPx),
  getMinimumSpacingAxisWidth(inlineValues, range, minInlineNodeSpacingPx)
);
```

- [ ] **Step 5: Populate end coordinates without adding path points**

Inside `layoutItems.map`, after `rawX`:

```ts
const rawEndX = options.getItemEndValue?.(item);
const endX =
  Number.isFinite(rawEndX) && Number(rawEndX) > item.x
    ? clampTimelineValue(Number(rawEndX), range.min, range.max)
    : undefined;
const endRawX =
  endX === undefined
    ? undefined
    : paddingX + normalizeTimelineValue(endX, range) * axisWidth;
```

Return fields:

```ts
return {
  ...item,
  endLayoutX: endRawX,
  endRawX,
  endX,
  layoutX,
  layoutY: options.baselineY + lane * options.laneStepY,
  normalized,
  order,
  rawX,
  sourceIndex: inputIndex,
};
```

Keep `points` unchanged:

```ts
const points: TimelineRoutePoint[] = [
  { x: startX, y: options.baselineY },
  ...layoutItems.map((item) => ({ x: item.layoutX, y: item.layoutY })),
  { x: endX, y: options.baselineY },
];
```

- [ ] **Step 6: Run layout utility tests and verify they pass**

Run:

```bash
bun run test src/components/roadmap/animated-curved-timeline-utils.test.ts
```

Expected: pass all layout utility tests.

- [ ] **Step 7: Record the layout utility change**

Run:

```bash
gt modify -am "Add inline completion node layout support"
```

Expected: Graphite records utility changes and tests.

---

### Task 4: Render Inline Completion Nodes In AnimatedCurvedTimeline

**Files:**
- Modify: `src/components/roadmap/AnimatedCurvedTimeline.tsx`
- Modify: `src/components/roadmap/README.md`

- [ ] **Step 1: Add component props and context types**

In `src/components/roadmap/AnimatedCurvedTimeline.tsx`, add:

```ts
export type TimelineItemPhase = "end" | "start";

export interface TimelineItemRenderContext<TData = unknown> {
  activate: () => void;
  active: boolean;
  complete: boolean;
  index: number;
  item: TimelineLayoutItem<TData>;
  phase: TimelineItemPhase;
  range: Required<TimelineRange>;
}
```

Add props:

```ts
activeItemPhase?: TimelineItemPhase;
getItemEndValue?: (item: TimelineItem<TData>) => number | null | undefined;
minInlineNodeSpacingPx?: number;
onEndNodeClick?: (item: TimelineLayoutItem<TData>) => void;
renderEndNode?: (
  item: TimelineLayoutItem<TData>,
  context: TimelineItemRenderContext<TData>
) => ReactNode;
```

- [ ] **Step 2: Pass interval options into layout**

In the component props destructure:

```ts
activeItemPhase = "start",
getItemEndValue,
minInlineNodeSpacingPx = 56,
onEndNodeClick,
renderEndNode,
```

In `buildTimelineLayout` options:

```ts
getItemEndValue,
minInlineNodeSpacingPx,
```

Add both values to the `useMemo` dependency list.

- [ ] **Step 3: Make active/complete state phase-aware**

Replace active checks in the item render loop:

```ts
const itemActive = item.id === resolvedActiveItemId;
const startActive = itemActive && activeItemPhase === "start";
const endActive = itemActive && activeItemPhase === "end";
const complete =
  activeOrder >= 0 &&
  (item.order < activeOrder || (item.order === activeOrder && endActive));
const startContext = {
  activate: () => setActiveItem(item),
  active: startActive,
  complete,
  index,
  item,
  phase: "start" as const,
  range: layout.range,
};
const cardContext = {
  activate: () => setActiveItem(item),
  active: itemActive,
  complete,
  index,
  item,
  phase: activeItemPhase,
  range: layout.range,
};
```

Use `startContext` for existing `renderNode`. Use `cardContext` for `renderCard` so the card is active when either the start or completion node is selected.

- [ ] **Step 4: Render completion node without connector or card**

After the start node wrapper inside each item group, add:

```tsx
{renderEndNode && item.endLayoutX !== undefined && (
  <motion.div
    className="absolute z-20"
    initial={false}
    layout="position"
    style={{
      left: item.endLayoutX,
      top: itemNodeY,
    }}
    transition={
      prefersReducedMotion
        ? { duration: 0 }
        : {
            damping: 28,
            stiffness: 180,
            type: "spring",
          }
    }
  >
    <div
      className="-translate-x-1/2 -translate-y-1/2"
      data-timeline-node-id={`${item.id}-end`}
      data-timeline-node-wrapper=""
    >
      {renderEndNode(item, {
        activate: () => onEndNodeClick?.(item),
        active: endActive,
        complete: endActive || item.order < activeOrder,
        index,
        item,
        phase: "end",
        range: layout.range,
      })}
    </div>
  </motion.div>
)}
```

Do not add a connector, card, or path point for this node.

- [ ] **Step 5: Update README**

In `src/components/roadmap/README.md`, add:

```md
- `getItemEndValue` / `renderEndNode` for optional inline completion nodes. End nodes share the item identity and lane, but do not create path waypoints, cards, or card connector lines.
- `activeItemPhase` to distinguish active start vs end markers for one selected item.
- `minInlineNodeSpacingPx` to keep inline start/end markers readable without using full card spacing.
```

- [ ] **Step 6: Run TypeScript-facing unit tests**

Run:

```bash
bun run test src/components/roadmap/animated-curved-timeline-utils.test.ts
```

Expected: pass; TypeScript compile errors in this path are caught by Vitest transform.

- [ ] **Step 7: Record the component rendering change**

Run:

```bash
gt modify -am "Render inline milestone completion nodes"
```

Expected: Graphite records component and README changes.

---

### Task 5: Update Timeline Route State, Demo Data, And Cards

**Files:**
- Modify: `src/routes/demo/timeline/index.tsx`

- [ ] **Step 1: Import schedule helpers and define active selection state**

In `src/routes/demo/timeline/index.tsx`, import:

```ts
import {
  type ActiveMilestoneSelection,
  DEFAULT_MILESTONE_DURATION_DAYS,
  buildMilestoneSpendEvents,
  getMilestoneEndX,
  getMilestonePaymentSchedule,
  normalizeMilestoneTimelineItems,
  resolveDefaultDrawX,
} from "./-timeline-milestone-schedule.ts";
```

Replace active state:

```ts
const [activeSelection, setActiveSelection] =
  useState<ActiveMilestoneSelection>({
    itemId: "rough-in",
    phase: "inProgress",
  });
const activeItemId = activeSelection.itemId;
```

When selecting a milestone start:

```ts
setActiveSelection({ itemId: item.id, phase: "inProgress" });
setProgressValue(item.x);
```

When selecting completion:

```ts
setActiveSelection({ itemId: item.id, phase: "complete" });
setProgressValue(getMilestoneEndX(item));
```

- [ ] **Step 2: Add duration/payment fields to initial data**

Update each `INITIAL_ITEMS` milestone `data`:

```ts
{
  amount: 125_000,
  completionPaymentAmount: 20_000,
  draw: "Draw 1",
  drawX: 36,
  durationDays: 14,
  evidence: "Accepted package",
  icon: "foundation",
  initialPaymentAmount: 25_000,
  name: "Site prep & foundation",
  policy: "Released",
  status: "complete",
  subMilestones: ["Permit mobilization", "Excavation", "Concrete forms"],
}
```

Use these demo defaults for all seven milestones:

```ts
const INITIAL_ITEMS: TimelineItem<DemoMilestone>[] = [
  // x 14, duration 14, initial 25_000, completion 20_000, drawX 36
  // x 58, duration 18, initial 35_000, completion 30_000, drawX 84
  // x 92, duration 20, initial 40_000, completion 50_000, drawX 120
  // x 132, duration 18, initial 35_000, completion 45_000, drawX 158
  // x 168, duration 16, initial 25_000, completion 35_000, drawX 192
  // x 204, duration 12, initial 20_000, completion 30_000, drawX 224
  // x 226, duration 4, initial 0, completion 60_000, drawX 230
];
```

Keep the existing names, icons, evidence, policy, lane, marker label, and tone values.

- [ ] **Step 3: Normalize items whenever insertion or deletion can affect spacing**

Initialize items:

```ts
const [items, setItems] = useState<TimelineItem<DemoMilestone>[]>(() =>
  normalizeMilestoneTimelineItems(INITIAL_ITEMS)
);
```

In `onItemsChange`:

```ts
onItemsChange={(nextItems, details) => {
  const normalizedItems = normalizeMilestoneTimelineItems(nextItems);
  setItems(normalizedItems);
  setDraws((currentDraws) =>
    syncDemoDrawsWithItems(currentDraws, normalizedItems, details.range)
  );
}}
```

In `deleteMilestone`, normalize `nextItems` before setting state.

- [ ] **Step 4: Update inserted milestone defaults**

In `insertion.createItem`, add:

```ts
completionPaymentAmount: 20_000,
durationDays: DEFAULT_MILESTONE_DURATION_DAYS,
initialPaymentAmount: 15_000,
```

Keep `amount`, `draw`, evidence, icon, name, policy, status, and sub-milestones as currently generated.

- [ ] **Step 5: Wire completion nodes into AnimatedCurvedTimeline**

Add props:

```tsx
activeItemPhase={
  activeSelection.phase === "complete" ? "end" : "start"
}
getItemEndValue={getMilestoneEndX}
minInlineNodeSpacingPx={72}
onEndNodeClick={(item) => {
  setActiveSelection({ itemId: item.id, phase: "complete" });
  setProgressValue(getMilestoneEndX(item));
  setSelectedPanelOpen(true);
}}
renderEndNode={(item, context) => (
  <TimelineEndNodeButton
    active={context.active}
    complete={context.complete}
    item={item}
    onClick={() => {
      context.activate();
      setSelectedPanelOpen(true);
    }}
    reducedMotion={Boolean(prefersReducedMotion)}
  />
)}
```

In existing `renderNode`, change click to:

```ts
onClick={() => {
  context.activate();
  setActiveSelection({ itemId: item.id, phase: "inProgress" });
  setProgressValue(item.x);
  setSelectedPanelOpen(true);
}}
```

Update `onActiveItemChange`:

```tsx
onActiveItemChange={(item) => {
  setActiveSelection({ itemId: item.id, phase: "inProgress" });
}}
```

Update the `renderCard` call:

```tsx
renderCard={(item, context) => (
  <TimelineDeleteContextMenu
    kind="milestone"
    onDelete={() => deleteMilestone(item.id)}
  >
    <MilestoneCard
      active={context.active}
      activePhase={activeSelection.phase}
      complete={context.complete}
      item={item}
      reducedMotion={Boolean(prefersReducedMotion)}
    />
  </TimelineDeleteContextMenu>
)}
```

- [ ] **Step 6: Add the end node button component**

Below `TimelineNodeButton`, add:

```tsx
function TimelineEndNodeButton({
  active,
  complete,
  item,
  onClick,
  reducedMotion,
}: {
  active: boolean;
  complete: boolean;
  item: TimelineItem<DemoMilestone>;
  onClick: () => void;
  reducedMotion: boolean;
}) {
  return (
    <motion.button
      aria-label={`Complete ${item.data?.name ?? item.label ?? item.id}`}
      className={cn(
        "grid size-8 place-items-center rounded-full border-2 bg-background text-muted-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        complete &&
          "border-emerald-400 bg-emerald-50 text-emerald-600 ring-4 ring-emerald-500/10 dark:bg-emerald-500/10",
        active &&
          "border-emerald-500 bg-emerald-500 text-white shadow-emerald-500/30 ring-4 ring-emerald-500/20",
        !(active || complete) && "border-zinc-300 dark:border-zinc-700"
      )}
      data-testid={`demo-timeline-end-node-${item.id}`}
      onClick={onClick}
      transition={{ damping: 22, stiffness: 420, type: "spring" }}
      type="button"
      whileHover={reducedMotion ? undefined : { scale: 1.1, y: -2 }}
      whileTap={reducedMotion ? undefined : { scale: 0.9, y: 1 }}
    >
      <Check className="size-4" />
    </motion.button>
  );
}
```

- [ ] **Step 7: Enhance milestone card status and date fields**

Update `MilestoneCard` props:

```ts
function MilestoneCard({
  active,
  activePhase,
  complete,
  item,
  reducedMotion,
}: {
  active: boolean;
  activePhase: ActiveMilestoneSelection["phase"];
  complete: boolean;
  item: TimelineItem<DemoMilestone>;
  reducedMotion: boolean;
}) {
```

Inside the component:

```ts
const schedule = getMilestonePaymentSchedule(item);
const statusLabel = active
  ? activePhase === "complete"
    ? "Complete"
    : "In progress"
  : milestone.status === "complete"
    ? "Complete"
    : milestone.status === "review"
      ? "In review"
      : milestone.status === "ready"
        ? "Ready"
        : "Upcoming";
```

Add a status badge near the heading:

```tsx
<Badge
  data-testid={`timeline-card-status-${item.id}`}
  variant={statusLabel === "Complete" ? "success" : "outline"}
>
  {statusLabel}
</Badge>
```

Replace the date grid with:

```tsx
<div className="grid grid-cols-2 gap-3">
  <div>
    <p className="text-muted-foreground text-xs">Start date</p>
    <p className="mt-1 font-semibold text-sm tabular-nums" data-testid={`timeline-card-start-date-${item.id}`}>
      {formatTimelineDay(item.x)}
    </p>
  </div>
  <div>
    <p className="text-muted-foreground text-xs">Completion date</p>
    <p className="mt-1 font-semibold text-sm tabular-nums" data-testid={`timeline-card-end-date-${item.id}`}>
      {formatTimelineDay(schedule.endX)}
    </p>
  </div>
  <div>
    <p className="text-muted-foreground text-xs">Duration</p>
    <p className="mt-1 font-semibold text-sm tabular-nums">{schedule.durationDays} days</p>
  </div>
  <div>
    <p className="text-muted-foreground text-xs">Daily spend</p>
    <p className="mt-1 font-semibold text-sm tabular-nums">
      {money(schedule.dailyDistributedAmount)}
    </p>
  </div>
</div>
```

Add payment summary:

```tsx
<div className="mt-3 grid grid-cols-2 gap-2 text-xs">
  <div className="rounded-md border border-border bg-muted/35 px-2 py-1.5">
    <p className="text-muted-foreground">Initial</p>
    <p className="font-semibold tabular-nums">{money(schedule.initialPaymentAmount)}</p>
  </div>
  <div className="rounded-md border border-border bg-muted/35 px-2 py-1.5">
    <p className="text-muted-foreground">Completion</p>
    <p className="font-semibold tabular-nums">{money(schedule.completionPaymentAmount)}</p>
  </div>
</div>
```

- [ ] **Step 8: Run route tests and fix compile errors**

Run:

```bash
bun run test src/routes/demo/timeline/-timeline-milestone-schedule.test.ts src/routes/demo/timeline/-timeline-share-snapshot.test.ts
```

Expected: pass schedule and snapshot tests.

- [ ] **Step 9: Record the route state and card change**

Run:

```bash
gt modify -am "Add interval milestone route state and cards"
```

Expected: Graphite records route data, selection, node, and card changes.

---

### Task 6: Implement Interval Cashflow And Completion-Only Draw Availability

**Files:**
- Modify: `src/routes/demo/timeline/index.tsx`
- Modify: `src/routes/demo/timeline/-index.test.ts`

- [ ] **Step 1: Write failing cashflow tests**

In `src/routes/demo/timeline/-index.test.ts`, update `CashflowDatum` fixtures to include `drawCapacityUnlocked: 0`. Add:

```ts
test("interval cashflow spreads milestone spend and unlocks capacity only at completion", () => {
  const items: TimelineItem<DemoMilestone>[] = [
    {
      data: {
        amount: 100_000,
        completionPaymentAmount: 20_000,
        draw: "Draw 1",
        durationDays: 4,
        evidence: "Planning",
        icon: "foundation",
        initialPaymentAmount: 40_000,
        name: "Foundation",
        policy: "Planning",
        status: "ready",
        subMilestones: ["Excavation"],
      },
      id: "foundation",
      x: 10,
    },
  ];

  const data = buildTimelineCashflowData(
    items,
    [],
    [],
    { max: 30, min: 0, unit: "days" },
    150_000
  );

  expect(
    data.map((point) => ({
      budget: point.budget,
      cashOnHand: point.cashOnHand,
      day: point.day,
      drawCapacityUnlocked: point.drawCapacityUnlocked,
      event: point.event,
    }))
  ).toMatchObject([
    { cashOnHand: 150_000, day: 0, event: "start" },
    { budget: 40_000, cashOnHand: 110_000, day: 10, drawCapacityUnlocked: 0 },
    { budget: 10_000, cashOnHand: 100_000, day: 10, drawCapacityUnlocked: 0 },
    { budget: 10_000, cashOnHand: 90_000, day: 11, drawCapacityUnlocked: 0 },
    { budget: 10_000, cashOnHand: 80_000, day: 12, drawCapacityUnlocked: 0 },
    { budget: 10_000, cashOnHand: 70_000, day: 13, drawCapacityUnlocked: 0 },
    { budget: 20_000, cashOnHand: 50_000, day: 14, drawCapacityUnlocked: 100_000 },
  ]);
});

test("draw availability uses completion capacity instead of spend timing", () => {
  const data: CashflowDatum[] = [
    cashflowPoint({
      budget: 40_000,
      cashOnHand: 110_000,
      day: 10,
      drawCapacityUnlocked: 0,
      event: "milestone",
      id: "foundation-initial",
      name: "Foundation initial payment",
    }),
    cashflowPoint({
      budget: 20_000,
      cashOnHand: 50_000,
      day: 14,
      drawCapacityUnlocked: 100_000,
      event: "milestone",
      id: "foundation-complete",
      name: "Foundation completion payment",
    }),
  ];

  expect(buildDrawAvailabilityData(data)).toEqual([
    {
      additionalAvailableDraw: 0,
      day: 10,
      interestBearingDraw: 0,
      name: "Foundation initial payment",
      totalAvailableDraw: 0,
    },
    {
      additionalAvailableDraw: 100_000,
      day: 14,
      interestBearingDraw: 0,
      name: "Foundation completion payment",
      totalAvailableDraw: 100_000,
    },
  ]);
});
```

- [ ] **Step 2: Run cashflow tests and verify they fail**

Run:

```bash
bun run test src/routes/demo/timeline/-index.test.ts
```

Expected: fail because interval cashflow and `drawCapacityUnlocked` are not implemented.

- [ ] **Step 3: Extend CashflowDatum**

In `src/routes/demo/timeline/index.tsx`, update:

```ts
export interface CashflowDatum {
  budget: number;
  capitalSpikeAmount: number;
  cashOnHand: number;
  day: number;
  drawAmount: number;
  drawCapacityUnlocked: number;
  event: "capitalSpike" | "draw" | "milestone" | "start";
  id: string;
  name: string;
  [key: string]: unknown;
}
```

Every `CashflowDatum` object must set `drawCapacityUnlocked`.

- [ ] **Step 4: Replace milestone lump-sum events with spend events**

In `buildTimelineCashflowData`, replace the milestone event section:

```ts
...items
  .filter((item) => item.data)
  .flatMap((item) => {
    const spendEvents = buildMilestoneSpendEvents(item);
    const completionDay = getMilestoneEndX(item);
    const completionEventIds = new Set(
      spendEvents
        .filter((event) => event.day === completionDay)
        .map((event) => event.id)
    );

    if (completionEventIds.size === 0) {
      spendEvents.push({
        amount: 0,
        day: completionDay,
        id: `${item.id}-completion-capacity`,
        kind: "completion",
        label: `${item.data?.name ?? item.label ?? "Milestone"} complete`,
        milestoneAmount: item.data?.amount ?? 0,
        milestoneId: item.id,
        milestoneName: item.data?.name ?? item.label ?? "Milestone",
      });
    }

    return spendEvents.map((event) => ({
      amount: event.amount,
      day: clampNumber(event.day, range.min, range.max),
      drawCapacityUnlocked:
        event.day === completionDay ? event.milestoneAmount : 0,
      id: event.id,
      label: event.label,
      sortOrder: event.kind === "completion" ? 1 : 0,
      type: "milestone" as const,
    }));
  }),
```

When pushing milestone points:

```ts
data.push({
  budget: event.amount,
  capitalSpikeAmount: 0,
  cashOnHand,
  day: event.day,
  drawAmount: 0,
  drawCapacityUnlocked: event.drawCapacityUnlocked,
  event: "milestone",
  id: event.id,
  name: event.label,
});
```

Set `drawCapacityUnlocked: 0` for start, capital spike, and draw points.

- [ ] **Step 5: Update draw availability**

Export `buildDrawAvailabilityData` for tests:

```ts
export function buildDrawAvailabilityData(
  cashflowData: CashflowDatum[]
): DrawAvailabilityDatum[] {
```

Change unlocked draw accumulation:

```ts
unlockedDraw += point.drawCapacityUnlocked;
```

- [ ] **Step 6: Update cash shortfall labels**

Keep the existing function shape but evaluate every milestone spend point:

```ts
if (point.event !== "milestone" || point.budget <= 0) {
  return [];
}
```

No further change is needed because interval spend points still use `event: "milestone"` and carry the milestone spend in `budget`.

- [ ] **Step 7: Run cashflow tests and verify they pass**

Run:

```bash
bun run test src/routes/demo/timeline/-index.test.ts
```

Expected: pass all timeline route unit tests.

- [ ] **Step 8: Record the cashflow model change**

Run:

```bash
gt modify -am "Model timeline cashflow across milestone intervals"
```

Expected: Graphite records interval cashflow and tests.

---

### Task 7: Update Draw Defaults And Share/Reset Plumbing

**Files:**
- Modify: `src/routes/demo/timeline/index.tsx`
- Modify: `src/routes/demo/timeline/-timeline-share-snapshot.ts`
- Modify: `src/routes/demo/timeline/-timeline-share-snapshot.test.ts`

- [ ] **Step 1: Default item draws from completion plus review lag**

In `createDemoDraw`, replace draw date calculation:

```ts
const drawX = clampNumber(
  milestone?.drawX ?? resolveDefaultDrawX(item, range),
  range.min,
  range.max
);
```

- [ ] **Step 2: Preserve custom draw dates during sync**

Keep the existing custom-date branch:

```ts
x: existingDraw.customDate ? existingDraw.x : nextDraw.x,
```

Add this assertion to `-index.test.ts`:

```ts
test("default draw dates follow milestone completion plus review lag", () => {
  const items: TimelineItem<DemoMilestone>[] = [
    {
      data: {
        amount: 100_000,
        draw: "Draw 1",
        durationDays: 10,
        evidence: "Planning",
        icon: "foundation",
        name: "Foundation",
        policy: "Planning",
        status: "ready",
        subMilestones: ["Excavation"],
      },
      id: "foundation",
      x: 20,
    },
  ];

  expect(buildDemoDraws(items, { max: 60, min: 0, unit: "days" })).toEqual([
    {
      amount: 100_000,
      id: "foundation-draw",
      itemId: "foundation",
      label: "Draw 1",
      x: 38,
    },
  ]);
});
```

Export `buildDemoDraws` if it is not already exported.

- [ ] **Step 3: Include active selection in snapshot state**

Update `TimelineShareSnapshotInput` and `TimelineShareState`:

```ts
activeSelection: ActiveMilestoneSelection;
```

Remove `activeItemId` from snapshot input/state types.

Update `initialTimelineShareState` signature:

```ts
export function initialTimelineShareState(
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
  capitalSpikes: DemoCapitalSpike[],
  range: TimelineRange,
  activeSelection: ActiveMilestoneSelection,
  progressValue: number,
  selectedPanelOpen: boolean,
  startingCash: number,
  straightLine: boolean
): TimelineShareState
```

Add a resolver:

```ts
function resolveActiveSelection(
  selection: ActiveMilestoneSelection | undefined,
  items: DemoTimelineSnapshotItem[]
): ActiveMilestoneSelection {
  const itemId = resolveActiveItemId(selection?.itemId ?? "", items);
  return {
    itemId,
    phase: selection?.phase === "complete" ? "complete" : "inProgress",
  };
}
```

- [ ] **Step 4: Update reset and shared snapshot application**

In `useTimelineSnapshotSharing`, replace `setActiveItemId` with:

```ts
setActiveSelection: (value: ActiveMilestoneSelection) => void;
```

On apply:

```ts
setActiveSelection(nextState.activeSelection);
```

On reset:

```ts
setActiveSelection({ itemId: "rough-in", phase: "inProgress" });
```

- [ ] **Step 5: Run snapshot and route tests**

Run:

```bash
bun run test src/routes/demo/timeline/-timeline-share-snapshot.test.ts src/routes/demo/timeline/-index.test.ts
```

Expected: pass snapshot and route tests.

- [ ] **Step 6: Record the draw/share plumbing change**

Run:

```bash
gt modify -am "Wire interval milestones through draws and sharing"
```

Expected: Graphite records draw default and snapshot plumbing changes.

---

### Task 8: Add Playwright Verification

**Files:**
- Modify: `tests/e2e/timeline-demo.spec.ts`

- [ ] **Step 1: Add completion marker rendering and interaction test**

Add:

```ts
test("timeline renders milestone completion nodes and phase-aware cards", async ({
  page,
}) => {
  await page.goto("/demo/timeline");

  await expect(page.getByTestId("demo-timeline-node-rough-in")).toBeVisible();
  await expect(
    page.getByTestId("demo-timeline-end-node-rough-in")
  ).toBeVisible();
  await expect(
    page.getByTestId("timeline-card-connector-rough-in")
  ).toHaveCount(1);
  await expect(
    page.locator('[data-testid="timeline-card-connector-rough-in-end"]')
  ).toHaveCount(0);

  await page.getByTestId("demo-timeline-node-rough-in").click();
  await expect(page.getByTestId("timeline-card-status-rough-in")).toHaveText(
    "In progress"
  );

  await page.getByTestId("demo-timeline-end-node-rough-in").click();
  await expect(page.getByTestId("timeline-card-status-rough-in")).toHaveText(
    "Complete"
  );
  await expect(page.getByTestId("timeline-card-start-date-rough-in")).toHaveText(
    "Day 92"
  );
  await expect(page.getByTestId("timeline-card-end-date-rough-in")).toHaveText(
    "Day 112"
  );
});
```

- [ ] **Step 2: Add completion spacing test**

Add:

```ts
test("timeline completion nodes keep handoff spacing before next starts", async ({
  page,
}) => {
  await page.goto("/demo/timeline");

  const spacing = await page.evaluate(() => {
    const timeline = document.querySelector(
      "[data-testid=animated-curved-timeline]"
    );
    const viewport = timeline?.querySelector(
      "[data-testid=timeline-scroll-viewport]"
    );
    const content = viewport?.firstElementChild;
    if (!(timeline && content)) {
      return null;
    }
    const contentRect = content.getBoundingClientRect();
    const endNode = timeline.querySelector(
      '[data-testid="demo-timeline-end-node-rough-in"]'
    );
    const nextStart = timeline.querySelector(
      '[data-testid="demo-timeline-node-exterior"]'
    );
    if (!(endNode && nextStart)) {
      return null;
    }
    const endRect = endNode.getBoundingClientRect();
    const nextRect = nextStart.getBoundingClientRect();
    return {
      endRight: endRect.right - contentRect.left,
      nextLeft: nextRect.left - contentRect.left,
    };
  });

  expect(spacing).not.toBeNull();
  if (!spacing) {
    return;
  }
  expect(spacing.nextLeft - spacing.endRight).toBeGreaterThanOrEqual(24);
});
```

- [ ] **Step 3: Update existing tests for renamed date ids and changed cash values**

Replace `timeline-card-date-<id>` selectors with:

```ts
timeline-card-start-date-<id>
timeline-card-end-date-<id>
```

Update cashflow/availability expected values only after unit tests define the new interval outputs. Use the values from `buildTimelineCashflowData(INITIAL_ITEMS, buildDemoDraws(...))`, not hand-calculated guesses.

- [ ] **Step 4: Run the timeline e2e spec**

Run:

```bash
bun run test:e2e tests/e2e/timeline-demo.spec.ts
```

Expected: pass all timeline e2e tests.

- [ ] **Step 5: Record the e2e coverage**

Run:

```bash
gt modify -am "Verify timeline milestone completion markers"
```

Expected: Graphite records Playwright test changes.

---

### Task 9: Final Verification And Visual Check

**Files:**
- Verify all modified code and docs.

- [ ] **Step 1: Run full unit tests**

Run:

```bash
bun run test
```

Expected: all Vitest files pass.

- [ ] **Step 2: Run timeline e2e tests**

Run:

```bash
bun run test:e2e tests/e2e/timeline-demo.spec.ts
```

Expected: all timeline Playwright tests pass.

- [ ] **Step 3: Run production build**

Run:

```bash
bun run build
```

Expected: Vite client and SSR builds pass. Existing large chunk warnings are acceptable if no new build error appears.

- [ ] **Step 4: Capture validation screenshots**

Run this from the repo root:

```bash
mkdir -p /tmp/drawflow-timeline-end-date-screenshots
bun -e '
import { chromium } from "playwright";
const outDir = "/tmp/drawflow-timeline-end-date-screenshots";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await page.goto("http://localhost:3000/demo/timeline", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.getByTestId("animated-curved-timeline").waitFor({ timeout: 30000 });
await page.addStyleTag({ content: "*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; caret-color: transparent !important; }" });
await page.getByTestId("demo-timeline-node-rough-in").scrollIntoViewIfNeeded();
await page.getByTestId("animated-curved-timeline").screenshot({ path: `${outDir}/timeline-rough-in-start-end.png`, animations: "disabled", caret: "hide" });
await page.getByTestId("demo-timeline-end-node-rough-in").click();
await page.getByTestId("timeline-card-rough-in").screenshot({ path: `${outDir}/timeline-rough-in-complete-card.png`, animations: "disabled", caret: "hide" });
await browser.close();
console.log(outDir);
'
```

Expected: screenshots show start and completion markers on the rail, and the rough-in card status changes to `Complete`.

- [ ] **Step 5: Inspect git status**

Run:

```bash
git status --short
```

Expected: no unstaged files except intentionally generated screenshots outside the repo.

- [ ] **Step 6: Record final verification state**

Run:

```bash
gt modify -am "Complete timeline milestone end date implementation"
```

Expected: Graphite records final verified implementation state.
