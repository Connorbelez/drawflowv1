import {
  Agreement03Icon,
  BankIcon,
  BookOpen01Icon,
  Building06Icon,
  ClipboardIcon,
  ConstructionIcon,
  DashboardSquare01Icon,
  HelpCircleIcon,
  PresentationOnlineIcon,
  Settings01Icon,
  UserAdd01Icon,
  UserMultipleIcon,
  UserSettings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import type { FileRoutesByTo } from "#/routeTree.gen";

/** Typed link target — every entry here resolves through the TanStack router. */
export type SidebarNavTo = keyof FileRoutesByTo;

export type SidebarNavItem = {
  title: string;
  to: SidebarNavTo;
  icon?: ReactNode;
  /** Match when the current pathname starts with `to` (default: exact match only). */
  matchPrefix?: boolean;
  subItems?: SidebarNavItem[];
};

export type SidebarNavGroup = {
  label?: string;
  items: SidebarNavItem[];
};

const icon = (i: typeof DashboardSquare01Icon) => (
  <HugeiconsIcon icon={i} strokeWidth={2} />
);

export const navGroups: SidebarNavGroup[] = [
  {
    label: "Backoffice",
    items: [
      {
        title: "Dashboard",
        to: "/backoffice",
        icon: icon(DashboardSquare01Icon),
      },
      {
        title: "Proposals",
        to: "/backoffice/proposals",
        icon: icon(Agreement03Icon),
        matchPrefix: true,
      },
      {
        title: "Builds",
        to: "/backoffice/builds",
        icon: icon(Building06Icon),
        matchPrefix: true,
      },
      {
        title: "Builders",
        to: "/backoffice/builders",
        icon: icon(UserMultipleIcon),
        matchPrefix: true,
      },
      {
        title: "Onboard builder",
        to: "/backoffice/onboard-builder",
        icon: icon(UserAdd01Icon),
      },
      {
        title: "Onboard contractor",
        to: "/backoffice/onboard-contractor",
        icon: icon(UserAdd01Icon),
      },
      {
        title: "Contractors",
        to: "/backoffice/contractors",
        icon: icon(ConstructionIcon),
        matchPrefix: true,
      },
      {
        title: "Draws",
        to: "/backoffice/draws",
        icon: icon(BankIcon),
        matchPrefix: true,
      },
      {
        title: "Site Visits",
        to: "/backoffice/site-visits",
        icon: icon(ClipboardIcon),
        matchPrefix: true,
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        title: "User management",
        to: "/backoffice/user-management",
        icon: icon(UserSettings01Icon),
        matchPrefix: true,
      },
      {
        title: "Settings",
        to: "/backoffice/settings",
        icon: icon(Settings01Icon),
        matchPrefix: true,
      },
    ],
  },
  {
    label: "Demos",
    items: [
      {
        title: "DrawFlow",
        to: "/demo/drawflow",
        icon: icon(PresentationOnlineIcon),
        matchPrefix: true,
      },
      {
        title: "Timeline",
        to: "/demo/timeline",
        icon: icon(PresentationOnlineIcon),
        matchPrefix: true,
      },
      {
        title: "Evil Charts",
        to: "/demo/evil-charts",
        icon: icon(PresentationOnlineIcon),
        matchPrefix: true,
      },
    ],
  },
];

const builderRoute = (to: string) => to as SidebarNavTo;

export const builderNavGroups: SidebarNavGroup[] = [
  {
    label: "Builder",
    items: [
      {
        title: "Dashboard",
        to: builderRoute("/builder"),
        icon: icon(DashboardSquare01Icon),
      },
      {
        title: "Proposals",
        to: builderRoute("/builder/proposals"),
        icon: icon(ClipboardIcon),
        matchPrefix: true,
      },
      {
        title: "Live Builds",
        to: builderRoute("/builder/proposals"),
        icon: icon(Building06Icon),
        matchPrefix: true,
      },
    ],
  },
  {
    label: "Demos",
    items: [
      {
        title: "Timeline Setup",
        to: "/demo/timeline",
        icon: icon(PresentationOnlineIcon),
        matchPrefix: true,
      },
    ],
  },
];

export const builderStaffNavGroups: SidebarNavGroup[] = [
  {
    label: "Builder",
    items: [
      {
        title: "Dashboard",
        to: builderRoute("/builder-staff"),
        icon: icon(DashboardSquare01Icon),
      },
      {
        title: "Proposals",
        to: builderRoute("/builder-staff/proposals"),
        icon: icon(ClipboardIcon),
        matchPrefix: true,
      },
      {
        title: "Live Builds",
        to: builderRoute("/builder-staff/builds"),
        icon: icon(Building06Icon),
        matchPrefix: true,
      },
    ],
  },
];

export const footerNavLinks: SidebarNavItem[] = [
  { title: "About", to: "/about", icon: icon(HelpCircleIcon) },
  { title: "Docs", to: "/demo", icon: icon(BookOpen01Icon), matchPrefix: true },
];

/** Does `pathname` represent the given nav item? */
export function isNavItemActive(
  item: SidebarNavItem,
  pathname: string
): boolean {
  if (pathname === item.to) {
    return true;
  }
  if (!item.matchPrefix) {
    return false;
  }
  return pathname.startsWith(`${item.to}/`);
}
