import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  canReadCollaborationPost,
  canSeeCollaborationReceipt,
} from "./build_collaboration_access";
import {
  canCreateCustomCollaborationAudience,
  collaborationRoleTier,
  resolveCollaborationAudience,
} from "./build_collaboration_model";
import { fanOutBuildCollaborationPublication } from "./build_collaboration_notifications";
import {
  buildActionItemPriorityValidator,
  buildCollaborationAudienceModeValidator,
  buildCollaborationPostTypeValidator,
  buildCollaborationReferenceKindValidator,
} from "./build_collaboration_validators";
import type { Id, MutationCtx } from "./types";

const MAX_PLAIN_TEXT_LENGTH = 50_000;
const MAX_RICH_TEXT_LENGTH = 250_000;
const MAX_REFERENCES_PER_BUNDLE = 100;
const MAX_ACTION_ITEMS_PER_BUNDLE = 100;

export const referenceInputValidator = v.object({
  entityKind: buildCollaborationReferenceKindValidator,
  entityId: v.string(),
  label: v.string(),
  primary: v.optional(v.boolean()),
  summary: v.optional(v.string()),
});

export const actionItemInputValidator = v.object({
  assigneeWorkosUserId: v.optional(v.string()),
  descriptionPlainText: v.optional(v.string()),
  descriptionTiptapJson: v.optional(v.string()),
  dueAt: v.optional(v.number()),
  priority: v.optional(buildActionItemPriorityValidator),
  requiresAcceptance: v.optional(v.boolean()),
  title: v.string(),
});

const feedResultValidator = v.object({
  continueCursor: v.string(),
  isDone: v.boolean(),
  page: v.array(v.any()),
  pageStatus: v.optional(v.any()),
  splitCursor: v.optional(v.union(v.string(), v.null())),
});

interface ReferenceInput {
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
  label: string;
  primary?: boolean;
  summary?: string;
}

interface ActionItemInput {
  assigneeWorkosUserId?: string;
  descriptionPlainText?: string;
  descriptionTiptapJson?: string;
  dueAt?: number;
  priority?: "urgent" | "high" | "medium" | "low" | "none";
  requiresAcceptance?: boolean;
  title: string;
}

export interface BuildCollaborationPublicationBundle {
  acknowledgementRequired?: boolean;
  actionItems: ActionItemInput[];
  audienceMode: "build_wide" | "author_tier_and_higher" | "custom";
  plainText: string;
  postType: "update" | "question" | "issue" | "decision" | "announcement";
  references: ReferenceInput[];
  requestedReaderIds: string[];
  tiptapJson: string;
}

export const approveAndPublishBuildCollaborationBundle = authenticatedMutation
  .input({
    actionItems: v.array(actionItemInputValidator),
    acknowledgementRequired: v.optional(v.boolean()),
    audienceMode: buildCollaborationAudienceModeValidator,
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    plainText: v.string(),
    postType: buildCollaborationPostTypeValidator,
    references: v.array(referenceInputValidator),
    requestedReaderIds: v.array(v.string()),
    tiptapJson: v.string(),
  })
  .returns(v.id("buildCollaborationPosts"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    assertHumanPublisher(authorization);
    return await publishBuildCollaborationBundle(ctx, {
      agentDrafted: false,
      authorization,
      bundle: args,
    });
  })
  .public();

export async function publishBuildCollaborationBundle(
  ctx: MutationCtx,
  input: {
    agentDrafted: boolean;
    authorization: ActiveBuildAuthorization;
    bundle: BuildCollaborationPublicationBundle;
  }
) {
  const { authorization, bundle } = input;
  if (
    bundle.postType === "announcement" &&
    authorization.effectiveRole.tier < 3
  ) {
    throw new Error(
      "Announcements may only be published by the Builder or lender coordination team."
    );
  }
  const content = validateRichTextContent({
    plainText: bundle.plainText,
    tiptapJson: bundle.tiptapJson,
  });
  if (bundle.references.length > MAX_REFERENCES_PER_BUNDLE) {
    throw new Error(
      `A publication may contain at most ${MAX_REFERENCES_PER_BUNDLE} references.`
    );
  }
  if (bundle.actionItems.length > MAX_ACTION_ITEMS_PER_BUNDLE) {
    throw new Error(
      `A publication may contain at most ${MAX_ACTION_ITEMS_PER_BUNDLE} Action Items.`
    );
  }

  const audience = resolvePublicationAudience({
    authorization,
    audienceMode: bundle.audienceMode,
    requestedReaderIds: bundle.requestedReaderIds,
  });
  const now = Date.now();
  const primaryReference = bundle.references.find(
    (reference) => reference.primary
  );
  const authorDisplayName =
    authorization.participants.find(
      (participant) => participant.workosUserId === authorization.viewer.subject
    )?.displayName ??
    authorization.viewer.email ??
    authorization.viewer.subject;
  const postId = await ctx.db.insert("buildCollaborationPosts", {
    acknowledgementRequired: bundle.acknowledgementRequired ?? false,
    agentDrafted: input.agentDrafted,
    audienceFloorTier: authorization.effectiveRole.tier,
    audienceMode: bundle.audienceMode,
    authorDisplayNameSnapshot: authorDisplayName,
    authorRole: authorization.effectiveRole.role,
    authorRolesSnapshot: authorization.roles,
    authorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    commentCount: 0,
    contentState: "active",
    createdAt: now,
    lastMeaningfulActivityAt: now,
    latestActivityActorWorkosUserId: authorization.viewer.subject,
    openActionItemCount: bundle.actionItems.length,
    organizationId: authorization.organizationId,
    postType: bundle.postType,
    primaryReferenceId: primaryReference?.entityId,
    primaryReferenceKind: primaryReference?.entityKind,
    revision: 1,
    source: "human",
    threadState: "open",
    updatedAt: now,
  });
  const postRevisionId = await ctx.db.insert(
    "buildCollaborationPostRevisions",
    {
      authorRole: authorization.effectiveRole.role,
      authorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      contentHash: stableContentHash(content.tiptapJson),
      createdAt: now,
      organizationId: authorization.organizationId,
      plainText: content.plainText,
      postId,
      revision: 1,
      tiptapJson: content.tiptapJson,
    }
  );
  await ctx.db.patch(postId, { currentRevisionId: postRevisionId });

  await persistAudience(ctx, {
    authorization,
    audience,
    postId,
    postRevisionId,
    now,
  });
  await persistReferences(ctx, {
    authorization,
    now,
    ownerRecordId: postRevisionId,
    postId,
    references: bundle.references,
  });
  await createActionItems(ctx, {
    actionItems: bundle.actionItems,
    authorization,
    now,
    postId,
  });
  if (bundle.acknowledgementRequired) {
    const participantById = new Map(
      authorization.participants.map((participant) => [
        participant.workosUserId,
        participant,
      ])
    );
    for (const workosUserId of audience.readerIds) {
      const participant = participantById.get(workosUserId);
      if (
        workosUserId !== authorization.viewer.subject &&
        participant &&
        collaborationRoleTier(participant.role) <=
          authorization.effectiveRole.tier
      ) {
        await ctx.db.insert("buildCollaborationAcknowledgementTargets", {
          brokerageId: authorization.brokerage._id,
          buildId: authorization.build._id,
          createdAt: now,
          organizationId: authorization.organizationId,
          postId,
          workosUserId,
        });
      }
    }
  }
  await fanOutBuildCollaborationPublication(ctx, {
    actionAssigneeIds: bundle.actionItems.flatMap((item) =>
      item.assigneeWorkosUserId ? [item.assigneeWorkosUserId] : []
    ),
    authorization,
    now,
    plainText: content.plainText,
    postId,
    postType: bundle.postType,
    readerIds: audience.readerIds,
    referencedParticipantIds: bundle.references.flatMap((reference) =>
      reference.entityKind === "participant" ? [reference.entityId] : []
    ),
  });
  await ctx.db.insert("buildCollaborationFollows", {
    active: true,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    createdAt: now,
    organizationId: authorization.organizationId,
    postId,
    reason: "author",
    updatedAt: now,
    workosUserId: authorization.viewer.subject,
  });
  await recordPublicationAudit(ctx, {
    actionItemCount: bundle.actionItems.length,
    authorization,
    postId,
    referenceCount: bundle.references.length,
    now,
  });

  return postId;
}

export const listBuildCollaborationFeed = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  })
  .returns(feedResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const result = await ctx.db
      .query("buildCollaborationPosts")
      .withIndex("by_buildId_and_lastMeaningfulActivityAt", (query) =>
        query.eq("buildId", authorization.build._id)
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const page = await Promise.all(
      result.page.map(async (post, index) => {
        const canRead = await canReadCollaborationPost(
          ctx,
          authorization,
          post
        );
        if (!canRead) {
          return {
            kind: "restricted" as const,
            placeholderKey: `restricted-${index}`,
          };
        }
        const revision = post.currentRevisionId
          ? await ctx.db.get(post.currentRevisionId)
          : null;
        if (!revision || revision.postId !== post._id) {
          return {
            kind: "unavailable" as const,
            placeholderKey: `unavailable-${index}`,
          };
        }
        const [
          references,
          actionItems,
          reactions,
          pins,
          receipts,
          follows,
          acknowledgementTargets,
          acknowledgements,
        ] = await Promise.all([
          ctx.db
            .query("buildCollaborationReferences")
            .withIndex("by_postId", (query) => query.eq("postId", post._id))
            .take(MAX_REFERENCES_PER_BUNDLE),
          ctx.db
            .query("buildActionItems")
            .withIndex("by_originatingPostId_and_status", (query) =>
              query.eq("originatingPostId", post._id)
            )
            .take(MAX_ACTION_ITEMS_PER_BUNDLE),
          ctx.db
            .query("buildCollaborationReactions")
            .withIndex("by_postId_and_workosUserId", (query) =>
              query.eq("postId", post._id)
            )
            .take(500),
          ctx.db
            .query("buildCollaborationPins")
            .withIndex("by_postId_and_workosUserId_and_kind", (query) =>
              query
                .eq("postId", post._id)
                .eq("workosUserId", authorization.viewer.subject)
            )
            .take(20),
          ctx.db
            .query("buildCollaborationReceipts")
            .withIndex("by_postId_and_workosUserId", (query) =>
              query.eq("postId", post._id)
            )
            .take(500),
          ctx.db
            .query("buildCollaborationFollows")
            .withIndex("by_postId_and_workosUserId", (query) =>
              query
                .eq("postId", post._id)
                .eq("workosUserId", authorization.viewer.subject)
            )
            .take(20),
          ctx.db
            .query("buildCollaborationAcknowledgementTargets")
            .withIndex("by_postId_and_workosUserId", (query) =>
              query
                .eq("postId", post._id)
                .eq("workosUserId", authorization.viewer.subject)
            )
            .take(20),
          ctx.db
            .query("buildCollaborationAcknowledgements")
            .withIndex("by_postId_and_workosUserId", (query) =>
              query
                .eq("postId", post._id)
                .eq("workosUserId", authorization.viewer.subject)
            )
            .take(20),
        ]);
        const acknowledgementTarget = acknowledgementTargets.find(
          (target) => !target.waivedAt
        );
        return {
          acknowledgement: acknowledgementTarget
            ? {
                acknowledged: acknowledgements.some(
                  (acknowledgement) =>
                    acknowledgement.acknowledgedRevision >= post.revision
                ),
                dueAt: acknowledgementTarget.dueAt,
                required: true,
              }
            : { acknowledged: false, required: false },
          actionItems,
          following: follows.some((follow) => follow.active),
          kind: "post" as const,
          pins,
          post,
          reactions,
          receipts: receipts.filter((receipt) =>
            canSeeCollaborationReceipt(authorization, receipt)
          ),
          references,
          revision,
        };
      })
    );

    return { ...result, page };
  })
  .public();

function assertHumanPublisher(authorization: ActiveBuildAuthorization) {
  if (
    !authorization.viewer.subject ||
    authorization.viewer.subject.startsWith("agent_")
  ) {
    throw new Error(
      "Publishing requires human approval. Agents may prepare drafts only."
    );
  }
}

function validateRichTextContent(input: {
  plainText: string;
  tiptapJson: string;
}) {
  const plainText = input.plainText.trim();
  if (!plainText) {
    throw new Error("Post content is required.");
  }
  if (plainText.length > MAX_PLAIN_TEXT_LENGTH) {
    throw new Error(
      `Post text may not exceed ${MAX_PLAIN_TEXT_LENGTH} characters.`
    );
  }
  if (input.tiptapJson.length > MAX_RICH_TEXT_LENGTH) {
    throw new Error(
      `Post rich text may not exceed ${MAX_RICH_TEXT_LENGTH} characters.`
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.tiptapJson);
  } catch {
    throw new Error("Post rich text must be valid TipTap JSON.");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("type" in parsed) ||
    parsed.type !== "doc"
  ) {
    throw new Error("Post rich text must contain a TipTap document.");
  }
  return { plainText, tiptapJson: JSON.stringify(parsed) };
}

function resolvePublicationAudience(input: {
  audienceMode: "author_tier_and_higher" | "build_wide" | "custom";
  authorization: ActiveBuildAuthorization;
  requestedReaderIds: string[];
}) {
  const participants = input.authorization.participants.map((participant) => ({
    id: participant.workosUserId,
    roles: [participant.role],
  }));
  if (
    !participants.some(
      (participant) => participant.id === input.authorization.viewer.subject
    )
  ) {
    participants.push({
      id: input.authorization.viewer.subject,
      roles: [input.authorization.effectiveRole.role],
    });
  }
  if (input.audienceMode === "build_wide") {
    const readerIds = participants.map((participant) => participant.id).sort();
    return {
      excludedParticipantIds: [] as string[],
      mandatoryReaderIds: readerIds,
      readerIds,
      status: "allowed" as const,
    };
  }
  if (input.audienceMode === "author_tier_and_higher") {
    const readerIds = participants
      .filter(
        (participant) =>
          collaborationRoleTier(participant.roles[0]) >=
          input.authorization.effectiveRole.tier
      )
      .map((participant) => participant.id)
      .sort();
    return {
      excludedParticipantIds: participants
        .map((participant) => participant.id)
        .filter((id) => !readerIds.includes(id)),
      mandatoryReaderIds: readerIds,
      readerIds,
      status: "allowed" as const,
    };
  }
  if (!canCreateCustomCollaborationAudience(input.authorization.roles)) {
    throw new Error(
      "Custom audiences are unavailable for this Build role. Higher-tier participants must remain able to read the post."
    );
  }
  const resolved = resolveCollaborationAudience({
    authorId: input.authorization.viewer.subject,
    authorRoles: input.authorization.roles,
    participants,
    requestedReaderIds: input.requestedReaderIds,
  });
  if (resolved.status === "blocked") {
    throw new Error(
      "The selected audience conflicts with the referenced entity permissions."
    );
  }
  return resolved;
}

async function persistAudience(
  ctx: MutationCtx,
  input: {
    audience: {
      excludedParticipantIds: string[];
      mandatoryReaderIds: string[];
      readerIds: string[];
    };
    authorization: ActiveBuildAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    postRevisionId: Id<"buildCollaborationPostRevisions">;
  }
) {
  const common = {
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    organizationId: input.authorization.organizationId,
    postId: input.postId,
  };
  for (const workosUserId of input.audience.readerIds) {
    await ctx.db.insert("buildCollaborationAudienceMembers", {
      ...common,
      addedByWorkosUserId: input.authorization.viewer.subject,
      createdAt: input.now,
      workosUserId,
    });
    await ctx.db.insert("buildCollaborationAudienceSnapshots", {
      ...common,
      createdAt: input.now,
      postRevisionId: input.postRevisionId,
      reason: input.audience.mandatoryReaderIds.includes(workosUserId)
        ? "role hierarchy"
        : "explicit audience",
      resolution: input.audience.mandatoryReaderIds.includes(workosUserId)
        ? "mandatory"
        : "reader",
      workosUserId,
    });
  }
  for (const workosUserId of input.audience.excludedParticipantIds) {
    await ctx.db.insert("buildCollaborationAudienceSnapshots", {
      ...common,
      createdAt: input.now,
      postRevisionId: input.postRevisionId,
      reason: "excluded by author within role hierarchy",
      resolution: "excluded",
      workosUserId,
    });
  }
}

async function persistReferences(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    now: number;
    ownerRecordId: Id<"buildCollaborationPostRevisions">;
    postId: Id<"buildCollaborationPosts">;
    references: ReferenceInput[];
  }
) {
  for (const reference of input.references) {
    const entityId = reference.entityId.trim();
    const label = reference.label.trim();
    if (!(entityId && label)) {
      throw new Error("Every reference requires an entity and label.");
    }
    await ctx.db.insert("buildCollaborationReferences", {
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      entityId,
      entityKind: reference.entityKind,
      labelSnapshot: label,
      organizationId: input.authorization.organizationId,
      ownerKind: "postRevision",
      ownerRecordId: input.ownerRecordId,
      postId: input.postId,
      primary: reference.primary ?? false,
      summarySnapshot: reference.summary?.trim() || undefined,
    });
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Atomic bundle creation intentionally keeps assignment and audit invariants together.
async function createActionItems(
  ctx: MutationCtx,
  input: {
    actionItems: ActionItemInput[];
    authorization: ActiveBuildAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  for (const actionItem of input.actionItems) {
    const title = actionItem.title.trim();
    if (!title) {
      throw new Error("Every Action Item requires a title.");
    }
    const assignee = actionItem.assigneeWorkosUserId?.trim() || undefined;
    const assigneeParticipant = assignee
      ? input.authorization.participants.find(
          (participant) => participant.workosUserId === assignee
        )
      : undefined;
    if (assignee && !assigneeParticipant) {
      throw new Error("Action Item assignees must participate in this Build.");
    }
    const descriptionPlainText = actionItem.descriptionPlainText?.trim() ?? "";
    const descriptionTiptapJson =
      actionItem.descriptionTiptapJson ??
      JSON.stringify({ content: [], type: "doc" });
    validateOptionalTiptapJson(descriptionTiptapJson);
    const upwardAssignment =
      assigneeParticipant !== undefined &&
      collaborationRoleTier(assigneeParticipant.role) >
        input.authorization.effectiveRole.tier;
    const requiresAcceptance =
      actionItem.requiresAcceptance ?? upwardAssignment;
    const assignmentState = assignee
      ? requiresAcceptance
        ? ("requested" as const)
        : ("assigned" as const)
      : ("unassigned" as const);
    const actionItemId = await ctx.db.insert("buildActionItems", {
      assigneeWorkosUserId: assignee,
      assignmentRequestedAt:
        assignmentState === "requested" ? input.now : undefined,
      assignmentState,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      creatorWorkosUserId: input.authorization.viewer.subject,
      currentRevision: 1,
      descriptionPlainText,
      descriptionTiptapJson,
      dueAt: actionItem.dueAt,
      originatingPostId: input.postId,
      organizationId: input.authorization.organizationId,
      priority: actionItem.priority ?? "none",
      requiresAcceptance,
      status: "todo",
      title,
      updatedAt: input.now,
    });
    await ctx.db.insert("buildActionItemEvents", {
      actionItemId,
      actorRole: input.authorization.effectiveRole.role,
      actorWorkosUserId: input.authorization.viewer.subject,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      eventType: "created",
      newState: JSON.stringify({
        assigneeWorkosUserId: assignee,
        assignmentState,
        priority: actionItem.priority ?? "none",
        status: "todo",
      }),
      organizationId: input.authorization.organizationId,
    });
  }
}

async function recordPublicationAudit(
  ctx: MutationCtx,
  input: {
    actionItemCount: number;
    authorization: ActiveBuildAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    referenceCount: number;
  }
) {
  const newState = JSON.stringify({
    actionItemCount: input.actionItemCount,
    referenceCount: input.referenceCount,
    status: "published",
  });
  await ctx.db.insert("auditEvents", {
    actorRoles: input.authorization.roles,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    command: "approveAndPublishBuildCollaborationBundle",
    createdAt: input.now,
    entityId: input.postId,
    entityType: "buildCollaborationPost",
    eventType: "build.collaboration.post.published",
    newState,
    organizationId: input.authorization.organizationId,
    warnings: [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.authorization.brokerage._id,
    createdAt: input.now,
    eventType: "build.collaboration.post.published",
    organizationId: input.authorization.organizationId,
    payloadPreview: newState,
    relatedEntityId: input.postId,
    relatedEntityType: "buildCollaborationPost",
    status: "pending",
  });
}

export function stableContentHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) % 4_294_967_296;
  }
  return `djb2-${hash.toString(16).padStart(8, "0")}`;
}

function validateOptionalTiptapJson(value: string) {
  if (value.length > MAX_RICH_TEXT_LENGTH) {
    throw new Error("Action Item rich text is too long.");
  }
  try {
    const parsed = JSON.parse(value) as { type?: unknown };
    if (parsed.type !== "doc") {
      throw new Error("TipTap document root must have type doc.");
    }
  } catch {
    throw new Error("Action Item description must be valid TipTap JSON.");
  }
}
