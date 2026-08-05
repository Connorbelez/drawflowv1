import { authorizeActiveBuildAccessForViewer } from "./activeBuildAccess";
import { normalizeRoleSlugs } from "./authz";
import {
  BUILD_COLLABORATION_UNAVAILABLE_ERROR,
  requireActiveBuildCollaborationTenant,
} from "./build_collaboration_rollout";
import { buildCollaborationValidationError } from "./build_collaboration_validation";
import type { Id, MutationCtx, QueryCtx } from "./types";

export async function authorizeBuildCollaborationRecipient(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    organizationId: string;
    workosUserId: string;
  }
) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (query) =>
      query.eq("workosUserId", input.workosUserId)
    )
    .unique();
  if (!user || user.status === "deleted") {
    throw buildCollaborationValidationError(
      "Recipient identity is unavailable."
    );
  }
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user_and_organization", (query) =>
      query
        .eq("workosUserId", input.workosUserId)
        .eq("workosOrganizationId", input.organizationId)
    )
    .first();
  const membershipActive = membership?.status === "active";
  const viewer = {
    actorKind: "human" as const,
    capability: "authenticated" as const,
    email: user.email,
    organizationId: membershipActive ? input.organizationId : undefined,
    roles: membershipActive
      ? normalizeRoleSlugs([
          membership.roleSlug,
          ...(membership.roleSlugs ?? []),
        ])
      : [],
    subject: input.workosUserId,
    tokenIdentifier: `delivery:${input.workosUserId}`,
  };
  let authorization: Awaited<
    ReturnType<typeof authorizeActiveBuildAccessForViewer>
  >;
  try {
    authorization = await authorizeActiveBuildAccessForViewer(ctx, viewer, {
      buildId: input.buildId,
      organizationId: input.organizationId,
    });
    await requireActiveBuildCollaborationTenant(ctx, authorization);
  } catch (error) {
    const message = recipientAuthorizationErrorMessage(error);
    if (
      message === "Organization is required." ||
      message === BUILD_COLLABORATION_UNAVAILABLE_ERROR ||
      message.startsWith("Forbidden:")
    ) {
      throw buildCollaborationValidationError(message);
    }
    throw error;
  }
  return { authorization, user };
}

function recipientAuthorizationErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
}
