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
import {
  isProductionVisualParityFixtureEnabled,
  VISUAL_PARITY_ORGANIZATION_ID,
} from "#/features/production-proposals/visualParityConstants.ts";
import { cn } from "#/lib/utils.ts";
import { api } from "../../convex/_generated/api";

const INITIALS_SPLIT_PATTERN = /\s+|@/;

interface NavUserOrganization {
  membershipId: string;
  organizationName: string;
  roleNames: string[];
  roleSlug?: string;
  roleSlugs: string[];
  workosOrganizationId: string;
}

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
  const { organizationId, role, roles, signOut, switchToOrganization } =
    useAuth();
  const hasAuthenticatedUser = Boolean(user.email.trim());
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const hasBuilderWorkspaceRole = [role, ...(roles ?? [])].some(
    (value) => value === "builder" || value === "builder-staff"
  );
  const organizationResult = useQuery(
    api.workosProjection.listCurrentUserOrganizations,
    hasAuthenticatedUser && !visualFixtureEnabled ? {} : "skip"
  );
  const brokerRelationshipResult = useQuery(
    api.brokerageProvisioning.getBuilderBrokerRelationshipSummary,
    hasAuthenticatedUser &&
      hasBuilderWorkspaceRole &&
      organizationId &&
      !visualFixtureEnabled
      ? { workosOrganizationId: organizationId }
      : "skip"
  );
  const [switchingOrganizationId, setSwitchingOrganizationId] = useState<
    string | null
  >(null);

  const organizations = useMemo(
    () =>
      visualFixtureEnabled
        ? [
            {
              membershipId: "membership_visual_parity",
              organizationName: "FairLend Capital",
              roleNames: ["Admin", "Builder", "Broker"],
              roleSlug: "admin",
              roleSlugs: ["admin", "builder", "broker"],
              workosOrganizationId: VISUAL_PARITY_ORGANIZATION_ID,
            },
          ]
        : mergeOrganizationSwitchTargets(
            organizationResult?.organizations ?? [],
            organizationId
          ),
    [organizationId, organizationResult, visualFixtureEnabled]
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
            {brokerRelationshipResult ? (
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-2 pb-1">
                  Broker relationship
                </DropdownMenuLabel>
                <div className="mx-1 mb-1 rounded-md border bg-muted/40 p-2">
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate font-medium text-sm">
                        {brokerRelationshipResult.broker?.name ??
                          brokerRelationshipResult.brokerage?.displayName ??
                          "Broker assignment pending"}
                      </p>
                      <p className="truncate text-muted-foreground text-xs">
                        {formatRelationshipStatus(
                          brokerRelationshipResult.relationship.status
                        )}
                      </p>
                      <p className="truncate text-muted-foreground text-xs">
                        {brokerRelationshipResult.relationship.effectiveAt
                          ? `Effective ${formatRelationshipTimestamp(
                              brokerRelationshipResult.relationship.effectiveAt
                            )}`
                          : brokerRelationshipResult.relationship.updatedAt
                            ? `Updated ${formatRelationshipTimestamp(
                                brokerRelationshipResult.relationship.updatedAt
                              )}`
                            : brokerRelationshipResult.recovery?.message ??
                              "Waiting for broker confirmation"}
                      </p>
                    </div>
                  </div>
                </div>
              </DropdownMenuGroup>
            ) : null}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 pb-1">
                Switch organization
              </DropdownMenuLabel>
              {!visualFixtureEnabled && organizationResult === undefined ? (
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
                      key={organization.workosOrganizationId}
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
    ...new Set(
      [role, ...(roles ?? [])].filter((value): value is string =>
        Boolean(value?.trim())
      )
    ),
  ].map(formatRoleSlug);
}

function mergeOrganizationSwitchTargets(
  organizations: NavUserOrganization[],
  activeOrganizationId?: string | null
): NavUserOrganization[] {
  const organizationsByWorkosId = mergeOrganizationsByWorkosId(organizations);
  const organizationsByName = new Map<string, NavUserOrganization>();

  for (const organization of organizationsByWorkosId) {
    const switchTargetKey = organizationSwitchTargetKey(organization);
    const existing = organizationsByName.get(switchTargetKey);
    if (
      !existing ||
      isPreferredSwitchTarget(organization, existing, activeOrganizationId)
    ) {
      organizationsByName.set(switchTargetKey, organization);
    }
  }

  return [...organizationsByName.values()].sort(compareOrganizations);
}

function mergeOrganizationsByWorkosId(organizations: NavUserOrganization[]) {
  const organizationsByWorkosId = new Map<string, NavUserOrganization>();

  for (const organization of organizations) {
    const existing = organizationsByWorkosId.get(
      organization.workosOrganizationId
    );
    if (!existing) {
      organizationsByWorkosId.set(organization.workosOrganizationId, {
        ...organization,
        roleNames: uniqueStrings(organization.roleNames),
        roleSlugs: uniqueStrings(organization.roleSlugs),
      });
      continue;
    }

    const roleSlugs = uniqueStrings([
      ...existing.roleSlugs,
      ...organization.roleSlugs,
    ]);
    organizationsByWorkosId.set(organization.workosOrganizationId, {
      membershipId:
        existing.membershipId.localeCompare(organization.membershipId) <= 0
          ? existing.membershipId
          : organization.membershipId,
      organizationName:
        existing.organizationName || organization.organizationName,
      roleNames: uniqueStrings([
        ...existing.roleNames,
        ...organization.roleNames,
      ]),
      roleSlug: existing.roleSlug ?? organization.roleSlug ?? roleSlugs[0],
      roleSlugs,
      workosOrganizationId: organization.workosOrganizationId,
    });
  }

  return [...organizationsByWorkosId.values()].sort(compareOrganizations);
}

function organizationSwitchTargetKey(organization: NavUserOrganization) {
  return (
    organization.organizationName.trim().toLowerCase() ||
    organization.workosOrganizationId
  );
}

function isPreferredSwitchTarget(
  candidate: NavUserOrganization,
  existing: NavUserOrganization,
  activeOrganizationId?: string | null
) {
  if (candidate.workosOrganizationId === activeOrganizationId) {
    return true;
  }
  if (existing.workosOrganizationId === activeOrganizationId) {
    return false;
  }
  return (
    candidate.workosOrganizationId.localeCompare(
      existing.workosOrganizationId
    ) < 0
  );
}

function compareOrganizations(
  left: NavUserOrganization,
  right: NavUserOrganization
) {
  const nameComparison = left.organizationName.localeCompare(
    right.organizationName
  );
  if (nameComparison !== 0) {
    return nameComparison;
  }
  return left.workosOrganizationId.localeCompare(right.workosOrganizationId);
}

function uniqueStrings(values: string[]) {
  return [
    ...new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0
      )
    ),
  ];
}

function formatRoleSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatRelationshipStatus(status: string) {
  return status
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatRelationshipTimestamp(value: number) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function initialsFor(value: string) {
  const parts = value.split(INITIALS_SPLIT_PATTERN).filter(Boolean).slice(0, 2);
  return (
    parts.map((part) => part[0]?.toUpperCase()).join("") ||
    value[0]?.toUpperCase() ||
    "DF"
  );
}
