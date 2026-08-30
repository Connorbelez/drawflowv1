import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  persistCanonicalBuildActionItem,
  persistCanonicalBuildActionItemPatch,
} from "./build_action_item_application";
import { buildActionItemQueueSortAt } from "./build_action_item_deadline_model";
import { recordBuildActionItemRevision } from "./build_action_item_history";
import { actionItemsLinkedToPost } from "./build_action_item_post_links";
import type { BuildActionItemAuthorizationDecision } from "./build_action_item_rbac";
import {
  type ActionItemAuthorization,
  actionItemAuditState,
  applyManualDueDatePatch,
  assertActionItemOperation,
  assertCanonicalMilestoneActionItemMutable,
  assertCompletionAcceptanceChange,
  permitsStaleDescriptionOverride,
  persistBuildActionItemActivity,
  persistBuildActionItemAttachments,
  persistBuildActionItemLabels,
  persistBuildActionItemReferences,
  recordChildActionItemMutation,
  replaceBuildActionItemLabels,
  requireActionItemCreationPost,
  requiredActionItemTitle,
  requireReadableActionItem,
  resolveActionItemCreationReplay,
  resolveNewActionItemAssignment,
  resolveNewActionItemWorkKind,
  resolveParentActionItemForCreation,
  type VisibleActionItemRelation,
  validateTiptapJson,
} from "./build_action_items/helpers";
import {
  canReadCollaborationPost,
  resolveCurrentCollaborationPostReaderIds,
} from "./build_collaboration_access";
import { authorizeActiveBuildHumanCollaborationAccess } from "./build_collaboration_actor";
import { buildActionItemListRowValidator } from "./build_collaboration_contracts";
import { buildCollaborationDeepLink } from "./build_collaboration_links";
import { emitCanonicalBuildCollaborationNotification } from "./build_collaboration_notifications";
import {
  canonicalizeTiptapReferences,
  referenceInputValidator,
} from "./build_collaboration_publication_bundle";
import {
  type CanonicalBuildCollaborationReference,
  resolveCanonicalBuildCollaborationReferences,
} from "./build_collaboration_references";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import { queueBuildCollaborationSearchOwnerRebuild } from "./build_collaboration_search_maintenance";
import { canReadMilestoneSystemActionItem } from "./build_collaboration_system_event_access";
import {
  deriveMilestoneSystemActionItemPresentation,
  type MilestoneActionItemPlanningCache,
} from "./build_collaboration_system_posts";
import {
  buildActionItemPriorityValidator,
  buildActionItemWorkKindValidator,
} from "./build_collaboration_validators";
import {
  canReadDrawCoordination,
  resolveCurrentDrawCoordinationReaderIds,
} from "./build_draw_coordination";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

export type { GeneratedMilestoneCompanionBinding } from "./build_action_items/helpers";
// biome-ignore lint/performance/noBarrelFile: Compatibility exports keep the existing generated Convex module surface stable.
export {
  assertCanonicalMilestoneActionItemMutable,
  requireReadableActionItem,
  resolveGeneratedMilestoneCompanionBinding,
  validateTiptapJson,
} from "./build_action_items/helpers";

const MAX_ACTION_ITEMS_PER_BUILD = 2000;
const MAX_CHECKLIST_ITEMS = 250;

export const createBuildActionItem = authenticatedMutation
  .input({
    assigneeWorkosUserId: v.optional(v.string()),
    buildId: v.id("activeBuilds"),
    descriptionPlainText: v.optional(v.string()),
    descriptionTiptapJson: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    expectedParentRevision: v.optional(v.number()),
    attachmentAssetIds: v.optional(v.array(v.id("buildCollaborationAssets"))),
    labels: v.optional(v.array(v.string())),
    organizationId: v.string(),
    parentActionItemId: v.optional(v.id("buildActionItems")),
    postId: v.id("buildCollaborationPosts"),
    priority: v.optional(buildActionItemPriorityValidator),
    references: v.optional(v.array(referenceInputValidator)),
    requestId: v.optional(v.string()),
    requiresAcceptance: v.optional(v.boolean()),
    title: v.string(),
    workKind: v.optional(buildActionItemWorkKindValidator),
  })
  .returns(v.id("buildActionItems"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const post = await requireActionItemCreationPost(
      ctx,
      authorization,
      args.postId
    );
    const { replayActionItemId, requestId } =
      await resolveActionItemCreationReplay(ctx, {
        authorization,
        postId: post._id,
        requestId: args.requestId,
      });
    if (replayActionItemId) {
      return replayActionItemId;
    }
    const { parentActionItem, parentDecision } =
      await resolveParentActionItemForCreation(ctx, {
        authorization,
        expectedParentRevision: args.expectedParentRevision,
        parentActionItemId: args.parentActionItemId,
        postId: post._id,
      });
    const title = requiredActionItemTitle(args.title);
    const submittedDescriptionTiptapJson =
      args.descriptionTiptapJson ??
      JSON.stringify({ content: [], type: "doc" });
    validateTiptapJson(submittedDescriptionTiptapJson);
    const readerIds = await resolveCurrentCollaborationPostReaderIds(
      ctx,
      authorization,
      post
    );
    const coordinationReaderIds =
      post.systemPostKind === "draw"
        ? await resolveCurrentDrawCoordinationReaderIds(
            ctx,
            authorization,
            post
          )
        : readerIds;
    const references = await resolveCanonicalBuildCollaborationReferences(ctx, {
      authorization,
      readerIds: coordinationReaderIds,
      references: args.references ?? [],
    });
    const description = canonicalizeTiptapReferences(
      submittedDescriptionTiptapJson,
      references,
      { allowEmpty: true }
    );
    const workKind = resolveNewActionItemWorkKind(
      args.workKind,
      references,
      args.dueAt
    );
    const { assignee, assignmentState, requiresAcceptance, upwardAssignment } =
      await resolveNewActionItemAssignment(ctx, authorization, post._id, {
        assigneeWorkosUserId: args.assigneeWorkosUserId,
        requiresAcceptance:
          (args.requiresAcceptance ?? false) || workKind !== "ordinary",
      });
    const now = Date.now();
    const { actionItemId } = await persistCanonicalBuildActionItem(ctx, {
      actionItem: {
        assigneeWorkosUserId: assignee,
        assignedByWorkosUserId: assignee
          ? authorization.viewer.subject
          : undefined,
        assignmentRequestedAt:
          assignmentState === "requested" ? now : undefined,
        assignmentState,
        descriptionPlainText:
          description.plainText || args.descriptionPlainText?.trim() || "",
        descriptionTiptapJson: description.tiptapJson,
        dueAt: args.dueAt,
        parentActionItemId: parentActionItem?._id,
        priority: args.priority ?? "none",
        references,
        requiresAcceptance,
        title,
        workKind,
      },
      authorization,
      event: {
        exercisedAuthority: "reader",
        warnings: upwardAssignment ? ["assignment_requested"] : undefined,
      },
      now,
      postId: post._id,
    });
    await Promise.all([
      persistBuildActionItemLabels(ctx, {
        actionItemId,
        authorization,
        labels: args.labels ?? [],
        now,
      }),
      persistBuildActionItemAttachments(ctx, {
        actionItemId,
        assetIds: args.attachmentAssetIds ?? [],
        authorization,
        now,
        post,
      }),
      persistBuildActionItemActivity(ctx, {
        actionItemId,
        authorization,
        now,
        postId: post._id,
        references,
      }),
      emitCreatedActionItemAssignmentNotification(ctx, {
        actionItemId,
        assignee,
        assignmentState,
        authorization,
        now,
        postId: post._id,
        readerIds: coordinationReaderIds,
        title,
      }),
      ctx.db.insert("auditEvents", {
        actorRoles: authorization.roles,
        actorWorkosUserId: authorization.viewer.subject,
        brokerageId: authorization.brokerage._id,
        command: "createBuildActionItem",
        createdAt: now,
        entityId: actionItemId,
        entityType: "buildActionItem",
        eventType: "build.collaboration.action_item.created",
        newState: JSON.stringify({
          actionItemId,
          parentActionItemId: parentActionItem?._id,
          postId: post._id,
          revision: 1,
        }),
        organizationId: authorization.organizationId,
        warnings: upwardAssignment ? ["assignment_requested"] : [],
      }),
      ctx.db.insert("eventOutbox", {
        brokerageId: authorization.brokerage._id,
        createdAt: now,
        eventType: "build.collaboration.action_item.created",
        organizationId: authorization.organizationId,
        payloadPreview: JSON.stringify({
          actionItemId,
          buildId: authorization.build._id,
          postId: post._id,
        }),
        relatedEntityId: actionItemId,
        relatedEntityType: "buildActionItem",
        status: "pending",
      }),
    ]);
    if (parentActionItem && parentDecision) {
      await recordChildActionItemMutation(ctx, {
        authorization,
        decision: parentDecision,
        eventType: "child_action_item_created",
        item: parentActionItem,
        newState: JSON.stringify({
          childActionItemId: actionItemId,
          title,
        }),
        now,
      });
    }
    if (requestId) {
      await ctx.db.insert("buildActionItemCreationRequests", {
        actionItemId,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        createdAt: now,
        creatorWorkosUserId: authorization.viewer.subject,
        organizationId: authorization.organizationId,
        postId: post._id,
        requestId,
      });
    }
    await ctx.db.patch(post._id, {
      lastMeaningfulActivityAt: now,
      latestActivityActorWorkosUserId: authorization.viewer.subject,
      openActionItemCount: post.openActionItemCount + 1,
      updatedAt: now,
    });
    await queueBuildCollaborationSearchOwnerRebuild(ctx, {
      authorization,
      owner: { id: actionItemId, kind: "actionItem" },
      postId: post._id,
    });
    return actionItemId;
  })
  .public();

async function emitCreatedActionItemAssignmentNotification(
  ctx: MutationCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    assignee?: string;
    assignmentState: "assigned" | "requested" | "unassigned";
    authorization: ActiveBuildAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    readerIds: string[];
    title: string;
  }
) {
  if (!input.assignee) {
    return null;
  }
  const kind =
    input.assignmentState === "requested" ? "assignment_request" : "assignment";
  const recipientRole = input.authorization.participants.find(
    (participant) => participant.workosUserId === input.assignee
  )?.role;
  return await emitCanonicalBuildCollaborationNotification(ctx, {
    actionItemId: input.actionItemId,
    actionLabel: "Open Action Item",
    authorization: input.authorization,
    body: input.title,
    dedupeKey: `build-action-item:${input.actionItemId}:created:${kind}:${input.assignee}`,
    entityId: input.actionItemId,
    entityType: "buildActionItem",
    href: buildCollaborationDeepLink({
      buildId: input.authorization.build._id,
      focus: `actionItem:${input.actionItemId}`,
      recipientRole,
    }),
    kind,
    now: input.now,
    postId: input.postId,
    readerIds: input.readerIds,
    recipientWorkosUserId: input.assignee,
    title:
      kind === "assignment_request"
        ? "Action Item assignment requested"
        : "Action Item assigned",
  });
}

export const listBuildActionItems = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    postId: v.optional(v.id("buildCollaborationPosts")),
  })
  .returns(v.array(buildActionItemListRowValidator))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const postId = args.postId;
    const items = postId
      ? await actionItemsLinkedToPost(ctx, postId)
      : await ctx.db
          .query("buildActionItems")
          .withIndex("by_buildId_and_status_and_updatedAt", (query) =>
            query.eq("buildId", authorization.build._id)
          )
          .take(MAX_ACTION_ITEMS_PER_BUILD);
    return await projectBuildActionItemList(ctx, authorization, items);
  })
  .public();

export async function projectBuildActionItemList(
  ctx: QueryCtx,
  authorization: ActionItemAuthorization,
  items: Doc<"buildActionItems">[]
) {
  const readable = await filterReadableBuildActionItems(
    ctx,
    authorization,
    items
  );
  const postAccess = new Map<string, boolean>();
  for (const item of readable) {
    postAccess.set(item.originatingPostId, true);
  }
  const [activeRelations, suspendedRelations] = await Promise.all([
    ctx.db
      .query("buildActionItemRelations")
      .withIndex("by_buildId_and_status", (query) =>
        query.eq("buildId", authorization.build._id).eq("status", "active")
      )
      .take(MAX_ACTION_ITEMS_PER_BUILD + 1),
    ctx.db
      .query("buildActionItemRelations")
      .withIndex("by_buildId_and_status", (query) =>
        query.eq("buildId", authorization.build._id).eq("status", "suspended")
      )
      .take(MAX_ACTION_ITEMS_PER_BUILD + 1),
  ]);
  if (
    activeRelations.length + suspendedRelations.length >
    MAX_ACTION_ITEMS_PER_BUILD
  ) {
    throw new Error("Build Action Item relationships exceed the safe limit.");
  }
  const scopedRelations = [...activeRelations, ...suspendedRelations].filter(
    (relation): relation is VisibleActionItemRelation =>
      relation.status !== "superseded" &&
      relation.organizationId === authorization.organizationId &&
      relation.brokerageId === authorization.brokerage._id
  );
  const readableIds = new Set(readable.map((item) => item._id));
  const targetIds = [
    ...new Set(scopedRelations.map((relation) => relation.targetActionItemId)),
  ].filter((targetId) => !readableIds.has(targetId));
  const targetItems = await Promise.all(
    targetIds.map((targetId) => ctx.db.get(targetId))
  );
  for (const target of targetItems) {
    if (
      target &&
      (await canReadActionItemProjection(
        ctx,
        authorization,
        target,
        postAccess
      ))
    ) {
      readableIds.add(target._id);
    }
  }
  const relationsBySource = new Map<
    Id<"buildActionItems">,
    VisibleActionItemRelation[]
  >();
  for (const relation of scopedRelations) {
    if (!readableIds.has(relation.targetActionItemId)) {
      continue;
    }
    const rows = relationsBySource.get(relation.sourceActionItemId) ?? [];
    rows.push(relation);
    relationsBySource.set(relation.sourceActionItemId, rows);
  }
  const canonicalMilestoneIds = [
    ...new Set(
      readable
        .map((item) => item.canonicalBuildMilestoneId)
        .filter(
          (milestoneId): milestoneId is Id<"buildMilestones"> =>
            milestoneId !== undefined
        )
    ),
  ];
  const [buildMilestones, submilestonesByMilestoneRows] = await Promise.all([
    ctx.db
      .query("buildMilestones")
      .withIndex("by_build", (query) =>
        query.eq("buildId", authorization.build._id)
      )
      .take(500),
    Promise.all(
      canonicalMilestoneIds.map(
        async (milestoneId) =>
          [
            milestoneId,
            await ctx.db
              .query("buildSubmilestones")
              .withIndex("by_milestone", (query) =>
                query.eq("buildMilestoneId", milestoneId)
              )
              .take(500),
          ] as const
      )
    ),
  ]);
  const planningCache: MilestoneActionItemPlanningCache = {
    milestonesByBuild: new Map([
      [String(authorization.build._id), buildMilestones],
    ]),
    submilestonesByMilestone: new Map(
      submilestonesByMilestoneRows.map(([milestoneId, submilestones]) => [
        String(milestoneId),
        submilestones,
      ])
    ),
  };
  const asOf = Date.now();
  return await Promise.all(
    readable.map(async (item) => {
      const [checklist, systemPresentation] = await Promise.all([
        ctx.db
          .query("buildActionItemChecklistItems")
          .withIndex("by_actionItemId_and_order", (query) =>
            query.eq("actionItemId", item._id)
          )
          .take(MAX_CHECKLIST_ITEMS),
        deriveMilestoneSystemActionItemPresentation(ctx, {
          actionItem: item,
          asOf,
          build: authorization.build,
          planningCache,
          viewer: {
            role: authorization.effectiveRole.role,
            roles: authorization.roles,
            workosUserId: authorization.viewer.subject,
          },
        }),
      ]);
      return {
        checklist: checklist.filter(
          (row) =>
            row.buildId === authorization.build._id &&
            row.organizationId === authorization.organizationId &&
            row.brokerageId === authorization.brokerage._id
        ),
        item: { ...item, systemPresentation },
        relations: relationsBySource.get(item._id) ?? [],
      };
    })
  );
}

export async function filterReadableBuildActionItems(
  ctx: QueryCtx,
  authorization: ActionItemAuthorization,
  items: Doc<"buildActionItems">[]
) {
  const readable: Doc<"buildActionItems">[] = [];
  const postAccess = new Map<string, boolean>();
  for (const item of items) {
    if (
      item.systemMode === "generated_milestone_submilestone" &&
      item.canonicalPlanningState === "superseded"
    ) {
      continue;
    }
    if (
      await canReadActionItemProjection(ctx, authorization, item, postAccess)
    ) {
      readable.push(item);
    }
  }
  return readable;
}

async function canReadActionItemProjection(
  ctx: QueryCtx,
  authorization: ActionItemAuthorization,
  item: Doc<"buildActionItems">,
  postAccess: Map<string, boolean>
) {
  if (
    item.buildId !== authorization.build._id ||
    item.organizationId !== authorization.organizationId ||
    item.brokerageId !== authorization.brokerage._id
  ) {
    return false;
  }
  const cached = postAccess.get(item.originatingPostId);
  if (cached !== undefined) {
    return (
      cached &&
      (await canReadMilestoneSystemActionItem(ctx, {
        actionItem: item,
        buildId: authorization.build._id,
        role: authorization.effectiveRole.role,
        workosUserId: authorization.viewer.subject,
      }))
    );
  }
  const post = await ctx.db.get(item.originatingPostId);
  const canRead = Boolean(
    post &&
      post.buildId === authorization.build._id &&
      post.organizationId === authorization.organizationId &&
      post.brokerageId === authorization.brokerage._id &&
      (await canReadCollaborationPost(ctx, authorization, post))
  );
  const canReadCoordination =
    canRead &&
    post !== null &&
    (post.systemPostKind !== "draw" ||
      (await canReadDrawCoordination(ctx, { authorization, post })));
  postAccess.set(item.originatingPostId, canReadCoordination);
  if (!canReadCoordination) {
    return false;
  }
  return canReadMilestoneSystemActionItem(ctx, {
    actionItem: item,
    buildId: authorization.build._id,
    role: authorization.effectiveRole.role,
    workosUserId: authorization.viewer.subject,
  });
}

export const updateBuildActionItem = authenticatedMutation
  .input({
    actionItemId: v.id("buildActionItems"),
    buildId: v.id("activeBuilds"),
    descriptionPlainText: v.optional(v.string()),
    descriptionTiptapJson: v.optional(v.string()),
    dueAt: v.optional(v.union(v.number(), v.null())),
    expectedRevision: v.optional(v.number()),
    labels: v.optional(v.array(v.string())),
    organizationId: v.string(),
    priority: v.optional(buildActionItemPriorityValidator),
    references: v.optional(v.array(referenceInputValidator)),
    reason: v.optional(v.string()),
    requiresAcceptance: v.optional(v.boolean()),
    title: v.optional(v.string()),
  })
  .returns(v.id("buildActionItems"))
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Task-definition updates intentionally keep authority, concurrency, taxonomy, references, and audit persistence in one transaction.
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
    assertCanonicalMilestoneActionItemMutable(item);
    assertCompletionAcceptanceChange(
      authorization,
      item,
      args.requiresAcceptance
    );
    if ((item.workKind ?? "ordinary") !== "ordinary" && args.dueAt === null) {
      throw new Error("Governed Action Items require a due date.");
    }
    const decisions: BuildActionItemAuthorizationDecision[] = [];
    if (
      args.title !== undefined ||
      args.descriptionPlainText !== undefined ||
      args.descriptionTiptapJson !== undefined ||
      args.references !== undefined ||
      args.labels !== undefined ||
      args.priority !== undefined ||
      args.dueAt !== undefined ||
      args.requiresAcceptance !== undefined
    ) {
      decisions.push(
        assertActionItemOperation(authorization, item, "edit_fields")
      );
    }
    if (decisions.length === 0) {
      throw new Error("No Action Item changes were submitted.");
    }
    const editDecision = decisions[0];
    if (editDecision?.authority === "coordinator" && !args.reason?.trim()) {
      throw new Error(
        "Manager task-definition overrides require an override reason."
      );
    }
    const staleHigherAuthorityOverride = await permitsStaleDescriptionOverride(
      ctx,
      {
        authorization,
        currentRevision: item.currentRevision,
        expectedRevision: args.expectedRevision,
        hasDescriptionChange:
          args.descriptionPlainText !== undefined ||
          args.descriptionTiptapJson !== undefined ||
          args.references !== undefined,
        item,
      }
    );
    const now = Date.now();
    const patch: Partial<Doc<"buildActionItems">> = {
      currentRevision: item.currentRevision + 1,
      updatedAt: now,
    };
    let canonicalDescriptionReferences:
      | CanonicalBuildCollaborationReference[]
      | undefined;
    let descriptionPost: Doc<"buildCollaborationPosts"> | undefined;
    let descriptionReaderIds: string[] | undefined;
    if (args.references !== undefined) {
      descriptionPost = (await ctx.db.get(item.originatingPostId)) ?? undefined;
      if (!descriptionPost) {
        throw new Error("Action Item parent post is unavailable.");
      }
      const postReaderIds = await resolveCurrentCollaborationPostReaderIds(
        ctx,
        authorization,
        descriptionPost
      );
      descriptionReaderIds =
        descriptionPost.systemPostKind === "draw"
          ? await resolveCurrentDrawCoordinationReaderIds(
              ctx,
              authorization,
              descriptionPost
            )
          : postReaderIds;
      canonicalDescriptionReferences =
        await resolveCanonicalBuildCollaborationReferences(ctx, {
          authorization,
          readerIds: descriptionReaderIds,
          references: args.references,
        });
      const canonicalContent = canonicalizeTiptapReferences(
        args.descriptionTiptapJson ?? item.descriptionTiptapJson,
        canonicalDescriptionReferences
      );
      patch.descriptionPlainText = canonicalContent.plainText;
      patch.descriptionTiptapJson = canonicalContent.tiptapJson;
    }
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) {
        throw new Error("Action Item title is required.");
      }
      patch.title = title;
    }
    if (args.descriptionPlainText !== undefined) {
      patch.descriptionPlainText = args.descriptionPlainText.trim();
    }
    if (
      args.descriptionTiptapJson !== undefined &&
      canonicalDescriptionReferences === undefined
    ) {
      validateTiptapJson(args.descriptionTiptapJson);
      patch.descriptionTiptapJson = args.descriptionTiptapJson;
    }
    if (args.priority !== undefined) {
      patch.priority = args.priority;
    }
    applyManualDueDatePatch(item, args.dueAt, patch);
    if (args.requiresAcceptance !== undefined) {
      patch.requiresAcceptance = args.requiresAcceptance;
    }
    if (args.labels !== undefined) {
      await replaceBuildActionItemLabels(ctx, {
        actionItemId: item._id,
        authorization,
        labels: args.labels,
        now,
      });
    }
    if (canonicalDescriptionReferences !== undefined && descriptionPost) {
      const existingReferences = await ctx.db
        .query("buildCollaborationReferences")
        .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
          query.eq("ownerKind", "actionItem").eq("ownerRecordId", item._id)
        )
        .take(100);
      for (const reference of existingReferences) {
        await ctx.db.delete(reference._id);
      }
      await persistBuildActionItemReferences(ctx, {
        actionItemId: item._id,
        authorization,
        now,
        postId: descriptionPost._id,
        queueSortAt:
          patch.queueSortAt ??
          item.queueSortAt ??
          buildActionItemQueueSortAt(item.dueAt, item.status),
        references: canonicalDescriptionReferences,
      });
    }
    const updatedItem = await persistCanonicalBuildActionItemPatch(ctx, {
      item,
      patch,
    });
    await ctx.db.insert("buildActionItemEvents", {
      actionItemId: item._id,
      actorRole: authorization.effectiveRole.role,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      eventType: "updated",
      exercisedAuthority: decisions[0]?.authority,
      newState: JSON.stringify(actionItemAuditState(updatedItem)),
      organizationId: authorization.organizationId,
      reason: args.reason?.trim(),
      revision: item.currentRevision + 1,
      warnings: [
        ...new Set(
          [
            ...decisions.map((decision) => decision.warning),
            staleHigherAuthorityOverride
              ? "higher_authority_concurrent_override"
              : undefined,
          ].filter((warning): warning is string => Boolean(warning))
        ),
      ],
      priorState: JSON.stringify(actionItemAuditState(item)),
    });
    await recordBuildActionItemRevision(ctx, {
      authorization,
      item: updatedItem,
      now,
      reason: args.reason?.trim(),
    });
    await queueBuildCollaborationSearchOwnerRebuild(ctx, {
      authorization,
      owner: { id: item._id, kind: "actionItem" },
      postId: item.originatingPostId,
    });
    if (
      canonicalDescriptionReferences !== undefined &&
      descriptionPost &&
      descriptionReaderIds
    ) {
      for (const mentionedWorkosUserId of new Set(
        canonicalDescriptionReferences
          .filter((reference) => reference.entityKind === "participant")
          .map((reference) => reference.entityId)
      )) {
        await emitCanonicalBuildCollaborationNotification(ctx, {
          actionItemId: item._id,
          actionLabel: "Open Action Item",
          authorization,
          body: patch.descriptionPlainText ?? updatedItem.descriptionPlainText,
          dedupeKey: `build-action-item:${item._id}:revision:${updatedItem.currentRevision}:mention:${mentionedWorkosUserId}`,
          entityId: item._id,
          entityLabel: updatedItem.title,
          entityType: "buildActionItem",
          href: buildCollaborationDeepLink({
            buildId: authorization.build._id,
            focus: `actionItem:${item._id}`,
            recipientRole: authorization.participants.find(
              (participant) =>
                participant.workosUserId === mentionedWorkosUserId
            )?.role,
          }),
          kind: "direct_mention",
          now,
          postId: descriptionPost._id,
          readerIds: descriptionReaderIds,
          recipientWorkosUserId: mentionedWorkosUserId,
          title: "Mentioned in an Action Item",
        });
      }
    }
    return item._id;
  })
  .public();
