import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  buildActionAssignmentStateValidator,
  buildActionItemPriorityValidator,
  buildActionItemStatusValidator,
  buildActionItemSystemModeValidator,
  buildActionItemWorkKindValidator,
  buildActionRelationKindValidator,
  buildCollaborationActorKindValidator,
  buildCollaborationApprovalStateValidator,
  buildCollaborationAssetScanStateValidator,
  buildCollaborationAssetStagingContextValidator,
  buildCollaborationAssetStagingStateValidator,
  buildCollaborationAssetStateValidator,
  buildCollaborationAttachmentKindValidator,
  buildCollaborationAudienceModeValidator,
  buildCollaborationDraftStateValidator,
  buildCollaborationOwnerKindValidator,
  buildCollaborationPinKindValidator,
  buildCollaborationReactionValidator,
  buildCollaborationReferenceKindValidator,
  buildCollaborationRoleValidator,
  buildPlanningStateValidator,
} from "../build_collaboration_validators";

export const schemaTables = {
  buildCollaborationReferences: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    ownerKind: buildCollaborationOwnerKindValidator,
    ownerRecordId: v.string(),
    postId: v.id("buildCollaborationPosts"),
    entityKind: buildCollaborationReferenceKindValidator,
    entityId: v.string(),
    primary: v.boolean(),
    labelSnapshot: v.string(),
    summarySnapshot: v.optional(v.string()),
    actionItemQueueSortAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_ownerKind_and_ownerRecordId", ["ownerKind", "ownerRecordId"])
    .index("by_buildId_and_entityKind_and_entityId", [
      "buildId",
      "entityKind",
      "entityId",
    ])
    .index("by_build_entity_owner_queueSort", [
      "buildId",
      "entityKind",
      "entityId",
      "ownerKind",
      "actionItemQueueSortAt",
    ])
    .index("by_postId", ["postId"])
    .index("by_postId_and_createdAt", ["postId", "createdAt"]),
  buildCollaborationFollows: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    workosUserId: v.string(),
    reason: v.union(
      v.literal("author"),
      v.literal("commenter"),
      v.literal("mentioned"),
      v.literal("assigned"),
      v.literal("manual")
    ),
    active: v.boolean(),
    // Draw coordination membership is intentionally orthogonal to the
    // ordinary follow state above. Joining coordination must not subscribe a
    // user to the thread, and leaving must not silently destroy an explicit
    // follow created by another collaboration action.
    coordinationActive: v.optional(v.boolean()),
    coordinationJoinedAt: v.optional(v.number()),
    coordinationJoinedByWorkosUserId: v.optional(v.string()),
    coordinationLeftAt: v.optional(v.number()),
    coordinationLeftByWorkosUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_postId_and_workosUserId", ["postId", "workosUserId"])
    .index("by_postId_and_createdAt", ["postId", "createdAt"])
    .index("by_buildId_and_workosUserId_and_active", [
      "buildId",
      "workosUserId",
      "active",
    ])
    .index("by_postId_and_coordinationActive", [
      "postId",
      "coordinationActive",
    ]),
  buildCollaborationReactions: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    commentId: v.optional(v.id("buildCollaborationComments")),
    workosUserId: v.string(),
    reaction: buildCollaborationReactionValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_postId_and_workosUserId", ["postId", "workosUserId"])
    .index("by_postId_and_createdAt", ["postId", "createdAt"])
    .index("by_postId_and_commentId_and_workosUserId", [
      "postId",
      "commentId",
      "workosUserId",
    ])
    .index("by_commentId_and_workosUserId", ["commentId", "workosUserId"]),
  buildCollaborationReceipts: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    workosUserId: v.string(),
    viewerRole: buildCollaborationRoleValidator,
    firstViewedAt: v.number(),
    lastViewedAt: v.number(),
    latestRevisionViewed: v.number(),
  })
    .index("by_postId_and_workosUserId", ["postId", "workosUserId"])
    .index("by_postId_and_firstViewedAt", ["postId", "firstViewedAt"])
    .index("by_buildId_and_workosUserId", ["buildId", "workosUserId"])
    .index("by_organizationId_and_firstViewedAt", [
      "organizationId",
      "firstViewedAt",
    ]),
  buildCollaborationPins: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    commentId: v.optional(v.id("buildCollaborationComments")),
    workosUserId: v.string(),
    kind: buildCollaborationPinKindValidator,
    createdAt: v.number(),
  })
    .index("by_postId_and_createdAt", ["postId", "createdAt"])
    .index("by_buildId_and_kind_and_createdAt", [
      "buildId",
      "kind",
      "createdAt",
    ])
    .index("by_postId_and_workosUserId_and_kind", [
      "postId",
      "workosUserId",
      "kind",
    ])
    .index("by_postId_and_commentId_and_workosUserId_and_kind", [
      "postId",
      "commentId",
      "workosUserId",
      "kind",
    ]),
  buildCollaborationAcknowledgementTargets: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    workosUserId: v.string(),
    dueAt: v.optional(v.number()),
    waivedAt: v.optional(v.number()),
    waivedByWorkosUserId: v.optional(v.string()),
    waiverReason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_postId_and_workosUserId", ["postId", "workosUserId"])
    .index("by_postId_and_createdAt", ["postId", "createdAt"])
    .index("by_buildId_and_workosUserId", ["buildId", "workosUserId"]),
  buildCollaborationAcknowledgements: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    targetId: v.id("buildCollaborationAcknowledgementTargets"),
    workosUserId: v.string(),
    acknowledgedRevision: v.number(),
    acknowledgedAt: v.number(),
  })
    .index("by_targetId", ["targetId"])
    .index("by_postId_and_workosUserId", ["postId", "workosUserId"]),
  buildActionItems: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    originatingPostId: v.id("buildCollaborationPosts"),
    parentActionItemId: v.optional(v.id("buildActionItems")),
    title: v.string(),
    descriptionTiptapJson: v.string(),
    descriptionPlainText: v.string(),
    status: buildActionItemStatusValidator,
    workKind: v.optional(buildActionItemWorkKindValidator),
    previousActiveStatus: v.optional(buildActionItemStatusValidator),
    priority: buildActionItemPriorityValidator,
    creatorWorkosUserId: v.string(),
    creatorRole: v.optional(buildCollaborationRoleValidator),
    assigneeWorkosUserId: v.optional(v.string()),
    assignedByWorkosUserId: v.optional(v.string()),
    assignmentState: buildActionAssignmentStateValidator,
    assignmentRequestedAt: v.optional(v.number()),
    dueAt: v.optional(v.number()),
    dueDateSource: v.optional(
      v.union(v.literal("manual"), v.literal("policy"))
    ),
    dueDatePolicyKey: v.optional(v.string()),
    policyDueAt: v.optional(v.number()),
    dueDateOverrideReason: v.optional(v.string()),
    dueDateOverriddenAt: v.optional(v.number()),
    dueDateOverriddenByWorkosUserId: v.optional(v.string()),
    policyObligationKey: v.optional(v.string()),
    deadlineNextAt: v.optional(v.number()),
    deadlineScheduleGeneration: v.optional(v.number()),
    deadlineNextStage: v.optional(
      v.union(
        v.literal("before"),
        v.literal("due"),
        v.literal("overdue"),
        v.literal("escalated")
      )
    ),
    deadlineProcessingState: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("complete"),
        v.literal("quarantined")
      )
    ),
    deadlineProcessingFailure: v.optional(v.string()),
    deadlineProcessingFailedAt: v.optional(v.number()),
    requiresAcceptance: v.boolean(),
    blockedReason: v.optional(v.string()),
    cancellationReason: v.optional(v.string()),
    unassignmentReason: v.optional(v.literal("participant_removed")),
    completionRequestedAt: v.optional(v.number()),
    completionRequestedByWorkosUserId: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    completedByWorkosUserId: v.optional(v.string()),
    completionAcceptedByWorkosUserId: v.optional(v.string()),
    currentRevision: v.number(),
    queueSortAt: v.optional(v.number()),
    primaryReferenceKind: v.optional(buildCollaborationReferenceKindValidator),
    primaryReferenceId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    // Generated Milestone cards are immutable projections of canonical
    // Sub-milestones.  User-authored Action Items leave these unset.
    systemMode: v.optional(buildActionItemSystemModeValidator),
    canonicalBuildMilestoneId: v.optional(v.id("buildMilestones")),
    canonicalBuildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
    historicalCanonicalBuildSubmilestoneId: v.optional(
      v.id("buildSubmilestones")
    ),
    canonicalCompanionDisposition: v.optional(
      v.union(
        v.literal("active"),
        v.literal("historical"),
        v.literal("historical_duplicate"),
        v.literal("quarantined")
      )
    ),
    canonicalCompanionSurvivorId: v.optional(v.id("buildActionItems")),
    canonicalCompanionSupersededAt: v.optional(v.number()),
    canonicalBindingRevision: v.optional(v.number()),
    canonicalPlanningState: v.optional(buildPlanningStateValidator),
  })
    .index("by_canonicalBuildSubmilestoneId_and_systemMode", [
      "canonicalBuildSubmilestoneId",
      "systemMode",
    ])
    .index("by_originatingPostId_and_createdAt", [
      "originatingPostId",
      "createdAt",
    ])
    .index("by_originatingPostId_and_status", ["originatingPostId", "status"])
    .index("by_originatingPostId_and_queueSortAt", [
      "originatingPostId",
      "queueSortAt",
    ])
    .index("by_buildId_and_status_and_updatedAt", [
      "buildId",
      "status",
      "updatedAt",
    ])
    .index("by_buildId_and_queueSortAt", ["buildId", "queueSortAt"])
    .index("by_buildId_and_systemMode", ["buildId", "systemMode"])
    .index("by_buildId_and_assigneeWorkosUserId_and_status", [
      "buildId",
      "assigneeWorkosUserId",
      "status",
    ])
    .index("by_organizationId_and_assigneeWorkosUserId_and_status", [
      "organizationId",
      "assigneeWorkosUserId",
      "status",
    ])
    .index("by_organizationId_and_assigneeWorkosUserId_and_updatedAt", [
      "organizationId",
      "assigneeWorkosUserId",
      "updatedAt",
    ])
    .index("by_organizationId_and_assigneeWorkosUserId_and_queueSortAt", [
      "organizationId",
      "assigneeWorkosUserId",
      "queueSortAt",
    ])
    .index("by_parentActionItemId_and_status", ["parentActionItemId", "status"])
    .index("by_deadlineProcessingState_and_nextDeadlineAt", [
      "deadlineProcessingState",
      "deadlineNextAt",
    ])
    .index("by_buildId_and_deadlineProcessingState_and_nextDeadlineAt", [
      "buildId",
      "deadlineProcessingState",
      "deadlineNextAt",
    ])
    .index("by_buildId_and_policyObligationKey", [
      "buildId",
      "policyObligationKey",
    ])
    .index("by_dueAt", ["dueAt"])
    .index("by_buildId_and_dueAt", ["buildId", "dueAt"]),
  buildActionItemPostLinks: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    actionItemId: v.id("buildActionItems"),
    linkKind: v.union(v.literal("originating"), v.literal("policy_obligation")),
    createdAt: v.number(),
  })
    .index("by_postId_and_actionItemId", ["postId", "actionItemId"])
    .index("by_actionItemId_and_postId", ["actionItemId", "postId"]),
  buildActionItemEvents: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    actionItemId: v.id("buildActionItems"),
    eventType: v.string(),
    actorWorkosUserId: v.string(),
    actorRole: buildCollaborationRoleValidator,
    exercisedAuthority: v.optional(v.string()),
    revision: v.optional(v.number()),
    priorState: v.optional(v.string()),
    newState: v.optional(v.string()),
    reason: v.optional(v.string()),
    warnings: v.optional(v.array(v.string())),
    createdAt: v.number(),
  }).index("by_actionItemId_and_createdAt", ["actionItemId", "createdAt"]),
  buildActionItemRevisions: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    actionItemId: v.id("buildActionItems"),
    revision: v.number(),
    snapshotJson: v.string(),
    actorWorkosUserId: v.string(),
    actorRole: buildCollaborationRoleValidator,
    reason: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_actionItemId_and_revision", ["actionItemId", "revision"]),
  buildActionItemLabels: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    actionItemId: v.id("buildActionItems"),
    label: v.string(),
    normalizedLabel: v.string(),
    createdByWorkosUserId: v.string(),
    createdAt: v.number(),
  })
    .index("by_actionItemId_and_normalizedLabel", [
      "actionItemId",
      "normalizedLabel",
    ])
    .index("by_buildId_and_normalizedLabel", ["buildId", "normalizedLabel"]),
  buildActionItemComments: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    actionItemId: v.id("buildActionItems"),
    authorWorkosUserId: v.string(),
    authorDisplayNameSnapshot: v.string(),
    authorRole: buildCollaborationRoleValidator,
    tiptapJson: v.string(),
    plainText: v.string(),
    parentCommentId: v.optional(v.id("buildActionItemComments")),
    createdAt: v.number(),
  })
    .index("by_actionItemId_and_createdAt", ["actionItemId", "createdAt"])
    .index("by_parentCommentId_and_createdAt", [
      "parentCommentId",
      "createdAt",
    ]),
  buildActionItemCommentReactions: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    actionItemId: v.id("buildActionItems"),
    commentId: v.id("buildActionItemComments"),
    workosUserId: v.string(),
    reaction: buildCollaborationReactionValidator,
    createdAt: v.number(),
  })
    .index("by_commentId", ["commentId"])
    .index("by_commentId_and_workosUserId_and_reaction", [
      "commentId",
      "workosUserId",
      "reaction",
    ]),
  buildActionItemCreationRequests: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    creatorWorkosUserId: v.string(),
    requestId: v.string(),
    actionItemId: v.id("buildActionItems"),
    createdAt: v.number(),
  })
    .index("by_buildId", ["buildId"])
    .index("by_postId_and_createdAt", ["postId", "createdAt"])
    .index("by_postId_and_creatorWorkosUserId_and_requestId", [
      "postId",
      "creatorWorkosUserId",
      "requestId",
    ]),
  buildCollaborationActivityProjections: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    actionItemId: v.id("buildActionItems"),
    targetKind: v.union(
      v.literal("post"),
      buildCollaborationReferenceKindValidator
    ),
    targetId: v.string(),
    eventType: v.string(),
    projectionKey: v.string(),
    actorWorkosUserId: v.string(),
    createdAt: v.number(),
  })
    .index("by_buildId_and_projectionKey", ["buildId", "projectionKey"])
    .index("by_buildId_and_actionItemId", ["buildId", "actionItemId"])
    .index("by_buildId_and_targetKind_and_targetId_and_createdAt", [
      "buildId",
      "targetKind",
      "targetId",
      "createdAt",
    ]),
  buildActionItemRelations: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    sourceActionItemId: v.id("buildActionItems"),
    targetActionItemId: v.id("buildActionItems"),
    kind: buildActionRelationKindValidator,
    relationshipKey: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("superseded")
    ),
    suspensionReason: v.optional(v.string()),
    suspendedAt: v.optional(v.number()),
    suspendedByWorkosUserId: v.optional(v.string()),
    restoredAt: v.optional(v.number()),
    restoredByWorkosUserId: v.optional(v.string()),
    supersededAt: v.optional(v.number()),
    supersededByRelationId: v.optional(v.id("buildActionItemRelations")),
    createdByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId_and_relationshipKey", ["buildId", "relationshipKey"])
    .index("by_buildId_and_status", ["buildId", "status"])
    .index("by_sourceActionItemId_and_kind", ["sourceActionItemId", "kind"])
    .index("by_sourceActionItemId_and_status", ["sourceActionItemId", "status"])
    .index("by_targetActionItemId_and_kind", ["targetActionItemId", "kind"])
    .index("by_targetActionItemId_and_status", [
      "targetActionItemId",
      "status",
    ]),
  buildActionItemChecklistItems: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    actionItemId: v.id("buildActionItems"),
    label: v.string(),
    required: v.boolean(),
    completed: v.boolean(),
    order: v.number(),
    completedAt: v.optional(v.number()),
    completedByWorkosUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_actionItemId_and_order", ["actionItemId", "order"]),
  buildCollaborationAssets: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    state: buildCollaborationAssetStateValidator,
    scanState: v.optional(buildCollaborationAssetScanStateValidator),
    contentHashSha256: v.optional(v.string()),
    stagingSessionId: v.optional(
      v.id("buildCollaborationAssetStagingSessions")
    ),
    uploadedByWorkosUserId: v.string(),
    version: v.number(),
    lineageRootAssetId: v.optional(v.id("buildCollaborationAssets")),
    supersedesAssetId: v.optional(v.id("buildCollaborationAssets")),
    maximumAudienceMode: buildCollaborationAudienceModeValidator,
    originatingPostId: v.optional(v.id("buildCollaborationPosts")),
    readerWorkosUserIds: v.optional(v.array(v.string())),
    scanMessage: v.optional(v.string()),
    scanCompletedAt: v.optional(v.number()),
    storageDeletedAt: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    publishedOwnerKind: v.optional(buildCollaborationOwnerKindValidator),
    publishedOwnerRecordId: v.optional(v.string()),
    sourceCapturedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId", ["buildId"])
    .index("by_buildId_and_state_and_createdAt", [
      "buildId",
      "state",
      "createdAt",
    ])
    .index("by_buildId_and_state_and_storageDeletedAt_and_createdAt", [
      "buildId",
      "state",
      "storageDeletedAt",
      "createdAt",
    ])
    .index("by_storageId", ["storageId"])
    .index("by_supersedesAssetId", ["supersedesAssetId"])
    .index("by_lineageRootAssetId_and_version", [
      "lineageRootAssetId",
      "version",
    ])
    .index("by_organizationId_and_createdAt", ["organizationId", "createdAt"]),
  buildCollaborationAssetStagingSessions: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    ownerWorkosUserId: v.string(),
    actorCapacity: v.optional(buildCollaborationRoleValidator),
    contextKind: buildCollaborationAssetStagingContextValidator,
    contextRecordId: v.optional(v.string()),
    expectedFileName: v.optional(v.string()),
    expectedMimeType: v.optional(v.string()),
    expectedSizeBytes: v.optional(v.number()),
    sourceCapturedAt: v.optional(v.number()),
    state: buildCollaborationAssetStagingStateValidator,
    assetId: v.optional(v.id("buildCollaborationAssets")),
    pendingStorageId: v.optional(v.id("_storage")),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId", ["buildId"])
    .index("by_buildId_and_ownerWorkosUserId_and_state", [
      "buildId",
      "ownerWorkosUserId",
      "state",
    ])
    .index("by_buildId_and_contextKind_and_state_and_expiresAt", [
      "buildId",
      "contextKind",
      "state",
      "expiresAt",
    ])
    .index("by_contextKind_and_contextRecordId_and_state", [
      "contextKind",
      "contextRecordId",
      "state",
    ])
    .index("by_assetId", ["assetId"])
    .index("by_pendingStorageId", ["pendingStorageId"])
    .index("by_state_and_expiresAt", ["state", "expiresAt"]),
  buildCollaborationAttachments: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    ownerKind: buildCollaborationOwnerKindValidator,
    ownerRecordId: v.string(),
    attachmentKind: buildCollaborationAttachmentKindValidator,
    attachmentId: v.string(),
    createdByWorkosUserId: v.string(),
    createdAt: v.number(),
  })
    .index("by_ownerKind_and_ownerRecordId", ["ownerKind", "ownerRecordId"])
    .index("by_buildId_and_attachmentKind_and_attachmentId", [
      "buildId",
      "attachmentKind",
      "attachmentId",
    ]),
  buildCollaborationDrafts: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    ownerWorkosUserId: v.string(),
    approvalOwnerWorkosUserId: v.optional(v.string()),
    preparedByActorKind: v.optional(buildCollaborationActorKindValidator),
    preparedByWorkosUserId: v.optional(v.string()),
    preparedByAgent: v.optional(v.boolean()),
    state: buildCollaborationDraftStateValidator,
    bundleJson: v.string(),
    bundleHash: v.string(),
    revision: v.number(),
    offlineCapturedAt: v.optional(v.number()),
    scheduledFor: v.optional(v.number()),
    scheduleConflictReason: v.optional(v.string()),
    schedulePausedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId", ["buildId"])
    .index("by_buildId_and_ownerWorkosUserId_and_state", [
      "buildId",
      "ownerWorkosUserId",
      "state",
    ])
    .index("by_buildId_and_approvalOwnerWorkosUserId_and_state", [
      "buildId",
      "approvalOwnerWorkosUserId",
      "state",
    ]),
  buildCollaborationPublicationApprovals: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    draftId: v.id("buildCollaborationDrafts"),
    approvingWorkosUserId: v.string(),
    approvingActorKind: v.optional(buildCollaborationActorKindValidator),
    approvingRole: v.optional(buildCollaborationRoleValidator),
    approvingRoles: v.optional(v.array(buildCollaborationRoleValidator)),
    approvalHash: v.optional(v.string()),
    bundleHash: v.string(),
    bundleJsonSnapshot: v.optional(v.string()),
    draftRevision: v.optional(v.number()),
    readerSummaryJson: v.string(),
    mutationSummaryJson: v.string(),
    state: buildCollaborationApprovalStateValidator,
    scheduledFor: v.optional(v.number()),
    approvedAt: v.number(),
    invalidatedAt: v.optional(v.number()),
    pausedAt: v.optional(v.number()),
    conflictReason: v.optional(v.string()),
    executionAttemptCount: v.optional(v.number()),
    lastExecutionAt: v.optional(v.number()),
    lastExecutionError: v.optional(v.string()),
    postId: v.optional(v.id("buildCollaborationPosts")),
    publishedAt: v.optional(v.number()),
  })
    .index("by_buildId", ["buildId"])
    .index("by_draftId_and_state", ["draftId", "state"])
    .index("by_buildId_and_scheduledFor_and_state", [
      "buildId",
      "scheduledFor",
      "state",
    ])
    .index("by_state_and_scheduledFor", ["state", "scheduledFor"]),
};
