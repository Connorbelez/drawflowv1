import { v } from "convex/values";

import { authenticatedMutation, authenticatedQuery } from "./authz";
import { authorizeActiveBuildHumanCollaborationAccess } from "./build_collaboration_actor";
import { collaborationRoleTier } from "./build_collaboration_model";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import {
  buildCollaborationRoleValidator,
  buildParticipantStatusValidator,
} from "./build_collaboration_validators";
import type { Doc, Id, MutationCtx } from "./types";

const MAX_PARTICIPATION_PERIODS = 100;
const MAX_PARTICIPANTS_PER_BUILD = 500;
const ACTIVE_ACTION_ITEM_STATUSES = [
  "todo",
  "in_progress",
  "in_review",
  "blocked",
] as const;

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
  location: v.optional(v.string()),
  organizationId: v.string(),
  participantId: v.id("buildParticipants"),
  role: buildCollaborationRoleValidator,
});

export const listMyActiveBuildParticipations = authenticatedQuery
  .input({
    organizationId: v.string(),
  })
  .returns(v.array(activeBuildParticipationValidator))
  .handler(async (ctx, args) => {
    requireHumanViewer(ctx.viewer);
    const participations = await ctx.db
      .query("buildParticipants")
      .withIndex("by_organizationId_and_workosUserId_and_status", (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq("workosUserId", ctx.viewer.subject)
          .eq("status", "active")
      )
      .take(MAX_PARTICIPANTS_PER_BUILD);
    const builds = await Promise.all(
      participations.map((participant) => ctx.db.get(participant.buildId))
    );
    return participations.flatMap((participant, index) => {
      const build = builds[index];
      return build &&
        build.organizationId === args.organizationId &&
        build.brokerageId === participant.brokerageId
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
        (["invited", "active", "removed"] as const).map((status) =>
          ctx.db
            .query("buildParticipants")
            .withIndex("by_buildId_and_status", (query) =>
              query.eq("buildId", authorization.build._id).eq("status", status)
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
      status: "active",
      updatedAt: now,
    });
    await recordParticipantAudit(ctx, {
      actorRoles: [invitation.role],
      actorWorkosUserId: ctx.viewer.subject,
      brokerageId: scope.brokerage._id,
      buildId: scope.build._id,
      command: "acceptBuildParticipantInvitation",
      eventType: "build.participant.accepted",
      newState: JSON.stringify({
        participationPeriod: invitation.participationPeriod,
        role: invitation.role,
        status: "active",
      }),
      organizationId: args.organizationId,
      participantId: invitation._id,
      priorState: JSON.stringify({ status: "invited" }),
    });
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
      participant.organizationId !== authorization.organizationId ||
      (participant.status !== "active" && participant.status !== "invited")
    ) {
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
      status: "removed",
      updatedAt: now,
      validUntil: now,
    });
    await revokeParticipantFollows(ctx, authorization.build._id, participant);
    const unassignedActionItemIds = await unassignParticipantActionItems(ctx, {
      authorization,
      participant,
      reason,
      now,
    });
    await notifyParticipantRemovalCoordinators(ctx, {
      actionItemIds: unassignedActionItemIds,
      authorization,
      participant,
      now,
    });
    await recordParticipantAudit(ctx, {
      actorRoles: authorization.roles,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      command: "removeBuildParticipant",
      eventType: "build.participant.removed",
      newState: JSON.stringify({
        openActionItemsUnassigned: unassignedActionItemIds.length,
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
  const priorPeriods = await ctx.db
    .query("buildParticipants")
    .withIndex("by_buildId_and_workosUserId", (query) =>
      query
        .eq("buildId", input.authorization.build._id)
        .eq("workosUserId", workosUserId)
    )
    .take(MAX_PARTICIPATION_PERIODS);
  const latest = priorPeriods.sort(
    (left, right) =>
      right.participationPeriod - left.participationPeriod ||
      right.updatedAt - left.updatedAt
  )[0];
  if (
    input.expectedPriorStatus &&
    latest?.status !== input.expectedPriorStatus
  ) {
    throw new Error("Only a removed participant can be reinvited.");
  }
  if (!input.expectedPriorStatus && latest) {
    throw new Error(
      latest.status === "removed"
        ? "Use reinvite for a removed participant."
        : "This participant already has an active invitation period."
    );
  }
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
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">,
  workosUserId: string
) {
  const periods = await ctx.db
    .query("buildParticipants")
    .withIndex("by_buildId_and_workosUserId", (query) =>
      query.eq("buildId", buildId).eq("workosUserId", workosUserId)
    )
    .take(MAX_PARTICIPATION_PERIODS);
  return periods.sort(
    (left, right) =>
      right.participationPeriod - left.participationPeriod ||
      right.updatedAt - left.updatedAt
  )[0];
}

async function revokeParticipantFollows(
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">,
  participant: Doc<"buildParticipants">
) {
  const follows = await ctx.db
    .query("buildCollaborationFollows")
    .withIndex("by_buildId_and_workosUserId_and_active", (query) =>
      query
        .eq("buildId", buildId)
        .eq("workosUserId", participant.workosUserId)
        .eq("active", true)
    )
    .take(500);
  const now = Date.now();
  await Promise.all(
    follows.map((follow) =>
      ctx.db.patch(follow._id, { active: false, updatedAt: now })
    )
  );
}

async function unassignParticipantActionItems(
  ctx: MutationCtx,
  input: {
    authorization: Awaited<
      ReturnType<typeof authorizeActiveBuildCollaborationAccess>
    >;
    now: number;
    participant: Doc<"buildParticipants">;
    reason: string;
  }
) {
  const items = (
    await Promise.all(
      ACTIVE_ACTION_ITEM_STATUSES.map((status) =>
        ctx.db
          .query("buildActionItems")
          .withIndex(
            "by_buildId_and_assigneeWorkosUserId_and_status",
            (query) =>
              query
                .eq("buildId", input.authorization.build._id)
                .eq("assigneeWorkosUserId", input.participant.workosUserId)
                .eq("status", status)
          )
          .take(500)
      )
    )
  ).flat();
  for (const item of items) {
    const revision = item.currentRevision + 1;
    await ctx.db.patch(item._id, {
      assigneeWorkosUserId: undefined,
      assignedByWorkosUserId: undefined,
      assignmentRequestedAt: undefined,
      assignmentState: "unassigned",
      currentRevision: revision,
      requiresAcceptance: false,
      unassignmentReason: "participant_removed",
      updatedAt: input.now,
    });
    await ctx.db.insert("buildActionItemEvents", {
      actionItemId: item._id,
      actorRole: input.authorization.effectiveRole.role,
      actorWorkosUserId: input.authorization.viewer.subject,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      eventType: "participant_removed_unassigned",
      exercisedAuthority: "coordinator",
      newState: JSON.stringify({
        assigneeWorkosUserId: null,
        assignmentState: "unassigned",
        unassignmentReason: "participant_removed",
      }),
      organizationId: input.authorization.organizationId,
      priorState: JSON.stringify({
        assigneeWorkosUserId: item.assigneeWorkosUserId,
        assignmentState: item.assignmentState,
      }),
      reason: input.reason,
      revision,
      warnings: ["participant_removed"],
    });
  }
  return items.map((item) => item._id);
}

async function notifyParticipantRemovalCoordinators(
  ctx: MutationCtx,
  input: {
    actionItemIds: Id<"buildActionItems">[];
    authorization: Awaited<
      ReturnType<typeof authorizeActiveBuildCollaborationAccess>
    >;
    now: number;
    participant: Doc<"buildParticipants">;
  }
) {
  if (input.actionItemIds.length === 0) {
    return;
  }
  const coordinatorIds = new Set([
    input.authorization.viewer.subject,
    ...input.authorization.participants
      .filter((participant) =>
        [
          "admin",
          "principle-broker",
          "broker",
          "builder",
          "broker-staff",
          "builder-staff",
        ].includes(participant.role)
      )
      .map((participant) => participant.workosUserId),
  ]);
  for (const recipientWorkosUserId of coordinatorIds) {
    const dedupeKey = `participant-removed:${input.participant._id}:${recipientWorkosUserId}`;
    const existing = await ctx.db
      .query("recipientDeliveries")
      .withIndex("by_recipient_dedupe", (query) =>
        query
          .eq("organizationId", input.authorization.organizationId)
          .eq("recipientWorkosUserId", recipientWorkosUserId)
          .eq("dedupeKey", dedupeKey)
      )
      .unique();
    if (existing) {
      continue;
    }
    await ctx.db.insert("recipientDeliveries", {
      actionLabel: "Reassign work",
      actionRequired: true,
      body: `${input.actionItemIds.length} open Action Item${input.actionItemIds.length === 1 ? "" : "s"} must be reassigned.`,
      brokerageId: input.authorization.brokerage._id,
      createdAt: input.now,
      dedupeKey,
      entityId: input.participant._id,
      entityLabel: input.participant.displayNameSnapshot,
      entityType: "buildParticipant",
      href: `/backoffice/builds/${input.authorization.build._id}?tab=details`,
      organizationId: input.authorization.organizationId,
      recipientWorkosUserId,
      resolutionMode: "recipient",
      sourceLabel: input.authorization.build.buildName,
      status: "unread",
      title: "Participant removed — Action Items need reassignment",
      updatedAt: input.now,
    });
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
