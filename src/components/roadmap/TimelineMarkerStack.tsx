"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { cn } from "#/lib/utils.ts";
import type {
  TimelineMarker,
  TimelineMarkerStack as TimelineMarkerStackData,
  TimelineRange,
} from "./animated-curved-timeline-utils.ts";

const STACK_CARD_OFFSET_X = 6;
const STACK_CARD_OFFSET_Y = 4;
const STACK_VISIBLE_PREVIEW_COUNT = 2;
const STACK_LINE_TOP = 18;
const STACK_WEAK_LINE_CLASS =
  "bg-linear-to-b from-zinc-300/80 via-zinc-300/80 to-zinc-200 dark:from-zinc-700 dark:via-zinc-700 dark:to-zinc-800";
const STACK_ACTIVE_LINE_CLASS =
  "bg-linear-to-b from-zinc-300/80 via-zinc-300/80 to-rose-500/85 dark:from-zinc-700 dark:via-zinc-700 dark:to-rose-500/75";

type MarkerPathPoint = {
  distance: number;
  y: number;
};

export type TimelineMarkerStackContext = {
  activeIndex: number;
  count: number;
  isActive: boolean;
};

export interface TimelineMarkerStackProps {
  focusedMarkerId?: string | null;
  prefersReducedMotion: boolean;
  range: Required<TimelineRange>;
  renderMarker: (
    marker: TimelineMarker,
    context: {
      marker: TimelineMarker;
      range: Required<TimelineRange>;
      stack: TimelineMarkerStackContext;
      x: number;
    }
  ) => ReactNode;
  resolvePathPointAtX: (x: number) => MarkerPathPoint;
  stack: TimelineMarkerStackData;
}

export function TimelineMarkerStack({
  focusedMarkerId,
  prefersReducedMotion,
  range,
  renderMarker,
  resolvePathPointAtX,
  stack,
}: TimelineMarkerStackProps): ReactElement {
  const [activeIndex, setActiveIndex] = useState(() =>
    resolveFocusedMarkerIndex(stack, focusedMarkerId)
  );
  const [listOpen, setListOpen] = useState(false);
  const activeMember = stack.members[activeIndex] ?? stack.members[0];
  const stackedMembers = useMemo(
    () =>
      stack.members
        .map((member, index) => ({
          depth: getStackDepth(index, activeIndex, stack.members.length),
          index,
          member,
        }))
        .filter(
          (entry) =>
            entry.depth > 0 && entry.depth <= STACK_VISIBLE_PREVIEW_COUNT
        )
        .sort((left, right) => right.depth - left.depth),
    [activeIndex, stack.members]
  );
  const lineMetrics = useMemo(
    () =>
      stack.members.map((member, index) => {
        const pathPoint = resolvePathPointAtX(member.layoutX);
        const deltaX = member.layoutX - stack.anchorX;
        const deltaY = Math.max(0, pathPoint.y - STACK_LINE_TOP);
        const lineLength = Math.hypot(deltaX, deltaY);
        const rotation = Math.atan2(deltaX, deltaY) * (180 / Math.PI);

        return {
          id: member.marker.id,
          isActive: index === activeIndex,
          lineLength,
          pathPoint,
          rotation,
        };
      }),
    [activeIndex, resolvePathPointAtX, stack.anchorX, stack.members]
  );
  const focusedIndex = useMemo(
    () => resolveFocusedMarkerIndex(stack, focusedMarkerId),
    [focusedMarkerId, stack]
  );

  useEffect(() => {
    if (focusedMarkerId) {
      setActiveIndex(focusedIndex);
    }
  }, [focusedIndex, focusedMarkerId]);

  useEffect(() => {
    setActiveIndex((currentIndex) =>
      currentIndex >= stack.members.length ? 0 : currentIndex
    );
  }, [stack.members.length]);

  const cycleStack = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setActiveIndex((currentIndex) =>
      currentIndex + 1 >= stack.members.length ? 0 : currentIndex + 1
    );
  };

  const handleListEnter = () => setListOpen(true);
  const handleListLeave = () => setListOpen(false);
  const handleListBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setListOpen(false);
    }
  };

  return (
    <div
      className="relative flex flex-col items-center overflow-visible"
      onBlur={handleListBlur}
      onMouseEnter={handleListEnter}
      onMouseLeave={handleListLeave}
    >
      <div className="pointer-events-none absolute top-0 left-1/2 z-1 h-0 w-0">
        {lineMetrics.map((metric) =>
          metric.lineLength === 0 ? null : (
            <div
              aria-hidden="true"
              className={cn(
                "absolute top-0 left-0 w-px origin-top",
                metric.isActive ? STACK_ACTIVE_LINE_CLASS : STACK_WEAK_LINE_CLASS
              )}
              data-testid={`timeline-marker-connector-${metric.id}`}
              key={metric.id}
              style={{
                height: metric.lineLength,
                transform: `translateX(-50%) rotate(${metric.rotation}deg)`,
              }}
            />
          )
        )}
      </div>

      <div className="relative overflow-visible px-3 pb-2">
        {stackedMembers.map(({ depth, member }) => (
          <motion.div
            animate={{
              opacity: 1,
              scale: depth === 1 ? 0.985 : 0.97,
              x: STACK_CARD_OFFSET_X * depth,
              y: STACK_CARD_OFFSET_Y * depth,
            }}
            className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2"
            initial={
              prefersReducedMotion
                ? false
                : {
                    opacity: 0,
                    scale: 0.94,
                    x: STACK_CARD_OFFSET_X * (depth + 1),
                    y: STACK_CARD_OFFSET_Y * (depth + 1),
                  }
            }
            key={member.marker.id}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.2,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {renderMarker(member.marker, {
              marker: member.marker,
              range,
              stack: {
                activeIndex,
                count: stack.members.length,
                isActive: false,
              },
              x: member.layoutX,
            })}
          </motion.div>
        ))}

        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            className="relative z-20"
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.96, y: 6 }
            }
            initial={
              prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: -6 }
            }
            key={activeMember.marker.id}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.18,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {renderMarker(activeMember.marker, {
              marker: activeMember.marker,
              range,
              stack: {
                activeIndex,
                count: stack.members.length,
                isActive: true,
              },
              x: activeMember.layoutX,
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {stack.members.length > 1 ? (
        <div className="relative z-20 -mt-1 flex flex-col items-center">
          <button
            aria-expanded={listOpen}
            aria-haspopup="listbox"
            aria-label={`Show next marker (${activeIndex + 1} of ${stack.members.length})`}
            className="grid size-7 place-items-center rounded-full border border-border bg-background font-semibold text-[10px] tabular-nums text-foreground shadow-sm transition-colors hover:border-ring hover:text-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            data-testid={`timeline-marker-stack-cycle-${stack.id}`}
            onClick={cycleStack}
            onFocus={handleListEnter}
            type="button"
          >
            {activeIndex + 1}/{stack.members.length}
          </button>

          <AnimatePresence initial={false}>
            {listOpen ? (
              <motion.div
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="absolute top-full left-1/2 mt-2 w-48 -translate-x-1/2 rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                initial={{ opacity: 0, scale: 0.96, y: -6 }}
                role="listbox"
                transition={{
                  duration: prefersReducedMotion ? 0 : 0.16,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <div className="px-1 pb-1 font-medium text-[10px] text-muted-foreground uppercase">
                  Stacked markers
                </div>
                <div className="grid gap-1">
                  {stack.members.map((member, index) => (
                    <button
                      aria-selected={index === activeIndex}
                      className={cn(
                        "rounded-sm px-2 py-1 text-left text-xs transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        index === activeIndex && "bg-muted font-medium"
                      )}
                      key={member.marker.id}
                      onClick={() => setActiveIndex(index)}
                      role="option"
                      type="button"
                    >
                      <span className="mr-1 inline-block w-5 font-semibold tabular-nums">
                        {index + 1}.
                      </span>
                      <span className="truncate">{member.marker.label}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
    </div>
  );
}

function getStackDepth(
  memberIndex: number,
  activeIndex: number,
  memberCount: number
): number {
  return (memberIndex - activeIndex + memberCount) % memberCount;
}

function resolveFocusedMarkerIndex(
  stack: TimelineMarkerStackData,
  focusedMarkerId: string | null | undefined
): number {
  if (!focusedMarkerId) {
    return 0;
  }

  const focusedIndex = stack.members.findIndex(
    (member) => member.marker.id === focusedMarkerId
  );

  return focusedIndex >= 0 ? focusedIndex : 0;
}
