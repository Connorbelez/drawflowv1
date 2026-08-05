import { v } from "convex/values";

import { authorizeActiveBuildAccess } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import { authorizeActiveBuildHumanCollaborationAccess } from "./build_collaboration_actor";
import { collaborationRoleTier } from "./build_collaboration_model";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import { queueBuildCollaborationSearchBuildRebuild } from "./build_collaboration_search_maintenance";
import {
  buildCollaborationRoleValidator,
  buildParticipantStatusValidator,
} from "./build_collaboration_validators";
import { beginBuildParticipantActivation } from "./build_participant_activation";
import { processParticipantRevocationCleanupBatch } from "./build_participant_revocation";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_PARTICIPANTS_PER_BUILD = 500;
const participantHistoryRowValidator = v.object({
  displayName: v.string(),
  invitedAt: v.number(),
  joinedAt: v.optional(v.number()),
  participantId: v.id("buildParticipants"),
  participationPeriod: v.number(),
  removedAt: v.optional(v.number()),
  role: buildCollaborationRoleValidator,
  status: buildParticipantStatusValidator,
  workosUserId: v.string(),
});

const activeBuildParticipationValidator = v.object({
  buildId: v.id("activeBuilds"),
  buildName: v.string(),
  legacyContractorProfileLinked: v.optional(v.boolean()),
  location: v.optional(v.string()),
  organizationId: v.string(),
  participantId: v.optional(v.id("buildParticipants")),
  role: buildCollaborationRoleValidator,
});

export const listMyActiveBuildParticipations = authenticatedQuery
  .input({})
  .returns(v.array(activeBuildParticipationValidator))
  .handler(async (ctx) => {
    requireHumanViewer(ctx.viewer);
    const participations = await ctx.db
      .query("buildParticipants")
      .withIndex("by_workosUserId_and_status", (query) =>
        query.eq("workosUserId", ctx.viewer.subject).eq("status", "active")
      )
      .take(MAX_PARTICIPANTS_PER_BUILD);
    const builds = await Promise.all(
      participations.map((participant) => ctx.db.get(participant.buildId))
    );
    return participations.flatMap((participant, index) => {
      const build = builds[index];
      return build && build.brokerageId === participant.brokerageId
        ? [
            {
              buildId: build._id,
              buildName: build.buildName,
              location: build.location,
              organizationId: build.organizationId,
              participantId: participant._id,
              role: participant.role,
            },
          ]
        : [];
    });
  })
  .public();

export const getMyBuildParticipationScope = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.optional(v.string()),
    workspaceRole: v.optional(
      v.union(v.literal("contractor"), v.literal("homeowner"))
    ),
  })
  .returns(v.union(v.null(), activeBuildParticipationValidator))
  .handler(async (ctx, args) => {
    requireHumanViewer(ctx.viewer);
    const latest = await latestParticipantPeriod(
      ctx,
      args.buildId,
      ctx.viewer.subject
    );
    if (latest?.status === "active") {
      if (args.workspaceRole && latest.role !== args.workspaceRole) {
        return null;
      }
      const build = await ctx.db.get(args.buildId);
      if (!build || build.brokerageId !== latest.brokerageId) {
        throw new Error("Build participation is unavailable.");
      }
      return {
        buildId: build._id,
        buildName: build.buildName,
        legacyContractorProfileLinked:
          latest.role === "contractor"
            ? await hasLegacyContractorProfile(
                ctx,
                latest.brokerageId,
                ctx.viewer.subject
              )
            : undefined,
        location: build.location,
        organizationId: build.organizationId,
        participantId: latest._id,
        role: latest.role,
      };
    }
    if (!args.organizationId) {
      if (args.workspaceRole) {
        return null;
      }
      throw new Error("Forbidden: active build participation");
    }
    const authorization = await authorizeActiveBuildAccess(ctx, {
      buildId: args.buildId,
      organizationId: args.organizationId,
    });
    if (
      args.workspaceRole &&
      authorization.effectiveRole.role !== args.workspaceRole
    ) {
      return null;
    }
    return {
      buildId: authorization.build._id,
      buildName: authorization.build.buildName,
      legacyContractorProfileLinked:
        authorization.effectiveRole.role === "contractor"
          ? await hasLegacyContractorProfile(
              ctx,
              authorization.brokerage._id,
              ctx.viewer.subject
            )
          : undefined,
      location: authorization.build.location,
      organizationId: authorization.organizationId,
      participantId: latest?._id,
      role: authorization.effectiveRole.role,
    };
  })
  .public();

export const listBuildParticipantHistory = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(v.array(participantHistoryRowValidator))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    requireParticipantManager(authorization);
    const periods = (
      await Promise.all(
        (["invited", "pending_activation", "active", "removed"] as const).map(
          (status) =>
            ctx.db
              .query("buildParticipants")
              .withIndex("by_buildId_and_status", (query) =>
                query
                  .eq("buildId", authorization.build._id)
                  .eq("status", status)
              )
              .take(MAX_PARTICIPANTS_PER_BUILD)
        )
      )
    )
      .flat()
      .sort(
        (left, right) =>
          right.participationPeriod - left.participationPeriod ||
          right.createdAt - left.createdAt
      );
    return periods.map((participant) => ({
      displayName: participant.displayNameSnapshot,
      invitedAt: participant.createdAt,
      joinedAt: participant.joinedAt,
      participantId: participant._id,
      participationPeriod: participant.participationPeriod,
      removedAt: participant.removedAt,
      role: participant.role,
      status: participant.status,
      workosUserId: participant.workosUserId,
    }));
  })
  .public();

export const inviteBuildParticipant = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    displayName: v.optional(v.string()),
    organizationId: v.string(),
    role: buildCollaborationRoleValidator,
    workosUserId: v.string(),
  })
  .returns(v.id("buildParticipants"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    requireParticipantManager(authorization, args.role);
    return await createParticipantInvitation(ctx, {
      authorization,
      displayName: args.displayName,
      expectedPriorStatus: undefined,
      role: args.role,
      workosUserId: args.workosUserId,
    });
  })
  .public();

export const reinviteBuildParticipant = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    displayName: v.optional(v.string()),
    organizationId: v.string(),
    role: buildCollaborationRoleValidator,
    workosUserId: v.string(),
  })
  .returns(v.id("buildParticipants"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    requireParticipantManager(authorization, args.role);
    return await createParticipantInvitation(ctx, {
      authorization,
      displayName: args.displayName,
      expectedPriorStatus: "removed",
      role: args.role,
      workosUserId: args.workosUserId,
    });
  })
  .public();

export const acceptBuildParticipantInvitation = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(v.id("buildParticipants"))
  .handler(async (ctx, args) => {
    requireHumanViewer(ctx.viewer);
    const scope = await requireBuildScope(ctx, args);
    const invitation = await latestParticipantPeriod(
      ctx,
      scope.build._id,
      ctx.viewer.subject
    );
    if (!invitation || invitation.status !== "invited") {
      throw new Error("No active Build invitation is awaiting acceptance.");
    }
    const now = Date.now();
    await ctx.db.patch(invitation._id, {
      joinedAt: now,
      status: "pending_activation",
      updatedAt: now,
    });
    await beginBuildParticipantActivation(ctx, invitation._id);
    return invitation._id;
  })
  .public();

export const removeBuildParticipant = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    participantId: v.id("buildParticipants"),
    reason: v.string(),
  })
  .returns(v.id("buildParticipants"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const participant = await ctx.db.get(args.participantId);
    if (
      !participant ||
      participant.buildId !== authorization.build._id ||
      participant.organizationId !== authorization.organizationId
    ) {
      throw new Error("Active Build participant is unavailable.");
    }
    if (participant.status === "pending_activation") {
      throw new Error(
        "Participant activation is still reconciling and cannot be removed."
      );
    }
    if (!["active", "invited"].includes(participant.status)) {
      throw new Error("Active Build participant is unavailable.");
    }
    requireParticipantManager(authorization, participant.role);
    if (participant.workosUserId === authorization.viewer.subject) {
      throw new Error("Participant managers cannot remove themselves.");
    }
    const reason = args.reason.trim();
    if (!reason) {
      throw new Error("A participant removal reason is required.");
    }
    const now = Date.now();
    await ctx.db.patch(participant._id, {
      removedAt: now,
      removedByWorkosUserId: authorization.viewer.subject,
      removalReason: reason,
      revocationCleanupStatus: "pending",
      status: "removed",
      updatedAt: now,
      validUntil: now,
    });
    const cleanup = await processParticipantRevocationCleanupBatch(ctx, {
      actorRole: authorization.effectiveRole.role,
      actorWorkosUserId: authorization.viewer.subject,
      participantId: participant._id,
      reason,
    });
    await recordParticipantAudit(ctx, {
      actorRoles: authorization.roles,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      command: "removeBuildParticipant",
      eventType: "build.participant.removed",
      newState: JSON.stringify({
        cleanupComplete: cleanup.complete,
        openActionItemsUnassignedInInitialBatch: cleanup.actionItemCount,
        participationPeriod: participant.participationPeriod,
        status: "removed",
      }),
      organizationId: authorization.organizationId,
      participantId: participant._id,
      priorState: JSON.stringify({
        role: participant.role,
        status: participant.status,
      }),
      reason,
    });
    const updatedAuthorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    await queueBuildCollaborationSearchBuildRebuild(ctx, {
      authorization: updatedAuthorization,
    });
    return participant._id;
  })
  .public();

async function createParticipantInvitation(
  ctx: MutationCtx,
  input: {
    authorization: Awaited<
      ReturnType<typeof authorizeActiveBuildCollaborationAccess>
    >;
    displayName?: string;
    expectedPriorStatus?: "removed";
    role: Doc<"buildParticipants">["role"];
    workosUserId: string;
  }
) {
  const workosUserId = input.workosUserId.trim();
  if (!workosUserId) {
    throw new Error("A WorkOS user is required.");
  }
  const latest = await latestParticipantPeriod(
    ctx,
    input.authorization.build._id,
    workosUserId
  );
  if (
    input.expectedPriorStatus &&
    latest?.status !== input.expectedPriorStatus
  ) {
    throw new Error("Only a removed participant can be reinvited.");
  }
  if (
    input.expectedPriorStatus === "removed" &&
    latest?.revocationCleanupStatus !== "completed"
  ) {
    throw new Error(
      "Participant revocation cleanup is still pending. Retry the invitation after cleanup completes."
    );
  }
  if (!input.expectedPriorStatus && latest) {
    throw new Error(
      latest.status === "removed"
        ? "Use reinvite for a removed participant."
        : "This participant already has an active invitation period."
    );
  }
  await assertParticipantCapacity(ctx, input.authorization.build._id);
  const now = Date.now();
  const participantId = await ctx.db.insert("buildParticipants", {
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: now,
    displayNameSnapshot: input.displayName?.trim() || workosUserId,
    invitedByWorkosUserId: input.authorization.viewer.subject,
    organizationId: input.authorization.organizationId,
    participationPeriod: (latest?.participationPeriod ?? 0) + 1,
    role: input.role,
    status: "invited",
    updatedAt: now,
    validFrom: now,
    workosUserId,
  });
  await recordParticipantAudit(ctx, {
    actorRoles: input.authorization.roles,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    command: input.expectedPriorStatus
      ? "reinviteBuildParticipant"
      : "inviteBuildParticipant",
    eventType: input.expectedPriorStatus
      ? "build.participant.reinvited"
      : "build.participant.invited",
    newState: JSON.stringify({
      participationPeriod: (latest?.participationPeriod ?? 0) + 1,
      role: input.role,
      status: "invited",
      workosUserId,
    }),
    organizationId: input.authorization.organizationId,
    participantId,
    priorState: latest
      ? JSON.stringify({
          participantId: latest._id,
          participationPeriod: latest.participationPeriod,
          status: latest.status,
        })
      : undefined,
  });
  return participantId;
}

async function hasLegacyContractorProfile(
  ctx: QueryCtx,
  brokerageId: Id<"brokerages">,
  workosUserId: string
) {
  const profiles = await ctx.db
    .query("contractorProfiles")
    .withIndex("by_account_user", (query) =>
      query.eq("accountWorkosUserId", workosUserId)
    )
    .take(20);
  return profiles.some(
    (profile) =>
      profile.brokerageId === brokerageId && profile.status === "active"
  );
}

function requireParticipantManager(
  authorization: Awaited<
    ReturnType<typeof authorizeActiveBuildCollaborationAccess>
  >,
  targetRole?: Doc<"buildParticipants">["role"]
) {
  const managerRoles = new Set([
    "admin",
    "principle-broker",
    "broker",
    "builder",
    "broker-staff",
    "builder-staff",
  ]);
  if (!managerRoles.has(authorization.effectiveRole.role)) {
    throw new Error("Forbidden: Build participant management");
  }
  if (
    targetRole &&
    (targetRole === "admin" ||
      targetRole === "principle-broker" ||
      collaborationRoleTier(targetRole) >= authorization.effectiveRole.tier)
  ) {
    throw new Error(
      "Participant managers may manage only lower-tier Build roles."
    );
  }
}

function requireHumanViewer(viewer: { actorKind?: string }) {
  if (viewer.actorKind !== "human") {
    throw new Error(
      "Build participation changes require an explicit human actor."
    );
  }
}

async function requireBuildScope(
  ctx: MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    organizationId: string;
  }
) {
  const brokerage = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (query) =>
      query.eq("workosOrganizationId", input.organizationId)
    )
    .unique();
  const build = await ctx.db.get(input.buildId);
  if (
    !brokerage ||
    brokerage.status !== "active" ||
    !build ||
    build.organizationId !== input.organizationId ||
    build.brokerageId !== brokerage._id
  ) {
    throw new Error("Build invitation is unavailable.");
  }
  return { brokerage, build };
}

async function latestParticipantPeriod(
  ctx: MutationCtx | QueryCtx,
  buildId: Id<"activeBuilds">,
  workosUserId: string
) {
  return await ctx.db
    .query("buildParticipants")
    .withIndex("by_buildId_and_workosUserId_and_participationPeriod", (query) =>
      query.eq("buildId", buildId).eq("workosUserId", workosUserId)
    )
    .order("desc")
    .first();
}

async function assertParticipantCapacity(
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">
) {
  const current = (
    await Promise.all(
      (["active", "invited", "pending_activation"] as const).map((status) =>
        ctx.db
          .query("buildParticipants")
          .withIndex("by_buildId_and_status", (query) =>
            query.eq("buildId", buildId).eq("status", status)
          )
          .take(MAX_PARTICIPANTS_PER_BUILD + 1)
      )
    )
  ).flat();
  if (current.length >= MAX_PARTICIPANTS_PER_BUILD) {
    throw new Error(
      `A Build may have at most ${MAX_PARTICIPANTS_PER_BUILD} current participants.`
    );
  }
}

async function recordParticipantAudit(
  ctx: MutationCtx,
  input: {
    actorRoles: string[];
    actorWorkosUserId: string;
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    command: string;
    eventType: string;
    newState: string;
    organizationId: string;
    participantId: Id<"buildParticipants">;
    priorState?: string;
    reason?: string;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: input.actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: input.brokerageId,
    command: input.command,
    createdAt: Date.now(),
    entityId: input.participantId,
    entityType: "buildParticipant",
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    warnings: [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.brokerageId,
    createdAt: Date.now(),
    eventType: input.eventType,
    organizationId: input.organizationId,
    payloadPreview: JSON.stringify({
      buildId: input.buildId,
      participantId: input.participantId,
    }),
    relatedEntityId: input.participantId,
    relatedEntityType: "buildParticipant",
    status: "pending",
  });
}
