import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { buildCollaborationRoleValidator } from "./build_collaboration_validators";
import { internalMutation } from "./fluent";
import type { MutationCtx } from "./types";

const CLEANUP_BATCH_SIZE = 20;
const ACTIVE_ACTION_ITEM_STATUSES = [
  "todo",
  "in_progress",
  "in_review",
  "blocked",
] as const;
const COORDINATOR_ROLES = new Set([
  "admin",
  "principle-broker",
  "broker",
  "builder",
  "broker-staff",
  "builder-staff",
]);

interface ParticipantRevocationCleanupInput {
  actorRole: Doc<"buildParticipants">["role"];
  actorWorkosUserId: string;
  participantId: Id<"buildParticipants">;
  reason: string;
}

export async function processParticipantRevocationCleanupBatch(
  ctx: MutationCtx,
  input: ParticipantRevocationCleanupInput
) {
  const participant = await ctx.db.get(input.participantId);
  if (!participant || participant.status !== "removed") {
    return { actionItemCount: 0, complete: true };
  }
  const now = Date.now();
  const follows = await ctx.db
    .query("buildCollaborationFollows")
    .withIndex("by_buildId_and_workosUserId_and_active", (query) =>
      query
        .eq("buildId", participant.buildId)
        .eq("workosUserId", participant.workosUserId)
        .eq("active", true)
    )
    .take(CLEANUP_BATCH_SIZE + 1);
  const selectedFollows = follows.slice(0, CLEANUP_BATCH_SIZE);
  for (const follow of selectedFollows) {
    await ctx.db.patch(follow._id, { active: false, updatedAt: now });
  }

  const actionItems: Doc<"buildActionItems">[] = [];
  let actionOverflow = false;
  for (const status of ACTIVE_ACTION_ITEM_STATUSES) {
    const remaining = CLEANUP_BATCH_SIZE - actionItems.length;
    if (remaining === 0) {
      actionOverflow = true;
      break;
    }
    const rows = await ctx.db
      .query("buildActionItems")
      .withIndex("by_buildId_and_assigneeWorkosUserId_and_status", (query) =>
        query
          .eq("buildId", participant.buildId)
          .eq("assigneeWorkosUserId", participant.workosUserId)
          .eq("status", status)
      )
      .take(remaining + 1);
    actionItems.push(...rows.slice(0, remaining));
    if (rows.length > remaining) {
      actionOverflow = true;
      break;
    }
  }
  for (const item of actionItems) {
    const revision = item.currentRevision + 1;
    await ctx.db.patch(item._id, {
      assigneeWorkosUserId: undefined,
      assignedByWorkosUserId: undefined,
      assignmentRequestedAt: undefined,
      assignmentState: "unassigned",
      currentRevision: revision,
      requiresAcceptance: false,
      unassignmentReason: "participant_removed",
      updatedAt: now,
    });
    await ctx.db.insert("buildActionItemEvents", {
      actionItemId: item._id,
      actorRole: input.actorRole,
      actorWorkosUserId: input.actorWorkosUserId,
      brokerageId: participant.brokerageId,
      buildId: participant.buildId,
      createdAt: now,
      eventType: "participant_removed_unassigned",
      exercisedAuthority: "coordinator",
      newState: JSON.stringify({
        assigneeWorkosUserId: null,
        assignmentState: "unassigned",
        unassignmentReason: "participant_removed",
      }),
      organizationId: participant.organizationId,
      priorState: JSON.stringify({
        assigneeWorkosUserId: item.assigneeWorkosUserId,
        assignmentState: item.assignmentState,
      }),
      reason: input.reason,
      revision,
      warnings: ["participant_removed"],
    });
  }
  await notifyCoordinators(ctx, {
    actionItems,
    participant,
    now,
  });

  const complete = follows.length <= CLEANUP_BATCH_SIZE && !actionOverflow;
  if (complete) {
    await ctx.db.patch(participant._id, {
      revocationCleanupCompletedAt: now,
      revocationCleanupStatus: "completed",
      updatedAt: now,
    });
  } else {
    await ctx.scheduler.runAfter(
      0,
      internal.build_participant_revocation
        .continueBuildParticipantRevocationCleanup,
      input
    );
  }
  return { actionItemCount: actionItems.length, complete };
}

export const continueBuildParticipantRevocationCleanup = internalMutation
  .input({
    actorRole: buildCollaborationRoleValidator,
    actorWorkosUserId: v.string(),
    participantId: v.id("buildParticipants"),
    reason: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    await processParticipantRevocationCleanupBatch(ctx, args);
    return null;
  })
  .internal();

async function notifyCoordinators(
  ctx: MutationCtx,
  input: {
    actionItems: Doc<"buildActionItems">[];
    now: number;
    participant: Doc<"buildParticipants">;
  }
) {
  if (input.actionItems.length === 0) {
    return;
  }
  const participants = await ctx.db
    .query("buildParticipants")
    .withIndex("by_buildId_and_status", (query) =>
      query.eq("buildId", input.participant.buildId).eq("status", "active")
    )
    .take(500);
  const recipients = new Set(
    participants
      .filter((participant) => COORDINATOR_ROLES.has(participant.role))
      .map((participant) => participant.workosUserId)
  );
  if (input.participant.removedByWorkosUserId) {
    recipients.add(input.participant.removedByWorkosUserId);
  }
  const batchKey = input.actionItems[0]?._id;
  for (const recipientWorkosUserId of recipients) {
    const dedupeKey = `participant-removed:${input.participant._id}:${batchKey}:${recipientWorkosUserId}`;
    const existing = await ctx.db
      .query("recipientDeliveries")
      .withIndex("by_recipient_dedupe", (query) =>
        query
          .eq("organizationId", input.participant.organizationId)
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
      body: `${input.actionItems.length} open Action Item${input.actionItems.length === 1 ? "" : "s"} must be reassigned.`,
      brokerageId: input.participant.brokerageId,
      createdAt: input.now,
      dedupeKey,
      entityId: input.participant._id,
      entityLabel: input.participant.displayNameSnapshot,
      entityType: "buildParticipant",
      href: `/backoffice/builds/${input.participant.buildId}?tab=details`,
      organizationId: input.participant.organizationId,
      recipientWorkosUserId,
      resolutionMode: "recipient",
      sourceLabel: "Build collaboration",
      status: "unread",
      title: "Participant removed — Action Items need reassignment",
      updatedAt: input.now,
    });
  }
}
