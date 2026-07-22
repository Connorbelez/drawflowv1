import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown, ChevronLeft, Menu, X } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "#/lib/utils.ts";
import { MegaMenu } from "./header/mega-menu";
import {
  fairlendNavLinks,
  NAV_LINKS,
  type NavLink,
  type NavMenu,
} from "./header/nav-data";
import "./header.css";

type Direction = "ltr" | "rtl";
const SHELL_EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];
const EXIT_EASE = [0.7, 0, 0.84, 0] as [number, number, number, number];
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function hasNavigableLink(
  link?: NavLink["link"]
): link is NonNullable<NavLink["link"]> {
  return Boolean(link);
}

function Logo() {
  return (
    <Link
      {...fairlendNavLinks.home}
      aria-label="FairLend Mortgage marketing home"
      className="mkt-dhh-brand"
      preload="intent"
      viewTransition
    >
      <span className="mkt-dhh-brand-word">FairLend</span>
      <span aria-hidden="true" className="mkt-dhh-brand-divider" />
      <small>Mortgage</small>
      <em>Brokerage &amp; Investment Company</em>
    </Link>
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
  if (!mobile) {
    return (
      <>
        <Link
          {...fairlendNavLinks.contact}
          className="mkt-dhh-action mkt-dhh-action-primary"
          onClick={onAction}
          preload="intent"
          viewTransition
        >
          Get in touch
        </Link>
        <span aria-hidden="true" className="mkt-dhh-action-divider" />
        <Link
          {...fairlendNavLinks.investors}
          className="mkt-dhh-language"
          onClick={onAction}
          preload="intent"
          viewTransition
        >
          FR
        </Link>
      </>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3",
        mobile && "grid w-full grid-cols-2 gap-4"
      )}
    >
      <Link
        {...fairlendNavLinks.backoffice}
        className={cn(
          "mkt-dhh-action mkt-dhh-action-secondary",
          mobile && "mkt-dhh-action-mobile"
        )}
        onClick={onAction}
        preload="intent"
        viewTransition
      >
        Sign in
      </Link>
      <Link
        {...fairlendNavLinks.startMultiplex}
        className={cn(
          "mkt-dhh-action mkt-dhh-action-primary",
          mobile && "mkt-dhh-action-mobile"
        )}
        onClick={onAction}
        preload="intent"
        viewTransition
      >
        Start a file
        <ArrowRight className="size-3.5 shrink-0" strokeWidth={1.6} />
      </Link>
    </div>
  );
}

const DESKTOP_NAV_LINKS: NavLink[] = [
  {
    label: "Financing Solutions",
    menu: NAV_LINKS[0]?.menu,
  },
  {
    label: "Investor Opportunities",
    menu: NAV_LINKS[1]?.menu,
  },
  {
    label: "Who We Are",
    menu: NAV_LINKS[3]?.menu,
  },
  {
    label: "Resources",
    menu: NAV_LINKS[2]?.menu,
  },
  {
    label: "Contact",
    link: fairlendNavLinks.contact,
  },
];

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
      const total = DESKTOP_NAV_LINKS.length;
      let nextIndex = currentIndex;

      for (let count = 0; count < total; count++) {
        nextIndex = (nextIndex + step + total) % total;
        const nextItem = desktopItemRefs.current[nextIndex];
        if (!nextItem) {
          continue;
        }

        nextItem.focus();

        const nextLink = DESKTOP_NAV_LINKS[nextIndex];
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

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
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
    <header className="mkt-dhh-header">
      <div
        className={cn("mkt-dhh-shell", {
          "mkt-dhh-shell-closed": !(isDesktopMenuVisible || isMobileMenuOpen),
          "mkt-dhh-shell-desktop-open": isDesktopMenuVisible,
          "mkt-dhh-shell-mobile-open": isMobileMenuOpen,
          "mkt-dhh-shell-clipped": !(isDesktopMenuVisible || isMobileMenuOpen),
        })}
        ref={shellRef}
      >
        <div className="mkt-dhh-bar">
          <div className="mkt-dhh-brand-slot">
            {isMobileMenuOpen && mobileMenu ? (
              <button
                className="mkt-dhh-back"
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
            aria-label="FairLend marketing navigation"
            className="mkt-dhh-desktop-nav"
          >
            {DESKTOP_NAV_LINKS.map((link, linkIndex) => {
              const hasMenu = !!link.menu;
              const isOpen = hasMenu && activeMenu?.id === link.menu!.id;
              const itemClassName = cn(
                "mkt-dhh-nav-item",
                link.label === "Investor Opportunities" &&
                  "mkt-dhh-nav-item-active",
                isOpen && "mkt-dhh-nav-item-open"
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
                  ) : hasNavigableLink(link.link) ? (
                    <Link
                      {...link.link}
                      className={itemClassName}
                      onFocus={closeDesktopMenu}
                      onKeyDown={(event) =>
                        handleDesktopItemKeyDown(event, link, linkIndex)
                      }
                      preload="intent"
                      ref={(node) => {
                        desktopItemRefs.current[linkIndex] = node;
                      }}
                      viewTransition
                    >
                      {link.label}
                    </Link>
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

          <div className="mkt-dhh-actions">
            <HeaderActions />
          </div>

          <button
            aria-controls="mobile-navigation"
            aria-expanded={isMobileMenuOpen}
            aria-label={
              isMobileMenuOpen ? "Close mobile menu" : "Open mobile menu"
            }
            className="mkt-dhh-mobile-toggle"
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
              className="mkt-dhh-mobile-panel"
              exit={{ opacity: 0, y: 12 }}
              id="mobile-navigation"
              initial={{ opacity: 0, y: 12 }}
              key="mobile-navigation"
              transition={{ duration: 0.24, ease: SHELL_EASE }}
            >
              <div className="mkt-dhh-mobile-layout">
                <div className="mkt-dhh-mobile-scroll">
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
                              "mkt-dhh-mobile-section",
                              index !== 0 && "mkt-dhh-mobile-section-divided",
                              column.accent && "mkt-dhh-mobile-section-accent"
                            )}
                            initial="hidden"
                            key={column.heading}
                            variants={itemVariants}
                          >
                            <p className="mkt-dhh-mobile-heading">
                              {column.heading}
                            </p>
                            <motion.div
                              animate="visible"
                              className="mkt-dhh-mobile-link-list"
                              initial="hidden"
                              variants={listVariants}
                            >
                              {column.items.map((item) =>
                                item.link ? (
                                  <motion.div
                                    key={item.label}
                                    variants={itemVariants}
                                  >
                                    <Link
                                      {...item.link}
                                      className="mkt-dhh-mobile-link"
                                      onClick={closeMobileMenu}
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
                              )}
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
                                className="mkt-dhh-mobile-root-item"
                                key={link.label}
                                variants={itemVariants}
                              >
                                {hasMenu ? (
                                  <button
                                    className="mkt-dhh-mobile-root-button"
                                    onClick={() => setMobileMenu(link.menu!)}
                                    type="button"
                                  >
                                    <span>{link.label}</span>
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
                                    className="mkt-dhh-mobile-root-link"
                                    onClick={closeMobileMenu}
                                    preload="intent"
                                    viewTransition
                                  >
                                    <span>{link.label}</span>
                                  </Link>
                                ) : (
                                  <button
                                    className="mkt-dhh-mobile-root-button"
                                    type="button"
                                  >
                                    <span>{link.label}</span>
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
