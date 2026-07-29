import { v } from "convex/values";

import { authenticatedMutation, authenticatedQuery } from "./authz";
import { canReadCollaborationPost } from "./build_collaboration_access";
import { collaborationCommentRowValidator } from "./build_collaboration_contracts";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import {
  buildCollaborationPinKindValidator,
  buildCollaborationReactionValidator,
  buildCollaborationReferenceKindValidator,
} from "./build_collaboration_validators";
import type { Id, MutationCtx } from "./types";

const MAX_COMMENT_TEXT_LENGTH = 25_000;
const MAX_COMMENT_RICH_TEXT_LENGTH = 125_000;
const MAX_THREAD_COMMENTS = 1000;
const MAX_LOGICAL_DEPTH = 50;

const referenceInputValidator = v.object({
  entityKind: buildCollaborationReferenceKindValidator,
  entityId: v.string(),
  label: v.string(),
  primary: v.optional(v.boolean()),
  summary: v.optional(v.string()),
});

export const addBuildCollaborationComment = authenticatedMutation
  .input({
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
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    assertHumanPublication(authorization.viewer.subject);
    const post = await ctx.db.get(args.postId);
    if (
      !post ||
      post.buildId !== authorization.build._id ||
      !(await canReadCollaborationPost(ctx, authorization, post))
    ) {
      throw new Error("Forbidden: collaboration post");
    }
    const content = validateCommentContent(args);
    const parent = args.parentCommentId
      ? await ctx.db.get(args.parentCommentId)
      : null;
    if (
      parent &&
      (parent.postId !== post._id ||
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
    const now = Date.now();
    const displayName =
      authorization.participants.find(
        (participant) =>
          participant.workosUserId === authorization.viewer.subject
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
    const revisionId = await ctx.db.insert(
      "buildCollaborationCommentRevisions",
      {
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
      }
    );
    await ctx.db.patch(commentId, { currentRevisionId: revisionId });
    await ctx.db.patch(post._id, {
      commentCount: post.commentCount + 1,
      lastMeaningfulActivityAt: now,
      latestActivityActorWorkosUserId: authorization.viewer.subject,
      updatedAt: now,
    });
    for (const reference of args.references.slice(0, 100)) {
      const entityId = reference.entityId.trim();
      const label = reference.label.trim();
      if (!(entityId && label)) {
        throw new Error("Every reference requires an entity and label.");
      }
      await ctx.db.insert("buildCollaborationReferences", {
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        createdAt: now,
        entityId,
        entityKind: reference.entityKind,
        labelSnapshot: label,
        organizationId: authorization.organizationId,
        ownerKind: "commentRevision",
        ownerRecordId: revisionId,
        postId: post._id,
        primary: reference.primary ?? false,
        summarySnapshot: reference.summary?.trim() || undefined,
      });
    }
    await ensureFollow(ctx, {
      authorization,
      now,
      postId: post._id,
      reason: "commenter",
      workosUserId: authorization.viewer.subject,
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
    return commentId;
  })
  .public();

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
    if (!(post && (await canReadCollaborationPost(ctx, authorization, post)))) {
      throw new Error("Forbidden: collaboration post");
    }
    const comments = await ctx.db
      .query("buildCollaborationComments")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id)
      )
      .take(MAX_THREAD_COMMENTS);
    return await Promise.all(
      comments.map(async (comment) => {
        const currentRevisionId = comment.currentRevisionId;
        const references = currentRevisionId
          ? await ctx.db
              .query("buildCollaborationReferences")
              .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
                query
                  .eq("ownerKind", "commentRevision")
                  .eq("ownerRecordId", currentRevisionId)
              )
              .take(100)
          : [];
        const revision = currentRevisionId
          ? await ctx.db.get(currentRevisionId)
          : null;
        return {
          comment: {
            _creationTime: comment._creationTime,
            _id: comment._id,
            authorDisplayNameSnapshot: comment.authorDisplayNameSnapshot,
            createdAt: comment.createdAt,
            logicalDepth: comment.logicalDepth,
          },
          references: references.map((reference) => ({
            _creationTime: reference._creationTime,
            _id: reference._id,
            entityId: reference.entityId,
            entityKind: reference.entityKind,
            labelSnapshot: reference.labelSnapshot,
            summarySnapshot: reference.summarySnapshot,
          })),
          revision: revision
            ? {
                _creationTime: revision._creationTime,
                _id: revision._id,
                plainText: revision.plainText,
                tiptapJson: revision.tiptapJson,
              }
            : null,
        };
      })
    );
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
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const post = await ctx.db.get(args.postId);
    if (!(post && (await canReadCollaborationPost(ctx, authorization, post)))) {
      throw new Error("Forbidden: collaboration post");
    }
    const existing = await ctx.db
      .query("buildCollaborationReactions")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query
          .eq("postId", post._id)
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
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const post = await ctx.db.get(args.postId);
    if (!(post && (await canReadCollaborationPost(ctx, authorization, post)))) {
      throw new Error("Forbidden: collaboration post");
    }
    if (
      args.kind === "build" &&
      (authorization.effectiveRole.role === "homeowner" ||
        authorization.effectiveRole.role === "contractor")
    ) {
      throw new Error("Only the builder or lender team may pin for the Build.");
    }
    if (args.kind === "reply" && !args.commentId) {
      throw new Error("Reply pins require a comment.");
    }
    const existing = await ctx.db
      .query("buildCollaborationPins")
      .withIndex("by_postId_and_workosUserId_and_kind", (query) =>
        query
          .eq("postId", post._id)
          .eq("workosUserId", authorization.viewer.subject)
          .eq("kind", args.kind)
      )
      .take(20);
    const matching = existing.find((pin) => pin.commentId === args.commentId);
    if (matching) {
      await ctx.db.delete(matching._id);
      return null;
    }
    return await ctx.db.insert("buildCollaborationPins", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      commentId: args.commentId,
      createdAt: Date.now(),
      kind: args.kind,
      organizationId: authorization.organizationId,
      postId: post._id,
      workosUserId: authorization.viewer.subject,
    });
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
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const post = await ctx.db.get(args.postId);
    if (!(post && (await canReadCollaborationPost(ctx, authorization, post)))) {
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
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const post = await ctx.db.get(args.postId);
    if (!(post && (await canReadCollaborationPost(ctx, authorization, post)))) {
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
    if (existing) {
      await ctx.db.patch(existing._id, {
        lastViewedAt: now,
        latestRevisionViewed: post.revision,
        viewerRole: authorization.effectiveRole.role,
      });
      return existing._id;
    }
    return await ctx.db.insert("buildCollaborationReceipts", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      firstViewedAt: now,
      lastViewedAt: now,
      latestRevisionViewed: post.revision,
      organizationId: authorization.organizationId,
      postId: post._id,
      viewerRole: authorization.effectiveRole.role,
      workosUserId: authorization.viewer.subject,
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
