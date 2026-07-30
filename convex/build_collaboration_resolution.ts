import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  canReadCollaborationPost,
  resolveCurrentCollaborationPostReaderIds,
} from "./build_collaboration_access";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import {
  buildCollaborationPostTypeValidator,
  buildCollaborationRoleValidator,
  buildCollaborationThreadStateValidator,
} from "./build_collaboration_validators";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

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
    const currentReaderIds = new Set(
      await resolveCurrentCollaborationPostReaderIds(ctx, authorization, post)
    );
    const [answerOptions, decisionRevisions, hasLinkedWork] = await Promise.all(
      [
        post.postType === "question"
          ? loadVisibleAnswerOptions(ctx, authorization, post)
          : [],
        post.postType === "decision"
          ? ctx.db
              .query("buildCollaborationDecisionOutcomeRevisions")
              .withIndex("by_postId_and_revision", (query) =>
                query.eq("postId", post._id)
              )
              .order("desc")
              .take(MAX_DECISION_REVISIONS)
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
        canManage &&
        post.contentState === "active" &&
        post.threadState === "resolved",
      canResolve:
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
      resolutionSummary: post.resolutionSummary,
      resolvedAt: post.resolvedAt,
      resolvedByWorkosUserId: post.resolvedByWorkosUserId,
      threadState: post.threadState,
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
    expectedUpdatedAt: v.number(),
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
    requireExpectedUpdatedAt(post, args.expectedUpdatedAt);
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
    return post._id;
  })
  .public();

export const reopenBuildCollaborationThread = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedUpdatedAt: v.number(),
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
    requireExpectedUpdatedAt(post, args.expectedUpdatedAt);
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
    return post._id;
  })
  .public();

export const setBuildCollaborationAnnouncementExpiration = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedUpdatedAt: v.number(),
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
    requireExpectedUpdatedAt(post, args.expectedUpdatedAt);
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
    const priorState = threadStateSnapshot(post);
    await ctx.db.patch(post._id, {
      announcementExpiresAt: args.expiresAt,
      lastMeaningfulActivityAt: now,
      latestActivityActorWorkosUserId: authorization.viewer.subject,
      updatedAt: now,
    });
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
    return post._id;
  })
  .public();

export async function reopenResolvedThreadForReply(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    now: number;
    post: Doc<"buildCollaborationPosts">;
  }
) {
  if (input.post.threadState !== "resolved") {
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

async function resolveIntentSpecificOutcome(
  ctx: MutationCtx,
  input: {
    acceptedCommentId?: Id<"buildCollaborationComments">;
    authorization: ActiveBuildAuthorization;
    decisionOutcome?: string;
    decisionOwnerWorkosUserId?: string;
    now: number;
    post: Doc<"buildCollaborationPosts">;
    resolutionSummary?: string;
  }
) {
  switch (input.post.postType) {
    case "question":
      return await resolveQuestionOutcome(ctx, input);
    case "decision":
      return await resolveDecisionOutcome(ctx, input);
    case "issue":
      return await resolveIssueOutcome(ctx, input);
    case "announcement":
    case "update":
      return {
        acceptedCommentId: undefined,
        decisionOutcome: undefined,
        decisionOwnerWorkosUserId: undefined,
        decisionRevisionId: undefined,
        resolutionSummary: optionalText(
          input.resolutionSummary,
          MAX_RESOLUTION_SUMMARY_LENGTH
        ),
      };
  }
}

async function resolveQuestionOutcome(
  ctx: MutationCtx,
  input: {
    acceptedCommentId?: Id<"buildCollaborationComments">;
    authorization: ActiveBuildAuthorization;
    now: number;
    post: Doc<"buildCollaborationPosts">;
  }
) {
  if (!input.acceptedCommentId) {
    throw new Error("A Question resolves only through an accepted reply.");
  }
  const comment = await ctx.db.get(input.acceptedCommentId);
  if (
    !comment ||
    comment.organizationId !== input.authorization.organizationId ||
    comment.brokerageId !== input.authorization.brokerage._id ||
    comment.buildId !== input.authorization.build._id ||
    comment.postId !== input.post._id ||
    comment.contentState !== "active" ||
    !comment.currentRevisionId
  ) {
    throw new Error("The selected answer is unavailable.");
  }
  const revision = await ctx.db.get(comment.currentRevisionId);
  if (
    !revision ||
    revision.commentId !== comment._id ||
    revision.postId !== input.post._id ||
    revision.organizationId !== input.authorization.organizationId
  ) {
    throw new Error("The selected answer is unavailable.");
  }
  return {
    acceptedCommentId: comment._id,
    decisionOutcome: undefined,
    decisionOwnerWorkosUserId: undefined,
    decisionRevisionId: undefined,
    resolutionSummary: revision.plainText.slice(
      0,
      MAX_RESOLUTION_SUMMARY_LENGTH
    ),
  };
}

async function resolveDecisionOutcome(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    decisionOutcome?: string;
    decisionOwnerWorkosUserId?: string;
    now: number;
    post: Doc<"buildCollaborationPosts">;
    resolutionSummary?: string;
  }
) {
  const outcome = requireText(
    input.decisionOutcome ?? "",
    "A Decision requires a concise outcome.",
    MAX_OUTCOME_LENGTH
  );
  const owner = input.authorization.participants.find(
    (participant) =>
      participant.workosUserId === input.decisionOwnerWorkosUserId
  );
  const currentReaderIds = new Set(
    await resolveCurrentCollaborationPostReaderIds(
      ctx,
      input.authorization,
      input.post
    )
  );
  if (!(owner && currentReaderIds.has(owner.workosUserId))) {
    throw new Error("A Decision requires a current Build participant owner.");
  }
  const previousRevision = await ctx.db
    .query("buildCollaborationDecisionOutcomeRevisions")
    .withIndex("by_postId_and_revision", (query) =>
      query.eq("postId", input.post._id)
    )
    .order("desc")
    .first();
  const decisionRevisionId = await ctx.db.insert(
    "buildCollaborationDecisionOutcomeRevisions",
    {
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      changedByRole: input.authorization.effectiveRole.role,
      changedByWorkosUserId: input.authorization.viewer.subject,
      createdAt: input.now,
      organizationId: input.authorization.organizationId,
      outcome,
      ownerDisplayNameSnapshot: owner.displayName,
      ownerWorkosUserId: owner.workosUserId,
      postId: input.post._id,
      reason: optionalText(input.resolutionSummary, MAX_REASON_LENGTH),
      revision: (previousRevision?.revision ?? 0) + 1,
    }
  );
  return {
    acceptedCommentId: undefined,
    decisionOutcome: outcome,
    decisionOwnerWorkosUserId: owner.workosUserId,
    decisionRevisionId,
    resolutionSummary: optionalText(
      input.resolutionSummary,
      MAX_RESOLUTION_SUMMARY_LENGTH
    ),
  };
}

async function resolveIssueOutcome(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    post: Doc<"buildCollaborationPosts">;
    resolutionSummary?: string;
  }
) {
  if (!(await postHasLinkedWork(ctx, input.authorization, input.post))) {
    throw new Error(
      "An Issue / Blocker requires a linked Build entity or Action Item."
    );
  }
  const disposition = requireText(
    input.resolutionSummary ?? "",
    "An Issue / Blocker requires a recorded disposition.",
    MAX_RESOLUTION_SUMMARY_LENGTH
  );
  return {
    acceptedCommentId: undefined,
    decisionOutcome: undefined,
    decisionOwnerWorkosUserId: undefined,
    decisionRevisionId: undefined,
    resolutionSummary: disposition,
  };
}

async function reopenThread(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    eventType: "reopened" | "reply_reopened" | "accepted_answer_unavailable";
    now: number;
    post: Doc<"buildCollaborationPosts">;
    reason: string;
  }
) {
  const priorState = threadStateSnapshot(input.post);
  await ctx.db.patch(input.post._id, {
    acceptedCommentId: undefined,
    decisionOutcome: undefined,
    decisionOwnerWorkosUserId: undefined,
    lastMeaningfulActivityAt: input.now,
    latestActivityActorWorkosUserId: input.authorization.viewer.subject,
    resolutionSummary: undefined,
    resolvedAt: undefined,
    resolvedByWorkosUserId: undefined,
    threadState: "open",
    updatedAt: input.now,
  });
  await recordThreadEvent(ctx, {
    authorization: input.authorization,
    eventType: input.eventType,
    newState: JSON.stringify({ threadState: "open" }),
    now: input.now,
    post: input.post,
    priorState,
    reason: input.reason,
  });
}

async function recordThreadEvent(
  ctx: MutationCtx,
  input: {
    acceptedCommentId?: Id<"buildCollaborationComments">;
    authorization: ActiveBuildAuthorization;
    decisionRevisionId?: Id<"buildCollaborationDecisionOutcomeRevisions">;
    eventType:
      | "resolved"
      | "reopened"
      | "reply_reopened"
      | "accepted_answer_unavailable"
      | "announcement_expiration_changed";
    newState: string;
    now: number;
    post: Doc<"buildCollaborationPosts">;
    priorState: string;
    reason?: string;
  }
) {
  await ctx.db.insert("buildCollaborationThreadEvents", {
    acceptedCommentId: input.acceptedCommentId,
    actorRole: input.authorization.effectiveRole.role,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: input.now,
    decisionRevisionId: input.decisionRevisionId,
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.authorization.organizationId,
    postId: input.post._id,
    priorState: input.priorState,
    reason: input.reason,
  });
  const eventType = `build.collaboration.thread.${input.eventType}`;
  await Promise.all([
    ctx.db.insert("auditEvents", {
      actorRoles: input.authorization.roles,
      actorWorkosUserId: input.authorization.viewer.subject,
      brokerageId: input.authorization.brokerage._id,
      command: threadEventCommand(input.eventType),
      createdAt: input.now,
      entityId: input.post._id,
      entityType: "buildCollaborationPost",
      eventType,
      newState: input.newState,
      organizationId: input.authorization.organizationId,
      priorState: input.priorState,
      reason: input.reason,
      warnings: [],
    }),
    ctx.db.insert("eventOutbox", {
      brokerageId: input.authorization.brokerage._id,
      createdAt: input.now,
      eventType,
      organizationId: input.authorization.organizationId,
      payloadPreview: JSON.stringify({
        buildId: input.authorization.build._id,
        eventType: input.eventType,
        postId: input.post._id,
      }),
      relatedEntityId: input.post._id,
      relatedEntityType: "buildCollaborationPost",
      status: "pending",
    }),
  ]);
}

function threadEventCommand(
  eventType:
    | "resolved"
    | "reopened"
    | "reply_reopened"
    | "accepted_answer_unavailable"
    | "announcement_expiration_changed"
) {
  switch (eventType) {
    case "resolved":
      return "resolveBuildCollaborationThread";
    case "reopened":
      return "reopenBuildCollaborationThread";
    case "reply_reopened":
      return "addBuildCollaborationComment";
    case "accepted_answer_unavailable":
      return "reopenUnavailableAcceptedAnswer";
    case "announcement_expiration_changed":
      return "setBuildCollaborationAnnouncementExpiration";
  }
}

async function requireReadablePost(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  postId: Id<"buildCollaborationPosts">
) {
  const post = await ctx.db.get(postId);
  if (
    !post ||
    post.organizationId !== authorization.organizationId ||
    post.brokerageId !== authorization.brokerage._id ||
    post.buildId !== authorization.build._id ||
    !(await canReadCollaborationPost(ctx, authorization, post))
  ) {
    throw new Error("Forbidden: collaboration post");
  }
  return post;
}

async function requireManageablePost(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  postId: Id<"buildCollaborationPosts">
) {
  const post = await requireReadablePost(ctx, authorization, postId);
  if (post.contentState !== "active" || !canManageThread(authorization, post)) {
    throw new Error("Forbidden: collaboration thread management");
  }
  return post;
}

function canManageThread(
  authorization: ActiveBuildAuthorization,
  post: Doc<"buildCollaborationPosts">
) {
  return (
    post.authorWorkosUserId === authorization.viewer.subject ||
    authorization.effectiveRole.tier >= 3
  );
}

function requireExpectedUpdatedAt(
  post: Doc<"buildCollaborationPosts">,
  expectedUpdatedAt: number
) {
  if (post.updatedAt !== expectedUpdatedAt) {
    throw new Error(
      "This thread changed while you were working. Refresh and try again."
    );
  }
}

function requireText(value: string, message: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(message);
  }
  if (normalized.length > maxLength) {
    throw new Error(`Text may not exceed ${maxLength} characters.`);
  }
  return normalized;
}

function optionalText(value: string | undefined, maxLength: number) {
  if (value === undefined) {
    return;
  }
  const normalized = value.trim();
  if (!normalized) {
    return;
  }
  if (normalized.length > maxLength) {
    throw new Error(`Text may not exceed ${maxLength} characters.`);
  }
  return normalized;
}

function threadStateSnapshot(post: Doc<"buildCollaborationPosts">) {
  return JSON.stringify({
    acceptedCommentId: post.acceptedCommentId,
    announcementExpiresAt: post.announcementExpiresAt,
    decisionOutcome: post.decisionOutcome,
    decisionOwnerWorkosUserId: post.decisionOwnerWorkosUserId,
    resolutionSummary: post.resolutionSummary,
    resolvedAt: post.resolvedAt,
    resolvedByWorkosUserId: post.resolvedByWorkosUserId,
    threadState: post.threadState,
  });
}

async function loadVisibleAnswerOptions(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  post: Doc<"buildCollaborationPosts">
) {
  const comments = await ctx.db
    .query("buildCollaborationComments")
    .withIndex("by_postId_and_createdAt", (query) =>
      query.eq("postId", post._id)
    )
    .take(MAX_CONTEXT_COMMENTS);
  const options: CollaborationAnswerOption[] = [];
  for (const comment of comments) {
    if (
      comment.organizationId !== authorization.organizationId ||
      comment.buildId !== authorization.build._id ||
      comment.contentState !== "active" ||
      !comment.currentRevisionId
    ) {
      continue;
    }
    const revision = await ctx.db.get(comment.currentRevisionId);
    if (
      revision?.commentId === comment._id &&
      revision.postId === post._id &&
      revision.organizationId === authorization.organizationId
    ) {
      options.push({
        authorDisplayName: comment.authorDisplayNameSnapshot,
        commentId: comment._id,
        plainText: revision.plainText,
      });
    }
  }
  return options;
}

async function postHasLinkedWork(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  post: Doc<"buildCollaborationPosts">
) {
  const [reference, actionItem] = await Promise.all([
    post.currentRevisionId
      ? ctx.db
          .query("buildCollaborationReferences")
          .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
            query
              .eq("ownerKind", "postRevision")
              .eq("ownerRecordId", post.currentRevisionId as string)
          )
          .first()
      : null,
    ctx.db
      .query("buildActionItems")
      .withIndex("by_originatingPostId_and_status", (query) =>
        query.eq("originatingPostId", post._id)
      )
      .first(),
  ]);
  return Boolean(
    (reference &&
      reference.organizationId === authorization.organizationId &&
      reference.buildId === authorization.build._id &&
      reference.postId === post._id) ||
      (actionItem &&
        actionItem.organizationId === authorization.organizationId &&
        actionItem.buildId === authorization.build._id)
  );
}
