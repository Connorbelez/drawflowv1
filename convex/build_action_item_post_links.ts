import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_ACTION_ITEMS_PER_POST = 2000;

type ActionItemPostLinkScope = {
  actionItemId: Id<"buildActionItems">;
  brokerageId: Id<"brokerages">;
  buildId: Id<"activeBuilds">;
  organizationId: string;
  postId: Id<"buildCollaborationPosts">;
};

export async function linkBuildActionItemToPost(
  ctx: MutationCtx,
  input: ActionItemPostLinkScope & {
    createdAt: number;
    linkKind: "originating" | "policy_obligation";
  }
) {
  const [item, post] = await Promise.all([
    ctx.db.get(input.actionItemId),
    ctx.db.get(input.postId),
  ]);
  if (
    !item ||
    !post ||
    item.buildId !== input.buildId ||
    post.buildId !== input.buildId ||
    item.organizationId !== input.organizationId ||
    post.organizationId !== input.organizationId ||
    item.brokerageId !== input.brokerageId ||
    post.brokerageId !== input.brokerageId
  ) {
    throw new Error("Action Item post link is outside the authorized Build.");
  }
  const existing = await ctx.db
    .query("buildActionItemPostLinks")
    .withIndex("by_postId_and_actionItemId", (query) =>
      query.eq("postId", input.postId).eq("actionItemId", input.actionItemId)
    )
    .unique();
  if (existing) {
    return existing._id;
  }
  return await ctx.db.insert("buildActionItemPostLinks", {
    actionItemId: input.actionItemId,
    brokerageId: input.brokerageId,
    buildId: input.buildId,
    createdAt: input.createdAt,
    linkKind: input.linkKind,
    organizationId: input.organizationId,
    postId: input.postId,
  });
}

export async function actionItemsLinkedToPost(
  ctx: QueryCtx | MutationCtx,
  postId: Id<"buildCollaborationPosts">
) {
  const [originatingItems, links] = await Promise.all([
    ctx.db
      .query("buildActionItems")
      .withIndex("by_originatingPostId_and_status", (query) =>
        query.eq("originatingPostId", postId)
      )
      .take(MAX_ACTION_ITEMS_PER_POST + 1),
    ctx.db
      .query("buildActionItemPostLinks")
      .withIndex("by_postId_and_actionItemId", (query) =>
        query.eq("postId", postId)
      )
      .take(MAX_ACTION_ITEMS_PER_POST + 1),
  ]);
  if (
    originatingItems.length > MAX_ACTION_ITEMS_PER_POST ||
    links.length > MAX_ACTION_ITEMS_PER_POST
  ) {
    throw new Error("Post Action Item links exceed the safe limit.");
  }
  const linkedItems = await Promise.all(
    links.map((link) => ctx.db.get(link.actionItemId))
  );
  const items = new Map<Id<"buildActionItems">, Doc<"buildActionItems">>();
  for (const item of [...originatingItems, ...linkedItems]) {
    if (item) {
      items.set(item._id, item);
    }
  }
  return [...items.values()];
}

export async function syncLinkedActionItemPostCounts(
  ctx: MutationCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    actorWorkosUserId: string;
    now: number;
  }
) {
  const item = await ctx.db.get(input.actionItemId);
  if (!item) {
    throw new Error("Action Item is unavailable for post count sync.");
  }
  const links = await ctx.db
    .query("buildActionItemPostLinks")
    .withIndex("by_actionItemId_and_postId", (query) =>
      query.eq("actionItemId", item._id)
    )
    .take(MAX_ACTION_ITEMS_PER_POST + 1);
  if (links.length > MAX_ACTION_ITEMS_PER_POST) {
    throw new Error("Action Item post links exceed the safe limit.");
  }
  const postIds = new Set<Id<"buildCollaborationPosts">>([
    item.originatingPostId,
    ...links.map((link) => link.postId),
  ]);
  for (const postId of postIds) {
    const post = await ctx.db.get(postId);
    if (
      !post ||
      post.buildId !== item.buildId ||
      post.organizationId !== item.organizationId ||
      post.brokerageId !== item.brokerageId
    ) {
      throw new Error("Action Item post link is outside its Build.");
    }
    const linkedItems = await actionItemsLinkedToPost(ctx, postId);
    await ctx.db.patch(postId, {
      lastMeaningfulActivityAt: input.now,
      latestActivityActorWorkosUserId: input.actorWorkosUserId,
      openActionItemCount: linkedItems.filter(
        (candidate) =>
          candidate.status !== "done" && candidate.status !== "cancelled"
      ).length,
      updatedAt: input.now,
    });
  }
}
