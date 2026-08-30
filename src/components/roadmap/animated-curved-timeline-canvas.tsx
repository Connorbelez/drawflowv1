"use client";

import { AnimatePresence, type MotionValue, motion } from "motion/react";
import type {
  MouseEvent,
  PointerEvent,
  ReactElement,
  ReactNode,
  RefObject,
} from "react";
import { cn } from "#/lib/utils.ts";
import type {
  TimelineContextMenuAction,
  TimelineItemPhase,
  TimelineItemRenderContext,
  TimelineMarkerRenderContext,
} from "./animated-curved-timeline-contracts.ts";
import {
  DefaultMarker,
  DefaultNode,
  type PathPoint,
  TimelineGrid,
  TimelineInsertMenu,
} from "./animated-curved-timeline-renderers.tsx";
import type {
  TimelineItem,
  TimelineLayout,
  TimelineLayoutItem,
  TimelineMarker,
  TimelineMarkerStack,
  TimelineRange,
} from "./animated-curved-timeline-utils.ts";
import { TimelineMarkerStack as TimelineMarkerStackView } from "./TimelineMarkerStack.tsx";

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

export interface AnimatedCurvedTimelineCanvasProps<TData = unknown> {
  activeOrder: number;
  canInsertItem: boolean;
  cardTop: number;
  cardWidth: number;
  className?: string;
  contentRef: RefObject<HTMLDivElement | null>;
  contentWidth: number;
  contextMenu: { requestedX: number } | null;
  customContextMenuActions: TimelineContextMenuAction<TData>[];
  endCardWidth: number;
  focusedMarkerId?: string | null;
  formatValue: (value: number, range: Required<TimelineRange>) => string;
  handleContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
  handleContextMenuAction: (action: TimelineContextMenuAction<TData>) => void;
  handleInsert: () => void;
  handleTrackPointerMove: (
    event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>
  ) => void;
  hideHoverMarker: () => void;
  hoverDotOpacity: MotionValue<number>;
  hoverDotScale: MotionValue<number>;
  hoverLabel: string | null;
  hoverMarkerX: MotionValue<number>;
  hoverMarkerY: MotionValue<number>;
  insertionLabel?: string;
  laneStepY: number;
  layout: TimelineLayout<TData>;
  markerStacks: TimelineMarkerStack[];
  path: string;
  prefersReducedMotion: boolean | null;
  progressDistance: number;
  progressPathRef: RefObject<SVGPathElement | null>;
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
  resolvedActiveItemId: string | null;
  resolvedActiveItemPhase: TimelineItemPhase;
  resolvePathPointAtX: (x: number) => PathPoint;
  routeLength: number;
  setActiveEndItem: (item: TimelineLayoutItem<TData>) => void;
  setActiveItem: (item: TimelineItem<TData>) => void;
  stageHeight: number;
  straightLine: boolean;
  viewportClassName?: string;
  viewportRef: RefObject<HTMLDivElement | null>;
}

export function AnimatedCurvedTimelineCanvas<TData = unknown>({
  activeOrder,
  canInsertItem,
  cardTop,
  cardWidth,
  className,
  contentRef,
  contentWidth,
  contextMenu,
  customContextMenuActions,
  endCardWidth,
  focusedMarkerId,
  formatValue,
  handleContextMenu,
  handleContextMenuAction,
  handleInsert,
  handleTrackPointerMove,
  hideHoverMarker,
  hoverDotOpacity,
  hoverDotScale,
  hoverLabel,
  hoverMarkerX,
  hoverMarkerY,
  insertionLabel,
  laneStepY,
  layout,
  markerStacks,
  path,
  prefersReducedMotion,
  progressDistance,
  progressPathRef,
  renderCard,
  renderEndCard,
  renderEndNode,
  renderMarker,
  renderNode,
  resolvePathPointAtX,
  resolvedActiveItemId,
  resolvedActiveItemPhase,
  routeLength,
  setActiveEndItem,
  setActiveItem,
  stageHeight,
  straightLine,
  viewportClassName,
  viewportRef,
}: AnimatedCurvedTimelineCanvasProps<TData>): ReactElement {
  const renderResolvedMarker = (
    marker: TimelineMarker,
    context: TimelineMarkerRenderContext
  ) => (renderMarker ? renderMarker(marker, context) : <DefaultMarker marker={marker} />);

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
            insertionLabel={insertionLabel}
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
                    <TimelineMarkerStackView
                      contentWidth={contentWidth}
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
                opacity: hoverDotOpacity,
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

          <TimelineItems
            activeOrder={activeOrder}
            baselineY={layout.baselineY}
            cardTop={cardTop}
            cardWidth={cardWidth}
            layout={layout}
            prefersReducedMotion={prefersReducedMotion}
            range={layout.range}
            renderCard={renderCard}
            renderEndNode={renderEndNode}
            renderNode={renderNode}
            resolvedActiveItemId={resolvedActiveItemId}
            resolvedActiveItemPhase={resolvedActiveItemPhase}
            setActiveEndItem={setActiveEndItem}
            setActiveItem={setActiveItem}
            straightLine={straightLine}
          />

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

interface TimelineItemsProps<TData = unknown> {
  activeOrder: number;
  baselineY: number;
  cardTop: number;
  cardWidth: number;
  layout: TimelineLayout<TData>;
  prefersReducedMotion: boolean | null;
  range: Required<TimelineRange>;
  renderCard?: (
    item: TimelineLayoutItem<TData>,
    context: TimelineItemRenderContext<TData>
  ) => ReactNode;
  renderEndNode?: (
    item: TimelineLayoutItem<TData>,
    context: TimelineItemRenderContext<TData>
  ) => ReactNode;
  renderNode?: (
    item: TimelineLayoutItem<TData>,
    context: TimelineItemRenderContext<TData>
  ) => ReactNode;
  resolvedActiveItemId: string | null;
  resolvedActiveItemPhase: TimelineItemPhase;
  setActiveEndItem: (item: TimelineLayoutItem<TData>) => void;
  setActiveItem: (item: TimelineItem<TData>) => void;
  straightLine: boolean;
}

function TimelineItems<TData = unknown>({
  activeOrder,
  baselineY,
  cardTop,
  cardWidth,
  layout,
  prefersReducedMotion,
  renderCard,
  renderEndNode,
  renderNode,
  range,
  resolvedActiveItemId,
  resolvedActiveItemPhase,
  setActiveEndItem,
  setActiveItem,
  straightLine,
}: TimelineItemsProps<TData>): ReactElement {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {layout.items.map((item, index) => (
        <TimelineItemLayer
          activeOrder={activeOrder}
          baselineY={baselineY}
          cardTop={cardTop}
          cardWidth={cardWidth}
          index={index}
          item={item}
          key={item.id}
          prefersReducedMotion={prefersReducedMotion}
          range={range}
          renderCard={renderCard}
          renderEndNode={renderEndNode}
          renderNode={renderNode}
          resolvedActiveItemId={resolvedActiveItemId}
          resolvedActiveItemPhase={resolvedActiveItemPhase}
          setActiveEndItem={setActiveEndItem}
          setActiveItem={setActiveItem}
          straightLine={straightLine}
        />
      ))}
    </AnimatePresence>
  );
}

interface TimelineItemLayerProps<TData = unknown>
  extends Omit<TimelineItemsProps<TData>, "layout"> {
  index: number;
  item: TimelineLayoutItem<TData>;
}

function TimelineItemLayer<TData = unknown>({
  activeOrder,
  baselineY,
  cardTop,
  cardWidth,
  index,
  item,
  prefersReducedMotion,
  renderCard,
  renderEndNode,
  renderNode,
  range,
  resolvedActiveItemId,
  resolvedActiveItemPhase,
  setActiveEndItem,
  setActiveItem,
  straightLine,
}: TimelineItemLayerProps<TData>): ReactElement {
  const itemActive = item.id === resolvedActiveItemId;
  const startActive = itemActive && resolvedActiveItemPhase === "start";
  const endActive = itemActive && resolvedActiveItemPhase === "end";
  const complete =
    activeOrder >= 0 &&
    (item.order < activeOrder ||
      (item.order === activeOrder && resolvedActiveItemPhase === "end"));
  const itemNodeY = straightLine ? baselineY : item.layoutY;
  const startContext: TimelineItemRenderContext<TData> = {
    activate: () => setActiveItem(item),
    active: startActive,
    complete,
    index,
    item,
    phase: "start",
    range,
  };
  const cardContext: TimelineItemRenderContext<TData> = {
    ...startContext,
    active: itemActive,
    phase: resolvedActiveItemPhase,
  };
  const endContext: TimelineItemRenderContext<TData> = {
    activate: () => setActiveEndItem(item),
    active: endActive,
    complete: endActive || (activeOrder >= 0 && item.order < activeOrder),
    index,
    item,
    phase: "end",
    range,
  };

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 16 }}
      initial={timelineAppearInitial(prefersReducedMotion, 20)}
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
          prefersReducedMotion ? false : { opacity: 0, scaleY: 0.25 }
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
          className="timeline-card-layer absolute z-10"
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
}
