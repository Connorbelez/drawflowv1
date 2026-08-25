import { ConvexError } from "convex/values";

import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

export async function hasActiveBuildRetentionHold(
  ctx: QueryCtx | MutationCtx,
  input: { buildId: Id<"activeBuilds">; organizationId: string }
) {
  const build = await ctx.db.get(input.buildId);
  if (!build || build.organizationId !== input.organizationId) {
    return true;
  }
  const hold = await ctx.db
    .query("buildCollaborationLegalHolds")
    .withIndex("by_buildId_and_state", (query) =>
      query.eq("buildId", input.buildId).eq("state", "active")
    )
    .unique();
  return Boolean(
    hold &&
      hold.organizationId === build.organizationId &&
      hold.brokerageId === build.brokerageId
  );
}

export async function assertRetentionDeletionAllowed(
  ctx: QueryCtx | MutationCtx,
  build: Doc<"activeBuilds">
) {
  if (
    await hasActiveBuildRetentionHold(ctx, {
      buildId: build._id,
      organizationId: build.organizationId,
    })
  ) {
    throw new ConvexError("Active legal hold blocks physical data deletion.");
  }
}

/** Guard used by Cost/Quote write boundaries after service cancellation. */
export async function assertOrganizationRetentionWritable(
  ctx: QueryCtx | MutationCtx,
  organizationId: string
) {
  if (await isOrganizationInRestrictedArchive(ctx, organizationId)) {
    throw new ConvexError(
      "This organization is in restricted archive; canonical records are read-only."
    );
  }
}

export async function isOrganizationInRestrictedArchive(
  ctx: QueryCtx | MutationCtx,
  organizationId: string
) {
  const setting = await ctx.db
    .query("buildCollaborationTenantSettings")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", organizationId)
    )
    .unique();
  return setting?.serviceLifecycle === "restricted_archive";
}
