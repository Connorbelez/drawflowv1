"use client";

import {
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import {
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatedCurvedTimelineCanvas } from "./animated-curved-timeline-canvas.tsx";
import type {
  AnimatedCurvedTimelineProps,
  TimelineContextMenuAction,
  TimelineItemPhase,
  TimelineItemsChangeDetails,
} from "./animated-curved-timeline-contracts.ts";
import {
  clampPathDistance,
  createPathMetrics,
  defaultFormatValue,
  getHoverDotVisualStateAtDistance,
  getPathDistanceAtX,
  getPathPointAtX,
  type NodeBounds,
  type PathMetrics,
  type PathPoint,
} from "./animated-curved-timeline-renderers.tsx";
import {
  buildTimelineLayout,
  createCurvedTimelinePath,
  createStraightTimelinePath,
  groupMarkersByProximity,
  insertTimelineItemWithSpacing,
  normalizeTimelineRange,
  resolveTimelineProgressTargetX,
  roundTimelineValue,
  routePointForX,
  routeProgressForX,
  type TimelineItem,
  type TimelineLayoutItem,
} from "./animated-curved-timeline-utils.ts";


export type {
  AnimatedCurvedTimelineProps,
  TimelineContextMenuAction,
  TimelineInsertContext,
  TimelineInsertionConfig,
  TimelineItemPhase,
  TimelineItemRenderContext,
  TimelineItemsChangeDetails,
  TimelineMarkerRenderContext,
} from "./animated-curved-timeline-contracts.ts";
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

interface ContextMenuState {
  requestedX: number;
}

const DEFAULT_HEIGHT = 520;
const DEFAULT_BASELINE_Y = 164;
const DEFAULT_CARD_TOP = 236;
const DEFAULT_CARD_WIDTH = 224;
const DEFAULT_LANE_STEP_Y = 18;
const DEFAULT_MIN_NODE_SPACING_PX = 176;
const DEFAULT_PADDING_X = 72;
const DEFAULT_PIXELS_PER_UNIT = 10;
const DEFAULT_INSERTION_GAP = 10;

export function AnimatedCurvedTimeline<TData = unknown>({
  activeItemId,
  activeItemPhase,
  baselineY = DEFAULT_BASELINE_Y,
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
      return baselineY;
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
        baselineY,
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
      baselineY,
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
      groupMarkersByProximity(markers, layout.valueToX, markerStackProximityPx),
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
  const progressTargetX = resolveTimelineProgressTargetX({
    activeItem: activeLayoutItem,
    activeItemPhase: resolvedActiveItemPhase,
    progressValue: resolvedProgressValue,
    startX: layout.startX,
    valueToX: layout.valueToX,
  });
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
    <AnimatedCurvedTimelineCanvas
      activeOrder={activeOrder}
      canInsertItem={canInsertItem}
      cardTop={cardTop}
      cardWidth={cardWidth}
      className={className}
      contentRef={contentRef}
      contentWidth={contentWidth}
      contextMenu={contextMenu}
      customContextMenuActions={customContextMenuActions}
      endCardWidth={endCardWidth}
      focusedMarkerId={focusedMarkerId}
      formatValue={formatValue}
      handleContextMenu={handleContextMenu}
      handleContextMenuAction={handleContextMenuAction}
      handleInsert={handleInsert}
      handleTrackPointerMove={handleTrackPointerMove}
      hideHoverMarker={hideHoverMarker}
      hoverDotOpacity={hoverDotOpacity}
      hoverDotScale={hoverDotScale}
      hoverLabel={hoverLabel}
      hoverMarkerX={hoverMarkerX}
      hoverMarkerY={hoverMarkerY}
      insertionLabel={insertion?.label}
      laneStepY={laneStepY}
      layout={layout}
      markerStacks={markerStacks}
      path={path}
      prefersReducedMotion={prefersReducedMotion}
      progressDistance={progressDistance}
      progressPathRef={progressPathRef}
      renderCard={renderCard}
      renderEndCard={renderEndCard}
      renderEndNode={renderEndNode}
      renderMarker={renderMarker}
      renderNode={renderNode}
      resolvedActiveItemId={resolvedActiveItemId}
      resolvedActiveItemPhase={resolvedActiveItemPhase}
      resolvePathPointAtX={resolvePathPointAtX}
      routeLength={routeLength}
      setActiveEndItem={setActiveEndItem}
      setActiveItem={setActiveItem}
      stageHeight={stageHeight}
      straightLine={straightLine}
      viewportClassName={viewportClassName}
      viewportRef={viewportRef}
    />
  );
}
