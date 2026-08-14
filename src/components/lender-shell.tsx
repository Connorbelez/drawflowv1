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

import ThemeToggle from "#/components/ThemeToggle.tsx";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Separator } from "#/components/ui/separator.tsx";
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
} from "#/components/ui/sidebar.tsx";

export type LenderNavigationTitle =
  | "Dashboard"
  | "Proposals"
  | "Active Builds"
  | "Milestones"
  | "Draws"
  | "Organization";

export interface LenderShellIdentity {
  avatarFallback: string;
  organizationName: string;
  roleLabel: string;
  userName: string;
}

interface LenderNavigationItem {
  administrationOnly?: boolean;
  icon: typeof DashboardSquare01Icon;
  title: LenderNavigationTitle;
  unresolvedCount: number;
}

// TODO(lender-portal): replace these counts with the canonical, lender-scoped
// unresolved-work projection. Do not derive counts from timestamps or status copy.
const lenderNavigation: readonly LenderNavigationItem[] = [
  { title: "Dashboard", icon: DashboardSquare01Icon, unresolvedCount: 4 },
  { title: "Proposals", icon: Agreement03Icon, unresolvedCount: 1 },
  { title: "Active Builds", icon: Building06Icon, unresolvedCount: 0 },
  { title: "Milestones", icon: ClipboardIcon, unresolvedCount: 2 },
  { title: "Draws", icon: BankIcon, unresolvedCount: 1 },
  {
    title: "Organization",
    icon: UserSettings01Icon,
    administrationOnly: true,
    unresolvedCount: 0,
  },
];

// TODO(lender-portal): replace only when the authenticated lender-organization
// projection and member-role projection are implemented. The shell intentionally
// has no data query or route wiring before those contracts exist.
export const LENDER_SHELL_PLACEHOLDER_IDENTITY: LenderShellIdentity = {
  avatarFallback: "ML",
  organizationName: "Meridian Capital",
  roleLabel: "Manager access",
  userName: "Morgan Lee",
};

export function LenderShell({
  activeNavigation = "Dashboard",
  children,
  identity = LENDER_SHELL_PLACEHOLDER_IDENTITY,
  pageTitle = activeNavigation,
}: {
  activeNavigation?: LenderNavigationTitle;
  children: ReactNode;
  /**
   * A caller can provide the eventual authenticated lender identity. Until then,
   * the explicit placeholder above keeps the shared shell independently usable.
   */
  identity?: LenderShellIdentity;
  pageTitle?: string;
}) {
  return (
    <SidebarProvider>
      <LenderSidebar activeNavigation={activeNavigation} identity={identity} />
      <SidebarInset>
        <LenderAppHeader
          activeNavigation={activeNavigation}
          identity={identity}
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

function LenderSidebar({
  activeNavigation,
  identity,
}: {
  activeNavigation: LenderNavigationTitle;
  identity: LenderShellIdentity;
}) {
  return (
    <Sidebar
      className="*:data-[slot=sidebar-inner]:bg-background **:data-[slot=sidebar-menu-button]:[&>span]:text-foreground/75"
      collapsible="icon"
      variant="sidebar"
    >
      <SidebarHeader className="h-14 justify-center px-2">
        <SidebarMenuButton tooltip="DrawFlow Lender" type="button">
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
                  // Route targets do not exist yet. Keep the visual shell, but
                  // do not create speculative navigation contracts.
                  disabled={item.title !== activeNavigation}
                  isActive={item.title === activeNavigation}
                  tooltip={item.title}
                  type="button"
                >
                  <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                  <span>{item.title}</span>
                  <Badge
                    aria-label={`${item.unresolvedCount} unresolved items`}
                    className="ml-auto min-w-5 justify-center px-1 tabular-nums group-data-[collapsible=icon]:hidden"
                    variant={item.unresolvedCount > 0 ? "secondary" : "outline"}
                  >
                    {item.unresolvedCount}
                  </Badge>
                  {item.administrationOnly ? (
                    <Badge
                      className="h-4 px-1 text-xs group-data-[collapsible=icon]:hidden"
                      variant="outline"
                    >
                      Admin
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
            {identity.organizationName}
          </p>
          <p className="truncate text-muted-foreground text-xs">
            {identity.userName} · {identity.roleLabel}
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

function LenderAppHeader({
  activeNavigation,
  identity,
  pageTitle,
}: {
  activeNavigation: LenderNavigationTitle;
  identity: LenderShellIdentity;
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
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
          <span className="hidden whitespace-nowrap text-muted-foreground sm:inline">
            Lender
          </span>
          <span className="hidden text-muted-foreground sm:inline">/</span>
          <span className="hidden whitespace-nowrap text-muted-foreground sm:inline">
            {activeNavigation}
          </span>
          {pageTitle === activeNavigation ? (
            <span className="min-w-0 truncate font-medium sm:hidden">
              {activeNavigation}
            </span>
          ) : (
            <>
              <span className="hidden text-muted-foreground sm:inline">/</span>
              <span className="min-w-0 truncate font-medium">{pageTitle}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <ThemeToggle />
        <Button
          aria-label="Notifications"
          className="relative"
          disabled
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
        <Button className="h-8 gap-2 px-1.5" disabled variant="ghost">
          <Avatar size="sm">
            <AvatarFallback>{identity.avatarFallback}</AvatarFallback>
          </Avatar>
          <span className="hidden text-xs sm:inline">{identity.userName}</span>
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
