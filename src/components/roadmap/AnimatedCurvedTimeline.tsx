"use client";

import { Check, Circle, CircleDot, Plus } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import {
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#/components/ui/context-menu.tsx";
import { cn } from "#/lib/utils.ts";
import {
  buildTimelineLayout,
  createCurvedTimelinePath,
  createStraightTimelinePath,
  groupMarkersByProximity,
  insertTimelineItemWithSpacing,
  normalizeTimelineRange,
  roundTimelineValue,
  routePointForX,
  routeProgressForX,
  type TimelineInsertionResult,
  type TimelineItem,
  type TimelineLayout,
  type TimelineLayoutItem,
  type TimelineMarker,
  type TimelineRange,
} from "./animated-curved-timeline-utils.ts";
import {
  TimelineMarkerStack,
  type TimelineMarkerStackContext,
} from "./TimelineMarkerStack.tsx";

export type {
  TimelineInsertionResult,
  TimelineItem,
  TimelineItemTone,
  TimelineLayout,
  TimelineLayoutItem,
  TimelineMarker,
  TimelineMarkerTone,
  TimelineRange,
} from "./animated-curved-timeline-utils.ts";

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
  cardTop?: number;
  cardWidth?: number;
  className?: string;
  defaultActiveItemId?: string;
  endCardWidth?: number;
  formatValue?: (value: number, range: Required<TimelineRange>) => string;
  focusedMarkerId?: string | null;
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

interface ContextMenuState {
  requestedX: number;
}

interface PathMetricSample {
  length: number;
  x: number;
  y: number;
}

interface PathMetrics {
  samples: PathMetricSample[];
  totalLength: number;
}

interface PathPoint {
  distance: number;
  x: number;
  y: number;
}

interface NodeBounds {
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

interface HoverDotVisualState {
  opacity: number;
  scale: number;
}

interface TimelineInsertMenuProps<TData = unknown> {
  canInsertItem: boolean;
  contextMenu: ContextMenuState | null;
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

const DEFAULT_HEIGHT = 560;
const DEFAULT_BASELINE_Y = 164;
const DEFAULT_CARD_TOP = 236;
const DEFAULT_CARD_WIDTH = 224;
const DEFAULT_LANE_STEP_Y = 18;
const DEFAULT_MIN_NODE_SPACING_PX = 176;
const DEFAULT_PADDING_X = 72;
const DEFAULT_PIXELS_PER_UNIT = 10;
const DEFAULT_INSERTION_GAP = 10;
const HOVER_DOT_COLLISION_HIDDEN_SCALE = 0.58;
const HOVER_DOT_COLLISION_EXPONENT = 2.35;
const WEIGHTED_EASE = [0.22, 1, 0.36, 1] as const;

function timelineRootInitial(prefersReducedMotion: boolean | null) {
  return prefersReducedMotion
    ? false
    : { filter: "blur(10px)", opacity: 0, y: 18 };
}

function timelineRootTransition(prefersReducedMotion: boolean | null) {
  return {
    duration: prefersReducedMotion ? 0 : 0.48,
    ease: [0.16, 1, 0.3, 1] as const,
  };
}

function timelineAppearInitial(
  prefersReducedMotion: boolean | null,
  y: number
) {
  return prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y };
}

function timelineDuration(
  prefersReducedMotion: boolean | null,
  duration: number
) {
  return prefersReducedMotion ? 0 : duration;
}

export function AnimatedCurvedTimeline<TData = unknown>({
  activeItemId,
  activeItemPhase,
  cardTop = DEFAULT_CARD_TOP,
  cardWidth = DEFAULT_CARD_WIDTH,
  className,
  defaultActiveItemId,
  formatValue = defaultFormatValue,
  focusedMarkerId,
  getItemEndValue,
  height = DEFAULT_HEIGHT,
  hoverValue,
  insertion,
  items,
  laneStepY = DEFAULT_LANE_STEP_Y,
  markerStackProximityPx = 88,
  markers = [],
  minInlineNodeSpacingPx = 56,
  minNodeSpacingPx = DEFAULT_MIN_NODE_SPACING_PX,
  onActiveItemChange,
  onEndNodeClick,
  onHoverValueChange,
  onItemsChange,
  onProgressValueChange,
  onRangeChange,
  hoverNodeCollisionPaddingPx = 8,
  paddingX = DEFAULT_PADDING_X,
  pixelsPerUnit = DEFAULT_PIXELS_PER_UNIT,
  progressValue,
  range,
  renderCard,
  renderEndCard,
  endCardWidth = 260,
  renderEndNode,
  renderMarker,
  renderNode,
  straightLine = false,
  viewportClassName,
}: AnimatedCurvedTimelineProps<TData>): ReactElement {
  const prefersReducedMotion = useReducedMotion();
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const progressPathRef = useRef<SVGPathElement>(null);
  const pathMetricsRef = useRef<PathMetrics | null>(null);
  const nodeBoundsRef = useRef<NodeBounds[]>([]);
  const hoverFrameRef = useRef<number | null>(null);
  const pendingHoverClientXRef = useRef<number | null>(null);
  const hoverLabelRef = useRef<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1080);
  const [routeLength, setRouteLength] = useState(1);
  const [progressDistance, setProgressDistance] = useState(0);
  const [pathMetrics, setPathMetrics] = useState<PathMetrics | null>(null);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const [uncontrolledActiveItemId, setUncontrolledActiveItemId] = useState<
    string | null
  >(defaultActiveItemId ?? items[0]?.id ?? null);
  const [uncontrolledActiveItemPhase, setUncontrolledActiveItemPhase] =
    useState<TimelineItemPhase>("start");
  const [uncontrolledProgressValue, setUncontrolledProgressValue] = useState<
    number | null
  >(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const hoverDistance = useMotionValue(0);
  const hoverOpacity = useMotionValue(0);
  const animatedHoverDistance = useSpring(hoverDistance, {
    damping: 34,
    mass: 0.34,
    stiffness: 420,
  });
  const hoverMarkerX = useTransform(animatedHoverDistance, (distance) => {
    const pathElement = progressPathRef.current;
    const metrics = pathMetricsRef.current;

    if (!(pathElement && metrics)) {
      return 0;
    }

    return pathElement.getPointAtLength(clampPathDistance(distance, metrics)).x;
  });
  const hoverMarkerY = useTransform(animatedHoverDistance, (distance) => {
    const pathElement = progressPathRef.current;
    const metrics = pathMetricsRef.current;

    if (!(pathElement && metrics)) {
      return DEFAULT_BASELINE_Y;
    }

    return pathElement.getPointAtLength(clampPathDistance(distance, metrics)).y;
  });
  const hoverDotOpacity = useTransform(
    animatedHoverDistance,
    (distance) =>
      getHoverDotVisualStateAtDistance(
        distance,
        progressPathRef.current,
        pathMetricsRef.current,
        nodeBoundsRef.current
      ).opacity
  );
  const hoverDotScale = useTransform(
    animatedHoverDistance,
    (distance) =>
      getHoverDotVisualStateAtDistance(
        distance,
        progressPathRef.current,
        pathMetricsRef.current,
        nodeBoundsRef.current
      ).scale
  );

  const resolvedRange = useMemo(() => normalizeTimelineRange(range), [range]);
  const resolvedActiveItemId =
    activeItemId === undefined ? uncontrolledActiveItemId : activeItemId;
  const resolvedActiveItemPhase =
    activeItemPhase === undefined
      ? uncontrolledActiveItemPhase
      : activeItemPhase;
  const effectiveMinNodeSpacingPx = renderCard
    ? Math.max(minNodeSpacingPx, cardWidth + 24)
    : minNodeSpacingPx;
  const layout = useMemo(
    () =>
      buildTimelineLayout(items, {
        baselineY: DEFAULT_BASELINE_Y,
        getItemEndValue,
        laneStepY,
        minInlineNodeSpacingPx,
        minNodeSpacingPx: effectiveMinNodeSpacingPx,
        paddingX,
        pixelsPerUnit,
        range: resolvedRange,
        viewportWidth,
      }),
    [
      effectiveMinNodeSpacingPx,
      getItemEndValue,
      items,
      laneStepY,
      minInlineNodeSpacingPx,
      paddingX,
      pixelsPerUnit,
      resolvedRange,
      viewportWidth,
    ]
  );
  const path = useMemo(
    () =>
      straightLine
        ? createStraightTimelinePath(layout.points)
        : createCurvedTimelinePath(layout.points),
    [layout.points, straightLine]
  );
  const routePoints = useMemo(
    () =>
      straightLine
        ? layout.points.map((point) => ({ ...point, y: layout.baselineY }))
        : layout.points,
    [layout.baselineY, layout.points, straightLine]
  );
  const markerStacks = useMemo(
    () =>
      groupMarkersByProximity(
        markers,
        layout.valueToX,
        markerStackProximityPx
      ),
    [layout.valueToX, markerStackProximityPx, markers]
  );
  const nodeLayoutSignature = useMemo(
    () =>
      layout.items
        .map((item) =>
          [
            item.id,
            item.layoutX,
            straightLine ? layout.baselineY : item.layoutY,
            item.id === resolvedActiveItemId
              ? resolvedActiveItemPhase
              : "inactive",
            renderEndNode ? (item.endLayoutX ?? "none") : "hidden",
            renderEndNode
              ? straightLine
                ? layout.baselineY
                : item.layoutY
              : "hidden",
          ].join(":")
        )
        .join("|"),
    [
      layout.baselineY,
      layout.items,
      renderEndNode,
      resolvedActiveItemPhase,
      resolvedActiveItemId,
      straightLine,
    ]
  );
  const resolvedProgressValue =
    progressValue === undefined ? uncontrolledProgressValue : progressValue;
  const activeLayoutItem =
    layout.items.find((item) => item.id === resolvedActiveItemId) ?? null;
  const progressValueTargetsActiveItem =
    typeof resolvedProgressValue === "number" &&
    activeLayoutItem !== null &&
    Math.abs(resolvedProgressValue - activeLayoutItem.x) < 0.000_001;
  const progressValueTargetsActiveItemEnd =
    typeof resolvedProgressValue === "number" &&
    activeLayoutItem !== null &&
    activeLayoutItem.endX !== undefined &&
    resolvedActiveItemPhase === "end" &&
    Math.abs(resolvedProgressValue - activeLayoutItem.endX) < 0.000_001;
  const progressTargetX =
    typeof resolvedProgressValue === "number"
      ? progressValueTargetsActiveItemEnd
        ? (activeLayoutItem.endLayoutX ??
          layout.valueToX(resolvedProgressValue))
        : progressValueTargetsActiveItem
          ? activeLayoutItem.layoutX
          : layout.valueToX(resolvedProgressValue)
      : activeLayoutItem
        ? resolvedActiveItemPhase === "end"
          ? (activeLayoutItem.endLayoutX ?? activeLayoutItem.layoutX)
          : activeLayoutItem.layoutX
        : layout.startX;
  const progressRatio = routeProgressForX(routePoints, progressTargetX);
  const activeOrder =
    layout.items.find((item) => item.id === resolvedActiveItemId)?.order ?? -1;
  const customContextMenuActions = insertion?.actions ?? [];
  const canInsertItem =
    insertion?.enabled !== false &&
    Boolean(insertion?.createItem) &&
    Boolean(onItemsChange);
  const canOpenContextMenu =
    insertion?.enabled !== false &&
    (canInsertItem || customContextMenuActions.length > 0);
  const stageHeight = Math.max(height, cardTop + 280);
  const contentWidth = renderEndCard
    ? Math.max(layout.contentWidth, layout.endX + endCardWidth / 2 + paddingX)
    : layout.contentWidth;

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return;
    }

    setViewportWidth(element.clientWidth);
    const resizeObserver = new ResizeObserver(([entry]) => {
      setViewportWidth(entry.contentRect.width);
    });

    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (path.length === 0) {
      return;
    }

    const pathElement = progressPathRef.current;
    if (!pathElement) {
      return;
    }

    const metrics = createPathMetrics(pathElement);
    pathMetricsRef.current = metrics;
    setPathMetrics(metrics);
    setRouteLength(metrics.totalLength);
    setProgressDistance(getPathDistanceAtX(metrics, progressTargetX));
  }, [path, progressTargetX]);

  useEffect(() => {
    const metrics = pathMetricsRef.current;

    setProgressDistance(
      metrics
        ? getPathDistanceAtX(metrics, progressTargetX)
        : routeLength * progressRatio
    );
  }, [progressRatio, progressTargetX, routeLength]);

  useEffect(() => {
    if (
      !resolvedActiveItemId ||
      items.some((item) => item.id === resolvedActiveItemId)
    ) {
      return;
    }

    if (activeItemId === undefined) {
      const nextActiveItem = items[0] ?? null;

      setUncontrolledActiveItemId(nextActiveItem?.id ?? null);

      if (activeItemPhase === undefined) {
        setUncontrolledActiveItemPhase("start");
      }

      if (progressValue === undefined) {
        setUncontrolledProgressValue(nextActiveItem?.x ?? null);
      }
    }
  }, [
    activeItemId,
    activeItemPhase,
    items,
    progressValue,
    resolvedActiveItemId,
  ]);

  const resolvePathPointAtX = useCallback(
    (x: number): PathPoint => {
      if (pathMetrics) {
        return getPathPointAtX(pathMetrics, x);
      }

      const point = routePointForX(routePoints, x);

      return {
        ...point,
        distance: routeLength * routeProgressForX(routePoints, x),
      };
    },
    [pathMetrics, routeLength, routePoints]
  );
  const renderResolvedMarker = useCallback(
    (marker: TimelineMarker, context: TimelineMarkerRenderContext) =>
      renderMarker ? renderMarker(marker, context) : <DefaultMarker marker={marker} />,
    [renderMarker]
  );

  const refreshNodeBounds = useCallback(() => {
    const contentRect = contentRef.current?.getBoundingClientRect();
    if (!contentRect) {
      nodeBoundsRef.current = [];
      return;
    }

    const nodeElements = contentRef.current?.querySelectorAll<HTMLElement>(
      "[data-timeline-node-wrapper]"
    );

    nodeBoundsRef.current = [...(nodeElements ?? [])].map((element) => {
      const rect = element.getBoundingClientRect();
      const left = rect.left - contentRect.left;
      const right = rect.right - contentRect.left;
      const top = rect.top - contentRect.top;
      const bottom = rect.bottom - contentRect.top;
      const centerX = left + rect.width / 2;
      const centerY = top + rect.height / 2;
      const iconRadius = Math.max(rect.width, rect.height) / 2;
      const fadePadding = Math.max(4, hoverNodeCollisionPaddingPx);

      return {
        bottom: bottom + hoverNodeCollisionPaddingPx,
        centerX,
        centerY,
        id: element.dataset.timelineNodeId ?? "",
        innerRadius: Math.max(4, iconRadius * 0.72),
        left: left - hoverNodeCollisionPaddingPx,
        outerRadius: iconRadius + fadePadding,
        right: right + hoverNodeCollisionPaddingPx,
        top: top - hoverNodeCollisionPaddingPx,
      };
    });
  }, [hoverNodeCollisionPaddingPx]);

  useLayoutEffect(() => {
    if (nodeLayoutSignature.length === 0) {
      nodeBoundsRef.current = [];
      return;
    }

    refreshNodeBounds();
  }, [nodeLayoutSignature, refreshNodeBounds]);

  const setHoverLabelIfChanged = useCallback((label: string) => {
    if (hoverLabelRef.current === label) {
      return;
    }

    hoverLabelRef.current = label;
    setHoverLabel(label);
  }, []);

  const updateHoverMarkerForPathX = useCallback(
    (pathX: number, labelValue: number) => {
      const metrics = pathMetricsRef.current;
      if (!metrics) {
        return;
      }

      const pathPoint = getPathPointAtX(metrics, pathX);

      hoverDistance.set(pathPoint.distance);
      hoverOpacity.set(1);
      setHoverLabelIfChanged(formatValue(labelValue, layout.range));
    },
    [formatValue, hoverDistance, hoverOpacity, layout, setHoverLabelIfChanged]
  );

  const updateHoverMarkerForValue = useCallback(
    (value: number) => {
      const pathX = layout.valueToX(value);

      updateHoverMarkerForPathX(pathX, layout.xToValue(pathX));
    },
    [layout, updateHoverMarkerForPathX]
  );

  useEffect(() => {
    if (hoverValue === undefined) {
      return;
    }

    if (typeof hoverValue === "number") {
      updateHoverMarkerForValue(hoverValue);
      return;
    }

    hoverOpacity.set(0);
    hoverLabelRef.current = null;
    setHoverLabel(null);
  }, [hoverOpacity, hoverValue, updateHoverMarkerForValue]);

  useEffect(
    () => () => {
      if (hoverFrameRef.current !== null) {
        window.cancelAnimationFrame(hoverFrameRef.current);
      }
    },
    []
  );

  const setActiveItem = useCallback(
    (item: TimelineItem<TData>) => {
      if (activeItemId === undefined) {
        setUncontrolledActiveItemId(item.id);
      }
      if (activeItemPhase === undefined) {
        setUncontrolledActiveItemPhase("start");
      }
      if (progressValue === undefined) {
        setUncontrolledProgressValue(item.x);
      }
      onActiveItemChange?.(item);
      onProgressValueChange?.(item.x, item);
    },
    [
      activeItemId,
      activeItemPhase,
      onActiveItemChange,
      onProgressValueChange,
      progressValue,
    ]
  );

  const setActiveEndItem = useCallback(
    (item: TimelineLayoutItem<TData>) => {
      const endValue = item.endX ?? item.x;

      if (activeItemId === undefined) {
        setUncontrolledActiveItemId(item.id);
      }
      if (activeItemPhase === undefined) {
        setUncontrolledActiveItemPhase("end");
      }
      if (progressValue === undefined) {
        setUncontrolledProgressValue(endValue);
      }
      onActiveItemChange?.(item);
      onProgressValueChange?.(endValue, item);
      onEndNodeClick?.(item);
    },
    [
      activeItemId,
      activeItemPhase,
      onActiveItemChange,
      onEndNodeClick,
      onProgressValueChange,
      progressValue,
    ]
  );

  const hideHoverMarker = useCallback(() => {
    if (hoverFrameRef.current !== null) {
      window.cancelAnimationFrame(hoverFrameRef.current);
      hoverFrameRef.current = null;
    }

    pendingHoverClientXRef.current = null;
    hoverOpacity.set(0);
    onHoverValueChange?.(null);
  }, [hoverOpacity, onHoverValueChange]);

  const handleTrackPointerMove = useCallback(
    (event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>) => {
      pendingHoverClientXRef.current = event.clientX;
      if (hoverFrameRef.current !== null) {
        return;
      }

      hoverFrameRef.current = window.requestAnimationFrame(() => {
        hoverFrameRef.current = null;
        const clientX = pendingHoverClientXRef.current;
        const contentRect = contentRef.current?.getBoundingClientRect();

        if (clientX === null || !contentRect) {
          return;
        }

        const rawX = clientX - contentRect.left;
        const value = layout.xToValue(rawX);

        updateHoverMarkerForPathX(rawX, value);
        onHoverValueChange?.(value);
      });
    },
    [layout, onHoverValueChange, updateHoverMarkerForPathX]
  );

  const openContextMenuAtClientPoint = useCallback(
    (clientX: number) => {
      if (!canOpenContextMenu) {
        return;
      }

      const contentRect = contentRef.current?.getBoundingClientRect();
      if (!contentRect) {
        return;
      }

      const rawX = clientX - contentRect.left;
      const requestedX = roundTimelineValue(
        layout.xToValue(rawX),
        insertion?.step ?? 1
      );

      setContextMenu({
        requestedX,
      });
    },
    [canOpenContextMenu, insertion?.step, layout]
  );

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      openContextMenuAtClientPoint(event.clientX);
    },
    [openContextMenuAtClientPoint]
  );

  const handleInsert = useCallback(() => {
    if (!(contextMenu && insertion?.createItem && canInsertItem)) {
      return;
    }

    const requestedX = contextMenu.requestedX;
    const createdItem = insertion.createItem(requestedX, {
      items,
      range: layout.range,
      requestedX,
    });
    const result = insertTimelineItemWithSpacing(items, createdItem, {
      minGap: insertion.minGap ?? DEFAULT_INSERTION_GAP,
      range: layout.range,
    });
    const details: TimelineItemsChangeDetails<TData> = {
      ...result,
      requestedX,
      type: "insert",
    };

    onItemsChange?.(result.items, details);
    onRangeChange?.(result.range);
    setActiveItem(result.insertedItem);
    setContextMenu(null);
  }, [
    contextMenu,
    insertion,
    items,
    layout.range,
    onItemsChange,
    onRangeChange,
    setActiveItem,
    canInsertItem,
  ]);

  const handleContextMenuAction = useCallback(
    (action: TimelineContextMenuAction<TData>) => {
      if (!contextMenu) {
        return;
      }

      const requestedX = contextMenu.requestedX;

      action.onSelect({
        items,
        range: layout.range,
        requestedX,
      });
      setContextMenu(null);
    },
    [contextMenu, items, layout.range]
  );

  return (
    <motion.section
      animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
      className={cn(
        "relative overflow-visible rounded-lg border border-border bg-background text-foreground shadow-sm",
        renderCard && "z-20",
        className
      )}
      data-animated-curved-timeline-root=""
      data-testid="animated-curved-timeline"
      initial={timelineRootInitial(prefersReducedMotion)}
      transition={timelineRootTransition(prefersReducedMotion)}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 z-20 w-8 bg-gradient-to-r from-background to-transparent sm:w-12"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 z-20 w-8 bg-gradient-to-l from-background to-transparent sm:w-12"
      />
      <div
        className={cn(
          "pointer-events-none overflow-x-auto overflow-y-visible overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          renderCard && "-mb-56 pb-56",
          viewportClassName
        )}
        data-testid="timeline-scroll-viewport"
        ref={viewportRef}
      >
        <div
          className="pointer-events-auto relative overflow-y-visible"
          onMouseMoveCapture={handleTrackPointerMove}
          onPointerLeave={hideHoverMarker}
          onPointerMoveCapture={handleTrackPointerMove}
          ref={contentRef}
          style={{ height: stageHeight, width: contentWidth }}
        >
          <TimelineGrid
            formatValue={formatValue}
            layout={layout}
            markerCount={Math.max(5, Math.ceil(layout.axisWidth / 220))}
          />
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0"
            height={stageHeight}
            viewBox={`0 0 ${contentWidth} ${stageHeight}`}
            width={contentWidth}
          >
            <path
              className="text-zinc-300/80 dark:text-zinc-700"
              d={path}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="3"
            />
            <motion.path
              animate={{ strokeDashoffset: routeLength - progressDistance }}
              className="text-rose-500"
              d={path}
              fill="none"
              initial={false}
              ref={progressPathRef}
              stroke="currentColor"
              strokeDasharray={routeLength}
              strokeLinecap="round"
              strokeWidth="5"
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : { damping: 26, mass: 0.8, stiffness: 118, type: "spring" }
              }
            />
          </svg>

          <TimelineInsertMenu
            canInsertItem={canInsertItem}
            contextMenu={contextMenu}
            customActions={customContextMenuActions}
            formatValue={formatValue}
            handleContextMenu={handleContextMenu}
            insertionLabel={insertion?.label}
            laneStepY={laneStepY}
            onAction={handleContextMenuAction}
            onInsert={handleInsert}
            onPointerMove={handleTrackPointerMove}
            range={layout.range}
            top={layout.baselineY - laneStepY * 2 - 32}
          />

          <AnimatePresence initial={false} mode="popLayout">
            {markerStacks.map((stack) => {
              if (stack.members.length === 1) {
                const [member] = stack.members;
                const pathPoint = resolvePathPointAtX(member.layoutX);
                const markerTouchesProgress =
                  pathPoint.distance <= progressDistance + 0.5;

                return (
                  <motion.div
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: -8 }}
                    initial={timelineAppearInitial(prefersReducedMotion, -10)}
                    key={member.marker.id}
                    transition={{
                      duration: timelineDuration(prefersReducedMotion, 0.22),
                      ease: WEIGHTED_EASE,
                    }}
                  >
                    <div
                      aria-hidden="true"
                      className={cn(
                        "absolute z-1 w-px bg-linear-to-b from-zinc-300/80 via-zinc-300/80 dark:from-zinc-700 dark:via-zinc-700",
                        markerTouchesProgress
                          ? "to-rose-500/85 dark:to-rose-500/75"
                          : "to-zinc-200 dark:to-zinc-800"
                      )}
                      data-testid={`timeline-marker-connector-${member.marker.id}`}
                      style={{
                        height: Math.max(0, pathPoint.y - 18),
                        left: member.layoutX,
                        top: 18,
                      }}
                    />
                    <div
                      className="absolute z-30"
                      style={{
                        left: member.layoutX,
                        top: 18,
                        transform: "translateX(-50%)",
                      }}
                    >
                      {renderResolvedMarker(member.marker, {
                        marker: member.marker,
                        range: layout.range,
                        x: member.layoutX,
                      })}
                    </div>
                  </motion.div>
                );
              }

              return (
                <motion.div
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: -8 }}
                  initial={timelineAppearInitial(prefersReducedMotion, -10)}
                  key={stack.id}
                  transition={{
                    duration: timelineDuration(prefersReducedMotion, 0.22),
                    ease: WEIGHTED_EASE,
                  }}
                >
                  <div
                    className="absolute z-30"
                    style={{
                      left: stack.anchorX,
                      top: 18,
                      transform: "translateX(-50%)",
                    }}
                  >
                    <TimelineMarkerStack
                      focusedMarkerId={focusedMarkerId}
                      prefersReducedMotion={Boolean(prefersReducedMotion)}
                      range={layout.range}
                      renderMarker={renderResolvedMarker}
                      resolvePathPointAtX={resolvePathPointAtX}
                      stack={stack}
                    />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {hoverLabel && (
            <motion.div
              className="pointer-events-none absolute top-0 left-0 z-30"
              data-testid="timeline-hover-marker"
              initial={false}
              style={{
                opacity: hoverOpacity,
                x: hoverMarkerX,
                y: hoverMarkerY,
              }}
            >
              <div className="relative grid size-3 -translate-x-1/2 -translate-y-1/2 place-items-center">
                <span className="absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-rose-200 bg-background/95 px-2 py-1 font-semibold text-[11px] text-rose-600 shadow-sm backdrop-blur">
                  {hoverLabel}
                </span>
                <motion.span
                  className="size-3 rounded-full border-2 border-background bg-rose-500 shadow-[0_0_0_4px_color-mix(in_oklch,var(--color-rose-500)_18%,transparent),0_0_18px_color-mix(in_oklch,var(--color-rose-500)_45%,transparent)]"
                  data-testid="timeline-hover-dot"
                  style={{
                    opacity: hoverDotOpacity,
                    scale: hoverDotScale,
                  }}
                />
              </div>
            </motion.div>
          )}

          <AnimatePresence initial={false} mode="popLayout">
            {layout.items.map((item, index) => {
              const itemActive = item.id === resolvedActiveItemId;
              const startActive =
                itemActive && resolvedActiveItemPhase === "start";
              const endActive = itemActive && resolvedActiveItemPhase === "end";
              const complete =
                activeOrder >= 0 &&
                (item.order < activeOrder ||
                  (item.order === activeOrder &&
                    resolvedActiveItemPhase === "end"));
              const itemNodeY = straightLine ? layout.baselineY : item.layoutY;
              const startContext: TimelineItemRenderContext<TData> = {
                activate: () => setActiveItem(item),
                active: startActive,
                complete,
                index,
                item,
                phase: "start",
                range: layout.range,
              };
              const cardContext: TimelineItemRenderContext<TData> = {
                ...startContext,
                active: itemActive,
                phase: resolvedActiveItemPhase,
              };
              const endContext: TimelineItemRenderContext<TData> = {
                activate: () => setActiveEndItem(item),
                active: endActive,
                complete:
                  endActive || (activeOrder >= 0 && item.order < activeOrder),
                index,
                item,
                phase: "end",
                range: layout.range,
              };

              return (
                <motion.div
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 16 }}
                  initial={timelineAppearInitial(prefersReducedMotion, 20)}
                  key={item.id}
                  transition={{
                    duration: timelineDuration(prefersReducedMotion, 0.26),
                    ease: WEIGHTED_EASE,
                  }}
                >
                  <motion.div
                    animate={{ scaleY: 1 }}
                    aria-hidden="true"
                    className={cn(
                      "absolute z-[1] w-px origin-top bg-gradient-to-b from-rose-400/80 via-border to-transparent",
                      itemActive && "from-rose-500 via-rose-200"
                    )}
                    data-testid={`timeline-card-connector-${item.id}`}
                    exit={{ opacity: 0, scaleY: 0.25 }}
                    initial={
                      prefersReducedMotion
                        ? false
                        : { opacity: 0, scaleY: 0.25 }
                    }
                    style={{
                      height: Math.max(34, cardTop - itemNodeY - 12),
                      left: item.layoutX,
                      top: itemNodeY + 12,
                    }}
                    transition={{
                      duration: timelineDuration(prefersReducedMotion, 0.28),
                      ease: WEIGHTED_EASE,
                    }}
                  />
                  <motion.div
                    className="absolute z-20"
                    initial={false}
                    layout="position"
                    style={{
                      left: item.layoutX,
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
                      data-timeline-node-id={item.id}
                      data-timeline-node-wrapper=""
                    >
                      {renderNode ? (
                        renderNode(item, startContext)
                      ) : (
                        <DefaultNode
                          active={startActive}
                          complete={complete}
                          item={item}
                          onClick={() => setActiveItem(item)}
                        />
                      )}
                    </div>
                  </motion.div>
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
                        {renderEndNode(item, endContext)}
                      </div>
                    </motion.div>
                  )}
                  {renderCard && (
                    <motion.div
                      className="absolute z-10"
                      initial={false}
                      layout="position"
                      style={{
                        left: item.layoutX - cardWidth / 2,
                        top: cardTop,
                        width: cardWidth,
                      }}
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : {
                              damping: 30,
                              stiffness: 150,
                              type: "spring",
                            }
                      }
                    >
                      {renderCard(item, cardContext)}
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {renderEndCard && (
            <div>
              <motion.div
                aria-hidden="true"
                className="absolute z-[1] w-px origin-top bg-gradient-to-b from-emerald-400/90 via-border to-transparent"
                data-testid="timeline-final-card-connector"
                initial={false}
                style={{
                  height: Math.max(34, cardTop - layout.baselineY - 12),
                  left: layout.endX,
                  top: layout.baselineY + 12,
                }}
              />
              <motion.div
                className="absolute z-10"
                data-testid="timeline-final-card-wrapper"
                initial={false}
                layout="position"
                style={{
                  left: layout.endX - endCardWidth / 2,
                  top: cardTop,
                  width: endCardWidth,
                }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : {
                        damping: 30,
                        stiffness: 150,
                        type: "spring",
                      }
                }
              >
                {renderEndCard({ range: layout.range, x: layout.endX })}
              </motion.div>
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}

function createPathMetrics(pathElement: SVGPathElement): PathMetrics {
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

function getPathDistanceAtX(metrics: PathMetrics, targetX: number): number {
  return getPathPointAtX(metrics, targetX).distance;
}

function getPathPointAtX(metrics: PathMetrics, targetX: number): PathPoint {
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

function clampPathDistance(distance: number, metrics: PathMetrics): number {
  return Math.min(Math.max(distance, 0), metrics.totalLength);
}

function getHoverDotVisualStateAtDistance(
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

function TimelineInsertMenu<TData = unknown>({
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

function TimelineGrid<TData>({
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

function DefaultMarker({ marker }: { marker: TimelineMarker }): ReactElement {
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

function DefaultNode<TData>({
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

function defaultFormatValue(
  value: number,
  range: Required<TimelineRange>
): string {
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);

  return range.unit ? `${formatted} ${range.unit}` : formatted;
}
