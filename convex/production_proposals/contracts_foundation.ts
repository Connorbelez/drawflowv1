/**
 * Production proposals contracts foundation bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type Infer, v } from "convex/values";
import { type RoleSlug } from "../authz";
import { type coerceSiteVisitGuidanceInput } from "../demo_site_visit_guidance";
import { proposalCapitalSources } from "../production_proposal_lifecycle";
import { proposalReviewApprovalModeValidator, proposalReviewPolicySnapshotValidator, proposalRevisionCheckpointSnapshotValidator } from "../lender_portal_phase3";

export type ProductionSettingsSiteVisitGuidanceInput = Parameters<
  typeof coerceSiteVisitGuidanceInput
>[0];

export const siteVisitGuidanceSectionInput = v.object({
  buildSubmilestoneId: v.id("buildSubmilestones"),
  cameraAnglesTiptapJson: v.string(),
  proposalSubmilestoneId: v.id("proposalSubmilestones"),
  whatToVerifyTiptapJson: v.string(),
});

export type SiteVisitGuidanceSectionInput = Infer<
  typeof siteVisitGuidanceSectionInput
>;

export interface BuilderStaffProvisionResult {
  provisioning: {
    adapter: string;
    invitationId?: string;
    membershipId: string;
    operation?: string;
    status: string;
    sync: string;
    userId: string;
  };
  staffWorkosUserId: string;
  workosMembershipId: string;
}

export const PROPOSAL_COLUMNS = ["draft", "submitted", "approved", "closed"] as const;

export const BACKOFFICE_ROLES = [
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
] as const satisfies readonly RoleSlug[];

export const APPROVER_ROLES = ["admin", "principle-broker"] as const;

export const BUILDER_ROLES = ["builder", "builder-staff"] as const;

export const proposalReviewPolicyInputValidator = v.object({
  drawApprovalMode: proposalReviewApprovalModeValidator,
  drawLenderQuorum: v.optional(v.number()),
  milestoneApprovalMode: proposalReviewApprovalModeValidator,
  milestoneLenderQuorum: v.optional(v.number()),
  milestoneReceiptInvoiceRequired: v.boolean(),
  milestoneSiteVisitRequired: v.boolean(),
});

export const EMPTY_CANONICAL_TIPTAP_DOCUMENT = JSON.stringify({
  content: [{ type: "paragraph" }],
  type: "doc",
});

export function labeledCanonicalTiptapDocument(text: string) {
  return JSON.stringify({
    content: [
      {
        content: [{ text, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

export const builderOnboardingRecoveryValidator = v.optional(
  v.object({
    intendedDestination: v.literal("/builder"),
    invitationStatus: v.union(
      v.literal("active"),
      v.literal("deleted"),
      v.literal("inactive"),
      v.literal("missing"),
      v.literal("pending"),
    ),
    invitedEmail: v.optional(v.string()),
    kind: v.union(
      v.literal("ambiguous-builder-profile"),
      v.literal("missing-broker-assignment"),
      v.literal("missing-brokerage"),
      v.literal("missing-builder-profile"),
      v.literal("missing-membership"),
      v.literal("missing-organization"),
      v.literal("projection-failed"),
      v.literal("projection-pending"),
    ),
    organization: v.object({
      id: v.string(),
      name: v.string(),
    }),
    projectionStatus: v.union(
      v.literal("failed"),
      v.literal("missing"),
      v.literal("pending"),
      v.literal("ready"),
    ),
    requiredRole: v.literal("Builder"),
    responsibleOwner: v.string(),
    supportReference: v.string(),
  }),
);

export const BUILDER_STAFF_PERMISSION_RESOURCES = [
  "milestone",
  "submilestone",
  "draw",
  "evidence",
  "contractor",
  "material",
  "capitalEvent",
  "reminder",
] as const;

export const BUILDER_STAFF_PERMISSION_ACTIONS = [
  "create",
  "view",
  "update",
  "delete",
] as const;

export const DEFAULT_WORKFLOW_RULE_KEY = "proposal-foundation-v1";

export const TOTAL_BPS = 10_000;

export const PRODUCTION_SETTINGS_HANDOFF_GAP_DAYS = 5;

export const PROPOSAL_TIMELINE_MIN_DAY = -30;

export const BACKOFFICE_DASHBOARD_PROPOSALS_PER_COLUMN = 50;

export const BACKOFFICE_DASHBOARD_ACTIVE_BUILDS_LIMIT = 50;

export const BACKOFFICE_DASHBOARD_MILESTONES_PER_BUILD = 80;

export const BACKOFFICE_DASHBOARD_PLANNED_DRAWS_PER_BUILD = 80;

export const BACKOFFICE_DASHBOARD_DRAW_REQUESTS_PER_BUILD = 80;

export const BACKOFFICE_DASHBOARD_EVIDENCE_SCAN_PER_BUILD = 16;

export const BACKOFFICE_DASHBOARD_STORAGE_URL_CAP = 50;

export const ACTIVE_BUILD_AUDIT_EVENTS_LIMIT = 100;

export const ACTIVE_BUILD_AUDIT_STREAM_LIMIT = ACTIVE_BUILD_AUDIT_EVENTS_LIMIT;

export const ACTIVE_BUILD_AUDIT_RESOURCE_TYPES = [
  "milestone",
  "submilestone",
  "draw",
  "evidence",
  "material",
  "siteVisit",
  "contractor",
  "capitalEvent",
  "reminder",
] as const;

export const ACTIVE_BUILD_AUDIT_LEGACY_COMPATIBILITY_LIMIT = 500;

export const ACTIVE_BUILD_DOCUMENT_URL_CAP = 40;

export const ACTIVE_BUILD_EVIDENCE_URL_CAP = 60;

export const ACTIVE_BUILD_SITE_PHOTOS_LIMIT = 24;

export const ACTIVE_BUILD_AVAILABLE_CONTRACTORS_LIMIT = 100;

export const TIMELINE_AUDIT_EVENTS_LIMIT = 50;

export const TIMELINE_EVIDENCE_URL_CAP = 40;

export const BACKOFFICE_BUILDER_OPTIONS_LIMIT = 200;

export const milestoneStartSourceValidator = v.union(
  v.literal("milestone_card"),
  v.literal("milestone_detail"),
  v.literal("gantt"),
  v.literal("calendar"),
  v.literal("submilestone_ledger"),
  v.literal("submilestone_detail"),
  v.literal("guided_field_workflow"),
  v.literal("assistant"),
  v.literal("completion_catch_up"),
);

export const proposalDirectoryFiltersValidator = v.object({
  approvedFrom: v.optional(v.number()),
  approvedTo: v.optional(v.number()),
  assignedBrokerWorkosUserId: v.optional(v.string()),
  assignment: v.optional(
    v.union(v.literal("assigned"), v.literal("unassigned")),
  ),
  builderProfileId: v.optional(v.id("builderProfiles")),
  closingState: v.optional(
    v.union(
      v.literal("active_build"),
      v.literal("pending_closing"),
      v.literal("pre_closing"),
    ),
  ),
  closedFrom: v.optional(v.number()),
  closedTo: v.optional(v.number()),
  createdFrom: v.optional(v.number()),
  createdTo: v.optional(v.number()),
  maxBorrowerStartingCashCents: v.optional(v.number()),
  maxBorrowerCoPayBps: v.optional(v.number()),
  maxBudgetCents: v.optional(v.number()),
  maxInterestAnnualBps: v.optional(v.number()),
  maxLenderDrawPolicyLimitCents: v.optional(v.number()),
  minBorrowerStartingCashCents: v.optional(v.number()),
  minBorrowerCoPayBps: v.optional(v.number()),
  minBudgetCents: v.optional(v.number()),
  minInterestAnnualBps: v.optional(v.number()),
  minLenderDrawPolicyLimitCents: v.optional(v.number()),
  planKey: v.optional(
    v.union(
      v.literal("capitalConstrained"),
      v.literal("cheapestFeasible"),
      v.literal("fastest"),
      v.literal("unselected"),
    ),
  ),
  proposedStartFrom: v.optional(v.string()),
  proposedStartTo: v.optional(v.string()),
  reviewOutcome: v.optional(
    v.union(
      v.literal("none"),
      v.literal("approved"),
      v.literal("requested_changes"),
      v.literal("rejected"),
    ),
  ),
  stage: v.optional(
    v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("approved"),
      v.literal("closed"),
    ),
  ),
  submittedFrom: v.optional(v.number()),
  submittedTo: v.optional(v.number()),
  updatedFrom: v.optional(v.number()),
  updatedTo: v.optional(v.number()),
});

export const proposalDirectoryCardValidator = v.object({
  activeBuildId: v.optional(v.string()),
  approvedAt: v.optional(v.number()),
  assignedBrokerEmail: v.optional(v.string()),
  assignedBrokerName: v.optional(v.string()),
  assignedBrokerWorkosUserId: v.optional(v.string()),
  borrowerCoPayBps: v.number(),
  borrowerCoPayCents: v.optional(v.number()),
  borrowerStartingCashCents: v.number(),
  builderAssigned: v.boolean(),
  builderEmail: v.optional(v.string()),
  builderLegalName: v.optional(v.string()),
  builderName: v.string(),
  builderProfileId: v.optional(v.string()),
  closedAt: v.optional(v.number()),
  column: v.union(
    v.literal("draft"),
    v.literal("submitted"),
    v.literal("approved"),
    v.literal("closed"),
  ),
  createdAt: v.number(),
  createdByEmail: v.optional(v.string()),
  createdByName: v.optional(v.string()),
  createdByWorkosUserId: v.string(),
  href: v.string(),
  interestAnnualBps: v.optional(v.number()),
  lenderDrawPolicyLimitCents: v.number(),
  location: v.string(),
  locationLatitude: v.optional(v.number()),
  locationLongitude: v.optional(v.number()),
  locationPlaceId: v.optional(v.string()),
  planKey: v.optional(
    v.union(
      v.literal("capitalConstrained"),
      v.literal("cheapestFeasible"),
      v.literal("fastest"),
    ),
  ),
  planName: v.optional(v.string()),
  proposedStartDate: v.optional(v.string()),
  proposalId: v.string(),
  reviewOutcome: v.union(
    v.literal("none"),
    v.literal("approved"),
    v.literal("requested_changes"),
    v.literal("rejected"),
  ),
  statusLabel: v.string(),
  submittedAt: v.optional(v.number()),
  subtitle: v.string(),
  title: v.string(),
  totalBudgetCents: v.number(),
  updatedAt: v.number(),
  updatedByWorkosUserId: v.string(),
});

const productionSettingsSiteVisitGuidanceFieldInput = v.union(
  v.string(),
  v.array(v.string()),
);

export const productionSettingsSiteVisitGuidanceInput = v.object({
  cameraAngles: productionSettingsSiteVisitGuidanceFieldInput,
  whatToVerify: productionSettingsSiteVisitGuidanceFieldInput,
});

export const productionSettingsSubmilestoneFieldGuidanceInput = v.object({
  cameraAnglesTiptapJson: v.string(),
  whatToVerifyTiptapJson: v.string(),
});

export const submilestoneInput = v.object({
  budgetCents: v.optional(v.number()),
  durationDays: v.optional(v.number()),
  fieldGuidance: v.optional(
    v.object({
      cameraAnglesTiptapJson: v.string(),
      whatToVerifyTiptapJson: v.string(),
    }),
  ),
  key: v.string(),
  name: v.string(),
  order: v.number(),
  scopeOfWorkTiptapJson: v.optional(v.string()),
  startDay: v.optional(v.number()),
});

export const milestoneInput = v.object({
  budgetCents: v.number(),
  dayEnd: v.number(),
  dayStart: v.number(),
  dependencyKeys: v.array(v.string()),
  durationDays: v.number(),
  icon: v.optional(v.string()),
  key: v.string(),
  name: v.string(),
  order: v.number(),
  siteVisitGuidance: v.optional(productionSettingsSiteVisitGuidanceInput),
  submilestones: v.array(submilestoneInput),
});

export const documentInput = v.object({
  documentType: v.union(
    v.literal("permit"),
    v.literal("budget"),
    v.literal("plan"),
    v.literal("supporting"),
  ),
  fileName: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  storageId: v.optional(v.id("_storage")),
});

export const proposalCapitalSourceInput = v.union(
  v.literal(proposalCapitalSources[0]),
  v.literal(proposalCapitalSources[1]),
);

export const proposalLenderAssignmentProjectionValidator = v.object({
  assignmentId: v.id("proposalLenderAssignments"),
  assignedAt: v.number(),
  assignedByRole: v.string(),
  assignedByWorkosUserId: v.string(),
  lenderBrokerageId: v.id("brokerages"),
  // Historical rows may still carry the legacy WorkOS id until the cutover
  // migration runs. New/current rows are app-owned lender organization ids.
  lenderOrganizationId: v.union(v.id("lenderOrganizations"), v.string()),
  lenderOrganizationName: v.string(),
  status: v.union(
    v.literal("current"),
    v.literal("archiving"),
    v.literal("withdrawn"),
  ),
  withdrawalReason: v.optional(v.string()),
  withdrawnAt: v.optional(v.number()),
  withdrawnByWorkosUserId: v.optional(v.string()),
  withdrawnByRole: v.optional(v.string()),
});

export const proposalLenderOrganizationOptionValidator = v.object({
  lenderOrganizationId: v.id("lenderOrganizations"),
  lenderOrganizationName: v.string(),
});

export const proposalReviewPolicyVersionPageItemValidator = v.object({
  configuredAt: v.optional(v.number()),
  configuredByRole: v.optional(v.string()),
  configuredByWorkosUserId: v.optional(v.string()),
  policy: proposalReviewPolicySnapshotValidator,
  policyVersionId: v.id("proposalReviewPolicyVersions"),
  reason: v.optional(v.string()),
  version: v.number(),
});

export const proposalRevisionPageItemValidator = v.object({
  assignmentId: v.union(v.id("proposalLenderAssignments"), v.null()),
  backOfficeApprovedByWorkosUserId: v.optional(v.string()),
  changedCheckpoints: v.array(v.union(v.literal("milestoneCount"), v.literal("budget"), v.literal("scheduleTimeline"), v.literal("builder"), v.literal("accessReviewPolicy"))),
  checkpoints: proposalRevisionCheckpointSnapshotValidator,
  createdAt: v.number(),
  createdByRole: v.optional(v.string()),
  createdByWorkosUserId: v.optional(v.string()),
  priorLenderReviewedRevisionId: v.union(v.id("proposalRevisions"), v.null()),
  proposalRevisionId: v.id("proposalRevisions"),
  reason: v.optional(v.string()),
  revisionNumber: v.number(),
  reviewPolicyVersionId: v.id("proposalReviewPolicyVersions"),
});
