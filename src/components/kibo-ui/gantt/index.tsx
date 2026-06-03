"use client";

import {
  DndContext,
  MouseSensor,
  useDraggable,
  useSensor,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { useMouse, useThrottle, useWindowScroll } from "@uidotdev/usehooks";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInDays,
  differenceInHours,
  differenceInMonths,
  differenceInWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  formatDate,
  formatDistance,
  getDate,
  getDaysInMonth,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { atom, useAtom } from "jotai";
import throttle from "lodash.throttle";
import {
  MoveHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import type {
  CSSProperties,
  FC,
  KeyboardEventHandler,
  MouseEvent as ReactMouseEvent,
  MouseEventHandler,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Card } from "#/components/ui/card.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "#/components/ui/context-menu.tsx";
import { cn } from "#/lib/utils.ts";

const draggingAtom = atom(false);
const scrollXAtom = atom(0);

export const useGanttDragging = () => useAtom(draggingAtom);
export const useGanttScrollX = () => useAtom(scrollXAtom);

export type GanttStatus = {
  id: string;
  name: string;
  color: string;
};

export type GanttFeature = {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date;
  status: GanttStatus;
  lane?: string; // Optional: features with the same lane will share a row
};

export type GanttMarkerProps = {
  id: string;
  date: Date;
  clickLabel?: string;
  detail?: ReactNode;
  detailTestId?: string;
  label: ReactNode;
  onClick?: (id: string) => void;
  testId?: string;
};

export type Range = "daily" | "weekly" | "monthly" | "quarterly";

export type TimelineData = {
  year: number;
  quarters: {
    months: {
      days: number;
    }[];
  }[];
}[];

export type GanttContextProps = {
  zoom: number;
  range: Range;
  columnWidth: number;
  sidebarWidth: number;
  headerHeight: number;
  rowHeight: number;
  rowGap: number;
  setRowHeight: (rowHeight: number) => void;
  setRowGap: (rowGap: number) => void;
  onAddItem: ((date: Date) => void) | undefined;
  placeholderLength: number;
  timelineData: TimelineData;
  ref: RefObject<HTMLDivElement | null> | null;
  scrollToFeature?: (feature: GanttFeature) => void;
};

const getsDaysIn = (range: Range) => {
  // For when range is daily
  let fn = (_date: Date) => 1;

  if (range === "monthly" || range === "quarterly") {
    fn = getDaysInMonth;
  } else if (range === "weekly") {
    fn = () => 7;
  }

  return fn;
};

const getDifferenceIn = (range: Range) => {
  let fn = differenceInDays;

  if (range === "monthly" || range === "quarterly") {
    fn = differenceInMonths;
  } else if (range === "weekly") {
    fn = differenceInWeeks;
  }

  return fn;
};

const getInnerDifferenceIn = (range: Range) => {
  let fn = differenceInHours;

  if (range === "monthly" || range === "quarterly") {
    fn = differenceInDays;
  } else if (range === "weekly") {
    fn = differenceInDays;
  }

  return fn;
};

const getStartOf = (range: Range) => {
  let fn = startOfDay;

  if (range === "monthly" || range === "quarterly") {
    fn = startOfMonth;
  } else if (range === "weekly") {
    fn = startOfWeek;
  }

  return fn;
};

const getEndOf = (range: Range) => {
  let fn = endOfDay;

  if (range === "monthly" || range === "quarterly") {
    fn = endOfMonth;
  } else if (range === "weekly") {
    fn = endOfWeek;
  }

  return fn;
};

const getAddRange = (range: Range) => {
  let fn = addDays;

  if (range === "monthly" || range === "quarterly") {
    fn = addMonths;
  } else if (range === "weekly") {
    fn = addWeeks;
  }

  return fn;
};

const getDateByMousePosition = (context: GanttContextProps, mouseX: number) => {
  const timelineStartDate = new Date(context.timelineData[0].year, 0, 1);
  const columnWidth = (context.columnWidth * context.zoom) / 100;
  const offset = Math.floor(mouseX / columnWidth);
  const daysIn = getsDaysIn(context.range);
  const addRange = getAddRange(context.range);
  const month = addRange(timelineStartDate, offset);
  const daysInMonth = daysIn(month);
  const pixelsPerDay = Math.round(columnWidth / daysInMonth);
  const dayOffset = Math.floor((mouseX % columnWidth) / pixelsPerDay);
  const actualDate = addDays(month, dayOffset);

  return actualDate;
};

const getDayDeltaByPixelDelta = (
  context: GanttContextProps,
  date: Date,
  pixelDelta: number,
) => {
  const timelineStartDate = new Date(context.timelineData[0].year, 0, 1);
  const offset = getOffset(date, timelineStartDate, context);
  const shiftedDate = getDateByMousePosition(context, offset + pixelDelta);

  return differenceInDays(shiftedDate, date);
};

const createInitialTimelineData = (today: Date) => {
  const data: TimelineData = [];

  data.push(
    { year: today.getFullYear() - 1, quarters: new Array(4).fill(null) },
    { year: today.getFullYear(), quarters: new Array(4).fill(null) },
    { year: today.getFullYear() + 1, quarters: new Array(4).fill(null) },
  );

  for (const yearObj of data) {
    yearObj.quarters = new Array(4).fill(null).map((_, quarterIndex) => ({
      months: new Array(3).fill(null).map((_, monthIndex) => {
        const month = quarterIndex * 3 + monthIndex;
        return {
          days: getDaysInMonth(new Date(yearObj.year, month, 1)),
        };
      }),
    }));
  }

  return data;
};

const getOffset = (
  date: Date,
  timelineStartDate: Date,
  context: GanttContextProps,
) => {
  const parsedColumnWidth = (context.columnWidth * context.zoom) / 100;
  const differenceIn = getDifferenceIn(context.range);
  const startOf = getStartOf(context.range);
  const fullColumns = differenceIn(startOf(date), timelineStartDate);

  if (context.range === "daily") {
    return parsedColumnWidth * fullColumns;
  }

  if (context.range === "weekly") {
    return (
      (differenceInDays(startOfDay(date), timelineStartDate) *
        parsedColumnWidth) /
      7
    );
  }

  const partialColumns = date.getDate();
  const daysInMonth = getDaysInMonth(date);
  const pixelsPerDay = parsedColumnWidth / daysInMonth;

  return fullColumns * parsedColumnWidth + partialColumns * pixelsPerDay;
};

const getWidth = (
  startAt: Date,
  endAt: Date | null,
  context: GanttContextProps,
) => {
  const parsedColumnWidth = (context.columnWidth * context.zoom) / 100;

  if (!endAt) {
    return parsedColumnWidth * 2;
  }

  const differenceIn = getDifferenceIn(context.range);

  if (context.range === "daily") {
    const delta = differenceIn(endAt, startAt);

    return parsedColumnWidth * (delta ? delta : 1);
  }

  if (context.range === "weekly") {
    const delta = differenceInDays(endAt, startAt);

    return Math.max(parsedColumnWidth / 7, (parsedColumnWidth * delta) / 7);
  }

  const daysInStartMonth = getDaysInMonth(startAt);
  const pixelsPerDayInStartMonth = parsedColumnWidth / daysInStartMonth;

  if (isSameDay(startAt, endAt)) {
    return pixelsPerDayInStartMonth;
  }

  const innerDifferenceIn = getInnerDifferenceIn(context.range);
  const startOf = getStartOf(context.range);

  if (isSameDay(startOf(startAt), startOf(endAt))) {
    return innerDifferenceIn(endAt, startAt) * pixelsPerDayInStartMonth;
  }

  const startRangeOffset = daysInStartMonth - getDate(startAt);
  const endRangeOffset = getDate(endAt);
  const fullRangeOffset = differenceIn(startOf(endAt), startOf(startAt));
  const daysInEndMonth = getDaysInMonth(endAt);
  const pixelsPerDayInEndMonth = parsedColumnWidth / daysInEndMonth;

  return (
    (fullRangeOffset - 1) * parsedColumnWidth +
    startRangeOffset * pixelsPerDayInStartMonth +
    endRangeOffset * pixelsPerDayInEndMonth
  );
};

export const getGanttRangeWidth = getWidth;

export const getGanttFeatureDragResolution = ({
  context,
  endAt,
  pixelDelta,
  startAt,
}: {
  context: GanttContextProps;
  endAt: Date | null;
  pixelDelta: number;
  startAt: Date;
}) => {
  const deltaDays = getDayDeltaByPixelDelta(context, startAt, pixelDelta);

  return {
    deltaDays,
    endAt: endAt ? addDays(endAt, deltaDays) : null,
    startAt: addDays(startAt, deltaDays),
  };
};

const calculateInnerOffset = (
  date: Date,
  range: Range,
  columnWidth: number,
) => {
  const startOf = getStartOf(range);
  const endOf = getEndOf(range);
  const differenceIn = getInnerDifferenceIn(range);
  const startOfRange = startOf(date);
  const endOfRange = endOf(date);
  const totalRangeDays = differenceIn(endOfRange, startOfRange);
  const offset =
    range === "weekly" ? differenceInDays(date, startOfRange) : date.getDate();

  return (offset / totalRangeDays) * columnWidth;
};

const GanttContext = createContext<GanttContextProps>({
  zoom: 100,
  range: "monthly",
  columnWidth: 50,
  headerHeight: 60,
  sidebarWidth: 300,
  rowHeight: 36,
  rowGap: 16,
  setRowHeight: () => undefined,
  setRowGap: () => undefined,
  onAddItem: undefined,
  placeholderLength: 2,
  timelineData: [],
  ref: null,
  scrollToFeature: undefined,
});

export const useGanttContext = () => useContext(GanttContext);

export type GanttContentHeaderProps = {
  renderHeaderItem: (index: number) => ReactNode;
  title: string;
  columns: number;
};

export const GanttContentHeader: FC<GanttContentHeaderProps> = ({
  title,
  columns,
  renderHeaderItem,
}) => {
  const id = useId();

  return (
    <div
      className="sticky top-0 z-20 grid w-full shrink-0 bg-backdrop/90 backdrop-blur-sm"
      style={{ height: "var(--gantt-header-height)" }}
    >
      <div>
        <div
          className="sticky inline-flex whitespace-nowrap px-3 py-2 text-muted-foreground text-xs"
          style={{
            left: "var(--gantt-sidebar-width)",
          }}
        >
          <p>{title}</p>
        </div>
      </div>
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: `repeat(${columns}, var(--gantt-column-width))`,
        }}
      >
        {Array.from({ length: columns }).map((_, index) => (
          <div
            className="shrink-0 border-border/50 border-b py-1 text-center text-xs"
            key={`${id}-${index}`}
          >
            {renderHeaderItem(index)}
          </div>
        ))}
      </div>
    </div>
  );
};

const DailyHeader: FC = () => {
  const gantt = useContext(GanttContext);

  return gantt.timelineData.map((year) =>
    year.quarters
      .flatMap((quarter) => quarter.months)
      .map((month, index) => (
        <div className="relative flex flex-col" key={`${year.year}-${index}`}>
          <GanttContentHeader
            columns={month.days}
            renderHeaderItem={(item: number) => (
              <div className="flex items-center justify-center gap-1">
                <p>
                  {format(addDays(new Date(year.year, index, 1), item), "d")}
                </p>
                <p className="text-muted-foreground">
                  {format(
                    addDays(new Date(year.year, index, 1), item),
                    "EEEEE",
                  )}
                </p>
              </div>
            )}
            title={format(new Date(year.year, index, 1), "MMMM yyyy")}
          />
          <GanttColumns
            columns={month.days}
            isColumnSecondary={(item: number) =>
              [0, 6].includes(
                addDays(new Date(year.year, index, 1), item).getDay(),
              )
            }
          />
        </div>
      )),
  );
};

const WeeklyHeader: FC = () => {
  const gantt = useContext(GanttContext);

  return gantt.timelineData.map((year) => {
    const firstDay = new Date(year.year, 0, 1);
    const columns = 53;

    return (
      <div className="relative flex flex-col" key={year.year}>
        <GanttContentHeader
          columns={columns}
          renderHeaderItem={(item: number) => {
            const weekStart = addWeeks(firstDay, item);

            return <p>{format(weekStart, "MMM d")}</p>;
          }}
          title={`${year.year}`}
        />
        <GanttColumns
          columns={columns}
          isColumnSecondary={(item: number) =>
            [0, 2].includes(addWeeks(firstDay, item).getMonth() % 3)
          }
        />
      </div>
    );
  });
};

const MonthlyHeader: FC = () => {
  const gantt = useContext(GanttContext);

  return gantt.timelineData.map((year) => (
    <div className="relative flex flex-col" key={year.year}>
      <GanttContentHeader
        columns={year.quarters.flatMap((quarter) => quarter.months).length}
        renderHeaderItem={(item: number) => (
          <p>{format(new Date(year.year, item, 1), "MMM")}</p>
        )}
        title={`${year.year}`}
      />
      <GanttColumns
        columns={year.quarters.flatMap((quarter) => quarter.months).length}
      />
    </div>
  ));
};

const QuarterlyHeader: FC = () => {
  const gantt = useContext(GanttContext);

  return gantt.timelineData.map((year) =>
    year.quarters.map((quarter, quarterIndex) => (
      <div
        className="relative flex flex-col"
        key={`${year.year}-${quarterIndex}`}
      >
        <GanttContentHeader
          columns={quarter.months.length}
          renderHeaderItem={(item: number) => (
            <p>
              {format(new Date(year.year, quarterIndex * 3 + item, 1), "MMM")}
            </p>
          )}
          title={`Q${quarterIndex + 1} ${year.year}`}
        />
        <GanttColumns columns={quarter.months.length} />
      </div>
    )),
  );
};

const headers: Record<Range, FC> = {
  daily: DailyHeader,
  weekly: WeeklyHeader,
  monthly: MonthlyHeader,
  quarterly: QuarterlyHeader,
};

export type GanttHeaderProps = {
  className?: string;
};

export const GanttHeader: FC<GanttHeaderProps> = ({ className }) => {
  const gantt = useContext(GanttContext);
  const Header = headers[gantt.range];

  return (
    <div
      className={cn(
        "flex h-full w-max -space-x-px divide-x divide-border/50",
        className,
      )}
    >
      <Header />
    </div>
  );
};

export type GanttSidebarItemProps = {
  feature: GanttFeature;
  onSelectItem?: (id: string) => void;
  className?: string;
  children?: ReactNode;
};

export const GanttSidebarItem: FC<GanttSidebarItemProps> = ({
  children,
  feature,
  onSelectItem,
  className,
}) => {
  const gantt = useContext(GanttContext);
  const tempEndAt =
    feature.endAt && isSameDay(feature.startAt, feature.endAt)
      ? addDays(feature.endAt, 1)
      : feature.endAt;
  const duration = tempEndAt
    ? formatDistance(feature.startAt, tempEndAt)
    : `${formatDistance(feature.startAt, new Date())} so far`;

  const handleClick: MouseEventHandler<HTMLDivElement> = (event) => {
    if (isGanttInteractiveTarget(event.target)) {
      return;
    }
    gantt.scrollToFeature?.(feature);
    onSelectItem?.(feature.id);
  };

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key === "Enter") {
      gantt.scrollToFeature?.(feature);
      onSelectItem?.(feature.id);
    }
  };

  return (
    <div
      className={cn(
        "relative px-2.5 text-xs hover:bg-secondary",
        className,
      )}
      key={feature.id}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      // biome-ignore lint/a11y/useSemanticElements: "This is a clickable item"
      role="button"
      style={{
        height: "calc(var(--gantt-row-height) + var(--gantt-row-gap))",
        paddingBottom: "calc(var(--gantt-row-gap) / 2)",
        paddingTop: "calc(var(--gantt-row-gap) / 2)",
      }}
      tabIndex={0}
    >
      <div
        className="flex items-center gap-2.5"
        style={{
          height: "var(--gantt-row-height)",
        }}
      >
        {children ?? (
          <>
            {/* <Checkbox onCheckedChange={handleCheck} className="shrink-0" /> */}
            <div
              className="pointer-events-none h-2 w-2 shrink-0 rounded-full"
              style={{
                backgroundColor: feature.status.color,
              }}
            />
            <p className="pointer-events-none flex-1 truncate text-left font-medium">
              {feature.name}
            </p>
            <p className="pointer-events-none text-muted-foreground">
              {duration}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export type GanttSidebarHeaderProps = {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};

export const GanttSidebarHeader: FC<GanttSidebarHeaderProps> = ({
  collapsed,
  onCollapsedChange,
}) => {
  const gantt = useContext(GanttContext);

  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex shrink-0 flex-col justify-center gap-1.5 border-border/50 border-b bg-backdrop/90 font-medium text-muted-foreground text-xs backdrop-blur-sm",
        collapsed ? "p-1.5" : "p-2.5",
      )}
      style={{ height: "var(--gantt-header-height)" }}
    >
      <div
        className={cn(
          "flex items-center gap-2.5",
          collapsed ? "h-full justify-center" : "justify-between",
        )}
      >
        {collapsed ? null : (
          <p className="flex-1 truncate text-left">Milestone</p>
        )}
        {collapsed ? null : <p className="shrink-0">Draw</p>}
        {onCollapsedChange ? (
          <button
            aria-label={
              collapsed ? "Expand Gantt sidebar" : "Collapse Gantt sidebar"
            }
            className={cn(
              "grid shrink-0 place-items-center rounded-sm border border-border text-muted-foreground transition-colors hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-cyan-700 dark:text-cyan-100",
              collapsed ? "h-full w-full" : "size-6",
            )}
            data-gantt-interactive="true"
            onClick={() => onCollapsedChange(!collapsed)}
            title={
              collapsed ? "Expand milestone labels" : "Collapse milestone labels"
            }
            type="button"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-3.5" />
            ) : (
              <PanelLeftClose className="size-3.5" />
            )}
          </button>
        ) : null}
      </div>
      {collapsed ? null : (
        <div className="grid grid-cols-2 gap-2 text-[0.65rem] leading-none">
          <label className="grid gap-1">
            <span className="flex items-center justify-between gap-1">
              Row <span>{gantt.rowHeight}px</span>
            </span>
            <input
              aria-label="Gantt row height"
              className="h-1.5 w-full accent-cyan-300"
              data-gantt-interactive="true"
              max={72}
              min={24}
              onChange={(event) =>
                gantt.setRowHeight(Number(event.target.value))
              }
              type="range"
              value={gantt.rowHeight}
            />
          </label>
          <label className="grid gap-1">
            <span className="flex items-center justify-between gap-1">
              Gap <span>{gantt.rowGap}px</span>
            </span>
            <input
              aria-label="Gantt row gap"
              className="h-1.5 w-full accent-cyan-300"
              data-gantt-interactive="true"
              max={32}
              min={0}
              onChange={(event) => gantt.setRowGap(Number(event.target.value))}
              type="range"
              value={gantt.rowGap}
            />
          </label>
        </div>
      )}
    </div>
  );
};

export type GanttSidebarGroupProps = {
  children: ReactNode;
  name: string;
  className?: string;
};

export const GanttSidebarGroup: FC<GanttSidebarGroupProps> = ({
  children,
  name,
  className,
}) => (
  <div className={className}>
    <p
      className="w-full truncate p-2.5 text-left font-medium text-muted-foreground text-xs"
      style={{ height: "var(--gantt-row-height)" }}
    >
      {name}
    </p>
    <div className="divide-y divide-border/50">{children}</div>
  </div>
);

export type GanttSidebarProps = {
  children: ReactNode;
  className?: string;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};

export const GanttSidebar: FC<GanttSidebarProps> = ({
  children,
  className,
  collapsed,
  onCollapsedChange,
}) => (
  <div
    className={cn(
      "sticky z-30 h-full max-h-full min-h-0 overflow-hidden border-border/50 border-r bg-background/90 backdrop-blur-md",
      className,
    )}
    data-roadmap-ui="gantt-sidebar"
    style={{ left: "var(--gantt-leading-sidebar-width)" }}
  >
    <GanttSidebarHeader
      collapsed={collapsed}
      onCollapsedChange={onCollapsedChange}
    />
    <div className="h-[calc(100%-var(--gantt-header-height))] overflow-y-auto overscroll-contain">
      {children}
    </div>
  </div>
);

export type GanttAddFeatureHelperProps = {
  top: number;
  className?: string;
};

export const GanttAddFeatureHelper: FC<GanttAddFeatureHelperProps> = ({
  top,
  className,
}) => {
  const [scrollX] = useGanttScrollX();
  const gantt = useContext(GanttContext);
  const [mousePosition, mouseRef] = useMouse<HTMLDivElement>();

  const handleClick = () => {
    const ganttRect = gantt.ref?.current?.getBoundingClientRect();
    const x =
      mousePosition.x - (ganttRect?.left ?? 0) + scrollX - gantt.sidebarWidth;
    const currentDate = getDateByMousePosition(gantt, x);

    gantt.onAddItem?.(currentDate);
  };

  return (
    <div
      className={cn("absolute top-0 w-full px-0.5", className)}
      ref={mouseRef}
      style={{
        marginTop: -gantt.rowHeight / 2,
        transform: `translateY(${top}px)`,
      }}
    >
      <button
        className="flex h-full w-full items-center justify-center rounded-md border border-dashed p-2"
        onClick={handleClick}
        type="button"
      >
        <PlusIcon
          className="pointer-events-none select-none text-muted-foreground"
          size={16}
        />
      </button>
    </div>
  );
};

export type GanttColumnProps = {
  index: number;
  isColumnSecondary?: (item: number) => boolean;
};

export const GanttColumn: FC<GanttColumnProps> = ({
  index,
  isColumnSecondary,
}) => {
  const gantt = useContext(GanttContext);
  const [dragging] = useGanttDragging();
  const [mousePosition, mouseRef] = useMouse<HTMLDivElement>();
  const [hovering, setHovering] = useState(false);
  const [windowScroll] = useWindowScroll();

  const handleMouseEnter = () => setHovering(true);
  const handleMouseLeave = () => setHovering(false);

  const top = useThrottle(
    mousePosition.y -
      (mouseRef.current?.getBoundingClientRect().y ?? 0) -
      (windowScroll.y ?? 0),
    10,
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: "This is a clickable column"
    // biome-ignore lint/nursery/noNoninteractiveElementInteractions: "This is a clickable column"
    <div
      className={cn(
        "group relative h-full overflow-hidden",
        isColumnSecondary?.(index) ? "bg-secondary" : "",
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      ref={mouseRef}
    >
      {!dragging && hovering && gantt.onAddItem ? (
        <GanttAddFeatureHelper top={top} />
      ) : null}
    </div>
  );
};

export type GanttColumnsProps = {
  columns: number;
  isColumnSecondary?: (item: number) => boolean;
};

export const GanttColumns: FC<GanttColumnsProps> = ({
  columns,
  isColumnSecondary,
}) => {
  const id = useId();

  return (
    <div
      className="divide grid h-full w-full divide-x divide-border/50"
      style={{
        gridTemplateColumns: `repeat(${columns}, var(--gantt-column-width))`,
      }}
    >
      {Array.from({ length: columns }).map((_, index) => (
        <GanttColumn
          index={index}
          isColumnSecondary={isColumnSecondary}
          key={`${id}-${index}`}
        />
      ))}
    </div>
  );
};

export type GanttCreateMarkerTriggerProps = {
  onCreateMarker: (date: Date) => void;
  className?: string;
};

export const GanttCreateMarkerTrigger: FC<GanttCreateMarkerTriggerProps> = ({
  onCreateMarker,
  className,
}) => {
  const gantt = useContext(GanttContext);
  const [mousePosition, mouseRef] = useMouse<HTMLDivElement>();
  const [windowScroll] = useWindowScroll();
  const x = useThrottle(
    mousePosition.x -
      (mouseRef.current?.getBoundingClientRect().x ?? 0) -
      (windowScroll.x ?? 0),
    10,
  );

  const date = getDateByMousePosition(gantt, x);

  const handleClick = () => onCreateMarker(date);

  return (
    <div
      className={cn(
        "group pointer-events-none absolute top-0 left-0 h-full w-full select-none overflow-visible",
        className,
      )}
      ref={mouseRef}
    >
      <div
        className="pointer-events-auto sticky top-6 z-20 -ml-2 flex w-4 flex-col items-center justify-center gap-1 overflow-visible opacity-0 group-hover:opacity-100"
        style={{ transform: `translateX(${x}px)` }}
      >
        <button
          className="z-50 inline-flex h-4 w-4 items-center justify-center rounded-full bg-card"
          onClick={handleClick}
          type="button"
        >
          <PlusIcon className="text-muted-foreground" size={12} />
        </button>
        <div className="whitespace-nowrap rounded-full border border-border/50 bg-background/90 px-2 py-1 text-foreground text-xs backdrop-blur-lg">
          {formatDate(date, "MMM dd, yyyy")}
        </div>
      </div>
    </div>
  );
};

export type GanttFeatureDragHelperProps = {
  featureId: GanttFeature["id"];
  direction: "left" | "right";
  date: Date | null;
};

export const GanttFeatureDragHelper: FC<GanttFeatureDragHelperProps> = ({
  direction,
  featureId,
  date,
}) => {
  const [, setDragging] = useGanttDragging();
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `feature-drag-helper-${featureId}`,
  });

  const isPressed = Boolean(attributes["aria-pressed"]);

  useEffect(() => setDragging(isPressed), [isPressed, setDragging]);

  return (
    <div
      className={cn(
        "group !cursor-col-resize absolute top-1/2 z-[3] h-full w-6 -translate-y-1/2 rounded-md outline-none",
        direction === "left" ? "-left-2.5" : "-right-2.5",
      )}
      data-gantt-interactive="true"
      data-testid={`timeline-${featureId}-${direction}-resize-handle`}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
    >
      <div
        className={cn(
          "absolute top-1/2 h-[80%] w-1 -translate-y-1/2 rounded-sm bg-muted-foreground opacity-0 transition-all",
          direction === "left" ? "left-2.5" : "right-2.5",
          direction === "left" ? "group-hover:left-0" : "group-hover:right-0",
          isPressed && (direction === "left" ? "left-0" : "right-0"),
          "group-hover:opacity-100",
          isPressed && "opacity-100",
        )}
      />
      {date && (
        <div
          className={cn(
            "absolute top-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-border/50 bg-background/90 px-2 py-1 text-foreground text-xs backdrop-blur-lg group-hover:block",
            isPressed && "block",
          )}
        >
          {format(date, "MMM dd, yyyy")}
        </div>
      )}
    </div>
  );
};

export type GanttFeatureItemCardProps = Pick<GanttFeature, "id"> & {
  children?: ReactNode;
  disabled?: boolean;
};

export const GanttFeatureItemCard: FC<GanttFeatureItemCardProps> = ({
  id,
  children,
  disabled,
}) => {
  const [, setDragging] = useGanttDragging();
  const { attributes, listeners, setNodeRef } = useDraggable({ id, disabled });
  const isPressed = Boolean(attributes["aria-pressed"]);

  useEffect(() => setDragging(isPressed), [isPressed, setDragging]);

  return (
    <Card
      id="GanttFeatureItemCard"
      className="h-full w-full border-transparent bg-transparent p-0 text-sm shadow-none"
    >
      <div
        className={cn(
          "flex h-full w-full items-center justify-between gap-2 text-left",
          isPressed && "cursor-grabbing",
        )}
        {...attributes}
        {...listeners}
        ref={setNodeRef}
      >
        {children}
      </div>
    </Card>
  );
};

export type GanttFeatureItemProps = GanttFeature & {
  onMove?: (id: string, startDate: Date, endDate: Date | null) => void;
  disabled?: boolean;
  selected?: boolean;
  batchMoveIds?: string[];
  onBatchMove?: (deltaDays: number) => void;
  onBatchPreviewChange?: (preview: { deltaDays: number } | null) => void;
  onPreviewChange?: (preview: { deltaDays: number } | null) => void;
  children?: ReactNode;
  className?: string;
};

export const GanttFeatureItem: FC<GanttFeatureItemProps> = ({
  onMove,
  disabled,
  selected,
  batchMoveIds,
  onBatchMove,
  onBatchPreviewChange,
  onPreviewChange,
  children,
  className,
  ...feature
}) => {
  const [scrollX] = useGanttScrollX();
  const gantt = useContext(GanttContext);
  const timelineStartDate = useMemo(
    () => new Date(gantt.timelineData.at(0)?.year ?? 0, 0, 1),
    [gantt.timelineData],
  );
  const [startAt, setStartAt] = useState<Date>(feature.startAt);
  const [endAt, setEndAt] = useState<Date | null>(feature.endAt);

  useEffect(() => {
    setStartAt(feature.startAt);
    setEndAt(feature.endAt);
  }, [feature.startAt, feature.endAt]);

  // Memoize expensive calculations
  const width = useMemo(
    () => getWidth(startAt, endAt, gantt),
    [startAt, endAt, gantt],
  );
  const offset = useMemo(
    () => getOffset(startAt, timelineStartDate, gantt),
    [startAt, timelineStartDate, gantt],
  );

  const addRange = useMemo(() => getAddRange(gantt.range), [gantt.range]);
  const [mousePosition] = useMouse<HTMLDivElement>();

  const [previousStartAt, setPreviousStartAt] = useState(startAt);
  const [previousEndAt, setPreviousEndAt] = useState(endAt);
  const [dragDeltaDays, setDragDeltaDays] = useState(0);
  const batchDragEnabled =
    !disabled && selected && (batchMoveIds?.length ?? 0) > 1 && onBatchMove;

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 10,
    },
  });

  const handleItemDragStart = useCallback(() => {
    setPreviousStartAt(startAt);
    setPreviousEndAt(endAt);
    setDragDeltaDays(0);
  }, [startAt, endAt]);

  const handleItemDragMove = useCallback(
    (event: { delta: { x: number } }) => {
      const preview = getGanttFeatureDragResolution({
        context: gantt,
        endAt: previousEndAt,
        pixelDelta: event.delta.x,
        startAt: previousStartAt,
      });
      setDragDeltaDays(preview.deltaDays);
      if (batchDragEnabled) {
        onBatchPreviewChange?.({ deltaDays: preview.deltaDays });
        return;
      }
      onPreviewChange?.({ deltaDays: preview.deltaDays });
    },
    [
      batchDragEnabled,
      gantt,
      onBatchPreviewChange,
      onPreviewChange,
      previousStartAt,
      previousEndAt,
    ],
  );

  const onItemDragEnd = useCallback(
    (event?: { delta: { x: number } }) => {
      const finalPreview = event?.delta
        ? getGanttFeatureDragResolution({
            context: gantt,
            endAt: previousEndAt,
            pixelDelta: event.delta.x,
            startAt: previousStartAt,
          })
        : {
            deltaDays: dragDeltaDays,
            endAt: previousEndAt ? addDays(previousEndAt, dragDeltaDays) : null,
            startAt: addDays(previousStartAt, dragDeltaDays),
          };
      onBatchPreviewChange?.(null);
      if (batchDragEnabled) {
        if (finalPreview.deltaDays !== 0) {
          onBatchMove?.(finalPreview.deltaDays);
        }
        return;
      }
      onPreviewChange?.(null);
      if (finalPreview.deltaDays === 0) {
        return;
      }
      onMove?.(feature.id, finalPreview.startAt, finalPreview.endAt);
    },
    [
      batchDragEnabled,
      dragDeltaDays,
      feature.id,
      gantt,
      onBatchMove,
      onBatchPreviewChange,
      onMove,
      onPreviewChange,
      previousStartAt,
      previousEndAt,
    ],
  );

  const onResizeDragEnd = useCallback(() => {
    onBatchPreviewChange?.(null);
    onPreviewChange?.(null);
    onMove?.(feature.id, startAt, endAt);
  }, [feature.id, onBatchPreviewChange, onMove, onPreviewChange, startAt, endAt]);

  const onDragCancel = useCallback(() => {
    onBatchPreviewChange?.(null);
    onPreviewChange?.(null);
    setStartAt(feature.startAt);
    setEndAt(feature.endAt);
  }, [feature.startAt, feature.endAt, onBatchPreviewChange, onPreviewChange]);

  const handleLeftDragMove = useCallback(() => {
    const ganttRect = gantt.ref?.current?.getBoundingClientRect();
    const x =
      mousePosition.x - (ganttRect?.left ?? 0) + scrollX - gantt.sidebarWidth;
    const newStartAt = getDateByMousePosition(gantt, x);

    setStartAt(newStartAt);
  }, [gantt, mousePosition.x, scrollX]);

  const handleRightDragMove = useCallback(() => {
    const ganttRect = gantt.ref?.current?.getBoundingClientRect();
    const x =
      mousePosition.x - (ganttRect?.left ?? 0) + scrollX - gantt.sidebarWidth;
    const newEndAt = getDateByMousePosition(gantt, x);

    setEndAt(newEndAt);
  }, [gantt, mousePosition.x, scrollX]);

  return (
    <div
      className={cn("relative flex w-max min-w-full", className)}
      style={{
        height: "calc(var(--gantt-row-height) + var(--gantt-row-gap))",
        paddingBottom: "calc(var(--gantt-row-gap) / 2)",
        paddingTop: "calc(var(--gantt-row-gap) / 2)",
      }}
    >
      <div
        className="pointer-events-auto absolute top-0 z-[3]"
        data-gantt-feature-id={feature.id}
        data-gantt-interactive="true"
        style={{
          height: "var(--gantt-row-height)",
          width: Math.round(width),
          left: Math.round(offset),
          top: "calc(var(--gantt-row-gap) / 2)",
          scrollMarginLeft:
            "calc(var(--gantt-leading-sidebar-width) + var(--gantt-kibo-sidebar-width) + 2rem)",
        }}
      >
        {onMove && !disabled && (
          <DndContext
            modifiers={[restrictToHorizontalAxis]}
            onDragEnd={onResizeDragEnd}
            onDragCancel={onDragCancel}
            onDragMove={handleLeftDragMove}
            sensors={[mouseSensor]}
          >
            <GanttFeatureDragHelper
              date={startAt}
              direction="left"
              featureId={feature.id}
            />
          </DndContext>
        )}
        {disabled ? (
          <GanttFeatureItemCard disabled id={feature.id}>
            {children ?? (
              <p className="flex-1 truncate text-xs">{feature.name}</p>
            )}
          </GanttFeatureItemCard>
        ) : (
          <DndContext
            modifiers={[restrictToHorizontalAxis]}
            onDragCancel={onDragCancel}
            onDragEnd={onItemDragEnd}
            onDragMove={handleItemDragMove}
            onDragStart={handleItemDragStart}
            sensors={[mouseSensor]}
          >
            <GanttFeatureItemCard id={feature.id}>
              {children ?? (
                <p className="flex-1 truncate text-xs">{feature.name}</p>
              )}
            </GanttFeatureItemCard>
          </DndContext>
        )}
        {onMove && !disabled && (
          <DndContext
            modifiers={[restrictToHorizontalAxis]}
            onDragCancel={onDragCancel}
            onDragEnd={onResizeDragEnd}
            onDragMove={handleRightDragMove}
            sensors={[mouseSensor]}
          >
            <GanttFeatureDragHelper
              date={endAt ?? addRange(startAt, 2)}
              direction="right"
              featureId={feature.id}
            />
          </DndContext>
        )}
      </div>
    </div>
  );
};

export type GanttFeatureListGroupProps = {
  children: ReactNode;
  className?: string;
};

export const GanttFeatureListGroup: FC<GanttFeatureListGroupProps> = ({
  children,
  className,
}) => (
  <div className={className} style={{ paddingTop: "var(--gantt-row-height)" }}>
    {children}
  </div>
);

export type GanttFeatureRowProps = {
  features: GanttFeature[];
  onMove?: (id: string, startAt: Date, endAt: Date | null) => void;
  disabledIds?: Set<string>;
  selectedIds?: Set<string>;
  batchMoveIds?: string[];
  onBatchMove?: (featureId: string, deltaDays: number) => void;
  onBatchPreviewChange?: (
    featureId: string,
    preview: { deltaDays: number } | null,
  ) => void;
  onPreviewChange?: (
    featureId: string,
    preview: { deltaDays: number } | null,
  ) => void;
  children?: (feature: GanttFeature) => ReactNode;
  className?: string;
};

export const GanttFeatureRow: FC<GanttFeatureRowProps> = ({
  features,
  onMove,
  disabledIds,
  selectedIds,
  batchMoveIds,
  onBatchMove,
  onBatchPreviewChange,
  onPreviewChange,
  children,
  className,
}) => {
  const gantt = useContext(GanttContext);
  // Sort features by start date to handle potential overlaps
  const sortedFeatures = [...features].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime(),
  );

  // Calculate sub-row positions for overlapping features using a proper algorithm
  const featureWithPositions = [];
  const subRowEndTimes: Date[] = []; // Track when each sub-row becomes free

  for (const feature of sortedFeatures) {
    let subRow = 0;

    // Find the first sub-row that's free (doesn't overlap)
    while (
      subRow < subRowEndTimes.length &&
      subRowEndTimes[subRow] > feature.startAt
    ) {
      subRow++;
    }

    // Update the end time for this sub-row
    if (subRow === subRowEndTimes.length) {
      subRowEndTimes.push(feature.endAt);
    } else {
      subRowEndTimes[subRow] = feature.endAt;
    }

    featureWithPositions.push({ ...feature, subRow });
  }

  const maxSubRows = Math.max(1, subRowEndTimes.length);
  const subRowHeight = gantt.rowHeight + gantt.rowGap;

  return (
    <div
      className={cn("relative", className)}
      style={{
        height: `${maxSubRows * subRowHeight}px`,
        minHeight: "calc(var(--gantt-row-height) + var(--gantt-row-gap))",
      }}
    >
      {featureWithPositions.map((feature) => (
        <div
          className="absolute w-full"
          key={feature.id}
          style={{
            top: `${feature.subRow * subRowHeight}px`,
            height: `${subRowHeight}px`,
          }}
        >
          <GanttFeatureItem
            {...feature}
            batchMoveIds={batchMoveIds}
            disabled={disabledIds?.has(feature.id)}
            onBatchMove={(deltaDays) => onBatchMove?.(feature.id, deltaDays)}
            onBatchPreviewChange={(preview) =>
              onBatchPreviewChange?.(feature.id, preview)
            }
            onMove={onMove}
            onPreviewChange={(preview) =>
              onPreviewChange?.(feature.id, preview)
            }
            selected={selectedIds?.has(feature.id)}
          >
            {children ? (
              children(feature)
            ) : (
              <p className="flex-1 truncate text-xs">{feature.name}</p>
            )}
          </GanttFeatureItem>
        </div>
      ))}
    </div>
  );
};

export type GanttFeatureListProps = {
  className?: string;
  children: ReactNode;
};

export const GanttFeatureList: FC<GanttFeatureListProps> = ({
  className,
  children,
}) => (
  <div
    className={cn(
      "absolute top-0 left-0 flex h-full w-max flex-col",
      className,
    )}
    style={{
      gap: 0,
      marginTop: "var(--gantt-header-height)",
    }}
  >
    {children}
  </div>
);

export type GanttSelectionLayerProps = {
  features: GanttFeature[];
  onSelectionChange: (ids: string[]) => void;
  onEmptyClick?: () => void;
  disabled?: boolean;
};

type GanttSelectionRect = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

const isGanttInteractiveTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest('[data-gantt-interactive="true"]'));

export const GanttSelectionLayer: FC<GanttSelectionLayerProps> = ({
  disabled,
  features,
  onEmptyClick,
  onSelectionChange,
}) => {
  const gantt = useContext(GanttContext);
  const [selectionRect, setSelectionRect] = useState<GanttSelectionRect | null>(
    null,
  );
  const selectionRectRef = useRef<GanttSelectionRect | null>(null);
  const didDragRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const featureIds = useMemo(
    () => new Set(features.map((feature) => feature.id)),
    [features],
  );

  const getIntersectingFeatureIds = useCallback(
    (rect: GanttSelectionRect) => {
      const left = Math.min(rect.startX, rect.currentX);
      const right = Math.max(rect.startX, rect.currentX);
      const top = Math.min(rect.startY, rect.currentY);
      const bottom = Math.max(rect.startY, rect.currentY);
      return Array.from(
        document.querySelectorAll<HTMLElement>("[data-gantt-feature-id]"),
      )
        .filter((element) => {
          const id = element.dataset.ganttFeatureId;
          if (!id || !featureIds.has(id)) {
            return false;
          }
          const bounds = element.getBoundingClientRect();
          return (
            bounds.left <= right &&
            bounds.right >= left &&
            bounds.top <= bottom &&
            bounds.bottom >= top
          );
        })
        .map((element) => element.dataset.ganttFeatureId)
        .filter((id): id is string => Boolean(id));
    },
    [featureIds],
  );

  const clearPointerState = useCallback(
    (target: HTMLElement, pointerId: number) => {
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
      activePointerIdRef.current = null;
      selectionRectRef.current = null;
      setSelectionRect(null);
    },
    [],
  );

  if (disabled) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-0 z-[2] w-full"
      style={{
        top: gantt.headerHeight,
        height: `calc(100% - ${gantt.headerHeight}px)`,
      }}
    >
      <div
        className="pointer-events-auto absolute inset-0 cursor-crosshair"
        data-testid="gantt-selection-layer"
        onPointerCancel={(event) => {
          if (activePointerIdRef.current !== event.pointerId) {
            return;
          }
          clearPointerState(event.currentTarget, event.pointerId);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          const hitTarget = document.elementFromPoint(
            event.clientX,
            event.clientY,
          );
          if (
            isGanttInteractiveTarget(event.target) ||
            isGanttInteractiveTarget(hitTarget)
          ) {
            return;
          }
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          const rect = {
            startX: event.clientX,
            startY: event.clientY,
            currentX: event.clientX,
            currentY: event.clientY,
          };
          activePointerIdRef.current = event.pointerId;
          didDragRef.current = false;
          selectionRectRef.current = rect;
          setSelectionRect(rect);
        }}
        onPointerMove={(event) => {
          const current = selectionRectRef.current;
          if (
            activePointerIdRef.current !== event.pointerId ||
            current === null
          ) {
            return;
          }
          const next = {
            ...current,
            currentX: event.clientX,
            currentY: event.clientY,
          };
          selectionRectRef.current = next;
          setSelectionRect(next);
          if (
            Math.abs(next.currentX - next.startX) > 4 ||
            Math.abs(next.currentY - next.startY) > 4
          ) {
            didDragRef.current = true;
            onSelectionChange(getIntersectingFeatureIds(next));
          }
        }}
        onPointerUp={(event) => {
          const current = selectionRectRef.current;
          if (
            activePointerIdRef.current !== event.pointerId ||
            current === null
          ) {
            return;
          }
          if (didDragRef.current) {
            onSelectionChange(getIntersectingFeatureIds(current));
          } else {
            onEmptyClick?.();
          }
          didDragRef.current = false;
          clearPointerState(event.currentTarget, event.pointerId);
        }}
      />
      {selectionRect ? (
        <div
          className="pointer-events-none fixed z-[70] border border-cyan-200/80 bg-cyan-300/15"
          data-testid="gantt-selection-marquee"
          style={{
            left: Math.min(selectionRect.startX, selectionRect.currentX),
            top: Math.min(selectionRect.startY, selectionRect.currentY),
            width: Math.abs(selectionRect.currentX - selectionRect.startX),
            height: Math.abs(selectionRect.currentY - selectionRect.startY),
          }}
        />
      ) : null}
    </div>
  );
};

export const GanttMarker: FC<
  GanttMarkerProps & {
    onRemove?: (id: string) => void;
    className?: string;
    containerClassName?: string;
    labelClassName?: string;
  }
> = memo(
  ({
    clickLabel,
    label,
    date,
    id,
    onClick,
    onRemove,
    className,
    containerClassName,
    labelClassName,
    detail,
    detailTestId,
    testId,
  }) => {
    const gantt = useContext(GanttContext);
    const differenceIn = useMemo(
      () => getDifferenceIn(gantt.range),
      [gantt.range],
    );
    const timelineStartDate = useMemo(
      () => new Date(gantt.timelineData.at(0)?.year ?? 0, 0, 1),
      [gantt.timelineData],
    );

    // Memoize expensive calculations
    const offset = useMemo(
      () => differenceIn(date, timelineStartDate),
      [differenceIn, date, timelineStartDate],
    );
    const innerOffset = useMemo(
      () =>
        calculateInnerOffset(
          date,
          gantt.range,
          (gantt.columnWidth * gantt.zoom) / 100,
        ),
      [date, gantt.range, gantt.columnWidth, gantt.zoom],
    );

    const handleRemove = useCallback(() => onRemove?.(id), [onRemove, id]);
    const handleClick = useCallback(() => onClick?.(id), [onClick, id]);
    const markerContent = (
      <>
        {label}
        <span
          className="mt-1 block max-h-[0] overflow-hidden text-left text-[0.68rem] leading-tight opacity-80 transition-all group-hover:max-h-32 group-focus-within:max-h-32"
          data-testid={detailTestId}
        >
          {detail ?? formatDate(date, "MMM dd, yyyy")}
        </span>
      </>
    );

    return (
      <div
        className={cn(
          "pointer-events-none absolute top-0 left-0 z-20 flex h-full select-none flex-col items-center justify-center overflow-visible transition-[z-index] hover:z-[70] focus-within:z-[70]",
          containerClassName,
        )}
        data-gantt-marker-container={id}
        style={{
          width: 0,
          transform: `translateX(calc(var(--gantt-column-width) * ${offset} + ${innerOffset}px))`,
        }}
      >
        <ContextMenu>
          <ContextMenuTrigger
            render={
              onClick ? (
                <button
                  aria-label={clickLabel}
                  className={cn(
                    "group pointer-events-auto sticky top-0 z-30 flex select-auto flex-col flex-nowrap items-center justify-center whitespace-nowrap rounded-b-md bg-card px-2.5 py-1.5 font-medium text-foreground text-xs shadow-lg outline-none transition-[filter] hover:brightness-105 focus-visible:ring-2 focus-visible:ring-cyan-300/60",
                    labelClassName,
                    className,
                  )}
                  data-gantt-interactive="true"
                  data-testid={testId}
                  onClick={handleClick}
                  style={{
                    scrollMarginLeft:
                      "calc(var(--gantt-leading-sidebar-width) + var(--gantt-kibo-sidebar-width) + 2rem)",
                  }}
                  type="button"
                />
              ) : (
                <div
                  className={cn(
                    "group pointer-events-auto sticky top-0 z-30 flex select-auto flex-col flex-nowrap items-center justify-center whitespace-nowrap rounded-b-md bg-card px-2.5 py-1.5 font-medium text-foreground text-xs shadow-lg",
                    labelClassName,
                    className,
                  )}
                  data-gantt-interactive="true"
                  data-testid={testId}
                  style={{
                    scrollMarginLeft:
                      "calc(var(--gantt-leading-sidebar-width) + var(--gantt-kibo-sidebar-width) + 2rem)",
                  }}
                />
              )
            }
          >
            {markerContent}
          </ContextMenuTrigger>
          <ContextMenuContent>
            {onRemove ? (
              <ContextMenuItem
                className="flex items-center gap-2 text-destructive"
                onClick={handleRemove}
              >
                <TrashIcon size={16} />
                Remove marker
              </ContextMenuItem>
            ) : null}
          </ContextMenuContent>
        </ContextMenu>
        <div className={cn("relative z-10 h-full w-0.5 bg-card", className)} />
      </div>
    );
  },
);

GanttMarker.displayName = "GanttMarker";

export type GanttRangeOverlayProps = {
  id: string;
  startAt: Date;
  endAt: Date;
  rowIndex: number;
  rowSpan: number;
  children?: ReactNode;
  className?: string;
  dragDisabled?: boolean;
  onMoveDelta?: (deltaDays: number) => void;
  onPreviewDelta?: (deltaDays: number | null) => void;
  testId?: string;
};

export const GanttRangeOverlay: FC<GanttRangeOverlayProps> = ({
  startAt,
  endAt,
  rowIndex,
  rowSpan,
  children,
  className,
  testId,
}) => {
  const gantt = useContext(GanttContext);
  const timelineStartDate = useMemo(
    () => new Date(gantt.timelineData.at(0)?.year ?? 0, 0, 1),
    [gantt.timelineData],
  );
  const width = useMemo(
    () => getWidth(startAt, endAt, gantt),
    [startAt, endAt, gantt],
  );
  const offset = useMemo(
    () => getOffset(startAt, timelineStartDate, gantt),
    [startAt, timelineStartDate, gantt],
  );
  return (
    <div
      className={cn(
        "pointer-events-none absolute rounded-md border border-dashed bg-background/20",
        className,
      )}
      data-testid={testId}
      style={{
        top: gantt.headerHeight + rowIndex * (gantt.rowHeight + gantt.rowGap),
        left: Math.round(offset),
        width: Math.round(width),
        height: Math.max(
          gantt.rowHeight,
          rowSpan * gantt.rowHeight + (rowSpan - 1) * gantt.rowGap,
        ),
      }}
    >
      {children}
    </div>
  );
};

export type GanttRangeDragHandleProps = {
  children: ReactNode;
  className?: string;
  contentButtonLabel?: string;
  contentTestId?: string;
  disabled?: boolean;
  onContentClick?: MouseEventHandler<HTMLButtonElement>;
  onMoveDelta?: (deltaDays: number) => void;
  onPreviewDelta?: (deltaDays: number | null) => void;
  startAt?: Date;
  style?: CSSProperties;
  testId?: string;
  title?: string;
};

export const GanttRangeDragHandle: FC<GanttRangeDragHandleProps> = ({
  children,
  className,
  contentButtonLabel,
  contentTestId,
  disabled,
  onContentClick,
  onMoveDelta,
  onPreviewDelta,
  startAt,
  style,
  testId,
  title,
}) => {
  const gantt = useContext(GanttContext);
  const pointerDragStartXRef = useRef<number | null>(null);
  const pointerDragIdRef = useRef<number | null>(null);
  const finishMouseDrag = useCallback(
    (startX: number, event: MouseEvent) => {
      onPreviewDelta?.(null);
      if (!startAt) {
        return;
      }
      const finalDeltaDays = getDayDeltaByPixelDelta(
        gantt,
        startAt,
        event.clientX - startX,
      );
      if (finalDeltaDays !== 0) {
        onMoveDelta?.(finalDeltaDays);
      }
    },
    [gantt, onMoveDelta, onPreviewDelta, startAt],
  );
  const handleMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (pointerDragIdRef.current !== null) {
        return;
      }
      if (disabled || !startAt || event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = getDayDeltaByPixelDelta(
          gantt,
          startAt,
          moveEvent.clientX - startX,
        );
        onPreviewDelta?.(delta);
      };
      const handleMouseUp = (upEvent: MouseEvent) => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        finishMouseDrag(startX, upEvent);
      };
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp, { once: true });
    },
    [disabled, finishMouseDrag, gantt, onPreviewDelta, startAt],
  );
  const finishPointerDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (pointerDragIdRef.current !== event.pointerId) {
        return;
      }
      const startX = pointerDragStartXRef.current;
      pointerDragStartXRef.current = null;
      pointerDragIdRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      onPreviewDelta?.(null);
      if (startX === null || !startAt) {
        return;
      }
      const finalDeltaDays = getDayDeltaByPixelDelta(
        gantt,
        startAt,
        event.clientX - startX,
      );
      if (finalDeltaDays !== 0) {
        onMoveDelta?.(finalDeltaDays);
      }
    },
    [gantt, onMoveDelta, onPreviewDelta, startAt],
  );
  return (
    <div
      className={cn(
        className,
        "pointer-events-none max-w-max whitespace-nowrap",
      )}
      data-gantt-interactive="true"
      style={style}
      title={title}
    >
      <button
        className={cn(
          "mr-1 grid size-5 shrink-0 place-items-center rounded-sm border border-border bg-muted/40 text-muted-foreground",
          disabled
            ? "cursor-not-allowed opacity-60"
            : "pointer-events-auto cursor-grab hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-cyan-700 dark:text-cyan-100 active:cursor-grabbing",
        )}
        data-gantt-range-drag-handle="true"
        data-testid={testId}
        disabled={disabled}
        onMouseDown={handleMouseDown}
        onPointerCancel={(event) => {
          if (pointerDragIdRef.current !== event.pointerId) {
            return;
          }
          pointerDragStartXRef.current = null;
          pointerDragIdRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          onPreviewDelta?.(null);
        }}
        onPointerDown={(event) => {
          if (disabled || !startAt || event.button !== 0) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          pointerDragStartXRef.current = event.clientX;
          pointerDragIdRef.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (
            pointerDragIdRef.current !== event.pointerId ||
            pointerDragStartXRef.current === null ||
            !startAt
          ) {
            return;
          }
          const delta = getDayDeltaByPixelDelta(
            gantt,
            startAt,
            event.clientX - pointerDragStartXRef.current,
          );
          onPreviewDelta?.(delta);
        }}
        onPointerUp={finishPointerDrag}
        title={title}
        type="button"
      >
        <MoveHorizontal className="size-3.5" />
      </button>
      {onContentClick ? (
        <button
          aria-label={contentButtonLabel}
          className="pointer-events-auto inline-flex min-w-max items-center gap-2 whitespace-nowrap rounded-sm px-1 text-left outline-none transition-colors hover:bg-muted/55 focus-visible:ring-2 focus-visible:ring-cyan-300/50 [&_*]:whitespace-nowrap"
          data-testid={contentTestId}
          onClick={onContentClick}
          type="button"
        >
          {children}
        </button>
      ) : (
        <span
          className="pointer-events-none inline-flex min-w-max items-center gap-2 whitespace-nowrap [&_*]:whitespace-nowrap"
          data-testid={contentTestId}
        >
          {children}
        </span>
      )}
    </div>
  );
};

export type GanttProviderProps = {
  range?: Range;
  zoom?: number;
  rowHeight?: number;
  rowGap?: number;
  leadingSidebarWidth?: number;
  initialScrollDate?: Date;
  onAddItem?: (date: Date) => void;
  children: ReactNode;
  className?: string;
};

export const GanttProvider: FC<GanttProviderProps> = ({
  zoom = 100,
  range = "monthly",
  rowHeight: initialRowHeight = 36,
  rowGap: initialRowGap = 16,
  leadingSidebarWidth = 0,
  initialScrollDate,
  onAddItem,
  children,
  className,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [timelineData, setTimelineData] = useState<TimelineData>(
    createInitialTimelineData(new Date()),
  );
  const [, setScrollX] = useGanttScrollX();
  const [kiboSidebarWidth, setKiboSidebarWidth] = useState(0);
  const [rowHeight, setRowHeight] = useState(initialRowHeight);
  const [rowGap, setRowGap] = useState(initialRowGap);

  const headerHeight = 60;
  let columnWidth = 50;

  if (range === "monthly") {
    columnWidth = 150;
  } else if (range === "weekly") {
    columnWidth = 82;
  } else if (range === "quarterly") {
    columnWidth = 100;
  }
  const sidebarWidth = leadingSidebarWidth + kiboSidebarWidth;

  // Memoize CSS variables to prevent unnecessary re-renders
  const cssVariables = useMemo(
    () =>
      ({
        "--gantt-zoom": `${zoom}`,
        "--gantt-column-width": `${(zoom / 100) * columnWidth}px`,
        "--gantt-header-height": `${headerHeight}px`,
        "--gantt-row-height": `${rowHeight}px`,
        "--gantt-row-gap": `${rowGap}px`,
        "--gantt-leading-sidebar-width": `${leadingSidebarWidth}px`,
        "--gantt-kibo-sidebar-width": `${kiboSidebarWidth}px`,
        "--gantt-sidebar-width": `${sidebarWidth}px`,
      }) as CSSProperties,
    [
      zoom,
      columnWidth,
      rowHeight,
      rowGap,
      leadingSidebarWidth,
      kiboSidebarWidth,
      sidebarWidth,
    ],
  );

  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current;
      const animationFrame = requestAnimationFrame(() => {
        if (initialScrollDate) {
          const timelineStartDate = new Date(timelineData[0]?.year ?? 0, 0, 1);
          const offset = getOffset(initialScrollDate, timelineStartDate, {
            zoom,
            range,
            columnWidth,
            sidebarWidth,
            headerHeight,
            rowHeight,
            rowGap,
            setRowHeight,
            setRowGap,
            onAddItem,
            placeholderLength: 2,
            timelineData,
            ref: scrollRef,
          });

          scrollElement.scrollLeft = Math.max(0, offset - columnWidth);
        } else {
          scrollElement.scrollLeft =
            scrollElement.scrollWidth / 2 - scrollElement.clientWidth / 2;
        }

        setScrollX(scrollElement.scrollLeft);
      });

      return () => cancelAnimationFrame(animationFrame);
    }
  }, [
    columnWidth,
    headerHeight,
    initialScrollDate,
    onAddItem,
    range,
    rowHeight,
    rowGap,
    setScrollX,
    sidebarWidth,
    timelineData,
    zoom,
  ]);

  // Update sidebar width when DOM is ready
  useEffect(() => {
    const updateSidebarWidth = () => {
      const sidebarElement = scrollRef.current?.querySelector(
        '[data-roadmap-ui="gantt-sidebar"]',
      );
      const newWidth = sidebarElement?.getBoundingClientRect().width ?? 0;
      setKiboSidebarWidth(newWidth);
    };

    // Update immediately
    updateSidebarWidth();

    // Also update on resize or when children change
    const observer = new MutationObserver(updateSidebarWidth);
    if (scrollRef.current) {
      observer.observe(scrollRef.current, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  // Fix the useCallback to include all dependencies
  const handleScroll = useCallback(
    throttle(() => {
      const scrollElement = scrollRef.current;
      if (!scrollElement) {
        return;
      }

      const { scrollLeft, scrollWidth, clientWidth } = scrollElement;
      setScrollX(scrollLeft);

      if (scrollLeft === 0) {
        // Extend timelineData to the past
        const firstYear = timelineData[0]?.year;

        if (!firstYear) {
          return;
        }

        const newTimelineData: TimelineData = [...timelineData];
        newTimelineData.unshift({
          year: firstYear - 1,
          quarters: new Array(4).fill(null).map((_, quarterIndex) => ({
            months: new Array(3).fill(null).map((_, monthIndex) => {
              const month = quarterIndex * 3 + monthIndex;
              return {
                days: getDaysInMonth(new Date(firstYear, month, 1)),
              };
            }),
          })),
        });

        setTimelineData(newTimelineData);

        // Scroll a bit forward so it's not at the very start
        scrollElement.scrollLeft = scrollElement.clientWidth;
        setScrollX(scrollElement.scrollLeft);
      } else if (scrollLeft + clientWidth >= scrollWidth) {
        // Extend timelineData to the future
        const lastYear = timelineData.at(-1)?.year;

        if (!lastYear) {
          return;
        }

        const newTimelineData: TimelineData = [...timelineData];
        newTimelineData.push({
          year: lastYear + 1,
          quarters: new Array(4).fill(null).map((_, quarterIndex) => ({
            months: new Array(3).fill(null).map((_, monthIndex) => {
              const month = quarterIndex * 3 + monthIndex;
              return {
                days: getDaysInMonth(new Date(lastYear, month, 1)),
              };
            }),
          })),
        });

        setTimelineData(newTimelineData);

        // Scroll a bit back so it's not at the very end
        scrollElement.scrollLeft =
          scrollElement.scrollWidth - scrollElement.clientWidth;
        setScrollX(scrollElement.scrollLeft);
      }
    }, 100),
    [],
  );

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement) {
      scrollElement.addEventListener("scroll", handleScroll);
    }

    return () => {
      // Fix memory leak by properly referencing the scroll element
      if (scrollElement) {
        scrollElement.removeEventListener("scroll", handleScroll);
      }
    };
  }, [handleScroll]);

  const scrollToFeature = useCallback(
    (feature: GanttFeature) => {
      const scrollElement = scrollRef.current;
      if (!scrollElement) {
        return;
      }

      // Calculate timeline start date from timelineData
      const timelineStartDate = new Date(timelineData[0].year, 0, 1);

      // Calculate the horizontal offset for the feature's start date
      const offset = getOffset(feature.startAt, timelineStartDate, {
        zoom,
        range,
        columnWidth,
        sidebarWidth,
        headerHeight,
        rowHeight,
        rowGap,
        setRowHeight,
        setRowGap,
        onAddItem,
        placeholderLength: 2,
        timelineData,
        ref: scrollRef,
      });

      // Keep focused milestones in the chart body, clear of the sticky rail.
      const targetScrollLeft = Math.max(
        0,
        offset - scrollElement.clientWidth * 0.35,
      );

      scrollElement.scrollTo({
        left: targetScrollLeft,
        behavior: "smooth",
      });
    },
    [
      timelineData,
      zoom,
      range,
      columnWidth,
      sidebarWidth,
      onAddItem,
      rowHeight,
      rowGap,
    ],
  );

  return (
    <GanttContext.Provider
      value={{
        zoom,
        range,
        headerHeight,
        columnWidth,
        sidebarWidth,
        rowHeight,
        rowGap,
        setRowHeight,
        setRowGap,
        onAddItem,
        timelineData,
        placeholderLength: 2,
        ref: scrollRef,
        scrollToFeature,
      }}
    >
      <div
        className={cn(
          "gantt relative isolate grid h-full w-full min-w-0 max-w-full select-none overflow-auto rounded-sm bg-secondary",
          range,
          className,
        )}
        ref={scrollRef}
        style={{
          ...cssVariables,
          gridTemplateColumns:
            "var(--gantt-leading-sidebar-width) var(--gantt-kibo-sidebar-width) 1fr",
        }}
      >
        {children}
      </div>
    </GanttContext.Provider>
  );
};

export type GanttTimelineProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export const GanttTimeline: FC<GanttTimelineProps> = ({
  children,
  className,
  style,
}) => (
  <div
    className={cn(
      "relative flex h-full w-max flex-none overflow-clip",
      className,
    )}
    style={style}
  >
    {children}
  </div>
);

export type GanttTodayProps = {
  className?: string;
};

export const GanttToday: FC<GanttTodayProps> = ({ className }) => {
  const label = "Today";
  const date = useMemo(() => new Date(), []);
  const gantt = useContext(GanttContext);
  const differenceIn = useMemo(
    () => getDifferenceIn(gantt.range),
    [gantt.range],
  );
  const timelineStartDate = useMemo(
    () => new Date(gantt.timelineData.at(0)?.year ?? 0, 0, 1),
    [gantt.timelineData],
  );

  // Memoize expensive calculations
  const offset = useMemo(
    () => differenceIn(date, timelineStartDate),
    [differenceIn, date, timelineStartDate],
  );
  const innerOffset = useMemo(
    () =>
      calculateInnerOffset(
        date,
        gantt.range,
        (gantt.columnWidth * gantt.zoom) / 100,
      ),
    [date, gantt.range, gantt.columnWidth, gantt.zoom],
  );

  return (
    <div
      className="pointer-events-none absolute top-0 left-0 z-20 flex h-full select-none flex-col items-center justify-center overflow-visible transition-[z-index] hover:z-[70] focus-within:z-[70]"
      style={{
        width: 0,
        transform: `translateX(calc(var(--gantt-column-width) * ${offset} + ${innerOffset}px))`,
      }}
    >
      <div
        className={cn(
          "group pointer-events-auto sticky top-0 flex select-auto flex-col flex-nowrap items-center justify-center whitespace-nowrap rounded-b-md bg-card px-2 py-1 text-foreground text-xs",
          className,
        )}
      >
        {label}
        <span className="max-h-[0] overflow-hidden opacity-80 transition-all group-hover:max-h-[2rem]">
          {formatDate(date, "MMM dd, yyyy")}
        </span>
      </div>
      <div className={cn("h-full w-px bg-card", className)} />
    </div>
  );
};
