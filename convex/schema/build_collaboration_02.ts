import { defineTable } from "convex/server";
import { v } from "convex/values";
import * as schemaValidators from "./validators";
import {
  buildCollaborationAudienceModeValidator,
  buildCollaborationContentStateValidator,
  buildCollaborationPostTypeValidator,
  buildCollaborationReferenceKindValidator,
  buildCollaborationRoleValidator,
  buildCollaborationSourceValidator,
  buildCollaborationSystemPostKindValidator,
  buildCollaborationThreadStateValidator,
} from "../build_collaboration_validators";

export const schemaTables = {
  buildCollaborationExports: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    requestedByWorkosUserId: v.string(),
    requestedByRole: buildCollaborationRoleValidator,
    scope: v.union(
      v.literal("full_archive"),
      v.literal("authorized_build"),
      v.literal("thread"),
      v.literal("asset")
    ),
    postId: v.optional(v.id("buildCollaborationPosts")),
    assetId: v.optional(v.id("buildCollaborationAssets")),
    tokenHash: v.string(),
    expiresAt: v.number(),
    state: v.union(
      v.literal("building"),
      v.literal("active"),
      v.literal("failed"),
      v.literal("cleanup_complete"),
      v.literal("expired"),
      v.literal("revoked")
    ),
    archiveChunkCount: v.optional(v.number()),
    archiveCompletedAt: v.optional(v.number()),
    archiveFailure: v.optional(v.string()),
    archivePlanPhase: v.optional(
      v.union(v.literal("posts"), v.literal("assets"), v.literal("complete"))
    ),
    archivePlanCursor: v.optional(v.string()),
    archivePlanCompletedAt: v.optional(v.number()),
    archivePlanNextOrdinal: v.optional(v.number()),
    archivePlannedAssetCount: v.optional(v.number()),
    archivePlannedPostCount: v.optional(v.number()),
    archiveHeartbeatAt: v.optional(v.number()),
    archiveContentRevision: v.optional(v.number()),
    archiveCleanupCompletedAt: v.optional(v.number()),
    archiveCursor: v.optional(v.string()),
    archiveNextRecordIndex: v.optional(v.number()),
    archiveNextSequence: v.optional(v.number()),
    archiveRecordCount: v.optional(v.number()),
    aclSnapshotJson: v.string(),
    manifestJson: v.string(),
    recordCount: v.number(),
    createdAt: v.number(),
    lastAccessedAt: v.optional(v.number()),
    accessCount: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_buildId_and_createdAt", ["buildId", "createdAt"])
    .index("by_state_and_expiresAt", ["state", "expiresAt"])
    .index("by_state_and_archiveHeartbeatAt", ["state", "archiveHeartbeatAt"])
    .index("by_requestedByWorkosUserId_and_createdAt", [
      "requestedByWorkosUserId",
      "createdAt",
    ])
    .index("by_organizationId_and_requestedByWorkosUserId_and_createdAt", [
      "organizationId",
      "requestedByWorkosUserId",
      "createdAt",
    ]),
  buildCollaborationExportArchiveChunks: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    exportId: v.id("buildCollaborationExports"),
    sequence: v.number(),
    recordIndex: v.number(),
    partIndex: v.number(),
    byteLength: v.number(),
    contentHashSha256: v.string(),
    content: v.optional(v.bytes()),
    state: v.optional(v.union(v.literal("reserved"), v.literal("stored"))),
    claimToken: v.optional(v.string()),
    reservedAt: v.optional(v.number()),
    storageId: v.optional(v.id("_storage")),
    storedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_exportId_and_sequence", ["exportId", "sequence"])
    .index("by_buildId", ["buildId"]),
  buildCollaborationExportArchivePlanRecords: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    exportId: v.id("buildCollaborationExports"),
    ordinal: v.number(),
    recordKey: v.string(),
    kind: v.union(
      v.literal("build_history"),
      v.literal("post"),
      v.literal("asset")
    ),
    section: v.optional(v.string()),
    postId: v.optional(v.id("buildCollaborationPosts")),
    assetId: v.optional(v.id("buildCollaborationAssets")),
    snapshotJson: v.string(),
    aclDecisionJson: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_exportId_and_ordinal", ["exportId", "ordinal"])
    .index("by_exportId_and_recordKey", ["exportId", "recordKey"])
    .index("by_buildId", ["buildId"]),
  buildCollaborationExportArchivePlanPosts: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    exportId: v.id("buildCollaborationExports"),
    postId: v.id("buildCollaborationPosts"),
    snapshotJson: v.string(),
    aclDecisionJson: v.string(),
    createdAt: v.number(),
  })
    .index("by_exportId_and_postId", ["exportId", "postId"])
    .index("by_buildId", ["buildId"]),
  buildCollaborationRetentionPurges: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    retentionPolicyId: v.id("buildCollaborationRetentionPolicies"),
    requestedByWorkosUserId: v.string(),
    requestedByRole: buildCollaborationRoleValidator,
    reason: v.string(),
    operationKey: v.optional(v.string()),
    state: v.union(
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("blocked")
    ),
    deletedPostCount: v.number(),
    deletedAssetCount: v.number(),
    retainedAuditEventCount: v.number(),
    batchCount: v.optional(v.number()),
    postsScanned: v.optional(v.boolean()),
    postCursor: v.optional(v.string()),
    actionItemsScanned: v.optional(v.boolean()),
    actionItemCursor: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_buildId_and_completedAt", ["buildId", "completedAt"])
    .index("by_buildId_and_state", ["buildId", "state"])
    .index("by_operationKey", ["operationKey"]),
  buildCollaborationPosts: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    source: buildCollaborationSourceValidator,
    postType: buildCollaborationPostTypeValidator,
    authorWorkosUserId: v.optional(v.string()),
    authorDisplayNameSnapshot: v.string(),
    authorRole: v.optional(buildCollaborationRoleValidator),
    authorRolesSnapshot: v.array(v.string()),
    agentDrafted: v.boolean(),
    systemEventKey: v.optional(v.string()),
    importedSourceId: v.optional(v.string()),
    audienceMode: buildCollaborationAudienceModeValidator,
    audienceFloorTier: v.number(),
    currentRevisionId: v.optional(v.id("buildCollaborationPostRevisions")),
    revision: v.number(),
    readRevision: v.optional(v.number()),
    threadState: buildCollaborationThreadStateValidator,
    threadRevision: v.optional(v.number()),
    contentState: buildCollaborationContentStateValidator,
    acceptedCommentId: v.optional(v.id("buildCollaborationComments")),
    decisionOwnerWorkosUserId: v.optional(v.string()),
    decisionOutcome: v.optional(v.string()),
    resolutionSummary: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    resolvedByWorkosUserId: v.optional(v.string()),
    announcementExpiresAt: v.optional(v.number()),
    announcementProminent: v.optional(v.boolean()),
    primaryReferenceKind: v.optional(buildCollaborationReferenceKindValidator),
    primaryReferenceId: v.optional(v.string()),
    commentCount: v.number(),
    openActionItemCount: v.number(),
    acknowledgementRequired: v.boolean(),
    lastMeaningfulActivityAt: v.number(),
    latestActivityActorWorkosUserId: v.optional(v.string()),
    tombstonedAt: v.optional(v.number()),
    tombstonedByWorkosUserId: v.optional(v.string()),
    moderationReason: v.optional(v.string()),
    moderatedAt: v.optional(v.number()),
    moderatedByWorkosUserId: v.optional(v.string()),
    moderatedByRole: v.optional(buildCollaborationRoleValidator),
    activeModerationCaseId: v.optional(
      v.id("buildCollaborationModerationCases")
    ),
    // Immutable canonical System Post identity.  Ordinary human posts leave
    // these fields unset; domain-owned posts bind to exactly one occurrence.
    systemPostKind: v.optional(buildCollaborationSystemPostKindValidator),
    canonicalBuildMilestoneId: v.optional(v.id("buildMilestones")),
    canonicalBuildDrawOccurrenceKey: v.optional(v.string()),
    systemOccurrenceKey: v.optional(v.string()),
    activationReason: v.optional(v.string()),
    triggeredByWorkosUserId: v.optional(v.string()),
    triggeredByRole: v.optional(buildCollaborationRoleValidator),
    triggeredAt: v.optional(v.number()),
    // Planning facts are projected from the canonical Build plan. These
    // fields identify the immutable activation revision without making the
    // collaboration post a second source of truth.
    activationPlanningRevisionId: v.optional(
      v.id("activeBuildPlanningRevisions")
    ),
    currentPlanningRevision: v.optional(v.number()),
    systemLifecycle: v.optional(
      v.union(
        v.literal("latent"),
        v.literal("open"),
        v.literal("resolved"),
        v.literal("reopened")
      )
    ),
    systemDisposition: v.optional(
      v.union(
        v.literal("withdrawal"),
        v.literal("cancellation"),
        v.literal("final_decline"),
        v.literal("released")
      )
    ),
    // Historical System Posts retain only proven source chronology/actor
    // facts.  `materializedAt` is migration metadata and must never be used
    // as feed activity or unread ordering.
    materializedAt: v.optional(v.number()),
    historicalBackfill: v.optional(
      schemaValidators.systemPostHistoricalBackfillValidator
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId_and_lastMeaningfulActivityAt", [
      "buildId",
      "lastMeaningfulActivityAt",
    ])
    .index("by_build_prominence_activity", [
      "buildId",
      "announcementProminent",
      "lastMeaningfulActivityAt",
    ])
    .index("by_buildId_and_createdAt", ["buildId", "createdAt"])
    .index("by_buildId_and_threadState_and_postType", [
      "buildId",
      "threadState",
      "postType",
    ])
    .index("by_buildId_and_systemEventKey", ["buildId", "systemEventKey"])
    .index("by_buildId_and_systemPostKind_and_canonicalBuildMilestoneId", [
      "buildId",
      "systemPostKind",
      "canonicalBuildMilestoneId",
    ])
    .index("by_buildId_and_systemPostKind", ["buildId", "systemPostKind"])
    .index("by_buildId_and_systemPostKind_and_drawOccurrenceKey", [
      "buildId",
      "systemPostKind",
      "canonicalBuildDrawOccurrenceKey",
    ])
    .index("by_buildId_and_systemOccurrenceKey", [
      "buildId",
      "systemOccurrenceKey",
    ])
    .index("by_buildId_and_source_and_createdAt", [
      "buildId",
      "source",
      "createdAt",
    ])
    .index("by_buildId_and_importedSourceId", ["buildId", "importedSourceId"])
    .index("by_organizationId_and_createdAt", ["organizationId", "createdAt"]),
  buildCollaborationPostRevisions: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    revision: v.number(),
    tiptapJson: v.string(),
    plainText: v.string(),
    contentHash: v.string(),
    authorWorkosUserId: v.string(),
    authorRole: buildCollaborationRoleValidator,
    editReason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_postId_and_revision", ["postId", "revision"])
    .index("by_buildId_and_createdAt", ["buildId", "createdAt"])
    .index("by_organizationId_and_createdAt", ["organizationId", "createdAt"])
    .searchIndex("search_plainText", {
      searchField: "plainText",
      filterFields: ["buildId", "organizationId"],
    }),
  buildCollaborationDecisionOutcomeRevisions: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    revision: v.number(),
    outcome: v.string(),
    ownerWorkosUserId: v.string(),
    ownerDisplayNameSnapshot: v.string(),
    changedByWorkosUserId: v.string(),
    changedByRole: buildCollaborationRoleValidator,
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_postId_and_revision", ["postId", "revision"])
    .index("by_buildId_and_createdAt", ["buildId", "createdAt"]),
  buildCollaborationThreadEvents: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    eventType: v.union(
      v.literal("resolved"),
      v.literal("reopened"),
      v.literal("reply_reopened"),
      v.literal("accepted_answer_unavailable"),
      v.literal("announcement_expiration_changed")
    ),
    actorWorkosUserId: v.string(),
    actorRole: buildCollaborationRoleValidator,
    priorState: v.string(),
    newState: v.string(),
    reason: v.optional(v.string()),
    acceptedCommentId: v.optional(v.id("buildCollaborationComments")),
    decisionRevisionId: v.optional(
      v.id("buildCollaborationDecisionOutcomeRevisions")
    ),
    createdAt: v.number(),
  }).index("by_postId_and_createdAt", ["postId", "createdAt"]),
  buildCollaborationAudienceMembers: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    workosUserId: v.string(),
    addedByWorkosUserId: v.string(),
    createdAt: v.number(),
  })
    .index("by_postId_and_workosUserId", ["postId", "workosUserId"])
    .index("by_postId_and_createdAt", ["postId", "createdAt"])
    .index("by_buildId_and_workosUserId", ["buildId", "workosUserId"]),
  buildCollaborationAudienceSnapshots: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    postRevisionId: v.id("buildCollaborationPostRevisions"),
    workosUserId: v.string(),
    resolution: v.union(
      v.literal("reader"),
      v.literal("excluded"),
      v.literal("mandatory")
    ),
    reason: v.string(),
    createdAt: v.number(),
  })
    .index("by_postRevisionId_and_workosUserId", [
      "postRevisionId",
      "workosUserId",
    ])
    .index("by_buildId_and_workosUserId", ["buildId", "workosUserId"]),
  buildCollaborationComments: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    parentCommentId: v.optional(v.id("buildCollaborationComments")),
    logicalDepth: v.number(),
    authorWorkosUserId: v.string(),
    authorDisplayNameSnapshot: v.string(),
    authorRole: buildCollaborationRoleValidator,
    currentRevisionId: v.optional(v.id("buildCollaborationCommentRevisions")),
    revision: v.number(),
    contentState: buildCollaborationContentStateValidator,
    tombstonedAt: v.optional(v.number()),
    tombstonedByWorkosUserId: v.optional(v.string()),
    moderationReason: v.optional(v.string()),
    moderatedAt: v.optional(v.number()),
    moderatedByWorkosUserId: v.optional(v.string()),
    moderatedByRole: v.optional(buildCollaborationRoleValidator),
    activeModerationCaseId: v.optional(
      v.id("buildCollaborationModerationCases")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_postId_and_createdAt", ["postId", "createdAt"])
    .index("by_parentCommentId_and_createdAt", ["parentCommentId", "createdAt"])
    .index("by_buildId_and_authorWorkosUserId", [
      "buildId",
      "authorWorkosUserId",
    ]),
  buildCollaborationCommentRevisions: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    commentId: v.id("buildCollaborationComments"),
    revision: v.number(),
    tiptapJson: v.string(),
    plainText: v.string(),
    contentHash: v.string(),
    authorWorkosUserId: v.string(),
    authorRole: v.optional(buildCollaborationRoleValidator),
    editReason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_commentId_and_revision", ["commentId", "revision"])
    .index("by_postId_and_createdAt", ["postId", "createdAt"])
    .searchIndex("search_plainText", {
      searchField: "plainText",
      filterFields: ["buildId", "organizationId"],
    }),
  buildCollaborationSearchRecords: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    ownerKind: v.optional(
      v.union(v.literal("post"), v.literal("comment"), v.literal("actionItem"))
    ),
    ownerId: v.optional(v.string()),
    readerPartitionKey: v.string(),
    candidateKey: v.string(),
    candidateJson: v.string(),
    searchText: v.string(),
    contentState: v.union(v.literal("active"), v.literal("retired")),
    sourceUpdatedAt: v.number(),
    indexedAt: v.number(),
    maintenanceJobId: v.optional(v.id("buildCollaborationSearchJobs")),
  })
    .index("by_postId", ["postId"])
    .index("by_postId_and_ownerKind_and_ownerId", [
      "postId",
      "ownerKind",
      "ownerId",
    ])
    .index("by_postId_and_reader", ["postId", "readerPartitionKey"])
    .index("by_build_reader_state_updatedAt", [
      "buildId",
      "readerPartitionKey",
      "contentState",
      "sourceUpdatedAt",
    ])
    .index("by_buildId_and_reader", ["buildId", "readerPartitionKey"])
    .index("by_maintenanceJobId_and_contentState", [
      "maintenanceJobId",
      "contentState",
    ])
    .searchIndex("search_searchText", {
      searchField: "searchText",
      filterFields: [
        "buildId",
        "organizationId",
        "readerPartitionKey",
        "contentState",
      ],
    }),
  buildCollaborationSearchStates: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    generation: v.number(),
    status: v.union(v.literal("building"), v.literal("ready")),
    readerFingerprint: v.optional(v.string()),
    targetReaderFingerprint: v.optional(v.string()),
    requestedAt: v.number(),
    readyAt: v.optional(v.number()),
    drainScheduled: v.optional(v.boolean()),
    drainToken: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_buildId", ["buildId"])
    .index("by_brokerageId_and_status", ["brokerageId", "status"])
    .index("by_organizationId_and_status", ["organizationId", "status"]),
  buildCollaborationSearchJobs: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.optional(v.id("buildCollaborationPosts")),
    ownerKind: v.optional(
      v.union(v.literal("post"), v.literal("comment"), v.literal("actionItem"))
    ),
    ownerId: v.optional(v.string()),
    scope: v.union(
      v.literal("owner"),
      v.literal("post"),
      v.literal("post_tree"),
      v.literal("build")
    ),
    generation: v.number(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("failed"),
      v.literal("complete")
    ),
    phase: v.union(
      v.literal("retire"),
      v.literal("tier"),
      v.literal("readers"),
      v.literal("activate"),
      v.literal("enumerate_posts"),
      v.literal("enumerate_comments"),
      v.literal("enumerate_actions"),
      v.literal("complete")
    ),
    readerOffset: v.optional(v.number()),
    candidateOffset: v.optional(v.number()),
    candidateCursor: v.optional(v.union(v.string(), v.null())),
    candidatePhase: v.optional(
      v.union(v.literal("base"), v.literal("references"), v.literal("assets"))
    ),
    cursor: v.optional(v.union(v.string(), v.null())),
    attemptVersion: v.optional(v.number()),
    failureCount: v.optional(v.number()),
    lastError: v.optional(v.string()),
    lastScheduledAt: v.optional(v.number()),
    leaseExpiresAt: v.optional(v.number()),
    retryAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId_and_status", ["buildId", "status"])
    .index("by_buildId_and_status_and_retryAt", [
      "buildId",
      "status",
      "retryAt",
    ])
    .index("by_brokerageId_and_status", ["brokerageId", "status"])
    .index("by_organizationId_and_status", ["organizationId", "status"])
    .index("by_buildId_and_scope_and_status", ["buildId", "scope", "status"])
    .index("by_buildId_and_postId_and_scope_and_status", [
      "buildId",
      "postId",
      "scope",
      "status",
    ])
    .index("by_buildId_and_ownerKind_and_ownerId", [
      "buildId",
      "ownerKind",
      "ownerId",
    ]),
  buildCollaborationSearchCutoverChecks: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    status: v.union(
      v.literal("building"),
      v.literal("blocked"),
      v.literal("ready")
    ),
    authorityCursor: v.optional(v.union(v.string(), v.null())),
    authorityProjectionComplete: v.optional(v.boolean()),
    rebuildCursor: v.optional(v.union(v.string(), v.null())),
    searchRebuildComplete: v.optional(v.boolean()),
    cursor: v.optional(v.union(v.string(), v.null())),
    buildCount: v.number(),
    readyBuildCount: v.number(),
    latestBuildCreationTime: v.optional(v.number()),
    authorityReaderFingerprint: v.optional(v.string()),
    implicitReaderSourceFingerprint: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),
  buildCollaborationSearchAuthorities: defineTable({
    organizationId: v.string(),
    workosMembershipId: v.string(),
    workosUserId: v.string(),
    role: v.union(v.literal("admin"), v.literal("principal-broker")),
    updatedAt: v.number(),
  })
    .index("by_workosMembershipId", ["workosMembershipId"])
    .index("by_organizationId_and_role", ["organizationId", "role"]),
  buildCollaborationModerationCases: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    commentId: v.optional(v.id("buildCollaborationComments")),
    entityKind: v.union(v.literal("post"), v.literal("comment")),
    entityId: v.string(),
    contentAuthorWorkosUserId: v.string(),
    contentAuthorRole: buildCollaborationRoleValidator,
    moderatorWorkosUserId: v.string(),
    moderatorRole: buildCollaborationRoleValidator,
    moderatorTier: v.number(),
    status: v.union(
      v.literal("moderated"),
      v.literal("appealed"),
      v.literal("restored"),
      v.literal("final_retained")
    ),
    currentReason: v.string(),
    appealReviewerMinimumTier: v.number(),
    evidenceSnapshotJson: v.string(),
    lastAppealedAt: v.optional(v.number()),
    lastAppealedByWorkosUserId: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    resolvedByWorkosUserId: v.optional(v.string()),
    resolvedByRole: v.optional(buildCollaborationRoleValidator),
    resolutionReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_entityKind_and_entityId", ["entityKind", "entityId"])
    .index("by_postId_and_createdAt", ["postId", "createdAt"])
    .index("by_postId_and_status", ["postId", "status"])
    .index("by_contentAuthorWorkosUserId_and_status", [
      "contentAuthorWorkosUserId",
      "status",
    ]),
  buildCollaborationModerationEvents: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    caseId: v.id("buildCollaborationModerationCases"),
    eventType: v.union(
      v.literal("moderated"),
      v.literal("appealed"),
      v.literal("restored"),
      v.literal("retained")
    ),
    actorWorkosUserId: v.string(),
    actorRole: buildCollaborationRoleValidator,
    priorState: v.string(),
    newState: v.string(),
    reason: v.string(),
    createdAt: v.number(),
  }).index("by_caseId_and_createdAt", ["caseId", "createdAt"]),
};
