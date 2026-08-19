import {
  Agreement03Icon,
  BankIcon,
  Building06Icon,
  ClipboardIcon,
  DashboardSquare01Icon,
  UserSettings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import { Bell, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import ThemeToggle from "#/components/ThemeToggle.tsx";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "#/components/ui/avatar.tsx";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "#/components/ui/breadcrumb.tsx";
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
import {
  roleLabel as formatRoleLabel,
  normalizeRoleSlugs,
} from "#/lib/auth/rbac.ts";
import { api } from "../../convex/_generated/api";

const WHITESPACE_PATTERN = /\s+/;

export type LenderNavigationTitle =
  | "Dashboard"
  | "Proposals"
  | "Active Builds"
  | "Milestones"
  | "Draws"
  | "Organization";

type LenderNavigationTarget =
  | "/lender"
  | "/lender/proposals"
  | "/lender/builds"
  | "/lender/milestones"
  | "/lender/draws"
  | "/lender/organization";

interface LenderNavigationItem {
  icon: typeof DashboardSquare01Icon;
  title: LenderNavigationTitle;
  to: LenderNavigationTarget;
}

const lenderNavigation: readonly LenderNavigationItem[] = [
  { title: "Dashboard", icon: DashboardSquare01Icon, to: "/lender" },
  { title: "Proposals", icon: Agreement03Icon, to: "/lender/proposals" },
  { title: "Active Builds", icon: Building06Icon, to: "/lender/builds" },
  { title: "Milestones", icon: ClipboardIcon, to: "/lender/milestones" },
  { title: "Draws", icon: BankIcon, to: "/lender/draws" },
  {
    title: "Organization",
    icon: UserSettings01Icon,
    to: "/lender/organization",
  },
];

export function LenderShell({
  activeNavigation = "Dashboard",
  children,
  pageTitle = activeNavigation,
}: {
  activeNavigation?: LenderNavigationTitle;
  children: ReactNode;
  pageTitle?: string;
}) {
  const { role, roles, user } = useAuth();
  const currentOrganization = useQuery(
    api.lenderOrganizations.getCurrentLenderOrganization,
    {}
  );
  const lenderRoles = normalizeRoleSlugs([role, ...(roles ?? [])]);
  const userName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
    : "Signed-in user";
  const identity = {
    avatarFallback: initials(userName),
    avatarUrl: user?.profilePictureUrl ?? undefined,
    organizationName:
      currentOrganization?.organization?.displayName ?? "Lender organization",
    roleLabel: formatLenderRoles(lenderRoles),
    userName,
  };

  return (
    <SidebarProvider>
      <LenderSidebar
        activeNavigation={activeNavigation}
        identity={identity}
      />
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
  identity: {
    organizationName: string;
    roleLabel: string;
    userName: string;
  };
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
            {lenderNavigation
              .map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    aria-current={
                      item.title === activeNavigation ? "page" : undefined
                    }
                    isActive={item.title === activeNavigation}
                    render={
                      <Link preload="intent" to={item.to} viewTransition />
                    }
                    tooltip={item.title}
                  >
                    <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                    <span>{item.title}</span>
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
  identity: {
    avatarFallback: string;
    avatarUrl?: string;
    userName: string;
  };
  pageTitle: string;
}) {
  const navigationTarget =
    lenderNavigation.find((item) => item.title === activeNavigation)?.to ??
    "/lender";

  return (
    <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between gap-2 overflow-visible bg-background/95 px-2 backdrop-blur-sm supports-backdrop-filter:bg-background/50 sm:px-4 md:h-14 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
        <SidebarTrigger />
        <Separator
          className="mr-2 h-4 data-[orientation=vertical]:self-center"
          orientation="vertical"
        />
        <Breadcrumb>
          <BreadcrumbList className="text-xs">
            <BreadcrumbItem className="hidden sm:inline-flex">
              <BreadcrumbLink
                render={<Link preload="intent" to="/lender" viewTransition />}
              >
                Lender
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden sm:flex" />
            {pageTitle === activeNavigation ? (
              <BreadcrumbItem>
                <BreadcrumbPage>{activeNavigation}</BreadcrumbPage>
              </BreadcrumbItem>
            ) : (
              <>
                <BreadcrumbItem className="hidden sm:inline-flex">
                  <BreadcrumbLink
                    render={
                      <Link
                        preload="intent"
                        to={navigationTarget}
                        viewTransition
                      />
                    }
                  >
                    {activeNavigation}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden sm:flex" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
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
        <Button
          aria-label={`${identity.userName} account menu`}
          className="h-8 gap-2 px-1.5"
          disabled
          variant="ghost"
        >
          <Avatar className="size-7 sm:size-8">
            <AvatarImage alt={identity.userName} src={identity.avatarUrl} />
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

function formatLenderRoles(roles: readonly string[]) {
  return (
    roles
      .map((role) =>
        formatRoleLabel(role as Parameters<typeof formatRoleLabel>[0])
      )
      .join(", ") || "Lender access"
  );
}

function initials(value: string) {
  const parts = value.trim().split(WHITESPACE_PATTERN).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}
