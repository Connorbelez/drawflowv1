"use client";

import {
  CalendarDays,
  ClipboardCheck,
  FileText,
  HelpCircle,
  LayoutDashboard,
  MessageSquare,
  Settings,
} from "lucide-react";
import type * as React from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "#/components/ui/sidebar.tsx";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", url: "#proposal-start" },
  { icon: CalendarDays, label: "Projects", url: "#proposal-start" },
  { icon: ClipboardCheck, label: "Draws", url: "#proposal-start" },
  { icon: FileText, label: "Proposals", url: "#proposal-start" },
  { icon: FileText, label: "Estimates", url: "#proposal-start" },
  { icon: FileText, label: "Documents", url: "#proposal-start" },
  { icon: CalendarDays, label: "Schedule", url: "#proposal-start" },
  { icon: ClipboardCheck, label: "Reports", url: "#proposal-start" },
  { icon: MessageSquare, label: "Messages", url: "#proposal-start" },
  { icon: Settings, label: "Settings", url: "#proposal-start" },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarHeader className="pb-demo-sidebar-header">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="pb-demo-brand"
              render={
                // biome-ignore lint/a11y/useAnchorContent: Base UI render prop receives accessible content from SidebarMenuButton children.
                <a href="#proposal-start" />
              }
              size="lg"
            >
              <div className="pb-demo-brand-mark">D</div>
              <div>
                <strong>DrawFlow</strong>
                <span>Lending</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="pb-demo-sidebar-content">
        <SidebarMenu className="pb-demo-nav">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  className="pb-demo-nav-item"
                  isActive={index === 0}
                  render={
                    // biome-ignore lint/a11y/useAnchorContent: Base UI render prop receives accessible content from SidebarMenuButton children.
                    <a href={item.url} />
                  }
                  tooltip={item.label}
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>

        <div className="pb-demo-help">
          <HelpCircle size={18} />
          <strong>Need help?</strong>
          <span>Visit the help center or contact support.</span>
          <a href="#proposal-start">Help Center</a>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
