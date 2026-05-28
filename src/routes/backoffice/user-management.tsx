import { createFileRoute } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";

import { requireUserManagementWriteAccess } from "#/lib/auth/rbac.ts";

import { api } from "../../../convex/_generated/api";
import { UserManagementSurface } from "./-user-management-surface";

export const Route = createFileRoute("/backoffice/user-management")({
  beforeLoad: ({ context, location }) =>
    requireUserManagementWriteAccess({
      isAuthenticated: Boolean(context.userId),
      pathname: location.pathname,
      roles: [context.role, ...(context.roles ?? [])],
      workspace: "backoffice",
    }),
  staticData: {
    breadcrumb: {
      label: "User management",
      to: "/backoffice/user-management",
    },
  },
  component: UserManagementRoute,
});

function UserManagementRoute() {
  const projections = useQuery(api.workosProjection.listUserManagement, {});
  const syncStatus = useQuery(api.workosProjection.listSyncStatus, {});
  const createMembership = useAction(api.workosManagement.createMembership);
  const removeMembership = useAction(api.workosManagement.removeMembership);
  const inviteUser = useAction(api.workosManagement.inviteUser);
  const reactivateMembership = useAction(
    api.workosManagement.reactivateMembership
  );
  const syncWorkosDirectory = useAction(
    api.workosManagement.syncWorkosDirectory
  );
  const updateMembershipRoles = useAction(
    api.workosManagement.updateMembershipRoles
  );
  const [accepted, setAccepted] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const runAction = async (action: () => Promise<string>) => {
    setAccepted(null);
    setActionError(null);
    try {
      setAccepted(await action());
    } catch (error) {
      setActionError(getActionErrorMessage(error));
    }
  };

  return (
    <UserManagementSurface
      accepted={accepted}
      actionError={actionError}
      onCreateMembership={async (args) => {
        await runAction(async () => {
          const result = await createMembership(args);
          return `${result.operation}: ${result.sync}`;
        });
      }}
      onInviteUser={async (args) => {
        await runAction(async () => {
          const result = await inviteUser(args);
          return `${result.operation}: ${result.sync}`;
        });
      }}
      onReactivateMembership={async (membershipId) => {
        await runAction(async () => {
          const result = await reactivateMembership({ membershipId });
          return `${result.operation}: ${result.sync}`;
        });
      }}
      onRemoveMembership={async (membershipId) => {
        await runAction(async () => {
          const result = await removeMembership({ membershipId });
          return `${result.operation}: ${result.sync}`;
        });
      }}
      onRoleUpdate={async (args) => {
        await runAction(async () => {
          const result = await updateMembershipRoles(args);
          return `${result.operation}: ${result.sync}`;
        });
      }}
      onSyncDirectory={async () => {
        await runAction(async () => {
          const result = await syncWorkosDirectory({});
          return `${result.operation}: synced ${result.counts.organizations} organizations, ${result.counts.memberships} memberships, ${result.counts.users} users, ${result.counts.roles} roles`;
        });
      }}
      projections={projections}
      setActionError={setActionError}
      syncStatus={syncStatus}
    />
  );
}

function getActionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "WorkOS user-management action failed. Try again or check the sync logs.";
}
