import {
  Agreement03Icon,
  BankIcon,
  Building06Icon,
  ClipboardIcon,
  DashboardSquare01Icon,
  UserSettings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Bell, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import ThemeToggle from "../ThemeToggle";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "../ui/sidebar";

interface PrototypeNavigationItem {
  icon: typeof DashboardSquare01Icon;
  managerOnly?: boolean;
  title: string;
}

const lenderNavigation: readonly PrototypeNavigationItem[] = [
  { title: "Dashboard", icon: DashboardSquare01Icon },
  { title: "Proposals", icon: Agreement03Icon },
  { title: "Active Builds", icon: Building06Icon },
  { title: "Milestones", icon: ClipboardIcon },
  { title: "Draws", icon: BankIcon },
  {
    title: "Organization",
    icon: UserSettings01Icon,
    managerOnly: true,
  },
];

type PrototypeNavigationTitle = (typeof lenderNavigation)[number]["title"];

export function LenderPrototypeShell({
  activeNavigation = "Milestones",
  children,
  pageTitle = activeNavigation,
}: {
  activeNavigation?: PrototypeNavigationTitle;
  children: ReactNode;
  pageTitle?: string;
}) {
  return (
    <SidebarProvider>
      <PrototypeSidebar activeNavigation={activeNavigation} />
      <SidebarInset>
        <PrototypeAppHeader
          activeNavigation={activeNavigation}
          pageTitle={pageTitle}
        />
        <div className="flex min-h-0 w-full flex-1 flex-col p-0">
          {children}
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-14 z-[54] hidden border-border border-t md:block"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none fixed top-[3.18rem] left-[2.77rem] z-[55] hidden size-1.5 rotate-45 border bg-background md:block"
        />
      </SidebarInset>
    </SidebarProvider>
  );
}

function PrototypeSidebar({
  activeNavigation,
}: {
  activeNavigation: PrototypeNavigationTitle;
}) {
  return (
    <Sidebar
      className="*:data-[slot=sidebar-inner]:bg-background **:data-[slot=sidebar-menu-button]:[&>span]:text-foreground/75"
      collapsible="icon"
      variant="sidebar"
    >
      <SidebarHeader className="h-14 justify-center px-2">
        <SidebarMenuButton tooltip="DrawFlow Lender">
          <DrawFlowMark className="size-5 shrink-0" />
          <span className="font-medium text-foreground!">DrawFlow Lender</span>
        </SidebarMenuButton>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Lender</SidebarGroupLabel>
          <SidebarMenu>
            {lenderNavigation.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  aria-current={
                    item.title === activeNavigation ? "page" : undefined
                  }
                  isActive={item.title === activeNavigation}
                  tabIndex={item.title === activeNavigation ? 0 : -1}
                  tooltip={item.title}
                  type="button"
                >
                  <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                  <span>{item.title}</span>
                  {item.managerOnly ? (
                    <Badge
                      className="ml-auto h-4 px-1 text-xs group-data-[collapsible=icon]:hidden"
                      variant="outline"
                    >
                      Manager
                    </Badge>
                  ) : null}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-0 p-0">
        <div className="border-t p-2 transition-opacity group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0">
          <p className="truncate font-medium text-foreground text-xs">
            Lender workspace
          </p>
          <p className="truncate text-muted-foreground text-xs">
            Lender reviewer access
          </p>
        </div>
        <div className="px-4 pt-2 pb-2 transition-opacity group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0">
          <p className="text-nowrap text-muted-foreground text-xs">
            © {new Date().getFullYear()} DrawFlow
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function PrototypeAppHeader({
  activeNavigation,
  pageTitle,
}: {
  activeNavigation: PrototypeNavigationTitle;
  pageTitle: string;
}) {
  return (
    <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between gap-2 overflow-visible bg-background/95 px-2 backdrop-blur-sm supports-backdrop-filter:bg-background/50 sm:px-4 md:h-14 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
        <SidebarTrigger />
        <Separator
          className="mr-2 h-4 data-[orientation=vertical]:self-center"
          orientation="vertical"
        />
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span className="text-muted-foreground">Lender</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">{activeNavigation}</span>
          {pageTitle === activeNavigation ? null : (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="truncate font-medium">{pageTitle}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <ThemeToggle />
        <Button
          aria-label="Notifications"
          className="relative"
          size="icon"
          variant="ghost"
        >
          <Bell />
          <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />
        </Button>
        <Separator
          className="h-4 data-[orientation=vertical]:self-center"
          orientation="vertical"
        />
        <Button className="h-8 gap-2 px-1.5" variant="ghost">
          <Avatar size="sm">
            <AvatarFallback>LR</AvatarFallback>
          </Avatar>
          <span className="hidden text-xs sm:inline">Lender reviewer</span>
          <ChevronDown className="hidden size-3 text-muted-foreground sm:block" />
        </Button>
      </div>
    </header>
  );
}

function DrawFlowMark({ className }: { className?: string }) {
  return (
    <svg
      aria-label="DrawFlow"
      className={className}
      fill="currentColor"
      role="img"
      viewBox="0 0 24 24"
    >
      <path d="M2 2h6v6H2V2Zm7 7h6v6H9V9Zm7-7h6v6h-6V2ZM2 16h6v6H2v-6Zm14 0h6v6h-6v-6Z" />
      <path
        d="M7 4.5h10v2H7v-2Zm-2 2h2v11H5v-11Zm12 0h2v11h-2v-11ZM7 17.5h10v2H7v-2Z"
        opacity=".55"
      />
    </svg>
  );
}
