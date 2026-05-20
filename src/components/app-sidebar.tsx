"use client";

import {
  AudioWave01Icon,
  Building06Icon,
  CommandIcon,
  ConstructionIcon,
  Home01Icon,
  Invoice02Icon,
  LayoutBottomIcon,
  LocationCheck02Icon,
  Settings02Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { linkOptions } from "@tanstack/react-router";
import type * as React from "react";
import { NavMain } from "#/components/nav-main.tsx";
import { NavUser } from "#/components/nav-user.tsx";
import { TeamSwitcher } from "#/components/team-switcher.tsx";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "#/components/ui/sidebar.tsx";

const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  teams: [
    {
      name: "Acme Inc",
      logo: <HugeiconsIcon icon={LayoutBottomIcon} strokeWidth={2} />,
      plan: "Enterprise",
    },
    {
      name: "Acme Corp.",
      logo: <HugeiconsIcon icon={AudioWave01Icon} strokeWidth={2} />,
      plan: "Startup",
    },
    {
      name: "Evil Corp.",
      logo: <HugeiconsIcon icon={CommandIcon} strokeWidth={2} />,
      plan: "Free",
    },
  ],
  navMain: linkOptions([
    {
      title: "Home",
      to: "/backoffice",
      activeOptions: { exact: true },
      preload: "intent",
      viewTransition: { types: ["sidebar-nav"] },
      icon: <HugeiconsIcon icon={Home01Icon} strokeWidth={2} />,
    },
    {
      title: "Builds",
      to: "/backoffice/builds",
      activeOptions: { exact: false },
      preload: "intent",
      viewTransition: { types: ["sidebar-nav"] },
      icon: <HugeiconsIcon icon={Building06Icon} strokeWidth={2} />,
    },
    {
      title: "Site Visits",
      to: "/backoffice/site-visits",
      activeOptions: { exact: false },
      preload: "intent",
      viewTransition: { types: ["sidebar-nav"] },
      icon: <HugeiconsIcon icon={LocationCheck02Icon} strokeWidth={2} />,
    },
    {
      title: "Builders",
      to: "/backoffice/builders",
      activeOptions: { exact: false },
      preload: "intent",
      viewTransition: { types: ["sidebar-nav"] },
      icon: <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} />,
    },
    {
      title: "Contractors",
      to: "/backoffice/contractors",
      activeOptions: { exact: false },
      preload: "intent",
      viewTransition: { types: ["sidebar-nav"] },
      icon: <HugeiconsIcon icon={ConstructionIcon} strokeWidth={2} />,
    },
    {
      title: "Draws",
      to: "/backoffice/draws",
      activeOptions: { exact: false },
      preload: "intent",
      viewTransition: { types: ["sidebar-nav"] },
      icon: <HugeiconsIcon icon={Invoice02Icon} strokeWidth={2} />,
    },
    {
      title: "Settings",
      to: "/backoffice/settings",
      activeOptions: { exact: false },
      preload: "intent",
      viewTransition: { types: ["sidebar-nav"] },
      icon: <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />,
    },
  ]),
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
