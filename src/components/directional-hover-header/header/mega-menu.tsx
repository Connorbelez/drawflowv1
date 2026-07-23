import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cn } from "#/lib/utils.ts";
import type { NavColumn, NavMenu } from "./nav-data";

type Direction = "ltr" | "rtl";

type MegaMenuProps = {
  menu: NavMenu | null;
  direction: Direction;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  panelRef?: React.RefObject<HTMLDivElement | null>;
  onEscape?: () => void;
};

const SPRING: [number, number, number, number] = [0.16, 1, 0.3, 1];
const STAGGER_STEP = 0.038;
const ITEM_X = 18;
const CONTENT_X = 84;

function hasNavigableLink(
  link?: NavColumn["items"][number]["link"]
): link is NonNullable<NavColumn["items"][number]["link"]> {
  return Boolean(link);
}

const contentVariants = {
  enter: (direction: Direction) => ({
    opacity: 0,
    x: direction === "rtl" ? CONTENT_X : -CONTENT_X,
  }),
  center: { opacity: 1, x: 0 },
  exit: (direction: Direction) => ({
    opacity: 0,
    x: direction === "rtl" ? -CONTENT_X : CONTENT_X,
  }),
};

function flatIndex(
  colIdx: number,
  rowIdx: number,
  columns: NavColumn[]
): number {
  const before = columns
    .slice(0, colIdx)
    .reduce((sum, col) => sum + 1 + col.items.length, 0);
  return before + rowIdx + 1;
}

function itemDelay(
  colIdx: number,
  rowIdx: number,
  columns: NavColumn[],
  direction: Direction
): number {
  const total = columns.reduce((sum, col) => sum + 1 + col.items.length, 0);
  let flat = flatIndex(colIdx, rowIdx, columns);
  if (direction === "rtl") {
    flat = total - 1 - flat;
  }
  return Math.max(0, flat) * STAGGER_STEP;
}

function itemInitial(direction: Direction) {
  return { opacity: 0, x: direction === "rtl" ? ITEM_X : -ITEM_X, y: 5 };
}

function itemTransition(
  colIdx: number,
  rowIdx: number,
  columns: NavColumn[],
  direction: Direction
): Transition {
  return {
    duration: 0.18,
    ease: "easeOut",
    delay: itemDelay(colIdx, rowIdx, columns, direction),
  };
}

function MegaMenuPanel({
  menu,
  direction,
  onMouseEnter,
  onMouseLeave,
  panelRef,
  onEscape,
}: MegaMenuProps & { menu: NavMenu }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const initial = itemInitial(direction);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(([entry]) =>
      setHeight(entry.contentRect.height)
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <motion.div
      animate={{ opacity: 1, height }}
      className="mkt-dhh-menu"
      exit={{ opacity: 0, height: 0 }}
      id="desktop-mega-menu"
      initial={{ opacity: 0, height: 0 }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onEscape?.();
        }
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      ref={panelRef}
      transition={{
        height: { duration: 0.28, ease: SPRING },
        opacity: { duration: 0.18, ease: "easeOut" },
      }}
    >
      <div ref={bodyRef}>
        <AnimatePresence custom={direction} initial={false} mode="popLayout">
          <motion.div
            animate="center"
            className="flex w-full"
            custom={direction}
            exit="exit"
            initial="enter"
            key={menu.id}
            transition={{
              x: { duration: 0.26, ease: SPRING },
              opacity: { duration: 0.16, ease: "easeOut" },
            }}
            variants={contentVariants}
          >
            {menu.columns.map((column, colIdx) => (
              <div
                className={cn(
                  "mkt-dhh-menu-column",
                  column.accent && "mkt-dhh-menu-column-accent",
                  colIdx !== 0 && "mkt-dhh-menu-column-divided"
                )}
                key={column.heading}
              >
                <motion.p
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  className="mkt-dhh-menu-heading"
                  initial={initial}
                  transition={itemTransition(
                    colIdx,
                    -1,
                    menu.columns,
                    direction
                  )}
                >
                  {column.heading}
                </motion.p>

                <div className="mkt-dhh-menu-list">
                  {column.items.map((item, rowIdx) =>
                    hasNavigableLink(item.link) ? (
                      <motion.div
                        animate={{ opacity: 1, x: 0, y: 0 }}
                        initial={initial}
                        key={item.label}
                        transition={itemTransition(
                          colIdx,
                          rowIdx,
                          menu.columns,
                          direction
                        )}
                      >
                        <Link
                          {...item.link}
                          className="mkt-dhh-menu-item"
                          data-mega-menu-item="true"
                          preload="intent"
                          viewTransition
                        >
                          <span className="mkt-dhh-menu-item-label">
                            {item.label}
                          </span>
                          {item.description && (
                            <span className="mkt-dhh-menu-item-description">
                              {item.description}
                            </span>
                          )}
                        </Link>
                      </motion.div>
                    ) : (
                      <motion.button
                        animate={{ opacity: 1, x: 0, y: 0 }}
                        className="mkt-dhh-menu-item mkt-dhh-menu-button"
                        data-mega-menu-item="true"
                        initial={initial}
                        key={item.label}
                        transition={itemTransition(
                          colIdx,
                          rowIdx,
                          menu.columns,
                          direction
                        )}
                        type="button"
                      >
                        <span className="mkt-dhh-menu-item-label">
                          {item.label}
                        </span>
                        {item.description && (
                          <span className="mkt-dhh-menu-item-description">
                            {item.description}
                          </span>
                        )}
                      </motion.button>
                    )
                  )}
                </div>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export function MegaMenu({
  menu,
  direction,
  onMouseEnter,
  onMouseLeave,
  panelRef,
  onEscape,
}: MegaMenuProps) {
  return (
    <AnimatePresence>
      {menu && (
        <MegaMenuPanel
          direction={direction}
          key="mega-menu-panel"
          menu={menu}
          onEscape={onEscape}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          panelRef={panelRef}
        />
      )}
    </AnimatePresence>
  );
}
