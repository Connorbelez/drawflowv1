import type { ColumnDef } from "@tanstack/react-table";
import { AlertCircle, CheckCircle2, RefreshCw, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";

import {
  membershipColumns,
  organizationColumns,
  organizationRoleColumns,
  permissionColumns,
  receiptColumns,
  roleColumns,
  userColumns,
} from "./-user-management-columns";
import { UserManagementTable } from "./-user-management-table";
import type {
  MembershipCreate,
  MembershipRoleUpdate,
  SyncStatusProjection,
  UserManagementProjection,
  WorkosMembershipRow,
  WorkosOrganizationRow,
  WorkosPermissionRow,
  WorkosReceiptRow,
  WorkosRoleRow,
  WorkosUserRow,
} from "./-user-management-types";

export function UserManagementSurface({
  accepted,
  actionError,
  onCreateMembership,
  onInviteUser,
  onReactivateMembership,
  onRemoveMembership,
  onRoleUpdate,
  onSyncDirectory,
  projections,
  setActionError,
  syncStatus,
}: {
  accepted: string | null;
  actionError: string | null;
  onCreateMembership: (args: MembershipCreate) => Promise<void>;
  onInviteUser: (args: {
    email: string;
    organizationId: string;
    roleSlug: string;
  }) => Promise<void>;
  onReactivateMembership: (membershipId: string) => Promise<void>;
  onRemoveMembership: (membershipId: string) => Promise<void>;
  onRoleUpdate: (args: MembershipRoleUpdate) => Promise<void>;
  onSyncDirectory: () => Promise<void>;
  projections: UserManagementProjection | undefined;
  setActionError: (message: string | null) => void;
  syncStatus: SyncStatusProjection | undefined;
}) {
  const [email, setEmail] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [roleSlug, setRoleSlug] = useState("builder");
  const [syncingDirectory, setSyncingDirectory] = useState(false);
  const pending = projections === undefined || syncStatus === undefined;

  const roleOptions = useMemo(
    () => (projections ? collectRoleOptions(projections) : []),
    [projections]
  );

  const users = (projections?.users ?? []) as WorkosUserRow[];
  const memberships = (projections?.memberships ?? []) as WorkosMembershipRow[];
  const organizations = (projections?.organizations ??
    []) as WorkosOrganizationRow[];
  const roles = (projections?.roles ?? []) as WorkosRoleRow[];
  const organizationRoles = (projections?.organizationRoles ??
    []) as WorkosRoleRow[];
  const permissions = (projections?.permissions ?? []) as WorkosPermissionRow[];
  const receipts = (syncStatus?.receipts ?? []) as WorkosReceiptRow[];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <Frame>
        <FrameHeader>
          <FrameTitle className="text-xl">User management</FrameTitle>
          <FrameDescription>
            WorkOS-owned users, organizations, roles, permissions, memberships,
            and webhook sync state.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <form
            className="grid gap-3 md:grid-cols-[1fr_1fr_12rem_auto]"
            onSubmit={async (event) => {
              event.preventDefault();
              await onInviteUser({ email, organizationId, roleSlug });
            }}
          >
            <Input
              aria-label="Invite email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="new.builder@example.com"
              required
              type="email"
              value={email}
            />
            <Input
              aria-label="Organization ID"
              onChange={(event) => setOrganizationId(event.target.value)}
              placeholder="org_..."
              required
              value={organizationId}
            />
            <Input
              aria-label="Role slug"
              onChange={(event) => setRoleSlug(event.target.value)}
              required
              value={roleSlug}
            />
            <Button type="submit">
              <UserPlus />
              Invite
            </Button>
          </form>
          {accepted ? (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="size-4" />
              {accepted}
            </p>
          ) : null}
          {actionError ? (
            <p
              className="mt-3 inline-flex items-center gap-2 text-destructive text-sm"
              role="alert"
            >
              <AlertCircle className="size-4" />
              {actionError}
            </p>
          ) : null}
        </FramePanel>
        <FramePanel className="flex flex-col gap-3 border-t md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="font-medium text-sm">WorkOS projection backfill</p>
            <p className="text-muted-foreground text-sm">
              Replays the current WorkOS directory into Convex when historical
              records predate the webhook or delivery was interrupted.
            </p>
          </div>
          <Button
            disabled={syncingDirectory}
            onClick={async () => {
              setSyncingDirectory(true);
              setActionError(null);
              try {
                await onSyncDirectory();
              } finally {
                setSyncingDirectory(false);
              }
            }}
            type="button"
            variant="outline"
          >
            <RefreshCw
              className={syncingDirectory ? "animate-spin" : undefined}
            />
            Sync WorkOS
          </Button>
        </FramePanel>
      </Frame>

      {pending ? (
        <Frame>
          <FramePanel className="flex items-center gap-2 text-muted-foreground text-sm">
            <RefreshCw className="size-4 animate-spin" />
            Loading WorkOS projections
          </FramePanel>
        </Frame>
      ) : (
        <>
          <UserManagementTable
            columns={
              userColumns({
                memberships,
                onCreateMembership,
                onReactivateMembership,
                onRemoveMembership,
                onRoleUpdate,
                organizations,
                roleOptions,
              }) as ColumnDef<WorkosUserRow>[]
            }
            getRowId={(row) => row._id}
            rows={users}
            title="Users"
          />
          <UserManagementTable
            columns={organizationColumns}
            getRowId={(row, index) => row._id ?? `organization-${index}`}
            rows={organizations}
            title="Organizations"
          />
          <UserManagementTable
            columns={membershipColumns({
              onCreateMembership,
              onReactivateMembership,
              onRemoveMembership,
              onRoleUpdate,
              organizations,
              roleOptions,
            })}
            getRowId={(row) => row._id ?? row.workosMembershipId}
            rows={memberships}
            title="Memberships"
          />
          <UserManagementTable
            columns={roleColumns}
            getRowId={(row, index) => row._id ?? row.slug ?? `role-${index}`}
            rows={roles}
            title="Roles"
          />
          <UserManagementTable
            columns={organizationRoleColumns}
            getRowId={(row, index) =>
              row._id ??
              `${row.workosOrganizationId ?? "org"}:${row.slug}:${index}`
            }
            rows={organizationRoles}
            title="Organization roles"
          />
          <UserManagementTable
            columns={permissionColumns}
            getRowId={(row, index) =>
              row._id ?? row.slug ?? `permission-${index}`
            }
            rows={permissions}
            title="Permissions"
          />
          <UserManagementTable
            columns={receiptColumns}
            getRowId={(row, index) =>
              row._id ?? row.eventId ?? `receipt-${index}`
            }
            rows={receipts}
            title="Webhook receipts"
          />
        </>
      )}
    </div>
  );
}

function collectRoleOptions(projections: UserManagementProjection) {
  const roles = new Set<string>();
  for (const role of projections.roles as WorkosRoleRow[]) {
    if (role.status !== "deleted" && role.slug) {
      roles.add(role.slug);
    }
  }
  for (const role of projections.organizationRoles as WorkosRoleRow[]) {
    if (role.status !== "deleted" && role.slug) {
      roles.add(role.slug);
    }
  }
  for (const membership of projections.memberships as WorkosMembershipRow[]) {
    if (membership.roleSlug) {
      roles.add(membership.roleSlug);
    }
    for (const role of membership.roleSlugs ?? []) {
      roles.add(role);
    }
  }
  return [...roles].sort();
}
