import { v } from "convex/values";

import { internal } from "./_generated/api";
import {
  type ActiveBuildAuthorization,
  projectActiveBuildParticipants,
} from "./activeBuildAccess";
import { reconcilePermissionConflictedActionItemRelations } from "./build_action_item_structure";
import { collaborationRoleTier } from "./build_collaboration_model";
import { queueBuildCollaborationSearchBuildRebuild } from "./build_collaboration_search_maintenance";
import { internalMutation } from "./fluent";
import type { Doc, Id, MutationCtx } from "./types";

const ACTIVATION_RELATION_BATCH_SIZE = 10;
const MAX_PARTICIPANTS_PER_BUILD = 500;

export async function beginBuildParticipantActivation(
  ctx: MutationCtx,
  participantId: Id<"buildParticipants">
) {
  return await processBuildParticipantActivationBatch(ctx, {
    cursor: null,
    participantId,
  });
}

export const continueBuildParticipantActivation = internalMutation
  .input({
    cursor: v.union(v.string(), v.null()),
    participantId: v.id("buildParticipants"),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    await processBuildParticipantActivationBatch(ctx, args);
    return null;
  })
  .internal();

async function processBuildParticipantActivationBatch(
  ctx: MutationCtx,
  input: {
    cursor: string | null;
    participantId: Id<"buildParticipants">;
  }
) {
  const participant = await ctx.db.get(input.participantId);
  if (!participant || participant.status !== "pending_activation") {
    return { complete: participant?.status === "active" };
  }
  const authorization = await resolvePendingActivationAuthorization(
    ctx,
    participant
  );
  const page = await ctx.db
    .query("buildActionItemRelations")
    .withIndex("by_buildId_and_status", (query) =>
      query.eq("buildId", participant.buildId).eq("status", "active")
    )
    .paginate({
      cursor: input.cursor,
      numItems: ACTIVATION_RELATION_BATCH_SIZE,
    });
  await reconcilePermissionConflictedActionItemRelations(
    ctx,
    authorization,
    page.page
  );
  if (!page.isDone) {
    await ctx.scheduler.runAfter(
      0,
      internal.build_participant_activation.continueBuildParticipantActivation,
      {
        cursor: page.continueCursor,
        participantId: participant._id,
      }
    );
    if (input.cursor === null) {
      await recordParticipantActivationAudit(ctx, {
        authorization,
        eventType: "build.participant.activation_pending",
        participant,
        priorStatus: "invited",
        status: "pending_activation",
      });
    }
    return { complete: false };
  }
  const now = Date.now();
  await ctx.db.patch(participant._id, {
    status: "active",
    updatedAt: now,
  });
  await recordParticipantActivationAudit(ctx, {
    authorization,
    eventType: "build.participant.accepted",
    participant,
    priorStatus: input.cursor === null ? "invited" : "pending_activation",
    status: "active",
  });
  await queueBuildCollaborationSearchBuildRebuild(ctx, { authorization });
  return { complete: true };
}

async function resolvePendingActivationAuthorization(
  ctx: MutationCtx,
  participant: Doc<"buildParticipants">
): Promise<ActiveBuildAuthorization> {
  const [build, brokerage] = await Promise.all([
    ctx.db.get(participant.buildId),
    ctx.db.get(participant.brokerageId),
  ]);
  if (
    !(build && brokerage) ||
    build.organizationId !== participant.organizationId ||
    build.brokerageId !== brokerage._id ||
    brokerage.workosOrganizationId !== participant.organizationId
  ) {
    throw new Error("Pending participant activation scope is unavailable.");
  }
  const proposal = await ctx.db.get(build.proposalId);
  if (
    !proposal ||
    proposal.organizationId !== participant.organizationId ||
    proposal.brokerageId !== brokerage._id
  ) {
    throw new Error("Pending participant activation proposal is unavailable.");
  }
  const activeParticipants = await ctx.db
    .query("buildParticipants")
    .withIndex("by_buildId_and_status", (query) =>
      query.eq("buildId", build._id).eq("status", "active")
    )
    .take(MAX_PARTICIPANTS_PER_BUILD + 1);
  if (activeParticipants.length >= MAX_PARTICIPANTS_PER_BUILD) {
    throw new Error(
      `A Build may have at most ${MAX_PARTICIPANTS_PER_BUILD} active participants.`
    );
  }
  const participants = await projectActiveBuildParticipants(ctx, {
    build,
    grantedParticipants: [...activeParticipants, participant],
    proposal,
  });
  return {
    brokerage,
    build,
    effectiveRole: {
      role: participant.role,
      tier: collaborationRoleTier(participant.role),
    },
    organizationId: participant.organizationId,
    participants,
    proposal,
    roles: [participant.role],
    viewer: {
      actorKind: "human",
      capability: "authenticated",
      organizationId: participant.organizationId,
      roles: [participant.role === "homeowner" ? "member" : participant.role],
      subject: participant.workosUserId,
      tokenIdentifier: `participant-activation:${participant._id}`,
    },
  };
}

async function recordParticipantActivationAudit(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    eventType:
      | "build.participant.accepted"
      | "build.participant.activation_pending";
    participant: Doc<"buildParticipants">;
    priorStatus: "invited" | "pending_activation";
    status: "active" | "pending_activation";
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: [input.participant.role],
    actorWorkosUserId: input.participant.workosUserId,
    brokerageId: input.authorization.brokerage._id,
    command: "acceptBuildParticipantInvitation",
    createdAt: Date.now(),
    entityId: input.participant._id,
    entityType: "buildParticipant",
    eventType: input.eventType,
    newState: JSON.stringify({
      participationPeriod: input.participant.participationPeriod,
      role: input.participant.role,
      status: input.status,
    }),
    organizationId: input.authorization.organizationId,
    priorState: JSON.stringify({ status: input.priorStatus }),
    warnings:
      input.status === "pending_activation"
        ? ["permission_reconciliation_pending"]
        : [],
  });
}
