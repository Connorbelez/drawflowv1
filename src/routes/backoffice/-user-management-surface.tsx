"use client";

import {
  type ReactElement,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  type DirectoryUser,
  UserDetailSheet,
} from "./-user-management-detail-sheet";
import { DirectoryPanel, DirectorySources } from "./-user-management-directory";
import { FeedbackBar, PageHeader, StatStrip } from "./-user-management-header";
import { InviteSheet } from "./-user-management-invite";
import {
  collectRoleOptions,
  collectRoleOptionsByOrganization,
  computeProfileFlags,
  computeStats,
  filterUsers,
  makeInitials,
  type ProfileFilter,
  type SortMode,
  type StatusFilter,
} from "./-user-management-logic";
import { ProvisioningAlerts } from "./-user-management-provisioning";
import type {
  BrokerageProvisioningProjection,
  MembershipRoleUpdate,
  OrganizationProvisioning,
  SyncStatusProjection,
  UserManagementHandlers,
  UserManagementProjection,
  WorkosMembershipRow,
  WorkosOrganizationRow,
  WorkosPermissionRow,
  WorkosReceiptRow,
  WorkosRoleRow,
  WorkosUserRow,
} from "./-user-management-types";
import { canonicalizeWorkosMembershipRows } from "./-user-management-types";

// biome-ignore lint/performance/noBarrelFile: preserve the existing public table export from the route surface
export { UserManagementDirectoryTable } from "./-user-management-directory";

function normalizedRoleUpdate(
  update: MembershipRoleUpdate
): MembershipRoleUpdate {
  const roleSlugs = [
    ...new Set(
      [update.primaryRoleSlug, ...update.roleSlugs].filter(
        (role): role is string => Boolean(role)
      )
    ),
  ];
  return {
    membershipId: update.membershipId,
    primaryRoleSlug: update.primaryRoleSlug ?? roleSlugs[0],
    roleSlugs,
  };
}

function membershipMatchesRoleUpdate(
  membership: WorkosMembershipRow,
  update: MembershipRoleUpdate
): boolean {
  const projectedRoles = [
    ...new Set(
      [membership.roleSlug, ...(membership.roleSlugs ?? [])].filter(
        (role): role is string => Boolean(role)
      )
    ),
  ].sort();
  const acceptedRoles = [...new Set(update.roleSlugs)].sort();
  return (
    membership.roleSlug === update.primaryRoleSlug &&
    projectedRoles.length === acceptedRoles.length &&
    projectedRoles.every((role, index) => role === acceptedRoles[index])
  );
}

export function UserManagementSurface({
  accepted,
  actionError,
  brokerageProvisioning,
  onCreateMembership,
  onInviteUser,
  onLinkBuilderAccount,
  onProvisionBrokerageProfile,
  onProvisionBuilderProfile,
  onProvisionFairLendBrokerage,
  onReactivateMembership,
  onRemoveMembership,
  onRoleUpdate,
  onSyncDirectory,
  onUnlinkBuilderAccount,
  projections,
  setActionError,
  setAccepted,
  syncStatus,
}: UserManagementHandlers & {
  accepted: string | null;
  actionError: string | null;
  brokerageProvisioning: BrokerageProvisioningProjection | undefined;
  projections: UserManagementProjection | undefined;
  setAccepted: (value: string | null) => void;
  setActionError: (message: string | null) => void;
  syncStatus: SyncStatusProjection | undefined;
}): ReactElement {
  const pending = projections === undefined || syncStatus === undefined;
  const projectedMemberships = useMemo(
    () =>
      canonicalizeWorkosMembershipRows(
        (projections?.memberships ?? []) as WorkosMembershipRow[]
      ),
    [projections?.memberships]
  );
  const [acceptedRoleUpdates, setAcceptedRoleUpdates] = useState<
    Map<string, MembershipRoleUpdate>
  >(() => new Map());

  useEffect(() => {
    setAcceptedRoleUpdates((current) => {
      let next: Map<string, MembershipRoleUpdate> | undefined;
      for (const membership of projectedMemberships) {
        const acceptedUpdate = current.get(membership.workosMembershipId);
        if (
          acceptedUpdate &&
          membershipMatchesRoleUpdate(membership, acceptedUpdate)
        ) {
          next ??= new Map(current);
          next.delete(membership.workosMembershipId);
        }
      }
      return next ?? current;
    });
  }, [projectedMemberships]);

  const memberships = useMemo(
    () =>
      projectedMemberships.map((membership) => {
        const acceptedUpdate = acceptedRoleUpdates.get(
          membership.workosMembershipId
        );
        if (!acceptedUpdate) {
          return membership;
        }
        return {
          ...membership,
          roleSlug: acceptedUpdate.primaryRoleSlug,
          roleSlugs: acceptedUpdate.roleSlugs,
        };
      }),
    [acceptedRoleUpdates, projectedMemberships]
  );
  const handlers: UserManagementHandlers = {
    onCreateMembership,
    onInviteUser,
    onLinkBuilderAccount,
    onProvisionBrokerageProfile,
    onProvisionBuilderProfile,
    onProvisionFairLendBrokerage,
    onReactivateMembership,
    onRemoveMembership,
    onRoleUpdate: async (args) => {
      await onRoleUpdate(args);
      setAcceptedRoleUpdates((current) => {
        const next = new Map(current);
        next.set(args.membershipId, normalizedRoleUpdate(args));
        return next;
      });
    },
    onSyncDirectory,
    onUnlinkBuilderAccount,
  };

  const users = (projections?.users ?? []) as WorkosUserRow[];
  const organizations = (projections?.organizations ??
    []) as WorkosOrganizationRow[];
  const roles = (projections?.roles ?? []) as WorkosRoleRow[];
  const organizationRoles = (projections?.organizationRoles ??
    []) as WorkosRoleRow[];
  const permissions = (projections?.permissions ?? []) as WorkosPermissionRow[];
  const receipts = (syncStatus?.receipts ?? []) as WorkosReceiptRow[];

  const roleOptions = useMemo(
    () =>
      projections
        ? collectRoleOptions(roles, organizationRoles, memberships)
        : [],
    [projections, roles, organizationRoles, memberships]
  );
  const roleOptionsByOrganization = useMemo(
    () =>
      collectRoleOptionsByOrganization(
        roles,
        organizationRoles,
        memberships,
        organizations
      ),
    [roles, organizationRoles, memberships, organizations]
  );

  const organizationsById = useMemo(
    () =>
      new Map(
        organizations.map((organization) => [
          organization.workosOrganizationId,
          organization,
        ])
      ),
    [organizations]
  );

  const provisioningByOrg = useMemo(() => {
    const map = new Map<string, OrganizationProvisioning>();
    for (const row of brokerageProvisioning?.organizations ?? []) {
      map.set(row.workosOrganizationId, row);
    }
    return map;
  }, [brokerageProvisioning]);

  const membershipsByUser = useMemo(() => {
    const map = new Map<string, WorkosMembershipRow[]>();
    for (const membership of memberships) {
      const list = map.get(membership.workosUserId) ?? [];
      list.push(membership);
      map.set(membership.workosUserId, list);
    }
    return map;
  }, [memberships]);

  const directoryUsers = useMemo<DirectoryUser[]>(
    () =>
      users.map((user) => {
        const userMemberships =
          membershipsByUser.get(user.workosUserId ?? "") ?? [];
        const displayName =
          user.name?.trim() || user.email || user.workosUserId || "Unknown";
        return {
          displayName,
          initials: makeInitials(user.name, user.email),
          memberships: userMemberships,
          user,
        };
      }),
    [users, membershipsByUser]
  );

  const stats = useMemo(
    () => computeStats(directoryUsers, provisioningByOrg, organizations),
    [directoryUsers, provisioningByOrg, organizations]
  );
  const attentionCount = useMemo(
    () =>
      directoryUsers.filter((entry) => {
        const flags = computeProfileFlags(entry.memberships, provisioningByOrg);
        return flags.needsBrokerage || flags.needsBuilder;
      }).length,
    [directoryUsers, provisioningByOrg]
  );

  const [query, setQuery] = useState("");
  const [organizationFilter, setOrganizationFilter] = useState<string>("all");
  const [profileFilter, setProfileFilter] = useState<ProfileFilter>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<SortMode>("attention");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(
    () =>
      filterUsers(directoryUsers, {
        organizationFilter,
        organizationsById,
        profileFilter,
        provisioningByOrg,
        query: deferredQuery,
        roleFilter,
        sortMode,
        statusFilter,
      }),
    [
      directoryUsers,
      deferredQuery,
      organizationFilter,
      organizationsById,
      profileFilter,
      roleFilter,
      sortMode,
      statusFilter,
      provisioningByOrg,
    ]
  );

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const selectedUser =
    directoryUsers.find(
      (entry) => entry.user.workosUserId === selectedUserId
    ) ?? null;

  const [inviteOpen, setInviteOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 pb-12 md:p-8">
      <PageHeader
        attentionCount={attentionCount}
        onInvite={() => setInviteOpen(true)}
        onShowGaps={() => {
          setProfileFilter("missing");
          setStatusFilter("all");
          setSortMode("attention");
        }}
        onSync={async () => {
          setSyncing(true);
          setActionError(null);
          try {
            await onSyncDirectory();
          } finally {
            setSyncing(false);
          }
        }}
        pending={pending}
        receipts={receipts}
        stats={stats}
        syncing={syncing}
      />

      <FeedbackBar
        accepted={accepted}
        actionError={actionError}
        onDismiss={() => {
          setAccepted(null);
          setActionError(null);
        }}
      />

      <StatStrip stats={stats} />

      <ProvisioningAlerts
        brokerageProvisioning={brokerageProvisioning}
        onProvisionBrokerageProfile={onProvisionBrokerageProfile}
        onProvisionBuilderProfile={onProvisionBuilderProfile}
        onProvisionFairLendBrokerage={onProvisionFairLendBrokerage}
      />

      <DirectoryPanel
        filtered={filtered}
        onClearFilters={() => {
          setQuery("");
          setOrganizationFilter("all");
          setProfileFilter("all");
          setRoleFilter("all");
          setSortMode("attention");
          setStatusFilter("all");
        }}
        onOrganizationFilter={setOrganizationFilter}
        onProfileFilter={setProfileFilter}
        onRoleFilter={setRoleFilter}
        onRowClick={(userId) => setSelectedUserId(userId)}
        onSearch={setQuery}
        onSortMode={setSortMode}
        onStatusFilter={setStatusFilter}
        organizationFilter={organizationFilter}
        organizationOptions={organizations}
        organizationsById={organizationsById}
        pending={pending}
        profileFilter={profileFilter}
        provisioningByOrg={provisioningByOrg}
        query={query}
        roleFilter={roleFilter}
        roleOptions={roleOptions}
        sortMode={sortMode}
        statusFilter={statusFilter}
        total={directoryUsers.length}
      />

      <DirectorySources
        organizationRoles={organizationRoles}
        organizations={organizations}
        permissions={permissions}
        receipts={receipts}
        roles={roles}
      />

      <UserDetailSheet
        directoryUser={selectedUser}
        handlers={handlers}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedUserId(null);
          }
        }}
        organizationsById={organizationsById}
        provisioningByOrg={provisioningByOrg}
        roleOptionsByOrganization={roleOptionsByOrganization}
        workspaceOrganizations={organizations}
      />

      <InviteSheet
        onClose={() => setInviteOpen(false)}
        onInvite={onInviteUser}
        open={inviteOpen}
        organizations={organizations}
        roleOptions={roleOptions}
      />
    </main>
  );
}
