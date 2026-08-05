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

type WorkosOrganizationMembership = Doc<"workosOrganizationMemberships">;

interface DrawCoordinationInvolvementContext {
  build: Doc<"activeBuilds">;
  proposal: Doc<"buildProposals">;
  latestParticipationByUser: ReadonlyMap<
    string,
    Doc<"buildParticipants"> | null
  >;
  brokerAssignmentByUser: ReadonlyMap<
    string,
    Doc<"buildBrokerAssignments"> | null
  >;
  hasActiveBuilderLinkByUser: ReadonlyMap<string, boolean>;
  hasCurrentContractorAssignmentByUser: ReadonlyMap<string, boolean>;
}

async function getWorkosOrganizationMembership(
  ctx: QueryCtx | MutationCtx,
  input: { organizationId: string; workosUserId: string },
) {
  return await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user_and_organization", (query) =>
      query
        .eq("workosUserId", input.workosUserId)
        .eq("workosOrganizationId", input.organizationId),
    )
    .first();
}

/**
 * Draw System Posts retain their canonical Draw read ACL. This module owns the
 * separate ACL for ordinary coordination children: the viewer must be an
 * active WorkOS organization member and be involved in this Build (with
 * admin/principal-broker retained as silent oversight roles).
 */
export async function hasActiveWorkosOrganizationMembership(
  ctx: QueryCtx | MutationCtx,
  input: {
    organizationId: string;
    workosUserId: string;
    membership?: WorkosOrganizationMembership | null;
  },
) {
  const membership =
    input.membership === undefined
      ? await getWorkosOrganizationMembership(ctx, input)
      : input.membership;
  return membership?.status === "active";
}

/**
 * Resolve current Build involvement without treating a stale implicit
 * assignment as active after an explicit participation removal.
 */
export async function hasCurrentBuildInvolvement(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    workosUserId: string;
    involvementContext?: DrawCoordinationInvolvementContext;
  },
) {
  const context =
    input.involvementContext?.build._id === input.buildId
      ? input.involvementContext
      : undefined;
  const build =
    context?.build ?? (await ctx.db.get(input.buildId));
  if (!build) {
    return false;
  }
  const latestParticipation = context?.latestParticipationByUser.has(
    input.workosUserId,
  )
    ? context.latestParticipationByUser.get(input.workosUserId) ?? null
    : await ctx.db
        .query("buildParticipants")
        .withIndex(
          "by_buildId_and_workosUserId_and_participationPeriod",
          (query) =>
            query
              .eq("buildId", input.buildId)
              .eq("workosUserId", input.workosUserId),
        )
        .order("desc")
        .first();
  if (latestParticipation) {
    return latestParticipation.status === "active";
  }

  const proposal = context?.proposal ?? (await ctx.db.get(build.proposalId));
  if (proposal?.assignedBrokerWorkosUserId === input.workosUserId) {
    return true;
  }
  const brokerAssignment = context?.brokerAssignmentByUser.has(
    input.workosUserId,
  )
    ? context.brokerAssignmentByUser.get(input.workosUserId) ?? null
    : await ctx.db
        .query("buildBrokerAssignments")
        .withIndex("by_build_and_assignedBrokerWorkosUserId", (query) =>
          query
            .eq("buildId", input.buildId)
            .eq("assignedBrokerWorkosUserId", input.workosUserId),
        )
        .first();
  if (brokerAssignment) {
    return true;
  }
  const hasActiveBuilderLink = context?.hasActiveBuilderLinkByUser.has(
    input.workosUserId,
  )
    ? context.hasActiveBuilderLinkByUser.get(input.workosUserId) === true
    : await hasActiveBuilderAccountLink(ctx, {
        builderProfileId: build.builderProfileId,
        workosUserId: input.workosUserId,
      });
  if (hasActiveBuilderLink) {
    return true;
  }
  return context?.hasCurrentContractorAssignmentByUser.has(
    input.workosUserId,
  )
    ? context.hasCurrentContractorAssignmentByUser.get(input.workosUserId) ===
        true
    : await hasCurrentContractorBuildAssignment(ctx, {
        buildId: input.buildId,
        workosUserId: input.workosUserId,
      });
}

async function hasActiveBuilderAccountLink(
  ctx: QueryCtx | MutationCtx,
  input: { builderProfileId: Id<"builderProfiles">; workosUserId: string },
) {
  for await (const link of ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (query) =>
      query
        .eq("builderProfileId", input.builderProfileId)
        .eq("workosUserId", input.workosUserId),
    )) {
    if (link.status === "active") {
      return true;
    }
  }
  return false;
}

async function hasCurrentContractorBuildAssignment(
  ctx: QueryCtx | MutationCtx,
  input: { buildId: Id<"activeBuilds">; workosUserId: string },
) {
  for await (const contractor of ctx.db
    .query("contractorProfiles")
    .withIndex("by_account_user", (query) =>
      query.eq("accountWorkosUserId", input.workosUserId),
    )) {
    const assignment = await ctx.db
      .query("buildContractorAssignments")
      .withIndex("by_build_contractor", (query) =>
        query
          .eq("buildId", input.buildId)
          .eq("contractorId", contractor._id),
      )
      .first();
    if (assignment && assignment.status !== "inactive") {
      return true;
    }
  }
  return false;
}

async function resolveDrawCoordinationInvolvementContext(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  workosUserIds: readonly string[],
) {
  const uniqueUserIds = [...new Set(workosUserIds)];
  const latestParticipationByUser = new Map(
    await Promise.all(
      uniqueUserIds.map(
        async (workosUserId) =>
          [
            workosUserId,
            await ctx.db
              .query("buildParticipants")
              .withIndex(
                "by_buildId_and_workosUserId_and_participationPeriod",
                (query) =>
                  query
                    .eq("buildId", authorization.build._id)
                    .eq("workosUserId", workosUserId),
              )
              .order("desc")
              .first(),
          ] as const,
      ),
    ),
  );
  const fallbackUserIds = uniqueUserIds.filter(
    (workosUserId) => latestParticipationByUser.get(workosUserId) === null,
  );
  const fallbackEntries = await Promise.all(
    fallbackUserIds.map(async (workosUserId) => {
      const [brokerAssignment, hasActiveBuilderLink, hasContractorAssignment] =
        await Promise.all([
          ctx.db
            .query("buildBrokerAssignments")
            .withIndex("by_build_and_assignedBrokerWorkosUserId", (query) =>
              query
                .eq("buildId", authorization.build._id)
                .eq("assignedBrokerWorkosUserId", workosUserId),
            )
            .first(),
          hasActiveBuilderAccountLink(ctx, {
            builderProfileId: authorization.build.builderProfileId,
            workosUserId,
          }),
          hasCurrentContractorBuildAssignment(ctx, {
            buildId: authorization.build._id,
            workosUserId,
          }),
        ]);
      return [
        workosUserId,
        { brokerAssignment, hasActiveBuilderLink, hasContractorAssignment },
      ] as const;
    }),
  );
  return {
    build: authorization.build,
    proposal: authorization.proposal,
    latestParticipationByUser,
    brokerAssignmentByUser: new Map(
      fallbackEntries.map(([workosUserId, value]) => [
        workosUserId,
        value.brokerAssignment,
      ]),
    ),
    hasActiveBuilderLinkByUser: new Map(
      fallbackEntries.map(([workosUserId, value]) => [
        workosUserId,
        value.hasActiveBuilderLink,
      ]),
    ),
    hasCurrentContractorAssignmentByUser: new Map(
      fallbackEntries.map(([workosUserId, value]) => [
        workosUserId,
        value.hasContractorAssignment,
      ]),
    ),
  } satisfies DrawCoordinationInvolvementContext;
}

export async function isInternalDrawCoordinationEligible(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    organizationId: string;
    role: BuildCollaborationRole;
    workosUserId: string;
    membership?: WorkosOrganizationMembership | null;
    involvementContext?: DrawCoordinationInvolvementContext;
  },
) {
  if (input.role === "contractor" || input.role === "homeowner") {
    return false;
  }
  if (
    !(await hasActiveWorkosOrganizationMembership(ctx, {
      organizationId: input.organizationId,
      workosUserId: input.workosUserId,
      membership: input.membership,
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
      workingAudienceTruncated: false,
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
    .take(101);
  const audienceRows = rows.slice(0, 100);
  const audienceUserIds = [
    ...new Set(audienceRows.map((row) => row.workosUserId)),
  ];
  const membershipEntries = await Promise.all(
    audienceUserIds.map(async (workosUserId) => [
      workosUserId,
      await getWorkosOrganizationMembership(ctx, {
        organizationId: authorization.organizationId,
        workosUserId,
      }),
    ] as const),
  );
  const membershipsByUser = new Map(membershipEntries);
  const roleEntries = await Promise.all(
    audienceUserIds.map(async (workosUserId) => [
      workosUserId,
      await roleForUser(
        ctx,
        authorization,
        workosUserId,
        membershipsByUser.get(workosUserId) ?? null,
      ),
    ] as const),
  );
  const rolesByUser = new Map(roleEntries);
  const involvementUserIds = audienceUserIds.filter((workosUserId) => {
    const role = rolesByUser.get(workosUserId);
    return (
      role !== "admin" &&
      role !== "principle-broker" &&
      role !== "contractor" &&
      role !== "homeowner"
    );
  });
  const involvementContext = await resolveDrawCoordinationInvolvementContext(
    ctx,
    authorization,
    involvementUserIds,
  );
  const eligibilityEntries = await Promise.all(
    audienceUserIds.map(async (workosUserId) => {
      const role = rolesByUser.get(workosUserId) ?? "builder-staff";
      return [
        workosUserId,
        await isInternalDrawCoordinationEligible(ctx, {
          buildId: authorization.build._id,
          organizationId: authorization.organizationId,
          role,
          workosUserId,
          membership: membershipsByUser.get(workosUserId) ?? null,
          involvementContext,
        }),
      ] as const;
    }),
  );
  const eligibleByUser = new Map(eligibilityEntries);
  const workingAudienceCount = audienceRows.filter((row) => {
    const role = rolesByUser.get(row.workosUserId);
    // Oversight rows can survive a stale client or historical projection, but
    // admins and principle-brokers are never part of the working audience.
    if (role === "admin" || role === "principle-broker") {
      return false;
    }
    return eligibleByUser.get(row.workosUserId) === true;
  }).length;
  const writable = await isBuildCollaborationWritableByBuildId(ctx, {
    buildId: authorization.build._id,
    organizationId: authorization.organizationId,
  });
  const oversight =
    authorization.effectiveRole.role === "admin" ||
    authorization.effectiveRole.role === "principle-broker";
  return {
    // Admin and principal-broker can inspect Draw coordination but are never
    // enrolled in its working audience. Keep this guard in the projected
    // command affordances as well as the UI so stale clients cannot opt them
    // into ordinary coordination work.
    canJoin: writable && !joined && !oversight,
    canLeave: writable && joined && !oversight,
    eligible: true,
    joined,
    oversight,
    workingAudienceCount,
    workingAudienceTruncated: rows.length > audienceRows.length,
  };
}

async function roleForUser(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  workosUserId: string,
  membership?: WorkosOrganizationMembership | null,
): Promise<BuildCollaborationRole> {
  if (workosUserId === authorization.viewer.subject) {
    return authorization.effectiveRole.role;
  }
  const participant = authorization.participants.find(
    (candidate) => candidate.workosUserId === workosUserId,
  );
  if (participant) {
    return participant.role;
  }
  const resolvedMembership =
    membership === undefined
      ? await getWorkosOrganizationMembership(ctx, {
          organizationId: authorization.organizationId,
          workosUserId,
        })
      : membership;
  const role = resolvedMembership?.roleSlug ?? resolvedMembership?.roleSlugs?.[0];
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
    if (
      !(await isBuildCollaborationWritableByBuildId(ctx, {
        buildId: authorization.build._id,
        organizationId: authorization.organizationId,
      }))
    ) {
      throw new Error("Draw coordination is read-only while this Build is archived.");
    }
    if (
      authorization.effectiveRole.role === "admin" ||
      authorization.effectiveRole.role === "principle-broker"
    ) {
      throw new Error("Forbidden: Draw coordination oversight role");
    }
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
      priorState: JSON.stringify({
        coordinationActive: existing?.coordinationActive ?? false,
        postId: post._id,
      }),
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
    if (
      !(await isBuildCollaborationWritableByBuildId(ctx, {
        buildId: authorization.build._id,
        organizationId: authorization.organizationId,
      }))
    ) {
      throw new Error("Draw coordination is read-only while this Build is archived.");
    }
    const existing = await ctx.db
      .query("buildCollaborationFollows")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query
          .eq("postId", post._id)
          .eq("workosUserId", authorization.viewer.subject),
      )
      .unique();
    if (!existing?.coordinationActive) {
      return false;
    }
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
      priorState: JSON.stringify({ coordinationActive: true, postId: post._id }),
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
      workingAudienceTruncated: v.boolean(),
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
        workingAudienceTruncated: false,
      };
    }
    return await projectDrawCoordinationState(ctx, { authorization, post });
  })
  .public();
