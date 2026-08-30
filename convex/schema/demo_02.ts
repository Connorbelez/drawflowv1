import { defineTable } from "convex/server";
import { v } from "convex/values";
import * as schemaValidators from "./validators";

export const schemaTables = {
  demo_timelinePlanSnapshotMilestones: defineTable({
    budgetCents: v.number(),
    buildId: v.id("demo_builds"),
    createdAt: v.number(),
    dayEnd: v.number(),
    dayStart: v.number(),
    dependencyKeys: v.array(v.string()),
    drawAvailabilityCents: v.optional(v.number()),
    drawKey: v.optional(v.string()),
    durationDays: v.number(),
    evidenceState: v.string(),
    icon: schemaValidators.demoTimelineIconValidator,
    included: v.boolean(),
    lane: v.optional(v.number()),
    markerLabel: v.optional(v.string()),
    milestoneKey: v.string(),
    name: v.string(),
    order: v.number(),
    orgKey: v.string(),
    planId: v.id("demo_timelinePlans"),
    policyState: v.string(),
    snapshotId: v.id("demo_timelinePlanSnapshots"),
    sourceTimelineMilestoneId: v.id("demo_timelineMilestones"),
    status: schemaValidators.demoTimelineStatusValidator,
    submilestoneSnapshot: v.array(
      schemaValidators.demoTimelineSubmilestoneSnapshotValidator
    ),
    tone: schemaValidators.demoTimelineToneValidator,
    type: v.string(),
    x: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_snapshot", ["snapshotId"])
    .index("by_build", ["buildId", "sourceTimelineMilestoneId"]),
  demo_timelinePlanSnapshotDraws: defineTable({
    amountCents: v.number(),
    buildId: v.id("demo_builds"),
    createdAt: v.number(),
    customDate: v.boolean(),
    drawKey: v.string(),
    itemMilestoneKey: v.optional(v.string()),
    label: v.string(),
    order: v.number(),
    orgKey: v.string(),
    planId: v.id("demo_timelinePlans"),
    requestNote: v.optional(v.string()),
    requestReviewNote: v.optional(v.string()),
    requestStatus: schemaValidators.demoTimelineDrawStatusValidator,
    reviewedAt: v.optional(v.string()),
    requestedAt: v.optional(v.string()),
    snapshotId: v.id("demo_timelinePlanSnapshots"),
    sourceTimelineDrawId: v.id("demo_timelineDraws"),
    x: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_snapshot", ["snapshotId"])
    .index("by_build", ["buildId", "sourceTimelineDrawId"]),
  demo_timelinePlanSnapshotCapitalEvents: defineTable({
    amountCents: v.number(),
    buildId: v.id("demo_builds"),
    capitalEventKey: v.string(),
    createdAt: v.number(),
    eventKind: v.optional(
      schemaValidators.demoTimelineCapitalEventKindValidator
    ),
    label: v.string(),
    order: v.number(),
    orgKey: v.string(),
    planId: v.id("demo_timelinePlans"),
    snapshotId: v.id("demo_timelinePlanSnapshots"),
    sourceTimelineCapitalEventId: v.id("demo_timelineCapitalEvents"),
    x: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_snapshot", ["snapshotId"])
    .index("by_build", ["buildId", "sourceTimelineCapitalEventId"]),
  demo_timelineMilestones: defineTable({
    budgetCents: v.number(),
    completedAt: v.optional(v.number()),
    completionClaim: v.optional(v.any()),
    createdAt: v.number(),
    dayEnd: v.number(),
    dayStart: v.number(),
    dependencyKeys: v.array(v.string()),
    drawAvailabilityCents: v.optional(v.number()),
    drawKey: v.optional(v.string()),
    durationDays: v.number(),
    evidenceState: v.string(),
    icon: schemaValidators.demoTimelineIconValidator,
    included: v.boolean(),
    lane: v.optional(v.number()),
    markerLabel: v.optional(v.string()),
    milestoneKey: v.string(),
    name: v.string(),
    order: v.number(),
    planId: v.id("demo_timelinePlans"),
    policyState: v.string(),
    status: schemaValidators.demoTimelineStatusValidator,
    submilestoneSnapshot: v.array(
      schemaValidators.demoTimelineSubmilestoneSnapshotValidator
    ),
    tone: schemaValidators.demoTimelineToneValidator,
    type: v.string(),
    updatedAt: v.number(),
    x: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_plan_and_key", ["planId", "milestoneKey"])
    .index("by_plan_and_order", ["planId", "order"]),
  demo_timelineMilestoneGuidanceItems: defineTable({
    createdAt: v.number(),
    kind: schemaValidators.demoSiteVisitGuidanceKindValidator,
    milestoneKey: v.string(),
    order: v.number(),
    planId: v.id("demo_timelinePlans"),
    text: v.string(),
    updatedAt: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_plan_milestone", ["planId", "milestoneKey"]),
  demo_timelineDraws: defineTable({
    amountCents: v.number(),
    createdAt: v.number(),
    customDate: v.boolean(),
    drawKey: v.string(),
    itemMilestoneKey: v.optional(v.string()),
    label: v.string(),
    order: v.number(),
    planId: v.id("demo_timelinePlans"),
    requestNote: v.optional(v.string()),
    requestReviewNote: v.optional(v.string()),
    requestStatus: schemaValidators.demoTimelineDrawStatusValidator,
    reviewedAt: v.optional(v.string()),
    requestedAt: v.optional(v.string()),
    updatedAt: v.number(),
    x: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_plan_and_key", ["planId", "drawKey"])
    .index("by_plan_and_order", ["planId", "order"]),
  demo_timelineCapitalEvents: defineTable({
    amountCents: v.number(),
    capitalEventKey: v.string(),
    createdAt: v.number(),
    eventKind: v.optional(
      schemaValidators.demoTimelineCapitalEventKindValidator
    ),
    label: v.string(),
    order: v.number(),
    planId: v.id("demo_timelinePlans"),
    updatedAt: v.number(),
    x: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_plan_and_key", ["planId", "capitalEventKey"])
    .index("by_plan_and_order", ["planId", "order"]),
  demo_timelineModificationRequests: defineTable({
    actorPersona: v.string(),
    buildId: v.id("demo_builds"),
    createdAt: v.number(),
    milestoneKey: v.optional(v.string()),
    orgKey: v.string(),
    planId: v.id("demo_timelinePlans"),
    priorState: v.optional(v.any()),
    reason: v.optional(v.string()),
    requestedPayload: v.any(),
    requestType: schemaValidators.demoTimelineModificationRequestTypeValidator,
    reviewedAt: v.optional(v.number()),
    reviewerPersona: v.optional(v.string()),
    reviewNote: v.optional(v.string()),
    status: schemaValidators.demoTimelineModificationRequestStatusValidator,
    updatedAt: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_plan_status", ["planId", "status"])
    .index("by_status_updated", ["status", "updatedAt"]),
  demo_timelineEvidenceAssets: defineTable({
    createdAt: v.number(),
    evidenceKey: v.string(),
    fileName: v.string(),
    label: v.string(),
    locationVerified: v.boolean(),
    milestoneKey: v.string(),
    mimeType: v.string(),
    planId: v.id("demo_timelinePlans"),
    sizeBytes: v.number(),
    source: v.string(),
    storageId: v.optional(v.string()),
    tag: v.string(),
    updatedAt: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_plan_and_milestone", ["planId", "milestoneKey"])
    .index("by_plan_and_key", ["planId", "evidenceKey"]),
  demo_timelineSiteVisitLinks: defineTable({
    createdAt: v.number(),
    milestoneKey: v.string(),
    planId: v.id("demo_timelinePlans"),
    siteVisitId: v.id("demo_siteVisits"),
    status: schemaValidators.demoTimelineSiteVisitStatusValidator,
    supersededAt: v.optional(v.number()),
    tokenExpiresAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_plan_and_milestone", ["planId", "milestoneKey"])
    .index("by_site_visit", ["siteVisitId"]),
  demo_timelineEvents: defineTable({
    actorPersona: v.string(),
    command: v.string(),
    createdAt: v.number(),
    entityKey: v.optional(v.string()),
    entityType: v.string(),
    eventType: v.string(),
    newState: v.optional(v.string()),
    planId: v.id("demo_timelinePlans"),
    priorState: v.optional(v.string()),
    reason: v.optional(v.string()),
    requirementIds: v.array(v.string()),
    traceIds: v.array(v.string()),
    validationIds: v.array(v.string()),
    warnings: v.array(v.string()),
  })
    .index("by_plan", ["planId"])
    .index("by_plan_and_entity", ["planId", "entityType", "entityKey"]),
  demo_proposalShortLinks: defineTable({
    createdAt: v.number(),
    lastResolvedAt: v.optional(v.number()),
    planId: v.id("demo_timelinePlans"),
    slug: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("disabled"),
      v.literal("expired")
    ),
    updatedAt: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_slug", ["slug"]),
  demo_backofficeProposalCards: defineTable({
    buildId: v.id("demo_builds"),
    column: v.string(),
    createdAt: v.number(),
    href: v.string(),
    planId: v.id("demo_timelinePlans"),
    priority: v.string(),
    proposalSlug: v.string(),
    sortAt: v.number(),
    status: v.string(),
    subtitle: v.string(),
    tag: v.literal("demo"),
    title: v.string(),
    totalBudgetCents: v.number(),
    updatedAt: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_column_sort", ["column", "sortAt"])
    .index("by_updated", ["updatedAt"]),
  demo_capitalEvents: defineTable({
    amountCents: v.number(),
    buildId: v.id("demo_builds"),
    capitalEventKey: v.string(),
    eventDate: v.string(),
    label: v.string(),
    order: v.number(),
    orgKey: v.optional(v.string()),
    scenario: v.string(),
    sourceTimelineCapitalEventId: v.optional(
      v.id("demo_timelineCapitalEvents")
    ),
    updatedAt: v.number(),
  })
    .index("by_build_order", ["buildId", "order"])
    .index("by_build_and_source_timeline_capital_event", [
      "buildId",
      "sourceTimelineCapitalEventId",
    ])
    .index("by_scenario", ["scenario"]),
  demo_contractors: defineTable({
    orgKey: v.string(),
    scenario: v.string(),
    name: v.string(),
    kind: v.union(v.literal("company"), v.literal("individual")),
    hourlyRateCents: v.number(),
    city: v.string(),
    skills: v.array(v.string()),
    trades: v.array(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgKey"])
    .index("by_scenario", ["scenario"]),
  demo_buildContractors: defineTable({
    buildId: v.id("demo_builds"),
    contractorId: v.id("demo_contractors"),
    scenario: v.string(),
    role: v.string(),
    createdAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_scenario", ["scenario"])
    .index("by_build_contractor", ["buildId", "contractorId"]),
  demo_milestoneContractors: defineTable({
    buildId: v.id("demo_builds"),
    milestoneKey: v.string(),
    contractorId: v.id("demo_contractors"),
    scenario: v.string(),
    role: v.string(),
    createdAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_milestone", ["buildId", "milestoneKey"])
    .index("by_scenario", ["scenario"]),
  demo_buildNotes: defineTable({
    buildId: v.id("demo_builds"),
    scenario: v.string(),
    visibility: v.union(v.literal("internal"), v.literal("public")),
    body: v.string(),
    authorPersona: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_visibility", ["buildId", "visibility"])
    .index("by_scenario", ["scenario"]),
  demo_buildDocuments: defineTable({
    buildId: v.id("demo_builds"),
    scenario: v.string(),
    name: v.string(),
    kind: v.string(),
    sizeBytes: v.number(),
    uploaderPersona: v.string(),
    url: v.optional(v.string()),
    storageId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_scenario", ["scenario"]),
  demo_milestoneSubmilestones: defineTable({
    buildId: v.id("demo_builds"),
    description: v.optional(v.string()),
    milestoneKey: v.string(),
    key: v.string(),
    name: v.string(),
    order: v.number(),
    status: v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("done")
    ),
    budgetCents: v.optional(v.number()),
    durationDays: v.optional(v.number()),
    scenario: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_milestone", ["buildId", "milestoneKey"])
    .index("by_scenario", ["scenario"]),
};
