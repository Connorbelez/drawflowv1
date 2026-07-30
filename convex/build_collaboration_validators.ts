import { v } from "convex/values";

export const buildCollaborationActorKindValidator = v.union(
  v.literal("human"),
  v.literal("agent"),
  v.literal("service"),
  v.literal("system"),
  v.literal("automation")
);

export const buildCollaborationRoleValidator = v.union(
  v.literal("admin"),
  v.literal("principle-broker"),
  v.literal("broker"),
  v.literal("builder"),
  v.literal("broker-staff"),
  v.literal("builder-staff"),
  v.literal("homeowner"),
  v.literal("contractor")
);

export const buildParticipantStatusValidator = v.union(
  v.literal("invited"),
  v.literal("active"),
  v.literal("removed")
);

export const buildCollaborationSourceValidator = v.union(
  v.literal("human"),
  v.literal("system"),
  v.literal("imported")
);

export const buildCollaborationPostTypeValidator = v.union(
  v.literal("update"),
  v.literal("question"),
  v.literal("decision"),
  v.literal("issue"),
  v.literal("announcement")
);

export const buildCollaborationThreadStateValidator = v.union(
  v.literal("open"),
  v.literal("resolved")
);

export const buildCollaborationContentStateValidator = v.union(
  v.literal("active"),
  v.literal("tombstoned"),
  v.literal("moderated")
);

export const buildCollaborationAudienceModeValidator = v.union(
  v.literal("author_tier_and_higher"),
  v.literal("build_wide"),
  v.literal("custom")
);

export const buildCollaborationReferenceKindValidator = v.union(
  v.literal("participant"),
  v.literal("milestone"),
  v.literal("submilestone"),
  v.literal("draw"),
  v.literal("evidencePackage"),
  v.literal("evidenceAsset"),
  v.literal("siteVisit"),
  v.literal("document"),
  v.literal("material"),
  v.literal("actionItem")
);

export const buildCollaborationOwnerKindValidator = v.union(
  v.literal("postRevision"),
  v.literal("commentRevision"),
  v.literal("actionItem"),
  v.literal("actionItemComment")
);

export const buildCollaborationReactionValidator = v.union(
  v.literal("acknowledged"),
  v.literal("agree"),
  v.literal("question")
);

export const buildCollaborationPinKindValidator = v.union(
  v.literal("build"),
  v.literal("personal"),
  v.literal("reply")
);

export const buildActionItemStatusValidator = v.union(
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("in_review"),
  v.literal("blocked"),
  v.literal("done"),
  v.literal("cancelled")
);

export const buildActionItemWorkKindValidator = v.union(
  v.literal("ordinary"),
  v.literal("approval"),
  v.literal("evidence"),
  v.literal("site_visit_remediation"),
  v.literal("draw_blocker")
);

export const buildActionItemPriorityValidator = v.union(
  v.literal("urgent"),
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
  v.literal("none")
);

export const buildActionAssignmentStateValidator = v.union(
  v.literal("assigned"),
  v.literal("requested"),
  v.literal("unassigned")
);

export const buildActionRelationKindValidator = v.union(
  v.literal("blocks"),
  v.literal("related"),
  v.literal("duplicate")
);

export const buildCollaborationAssetStateValidator = v.union(
  v.literal("staged"),
  v.literal("quarantined"),
  v.literal("available"),
  v.literal("rejected"),
  v.literal("superseded")
);

export const buildCollaborationAttachmentKindValidator = v.union(
  v.literal("collaborationAsset"),
  v.literal("document"),
  v.literal("evidenceAsset")
);

export const buildCollaborationDraftStateValidator = v.union(
  v.literal("active"),
  v.literal("scheduled"),
  v.literal("published"),
  v.literal("discarded")
);

export const buildCollaborationTenantStatusValidator = v.union(
  v.literal("disabled"),
  v.literal("migration_ready"),
  v.literal("active")
);

export const buildCollaborationApprovalStateValidator = v.union(
  v.literal("approved"),
  v.literal("invalidated"),
  v.literal("published"),
  v.literal("expired")
);

export const buildCollaborationNotificationChannelValidator = v.union(
  v.literal("in_app"),
  v.literal("email"),
  v.literal("push")
);
