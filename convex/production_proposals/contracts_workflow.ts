/**
 * Production proposals contracts workflow bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import {
  productionSettingsSiteVisitGuidanceInput,
  productionSettingsSubmilestoneFieldGuidanceInput,
  submilestoneInput,
} from "./contracts_foundation.js";

export const ELIGIBLE_LENDER_ORGANIZATION_LIMIT = 100;

export const PROPOSAL_LENDER_ASSIGNMENT_HISTORY_LIMIT = 50;

export const MAX_PROPOSAL_MILESTONES = 500;

export const LENDER_ASSIGNMENT_ARCHIVE_BATCH_SIZE = 25;

export const proposalDraftDrawInput = v.object({
  amountCents: v.number(),
  customDate: v.optional(v.boolean()),
  drawKey: v.string(),
  label: v.string(),
  milestoneKey: v.optional(v.string()),
  order: v.optional(v.number()),
  timingDay: v.number(),
});

export const productionSelectedPlanKeyInput = v.union(
  v.literal("cheapestFeasible"),
  v.literal("fastest"),
  v.literal("capitalConstrained")
);

export const productionSelectedPlanMetricsInput = v.object({
  drawCount: v.number(),
  drawFeesCents: v.number(),
  interestCostCents: v.number(),
  minimumCashReserveCents: v.number(),
  projectedDurationDays: v.number(),
  requiredWorkingCapitalCents: v.optional(v.number()),
  startingCashCents: v.number(),
  totalCostCents: v.number(),
  totalDrawAmountCents: v.number(),
});

const productionSettingsSubmilestoneInput = v.object({
  description: v.string(),
  durationDays: v.number(),
  fieldGuidance: v.optional(productionSettingsSubmilestoneFieldGuidanceInput),
  name: v.string(),
  order: v.number(),
  percentageBps: v.number(),
  scopeOfWorkTiptapJson: v.optional(v.string()),
  submilestoneKey: v.string(),
});

export const productionSettingsMilestoneInput = v.object({
  dependencyKeys: v.array(v.string()),
  durationDays: v.number(),
  icon: v.string(),
  included: v.boolean(),
  milestoneKey: v.string(),
  name: v.string(),
  order: v.number(),
  percentageBps: v.number(),
  siteVisitGuidance: v.optional(productionSettingsSiteVisitGuidanceInput),
  submilestones: v.array(productionSettingsSubmilestoneInput),
  type: v.string(),
});

const productionSettingsScenarioDrawInput = v.object({
  amountBps: v.number(),
  drawKey: v.string(),
  label: v.string(),
  order: v.number(),
  reviewNote: v.string(),
  timingDay: v.number(),
});

export const productionSettingsScenarioInput = v.object({
  description: v.string(),
  draws: v.array(productionSettingsScenarioDrawInput),
  isActive: v.boolean(),
  isDefault: v.boolean(),
  name: v.string(),
  scenarioKey: v.string(),
  sortOrder: v.number(),
});

export const evidenceAssetInput = v.object({
  contractorIds: v.optional(v.array(v.id("contractorProfiles"))),
  evidenceKey: v.string(),
  fileName: v.string(),
  label: v.string(),
  locationVerified: v.optional(v.boolean()),
  milestoneKey: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  source: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  submilestoneKey: v.optional(v.string()),
  tag: v.string(),
});

export const contractorKindInput = v.union(
  v.literal("company"),
  v.literal("individual")
);

export const contractorPayRateUnitInput = v.union(
  v.literal("hour"),
  v.literal("day"),
  v.literal("fixed")
);

const operationsHandoffAcknowledgementStateValidator = v.union(
  v.literal("pending_decision"),
  v.literal("returned"),
  v.literal("acknowledged")
);

export const operationsHandoffReturnDecisionValidator = v.union(
  v.literal("continue"),
  v.literal("reroute"),
  v.literal("close")
);

export const operationsHandoffProjectionValidator = v.object({
  _id: v.id("operationsQueueHandoffs"),
  acknowledgementState: operationsHandoffAcknowledgementStateValidator,
  acknowledgedAt: v.optional(v.number()),
  acknowledgedByWorkosUserId: v.optional(v.string()),
  createdAt: v.number(),
  decisionPreview: v.string(),
  escalatedByWorkosUserId: v.string(),
  escalationReason: v.string(),
  evidenceSummary: v.string(),
  followUpAssignment: v.optional(v.string()),
  queueItemId: v.string(),
  recommendation: v.string(),
  requiredAction: v.string(),
  returnDecision: v.optional(operationsHandoffReturnDecisionValidator),
  returnedAt: v.optional(v.number()),
  returnedByWorkosUserId: v.optional(v.string()),
  returnReason: v.optional(v.string()),
  targetHref: v.string(),
  targetLabel: v.string(),
  targetRecordId: v.string(),
  targetType: v.string(),
  updatedAt: v.number(),
  warnings: v.array(v.string()),
});

const integrationEndpointStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("disabled"),
  v.literal("revoked")
);

const integrationDeliveryStatusValidator = v.union(
  v.literal("pending"),
  v.literal("delivered"),
  v.literal("failed"),
  v.literal("retry_pending")
);

export const integrationEndpointProjectionValidator = v.object({
  _id: v.id("integrationEndpoints"),
  activatedAt: v.optional(v.number()),
  createdAt: v.number(),
  disabledAt: v.optional(v.number()),
  endpointUrl: v.string(),
  eventTypes: v.array(v.string()),
  name: v.string(),
  payloadVersion: v.string(),
  revokedAt: v.optional(v.number()),
  secretFingerprint: v.string(),
  secretVersion: v.number(),
  status: integrationEndpointStatusValidator,
  updatedAt: v.number(),
  validatedAt: v.optional(v.number()),
});

export const integrationDeliveryProjectionValidator = v.object({
  _id: v.id("integrationDeliveryAttempts"),
  attemptNumber: v.number(),
  attemptedAt: v.number(),
  completedAt: v.optional(v.number()),
  deliveryId: v.string(),
  endpointId: v.id("integrationEndpoints"),
  endpointName: v.string(),
  endpointUrl: v.string(),
  eventId: v.string(),
  eventType: v.string(),
  nextRetryAt: v.optional(v.number()),
  payloadVersion: v.string(),
  responseCode: v.optional(v.number()),
  retryOfAttemptId: v.optional(v.id("integrationDeliveryAttempts")),
  safeError: v.optional(v.string()),
  status: integrationDeliveryStatusValidator,
  updatedAt: v.number(),
});

export const contractorCapabilityInput = v.object({
  capabilityKey: v.string(),
  label: v.string(),
  milestoneArchetypeKey: v.optional(v.string()),
  notes: v.optional(v.string()),
  trade: v.optional(v.string()),
});

export const contractorEquipmentInput = v.object({
  equipmentKey: v.string(),
  name: v.string(),
  notes: v.optional(v.string()),
  quantity: v.number(),
});

export const contractorAvailabilityWindowInput = v.object({
  dayOfWeek: v.number(),
  effectiveEndDate: v.optional(v.string()),
  effectiveStartDate: v.optional(v.string()),
  endMinute: v.number(),
  startMinute: v.number(),
  timezone: v.string(),
});

export const contractorProfileCreateInput = {
  accountWorkosUserId: v.optional(v.string()),
  availabilityWindows: v.optional(v.array(contractorAvailabilityWindowInput)),
  capabilities: v.optional(v.array(contractorCapabilityInput)),
  city: v.optional(v.string()),
  defaultPayRateCents: v.optional(v.number()),
  defaultPayRateUnit: v.optional(contractorPayRateUnitInput),
  email: v.optional(v.string()),
  equipment: v.optional(v.array(contractorEquipmentInput)),
  kind: v.optional(contractorKindInput),
  name: v.string(),
  phone: v.optional(v.string()),
  trades: v.array(v.string()),
};

export const contractorQualityRatingSourceInput = v.union(
  v.literal("builder_evidence"),
  v.literal("site_visit"),
  v.literal("backoffice")
);

export const contractorQualityRatingInput = v.object({
  contractorId: v.id("contractorProfiles"),
  milestoneKey: v.optional(v.string()),
  note: v.optional(v.string()),
  rating: v.number(),
  sourceEvidenceKey: v.optional(v.string()),
  sourceVisitId: v.optional(v.string()),
  submilestoneKey: v.optional(v.string()),
});

export const contractorIdentityLinkStatusInput = v.union(
  v.literal("suggested"),
  v.literal("verified"),
  v.literal("rejected")
);

export const activeBuildNoteVisibility = v.union(
  v.literal("internal"),
  v.literal("public")
);

export const timelineCapitalEventKind = v.union(
  v.literal("cost"),
  v.literal("cashInfusion"),
  v.literal("homeEquityTakeout")
);

export const activeTimelineCapitalEventKind = v.union(
  v.literal("cost"),
  v.literal("cashInfusion")
);

export const timelineModificationRequestType = v.union(
  v.literal("createMilestone"),
  v.literal("deleteMilestone"),
  v.literal("updateMilestoneBudget")
);

export const activeBuildFacilityChangeRequestType = v.union(
  v.literal("principalIncrease"),
  v.literal("paybackExtension")
);

export const productionTimelineMilestoneInput = v.object({
  budgetCents: v.number(),
  dayEnd: v.number(),
  dayStart: v.number(),
  dependencyKeys: v.optional(v.array(v.string())),
  drawAvailabilityCents: v.optional(v.number()),
  drawKey: v.optional(v.string()),
  durationDays: v.number(),
  evidenceState: v.string(),
  icon: v.optional(v.string()),
  lane: v.optional(v.number()),
  markerLabel: v.optional(v.string()),
  milestoneKey: v.string(),
  name: v.string(),
  order: v.number(),
  policyState: v.string(),
  status: v.optional(v.string()),
  submilestones: v.optional(v.array(submilestoneInput)),
  tone: v.optional(v.string()),
  x: v.number(),
});

export const activeBuildSubmilestoneInput = v.object({
  budgetCents: v.optional(v.number()),
  durationDays: v.optional(v.number()),
  key: v.string(),
  name: v.string(),
  order: v.number(),
  startDay: v.optional(v.number()),
});

export const activeBuildTimelineMilestoneInput = v.object({
  budgetCents: v.number(),
  dayEnd: v.number(),
  dayStart: v.number(),
  dependencyKeys: v.optional(v.array(v.string())),
  drawAvailabilityCents: v.optional(v.number()),
  durationDays: v.number(),
  evidenceState: v.string(),
  icon: v.optional(v.string()),
  lane: v.optional(v.number()),
  markerLabel: v.optional(v.string()),
  milestoneKey: v.string(),
  name: v.string(),
  order: v.number(),
  policyState: v.string(),
  status: v.optional(v.string()),
  submilestones: v.optional(v.array(activeBuildSubmilestoneInput)),
  tone: v.optional(v.string()),
  x: v.number(),
});

const productionCostItemType = v.union(
  v.literal("material"),
  v.literal("equipment")
);

const productionCostItemBudgetTreatment = v.union(
  v.literal("logOnly"),
  v.literal("add"),
  v.literal("maintain")
);

const builderStaffPermissionResourceInput = v.union(
  v.literal("milestone"),
  v.literal("submilestone"),
  v.literal("draw"),
  v.literal("evidence"),
  v.literal("contractor"),
  v.literal("material"),
  v.literal("capitalEvent"),
  v.literal("reminder")
);

export const builderStaffPermissionGrantInput = v.object({
  canCreate: v.boolean(),
  canView: v.boolean(),
  canUpdate: v.boolean(),
  canDelete: v.boolean(),
  resourceType: builderStaffPermissionResourceInput,
});

export const builderStaffProvisionActorInput = v.object({
  organizationId: v.optional(v.string()),
  roles: v.array(v.string()),
  subject: v.string(),
});

export const builderStaffProvisionResult = v.object({
  provisioning: v.object({
    adapter: v.string(),
    invitationId: v.optional(v.string()),
    membershipId: v.string(),
    operation: v.optional(v.string()),
    status: v.string(),
    sync: v.string(),
    userId: v.string(),
  }),
  staffWorkosUserId: v.string(),
  workosMembershipId: v.string(),
});

export const productionCostItemCreateInput = {
  budgetSubmilestoneKey: v.optional(v.union(v.string(), v.null())),
  budgetTreatment: v.optional(productionCostItemBudgetTreatment),
  costCents: v.number(),
  description: v.optional(v.string()),
  deliveryEndDay: v.optional(v.number()),
  deliveryInstructions: v.optional(v.string()),
  deliveryLocation: v.optional(v.string()),
  deliveryStartDay: v.optional(v.number()),
  itemType: productionCostItemType,
  milestoneKey: v.string(),
  quantity: v.number(),
  reason: v.optional(v.string()),
  relevantSubmilestoneKeys: v.array(v.string()),
  specificationTiptapJson: v.optional(v.string()),
  supplier: v.optional(v.string()),
  title: v.string(),
  unit: v.optional(v.string()),
};

export const proposalDraftCostItemInput = v.object(
  productionCostItemCreateInput
);

export const proposalDraftContractorAssignmentInput = v.object({
  contractorId: v.optional(v.id("contractorProfiles")),
  contractorName: v.string(),
  estimatedCostCents: v.optional(v.number()),
  estimatedHours: v.optional(v.number()),
  milestoneKey: v.string(),
  role: v.string(),
  submilestoneKeys: v.array(v.string()),
});

export const productionCostItemUpdateInput = {
  budgetSubmilestoneKey: v.optional(v.union(v.string(), v.null())),
  budgetTreatment: v.optional(productionCostItemBudgetTreatment),
  costCents: v.optional(v.number()),
  description: v.optional(v.string()),
  deliveryEndDay: v.optional(v.number()),
  deliveryInstructions: v.optional(v.string()),
  deliveryLocation: v.optional(v.string()),
  deliveryStartDay: v.optional(v.number()),
  itemId: v.id("proposalCostItems"),
  itemType: v.optional(productionCostItemType),
  milestoneKey: v.optional(v.string()),
  quantity: v.optional(v.number()),
  reason: v.optional(v.string()),
  relevantSubmilestoneKeys: v.optional(v.array(v.string())),
  specificationTiptapJson: v.optional(v.string()),
  supplier: v.optional(v.string()),
  title: v.optional(v.string()),
  unit: v.optional(v.string()),
};

export const productionBuildCostItemUpdateInput = {
  budgetSubmilestoneKey: v.optional(v.union(v.string(), v.null())),
  budgetTreatment: v.optional(productionCostItemBudgetTreatment),
  costCents: v.optional(v.number()),
  description: v.optional(v.string()),
  deliveryEndDay: v.optional(v.number()),
  deliveryInstructions: v.optional(v.string()),
  deliveryLocation: v.optional(v.string()),
  deliveryStartDay: v.optional(v.number()),
  itemId: v.id("buildCostItems"),
  itemType: v.optional(productionCostItemType),
  milestoneKey: v.optional(v.string()),
  quantity: v.optional(v.number()),
  reason: v.optional(v.string()),
  relevantSubmilestoneKeys: v.optional(v.array(v.string())),
  specificationTiptapJson: v.optional(v.string()),
  supplier: v.optional(v.string()),
  title: v.optional(v.string()),
  unit: v.optional(v.string()),
};

export const activeBuildCostItemScopedMutationResult = v.object({
  itemId: v.id("buildCostItems"),
  replayed: v.boolean(),
  revision: v.number(),
});
