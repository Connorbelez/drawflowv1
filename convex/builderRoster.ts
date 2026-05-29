import { v } from "convex/values";

import {
  backofficeQuery,
  type RoleSlug,
  userManagementWriteMutation,
} from "./authz";
import type { Doc, MutationCtx } from "./types";

/**
 * Lifecycle stage of a builder, derived from the presence and status of their
 * accounts, proposals, and active builds. Ordered earliest to latest so the
 * surface can sort and segment by progression.
 */
const BUILDER_STAGES = [
  "invited",
  "no_proposal",
  "drafting",
  "in_review",
  "approved",
  "building",
  "closed",
  "dormant",
] as const;

type BuilderStage = (typeof BUILDER_STAGES)[number];

type ProposalStatus = Doc<"buildProposals">["status"];

interface AccountRow {
  email: string | null;
  emailVerified: boolean;
  linkId: string;
  name: string | null;
  profilePictureUrl: string | null;
  role: "owner" | "staff";
  roleSlugs: string[];
  status: string | null;
  workosMembershipId: string | null;
  workosUserId: string;
}

interface ProposalRow {
  _id: string;
  activeBuildId: string | null;
  approvedAt: number | null;
  buildName: string;
  closedAt: number | null;
  location: string;
  reviewOutcome: Doc<"buildProposals">["reviewOutcome"];
  status: ProposalStatus;
  submittedAt: number | null;
  totalBudgetCents: number;
  updatedAt: number;
}

interface BuildRow {
  _id: string;
  buildName: string;
  location: string;
  proposalId: string;
  startDate: string;
  status: Doc<"activeBuilds">["status"];
  totalBudgetCents: number;
  updatedAt: number;
}

/**
 * Roster of every provisioned builder with the operational context a broker
 * needs to manage them: linked accounts, proposal pipeline, active builds,
 * capital rollups, derived lifecycle stage, and last activity.
 *
 * Aggregated server-side in a single pass so the surface renders without
 * client-side joins or N+1 reactivity.
 */
export const listBuilderRoster = backofficeQuery
  .returns(v.any())
  .handler(async (ctx) => {
    const [
      profiles,
      brokerages,
      organizations,
      memberships,
      users,
      links,
      proposals,
      builds,
    ] = await Promise.all([
      ctx.db.query("builderProfiles").collect(),
      ctx.db.query("brokerages").collect(),
      ctx.db.query("workosOrganizations").collect(),
      ctx.db.query("workosOrganizationMemberships").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("builderAccountLinks").collect(),
      ctx.db.query("buildProposals").collect(),
      ctx.db.query("activeBuilds").collect(),
    ]);

    const brokeragesById = new Map(brokerages.map((row) => [row._id, row]));
    const orgsByWorkosId = new Map(
      organizations.map((row) => [row.workosOrganizationId, row])
    );
    const usersByWorkosId = new Map(
      users
        .filter((row) => row.workosUserId)
        .map((row) => [row.workosUserId as string, row])
    );

    // Active membership role slugs per (org, user) so account rows can show the
    // builder's WorkOS roles within their own organization.
    const rolesByOrgUser = new Map<string, string[]>();
    for (const membership of memberships) {
      if (membership.status !== "active") {
        continue;
      }
      const slugs = membershipRoleSlugs(membership);
      if (slugs.length === 0) {
        continue;
      }
      rolesByOrgUser.set(
        membershipKey(membership.workosOrganizationId, membership.workosUserId),
        slugs
      );
    }
    const membershipIdByOrgUser = new Map<string, string>();
    for (const membership of memberships) {
      if (membership.status !== "active") {
        continue;
      }
      membershipIdByOrgUser.set(
        membershipKey(membership.workosOrganizationId, membership.workosUserId),
        membership.workosMembershipId
      );
    }

    const linksByProfile = new Map<string, Doc<"builderAccountLinks">[]>();
    for (const link of links) {
      if (link.status !== "active") {
        continue;
      }
      const key = link.builderProfileId as string;
      const list = linksByProfile.get(key) ?? [];
      list.push(link);
      linksByProfile.set(key, list);
    }

    const proposalsByProfile = new Map<string, Doc<"buildProposals">[]>();
    for (const proposal of proposals) {
      const key = proposal.builderProfileId as string;
      const list = proposalsByProfile.get(key) ?? [];
      list.push(proposal);
      proposalsByProfile.set(key, list);
    }

    const buildsByProfile = new Map<string, Doc<"activeBuilds">[]>();
    for (const build of builds) {
      const key = build.builderProfileId as string;
      const list = buildsByProfile.get(key) ?? [];
      list.push(build);
      buildsByProfile.set(key, list);
    }

    const builders = profiles.map((profile) => {
      const brokerage = brokeragesById.get(profile.brokerageId);
      const organization = orgsByWorkosId.get(profile.organizationId);
      const profileLinks = linksByProfile.get(profile._id as string) ?? [];

      const accounts: AccountRow[] = profileLinks
        .map((link) => {
          const user = usersByWorkosId.get(link.workosUserId);
          const key = membershipKey(profile.organizationId, link.workosUserId);
          return {
            email: user?.email ?? null,
            emailVerified: user?.emailVerified ?? false,
            linkId: link._id as string,
            name: user?.name ?? null,
            profilePictureUrl: user?.profilePictureUrl ?? null,
            role: link.role,
            roleSlugs: rolesByOrgUser.get(key) ?? [],
            status: user?.status ?? null,
            workosMembershipId: membershipIdByOrgUser.get(key) ?? null,
            workosUserId: link.workosUserId,
          } satisfies AccountRow;
        })
        .sort((a, b) => roleRank(a.role) - roleRank(b.role));

      const profileProposals = (
        proposalsByProfile.get(profile._id as string) ?? []
      )
        .map(
          (proposal) =>
            ({
              _id: proposal._id as string,
              activeBuildId: (proposal.activeBuildId as string) ?? null,
              approvedAt: proposal.approvedAt ?? null,
              buildName: proposal.buildName,
              closedAt: proposal.closedAt ?? null,
              location: proposal.location,
              reviewOutcome: proposal.reviewOutcome,
              status: proposal.status,
              submittedAt: proposal.submittedAt ?? null,
              totalBudgetCents: proposal.totalBudgetCents,
              updatedAt: proposal.updatedAt,
            }) satisfies ProposalRow
        )
        .sort((a, b) => b.updatedAt - a.updatedAt);

      const profileBuilds = (buildsByProfile.get(profile._id as string) ?? [])
        .map(
          (build) =>
            ({
              _id: build._id as string,
              buildName: build.buildName,
              location: build.location,
              proposalId: build.proposalId as string,
              startDate: build.startDate,
              status: build.status,
              totalBudgetCents: build.totalBudgetCents,
              updatedAt: build.updatedAt,
            }) satisfies BuildRow
        )
        .sort((a, b) => b.updatedAt - a.updatedAt);

      const proposalCounts = countByStatus(profileProposals);
      const proposedCapitalCents = sumBudget(
        profileProposals.filter((p) => p.status !== "closed")
      );
      const approvedCapitalCents = sumBudget(
        profileProposals.filter(
          (p) => p.status === "approved" || p.status === "closed"
        )
      );
      const activeBuildCapitalCents = sumBudget(profileBuilds);

      const lastActivityAt = maxTimestamp([
        profile.updatedAt,
        ...profileProposals.map((p) => p.updatedAt),
        ...profileBuilds.map((b) => b.updatedAt),
      ]);

      const stage = deriveStage({
        accountCount: accounts.length,
        builds: profileBuilds,
        profileStatus: profile.status,
        proposals: profileProposals,
      });

      return {
        _id: profile._id as string,
        accountCount: accounts.length,
        accounts,
        activeBuildCapitalCents,
        approvedCapitalCents,
        brokerage: brokerage
          ? {
              _id: brokerage._id as string,
              displayName: brokerage.displayName,
              status: brokerage.status,
            }
          : null,
        builds: profileBuilds,
        createdAt: profile.createdAt,
        displayName: profile.displayName,
        lastActivityAt,
        legalName: profile.legalName ?? null,
        organizationName: organization?.name ?? profile.displayName,
        organizationStatus: organization?.status ?? null,
        ownerAccount: accounts.find((a) => a.role === "owner") ?? null,
        proposalCount: profileProposals.length,
        proposalCounts,
        proposals: profileProposals,
        proposedCapitalCents,
        stage,
        status: profile.status,
        updatedAt: profile.updatedAt,
        workosOrganizationId: profile.organizationId,
      };
    });

    builders.sort((a, b) => b.lastActivityAt - a.lastActivityAt);

    return {
      brokerages: brokerages.map((row) => ({
        _id: row._id as string,
        displayName: row.displayName,
        status: row.status,
      })),
      builders,
      stages: BUILDER_STAGES,
    };
  })
  .public();

/**
 * Activate or deactivate a builder profile. Deactivation is the soft-archive
 * path for builders no longer operating; it never deletes pipeline history.
 */
export const setBuilderProfileStatus = userManagementWriteMutation
  .input({
    builderProfileId: v.id("builderProfiles"),
    status: v.union(v.literal("active"), v.literal("inactive")),
  })
  .returns(
    v.object({
      builderProfileId: v.id("builderProfiles"),
      status: v.union(v.literal("active"), v.literal("inactive")),
    })
  )
  .handler(async (ctx, args) => {
    const profile = await ctx.db.get(args.builderProfileId);
    if (!profile) {
      throw new Error("Builder profile not found.");
    }
    await requireBrokerageScope(ctx, profile.organizationId);
    if (profile.status !== args.status) {
      await ctx.db.patch(args.builderProfileId, {
        status: args.status,
        updatedAt: Date.now(),
      });
    }
    return { builderProfileId: args.builderProfileId, status: args.status };
  })
  .public();

/**
 * Rename a builder profile's display name. Brokers use this to correct a
 * builder's company name (e.g. a profile that inherited the brokerage name at
 * provisioning time). The name must not mirror the owning brokerage.
 */
export const renameBuilderProfile = userManagementWriteMutation
  .input({
    builderProfileId: v.id("builderProfiles"),
    displayName: v.string(),
  })
  .returns(
    v.object({
      builderProfileId: v.id("builderProfiles"),
      displayName: v.string(),
    })
  )
  .handler(async (ctx, args) => {
    const profile = await ctx.db.get(args.builderProfileId);
    if (!profile) {
      throw new Error("Builder profile not found.");
    }
    await requireBrokerageScope(ctx, profile.organizationId);
    const displayName = args.displayName.trim();
    if (!displayName) {
      throw new Error("A builder company name is required.");
    }
    const brokerage = await ctx.db.get(profile.brokerageId);
    if (
      brokerage &&
      brokerage.workosOrganizationId === profile.organizationId &&
      displayName.toLowerCase() === brokerage.displayName.toLowerCase()
    ) {
      throw new Error(
        "A builder profile must use the builder's own company name, not the brokerage name."
      );
    }
    await ctx.db.patch(args.builderProfileId, {
      displayName,
      updatedAt: Date.now(),
    });
    return { builderProfileId: args.builderProfileId, displayName };
  })
  .public();

const BUILDER_ROLE_SLUGS = ["builder", "builder-staff"] as const;

/**
 * WorkOS users who carry a builder role but are not yet linked to any active
 * builder profile. These are builders the platform knows about (via their
 * membership) but who have no borrower profile to underwrite against, so a
 * broker can provision one for them directly from the builders console.
 *
 * Scoped to organizations that already have a brokerage, since a builder
 * profile must attach to a lender.
 */
export const listUnprovisionedBuilders = backofficeQuery
  .returns(v.any())
  .handler(async (ctx) => {
    const [memberships, users, brokerages, links] = await Promise.all([
      ctx.db.query("workosOrganizationMemberships").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("brokerages").collect(),
      ctx.db.query("builderAccountLinks").collect(),
    ]);

    const usersByWorkosId = new Map(
      users
        .filter((row) => row.workosUserId)
        .map((row) => [row.workosUserId as string, row])
    );
    const brokerageByOrg = new Map(
      brokerages.map((row) => [row.workosOrganizationId, row])
    );
    const linkedUserIds = new Set(
      links
        .filter((link) => link.status === "active")
        .map((link) => link.workosUserId)
    );

    const candidates = memberships
      .filter((membership) => {
        if (membership.status !== "active") {
          return false;
        }
        const slugs = membershipRoleSlugs(membership);
        const isBuilder = slugs.some((slug) =>
          (BUILDER_ROLE_SLUGS as readonly string[]).includes(slug)
        );
        if (!isBuilder) {
          return false;
        }
        if (linkedUserIds.has(membership.workosUserId)) {
          return false;
        }
        return brokerageByOrg.has(membership.workosOrganizationId);
      })
      .map((membership) => {
        const user = usersByWorkosId.get(membership.workosUserId);
        const brokerage = brokerageByOrg.get(membership.workosOrganizationId);
        return {
          brokerageDisplayName: brokerage?.displayName ?? null,
          email: user?.email ?? null,
          name: user?.name ?? null,
          profilePictureUrl: user?.profilePictureUrl ?? null,
          roleSlugs: membershipRoleSlugs(membership),
          workosMembershipId: membership.workosMembershipId,
          workosOrganizationId: membership.workosOrganizationId,
          workosUserId: membership.workosUserId,
        };
      })
      .sort((a, b) =>
        (a.name ?? a.email ?? a.workosUserId).localeCompare(
          b.name ?? b.email ?? b.workosUserId
        )
      );

    return { candidates };
  })
  .public();

function membershipKey(organizationId: string, userId: string): string {
  return `${organizationId}::${userId}`;
}

function membershipRoleSlugs(
  membership: Pick<
    Doc<"workosOrganizationMemberships">,
    "roleSlug" | "roleSlugs"
  >
): string[] {
  if (membership.roleSlugs.length > 0) {
    return membership.roleSlugs;
  }
  return membership.roleSlug ? [membership.roleSlug] : [];
}

function roleRank(role: "owner" | "staff"): number {
  return role === "owner" ? 0 : 1;
}

function countByStatus(
  proposals: ProposalRow[]
): Record<ProposalStatus, number> {
  const counts: Record<ProposalStatus, number> = {
    approved: 0,
    closed: 0,
    draft: 0,
    submitted: 0,
  };
  for (const proposal of proposals) {
    counts[proposal.status] += 1;
  }
  return counts;
}

function sumBudget(rows: { totalBudgetCents: number }[]): number {
  let total = 0;
  for (const row of rows) {
    total += row.totalBudgetCents;
  }
  return total;
}

function maxTimestamp(values: number[]): number {
  let max = 0;
  for (const value of values) {
    if (value > max) {
      max = value;
    }
  }
  return max;
}

function deriveStage(input: {
  accountCount: number;
  builds: BuildRow[];
  profileStatus: Doc<"builderProfiles">["status"];
  proposals: ProposalRow[];
}): BuilderStage {
  const { accountCount, builds, profileStatus, proposals } = input;

  if (profileStatus === "inactive") {
    return "dormant";
  }
  if (builds.some((build) => build.status === "active")) {
    return "building";
  }
  if (proposals.some((proposal) => proposal.status === "approved")) {
    return "approved";
  }
  if (proposals.some((proposal) => proposal.status === "submitted")) {
    return "in_review";
  }
  if (proposals.some((proposal) => proposal.status === "draft")) {
    return "drafting";
  }
  if (proposals.length > 0) {
    // Only closed proposals remain and no active build: the engagement wound
    // down rather than progressing.
    return "closed";
  }
  if (accountCount === 0) {
    return "invited";
  }
  return "no_proposal";
}

export const __test = {
  deriveStage,
};

async function requireBrokerageScope(
  ctx: MutationCtx & { viewer: { roles: RoleSlug[]; subject: string } },
  workosOrganizationId: string
) {
  if (ctx.viewer.roles.includes("admin")) {
    return;
  }
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", ctx.viewer.subject))
    .filter((q) => q.eq(q.field("workosOrganizationId"), workosOrganizationId))
    .first();
  if (!membership || membership.status !== "active") {
    throw new Error("Forbidden: WorkOS membership");
  }
  const slugs = membershipRoleSlugs(membership);
  if (!slugs.some((slug) => slug === "principle-broker" || slug === "broker")) {
    throw new Error("Forbidden: brokerage scope");
  }
}
