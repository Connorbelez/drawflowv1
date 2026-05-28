import type { ColumnDef } from "@tanstack/react-table";
import { RotateCcw, Shield, Trash2, UserPlus } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";

import type {
  MembershipCreate,
  MembershipRoleUpdate,
  WorkosMembershipRow,
  WorkosOrganizationRow,
  WorkosPermissionRow,
  WorkosReceiptRow,
  WorkosRoleRow,
  WorkosUserRow,
} from "./-user-management-types";

interface MembershipHandlers {
  onCreateMembership: (args: MembershipCreate) => Promise<void>;
  onReactivateMembership: (membershipId: string) => Promise<void>;
  onRemoveMembership: (membershipId: string) => Promise<void>;
  onRoleUpdate: (args: MembershipRoleUpdate) => Promise<void>;
}

export function userColumns({
  memberships,
  organizations,
  roleOptions,
  ...handlers
}: MembershipHandlers & {
  memberships: WorkosMembershipRow[];
  organizations: WorkosOrganizationRow[];
  roleOptions: string[];
}): ColumnDef<WorkosUserRow>[] {
  const membershipsByUser = groupMembershipsByUser(memberships);
  const organizationsById = mapOrganizationsById(organizations);

  return [
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <div className="min-w-48">
          <p className="font-medium">{row.original.email}</p>
          <p className="text-muted-foreground text-xs">
            {row.original.name || row.original.workosUserId}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "roles",
      header: "Roles",
      cell: ({ row }) => <RoleBadges roleSlugs={row.original.roleSlugs} />,
    },
    {
      accessorKey: "status",
      header: "Status",
    },
    {
      id: "memberships",
      header: "Organizations",
      cell: ({ row }) => (
        <div className="flex min-w-96 flex-col gap-3">
          {(membershipsByUser.get(row.original.workosUserId ?? "") ?? []).map(
            (membership) => (
              <MembershipControls
                key={membership.workosMembershipId}
                membership={membership}
                organizationName={
                  organizationsById.get(membership.workosOrganizationId)
                    ?.name ?? membership.workosOrganizationId
                }
                roleOptions={roleOptions}
                {...handlers}
              />
            )
          )}
          <AddMembershipControl
            memberships={
              membershipsByUser.get(row.original.workosUserId ?? "") ?? []
            }
            onCreateMembership={handlers.onCreateMembership}
            organizations={organizations}
            roleOptions={roleOptions}
            userId={row.original.workosUserId ?? ""}
          />
        </div>
      ),
    },
    {
      accessorKey: "workosUserId",
      header: "WorkOS user ID",
    },
  ];
}

export function membershipColumns({
  organizations,
  roleOptions,
  ...handlers
}: MembershipHandlers & {
  organizations: WorkosOrganizationRow[];
  roleOptions: string[];
}): ColumnDef<WorkosMembershipRow>[] {
  const organizationsById = mapOrganizationsById(organizations);

  return [
    {
      accessorKey: "workosUserId",
      header: "User",
    },
    {
      accessorKey: "workosOrganizationId",
      header: "Organization",
      cell: ({ row }) =>
        organizationsById.get(row.original.workosOrganizationId)?.name ??
        row.original.workosOrganizationId,
    },
    {
      accessorKey: "status",
      header: "Status",
    },
    {
      id: "roles",
      header: "Roles",
      cell: ({ row }) => (
        <MembershipControls
          membership={row.original}
          organizationName={
            organizationsById.get(row.original.workosOrganizationId)?.name ??
            row.original.workosOrganizationId
          }
          roleOptions={roleOptions}
          {...handlers}
        />
      ),
    },
    {
      accessorKey: "workosMembershipId",
      header: "WorkOS membership ID",
    },
  ];
}

export function projectionColumns<T extends object>(
  keys: Array<keyof T & string>
): ColumnDef<T>[] {
  return keys.map((key) => ({
    accessorKey: key,
    header: key,
    cell: ({ row }) =>
      String((row.original as Record<string, unknown>)[key] ?? ""),
  }));
}

export const organizationColumns = projectionColumns<WorkosOrganizationRow>([
  "name",
  "status",
  "workosOrganizationId",
]);

export const roleColumns = projectionColumns<WorkosRoleRow>([
  "slug",
  "name",
  "status",
  "resourceTypeSlug",
]);

export const organizationRoleColumns = projectionColumns<WorkosRoleRow>([
  "slug",
  "name",
  "status",
  "workosOrganizationId",
]);

export const permissionColumns = projectionColumns<WorkosPermissionRow>([
  "slug",
  "name",
  "status",
]);

export const receiptColumns = projectionColumns<WorkosReceiptRow>([
  "eventType",
  "status",
  "eventId",
]);

function MembershipControls({
  membership,
  onReactivateMembership,
  onRemoveMembership,
  onRoleUpdate,
  organizationName,
  roleOptions,
}: MembershipHandlers & {
  membership: WorkosMembershipRow;
  organizationName: string;
  roleOptions: string[];
}) {
  const [saving, setSaving] = useState(false);
  const selectedRoles = useMemo(
    () => selectedRoleSlugs(membership, roleOptions),
    [membership, roleOptions]
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-background/60 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-sm">{organizationName}</p>
          <p className="text-muted-foreground text-xs">
            {membership.workosMembershipId}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {membership.status === "inactive" ? (
            <Button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await onReactivateMembership(membership.workosMembershipId);
                } finally {
                  setSaving(false);
                }
              }}
              size="sm"
              variant="outline"
            >
              <RotateCcw />
              Reactivate
            </Button>
          ) : null}
          {membership.status === "deleted" ? null : (
            <Button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await onRemoveMembership(membership.workosMembershipId);
                } finally {
                  setSaving(false);
                }
              }}
              size="sm"
              variant="outline"
            >
              <Trash2 />
              Remove
            </Button>
          )}
        </div>
      </div>
      <RoleEditor
        disabled={saving || membership.status === "deleted"}
        onSubmit={async (args) => {
          setSaving(true);
          try {
            await onRoleUpdate({
              membershipId: membership.workosMembershipId,
              ...args,
            });
          } finally {
            setSaving(false);
          }
        }}
        primaryRoleSlug={membership.roleSlug}
        roleOptions={[...new Set([...roleOptions, ...selectedRoles])]}
        roleSlugs={selectedRoles}
      />
    </div>
  );
}

function AddMembershipControl({
  memberships,
  onCreateMembership,
  organizations,
  roleOptions,
  userId,
}: {
  memberships: WorkosMembershipRow[];
  onCreateMembership: (args: MembershipCreate) => Promise<void>;
  organizations: WorkosOrganizationRow[];
  roleOptions: string[];
  userId: string;
}) {
  const availableOrganizations = organizations.filter(
    (organization) =>
      !memberships.some(
        (membership) =>
          membership.workosOrganizationId ===
            organization.workosOrganizationId && membership.status !== "deleted"
      )
  );
  const [organizationId, setOrganizationId] = useState(
    availableOrganizations[0]?.workosOrganizationId ?? ""
  );
  const [saving, setSaving] = useState(false);

  if (
    !userId ||
    availableOrganizations.length === 0 ||
    roleOptions.length === 0
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-2">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          aria-label={`Organization for ${userId}`}
          onChange={(event) => setOrganizationId(event.target.value)}
          value={organizationId}
        >
          {availableOrganizations.map((organization) => (
            <NativeSelectOption
              key={organization.workosOrganizationId}
              value={organization.workosOrganizationId}
            >
              {organization.name ?? organization.workosOrganizationId}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <RoleEditor
        disabled={saving}
        onSubmit={async ({ primaryRoleSlug, roleSlugs }) => {
          setSaving(true);
          try {
            await onCreateMembership({
              organizationId,
              primaryRoleSlug,
              roleSlugs,
              userId,
            });
          } finally {
            setSaving(false);
          }
        }}
        roleOptions={roleOptions}
        roleSlugs={[roleOptions[0]]}
        submitIcon={<UserPlus />}
        submitLabel="Add"
      />
    </div>
  );
}

function RoleEditor({
  disabled,
  onSubmit,
  primaryRoleSlug,
  roleOptions,
  roleSlugs,
  submitIcon = <Shield />,
  submitLabel = "Sync roles",
}: {
  disabled?: boolean;
  onSubmit: (args: {
    primaryRoleSlug?: string;
    roleSlugs: string[];
  }) => Promise<void>;
  primaryRoleSlug?: string;
  roleOptions: string[];
  roleSlugs: string[];
  submitIcon?: React.ReactNode;
  submitLabel?: string;
}) {
  const initialRoles =
    roleSlugs.length > 0 ? roleSlugs : roleOptions.slice(0, 1);
  const [selected, setSelected] = useState(initialRoles);
  const [primary, setPrimary] = useState(
    primaryRoleSlug ?? initialRoles[0] ?? ""
  );

  const selectedOptions = roleOptions.filter((role) => selected.includes(role));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {roleOptions.map((role) => (
          <label
            className="inline-flex items-center gap-1.5 text-xs"
            key={role}
          >
            <input
              checked={selected.includes(role)}
              disabled={disabled}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...selected, role]
                  : selected.filter((selectedRole) => selectedRole !== role);
                setSelected(next);
                if (!next.includes(primary)) {
                  setPrimary(next[0] ?? "");
                }
              }}
              type="checkbox"
            />
            {role}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">Active role</span>
        <NativeSelect
          aria-label="Active role"
          disabled={disabled || selectedOptions.length === 0}
          onChange={(event) => setPrimary(event.target.value)}
          value={primary}
        >
          {selectedOptions.map((role) => (
            <NativeSelectOption key={role} value={role}>
              {role}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          disabled={disabled || selected.length === 0 || !primary}
          onClick={() =>
            onSubmit({
              primaryRoleSlug: primary,
              roleSlugs: selected,
            })
          }
          size="sm"
          type="button"
          variant="outline"
        >
          {submitIcon}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function RoleBadges({ roleSlugs }: { roleSlugs: string[] }) {
  if (roleSlugs.length === 0) {
    return (
      <span className="text-muted-foreground text-sm">No active roles</span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {roleSlugs.map((role) => (
        <Badge key={role} variant="secondary">
          {role}
        </Badge>
      ))}
    </div>
  );
}

function selectedRoleSlugs(
  membership: WorkosMembershipRow,
  roleOptions: string[]
) {
  const roles = new Set<string>();
  if (membership.roleSlug) {
    roles.add(membership.roleSlug);
  }
  for (const role of membership.roleSlugs ?? []) {
    roles.add(role);
  }
  if (roles.size === 0 && roleOptions[0]) {
    roles.add(roleOptions[0]);
  }
  return [...roles];
}

function groupMembershipsByUser(memberships: WorkosMembershipRow[]) {
  const grouped = new Map<string, WorkosMembershipRow[]>();
  for (const membership of memberships) {
    const rows = grouped.get(membership.workosUserId) ?? [];
    rows.push(membership);
    grouped.set(membership.workosUserId, rows);
  }
  return grouped;
}

function mapOrganizationsById(organizations: WorkosOrganizationRow[]) {
  return new Map(
    organizations.map((organization) => [
      organization.workosOrganizationId,
      organization,
    ])
  );
}
