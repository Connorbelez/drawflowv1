/**
 * Production proposals builder staff persistence bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type RoleSlug } from "../authz";
import { isPendingBuilderStaffWorkosUserId } from "../builderStaffIdentity";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { getActiveBuilderAccountLink, builderAccountLinkWorkosState } from "./authorization_core.js";
import { type BuilderStaffPermissionResource, type BuilderStaffPermissionScope, fullBuilderStaffPermissionGrants, normalizeBuilderStaffPermissionRows, getActiveBuilderStaffAccountLinkByEmail, getActiveBuilderAccountLinkByProjectedUserEmail, resolveBuilderStaffWorkosUserId, builderStaffDisplayName, normalizeBuilderStaffAssignedEmail } from "./builder_staff_access.js";
import { normalizeOptionalString } from "./contractor_policy_helpers.js";
import { BUILDER_STAFF_PERMISSION_RESOURCES, BUILDER_STAFF_PERMISSION_ACTIONS } from "./contracts_foundation.js";
import { normalizeBuilderStaffPermissionInput, builderAccountRoleRank, canonicalBuilderAccountLinks, isBackoffice } from "./proposal_claim.js";
import { ensureBuilderAccountLink } from "./seed_foundation.js";
import { builderStaffGrantHasAnyCapability } from "./storage_helpers.js";

export async function buildStaffPermissionDirectory(
  ctx: QueryCtx | MutationCtx,
  input: {
    auth: {
      roles: RoleSlug[];
      subject: string;
    };
    buildId?: Id<"activeBuilds">;
    builderProfileId: Id<"builderProfiles">;
    proposalId: Id<"buildProposals">;
    scope: BuilderStaffPermissionScope;
    workosOrganizationId: string;
  },
) {
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder", (q) =>
      q.eq("builderProfileId", input.builderProfileId),
    )
    .collect();
  const activeLinks = links.filter((link) => link.status === "active");
  const { canonicalLinkIdById, links: canonicalActiveLinks } =
    canonicalBuilderAccountLinks(activeLinks);
  const permissionRows =
    input.scope === "proposal"
      ? await ctx.db
          .query("builderStaffPermissionGrants")
          .withIndex("by_builder", (q) =>
            q.eq("builderProfileId", input.builderProfileId),
          )
          .filter((q) =>
            q.and(
              q.eq(q.field("scope"), "proposal"),
              q.eq(q.field("proposalId"), input.proposalId),
            ),
          )
          .collect()
      : await ctx.db
          .query("builderStaffPermissionGrants")
          .withIndex("by_builder", (q) =>
            q.eq("builderProfileId", input.builderProfileId),
          )
          .filter((q) =>
            q.and(
              q.eq(q.field("scope"), "activeBuild"),
              q.eq(q.field("buildId"), input.buildId),
            ),
          )
          .collect();
  const rowsByLink = new Map<string, Doc<"builderStaffPermissionGrants">[]>();
  for (const row of permissionRows) {
    const key =
      canonicalLinkIdById.get(String(row.builderAccountLinkId)) ??
      String(row.builderAccountLinkId);
    const list = rowsByLink.get(key) ?? [];
    list.push(row);
    rowsByLink.set(key, list);
  }

  const staff = [];
  for (const link of canonicalActiveLinks.sort(
    (a, b) => builderAccountRoleRank(a.role) - builderAccountRoleRank(b.role),
  )) {
    const workosState = await builderAccountLinkWorkosState(ctx, {
      link,
      workosOrganizationId: input.workosOrganizationId,
    });
    if (workosState.hidden) {
      continue;
    }
    const user = workosState.user;
    const role = link.role;
    const assignedEmail = normalizeOptionalString(link.assignedEmail);
    const displayEmail = user?.email ?? assignedEmail;
    staff.push({
      builderAccountLinkId: link._id,
      email: displayEmail,
      identityStatus: workosState.identityStatus,
      mode: role === "owner" ? "full" : "limited",
      name:
        user?.name ??
        (assignedEmail ? builderStaffDisplayName(assignedEmail) : undefined),
      permissions:
        role === "owner"
          ? fullBuilderStaffPermissionGrants()
          : normalizeBuilderStaffPermissionRows(
              rowsByLink.get(String(link._id)) ?? [],
            ),
      role,
      status: link.status,
      workosMembershipId:
        link.workosMembershipId ?? workosState.membership?.workosMembershipId,
      workosUserId: link.workosUserId,
    });
  }

  return {
    canManage: isBackoffice(input.auth.roles)
      ? true
      : Boolean(
          (
            await getActiveBuilderAccountLink(
              ctx,
              input.builderProfileId,
              input.auth.subject,
            )
          )?.role === "owner",
        ),
    resources: BUILDER_STAFF_PERMISSION_RESOURCES,
    actions: BUILDER_STAFF_PERMISSION_ACTIONS,
    scope: input.scope,
    staff,
  };
}

export async function saveBuilderStaffPermissionScope(
  ctx: MutationCtx,
  input: {
    allowPendingEmail?: boolean;
    auth: {
      brokerage: Doc<"brokerages">;
      roles: RoleSlug[];
      subject: string;
    };
    buildId?: Id<"activeBuilds">;
    builderProfileId: Id<"builderProfiles">;
    permissions: Array<{
      canCreate: boolean;
      canDelete: boolean;
      canUpdate: boolean;
      canView: boolean;
      resourceType: BuilderStaffPermissionResource;
    }>;
    proposalId: Id<"buildProposals">;
    scope: BuilderStaffPermissionScope;
    staffEmail?: string;
    staffWorkosUserId?: string;
    workosMembershipId?: string;
    workosOrganizationId: string;
  },
) {
  const requestedStaffWorkosUserId = await resolveBuilderStaffWorkosUserId(
    ctx,
    input,
  );
  const assignedEmail = normalizeBuilderStaffAssignedEmail(input.staffEmail);
  const workosMembershipId = normalizeOptionalString(input.workosMembershipId);
  const existingByUser = await getActiveBuilderAccountLink(
    ctx,
    input.builderProfileId,
    requestedStaffWorkosUserId,
  );
  const existingByEmail = assignedEmail
    ? await getActiveBuilderStaffAccountLinkByEmail(
        ctx,
        input.builderProfileId,
        assignedEmail,
      )
    : null;
  if (existingByUser?.role === "owner" || existingByEmail?.role === "owner") {
    throw new Error("Builder owners have full access and cannot be limited.");
  }
  const now = Date.now();
  if (
    existingByEmail &&
    existingByUser &&
    existingByEmail._id !== existingByUser._id
  ) {
    await mergeBuilderStaffAccountLinks(ctx, {
      duplicate: existingByUser,
      now,
      primary: existingByEmail,
      updatedByWorkosUserId: input.auth.subject,
    });
  }
  const existingLink = existingByEmail ?? existingByUser;
  if (existingLink?.role === "owner") {
    throw new Error("Builder owners have full access and cannot be limited.");
  }
  let staffWorkosUserId = requestedStaffWorkosUserId;
  if (existingLink) {
    if (
      isPendingBuilderStaffWorkosUserId(requestedStaffWorkosUserId) ||
      !isPendingBuilderStaffWorkosUserId(existingLink.workosUserId)
    ) {
      staffWorkosUserId = existingLink.workosUserId;
    }
    const linkPatch: Partial<
      Pick<
        Doc<"builderAccountLinks">,
        "assignedEmail" | "updatedAt" | "workosMembershipId" | "workosUserId"
      >
    > = {};
    if (assignedEmail && assignedEmail !== existingLink.assignedEmail) {
      linkPatch.assignedEmail = assignedEmail;
    }
    if (
      workosMembershipId &&
      workosMembershipId !== existingLink.workosMembershipId
    ) {
      linkPatch.workosMembershipId = workosMembershipId;
    }
    if (
      !isPendingBuilderStaffWorkosUserId(requestedStaffWorkosUserId) &&
      requestedStaffWorkosUserId !== existingLink.workosUserId
    ) {
      linkPatch.workosUserId = requestedStaffWorkosUserId;
      staffWorkosUserId = requestedStaffWorkosUserId;
    }
    if (Object.keys(linkPatch).length > 0) {
      await ctx.db.patch(existingLink._id, {
        ...linkPatch,
        updatedAt: now,
      });
      if (linkPatch.workosUserId) {
        await syncBuilderStaffGrantWorkosUserId(ctx, {
          builderAccountLinkId: existingLink._id,
          now,
          updatedByWorkosUserId: input.auth.subject,
          workosUserId: linkPatch.workosUserId,
        });
      }
    }
  }
  const builderAccountLinkId =
    existingLink?._id ??
    (await ensureBuilderAccountLink(ctx, {
      brokerageId: input.auth.brokerage._id,
      builderProfileId: input.builderProfileId,
      now,
      role: "staff",
      assignedEmail,
      workosMembershipId,
      workosUserId: staffWorkosUserId,
    }));
  const normalizedPermissions = normalizeBuilderStaffPermissionInput(
    input.permissions,
  );
  const existingScopeRows = existingLink
    ? await collectScopedBuilderStaffPermissionRows(ctx, {
        buildId: input.buildId,
        builderAccountLinkId,
        proposalId: input.proposalId,
        scope: input.scope,
      })
    : [];
  if (
    existingLink &&
    input.staffEmail &&
    !normalizedPermissions.some(builderStaffGrantHasAnyCapability) &&
    existingScopeRows.some(builderStaffGrantHasAnyCapability)
  ) {
    return staffWorkosUserId;
  }
  for (const permission of normalizedPermissions) {
    const existing =
      input.scope === "proposal"
        ? await ctx.db
            .query("builderStaffPermissionGrants")
            .withIndex("by_proposal_link_resource", (q) =>
              q
                .eq("proposalId", input.proposalId)
                .eq("builderAccountLinkId", builderAccountLinkId)
                .eq("resourceType", permission.resourceType),
            )
            .unique()
        : await ctx.db
            .query("builderStaffPermissionGrants")
            .withIndex("by_build_link_resource", (q) =>
              q
                .eq("buildId", input.buildId)
                .eq("builderAccountLinkId", builderAccountLinkId)
                .eq("resourceType", permission.resourceType),
            )
            .unique();
    const patch = {
      canCreate: permission.canCreate,
      canDelete: permission.canDelete,
      canUpdate: permission.canUpdate,
      canView: permission.canView,
      updatedAt: now,
      updatedByWorkosUserId: input.auth.subject,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      continue;
    }
    await ctx.db.insert("builderStaffPermissionGrants", {
      ...patch,
      brokerageId: input.auth.brokerage._id,
      buildId: input.buildId,
      builderAccountLinkId,
      builderProfileId: input.builderProfileId,
      createdAt: now,
      createdByWorkosUserId: input.auth.subject,
      organizationId: input.workosOrganizationId,
      proposalId: input.proposalId,
      resourceType: permission.resourceType,
      scope: input.scope,
      workosUserId: staffWorkosUserId,
    });
  }
  return staffWorkosUserId;
}

async function mergeBuilderStaffAccountLinks(
  ctx: MutationCtx,
  input: {
    duplicate: Doc<"builderAccountLinks">;
    now: number;
    primary: Doc<"builderAccountLinks">;
    updatedByWorkosUserId: string;
  },
) {
  const duplicateGrants = await ctx.db
    .query("builderStaffPermissionGrants")
    .withIndex("by_link", (q) =>
      q.eq("builderAccountLinkId", input.duplicate._id),
    )
    .collect();
  for (const duplicateGrant of duplicateGrants) {
    const primaryGrant =
      duplicateGrant.scope === "proposal"
        ? await ctx.db
            .query("builderStaffPermissionGrants")
            .withIndex("by_proposal_link_resource", (q) =>
              q
                .eq("proposalId", duplicateGrant.proposalId)
                .eq("builderAccountLinkId", input.primary._id)
                .eq("resourceType", duplicateGrant.resourceType),
            )
            .unique()
        : await ctx.db
            .query("builderStaffPermissionGrants")
            .withIndex("by_build_link_resource", (q) =>
              q
                .eq("buildId", duplicateGrant.buildId)
                .eq("builderAccountLinkId", input.primary._id)
                .eq("resourceType", duplicateGrant.resourceType),
            )
            .unique();
    if (primaryGrant) {
      await ctx.db.patch(primaryGrant._id, {
        canCreate: primaryGrant.canCreate || duplicateGrant.canCreate,
        canDelete: primaryGrant.canDelete || duplicateGrant.canDelete,
        canUpdate: primaryGrant.canUpdate || duplicateGrant.canUpdate,
        canView: primaryGrant.canView || duplicateGrant.canView,
        updatedAt: input.now,
        updatedByWorkosUserId: input.updatedByWorkosUserId,
      });
      await ctx.db.delete(duplicateGrant._id);
      continue;
    }
    await ctx.db.patch(duplicateGrant._id, {
      builderAccountLinkId: input.primary._id,
      updatedAt: input.now,
      updatedByWorkosUserId: input.updatedByWorkosUserId,
      workosUserId: input.primary.workosUserId,
    });
  }
  await ctx.db.patch(input.duplicate._id, {
    status: "inactive",
    updatedAt: input.now,
  });
}

async function syncBuilderStaffGrantWorkosUserId(
  ctx: MutationCtx,
  input: {
    builderAccountLinkId: Id<"builderAccountLinks">;
    now: number;
    updatedByWorkosUserId: string;
    workosUserId: string;
  },
) {
  const grants = await ctx.db
    .query("builderStaffPermissionGrants")
    .withIndex("by_link", (q) =>
      q.eq("builderAccountLinkId", input.builderAccountLinkId),
    )
    .collect();
  for (const grant of grants) {
    if (grant.workosUserId === input.workosUserId) {
      continue;
    }
    await ctx.db.patch(grant._id, {
      updatedAt: input.now,
      updatedByWorkosUserId: input.updatedByWorkosUserId,
      workosUserId: input.workosUserId,
    });
  }
}

async function collectScopedBuilderStaffPermissionRows(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId?: Id<"activeBuilds">;
    builderAccountLinkId: Id<"builderAccountLinks">;
    proposalId: Id<"buildProposals">;
    scope: BuilderStaffPermissionScope;
  },
) {
  const rows = await ctx.db
    .query("builderStaffPermissionGrants")
    .withIndex("by_link", (q) =>
      q.eq("builderAccountLinkId", input.builderAccountLinkId),
    )
    .collect();
  return rows.filter((row) =>
    input.scope === "proposal"
      ? row.scope === "proposal" && row.proposalId === input.proposalId
      : row.scope === "activeBuild" && row.buildId === input.buildId,
  );
}

export async function removeBuilderStaffMember(
  ctx: MutationCtx,
  input: {
    auth: {
      subject: string;
    };
    builderProfileId: Id<"builderProfiles">;
    staffWorkosUserId: string;
  },
) {
  if (input.auth.subject === input.staffWorkosUserId) {
    throw new Error("You cannot remove your own builder account.");
  }
  const directLink = await getActiveBuilderAccountLink(
    ctx,
    input.builderProfileId,
    input.staffWorkosUserId,
  );
  const link =
    directLink ??
    (await getActiveBuilderAccountLinkByProjectedUserEmail(ctx, {
      builderProfileId: input.builderProfileId,
      workosUserId: input.staffWorkosUserId,
    }));
  if (!link) {
    return;
  }
  if (link.role === "owner") {
    throw new Error("Builder owner accounts cannot be removed here.");
  }
  const now = Date.now();
  await ctx.db.patch(link._id, {
    status: "inactive",
    updatedAt: now,
  });
  const grants = await ctx.db
    .query("builderStaffPermissionGrants")
    .withIndex("by_link", (q) => q.eq("builderAccountLinkId", link._id))
    .collect();
  for (const grant of grants) {
    await ctx.db.delete(grant._id);
  }
}
