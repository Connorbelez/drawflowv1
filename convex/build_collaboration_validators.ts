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
  v.literal("pending_activation"),
  v.literal("active"),
  v.literal("removed")
);

export const buildCollaborationSourceValidator = v.union(
  v.literal("human"),
  v.literal("system"),
  v.literal("imported")
);

/** Canonical domain orchestration post kinds. */
export const buildCollaborationSystemPostKindValidator = v.union(
  v.literal("milestone"),
  v.literal("draw")
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

/** Generated cards remain Build Collaboration Action Items, but their
 * execution binding is owned by the canonical domain aggregate. */
export const buildActionItemSystemModeValidator = v.union(
  v.literal("generated_milestone_submilestone")
);

/** Planning identity is separate from canonical execution lifecycle. */
export const buildPlanningStateValidator = v.union(
  v.literal("active"),
  v.literal("superseded")
);

export const buildPlanningRevisionKindValidator = v.union(
  v.literal("activation"),
  v.literal("approved")
);

export const buildPlanningDiffCategoryValidator = v.union(
  v.literal("scope"),
  v.literal("dates"),
  v.literal("dependencies"),
  v.literal("allocations"),
  v.literal("evidence_requirements")
);

export const buildPlanningDiffChangeTypeValidator = v.union(
  v.literal("added"),
  v.literal("removed"),
  v.literal("changed")
);

export const buildPlanningEntityValidator = v.object({
  canonicalId: v.optional(v.string()),
  entityKey: v.string(),
  entityType: v.string(),
  planningState: buildPlanningStateValidator,
  snapshot: v.any(),
});

export const buildPlanningSnapshotValidator = v.object({
  allocations: v.array(buildPlanningEntityValidator),
  budgets: v.array(buildPlanningEntityValidator),
  buildId: v.string(),
  draws: v.array(buildPlanningEntityValidator),
  evidenceRequirements: v.array(buildPlanningEntityValidator),
  milestones: v.array(buildPlanningEntityValidator),
  submilestones: v.array(buildPlanningEntityValidator),
});

export const buildPlanningRevisionDiffValidator = v.object({
  category: buildPlanningDiffCategoryValidator,
  changeType: buildPlanningDiffChangeTypeValidator,
  entityKey: v.string(),
  entityType: v.string(),
  field: v.string(),
  nextValue: v.optional(v.any()),
  priorValue: v.optional(v.any()),
  revision: v.number(),
});

export const buildPlanningRevisionSummaryValidator = v.object({
  actorRoles: v.array(v.string()),
  actorWorkosUserId: v.string(),
  approvedAt: v.number(),
  diffCount: v.number(),
  kind: buildPlanningRevisionKindValidator,
  reason: v.string(),
  revision: v.number(),
  sourceCommand: v.string(),
  summary: v.string(),
});

export const buildPlanningReconciliationValidator = v.object({
  activation: v.union(
    v.null(),
    v.object({
      actorRoles: v.array(v.string()),
      actorWorkosUserId: v.string(),
      approvedAt: v.number(),
      revision: v.number(),
      snapshot: buildPlanningSnapshotValidator,
    })
  ),
  current: v.object({
    revision: v.number(),
    snapshot: buildPlanningSnapshotValidator,
  }),
  diffs: v.array(buildPlanningRevisionDiffValidator),
  materializationPending: v.boolean(),
  revisions: v.array(buildPlanningRevisionSummaryValidator),
});

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

export const buildCollaborationAssetScanStateValidator = v.union(
  v.literal("pending"),
  v.literal("clean"),
  v.literal("rejected"),
  v.literal("error")
);

export const buildCollaborationAssetStagingContextValidator = v.union(
  v.literal("composer"),
  v.literal("draft"),
  v.literal("post"),
  v.literal("actionItem")
);

export const buildCollaborationAssetStagingStateValidator = v.union(
  v.literal("open"),
  v.literal("finalized"),
  v.literal("consumed"),
  v.literal("abandoned")
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
  v.literal("paused"),
  v.literal("published"),
  v.literal("expired")
);

export const buildCollaborationNotificationChannelValidator = v.union(
  v.literal("in_app"),
  v.literal("email"),
  v.literal("push")
);

export const buildCollaborationNotificationKindValidator = v.union(
  v.literal("ordinary_activity"),
  v.literal("direct_mention"),
  v.literal("assignment"),
  v.literal("assignment_request"),
  v.literal("followed_reply"),
  v.literal("required_approval"),
  v.literal("blocker"),
  v.literal("build_wide_pin"),
  v.literal("acknowledgement_required"),
  v.literal("acknowledgement_received"),
  v.literal("reminder"),
  v.literal("escalation")
);
