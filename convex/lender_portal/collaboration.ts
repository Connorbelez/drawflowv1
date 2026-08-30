import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";

import { lenderOrganizationMutation, lenderOrganizationQuery } from "../authz";
import {
  prepareBuildCollaborationPublication,
  publishBuildCollaborationBundle,
} from "../build_collaboration";
import { canReadCollaborationPost } from "../build_collaboration_access";
import {
  collaborationCommentRowValidator,
  collaborationFeedResultValidator,
} from "../build_collaboration_contracts";
import { stableContentHash } from "../build_collaboration_hash";
import {
  buildCollaborationLifecycleStateValidator,
  projectBuildCollaborationLifecycleState,
} from "../build_collaboration_lifecycle";
import { getStoredBuildCollaborationState } from "../build_collaboration_lifecycle_state";
import { projectReadableBuildCollaborationPost } from "../build_collaboration_projection";
import {
  addBuildCollaborationCommentForAuthorization,
  projectThreadComments,
} from "../build_collaboration_threads";
import type { Doc } from "../types";
import { authorizeAssignedLenderBuildCollaboration } from "./collaboration_access";

const lenderResponsePageValidator = paginationResultValidator(
  collaborationCommentRowValidator
);

export const getLenderBuildCollaborationLifecycleState = lenderOrganizationQuery
  .input({ buildId: v.id("activeBuilds") })
  .returns(buildCollaborationLifecycleStateValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeAssignedLenderBuildCollaboration(
      ctx,
      args.buildId
    );
    const state = await getStoredBuildCollaborationState(ctx, authorization);
    return projectBuildCollaborationLifecycleState(state);
  })
  .public();

function isParticipantVisibleHumanPost(post: Doc<"buildCollaborationPosts">) {
  return (
    post.audienceMode === "build_wide" &&
    post.contentState === "active" &&
    post.source !== "system" &&
    post.systemPostKind === undefined &&
    post.currentRevisionId !== undefined &&
    post.tombstonedAt === undefined
  );
}

export const listLenderBuildCollaborationPosts = lenderOrganizationQuery
  .input({
    buildId: v.id("activeBuilds"),
    paginationOpts: paginationOptsValidator,
  })
  .returns(collaborationFeedResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeAssignedLenderBuildCollaboration(
      ctx,
      args.buildId
    );
    const result = await ctx.db
      .query("buildCollaborationPosts")
      .withIndex("by_build_prominence_activity", (query) =>
        query.eq("buildId", authorization.build._id)
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const page: Awaited<
      ReturnType<typeof projectReadableBuildCollaborationPost>
    >[] = [];
    for (const [index, post] of result.page.entries()) {
      if (!isParticipantVisibleHumanPost(post)) {
        continue;
      }
      if (!(await canReadCollaborationPost(ctx, authorization, post))) {
        continue;
      }
      page.push(
        await projectReadableBuildCollaborationPost(ctx, {
          authorization,
          post,
          unavailableKey: `lender-unavailable-${stableContentHash(
            `${args.paginationOpts.cursor ?? "initial"}:${index}`
          )}`,
        })
      );
    }
    return {
      continueCursor: result.continueCursor,
      isDone: result.isDone,
      page,
    };
  })
  .public();

export const publishLenderBuildCollaborationPost = lenderOrganizationMutation
  .input({
    attachmentAssetIds: v.optional(v.array(v.id("buildCollaborationAssets"))),
    buildId: v.id("activeBuilds"),
    plainText: v.string(),
    tiptapJson: v.string(),
  })
  .returns(v.id("buildCollaborationPosts"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeAssignedLenderBuildCollaboration(
      ctx,
      args.buildId
    );
    const prepared = await prepareBuildCollaborationPublication(ctx, {
      authorization,
      bundle: {
        acknowledgementRequired: false,
        actionItems: [],
        attachmentAssetIds: args.attachmentAssetIds ?? [],
        audienceMode: "build_wide",
        excludedReaderIds: [],
        notificationEffects: [],
        plainText: args.plainText,
        postType: "update",
        references: [],
        requestedReaderIds: [],
        sharedMutations: [],
        tiptapJson: args.tiptapJson,
      },
    });
    return await publishBuildCollaborationBundle(ctx, {
      agentDrafted: false,
      audience: prepared.audience,
      authorization,
      bundle: prepared.bundle,
    });
  })
  .public();

export const listLenderBuildCollaborationResponses = lenderOrganizationQuery
  .input({
    buildId: v.id("activeBuilds"),
    paginationOpts: paginationOptsValidator,
    postId: v.id("buildCollaborationPosts"),
  })
  .returns(lenderResponsePageValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeAssignedLenderBuildCollaboration(
      ctx,
      args.buildId
    );
    const post = await ctx.db.get(args.postId);
    if (!(post && isParticipantVisibleHumanPost(post))) {
      throw new Error("Forbidden: lender collaboration post");
    }
    if (!(await canReadCollaborationPost(ctx, authorization, post))) {
      throw new Error("Forbidden: lender collaboration post");
    }
    const result = await ctx.db
      .query("buildCollaborationComments")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id)
      )
      .order("asc")
      .paginate(args.paginationOpts);
    return {
      continueCursor: result.continueCursor,
      isDone: result.isDone,
      page: await projectThreadComments(ctx, authorization, result.page),
    };
  })
  .public();

export const addLenderBuildCollaborationResponse = lenderOrganizationMutation
  .input({
    attachmentAssetIds: v.optional(v.array(v.id("buildCollaborationAssets"))),
    buildId: v.id("activeBuilds"),
    parentCommentId: v.optional(v.id("buildCollaborationComments")),
    plainText: v.string(),
    postId: v.id("buildCollaborationPosts"),
    tiptapJson: v.string(),
  })
  .returns(v.id("buildCollaborationComments"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeAssignedLenderBuildCollaboration(
      ctx,
      args.buildId
    );
    const post = await ctx.db.get(args.postId);
    if (!(post && isParticipantVisibleHumanPost(post))) {
      throw new Error("Forbidden: lender collaboration post");
    }
    if (!(await canReadCollaborationPost(ctx, authorization, post))) {
      throw new Error("Forbidden: lender collaboration post");
    }
    return await addBuildCollaborationCommentForAuthorization(
      ctx,
      authorization,
      {
        attachmentAssetIds: args.attachmentAssetIds,
        parentCommentId: args.parentCommentId,
        plainText: args.plainText,
        postId: post._id,
        references: [],
        tiptapJson: args.tiptapJson,
      }
    );
  })
  .public();
