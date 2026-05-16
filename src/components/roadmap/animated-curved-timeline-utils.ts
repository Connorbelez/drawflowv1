export type TimelineItemTone =
  | "active"
  | "blocked"
  | "complete"
  | "upcoming"
  | "warning";

export interface TimelineRange {
  max: number;
  min: number;
  unit?: string;
}

export interface TimelineItem<TData = unknown> {
  data?: TData;
  disabled?: boolean;
  eyebrow?: string;
  id: string;
  label?: string;
  lane?: number;
  markerLabel?: string;
  tone?: TimelineItemTone;
  x: number;
}

export type TimelineMarkerTone = "accent" | "neutral" | "today" | "warning";

export interface TimelineMarker {
  id: string;
  label: string;
  sublabel?: string;
  tone?: TimelineMarkerTone;
  x: number;
}

export interface TimelineRoutePoint {
  x: number;
  y: number;
}

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

export interface TimelineLayout<TData = unknown> {
  axisWidth: number;
  baselineY: number;
  contentWidth: number;
  endX: number;
  items: TimelineLayoutItem<TData>[];
  points: TimelineRoutePoint[];
  range: Required<TimelineRange>;
  startX: number;
  valueToX: (value: number) => number;
  xToValue: (x: number) => number;
}

export interface TimelineInsertionOptions {
  minGap: number;
  range: TimelineRange;
}

export interface TimelineInsertionResult<TData = unknown> {
  insertedItem: TimelineItem<TData>;
  items: TimelineItem<TData>[];
  range: Required<TimelineRange>;
}

const MINIMUM_RANGE_SPAN = 1;

export function clampTimelineValue(
  value: number,
  min: number,
  max: number
): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

export function normalizeTimelineRange(
  range: TimelineRange
): Required<TimelineRange> {
  const min = Number.isFinite(range.min) ? range.min : 0;
  const rawMax = Number.isFinite(range.max) ? range.max : min + 1;
  const max = rawMax > min ? rawMax : min + MINIMUM_RANGE_SPAN;

  return {
    max,
    min,
    unit: range.unit ?? "",
  };
}

export function normalizeTimelineValue(
  value: number,
  range: TimelineRange
): number {
  const normalizedRange = normalizeTimelineRange(range);
  const clamped = clampTimelineValue(
    value,
    normalizedRange.min,
    normalizedRange.max
  );

  return (
    (clamped - normalizedRange.min) /
    (normalizedRange.max - normalizedRange.min)
  );
}

export function roundTimelineValue(value: number, step = 1): number {
  if (!(Number.isFinite(step) && step > 0)) {
    return value;
  }

  return Number((Math.round(value / step) * step).toFixed(6));
}

export function buildTimelineLayout<TData>(
  items: TimelineItem<TData>[],
  options: TimelineLayoutOptions<TData>
): TimelineLayout<TData> {
  const range = normalizeTimelineRange(options.range);
  const paddingX = Math.max(0, options.paddingX);
  const minInlineNodeSpacingPx = Math.max(
    0,
    options.minInlineNodeSpacingPx ?? 48
  );
  const minNodeSpacingPx = Math.max(0, options.minNodeSpacingPx);
  const sortedItems = [...items]
    .map((item, inputIndex) => ({ inputIndex, item }))
    .sort((a, b) => a.item.x - b.item.x || a.inputIndex - b.inputIndex);
  const itemEndValues = new Map<string, number>();

  for (const { inputIndex, item } of sortedItems) {
    const itemEndValue = options.getItemEndValue?.(item);

    if (
      itemEndValue == null ||
      !Number.isFinite(itemEndValue) ||
      itemEndValue <= item.x
    ) {
      continue;
    }

    itemEndValues.set(
      getTimelineLayoutEntryKey(inputIndex, item),
      clampTimelineValue(itemEndValue, range.min, range.max)
    );
  }

  const minimumSpacingAxisWidth = getMinimumSpacingAxisWidth(
    sortedItems.map(({ item }) => item.x),
    range,
    minNodeSpacingPx
  );
  const minimumInlineSpacingAxisWidth = getMinimumSpacingAxisWidth(
    itemEndValues.size === 0
      ? []
      : [
          ...sortedItems.map(({ item }) => item.x),
          ...itemEndValues.values(),
        ].sort((a, b) => a - b),
    range,
    minInlineNodeSpacingPx
  );
  const requestedAxisWidth =
    (range.max - range.min) * Math.max(1, options.pixelsPerUnit);
  const viewportAxisWidth = Math.max(
    1,
    Math.max(0, options.viewportWidth) - paddingX * 2
  );
  const axisWidth = Math.max(
    requestedAxisWidth,
    viewportAxisWidth,
    minimumSpacingAxisWidth,
    minimumInlineSpacingAxisWidth
  );
  const valueToX = (value: number) =>
    paddingX + normalizeTimelineValue(value, range) * axisWidth;
  const xToValue = (x: number) => {
    const normalized = clampTimelineValue((x - paddingX) / axisWidth, 0, 1);

    return range.min + normalized * (range.max - range.min);
  };
  let contentWidth = axisWidth + paddingX * 2;
  let previousLayoutX = Number.NEGATIVE_INFINITY;

  const layoutItems = sortedItems.map(({ inputIndex, item }, order) => {
    const normalized = normalizeTimelineValue(item.x, range);
    const rawX = paddingX + normalized * axisWidth;
    const layoutX = Math.max(rawX, previousLayoutX + minNodeSpacingPx);
    const endX = itemEndValues.get(getTimelineLayoutEntryKey(inputIndex, item));
    const endRawX = endX == null ? undefined : valueToX(endX);
    const startShiftX = layoutX - rawX;
    const endLayoutX =
      endRawX == null
        ? undefined
        : Math.max(endRawX + startShiftX, layoutX + minInlineNodeSpacingPx);
    const lane = item.lane ?? 0;

    previousLayoutX = layoutX;
    contentWidth = Math.max(
      contentWidth,
      layoutX + paddingX,
      endLayoutX == null ? 0 : endLayoutX + paddingX
    );

    return {
      ...item,
      endLayoutX,
      endRawX,
      endX,
      layoutX,
      layoutY: options.baselineY + lane * options.laneStepY,
      normalized,
      order,
      rawX,
      sourceIndex: inputIndex,
    };
  });

  const startX = paddingX;
  const endX = Math.max(contentWidth - paddingX, startX + axisWidth);
  const points: TimelineRoutePoint[] = [
    { x: startX, y: options.baselineY },
    ...layoutItems.map((item) => ({ x: item.layoutX, y: item.layoutY })),
    { x: endX, y: options.baselineY },
  ];

  return {
    axisWidth,
    baselineY: options.baselineY,
    contentWidth,
    endX,
    items: layoutItems,
    points,
    range,
    startX,
    valueToX,
    xToValue,
  };
}

function getTimelineLayoutEntryKey<TData>(
  inputIndex: number,
  item: TimelineItem<TData>
): string {
  return `${inputIndex}:${item.id}`;
}

function getMinimumSpacingAxisWidth(
  sortedValues: number[],
  range: Required<TimelineRange>,
  minNodeSpacingPx: number
): number {
  if (sortedValues.length < 2 || minNodeSpacingPx <= 0) {
    return 0;
  }

  const rangeSpan = range.max - range.min;
  let requiredAxisWidth = 0;
  let previousValue = clampTimelineValue(sortedValues[0], range.min, range.max);

  for (const value of sortedValues.slice(1)) {
    const nextValue = clampTimelineValue(value, range.min, range.max);
    const delta = nextValue - previousValue;

    if (delta > 0) {
      requiredAxisWidth = Math.max(
        requiredAxisWidth,
        (minNodeSpacingPx * rangeSpan) / delta
      );
    }

    previousValue = nextValue;
  }

  return requiredAxisWidth;
}

export function createCurvedTimelinePath(points: TimelineRoutePoint[]): string {
  if (points.length === 0) {
    return "";
  }

  const [firstPoint] = points;
  const commands = [
    `M ${formatPathNumber(firstPoint.x)} ${formatPathNumber(firstPoint.y)}`,
  ];

  for (let index = 1; index < points.length; index += 1) {
    const previousPoint = points[index - 1];
    const point = points[index];
    const deltaX = point.x - previousPoint.x;
    if (deltaX === 0 && point.y === previousPoint.y) {
      continue;
    }
    const tension = Math.min(96, Math.max(24, Math.abs(deltaX) * 0.42));
    const controlOneX = previousPoint.x + tension;
    const controlTwoX = point.x - tension;

    commands.push(
      [
        "C",
        formatPathNumber(controlOneX),
        formatPathNumber(previousPoint.y),
        formatPathNumber(controlTwoX),
        formatPathNumber(point.y),
        formatPathNumber(point.x),
        formatPathNumber(point.y),
      ].join(" ")
    );
  }

  return commands.join(" ");
}

export function createStraightTimelinePath(
  points: TimelineRoutePoint[]
): string {
  if (points.length === 0) {
    return "";
  }

  const baselineY = points[0].y;
  const [firstPoint, ...remainingPoints] = points;
  const commands = [
    `M ${formatPathNumber(firstPoint.x)} ${formatPathNumber(baselineY)}`,
  ];
  let previousX = firstPoint.x;

  for (const point of remainingPoints) {
    if (point.x === previousX) {
      continue;
    }
    commands.push(
      `L ${formatPathNumber(point.x)} ${formatPathNumber(baselineY)}`
    );
    previousX = point.x;
  }

  return commands.join(" ");
}

export function routePointForX(
  points: TimelineRoutePoint[],
  targetX: number
): TimelineRoutePoint {
  if (points.length === 0) {
    return { x: targetX, y: 0 };
  }

  const [firstPoint] = points;
  if (targetX <= firstPoint.x) {
    return firstPoint;
  }

  for (let index = 1; index < points.length; index += 1) {
    const previousPoint = points[index - 1];
    const point = points[index];

    if (targetX <= point.x) {
      const segmentRatio =
        point.x === previousPoint.x
          ? 1
          : (targetX - previousPoint.x) / (point.x - previousPoint.x);

      return {
        x: targetX,
        y: previousPoint.y + (point.y - previousPoint.y) * segmentRatio,
      };
    }
  }

  return points.at(-1) ?? firstPoint;
}

export function routeProgressForX(
  points: TimelineRoutePoint[],
  targetX: number
): number {
  if (points.length < 2) {
    return 1;
  }

  const totalDistance = routeDistance(points);
  if (totalDistance === 0) {
    return 1;
  }

  let travelled = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previousPoint = points[index - 1];
    const point = points[index];

    if (targetX <= previousPoint.x) {
      return clampTimelineValue(travelled / totalDistance, 0, 1);
    }

    if (targetX <= point.x) {
      const segmentRatio =
        point.x === previousPoint.x
          ? 1
          : (targetX - previousPoint.x) / (point.x - previousPoint.x);
      const partialPoint = {
        x: targetX,
        y: previousPoint.y + (point.y - previousPoint.y) * segmentRatio,
      };

      travelled += distanceBetween(previousPoint, partialPoint);

      return clampTimelineValue(travelled / totalDistance, 0, 1);
    }

    travelled += distanceBetween(previousPoint, point);
  }

  return 1;
}

export function routeProgressForItem<TData>(
  layout: TimelineLayout<TData>,
  itemId: string | null | undefined
): number {
  if (!itemId) {
    return 0;
  }

  const item = layout.items.find((candidate) => candidate.id === itemId);

  return item ? routeProgressForX(layout.points, item.layoutX) : 0;
}

export function insertTimelineItemWithSpacing<TData>(
  items: TimelineItem<TData>[],
  item: TimelineItem<TData>,
  options: TimelineInsertionOptions
): TimelineInsertionResult<TData> {
  const range = normalizeTimelineRange(options.range);
  const minGap = Math.max(0, options.minGap);
  const inserted = {
    ...item,
    x: clampTimelineValue(item.x, range.min, range.max),
  };
  const entries = [
    ...items.map((entry, inputIndex) => ({
      inputIndex,
      inserted: false,
      item: entry,
    })),
    {
      inputIndex: Number.MAX_SAFE_INTEGER,
      inserted: true,
      item: inserted,
    },
  ].sort((a, b) => {
    if (a.item.x !== b.item.x) {
      return a.item.x - b.item.x;
    }
    if (a.inserted !== b.inserted) {
      return a.inserted ? -1 : 1;
    }

    return a.inputIndex - b.inputIndex;
  });

  let previousX = range.min - minGap;
  let insertedItem = inserted;
  const spacedItems = entries.map((entry) => {
    const nextX = Math.max(entry.item.x, previousX + minGap, range.min);
    const nextItem = { ...entry.item, x: nextX };

    previousX = nextX;
    if (entry.inserted) {
      insertedItem = nextItem;
    }

    return nextItem;
  });
  const nextMax = Math.max(range.max, ...spacedItems.map((entry) => entry.x));

  return {
    insertedItem,
    items: spacedItems,
    range: {
      ...range,
      max: nextMax,
    },
  };
}

function distanceBetween(
  firstPoint: TimelineRoutePoint,
  secondPoint: TimelineRoutePoint
): number {
  return Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y);
}

function routeDistance(points: TimelineRoutePoint[]): number {
  return points.reduce((total, point, index) => {
    if (index === 0) {
      return total;
    }

    return total + distanceBetween(points[index - 1], point);
  }, 0);
}

function formatPathNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}
