import { v } from "convex/values";

import type { MutationCtx } from "./_generated/server";
import { authenticatedQuery, backofficeQuery } from "./authz";
import { fluent } from "./fluent";

type WorkosEvent = {
  created_at?: string;
  data: Record<string, any>;
  event: string;
  id: string;
};

const userRow = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  authId: v.string(),
  email: v.string(),
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
  sourceEventId: v.optional(v.string()),
  sourceEventType: v.optional(v.string()),
});

export const processWorkosEvent = async (ctx: MutationCtx, event: WorkosEvent) => {
  event = normalizeIncomingEvent(event);
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
    event: v.string(),
    data: v.record(v.string(), v.any()),
  })
  .returns(v.null())
  .handler(async (ctx, args) => processWorkosEvent(ctx, args.data as WorkosEvent))
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
  .handler(async (ctx) => ({
    memberships: await ctx.db.query("workosOrganizationMemberships").collect(),
    organizationRoles: await ctx.db.query("workosOrganizationRoles").collect(),
    organizations: await ctx.db.query("workosOrganizations").collect(),
    permissions: await ctx.db.query("workosPermissions").collect(),
    roles: await ctx.db.query("workosRoles").collect(),
    users: await ctx.db.query("users").collect(),
  }))
  .public();

export const listSyncStatus = authenticatedQuery
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

async function applyProjection(ctx: MutationCtx, event: WorkosEvent, now: number) {
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

async function upsertUser(ctx: MutationCtx, event: WorkosEvent, now: number) {
  const data = event.data;
  const row = await ctx.db
    .query("users")
    .withIndex("authId", (q) => q.eq("authId", data.id))
    .unique();
  const deleted = event.event.endsWith(".deleted");
  const patch = {
    authId: data.id,
    createdAt: parseTime(data.createdAt ?? data.created_at),
    deletedAt: deleted ? now : undefined,
    email: data.email ?? "",
    emailVerified: Boolean(data.emailVerified ?? data.email_verified),
    firstName: data.firstName ?? data.first_name ?? "",
    lastName: data.lastName ?? data.last_name ?? "",
    name: [data.firstName ?? data.first_name, data.lastName ?? data.last_name]
      .filter(Boolean)
      .join(" "),
    profilePictureUrl: data.profilePictureUrl ?? data.profile_picture_url ?? undefined,
    sourceEventId: event.id,
    sourceEventType: event.event,
    status: deleted ? ("deleted" as const) : ("active" as const),
    updatedAt: parseTime(data.updatedAt ?? data.updated_at) ?? now,
    workosUserId: data.id,
  };

  if (row) {
    await ctx.db.patch(row._id, patch);
  } else {
    await ctx.db.insert("users", patch);
  }
}

async function upsertOrganization(ctx: MutationCtx, event: WorkosEvent, now: number) {
  const data = event.data;
  const row = await ctx.db
    .query("workosOrganizations")
    .withIndex("by_workos_organization_id", (q) =>
      q.eq("workosOrganizationId", data.id)
    )
    .unique();
  const deleted = event.event.endsWith(".deleted");
  const patch = {
    createdAt: parseTime(data.created_at),
    deletedAt: deleted ? now : undefined,
    domains: data.domains ?? [],
    name: data.name ?? "",
    sourceEventId: event.id,
    sourceEventType: event.event,
    status: deleted ? ("deleted" as const) : ("active" as const),
    updatedAt: parseTime(data.updated_at) ?? now,
    workosOrganizationId: data.id,
  };

  if (row) await ctx.db.patch(row._id, patch);
  else await ctx.db.insert("workosOrganizations", patch);
}

async function upsertMembership(ctx: MutationCtx, event: WorkosEvent, now: number) {
  const data = event.data;
  const row = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_workos_membership_id", (q) =>
      q.eq("workosMembershipId", data.id)
    )
    .unique();
  const deleted = event.event.endsWith(".deleted");
  const patch = {
    createdAt: parseTime(data.created_at),
    deletedAt: deleted ? now : undefined,
    directoryManaged: Boolean(data.directory_managed),
    roleSlug: data.role?.slug,
    roleSlugs: (data.roles ?? []).map((role: any) => role.slug).filter(Boolean),
    sourceEventId: event.id,
    sourceEventType: event.event,
    status: deleted
      ? ("deleted" as const)
      : data.status === "inactive"
        ? ("inactive" as const)
        : ("active" as const),
    updatedAt: parseTime(data.updated_at) ?? now,
    workosMembershipId: data.id,
    workosOrganizationId: data.organization_id,
    workosUserId: data.user_id,
  };

  if (row) await ctx.db.patch(row._id, patch);
  else await ctx.db.insert("workosOrganizationMemberships", patch);
}

async function upsertRole(ctx: MutationCtx, event: WorkosEvent, now: number) {
  const data = event.data;
  const row = await ctx.db
    .query("workosRoles")
    .withIndex("by_slug", (q) => q.eq("slug", data.slug))
    .unique();
  const deleted = event.event.endsWith(".deleted");
  const patch = {
    createdAt: parseTime(data.created_at),
    deletedAt: deleted ? now : undefined,
    permissionSlugs: data.permissions ?? [],
    resourceTypeSlug: data.resource_type_slug,
    slug: data.slug,
    sourceEventId: event.id,
    sourceEventType: event.event,
    status: deleted ? ("deleted" as const) : ("active" as const),
    updatedAt: parseTime(data.updated_at) ?? now,
  };

  if (row) await ctx.db.patch(row._id, patch);
  else await ctx.db.insert("workosRoles", patch);
}

async function upsertOrganizationRole(
  ctx: MutationCtx,
  event: WorkosEvent,
  now: number
) {
  const data = event.data;
  const row = await ctx.db
    .query("workosOrganizationRoles")
    .withIndex("by_organization_slug", (q) =>
      q.eq("workosOrganizationId", data.organization_id).eq("slug", data.slug)
    )
    .unique();
  const deleted = event.event.endsWith(".deleted");
  const patch = {
    createdAt: parseTime(data.created_at),
    deletedAt: deleted ? now : undefined,
    description: data.description,
    name: data.name ?? data.slug,
    permissionSlugs: data.permissions ?? [],
    resourceTypeSlug: data.resource_type_slug,
    slug: data.slug,
    sourceEventId: event.id,
    sourceEventType: event.event,
    status: deleted ? ("deleted" as const) : ("active" as const),
    updatedAt: parseTime(data.updated_at) ?? now,
    workosOrganizationId: data.organization_id,
  };

  if (row) await ctx.db.patch(row._id, patch);
  else await ctx.db.insert("workosOrganizationRoles", patch);
}

async function upsertPermission(ctx: MutationCtx, event: WorkosEvent, now: number) {
  const data = event.data;
  const row = await ctx.db
    .query("workosPermissions")
    .withIndex("by_slug", (q) => q.eq("slug", data.slug))
    .unique();
  const deleted = event.event.endsWith(".deleted");
  const patch = {
    createdAt: parseTime(data.created_at),
    deletedAt: deleted ? now : undefined,
    description: data.description,
    name: data.name ?? data.slug,
    slug: data.slug,
    sourceEventId: event.id,
    sourceEventType: event.event,
    status: deleted ? ("deleted" as const) : ("active" as const),
    system: Boolean(data.system),
    updatedAt: parseTime(data.updated_at) ?? now,
    workosPermissionId: data.id,
  };

  if (row) await ctx.db.patch(row._id, patch);
  else await ctx.db.insert("workosPermissions", patch);
}

function parseTime(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function normalizeIncomingEvent(event: WorkosEvent): WorkosEvent {
  const nested = event.data;
  if (nested && typeof nested.id === "string" && typeof nested.event === "string") {
    return nested as WorkosEvent;
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
      nested?.updated_at ??
      nested?.updatedAt ??
      nested?.created_at ??
      nested?.createdAt,
    data: nested,
    event: event.event,
    id: event.id ?? `${event.event}:${entityId}`,
  };
}
