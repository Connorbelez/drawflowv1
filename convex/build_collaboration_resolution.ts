import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  canReadCollaborationPost,
  resolveCurrentCollaborationPostReaderIds,
} from "./build_collaboration_access";
import { canReadDrawCoordination } from "./build_draw_coordination";
import { projectCollaborationRevisionForViewer } from "./build_collaboration_content";
import {
  claimBuildCollaborationWriteByBuildId,
  requireBuildCollaborationWritable,
} from "./build_collaboration_lifecycle_state";
import {
  type CanonicalBuildCollaborationReference,
  resolveCurrentBuildCollaborationReference,
} from "./build_collaboration_references";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import { queueBuildCollaborationSearchOwnerRebuild } from "./build_collaboration_search_maintenance";
import {
  buildCollaborationPostTypeValidator,
  buildCollaborationRoleValidator,
  buildCollaborationThreadStateValidator,
} from "./build_collaboration_validators";
import { emitBuildCollaborationWebhookEvent } from "./build_collaboration_webhooks";
import { internalMutation } from "./fluent";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";


import {
  canManageThread,
  loadOwnedDecisionRevisions,
  loadVisibleAnswerOptions,
  optionalText,
  postHasLinkedWork,
  projectCommentRevisionForViewer,
  recordThreadEvent,
  reopenThread,
  requireExpectedThreadRevision,
  requireManageablePost,
  requireText,
  requireReadablePost,
  resolveDecisionOutcome,
  resolveIntentSpecificOutcome,
  resolveIssueOutcome,
  resolveQuestionOutcome,
  threadEventCommand,
  threadStateSnapshot,
} from "./build_collaboration_resolution/helpers";

const MAX_OUTCOME_LENGTH = 4000;
const MAX_REASON_LENGTH = 2000;
const MAX_RESOLUTION_SUMMARY_LENGTH = 4000;
const MAX_CONTEXT_COMMENTS = 1000;
const MAX_DECISION_REVISIONS = 100;

interface CollaborationAnswerOption {
  authorDisplayName: string;
  commentId: Id<"buildCollaborationComments">;
  plainText: string;
}

const threadContextValidator = v.object({
  acceptedCommentId: v.optional(v.id("buildCollaborationComments")),
  announcementExpiresAt: v.optional(v.number()),
  answerOptions: v.array(
    v.object({
      authorDisplayName: v.string(),
      commentId: v.id("buildCollaborationComments"),
      plainText: v.string(),
    })
  ),
  canManageAnnouncementExpiration: v.boolean(),
  canReopen: v.boolean(),
  canResolve: v.boolean(),
  decisionOutcome: v.optional(v.string()),
  decisionOwnerWorkosUserId: v.optional(v.string()),
  decisionRevisions: v.array(
    v.object({
      changedByRole: buildCollaborationRoleValidator,
      changedByWorkosUserId: v.string(),
      createdAt: v.number(),
      outcome: v.string(),
      ownerDisplayNameSnapshot: v.string(),
      ownerWorkosUserId: v.string(),
      reason: v.optional(v.string()),
      revision: v.number(),
    })
  ),
  hasLinkedWork: v.boolean(),
  participants: v.array(
    v.object({
      displayName: v.string(),
      role: buildCollaborationRoleValidator,
      workosUserId: v.string(),
    })
  ),
  postType: buildCollaborationPostTypeValidator,
  resolutionSummary: v.optional(v.string()),
  resolvedAt: v.optional(v.number()),
  resolvedByWorkosUserId: v.optional(v.string()),
  threadState: buildCollaborationThreadStateValidator,
  threadRevision: v.number(),
  updatedAt: v.number(),
});

export const getBuildCollaborationThreadContext = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
  })
  .returns(threadContextValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const post = await requireReadablePost(ctx, authorization, args.postId);
    if (
      post.systemPostKind === "draw" &&
      !(await canReadDrawCoordination(ctx, { authorization, post }))
    ) {
      throw new Error("Forbidden: Draw coordination");
    }
    const currentReaderIds = new Set(
      await resolveCurrentCollaborationPostReaderIds(ctx, authorization, post)
    );
    const [answerOptions, decisionRevisions, hasLinkedWork] = await Promise.all(
      [
        post.postType === "question"
          ? loadVisibleAnswerOptions(ctx, authorization, post)
          : [],
        post.postType === "decision"
          ? loadOwnedDecisionRevisions(ctx, authorization, post)
          : [],
        post.postType === "issue"
          ? postHasLinkedWork(ctx, authorization, post)
          : false,
      ]
    );
    const canManage = canManageThread(authorization, post);
    return {
      acceptedCommentId: post.acceptedCommentId,
      announcementExpiresAt: post.announcementExpiresAt,
      answerOptions,
      canManageAnnouncementExpiration:
        canManage &&
        post.contentState === "active" &&
        post.postType === "announcement",
      canReopen:
        !post.systemPostKind &&
        canManage &&
        post.contentState === "active" &&
        post.threadState === "resolved",
      canResolve:
        !post.systemPostKind &&
        canManage &&
        post.contentState === "active" &&
        post.threadState === "open",
      decisionOutcome: post.decisionOutcome,
      decisionOwnerWorkosUserId: post.decisionOwnerWorkosUserId,
      decisionRevisions: decisionRevisions.map((revision) => ({
        changedByRole: revision.changedByRole,
        changedByWorkosUserId: revision.changedByWorkosUserId,
        createdAt: revision.createdAt,
        outcome: revision.outcome,
        ownerDisplayNameSnapshot: revision.ownerDisplayNameSnapshot,
        ownerWorkosUserId: revision.ownerWorkosUserId,
        reason: revision.reason,
        revision: revision.revision,
      })),
      hasLinkedWork,
      participants: authorization.participants
        .filter((participant) => currentReaderIds.has(participant.workosUserId))
        .map((participant) => ({
          displayName: participant.displayName,
          role: participant.role,
          workosUserId: participant.workosUserId,
        })),
      postType: post.postType,
      resolutionSummary:
        post.postType === "question" &&
        post.threadState === "resolved" &&
        post.acceptedCommentId
          ? (
              await projectAcceptedBuildCollaborationAnswerForViewer(ctx, {
                authorization,
                commentId: post.acceptedCommentId,
                post,
              })
            )?.plainText
          : post.resolutionSummary,
      resolvedAt: post.resolvedAt,
      resolvedByWorkosUserId: post.resolvedByWorkosUserId,
      threadState: post.threadState,
      threadRevision: post.threadRevision ?? 0,
      updatedAt: post.updatedAt,
    };
  })
  .public();

export const resolveBuildCollaborationThread = authenticatedMutation
  .input({
    acceptedCommentId: v.optional(v.id("buildCollaborationComments")),
    buildId: v.id("activeBuilds"),
    decisionOutcome: v.optional(v.string()),
    decisionOwnerWorkosUserId: v.optional(v.string()),
    expectedThreadRevision: v.number(),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
    resolutionSummary: v.optional(v.string()),
  })
  .returns(v.id("buildCollaborationPosts"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const post = await requireManageablePost(ctx, authorization, args.postId);
    if (post.systemPostKind) {
      throw new Error(
        "System Post lifecycle is governed by its canonical domain command."
      );
    }
    requireExpectedThreadRevision(post, args.expectedThreadRevision);
    if (post.threadState !== "open") {
      throw new Error("This thread is already resolved.");
    }
    const now = Date.now();
    const resolution = await resolveIntentSpecificOutcome(ctx, {
      acceptedCommentId: args.acceptedCommentId,
      authorization,
      decisionOutcome: args.decisionOutcome,
      decisionOwnerWorkosUserId: args.decisionOwnerWorkosUserId,
      now,
      post,
      resolutionSummary: args.resolutionSummary,
    });
    const priorState = threadStateSnapshot(post);
    await ctx.db.patch(post._id, {
      acceptedCommentId: resolution.acceptedCommentId,
      decisionOutcome: resolution.decisionOutcome,
      decisionOwnerWorkosUserId: resolution.decisionOwnerWorkosUserId,
      lastMeaningfulActivityAt: now,
      latestActivityActorWorkosUserId: authorization.viewer.subject,
      resolutionSummary: resolution.resolutionSummary,
      resolvedAt: now,
      resolvedByWorkosUserId: authorization.viewer.subject,
      threadState: "resolved",
      threadRevision: (post.threadRevision ?? 0) + 1,
      updatedAt: now,
    });
    await recordThreadEvent(ctx, {
      acceptedCommentId: resolution.acceptedCommentId,
      authorization,
      decisionRevisionId: resolution.decisionRevisionId,
      eventType: "resolved",
      newState: JSON.stringify({
        ...resolution,
        resolvedAt: now,
        threadState: "resolved",
      }),
      now,
      post,
      priorState,
      reason: resolution.resolutionSummary,
    });
    await queueBuildCollaborationSearchOwnerRebuild(ctx, {
      authorization,
      owner: { id: post._id, kind: "post" },
      postId: post._id,
    });
    return post._id;
  })
  .public();

export const reopenBuildCollaborationThread = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedThreadRevision: v.number(),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
    reason: v.string(),
  })
  .returns(v.id("buildCollaborationPosts"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const post = await requireManageablePost(ctx, authorization, args.postId);
    if (post.systemPostKind) {
      throw new Error(
        "System Post lifecycle is governed by its canonical domain command."
      );
    }
    requireExpectedThreadRevision(post, args.expectedThreadRevision);
    const reason = requireText(
      args.reason,
      "A reopening reason is required.",
      MAX_REASON_LENGTH
    );
    if (post.threadState !== "resolved") {
      throw new Error("Only a resolved thread can be reopened.");
    }
    await reopenThread(ctx, {
      authorization,
      eventType: "reopened",
      now: Date.now(),
      post,
      reason,
    });
    await queueBuildCollaborationSearchOwnerRebuild(ctx, {
      authorization,
      owner: { id: post._id, kind: "post" },
      postId: post._id,
    });
    return post._id;
  })
  .public();

export const setBuildCollaborationAnnouncementExpiration = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedThreadRevision: v.number(),
    expiresAt: v.optional(v.number()),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
  })
  .returns(v.id("buildCollaborationPosts"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const post = await requireManageablePost(ctx, authorization, args.postId);
    requireExpectedThreadRevision(post, args.expectedThreadRevision);
    if (post.postType !== "announcement") {
      throw new Error("Only an Announcement has prominence expiration.");
    }
    if (
      args.expiresAt !== undefined &&
      (!Number.isFinite(args.expiresAt) || args.expiresAt < 0)
    ) {
      throw new Error("Announcement expiration must be a valid timestamp.");
    }
    const now = Date.now();
    const prominent = args.expiresAt === undefined || args.expiresAt > now;
    const priorState = threadStateSnapshot(post);
    await ctx.db.patch(post._id, {
      announcementExpiresAt: args.expiresAt,
      announcementProminent: prominent,
      lastMeaningfulActivityAt: now,
      latestActivityActorWorkosUserId: authorization.viewer.subject,
      threadRevision: (post.threadRevision ?? 0) + 1,
      updatedAt: now,
    });
    if (args.expiresAt !== undefined && args.expiresAt > now) {
      await ctx.scheduler.runAt(
        args.expiresAt,
        internal.build_collaboration_resolution
          .expireBuildCollaborationAnnouncementProminence,
        {
          announcementExpiresAt: args.expiresAt,
          postId: post._id,
        }
      );
    }
    await recordThreadEvent(ctx, {
      authorization,
      eventType: "announcement_expiration_changed",
      newState: JSON.stringify({
        announcementExpiresAt: args.expiresAt,
        threadState: post.threadState,
      }),
      now,
      post,
      priorState,
      reason:
        args.expiresAt === undefined
          ? "Announcement prominence restored."
          : "Announcement prominence expiration changed.",
    });
    await queueBuildCollaborationSearchOwnerRebuild(ctx, {
      authorization,
      owner: { id: post._id, kind: "post" },
      postId: post._id,
    });
    return post._id;
  })
  .public();

export const expireBuildCollaborationAnnouncementProminence = internalMutation
  .input({
    announcementExpiresAt: v.number(),
    postId: v.id("buildCollaborationPosts"),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (
      !post ||
      post.postType !== "announcement" ||
      post.announcementExpiresAt !== args.announcementExpiresAt ||
      post.announcementProminent === false ||
      Date.now() < args.announcementExpiresAt
    ) {
      return null;
    }
    if (
      !(await claimBuildCollaborationWriteByBuildId(ctx, {
        buildId: post.buildId,
        organizationId: post.organizationId,
      }))
    ) {
      return null;
    }
    const now = Date.now();
    await ctx.db.patch(post._id, {
      announcementProminent: false,
      threadRevision: (post.threadRevision ?? 0) + 1,
      updatedAt: now,
    });
    return null;
  })
  .internal();

export async function reopenResolvedThreadForReply(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    now: number;
    post: Doc<"buildCollaborationPosts">;
  }
) {
  if (input.post.systemPostKind || input.post.threadState !== "resolved") {
    return false;
  }
  await reopenThread(ctx, {
    authorization: input.authorization,
    eventType: "reply_reopened",
    now: input.now,
    post: input.post,
    reason: "A new reply reopened this thread.",
  });
  return true;
}

export async function reopenQuestionForUnavailableAcceptedAnswer(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    commentId: Id<"buildCollaborationComments">;
    now: number;
    post: Doc<"buildCollaborationPosts">;
  }
) {
  if (
    input.post.postType !== "question" ||
    input.post.threadState !== "resolved" ||
    input.post.acceptedCommentId !== input.commentId
  ) {
    return false;
  }
  await reopenThread(ctx, {
    authorization: input.authorization,
    eventType: "accepted_answer_unavailable",
    now: input.now,
    post: input.post,
    reason: "The accepted answer became unavailable.",
  });
  return true;
}

export async function projectAcceptedBuildCollaborationAnswerForViewer(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    commentId: Id<"buildCollaborationComments">;
    post: Doc<"buildCollaborationPosts">;
  }
) {
  const comment = await ctx.db.get(input.commentId);
  if (
    !comment ||
    comment.organizationId !== input.authorization.organizationId ||
    comment.brokerageId !== input.authorization.brokerage._id ||
    comment.buildId !== input.authorization.build._id ||
    comment.postId !== input.post._id ||
    comment.contentState !== "active" ||
    !comment.currentRevisionId
  ) {
    return null;
  }
  const revision = await ctx.db.get(comment.currentRevisionId);
  if (!revision) {
    return null;
  }
  return await projectCommentRevisionForViewer(ctx, {
    authorization: input.authorization,
    comment,
    post: input.post,
    revision,
  });
}
