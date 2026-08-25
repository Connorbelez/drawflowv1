import { defineTable } from "convex/server";
import { v } from "convex/values";

export const schemaTables = {
  calendarSavedViews: defineTable({
    brokerageId: v.id("brokerages"),
    createdAt: v.number(),
    filters: v.any(),
    isDefault: v.boolean(),
    label: v.string(),
    organizationId: v.string(),
    surface: v.union(v.literal("proposal"), v.literal("activeBuild")),
    timeframe: v.union(
      v.literal("day"),
      v.literal("week"),
      v.literal("month"),
      v.literal("quarter"),
      v.literal("agenda")
    ),
    updatedAt: v.number(),
    viewKey: v.string(),
    workosUserId: v.string(),
  })
    .index("by_user_surface", ["organizationId", "workosUserId", "surface"])
    .index("by_view_key", ["organizationId", "workosUserId", "viewKey"]),
  calendarTargetDates: defineTable({
    brokerageId: v.id("brokerages"),
    buildId: v.optional(v.id("activeBuilds")),
    createdAt: v.number(),
    dateKind: v.union(
      v.literal("evidenceDue"),
      v.literal("reviewTarget"),
      v.literal("adminDecisionTarget"),
      v.literal("drawReleaseTarget")
    ),
    drawKey: v.optional(v.string()),
    entityKey: v.string(),
    entityType: v.string(),
    milestoneKey: v.optional(v.string()),
    organizationId: v.string(),
    proposalId: v.optional(v.id("buildProposals")),
    reason: v.optional(v.string()),
    targetDate: v.string(),
    targetTime: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_proposal", ["proposalId"])
    .index("by_entity", ["entityType", "entityKey", "dateKind"]),
  calendarReminderEvents: defineTable({
    allDay: v.boolean(),
    assignedParticipants: v.array(
      v.object({
        builderProfileId: v.optional(v.id("builderProfiles")),
        contractorId: v.optional(v.id("contractorProfiles")),
        displayName: v.optional(v.string()),
        email: v.optional(v.string()),
        participantType: v.union(
          v.literal("workosUser"),
          v.literal("builderProfile"),
          v.literal("contractorProfile"),
          v.literal("externalEmail")
        ),
        role: v.optional(v.string()),
        workosUserId: v.optional(v.string()),
      })
    ),
    brokerageId: v.id("brokerages"),
    createdAt: v.number(),
    createdByWorkosUserId: v.string(),
    description: v.optional(v.string()),
    endsAt: v.optional(v.string()),
    externalEventId: v.optional(v.string()),
    externalProvider: v.optional(
      v.union(v.literal("google"), v.literal("outlook"), v.literal("ics"))
    ),
    location: v.optional(v.string()),
    buildId: v.optional(v.id("activeBuilds")),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    source: v.union(v.literal("drawflow"), v.literal("external")),
    startsAt: v.string(),
    status: v.union(v.literal("active"), v.literal("cancelled")),
    timezone: v.string(),
    title: v.string(),
    updatedAt: v.number(),
    updatedByWorkosUserId: v.string(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_build", ["buildId"])
    .index("by_created_by", ["organizationId", "createdByWorkosUserId"])
    .index("by_external", [
      "organizationId",
      "externalProvider",
      "externalEventId",
    ]),
  calendarSyncSubscriptions: defineTable({
    brokerageId: v.id("brokerages"),
    createdAt: v.number(),
    direction: v.union(v.literal("outbound"), v.literal("bidirectional")),
    filters: v.any(),
    organizationId: v.string(),
    provider: v.union(
      v.literal("ics"),
      v.literal("google"),
      v.literal("outlook")
    ),
    sourceBuildId: v.optional(v.id("activeBuilds")),
    sourceProposalId: v.optional(v.id("buildProposals")),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("revoked")
    ),
    subscriptionKey: v.string(),
    surface: v.union(v.literal("proposal"), v.literal("activeBuild")),
    updatedAt: v.number(),
    workosUserId: v.string(),
  })
    .index("by_subscription_key", ["subscriptionKey"])
    .index("by_user_surface", ["organizationId", "workosUserId", "surface"]),
  calendarSyncChanges: defineTable({
    brokerageId: v.id("brokerages"),
    changeKey: v.string(),
    createdAt: v.number(),
    externalEventId: v.optional(v.string()),
    organizationId: v.string(),
    payload: v.any(),
    provider: v.union(
      v.literal("ics"),
      v.literal("google"),
      v.literal("outlook")
    ),
    status: v.union(
      v.literal("pendingReview"),
      v.literal("applied"),
      v.literal("rejected")
    ),
    subscriptionId: v.optional(v.id("calendarSyncSubscriptions")),
    updatedAt: v.number(),
    workosUserId: v.string(),
  })
    .index("by_change_key", ["changeKey"])
    .index("by_status", ["organizationId", "status"]),
  scheduleRevisionRecords: defineTable({
    brokerageId: v.id("brokerages"),
    buildId: v.optional(v.id("activeBuilds")),
    createdAt: v.number(),
    entityKey: v.string(),
    entityType: v.string(),
    newState: v.any(),
    organizationId: v.string(),
    priorState: v.any(),
    proposalId: v.optional(v.id("buildProposals")),
    reason: v.string(),
    revisionType: v.string(),
    revisedByWorkosUserId: v.string(),
    warnings: v.array(v.string()),
  })
    .index("by_build", ["buildId"])
    .index("by_proposal", ["proposalId"])
    .index("by_entity", ["entityType", "entityKey"]),
  assistantThreads: defineTable({
    brokerageId: v.optional(v.id("brokerages")),
    componentThreadId: v.optional(v.string()),
    createdAt: v.number(),
    createdByWorkosUserId: v.string(),
    organizationId: v.string(),
    routeContext: v.any(),
    status: v.union(v.literal("active"), v.literal("archived")),
    title: v.string(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_actor", ["organizationId", "createdByWorkosUserId"]),
  assistantMessages: defineTable({
    content: v.string(),
    createdAt: v.number(),
    metadata: v.any(),
    organizationId: v.string(),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
      v.literal("tool")
    ),
    threadId: v.id("assistantThreads"),
  })
    .index("by_thread", ["threadId"])
    .index("by_organization", ["organizationId"]),
  assistantActionPlans: defineTable({
    acceptedClientRequestIds: v.array(v.string()),
    actorRoles: v.array(v.string()),
    brokerageId: v.optional(v.id("brokerages")),
    buildId: v.optional(v.id("activeBuilds")),
    commitOutcome: v.optional(v.any()),
    committedAt: v.optional(v.number()),
    createdAt: v.number(),
    createdByWorkosUserId: v.string(),
    items: v.array(v.any()),
    organizationId: v.string(),
    proposalId: v.optional(v.id("buildProposals")),
    rejectedClientRequestIds: v.array(v.string()),
    routeContext: v.any(),
    status: v.union(
      v.literal("preview"),
      v.literal("committed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    threadId: v.optional(v.id("assistantThreads")),
    updatedAt: v.number(),
    validationResults: v.array(v.any()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_thread", ["threadId"])
    .index("by_proposal", ["proposalId"])
    .index("by_build", ["buildId"]),
  assistantWorkflowRuns: defineTable({
    actorRoles: v.array(v.string()),
    brokerageId: v.optional(v.id("brokerages")),
    createdAt: v.number(),
    createdByWorkosUserId: v.string(),
    currentStepId: v.optional(v.string()),
    finalSummary: v.optional(v.string()),
    goal: v.string(),
    organizationId: v.string(),
    prompt: v.string(),
    routeContext: v.any(),
    status: v.union(
      v.literal("running"),
      v.literal("needs_input"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    steps: v.array(v.any()),
    threadId: v.optional(v.id("assistantThreads")),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_actor_status", [
      "organizationId",
      "createdByWorkosUserId",
      "status",
    ])
    .index("by_thread_status", ["threadId", "status"]),
  assistantTraceEvents: defineTable({
    aguiType: v.string(),
    createdAt: v.number(),
    label: v.string(),
    metadata: v.any(),
    organizationId: v.string(),
    planId: v.optional(v.id("assistantActionPlans")),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("needs_input"),
      v.literal("succeeded"),
      v.literal("failed")
    ),
    threadId: v.id("assistantThreads"),
  })
    .index("by_thread", ["threadId"])
    .index("by_plan", ["planId"])
    .index("by_organization", ["organizationId"]),
};
