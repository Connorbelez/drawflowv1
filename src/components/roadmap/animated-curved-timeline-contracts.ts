import type { ReactNode } from "react";
import type {
  TimelineInsertionResult,
  TimelineItem,
  TimelineLayoutItem,
  TimelineMarker,
  TimelineRange,
} from "./animated-curved-timeline-utils.ts";
import type { TimelineMarkerStackContext } from "./TimelineMarkerStack.tsx";

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

export interface TimelineMarkerRenderContext {
  marker: TimelineMarker;
  range: Required<TimelineRange>;
  stack?: TimelineMarkerStackContext;
  x: number;
}

export interface TimelineInsertContext<TData = unknown> {
  items: TimelineItem<TData>[];
  range: Required<TimelineRange>;
  requestedX: number;
}

export interface TimelineItemsChangeDetails<TData = unknown>
  extends TimelineInsertionResult<TData> {
  requestedX: number;
  type: "insert";
}

export interface TimelineContextMenuAction<TData = unknown> {
  description?: string;
  icon?: ReactNode;
  id: string;
  label: string;
  onSelect: (context: TimelineInsertContext<TData>) => void;
  tone?: "default" | "destructive";
}

export interface TimelineInsertionConfig<TData = unknown> {
  actions?: TimelineContextMenuAction<TData>[];
  createItem?: (
    requestedX: number,
    context: TimelineInsertContext<TData>
  ) => TimelineItem<TData>;
  enabled?: boolean;
  label?: string;
  minGap?: number;
  step?: number;
}

export interface AnimatedCurvedTimelineProps<TData = unknown> {
  activeItemId?: string | null;
  activeItemPhase?: TimelineItemPhase;
  baselineY?: number;
  cardTop?: number;
  cardWidth?: number;
  className?: string;
  defaultActiveItemId?: string;
  endCardWidth?: number;
  focusedMarkerId?: string | null;
  formatValue?: (value: number, range: Required<TimelineRange>) => string;
  getItemEndValue?: (item: TimelineItem<TData>) => number | null | undefined;
  height?: number;
  hoverNodeCollisionPaddingPx?: number;
  hoverValue?: number | null;
  insertion?: TimelineInsertionConfig<TData>;
  items: TimelineItem<TData>[];
  laneStepY?: number;
  markerStackProximityPx?: number;
  markers?: TimelineMarker[];
  minInlineNodeSpacingPx?: number;
  minNodeSpacingPx?: number;
  onActiveItemChange?: (item: TimelineItem<TData>) => void;
  onEndNodeClick?: (item: TimelineLayoutItem<TData>) => void;
  onHoverValueChange?: (value: number | null) => void;
  onItemsChange?: (
    items: TimelineItem<TData>[],
    details: TimelineItemsChangeDetails<TData>
  ) => void;
  onProgressValueChange?: (
    value: number,
    item: TimelineItem<TData> | null
  ) => void;
  onRangeChange?: (range: Required<TimelineRange>) => void;
  paddingX?: number;
  pixelsPerUnit?: number;
  progressValue?: number | null;
  range: TimelineRange;
  renderCard?: (
    item: TimelineLayoutItem<TData>,
    context: TimelineItemRenderContext<TData>
  ) => ReactNode;
  renderEndCard?: (context: {
    range: Required<TimelineRange>;
    x: number;
  }) => ReactNode;
  renderEndNode?: (
    item: TimelineLayoutItem<TData>,
    context: TimelineItemRenderContext<TData>
  ) => ReactNode;
  renderMarker?: (
    marker: TimelineMarker,
    context: TimelineMarkerRenderContext
  ) => ReactNode;
  renderNode?: (
    item: TimelineLayoutItem<TData>,
    context: TimelineItemRenderContext<TData>
  ) => ReactNode;
  straightLine?: boolean;
  viewportClassName?: string;
}
