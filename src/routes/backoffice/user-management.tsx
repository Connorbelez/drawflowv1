import { createFileRoute } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";

import { api } from "../../../convex/_generated/api";
import { UserManagementSurface } from "./-user-management-surface";

export const Route = createFileRoute("/backoffice/user-management")({
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

  return (
    <UserManagementSurface
      accepted={accepted}
      onCreateMembership={async (args) => {
        const result = await createMembership(args);
        setAccepted(`${result.operation}: ${result.sync}`);
      }}
      onInviteUser={async (args) => {
        const result = await inviteUser(args);
        setAccepted(`${result.operation}: ${result.sync}`);
      }}
      onReactivateMembership={async (membershipId) => {
        const result = await reactivateMembership({ membershipId });
        setAccepted(`${result.operation}: ${result.sync}`);
      }}
      onRemoveMembership={async (membershipId) => {
        const result = await removeMembership({ membershipId });
        setAccepted(`${result.operation}: ${result.sync}`);
      }}
      onRoleUpdate={async (args) => {
        const result = await updateMembershipRoles(args);
        setAccepted(`${result.operation}: ${result.sync}`);
      }}
      onSyncDirectory={async () => {
        const result = await syncWorkosDirectory({});
        setAccepted(
          `${result.operation}: synced ${result.counts.organizations} organizations, ${result.counts.memberships} memberships, ${result.counts.users} users, ${result.counts.roles} roles`
        );
      }}
      projections={projections}
      setAccepted={setAccepted}
      syncStatus={syncStatus}
    />
  );
}
