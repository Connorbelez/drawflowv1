"use client";

import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  HardHat,
  RefreshCw,
  Search,
  Send,
  UserPlus,
  X,
} from "lucide-react";
import {
  type ReactElement,
  type ReactNode,
  useDeferredValue,
  useMemo,
  useState,
} from "react";

import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge, type BadgeProps } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";

import {
  type DirectoryUser,
  UserDetailSheet,
} from "./-user-management-detail-sheet";
import type {
  BrokerageProvisioningProjection,
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

const BROKER_ROLES = ["principle-broker", "broker", "broker-staff"];
const BUILDER_ROLES = ["builder", "builder-staff"];

// Per-column skeleton widths matching the Person/Roles/Orgs/Profiles/Status ramp.
const SKELETON_CELL_WIDTHS = ["11rem", "6rem", "8rem", "7rem", "4rem"];

type StatusFilter = "all" | "active" | "inactive" | "missing-profile";

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
  const handlers: UserManagementHandlers = {
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
  };

  const users = (projections?.users ?? []) as WorkosUserRow[];
  const memberships = (projections?.memberships ?? []) as WorkosMembershipRow[];
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

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(
    () =>
      filterUsers(directoryUsers, {
        provisioningByOrg,
        query: deferredQuery,
        roleFilter,
        statusFilter,
      }),
    [directoryUsers, deferredQuery, roleFilter, statusFilter, provisioningByOrg]
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
        onInvite={() => setInviteOpen(true)}
        onSync={async () => {
          setSyncing(true);
          setActionError(null);
          try {
            await onSyncDirectory();
          } finally {
            setSyncing(false);
          }
        }}
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
        onRoleFilter={setRoleFilter}
        onRowClick={(userId) => setSelectedUserId(userId)}
        onSearch={setQuery}
        onStatusFilter={setStatusFilter}
        organizationsById={organizationsById}
        pending={pending}
        provisioningByOrg={provisioningByOrg}
        query={query}
        roleFilter={roleFilter}
        roleOptions={roleOptions}
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
        roleOptions={roleOptions}
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

function PageHeader({
  onInvite,
  onSync,
  syncing,
}: {
  onInvite: () => void;
  onSync: () => Promise<void>;
  syncing: boolean;
}): ReactElement {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="font-heading font-semibold text-2xl tracking-tight sm:text-3xl">
          Directory
        </h1>
        <p className="max-w-prose text-muted-foreground text-sm">
          People, organizations, and workspace profiles in one place. Click any
          row to manage roles, memberships, and provisioned profiles.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={syncing}
          onClick={() => {
            onSync();
          }}
          size="sm"
          variant="outline"
        >
          <RefreshCw className={syncing ? "animate-spin" : undefined} />
          Sync WorkOS
        </Button>
        <Button onClick={onInvite} size="sm">
          <UserPlus />
          Invite person
        </Button>
      </div>
    </header>
  );
}

function FeedbackBar({
  accepted,
  actionError,
  onDismiss,
}: {
  accepted: string | null;
  actionError: string | null;
  onDismiss: () => void;
}): ReactElement | null {
  if (!(accepted || actionError)) {
    return null;
  }
  const tone = actionError ? "destructive" : "success";
  const Icon = actionError ? AlertTriangle : CheckCircle2;
  return (
    <div
      className={
        tone === "destructive"
          ? "flex items-start gap-3 rounded-lg border border-destructive/24 bg-destructive/4 px-3.5 py-2.5 text-destructive-foreground text-sm"
          : "flex items-start gap-3 rounded-lg border border-success/24 bg-success/4 px-3.5 py-2.5 text-sm text-success-foreground"
      }
      role={actionError ? "alert" : "status"}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 flex-1 break-words">{actionError ?? accepted}</p>
      <Button
        aria-label="Dismiss"
        onClick={onDismiss}
        size="icon-xs"
        variant="ghost"
      >
        <X />
      </Button>
    </div>
  );
}

interface DirectoryStats {
  brokers: number;
  builders: number;
  missingBrokerageProfile: number;
  missingBuilderProfile: number;
  organizations: number;
  people: number;
}

function StatStrip({ stats }: { stats: DirectoryStats }): ReactElement {
  const cards: Array<{ hint: string; label: string; value: number }> = [
    { hint: "active accounts", label: "People", value: stats.people },
    { hint: "broker memberships", label: "Brokers", value: stats.brokers },
    { hint: "builder memberships", label: "Builders", value: stats.builders },
    {
      hint: "WorkOS organizations",
      label: "Organizations",
      value: stats.organizations,
    },
    {
      hint: "need brokerage profile",
      label: "Brokerage gaps",
      value: stats.missingBrokerageProfile,
    },
    {
      hint: "need builder profile",
      label: "Builder gaps",
      value: stats.missingBuilderProfile,
    },
  ];

  return (
    <section
      aria-label="Directory metrics"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
    >
      {cards.map((card) => (
        <div
          className="rounded-lg border bg-card/60 px-3.5 py-3"
          key={card.label}
        >
          <p className="text-[0.6875rem] text-muted-foreground uppercase tracking-wide">
            {card.label}
          </p>
          <p className="mt-1 font-heading font-semibold text-xl tabular-nums">
            {card.value}
          </p>
          <p className="text-[0.6875rem] text-muted-foreground/80">
            {card.hint}
          </p>
        </div>
      ))}
    </section>
  );
}

function ProvisioningAlerts({
  brokerageProvisioning,
  onProvisionBrokerageProfile,
  onProvisionBuilderProfile,
  onProvisionFairLendBrokerage,
}: {
  brokerageProvisioning: BrokerageProvisioningProjection | undefined;
  onProvisionBrokerageProfile: UserManagementHandlers["onProvisionBrokerageProfile"];
  onProvisionBuilderProfile: UserManagementHandlers["onProvisionBuilderProfile"];
  onProvisionFairLendBrokerage: UserManagementHandlers["onProvisionFairLendBrokerage"];
}): ReactElement | null {
  const [saving, setSaving] = useState<string | null>(null);

  if (!brokerageProvisioning) {
    return null;
  }
  const orgs = brokerageProvisioning.organizations ?? [];
  const missingBrokerage = orgs.filter((row) => row.needsBrokerageProfile);
  const missingBuilder = orgs.filter((row) => row.needsBuilderProfile);
  const fairLend = brokerageProvisioning.fairLendBootstrap;
  const fairLendRow = orgs.find(
    (row) => row.workosOrganizationId === fairLend?.workosOrganizationId
  );

  if (
    missingBrokerage.length === 0 &&
    missingBuilder.length === 0 &&
    fairLendRow?.hasBrokerageProfile
  ) {
    return null;
  }

  return (
    <section
      aria-label="Provisioning to-dos"
      className="flex flex-col gap-2 rounded-xl border bg-warning/4 p-3"
    >
      <div className="flex items-center gap-2 px-1">
        <AlertTriangle aria-hidden className="size-4 text-warning-foreground" />
        <h2 className="font-medium text-sm">Provisioning to-dos</h2>
      </div>
      <div className="grid gap-2">
        {!fairLendRow?.hasBrokerageProfile && fairLend ? (
          <ProvisioningCard
            actionLabel="Seed FairLendBrokerage"
            description={`Bootstrap the platform brokerage (${fairLend.workosOrganizationId}) and seed its principal broker.`}
            disabled={saving === "fairlend"}
            icon={<Database className="size-4" />}
            onAction={async () => {
              setSaving("fairlend");
              try {
                await onProvisionFairLendBrokerage();
              } finally {
                setSaving(null);
              }
            }}
            title="FairLendBrokerage bootstrap"
            tone="primary"
          />
        ) : null}
        {missingBrokerage.map((row) => {
          const principal =
            row.brokerMemberships.find((membership) =>
              membership.roleSlugs.includes("principle-broker")
            ) ?? row.brokerMemberships[0];
          const key = `brokerage:${row.workosOrganizationId}`;
          return (
            <ProvisioningCard
              actionLabel="Create brokerage profile"
              description={
                principal
                  ? `${row.brokerMemberships.length} broker membership${row.brokerMemberships.length === 1 ? "" : "s"} · Principal candidate ${principal.email ?? principal.workosUserId}`
                  : `${row.brokerMemberships.length} broker membership${row.brokerMemberships.length === 1 ? "" : "s"}`
              }
              disabled={saving === key}
              icon={<Building2 className="size-4" />}
              key={key}
              onAction={async () => {
                setSaving(key);
                try {
                  await onProvisionBrokerageProfile({
                    displayName: row.name,
                    legalName: row.name,
                    principalBrokerWorkosUserId: principal?.workosUserId,
                    workosOrganizationId: row.workosOrganizationId,
                  });
                } finally {
                  setSaving(null);
                }
              }}
              title={row.name}
              tone="warning"
            />
          );
        })}
        {missingBuilder.map((row) => {
          const owner = row.builderMemberships[0];
          const key = `builder:${row.workosOrganizationId}`;
          return (
            <ProvisioningCard
              actionLabel="Create builder profile"
              description={
                owner
                  ? `${row.builderMemberships.length} builder membership${row.builderMemberships.length === 1 ? "" : "s"} · Owner candidate ${owner.email ?? owner.workosUserId}`
                  : `${row.builderMemberships.length} builder membership${row.builderMemberships.length === 1 ? "" : "s"}`
              }
              disabled={saving === key}
              icon={<HardHat className="size-4" />}
              key={key}
              onAction={async () => {
                setSaving(key);
                try {
                  await onProvisionBuilderProfile({
                    displayName: row.name,
                    ownerWorkosUserId: owner?.workosUserId,
                    workosOrganizationId: row.workosOrganizationId,
                  });
                } finally {
                  setSaving(null);
                }
              }}
              title={row.name}
              tone="warning"
            />
          );
        })}
      </div>
    </section>
  );
}

function ProvisioningCard({
  actionLabel,
  description,
  disabled,
  icon,
  onAction,
  title,
  tone,
}: {
  actionLabel: string;
  description: string;
  disabled: boolean;
  icon: ReactNode;
  onAction: () => Promise<void>;
  title: string;
  tone: "primary" | "warning";
}): ReactElement {
  return (
    <div className="grid gap-2 rounded-lg border bg-background p-3 md:grid-cols-[1fr_auto] md:items-center">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={
            tone === "primary"
              ? "mt-0.5 grid size-7 place-items-center rounded-md bg-primary/12 text-primary"
              : "mt-0.5 grid size-7 place-items-center rounded-md bg-warning/16 text-warning-foreground"
          }
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
      </div>
      <Button
        disabled={disabled}
        onClick={() => {
          onAction();
        }}
        size="sm"
        variant={tone === "primary" ? "default" : "outline"}
      >
        {actionLabel}
      </Button>
    </div>
  );
}

function DirectoryPanel({
  filtered,
  onRowClick,
  onRoleFilter,
  onSearch,
  onStatusFilter,
  organizationsById,
  pending,
  provisioningByOrg,
  query,
  roleFilter,
  roleOptions,
  statusFilter,
  total,
}: {
  filtered: DirectoryUser[];
  onRowClick: (workosUserId: string) => void;
  onRoleFilter: (role: string) => void;
  onSearch: (value: string) => void;
  onStatusFilter: (status: StatusFilter) => void;
  organizationsById: Map<string, WorkosOrganizationRow>;
  pending: boolean;
  provisioningByOrg: Map<string, OrganizationProvisioning>;
  query: string;
  roleFilter: string;
  roleOptions: string[];
  statusFilter: StatusFilter;
  total: number;
}): ReactElement {
  return (
    <section
      aria-label="People"
      className="flex flex-col gap-3 rounded-xl border bg-card/40"
    >
      <div className="flex flex-col gap-3 border-b px-3.5 py-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 sm:max-w-sm sm:flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search people"
            className="pl-7"
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search by name, email, or org"
            size="sm"
            type="search"
            value={query}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-initial">
            <label className="text-foreground text-xs" htmlFor="filter-role">
              Role
            </label>
            <NativeSelect
              aria-label="Role filter"
              className="min-w-0 flex-1 sm:flex-initial"
              id="filter-role"
              onChange={(event) => onRoleFilter(event.target.value)}
              value={roleFilter}
            >
              <NativeSelectOption value="all">All roles</NativeSelectOption>
              {roleOptions.map((role) => (
                <NativeSelectOption key={role} value={role}>
                  {role}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-initial">
            <label className="text-foreground text-xs" htmlFor="filter-status">
              Status
            </label>
            <NativeSelect
              aria-label="Status filter"
              className="min-w-0 flex-1 sm:flex-initial"
              id="filter-status"
              onChange={(event) =>
                onStatusFilter(event.target.value as StatusFilter)
              }
              value={statusFilter}
            >
              <NativeSelectOption value="all">All</NativeSelectOption>
              <NativeSelectOption value="active">Active</NativeSelectOption>
              <NativeSelectOption value="inactive">Inactive</NativeSelectOption>
              <NativeSelectOption value="missing-profile">
                Missing profile
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <p className="text-muted-foreground text-xs tabular-nums sm:ms-auto">
            {filtered.length} of {total}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[36%]">Person</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Organizations</TableHead>
              <TableHead>Profiles</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending ? (
              <PlaceholderRows columnCount={5} />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  className="py-10 text-center text-muted-foreground text-sm"
                  colSpan={5}
                >
                  No people match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((entry) => (
                <PersonRow
                  entry={entry}
                  key={entry.user._id ?? entry.user.workosUserId}
                  onClick={() => onRowClick(entry.user.workosUserId ?? "")}
                  organizationsById={organizationsById}
                  provisioningByOrg={provisioningByOrg}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function PersonRow({
  entry,
  onClick,
  organizationsById,
  provisioningByOrg,
}: {
  entry: DirectoryUser;
  onClick: () => void;
  organizationsById: Map<string, WorkosOrganizationRow>;
  provisioningByOrg: Map<string, OrganizationProvisioning>;
}): ReactElement {
  const { user, memberships, displayName, initials } = entry;
  const distinctRoles = uniqueRoles(memberships);
  const orgsForUser = memberships.filter((m) => m.status === "active");
  const profileFlags = computeProfileFlags(memberships, provisioningByOrg);

  return (
    <TableRow
      className="cursor-pointer transition-colors hover:bg-accent/40 has-[button[data-row-trigger]:focus-visible]:bg-accent/40"
      onClick={onClick}
    >
      <TableCell>
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-8 bg-secondary text-secondary-foreground">
            <AvatarFallback className="bg-secondary text-secondary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <button
              aria-label={`Manage ${displayName}`}
              className="block min-w-0 max-w-full truncate rounded-sm text-left font-medium text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-row-trigger
              onClick={(event) => {
                event.stopPropagation();
                onClick();
              }}
              type="button"
            >
              {displayName}
            </button>
            <p className="truncate text-muted-foreground text-xs">
              {user.email ?? user.workosUserId}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {distinctRoles.length === 0 ? (
          <span className="text-muted-foreground text-xs">No roles</span>
        ) : (
          <div className="flex max-w-[18rem] flex-wrap gap-1">
            {distinctRoles.slice(0, 3).map((role) => (
              <Badge key={role} variant="secondary">
                {role}
              </Badge>
            ))}
            {distinctRoles.length > 3 ? (
              <Badge
                title={distinctRoles.slice(3).join(", ")}
                variant="outline"
              >
                +{distinctRoles.length - 3}
              </Badge>
            ) : null}
          </div>
        )}
      </TableCell>
      <TableCell>
        {orgsForUser.length === 0 ? (
          <span className="text-muted-foreground text-xs">No orgs</span>
        ) : (
          <ul className="flex max-w-[20rem] flex-col gap-0.5">
            {orgsForUser.slice(0, 2).map((membership) => (
              <li
                className="truncate text-xs"
                key={membership.workosMembershipId}
              >
                {organizationsById.get(membership.workosOrganizationId)?.name ??
                  membership.workosOrganizationId}
              </li>
            ))}
            {orgsForUser.length > 2 ? (
              <li
                className="text-muted-foreground text-xs"
                title={orgsForUser
                  .slice(2)
                  .map(
                    (membership) =>
                      organizationsById.get(membership.workosOrganizationId)
                        ?.name ?? membership.workosOrganizationId
                  )
                  .join(", ")}
              >
                +{orgsForUser.length - 2} more
              </li>
            ) : null}
          </ul>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          {profileFlags.brokerage ? (
            <Badge variant="success">
              <Building2 className="size-3" />
              Brokerage
            </Badge>
          ) : profileFlags.needsBrokerage ? (
            <Badge variant="warning">
              <AlertTriangle className="size-3" />
              Brokerage missing
            </Badge>
          ) : null}
          {profileFlags.builder ? (
            <Badge variant="success">
              <HardHat className="size-3" />
              Builder
            </Badge>
          ) : profileFlags.needsBuilder ? (
            <Badge variant="warning">
              <AlertTriangle className="size-3" />
              Builder missing
            </Badge>
          ) : null}
          {profileFlags.brokerage ||
          profileFlags.builder ||
          profileFlags.needsBrokerage ||
          profileFlags.needsBuilder ? null : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <UserStatusBadge status={user.status} />
      </TableCell>
    </TableRow>
  );
}

function UserStatusBadge({ status }: { status?: string | null }): ReactElement {
  const variant: BadgeProps["variant"] =
    status === "active"
      ? "success"
      : status === "inactive"
        ? "outline"
        : status === "pending"
          ? "warning"
          : "outline";
  return <Badge variant={variant}>{status ?? "unknown"}</Badge>;
}

function PlaceholderRows({
  columnCount,
}: {
  columnCount: number;
}): ReactElement {
  return (
    <>
      {Array.from({ length: 4 }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
        <TableRow key={index}>
          {Array.from({ length: columnCount }, (_, cellIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cells
            <TableCell key={cellIndex}>
              <div
                className="h-4 max-w-full animate-pulse rounded bg-muted"
                style={{ width: SKELETON_CELL_WIDTHS[cellIndex] ?? "5rem" }}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function DirectorySources({
  organizationRoles,
  organizations,
  permissions,
  receipts,
  roles,
}: {
  organizationRoles: WorkosRoleRow[];
  organizations: WorkosOrganizationRow[];
  permissions: WorkosPermissionRow[];
  receipts: WorkosReceiptRow[];
  roles: WorkosRoleRow[];
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-label="Directory infrastructure"
      className="rounded-xl border bg-card/40"
    >
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
          <span className="font-medium text-sm">Directory infrastructure</span>
        </span>
        <span className="text-muted-foreground text-xs">
          {organizations.length} orgs · {roles.length} roles ·{" "}
          {organizationRoles.length} org roles · {permissions.length}{" "}
          permissions · {receipts.length} webhook receipts
        </span>
      </button>
      {open ? (
        <div className="grid gap-4 border-t p-3.5 lg:grid-cols-2">
          <CompactTable
            caption="Organizations"
            columns={["Name", "Status", "WorkOS ID"]}
            getRowId={(row, index) => row._id ?? `organization-${index}`}
            renderRow={(row) => [
              row.name ?? "—",
              row.status ?? "—",
              <span className="font-mono text-[0.6875rem]" key="id">
                {row.workosOrganizationId}
              </span>,
            ]}
            rows={organizations}
          />
          <CompactTable
            caption="Roles"
            columns={["Slug", "Name", "Status", "Resource"]}
            getRowId={(row, index) => row._id ?? row.slug ?? `role-${index}`}
            renderRow={(row) => [
              <span className="font-mono text-[0.6875rem]" key="slug">
                {row.slug}
              </span>,
              row.name ?? "—",
              row.status ?? "—",
              row.resourceTypeSlug ?? "—",
            ]}
            rows={roles}
          />
          <CompactTable
            caption="Organization roles"
            columns={["Slug", "Name", "Status", "Org"]}
            getRowId={(row, index) =>
              row._id ??
              `${row.workosOrganizationId ?? "org"}:${row.slug}:${index}`
            }
            renderRow={(row) => [
              <span className="font-mono text-[0.6875rem]" key="slug">
                {row.slug}
              </span>,
              row.name ?? "—",
              row.status ?? "—",
              <span className="font-mono text-[0.6875rem]" key="org">
                {row.workosOrganizationId ?? "—"}
              </span>,
            ]}
            rows={organizationRoles}
          />
          <CompactTable
            caption="Permissions"
            columns={["Slug", "Name", "Status"]}
            getRowId={(row, index) =>
              row._id ?? row.slug ?? `permission-${index}`
            }
            renderRow={(row) => [
              <span className="font-mono text-[0.6875rem]" key="slug">
                {row.slug}
              </span>,
              row.name ?? "—",
              row.status ?? "—",
            ]}
            rows={permissions}
          />
          <CompactTable
            caption="Webhook receipts"
            columns={["Event", "Status", "Event ID"]}
            getRowId={(row, index) =>
              row._id ?? row.eventId ?? `receipt-${index}`
            }
            renderRow={(row) => [
              row.eventType,
              row.status,
              <span className="font-mono text-[0.6875rem]" key="id">
                {row.eventId}
              </span>,
            ]}
            rows={receipts}
          />
        </div>
      ) : null}
    </section>
  );
}

function CompactTable<T>({
  caption,
  columns,
  getRowId,
  renderRow,
  rows,
}: {
  caption: string;
  columns: string[];
  getRowId: (row: T, index: number) => string;
  renderRow: (row: T) => ReactNode[];
  rows: T[];
}): ReactElement {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="border-b bg-muted/40 px-3 py-2">
        <h4 className="font-medium text-xs">{caption}</h4>
      </div>
      <div className="max-h-72 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  className="py-6 text-center text-muted-foreground text-xs"
                  colSpan={columns.length}
                >
                  No records
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => (
                <TableRow key={getRowId(row, index)}>
                  {renderRow(row).map((cell, cellIndex) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable column order
                    <TableCell key={cellIndex}>{cell}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function InviteSheet({
  onClose,
  onInvite,
  open,
  organizations,
  roleOptions,
}: {
  onClose: () => void;
  onInvite: UserManagementHandlers["onInviteUser"];
  open: boolean;
  organizations: WorkosOrganizationRow[];
  roleOptions: string[];
}): ReactElement {
  const [email, setEmail] = useState("");
  const [organizationId, setOrganizationId] = useState(
    organizations[0]?.workosOrganizationId ?? ""
  );
  const [roleSlug, setRoleSlug] = useState(roleOptions[0] ?? "builder");
  const [sending, setSending] = useState(false);

  const effectiveOrgId =
    organizationId &&
    organizations.some((o) => o.workosOrganizationId === organizationId)
      ? organizationId
      : (organizations[0]?.workosOrganizationId ?? "");

  return (
    <Sheet
      onOpenChange={(value) => {
        if (!value) {
          onClose();
        }
      }}
      open={open}
    >
      <SheetContent className="w-full min-w-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Invite someone</SheetTitle>
          <SheetDescription>
            Send a WorkOS invitation. The recipient gets an email and shows up
            here once they accept.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel>
          <form
            className="flex flex-col gap-3"
            id="invite-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!effectiveOrgId) {
                return;
              }
              setSending(true);
              try {
                await onInvite({
                  email,
                  organizationId: effectiveOrgId,
                  roleSlug,
                });
                setEmail("");
                onClose();
              } finally {
                setSending(false);
              }
            }}
          >
            <Field htmlFor="invite-email" label="Work email">
              <Input
                autoFocus
                id="invite-email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="someone@example.com"
                required
                type="email"
                value={email}
              />
            </Field>
            <Field htmlFor="invite-org" label="Organization">
              <NativeSelect
                className="w-full"
                id="invite-org"
                onChange={(event) => setOrganizationId(event.target.value)}
                value={effectiveOrgId}
              >
                {organizations.map((organization) => (
                  <NativeSelectOption
                    key={organization.workosOrganizationId}
                    value={organization.workosOrganizationId}
                  >
                    {organization.name ?? organization.workosOrganizationId}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field htmlFor="invite-role" label="Role">
              <NativeSelect
                className="w-full"
                id="invite-role"
                onChange={(event) => setRoleSlug(event.target.value)}
                value={roleSlug}
              >
                {(roleOptions.length > 0 ? roleOptions : ["builder"]).map(
                  (role) => (
                    <NativeSelectOption key={role} value={role}>
                      {role}
                    </NativeSelectOption>
                  )
                )}
              </NativeSelect>
            </Field>
          </form>
        </SheetPanel>
        <SheetFooter>
          <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
          <Button
            disabled={sending || !effectiveOrgId || !email}
            form="invite-form"
            type="submit"
          >
            <Send />
            Send invitation
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  children,
  htmlFor,
  label,
}: {
  children: ReactNode;
  htmlFor: string;
  label: string;
}): ReactElement {
  return (
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={htmlFor}>
      <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}

function uniqueRoles(memberships: WorkosMembershipRow[]): string[] {
  const set = new Set<string>();
  for (const membership of memberships) {
    if (membership.status === "deleted") {
      continue;
    }
    if (membership.roleSlug) {
      set.add(membership.roleSlug);
    }
    for (const role of membership.roleSlugs ?? []) {
      set.add(role);
    }
  }
  return [...set].sort();
}

function computeProfileFlags(
  memberships: WorkosMembershipRow[],
  provisioningByOrg: Map<string, OrganizationProvisioning>
): {
  brokerage: boolean;
  builder: boolean;
  needsBrokerage: boolean;
  needsBuilder: boolean;
} {
  let brokerage = false;
  let builder = false;
  let needsBrokerage = false;
  let needsBuilder = false;
  for (const membership of memberships) {
    if (membership.status !== "active") {
      continue;
    }
    const provisioning = provisioningByOrg.get(membership.workosOrganizationId);
    if (!provisioning) {
      continue;
    }
    const roles = membershipRoles(membership);
    const isBroker = roles.some((role) => BROKER_ROLES.includes(role));
    const isBuilder = roles.some((role) => BUILDER_ROLES.includes(role));
    if (isBroker) {
      if (provisioning.hasBrokerageProfile) {
        brokerage = true;
      } else {
        needsBrokerage = true;
      }
    }
    if (isBuilder) {
      if (provisioning.hasBuilderProfile) {
        builder = true;
      } else {
        needsBuilder = true;
      }
    }
  }
  return { brokerage, builder, needsBrokerage, needsBuilder };
}

function membershipRoles(membership: WorkosMembershipRow): string[] {
  const set = new Set<string>();
  if (membership.roleSlug) {
    set.add(membership.roleSlug);
  }
  for (const role of membership.roleSlugs ?? []) {
    set.add(role);
  }
  return [...set];
}

function computeStats(
  directoryUsers: DirectoryUser[],
  provisioningByOrg: Map<string, OrganizationProvisioning>,
  organizations: WorkosOrganizationRow[]
): DirectoryStats {
  let brokers = 0;
  let builders = 0;
  const brokerSeen = new Set<string>();
  const builderSeen = new Set<string>();
  for (const entry of directoryUsers) {
    for (const membership of entry.memberships) {
      if (membership.status !== "active") {
        continue;
      }
      const roles = membershipRoles(membership);
      if (
        roles.some((role) => BROKER_ROLES.includes(role)) &&
        !brokerSeen.has(membership.workosUserId)
      ) {
        brokers += 1;
        brokerSeen.add(membership.workosUserId);
      }
      if (
        roles.some((role) => BUILDER_ROLES.includes(role)) &&
        !builderSeen.has(membership.workosUserId)
      ) {
        builders += 1;
        builderSeen.add(membership.workosUserId);
      }
    }
  }
  let missingBrokerageProfile = 0;
  let missingBuilderProfile = 0;
  for (const row of provisioningByOrg.values()) {
    if (row.needsBrokerageProfile) {
      missingBrokerageProfile += 1;
    }
    if (row.needsBuilderProfile) {
      missingBuilderProfile += 1;
    }
  }
  return {
    brokers,
    builders,
    missingBrokerageProfile,
    missingBuilderProfile,
    organizations: organizations.length,
    people: directoryUsers.filter((entry) => entry.user.status === "active")
      .length,
  };
}

function filterUsers(
  directoryUsers: DirectoryUser[],
  {
    provisioningByOrg,
    query,
    roleFilter,
    statusFilter,
  }: {
    provisioningByOrg: Map<string, OrganizationProvisioning>;
    query: string;
    roleFilter: string;
    statusFilter: StatusFilter;
  }
): DirectoryUser[] {
  const normalized = query.trim().toLowerCase();
  return directoryUsers.filter((entry) =>
    matchesEntry(entry, {
      normalized,
      provisioningByOrg,
      roleFilter,
      statusFilter,
    })
  );
}

function matchesEntry(
  entry: DirectoryUser,
  {
    normalized,
    provisioningByOrg,
    roleFilter,
    statusFilter,
  }: {
    normalized: string;
    provisioningByOrg: Map<string, OrganizationProvisioning>;
    roleFilter: string;
    statusFilter: StatusFilter;
  }
): boolean {
  if (!matchesRole(entry, roleFilter)) {
    return false;
  }
  if (!matchesStatus(entry, statusFilter, provisioningByOrg)) {
    return false;
  }
  return matchesQuery(entry, normalized);
}

function matchesRole(entry: DirectoryUser, roleFilter: string): boolean {
  if (roleFilter === "all") {
    return true;
  }
  return entry.memberships.some((membership) =>
    membershipRoles(membership).includes(roleFilter)
  );
}

function matchesStatus(
  entry: DirectoryUser,
  statusFilter: StatusFilter,
  provisioningByOrg: Map<string, OrganizationProvisioning>
): boolean {
  if (statusFilter === "active") {
    return entry.user.status === "active";
  }
  if (statusFilter === "inactive") {
    return entry.user.status !== "active";
  }
  if (statusFilter === "missing-profile") {
    const flags = computeProfileFlags(entry.memberships, provisioningByOrg);
    return flags.needsBrokerage || flags.needsBuilder;
  }
  return true;
}

function matchesQuery(entry: DirectoryUser, normalized: string): boolean {
  if (!normalized) {
    return true;
  }
  const hay =
    `${entry.displayName} ${entry.user.email ?? ""} ${entry.user.workosUserId ?? ""}`.toLowerCase();
  if (hay.includes(normalized)) {
    return true;
  }
  return entry.memberships.some((membership) =>
    membership.workosOrganizationId.toLowerCase().includes(normalized)
  );
}

function collectRoleOptions(
  roles: WorkosRoleRow[],
  organizationRoles: WorkosRoleRow[],
  memberships: WorkosMembershipRow[]
): string[] {
  const collected = new Set<string>();
  for (const role of roles) {
    if (role.status !== "deleted" && role.slug) {
      collected.add(role.slug);
    }
  }
  for (const role of organizationRoles) {
    if (role.status !== "deleted" && role.slug) {
      collected.add(role.slug);
    }
  }
  for (const membership of memberships) {
    if (membership.roleSlug) {
      collected.add(membership.roleSlug);
    }
    for (const role of membership.roleSlugs ?? []) {
      collected.add(role);
    }
  }
  return [...collected].sort();
}

const INITIALS_EMAIL_RE = /@.*/;
const INITIALS_SPLIT_RE = /[\s._-]+/;

function makeInitials(
  name: string | null | undefined,
  email: string | null | undefined
): string {
  const source = (name?.trim() || email?.trim() || "??").toString();
  const parts = source
    .replace(INITIALS_EMAIL_RE, "")
    .split(INITIALS_SPLIT_RE)
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
