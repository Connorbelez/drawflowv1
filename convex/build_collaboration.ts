import {
  createActionItems,
  isActiveBuildCollaborationOperation,
  persistAttachments,
  persistAudience,
  persistReferences,
  recordPublicationAudit,
  resolveEffectiveActionItems,
  resolvePublicationAudience,
  shouldSkipBuildCollaborationFeedPost,
  validatePublicationAssets,
  validateRichTextContent,
} from "./build_collaboration/helpers";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  buildActionItemQueueSortAt,
  resetBuildActionItemDeadlineSchedule,
} from "./build_action_item_deadline_model";
import { canReadCollaborationPost } from "./build_collaboration_access";
import { authorizeActiveBuildHumanCollaborationAccess } from "./build_collaboration_actor";
import { isCleanCollaborationAsset } from "./build_collaboration_asset_access";
import { persistGovernedCollaborationAssetAttachments } from "./build_collaboration_asset_publication";
import { collaborationFeedResultValidator } from "./build_collaboration_contracts";
import { stableContentHash } from "./build_collaboration_hash";
import { requireHumanCollaborationActor } from "./build_collaboration_human";
import { requireBuildCollaborationWritable } from "./build_collaboration_lifecycle_state";
import {
  canCreateCustomCollaborationAudience,
  collaborationRoleTier,
  resolveCollaborationAudience,
} from "./build_collaboration_model";
import {
  fanOutBuildCollaborationPublication,
  resolveBuildCollaborationPublicationNotifications,
} from "./build_collaboration_notifications";
import { projectReadableBuildCollaborationPost } from "./build_collaboration_projection";
import {
  type ActionItemInput,
  type BuildCollaborationPublicationBundle,
  type BuildCollaborationPublicationBundleInput,
  canonicalizeTiptapContent,
  canonicalizeTiptapReferences,
  normalizePublicationBundle,
  publicationBundleFields,
  type ReferenceInput,
} from "./build_collaboration_publication_bundle";
import { validateBuildCollaborationPublicationPreconditions } from "./build_collaboration_publication_preconditions";
import { resolveCanonicalBuildCollaborationReferences } from "./build_collaboration_references";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import { queueBuildCollaborationSearchPostTreeRebuild } from "./build_collaboration_search_maintenance";
import { isCanonicalCollaborationSystemPost } from "./build_collaboration_system_event_access";
import { persistApprovedBuildCollaborationSharedEffects } from "./build_collaboration_shared_effects";
import { buildCollaborationValidationError } from "./build_collaboration_validation";
import { emitBuildCollaborationWebhookEvent } from "./build_collaboration_webhooks";
import type { Doc, Id, MutationCtx } from "./types";

const MAX_PLAIN_TEXT_LENGTH = 50_000;
const MAX_RICH_TEXT_LENGTH = 250_000;
const MAX_REFERENCES_PER_BUNDLE = 100;
const MAX_ACTION_ITEMS_PER_BUNDLE = 100;

export const approveAndPublishBuildCollaborationBundle = authenticatedMutation
  .input({
    ...publicationBundleFields,
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(v.id("buildCollaborationPosts"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const { audience, bundle } = await prepareBuildCollaborationPublication(
      ctx,
      {
        authorization,
        bundle: args,
      }
    );
    return await publishBuildCollaborationBundle(ctx, {
      agentDrafted: false,
      audience,
      authorization,
      bundle,
    });
  })
  .public();

export async function prepareBuildCollaborationPublication(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    bundle: BuildCollaborationPublicationBundleInput;
  }
) {
  await requireBuildCollaborationWritable(ctx, input.authorization);
  const normalizedBundle = normalizePublicationBundle(input.bundle);
  const normalizedEffectiveBundle = {
    ...normalizedBundle,
    actionItems: resolveEffectiveActionItems({
      actionItems: normalizedBundle.actionItems,
      authorization: input.authorization,
    }),
  };
  validateRichTextContent(normalizedEffectiveBundle);
  for (const mutation of normalizedEffectiveBundle.sharedMutations) {
    if (!(mutation.entityKind && mutation.operation && mutation.summary)) {
      throw buildCollaborationValidationError(
        "Every approved shared mutation requires an entity kind, operation, and summary."
      );
    }
  }
  if (normalizedEffectiveBundle.references.length > MAX_REFERENCES_PER_BUNDLE) {
    throw buildCollaborationValidationError(
      `A publication may contain at most ${MAX_REFERENCES_PER_BUNDLE} references.`
    );
  }
  if (
    normalizedEffectiveBundle.actionItems.length > MAX_ACTION_ITEMS_PER_BUNDLE
  ) {
    throw buildCollaborationValidationError(
      `A publication may contain at most ${MAX_ACTION_ITEMS_PER_BUNDLE} Action Items.`
    );
  }
  const audience = resolvePublicationAudience({
    audienceMode: normalizedEffectiveBundle.audienceMode,
    authorization: input.authorization,
    excludedReaderIds: normalizedEffectiveBundle.excludedReaderIds,
    requestedReaderIds: normalizedEffectiveBundle.requestedReaderIds,
  });
  await validatePublicationAssets(ctx, {
    assetIds: normalizedEffectiveBundle.attachmentAssetIds,
    authorization: input.authorization,
    readerIds: audience.readerIds,
  });
  const references = await resolveCanonicalBuildCollaborationReferences(ctx, {
    authorization: input.authorization,
    readerIds: audience.readerIds,
    references: normalizedEffectiveBundle.references,
  });
  const actionItems = await Promise.all(
    normalizedEffectiveBundle.actionItems.map(async (actionItem) => {
      const actionReferences =
        await resolveCanonicalBuildCollaborationReferences(ctx, {
          authorization: input.authorization,
          readerIds: audience.readerIds,
          references: actionItem.references ?? [],
        });
      const description = canonicalizeTiptapReferences(
        actionItem.descriptionTiptapJson ??
          JSON.stringify({ content: [], type: "doc" }),
        actionReferences,
        { allowEmpty: true }
      );
      return {
        ...actionItem,
        descriptionPlainText: description.plainText,
        descriptionTiptapJson: description.tiptapJson,
        references: actionReferences,
      };
    })
  );
  const canonicalContent = canonicalizeTiptapReferences(
    normalizedEffectiveBundle.tiptapJson,
    references
  );
  const bundle = {
    ...normalizedEffectiveBundle,
    actionItems,
    plainText: canonicalContent.plainText,
    references,
    tiptapJson: canonicalContent.tiptapJson,
  };
  await validateBuildCollaborationPublicationPreconditions(ctx, {
    authorization: input.authorization,
    bundle,
  });
  const acknowledgementTargetIds = bundle.acknowledgementRequired
    ? audience.readerIds.filter((workosUserId) => {
        const participant = input.authorization.participants.find(
          (candidate) => candidate.workosUserId === workosUserId
        );
        return (
          workosUserId !== input.authorization.viewer.subject &&
          participant !== undefined &&
          collaborationRoleTier(participant.role) <=
            input.authorization.effectiveRole.tier
        );
      })
    : [];
  const effectiveNotificationEffects =
    await resolveBuildCollaborationPublicationNotifications({
      acknowledgementTargetIds,
      actionAssigneeIds: bundle.actionItems.flatMap((item) =>
        item.assigneeWorkosUserId ? [item.assigneeWorkosUserId] : []
      ),
      authorization: input.authorization,
      plainText: bundle.plainText,
      postType: bundle.postType,
      readerIds: audience.readerIds,
      referencedParticipantIds: bundle.references.flatMap((reference) =>
        reference.entityKind === "participant" ? [reference.entityId] : []
      ),
      requestedEffects: bundle.notificationEffects,
    });
  return {
    audience,
    bundle: {
      ...bundle,
      effectiveNotificationEffects,
      effectiveReaderIds: audience.readerIds,
      mandatoryReaderIds: audience.mandatoryReaderIds,
    },
  };
}

export async function publishBuildCollaborationBundle(
  ctx: MutationCtx,
  input: {
    agentDrafted: boolean;
    audience: {
      excludedParticipantIds: string[];
      mandatoryReaderIds: string[];
      readerIds: string[];
    };
    authorization: ActiveBuildAuthorization;
    bundle: BuildCollaborationPublicationBundle;
  }
) {
  const { audience, authorization, bundle } = input;
  await requireBuildCollaborationWritable(ctx, authorization);
  await requireHumanCollaborationActor(ctx, authorization);
  if (
    bundle.postType === "announcement" &&
    authorization.effectiveRole.tier < 3
  ) {
    throw buildCollaborationValidationError(
      "Announcements may only be published by the Builder or lender coordination team."
    );
  }
  const content = validateRichTextContent({
    plainText: bundle.plainText,
    tiptapJson: bundle.tiptapJson,
  });
  if (bundle.references.length > MAX_REFERENCES_PER_BUNDLE) {
    throw buildCollaborationValidationError(
      `A publication may contain at most ${MAX_REFERENCES_PER_BUNDLE} references.`
    );
  }
  if (bundle.actionItems.length > MAX_ACTION_ITEMS_PER_BUNDLE) {
    throw buildCollaborationValidationError(
      `A publication may contain at most ${MAX_ACTION_ITEMS_PER_BUNDLE} Action Items.`
    );
  }

  const now = Date.now();
  const primaryReference = bundle.references.find(
    (reference) => reference.primary
  );
  const authorDisplayName =
    authorization.participants.find(
      (participant) => participant.workosUserId === authorization.viewer.subject
    )?.displayName ??
    authorization.viewer.email ??
    authorization.viewer.subject;
  const postId = await ctx.db.insert("buildCollaborationPosts", {
    acknowledgementRequired: bundle.acknowledgementRequired ?? false,
    agentDrafted: input.agentDrafted,
    announcementProminent: bundle.postType === "announcement",
    audienceFloorTier: authorization.effectiveRole.tier,
    audienceMode: bundle.audienceMode,
    authorDisplayNameSnapshot: authorDisplayName,
    authorRole: authorization.effectiveRole.role,
    authorRolesSnapshot: authorization.roles,
    authorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    commentCount: 0,
    contentState: "active",
    createdAt: now,
    lastMeaningfulActivityAt: now,
    latestActivityActorWorkosUserId: authorization.viewer.subject,
    openActionItemCount: bundle.actionItems.length,
    organizationId: authorization.organizationId,
    postType: bundle.postType,
    primaryReferenceId: primaryReference?.entityId,
    primaryReferenceKind: primaryReference?.entityKind,
    readRevision: 1,
    revision: 1,
    source: "human",
    threadState: "open",
    threadRevision: 0,
    updatedAt: now,
  });
  const postRevisionId = await ctx.db.insert(
    "buildCollaborationPostRevisions",
    {
      authorRole: authorization.effectiveRole.role,
      authorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      contentHash: stableContentHash(content.tiptapJson),
      createdAt: now,
      organizationId: authorization.organizationId,
      plainText: content.plainText,
      postId,
      revision: 1,
      tiptapJson: content.tiptapJson,
    }
  );
  await ctx.db.patch(postId, { currentRevisionId: postRevisionId });

  await persistAudience(ctx, {
    authorization,
    audience,
    postId,
    postRevisionId,
    now,
  });
  await persistReferences(ctx, {
    authorization,
    now,
    ownerRecordId: postRevisionId,
    postId,
    references: bundle.references,
  });
  await persistAttachments(ctx, {
    assetIds: bundle.attachmentAssetIds,
    audienceMode: bundle.audienceMode,
    authorization,
    now,
    postId,
    postRevisionId,
    readerWorkosUserIds: audience.readerIds,
  });
  await createActionItems(ctx, {
    actionItems: bundle.actionItems,
    authorization,
    now,
    postId,
  });
  if (bundle.acknowledgementRequired) {
    const participantById = new Map(
      authorization.participants.map((participant) => [
        participant.workosUserId,
        participant,
      ])
    );
    for (const workosUserId of audience.readerIds) {
      const participant = participantById.get(workosUserId);
      if (
        workosUserId !== authorization.viewer.subject &&
        participant &&
        collaborationRoleTier(participant.role) <=
          authorization.effectiveRole.tier
      ) {
        await ctx.db.insert("buildCollaborationAcknowledgementTargets", {
          brokerageId: authorization.brokerage._id,
          buildId: authorization.build._id,
          createdAt: now,
          organizationId: authorization.organizationId,
          postId,
          workosUserId,
        });
      }
    }
  }
  await fanOutBuildCollaborationPublication(ctx, {
    acknowledgementTargetIds: bundle.acknowledgementRequired
      ? audience.readerIds.filter((workosUserId) => {
          const participant = authorization.participants.find(
            (candidate) => candidate.workosUserId === workosUserId
          );
          return (
            workosUserId !== authorization.viewer.subject &&
            participant !== undefined &&
            collaborationRoleTier(participant.role) <=
              authorization.effectiveRole.tier
          );
        })
      : [],
    actionAssigneeIds: bundle.actionItems.flatMap((item) =>
      item.assigneeWorkosUserId ? [item.assigneeWorkosUserId] : []
    ),
    authorization,
    effects: bundle.effectiveNotificationEffects,
    now,
    plainText: content.plainText,
    postId,
    postType: bundle.postType,
    referencedParticipantIds: bundle.references.flatMap((reference) =>
      reference.entityKind === "participant" ? [reference.entityId] : []
    ),
  });
  await persistApprovedBuildCollaborationSharedEffects(ctx, {
    authorization,
    mutations: bundle.sharedMutations,
    now,
    postId,
  });
  await ctx.db.insert("buildCollaborationFollows", {
    active: true,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    createdAt: now,
    organizationId: authorization.organizationId,
    postId,
    reason: "author",
    updatedAt: now,
    workosUserId: authorization.viewer.subject,
  });
  await recordPublicationAudit(ctx, {
    actionItemCount: bundle.actionItems.length,
    authorization,
    postId,
    referenceCount: bundle.references.length,
    now,
  });
  await emitBuildCollaborationWebhookEvent(ctx, {
    actorRole: authorization.effectiveRole.role,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    entityId: postId,
    entityType: "post",
    eventType: "build.collaboration.post.published",
    idempotencyKey: `post:${postId}:published:1`,
    metadata: {
      audienceMode: bundle.audienceMode,
      postType: bundle.postType,
      revision: 1,
    },
    occurredAt: now,
    organizationId: authorization.organizationId,
  });
  await queueBuildCollaborationSearchPostTreeRebuild(ctx, {
    authorization,
    postId,
  });

  return postId;
}

export const listBuildCollaborationFeed = authenticatedQuery
  .input({
    asOf: v.optional(v.number()),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
    filter: v.optional(
      v.union(v.literal("all"), v.literal("active_operations")),
    ),
  })
  .returns(collaborationFeedResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    // Optional as-of keeps action-item deadline presentation deterministic when
    // the client supplies a clock. Omit Date.now() here so paginated pages share
    // one evaluation instant for the request.
    const asOf = args.asOf ?? Date.now();
    const result = await ctx.db
      .query("buildCollaborationPosts")
      .withIndex("by_build_prominence_activity", (query) =>
        query.eq("buildId", authorization.build._id)
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const page: Array<
      | Awaited<ReturnType<typeof projectReadableBuildCollaborationPost>>
      | { kind: "restricted"; placeholderKey: string }
    > = [];
    for (const [index, post] of result.page.entries()) {
      if (shouldSkipBuildCollaborationFeedPost(post, args.filter)) {
        continue;
      }
      const placeholderKey = stableContentHash(
        `${args.paginationOpts.cursor ?? "initial"}:${index}`,
      );
      const canRead = await canReadCollaborationPost(ctx, authorization, post);
      if (!canRead) {
        page.push({
          kind: "restricted" as const,
          placeholderKey: `restricted-${placeholderKey}`,
        });
      } else {
        page.push(
          await projectReadableBuildCollaborationPost(ctx, {
            asOf,
            authorization,
            post,
            unavailableKey: `unavailable-${placeholderKey}`,
          }),
        );
      }
    }
    return {
      continueCursor: result.continueCursor,
      isDone: result.isDone,
      page,
    };
  })
  .public();
