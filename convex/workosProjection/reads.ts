import { v } from "convex/values";

import type { Doc, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  type AuthorizedViewer,
  authenticatedQuery,
  backofficeQuery,
  lenderOrganizationQuery,
  lenderUserManagementQuery,
} from "../authz";
import { syncBuildCollaborationSearchAuthority } from "../build_collaboration_search_authority_projection";
import { fluent } from "../fluent";

interface WorkosEvent {
  created_at?: string;
  createdAt?: string;
  // biome-ignore lint/suspicious/noExplicitAny: WorkOS webhook payloads are untyped external records.
  data: Record<string, any>;
  event: string;
  id?: string;
}

type NormalizedWorkosEvent = WorkosEvent & { id: string };
type InsertDoc<TableName extends TableNames> = Omit<
  Doc<TableName>,
  "_creationTime" | "_id"
>;
interface CurrentUserOrganization {
  membershipId: string;
  organizationName: string;
  roleNames: string[];
  roleSlug?: string;
  roleSlugs: string[];
  workosOrganizationId: string;
}
interface CurrentUserOrganizationAccumulator {
  membershipIds: string[];
  organizationName: string;
  roleSlugs: Set<string>;
  sourcePriority: number;
  updatedAt: number;
  workosOrganizationId: string;
}
type CurrentUserOrganizationCandidate = CurrentUserOrganization & {
  sourcePriority: number;
  updatedAt: number;
};

const LENDER_ORGANIZATION_MEMBER_PAGE_SIZE = 100;
const MAX_LENDER_ORGANIZATION_HISTORY = 200;
const LENDER_MEMBERSHIP_EFFECTS_PROJECTION_VERSION =
  "lender-membership-effects-v1" as const;

export const LENDER_MEMBERSHIP_CONSUMER_HANDOFFS = [
  {
    consumer: "authorization-and-access",
    inputContract:
      "active organization id + canonical WorkOS membership status + canonical lender role slugs",
    owner: "Phase 1",
    state: "implemented",
  },
  {
    consumer: "collaboration-search-authority",
    inputContract:
      "canonical WorkOS membership id + organization id + user id + status + role slugs",
    owner: "Phase 1",
    state: "implemented",
  },
  {
    consumer: "proposal-assignment",
    inputContract:
      "active organization id + current canonical membership eligibility + persisted proposal assignment",
    owner: "Phase 2",
    state: "unavailable",
  },
  {
    consumer: "review-quorum-and-policy-eligibility",
    inputContract:
      "immutable review-policy snapshot + current canonical membership eligibility + persisted review assignment",
    owner: "Phase 4",
    state: "unavailable",
  },
  {
    consumer: "participant-queues-and-counts",
    inputContract:
      "canonical request or review-cycle state + current canonical membership eligibility",
    owner: "Phase 7",
    state: "unavailable",
  },
  {
    consumer: "transactional-recipients-and-notification-intent",
    inputContract:
      "durable domain event + resource and cycle scope + current canonical membership eligibility and access",
    owner: "Phase 8",
    state: "unavailable",
  },
  {
    consumer: "external-api-analytics-reporting-and-support",
    inputContract:
      "versioned external contract + canonical organization and membership identifiers",
    owner: "Phase 9",
    state: "unknown",
  },
] as const;

const userRow = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  authId: v.string(),
  email: v.string(),
  normalizedEmail: v.optional(v.string()),
  name: v.string(),
  status: v.optional(v.string()),
  workosUserId: v.optional(v.string()),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  emailVerified: v.optional(v.boolean()),
  profilePictureUrl: v.optional(v.string()),
  createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),
  roles: v.string(),
  roleSlugs: v.array(v.string()),
  sourceEventId: v.optional(v.string()),
  sourceEventType: v.optional(v.string()),
});

const currentUserOrganizationRow = v.object({
  membershipId: v.string(),
  organizationName: v.string(),
  roleNames: v.array(v.string()),
  roleSlug: v.optional(v.string()),
  roleSlugs: v.array(v.string()),
  workosOrganizationId: v.string(),
});

const activeLenderOrganizationRow = v.object({
  brokerageId: v.id("brokerages"),
  brokerageName: v.string(),
  lenderOrganizationId: v.id("lenderOrganizations"),
  membershipIds: v.array(v.string()),
  organizationName: v.string(),
  permissions: v.object({
    proposalReview: v.boolean(),
    milestoneDecisions: v.boolean(),
    drawDecisions: v.boolean(),
    siteVisitReview: v.boolean(),
  }),
  roles: v.array(
    v.union(
      v.literal("admin"),
      v.literal("lender"),
      v.literal("lender-admin"),
      v.literal("lender-staff")
    )
  ),
  userId: v.id("users"),
  workosOrganizationId: v.string(),
  workosUserId: v.string(),
});

const lenderOrganizationMembershipRow = v.object({
  _creationTime: v.number(),
  _id: v.id("workosOrganizationMemberships"),
  roleSlug: v.optional(v.string()),
  roleSlugs: v.array(v.string()),
  status: v.union(
    v.literal("active"),
    v.literal("inactive"),
    v.literal("pending"),
    v.literal("deleted")
  ),
  workosMembershipId: v.string(),
  workosOrganizationId: v.string(),
  workosUserId: v.string(),
});

const lenderOrganizationUserRow = v.object({
  _creationTime: v.number(),
  _id: v.id("users"),
  authId: v.string(),
  email: v.string(),
  name: v.string(),
  status: v.optional(v.union(v.literal("active"), v.literal("deleted"))),
  workosUserId: v.optional(v.string()),
});

const lenderOrganizationAuditRow = v.object({
  _creationTime: v.number(),
  _id: v.id("auditEvents"),
  actorRoles: v.array(v.string()),
  actorWorkosUserId: v.string(),
  command: v.string(),
  createdAt: v.number(),
  entityId: v.string(),
  entityType: v.string(),
  eventType: v.string(),
  newState: v.optional(v.string()),
  priorState: v.optional(v.string()),
  reason: v.optional(v.string()),
  warnings: v.array(v.string()),
});


export const listUserManagement = backofficeQuery
  .returns(
    v.object({
      memberships: v.array(v.any()),
      organizationRoles: v.array(v.any()),
      organizations: v.array(v.any()),
      permissions: v.array(v.any()),
      roles: v.array(v.any()),
      users: v.array(userRow),
    })
  )
  .handler(async (ctx) => {
    const organizationScope = resolveUserManagementOrganizationScope(
      ctx.viewer
    );
    const allMemberships = await ctx.db
      .query("workosOrganizationMemberships")
      .collect();
    const memberships = allMemberships.filter(
      (membership) =>
        organizationScope === null ||
        membership.workosOrganizationId === organizationScope
    );
    const visibleOrganizationIds = new Set(
      memberships.map((membership) => membership.workosOrganizationId)
    );
    const visibleUserIds = new Set(
      memberships.map((membership) => membership.workosUserId)
    );
    const rolesByUserId = new Map<string, Set<string>>();

    for (const membership of memberships) {
      if (membership.status !== "active") {
        continue;
      }

      const roleSlugs =
        membership.roleSlugs.length > 0
          ? membership.roleSlugs
          : membership.roleSlug
            ? [membership.roleSlug]
            : [];
      if (roleSlugs.length === 0) {
        continue;
      }

      const userRoles =
        rolesByUserId.get(membership.workosUserId) ?? new Set<string>();
      for (const roleSlug of roleSlugs) {
        userRoles.add(roleSlug);
      }
      rolesByUserId.set(membership.workosUserId, userRoles);
    }

    const users = (await ctx.db.query("users").collect())
      .filter(
        (user) =>
          organizationScope === null ||
          visibleUserIds.has(user.workosUserId ?? "")
      )
      .map((user) => {
        const roleSlugs = [
          ...(rolesByUserId.get(user.workosUserId ?? "") ?? []),
        ].sort();
        return {
          ...user,
          roles: roleSlugs.join(", "),
          roleSlugs,
        };
      });

    return {
      memberships,
      organizationRoles: (
        await ctx.db.query("workosOrganizationRoles").collect()
      ).filter(
        (role) =>
          organizationScope === null ||
          visibleOrganizationIds.has(role.workosOrganizationId)
      ),
      organizations: (
        await ctx.db.query("workosOrganizations").collect()
      ).filter(
        (organization) =>
          organizationScope === null ||
          organization.workosOrganizationId === organizationScope
      ),
      permissions: await ctx.db.query("workosPermissions").collect(),
      roles: await ctx.db.query("workosRoles").collect(),
      users,
    };
  })
  .public();

export const listCurrentUserOrganizations = authenticatedQuery
  .returns(
    v.object({
      organizations: v.array(currentUserOrganizationRow),
    })
  )
  .handler(async (ctx) => {
    const memberships = await ctx.db
      .query("workosOrganizationMemberships")
      .withIndex("by_user", (q) => q.eq("workosUserId", ctx.viewer.subject))
      .collect();
    const organizationsByWorkosId = new Map<
      string,
      CurrentUserOrganizationAccumulator
    >();

    for (const membership of memberships) {
      if (membership.status !== "active") {
        continue;
      }

      const organization = await ctx.db
        .query("workosOrganizations")
        .withIndex("by_workos_organization_id", (q) =>
          q.eq("workosOrganizationId", membership.workosOrganizationId)
        )
        .unique();
      if (organization?.status === "deleted") {
        continue;
      }

      const workosOrganizationId = membership.workosOrganizationId;
      const accumulator =
        organizationsByWorkosId.get(workosOrganizationId) ??
        ({
          membershipIds: [],
          roleSlugs: new Set<string>(),
          sourcePriority: organizationSourcePriority(organization),
          updatedAt: projectionUpdatedAt(organization),
          workosOrganizationId,
          organizationName:
            organization?.name?.trim() || membership.workosOrganizationId,
        } satisfies CurrentUserOrganizationAccumulator);

      accumulator.membershipIds.push(membership.workosMembershipId);
      for (const roleSlug of membershipRoleSlugs(membership)) {
        accumulator.roleSlugs.add(roleSlug);
      }
      accumulator.organizationName =
        organization?.name?.trim() ||
        accumulator.organizationName ||
        membership.workosOrganizationId;
      accumulator.sourcePriority = Math.max(
        accumulator.sourcePriority,
        organizationSourcePriority(organization)
      );
      accumulator.updatedAt = Math.max(
        accumulator.updatedAt,
        projectionUpdatedAt(organization)
      );
      organizationsByWorkosId.set(workosOrganizationId, accumulator);
    }

    const organizationCandidates: CurrentUserOrganizationCandidate[] =
      await Promise.all(
        [...organizationsByWorkosId.values()].map(async (organization) => {
          const roleSlugs = [...organization.roleSlugs];
          const roleNames = await Promise.all(
            roleSlugs.map(async (slug) => {
              const organizationRole = await ctx.db
                .query("workosOrganizationRoles")
                .withIndex("by_organization_slug", (q) =>
                  q
                    .eq(
                      "workosOrganizationId",
                      organization.workosOrganizationId
                    )
                    .eq("slug", slug)
                )
                .unique();
              return organizationRole?.status === "active"
                ? organizationRole.name
                : formatRoleSlug(slug);
            })
          );

          return {
            membershipId:
              organization.membershipIds.sort()[0] ??
              organization.workosOrganizationId,
            organizationName: organization.organizationName,
            roleNames,
            roleSlug: roleSlugs[0],
            roleSlugs,
            sourcePriority: organization.sourcePriority,
            updatedAt: organization.updatedAt,
            workosOrganizationId: organization.workosOrganizationId,
          };
        })
      );
    const organizations = uniqueCurrentUserOrganizationSwitchTargets(
      organizationCandidates
    );

    organizations.sort((left, right) => {
      const nameComparison = left.organizationName.localeCompare(
        right.organizationName
      );
      if (nameComparison !== 0) {
        return nameComparison;
      }
      return left.workosOrganizationId.localeCompare(
        right.workosOrganizationId
      );
    });

    return { organizations };
  })
  .public();

export const getActiveLenderOrganizationContext = lenderOrganizationQuery
  .returns(activeLenderOrganizationRow)
  .handler(async (ctx) => ctx.activeOrganization)
  .public();

/**
 * Canonical post-reconciliation membership-effect boundary for lender
 * organization management. This query is deliberately write-free: every
 * value is rebuilt from the current WorkOS projections and canonical audit
 * history, so retries cannot fabricate later-phase workflow state or duplicate
 * downstream effects.
 */
export const getLenderOrganizationManagement = lenderUserManagementQuery
  .input({
    cursor: v.optional(v.union(v.string(), v.null())),
  })
  .returns(
    v.object({
      continueCursor: v.string(),
      history: v.array(lenderOrganizationAuditRow),
      isDone: v.boolean(),
      members: v.array(
        v.object({
          accessState: v.union(
            v.literal("active"),
            v.literal("pending"),
            v.literal("removed"),
            v.literal("unsupported")
          ),
          canManageMembers: v.boolean(),
          email: v.optional(v.string()),
          membership: lenderOrganizationMembershipRow,
          name: v.optional(v.string()),
          roleSlugs: v.array(v.string()),
          user: v.union(v.null(), lenderOrganizationUserRow),
        })
      ),
      organization: v.object({
        _creationTime: v.number(),
        _id: v.id("workosOrganizations"),
        brokerageId: v.id("brokerages"),
        name: v.string(),
        status: v.union(v.literal("active"), v.literal("deleted")),
        workosOrganizationId: v.string(),
      }),
      projectionVersion: v.literal("lender-membership-effects-v1"),
      pageSummary: v.object({
        active: v.number(),
        administrators: v.number(),
        pending: v.number(),
        principalBrokers: v.number(),
        removed: v.number(),
        total: v.number(),
        unsupported: v.number(),
      }),
    })
  )
  .handler(async (ctx, args) => {
    const { brokerageId, workosOrganizationId } = ctx.activeOrganization;
    const membershipPage = await ctx.db
      .query("workosOrganizationMemberships")
      .withIndex("by_organization", (query) =>
        query.eq("workosOrganizationId", workosOrganizationId)
      )
      .paginate({
        cursor: args.cursor ?? null,
        numItems: LENDER_ORGANIZATION_MEMBER_PAGE_SIZE,
      });
    const memberships = membershipPage.page;

    const organization = await ctx.db
      .query("workosOrganizations")
      .withIndex("by_workos_organization_id", (query) =>
        query.eq("workosOrganizationId", workosOrganizationId)
      )
      .unique();
    if (!organization || organization.status !== "active") {
      throw new Error("Organization projection unavailable");
    }

    const members = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_workos_user_id", (query) =>
            query.eq("workosUserId", membership.workosUserId)
          )
          .unique();
        const roleSlugs = membershipRoleSlugs(membership).sort();
        const hasLenderRole = roleSlugs.some((role) =>
          ["admin", "lender", "lender-admin", "lender-staff"].includes(role)
        );
        const accessState =
          membership.status === "pending"
            ? ("pending" as const)
            : membership.status === "active"
              ? hasLenderRole && user?.status !== "deleted"
                ? ("active" as const)
                : ("unsupported" as const)
              : ("removed" as const);
        return {
          accessState,
          canManageMembers:
            accessState === "active" &&
            roleSlugs.some((role) =>
              ["admin", "lender-admin"].includes(role)
            ),
          email: user?.email,
          membership: {
            _creationTime: membership._creationTime,
            _id: membership._id,
            roleSlug: membership.roleSlug,
            roleSlugs: membership.roleSlugs,
            status: membership.status,
            workosMembershipId: membership.workosMembershipId,
            workosOrganizationId: membership.workosOrganizationId,
            workosUserId: membership.workosUserId,
          },
          name: user?.name,
          roleSlugs,
          user: user
            ? {
                _creationTime: user._creationTime,
                _id: user._id,
                authId: user.authId,
                email: user.email,
                name: user.name,
                status: user.status,
                workosUserId: user.workosUserId,
              }
            : null,
        };
      })
    );
    members.sort((left, right) => {
      const labelOrder = (
        left.name ??
        left.email ??
        left.membership.workosUserId
      ).localeCompare(
        right.name ?? right.email ?? right.membership.workosUserId
      );
      return (
        labelOrder ||
        left.membership.workosMembershipId.localeCompare(
          right.membership.workosMembershipId
        )
      );
    });

    const history = await ctx.db
      .query("auditEvents")
      .withIndex("by_organizationId_and_createdAt", (query) =>
        query.eq("organizationId", workosOrganizationId)
      )
      .order("desc")
      .take(MAX_LENDER_ORGANIZATION_HISTORY);
    const count = (state: (typeof members)[number]["accessState"]) =>
      members.filter((member) => member.accessState === state).length;

    return {
      continueCursor: membershipPage.continueCursor,
      history: history.map((event) => ({
        _creationTime: event._creationTime,
        _id: event._id,
        actorRoles: event.actorRoles,
        actorWorkosUserId: event.actorWorkosUserId,
        command: event.command,
        createdAt: event.createdAt,
        entityId: event.entityId,
        entityType: event.entityType,
        eventType: event.eventType,
        newState: event.newState,
        priorState: event.priorState,
        reason: event.reason,
        warnings: event.warnings,
      })),
      isDone: membershipPage.isDone,
      members,
      organization: {
        _creationTime: organization._creationTime,
        _id: organization._id,
        brokerageId,
        name: organization.name,
        status: organization.status,
        workosOrganizationId: organization.workosOrganizationId,
      },
      projectionVersion: LENDER_MEMBERSHIP_EFFECTS_PROJECTION_VERSION,
      pageSummary: {
        active: count("active"),
        administrators: members.filter(
          (member) =>
            member.accessState === "active" &&
            ["admin", "lender-admin"].some((role) =>
              member.roleSlugs.includes(role)
            )
        ).length,
        pending: count("pending"),
        principalBrokers: members.filter(
          (member) =>
            member.accessState === "active" &&
            member.roleSlugs.includes("lender-admin")
        ).length,
        removed: count("removed"),
        total: members.length,
        unsupported: count("unsupported"),
      },
    };
  })
  .public();

function uniqueCurrentUserOrganizationSwitchTargets(
  candidates: CurrentUserOrganizationCandidate[]
): CurrentUserOrganization[] {
  const candidatesByName = new Map<string, CurrentUserOrganizationCandidate>();

  for (const candidate of candidates) {
    const switchTargetKey = organizationSwitchTargetKey(candidate);
    const existing = candidatesByName.get(switchTargetKey);
    if (!existing || isPreferredOrganizationCandidate(candidate, existing)) {
      candidatesByName.set(switchTargetKey, candidate);
    }
  }

  return [...candidatesByName.values()].map((candidate) => ({
    membershipId: candidate.membershipId,
    organizationName: candidate.organizationName,
    roleNames: candidate.roleNames,
    roleSlug: candidate.roleSlug,
    roleSlugs: candidate.roleSlugs,
    workosOrganizationId: candidate.workosOrganizationId,
  }));
}

function organizationSwitchTargetKey(organization: CurrentUserOrganization) {
  return (
    organization.organizationName.trim().toLowerCase() ||
    organization.workosOrganizationId
  );
}

function isPreferredOrganizationCandidate(
  candidate: CurrentUserOrganizationCandidate,
  existing: CurrentUserOrganizationCandidate
) {
  if (candidate.sourcePriority !== existing.sourcePriority) {
    return candidate.sourcePriority > existing.sourcePriority;
  }
  if (candidate.updatedAt !== existing.updatedAt) {
    return candidate.updatedAt > existing.updatedAt;
  }
  return (
    candidate.workosOrganizationId.localeCompare(
      existing.workosOrganizationId
    ) < 0
  );
}

function organizationSourcePriority(
  organization: Doc<"workosOrganizations"> | null
) {
  return organization?.sourceEventType === "seed.production_foundation" ? 0 : 1;
}

function projectionUpdatedAt(
  projection: Pick<Doc<"workosOrganizations">, "createdAt" | "updatedAt"> | null
) {
  return projection?.updatedAt ?? projection?.createdAt ?? 0;
}

function resolveUserManagementOrganizationScope(viewer: AuthorizedViewer) {
  if (viewer.roles.includes("admin")) {
    return null;
  }
  const organizationId = viewer.organizationId?.trim();
  if (!organizationId) {
    throw new Error("Forbidden: organization scope");
  }
  return organizationId;
}

export const listSyncStatus = backofficeQuery
  .returns(
    v.object({
      receipts: v.array(v.any()),
    })
  )
  .handler(async (ctx) => ({
    receipts: await ctx.db
      .query("workosWebhookReceipts")
      .order("desc")
      .collect(),
  }))
  .public();

function membershipRoleSlugs(
  membership: Pick<
    Doc<"workosOrganizationMemberships">,
    "roleSlug" | "roleSlugs"
  >
) {
  return [
    ...new Set(
      [membership.roleSlug, ...(membership.roleSlugs ?? [])].filter(
        (role): role is string => typeof role === "string" && role.length > 0
      )
    ),
  ];
}

function formatRoleSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
