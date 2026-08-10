import { v } from "convex/values";

import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
  selectActiveBuildAuthorizationCapacity,
} from "./activeBuildAccess";
import { authenticatedQuery, type AuthorizedViewer } from "./authz";
import { canReadCollaborationPost } from "./build_collaboration_access";
import type { BuildCollaborationRole } from "./build_collaboration_model";
import {
  authorizeActiveBuildCollaborationAccess,
  BUILD_COLLABORATION_UNAVAILABLE_ERROR,
} from "./build_collaboration_rollout";
import {
  canReadCanonicalMilestoneSubmilestone,
  resolveCanonicalMilestoneExecutionOwnership,
} from "./build_collaboration_system_event_access";
import { buildCollaborationRoleValidator } from "./build_collaboration_validators";
import {
  operateDenialMessage,
  resolveSubmilestoneOperateAuthority,
} from "./build_submilestone_operate_authority";
import type { Doc, Id, QueryCtx } from "./types";

const MAX_BOOTSTRAP_ROWS = 100;
const MAX_COMPANION_CANDIDATES = 32;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

const capabilityValidator = v.object({
  allowed: v.boolean(),
  reason: v.optional(v.string()),
});

const capabilitiesValidator = v.object({
  canonical: v.object({
    approveChild: capabilityValidator,
    correctStart: capabilityValidator,
    complete: capabilityValidator,
    retractChildApproval: capabilityValidator,
    retractStart: capabilityValidator,
    reopen: capabilityValidator,
    start: capabilityValidator,
    submitCompletion: capabilityValidator,
    updateEvidence: capabilityValidator,
    updateExecution: capabilityValidator,
    waiveSiteVisit: capabilityValidator,
    uploadEvidence: capabilityValidator,
    addAssignment: capabilityValidator,
    removeAssignment: capabilityValidator,
    readMaterials: capabilityValidator,
    updateMaterials: capabilityValidator,
  }),
  collaboration: v.object({
    addAttachment: capabilityValidator,
    addChecklist: capabilityValidator,
    comment: capabilityValidator,
    createChild: capabilityValidator,
    linkRelation: capabilityValidator,
    toggleChecklist: capabilityValidator,
  }),
  review: v.object({
    recommend: capabilityValidator,
    requestChanges: capabilityValidator,
  }),
});

const bootstrapVisibleValidator = v.object({
  build: v.object({
    buildId: v.id("activeBuilds"),
    buildName: v.string(),
    location: v.string(),
    startDate: v.string(),
    status: v.string(),
  }),
  capabilities: capabilitiesValidator,
  companion: v.optional(
    v.object({
      actionItemId: v.id("buildActionItems"),
      canonicalBindingRevision: v.optional(v.number()),
      currentRevision: v.number(),
      originatingPostId: v.id("buildCollaborationPosts"),
      requestedActionItemId: v.optional(v.id("buildActionItems")),
    }),
  ),
  collaboration: v.object({
    code: v.optional(v.string()),
    message: v.optional(v.string()),
    state: v.union(v.literal("available"), v.literal("degraded")),
  }),
  evidence: v.object({
    evidencePackageRevision: v.optional(v.number()),
    evidencePackageStatus: v.optional(
      v.union(v.literal("draft"), v.literal("frozen")),
    ),
    evidenceReviewState: v.string(),
    itemCount: v.number(),
    partial: v.boolean(),
    requirementCount: v.number(),
    requirements: v.array(
      v.object({
        description: v.optional(v.string()),
        kind: v.union(
          v.literal("photo"),
          v.literal("document"),
          v.literal("site_visit"),
          v.literal("any"),
        ),
        label: v.string(),
        locationRequired: v.boolean(),
        required: v.boolean(),
        requirementKey: v.string(),
        status: v.string(),
      }),
    ),
  }),
  execution: v.object({
    actualCostCents: v.optional(v.number()),
    actualStartedAt: v.optional(v.number()),
    completionForecastDate: v.optional(v.string()),
    fieldNote: v.optional(v.string()),
    progressPercent: v.number(),
  }),
  milestone: v.object({
    buildMilestoneId: v.id("buildMilestones"),
    key: v.string(),
    name: v.string(),
    planningState: v.string(),
    status: v.string(),
  }),
  overview: v.object({
    actualCostCents: v.optional(v.number()),
    actualStartedAt: v.optional(v.number()),
    budgetCents: v.optional(v.number()),
    description: v.optional(v.string()),
    executionOwnership: v.object({
      contractorId: v.optional(v.id("contractorProfiles")),
      contractorName: v.optional(v.string()),
      reason: v.string(),
      state: v.string(),
    }),
    fieldNote: v.optional(v.string()),
    forecastDate: v.optional(v.string()),
    plannedDurationDays: v.optional(v.number()),
    plannedStartDay: v.optional(v.number()),
    progressPercent: v.number(),
    scopeOfWorkTiptapJson: v.optional(v.string()),
    status: v.string(),
  }),
  people: v.object({
    assigned: v.number(),
    assignmentRequired: v.boolean(),
    availableContractors: v.array(
      v.object({
        _id: v.id("contractorProfiles"),
        city: v.optional(v.string()),
        defaultPayRateCents: v.optional(v.number()),
        defaultPayRateUnit: v.optional(
          v.union(v.literal("hour"), v.literal("day"), v.literal("fixed")),
        ),
        email: v.optional(v.string()),
        name: v.string(),
        onboardingStatus: v.optional(
          v.union(
            v.literal("profile_only"),
            v.literal("invited"),
            v.literal("account_linked"),
          ),
        ),
        trades: v.array(v.string()),
      }),
    ),
    historyCount: v.number(),
    historyPartial: v.boolean(),
    participants: v.array(
      v.object({
        displayName: v.string(),
        participationPeriod: v.number(),
        redacted: v.boolean(),
        role: buildCollaborationRoleValidator,
        source: v.union(v.literal("derived"), v.literal("grant")),
        workosUserId: v.optional(v.string()),
      }),
    ),
    participantsPartial: v.boolean(),
    participantCount: v.number(),
  }),
  materials: v.object({
    equipmentCount: v.optional(v.number()),
    materialCount: v.optional(v.number()),
    partial: v.boolean(),
    totalBudgetCents: v.optional(v.number()),
  }),
  ownership: v.object({
    reason: v.string(),
    state: v.string(),
  }),
  parentReadiness: v.object({
    approvedChildCount: v.number(),
    childCount: v.number(),
    partial: v.boolean(),
    readyForApproval: v.boolean(),
  }),
  persona: buildCollaborationRoleValidator,
  review: v.object({
    evidenceReviewState: v.string(),
    reviewDecisionState: v.string(),
    reviewRound: v.number(),
    siteVisitRequirementStatus: v.optional(v.string()),
  }),
  revisions: v.object({
    canonicalWorkflowRevision: v.number(),
    companionRevision: v.optional(v.number()),
    evidencePackageRevision: v.optional(v.number()),
    parentReviewRevision: v.number(),
    reviewRevision: v.number(),
  }),
  schedule: v.object({
    durationDays: v.optional(v.number()),
    parentDayEnd: v.number(),
    parentDayStart: v.number(),
    startDay: v.optional(v.number()),
  }),
  state: v.union(v.literal("visible"), v.literal("superseded")),
  submilestone: v.object({
    buildSubmilestoneId: v.id("buildSubmilestones"),
    key: v.string(),
    name: v.string(),
    planningState: v.string(),
    scopeOfWorkTiptapJson: v.optional(v.string()),
    status: v.string(),
    supersededAt: v.optional(v.number()),
  }),
});

const bootstrapValidator = v.union(
  v.object({ state: v.literal("revoked") }),
  v.object({
    code: v.string(),
    message: v.string(),
    state: v.literal("integrity_error"),
  }),
  bootstrapVisibleValidator,
);

const workspaceCollectionValidator = v.union(
  v.literal("evidence_requirements"),
  v.literal("evidence_assets"),
  v.literal("people_assignments"),
  v.literal("people_history"),
  v.literal("materials"),
  v.literal("collaboration_comments"),
  v.literal("collaboration_activity"),
  v.literal("collaboration_revisions"),
  v.literal("collaboration_checklist"),
  v.literal("collaboration_children"),
  v.literal("collaboration_relations"),
  v.literal("review_decisions"),
);

const workspaceCollectionRowValidator = v.object({
  amountCents: v.optional(v.number()),
  budgetSubmilestoneKey: v.optional(v.string()),
  budgetTreatment: v.optional(v.string()),
  completed: v.optional(v.boolean()),
  costCents: v.optional(v.number()),
  createdAt: v.optional(v.number()),
  detail: v.optional(v.string()),
  description: v.optional(v.string()),
  id: v.string(),
  itemKey: v.optional(v.string()),
  itemType: v.optional(v.string()),
  kind: v.string(),
  displayName: v.optional(v.string()),
  email: v.optional(v.string()),
  contractorId: v.optional(v.id("contractorProfiles")),
  assignmentId: v.optional(v.id("milestoneContractorAssignments")),
  historyType: v.optional(v.string()),
  actorWorkosUserId: v.optional(v.string()),
  locationRequired: v.optional(v.boolean()),
  locationVerified: v.optional(v.boolean()),
  milestoneKey: v.optional(v.string()),
  quantity: v.optional(v.number()),
  relevantSubmilestoneKeys: v.optional(v.array(v.string())),
  required: v.optional(v.boolean()),
  requirementKey: v.optional(v.string()),
  status: v.optional(v.string()),
  supplier: v.optional(v.string()),
  title: v.string(),
  totalCents: v.optional(v.number()),
  unit: v.optional(v.string()),
  updatedAt: v.optional(v.number()),
});

const workspaceCollectionResultValidator = v.union(
  v.object({ state: v.literal("revoked") }),
  v.object({
    code: v.string(),
    message: v.string(),
    state: v.literal("integrity_error"),
  }),
  v.object({
    canonicalWorkflowRevision: v.number(),
    collection: workspaceCollectionValidator,
    companionActionItemId: v.optional(v.id("buildActionItems")),
    companionRevision: v.optional(v.number()),
    collaboration: v.object({
      code: v.optional(v.string()),
      message: v.optional(v.string()),
      state: v.union(v.literal("available"), v.literal("degraded")),
    }),
    hasMore: v.boolean(),
    nextCursor: v.optional(v.string()),
    page: v.array(workspaceCollectionRowValidator),
    partial: v.boolean(),
    state: v.union(v.literal("visible"), v.literal("superseded")),
  }),
);

type WorkspaceContext = {
  authorization: ActiveBuildAuthorization;
  companion?: Doc<"buildActionItems">;
  collaboration: CollaborationState;
  post?: Doc<"buildCollaborationPosts">;
  milestone: Doc<"buildMilestones">;
  submilestone: Doc<"buildSubmilestones">;
};

type StrictWorkspaceContext = Omit<WorkspaceContext, "companion" | "post"> & {
  companion: Doc<"buildActionItems">;
  post: Doc<"buildCollaborationPosts">;
};

type CollaborationState = {
  code?: string;
  message?: string;
  state: "available" | "degraded";
};

type WorkspaceCollection =
  | "evidence_requirements"
  | "evidence_assets"
  | "people_assignments"
  | "people_history"
  | "materials"
  | "collaboration_comments"
  | "collaboration_activity"
  | "collaboration_revisions"
  | "collaboration_checklist"
  | "collaboration_children"
  | "collaboration_relations"
  | "review_decisions";

type WorkspaceCollectionRow = {
  amountCents?: number;
  budgetSubmilestoneKey?: string;
  budgetTreatment?: string;
  completed?: boolean;
  costCents?: number;
  createdAt?: number;
  detail?: string;
  description?: string;
  id: string;
  itemKey?: string;
  itemType?: string;
  kind: string;
  displayName?: string;
  email?: string;
  contractorId?: Id<"contractorProfiles">;
  assignmentId?: Id<"milestoneContractorAssignments">;
  historyType?: string;
  actorWorkosUserId?: string;
  locationRequired?: boolean;
  locationVerified?: boolean;
  milestoneKey?: string;
  quantity?: number;
  relevantSubmilestoneKeys?: string[];
  required?: boolean;
  requirementKey?: string;
  status?: string;
  supplier?: string;
  title: string;
  totalCents?: number;
  unit?: string;
  updatedAt?: number;
};

export const getBuildSubmilestoneWorkspaceBootstrap = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    companionActionItemId: v.optional(v.id("buildActionItems")),
    organizationId: v.string(),
    viewerCapacity: v.optional(buildCollaborationRoleValidator),
  })
  .returns(bootstrapValidator)
  .handler(async (ctx, args) => {
    const resolved = await resolveCanonicalBuildSubmilestoneWorkspaceContext(
      ctx,
      args,
    );
    if (resolved.state !== "visible") {
      return resolved;
    }
    const { authorization, collaboration, companion, milestone, submilestone } =
      resolved;
    const superseded =
      submilestone.planningState === "superseded" ||
      companion?.canonicalPlanningState === "superseded" ||
      (companion?.canonicalCompanionDisposition !== undefined &&
        companion.canonicalCompanionDisposition !== "active");
    const ownership = await resolveCanonicalMilestoneExecutionOwnership(ctx, {
      build: authorization.build,
      includeCompleted: true,
      milestone,
      submilestone,
    });
    const milestoneCompleted =
      milestone.status === "complete" ||
      milestone.completionClaim !== undefined;
    const [startAuthority, updateAuthority, reopenAuthority] =
      await Promise.all([
        resolveSubmilestoneOperateAuthority(ctx, {
          build: authorization.build,
          intent: "start",
          milestoneCompleted,
          ownership,
          submilestone,
          viewer: {
            roles: authorization.roles,
            workosUserId: authorization.viewer.subject,
          },
        }),
        resolveSubmilestoneOperateAuthority(ctx, {
          build: authorization.build,
          intent: "update",
          milestoneCompleted,
          ownership,
          submilestone,
          viewer: {
            roles: authorization.roles,
            workosUserId: authorization.viewer.subject,
          },
        }),
        resolveSubmilestoneOperateAuthority(ctx, {
          allowCompleted: true,
          build: authorization.build,
          intent: "update",
          milestoneCompleted,
          ownership,
          submilestone,
          viewer: {
            roles: authorization.roles,
            workosUserId: authorization.viewer.subject,
          },
        }),
      ]);
    const [
      requirements,
      packageRevision,
      packageItems,
      siblings,
      siteVisitRequirement,
      proposalSubmilestone,
      assignments,
      materialRows,
      peopleHistoryResult,
      candidateContractors,
    ] = await Promise.all([
      ctx.db
        .query("buildSubmilestoneEvidenceRequirements")
        .withIndex("by_submilestone", (query) =>
          query.eq("buildSubmilestoneId", submilestone._id).eq("active", true),
        )
        .take(MAX_BOOTSTRAP_ROWS + 1),
      submilestone.evidencePackageRevisionId
        ? ctx.db.get(submilestone.evidencePackageRevisionId)
        : null,
      submilestone.evidencePackageRevisionId
        ? ctx.db
            .query("buildSubmilestoneEvidencePackageItems")
            .withIndex("by_package_revision", (query) =>
              query.eq(
                "packageRevisionId",
                submilestone.evidencePackageRevisionId!,
              ),
            )
            .take(MAX_BOOTSTRAP_ROWS + 1)
        : [],
      ctx.db
        .query("buildSubmilestones")
        .withIndex("by_milestone", (query) =>
          query.eq("buildMilestoneId", milestone._id),
        )
        .take(MAX_BOOTSTRAP_ROWS + 1),
      submilestone.siteVisitRequirementId
        ? ctx.db.get(submilestone.siteVisitRequirementId)
        : null,
      ctx.db.get(submilestone.proposalSubmilestoneId),
      ctx.db
        .query("milestoneContractorAssignments")
        .withIndex("by_submilestone", (query) =>
          query
            .eq("buildId", authorization.build._id)
            .eq("milestoneKey", milestone.key)
            .eq("submilestoneKey", submilestone.key),
        )
        .take(MAX_BOOTSTRAP_ROWS + 1),
      ctx.db
        .query("buildCostItems")
        .withIndex("by_build_milestone", (query) =>
          query
            .eq("buildId", authorization.build._id)
            .eq("milestoneKey", milestone.key),
        )
        .take(MAX_BOOTSTRAP_ROWS * 5 + 1),
      loadCanonicalPeopleHistoryEvents(ctx, {
        authorization,
        milestone,
        submilestone,
      }),
      viewerCanReadContractorCandidates(authorization)
        ? ctx.db
            .query("contractorProfiles")
            .withIndex("by_brokerage", (query) =>
              query.eq("brokerageId", authorization.brokerage._id),
            )
            // The profile table is brokerage-scoped, but the same brokerage
            // can serve multiple WorkOS organizations. Keep this bounded and
            // apply the organization/status checks below before exposing rows.
            .take(MAX_BOOTSTRAP_ROWS * 5 + 1)
      : Promise.resolve([]),
    ]);
    const peopleHistoryEvents = peopleHistoryResult.events;
    const materialsPartial = materialRows.length > MAX_BOOTSTRAP_ROWS * 5;
    const scopedSiblings = siblings.filter(
      (candidate) =>
        candidate.buildId === authorization.build._id &&
        candidate.organizationId === authorization.organizationId &&
        candidate.brokerageId === authorization.brokerage._id &&
        candidate.planningState !== "superseded",
    );
    const boundedSiblings = scopedSiblings.slice(0, MAX_BOOTSTRAP_ROWS);
    const approvedChildCount = boundedSiblings.filter(
      (candidate) => candidate.reviewDecisionState === "approved",
    ).length;
    const partial = siblings.length > MAX_BOOTSTRAP_ROWS;
    const scopeError = validateBootstrapProjectionScope({
      authorization,
      assignments,
      materialRows,
      milestone,
      packageItems,
      packageRevision,
      proposalSubmilestone,
      requirements,
      siteVisitRequirement,
      submilestone,
    });
    if (scopeError) {
      return scopeError;
    }
    const capabilities = buildCapabilities({
      authorization,
      collaboration,
      reopenAuthority,
      startAuthority,
      status: submilestone.status,
      actualStartedAt: submilestone.actualStartedAt,
      superseded,
      updateAuthority,
    });
    const canReadPeopleIdentity = viewerCanReadPeopleIdentity(authorization);
    const canReadMaterialCosts = viewerCanReadMaterialCosts(authorization);
    const availableContractors = candidateContractors
      .filter(
        (candidate) =>
          candidate.organizationId === authorization.organizationId &&
          candidate.brokerageId === authorization.brokerage._id &&
          candidate.status === "active",
      )
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) ||
          String(left._id).localeCompare(String(right._id)),
      )
      .slice(0, MAX_BOOTSTRAP_ROWS)
      .map((candidate) => ({
        _id: candidate._id,
        ...(candidate.city ? { city: candidate.city } : {}),
        ...(candidate.defaultPayRateCents !== undefined
          ? { defaultPayRateCents: candidate.defaultPayRateCents }
          : {}),
        ...(candidate.defaultPayRateUnit
          ? { defaultPayRateUnit: candidate.defaultPayRateUnit }
          : {}),
        ...(candidate.email ? { email: candidate.email } : {}),
        name: candidate.name,
        onboardingStatus:
          candidate.onboardingStatus ??
          (candidate.accountWorkosUserId ? "account_linked" : "profile_only"),
        trades: candidate.trades,
      }));
    const participantRows = authorization.participants
      .slice(0, MAX_BOOTSTRAP_ROWS)
      .map((participant) => ({
        displayName: canReadPeopleIdentity
          ? participant.displayName
          : "Participant redacted",
        participationPeriod: participant.participationPeriod,
        redacted: !canReadPeopleIdentity,
        role: participant.role,
        source: participant.source,
        ...(canReadPeopleIdentity
          ? { workosUserId: participant.workosUserId }
          : {}),
      }));
    return {
      build: {
        buildId: authorization.build._id,
        buildName: authorization.build.buildName,
        location: authorization.build.location,
        startDate: authorization.build.startDate,
        status: authorization.build.status,
      },
      capabilities,
      collaboration,
      ...(companion
        ? {
            companion: {
              actionItemId: companion._id,
              canonicalBindingRevision: companion.canonicalBindingRevision,
              currentRevision: companion.currentRevision,
              originatingPostId: companion.originatingPostId,
              requestedActionItemId: args.companionActionItemId,
            },
          }
        : {}),
      evidence: {
        evidencePackageRevision: packageRevision?.revision,
        evidencePackageStatus: packageRevision?.status,
        evidenceReviewState: submilestone.evidenceReviewState ?? "not_ready",
        itemCount: Math.min(packageItems.length, MAX_BOOTSTRAP_ROWS),
        partial:
          requirements.length > MAX_BOOTSTRAP_ROWS ||
          packageItems.length > MAX_BOOTSTRAP_ROWS,
        requirementCount: Math.min(requirements.length, MAX_BOOTSTRAP_ROWS),
        requirements: requirements
          .slice(0, MAX_BOOTSTRAP_ROWS)
          .map((record) => ({
            ...(record.description ? { description: record.description } : {}),
            kind: record.kind,
            label: record.label,
            locationRequired: record.locationRequired,
            required: record.required,
            requirementKey: record.requirementKey,
            status: record.active ? "active" : "inactive",
          })),
      },
      execution: {
        actualCostCents: submilestone.actualCostCents,
        actualStartedAt: submilestone.actualStartedAt,
        completionForecastDate: submilestone.completionForecastDate,
        fieldNote: submilestone.fieldNote,
        progressPercent: submilestone.progressPercent ?? 0,
      },
      milestone: {
        buildMilestoneId: milestone._id,
        key: milestone.key,
        name: milestone.name,
        planningState: milestone.planningState ?? "active",
        status: milestone.status,
      },
      overview: {
        actualCostCents: submilestone.actualCostCents,
        actualStartedAt: submilestone.actualStartedAt,
        budgetCents: submilestone.budgetCents,
        description: undefined,
        executionOwnership: {
          ...(canReadPeopleIdentity && ownership.contractor?._id
            ? { contractorId: ownership.contractor._id }
            : {}),
          ...(canReadPeopleIdentity && ownership.contractor?.name
            ? { contractorName: ownership.contractor.name }
            : {}),
          reason: ownership.reason,
          state: ownership.state,
        },
        fieldNote: submilestone.fieldNote,
        forecastDate: submilestone.completionForecastDate,
        plannedDurationDays:
          submilestone.durationDays ?? proposalSubmilestone?.durationDays,
        plannedStartDay:
          submilestone.startDay ?? proposalSubmilestone?.startDay,
        progressPercent: submilestone.progressPercent ?? 0,
        scopeOfWorkTiptapJson:
          submilestone.scopeOfWorkTiptapJson ??
          proposalSubmilestone?.scopeOfWorkTiptapJson,
        status: submilestone.status,
      },
      people: {
        assigned: assignments.filter((row) => row.status !== "removed").length,
        assignmentRequired: ownership.state === "assignment_required",
        availableContractors,
        historyCount: peopleHistoryEvents.length,
        historyPartial: peopleHistoryResult.partial,
        participants: participantRows,
        participantsPartial:
          authorization.participants.length > MAX_BOOTSTRAP_ROWS,
        participantCount: authorization.participants.length,
      },
      materials: {
        partial: materialsPartial,
        ...(!materialsPartial
          ? {
              equipmentCount: materialRows.filter(
                (row) =>
                  row.itemType === "equipment" &&
                  (row.budgetSubmilestoneKey === submilestone.key ||
                    row.relevantSubmilestoneKeys.includes(submilestone.key)),
              ).length,
              materialCount: materialRows.filter(
                (row) =>
                  row.itemType === "material" &&
                  (row.budgetSubmilestoneKey === submilestone.key ||
                    row.relevantSubmilestoneKeys.includes(submilestone.key)),
              ).length,
              ...(canReadMaterialCosts
                ? {
                    totalBudgetCents: materialRows
                      .filter(
                        (row) =>
                          row.budgetSubmilestoneKey === submilestone.key ||
                          row.relevantSubmilestoneKeys.includes(
                            submilestone.key,
                          ),
                      )
                      .reduce(
                        (sum, row) => sum + row.costCents * row.quantity,
                        0,
                      ),
                  }
                : {}),
            }
          : {}),
      },
      ownership: { reason: ownership.reason, state: ownership.state },
      parentReadiness: {
        approvedChildCount,
        childCount: Math.min(scopedSiblings.length, MAX_BOOTSTRAP_ROWS),
        partial,
        readyForApproval:
          !partial &&
          scopedSiblings.length > 0 &&
          approvedChildCount === scopedSiblings.length,
      },
      persona: authorization.effectiveRole.role,
      review: {
        evidenceReviewState: submilestone.evidenceReviewState ?? "not_ready",
        reviewDecisionState: submilestone.reviewDecisionState ?? "in_review",
        reviewRound: submilestone.evidenceReviewRound ?? 0,
        siteVisitRequirementStatus: siteVisitRequirement?.status,
      },
      revisions: {
        canonicalWorkflowRevision: submilestone.workflowRevision ?? 0,
        ...(companion ? { companionRevision: companion.currentRevision } : {}),
        evidencePackageRevision: packageRevision?.revision,
        parentReviewRevision: milestone.reviewRevision ?? 0,
        reviewRevision: submilestone.reviewRevision ?? 0,
      },
      schedule: {
        durationDays: submilestone.durationDays,
        parentDayEnd: milestone.dayEnd,
        parentDayStart: milestone.dayStart,
        startDay: submilestone.startDay,
      },
      state: superseded ? ("superseded" as const) : ("visible" as const),
      submilestone: {
        buildSubmilestoneId: submilestone._id,
        key: submilestone.key,
        name: submilestone.name,
        planningState: submilestone.planningState ?? "active",
        scopeOfWorkTiptapJson: submilestone.scopeOfWorkTiptapJson,
        status: submilestone.status,
        supersededAt: submilestone.supersededAt,
      },
    };
  })
  .public();

function allowed(allowedValue: boolean, reason: string) {
  return allowedValue
    ? { allowed: true as const }
    : { allowed: false as const, reason };
}

function buildCapabilities(input: {
  actualStartedAt?: number;
  authorization: ActiveBuildAuthorization;
  collaboration: CollaborationState;
  reopenAuthority: Awaited<
    ReturnType<typeof resolveSubmilestoneOperateAuthority>
  >;
  startAuthority: Awaited<
    ReturnType<typeof resolveSubmilestoneOperateAuthority>
  >;
  status: Doc<"buildSubmilestones">["status"];
  superseded: boolean;
  updateAuthority: Awaited<
    ReturnType<typeof resolveSubmilestoneOperateAuthority>
  >;
}) {
  const role = input.authorization.effectiveRole.role;
  const disabledReason = "Historical Sub-milestones are read-only.";
  const startReason = input.startAuthority.allowed
    ? ""
    : operateDenialMessage(input.startAuthority.denial);
  const updateReason = input.updateAuthority.allowed
    ? ""
    : operateDenialMessage(input.updateAuthority.denial);
  const reopenReason = input.reopenAuthority.allowed
    ? ""
    : operateDenialMessage(input.reopenAuthority.denial);
  const planned = input.status === "planned";
  const inProgress = input.status === "in_progress";
  const complete = input.status === "complete";
  const lenderStaff = isLenderStaff(role);
  const lenderAdmin = role === "admin";
  const lenderApprover = lenderAdmin || role === "principle-broker";
  const fullStructure =
    role === "admin" || role === "builder" || role === "builder-staff";
  const assignedContractor =
    role === "contractor" && input.updateAuthority.allowed;
  const completionAuthority =
    !input.superseded && input.updateAuthority.allowed;
  const canComplete =
    completionAuthority &&
    (inProgress || (planned && input.startAuthority.allowed));
  const canOperate = completionAuthority && inProgress;
  const canReopen =
    !input.superseded && complete && input.reopenAuthority.allowed;
  const canAmendStartedAt =
    !input.superseded &&
    input.actualStartedAt !== undefined &&
    (complete
      ? lenderApprover
      : inProgress &&
        (lenderApprover ||
          (input.updateAuthority.allowed &&
            (role === "builder" || role === "builder-staff"))));
  const canComment =
    !input.superseded &&
    (fullStructure ||
      assignedContractor ||
      role === "homeowner" ||
      lenderStaff);
  const reason = input.superseded
    ? disabledReason
    : "Not permitted for this persona.";
  const structureReason = input.superseded
    ? disabledReason
    : "Companion structure editing is not enabled for generated Sub-milestones.";
  const collaborationReason =
    input.collaboration.state === "degraded"
      ? (input.collaboration.message ??
        "Collaboration is temporarily degraded.")
      : reason;
  const canUploadEvidence = canOperate;
  const canAssign = fullStructure || lenderAdmin;
  const plannedLifecycleReason =
    "Start the Sub-milestone before updating execution or evidence.";
  const completeLifecycleReason =
    "Reopen the Sub-milestone before updating execution or evidence.";
  const updateLifecycleReason = planned
    ? plannedLifecycleReason
    : complete
      ? completeLifecycleReason
      : updateReason;
  return {
    canonical: {
      approveChild: allowed(!input.superseded && lenderAdmin, reason),
      correctStart: allowed(
        canAmendStartedAt,
        input.superseded
          ? disabledReason
          : input.actualStartedAt === undefined
            ? "An actual start is required before correcting the start."
            : updateReason,
      ),
      complete: allowed(
        canComplete,
        input.superseded ? disabledReason : updateLifecycleReason,
      ),
      retractChildApproval: allowed(!input.superseded && lenderAdmin, reason),
      retractStart: allowed(
        canAmendStartedAt,
        input.superseded
          ? disabledReason
          : input.actualStartedAt === undefined
            ? "An actual start is required before retracting the start."
            : updateReason,
      ),
      reopen: allowed(
        canReopen,
        input.superseded ? disabledReason : reopenReason,
      ),
      start: allowed(
        !input.superseded && planned && input.startAuthority.allowed,
        input.superseded ? disabledReason : startReason,
      ),
      submitCompletion: allowed(
        !input.superseded && inProgress && completionAuthority,
        input.superseded ? disabledReason : updateLifecycleReason,
      ),
      updateEvidence: allowed(
        !input.superseded && inProgress && completionAuthority,
        input.superseded ? disabledReason : updateLifecycleReason,
      ),
      updateExecution: allowed(
        !input.superseded && inProgress && completionAuthority,
        input.superseded ? disabledReason : updateLifecycleReason,
      ),
      waiveSiteVisit: allowed(!input.superseded && lenderAdmin, reason),
      uploadEvidence: allowed(
        !input.superseded && canUploadEvidence,
        input.superseded ? disabledReason : updateLifecycleReason,
      ),
      addAssignment: allowed(!input.superseded && canAssign, reason),
      removeAssignment: allowed(!input.superseded && canAssign, reason),
      readMaterials: allowed(!input.superseded, reason),
      updateMaterials: allowed(!input.superseded && canAssign, reason),
    },
    collaboration: {
      addAttachment: allowed(
        input.collaboration.state === "available" && canComment,
        collaborationReason,
      ),
      addChecklist: allowed(false, structureReason),
      comment: allowed(
        input.collaboration.state === "available" && canComment,
        collaborationReason,
      ),
      createChild: allowed(false, structureReason),
      linkRelation: allowed(false, structureReason),
      toggleChecklist: allowed(false, structureReason),
    },
    review: {
      recommend: allowed(!input.superseded && lenderStaff, reason),
      requestChanges: allowed(!input.superseded && lenderStaff, reason),
    },
  };
}

export const getBuildSubmilestoneWorkspaceCollection = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    companionActionItemId: v.optional(v.id("buildActionItems")),
    collection: workspaceCollectionValidator,
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    organizationId: v.string(),
    viewerCapacity: v.optional(buildCollaborationRoleValidator),
  })
  .returns(workspaceCollectionResultValidator)
  .handler(async (ctx, args) => {
    const resolved = await resolveCanonicalBuildSubmilestoneWorkspaceContext(
      ctx,
      args,
    );
    if (resolved.state !== "visible") {
      return resolved;
    }
    const { authorization, collaboration, companion, milestone, submilestone } =
      resolved;
    const superseded =
      submilestone.planningState === "superseded" ||
      companion?.canonicalPlanningState === "superseded" ||
      (companion?.canonicalCompanionDisposition !== undefined &&
        companion.canonicalCompanionDisposition !== "active");
    const rows = await loadWorkspaceCollectionRows(ctx, {
      authorization,
      collection: args.collection,
      companion,
      collaboration,
      cursor: args.cursor ?? null,
      limit: normalizeLimit(args.limit),
      milestone,
      submilestone,
    });
    if ("code" in rows) {
      return rows;
    }
    const page = rows.rows.filter(
      (row): row is WorkspaceCollectionRow => row !== null,
    );
    return {
      canonicalWorkflowRevision: submilestone.workflowRevision ?? 0,
      collection: args.collection,
      ...(companion ? { companionActionItemId: companion._id } : {}),
      ...(companion ? { companionRevision: companion.currentRevision } : {}),
      collaboration,
      hasMore: rows.hasMore,
      nextCursor: rows.nextCursor,
      page,
      partial: rows.partial || rows.rows.some((row) => row === null),
      state: superseded ? ("superseded" as const) : ("visible" as const),
    };
  })
  .public();

function normalizeLimit(limit: number | undefined) {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(limit)));
}

type WorkspaceCursorValue =
  | { mode: "indexed"; cursor: string }
  | { mode: "offset"; offset: number }
  | { mode: "history"; createdAt: number; id: string };

type WorkspaceCursorDecode =
  | WorkspaceCursorValue
  | { state: "integrity_error"; code: string; message: string }
  | null;

const WORKSPACE_CURSOR_VERSION = "ws1";

function workspaceCursorMode(
  collection: WorkspaceCollection,
): "indexed" | "offset" | "history" {
  if (collection === "materials") {
    return "offset";
  }
  if (collection === "people_history") {
    return "history";
  }
  return "indexed";
}

function encodeWorkspaceCursor(
  collection: WorkspaceCollection,
  mode: "indexed" | "offset" | "history",
  value: string,
) {
  return [
    WORKSPACE_CURSOR_VERSION,
    mode,
    collection,
    encodeURIComponent(value),
  ].join("|");
}

function decodeWorkspaceCursor(
  collection: WorkspaceCollection,
  cursor: string | null,
): WorkspaceCursorDecode {
  if (cursor === null) return null;
  const parts = cursor.split("|");
  if (parts.length !== 4 || parts[0] !== WORKSPACE_CURSOR_VERSION) {
    return integrityError(
      "INVALID_WORKSPACE_CURSOR",
      "The workspace cursor is malformed or from an older contract.",
    );
  }
  const mode = parts[1];
  const cursorCollection = parts[2];
  const expectedMode = workspaceCursorMode(collection);
  if (cursorCollection !== collection || mode !== expectedMode) {
    return integrityError(
      "WORKSPACE_CURSOR_MISMATCH",
      "The workspace cursor belongs to a different collection.",
    );
  }
  let value: string;
  try {
    value = decodeURIComponent(parts[3]);
  } catch {
    return integrityError(
      "INVALID_WORKSPACE_CURSOR",
      "The workspace cursor value is malformed.",
    );
  }
  if (expectedMode === "offset") {
    if (!/^(0|[1-9][0-9]*)$/.test(value)) {
      return integrityError(
        "INVALID_WORKSPACE_CURSOR",
        "The offset workspace cursor is invalid.",
      );
    }
    const offset = Number(value);
    if (!Number.isSafeInteger(offset)) {
      return integrityError(
        "INVALID_WORKSPACE_CURSOR",
        "The offset workspace cursor is out of range.",
      );
    }
    return { mode: "offset", offset };
  }
  if (expectedMode === "history") {
    let decoded: unknown;
    try {
      decoded = JSON.parse(value) as unknown;
    } catch {
      return integrityError(
        "INVALID_WORKSPACE_CURSOR",
        "The people history workspace cursor is malformed.",
      );
    }
    if (
      !decoded ||
      typeof decoded !== "object" ||
      Array.isArray(decoded) ||
      typeof (decoded as { createdAt?: unknown }).createdAt !== "number" ||
      !Number.isFinite((decoded as { createdAt: number }).createdAt) ||
      typeof (decoded as { id?: unknown }).id !== "string" ||
      !(decoded as { id: string }).id
    ) {
      return integrityError(
        "INVALID_WORKSPACE_CURSOR",
        "The people history workspace cursor is invalid.",
      );
    }
    return {
      mode: "history",
      createdAt: (decoded as { createdAt: number }).createdAt,
      id: (decoded as { id: string }).id,
    };
  }
  if (!value) {
    return integrityError(
      "INVALID_WORKSPACE_CURSOR",
      "The indexed workspace cursor is empty.",
    );
  }
  return { mode: "indexed", cursor: value };
}

function integrityError(code: string, message: string) {
  return { code, message, state: "integrity_error" as const };
}

function validateBootstrapProjectionScope(input: {
  authorization: ActiveBuildAuthorization;
  milestone: Doc<"buildMilestones">;
  packageItems: Doc<"buildSubmilestoneEvidencePackageItems">[];
  packageRevision: Doc<"buildSubmilestoneEvidencePackageRevisions"> | null;
  proposalSubmilestone: Doc<"proposalSubmilestones"> | null;
  assignments: Doc<"milestoneContractorAssignments">[];
  materialRows: Doc<"buildCostItems">[];
  requirements: Doc<"buildSubmilestoneEvidenceRequirements">[];
  siteVisitRequirement: Doc<"buildSubmilestoneSiteVisitRequirements"> | null;
  submilestone: Doc<"buildSubmilestones">;
}) {
  const inScope = (record: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    buildMilestoneId: Id<"buildMilestones">;
    buildSubmilestoneId: Id<"buildSubmilestones">;
    organizationId: string;
  }) =>
    record.buildId === input.authorization.build._id &&
    record.organizationId === input.authorization.organizationId &&
    record.brokerageId === input.authorization.brokerage._id &&
    record.buildMilestoneId === input.milestone._id &&
    record.buildSubmilestoneId === input.submilestone._id;
  if (
    input.proposalSubmilestone === null ||
    (input.submilestone.evidencePackageRevisionId !== undefined &&
      input.packageRevision === null) ||
    (input.packageRevision &&
      input.packageRevision._id !==
        input.submilestone.evidencePackageRevisionId) ||
    (input.submilestone.siteVisitRequirementId !== undefined &&
      input.siteVisitRequirement === null) ||
    (input.siteVisitRequirement &&
      input.siteVisitRequirement._id !==
        input.submilestone.siteVisitRequirementId) ||
    (input.packageRevision && !inScope(input.packageRevision)) ||
    (input.siteVisitRequirement && !inScope(input.siteVisitRequirement)) ||
    input.requirements.some((record) => !inScope(record)) ||
    input.packageItems.some(
      (record) =>
        !inScope(record) ||
        record.packageRevisionId !== input.packageRevision?._id,
    ) ||
    (input.proposalSubmilestone !== null &&
      (input.proposalSubmilestone.organizationId !==
        input.authorization.organizationId ||
        input.proposalSubmilestone.brokerageId !==
          input.authorization.brokerage._id ||
        input.proposalSubmilestone.proposalId !==
          input.authorization.proposal._id ||
        input.proposalSubmilestone.proposalMilestoneId !==
          input.milestone.proposalMilestoneId ||
        input.proposalSubmilestone.key !== input.submilestone.key)) ||
    input.assignments.some(
      (record) =>
        !(
          record.buildId === input.authorization.build._id &&
          record.organizationId === input.authorization.organizationId &&
          record.brokerageId === input.authorization.brokerage._id
        ) ||
        record.buildMilestoneId !== input.milestone._id ||
        record.buildSubmilestoneId !== input.submilestone._id ||
        record.milestoneKey !== input.milestone.key ||
        record.submilestoneKey !== input.submilestone.key,
    ) ||
    input.materialRows
      .filter(
        (record) =>
          record.budgetSubmilestoneKey === input.submilestone.key ||
          record.relevantSubmilestoneKeys.includes(input.submilestone.key),
      )
      .some(
        (record) =>
          !(
            record.buildId === input.authorization.build._id &&
            record.organizationId === input.authorization.organizationId &&
            record.brokerageId === input.authorization.brokerage._id
          ) ||
          record.buildMilestoneId !== input.milestone._id ||
          !(
            record.budgetSubmilestoneKey === input.submilestone.key ||
            record.relevantSubmilestoneKeys.includes(input.submilestone.key)
          ),
      )
  ) {
    return integrityError(
      "CANONICAL_PROJECTION_SCOPE_INVALID",
      "A canonical Sub-milestone projection is outside the authorized Build scope.",
    );
  }
  return null;
}

async function loadWorkspaceCollectionRows(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    collection: WorkspaceCollection;
    companion?: Doc<"buildActionItems">;
    collaboration: CollaborationState;
    cursor: string | null;
    limit: number;
    milestone: Doc<"buildMilestones">;
    submilestone: Doc<"buildSubmilestones">;
  },
): Promise<
  | { state: "integrity_error"; code: string; message: string }
  | {
      hasMore: boolean;
      nextCursor?: string;
      rows: Array<WorkspaceCollectionRow | null>;
      partial: boolean;
    }
> {
  const {
    authorization,
    collection,
    companion,
    collaboration,
    cursor,
    limit,
    milestone,
    submilestone,
  } = input;
  const canonicalScope = (record: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    organizationId: string;
  }) =>
    record.buildId === authorization.build._id &&
    record.organizationId === authorization.organizationId &&
    record.brokerageId === authorization.brokerage._id;
  const companionScope = (record: {
    actionItemId: Id<"buildActionItems">;
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    organizationId: string;
  }) =>
    Boolean(companion) &&
    canonicalScope(record) &&
    record.actionItemId === companion?._id;
  let rows: Array<WorkspaceCollectionRow | null> = [];
  let hasMore = false;
  let nextCursor: string | undefined;
  let partial = false;
  const decodedCursor = decodeWorkspaceCursor(collection, cursor);
  if (decodedCursor && "state" in decodedCursor) {
    return decodedCursor;
  }
  const indexedCursor =
    decodedCursor?.mode === "indexed" ? decodedCursor.cursor : null;
  const offset = decodedCursor?.mode === "offset" ? decodedCursor.offset : 0;
  let historyCursor:
    | { createdAt: number; id: string }
    | undefined;
  if (decodedCursor?.mode === "history") {
    const cursorId = ctx.db.normalizeId("auditEvents", decodedCursor.id);
    if (!cursorId) {
      return integrityError(
        "INVALID_WORKSPACE_CURSOR",
        "The people history workspace cursor references an invalid audit event.",
      );
    }
    historyCursor = {
      createdAt: decodedCursor.createdAt,
      id: String(cursorId),
    };
  }
  const applyIndexedPagination = (page: {
    continueCursor: string;
    isDone: boolean;
  }) => {
    hasMore = !page.isDone;
    nextCursor = page.isDone
      ? undefined
      : encodeWorkspaceCursor(collection, "indexed", page.continueCursor);
  };

  if (
    collaboration.state === "degraded" &&
    collection.startsWith("collaboration_")
  ) {
    return integrityError(
      collaboration.code ?? "COLLABORATION_DEGRADED",
      collaboration.message ?? "Collaboration companion is unavailable.",
    );
  }
  if (!companion && collection.startsWith("collaboration_")) {
    return integrityError(
      "COLLABORATION_COMPANION_MISSING",
      "Collaboration data is unavailable for this canonical target.",
    );
  }

  if (collection === "evidence_requirements") {
    const result = await ctx.db
      .query("buildSubmilestoneEvidenceRequirements")
      .withIndex("by_submilestone", (query) =>
        query.eq("buildSubmilestoneId", submilestone._id).eq("active", true),
      )
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const records = result.page;
    if (
      records.some(
        (record) =>
          !canonicalScope(record) ||
          record.buildMilestoneId !== milestone._id ||
          record.buildSubmilestoneId !== submilestone._id,
      )
    ) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Evidence requirements are outside the authorized Sub-milestone scope.",
      );
    }
    rows = records.map((record) => ({
      createdAt: record.createdAt,
      description: record.description,
      detail: record.description,
      id: record._id,
      kind: record.kind,
      locationRequired: record.locationRequired,
      required: record.required,
      status: record.active ? "active" : "inactive",
      title: record.label,
      // Keep the canonical requirement identity in the collection payload;
      // callers must send this key when a package has multiple requirements.
      requirementKey: record.requirementKey,
    }));
  } else if (collection === "evidence_assets") {
    const result = await ctx.db
      .query("buildEvidenceAssets")
      .withIndex("by_build_milestone_submilestone", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("milestoneKey", milestone.key)
          .eq("submilestoneKey", submilestone.key),
      )
      .order("desc")
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const source = result.page;
    if (source.some((record) => !canonicalScope(record))) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Evidence assets are outside the authorized Sub-milestone scope.",
      );
    }
    rows = source.map((record) => ({
      createdAt: record.createdAt,
      detail: record.fileName,
      id: record._id,
      kind: record.tag,
      locationVerified: record.locationVerified,
      title: record.label,
    }));
  } else if (collection === "people_assignments") {
    const result = await ctx.db
      .query("milestoneContractorAssignments")
      .withIndex("by_submilestone", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("milestoneKey", milestone.key)
          .eq("submilestoneKey", submilestone.key),
      )
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const records = result.page;
    if (
      records.some(
        (record) =>
          !canonicalScope(record) ||
          record.buildMilestoneId !== milestone._id ||
          record.buildSubmilestoneId !== submilestone._id,
      )
    ) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "People assignments are outside the authorized Sub-milestone scope.",
      );
    }
    const canReadAssignmentCosts =
      authorization.effectiveRole.role !== "contractor" &&
      authorization.effectiveRole.role !== "homeowner";
    const canReadPeopleIdentity =
      authorization.effectiveRole.role !== "contractor" &&
      authorization.effectiveRole.role !== "homeowner";
    const contractorProfiles = canReadPeopleIdentity
      ? await Promise.all(
          records.map((record) => ctx.db.get(record.contractorId)),
        )
      : records.map(() => null);
    rows = records.map((record, index) => ({
      amountCents: canReadAssignmentCosts
        ? (record.actualCostCents ?? record.estimatedCostCents)
        : undefined,
      createdAt: record.createdAt,
      detail: record.note,
      id: record._id,
      kind: "contractor_assignment",
      assignmentId: record._id,
      contractorId: canReadPeopleIdentity ? record.contractorId : undefined,
      ...(contractorProfiles[index] &&
      contractorProfiles[index]!.brokerageId === authorization.brokerage._id &&
      contractorProfiles[index]!.organizationId === authorization.organizationId
        ? {
            displayName: contractorProfiles[index]!.name,
            email: contractorProfiles[index]!.email,
          }
        : {}),
      status: record.status,
      title: record.role,
    }));
  } else if (collection === "people_history") {
    // Assignment history is an immutable projection of the canonical active
    // Build audit stream. Never reconstruct history from the mutable current
    // assignment row: updates would erase the prior contractor and status.
    const history = await loadCanonicalPeopleHistoryEvents(ctx, {
      authorization,
      milestone,
      submilestone,
      after: historyCursor,
    });
    const pageEvents = history.events.slice(0, limit);
    hasMore = pageEvents.length < history.events.length;
    const lastEvent = pageEvents.at(-1);
    nextCursor = hasMore && lastEvent
      ? encodeWorkspaceCursor(
          collection,
          "history",
          JSON.stringify({
            createdAt: lastEvent.createdAt,
            id: String(lastEvent._id),
          }),
        )
      : undefined;
    partial = history.partial;
    const canReadPeopleIdentity = viewerCanReadPeopleIdentity(authorization);
    const contractorIds = pageEvents
      .map((event) => contractorIdFromAuditEvent(ctx, event))
      .filter((id): id is Id<"contractorProfiles"> => id !== undefined);
    const contractorProfiles = canReadPeopleIdentity
      ? await Promise.all(contractorIds.map((id) => ctx.db.get(id)))
      : [];
    const contractorById = new Map(
      contractorIds.map((id, index) => [String(id), contractorProfiles[index]]),
    );
    rows = pageEvents.map((event) => {
      const contractorId = contractorIdFromAuditEvent(ctx, event);
      const profile = contractorId
        ? contractorById.get(String(contractorId))
        : undefined;
      const state = parseAuditState(event.newState);
      const status = stringFromState(state, "status");
      const role = stringFromState(state, "role");
      return {
        ...(canReadPeopleIdentity
          ? { actorWorkosUserId: event.actorWorkosUserId }
          : {}),
        createdAt: event.createdAt,
        detail: event.reason,
        id: event._id,
        kind: "assignment_history",
        ...(canReadPeopleIdentity && contractorId ? { contractorId } : {}),
        ...(canReadPeopleIdentity &&
        profile &&
        profile.brokerageId === authorization.brokerage._id &&
        profile.organizationId === authorization.organizationId
          ? { displayName: profile.name, email: profile.email }
          : {}),
        historyType: event.eventType,
        milestoneKey: milestone.key,
        status: status || "updated",
        title: role || "Contractor assignment",
      };
    });
  } else if (collection === "materials") {
    // `relevantSubmilestoneKeys` is an array and cannot be indexed. Read a
    // bounded milestone slice, filter to the exact target, then paginate the
    // filtered canonical rows so unrelated sibling rows never consume a page.
    const source = (await ctx.db
      .query("buildCostItems")
      .withIndex("by_build_milestone", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("milestoneKey", milestone.key),
      )
      .take(MAX_BOOTSTRAP_ROWS * 5 + 1)) as Doc<"buildCostItems">[];
    partial = source.length > MAX_BOOTSTRAP_ROWS * 5;
    const exact = source.filter(
      (record) =>
        record.budgetSubmilestoneKey === submilestone.key ||
        record.relevantSubmilestoneKeys.includes(submilestone.key),
    );
    const pageOffset = offset;
    const pageRows = exact.slice(pageOffset, pageOffset + limit);
    hasMore = pageOffset + limit < exact.length;
    nextCursor = hasMore
      ? encodeWorkspaceCursor(
          collection,
          "offset",
          String(pageOffset + limit),
        )
      : undefined;
    if (
      pageRows.some(
        (record) =>
          !canonicalScope(record) || record.buildMilestoneId !== milestone._id,
      )
    ) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Materials are outside the authorized Sub-milestone scope.",
      );
    }
    const canReadMaterialCosts =
      authorization.effectiveRole.role !== "contractor" &&
      authorization.effectiveRole.role !== "homeowner";
    rows = pageRows.map((record) => ({
      amountCents: canReadMaterialCosts ? record.costCents : undefined,
      budgetSubmilestoneKey: record.budgetSubmilestoneKey,
      budgetTreatment: record.budgetTreatment,
      createdAt: record.createdAt,
      description: record.description,
      detail: record.description,
      id: record._id,
      itemKey: record.itemKey,
      itemType: record.itemType,
      kind: record.itemType,
      costCents: canReadMaterialCosts ? record.costCents : undefined,
      milestoneKey: record.milestoneKey,
      quantity: record.quantity,
      relevantSubmilestoneKeys: record.relevantSubmilestoneKeys,
      status: record.budgetTreatment,
      supplier: record.supplier,
      title: record.title,
      totalCents: canReadMaterialCosts
        ? record.costCents * record.quantity
        : undefined,
      unit: record.unit,
      updatedAt: record.updatedAt,
    }));
  } else if (collection === "collaboration_comments") {
    const result = await ctx.db
      .query("buildActionItemComments")
      .withIndex("by_actionItemId_and_createdAt", (query) =>
        query.eq("actionItemId", companion!._id),
      )
      .order("desc")
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const records = result.page;
    if (records.some((record) => !companionScope(record))) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Comments are outside the authorized collaboration companion scope.",
      );
    }
    rows = records.map((record) => ({
      createdAt: record.createdAt,
      detail: record.plainText,
      id: record._id,
      kind: "comment",
      title: record.authorDisplayNameSnapshot,
    }));
  } else if (collection === "collaboration_activity") {
    const result = await ctx.db
      .query("buildActionItemEvents")
      .withIndex("by_actionItemId_and_createdAt", (query) =>
        query.eq("actionItemId", companion!._id),
      )
      .order("desc")
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const records = result.page;
    if (records.some((record) => !companionScope(record))) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Activity is outside the authorized collaboration companion scope.",
      );
    }
    rows = records.map((record) => ({
      createdAt: record.createdAt,
      detail: record.reason,
      id: record._id,
      kind: record.eventType,
      status: record.newState,
      title: record.eventType,
    }));
  } else if (collection === "collaboration_revisions") {
    const result = await ctx.db
      .query("buildActionItemRevisions")
      .withIndex("by_actionItemId_and_revision", (query) =>
        query.eq("actionItemId", companion!._id),
      )
      .order("desc")
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const records = result.page;
    if (records.some((record) => !companionScope(record))) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Revisions are outside the authorized collaboration companion scope.",
      );
    }
    rows = records.map((record) => ({
      createdAt: record.createdAt,
      detail: record.reason,
      id: record._id,
      kind: "revision",
      status: String(record.revision),
      title: `Revision ${record.revision}`,
    }));
  } else if (collection === "collaboration_checklist") {
    const result = await ctx.db
      .query("buildActionItemChecklistItems")
      .withIndex("by_actionItemId_and_order", (query) =>
        query.eq("actionItemId", companion!._id),
      )
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const records = result.page;
    if (records.some((record) => !companionScope(record))) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Checklist rows are outside the authorized collaboration companion scope.",
      );
    }
    rows = records.map((record) => ({
      completed: record.completed,
      createdAt: record.createdAt,
      id: record._id,
      kind: "checklist",
      required: record.required,
      status: record.completed ? "complete" : "open",
      title: record.label,
    }));
  } else if (collection === "collaboration_children") {
    const result = await ctx.db
      .query("buildActionItems")
      .withIndex("by_parentActionItemId_and_status", (query) =>
        query.eq("parentActionItemId", companion!._id),
      )
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const records = result.page;
    if (
      records.some(
        (record) =>
          !canonicalScope(record) ||
          record.parentActionItemId !== companion!._id,
      )
    ) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Child Action Items are outside the authorized collaboration companion scope.",
      );
    }
    rows = records.map((record) => ({
      createdAt: record.createdAt,
      detail: record.descriptionPlainText,
      id: record._id,
      kind: "action_item",
      status: record.status,
      title: record.title,
    }));
  } else if (collection === "collaboration_relations") {
    const result = await ctx.db
      .query("buildActionItemRelations")
      .withIndex("by_buildId_and_status", (query) =>
        query.eq("buildId", authorization.build._id).eq("status", "active"),
      )
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const records = result.page;
    if (records.some((record) => !canonicalScope(record))) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Relations are outside the authorized collaboration companion scope.",
      );
    }
    rows = records.map((record) =>
      record.sourceActionItemId === companion!._id ||
      record.targetActionItemId === companion!._id
        ? {
            createdAt: record.createdAt,
            detail:
              record.sourceActionItemId === companion!._id
                ? "outgoing"
                : "incoming",
            id: record._id,
            kind: record.kind,
            status: record.status,
            title: record.kind.replaceAll("_", " "),
          }
        : null,
    );
  } else {
    const result = await ctx.db
      .query("buildSubmilestoneReviewDecisions")
      .withIndex("by_submilestone_createdAt", (query) =>
        query.eq("buildSubmilestoneId", submilestone._id),
      )
      .order("desc")
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const records = result.page;
    if (
      records.some(
        (record) =>
          !canonicalScope(record) ||
          record.buildMilestoneId !== milestone._id ||
          record.buildSubmilestoneId !== submilestone._id,
      )
    ) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Review decisions are outside the authorized Sub-milestone scope.",
      );
    }
    rows = records.map((record) => ({
      createdAt: record.createdAt,
      detail: record.reason ?? record.note,
      id: record._id,
      kind: record.kind,
      status: record.newState,
      title: record.kind.replaceAll("_", " "),
    }));
  }

  return { hasMore, nextCursor, partial, rows };
}

type AuditStateRecord = Record<string, unknown>;

function parseAuditState(value: string | undefined): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    // Audit rows are immutable, but a malformed legacy snapshot must not make
    // a canonical workspace query fail. Keep the row visible without trying
    // to infer identity or status from invalid JSON.
    return undefined;
  }
}

function auditStateTouchesSubmilestone(
  value: unknown,
  submilestoneKey: string,
): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) =>
      auditStateTouchesSubmilestone(entry, submilestoneKey),
    );
  }
  if (!value || typeof value !== "object") return false;
  const record = value as AuditStateRecord;
  if (record.submilestoneKey === submilestoneKey) return true;
  if (
    Array.isArray(record.submilestoneKeys) &&
    record.submilestoneKeys.some((key) => key === submilestoneKey)
  ) {
    return true;
  }
  return false;
}

function stringFromState(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const candidate = (value as AuditStateRecord)[key];
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : undefined;
}

function contractorIdFromAuditEvent(
  ctx: QueryCtx,
  event: Doc<"auditEvents">,
) {
  const state = parseAuditState(event.newState);
  const candidate = stringFromState(state, "contractorId");
  return candidate
    ? (ctx.db.normalizeId("contractorProfiles", candidate) ?? undefined)
    : undefined;
}

async function loadCanonicalPeopleHistoryEvents(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    milestone: Doc<"buildMilestones">;
    submilestone: Doc<"buildSubmilestones">;
    after?: { createdAt: number; id: string };
  },
) : Promise<{
  events: Doc<"auditEvents">[];
  partial: boolean;
}> {
  const rawEvents = await ctx.db
    .query("auditEvents")
    .withIndex("by_entity", (query) =>
      query
        .eq("entityType", "activeBuild")
        .eq("entityId", String(input.authorization.build._id)),
    )
    .order("desc")
    .take(MAX_BOOTSTRAP_ROWS * 5 + 1);
  const events = rawEvents
    .filter(
      (event) =>
        event.organizationId === input.authorization.organizationId &&
        event.brokerageId === input.authorization.brokerage._id &&
        event.eventType.startsWith(
          "active_build.contractor.milestone_assignment_",
        ) &&
        [
          parseAuditState(event.newState),
          parseAuditState(event.priorState),
        ].some(
          (state) =>
            auditStateTouchesSubmilestone(state, input.submilestone.key) &&
            stringFromState(state, "milestoneKey") === input.milestone.key,
        ),
      )
    .sort(compareAuditEventsDescending)
    .filter((event) =>
      input.after
        ? compareAuditEventKey(event, input.after) < 0
        : true,
    )
    .slice(0, MAX_BOOTSTRAP_ROWS * 5 + 1);
  return {
    events,
    // The query is intentionally bounded before tenant/sub-milestone
    // filtering. If it reaches the bound, a later matching event may have
    // been excluded by the pre-filter window, so callers must not claim a
    // complete history projection.
    partial: rawEvents.length > MAX_BOOTSTRAP_ROWS * 5,
  };
}

function compareAuditEventKey(
  event: Doc<"auditEvents">,
  cursor: { createdAt: number; id: string },
) {
  if (event.createdAt !== cursor.createdAt) {
    return event.createdAt - cursor.createdAt;
  }
  const eventId = String(event._id);
  if (eventId < cursor.id) return -1;
  if (eventId > cursor.id) return 1;
  return 0;
}

function compareAuditEventsDescending(
  left: Doc<"auditEvents">,
  right: Doc<"auditEvents">,
) {
  return compareAuditEventKey(right, {
    createdAt: left.createdAt,
    id: String(left._id),
  });
}

function viewerCanReadPeopleIdentity(authorization: ActiveBuildAuthorization) {
  return (
    authorization.effectiveRole.role !== "contractor" &&
    authorization.effectiveRole.role !== "homeowner"
  );
}

function viewerCanReadContractorCandidates(
  authorization: ActiveBuildAuthorization,
) {
  // Candidate identities are only needed by roles that can add/remove a
  // canonical milestone assignment. Lender/broker viewers can inspect the
  // current assignment, but must not receive a directory of contractor
  // profiles that they cannot assign.
  return (
    authorization.effectiveRole.role === "admin" ||
    authorization.effectiveRole.role === "builder" ||
    authorization.effectiveRole.role === "builder-staff"
  );
}

function viewerCanReadMaterialCosts(authorization: ActiveBuildAuthorization) {
  return (
    authorization.effectiveRole.role !== "contractor" &&
    authorization.effectiveRole.role !== "homeowner"
  );
}

function isLenderStaff(role: BuildCollaborationRole) {
  return (
    role === "admin" ||
    role === "principle-broker" ||
    role === "broker" ||
    role === "broker-staff"
  );
}

function isWorkspaceAccessDenial(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.startsWith("Forbidden:") ||
    error.message === BUILD_COLLABORATION_UNAVAILABLE_ERROR ||
    error.message ===
      "Build Collaboration is temporarily frozen for a rollback rehearsal snapshot."
  );
}

/**
 * Canonical-first reader used by the Overview/Evidence/People/Materials
 * surfaces. Canonical facts are authorized directly from the active Build;
 * generated collaboration companions are an optional, explicitly degraded
 * projection and never gate the canonical target.
 */
export async function resolveCanonicalBuildSubmilestoneWorkspaceContext(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  args: {
    buildId: Id<"activeBuilds">;
    buildSubmilestoneId: Id<"buildSubmilestones">;
    companionActionItemId?: Id<"buildActionItems">;
    organizationId: string;
    viewerCapacity?: BuildCollaborationRole;
  },
): Promise<{ state: "revoked" } | ({ state: "visible" } & WorkspaceContext)> {
  let authorization: ActiveBuildAuthorization;
  try {
    authorization = selectActiveBuildAuthorizationCapacity(
      await authorizeActiveBuildAccess(ctx, args),
      args.viewerCapacity,
    );
  } catch (error) {
    if (isWorkspaceAccessDenial(error)) {
      return { state: "revoked" };
    }
    throw error;
  }
  const submilestone = await ctx.db.get(args.buildSubmilestoneId);
  if (!submilestone) return { state: "revoked" };
  const milestone = await ctx.db.get(submilestone.buildMilestoneId);
  if (
    !milestone ||
    submilestone.buildId !== authorization.build._id ||
    submilestone.organizationId !== authorization.organizationId ||
    submilestone.brokerageId !== authorization.brokerage._id ||
    milestone.buildId !== authorization.build._id ||
    milestone.organizationId !== authorization.organizationId ||
    milestone.brokerageId !== authorization.brokerage._id ||
    submilestone.milestoneKey !== milestone.key
  ) {
    return { state: "revoked" };
  }
  const canRead = await canReadCanonicalWorkspaceTarget(ctx, {
    authorization,
    milestone,
    submilestone,
  });
  if (!canRead) return { state: "revoked" };

  const collaboration = await resolveOptionalCompanion(ctx, {
    authorization,
    args,
    milestone,
    submilestone,
  });
  return {
    authorization,
    collaboration: collaboration.state,
    companion: collaboration.companion,
    milestone,
    post: collaboration.post,
    state: "visible",
    submilestone,
  };
}

async function canReadCanonicalWorkspaceTarget(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    milestone: Doc<"buildMilestones">;
    submilestone: Doc<"buildSubmilestones">;
  },
) {
  if (input.authorization.effectiveRole.role === "homeowner") {
    // Homeowner read access is an explicit active Build audience grant. A
    // membership or token role alone never widens this projection.
    return input.authorization.participants.some(
      (participant) =>
        participant.workosUserId === input.authorization.viewer.subject &&
        participant.role === "homeowner" &&
        participant.source === "grant",
    );
  }
  return canReadCanonicalMilestoneSubmilestone(ctx, {
    build: input.authorization.build,
    milestone: input.milestone,
    role: input.authorization.effectiveRole.role,
    submilestone: input.submilestone,
    workosUserId: input.authorization.viewer.subject,
  });
}

async function resolveOptionalCompanion(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    args: { companionActionItemId?: Id<"buildActionItems"> };
    milestone: Doc<"buildMilestones">;
    submilestone: Doc<"buildSubmilestones">;
  },
): Promise<{
  companion?: Doc<"buildActionItems">;
  post?: Doc<"buildCollaborationPosts">;
  state: CollaborationState;
}> {
  const tenant = await ctx.db
    .query("buildCollaborationTenantSettings")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", input.authorization.organizationId),
    )
    .unique();
  if (tenant?.status !== "active") {
    return {
      state: {
        code: "COLLABORATION_TENANT_INACTIVE",
        message:
          "Collaboration is unavailable; canonical facts remain readable.",
        state: "degraded",
      },
    };
  }
  const candidates = await ctx.db
    .query("buildActionItems")
    .withIndex("by_canonicalBuildSubmilestoneId_and_systemMode", (query) =>
      query
        .eq("canonicalBuildSubmilestoneId", input.submilestone._id)
        .eq("systemMode", "generated_milestone_submilestone"),
    )
    .take(MAX_COMPANION_CANDIDATES + 1);
  if (candidates.length > MAX_COMPANION_CANDIDATES) {
    return {
      state: {
        code: "COMPANION_AMBIGUOUS",
        message: "Collaboration companion binding is ambiguous.",
        state: "degraded",
      },
    };
  }
  const eligible = candidates.filter((candidate) =>
    input.submilestone.planningState === "superseded"
      ? candidate.canonicalPlanningState === "superseded" ||
        candidate.canonicalCompanionDisposition === "historical"
      : candidate.canonicalPlanningState !== "superseded" &&
        (candidate.canonicalCompanionDisposition === undefined ||
          candidate.canonicalCompanionDisposition === "active"),
  );
  if (eligible.length === 0) {
    return {
      state: {
        code: "COMPANION_MISSING",
        message:
          "Collaboration companion is missing; canonical facts remain readable.",
        state: "degraded",
      },
    };
  }
  if (eligible.length !== 1) {
    return {
      state: {
        code: "COMPANION_DUPLICATE",
        message: "Multiple collaboration companions are bound to this target.",
        state: "degraded",
      },
    };
  }
  const companion = eligible[0]!;
  if (
    input.args.companionActionItemId &&
    input.args.companionActionItemId !== companion._id
  ) {
    const requestedCompanion = await ctx.db.get(
      input.args.companionActionItemId,
    );
    const validatesHistoricalIdentity =
      requestedCompanion?.systemMode === "generated_milestone_submilestone" &&
      requestedCompanion.historicalCanonicalBuildSubmilestoneId ===
        input.submilestone._id &&
      requestedCompanion.canonicalCompanionSurvivorId === companion._id &&
      requestedCompanion.buildId === input.authorization.build._id &&
      requestedCompanion.organizationId ===
        input.authorization.organizationId &&
      requestedCompanion.brokerageId === input.authorization.brokerage._id &&
      requestedCompanion.canonicalBuildMilestoneId === input.milestone._id;
    if (!validatesHistoricalIdentity) {
      return {
        state: {
          code: "COMPANION_ID_MISMATCH",
          message:
            "The requested companion does not match the canonical target.",
          state: "degraded",
        },
      };
    }
  }
  const post = await ctx.db.get(companion.originatingPostId);
  if (
    !post ||
    companion.buildId !== input.authorization.build._id ||
    companion.organizationId !== input.authorization.organizationId ||
    companion.brokerageId !== input.authorization.brokerage._id ||
    companion.canonicalBuildMilestoneId !== input.milestone._id ||
    post.buildId !== input.authorization.build._id ||
    post.organizationId !== input.authorization.organizationId ||
    post.brokerageId !== input.authorization.brokerage._id ||
    post.canonicalBuildMilestoneId !== input.milestone._id ||
    post.systemPostKind !== "milestone" ||
    !(await canReadCollaborationPost(ctx, input.authorization, post))
  ) {
    return {
      state: {
        code: "COMPANION_BINDING_INVALID",
        message:
          "Collaboration companion binding is malformed; canonical facts remain readable.",
        state: "degraded",
      },
    };
  }
  return { companion, post, state: { state: "available" } };
}

export async function resolveBuildSubmilestoneWorkspaceContext(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  args: {
    buildId: Id<"activeBuilds">;
    buildSubmilestoneId: Id<"buildSubmilestones">;
    companionActionItemId?: Id<"buildActionItems">;
    organizationId: string;
    viewerCapacity?: BuildCollaborationRole;
  },
): Promise<
  | { state: "revoked" }
  | { code: string; message: string; state: "integrity_error" }
  | ({ state: "visible" } & StrictWorkspaceContext)
> {
  let authorization: ActiveBuildAuthorization;
  try {
    authorization = selectActiveBuildAuthorizationCapacity(
      await authorizeActiveBuildCollaborationAccess(ctx, args),
      args.viewerCapacity,
    );
  } catch (error) {
    if (isWorkspaceAccessDenial(error)) {
      return { state: "revoked" };
    }
    throw error;
  }
  const submilestone = await ctx.db.get(args.buildSubmilestoneId);
  if (!submilestone) {
    return { state: "revoked" };
  }
  const milestone = await ctx.db.get(submilestone.buildMilestoneId);
  if (
    !milestone ||
    submilestone.buildId !== authorization.build._id ||
    submilestone.organizationId !== authorization.organizationId ||
    submilestone.brokerageId !== authorization.brokerage._id ||
    milestone.buildId !== authorization.build._id ||
    milestone.organizationId !== authorization.organizationId ||
    milestone.brokerageId !== authorization.brokerage._id ||
    submilestone.milestoneKey !== milestone.key
  ) {
    return { state: "revoked" };
  }
  const canRead = await canReadCanonicalMilestoneSubmilestone(ctx, {
    build: authorization.build,
    milestone,
    role: authorization.effectiveRole.role,
    submilestone,
    workosUserId: authorization.viewer.subject,
  });
  if (!canRead) {
    return { state: "revoked" };
  }
  const candidates = await ctx.db
    .query("buildActionItems")
    .withIndex("by_canonicalBuildSubmilestoneId_and_systemMode", (query) =>
      query
        .eq("canonicalBuildSubmilestoneId", submilestone._id)
        .eq("systemMode", "generated_milestone_submilestone"),
    )
    .take(MAX_COMPANION_CANDIDATES + 1);
  if (candidates.length > MAX_COMPANION_CANDIDATES) {
    return {
      code: "COMPANION_AMBIGUOUS",
      message:
        "Too many collaboration companions are bound to this Sub-milestone.",
      state: "integrity_error",
    };
  }
  const eligible = candidates.filter((candidate) =>
    submilestone.planningState === "superseded"
      ? candidate.canonicalPlanningState === "superseded" ||
        candidate.canonicalCompanionDisposition === "historical"
      : candidate.canonicalPlanningState !== "superseded" &&
        (candidate.canonicalCompanionDisposition === undefined ||
          candidate.canonicalCompanionDisposition === "active"),
  );
  if (eligible.length !== 1) {
    return {
      code: eligible.length === 0 ? "COMPANION_MISSING" : "COMPANION_DUPLICATE",
      message:
        eligible.length === 0
          ? "The collaboration companion is unavailable for this Sub-milestone."
          : "More than one collaboration companion is bound to this Sub-milestone.",
      state: "integrity_error",
    };
  }
  const companion = eligible[0]!;
  if (
    args.companionActionItemId &&
    args.companionActionItemId !== companion._id
  ) {
    const requestedCompanion = await ctx.db.get(args.companionActionItemId);
    const validatesHistoricalIdentity =
      requestedCompanion?.systemMode === "generated_milestone_submilestone" &&
      requestedCompanion.historicalCanonicalBuildSubmilestoneId ===
        submilestone._id &&
      requestedCompanion.canonicalCompanionSurvivorId === companion._id &&
      requestedCompanion.buildId === authorization.build._id &&
      requestedCompanion.organizationId === authorization.organizationId &&
      requestedCompanion.brokerageId === authorization.brokerage._id &&
      requestedCompanion.canonicalBuildMilestoneId === milestone._id;
    if (!validatesHistoricalIdentity) {
      return {
        code: "COMPANION_ID_MISMATCH",
        message:
          "The requested companion does not match the canonical Sub-milestone.",
        state: "integrity_error",
      };
    }
  }
  const post = await ctx.db.get(companion.originatingPostId);
  if (
    !post ||
    companion.buildId !== authorization.build._id ||
    companion.organizationId !== authorization.organizationId ||
    companion.brokerageId !== authorization.brokerage._id ||
    companion.canonicalBuildMilestoneId !== milestone._id ||
    post.buildId !== authorization.build._id ||
    post.organizationId !== authorization.organizationId ||
    post.brokerageId !== authorization.brokerage._id ||
    post.canonicalBuildMilestoneId !== milestone._id ||
    post.systemPostKind !== "milestone" ||
    !(await canReadCollaborationPost(ctx, authorization, post))
  ) {
    return {
      code: "COMPANION_BINDING_INVALID",
      message:
        "The collaboration companion binding is malformed or unavailable.",
      state: "integrity_error",
    };
  }
  return {
    authorization,
    companion,
    collaboration: { state: "available" },
    milestone,
    post,
    state: "visible",
    submilestone,
  };
}
