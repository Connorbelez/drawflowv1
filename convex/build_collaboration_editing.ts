import { v } from "convex/values";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  canReadCollaborationPost,
  resolveCurrentCollaborationPostReaderIds,
} from "./build_collaboration_access";
import { authorizeActiveBuildHumanCollaborationAccess } from "./build_collaboration_actor";
import {
  canonicalizeEditedCollaborationContent,
  collaborationContentHash,
  projectCollaborationRevisionForViewer,
} from "./build_collaboration_content";
import { requireHumanCollaborationActor } from "./build_collaboration_human";
import {
  type CanonicalBuildCollaborationReference,
  resolveCanonicalBuildCollaborationReferences,
  resolveCurrentBuildCollaborationReference,
} from "./build_collaboration_references";
import { reopenQuestionForUnavailableAcceptedAnswer } from "./build_collaboration_resolution";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import {
  buildCollaborationReferenceKindValidator,
  buildCollaborationRoleValidator,
} from "./build_collaboration_validators";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_EDIT_REFERENCES = 100;
const MAX_REVISION_HISTORY = 200;
const editReferenceValidator = v.object({
  entityId: v.string(),
  entityKind: buildCollaborationReferenceKindValidator,
  primary: v.optional(v.boolean()),
});
const revisionHistoryValidator = v.object({
  _id: v.string(),
  authorRole: v.optional(buildCollaborationRoleValidator),
  authorWorkosUserId: v.string(),
  createdAt: v.number(),
  editReason: v.optional(v.string()),
  plainText: v.string(),
  revision: v.number(),
  tiptapJson: v.string(),
});

export const editBuildCollaborationPost = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    editReason: v.optional(v.string()),
    expectedRevision: v.number(),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
    references: v.array(editReferenceValidator),
    tiptapJson: v.string(),
  })
  .returns(v.id("buildCollaborationPostRevisions"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    await requireHumanCollaborationActor(ctx, authorization);
    const post = await requireAuthoredActivePost(
      ctx,
      authorization,
      args.postId
    );
    assertExpectedRevision(post.revision, args.expectedRevision, "post");
    const references = await canonicalReferencesForPost(ctx, {
      authorization,
      post,
      references: args.references,
    });
    const content = canonicalizeEditedCollaborationContent({
      references,
      tiptapJson: args.tiptapJson,
    });
    const now = Date.now();
    const revision = post.revision + 1;
    const revisionId = await ctx.db.insert("buildCollaborationPostRevisions", {
      authorRole: authorization.effectiveRole.role,
      authorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      contentHash: collaborationContentHash(content.tiptapJson),
      createdAt: now,
      editReason: normalizeReason(args.editReason),
      organizationId: authorization.organizationId,
      plainText: content.plainText,
      postId: post._id,
      revision,
      tiptapJson: content.tiptapJson,
    });
    await persistRevisionReferences(ctx, {
      authorization,
      ownerKind: "postRevision",
      ownerRecordId: revisionId,
      postId: post._id,
      references,
      timestamp: now,
    });
    await carryForwardRevisionAttachments(ctx, {
      authorization,
      fromOwnerKind: "postRevision",
      fromOwnerRecordId: post.currentRevisionId,
      now,
      toOwnerKind: "postRevision",
      toOwnerRecordId: revisionId,
    });
    const primaryReference = references.find((reference) => reference.primary);
    await ctx.db.patch(post._id, {
      currentRevisionId: revisionId,
      primaryReferenceId: primaryReference?.entityId,
      primaryReferenceKind: primaryReference?.entityKind,
      readRevision: (post.readRevision ?? post.revision) + 1,
      revision,
      updatedAt: now,
    });
    await recordEditAudit(ctx, {
      authorization,
      command: "editBuildCollaborationPost",
      entityId: post._id,
      entityType: "buildCollaborationPost",
      eventType: "build.collaboration.post.edited",
      newRevision: revision,
      priorRevision: post.revision,
      reason: normalizeReason(args.editReason),
      timestamp: now,
    });
    return revisionId;
  })
  .public();

export const editBuildCollaborationComment = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    commentId: v.id("buildCollaborationComments"),
    editReason: v.optional(v.string()),
    expectedRevision: v.number(),
    organizationId: v.string(),
    references: v.array(editReferenceValidator),
    tiptapJson: v.string(),
  })
  .returns(v.id("buildCollaborationCommentRevisions"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    await requireHumanCollaborationActor(ctx, authorization);
    const { comment, post } = await requireAuthoredActiveComment(
      ctx,
      authorization,
      args.commentId
    );
    assertExpectedRevision(comment.revision, args.expectedRevision, "reply");
    const references = await canonicalReferencesForPost(ctx, {
      authorization,
      post,
      references: args.references,
    });
    const content = canonicalizeEditedCollaborationContent({
      references,
      tiptapJson: args.tiptapJson,
    });
    const now = Date.now();
    const revision = comment.revision + 1;
    const revisionId = await ctx.db.insert(
      "buildCollaborationCommentRevisions",
      {
        authorRole: authorization.effectiveRole.role,
        authorWorkosUserId: authorization.viewer.subject,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        commentId: comment._id,
        contentHash: collaborationContentHash(content.tiptapJson),
        createdAt: now,
        editReason: normalizeReason(args.editReason),
        organizationId: authorization.organizationId,
        plainText: content.plainText,
        postId: post._id,
        revision,
        tiptapJson: content.tiptapJson,
      }
    );
    await persistRevisionReferences(ctx, {
      authorization,
      ownerKind: "commentRevision",
      ownerRecordId: revisionId,
      postId: post._id,
      references,
      timestamp: now,
    });
    await carryForwardRevisionAttachments(ctx, {
      authorization,
      fromOwnerKind: "commentRevision",
      fromOwnerRecordId: comment.currentRevisionId,
      now,
      toOwnerKind: "commentRevision",
      toOwnerRecordId: revisionId,
    });
    await ctx.db.patch(comment._id, {
      currentRevisionId: revisionId,
      revision,
      updatedAt: now,
    });
    await ctx.db.patch(post._id, {
      readRevision: (post.readRevision ?? post.revision) + 1,
      updatedAt: now,
    });
    await recordEditAudit(ctx, {
      authorization,
      command: "editBuildCollaborationComment",
      entityId: comment._id,
      entityType: "buildCollaborationComment",
      eventType: "build.collaboration.comment.edited",
      newRevision: revision,
      priorRevision: comment.revision,
      reason: normalizeReason(args.editReason),
      timestamp: now,
    });
    return revisionId;
  })
  .public();

async function carryForwardRevisionAttachments(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    fromOwnerKind: "postRevision" | "commentRevision";
    fromOwnerRecordId?: string;
    now: number;
    toOwnerKind: "postRevision" | "commentRevision";
    toOwnerRecordId: string;
  }
) {
  if (!input.fromOwnerRecordId) {
    return;
  }
  const attachments = await ctx.db
    .query("buildCollaborationAttachments")
    .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
      query
        .eq("ownerKind", input.fromOwnerKind)
        .eq("ownerRecordId", input.fromOwnerRecordId as string)
    )
    .take(26);
  if (attachments.length > 25) {
    throw new Error(
      "A collaboration revision may contain at most 25 attachments."
    );
  }
  for (const attachment of attachments) {
    if (
      attachment.organizationId !== input.authorization.organizationId ||
      attachment.brokerageId !== input.authorization.brokerage._id ||
      attachment.buildId !== input.authorization.build._id
    ) {
      throw new Error("A prior revision attachment is outside this Build.");
    }
    await ctx.db.insert("buildCollaborationAttachments", {
      attachmentId: attachment.attachmentId,
      attachmentKind: attachment.attachmentKind,
      brokerageId: attachment.brokerageId,
      buildId: attachment.buildId,
      createdAt: input.now,
      createdByWorkosUserId: input.authorization.viewer.subject,
      organizationId: attachment.organizationId,
      ownerKind: input.toOwnerKind,
      ownerRecordId: input.toOwnerRecordId,
    });
  }
}

export const tombstoneBuildCollaborationPost = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedRevision: v.number(),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
  })
  .returns(v.id("buildCollaborationPosts"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    await requireHumanCollaborationActor(ctx, authorization);
    const post = await requireAuthoredActivePost(
      ctx,
      authorization,
      args.postId
    );
    assertExpectedRevision(post.revision, args.expectedRevision, "post");
    const now = Date.now();
    await ctx.db.patch(post._id, {
      contentState: "tombstoned",
      readRevision: (post.readRevision ?? post.revision) + 1,
      revision: post.revision + 1,
      tombstonedAt: now,
      tombstonedByWorkosUserId: authorization.viewer.subject,
      updatedAt: now,
    });
    await recordEditAudit(ctx, {
      authorization,
      command: "tombstoneBuildCollaborationPost",
      entityId: post._id,
      entityType: "buildCollaborationPost",
      eventType: "build.collaboration.post.tombstoned",
      newRevision: post.revision + 1,
      priorRevision: post.revision,
      timestamp: now,
    });
    return post._id;
  })
  .public();

export const tombstoneBuildCollaborationComment = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    commentId: v.id("buildCollaborationComments"),
    expectedRevision: v.number(),
    organizationId: v.string(),
  })
  .returns(v.id("buildCollaborationComments"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    await requireHumanCollaborationActor(ctx, authorization);
    const { comment, post } = await requireAuthoredActiveComment(
      ctx,
      authorization,
      args.commentId
    );
    assertExpectedRevision(comment.revision, args.expectedRevision, "reply");
    const now = Date.now();
    await ctx.db.patch(comment._id, {
      contentState: "tombstoned",
      revision: comment.revision + 1,
      tombstonedAt: now,
      tombstonedByWorkosUserId: authorization.viewer.subject,
      updatedAt: now,
    });
    await reopenQuestionForUnavailableAcceptedAnswer(ctx, {
      authorization,
      commentId: comment._id,
      now,
      post,
    });
    await ctx.db.patch(post._id, {
      readRevision: (post.readRevision ?? post.revision) + 1,
      updatedAt: now,
    });
    await recordEditAudit(ctx, {
      authorization,
      command: "tombstoneBuildCollaborationComment",
      entityId: comment._id,
      entityType: "buildCollaborationComment",
      eventType: "build.collaboration.comment.tombstoned",
      newRevision: comment.revision + 1,
      priorRevision: comment.revision,
      timestamp: now,
    });
    return comment._id;
  })
  .public();

export const listBuildCollaborationPostRevisionHistory = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
  })
  .returns(v.array(revisionHistoryValidator))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const post = await requireReadableHistoryPost(
      ctx,
      authorization,
      args.postId
    );
    const revisions = await ctx.db
      .query("buildCollaborationPostRevisions")
      .withIndex("by_postId_and_revision", (query) =>
        query.eq("postId", post._id)
      )
      .order("desc")
      .take(MAX_REVISION_HISTORY);
    return await projectRevisionHistory(ctx, {
      authorization,
      ownerKind: "postRevision",
      revisions,
    });
  })
  .public();

export const listBuildCollaborationCommentRevisionHistory = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    commentId: v.id("buildCollaborationComments"),
    organizationId: v.string(),
  })
  .returns(v.array(revisionHistoryValidator))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const comment = await ctx.db.get(args.commentId);
    if (!comment || comment.buildId !== authorization.build._id) {
      throw new Error("Forbidden: collaboration reply history");
    }
    const post = await ctx.db.get(comment.postId);
    if (!(post && (await canReadCollaborationPost(ctx, authorization, post)))) {
      throw new Error("Forbidden: collaboration reply history");
    }
    if (
      (post.contentState !== "active" || comment.contentState !== "active") &&
      comment.authorWorkosUserId !== authorization.viewer.subject
    ) {
      throw new Error("Forbidden: collaboration reply history");
    }
    const revisions = await ctx.db
      .query("buildCollaborationCommentRevisions")
      .withIndex("by_commentId_and_revision", (query) =>
        query.eq("commentId", comment._id)
      )
      .order("desc")
      .take(MAX_REVISION_HISTORY);
    return await projectRevisionHistory(ctx, {
      authorization,
      ownerKind: "commentRevision",
      revisions,
    });
  })
  .public();

async function requireAuthoredActivePost(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  postId: Id<"buildCollaborationPosts">
) {
  const post = await requireAuthoredReadablePost(ctx, authorization, postId);
  if (post.contentState !== "active") {
    throw new Error("This post is no longer editable.");
  }
  return post;
}

async function requireAuthoredReadablePost(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  postId: Id<"buildCollaborationPosts">
) {
  const post = await ctx.db.get(postId);
  if (
    !post ||
    post.buildId !== authorization.build._id ||
    post.authorWorkosUserId !== authorization.viewer.subject ||
    !(await canReadCollaborationPost(ctx, authorization, post))
  ) {
    throw new Error("Forbidden: authored collaboration post");
  }
  return post;
}

async function requireReadableHistoryPost(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  postId: Id<"buildCollaborationPosts">
) {
  const post = await ctx.db.get(postId);
  if (
    !post ||
    post.buildId !== authorization.build._id ||
    !(await canReadCollaborationPost(ctx, authorization, post)) ||
    (post.contentState !== "active" &&
      post.authorWorkosUserId !== authorization.viewer.subject)
  ) {
    throw new Error("Forbidden: collaboration post history");
  }
  return post;
}

async function requireAuthoredActiveComment(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  commentId: Id<"buildCollaborationComments">
) {
  const comment = await ctx.db.get(commentId);
  if (
    !comment ||
    comment.buildId !== authorization.build._id ||
    comment.authorWorkosUserId !== authorization.viewer.subject ||
    comment.contentState !== "active"
  ) {
    throw new Error("Forbidden: authored collaboration reply");
  }
  const post = await ctx.db.get(comment.postId);
  if (!(post && (await canReadCollaborationPost(ctx, authorization, post)))) {
    throw new Error("Forbidden: collaboration post");
  }
  return { comment, post };
}

async function canonicalReferencesForPost(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    post: Doc<"buildCollaborationPosts">;
    references: Array<{
      entityId: string;
      entityKind:
        | "participant"
        | "milestone"
        | "submilestone"
        | "draw"
        | "evidencePackage"
        | "evidenceAsset"
        | "siteVisit"
        | "document"
        | "material"
        | "actionItem";
      primary?: boolean;
    }>;
  }
) {
  if (input.references.length > MAX_EDIT_REFERENCES) {
    throw new Error(
      `An edit may contain at most ${MAX_EDIT_REFERENCES} references.`
    );
  }
  const readerIds = await resolveCurrentCollaborationPostReaderIds(
    ctx,
    input.authorization,
    input.post
  );
  return await resolveCanonicalBuildCollaborationReferences(ctx, {
    authorization: input.authorization,
    readerIds,
    references: input.references,
  });
}

async function projectRevisionHistory<
  Revision extends
    | Doc<"buildCollaborationCommentRevisions">
    | Doc<"buildCollaborationPostRevisions">,
>(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    ownerKind: "commentRevision" | "postRevision";
    revisions: Revision[];
  }
) {
  const referencesByRevision = await Promise.all(
    input.revisions.map(async (revision) => ({
      references: await ctx.db
        .query("buildCollaborationReferences")
        .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
          query
            .eq("ownerKind", input.ownerKind)
            .eq("ownerRecordId", revision._id)
        )
        .take(MAX_EDIT_REFERENCES),
      revision,
    }))
  );
  const currentReferenceByKey = new Map<
    string,
    CanonicalBuildCollaborationReference
  >();
  const unavailableReferenceKeys = new Set<string>();
  for (const { references } of referencesByRevision) {
    for (const reference of references) {
      const key = `${reference.entityKind}:${reference.entityId}`;
      if (currentReferenceByKey.has(key) || unavailableReferenceKeys.has(key)) {
        continue;
      }
      try {
        currentReferenceByKey.set(
          key,
          await resolveCurrentBuildCollaborationReference(ctx, {
            authorization: input.authorization,
            entityId: reference.entityId,
            entityKind: reference.entityKind,
          })
        );
      } catch {
        unavailableReferenceKeys.add(key);
      }
    }
  }
  return referencesByRevision.map(({ references, revision }) => {
    const projected = projectCollaborationRevisionForViewer({
      references: references
        .map((reference) =>
          currentReferenceByKey.get(
            `${reference.entityKind}:${reference.entityId}`
          )
        )
        .filter(
          (reference): reference is CanonicalBuildCollaborationReference =>
            reference !== undefined
        ),
      tiptapJson: revision.tiptapJson,
    });
    return {
      _id: revision._id,
      authorRole: revision.authorRole,
      authorWorkosUserId: revision.authorWorkosUserId,
      createdAt: revision.createdAt,
      editReason: revision.editReason,
      plainText: projected.plainText,
      revision: revision.revision,
      tiptapJson: projected.tiptapJson,
    };
  });
}

async function persistRevisionReferences(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    ownerKind: "commentRevision" | "postRevision";
    ownerRecordId:
      | Id<"buildCollaborationCommentRevisions">
      | Id<"buildCollaborationPostRevisions">;
    postId: Id<"buildCollaborationPosts">;
    references: CanonicalBuildCollaborationReference[];
    timestamp: number;
  }
) {
  for (const reference of input.references) {
    await ctx.db.insert("buildCollaborationReferences", {
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.timestamp,
      entityId: reference.entityId,
      entityKind: reference.entityKind,
      labelSnapshot: reference.label,
      organizationId: input.authorization.organizationId,
      ownerKind: input.ownerKind,
      ownerRecordId: input.ownerRecordId,
      postId: input.postId,
      primary: reference.primary ?? false,
      summarySnapshot: reference.summary,
    });
  }
}

function assertExpectedRevision(
  currentRevision: number,
  expectedRevision: number,
  entityLabel: string
) {
  if (currentRevision !== expectedRevision) {
    throw new Error(
      `Revision conflict: this ${entityLabel} changed while you were editing. Your draft has been preserved; review the latest version and retry.`
    );
  }
}

function normalizeReason(reason: string | undefined) {
  const normalized = reason?.trim();
  return normalized || undefined;
}

async function recordEditAudit(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    command: string;
    entityId: string;
    entityType: "buildCollaborationComment" | "buildCollaborationPost";
    eventType: string;
    newRevision: number;
    priorRevision: number;
    reason?: string;
    timestamp: number;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: input.authorization.roles,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    command: input.command,
    createdAt: input.timestamp,
    entityId: input.entityId,
    entityType: input.entityType,
    eventType: input.eventType,
    newState: JSON.stringify({ revision: input.newRevision }),
    organizationId: input.authorization.organizationId,
    priorState: JSON.stringify({ revision: input.priorRevision }),
    reason: input.reason,
    warnings: [],
  });
}
