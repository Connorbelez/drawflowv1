/**
 * Production proposals seed foundation bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type AuthorizedViewer, requireActiveWorkosUser } from "../authz";
import { FAIRLEND_BROKERAGE_NAME, FAIRLEND_DEFAULT_BROKER_EMAIL, FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID, FAIRLEND_WORKOS_ORGANIZATION_ID } from "../fairLendConfig";
import { type Id, type MutationCtx } from "../types";
import { processWorkosEvent } from "../workosProjection";
import { slug } from "./seed_default_builders.js";
import { type ProductionDefaultScenarioDraw } from "./seed_template_defaults.js";

export async function projectDevelopmentProductionFoundationWorkosFixtures(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  input: { now: number; workosOrganizationId: string },
) {
  const createdAt = new Date(input.now).toISOString();
  const isFairLendBootstrapOrg =
    input.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID;
  const members = [
    {
      email: isFairLendBootstrapOrg
        ? FAIRLEND_DEFAULT_BROKER_EMAIL
        : (ctx.viewer.email ?? "admin@example.com"),
      roleSlugs: ["admin", "principle-broker"],
      workosUserId: isFairLendBootstrapOrg
        ? FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID
        : ctx.viewer.subject,
    },
    {
      email: "builder@example.com",
      roleSlugs: ["builder"],
      workosUserId: "user_builder",
    },
    {
      email: "broker@example.com",
      roleSlugs: ["broker"],
      workosUserId: "user_broker",
    },
  ];
  await processWorkosEvent(ctx, {
    created_at: createdAt,
    data: {
      created_at: createdAt,
      domains: [],
      id: input.workosOrganizationId,
      name: FAIRLEND_BROKERAGE_NAME,
      object: "organization",
      updated_at: createdAt,
    },
    event: "organization.created",
    id: `dev_seed_org_${input.workosOrganizationId}`,
  });
  for (const member of members) {
    await processWorkosEvent(ctx, {
      created_at: createdAt,
      data: {
        created_at: createdAt,
        email: member.email,
        email_verified: true,
        first_name: member.email.split("@")[0] ?? member.workosUserId,
        id: member.workosUserId,
        updated_at: createdAt,
      },
      event: "user.created",
      id: `dev_seed_user_${member.workosUserId}`,
    });
    const existingMembership = await ctx.db
      .query("workosOrganizationMemberships")
      .withIndex("by_user_and_organization", (query) =>
        query
          .eq("workosUserId", member.workosUserId)
          .eq("workosOrganizationId", input.workosOrganizationId),
      )
      .first();
    if (!existingMembership) {
      await processWorkosEvent(ctx, {
        created_at: createdAt,
        data: {
          created_at: createdAt,
          directory_managed: false,
          id: `dev_seed_membership_${member.workosUserId}_${input.workosOrganizationId}`,
          object: "organization_membership",
          organization_id: input.workosOrganizationId,
          role: { slug: member.roleSlugs[0] },
          roles: member.roleSlugs.map((slug) => ({ slug })),
          status: "active",
          updated_at: createdAt,
          user_id: member.workosUserId,
        },
        event: "organization_membership.created",
        id: `dev_seed_membership_event_${member.workosUserId}_${input.workosOrganizationId}`,
      });
    }
  }
}

export async function requireProductionSeedOrganization(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
) {
  const workosOrganizationId = ctx.viewer.organizationId;
  if (!workosOrganizationId) {
    throw new Error("Forbidden: authenticated organization context required");
  }

  const organizations = await ctx.db
    .query("workosOrganizations")
    .withIndex("by_workos_organization_id", (query) =>
      query.eq("workosOrganizationId", workosOrganizationId),
    )
    .take(2);
  if (organizations.length !== 1) {
    throw new Error(
      organizations.length === 0
        ? "Forbidden: active organization projection missing"
        : "Forbidden: active organization projection ambiguous",
    );
  }
  if (organizations[0]?.status !== "active") {
    throw new Error("Forbidden: active organization projection");
  }

  await requireActiveWorkosUser(ctx, ctx.viewer.subject);
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user_and_organization", (query) =>
      query
        .eq("workosUserId", ctx.viewer.subject)
        .eq("workosOrganizationId", workosOrganizationId),
    )
    .take(2);
  if (memberships.length !== 1) {
    throw new Error(
      memberships.length === 0
        ? "Forbidden: active organization membership missing"
        : "Forbidden: active organization membership ambiguous",
    );
  }
  const [membership] = memberships;
  if (
    membership?.status !== "active" ||
    !membership.roleSlugs.includes("admin")
  ) {
    throw new Error("Forbidden: active admin organization membership");
  }

  return workosOrganizationId;
}

export async function ensureBrokerage(
  ctx: MutationCtx,
  input: {
    displayName: string;
    legalName: string;
    now: number;
    principalBrokerWorkosUserId?: string;
    workosOrganizationId: string;
  },
) {
  const principalBroker = input.principalBrokerWorkosUserId
    ? await ctx.db
        .query("users")
        .withIndex("by_workos_user_id", (q) =>
          q.eq("workosUserId", input.principalBrokerWorkosUserId),
        )
        .unique()
    : null;
  const principalBrokerEmail = principalBroker?.email.trim().toLowerCase();
  const existing = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (q) =>
      q.eq("workosOrganizationId", input.workosOrganizationId),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      displayName: input.displayName,
      legalName: input.legalName,
      principalBrokerEmail:
        principalBrokerEmail || existing.principalBrokerEmail,
      principalBrokerWorkosUserId:
        input.principalBrokerWorkosUserId ??
        existing.principalBrokerWorkosUserId,
      status: "active",
      updatedAt: input.now,
    });
    return existing._id;
  }
  return await ctx.db.insert("brokerages", {
    createdAt: input.now,
    displayName: input.displayName,
    legalName: input.legalName,
    ...(principalBrokerEmail ? { principalBrokerEmail } : {}),
    principalBrokerWorkosUserId: input.principalBrokerWorkosUserId,
    status: "active",
    updatedAt: input.now,
    workosOrganizationId: input.workosOrganizationId,
  });
}

export async function ensureBuilderProfile(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    displayName: string;
    now: number;
    organizationId: string;
  },
) {
  const existing = await ctx.db
    .query("builderProfiles")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", input.organizationId),
    )
    .first();
  if (existing) {
    return existing._id;
  }
  return await ctx.db.insert("builderProfiles", {
    brokerageId: input.brokerageId,
    createdAt: input.now,
    displayName: input.displayName,
    organizationId: input.organizationId,
    status: "active",
    updatedAt: input.now,
  });
}

export async function ensureBuilderAccountLink(
  ctx: MutationCtx,
  input: {
    assignedEmail?: string;
    brokerageId: Id<"brokerages">;
    builderProfileId: Id<"builderProfiles">;
    now: number;
    role: "owner" | "staff";
    workosMembershipId?: string;
    workosUserId: string;
  },
) {
  const existing = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (q) =>
      q
        .eq("builderProfileId", input.builderProfileId)
        .eq("workosUserId", input.workosUserId),
    )
    .unique();
  if (existing) {
    const metadataPatch = {
      ...(input.assignedEmail ? { assignedEmail: input.assignedEmail } : {}),
      ...(input.workosMembershipId
        ? { workosMembershipId: input.workosMembershipId }
        : {}),
    };
    await ctx.db.patch(existing._id, {
      ...metadataPatch,
      status: "active",
      updatedAt: input.now,
    });
    return existing._id;
  }
  const metadata = {
    ...(input.assignedEmail ? { assignedEmail: input.assignedEmail } : {}),
    ...(input.workosMembershipId
      ? { workosMembershipId: input.workosMembershipId }
      : {}),
  };
  return await ctx.db.insert("builderAccountLinks", {
    ...metadata,
    brokerageId: input.brokerageId,
    builderProfileId: input.builderProfileId,
    createdAt: input.now,
    role: input.role,
    status: "active",
    updatedAt: input.now,
    workosUserId: input.workosUserId,
  });
}

export async function ensureSeedBuilderBrokerAssignment(
  ctx: MutationCtx,
  input: {
    assignedBrokerWorkosUserId: string;
    brokerageId: Id<"brokerages">;
    builderProfileId: Id<"builderProfiles">;
    now: number;
    organizationId: string;
  },
) {
  const existing = await ctx.db
    .query("builderBrokerAssignments")
    .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q) =>
      q.eq("builderProfileId", input.builderProfileId).eq("status", "active"),
    )
    .order("desc")
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      assignedBrokerWorkosUserId: input.assignedBrokerWorkosUserId,
      brokerageId: input.brokerageId,
      organizationId: input.organizationId,
      updatedAt: input.now,
    });
    return existing._id;
  }
  return await ctx.db.insert("builderBrokerAssignments", {
    assignedBrokerWorkosUserId: input.assignedBrokerWorkosUserId,
    brokerageId: input.brokerageId,
    builderProfileId: input.builderProfileId,
    createdAt: input.now,
    effectiveAt: input.now,
    organizationId: input.organizationId,
    status: "active",
    updatedAt: input.now,
  });
}

export type ProductionDefaultScenario = {
  description: string;
  draws: ProductionDefaultScenarioDraw[];
  isActive: boolean;
  isDefault: boolean;
  name: string;
  scenarioKey: string;
};
