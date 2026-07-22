"use client";

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  type HTMLMotionProps,
  type SpringOptions,
} from "motion/react";
import * as React from "react";

import { cn } from "#/lib/utils.ts";

export type CursorContextType = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  cursorPos: { x: number; y: number };
  cursorRef: React.RefObject<HTMLDivElement | null>;
  isActive: boolean;
};

const CursorContext = React.createContext<CursorContextType | undefined>(
  undefined,
);

export function useCursor(): CursorContextType {
  const context = React.useContext(CursorContext);
  if (!context) {
    throw new Error("useCursor must be used within a CursorProvider");
  }
  return context;
}

export type CursorProviderProps = React.ComponentProps<"div"> & {
  children: React.ReactNode;
};

export function CursorProvider({
  ref,
  children,
  ...props
}: CursorProviderProps) {
  const [cursorPos, setCursorPos] = React.useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const cursorRef = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => containerRef.current as HTMLDivElement);

  React.useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const parent = containerRef.current.parentElement;
    if (!parent) {
      return;
    }

    if (getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }

    const handleMouseMove = (event: MouseEvent) => {
      const rect = parent.getBoundingClientRect();
      setCursorPos({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      setIsActive(true);
    };
    const handleMouseLeave = () => setIsActive(false);

    parent.addEventListener("mousemove", handleMouseMove);
    parent.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      parent.removeEventListener("mousemove", handleMouseMove);
      parent.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return (
    <CursorContext.Provider
      value={{ containerRef, cursorPos, cursorRef, isActive }}
    >
      <div data-slot="cursor-provider" ref={containerRef} {...props}>
        {children}
      </div>
    </CursorContext.Provider>
  );
}

export type CursorProps = HTMLMotionProps<"div"> & {
  children: React.ReactNode;
};

export function Cursor({
  ref,
  children,
  className,
  style,
  ...props
}: CursorProps) {
  const { containerRef, cursorPos, cursorRef, isActive } = useCursor();
  React.useImperativeHandle(ref, () => cursorRef.current as HTMLDivElement);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  React.useEffect(() => {
    const parentElement = containerRef.current?.parentElement;

    if (parentElement && isActive) {
      parentElement.style.cursor = "none";
    }

    return () => {
      if (parentElement) {
        parentElement.style.cursor = "default";
      }
    };
  }, [containerRef, isActive]);

  React.useEffect(() => {
    x.set(cursorPos.x);
    y.set(cursorPos.y);
  }, [cursorPos, x, y]);

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "pointer-events-none absolute z-[9999] transform-[translate(-50%,-50%)]",
            className,
          )}
          data-slot="cursor"
          exit={{ opacity: 0, scale: 0 }}
          initial={{ opacity: 0, scale: 0 }}
          ref={cursorRef}
          style={{ left: x, top: y, ...style }}
          {...props}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type Align =
  | "bottom"
  | "bottom-left"
  | "bottom-right"
  | "center"
  | "left"
  | "right"
  | "top"
  | "top-left"
  | "top-right";

export type CursorFollowProps = HTMLMotionProps<"div"> & {
  align?: Align;
  children: React.ReactNode;
  sideOffset?: number;
  transition?: SpringOptions;
};

export function CursorFollow({
  ref,
  sideOffset = 15,
  align = "bottom-right",
  children,
  className,
  style,
  transition = { bounce: 0, damping: 50, stiffness: 500 },
  ...props
}: CursorFollowProps) {
  const { cursorPos, cursorRef, isActive } = useCursor();
  const cursorFollowRef = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(
    ref,
    () => cursorFollowRef.current as HTMLDivElement,
  );

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, transition);
  const springY = useSpring(y, transition);

  const calculateOffset = React.useCallback(() => {
    const rect = cursorFollowRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 0;
    const height = rect?.height ?? 0;

    switch (align) {
      case "center":
        return { x: width / 2, y: height / 2 };
      case "top":
        return { x: width / 2, y: height + sideOffset };
      case "top-left":
        return { x: width + sideOffset, y: height + sideOffset };
      case "top-right":
        return { x: -sideOffset, y: height + sideOffset };
      case "bottom":
        return { x: width / 2, y: -sideOffset };
      case "bottom-left":
        return { x: width + sideOffset, y: -sideOffset };
      case "bottom-right":
        return { x: -sideOffset, y: -sideOffset };
      case "left":
        return { x: width + sideOffset, y: height / 2 };
      case "right":
        return { x: -sideOffset, y: height / 2 };
      default:
        return { x: 0, y: 0 };
    }
  }, [align, sideOffset]);

  React.useEffect(() => {
    const offset = calculateOffset();
    const cursorRect = cursorRef.current?.getBoundingClientRect();
    const cursorWidth = cursorRect?.width ?? 20;
    const cursorHeight = cursorRect?.height ?? 20;

    x.set(cursorPos.x - offset.x + cursorWidth / 2);
    y.set(cursorPos.y - offset.y + cursorHeight / 2);
  }, [calculateOffset, cursorPos, cursorRef, x, y]);

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "pointer-events-none absolute z-[9998] transform-[translate(-50%,-50%)]",
            className,
          )}
          data-slot="cursor-follow"
          exit={{ opacity: 0, scale: 0 }}
          initial={{ opacity: 0, scale: 0 }}
          ref={cursorFollowRef}
          style={{ left: springX, top: springY, ...style }}
          {...props}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function CursorPointer({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg
      className={cn("size-6", className)}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M1.8 4.4 7 36.2c.3 1.8 2.6 2.3 3.6.8l3.9-5.7c1.7-2.5 4.5-4.1 7.5-4.3l6.9-.5c1.8-.1 2.5-2.4 1.1-3.5L5 2.5c-1.4-1.1-3.5 0-3.3 1.9Z"
        fill="currentColor"
      />
    </svg>
  );
}
