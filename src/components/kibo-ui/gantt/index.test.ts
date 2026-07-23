import { describe, expect, test } from "vitest";

import {
  getGanttFeatureDragResolution,
  type GanttContextProps,
} from "./index.tsx";

describe("getGanttFeatureDragResolution", () => {
  test("resolves a horizontal drag into preview dates without mutating the original range", () => {
    const startAt = new Date(2026, 0, 10);
    const endAt = new Date(2026, 0, 15);

    const result = getGanttFeatureDragResolution({
      context: ganttContext,
      endAt,
      pixelDelta: 100,
      startAt,
    });

    expect(result).toEqual({
      deltaDays: 2,
      endAt: new Date(2026, 0, 17),
      startAt: new Date(2026, 0, 12),
    });
    expect(startAt).toEqual(new Date(2026, 0, 10));
    expect(endAt).toEqual(new Date(2026, 0, 15));
  });
});

const ganttContext: GanttContextProps = {
  columnWidth: 50,
  headerHeight: 60,
  onAddItem: undefined,
  placeholderLength: 2,
  range: "daily",
  ref: null,
  rowGap: 16,
  rowHeight: 36,
  scrollToFeature: undefined,
  setRowGap: () => undefined,
  setRowHeight: () => undefined,
  sidebarWidth: 0,
  timelineData: [
    { quarters: [{ months: [{ days: 31 }] }], year: 2025 },
    { quarters: [{ months: [{ days: 31 }] }], year: 2026 },
    { quarters: [{ months: [{ days: 31 }] }], year: 2027 },
  ],
  zoom: 100,
};
