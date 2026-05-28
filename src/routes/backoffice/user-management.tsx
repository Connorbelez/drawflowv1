import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { requireUserManagementWriteAccess } from "#/lib/auth/rbac.ts";
import { isProductionVisualParityFixtureEnabled } from "#/features/production-proposals/visualParityFixtures.ts";

import { api } from "../../../convex/_generated/api";
import { UserManagementSurface } from "./-user-management-surface";
import type {
  BrokerageProvisioningProjection,
  SyncStatusProjection,
  UserManagementProjection,
} from "./-user-management-types";

export const Route = createFileRoute("/backoffice/user-management")({
  beforeLoad: ({ context, location }) =>
    requireUserManagementWriteAccess({
      isAuthenticated: Boolean(context.userId),
      organizationId: context.organizationId,
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
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const projectionsQuery = useQuery(
    api.workosProjection.listUserManagement,
    visualFixtureEnabled ? "skip" : {},
  );
  const brokerageProvisioningQuery = useQuery(
    api.brokerageProvisioning.listBrokerageProvisioning,
    visualFixtureEnabled ? "skip" : {},
  );
  const syncStatusQuery = useQuery(
    api.workosProjection.listSyncStatus,
    visualFixtureEnabled ? "skip" : {},
  );
  const projections = visualFixtureEnabled
    ? userManagementVisualFixture.projections
    : projectionsQuery;
  const brokerageProvisioning = visualFixtureEnabled
    ? userManagementVisualFixture.brokerageProvisioning
    : brokerageProvisioningQuery;
  const syncStatus = visualFixtureEnabled
    ? userManagementVisualFixture.syncStatus
    : syncStatusQuery;
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
  const provisionBrokerageProfile = useMutation(
    api.brokerageProvisioning.provisionBrokerageProfile,
  );
  const provisionFairLendBrokerage = useMutation(
    api.brokerageProvisioning.provisionFairLendBrokerage,
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
      onProvisionBrokerageProfile={async (args) => {
        await runAction(async () => {
          const result = await provisionBrokerageProfile(args);
          return `${result.operation}: brokerage profile ${result.brokerageId}`;
        });
      }}
      onProvisionFairLendBrokerage={async () => {
        await runAction(async () => {
          const result = await provisionFairLendBrokerage({});
          return `${result.operation}: FairLendBrokerage ${result.brokerageId}`;
        });
      }}
      brokerageProvisioning={brokerageProvisioning}
      projections={projections}
      setActionError={setActionError}
      syncStatus={syncStatus}
    />
  );
}

const userManagementVisualFixture = {
  brokerageProvisioning: {
    fairLendBootstrap: {
      displayName: "FairLendBrokerage",
      principalBrokerWorkosUserId: "user_01KR207FRFHQT46EV9N538XBF3",
      workosOrganizationId: "org_01KSNW6JHW9P9YS41DZX1YHHGS",
    },
    organizations: [
      {
        brokerage: {
          _id: "brokerage_visual_fairlend",
          displayName: "FairLendBrokerage",
          legalName: "FairLendBrokerage",
          principalBrokerWorkosUserId: "user_01KR207FRFHQT46EV9N538XBF3",
          status: "active",
        },
        brokerMemberships: [
          {
            email: "principal@fairlend.local",
            name: "FairLend Principal Broker",
            roleSlugs: ["admin", "principle-broker"],
            workosMembershipId: "om_visual_principal",
            workosUserId: "user_01KR207FRFHQT46EV9N538XBF3",
          },
        ],
        hasBrokerageProfile: true,
        name: "FairLendBrokerage",
        needsBrokerageProfile: false,
        status: "active",
        workosOrganizationId: "org_01KSNW6JHW9P9YS41DZX1YHHGS",
      },
      {
        brokerage: null,
        brokerMemberships: [
          {
            email: "broker@oakline.example",
            name: "Oakline Broker",
            roleSlugs: ["broker"],
            workosMembershipId: "om_visual_broker",
            workosUserId: "user_visual_broker",
          },
        ],
        hasBrokerageProfile: false,
        name: "Oakline Lending",
        needsBrokerageProfile: true,
        status: "active",
        workosOrganizationId: "org_visual_oakline",
      },
    ],
  } satisfies BrokerageProvisioningProjection,
  projections: {
    memberships: [
      {
        roleSlug: "admin",
        roleSlugs: ["admin", "principle-broker"],
        status: "active",
        workosMembershipId: "om_visual_principal",
        workosOrganizationId: "org_01KSNW6JHW9P9YS41DZX1YHHGS",
        workosUserId: "user_01KR207FRFHQT46EV9N538XBF3",
      },
      {
        roleSlug: "broker",
        roleSlugs: ["broker"],
        status: "active",
        workosMembershipId: "om_visual_broker",
        workosOrganizationId: "org_visual_oakline",
        workosUserId: "user_visual_broker",
      },
    ],
    organizationRoles: [],
    organizations: [
      {
        name: "FairLendBrokerage",
        status: "active",
        workosOrganizationId: "org_01KSNW6JHW9P9YS41DZX1YHHGS",
      },
      {
        name: "Oakline Lending",
        status: "active",
        workosOrganizationId: "org_visual_oakline",
      },
    ],
    permissions: [],
    roles: [
      { name: "Admin", slug: "admin", status: "active" },
      {
        name: "Principal Broker",
        slug: "principle-broker",
        status: "active",
      },
      { name: "Broker", slug: "broker", status: "active" },
      { name: "Builder", slug: "builder", status: "active" },
    ],
    users: [
      {
        _creationTime: 0,
        _id: "user_visual_principal" as never,
        authId: "user_01KR207FRFHQT46EV9N538XBF3",
        email: "principal@fairlend.local",
        name: "FairLend Principal Broker",
        roleSlugs: ["admin", "principle-broker"],
        roles: "admin, principle-broker",
        status: "active",
        workosUserId: "user_01KR207FRFHQT46EV9N538XBF3",
      },
      {
        _creationTime: 0,
        _id: "user_visual_broker" as never,
        authId: "user_visual_broker",
        email: "broker@oakline.example",
        name: "Oakline Broker",
        roleSlugs: ["broker"],
        roles: "broker",
        status: "active",
        workosUserId: "user_visual_broker",
      },
    ],
  } satisfies UserManagementProjection,
  syncStatus: {
    receipts: [
      {
        _id: "receipt_visual_seed" as never,
        eventId: "brokerage_provisioning:visual",
        eventType: "brokerage.provisioning",
        status: "processed",
      },
    ],
  } satisfies SyncStatusProjection,
};

function getActionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "WorkOS user-management action failed. Try again or check the sync logs.";
}
