"use client";

import { Check, Circle, CircleDot, Plus } from "lucide-react";
import type {
  MouseEvent,
  PointerEvent,
  ReactElement,
} from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#/components/ui/context-menu.tsx";
import { cn } from "#/lib/utils.ts";
import type {
  TimelineContextMenuAction,
} from "./animated-curved-timeline-contracts.ts";
import type {
  TimelineLayout,
  TimelineLayoutItem,
  TimelineMarker,
  TimelineRange,
} from "./animated-curved-timeline-utils.ts";

const DEFAULT_BASELINE_Y = 164;
const HOVER_DOT_COLLISION_HIDDEN_SCALE = 0.58;
const HOVER_DOT_COLLISION_EXPONENT = 2.35;

export interface PathMetricSample {
  length: number;
  x: number;
  y: number;
}

export interface PathMetrics {
  samples: PathMetricSample[];
  totalLength: number;
}

export interface PathPoint {
  distance: number;
  x: number;
  y: number;
}

export interface NodeBounds {
  bottom: number;
  centerX: number;
  centerY: number;
  id: string;
  innerRadius: number;
  left: number;
  outerRadius: number;
  right: number;
  top: number;
}

export interface HoverDotVisualState {
  opacity: number;
  scale: number;
}

interface TimelineInsertMenuProps<TData = unknown> {
  canInsertItem: boolean;
  contextMenu: { requestedX: number } | null;
  customActions: TimelineContextMenuAction<TData>[];
  formatValue: (value: number, range: Required<TimelineRange>) => string;
  handleContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
  insertionLabel?: string;
  laneStepY: number;
  onAction: (action: TimelineContextMenuAction<TData>) => void;
  onInsert: () => void;
  onPointerMove: (
    event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>
  ) => void;
  range: Required<TimelineRange>;
  top: number;
}

export function createPathMetrics(pathElement: SVGPathElement): PathMetrics {
  let totalLength = 1;

  try {
    totalLength = Math.max(1, pathElement.getTotalLength());
  } catch {
    return {
      samples: [{ length: 0, x: 0, y: DEFAULT_BASELINE_Y }],
      totalLength,
    };
  }

  const sampleCount = Math.min(800, Math.max(120, Math.ceil(totalLength / 6)));
  const samples = Array.from({ length: sampleCount + 1 }, (_, index) => {
    const length = (totalLength * index) / sampleCount;
    const point = pathElement.getPointAtLength(length);

    return { length, x: point.x, y: point.y };
  });

  return { samples, totalLength };
}

export function getPathDistanceAtX(
  metrics: PathMetrics,
  targetX: number
): number {
  return getPathPointAtX(metrics, targetX).distance;
}

export function getPathPointAtX(
  metrics: PathMetrics,
  targetX: number
): PathPoint {
  const { samples } = metrics;
  if (samples.length === 0) {
    return { distance: 0, x: targetX, y: DEFAULT_BASELINE_Y };
  }

  const firstSample = samples[0];
  const lastSample = samples.at(-1) ?? firstSample;

  if (targetX <= firstSample.x) {
    return {
      distance: firstSample.length,
      x: firstSample.x,
      y: firstSample.y,
    };
  }

  if (targetX >= lastSample.x) {
    return {
      distance: lastSample.length,
      x: lastSample.x,
      y: lastSample.y,
    };
  }

  let low = 0;
  let high = samples.length - 1;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);

    if (samples[middle].x < targetX) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  const nextSample = samples[low];
  const previousSample = samples[Math.max(0, low - 1)];
  const segmentWidth = nextSample.x - previousSample.x;
  const segmentRatio =
    segmentWidth === 0 ? 0 : (targetX - previousSample.x) / segmentWidth;

  const clampedSegmentRatio = Math.min(Math.max(segmentRatio, 0), 1);

  return {
    distance:
      previousSample.length +
      (nextSample.length - previousSample.length) * clampedSegmentRatio,
    x:
      previousSample.x +
      (nextSample.x - previousSample.x) * clampedSegmentRatio,
    y:
      previousSample.y +
      (nextSample.y - previousSample.y) * clampedSegmentRatio,
  };
}

export function clampPathDistance(
  distance: number,
  metrics: PathMetrics
): number {
  return Math.min(Math.max(distance, 0), metrics.totalLength);
}

export function getHoverDotVisualStateAtDistance(
  distance: number,
  pathElement: SVGPathElement | null,
  metrics: PathMetrics | null,
  nodeBounds: NodeBounds[]
): HoverDotVisualState {
  if (!(pathElement && metrics)) {
    return { opacity: 1, scale: 1 };
  }

  const point = pathElement.getPointAtLength(
    clampPathDistance(distance, metrics)
  );

  return getHoverDotVisualState(
    { distance, x: point.x, y: point.y },
    nodeBounds
  );
}

function getHoverDotVisualState(
  point: PathPoint,
  nodeBounds: NodeBounds[]
): HoverDotVisualState {
  return nodeBounds.reduce<HoverDotVisualState>(
    (state, bounds) => {
      const distanceFromCenter = Math.hypot(
        point.x - bounds.centerX,
        point.y - bounds.centerY
      );

      if (distanceFromCenter >= bounds.outerRadius) {
        return state;
      }

      const fadeSpan = Math.max(1, bounds.outerRadius - bounds.innerRadius);
      const normalizedDistance = Math.min(
        Math.max((distanceFromCenter - bounds.innerRadius) / fadeSpan, 0),
        1
      );
      const acceleratedOpacity =
        normalizedDistance ** HOVER_DOT_COLLISION_EXPONENT;
      const acceleratedScale =
        HOVER_DOT_COLLISION_HIDDEN_SCALE +
        (1 - HOVER_DOT_COLLISION_HIDDEN_SCALE) * acceleratedOpacity;

      return {
        opacity: Math.min(state.opacity, acceleratedOpacity),
        scale: Math.min(state.scale, acceleratedScale),
      };
    },
    { opacity: 1, scale: 1 }
  );
}

export function TimelineInsertMenu<TData = unknown>({
  canInsertItem,
  contextMenu,
  customActions,
  formatValue,
  handleContextMenu,
  insertionLabel,
  laneStepY,
  onAction,
  onInsert,
  onPointerMove,
  range,
  top,
}: TimelineInsertMenuProps<TData>): ReactElement {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <button
            aria-label="Timeline insertion rail"
            className="pointer-events-auto absolute inset-x-0 z-[5] cursor-default border-0 bg-transparent p-0"
            data-testid="timeline-track-hit-area"
            onContextMenu={handleContextMenu}
            onMouseMove={onPointerMove}
            onPointerMove={onPointerMove}
            style={{
              height: laneStepY * 4 + 64,
              top,
            }}
            tabIndex={-1}
            type="button"
          />
        }
      />
      {contextMenu && (
        <ContextMenuContent
          className="max-h-[calc(100vh-1rem)] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain p-2 shadow-2xl"
          data-testid="timeline-insert-menu"
          side="right"
          sideOffset={6}
        >
          <div className="px-2 pb-2" role="presentation">
            <span className="block font-medium text-[10px] text-muted-foreground uppercase">
              Insert on roadmap
            </span>
            <span className="mt-1 block font-semibold text-foreground text-sm">
              {formatValue(contextMenu.requestedX, range)}
            </span>
          </div>
          {canInsertItem && (
            <ContextMenuItem
              className="flex min-h-12 items-start gap-3 px-2.5 py-2 text-sm"
              onClick={onInsert}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-600">
                <Plus className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {insertionLabel ?? "Insert milestone"}
                </span>
                <span className="mt-0.5 block truncate text-muted-foreground text-xs">
                  Shift later milestones if spacing is tight
                </span>
              </span>
            </ContextMenuItem>
          )}
          {customActions.length > 0 && canInsertItem && (
            <ContextMenuSeparator />
          )}
          {customActions.map((action) => (
            <ContextMenuItem
              className="flex min-h-12 items-start gap-3 px-2.5 py-2 text-sm"
              key={action.id}
              onClick={() => onAction(action)}
              variant={
                action.tone === "destructive" ? "destructive" : "default"
              }
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-md border",
                  action.tone === "destructive"
                    ? "border-destructive/25 bg-destructive/10 text-destructive"
                    : "border-rose-500/20 bg-rose-500/10 text-rose-600"
                )}
              >
                {action.icon ?? <Plus className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{action.label}</span>
                <span className="mt-0.5 block truncate text-muted-foreground text-xs">
                  {action.description ??
                    formatValue(contextMenu.requestedX, range)}
                </span>
              </span>
            </ContextMenuItem>
          ))}
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}

export function TimelineGrid<TData>({
  formatValue,
  layout,
  markerCount,
}: {
  formatValue: (value: number, range: Required<TimelineRange>) => string;
  layout: TimelineLayout<TData>;
  markerCount: number;
}): ReactElement {
  const markers = Array.from({ length: markerCount }, (_, index) => {
    const ratio = markerCount === 1 ? 0 : index / (markerCount - 1);
    const x = layout.startX + ratio * layout.axisWidth;
    const value =
      layout.range.min + ratio * (layout.range.max - layout.range.min);

    return { id: `${index}-${value}`, value, x };
  });

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
    >
      {markers.map((marker) => (
        <div
          className="absolute top-0 h-full border-zinc-200/80 border-l border-dashed dark:border-zinc-800"
          key={marker.id}
          style={{ left: marker.x }}
        >
          <span className="absolute top-[184px] left-2 whitespace-nowrap font-medium text-[10px] text-muted-foreground">
            {formatValue(marker.value, layout.range)}
          </span>
        </div>
      ))}
      <div
        className="absolute right-0 left-0 border-zinc-200 border-t dark:border-zinc-800"
        style={{ top: layout.baselineY }}
      />
    </div>
  );
}

export function DefaultMarker({
  marker,
}: {
  marker: TimelineMarker;
}): ReactElement {
  const toneClass = {
    accent:
      "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100",
    neutral: "border-border bg-background text-foreground dark:bg-zinc-950/80",
    today:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100",
    warning:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
  }[marker.tone ?? "neutral"];

  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          "rounded-md border px-2.5 py-1 text-center shadow-sm backdrop-blur",
          toneClass
        )}
      >
        <div className="whitespace-nowrap font-semibold text-xs">
          {marker.label}
        </div>
        {marker.sublabel && (
          <div className="whitespace-nowrap text-[10px] text-muted-foreground">
            {marker.sublabel}
          </div>
        )}
      </div>
    </div>
  );
}

export function DefaultNode<TData>({
  active,
  complete,
  item,
  onClick,
}: {
  active: boolean;
  complete: boolean;
  item: TimelineLayoutItem<TData>;
  onClick: () => void;
}): ReactElement {
  const status = active ? "active" : complete ? "complete" : item.tone;
  const toneClass = {
    active:
      "border-rose-500 bg-rose-500 text-white shadow-rose-500/35 ring-4 ring-rose-500/15",
    blocked:
      "border-red-400 bg-red-50 text-red-600 ring-4 ring-red-500/10 dark:bg-red-500/10",
    complete:
      "border-emerald-400 bg-emerald-50 text-emerald-600 ring-4 ring-emerald-500/10 dark:bg-emerald-500/10",
    upcoming:
      "border-zinc-300 bg-background text-zinc-500 ring-4 ring-zinc-400/10 dark:border-zinc-700",
    warning:
      "border-amber-400 bg-amber-50 text-amber-700 ring-4 ring-amber-500/10 dark:bg-amber-500/10",
  }[status ?? "upcoming"];
  const Icon = active ? CircleDot : complete ? Check : Circle;

  return (
    <button
      aria-label={`Set progress to ${item.label ?? item.id}`}
      className={cn(
        "group relative grid size-8 place-items-center rounded-full border-2 shadow-sm outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        item.disabled && "pointer-events-none opacity-50",
        toneClass
      )}
      data-testid={`timeline-node-${item.id}`}
      disabled={item.disabled}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4" />
      {item.markerLabel && (
        <span className="absolute -top-8 whitespace-nowrap rounded-sm bg-popover px-1.5 py-0.5 font-semibold text-[10px] text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {item.markerLabel}
        </span>
      )}
    </button>
  );
}

export function defaultFormatValue(
  value: number,
  range: Required<TimelineRange>
): string {
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);

  return range.unit ? `${formatted} ${range.unit}` : formatted;
}
