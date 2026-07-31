import { v } from "convex/values";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import { collaborationNotificationPreferenceValidator } from "./build_collaboration_contracts";
import {
  enqueueBuildCollaborationExternalDeliveries,
  reconcileBuildCollaborationExternalDeliveries,
} from "./build_collaboration_delivery";
import { externalDeliveryPlan } from "./build_collaboration_delivery_model";
import { buildCollaborationDeepLink } from "./build_collaboration_links";
import type { NotificationEffectInput } from "./build_collaboration_publication_bundle";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import { buildCollaborationNotificationChannelValidator } from "./build_collaboration_validators";
import type { Id, MutationCtx } from "./types";

export type BuildCollaborationNotificationKind =
  | "ordinary_activity"
  | "direct_mention"
  | "assignment"
  | "assignment_request"
  | "followed_reply"
  | "required_approval"
  | "blocker"
  | "build_wide_pin"
  | "acknowledgement_required"
  | "acknowledgement_received"
  | "reminder"
  | "escalation";

const OPTIONAL_NOTIFICATION_KINDS = new Set<BuildCollaborationNotificationKind>(
  ["ordinary_activity", "followed_reply", "acknowledgement_received"]
);

export function isMandatoryBuildCollaborationNotification(
  kind: BuildCollaborationNotificationKind
) {
  return !OPTIONAL_NOTIFICATION_KINDS.has(kind);
}

export function notificationKindForActionItemWorkflowEvent(
  eventType: string
): BuildCollaborationNotificationKind {
  switch (eventType) {
    case "assigned":
    case "reassigned":
      return "assignment";
    case "assignment_requested":
      return "assignment_request";
    case "completion_requested":
      return "required_approval";
    case "blocked":
      return "blocker";
    case "assignment_accepted":
    case "completion_accepted":
      return "acknowledgement_received";
    default:
      return "ordinary_activity";
  }
}

export function notificationKindForDeadlineStage(
  stage: "before" | "due" | "overdue" | "escalated"
): BuildCollaborationNotificationKind {
  return stage === "escalated" ? "escalation" : "reminder";
}

export function notificationKindsForPublicationRecipient(input: {
  acknowledgementRequired: boolean;
  assigned: boolean;
  mentioned: boolean;
  postType: "update" | "question" | "issue" | "decision" | "announcement";
}): BuildCollaborationNotificationKind[] {
  const kinds: BuildCollaborationNotificationKind[] = [];
  if (input.acknowledgementRequired) {
    kinds.push("acknowledgement_required");
  }
  if (input.assigned) {
    kinds.push("assignment");
  }
  if (input.mentioned) {
    kinds.push("direct_mention");
  }
  if (input.postType === "issue") {
    kinds.push("blocker");
  }
  return kinds;
}

export async function emitCanonicalBuildCollaborationNotification(
  ctx: MutationCtx,
  input: {
    actionItemId?: Id<"buildActionItems">;
    assetId?: Id<"buildCollaborationAssets">;
    actionLabel: string;
    authorization: ActiveBuildAuthorization;
    body: string;
    commentId?: Id<"buildCollaborationComments">;
    dedupeKey: string;
    entityId: string;
    entityLabel?: string;
    entityType: string;
    href: string;
    kind: BuildCollaborationNotificationKind;
    now: number;
    postId?: Id<"buildCollaborationPosts">;
    referenceId?: Id<"buildCollaborationReferences">;
    readerIds: Iterable<string>;
    recipientWorkosUserId: string;
    resolutionMode?: "domain" | "recipient";
    sourceLabel?: string;
    title: string;
  }
) {
  if (input.recipientWorkosUserId === input.authorization.viewer.subject) {
    return null;
  }
  const currentReaders = new Set(input.readerIds);
  if (!currentReaders.has(input.recipientWorkosUserId)) {
    return null;
  }
  const mandatory = isMandatoryBuildCollaborationNotification(input.kind);
  const preference = await ctx.db
    .query("buildCollaborationNotificationPreferences")
    .withIndex("by_buildId_and_workosUserId", (query) =>
      query
        .eq("buildId", input.authorization.build._id)
        .eq("workosUserId", input.recipientWorkosUserId)
    )
    .first();
  // General Build activity is digest-only and therefore opt-in. Direct and
  // critical events retain the product default of immediate in-app + email.
  if (input.kind === "ordinary_activity" && !preference) {
    return null;
  }
  if (!mandatory && preference?.ordinaryMuted) {
    return null;
  }
  const channels = preference?.channels ?? ["in_app", "email"];
  const inAppVisible = mandatory || channels.includes("in_app");
  const externalPlan = externalDeliveryPlan({
    channels,
    digestCadence: preference?.digestCadence,
    digestEnabled: preference?.digestEnabled,
    kind: input.kind,
    ordinaryMuted: preference?.ordinaryMuted,
  });
  if (!(inAppVisible || externalPlan.length)) {
    return null;
  }
  const existing = await ctx.db
    .query("recipientDeliveries")
    .withIndex("by_recipient_dedupe", (query) =>
      query
        .eq("organizationId", input.authorization.organizationId)
        .eq("recipientWorkosUserId", input.recipientWorkosUserId)
        .eq("dedupeKey", input.dedupeKey)
    )
    .first();
  if (existing) {
    await enqueueBuildCollaborationExternalDeliveries(ctx, {
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      channels,
      digestCadence: preference?.digestCadence,
      digestEnabled: preference?.digestEnabled,
      kind: input.kind,
      now: input.now,
      ordinaryMuted: preference?.ordinaryMuted,
      organizationId: input.authorization.organizationId,
      recipientDeliveryId: existing._id,
      recipientWorkosUserId: input.recipientWorkosUserId,
    });
    return existing._id;
  }
  const recipientDeliveryId = await ctx.db.insert("recipientDeliveries", {
    actionLabel: input.actionLabel,
    actionRequired: mandatory,
    body: input.body.slice(0, 280),
    brokerageId: input.authorization.brokerage._id,
    collaborationActionItemId: input.actionItemId,
    collaborationAssetId: input.assetId,
    collaborationBuildId: input.authorization.build._id,
    collaborationCommentId: input.commentId,
    collaborationEventKind: input.kind,
    collaborationPostId: input.postId,
    collaborationReferenceId: input.referenceId,
    createdAt: input.now,
    dedupeKey: input.dedupeKey,
    entityId: input.entityId,
    entityLabel: input.entityLabel ?? input.authorization.build.buildName,
    entityType: input.entityType,
    href: input.href,
    inAppVisible,
    organizationId: input.authorization.organizationId,
    recipientWorkosUserId: input.recipientWorkosUserId,
    resolutionMode: input.resolutionMode ?? "recipient",
    sourceLabel: input.sourceLabel ?? "Build collaboration",
    status: "unread",
    title: input.title,
    updatedAt: input.now,
  });
  await enqueueBuildCollaborationExternalDeliveries(ctx, {
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    channels,
    digestCadence: preference?.digestCadence,
    digestEnabled: preference?.digestEnabled,
    kind: input.kind,
    now: input.now,
    ordinaryMuted: preference?.ordinaryMuted,
    organizationId: input.authorization.organizationId,
    recipientDeliveryId,
    recipientWorkosUserId: input.recipientWorkosUserId,
  });
  return recipientDeliveryId;
}

export const getMyBuildCollaborationNotificationPreferences = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(collaborationNotificationPreferenceValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const preference = await ctx.db
      .query("buildCollaborationNotificationPreferences")
      .withIndex("by_buildId_and_workosUserId", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("workosUserId", authorization.viewer.subject)
      )
      .first();
    return {
      channels: preference?.channels ?? ["in_app", "email"],
      digestCadence: preference?.digestCadence ?? "never",
      digestEnabled: preference?.digestEnabled ?? false,
      ordinaryMuted: preference?.ordinaryMuted ?? false,
      workosUserId: authorization.viewer.subject,
    };
  })
  .public();

export const updateMyBuildCollaborationNotificationPreferences =
  authenticatedMutation
    .input({
      buildId: v.id("activeBuilds"),
      channels: v.array(buildCollaborationNotificationChannelValidator),
      digestCadence: v.union(
        v.literal("daily"),
        v.literal("weekly"),
        v.literal("never")
      ),
      digestEnabled: v.boolean(),
      organizationId: v.string(),
      ordinaryMuted: v.boolean(),
    })
    .returns(v.null())
    .handler(async (ctx, args) => {
      const authorization = await authorizeActiveBuildCollaborationAccess(
        ctx,
        args
      );
      const now = Date.now();
      const existing = await ctx.db
        .query("buildCollaborationNotificationPreferences")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query
            .eq("buildId", authorization.build._id)
            .eq("workosUserId", authorization.viewer.subject)
        )
        .first();
      const patch = {
        channels: [...new Set(args.channels)],
        digestCadence: args.digestCadence,
        digestEnabled: args.digestEnabled,
        ordinaryMuted: args.ordinaryMuted,
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, patch);
      } else {
        await ctx.db.insert("buildCollaborationNotificationPreferences", {
          ...patch,
          brokerageId: authorization.brokerage._id,
          buildId: authorization.build._id,
          createdAt: now,
          organizationId: authorization.organizationId,
          workosUserId: authorization.viewer.subject,
        });
      }
      await reconcileBuildCollaborationExternalDeliveries(ctx, {
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        channels: patch.channels,
        digestCadence: patch.digestCadence,
        digestEnabled: patch.digestEnabled,
        now,
        ordinaryMuted: patch.ordinaryMuted,
        organizationId: authorization.organizationId,
        recipientWorkosUserId: authorization.viewer.subject,
      });
      return null;
    })
    .public();

export async function fanOutBuildCollaborationPublication(
  ctx: MutationCtx,
  input: {
    acknowledgementTargetIds: string[];
    actionAssigneeIds: string[];
    authorization: ActiveBuildAuthorization;
    effects: NotificationEffectInput[];
    plainText: string;
    postId: string;
    postType: "update" | "question" | "issue" | "decision" | "announcement";
    referencedParticipantIds: string[];
    now: number;
  }
) {
  for (const effect of input.effects) {
    await fanOutPublicationEffect(ctx, input, effect);
  }
}

async function fanOutPublicationEffect(
  ctx: MutationCtx,
  input: Parameters<typeof fanOutBuildCollaborationPublication>[1],
  effect: NotificationEffectInput
) {
  for (const recipientWorkosUserId of effect.recipientWorkosUserIds) {
    for (const kind of publicationNotificationKinds(
      input,
      recipientWorkosUserId
    )) {
      await emitCanonicalBuildCollaborationNotification(ctx, {
        actionLabel: "Open thread",
        authorization: input.authorization,
        body: effect.summary || input.plainText.slice(0, 280),
        dedupeKey: `build-collaboration:${input.postId}:${kind}:${recipientWorkosUserId}`,
        entityId: input.postId,
        entityType: "buildCollaborationPost",
        href: buildCollaborationDeepLink({
          buildId: input.authorization.build._id,
          postId: input.postId,
        }),
        kind,
        now: input.now,
        postId: input.postId as Id<"buildCollaborationPosts">,
        readerIds: effect.recipientWorkosUserIds,
        recipientWorkosUserId,
        title:
          input.postType === "announcement"
            ? "Build announcement"
            : "New Build collaboration update",
      });
    }
  }
}

function publicationNotificationKinds(
  input: Parameters<typeof fanOutBuildCollaborationPublication>[1],
  recipientWorkosUserId: string
): BuildCollaborationNotificationKind[] {
  const kinds = notificationKindsForPublicationRecipient({
    acknowledgementRequired: input.acknowledgementTargetIds.includes(
      recipientWorkosUserId
    ),
    assigned: input.actionAssigneeIds.includes(recipientWorkosUserId),
    mentioned: input.referencedParticipantIds.includes(recipientWorkosUserId),
    postType: input.postType,
  });
  return kinds.length ? kinds : ["ordinary_activity"];
}

export function resolveBuildCollaborationPublicationNotifications(input: {
  acknowledgementTargetIds: string[];
  actionAssigneeIds: string[];
  authorization: ActiveBuildAuthorization;
  plainText: string;
  postType: "update" | "question" | "issue" | "decision" | "announcement";
  readerIds: string[];
  referencedParticipantIds: string[];
  requestedEffects: NotificationEffectInput[];
}) {
  const readerIds = new Set(input.readerIds);
  const defaultRecipients: string[] = [];
  for (const recipientWorkosUserId of input.readerIds
    .filter(
      (workosUserId) => workosUserId !== input.authorization.viewer.subject
    )
    .slice(0, 1000)) {
    defaultRecipients.push(recipientWorkosUserId);
  }
  const requestedEffects = input.requestedEffects.map((effect) => {
    const summary = effect.summary.trim();
    const recipientWorkosUserIds = [
      ...new Set(
        effect.recipientWorkosUserIds.map((recipient) => recipient.trim())
      ),
    ].filter(Boolean);
    if (!(summary && recipientWorkosUserIds.length)) {
      throw new Error(
        "Every notification effect requires a summary and recipient."
      );
    }
    if (
      recipientWorkosUserIds.some(
        (recipientWorkosUserId) => !readerIds.has(recipientWorkosUserId)
      )
    ) {
      throw new Error(
        "Notification recipients must be able to read the approved publication."
      );
    }
    return { ...effect, recipientWorkosUserIds, summary };
  });
  return [
    ...(defaultRecipients.length
      ? [
          {
            channel: "in_app" as const,
            recipientWorkosUserIds: defaultRecipients,
            summary: input.plainText.slice(0, 280),
          },
        ]
      : []),
    ...requestedEffects,
  ];
}
