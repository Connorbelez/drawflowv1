import { describe, expect, test } from "vitest";

import {
  buildTimelineLayout,
  createCurvedTimelinePath,
  createStraightTimelinePath,
  insertTimelineItemWithSpacing,
  normalizeTimelineRange,
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
