import { v } from "convex/values";

import type { Doc, TableNames } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  type AuthorizedViewer,
  authenticatedQuery,
  backofficeQuery,
  lenderOrganizationQuery,
  lenderUserManagementQuery,
} from "./authz";
import { syncBuildCollaborationSearchAuthority } from "./build_collaboration_search_authority_projection";
import { fluent } from "./fluent";

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

export const processWorkosEvent = async (
  ctx: MutationCtx,
  incoming: WorkosEvent
) => {
  const event = normalizeIncomingEvent(incoming);
  const existing = await ctx.db
    .query("workosWebhookReceipts")
    .withIndex("by_event_id", (q) => q.eq("eventId", event.id))
    .unique();

  if (existing?.status === "processed") {
    return null;
  }

  const now = Date.now();
  const workosCreatedAt = parseTime(event.created_at);
  const receiptId =
    existing?._id ??
    (await ctx.db.insert("workosWebhookReceipts", {
      eventId: event.id,
      eventType: event.event,
      status: "processing",
      workosCreatedAt,
    }));

  try {
    await applyProjection(ctx, event, now);
    await ctx.db.patch(receiptId, {
      error: undefined,
      eventType: event.event,
      processedAt: now,
      status: "processed",
      workosCreatedAt,
    });
  } catch (error) {
    await ctx.db.patch(receiptId, {
      error: error instanceof Error ? error.message : String(error),
      eventType: event.event,
      processedAt: now,
      status: "failed",
      workosCreatedAt,
    });
    throw error;
  }

  return null;
};

export const ingestWorkosEvent = fluent
  .mutation()
  .input({
    created_at: v.optional(v.string()),
    createdAt: v.optional(v.string()),
    event: v.string(),
    id: v.optional(v.string()),
    data: v.record(v.string(), v.any()),
  })
  .returns(v.null())
  .handler(async (ctx, args) => processWorkosEvent(ctx, args as WorkosEvent))
  .internal();

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

async function applyProjection(
  ctx: MutationCtx,
  event: NormalizedWorkosEvent,
  now: number
) {
  if (event.event.startsWith("user.")) {
    await upsertUser(ctx, event, now);
    return;
  }

  if (event.event.startsWith("organization_membership.")) {
    await upsertMembership(ctx, event, now);
    return;
  }

  if (event.event.startsWith("organization_role.")) {
    await upsertOrganizationRole(ctx, event, now);
    return;
  }

  if (event.event.startsWith("organization.")) {
    await upsertOrganization(ctx, event, now);
    return;
  }

  if (event.event.startsWith("role.")) {
    await upsertRole(ctx, event, now);
    return;
  }

  if (event.event.startsWith("permission.")) {
    await upsertPermission(ctx, event, now);
  }
}

async function upsertUser(
  ctx: MutationCtx,
  event: NormalizedWorkosEvent,
  now: number
) {
  const data = event.data;
  const row = await ctx.db
    .query("users")
    .withIndex("authId", (q) => q.eq("authId", data.id))
    .unique();
  const deleted = event.event.endsWith(".deleted");
  const patch: Partial<Doc<"users">> = {
    authId: data.id,
    deletedAt: deleted ? now : undefined,
    sourceEventId: event.id,
    sourceEventType: event.event,
    status: deleted ? ("deleted" as const) : ("active" as const),
    updatedAt:
      parseTime(data.updatedAt ?? data.updated_at) ?? row?.updatedAt ?? now,
    workosUserId: data.id,
  };
  patchIfProvided(
    patch,
    "createdAt",
    parseTime(data.createdAt ?? data.created_at),
    row,
    hasWorkosField(data, "created_at", "createdAt")
  );
  patchIfProvided(
    patch,
    "email",
    stringOrFallback(data.email, ""),
    row,
    "email" in data
  );
  const projectedEmail = patch.email ?? row?.email;
  if (projectedEmail !== undefined) {
    const normalizedEmail = projectedEmail.trim().toLowerCase();
    patch.normalizedEmail = normalizedEmail || undefined;
  }
  patchIfProvided(
    patch,
    "emailVerified",
    booleanOrFallback(data.emailVerified ?? data.email_verified, false),
    row,
    hasWorkosField(data, "email_verified", "emailVerified")
  );
  patchIfProvided(
    patch,
    "firstName",
    stringOrFallback(data.firstName ?? data.first_name, ""),
    row,
    hasWorkosField(data, "first_name", "firstName")
  );
  patchIfProvided(
    patch,
    "lastName",
    stringOrFallback(data.lastName ?? data.last_name, ""),
    row,
    hasWorkosField(data, "last_name", "lastName")
  );
  patchIfProvided(
    patch,
    "name",
    [
      data.firstName ?? data.first_name ?? row?.firstName,
      data.lastName ?? data.last_name ?? row?.lastName,
    ]
      .filter(Boolean)
      .join(" "),
    row,
    hasWorkosField(data, "first_name", "firstName") ||
      hasWorkosField(data, "last_name", "lastName")
  );
  patchIfProvided(
    patch,
    "profilePictureUrl",
    stringOrUndefined(data.profilePictureUrl ?? data.profile_picture_url),
    row,
    hasWorkosField(data, "profile_picture_url", "profilePictureUrl")
  );

  if (row) {
    await ctx.db.patch(row._id, patch);
  } else {
    await ctx.db.insert("users", patch as InsertDoc<"users">);
  }
}

async function upsertOrganization(
  ctx: MutationCtx,
  event: NormalizedWorkosEvent,
  now: number
) {
  const data = event.data;
  const row = await ctx.db
    .query("workosOrganizations")
    .withIndex("by_workos_organization_id", (q) =>
      q.eq("workosOrganizationId", data.id)
    )
    .unique();
  const deleted = event.event.endsWith(".deleted");
  const patch: Partial<Doc<"workosOrganizations">> = {
    deletedAt: deleted ? now : undefined,
    sourceEventId: event.id,
    sourceEventType: event.event,
    status: deleted ? ("deleted" as const) : ("active" as const),
    updatedAt:
      parseTime(workosField(data, "updated_at", "updatedAt")) ??
      row?.updatedAt ??
      now,
    workosOrganizationId: data.id,
  };
  patchIfProvided(
    patch,
    "createdAt",
    parseTime(workosField(data, "created_at", "createdAt")),
    row,
    hasWorkosField(data, "created_at", "createdAt")
  );
  patchIfProvided(patch, "domains", data.domains ?? [], row, "domains" in data);
  patchIfProvided(
    patch,
    "name",
    stringOrFallback(data.name, ""),
    row,
    "name" in data
  );

  if (row) {
    await ctx.db.patch(row._id, patch);
  } else {
    await ctx.db.insert(
      "workosOrganizations",
      patch as InsertDoc<"workosOrganizations">
    );
  }
}

async function upsertMembership(
  ctx: MutationCtx,
  event: NormalizedWorkosEvent,
  now: number
) {
  const data = event.data;
  const workosOrganizationId = workosField<string>(
    data,
    "organization_id",
    "organizationId"
  );
  const workosUserId = workosField<string>(data, "user_id", "userId");
  const row = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_workos_membership_id", (q) =>
      q.eq("workosMembershipId", data.id)
    )
    .unique();
  const resolvedWorkosOrganizationId =
    workosOrganizationId ?? row?.workosOrganizationId;
  const resolvedWorkosUserId = workosUserId ?? row?.workosUserId;
  if (!(resolvedWorkosOrganizationId && resolvedWorkosUserId)) {
    throw new Error(
      `organization_membership event ${event.id} is missing organization or user id`
    );
  }
  const deleted = event.event.endsWith(".deleted");
  const patch: Partial<Doc<"workosOrganizationMemberships">> = {
    deletedAt: deleted ? now : undefined,
    sourceEventId: event.id,
    sourceEventType: event.event,
    status: deleted
      ? ("deleted" as const)
      : "status" in data
        ? normalizeMembershipStatus(data.status)
        : (row?.status ?? ("active" as const)),
    updatedAt:
      parseTime(workosField(data, "updated_at", "updatedAt")) ??
      row?.updatedAt ??
      now,
    workosMembershipId: data.id,
    workosOrganizationId: resolvedWorkosOrganizationId,
    workosUserId: resolvedWorkosUserId,
  };
  patchIfProvided(
    patch,
    "createdAt",
    parseTime(workosField(data, "created_at", "createdAt")),
    row,
    hasWorkosField(data, "created_at", "createdAt")
  );
  patchIfProvided(
    patch,
    "directoryManaged",
    Boolean(workosField(data, "directory_managed", "directoryManaged")),
    row,
    hasWorkosField(data, "directory_managed", "directoryManaged")
  );
  patchIfProvided(patch, "roleSlug", data.role?.slug, row, "role" in data);
  patchIfProvided(
    patch,
    "roleSlugs",
    normalizeRoleSlugs(data),
    row,
    "role" in data || "roles" in data
  );

  if (row) {
    await ctx.db.patch(row._id, patch);
  } else {
    await ctx.db.insert(
      "workosOrganizationMemberships",
      patch as InsertDoc<"workosOrganizationMemberships">
    );
  }
  await syncBuildCollaborationSearchAuthority(ctx, {
    roleSlug: patch.roleSlug ?? row?.roleSlug,
    roleSlugs: patch.roleSlugs ?? row?.roleSlugs ?? [],
    status: patch.status ?? row?.status ?? "active",
    workosMembershipId: data.id,
    workosOrganizationId: resolvedWorkosOrganizationId,
    workosUserId: resolvedWorkosUserId,
  });

  const projectedStatus = patch.status ?? row?.status;
  const projectedRoles = patch.roleSlugs ?? row?.roleSlugs ?? [];
  if (projectedStatus === "active" && projectedRoles.includes("contractor")) {
    await acceptContractorInviteClaimFromMembership(ctx, {
      now,
      workosOrganizationId: resolvedWorkosOrganizationId,
      workosUserId: resolvedWorkosUserId,
    });
  }
}

async function acceptContractorInviteClaimFromMembership(
  ctx: MutationCtx,
  input: {
    now: number;
    workosOrganizationId: string;
    workosUserId: string;
  }
) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) =>
      q.eq("workosUserId", input.workosUserId)
    )
    .first();
  const normalizedEmail = user?.email.trim().toLowerCase();
  if (!normalizedEmail) {
    return;
  }
  const candidates = await ctx.db
    .query("contractorInviteClaims")
    .withIndex("by_invited_email", (q) =>
      q.eq("invitedNormalizedEmail", normalizedEmail)
    )
    .collect();
  const liveClaims = candidates
    .filter(
      (claim) =>
        claim.organizationId === input.workosOrganizationId &&
        claim.state === "invited" &&
        (claim.expiresAt === undefined || claim.expiresAt >= input.now)
    )
    .sort((left, right) => right.createdAt - left.createdAt);
  const claim = liveClaims[0];
  if (!claim) {
    return;
  }
  await ctx.db.patch(claim._id, {
    acceptedWorkosUserId: input.workosUserId,
    state: "accepted_pending_confirmation",
    updatedAt: input.now,
  });
  for (const staleClaim of liveClaims.slice(1)) {
    await ctx.db.patch(staleClaim._id, {
      revokedAt: input.now,
      revokedByWorkosUserId: "system:workos-projection",
      revokeReason: "A newer contractor invitation was accepted.",
      state: "revoked",
      updatedAt: input.now,
    });
  }
  await ctx.db.insert("auditEvents", {
    actorRoles: ["system"],
    actorWorkosUserId: "system:workos-projection",
    brokerageId: claim.brokerageId,
    command: "acceptContractorInviteClaimFromMembership",
    createdAt: input.now,
    entityId: String(claim._id),
    entityType: "contractorInviteClaim",
    eventType: "contractor.invite.accepted",
    newState: JSON.stringify({
      acceptedWorkosUserId: input.workosUserId,
      state: "accepted_pending_confirmation",
    }),
    organizationId: claim.organizationId,
    priorState: JSON.stringify({ state: "invited" }),
    warnings:
      liveClaims.length > 1
        ? [`Revoked ${liveClaims.length - 1} older matching invitation(s).`]
        : [],
  });
}

// biome-ignore lint/suspicious/noExplicitAny: WorkOS role payloads have varying external shapes.
function normalizeRoleSlugs(data: Record<string, any>): string[] {
  const slugs = new Set<string>();
  if (typeof data.role?.slug === "string") {
    slugs.add(data.role.slug);
  }
  for (const role of data.roles ?? []) {
    if (typeof role?.slug === "string") {
      slugs.add(role.slug);
    }
  }
  return [...slugs];
}

function normalizeMembershipStatus(status: unknown) {
  if (status === "inactive") {
    return "inactive" as const;
  }
  if (status === "pending") {
    return "pending" as const;
  }
  return "active" as const;
}

async function upsertRole(
  ctx: MutationCtx,
  event: NormalizedWorkosEvent,
  now: number
) {
  const data = event.data;
  const row = await ctx.db
    .query("workosRoles")
    .withIndex("by_slug", (q) => q.eq("slug", data.slug))
    .unique();
  const deleted = event.event.endsWith(".deleted");
  const patch: Partial<Doc<"workosRoles">> = {
    deletedAt: deleted ? now : undefined,
    slug: data.slug,
    sourceEventId: event.id,
    sourceEventType: event.event,
    status: deleted ? ("deleted" as const) : ("active" as const),
    updatedAt:
      parseTime(workosField(data, "updated_at", "updatedAt")) ??
      row?.updatedAt ??
      now,
  };
  patchIfProvided(
    patch,
    "createdAt",
    parseTime(workosField(data, "created_at", "createdAt")),
    row,
    hasWorkosField(data, "created_at", "createdAt")
  );
  patchIfProvided(
    patch,
    "permissionSlugs",
    data.permissions ?? [],
    row,
    "permissions" in data
  );
  patchIfProvided(
    patch,
    "resourceTypeSlug",
    workosField<string>(data, "resource_type_slug", "resourceTypeSlug"),
    row,
    hasWorkosField(data, "resource_type_slug", "resourceTypeSlug")
  );

  if (row) {
    await ctx.db.patch(row._id, patch);
  } else {
    await ctx.db.insert("workosRoles", patch as InsertDoc<"workosRoles">);
  }
}

async function upsertOrganizationRole(
  ctx: MutationCtx,
  event: NormalizedWorkosEvent,
  now: number
) {
  const data = event.data;
  const workosOrganizationId = workosField<string>(
    data,
    "organization_id",
    "organizationId"
  );
  if (!workosOrganizationId) {
    throw new Error(
      `organization_role event ${event.id} is missing organization id`
    );
  }

  const row = await ctx.db
    .query("workosOrganizationRoles")
    .withIndex("by_organization_slug", (q) =>
      q.eq("workosOrganizationId", workosOrganizationId).eq("slug", data.slug)
    )
    .unique();
  const deleted = event.event.endsWith(".deleted");
  const patch: Partial<Doc<"workosOrganizationRoles">> = {
    deletedAt: deleted ? now : undefined,
    slug: data.slug,
    sourceEventId: event.id,
    sourceEventType: event.event,
    status: deleted ? ("deleted" as const) : ("active" as const),
    updatedAt:
      parseTime(workosField(data, "updated_at", "updatedAt")) ??
      row?.updatedAt ??
      now,
    workosOrganizationId,
  };
  patchIfProvided(
    patch,
    "createdAt",
    parseTime(workosField(data, "created_at", "createdAt")),
    row,
    hasWorkosField(data, "created_at", "createdAt")
  );
  patchIfProvided(
    patch,
    "description",
    stringOrUndefined(data.description),
    row,
    "description" in data
  );
  patchIfProvided(
    patch,
    "name",
    stringOrFallback(data.name, data.slug),
    row,
    "name" in data
  );
  patchIfProvided(
    patch,
    "permissionSlugs",
    data.permissions ?? [],
    row,
    "permissions" in data
  );
  patchIfProvided(
    patch,
    "resourceTypeSlug",
    workosField<string>(data, "resource_type_slug", "resourceTypeSlug"),
    row,
    hasWorkosField(data, "resource_type_slug", "resourceTypeSlug")
  );

  if (row) {
    await ctx.db.patch(row._id, patch);
  } else {
    await ctx.db.insert(
      "workosOrganizationRoles",
      patch as InsertDoc<"workosOrganizationRoles">
    );
  }
}

async function upsertPermission(
  ctx: MutationCtx,
  event: NormalizedWorkosEvent,
  now: number
) {
  const data = event.data;
  const row = await ctx.db
    .query("workosPermissions")
    .withIndex("by_slug", (q) => q.eq("slug", data.slug))
    .unique();
  const deleted = event.event.endsWith(".deleted");
  const patch: Partial<Doc<"workosPermissions">> = {
    deletedAt: deleted ? now : undefined,
    slug: data.slug,
    sourceEventId: event.id,
    sourceEventType: event.event,
    status: deleted ? ("deleted" as const) : ("active" as const),
    updatedAt:
      parseTime(workosField(data, "updated_at", "updatedAt")) ??
      row?.updatedAt ??
      now,
  };
  patchIfProvided(
    patch,
    "createdAt",
    parseTime(workosField(data, "created_at", "createdAt")),
    row,
    hasWorkosField(data, "created_at", "createdAt")
  );
  patchIfProvided(
    patch,
    "description",
    stringOrUndefined(data.description),
    row,
    "description" in data
  );
  patchIfProvided(
    patch,
    "name",
    stringOrFallback(data.name, data.slug),
    row,
    "name" in data
  );
  patchIfProvided(patch, "system", Boolean(data.system), row, "system" in data);
  patchIfProvided(patch, "workosPermissionId", data.id, row, "id" in data);

  if (row) {
    await ctx.db.patch(row._id, patch);
  } else {
    await ctx.db.insert(
      "workosPermissions",
      patch as InsertDoc<"workosPermissions">
    );
  }
}

function workosField<T>(
  data: Record<string, unknown>,
  snake: string,
  camel: string
): T | undefined {
  const value = data[snake] ?? data[camel];
  return value as T | undefined;
}

function hasWorkosField(
  data: Record<string, unknown>,
  snake: string,
  camel: string
) {
  return snake in data || camel in data;
}

function patchIfProvided<T extends Record<string, unknown>, K extends keyof T>(
  patch: Partial<T>,
  key: K,
  value: T[K] | undefined,
  row: T | null,
  provided = key in patch || value !== undefined
) {
  if (!row || provided) {
    patch[key] = value;
  }
}

function stringOrFallback(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function booleanOrFallback(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function parseTime(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function normalizeIncomingEvent(event: WorkosEvent): NormalizedWorkosEvent {
  const nested = event.data;
  if (
    nested &&
    typeof nested.id === "string" &&
    typeof nested.event === "string"
  ) {
    const normalized = nested as WorkosEvent;
    return {
      ...normalized,
      id: normalized.id ?? `${normalized.event}:${nested.id}`,
    };
  }

  const entityId =
    typeof nested?.id === "string"
      ? nested.id
      : typeof nested?.slug === "string"
        ? nested.slug
        : "unknown";

  return {
    created_at:
      event.created_at ??
      event.createdAt ??
      nested?.updated_at ??
      nested?.updatedAt ??
      nested?.created_at ??
      nested?.createdAt,
    data: nested,
    event: event.event,
    id: event.id ?? `${event.event}:${entityId}`,
  };
}
