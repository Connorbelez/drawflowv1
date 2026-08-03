import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import {
  buildActionAssignmentStateValidator,
  buildActionItemPriorityValidator,
  buildActionItemStatusValidator,
  buildActionItemSystemModeValidator,
  buildActionItemWorkKindValidator,
  buildActionRelationKindValidator,
  buildCollaborationActorKindValidator,
  buildCollaborationAssetStateValidator,
  buildCollaborationAudienceModeValidator,
  buildCollaborationDraftStateValidator,
  buildCollaborationNotificationChannelValidator,
  buildCollaborationPostTypeValidator,
  buildCollaborationReactionValidator,
  buildCollaborationReferenceKindValidator,
  buildCollaborationRoleValidator,
  buildCollaborationSourceValidator,
  buildCollaborationSystemPostKindValidator,
} from "./build_collaboration_validators";

const collaborationSystemPostValidator = v.object({
  activationReason: v.string(),
  authoredBy: v.literal("DrawFlow System"),
  canonicalBuildMilestoneId: v.optional(v.id("buildMilestones")),
  kind: buildCollaborationSystemPostKindValidator,
  occurrenceKey: v.string(),
  recoveryState: v.optional(v.literal("recovery_required")),
  triggeredAt: v.optional(v.number()),
  triggeredByRole: v.optional(buildCollaborationRoleValidator),
  triggeredByWorkosUserId: v.optional(v.string()),
});

export const systemActionItemPresentationValidator = v.object({
  attention: v.optional(v.literal("overdue_completion")),
  executionOwnership: v.optional(
    v.object({
      assigneeDisplayName: v.optional(v.string()),
      assigneeId: v.optional(v.id("contractorProfiles")),
      state: v.union(
        v.literal("assigned"),
        v.literal("assignment_required")
      ),
      viewerIsAssignee: v.boolean(),
    })
  ),
  column: v.union(
    v.literal("backlog"),
    v.literal("behind_schedule"),
    v.literal("in_progress"),
    v.literal("in_review"),
    v.literal("approved")
  ),
  plannedCompletionDate: v.optional(v.string()),
  plannedStartDate: v.optional(v.string()),
  state: v.union(v.literal("known"), v.literal("unknown")),
  startCommand: v.optional(
    v.object({
      allowed: v.boolean(),
      buildName: v.string(),
      dependencyBlockers: v.array(
        v.object({
          milestoneKey: v.string(),
          milestoneName: v.string(),
          status: v.union(v.literal("in_progress"), v.literal("planned")),
        })
      ),
      denialReason: v.optional(
        v.union(
          v.literal("already_started"),
          v.literal("assignment_required"),
          v.literal("completed"),
          v.literal("permission_denied")
        )
      ),
      milestoneKey: v.string(),
      milestoneName: v.string(),
      plannedStartDate: v.string(),
      scope: v.literal("submilestone"),
      source: v.literal("submilestone_detail"),
      submilestoneKey: v.string(),
      submilestoneName: v.string(),
    })
  ),
  timezone: v.optional(v.string()),
  unknownReason: v.optional(v.string()),
});

export const collaborationPostSummaryValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("buildCollaborationPosts"),
  acceptedCommentId: v.optional(v.id("buildCollaborationComments")),
  agentDrafted: v.boolean(),
  announcementExpiresAt: v.optional(v.number()),
  announcementProminent: v.boolean(),
  audienceMode: buildCollaborationAudienceModeValidator,
  authorDisplayNameSnapshot: v.string(),
  authorRole: v.optional(buildCollaborationRoleValidator),
  authorWorkosUserId: v.optional(v.string()),
  commentCount: v.number(),
  contentState: v.union(
    v.literal("active"),
    v.literal("tombstoned"),
    v.literal("moderated")
  ),
  createdAt: v.number(),
  decisionOutcome: v.optional(v.string()),
  decisionOwnerDisplayName: v.optional(v.string()),
  decisionOwnerWorkosUserId: v.optional(v.string()),
  postType: buildCollaborationPostTypeValidator,
  readRevision: v.number(),
  resolutionSummary: v.optional(v.string()),
  resolvedAt: v.optional(v.number()),
  revision: v.number(),
  source: buildCollaborationSourceValidator,
  systemPost: v.optional(collaborationSystemPostValidator),
  threadState: v.union(v.literal("open"), v.literal("resolved")),
  updatedAt: v.number(),
  viewerCanAppeal: v.boolean(),
  viewerCanModerate: v.boolean(),
  viewerCanResolveAppeal: v.boolean(),
  viewerCanManageThread: v.boolean(),
  viewerIsAuthor: v.boolean(),
});

export const collaborationPostRevisionSummaryValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("buildCollaborationPostRevisions"),
  createdAt: v.number(),
  editReason: v.optional(v.string()),
  plainText: v.string(),
  revision: v.number(),
  tiptapJson: v.string(),
});

export const collaborationActionItemSummaryValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("buildActionItems"),
  assigneeWorkosUserId: v.optional(v.string()),
  assignmentState: buildActionAssignmentStateValidator,
  actionableUnreadCount: v.number(),
  blockedReason: v.optional(v.string()),
  createdAt: v.number(),
  currentRevision: v.number(),
  dependencyCount: v.number(),
  dueAt: v.optional(v.number()),
  labels: v.array(v.string()),
  priority: buildActionItemPriorityValidator,
  status: buildActionItemStatusValidator,
  systemPresentation: v.optional(systemActionItemPresentationValidator),
  systemMode: v.optional(buildActionItemSystemModeValidator),
  canonicalBuildMilestoneId: v.optional(v.id("buildMilestones")),
  canonicalBuildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
  canonicalBindingRevision: v.optional(v.number()),
  title: v.string(),
  unblocksCount: v.number(),
  unreadCommentCount: v.number(),
});

export const collaborationReferenceSummaryValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("buildCollaborationReferences"),
  entityId: v.string(),
  entityKind: buildCollaborationReferenceKindValidator,
  labelSnapshot: v.string(),
  summarySnapshot: v.optional(v.string()),
});

export const collaborationReactionSummaryValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("buildCollaborationReactions"),
  reaction: buildCollaborationReactionValidator,
  workosUserId: v.string(),
});

export const collaborationPinSummaryValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("buildCollaborationPins"),
});

export const collaborationAssetSummaryValidator = v.object({
  assetId: v.id("buildCollaborationAssets"),
  fileName: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  state: buildCollaborationAssetStateValidator,
  version: v.number(),
});

export const collaborationReceiptSummaryValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("buildCollaborationReceipts"),
  lastViewedAt: v.number(),
  latestRevisionViewed: v.number(),
  viewerRole: buildCollaborationRoleValidator,
  workosUserId: v.string(),
});

export const collaborationUnavailableFeedEntryValidator = v.object({
  kind: v.literal("unavailable"),
  placeholderKey: v.string(),
});

export const collaborationReadableFeedPostEntryValidator = v.object({
  acknowledgement: v.object({
    acknowledged: v.boolean(),
    dueAt: v.optional(v.number()),
    required: v.boolean(),
  }),
  actionItems: v.array(collaborationActionItemSummaryValidator),
  attachments: v.array(collaborationAssetSummaryValidator),
  following: v.boolean(),
  kind: v.literal("post"),
  pins: v.array(collaborationPinSummaryValidator),
  post: collaborationPostSummaryValidator,
  reactions: v.array(collaborationReactionSummaryValidator),
  receipts: v.array(collaborationReceiptSummaryValidator),
  references: v.array(collaborationReferenceSummaryValidator),
  revision: collaborationPostRevisionSummaryValidator,
});

export const collaborationFeedEntryValidator = v.union(
  v.object({
    kind: v.literal("restricted"),
    placeholderKey: v.string(),
  }),
  collaborationUnavailableFeedEntryValidator,
  collaborationReadableFeedPostEntryValidator
);

export const collaborationFocusedPostContextValidator = v.union(
  v.object({ state: v.literal("revoked") }),
  v.object({
    entry: collaborationReadableFeedPostEntryValidator,
    state: v.literal("visible"),
  })
);

export const collaborationFeedResultValidator = paginationResultValidator(
  collaborationFeedEntryValidator
);

export const collaborationCommentSummaryValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("buildCollaborationComments"),
  authorDisplayNameSnapshot: v.string(),
  authorRole: buildCollaborationRoleValidator,
  contentState: v.union(
    v.literal("active"),
    v.literal("tombstoned"),
    v.literal("moderated")
  ),
  createdAt: v.number(),
  logicalDepth: v.number(),
  parentAuthorDisplayNameSnapshot: v.optional(v.string()),
  parentCommentId: v.optional(v.id("buildCollaborationComments")),
  pinCount: v.number(),
  revision: v.number(),
  updatedAt: v.number(),
  viewerCanPin: v.boolean(),
  viewerCanAppeal: v.boolean(),
  viewerCanModerate: v.boolean(),
  viewerCanResolveAppeal: v.boolean(),
  viewerIsAuthor: v.boolean(),
  viewerPinned: v.boolean(),
});

export const collaborationCommentRevisionSummaryValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("buildCollaborationCommentRevisions"),
  createdAt: v.number(),
  editReason: v.optional(v.string()),
  plainText: v.string(),
  revision: v.number(),
  tiptapJson: v.string(),
});

export const collaborationCommentRowValidator = v.object({
  attachments: v.array(collaborationAssetSummaryValidator),
  comment: collaborationCommentSummaryValidator,
  reactions: v.array(collaborationReactionSummaryValidator),
  references: v.array(collaborationReferenceSummaryValidator),
  revision: v.union(collaborationCommentRevisionSummaryValidator, v.null()),
});

export const collaborationFocusedCommentContextValidator = v.union(
  v.object({
    state: v.literal("revoked"),
  }),
  v.object({
    focusCommentId: v.id("buildCollaborationComments"),
    postId: v.id("buildCollaborationPosts"),
    rows: v.array(collaborationCommentRowValidator),
    state: v.literal("visible"),
  })
);

export const collaborationTagOptionValidator = v.object({
  entityId: v.string(),
  entityKind: buildCollaborationReferenceKindValidator,
  eyebrow: v.string(),
  href: v.string(),
  label: v.string(),
  searchTerms: v.array(v.string()),
  summary: v.string(),
});

export const collaborationDraftSummaryValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("buildCollaborationDrafts"),
  approvalOwnerWorkosUserId: v.optional(v.string()),
  bundleJson: v.string(),
  preparedByActorKind: v.optional(buildCollaborationActorKindValidator),
  preparedByAgent: v.boolean(),
  preparedByWorkosUserId: v.optional(v.string()),
  revision: v.number(),
  offlineCapturedAt: v.optional(v.number()),
  scheduleConflictReason: v.optional(v.string()),
  schedulePausedAt: v.optional(v.number()),
  scheduledFor: v.optional(v.number()),
  state: buildCollaborationDraftStateValidator,
  updatedAt: v.number(),
});

export const collaborationNotificationPreferenceValidator = v.object({
  channels: v.array(buildCollaborationNotificationChannelValidator),
  digestCadence: v.union(
    v.literal("daily"),
    v.literal("weekly"),
    v.literal("never")
  ),
  digestEnabled: v.boolean(),
  ordinaryMuted: v.boolean(),
  workosUserId: v.string(),
});

export const buildActionItemValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("buildActionItems"),
  assigneeWorkosUserId: v.optional(v.string()),
  assignedByWorkosUserId: v.optional(v.string()),
  assignmentRequestedAt: v.optional(v.number()),
  assignmentState: buildActionAssignmentStateValidator,
  blockedReason: v.optional(v.string()),
  brokerageId: v.id("brokerages"),
  buildId: v.id("activeBuilds"),
  cancellationReason: v.optional(v.string()),
  completedAt: v.optional(v.number()),
  completedByWorkosUserId: v.optional(v.string()),
  completionAcceptedByWorkosUserId: v.optional(v.string()),
  completionRequestedAt: v.optional(v.number()),
  completionRequestedByWorkosUserId: v.optional(v.string()),
  createdAt: v.number(),
  creatorRole: v.optional(buildCollaborationRoleValidator),
  creatorWorkosUserId: v.string(),
  currentRevision: v.number(),
  queueSortAt: v.optional(v.number()),
  descriptionPlainText: v.string(),
  descriptionTiptapJson: v.string(),
  dueAt: v.optional(v.number()),
  dueDateOverrideReason: v.optional(v.string()),
  dueDateOverriddenAt: v.optional(v.number()),
  dueDateOverriddenByWorkosUserId: v.optional(v.string()),
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
  deadlineProcessingFailure: v.optional(v.string()),
  deadlineProcessingFailedAt: v.optional(v.number()),
  deadlineProcessingState: v.optional(
    v.union(
      v.literal("pending"),
      v.literal("complete"),
      v.literal("quarantined")
    )
  ),
  dueDatePolicyKey: v.optional(v.string()),
  dueDateSource: v.optional(v.union(v.literal("manual"), v.literal("policy"))),
  organizationId: v.string(),
  originatingPostId: v.id("buildCollaborationPosts"),
  parentActionItemId: v.optional(v.id("buildActionItems")),
  previousActiveStatus: v.optional(buildActionItemStatusValidator),
  policyDueAt: v.optional(v.number()),
  policyObligationKey: v.optional(v.string()),
  primaryReferenceId: v.optional(v.string()),
  primaryReferenceKind: v.optional(buildCollaborationReferenceKindValidator),
  priority: buildActionItemPriorityValidator,
  requiresAcceptance: v.boolean(),
  status: buildActionItemStatusValidator,
  systemPresentation: v.optional(systemActionItemPresentationValidator),
  systemMode: v.optional(buildActionItemSystemModeValidator),
  canonicalBuildMilestoneId: v.optional(v.id("buildMilestones")),
  canonicalBuildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
  canonicalBindingRevision: v.optional(v.number()),
  title: v.string(),
  updatedAt: v.number(),
  unassignmentReason: v.optional(v.literal("participant_removed")),
  workKind: v.optional(buildActionItemWorkKindValidator),
});

export const buildActionItemChecklistValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("buildActionItemChecklistItems"),
  actionItemId: v.id("buildActionItems"),
  brokerageId: v.id("brokerages"),
  buildId: v.id("activeBuilds"),
  completed: v.boolean(),
  completedAt: v.optional(v.number()),
  completedByWorkosUserId: v.optional(v.string()),
  createdAt: v.number(),
  label: v.string(),
  order: v.number(),
  organizationId: v.string(),
  required: v.boolean(),
  updatedAt: v.number(),
});

export const buildActionItemRelationValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("buildActionItemRelations"),
  brokerageId: v.id("brokerages"),
  buildId: v.id("activeBuilds"),
  createdAt: v.number(),
  createdByWorkosUserId: v.string(),
  kind: buildActionRelationKindValidator,
  organizationId: v.string(),
  sourceActionItemId: v.id("buildActionItems"),
  status: v.union(v.literal("active"), v.literal("suspended")),
  suspensionReason: v.optional(v.string()),
  targetActionItemId: v.id("buildActionItems"),
  updatedAt: v.number(),
});

export const buildActionItemListRowValidator = v.object({
  checklist: v.array(buildActionItemChecklistValidator),
  item: buildActionItemValidator,
  relations: v.array(buildActionItemRelationValidator),
});
