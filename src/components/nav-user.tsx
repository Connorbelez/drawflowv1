import { useRouter } from "@tanstack/react-router";
import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import { useQuery } from "convex/react";
import {
  Building2,
  Check,
  ChevronsUpDown,
  Loader2,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "#/components/ui/avatar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "#/components/ui/sidebar.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../convex/_generated/api";

type NavUserOrganization = {
  membershipId: string;
  organizationName: string;
  roleNames: string[];
  roleSlug?: string;
  roleSlugs: string[];
  workosOrganizationId: string;
};

export function NavUser({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}) {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const {
    organizationId,
    role,
    roles,
    signOut,
    switchToOrganization,
  } = useAuth();
  const hasAuthenticatedUser = Boolean(user.email.trim());
  const organizationResult = useQuery(
    api.workosProjection.listCurrentUserOrganizations,
    hasAuthenticatedUser ? {} : "skip"
  );
  const [switchingOrganizationId, setSwitchingOrganizationId] = useState<
    string | null
  >(null);

  const organizations = useMemo(
    () => organizationResult?.organizations ?? [],
    [organizationResult]
  );
  const activeOrganization = organizations.find(
    (organization) => organization.workosOrganizationId === organizationId
  );
  const activeRoleLabel =
    activeOrganization && activeOrganization.roleNames.length > 0
      ? activeOrganization.roleNames.join(", ")
      : roleNamesFromAuth(role, roles).join(", ") || "No role";
  const activeOrganizationName =
    activeOrganization?.organizationName ?? organizationId ?? "No organization";
  const fallbackInitials = initialsFor(user.name || user.email);

  const handleSwitchOrganization = async (
    organization: NavUserOrganization
  ) => {
    if (
      switchingOrganizationId ||
      organization.workosOrganizationId === organizationId
    ) {
      return;
    }

    setSwitchingOrganizationId(organization.workosOrganizationId);
    try {
      const result = await switchToOrganization(
        organization.workosOrganizationId
      );
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      await router.invalidate();
      toast.success(`Switched to ${organization.organizationName}`);
    } finally {
      setSwitchingOrganizationId(null);
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton className="aria-expanded:bg-muted" size="lg" />
            }
          >
            <Avatar>
              <AvatarImage alt={user.name} src={user.avatar} />
              <AvatarFallback>{fallbackInitials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs">{user.email}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-80 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar>
                    <AvatarImage alt={user.name} src={user.avatar} />
                    <AvatarFallback>{fallbackInitials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 pb-1">
                Active organization
              </DropdownMenuLabel>
              <div className="mx-1 mb-1 rounded-md border bg-muted/40 p-2">
                <div className="flex items-start gap-2">
                  <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">
                      {activeOrganizationName}
                    </p>
                    <p className="truncate text-muted-foreground text-xs">
                      {activeRoleLabel}
                    </p>
                  </div>
                </div>
              </div>
            </DropdownMenuGroup>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 pb-1">
                Switch organization
              </DropdownMenuLabel>
              {organizationResult === undefined ? (
                <DropdownMenuItem disabled>
                  <Loader2 className="animate-spin" />
                  Loading organizations
                </DropdownMenuItem>
              ) : organizations.length === 0 ? (
                <DropdownMenuItem disabled>
                  <ShieldCheck />
                  No active organizations
                </DropdownMenuItem>
              ) : (
                organizations.map((organization) => {
                  const active =
                    organization.workosOrganizationId === organizationId;
                  const switching =
                    switchingOrganizationId ===
                    organization.workosOrganizationId;
                  const roleLabel =
                    organization.roleNames.join(", ") || "No role";

                  return (
                    <DropdownMenuItem
                      className="items-start py-2"
                      disabled={Boolean(switchingOrganizationId) || active}
                      key={organization.membershipId}
                      onClick={() => handleSwitchOrganization(organization)}
                    >
                      {switching ? (
                        <Loader2 className="mt-0.5 animate-spin" />
                      ) : active ? (
                        <Check className="mt-0.5 text-primary" />
                      ) : (
                        <Building2 className="mt-0.5 text-muted-foreground" />
                      )}
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate font-medium">
                          {organization.organizationName}
                        </span>
                        <span
                          className={cn(
                            "truncate text-muted-foreground",
                            active && "text-foreground"
                          )}
                        >
                          {roleLabel}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  );
                })
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ returnTo: "/" })}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function roleNamesFromAuth(role?: string, roles?: string[]) {
  return [
    ...new Set([role, ...(roles ?? [])].filter((value): value is string =>
      Boolean(value?.trim())
    )),
  ].map(formatRoleSlug);
}

function formatRoleSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function initialsFor(value: string) {
  const parts = value
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2);
  return (
    parts.map((part) => part[0]?.toUpperCase()).join("") ||
    value[0]?.toUpperCase() ||
    "DF"
  );
}
