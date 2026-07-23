import { describe, expect, test } from "vitest";

import {
  buildTimelineLayout,
  createCurvedTimelinePath,
  createStraightTimelinePath,
  groupMarkersByProximity,
  insertTimelineItemWithSpacing,
  normalizeTimelineRange,
  resolveTimelineProgressTargetX,
  routePointForX,
  routeProgressForItem,
  roundTimelineValue,
  type TimelineItem,
} from "./animated-curved-timeline-utils";

describe("animated curved timeline utilities", () => {
  test("normalizes invalid ranges and rounds inserted values to the configured step", () => {
    expect(normalizeTimelineRange({ max: 0, min: 10, unit: "days" })).toEqual({
      max: 11,
      min: 10,
      unit: "days",
    });
    expect(roundTimelineValue(42.7, 5)).toBe(45);
  });

  test("builds a curved route and resolves increasing progress by item", () => {
    const items: TimelineItem[] = [
      { id: "foundation", lane: 0, x: 20 },
      { id: "rough-in", lane: 1, x: 60 },
      { id: "closeout", lane: -1, x: 110 },
    ];
    const layout = buildTimelineLayout(items, {
      baselineY: 120,
      laneStepY: 20,
      minNodeSpacingPx: 80,
      paddingX: 64,
      pixelsPerUnit: 6,
      range: { max: 140, min: 0, unit: "days" },
      viewportWidth: 920,
    });
    const path = createCurvedTimelinePath(layout.points);

    expect(path).toContain("C");
    expect(layout.items.map((item) => item.id)).toEqual([
      "foundation",
      "rough-in",
      "closeout",
    ]);
    expect(routeProgressForItem(layout, "closeout")).toBeGreaterThan(
      routeProgressForItem(layout, "foundation")
    );
    expect(createStraightTimelinePath(layout.points)).not.toContain("C");
    expect(createStraightTimelinePath(layout.points)).toContain("L");
    expect(routePointForX(layout.points, layout.items[1].layoutX).y).toBe(
      layout.items[1].layoutY
    );
  });

  test("enforces minimum visual spacing and allows horizontal overflow", () => {
    const layout = buildTimelineLayout(
      [
        { id: "one", x: 10 },
        { id: "two", x: 11 },
        { id: "three", x: 12 },
      ],
      {
        baselineY: 100,
        laneStepY: 18,
        minNodeSpacingPx: 160,
        paddingX: 72,
        pixelsPerUnit: 4,
        range: { max: 30, min: 0, unit: "days" },
        viewportWidth: 360,
      }
    );

    expect(layout.items[1].layoutX - layout.items[0].layoutX).toBeGreaterThanOrEqual(160);
    expect(layout.items[2].layoutX - layout.items[1].layoutX).toBeGreaterThanOrEqual(160);
    expect(layout.contentWidth).toBeGreaterThan(360);
  });

  test("expands scale before spacing nodes so positive day gaps stay proportional", () => {
    const layout = buildTimelineLayout(
      [
        { id: "one", x: 10 },
        { id: "two", x: 20 },
        { id: "three", x: 40 },
      ],
      {
        baselineY: 100,
        laneStepY: 18,
        minNodeSpacingPx: 120,
        paddingX: 72,
        pixelsPerUnit: 2,
        range: { max: 80, min: 0, unit: "days" },
        viewportWidth: 360,
      }
    );
    const firstGap = layout.items[1].layoutX - layout.items[0].layoutX;
    const secondGap = layout.items[2].layoutX - layout.items[1].layoutX;

    expect(firstGap).toBeGreaterThanOrEqual(120);
    expect(secondGap).toBeGreaterThan(firstGap);
    expect(secondGap / firstGap).toBeCloseTo(2, 5);
    expect(layout.items[0].layoutX).toBe(layout.items[0].rawX);
    expect(layout.items[1].layoutX).toBe(layout.items[1].rawX);
    expect(layout.items[2].layoutX).toBe(layout.items[2].rawX);
  });

  test("computes inline end node positions without adding path waypoints", () => {
    const layout = buildTimelineLayout(
      [
        { id: "foundation", x: 10, data: { end: 20 } },
        { id: "framing", lane: 1, x: 30, data: { end: 38 } },
      ],
      {
        baselineY: 100,
        getItemEndValue: (item) => item.data?.end,
        laneStepY: 18,
        minInlineNodeSpacingPx: 48,
        minNodeSpacingPx: 120,
        paddingX: 50,
        pixelsPerUnit: 10,
        range: { max: 50, min: 0, unit: "days" },
        viewportWidth: 0,
      }
    );

    expect(layout.points).toEqual([
      { x: layout.startX, y: layout.baselineY },
      { x: layout.items[0].layoutX, y: layout.items[0].layoutY },
      { x: layout.items[1].layoutX, y: layout.items[1].layoutY },
      { x: layout.endX, y: layout.baselineY },
    ]);
    expect(layout.items[0]).toMatchObject({
      endLayoutX: layout.valueToX(20),
      endRawX: layout.valueToX(20),
      endX: 20,
    });
    expect(layout.items[1]).toMatchObject({
      endLayoutX: layout.valueToX(38),
      endRawX: layout.valueToX(38),
      endX: 38,
    });
    expect(layout.items[0].endLayoutX).toBe(layout.items[0].endRawX);
    expect(layout.items[1].endLayoutX).toBe(layout.items[1].endRawX);
    expect(layout.points).not.toContainEqual({
      x: layout.items[0].endLayoutX,
      y: layout.items[0].layoutY,
    });
  });

  test("targets a duration-backed milestone completion when its start node is selected", () => {
    const layout = buildTimelineLayout(
      [
        { id: "foundation", x: 10, data: { end: 24 } },
        { id: "framing", x: 38, data: { end: 52 } },
      ],
      {
        baselineY: 100,
        getItemEndValue: (item) => item.data?.end,
        laneStepY: 18,
        minInlineNodeSpacingPx: 64,
        minNodeSpacingPx: 120,
        paddingX: 50,
        pixelsPerUnit: 8,
        range: { max: 80, min: 0, unit: "days" },
        viewportWidth: 0,
      },
    );
    const foundation = layout.items[0]!;

    expect(
      resolveTimelineProgressTargetX({
        activeItem: foundation,
        activeItemPhase: "start",
        progressValue: foundation.x,
        startX: layout.startX,
        valueToX: layout.valueToX,
      }),
    ).toBe(foundation.endLayoutX);
  });

  test("keeps start-node progress for timeline items without completion values", () => {
    const layout = buildTimelineLayout(
      [
        { id: "foundation", x: 10 },
        { id: "framing", x: 38 },
      ],
      {
        baselineY: 100,
        laneStepY: 18,
        minNodeSpacingPx: 120,
        paddingX: 50,
        pixelsPerUnit: 8,
        range: { max: 80, min: 0, unit: "days" },
        viewportWidth: 0,
      },
    );
    const foundation = layout.items[0]!;

    expect(
      resolveTimelineProgressTargetX({
        activeItem: foundation,
        activeItemPhase: "start",
        progressValue: foundation.x,
        startX: layout.startX,
        valueToX: layout.valueToX,
      }),
    ).toBe(foundation.layoutX);
  });

  test("scales for inline completion-to-next-start spacing separately from card spacing", () => {
    const layout = buildTimelineLayout(
      [
        { id: "one", x: 10, data: { end: 20 } },
        { id: "two", x: 21, data: { end: 28 } },
      ],
      {
        baselineY: 100,
        getItemEndValue: (item) => item.data?.end,
        laneStepY: 18,
        minInlineNodeSpacingPx: 96,
        minNodeSpacingPx: 12,
        paddingX: 0,
        pixelsPerUnit: 1,
        range: { max: 30, min: 0, unit: "days" },
        viewportWidth: 0,
      }
    );

    expect(layout.axisWidth).toBeCloseTo(2_880, 5);
    expect(layout.items[1].layoutX - layout.items[0].endLayoutX!).toBeCloseTo(
      96,
      5
    );
    expect(layout.items[1].layoutX - layout.items[0].layoutX).toBeGreaterThan(
      12
    );
    expect(layout.items[0].layoutX).toBe(layout.items[0].rawX);
    expect(layout.items[1].layoutX).toBe(layout.items[1].rawX);
  });

  test("uses default inline spacing when inline spacing option is omitted", () => {
    const layout = buildTimelineLayout(
      [
        { id: "one", x: 10, data: { end: 20 } },
        { id: "two", x: 21, data: { end: 28 } },
      ],
      {
        baselineY: 100,
        getItemEndValue: (item) => item.data?.end,
        laneStepY: 18,
        minNodeSpacingPx: 12,
        paddingX: 0,
        pixelsPerUnit: 1,
        range: { max: 30, min: 0, unit: "days" },
        viewportWidth: 0,
      }
    );

    expect(layout.axisWidth).toBeCloseTo(1_440, 5);
    expect(layout.items[0].endLayoutX).toBe(layout.items[0].endRawX);
    expect(layout.items[0].endLayoutX).toBe(layout.valueToX(20));
    expect(layout.items[1].layoutX - layout.items[0].endLayoutX!).toBeCloseTo(
      48,
      5
    );
  });

  test("preserves start-only layout when end value callback is omitted", () => {
    const layout = buildTimelineLayout(
      [
        { id: "one", x: 10 },
        { id: "two", x: 11 },
      ],
      {
        baselineY: 100,
        laneStepY: 18,
        minNodeSpacingPx: 12,
        paddingX: 0,
        pixelsPerUnit: 1,
        range: { max: 30, min: 0, unit: "days" },
        viewportWidth: 0,
      }
    );

    expect(layout.axisWidth).toBe(360);
    expect(layout.items[0].endLayoutX).toBeUndefined();
    expect(layout.items[0].endRawX).toBeUndefined();
    expect(layout.items[0].endX).toBeUndefined();
    expect(layout.items[1].layoutX - layout.items[0].layoutX).toBe(12);
  });

  test("maps visually shifted node positions back to their source days", () => {
    const layout = buildTimelineLayout(
      [
        { id: "one", x: 10 },
        { id: "two", x: 10 },
        { id: "three", x: 22 },
      ],
      {
        baselineY: 100,
        laneStepY: 18,
        minNodeSpacingPx: 160,
        paddingX: 0,
        pixelsPerUnit: 1,
        range: { max: 40, min: 0, unit: "days" },
        viewportWidth: 0,
      }
    );
    const shiftedItem = layout.items[1];

    expect(shiftedItem.layoutX).toBeGreaterThan(shiftedItem.rawX);
    expect(layout.xToValue(shiftedItem.layoutX)).toBe(shiftedItem.x);
    expect(layout.xToValue(layout.items[0].layoutX)).toBe(10);
    expect(layout.xToValue(layout.items[2].layoutX)).toBe(22);
  });

  test("keeps shifted inline end marker after its own shifted start", () => {
    const layout = buildTimelineLayout(
      [
        { id: "one", x: 10, data: { end: 20 } },
        { id: "two", x: 10, data: { end: 11 } },
      ],
      {
        baselineY: 100,
        getItemEndValue: (item) => item.data?.end,
        laneStepY: 18,
        minInlineNodeSpacingPx: 48,
        minNodeSpacingPx: 120,
        paddingX: 0,
        pixelsPerUnit: 10,
        range: { max: 30, min: 0, unit: "days" },
        viewportWidth: 0,
      }
    );
    const shiftedItem = layout.items[1];

    expect(shiftedItem.layoutX).toBeGreaterThan(shiftedItem.rawX);
    expect(shiftedItem.endRawX).toBe(layout.valueToX(11));
    expect(shiftedItem.endRawX).toBeLessThan(shiftedItem.layoutX);
    expect(shiftedItem.endLayoutX).toBe(
      shiftedItem.layoutX + 48
    );
    expect(layout.points).toEqual([
      { x: layout.startX, y: layout.baselineY },
      { x: layout.items[0].layoutX, y: layout.items[0].layoutY },
      { x: shiftedItem.layoutX, y: shiftedItem.layoutY },
      { x: layout.endX, y: layout.baselineY },
    ]);
  });

  test("groups marker stacks by rendered pixel proximity", () => {
    const stacks = groupMarkersByProximity(
      [
        { id: "today", label: "Today", x: 0 },
        { id: "draw-1", label: "Draw 1", x: 8 },
        { id: "draw-2", label: "Draw 2", x: 30 },
      ],
      (value) => value * 4,
      40
    );

    expect(stacks).toHaveLength(2);
    expect(stacks[0]).toMatchObject({
      id: "today__draw-1",
      members: [
        { layoutX: 0, marker: { id: "today" }, valueX: 0 },
        { layoutX: 32, marker: { id: "draw-1" }, valueX: 8 },
      ],
    });
    expect(stacks[0].anchorX).toBe(16);
    expect(stacks[1]).toMatchObject({
      id: "draw-2",
      members: [{ layoutX: 120, marker: { id: "draw-2" }, valueX: 30 }],
    });
  });

  test("forms transitive marker chains within the proximity threshold", () => {
    const stacks = groupMarkersByProximity(
      [
        { id: "one", label: "One", x: 0 },
        { id: "two", label: "Two", x: 10 },
        { id: "three", label: "Three", x: 20 },
      ],
      (value) => value * 4,
      40
    );

    expect(stacks).toHaveLength(1);
    expect(stacks[0].members.map((member) => member.marker.id)).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  test("keeps non-transitive marker gaps in separate stacks", () => {
    const stacks = groupMarkersByProximity(
      [
        { id: "one", label: "One", x: 0 },
        { id: "two", label: "Two", x: 10 },
        { id: "three", label: "Three", x: 25 },
      ],
      (value) => value * 4,
      40
    );

    expect(stacks).toHaveLength(2);
    expect(stacks[0].members.map((member) => member.marker.id)).toEqual([
      "one",
      "two",
    ]);
    expect(stacks[1].members.map((member) => member.marker.id)).toEqual([
      "three",
    ]);
  });

  test("inserts a node and shifts later nodes to preserve unit spacing", () => {
    const result = insertTimelineItemWithSpacing(
      [
        { id: "draw-1", x: 10 },
        { id: "draw-2", x: 24 },
        { id: "draw-3", x: 30 },
      ],
      { id: "inserted", x: 25 },
      {
        minGap: 12,
        range: { max: 48, min: 0, unit: "days" },
      }
    );

    expect(result.insertedItem.x).toBe(36);
    expect(result.items.map((item) => [item.id, item.x])).toEqual([
      ["draw-1", 10],
      ["draw-2", 24],
      ["inserted", 36],
      ["draw-3", 48],
    ]);
    expect(result.range.max).toBe(48);
  });
});
