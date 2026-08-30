import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  canReadCollaborationPost,
  resolveCurrentCollaborationNotificationReaderIds,
  resolveCurrentCollaborationPostReaderIds,
} from "./build_collaboration_access";
import { authorizeActiveBuildHumanCollaborationAccess } from "./build_collaboration_actor";
import {
  canReadDrawCoordination,
  resolveCurrentDrawCoordinationReaderIds,
} from "./build_draw_coordination";
import { projectCollaborationAssetAttachments } from "./build_collaboration_asset_projection";
import { persistGovernedCollaborationAssetAttachments } from "./build_collaboration_asset_publication";
import {
  collaborationModeratedContent,
  collaborationTombstoneContent,
  projectCollaborationRevisionForViewer,
} from "./build_collaboration_content";
import {
  collaborationCommentRowValidator,
  collaborationFocusedCommentContextValidator,
} from "./build_collaboration_contracts";
import { collaborationModerationCapabilities } from "./build_collaboration_moderation";
import { emitCanonicalBuildCollaborationNotification } from "./build_collaboration_notifications";
import {
  canonicalizeTiptapReferences,
  type ReferenceInput,
} from "./build_collaboration_publication_bundle";
import {
  type CanonicalBuildCollaborationReference,
  resolveCanonicalBuildCollaborationReferences,
  resolveCurrentBuildCollaborationReference,
} from "./build_collaboration_references";
import { reopenResolvedThreadForReply } from "./build_collaboration_resolution";
import { requireBuildCollaborationWritable } from "./build_collaboration_lifecycle_state";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import { queueBuildCollaborationSearchOwnerRebuild } from "./build_collaboration_search_maintenance";
import {
  buildCollaborationPinKindValidator,
  buildCollaborationReactionValidator,
  buildCollaborationReferenceKindValidator,
} from "./build_collaboration_validators";
import { isDrawSystemPost } from "./build_collaboration_system_event_access";
import { emitBuildCollaborationWebhookEvent } from "./build_collaboration_webhooks";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

import {
  canPinForBuild,
  loadFocusedThreadComments,
  persistCommentAttachments,
  projectThreadComments,
} from "./build_collaboration_threads/projection";

const MAX_COMMENT_TEXT_LENGTH = 25_000;
const MAX_COMMENT_RICH_TEXT_LENGTH = 125_000;
const MAX_THREAD_COMMENTS = 1000;
const MAX_LOGICAL_DEPTH = 50;
const MAX_THREAD_FOLLOWS = 2000;

const referenceInputValidator = v.object({
  entityKind: buildCollaborationReferenceKindValidator,
  entityId: v.string(),
  label: v.string(),
  primary: v.optional(v.boolean()),
  summary: v.optional(v.string()),
});

export const addBuildCollaborationComment = authenticatedMutation
  .input({
    attachmentAssetIds: v.optional(v.array(v.id("buildCollaborationAssets"))),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    parentCommentId: v.optional(v.id("buildCollaborationComments")),
    plainText: v.string(),
    postId: v.id("buildCollaborationPosts"),
    references: v.array(referenceInputValidator),
    tiptapJson: v.string(),
  })
  .returns(v.id("buildCollaborationComments"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    return await addBuildCollaborationCommentForAuthorization(
      ctx,
      authorization,
      args
    );
  })
  .public();

export async function addBuildCollaborationCommentForAuthorization(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  args: {
    attachmentAssetIds?: Id<"buildCollaborationAssets">[];
    parentCommentId?: Id<"buildCollaborationComments">;
    plainText: string;
    postId: Id<"buildCollaborationPosts">;
    references: ReferenceInput[];
    tiptapJson: string;
  }
) {
  assertHumanPublication(authorization.viewer.subject);
  await requireBuildCollaborationWritable(ctx, authorization);
  const post = await ctx.db.get(args.postId);
  if (
    !post ||
    post.buildId !== authorization.build._id ||
    !(await canReadCollaborationPost(ctx, authorization, post)) ||
    (isDrawSystemPost(post) &&
      !(await canReadDrawCoordination(ctx, { authorization, post })))
  ) {
    throw new Error("Forbidden: collaboration post");
  }
  const submittedContent = validateCommentContent(args);
  const parent = args.parentCommentId
    ? await ctx.db.get(args.parentCommentId)
    : null;
  if (
    args.parentCommentId &&
    (!parent ||
      parent.organizationId !== authorization.organizationId ||
      parent.brokerageId !== authorization.brokerage._id ||
      parent.postId !== post._id ||
      parent.buildId !== authorization.build._id ||
      parent.contentState !== "active")
  ) {
    throw new Error("The parent reply is unavailable.");
  }
  const logicalDepth = parent ? parent.logicalDepth + 1 : 0;
  if (logicalDepth > MAX_LOGICAL_DEPTH) {
    throw new Error(
      `Reply nesting may not exceed ${MAX_LOGICAL_DEPTH} logical levels.`
    );
  }
  const currentReaderIds = isDrawSystemPost(post)
    ? await resolveCurrentDrawCoordinationReaderIds(ctx, authorization, post)
    : await resolveCurrentCollaborationPostReaderIds(ctx, authorization, post);
  const references = await resolveCanonicalBuildCollaborationReferences(ctx, {
    authorization,
    readerIds: currentReaderIds,
    references: args.references.slice(0, 100),
  });
  const content = canonicalizeTiptapReferences(
    submittedContent.tiptapJson,
    references
  );
  const now = Date.now();
  const displayName =
    authorization.participants.find(
      (participant) => participant.workosUserId === authorization.viewer.subject
    )?.displayName ??
    authorization.viewer.email ??
    authorization.viewer.subject;
  const commentId = await ctx.db.insert("buildCollaborationComments", {
    authorDisplayNameSnapshot: displayName,
    authorRole: authorization.effectiveRole.role,
    authorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    contentState: "active",
    createdAt: now,
    logicalDepth,
    organizationId: authorization.organizationId,
    parentCommentId: parent?._id,
    postId: post._id,
    revision: 1,
    updatedAt: now,
  });
  const revisionId = await ctx.db.insert("buildCollaborationCommentRevisions", {
    authorRole: authorization.effectiveRole.role,
    authorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    commentId,
    contentHash: stableContentHash(content.tiptapJson),
    createdAt: now,
    organizationId: authorization.organizationId,
    plainText: content.plainText,
    postId: post._id,
    revision: 1,
    tiptapJson: content.tiptapJson,
  });
  await ctx.db.patch(commentId, { currentRevisionId: revisionId });
  await persistCommentAttachments(ctx, {
    assetIds: args.attachmentAssetIds ?? [],
    authorization,
    now,
    post,
    revisionId,
    readerWorkosUserIds: currentReaderIds,
  });
  await reopenResolvedThreadForReply(ctx, {
    authorization,
    now,
    post,
  });
  await ctx.db.patch(post._id, {
    commentCount: post.commentCount + 1,
    lastMeaningfulActivityAt: now,
    latestActivityActorWorkosUserId: authorization.viewer.subject,
    updatedAt: now,
  });
  for (const reference of references) {
    await ctx.db.insert("buildCollaborationReferences", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      entityId: reference.entityId,
      entityKind: reference.entityKind,
      labelSnapshot: reference.label,
      organizationId: authorization.organizationId,
      ownerKind: "commentRevision",
      ownerRecordId: revisionId,
      postId: post._id,
      primary: reference.primary ?? false,
      summarySnapshot: reference.summary,
    });
  }
  await ensureFollow(ctx, {
    authorization,
    now,
    postId: post._id,
    reason: "commenter",
    workosUserId: authorization.viewer.subject,
  });
  const notificationReaderIds =
    await resolveCurrentCollaborationNotificationReaderIds(
      ctx,
      authorization,
      post
    );
  await emitCommentNotifications(ctx, {
    authorization,
    commentId,
    now,
    plainText: content.plainText,
    post,
    readerIds: notificationReaderIds,
    references,
  });
  await ctx.db.insert("auditEvents", {
    actorRoles: authorization.roles,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    command: "addBuildCollaborationComment",
    createdAt: now,
    entityId: commentId,
    entityType: "buildCollaborationComment",
    eventType: "build.collaboration.comment.published",
    newState: JSON.stringify({ postId: post._id, revision: 1 }),
    organizationId: authorization.organizationId,
    warnings: [],
  });
  await emitBuildCollaborationWebhookEvent(ctx, {
    actorRole: authorization.effectiveRole.role,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    entityId: commentId,
    entityType: "comment",
    eventType: "build.collaboration.comment.published",
    idempotencyKey: `comment:${commentId}:published:1`,
    metadata: { postId: post._id, revision: 1 },
    occurredAt: now,
    organizationId: authorization.organizationId,
  });
  await queueBuildCollaborationSearchOwnerRebuild(ctx, {
    authorization,
    owner: { id: commentId, kind: "comment" },
    postId: post._id,
  });
  return commentId;
}

export const listBuildCollaborationComments = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
  })
  .returns(v.array(collaborationCommentRowValidator))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const post = await ctx.db.get(args.postId);
    if (
      !(post && (await canReadCollaborationPost(ctx, authorization, post))) ||
      (post &&
        isDrawSystemPost(post) &&
        !(await canReadDrawCoordination(ctx, { authorization, post })))
    ) {
      throw new Error("Forbidden: collaboration post");
    }
    if (post.contentState !== "active") {
      return [];
    }
    const comments = await ctx.db
      .query("buildCollaborationComments")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id)
      )
      .take(MAX_THREAD_COMMENTS);
    return await projectThreadComments(ctx, authorization, comments);
  })
  .public();

export const getFocusedBuildCollaborationCommentContext = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    commentId: v.id("buildCollaborationComments"),
    organizationId: v.string(),
  })
  .returns(collaborationFocusedCommentContextValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const focus = await ctx.db.get(args.commentId);
    if (
      !focus ||
      focus.organizationId !== authorization.organizationId ||
      focus.brokerageId !== authorization.brokerage._id ||
      focus.buildId !== authorization.build._id
    ) {
      return { state: "revoked" as const };
    }
    const post = await ctx.db.get(focus.postId);
    if (
      !post ||
      post.contentState !== "active" ||
      !(await canReadCollaborationPost(ctx, authorization, post)) ||
      (isDrawSystemPost(post) &&
        !(await canReadDrawCoordination(ctx, { authorization, post })))
    ) {
      return { state: "revoked" as const };
    }
    const selected = await loadFocusedThreadComments(ctx, authorization, focus);
    return {
      focusCommentId: focus._id,
      postId: post._id,
      rows: await projectThreadComments(ctx, authorization, selected),
      state: "visible" as const,
    };
  })
  .public();

export const reactToBuildCollaborationPost = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
    reaction: buildCollaborationReactionValidator,
  })
  .returns(v.union(v.id("buildCollaborationReactions"), v.null()))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const post = await ctx.db.get(args.postId);
    if (
      !(post && (await canReadCollaborationPost(ctx, authorization, post))) ||
      (post &&
        isDrawSystemPost(post) &&
        !(await canReadDrawCoordination(ctx, { authorization, post })))
    ) {
      throw new Error("Forbidden: collaboration post");
    }
    const existing = await ctx.db
      .query("buildCollaborationReactions")
      .withIndex("by_postId_and_commentId_and_workosUserId", (query) =>
        query
          .eq("postId", post._id)
          .eq("commentId", undefined)
          .eq("workosUserId", authorization.viewer.subject)
      )
      .unique();
    const now = Date.now();
    if (existing?.reaction === args.reaction) {
      await ctx.db.delete(existing._id);
      return null;
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        reaction: args.reaction,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("buildCollaborationReactions", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      organizationId: authorization.organizationId,
      postId: post._id,
      reaction: args.reaction,
      updatedAt: now,
      workosUserId: authorization.viewer.subject,
    });
  })
  .public();

export const reactToBuildCollaborationComment = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    commentId: v.id("buildCollaborationComments"),
    organizationId: v.string(),
    reaction: buildCollaborationReactionValidator,
  })
  .returns(v.union(v.id("buildCollaborationReactions"), v.null()))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const comment = await ctx.db.get(args.commentId);
    if (
      !comment ||
      comment.organizationId !== authorization.organizationId ||
      comment.brokerageId !== authorization.brokerage._id ||
      comment.buildId !== authorization.build._id ||
      comment.contentState !== "active"
    ) {
      throw new Error("The reply is unavailable.");
    }
    const post = await ctx.db.get(comment.postId);
    if (
      !post ||
      post.contentState !== "active" ||
      !(await canReadCollaborationPost(ctx, authorization, post)) ||
      (isDrawSystemPost(post) &&
        !(await canReadDrawCoordination(ctx, { authorization, post })))
    ) {
      throw new Error("Forbidden: collaboration post");
    }
    const existing = await ctx.db
      .query("buildCollaborationReactions")
      .withIndex("by_commentId_and_workosUserId", (query) =>
        query
          .eq("commentId", comment._id)
          .eq("workosUserId", authorization.viewer.subject)
      )
      .unique();
    const now = Date.now();
    if (existing?.reaction === args.reaction) {
      await ctx.db.delete(existing._id);
      return null;
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        reaction: args.reaction,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("buildCollaborationReactions", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      commentId: comment._id,
      createdAt: now,
      organizationId: authorization.organizationId,
      postId: post._id,
      reaction: args.reaction,
      updatedAt: now,
      workosUserId: authorization.viewer.subject,
    });
  })
  .public();

export const toggleBuildCollaborationPin = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    commentId: v.optional(v.id("buildCollaborationComments")),
    kind: buildCollaborationPinKindValidator,
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
  })
  .returns(v.union(v.id("buildCollaborationPins"), v.null()))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const post = await ctx.db.get(args.postId);
    if (
      !(post && (await canReadCollaborationPost(ctx, authorization, post))) ||
      (post &&
        isDrawSystemPost(post) &&
        !(await canReadDrawCoordination(ctx, { authorization, post })))
    ) {
      throw new Error("Forbidden: collaboration post");
    }
    if (args.kind === "build" && !canPinForBuild(authorization)) {
      throw new Error("Only the builder or lender team may pin for the Build.");
    }
    if (args.kind === "reply" && !args.commentId) {
      throw new Error("Reply pins require a comment.");
    }
    if (args.commentId && args.kind !== "reply") {
      throw new Error("A comment can only be pinned as a reply.");
    }
    if (args.commentId) {
      const comment = await ctx.db.get(args.commentId);
      if (
        !comment ||
        comment.organizationId !== authorization.organizationId ||
        comment.brokerageId !== authorization.brokerage._id ||
        comment.buildId !== authorization.build._id ||
        comment.postId !== post._id ||
        comment.contentState !== "active"
      ) {
        throw new Error("The reply is unavailable.");
      }
      if (
        comment.authorWorkosUserId !== authorization.viewer.subject &&
        !canPinForBuild(authorization)
      ) {
        throw new Error(
          "Only the reply author or Build coordination team may pin this reply."
        );
      }
    }
    const existing = await ctx.db
      .query("buildCollaborationPins")
      .withIndex("by_postId_and_commentId_and_workosUserId_and_kind", (query) =>
        query
          .eq("postId", post._id)
          .eq("commentId", args.commentId)
          .eq("workosUserId", authorization.viewer.subject)
          .eq("kind", args.kind)
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return null;
    }
    const now = Date.now();
    const pinId = await ctx.db.insert("buildCollaborationPins", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      commentId: args.commentId,
      createdAt: now,
      kind: args.kind,
      organizationId: authorization.organizationId,
      postId: post._id,
      workosUserId: authorization.viewer.subject,
    });
    if (args.kind === "build") {
      const readerIds = await resolveCurrentCollaborationNotificationReaderIds(
        ctx,
        authorization,
        post
      );
      for (const recipientWorkosUserId of readerIds) {
        await emitCanonicalBuildCollaborationNotification(ctx, {
          actionLabel: "Open pinned thread",
          authorization,
          body: "A collaboration thread was pinned for this Build.",
          dedupeKey: `build-collaboration:pin:${pinId}:${recipientWorkosUserId}`,
          entityId: post._id,
          entityType: "buildCollaborationPost",
          href: `/backoffice/builds/${authorization.build._id}?tab=details&collaborationPost=${post._id}`,
          kind: "build_wide_pin",
          now,
          postId: post._id,
          readerIds,
          recipientWorkosUserId,
          title: "Thread pinned for the Build",
        });
      }
    }
    return pinId;
  })
  .public();

export const toggleBuildCollaborationFollow = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
  })
  .returns(v.boolean())
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const post = await ctx.db.get(args.postId);
    if (
      !(post && (await canReadCollaborationPost(ctx, authorization, post))) ||
      (post &&
        isDrawSystemPost(post) &&
        !(await canReadDrawCoordination(ctx, { authorization, post })))
    ) {
      throw new Error("Forbidden: collaboration post");
    }
    const existing = await ctx.db
      .query("buildCollaborationFollows")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query
          .eq("postId", post._id)
          .eq("workosUserId", authorization.viewer.subject)
      )
      .unique();
    const active = !(existing?.active ?? false);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { active, updatedAt: now });
    } else {
      await ctx.db.insert("buildCollaborationFollows", {
        active,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        createdAt: now,
        organizationId: authorization.organizationId,
        postId: post._id,
        reason: "manual",
        updatedAt: now,
        workosUserId: authorization.viewer.subject,
      });
    }
    return active;
  })
  .public();

export const markBuildCollaborationPostViewed = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
  })
  .returns(v.id("buildCollaborationReceipts"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const post = await ctx.db.get(args.postId);
    if (
      !(post && (await canReadCollaborationPost(ctx, authorization, post))) ||
      (post &&
        isDrawSystemPost(post) &&
        !(await canReadDrawCoordination(ctx, { authorization, post })))
    ) {
      throw new Error("Forbidden: collaboration post");
    }
    const existing = await ctx.db
      .query("buildCollaborationReceipts")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query
          .eq("postId", post._id)
          .eq("workosUserId", authorization.viewer.subject)
      )
      .unique();
    const now = Date.now();
    const readRevision = post.readRevision ?? post.revision;
    if (existing) {
      await ctx.db.patch(existing._id, {
        lastViewedAt: now,
        latestRevisionViewed: readRevision,
        viewerRole: authorization.effectiveRole.role,
      });
      return existing._id;
    }
    return await ctx.db.insert("buildCollaborationReceipts", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      firstViewedAt: now,
      lastViewedAt: now,
      organizationId: authorization.organizationId,
      postId: post._id,
      viewerRole: authorization.effectiveRole.role,
      workosUserId: authorization.viewer.subject,
      latestRevisionViewed: readRevision,
    });
  })
  .public();

async function ensureFollow(
  ctx: MutationCtx,
  input: {
    authorization: Awaited<
      ReturnType<typeof authorizeActiveBuildCollaborationAccess>
    >;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    reason: "author" | "commenter" | "mentioned" | "assigned" | "manual";
    workosUserId: string;
  }
) {
  const existing = await ctx.db
    .query("buildCollaborationFollows")
    .withIndex("by_postId_and_workosUserId", (query) =>
      query.eq("postId", input.postId).eq("workosUserId", input.workosUserId)
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      active: true,
      reason: input.reason,
      updatedAt: input.now,
    });
    return;
  }
  await ctx.db.insert("buildCollaborationFollows", {
    active: true,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: input.now,
    organizationId: input.authorization.organizationId,
    postId: input.postId,
    reason: input.reason,
    updatedAt: input.now,
    workosUserId: input.workosUserId,
  });
}

async function emitCommentNotifications(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    commentId: Id<"buildCollaborationComments">;
    now: number;
    plainText: string;
    post: Doc<"buildCollaborationPosts">;
    readerIds: string[];
    references: CanonicalBuildCollaborationReference[];
  }
) {
  const mentionedIds = new Set(
    input.references.flatMap((reference) =>
      reference.entityKind === "participant" ? [reference.entityId] : []
    )
  );
  for (const recipientWorkosUserId of mentionedIds) {
    await emitCanonicalBuildCollaborationNotification(ctx, {
      actionLabel: "Open reply",
      authorization: input.authorization,
      body: input.plainText,
      commentId: input.commentId,
      dedupeKey: `build-collaboration:comment:${input.commentId}:direct-mention:${recipientWorkosUserId}`,
      entityId: input.post._id,
      entityType: "buildCollaborationComment",
      href: `/backoffice/builds/${input.authorization.build._id}?tab=details&collaborationPost=${input.post._id}&focus=comment%3A${input.commentId}`,
      kind: "direct_mention",
      now: input.now,
      postId: input.post._id,
      readerIds: input.readerIds,
      recipientWorkosUserId,
      title: "You were mentioned in a reply",
    });
  }
  const follows = await ctx.db
    .query("buildCollaborationFollows")
    .withIndex("by_postId_and_workosUserId", (query) =>
      query.eq("postId", input.post._id)
    )
    .take(MAX_THREAD_FOLLOWS);
  for (const follow of follows) {
    if (!(follow.active && !mentionedIds.has(follow.workosUserId))) {
      continue;
    }
    await emitCanonicalBuildCollaborationNotification(ctx, {
      actionLabel: "Open reply",
      authorization: input.authorization,
      body: input.plainText,
      commentId: input.commentId,
      dedupeKey: `build-collaboration:comment:${input.commentId}:followed-reply:${follow.workosUserId}`,
      entityId: input.post._id,
      entityType: "buildCollaborationComment",
      href: `/backoffice/builds/${input.authorization.build._id}?tab=details&collaborationPost=${input.post._id}&focus=comment%3A${input.commentId}`,
      kind: "followed_reply",
      now: input.now,
      postId: input.post._id,
      readerIds: input.readerIds,
      recipientWorkosUserId: follow.workosUserId,
      title: "New reply in a followed thread",
    });
  }
}

function assertHumanPublication(subject: string) {
  if (subject.startsWith("agent_")) {
    throw new Error(
      "Publishing requires human approval. Agents may prepare drafts only."
    );
  }
}

function validateCommentContent(input: {
  plainText: string;
  tiptapJson: string;
}) {
  const plainText = input.plainText.trim();
  if (!plainText) {
    throw new Error("Reply content is required.");
  }
  if (plainText.length > MAX_COMMENT_TEXT_LENGTH) {
    throw new Error("Reply text is too long.");
  }
  if (input.tiptapJson.length > MAX_COMMENT_RICH_TEXT_LENGTH) {
    throw new Error("Reply rich text is too long.");
  }
  try {
    const parsed = JSON.parse(input.tiptapJson) as { type?: unknown };
    if (parsed.type !== "doc") {
      throw new Error("TipTap document root must have type doc.");
    }
    return { plainText, tiptapJson: JSON.stringify(parsed) };
  } catch {
    throw new Error("Reply rich text must be valid TipTap JSON.");
  }
}

function stableContentHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) % 4_294_967_296;
  }
  return `djb2-${hash.toString(16).padStart(8, "0")}`;
}

export { projectThreadComments } from "./build_collaboration_threads/projection";
