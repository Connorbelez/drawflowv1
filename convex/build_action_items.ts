import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  buildActionItemQueueSortAt,
  resetBuildActionItemDeadlineSchedule,
} from "./build_action_item_deadline_model";
import { actionItemRequiresAcceptance } from "./build_action_item_governance";
import { recordBuildActionItemRevision } from "./build_action_item_history";
import { actionItemsLinkedToPost } from "./build_action_item_post_links";
import { syncBuildActionItemReferenceQueueSortAt } from "./build_action_item_queue_projection";
import {
  authorizeBuildActionItemOperation,
  type BuildActionItemAuthorizationDecision,
  type BuildActionItemOperation,
} from "./build_action_item_rbac";
import { canonicalBuildActionItemTags } from "./build_action_item_tags";
import {
  canReadCollaborationPost,
  resolveCurrentCollaborationPostReaderIds,
} from "./build_collaboration_access";
import {
  canReadDrawCoordination,
  resolveCurrentDrawCoordinationReaderIds,
} from "./build_draw_coordination";
import { authorizeActiveBuildHumanCollaborationAccess } from "./build_collaboration_actor";
import { persistGovernedCollaborationAssetAttachments } from "./build_collaboration_asset_publication";
import { buildActionItemListRowValidator } from "./build_collaboration_contracts";
import { buildCollaborationDeepLink } from "./build_collaboration_links";
import { collaborationRoleTier } from "./build_collaboration_model";
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
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_ACTION_ITEMS_PER_BUILD = 2000;
const MAX_CHILD_ACTION_ITEMS = 250;
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
        ? await resolveCurrentDrawCoordinationReaderIds(ctx, authorization, post)
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
    const primaryReference =
      references.find((reference) => reference.primary) ?? references[0];
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
    const deadlineSchedule = resetBuildActionItemDeadlineSchedule(
      args.dueAt,
      "todo"
    );
    const actionItemId = await ctx.db.insert("buildActionItems", {
      assigneeWorkosUserId: assignee,
      assignedByWorkosUserId: assignee
        ? authorization.viewer.subject
        : undefined,
      assignmentRequestedAt: assignmentState === "requested" ? now : undefined,
      assignmentState,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      creatorRole: authorization.effectiveRole.role,
      creatorWorkosUserId: authorization.viewer.subject,
      currentRevision: 1,
      descriptionPlainText:
        description.plainText || args.descriptionPlainText?.trim() || "",
      descriptionTiptapJson: description.tiptapJson,
      dueAt: args.dueAt,
      dueDateSource: args.dueAt === undefined ? undefined : "manual",
      ...deadlineSchedule,
      originatingPostId: post._id,
      organizationId: authorization.organizationId,
      parentActionItemId: parentActionItem?._id,
      priority: args.priority ?? "none",
      primaryReferenceId: primaryReference?.entityId,
      primaryReferenceKind: primaryReference?.entityKind,
      queueSortAt: buildActionItemQueueSortAt(args.dueAt, "todo"),
      requiresAcceptance,
      status: "todo",
      title,
      updatedAt: now,
      workKind,
    });
    await ctx.db.insert("buildActionItemEvents", {
      actionItemId,
      actorRole: authorization.effectiveRole.role,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      eventType: "created",
      exercisedAuthority: "reader",
      newState: JSON.stringify({
        assigneeWorkosUserId: assignee,
        assignmentState,
        priority: args.priority ?? "none",
        parentActionItemId: parentActionItem?._id,
        requiresAcceptance,
        status: "todo",
        title,
        workKind,
      }),
      organizationId: authorization.organizationId,
      revision: 1,
      warnings: upwardAssignment ? ["assignment_requested"] : undefined,
    });
    const createdItem = await ctx.db.get(actionItemId);
    if (!createdItem) {
      throw new Error("Action Item became unavailable during creation.");
    }
    await Promise.all([
      recordBuildActionItemRevision(ctx, {
        authorization,
        item: createdItem,
        now,
      }),
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
      persistBuildActionItemReferences(ctx, {
        actionItemId,
        authorization,
        now,
        postId: post._id,
        queueSortAt: buildActionItemQueueSortAt(args.dueAt, "todo"),
        references,
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
      canonicalMilestoneIds.map(async (milestoneId) => [
        milestoneId,
        await ctx.db
          .query("buildSubmilestones")
          .withIndex("by_milestone", (query) =>
            query.eq("buildMilestoneId", milestoneId)
          )
          .take(500),
      ] as const)
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
      descriptionReaderIds = await resolveCurrentCollaborationPostReaderIds(
        ctx,
        authorization,
        descriptionPost
      );
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
    await ctx.db.patch(item._id, patch);
    if (patch.queueSortAt !== undefined) {
      await syncBuildActionItemReferenceQueueSortAt(
        ctx,
        item,
        patch.queueSortAt
      );
    }
    const updatedItem = await ctx.db.get(item._id);
    if (!updatedItem) {
      throw new Error("Action Item became unavailable during update.");
    }
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

async function permitsStaleDescriptionOverride(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    currentRevision: number;
    expectedRevision?: number;
    hasDescriptionChange: boolean;
    item: Doc<"buildActionItems">;
  }
) {
  if (
    input.expectedRevision === undefined ||
    input.expectedRevision === input.currentRevision
  ) {
    return false;
  }
  if (!input.hasDescriptionChange) {
    throw new Error(
      "This Action Item changed since you opened it. Refresh and try again."
    );
  }
  const latestRevision = await ctx.db
    .query("buildActionItemRevisions")
    .withIndex("by_actionItemId_and_revision", (query) =>
      query
        .eq("actionItemId", input.item._id)
        .eq("revision", input.currentRevision)
    )
    .unique();
  const currentTier = input.authorization.effectiveRole.tier;
  const latestTier = latestRevision
    ? collaborationRoleTier(latestRevision.actorRole)
    : collaborationRoleTier(input.item.creatorRole ?? "contractor");
  if (currentTier > latestTier) {
    return true;
  }
  throw new Error(
    "Description conflict: another editor saved first. Your text was not overwritten; refresh before retrying."
  );
}

function applyManualDueDatePatch(
  item: Doc<"buildActionItems">,
  dueAt: number | null | undefined,
  patch: Partial<Doc<"buildActionItems">>
) {
  if (dueAt === undefined) {
    return;
  }
  const normalizedDueAt = dueAt ?? undefined;
  if (normalizedDueAt === item.dueAt) {
    return;
  }
  if (item.dueDateSource === "policy") {
    throw new Error(
      "Policy due dates require a reasoned override through the policy deadline workflow."
    );
  }
  patch.dueAt = normalizedDueAt;
  patch.dueDateSource = dueAt === null ? undefined : "manual";
  Object.assign(
    patch,
    { queueSortAt: buildActionItemQueueSortAt(normalizedDueAt, item.status) },
    resetBuildActionItemDeadlineSchedule(
      normalizedDueAt,
      item.status,
      item.deadlineScheduleGeneration
    )
  );
}

export async function requireReadableActionItem(
  ctx: QueryCtx,
  authorization: Awaited<
    ReturnType<typeof authorizeActiveBuildCollaborationAccess>
  >,
  actionItemId: Id<"buildActionItems">
) {
  const item = await ctx.db.get(actionItemId);
  if (
    !item ||
    item.buildId !== authorization.build._id ||
    item.organizationId !== authorization.organizationId ||
    item.brokerageId !== authorization.brokerage._id
  ) {
    throw new Error("Action Item is unavailable.");
  }
  const post = await ctx.db.get(item.originatingPostId);
  if (
    !post ||
    post.buildId !== authorization.build._id ||
    post.organizationId !== authorization.organizationId ||
    post.brokerageId !== authorization.brokerage._id ||
    !(await canReadCollaborationPost(ctx, authorization, post))
  ) {
    throw new Error("Action Item is unavailable.");
  }
  if (
    post.systemPostKind === "draw" &&
    !(await canReadDrawCoordination(ctx, { authorization, post }))
  ) {
    throw new Error("Action Item is unavailable.");
  }
  if (
    !(await canReadMilestoneSystemActionItem(ctx, {
      actionItem: item,
      buildId: authorization.build._id,
      role: authorization.effectiveRole.role,
      workosUserId: authorization.viewer.subject,
    }))
  ) {
    throw new Error("Action Item is unavailable.");
  }
  return item;
}

export function assertCanonicalMilestoneActionItemMutable(
  item: Doc<"buildActionItems">
) {
  if (item.systemMode === "generated_milestone_submilestone") {
    throw new Error(
      item.canonicalPlanningState === "superseded"
        ? "Superseded System Action Items cannot execute commands. Update the canonical approved plan instead."
        : "System Action Items mirror canonical Sub-milestones and cannot be edited or transitioned directly."
    );
  }
}

function assertActionItemOperation(
  authorization: Awaited<
    ReturnType<typeof authorizeActiveBuildCollaborationAccess>
  >,
  item: Doc<"buildActionItems">,
  operation: BuildActionItemOperation,
  options?: {
    nextStatus?: Doc<"buildActionItems">["status"];
    targetAssignee?: {
      role: (typeof authorization.participants)[number]["role"];
      workosUserId: string;
    } | null;
  }
) {
  const creatorRole =
    item.creatorRole ??
    authorization.participants.find(
      (participant) => participant.workosUserId === item.creatorWorkosUserId
    )?.role;
  const decision = authorizeBuildActionItemOperation({
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
      requiresAcceptance: item.requiresAcceptance,
      status: item.status,
    },
    nextStatus: options?.nextStatus,
    operation,
    targetAssignee: options?.targetAssignee,
  });
  if (!decision.allowed) {
    throw new Error(
      `Forbidden: Action Item ${operation.replaceAll("_", " ")} authority`
    );
  }
  return decision;
}

function assertExpectedRevision(
  item: Doc<"buildActionItems">,
  expectedRevision: number | undefined
) {
  if (
    expectedRevision !== undefined &&
    expectedRevision !== item.currentRevision
  ) {
    throw new Error(
      "This Action Item changed since you opened it. Refresh and try again."
    );
  }
}

function mandatoryCompletionAcceptanceApplies(
  authorization: Awaited<
    ReturnType<typeof authorizeActiveBuildCollaborationAccess>
  >,
  item: Doc<"buildActionItems">
) {
  if (
    !(
      item.requiresAcceptance &&
      item.assigneeWorkosUserId &&
      item.assignedByWorkosUserId
    )
  ) {
    return false;
  }
  const assignee = authorization.participants.find(
    (participant) => participant.workosUserId === item.assigneeWorkosUserId
  );
  const assigner = authorization.participants.find(
    (participant) => participant.workosUserId === item.assignedByWorkosUserId
  );
  if (!(assignee && assigner)) {
    return true;
  }
  return (
    collaborationRoleTier(assignee.role) > collaborationRoleTier(assigner.role)
  );
}

function assertCompletionAcceptanceChange(
  authorization: Awaited<
    ReturnType<typeof authorizeActiveBuildCollaborationAccess>
  >,
  item: Doc<"buildActionItems">,
  submittedRequiresAcceptance: boolean | undefined
) {
  if (
    submittedRequiresAcceptance === false &&
    (actionItemRequiresAcceptance(item) ||
      mandatoryCompletionAcceptanceApplies(authorization, item))
  ) {
    throw new Error("Completion acceptance is mandatory for this Action Item.");
  }
}

async function requirePostReader(
  ctx: MutationCtx,
  authorization: Awaited<
    ReturnType<typeof authorizeActiveBuildCollaborationAccess>
  >,
  postId: Id<"buildCollaborationPosts">,
  workosUserId: string
) {
  const post = await ctx.db.get(postId);
  if (!post) {
    throw new Error("Action Item parent post is unavailable.");
  }
  const readerIds = await resolveCurrentCollaborationPostReaderIds(
    ctx,
    authorization,
    post
  );
  const scopedReaderIds =
    post.systemPostKind === "draw"
      ? await resolveCurrentDrawCoordinationReaderIds(ctx, authorization, post)
      : readerIds;
  if (!scopedReaderIds.includes(workosUserId)) {
    throw new Error(
      "The assignee cannot read the originating post and cannot receive this Action Item."
    );
  }
}

async function requireActionItemCreationPost(
  ctx: MutationCtx,
  authorization: ActionItemAuthorization,
  postId: Id<"buildCollaborationPosts">
) {
  const post = await ctx.db.get(postId);
  if (
    !post ||
    post.buildId !== authorization.build._id ||
    post.organizationId !== authorization.organizationId ||
    !(await canReadCollaborationPost(ctx, authorization, post))
  ) {
    throw new Error("Action Item parent post is unavailable.");
  }
  if (
    post.systemPostKind === "draw" &&
    !(await canReadDrawCoordination(ctx, { authorization, post }))
  ) {
    throw new Error("Action Item parent post is unavailable.");
  }
  return post;
}

async function resolveParentActionItemForCreation(
  ctx: MutationCtx,
  input: {
    authorization: ActionItemAuthorization;
    expectedParentRevision?: number;
    parentActionItemId?: Id<"buildActionItems">;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  if (!input.parentActionItemId) {
    if (input.expectedParentRevision !== undefined) {
      throw new Error(
        "A parent Action Item is required with an expected parent revision."
      );
    }
    return {
      parentActionItem: undefined,
      parentDecision: undefined,
    };
  }
  const parentActionItem = await requireReadableActionItem(
    ctx,
    input.authorization,
    input.parentActionItemId
  );
  if (parentActionItem.originatingPostId !== input.postId) {
    throw new Error(
      "A child Action Item must inherit its parent’s originating post."
    );
  }
  if (parentActionItem.parentActionItemId) {
    throw new Error(
      "Action Items support only one level of child Action Items."
    );
  }
  assertCanonicalMilestoneActionItemMutable(parentActionItem);
  const existingChildren = await ctx.db
    .query("buildActionItems")
    .withIndex("by_parentActionItemId_and_status", (query) =>
      query.eq("parentActionItemId", parentActionItem._id)
    )
    .take(MAX_CHILD_ACTION_ITEMS + 1);
  if (existingChildren.length >= MAX_CHILD_ACTION_ITEMS) {
    throw new Error(
      "This Action Item has reached the supported child Action Item limit."
    );
  }
  assertExpectedRevision(parentActionItem, input.expectedParentRevision);
  return {
    parentActionItem,
    parentDecision: assertActionItemOperation(
      input.authorization,
      parentActionItem,
      "create_child"
    ),
  };
}

function requiredActionItemTitle(submittedTitle: string) {
  const title = submittedTitle.trim();
  if (!title) {
    throw new Error("Action Item title is required.");
  }
  return title;
}

function resolveNewActionItemWorkKind(
  submittedWorkKind: Doc<"buildActionItems">["workKind"] | undefined,
  references: CanonicalBuildCollaborationReference[],
  dueAt: number | undefined
) {
  const inferredWorkKind = inferredActionItemWorkKind(references);
  const workKind =
    submittedWorkKind && submittedWorkKind !== "ordinary"
      ? submittedWorkKind
      : inferredWorkKind;
  if (workKind !== "ordinary" && dueAt === undefined) {
    throw new Error("Governed Action Items require a due date.");
  }
  return workKind;
}

async function resolveNewActionItemAssignment(
  ctx: MutationCtx,
  authorization: Awaited<
    ReturnType<typeof authorizeActiveBuildCollaborationAccess>
  >,
  postId: Id<"buildCollaborationPosts">,
  input: {
    assigneeWorkosUserId?: string;
    requiresAcceptance?: boolean;
  }
) {
  const assignee = input.assigneeWorkosUserId?.trim() || undefined;
  const assigneeParticipant = assignee
    ? authorization.participants.find(
        (participant) => participant.workosUserId === assignee
      )
    : undefined;
  if (assignee && !assigneeParticipant) {
    throw new Error("Assignee must actively participate in this Build.");
  }
  if (assignee) {
    await requirePostReader(ctx, authorization, postId, assignee);
  }
  const upwardAssignment =
    assigneeParticipant !== undefined &&
    collaborationRoleTier(assigneeParticipant.role) >
      authorization.effectiveRole.tier;
  const requiresAcceptance =
    (input.requiresAcceptance ?? false) || upwardAssignment;
  return {
    assignee,
    assignmentState: assignee
      ? upwardAssignment
        ? ("requested" as const)
        : ("assigned" as const)
      : ("unassigned" as const),
    requiresAcceptance,
    upwardAssignment,
  };
}

type ActionItemAuthorization = Awaited<
  ReturnType<typeof authorizeActiveBuildCollaborationAccess>
>;
type VisibleActionItemRelation = Doc<"buildActionItemRelations"> & {
  status: "active" | "suspended";
};

async function resolveActionItemCreationReplay(
  ctx: MutationCtx,
  input: {
    authorization: ActionItemAuthorization;
    postId: Id<"buildCollaborationPosts">;
    requestId?: string;
  }
) {
  const requestId = input.requestId?.trim();
  if (!requestId) {
    return { replayActionItemId: undefined, requestId: undefined };
  }
  if (requestId.length > 200) {
    throw new Error("Action Item request IDs may not exceed 200 characters.");
  }
  const replay = await ctx.db
    .query("buildActionItemCreationRequests")
    .withIndex("by_postId_and_creatorWorkosUserId_and_requestId", (query) =>
      query
        .eq("postId", input.postId)
        .eq("creatorWorkosUserId", input.authorization.viewer.subject)
        .eq("requestId", requestId)
    )
    .unique();
  return {
    replayActionItemId: replay?.actionItemId,
    requestId,
  };
}

async function persistBuildActionItemLabels(
  ctx: MutationCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    authorization: ActionItemAuthorization;
    labels: string[];
    now: number;
  }
) {
  const labels = canonicalBuildActionItemTags(input.labels);
  for (const label of labels) {
    const normalizedLabel = label.toLocaleLowerCase();
    await ctx.db.insert("buildActionItemLabels", {
      actionItemId: input.actionItemId,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      createdByWorkosUserId: input.authorization.viewer.subject,
      label,
      normalizedLabel,
      organizationId: input.authorization.organizationId,
    });
  }
}

async function replaceBuildActionItemLabels(
  ctx: MutationCtx,
  input: Parameters<typeof persistBuildActionItemLabels>[1]
) {
  const existing = await ctx.db
    .query("buildActionItemLabels")
    .withIndex("by_actionItemId_and_normalizedLabel", (query) =>
      query.eq("actionItemId", input.actionItemId)
    )
    .take(101);
  if (existing.length > 100) {
    throw new Error("Action Item tags exceed the supported limit.");
  }
  const canonical = canonicalBuildActionItemTags(input.labels);
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }
  await persistBuildActionItemLabels(ctx, { ...input, labels: canonical });
}

async function persistBuildActionItemAttachments(
  ctx: MutationCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    assetIds: Id<"buildCollaborationAssets">[];
    authorization: ActionItemAuthorization;
    now: number;
    post: Doc<"buildCollaborationPosts">;
  }
) {
  const readerWorkosUserIds = await resolveCurrentCollaborationPostReaderIds(
    ctx,
    input.authorization,
    input.post
  );
  const scopedReaderWorkosUserIds =
    input.post.systemPostKind === "draw"
      ? await resolveCurrentDrawCoordinationReaderIds(
          ctx,
          input.authorization,
          input.post,
        )
      : readerWorkosUserIds;
  await persistGovernedCollaborationAssetAttachments(ctx, {
    assetIds: input.assetIds,
    authorization: input.authorization,
    command: "persistBuildActionItemAttachment",
    maxAttachments: 20,
    now: input.now,
    ownerKind: "actionItem",
    ownerRecordId: input.actionItemId,
    post: input.post,
    readerWorkosUserIds: scopedReaderWorkosUserIds,
    unavailableMessage: "An Action Item attachment is unavailable.",
  });
}

async function persistBuildActionItemReferences(
  ctx: MutationCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    authorization: ActionItemAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    queueSortAt: number;
    references: CanonicalBuildCollaborationReference[];
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
      actionItemQueueSortAt: input.queueSortAt,
      summarySnapshot: reference.summary,
    });
  }
}

async function persistBuildActionItemActivity(
  ctx: MutationCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    authorization: ActionItemAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    references: CanonicalBuildCollaborationReference[];
  }
) {
  const targets: Array<{
    kind: "post" | CanonicalBuildCollaborationReference["entityKind"];
    targetId: string;
  }> = [
    { kind: "post", targetId: input.postId },
    ...input.references.map((reference) => ({
      kind: reference.entityKind,
      targetId: reference.entityId,
    })),
  ];
  for (const target of targets) {
    const projectionKey = [
      "action_item_created",
      input.actionItemId,
      target.kind,
      target.targetId,
    ].join(":");
    const existing = await ctx.db
      .query("buildCollaborationActivityProjections")
      .withIndex("by_buildId_and_projectionKey", (query) =>
        query
          .eq("buildId", input.authorization.build._id)
          .eq("projectionKey", projectionKey)
      )
      .unique();
    if (existing) {
      continue;
    }
    await ctx.db.insert("buildCollaborationActivityProjections", {
      actionItemId: input.actionItemId,
      actorWorkosUserId: input.authorization.viewer.subject,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      eventType: "action_item_created",
      organizationId: input.authorization.organizationId,
      postId: input.postId,
      projectionKey,
      targetId: target.targetId,
      targetKind: target.kind,
    });
  }
}

async function recordChildActionItemMutation(
  ctx: MutationCtx,
  input: {
    authorization: Awaited<
      ReturnType<typeof authorizeActiveBuildCollaborationAccess>
    >;
    decision: BuildActionItemAuthorizationDecision;
    eventType: string;
    item: Doc<"buildActionItems">;
    newState: string;
    now: number;
    priorState?: string;
    reason?: string;
    warnings?: string[];
  }
) {
  const revision = input.item.currentRevision + 1;
  await ctx.db.patch(input.item._id, {
    currentRevision: revision,
    updatedAt: input.now,
  });
  await ctx.db.insert("buildActionItemEvents", {
    actionItemId: input.item._id,
    actorRole: input.authorization.effectiveRole.role,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: input.now,
    eventType: input.eventType,
    exercisedAuthority: input.decision.authority,
    newState: input.newState,
    organizationId: input.authorization.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    revision,
    warnings: input.warnings,
  });
  const updatedItem = await ctx.db.get(input.item._id);
  if (!updatedItem) {
    throw new Error("Action Item became unavailable during update.");
  }
  await recordBuildActionItemRevision(ctx, {
    authorization: input.authorization,
    item: updatedItem,
    now: input.now,
    reason: input.reason ?? input.eventType,
  });
}

function actionItemAuditState(item: Doc<"buildActionItems">) {
  return {
    assigneeWorkosUserId: item.assigneeWorkosUserId ?? null,
    assignedByWorkosUserId: item.assignedByWorkosUserId ?? null,
    assignmentRequestedAt: item.assignmentRequestedAt ?? null,
    assignmentState: item.assignmentState,
    blockedReason: item.blockedReason ?? null,
    cancellationReason: item.cancellationReason ?? null,
    completedAt: item.completedAt ?? null,
    currentRevision: item.currentRevision,
    descriptionPlainText: item.descriptionPlainText,
    descriptionTiptapJson: item.descriptionTiptapJson,
    dueAt: item.dueAt ?? null,
    previousActiveStatus: item.previousActiveStatus ?? null,
    priority: item.priority,
    requiresAcceptance: item.requiresAcceptance,
    status: item.status,
    title: item.title,
  };
}

function inferredActionItemWorkKind(
  references: CanonicalBuildCollaborationReference[]
): Doc<"buildActionItems">["workKind"] {
  if (references.some((reference) => reference.entityKind === "draw")) {
    return "draw_blocker";
  }
  if (references.some((reference) => reference.entityKind === "siteVisit")) {
    return "site_visit_remediation";
  }
  if (
    references.some(
      (reference) =>
        reference.entityKind === "evidencePackage" ||
        reference.entityKind === "evidenceAsset"
    )
  ) {
    return "evidence";
  }
  return "ordinary";
}

export function validateTiptapJson(value: string) {
  try {
    const parsed = JSON.parse(value) as { type?: unknown };
    if (parsed.type !== "doc") {
      throw new Error("TipTap document root must have type doc.");
    }
  } catch {
    throw new Error("Action Item description must be valid TipTap JSON.");
  }
}
