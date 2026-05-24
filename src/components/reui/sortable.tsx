import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import {
  DndContext,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  DragOverlay,
  type DragStartEvent,
  type DropAnimation,
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  MeasuringStrategy,
  type Modifiers,
  MouseSensor,
  TouchSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  type AnimateLayoutChanges,
  arrayMove,
  defaultAnimateLayoutChanges,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type * as React from "react";
import {
  Children,
  type CSSProperties,
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "#/lib/utils.ts";

// Sortable Item Context
const SortableItemContext = createContext<{
  attributes: Partial<DraggableAttributes>;
  listeners: DraggableSyntheticListeners | undefined;
  isDragging?: boolean;
  disabled?: boolean;
  setActivatorNodeRef?: (element: HTMLElement | null) => void;
}>({
  attributes: {},
  listeners: undefined,
  isDragging: false,
  disabled: false,
  setActivatorNodeRef: undefined,
});

const IsOverlayContext = createContext(false);

const SortableInternalContext = createContext<{
  activeId: UniqueIdentifier | null;
  modifiers?: Modifiers;
}>({
  activeId: null,
  modifiers: undefined,
});

const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true });

const dropAnimationConfig: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: "0.4",
      },
    },
  }),
};

function stripOverlayIdentifiers(node: ReactNode): ReactNode {
  return Children.map(node, (child) => {
    if (!isValidElement(child)) {
      return child;
    }

    const childProps = child.props as {
      children?: ReactNode;
      "data-ixc-ref"?: unknown;
      "data-testid"?: unknown;
      id?: unknown;
    };
    const nextProps: {
      children?: ReactNode;
      "data-ixc-ref"?: undefined;
      "data-testid"?: undefined;
      id?: undefined;
    } = {};

    if ("data-testid" in childProps) {
      nextProps["data-testid"] = undefined;
    }
    if ("data-ixc-ref" in childProps) {
      nextProps["data-ixc-ref"] = undefined;
    }
    if ("id" in childProps) {
      nextProps.id = undefined;
    }
    if ("children" in childProps) {
      nextProps.children = stripOverlayIdentifiers(childProps.children);
    }

    return cloneElement(child, nextProps);
  });
}

// Multipurpose Sortable Component
export interface SortableRootProps<T>
  extends Omit<
    useRender.ComponentProps<"div">,
    "onDragStart" | "onDragEnd" | "children"
  > {
  children: ReactNode;
  getItemValue: (item: T) => string;
  modifiers?: Modifiers;
  onDragEnd?: (event: DragEndEvent) => void;
  onDragStart?: (event: DragStartEvent) => void;
  onMove?: (event: {
    event: DragEndEvent;
    activeIndex: number;
    overIndex: number;
  }) => void;
  onValueChange?: (value: T[]) => void;
  strategy?: "horizontal" | "vertical" | "grid";
  value: T[];
}

function Sortable<T>({
  value,
  onValueChange,
  getItemValue,
  className,
  render,
  onMove,
  strategy = "vertical",
  onDragStart,
  onDragEnd,
  modifiers,
  children,
  ...props
}: SortableRootProps<T>) {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => setMounted(true), []);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveId(event.active.id);
      onDragStart?.(event);
    },
    [onDragStart]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      onDragEnd?.(event);

      if (!over) {
        return;
      }

      // Handle item reordering
      const activeIndex = value.findIndex(
        (item: T) => getItemValue(item) === active.id
      );
      const overIndex = value.findIndex(
        (item: T) => getItemValue(item) === over.id
      );

      if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
        return;
      }

      if (onMove) {
        onMove({ event, activeIndex, overIndex });
      } else {
        const newValue = arrayMove(value, activeIndex, overIndex);
        onValueChange?.(newValue);
      }
    },
    [value, getItemValue, onValueChange, onMove, onDragEnd]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const getStrategy = () => {
    switch (strategy) {
      case "horizontal":
        return rectSortingStrategy;
      case "grid":
        return rectSortingStrategy;
      default:
        return verticalListSortingStrategy;
    }
  };

  const itemIds = useMemo(() => value.map(getItemValue), [value, getItemValue]);

  const contextValue = useMemo(
    () => ({ activeId, modifiers }),
    [activeId, modifiers]
  );
  const accessibility = useMemo(
    () =>
      mounted && typeof document !== "undefined"
        ? { container: document.body }
        : undefined,
    [mounted]
  );

  const defaultProps = {
    "data-slot": "sortable",
    "data-dragging": activeId !== null,
    className: cn(activeId !== null && "cursor-grabbing!", className),
    children,
  };

  // Find the active child for the overlay
  const overlayContent = useMemo(() => {
    if (!activeId) {
      return null;
    }
    let result: ReactNode = null;
    Children.forEach(children, (child) => {
      if (
        isValidElement<SortableItemProps>(child) &&
        child.props.value === activeId
      ) {
        result = cloneElement(child as ReactElement<SortableItemProps>, {
          ...child.props,
          className: cn(child.props.className, "z-50"),
        });
      }
    });
    return result;
  }, [activeId, children]);

  return (
    <SortableInternalContext.Provider value={contextValue}>
      <DndContext
        accessibility={accessibility}
        measuring={{
          droppable: {
            strategy: MeasuringStrategy.Always,
          },
        }}
        modifiers={modifiers}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <SortableContext items={itemIds} strategy={getStrategy()}>
          {useRender({
            defaultTagName: "div",
            render,
            props: mergeProps<"div">(defaultProps, props),
          })}
        </SortableContext>
        {mounted &&
          createPortal(
            <DragOverlay
              className={cn("z-50", activeId && "cursor-grabbing")}
              dropAnimation={dropAnimationConfig}
              modifiers={modifiers}
            >
              <IsOverlayContext.Provider value={true}>
                {overlayContent}
              </IsOverlayContext.Provider>
            </DragOverlay>,
            document.body
          )}
      </DndContext>
    </SortableInternalContext.Provider>
  );
}

export interface SortableItemProps extends useRender.ComponentProps<"div"> {
  disabled?: boolean;
  value: string;
}

function SortableItem({
  value,
  className,
  render,
  disabled,
  children,
  ...props
}: SortableItemProps) {
  const isOverlay = useContext(IsOverlayContext);

  const {
    setNodeRef,
    transform,
    transition,
    attributes,
    listeners,
    isDragging: isSortableDragging,
    setActivatorNodeRef,
  } = useSortable({
    id: value,
    disabled: disabled || isOverlay,
    animateLayoutChanges,
  });

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
  } as CSSProperties;
  const overlayChildren = useMemo(
    () => stripOverlayIdentifiers(children),
    [children]
  );

  const defaultProps = isOverlay
    ? {
        "data-slot": "sortable-item",
        "data-value": value,
        "data-dragging": true,
        className: cn(className),
        children: overlayChildren,
      }
    : {
        "data-slot": "sortable-item",
        "data-value": value,
        "data-dragging": isSortableDragging,
        "data-disabled": disabled,
        ref: setNodeRef,
        style,
        className: cn(
          isSortableDragging && "z-50 opacity-50",
          disabled && "opacity-50",
          className
        ),
        children,
      };

  const contextValue = isOverlay
    ? {
        attributes: {},
        listeners: undefined,
        isDragging: true,
        disabled: false,
        setActivatorNodeRef: undefined,
      }
    : {
        attributes,
        listeners,
        isDragging: isSortableDragging,
        disabled,
        setActivatorNodeRef,
      };

  const renderedItem = useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(defaultProps, props),
  });

  return (
    <SortableItemContext.Provider value={contextValue}>
      {renderedItem}
    </SortableItemContext.Provider>
  );
}

export interface SortableItemHandleProps
  extends useRender.ComponentProps<"div"> {
  cursor?: boolean;
}

function SortableItemHandle({
  className,
  render,
  cursor = true,
  ...props
}: SortableItemHandleProps) {
  const { attributes, listeners, isDragging, disabled, setActivatorNodeRef } =
    useContext(SortableItemContext);

  const defaultProps = {
    "data-slot": "sortable-item-handle",
    "data-dragging": isDragging,
    "data-disabled": disabled,
    ref: setActivatorNodeRef,
    ...attributes,
    ...listeners,
    className: cn(
      cursor && (isDragging ? "cursor-grabbing!" : "cursor-grab!"),
      className
    ),
    children: props.children,
  };

  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(defaultProps, props),
  });
}

export interface SortableOverlayProps
  extends Omit<React.ComponentProps<typeof DragOverlay>, "children"> {
  children?: ReactNode | ((params: { value: UniqueIdentifier }) => ReactNode);
}

function SortableOverlay({
  children,
  className,
  ...props
}: SortableOverlayProps) {
  const { activeId, modifiers } = useContext(SortableInternalContext);
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => setMounted(true), []);

  const content =
    activeId && children
      ? typeof children === "function"
        ? children({ value: activeId })
        : children
      : null;

  if (!mounted) {
    return null;
  }

  return createPortal(
    <DragOverlay
      className={cn("z-50", activeId && "cursor-grabbing", className)}
      dropAnimation={dropAnimationConfig}
      modifiers={modifiers}
      {...props}
    >
      <IsOverlayContext.Provider value={true}>
        {content}
      </IsOverlayContext.Provider>
    </DragOverlay>,
    document.body
  );
}

export { Sortable, SortableItem, SortableItemHandle, SortableOverlay };
