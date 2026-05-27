import { v } from "convex/values";
import { WorkOS } from "@workos-inc/node";

import { normalizeRoleSlug, userManagementWriteAction } from "./authz";

const acceptedReturn = v.object({
  adapter: v.union(v.literal("fake"), v.literal("workos")),
  operation: v.string(),
  status: v.literal("accepted"),
  sync: v.literal("waiting-for-webhook"),
  workosId: v.optional(v.string()),
});

type AcceptedResult = {
  adapter: "fake" | "workos";
  operation: string;
  status: "accepted";
  sync: "waiting-for-webhook";
  workosId?: string;
};

export const inviteUser = userManagementWriteAction
  .input({
    email: v.string(),
    organizationId: v.string(),
    roleSlug: v.string(),
  })
  .returns(acceptedReturn)
  .handler(async (_ctx, args) => {
    const adapter = getWorkosManagementAdapter();
    return adapter.inviteUser(args);
  })
  .public();

export const updateMembershipRole = userManagementWriteAction
  .input({
    membershipId: v.string(),
    roleSlug: v.string(),
  })
  .returns(acceptedReturn)
  .handler(async (_ctx, args) => {
    const adapter = getWorkosManagementAdapter();
    return adapter.updateMembershipRole(args);
  })
  .public();

export const deactivateMembership = userManagementWriteAction
  .input({
    membershipId: v.string(),
  })
  .returns(acceptedReturn)
  .handler(async (_ctx, args) => getWorkosManagementAdapter().deactivateMembership(args))
  .public();

export const reactivateMembership = userManagementWriteAction
  .input({
    membershipId: v.string(),
  })
  .returns(acceptedReturn)
  .handler(async (_ctx, args) => getWorkosManagementAdapter().reactivateMembership(args))
  .public();

function getWorkosManagementAdapter() {
  if (
    process.env.VITEST ||
    process.env.NODE_ENV === "test" ||
    process.env.WORKOS_MANAGEMENT_ADAPTER === "fake"
  ) {
    return fakeAdapter;
  }

  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) {
    throw new Error("WORKOS_API_KEY is required for WorkOS management writes");
  }

  return liveAdapter(new WorkOS(apiKey));
}

const fakeAdapter = {
  async inviteUser(args: {
    email: string;
    organizationId: string;
    roleSlug: string;
  }): Promise<AcceptedResult> {
    requireKnownRole(args.roleSlug);
    return {
      adapter: "fake",
      operation: "inviteUser",
      status: "accepted",
      sync: "waiting-for-webhook",
      workosId: `fake_invite_${args.email}`,
    };
  },
  async updateMembershipRole(args: {
    membershipId: string;
    roleSlug: string;
  }): Promise<AcceptedResult> {
    requireKnownRole(args.roleSlug);
    return accepted("fake", "updateMembershipRole", args.membershipId);
  },
  async deactivateMembership(args: { membershipId: string }): Promise<AcceptedResult> {
    return accepted("fake", "deactivateMembership", args.membershipId);
  },
  async reactivateMembership(args: { membershipId: string }): Promise<AcceptedResult> {
    return accepted("fake", "reactivateMembership", args.membershipId);
  },
};

function liveAdapter(workos: WorkOS) {
  return {
    async inviteUser(args: {
      email: string;
      organizationId: string;
      roleSlug: string;
    }): Promise<AcceptedResult> {
      requireKnownRole(args.roleSlug);
      const result = await workos.userManagement.sendInvitation({
        email: args.email,
        organizationId: args.organizationId,
        roleSlug: args.roleSlug,
      });
      return accepted("workos", "inviteUser", result.id);
    },
    async updateMembershipRole(args: {
      membershipId: string;
      roleSlug: string;
    }): Promise<AcceptedResult> {
      requireKnownRole(args.roleSlug);
      await workos.userManagement.updateOrganizationMembership(args.membershipId, {
        roleSlug: args.roleSlug,
      });
      return accepted("workos", "updateMembershipRole", args.membershipId);
    },
    async deactivateMembership(args: { membershipId: string }): Promise<AcceptedResult> {
      await workos.userManagement.deactivateOrganizationMembership(args.membershipId);
      return accepted("workos", "deactivateMembership", args.membershipId);
    },
    async reactivateMembership(args: { membershipId: string }): Promise<AcceptedResult> {
      await workos.userManagement.reactivateOrganizationMembership(args.membershipId);
      return accepted("workos", "reactivateMembership", args.membershipId);
    },
  };
}

function accepted(
  adapter: "fake" | "workos",
  operation: string,
  workosId: string
): AcceptedResult {
  return {
    adapter,
    operation,
    status: "accepted",
    sync: "waiting-for-webhook",
    workosId,
  };
}

function requireKnownRole(roleSlug: string) {
  if (!normalizeRoleSlug(roleSlug)) {
    throw new Error(`Unknown WorkOS role slug: ${roleSlug}`);
  }
}
