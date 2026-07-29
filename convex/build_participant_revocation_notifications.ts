import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { normalizeRoleSlugs } from "./authz";
import { internalMutation } from "./fluent";
import type { MutationCtx } from "./types";

const NOTIFICATION_BATCH_SIZE = 20;
const notificationSourceValidator = v.union(
  v.literal("static"),
  v.literal("participants"),
  v.literal("builder-links"),
  v.literal("broker-assignments"),
  v.literal("tenant-memberships")
);
type NotificationSource =
  | "static"
  | "participants"
  | "builder-links"
  | "broker-assignments"
  | "tenant-memberships";

const COORDINATOR_ROLES = new Set([
  "admin",
  "principle-broker",
  "broker",
  "builder",
  "broker-staff",
  "builder-staff",
]);

interface RevocationNotificationInput {
  actionItemCount: number;
  batchKey: Id<"buildActionItems">;
  participantId: Id<"buildParticipants">;
}

export async function enqueueParticipantRevocationNotifications(
  ctx: MutationCtx,
  input: RevocationNotificationInput
) {
  const sources: NotificationSource[] = [
    "static",
    "participants",
    "builder-links",
    "broker-assignments",
    "tenant-memberships",
  ];
  for (const source of sources) {
    await ctx.scheduler.runAfter(
      0,
      internal.build_participant_revocation_notifications
        .continueParticipantRevocationNotifications,
      {
        ...input,
        cursor: null,
        source,
      }
    );
  }
}

export const continueParticipantRevocationNotifications = internalMutation
  .input({
    actionItemCount: v.number(),
    batchKey: v.id("buildActionItems"),
    cursor: v.union(v.string(), v.null()),
    participantId: v.id("buildParticipants"),
    source: notificationSourceValidator,
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const participant = await ctx.db.get(args.participantId);
    if (!participant) {
      return null;
    }
    const build = await ctx.db.get(participant.buildId);
    if (!build) {
      return null;
    }
    const page = await resolveCoordinatorPage(ctx, {
      build,
      cursor: args.cursor,
      participant,
      source: args.source,
    });
    for (const recipientWorkosUserId of new Set(page.recipients)) {
      await insertCoordinatorNotification(ctx, {
        actionItemCount: args.actionItemCount,
        batchKey: args.batchKey,
        now: Date.now(),
        participant,
        recipientWorkosUserId,
      });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.build_participant_revocation_notifications
          .continueParticipantRevocationNotifications,
        {
          ...args,
          cursor: page.continueCursor,
        }
      );
    }
    return null;
  })
  .internal();

async function resolveCoordinatorPage(
  ctx: MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    cursor: string | null;
    participant: Doc<"buildParticipants">;
    source: NotificationSource;
  }
): Promise<{
  continueCursor: string;
  isDone: boolean;
  recipients: string[];
}> {
  if (input.source === "static") {
    if (input.cursor) {
      return { continueCursor: input.cursor, isDone: true, recipients: [] };
    }
    const proposal = await ctx.db.get(input.build.proposalId);
    return {
      continueCursor: "",
      isDone: true,
      recipients: [
        input.participant.removedByWorkosUserId,
        proposal?.assignedBrokerWorkosUserId,
      ].filter((value): value is string => Boolean(value)),
    };
  }
  if (input.source === "participants") {
    const page = await ctx.db
      .query("buildParticipants")
      .withIndex("by_buildId_and_status", (query) =>
        query.eq("buildId", input.build._id).eq("status", "active")
      )
      .paginate({
        cursor: input.cursor,
        numItems: NOTIFICATION_BATCH_SIZE,
      });
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      recipients: page.page
        .filter((participant) => COORDINATOR_ROLES.has(participant.role))
        .map((participant) => participant.workosUserId),
    };
  }
  if (input.source === "builder-links") {
    const page = await ctx.db
      .query("builderAccountLinks")
      .withIndex("by_builder", (query) =>
        query.eq("builderProfileId", input.build.builderProfileId)
      )
      .paginate({
        cursor: input.cursor,
        numItems: NOTIFICATION_BATCH_SIZE,
      });
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      recipients: page.page
        .filter((link) => link.status === "active")
        .map((link) => link.workosUserId),
    };
  }
  if (input.source === "broker-assignments") {
    const page = await ctx.db
      .query("buildBrokerAssignments")
      .withIndex("by_build", (query) => query.eq("buildId", input.build._id))
      .paginate({
        cursor: input.cursor,
        numItems: NOTIFICATION_BATCH_SIZE,
      });
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      recipients: page.page.map(
        (assignment) => assignment.assignedBrokerWorkosUserId
      ),
    };
  }
  const page = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_organization", (query) =>
      query.eq("workosOrganizationId", input.build.organizationId)
    )
    .paginate({
      cursor: input.cursor,
      numItems: NOTIFICATION_BATCH_SIZE,
    });
  return {
    continueCursor: page.continueCursor,
    isDone: page.isDone,
    recipients: page.page
      .filter((membership) => {
        if (membership.status !== "active") {
          return false;
        }
        const roles = normalizeRoleSlugs([
          membership.roleSlug,
          ...membership.roleSlugs,
        ]);
        return roles.includes("admin") || roles.includes("principle-broker");
      })
      .map((membership) => membership.workosUserId),
  };
}

async function insertCoordinatorNotification(
  ctx: MutationCtx,
  input: {
    actionItemCount: number;
    batchKey: Id<"buildActionItems">;
    now: number;
    participant: Doc<"buildParticipants">;
    recipientWorkosUserId: string;
  }
) {
  const dedupeKey = `participant-removed:${input.participant._id}:${input.batchKey}:${input.recipientWorkosUserId}`;
  const existing = await ctx.db
    .query("recipientDeliveries")
    .withIndex("by_recipient_dedupe", (query) =>
      query
        .eq("organizationId", input.participant.organizationId)
        .eq("recipientWorkosUserId", input.recipientWorkosUserId)
        .eq("dedupeKey", dedupeKey)
    )
    .unique();
  if (existing) {
    return;
  }
  await ctx.db.insert("recipientDeliveries", {
    actionLabel: "Reassign work",
    actionRequired: true,
    body: `${input.actionItemCount} open Action Item${input.actionItemCount === 1 ? "" : "s"} must be reassigned.`,
    brokerageId: input.participant.brokerageId,
    createdAt: input.now,
    dedupeKey,
    entityId: input.participant._id,
    entityLabel: input.participant.displayNameSnapshot,
    entityType: "buildParticipant",
    href: `/backoffice/builds/${input.participant.buildId}?tab=details`,
    organizationId: input.participant.organizationId,
    recipientWorkosUserId: input.recipientWorkosUserId,
    resolutionMode: "recipient",
    sourceLabel: "Build collaboration",
    status: "unread",
    title: "Participant removed — Action Items need reassignment",
    updatedAt: input.now,
  });
}
