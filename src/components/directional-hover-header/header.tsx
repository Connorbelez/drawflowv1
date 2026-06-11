import { Link } from "@tanstack/react-router";
import { useState, useRef, useCallback, useEffect } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ChevronDown, ChevronLeft, Menu, X } from "lucide-react";
import {
  fairlendNavLinks,
  NAV_LINKS,
  type NavLink,
  type NavMenu,
} from "./header/nav-data";
import { MegaMenu } from "./header/mega-menu";

import { cn } from "#/lib/utils.ts";

type Direction = "ltr" | "rtl";
const SHELL_EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];
const EXIT_EASE = [0.7, 0, 0.84, 0] as [number, number, number, number];
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function hasNavigableLink(
  link?: NavLink["link"],
): link is NonNullable<NavLink["link"]> {
  return Boolean(link);
}

function Logo() {
  return (
    <Link
      {...fairlendNavLinks.home}
      className="mkt-dhh-brand"
      aria-label="Fairlend Capital marketing home"
      preload="intent"
      viewTransition
    >
      <span>Fairlend</span>
      <small>Capital</small>
    </Link>
  );
}

const ChevronIcon = ({ open }: { open: boolean }) => (
  <motion.span
    className="inline-flex text-current"
    animate={{ rotate: open ? 180 : 0 }}
    transition={{
      duration: 0.2,
      ease: SHELL_EASE,
    }}
    aria-hidden
  >
    <ChevronDown className="size-3.5" strokeWidth={1.6} />
  </motion.span>
);

const listVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.34,
      ease: SHELL_EASE,
    },
  },
};

const panelVariants = {
  enter: { opacity: 0, x: 26 },
  center: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.34,
      ease: SHELL_EASE,
    },
  },
  exit: {
    opacity: 0,
    x: -18,
    transition: {
      duration: 0.24,
      ease: EXIT_EASE,
    },
  },
};

function HeaderActions({
  mobile = false,
  onAction,
}: {
  mobile?: boolean;
  onAction?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        mobile && "grid w-full grid-cols-2 gap-4",
      )}
    >
      <Link
        {...fairlendNavLinks.backoffice}
        onClick={onAction}
        className={cn("mkt-dhh-action mkt-dhh-action-secondary", mobile && "mkt-dhh-action-mobile")}
        preload="intent"
        viewTransition
      >
        Sign in
      </Link>
      <Link
        {...fairlendNavLinks.startMultiplex}
        onClick={onAction}
        className={cn("mkt-dhh-action mkt-dhh-action-primary", mobile && "mkt-dhh-action-mobile")}
        preload="intent"
        viewTransition
      >
        Start a file
        <ArrowRight
          className="size-3.5 shrink-0"
          strokeWidth={1.6}
        />
      </Link>
    </div>
  );
}

export function Header() {
  const [activeMenu, setActiveMenu] = useState<NavMenu | null>(null);
  const [direction, setDirection] = useState<Direction>("ltr");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState<NavMenu | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const desktopItemRefs = useRef<Array<HTMLElement | null>>([]);
  const megaMenuRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const mobileBackButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const activeIndexRef = useRef<number>(-1);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openMenu = useCallback((menu: NavMenu, index: number) => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    if (activeIndexRef.current !== -1 && index !== activeIndexRef.current) {
      setDirection(index > activeIndexRef.current ? "rtl" : "ltr");
    }
    activeIndexRef.current = index;
    setActiveMenu(menu);
  }, []);

  const closeDesktopMenu = useCallback(() => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    setActiveMenu(null);
    activeIndexRef.current = -1;
  }, []);

  const scheduleClose = useCallback(() => {
    leaveTimerRef.current = setTimeout(() => {
      closeDesktopMenu();
    }, 120);
  }, [closeDesktopMenu]);

  const cancelClose = useCallback(() => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
    setMobileMenu(null);
  }, []);

  const focusFirstDesktopMenuItem = useCallback(() => {
    const firstItem = megaMenuRef.current?.querySelector<HTMLElement>(
      '[data-mega-menu-item="true"]',
    );
    firstItem?.focus();
  }, []);

  const focusDesktopItem = useCallback((index: number) => {
    desktopItemRefs.current[index]?.focus();
  }, []);

  const moveDesktopFocus = useCallback(
    (currentIndex: number, step: 1 | -1) => {
      const total = NAV_LINKS.length;
      let nextIndex = currentIndex;

      for (let count = 0; count < total; count++) {
        nextIndex = (nextIndex + step + total) % total;
        const nextItem = desktopItemRefs.current[nextIndex];
        if (!nextItem) continue;

        nextItem.focus();

        const nextLink = NAV_LINKS[nextIndex];
        if (nextLink.menu) {
          cancelClose();
          openMenu(nextLink.menu, nextIndex);
        } else {
          closeDesktopMenu();
        }
        break;
      }
    },
    [cancelClose, closeDesktopMenu, openMenu],
  );

  const handleDesktopItemKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>, link: NavLink, index: number) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveDesktopFocus(index, 1);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveDesktopFocus(index, -1);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeDesktopMenu();
        focusDesktopItem(index);
        return;
      }

      if (!link.menu) return;

      if (
        event.key === "ArrowDown" ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        cancelClose();
        openMenu(link.menu, index);
        requestAnimationFrame(() => {
          focusFirstDesktopMenuItem();
        });
        return;
      }

      if (
        event.key === "Tab" &&
        !event.shiftKey &&
        activeMenu?.id === link.menu.id
      ) {
        event.preventDefault();
        focusFirstDesktopMenuItem();
      }
    },
    [
      activeMenu,
      cancelClose,
      closeDesktopMenu,
      focusDesktopItem,
      focusFirstDesktopMenuItem,
      moveDesktopFocus,
      openMenu,
    ],
  );

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMobileMenu();
        return;
      }

      if (event.key !== "Tab") return;

      const container = shellRef.current;
      if (!container) return;

      const focusableElements = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => {
        if (element.getAttribute("aria-hidden") === "true") return false;
        if ("disabled" in element && element.disabled) return false;
        return element.offsetParent !== null;
      });

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    previousFocusedElementRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusedElementRef.current?.focus();
      previousFocusedElementRef.current = null;
    };
  }, [closeMobileMenu, isMobileMenuOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const frame = requestAnimationFrame(() => {
      const focusTarget = mobileMenu
        ? mobileBackButtonRef.current
        : mobileToggleRef.current;
      focusTarget?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [isMobileMenuOpen, mobileMenu]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");

    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setMobileMenu(null);
        setIsMobileMenuOpen(false);
      }
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  const openMobileMenu = useCallback(() => {
    cancelClose();
    closeDesktopMenu();
    setMobileMenu(null);
    setIsMobileMenuOpen(true);
  }, [cancelClose, closeDesktopMenu]);

  const isDesktopMenuVisible = !!activeMenu && !isMobileMenuOpen;

  return (
    <header className="mkt-dhh-header">
      <div
        ref={shellRef}
        className={cn(
          "mkt-dhh-shell",
          {
            "mkt-dhh-shell-closed":
              !isDesktopMenuVisible && !isMobileMenuOpen,
            "mkt-dhh-shell-desktop-open":
              isDesktopMenuVisible,
            "mkt-dhh-shell-mobile-open":
              isMobileMenuOpen,
            "mkt-dhh-shell-clipped": !isDesktopMenuVisible && !isMobileMenuOpen,
          },
        )}
      >
        <div className="mkt-dhh-bar">
          <div className="mkt-dhh-brand-slot">
            {isMobileMenuOpen && mobileMenu ? (
              <button
                ref={mobileBackButtonRef}
                type="button"
                onClick={() => setMobileMenu(null)}
                className="mkt-dhh-back"
              >
                <ChevronLeft className="size-4.5" strokeWidth={2} />
                Back
              </button>
            ) : (
              <Logo />
            )}
          </div>

          <nav
            className="mkt-dhh-desktop-nav"
            aria-label="Fairlend marketing navigation"
          >
            {NAV_LINKS.map((link, linkIndex) => {
              const hasMenu = !!link.menu;
              const isOpen = hasMenu && activeMenu?.id === link.menu!.id;
              const itemClassName = cn(
                "mkt-dhh-nav-item",
                isOpen && "mkt-dhh-nav-item-open",
              );

              return (
                <div
                  key={link.label}
                  className="relative"
                  onMouseEnter={() => {
                    if (hasMenu) {
                      cancelClose();
                      openMenu(link.menu!, linkIndex);
                    } else {
                      scheduleClose();
                    }
                  }}
                  onMouseLeave={scheduleClose}
                >
                  {hasMenu ? (
                    <button
                      ref={(node) => {
                        desktopItemRefs.current[linkIndex] = node;
                      }}
                      type="button"
                      onFocus={() => {
                        cancelClose();
                        openMenu(link.menu!, linkIndex);
                      }}
                      onKeyDown={(event) =>
                        handleDesktopItemKeyDown(event, link, linkIndex)
                      }
                      className={itemClassName}
                      aria-expanded={isOpen}
                      aria-haspopup="menu"
                      aria-controls="desktop-mega-menu"
                    >
                      {link.label}
                      <ChevronIcon open={isOpen} />
                    </button>
                  ) : hasNavigableLink(link.link) ? (
                    <Link
                      {...link.link}
                      ref={(node) => {
                        desktopItemRefs.current[linkIndex] = node;
                      }}
                      onFocus={closeDesktopMenu}
                      onKeyDown={(event) =>
                        handleDesktopItemKeyDown(event, link, linkIndex)
                      }
                      className={itemClassName}
                      preload="intent"
                      viewTransition
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <button
                      ref={(node) => {
                        desktopItemRefs.current[linkIndex] = node;
                      }}
                      type="button"
                      onFocus={closeDesktopMenu}
                      onKeyDown={(event) =>
                        handleDesktopItemKeyDown(event, link, linkIndex)
                      }
                      className={itemClassName}
                    >
                      {link.label}
                    </button>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="mkt-dhh-actions">
            <HeaderActions />
          </div>

          <button
            ref={mobileToggleRef}
            type="button"
            onClick={isMobileMenuOpen ? closeMobileMenu : openMobileMenu}
            className="mkt-dhh-mobile-toggle"
            aria-label={
              isMobileMenuOpen ? "Close mobile menu" : "Open mobile menu"
            }
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-navigation"
          >
            {isMobileMenuOpen ? (
              <X className="size-6" strokeWidth={2} />
            ) : (
              <Menu className="size-5.5" strokeWidth={1.9} />
            )}
          </button>
        </div>

        <MegaMenu
          menu={isMobileMenuOpen ? null : activeMenu}
          direction={direction}
          panelRef={megaMenuRef}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onEscape={() => {
            const activeIndex = activeIndexRef.current;
            closeDesktopMenu();
            if (activeIndex >= 0) focusDesktopItem(activeIndex);
          }}
        />
        <AnimatePresence initial={false} mode="wait">
          {isMobileMenuOpen && (
            <motion.div
              id="mobile-navigation"
              key="mobile-navigation"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.24, ease: SHELL_EASE }}
              className="mkt-dhh-mobile-panel"
            >
              <div className="mkt-dhh-mobile-layout">
                <div className="mkt-dhh-mobile-scroll">
                  <AnimatePresence mode="wait" initial={false}>
                    {mobileMenu ? (
                      <motion.div
                        key={mobileMenu.id}
                        variants={panelVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        className="space-y-0"
                      >
                        {mobileMenu.columns.map((column, index) => (
                          <motion.section
                            key={column.heading}
                            variants={itemVariants}
                            initial="hidden"
                            animate="visible"
                            className={cn(
                              "mkt-dhh-mobile-section",
                              index !== 0 && "mkt-dhh-mobile-section-divided",
                              column.accent && "mkt-dhh-mobile-section-accent",
                            )}
                          >
                            <p className="mkt-dhh-mobile-heading">
                              {column.heading}
                            </p>
                            <motion.div
                              variants={listVariants}
                              initial="hidden"
                              animate="visible"
                              className="mkt-dhh-mobile-link-list"
                            >
                              {column.items.map((item) => (
                                item.link ? (
                                <motion.div
                                  key={item.label}
                                  variants={itemVariants}
                                >
                                  <Link
                                    {...item.link}
                                    onClick={closeMobileMenu}
                                    className="mkt-dhh-mobile-link"
                                    preload="intent"
                                    viewTransition
                                  >
                                    <span className="mkt-dhh-mobile-link-label">
                                      {item.label}
                                    </span>
                                    {item.description && (
                                      <span className="mkt-dhh-mobile-link-description">
                                        {item.description}
                                      </span>
                                    )}
                                  </Link>
                                </motion.div>
                                ) : null
                              ))}
                            </motion.div>
                          </motion.section>
                        ))}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="root-mobile-menu"
                        variants={panelVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                      >
                        <motion.div
                          variants={listVariants}
                          initial="hidden"
                          animate="visible"
                          className="space-y-0"
                        >
                          {NAV_LINKS.map((link) => {
                            const hasMenu = !!link.menu;

                            return (
                              <motion.div
                                key={link.label}
                                variants={itemVariants}
                                className="mkt-dhh-mobile-root-item"
                              >
                                {hasMenu ? (
                                  <button
                                    type="button"
                                    onClick={() => setMobileMenu(link.menu!)}
                                    className="mkt-dhh-mobile-root-button"
                                  >
                                    <span>
                                      {link.label}
                                    </span>
                                    <span>
                                      <ArrowRight
                                        className="size-4.5"
                                        strokeWidth={2}
                                      />
                                    </span>
                                  </button>
                                ) : hasNavigableLink(link.link) ? (
                                  <Link
                                    {...link.link}
                                    onClick={closeMobileMenu}
                                    className="mkt-dhh-mobile-root-link"
                                    preload="intent"
                                    viewTransition
                                  >
                                    <span>
                                      {link.label}
                                    </span>
                                  </Link>
                                ) : (
                                  <button
                                    type="button"
                                    className="mkt-dhh-mobile-root-button"
                                  >
                                    <span>
                                      {link.label}
                                    </span>
                                  </button>
                                )}
                              </motion.div>
                            );
                          })}
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="mkt-dhh-mobile-footer">
                  <div>
                    <HeaderActions mobile onAction={closeMobileMenu} />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

export default Header;
