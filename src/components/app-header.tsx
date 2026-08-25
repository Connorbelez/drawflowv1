import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import { CustomSidebarTrigger } from "#/components/custom-sidebar-trigger.tsx";
import { NavUser } from "#/components/nav-user.tsx";
import { NotificationInbox } from "#/components/notification-inbox.tsx";
import { RouteBreadcrumbs } from "#/components/route-breadcrumbs.tsx";
import ThemeToggle from "#/components/ThemeToggle.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { cn } from "#/lib/utils.ts";

export function AppHeader({
  workosOrganizationId,
}: {
  workosOrganizationId?: string | null;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between gap-2 overflow-visible px-2 sm:px-4 md:h-14 md:px-6",
        "bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/50"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
        <CustomSidebarTrigger />
        <Separator
          className="mr-2 h-4 data-[orientation=vertical]:self-center"
          orientation="vertical"
        />
        <RouteBreadcrumbs />
      </div>
      <AppHeaderActions workosOrganizationId={workosOrganizationId} />
    </header>
  );
}

export function AppHeaderActions({
  workosOrganizationId,
}: {
  workosOrganizationId?: string | null;
}) {
  const { loading, user } = useAuth();
  const navUser = user
    ? {
        name:
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.email,
        email: user.email,
        avatar: user.profilePictureUrl ?? "",
      }
    : { name: "", email: "", avatar: "" };
  return (
    <div className="flex shrink-0 items-center gap-3">
      <ThemeToggle className="size-11 md:size-8" size="icon-sm" />
      <NotificationInbox
        authReady={!loading && Boolean(user)}
        workosOrganizationId={workosOrganizationId}
      />
      <Separator
        className="h-4 data-[orientation=vertical]:self-center"
        orientation="vertical"
      />
      <NavUser user={navUser} />
    </div>
  );
}
