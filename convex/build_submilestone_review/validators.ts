import { v } from "convex/values";

export const reviewDecisionDocValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("buildSubmilestoneReviewDecisions"),
  actorRoles: v.array(v.string()),
  actorWorkosUserId: v.string(),
  brokerageId: v.id("brokerages"),
  buildId: v.id("activeBuilds"),
  buildMilestoneId: v.id("buildMilestones"),
  buildSubmilestoneId: v.id("buildSubmilestones"),
  createdAt: v.number(),
  idempotencyKey: v.string(),
  kind: v.union(
    v.literal("recommendation"),
    v.literal("changes_requested"),
    v.literal("approved"),
    v.literal("site_visit_waived"),
    v.literal("retracted"),
  ),
  milestoneKey: v.string(),
  newState: v.string(),
  note: v.optional(v.string()),
  organizationId: v.string(),
  priorState: v.string(),
  reason: v.optional(v.string()),
  remediation: v.optional(v.array(v.string())),
  requirementId: v.optional(v.id("buildSubmilestoneSiteVisitRequirements")),
  reviewRound: v.number(),
  siteVisitId: v.optional(v.id("buildSiteVisits")),
  siteVisitRequired: v.optional(v.boolean()),
  submilestoneKey: v.string(),
  warnings: v.array(v.string()),
});

export const siteVisitRequirementDocValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("buildSubmilestoneSiteVisitRequirements"),
  brokerageId: v.id("brokerages"),
  buildId: v.id("activeBuilds"),
  buildMilestoneId: v.id("buildMilestones"),
  buildSubmilestoneId: v.id("buildSubmilestones"),
  createdAt: v.number(),
  evaluatedAt: v.number(),
  manualRequired: v.boolean(),
  manualSignals: v.array(v.string()),
  milestoneKey: v.string(),
  organizationId: v.string(),
  policyRequired: v.boolean(),
  policySignals: v.array(v.string()),
  required: v.boolean(),
  reviewRound: v.number(),
  riskRequired: v.boolean(),
  riskSignals: v.array(v.string()),
  siteVisitId: v.optional(v.id("buildSiteVisits")),
  status: v.union(
    v.literal("not_required"),
    v.literal("required"),
    v.literal("satisfied"),
    v.literal("waived"),
  ),
  submilestoneKey: v.string(),
  updatedAt: v.number(),
  waivedAt: v.optional(v.number()),
  waivedByRole: v.optional(v.string()),
  waivedByWorkosUserId: v.optional(v.string()),
  waiverReason: v.optional(v.string()),
});

export const siteVisitDocValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("buildSiteVisits"),
  brokerageId: v.id("brokerages"),
  buildId: v.id("activeBuilds"),
  buildMilestoneId: v.id("buildMilestones"),
  collaborationEventRevision: v.optional(v.number()),
  completedAt: v.optional(v.string()),
  createdAt: v.number(),
  evidencePackageId: v.optional(v.string()),
  locationAttempt: v.optional(v.any()),
  missingPrerequisites: v.optional(v.array(v.string())),
  milestoneKey: v.string(),
  note: v.optional(v.string()),
  organizationId: v.string(),
  prerequisiteException: v.optional(v.any()),
  recordNote: v.optional(v.string()),
  recordNoteFormat: v.optional(v.any()),
  requestedAt: v.string(),
  requestedDay: v.number(),
  requestedTime: v.optional(v.string()),
  scheduleIdempotencyKey: v.optional(v.string()),
  scheduleRequestFingerprint: v.optional(v.string()),
  scopeBoundAt: v.optional(v.number()),
  siteVisitGuidance: v.optional(v.any()),
  status: v.union(v.literal("requested"), v.literal("complete"), v.literal("cancelled")),
  submilestoneId: v.optional(v.id("buildSubmilestones")),
  submilestoneKeys: v.optional(v.array(v.string())),
  tokenConsumedAt: v.optional(v.number()),
  tokenExpiresAt: v.number(),
  tokenOpenedAt: v.optional(v.number()),
  updatedAt: v.number(),
  url: v.string(),
  visitId: v.string(),
  workOrderId: v.optional(v.string()),
});

export const reviewResultValidator = v.object({
  child: v.object({
    evidenceReviewState: v.union(
      v.literal("not_ready"),
      v.literal("in_review"),
      v.literal("changes_requested"),
      v.literal("approved"),
    ),
    reviewDecisionState: v.union(
      v.literal("in_review"),
      v.literal("changes_requested"),
      v.literal("approved"),
      v.literal("reopened"),
    ),
    reviewRevision: v.number(),
    reviewRound: v.number(),
    status: v.union(v.literal("planned"), v.literal("in_progress"), v.literal("complete")),
  }),
  decisions: v.array(reviewDecisionDocValidator),
  parent: v.object({
    approvedChildCount: v.number(),
    childCount: v.number(),
    readyForApproval: v.boolean(),
    reviewDecisionState: v.union(
      v.literal("in_review"),
      v.literal("ready_for_approval"),
      v.literal("approved"),
      v.literal("reopened"),
    ),
    reviewRevision: v.number(),
  }),
  siteVisit: v.object({
    currentVisit: v.union(siteVisitDocValidator, v.null()),
    requirement: v.union(siteVisitRequirementDocValidator, v.null()),
  }),
});

export const recommendationResultValidator = v.object({
  decisionId: v.id("buildSubmilestoneReviewDecisions"),
  replayed: v.boolean(),
  requirement: v.union(siteVisitRequirementDocValidator, v.null()),
  reviewRound: v.number(),
});

export const changesRequestedResultValidator = v.object({
  decisionId: v.id("buildSubmilestoneReviewDecisions"),
  replayed: v.boolean(),
  reviewRound: v.number(),
  status: v.literal("changes_requested"),
});

export const siteVisitWaivedResultValidator = v.object({
  decisionId: v.id("buildSubmilestoneReviewDecisions"),
  replayed: v.boolean(),
  requirementId: v.union(
    v.id("buildSubmilestoneSiteVisitRequirements"),
    v.null(),
  ),
  status: v.literal("waived"),
});

export const childApprovedResultValidator = v.object({
  decisionId: v.id("buildSubmilestoneReviewDecisions"),
  parentReadyForApproval: v.boolean(),
  replayed: v.boolean(),
  status: v.literal("approved"),
});

export const childReopenedResultValidator = v.object({
  decisionId: v.id("buildSubmilestoneReviewDecisions"),
  replayed: v.boolean(),
  status: v.literal("reopened"),
});

export const milestoneApprovedResultValidator = v.object({
  decisionId: v.id("buildMilestoneReviewDecisions"),
  replayed: v.boolean(),
  status: v.literal("approved"),
});

export const milestoneReopenedResultValidator = v.object({
  decisionId: v.id("buildMilestoneReviewDecisions"),
  replayed: v.boolean(),
  status: v.literal("reopened"),
});
