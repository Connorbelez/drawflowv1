import { v } from "convex/values";

import type { Doc, TableNames } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { backofficeQuery } from "./authz";
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
  roles: v.string(),
  roleSlugs: v.array(v.string()),
  sourceEventId: v.optional(v.string()),
  sourceEventType: v.optional(v.string()),
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
    const memberships = await ctx.db
      .query("workosOrganizationMemberships")
      .collect();
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

    const users = (await ctx.db.query("users").collect()).map((user) => {
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
      organizationRoles: await ctx.db
        .query("workosOrganizationRoles")
        .collect(),
      organizations: await ctx.db.query("workosOrganizations").collect(),
      permissions: await ctx.db.query("workosPermissions").collect(),
      roles: await ctx.db.query("workosRoles").collect(),
      users,
    };
  })
  .public();

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
