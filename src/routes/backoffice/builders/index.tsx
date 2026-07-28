import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useCallback } from "react";
import { toast } from "sonner";

import { requireUserManagementWriteAccess } from "#/lib/auth/rbac.ts";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { BuilderRosterSurface } from "./-builder-roster-surface";
import type {
  AssignableBrokersResult,
  BuilderRosterResult,
  UnprovisionedBuildersResult,
} from "./-builder-roster-types";

export const Route = createFileRoute("/backoffice/builders/")({
  beforeLoad: ({ context, location }) =>
    requireUserManagementWriteAccess({
      isAuthenticated: Boolean(context.userId),
      organizationId: context.organizationId,
      pathname: location.pathname,
      roles: [context.role, ...(context.roles ?? [])],
      workspace: "backoffice",
    }),
  component: BuildersRoute,
});

function BuildersRoute() {
  const navigate = useNavigate();
  const roster = useQuery(api.builderRoster.listBuilderRoster, {}) as
    | BuilderRosterResult
    | undefined;
  const assignableBrokers = useQuery(
    api.builderRoster.listAssignableBrokers,
    {}
  ) as AssignableBrokersResult | undefined;
  const linkBuilderAccount = useMutation(
    api.brokerageProvisioning.linkBuilderAccount
  );
  const unlinkBuilderAccount = useMutation(
    api.brokerageProvisioning.unlinkBuilderAccount
  );
  const setBuilderProfileStatus = useMutation(
    api.builderRoster.setBuilderProfileStatus
  );
  const assignBuildersToBroker = useMutation(
    api.builderRoster.assignBuildersToBroker
  );
  const provisionBuilderProfile = useMutation(
    api.brokerageProvisioning.provisionBuilderProfile
  );
  const unprovisioned = useQuery(
    api.builderRoster.listUnprovisionedBuilders,
    {}
  ) as UnprovisionedBuildersResult | undefined;

  const onLinkAccount = useCallback(
    async (input: {
      builderProfileId: string;
      role: "owner" | "staff";
      workosUserId: string;
    }) => {
      try {
        const result = await linkBuilderAccount({
          builderProfileId: input.builderProfileId as Id<"builderProfiles">,
          role: input.role,
          workosUserId: input.workosUserId,
        });
        toast.success(
          result.operation === "created"
            ? "Account linked"
            : `Role set to ${input.role}`
        );
      } catch (error) {
        toast.error(actionErrorMessage(error));
      }
    },
    [linkBuilderAccount]
  );

  const onUnlinkAccount = useCallback(
    async (linkId: string) => {
      try {
        await unlinkBuilderAccount({
          linkId: linkId as Id<"builderAccountLinks">,
        });
        toast.success("Account unlinked");
      } catch (error) {
        toast.error(actionErrorMessage(error));
      }
    },
    [unlinkBuilderAccount]
  );

  const onSetProfileStatus = useCallback(
    async (input: {
      builderProfileId: string;
      status: "active" | "inactive";
    }) => {
      try {
        await setBuilderProfileStatus({
          builderProfileId: input.builderProfileId as Id<"builderProfiles">,
          status: input.status,
        });
        toast.success(
          input.status === "active"
            ? "Builder reactivated"
            : "Builder deactivated"
        );
      } catch (error) {
        toast.error(actionErrorMessage(error));
      }
    },
    [setBuilderProfileStatus]
  );

  const onAssignBroker = useCallback(
    async (input: {
      assignedBrokerWorkosUserId: string;
      builderProfileIds: string[];
      reason: string;
    }) => {
      try {
        const result = await assignBuildersToBroker({
          assignedBrokerWorkosUserId: input.assignedBrokerWorkosUserId,
          builderProfileIds: input.builderProfileIds as Id<"builderProfiles">[],
          reason: input.reason,
        });
        const changed = result.assigned + result.reassigned + result.repaired;
        toast.success(
          changed === 0
            ? "Broker assignment already current"
            : `${changed} Builder${changed === 1 ? "" : "s"} assigned`
        );
        return result;
      } catch (error) {
        toast.error(actionErrorMessage(error));
        throw error;
      }
    },
    [assignBuildersToBroker]
  );

  const onInviteBuilder = useCallback(() => {
    navigate({ to: "/backoffice/user-management" });
  }, [navigate]);

  const onProvisionBuilder = useCallback(
    async (input: {
      assignedBrokerWorkosUserId: string;
      displayName: string;
      ownerWorkosUserId: string;
      workosOrganizationId: string;
    }) => {
      try {
        await provisionBuilderProfile({
          ...input,
          assignedBrokerWorkosUserId: input.assignedBrokerWorkosUserId,
        });
        toast.success(`Builder profile created for ${input.displayName}`);
      } catch (error) {
        toast.error(actionErrorMessage(error));
      }
    },
    [provisionBuilderProfile]
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <BuilderRosterSurface
        assignableBrokerages={assignableBrokers?.brokerages ?? []}
        brokerages={roster?.brokerages ?? []}
        brokerOptionsPending={assignableBrokers === undefined}
        builders={roster?.builders}
        onAssignBroker={onAssignBroker}
        onInviteBuilder={onInviteBuilder}
        onLinkAccount={onLinkAccount}
        onProvisionBuilder={onProvisionBuilder}
        onSetProfileStatus={onSetProfileStatus}
        onUnlinkAccount={onUnlinkAccount}
        pending={roster === undefined}
        unprovisionedBuilders={unprovisioned?.candidates}
      />
    </div>
  );
}

const CONVEX_ERROR_PREFIX_RE = /^\[.*?\]\s*/;

function actionErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(CONVEX_ERROR_PREFIX_RE, "");
  }
  return "Something went wrong. Try again.";
}
