import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import {
  type ActiveBuildAuthorization,
  type ActiveBuildParticipantProjection,
  projectActiveBuildParticipants,
} from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  advanceBuildActionItemDeadlineSchedule,
  BUILD_ACTION_ITEM_DEADLINE_DAY_MS,
  type BuildActionItemDeadlineStage,
  buildActionItemQueueSortAt,
  dueBuildActionItemDeadlineStages,
  resetBuildActionItemDeadlineSchedule,
} from "./build_action_item_deadline_model";
import { actionItemRequiresAcceptance } from "./build_action_item_governance";
import { recordBuildActionItemRevision } from "./build_action_item_history";
import { syncBuildActionItemReferenceQueueSortAt } from "./build_action_item_queue_projection";
import {
  authorizeBuildActionItemOperation,
  isBuildActionItemCoordinator,
} from "./build_action_item_rbac";
import {
  filterReadableBuildActionItems,
  requireReadableActionItem,
} from "./build_action_items";
import {
  resolveCurrentCollaborationNotificationReaderIds,
  resolveCurrentCollaborationPostReaderIds,
} from "./build_collaboration_access";
import { canReadDrawCoordination } from "./build_draw_coordination";
import { authorizeActiveBuildHumanCollaborationAccess } from "./build_collaboration_actor";
import { systemActionItemPresentationValidator } from "./build_collaboration_contracts";
import { claimBuildCollaborationWriteByBuildId } from "./build_collaboration_lifecycle_state";
import { buildCollaborationDeepLink } from "./build_collaboration_links";
import {
  type BuildCollaborationRole,
  collaborationRoleTier,
} from "./build_collaboration_model";
import {
  emitCanonicalBuildCollaborationNotification,
  notificationKindForDeadlineStage,
} from "./build_collaboration_notifications";
import {
  canonicalizeTiptapReferences,
  referenceInputValidator,
} from "./build_collaboration_publication_bundle";
import {
  type CanonicalBuildCollaborationReference,
  resolveCanonicalBuildCollaborationReferences,
} from "./build_collaboration_references";
import {
  authorizeActiveBuildCollaborationAccess,
  BUILD_COLLABORATION_UNAVAILABLE_ERROR,
} from "./build_collaboration_rollout";
import { queueBuildCollaborationSearchOwnerRebuild } from "./build_collaboration_search_maintenance";
import { deriveMilestoneSystemActionItemPresentation } from "./build_collaboration_system_posts";
import {
  buildActionItemPriorityValidator,
  buildActionItemStatusValidator,
  buildCollaborationReferenceKindValidator,
} from "./build_collaboration_validators";
import { internalMutation } from "./fluent";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_REFERENCES_PER_ACTION_ITEM = 100;
const MAX_ACTIVE_PARTICIPANTS = 500;
const MAX_GLOBAL_AUTHORITY_MEMBERSHIPS = 2000;
const DEADLINE_BATCH_SIZE = 25;
const MAX_QUEUE_PAGE_SIZE = 50;
const DAY_MS = BUILD_ACTION_ITEM_DEADLINE_DAY_MS;

const queueScopeValidator = v.union(
  v.literal("build"),
  v.literal("post"),
  v.literal("entity"),
  v.literal("personal")
);

const queueRowValidator = v.object({
  buildId: v.id("activeBuilds"),
  buildName: v.string(),
  item: v.object({
    _creationTime: v.number(),
    _id: v.id("buildActionItems"),
    currentRevision: v.number(),
    dueAt: v.optional(v.number()),
    priority: buildActionItemPriorityValidator,
    status: buildActionItemStatusValidator,
    systemMode: v.optional(v.literal("generated_milestone_submilestone")),
    canonicalBuildMilestoneId: v.optional(v.id("buildMilestones")),
    canonicalBuildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
    canonicalPlanningState: v.optional(
      v.union(v.literal("active"), v.literal("superseded"))
    ),
    systemPresentation: v.optional(systemActionItemPresentationValidator),
    title: v.string(),
    updatedAt: v.number(),
  }),
  overdue: v.boolean(),
  overdueByMs: v.optional(v.number()),
  queueScope: queueScopeValidator,
});

const referenceInputArrayValidator = v.array(referenceInputValidator);

export const listBuildActionItemQueue = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    entityId: v.optional(v.string()),
    entityKind: v.optional(buildCollaborationReferenceKindValidator),
    includeCompleted: v.optional(v.boolean()),
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
    postId: v.optional(v.id("buildCollaborationPosts")),
    scope: v.union(v.literal("build"), v.literal("post"), v.literal("entity")),
  })
  .returns(paginationResultValidator(queueRowValidator))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const page = await resolveBuildQueuePage(ctx, authorization, {
      ...args,
      paginationOpts: boundedQueuePagination(args.paginationOpts),
    });
    const filtered = args.includeCompleted
      ? page.page
      : page.page.filter((item) => !isClosedActionItem(item));
    const readable = await filterReadableBuildActionItems(
      ctx,
      authorization,
      filtered
    );
    const asOf = Date.now();
    return {
      ...page,
      page: await Promise.all(
        readable.map((item) =>
          queueRow(ctx, item, authorization, args.scope, asOf)
        )
      ),
    };
  })
  .public();

export const listMyBuildActionItemQueue = authenticatedQuery
  .input({
    includeCompleted: v.optional(v.boolean()),
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  })
  .returns(paginationResultValidator(queueRowValidator))
  .handler(async (ctx, args) => {
    if (ctx.viewer.organizationId !== args.organizationId) {
      throw new Error("Cross-organization Action Item queues are forbidden.");
    }
    const candidatePage = await ctx.db
      .query("buildActionItems")
      .withIndex(
        "by_organizationId_and_assigneeWorkosUserId_and_queueSortAt",
        (query) =>
          query
            .eq("organizationId", args.organizationId)
            .eq("assigneeWorkosUserId", ctx.viewer.subject)
      )
      .order("asc")
      .paginate(boundedQueuePagination(args.paginationOpts));
    const candidates = args.includeCompleted
      ? candidatePage.page
      : candidatePage.page.filter((item) => !isClosedActionItem(item));
    const byBuild = new Map<Id<"activeBuilds">, Doc<"buildActionItems">[]>();
    for (const item of candidates) {
      const rows = byBuild.get(item.buildId) ?? [];
      rows.push(item);
      byBuild.set(item.buildId, rows);
    }
    const result: Awaited<ReturnType<typeof queueRow>>[] = [];
    for (const [buildId, items] of byBuild) {
      const authorization = await authorizePersonalQueueBuild(ctx, {
        buildId,
        organizationId: args.organizationId,
      });
      if (!authorization) {
        continue;
      }
      const readable = await filterReadableBuildActionItems(
        ctx,
        authorization,
        items
      );
      const asOf = Date.now();
      result.push(
        ...(await Promise.all(
          readable.map((item) =>
            queueRow(ctx, item, authorization, "personal", asOf)
          )
        ))
      );
    }
    return { ...candidatePage, page: result };
  })
  .public();

async function authorizePersonalQueueBuild(
  ctx: Parameters<typeof authorizeActiveBuildCollaborationAccess>[0],
  input: { buildId: Id<"activeBuilds">; organizationId: string }
) {
  try {
    return await authorizeActiveBuildCollaborationAccess(ctx, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message.startsWith("Forbidden:") ||
      message === BUILD_COLLABORATION_UNAVAILABLE_ERROR
    ) {
      return null;
    }
    throw error;
  }
}

export const applyBuildActionItemPolicyDueDate = internalMutation
  .input({
    actionItemId: v.id("buildActionItems"),
    buildId: v.id("activeBuilds"),
    dueAt: v.number(),
    organizationId: v.string(),
    policyKey: v.string(),
  })
  .returns(v.id("buildActionItems"))
  .handler(async (ctx, args) => {
    const item = await requireScopedActionItem(ctx, args);
    if (
      !(await claimBuildCollaborationWriteByBuildId(ctx, {
        buildId: item.buildId,
        organizationId: item.organizationId,
      }))
    ) {
      return item._id;
    }
    const policyKey = args.policyKey.trim();
    if (!(policyKey && Number.isFinite(args.dueAt) && args.dueAt > 0)) {
      throw new Error("A valid policy key and due date are required.");
    }
    const now = Date.now();
    const deadlineSchedule =
      args.dueAt === item.dueAt
        ? {}
        : resetBuildActionItemDeadlineSchedule(
            args.dueAt,
            item.status,
            item.deadlineScheduleGeneration
          );
    await ctx.db.patch(item._id, {
      currentRevision: item.currentRevision + 1,
      ...deadlineSchedule,
      dueAt: args.dueAt,
      dueDateOverrideReason: undefined,
      dueDateOverriddenAt: undefined,
      dueDateOverriddenByWorkosUserId: undefined,
      dueDatePolicyKey: policyKey,
      dueDateSource: "policy",
      policyDueAt: args.dueAt,
      queueSortAt: buildActionItemQueueSortAt(args.dueAt, item.status),
      updatedAt: now,
    });
    await syncBuildActionItemReferenceQueueSortAt(
      ctx,
      item,
      buildActionItemQueueSortAt(args.dueAt, item.status)
    );
    const updated = await requireScopedActionItem(ctx, args);
    const authorization = await loadSystemAuthorization(ctx, updated);
    await recordActionItemDeadlineChange(ctx, {
      authorization,
      eventType: "policy_due_date_applied",
      item: updated,
      now,
      prior: item,
      reason: policyKey,
    });
    return item._id;
  })
  .internal();

export const overrideBuildActionItemPolicyDueDate = authenticatedMutation
  .input({
    actionItemId: v.id("buildActionItems"),
    buildId: v.id("activeBuilds"),
    dueAt: v.number(),
    expectedRevision: v.optional(v.number()),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(v.id("buildActionItems"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const item = await requireReadableActionItem(
      ctx,
      authorization,
      args.actionItemId
    );
    const decision = actionItemDecision(authorization, item);
    if (
      !(
        isBuildActionItemCoordinator(authorization.effectiveRole.role) &&
        decision.allowed
      ) ||
      (decision.authority !== "creator" && decision.authority !== "coordinator")
    ) {
      throw new Error(
        "Policy due dates may only be overridden by coordinating authority."
      );
    }
    if (item.dueDateSource !== "policy") {
      throw new Error(
        "This Action Item does not have a policy-derived due date."
      );
    }
    assertExpectedRevision(item, args.expectedRevision);
    const reason = args.reason.trim();
    if (!reason) {
      throw new Error("A policy due-date override reason is required.");
    }
    if (!(Number.isFinite(args.dueAt) && args.dueAt > 0)) {
      throw new Error("A valid policy due date is required.");
    }
    const now = Date.now();
    const deadlineSchedule =
      args.dueAt === item.dueAt
        ? {}
        : resetBuildActionItemDeadlineSchedule(
            args.dueAt,
            item.status,
            item.deadlineScheduleGeneration
          );
    await ctx.db.patch(item._id, {
      currentRevision: item.currentRevision + 1,
      ...deadlineSchedule,
      dueAt: args.dueAt,
      dueDateOverrideReason: reason,
      dueDateOverriddenAt: now,
      dueDateOverriddenByWorkosUserId: authorization.viewer.subject,
      queueSortAt: buildActionItemQueueSortAt(args.dueAt, item.status),
      updatedAt: now,
    });
    await syncBuildActionItemReferenceQueueSortAt(
      ctx,
      item,
      buildActionItemQueueSortAt(args.dueAt, item.status)
    );
    const updated = await requireReadableActionItem(
      ctx,
      authorization,
      item._id
    );
    await recordActionItemDeadlineChange(ctx, {
      authorization,
      eventType: "policy_due_date_overridden",
      item: updated,
      now,
      prior: item,
      reason,
    });
    return item._id;
  })
  .public();

export const replaceBuildActionItemReferences = authenticatedMutation
  .input({
    actionItemId: v.id("buildActionItems"),
    buildId: v.id("activeBuilds"),
    expectedRevision: v.number(),
    organizationId: v.string(),
    reason: v.string(),
    references: referenceInputArrayValidator,
  })
  .returns(v.id("buildActionItems"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const item = await requireReadableActionItem(
      ctx,
      authorization,
      args.actionItemId
    );
    assertExpectedRevision(item, args.expectedRevision);
    const decision = actionItemDecision(authorization, item);
    if (!decision.allowed) {
      throw new Error("Forbidden: Action Item reference edit authority");
    }
    const reason = args.reason.trim();
    if (!reason) {
      throw new Error("A material reference change reason is required.");
    }
    if (args.references.length > MAX_REFERENCES_PER_ACTION_ITEM) {
      throw new Error("Action Item references exceed the supported limit.");
    }
    const post = await ctx.db.get(item.originatingPostId);
    if (!post) {
      throw new Error("Action Item parent post is unavailable.");
    }
    const readerIds = await resolveCurrentCollaborationPostReaderIds(
      ctx,
      authorization,
      post
    );
    const references = await resolveCanonicalBuildCollaborationReferences(ctx, {
      authorization,
      readerIds,
      references: args.references,
    });
    const existing = await ctx.db
      .query("buildCollaborationReferences")
      .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
        query.eq("ownerKind", "actionItem").eq("ownerRecordId", item._id)
      )
      .take(MAX_REFERENCES_PER_ACTION_ITEM + 1);
    if (existing.length > MAX_REFERENCES_PER_ACTION_ITEM) {
      throw new Error(
        "Action Item reference integrity exceeds the safe limit."
      );
    }
    assertActionItemReferenceScope(existing, {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      organizationId: authorization.organizationId,
      ownerRecordId: item._id,
      postId: post._id,
    });
    if (sameReferences(existing, references)) {
      return item._id;
    }
    const canonicalContent = canonicalizeTiptapReferences(
      item.descriptionTiptapJson,
      references,
      { allowEmpty: true }
    );
    const now = Date.now();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    for (const reference of references) {
      await ctx.db.insert("buildCollaborationReferences", {
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        createdAt: now,
        entityId: reference.entityId,
        entityKind: reference.entityKind,
        labelSnapshot: reference.label,
        organizationId: authorization.organizationId,
        ownerKind: "actionItem",
        ownerRecordId: item._id,
        postId: post._id,
        primary: reference.primary ?? false,
        actionItemQueueSortAt:
          item.queueSortAt ??
          buildActionItemQueueSortAt(item.dueAt, item.status),
        summarySnapshot: reference.summary,
      });
    }
    const primary =
      references.find((reference) => reference.primary) ?? references[0];
    await ctx.db.patch(item._id, {
      currentRevision: item.currentRevision + 1,
      descriptionPlainText: canonicalContent.plainText,
      descriptionTiptapJson: canonicalContent.tiptapJson,
      primaryReferenceId: primary?.entityId,
      primaryReferenceKind: primary?.entityKind,
      updatedAt: now,
    });
    const updated = await requireReadableActionItem(
      ctx,
      authorization,
      item._id
    );
    await recordMaterialReferenceChange(ctx, {
      authorization,
      decision,
      existing,
      item: updated,
      now,
      reason,
      references,
    });
    await queueBuildCollaborationSearchOwnerRebuild(ctx, {
      authorization,
      owner: { id: item._id, kind: "actionItem" },
      postId: post._id,
    });
    return item._id;
  })
  .public();

export const processBuildActionItemDeadlines = internalMutation
  .input({
    asOf: v.optional(v.number()),
    buildId: v.optional(v.id("activeBuilds")),
    cursor: v.optional(v.union(v.string(), v.null())),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const asOf = args.asOf ?? Date.now();
    const query = args.buildId
      ? ctx.db
          .query("buildActionItems")
          .withIndex(
            "by_buildId_and_deadlineProcessingState_and_nextDeadlineAt",
            (builder) =>
              builder
                .eq("buildId", args.buildId as Id<"activeBuilds">)
                .eq("deadlineProcessingState", "pending")
                .lte("deadlineNextAt", asOf)
          )
      : ctx.db
          .query("buildActionItems")
          .withIndex(
            "by_deadlineProcessingState_and_nextDeadlineAt",
            (builder) =>
              builder
                .eq("deadlineProcessingState", "pending")
                .lte("deadlineNextAt", asOf)
          );
    const page = await query.paginate({
      cursor: args.cursor ?? null,
      numItems: DEADLINE_BATCH_SIZE,
    });
    for (const item of page.page) {
      if (
        !(await claimBuildCollaborationWriteByBuildId(ctx, {
          buildId: item.buildId,
          organizationId: item.organizationId,
        }))
      ) {
        continue;
      }
      await ctx.scheduler.runAfter(
        0,
        internal.build_action_item_queues.processOneBuildActionItemDeadline,
        { actionItemId: item._id, asOf }
      );
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.build_action_item_queues.processBuildActionItemDeadlines,
        {
          asOf,
          buildId: args.buildId,
          cursor: page.continueCursor,
        }
      );
    }
    return null;
  })
  .internal();

export const processOneBuildActionItemDeadline = internalMutation
  .input({
    actionItemId: v.id("buildActionItems"),
    asOf: v.number(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const item = await ctx.db.get(args.actionItemId);
    if (
      !item ||
      item.deadlineProcessingState !== "pending" ||
      item.deadlineNextAt === undefined ||
      item.deadlineNextAt > args.asOf
    ) {
      return null;
    }
    try {
      const build = await ctx.db.get(item.buildId);
      if (!build || build.organizationId !== item.organizationId) {
        throw new Error("Action Item Build scope integrity check failed.");
      }
      if (
        !(await claimBuildCollaborationWriteByBuildId(ctx, {
          buildId: item.buildId,
          organizationId: item.organizationId,
        }))
      ) {
        return null;
      }
      if (
        item.dueAt === undefined ||
        item.deadlineNextStage === undefined ||
        isClosedActionItem(item)
      ) {
        await ctx.db.patch(
          item._id,
          resetBuildActionItemDeadlineSchedule(
            item.dueAt,
            item.status,
            item.deadlineScheduleGeneration
          )
        );
        return null;
      }
      const stages = dueBuildActionItemDeadlineStages({
        asOf: args.asOf,
        dueAt: item.dueAt,
        nextStage: item.deadlineNextStage,
      });
      if (stages.length === 0) {
        return null;
      }
      await emitEligibleDeadlineStages(ctx, item, stages);
      await ctx.db.patch(
        item._id,
        advanceBuildActionItemDeadlineSchedule({
          dueAt: item.dueAt,
          processedStages: stages,
        })
      );
    } catch (error) {
      await quarantineBuildActionItemDeadline(ctx, item, error);
    }
    return null;
  })
  .internal();

async function resolveBuildQueuePage(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  args: {
    entityId?: string;
    entityKind?: Doc<"buildCollaborationReferences">["entityKind"];
    paginationOpts: { cursor: string | null; numItems: number };
    postId?: Id<"buildCollaborationPosts">;
    scope: "build" | "post" | "entity";
  }
) {
  if (args.scope === "build") {
    return await ctx.db
      .query("buildActionItems")
      .withIndex("by_buildId_and_queueSortAt", (query) =>
        query.eq("buildId", authorization.build._id)
      )
      .order("asc")
      .paginate(args.paginationOpts);
  }
  if (args.scope === "post") {
    if (!args.postId) {
      throw new Error("A post queue requires a post.");
    }
    const post = await ctx.db.get(args.postId);
    if (
      !post ||
      post.buildId !== authorization.build._id ||
      post.organizationId !== authorization.organizationId ||
      post.brokerageId !== authorization.brokerage._id
    ) {
      throw new Error("Action Item post queue is unavailable.");
    }
    if (
      post.systemPostKind === "draw" &&
      !(await canReadDrawCoordination(ctx, { authorization, post }))
    ) {
      return { continueCursor: "", isDone: true, page: [] };
    }
    return await ctx.db
      .query("buildActionItems")
      .withIndex("by_originatingPostId_and_queueSortAt", (query) =>
        query.eq("originatingPostId", post._id)
      )
      .order("asc")
      .paginate(args.paginationOpts);
  }
  const entityId = args.entityId?.trim();
  if (!(args.entityKind && entityId)) {
    throw new Error("An entity queue requires an entity kind and ID.");
  }
  const referencePage = await ctx.db
    .query("buildCollaborationReferences")
    .withIndex("by_build_entity_owner_queueSort", (query) =>
      query
        .eq("buildId", authorization.build._id)
        .eq(
          "entityKind",
          args.entityKind as NonNullable<typeof args.entityKind>
        )
        .eq("entityId", entityId)
        .eq("ownerKind", "actionItem")
    )
    .order("asc")
    .paginate(args.paginationOpts);
  const matchingItems: Doc<"buildActionItems">[] = [];
  for (const reference of referencePage.page) {
    const actionItemId = ctx.db.normalizeId(
      "buildActionItems",
      reference.ownerRecordId
    );
    if (!(actionItemId && reference.actionItemQueueSortAt !== undefined)) {
      throw new Error(
        "Referenced-entity Action Item queue requires the queue projection migration."
      );
    }
    const item = await ctx.db.get(actionItemId);
    const originatingPost = item
      ? await ctx.db.get(item.originatingPostId)
      : null;
    if (
      originatingPost?.systemPostKind === "draw" &&
      !(await canReadDrawCoordination(ctx, {
        authorization,
        post: originatingPost,
      }))
    ) {
      continue;
    }
    if (
      !item ||
      reference.organizationId !== authorization.organizationId ||
      reference.brokerageId !== authorization.brokerage._id ||
      item.organizationId !== authorization.organizationId ||
      item.brokerageId !== authorization.brokerage._id ||
      item.buildId !== authorization.build._id ||
      reference.postId !== item.originatingPostId ||
      reference.actionItemQueueSortAt !==
        (item.queueSortAt ??
          buildActionItemQueueSortAt(item.dueAt, item.status))
    ) {
      throw new Error("Referenced-entity Action Item queue integrity failure.");
    }
    matchingItems.push(item);
  }
  return {
    ...referencePage,
    page: matchingItems,
  };
}

async function queueRow(
  ctx: QueryCtx,
  item: Doc<"buildActionItems">,
  authorization: ActiveBuildAuthorization,
  scope: "build" | "post" | "entity" | "personal",
  now: number
) {
  const systemPresentation = await deriveMilestoneSystemActionItemPresentation(
    ctx,
    {
      actionItem: item,
      asOf: now,
      build: authorization.build,
      viewer: {
        role: authorization.effectiveRole.role,
        workosUserId: authorization.viewer.subject,
      },
    }
  );
  const deadline = actionItemOverdueState(item, now);
  return {
    buildId: authorization.build._id,
    buildName: authorization.build.buildName,
    item: {
      _creationTime: item._creationTime,
      _id: item._id,
      currentRevision: item.currentRevision,
      dueAt: item.dueAt,
      priority: item.priority,
      status: item.status,
      systemMode: item.systemMode,
      canonicalBuildMilestoneId: item.canonicalBuildMilestoneId,
      canonicalBuildSubmilestoneId: item.canonicalBuildSubmilestoneId,
      canonicalPlanningState: item.canonicalPlanningState,
      systemPresentation,
      title: item.title,
      updatedAt: item.updatedAt,
    },
    ...deadline,
    overdue:
      deadline.overdue ||
      systemPresentation?.attention === "overdue_completion",
    queueScope: scope,
  };
}

function boundedQueuePagination(input: {
  cursor: string | null;
  numItems: number;
}) {
  if (
    !Number.isInteger(input.numItems) ||
    input.numItems < 1 ||
    input.numItems > MAX_QUEUE_PAGE_SIZE
  ) {
    throw new Error(
      `Action Item queue pages must contain 1 to ${MAX_QUEUE_PAGE_SIZE} items.`
    );
  }
  return input;
}

export function actionItemOverdueState(
  item: Pick<Doc<"buildActionItems">, "dueAt" | "status">,
  now: number
) {
  const overdue =
    !isClosedActionItem(item) && item.dueAt !== undefined && now > item.dueAt;
  return {
    overdue,
    overdueByMs: overdue ? now - (item.dueAt as number) : undefined,
  };
}

function isClosedActionItem(item: Pick<Doc<"buildActionItems">, "status">) {
  return item.status === "done" || item.status === "cancelled";
}

async function requireScopedActionItem(
  ctx: QueryCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    buildId: Id<"activeBuilds">;
    organizationId: string;
  }
) {
  const item = await ctx.db.get(input.actionItemId);
  if (
    !item ||
    item.buildId !== input.buildId ||
    item.organizationId !== input.organizationId
  ) {
    throw new Error("Action Item is unavailable.");
  }
  const build = await ctx.db.get(input.buildId);
  if (
    !build ||
    build.organizationId !== input.organizationId ||
    build.brokerageId !== item.brokerageId
  ) {
    throw new Error("Action Item Build scope is unavailable.");
  }
  return item;
}

function actionItemDecision(
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">
) {
  const creatorRole =
    item.creatorRole ??
    authorization.participants.find(
      (participant) => participant.workosUserId === item.creatorWorkosUserId
    )?.role;
  return authorizeBuildActionItemOperation({
    actor: {
      role: authorization.effectiveRole.role,
      workosUserId: authorization.viewer.subject,
    },
    item: {
      assignedByWorkosUserId: item.assignedByWorkosUserId,
      assigneeWorkosUserId: item.assigneeWorkosUserId,
      assignmentState: item.assignmentState,
      creatorRole,
      creatorWorkosUserId: item.creatorWorkosUserId,
      requiresAcceptance: actionItemRequiresAcceptance(item),
      status: item.status,
    },
    operation: "edit_fields",
  });
}

function assertExpectedRevision(
  item: Doc<"buildActionItems">,
  expectedRevision: number | undefined
) {
  if (
    expectedRevision !== undefined &&
    item.currentRevision !== expectedRevision
  ) {
    throw new Error(
      "This Action Item changed since you opened it. Refresh and try again."
    );
  }
}

function assertActionItemReferenceScope(
  rows: readonly Doc<"buildCollaborationReferences">[],
  expected: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    organizationId: string;
    ownerRecordId: Id<"buildActionItems">;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  const corrupted = rows.some(
    (row) =>
      row.organizationId !== expected.organizationId ||
      row.brokerageId !== expected.brokerageId ||
      row.buildId !== expected.buildId ||
      row.postId !== expected.postId ||
      row.ownerKind !== "actionItem" ||
      row.ownerRecordId !== expected.ownerRecordId
  );
  if (corrupted) {
    throw new Error(
      "Action Item reference scope integrity failure; repair the legacy reference before editing."
    );
  }
}

function sameReferences(
  existing: Doc<"buildCollaborationReferences">[],
  next: CanonicalBuildCollaborationReference[]
) {
  const existingKeys = existing.map(referenceKey).sort();
  const nextKeys = next
    .map((reference) =>
      [
        reference.entityKind,
        reference.entityId,
        reference.primary ? "primary" : "secondary",
        reference.label,
        reference.summary ?? "",
      ].join(":")
    )
    .sort();
  return JSON.stringify(existingKeys) === JSON.stringify(nextKeys);
}

function referenceKey(reference: Doc<"buildCollaborationReferences">) {
  return [
    reference.entityKind,
    reference.entityId,
    reference.primary ? "primary" : "secondary",
    reference.labelSnapshot,
    reference.summarySnapshot ?? "",
  ].join(":");
}

async function recordMaterialReferenceChange(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    decision: ReturnType<typeof actionItemDecision>;
    existing: Doc<"buildCollaborationReferences">[];
    item: Doc<"buildActionItems">;
    now: number;
    reason: string;
    references: CanonicalBuildCollaborationReference[];
  }
) {
  const priorTargets = input.existing.map((row) => ({
    entityId: row.entityId,
    entityKind: row.entityKind,
  }));
  const nextTargets = input.references.map((row) => ({
    entityId: row.entityId,
    entityKind: row.entityKind,
  }));
  const state = JSON.stringify({ nextTargets, priorTargets });
  await ctx.db.insert("buildActionItemEvents", {
    actionItemId: input.item._id,
    actorRole: input.authorization.effectiveRole.role,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: input.now,
    eventType: "references_changed",
    exercisedAuthority: input.decision.authority,
    newState: state,
    organizationId: input.authorization.organizationId,
    reason: input.reason,
    revision: input.item.currentRevision,
  });
  await recordBuildActionItemRevision(ctx, {
    authorization: input.authorization,
    item: input.item,
    now: input.now,
    reason: input.reason,
  });
  const post = await ctx.db.get(input.item.originatingPostId);
  if (!post) {
    throw new Error("Action Item parent post is unavailable.");
  }
  await ctx.db.patch(post._id, {
    lastMeaningfulActivityAt: input.now,
    latestActivityActorWorkosUserId: input.authorization.viewer.subject,
    updatedAt: input.now,
  });
  const targets = new Map(
    [...priorTargets, ...nextTargets].map((target) => [
      `${target.entityKind}:${target.entityId}`,
      target,
    ])
  );
  for (const target of targets.values()) {
    await ctx.db.insert("buildCollaborationActivityProjections", {
      actionItemId: input.item._id,
      actorWorkosUserId: input.authorization.viewer.subject,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      eventType: "action_item_references_changed",
      organizationId: input.authorization.organizationId,
      postId: post._id,
      projectionKey: [
        "action_item_references_changed",
        input.item._id,
        input.item.currentRevision,
        target.entityKind,
        target.entityId,
      ].join(":"),
      targetId: target.entityId,
      targetKind: target.entityKind,
    });
  }
  await Promise.all([
    ctx.db.insert("auditEvents", {
      actorRoles: input.authorization.roles,
      actorWorkosUserId: input.authorization.viewer.subject,
      brokerageId: input.authorization.brokerage._id,
      command: "replaceBuildActionItemReferences",
      createdAt: input.now,
      entityId: input.item._id,
      entityType: "buildActionItem",
      eventType: "build.collaboration.action_item.references_changed",
      newState: state,
      organizationId: input.authorization.organizationId,
      reason: input.reason,
      warnings: [],
    }),
    ctx.db.insert("eventOutbox", {
      brokerageId: input.authorization.brokerage._id,
      createdAt: input.now,
      eventType: "build.collaboration.action_item.references_changed",
      organizationId: input.authorization.organizationId,
      payloadPreview: state,
      relatedEntityId: input.item._id,
      relatedEntityType: "buildActionItem",
      status: "pending",
    }),
  ]);
}

async function recordActionItemDeadlineChange(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    eventType: "policy_due_date_applied" | "policy_due_date_overridden";
    item: Doc<"buildActionItems">;
    now: number;
    prior: Doc<"buildActionItems">;
    reason: string;
  }
) {
  const state = JSON.stringify({
    dueAt: input.item.dueAt,
    dueDatePolicyKey: input.item.dueDatePolicyKey,
    dueDateSource: input.item.dueDateSource,
    policyDueAt: input.item.policyDueAt,
  });
  await ctx.db.insert("buildActionItemEvents", {
    actionItemId: input.item._id,
    actorRole: input.authorization.effectiveRole.role,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: input.now,
    eventType: input.eventType,
    exercisedAuthority: "coordinator",
    newState: state,
    organizationId: input.authorization.organizationId,
    priorState: JSON.stringify({ dueAt: input.prior.dueAt }),
    reason: input.reason,
    revision: input.item.currentRevision,
  });
  await recordBuildActionItemRevision(ctx, {
    authorization: input.authorization,
    item: input.item,
    now: input.now,
    reason: input.reason,
  });
  await Promise.all([
    ctx.db.insert("auditEvents", {
      actorRoles: input.authorization.roles,
      actorWorkosUserId: input.authorization.viewer.subject,
      brokerageId: input.authorization.brokerage._id,
      command: input.eventType,
      createdAt: input.now,
      entityId: input.item._id,
      entityType: "buildActionItem",
      eventType: `build.collaboration.action_item.${input.eventType}`,
      newState: state,
      organizationId: input.authorization.organizationId,
      priorState: JSON.stringify({ dueAt: input.prior.dueAt }),
      reason: input.reason,
      warnings: [],
    }),
    ctx.db.insert("eventOutbox", {
      brokerageId: input.authorization.brokerage._id,
      createdAt: input.now,
      eventType: `build.collaboration.action_item.${input.eventType}`,
      organizationId: input.authorization.organizationId,
      payloadPreview: state,
      relatedEntityId: input.item._id,
      relatedEntityType: "buildActionItem",
      status: "pending",
    }),
  ]);
}

async function emitEligibleDeadlineStages(
  ctx: MutationCtx,
  item: Doc<"buildActionItems">,
  stages: readonly BuildActionItemDeadlineStage[]
) {
  const authorization = await loadSystemAuthorization(ctx, item);
  const post = await ctx.db.get(item.originatingPostId);
  if (
    !post ||
    post.buildId !== item.buildId ||
    post.organizationId !== item.organizationId ||
    post.brokerageId !== item.brokerageId
  ) {
    throw new Error("Action Item parent post scope integrity failure.");
  }
  const readers = new Set(
    await resolveCurrentCollaborationNotificationReaderIds(
      ctx,
      authorization,
      post
    )
  );
  const responsibleId = item.assigneeWorkosUserId ?? item.creatorWorkosUserId;
  for (const stage of stages) {
    const recipientWorkosUserId =
      stage === "escalated"
        ? escalationRecipient(authorization, item, readers)
        : readers.has(responsibleId)
          ? responsibleId
          : undefined;
    if (!recipientWorkosUserId) {
      continue;
    }
    await emitDeadlineStage(ctx, {
      authorization,
      item,
      readerIds: readers,
      recipientWorkosUserId,
      stage,
    });
  }
}

export function eligibleDeadlineStages(
  dueAt: number,
  asOf: number
): BuildActionItemDeadlineStage[] {
  const stages: BuildActionItemDeadlineStage[] = [];
  if (asOf >= dueAt - DAY_MS) {
    stages.push("before");
  }
  if (asOf >= dueAt) {
    stages.push("due");
  }
  if (asOf >= dueAt + DAY_MS) {
    stages.push("overdue");
  }
  if (asOf >= dueAt + 2 * DAY_MS) {
    stages.push("escalated");
  }
  return stages;
}

function escalationRecipient(
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">,
  readers: Set<string>
) {
  const coordinators = authorization.participants
    .filter(
      (participant) =>
        participant.workosUserId !== item.assigneeWorkosUserId &&
        readers.has(participant.workosUserId) &&
        isBuildActionItemCoordinator(participant.role)
    )
    .sort(
      (left, right) =>
        collaborationRoleTier(right.role) - collaborationRoleTier(left.role) ||
        left.workosUserId.localeCompare(right.workosUserId)
    );
  return (
    coordinators.find(
      (participant) => participant.workosUserId === item.assignedByWorkosUserId
    )?.workosUserId ??
    coordinators.find(
      (participant) => participant.workosUserId === item.creatorWorkosUserId
    )?.workosUserId ??
    coordinators[0]?.workosUserId
  );
}

async function emitDeadlineStage(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    item: Doc<"buildActionItems">;
    readerIds: Set<string>;
    recipientWorkosUserId: string;
    stage: BuildActionItemDeadlineStage;
  }
) {
  const dueAt = input.item.dueAt as number;
  const dedupeKey = `build-action-item:${input.item._id}:schedule:${input.item.deadlineScheduleGeneration ?? 0}:${input.stage}:${dueAt}`;
  const now = Date.now();
  const title = deadlineTitle(input.stage);
  const recipientRole = input.authorization.participants.find(
    (participant) => participant.workosUserId === input.recipientWorkosUserId
  )?.role;
  const href = buildActionItemDeadlineHref({
    actionItemId: input.item._id,
    buildId: input.item.buildId,
    recipientRole,
  });
  const deliveryId = await emitCanonicalBuildCollaborationNotification(ctx, {
    actionItemId: input.item._id,
    actionLabel: "Open Action Item",
    authorization: input.authorization,
    body: `${input.item.title} · due ${new Date(dueAt).toISOString()}`,
    dedupeKey,
    entityId: input.item._id,
    entityType: "buildActionItem",
    href,
    kind: notificationKindForDeadlineStage(input.stage),
    now,
    postId: input.item.originatingPostId,
    readerIds: input.readerIds,
    recipientWorkosUserId: input.recipientWorkosUserId,
    title,
  });
  if (!deliveryId) {
    return;
  }
  const payload = JSON.stringify({
    actionItemId: input.item._id,
    dueAt,
    recipientWorkosUserId: input.recipientWorkosUserId,
    stage: input.stage,
  });
  await Promise.all([
    ctx.db.insert("auditEvents", {
      actorRoles: ["admin"],
      actorWorkosUserId: "system:action-item-deadlines",
      brokerageId: input.authorization.brokerage._id,
      command: "processBuildActionItemDeadlines",
      createdAt: now,
      entityId: input.item._id,
      entityType: "buildActionItem",
      eventType: `build.collaboration.action_item.deadline.${input.stage}`,
      newState: payload,
      organizationId: input.authorization.organizationId,
      warnings: [],
    }),
    ctx.db.insert("eventOutbox", {
      brokerageId: input.authorization.brokerage._id,
      createdAt: now,
      eventType: `build.collaboration.action_item.deadline.${input.stage}`,
      organizationId: input.authorization.organizationId,
      payloadPreview: payload,
      relatedEntityId: input.item._id,
      relatedEntityType: "buildActionItem",
      status: "pending",
    }),
  ]);
}

export function buildActionItemDeadlineHref(input: {
  actionItemId: string;
  buildId: string;
  recipientRole: BuildCollaborationRole | undefined;
}) {
  return buildCollaborationDeepLink({
    buildId: input.buildId,
    focus: `actionItem:${input.actionItemId}`,
    recipientRole: input.recipientRole,
  });
}

function deadlineTitle(stage: BuildActionItemDeadlineStage) {
  switch (stage) {
    case "before":
      return "Action Item due soon";
    case "due":
      return "Action Item due now";
    case "overdue":
      return "Action Item overdue";
    case "escalated":
      return "Overdue Action Item escalated";
  }
}

async function quarantineBuildActionItemDeadline(
  ctx: MutationCtx,
  item: Doc<"buildActionItems">,
  error: unknown
) {
  const now = Date.now();
  const failure =
    error instanceof Error
      ? error.message.slice(0, 500)
      : "Unknown deadline processing failure";
  await ctx.db.patch(item._id, {
    deadlineNextAt: undefined,
    deadlineNextStage: undefined,
    deadlineProcessingFailedAt: now,
    deadlineProcessingFailure: failure,
    deadlineProcessingState: "quarantined",
  });
  const trustedScope = await resolveTrustedDeadlineQuarantineScope(ctx, item);
  if (!trustedScope) {
    console.error(
      "Action Item deadline quarantined without tenant attribution",
      {
        actionItemId: item._id,
        buildId: item.buildId,
        failure,
      }
    );
    return;
  }
  const payload = JSON.stringify({
    actionItemId: item._id,
    failure,
    state: "quarantined",
  });
  await Promise.all([
    ctx.db.insert("auditEvents", {
      actorRoles: ["admin"],
      actorWorkosUserId: "system:action-item-deadlines",
      brokerageId: trustedScope.brokerageId,
      command: "quarantineBuildActionItemDeadline",
      createdAt: now,
      entityId: item._id,
      entityType: "buildActionItem",
      eventType: "build.collaboration.action_item.deadline.quarantined",
      newState: payload,
      organizationId: trustedScope.organizationId,
      warnings: [failure],
    }),
    ctx.db.insert("eventOutbox", {
      brokerageId: trustedScope.brokerageId,
      createdAt: now,
      eventType: "build.collaboration.action_item.deadline.quarantined",
      organizationId: trustedScope.organizationId,
      payloadPreview: payload,
      relatedEntityId: item._id,
      relatedEntityType: "buildActionItem",
      status: "pending",
    }),
  ]);
}

async function resolveTrustedDeadlineQuarantineScope(
  ctx: MutationCtx,
  item: Doc<"buildActionItems">
) {
  const build = await ctx.db.get(item.buildId);
  if (!build) {
    return null;
  }
  const [brokerage, proposal] = await Promise.all([
    ctx.db.get(build.brokerageId),
    ctx.db.get(build.proposalId),
  ]);
  if (
    !(brokerage && proposal) ||
    brokerage.workosOrganizationId !== build.organizationId ||
    proposal.organizationId !== build.organizationId ||
    proposal.brokerageId !== build.brokerageId
  ) {
    return null;
  }
  return {
    brokerageId: build.brokerageId,
    organizationId: build.organizationId,
  };
}

async function loadSystemAuthorization(
  ctx: QueryCtx,
  item: Doc<"buildActionItems">
): Promise<ActiveBuildAuthorization> {
  const build = await ctx.db.get(item.buildId);
  if (
    !build ||
    build.organizationId !== item.organizationId ||
    build.brokerageId !== item.brokerageId
  ) {
    throw new Error("Action Item Build scope is unavailable.");
  }
  const [brokerage, proposal, activeParticipants, organizationMemberships] =
    await Promise.all([
      ctx.db.get(build.brokerageId),
      ctx.db.get(build.proposalId),
      ctx.db
        .query("buildParticipants")
        .withIndex("by_buildId_and_status", (query) =>
          query.eq("buildId", build._id).eq("status", "active")
        )
        .take(MAX_ACTIVE_PARTICIPANTS + 1),
      ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_organization", (query) =>
          query.eq("workosOrganizationId", item.organizationId)
        )
        .take(MAX_GLOBAL_AUTHORITY_MEMBERSHIPS + 1),
    ]);
  if (
    !(brokerage && proposal) ||
    brokerage.workosOrganizationId !== item.organizationId ||
    proposal.organizationId !== item.organizationId ||
    proposal.brokerageId !== brokerage._id
  ) {
    throw new Error("Action Item tenant scope is unavailable.");
  }
  if (activeParticipants.length > MAX_ACTIVE_PARTICIPANTS) {
    throw new Error(
      "Action Item participant projection exceeds the safe limit."
    );
  }
  if (organizationMemberships.length > MAX_GLOBAL_AUTHORITY_MEMBERSHIPS) {
    throw new Error(
      "Organization authority projection exceeds the safe limit."
    );
  }
  const participants = await projectActiveBuildParticipants(ctx, {
    build,
    grantedParticipants: activeParticipants,
    proposal,
  });
  mergeGlobalAuthorityParticipants(participants, organizationMemberships);
  return {
    brokerage,
    build,
    effectiveRole: { role: "admin", tier: collaborationRoleTier("admin") },
    organizationId: item.organizationId,
    participants,
    proposal,
    roles: ["admin"],
    viewer: {
      actorKind: "system",
      capability: "authenticated",
      organizationId: item.organizationId,
      roles: ["admin"],
      subject: "system:action-item-deadlines",
      tokenIdentifier: `system:action-item-deadlines:${build._id}`,
    },
  };
}

function mergeGlobalAuthorityParticipants(
  participants: ActiveBuildParticipantProjection[],
  organizationMemberships: Doc<"workosOrganizationMemberships">[]
) {
  for (const membership of organizationMemberships) {
    if (membership.status !== "active") {
      continue;
    }
    const currentRoles = new Set([
      ...membership.roleSlugs,
      ...(membership.roleSlug ? [membership.roleSlug] : []),
    ]);
    const role = currentRoles.has("admin")
      ? "admin"
      : currentRoles.has("principle-broker") ||
          currentRoles.has("principal-broker")
        ? "principle-broker"
        : undefined;
    if (!role) {
      continue;
    }
    const existingIndex = participants.findIndex(
      (participant) => participant.workosUserId === membership.workosUserId
    );
    if (existingIndex >= 0) {
      const existing = participants[existingIndex];
      if (collaborationRoleTier(role) > collaborationRoleTier(existing.role)) {
        participants[existingIndex] = {
          ...existing,
          role,
          source: "derived",
        };
      }
      continue;
    }
    participants.push({
      displayName: membership.workosUserId,
      participationPeriod: 1,
      role,
      source: "derived",
      workosUserId: membership.workosUserId,
    });
  }
}
