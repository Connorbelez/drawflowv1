import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import {
  buildActionAssignmentStateValidator,
  buildActionItemPriorityValidator,
  buildActionItemStatusValidator,
  buildActionItemWorkKindValidator,
  buildActionRelationKindValidator,
  buildCollaborationActorKindValidator,
  buildCollaborationAudienceModeValidator,
  buildCollaborationDraftStateValidator,
  buildCollaborationNotificationChannelValidator,
  buildCollaborationPostTypeValidator,
  buildCollaborationReactionValidator,
  buildCollaborationReferenceKindValidator,
  buildCollaborationRoleValidator,
  buildCollaborationSourceValidator,
} from "./build_collaboration_validators";

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
  currentRevision: v.number(),
  priority: buildActionItemPriorityValidator,
  status: buildActionItemStatusValidator,
  title: v.string(),
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

export const collaborationReceiptSummaryValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("buildCollaborationReceipts"),
  lastViewedAt: v.number(),
  latestRevisionViewed: v.number(),
  viewerRole: buildCollaborationRoleValidator,
  workosUserId: v.string(),
});

export const collaborationFeedEntryValidator = v.union(
  v.object({
    kind: v.literal("restricted"),
    placeholderKey: v.string(),
  }),
  v.object({
    kind: v.literal("unavailable"),
    placeholderKey: v.string(),
  }),
  v.object({
    acknowledgement: v.object({
      acknowledged: v.boolean(),
      dueAt: v.optional(v.number()),
      required: v.boolean(),
    }),
    actionItems: v.array(collaborationActionItemSummaryValidator),
    following: v.boolean(),
    kind: v.literal("post"),
    pins: v.array(collaborationPinSummaryValidator),
    post: collaborationPostSummaryValidator,
    reactions: v.array(collaborationReactionSummaryValidator),
    receipts: v.array(collaborationReceiptSummaryValidator),
    references: v.array(collaborationReferenceSummaryValidator),
    revision: collaborationPostRevisionSummaryValidator,
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
  descriptionPlainText: v.string(),
  descriptionTiptapJson: v.string(),
  dueAt: v.optional(v.number()),
  organizationId: v.string(),
  originatingPostId: v.id("buildCollaborationPosts"),
  parentActionItemId: v.optional(v.id("buildActionItems")),
  previousActiveStatus: v.optional(buildActionItemStatusValidator),
  primaryReferenceId: v.optional(v.string()),
  primaryReferenceKind: v.optional(buildCollaborationReferenceKindValidator),
  priority: buildActionItemPriorityValidator,
  requiresAcceptance: v.boolean(),
  status: buildActionItemStatusValidator,
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
