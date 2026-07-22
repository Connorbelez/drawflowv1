import { v } from "convex/values";

import {
  backofficeQuery,
  type RoleSlug,
  userManagementWriteMutation,
  userManagementWriteQuery,
} from "./authz";
import {
  assignBuilderBrokerAssignment,
  deactivateBuilderBrokerAssignments,
  ensureBuilderBrokerAssignment,
  getBuilderBrokerAssignmentHealth,
  hasAssignableBrokerRole,
  requireDefaultBrokerMember,
} from "./brokerAssignments";
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

interface BrokerProjection {
  email: string | null;
  name: string | null;
  profilePictureUrl: string | null;
  roleSlugs: string[];
  status: Doc<"users">["status"];
  workosUserId: string | null;
}

interface BrokerAssignmentProjection {
  activeAssignmentCount: number;
  assignedBrokerWorkosUserId: string | null;
  broker: BrokerProjection | null;
  healthy: boolean;
  reason: string;
  status: Doc<"builderBrokerAssignments">["status"] | null;
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
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The roster is intentionally aggregated in one server-side pass to avoid client joins and N+1 subscriptions.
  .handler(async (ctx) => {
    const organizationScope = ctx.viewer.roles.includes("admin")
      ? null
      : ctx.viewer.organizationId;
    if (!(ctx.viewer.roles.includes("admin") || organizationScope)) {
      throw new Error("Active organization context is required.");
    }
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
      organizationScope
        ? ctx.db
            .query("builderProfiles")
            .withIndex("by_organization", (q) =>
              q.eq("organizationId", organizationScope),
            )
            .collect()
        : ctx.db.query("builderProfiles").collect(),
      organizationScope
        ? ctx.db
            .query("brokerages")
            .withIndex("by_workos_organization", (q) =>
              q.eq("workosOrganizationId", organizationScope),
            )
            .collect()
        : ctx.db.query("brokerages").collect(),
      organizationScope
        ? ctx.db
            .query("workosOrganizations")
            .withIndex("by_workos_organization_id", (q) =>
              q.eq("workosOrganizationId", organizationScope),
            )
            .collect()
        : ctx.db.query("workosOrganizations").collect(),
      organizationScope
        ? ctx.db
            .query("workosOrganizationMemberships")
            .withIndex("by_organization", (q) =>
              q.eq("workosOrganizationId", organizationScope),
            )
            .collect()
        : ctx.db.query("workosOrganizationMemberships").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("builderAccountLinks").collect(),
      ctx.db.query("buildProposals").collect(),
      ctx.db.query("activeBuilds").collect(),
    ]);

    const brokeragesById = new Map(brokerages.map((row) => [row._id, row]));
    const orgsByWorkosId = new Map(
      organizations.map((row) => [row.workosOrganizationId, row]),
    );
    const usersByWorkosId = new Map(
      users
        .filter((row) => row.workosUserId)
        .map((row) => [row.workosUserId as string, row]),
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
        slugs,
      );
    }
    const membershipIdByOrgUser = new Map<string, string>();
    for (const membership of memberships) {
      if (membership.status !== "active") {
        continue;
      }
      membershipIdByOrgUser.set(
        membershipKey(membership.workosOrganizationId, membership.workosUserId),
        membership.workosMembershipId,
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

    const builders = await Promise.all(
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Each Builder row is intentionally projected in one server-side pass to avoid reactive client joins.
      profiles.map(async (profile) => {
        const brokerage = brokeragesById.get(profile.brokerageId);
        const organization = orgsByWorkosId.get(profile.organizationId);
        const profileLinks = linksByProfile.get(profile._id as string) ?? [];
        const assignmentHealth = brokerage
          ? await getBuilderBrokerAssignmentHealth(ctx, {
              brokerage,
              builderProfile: profile,
            })
          : null;

        const accounts: AccountRow[] = profileLinks
          .map((link) => {
            const user = usersByWorkosId.get(link.workosUserId);
            const key = membershipKey(
              profile.organizationId,
              link.workosUserId,
            );
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
              }) satisfies ProposalRow,
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
              }) satisfies BuildRow,
          )
          .sort((a, b) => b.updatedAt - a.updatedAt);

        const proposalCounts = countByStatus(profileProposals);
        const proposedCapitalCents = sumBudget(
          profileProposals.filter((p) => p.status !== "closed"),
        );
        const approvedCapitalCents = sumBudget(
          profileProposals.filter(
            (p) => p.status === "approved" || p.status === "closed",
          ),
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

        let brokerAssignment: BrokerAssignmentProjection | null = null;
        if (assignmentHealth) {
          let broker: BrokerProjection | null = null;
          if (assignmentHealth.broker) {
            broker = {
              email: assignmentHealth.broker.email ?? null,
              name: assignmentHealth.broker.name ?? null,
              profilePictureUrl:
                assignmentHealth.broker.profilePictureUrl ?? null,
              roleSlugs: assignmentHealth.membership
                ? membershipRoleSlugs(assignmentHealth.membership)
                : [],
              status: assignmentHealth.broker.status,
              workosUserId:
                assignmentHealth.broker.workosUserId ??
                assignmentHealth.assignment?.assignedBrokerWorkosUserId ??
                null,
            };
          }
          brokerAssignment = {
            activeAssignmentCount: assignmentHealth.activeAssignmentCount,
            assignedBrokerWorkosUserId:
              assignmentHealth.assignment?.assignedBrokerWorkosUserId ?? null,
            broker,
            healthy: assignmentHealth.healthy,
            reason: assignmentHealth.reason,
            status: assignmentHealth.assignment?.status ?? null,
          };
        }

        return {
          _id: profile._id as string,
          accountCount: accounts.length,
          accounts,
          activeBuildCapitalCents,
          approvedCapitalCents,
          brokerAssignment,
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
      }),
    );

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

const assignableBrokerValidator = v.object({
  email: v.union(v.string(), v.null()),
  isPrincipal: v.boolean(),
  name: v.union(v.string(), v.null()),
  profilePictureUrl: v.union(v.string(), v.null()),
  roleSlugs: v.array(v.string()),
  status: v.literal("active"),
  workosUserId: v.string(),
});

/** Active, same-tenant broker options that are safe assignment targets. */
export const listAssignableBrokers = userManagementWriteQuery
  .returns(
    v.object({
      brokerages: v.array(
        v.object({
          brokerageId: v.id("brokerages"),
          brokerageName: v.string(),
          brokers: v.array(assignableBrokerValidator),
          principalBrokerWorkosUserId: v.union(v.string(), v.null()),
          workosOrganizationId: v.string(),
        }),
      ),
    }),
  )
  .handler(async (ctx) => {
    const organizationScope = ctx.viewer.roles.includes("admin")
      ? null
      : ctx.viewer.organizationId;
    if (!(ctx.viewer.roles.includes("admin") || organizationScope)) {
      throw new Error("Active organization context is required.");
    }

    const [brokerages, memberships, users] = await Promise.all([
      organizationScope
        ? ctx.db
            .query("brokerages")
            .withIndex("by_workos_organization", (q) =>
              q.eq("workosOrganizationId", organizationScope),
            )
            .collect()
        : ctx.db.query("brokerages").collect(),
      organizationScope
        ? ctx.db
            .query("workosOrganizationMemberships")
            .withIndex("by_organization", (q) =>
              q.eq("workosOrganizationId", organizationScope),
            )
            .collect()
        : ctx.db.query("workosOrganizationMemberships").collect(),
      ctx.db.query("users").collect(),
    ]);
    const activeUsers = new Map(
      users
        .filter((user) => user.status === "active" && user.workosUserId)
        .map((user) => [user.workosUserId as string, user]),
    );

    return {
      brokerages: brokerages
        .filter((brokerage) => brokerage.status === "active")
        .map((brokerage) => {
          const brokersByUserId = new Map<
            string,
            {
              email: string | null;
              isPrincipal: boolean;
              name: string | null;
              profilePictureUrl: string | null;
              roleSlugs: string[];
              status: "active";
              workosUserId: string;
            }
          >();
          for (const membership of memberships) {
            if (
              membership.status !== "active" ||
              membership.workosOrganizationId !==
                brokerage.workosOrganizationId ||
              !hasAssignableBrokerRole(membership)
            ) {
              continue;
            }
            const user = activeUsers.get(membership.workosUserId);
            if (!user) {
              continue;
            }
            brokersByUserId.set(membership.workosUserId, {
              email: user.email ?? null,
              isPrincipal:
                membership.workosUserId ===
                brokerage.principalBrokerWorkosUserId,
              name: user.name ?? null,
              profilePictureUrl: user.profilePictureUrl ?? null,
              roleSlugs: membershipRoleSlugs(membership),
              status: "active",
              workosUserId: membership.workosUserId,
            });
          }
          const brokers = [...brokersByUserId.values()].sort(
            (a, b) =>
              Number(b.isPrincipal) - Number(a.isPrincipal) ||
              (a.name ?? a.email ?? a.workosUserId).localeCompare(
                b.name ?? b.email ?? b.workosUserId,
              ),
          );
          return {
            brokerageId: brokerage._id,
            brokerageName: brokerage.displayName,
            brokers,
            principalBrokerWorkosUserId:
              brokerage.principalBrokerWorkosUserId ?? null,
            workosOrganizationId: brokerage.workosOrganizationId,
          };
        })
        .sort((a, b) => a.brokerageName.localeCompare(b.brokerageName)),
    };
  })
  .public();

const assignmentOperationValidator = v.union(
  v.literal("assigned"),
  v.literal("reassigned"),
  v.literal("repaired"),
  v.literal("unchanged"),
);

/**
 * Governed, atomic assignment command for one or more Builders in one
 * brokerage. Any invalid target rolls the whole mutation back.
 */
export const assignBuildersToBroker = userManagementWriteMutation
  .input({
    assignedBrokerWorkosUserId: v.string(),
    builderProfileIds: v.array(v.id("builderProfiles")),
    reason: v.string(),
  })
  .returns(
    v.object({
      assigned: v.number(),
      processed: v.number(),
      reassigned: v.number(),
      repaired: v.number(),
      results: v.array(
        v.object({
          assignmentId: v.id("builderBrokerAssignments"),
          builderProfileId: v.id("builderProfiles"),
          operation: assignmentOperationValidator,
        }),
      ),
      unchanged: v.number(),
    }),
  )
  .handler(async (ctx, args) => {
    const reason = args.reason.trim();
    if (reason.length < 10) {
      throw new Error(
        "An assignment reason of at least 10 characters is required.",
      );
    }
    const profileIds = [
      ...new Map(
        args.builderProfileIds.map((profileId) => [
          profileId as string,
          profileId,
        ]),
      ).values(),
    ].sort((a, b) => String(a).localeCompare(String(b)));
    if (profileIds.length === 0) {
      throw new Error("Select at least one Builder.");
    }
    if (profileIds.length > 100) {
      throw new Error("Assign no more than 100 Builders at once.");
    }

    const loadedProfiles = await Promise.all(
      profileIds.map((profileId) => ctx.db.get(profileId)),
    );
    if (loadedProfiles.some((profile) => !profile)) {
      throw new Error("One or more Builder profiles were not found.");
    }
    const profiles = loadedProfiles as Doc<"builderProfiles">[];
    const firstProfile = profiles[0];
    if (
      profiles.some(
        (profile) =>
          profile.brokerageId !== firstProfile.brokerageId ||
          profile.organizationId !== firstProfile.organizationId,
      )
    ) {
      throw new Error("Batch assignment requires Builders from one brokerage.");
    }

    await requireBrokerageScope(ctx, firstProfile.organizationId);
    const brokerage = await ctx.db.get(firstProfile.brokerageId);
    if (!brokerage) {
      throw new Error("Builder brokerage not found.");
    }

    const now = Date.now();
    const results: {
      assignmentId: Doc<"builderBrokerAssignments">["_id"];
      builderProfileId: Doc<"builderProfiles">["_id"];
      operation: "assigned" | "reassigned" | "repaired" | "unchanged";
    }[] = [];
    for (const profile of profiles) {
      const result = await assignBuilderBrokerAssignment(ctx, {
        actorRoles: ctx.viewer.roles,
        actorWorkosUserId: ctx.viewer.subject,
        assignedBrokerWorkosUserId: args.assignedBrokerWorkosUserId,
        brokerage,
        builderProfile: profile,
        command: "builderRoster.assignBuildersToBroker",
        now,
        reason,
      });
      results.push({
        assignmentId: result.assignmentId,
        builderProfileId: profile._id,
        operation: result.operation,
      });
    }

    return {
      assigned: results.filter((result) => result.operation === "assigned")
        .length,
      processed: results.length,
      reassigned: results.filter((result) => result.operation === "reassigned")
        .length,
      repaired: results.filter((result) => result.operation === "repaired")
        .length,
      results,
      unchanged: results.filter((result) => result.operation === "unchanged")
        .length,
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
    }),
  )
  .handler(async (ctx, args) => {
    const profile = await ctx.db.get(args.builderProfileId);
    if (!profile) {
      throw new Error("Builder profile not found.");
    }
    await requireBrokerageScope(ctx, profile.organizationId);
    const brokerage = await ctx.db.get(profile.brokerageId);
    if (!brokerage) {
      throw new Error("Builder brokerage not found.");
    }

    const now = Date.now();
    if (profile.status !== args.status) {
      await ctx.db.patch(args.builderProfileId, {
        status: args.status,
        updatedAt: now,
      });
    }

    if (args.status === "inactive") {
      await deactivateBuilderBrokerAssignments(ctx, {
        actorRoles: ctx.viewer.roles,
        actorWorkosUserId: ctx.viewer.subject,
        brokerage,
        builderProfile: profile,
        command: "setBuilderProfileStatus",
        now,
        reason:
          "Deactivating broker assignments while archiving the builder profile.",
      });
    } else {
      const activeProfile = await ctx.db.get(args.builderProfileId);
      if (!activeProfile) {
        throw new Error(
          "The builder profile could not be loaded after reactivation.",
        );
      }
      const { workosUserId: assignedBrokerWorkosUserId } =
        await requireDefaultBrokerMember(ctx, brokerage);
      await ensureBuilderBrokerAssignment(ctx, {
        actorRoles: ctx.viewer.roles,
        actorWorkosUserId: ctx.viewer.subject,
        assignedBrokerWorkosUserId,
        brokerage,
        builderProfile: activeProfile,
        command: "setBuilderProfileStatus",
        now,
        reason:
          "Validating the principal broker assignment while activating the builder profile.",
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
    }),
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
        "A builder profile must use the builder's own company name, not the brokerage name.",
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
    const organizationScope = ctx.viewer.roles.includes("admin")
      ? null
      : ctx.viewer.organizationId;
    if (!(ctx.viewer.roles.includes("admin") || organizationScope)) {
      throw new Error("Active organization context is required.");
    }
    const [memberships, users, brokerages, links] = await Promise.all([
      organizationScope
        ? ctx.db
            .query("workosOrganizationMemberships")
            .withIndex("by_organization", (q) =>
              q.eq("workosOrganizationId", organizationScope),
            )
            .collect()
        : ctx.db.query("workosOrganizationMemberships").collect(),
      ctx.db.query("users").collect(),
      organizationScope
        ? ctx.db
            .query("brokerages")
            .withIndex("by_workos_organization", (q) =>
              q.eq("workosOrganizationId", organizationScope),
            )
            .collect()
        : ctx.db.query("brokerages").collect(),
      ctx.db.query("builderAccountLinks").collect(),
    ]);

    const usersByWorkosId = new Map(
      users
        .filter((row) => row.workosUserId)
        .map((row) => [row.workosUserId as string, row]),
    );
    const brokerageByOrg = new Map(
      brokerages.map((row) => [row.workosOrganizationId, row]),
    );
    const linkedUserIds = new Set(
      links
        .filter((link) => link.status === "active")
        .map((link) => link.workosUserId),
    );

    const candidates = memberships
      .filter((membership) => {
        if (membership.status !== "active") {
          return false;
        }
        const slugs = membershipRoleSlugs(membership);
        const isBuilder = slugs.some((slug) =>
          (BUILDER_ROLE_SLUGS as readonly string[]).includes(slug),
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
          b.name ?? b.email ?? b.workosUserId,
        ),
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
  >,
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
  proposals: ProposalRow[],
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
  workosOrganizationId: string,
) {
  if (ctx.viewer.roles.includes("admin")) {
    return;
  }
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", ctx.viewer.subject))
    .filter((q) => q.eq(q.field("workosOrganizationId"), workosOrganizationId))
    .first();
  if (membership?.status !== "active") {
    throw new Error("Forbidden: WorkOS membership");
  }
  const slugs = membershipRoleSlugs(membership);
  if (!slugs.some((slug) => slug === "principle-broker" || slug === "broker")) {
    throw new Error("Forbidden: brokerage scope");
  }
}
