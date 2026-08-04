import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import {
  authenticatedMutation,
  authenticatedQuery,
} from "./authz";
import {
  authorizeActiveBuildHumanCollaborationAccess,
} from "./build_collaboration_actor";
import {
  canReadCollaborationPost,
} from "./build_collaboration_access";
import { isBuildCollaborationWritableByBuildId } from "./build_collaboration_lifecycle_state";
import { isDrawSystemPost } from "./build_collaboration_system_event_access";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import type { BuildCollaborationRole } from "./build_collaboration_model";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

/**
 * Draw System Posts retain their canonical Draw read ACL. This module owns the
 * separate ACL for ordinary coordination children: the viewer must be an
 * active WorkOS organization member and be involved in this Build (with
 * admin/principal-broker retained as silent oversight roles).
 */
export async function hasActiveWorkosOrganizationMembership(
  ctx: QueryCtx | MutationCtx,
  input: { organizationId: string; workosUserId: string },
) {
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user_and_organization", (query) =>
      query
        .eq("workosUserId", input.workosUserId)
        .eq("workosOrganizationId", input.organizationId),
    )
    .first();
  return membership?.status === "active";
}

/**
 * Resolve current Build involvement without treating a stale implicit
 * assignment as active after an explicit participation removal.
 */
export async function hasCurrentBuildInvolvement(
  ctx: QueryCtx | MutationCtx,
  input: { buildId: Id<"activeBuilds">; workosUserId: string },
) {
  const build = await ctx.db.get(input.buildId);
  if (!build) return false;
  const latestParticipation = await ctx.db
    .query("buildParticipants")
    .withIndex("by_buildId_and_workosUserId_and_participationPeriod", (query) =>
      query
        .eq("buildId", input.buildId)
        .eq("workosUserId", input.workosUserId),
    )
    .order("desc")
    .first();
  if (latestParticipation) {
    return latestParticipation.status === "active";
  }

  const proposal = await ctx.db.get(build.proposalId);
  if (proposal?.assignedBrokerWorkosUserId === input.workosUserId) {
    return true;
  }
  const brokerAssignments = await ctx.db
    .query("buildBrokerAssignments")
    .withIndex("by_build", (query) => query.eq("buildId", input.buildId))
    .take(100);
  if (
    brokerAssignments.some(
      (assignment) =>
        assignment.assignedBrokerWorkosUserId === input.workosUserId,
    )
  ) {
    return true;
  }
  const builderLinks = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (query) =>
      query
        .eq("builderProfileId", build.builderProfileId)
        .eq("workosUserId", input.workosUserId),
    )
    .take(20);
  if (builderLinks.some((link) => link.status === "active")) {
    return true;
  }
  const contractors = await ctx.db
    .query("contractorProfiles")
    .withIndex("by_account_user", (query) =>
      query.eq("accountWorkosUserId", input.workosUserId),
    )
    .take(20);
  for (const contractor of contractors) {
    const assignment = await ctx.db
      .query("buildContractorAssignments")
      .withIndex("by_build_contractor", (query) =>
        query
          .eq("buildId", input.buildId)
          .eq("contractorId", contractor._id),
      )
      .first();
    if (assignment && assignment.status !== "inactive") return true;
  }
  return false;
}

export async function isInternalDrawCoordinationEligible(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    organizationId: string;
    role: BuildCollaborationRole;
    workosUserId: string;
  },
) {
  if (input.role === "contractor" || input.role === "homeowner") {
    return false;
  }
  if (
    !(await hasActiveWorkosOrganizationMembership(ctx, {
      organizationId: input.organizationId,
      workosUserId: input.workosUserId,
    }))
  ) {
    return false;
  }
  // Admin and principal-broker are explicit oversight roles. They can inspect
  // internal coordination without being silently enrolled in the working
  // audience; other roles need current Build involvement.
  if (input.role === "admin" || input.role === "principle-broker") {
    return true;
  }
  return await hasCurrentBuildInvolvement(ctx, input);
}

export async function canReadDrawCoordination(
  ctx: QueryCtx | MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    post: Doc<"buildCollaborationPosts">;
  },
) {
  const { authorization, post } = input;
  if (
    post.organizationId !== authorization.organizationId ||
    post.buildId !== authorization.build._id ||
    !isDrawSystemPost(post)
  ) {
    return false;
  }
  if (!(await canReadCollaborationPost(ctx, authorization, post))) {
    return false;
  }
  return await isInternalDrawCoordinationEligible(ctx, {
    buildId: authorization.build._id,
    organizationId: authorization.organizationId,
    role: authorization.effectiveRole.role,
    workosUserId: authorization.viewer.subject,
  });
}

/** Readers for ordinary Draw coordination work. This deliberately excludes
 * globally Draw-authorized external participants and never enrolls anyone in
 * coordination merely because they are a reader. */
export async function resolveCurrentDrawCoordinationReaderIds(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  post: Doc<"buildCollaborationPosts">,
) {
  if (!(await canReadDrawCoordination(ctx, { authorization, post }))) {
    return [];
  }
  const eligible = await Promise.all(
    authorization.participants.map(async (participant) =>
      (await isInternalDrawCoordinationEligible(ctx, {
        buildId: authorization.build._id,
        organizationId: authorization.organizationId,
        role: participant.role,
        workosUserId: participant.workosUserId,
      }))
        ? participant.workosUserId
        : null,
    ),
  );
  return eligible.filter((id): id is string => id !== null);
}

export async function isDrawCoordinationMember(
  ctx: QueryCtx | MutationCtx,
  input: { postId: Id<"buildCollaborationPosts">; workosUserId: string },
) {
  const row = await ctx.db
    .query("buildCollaborationFollows")
    .withIndex("by_postId_and_workosUserId", (query) =>
      query
        .eq("postId", input.postId)
        .eq("workosUserId", input.workosUserId),
    )
    .unique();
  return row?.coordinationActive === true;
}

export async function projectDrawCoordinationState(
  ctx: QueryCtx | MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    post: Doc<"buildCollaborationPosts">;
  },
) {
  const { authorization, post } = input;
  if (!(await canReadDrawCoordination(ctx, input))) {
    return {
      canJoin: false,
      canLeave: false,
      eligible: false,
      joined: false,
      oversight: false,
      workingAudienceCount: 0,
    };
  }
  const joined = await isDrawCoordinationMember(ctx, {
    postId: post._id,
    workosUserId: authorization.viewer.subject,
  });
  const rows = await ctx.db
    .query("buildCollaborationFollows")
    .withIndex("by_postId_and_coordinationActive", (query) =>
      query.eq("postId", post._id).eq("coordinationActive", true),
    )
    .take(100);
  let workingAudienceCount = 0;
  for (const row of rows) {
    if (
      await isInternalDrawCoordinationEligible(ctx, {
        buildId: authorization.build._id,
        organizationId: authorization.organizationId,
        role: await roleForUser(ctx, authorization, row.workosUserId),
        workosUserId: row.workosUserId,
      })
    ) {
      workingAudienceCount += 1;
    }
  }
  const writable = await isBuildCollaborationWritableByBuildId(ctx, {
    buildId: authorization.build._id,
    organizationId: authorization.organizationId,
  });
  return {
    canJoin: writable && !joined,
    canLeave: writable && joined,
    eligible: true,
    joined,
    oversight:
      !joined &&
      (authorization.effectiveRole.role === "admin" ||
        authorization.effectiveRole.role === "principle-broker"),
    workingAudienceCount,
  };
}

async function roleForUser(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  workosUserId: string,
): Promise<BuildCollaborationRole> {
  if (workosUserId === authorization.viewer.subject) {
    return authorization.effectiveRole.role;
  }
  const participant = authorization.participants.find(
    (candidate) => candidate.workosUserId === workosUserId,
  );
  if (participant) return participant.role;
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user_and_organization", (query) =>
      query
        .eq("workosUserId", workosUserId)
        .eq("workosOrganizationId", authorization.organizationId),
    )
    .first();
  const role = membership?.roleSlug ?? membership?.roleSlugs?.[0];
  if (
    role === "admin" ||
    role === "principle-broker" ||
    role === "broker" ||
    role === "broker-staff" ||
    role === "builder" ||
    role === "builder-staff" ||
    role === "contractor" ||
    role === "homeowner"
  ) {
    return role;
  }
  return "builder-staff";
}

async function requireDrawCoordinationPost(
  ctx: MutationCtx | QueryCtx,
  authorization: ActiveBuildAuthorization,
  postId: Id<"buildCollaborationPosts">,
) {
  const post = await ctx.db.get(postId);
  if (
    !post ||
    !(await canReadDrawCoordination(ctx, { authorization, post }))
  ) {
    throw new Error("Forbidden: Draw coordination");
  }
  return post;
}

export const joinDrawCoordination = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
  })
  .returns(v.boolean())
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args,
    );
    const post = await requireDrawCoordinationPost(
      ctx,
      authorization,
      args.postId,
    );
    const existing = await ctx.db
      .query("buildCollaborationFollows")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query
          .eq("postId", post._id)
          .eq("workosUserId", authorization.viewer.subject),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        coordinationActive: true,
        coordinationJoinedAt: now,
        coordinationJoinedByWorkosUserId: authorization.viewer.subject,
        coordinationLeftAt: undefined,
        coordinationLeftByWorkosUserId: undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("buildCollaborationFollows", {
        active: false,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        coordinationActive: true,
        coordinationJoinedAt: now,
        coordinationJoinedByWorkosUserId: authorization.viewer.subject,
        createdAt: now,
        organizationId: authorization.organizationId,
        postId: post._id,
        reason: "manual",
        updatedAt: now,
        workosUserId: authorization.viewer.subject,
      });
    }
    await ctx.db.insert("auditEvents", {
      actorRoles: authorization.roles,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      command: "joinDrawCoordination",
      createdAt: now,
      entityId: post._id,
      entityType: "buildCollaborationPost",
      eventType: "build.collaboration.draw_coordination.joined",
      newState: JSON.stringify({ coordinationActive: true, postId: post._id }),
      organizationId: authorization.organizationId,
      warnings: ["coordination_only"],
    });
    return true;
  })
  .public();

export const leaveDrawCoordination = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
  })
  .returns(v.boolean())
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args,
    );
    const post = await requireDrawCoordinationPost(
      ctx,
      authorization,
      args.postId,
    );
    const existing = await ctx.db
      .query("buildCollaborationFollows")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query
          .eq("postId", post._id)
          .eq("workosUserId", authorization.viewer.subject),
      )
      .unique();
    if (!existing?.coordinationActive) return false;
    const now = Date.now();
    await ctx.db.patch(existing._id, {
      coordinationActive: false,
      coordinationLeftAt: now,
      coordinationLeftByWorkosUserId: authorization.viewer.subject,
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      actorRoles: authorization.roles,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      command: "leaveDrawCoordination",
      createdAt: now,
      entityId: post._id,
      entityType: "buildCollaborationPost",
      eventType: "build.collaboration.draw_coordination.left",
      newState: JSON.stringify({ coordinationActive: false, postId: post._id }),
      organizationId: authorization.organizationId,
      warnings: ["coordination_only"],
    });
    return false;
  })
  .public();

export const getDrawCoordinationState = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
  })
  .returns(
    v.object({
      canJoin: v.boolean(),
      canLeave: v.boolean(),
      eligible: v.boolean(),
      joined: v.boolean(),
      oversight: v.boolean(),
      workingAudienceCount: v.number(),
    }),
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args,
    );
    const post = await ctx.db.get(args.postId);
    if (
      !post ||
      post.organizationId !== authorization.organizationId ||
      post.buildId !== authorization.build._id ||
      !isDrawSystemPost(post) ||
      !(await canReadCollaborationPost(ctx, authorization, post))
    ) {
      return {
        canJoin: false,
        canLeave: false,
        eligible: false,
        joined: false,
        oversight: false,
        workingAudienceCount: 0,
      };
    }
    return await projectDrawCoordinationState(ctx, { authorization, post });
  })
  .public();
