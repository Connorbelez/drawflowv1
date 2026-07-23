import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "#/components/ui/sidebar.tsx";

const sidebarLinkClassName =
  "peer/menu-button flex h-8 w-full items-center gap-2 overflow-hidden rounded-lg p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg:not([class*='size-'])]:size-4 [&>svg]:shrink-0";

type NavMainItem = LinkProps & {
  title: string;
  icon?: ReactNode;
};

export function NavMain({ items }: { items: readonly NavMainItem[] }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {items.map(({ icon, title, ...linkProps }) => (
          <SidebarMenuItem key={`${linkProps.to}-${title}`}>
            <Link
              activeProps={{ "data-active": "true" }}
              className={sidebarLinkClassName}
              data-active="false"
              data-sidebar="menu-button"
              data-size="default"
              data-slot="sidebar-menu-button"
              inactiveProps={{ "data-active": "false" }}
              title={title}
              {...linkProps}
            >
              {icon}
              <span>{title}</span>
            </Link>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
