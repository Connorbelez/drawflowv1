import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { normalizeRoleSlugs } from "./authz";
import { collaborationRoleTier } from "./build_collaboration_model";
import {
  canReadDrawSystemEvent,
  isDrawSystemPost,
} from "./build_collaboration_system_event_access";
import type { Doc, QueryCtx } from "./types";

export async function canReadCollaborationPost(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  post: Doc<"buildCollaborationPosts">
) {
  if (
    post.organizationId !== authorization.organizationId ||
    post.buildId !== authorization.build._id
  ) {
    return false;
  }
  if (
    isDrawSystemPost(post) &&
    !(await canReadDrawSystemEvent(ctx, {
      buildId: authorization.build._id,
      role: authorization.effectiveRole.role,
      workosUserId: authorization.viewer.subject,
    }))
  ) {
    return false;
  }
  if (authorization.effectiveRole.tier >= post.audienceFloorTier) {
    return true;
  }
  if (post.audienceMode === "build_wide") {
    return true;
  }
  const member = await ctx.db
    .query("buildCollaborationAudienceMembers")
    .withIndex("by_postId_and_workosUserId", (query) =>
      query
        .eq("postId", post._id)
        .eq("workosUserId", authorization.viewer.subject)
    )
    .unique();
  return Boolean(member);
}

export async function resolveCurrentCollaborationPostReaderIds(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  post: Doc<"buildCollaborationPosts">
) {
  const fixedMembers =
    post.audienceMode === "custom"
      ? await ctx.db
          .query("buildCollaborationAudienceMembers")
          .withIndex("by_postId_and_workosUserId", (query) =>
            query.eq("postId", post._id)
          )
          .take(500)
      : [];
  const fixedMemberIds = new Set(
    fixedMembers.map((member) => member.workosUserId)
  );
  const audienceReaders = authorization.participants.filter(
    (participant) =>
      post.audienceMode === "build_wide" ||
      collaborationRoleTier(participant.role) >= post.audienceFloorTier ||
      fixedMemberIds.has(participant.workosUserId),
  );
  if (!isDrawSystemPost(post)) {
    return audienceReaders.map((participant) => participant.workosUserId);
  }
  const readerDecisions = await Promise.all(
    audienceReaders.map(async (participant) => ({
      allowed: await canReadDrawSystemEvent(ctx, {
        buildId: authorization.build._id,
        role: participant.role,
        workosUserId: participant.workosUserId,
      }),
      participant,
    })),
  );
  return readerDecisions
    .filter((decision) => decision.allowed)
    .map((decision) => decision.participant.workosUserId);
}

export async function resolveCurrentCollaborationNotificationReaderIds(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  post: Doc<"buildCollaborationPosts">
) {
  const readerIds = await resolveCurrentCollaborationPostReaderIds(
    ctx,
    authorization,
    post
  );
  if (
    post.authorWorkosUserId &&
    (post.authorRole === "admin" || post.authorRole === "principle-broker") &&
    (await hasCurrentGlobalCollaborationRole(
      ctx,
      authorization.organizationId,
      post.authorWorkosUserId
    )) &&
    !readerIds.includes(post.authorWorkosUserId)
  ) {
    readerIds.push(post.authorWorkosUserId);
  }
  return readerIds;
}

async function hasCurrentGlobalCollaborationRole(
  ctx: QueryCtx,
  organizationId: string,
  workosUserId: string
) {
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user_and_organization", (query) =>
      query
        .eq("workosUserId", workosUserId)
        .eq("workosOrganizationId", organizationId)
    )
    .first();
  if (membership?.status !== "active") {
    return false;
  }
  const roles = normalizeRoleSlugs([
    membership.roleSlug,
    ...membership.roleSlugs,
  ]);
  return roles.includes("admin") || roles.includes("principle-broker");
}

export function canSeeCollaborationReceipt(
  authorization: ActiveBuildAuthorization,
  receipt: Pick<
    Doc<"buildCollaborationReceipts">,
    "viewerRole" | "workosUserId"
  >
) {
  return (
    receipt.workosUserId !== authorization.viewer.subject &&
    receipt.viewerRole !== "admin" &&
    authorization.effectiveRole.tier >= roleTierForReceipt(receipt.viewerRole)
  );
}

function roleTierForReceipt(
  role: Doc<"buildCollaborationReceipts">["viewerRole"]
) {
  switch (role) {
    case "admin":
      return 5;
    case "principle-broker":
      return 4;
    case "broker":
    case "builder":
    case "broker-staff":
      return 3;
    case "builder-staff":
    case "homeowner":
      return 2;
    case "contractor":
      return 1;
  }
}
