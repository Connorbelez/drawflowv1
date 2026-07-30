import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  canReadCollaborationPost,
  canSeeCollaborationReceipt,
} from "./build_collaboration_access";
import { authorizeActiveBuildHumanCollaborationAccess } from "./build_collaboration_actor";
import {
  collaborationModeratedContent,
  collaborationTombstoneContent,
} from "./build_collaboration_content";
import { collaborationFeedResultValidator } from "./build_collaboration_contracts";
import { requireHumanCollaborationActor } from "./build_collaboration_human";
import {
  canCreateCustomCollaborationAudience,
  collaborationRoleTier,
  resolveCollaborationAudience,
} from "./build_collaboration_model";
import { collaborationModerationCapabilities } from "./build_collaboration_moderation";
import {
  fanOutBuildCollaborationPublication,
  resolveBuildCollaborationPublicationNotifications,
} from "./build_collaboration_notifications";
import {
  type ActionItemInput,
  type BuildCollaborationPublicationBundle,
  type BuildCollaborationPublicationBundleInput,
  canonicalizeTiptapContent,
  canonicalizeTiptapReferences,
  canonicalPublicationBundleJson,
  normalizePublicationBundle,
  publicationBundleFields,
  publicationBundleHash,
  type ReferenceInput,
} from "./build_collaboration_publication_bundle";
import {
  resolveCanonicalBuildCollaborationReferences,
  resolveCurrentBuildCollaborationReference,
} from "./build_collaboration_references";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import type { Id, MutationCtx } from "./types";

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
    const bundleJson = canonicalPublicationBundleJson(bundle);
    const bundleHash = await publicationBundleHash(bundleJson);
    const now = Date.now();
    const draftId = await ctx.db.insert("buildCollaborationDrafts", {
      approvalOwnerWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      bundleHash,
      bundleJson,
      createdAt: now,
      organizationId: authorization.organizationId,
      ownerWorkosUserId: authorization.viewer.subject,
      preparedByActorKind: "human",
      preparedByAgent: false,
      preparedByWorkosUserId: authorization.viewer.subject,
      revision: 1,
      state: "active",
      updatedAt: now,
    });
    const approvalId = await recordPublicationApproval(ctx, {
      authorization,
      bundle,
      bundleHash,
      bundleJson,
      draftId,
      draftRevision: 1,
      now,
    });
    const postId = await publishBuildCollaborationBundle(ctx, {
      agentDrafted: false,
      audience,
      authorization,
      bundle,
    });
    await ctx.db.patch(approvalId, { publishedAt: now, state: "published" });
    await ctx.db.patch(draftId, { state: "published", updatedAt: now });
    return postId;
  })
  .public();

export async function prepareBuildCollaborationPublication(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    bundle: BuildCollaborationPublicationBundleInput;
  }
) {
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
      throw new Error(
        "Every approved shared mutation requires an entity kind, operation, and summary."
      );
    }
  }
  if (normalizedEffectiveBundle.references.length > MAX_REFERENCES_PER_BUNDLE) {
    throw new Error(
      `A publication may contain at most ${MAX_REFERENCES_PER_BUNDLE} references.`
    );
  }
  if (
    normalizedEffectiveBundle.actionItems.length > MAX_ACTION_ITEMS_PER_BUNDLE
  ) {
    throw new Error(
      `A publication may contain at most ${MAX_ACTION_ITEMS_PER_BUNDLE} Action Items.`
    );
  }
  const audience = resolvePublicationAudience({
    audienceMode: normalizedEffectiveBundle.audienceMode,
    authorization: input.authorization,
    excludedReaderIds: normalizedEffectiveBundle.excludedReaderIds,
    requestedReaderIds: normalizedEffectiveBundle.requestedReaderIds,
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
  const effectiveNotificationEffects =
    await resolveBuildCollaborationPublicationNotifications(ctx, {
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
  await requireHumanCollaborationActor(ctx, authorization);
  if (
    bundle.postType === "announcement" &&
    authorization.effectiveRole.tier < 3
  ) {
    throw new Error(
      "Announcements may only be published by the Builder or lender coordination team."
    );
  }
  const content = validateRichTextContent({
    plainText: bundle.plainText,
    tiptapJson: bundle.tiptapJson,
  });
  if (bundle.references.length > MAX_REFERENCES_PER_BUNDLE) {
    throw new Error(
      `A publication may contain at most ${MAX_REFERENCES_PER_BUNDLE} references.`
    );
  }
  if (bundle.actionItems.length > MAX_ACTION_ITEMS_PER_BUNDLE) {
    throw new Error(
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
    authorization,
    now,
    postRevisionId,
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
  await persistApprovedSharedMutations(ctx, {
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

  return postId;
}

export const listBuildCollaborationFeed = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  })
  .returns(collaborationFeedResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const result = await ctx.db
      .query("buildCollaborationPosts")
      .withIndex("by_buildId_and_lastMeaningfulActivityAt", (query) =>
        query.eq("buildId", authorization.build._id)
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const page = await Promise.all(
      result.page.map(async (post, index) => {
        const placeholderKey = stableContentHash(
          `${args.paginationOpts.cursor ?? "initial"}:${index}`
        );
        const canRead = await canReadCollaborationPost(
          ctx,
          authorization,
          post
        );
        if (!canRead) {
          return {
            kind: "restricted" as const,
            placeholderKey: `restricted-${placeholderKey}`,
          };
        }
        const revision = post.currentRevisionId
          ? await ctx.db.get(post.currentRevisionId)
          : null;
        if (!revision || revision.postId !== post._id) {
          return {
            kind: "unavailable" as const,
            placeholderKey: `unavailable-${placeholderKey}`,
          };
        }
        const moderationCase = post.activeModerationCaseId
          ? await ctx.db.get(post.activeModerationCaseId)
          : null;
        const moderationCapabilities = collaborationModerationCapabilities({
          authorRole: post.authorRole,
          authorWorkosUserId: post.authorWorkosUserId,
          caseStatus: moderationCase?.status,
          contentState: post.contentState,
          minimumReviewerTier: moderationCase?.appealReviewerMinimumTier,
          viewerRole: authorization.effectiveRole.role,
          viewerWorkosUserId: authorization.viewer.subject,
        });
        if (post.contentState !== "active") {
          const replacement =
            post.contentState === "tombstoned"
              ? collaborationTombstoneContent("post")
              : collaborationModeratedContent("post");
          return {
            acknowledgement: { acknowledged: false, required: false },
            actionItems: [],
            following: false,
            kind: "post" as const,
            pins: [],
            post: {
              _creationTime: post._creationTime,
              _id: post._id,
              agentDrafted: post.agentDrafted,
              audienceMode: post.audienceMode,
              authorDisplayNameSnapshot: post.authorDisplayNameSnapshot,
              authorRole: post.authorRole,
              authorWorkosUserId: post.authorWorkosUserId,
              commentCount: 0,
              contentState: post.contentState,
              createdAt: post.createdAt,
              postType: post.postType,
              readRevision: post.readRevision ?? post.revision,
              revision: post.revision,
              source: post.source,
              updatedAt: post.updatedAt,
              viewerCanAppeal: moderationCapabilities.canAppeal,
              viewerCanModerate: moderationCapabilities.canModerate,
              viewerCanResolveAppeal: moderationCapabilities.canResolveAppeal,
              viewerIsAuthor:
                post.authorWorkosUserId === authorization.viewer.subject,
            },
            reactions: [],
            receipts: [],
            references: [],
            revision: {
              _creationTime: revision._creationTime,
              _id: revision._id,
              createdAt: post.updatedAt,
              editReason: undefined,
              plainText: replacement.plainText,
              revision: post.revision,
              tiptapJson: replacement.tiptapJson,
            },
          };
        }
        const [
          references,
          actionItems,
          reactions,
          pins,
          receipts,
          follows,
          acknowledgementTargets,
          acknowledgements,
        ] = await Promise.all([
          ctx.db
            .query("buildCollaborationReferences")
            .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
              query
                .eq("ownerKind", "postRevision")
                .eq("ownerRecordId", revision._id)
            )
            .take(MAX_REFERENCES_PER_BUNDLE),
          ctx.db
            .query("buildActionItems")
            .withIndex("by_originatingPostId_and_status", (query) =>
              query.eq("originatingPostId", post._id)
            )
            .take(MAX_ACTION_ITEMS_PER_BUNDLE),
          ctx.db
            .query("buildCollaborationReactions")
            .withIndex("by_postId_and_workosUserId", (query) =>
              query.eq("postId", post._id)
            )
            .take(500),
          ctx.db
            .query("buildCollaborationPins")
            .withIndex("by_postId_and_workosUserId_and_kind", (query) =>
              query
                .eq("postId", post._id)
                .eq("workosUserId", authorization.viewer.subject)
            )
            .take(20),
          ctx.db
            .query("buildCollaborationReceipts")
            .withIndex("by_postId_and_workosUserId", (query) =>
              query.eq("postId", post._id)
            )
            .take(500),
          ctx.db
            .query("buildCollaborationFollows")
            .withIndex("by_postId_and_workosUserId", (query) =>
              query
                .eq("postId", post._id)
                .eq("workosUserId", authorization.viewer.subject)
            )
            .take(20),
          ctx.db
            .query("buildCollaborationAcknowledgementTargets")
            .withIndex("by_postId_and_workosUserId", (query) =>
              query
                .eq("postId", post._id)
                .eq("workosUserId", authorization.viewer.subject)
            )
            .take(20),
          ctx.db
            .query("buildCollaborationAcknowledgements")
            .withIndex("by_postId_and_workosUserId", (query) =>
              query
                .eq("postId", post._id)
                .eq("workosUserId", authorization.viewer.subject)
            )
            .take(20),
        ]);
        const acknowledgementTarget = acknowledgementTargets.find(
          (target) => !target.waivedAt
        );
        return {
          acknowledgement: acknowledgementTarget
            ? {
                acknowledged: acknowledgements.some(
                  (acknowledgement) =>
                    acknowledgement.acknowledgedRevision >= post.revision
                ),
                dueAt: acknowledgementTarget.dueAt,
                required: true,
              }
            : { acknowledged: false, required: false },
          actionItems: actionItems.map((item) => ({
            _creationTime: item._creationTime,
            _id: item._id,
            currentRevision: item.currentRevision,
            priority: item.priority,
            status: item.status,
            title: item.title,
          })),
          following: follows.some((follow) => follow.active),
          kind: "post" as const,
          pins: pins.map((pin) => ({
            _creationTime: pin._creationTime,
            _id: pin._id,
          })),
          post: {
            _creationTime: post._creationTime,
            _id: post._id,
            agentDrafted: post.agentDrafted,
            audienceMode: post.audienceMode,
            authorDisplayNameSnapshot: post.authorDisplayNameSnapshot,
            authorRole: post.authorRole,
            authorWorkosUserId: post.authorWorkosUserId,
            commentCount: post.commentCount,
            contentState: post.contentState,
            createdAt: post.createdAt,
            postType: post.postType,
            readRevision: post.readRevision ?? post.revision,
            revision: post.revision,
            source: post.source,
            updatedAt: post.updatedAt,
            viewerCanAppeal: moderationCapabilities.canAppeal,
            viewerCanModerate: moderationCapabilities.canModerate,
            viewerCanResolveAppeal: moderationCapabilities.canResolveAppeal,
            viewerIsAuthor:
              post.authorWorkosUserId === authorization.viewer.subject,
          },
          reactions: reactions.map((reaction) => ({
            _creationTime: reaction._creationTime,
            _id: reaction._id,
            reaction: reaction.reaction,
            workosUserId: reaction.workosUserId,
          })),
          receipts: receipts
            .filter((receipt) =>
              canSeeCollaborationReceipt(authorization, receipt)
            )
            .map((receipt) => ({
              _creationTime: receipt._creationTime,
              _id: receipt._id,
              lastViewedAt: receipt.lastViewedAt,
              latestRevisionViewed: receipt.latestRevisionViewed,
              viewerRole: receipt.viewerRole,
              workosUserId: receipt.workosUserId,
            })),
          references: await Promise.all(
            references.map(async (reference) => {
              try {
                const current = await resolveCurrentBuildCollaborationReference(
                  ctx,
                  {
                    authorization,
                    entityId: reference.entityId,
                    entityKind: reference.entityKind,
                  }
                );
                return {
                  _creationTime: reference._creationTime,
                  _id: reference._id,
                  entityId: reference.entityId,
                  entityKind: reference.entityKind,
                  labelSnapshot: current.label,
                  summarySnapshot: current.summary,
                };
              } catch {
                return {
                  _creationTime: reference._creationTime,
                  _id: reference._id,
                  entityId: reference.entityId,
                  entityKind: reference.entityKind,
                  labelSnapshot: "Unavailable reference",
                  summarySnapshot: undefined,
                };
              }
            })
          ),
          revision: {
            _creationTime: revision._creationTime,
            _id: revision._id,
            createdAt: revision.createdAt,
            editReason: revision.editReason,
            plainText: revision.plainText,
            revision: revision.revision,
            tiptapJson: revision.tiptapJson,
          },
        };
      })
    );

    return { ...result, page };
  })
  .public();

function validateRichTextContent(input: {
  plainText: string;
  tiptapJson: string;
}) {
  const content = canonicalizeTiptapContent(input.tiptapJson);
  const plainText = content.plainText;
  if (plainText.length > MAX_PLAIN_TEXT_LENGTH) {
    throw new Error(
      `Post text may not exceed ${MAX_PLAIN_TEXT_LENGTH} characters.`
    );
  }
  if (input.tiptapJson.length > MAX_RICH_TEXT_LENGTH) {
    throw new Error(
      `Post rich text may not exceed ${MAX_RICH_TEXT_LENGTH} characters.`
    );
  }
  return content;
}

function resolveEffectiveActionItems(input: {
  actionItems: ActionItemInput[];
  authorization: ActiveBuildAuthorization;
}) {
  return input.actionItems.map((actionItem) => {
    if (!actionItem.title) {
      throw new Error("Every Action Item requires a title.");
    }
    const assigneeParticipant = actionItem.assigneeWorkosUserId
      ? input.authorization.participants.find(
          (participant) =>
            participant.workosUserId === actionItem.assigneeWorkosUserId
        )
      : undefined;
    if (actionItem.assigneeWorkosUserId && !assigneeParticipant) {
      throw new Error("Action Item assignees must participate in this Build.");
    }
    const upwardAssignment =
      assigneeParticipant !== undefined &&
      collaborationRoleTier(assigneeParticipant.role) >
        input.authorization.effectiveRole.tier;
    const requiresAcceptance =
      actionItem.requiresAcceptance ?? upwardAssignment;
    return {
      ...actionItem,
      effectiveAssignmentState: actionItem.assigneeWorkosUserId
        ? requiresAcceptance
          ? ("requested" as const)
          : ("assigned" as const)
        : ("unassigned" as const),
      requiresAcceptance,
    };
  });
}

async function persistAttachments(
  ctx: MutationCtx,
  input: {
    assetIds: Id<"buildCollaborationAssets">[];
    authorization: ActiveBuildAuthorization;
    now: number;
    postRevisionId: Id<"buildCollaborationPostRevisions">;
  }
) {
  for (const assetId of new Set(input.assetIds)) {
    const asset = await ctx.db.get(assetId);
    if (
      !asset ||
      asset.buildId !== input.authorization.build._id ||
      asset.organizationId !== input.authorization.organizationId ||
      asset.brokerageId !== input.authorization.brokerage._id ||
      asset.state !== "available"
    ) {
      throw new Error("A proposed collaboration asset is unavailable.");
    }
    await ctx.db.insert("buildCollaborationAttachments", {
      attachmentId: asset._id,
      attachmentKind: "collaborationAsset",
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      createdByWorkosUserId: input.authorization.viewer.subject,
      organizationId: input.authorization.organizationId,
      ownerKind: "postRevision",
      ownerRecordId: input.postRevisionId,
    });
  }
}

async function persistApprovedSharedMutations(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    mutations: BuildCollaborationPublicationBundle["sharedMutations"];
    now: number;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  for (const mutation of input.mutations) {
    await ctx.db.insert("eventOutbox", {
      brokerageId: input.authorization.brokerage._id,
      createdAt: input.now,
      eventType: "build_collaboration.shared_mutation.requested",
      organizationId: input.authorization.organizationId,
      payloadPreview: JSON.stringify({
        approvedByWorkosUserId: input.authorization.viewer.subject,
        entityId: mutation.entityId,
        entityKind: mutation.entityKind,
        operation: mutation.operation,
        postId: input.postId,
        summary: mutation.summary,
      }),
      relatedEntityId: input.postId,
      relatedEntityType: "buildCollaborationPost",
      status: "pending",
    });
  }
}

async function recordPublicationApproval(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    bundle: BuildCollaborationPublicationBundle;
    bundleHash: string;
    bundleJson: string;
    draftId: Id<"buildCollaborationDrafts">;
    draftRevision: number;
    now: number;
  }
) {
  return await ctx.db.insert("buildCollaborationPublicationApprovals", {
    approvedAt: input.now,
    approvingActorKind: "human",
    approvingWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    bundleHash: input.bundleHash,
    bundleJsonSnapshot: input.bundleJson,
    draftId: input.draftId,
    draftRevision: input.draftRevision,
    mutationSummaryJson: JSON.stringify({
      actionItemCount: input.bundle.actionItems.length,
      attachmentAssetCount: input.bundle.attachmentAssetIds.length,
      notificationEffectCount: input.bundle.effectiveNotificationEffects.length,
      referenceCount: input.bundle.references.length,
      sharedMutationCount: input.bundle.sharedMutations.length,
    }),
    organizationId: input.authorization.organizationId,
    readerSummaryJson: JSON.stringify({
      audienceMode: input.bundle.audienceMode,
      effectiveReaderIds: input.bundle.effectiveReaderIds,
      excludedReaderIds: input.bundle.excludedReaderIds,
      mandatoryReaderIds: input.bundle.mandatoryReaderIds,
      requestedReaderIds: input.bundle.requestedReaderIds,
    }),
    state: "approved",
  });
}

function resolvePublicationAudience(input: {
  audienceMode: "author_tier_and_higher" | "build_wide" | "custom";
  authorization: ActiveBuildAuthorization;
  excludedReaderIds: string[];
  requestedReaderIds: string[];
}) {
  const participants = input.authorization.participants.map((participant) => ({
    id: participant.workosUserId,
    roles: [participant.role],
  }));
  if (
    !participants.some(
      (participant) => participant.id === input.authorization.viewer.subject
    )
  ) {
    participants.push({
      id: input.authorization.viewer.subject,
      roles: [input.authorization.effectiveRole.role],
    });
  }
  let resolved:
    | {
        excludedParticipantIds: string[];
        mandatoryReaderIds: string[];
        readerIds: string[];
        status: "allowed";
      }
    | ReturnType<typeof resolveCollaborationAudience>;
  if (input.audienceMode === "build_wide") {
    const readerIds = participants.map((participant) => participant.id).sort();
    resolved = {
      excludedParticipantIds: [],
      mandatoryReaderIds: participants
        .filter(
          (participant) =>
            collaborationRoleTier(participant.roles[0]) >=
            input.authorization.effectiveRole.tier
        )
        .map((participant) => participant.id)
        .sort(),
      readerIds,
      status: "allowed",
    };
  } else if (input.audienceMode === "author_tier_and_higher") {
    const readerIds = participants
      .filter(
        (participant) =>
          collaborationRoleTier(participant.roles[0]) >=
          input.authorization.effectiveRole.tier
      )
      .map((participant) => participant.id)
      .sort();
    resolved = {
      excludedParticipantIds: participants
        .map((participant) => participant.id)
        .filter((id) => !readerIds.includes(id)),
      mandatoryReaderIds: readerIds,
      readerIds,
      status: "allowed" as const,
    };
  } else {
    if (!canCreateCustomCollaborationAudience(input.authorization.roles)) {
      throw new Error(
        "Custom audiences are unavailable for this Build role. Higher-tier participants must remain able to read the post."
      );
    }
    const participantIds = new Set(
      participants.map((participant) => participant.id)
    );
    if (
      input.requestedReaderIds.some(
        (requestedReaderId) => !participantIds.has(requestedReaderId)
      )
    ) {
      throw new Error(
        "Custom audience readers must be active Build participants."
      );
    }
    resolved = resolveCollaborationAudience({
      authorId: input.authorization.viewer.subject,
      authorRoles: input.authorization.roles,
      participants,
      requestedReaderIds: input.requestedReaderIds,
    });
  }
  if (resolved.status === "blocked") {
    throw new Error(
      "The selected audience conflicts with the referenced entity permissions."
    );
  }
  const participantIds = new Set(
    participants.map((participant) => participant.id)
  );
  const excludedReaderIds = [
    ...new Set(input.excludedReaderIds.map((readerId) => readerId.trim())),
  ].filter(Boolean);
  if (excludedReaderIds.some((readerId) => !participantIds.has(readerId))) {
    throw new Error("Excluded readers must be active Build participants.");
  }
  if (
    excludedReaderIds.some((readerId) =>
      resolved.mandatoryReaderIds.includes(readerId)
    )
  ) {
    throw new Error(
      "Higher-tier and same-tier participants cannot be excluded from a publication."
    );
  }
  return {
    ...resolved,
    excludedParticipantIds: [
      ...new Set([...resolved.excludedParticipantIds, ...excludedReaderIds]),
    ].sort(),
    readerIds: resolved.readerIds
      .filter((readerId) => !excludedReaderIds.includes(readerId))
      .sort(),
  };
}

async function persistAudience(
  ctx: MutationCtx,
  input: {
    audience: {
      excludedParticipantIds: string[];
      mandatoryReaderIds: string[];
      readerIds: string[];
    };
    authorization: ActiveBuildAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    postRevisionId: Id<"buildCollaborationPostRevisions">;
  }
) {
  const common = {
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    organizationId: input.authorization.organizationId,
    postId: input.postId,
  };
  for (const workosUserId of input.audience.readerIds) {
    await ctx.db.insert("buildCollaborationAudienceMembers", {
      ...common,
      addedByWorkosUserId: input.authorization.viewer.subject,
      createdAt: input.now,
      workosUserId,
    });
    await ctx.db.insert("buildCollaborationAudienceSnapshots", {
      ...common,
      createdAt: input.now,
      postRevisionId: input.postRevisionId,
      reason: input.audience.mandatoryReaderIds.includes(workosUserId)
        ? "role hierarchy"
        : "explicit audience",
      resolution: input.audience.mandatoryReaderIds.includes(workosUserId)
        ? "mandatory"
        : "reader",
      workosUserId,
    });
  }
  for (const workosUserId of input.audience.excludedParticipantIds) {
    await ctx.db.insert("buildCollaborationAudienceSnapshots", {
      ...common,
      createdAt: input.now,
      postRevisionId: input.postRevisionId,
      reason: "excluded by author within role hierarchy",
      resolution: "excluded",
      workosUserId,
    });
  }
}

async function persistReferences(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    now: number;
    ownerRecordId: Id<"buildCollaborationPostRevisions">;
    postId: Id<"buildCollaborationPosts">;
    references: ReferenceInput[];
  }
) {
  for (const reference of input.references) {
    await ctx.db.insert("buildCollaborationReferences", {
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      entityId: reference.entityId,
      entityKind: reference.entityKind,
      labelSnapshot: reference.label,
      organizationId: input.authorization.organizationId,
      ownerKind: "postRevision",
      ownerRecordId: input.ownerRecordId,
      postId: input.postId,
      primary: reference.primary ?? false,
      summarySnapshot: reference.summary,
    });
  }
}

async function createActionItems(
  ctx: MutationCtx,
  input: {
    actionItems: ActionItemInput[];
    authorization: ActiveBuildAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  for (const actionItem of input.actionItems) {
    const { assignee, assignmentState, requiresAcceptance } =
      resolveApprovedActionItemAssignment(actionItem, input.authorization);
    const descriptionPlainText = actionItem.descriptionPlainText ?? "";
    const descriptionTiptapJson =
      actionItem.descriptionTiptapJson ??
      JSON.stringify({ content: [], type: "doc" });
    validateOptionalTiptapJson(descriptionTiptapJson);
    const primaryReference = actionItem.references?.find(
      (reference) => reference.primary
    );
    const actionItemId = await ctx.db.insert("buildActionItems", {
      assigneeWorkosUserId: assignee,
      assignedByWorkosUserId: assignee
        ? input.authorization.viewer.subject
        : undefined,
      assignmentRequestedAt:
        assignmentState === "requested" ? input.now : undefined,
      assignmentState,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      creatorWorkosUserId: input.authorization.viewer.subject,
      creatorRole: input.authorization.effectiveRole.role,
      currentRevision: 1,
      descriptionPlainText,
      descriptionTiptapJson,
      dueAt: actionItem.dueAt,
      originatingPostId: input.postId,
      organizationId: input.authorization.organizationId,
      priority: actionItem.priority ?? "none",
      primaryReferenceId: primaryReference?.entityId,
      primaryReferenceKind: primaryReference?.entityKind,
      requiresAcceptance,
      status: "todo",
      title: actionItem.title,
      updatedAt: input.now,
    });
    await ctx.db.insert("buildActionItemEvents", {
      actionItemId,
      actorRole: input.authorization.effectiveRole.role,
      actorWorkosUserId: input.authorization.viewer.subject,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      eventType: "created",
      exercisedAuthority: "creator",
      newState: JSON.stringify({
        assigneeWorkosUserId: assignee,
        assignmentState,
        priority: actionItem.priority ?? "none",
        status: "todo",
      }),
      organizationId: input.authorization.organizationId,
      revision: 1,
      warnings:
        assignmentState === "requested" ? ["assignment_requested"] : undefined,
    });
    await persistActionItemReferences(ctx, {
      actionItemId,
      authorization: input.authorization,
      now: input.now,
      postId: input.postId,
      references: actionItem.references ?? [],
    });
  }
}

function resolveApprovedActionItemAssignment(
  actionItem: ActionItemInput,
  authorization: ActiveBuildAuthorization
) {
  const assignee = actionItem.assigneeWorkosUserId;
  const assigneeParticipant = assignee
    ? authorization.participants.find(
        (participant) => participant.workosUserId === assignee
      )
    : undefined;
  const upwardAssignment =
    assigneeParticipant !== undefined &&
    collaborationRoleTier(assigneeParticipant.role) >
      authorization.effectiveRole.tier;
  const requiresAcceptance = actionItem.requiresAcceptance ?? false;
  const expectedAssignmentState = assignee
    ? requiresAcceptance
      ? ("requested" as const)
      : ("assigned" as const)
    : ("unassigned" as const);
  if (
    actionItem.effectiveAssignmentState !== expectedAssignmentState ||
    requiresAcceptance !== (actionItem.requiresAcceptance ?? upwardAssignment)
  ) {
    throw new Error(
      "The approved Action Item assignment state is no longer effective."
    );
  }
  return {
    assignee,
    assignmentState: actionItem.effectiveAssignmentState,
    requiresAcceptance,
  };
}

async function persistActionItemReferences(
  ctx: MutationCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    authorization: ActiveBuildAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    references: ReferenceInput[];
  }
) {
  for (const reference of input.references) {
    await ctx.db.insert("buildCollaborationReferences", {
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      entityId: reference.entityId,
      entityKind: reference.entityKind,
      labelSnapshot: reference.label,
      organizationId: input.authorization.organizationId,
      ownerKind: "actionItem",
      ownerRecordId: input.actionItemId,
      postId: input.postId,
      primary: reference.primary ?? false,
      summarySnapshot: reference.summary,
    });
  }
}

async function recordPublicationAudit(
  ctx: MutationCtx,
  input: {
    actionItemCount: number;
    authorization: ActiveBuildAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    referenceCount: number;
  }
) {
  const newState = JSON.stringify({
    actionItemCount: input.actionItemCount,
    referenceCount: input.referenceCount,
    status: "published",
  });
  await ctx.db.insert("auditEvents", {
    actorRoles: input.authorization.roles,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    command: "approveAndPublishBuildCollaborationBundle",
    createdAt: input.now,
    entityId: input.postId,
    entityType: "buildCollaborationPost",
    eventType: "build.collaboration.post.published",
    newState,
    organizationId: input.authorization.organizationId,
    warnings: [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.authorization.brokerage._id,
    createdAt: input.now,
    eventType: "build.collaboration.post.published",
    organizationId: input.authorization.organizationId,
    payloadPreview: newState,
    relatedEntityId: input.postId,
    relatedEntityType: "buildCollaborationPost",
    status: "pending",
  });
}

export function stableContentHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) % 4_294_967_296;
  }
  return `djb2-${hash.toString(16).padStart(8, "0")}`;
}

function validateOptionalTiptapJson(value: string) {
  if (value.length > MAX_RICH_TEXT_LENGTH) {
    throw new Error("Action Item rich text is too long.");
  }
  try {
    const parsed = JSON.parse(value) as { type?: unknown };
    if (parsed.type !== "doc") {
      throw new Error("TipTap document root must have type doc.");
    }
  } catch {
    throw new Error("Action Item description must be valid TipTap JSON.");
  }
}
