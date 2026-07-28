import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown, ChevronLeft, Menu, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MegaMenu } from "./header/mega-menu";
import { NAV_LINKS, type NavLink, type NavMenu } from "./header/nav-data";

type Direction = "ltr" | "rtl";
const SHELL_EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];
const EXIT_EASE = [0.7, 0, 0.84, 0] as [number, number, number, number];
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function hasNavigableHref(href?: string): href is string {
  return Boolean(href && href !== "#");
}

function Logo() {
  return (
    <a
      aria-label="morphin.dev"
      className="flex select-none items-center gap-2"
      href="/"
    >
      <svg
        aria-hidden
        className="w-7 shrink-0 text-slate-950"
        fill="currentColor"
        viewBox="0 0 126 126"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M32 32h31v-.5A31.5 31.5 0 1 0 31.5 63h.5ZM94 32v31h.5A31.5 31.5 0 1 0 63 31.5v.5ZM32 94V63h-.5A31.5 31.5 0 1 0 63 94.5V94ZM94.5 63H94v31H63v.5A31.5 31.5 0 1 0 94.5 63Z" />
        <path d="M63 32a31.5 31.5 0 0 1-31 31 31.5 31.5 0 0 1 31 31 31.5 31.5 0 0 1 31-31 31.5 31.5 0 0 1-31-31Z" />
      </svg>
      <span className="font-bold text-lg tracking-tighter">morphin.dev</span>
    </a>
  );
}

const ChevronIcon = ({ open }: { open: boolean }) => (
  <motion.span
    animate={{ rotate: open ? 180 : 0 }}
    aria-hidden
    className="inline-flex text-current"
    transition={{
      duration: 0.2,
      ease: SHELL_EASE,
    }}
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
        mobile && "grid w-full grid-cols-2 gap-4"
      )}
    >
      <button
        className={cn(
          "select-none rounded-lg border font-medium text-violet-600 transition-colors duration-150 hover:bg-violet-50",
          mobile
            ? "flex min-h-14 items-center justify-center border-violet-500 text-lg"
            : "border-violet-600 px-5 py-2 text-sm"
        )}
        onClick={onAction}
        type="button"
      >
        Log in
      </button>
      <button
        className={cn(
          "flex select-none items-center justify-center gap-1.5 rounded-lg bg-violet-600 font-semibold text-white transition-colors duration-150 hover:bg-violet-700 active:bg-violet-800",
          mobile ? "min-h-14 text-lg" : "px-5 py-2 text-sm"
        )}
        onClick={onAction}
        type="button"
      >
        Get Started
        <ArrowRight
          className="size-3.5 shrink-0 text-white"
          strokeWidth={1.6}
        />
      </button>
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
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
    }
    if (activeIndexRef.current !== -1 && index !== activeIndexRef.current) {
      setDirection(index > activeIndexRef.current ? "rtl" : "ltr");
    }
    activeIndexRef.current = index;
    setActiveMenu(menu);
  }, []);

  const closeDesktopMenu = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
    }
    setActiveMenu(null);
    activeIndexRef.current = -1;
  }, []);

  const scheduleClose = useCallback(() => {
    leaveTimerRef.current = setTimeout(() => {
      closeDesktopMenu();
    }, 120);
  }, [closeDesktopMenu]);

  const cancelClose = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
    }
  }, []);

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
    setMobileMenu(null);
  }, []);

  const focusFirstDesktopMenuItem = useCallback(() => {
    const firstItem = megaMenuRef.current?.querySelector<HTMLElement>(
      '[data-mega-menu-item="true"]'
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
        if (!nextItem) {
          continue;
        }

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
    [cancelClose, closeDesktopMenu, openMenu]
  );

  const handleDesktopItemKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, link: NavLink, index: number) => {
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

      if (!link.menu) {
        return;
      }

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
    ]
  );

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileMenuOpen]);

  useEffect(
    () => () => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMobileMenu();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const container = shellRef.current;
      if (!container) {
        return;
      }

      const focusableElements = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((element) => {
        if (element.getAttribute("aria-hidden") === "true") {
          return false;
        }
        if ("disabled" in element && element.disabled) {
          return false;
        }
        return element.offsetParent !== null;
      });

      if (focusableElements.length === 0) {
        return;
      }

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
    if (!isMobileMenuOpen) {
      return;
    }

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
    <header className="fixed top-5 right-0 left-0 z-50 px-4 sm:px-5">
      <div
        className={cn(
          "relative mx-auto w-full max-w-6xl bg-white shadow-lg transition-[height,border-radius] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          {
            "h-16 rounded-xl border border-neutral-200 sm:h-17": !(
              isDesktopMenuVisible || isMobileMenuOpen
            ),
            "overflow-visible rounded-t-xl border-neutral-200 border-x border-t":
              isDesktopMenuVisible,
            "h-[calc(100dvh-2.5rem)] overflow-hidden rounded-xl border border-neutral-200":
              isMobileMenuOpen,
            "overflow-hidden": !(isDesktopMenuVisible || isMobileMenuOpen),
          }
        )}
        ref={shellRef}
      >
        <div className="flex h-16 w-full items-center justify-between gap-6 px-4 sm:h-17">
          <div className="flex min-w-0 items-center">
            {isMobileMenuOpen && mobileMenu ? (
              <button
                className="inline-flex items-center gap-2 font-medium text-lg text-slate-950"
                onClick={() => setMobileMenu(null)}
                ref={mobileBackButtonRef}
                type="button"
              >
                <ChevronLeft className="size-4.5" strokeWidth={2} />
                Back
              </button>
            ) : (
              <Logo />
            )}
          </div>

          <nav
            aria-label="Main navigation"
            className="hidden flex-1 items-center gap-1 lg:flex"
          >
            {NAV_LINKS.map((link, linkIndex) => {
              const hasMenu = !!link.menu;
              const isOpen = hasMenu && activeMenu?.id === link.menu!.id;
              const itemClassName = cn(
                "flex select-none items-center gap-1.5 rounded-md px-3.5 py-2 font-medium text-sm transition-colors duration-150",
                isOpen
                  ? "text-violet-600"
                  : "text-slate-600 hover:text-slate-900"
              );

              return (
                <div
                  className="relative"
                  key={link.label}
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
                      aria-controls="desktop-mega-menu"
                      aria-expanded={isOpen}
                      aria-haspopup="menu"
                      className={itemClassName}
                      onFocus={() => {
                        cancelClose();
                        openMenu(link.menu!, linkIndex);
                      }}
                      onKeyDown={(event) =>
                        handleDesktopItemKeyDown(event, link, linkIndex)
                      }
                      ref={(node) => {
                        desktopItemRefs.current[linkIndex] = node;
                      }}
                      type="button"
                    >
                      {link.label}
                      <ChevronIcon open={isOpen} />
                    </button>
                  ) : hasNavigableHref(link.href) ? (
                    <a
                      className={itemClassName}
                      href={link.href}
                      onFocus={closeDesktopMenu}
                      onKeyDown={(event) =>
                        handleDesktopItemKeyDown(event, link, linkIndex)
                      }
                      ref={(node) => {
                        desktopItemRefs.current[linkIndex] = node;
                      }}
                    >
                      {link.label}
                    </a>
                  ) : (
                    <button
                      className={itemClassName}
                      onFocus={closeDesktopMenu}
                      onKeyDown={(event) =>
                        handleDesktopItemKeyDown(event, link, linkIndex)
                      }
                      ref={(node) => {
                        desktopItemRefs.current[linkIndex] = node;
                      }}
                      type="button"
                    >
                      {link.label}
                    </button>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="ml-auto hidden shrink-0 lg:flex">
            <HeaderActions />
          </div>

          <button
            aria-controls="mobile-navigation"
            aria-expanded={isMobileMenuOpen}
            aria-label={
              isMobileMenuOpen ? "Close mobile menu" : "Open mobile menu"
            }
            className="ml-auto inline-flex size-10 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 text-violet-600 transition-colors duration-150 hover:bg-violet-100 lg:hidden"
            onClick={isMobileMenuOpen ? closeMobileMenu : openMobileMenu}
            ref={mobileToggleRef}
            type="button"
          >
            {isMobileMenuOpen ? (
              <X className="size-6" strokeWidth={2} />
            ) : (
              <Menu className="size-5.5" strokeWidth={1.9} />
            )}
          </button>
        </div>

        <MegaMenu
          direction={direction}
          menu={isMobileMenuOpen ? null : activeMenu}
          onEscape={() => {
            const activeIndex = activeIndexRef.current;
            closeDesktopMenu();
            if (activeIndex >= 0) {
              focusDesktopItem(activeIndex);
            }
          }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          panelRef={megaMenuRef}
        />
        <AnimatePresence initial={false} mode="wait">
          {isMobileMenuOpen && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="absolute inset-x-0 top-16 bottom-0 bg-white sm:top-17 lg:hidden"
              exit={{ opacity: 0, y: 12 }}
              id="mobile-navigation"
              initial={{ opacity: 0, y: 12 }}
              key="mobile-navigation"
              transition={{ duration: 0.24, ease: SHELL_EASE }}
            >
              <div className="relative flex h-full flex-col">
                <div className="flex-1 overflow-y-auto sm:px-6 sm:pt-10">
                  <AnimatePresence initial={false} mode="wait">
                    {mobileMenu ? (
                      <motion.div
                        animate="center"
                        className="space-y-0"
                        exit="exit"
                        initial="enter"
                        key={mobileMenu.id}
                        variants={panelVariants}
                      >
                        {mobileMenu.columns.map((column, index) => (
                          <motion.section
                            animate="visible"
                            className={cn(
                              "px-4 py-10",
                              index !== 0 && "border-neutral-200 border-t",
                              column.accent ? "bg-violet-50/70" : "bg-white"
                            )}
                            initial="hidden"
                            key={column.heading}
                            variants={itemVariants}
                          >
                            <p className="mb-8 font-semibold text-slate-700 text-xs uppercase tracking-widest">
                              {column.heading}
                            </p>
                            <motion.div
                              animate="visible"
                              className="space-y-7"
                              initial="hidden"
                              variants={listVariants}
                            >
                              {column.items.map((item) => (
                                <motion.a
                                  className="block"
                                  href={item.href ?? "#"}
                                  key={item.label}
                                  onClick={closeMobileMenu}
                                  variants={itemVariants}
                                >
                                  <span className="block font-semibold text-lg text-slate-950 leading-none">
                                    {item.label}
                                  </span>
                                  {item.description && (
                                    <span className="mt-2 block text-base text-slate-500 leading-snug">
                                      {item.description}
                                    </span>
                                  )}
                                </motion.a>
                              ))}
                            </motion.div>
                          </motion.section>
                        ))}
                      </motion.div>
                    ) : (
                      <motion.div
                        animate="center"
                        exit="exit"
                        initial="enter"
                        key="root-mobile-menu"
                        variants={panelVariants}
                      >
                        <motion.div
                          animate="visible"
                          className="space-y-0"
                          initial="hidden"
                          variants={listVariants}
                        >
                          {NAV_LINKS.map((link) => {
                            const hasMenu = !!link.menu;

                            return (
                              <motion.div
                                className="border-neutral-200 border-b"
                                key={link.label}
                                variants={itemVariants}
                              >
                                {hasMenu ? (
                                  <button
                                    className="flex w-full items-center justify-between gap-4 px-3 py-8 text-left"
                                    onClick={() => setMobileMenu(link.menu!)}
                                    type="button"
                                  >
                                    <span className="font-semibold text-lg text-slate-950">
                                      {link.label}
                                    </span>
                                    <span className="text-slate-950">
                                      <ArrowRight
                                        className="size-4.5"
                                        strokeWidth={2}
                                      />
                                    </span>
                                  </button>
                                ) : hasNavigableHref(link.href) ? (
                                  <a
                                    className="flex items-center justify-between gap-4 px-3 py-8"
                                    href={link.href}
                                    onClick={closeMobileMenu}
                                  >
                                    <span className="font-semibold text-lg text-slate-950">
                                      {link.label}
                                    </span>
                                  </a>
                                ) : (
                                  <button
                                    className="flex w-full items-center justify-between gap-4 px-3 py-8 text-left"
                                    type="button"
                                  >
                                    <span className="font-semibold text-lg text-slate-950">
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

                <div className="shrink-0 border-neutral-200 border-t bg-white/95 px-4 pt-5 pb-6 backdrop-blur-sm sm:px-6">
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
