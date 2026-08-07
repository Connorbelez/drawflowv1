import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { isProductionVisualParityFixtureEnabled } from "#/features/production-proposals/visualParityConstants.ts";
import { requireUserManagementWriteAccess } from "#/lib/auth/rbac.ts";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
    visualFixtureEnabled ? "skip" : {}
  );
  const brokerageProvisioningQuery = useQuery(
    api.brokerageProvisioning.listBrokerageProvisioning,
    visualFixtureEnabled ? "skip" : {}
  );
  const syncStatusQuery = useQuery(
    api.workosProjection.listSyncStatus,
    visualFixtureEnabled ? "skip" : {}
  );
  const projections = (
    visualFixtureEnabled
      ? userManagementVisualFixture.projections
      : projectionsQuery
  ) as UserManagementProjection | undefined;
  const brokerageProvisioning = (
    visualFixtureEnabled
      ? userManagementVisualFixture.brokerageProvisioning
      : brokerageProvisioningQuery
  ) as BrokerageProvisioningProjection | undefined;
  const syncStatus = (
    visualFixtureEnabled
      ? userManagementVisualFixture.syncStatus
      : syncStatusQuery
  ) as SyncStatusProjection | undefined;
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
    api.brokerageProvisioning.provisionBrokerageProfile
  );
  const provisionBuilderProfile = useMutation(
    api.brokerageProvisioning.provisionBuilderProfile
  );
  const provisionFairLendBrokerage = useMutation(
    api.brokerageProvisioning.provisionFairLendBrokerage
  );
  const linkBuilderAccount = useMutation(
    api.brokerageProvisioning.linkBuilderAccount
  );
  const unlinkBuilderAccount = useMutation(
    api.brokerageProvisioning.unlinkBuilderAccount
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
      throw error;
    }
  };

  return (
    <UserManagementSurface
      accepted={accepted}
      actionError={actionError}
      brokerageProvisioning={brokerageProvisioning}
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
      onLinkBuilderAccount={async (args) => {
        await runAction(async () => {
          const result = await linkBuilderAccount({
            builderProfileId: args.builderProfileId as Id<"builderProfiles">,
            role: args.role,
            workosUserId: args.workosUserId,
          });
          return `${result.operation}: builder link ${result.linkId}`;
        });
      }}
      onProvisionBrokerageProfile={async (args) => {
        await runAction(async () => {
          const result = await provisionBrokerageProfile(args);
          return `${result.operation}: brokerage profile ${result.brokerageId}`;
        });
      }}
      onProvisionBuilderProfile={async (args) => {
        await runAction(async () => {
          const result = await provisionBuilderProfile(args);
          const linkSuffix = result.linkId
            ? ` (owner link ${result.linkId})`
            : "";
          return `${result.operation}: builder profile ${result.builderProfileId}${linkSuffix}`;
        });
      }}
      onProvisionFairLendBrokerage={async () => {
        await runAction(async () => {
          const result = await provisionFairLendBrokerage({});
          return `${result.operation}: FairLendBrokerage ${result.brokerageId}`;
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
      onUnlinkBuilderAccount={async (linkId) => {
        await runAction(async () => {
          const result = await unlinkBuilderAccount({
            linkId: linkId as Id<"builderAccountLinks">,
          });
          return `${result.operation}: builder link`;
        });
      }}
      projections={projections}
      setAccepted={setAccepted}
      setActionError={setActionError}
      syncStatus={syncStatus}
    />
  );
}

const userManagementVisualFixture = {
  brokerageProvisioning: {
    fairLendBootstrap: {
      displayName: "FairLendBrokerage",
      principalBrokerEmail: "elie@fairlend.ca",
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
        builderAccountLinks: [],
        builderMemberships: [],
        builderProfile: null,
        hasBrokerageProfile: true,
        hasBuilderProfile: false,
        name: "FairLendBrokerage",
        needsBrokerageProfile: false,
        needsBuilderProfile: false,
        status: "active",
        workosOrganizationId: "org_01KSNW6JHW9P9YS41DZX1YHHGS",
      },
      {
        brokerage: null,
        brokerMemberships: [
          {
            email: "river.han@oaklinelending.com",
            name: "River Han",
            roleSlugs: ["broker"],
            workosMembershipId: "om_visual_broker",
            workosUserId: "user_visual_broker",
          },
        ],
        builderAccountLinks: [],
        builderMemberships: [
          {
            email: "alex.morgan@oaklinebuilds.com",
            name: "Alex Morgan",
            roleSlugs: ["builder"],
            workosMembershipId: "om_visual_builder",
            workosUserId: "user_visual_builder",
          },
        ],
        builderProfile: null,
        hasBrokerageProfile: false,
        hasBuilderProfile: false,
        name: "Oakline Lending",
        needsBrokerageProfile: true,
        needsBuilderProfile: false,
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
      {
        roleSlug: "builder",
        roleSlugs: ["builder"],
        status: "active",
        workosMembershipId: "om_visual_builder",
        workosOrganizationId: "org_visual_oakline",
        workosUserId: "user_visual_builder",
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
        email: "river.han@oaklinelending.com",
        name: "River Han",
        roleSlugs: ["broker"],
        roles: "broker",
        status: "active",
        workosUserId: "user_visual_broker",
      },
      {
        _creationTime: 0,
        _id: "user_visual_builder" as never,
        authId: "user_visual_builder",
        email: "alex.morgan@oaklinebuilds.com",
        name: "Alex Morgan",
        roleSlugs: ["builder"],
        roles: "builder",
        status: "active",
        workosUserId: "user_visual_builder",
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
