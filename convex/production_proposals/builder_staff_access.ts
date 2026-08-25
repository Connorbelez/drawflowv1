/**
 * Production proposals builder staff access bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type AuthorizedViewer, normalizeRoleSlugs, type RoleSlug } from "../authz";
import { pendingBuilderStaffWorkosUserId } from "../builderStaffIdentity";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { getActiveBuilderAccountLink, assertBuilderAccountLinkNotDeleted } from "./authorization_core.js";
import { BUILDER_STAFF_PERMISSION_RESOURCES, BUILDER_STAFF_PERMISSION_ACTIONS } from "./contracts_foundation.js";
import { isBackoffice } from "./proposal_claim.js";

export type BuilderStaffPermissionResource =
  (typeof BUILDER_STAFF_PERMISSION_RESOURCES)[number];

export type BuilderStaffPermissionAction =
  (typeof BUILDER_STAFF_PERMISSION_ACTIONS)[number];

export type BuilderStaffPermissionScope = "proposal" | "activeBuild";

interface BuilderStaffPermissionContext {
  action: BuilderStaffPermissionAction;
  builderProfileId: Id<"builderProfiles">;
  buildId?: Id<"activeBuilds">;
  proposalId: Id<"buildProposals">;
  resourceType: BuilderStaffPermissionResource;
  scope: BuilderStaffPermissionScope;
}

export interface BuilderStaffPermissionSnapshot {
  grants: Array<{
    canCreate: boolean;
    canDelete: boolean;
    canUpdate: boolean;
    canView: boolean;
    resourceType: BuilderStaffPermissionResource;
  }>;
  mode: "full" | "limited";
  role: "backoffice" | "lender" | "owner" | "staff";
}

async function requireBuilderStaffPermission(
  ctx: QueryCtx | MutationCtx,
  auth: {
    email?: string;
    roles: RoleSlug[];
    subject: string;
  },
  input: BuilderStaffPermissionContext,
) {
  const snapshot = await getBuilderStaffPermissionSnapshot(ctx, auth, input);
  if (snapshot.mode === "full") {
    return snapshot;
  }
  const grant = snapshot.grants.find(
    (candidate) => candidate.resourceType === input.resourceType,
  );
  if (!grant?.[permissionFieldForAction(input.action)]) {
    throw new Error(
      `Forbidden: builder staff ${input.resourceType}.${input.action}`,
    );
  }
  return snapshot;
}

export async function requireAnyBuilderStaffViewPermission(
  ctx: QueryCtx | MutationCtx,
  auth: {
    email?: string;
    roles: RoleSlug[];
    subject: string;
  },
  input: Omit<BuilderStaffPermissionContext, "action" | "resourceType">,
) {
  const snapshot = await getBuilderStaffPermissionSnapshot(ctx, auth, {
    ...input,
    action: "view",
    resourceType: "milestone",
  });
  if (snapshot.mode === "full") {
    return snapshot;
  }
  if (
    !snapshot.grants.some(
      (grant) =>
        grant.canView || grant.canCreate || grant.canUpdate || grant.canDelete,
    )
  ) {
    throw new Error("Forbidden: builder staff view");
  }
  return snapshot;
}

async function getBuilderStaffPermissionSnapshot(
  ctx: QueryCtx | MutationCtx,
  auth: {
    email?: string;
    roles: RoleSlug[];
    subject: string;
  },
  input: BuilderStaffPermissionContext,
): Promise<BuilderStaffPermissionSnapshot> {
  if (isBackoffice(auth.roles)) {
    return {
      grants: fullBuilderStaffPermissionGrants(),
      mode: "full",
      role: "backoffice",
    };
  }
  const link = await getActiveBuilderAccountLinkForStaffViewer(
    ctx,
    input.builderProfileId,
    auth,
  );
  if (!link) {
    throw new Error("Forbidden: builder ownership");
  }
  await assertBuilderAccountLinkNotDeleted(ctx, link, input.builderProfileId);
  if (link.role === "owner") {
    return {
      grants: fullBuilderStaffPermissionGrants(),
      mode: "full",
      role: "owner",
    };
  }

  const rows =
    input.scope === "proposal"
      ? await ctx.db
          .query("builderStaffPermissionGrants")
          .withIndex("by_link", (q) => q.eq("builderAccountLinkId", link._id))
          .filter((q) =>
            q.and(
              q.eq(q.field("scope"), "proposal"),
              q.eq(q.field("proposalId"), input.proposalId),
            ),
          )
          .collect()
      : await ctx.db
          .query("builderStaffPermissionGrants")
          .withIndex("by_link", (q) => q.eq("builderAccountLinkId", link._id))
          .filter((q) =>
            q.and(
              q.eq(q.field("scope"), "activeBuild"),
              q.eq(q.field("buildId"), input.buildId),
            ),
          )
          .collect();

  return {
    grants: normalizeBuilderStaffPermissionRows(rows),
    mode: "limited",
    role: "staff",
  };
}

export async function proposalAppPermissionProjection(
  ctx: QueryCtx | MutationCtx,
  auth: {
    email?: string;
    proposal: Doc<"buildProposals">;
    roles: RoleSlug[];
    subject: string;
  },
): Promise<BuilderStaffPermissionSnapshot> {
  if (!auth.proposal.builderProfileId) {
    return {
      grants: fullBuilderStaffPermissionGrants(),
      mode: "full",
      role: isBackoffice(auth.roles) ? "backoffice" : "owner",
    };
  }
  return await getBuilderStaffPermissionSnapshot(ctx, auth, {
    builderProfileId: auth.proposal.builderProfileId,
    proposalId: auth.proposal._id,
    action: "view",
    resourceType: "milestone",
    scope: "proposal",
  });
}

export async function activeBuildAppPermissionProjection(
  ctx: QueryCtx | MutationCtx,
  auth: {
    build: Doc<"activeBuilds">;
    email?: string;
    proposal: Doc<"buildProposals">;
    roles: RoleSlug[];
    subject: string;
  },
): Promise<BuilderStaffPermissionSnapshot> {
  return await getBuilderStaffPermissionSnapshot(ctx, auth, {
    buildId: auth.build._id,
    builderProfileId: auth.build.builderProfileId,
    proposalId: auth.proposal._id,
    action: "view",
    resourceType: "milestone",
    scope: "activeBuild",
  });
}

export function canUseAppPermission(
  permissions: BuilderStaffPermissionSnapshot,
  resourceType: BuilderStaffPermissionResource,
  action: BuilderStaffPermissionAction,
) {
  if (permissions.mode === "full") {
    return true;
  }
  const grant = permissions.grants.find(
    (candidate) => candidate.resourceType === resourceType,
  );
  return Boolean(grant?.[permissionFieldForAction(action)]);
}

export async function requireProposalAppPermission(
  ctx: QueryCtx | MutationCtx,
  auth: {
    email?: string;
    proposal: Doc<"buildProposals">;
    roles: RoleSlug[];
    subject: string;
  },
  resourceType: BuilderStaffPermissionResource,
  action: BuilderStaffPermissionAction,
) {
  if (!auth.proposal.builderProfileId) {
    if (isBackoffice(auth.roles)) {
      return;
    }
    throw new Error("Proposal is not assigned to a builder.");
  }
  await requireBuilderStaffPermission(ctx, auth, {
    builderProfileId: auth.proposal.builderProfileId,
    proposalId: auth.proposal._id,
    resourceType,
    action,
    scope: "proposal",
  });
}

export async function requireActiveBuildAppPermission(
  ctx: QueryCtx | MutationCtx,
  auth: {
    build: Doc<"activeBuilds">;
    email?: string;
    proposal: Doc<"buildProposals">;
    roles: RoleSlug[];
    subject: string;
  },
  resourceType: BuilderStaffPermissionResource,
  action: BuilderStaffPermissionAction,
) {
  await requireBuilderStaffPermission(ctx, auth, {
    buildId: auth.build._id,
    builderProfileId: auth.build.builderProfileId,
    proposalId: auth.proposal._id,
    resourceType,
    action,
    scope: "activeBuild",
  });
}

function permissionFieldForAction(action: BuilderStaffPermissionAction) {
  switch (action) {
    case "create":
      return "canCreate";
    case "view":
      return "canView";
    case "update":
      return "canUpdate";
    case "delete":
      return "canDelete";
  }
}

export function fullBuilderStaffPermissionGrants(): BuilderStaffPermissionSnapshot["grants"] {
  return BUILDER_STAFF_PERMISSION_RESOURCES.map((resourceType) => ({
    canCreate: true,
    canDelete: true,
    canUpdate: true,
    canView: true,
    resourceType,
  }));
}

export function lenderProposalReviewPermissionProjection(): BuilderStaffPermissionSnapshot {
  return {
    grants: BUILDER_STAFF_PERMISSION_RESOURCES.map((resourceType) => ({
      canCreate: false,
      canDelete: false,
      canUpdate: false,
      canView: true,
      resourceType,
    })),
    mode: "limited",
    role: "lender",
  };
}

export function normalizeBuilderStaffPermissionRows(
  rows: Array<Doc<"builderStaffPermissionGrants">>,
) {
  const byResource = new Map<
    BuilderStaffPermissionResource,
    {
      canCreate: boolean;
      canDelete: boolean;
      canUpdate: boolean;
      canView: boolean;
      resourceType: BuilderStaffPermissionResource;
    }
  >();
  for (const resourceType of BUILDER_STAFF_PERMISSION_RESOURCES) {
    byResource.set(resourceType, {
      canCreate: false,
      canDelete: false,
      canUpdate: false,
      canView: false,
      resourceType,
    });
  }
  for (const row of rows) {
    if (!isBuilderStaffPermissionResource(row.resourceType)) {
      continue;
    }
    byResource.set(row.resourceType, {
      canCreate: row.canCreate,
      canDelete: row.canDelete,
      canUpdate: row.canUpdate,
      canView: row.canView,
      resourceType: row.resourceType,
    });
  }
  return [...byResource.values()];
}

export function isBuilderStaffPermissionResource(
  value: string,
): value is BuilderStaffPermissionResource {
  return (BUILDER_STAFF_PERMISSION_RESOURCES as readonly string[]).includes(
    value,
  );
}

export async function getOwnedBuilderProfile(
  ctx: QueryCtx | MutationCtx,
  brokerageId: Id<"brokerages">,
  workosUserId: string,
) {
  const ownedBuilderProfiles = await getOwnedBuilderProfiles(
    ctx,
    brokerageId,
    workosUserId,
  );
  return ownedBuilderProfiles[0] ?? null;
}

export async function getOwnedBuilderProfiles(
  ctx: QueryCtx | MutationCtx,
  brokerageId: Id<"brokerages">,
  workosUserId: string,
) {
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_user", (q) => q.eq("workosUserId", workosUserId))
    .collect();
  const ownedBuilderProfiles: Doc<"builderProfiles">[] = [];
  const seenBuilderProfileIds = new Set<string>();

  for (const link of links) {
    if (link.status !== "active") {
      continue;
    }
    const builderProfile = await ctx.db.get(link.builderProfileId);
    if (
      !builderProfile ||
      builderProfile.brokerageId !== brokerageId ||
      builderProfile.status !== "active"
    ) {
      continue;
    }
    const builderProfileKey = String(builderProfile._id);
    if (seenBuilderProfileIds.has(builderProfileKey)) {
      continue;
    }
    seenBuilderProfileIds.add(builderProfileKey);
    ownedBuilderProfiles.push(builderProfile);
  }

  return ownedBuilderProfiles;
}

export async function getActiveOrganizationMembership(
  ctx: QueryCtx | MutationCtx,
  workosUserId: string,
  workosOrganizationId: string,
) {
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", workosUserId))
    .collect();
  return (
    memberships.find(
      (membership) =>
        membership.workosOrganizationId === workosOrganizationId &&
        membership.status === "active",
    ) ?? null
  );
}

export async function getWorkosUserById(
  ctx: QueryCtx | MutationCtx,
  workosUserId: string,
) {
  return await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", workosUserId))
    .first();
}

async function getWorkosUserByEmail(
  ctx: QueryCtx | MutationCtx,
  email: string,
) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const users = await ctx.db.query("users").collect();
  return (
    users
      .filter((user) => user.email.trim().toLowerCase() === normalized)
      .sort(workosUserEmailResolutionSort)[0] ?? null
  );
}

export async function getWorkosUserForBuilderAccountLink(
  ctx: QueryCtx | MutationCtx,
  link: Doc<"builderAccountLinks">,
) {
  const user = await getWorkosUserById(ctx, link.workosUserId);
  const assignedEmail = normalizeBuilderStaffAssignedEmail(link.assignedEmail);
  if (!assignedEmail) {
    return user;
  }
  const emailUser = await getWorkosUserByEmail(ctx, assignedEmail);
  if (!user) {
    return emailUser;
  }
  if (
    user.status === "deleted" &&
    emailUser &&
    emailUser.workosUserId !== user.workosUserId
  ) {
    return emailUser;
  }
  return user;
}

function workosUserEmailResolutionSort(
  left: Doc<"users">,
  right: Doc<"users">,
) {
  const leftDeleted = left.status === "deleted" ? 1 : 0;
  const rightDeleted = right.status === "deleted" ? 1 : 0;
  return (
    leftDeleted - rightDeleted ||
    (right.updatedAt ?? 0) - (left.updatedAt ?? 0) ||
    (right.createdAt ?? 0) - (left.createdAt ?? 0) ||
    String(right._id).localeCompare(String(left._id))
  );
}

export async function getActiveBuilderStaffAccountLinkByEmail(
  ctx: QueryCtx | MutationCtx,
  builderProfileId: Id<"builderProfiles">,
  email: string,
) {
  const assignedEmail = normalizeBuilderStaffAssignedEmail(email);
  if (!assignedEmail) {
    return null;
  }
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_assigned_email", (q) =>
      q
        .eq("builderProfileId", builderProfileId)
        .eq("assignedEmail", assignedEmail),
    )
    .collect();
  return (
    links
      .filter(
        (link) =>
          link.status === "active" &&
          link.role === "staff" &&
          link.assignedEmail === assignedEmail,
      )
      .sort(
        (left, right) =>
          left.createdAt - right.createdAt ||
          String(left._id).localeCompare(String(right._id)),
      )[0] ?? null
  );
}

export async function getActiveBuilderStaffAccountLinksByEmail(
  ctx: QueryCtx | MutationCtx,
  email: string,
) {
  const assignedEmail = normalizeBuilderStaffAssignedEmail(email);
  if (!assignedEmail) {
    return [];
  }
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_assigned_email", (q) => q.eq("assignedEmail", assignedEmail))
    .collect();
  return links
    .filter(
      (link) =>
        link.status === "active" &&
        link.role === "staff" &&
        link.assignedEmail === assignedEmail,
    )
    .sort(
      (left, right) =>
        left.createdAt - right.createdAt ||
        String(left._id).localeCompare(String(right._id)),
    );
}

async function getActiveBuilderAccountLinkForStaffViewer(
  ctx: QueryCtx | MutationCtx,
  builderProfileId: Id<"builderProfiles">,
  auth: {
    email?: string;
    subject: string;
  },
) {
  const direct = await getActiveBuilderAccountLink(
    ctx,
    builderProfileId,
    auth.subject,
  );
  if (direct) {
    return direct;
  }
  const email = await resolveBuilderStaffViewerEmail(ctx, auth);
  return email
    ? await getActiveBuilderStaffAccountLinkByEmail(
        ctx,
        builderProfileId,
        email,
      )
    : null;
}

export async function getActiveBuilderAccountLinkByProjectedUserEmail(
  ctx: QueryCtx | MutationCtx,
  input: {
    builderProfileId: Id<"builderProfiles">;
    workosUserId: string;
  },
) {
  const user = await getWorkosUserById(ctx, input.workosUserId);
  const email = normalizeBuilderStaffAssignedEmail(user?.email);
  return email
    ? await getActiveBuilderStaffAccountLinkByEmail(
        ctx,
        input.builderProfileId,
        email,
      )
    : null;
}

export async function resolveBuilderStaffViewerEmail(
  ctx: QueryCtx | MutationCtx,
  auth: {
    email?: string;
    subject: string;
  },
) {
  const identityEmail = normalizeBuilderStaffAssignedEmail(auth.email);
  if (identityEmail) {
    return identityEmail;
  }
  const user = await getWorkosUserById(ctx, auth.subject);
  return normalizeBuilderStaffAssignedEmail(user?.email);
}

export async function resolveBuilderStaffWorkosUserId(
  ctx: QueryCtx | MutationCtx,
  input: {
    allowPendingEmail?: boolean;
    staffEmail?: string;
    staffWorkosUserId?: string;
  },
) {
  const explicit = input.staffWorkosUserId?.trim();
  const email = input.staffEmail?.trim();
  if (email) {
    const user = await getWorkosUserByEmail(ctx, email);
    if (user?.workosUserId) {
      return user.workosUserId;
    }
  }
  if (explicit) {
    return explicit;
  }
  if (!email) {
    throw new Error("Staff email or WorkOS user ID is required.");
  }
  if (input.allowPendingEmail) {
    return pendingBuilderStaffWorkosUserId(email);
  }
  throw new Error("Use staff provisioning before assigning an unknown email.");
}

export function viewerFromBuilderStaffProvisionActor(actor: {
  organizationId?: string;
  roles: string[];
  subject: string;
}): AuthorizedViewer {
  return {
    capability: "authenticated",
    ...(actor.organizationId ? { organizationId: actor.organizationId } : {}),
    roles: normalizeRoleSlugs(actor.roles),
    subject: actor.subject,
    tokenIdentifier: `internal:${actor.subject}`,
  };
}

export function builderStaffDisplayName(email: string) {
  return email.split("@")[0] || email;
}

export function normalizeBuilderStaffEmail(value: string) {
  const trimmed = value.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@") || at === trimmed.length - 1) {
    return "";
  }
  if (!trimmed.slice(at + 1).includes(".")) {
    return "";
  }
  return trimmed;
}

export function normalizeBuilderStaffAssignedEmail(value?: string) {
  return value ? normalizeBuilderStaffEmail(value) || undefined : undefined;
}

export async function requireBuilderStaffManagementAllowed(
  ctx: QueryCtx | MutationCtx,
  auth: {
    roles: RoleSlug[];
    subject: string;
  },
  builderProfileId: Id<"builderProfiles">,
) {
  if (isBackoffice(auth.roles)) {
    return;
  }
  const link = await getActiveBuilderAccountLink(
    ctx,
    builderProfileId,
    auth.subject,
  );
  if (!link || link.role !== "owner") {
    throw new Error("Forbidden: builder staff management");
  }
  await assertBuilderAccountLinkNotDeleted(ctx, link, builderProfileId);
}
